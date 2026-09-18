/**
 * 竹片扣费闸门（P1）— lib/economy-fee.js
 *
 * 规格（唯一真源）：docs/economy-fee.spec.md §3-1（扣费矩阵）/ §4-3（闸门顺序）/ §5-1（本模块三件事）/
 *   §6（错误码与回显）/ §8（how_to_get 文案）；总纲 docs/economy.spec.md §5-8（单价表 + 闸门顺序）、
 *   §5-5（建树扣 9 籽）、§4-6（Tx.type 枚举）、§5-2（FIFO + 整单拒绝）。
 *
 * 本模块只做三件事（**不重写第二套算法**，FIFO / 整单拒绝 / sweep / 批次读写全部复用
 * lib/economy-ledger.js 的账本内核）：
 *   ① 单价表    ：`FEE` + 纯函数 `feeOf(op, ctx)`（「操作 → 片数 / 籽数」判定集中一处）
 *   ② 闸门编排  ：`chargeBamboo` / `chargeSeeds` / `charger` / `quoteBamboo` / `quoteSeeds`
 *   ③ 冲正编排  ：`refund` / `refundAssets`
 *
 * 闸门顺序（§4-3，实现不得颠倒）：鉴权 401/403 → 只读预检 403 →（余额预检 409，本模块内
 * `chargeLots` 整单拒绝即此步，一字节不写）→ 扣费 → store 落库 → 落库失败 `refund` 冲正。
 *
 * 单价一览（片 = 竹片，唯一例外是建树的「颗」）：
 *   人物内容修改 1 片 / 节点；同树改父 1 片 / 节点；跨树迁移 **9 片 / 次（与后代人数无关）**；
 *   删除节点 3 片 / 节点（subtree = 3N，promote = 3）；建树 9颗石榴籽；新增 / 关系类 = 0 片（不接闸门）。
 */
import {
  ASSET_INSUFFICIENT,
  addLot,
  assetInsufficient,
  chargeLots,
  getAssets,
  recordTx,
  sumLots,
  summarize,
  sweep,
  withAssets,
} from './economy-ledger.js';
// 跨树登记字段清单的**唯一真源**在 lib/tree-write.js（写路径的属性分流也用它）；
// 值级比对要按同一份清单把 external_* 从详情属性里剔出去，禁止另抄一套键名。
// CHAIN_ATTR_KEYS（源流链属性：external_chain_gen / aggregate / from）同属「可能只在详情文档里」
// 的键，有效现值合并要一并覆盖（中华世本链节点就是这种形态）。
import { EXTERNAL_KEYS, CHAIN_ATTR_KEYS } from './tree-write.js';

// ---- ① 单价表（唯一真源；路由内禁止写魔法数字）----

/** 全部单价（改价只改这里，两册同批同步） */
export const FEE = {
  person_update: 1, // PUT /people/<handle>：1 片 / 节点
  reparent_same_tree: 1, // POST /admin/reparent 不带 new_parent_tree_id：1 片 / 节点
  reparent_cross_tree: 9, // 带 new_parent_tree_id：9 片 / 次（**绝不是 9 × 人数**）
  delete_node_per_person: 3, // 删除节点：3 片 / 节点（subtree = 3N；promote = 1 × 3）
  tree_create_seeds: 9, // 建树：9颗石榴籽（非竹片）
  // 立支（POST /admin/establish-branch）：9999 颗完整石榴籽 / 次（docs/branch-clan-ops.spec.md §3-4 / §6-1-7）；
  // 默认值唯一真源 —— 运行时可被 `jiazu_wallets.config.branch_fee_seeds` 覆盖（见 lib/wallet.js getBranchFeeSeeds）
  branch_fee_seeds: 9999,
};

/** 竹片来源提示（§8 唯一文案真源；409 响应与前端弹窗共用，前后端不得各写一套） */
export const HOW_TO_GET = [
  '官方 9.9 元/束',
  '每日 21 点限量发售',
  '市集购买',
  '蓄能档位赠送（季度 1 束 / 半年度 2 束 / 年度 8 束）',
];

/** 操作 → Tx.type（§4-6 枚举，不自造类型） */
export const TX_TYPE_OF_OP = {
  person_update: 'edit_fee',
  reparent_same_tree: 'edit_fee',
  reparent_cross_tree: 'move_fee',
  delete_node: 'delete_fee',
  tree_create: 'tree_create',
  // 立支同样产出一棵新树、扣籽 → **复用既有枚举 `tree_create`**（docs/branch-clan-ops.spec.md §6-1-7 / §13-8）
  establish_branch: 'tree_create',
  refund: 'fee_refund',
};

