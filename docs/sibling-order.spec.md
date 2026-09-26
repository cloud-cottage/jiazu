# 子女标签拖曳排序（排行）— 业务域规格（sibling-order.spec.md）

> **状态**：**已落地实现（Kong 实测 · 工作区在途未提交）· 待 Neng 终校**；本文件由 **Jing（制度员）** 按裁定 v1 起草并登记，**不含任何前端手写口径**。
> **裁定者 / 日期**：**Zang（总管）裁定 v1 · 2026-09-23**；闸门口径与既有四步沿用 `docs/economy-fee.spec.md`（本册不另立计费算法）。起草 / 落盘：**Jing · 2026-09-23 13:30 CST**。
> **真源级别**：**规格文件（业务域）**。与 `docs/economy-fee.spec.md`（扣费分册）冲突时，**计费与闸门口径以该册为准**，本文件只引用；本文件与实现冲突时**一律以代码即事实**（`AGENTS.md` §0-1）—— 差异登记见本文件 **§11**，**不得反过来照本文件改代码**。
> **字面纪律**：本文件所有路由 / 字段 / 文案 / 单价**逐字取自实现与实测**（`AGENTS.md` §0-3）；**不推算、不美化**。
> **时点**：`date` = **2026-09-23 13:30 CST**；行号均为该时点实测（工作区在途，行号会随后续落盘漂移，**以文件内容为准**）。
> **本批动作面**：新增 1 条写路由 + 1 个前端模态框组件；**不新增集合、不改真源数据、不新增字段**（详见 §2 / §13）。
> **状态更新（追加 · 2026-09-23 · 取代第 3 行状态）**：**已终校（Neng 复检通过 · 2026-09-23）** —— 三轮质检（Neng 首轮后端 → Neng-3 H5 → Neng-4 复检，两个阻塞缺陷已真修）结论与证据见 **`docs/sibling-order.qa.md`**；第 3 行「待 Neng 终校」**已作废**（原文保留）。终值基线 = **`npm test` 478 tests / 478 pass / 0 fail / 0 skipped（exit 0）**（`AGENTS.md` §7 追加行 —— **本回合未落盘**，见本文件 §14「落盘状态」）。收口项索引见本文件 **§14**。

---

## 1. 术语

| 术语 | 口径（逐字） |
|---|---|
| **排行** | 一个家庭（Gramps `family`）内**子女标签的显示顺序**；**唯一真源 = 该 family 节点 `child_handles[]` 的数组位次**（下标 0 = 第 1 位） |
| **位次** | **1 起**计数：`position = child_handles.indexOf(person_handle) + 1`（`lib/tree-write.js:499`）；`previous_position` 同口径取旧数组（`:500`） |
| **一段 / 分段** | 一个节点可有多个配偶家族（`person.spouse_families[]`）；**一个 `family_handle` = 一段**，各段独立排行；**一次提交只动一段**（§8） |
| **被拖动的子女** | 请求体 `person_handle` 指向的那个子女节点 —— **计费 `ref.person_handle`、`desc` 位次、`position` / `previous_position` 都按它算**（与被动移位的兄弟无关） |
| **no-op** | 提交的 `child_handles` 与现盘数组**逐位相同**（含「拖回原位」）→ **不扣费、不写库**（§5-3） |
| **只读节点** | 始祖真身 / 上层镜像等结构性不可写节点 → **403 且绝不先扣费**（§7） |

**读侧零改动即生效（本功能的关键前提）**：`cloudfunctions/compat-api/index.js:179` 的出参

```js
out.children = (fam.child_handles || []).map((c) => profilePerson(tree, c)).filter(Boolean);
```

已按**数组序**输出 `children` ⇒ 排行真源改的就是这一数组，**前端无需新增读接口 / 无需改读路径**（本批前端改动仅为「录入入口 + 排序 UI」，见 §9）。

---

## 2. 数据模型（**不新增任何字段**）

**显式声明：本功能不新增字段、不新增集合、不新增索引、不改任何既有字段形状。**

| 项 | 值 | 锚点 |
|---|---|---|
| 排行真源 | `trees/<tree_id>.json` → `families[<family_handle>].child_handles[]` 的**数组位次** | `lib/tree-write.js:536`（`fam.child_handles = next`） |
| 新增字段 | **无**（既无顶层字段、也无节点内字段、更无「rank / order」类冗余） | 同上 |
| 新增集合 | **无**（不计费到新集合；扣费写既有 `jiazu_assets`，见 §4） | `docs/economy-fee.spec.md` §2 |
| 写入方式 | **就地重排数组**（`fam.child_handles = next`），**元素集合不变**（只允许排列） | `lib/tree-write.js:488 / :536` |
| 乐观锁 | 走既有 `store.updateTree`（`version + 1` / `updated_at` 刷新；失败原地回滚 —— `docs/data-model.md` §7-1） | `lib/tree-write.js:521` |

**为什么不新增字段**：① 数组位次**本身已是** Gramps / 既有导出（GEDCOM `CHIL` 序）与前端渲染的既有语义载体；② 新增 `rank` 类字段会造出**第二套真源**（`AGENTS.md` §2.3「不要造第二套真源」），并在增删子女 / 拆家族 / 跨树迁移时**必然发生漂移**；③ 读侧 `index.js:179` 已按数组序出参 ⇒ 零改动可生效。

**连带面（如实登记）**：树图侧的数据组装**同样按 `f.child_handles` 数组序遍历**（`frontend/src/business/pedigree.ts:94 / :182 / :266`、`frontend/src/components/tree-pedigree/tree-pedigree.vue:187`）⇒ **排行调整会连带改变树图子女的遍历顺序**；其绘制左右位次是否随之变化**本批未实测**（列入 §12 未决项）。

---

## 3. 路由契约（逐字照实现）

### 3-1 请求

```
POST /admin/sibling-reorder
头：Authorization: Bearer <token>（必填）；X-Tree-Id 可选
体：{ tree_id, family_handle, person_handle, child_handles[] }
```

| 字段 | 必填 | 口径（逐字） |
|---|---|---|
| `tree_id` | 见右 | 树上下文取 **`body.tree_id \|\| X-Tree-Id`**（`index.js:1967`）；**两者都缺 → 400「缺少 tree_id」**（`index.js:1968`；无 X-Tree-Id **不**返回 403，见 §11-(a)） |
| `family_handle` | 是 | `String(...).trim()` 后为空 → **400「缺少 family_handle」**（`index.js:1963-1964`） |
| `person_handle` | 是 | 同上 → **400「缺少 person_handle」**（`index.js:1965`） |
| `child_handles` | 是 | 必须是**数组**（`Array.isArray`），否则 **400「缺少 child_handles（须为数组）」**（`index.js:1966`）；元素一律 `String(h ?? '')` 归一（路由 `:1981`，写路径 `lib/tree-write.js:486` 再归一一次） |

### 3-1-1 `person_handle` 选取规则（**追加 · 2026-09-23 终校** · **§3-1 上表该字段行原文保留**，本节为其补充口径）

