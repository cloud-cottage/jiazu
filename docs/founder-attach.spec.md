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
