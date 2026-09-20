# 始祖挂载（认祖 / Founders Attach）规格

状态：**设计已确认 Kevin 2026-09-15 · 待实施**
关联：`docs/marriage.spec.md`（同一骨架）、`docs/data-model.md`、`docs/PENDING_DEPLOY.md`

## 1. 一句话

普通家族树的**始祖节点**作为**镜像节点**指向 `zhonghua`（中华世本）中的某个节点；
建立关系可走**认祖申请**或**总编辑直接挂载**两条入口，**解除双方均可、无需申请**。

与「嫁出/娶入」同构：镜像 + 跨树单事务写入 + 申请制，差别在**基数**（总谱节点 1:N，每棵树只能挂 1 个）
与**只读范围**（始祖节点整节点只读）。

## 2. 术语

| 术语 | 含义 |
|---|---|
| 真身节点 | `zhonghua` 中承载真实数据的节点 |
| 挂载树 | 认祖成功、其始祖指向真身的普通家族树 |
| 始祖镜像节点 | 挂载树的始祖节点，`external_link_type='founder'`，本树内**整节点只读** |
| 占位始祖节点 | 未挂载 / 已解除时的始祖节点：空身份、占位态（保留 `I0001` 位置与树元数据） |

## 3. 数据结构

### 3-1 挂载树侧（始祖节点 = 镜像）

```
person: {
  gramps_id: 'I0001',                 # 始祖位置不变
  external_tree: 'zhonghua',
  external_person_handle: '<真身 handle>',
  external_link_type: 'founder',      # 新增枚举值（现有：marriage / branch / child）
  external_mirror: 'true',
  external_relation_note: '<真身姓名>（中华世本 · 第 N 世）',
}
```

- 姓名 / 性别 / 生卒 / 称号 / 结构（父、母、配偶）**全部以真身为准**，本树不落独立数据。
- 本树**只读**：UI 只读态 + 后端 403。
- 未挂载或已解除 → `external_*` 全空 + 占位态。

### 3-2 真身侧（zhonghua）

- 真身节点**不写反指针**，避免双写真相；挂载关系由「读侧」推导：
  `tree-meta.trees[*].founder_handle` → 读该始祖的 `external_*` → 若指向本节点则本树是挂载树。
- 显示：真身档案里列出 **【A 家族的始祖节点】**（多棵则多行），并给出「挂载家族树」入口。

### 3-3 基数约束

- **一树一挂载**：挂载树始祖只能有一个 `external_tree` 值（结构天然满足）；
  已挂载的树再次认祖 → **400**「该家族树已认祖，请先解除挂载」。
- **总谱节点 1:N**：同一真身可被多棵树认作始祖，无上限。
- **人数统计**：挂载树的人**不计入** zhonghua 的人数与世数统计（附挂，不参与世系链）。

### 3-4 申请集合

`jiazu_founder_requests`（新建集合，需并入部署清单 `docs/PENDING_DEPLOY.md`）：

```
{ _id, tree_id, founder_handle, master_tree_id: 'zhonghua', master_handle,
  master_name, status: 'pending'|'approved'|'rejected',
  requested_by, decided_by, reject_reason, created_at, decided_at }
```

## 4. 操作

| 操作 | 入口 | 发起方权限 | 生效规则 |
|---|---|---|---|
| **认祖申请**（方式 A） | 挂载树：始祖节点档案 →「认祖（挂到中华世本）」→ 选真身节点 | 本树 `tree_steward` / `chief_editor` | 写申请，**pending**；zhonghua 侧审批通过后建立镜像；驳回不改任何数据 |
| **直接挂载**（方式 B） | zhonghua：真身节点编辑页 →「挂载家族树」→ 选家族树 | `chief_editor` | **无需申请**，直接建立（目标树始祖随即进入只读态） |
| **解除挂载** | 双方均可：挂载树始祖档案 / zhonghua 真身档案 | 本树 steward / chief_editor | **无需申请，立即生效**；两侧同事务清理 |
| **审批** | 「家族消息」（hall 页，管理权限可见）+ 管理工作台 | zhonghua 侧 `chief_editor` | 通过 → `updateTrees([zhonghua, 目标树])`；驳回 → 写驳回理由 |

### 4-1 建立关系（两入口同一写入）

```
updateTrees(['zhonghua', '<tree_id>'], …)
  挂载树：始祖节点写 §3-1 指针（+ 清空本树既有的独立姓名数据）
  zhonghua：不改真身结构（仅可选：写 external_relation_note 说明来源树）
  失败 → 双侧回滚
```

### 4-2 解除关系

- 清理始祖节点的 `external_*` → 回到**占位始祖节点**（`I0001` 位置与 `tree-meta.founder_*` 保留）。
- 占位态**不是**"可自由编辑的普通节点"：不承载身份数据。
  > ⚠️ 待 Kevin 确认的默认口径：占位态下是否允许本树管理员**一次性填写**姓名/性别以自建始祖？
  > 现按「不允许，需重新认祖」实现（与 `marriage.spec` 的镜像口径一致）。
- 原挂载树内其他节点**不受影响**；真身节点的「【X 家族的始祖节点】」条目消失。

## 5. 只读与权限

- 始祖节点（镜像态）在本树内：**姓名/性别/生卒/称号/父/母/配偶 全部不可改** → UI 只读 + 后端 **403**
  「始祖节点信息需在中华世本（总谱）中修改」。
- 每棵树**除始祖节点外**的任何节点均可正常编辑（含结构操作）。
- 权限沿用 `requireWriteUser`；认祖审批方 = zhonghua 侧 `chief_editor`（总谱写权）。

## 6. 与既有实现的关系

| 既有 | 处置 |
|---|---|
| `promoteTree()`（晋宗：祖先链并入 zhonghua、**原树移除**） | **已整体移除**（2026-09-17 产品决策：函数与路由均已删除，由【立支】/【汇宗】取代）。不再保留函数、不再保留任何入口；本表此行的历史表述只作留痕 |
| `removeBranchLink()`（分迁占位删链） | **复用**：作为「解除挂载」的写路径底座（升级为会重置为占位始祖） |
| `external_link_type='branch'`（分迁） | 保留历史态；新关系统一用 `'founder'` |
| 树图「隐藏外树登记」判定 | 收紧：仅 `external_link_type==='founder'` 的**孤立**占位按"外树登记"隐藏；带家族关系的真人/镜像**不得**整支隐藏（`marriage.spec` §7-3 同一条 bug） |
| 家族消息（hall 页审批入口） | 新增「认祖申请」待办类型（就地通过/驳回） |
| `jiazu_founder_requests` | 新建集合 → 加入 `docs/PENDING_DEPLOY.md` |

## 7. 实施清单（文件级）

- `cloudfunctions/compat-api/lib/founder-attach.js`（新）：`attachFounder()` / `detachFounder()` / `listAttachedTrees()` / `isFounderLocked()` / `assertOneAttachPerTree()`
- `cloudfunctions/compat-api/index.js`：`POST /admin/founder-request`、`GET /admin/founder-requests`、`POST /admin/decide-founder`、`POST /admin/attach-founder`、`POST /admin/detach-founder`
- `lib/tree-write.js`：`updatePerson` 增加始祖只读校验；`updateTreeMetadata`/`createTree` 初始化占位始祖态
- 前端：
  - `person-archive.vue`：始祖节点**只读态** + 「认祖」入口；zhonghua 真身节点显示 **【X 家族的始祖节点】** + 「挂载家族树」入口
  - `family-messages.vue`：新增认祖申请待办
  - 旧【晋宗】入口（普通树档案「谱系管理」）**已整体移除**：路由 `POST /admin/promote` 与 `promoteTree()` 同批删除（2026-09-17 产品决策），本清单不再含该项动作、也无需保留任何兼容分支
- 测试：单元（一树一挂载 / 只读 403 / 解除回占位 / 驳回不改数据 / 总谱人数不计入）+ `/tmp` 副本 E2E（真源 md5 不变）
- 部署：`docs/PENDING_DEPLOY.md` 追加路由、集合、前端产物

## 8. 与嫁出/娶入的对照（决策留痕）

