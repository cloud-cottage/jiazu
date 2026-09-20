/**
 * 发源地三级行政区划 —— 名称表反查（纯逻辑，H5 与小程序共用；零请求、离线可用）
 *
 * 数据来源：`frontend/src/business/geo/divisions.json`（后端真源 `config/geo-divisions.json` 的
 * **生成产物**，由 `scripts/gen-geo-divisions.mjs` 产出）。本模块**只读该产物**，
 * **不手写任何码表 / 不改注音与码值口径**（AGENTS.md §2.3）。
 *
 * 为什么产物在 `src/business/` 而不在 `src/static/`（2026-09-20 实测裁定，勿搬回去）：
 *   · uni-app 会把 `src/static/**` **原样拷贝**进小程序产物，但运行时**读不到也用不上**它
 *     ⇒ 纯死重（这份数据实测 152 KiB，把主包从 1.858 MiB 顶到 2.139 MiB、越 2 MiB 上限）；
 *   · `src/business/**` 走 bundler ⇒ 数据并入 JS 后仍受包体约束，故产物同时**紧凑化 + deflate 压缩**：
 *     全量 JSON 明文 153 KB → 数组化 + 相对码 79 KB → `base64(deflateRaw)` **31 KB**（实测）。
 *     解压 = `./geo/inflate.ts`（小程序/H5 都没有 zlib，故自带 raw DEFLATE 解压器）。
 *
 * 载荷形状（生成端 = `scripts/gen-geo-divisions.mjs`，此处 = 唯一消费端；改形状必须同步改两处）：
 *   { "v": 1, "g": "<base64(deflateRaw(明文))>" }
 *   明文 = 一维数组：`[ [省 6 位码, 省名, [ [市 2 位相对码, 市名, [ [县 2 位相对码, 县名], … ] ], … ] ], … ]`
 *   · 市码 = 省码前 2 位 + 市相对码 + `00`；县码 = 市码前 4 位 + 县相对码（`decodePayload()` 还原）。
 *   · 不含 `_meta`：前端运行时不需要（来源登记见真源 `_meta` 与云函数侧产物）。
 *
 * 展示串口径与后端 `cloudfunctions/compat-api/lib/geo.js` 的 `resolveOrigin()` **逐字一致**：
 *   各级 `name` 顺序拼接，过滤伪级名（`市辖区` / `县` / `省直辖县级行政区划` / `自治区直辖县级行政区划`），缺级合法。
 *   例：110000/110100/110101 →「北京市东城区」；370000/371300/371325 →「山东省临沂市费县」；
 *       710000/710100/710104 →「台湾省台北市中正区」；999999 →「海外」；370000 →「山东省」；371300 →「山东省临沂市」。
 *   注意：前端**只提交 `origin_code`**，绝不自己拼展示串落库——展示串真源在后端写路径。
 * 本函数只用于**选择器内的即时预览**（让用户看到「将保存成什么」），不落库。
 */
import divisionsJson from '@/business/geo/divisions.json';
import { inflateBase64ToUtf8 } from './geo/inflate';

/** 县级（市辖区 / 县级市 / 县 / 旗 …） */
export interface GeoCounty {
  code: string;
  name: string;
}

/** 地级（地级市 / 自治州 / 地区 / 盟；台湾省下按契约视作地级市的 6 市亦在此层） */
export interface GeoCity {
  code: string;
  name: string;
  counties: GeoCounty[];
}

/** 一级（省 / 自治区 / 直辖市 / 特别行政区 / 海外） */
export interface GeoProvince {
  code: string;
  name: string;
  cities: GeoCity[];
}

/** 反查结果：各级名称 + 展示串（缺级为 `''`） */
export interface ResolvedOriginNames {
  province: string;
  city: string;
  county: string;
  /** 各级名称过滤伪级名后顺序拼接（缺级合法；未知 / 空码 → `''`） */
  display: string;
}

/** 路径反查结果：各级原始节点（未过滤伪级名，供选择器回显选中项用） */
export interface OriginPath {
  province: GeoProvince | null;
  city: GeoCity | null;
  county: GeoCounty | null;
}

/** 伪级名：只用于代码编制占位，展示串拼接时一律过滤（与后端 `SHOW_FILTER_NAMES` 同口径） */
export const SHOW_FILTER_NAMES: string[] = ['市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划'];

/** 「海外」= 一级唯一项、无下级（项目自建哨兵码，与后端 `OVERSEAS_CODE` 同口径） */
export const OVERSEAS_CODE = '999999';

const FILTER = new Set(SHOW_FILTER_NAMES);
const CODE_RE = /^\d{6}$/;
/** 载荷版本（与生成器 `{v:1}` 契约一致；不匹配即抛错，不静默降级成空菜单） */
const PAYLOAD_VERSION = 1;

/** 载荷明文形状：[省码, 省名, [ [市相对码, 市名, [ [县相对码, 县名], … ] ], … ] ] */
type RawCounty = [string, string];
type RawCity = [string, string, RawCounty[]];
type RawProvince = [string, string, RawCity[]];

