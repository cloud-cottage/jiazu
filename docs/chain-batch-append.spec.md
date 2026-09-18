# 批量添加子孙 / 移除同世并列弹窗 — 规格（chain-batch-append.spec.md）

> 状态：**实施完成（2026-09-18）· 本地质检已通过 · 待部署上云**（部署项见 `docs/PENDING_DEPLOY.md` §17）。
> 需求原文：Kevin 2026-09-18「总谱要支持一次**批量添加**子孙」「续编成功后**不要再弹**『第 N 世已有节点』那一类提示」。
> 真源级别：规格文件。本册管**批量续编**与**单节点续编的提示口径**；与经济 / 数据模型分册冲突时的处理见 §0。
> 关联：`docs/economy-fee.spec.md`（0 片清单 §3-2、no-op 不扣费口径、事务语义 §4-3）、`docs/data-model.md` §7（写一致性规则）、
> `docs/id-system.spec.md`（全站编号单计数器：handle 全局唯一 + `gramps_id` 不换树不换号）、
> `docs/permission-tier.spec.md`（`chief_editor` 档位）、`docs/founder-attach.spec.md`（上层镜像只读）、
> `docs/marriage.spec.md`（镜像写法）、`docs/clan-tree.spec.md`（总谱 = 中华世本）、`docs/PENDING_DEPLOY.md`（部署清单约定）。
> 代码锚点：`cloudfunctions/compat-api/index.js`（路由 `POST /admin/chain-append-batch`，**第 2038 行**；上邻为单节点续编 `/admin/chain-append` 第 2007 行）、
> `cloudfunctions/compat-api/lib/tree-write.js`（`MAX_BATCH_CHAIN` 第 52 行、`MAX_BATCH_NAME_LEN` 第 54 行、`normalizeBatchNames` 第 629 行、`appendChainBatch` 第 668 行、`restoreTreeInPlace`）、
> `frontend/src/components/person-manage-panel/person-manage-panel.vue`（第三颗按钮第 25–31 行、内联面板第 187 行起、`doBatchAdd()` 第 558 行起）、
> `frontend/src/business/chain-batch.ts`（`BATCH_MAX_GEN` / `BATCH_MAX_NAME_LEN` / `parseBatchNames` / `formatBatchPreview` / `buildBatchConfirmContent`）、
> `frontend/src/business/api.ts`（`appendChainBatch` 第 1035 行）。

---

## 0. 本册边界（先读）

| 项 | 口径 |
|---|---|
| **本册管** | ①【批量添加子孙】的接口契约、上限与拒绝矩阵、一条线单传语义、单事务写入与失败回收、0 片口径、前端面板元素 / 解析规则 / 预览与确认文案、已知边界、验收要点；②【移除同世并列弹窗】（需求一）的前端口径 |
| **本册不管**（回对应分册） | 集合名 / 字段名 / 批次结构 / 有效期常量 / FIFO 与 sweep 算法 / `Tx.type` 枚举 → `docs/economy.spec.md`；扣费闸门顺序与 `fee` 响应形状 → `docs/economy-fee.spec.md`；**no-op 编辑不扣费（缺陷 A）的字段级口径 → `docs/economy-fee.spec.md` §4-6**；**单树写路径一致性不变量（缺陷 B）→ `docs/data-model.md` §7**；编号权威 → `docs/id-system.spec.md`；镜像只读 → `docs/founder-attach.spec.md` |
| **冲突处理** | 路由名 / 入出参形状 / 上限 / 文案 / 前端落点以本册为准；集合名、字段名、算法契约与总册冲突 → 以 `docs/economy.spec.md` 为准并回改本册；与 `docs/economy-fee.spec.md` 的 0 片清单冲突 → 以该册 §3-2 为准 |
| **数值纪律** | 上限（10 代 / 20 字）、文案、字段名**逐字取自 Kevin 拍板与本派单**；不得四舍五入、不得自行发明；派单未覆盖的一律登记在 §10 |
| **不新增存储** | 批量续编**不新建集合、不新增字段名**：只写既有树 JSON 的 `people` / `families`、既有详情文档（`external_chain_gen` / `external_tree`）与既有全局编号计数器 |

---

## 1. 一句话