| 维度 | 嫁出/娶入 | 始祖挂载 |
|---|---|---|
| 关系载体 | `families` + `external_*` 指针 | 始祖节点 `external_*` 指针 |
| 镜像 | 对方树建镜像节点 | **本树始祖即镜像** |
| 建立 | 本树发起 → 对方树审批（方式 C） | **两入口**：认祖申请 → 总编审批；总编辑可直接挂载 |
| 解除 | 绝婚（单方即时）／合离（需确认） | **双方均可、无需申请**（对标"绝婚"路径） |
| 基数 | 1:1（可再嫁再娶加序号） | 总谱 1:N；**每树 1 个** |
| 只读 | 镜像节点只读 | **始祖整节点只读**（含姓名/生卒/结构） |
| 统计 | 镜像不计入"真人"叙事 | 挂载树人数**不计入** zhonghua |

---

## 9. 始祖真源反转（v2 · Zang 裁定 2026-09-20 · 变体 A：**始祖真身在家族树**）

> **性质**：本节由 **Jing（制度员）** 追加（2026-09-20）—— **只写文档**：未改代码、未写真源、未执行打包 / 部署 / 重传 / 迁移。§1–§8 历史行**原文保留**；被本节取代的旧行**不回改正文**，取代关系一律由 §9-1 表给出。
> **裁定**：Zang 终审 v1（2026-09-20）。**范围 = 变体 A**（逐字）：**始祖真身在家族树**；宗谱 / 世本各持**只读镜像**；**世系链镜像方向不变**。
> **未落盘声明（已于本次实测更新）**：本批实现**已在工作区落盘（未提交）** —— 实测 `git status --short` = `M cloudfunctions/compat-api/lib/{founder-attach.js,branch-clan-ops.js,tree-write.js,founder-attach.test.js}` + `M README.md` + `?? scripts/migrate-founder-inversion-2026-09.mjs`（mtime 2026-09-20 17:51–17:56）；**注意**：`cloudfunctions/compat-api/index.js` **本批未改**、云函数**产物仍未重打包**。落地细节与锚点漂移见 **§9-10**；部署动作面与判据 = `docs/PENDING_DEPLOY.md` **§29**。
> **实测时点**：**2026-09-20**（§9-0～§9-8 = 裁定口径与**落盘前**读数，17:44 CST；**§9-10 = 落盘后复测**，18:00 CST）。代码锚点见 §9-7 / §9-10，真源锚点见 §9-8。

### 9-0 术语重定义（**取代 §2 术语表**；§2 原文保留不改）

| 术语 | 新口径（v2 · 变体 A） | 旧口径（§2 / §3-1，**已作废**） |
|---|---|---|
| **真身节点** | **始祖真身所在树 = 家族树（`kind='family'`）**：家族树的始祖节点**本身即真身**，承载真实身份数据、由本树 `tree_steward` / `chief_editor` 取写 | 「`zhonghua` 中承载真实数据的节点」（真身在上层） |
| **镜像（只读镜像）** | 宗谱 / 世本里指向真身的**只读副本**（`external_mirror='true'`）；**方向不变** = 宗谱顶端 → 世本、宗谱登记镜像 → 家族树始祖 | 「挂载树的始祖节点 = 镜像」（镜像在下层） |
| **宗谱登记镜像** | 宗谱**自有段**里的 **1 条**指向**家族树始祖真身**的只读镜像（`external_link_type='founder'` + `external_mirror='true'`）；**同一家族树至多 1 条**；宗谱 `tree-meta.founder_handle` 指向它 | 原为**立支专用产物**（`docs/branch-clan-ops.spec.md` §5-3 / §6-1-6）；v2 推广为**所有认祖关系的通用口径**（该册 **§16**） |
| **上层镜像** | 指**本层之上**的真身的只读镜像（祖谱顶端 → 世本；宗谱登记镜像 / chain 镜像 → 其真身所在树）；判定函数不变 = `lib/founder-attach.js:105` | 同（判定不变，**「谁是上层」随真身反转重排**） |
| **空白占位始祖节点** | **取消该态**（见 §9-4 R2b）；未挂载时本树管理员可**自填**姓名 / 生卒（自建真身） | 「未挂载 / 已解除时的始祖节点：空身份、占位态」 |

### 9-1 与旧 §3 / §4 / §5 的取代关系（**逐条；旧行原文保留**）

| 旧位置 | 旧口径（**原文保留，不改写**） | v2 处置（本节生效） |
|---|---|---|
| §2 术语表 | 真身 = `zhonghua` 节点；始祖镜像节点在**挂载树** | **已被取代** → §9-0 |
| §3-1 挂载树侧（始祖节点 = 镜像） | `external_tree='zhonghua'` … 「姓名 / 性别 / 生卒 / 称号 / 结构全部以真身为准，本树不落独立数据」 | **已被取代** → §9-2 / §9-3（家族树始祖 = 真身、字段**本树可写**） |
| §3-2 真身侧（zhonghua） | 「真身节点**不写反指针**」；显示【A 家族的始祖节点】 | 判定规则**保留**（仍不写反指针）；真身**换位**到家族树 → §9-2 第 3 条 |
| §3-3 基数约束 | 「一树一挂载」/「总谱节点 1:N」 | **保留**（§9-5 只收不变量、不改基数） |
| §4-1 建立关系（两入口同一写入） | 「始祖节点写 §3-1 指针（+ 清空本树既有的独立姓名数据）」 | **已被取代** → §9-3（不再覆盖身份字段、不再清空详情） |
| §4-2 解除关系（含末尾 `> ⚠️ 待 Kevin 确认的默认口径`） | 「清理 `external_*` → 回到**空白占位始祖节点**」；「占位态**不是**可自由编辑的普通节点」（现按「不允许，需重新认祖」实现） | **已被取代** → §9-4（**取消空白占位锁**，该「⚠️ 待确认」条**已有定论**） |
| §5 只读与权限 | 「始祖节点（**镜像态**）在本树内：姓名 / 性别 / 生卒 / 称号 / 父 / 母 / 配偶 全部不可改」+ 403 文案 | **已被取代**为**统一只读不变量**（`external_mirror==='true'` 且 `external_tree` 非空且 ≠ 本树 → 一律只读，**不论镜像指向层在上还是在下**）→ §9-5 |
| §6 关系表「`external_link_type='branch'`（分迁）」行 | 「保留历史态；新关系统一用 `'founder'`」 | **保留** |
| §8 对照表「镜像 / 只读」两行 | 「本树始祖即镜像」「始祖整节点只读」 | **已被取代** → §9-2 / §9-5 |

### 9-2 R1 单一真源（裁定原文落地）

1. **`external_*` 一律指向真身所在树**。真身 = 家族树始祖；宗谱 / 世本里对应的节点是**只读镜像**。
2. **世本真身节点保持真身**：`zhonghua` 的 **I0100 季行父** / **I0137 姒期视** 仍为真身（世本不因本裁定被降级为镜像）。
3. **宗谱顶端镜像段方向不变**：宗谱 `ji_23395` 顶端 **I000162 季行父**（`mir_103ff661b13b19b0f44c89cbe2f7`）→ `zhonghua`、`gu_39038` 顶端 **I000138 姒期视**（`mir_a824b97dab17c3f590b4e3fc`）→ `zhonghua`，**方向仍为「宗谱 → 世本」**（实测见 §9-8）。
4. **「世本存宗谱始祖的镜像」= 以只读反向登记展示，不新建节点、不写反指针**：读侧复用既有 `listAttachedTrees`（`lib/founder-attach.js:723`）+ `founderTreeLabel`（`:774`，标签形如 `X 家族的始祖节点`），即「谁挂到了我这个节点」由**读侧推导**得出，真身侧**零写入**。
5. **为何不新建镜像节点（裁定理由 · 必读）**：新建镜像节点 = 在真身所在树之外**复制一份结构**，与 `docs/data-model.md` **§7-1 单点写不变量**冲突 —— 该节第 R1 / R2 / R3 条要求「写入失败必须失效缓存 / 回滚 `version` / 详情在树落盘成功之后写」，前提是**一份数据只有一处落点**；`docs/data-model.md` §7 开篇亦写明「**单点写**：结构字段只写树 JSON，档案字段只写详情文档 → 绝大多数编辑天然一致」。若为「反向登记」再造节点，就会出现「同一身份两处结构、两处详情」，跨树事务的失败回滚面被放大。⇒ **反向登记只做读侧推导**（复用既有函数，零新增节点、零反指针）。
   > **标为「一句话可改」**：若后续要求「反向登记也落结构」（如显示需要可编辑的登记条目），**一句话即可改** —— 但须同步改 `docs/data-model.md` §7 的不变量表述并扩事务回滚面，本册不预设该形态。

