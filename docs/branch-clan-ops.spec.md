# 立支 / 汇宗 — 规格（branch-clan-ops.spec.md）

> 状态：**设计待确认 Kevin 2026-09-17 · 待实施**
> 需求原文：Kevin 2026-09-17「两个相对的操作动作：【立支】和【汇宗】」（原文见 §3 逐条，语义不得增删）。
> 历史思路里的【晋宗】已**整体移除**（函数 `promoteTree()`、路由 `POST /admin/promote`、规格表述均已删，见 `docs/founder-attach.spec.md` §6 与 `docs/economy-fee.spec.md` §3-1 移除说明），本规格以【立支】/【汇宗】取代它。
> 关联：`docs/economy.spec.md`（存储契约 / 扣减算法 / 枚举的唯一出处；本册只引用不重定义）、`docs/economy-fee.spec.md`（扣费闸门与单价表：立支 = §3-1 #34 行、汇宗 = §3-1 #35 行）、
> `docs/spirit-domain.spec.md`（灵气状态机与凹槽不可逆）、`docs/clan-tree.spec.md`（三层结构与宗谱挂接、支系入口列表）、`docs/founder-attach.spec.md`（镜像只读与认祖原语）、
> `docs/marriage.spec.md`（镜像成对与申请制骨架）、`docs/id-system.spec.md`（handle 不变 / 全局编号换树不换号）、`docs/permission-tier.spec.md`（角色档位）、`docs/PENDING_DEPLOY.md`（部署清单约定）。
> 代码：`cloudfunctions/compat-api/lib/tree-write.js`（`createTree` / `splitTree` / `reparentNode` / `reusableParentFamily` / `ensureParentFamily` / `scanExternalRefs` / `nextGrampsId`）、
> `lib/clan.js`（宗谱自有段 / 支系入口列表）、`lib/founder-attach.js`（镜像写法与只读判定）、`lib/store.js`（`updateTrees` / `saveDetail`）、`lib/id-seq.js`、`lib/id-resolve.js`、
> `lib/economy-fee.js`（闸门与 `FEE` 单价表）、`lib/wallet.js`（后台设置载体）、`lib/marriage.js`（`applyMarriage` 镜像写法）。

---

## 0. 本册边界（先读）

| 项 | 口径 |
|---|---|
| **本册管** | 【立支】/【汇宗】两条结构操作的全部口径：作用对象、前置、结构动作、宗谱挂接登记、扣费与资产折损、权限、拒绝矩阵、接口契约、前端落点与定稿文案、测试与部署要点、待确认默认口径 |
| **本册不管**（回对应分册） | 集合名 / 字段名 / 批次结构 / 有效期常量 / FIFO 与 sweep 算法 / `Tx.type` 枚举 → `docs/economy.spec.md`；扣费闸门顺序与 `fee` 响应形状 → `docs/economy-fee.spec.md`；灵气四态、凹槽永久占用与镶嵌不可逆 → `docs/spirit-domain.spec.md`；祖谱层级与页面三段版式 → `docs/clan-tree.spec.md`；认祖 / 挂载 / 解除挂载 / 重置始祖原语 → `docs/founder-attach.spec.md`；编号权威 → `docs/id-system.spec.md` |
| **冲突处理** | 金额 / 比例 / 天数 / 路由名 / 枚举 / 结构动作以本册为准；集合名、字段名、算法契约与总册冲突 → 以 `docs/economy.spec.md` 为准并回改本册；与 `docs/economy-fee.spec.md` / `docs/spirit-domain.spec.md` / `docs/clan-tree.spec.md` 的冲突条目按本册同步修订（本轮已同步见 §14） |
| **数值纪律** | 本册所有金额 / 比例 / 阈值 / 天数 / 枚举 / 路由名**逐字取自 Kevin 需求原文与本派单**；不得四舍五入、不得补零取整、不得自行发明；派单未覆盖的数值一律登记在 **§13 待确认默认口径** |
| **实现载体** | 两条操作**均不新建集合**（§5-1）；只改 tree-meta、树 JSON、详情文档与 `jiazu_spirit` 中**既有**的键 |

---

## 1. 一句话

【立支】把普通家族树里的一个**普通节点 N** 立为**新家族树的始祖**：N 的上级祖先链整体上移并入该家族的**宗谱**，原树保留 N 及其全部后代（始祖改为 N），新树以 N 的**始祖镜像**为始祖、初始不含其他真实节点；一次 **9999 颗石榴籽**。
【汇宗】把家族树的**始祖节点**（宗谱节点的镜像）改为**另一棵普通家族树里的普通节点 X**：源树全部真实节点整体迁到 X 之下，源树基础信息随之删除、**原树不复存在**；**0 片 + 0 籽**，源树灵气剩余有效期按比例折损后累加到目标树（折损基数 = 源树**「时流子域」的有效期**，**不涉永久玉**，§3-10）。

两者互为反向操作：**立支**把一个节点升为支系之祖（树变多），**汇宗**把一棵树并回另一棵树（树变少）。

**立支 → 汇宗 构成互逆闭环（已拍板）**：立支产物的始祖镜像（`external_link_type='founder'` + `external_mirror='true'`，其 `external_tree` = 立支前的原树）本身即满足汇宗对「源树始祖是**指向本层之上的镜像**」的要求 → 立支后**可直接汇宗**，**不需要**先手工 detach→attach 一步（判定口径见 §3-8 / §6-2-2）。

---

## 2. 术语

| 术语 | 含义 |
|---|---|
| 立支 / `establish-branch` | 普通树普通节点 → 新家族树始祖 的结构操作（§6-1） |
| 汇宗 / `converge-clan` | 源树始祖改为他树普通节点、源树整体并入目标树 的结构操作（§6-2） |
| **N** | 立支选定的**普通节点**（真身），立支后同时是**原树始祖**与**新树的始祖指向对象** |
| **X** | 汇宗选定的**目标节点**（另一棵 `kind='family'` 树里的普通节点），迁移落点 |
| 上移祖先链 | N 的父 → … → 本树始祖节点 这条链（含途中家族记录），立支时并入宗谱自有段 |
| 始祖镜像节点 | 指向某上层树真身的只读节点（`external_link_type='founder'` + `external_mirror='true'`；`docs/founder-attach.spec.md` §3-1） |
| **上层镜像** | 指向**本层之上**真身的只读镜像：`external_mirror='true'` 且 `external_tree` 非空且 **≠ 本树自身**（`external_link_type` 为 `'founder'` 或 `'chain'`；本层内整节点只读，`lib/founder-attach.js` 的 `isUpperMirror`）。**汇宗对源树始祖的要求即「是上层镜像」**（§3-8 / §6-2-2），故立支产物可直接汇宗 |
| 宗谱登记镜像 | 立支写入**宗谱**的「始祖 N 登记」镜像（`external_link_type='founder'`），一条登记 = 一个「支系入口列表」入口（§5-3、§6-1-6） |
| 支系入口列表 | 祖谱页底部「所有认此祖谱为祖的普通家族树」清单（`docs/clan-tree.spec.md` §3-5） |
| 折损基数 | 汇宗时源树**「时流子域」的有效期**（灵气**剩余有效期**：`max(0, spirit_expires_at − now)`；buffer / expired 期 = 0；**不涉永久玉**，§3-10） |
| 折损天数 | `ceil(剩余天数 × 比例)`；比例默认 **50%**（§3-10） |
| 换树不换号 | 跨树迁移**不改** `handle` 与 `gramps_id`（`docs/id-system.spec.md` §2 / §8-4） |

---

## 3. 已锁定口径（Kevin 2026-09-17，逐条不得改）

> 状态列：**已拍板** = 本轮已定（含 Kevin 2026-09-17 拍板），实现不得再改；**暂定（需求原文，用户可一句话改）** = 数值逐字取自 Kevin 需求原文、用户一句话即可改；**默认口径（一句话可改）** = 按此实现，如不符一句话即可改（同条在 §13 有对应登记）。

| # | 口径 | 状态 |
|---|---|---|
| 1 | **立支后节点归属**：原树**保留 N 及其全部后代**（内容不变，仅始祖由旧始祖变为 N）；**新树以 N 为始祖**（N 的始祖镜像，`external_mirror='true'` 指向 N 的真身 = 原树），初始**不含其他真实节点**。依据 = 需求原文只说「上级节点上移」 | 默认口径（一句话可改） |
| 2 | **与宗谱的挂接登记**：上移的祖先链并入宗谱**自有段**（挂到该宗谱 `tree-meta.founder_handle` 指向的节点之下，如 `ji_23395` 的「季花」）；原树与新树**各在宗谱留一个始祖 N 的镜像登记**（`link_type='founder'`）→ 两树都出现在宗谱「支系入口列表」 | 默认口径（一句话可改） |
| 3 | **立支的上移集合** = N 的上级链（N 的父 → … → 本树始祖节点）整体迁入宗谱；`handle` 不变、`gramps_id` 不变（`docs/id-system.spec.md`：换树不换号），详情文档随迁（**必须显式改 `_id`**，否则会写回旧键又删旧键 = 只删未写） | 已拍板 |
| 4 | **立支扣费**：**9999 石榴籽**，从**发起人个人资产**扣（`jiazu_assets` 的 FIFO by 最早到期、整单不足 **409** `ASSET_INSUFFICIENT`、绝不部分扣）；在权限校验通过、全部结构校验通过之后、写库之前扣；写入失败 / 事务回滚 → **原路返还同一批次**（写法与「建树扣 9 籽」一致）；后台可配（挂与建树费**同一设置载体**，默认 9999，键名 `branch_fee_seeds`） | **暂定**（需求原文，用户可一句话改） |
| 5 | **立支权限**：本树 `tree_steward` / `chief_editor`；**总谱或祖谱节点、镜像节点、始祖节点本身不可立支**（始祖位 → **400**） | 默认口径（一句话可改） |
| 6 | **立支前提**：原树必须已有**宗谱归属**；判定按**「或」**——`tree-meta.clan_tree_id` **或** 始祖镜像的 `external_tree` 指向祖谱，两者**任一成立**即算已有归属（实现口径 = `lib/branch-clan-ops.js` 的 `clanAffiliationOf()`：按 `[clan_tree_id, 始祖镜像.external_tree]` 顺序取第一个 `kind='clan'` 的条目；本条的「或」是**实测必需**，不是可改点）；否则 **400**「请先为该家族建立或认祖宗谱」；宗谱 `founder_handle` 为空 → **400**「该祖谱尚未设置认祖落点（founder_handle 为空），请先在祖谱内指定落点后再立支」。**实测依据**：真源 `ji_23395_01` 的 tree-meta **没有 `clan_tree_id` 字段**，只有始祖镜像（`external_link_type='founder'` + `external_tree='ji_23395'`，`migrate-output/trees/ji_23395_01.json` 始祖即「季花」镜像）→ 若坚持「且」（两个条件同时成立）判定，**现存数据全部 400** | 已拍板 |
| 7 | **汇宗权限**：`chief_editor` **直接执行**（不可逆的整树删除类操作，暂不做申请-审批；见 §13 可改点「可改为目标树侧确认的申请制」） | 默认口径（一句话可改） |
| 8 | **汇宗的迁移语义**：原树全部**真实节点**（含家族）整体迁到目标节点 X 下（换树不换号；详情文档随迁并改 `_id`）；落点 = X 的家族（复用 `reparentNode` 的家族复用顺序：X 已在对应槽位且另一半空着 → 直接挂入；否则 X 的任一家族；都没有 → 新建家族）；**原树的始祖镜像节点本身不随迁、直接丢弃**（它是上层真身的展示副本，不承载真实数据）。**源树始祖的判定（已拍板 · 与立支互逆）**：只要求当前始祖是**指向本层之上的镜像** —— `external_mirror='true'` + `external_link_type='founder'` + `external_tree` 非空且 **≠ 源树自身**（§6-2-2）；其 `external_tree` 指向**祖谱**或**另一棵普通家族树**均放行（立支产物的始祖镜像指向原普通树）；源树 `kind` 仍必须是 `'family'`（§3-12） | 已拍板 |
| 9 | **汇宗后清理**：源树 tree-meta 条目删除、树 JSON 删除、**源树不再存在**；源树树内的纯本地数据随树作废（清单见 §5-5）；`jiazu_spirit.trees[源树]` 记录**保留**、`status` 置 `'expired'`（不删记录，与既有 R5 一致）；该树已镶嵌的玉**不返还、不可重镶**（既有口径不变；**Kevin 2026-09-17 拍板**：汇宗不涉及永久玉——玉本身既不随迁、也不计价 → 本条**已拍板并关闭**，见 §13-1） | 已拍板（Kevin 2026-09-17 拍板） |
| 10 | **汇宗资产折损**（**已拍板 · Kevin 2026-09-17**）：折损基数 = 源家族树**「时流子域」的有效期**（`max(0, spirit_expires_at − now)`，buffer / expired 期 = 0）；折损天数 = `ceil(剩余天数 × 比例)`，比例默认 **50%**、后台可配（键名 `converge_spirit_ratio`，取值 0–1）；累加到**目标树** `spirit_expires_at`（叠加顺延语义，**不覆盖**）；**不涉及永久玉**——玉本身**不迁移、不返还、不计价**（历史留痕：拍板前那句「若本意是玉本身随迁到目标树凹槽，与既有『凹槽已占 / 镶嵌不可逆』冲突，需重裁」的未决措辞已被本拍板取代：玉不随迁，故与 `docs/spirit-domain.spec.md` §5-3 无冲突）；**源树已镶嵌的玉随树作废**（§3-9，不变）；**目标树未镶嵌玉（无凹槽）→ 不并入、只提示**（灵气无载体，不能出现「无玉却有灵气」的非法态；本条仍为默认口径，见 §13-2）。**拍板原文（2026-09-17）**：「汇宗不涉及到永久玉，只涉及到原家族树的时流子域的有效期，只计算有效期的折损就可以。」 | **已拍板**（折损基数 / 不涉永久玉；同条「目标树无玉 → 不并入」仍按默认口径 §13-2） |
| 11 | **跨树引用体检（红线）**：立支的上移集合、汇宗的迁移集合里**任一 `handle`** 被其他树以 `external_person_handle` 引用（认祖 / chain 镜像、跨树婚姻镜像、分迁登记）或登记在任何 tree-meta 的 `founder_handle` → **拒绝**（立支 **400** / 汇宗 **409**），提示先到对方树解除关系，**绝不级联改对方树**；拒绝时所有参与的树都不写 | **已拍板** |
| 12 | **汇宗目标校验**：目标节点 X 必须是**另一棵 `kind='family'` 树**里的**普通节点**（非镜像、非总谱 / 祖谱节点）；源树 `kind` 必须是 `'family'`（总谱 / 祖谱不可汇宗）；目标节点由**全局编号**解析（复用 `resolveNode`，自动识别所属树，**不要**另做「选目标树」选择器） | 已拍板 |
| 13 | **汇宗的竹片扣费 = 0 片**，与其它新增 / 迁移类一致（操作总额 = **0 片 + 0 籽**） | **暂定**（需求原文，用户可一句话改） |
| 14 | 旧「拆分」（`POST /admin/split-tree`）/ `splitTree()` **保留现状**（本轮不动、不删入口） | 已拍板 |

