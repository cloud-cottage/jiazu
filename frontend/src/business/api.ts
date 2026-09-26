/**
 * Gramps-Web REST API 客户端
 *
 * 认证架构（v2 — auth-server 代理模式）:
 * - 所有 /api/* 请求经 auth-server (端口 5197) 代理到 Gramps-Web
 * - auth-server 持有 Gramps 访客凭据并自动注入，前端不接触
 * - 手机号验证码登录走 /api/auth/*（auth-server 处理）
 *
 * dev 模式: Vite 代理 /api → 127.0.0.1:5197 (auth-server) → 127.0.0.1:5198 (Gramps)
 */

import { getAuthToken } from './auth';
import { TITLE_DISPLAY_ORDER } from './format';
import { placeViewOf, placeViewsOf } from './place';
import type {
  PersonDetail,
  PersonPlaceInput,
  PersonPlaceView,
  PersonSummary,
  ProfileLifespanView,
  SearchParams,
  SearchResult,
  SetTreeOriginResult,
  TreeMeta,
  TreeOriginCandidates,
  FamilyRef,
  EstablishBranchResult,
  ConvergeClanResult,
  SiblingReorderPayload,
  SiblingReorderResult,
} from './types';

// API 基础路径
// 默认 '/api'（开发经 Vite proxy → auth-server / 兼容层）
// 生产构建：VITE_API_BASE=https://<云函数HTTP域名> npm run build:h5
// 小程序构建：VITE_API_BASE=https://jiapu100.com（同域）
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
export { API_BASE };

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; treeId?: string } = {},
): Promise<T> {
  const { method = 'GET', body, treeId } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  // 多 tree 支持：auth-server 按此 header 选择对应 Gramps 凭据
  if (treeId) {
    headers['X-Tree-Id'] = treeId;
  }
  // 读路径节点级可见分层：携带登录态，服务端按 guest/logged-in/member 分档裁剪
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${path}`);
  }

  return response.json() as Promise<T>;
}

// ---- 手机号验证码认证（auth-server） ----

/** 发送验证码（开发阶段 auth-server 在控制台打印并返回 dev_code） */
export async function sendSmsCode(phone: string): Promise<{ dev_code?: string }> {
  const res = await fetch(`${API_BASE}/auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `发送失败 (${res.status})`);
  }
  return res.json();
}

/** 手机号 + 验证码注册（默认 guest 角色） */
export async function registerByPhone(
  phone: string,
  code: string,
  nickname: string,
): Promise<{ token: string; phone: string; nickname: string; role: string }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, nickname }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `注册失败 (${res.status})`);
  }
  return res.json();
}

/** 手机号 + 验证码登录 */
export async function loginByPhone(
  phone: string,
  code: string,
): Promise<{ token: string; phone: string; nickname: string; role: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `登录失败 (${res.status})`);
  }
  return res.json();
}

/** 获取当前登录用户信息 */
export async function fetchMe(token: string): Promise<{
  phone: string;
  nickname: string;
  role: string;
}> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`获取用户信息失败 (${res.status})`);
  return res.json();
}

/**
 * 【移除并新建家族树】以指定人物为始祖拆分新家族树（需 admin）
 * 新树姓氏 = 始祖姓氏；原树中移除该节点及其子节点
 */
export async function splitTree(
  token: string,
  data: {
    tree_id: string;
    ancestor_handle: string;
    ancestor_name?: string;
  },
): Promise<{
  ok: boolean;
  newTreeId: string;
  surname: string;
  movedPeople: number;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/admin/split-tree`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `拆分失败 (${res.status})`);
  }
  return res.json();
}

// ---- 数据解析（官方 API 真实字段） ----

interface RawPerson {
  handle: string;
  gramps_id: string;
  gender: number;
  /** 显式健在状态（compat 树 JSON 输出；缺省由死亡日期推断） */
  is_living?: boolean;
  primary_name?: {
    first_name?: string;
    surname_list?: Array<{ surname?: string; primary?: boolean }>;
    suffix?: string;
    title?: string;
  };
  birth_ref_index?: number;
  death_ref_index?: number;
  event_ref_list?: Array<{ ref: string; role: string }>;
  family_list?: string[];
  parent_family_list?: string[];
  attribute_list?: Array<{ type: string | { string: string }; value: string }>;
  extended?: {
    attributes?: Array<{ type: string; value: string }>;
    profile?: {
      birth?: ProfileLifespanView;
      death?: ProfileLifespanView;
      name_given?: string;
      name_surname?: string;
    };
  };
  profile?: {
    birth?: ProfileLifespanView;
    death?: ProfileLifespanView;
    families?: ProfileFamily[];
    primary_parent_family?: ProfileFamily;
  };
  /**
   * 居住地（契约 v2）：后端由树 JSON `residence_places`（`[{ origin_code, note }]`）派生的读形状。
   * 顺序即展示顺序；上限 9 条。
   */
  residence_places?: PersonPlaceView[];
}

/** person profile 内嵌的家庭成员摘要（带姓名） */
interface ProfilePerson {
  handle: string;
  gramps_id?: string;
  name_given?: string;
  name_surname?: string;
  sex?: string;
  /** 显式健在状态（compat 树 JSON 输出；缺省由死亡日期推断） */
  is_living?: boolean;
  birth?: { date?: string };
  death?: { date?: string };
}

/** person profile 内嵌的家庭摘要（配偶家族 / 父母家族） */
interface ProfileFamily {
  handle: string;
  gramps_id?: string;
  father?: ProfilePerson;
  mother?: ProfilePerson;
  children?: ProfilePerson[];
}

/** profile 内嵌成员 → PersonSummary（中文姓名序：姓+名） */
function profilePersonToSummary(p: ProfilePerson): PersonSummary {
  const is_living = p.is_living !== undefined ? p.is_living : !(p.death && p.death.date);
  return {
    handle: p.handle,
    gramps_id: p.gramps_id || '',
    name: `${p.name_surname || ''}${p.name_given || ''}` || p.gramps_id || '未知',
    surname: p.name_surname || '',
    birth_date: p.birth?.date || undefined,
    death_date: p.death?.date || undefined,
    gender: p.sex === 'F' ? 'F' : p.sex === 'M' ? 'M' : 'U',
    is_living,
  };
}

/**
 * 从 person profile 构建家庭关系（零额外请求，数据已在 profile 内）
 * - type='spouse'：本人作为父/母的家族（含配偶 + 子女）
 * - type='parents'：本人作为子女的家族（父母）
 */
function buildFamilyRefs(
  profile: RawPerson['profile'],
): FamilyRef[] {
  if (!profile) return [];
  const refs: FamilyRef[] = [];
  for (const fam of profile.families || []) {
    refs.push({
      handle: fam.handle,
      gramps_id: fam.gramps_id || '',
      type: 'spouse',
      father: fam.father ? profilePersonToSummary(fam.father) : undefined,
      mother: fam.mother ? profilePersonToSummary(fam.mother) : undefined,
      children: (fam.children || []).map(profilePersonToSummary),
    });
  }
  const pf = profile.primary_parent_family;
  if (pf && (pf.father || pf.mother)) {
    refs.push({
      handle: pf.handle,
      gramps_id: pf.gramps_id || '',
      type: 'parents',
      father: pf.father ? profilePersonToSummary(pf.father) : undefined,
      mother: pf.mother ? profilePersonToSummary(pf.mother) : undefined,
      children: [],
    });
  }
  return refs;
}

/** 解析人物名字（中文习惯：first_name 姓 + surname 名） */
function parsePersonName(raw: RawPerson): string {
  const name = raw.primary_name;
  if (!name) return raw.gramps_id || '未知';
  const surname = name.surname_list?.find((s) => s.primary)?.surname || '';
  const given = name.first_name || '';
  const full = `${surname}${given}`;
  return full || raw.gramps_id || '未知';
}

function genderToString(g: number): 'M' | 'F' | 'U' {
  if (g === 1) return 'M';
  if (g === 2) return 'F';
  return 'U';
}

/** 生卒年月（从 profile 提取） */
function parseDates(raw: RawPerson): { birth?: string; death?: string } {
  const prof = raw.profile || raw.extended?.profile;
  return {
    birth: prof?.birth?.date || undefined,
    death: prof?.death?.date || undefined,
  };
}

/** 自定义属性 key 归一化（type 可能是字符串或 {string} 对象） */
function attrKey(a: { type: string | { string: string } }): string {
  return typeof a.type === 'string' ? a.type : a.type?.string || '';
}

function toPersonSummary(raw: RawPerson): PersonSummary {
  const { birth, death } = parseDates(raw);
  // 跨树链接标记（分迁占位 / 出嫁 / 登记始祖）
  let externalTree: string | undefined;
  let externalLinkType: string | undefined;
  let externalPersonHandle: string | undefined;
  const attrVals: Record<string, string> = {};
  for (const a of raw.attribute_list || []) {
    const k = attrKey(a);
    attrVals[k] = a.value;
    if (k === 'external_tree') externalTree = a.value;
    else if (k === 'external_link_type') externalLinkType = a.value;
    else if (k === 'external_person_handle') externalPersonHandle = a.value;
  }
  // 外树镜像节点标记（嫁娶生成）
  // 称号（封号 → 谥号 → 号）：节点卡片人物名称按「姓名·封号·谥号·号」展示
  const titles = TITLE_DISPLAY_ORDER.map((k) => (attrVals[k] || '').trim())
    .filter(Boolean)
    .join('·');
  return {
    handle: raw.handle,
    gramps_id: raw.gramps_id,
    name: parsePersonName(raw),
    surname: raw.primary_name?.surname_list?.find((s) => s.primary)?.surname || '',
    birth_date: birth,
    death_date: death,
    gender: genderToString(raw.gender),
    // 显式健在状态优先（compat 已存 is_living，可表达「已故但卒年不详」）；旧数据回退按卒年推断
    is_living: raw.is_living !== undefined ? raw.is_living : !death,
    titles,
    external_mirror: attrVals.external_mirror || '',
    external_tree: externalTree,
    external_link_type: externalLinkType,
    external_person_handle: externalPersonHandle,
  };
}

/** 合并 attribute_list + extended.attributes（去重），供详情页展示自定义属性 */
function mergeAttributes(raw: RawPerson): Array<{ key: string; value: string; type: string }> {
  const list = [...(raw.attribute_list || []), ...(raw.extended?.attributes || [])];
  const seen = new Set<string>();
  const out: Array<{ key: string; value: string; type: string }> = [];
  for (const a of list) {
    const key = attrKey(a);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, value: a.value, type: key });
  }
  return out;
}

// ---- 人物 ----

export async function fetchPerson(
  treeId: string,
  handle: string,
): Promise<PersonDetail> {
  // 注意：单对象路由无尾斜杠（/api/people/<handle>）
  const raw = await request<RawPerson>(`/people/${handle}?profile=all`, { treeId });
  const summary = toPersonSummary(raw);
  // 地点派生字段与生卒同源（profile 优先、extended 兜底）：出生地取 `profile.birth`，居住地取顶层数组
  const prof = raw.profile || raw.extended?.profile;
  return {
    ...summary,
    birth_place: placeViewOf(prof?.birth),
    residence_places: placeViewsOf(raw.residence_places),
    profiles: [],
    // 婚配/家庭关系：数据在 profile.families + primary_parent_family（零额外请求）
    families: buildFamilyRefs(raw.profile),
    events: [],
    media: [],
    citations: [],
    notes: [],
    attributes: mergeAttributes(raw),
  };
}

export async function fetchPersonList(
  treeId: string,
  page = 0,
  pageSize = 0,
): Promise<{ data: PersonSummary[]; total: number }> {
  // Gramps-Web 分页: page=0(默认) 返回全部; pagesize 无上限; 无 start 参数
  const query =
    page > 0 && pageSize > 0
      ? `/people/?profile=all&page=${page}&pagesize=${pageSize}`
      : `/people/?profile=all`;
  const raw = await request<RawPerson[]>(query, { treeId });
  return {
    data: raw.map(toPersonSummary),
    total: raw.length,
  };
}

// ---- 家族 ----

export interface FamilySummary {
  handle: string;
  gramps_id: string;
  father_handle: string;
  mother_handle: string;
  child_handles: string[];
}

export async function fetchFamilyList(
  treeId: string,
): Promise<FamilySummary[]> {
  const raw = await request<Array<{
    handle: string;
    gramps_id: string;
    father_handle?: string;
    mother_handle?: string;
    child_ref_list?: Array<{ ref: string }>;
  }>>('/families/', { treeId });
  return raw.map((f) => ({
    handle: f.handle,
    gramps_id: f.gramps_id || '',
    father_handle: f.father_handle || '',
    mother_handle: f.mother_handle || '',
    child_handles: (f.child_ref_list || []).map((c) => c.ref),
  }));
}

// ---- 钱包（余额/充值/建树费） ----

export interface WalletTransaction {
  id: string;
  type: string;
  user?: string;
  tree?: string;
  amount_cents: number;
  desc: string;
  ts: string;
}

export interface WalletOverview {
  user_balance_yuan: string;
  tree_create_fee_yuan: string;
  transactions: WalletTransaction[];
}

/** 查询钱包总览（需登录） */
export async function fetchWallet(token: string): Promise<WalletOverview> {
  const res = await fetch(`${API_BASE}/wallet/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`获取钱包失败 (${res.status})`);
  return res.json();
}

