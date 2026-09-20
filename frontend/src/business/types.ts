/**
 * 业务类型定义
 */

/** tree-meta.json 的完整结构 */
export interface TreeMeta {
  _schema: string;
  _description: string;
  /** 部署根域（如 jiapu100.com），用于拼接平台子域 URL */
  _root_domain?: string;
  trees: Record<string, TreeEntry>;
}

/** 单个家族树的元配置 */
export interface TreeEntry {
  tree_id: string;
  path_alias: string;
  surname_char: string;
  /** 家族名称（如「季氏费县白露村家族」） */
  display_title: string;
  /** 谱名：家谱/族谱/祖谱的名称（如「季氏家谱」） */
  genealogy_name?: string;
  /** 文献地址：线上网盘等史料归档 uri（管理员维护） */
  archive_url?: string;
  /** 堂号（如「三让堂」），可选 */
  hall_name?: string;
  /** 堂号发源地展示串（写时由后端按 `origin_code` 反查生成的软冗余；legacy 旧数据为原文） */
  origin: string;
  /** 发源地结构化真源：6 位行政区划代码（前端只提交本字段，展示串由后端写路径生成） */
  origin_code?: string;
  description: string;
  /** 是否中华世本总谱 */
  is_master?: boolean;
  /**
   * 层级（docs/clan-tree.spec.md §2）：master=中华世本 / clan=祖谱 / family=普通家族树；
   * 缺省按 family 兼容旧数据
   */
  kind?: 'master' | 'clan' | 'family';
  /** 祖谱姓氏（单个汉字，如「季」；旧字段 surname_char 亦可用） */
  surname?: string;
  /** 祖谱：所镜像的世本 tree_id（'zhonghua'） */
  master_tree_id?: string;
  /** 祖谱：始祖指向的世本节点 handle（link_type='founder' 的镜像） */
  master_handle?: string;
  /** 祖谱：始祖在世本中的姓名（展示用） */
  master_name?: string;
  /** 祖谱自有支系下端点 handle（各普通树认祖的落点） */
  founder_handle?: string;
  /** 普通家族树：所属祖谱 tree_id */
  clan_tree_id?: string;
  /** 普通家族树：始祖指向的祖谱节点 handle */
  clan_handle?: string;
  /** 始祖人物 gramps_id：世系图以始祖为唯一根构建（始祖节点即真实人物，可编辑） */
  founder_gramps_id?: string;
  /** 平台子域前缀：非空表示开通专属子域（如 "shiben" → https://shiben.jiapu100.com） */
  subdomain?: string;
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
  /** 称号串（封号·谥号·号，按「封号→谥号→号」顺序拼接；无称号则空串） */
  titles?: string;
  primary_parent_family?: string;
  /** 跨树链接：目标家族树 id（分迁占位 / 出嫁） */
  external_tree?: string;
  /** 跨树链接：目标树内人物 handle（出嫁/登记始祖） */
  external_person_handle?: string;
  /** 跨树链接类型：branch=分迁占位 / marriage=出嫁 / founder=登记始祖 */
  external_link_type?: string;
  /** 外树镜像节点标记（嫁娶生成：对方在本树中的代表），'true' = 镜像 */
  external_mirror?: string;
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
  /** 层级（master=世本 / clan=祖谱 / family=普通家族树；缺省按 family 兼容） */
  kind?: string;
  url: string;
  person_count?: number;
  cover_url?: string;
}

// ---- 立支 / 汇宗（结构操作；docs/branch-clan-ops.spec.md §8 接口契约） ----

/**
 * 【立支】出参（`POST /admin/establish-branch`，规格 §8-1）。
 *
 * `fee` 形状**逐字照 §8-1**：`{ unit: 'seed', amount, balance_after }`
 * —— 与总册 `FeeInfo`（`{ unit:'bamboos'|'seeds', pieces, balance, balance_after }`）**不同形**，
 * 该差异已在规格 §13-18 登记。
 */
export interface EstablishBranchResult {
  ok: boolean;
  /** 原树 tree_id（始祖改为 N，树本身保留） */
  original_tree_id: string;
  /** 新建家族树 tree_id（唯一节点 = N 的始祖镜像） */
  new_tree_id: string;
  /** 上移链节点数（N 的父 → … → 本树始祖，不含被丢弃的始祖镜像） */
  moved_ancestors: number;
  /** 随迁家族数 */
  moved_families: number;
  /** **N 的真身**标识（新树侧始祖镜像另铸 handle / gramps_id，不在本字段内） */
  founder: { handle: string; gramps_id: string; name: string };
  /** 立支扣费回执（默认 9999 颗石榴籽；从发起人个人资产 FIFO 整单扣） */
  fee: { unit: 'seed'; amount: number; balance_after: number };
}

/** 【汇宗】灵气折损明细（`ConvergeClanResult.spirit`，规格 §6-2-7 / §8-2） */
export interface ConvergeSpiritTransfer {
  /** 本次生效的折损比例（`jiazu_wallets.config.converge_spirit_ratio`，默认 0.5） */
  ratio: number;
  /** 源树灵气剩余天数（无记录 / 已过 → 0） */
  source_days_left: number;
  /** 折损后并入目标树的天数（`ceil(source_days_left × ratio)`） */
  transferred_days: number;
  /** 并入后目标树灵气到期时刻（未并入时 = 目标树原值 / null） */
  target_spirit_expires_at: string | null;
  /** 未并入时的原因（目标树未镶嵌玉 / 源树未镶嵌玉）；非空**不是错误** */
  skipped_reason?: string;
}

/**
 * 【汇宗】出参（`POST /admin/converge-clan`，规格 §8-2）。
 * 源树基础信息与树数据已被删除（**原树不再存在**）；源树已镶嵌玉随树作废，不返还、不可重镶。
 */
export interface ConvergeClanResult {
  ok: boolean;
  source_tree_id: string;
  target_tree_id: string;
  /** 解析后的目标节点 X 的 handle */
  target_handle: string;
  /** 迁移的真实节点数（镜像节点不计入） */
  moved_people: number;
  /** 迁移的家族记录数 */
  moved_families: number;
  spirit: ConvergeSpiritTransfer;
}