---

## 4. 两条操作对照表

| 维度 | 【立支】`POST /admin/establish-branch` | 【汇宗】`POST /admin/converge-clan` |
|---|---|---|
| 作用对象 | 普通家族树（`kind='family'`）里的**普通节点 N**（非镜像、非始祖） | 家族树（`kind='family'`）的**始祖节点**（**指向本层之上的镜像**，§3-8）→ 改为另一棵普通树里的**普通节点 X** |
| 发起方 | 本树 `tree_steward` / `chief_editor`（费用扣**发起人个人**资产） | `chief_editor`（直接执行） |
| 前置 | ① 原树已有宗谱归属（`tree-meta.clan_tree_id` **或** 始祖镜像的 `external_tree` 指向祖谱，任一成立即可，§3-6）；② 宗谱 `founder_handle` 非空；③ 跨树引用体检通过 | ① 源树 `kind='family'` 且当前始祖是**指向本层之上的镜像**（`external_mirror='true'` + `external_link_type='founder'` + `external_tree` 非空且 ≠ 源树自身；其 `external_tree` 是祖谱或**另一棵普通家族树**均放行，§3-8）；② X 属**另一棵** `kind='family'` 树且是普通节点；③ 跨树引用体检通过 |
| 结构动作 | ① 上移祖先链并入宗谱自有段；② 原树始祖 → N（真身）；③ 新建新树（唯一节点 = N 的始祖镜像）；④ 宗谱写 2 条始祖 N 登记镜像 | ① 源树全部真实节点 + 家族整体迁入 X 家族下；② 源树始祖镜像节点丢弃；③ 源树 tree-meta 条目 + 树 JSON 删除 |
| 资产 | **9999 颗石榴籽**（从发起人个人资产、FIFO 整单扣；不涉竹片；**暂定** — 需求原文，§3-4）；失败原路返还 | **0 片 + 0 籽**（**暂定** — 需求原文，§3-13）；源树**「时流子域」有效期**剩余 × **50%** 折损后累加到目标树（**不涉永久玉**，§3-10；目标树未镶嵌玉 → 不并入、只提示） |
| 产生 / 消失 | 产生 **1 棵新树**；原树与宗谱被改写 | **消失 1 棵树**（源树）；目标树被改写 |
| 是否可逆 | **不可逆**（祖先链已并入宗谱、新树已建；反向操作只能靠后续人工/迁移） | **不可逆**（源树条目与树 JSON 已删除，源树不再存在） |
| hook 结束 | 出参含 `fee`（§8） | 出参含 `spirit` 折损明细（§8） |

---

## 5. 数据结构

### 5-1 集合：两条操作**均不新建集合**

| 集合 | 用途（既有） | 本操作写入 |
|---|---|---|
| `jiazu_tree_meta`（`config/tree-meta.json`） | 树登记（`kind` / `founder_*` / `clan_*`） | 立支：原树 + 新树 + 宗谱条目；汇宗：源树条目**删除**、目标树条目不变 |
| 树 JSON（云存储 `trees/<tree_id>.json`） | 人物 / 家族结构真源 | 立支：原树（摘链）+ 新树（首写）+ 宗谱（迁入链）；汇宗：源树（迁移后清空→删除）+ 目标树（迁入） |
| `jiazu_person_details`（`migrate-output/details/<tree_id>:<handle>.json`） | 节点详情 | 随迁（**显式改 `_id`**）；不随迁的镜像节点详情随树作废 |
| `jiazu_spirit`（`_id='global'`） | 时流子域（凹槽 / 灵气 / 流水） | 汇宗：目标树 `spirit_expires_at` 叠加折损天数；源树记录 `status='expired'` |
| `jiazu_assets`（`_id='global'`） | 个人资产 | 立支：扣 / 冲正发起人的 `SeedLot`（籽）；汇宗：**无写入** |
| `jiazu_wallets`（`_id='global'`） | ¥ 钱包 + **后台费用设置载体** | 新增两个设置键（§5-4，只被读取，不在业务路由内写） |

> 立支 / 汇宗**不新增任何上传项**：上表集合均已存在于 `scripts/upload-migrated-to-cloudbase.mjs` 的清单 / 既有部署项中。

### 5-2 tree-meta 字段改动表（逐字段）

| 字段 | 立支 · 原树 | 立支 · 新树 | 汇宗 · 源树 | 汇宗 · 目标树 |
|---|---|---|---|---|
| `tree_id` | 不变 | 新建（生成规则 = `nextTreeId(meta, 姓)`，即 `<姓氏拼音>_<汉字码点>_<两位序号>`，形如 `ji_23395_01`；注音真源 = `surnamePinyin()` 的 pinyin-pro 姓氏模式、**无兜底**，见 `docs/tree-id.spec.md`） | 不变（随后整条删除） | 不变 |
| `surname_pinyin` | 不变 | **写**（= 该树实际采用的姓氏拼音，与新建家族树 / 新建祖谱同口径）。实现 = 立支新树条目写入 `surname_pinyin: surnamePinyin(surnameChar)`（`lib/branch-clan-ops.js:709-710`，代码注释逐字引 §5-2 / `docs/tree-id.spec.md` §4）；回归断言见 `lib/branch-clan-ops.test.js:896-898`；注音真源与字段口径见 `docs/tree-id.spec.md` §2 / §4 | —（条目删除） | 不变 |
| `kind` | 不变（`'family'`） | `'family'` | —（条目删除） | 不变 |
| `founder_handle` | 旧始祖镜像 handle → **N.handle**（真身） | **新树始祖镜像 handle**（新铸） | —（条目删除） | 不变 |
| `founder_gramps_id` | → **N.gramps_id**（N 真身编号不变） | → 新树始祖镜像的 `gramps_id`（`nextPersonId()` 铸全站新号） | —（条目删除） | 不变 |
| `founder_name` | → **N.name** | → 镜像 `name`（= N.name，展示副本） | —（条目删除） | 不变 |
| `clan_tree_id` | 不变（沿用原值） | = **原树同值**（同一宗谱） | —（条目删除） | 不变 |
| `clan_handle` | → 宗谱内「原树 · N 登记镜像」handle | → 宗谱内「新树 · N 登记镜像」handle | —（条目删除） | 不变 |
| `founder_state` | 清空（回到「有始祖」态） | 不写（= 有始祖） | —（条目删除） | 不变 |
| 其余展示字段（`display_title` / `genealogy_name` / `hall_name` / `origin` / `description` / `path_alias` / `surname_char` / `created_at` / `created_by`） | 不变 | 新建（新树名可沿用「`<原树名> · <N 姓名>支`」形，值由实现给出，不构成契约） | —（条目删除） | 不变 |
| `reconcile_state` | — | — | **仅 §6-2-4 ⑥ 阶段失败时写入**：`'empty_source_shell'`（值唯一真源 = `lib/branch-clan-ops.js` 的 `SHELL_RECONCILE_STATE`） | — |
| `reconcile_note` | — | — | **仅 §6-2-4 ⑥ 阶段失败时写入**：失败原因留痕文本（形如「汇宗后清理失败（【失败原因】），该树已无真实节点，待 reconcile」） | — |
| `reconcile_at` | — | — | **仅 §6-2-4 ⑥ 阶段失败时写入**：写入时刻的 ISO 字符串 | — |

> §5-2 的三个 `reconcile_*` 字段**只写在既有的 `jiazu_tree_meta` 条目上，不新建集合、不新增上传项**（源树条目在 ④ 阶段已被删除时，按原条目补回一条带这三个标记的记录）。

> 读侧一致性：`resolveFounderHandle` 会以 `tree-meta.founder_handle` 优先、树 JSON 顶层 `founder_gramps_id` 兜底（`lib/founder-attach.js`）——因此**原树树 JSON 顶层 `founder_gramps_id` 必须同步为 N 的编号**，否则 meta 缺字段时会解析回旧始祖。

### 5-3 `external_*` 字段（镜像节点写法，沿用既有字段，不新增字段）

立支写两组镜像：

| 镜像 | 所在树 | 字段 |
|---|---|---|
| **新树始祖镜像**（1 个） | 新树 | `external_tree = '<原树 tree_id>'`、`external_person_handle = '<N.handle>'`、`external_link_type = 'founder'`、`external_mirror = 'true'`、`external_relation_note = '「<N 姓名>」（<原树名> · 立支始祖）'`；姓名 / 性别 / 生卒为 **N 的展示副本** |
| **宗谱登记镜像**（2 个，落在宗谱自有段） | 宗谱 | 原树登记：`external_tree = '<原树 tree_id>'`、`external_person_handle = '<N.handle>'`、`external_link_type = 'founder'`、`external_mirror = 'true'`；新树登记：`external_tree = '<新树 tree_id>'`、`external_person_handle = '<新树始祖镜像 handle>'`、`external_link_type = 'founder'`、`external_mirror = 'true'`；两条 `external_relation_note` 分别注明「（原树 · 立支登记）」/「（新树 · 立支登记）」 |

- 两条登记镜像的 `external_tree` 各指向**它所代表的普通树**，读侧由此推导支系入口（§6-1-6 的推导扩展）；登记镜像**整节点只读**（镜像只读口径，`docs/founder-attach.spec.md` §5）。
- 立支**不**给 N 真身写任何 `external_*`（原树始祖 = N 真身，是**真实节点**，非镜像）。
- 汇宗**不写**新 `external_*`：源树真实节点整体迁入目标树后一律不带跨树指针（迁入前已由体检保证它们没有被引用）；源树始祖镜像随树丢弃。

### 5-4 后台设置键（挂与建树费**同一设置载体**）

| 键 | 载体 | 默认值 | 单位 / 取值 | 读取方 |
|---|---|---|---|---|
| `branch_fee_seeds` | `jiazu_wallets`（`_id='global'`）的 `config`（与建树费 `config.tree_create_fee_cents` 同载体，读写入口复用 `lib/wallet.js` 的 `load()` / `persist()`） | **9999** | 完整石榴籽（颗），整数 | 立支扣费（§6-1-7） |
| `converge_spirit_ratio` | 同上 | **0.5** | 0–1 的比例（对应 **50%**） | 汇宗折损（§6-2-6） |

- 后台设置沿用**既有治理路由** `PUT /admin/wallet-fee`（携带上述两个键；本册**不新增设置路由**）。
- 默认值同时作为 `lib/economy-fee.js` 的 `FEE.branch_fee_seeds` 兜底常量；路由内**禁止写魔法数字**（沿用 `docs/economy-fee.spec.md` §5-1 口径）。

### 5-5 汇宗后**随树作废**的纯本地数据清单