/** 充值（开发阶段模拟） */
export async function rechargeWallet(
  token: string,
  amount: number,
): Promise<{ ok: boolean; balance_yuan: string }> {
  const res = await fetch(`${API_BASE}/wallet/recharge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `充值失败 (${res.status})`);
  }
  return res.json();
}

/** admin 设置建树费 */
export async function setTreeCreateFee(
  token: string,
  fee: number,
): Promise<{ ok: boolean; tree_create_fee_yuan: string }> {
  const res = await fetch(`${API_BASE}/admin/wallet-fee`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fee }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `设置费用失败 (${res.status})`);
  }
  return res.json();
}

/** 中华世本总谱节点（公开读，含跨树引用） */
export interface MasterNode {
  handle: string;
  gramps_id: string;
  name: string;
  external_tree?: string;
}

/** 拉取中华世本总谱全部节点 */
export async function fetchMasterTree(): Promise<MasterNode[]> {
  const res = await fetch(`${API_BASE}/people/?profile=all`, {
    headers: { 'X-Tree-Id': 'zhonghua' },
  });
  if (!res.ok) throw new Error(`加载总谱失败 (${res.status})`);
  const raw = await res.json();
  return (raw as any[]).map((p) => {
    const pn = p.primary_name || {};
    const sn = pn.surname_list?.[0]?.surname || '';
    const attrs: Record<string, string> = {};
    for (const a of p.attribute_list || []) {
      if (typeof a.type === 'string') attrs[a.type] = a.value;
    }
    return {
      handle: p.handle,
      gramps_id: p.gramps_id,
      name: `${pn.first_name || ''}${sn}`,
      external_tree: attrs.external_tree,
    };
  });
}

/** 获取人物完整对象（编辑用，需登录） */
export async function fetchPersonForEdit(
  treeId: string,
  handle: string,
  token: string,
): Promise<any> {
  const res = await fetch(`${API_BASE}/people/${handle}?profile=all`, {
    headers: {
      'X-Tree-Id': treeId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`加载人物失败 (${res.status})`);
  return res.json();
}

/**
 * `PUT /people/<handle>` 请求体：服务端 Gramps 形状对象的原样回传 + 本项目扩展字段。
 * 契约 v2：出生地 / 居住地一律提交**原始码 + 备注**（`birth_place` / `residence_places`），
 * **不提交**后端派生的 `place`；两个字段都不得省略（空值也要发空形状 / 空数组）。
 */
export interface PersonSavePayload {
  /** 出生地（空 → `{ origin_code: '', note: '' }`） */
  birth_place: PersonPlaceInput;
  /** 居住地（多条，上限 9 条；空 → `[]`） */
  residence_places: PersonPlaceInput[];
  /** 其余字段为 Gramps 形状（`RawPerson` 原样回传，如 primary_name / attribute_list / birth_date …） */
  [key: string]: unknown;
}

/**
 * 只读镜像节点唯一可提交的字段（契约 v2 C6 / 裁定 R3 例外）：
 * 请求体**只含** `birth_place` / `residence_places` 两项 —— 后端 `isPlaceFieldsOnly` 据此放行，
 * 夹带姓名 / 生卒 / 健在等锁字段仍 403（且被拒请求不得产生任何资产流水）。
 */
export type PersonPlaceSavePayload = Pick<PersonSavePayload, 'birth_place' | 'residence_places'>;

/** `PUT /people/<handle>` 统一出口（完整对象保存 / 只读镜像的出生地·居住地保存共用） */
async function putPerson(
  treeId: string,
  handle: string,
  body: PersonSavePayload | PersonPlaceSavePayload,
  token: string,
): Promise<{ fee?: FeeInfo }> {
  const res = await fetch(`${API_BASE}/people/${handle}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Tree-Id': treeId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiStatusError(err?.error?.message || err?.error || `保存失败 (${res.status})`, res.status, err);
  }
  return res.json().catch(() => ({}));
}

/**
 * 保存人物（PUT 完整对象，需登录）
 * 注：Gramps-Web 的 ETag 是响应 hash（非对象 hash），If-Match 永远不匹配，
 * 故不使用乐观锁，直接 PUT。
 * 扣费闸门（docs/economy-fee.spec.md §3-1 #1）：1 片 / 节点 → 响应带 `fee`；
 * 不足 → 409 `{ code:'ASSET_INSUFFICIENT', need, current, how_to_get }`（抛 ApiStatusError）。
 */
export async function savePerson(
  treeId: string,
  handle: string,
  person: PersonSavePayload,
  token: string,
): Promise<{ fee?: FeeInfo }> {
  return putPerson(treeId, handle, person, token);
}

/**
 * 保存**只读镜像节点**的出生地 / 居住地（契约 v2 C6，裁定 R3 唯一例外；需登录）。
 * 请求体只含这两项 → 后端只读闸门（镜像整节点只读）放行；其余字段仍由真身所在树管理。
 */
export async function savePersonPlaces(
  treeId: string,
  handle: string,
  places: PersonPlaceSavePayload,
  token: string,
): Promise<{ fee?: FeeInfo }> {
  return putPerson(treeId, handle, places, token);
}

// ---- 家族树等级 ----

export interface TreeRankInfo {
  tree_id: string;
  total_generations: number;
  rank_key: string;
  rank_label: string;
  rank_en: string;
  rank_desc: string;
  over_limit: boolean;
  max_depth: number;
  root_count: number;
  /**
   * 家族人数（**新口径**，用户 2026-09-19 拍板，后端 lib/family-population.js）：
   * 本姓节点无论男女一律计入 + 外姓嫁入女性计入（含 marriage 镜像）+「本姓女性嫁出后所生的子女」不计入
   * （结构判据 + `external_mirror:'true'` 且 `external_link_type:'child'` 的外树子女镜像）。
   * 首页卡片只展示这一个数字（不再有「（含外树 M）」说明），三档排序归一化同样用它。
   */
  person_count: number;
  /**
   * 本树「外树镜像」节点数（口径 `String(external_mirror) === 'true'`）。**保留字段**：
   * 新口径下前端不再用于展示（首页卡片只显示 person_count），**不参与任何排序归一化**。
   * 可选：旧响应不带该字段时不影响渲染。
   */
  mirror_count?: number;
  explicit: boolean;
  /**
   * 家族活跃度（可选：后端可能未下发；前端一律按 0 兜底处理，不得据此报错或显示 NaN）。
   * 用于首页「综合 / 活跃度」排序。
   */
  activity?: number;
  /** 家族数据最后更新时刻（ISO 串，可选：缺失按空串处理）；用于首页综合排序的新近度项 */
  updated_at?: string;
  /** 节点级可见分层元信息（docs/permission-tier.spec.md §6） */
  access?: TreeAccessInfo;
}

/** 当前访问者在某树上的节点级可见性 */
export interface TreeAccessInfo {
  /** full=全可见；partial=可见 visible_max_depth 世；floor=浅树兜底（仅最古老 1 世） */
  mode: 'full' | 'partial' | 'floor';
  visible_max_depth: number;
  hide_tail: number;
  is_master: boolean;
  member: boolean;
  login_required: boolean;
  clamped: boolean;
}

/** 家族树等级（世代深度 → 家乘/族乘/宗乘/世乘） */
export async function fetchTreeRank(treeId: string): Promise<TreeRankInfo> {
  const headers: Record<string, string> = { 'X-Tree-Id': treeId };
  // 携带登录态：服务端按 guest/logged-in/member 分档返回 access 元信息
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/tree/rank`, { headers });
  if (!res.ok) throw new Error(`读取家族等级失败 (${res.status})`);
  return res.json();
}

// ---- 角色管理 ----

export interface ManagedUser {
  phone: string;
  nickname: string;
  role: string;
  created_at: string;
}

/** 用户列表（tree_steward 及以上） */
export async function fetchUserList(token: string): Promise<ManagedUser[]> {
  const res = await fetch(`${API_BASE}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `获取用户列表失败 (${res.status})`);
  }
  return res.json();
}

/** 设置用户角色 */
export async function setUserRole(
  token: string,
  phone: string,
  role: string,
): Promise<{ ok: boolean; phone: string; role: string; old_role: string }> {
  const res = await fetch(`${API_BASE}/admin/set-role`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ phone, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `设置角色失败 (${res.status})`);
  }
  return res.json();
}

/** 设置用户锚点（用户在树中的自身节点） */
export async function setAnchor(
  token: string,
  phone: string,
  treeId: string,
  personHandle: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/admin/set-anchor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ phone, tree_id: treeId, person_handle: personHandle }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `设置锚点失败 (${res.status})`);
  }
  return res.json();
}

// ---- 加入家族（申请-审批制；docs/permission-tier.spec.md §9，自助认领已取消） ----

/** 提交加入申请（选公开谱系中的支系节点 + 自述认领线索） */
export async function submitJoinRequest(
  token: string,
  body: { tree_id: string; reference_handle: string; self_name?: string; note?: string },
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/join-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `提交申请失败 (${res.status})`);
  }
  return res.json();
}

/** 加入申请条目（管理端审批列表） */
export interface JoinRequestItem {
  id: string;
  phone: string;
  nickname?: string;
  tree_id: string;
  reference_handle: string;
  reference_name?: string;
  reference_depth?: number | null;
  self_name?: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason?: string;
  created_at: string;
  handled_by?: string;
  handled_at?: string;
}

/** 加入申请列表（tree_steward 看自己树，chief_editor 看全部） */
export async function fetchJoinRequests(token: string): Promise<JoinRequestItem[]> {
  const res = await fetch(`${API_BASE}/admin/join-requests`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error(`获取加入申请失败 (${res.status})`);
  return res.json();
}

/** 审批通过（绑定申请人本人节点 → 成为 member） */
export async function approveJoinRequest(
  token: string,
  id: string,
  personHandle: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/admin/approve-join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ id, person_handle: personHandle }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `审批失败 (${res.status})`);
  }
  return res.json();
}

/** 审批拒绝（申请人可重申） */
export async function rejectJoinRequest(
  token: string,
  id: string,
  reason?: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/admin/reject-join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ id, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `拒绝失败 (${res.status})`);
  }
  return res.json();
}

/** 查询当前用户的绑定（锚点）状态 */
export async function fetchMyAnchor(token: string): Promise<{
  tree_id: string;
  person_handle: string;
  updated_at: string;
} | null> {
  const res = await fetch(`${API_BASE}/admin/get-anchor`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`获取绑定状态失败 (${res.status})`);
  const data = await res.json();
  return data.anchor || null;
}

/** 提交解绑申请（需 tree_steward 审批） */
export async function requestLeave(
  token: string,
  reason?: string,
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/leave-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason: reason || '' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `申请失败 (${res.status})`);
  }
  return res.json();
}