总谱（中华世本）节点上新增第三颗按钮【**批量添加子孙**】：粘贴一段**一条线单传**的后代名单 → 前端解析成「名」序列（剥序号、去空项、最多 10 代、每名 ≤ 20 字）→ 出解析预览 → 二次确认 → `POST /admin/chain-append-batch` 在**同一次 `updateTree` 回调内**沿父节点依次续编 N 代（第 k 个新节点的父 = 第 k-1 个），**整批成功或整批不写**。

同批的另一条口径变更（需求一）：**单节点续编成功后不再弹「第 N 世已有节点 / 同世并列显示为分支」确认弹窗**，只保留 toast + 关面板 + 刷新；**同世并列的数据事实不变**（同世多节点仍然并列、前端仍按分支展示）。

---

## 2. 已拍板口径（逐条写死，不得自行改动）

| # | 口径 |
|---|---|
| 1 | 批量续编**仅限中华世本总谱**（`tree_id === MASTER_TREE_ID`，即 `zhonghua`） |
| 2 | 权限：**仅 `chief_editor`**（未登录 401、非 chief 403；文案见 §3-1） |
| 3 | 入参 `{ tree_id, parent_handle, names: string[] }`；**names 由前端解析好，后端不解析标点 / 序号** |
| 4 | 出参 `{ ok, start_gen, end_gen, count, added:[{handle,name,gramps_id,gen}], message }` |
| 5 | **每批 10 代上限**（超出文案「一次最多添加 10 代，当前 N 代」）；**单名 ≤ 20 字（按码点计）** |
| 6 | **不得**任何 72 / 90 世深度上限：总谱源流链已到第 90 世；`max_depth:72` 是「世乘级」阈值而**非写入上限** |
| 7 | **一条线单传**：第 k 个新节点的父 = 第 k-1 个（k=1 时为 `parent_handle`） |
| 8 | `surname` 一律 `inheritedSurname` 随父姓；**接口不接受 / 不读取 `surname`**；前端批量面板**不提供改姓入口** |
| 9 | `gender` 固定 `M`；`is_living=false` |
| 10 | `gramps_id` 取**全站单计数器**（`nextPersonId()`，与既有节点同一序列，绝不按树段重算） |
| 11 | 详情写入 `external_chain_gen=String(gen)` + `external_tree=treeId` |
| 12 | **单事务**：一次 `updateTree` 回调内完成 N 节点 + N 详情 + N 家族挂接，失败整批不写 |
| 13 | **不做同名去重** |
| 14 | message：N=1 → `已续编第 49 世`；N>1 → `已续编第 49–51 世，共 3 代`（连接号为 `–` U+2013） |
| 15 | 新增类 **0 片**（批量也是 0 片，见 §4-4） |

---

## 3. 接口契约

### 3-1 路由与鉴权

| 项 | 口径 |
|---|---|
| 方法 / 路径 | `POST /admin/chain-append-batch`（`index.js` 第 2038 行；紧接单节点续编 `/admin/chain-append` 之后，**同一鉴权档位**） |
| 鉴权顺序 | `authUser(headers)` → 未登录 `401 {error:'未登录或登录已过期'}` → 查 `jiazu_users` → `role !== 'chief_editor'` → `403 {error:'需要总编辑权限'}` |
| 错误出口 | 校验 / 业务错误统一走 `safeError(e)`（业务错误沿用自身 status，默认 **400**）；**系统级失败（EACCES / ENOENT…）→ 500**（口径见 `docs/data-model.md` §7） |

### 3-2 入参（`body`）

| 字段 | 必填 | 口径 |
|---|---|---|
| `tree_id` | 是 | 必须是总谱 id（`MASTER_TREE_ID`）；不等 → 400「续编仅适用于中华世本总谱」 |
| `parent_handle` | 是 | 父节点 handle；**必须存在于该树**且**在中华世本源流链上**（无世数 → 400） |
| `names` | 是 | **已解析好的名字数组**（`string[]`），长度 1..10；**服务端只做 trim / 空值 / 长度 / 条数校验，不做标点与序号解析** |
| `surname` | — | **不接受、不读取**：请求里带 `surname` 一律被忽略（单测 `chain-append-batch.test.js` 已断言「surname 入参一律被忽略」） |
| 其它字段 | — | 未定义字段一律忽略 |

