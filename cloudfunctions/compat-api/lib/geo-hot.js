/**
 * 行政区划热度排序 —— 真源派生聚合 + 24h 进程内缓存（纯读 · 零写入）
 *
 * 口径 = 裁定 R1–R8 / 冻结口径 D1–D3（规格章节落点 = `docs/geo-origin.spec.md` 热度排序）：
 *   · **票源三源各计**（R2）：① 每人 `birth_place.origin_code` 非空 = 1 票；
 *     ② `residence_places[]` 每项 `origin_code` 非空 = 各 1 票；③ `tree-meta.trees[*].origin_code` 非空 = 1 票
 *     （**接受与始祖出生地同源重复**）。
 *   · **计票口径 = 前缀（级联）**（R5 / D2）：一张票的码对其**自身及全部祖先码**各 +1
 *     （例：371325 ⇒ 370000 +1 / 371300 +1 / 371325 +1）；同时下发 `direct`（只算恰在该级的票）作备用读数。
 *   · 计入条件 = `lib/geo.js` 的 `isKnownOriginCode`：空码 / 非 6 位 / 未登记码**一律不计票、不报错、不登记异常**（D1）。
 *   · **取树清单失败 ⇒ 一律向上抛，走整体失败路径**（R16）：`listTreeIds()` 抛错**不得**被吞成「本次无票」
 *     —— 否则一次瞬时 IO 故障会被当成「成功但全站零票」，并作为成功值**缓存 24 小时**（空榜锁死一整天）。
 *     抛出后由 `getGeoHot` 的失败分支处置：返回上一次成功值（无则空表降级常量）、**不刷新成功时刻、不进缓存**，
 *     下一次请求立即重试（R11：降级值不进缓存、不设负缓存）。
 *   · 遍历全部树（D1）：`listTreeIds()` → 逐棵 `getTree(id)`；返回 null（不存在 / 已删）⇒ **跳过（不进 `failed`）**；
 *     读抛错 ⇒ 跳过该树并把 id 记进返回体 `failed`，**不得整体失败**（单树失败只降该树）。
 *   · `failed` 的值形态（R17）= **树 id 字符串数组**：只收「树清单里有、但 `getTree` 抛错」的树；
 *     树不存在 / 已删（`getTree` 返回 null）**不进 `failed`**；无失败树时返回体**不含** `failed` 键。
 *   · 其余降级口径不变：`getMeta()` 抛错 ⇒ 只让发源地那一源计 0 票（**不得整体失败**）；脏码不报错、不登记异常（D1）。
 *   · **24h 进程内缓存**（R3）：TTL 内**不得重新扫描**；并发请求**单飞**（同一份 refresh promise，防击穿）；
 *     整体计算失败 ⇒ 返回**上一次**成功值（若有），无上次值 ⇒ `generated_at: null` + 两个空映射，
 *     **仍 200、绝不抛给调用方**（D3）。
 *   · **零写入**：本模块只调 `listTreeIds` / `getTree` / `getMeta` 三个只读函数，
 *     无任何写路径（不 `saveMeta` / `saveTree` / `colSet` / `updateTree`）。
 *
 * 返回体（D3，顶层四键 + 失败树时附加 `failed`）：
 *   `{ v: 1, generated_at: '<ISO>'|null, counts: {码: 前缀票}, direct: {码: 直票}, failed?: ['树id'（字符串）] }`
 *   —— `counts` / `direct` **只含票数 > 0 的码**。
 *
 * 可测性：`createGeoHotReader({ listTreeIds, getTree, getMeta, now })` 允许注入依赖与时钟
 *   （TTL / 单飞 / 读失败用例无需等 24 小时、无需触碰真源）；路由用模块级默认实例 `getGeoHot`
 *   （依赖 = 真 store 的三个只读函数，无调试开关、无环境变量分支）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-hot.test.js
 */
import { isKnownOriginCode } from './geo.js';
import { listTreeIds, getTree, getMeta } from './store.js';

/** 缓存 TTL（R3：24 小时；时效性要求极低 ⇒ 延迟计算省服务器资源） */
export const HOT_TTL_MS = 24 * 60 * 60 * 1000;

/** 返回体版本号（D3 顶层 `v`） */
export const HOT_VERSION = 1;

/** 无任何成功值时的降级返回体（**冻结常量**：调用方不得就地修改） */
const EMPTY = Object.freeze({ v: HOT_VERSION, generated_at: null, counts: Object.freeze({}), direct: Object.freeze({}) });

/**
 * 一张票的码 → 前缀候选（**自身 + 省 + 市**），按序去重后只保留已登记码（D2）。
 * 例：`371325` ⇒ `['371325','370000','371300']`；`370000` / `110000` ⇒ 仅自身（去重后 1 项）。
 */