| # | 数据 | 处置 |
|---|---|---|
| 1 | 源树 `tree-meta` 条目（`display_title` / `genealogy_name` / `hall_name` / `origin` / `description` / `path_alias` / `founder_*` / `clan_*` / `kind` 整条） | **删除** |
| 2 | 源树树 JSON（`trees/<源树>.json` 与云存储同名文件） | **删除** |
| 3 | 源树树内**镜像节点**（含始祖镜像；其他镜像见 §13-10） | **丢弃 / 删除**（不随迁） |
| 4 | 源树树内非跨树的**成员锚点**（`jiazu_anchors` 中 `tree_id = 源树` 的记录）与树内成员关系 | **随树作废**（记录保留、指向已不存在的树 → 相关判定按「树不存在」处理；**不级联删除用户账号数据**） |
| 5 | 指向源树的 **pending 申请**（`jiazu_join_requests` / `jiazu_clan_requests` 等以 `tree_id = 源树` 的未决条目） | **随之作废**（不再生效；已审批的历史记录保留留痕） |
| 6 | 源树内镜像节点的详情文档（若有） | **删除**（真实节点详情随迁，见 §6-2-4） |
| 7 | `jiazu_spirit.trees[源树]`（凹槽 / 灵气 / 流水） | **保留**、`status` 置 `'expired'`（§3-9 / §13-11） |
| 8 | 源树名称下的市集挂单 / 资产 / ¥ 钱包 | **不受影响**（市集挂单与家族树无关，`docs/economy.spec.md` §4-3 K7；个人资产与锚点无关） |

---

## 6. 操作定义

### 6-0 操作表（入口 / 权限 / 规则一览）

| 操作 | 入口 | 权限 | 规则 |
|---|---|---|---|
| **立支** `POST /admin/establish-branch` | 普通树节点档案「谱系管理」区 →「🌱 立支（新家族树）」 | 本树 `tree_steward` / `chief_editor` | 选定普通节点 N（非始祖 / 非镜像）→ 结构校验 → 跨树体检 → 扣 9999 籽 → 上移祖先链并入宗谱 + 建新树（N 的始祖镜像）+ 原树始祖改为 N + 宗谱写 2 条登记镜像（§6-1） |
| **汇宗** `POST /admin/converge-clan` | 始祖节点档案（镜像态）顶部 →「⛩ 汇宗（并入他树）」 | `chief_editor` | 选定目标节点 X（另一棵普通树的普通节点）→ 结构校验 → 跨树体检 → `confirm_people` 比对 → 源树全部真实节点迁入 X 家族下、始祖镜像丢弃、源树条目与树 JSON 删除、灵气折损并入目标树（§6-2） |
| 旧「拆分」`POST /admin/split-tree` | 既有入口 | 既有口径（`chief_editor`） | **保留现状**，本轮不改（§3-14） |

### 6-1 立支（`POST /admin/establish-branch`）

**6-1-1 请求 / 权限**

1. 鉴权：未登录 → **401**（沿用 `requireWriteUser` 文案）。
2. 权限：发起人须对本树有写权（`tree_steward` / `chief_editor`）；不满足 → **403**。
3. 入参：`{ tree_id, person_handle }`（`person_handle` 支持全局编号 / handle，走 `resolveNode`，`docs/id-system.spec.md` §5）。

**6-1-2 结构校验（先于扣费，任一不过 → 400 / 404，不扣籽）**

| 校验 | 不过时 |
|---|---|
| 树存在 | 404「家族树不存在」 |
| 树 `kind === 'family'` | 400「中华世本（总谱）不可立支」/「祖谱不可立支」 |
| 节点存在 | 404「节点不存在」 |
| 节点非镜像（`external_mirror !== 'true'`） | 400「该节点是外树镜像节点，请到其真身所在家族树操作」 |
| 节点不是始祖位 | 400「始祖节点本身不可立支」 |
| 原树已有宗谱归属（`clan_tree_id` **或** 始祖镜像的 `external_tree` 指向祖谱，任一成立；口径见 §3-6） | 400「请先为该家族建立或认祖宗谱」 |
| 宗谱 `founder_handle` 非空 | 400「该祖谱尚未设置认祖落点（founder_handle 为空），请先在祖谱内指定落点后再立支」 |
| 跨树引用体检（§6-1-5） | 400（拒绝，所有参与的树都不写） |

**6-1-3 上移集合（**必须逐字实现**）**

```
上移集合 = N 的上级链：N 的父 → 其父 → … → 本树始祖节点（含沿途家族记录）
  - 链顶的「本树始祖节点」是宗谱节点的镜像（展示副本，不承载真实数据）→ 迁入时丢弃该镜像，
    其上级真身（宗谱自有段落点，即宗谱 tree-meta.founder_handle 指向的节点，如「季花」）
    即为迁入后链顶的父节点
  - 迁入集合 = 链上除始祖镜像外的全部真实节点与家族（handle 不变、gramps_id 不变）
  - 迁移节点的 parent_family / spouse_families 指向的家族若随迁 → 一并迁入；指向未随迁家族 → 置空
```

**6-1-4 写入序列（固定）**

```
① 全量结构校验通过（§6-1-2）
② 跨树引用体检通过（§6-1-3 + §6-1-5）
③ 扣费：chargeSeeds(发起人 phone, branch_fee_seeds, { op:'establish_branch', tree_id, person_handle })
       （权限与结构校验之后、写库之前；不足 → 409 ASSET_INSUFFICIENT，一个批次都不动）
④ 新树首写：createTreeFile(newTree)（cloud 模式需先建云存储文件并登记 fileID）
       新树 = { people: { <N 的始祖镜像> }, families: {} }；顶层 founder_gramps_id = 镜像编号
⑤ updateTrees([原树, 宗谱], fn)：
       原树：摘除上移链（清 parent_family / spouse_families / 家族记录 + repairTreeRefs 修悬空引用）
             树 JSON 顶层 founder_gramps_id → N.gramps_id
       宗谱：把上移链挂到 founder_handle 指向节点之下 + 写 2 条 N 始祖登记镜像（§5-3）
⑥ 详情文档随迁：saveDetail({ ...detail, _id: '<宗谱>:<handle>', tree_id: '宗谱' })
       （**必须显式改 _id**；旧键 deleteDetail —— 顺序错误会「写回旧键又删旧键 = 只删未写」）
       详情随迁为 best-effort（既有语义）：失败不冲正结构写入，但必须回执在 moved_* 统计与该节点详情缺失告警
⑦ 写 tree-meta（原树 founder_* + clan_handle；新树整条登记；saveMeta 走 store 护栏）
⑧ 任一步失败 → 回收已建新树文件 → refund（原路返还同一批次，写 Tx.type='fee_refund'）→ 抛原错误
```

**6-1-5 跨树引用体检（红线，§3-11）**

- 对**上移集合的每个 handle** 执行既有 `scanExternalRefs`（`lib/tree-write.js`）同款扫描：其它树里任何节点的 `external_person_handle` 命中 → 命中即拒绝；任何 tree-meta 的 `founder_handle` 命中 → 命中即拒绝。
- 拒绝文案（沿用既有 `externalRefRefusal` 句式）：「该节点及其上级链在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再立支；涉及：…」；立支按 **400**（§3-11），且**不扣费、不写任何一棵树**。

**6-1-6 宗谱侧与支系入口列表（读侧推导扩展）**

- 上移链并入宗谱自有段后，宗谱的自有段人数与「本宗自有世代」随即变化（统计口径见 `docs/clan-tree.spec.md` §3-6）。
- **支系入口列表推导扩展**：既有推导 = 「某普通树的始祖镜像 `external_tree` = 本祖谱」（`lib/clan.js` `listClanBranches` → `listAttachedTrees`）。立支后**原树始祖是 N 真身（无跨树指针）**，故新增一条判定：**宗谱自有段里 `external_link_type='founder'` 且 `external_mirror='true'` 的登记镜像，按其 `external_tree` 计入支系入口**（一条登记 = 一个入口；立支写 2 条 → 原树与新树各 1 个入口）。

**6-1-7 扣费口径（逐字）**

- 单位：**完整石榴籽**；金额：`jiazu_wallets.config.branch_fee_seeds`（默认 **9999**）。
- 扣减：`jiazu_assets` 的 `SeedLot` **FIFO by `expires_at` 升序**、跨批取用、整单不足 → **409**（`code: 'ASSET_INSUFFICIENT'`，带 `need` / `current` / `unit: 'seeds'` / `how_to_get`），**绝不部分扣、绝不为负**。
- 时序：权限 → 结构校验 → 跨树体检 → **扣费** → 写库；落库失败 → 原路返还**同一批次**（恢复原 `qty` 与 `expires_at`，不新造批次）并写 `Tx.type='fee_refund'`。
- `Tx.type`：**复用总册既有枚举 `tree_create`**（立支同样产出一棵新树、扣籽，语义同类）；`Tx.desc` 写「立支（<N 姓名> → <新树 tree_id>）」、`ref.tree_id` = 新树 tree_id、`ref.person_handle` = N.handle；**不新造枚举值**（见 §13-8）。
- 竹片：**0 片**（立支属新增 / 结构类，不接竹片闸门）。
- dry_run：**不提供**（立支无破坏性迁移；一次请求即生效）。

### 6-2 汇宗（`POST /admin/converge-clan`）

**6-2-1 请求 / 权限**

1. 鉴权：未登录 → **401**。
2. 权限：**`chief_editor`**（否则 **403**「需要总编辑权限」）；不做申请-审批（§3-7）。
3. 入参：`{ tree_id, target_person_id, confirm_people }`（`target_person_id` 为**全局编号 / handle 均可**，走 `resolveNode`；`confirm_people` = 前端二次强确认里展示的「将迁移人数」，用于防确认期间数据变化）。

**6-2-2 结构校验（先于任何写入；任一不过 → 400 / 404 / 409，不写不扣）**

| 校验 | 不过时 |
|---|---|
| 源树存在、`kind === 'family'` | 404「家族树不存在」/ 400「中华世本（总谱）不可汇宗」/「祖谱不可汇宗」 |
| 源树当前始祖**是「指向本层之上的镜像」**（`external_mirror='true'` 且 `external_link_type='founder'` 且 `external_tree` 非空且 **≠ 源树自身**；其 `external_tree` 指向**祖谱**或**另一棵普通家族树**均放行 —— 立支产物的始祖镜像指向原普通树，故 **立支 → 汇宗可直接闭环**，§1 / §3-8） | 400「该家族树当前始祖不是上层镜像，无法汇宗」 |
| `target_person_id` 可解析 | 404「找不到编号/句柄为「…」的节点」 |
| 解析出的树 ≠ 源树 | 400「汇宗目标须是另一棵普通家族树中的普通节点」 |
| 目标树 `kind === 'family'` | 400「汇宗目标须是另一棵普通家族树中的普通节点」 |
| 目标节点是**普通节点**（非镜像、非总谱 / 祖谱节点） | 400「汇宗目标须是另一棵普通家族树中的普通节点」 |
| 跨树引用体检（§6-2-3） | **409**（红线） |
| `confirm_people` 与实时迁移人数一致 | **409**「汇宗范围已变化（当前 <N> 人，确认时 <M> 人），请重新确认」（校验先于扣费与写入） |

**6-2-3 迁移集合与跨树引用体检（红线）**

```
迁移集合 = 源树全部真实节点（external_mirror !== 'true'）及其家族；旁支边界见 §13-21（待裁决）
体检     = 对迁移集合每个 handle 跑 scanExternalRefs：
           其它树任何节点 external_person_handle 命中 → 拒绝（409）
           任何 tree-meta.founder_handle 命中            → 拒绝（409）
拒绝文案（沿用 externalRefRefusal 句式）：
  「该节点及其子树在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再汇宗；涉及：…」
拒绝时：源树与目标树都不写、tree-meta 不删、jiazu_spirit 不变。
```

> 推论（写在规格里以免误判）：跨树婚姻是**双侧写指针**（`docs/marriage.spec.md` §5），因此**存在任何跨树婚姻的树无法汇宗**，必须先绝婚/合离解除。该推论在「**阻断方就是目标树自己**（目标树持有指向源树节点的婚姻 / 子女镜像）」时的例外与否 = **§13-23 待裁决**（只登记）。

**6-2-4 写入序列（固定）**

```
① 结构校验 + 体检 + confirm_people 比对全部通过（§6-2-2 / §6-2-3）
② updateTrees([源树, 目标树], fn)：
     目标树：按 §3-8 落点顺序取 X 的家族（ensureParentFamily / reusableParentFamily 同款顺序：
             X 在对应槽位且另一半空着 → 直接挂入；否则 X 的任一家族；都没有 → 新建家族，编号 nextFamilyId()）
             把源树全部真实节点搬入（handle / gramps_id 不变）；家族记录整体搬入并重挂
     源树：删除迁移集合（节点 + 家族 + 指向它们的悬空引用用 repairTreeRefs 修复）；
             始祖镜像节点直接丢弃
③ 详情文档随迁：saveDetail({ ...detail, _id: '<目标树>:<handle>', tree_id: '目标树' })
             （**必须显式改 _id**；旧键 deleteDetail）
④ 删除源树 tree-meta 条目（saveMeta）；删除源树树 JSON
⑤ jiazu_spirit 更新（§6-2-6）：目标树叠加折损天数；源树记录 status='expired'
⑥ 失败语义：
     ② 阶段失败 → updateTrees 快照回滚（两棵树都不变），jiazu_spirit 与 tree-meta 均不动
     ④/⑤ 阶段失败 → 不回滚已迁移的结构（源树此时已空），回 500 并把该树登记为「待 reconcile 的空壳源树」
                    —— 在源树 **tree-meta 条目**上写 `reconcile_state = 'empty_source_shell'` /
                       `reconcile_note = '汇宗后清理失败（【失败原因】），该树已无真实节点，待 reconcile'` /
                       `reconcile_at = <ISO 写入时刻>`（**只写既有条目、不新建集合**，字段表见 §5-2）；
                       条目在 ④ 阶段已被删除时按原条目补回一条带这三个标记的记录
                    —— 本操作 0 片 0 籽，**无任何资产副作用**，不存在冲正
```