### 9-3 R2 家族树始祖 = 真身**可写**（本树 steward / chief_editor）

> **本节第 1–3 条描述的是「落盘前」的旧行为**（实测 **17:44 CST**，用于说明「要改什么」）；**落盘后的实现**见 **§9-10**。

1. **认祖挂载不再覆盖本树始祖身份字段**：现行实现会把真身数据**覆盖**写入始祖节点（`lib/founder-attach.js:340` `planFounderMirror`：`name` / `surname` / `given` / `gender` / `birth_date` / `death_date` 全部以「上层真身」为准）→ **新口径下本树始祖即真身，这些字段属于本树，不再被认祖动作覆盖**。
2. **不再清空其详情**：现行实现在挂载后**清空本树详情**（`lib/founder-attach.js:594-603`，注释逐字「始祖镜像的档案属性以真身为准 → 清空本树详情（称号/事件不落本树）」，`:598` 组装 `attributes: []` / `events: []` 后 `:599` `saveDetail`）→ **新口径下不再清空**（真身详情留在真身所在树）。
3. **解除不再清成空白占位**：现行实现在解除时把始祖重置为空白（`lib/founder-attach.js:359` `planFounderPlaceholder`：`name` / `surname` / `given` / `birth_date` / `death_date` / `birth_place` / `death_place` / 全部 `external_*` 置空）+ 清空本树详情（`:657-663`）→ **新口径下解除不得把真身清成空白**（真身数据归本树所有）。
4. **权限**：可写方 = 本树 `tree_steward` / `chief_editor`（沿用既有 `requireWriteUser` 角色口径，不新增锚点校验）。

### 9-4 R2b **取消「空白占位锁」**（**取代 §4-2 末尾那条「⚠️ 待 Kevin 确认的默认口径」**）

- **新口径**：未挂载时，本树 `tree_steward` / `chief_editor` **可自填**姓名 / 生卒（**自建真身**）。
- **被取代的旧条（§4-2 末尾，原文保留）**：`> ⚠️ 待 Kevin 确认的默认口径：占位态下是否允许本树管理员**一次性填写**姓名/性别以自建始祖？` + `> 现按「不允许，需重新认祖」实现（与 marriage.spec 的镜像口径一致）。`
  ⇒ **该「待确认」项已有定论：允许自填**（等同于「始祖真身在家族树」的直接推论）。旧行**不改写**，定论以本条落地。
- **实现落点（现已定位，待 Kong 落地）**：现行拦截 = `lib/founder-attach.js:242` `isPlaceholderFounder`（判据：`isFounderNode` 为真 且 `person.external_link_type` 为空 且 `name` 去空白后为空）→ `:253` `founderLockMessage` 命中即返回常量文案 `:46` `PLACEHOLDER_LOCK_MESSAGE = '空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息'`。**取消该锁 ⇒ 上述分支不再对「未挂载的本树始祖」返回只读文案**（文案常量的去留由 Kong 按实装决定，本册不预设字面）。

### 9-5 R3 只读不变量统一（**取代 §5 的「只看上层」表述**）

- **判据（逐字）**：`external_mirror==='true'` **且** `external_tree` 非空 **且** `external_tree ≠ 本树` → **本层一律只读**，**不论镜像指向层在本层之上还是之下**。
- **唯一例外 = person-places 的出生地 / 居住地**（契约 **v2 C6**；`docs/person-places.spec.md` §4 表 C6 行 / §5「始祖可编辑性放行口径」；判据函数 `isPlaceFieldsOnly`，实现锚点 `lib/founder-attach.js:298` 与 `lib/tree-write.js:182`）。
- **取代范围（旧行原文保留）**：`docs/clan-tree.spec.md` **§3-7**（「位于任一层**上方**的镜像节点在本层内整节点只读」）与 **§4-3**（「始祖节点 = 指向祖谱节点的镜像 … 整节点只读」）、本册 **§5** 的同类表述 —— 三条一律由本条的**方向无关只读**取代。
- **实现锚点**：统一判据函数 = `lib/founder-attach.js:272` `personEditLockMessage`（注释 `:263-265` 逐字写明「① 上层镜像优先 ② 其后才是始祖锁」），上游 `:292` `assertFounderEditable` 是路由预检与写路径**同一判据**；现行 `isUpperMirror`（`:105`）**已天然方向无关**（只要求 `external_mirror==='true'` + `external_tree` 非空 + ≠ 本树），故本条主要影响**文案选择**与**被 §5 旧表述误导的调用点**，由 Kong 落地。

### 9-6 R6 世数读法（`external_chain_gen`）

- **新口径**：世数沿 `external_*` 链**下钻到真身**再读；**人数统计口径不动**（`docs/data-model.md` / `lib/family-population.js` 现状）。
- **现行读法（实测锚点）**：详情属性 `external_chain_gen` 由 `lib/founder-attach.js:322` `chainGenOf(detail)` 解析（`:323` 逐字 `find((a) => a.key === 'external_chain_gen')`），被 `:572` 用于关系备注 `gen`；`/tree/rank` 的世数 Map 在 `cloudfunctions/compat-api/index.js:549-551` 同样只读**本树详情**；祖谱侧另有 `lib/tree-write.js:732` `clanGenerationOf` + `:760` `clanSelfGenMap`（祖先 = 第 1 世、BFS 递 1、自带 `external_chain_gen` 优先、断链 `inLineage:false`）。
  **【行号校正 · Jing · 2026-09-20 **18:57** CST 实测 · 取代上句两个行号】**：`lib/tree-write.js` **`clanGenerationOf` = `:737`**（旧记 `:732` **已作废**）、**`clanSelfGenMap` = `:772`**（旧记 `:760` **已作废**）、其内 **`resolveChainGen` 调用点 = `:781`**（旧记 `:777` **已作废**；§9-10 同址）；`lib/tree-write.js` 本批改动 = **`24 +` / `7 -`**（mtime **18:48:48**）。
  **【A6 回退 + 行号复核 · Jing · 2026-09-20 **19:19:00** CST 实测 · 只追加】**：**A6 已回退**（裁定 **D1**）—— `/tree/rank` **不接线** `resolveChainGen`（`cloudfunctions/compat-api/index.js` md5 = **`f1f40096323de98f1f2b3d9188c2bac5`** = **与 HEAD 字节相同**；`grep -c 'resolveChainGen' cloudfunctions/compat-api/index.js` = **0**；`/tree/rank` 段仍为 `:549-551` 的「只读本树详情」循环）；**R6 的唯一落点是 `lib/tree-write.js` `clanSelfGenMap`（`:772` 定义 / `:781` 调用点）** —— 本次复核实测**与上句 18:57 值一致、未漂移**。⇒ 本节首句「`/tree/rank` 的世数 Map 在 `cloudfunctions/compat-api/index.js:549-551` **只读本树详情**」**经 D1 后恢复为现行有效口径**；回退后 4 棵祖谱 `GET /tree/rank` 实测 = **2 / 2 / 37 / 4**（gu_39038 / ji_23395 / liu_21016 / qin_31206）且 `over_limit` **全 `false`**（逐项对照与裁定理由见 `docs/PENDING_DEPLOY.md` **§29-9「v1.2 裁定 D1 校正」**）。
  ⇒ **新口径要求把「读本层详情」改为「沿 `external_person_handle` / `external_tree` 下钻到真身所在树后读该真身详情」**；具体实现（含缓存与断链兜底）由 Kong 落地，**本册不预设实现细节**。
