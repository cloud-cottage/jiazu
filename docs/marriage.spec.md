# 跨树嫁娶（嫁出 / 娶入 / 绝婚 / 合离）— 规格（marriage.spec.md）

> 状态：**设计已确认（Kevin 2026-09）· 实施中**
> 真源级别：规格文件。实施（compat-api / frontend）必须与本文件一致；与 `docs/data-model.md`、`docs/permission-tier.spec.md` 冲突时以本文件为准并同步修订彼文件。
> 关联：README「树内操作」、`cloudfunctions/compat-api/lib/tree-write.js`（`spouseSlots` / `addSpouseNode`）、`docs/data-model.md`（集合与 API 契约）。

## 1. 已确认口径（Kevin）

| # | 口径 | 对设计的影响 |
|---|---|---|
| 1 | **添加配偶一般来自"树外"其他家族树**，同树非常罕见 | 「嫁出 / 娶入」是**主路径**；同树婚配（现有 `/admin/add-spouse`）保留为罕见分支 |
| 2 | 「出嫁」必须有**反向的「娶入」** | 同一动作两个方向（`direction: out / in`），不写两套逻辑 |
| 3 | **允许再嫁、再娶**，加标识表明是第几次 | 不做互斥；用**婚姻序号**（初嫁/再嫁·初娶/再娶） |
| 4 | 发起人对**本人树**必须有写权；**目标树权限** | **取方式 C：申请制** —— 发起 → 对方树审批 → 生效（§8） |
| 5 | 解除婚姻拆成**「绝婚」（男方主动）/「合离」（双方自愿）** 两种动作 | 两个动作、两套同意规则（§5） |
| 6 | 嫁出 / 娶入 / 绝婚 / 合离 **四种动作都可选填年份或日期** | 日期为**选填**；格式与既有生卒一致（`1957` 或 `1957-12-04`，走 `dateDisplay()` 规范化；§4） |
| 7 | 其余按草案建议 | 镜像节点单列计数；GEDCOM 用 `_MIRROR` 标注不导出为真人；再嫁/再娶允许并存 |

## 2. 核心原则与术语

- **结构事实只有一个来源：`families`**（父槽 / 母槽 / `child_handles`）。`external_*` 只承载**跨树指针**。
  现状相反（出嫁只写指针、不建家族）→ 本规格把两侧都补成结构完整。
- **镜像节点（mirror）**：在对方树里代表本人的节点（`external_person_handle` 指真身、`external_link_type='marriage'`、`external_tree`=真身所在树）。项目已有同类模式（zhonghua 跨树登记标记），不引入新概念。
- **配对 id**：`external_marriage_id`（一段婚姻两侧同值，用于成对维护/解除）。
- **婚姻序号**：`external_marriage_no`（本人侧 1,2,3…；1=初嫁/初娶，≥2=再嫁/再娶）。
- **真身不动**：本人始终留在原树，不搬迁节点。

## 3. 字段（结构层属性，加入 `EXTERNAL_KEYS`）

| 字段 | 写入侧 | 含义 |
|---|---|---|
| `external_tree` / `external_person_handle` / `external_link_type='marriage'` | 两侧 | 跨树指针（沿用既有三字段） |
| `external_marriage_id` | 两侧 | 配对 id（同值） |
| `external_marriage_no` | 两侧（各自序号） | 本人侧第几次婚姻（1=初嫁/初娶） |
| `external_marriage_date` | 两侧 | **选填**：成婚年份/日期（`1957` / `1957-12-04`） |
| `external_marriage_end_kind` | 两侧 | 结束方式：`绝婚` / `合离` |
| `external_marriage_end_date` | 两侧 | **选填**：结束年份/日期 |
| `external_marriage_end_by` | 两侧 | 结束发起方（`husband_side` / `mutual`），用于展示与追溯 |
| `external_marriage_created_by` | 两侧 | 发起人 phone（留痕，权限 C 的兜底手段） |
| `external_relation_note` | 两侧 | 人类可读说明（如「风华胥 嫁至 ji_23395_01 的 季某」） |

## 4. 日期规则

- 四个动作（嫁出/娶入/绝婚/合离）的日期字段**均为选填**，留空即不写该属性。
- 允许 `YYYY`（如 `1957`）或 `YYYY-MM-DD`（如 `1957-12-04`）；服务端用与生卒相同的规范化（`dateDisplay()` 同规则），非法格式 → 400「日期格式需为 1957 或 1957-12-04」。
- 展示：档案婚姻块显示「成婚 1957 · 绝婚 1960」；未填则不显示该段。

## 5. 动作定义与写入矩阵

以 `P`（本人，树 `S`）与 `Q`（配偶，树 `T`）为例，`mid` = 新配对 id，`no` = P 侧序号。