**6-2-5 迁移人数与家族数**

- `moved_people` = 迁移的真实节点数；`moved_families` = 迁移的家族记录数；二者即出参也是 `confirm_people` 比对基准。
- 镜像节点**不计入** `moved_people`（不随迁）。

**6-2-6 资产折损（源家族树「时流子域」的有效期 · 不涉永久玉 · 逐字）**

```
# 折损基数 = 源家族树「时流子域」的有效期；不涉永久玉（玉不迁移、不返还、不计价，§3-10）
源树剩余 = max(0, 源树 spirit_expires_at − now)          # buffer / expired 期（已过）→ 0
剩余天数 = ceil(源树剩余 / 86400000)                     # 沿用 docs/spirit-domain.spec.md §4-5 的 days_left 口径
折损天数 = ceil(剩余天数 × converge_spirit_ratio)         # 比例默认 0.5（50%）
目标树：无 jiazu_spirit.trees[目标树] 记录（未镶嵌玉，无凹槽）→ 不并入，出参带 skipped_reason
        有记录（已镶嵌玉）→ newExp = max(now, 目标树原 spirit_expires_at) + 折损天数
                            （叠加顺延、绝不覆盖；原值为 null 时基期 = now）
        status 由惰性结算按 newExp 推导（并入后 = 'active'）；buffer_until 置 null
源树：jiazu_spirit.trees[源树] 记录保留、status 置 'expired'；jade / spirit_expires_at / logs 保留作留痕
      （源树已不存在 → GET /spirit 与 POST /spirit/charge 对该 tree_id 一律 404，惰性结算不再推进该键）
不写 SpiritLog（该形态只承载灌注，plan 为五档枚举，docs/economy.spec.md §4-2；见 §13-15）
不写 Tx（0 片 0 籽）；已镶嵌玉随树作废：不返还、不重镶，个人侧 mounted_tree_id 留痕保留（R5 口径不变）
```

**6-2-7 出参 `spirit` 字段口径**

| 字段 | 含义 |
|---|---|
| `ratio` | 本次生效的折损比例（`converge_spirit_ratio`，默认 0.5） |
| `source_days_left` | 源树灵气剩余天数（`ceil(max(0, spirit_expires_at − now)/86400000)`；无记录 / 已过 → 0） |
| `transferred_days` | 折损后并入目标树的天数（`ceil(source_days_left × ratio)`） |
| `target_spirit_expires_at` | 并入后目标树灵气到期时刻（未并入时 = 目标树原值 / `null`） |
| `skipped_reason?` | 未并入时的原因（如「目标树尚未镶嵌石榴籽玉（无凹槽），源树灵气不并入」「源树未镶嵌石榴籽玉，无灵气可折损」） |

---

## 7. 拒绝矩阵

### 7-1 立支

| 码 | 条件 | `error` 文案 |
|---|---|---|
| **401** | 未登录 | 请先登录后再进行编辑操作（沿用既有 `requireWriteUser` 文案） |
| **403** | 非本树 `tree_steward` / `chief_editor` | 沿用既有文案（如「您的权限范围仅限本人及向下节点」） |
| **400** | 缺 `tree_id` / `person_handle` | 缺少 tree_id / 缺少 person_handle |
| **404** | 树不存在 | 家族树不存在 |
| **404** | 节点不存在 | 节点不存在 |
| **400** | 目标树为总谱 | 中华世本（总谱）不可立支 |
| **400** | 目标树为祖谱 | 祖谱不可立支 |
| **400** | 节点是镜像节点 | 该节点是外树镜像节点，请到其真身所在家族树操作 |
| **400** | 节点为始祖位 | 始祖节点本身不可立支 |
| **400** | 原树无宗谱归属 | 请先为该家族建立或认祖宗谱 |
| **400** | 宗谱 `founder_handle` 为空 | 该祖谱尚未设置认祖落点（founder_handle 为空），请先在祖谱内指定落点后再立支 |
| **400** | 跨树引用体检不过（红线，§3-11） | 该节点及其上级链在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再立支；涉及：… |
| **409** | 石榴籽不足（整单拒绝） | 石榴籽不足：本次需 9999 颗，当前可用 N 颗（`code: 'ASSET_INSUFFICIENT'`，带 `need` / `current` / `unit: 'seeds'` / `how_to_get`） |
| 500 | 落库失败 | **服务内部错误**（并已原路返还同一批次：响应带 `fee_refunded: true`；**不得**回显系统错误码与堆栈） |

### 7-2 汇宗

| 码 | 条件 | `error` 文案 |
|---|---|---|
| **401** | 未登录 | 请先登录后再进行编辑操作 |
| **403** | 非 `chief_editor` | 需要总编辑权限 |
| **400** | 缺 `tree_id` / `target_person_id` | 缺少 tree_id / 缺少 target_person_id |
| **400** | 缺 `confirm_people` | 缺少 confirm_people（请先展示将迁移的人数后再确认） |
| **404** | 源树不存在 | 家族树不存在 |
| **404** | 目标节点解析不到 | 找不到编号/句柄为「…」的节点 |
| **400** | 源树为总谱 | 中华世本（总谱）不可汇宗 |
| **400** | 源树为祖谱 | 祖谱不可汇宗 |
| **400** | 源树始祖不是**上层镜像**（§6-2-2 / §3-8） | 该家族树当前始祖不是上层镜像，无法汇宗 |
| **400** | 目标节点在源树内 / 目标树非 `kind='family'` / 目标节点是镜像或总谱祖谱节点 | 汇宗目标须是另一棵普通家族树中的普通节点 |
| **409** | 跨树引用体检不过（红线，§3-11） | 该节点及其子树在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再汇宗；涉及：… |
| **409** | `confirm_people` 不符（范围变化） | 汇宗范围已变化（当前 N 人，确认时 M 人），请重新确认（`code: 'DELETE_SCOPE_CHANGED'`，复用既有已登记域名码；见 §13-9） |
| 500 | tree-meta / 树文件删除阶段失败 | **服务内部错误**（并已按 §5-2 / §6-2-4 ⑥ 在源树 tree-meta 条目写 `reconcile_*` 三个标记） |
| — | 目标树未镶嵌玉 | **不是错误**：200 + `spirit.skipped_reason`（不并入、只提示） |

> 错误体约束沿用 `docs/economy-fee.spec.md` §6：只回**域名错误码**、`ASSET_INSUFFICIENT` 必须带 `need` / `current` / `unit` / `how_to_get`；系统级错误码与堆栈一律不得回显。
>
> **系统级失败文案（本轮统一，唯一版本）**：立支与汇宗的一切系统级失败（落库失败 / tree-meta 与树文件删除阶段失败 / 灵气写入失败）文案**统一为「服务内部错误」**，与共享 `errorPayload` 的 `INTERNAL_ERROR_TEXT`（`lib/economy-fee.js`）逐字一致；**「服务器开小差了，请稍后重试」在本册作废、不再作为本两条操作的文案**（另一处行文已随本轮删除）。汇宗侧实现为 `lib/branch-clan-ops.js` 内的**同一常量** `INTERNAL_ERROR_TEXT = '服务内部错误'`（与共享口径逐字一致，登记见 §15 **#8** / **#15**）。

---

## 8. 接口契约

### 8-1 立支

| 项 | 内容 |
|---|---|
| 路由 | `POST /admin/establish-branch` |
| 入参 | `{ tree_id, person_handle }` |
| 出参（200） | `{ ok, original_tree_id, new_tree_id, moved_ancestors, moved_families, founder: { handle, gramps_id, name }, fee: { unit: 'seed', amount: 9999, balance_after }, warnings?: string[] }` |
| 字段口径 | `moved_ancestors` = 上移链节点数；`moved_families` = 随迁家族数；`founder` = **N 的真身**标识（`handle` = N.handle、`gramps_id` = N.gramps_id、`name` = N.name；新树侧镜像另铸 handle / 编号，不在本字段内） |
| 字段口径 · `fee`（§13-18 字面契约） | 就是 `{ unit: 'seed', amount: 【本次生效值：9999 或后台配置值】, balance_after }` 这一个形状；**后端必须单独组装本字段**，不得走 `feeOf()` 的形状（既有的 `{ unit:'seeds', pieces, balance }` 是**另一处**口径，两者不同形、不得互相套用） |
| 字段口径 · `warnings?`（可选，本轮新增） | `string[]`，**仅当上移祖先链中有节点的详情文档缺失**（详情随迁是 best-effort，§6-1-4 ⑥）时出现，逐条给出提示（如「节点「【姓名】」详情文档缺失，仅结构真源已迁移」）；**无缺失时不出现该字段**（不是空数组）；结构写入不受影响、不冲正、不改变 `moved_ancestors` 计数 |
| dry_run | 不适用（不提供） |
| 注册位置 | 必须注册在 `index.js` 树编辑闸门（`缺少 X-Tree-Id`）**之前**（与 `/admin/delete-node`、`/admin/split-tree` 同段）；树上下文取 body 的 `tree_id`，**不依赖** `X-Tree-Id`（§13-14） |

### 8-2 汇宗

| 项 | 内容 |
|---|---|
| 路由 | `POST /admin/converge-clan` |
| 入参 | `{ tree_id, target_person_id, confirm_people }`（`target_person_id` = 全局编号 / handle 均可） |
| 出参（200） | `{ ok, source_tree_id, target_tree_id, target_handle, moved_people, moved_families, spirit: { ratio, source_days_left, transferred_days, target_spirit_expires_at, skipped_reason? } }` |
| 字段口径 | `moved_people` / `moved_families` 见 §6-2-5；`spirit` 见 §6-2-7；`target_handle` = 解析后的 X 的 handle |
| dry_run | 不适用（**不做** dry_run）：改由二次强确认弹窗展示「将迁移人数 / 家族数 / 折损天数」并**一次请求带 `confirm_people`**（与 `/admin/delete-node` 两段式同思路） |
| 注册位置 | 同 §8-1（闸门之前） |

---

## 9. 前端落点

### 9-1 入口

| 操作 | 落点 | 显示条件 | 二次确认 |
|---|---|---|---|
| **立支** | 普通家族树**节点档案的「谱系管理」操作区**（`frontend/src/components/person-manage-panel/person-manage-panel.vue`，宿主 = `person-archive.vue` 的谱系管理区） | `canManageTree`（本树写权：`tree_steward` / `chief_editor`）**且** 树 `kind='family'` **且** 该节点非始祖、非镜像 | 组件内强确认弹窗（或 `uni.showModal`）+ **费用提示**（9999 颗石榴籽、当前余额）+ 结果 toast |
| **汇宗** | **始祖节点档案（镜像态）顶部**（`frontend/src/components/person-archive/person-archive.vue` 始祖操作区，与「🔁 重置始祖」同区） | **仅 `chief_editor`**，且该始祖**是上层镜像**（§3-8：`founder` + `external_mirror='true'` + `external_tree` 非空且 ≠ 本树；祖谱或另一棵普通树均可） | 组件内**不可逆**强确认弹窗 + 折损提示 + 将迁移人数（提交时作为 `confirm_people`）+ 结果 toast |

- 「选目标节点」**不做树选择器**：一个输入框填**全局编号 / handle**（`resolveNode` 自动识别所属树，`docs/id-system.spec.md` §5）。
- 取消一律**不发请求**（沿用 `docs/economy-fee.spec.md` §7 口径）。

> **入口文案已锁定（唯一版本，逐字不得改写）**：立支 = **「🌱 立支（新家族树）」**、汇宗 = **「⛩ 汇宗（并入他树）」**（与 §6-0 操作表、§9-3 文件表逐字一致）。另一轮派单里出现的「🌿 立支」**作废**，不作为版本。前端**已按本规格字面实现**：`frontend/src/components/person-manage-panel/person-manage-panel.vue` 第 61 行 = 「🌱 立支（新家族树）」；`frontend/src/components/person-archive/person-archive.vue` 第 67 行（始祖操作区按钮）与第 526 行（汇宗确认弹窗标题）= 「⛩ 汇宗（并入他树）」。上述三段字面与 §9-2 的 L1–L3 / H1–H3 定稿文案同为本轮锁定的唯一版本；要改文案须先改本规格（含 §6-0 / §9-3 的同一处字面）。

### 9-2 定稿文案（可直接使用）

> ` / ` = 换行；【】内为运行时填值（【】取值口径：N 姓名 / 树名 / 人数 / 家族数 / 天数 / 比例 / 余额，均取本次请求的响应或预读值）。