- **人数统计不动（逐条对照现状）**：`person_count` 唯一真源 = `lib/family-population.js`（文件头 §1–§7；`index.js:556-560` 注释逐字「仅 `kind === 'family'`（或缺省 ⇒ family）走新口径；`zhonghua`（is_master 世本）与 `kind === 'clan'`（祖谱）保持 = 树内 people 数」）。

### 9-7 代码锚点（**逐字取自实现 · 落盘前实测行号 = 2026-09-20 17:44 CST**）

> ⚠️ **行号已随 Kong 落盘下移**（同一文件、同一批改动）：**当前（18:00 CST）行号见 §9-10**；本表保留作「落盘前」证据与口径对照（同一函数名的语义未变）。

| 锚点 | 位置 | 说明 |
|---|---|---|
| 文案常量 | `lib/founder-attach.js:39-46` | `:40` `MIRROR_LOCK_MESSAGE = '始祖节点信息需在中华世本（总谱）中修改'` · `:42` `CLAN_FOUNDER_LOCK_MESSAGE = '始祖节点信息需在本姓祖谱中修改'` · `:44` `CHAIN_MIRROR_LOCK_MESSAGE = '该节点为上层（中华世本）镜像，需到总谱修改'` · `:46` `PLACEHOLDER_LOCK_MESSAGE = '空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息'` |
| `isFounderMirror` | `lib/founder-attach.js:97` | 「本树始祖指向 masterTreeId 的真身」 |
| `isUpperMirror` | `lib/founder-attach.js:105` | 方向无关（本裁定 §9-5 的判据底座） |
| `upperMirrorLockMessage` | `lib/founder-attach.js:118` | chain → `:44` 文案；founder → 按上层层级取 `:42` / `:40` |
| `isPlaceholderFounder` | `lib/founder-attach.js:242` | R2b 取消的锁（§9-4） |
| `founderLockMessage` | `lib/founder-attach.js:253` | 始祖锁：镜像 → `:256`；占位 → `:257` |
| `personEditLockMessage` | `lib/founder-attach.js:272` | **路由预检与写路径唯一判据**；C6 例外在 `:298` |
| `assertFounderEditable` | `lib/founder-attach.js:292` | 写路径统一入口（403） |
| `planFounderMirror` | `lib/founder-attach.js:340` | R2 覆盖身份字段处（`:343-348`） |
| `planFounderPlaceholder` | `lib/founder-attach.js:359` | R2 解除清空处（`:362-375`） |
| 挂载后清空本树详情 | `lib/founder-attach.js:594-603` | `:599` `saveDetail(cleared)`（R2 第 2 条） |
| 解除后清空本树详情 | `lib/founder-attach.js:657-663` | `:660` `saveDetail({...d, attributes: [], events: [], name: ''})`（R2 第 3 条） |
| `attachFounder` | `lib/founder-attach.js:544` | 认祖写入 |
| `detachFounder` | `lib/founder-attach.js:641` | 解除写入 |
| `listAttachedTrees` | `lib/founder-attach.js:723` | R1 反向登记的**读侧推导**底座（真身侧零反指针） |
| `founderTreeLabel` | `lib/founder-attach.js:774` | 标签形如 `X 家族的始祖节点` |
| 世数读点 | `lib/founder-attach.js:322` / `index.js:549-551` / `lib/tree-write.js:732`+`:760` | R6（§9-6） |
| C6 判据 | `lib/founder-attach.js:298` / `lib/tree-write.js:182` | `isPlaceFieldsOnly`，`docs/person-places.spec.md` §14-5 |

### 9-8 真源锚点（**2026-09-20 实测 · 逐字，不得改写**）

| 项 | 实测值 |
|---|---|
| 树总数 | **17**（`config/tree-meta.json` 的 `trees` 为**对象** `{tree_id: entry}`，`len(trees) == 17`） |
| **家族树始祖镜像** | **只有 2 条**：① `ji_23395_01` 始祖 **季花 I000209**（handle `10400594c54f5203f61bf4fa4b20`）`external_mirror='true'` · `external_link_type='founder'` · `external_tree='ji_23395'` · `external_relation_note='季花（宗谱）'`；② `gu_39038_01` 始祖 **顾清学 I000143**（handle `103f95b87b5a464242933ee319d5`）同形 · `external_tree='gu_39038'` · note `'顾清学（宗谱）'` |
| 宗谱顶端镜像 | `ji_23395` **I000162 季行父**（handle `mir_103ff661b13b19b0f44c89cbe2f7`）→ `zhonghua`；`gu_39038` **I000138 姒期视**（handle `mir_a824b97dab17c3f590b4e3fc`）→ `zhonghua` |
| 宗谱自有段真身 | `ji_23395` **季花 I000163**（handle `3c95530f8bd4f84dc0b87edc`，`tree-meta.founder_handle` 即此 handle）；`gu_39038` **顾清学 I000139**（handle `5ae4c6e505c90d290f71f66b`，同为 `founder_handle`） |
| **追加实测（同批发现 · 如实登记）** | 真源另存 **2 条宗谱顶端镜像**，不在上述「2 条始祖镜像」内（它们是**宗谱顶端段**的 `founder` 镜像，不是家族树始祖镜像）：`liu_21016` **I000319 姬累**（`mir_09c3abdb283715fec6897456`）→ `zhonghua`；`qin_31206` **I000289 姬搢**（`mir_3382fa53ef677c058a5ec559`）→ `zhonghua`（`qin_31206` / `liu_21016` 的 `tree-meta.founder_handle` 为**空串**，与 `docs/data-model.md` §196 行注记一致） |
| 真源 md5（本节时点） | `config/tree-meta.json` = **`5c8ca3aee29bd811cd7e2d4b2cbf8d05`**（9,648 B）；`migrate-output/**` 聚合 = **`55f0b1d32ae7f587f9d94eec61df4ba6`**（318 文件）—— 本节**零写入**（前后同值） |
| `npm test`（本节时点） | **四次读数**：**17:44 CST** → **454 tests / 454 pass / 0 fail / 0 skipped**（exit 0，**已作废**：属**落盘前**值）；**18:00 CST** → **454 tests / 447 pass / 7 fail / 0 skipped**（**exit 1**，红项 = `not ok 42` `52` `228` `229` `230` `234` `236`）；**18:22:53 CST（Jing 本轮校正实测）** → **454 tests / 447 pass / 7 fail / 0 skipped**（**exit 1**，红项**同一组** `42` `52` `228` `229` `230` `234` `236`）⇒ **仍为红**，7 红 = **Kong 未完成的旧断言改写**（测试端尚未跟改本批新口径）。命令 = `cd /Users/kevin/bistro/jiazu && npm test`。7 红出现于 Kong **在途落盘**之后（工作区未提交）⇒ **该数会再变**，最终数由 Kong 交付后以实测补登。**第四次读数（Jing · **18:38:20** CST）→ **454 tests / 454 pass / 0 fail / 0 skipped**（**exit 0** = **全绿**，`not ok` 行 **0 条**）** —— Kong 于 **18:31–18:36** 落盘测试端跟改后转绿 ⇒ **上列 18:00 / 18:22:53 两条红读数已被取代**；**`npm test` 全绿 = 本批交付门槛，现已达标**（仍以**冻结时点终校**为准） |
| **`npm test`（v1.2 追加 · Jing · **2026-09-20 19:18:14–19:18:17** CST 实测 · **取代上列 454 基数**）** | **464 tests / 464 pass / 0 fail / 0 skipped**（TAP 逐字 `1..464` / `# tests 464` / `# pass 464` / `# fail 0` / `# skipped 0`，**exit 0** = **全绿**，`not ok` **0 条**）。命令 = `cd /Users/kevin/bistro/jiazu && npm test`。增量成因 = **专测文件 `cloudfunctions/compat-api/lib/founder-source-reversal.test.js` 落地并注册**（**44,276 B**，mtime **2026-09-20 19:04**；`package.json` 的 `scripts.test` 注册数 = **28** = 磁盘 `lib/*.test.js` **28**）⇒ **+10 tests**（454 → 464）。⇒ 上列第四条（18:38:20）读数**已陈旧**（**同一门槛、更大分母，门槛仍达标**） |
| **A6 回退（v1.2 追加 · 裁定 D1 · Jing · 2026-09-20 **19:19:00** CST 实测）** | **本表「真源锚点」各项不受 A6 回退影响**：`config/tree-meta.json` md5 **=`5c8ca3aee29bd811cd7e2d4b2cbf8d05`**（9,648 B，mtime **2026-09-20 13:36:13**）**校正前后同值**；`migrate-output/**` **文件数 = 319**（本节上表「318 文件」为 17:5x 时点值，**已陈旧**；成因见 `docs/PENDING_DEPLOY.md` §29 头部「真源侧进程外写入」行）。`cloudfunctions/compat-api/index.js` md5 = **`f1f40096323de98f1f2b3d9188c2bac5`**（**与 HEAD 字节相同**）、`grep -c 'resolveChainGen' cloudfunctions/compat-api/index.js` = **0** ⇒ **A6 = 已评估并回退**；**R6 唯一落点 = `lib/tree-write.js` `clanSelfGenMap`（`:772` / `:781`）保留** |