const ASSET_KEY = { bamboos: 'bamboos', seeds: 'seeds' };
const LOT_KIND = { bamboos: 'bamboo', seeds: 'seed' };

const norm = (n) => Math.max(0, Math.floor(Number(n) || 0));

/**
 * 操作 → 扣费判定（**纯函数**，无 IO，便于单测穷举矩阵）。
 *
 * @param {'person_update'|'reparent'|'delete_node'|'create_tree'} op
 * @param {{cross_tree?:boolean, dry_run?:boolean, mode?:string, people_count?:number, scope_changed?:boolean}} [ctx]
 * @returns {{unit:'bamboos'|'seeds', pieces:number, tx_type:string, free?:boolean, reason?:string}}
 */
export function feeOf(op, ctx = {}) {
  const c = ctx || {};
  switch (op) {
    case 'person_update':
      return { unit: 'bamboos', pieces: FEE.person_update, tx_type: TX_TYPE_OF_OP.person_update };
    case 'reparent':
      return c.cross_tree
        ? { unit: 'bamboos', pieces: FEE.reparent_cross_tree, tx_type: TX_TYPE_OF_OP.reparent_cross_tree, cross_tree: true }
        : { unit: 'bamboos', pieces: FEE.reparent_same_tree, tx_type: TX_TYPE_OF_OP.reparent_same_tree };
    case 'delete_node': {
      // subtree：每条节点独立计费（3 × N，不合并、不折扣）；promote：仅本节点 = 3 片
      const people = c.mode === 'promote' ? 1 : norm(c.people_count);
      const wouldBe = FEE.delete_node_per_person * people;
      // 预演：**0 片**（`free:true` 只报价不扣费），但 `pieces` 回「本次将消耗」的量供前端拼确认文案
      if (c.dry_run === true) {
        return { unit: 'bamboos', pieces: wouldBe, tx_type: TX_TYPE_OF_OP.delete_node, free: true, reason: 'dry_run' };
      }
      // 确认数不符 409：校验先于扣费 → 一律 0 片（响应是错误码，不出 fee）
      if (c.scope_changed === true) {
        return { unit: 'bamboos', pieces: 0, tx_type: TX_TYPE_OF_OP.delete_node, free: true, reason: 'scope_changed' };
      }
      return { unit: 'bamboos', pieces: wouldBe, tx_type: TX_TYPE_OF_OP.delete_node, people_count: people };
    }
    case 'create_tree':
      return { unit: 'seeds', pieces: FEE.tree_create_seeds, tx_type: TX_TYPE_OF_OP.tree_create };
    // 立支：9999 颗石榴籽（默认单价；`ctx.branch_fee_seeds` 由路由传入后台配置值覆盖，见 lib/wallet.js）
    case 'establish_branch': {
      const wanted = Number(c.branch_fee_seeds);
      const pieces = Number.isFinite(wanted) && wanted > 0 ? Math.floor(wanted) : FEE.branch_fee_seeds;
      return { unit: 'seeds', pieces, tx_type: TX_TYPE_OF_OP.establish_branch };
    }
    // 汇宗：0 片 + 0 籽（不接闸门；docs/branch-clan-ops.spec.md §3-13）
    case 'converge_clan':
      return { unit: 'bamboos', pieces: 0, tx_type: '', free: true, reason: 'not_charged' };
    default:
      // 未列明 = 0 片（新增 / 关系类一律不接闸门，§3-1 的 27 个 0 片行）
      return { unit: 'bamboos', pieces: 0, tx_type: '', free: true, reason: 'not_charged' };
  }
}

/**
 * 请求体是否含可修改内容字段（姓名 / 性别 / 生卒 / 健在 / 称号三字段）。
 * 一次 PUT = 一个节点 = 1 片；**不含任何可修改字段 → 视为无效请求，不扣费**。
 */
export function hasPersonChanges(body) {
  const b = body || {};
  const pn = b.primary_name;
  if (pn && (pn.first_name || (Array.isArray(pn.surname_list) && pn.surname_list.some((s) => s && s.surname)))) return true;
  if (b.gender !== undefined && b.gender !== null) return true;
  for (const k of ['name', 'surname', 'given', 'birth_date', 'death_date', 'birth_place', 'death_place', 'is_living']) {
    if (b[k] !== undefined && b[k] !== null && b[k] !== '') return true;
  }
  if (Array.isArray(b.attribute_list) && b.attribute_list.length > 0) return true;
  return false;
}

// ---- ①′ 值级比对（no-op 编辑：请求体与现值逐字段规范化后完全相同 → 不扣费、不写库）----

