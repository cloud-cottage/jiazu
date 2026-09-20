/**
 * 发源地三级行政区划 —— 名称表反查（纯读，零 npm 依赖，零运行期 IO）
 *
 * 数据真源 = `<repo>/config/geo-divisions.json`（**唯一真源**，人工维护 + `scripts/build-geo-divisions.mjs` 可复现构建）；
 * 产物 = 本模块旁边的 `./geo/divisions.json`（真源全量紧凑序列化；`scripts/gen-geo-divisions.mjs` 生成）。
 * ⚠️ 前端那份产物**形状不同**（紧凑数组 + base64(deflateRaw)、不含 `_meta`，为压住小程序主包上限），
 * 且已从 `frontend/src/static/geo/` 搬到 `frontend/src/business/geo/`（`src/static/**` 会被 uni-app 原样
 * 拷进小程序产物 = 死重）。故**两份产物不再字节相同**，但同源于同一真源、由 `--check` 分别守卫。
 *
 * 契约（docs 契约 v1 · 发源地结构化）：
 *   · `origin_code` = 结构化真源（6 位码）；`origin` = 写时由本模块反查生成的展示串（软冗余，禁止前端手改）。
 *   · 展示串 = 各级 name 顺序拼接，**过滤伪级名**（`SHOW_FILTER_NAMES`）。
 *     例：110000/110100/110101 → 「北京市东城区」；370000/371300/371325 → 「山东省临沂市费县」；
 *         710000/710100/710104 → 「台湾省台北市中正区」；999999 → 「海外」。
 *   · 缺级合法：只到省 → 「山东省」；只到市 → 「山东省临沂市」。
 *   · 「直筒子市」止于第二级：东莞市（441900）/ 中山市（442000）/ 儋州市（460400）/ 嘉峪关市（620200）
 *     法定无县级行政区 ⇒ `counties` 为空数组（上游街道 / 镇级 9 位码已按 `^\d{6}$` 整批剔除，
 *     见真源 `_meta.note` ⑤），`resolveOrigin('441900')` = 「广东省东莞市」即合法终点。
 *
 * 云函数打包（**本批修正的部署阻塞点**）：数据随包走 **静态 JSON import** ——
 *   `import divisions from './geo/divisions.json' assert { type: 'json' }`
 * esbuild 会把 JSON **内联**进 `cloudfunctions/deploy/compat-api/index.js`（判据：产物内 `grep -c '999999'` ≥ 1），
 * 因此云端实例工作目录**不需要** `config/`；此前按仓库路径 `fs.readFileSync` 的写法不会被打包，
 * 首次调用即抛 `[geo] 无法读取行政区划真源 …`（本模块已无 fs / 无环境变量读盘分支）。
 * 语法取舍：`assert` 而非 `with` —— 本机 Node v18.19.0 只支持前者（`with` 在 18.19 下 link 期 SyntaxError），
 * 两者在 esbuild 0.28.2 下均被内联（实测），故取兼容面更宽的一种。
 *
 * 展示串拼接见 `resolveOrigin`；本模块**不校验也不读写** tree-meta 的任何字段（口径在调用方）。
 */
import divisions from './geo/divisions.json' assert { type: 'json' };

/** 伪级名：只用于代码编制占位，展示串拼接时一律过滤 */
export const SHOW_FILTER_NAMES = ['市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划'];

/** 「海外」= 一级唯一项、无下级，项目自建哨兵码 */
export const OVERSEAS_CODE = '999999';
export const OVERSEAS_NAME = '海外';

const FILTER = new Set(SHOW_FILTER_NAMES);
const CODE_RE = /^\d{6}$/;

/** 建索引（模块加载期一次；数据是静态包内产物，无需失效机制） */
const provinces = Array.isArray(divisions?.provinces) ? divisions.provinces : [];
if (!provinces.length) throw new Error('[geo] 行政区划数据为空：lib/geo/divisions.json 请跑 scripts/gen-geo-divisions.mjs 重新生成');

const prov = new Map();
const city = new Map();
const county = new Map();
const owner = new Map(); // 码 → { p, c, a } 便于还原层级
for (const p of provinces) {
  prov.set(p.code, p);
  prov.set(p.code.slice(0, 2), p); // 兼容数据集原生 2 位省级码
  for (const c of p.cities || []) {
    city.set(c.code, c);
    owner.set(c.code, { p, c });
    for (const a of c.counties || []) {
      county.set(a.code, a);
      owner.set(a.code, { p, c, a });
    }
  }
  owner.set(p.code, { p });
}
const META = divisions?._meta || {};

/** 真源 `_meta`（只读副本） */
export function geoMeta() {
  return META;
}

/** 一级项列表（数据集顺序：31 个大陆省级 → 台湾省 → 香港 → 澳门 → 海外） */
export function allProvinces() {
  return provinces;
}

/** 按码定位省级（接受 6 位码，也兼容数据集原生 2 位码）；找不到 → null */
export function findProvince(code) {
  const c = norm(code);
  return c ? prov.get(c) || null : null;
}

/** 按码定位地级；找不到 → null */
export function findCity(code) {
  const c = norm(code);
  return c ? city.get(c) || null : null;
}

/** 按码定位县级；找不到 → null */
export function findCounty(code) {
  const c = norm(code);
  return c ? county.get(c) || null : null;
}

/**
 * 码 → `{ level1, level2, level3, display }`
 * - 各级 = `{ code, name }`，缺级 / 未知码 / 空码一律 null；
 * - `display` = 各级 name 过滤伪级名后顺序拼接（缺级合法；未知码 → `''`）。
 */
export function resolveOrigin(code) {
  const c = norm(code);
  const empty = { level1: null, level2: null, level3: null, display: '' };
  if (!c) return empty;
  const hit = owner.get(c);
  if (!hit) return empty;
  const level1 = hit.p ? { code: hit.p.code, name: hit.p.name } : null;
  const level2 = hit.c ? { code: hit.c.code, name: hit.c.name } : null;
  const level3 = hit.a ? { code: hit.a.code, name: hit.a.name } : null;
  const display = [level1, level2, level3]
    .filter(Boolean)
    .filter((l) => !FILTER.has(l.name))
    .map((l) => l.name)
    .join('');
  return { level1, level2, level3, display };
}

/** 是否为已知的合法 `origin_code`（空码 / 非 6 位数字 / 未登记码 → false） */
export function isKnownOriginCode(code) {
  const c = norm(code);
  return !!c && CODE_RE.test(c) && owner.has(c);
}

function norm(code) {
  if (code === null || code === undefined) return '';
  return String(code).trim();
}