### 9-9 复现命令（**只读 · 不触发任何写入 / 部署**）

```bash
cd /Users/kevin/bistro/jiazu
python3 -c "import json;t=json.load(open('config/tree-meta.json'))['trees'];print('trees',len(t))"
grep -n 'isFounderMirror\|isUpperMirror\|personEditLockMessage\|founderLockMessage\|planFounderMirror\|planFounderPlaceholder\|attachFounder\|detachFounder\|listAttachedTrees' cloudfunctions/compat-api/lib/founder-attach.js
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json
npm test 2>&1 | tail -8                       # 本节复测（2026-09-20 18:22:53 CST）：454 tests / 447 pass / 7 fail（exit 1 · 红；落盘前绿读数 454 / 454 / 0 已作废）
git status --short docs/founder-attach.spec.md
```

> **v1.2 追加（Jing · 2026-09-20 **19:18:14–19:18:17** / **19:19:00** CST 实测 · 只追加）**：上列 `npm test` 注释中的 454 读数**已陈旧** —— 本轮复测 = **464 tests / 464 pass / 0 fail / 0 skipped**（**exit 0**）。**A6 回退（裁定 D1）复核命令**：`md5 -q cloudfunctions/compat-api/index.js`（= **`f1f40096323de98f1f2b3d9188c2bac5`**，与 HEAD 同）· `git diff --numstat -- cloudfunctions/compat-api/index.js`（= **空**）· `grep -c 'resolveChainGen' cloudfunctions/compat-api/index.js`（= **0**）· `grep -n 'clanSelfGenMap\|resolveChainGen' cloudfunctions/compat-api/lib/tree-write.js`（= **`:772` / `:781`**，R6 唯一落点保留）。

### 9-10 落盘后复测（**Kong 在途落盘 · 实测 2026-09-20 18:00 CST**）

> **背景（必须按事实读）**：本节初稿时（17:44 CST）本批实现**尚未落盘**；随后 Kong 的实现在 **17:51–17:56** 落到工作区（**未提交**）—— 故 §9-3 / §9-4 / §9-5 的「现行实现」描述与 §9-7 的行号**均已不是当前值**，以本条为准。

**（a）工作区落盘清单（实测 `git diff --numstat` / `git status --short`）**

| 文件 | 改动 | 说明 |
|---|---|---|
| `cloudfunctions/compat-api/lib/founder-attach.js` | `396 +` / `91 -` | 实现主体 |
| `cloudfunctions/compat-api/lib/branch-clan-ops.js` | `8 +` / `14 -` | **R5** |
| `cloudfunctions/compat-api/lib/tree-write.js` | `18 +` / `5 -` | **R6** 读侧 + 锁 |
| `cloudfunctions/compat-api/lib/founder-attach.test.js` | `108 +` / `53 -` | 用例跟改（**在途**） |
| `README.md` | `4 +` / `0 -` | 一次性脚本用法登记 |
| `scripts/migrate-founder-inversion-2026-09.mjs` | **新增（`??` 未入库）** | **R7** 存量迁移脚本（`--apply` 写前自动备份到 `~/jiazu-backups/<日期>-founder-inversion/`） |
| `cloudfunctions/compat-api/index.js` | **未改**（`git status` 空） | ⚠️ **`/tree/rank` 的世数 Map（`:549-551`）仍是「只读本树详情」** —— 与 R6 的写侧落盘点**不同址**，**如实登记**（是否需要同改由 Kong 判定） |
| `cloudfunctions/deploy/compat-api/index.js` | **未重打包** | 产物 md5 仍 `d61a8aebfb3f3095baae4e1e731fd675`（§29-1） |

**（b）各条裁定的落盘证据（逐条 · 逐字）**

| 裁定 | 落盘状态 | 实测字面 / 位置 |
|---|---|---|
| R1 单一真源 / 反向登记读侧推导 | ✅ 头部注释逐字写明 | `lib/founder-attach.js:7-9`（「R1 单一真源：`external_*` 指针一律指向**真身所在树**；上层树（世本/祖谱）不写反指针，反向登记一律**读侧推导**（listAttachedTrees / founderTreeLabel / attachedTreesOf）」） |
| R2 真身可写 / 不覆盖身份字段 / 不清空详情 | ✅ | 头部 `:10-11`；`:467`（「身份字段（姓名 / 性别 / 生卒 / 称号详情）一律**不动**，只写跨树登记指针」）/ `:501`（「家族树始祖 = 真身：身份字段与详情文档**一个字节不动**（R2）」）；新函数 `planFounderRegistration` **`:470`**、`planFounderDetach` **`:486`**；`attachFounder` **`:753`**（`:834` 注释「R2：本树始祖仍是**真身**（身份字段与详情未被覆盖）；R4：宗谱侧写了 1 条只读登记镜像」） |
| R2b 取消「空白占位锁」 | ✅（**文案字面已变**） | `:12-13` / `:60-63`：`PLACEHOLDER_LOCK_MESSAGE` **新字面 = `该节点为孤儿镜像（真身不可达）：请先解除登记后在本树重建始祖信息`**（**旧的「空白占位始祖节点：…」字面在本文件中已不存在**）；新判定 `isOrphanMirror` **`:148`**；`founderLockMessage` **`:313`**（`:322-324`：仅孤儿镜像返回该文案，其余返回 `''`）；注释 `:310-311` 逐字「**R2b 起不再参与判定** —— 「空白占位」形态已不再上锁」 |
| R3 方向无关只读（+ C6 例外） | ✅（**判据已重构**） | 新判据 `isReadonlyMirror` **`:136`**（注释 `:126-133` 逐字「**与方向无关**：指向层在上…还是在下…都只读；真身节点在其**所在树**内可写（R2）」+「为什么必须方向无关：…若沿用「只锁上层镜像」的名判据，向下镜像会被判成可写 → 同一份数据出现可写副本（违反 R1）」）；**旧名保留为别名** —— `export const isUpperMirror = isReadonlyMirror` **`:145`**（`:144` 注释「历史导出名」）、`upperMirrorLockMessage` **`:184`** 委托 `mirrorLockMessageOf` **`:173`**；C6 例外不变（`assertFounderEditable` **`:359`**，`:365` `if (msg && !isPlaceFieldsOnly(body))`） |
| R3 新文案（向下镜像） | ✅ **新增文案函数** | `familyMirrorLockMessage` **`:161`** → `该节点为 <树标题> 始祖的镜像，需在 <树标题> 中修改`（`:163` 逐字；`mirrorLockMessageOf` `:178` 在「founder 镜像指向 **family**」时使用） |
| R4 宗谱登记镜像（通用口径） | ✅ | 头部 `:17-19`；新函数 `isClanRegistration` **`:533`** / `clanRegistrationOf` `:538` / `clanRegistrations` **`:548`** / `assertOneRegistrationPerFamilyTree` **`:556`**（重复 → 400）/ `planClanRegistrationMirror` **`:573`** / `applyClanRegistration` `:590` / `applyClanRegistrationRemoval` `:598`；`attachFounder` 内 `:785` 断言 + `:787` 计划 + `:806` 应用；`detachFounder` 内 `:917` 移除 |
| R6 世数下钻真身 | ✅（**读侧面已落盘**） | 新函数 `resolveChainGen` **`:407`**（注释 `:395-406`：链断 / 环 / 无属性 → `gen: null`，**由调用方沿用既有结构推导，绝不猜一个世数**）；调用点 = `lib/tree-write.js:777`（`clanSelfGenMap`，注释 `:762-766` 逐字「**R6 口径（沿真身链下钻）**」）；`chainGenOf` 保留 **`:389`**；⚠️ `index.js:549-551`（`/tree/rank`）**未接**该函数（见 (a) 表） |
| R5 立支 / 汇宗连带 | ✅ | `lib/branch-clan-ops.js:702-703`（「R5（变体 A）：原树始祖 = **N 真身**（真实节点，非镜像）——只改 tree-meta 登记，**不给 N 写任何 `external_*`、不强转镜像**」）；汇宗前置段 **`:818-824`**（注释 `:818-821` 逐字「源树当前始祖：**镜像（任一方向）或真身**都放行（R5 放宽口径；§3-8 / §6-2-2）」→ 判定收敛为 `:822-824`，`throw` 在 **`:824`** = `该家族树当前没有始祖节点，无法汇宗`）⇒ **旧的「该家族树当前始祖不是上层镜像，无法汇宗」字面在本文件中已不存在** |