| 项 | 口径（逐字） |
|---|---|
| 语义 | **`person_handle` = 本次被移动的那个子女**（既**不是**档案本人，也**不是**被动移位的兄弟）；后端按它算 `Tx.ref.person_handle` / `Tx.desc`（`调整排行：<姓名> 第 N 位`）/ `position` / `previous_position`；`lib/tree-write.js:489` 硬校验：必须在该 family 现有子女列表内 |
| 选取 ① · 最近被移动者 | 本段**最近一次被移动**的 handle = `movedMap[family_handle]`；**唯一写入点 = 唯一数组改写入口 `applyMove(from, to)`**（拖曳落位与 ▲▼ 两条通道共用同一入口 ⇒ **两通道等价**） |
| 一次会话移动多个 | 取**最后移动者**（`movedMap` 后写覆盖前写） |
| 选取 ② · 极端回退 | 本段无移动记录 / 记录已不在本段列表 → **按基线序取「第一个位次发生变化」者**（基线里第 i 位的节点在现序中已不在第 i 位 ⇒ 它就是被移位者）；实现 = `movedHandle` computed（`sibling-order-modal.vue:204-216`） |
| 命中不到 | 前端**报错且不发请求**：`submitError` = **「无法确定被移动的子女，请重新调整位次后再试」**（正常路径下「确定」已被 `dirty=false` 短路拦住，此分支只在异常态可达） |
| **已作废（本批整改）** | 原模态框 **`personHandle` prop（传的是档案本人）已删除**，`person-archive.vue` 侧传参同步删除（实测 `grep -n 'personHandle'` 于两文件 = **0 命中**）。现存 props = `treeId` / `personName`（**仅副标题展示用，不参与提交**）/ `segments` / `initialFamilyHandle` |
| 实测 | ▲▼ 通道提交 `person_handle` = **顾纯江**；拖曳通道提交 = **顾秀兰**；两者均 **200** + `fee.pieces:1`（证据汇编见 `docs/sibling-order.qa.md` **§3 / §4**） |

### 3-2 成功回执（`changed` 路径 · 200）

字段与**顺序**逐字照 `lib/tree-write.js:501-512` 的 `report` + 落盘后真值：

```
200 { ok: true, tree_id, family_handle, person_handle, person_name,
      position, previous_position, child_handles[], shifted[],
      noop: false, changed: true,
      version, updated_at,                       // 落盘后从磁盘读回的真值（:545）
      fee: { unit: 'bamboos', pieces: 1, balance, balance_after } }
```

| 字段 | 实测口径 |
|---|---|
| `person_name` | 被拖动子女的 `person.name`（树节点现值；无 → `''`） |
| `position` / `previous_position` | 新 / 旧**位次（1 起）**；实测例（`sibling-reorder.test.js:248-249`）：由第 3 位拖到第 2 位 → `position=2`、`previous_position=3` |
| `child_handles` | **提交序（= 落盘序）**的完整数组 |
| `shifted` | `next.filter((h, i) => current.indexOf(h) !== i)`（`lib/tree-write.js:511`）= **位次发生变化的所有 handle**；**仅回执信息，不参与计费**。⚠️ 实现**包含被拖动的本人**（语义与既有注释不一致，见 §11-(c)） |
| `version` / `updated_at` | **落盘后**重新 `getTree` 读回的真值（`lib/tree-write.js:544-546`；不猜自增结果）。一次提交 = 一次落盘 ⇒ `version + 1`（实测 `:257`） |
| `fee.balance` / `balance_after` | **扣费前余额 / 扣费后余额**（`lib/economy-fee.js:451`；实测 `:{5, 4}`） |

### 3-3 no-op 回执（200 · **不扣费不写库**）

| 项 | 实测口径 |
|---|---|
| 判定 | `current.length === next.length && current.every((h, i) => h === next[i])`（`lib/tree-write.js:515`）—— **逐位相同**（含把某行拖走又拖回原位） |
| 写路径返回 | `{ ...report, noop: true, changed: false, fee: null }`（`:516`）—— **不含 `version` / `updated_at`**（未写库、未读回） |
| 路由覆盖 `fee` | `index.js:1987-1989`：`fee = { unit: 'bamboos', pieces: 0, balance: q.current, balance_after: q.current }`（`q = eco.quoteBamboo(u.phone, 0)`，**只读**） |
| 零副作用 | 树 JSON **逐字节不变**（`version` / `updated_at` 不动）、**无任何流水**（既无 `edit_fee` 也无 `fee_refund`）、**连 `sweep` 都不落盘**（实测 `sibling-reorder.test.js:316-319`） |
| ⚠️ 语义差 | changed 路径的 `fee.balance` = **扣费前余额**；no-op 路径的 `balance` = **当前余额**（同一字段，两路径语义来源不同，均以实测为准） |

### 3-4 集合等价校验（**先于扣费**）

判据函数 `sameChildHandleSet(current, submitted)`（`lib/tree-write.js:423`，**纯函数、无 IO**）：

1. **等长**（`:426`）；
2. 提交侧**无重复**（`new Set(b).size !== b.length` → 不等价，`:427`）；
3. **同元素**（两侧排序后逐位相等，`:428-430`）。

任一不成立 → **400**，文案取自写路径常量 `CHILD_SET_MISMATCH_TEXT`（`lib/tree-write.js:436`，路由与前端**不得**另写一套）：

```
子女列表须与现有子女完全一致（等长 / 同元素 / 无重复）
```

随后再判 `person_handle` 是否在**该 family 的现有子女列表**内，否则 **400「person_handle 不在该家族的子女列表中」**（`lib/tree-write.js:489`）。
⇒ **本路由只允许「排列」，不允许增删成员**（增删 / 改挂靠有别的路由：`add-child` / `updatePerson` 的改父 / `delete-node`）。

### 3-5 代码锚点（2026-09-23 13:30 实测）

| 层 | 文件 / 行 |
|---|---|
| 路由 | `cloudfunctions/compat-api/index.js:1960`（`if (pathname === '/admin/sibling-reorder' && method === 'POST')`）；文件头路由清单注释 `:30` |
| 写路径 | `cloudfunctions/compat-api/lib/tree-write.js:464` `reorderChildren()`（导出）；本段起点 `:416`（`// ---- 同胞排行（子女标签排序）----`） |
| 单价 / 类型 | `cloudfunctions/compat-api/lib/economy-fee.js:53`（`sibling_reorder: 1`）、`:75`（`sibling_reorder: 'edit_fee'`）、`:104-105`（`feeOf('sibling_reorder')`）、`:404`（`defaultDesc` 兜底） |
| 前端 API | `frontend/src/business/api.ts:1310` `siblingReorder()`（**显式带 `tree_id`**）；转出 `frontend/src/business/index.ts:3`（函数）/ `:5`（类型） |
| 前端类型 | `frontend/src/business/types.ts:338`（`SiblingReorderPayload`）/ `:347`（`SiblingReorderFee`）/ `:355`（`SiblingReorderResult`）/ `:379`（`SiblingReorderSegment`） |
| 前端组件 | `frontend/src/components/sibling-order-modal/sibling-order-modal.vue`（新建，**406 行** = 时点值）；宿主 `frontend/src/components/person-archive/person-archive.vue:210`（入口按钮）/ `:475`（模态挂载）/ `:1986`（`canReorderKids`） |
| 测试 | `cloudfunctions/compat-api/lib/sibling-reorder.test.js`（新建，**512 行**，已注册进根 `package.json` 的 `scripts.test`） |
| **行号 / 行数漂移（本批整改后复测 · 追加 · 2026-09-23 18:19 CST）** | `sibling-order-modal.vue` 现 **505 行**（上表该行的「406 行」系**整改前**时点值，**原文保留**）；宿主 `person-archive.vue` 的 `canReorderKids` 现 **:1985**（上表记 `:1986`）；同文件入口 `:210-218` 与模态挂载 `:475` **不变**；`index.js:1960`（路由）与 `lib/sibling-reorder.test.js`（512 行）**不变** |

---

## 4. 计费口径