| # | 名称 | 文案（定稿） | 触发 / 落点 |
|---|---|---|---|
| **L1** | 立支确认 | 「⚠️ 立支确认 / 本次将把「【N 姓名】」立为新家族树的始祖：其上级祖先链将整体上移并入本家族宗谱；原家族树保留「【N 姓名】」及其全部后代（始祖改为「【N 姓名】」）。/ 本次操作将消耗【9999】颗石榴籽，消耗时优先扣除您账户内即将最先到期的石榴籽，消耗后不可退回（当前可用【XX】颗）。/ 是否确认立支？」 | 谱系管理区点「🌱 立支」→ 提交前确认 |
| **L2** | 立支成功 | 「立支成功：新家族树「【新树名】」（【新树 tree_id】）已建立，共上移【N】位祖先、【M】个家族，本次消耗 9999 颗石榴籽，余【XX】颗」 | 200 后 toast + 刷新树图 / 档案 |
| **L3** | 立支失败 | 「立支失败：【后端 error 原文】」（籽不足时附「如何获得石榴籽」提示：签到 / 邀请 / 贡献 / 玉分解返还） | 4xx / 5xx 后 toast 或弹窗 |
| **H1** | 汇宗不可逆确认 | 「⚠️ 不可逆操作确认 / 本次【汇宗】将把家族树「【源树名】」整体并入「【X 姓名】（【目标树名】）」之下：源树全部人物与家族迁移到目标节点下（编号不变），源树的家族树登记与树数据将被删除，原树不再存在，且不可恢复。/ 源树灵气剩余【XX】天，按【50%】折损后为【YY】天，将累加到目标树的灵气到期时间【（目标树未镶嵌石榴籽玉时改为：目标树尚未镶嵌石榴籽玉，源树灵气不并入）】；源树已镶嵌的石榴籽玉随树作废，不返还、不可重镶。/ 本次操作不消耗竹片与石榴籽。本次将迁移【NN】人、【MM】个家族。/ 是否确认汇宗？」 | 始祖档案（镜像态）点「⛩ 汇宗」→ 提交前确认（**不可逆**） |
| **H2** | 汇宗成功 | 「汇宗完成：已把「【源树名】」并入「【X 姓名】」之下，迁移【NN】人、【MM】个家族；灵气并入【YY】天」 | 200 后 toast + 跳转目标树 |
| **H3** | 汇宗范围变化 | 「汇宗范围已变化（当前【N】人，确认时【M】人），请重新确认」 | 409（`DELETE_SCOPE_CHANGED`）→ 保持在弹窗内可重试 |

### 9-3 前端文件与接口封装

| 文件 | 变更 |
|---|---|
| `frontend/src/business/api.ts` | 新增 `postEstablishBranch(treeId, personHandle)` → `POST /admin/establish-branch`；`postConvergeClan(treeId, targetPersonId, confirmPeople)` → `POST /admin/converge-clan`；错误对象透出 `code` / `need` / `current` / `how_to_get` |
| `frontend/src/business/index.ts` | 上述两个函数转出（与 `submitJoinRequest` / `postMountJade` 同风格） |
| `frontend/src/business/types.ts` | `EstablishBranchResult`（含 `founder` / `fee`）与 `ConvergeClanResult`（含 `spirit`）类型 |
| `frontend/src/components/person-manage-panel/person-manage-panel.vue` | 「🌱 立支（新家族树）」入口（L1 弹窗 + 费用提示 + L2/L3 反馈） |
| `frontend/src/components/person-archive/person-archive.vue` | 始祖操作区新增「⛩ 汇宗（并入他树）」（仅 `chief_editor`，H1 不可逆弹窗 + H2/H3 反馈）；立支入口也可内联在本组件的谱系管理区（与加父/加子/删除同区） |
| `frontend/src/components/family-messages/family-messages.vue` | **本轮不改**：汇宗为 `chief_editor` 直接执行，不产生待办类型；若改为申请制（§13-7）再新增待办 |
| `frontend/src/pages.json` | 不新增页面（两入口均落在既有档案组件内） |

---

## 10. 测试与约束

### 10-1 单测 `cloudfunctions/compat-api/lib/branch-clan-ops.test.js`（`node --test`）

数据安全基线照 `lib/node-delete.test.js` / `lib/economy-fee.test.js` 既有模式：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 `/tmp` 副本，文末 md5 断言真源未变。

| # | 用例 | 断言要点 |
|---|---|---|
| 1 | 立支 · 祖先链上移 | 上移集合 = N 到始祖节点的整链（除始祖镜像）；迁入后挂在该祖谱 `founder_handle` 节点之下 |
| 2 | 立支 · 换树不换号 | 迁入节点的 `handle` 与 `gramps_id` **逐字不变**（`docs/id-system.spec.md`） |
| 3 | 立支 · 详情随迁改键 | 详情文档 `_id` = `<宗谱>:<handle>`，**旧键不存在且新键有内容**（专防「只删未写」） |
| 4 | 立支 · 新树始祖镜像 | 新树仅 1 个节点（N 的镜像），`external_link_type='founder'` + `external_mirror='true'` + `external_person_handle = N.handle` + `external_tree = 原树`；新树不含其他真实节点 |
| 5 | 立支 · 原树归属 | 原树保留 N 及全部后代（人数 = 原人数 − 上移人数）；`tree-meta.founder_handle = N.handle`、树 JSON 顶层 `founder_gramps_id` = N 的编号 |
| 6 | 立支 · 宗谱两条登记 | 宗谱自有段新增 2 条 `link_type='founder'` 登记镜像（各指向原树 / 新树）；支系入口列表推导新增 2 个入口 |
| 7 | 立支 · 扣费不足 409 且不写 | 可用籽 = 9998 → 409 `ASSET_INSUFFICIENT`（`need = 9999`、`current = 9998`、`unit = 'seeds'`）；原树 / 新树 / 宗谱 / tree-meta / 资产**逐字节不变**、无新树文件残留 |
| 8 | 立支 · 事务回滚冲正 | 注入落库失败 → 结构回滚（原先祖链仍在原树、新树文件回收）+ 资产总分还原 + 存在 1 条 `Tx.type='fee_refund'` + 返还到**原批次**（原 `qty` / `expires_at`） |
| 9 | 立支 · 无宗谱 / 落点空 | 无 `clan_tree_id` → 400「请先为该家族建立或认祖宗谱」；宗谱 `founder_handle` 空 → 400（均不扣籽） |
| 10 | 立支 · 始祖 / 镜像 / 总谱祖谱 | 始祖位 → 400；镜像节点 → 400；`zhonghua` → 400；`kind='clan'` → 400（均不扣籽） |
| 11 | 立支 · 跨树引用红线 | 上移链上任一节点被他树 `external_person_handle` 引用（或被他树 tree-meta `founder_handle` 登记）→ 400 且**所有参与的树都不写**、不扣籽 |
| 12 | 汇宗 · 整树迁移 + 条目删除 | 源树全部真实节点（含家族）迁入 X 的家族下；`handle` / `gramps_id` 不变；源树 tree-meta 条目不存在、源树树 JSON 不存在；详情改 `_id` 后旧键不存在 |
| 13 | 汇宗 · 家族复用顺序 | X 已有「本人在对应槽位且另一半空着」的家族 → 直接挂入；否则取 X 任一家族；都没有 → 新建（编号由 `nextFamilyId()` 铸） |
| 14 | 汇宗 · 始祖镜像丢弃 | 源树始祖镜像节点不随迁、随树丢弃；目标树内不出现该节点 |
| 15 | 汇宗 · 跨树引用红线 | 迁移集合任一 handle 被他树引用 / 被他树 `founder_handle` 登记 → 409；两棵树 md5 不变、tree-meta 不变、`jiazu_spirit` 不变 |
| 16 | 汇宗 · 折损比例与取整 | `比例 = 0.5`；剩余 10 天 → 并入 5 天；剩余 3 天 → 并入 2 天（`ceil(3 × 0.5) = 2`，**不得四舍五入**）；`spirit_expires_at` 已过（buffer / expired）→ 折损 0 天 |
| 17 | 汇宗 · 叠加不覆盖 | 目标树原 `spirit_expires_at` 在未来 → 并入后 = 原值 + 折损天数（≥ 原值，不缩短）；写 `buffer_until = null` |
| 18 | 汇宗 · 目标树未镶嵌跳过 | 目标树无 `jiazu_spirit.trees[目标树]` 记录 → 200 + `spirit.transferred_days = 0` + `skipped_reason` 非空；**不出现「无玉却有灵气」的记录** |
| 19 | 汇宗 · confirm_people 不符 | 不符 → 409（`DELETE_SCOPE_CHANGED`）；不写树、不删 tree-meta、`jiazu_spirit` 不变、无任何 `Tx` |
| 20 | 汇宗 · 0 片 0 籽 | 操作前后 `jiazu_assets` 总分（`fragments` / `seeds` / `bamboos` / `jades`）逐字节一致，`txs` 不新增 |
| 21 | 汇宗 · R5 口径保持 | 源树 `jiazu_spirit.trees[源树]` 记录保留、`status='expired'`；源树已镶嵌玉不返还（`jades` 不新增、不产 `SeedLot`、`mounted_tree_id` 留痕保留） |
| 22 | 汇宗 · 目标解析与校验 | 目标编号属源树 → 400；目标树为 `kind='clan'` / `master` → 400；目标是镜像节点 → 400；解析不到 → 404 |
| 23 | **真源未变** | `migrate-output/trees/*.json`、`migrate-output/details/*.json`、`config/tree-meta.json`、`migrate-output/collections/*.json` 的 md5 与测试前逐字节一致 |
| 24 | **数值契约** | 立支费 **9999** 籽（可被 `jiazu_wallets.config.branch_fee_seeds` 覆盖）、汇宗比例默认 **0.5**、汇宗 **0 片 0 籽**、折损 `ceil` 三处表达式与 §6-2-6 逐字一致 |
| 25 | **立支 · 详情缺失告警出参**（本轮新增，§8-1 `warnings?`） | 上移链中某节点**详情文档缺失**时：`warnings` 为 `string[]` 且含该节点提示；**无缺失时不出现该字段**（不是空数组）；两种情况下 `moved_ancestors` / `moved_families` 与结构写入结果一致（详情 best-effort 不冲正、不改计数） |

### 10-2 注册与门禁

| 项 | 口径 |
|---|---|
| `package.json` | `scripts.test` **末尾追加** `cloudfunctions/compat-api/lib/branch-clan-ops.test.js`（既有测试文件保持不变、纯追加不重排；追加后共 **20 个**，实测一致，旧记「19 个」已作废） |
| `npm test` | 保持全绿；**新测试文件未注册进 `scripts.test` = 等于没测** |
| 写路径约束 | 一律经 `lib/store.js` 的 `colGet` / `colSet` / `updateTrees` / `saveDetail`；**禁止任何路径直写** tree-meta / 树 JSON / 详情；单测只用 `COMPAT_OUT_DIR` 副本，**不得触碰** `migrate-output/` 真源与 `config/tree-meta.json` |
| 前端 | `npx vue-tsc --noEmit` 必须 exit 0 |
| 不变量 | 迁移前后 `handle` / `gramps_id` 不变；迁移后树内无悬空引用（`repairTreeRefs` 报告为空）；灵气到期时刻只增不减；无负资产；不存在「无凹槽却有灵气」的 `jiazu_spirit` 键 |

---

## 11. 实施清单（文件级）

| # | 文件 | 内容 |
|---|---|---|
| 1 | `cloudfunctions/compat-api/lib/branch-clan-ops.js`（**新**，纯模块为主，可单测） | `establishBranch()`；`convergeClan()`；纯函数 `planAncestorChainMove(...)`（上移集合 + 迁入挂接）、`planBranchRegistrations(...)`（宗谱两条登记）、`planConvergeMove(...)`（迁移集合 + 落点家族复用顺序 + 始祖镜像丢弃）、`computeSpiritTransfer({ sourceExpiresAt, now, ratio })`（折损天数）；外树体检复用 `tree-write.scanExternalRefs` 同款逻辑（导出或抽公共函数） |
| 2 | `cloudfunctions/compat-api/index.js` | 两条路由 `POST /admin/establish-branch`、`POST /admin/converge-clan`（注册在树编辑闸门之前）；立支 = `requireWriteUser` → 结构校验 → 体检 → `charger(phone,'establish_branch')` / `chargeSeeds` → 写入 → catch 里 `refundCharged`（带 `fee_refunded: true`）；汇宗 = `chief_editor` 校验 → 结构校验 → 体检 → `confirm_people` 比对 → 写入；错误体统一走 `eco.errorPayload` |
| 3 | `cloudfunctions/compat-api/lib/economy-fee.js` | `FEE.branch_fee_seeds = 9999`（默认值唯一真源，运行时可被 `config.branch_fee_seeds` 覆盖）；`TX_TYPE_OF_OP.establish_branch = 'tree_create'`（复用既有枚举）；`feeOf('establish_branch')` → `{ unit:'seeds', pieces: 9999, tx_type:'tree_create' }`；`feeOf('converge_clan')` → 0（`free: true, reason:'not_charged'`）；`estimate` / `charger` 不变形 |
| 4 | `cloudfunctions/compat-api/lib/tree-write.js` | 抽出 / 复用 `reusableParentFamily` / `ensureParentFamily`（汇宗落点）；`repairTreeRefs` 用于摘链与迁出后的悬空引用修复；`createTreeFile` 用于新树首写；详情随迁沿用 `saveDetail` + `deleteDetail`（**显式 `_id`**） |
| 5 | `cloudfunctions/compat-api/lib/clan.js` | `listClanBranches` 推导扩展：宗谱自有段里 `external_link_type='founder'` 的登记镜像按其 `external_tree` 计入支系入口（§6-1-6） |
| 6 | `cloudfunctions/compat-api/lib/wallet.js` | 设置载体扩展：`config.branch_fee_seeds`（默认 9999）、`config.converge_spirit_ratio`（默认 0.5）的读取（`getBranchFeeSeeds()` / `getConvergeSpiritRatio()`）与后台写入（沿用 `PUT /admin/wallet-fee`） |
| 7 | 前端 | `business/api.ts`（`postEstablishBranch` / `postConvergeClan`）；`business/index.ts`（转出）；`business/types.ts`（`EstablishBranchResult` / `ConvergeClanResult`）；`components/person-manage-panel/person-manage-panel.vue`（立支入口 + L1/L2/L3）；`components/person-archive/person-archive.vue`（汇宗入口 + H1/H2/H3） |
| 8 | 测试 | `lib/branch-clan-ops.test.js`（§10-1 全 25 条）+ 注册进 `package.json` 的 `scripts.test` |
| 9 | 文档 | 本文件；`docs/economy-fee.spec.md`（§3-1 #34 / #35 + 合计口径）；`docs/spirit-domain.spec.md`（§4-1 说明四追加引句）；`docs/clan-tree.spec.md`（支系入口列表推导扩展的引用小节） |