function prefixCodes(code) {
  const out = [];
  for (const c of [code, `${code.slice(0, 2)}0000`, `${code.slice(0, 4)}00`]) {
    if (out.includes(c) || !isKnownOriginCode(c)) continue;
    out.push(c);
  }
  return out;
}

/** 计一张票：`counts` 收前缀码、`direct` 只收票自身；空码 / 非 6 位 / 未登记码 ⇒ 整体丢弃（不抛） */
function countTicket(counts, direct, raw) {
  if (!isKnownOriginCode(raw)) return;
  const code = String(raw).trim();
  direct.set(code, (direct.get(code) || 0) + 1);
  for (const c of prefixCodes(code)) counts.set(c, (counts.get(c) || 0) + 1);
}

/**
 * Map → 普通对象，**只含票数 > 0 的码**；键序 = 票数降序、同票按码升序
 * （仅内部表示顺序，口径未规定取值顺序；前端按键取值）。
 */
function toCountsObject(map) {
  const rows = [...map.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const out = {};
  for (const [code, n] of rows) out[code] = n;
  return out;
}

/**
 * 热度读取器工厂（默认实例见文件末）。依赖全部为**只读**函数；`now` 可注入以测 TTL。
 * 返回 `{ getGeoHot() }` —— 恒 resolve，绝不 reject。
 */
export function createGeoHotReader({ listTreeIds: listIds, getTree: readTree, getMeta: readMeta, now = Date.now } = {}) {
  let cached = null; // 最近一次成功值
  let cachedAt = 0; // 最近一次成功值的生成时刻（失败**不刷新** ⇒ 下次请求重试，不做负缓存）
  let inflight = null; // 单飞：扫描期间的 refresh promise

  /** 扫真源现算（只读；单棵树读失败只跳过该树，不整体失败） */
  async function scan() {
    const counts = new Map();
    const direct = new Map();
    const failed = [];
    const ids = await listIds(); // R16：树清单拉取失败**一律向上抛**（⇒ getGeoHot 走整体失败分支：上一次成功值 / 空表降级，不刷新成功时刻、不进缓存、下次请求立即重试）
    for (const id of ids) {
      let tree;
      try {
        tree = await readTree(id);
      } catch {
        failed.push(id); // 读失败 ⇒ 跳过该树，id 记进 failed（D1）
        continue;
      }
      if (!tree) continue; // 不存在 / 已删 ⇒ 跳过（不计入 failed）
      const people = tree.people || {};
      for (const handle of Object.keys(people)) {
        const person = people[handle];
        if (!person) continue;
        // 出生地：兼容历史字符串形态 —— 字符串一律不算票（它没有码）
        countTicket(counts, direct, person.birth_place?.origin_code);
        const residences = person.residence_places;
        if (!Array.isArray(residences)) continue; // 缺字段 / 非数组 ⇒ 该项不计票
        for (const item of residences) countTicket(counts, direct, item?.origin_code);
      }
    }
    // 发源地（R2 第三源）：tree-meta 逐棵 1 票；meta 不可用 ⇒ 仅此源计 0 票，其余源照常
    try {
      const meta = await readMeta();
      for (const entry of Object.values(meta?.trees || {})) if (entry) countTicket(counts, direct, entry.origin_code);
    } catch {
      /* meta 不可用 ⇒ 发源地域票源计 0，不整体失败 */
    }
    return { counts: toCountsObject(counts), direct: toCountsObject(direct), failed };
  }

  return {
    /** `GET /geo/hot` 取值入口：TTL 内直接返回缓存，过期才重扫（并发单飞） */
    async getGeoHot() {
      if (cached && now() - cachedAt < HOT_TTL_MS) return cached;
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const r = await scan();
          cached = {
            v: HOT_VERSION,
            generated_at: new Date(now()).toISOString(),
            counts: r.counts,
            direct: r.direct,
            ...(r.failed.length ? { failed: r.failed } : {}),
          };
          cachedAt = now();
          return cached;
        } catch {
          return cached || EMPTY; // 整体失败 ⇒ 上一次成功值；无 ⇒ 空表（仍不抛、绝不 5xx，D3）
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
  };
}

/** 模块级默认实例（路由用；依赖 = 真 store 的三个只读函数） */
const defaultReader = createGeoHotReader({ listTreeIds, getTree, getMeta });

/** `GET /geo/hot` 的返回体（24h 进程内缓存；失败降级，不抛） */
export function getGeoHot() {
  return defaultReader.getGeoHot();
}