/**
 * 参与值级比对的树 JSON 结构字段（口径 = docs/economy-fee.spec.md §3-1 #1「节点内容修改」的
 * 姓名 / 性别 / 生卒 / 健在，称号三字段落在详情文档 attributes 里另行比对）。
 */
export const PERSON_VALUE_FIELDS = ['name', 'surname', 'given', 'gender', 'birth_date', 'death_date', 'birth_place', 'death_place', 'is_living'];

/** 详情文档里的称号三字段（键名同 docs/data-model.md §4；存储层键 = 号 / 封号 / 谥号） */
export const TITLE_ATTR_KEYS = ['封号', '谥号', '号'];

/** 规范化：字符串 trim；`''` / `undefined` / `null` 视为同一空值 */
const emptyText = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** 性别归一：数字枚举 1/2/0 与 M/F/U 同一口径（大小写不敏感） */
function normGender(v) {
  const s = emptyText(v).toUpperCase();
  if (s === '1') return 'M';
  if (s === '2') return 'F';
  if (s === '0') return 'U';
  return s;
}

/** 健在归一（统一布尔） */
const normLiving = (v) => v === true || v === 'true' || v === 1 || v === '1';

/**
 * 树里「现值」的健在口径：已记录布尔 → 用记录值；缺省 → 按有无卒年推导
 * （与前端档案 / 树图的 `is_living !== undefined ? is_living : !death` 完全同口径）。
 */
function currentLiving(person) {
  const p = person || {};
  return typeof p.is_living === 'boolean' ? p.is_living : !emptyText(p.death_date);
}

/** 属性键提取（Gramps 形状：`type` 可能是字符串或 `{string}`，兼容 `key`）；取不到 → '' */
function attrKeyOf(a) {
  return typeof a?.type === 'string' ? a.type : a?.type?.string || (typeof a?.key === 'string' ? a.key : '');
}

/**
 * 已由结构字段 / 专门路由分流的属性键：
 *   - `EXTERNAL_KEYS` 由本路由写成**树节点结构字段**（tree-write.updatePerson 第 189/194 行）；
 *   - `CHAIN_ATTR_KEYS`（源流链）只由续编路由维护，本路由写路径**不写**它们（tree-write 第 456/466 行）。
 * 二者都不得参与详情 attributes 的「全量替换」比对（否则链节点原样回传会被判差异 → 误扣 1 片）。
 */
const STRUCTURAL_ATTR_KEYS = [...EXTERNAL_KEYS, ...CHAIN_ATTR_KEYS];

/** 属性表（Gramps 形状 `[{type|key, value}]`）→ 规范化键值表；空值 = 未录入（与缺省同一口径） */
function attrMapOf(list, skipStructural = false) {
  const map = new Map();
  for (const a of list || []) {
    const key = attrKeyOf(a);
    if (!key) continue;
    if (skipStructural && STRUCTURAL_ATTR_KEYS.includes(key)) continue;
    const val = emptyText(a?.value);
    if (!val) continue;
    map.set(key, val);
  }
  return map;
}