**明确不改**：`lib/marriage.js`（无婚姻语义变更）、`lib/founder-attach.js`（认祖原语不动）、`lib/id-seq.js` / `lib/id-resolve.js`（只被调用）、`POST /admin/split-tree`（§3-14 保留现状）、`family-messages.vue`（汇宗不做申请制）。

---

## 12. 部署要点

| # | 条目 | 说明 |
|---|---|---|
| 1 | **新增路由 2 条** | `POST /admin/establish-branch`、`POST /admin/converge-clan` → **必须重打包 `compat-api`** 后部署：`npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js` → `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`（流程见 `docs/PENDING_DEPLOY.md` §1；本规格**不去改** `docs/PENDING_DEPLOY.md`，部署轮统一登记） |
| 2 | **新设置键 2 个** | `jiazu_wallets.config.branch_fee_seeds`（默认 **9999**）、`jiazu_wallets.config.converge_spirit_ratio`（默认 **0.5**）；**无需新建集合**、**无需新增上传项**（`jiazu_wallets` 已在既有上传清单内） |
| 3 | **前端产物** | 必须重打包 `build:h5`（带 `VITE_API_BASE`）+ `build:mp-weixin`，否则线上无立支 / 汇宗入口与弹窗；不新增 `pages.json` 路由 |
| 4 | 数据侧 | 两条操作**不迁移真源数据**：`migrate-output/` 与 `config/tree-meta.json` 保持现状，运行时按业务接口写入 |
| 5 | 部署后冒烟 | ① 立支：普通节点 → 200（新树出现、祖先链进宗谱、扣 9999 籽、响应 `fee.amount = 9999`）；籽不足账号 → 409 且数据未变；始祖位 → 400；② 汇宗：`chief_editor` 对某家族树始祖 → 200（源树消失、节点进目标树且编号不变、目标树灵气延长折损天数）；非 chief → 403；跨树婚姻中的树 → 409；`confirm_people` 不符 → 409 且不写 |

---

## 13. 待确认默认口径（按此实现，如不符**一句话即可改**）

| # | 默认口径 | 一句话改法 |
|---|---|---|
| 1 | **源树已镶嵌玉的处置**（**已拍板并关闭 · Kevin 2026-09-17**）：随树作废、**不返还、不可重镶**（§3-9，与 R5 一致） | **已关闭 · 不再是可改点**：Kevin 2026-09-17 拍板「汇宗不涉及到永久玉，只涉及到原家族树的时流子域的有效期，只计算有效期的折损就可以」→ 汇宗只折算源树**「时流子域」的有效期**（§3-10），玉本身**不迁移、不返还、不计价**。历史留痕：原备选「玉本身随迁到目标树凹槽」与 `docs/spirit-domain.spec.md` §5-3「凹槽已占 / 镶嵌不可逆」冲突，已由本拍板否决（§3-9 / §3-10 已同步为已拍板） |
| 2 | **目标树未镶嵌玉 → 不并入灵气、只提示**（灵气无载体，不产生「无玉却有灵气」的非法态） | 改为「源树灵气先寄存，待目标树镶玉后再并入」（需新增寄存字段）；或允许无玉有灵气（不建议） |
| 3 | **立支新树始祖镜像的标识**：镜像铸**新 handle**、`gramps_id` 走 `nextPersonId()` 铸全站新号（N 真身编号不变） | 若要求镜像复用 N 的编号（不再全站唯一）→ 与 `docs/id-system.spec.md` §2 冲突，需先改该规格 |
| 4 | **上移链含始祖镜像的处理**：默认**丢弃**始祖镜像，迁入链直接挂在宗谱自有段落点（如「季花」）之下 | 若要求「始祖镜像随迁并入宗谱」（去重后保留）→ 改 `planAncestorChainMove` 一处 |
| 5 | **原树 `clan_handle` 随始祖变更改写**为「原树 · N 登记镜像」handle（保持「`clan_handle` = 该树在宗谱的落点」不变式） | 若要求原树 `clan_handle` 保持原值（如仍指「季花」）→ 改一处写入 |
| 6 | **支系入口列表推导扩展**：新增「宗谱自有段的 `link_type='founder'` 登记镜像按其 `external_tree` 计入入口」这一分支（否则立支后两树不会出现在列表） | 若要求严格沿用既有推导（只看普通树始祖镜像的 `external_tree`）→ 改为在普通树侧另写指针字段（需新增字段） |
| 7 | **汇宗不做申请-审批**：`chief_editor` 直接执行 | 可改为「目标树侧确认的申请制」：新增一种待办类型到 `family-messages` / 管理台（本规格不预设该形态） |
| 8 | **立支 `Tx.type` 复用既有 `tree_create`**（不新造枚举值） | 若要求立支单独记账：需先在 `docs/economy.spec.md` §4-6 的 `Tx.type` 清单增一个取值，再改 `TX_TYPE_OF_OP` 一处 |
| 9 | **汇宗「范围变化」409 复用既有已登记域名码 `DELETE_SCOPE_CHANGED`**（不新造码） | 若要求专属码（如 `CONVERGE_SCOPE_CHANGED`）：需先在 `docs/economy-fee.spec.md` §6 登记后方可使用 |
| 10 | **源树内非始祖之外的镜像节点**（跨树婚姻镜像等）默认视为**体检不过（409）**，提示先解除跨树关系 | 可改为「随树丢弃、不额外拦截」（需接受对方树镜像变成悬空指针） |
| 11 | **源树 `jiazu_spirit` 的 `spirit_expires_at` 保留原值作废留痕**（源树已不存在 → 相关路由 404，惰性结算不再推进该键） | 若要求一并置空（彻底杜绝以该键重新激活）→ 改一处写入 |
| 12 | **源树成员锚点与 pending 申请**：保留记录、随树作废（不级联删用户账号数据） | 若要求同步清除锚点 / 驳回 pending 申请 → 各改一处写入 |
| 13 | **后台设置读写沿用既有治理路由 `PUT /admin/wallet-fee`**（携带 `branch_fee_seeds` / `converge_spirit_ratio`） | 若要求独立设置路由 → 新增一条治理路由即可（不新建集合） |
| 14 | **两条路由不要求 `X-Tree-Id` 头**（树 id 取 body 的 `tree_id`），注册在树编辑闸门之前 | 若要求沿用 header 上下文 → 移到闸门之后并改前端封装一处 |
| 15 | **折损并入不追加 `SpiritLog`**（该形态只承载灌注、`plan` 为五档枚举，`docs/economy.spec.md` §4-2） | 若要求留痕：需先在总册为该形态增一个「非灌注的灵气变更」记录形态 |
| 16 | **折损天数 = `ceil(ceil(剩余毫秒 / 86400000) × 比例)`**（先取整天数、再乘比例、再向上取整） | 若要求按毫秒直接折算（`ceil(剩余毫秒 × 比例 / 86400000)`）→ 改一处表达式（跨日边界可能差 1 天） |
| 17 | **目标树「已镶嵌但未灌注」（`spirit_expires_at = null`）默认并入**（基期 = `now`，并入后由惰性结算转 `'active'`） | 若要求与「未镶嵌」同等待遇（不并入、只提示）→ 改一处判定 |
| 18 | **立支出参 `fee` 形状**按派单：`{ unit:'seed', amount, balance_after }`（与总册 §5-8 的 `{ unit:'bamboos' \| 'seeds', pieces, balance, balance_after }` 不同形）；**实现约束**：后端必须**单独组装**本字段（`amount` = 本次生效值、`balance_after` = 扣费回执的余额），**不得走 `feeOf()` 的 `{pieces,balance}` 形状**、不得为对齐总册而改写本形状 | 若要求与既有 `fee` 同形 → 改一处出参组装（前端类型同步） |

> 上表 #1–#18 = **默认口径**（按此实现，一句话可改）；其中 **#1 已由 Kevin 2026-09-17 拍板并关闭**（不再是可改点，见该行；§3-9 / §3-10 已同步为已拍板）。下五条 **§13-19 / §13-20 / §13-21 / §13-22 / §13-23 = 待裁决风险**：由上一轮与本轮实现暴露，**本轮只登记、不自行拍板**；拍板后回改正文（§5-3 / §6-1-6 / §6-2 相关段落）并同步测试用例。

### 13-19 立支「旁支处置」（待裁决 · 只登记）

**现状（已实现）**：上移集合 = N 的**上级链**（N 的父 → 其父 → … → 本树始祖节点，含沿途家族记录，§6-1-3；**链顶连着始祖镜像的那个家族记录例外、留在原树**，见 **§13-22**）；链上祖先的**配偶与旁支子女（叔伯 / 堂亲）不在集合内**。

**后果（血脉图示）**：上移的是**链上除始祖镜像外的真实节点与家族**（§6-1-3）；随迁集合之外的人（链上祖先的配偶与旁支子女）留在原树，**但没有与原树断根**——链顶那个**连着始祖镜像的家族记录留在原树、只摘掉随迁子女**（`lib/branch-clan-ops.js` 立支链处理注释：「链顶家族留在原树：只摘掉随迁子女（旁支子女继续挂在旧始祖镜像之下）」）→ **旁支子女仍挂在旧始祖镜像之下**、父系挂接未被摘除（此处不产生 `repairTreeRefs` 的悬空修复），原树仍是「旧始祖镜像之下的一整支」、**不出现多根**；新生出的新树另有 1 根。

**代价 / 残留（现象）**：原树里因此**遗留那个旧始祖镜像**（`external_mirror='true'` + `external_link_type='founder'` + `external_tree` = 本祖谱，**位置在 N 之上**），且**既有支系入口推导立支后仍命中原树** → 两支入口的成立路径不一致（原树走残留镜像的旧路径，新树只能走登记镜像的新路径）。残留镜像本身的读侧后果与另一条备选见 **§13-22**（两条须同批拍板）。

**备选（供拍板，不自选）**：
1. **上移集合扩为「原树全部节点 − N 子树」**：链上祖先的配偶 / 旁支子女一并上移并入宗谱自有段 → 原树不再需要为旁支保留父系，链顶家族与旧始祖镜像可一并丢弃（§13-22 的残留随之消失）；代价 = 上移人数与家族数可能远大于直系，宗谱自有段一次膨胀较多，且须与 §13-21 同批改齐。
2. **保留直系迁法 + 为旁支补跨树镜像父节点**：若按 §13-22 备选 2 丢弃原树的旧始祖镜像，则须同时给每个旁支补一个指向宗谱（真身）的跨树镜像父节点以保持连线；代价 = 写入面变大（新增镜像节点与只读判定），并触及镜像只读口径。
3. **维持现状**：接受原树残留旧始祖镜像（在 N 之上，§13-22）与既有推导继续命中原树；后续由人工 / 迁移修。

> 与 **§13-22** 互为对照：§13-19 记「旁支在原树的父系怎么留」（本册口径 = 靠留在原树的链顶家族与旧始祖镜像留），§13-22 记「留下的那个镜像在读侧带来什么」——两条同批拍板。

### 13-20 祖谱登记镜像的副作用（待裁决 · 只登记）

**现状（已实现）**：按 §5-3 / §6-1-6，立支为「原树与新树**各在祖谱留一个** `link_type='founder'` 的 N 登记镜像」（镜像写法 = `external_mirror='true'` + `external_link_type='founder'` + `external_tree` = 所代表的普通树）；该镜像落在祖谱自有段里，但被 `isUpperMirror(person, 祖谱id)` 判为**上层镜像**（`external_tree` ≠ 祖谱自身 id）→ 归入祖谱**「顶端镜像段」**。