/** 解绑申请列表（tree_steward 看自己树，chief_editor 看全部） */
export interface LeaveRequestItem {
  id: string;
  phone: string;
  nickname: string;
  tree_id: string;
  person_handle: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
export async function fetchLeaveRequests(token: string): Promise<LeaveRequestItem[]> {
  const res = await fetch(`${API_BASE}/admin/leave-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `获取申请列表失败 (${res.status})`);
  }
  return res.json();
}

/** 审批解绑申请（通过 → 清除锚点；拒绝 → 维持绑定） */
export async function approveLeave(
  token: string,
  id: string,
  approve: boolean,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/admin/approve-leave`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id, approve }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `审批失败 (${res.status})`);
  }
  return res.json();
}

/** 删除分迁链接（管理员）：校验占位节点后删除，彻底断开与原支系的连接 */
export async function removeBranchLink(
  token: string,
  treeId: string,
  personHandle: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/admin/remove-branch-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tree_id: treeId, person_handle: personHandle }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `删除链接失败 (${res.status})`);
  }
  return res.json();
}

// ---- 节点增补（管理员）：添加父节点 / 子节点 ----

/** 带登录态的写请求（X-Tree-Id + Bearer） */
async function authedFetch(
  treeId: string,
  path: string,
  method: string,
  token: string,
  body?: unknown,
): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tree-Id': treeId,
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // 带状态码 + 扣费码（409 ASSET_INSUFFICIENT / DELETE_SCOPE_CHANGED 等由调用方按码分支）
    throw new ApiStatusError(err?.error?.message || err?.error || `请求失败 (${res.status})`, res.status, err);
  }
  return res.json();
}

/** 从 POST /people/ 响应提取 handle */
function handleOf(created: any): string {
  return Array.isArray(created) ? created[0]?.handle : created?.handle;
}

/** 称号等档案属性 → Gramps attribute_list 形状（type 必须是纯字符串，前端 fetchMasterTree 只认字符串） */
function toAttributeList(attrs?: Array<{ key: string; value: string }>): Array<{ type: string; value: string }> {
  return (attrs || [])
    .map((a) => ({ type: String(a.key || '').trim(), value: String(a.value ?? '').trim() }))
    .filter((a) => a.type && a.value);
}

/**
 * 为节点添加父节点（管理员）
 * - parent.handle 存在 → 复用已有节点；否则新建 person
 * - 当前节点必须尚无父家族
 * - 姓缺省 → 随子姓（父与子同姓），可由面板「改姓」显式覆盖
 * @param parent.gender 'M'|'F' 决定挂 father_handle / mother_handle
 */
export async function addParentNode(
  treeId: string,
  childHandle: string,
  parent: {
    handle?: string;
    name?: string;
    surname?: string;
    gender?: 'M' | 'F' | 'U';
    attributes?: Array<{ key: string; value: string }>;
  },
  token: string,
): Promise<{ ok: boolean; parent_handle: string }> {
  const raw = await fetchPersonForEdit(treeId, childHandle, token);
  if ((raw.parent_family_list || []).length > 0) {
    throw new Error('该节点已有父母记录，不可重复添加父节点');
  }
  let parentHandle = parent.handle;
  if (!parentHandle) {
    const created = await authedFetch(treeId, '/people/', 'POST', token, {
      primary_name: {
        first_name: parent.name || '',
        surname_list: [{ surname: parent.surname || '' }],
      },
      gender: parent.gender === 'F' ? 2 : parent.gender === 'M' ? 1 : 0,
      // 未显式改姓 → 随子姓（继承子节点所在家族之父姓，父不详取子本人姓）
      ...(parent.surname ? {} : { inherit_surname_from: childHandle }),
      attribute_list: toAttributeList(parent.attributes),
    });
    parentHandle = handleOf(created);
    if (!parentHandle) throw new Error('创建父节点失败');
  }
  const famBody: Record<string, any> = { child_ref_list: [{ ref: childHandle }] };
  if (parent.gender === 'F') famBody.mother_handle = parentHandle;
  else famBody.father_handle = parentHandle;
  await authedFetch(treeId, '/families/', 'POST', token, famBody);
  return { ok: true, parent_handle: parentHandle };
}

/**
 * 为节点添加子节点（管理员）→ 服务端 POST /admin/add-child 统一处理
 *
 * 服务端规则（docs/marriage.spec.md §7-4）：
 * - child.handle 存在 → 挂接已有节点；否则新建 person（姓缺省随父姓，后端按家族之父计算）
 * - 家庭里父（或父空缺时的母）是外树镜像节点 → 子女建到真身所在树，本树只留镜像子女
 *   （两侧经 updateTrees 一次事务写入，返回 cross_tree=true / landed_tree_id）
 * - 其余情况：复用本人第一个配偶家族追加子节点，没有则按性别新建 family
 */
export async function addChildNode(
  treeId: string,
  parentHandle: string,
  child: {
    handle?: string;
    name?: string;
    surname?: string;
    gender?: 'M' | 'F' | 'U';
    attributes?: Array<{ key: string; value: string }>;
    /**
     * 「承母嗣」特例：本族女性一旦婚配，其后代默认不进本树；勾选后随请求提交
     * `maternal_succession: true`，服务端校验放行并在详情文档写 `maternal_succession='true'`。
     */
    maternal_succession?: boolean;
  },
  token: string,
): Promise<{
  ok: boolean;
  child_handle: string;
  child_name: string;
  family_handle: string;
  mirror_handle: string;
  landed_tree_id: string;
  cross_tree: boolean;
  message: string;
}> {
  return authedFetch(treeId, '/admin/add-child', 'POST', token, {
    tree_id: treeId,
    person_handle: parentHandle,
    child_handle: child.handle || '',
    name: child.name || '',
    surname: child.surname || '',
    gender: child.gender || 'U',
    attributes: (child.attributes || []).filter((a) => a.key && a.value),
    maternal_succession: !!child.maternal_succession,
  });
}

/**
 * 总谱续编（chief_editor）：在中华世本源流链节点下续编第 N+1 世
 * - mode='new'：新建节点（name/surname/gender）并挂到链上
 * - mode='attach'：把总谱内已有节点（child_handle）挂接为链上第 N+1 世
 * 世数由服务端按父节点 external_chain_gen +1 计算，并写详情文档属性（时间轴据此排序）。
 */
export async function appendChainNode(
  treeId: string,
  parentHandle: string,
  input: {
    mode: 'new' | 'attach';
    name?: string;
    surname?: string;
    gender?: 'M' | 'F' | 'U';
    child_handle?: string;
    note?: string;
    /** 称号等档案属性（号/封号/谥号），随新建节点写入详情文档 */
    attributes?: Array<{ key: string; value: string }>;
  },
  token: string,
): Promise<{
  ok: boolean;
  child_handle: string;
  child_name: string;
  gen: number;
  siblings: Array<{ handle: string; name: string; gramps_id: string; gen: number }>;
  branch: boolean;
  message: string;
}> {
  return authedFetch(treeId, '/admin/chain-append', 'POST', token, {
    tree_id: treeId,
    parent_handle: parentHandle,
    ...input,
    attributes: (input.attributes || []).filter((a) => a.key && a.value),
  });
}

/**
 * 批量续编（chief_editor）：按「一条线单传」在父节点下**依次**续编最多 10 代
 *
 * 契约（已冻结，与后端 `/admin/chain-append-batch` 逐字对齐）：
 * - 入参 `{ tree_id, parent_handle, names }` —— **只传「名」**：姓统一随父姓继承，
 *   刻意不传 `surname`（批量录入不允许改姓；空串会被服务端当显式姓提交，故整个字段都不发）。
 * - 出参 `{ ok, start_gen, end_gen, count, added:[{handle,name,gramps_id,gen}], message }`；
 *   错误体沿用统一 `{ error }` 形状（由 authedFetch 抛 ApiStatusError）。
 * - 世数：第 1 个名字 = 父节点世数 + 1，其余依次 +1（服务端写入 `external_chain_gen`）。
 */
export async function appendChainBatch(
  treeId: string,
  parentHandle: string,
  names: string[],
  token: string,
): Promise<{
  ok: boolean;
  start_gen: number;
  end_gen: number;
  count: number;
  added: Array<{ handle: string; name: string; gramps_id: string; gen: number }>;
  message: string;
}> {
  return authedFetch(treeId, '/admin/chain-append-batch', 'POST', token, {
    tree_id: treeId,
    parent_handle: parentHandle,
    names,
  });
}

/**
 * 新建家族树（chief_editor）：写树 JSON + 始祖节点 + tree-meta 注册，并从发起人余额扣建树费
 * tree_id 由服务端生成（拼音_码点_两位序号），返回后可直接进入新树首页
 */
export async function createTree(
  input: {
    surname_char: string;
    founder_name: string;
    founder_gender?: 'M' | 'F' | 'U';
    display_title?: string;
    genealogy_name?: string;
    hall_name?: string;
    /** 发源地结构化真源：6 位行政区划代码（非空未知码 → 后端 400） */
    origin_code?: string;
    origin?: string;
    description?: string;
  },
  token: string,
): Promise<{
  ok: boolean;
  tree_id: string;
  founder_handle: string;
  founder_gramps_id: string;
  surname_char: string;
  display_title: string;
  message: string;
  /** 扣费回执（建树 = 9颗石榴籽，docs/economy.spec.md §5-5 / §5-8） */
  fee?: FeeInfo;
}> {
  // 建树发生在树存在之前，X-Tree-Id 留空（服务端该路由不依赖它）
  return authedFetch('', '/admin/create-tree', 'POST', token, input);
}

/**
 * 添加配偶（同树）：mode='new' 新建配偶节点 / mode='attach' 把树内已有节点设为配偶
 * 服务端规则：本人已有家族且对方槽位为空 → 补位；家族两槽已满 → 新建家族（再婚）
 */
export async function addSpouseNode(
  treeId: string,
  personHandle: string,
  input: {
    mode: 'new' | 'attach';
    name?: string;
    surname?: string;
    gender?: 'M' | 'F' | 'U';
    child_handle?: string;
    attributes?: Array<{ key: string; value: string }>;
  },
  token: string,
): Promise<{
  ok: boolean;
  spouse_handle: string;
  spouse_name: string;
  family_handle: string;
  filled_existing_family: boolean;
  message: string;
}> {
  return authedFetch(treeId, '/admin/add-spouse', 'POST', token, {
    tree_id: treeId,
    person_handle: personHandle,
    ...input,
    attributes: (input.attributes || []).filter((a) => a.key && a.value),
  });
}

// ---- 跨树嫁娶 / 改挂父节点（管理员） ----

/** 跨树嫁娶（docs/marriage.spec.md）：发起申请（嫁出/娶入/合离）→ 对方树审批后生效 */
export async function marriageRequest(
  treeId: string,
  input: {
    action: 'marry' | 'divorce';
    direction?: 'out' | 'in';
    person_handle: string;
    spouse_tree_id?: string;
    spouse_handle?: string;
    /**
     * 配偶引用（兜底通道）：全局编号（`000052` / `I000052`）/ handle / 树内旧号，
     * 后端 `resolveNode` **全站**解析（编号自带所属树，无需 spouse_tree_id）。
     * 与 `spouse_handle` 二者皆认、编号优先（前端填了编号时只传本字段）。
     */
    spouse_ref?: string;
    marriage_date?: string;
    end_date?: string;
    note?: string;
  },
  token: string,
): Promise<{ ok: boolean; request_id: string; status: string; to_tree: string; to_person_name: string }> {
  return authedFetch(treeId, '/marriage-request', 'POST', token, { tree_id: treeId, ...input });
}

/** 待审批的联姻/离异申请 */
export async function fetchMarriageRequests(
  treeId: string,
  token: string,
): Promise<{ list: any[]; can_approve_all: boolean; my_tree: string }> {
  return authedFetch(treeId, '/admin/marriage-requests', 'GET', token);
}

/** 目标树审批通过（同一事务内双侧写入）/ 驳回 */
export async function decideMarriageRequest(
  treeId: string,
  requestId: string,
  approve: boolean,
  token: string,
  reason = '',
): Promise<{ ok: boolean; status: string; result?: any }> {
  return authedFetch(treeId, approve ? '/admin/approve-marriage' : '/admin/reject-marriage', 'POST', token, {
    request_id: requestId,
    ...(approve ? {} : { reason }),
  });
}

