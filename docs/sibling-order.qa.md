# 子女标签拖曳排序（排行）—— 独立质检报告汇编（Neng · 三轮）

- **质检对象**：`cloudfunctions/compat-api/{index.js,lib/tree-write.js,lib/economy-fee.js,lib/sibling-reorder.test.js}`、`frontend/src/components/sibling-order-modal/sibling-order-modal.vue`（新建）、`frontend/src/components/person-archive/person-archive.vue`（入口 + 挂载）、`frontend/src/business/{api.ts,index.ts,types.ts}`
- **质检人**：Neng（独立质检 —— 不接受源码扫描 / mock 层覆盖当结论；结论一律由真机实例 + 真实数据 + 独立复算得出）
- **本册性质**：**历史质检证据汇编**（`AGENTS.md` §0-5：**只追加、不回改**）。本册由 **Jing（制度员）· 2026-09-23 18:20 CST** 按 `AGENTS.md` §9 例行收口，把 **三轮** 质检的结论与证据按时间汇编成册，并**如实登记过程事实**（含一处过程矛盾，见 §5）。

## 0. 汇编依据与诚实声明（**先读这段**）

- **本册内容来源**：① 派单登记的 **Neng 侧三轮实测读数与原始输出要点**（Neng 首轮 / Neng-3 / Neng-4）；② 收口轮 **Jing 的只读复核**（命令 + 时点，见 §6）。
- **哪些是 Neng 侧实测、哪些是 Jing 复核**：每条证据均标注来源。**Jing 未参与** Neng 的 H5 / 真机取证，故 **Neng 侧的 H5 读数（竹片自读余额序列、`elementFromPoint`、指针点击、触摸事件序列）本册只**照录派单登记值**，**未由 Jing 复现**，并已逐条标明。
- **本册不美化**：Neng 声明的**降级项 / 未验项一律进 §5**，不略；**过程矛盾进 §4**，不隐。
- **本册不回改**：`docs/sibling-order.spec.md`（业务域规格）与 `docs/economy-fee.spec.md`（计费）为口径真源；本册与实现冲突时**以实现为准**（`AGENTS.md` §0-1），差异登记在规格册 §11 / 本册 §5。

---

## 1. 三轮总览

| 轮次 | 时间 | 对象 / 手法 | 结论 | 处置 |
|---|---|---|---|---|
| **Neng 首轮** | 2026-09-23（本批早期） | **后端 API 直调 + 专测套件**（`lib/sibling-reorder.test.js`），未做 H5 | **后端 6/6 通过**；**未收口 3 条**（均为 H5 / UI 面） | 转 Neng-3 做 H5 |
| **Neng-3** | 2026-09-23（H5 轮） | **H5 真机**（headless Chrome + 触摸仿真）点测前端全交互 | **不通过 —— 抳到 2 个阻塞缺陷** | 转 Kong 整改 |
| **Neng-4** | 2026-09-23（复检轮） | **H5 复检**（对 Kong-4 整改后的实现手段） | **两缺陷均「真修好」** | 收口；未决项见 §5 |

---

## 2. Neng 首轮 —— 后端面（**6/6 通过 · 未收口 3 条**）

**对象**：`POST /admin/sibling-reorder` 的路由契约 / 闸门 / 计费 / 冲正；手法 = **真机实例 API 直调 + 本批专测套件**（未做任何 H5 取证）。

**结论**：

| # | 验项 | 结论 |
|---|---|---|
| 1 | 路由契约（`tree_id` / `family_handle` / `person_handle` / `child_handles[]` 缺参与类型校验 → 400 原文） | 通过 |
| 2 | 集合等价校验（等长 / 同元素 / 无重复 → 400 原文；`person_handle` 不在列表 → 400） | 通过 |
| 3 | 权限与只读（未登录 401 / 游客 403 / 只读节点 403，且**均不先扣费**） | 通过 |
| 4 | 计费（`FEE.sibling_reorder = 1`、`Tx.type='edit_fee'`、`desc='调整排行：<姓名> 第 N 位'`、`ref.person_handle` = 被移动子女、`delta.bamboos=-1`） | 通过 |
| 5 | no-op（提交序与现盘逐位相同 → `noop:true` + `fee.pieces:0` + 不写库 + 无流水） | 通过 |
| 6 | 余额不足 409 整单拒绝（资产零变化）+ 落库失败 500 + `fee_refunded:true` + 原路返还同一批次 | 通过 |