| | 嫁出（`out`，P 为女，T 为夫家） | 娶入（`in`，P 为男，T 为妻家） |
|---|---|---|
| S 侧家族 | 建/补家族：**P 入本人性别槽**，另一槽放 `Q` 镜像 | 同左（P 入父槽） |
| S 侧镜像 | `M_Q`：姓名/性别取自 Q、指向 Q、`link_type='marriage'`、`marriage_id=mid` | 同左 |
| S 侧 P | `spouse_families += 家族`；写 §3 全部指针字段（含序号、可选日期） | 同左 |
| T 侧家族 | 在 Q 的家族里把 **P 的镜像 `M_P`** 放入 Q 的另一槽（无家族则新建） | 同左 |
| T 侧 Q | 写 §3 指针字段（含 Q 侧自己的序号、可选日期） | 同左 |
| 子女 | **归父（真实节点）所在树**：父为真人、母为镜像 → 子女建在父的真树家族下；母树侧仅显示镜像子女。反向（招赘：父为镜像）按同原则归真人一侧 | 同左 |

### 结束动作（两个）

| 动作 | 发起方 | 同意规则 | 效果 |
|---|---|---|---|
| **绝婚** | **男方所在树**（单方主动） | **无需对方同意**（男方主动解除的语义），生效后通知对方树 | 删两侧家族槽 + 两侧镜像 + 清两侧婚姻指针；家族空则删除；写 `end_kind='绝婚'`、`end_date`(选填)、`end_by='husband_side'` |
| **合离** | 任一侧 | **需对方树确认**（申请 → 对方审批通过才生效；对方拒绝则保持婚姻） | 同上，`end_kind='合离'`、`end_by='mutual'` |

- **历史留痕**：结束后两侧 person 上保留 `external_marriage_end_kind/_end_date`（用于"再嫁/再娶"叙事与档案展示），但**清除** `external_marriage_id`、镜像节点与家族槽位（视为关系终止，结构上回到单身态，允许再嫁/再娶）。
- **幂等**：已结束的婚姻再次结束 → 200 + `already_ended`。

## 6. 规则与不变量

1. **再嫁/再娶**：允许并存多段；`no` 递增；不自动解除前段（产品上提示"如已改嫁，建议先绝婚/合离"，不强制）。
2. **不可重复配对**：同一对真身之间已存在**有效**（未结束）婚姻 → 400「二人已建立婚姻关系」。
3. **镜像成对**：镜像节点两侧同 `mid` 成对；任一侧删除/结束 → 另一侧同步清理（服务端强制）。
4. **不可指向自己/同树**：`P` 与 `Q` 必须不同树（同树走 §7）。
5. **性别与方向**：`out` 仅女（P 为女）、`in` 仅男（P 为男）；性别未知（U）需显式指定方向，否则 400。
6. **镜像节点**：界面必须带「外树」标；不计入该树"真人"叙事（人数统计单列「含外树配偶 M」）。

## 7. 同树婚配（罕见路径）

保留 `/admin/add-spouse`（新建本树节点 / 挂接本树已有节点），补写 `external_marriage_no`（同树也计数）与可选 `external_marriage_date`，便于档案统一显示「初嫁/再嫁」。

### 7-4 跨树婚姻的子女归属（2026-09-15 新增）

在「跨树婚姻家庭」下执行「添加子女」时，若父为该树的外树**镜像节点**（真身在对方树），
子女**必须建在父的真身所在树**，挂到父的真实家族槽位；母树侧只保留镜像子女用于显示。

- 实测纠偏：shen 树曾把 季清昆 建在「父 季志全(镜像) / 母 沈伟(真人)」家庭下 →
  已迁移为 ji 树的 `I500059 季清昆`（父家族 = 季志全/沈伟 的真实家族），shen 侧移除。
- 实现要点：「添加子女」需判断所选家庭的父/母是否为镜像（`external_mirror`），
  是则经 `updateTrees()` 把写入路由到真身所在树；未实现前，跨树婚姻家庭的子女入口应给出提示或禁用。

## 8. 权限（方式 C：申请制）

- **发起人**：对**本人树**需写权（`requireWriteUser`：tree_steward / chief_editor；总谱仅 chief）。
- **目标树**：**不要求发起人具备目标树写权**；跨树写入通过"申请 → **目标树审批**"完成，审批人需**目标树**的写权（steward / chief；总谱仅 chief）。
- **申请单**：集合 `jiazu_marriage_requests`（本地模式落在 `migrate-output/collections/jiazu_marriage_requests.json`）：
  `{id, action: 'marry'|'divorce', direction: 'out'|'in', kind?: '合离', from_tree, from_person_handle, to_tree, to_person_handle, marriage_id, marriage_date?, end_date?, note, status: 'pending'|'approved'|'rejected', requested_by, created_at, decided_by, decided_at, reject_reason?}`