/** 绝婚（男方主动解除，单方生效；需男方所在树写权） */
export async function marryEnd(
  treeId: string,
  input: { person_handle: string; end_date?: string; note?: string },
  token: string,
): Promise<{ ok: boolean; kind: string; result: any }> {
  return authedFetch(treeId, '/admin/marry-end', 'POST', token, { tree_id: treeId, ...input });
}

/**
 * 重新指定父节点（管理员）：newParentId 支持 I0101 / 0101 / handle 三种写法。
 * 服务端按新父节点性别决定槽位（女→母亲位），原父母家族清空则一并清理；
 * 总谱双方都在源流链上时，本人及链上下代的世数按 delta 平移。
 */
export async function reparentNode(
  treeId: string,
  personHandle: string,
  newParentId: string,
  token: string,
  targetTreeId = '',
): Promise<{
  ok: boolean;
  /** true = 新父编号属于别的家族树：本节点及其全部后代整体迁入该树 */
  cross_tree: boolean;
  person_name: string;
  parent_handle: string;
  parent_name: string;
  parent_gramps_id: string;
  family_handle: string;
  created_family: boolean;
  removed_family: boolean;
  chain_shift: { delta: number; affected: number } | null;
  /** 跨树迁移专用（cross_tree=false 时不返回） */
  target_tree_id?: string;
  /** 迁入人数（含本人与全部后代） */
  moved_people?: number;
  /** 随迁家族数 */
  moved_families?: number;
  /** 源 handle → 目标树重分配后的 gramps_id */
  gramps_id_map?: Record<string, string>;
  new_gramps_id?: string;
  meta_stats_refreshed?: boolean;
  message?: string;
  /** 扣费回执：同树改父 1 片 / 跨树迁移 9 片（与携带后代人数无关，docs/economy.spec.md §5-8） */
  fee?: FeeInfo;
}> {
  return authedFetch(treeId, '/admin/reparent', 'POST', token, {
    tree_id: treeId,
    person_handle: personHandle,
    new_parent_id: newParentId,
    // 非空 = 明确指定目标家族树（跨树迁移时用于消歧重号 / 直连目标树）
    ...(targetTreeId ? { new_parent_tree_id: targetTreeId } : {}),
  });
}

/**
 * 调整同胞排行（子女标签排序）：把某段 family 的 `child_handles[]` 重排为提交顺序。
 *
 * **一次提交只动一段 family**（多配偶家族分段排序，`family_handle` 必传）；1 片 / 次，
 * no-op（提交序与现状逐位相同，含拖回原位）由后端裁定 → `noop:true` + `fee.pieces:0`，不扣费不写库。
 * 错误分支：缺参 / 集合不等价 400，只读节点 403，余额不足 409（`ASSET_INSUFFICIENT`），
 * 系统级失败 500（通用文案 + `fee_refunded`）。
 */
export async function siblingReorder(
  treeId: string,
  payload: SiblingReorderPayload,
  token: string,
): Promise<SiblingReorderResult> {
  return authedFetch(treeId, '/admin/sibling-reorder', 'POST', token, {
    tree_id: treeId,
    family_handle: payload.family_handle,
    person_handle: payload.person_handle,
    child_handles: payload.child_handles,
  });
}

// ---- 删除节点（危险区，仅管理员） ----

/** 删除模式：subtree = 连本节点带全部后代（默认）；promote = 仅本节点，子女上提一级 */
export type NodeDeleteMode = 'subtree' | 'promote';

export interface NodeDeleteResult {
  ok: boolean;
  /** true = 只预演统计，未写任何数据 */
  dry_run: boolean;
  tree_id: string;
  mode: NodeDeleteMode;
  person_handle: string;
  person_name: string;
  /** 待删节点清单（dry_run 与正式提交同形） */
  people: Array<{ handle: string; name: string; gramps_id: string }>;
  people_count: number;
  families_count: number;
  /** promote 模式下被上提一级的子节点（0 人 = 配偶健在，子女留在原家族） */
  promoted_children: Array<{ handle: string; name: string; gramps_id: string }>;
  promoted_count: number;
  promoted_to_family: string;
  /** 其它家族树对本节点的引用（非空 → 后端 409 拒绝） */
  external_refs: any[];
  external_ref_count: number;
  /** 正式提交后才有 */
  deleted_people?: string[];
  removed_families?: string[];
  detail_removed?: number;
  /**
   * 扣费回执（dry_run 也返回，供前端拼确认文案）：
   * `pieces` = 待删人数 × 3（promote = 3）；`dry_run` 本身免费（docs/economy-fee.spec.md §3-1 #4–#6）。
   */
  fee?: FeeInfo;
  message: string;
}

/**
 * 删除节点（管理员，危险操作）。
 * - dry_run=true → 只返回统计（人数 / 家族数 / 上提清单 / 跨树引用）不写数据；
 * - 正式提交建议带 confirm_count（= dry_run 拿到的 people_count）：范围变了后端 409 拒写；
 * - 跨树引用 → 后端 409 拒绝，绝不级联改对方树。
 */
export async function deleteNode(
  treeId: string,
  personHandle: string,
  mode: NodeDeleteMode,
  token: string,
  opts: { dry_run?: boolean; confirm_count?: number } = {},
): Promise<NodeDeleteResult> {
  const body: Record<string, unknown> = {
    tree_id: treeId,
    person_handle: personHandle,
    mode,
  };
  if (opts.dry_run) body.dry_run = true;
  if (opts.confirm_count !== undefined && opts.confirm_count !== null) {
    body.confirm_count = opts.confirm_count;
  }
  return authedFetch(treeId, '/admin/delete-node', 'POST', token, body);
}

// ---- 始祖挂载（认祖 / 登记，docs/founder-attach.spec.md §9 始祖真源反转 · 变体 A） ----

/**
 * 只读文案常量（**与后端 `lib/founder-attach.js` 的文案常量逐字一致**）。
 * 裁定书 v1（2026-09-20）变体 A：`external_*` 一律指向**真身所在树**，镜像按
 * **方向无关只读不变量**（R3）判定 → 文案按 `external_tree` 的层级取用：
 * - `family`（家族树）→ `familyMirrorLockMessage(title)`（新方向：真身在家族树）
 * - `clan`（祖谱）→ `CLAN_FOUNDER_LOCK_MESSAGE`
 * - `master`（中华世本）→ `FOUNDER_LOCK_MESSAGE`
 * - `chain`（世系链镜像）→ `CHAIN_MIRROR_LOCK_MESSAGE`
 * - 孤儿镜像（镜像标记在、真身不可达）→ `ORPHAN_MIRROR_LOCK_MESSAGE`
 * 统一取值入口 = `business/cross-tree.ts` 的 `mirrorReadonlyViewOf`，页面不得自拼文案。
 */
export const FOUNDER_LOCK_MESSAGE = '始祖节点信息需在中华世本（总谱）中修改';
/** 真身在**祖谱**时的只读提示（后端 `CLAN_FOUNDER_LOCK_MESSAGE` 同字面） */
export const CLAN_FOUNDER_LOCK_MESSAGE = '始祖节点信息需在本姓祖谱中修改';
/** 世系链（chain）镜像的只读提示：真身在中华世本（后端 `CHAIN_MIRROR_LOCK_MESSAGE` 同字面） */
export const CHAIN_MIRROR_LOCK_MESSAGE = '该节点为上层（中华世本）镜像，需到总谱修改';
/** 孤儿镜像（历史脏数据：镜像标记在、真身不可达）只读提示（后端 `PLACEHOLDER_LOCK_MESSAGE` 同字面） */
export const ORPHAN_MIRROR_LOCK_MESSAGE = '该节点为孤儿镜像（真身不可达）：请先解除登记后在本树重建始祖信息';

/**
 * **向下**镜像（真身在家族树）的只读文案：`该节点为 <树标题> 始祖的镜像，需在 <树标题> 中修改`
 * （后端 `familyMirrorLockMessage` 同字面；<树标题> = 真身所在家族树 display_title）。
 */
export function familyMirrorLockMessage(treeTitle: string): string {
  const title = String(treeTitle || '').trim() || '该家族树';
  return `该节点为 ${title} 始祖的镜像，需在 ${title} 中修改`;
}

/** 层级标签（树/祖谱/世本），与后端 founder-attach.js kindLabel 一致 */
export function treeKindLabel(kind: string | undefined): string {
  if (kind === 'master') return '中华世本';
  if (kind === 'clan') return '祖谱';
  return '家族树';
}

/** 认祖目标（上层树 / 真身节点）选择项：祖谱清单条目（GET /admin/clans） */
export interface ClanSummary {
  tree_id: string;
  tree_title: string;
  /** 祖谱姓氏（汉字） */
  surname: string;
  master_tree_id: string;
  master_handle: string;
  master_name: string;
  /** 祖谱自有支系下端点（普通树认祖落点） */
  founder_handle: string;
  /** 是否已认祖世本（false = 顶端镜像段为空） */
  attached_to_master: boolean;
  /** 自有世代人数（不含顶端镜像段） */
  own_count: number;
  /** 顶端镜像段节点数 */
  mirror_count: number;
  total: number;
}

/** 真身节点上的挂载树条目（读侧推导，读侧无反指针） */
export interface FounderAttachment {
  tree_id: string;
  /** 挂载树的层级：clan=祖谱 / family=普通家族树 */
  kind?: string;
  tree_title: string;
  surname_char: string;
  founder_handle: string;
  founder_gramps_id: string;
  founder_name: string;
  master_handle: string;
  relation_note: string;
}

/** 待审批的认祖申请条目（jiazu_founder_requests，docs/founder-attach.spec.md §3-4） */
export interface FounderRequestItem {
  _id: string;
  tree_id: string;
  founder_handle: string;
  founder_gramps_id: string;
  founder_name: string;
  master_tree_id: string;
  master_handle: string;
  master_name: string;
  /** 目标层级：master=世本 / clan=祖谱 */
  target_kind?: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  note: string;
  reject_reason?: string;
  created_at: string;
  decided_at?: string;
  decided_by?: string;
}

/** 认祖申请（方式 A）：挂载树始祖 → 选上层树真身节点 → 提交，待上层树总编审批
 *  - 普通家族树：target_tree_id 必须是祖谱（kind='clan'，禁止直挂世本）
 *  - 祖谱：target_tree_id 为中华世本（缺省自动取 zhonghua）
 */
export async function founderRequest(
  treeId: string,
  input: { person_handle: string; master_handle: string; target_tree_id?: string; note?: string },
  token: string,
): Promise<{
  ok: boolean;
  request_id: string;
  status: string;
  master_tree_id: string;
  target_kind: string;
  master_name: string;
  message: string;
}> {
  return authedFetch(treeId, '/admin/founder-request', 'POST', token, { tree_id: treeId, ...input });
}

/**
 * 待审批的认祖申请（chief 看全部 / steward 看本树）；
 * 传 masterHandle 时同时返回该真身节点上的挂载家族树（真身档案显示【X 家族的始祖节点】用）
 */
export async function fetchFounderRequests(
  treeId: string,
  token: string,
  masterHandle = '',
): Promise<{
  list: FounderRequestItem[];
  can_approve_all: boolean;
  my_tree: string;
  attachments: FounderAttachment[];
  /** 祖谱清单（仅 chief_editor 有值；认祖目标选择器用） */
  clans: ClanSummary[];
}> {
  const qs = masterHandle ? `?master_handle=${encodeURIComponent(masterHandle)}` : '';
  return authedFetch(treeId, `/admin/founder-requests${qs}`, 'GET', token);
}

/** 认祖审批（zhonghua 侧 chief_editor）：通过 → 建立挂载；驳回 → 写理由，不改数据 */
export async function decideFounderRequest(
  treeId: string,
  requestId: string,
  approve: boolean,
  token: string,
  reason = '',
): Promise<{ ok: boolean; status: string; result?: any }> {
  return authedFetch(treeId, '/admin/decide-founder', 'POST', token, {
    request_id: requestId,
    approve,
    ...(approve ? {} : { reason }),
  });
}

/** 直接挂载（方式 B）：上层树总编辑在真身节点上选**下层树**挂载，无需申请
 *  - 普通家族树 → 只能挂到祖谱；祖谱 → 只能挂到中华世本（target_tree_id = 上层树）
 */