**（c）测试基线（复测）**：`cd /Users/kevin/bistro/jiazu && npm test` → **454 tests / 447 pass / 7 fail / 0 skipped**（**exit 1**，2026-09-20 18:00 CST）。**Jing 本轮校正复测（18:22:53 CST）**：**同一读数 / 同一红项组** —— **454 tests / 447 pass / 7 fail / 0 skipped**（**exit 1**）⇒ **仍为红，且未变化**。红项 = `not ok 42`（§10-1-22 汇宗 · 目标解析与校验）/ `52`（§6-2-2 拒绝 · 源树始祖是真人节点 → 400「不是上层镜像」）/ `228` / `229` / `230`（`founder-attach` 三条路由用例）/ `234` / `236`（无始祖树认祖用例）—— 即**测试端尚未跟改本批新口径**（如 `52` 断言的正是 R5 放宽掉的旧文案），**归另一个 Kong 收尾**。**该数在途，最终数由 Kong 交付后以实测补登；全绿后由本册追加一行，全绿前不得写成绿**。

**（c-追加）全绿复测（Jing · 2026-09-20 **18:38:20** CST）**：`cd /Users/kevin/bistro/jiazu && npm test` → **454 tests / 454 pass / 0 fail / 0 skipped**（**exit 0** = **全绿**；`not ok` 行 **0 条**）⇒ 上条 **454 / 447 / 7（红）** 为**收尾前**读数、**已被取代**。收尾 = Kong 于 **18:31–18:36** 落盘测试端跟改（`lib/founder-attach.test.js` `127 +` / `57 -`、`lib/branch-clan-ops.test.js` `26 +` / `19 -`、`lib/founder-reattach.test.js` `18 +` / `9 -`）。**`npm test` 全绿 = 本批交付门槛（已达标）**；仍以**冻结时点的最终一次实测**为准。

**（d）差异登记（如实 · 不改代码）**：`index.js` 本批未改 ⇒ `/tree/rank` 的世数 Map（`:549-551`）尚未走 `resolveChainGen`；`docs/PENDING_DEPLOY.md` §29-1 的**产物侧判据**（见该节）当前对全部新字面 = **0**（未重打包）。

**（d-追加）差异闭合（Jing · 2026-09-20 **18:40** CST · **取代上条 (d) 的第 1 句**）**：`cloudfunctions/compat-api/index.js` **本批已改**（`git diff --numstat` = **`9 +` / `0 -`**，mtime **18:34:15**）⇒ **`/tree/rank` 已接线 R6**：`:552-556` 注释逐字「R6 世数（裁定追加 v1.1 · A6）：与 `lib/tree-write.js` 的 `clanSelfGenMap` / 认祖（`attachFounder`）**同一读侧口径**」，`:557-561` 为镜像下钻循环，**`:559` `const drilled = await fa.resolveChainGen({ treeId, handle });`**（`:560` `if (drilled.gen !== null) gens.set(handle, drilled.gen);`）⇒ **上条 (d) 的「尚未走 / 未接」结论已作废**（`docs/PENDING_DEPLOY.md` §29-9 同址校正）。**未变的部分**：§29-1 的**产物侧判据仍全 0**（云函数产物未重打包，md5 仍 `d61a8aebfb3f3095baae4e1e731fd675`）⇒ 该接线**尚未到线上**。

**（e）锚点二次校正（Jing · 2026-09-20 **18:57** CST 逐行实测 · **取代 (b) 表中 5 个已漂移行号**）**

> 起因：`lib/founder-attach.js` 在本册 (b) 表成表后**又落了两次盘**（mtime 实测 **18:31:40 → 18:48:39**）⇒ (b) 表内部分行号已漂移。命令 = `grep -n '^export …' cloudfunctions/compat-api/lib/founder-attach.js`。**旧值原文保留于 (b) 表**，以本行为准。

| 锚点 | (b) 表旧记（**已作废**） | **18:57 复核实测** |
|---|---|---|
| `personEditLockMessage` | `:313` | **`:339`** |
| `clanRegistrations` | `:548` | **`:552`** |
| `assertOneRegistrationPerFamilyTree` | `:556` | **`:560`** |
| `planClanRegistrationMirror` | `:573` | **`:577`** |
| `attachFounder` | `:753` | **`:761`**（其内新增 `resolveChainGen` 调用 = **`:799`**） |
| **复核后不变（仍有效）** | `PLACEHOLDER_LOCK_MESSAGE :63` · `isReadonlyMirror :136` · `isUpperMirror :145` · `isOrphanMirror :148` · `familyMirrorLockMessage :161` · `assertFounderEditable :359` · `chainGenOf :389` · `resolveChainGen :407` · `planFounderRegistration :470` · `planFounderDetach :486` · `isClanRegistration :533` | 同左 |
| `lib/tree-write.js`（(b) 表未列，§9-6 同址） | `clanGenerationOf :732` / `clanSelfGenMap :760` / 调用点 `:777` | **`:737` / `:772` / `:781`** |

**（f）同批新增落盘（Jing · 2026-09-20 18:57 CST 实测 · 只登记 · **未改代码**）**：除 (a) 表外，工作区本批**又新增**这些改动（`git diff --numstat` 实测）：`lib/clan.js` **`59 +` / `20 -`**（mtime 18:48:29）、`lib/branch-clan-ops.test.js` `26 +` / `19 -`、`lib/founder-reattach.test.js` `18 +` / `9 -`、`frontend/src/business/{api.ts,cross-tree.ts,index.ts,types.ts}`、`frontend/src/components/{clan-hall/clan-hall.vue,family-messages/family-messages.vue,person-archive/person-archive.vue,person-manage-panel/person-manage-panel.vue}` ⇒ **§29-2「前端必须重打」的结论不变、且更必要**；**云函数产物仍未重打包**。`npm test` **18:56:57 CST 复测 = 454 / 454 / 0 / 0（exit 0，全绿）**。