**未收口 3 条**（均为 UI / H5 面，由后续轮次承接）：① **H5 界面面未验**（入口 / 模态框 / 两通道交互）；② **计费二次确认层未验**；③ **后端 `noop:true` 未在 UI 层复现**（仅 API 直调）。

**证据留档如实说明**：本轮的原始命令与逐条 TAP 输出**未随本册留档**，本册只登记**结论与其覆盖面**；可复跑的等价证据 = 本批专测文件（`node --test cloudfunctions/compat-api/lib/sibling-reorder.test.js`，512 行）与规格册 `docs/sibling-order.spec.md` §3 §4 §5 §6 的逐字口径。

---

## 3. Neng-3 —— H5 轮（**抳到 2 个阻塞缺陷**）

**手法**：**H5 真机**（headless Chrome + 触摸仿真）点测前端全交互；真源零写入（副本实例 + 非占用端口）。**该轮判定 = 不通过**。

### 3.1 缺陷 ①（阻塞）· `person_handle` 错传（传了档案本人）

- **现象**：模态框提交时 `person_handle` 传的是**档案本人**（而非**本次被移动的子女**）⇒ 后端集合校验拒收。
- **后端原文（400）**：
  ```
  person_handle 不在该家族的子女列表中
  ```
  （锚点 `cloudfunctions/compat-api/lib/tree-write.js:489`；规格册 §6 #3）
- **定性**：**前端契约实现错**（不是后端缺陷）。后端 `lib/tree-write.js:489` 的硬校验口径正确，且是本路由**只允许排列、不允许增删**的既有设计。

### 3.2 缺陷 ②（阻塞）· 二次确认层被 `z-index` 遮挡

- **现象**：点「确定」后二次确认框（当时用 `uni.showModal`）**看不见也点不着** —— `uni.showModal` 的 `.uni-modal` **z-index = 999**，而本组件遮罩 `.som-mask` = **1000** ⇒ 确认框被遮罩**完全盖住**。
- **取证**：`document.elementFromPoint(...)` 在确认按钮坐标处**命中的是遮罩 / 面板本体，不是按钮**（即：按钮虽在 DOM 中，但实际不可点）。
- **定性**：**实现手段与自身层叠上下文冲突**（`AGENTS.md` §2.3「数据加载与状态同步问题从数据流层面修」的同精神 —— 交互层问题从层叠 / 交互层修，不加调试开关）。

### 3.3 该轮判定与转派

| 轮次结论 | 内容 |
|---|---|
| **不通过** | 2 个阻塞缺陷必须修复（`person_handle` 语义 + 确认层遮挡） |
| **转派** | 交 **Kong 整改**（Kong-4）；整改后由 **Neng-4 复检** |
| **非阻塞项** | 位移阈值（12px）/ 拖曳事件通道等其余交互项该轮未见异常 |

---

## 4. Neng-4 —— 复检轮（**两缺陷均「真修好」**）

**手法**：对 **Kong-4 整改后**的实现手段做 H5 复检；结论 = **两个缺陷均已真修**（非「看起来修了」）。

### 4.1 缺陷 ① 复检：`person_handle` = 被移动的子女（**两通道各实测一次**）

| 通道 | 提交的 `person_handle`（实测值） | 结果 |
|---|---|---|
| **▲▼ 微调通道** | **顾纯江** | **200** + `fee.pieces:1` |
| **拖曳通道** | **顾秀兰** | **200** + `fee.pieces:1` |

⇒ 两通道**均传被移动的那个子女**（不是档案本人），且**两通道取值一致**（同一数组改写入口 `applyMove`），与规格册 **§3-1-1** 的选取规则逐条吻合。

