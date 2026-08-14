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

import type {
  PersonDetail,
  PersonSummary,
  SearchParams,
  SearchResult,
  TreeMeta,
} from './types';

// API 基础路径（Vite 代理 → auth-server）
const API_BASE = '/api';
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
  attribute_list?: Array<{ type: string; value: string }>;
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
  };
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

function toPersonSummary(raw: RawPerson): PersonSummary {
  const { birth, death } = parseDates(raw);
  return {
    handle: raw.handle,
    gramps_id: raw.gramps_id,
    name: parsePersonName(raw),
    surname: raw.primary_name?.surname_list?.find((s) => s.primary)?.surname || '',
    birth_date: birth,
    death_date: death,
    gender: genderToString(raw.gender),
    is_living: !death,
  };
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
    families: [],
    events: [],
    media: [],
    citations: [],
    notes: [],
    attributes:
      raw.extended?.attributes?.map((a) => ({ key: a.type, value: a.value, type: a.type })) ||
      [],
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
    headers: { 'X-Tree-Id': 'zhonghua_shiben_01' },
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

// ---- 搜索 ----

export async function searchPeople(
  params: SearchParams,
): Promise<SearchResult> {
  const { query, tree_id } = params;
  if (!tree_id) {
    throw new Error('搜索需要指定 tree_id（Gramps-Web 搜索按 tree 隔离）');
  }
  const raw = await request<RawPerson[]>(
    `/search/?query=${encodeURIComponent(query)}&profile=all&pagesize=20`,
    { treeId: tree_id },
  );
  return {
    tree_id,
    tree_title: tree_id,
    people: raw.map(toPersonSummary),
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
 * 更新 tree 元数据（堂号/发源地/简介；需 admin token）
 */
export async function updateTreeMeta(
  token: string,
  data: {
    tree_id: string;
    display_title?: string;
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