| 项 | 值 | 锚点 |
|---|---|---|
| 单价 | **1 片竹片 / 次** | `FEE.sibling_reorder = 1`（`lib/economy-fee.js:53`） |
| 计费单位 | 竹片（`unit: 'bamboos'`） | `lib/economy-fee.js:105` |
| `Tx.type` | **`edit_fee`**（**复用总册 §4-6 既有枚举，未自造类型**） | `TX_TYPE_OF_OP.sibling_reorder = 'edit_fee'`（`:75`） |
| 计费次数 | **一次「确定保存」= 一次计费**；**与被动移位的兄弟数量无关**（与 `people_count` / `mode` 等入参无关，实测 `economy-fee.test.js:256`） | `lib/economy-fee.js:103-105` |
| `Tx.delta` | `{ bamboos: -1 }` | `lib/economy-fee.js:443` |
| `Tx.ref` | `{ tree_id, person_handle, lots[] }`（`ref.tree_id` = 本树；`ref.person_handle` = **被拖动的子女节点**；`lots` = 本次消耗的批次明细，供原路冲正） | `lib/economy-fee.js:382-389`（`txRefOf`）；实测 `sibling-reorder.test.js:281-282` |
| `Tx.desc` | **「调整排行：<姓名> 第 <N> 位」**（写路径显式传入，无「（扣 N 片竹片）」后缀；`economy-fee.js:404` 的 `defaultDesc` 仅在未显式传 `desc` 时兜底） | `lib/tree-write.js:533`；实测 `sibling-reorder.test.js:283` = `调整排行：甲三 第 2 位` |
| `Tx.operator` | 发起人手机号 | `lib/economy-fee.js:446` |
| no-op | **0 片**、**无流水** | §3-3 |
| 扣减算法 | **不另写**：复用总册 FIFO by `expires_at` 升序 + 整单拒绝 409（本册只引用） | `docs/economy-fee.spec.md` §4-1 / §4-2 |
| 建树费 / 籽 | **不涉及**（本路由只扣竹片） | — |

> 总册同步请求（**本册不擅改总册**，见 `docs/economy-fee.spec.md` §6 头）：`docs/economy.spec.md`（总纲）的「修改类」单价表与「既有路由改语义」清单**尚未登记本行**（1 片 / 次 · `edit_fee`）⇒ 列入本文件 **§12 未决项 ⑥**。

---

## 5. 闸门与冲正

### 5-1 顺序（严格沿用 `docs/economy-fee.spec.md` §4-3 既有五步，**不新造流程**）

```
① requireWriteUser(headers, tree_id, ...)           → 401 / 403（不读资产、不扣费）      index.js:1972
② fa.assertFounderEditable(树, person_handle, 总谱)   → 403 只读节点（**必须拦在扣费之前**）index.js:1974
③ 集合校验（family 404 / 不等价 400 / person 不在列表 400）—— 先于扣费                tree-write.js:478-489
④ 余额预检 + 扣费（整单拒绝 409；no-op 不进扣费）                                     tree-write.js:524-535
⑤ 落库（updateTree 闭包：乐观锁 + 失败原地回滚）                                       tree-write.js:536-538
⑥ 落库失败 → 原路返还同一批次（refund）+ 500 + fee_refunded:true                       tree-write.js:541 + index.js:1993-1995
```

- **扣费在 `updateTree` 闭包内、且位于家族竞态复查之后**：闭包首步是 `tree.families[familyHandle]` 复查（并发删家族 → 404，此时**尚未扣费**，`tree-write.js:522-523`），第二步才是 `charge`（`:525-535`）。
- **只读预检在路由与写路径各做一次**（`index.js:1974` + `tree-write.js:493-496`，同一判据函数 `personEditLockMessage`）；写路径的那次只在传 `masterTreeId` 时生效（本路由**恒传**）。
- **被拒请求不得产生任何资产痕迹**：401 / 403 / 400 / 404 / 409 五类均实测「资产集合逐字节不变、无任何流水（含 `fee_refund`）」（`sibling-reorder.test.js:402-404 / 416-417 / 435-436 / 363-364 / 464-467`）。
- **写路径数组内其它成员（含镜像）只跟着移位，不单独判定只读**（`tree-write.js:492` 注释口径）。

### 5-2 冲正

- 落库失败（系统级 IO 失败，如树文件 `0444` → `EACCES`）→ **500 + `fee_refunded: true`** + **原路返还同一批次**（`lot_id` / `qty` / `expires_at` 复原，**不新造批次**），资产集合**逐字节复原**，流水 = `['edit_fee', 'fee_refund']` 各一条（实测 `sibling-reorder.test.js:472-497`）。
- 冲正失败 / 未扣费 → **不带** `fee_refunded`（`gate.refunded` 仅在真的冲正成功时置位，`index.js:286-295`）。
- 进程内缓存**不留幻影序**：冲正后同进程读回 `children` = **磁盘真值**（实测 `sibling-reorder.test.js:494-496`）。

---

## 6. 错误码表（逐字 · 状态码取自实现与实测）

| # | 场景 | 状态码 | 响应体（逐字） | 锚点 / 实测 |
|---|---|---|---|---|
| 1 | 缺 `family_handle` / `person_handle` / `child_handles` 非数组 / 无 `tree_id`（`body` 与 `X-Tree-Id` 皆缺） | **400** | `缺少 family_handle` / `缺少 person_handle` / `缺少 child_handles（须为数组）` / **`缺少 tree_id`** | `index.js:1964-1968`；实测 `sibling-reorder.test.js:372-382` |
| 2 | 子女集合不等价（少一个 / 多一个 / 换人 / 重复） | **400** | `子女列表须与现有子女完全一致（等长 / 同元素 / 无重复）` | `tree-write.js:436 / :488`；实测 `:339-340` |
| 3 | `person_handle` 不在该 family 的子女列表 | **400** | `person_handle 不在该家族的子女列表中` | `tree-write.js:489`；实测 `:361` |
| 4 | `family_handle` 不存在（含并发删家族的竞态复查） | **404** | **`家族记录不存在`** | `tree-write.js:434 / :483 / :523`；实测 `:356-357` |
| 5 | 树不存在 / 节点不存在 | **404** | `树不存在: <tree_id>` / `节点不存在` | `tree-write.js:479 / :481` |
| 6 | 未登录（无 `Authorization`） | **401** | `请先登录后再进行编辑操作` | `index.js:229 / :1972`；实测 `:433-434` |
| 7 | 游客（`role='guest'`） | **403** | `游客无编辑权限，请注册后编辑` | `index.js:233`；实测 `:414-415` |
| 8 | 总谱（`zhonghua`）非 `chief_editor` | **403** | `中华世本总谱仅总编辑（chief_editor）可编辑` | `index.js:236` |
| 9 | `user` / `branch_curator` 越出本人范围 | **403** | `您的权限范围仅限本人及向下节点` / `您的权限范围仅限本人上下三代节点` | `index.js:246-249` |
| 10 | **只读节点**（始祖真身 / 上层链镜像 / 家族树始祖镜像 / 祖谱登记镜像 / 孤儿镜像） | **403** | 文案取自 `personEditLockMessage` 的既有三态（**不自拼**）：`始祖节点信息需在中华世本（总谱）中修改`；`该节点为上层（中华世本）镜像，需到总谱修改`；`该节点为 <树标题> 始祖的镜像，需在 <树标题> 中修改` | `founder-attach.js:339 / :161 / :54 / :58`；实测 `:398-399`（`fa.MIRROR_LOCK_MESSAGE`） |
| 11 | 竹片不足 | **409** | `资产不足，需 1 片竹片，当前 0 片` + `code:'ASSET_INSUFFICIENT'` + `need:1` + `current:0` + `unit:'bamboos'` + `how_to_get[]` | `economy-fee.js`（整单拒绝）+ `index.js:1993`；实测 `:457-462` |
| 12 | **落库失败**（系统级 IO） | **500** | **`服务内部错误`**（`eco.INTERNAL_ERROR_TEXT`，**不含本机路径 / 不含底层异常原文**）+ **`fee_refunded: true`** | `economy-fee.js:649 / :670-675` + `index.js:370-375 / :1995`；实测 `:485-488` |
| 13 | 排行调整后结构校验失败（`checkTreeIntegrity` 非空） | **500** | `排行调整后结构校验失败：<前 3 条>` + `fee_refunded: true`（与落库失败同出口；已扣费 → 先冲正） | `tree-write.js:537-538`（**未单独实测**，口径按同一 catch） |

> 错误体纪律（沿用 `docs/economy-fee.spec.md` §6）：**响应体只允许出现白名单域名码**（`ASSET_INSUFFICIENT` / `DELETE_SCOPE_CHANGED`）；`EACCES` / `ENOENT` 等系统码与 `err.stack` **一律不得回显**（实测断言 `sibling-reorder.test.js:487`）。
> 前端识别按 `err.code`（`ApiStatusError`），**不用中文文案正则匹配**。