**后果（三处判定）**：
1. **自有段统计不含它**：`clanOwnNodes()` 过滤掉所有 `isUpperMirror` 节点 → 登记镜像不计入宗谱「本宗自有世代」人数（与 §6-1-6「上移链并入宗谱自有段」的语义要在读侧分清：并入的**祖先链**计入自有段，而**登记镜像本身**不计入）；
2. **`clanInfo.mirrors` 会列出它**：祖谱页顶端镜像链 / 镜像计数里会出现这两条立支登记镜像（不是「祖上真身镜像」，展示语义被混入）；
3. **重认祖会清掉它**：祖谱重认祖走 `clearClanTopMirror()`，会把这两条登记镜像一并删除 → **支系入口随之丢失**（§6-1-6 的入口推导完全依赖这两条镜像的 `external_tree`）。

**备选（供拍板，不自选）**：
1. **不插节点**：支系入口列表改由**读侧推导**（各普通树 `tree-meta` 的 `clan_tree_id` / `clan_handle` + 始祖父系落点），祖谱树 JSON 不再写登记镜像 → 上述三处判定都不受影响。
2. **保留镜像 + 加独立标记字段**（如 `external_registration = 'true'`），并同时修正上述三处判定（`clanOwnNodes` / `clanInfo.mirrors` / `clearClanTopMirror` 各自排除该标记）。
3. **维持现状**：接受「登记镜像被计入顶端镜像段、且重认祖即丢入口」的现状。

### 13-21 汇宗迁移的「旁支断根 / 多根」现象（待裁决 · 只登记）

> **Kevin 2026-09-17 复核：暂未决定 → 维持现状实现，不得擅自更改**（本轮只登记，不自行选定备选）。

**现状（已实现）**：迁移集合 = 源树**全部真实节点**（`external_mirror !== 'true'`，§3-8 / §6-2-3）；迁移家族 = **至少一位家长在迁移集合内**的家族记录——**家长全是镜像的家族记录（连着被丢弃始祖镜像的那个家族）留在源树、随树作废**；于是源树里的**旁支**（与链顶真实节点同辈、其父家族连着被丢弃始祖镜像者）**不随迁其父家族**（`lib/branch-clan-ops.js` 的 `planConvergeMove()`：`movedFamilies` / `discardedMirrors` / `roots`）。

**后果（与 §13-19 同形，方向相反）**：这些旁支在目标树里**失去原父系家族、成为无父根**——除链顶真实节点这条主根之外，旁支也各自成一个根，且**一并被挂到 X 的家族之下** → 目标树在 X 之下出现**第二个（多个）根 / 支**，与「源树整体是单一始祖之下的一整支」的观感不一致。**实测**：`lib/branch-clan-ops.test.js` 的 `planConvergeMove` 纯函数用例断言 `roots` = 主根 + 旁支两条，两者同挂 X 的家族、`checkTreeIntegrity` 为空；该现象**规格未单列**（原依据只有 §6-2-3「迁移集合 = 源树全部真实节点」+ §6-2-4 ②「家族整体搬入并重挂」）。

**备选（供拍板，不自选）**：

1. **与 §13-19 一并扩集合**：迁移集合 / 迁移家族口径一次改到位（两条操作同一批改动），使旁支在其原父系家族下随迁 → 目标树不再多头；代价 = 与立支侧同批改动、两处口径必须一次改齐（汇宗侧源树将被删除，家族记录须整体搬入目标树）。
2. **为旁支补跨树 / 同树镜像父节点**：保持旁支的父系连线，使其不再成为独立根；代价 = 写入面变大（新增镜像节点与只读判定），并触及镜像只读口径。
3. **维持现状**：接受目标树下多根，后续由人工 / 迁移修。

### 13-22 立支后原树残留的旧始祖镜像（待裁决 · 只登记）

> **Kevin 2026-09-17 复核：暂未决定 → 维持现状实现，不得擅自更改**（本轮只登记，不自行选定备选）。

**现状（已实现）**：立支时**连着始祖镜像的那个家族记录留在原树**（只摘掉随迁子女），**该始祖镜像本身也留在原树**（`lib/branch-clan-ops.js` 立支链处理注释：「链顶家族留在原树：只摘掉随迁子女（旁支子女继续挂在旧始祖镜像之下）」，即**新树首写与宗谱迁入侧丢弃始祖镜像、原树侧保留它作旁支父系**）；因此立支后原树里仍存在 `external_link_type='founder'` + `external_mirror='true'` + `external_tree` = 本祖谱的旧始祖镜像节点（`lib/branch-clan-ops.test.js` 断言该节点留在原树）。

**后果（支系入口列表的两条推导路径并存）**：既有推导（「某普通树的始祖镜像 `external_tree` = 本祖谱」，`lib/clan.js` 的 `listClanBranches` → `lib/founder-attach.js` 的 `listAttachedTrees`）**立支后仍命中原树**（残留镜像仍带 `external_tree` = 本祖谱）；而**新树**的始祖是「N 的始祖镜像」（其 `external_tree` = **原树**、不是祖谱）→ 既有推导**认不出新树**，新树的入口**只能由 §6-1-6 新增的「宗谱自有段登记镜像」分支给出**。**实测**：`listAttachedTrees` 只返回原树（不含新树）；`listClanBranches` 按 `tree_id` 去重 → 原树被两条路径同时命中、入口条数仍为 2（`lib/branch-clan-ops.test.js`）。

**备选（供拍板，不自选）**：

1. **接受双路径推导**（现状）：原树由残留镜像的既有路径命中、新树由登记镜像的新路径命中，两条路径并存、按 `tree_id` 去重 → 读侧结果不变；代价 = 两支入口的成立路径不一致（原树可走旧路径，新树只能走登记镜像路径）。
2. **随上移一并丢弃原树的旧始祖镜像**：入口推导只剩登记镜像单路径（口径更一致），但必须**一并处理旁支的父系挂接**（否则丢弃该镜像后，旁支在原树**断根成为独立根**——这正是 §13-19 备选 1 / 备选 2 要同时处理的那一步），需与 §13-19 同批拍板。

### 13-23 汇宗红线把「**目标树自身指向源树节点的镜像**」也算作阻断（待裁决 · 只登记）

> **Kevin 2026-09-17 复核：暂未决定 → 维持现状实现，不得擅自更改**（本轮只登记，不自行选定备选）。

**现状（已实现）**：汇宗的跨树引用体检（§6-2-3）对迁移集合每个 handle 跑 `tree-write.scanExternalRefs`；该扫描覆盖**除源树以外的全部树**（`lib/tree-write.js`：`const ids = (await listIdsFn()).filter((id) => id && id !== treeId)`），且同时命中他树节点的 `external_person_handle` 与他树 tree-meta 的 `founder_handle` 登记。因此**目标树自身**里指向源树节点的镜像（婚姻 / 子女镜像等，其 `external_person_handle` ∈ 迁移集合）**同样被算作阻断方** → **409**（`lib/branch-clan-ops.js` 的 `refRefusal`：只列前 3 条 + 「等共 N 处」）。

**实测**：把 `ji_23395_01`（87 真实节点）并入**持有其婚姻 / 子女镜像**的 `gu_39038_01` 时被 **409**（`scanExternalRefs` 扫全部非源树；实测命中 **7** 个镜像节点）→ **必须先手工删掉这 7 个镜像**才能跑汇宗正例。

**后果**：本项目树与树普遍因婚姻 / 子女而互相挂镜像（§6-2-3 推论：跨树婚姻是双侧写指针）→ **最常见的汇宗场景（并回持有其婚姻 / 子女镜像的树）被红线拦住**，且阻断方就是**目标树自己**（不是「请先到对方树解除关系」的第三方）。

**备选（供拍板，不自选）**：

1. **给红线加一条例外**：「**目标树里指向源树节点的镜像**」不阻断，并在**同一事务**里把它们**折叠**（删镜像、家族槽位改指真身）。口径要点：例外只对**目标树**成立（**源树侧**见 §13-10、**第三方树**的镜像与 tree-meta 登记仍按 §3-11 阻断）；折叠须与迁移在**同一次** `updateTrees([源树, 目标树])` 内完成，不得出现「镜像已删 / 真身未挂」的中间态；折叠后目标树家族槽位由镜像 handle 改指真身 handle（换树不换号，`handle` / `gramps_id` 不变）；折叠掉的镜像**不计入** `moved_people`（§6-2-5「镜像节点不计入」）须在用例中固定。代价 = 写入面变大（新增「入向镜像折叠」写入路径 + 只读判定的例外）。
2. **不例外，但把 409 文案改为逐条列出阻断方**（树名 + 节点编号 / 姓名）：现状只列前 3 条（`refRefusal` 的 `.slice(0, 3)` + 「等共 N 处」）→ 改为全量逐条；前端 H1 / H3 提示与 §7-2 该行同步（便于手工解除，尤其当阻断方在目标树内时）。
3. **维持现状**：接受「先手工删掉目标树里的入向镜像、再汇宗」。

> 与既有条目的关系：本条是 §3-11 红线在「**目标树自身的入向镜像**」这一情形下**例外与否**的问题；与 **§13-10**（**源树侧**非始祖镜像默认阻断）**不同侧**、互不替代；两条都判完后才回改 §6-2-3 正文与用例。**本轮只登记、不自行拍板**。

---

## 14. 本轮同步修订的其它规格（留痕）

| 文件 | 修订条目 |
|---|---|
| `docs/economy-fee.spec.md` | §3-1 主表末尾追加 **#34 立支**（9999 颗石榴籽 / 次）、**#35 汇宗**（0 片 + 0 籽）；合计口径同步为「34 行 / 编号排到 #35 / #32 空缺 / 扣费行 7 行 / 0 片行 27 行」；§9-1 的两处矩阵计数（6 个扣费行 → 7、26 个 0 片行 → 27）同步 |
| `docs/spirit-domain.spec.md` | §4-1 说明四（R5）**追加一句**：经【汇宗】并入他树的情况适用本规格的资产折损口径（灵气剩余 × 比例累加至目标树、源树玉仍不返还）；无凹槽的目标树不并入时长（**R5 原文结论不改写**） |
| `docs/clan-tree.spec.md` | 新增一小节，引用本规格的「宗谱登记镜像」与「支系入口列表推导扩展」（§6-1-6），保持指向本规格、不重述数值 |

---

## 15. 实现偏差登记（已核对实现 · 只登记）

> 本节逐条登记上一轮**实现**与规格正文之间的实际差异。**状态列**：**已接受** = 按实现口径继续（规格不再改实现）；**待补** = 缺口未闭合，需后续轮次补；**待同步**（**历史状态词**：本节当前已无此项）= 本册本轮改了口径，实现需跟一处；**本轮实施中** = 该条目由**本轮并行实施轮**落地，本行只记录写入时刻的实测状态、不判定缺口是否闭合（结论由该轮回写）。所有条目都写明位置，便于逐条核对；本节不新增数值，只引用既有值（9999 / 0.5 / 0 片 0 籽 / 路由名 / 字段名）。

