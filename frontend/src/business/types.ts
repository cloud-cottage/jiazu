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
  /**
   * 始祖态（R2b，docs/founder-attach.spec.md §9-4）：`'none'` = **无始祖态**
   * （重置始祖后 / 从未指定 → 该树任意节点可发起认祖，认祖即指定始祖）；
   * **有始祖时该字段被后端删除**（缺省 = 有始祖）。
   */
  founder_state?: 'none';
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

/**
 * 出生地 / 居住地：**提交形状**（契约 v2）。
 * `{ origin_code, note }` —— 前端只提交结构化码 + 备注；展示串由后端写路径按码反查生成
 * （真源 `cloudfunctions/compat-api/lib/geo.js`），前端**不得**自己拼展示串落库。
 */
export interface PersonPlaceInput {
  /** 6 位行政区划代码（空串 = 未选定；只选到省 / 市亦合法） */
  origin_code: string;
  /** 细节补充（界面文案「备注」；无码的历史自由文本亦落此字段） */
  note: string;
}

/**
 * 出生地 / 居住地：**读响应派生形状**（后端派生，前端只读展示）。
 * `place` 是码反查后的展示串（空码 → 空串），`place_note` 是备注。
 */
export interface PersonPlaceView {
  /** 码反查后的展示串（空码 → `''`） */
  place: string;
  /** 结构化码真源（编辑回填用；空串 = 无码） */
  place_code: string;
  /** 备注（无码旧数据的正文也落此字段 → 建档回显不丢） */
  place_note: string;
}

/** 读响应里 `profile.birth` / `profile.death` 的生卒形状（含派生地点字段） */
export interface ProfileLifespanView {
  date?: string;
  /** 码反查后的展示串（空码 → `''`） */
  place?: string;
  place_code?: string;
  place_note?: string;
}

/** 人物详情 */
export interface PersonDetail extends PersonSummary {
  /** 出生地（读响应派生形状；无数据 → `undefined`） */
  birth_place?: PersonPlaceView;
  /** 居住地（多条，顺序即展示顺序；无数据 → `[]`） */
  residence_places?: PersonPlaceView[];
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

// ---- 家族树「发源地」人工指定（契约 v2 C8′；docs/person-places.spec.md §6） ----

/**
 * 发源地候选节点（`GET /tree/origin-candidates` 的 `candidates[]`）。
 *
 * `birth_place` 为**读响应派生形状**（与出生地 / 居住地读形状同形，前端只读、不提交）：
 * `place` = 码反查后的展示串（空码 → `''`）、`place_code` = 结构化码真源
 * （**空串 = 该节点未填码 ⇒ 界面置灰不可选**）、`place_note` = 备注。
 */
export interface TreeOriginCandidate {
  handle: string;
  gramps_id: string;
  name: string;
  /** 世代：1=始祖 / 2=子代 / 3=孙代（可选范围 = 始祖及其下 1–2 代，共三代） */
  generation: number;
  birth_place: {
    place: string;
    place_code: string;
    place_note: string;
  };
  /** 当前生效的发源地是否由该节点贡献（出生地码 == tree-meta 现行 `origin_code`） */
  is_current: boolean;
}

/**
 * 发源地候选读响应（`GET /tree/origin-candidates`，需 `X-Tree-Id`）。
 * **始祖无法认定时后端返 200 + `founder:null` + `candidates:[]`（不报 400）**，界面据此给可读提示。
 */
export interface TreeOriginCandidates {
  tree_id: string;
  /** 始祖（无法认定 → `null`） */
  founder: { handle: string; gramps_id: string; name: string } | null;
  /** 当前已生效的发源地（tree-meta 软冗余，供弹窗回显） */
  current: { origin_code: string; origin: string };
  candidates: TreeOriginCandidate[];
}

/** 发源地指定出参（`POST /admin/set-tree-origin`） */
export interface SetTreeOriginResult {
  ok: boolean;
  /** 被指定节点出生地码（后端写路径反查展示串） */
  origin_code: string;
  /** 展示串（由后端 `resolveOrigin()` 生成，前端不拼） */
  origin: string;
  /** 发源地来源节点 */
  source: { handle: string; gramps_id: string; name: string };
}
