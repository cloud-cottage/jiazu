/**
 * 行政区划热度排序单测 —— `lib/geo-hot.js` 三源计票 / 前缀级联 / 24h 缓存 / 降级 + `GET /geo/hot` 接线
 *
 * 口径 = 裁定 R1–R8 / 冻结口径 D1–D3（`docs/geo-origin.spec.md` 热度排序章节）；
 * 逐条对应关系见各用例标题（H1…H9 / Z1）。
 *
 * 覆盖：
 *   H1 三源各计 1 票（出生地 / 居住地 / 发源地）+ 前缀（级联）累加 + `direct` 口径不同
 *   H2 空码 / 缺字段 / 非 6 位 / 未登记码 / 历史字符串形态 ⇒ 不计票、不抛、不登记异常（无 `failed`）
 *   H3 24h TTL 进程内缓存（TTL 内不重扫，含边界 TTL-1ms）+ 并发**单飞**（两个并发请求只扫一次）
 *   H4 单树读失败 ⇒ 跳过该树 + 记入 `failed` + 其余树照算 + 不整体失败；树返回 null ⇒ 静默跳过
 *   H5 整体计算失败 ⇒ 返回上一次成功值；无上次值 ⇒ `generated_at: null` + 两空映射（恒不抛、无负缓存）
 *   H6 路由 `GET /geo/hot`：200 + 顶层四键；**无需鉴权 / 无需 X-Tree-Id**；值与 lib 层同源
 *   H7 树清单拉取失败 ⇒ 整体降级空表（`generated_at: null`）＋ **不被空值锁死**（依赖恢复后立即重扫并拿到票）
 *   H8 清单失败不刷新成功时刻 ⇒ 返回上一次成功值（`generated_at` 不变、无负缓存）
 *   H9 `failed` 值形态 = **树 id 字符串数组**（仅收 `getTree` 抛错的树；返回 null 的不进）
 *   Z1 真源零写入（收尾）：`config/tree-meta.json` 与 `migrate-output/collections/jiazu_assets.json` md5 逐字节未变
 *
 * 数据安全：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本；
 * 本文件对真源**只读**，收尾以 Z1 逐字节断言（沿用 `lib/*.test.js` 惯例）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-hot.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_ASSETS = path.join(REPO, 'migrate-output', 'collections', 'jiazu_assets.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-geo-hot-'));
const META_FILE = path.join(TMP, 'tree-meta.json');

// ---- 沙箱：读写一律落 /tmp 副本（必须在导入 store / index 之前设好）----
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = META_FILE;

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const REAL_META_MD5 = md5(REAL_META);
const REAL_ASSETS_MD5 = fs.existsSync(REAL_ASSETS) ? md5(REAL_ASSETS) : null;

// ---- 夹具：两棵树（ta / tb）+ tree-meta 三棵登记项 ----
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
const writeTree = (id, tree) =>
  fs.writeFileSync(path.join(TMP, 'trees', `${id}.json`), JSON.stringify({ tree_id: id, version: 1, ...tree }, null, 2));

writeTree('ta', {
  people: {
    // 三源各计之一：出生地有码（371325 ⇒ 371325 / 371300 / 370000 各 1 票）
    h1: { handle: 'h1', birth_place: { origin_code: '371325' }, residence_places: [{ origin_code: '371300' }, { origin_code: '110101' }] },
    // 未登记码（6 位但不在码表）⇒ 不计票
    h2: { handle: 'h2', birth_place: { origin_code: '000000' } },
    // 历史字符串形态 ⇒ 没有码 ⇒ 不计票、不报错
    h3: { handle: 'h3', birth_place: '山东临沂' },
    // 非 6 位 ⇒ 不计票
    h4: { handle: 'h4', birth_place: { origin_code: '37132' } },
    // 居住地非数组（缺字段形态）⇒ 不计票
    h5: { handle: 'h5', residence_places: { origin_code: '370000' } },
    // 两字段全缺 ⇒ 不计票、不抛
    h6: { handle: 'h6' },
    // 空串 + 未登记码的居住地项 ⇒ 全部丢弃；出生地 710104 ⇒ 710104 / 710100 / 710000 各 1 票
    h7: { handle: 'h7', birth_place: { origin_code: '710104' }, residence_places: [{ origin_code: '' }, { origin_code: '999998' }] },
  },
});

writeTree('tb', {
  people: {
    k1: { handle: 'k1', birth_place: { origin_code: '371325' } },
    k2: { handle: 'k2', residence_places: [{ origin_code: '371325' }, { origin_code: '370000' }] },
  },
});

fs.writeFileSync(
  META_FILE,
  JSON.stringify(
    {
      _schema: '1.1',
      trees: {
        zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, origin: '中华', origin_code: '371325' },
        ta: { tree_id: 'ta', kind: 'family', origin: '旧自由文本', origin_code: '' },
        tb: { tree_id: 'tb', kind: 'family', origin_code: '371300' },
      },
    },
    null,
    2,
  ) + '\n',
);

// 期望值（手算见下）：票 = 出生地 h1/h7/k1 + 居住地 h1×2/k2×2 + 发源地 zhonghua/tb
const EXPECTED_COUNTS = { 370000: 7, 371300: 6, 371325: 4, 110000: 1, 110100: 1, 110101: 1, 710000: 1, 710100: 1, 710104: 1 };
const EXPECTED_DIRECT = { 371325: 4, 371300: 2, 370000: 1, 110101: 1, 710104: 1 };

const { createGeoHotReader, getGeoHot, HOT_TTL_MS, HOT_VERSION } = await import('./geo-hot.js');
const { handleRequest } = await import('../index.js');

// ================= H1 三源计票 + 前缀级联 + direct =================

test('H1 三源各计 1 票 + 前缀（级联）累加 + direct 口径不同', async () => {
  const r = await getGeoHot();
  assert.equal(r.v, HOT_VERSION, '返回体版本 = 1');
  assert.deepEqual(r.counts, EXPECTED_COUNTS, 'counts = 前缀票（含祖先码）；只含票数 > 0 的码');
  assert.deepEqual(r.direct, EXPECTED_DIRECT, 'direct = 恰在该级的票（同时下发作备用读数）');
  // 级联与直票的差别（H1 核心）：370000 收到 3 个源的 7 票，但只有 1 票**恰**落在省级
  assert.equal(r.counts['370000'], 7, '370000 = h1 出生地 1 + h1 居住地 371300 级联 1 + k1 出生地 1 + k2 居住地 371325/370000 2 + 发源地 2 = 7');
  assert.equal(r.direct['370000'], 1, '370000 直票仅 k2 居住地那一张（371325 / 371300 的票不下沉）');
  assert.equal(r.counts['110100'], 1, '110101 的票对市码 110100 级联 +1');
  assert.equal(r.direct['110100'], undefined, 'direct 只含恰在该级的票 ⇒ 无 110100');
  assert.equal(r.counts['710000'], 1, '710104 的票对省码 710000 级联 +1');
  assert.equal(r.direct['710000'], undefined);
  assert.equal(r.failed, undefined, '无失败树 ⇒ 返回体不含 failed 键');
  assert.match(r.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

// ================= H2 非法 / 缺失码不计票 =================

test('H2 空码 / 缺字段 / 非 6 位 / 未登记码 / 历史字符串 ⇒ 不计票、不抛、不登记异常', async () => {
  const r = await getGeoHot();
  for (const bad of ['000000', '999998', '37132', '山东临沂', '']) {
    assert.equal(r.counts[bad], undefined, `「${bad}」不得计票`);
    assert.equal(r.direct[bad], undefined, `「${bad}」不得进 direct`);
  }
  assert.equal(r.failed, undefined, '脏码不得被登记成异常（failed 只收读失败的树 id）');
  assert.equal(Object.values(r.counts).every((n) => n > 0), true, '两个映射只含票数 > 0 的码');
  // 脏码所在树照常贡献合法票（ta 的 h1/h7 票在案）
  assert.equal(r.counts['371325'] >= 4, true);
});

// ================= H3 TTL 缓存 + 单飞 =================

test('H3 24h TTL 进程内缓存（TTL 内不重扫）+ 并发单飞（注入时钟与计数 spy）', async () => {
  const calls = { ids: 0, tree: 0, meta: 0 };
  const clock = { t: 1_700_000_000_000 };
  const reader = createGeoHotReader({
    listTreeIds: async () => {
      calls.ids += 1;
      return ['t_only'];
    },
    getTree: async () => {
      calls.tree += 1;
      return { tree_id: 't_only', people: { p: { handle: 'p', birth_place: { origin_code: '110101' } } } };
    },
    getMeta: async () => {
      calls.meta += 1;
      return { trees: {} };
    },
    now: () => clock.t,
  });

  const first = await reader.getGeoHot();
  assert.deepEqual(first.counts, { 110000: 1, 110100: 1, 110101: 1 }, '直辖市前缀展开：110101 ⇒ 110000/110100/110101');
  assert.deepEqual(first.direct, { 110101: 1 });
  assert.equal(first.generated_at, new Date(clock.t).toISOString());
  assert.equal(calls.ids, 1);
  assert.equal(calls.tree, 1);
  assert.equal(calls.meta, 1);

  // TTL 内（含边界 TTL-1ms）⇒ 命中缓存、不重扫、返回同一份对象
  clock.t += HOT_TTL_MS - 1;
  assert.equal(await reader.getGeoHot(), first, 'TTL 内必须命中缓存（同一对象引用）');
  assert.equal(calls.ids, 1, 'TTL 内不得重新扫描');
  assert.equal(calls.tree, 1);
  assert.equal(calls.meta, 1);

  // 恰好到 TTL ⇒ 过期；两个**并发**请求只扫一次（单飞，防击穿）
  clock.t += 1;
  const [a, b] = await Promise.all([reader.getGeoHot(), reader.getGeoHot()]);
  assert.equal(calls.ids, 2, '并发两请共享同一份 refresh promise ⇒ 只扫一次');
  assert.equal(calls.tree, 2);
  assert.equal(calls.meta, 2);
  assert.equal(a, b, '单飞：两个并发请求拿到同一份结果对象');
  assert.notEqual(a, first);
  assert.equal(a.generated_at, new Date(clock.t).toISOString());
});

// ================= H4 单树读失败 =================

test('H4 单树读失败 ⇒ 跳过该树 + 记入 failed + 其余树照算；树返回 null ⇒ 静默跳过', async () => {
  const reader = createGeoHotReader({
    listTreeIds: async () => ['ok1', 'boom', 'ok2', 'missing'],
    getTree: async (id) => {
      if (id === 'boom') throw new Error('读盘失败');
      if (id === 'missing') return null;
      return {
        tree_id: id,
        people: { p: { handle: 'p', birth_place: { origin_code: '370000' }, residence_places: [{ origin_code: '371325' }] } },
      };
    },
    getMeta: async () => ({ trees: { ok1: { tree_id: 'ok1', origin_code: '' } } }),
  });
  const r = await reader.getGeoHot();
  assert.deepEqual(r.failed, ['boom'], '读失败的树 id 进 failed；缺失树（null）不进');
  assert.deepEqual(r.counts, { 370000: 4, 371300: 2, 371325: 2 }, '两棵好树各 2 票前缀展开，坏树/缺失树不参与');
  assert.equal(r.direct['370000'], 2, '两棵好树各 1 张省级直票');
});

// ================= H5 整体失败降级 =================

test('H5 整体计算失败 ⇒ 上一次成功值；无上次值 ⇒ 空表 + generated_at null（恒不抛、无负缓存）', async () => {
  const brokenTree = {
    get people() {
      throw new Error('结构损坏（整体失败注入）');
    },
  };

  // 无上次值 ⇒ 冻结空表（仍 200 语义，绝不抛）
  const cold = createGeoHotReader({
    listTreeIds: async () => ['t'],
    getTree: async () => brokenTree,
    getMeta: async () => ({ trees: {} }),
  });
  assert.deepEqual(await cold.getGeoHot(), { v: HOT_VERSION, generated_at: null, counts: {}, direct: {} });

  // 有上次成功值 ⇒ 返回上一次的值（且下一次请求仍重试，不做负缓存）
  let attempts = 0;
  let ok = true;
  const clock = { t: 1_700_000_000_000 };
  const reader = createGeoHotReader({
    listTreeIds: async () => ['t'],
    getTree: async () => {
      attempts += 1;
      return ok ? { tree_id: 't', people: { p: { handle: 'p', birth_place: { origin_code: '110101' } } } } : brokenTree;
    },
    getMeta: async () => ({ trees: {} }),
    now: () => clock.t,
  });
  const first = await reader.getGeoHot();
  assert.deepEqual(first.counts, { 110000: 1, 110100: 1, 110101: 1 });

  ok = false;
  clock.t += HOT_TTL_MS;
  assert.equal(await reader.getGeoHot(), first, '整体失败 ⇒ 上一次成功值（同一份对象）');
  clock.t += 1;
  assert.equal(await reader.getGeoHot(), first, '仍返回上一次成功值');
  assert.equal(attempts, 3, '失败不刷新缓存时刻 ⇒ 每次过期请求都重试（无负缓存）');
});

// ================= H7 树清单失败 ⇒ 整体降级 + 不被空值锁死（R16）=================

test('H7 树清单拉取抛错 ⇒ 空表降级（generated_at null）且不缓存；依赖恢复后立即重扫并拿到票', async () => {
  const clock = { t: 1_700_000_000_000 };
  const calls = { ids: 0 };
  let listOk = false; // 注入开关：清单 IO 瞬时故障 → 恢复
  const reader = createGeoHotReader({
    listTreeIds: async () => {
      calls.ids += 1;
      if (!listOk) throw new Error('清单拉取失败（注入的瞬时故障）');
      return ['t'];
    },
    getTree: async () => ({ tree_id: 't', people: { p: { handle: 'p', birth_place: { origin_code: '110101' } } } }),
    getMeta: async () => ({ trees: {} }),
    now: () => clock.t,
  });

  // 清单抛错 ⇒ 走**整体失败**降级分支（不是「成功但全站零票」）：空表 + generated_at null
  const degraded = await reader.getGeoHot();
  assert.deepEqual(degraded, { v: HOT_VERSION, generated_at: null, counts: {}, direct: {} }, '清单失败 ⇒ 空表降级值（绝不冒充成功值）');
  assert.equal(calls.ids, 1);

  // 证「没被空值锁死」：同一读取器、依赖恢复 ⇒ TTL 内也必须**真的重扫**并拿到票
  listOk = true;
  const r = await reader.getGeoHot();
  assert.equal(calls.ids, 2, '降级值不得进缓存/不得设负缓存 ⇒ 下一次请求立即重扫');
  assert.deepEqual(r.counts, { 110000: 1, 110100: 1, 110101: 1 }, '重扫真拿到票（空榜没有被锁死一整天）');
  assert.equal(r.generated_at, new Date(clock.t).toISOString(), '只有成功值才写成功时刻');
  assert.notEqual(r, degraded);

  // 成功值此时才进缓存：TTL 内不再重扫
  clock.t += HOT_TTL_MS - 1;
  assert.equal(await reader.getGeoHot(), r, '成功值 TTL 内命中缓存');
  assert.equal(calls.ids, 2);
});

// ================= H8 清单失败不刷新成功时刻（R16）=================

test('H8 已有成功值后清单抛错 ⇒ 返回上一次成功值且 generated_at 不变（失败不刷新成功时刻）', async () => {
  const clock = { t: 1_700_000_000_000 };
  let listBroken = false;
  const reader = createGeoHotReader({
    listTreeIds: async () => {
      if (listBroken) throw new Error('清单拉取失败（注入）');
      return ['t'];
    },
    getTree: async () => ({ tree_id: 't', people: { p: { handle: 'p', birth_place: { origin_code: '371325' } } } }),
    getMeta: async () => ({ trees: {} }),
    now: () => clock.t,
  });

  const first = await reader.getGeoHot();
  assert.deepEqual(first.counts, { 370000: 1, 371300: 1, 371325: 1 });
  const stamp = first.generated_at;

  listBroken = true;
  clock.t += HOT_TTL_MS; // 过期 ⇒ 必须重扫，重扫失败
  assert.equal(await reader.getGeoHot(), first, '清单失败 ⇒ 上一次成功值（同一份对象）');
  assert.equal((await reader.getGeoHot()).generated_at, stamp, '失败不得刷新成功时刻（不设负缓存）');

  clock.t += 1;
  assert.equal(await reader.getGeoHot(), first, '每次过期请求都重试，仍返回上一次成功值');

  listBroken = false; // 恢复 ⇒ 过期后重扫出新值（未被旧值/空值锁死）
  clock.t += HOT_TTL_MS;
  const again = await reader.getGeoHot();
  assert.notEqual(again, first);
  assert.deepEqual(again.counts, first.counts);
  assert.equal(again.generated_at, new Date(clock.t).toISOString());
});

// ================= H9 failed 值形态（R17）=================

test('H9 failed 值形态 = 树 id 字符串数组（含且仅含 getTree 抛错的树；返回 null 的不进）', async () => {
  const reader = createGeoHotReader({
    listTreeIds: async () => ['ok', 'boom1', 'gone', 'boom2'],
    getTree: async (id) => {
      if (id === 'boom1' || id === 'boom2') throw new Error('读盘失败');
      if (id === 'gone') return null; // 不存在 / 已删 ⇒ 静默跳过，不进 failed
      return { tree_id: 'ok', people: { p: { handle: 'p', birth_place: { origin_code: '110101' } } } };
    },
    getMeta: async () => ({ trees: {} }),
  });
  const r = await reader.getGeoHot();
  assert.equal(Array.isArray(r.failed), true, 'failed 必须是数组');
  assert.deepEqual(r.failed, ['boom1', 'boom2'], '恰含两棵读取抛错的树，顺序 = 清单顺序');
  assert.equal(r.failed.every((x) => typeof x === 'string'), true, '元素形态 = 树 id 字符串（不是对象/错误）');
  assert.equal(r.failed.includes('gone'), false, '返回 null（不存在 / 已删）不得进 failed');
  assert.equal(r.failed.includes('ok'), false);
  assert.deepEqual(r.counts, { 110000: 1, 110100: 1, 110101: 1 }, '单树失败不整体失败，好树照算');
});

// ================= H6 路由 =================

test('H6 GET /geo/hot：200 + 顶层四键；无需鉴权 / 无需 X-Tree-Id；与 lib 层同源', async () => {
  const res = await handleRequest({ path: '/geo/hot', httpMethod: 'GET', headers: {}, body: '' });
  assert.equal(res.statusCode, 200, '无鉴权头也恒 200（裁定 R7：降级不报错）');
  const body = JSON.parse(res.body);
  assert.deepEqual(Object.keys(body).sort(), ['counts', 'direct', 'generated_at', 'v'], '顶层四键');
  assert.equal(body.v, HOT_VERSION);
  assert.match(body.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'generated_at = ISO 串（非 null）');
  assert.deepEqual(body.counts, EXPECTED_COUNTS);
  assert.deepEqual(body.direct, EXPECTED_DIRECT);
  // 模块级缓存单例：路由与 lib 层取值必须一致（本进程内同一份）
  assert.deepEqual(await getGeoHot(), body);
});

// ================= Z1 真源零写入 =================

test('Z1 真源零写入：config/tree-meta.json 与 migrate-output/collections/jiazu_assets.json md5 逐字节未变', () => {
  assert.equal(md5(REAL_META), REAL_META_MD5, 'config/tree-meta.json 被改动了（本批禁止任何真源写入）');
  assert.ok(REAL_ASSETS_MD5, '真源基线必须存在：migrate-output/collections/jiazu_assets.json');
  assert.equal(md5(REAL_ASSETS), REAL_ASSETS_MD5, 'migrate-output/collections/jiazu_assets.json 被改动了');
  assert.notEqual(path.resolve(TMP), path.resolve(REPO), '夹具跑在 /tmp 副本上');
  assert.equal(path.resolve(TMP).startsWith(path.resolve(os.tmpdir())), true);
});