export async function attachFounder(
  treeId: string,
  input: { master_handle: string; tree_id: string; target_tree_id?: string; founder_handle?: string },
  token: string,
): Promise<{
  ok: boolean;
  tree_id: string;
  founder_handle?: string;
  founder_name?: string;
  master_handle?: string;
  master_name?: string;
  gen?: number | null;
  relation_note?: string;
  mirror_count?: number;
  message: string;
  [key: string]: any;
}> {
  return authedFetch(treeId, '/admin/attach-founder', 'POST', token, input);
}

/**
 * 解除始祖挂载（双方均可发起，无需申请，立即生效）
 * - 挂载树侧：传始祖节点 person_handle
 * - zhonghua 侧：传 master_handle（+ attached_tree_id 指定挂载树）
 * R2（docs/founder-attach.spec.md §9-3）：只清跨树登记指针与上层登记镜像，
 * **始祖真身数据（姓名 / 生卒 / 地点）与详情全部保留**（不再回到「空白占位」态），可重新认祖。
 */
export async function detachFounder(
  treeId: string,
  input: { person_handle?: string; master_handle?: string; attached_tree_id?: string },
  token: string,
): Promise<{ ok: boolean; tree_id: string; master_handle: string; placeholder: boolean; message: string }> {
  return authedFetch(treeId, '/admin/detach-founder', 'POST', token, { tree_id: treeId, ...input });
}

/**
 * 重置始祖：清空本树始祖登记（tree-meta 的 founder_handle / founder_gramps_id / founder_name
 * 删除 + founder_state='none'）→ 本树回到「无始祖」态，可在任意节点用「⛩ 认祖」重新指定。
 * 只写 tree-meta：始祖节点本身仍是可编辑的普通节点（树 JSON 不变）。
 * 拒绝：总谱（kind='master'）400；当前始祖为镜像 400（须先「解除挂载」）；树不存在 404。
 */
export async function resetFounder(
  treeId: string,
  input: { person_handle?: string } = {},
  token: string,
): Promise<{
  ok: boolean;
  tree_id: string;
  /** 重置后状态（固定 'none' = 本树暂无始祖） */
  founder_state: string;
  /** 被重置掉的始祖登记（供提示/审计） */
  previous: { founder_handle: string; founder_gramps_id: string; founder_name: string };
  message: string;
}> {
  return authedFetch(treeId, '/admin/reset-founder', 'POST', token, { tree_id: treeId, ...input });
}

// ---- 立支 / 汇宗（结构操作；docs/branch-clan-ops.spec.md §8 接口契约） ----
//      两条路由注册在 index.js 树编辑闸门（缺乏 X-Tree-Id）**之前**：树上下文取 body 的 tree_id，
//      **不依赖** X-Tree-Id（§13-14）→ 本封装不发送该 header。

/**
 * 结构操作写请求（POST /admin/*，Bearer 必填）。
 * 错误处理沿用本文件既有写法：非 2xx → 抽后端 `error` 原文抛 `ApiStatusError`
 * （`ASSET_INSUFFICIENT` 的 need / current / unit / how_to_get 随错误体带到 UI，§7 错误体约束）。
 */
async function structurePost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new ApiStatusError('请先登录后再进行编辑操作', 401);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiStatusError(err?.error || `请求失败 (${res.status})`, res.status, err);
  }
  return res.json() as Promise<T>;
}

/**
 * 【立支】（`POST /admin/establish-branch`，§6-1 / §8-1）：把本树普通节点 N 立为新家族树的始祖。
 * - 入参：`{ tree_id, person_handle }`（`person_handle` 支持全局编号 / handle，后端 `resolveNode` 解析）
 * - 出参：`EstablishBranchResult`（含 N 真身 `founder` 与 `fee`：默认 9999 颗石榴籽）
 * - 失败：401 未登录 / 403 非本树 tree_steward·chief_editor / 400 结构校验与跨树引用体检 /
 *   404 树或节点不存在 / 409 `ASSET_INSUFFICIENT`（**整单拒绝，绝不部分扣**）
 */
export async function postEstablishBranch(
  treeId: string,
  personHandle: string,
): Promise<EstablishBranchResult> {
  return structurePost<EstablishBranchResult>('/admin/establish-branch', {
    tree_id: treeId,
    person_handle: personHandle,
  });
}

/**
 * 【汇宗】（`POST /admin/converge-clan`，§6-2 / §8-2；**仅 chief_editor**）：
 * 把本树（源树）整体并入目标节点 X 之下，源树条目与树数据删除（原树不再存在）。
 * - 入参：`{ tree_id, target_person_id, confirm_people }`
 *   （`target_person_id` = 全局编号 / handle；`confirm_people` = 二次强确认里展示的将迁移人数）
 * - 出参：`ConvergeClanResult`（含 `spirit` 折损明细；目标树未镶嵌玉 → `skipped_reason`，**不是错误**）
 * - 失败：403 非总编 / 409 `DELETE_SCOPE_CHANGED`「汇宗范围已变化…请重新确认」（不写不扣）/ 409 跨树引用红线
 */
export async function postConvergeClan(
  treeId: string,
  targetPersonId: string,
  confirmPeople: number,
): Promise<ConvergeClanResult> {
  return structurePost<ConvergeClanResult>('/admin/converge-clan', {
    tree_id: treeId,
    target_person_id: targetPersonId,
    confirm_people: confirmPeople,
  });
}

// ---- 祖谱（Clan Tree，docs/clan-tree.spec.md） ----

export type TreeKind = 'master' | 'clan' | 'family';

/** 祖谱顶端镜像段节点（世本世系链镜像，本层只读） */
export interface ClanMirrorNode {
  handle: string;
  gramps_id: string;
  name: string;
  gender: string;
  /** founder=祖谱始祖 / chain=链路节点 */
  link_type: string;
  gen: number | null;
  relation_note: string;
  /** 真身所在上层树（'zhonghua'） */
  upper_tree_id: string;
  upper_handle: string;
}

/** 祖谱自有世代节点（真实数据，可编辑/续编） */
export interface ClanOwnNode {
  handle: string;
  gramps_id: string;
  name: string;
  gender: string;
  birth_date: string;
  death_date: string;
}

/** 支系入口：认本祖谱为祖的普通家族树 */
export interface ClanBranch {
  tree_id: string;
  kind: string;
  tree_title: string;
  person_count: number;
  surname_char?: string;
  founder_handle: string;
  founder_gramps_id: string;
  founder_name: string;
  master_handle: string;
  relation_note: string;
  /**
   * 入口推导来源（R4，docs/clan-tree.spec.md §11-3 / docs/branch-clan-ops.spec.md §16-1）：
   * - `'branch_register'` = 由宗谱**自有段**中指向该家族树始祖的**登记镜像**推导（一条登记 = 一个入口）；
   * - 缺省 = 由「该家族树始祖指针指向本祖谱」推导（认祖后的常规形态）。
   */
  via?: string;
}

/** 祖谱页面数据（三段版式数据源） */
export interface ClanInfo {
  ok: boolean;
  tree_id: string;
  kind: TreeKind;
  kind_label: string;
  title: string;
  genealogy_name: string;
  surname: string;
  /** 祖谱自有支系下端点 handle */
  founder_handle: string;
  master_tree_id: string;
  master_handle: string;
  master_name: string;
  /** 是否已认祖世本（false 时 notice = 「该祖谱未认祖世本」） */
  attached_to_master: boolean;
  notice: string;
  mirrors: ClanMirrorNode[];
  own: ClanOwnNode[];
  own_count: number;
  mirror_count: number;
  branch_count: number;
  branches: ClanBranch[];
}

/** 建谱申请条目（jiazu_clan_requests，docs/clan-tree.spec.md §4-4） */
export interface ClanRequestItem {
  _id: string;
  surname: string;
  tree_id: string;
  master_tree_id: string;
  master_handle: string;
  master_name: string;
  clan_title: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  note: string;
  reject_reason: string;
  decided_by: string;
  decided_at: string;
  created_at: string;
}

/** 读祖谱接口（无登录态要求）：解析后端 error 文案 */
async function clanGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.error || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** 祖谱清单（GET /admin/clans；可按姓过滤，认祖目标选择器用） */
export async function fetchClans(surname = ''): Promise<ClanSummary[]> {
  const qs = surname ? `?surname=${encodeURIComponent(surname)}` : '';
  const res = await clanGet<{ ok: boolean; list: ClanSummary[] }>(`/admin/clans${qs}`);
  return res.list || [];
}

/** 祖谱页面数据：顶端镜像链 / 自有世代 / 支系入口列表（GET /admin/clan-info） */
export async function fetchClanInfo(treeId: string): Promise<ClanInfo> {
  return clanGet<ClanInfo>(`/admin/clan-info?tree_id=${encodeURIComponent(treeId)}`);
}

/** 建谱申请（POST /admin/clan-request）：该姓现有树 steward/chief 发起 → chief_editor 审批 */
export async function submitClanRequest(
  input: { tree_id?: string; surname: string; master_handle: string; clan_title?: string; note?: string },
  token: string,
): Promise<{ ok: boolean; request_id: string; status: string; surname: string; master_name: string; message: string }> {
  const res = await fetch(`${API_BASE}/admin/clan-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.error || `提交建谱申请失败 (${res.status})`);
  }
  return res.json();
}

/** 待审批建谱申请（GET /admin/clan-requests）：chief 看全部，其余看本人发起/本树相关 */
export async function fetchClanRequests(
  token: string,
): Promise<{ ok: boolean; list: ClanRequestItem[]; can_approve_all: boolean; my_tree: string }> {
  const res = await fetch(`${API_BASE}/admin/clan-requests`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error(`获取建谱申请失败 (${res.status})`);
  return res.json();
}

/** 建谱审批（POST /admin/decide-clan，仅 chief_editor）：通过 → 建祖谱树；驳回 → 只写理由 */
export async function decideClanRequest(
  requestId: string,
  approve: boolean,
  token: string,
  reason = '',
  extra: { chain_depth?: number; founder_name?: string } = {},
): Promise<{ ok: boolean; status: string; result?: any }> {
  const res = await fetch(`${API_BASE}/admin/decide-clan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      request_id: requestId,
      approve,
      ...(approve ? extra : { reason }),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.error || `审批失败 (${res.status})`);
  }
  return res.json();
}

// ---- 搜索 ----

export async function searchPeople(
  params: SearchParams,
): Promise<SearchResult> {
  const { query, tree_id } = params;
  if (!tree_id) {
    throw new Error('搜索需要指定 tree_id（Gramps-Web 搜索按 tree 隔离）');
  }
  // 注意：搜索接口返回 [{handle, object: 完整person}]，person 数据在 object 字段
  const raw = await request<Array<RawPerson & { object?: RawPerson }>>(
    `/search/?query=${encodeURIComponent(query)}&profile=all&pagesize=20`,
    { treeId: tree_id },
  );
  return {
    tree_id,
    tree_title: tree_id,
    people: raw.map((r) => toPersonSummary((r.object || r) as RawPerson)),
    total: raw.length,
  };
}

/**
 * 跨树嫁娶候选（GET /search/marriage-candidates；需登录）。
 *
 * 为什么不用树内 `/search`：读路径的节点级分层按「发起人对目标树的关系」裁剪
 * （非成员只剩最古老 1 世）→ 对方树里适婚世代整段消失，**娶入时搜不到目标树中的女性节点**；
 * 本通道是白名单字段下的定点例外，只服务「跨树选配偶」这一场景。
 * 出参**恰五项**（handle / gramps_id / name / gender / is_living）—— 不含生卒、详情、`external_*`。
 */
export interface MarriageCandidate {
  handle: string;
  gramps_id: string;
  name: string;
  /** 'F' = 女 / 'M' = 男（性别未知的节点后端一律不列入） */
  gender: 'F' | 'M' | 'U' | string;
  is_living: boolean;
}

/**
 * 跨树嫁娶配偶候选（`GET /search/marriage-candidates`）。
 * - `tree_id` 走**查询参数**（通道注册在树编辑闸门之前，不依赖 X-Tree-Id header）；
 * - 必带登录 token：未登录 / 登录过期 → `ApiStatusError(status=401)`（**绝不静默降级 guest 档**）；
 * - `gender`：娶入传 'F'、嫁出传 'M'（性别未知的节点后端不列入）；
 * - 其它非 2xx → `ApiStatusError`（`message` = 后端错误文案，`status` = HTTP 码）。
 */