| # | 状态 | 偏差 | 位置 / 事实 | 处置 |
|---|---|---|---|---|
| 1 | 已接受 | 两条操作**均不提供 `dry_run`**：立支路由不解析该字段；汇宗改用二次强确认 + 一次请求带 `confirm_people` | `cloudfunctions/compat-api/index.js` 两条路由段（立支 / 汇宗，均在树编辑闸门之前）；与 §6-1-7 / §8-2 一致 | 保持现状，规格已在 §6-1-7 与 §8-2 写明 |
| 2 | 已接受 | **权限按全局角色判定、不校验「本树锚点」**：立支 = `chief_editor` 或 `tree_steward` 任一即通过；汇宗 = 仅 `chief_editor`；另：guest 立支 → 403、登录但用户记录缺失 → 汇宗 403（而非 401） | 两条路由内联鉴权（沿用既有 `requireWriteUser` **角色**口径）；§6-1-1-2 原写「发起人**须对本树**有写权」 | 沿既有角色口径；本册 §6-1-1-2 的「本树」含义按**角色**读，不新增锚点校验 |
| 3 | 已接受 | 立支 **403 文案落地值** = 「立支需要本家族树主理人（tree_steward）或总编辑（chief_editor）权限」 | 立支路由；§7-1 该行原写「沿用既有文案」 | 以实现文案为准（§7-1 已按此读） |
| 4 | 已接受 | 立支**两处 400 未在拒绝矩阵中列出，但已落地**：① 节点不属本树 →「该节点属于家族树【tree_id】，请在所属家族树内立支」；② 节点无上级祖先（不在始祖链上）→「该节点不在本树始祖链上（无上级祖先），无法立支」 | `lib/branch-clan-ops.js` 的 `establishBranch()` 校验段（对应 §6-1-2 表） | 视为 §6-1-2 矩阵的**隐含项**（同一 400 码）；文案以实现为准 |
| 5 | 已接受 | 汇宗**一处 400 未在拒绝矩阵中列出，但已落地**：源树无可迁移真实节点 →「该家族树没有可迁移的真实节点，无法汇宗」 | `lib/branch-clan-ops.js` 的 `convergeClan()` 校验段（对应 §6-2-2 表） | 同上，视为 §6-2-2 矩阵隐含项 |
| 6 | 已接受 | 汇宗 `skipped_reason` 有**第三态**（§6-2-7 只列了两例）：`ceil(剩余天数 × 比例) ≤ 0` 天 →「源树灵气剩余有效期为 0 天（已过缓冲期），无可并入天数」；三条跳过判定的判定顺序 = 源树无玉 → 目标树无玉 → 折损 ≤ 0 天 | `lib/branch-clan-ops.js` 的 `applySpiritTransfer()` | 第三态同样计入 200 + `skipped_reason`；用例 18 口径不变 |
| 7 | 已接受 | **未并入时 `transferred_days = 0`，但 `source_days_left` 回真实值**（不归零） | 同上（`transferred_days: skippedReason ? 0 : …`，`source_days_left` 直接来自 `computeSpiritTransfer`）；与 §10-1 用例 18 一致 | 保持现状（前端 H1 的「剩余【XX】天」取 `source_days_left`，折损显示取 `transferred_days`） |
| 8 | 已接受 | **系统级失败文案两处一致**：立支落库失败走共享 `errorPayload` → 「服务内部错误」；汇宗 ④/⑤ 阶段失败走的**本地常量亦为「服务内部错误」**，与共享口径**逐字一致**（原「本地同义常量『服务器开小差了，请稍后重试』」已不存在） | 立支路由 catch；汇宗 `markShellSource()` 后的 `fail(INTERNAL_ERROR_TEXT, 500)`（两处）；常量定义 = `lib/branch-clan-ops.js` 的 `INTERNAL_ERROR_TEXT = '服务内部错误'`（两条 EACCES 用例断言该常量文本与回显文案） | 已闭合（本册 §7 的统一口径与实现一致，不再需要实现跟改；与 **#15** 同址同结论） |
| 9 | 已接受 | 立支 `fee` **单独组装**（不走 `feeOf()` 的 `{pieces,balance}` 形状） | `establishBranch()` 内 `const fee = { unit: 'seed', amount, balance_after }` | 与 §13-18 的新增实现约束、§8-1 的 `fee` 行一致，保持 |
| 10 | 已接受 | `Tx.type` **复用既有 `tree_create`**（不新造枚举） | `lib/economy-fee.js` 的 `TX_TYPE_OF_OP.establish_branch = 'tree_create'`（同 §13-8） | 保持 |
| 11 | 已接受 | 汇宗「范围变化」409 复用既有已登记域名码 `DELETE_SCOPE_CHANGED` | `lib/branch-clan-ops.js` 的 `SCOPE_CHANGED_CODE`（同 §13-9） | 保持 |
| 12 | 已接受 | 后台设置读写沿用既有治理路由 `PUT /admin/wallet-fee`（携带 `branch_fee_seeds` / `converge_spirit_ratio` 两个键），**不新增设置路由** | `lib/wallet.js` 的 `getBranchFeeSeeds()` / `getConvergeSpiritRatio()` / `setBranchFeeSeeds()` / `setConvergeSpiritRatio()` + 该路由内两段 `has(...)` 分支（同 §13-13） | 保持 |
| 13 | **已闭合** | **模块级单测已落盘并注册**：`cloudfunctions/compat-api/lib/branch-clan-ops.test.js`（**31 条**用例 = 实测 `grep -c '^test('`；旧记「**27 条**」已作废）已列入根 `package.json` 的 `scripts.test`（**共 20 个**测试文件、末尾追加、纯追加不重排）→ §10-1 全 25 条用例已落地 + 两条操作相关新增用例（互逆闭环 / 认祖路线回归 / 真人始祖拒绝 / `/admin/add-child` 真实 EACCES）；全量 `npm test` **327 pass / 0 fail**（旧记「323 pass」已作废） | 该测试文件（纯函数层 + HTTP 层端到端：两条路由、落库失败冲正与真实 EACCES、真源护栏、`warnings?`、折损与叠加、汇宗根数与跨树红线等）；`lib/economy-fee.test.js` 仍覆盖单价映射层（`feeOf('establish_branch')` = `{ unit:'seeds', pieces:9999, tx_type:'tree_create' }`、后台键覆盖、`tx_type` 复用；`feeOf('converge_clan')` 0 片） | 已闭合（原缺口描述 =「测试文件未落盘 / `scripts.test` 未注册」、文件计数 19，**二者均已作废**；**测试只影响本地，与云端重打包 / 重传无关**，见 `docs/PENDING_DEPLOY.md` §14-4） |
| 14 | 已闭合 | 立支出参 `warnings?`（§8-1：可选、**仅当上移祖先链中有节点的详情文档缺失**时出现，无缺失时不出现该字段）**已实现**：`lib/branch-clan-ops.js` 组装 `string[]`，**仅当非空时才挂该键**（`if (warnings.length) out.warnings = warnings`）→ 无缺失时出参保持既有字面形状不变 | 立支出参组装处（`lib/branch-clan-ops.js` 的缺失详情告警文案 + 上移链逐节点判定 + 非空才挂键处；`index.js` 立支路由段透传）；用例 = `lib/branch-clan-ops.test.js` §10-1-25（① 有缺失 → 非空且含该节点全站编号与 handle；② 无缺失 → 出参无该键） | 已闭合（§8-1 / §10-1 #25 口径**不随本行改动**；原「实现侧不产出该字段 / #25 用例未落地」的记录已作废） |
| 15 | 已闭合 | 系统级失败文案**已统一为「服务内部错误」**（§7 两条路由的唯一版本）：汇宗侧本地常量与共享口径**逐字一致**，同址两处 500 均走该常量；「服务器开小差了，请稍后重试」在本册与本实现中均不再出现 | 共享常量 `lib/economy-fee.js` 的 `INTERNAL_ERROR_TEXT`；`lib/branch-clan-ops.js` 的 `INTERNAL_ERROR_TEXT = '服务内部错误'` + 同文件两处 `throw fail(INTERNAL_ERROR_TEXT, 500)`（与 **#8** 同址）；用例 = 两条真实 EACCES（汇宗 ④ 树文件删除阶段 / ⑤ 灵气写入阶段）断言该常量文本与回显文案 | 已闭合（与 **#8** 同结论：本册口径与实现一致，不再需要实现跟改） |
| 16 | 已定性 · **非实现缺陷** | 低频 flake **已定性并修复**：它是**测试对并发写者敏感**，不是产品 / 实现缺陷——原护栏对**真源 `config/tree-meta.json`** 做逐字节比对，而该文件是**进程外写者**（运行中的 compat-api + 用户在界面上编辑）实时改写的**活文件**，用户保存的瞬间即判红（签名 = **24 / 22 / 2**）。**修法**：`migrate-output/**` 保留**逐字节**断言；`config/tree-meta.json` 改为「沙箱结构证明（本套件写不进真源）+ 夹具指纹网（真源出现夹具 `tree_id` = P0 事故）+ 变化只归因、不判红」 | `lib/branch-clan-ops.test.js` 的 `assertRealUntouched` 段（§10-1 #23 开篇与收尾各断言一次）；签名口径 **24 / 22 / 2**；修法见该文件头「真源护栏口径」注释 | 已闭合，对 §10-2「`npm test` 保持全绿」的口径**无影响**；**取证** = 忠实复现 harness 下旧护栏 **12/12 红** / 修后 **20/20 绿**，且修后累计 **120 次裸跑零复现**；原「本轮按只登记处理、不改 #13 状态列」的说明已随本轮 #13 修正作废 |
| 17 | **已同步 / 已闭合** | **汇宗对源树始祖的前置已放宽为「指向本层之上的镜像」（与立支互逆）**：`external_link_type='founder'` + `external_mirror='true'` + `external_tree` 非空且 **≠ 源树自身**即通过；其 `external_tree` 指向**祖谱**或**另一棵普通家族树**均放行 → **立支 → 汇宗 可直接闭环**（不须 detach→attach）；错误文案 = 「该家族树当前始祖不是上层镜像，无法汇宗」。本册 §1 / §2（术语「上层镜像」）/ §3-8 / §4（作用对象 + 前置）/ §6-2-2 / §7-2 与实现一致 | **实测实现已落地**：`cloudfunctions/compat-api/lib/branch-clan-ops.js` 的前置段（file:line **811–825**，`throw` 在 **:825**）只做四项判定（`external_link_type='founder'` / `external_mirror='true'` / `external_tree` 非空 / **≠ 源树自身**），**不再有 `kind='clan'` 判定**；旧记「file:line **815–822** 仍要求 `kind='clan'`」与旧文案「该家族树当前始祖不是祖谱节点镜像，无法汇宗（请先为该家族认祖宗谱）」（旧记 :821）**均已作废**。同址 3 条用例：互逆闭环 200 = `lib/branch-clan-ops.test.js:1645`、认祖路线回归 200 = **:1699**、真人始祖（非镜像）400 = **:1718**；旧记用例锚点「:1304」非本条目（该行是跨树红线 409 用例内的「解除关系后再汇宗」断言） | 已闭合（实现与用例均已跟改，§6-2-2 放宽口径为唯一版本） |
| 18 | **已闭合** | **`updateTrees` 失败侧缓存回滚已修复**（影响**全部跨树事务**：婚姻 / 跨树加子女 / 立支 / 汇宗）：失败时对**全部参与 id** 复盘 —— 已落盘者写回快照（版本号对齐当前值以通过乐观锁），**未落盘者失效进程内缓存**（`treeCache` + `eventIndexCache` 同步失效），否则 `fn` 就地改脏的缓存对象会让同进程后续 `getTree` 读到盘上不存在的「幻影结构」 | `cloudfunctions/compat-api/lib/store.js` 的 `updateTrees`（失败回滚段，file:line **463–484**；注释逐字写明「对全部 ids 复原，不只复原已落盘的一侧」） | 已闭合（原缺口 = 未落盘侧只曾脏缓存、未失效） |
| 19 | **已闭合（附列 1 处有意保留）** | **系统级失败不再泄露本机路径**：新增**单一出口** `safeError(e, fallbackStatus = 400, prefix = '')`（`cloudfunctions/compat-api/index.js:311`；白名单外 `code`（`EACCES` / `ENOENT` / …）或异常文本命中本机绝对路径正则 → 只回「服务内部错误」+ `status: 500`，**不带底层异常文本 / `code` / 本机路径**）；**17 处写树 / 写集合站点**已由 `send(e.status \|\| 400, { error: e.message })` 改为 `safeError(e)`（含 `/admin/add-child` 段 **:1059**、顶层兜底 **:2171**（`safeError(e, 500)`）、拆分类 **:1988**（带前缀））；用例已断言响应体不含本机路径片段（`lib/branch-clan-ops.test.js` 的 EACCES / 落库失败用例 + **:1740** 的 `/admin/add-child` 真实 EACCES → 500 + 通用文案） | **有意保留 1 处（登记 · 不改）**：`cloudfunctions/compat-api/index.js` 的 **`/admin/clan-request`** 段内层 `clan.assertClanFounderUnique` 的 catch（catch 起于 **:1704**，`return send(e.status \|\| 400, { error: e.message })` 在 file:line **:1705**）—— 纯同步唯一性校验、**零 IO**、不可达系统异常（不会产出含本机路径的 `EACCES` / `ENOENT`）。旧记残留锚点「`/admin/add-child` :1040」与「顶层兜底 :2126」**已随本次修复作废** | 已闭合（本条目只登记该 1 处有意保留位置，便于逐条核对；跨册审计无其他未闭合泄露入口） |
| 20 | **已登记（指路）** | **独立质检报告位置 = `docs/branch-clan-ops.qa.md`**（【Neng 质检员】对本册两条操作的独立质检报告：用例编号 T* 边界 / 红线矩阵、B* 立支正例、C* 汇宗正例、P* 立支→汇宗路径、E* 真实 EACCES 注入、R* `updateTrees` 回归；**尚在补完** —— §1 结论速览 / §5 明细表 / §6 缺陷清单 / §7 未覆盖项 / §8 真源归因 md5 待回填） | 该文件（**本册不写入**该文件、不重述其数值，只引用其路径）；缺陷清单与归因以该报告为准 | 保持指向该文件 |

> 条目性质：#1–#7 与 #9 是**实现口径已被本册覆盖 / 追认**（**已接受**，不再改实现）；#10 / #11 / #12 是**与 §13-8 / §13-9 / §13-13 同源**的复用口径（已接受）；**#8 与 #13 已随本轮实施回写闭合**（系统文案已统一为「服务内部错误」并与共享口径逐字一致；模块单测已落盘并注册 = **20 个**测试文件 / 全量 `npm test` **327 pass / 0 fail**（旧记「19 个」/「323 pass」均已作废））；**#14–#16 已回写定稿**（`warnings?` 已实现并有用例；文案已统一；低频 flake 已定性为**测试对并发写者敏感、非实现缺陷**）。本节据此**无未闭合项**（上限行 #1–#18 的默认口径与「待裁决风险」§13-19 / §13-20 / §13-21 / §13-22 / §13-23 不受本节状态影响）；本轮新增 **#17 已同步 / 已闭合**（汇宗前置放宽口径，实现与用例均已跟改）/ **#18 已闭合**（`updateTrees` 回滚）/ **#19 已闭合**（路径泄露：17 处站点统一出口 + 1 处有意保留）/ **#20 指路**（QA 报告位置 = `docs/branch-clan-ops.qa.md`）。