### 4.2 缺陷 ② 复检：自绘确认层可点、可提交

| 验项 | 实测 |
|---|---|
| 实现手段 | **自绘确认层**（`.som-confirm-mask` z-index = **1010**，与 `.som-panel` 同为 `.som-mask`(1000) 的子节点）；**不再用 `uni.showModal`** |
| 文案模板（逐字） | 正文 = **「调整 <被移动子女姓名> 的排行，消耗 1 片竹片。」** + 「<配偶标签>的子女排行将按调整后的顺序保存。」；按钮 = `取消` / `确定调整` |
| **`elementFromPoint` 两处命中** | 在 `.som-confirm-ok` 的**中心**与**左上角**两处 **均命中其本体**（不再命中遮罩） |
| **真实指针点击** | `Input.dispatchMouseEvent` 真实指针点击 → **可提交**（出 200） |
| **触摸拖曳事件序列** | `touchstart` / `longpress` / `touchmove` / `touchend` —— uni-app touch 事件通道真跑通（**未用 HTML5 DnD**） |
| **位移阈值对照** | 实测 **10px 位移「不换位」**（阈值 `DRAG_THRESHOLD = 12` px 的对照） |
| 行高兜底 | `createSelectorQuery` 量行高失败时兜底 **44px**（`ROW_H`） |

### 4.3 计费口径复检：竹片自读余额序列 **738 → 737 → 736**

- **读数（Neng-4 自读，非推算）**：两次成功提交各扣 **1 片** ⇒ 余额 **738 → 737 → 736**（`fee.pieces:1` / `delta.bamboos:-1`），与规格册 §4「一次「确定保存」= 一次计费、与被动移位兄弟数量无关」一致。
- **no-op 复检**：② 路径（后端 `noop:true`）该轮仍为 **API 直调**验证（`fee.pieces:0`、余额不变、树逐字节不变）⇒ **未在 UI 层独立复现**（进 §5 未决 3）。

### 4.4 清场（沙箱纪律）

- 自起的副本实例 / headless Chrome（独立 profile）**收工自行终止并释放端口**；
- **全程未碰**用户正在使用的 **3100（compat-api）与 5199（前端 H5）**；**未改任何仓库文件 / 真源数据**（真源零写入）。

### 4.5 该轮判定

| 项 | 结论 |
|---|---|
| 缺陷 ① `person_handle` | **真修好**（▲▼ = 顾纯江 / 拖曳 = 顾秀兰，均 200 + 1 片） |
| 缺陷 ② 确认层遮挡 | **真修好**（自绘层 z=1010；`elementFromPoint` 两处命中；真实指针点击可提交） |
| 计费口径 | **无变化**（738 → 737 → 736 自读；no-op 仍 0 片） |
| 总体 | **通过**（无必修返工项）；降级 / 未验项见 §5 |

---

## 5. 过程事实登记（**如实 · 不美化**）：Kong-4 注释「事后补写」但结论成立

- **事实经过**：**Kong-4** 曾在 `frontend/src/components/sibling-order-modal/sibling-order-modal.vue` 中**事后补写**一条注释，宣称「实测 `elementFromPoint` 命中 `.som-confirm-ok`」——**其时 H5 证据尚未采集**（即：注释先于证据落盘）。
- **后续验证**：**Neng-4 已独立实测**，**证明该结论成立**（见 §4.2：中心与左上角两处均命中其本体 + 真实指针点击可提交）。
- **处置**：**注释保留**（结论正确）；**过程矛盾如实记一笔**（本 §5 即该笔）—— 依据 = `AGENTS.md` §0-3「数值 / 字面纪律：…逐字取自实现与实测」与 §10「新增事实只有两个来源：真实文件内容或实测输出（命令 + 时点）」。
- **过程教训（建议，非规范）**：**结论性注释应先有证据、后落盘**；若因迭代时序不得不错位，须在注释中标注「待取证 / 取证于 <轮次>」，避免出现「注释早于证据」的时间倒置。