- **路由**：
  | 路由 | 说明 |
  |---|---|
  | `POST /marriage-request` | 发起（嫁出/娶入/合离）：生成 pending 申请单；返回 `{request_id}` |
  | `POST /admin/approve-marriage` | 目标树审批通过 → **同一事务内**应用双侧写入（§5） |
  | `POST /admin/reject-marriage` | 目标树驳回（同树驳回，不需要对方） |
  | `GET /admin/marriage-requests` | 审批列表（steward 只看自己树相关；chief 全部） |
  | `POST /admin/marry-end` | **绝婚**：男方侧单方生效（需男方树写权），无需申请单；写 `end_kind='绝婚'` |
  | `POST /admin/marry-dissolve` | 兼容旧名 → 内部等同"合离申请"（发起） |
- 留痕：两侧写 `external_marriage_created_by` / `end_by`；申请单保留 `requested_by` / `decided_by`。

## 9. 与既有实现的差距（实施必改）

| # | 现状 | 问题 | 改法 |
|---|---|---|---|
| 1 | 出嫁只写 4 个 `external_*`、不建家族（`person-archive.vue:864-872`） | 本树档案「配偶与子女」区整块消失（`v-if="spouseFamilies.length"`）、卡片无「配XX」；夫家侧零记录 | 按 §5 双侧写入（经申请审批） |
| 2 | `canMarryOut` 只看"女性+可编辑+非总谱" | 无法表达次数，也无"娶入" | 改为「嫁出 / 娶入 / 绝婚 / 合离」入口 + 序号显示 |
| 3 | 树图 marker 过滤 `external_tree && !== treeId` → `pruneMarkers()` **连子树一起删** | 新设计下真身带外树指针 → 总谱树图会把她**连同后代整支隐藏** | 收紧为 `external_link_type === 'founder'`（登记标记的真实语义） |
| 4 | 人数统计 `共 N 人` | 镜像节点会被计入 | 单列：`共 N 人 · 含外树配偶 M` |
| 5 | GEDCOM 导出 | 镜像节点会被导出成真人 | 镜像节点打 `_MIRROR` 标注/跳过 |
| 6 | 跨树写入 | 现有 `updateTree` 只写单树 | 新增跨树事务写入（两棵树顺序写 + 失败回滚/一致性补齐） |

## 10. 实施拆解（本文件确认后执行）

- **后端 compat-api**
  - `lib/marriage.js`（纯函数，全部单测）：`nextMarriageNo`、`marriageLabel(no, direction)`、`mirrorPerson(src, fromTreeId, mid)`、`planMarriage(treeA, treeB, ...)`、`planEnd(treeA, treeB, kind)`、`normalizeMarriageDate`、`dissolveKind` 守卫。
  - `store.js`：跨树写入 `updateTrees([a, b], fn)`（内存内先整体应用 → 顺序持久化 → 失败回滚已写的一侧）+ `colGet/colSet('jiazu_marriage_requests')`。
  - 路由：§8 表（`/marriage-request`、`/admin/approve-marriage`、`/admin/reject-marriage`、`/admin/marriage-requests`、`/admin/marry-end`）。
- **前端**
  - `person-archive.vue`：入口「💍 嫁出」/「🤵 娶入」（选目标树 → 搜索对方 → 选填日期 → 提交申请，提示"已提交，等待对方家族审批"）；配偶区显示「配 <名>（外树 <树>）· 初嫁/再嫁 · 成婚 1957」+ 结束信息；「⚔️ 绝婚」/「🤝 合离」入口（选填日期 + 说明）。
  - `pages/admin/index.vue`：新增「联姻 / 离异申请」审批区（与「加入申请」同构）。
  - `tree-pedigree.vue`：镜像节点「外」角标；marker 过滤规则收紧（§9-3）；人数统计单列镜像（§9-4）。
  - `api.ts` / `business/index.ts` / `types.ts`：新接口与 `external_marriage_*` 透传。
- **验证**
  - 单测：序号/标签、镜像字段、日期规范化、成对性、结束幂等、方向与性别守卫。
  - E2E（数据副本 3450，两棵测试树）：申请→审批→双侧写入 / 驳回不改数据 / 绝婚单方生效 / 合离需确认 / 再嫁序号 / 重复配对拒绝 / 日期选填与非法格式 / **真源 md5 未变**。
  - UI 实测：副本后端跑通"申请 → 审批 → 档案显示配对与日期"。
- **文档**：README「树内操作」+ `docs/data-model.md` §4 字段表 + 本文件状态改「已实施」+ `docs/PENDING_DEPLOY.md` 补本批路由与集合。

## 11. 仍待确认（不阻塞实施，按草案执行）

1. **绝婚是否也走"目标树审批"**：草案按"男方侧单方生效 + 通知"（与"男方主动解除"语义一致）；若你要求绝婚也需对方确认，改一处校验即可。
2. **合离的确认方式**：草案按"任一侧发起 → 对方审批通过即生效"（一步确认）；若要"两侧各自点同意"，加一个 `confirmed_by_both` 状态即可。
3. 四动作的日期是否要显示在树图卡片上（草案：只在档案婚姻块显示，卡片保持「配XX」）。
