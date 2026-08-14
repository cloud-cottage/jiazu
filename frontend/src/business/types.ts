/**
 * 业务类型定义
 */

/** tree-meta.json 的完整结构 */
export interface TreeMeta {
  _schema: string;
  _description: string;
  trees: Record<string, TreeEntry>;
}

/** 单个家族树的元配置 */
export interface TreeEntry {
  tree_id: string;
  path_alias: string;
  surname_char: string;
  display_title: string;
  /** 堂号（如「三让堂」），可选 */
  hall_name?: string;
  /** 堂号发源地 */
  origin: string;
  description: string;
  /** 是否中华世本总谱 */
  is_master?: boolean;
  enable_custom_domain: boolean;
  custom_domains?: string[];
  created_at?: string;
}

/** Gramps-Web 人物摘要（来自 API） */
export interface PersonSummary {
  handle: string;
  gramps_id: string;
  name: string;
  surname: string;
  birth_date?: string;
  death_date?: string;
  gender?: 'M' | 'F' | 'U';
  is_living: boolean;
  primary_parent_family?: string;
}

/** 人物详情 */
export interface PersonDetail extends PersonSummary {
  profiles: PersonProfile[];
  families: FamilyRef[];
  events: EventRef[];
  media: MediaRef[];
  citations: CitationRef[];
  notes: NoteRef[];
  attributes: CustomAttribute[];
}

export interface PersonProfile {
  handle: string;
  type: string;
  name: string;
  birth_ref?: string;
  death_ref?: string;
  is_living: boolean;
}

export interface FamilyRef {
  handle: string;
  gramps_id: string;
  type: string;
  father?: PersonSummary;
  mother?: PersonSummary;
  children: PersonSummary[];
}

export interface EventRef {
  handle: string;
  type: string;
  description: string;
  date: string;
  place: string;
}

export interface MediaRef {
  handle: string;
  description: string;
  mime_type: string;
  url: string;
  thumbnail_url?: string;
}

export interface CitationRef {
  handle: string;
  gramps_id: string;
  source_title: string;
  page: string;
  confidence: string;
}

export interface NoteRef {
  handle: string;
  type: string;
  text: string;
  format: string;
}

export interface CustomAttribute {
  key: string;
  value: string;
  type: string;
}

/** 搜索参数 */
export interface SearchParams {
  query: string;
  tree_id?: string; // undefined = 全局跨 tree 搜索
  page?: number;
  page_size?: number;
}

/** 搜索结果 */
export interface SearchResult {
  tree_id: string;
  tree_title: string;
  people: PersonSummary[];
  total: number;
}

/** 聚合首页卡片 */
export interface DigitalHallCard {
  tree_id: string;
  title: string;
  surname: string;
  origin: string;
  description: string;
  /** 是否中华世本总谱 */
  isMaster?: boolean;
  url: string;
  person_count?: number;
  cover_url?: string;
}