### 3-3 出参（200）

```json
{
  "ok": true,
  "start_gen": 49,
  "end_gen": 51,
  "count": 3,
  "added": [ { "handle": "…", "name": "甲", "gramps_id": "I000310", "gen": 49 } ],
  "message": "已续编第 49–51 世，共 3 代"
}
```

- 世数：第 1 个名字 = 父节点世数 + 1（`nextChainGen(父世数, {aggregate: 父聚合标记})`），第 k 个 = 起始世数 + k − 1；**世数 0 的原始节点也可续编第 1 世**。
- `message` 文案：`count === 1` → `已续编第 {start} 世`；`count > 1` → `已续编第 {start}–{end} 世，共 {count} 代`。
- 前端契约与 `frontend/src/business/api.ts` 的 `appendChainBatch` **逐字对齐**；错误体沿用统一 `{error}` 形状。

### 3-4 拒绝矩阵（逐条中文文案；任一命中 → **树与详情一字未写**）

| # | 触发 | 出码 / 文案（源码级） |
|---|---|---|
| 1 | 未登录 | 401 `未登录或登录已过期` |
| 2 | 非 `chief_editor` | 403 `需要总编辑权限` |
| 3 | `tree_id` 非总谱 | 400 `续编仅适用于中华世本总谱` |
| 4 | 树不存在 | 400 `树不存在: {tree_id}` |
| 5 | 父节点不在该树 | 400 `父节点不存在于总谱` |
| 6 | 父节点不在源流链（无世数） | 400 `该节点不在中华世本源流链上（无世数），无法续编下一世` |
| 7 | `names` 非数组 / 空 | 400 `请提供要添加的名字` |
| 8 | 条数 > 10 | 400 `一次最多添加 10 代，当前 {N} 代` |
| 9 | 某项 trim 后为空 | 400 `第 {i} 个名字为空`（i 为 1-based 序号） |
| 10 | 某项 > 20 字（码点） | 400 `第 {i} 个名字过长（最多 20 字）` |

> 路由层**不做**「缺少 tree_id」这类独立 400 分支（与 `/admin/chain-append` 不同）：缺 `tree_id` 落到第 3 行、缺 `parent_handle` 落到第 5 行（均由 `appendChainBatch` 内部抛出），属**已拍板事实**、不是缺陷。

---

## 4. 写入语义

### 4-1 一条线单传

- 第 1 个新节点挂在 `parent_handle` 下，第 k 个（k ≥ 2）挂在前一个新节点下 —— **每代仅一人**，不生成同辈多人（分支）。
- 每个新节点与父节点通过**既有家族挂接原语**（`linkChildToParent`）连接：父已有可复用家族则复用，否则新建；不在本册另造家族规则。
- 面板提示语必须**逐字含**「一条线单传」与「不要填写分支」，并在标题 / 提示里写明「第 1 个名字为第 {nextGen} 世，最多 1 次添加 10 代」。

### 4-2 字段与详情

| 项 | 写法 |
|---|---|
| `surname` | `inheritedSurname(tree, 上一个节点)`（首个取 `parent_handle` 的姓）—— **不读入参** |
| `given` | 该位解析出的名字（后端已 trim） |
| `gender` | 恒 `'M'` |
| `is_living` | `false`（总谱节点一律已故；`applyLifespan` 的 `lockedDeceased` 口径见 `docs/economy-fee.spec.md` 与 `master-living.test.js`） |
| `gramps_id` | `await nextPersonId()`（全站单计数器，逐节点递增；一批内 N 个号严格递增） |
| handle | `genHandle()`（全站唯一，与既有节点同规则） |
| 详情文档 | `chainDetailDoc({treeId, handle, person, gen, mode:'new'})` → 含 `external_chain_gen = String(gen)`、`external_tree = treeId` |

### 4-3 单事务与失败回收（**本册核心**）