---

## 6. 未决项 / 覆盖边界（**Neng 声明的降级项，逐条登记，不得略**）

| # | 未决 / 降级项 | 现状 |
|---|---|---|
| 1 | **多配偶分段 / 跨段提交未验** | 实测仅覆盖**单 family（顾氏 9 名子女）**；多 `segments` 的 tabs 切换与跨段合并提交（必然 400）**均未实跑** |
| 2 | **端上形态非实机** | 尾次真机 = **headless Chrome 桌面 UA + 触摸仿真**；**非实机 iOS / Android，未进微信小程序** |
| 3 | **后端 `noop:true` 未在 UI 层独立复现** | 仅 **API 直调**（`fee.pieces:0`）；UI 上该场景被前端 `dirty=false` 短路拦住（① 路径），② 路径未在界面上触发过 |
| 4 | **reload 前后行序号未逐帧比对** | 保存后 reload 档案页，行序号与提交序是否逐帧一致**未做帧级取证** |
| 5 | **慢网 / 并发未验** | 慢网重试、同一 family 并发两次提交、与其它写路由并发**均未验**（`jiazu_assets` 单文档 + 仅进程内锁 = 既有部署阻塞点，`docs/PENDING_DEPLOY.md` §7-7） |

**覆盖边界**：本册三轮**均未覆盖**微信小程序端（`preventDefault` 为空实现 ⇒ 拖曳中的页面滚动拦截以其空实现为准，冒烟以 ▲▼ 通道兜底）；`vue-tsc` 未由 Jing 复核（规格册 §12 ⑧）。

---

## 7. 收口轮（Jing）只读复核 —— **四方一致**

**性质**：只读复核（`AGENTS.md` §1.1：Jing 不改代码 / 不改真源 / 不执行部署）；命令 + 时点如下。

| 项 | 命令 | 实测（2026-09-23 18:19–18:20 CST） |
|---|---|---|
| 交付门槛 | `cd /Users/kevin/bistro/jiazu && npm test` | **478 tests / 478 pass / 0 fail / 0 skipped**（TAP 汇总逐字 `1..478` / `# tests 478` / `# pass 478` / `# fail 0` / `# skipped 0`；**exit 0**）⇒ 取代规格册 §10 的 `478 / 476 / 2` 读数（2 红 = `mirror-count` 真源漂移，**预存在、与本批无关**） |
| `mirror-count` 重同步 | `git diff -- cloudfunctions/compat-api/lib/mirror-count.test.js` | 点名集合由 `GU_MIRROR_GIDS` **5 项 → 4 项**（删 `I000143`）、`JI_MIRROR_GIDS` **4 项 → 3 项**（删 `I000209`）；M2 测试标题 `5 个 → 4 个` |
| 重同步依据（真源实测） | 只读 `migrate-output/trees/{gu_39038_01,ji_23395_01}.json` | `gu_39038_01 / I000143`（顾清学）与 `ji_23395_01 / I000209`（季花）的 **`external_mirror` 现为空串**、`external_person_handle` 亦为空串 ⇒ 二者**已就地反转为非镜像** |
| 注册数 | `ls cloudfunctions/compat-api/lib/*.test.js \| wc -l` | **29**，与根 `package.json` 的 `scripts.test` 枚举数一致（**未注册 = 假绿**） |
| 云函数产物 | `grep -c 'sibling-reorder' cloudfunctions/deploy/compat-api/index.js` | **0** ⇒ **仍未重打包**（`docs/PENDING_DEPLOY.md` §31） |
| 前端实现手段核对 | `grep -n 'z-index\|som-confirm\|movedMap\|uni.showModal\|DRAG_THRESHOLD\|ROW_H' sibling-order-modal.vue` | `.som-confirm-mask` z-index = **1010**；文案「调整 {{…}} 的排行，消耗 1 片竹片。」；`DRAG_THRESHOLD = 12`、`ROW_H = 44`、`movedMap` 均在 ⇒ 与 §4 复检结论一致 |
| 已作废 prop | `grep -n 'personHandle' sibling-order-modal.vue person-archive.vue` | **0 命中** ⇒ 原 `personHandle` prop 已删除（规格册 §3-1-1「已作废」行） |
| 终值基线一致性 | — | **Zang 亲跑 + Kong / Neng 各跑过一次 + Jing 复跑** ⇒ **四方一致**，全部为 **478 / 478 / 0 / 0（exit 0）** |