export async function searchMarriageCandidates(
  treeId: string,
  params: { query: string; gender?: 'F' | 'M'; limit?: number },
): Promise<{ tree_id: string; candidates: MarriageCandidate[]; total: number }> {
  const parts = [
    `query=${encodeURIComponent(params.query)}`,
    `tree_id=${encodeURIComponent(treeId)}`,
  ];
  if (params.gender) parts.push(`gender=${encodeURIComponent(params.gender)}`);
  if (params.limit) parts.push(`limit=${encodeURIComponent(String(params.limit))}`);
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/search/marriage-candidates?${parts.join('&')}`, { headers });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiStatusError(
      raw?.error?.message || raw?.error || `搜索失败 (${res.status})`,
      res.status,
      raw,
    );
  }
  // 出参兼容：{ candidates } / 裸数组
  const list = Array.isArray(raw) ? raw : raw?.candidates || [];
  return { tree_id: raw?.tree_id || treeId, candidates: list as MarriageCandidate[], total: raw?.total ?? list.length };
}

/** 全站搜索命中的人物条目（GET /search/global；跨全部家族树） */
export interface GlobalPersonHit {
  /** 所属家族树 tree_id */
  tree_id: string;
  /** 所属家族树名称 */
  tree_title: string;
  handle: string;
  gramps_id: string;
  name: string;
  gender: string;
  birth_date: string;
  death_date: string;
  /** 命中方式：id=按编号命中 / name=按姓名命中 */
  matched: 'id' | 'name';
  /**
   * true = 该条代表的是镜像（真身落在别树）、真身因节点级可见分层对当前访问者不可见
   * → 本条仍显示姓名/编号/所属树，但不可查看详情（前端点击只提示，不跳转）。
   * 后端未重启出参不含该字段时值为 undefined，一律按「非受限」处理。
   */
  restricted?: boolean;
}

/**
 * 全站搜索人物（跨家族树；姓名 / 编号）。
 * - 路由 `GET /search/global?query=&limit=`；**不发送 X-Tree-Id**（跨树检索）；
 * - 有登录 token 时携带 Authorization（读路径按登录态分档裁剪），无 token 即公开读；
 * - 非 2xx → throw（文案含状态码）。
 */
export async function searchPeopleGlobal(
  query: string,
  limit = 30,
): Promise<GlobalPersonHit[]> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(
    `${API_BASE}/search/global?query=${encodeURIComponent(query)}&limit=${limit}`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`全站搜索失败 (${res.status})`);
  }
  const raw = await res.json();
  // 出参兼容：裸数组 / { people } / { list } / { results }
  const list = Array.isArray(raw) ? raw : raw?.people || raw?.list || raw?.results || [];
  return list as GlobalPersonHit[];
}

// ---- 元数据 ----

let metaCache: TreeMeta | null = null;

export async function fetchTreeMeta(): Promise<TreeMeta> {
  if (metaCache) return metaCache;
  // tree-meta.json 由 uni-app 静态目录提供（src/static/）
  const response = await fetch('/static/tree-meta.json');
  if (response.ok) {
    metaCache = (await response.json()) as TreeMeta;
    return metaCache;
  }
  throw new Error('无法加载 tree-meta.json');
}

export function clearMetaCache(): void {
  metaCache = null;
}

/** 从 auth-server 读取 tree-meta（与 config/tree-meta.json 一致） */
export async function fetchTreeMetaRemote(): Promise<TreeMeta> {
  const res = await fetch(`${API_BASE}/tree-meta`);
  if (!res.ok) throw new Error(`读取元数据失败 (${res.status})`);
  return res.json();
}

/**
 * 更新 tree 元数据（家族名称/谱名/文献地址/堂号/发源地/简介；需 admin token）
 */
export async function updateTreeMeta(
  token: string,
  data: {
    tree_id: string;
    display_title?: string;
    genealogy_name?: string;
    archive_url?: string;
    hall_name?: string;
    /** 发源地结构化真源：6 位行政区划代码（非空未知码 → 后端 400） */
    origin_code?: string;
    /** 发源地展示串：legacy 旧数据**原样回传**即可；有码时后端以码反查结果覆盖（前端不拼串） */
    origin?: string;
    description?: string;
  },
): Promise<void> {
  const res = await fetch(`${API_BASE}/tree-meta`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `更新失败 (${res.status})`);
  }
  clearMetaCache();
}

/**
 * 家族树「发源地」候选（`GET /tree/origin-candidates`，需 `X-Tree-Id`；匿名可读）。
 *
 * 候选 = **始祖 + 其下 1–2 代（共三代）的全部节点**（含未填码的节点：`place_code === ''`）。
 * **始祖无法认定时后端返 200 + `founder:null` + `candidates:[]`（不报 400）** ⇒ 调用方据此提示不可指定。
 * 契约：docs/person-places.spec.md §6（C8′ ⑤）。
 */
export async function fetchOriginCandidates(
  treeId: string,
  token?: string,
): Promise<TreeOriginCandidates> {
  const headers: Record<string, string> = { 'X-Tree-Id': treeId };
  const t = token || getAuthToken();
  if (t) {
    headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetch(`${API_BASE}/tree/origin-candidates`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.error || `读取发源地候选失败 (${res.status})`);
  }
  return res.json();
}

/**
 * 指定家族树「发源地」（`POST /admin/set-tree-origin`；权限档与 `PUT /tree-meta` **完全一致** = chief_editor）。
 *
 * 入参 `{ tree_id, person_handle }` —— 把该树的发源地设为**被点选节点（始祖三代内）的出生地**；
 * 不做任何自动同步（原 C8「写时同步镜像」已作废，契约 C8′）。
 *
 * 失败面（后端逐字文案，调用方**原样展示、不得改编**）：
 * 404『未找到 tree: …』/ 404『树不存在: …』/ 400『该节点不属于本树』/
 * 400『本树无法认定始祖：…』/ 400『该节点不在本树始祖三代范围内（仅始祖及其下两代可作为发源地）』/
 * 400『该节点未填写出生地行政区划代码』/ 401『未登录或登录已过期』/ 403『需要总编辑权限』。
 */
export async function setTreeOrigin(
  token: string,
  data: { tree_id: string; person_handle: string },
): Promise<SetTreeOriginResult> {
  const res = await fetch(`${API_BASE}/admin/set-tree-origin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.error || `指定发源地失败 (${res.status})`);
  }
  clearMetaCache();
  return res.json();
}

// ---- 统计 ----

export async function fetchTreeStats(treeId: string): Promise<{
  person_count: number;
  family_count: number;
  media_count: number;
  event_count: number;
}> {
  try {
    const raw = await request<RawPerson[]>(`/people/?pagesize=1&profile=all`, { treeId });
    return { person_count: raw.length, family_count: 0, media_count: 0, event_count: 0 };
  } catch {
    return { person_count: 0, family_count: 0, media_count: 0, event_count: 0 };
  }
}

// ---- 四级资产：碎片 / 石榴籽 / 竹片 / 石榴籽玉（docs/economy.spec.md §3 / §6-1 / §6-2） ----

/**
 * 带 HTTP 状态码的接口错误：409「今日已签到」等分支按状态码判定，
 * 由调用方决定 toast 还是错误提示（不弹系统错误框）。
 * `code` / `need` / `current` / `howToGet` 为扣费闸门附加字段（docs/economy-fee.spec.md §6）：
 * 资产不足一律按 `err.code === 'ASSET_INSUFFICIENT'` 判定，中文文案只作兜底备份路径。
 */
export class ApiStatusError extends Error {
  readonly status: number;
  /** 业务错误码（如 ASSET_INSUFFICIENT / DELETE_SCOPE_CHANGED）；后端未带时为空串 */
  readonly code: string;
  /** 资产不足时的需求量（竹片论片 / 石榴籽论颗） */
  readonly need?: number;
  /** 资产不足时的当前可用量 */
  readonly current?: number;
  /** 计价单位（后端 `unit`：'seeds' / 'bamboos' / 立支的 'seed'）；后端未带时 undefined */
  readonly unit?: string;
  /** 「如何获得」四条清单（后端 how_to_get；缺失时调用方退回 asset-guide 的本地常量） */
  readonly howToGet?: string[];

  constructor(
    message: string,
    status: number,
    body?: { code?: string; need?: number; current?: number; unit?: string; how_to_get?: string[] },
  ) {
    super(message);
    this.name = 'ApiStatusError';
    this.status = status;
    this.code = body?.code || '';
    this.need = body?.need;
    this.current = body?.current;
    this.unit = body?.unit;
    this.howToGet = body?.how_to_get;
  }
}

/** 写路由扣费回执（响应新增字段 `fee`；docs/economy.spec.md §5-8 / §6-2） */
export interface FeeInfo {
  /** 计价单位：竹片（片）/ 石榴籽（颗） */
  unit: 'bamboos' | 'seeds';
  /** 本次消耗量 */
  pieces: number;
  /** 扣费前可用量 */
  balance: number;
  /** 扣费后可用量 */
  balance_after: number;
}

/** 资产接口请求（Bearer 必填；错误体 { error } 文案原样上抛） */
async function assetRequest<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new ApiStatusError('未登录或登录已过期', 401);
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiStatusError(err?.error || `请求失败 (${res.status})`, res.status, err);
  }
  return res.json() as Promise<T>;
}

/** 石榴籽批次（有效期 365 天；qty 以颗计） */
export interface SeedLot {
  id: string;
  qty: number;
  expires_at: string;
  source: string;
  created_at: string;
}

/** 竹片批次（有效期 365 天；qty 以片计，1 束 = 100 片） */
export interface BambooLot {
  id: string;
  qty: number;
  expires_at: string;
  source: string;
  created_at: string;
}

/** 石榴籽玉（expires_at = null 即永久；mounted_tree_id 存在即已镶嵌，镶嵌不可逆） */
export interface Jade {
  id: string;
  expires_at: string | null;
  created_at: string;
  source: string;
  mounted_tree_id?: string;
  /** 服务端 summarize 派生字段：expires_at === null（永久玉） */
  permanent?: boolean;
}

/** 流水资产变动量（正 = 入账，负 = 出账） */
export interface AssetDelta {
  fragments?: number;
  seeds?: number;
  bamboos?: number;
  jades?: number;
}

/** 资产流水（type 取值见 docs/economy.spec.md §4-6） */
export interface AssetTx {
  id: string;
  ts: string;
  type: string;
  delta: AssetDelta;
  fee_seeds?: number;
  ref?: { tree_id?: string; listing_id?: string; trade_id?: string; person_handle?: string };
  desc: string;
  operator?: string;
}

/** 即将过期批次项 */
export interface ExpiringAsset {
  asset: 'seed' | 'bamboo';
  lot_id: string;
  qty: number;
  expires_at: string;
  days_left: number;
}

/** 资产总览（GET /assets/summary） */
export interface AssetsSummary {
  /** 碎片：0-9，满 10 自动合成 1 颗石榴籽 */
  fragments: number;
  /** 碎片上限（服务端常量 FRAGMENT_CAP，当前为 9） */
  fragment_cap: number;
  /** 完整石榴籽总颗数 */
  seeds_total: number;
  /** 石榴籽批次数（seed_lots 的条数） */
  seed_lot_count: number;
  /** 竹片总片数 */
  bamboos_total_pieces: number;
  /** 竹片总片数折算的束数（1 束 = 100 片，向下取整） */
  bamboo_bundles: number;
  /** 竹片批次数（bamboo_lots 的条数） */
  bamboo_lot_count: number;
  /** 石榴籽玉总枚数（jades 的条数） */
  jades_total: number;
  jades: Jade[];
  seed_lots: SeedLot[];
  bamboo_lots: BambooLot[];
  expiring: ExpiringAsset[];
  /** 最近流水（服务端截断为最近 N 条，故不可用于推导签到日） */
  txs: AssetTx[];
  /** 最近一次签到的北京时间自然日 YYYY-MM-DD；从未签到为空串 */
  signin_date: string;
}