```
updateTree(treeId, async (tree) => {
  ① 快照 people / families / version / updated_at（就地还原用）
  for k in 0..N-1:
     ② tree.people[handle_k] = newChainPerson(...)      // 内存内改
     ③ await saveDetail(chainDetailDoc(...))            // 详情先写（先于树落盘）
     ④ await linkChildToParent(tree, prev, handle_k)
  ⑤ return added
})
⑥ 回调抛错 / saveTree 落盘失败 → ① 回收本批已写出的详情（best-effort 删除，句柄皆为本批新建）
   ② restoreTreeInPlace(tree, snapshot) 就地还原（不留幻影节点）
   ③ store.saveTree / updateTree 失败路径失效 treeCache / eventIndexCache（见 docs/data-model.md §7）
   ④ 原错误照抛 → 路由出码（业务 400 / 系统 500）
```

- 整批**只落盘一次**（`version` 只 +1，不是 +N）—— 已由质检断言（「原子性 ⓪ 单事务写入见证」）。
- 中途失败（含详情目录只读的真实 `EACCES`、树文件只读、铸号计数器落盘失败）→ **整批不写 + 无残留详情 + 缓存无幻影**（质检原子性 ①②③）。
- **不退费路径**：本路由 0 片、不接扣费闸门，故不存在冲正；但**引用** `docs/economy-fee.spec.md` §4-3 的「失败清缓存」不变量。

### 4-4 0 片

- 批量续编属**新增类** → **0 片**，不接扣费闸门；矩阵行见 `docs/economy-fee.spec.md` **§3-2 附录**（该清单条数由 **29 → 30**）。
- 实施时**禁止**在本路由里调 `chargeBamboo`（矩阵即契约；`economy-fee.test.js` 的 `ZERO_FEE_ROUTES` 已把 `/admin/chain-append-batch` 纳入源码级断言）。

### 4-5 上限（明确不设深度上限）

- **只有**「一次操作的批大小 ≤ 10 代」与「单名 ≤ 20 字」两条上限。
- **不得**因为「总谱世数」或 `max_depth:72` 拒绝写入：源流链已到**第 90 世**，`max_depth:72` 是**世乘级**阈值（用于世乘 / 树级深度判定），**不是写入上限**。单测已含「10 代边界（第 89 世 → 第 90–99 世）：一次性写满 10 代；不存在 72 / 90 世上限」。

---

## 5. 前端落点

### 5-1 入口

- 人物管理面板新增**第三颗按钮**`＋ 批量添加子孙`（`person-manage-panel.vue` 第 25–31 行），仅在可续编的总谱链节点上出现（与 `canAppendChain` 同条件：总谱 + 有写权限 + 世数 ≥ 0 + 非聚合虚位节点）。
- 点击进入**内联面板**（不新开页面 / 不引新依赖），面板标题 `为「{姓名}」批量添加子孙`。
- 单节点续编的既有按钮与面板**行为不变**。

### 5-2 面板元素清单

| 元素 | 口径 |
|---|---|
| 提示语 | 须含「**一条线单传**」与「**不要填写分支**」：`请输入一条线单传的后代（每代一人）：只填「名」，用「、」「，」或空格分隔，可带序号（如 1、2、3、）。不要填写分支（同辈多人）。` |
| 姓 input | **预填父姓**（`batchSurname`）且 `disabled=true`；面板内**不提供任何改姓开关 / 链接 / 输入**（「改姓」字样只允许出现在「批量录入不可改姓」说明文案里） |
| 姓提示 | `姓随父姓继承，批量录入不可改姓。`（类型提示同口径） |
| 文本域 | 原生 `textarea`（`v-model="batchText"`），与既有 hall 页 `.textarea` 同风格 |
| 解析预览 | 实时（`computed`）调用 `parseBatchNames(batchText)`，命中错误 → 预览不展示可提交态 |
| 提交按钮 | `确认添加`；请求中 loading 防重复提交 |
| 错误区 | 失败文案落在**面板错误区**（`panelError`）；资产不足（`isAssetInsufficientError`）沿用既有「去我的资产」引导弹窗 |

### 5-3 解析规则（`frontend/src/business/chain-batch.ts`，**纯函数模块**、可单测）