---

## 7. 权限与只读

| 项 | 口径 |
|---|---|
| 鉴权入口 | **`requireWriteUser(headers, tree_id, pathname, person_handle, false)`**（`index.js:1972`）—— 登录 + 非 guest + 总谱 `chief_editor` + **既有 `canEditPerson` 范围判定**（判据 = `person_handle`，**不新造判据**） |
| 树上下文 | `body.tree_id \|\| X-Tree-Id`；**本路由注册在「树编辑闸门」（`index.js:2578` 的 `缺少 X-Tree-Id`）之前**（路由在 `:1960`）⇒ 无 `X-Tree-Id` 亦可达（同段先例 = `/admin/reparent` / `/admin/delete-node`） |
| 只读节点 | 路由 `fa.assertFounderEditable` + 写路径 `personEditLockMessage` **双重预检** → **403，且绝不先扣费** |
| 出生地例外（契约 v2 C6） | **本路由不适用**：例外只在请求体**仅**含 `birth_place` / `residence_places` 时放行，而本路由请求体无这两键（路由侧调 `assertFounderEditable` 时 `body` 传 `null`） |
| 前端入口权限 | `canReorderKids = canEdit && !readonlyMode`（`person-archive.vue:1986`）—— **沿用组件内既有判定，不新造**；后端 403 文案由模态框**原样展示**并禁用「确定」（模态框 `locked` 态） |
| 无豁免通道 | 管理员 / `chief_editor` / 总谱 / 祖谱**一律同价同拦截**（`docs/economy-fee.spec.md` §1 口径 6 / §4-2） |

---

## 8. 多家族分段（一个节点多个配偶家庭）

| # | 口径 | 依据 |
|---|---|---|
| 1 | 请求体 `family_handle` **必传** ⇒ 服务端**按段受理**，一次调用只改**这一段**的 `child_handles` | `index.js:1962-1964`；`tree-write.js:536` |
| 2 | `child_handles` 必须与**该段** family 的现有子女集合等价（§3-4）⇒ **跨段合并提交必然 400**（不等价） | `tree-write.js:485-488` |
| 3 | 另一段 family 的数组**逐字节不动**（实测断言 `sibling-reorder.test.js:291-295` 的 C8：`fam2.child_handles` 不变） | 同上 |
| 4 | **一次拖动 = 一次计费**（切段不重复计费；两段各排一次 = 两次 1 片） | `economy-fee.js:53` |
| 5 | 分段 UI：`segments.length > 1` 才出分段 tabs；一次提交只保存当前段 | §9-2 |

---

## 9. 前端交互口径

### 9-1 入口

| 项 | 口径 | 锚点 |
|---|---|---|
| 位置 | 人物档案「子女」区、每个 family 的子女标签行尾「**调整排行**」按钮 | `person-archive.vue:210-218` |
| 显示条件 | `canReorderKids = canEdit && !readonlyMode` | `:1986` |
| 入参 | 模态框 `segments` = 各配偶家族的 `{ family_handle, spouse_name, children[{handle,name}] }`（**`children` 顺序即服务端当前排行**，仅保留有子女的段）；`initialFamilyHandle` = 点击的那一段 | `:1995-2005`、`types.ts:379`；`@done` → `onSiblingOrderDone`（宿主刷新档案子区） |

### 9-2 模态框（`components/sibling-order-modal/sibling-order-modal.vue`，新建）

| 项 | 口径（逐字） |
|---|---|
| 标题 | `调整排行` |
| 副标题 | `<姓名> 的子女排行：长按姓名后上下拖曳，或用 ▲▼ 微调位次。` |
| 分段 tabs | 仅当 `segments.length > 1`；标签 = `配偶：<姓名>` 或 `第 N 段`；提示 `一次提交只保存当前这一段（<配偶标签>）；切换分段不会保存另一段的改动。` |
| 行结构 | **每行 = 序号（1/2/3… = 下标 + 1）+ 姓名 + `▲` / `▼`** |
| 双通道 | **长按拖曳** + **▲▼ 逐位微调**；两通道改的是**同一份本地顺序 state**（`orderMap[family_handle]`）；唯一的数组改写入口 = `applyMove(from, to)` |
| 拖曳事件 | uni-app touch 事件自算位移与目标位次：`@touchstart` / `@longpress`（**长按才进入拖曳**）/ `@touchmove` / `@touchend` / `@touchcancel`；**不使用 HTML5 drag & drop**（微信小程序无该 API） |
| 位移阈值 | **`DRAG_THRESHOLD = 12`（px）**：`|dy| < 12` → **不换位**（防长按后手抖误改位次） |
| 位次换算 | 目标位次 = `clamp(from + trunc(dy / rowHeight), 0, len-1)`；行高由 `createSelectorQuery` 实测，失败兜底常量 **`ROW_H = 44` px** |
| 落位时机 | 拖曳期间**只做样式位移预览**（被拖行跟手、区间内其余行让位），**松手（touchend）才改写数组** |
| 页脚常驻提示 | `本次调整消耗 1 片竹片（未改动不扣费）；确定后请再确认一次。` |
| 未改动 | 点「确定」且本地未改动 → toast `排行未改动，无需保存`，**不发请求** |
| **二次确认（计费明示）** | `uni.showModal` 标题 `调整排行`，内容 `本次调整消耗 1 片竹片。\n<配偶标签>的子女排行将按调整后的顺序保存。`（`confirmText` = `确定调整`） |
| 成功 | `noop` → toast `排行未变化，未消耗竹片`；否则 `feeText(fee)` 或 `排行已保存`；随后 `emit('done')` + `emit('close')` |
| 403（只读节点） | **原样展示后端文案** 并置 `locked`（禁用「确定」、本地顺序保留；**不重试、不自拼口径**） |
| 409（资产不足） | `submitError` = **后端原文**（`资产不足，需 1 片竹片，当前 Y 片`）直出 + 资产不足引导（`showAssetInsufficientGuide`）；**本地顺序原样保留可重试**（不自动重试、不静默吞错） |
| 遮罩关闭 | 遮罩 `@click` + 内层 `@click.stop` 成对写法（同 §22 批全仓 11 处口径）；提交中禁止关闭 |
| no-op 裁定方 | **由后端裁定**，前端**不复制** no-op 判定（前端只做「本地未改动 → 不发请求」的短路） |

### 9-2-1 二次确认层 = **自绘** · no-op 双路径（**追加 · 2026-09-23 终校**）

> **作废标注（`AGENTS.md` §0-4）**：§9-2 表中「**二次确认（计费明示）**」一行（原口径 = `uni.showModal`，标题 `调整排行`、内容 `本次调整消耗 1 片竹片。\n<配偶标签>的子女排行将按调整后的顺序保存。`、`confirmText` = `确定调整`）**已作废**，**该行原文保留**；现盘实现以下表为准。

| 项 | 现盘实测（逐字） |
|---|---|
| 实现手段 | **自绘确认层**（**不再用 `uni.showModal`**）；元素链 = `.som-confirm-mask` → `.som-confirm` → 按钮 `.som-confirm-ok`（`确定调整`） / `取消` |
| 层级（实测） | `.som-confirm-mask` **z-index = 1010**，与 `.som-panel` **同为 `.som-mask`（z-index = 1000）的子节点**（`.som-mask` 自带 `z-index` ⇒ 自成层叠上下文，故子层只需高于同层内的面板即可） |
| 文案模板（逐字） | 标题 `调整排行`；正文 = **「调整 {{被移动子女姓名}} 的排行，消耗 1 片竹片。」** + 「**<配偶标签>的子女排行将按调整后的顺序保存。**」；按钮 = `取消` / `确定调整` |
| 弃用 `uni.showModal` 的成因 | `uni.showModal` 的 `.uni-modal` **z-index = 999**，低于本组件遮罩 `.som-mask` = **1000** ⇒ 确认框被遮罩**完全盖住**（旧缺陷，Neng-3 抳到，见 `docs/sibling-order.qa.md` **§3.2**） |
| 可点击性实测 | `document.elementFromPoint(...)` 在 `.som-confirm-ok` 的**中心**与**左上角两处均命中其本体**；真实 `Input.dispatchMouseEvent` 指针点击**可提交** |
| 计费口径 | **不改**：确认层只是「明示单价 + 被移动子女姓名」的**交互层** —— 单价 / `Tx.type` / no-op 判定 / 闸门顺序**一律不因此改变**（仍以 `docs/economy-fee.spec.md` **§15-1 / §15-2** 为准） |