**（c-追加2）v1.2 读数刷新（Jing · 2026-09-20 **19:18:14–19:18:17** CST 实测 · **取代 (c) 与 (c-追加)**）**：`cd /Users/kevin/bistro/jiazu && npm test` → **464 tests / 464 pass / 0 fail / 0 skipped**（TAP 逐字 `1..464` / `# tests 464` / `# pass 464` / `# fail 0` / `# skipped 0`，**exit 0** = **全绿**，`not ok` **0 条**）⇒ 上列 (c) 的 **454 / 447 / 7** 与 (c-追加) 的 **454 / 454 / 0** **两条读数均已陈旧**（**同一门槛、更大分母，门槛仍达标**）。增量成因 = **专测文件 `cloudfunctions/compat-api/lib/founder-source-reversal.test.js` 落地并注册**（**44,276 B**，mtime **2026-09-20 19:04**；`package.json` 的 `scripts.test` 注册数 = **28** = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` **28**）⇒ **+10 tests**（454 → 464）。

**（d-追加2）A6 回退（裁定 D1 · Jing · 2026-09-20 **19:19:00** CST 实测 · **取代 (d-追加)**）**：(d-追加)（18:40 CST）所称「**A6 已由 Kong 接线落盘** —— `/tree/rank` 已接线 R6（`:552-556` 注释 / `:557-561` 镜像下钻循环 / `:559` `const drilled = await fa.resolveChainGen({ treeId, handle });`）」**整段已作废** —— **A6 已回退**：`cloudfunctions/compat-api/index.js` 与 **HEAD 字节相同**（md5 = **`f1f40096323de98f1f2b3d9188c2bac5`**；`git diff --numstat -- cloudfunctions/compat-api/index.js` = **空**；`git status --short` **不再列出该文件**）、`grep -c 'resolveChainGen' cloudfunctions/compat-api/index.js` = **0**、`/tree/rank` 段 `:543` 路由下仍为 **`:549-551` 的「只读本树详情」原循环**（`:552-556` / `:557-561` 已无该注释与循环，现 `:556-559` 为 `person_count` 口径注释）⇒ **A6 = 已评估并回退**；**(d) 的原结论「`/tree/rank` 的世数 Map（`:549-551`）尚未走 `resolveChainGen`」恢复有效**。**R6 的唯一落点 = `lib/tree-write.js` `clanSelfGenMap`（`:772` 定义 / `:781` 调用点）**，**保留**。

**（d-追加3）回退后 4 棵祖谱 `GET /tree/rank` 实测（Jing · 2026-09-20 **19:19:00–19:19:06** CST）**：`gu_39038` = **2 / `over_limit` false / `explicit` false**、`ji_23395` = **2 / false / false**、`liu_21016` = **37 / false / true**、`qin_31206` = **4 / false / false**（**接线时**读数 = **78 / 90 / 76 / 78** 且 `over_limit` **全 `true`**）⇒ **`over_limit` 全回落 `false`**；`rank_key` 同步回落 = `family_rank` / `family_rank` / `lineage_rank` / `family_rank`（接线时跳级）。复核口径 = `handleRequest` **进程内**调 `GET /tree/rank`（`COMPAT_SOURCE=local`，`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 `migrate-output/**` + `config/tree-meta.json` 的 **`/tmp` 逐字节副本** ⇒ **真源零写入**，实测期间 `config/tree-meta.json` md5 前后同值 `5c8ca3aee29bd811cd7e2d4b2cbf8d05`）。⚠️ `liu_21016` 的 `explicit=true` 属其**自身 details 本就有 `external_chain_gen`**（实测 `migrate-output/details/liu_21016*` 共 **54** 个文件、**34** 个带该属性）的**既有行为**，**与本批 / A6 无关**。**裁定理由（副作用超出预期：`over_limit` 全翻 true、`rank_key` 跳级，而目标场景无观测量 ⇒ 按 A6 原文除外条款回退）与完整前后对照见 `docs/PENDING_DEPLOY.md` §29-9「v1.2 裁定 D1 校正」**。

**（g）AGENTS.md 状态（只登记 · 本册 / 本轮校正 **不得**写）**：其逐字待写入文本**已备**，写入**被 protected-file 审批两次拦下**（**非本轮校正之责**）⇒ **待 Kevin 批准后由 Zang 在前台一次批量写入**；本校正**未尝试写 `AGENTS.md`**（其 `6 +` / `0 -` 为**先前**既存改动）。

---

### 9-11 **R7 真源迁移「已落盘」状态行 ＋ 运维口径（树 JSON 无磁盘指纹 ⇒ 改真源后必须重启 compat-api）＋ E1 / E2 裁定登记**（Jing 制度员 · 2026-09-20 **21:31–21:36** CST 逐项实测 · **只追加 · 只标注取代 · 历史行原文保留**）

> **取代标注（历史行不改）**：本块**取代** §9-10 (a) 表「R7 迁移脚本」行与 §9-9（§9 各复现注释）内「**本节实测尚未跑过**（该备份目录不存在）」/「**未收到 report**」的措辞 —— 该脚本**已于 2026-09-20 21:31:28 CST（`summary.json.at = 2026-09-20T13:31:28.207Z`）对真源 `--apply` 执行完毕**；**逐项事实（命令 / 7 改 2 删 md5 / 幂等 / 备份与 9 条回滚 / 文件数 319→317 / tracked 文件注意 / 云端动作回填）= `docs/PENDING_DEPLOY.md` §29-10**（本节**不复述数值**）。另：§9-10 (a) 表 `index.js` 行、§9-10 (d)/(d-追加)/(d-追加2) 三块的 A6 接线 → 回退口径**已由 §9-10 (d-追加2)** 收口（**A6 回退 · 裁定 D1**），本节不变更。

**（a）「R7 已落盘」状态行（带日期 · 实测）**

| 项 | 状态（2026-09-20 **21:31–21:36** CST 实测） |
|---|---|
| **R7 存量就地反转（季 / 顾两条链）** | **✅ 已在真源落盘并执行完毕** —— 命令 `node scripts/migrate-founder-inversion-2026-09.mjs --apply`；**7 改 / 2 删**；`migrate-output/**` **319 → 317**；`config/tree-meta.json` = **`13616a89db2782256c3f33260aa32470`**（9,814 B） |
| **幂等** | **✅ 已验证**：二次 `--apply` = 「2 条链 / 改动项 0 / 复核失败链 0 / 待写文件 0 / 待删文件 0」+「无需写入、无需删除」；清单 diff 为空 |
| **备份 / 回滚** | **✅ 已就位**：`/Users/kevin/jiazu-backups/2026-09-20-founder-inversion/`（7 改前副本 + `md5-before.txt` + `summary.json` + `deleted-source-details/{2 档 + md5.txt}`）；**9 条回滚命令**（7 恢复 + 2 复删）由脚本 stdout 打印并留档（**备份目录内无 `.sh`**） |
| **云端** | **❌ 未执行**：树 JSON 重传 / 旧详情键删除（`ji_23395:3c95530f8bd4f84dc0b87edc`、`gu_39038:5ae4c6e505c90d290f71f66b`）/ 云函数重打包 / 前端重打 —— 顺序仍「**先重传、再删旧键**」 |
| **本册口径影响** | **✅ 新口径在真源侧已成为事实态**：两棵家族树始祖 = **真身**（`external_*` 全空串，含 `external_founder_created_by`）；两棵宗谱自有段 = **只读登记镜像**（`external_tree` 指向家族树、`external_person_handle` 指向真身、`external_mirror='true'`）；**宗谱顶端镜像段方向不变**（`zhonghua`） |

**（b）运维口径（必须遵守 · 本节为口径同址）：树 JSON 无磁盘指纹 ⇒ 外部改树 JSON / 跑迁移后必须重启 compat-api**

| 真源 | 是否**有**磁盘指纹 | 代码锚点（**逐行实测**） | 结果 |
|---|---|---|---|
| `config/tree-meta.json` | **有** | `lib/store.js:272` `function statMetaFile()`（取 `mtimeMs` / `size` / `ctimeMs`）；`:282` `function sameMetaStamp(a, b)`；`:313` `const stamp = statMetaFile();`；`:315` `if (!stamp || sameMetaStamp(stamp, metaStamp)) return metaCache;` | **外部改 meta → 长驻实例自动重读**（无需重启） |
| `migrate-output/trees/<tree_id>.json` | **无（零指纹）** | `lib/store.js:356` 注释 `// ---- 树 JSON（结构真源） ----`；`:358-374` `export async function getTree(treeId)` —— **`:359` `if (treeCache.has(treeId)) return treeCache.get(treeId);`**（命中进程内 `treeCache` 即返回）；local 分支 `:361-363` 才读盘，**全程不 stat、无 mtime / size 比对** | **外部改树 JSON → 长驻实例仍返旧快照 ⇒ 必须重启** |