- **分隔符** = 换行（`\n` / `\r`）/ `、` / `，` / `,` / 制表符 / **半角与全角空格**（任意连续组合按一次切分）。
- **项首序号剥离**：阿拉伯数字、中文数字（含组合如 `十` / `廿三` / `一百二十` / `两`）、以及括号包裹的上述数字（`（3）` / `(3)`），连同可选尾分隔符（`、` `,` `．` `.` `）` `)`）一并剥掉，**不入姓名**；整项就是序号（如 `1.` / `（3）` / `四`）→ **整项丢弃**。
- **裸中文数字必须后跟真分隔符**才算序号，否则不剥（避免「三宝」这类真名被误伤）。
- 每项 `trim`，**空项丢弃**；**顺序 = 粘贴顺序**（第 1 项 = 父节点的子 = 后代第 1 代）。
- 校验顺序（前端）：空 → 超上限 → 单项过长；文案与服务端**同口径**（`请粘贴要添加的子孙名字` / `一次最多添加 10 代，当前 N 代` / `第 N 个名字过长（最多 20 字）`）。
- 字数为 **码点**计数（`[...s].length`），生僻字 / emoji 不被多算。

### 5-4 预览文案

`formatBatchPreview(names, startGen)`：

```
将按顺序添加 3 代：第 49 世 → 甲；第 50 世 → 乙；第 51 世 → 丙
```

### 5-5 二次确认弹窗

- **提交前必须出二次确认**（`uni.showModal`）：标题 **`批量添加子孙确认`**，按钮 `确认添加` / `取消`。
- 正文（`buildBatchConfirmContent`）：首行 `请输入一条线单传的后代，确认按序添加：` + **前 5 项**（`第 X 世 → 名` 每行一项）+ 超过 5 项时追加 `…等共 N 代` + `将在第 A–B 世依次添加。` + `姓随父姓继承（批量录入不可改姓）。`
- 取消 → 不发请求、面板保持打开。

### 5-6 成功 / 失败

- 成功：toast **优先用后端 `message`**（缺失时回落 `已续编第 A–B 世，共 N 代`，duration 3000）→ **关面板** → `emit('tree-changed')` 触发刷新。
- 失败：不静默 —— 文案落面板错误区；资产不足走既有引导弹窗；**不关面板**（便于用户改文本重试）。

---

## 6. 需求一：移除「同世并列」弹窗

| 项 | 口径 |
|---|---|
| 变更前 | 单节点续编成功后，若该世已有节点（`res.branch`），前端弹「第 N 世已有节点 / 同世并列显示为分支」**确认弹窗** |
| 变更后 | **不再弹任何弹窗**；只保留：成功 toast（`已续编第 N 世`）+ **关闭面板** + 刷新树 |
| 不变的事实 | **同世并列的数据事实不变**：同一世多个节点照旧并列存在，前端照旧按分支展示；后端分支判定与字段**未改动** |
| 判定理由 | 属**确认类信息**（非报错），弹窗在移动端是打扰（源码注释保留该结论） |
| 影响面 | 仅前端 `person-manage-panel.vue`（单节点续编成功分支）；**接口出参不变**（`branch` / `message` 仍在响应里，只是前端不再据此弹窗） |

---

## 7. 已知边界（**登记为已知，不是缺陷**）

| # | 边界 | 口径 |
|---|---|---|
| 1 | `1.甲2.乙` 这类**项间无分隔符**写法**不拆** | 数字**不是**分隔符；库内存在含数字的真名（如「刘 3姥爷」），二次切分会误伤。用户须用换行 / `、` / `，` / 空格分隔 |
| 2 | **同名不去重** | 一批里出现两个同名（如「甲、甲」）会**照旧建两个节点**；不做同名合并 / 去重 |
| 3 | 总谱节点的 `is_living` 修改被拒 | `PUT /people/<handle>` 改总谱节点健在状态 → **403「总谱节点一律为「已故」」**（设计如此，与批量无关） |
| 4 | 窄 body 省略 `attribute_list` 时不判称号变更 | 属 no-op 口径的一部分（未提供的键一律不判变更）→ 见 `docs/economy-fee.spec.md` §4-6 |
| 5 | 「改姓」走手填 | 父姓为空时（如「少典氏・初代」），单节点续编需走既有「改姓」手填入口；**批量面板不提供**（批量一律随父姓） |

---

## 8. 验收要点与证据指针

