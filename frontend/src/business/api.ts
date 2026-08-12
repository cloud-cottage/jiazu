/**
 * Gramps-Web REST API 封装
 * 所有家族数据请求统一走此模块
 */

import type {
  PersonDetail,
  PersonSummary,
  SearchParams,
  SearchResult,
  TreeMeta,
} from './types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ---- 人物 ----

export function fetchPerson(treeId: string, handle: string): Promise<PersonDetail> {
  return request<PersonDetail>(`/trees/${treeId}/people/${handle}`);
}

export function fetchPersonList(
  treeId: string,
  page = 1,
  pageSize = 50,
): Promise<{ data: PersonSummary[]; total: number }> {
  return request(`/trees/${treeId}/people?page=${page}&page_size=${pageSize}`);
}

// ---- 搜索 ----

export function searchPeople(
  params: SearchParams,
): Promise<SearchResult> {
  const { query, tree_id, page = 1, page_size = 20 } = params;
  const treeParam = tree_id ? `&tree_id=${tree_id}` : '';
  return request<SearchResult>(
    `/search/people?query=${encodeURIComponent(query)}${treeParam}&page=${page}&page_size=${page_size}`,
  );
}

// ---- 元数据 ----

let metaCache: TreeMeta | null = null;

export async function fetchTreeMeta(): Promise<TreeMeta> {
  if (metaCache) return metaCache;
  metaCache = await request<TreeMeta>('/meta/trees');
  return metaCache;
}

export function clearMetaCache(): void {
  metaCache = null;
}

// ---- 统计 ----

export function fetchTreeStats(treeId: string): Promise<{
  person_count: number;
  family_count: number;
  media_count: number;
  event_count: number;
}> {
  return request(`/trees/${treeId}/stats`);
}