> **口径（运维，适用于本机 3100 与一切长驻实例）**：**任何**外部改树 JSON 的动作 —— **R7 迁移 / 手工改 / 从备份恢复 / 换 `COMPAT_OUT_DIR` 数据目录 / 重传前后的本地核对** —— **完成后必须重启 compat-api**，否则：
> ① **读侧**（`/people` · `/tree/rank` · 树图 · 搜索）持续按**旧树快照**作答（新 meta 已生效、新树 JSON 未生效 ⇒ **meta 与树 JSON 短暂不一致**）；
> ② **写侧**（`lib/tree-write.js` 路径）会把命中 `treeCache` 的**旧快照整份回写**，覆盖磁盘上的新真源 —— 与 `docs/PENDING_DEPLOY.md` **§28-2 第 5 条**「先重启全部 local-server 实例」同源风险，同理**上云 `tree-meta` 前也必须先重启**。
> **本节实测回读证据（长驻实例 · 端口 3100 · PID 88224 · **未重启** · 2026-09-20 21:34 CST · 只读）**：
> - `GET /tree-meta` → `ji_23395_01` 的 `clan_tree_id=ji_23395` / `clan_handle=3c95530f8bd4f84dc0b87edc`、`gu_39038_01` 的 `clan_tree_id=gu_39038` / `clan_handle=5ae4c6e505c90d290f71f66b` = **均为新值**（meta 有指纹 ✅）。
> - `GET /people/10400594c54f5203f61bf4fa4b20`（`X-Tree-Id: ji_23395_01`）→ `attribute_list` = **旧 4 条** `[{"type":"external_tree","value":"ji_23395"},{"type":"external_person_handle","value":"3c95530f8bd4f84dc0b87edc"},{"type":"external_link_type","value":"founder"},{"type":"external_mirror","value":"true"}]`，而**现盘** `migrate-output/trees/ji_23395_01.json` 该节点 6 个 `external_*`（含 `external_founder_created_by`）**全为空串**（实测）⇒ **差异即旧 `treeCache`；重启后消失**。
> - **复现命令（只读）**：`lsof -nP -iTCP:3100 -sTCP:LISTEN`（实测 PID **88224**）· `curl -s localhost:3100/tree-meta` · `curl -s -H 'X-Tree-Id: ji_23395_01' localhost:3100/people/10400594c54f5203f61bf4fa4b20` · 重启 = 停/起 `node cloudfunctions/compat-api/local-server.js 3100`（口径见技能 `jiazu` / `docs/LOCAL_DEV.md`）。
> - **⚠️ 副作用（如实登记）**：上列读回在**未重启**的实例上执行 ⇒ 「**旧 `external_*`**」这一形状**正是 E1 收敛行为仍会发生的数据侧原因**；重启后 `mirrorTargetOf` 返回 `null`（家族树始祖不再带镜像标记）⇒ **不再收敛**（与 E1 裁定第 ③ 条互为印证）。

**（c）E1 登记行（裁定：不算缺陷 · Zang · 2026-09-20）**

- **事实**：「口径 A（点镜像节点 = 打开真身档案）」与新口径的交互实测 —— **正常点击流 / 深链会把镜像节点坐标 `replaceState` 收敛到真身**：实测 `person/detail?tree_id=ji_23395_01&handle=10400594c54f5203f61bf4fa4b20` 被改写为 `?tree_id=ji_23395&handle=3c95530f8bd4f84dc0b87edc`，页面显示 `mirrorNote` 逐字「**本节点为 季氏祖谱 000163 的镜像 · 内容取自真身**」（文案真源 `frontend/src/business/cross-tree.ts:236-238` `mirrorNoteText()`）⇒ **镜像自身的只读档案在正常点击流不可达**。
- **只读判据的可见面**：`founder-lock`（徽标）= `cross-tree.ts:371` `'始祖节点 · 祖谱镜像'`，渲染位 `frontend/src/components/person-archive/person-archive.vue:91`；`founder-hint`（文案）= `frontend/src/business/api.ts:1376` `CLAN_FOUNDER_LOCK_MESSAGE = '始祖节点信息需在本姓祖谱中修改'`，渲染位 `person-archive.vue:94`；二者**只在内层弹窗 / 不可收敛分支**（真身不可见 → `MIRROR_UNAVAILABLE_NOTE`（`cross-tree.ts:230`）回退；孤儿镜像 → `ORPHAN_MIRROR_LOCK_MESSAGE`（`api.ts:1380`））可见。
- **裁定（Zang）：不算缺陷** —— ① 与 **R1 单一真源**同向；② **R3 仍是后端防线 + 不可收敛态兜底**（判定与 403 面不改）；③ **R7 后家族树始祖变真身、不再触发收敛**。

**（d）E2 登记行（取证路径 · 次优但已获接受 · 必须写明理据）**

- E1 的上述证据由 **`PersonDetailModal.open(treeId, handle)`**（**公开 API**：`frontend/src/components/person-detail-modal/person-detail-modal.vue:81` `function open(treeId: string, handle: string, mirrorOf?: MirrorFields | null)`；`:159` `defineExpose({ open })`；与 `frontend/src/components/clan-hall/clan-hall.vue:411-419` `openOwnFounder` 的 catch 回退**同调用形状**：`:416` `archiveModal.value?.open(props.treeId, h, p)` / `:418` `archiveModal.value?.open(props.treeId, h)`）取得，**非真实鼠标点击** —— **属次优取证路径，已获接受**，但**必须写明理据**，避免后续会话误读为「正常路径可达」。
- **本轮的补证尝试（如实 · Jing · 2026-09-20 21:33 CST）**：**尝试真实点击流复现 + 独立验证未成** —— `browser_exec` 的 local 与默认两条后端均被 `browser.use_real_profile is on, but chrome is running and holds the profile's Login Data … write lock` 拦下（**未取得真实鼠标点击证据**）⇒ E1 的 UI 层结论**仍只**由 E2 路径支持；本节**不代判、不补证**。
- **本轮取得的独立结构侧证据（可复取 · 与 E1 观测 URL 逐字一致）**：① 长驻实例（未重启）上 `GET /people/10400594c54f5203f61bf4fa4b20`（`X-Tree-Id: ji_23395_01`）= 旧 4 条 `external_*` ⇒ `mirrorTargetOf`（`cross-tree.ts:201-208`，**三者齐备**才算镜像）必返回 `{treeId:'ji_23395', handle:'3c95530f8bd4f84dc0b87edc'}` ⇒ `frontend/src/pages/person/detail.vue:87-98` `convergeUrlTo()` 的 `replaceState` 目标**逐字** = `#/pages/person/detail?tree_id=ji_23395&handle=3c95530f8bd4f84dc0b87edc`（同文件 `:49-62` 深链落地即收敛、`:72-84` 回退态收敛回镜像原坐标）；② **现盘（R7 后）**该节点 `external_*` 全空 ⇒ 重启后 `mirrorTargetOf` 返回 `null` ⇒ **不再收敛**（E1 裁定第 ③ 条的数据侧依据）。
- **另一实测（只登记 · 不重开 E1 裁定）**：`GET /people/3c95530f8bd4f84dc0b87edc`（`X-Tree-Id: ji_23395` · **匿名**）→ `{"error":"该节点暂不可见（近代世谱系仅家族成员可见）"}` ⇒ **匿名读侧看不到宗谱登记镜像节点**（可见分层）；E1 观测到真身内容属**带会话 / 弹窗上下文**的路径。

**（e）本节（§9-11）边界**：**只改 `docs/**`**；**未改代码、未跑迁移脚本（含 dry-run）、未写真源、未重传 / 部署 / 打包、未提交、未尝试写 `AGENTS.md`**。真源现值 = `config/tree-meta.json` **`13616a89db2782256c3f33260aa32470`**（9,814 B）、`migrate-output/**` **317 文件**（本节编辑自身**零写入真源**）。**数值 / 行号 / md5 全部为 2026-09-20 21:31–21:36 CST 现盘实测**；与 `docs/PENDING_DEPLOY.md` **§29-10**、`docs/clan-tree.spec.md` **§11-6**、`docs/branch-clan-ops.spec.md` **§16-7** 同址登记。