| # | 验收点 | 证据指针 |
|---|---|---|
| 1 | 单测全绿：`chain-append-batch.test.js` **12/12** | 含拒绝矩阵 13 条断言、真实 IO 失败注入的原子性 4 条、真源护栏开篇/收尾；汇编见 `docs/chain-batch-append.qa.md` §1 |
| 2 | 全量 `npm test` **372/372/0** | 同上 §1 |
| 3 | 面板元素：提示语含「一条线单传」「不要填写分支」；姓 input `disabled=true` 且值为父姓；面板内改姓元素 = 0 | 真机断言，见 qa 汇编 §2（T2） |
| 4 | 预览文案 / 确认弹窗标题与正文正确 | 同上（T2） |
| 5 | 落盘**严格线性**：`少典氏・初代 → 甲(I000310) → 乙(I000311) → 丙(I000312)`，姓随父姓、全 `M`、全已故、详情 `external_chain_gen` 递 1/2/3 + `external_tree=zhonghua`、**无竹片扣减** | 同上（T2） |
| 6 | 单节点续编成功后**无任何弹窗**（`uni.showModal` 记录 = []、可见 `.uni-modal` = 0、body 文本不含「同世并列」）+ toast + 面板消失 + 同世并列事实保留 | 同上（T1） |
| 7 | 真源零写入（多轮聚合 md5 前后一致） | 同上 §6 |

---

## 9. 测试与部署要点

**测试**

- 新增单测 `cloudfunctions/compat-api/lib/chain-append-batch.test.js`（12 例），已进 `package.json` 的 `scripts.test`（**本地动作，不进云端打包产物**）。
- 覆盖：真源护栏（开篇 / 收尾）、`MAX_BATCH_CHAIN = 10` + `normalizeBatchNames` 逐条文案、正常路 3 代、10 代边界（第 89 → 90–99 世，无 72/90 上限）、1 代文案 + 世数 0 原始节点 + `surname` 忽略、与 `appendChainNode` 字段/家族/详情全等、拒绝矩阵、原子性 ⓪①②③。
- **不跑仓库 `npm test` 作为云端回归**：测试跑 `/tmp` 副本，仅本地口径。

**部署**（详见 `docs/PENDING_DEPLOY.md` §17）

- 云函数 `compat-api`：**新增 1 条路由** → **必须重打包**（`cloudfunctions/deploy/compat-api/index.js`）+ `tcb fn deploy`；未重打 → 云端 `/admin/chain-append-batch` **404**。
- 前端 H5：批量面板 + 删弹窗 + dirty 比对 **必须重打包**（`build:h5`，带 `VITE_API_BASE`）+ hosting 部署。
- 云端数据：**无变化**。

---

## 10. 待确认默认口径 / 遗留（一句话可改，不阻塞）

1. **`MAX_BATCH_NAME_LEN` 未导出**：后端该常量为模块内 `const`（第 54 行），前端 `chain-batch.ts` 另定义 `BATCH_MAX_NAME_LEN = 20`；两侧**同值**（20）但**非同源常量**。如需「单一真源」，后续可把后端常量导出并由前端契约测试对齐（本册按**值**写死）。
2. **上限未做成设置项**：10 代 / 20 字均为**代码常量**，未进「后台设置」（与 `PUT /admin/wallet-fee` 那类可配项不同）；如用户要求可配置，需另立批次。
3. **批量面板不提供「跳过已有同世」语义**：批量一律在**父节点下**新建（不挂接既有节点、不做 attach 模式）；如需「批量挂接已有节点」，需另立规格。

---

## 11. 交叉引用

| 文件 | 关系 |
|---|---|
| `docs/economy-fee.spec.md` | 0 片清单 §3-2（本路由条数 29 → 30）；no-op 不扣费口径；事务语义 §4-3 |
| `docs/data-model.md` | §7 写一致性（单树写路径不变量：失败失效缓存 + 回滚 version/updated_at + 详情后写 + 系统错误 500） |
| `docs/id-system.spec.md` | `gramps_id` 全站单计数器与 handle 全局唯一口径 |
| `docs/permission-tier.spec.md` | `chief_editor` 档位与 `requireWriteUser` 语义 |
| `docs/PENDING_DEPLOY.md` | 本批部署项 = **§17** |
| `docs/chain-batch-append.qa.md` | 本册对应的质检汇编（原始证据、变异记录、遗留缺口） |