**no-op 双路径（两条文案逐字登记）**

| # | 路径 | 触发条件 | 文案（逐字） | 请求 / 计费 |
|---|---|---|---|---|
| ① | **前端短路** | 本地顺序与基线**逐位相同**（`dirty=false`） | toast **「排行未改动，无需保存」** | **零请求**（不发 HTTP）、0 片 |
| ② | **后端 `noop:true`** | 提交的 `child_handles` 与**现盘**数组逐位相同（含「拖走又拖回原位」） | toast **「排行未变化，未消耗竹片」** | **200** + `noop:true` + `fee.pieces:0`；**不写库、无流水**（`docs/economy-fee.spec.md` §15-2） |

> ① 与 ② **并存且互补**（前端**不复制**后端 no-op 判定）：① 只处理「与**本地基线**相同」⇒ 不发请求；② 由**后端**对**现盘**裁定 ⇒ 其分支**保留且在 API 层可达**（`fee.pieces:0`、余额不变、树逐字节不变）。成功（非 no-op）toast = `feeText(fee)` 或 **「排行已保存」**。

### 9-3 API 封装

| 项 | 口径 |
|---|---|
| 函数 | `siblingReorder(treeId, payload, token)` → `authedFetch(treeId, '/admin/sibling-reorder', 'POST', token, { tree_id: treeId, family_handle, person_handle, child_handles })`（**显式带 `tree_id`**） |
| 转出 | `frontend/src/business/index.ts` **值转出**（`:3`）+ **类型转出**（`:5`） |
| 类型 | `types.ts`：`SiblingReorderPayload` / `SiblingReorderFee` / `SiblingReorderResult` / `SiblingReorderSegment` |
| 错误透出 | 沿用 `ApiStatusError`（`status` / `message` / `code`）；资产不足走既有 `isAssetInsufficientError` / `showAssetInsufficientGuide` |

---

## 10. 测试与本地证据