/** 签到结果（POST /assets/signin） */
export interface SigninResult {
  ok: boolean;
  fragments: number;
  /** 本次签到触发的自动合成颗数（0 = 未合成） */
  synthesized: number;
  seed_lot?: SeedLot | null;
  signin_date: string;
}

/** 资产总览（本人四类资产 + 最近流水；服务端先 sweep 惰性结算过期批次） */
export async function fetchAssetsSummary(): Promise<AssetsSummary> {
  return assetRequest<AssetsSummary>('/assets/summary');
}

/** 即将过期批次（days 默认 30 天；服务端同样先 sweep） */
export async function fetchAssetsExpiring(days = 30): Promise<ExpiringAsset[]> {
  const res = await assetRequest<{ items?: ExpiringAsset[] }>(`/assets/expiring?days=${days}`);
  return res.items || [];
}

/** 每日签到（每自然日 1 碎片；同自然日重复 → 409「今日已签到」） */
export async function postSignin(): Promise<SigninResult> {
  return assetRequest<SigninResult>('/assets/signin', 'POST');
}

// ---- 时流子域（家族专属空间：玉的合成 / 分解 / 镶嵌 + 玉露灵泽蓄能）
//      docs/spirit-domain.spec.md §5 / §6 / §7；路由清单见 docs/economy.spec.md（写接口清单）

/** 灵气四态（docs/spirit-domain.spec.md §4-1；无记录 = 未镶嵌，不在四态内 → 'none'） */
export type SpiritStatus = 'none' | 'inactive' | 'active' | 'buffer' | 'expired';

/** 蓄能五档位枚举（docs/spirit-domain.spec.md §6-2） */
export type SpiritPlan = 'daily' | 'monthly' | 'quarterly' | 'half_year' | 'yearly';

/**
 * 蓄能档位条目（GET /spirit 出参 `plans`，**数值单一真源**，前端不得硬编码）。
 * 字段兼容后端两种赠送写法：`gift_bundles`（束）或 `gift_bamboos`（片，1 束 = 100 片）。
 */
export interface SpiritPlanItem {
  plan: SpiritPlan;
  /** 档位中文名（后端下发；缺失时前端按 plan 兜底显示） */
  label?: string;
  /** 单次扣费籽数（= 档位实价，最终扣费标准） */
  seeds: number;
  /** 本次延长天数 */
  days: number;
  /** 常态赠送束数 */
  gift_bundles?: number;
  /** 赠送竹片数（片） */
  gift_bamboos?: number;
  /** 营销展示折扣口径（不参与计算） */
  discount?: number;
}

/** 灌注流水条目（jiazu_spirit.trees[tree_id].logs[] = SpiritLog；追加写、不可改） */
export interface SpiritLogItem {
  id: string;
  ts: string;
  /** 灌注者手机号 */
  phone: string;
  plan: SpiritPlan;
  seeds: number;
  days: number;
  /** 本次赠送竹片数（片；0 = 无赠送） */
  gift_bamboos: number;
  spirit_expires_at_after: string;
}

/** 已镶玉（凹槽占用真源；expires_at = null 表示永久玉） */
export interface SpiritJade {
  jade_id: string;
  mounted_at: string;
  expires_at: string | null;
}

/**
 * 已镶玉的**注入者**（`GET /spirit` 出参 `injector`；后端读侧反查，**不下发手机号**）。
 * 三态：对象 + `person_handle` 有值 → 可点档案链接；对象 + `person_handle === null` →
 * 注入者无本树节点；`injector === null` → 注入者信息不可考。
 */
export interface SpiritInjector {
  /** 展示名（昵称；昵称缺失时后端用脱敏手机号兜底，仍不含完整手机号） */
  nickname: string;
  /** 注入者在本树的锚点节点 handle；无锚点 / 锚点跨树 → null */
  person_handle: string | null;
}

/** 时流子域状态（GET /spirit?tree_id=<tree_id>） */
export interface SpiritInfo {
  tree_id: string;
  /** 树的层级：master / clan / family */
  kind?: string;
  /** 是否已镶嵌玉（false = 未开启时流子域，status 为 'none'） */
  mounted: boolean;
  status: SpiritStatus;
  spirit_expires_at: string | null;
  buffer_until: string | null;
  /** 出参计算字段：spirit_expires_at + 30 天（active 态提示用；不落库） */
  buffer_until_preview: string | null;
  /** 灵气剩余天数（≤0 按 0） */
  days_left: number;
  /** 缓冲期剩余天数 */
  buffer_days_left: number;
  jade: SpiritJade | null;
  /** 注入者（已镶玉区块展示；未镶嵌 / 反查不到 → null） */
  injector: SpiritInjector | null;
  /** 灌注流水（倒序最近 100 条；非成员/guest 为 []） */
  logs: SpiritLogItem[];
  logs_total: number;
  logs_visible: boolean;
  /** 流水不可见时的提示文案（后端下发；缺失时前端按登录态兜底） */
  logs_notice: string;
  /**
   * 状态文案两列结构（docs/spirit-domain.spec.md §4-6：主文案 / 副文案）。
   * 取值一律走 `stateTextPrimary` / `stateTextSecondary` 归一化——**不得当字符串直接渲染**
   * （对象出参直接渲染会显示 `[object Object]`）。
   */
  state_text: SpiritStateTextLike;
  /** 当前访问者是否可灌注（已登录 → true） */
  can_charge: boolean;
  activity?: { gift_enabled_plans?: string[] };
  /** 档位表（数值**单一真源**，前端不得硬编码；缺失/为空时按加载失败态处理） */
  plans?: SpiritPlanItem[];
  /** 家族树展示名（后端可能下发；缺失时前端回落 tree_id） */
  tree_title?: string;
}

/** 状态文案主/副两列（GET /spirit 出参 `state_text` 的形状，docs/spirit-domain.spec.md §4-6） */
export interface SpiritStateText {
  primary: string;
  secondary: string;
}

/** `state_text` 宽容类型：对象（现行出参）/ 字符串（过渡期旧数据）/ 缺失 */
export type SpiritStateTextLike = SpiritStateText | string | null | undefined;

/** 状态**主**文案归一化：对象取 `primary`、字符串原样返、缺失返空串 */
export function stateTextPrimary(s: SpiritStateTextLike): string {
  if (!s) return '';
  return typeof s === 'string' ? s : s.primary || '';
}

/** 状态**副**文案归一化：对象取 `secondary`；字符串（只有一段文案）与缺失一律返空串 */
export function stateTextSecondary(s: SpiritStateTextLike): string {
  if (!s || typeof s === 'string') return '';
  return s.secondary || '';
}

/** 灌注结果（POST /spirit/charge） */
export interface SpiritChargeResult {
  ok: boolean;
  tree_id: string;
  plan: SpiritPlan;
  seeds_deducted: number;
  days: number;
  spirit_expires_at: string;
  spirit_expires_at_before: string | null;
  status: SpiritStatus;
  gift_bamboos: number;
  gift_bundles: number;
  seeds_balance_after: number;
  message?: string;
}

/** 镶嵌结果（POST /spirit/mount-jade） */
export interface MountJadeResult {
  ok: boolean;
  tree_id: string;
  jade_id: string;
  mounted_at: string;
  jade_expires_at: string | null;
  status: SpiritStatus;
  spirit_expires_at: string | null;
}

/** 合成结果（POST /assets/synthesize-jade） */
export interface JadeSynthesizeResult {
  ok: boolean;
  jade_id: string;
  seeds_deducted: number;
  expires_at: string | null;
  permanent: boolean;
  seeds_used: Array<{ lot_id: string; qty: number; expires_at: string }>;
}

/** 分解结果（POST /assets/decompose-jade） */
export interface JadeDecomposeResult {
  ok: boolean;
  jade_id: string;
  seeds_returned: number;
  seed_expires_at: string;
  seed_lot_id: string;
}

/** 时流子域请求（POST）：Bearer 必填（401 复用既有文案）；错误体 { error } 原样上抛 */
async function spiritPost<T>(
  path: string,
  treeId: string,
  body: Record<string, unknown>,
  token = '',
): Promise<T> {
  const tk = token || getAuthToken();
  if (!tk) throw new ApiStatusError('请先登录后再进行编辑操作', 401);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tree-Id': treeId,
      Authorization: 'Bearer ' + tk,
    },
    body: JSON.stringify({ tree_id: treeId, ...body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiStatusError(err?.error || `请求失败 (${res.status})`, res.status, err);
  }
  return res.json() as Promise<T>;
}

/** 资产域写请求（POST /assets/*）：账号级，不带树参数；Bearer 必填 */
async function assetPostJson<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new ApiStatusError('请先登录后再进行编辑操作', 401);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiStatusError(err?.error || `请求失败 (${res.status})`, res.status, err);
  }
  return res.json() as Promise<T>;
}

/**
 * 读取时流子域状态（GET /spirit?tree_id=；**guest 亦可读摘要**，带登录态才有流水）。
 * 错误：400 缺少 tree_id / 404 家族树不存在（文案后端下发）。
 */
export async function fetchSpirit(treeId: string): Promise<SpiritInfo> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/spirit?tree_id=${encodeURIComponent(treeId)}`, {
    headers: {
      'X-Tree-Id': treeId,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiStatusError(err?.error || `请求失败 (${res.status})`, res.status, err);
  }
  return res.json() as Promise<SpiritInfo>;
}

/** 玉露灵泽蓄能（POST /spirit/charge）：任何已登录用户；籽不足 → 409 整单拒绝（文案含可用数） */
export async function postSpiritCharge(
  treeId: string,
  plan: SpiritPlan,
  token = '',
): Promise<SpiritChargeResult> {
  return spiritPost<SpiritChargeResult>('/spirit/charge', treeId, { plan }, token);
}

/** 镶嵌石榴籽玉（POST /spirit/mount-jade）：任何已登录用户；**不可逆**，凹槽永久占用 */
export async function postMountJade(
  treeId: string,
  jadeId: string,
  token = '',
): Promise<MountJadeResult> {
  return spiritPost<MountJadeResult>('/spirit/mount-jade', treeId, { jade_id: jadeId }, token);
}

/** 合成石榴籽玉（POST /assets/synthesize-jade）：固定消耗 999 颗；不足 → 409 整单拒绝不部分扣 */
export async function postSynthesizeJade(): Promise<JadeSynthesizeResult> {
  return assetPostJson<JadeSynthesizeResult>('/assets/synthesize-jade');
}

/** 分解石榴籽玉（POST /assets/decompose-jade）：**免费**，返还 999 颗籽（统一 365 天）；已镶嵌玉 → 409 */
export async function postDecomposeJade(jadeId: string): Promise<JadeDecomposeResult> {
  return assetPostJson<JadeDecomposeResult>('/assets/decompose-jade', { jade_id: jadeId });
}

// ---- 竹简市集 + 官方竹简限量发售
//      docs/economy-market.spec.md（§8 接口清单 / §9.3 封装）；路由与鉴权口径见 docs/economy.spec.md §6、§8
//      GET /market/listings = guest 可读；其余为账号级（Bearer 必填，不带树参数）

/** 挂单状态：`open` 可买可撤｜`sold` 已成交｜`cancelled` 已撤单｜`expired` 到期下架（K9） */
export type MarketListingStatus = 'open' | 'sold' | 'cancelled' | 'expired';

/**
 * 市集挂单（`jiazu_market.listings[]`）。
 * **与家族树无关（K7）**：不含任何家族树字段，挂单/买入均不校验家族树归属。
 */
export interface MarketListing {
  id: string;
  seller_phone: string;
  /** 束数（≥ 1 的整数） */
  bundles: number;
  /** 片数 = `bundles × 100`（1 束 = 100 片） */
  pieces: number;
  /** 标价（籽，整单总价；自由报价，平台不设最低/最高价） */
  price_seeds: number;
  status: MarketListingStatus;
  created_at: string;
  /** 挂单时限 = `created_at` + 7 天（`LISTING_TTL_DAYS`） */
  expires_at: string;
  sold_at?: string;
  buyer_phone?: string;
  /** 服务端派生的剩余时限（天，向上取整）；缺省时前端按 `expires_at` 现算 */
  days_left?: number;
}

/** 官方发售区数据（GET /market/listings 出参 `official`） */
export interface MarketOfficial {
  /** 官方售价（分）：990 = ¥9.90 / 束 */
  price_fen: number;
  /** 每日配额（束，初值 50，后台可配） */
  daily_stock: number;
  /** 今日剩余库存（束） */
  stock_left_today: number;
  /** 发售时点（'21:00'，CST） */
  release_at: string;
  /** 当日库存是否已惰性释放 */
  released: boolean;
}

/** 市集列表（GET /market/listings；默认只含 `status='open'` 挂单） */
export interface MarketListingsResult {
  listings: MarketListing[];
  official: MarketOfficial;
}

/** 我的资产概览（GET /market/my 出参 `assets`） */
export interface MarketMyAssets {
  /** 石榴籽可用量（颗） */
  seeds_available: number;
  /** 竹片可用量（片；已扣除 `status='open'` 挂单占用） */
  bamboo_available_pieces: number;
  /** 挂单锁定量（片） */
  bamboo_locked_pieces: number;
  /** 竹片批次明细（形态随后端出参；前端不依赖其内部字段） */
  lots?: BambooLot[];
}

/** 我的挂单 + 资产概览（GET /market/my；默认不含 `expired` 挂单） */
export interface MarketMyResult {
  listings: MarketListing[];
  assets: MarketMyAssets;
}

/** 挂单结果（POST /market/list） */
export interface MarketListResult {
  ok: boolean;
  listing_id: string;
  pieces: number;
  expires_at: string;
}

/** 成交结果（POST /market/buy；`fee_seeds = floor(price_seeds / 100)`，0 即免收） */
export interface MarketBuyResult {
  ok: boolean;
  trade_id: string;
  pieces: number;
  price_seeds: number;
  fee_seeds: number;
}

/** 官方购买结果（POST /market/official-buy） */
export interface OfficialBuyResult {
  ok: boolean;
  pieces: number;
  /** ¥ 钱包余额（分） */
  balance_cents: number;
  stock_left_today: number;
}

/** 市集挂单列表（**guest 可读**；`status` 缺省 `'open'`，`expired` 默认不出参，K9） */
export async function fetchMarketListings(status = 'open'): Promise<MarketListingsResult> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/market/listings?status=${encodeURIComponent(status)}`, {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiStatusError(err?.error || `请求失败 (${res.status})`, res.status, err);
  }
  return res.json() as Promise<MarketListingsResult>;
}