function sameAttrMap(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/**
 * 有效现值（**纯函数，无 IO**）：树节点字段为底，叠加详情文档 `attributes` 里的键
 * （称号三字段 + `external_*` / `external_chain_gen` 等），树节点上**非空**的 `external_*` 再覆盖详情值。
 * 口径来源 = **读路径** `index.js` → `toRawPerson(tree, person, detail)`（`GET /people/<handle>` 用它拼
 * `attribute_list`）：先 push 详情 `detail.attributes`，再 push 树节点上非空的 `EXTERNAL_KEYS`（后写优先）。
 *
 * 为什么要它：中华世本**链节点**的 `external_tree` / `external_chain_gen` 只存在于详情文档 attributes、
 * 树节点上是空串；前端 GET（合并后）原样 PUT 回来时，若只比树节点字段就会判出 `fields:['external_tree']`
 * → 原样保存被误扣 1 片（真 HTTP 复现：风甲 / 风丙链节点）。
 *
 * @param {object} person 树 JSON 里的现值
 * @param {object|null} detail 详情文档现值（attributes 承载 external_* 与称号）
 * @returns {object} 有效现值（键值表；仅结构与详情派生字段，不做规范化）
 */
export function effectivePersonValues(person = {}, detail = null) {
  const p = person || {};
  const out = { ...p };
  for (const a of detail?.attributes || []) {
    const key = attrKeyOf(a);
    if (key) out[key] = a.value;
  }
  for (const k of EXTERNAL_KEYS) if (p[k]) out[k] = p[k]; // 读路径里树节点值后写 → 非空即优先
  return out;
}

/**
 * 值级比对（**纯函数，无 IO**）：请求体 `body` 与现值（树 JSON `person` + 详情文档 `detail`）
 * 在内容字段上规范化后是否完全相同 —— 完全相同 = 本次 PUT 为 no-op（路由不扣费、不写库）。
 *
 * 候选值一律按**写入语义**推导（lib/tree-write.js `updatePerson` 的行为）：
 *   - `name` / `surname` / `given` 只认 `primary_name`（`name` = surname + given，空则「未知」）；
 *   - `gender` 仅在 body 为 0/1/2 数字枚举时才写（字符串形态不写 → 该字段不参与比对）；
 *   - `is_living=true` 会**清空卒年**；给了非空 `death_date` 而没给布尔 `is_living` 会置 `is_living=false`；
 *   - 详情文档 `attributes` 是**全量替换**（body 未带的属性键会被删掉）→ 用键值表整体比对。
 * 只比内容字段；`external_*` 按契约不属于本路由（另有专门路由维护），仅做**值级保守追加**
 * （body 显式给了且与现值不同才算差异，绝不因「未提供」算差异；绝不静默吞掉一次真实写入）。
 *
 * @param {object} body PUT 请求体（Gramps RawPerson 形状）
 * @param {object} person 树 JSON 里的现值
 * @param {object|null} detail 详情文档现值（attributes 承载称号三字段）
 * @returns {{changed:boolean, fields:string[]}} `fields` = 判定有差异的字段名（便于测试 / 排查）
 */
export function personValueDiff(body = {}, person = {}, detail = null) {
  const b = body || {};
  const p = person || {};
  const fields = [];

  // ① 姓名三字段：body 未带任何姓名字段 → 视为「保持现值」，不参与比对
  //    （否则「只改称号」这类请求会被判成「把名字写成 未知」的差异）
  const hasName = !!b.primary_name || ['name', 'surname', 'given'].some((k) => b[k] !== undefined && b[k] !== null);
  if (hasName) {
    const pn = b.primary_name || {};
    const list = Array.isArray(pn.surname_list) ? pn.surname_list : [];
    const surname = emptyText(((list.find((s) => s && s.primary) || list[0] || {}).surname));
    const given = emptyText(pn.first_name);
    const cand = {
      name: b.name !== undefined && b.name !== null ? emptyText(b.name) : emptyText(`${surname}${given}` || '未知'),
      surname: b.surname !== undefined && b.surname !== null ? emptyText(b.surname) : surname,
      given: b.given !== undefined && b.given !== null ? emptyText(b.given) : given,
    };
    for (const k of ['name', 'surname', 'given']) if (cand[k] !== emptyText(p[k])) fields.push(k);
  }

  // ② 性别：写入侧只吃 0/1/2 数字枚举（字符串形态一律不写 → 不参与比对）
  if ([0, 1, 2].includes(b.gender)) {
    if (normGender(b.gender) !== normGender(p.gender)) fields.push('gender');
  }

  // ③ 生卒地（顶层约定字段；写入侧只落 birth_date / death_date）
  if (b.birth_date !== undefined && emptyText(b.birth_date) !== emptyText(p.birth_date)) fields.push('birth_date');
  if (b.birth_place !== undefined && emptyText(b.birth_place) !== emptyText(p.birth_place)) fields.push('birth_place');
  if (b.death_place !== undefined && emptyText(b.death_place) !== emptyText(p.death_place)) fields.push('death_place');

  // ④ 卒年：`is_living=true` 时写入侧会清空卒年 → 候选值取 ''
  const hasLiving = typeof b.is_living === 'boolean';
  if (b.death_date !== undefined || hasLiving) {
    const candDeath = b.is_living === true ? '' : emptyText(b.death_date !== undefined ? b.death_date : p.death_date);
    if (candDeath !== emptyText(p.death_date)) fields.push('death_date');
  }

  // ⑤ 健在：统一布尔；body 未给布尔 → 只有「给了非空卒年」（写入侧会置 false）才可能产生差异
  const curLiving = currentLiving(p);
  if (hasLiving) {
    if (normLiving(b.is_living) !== curLiving) fields.push('is_living');
  } else if (b.death_date !== undefined && emptyText(b.death_date) !== '' && curLiving) {
    fields.push('is_living');
  }

  // ⑥ 详情文档属性（称号三字段 + 其余属性）：全量替换语义 → 键值表整体比对
  //    **硬口径**：请求体**未提供** `attribute_list` ≠ 提供空表 → 属性维度视为「未提供」，不判变更
  //    （窄 body 只带姓名/生卒时不得因属性表被判差异；显式给了 `[]` 仍算真实清空 → 照旧计费）。
  //    排除 `STRUCTURAL_ATTR_KEYS`（EXTERNAL_KEYS + CHAIN_ATTR_KEYS）：它们由结构字段 / 续编路由分流，
  //    本路由写路径不写详情里的这两类键（tree-write.updatePerson 第 456/466 行）→ 不得判差异。
  if (b.attribute_list !== undefined && b.attribute_list !== null) {
    const candAttrs = attrMapOf(b.attribute_list, true);
    const curAttrs = attrMapOf(detail?.attributes, true);
    if (!sameAttrMap(candAttrs, curAttrs)) fields.push('attributes');
  }

  // ⑦ 跨树登记 / 源流链字段（external_* / external_chain_gen…）：现值基准改用**有效现值**
  //    （effectivePersonValues = 树节点 ∪ 详情 attributes，与读路径 toRawPerson 同一口径），
  //    否则链节点（external_* 只在详情里）原样回传会被判「变更」→ 误扣 1 片。
  //    body 未提供的键一律不参与比对（未提供 ≠ 变更）；显式给了且值不同才保守判差异（绝不静默吞掉真实写入）。
  const eff = effectivePersonValues(p, detail);
  const ext = {};
  for (const a of b.attribute_list || []) {
    const key = attrKeyOf(a);
    if (key && STRUCTURAL_ATTR_KEYS.includes(key)) ext[key] = emptyText(a?.value);
  }
  for (const k of EXTERNAL_KEYS) if (b[k] !== undefined && b[k] !== null) ext[k] = emptyText(b[k]);
  for (const [k, v] of Object.entries(ext)) if (v !== emptyText(eff[k])) fields.push(k);

  return { changed: fields.length > 0, fields };
}

/** 便捷包装：本次 PUT 是否为 no-op（路由用） */
export function isPersonUnchanged(body, person, detail = null) {
  return !personValueDiff(body, person, detail).changed;
}

// ---- ② 只读预检（不写；内部先 sweep 再算余量）----

/**
 * 只读报价（§5-1）：`{ need, current, enough }`。
 * **不落盘**：读快照 → 内存内 `sweep(now)` → 只计剩余批次（过期批次一律视为 0）。
 */
async function quoteOf(phone, unit, need) {
  const n = norm(need);
  const user = await getAssets(phone); // 只读快照（不写）
  sweep(user, new Date());
  const current = sumLots(user[ASSET_KEY[unit]]);
  return { unit, need: n, current, enough: current >= n };
}

export async function quoteBamboo(phone, need) {
  return quoteOf(phone, 'bamboos', need);
}

export async function quoteSeeds(phone, need) {
  return quoteOf(phone, 'seeds', need);
}

// ---- ③ 扣费（整单拒绝；不足 409 且一字节不写）----

function txRefOf(ref, spent) {
  const out = {};
  if (ref.tree_id) out.tree_id = ref.tree_id;
  if (ref.person_handle) out.person_handle = ref.person_handle;
  // 冲正需要「原路返还同一批次」→ 批次明细随流水落库（仍在既有 ref 字段内，不新增顶层字段）
  out.lots = spent.map((s) => ({ lot_id: s.lot_id, qty: s.qty, expires_at: s.expires_at, source: s.source, created_at: s.created_at }));
  return out;
}

function defaultDesc(unit, n, ref) {
  const who = ref.person_name || ref.person_handle || '';
  const unitCn = unit === 'seeds' ? `${n} 颗石榴籽` : `${n} 片竹片`;
  switch (ref.op) {
    case 'person_update':
      return `修改节点${who ? ` ${who}` : ''}（扣 ${unitCn}）`;
    case 'reparent_same_tree':
      return `同树改父${who ? ` ${who}` : ''}（扣 ${unitCn}）`;
    case 'reparent_cross_tree':
      return `跨树迁移${who ? ` ${who}` : ''}（扣 ${unitCn}）`;
    case 'delete_node':
      return `删除节点${who ? ` ${who}` : ''}${ref.people_count > 1 ? ` 等 ${ref.people_count} 人` : ''}（扣 ${unitCn}）`;
    case 'tree_create':
      return `新建家族树${ref.tree_id ? ` ${ref.tree_id}` : ''}（扣 ${unitCn}）`;
    case 'establish_branch':
      // docs/branch-clan-ops.spec.md §6-1-7：`Tx.desc` 逐字写「立支（<N 姓名> → <新树 tree_id>）」
      return `立支（${who} → ${ref.tree_id || ''}）`;
    default:
      return `资产扣减（扣 ${unitCn}）`;
  }
}

async function chargeUnit(unit, phone, count, ref = {}) {
  const n = norm(count);
  const op = ref.op || (unit === 'seeds' ? 'tree_create' : 'person_update');
  const txType = ref.tx_type || TX_TYPE_OF_OP[op] || 'edit_fee';
  return withAssets(phone, (user) => {
    const now = new Date();
    sweep(user, now); // §5-4：任何资产入口先惰性结算
    const key = ASSET_KEY[unit];
    const before = sumLots(user[key]);
    // 余额不足 → chargeLots 抛 409（整单拒绝，一个批次都不动）；withAssets 不落盘 → 资产一字节不变
    const charged = chargeLots(user[key], n, unit === 'seeds' ? 'seed' : 'bamboo');
    const spent = (charged.taken || []).map((t) => {
      const lot = (user[key] || []).find((l) => l.id === t.id) || {};
      return {
        lot_id: t.id,
        qty: t.qty,
        expires_at: t.expires_at === undefined ? null : t.expires_at,
        source: lot.source || '',
        created_at: lot.created_at || '',
      };
    });
    const tx =
      n > 0
        ? recordTx(
            user,
            {
              type: txType,
              delta: unit === 'seeds' ? { seeds: -n } : { bamboos: -n },
              ref: txRefOf(ref, spent),
              desc: ref.desc || defaultDesc(unit, n, ref),
              operator: phone,
            },
            now,
          )
        : null;
    const fee = { unit, pieces: n, balance: before, balance_after: before - n };
    return { fee, charged: n > 0, unit, pieces: n, balance: before, balance_after: before - n, txn_id: tx ? tx.id : '', spent, ref: tx ? tx.ref : {} };
  });
}

/**
 * 扣竹片（FIFO by `expires_at` 升序）。不足 → **抛 409 ASSET_INSUFFICIENT（need / current / unit）**，
 * 且**一字节不写**；成功 → 写 `Tx`（`edit_fee` / `delete_fee` / `move_fee`）并返回响应 `fee` 形状。
 * @returns {Promise<{fee:{unit:'bamboos',pieces:number,balance:number,balance_after:number}, charged:boolean, txn_id:string, spent:Array, ref:object}>}
 */
export async function chargeBamboo(phone, pieces, ref = {}) {
  return chargeUnit('bamboos', phone, pieces, ref);
}

/**
 * 扣石榴籽（建树；最小单位 = 整颗，不拆分）。不足 → 抛 409；成功 → 写 `Tx.type='tree_create'`。
 */
export async function chargeSeeds(phone, seeds, ref = {}) {
  return chargeUnit('seeds', phone, seeds, ref);
}

/**
 * 路由透传给 `lib/tree-write.js`（reparentNode / reparentAcrossTrees / deleteNode）的扣费回调工厂。
 *
 * 用法（**路由不判价**，单价一律由 `feeOf` 决定）：
 *   const charge = eco.charger(u.phone, 'delete_node');
 *   await tw.deleteNode({ …, charge, refund });
 * 回调入参 ctx（lib 层在闭包首步调用时给出）：
 *   { cross_tree?, dry_run?, tree_id, target_tree_id?, person_handle?, people_count?, mode? }
 * 回调返回：`{ fee, charged, txn_id, spent, ref }`（`charged=false` = 0 片 / 预演，未写任何资产）；
 * `fn.last` 保留最后一次结果，供路由在 catch 里冲正（§4-3 ⑥）。
 */
export function charger(phone, op) {
  const fn = async (ctx = {}) => {
    const f = feeOf(op, ctx);
    let res;
    if (!f.pieces) {
      // 0 片（未列明操作 / 0 人 / 409 范围变化）：只回 fee，不读不写
      res = { fee: { unit: f.unit, pieces: 0, balance: null, balance_after: null }, charged: false, txn_id: '', spent: [], ref: {}, free: true };
    } else if (f.free === true) {
      // 预演（dry_run）：只读报价，**不写任何资产**；fee.pieces 仍回「本次将消耗」的量
      const q = f.unit === 'seeds' ? await quoteSeeds(phone, f.pieces) : await quoteBamboo(phone, f.pieces);
      res = {
        fee: { unit: f.unit, pieces: f.pieces, balance: q.current, balance_after: q.current },
        charged: false,
        dry_run: true,
        enough: q.enough,
        txn_id: '',
        spent: [],
        ref: {},
        free: true,
      };
    } else {
      const ref = { op: op === 'reparent' ? (ctx.cross_tree ? 'reparent_cross_tree' : 'reparent_same_tree') : op, ...ctx };
      const c =
        f.unit === 'seeds'
          ? await chargeSeeds(phone, f.pieces, ref)
          : await chargeBamboo(phone, f.pieces, ref);
      res = { fee: c.fee, charged: true, txn_id: c.txn_id, spent: c.spent, ref: c.ref, unit: f.unit };
    }
    fn.last = res;
    return res;
  };
  fn.last = null;
  return fn;
}

/** 从扣费结果取响应 `fee` 字段（§5-8：只新增、不改既有字段语义） */
export function feeResponse(charged) {
  if (!charged) return { unit: 'bamboos', pieces: 0, balance: null, balance_after: null };
  return charged.fee;
}

// ---- ④ 冲正（落库失败 → 原路返还同一批次，写 fee_refund）----

/**
 * 冲正：把已扣的批次**原路返还**（恢复同一 `lot_id` 的原 `qty` 与 `expires_at`，**不新造批次**），
 * 并追加一条 `Tx.type='fee_refund'`（`delta` 取原值反向、`ref` 沿用原 ref、`desc` 写明原 Tx id）。
 * 原批次若已被 sweep 剔除，则按原 `lot_id` / `expires_at` 复原同一批次（绝不换成新批次）。
 *
 * @param {string} phone
 * @param {Array<{lot_id:string,qty:number,expires_at?:string|null,source?:string,created_at?:string}>} taken chargeBamboo/chargeSeeds 返回的 `spent`
 * @param {{unit?:'bamboos'|'seeds', txn_id?:string, tree_id?:string, person_handle?:string, reason?:string}} [ref]
 * @returns {Promise<{ok:boolean, refunded:number, unit:string, txn_id:string, tx?:object}>}
 */
export async function refund(phone, taken, ref = {}) {
  const unit = ref.unit === 'seeds' ? 'seeds' : 'bamboos';
  const items = (taken || [])
    .map((t) => ({
      lot_id: String((t && (t.lot_id || t.id)) || ''),
      qty: norm(t && t.qty),
      expires_at: t && t.expires_at !== undefined ? t.expires_at : null,
      source: (t && t.source) || '',
      created_at: (t && t.created_at) || '',
    }))
    .filter((t) => t.lot_id && t.qty > 0);
  if (!items.length) return { ok: true, refunded: 0, unit, txn_id: '', note: '无可返还批次' };

  return withAssets(phone, (user) => {
    const now = new Date();
    sweep(user, now);
    const key = ASSET_KEY[unit];
    user[key] = user[key] || [];
    let refunded = 0;
    for (const it of items) {
      let lot = user[key].find((l) => l && l.id === it.lot_id);
      if (!lot) {
        lot = addLot(user, LOT_KIND[unit], 0, {
          id: it.lot_id,
          expires_at: it.expires_at,
          source: it.source || 'admin',
          now,
        });
        if (it.created_at) lot.created_at = it.created_at;
      }
      lot.qty = norm(lot.qty) + it.qty;
      refunded += it.qty;
    }
    const tx = recordTx(
      user,
      {
        type: 'fee_refund',
        delta: unit === 'seeds' ? { seeds: refunded } : { bamboos: refunded },
        ref: { ...(ref.tree_id ? { tree_id: ref.tree_id } : {}), ...(ref.person_handle ? { person_handle: ref.person_handle } : {}), txn_id: ref.txn_id || '' },
        desc: `冲正原流水 ${ref.txn_id || '（未记录）'}：原路返还 ${refunded} ${unit === 'seeds' ? '颗石榴籽' : '片竹片'}${ref.reason ? `（${ref.reason}）` : ''}`,
        operator: phone,
      },
      now,
    );
    return { ok: true, refunded, unit, txn_id: tx.id, tx };
  });
}

/**
 * 按流水 id 冲正（§5-1 的规定导出）：读原 Tx → 用其 `ref.lots` 批次明细原路返还。
 * 原 Tx 不存在 / 无批次明细 → `{ ok:false, error }`（**不抛错**，绝不在路由 catch 里掩盖原始落库错误）。
 */
export async function refundAssets(phone, txn_id, reason = '') {
  const id = String(txn_id || '');
  if (!id) return { ok: false, refunded: 0, error: '缺少 txn_id' };
  const user = await getAssets(phone);
  const orig = (user.txs || []).find((t) => t && t.id === id);
  if (!orig) return { ok: false, refunded: 0, error: `找不到原流水 ${id}` };
  const lots = orig.ref?.lots || [];
  if (!lots.length) return { ok: false, refunded: 0, error: `原流水 ${id} 未记录批次明细，无法原路返还` };
  const unit = orig.delta?.seeds !== undefined ? 'seeds' : 'bamboos';
  return refund(
    phone,
    lots.map((l) => ({ lot_id: l.lot_id, qty: Math.abs(Number(l.qty) || 0), expires_at: l.expires_at ?? null, source: l.source, created_at: l.created_at })),
    { unit, txn_id: id, tree_id: orig.ref?.tree_id || '', person_handle: orig.ref?.person_handle || '', reason },
  );
}

/** 幂等的「按扣费结果冲正」辅助（路由 catch 用；`charged=false` 直接跳过） */
export async function refundCharged(phone, charged, reason = '落库失败') {
  if (!charged || !charged.charged) return { ok: false, refunded: 0, error: '本次未扣费，无需冲正' };
  return refund(phone, charged.spent, {
    unit: charged.unit,
    txn_id: charged.txn_id,
    tree_id: charged.ref?.tree_id || '',
    person_handle: charged.ref?.person_handle || '',
    reason,
  });
}

// ---- ⑤ 资产读接口（转发总纲 GET /assets/summary 数据口径，本册不另立字段名）----

/** 资产总览（先 sweep 再出数，字段口径 = 账本内核 `summarize()`，本册不另立字段名） */
export async function getAssetSummary(phone) {
  const now = new Date();
  return withAssets(phone, (user) => {
    sweep(user, now);
    return summarize(user, now);
  });
}

// ---- ⑥ 错误回显（§6：错误码与前端回显；不用中文文案正则匹配）----

/** 资产不足 409 响应体（`code` / `need` / `current` / `unit` / `how_to_get`） */
export function insufficientBody(err) {
  return {
    error: err.message,
    code: ASSET_INSUFFICIENT,
    need: err.need,
    current: err.current,
    unit: err.unit === 'bamboo' ? 'bamboos' : err.unit === 'seed' ? 'seeds' : err.unit,
    how_to_get: [...HOW_TO_GET],
  };
}

/**
 * 域名错误码白名单（§6）：**只有这些 code 允许出现在响应体里**。
 * 白名单外的 `code` 一律不透传 —— 底层文件系统 / 运行时抛出的 `EACCES` / `ENOENT` 这类系统错误码
 * 一旦回显，就会把本机路径与内部实现细节（`EACCES: permission denied, open '/tmp/...'`）泄露给前端。
 */
export const DOMAIN_ERROR_CODES = [ASSET_INSUFFICIENT, 'DELETE_SCOPE_CHANGED'];

/** 白名单外（系统 / 意外错误）的统一文案：**不截取底层异常文本** */
export const INTERNAL_ERROR_TEXT = '服务内部错误';

/**
 * 路由 catch 统一出参：
 * - 资产不足 409 → §6 全字段（`insufficientBody`：`need` / `current` / `unit` / `how_to_get` + 后端原文）；
 * - 白名单内的域名错误码（如 `DELETE_SCOPE_CHANGED`）→ 后端原文 + `code`；
 * - 系统 / 意外错误（带白名单外的 `code`，如 `EACCES`；或无 `status` 的裸异常）→ 通用文案 + `status`
 *   （默认 500，底层本就有 status 则沿用），**不带 `code`、不带底层异常文本**；
 * - 无 `code` 且带 `status` 的业务错误（lib 层 `fail(msg, 4xx)` / `httpError(4xx, msg)` 抛出）→
 *   保持既有语义，只回原文（401 / 403 / 404 / 409 业务文案不得被通用句覆盖）。
 * 既有字段语义不变（仍以 `error` 为主），只做新增。
 */
export function errorPayload(err, extra = {}) {
  const e = err || {};
  const code = typeof e.code === 'string' && e.code ? e.code : '';
  if (code === ASSET_INSUFFICIENT) return { ...insufficientBody(e), ...extra };
  if (DOMAIN_ERROR_CODES.includes(code)) return { error: e.message || INTERNAL_ERROR_TEXT, code, ...extra };
  const status = Number(e.status);
  // 系统错误：非白名单 code（EACCES / ENOENT / …）或无 status 的裸异常 → 只回通用文案 + status
  if (code || !Number.isFinite(status)) {
    return { error: INTERNAL_ERROR_TEXT, status: Number.isFinite(status) ? status : 500, ...extra };
  }
  return { error: e.message || 'internal error', ...extra };
}

/** 造一个 409 资产不足错误（单测 / 路由复用；口径同账本内核） */
export function feeInsufficient(need, current, unit = 'bamboos') {
  return assetInsufficient(need, current, unit === 'seeds' ? 'seed' : 'bamboo');
}
