/**
 * Gramps-Web REST API 客户端
 *
 * 认证架构（v2 — auth-server 代理模式）:
 * - 所有 /api/* 请求经 auth-server (端口 3000) 代理到 Gramps-Web
 * - auth-server 持有 Gramps 访客凭据并自动注入，前端不接触
 * - 手机号验证码登录走 /api/auth/*（auth-server 处理）
 *
 * dev 模式: Vite 代理 /api → localhost:3000 (auth-server) → localhost:8000 (Gramps)
 */

import { getAuthToken } from './auth';
import { TITLE_DISPLAY_ORDER } from './format';
import type {
  PersonDetail,
  PersonSummary,
  SearchParams,
  SearchResult,
  TreeMeta,
  FamilyRef,
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
      birth?: { date?: string; place?: string };
      death?: { date?: string; place?: string };
      name_given?: string;
      name_surname?: string;
    };
  };
  profile?: {
    birth?: { date?: string; place?: string };
    death?: { date?: string; place?: string };
    families?: ProfileFamily[];
    primary_parent_family?: ProfileFamily;
  };
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
  return {
    ...summary,
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

// ---- 钱包（余额/充值/转账/建树费） ----

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

/** 转账到家族树（仅入账） */
export async function transferToTree(
  token: string,
  treeId: string,
  amount: number,
): Promise<{ ok: boolean; user_balance_yuan: string; tree_balance_yuan: string }> {
  const res = await fetch(`${API_BASE}/wallet/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tree_id: treeId, amount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `转账失败 (${res.status})`);
  }
  return res.json();
}

/** 查询家族树余额（公开） */
export async function fetchTreeBalance(
  treeId: string,
): Promise<{ tree_id: string; balance_yuan: string }> {
  const res = await fetch(`${API_BASE}/wallet/tree-balance?tree_id=${treeId}`);
  if (!res.ok) throw new Error(`查询树余额失败 (${res.status})`);
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
 * 保存人物（PUT 完整对象，需登录）
 * 注：Gramps-Web 的 ETag 是响应 hash（非对象 hash），If-Match 永远不匹配，
 * 故不使用乐观锁，直接 PUT。
 */
export async function savePerson(
  treeId: string,
  handle: string,
  person: any,
  token: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/people/${handle}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Tree-Id': treeId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(person),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `保存失败 (${res.status})`);
  }
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
  person_count: number;
  explicit: boolean;
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

/** 晋宗：把节点以上祖先并入中华世本（指定挂接点，仅 chief_editor） */
export interface PromoteResult {
  ok: boolean;
  treeId: string;
  nodeHandle: string;
  nodeName: string;
  movedPeople: number;
  movedFamilies: number;
  attach: { handle: string; name: string; gen: number };
  chainGens: string;
  masterNode: { handle: string; name: string };
  message: string;
}
export async function promoteTree(
  token: string,
  data: { tree_id: string; node_handle: string; attach_handle: string },
): Promise<PromoteResult> {
  const res = await fetch(`${API_BASE}/admin/promote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `晋宗失败 (${res.status})`);
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
    throw new Error(err?.error?.message || err?.error || `请求失败 (${res.status})`);
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
}> {
  return authedFetch(treeId, '/admin/reparent', 'POST', token, {
    tree_id: treeId,
    person_handle: personHandle,
    new_parent_id: newParentId,
    // 非空 = 明确指定目标家族树（跨树迁移时用于消歧重号 / 直连目标树）
    ...(targetTreeId ? { new_parent_tree_id: targetTreeId } : {}),
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

// ---- 始祖挂载（认祖 / Founders Attach，docs/founder-attach.spec.md） ----

/** 始祖镜像/占位节点的只读提示（后端 403 同一文案） */
export const FOUNDER_LOCK_MESSAGE = '始祖节点信息需在中华世本（总谱）中修改';

/** 层级标签（树/宗谱/世本），与后端 founder-attach.js kindLabel 一致 */
export function treeKindLabel(kind: string | undefined): string {
  if (kind === 'master') return '中华世本';
  if (kind === 'clan') return '宗谱';
  return '家族树';
}

/** 认祖目标（上层树 / 真身节点）选择项：宗谱清单条目（GET /admin/clans） */
export interface ClanSummary {
  tree_id: string;
  tree_title: string;
  /** 宗谱姓氏（汉字） */
  surname: string;
  master_tree_id: string;
  master_handle: string;
  master_name: string;
  /** 宗谱自有支系下端点（普通树认祖落点） */
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
  /** 挂载树的层级：clan=宗谱 / family=普通家族树 */
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
  /** 目标层级：master=世本 / clan=宗谱 */
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
 *  - 普通家族树：target_tree_id 必须是宗谱（kind='clan'，禁止直挂世本）
 *  - 宗谱：target_tree_id 为中华世本（缺省自动取 zhonghua）
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
  /** 宗谱清单（仅 chief_editor 有值；认祖目标选择器用） */
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
 *  - 普通家族树 → 只能挂到宗谱；宗谱 → 只能挂到中华世本（target_tree_id = 上层树）
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
 * 始祖节点回到空白占位态（保留 I0001 位置），可重新认祖。
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

// ---- 宗谱（Clan Tree，docs/clan-tree.spec.md） ----

export type TreeKind = 'master' | 'clan' | 'family';

/** 宗谱顶端镜像段节点（世本世系链镜像，本层只读） */
export interface ClanMirrorNode {
  handle: string;
  gramps_id: string;
  name: string;
  gender: string;
  /** founder=宗谱始祖 / chain=链路节点 */
  link_type: string;
  gen: number | null;
  relation_note: string;
  /** 真身所在上层树（'zhonghua'） */
  upper_tree_id: string;
  upper_handle: string;
}

/** 宗谱自有世代节点（真实数据，可编辑/续编） */
export interface ClanOwnNode {
  handle: string;
  gramps_id: string;
  name: string;
  gender: string;
  birth_date: string;
  death_date: string;
}

/** 支系入口：认本宗谱为祖的普通家族树 */
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
}

/** 宗谱页面数据（三段版式数据源） */
export interface ClanInfo {
  ok: boolean;
  tree_id: string;
  kind: TreeKind;
  kind_label: string;
  title: string;
  genealogy_name: string;
  surname: string;
  /** 宗谱自有支系下端点 handle */
  founder_handle: string;
  master_tree_id: string;
  master_handle: string;
  master_name: string;
  /** 是否已认祖世本（false 时 notice = 「该宗谱未认祖世本」） */
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

/** 读宗谱接口（无登录态要求）：解析后端 error 文案 */
async function clanGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.error || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** 宗谱清单（GET /admin/clans；可按姓过滤，认祖目标选择器用） */
export async function fetchClans(surname = ''): Promise<ClanSummary[]> {
  const qs = surname ? `?surname=${encodeURIComponent(surname)}` : '';
  const res = await clanGet<{ ok: boolean; list: ClanSummary[] }>(`/admin/clans${qs}`);
  return res.list || [];
}

/** 宗谱页面数据：顶端镜像链 / 自有世代 / 支系入口列表（GET /admin/clan-info） */
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

/** 建谱审批（POST /admin/decide-clan，仅 chief_editor）：通过 → 建宗谱树；驳回 → 只写理由 */
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