| 项 | 实测 |
|---|---|
| 专测文件 | `cloudfunctions/compat-api/lib/sibling-reorder.test.js`（**512 行**，新建） |
| 注册 | 已追加进根 `package.json` 的 `scripts.test`（**该行为新增项，不改既有项**）；注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` = **29**（**未注册 = 假绿**，`AGENTS.md` §7） |
| 覆盖 | 单价矩阵（`FEE.sibling_reorder=1` / `tx_type='edit_fee'`）· 集合等价纯函数 · 正常重排（落盘序 = 提交序 + 读接口 `children` 同步 + `ref`/`desc` 完整）· 多家族分段 C8 · **no-op 零副作用** · 集合不等价 4 例 · family 404 / person 不在列表 400 · 缺参 4 例 · 只读镜像 403（资产零变化）· 游客 403 · 未登录 401 · 余额不足 409 · **落库失败 0444 → 500 + `fee_refunded` + 资产逐字节复原 + 无幻影序** · 真源零写入（`config/tree-meta.json` + `migrate-output/{trees,details,collections}` 全量 md5 断言） |
| 连带断言 | `lib/economy-fee.test.js` 同批追加：`FEE` 矩阵行（`:247 / :255-256`）、`fee_refunded` 路由清单（`:1128 / :1186`）；**`ZERO_FEE_ROUTES` 仍为 30 条**（本路由为**扣费行**，不进 0 片清单，`:1125`） |
| `npm test` 读数 | **478 tests / 476 pass / 2 fail / 0 skipped**（exit 1 · Jing 2026-09-23 13:30:28 CST 实测）；2 红 = `lib/mirror-count.test.js` 的 **M2**（点名镜像 `I000143` 未命中）与 **M6**（`ji_23395_01` 快照），**均为预存在的真源漂移、与本批无关**（详见 `AGENTS.md` §7 追加行 / `docs/PENDING_DEPLOY.md` §31） |
| 真机 / 端上质检 | **未做**（本文件不含真机结论；按仓内惯例由 Neng 收口，`docs/*.qa.md` 另册） |
| `vue-tsc` | **未由 Jing 复核**（§12 未决项 ①） |

---

## 11. 已接受差异登记（**与裁定 v1 不一致处 · 以实现为准 · 不美化**）

| # | 裁定 v1 的说法 | **实现 / 实测量** | 处置 |
|---|---|---|---|
| **(a)** | 无 `X-Tree-Id` → **403** | **不成立**：① 无 `Authorization` → **401 `请先登录后再进行编辑操作`**；② 已登录 + 仅 `body.tree_id`（无头）→ **200 正常受理**（实测 `sibling-reorder.test.js:439-443`）；③ `body.tree_id` 与 `X-Tree-Id` **都缺** → **400 `缺少 tree_id`**（`:381-382`）。原因：路由注册在树编辑闸门（`index.js:2578`）**之前**，树上下文取 `body.tree_id \|\| X-Tree-Id`（同段先例 = `/admin/reparent` / `/admin/delete-node`） | **已接受**（口径 = 实现）；本文件 §3-1 / §6 #1 / §7 按实测登记 |
| **(b)** | 落库失败 → **400** + `fee_refunded:true` | **500** + `fee_refunded:true`：系统级 IO 失败（树文件 `0444` → `EACCES`）经 `errorStatusOf`（`index.js:370-375`）**一律 500 + 通用文案 `服务内部错误`**（实测 `:485-488`）。**「通用文案 + 500」是既有系统级失败口径**，业务错误才沿用自身 4xx | **已接受**；§5-2 / §6 #12 按实测登记 |
| **(c)** | （注释口径）`shifted` = 「被动移位的兄弟（**不含本人**）」 | **注释与实现不符**：实现 = `next.filter((h, i) => current.indexOf(h) !== i)`（`tree-write.js:511`）⇒ **位次发生变化的所有 handle**；changed 路径下被拖动的本人位次必然变化 ⇒ **必然包含本人**。前端类型注释（`types.ts:366`）同写「不含本人」。该字段**不参与计费**，且**当前无任何测试断言**（`grep -c shifted lib/sibling-reorder.test.js` = **0**） | **如实登记 · 待 Kong 提单修注释**（Jing 不改代码）；本文件 §3-2 按实现登记 |
| **(d)** | （分册举例）系统级失败文案示例 = 「服务器开小差了，请稍后重试」 | 本路由**实现字面** = `eco.INTERNAL_ERROR_TEXT` = **`服务内部错误`**（`economy-fee.js:649`；实测 `sibling-reorder.test.js:486`） | **历史行不改写**（`docs/economy-fee.spec.md` §6 该行为**示例性质**）；本文件 §6 #12 按实测登记 |
| **(e)** | （分册 §5-1 `FEE` 导出清单）只列 5 项 | 现盘 `FEE` = **7 项**（多 `sibling_reorder` / `branch_fee_seeds`） | **历史行不改写**，在 `docs/economy-fee.spec.md` **§15** 以追加行同址登记 |

> **另登记（不是差异，是裁定 v1 未写、实现已定的口径）**：① `tree_id` 回落顺序 = `body.tree_id` **优先于** `X-Tree-Id`；② 写路径对 `child_handles` 元素做 `String(h ?? '')` 归一（`null` / 数字会被字符串化）；③ no-op 回执**不含** `version` / `updated_at`；④ 扣费位于闭包的**家族竞态复查之后**（404 竞态不产生冲正）。

---

## 12. 未决项（**只登记，不发明口径**）

| # | 未决项 | 现状 / 为什么未决 | 建议落点 |
|---|---|---|---|
| ① | **跨树迁移 / 镜像复制 / 拆树（分迁 / 立支）时位次如何随迁** | 本批**未定义、未实现、未测试**：`child_handles[]` 在 `reparentAcrossTrees` / `establishBranch` / `splitTree` 中如何被重建或复制，**未被本口径覆盖** | 随相应 spec（`docs/clan-tree.spec.md` / `docs/branch-clan-ops.spec.md` / `docs/tree-id.spec.md`）的新增章节定案；**本批不得据本文件推定** |
| ② | **GEDCOM `CHIL` 序是否从此获得语义** | `scripts/gedcom-export.mjs` / `gedcom-import.mjs` 与本口径的关系**未评估**（导出是否按 `child_handles[]` 序写 `CHIL`、导入是否回填该序） | 由 GEDCOM 管线专项裁定后登记；**本批不动导出 / 导入脚本** |
| ③ | 树图子女**左右位次**是否随排行变化 | 树图组装按 `f.child_handles` 数组序遍历（`pedigree.ts:94 / :182 / :266`、`tree-pedigree.vue:187`）；**绘制位次是否随之变化未实测** | Neng 真机质检（`docs/*.qa.md` 另册） |
| ④ | `shifted` 注释口径修正 | 见 §11-(c)（注释错、实现对、无断言） | **向 Kong 提单**（Jing 不改代码）；修注释或修语义须**先有裁定** |
| ⑤ | 跨段合并提交 | 当前**只能一段一次提交**（跨段数组必然不等价 → 400）；是否提供「多段一次保存」**未定** | 产品裁定；若定案须同时定**计费次数**（1 片 / 段 还是 1 片 / 次） |
| ⑥ | 总纲同步 | `docs/economy.spec.md`（总纲）的修改类单价表 / 「既有路由改语义」清单**尚未登记本行**（1 片 / 次 · `edit_fee`） | **本册不擅改总纲**（`economy-fee.spec.md` §6 头）；由总册终审裁定后同步 |
| ⑦ | `npm test` 全绿门槛 | 当前 **478 / 476 / 2**（2 红 = `mirror-count` 真源漂移，**预存在**）；本批自身的 `sibling-reorder.test.js` **全绿** | 2 红随真源重同步结案（`AGENTS.md` §7 追加行）；**全绿前不得打包 / 部署** |
| ⑧ | 前端 `vue-tsc` | **未由 Jing 复核**（非制度员职责边界外的复核项） | Neng 质检收口 |
| ⑨ | **多配偶分段 / 跨段提交未验** | 实测仅覆盖**单 family（顾氏 9 名子女）**：多 `segments` 的 tabs 切换、跨段合并提交（必然 400）**均未实跑** | Neng 真机质检补充（`docs/sibling-order.qa.md` §5 未决 1） |
| ⑩ | **端上形态非实机** | 尾次真机 = **headless Chrome 桌面 UA + 触摸仿真**；**非实机 iOS / Android、未进微信小程序** | 微信小程序端专项质检（真机 + 开发者工具） |
| ⑪ | **后端 `noop:true` 未在 UI 层独立复现** | ② 路径仅 **API 直调**验证（`fee.pieces:0`）；**未**在 H5 界面上「拖走又拖回原位」触发过 ②（UI 上该场景被 ① 短路） | Neng / 后续 UI 层专项 |
| ⑫ | **reload 前后行序号未逐帧比对** | 保存后 reload 档案页，行序号（1/2/3…）与提交序是否**逐帧一致**未做帧级取证 | 后续真机质检 |
| ⑬ | **慢网 / 并发未验** | 提交中的慢网重试、同一 family 并发两次提交、与其它写路由并发**均未验**（`jiazu_assets` 单文档仅进程内锁 = 既有部署阻塞点，`docs/PENDING_DEPLOY.md` §7-7） | 与部署阻塞点一并评估 |
| ⑭ | **`shifted` 含本人 —— 口径确认（新增实测例）** | 实测例：现序 `a b c d` 中把**第 3 位 `c`** 拖到第 1 位 → `next = c a b d` ⇒ **`shifted` = `[c, a, b, d]`**（`c` 位次 3→1、`a` 1→2、`b` 2→3、`d` 3→3 不变 ⇒ **含被拖动的本人 `c`**）。与 §11-(c) / §3-2 口径一致（**仅回执信息、不参与计费**） | 注释修正仍待 Kong 提单（§11-(c) / 本表 ④） |
| ⑮ | **`npm test` 全绿门槛 —— 已达标（取代本表 ⑦ 的「478 / 476 / 2」读数，⑦ 原文保留）** | 终值 = **478 tests / 478 pass / 0 fail / 0 skipped（exit 0）**（2026-09-23 **18:20 CST** Jing 复跑；另经 Zang 亲跑、Kong 与 Neng 各跑过一次，四方一致）⇒ **⑦ 的 2 红已随 `mirror-count` 点名重同步清零**（`docs/PENDING_DEPLOY.md` §31 追加行；`AGENTS.md` §7 追加行 **本回合未落盘** —— 见本文件 §14「落盘状态」） | 门槛已达标；**打包 / 部署仍按 `docs/PENDING_DEPLOY.md` §31 逐项执行**（云函数产物**仍未重打包**） |

---

## 13. 交叉引用

| 文件 | 关系 |
|---|---|
| `docs/economy-fee.spec.md` | **计费 / 闸门 / 冲正唯一权威**：本册 §4 / §5 逐字引用其 §4-1 – §4-3、§4-6；本批在其 **§3-1 主表 #36** 与 **§15** 追加登记 |
| `docs/data-model.md` | 树 JSON 三层存储与 `§7 写一致性`（单树写路径不变量）；本路由只写树 JSON、**不写详情** |
| `docs/permission-tier.spec.md` | `requireWriteUser` / `canEditPerson` 权限阶梯；本文件只规定「校验必须先于扣费」 |
| `docs/founder-attach.spec.md` | 只读节点判据 `personEditLockMessage` 的**来源**（§9 变体 A：始祖真身在家族树）；本路由直接复用，不另写判据 |
| `docs/chain-batch-append.spec.md` / `docs/home-sort-search.spec.md` | 0 片新增类 / 排序类既有口径（本路由是**扣费**行，不属 0 片清单） |
| `AGENTS.md` | **§0** 文档索引（本文件已登记）· **§9** 常见任务速查 · **§7** 实测基线（本批读数登记） |
| `docs/PENDING_DEPLOY.md` | 本批上云动作登记 = **§31**（云函数重打包 + 前端重打；**纯数据面无**） |

---

## 14. 终校收口（**追加 · 2026-09-23** · Neng 复检通过）

> **纪律声明（`AGENTS.md` §0-4 / §0-5）**：本节为**追加章节** —— 本文件 **§1–§13 的既有行一律原文保留**；凡被取代处一律以**「已作废 / 已取代」标注**落地（见头部状态行 / §3-1-1 / §9-2-1 / §12 ⑮），**不机械改写历史行**。

| # | 收口项 | 落点 |
|---|---|---|
| 1 | 状态转 **已终校（Neng 复检通过 · 2026-09-23）** | 本文件头部追加状态行（取代第 3 行状态，该行原文保留） |
| 2 | `person_handle` 选取规则（= 被移动的那个子女） | **§3-1-1**（§3-1 字段表原文不变） |
| 3 | 二次确认层 = **自绘** + 文案模板 + z-index 实测 + 弃用 `uni.showModal` 成因 | **§9-2-1**（§9-2 该行**已作废**、原文保留） |
| 4 | **no-op 双路径** + 两条文案逐字 | **§9-2-1**（计费口径不变 ⇒ 仍以 `docs/economy-fee.spec.md` §15-2 为准） |
| 5 | 代码锚点行号漂移更正（时点值） | **§3-5** 追加行 |
| 6 | 未决项补充（5 条降级项 + `shifted` 实测例 + 门槛达标） | **§12** ⑨–⑮ |
| 7 | 三轮质检证据汇编（Neng 首轮 / Neng-3 H5 / Neng-4 复检） | **`docs/sibling-order.qa.md`**（新建 · 只追加） |
| 8 | 部署项（含前端整改后文件的重打判据） | **`docs/PENDING_DEPLOY.md`** **§31** 追加行 |
| 9 | 终值基线 + `mirror-count` 点名重同步登记 | **`AGENTS.md`** **§7** 追加行（**本回合未落盘** —— 见下「落盘状态」）；**`AGENTS.md` §0** 文档索引追加行 与 **§9** 速查追加行 **已落盘** |

**终值基线（本文件唯一承认的交付门槛读数）**：`cd /Users/kevin/bistro/jiazu && npm test` → **478 tests / 478 pass / 0 fail / 0 skipped**（**exit 0**）；实测时点 **2026-09-23 18:20 CST**（Jing 复跑；另经 Zang 亲跑、Kong 与 Neng 各跑过，四方一致）。本批专测 `cloudfunctions/compat-api/lib/sibling-reorder.test.js`（512 行）全绿；`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = **29**（**未注册 = 假绿**）。

**仍未收敛（不得据本文件推定已验）**：§12 **①–⑭ 全部照旧挂起**；云函数产物**仍未重打包**（`cloudfunctions/deploy/compat-api/index.js` 内 `grep -c 'sibling-reorder'` = **0**，2026-09-23 18:19 CST 实测）⇒ **部署动作未开始**（`docs/PENDING_DEPLOY.md` §31）。

**落盘状态（如实登记 · 2026-09-23 18:20 CST）**：`AGENTS.md` 属**受保护的 AI 约定文件** —— 本回合对其 **§7 追加行**（`npm test` 终值基线 + `mirror-count` 点名重同步登记）的写入**因写保护审批未获响应而**未落盘**（**不重试**）；**其内容已完整登记在本文件 §14 + `docs/sibling-order.qa.md` §7**，`AGENTS.md` **§0 索引表**与 **§9 速查**的追加行**已落盘**。⇒ 本文件与 `docs/sibling-order.qa.md` 中凡指向「`AGENTS.md` §7 追加行」之处，**均为「待落盘登记」，不得据以推定该行已存在**（`AGENTS.md` §10 纪律）。

**落盘状态追记（追加 · 2026-09-23 18:48 CST · **只追加**）**：**`AGENTS.md` §7 追加行已于 2026-09-23 18:48 CST 落盘**（第 ① 项已完成 · 该行位于 `AGENTS.md` **第 213 行**，内容 = `npm test` 终值基线 **478 / 478 / 0 / 0（exit 0）** + `mirror-count` 点名重同步 `GU_MIRROR_GIDS` 5→4 / `JI_MIRROR_GIDS` 4→3，**断言零放宽**）；上段「**本回合未落盘**」措辞**属本回合初态、原文保留**，其语义**自本追记起被覆盖**，**一律以本追记为准**（`AGENTS.md` §10 纪律）。

---

## 15. 落盘追记（追加 · 2026-09-23 · 只追加 · 不改 §1–§14 既有行）

> **纪律声明（`AGENTS.md` §0-4 / §0-5 · §10）**：本节为**追加章节** —— 本文件 **§1–§14 的既有行一律原文保留**（含第 **9** / **349** / **381** / **387** 行）；凡被取代处一律以「**已过时 / 已不成立**」标注落地，**不机械改写历史行**。

- **被本节覆盖的三处「`AGENTS.md` §7 追加行本回合未落盘」措辞**（原文保留、语义**自本节起被覆盖**）：
  - **第 9 行**（头部「状态更新（追加 · 2026-09-23 · 取代第 3 行状态）」中：「`AGENTS.md` §7 追加行 —— **本回合未落盘**，见本文件 §14「落盘状态」」）⇒ **已过时**；
  - **第 349 行**（§12 ⑮：「`AGENTS.md` §7 追加行 **本回合未落盘** —— 见本文件 §14「落盘状态」」）⇒ **已过时**；
  - **第 381 行**（§14 第 9 项：「`AGENTS.md` **§7** 追加行（**本回合未落盘** —— 见下「落盘状态」）」）⇒ **已过时**。
- **第 387 行的全局断言已不成立**（原文保留）：「⇒ 本文件与 `docs/sibling-order.qa.md` 中凡指向「`AGENTS.md` §7 追加行」之处，**均为「待落盘登记」，不得据以推定该行已存在**」—— 该行**已于 2026-09-23 18:48 CST 落盘**，本节所引各「未落盘 / 待落盘登记」措辞**一律作废**。
- **指向的落盘位置（2026-09-23 追记时点实测 · 行号以实测为准）**：`AGENTS.md` **第 213 行**（`npm test` 终值基线 **478 / 478 / 0 / 0（exit 0）** + `mirror-count` 点名重同步登记）· **第 214 行**（真源写入登记；含其**追记行** = **第 215 行**）· **第 243 行**（§9 追记；本批追记行插入**前** = 第 242 行）；**本文件第 389 行**既有「落盘状态追记」照旧有效。
- **`shen_27784_01` 归属已确认**：`migrate-output/trees/shen_27784_01.json`（**14:25:10**）+ `migrate-output/details/shen_27784_01:*` × **2**（**14:24:09 / 14:25:10**）**归属已由 Kevin 当面确认 = 归 Kevin 本人**；本批 **2026-09-23** 窗口内**四类写入**（`shen_27784_01` / `ji_23395_01` / `pan_28504_01` + `jiazu_assets` & `tree-meta.json` 连带变更）**全部已认领，无待确认项**（登记见 `AGENTS.md` **第 215 行**）。
- **追加性判据（实测 · 2026-09-23 追记时点）**：`git diff --numstat AGENTS.md docs/PENDING_DEPLOY.md` ⇒ `14 / 0` 与 `207 / 0`（**本批四件落盘后实测**；本批四件落盘前 = `13 / 0` 与 `205 / 0`），**删除行均 = 0 = 纯追加**。
- **本册其余结论不变**：§13 交叉引用、§14 终值基线与未决项、云函数产物**仍未重打包**（打包 / 部署仍按 `docs/PENDING_DEPLOY.md` §31 逐项执行）。

---

## 16. §10 读数追记（追加 · 2026-09-23 · 只追加）

> **纪律声明（`AGENTS.md` §0-4 / §0-5 · §10）**：本节为**追加章节** —— 本文件 **§1–§15 的既有行一律原文保留**（含第 **311** / **341** / **349** 行）；凡被取代处一律以「**已作废 / 已过时**」标注落地，**不机械改写历史行**。

- **§10 表中「`npm test` 读数」行（第 311 行一带）已作废（原文保留）**：该行所载 **「478 tests / 476 pass / 2 fail / 0 skipped（exit 1）」** 为**整改前**读数（Jing 2026-09-23 13:30:28 CST 实测）；本册 **§12 ⑮ 只取代 §12 ⑦**（同一读数），**未覆盖 §10**（第 311 行），故在此同址补记。
- **终值（本册唯一承认的门槛读数 · 与 §14 一致）**：`cd /Users/kevin/bistro/jiazu && npm test` → **478 tests / 478 pass / 0 fail / 0 skipped（exit 0）**（2026-09-23 **18:20 CST** Jing 复跑；另经 **Zang 亲跑 + Kong / Neng 各跑过一次** ⇒ **四方各跑一致**）。
- **两条红项已清零**：`cloudfunctions/compat-api/lib/mirror-count.test.js` 的 **M2**（点名镜像 `I000143`）与 **M6**（`ji_23395_01` 快照 / 点名 `I000209`）**已随点名重同步清零**（`GU_MIRROR_GIDS` 5 → 4 删 `I000143`；`JI_MIRROR_GIDS` 4 → 3 删 `I000209`，依据 = 真源对应节点 `external_mirror` 已变空串，**断言零放宽**）—— 详细登记见 **`AGENTS.md` 第 213 行** + 本册 **§14**「终值基线」/ **§15**（§15 落盘追记另含 `shen_27784_01` 归属确认）。
- **真源零写入口径澄清（追加 · 2026-09-23）**：`docs/PENDING_DEPLOY.md` **第 43 行一带**「`migrate-output/**` 与 `config/tree-meta.json` **本批未被触碰**」**不得**按字面读作「本批窗口内这两个路径零字节变化」（与 Kevin 窗口内实际写入**字面冲突**）；其**正确读法 = 「本批（子女排行）实施动作零写入」**（子代理全程 `/tmp` 副本 + 真源 **md5 逐对比对**，代码面 / 实施动作**不触碰真源**）。Kevin 于 **14:24–15:54** 的四类窗口内写入属**批次外个人操作**（**已认领**，登记见 `AGENTS.md` **第 214 / 215 行** + 只读快照 `~/jiazu-backups/2026-09-23-kevin-writes/`，`MD5-LEDGER.txt` **339** 条）；**两者不矛盾**，上句原文**保留不改**。
- **本册其余结论不变**：§13 交叉引用、§14 终值基线与未决项（§12 ①–⑭ 照旧挂起）、云函数产物**仍未重打包**（打包 / 部署仍按 `docs/PENDING_DEPLOY.md` §31 逐项执行）。

---

## 17. 排行落点实测澄清（**追加 · 2026-09-24 · 只追加 · §1–§16 既有行原文一律保留**）

> **来源**：本批收口指令「**排行落 `child_handles` 澄清**」+ **2026-09-24 17:47–17:48 CST 真源内一次真实排行写入**（**归属 = 归 Kevin 本人 · Kevin 已当面确认**）。
> **性质**：追加章节 —— 本节**只补实测证据**，**不改任何口径**；§1 / §2 的「**排行真源 = `family.child_handles[]` 数组位次 · 不新增字段**」**继续有效**，本节为其**真源级正例**（旧行一律原文保留）。

### 17-1 实测（Jing · 2026-09-24 20:30–20:36 CST · **只读**）

| # | 读数 | 实测 |
|---|---|---|
| ① | 账本流水（`migrate-output/collections/jiazu_assets.json` → `global.users["16601061656"].txs`） | 流水共 **149** 条；`ts >= 2026-09-24T00` 共 **4** 条，**全部** `type = 'edit_fee'`、`delta.bamboos = -1`、`operator = '16601061656'`、`ref.tree_id = 'gu_39038_01'`；窗口 = **`09:47:06.672Z` → `09:48:10.293Z`**（CST **17:47:06 → 17:48:10**，= **63.621s ≈ 64 秒**） |
| ② | **其中 1 条 = 排行写入** | `tx_mufcleeo1mx4v`（`2026-09-24T09:47:06.672Z`）`desc` **逐字 = 「调整排行：顾纯海 第 4 位」**、`ref.person_handle = 103f95b87b7c795ef76f98fb261f`（顾纯海）—— `desc` 句式即实现口径 `调整排行：${姓名} 第 ${位次} 位`（`cloudfunctions/compat-api/lib/tree-write.js:533`） |
| ③ | **落点 = `child_handles` 数组位次（本节要澄清的核心）** | 真源 `migrate-output/trees/gu_39038_01.json`（`version` **21**）与只读快照 `~/jiazu-backups/2026-09-23-kevin-writes/migrate-output/trees/gu_39038_01.json`（`version` **17**）**逐字段比对**：**唯一 `child_handles` 变动的家族 = `103f95b8792451191a492bcabff3`**，该数组 **9 个元素、前后集合等价**（`set(现盘) == set(快照)`），**仅位次变化** ⇒ **纯排列（permutation）**，**与 §2「元素集合不变（只允许排列）」逐字一致** |
| ④ | **位次自证** | 顾纯海（`103f95b87b7c795ef76f98fb261f`）在快照内 **index 6 = 第 7 位**、在现盘内 **index 3 = 第 4 位** —— **与 ② 的 `desc`「第 4 位」逐字吻合** ⇒ `position = child_handles.indexOf(person_handle) + 1`（§1 术语）**得到真源级自证** |
| ⑤ | **同窗口树内变更面 = 3 处（⚠️ 不得概括为「2 个 person 节点」）** | 另 3 笔 = **节点档案编辑**，树内实际改动 **3 处**：(a) `people.103f95b87b5a464242933ee319d5`（顾清学）`is_living` **新增 `false`** + `residence_places` **新增 `[]`**；(b) `people.103f95b87b9a398b1289942102ec`（顾秀英）`is_living` **`true → false`** + `death_date` **`'' → '2025'`**；(c) **1 个 family 记录** = 上表 ③ 的 `child_handles` 重排 ⇒ **实为 3 处（多出 1 个 family 记录）**。对应 `desc` 逐字 = `修改节点 顾清学（扣 1 片竹片）`；`修改节点 顾秀英（扣 1 片竹片）` × 2（`ref.person_handle` 分别指向 (a) / (b)） |
| ⑥ | 真源现状（只读 · 本节时点） | `migrate-output/trees/gu_39038_01.json` md5 = **`d3669b730b655bbf9a9bfe7f485bdcfc`**、mtime **2026-09-24 17:48:10**；`migrate-output/collections/jiazu_assets.json` md5 = **`610cc94d39feb90fedfe2f41e164f69c`**、mtime **2026-09-24 19:26:14**（`mtime` 为**动值**，口径见 `AGENTS.md` §7） |
| ⑦ | 计费余额旁证（**⚠️ 不得把「735 → 723」记在这 4 笔头上**） | 竹片批次 `bl_mu67o50m30bxt`：**2026-09-23 只读快照值 = 735**（快照实测）→ **现盘 `bamboos[0].qty = 723`**；**差 −12 片 = 12 笔 qty=1**（**8 笔在 2026-09-23** `13:25:32Z`–`14:01:02Z` + **4 笔在本窗口**）⇒ **本轮只占 −4 片**；`fee_refund` **0 笔**（2026-09-24 全天 0 笔、窗口 0 笔） |

### 17-2 澄清结论（三条）

1. **排行落 `child_handles`（确认 · 有真源级正例）**：§1 / §2 的「**排行真源 = 该 family 节点 `child_handles[]` 的数组位次**」「**写入 = 就地重排数组**」「**不新增字段**」**由真实写入自证**（17-1 ③④）；该 family 记录在本次写入前后**无新增键**（**真源内不存在 `rank` / `order` 类冗余字段**）。
2. **排行写入走计费闸门（与 §4 一致）**：该笔 `type = 'edit_fee'`、`delta.bamboos = -1`（**1 片 / 次**，§4 口径）、`ref.lots` 逐笔同一批次 `lot_id = 'bl_mu67o50m30bxt'`、**`fee_refund` 0 笔** —— **不是**绕过闸门的直改文件（对照 **`AGENTS.md` §7** 登记的 **2026-09-23** 三棵树档案字段写入**未走计费闸门**，**形态不同**）。
3. **归属 = 归 Kevin 本人（已当面确认）**：完整登记（4 处读数 + 两条易误判口径 + 「735 → 723」的 12 笔拆分 + 备份现状 + 结论「无需回滚 / 退费」）= **`AGENTS.md` §7「真源写入登记 · 2026-09-24 归属确认追记」** + **`docs/PENDING_DEPLOY.md` §32-8 (1)**。

> **与其它分册的关系**：① 计费口径仍以 `docs/economy-fee.spec.md` **§3-1 #36 / §15** 为准；② 上云动作与判据 = `docs/PENDING_DEPLOY.md` **§31**（本批**无新增上云项**）；③ 真源写入的制度口径 = `AGENTS.md` **§2.1 / §7**。