/** 我的挂单 + 资产概览（需登录；默认不展示 `expired` 挂单） */
export async function fetchMyListings(): Promise<MarketMyResult> {
  return assetRequest<MarketMyResult>('/market/my');
}

/** 挂单（POST /market/list）：`{ bundles, price_seeds }`；**入参无家族树字段（K7）** */
export async function postMarketList(bundles: number, priceSeeds: number): Promise<MarketListResult> {
  return assetPostJson<MarketListResult>('/market/list', { bundles, price_seeds: priceSeeds });
}

/** 撤单（POST /market/cancel）：仅 `open` 可撤；`expired` → 409「挂单已过期」 */
export async function postMarketCancel(listingId: string): Promise<{ ok: boolean }> {
  return assetPostJson<{ ok: boolean }>('/market/cancel', { listing_id: listingId });
}

/** 全量成交（POST /market/buy）：不支持部分成交；籽不足 409；买自己的挂单 400 */
export async function postMarketBuy(listingId: string): Promise<MarketBuyResult> {
  return assetPostJson<MarketBuyResult>('/market/buy', { listing_id: listingId });
}

/** 官方竹简购买（POST /market/official-buy）：¥9.90/束；21:00 前 / 售罄 / 余额不足 → 409 文案 */
export async function postOfficialBuy(bundles = 1): Promise<OfficialBuyResult> {
  return assetPostJson<OfficialBuyResult>('/market/official-buy', { bundles });
}

// ---- 站内信 / 消息中心（docs/economy-ops.spec.md §4；docs/economy.spec.md §6-1 / §6-2）
//      账号级路由（不带树参数），Bearer 必填

/** 站内信类型（总册「存储契约」枚举：资产到期 / 家族灵气三条 / 市集 / 系统） */
export type MessageType = 'expiring' | 'spirit' | 'market' | 'system';

/**
 * 站内信条目（`jiazu_messages.items[<手机号>][]`）。
 * `title` / `text` 为后端下发的**定稿文案**（M1–M4，docs/economy-ops.spec.md §6.2）：
 * 前端**逐字渲染**，不得改写、不得拼接、不得自行补标点。
 */
export interface MessageItem {
  id: string;
  type: MessageType;
  /** 短标题（定稿文案首段，不含【】） */
  title: string;
  /** 定稿文案逐字全文（含【】与标点） */
  text: string;
  created_at: string;
  read: boolean;
}

/** 站内信列表出参（GET /messages） */
export interface MessagesResult {
  items: MessageItem[];
  /** 未读条数（角标 / 「全部标为已读」显隐依据） */
  unread: number;
}

/** 标记已读出参（POST /messages/read） */
export interface MessagesReadResult {
  ok: boolean;
  unread: number;
}

/**
 * 站内信列表（GET /messages；按 `created_at` 倒序，每用户保留最近 200 条）。
 * 该入口同时是**预警惰性生成入口**：服务端先 `sweep(now)` 再按 `warned` 去重补当前请求人的预警。
 */
export async function fetchMessages(opts: { unread?: boolean } = {}): Promise<MessagesResult> {
  return assetRequest<MessagesResult>(`/messages${opts.unread ? '?unread=1' : ''}`);
}

/**
 * 标记已读（POST /messages/read）：`ids` 缺省 = **全部标为已读**；幂等；
 * 不属于本人的 id 由服务端忽略（不报错）。
 */
export async function postMessagesRead(ids?: string[]): Promise<MessagesReadResult> {
  return assetPostJson<MessagesReadResult>(
    '/messages/read',
    ids && ids.length ? { ids } : {},
  );
}

// ---- 运营后台 · 资产运维（docs/economy-ops.spec.md §5；仅 chief_editor，其余角色 403）

/** 运营审计日志条目（`jiazu_ops_logs.logs[]`；`delta` **保留符号**，负值原样记录） */
export interface OpsLog {
  id: string;
  ts: string;
  /** 操作人手机号（服务端取自 JWT，前端不可传） */
  operator: string;
  target_phone: string;
  delta: AssetDelta;
  /** 操作原因（`trim` 后非空；贡献依据已由服务端并入） */
  reason: string;
}

/** 资产变更请求体（POST /admin/assets/grant；`reason` 必填、`delta` 至少一项非 0） */
export interface GrantPayload {
  target_phone: string;
  delta: AssetDelta;
  reason: string;
  /** 贡献奖励依据（选填；服务端并入 `reason`，日志可见） */
  evidence?: string;
}

/** 资产变更回执摘要（POST /admin/assets/grant 出参 `summary`） */
export interface GrantSummary {
  fragments: number;
  seeds_total: number;
  bamboos_total_pieces: number;
  /** 玉的枚数 */
  jades: number;
  /** 本次审计日志 id（`jiazu_ops_logs`） */
  log_id: string;
  /** 发放后碎片满 10 即时合成的籽数（0 = 未触发） */
  synthesized?: number;
}

/** 资产变更结果（POST /admin/assets/grant） */
export interface GrantResult {
  ok: boolean;
  summary: GrantSummary;
}

/**
 * 目标账号资产快照（GET /admin/assets/user；与 `/assets/summary` 同形，主体由「本人」改为 `phone`）。
 * 玉清单的出参形态后端有两种登记口径（`jade_list` / `jades` 数组，或 `jades` 枚数）→ 一律用 `jadeListOf()` 归一化。
 */
export interface AdminAssetSnapshot {
  phone: string;
  fragments: number;
  seeds_total: number;
  bamboos_total_pieces: number;
  /** 玉：数组形态（同 `/assets/summary`）或枚数（旧登记口径） */
  jades: Jade[] | number;
  /** 玉枚数（数组 `jades` 之外的显式计数，后端可选下发） */
  jades_total?: number;
  seed_lots: SeedLot[];
  bamboo_lots: BambooLot[];
  /** 玉清单（§5.4 登记字段；与 `jades` 数组形态二者取一） */
  jade_list?: Jade[];
  signin_date: string;
}

/** 玉清单归一化（兼容 `jade_list` / `jades` 数组 / `jades` 枚数三种出参形态） */
export function jadeListOf(snapshot: AdminAssetSnapshot): Jade[] {
  if (Array.isArray(snapshot.jade_list)) return snapshot.jade_list;
  if (Array.isArray(snapshot.jades)) return snapshot.jades;
  return [];
}

/** 玉枚数归一化（同上，供总览数字展示） */
export function jadeCountOf(snapshot: AdminAssetSnapshot): number {
  if (typeof snapshot.jades_total === 'number') return snapshot.jades_total;
  if (typeof snapshot.jades === 'number') return snapshot.jades;
  return jadeListOf(snapshot).length;
}

/** 日志筛选（`phone` = 目标手机号、`operator` = 操作人手机号；`limit` 默认 50、上限 200） */
export interface OpsLogFilters {
  phone?: string;
  operator?: string;
  limit?: number;
}

/**
 * 资产变更（POST /admin/assets/grant；仅 chief_editor）。
 * 校验：手机号格式 / 用户存在 / `reason` 必填 / `delta` 非全 0 / 整数 / 负向不足 → **409「资产不足」整单拒绝**。
 */
export async function postAdminAssetsGrant(payload: GrantPayload): Promise<GrantResult> {
  return assetPostJson<GrantResult>('/admin/assets/grant', {
    target_phone: payload.target_phone,
    delta: payload.delta,
    reason: payload.reason,
    ...(payload.evidence ? { evidence: payload.evidence } : {}),
  });
}

/** 资产变动日志（GET /admin/assets/logs；`ts` 倒序，过滤可叠加，空集合返回 `[]`） */
export async function fetchAdminAssetsLogs(filters: OpsLogFilters = {}): Promise<OpsLog[]> {
  const qs: string[] = [];
  if (filters.phone) qs.push(`phone=${encodeURIComponent(filters.phone)}`);
  if (filters.operator) qs.push(`operator=${encodeURIComponent(filters.operator)}`);
  if (filters.limit) qs.push(`limit=${filters.limit}`);
  const res = await assetRequest<{ logs?: OpsLog[] }>(
    `/admin/assets/logs${qs.length ? `?${qs.join('&')}` : ''}`,
  );
  return res.logs || [];
}

/** 目标账号资产快照（GET /admin/assets/user；`phone` 必填；400 缺参 / 404 用户不存在） */
export async function fetchAdminAssetsUser(phone: string): Promise<AdminAssetSnapshot> {
  return assetRequest<AdminAssetSnapshot>(`/admin/assets/user?phone=${encodeURIComponent(phone)}`);
}

// ---- 账号注销（docs/economy-ops.spec.md §7；K10 定稿：存在 status='open' 挂单 → 409）

/** 注销路由（P4 新增；后端 `index.js` 已注册 `POST /account/delete`，且挂在树编辑闸门之前） */
const DELETE_ACCOUNT_PATH = '/account/delete';

/** 注销结果（`POST /account/delete`；`cleared` = 本次清空的四类资产留痕） */
export interface DeleteAccountResult {
  ok: boolean;
  phone: string;
  cleared: AssetDelta;
  /** `account_clear` 流水 id */
  tx_id: string;
  /** 保留的历史流水条数（清空但留痕） */
  txs_kept: number;
}

/**
 * 注销账号：清空本人碎片 / 石榴籽 / 竹片 / 玉（写一条 `account_clear` 流水留痕），**不可恢复**；
 * 历史审计（`jiazu_ops_logs`、钱包流水、历史 `Tx`）与 `jiazu_users` / `jiazu_anchors` 保留。
 * - 存在 `status='open'` 市集挂单 → 后端 **409「请先撤销未成交挂单」**（原文上抛，前端不改写）；
 * - 未登录 → 401。
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const token = getAuthToken();
  if (!token) throw new ApiStatusError('未登录或登录已过期', 401);
  const res = await fetch(`${API_BASE}${DELETE_ACCOUNT_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiStatusError(body?.error || `注销失败 (${res.status})`, res.status, body);
  }
  return body as DeleteAccountResult;
}
