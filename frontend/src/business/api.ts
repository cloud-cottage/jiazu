/**
 * Gramps-Web REST API 客户端
 *
 * 认证机制（来自官方源码确认）:
 * - POST /api/token/ {username, password} → {access_token}
 * - 所有请求带 Authorization: Bearer <token>
 * - tree 通过 JWT 中的 tree claim 指定，不在 URL 传
 * - 每个家族树对应一个只读访客账号（管理员在后台创建，role=0）
 *
 * 访客凭据配置: config/tree-api.json（tree_id → {username, password}）
 */

import type {
  PersonDetail,
  PersonSummary,
  SearchParams,
  SearchResult,
  TreeMeta,
} from './types';

// API 基础路径（H5 dev 走 Vite 代理；生产走 Nginx /api）
const API_BASE = '/api';

// ---- 凭据管理 ----

export interface TreeApiCredential {
  username: string;
  password: string;
}

let credentials: Record<string, TreeApiCredential> = {};
let tokenCache: Record<string, { token: string; expiresAt: number }> = {};

/**
 * 设置 tree 访客凭据（应用启动时从 config/tree-api.json 加载）
 */
export function configureCredentials(creds: Record<string, TreeApiCredential>): void {
  credentials = creds;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; treeId?: string } = {},
): Promise<T> {
  const { method = 'GET', body, treeId } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // 需要 tree 作用域的请求：先确保有该 tree 的 token
  if (treeId) {
    const token = await ensureToken(treeId);
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

/** 登录获取 token（带 15 分钟缓存，JWT 有效期 15 分钟） */
async function login(treeId: string): Promise<string> {
  const cred = credentials[treeId];
  if (!cred) {
    throw new Error(`未配置 tree ${treeId} 的访客凭据 (config/tree-api.json)`);
  }
  const res = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cred.username, password: cred.password }),
  });
  if (!res.ok) {
    throw new Error(`登录失败 (${res.status})`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** 确保有有效的 token（缓存 + 过期刷新） */
async function ensureToken(treeId: string): Promise<string> {
  const cached = tokenCache[treeId];
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }
  const token = await login(treeId);
  tokenCache[treeId] = {
    token,
    // JWT 有效期 15 分钟，提前 1 分钟刷新
    expiresAt: Date.now() + 14 * 60 * 1000,
  };
  return token;
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
  const raw = await request<RawPerson>(`/people/${handle}/?profile=all`, {
    treeId,
  });
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
  page = 1,
  pageSize = 50,
): Promise<{ data: PersonSummary[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const raw = await request<RawPerson[]>(
    `/people/?profile=all&pagesize=${pageSize}&start=${offset}`,
    { treeId },
  );
  return {
    data: raw.map(toPersonSummary),
    total: raw.length,
  };
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

// ---- 统计 ----

export async function fetchTreeStats(treeId: string): Promise<{
  person_count: number;
  family_count: number;
  media_count: number;
  event_count: number;
}> {
  try {
    const raw = await request<RawPerson[]>(
      `/people/?pagesize=1&profile=all`,
      { treeId },
    );
    return { person_count: raw.length, family_count: 0, media_count: 0, event_count: 0 };
  } catch {
    return { person_count: 0, family_count: 0, media_count: 0, event_count: 0 };
  }
}