/** 紧凑载荷 → 三级结构（相对码还原：市 = 省前 2 位 + 相对码 + `00`；县 = 市前 4 位 + 相对码） */
function decodePayload(payload: { v?: number; g?: string }): GeoProvince[] {
  if (!payload || payload.v !== PAYLOAD_VERSION || typeof payload.g !== 'string') {
    throw new Error('[geo] 发源地载荷版本不合契约：请跑 node scripts/gen-geo-divisions.mjs 重新生成前端产物');
  }
  const rows = JSON.parse(inflateBase64ToUtf8(payload.g)) as RawProvince[];
  return rows.map(([pCode, pName, cities]) => ({
    code: pCode,
    name: pName,
    cities: (cities || []).map(([cSub, cName, counties]) => {
      const code = `${pCode.slice(0, 2)}${cSub}00`;
      return {
        code,
        name: cName,
        counties: (counties || []).map(([aSub, aName]) => ({ code: code.slice(0, 4) + aSub, name: aName })),
      };
    }),
  }));
}

const provinces: GeoProvince[] = decodePayload(divisionsJson as unknown as { v?: number; g?: string });
if (!provinces.length) {
  throw new Error('[geo] 行政区划数据为空：frontend/src/business/geo/divisions.json 请跑 scripts/gen-geo-divisions.mjs 重新生成');
}

/** 码 → 层级归属（模块加载时一次性建索引；数据集静态、无失效机制——与后端 `idx()` 同策略） */
const ownerIndex = new Map<string, OriginPath>();

for (const p of provinces) {
  ownerIndex.set(p.code, { province: p, city: null, county: null });
  for (const c of p.cities || []) {
    ownerIndex.set(c.code, { province: p, city: c, county: null });
    for (const a of c.counties || []) {
      ownerIndex.set(a.code, { province: p, city: c, county: a });
    }
  }
}

/** 该地级的县级列表是否为空（「直筒子市」如东莞市 / 中山市 / 儋州市 / 嘉峪关市：法定无县级，
 *  上游街道 / 镇级项已按 `^\d{6}$` 口径整批剔除 ⇒ 选择器必须止于第二级）。 */
export function isTerminalCity(provinceCode?: string | null, cityCode?: string | null): boolean {
  const cities = citiesOf(provinceCode);
  const c = hit(cityCode);
  return !!c?.city && c.city.counties.length === 0 && cities.some((x) => x.code === c.city!.code);
}

/**
 * 一级列表（数据集顺序：31 个大陆省级 → 台湾省 → 香港 → 澳门 → 海外，共 35 项）。
 * **只读**：调用方不得修改返回的数组 / 节点（该结构即模块索引本身）。
 */
export function provincesOf(): GeoProvince[] {
  return provinces;
}

/** 某省下的地级列表（未知 / 空码 / 海外 → `[]`）。只读。 */
export function citiesOf(provinceCode?: string | null): GeoCity[] {
  const p = hit(provinceCode);
  return p && p.province ? p.province.cities || [] : [];
}

/** 某省某地级下的县级列表（未知 / 空码 / 直筒子市 → `[]`）。只读。 */
export function countiesOf(provinceCode?: string | null, cityCode?: string | null): GeoCounty[] {
  const c = hit(cityCode);
  if (!c || !c.city) return [];
  const p = hit(provinceCode);
  // 省市不匹配（脏入参）→ 空，不臆造
  if (!p || !p.province || p.province.code !== c.province?.code) return [];
  return c.city.counties || [];
}

/** 码 → 各级名称 + 展示串（与后端 `resolveOrigin()` 同口径；空码 / 未知码 → 全空串） */
export function resolveNames(code?: string | null): ResolvedOriginNames {
  const p = hit(code);
  const empty: ResolvedOriginNames = { province: '', city: '', county: '', display: '' };
  if (!p) return empty;
  const province = p.province;
  const city = p.city;
  const county = p.county;
  const display = [province, city, county]
    .filter(Boolean)
    .filter((l) => !FILTER.has((l as GeoCounty).name))
    .map((l) => (l as GeoCounty).name)
    .join('');
  return {
    province: province?.name || '',
    city: city?.name || '',
    county: county?.name || '',
    display,
  };
}

/** 码 → 各级原始节点（未过滤伪级名；空码 / 未知码 → 全 `null`）。选择器回显选中项用。 */
export function pathOfCode(code?: string | null): OriginPath {
  return hit(code) || { province: null, city: null, county: null };
}

/** 是否为已知的合法码（空码 / 非 6 位数字 / 未登记码 → false；与后端 `isKnownOriginCode()` 同口径） */
export function isKnownCode(code?: string | null): boolean {
  const c = norm(code);
  return !!c && CODE_RE.test(c) && ownerIndex.has(c);
}

/** 码 → 层级归属；空码 / 未知码 → null */
function hit(code?: string | null): OriginPath | null {
  const c = norm(code);
  if (!c) return null;
  return ownerIndex.get(c) || null;
}

function norm(code?: string | null): string {
  if (code === null || code === undefined) return '';
  return String(code).trim();
}