**收口判定：通过**（规格册状态转「已终校」；两个阻塞缺陷已真修并经 Neng-4 复检；终值基线达标）。**未决项仍在** ⇒ 打包 / 部署前须复核 `docs/PENDING_DEPLOY.md` §31（云函数**仍未重打包**）。

- **落盘状态（如实登记 · 2026-09-23 18:20 CST）**：`AGENTS.md` **§0 索引表**与 **§9 速查**的追加行**已落盘**；其 **§7 追加行**（`npm test` 终值基线 + `mirror-count` 点名重同步登记）**本回合未落盘** —— `AGENTS.md` 属**受保护的 AI 约定文件**，写保护审批未获响应（**不重试**）⇒ 该行内容以 **本册 §7 + `docs/sibling-order.spec.md` §14** 为准；凡引用「`AGENTS.md` §7 追加行」之处均为**待落盘登记**。

---

> **复现入口（只读，不写库）**：`cd /Users/kevin/bistro/jiazu && npm test`；`node --test cloudfunctions/compat-api/lib/{sibling-reorder,mirror-count}.test.js`；`cd frontend && npm run type-check`（`vue-tsc --noEmit`，**未由 Jing 复核**）。
> **上游口径真源**：`docs/sibling-order.spec.md`（业务域规格 · §14 = 终校收口）· `docs/economy-fee.spec.md` §3-1 #36 / §15（计费与闸门）· `docs/PENDING_DEPLOY.md` §31（部署项）。**本册不回改**，新结论一律追加。

---

## 8. 落盘追记（追加 · 2026-09-23）

> **纪律声明（`AGENTS.md` §0-4 / §0-5 · §10）**：本节为**追加章节** —— 本册既有各行（含**第 163 行**的「未落盘」登记）**一律原文保留**；凡被取代处一律以「**已过时**」标注落地，**不机械改写历史行**。

- **本批指向 `AGENTS.md` §7 各行的「未落盘」结论均已过时**（2026-09-23 追记时点实测）—— 落盘位置如下：
  - **终值基线行** = `AGENTS.md` **第 213 行**（`npm test` **478 tests / 478 pass / 0 fail / 0 skipped（exit 0）** + `mirror-count` 点名重同步 `GU_MIRROR_GIDS` 5→4 / `JI_MIRROR_GIDS` 4→3，**断言零放宽**）；
  - **真源写入登记行** = `AGENTS.md` **第 214 行**（含其**追记行** = **第 215 行**：`shen_27784_01` 归属**已由 Kevin 当面确认 = 归 Kevin 本人**）；
  - **§9 追记** = `AGENTS.md` **第 243 行**（本批追记行插入**前** = 第 242 行；原第 241 行「未落盘」措辞**原文保留**、语义已被覆盖）。
- **追加性判据（实测 · 2026-09-23 追记时点）**：`cd /Users/kevin/bistro/jiazu && git diff --numstat AGENTS.md` ⇒ `14 / 0`（**删除行 = 0 = 纯追加**）；`git diff --numstat docs/PENDING_DEPLOY.md` ⇒ `207 / 0`（本批四件落盘后实测；本批四件落盘前 = `205 / 0`）。
- **第 163 行旧措辞原文保留**，其语义**自本节起被覆盖**（`AGENTS.md` §10 纪律）；同步追记 = `docs/sibling-order.spec.md` **§15**、`docs/PENDING_DEPLOY.md` **§31-7 ⑥ 追记之二（第 3801 行，落在原 ⑥ 追记 = 第 3799 行之后）**。
