# 家族历史数字馆（jiazu）— AI 工作手册（AGENTS.md）

> 本文件**面向 AI 代理**，定义本仓的**写入权限、真源纪律、数据流向与验证口径**。人类开发者请读 `README.md`（快速开始 / 树内操作）与 `IDEA.md`（V1.0-Final 完整设计）。
>
> **权限文件现状（如实登记）**：本仓**此前没有任何 AI 权限文件**——实测无 `AGENTS.md` / `.ai.permission.md` / `.ai-permissions.local.md` / `CLAUDE.md` / `GEMINI.md` / `.cursorrules`（唯一含 `permission` 字样的是 `docs/permission-tier.spec.md`，那是**业务域**节点可见分层规格，不是 AI 权限文件；登记见 `ctrl/PORTS.md` §4-P5）。**本手册即本仓唯一的 AI 约定文件**，写入权限表**内嵌于 §1 / §2**，不另设文件；若日后要分立 `.ai.permission.md`，须先由 Kevin/Zang 立项，再回写 `ctrl/PORTS.md` §4-P5。

---

## 0. 文档索引与真源优先级

| 文档 | 路径 | 用途 |
|------|------|------|
| AI 工作手册 | `AGENTS.md`（本文件） | 权限、真源、数据流向、验证口径 |
| 人类入口 | `README.md` | 技术栈、目录、快速开始、树内操作、脚本用法 |
| 原始设计全书 | `IDEA.md` | V1.0-Final 设计（域名/路由、Tree-ID 规范、权限与用户体系、备份、合规） |
| 本地开发（macOS） | `docs/LOCAL_DEV.md` | Gramps-Web 遗留链路启动、**Node 版本陷阱**、踩坑记录 |
| 存储与契约 | `docs/data-model.md` | 三层存储切分、各层 schema、兼容层 API 契约、**§7 写一致性** |
| 部署待办 | `docs/PENDING_DEPLOY.md` | **只做本地阶段的全部上云动作登记**（P0–P5 批次、数据修正批次、冒烟步骤） |
| 业务域规格 | `docs/*.spec.md` | `id-system` / `tree-id` / `uri-aliases` / `clan-tree` / `marriage` / `founder-attach` / `branch-clan-ops` / `economy*` / `spirit-domain` / `chain-batch-append` / `home-sort-search` / `permission-tier` / `zhonghua-cleanup-2026-09` |
| 发源地结构化规格 | `docs/geo-origin.spec.md` | 家族树「发源地」三级行政区划口径（省—地级—县级）· 台湾省补全 · 海外哨兵码 `999999` · `origin_code` 真源 / `origin` 软冗余 · 展示串拼接与伪级名过滤 · 存量迁移映射清单（Zang 契约 v1，2026-09-20；部署项见 `docs/PENDING_DEPLOY.md` §24） |
| 子女排行规格 | `docs/sibling-order.spec.md` | 子女标签拖曳排序（排行）口径：**排行真源 = `family.child_handles[]` 数组位次（不新增字段）** · 路由 `POST /admin/sibling-reorder`（1 片 / 次 · `edit_fee` · no-op 0 片）· 集合等价校验 / 权限 / 分段 / 前端交互 · 已接受差异与未决项（Zang 裁定 v1，2026-09-23；计费口径另见 `docs/economy-fee.spec.md` §3-1 #36 / §15，部署项见 `docs/PENDING_DEPLOY.md` §31） |
| 道具栏（背包）UI 口径（**追加 · 2026-09-24 · 同批收口修订**） | `docs/economy.spec.md` **§14**（**现行**）；**§13 = v1 / v2 旧口径**（标题下已标注「**已被取代 · 原文保留**」，逐条对照见 **§14-7**） | 行囊 6 × 6 = **36 栏位**展示层口径 v3–v6：**1 格 = 1 道具**（`SEEDS_PER_ITEM` **9999** / `JADES_PER_ITEM` **1** / `BAMBOO_PIECES_PER_ITEM` **100** / `FRAGMENTS_PER_ITEM` **10**；`SLOT_COUNT` **36** / `SLOT_COLUMNS` **6**）· **碎片 1–9 个占 1 格**（角标 = 实际个数）· **余数占格**（如竹简余 **37** 片 1 格 / 角标 37、籽余 **1234** / 角标 1234）· **零头行取消** · 默认序 **竹简 → 石榴籽玉 → 石榴籽（原称 标准石榴籽） → 碎片**（同类内到期近的在前、永久玉在该类最后、余数格排该类最后）· 溢出（> 36）**不入格** + 逐类提示行（类型序 **玉 → 竹简 → 籽 → 碎片**；玉 `背包空间不足，无法合成` / 其它 `空间不足，无法持有`）· 容器位置 = **用户卡正下方**、标题 = **「行囊」** · 属性提示 = **自绘层** `z-index: 1010`（先例 `docs/sibling-order.spec.md` §9-2-1；层内【合成】/【分解】须**先 `closeTip()` 再 `showModal`**）· 拖曳 = **插入式重排**、纯内存**无持久化**（刷新 / 重进回默认序；**tabBar 切回保留内存序 = 已裁定的可接受行为**）；命中判定 **H5 = `getBoundingClientRect()` / 小程序 = `boundingClientRect()`、不得混用** · 玉状态文案单点 = `business/asset-text.ts`（已登记例外 = `pages/spirit/index.vue` 第三份副本）· **前版措辞已取代**（v1 / v2 的「碎片恒不占格 / 零头行 / 默认序 玉 → 籽 → 竹简」，**原文保留于 §13**）—— Zang 裁定 v1–v6，2026-09-24；代码 = `frontend/src/business/inventory.ts` / `business/asset-text.ts` / `components/asset-inventory/asset-inventory.vue` / `pages/mine/index.vue` |
| 玉归属与注入者口径（**追加 · 2026-09-24**） | `docs/spirit-domain.spec.md` **§14** | 玉归属 **v6**：**用户面** `GET /assets/summary` **只返未镶嵌**（`jades_total` 同口径）/ **后台管理面** `GET /admin/assets/user` **全量原始记录**（`summarize(..., {include_mounted:true})`，含 `mounted_tree_id`，两端口径**不得互相套用**）/ **原始记录不迁移、不删除、不改写**（读侧 `filter`，零落写）· `GET /spirit` **新增出参 `injector = {nickname, person_handle} \| null`**（反查链 = `jiazu_assets` 中 `mounted_tree_id === tree_id` 的玉 → 昵称 + `jiazu_anchors` 锚点；**手机号不下发**，无昵称时脱敏；**三态兜底** = 可点档案卡 / 「注入者无本树节点」/「注入者信息不可考」）/ 已镶嵌玉 = **永久占用、等价永久玉**（**到期不影响任何行为**；展示统一「永久有效（镶嵌即永久占用）」；spirit 页**移除玉操作区**、资产页**移除签到 / 合成 /「我的玉」列表 + 删碎片 9 格进度条**）—— Zang 裁定 v6 / v6-附，2026-09-24；展示层口径见 `docs/economy.spec.md` §14；上云动作与判据 = `docs/PENDING_DEPLOY.md` **§32** |
| 质检汇编 | `docs/*.qa.md` | `branch-clan-ops` / `chain-batch-append` / `home-sort-search` 的**历史质检证据** |
| 质检汇编 · 排行批次（**追加 · 2026-09-23**） | `docs/sibling-order.qa.md` | 子女排行批次的**三轮质检证据**（Neng 首轮后端 6/6 + 未收口 3 条 → **Neng-3 H5** 抳到 2 个阻塞缺陷 → **Neng-4 复检**两缺陷真修）；上表 `docs/*.qa.md` 那行系**本次追加前**的目录举例，**原文保留** |
| 候选/执行清单 | `docs/zhonghua-cleanup-candidates-2026-09.md` | 世本清理逐节点清单 + 附录 A（上云待删详情 `_id`） |
| 端口唯一真源 | `../ctrl/PORTS.md` | bistro 工作台端口口径（jiazu 条目见其 §2） |
| 家族页（家谱 tab）规格（**追加 · 2026-09-24**） | `docs/home-sort-search.spec.md` **§11** | 家谱 tab（**tabBar 页** `pages/family/index`，页面标题「我的家谱」）的**单真源组件化**口径：已登录且已绑定 ⇒ **整页只渲染同一份** `frontend/src/components/tree-hall/tree-hall.vue`（`pages/hall/index.vue` 变**薄壳 · 23 行**，**禁止复制第二份模板**）· prop 契约 = `tree-id` / `sync-nav-title`（家谱 tab 传 **false** ⇒ 标题保持「我的家谱」，`pages.json` **一字未改**）· 移除项 = hero 卡（含**发源地**）/ 身份节点卡 / 导航格 / 收录人物统计（**两组空态文案逐字保留**）· **易混澄清**：与同册 §10 的「**首页列表 tab**（家族 / 祖谱）」**不是同一个 tab** · 状态 = **Kong 已落盘 · 工作区在途未提交 · 前端 H5 / 小程序产物均早于本批 ⇒ 未重打**；受影响既有口径 = `docs/geo-origin.spec.md` **§7-5 D3** 与 `docs/person-places.spec.md` **D3**（家族页 hero 发源地，**旧行一律原文保留**）；部署面 = `docs/PENDING_DEPLOY.md` **§32-2 追加行** |
| 好友关系域（含邀请链路 + 奖励池）规格（**追加 · 2026-09-25**） | `docs/friend-domain.spec.md` | 好友关系域**新立分册**（首次落盘 2026-09-25）：生命周期状态机与时间轴（**锚点 = 首次建立时刻 `T0`**）· 续约流程与**双边扣费**（双方各 −1 枚成品兰帖）· 奖励池分发算法（分母 / 均分 / 余数销毁 / **不连锁** / 不重复分发）· 物品定义（**竹简碎片 = 既有竹片** / 兰帖碎片 / 成品兰帖 / 合成分解关系）· 存储契约（**`jiazu_friends`** 与 **`jiazu_invites`** 两新增集合；**物品字段落在既有 `jiazu_assets`、不新建物品集合**）· 接口清单 / 枚举新增 / 权限口径 / 前端落点与入口（**入口 = 家谱页，不动 tabBar 结构**）· **§15 待裁 13 条**（**未裁前不得据任一案判任何实现负**）· **§17 追记**（R-15 存储形态改「**每关系一文档**」· 交付分批 **批 2 / 批 3** · 邀请链路 · **三个新页面一律进 `subPackages` 子包**）。**实现状态 = 批 1–2 已落盘**（`lib/friends.js` / `lib/invite.js`，**好友域时间口径待改单修正**）；本册**不含任何实现现状读数**。上云动作与判据 = `docs/PENDING_DEPLOY.md` **§33 / §34**，本批三合一登记 = 同册 **§35** |
| 任务中心域规格（**追加 · 2026-09-25 · 批 3**） | `docs/task-center.spec.md` | **批 3（任务中心）**的**新立分册**（首次落盘 2026-09-25；**规划中 · 本轮不做上云动作**）：家谱页双 tab（T-1 / T-2）· **三条每日任务**的集合与达标（T-3）· 领取口径与**三态展示**（T-4，不可静默失败）· 发奖落点与指向（T-5，**本册不复述两处数值**）· 入口格（T-6）· 批次边界与接口清单（T-7）· 与 `docs/home-sort-search.spec.md` **§11** 的取代关系（T-8）· **§13 待裁 2 项**（任务每日重置时点 / 平台写操作达标判定粒度，**未裁前不得据任一读法判任何实现负**）。**与好友域册冲突时以好友域册为准**（本册只做指路）；**以文件实际落盘为准**。上云动作 = `docs/PENDING_DEPLOY.md` **§35 第 ④ 项（规划中 · 不做动作）** |

**真源优先级（冲突时的裁决顺序）**

1. **代码即事实**：`cloudfunctions/compat-api/**` 是运行时真源；文档与它不一致时**先如实登记差异**，不得反过来照文档改代码。
2. **spec 是口径权威**：`docs/*.spec.md` 为规格真源，实现必须与其一致；spec 之间冲突时**以被引用方明示的优先声明为准**（例：`docs/marriage.spec.md` 头部声明与 `docs/data-model.md` / `docs/permission-tier.spec.md` 冲突时以本文件为准并同步修订彼文件）。
3. **数值 / 字面纪律**：正则、选项名、错误文案、`tree_id` 字面值**逐字取自实现与实测**；**不得自行改口径、不得编数字**（`docs/tree-id.spec.md` §0）。
4. **历史版本行不机械改写**：spec 的旧行、旧批次段落**保留原文**，新口径以**新增章节 + 「已作废 / 已取代」标注**落地（例：`docs/PENDING_DEPLOY.md` §23 取代 §21 的卡片显示口径，**§21 正文不改写**、字段降级为保留字段）。
5. **`docs/*.qa.md` 是历史质检证据，不得回改**；新结论以新章节追加。
6. **端口口径不看文档记忆**：一律以 `ctrl/PORTS.md` + 运行时 `../ctrl/index.js` 的 `services` 表为准。

> **条款号约定（追加 · 2026-09-24 · 只追加 · 上列各行原文一律保留）**：其它文档中出现的 **`AGENTS.md` §0 的条款号简写**（形如 `§0-1`、`§0-3`、`§0-4`、`§0-5`；**被引例**：`docs/sibling-order.spec.md` / `docs/sibling-order.qa.md` / `docs/economy-fee.spec.md` / `docs/home-sort-search.spec.md` / `docs/economy.spec.md` / `docs/spirit-domain.spec.md`）**一律指本节「真源优先级（冲突时的裁决顺序）」的第 N 条** —— **§0-1 = 第 1 条「代码即事实」**、§0-2 = 第 2 条「spec 是口径权威」、**§0-3 = 第 3 条「数值 / 字面纪律」**、**§0-4 = 第 4 条「历史版本行不机械改写」**、**§0-5 = 第 5 条「`docs/*.qa.md` 是历史质检证据，不得回改」**、§0-6 = 第 6 条「端口口径不看文档记忆」；**不指上表（文档索引）的行号，也不是新增条款**（与各分册**自身**的 `§0-1` / `§0-3` / `§0-4` —— 如 `docs/geo-origin.spec.md` §0-1 裁定表 / §0-3 字面纪律 / §0-4 落盘清单 —— **互不相干**，后者一律带册名前缀书写）。本条为**既有引用口径的可解析化**：全册跨册 `§` 引用机器自查报出的 `AGENTS.md` 的 §0 简写四项（`§0-1` / `§0-3` / `§0-4` / `§0-5`，见 `docs/sibling-order.spec.md` / `docs/sibling-order.qa.md` / `docs/economy-fee.spec.md` / `docs/home-sort-search.spec.md`）**自本行起按上列对照表解析**；被引各册的原文**一律保留**。

---

## 1. 你能做什么

### 1.1 权限表

| 角色 / 工具 | 改代码（`cloudfunctions/` `frontend/` `auth-server/` `scripts/`） | 改 `docs/*.spec.md` | 改 `AGENTS.md` / `README.md` | 改真源数据（`migrate-output/` `config/`） |
|---|---|---|---|---|
| Kevin（人） | ✅ | ✅ | ✅ | ✅（须有备份与回滚） |
| HERMES / Zang（总管汇总） | ✅ | ✅ | ✅ | ⚠️ 仅在明确派单且登记备份后 |
| Kong（实现） | ✅ | ❌（只在规格授权下改动并登记） | ❌ | ⚠️ 仅数据修正批次，且须登记 md5 前后值 |
| Neng（质检） | ❌ | ❌ | ❌ | ❌（**质检一律在 `/tmp` 副本上跑，真源零写入**） |
| Jing（制度） | ❌ | 仅按裁定登记口径 | ✅（本文件维护人） | ❌ |
| 其他 AI | ✅ | ❌（文档只读，建议写进变更说明由授权方落盘） | ❌ | ❌ |

> 无独立权限文件时，**上表即本仓写入权限约定**；与 `ctrl/PORTS.md` 冲突时以本表 + §2 禁令为准并回写 PORTS。

### 1.2 可做

- 改 `cloudfunctions/compat-api/`（`index.js` 路由 + `lib/**` 写路径 / 读路径 / 经济域 / 树访问）、`frontend/src/**`（uni-app）、`auth-server/**`（遗留链路，仅排查向改动）、`scripts/**`、`shell-scripts/**`。
- 前端跨端逻辑放 `frontend/src/business/`（纯逻辑，H5 与小程序复用），页面放 `frontend/src/pages/`，组件放 `frontend/src/components/`；API 封装一律收敛到 `frontend/src/business/api.ts` 并由 `business/index.ts` 转出。
- 本地验证：后端 `COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js 3100`；前端 `cd frontend && npm run dev:h5`（5199）；全量单测 `npm test`；类型检查 `cd frontend && npm run type-check`。
- 数据修复 / 迁移脚本一律支持**副本演练**：一次性修复脚本用 `COMPAT_OUT_DIR=<dir>` 指向数据副本，先 dry-run 再 `--apply`（无 `--apply` 即 dry-run 是本仓脚本的惯例，见 `scripts/fix-person-names.mjs` / `fix-zhonghua-gender.mjs` / `migrate-tree-id-pinyin.mjs`）。
- 文档：按 §0 的 4/5 条为既有 spec「追加新章节」，不改写历史版本行。

---

## 2. 你不能做什么

### 2.1 真源与数据

- **不要把真源当可丢弃产物**：`migrate-output/`（树 JSON = 结构真源、`details/` = 档案真源、`collections/`、`report.json`）与 `config/tree-meta.json` 是**运行时数据真源**；其中 `migrate-output/` **被 `.gitignore` 忽略（第 12 行）**——**进不了 Git、删了就没了**。任何写入前必须先备份（本仓惯例：`/tmp/jiazu-bak-<ts>` 或 `~/jiazu-backups/<日期-说明>/`），并在结论里登记**写入前后 md5**。
- **不要跳过部署顺序**：云端详情是 `doc(_id).set()`（**upsert，只增不删**）→ 树 JSON 删节点后，**必须显式手工删除对应 `jiazu_person_details` 旧键**，否则云端留孤儿详情、与 `tree_id` 口径分叉（`docs/PENDING_DEPLOY.md` §12-2 / §13-2 / §16-3）；顺序固定「**先重传、再删旧键**」。
- **不要在本地阶段擅自上云**：本阶段约定是**只做本地**，所有上云动作累积在 `docs/PENDING_DEPLOY.md`（§3 头部「约定」），**按该清单逐项执行**，不在其它任务里顺手 `tcb fn deploy`。
- **不要忘记云函数重打包**：改了 `cloudfunctions/compat-api/**` 而不重跑 esbuild，云端路由会 404/静默返旧口径（判据见 `docs/PENDING_DEPLOY.md` §11-1 / §14-1 / §16-1 / §17-1，均为 `grep -c` ≥1）。`cloudfunctions/deploy/compat-api/index.js` 是**产物**，不是编辑对象。
- **不要**改 `migrate-output/` 或 `config/tree-meta.json` 的既有字段名/形状来「顺手统一」；口径变更必须走 spec 章节 + 数据修正批次。
- **不要**把 `jiazu_id_seq` 当可重播种的计数器：`lib/id-seq.js` 的播种**只抬不降**，云端陈旧值会与本地新铸号**撞号**（`docs/PENDING_DEPLOY.md` §12-3）。
- **全站编号终身不变**：跨树迁移**不重新编号**（`getGrampsId` 口径见 `docs/id-system.spec.md`）；`handle` 24 位全局唯一，跨树迁移沿用 handle。

- **真源写入登记 · 本批（追加 · 2026-09-24 · **只追加，不改上列各条**）**：本批「道具栏（背包）」实测触发 `migrate-output/collections/jiazu_assets.json` 的 **mtime 变（2026-09-24 07:42:20）**，但其**内容 md5 恒为 `9f17a77f7871584a563047c3ab45f09e`**（根因 = 读 `GET /assets/summary` 触发 `sweep` 整体回写 —— **记账入口，内容不变、仅 mtime 变**；**非本批代码写入、内容零变化**）⇒ 完整登记行（含触发方、三处独立读数与制度口径「**后续本机验证优先用 /tmp 副本栈，避免无谓 touch 真源**」）= **本手册 §7 追加行**（先例 = 2026-09-23 的 §7「真源写入登记」行，登记位置口径不变）。

- **真源写入登记 · 本批 · 收口追记（追加 · 2026-09-24 · **只追加，不改上列各条**）**：上条末句「⇒ 完整登记行（…）= **本手册 §7 追加行**」曾为**悬空引用**（当时 §7 尚无本批行）—— 现**已收口**：完整登记行**已落盘于本手册 §7**，逐字标题 = **「真源写入登记 · 本批（追加 · 2026-09-24 · 归因 = 读侧 sweep 回写）」**（含触发方 + 三处读数 + 制度口径），同批 §7 另有 **「`npm test` 实测基线（追加 · 2026-09-24 …）」** 行。上条「= 本手册 §7 追加行」措辞**原文保留**，其**语义自本行起指向已存在的落点**（`AGENTS.md` §10 纪律）。本节其余各条**一字未改**。

### 2.2 密钥与凭据

- `.env`、`auth-server/.env`、`auth-server/data/*.json`（`users.json` / `wallets.json` / `role-anchors.json` / `gramps-owners.json` …）、`config/tree-api.json`（含**树访客密码**，已在 `.gitignore`）——**只读、不改、不打印**，也不在回复中粘贴其内容。
- 自证只允许「键名」而非「值」，且仅用只取键名的形式，例如：`grep -n -E '^[A-Z_0-9]+=' .env`（**不得** `cat` / `echo` / 打印整行含值）。云开发 API Key 属用户提供项：**不代取、不打印**（`CB_ENV` / `CB_KEY` 一律 `<…>` 占位）。
- 不新增明文凭据文件；示例值只进 `.env.example`（`.gitignore` 第 27 行 `!.env.example` 明确放行）。

### 2.3 代码与行为

- **不要**留未使用的 import / state / `console.log` / 死代码；不要加「手动刷新按钮 / 调试开关」掩盖数据流缺陷——数据加载与状态同步问题**从数据流层面修**。
- **不要**在 `lib/lib` 里造第二套真源：`tree_id` 注音唯一真源是 `cloudfunctions/compat-api/lib/tree-write.js` 的 `surnamePinyin()`；前端 `frontend/src/business/tree-id.ts` **只解析与校验、不注音**（H5 不引拼音词典）；遗留副本（`shell-scripts/gen-tree-id.mjs`、`auth-server/split-tree.js`、`frontend/src/static/tree-meta.json`）**已登记为陈旧副本，不得作为真源引用或复制其口径**（`docs/tree-id.spec.md` §6）。
- **不要**在遗留链路（`auth-server` → Gramps-Web）上补新写能力：该链路**不支持新写能力**（总谱续编 / 生卒编辑等），新能力一律进 `compat-api`。
- **不要**在日志 / HTTP 响应里泄漏本机路径：系统级失败统一 `500` + 通用文案（`errorStatusOf` 口径，见 `docs/PENDING_DEPLOY.md` §17-1）。
- **不要**新增约定外的散落说明文档（AI 约定归本文件、人类说明归 `README.md`、规格归 `docs/*.spec.md`、质检归 `docs/*.qa.md`）。

### 2.4 工作区副作用

- **预同步 / 迁移类脚本会写工作区**：`scripts/upload-migrated-to-cloudbase.mjs` 会回写 `tree-meta.storage_files`；`migrate-tree-id-pinyin.mjs` 默认 dry-run、`--apply` 前自动备份；一次性修复脚本支持 `COMPAT_OUT_DIR` 指向副本。**jiazu 侧没有「aranya 式预同步脚本自动生成文件」的情形**（无 `geo:publish` 类发布器），但**任何真源写入都会改 `migrate-output/` 或 `config/`**，须按 §2.1 先备份、后登记 md5。
- 备份目录 `backups/`（如 `data_ji_23395_01.gramps`）与 `/tmp/jiazu-*` 是**离线产物 / 临时产物**，不同步云端、不参与打包。

---

## 3. 真源与数据流向（必须先懂这个）

```
用户（手机号 + 短信验证码，无密码）
      │
      ▼
前端 uni-app（H5 5199 / 小程序）  ──/api──▶  compat-api（默认数据层：本地 3100 / 云端 CloudBase 云函数）
                                                ├─ 树 JSON        trees/<tree_id>.json（结构真源，version 乐观锁）
                                                ├─ 人物详情        person_details（events/media/citations/notes/attributes）
                                                └─ 业务集合        jiazu_users / jiazu_wallets / jiazu_anchors / …
（遗留、已退出运行时链路、退役中）auth-server 5197 ──▶ Gramps-Web 5198   ← 仅排查历史链路 / 离线 .gramps 转换
```

- **`compat-api` 是默认数据层**：本地 `3100`、云端云函数；输出严格保持 **Gramps-Web API 形状**（`RawPerson` / `family` / `search`），前端 `business/api.ts` 零改动（`README.md` §目录结构 / §运行时架构；`cloudfunctions/compat-api/index.js` 头部）。
- **两种数据源模式**：环境变量名是 **`COMPAT_SOURCE`**（**不是** `CONTENT_SOURCE`——全仓 `grep CONTENT_SOURCE` = 0 命中）。
  - `COMPAT_SOURCE=local` → 读/写 `migrate-output/`（+ `config/tree-meta.json`），**无需 CloudBase 凭据**；
  - 缺省 / `COMPAT_SOURCE=cloud` → CloudBase（云存储 `trees/*.json` + 集合）。
  实现锚点：`cloudfunctions/compat-api/index.js:6`（双模式说明）、`cloudfunctions/compat-api/lib/store.js:78`（`SOURCE = process.env.COMPAT_SOURCE || 'cloud'`）、`cloudfunctions/compat-api/local-server.js`（`node local-server.js [port]`，默认 3100）。
- **`auth-server(5197) → Gramps-Web(5198)` = 已退出运行时链路 / 退役中 / 仅排查用的遗留链路**：不在 ctrl 面板托管、不进云（`docs/PENDING_DEPLOY.md` §6）；日常开发**不需要**它，只在排查历史链路或做离线 `.gramps` 转换时启动。
- **本地 dev ≠ 生产**：生产 docker 映射仍为 `127.0.0.1:8000:5000`，**不得以生产映射回推本地端口**（`ctrl/PORTS.md` §2 第 58 行口径）。
- **三层存储、字段零重叠**：树 JSON 不含档案字段、详情文档不含姓名/生卒/关系 → 任何编辑都是单点写；`gramps_id` / `name` 是允许的软冗余（`docs/data-model.md` §2）。
- **写一致性不变量必须逐条成立**（`docs/data-model.md` §7-1「单树写路径的不变量」）：树落盘成功后才写详情、失败侧不得留幻影（`lib/store.js` 先落盘成功再更新缓存）、`version` / `updated_at` 失败时原地回滚。
- **独立管线**：GEDCOM 5.5.1 导出/导入只读树 JSON + 详情，不依赖运行时存储——`node scripts/gedcom-export.mjs <tree_id>`、`node scripts/gedcom-import.mjs <tree_id> <input.ged>`。

---

## 4. 端口与地址纪律

| 项 | 值 / 规则 | 出处 |
|---|---|---|
| jiazu 前端（H5） | **5199**（`npm run dev:h5`，cwd `frontend`；`PORT=5201` 可临时改端口） | `ctrl/PORTS.md` §2；`README.md` 快速开始 |
| jiazu 数据层 compat-api | **3100**（`COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js 3100`） | `ctrl/PORTS.md` §2 |
| 前端默认代理 | `/api` → **3100**（`process.env.API_PROXY \|\| "http://localhost:3100"`） | `frontend/vite.config.ts:17-24` |
| 遗留链路 | auth-server **5197** → Gramps-Web **5198**；仅 `npm run dev:h5:legacy`（`API_PROXY=http://127.0.0.1:5197`） | `frontend/package.json:7`；`docs/LOCAL_DEV.md` |
| 生产映射（不参与本地） | `127.0.0.1:8000:5000` | `ctrl/PORTS.md` §2 第 58 行 |
| 保留端口 | **5173 / 5174 保留不用**，不得作为回退目标 | `ctrl/PORTS.md` 制度 (c) |

- **端口口径唯一真源 = `../ctrl/PORTS.md`**，其运行时真源 = `../ctrl/index.js` 的 `services` 表；两处不一致时**以 `index.js` 为准并当场修 PORTS.md**（`ctrl/PORTS.md` §1(a)）。
- **端口变更必须三处同步**：① 本项目配置（`vite.config.ts` / `PORT` env）；② `ctrl/PORTS.md`；③ **本仓自己的 spec / README**（`ctrl/PORTS.md` 制度 (b)）。
- **本机非生产链路引用一律写 `127.0.0.1`，不写 `localhost`**：Node **v18.19.0** 的 `fetch`/DNS 把 `localhost` 优先解析为 `::1`，而 Gramps-Web **只绑 IPv4 `127.0.0.1:5198`** → 症状 `ECONNREFUSED ::1:5198`（auth-server 侧回落 **502**）——**不是服务没起，是地址写法问题**；解法一（推荐）改写 `http://127.0.0.1:<port>`、解法二换 node ≥ 20（`docs/LOCAL_DEV.md` 头部「⚠️ Node 版本陷阱」；制度见 `ctrl/PORTS.md` §1(d)）。
  - **照录例外（实测现状）**：`frontend/vite.config.ts:22` 的默认代理 target 仍为 `"http://localhost:3100"`（属实现侧现状，待统一时随改）；`frontend/package.json` 的 `dev:h5:legacy` 已是 `API_PROXY=http://127.0.0.1:5197`（第 7 行）。**不得据照录例外把新写的引用也写成 `localhost`**。
- 服务启动后请**用 `state` 判健康**：面板托管服务「端口可达 ≠ 服务健康」（`ctrl/PORTS.md` §3.2）；jiazu 的两个面板条目 sid 为 `jiazu-api`（3100）与 `jiazu`（5199）。

---

## 5. 权限档位（业务域，与 AI 权限无关但常被质检引用）

- **身份档位**：`guest`（无有效 JWT）/ `logged-in`（已登录未加入）/ `member`（锚点 `tree_id == 该树`）；普通家族树读裁剪：guest 除最底 **18** 层、logged-in 除最底 **9** 层，member 全可见；`zhonghua`（is_master）全放行；浅树兜底 `visibleMax = 1` 并标 `clamped:true`（`docs/permission-tier.spec.md` §2 / §3）。
- **管理特权**：`chief_editor` 所有树全可见（含 `zhonghua`）；`tree_steward` 锚点树全可见、其它树按档位回落（同上 §2）。
- **裁剪在服务端**（读 API 返回前裁剪），响应形状对前端不变；隐藏节点**不得以任何字段泄漏**（同 §3）。
- **聚合计数不随节点级裁剪变化**：`GET /tree/rank` 的 `person_count` 与家族页树图统计栏是聚合口径，与 §2/§3 的节点级裁剪**互不影响**（`docs/permission-tier.spec.md` §5 末条）。
- **定点例外**：跨树选配偶发现通道 `GET /search/marriage-candidates` 是白名单式单条例外（`docs/permission-tier.spec.md` §11），**不得据此推广**。

---

## 6. 目录结构（真实顶层）

```
jiazu/
├── cloudfunctions/compat-api/   # 运行时后端：路由 index.js + lib/**（store / tree-write / scope / tree-access / id-seq / economy-* / marriage / clan / founder-attach / branch-clan-ops …）
│   └── local-server.js          # 本地 3100 开发服务器（无需 CloudBase 凭据）
├── cloudfunctions/deploy/       # esbuild 打包产物（compat-api/index.js）—— 产物，不是编辑对象
├── migrate-output/              # 真源数据（.gitignore 第 12 行）：trees/ details/ collections/ report.json
├── config/tree-meta.json        # 树元数据（kind / founder_* / path_alias / surname_pinyin …）
├── frontend/                    # uni-app（Vue3 + TS + Vite）：src/{business,pages,components,api} + vite.config.ts
├── auth-server/                 # 【遗留】手机号验证码认证代理 5197 → Gramps-Web 5198（退役中；含 data/*.json）
├── scripts/                     # 迁移/导入导出/一次性修复（.mjs 与 .py）
├── shell-scripts/               # 备份 / 交叉引用校验等 shell 工具
├── docs/                        # *.spec.md（规格真源）*.qa.md（历史质检）LOCAL_DEV / PENDING_DEPLOY / data-model / IDEA
├── docker-compose.yml           # 【遗留】Gramps-Web 生产部署编排（映射 127.0.0.1:8000:5000）
└── IDEA.md / README.md / package.json（根：仅 npm test + 两个依赖）
```

- 根 `package.json` 只有 **两个运行依赖**（`@cloudbase/node-sdk`、`pinyin-pro`），**没有 build 脚本**；测试脚本见 §7。
- `frontend/node_modules/.bin/esbuild` 是云函数重打包所用的 bundler（见 `docs/PENDING_DEPLOY.md` §1）。

---

## 7. 本地开发与验证

```bash
# 1) 数据层（默认数据源，读 migrate-output/ + config/tree-meta.json）
COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js 3100

# 2) 前端（vite 默认把 /api 代理到 3100）
cd frontend && npm run dev:h5          # http://localhost:5199（5173/5174 保留，不得回退）

# 3) 仅在排查历史链路时
npm run dev:h5:legacy                  # → auth-server 5197 / Gramps-Web 5198（退役中，不支持新写能力）

# 4) 验证
npm test                               # node --test（见下）
cd frontend && npm run type-check      # vue-tsc --noEmit
```

- **`npm test` = `node --test` + 26 个测试文件**（根 `package.json` 的 `scripts.test`）：**26 个全部**在 `cloudfunctions/compat-api/lib/*.test.js`（tree-access / tree-write / chain-append-batch / marriage / child-write / master-living / founder-attach / founder-reattach / reset-founder / meta-guard / node-delete / reparent-cross / id-system / assets / messages / economy-fee / economy-spirit / economy-market / branch-clan-ops / home-sort-search / noop-edit-integrity / marriage-candidates / mirror-count / family-population / family-write-guard / geo）。**`auth-server/` 两项已随该遗留链路退役撤下**（`docs/PENDING_DEPLOY.md` §1；2026-09-20 实测：`scripts.test` 枚举 26 项 = 磁盘 `lib/*.test.js` 26 个，无未注册文件）。
  - **新增测试文件必须同步注册进 `scripts.test`**——**未注册 = 假绿**（`docs/PENDING_DEPLOY.md` §14-4 / §16-1 明确口径）。
  - **`npm test` 跑的是本地副本**（`COMPAT_SOURCE=local` + `/tmp` 副本、`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 钩子），**与云端数据无关，不得当云端回归用**（`docs/PENDING_DEPLOY.md` §14-4）。
  - **测试写入纪律**：测试必须对真源**零写入**，收尾断言比对真源 md5（`lib/*.test.js` 普遍如此，如 `reparent-cross` / `node-delete` / `mirror-count`）。
  - ⚠️ **`auth-server` 若退役，测试清单必须同步收敛**（删除 `auth-server/tree-access.test.js`、`auth-server/read-filter.test.js` 两行，并把对应读裁剪覆盖确认已由 compat-api 侧承担——`docs/PENDING_DEPLOY.md` §1 已注明「若 auth-server 不上云，只需 compat-api 版」）。 **（2026-09-20 实测：已随之完成——两项已撤下，清单 26 项全在 `lib/`。）**
- **本手册成文时点（2026-09-19）实测基线（如实登记，勿当承诺；2026-09-20 已被下条取代）**：`npm test` → **427 tests / 426 pass / 1 fail**；唯一失败项 = `cloudfunctions/compat-api/lib/mirror-count.test.js`「M6 真源 `ji_23395_01`：`mirror_count` 动态一致、`person_count` 快照 89 + 不变量」，失败断言为 `点名的节点 I000237 必须仍存在于真源 ji_23395_01`（`mirror-count.test.js:189`，由 `:329` 调用）——即**真源数据已漂移、测试点名快照未同步**，属**已知未决**（修复需二者之一：更新点名集合，或恢复该节点；**在未定案前不得擅自改断言**）。
  - **2026-09-20 实测基线（取代上段；口径见 `docs/geo-origin.spec.md` §13-7 / §13-11-3）**：`npm test` → **431 tests / 431 pass / 0 fail / 0 skipped**；`auth-server/` 已退役、`lib/geo.test.js`（18 条）新增。上段的 **427 / 426 / 1 属 `0d774bd^` 结构 + `058b5f7` 读数**的旧基线，差量已结案：**427 − 14（`auth-server` 两文件随 `ce4131c` 删除、`0d774bd` 撤引用）− 10（`family-population` 22→12）+ 10（`family-write-guard`）= 413**，**413 + 18（`geo.test.js`）= 431**。`mirror-count` 现不再失败是**断言跟随真源重同步**（`058b5f7` 排除集改空、`23a8467` 快照 87→61），**不是真源回退**。根因机制：`migrate-output/**` 被 `.gitignore` 忽略（第 12 行），真源树不进版本管理 ⇒ 点名 / 快照类断言会随数据漂移。
- 一次性修复脚本惯例：先 dry-run（无 `--apply`），必要时 `COMPAT_OUT_DIR=<副本>` 演练，最后 `--apply`（`README.md` §数据修复/一次性脚本）。
- 真机 / UI 验证：H5 真机质检是本仓质检的主流形式（`docs/*.qa.md`），但**质检在 `/tmp` 副本 + 非占用端口上跑**（例：`/tmp/qa-copy` + 端口 `3458`），**全程不碰用户正在使用的 3100 / 5199**（`docs/home-sort-search.qa.md` 头部）。
- **`npm test` 基线（**本节追加 · 2026-09-20 实测 · **取代上段「431 tests / 431 pass / 0 fail / 0 skipped」那条基线**，该段原文保留**）**：`cd /Users/kevin/bistro/jiazu && npm test` → **454 tests / 454 pass / 0 fail / 0 skipped**（exit 0）⇒ 上段 431 基线**已陈旧**；**本数随「始祖真源反转」的新增测试会再变**，最终数由 **Kong 交付后以实测补登**（本手册**不推算、不预填**）。
- **`npm test` 基线校正（**本节追加 · 2026-09-20 **18:22:53** CST 实测 · **取代上条「454 tests / 454 pass / 0 fail / 0 skipped」**，该行原文保留**）**：`cd /Users/kevin/bistro/jiazu && npm test` → **454 tests / 447 pass / 7 fail / 0 skipped**（**exit 1** = **红**）。7 红项 = `not ok 42` `52` `228` `229` `230` `234` `236`，**归另一个 Kong 收尾**（测试端尚未跟改「始祖真源反转」新口径；例：`52` 断言的正是 R5 已放宽掉的旧文案「…不是上层镜像，无法汇宗」）。⇒ **上条 454 / 454 / 0 系「落盘前」读数、已作废**；**`npm test` 全绿 = 本批交付门槛**（未全绿**一律不得**打包 / 部署 / 重传，工作区保持冻结），**全绿后再追加一行登记**（本手册**不推算、不预填**）。
- **`npm test` 全绿读数（**本节追加 · 2026-09-20 **18:38:20** CST 实测 · **取代上条红读数**）**：`cd /Users/kevin/bistro/jiazu && npm test` → **454 tests / 454 pass / 0 fail / 0 skipped**（**exit 0** = **全绿**，`not ok` 行 **0 条**）。Kong 于 **18:31–18:36** 落盘测试端跟改（`lib/founder-attach.test.js` · `lib/branch-clan-ops.test.js` · `lib/founder-reattach.test.js`）后转绿 ⇒ 上条 **454 / 447 / 7（红）** 为**收尾前**读数、**已被取代**。**`npm test` 全绿 = 本批交付门槛，现已达标**（仍以**冻结时点终校**为准；代码仍在动 ⇒ 达标状态须随冻结复核）。
- **裁定追加 v1.1 指路（本节追加 · 只指向，不改上列各行）**：**A1**（宗谱侧旧详情键**默认删除** + `--keep-source-detail` 退回 + **删除前备份副本与 md5**）/ **A2**（复制档**只携带内容字段**、**标识字段用本树节点现值**）/ **A3**（`external_founder_created_by` **同批清空**）= `docs/PENDING_DEPLOY.md` **§29-3-1**（验收 = §29-4 第 **15–17** 条）；**A6**（`/tree/rank` 世数是否已接 `resolveChainGen`；**实测 = 未接**）= 同册 **§29-9**（验收 = §29-4 第 **18** 条）。
- **裁定 v1.4-D1（本节追加 · 2026-09-20 裁定 · **取代上列各条中关于 A6 的两种旧值**「实测 = 未接」与「已接线」，两处原文均保留）**：**A6 `/tree/rank` 接线 = 回退**。依据 = 实测副作用超出预期 —— 4 棵祖谱（`gu_39038` / `ji_23395` / `liu_21016` / `qin_31206`）的 `GET /tree/rank` 出参 `total_generations` 由 **2 / 2 / 37 / 4** 跳到 **78 / 90 / 76 / 78**（`explicit` false→true、`rank_key` 跳级），并因 > `MAX_DEPTH(72)` 使 `over_limit` 由 **false 变 true**；而目标场景（家族树侧真身始祖带的是**无镜像标记**的登记指针）**无观测量** ⇒ 按 A6 原文除外条款回退，`/tree/rank` 保持原状；**R6 的唯一落点 = `lib/tree-write.js` 的 `clanSelfGenMap`（:772 / :781），已接**。回退后 `cloudfunctions/compat-api/index.js` 与 HEAD **字节相同**（md5 `f1f40096323de98f1f2b3d9188c2bac5`）；权威登记见 `docs/PENDING_DEPLOY.md` **§29-9**「v1.2 裁定 D1 校正」块（其「已接线」旧行同样以本裁定取代）。
- **`npm test` 读数（本节追加 · 2026-09-20 19:18–19:22 CST 两次实测一致 · 取代上列 454 系列读数，原文均保留）**：`cd /Users/kevin/bistro/jiazu && npm test` → **464 tests / 464 pass / 0 fail / 0 skipped**（exit 0）；增量 = 新增专项回归测试 `cloudfunctions/compat-api/lib/founder-source-reversal.test.js`（746 行 / 10 tests，已注册）。**`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = 28**（未注册 = 假绿）。中间曾出现 **455** 读数：经查为并发窗口内撞上「测试文件增量写入骨架态」的中间快照，**已作废**。
- **新增口径章节指路（本节追加 · 只指向，不改上列各行）**：「始祖真源反转（变体 A：始祖真身在家族树）」= `docs/founder-attach.spec.md` **§9**（术语重定义 / R1–R3 / R6 / 代码锚点 / 真源锚点）、`docs/clan-tree.spec.md` **§11**、`docs/branch-clan-ops.spec.md` **§16**（R4 / R5 / R7）；上云动作与判据 = `docs/PENDING_DEPLOY.md` **§29**。
- **`npm test` 实测基线（**本节追加 · 2026-09-23 **13:30:28** CST 实测 · **取代上列 464 系列读数**，上列各行原文一律保留）**：`cd /Users/kevin/bistro/jiazu && npm test` → **478 tests / 476 pass / 2 fail / 0 skipped**（**exit 1** = **红**，`not ok` **2 条**）。**2 红均为预存在的真源漂移、与本批（子女排行）无关**，且**都落在同一文件** `cloudfunctions/compat-api/lib/mirror-count.test.js`：
  - **M2**（`mirror-count.test.js` 测试定义 `:247` · 断言 `:253`，点名清单 `:194`）点名镜像 **`I000143` 未命中** —— 真源 `migrate-output/trees/gu_39038_01.json` 中 **`I000143`（顾清学）的 `external_mirror` 现为空串**（本手册 2026-09-23 只读实测）；
  - **M6**（测试定义 `:323` · 断言 `:331`，点名清单 `:196`）点名镜像 **`I000209` 未命中** —— 真源 `migrate-output/trees/ji_23395_01.json` 中 **`I000209`（季花）的 `external_mirror` 现为空串**（同批实测），`person_count` 快照 61 系列断言随之不成立。
  ⇒ **结论 = 待真源重同步**（机制同 2026-09-20 基线段：`migrate-output/**` 被 `.gitignore` 忽略 ⇒ 点名 / 快照类断言随数据漂移）；**在重同步定案前不得擅自改断言**（同 2026-09-19 基线段口径）。
  - ⚠️ **本批自身新增的专测 `cloudfunctions/compat-api/lib/sibling-reorder.test.js`（512 行）全绿**；`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = **29**（新增 1 项，**未注册 = 假绿**）；`cloudfunctions/deploy/compat-api/index.js` 产物**仍未重打包**（md5 `d61a8aebfb3f3095baae4e1e731fd675`，= `docs/PENDING_DEPLOY.md` §29-1 同值）。
  - ⚠️ **本数随本批收尾会再变，终值由 Neng 终校后回填**（本手册**不推算、不预填**）；**`npm test` 未全绿前不得打包 / 部署 / 重传**（沿用 §29-6 第 1 条门槛口径）。读数与复现证据见 `docs/PENDING_DEPLOY.md` **§31-5**。
- **`npm test` 终值基线（**本节追加 · 2026-09-23 · **子女排行批次终校** · **取代上列各条读数**，上列各行原文均保留**）**：`cd /Users/kevin/bistro/jiazu && npm test` → **478 tests / 478 pass / 0 fail / 0 skipped（exit 0）**（四方一致：Zang 亲跑 + Kong / Neng 各跑过一次 + Jing 复跑）；同批登记 **`mirror-count` 点名重同步**（**`GU_MIRROR_GIDS` 5 → 4 删 `I000143`**、**`JI_MIRROR_GIDS` 4 → 3 删 `I000209`**，依据 = 真源 `gu_39038_01.json` / `ji_23395_01.json` 内这两节点的 `external_mirror` 已变空串，**断言零放宽**，先例 `058b5f7` / `23a8467`）；排行口径见 `docs/sibling-order.spec.md` **§14**、质检证据 `docs/sibling-order.qa.md`。
- **真源写入登记（追加 · 2026-09-23 · 归 Kevin 本人 / 部分待确认）**：本行**只追加登记、不改上列各行**（上列原文一律保留）。按 `AGENTS.md` **§2.1**：**后续任何真源写入一律先备份、后登记**。写入主体 = **Kevin 本人**（**已当面认领** `ji_23395_01` 与 `pan_28504_01` 两笔；`shen_27784_01` **同窗口同形**，**尚待 Kevin 确认 = 待确认**）。窗口内被改写的真源文件（`find -newermt "2026-09-23 13:00"` 实测）：① `migrate-output/trees/shen_27784_01.json` **14:25:10** + `migrate-output/details/shen_27784_01:*` × **2**（**14:24:09 / 14:25:10**）—— **归属待确认**；② `migrate-output/trees/ji_23395_01.json` **14:28:10**（`version 64 → 67`，改动面 = **3 个节点的档案字段**：`birth_place` 由 `''` / `{}` → `{'origin_code':'230305'}`、`gender 'U' → 'F'`、`is_living` / `residence_places` 补默认值；**`child_handles` 零变化**，已由 **13:54 副本快照逐家族比对证死** ⇒ **与「子女排行」批次无关**）+ `migrate-output/details/ji_23395_01:*` × **3**（**14:26:59 / 14:27:49 / 14:28:10**）—— **Kevin 已认领**；③ `migrate-output/trees/pan_28504_01.json` **15:53:43**（**新树**）+ `migrate-output/details/pan_28504_01:*` × **1** —— **Kevin 已认领**；④ `migrate-output/collections/jiazu_assets.json` **15:53:43**（**与建树同秒**，形态上像**建树扣 9 籽**）；⑤ `config/tree-meta.json` **15:54:45**。**备份现状与本轮补救**：上述写入**开工前均无备份**（`~/jiazu-backups/` 下**无 13:00 之后新备份**）；**已由 Zang 建立只读快照** `~/jiazu-backups/2026-09-23-kevin-writes/`（含 `migrate-output/` + `config/` 全量 + `MD5-LEDGER.txt` **339 条**），关键 md5（登记时复核一致）：`ji_23395_01.json` = `34dbc5e33be5f918baf9b11f5796ce70`、`pan_28504_01.json` = `a3507e454fb36a7fba106918cbfb3b51`、`gu_39038_01.json` = `7224c15728b0fd5084141ac6c02d6483`。**口径备注（只如实描述、不加重）**：这三棵树的档案字段写入**未走计费闸门**（`jiazu_assets` 仅 **15:53** 动过一次）⇒ 形态上**像脚本 / 直接改文件**。
- **真源写入登记 · 追记（追加 · 2026-09-23 · 只追加 · 不改上列各行）**：上列「**真源写入登记**」行中的 `shen_27784_01`（`migrate-output/trees/shen_27784_01.json` **14:25:10** + `migrate-output/details/shen_27784_01:*` × **2**，**14:24:09 / 14:25:10**）**归属已由 Kevin 当面确认 = 归 Kevin 本人**；上列「**待确认**」措辞**原文保留**，其语义**自本行起被覆盖**（`AGENTS.md` §10 纪律）。⇒ 本批 **2026-09-23** 窗口内**四类写入**（`shen_27784_01` / `ji_23395_01` / `pan_28504_01` + `jiazu_assets` & `tree-meta.json` 连带变更）**现已全部认领完毕，无待确认项**；只读快照路径不变 = `~/jiazu-backups/2026-09-23-kevin-writes/`（+ `MD5-LEDGER.txt` **339** 条）。同步追记 = `docs/sibling-order.qa.md` **§8**、`docs/sibling-order.spec.md` **§15**、`docs/PENDING_DEPLOY.md` **§31-7 追记**。
- **真源写入登记 · 本批（追加 · 2026-09-24 · 归因 = **读侧 `sweep` 回写** · **只追加，不改上列各行**）**：本批「行囊（道具栏）v3–v6 + 玉归属 v6」实测**只 touch 一个真源文件**，判定 = **本批代码对真源零写入（内容零变化）**。三处读数（**2026-09-24 只读实测**）：

  | # | 读数 | 实测 |
  |---|---|---|
  | ① | 唯一被 touch 的真源文件 | `find migrate-output config -newermt "2026-09-24 00:00" -type f` = **1 条** ⇒ 仅 `migrate-output/collections/jiazu_assets.json`；**`config/**` 零触碰**、`migrate-output/trees/**` 与 `details/**` 零触碰 |
  | ② | 该文件 `mtime` | **2026-09-24 08:58:09**（同批**前次登记 = 07:42:20** ⇒ `mtime` 为**动值**，**每次读 `GET /assets/summary` 都可能移动**） |
  | ③ | 该文件**内容 `md5`** | **恒为 `9f17a77f7871584a563047c3ab45f09e`**（= 本批开局登记值，**内容零变化**） |

  - **触发方** = 读侧 `GET /assets/summary`（`lib/economy-ledger.js` / `lib/economy-ops.js` 的 `summarize` 前置于 `sweep`）⇒ **记账入口的整体回写**：**内容不变、仅 `mtime` 变**；**不是**本批代码的数据写入（本批代码改动全在 `filter` / 新增只读反查 `injectorOf`）。
  - **制度口径（承 §2.1，先例 = 2026-09-23 本区「真源写入登记」行）**：**后续本机验证优先用 `/tmp` 副本栈**（`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 钩子），**避免无谓 touch 真源**；确需对真源跑时，**先备份**（`~/jiazu-backups/<日期-说明>/`）再按本节格式登记**前后 md5**。
  - 同步登记 = `docs/PENDING_DEPLOY.md` **§32-3**（「真源零写入」块）。
- **`npm test` 实测基线（追加 · 2026-09-24 · **行囊 + 玉归属 v6 批次** · **取代上列各条读数**，上列各行原文一律保留）**：`cd /Users/kevin/bistro/jiazu && npm test` → **480 tests / 480 pass / 0 fail / 0 skipped（exit 0）**。**本数 = 收尾前读数**（含 **2 个本轮新增用例**：`lib/economy-spirit.test.js`「读口径 · 注入者反查（`injector`）」+1、`lib/assets.test.js`「`GET /assets/summary` 玉归属（v6）」+1）；`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = **29**（**未注册 = 假绿**）。⚠️ **终值以 Neng 终校复跑为准**（本手册**不推算、不预填**；若终校后回填，再追加一行）；**`npm test` 未全绿前不得打包 / 部署 / 重传**（沿用 §29-6 第 1 条门槛口径）。读数与复现证据见 `docs/PENDING_DEPLOY.md` **§32-5**。
- **真源写入登记 · 2026-09-24 追记（**归属待 Kevin 确认** · 只追加，不改上列各行）**：上列「真源写入登记 · 本批（归因 = 读侧 `sweep` 回写）」行的**两条读数在 2026-09-24 18:01 复核时点已不成立**（**原文保留**）—— 「唯一被 touch 的真源文件 = 1 条」与「内容 `md5` 恒为 `9f17a77f7871584a563047c3ab45f09e`」；本批窗口内出现一次**与本批代码无关**的运行时写入（承 `docs/PENDING_DEPLOY.md` §32-3「本节复核」块）。**Jing 收口只读实测（2026-09-24 20:30 CST）**：`find migrate-output config -newermt "2026-09-24 00:00" -type f` = **4 条** ——
  - ① `migrate-output/collections/jiazu_assets.json`：mtime **17:48:10 → 19:26:14**（`mtime` 为**动值**）、md5 **`610cc94d39feb90fedfe2f41e164f69c`**（**≠** 批次登记值 `9f17a77f7871584a563047c3ab45f09e`）；
  - ② `migrate-output/trees/gu_39038_01.json`：mtime **17:48:10**、md5 **`d3669b730b655bbf9a9bfe7f485bdcfc`**（`version 17 → 21`；与只读快照 `~/jiazu-backups/2026-09-23-kevin-writes/` 逐家族比对 = **唯一 `child_handles` 变动家族 `103f95b8792451191a492bcabff3`，9 元素集合等价、仅位次变化**）；
  - ③ `migrate-output/details/gu_39038_01:103f95b87b5a464242933ee319d5.json`：mtime **17:47:33**、md5 **`3aaf96364c9f79f9bc36fc41001b8951`**；
  - ④ `migrate-output/details/gu_39038_01:103f95b87b9a398b1289942102ec.json`：mtime **17:48:10**、md5 **`7889f0c036590ff72215dda01007092f`**；
  - 另 `config/tree-meta.json` md5 = **`e9babd74545f796242b23b21b3a5b31e`**（**不在上列 4 条内 ⇒ 本窗口零触碰**）。
  **归因 = 4 笔 `edit_fee`**（`ts` = `2026-09-24T09:47:06.672Z` / `09:47:33.235Z` / `09:48:01.371Z` / `09:48:10.293Z`；`delta.bamboos = -1`；`operator = '16601061656'`；`ref.tree_id = 'gu_39038_01'`；`desc` **逐字** = `调整排行：顾纯海 第 4 位` / `修改节点 顾清学（扣 1 片竹片）` / `修改节点 顾秀英（扣 1 片竹片）` × 2）⇒ **形态 = 经 UI / API 的编辑（走计费闸门、逐次扣 1 片竹片）**，**与本批代码归因无关**（本批**未新增任何写路径**）。**归属 = 待 Kevin 确认**（operator 手机号 `16601061656` / 角色 `chief_editor` / 昵称「季节」；**64 秒内 = 1 次拖动排行 + 3 次保存**）—— 本手册**不代裁定**；排行落点在真源侧的自证 = `docs/sibling-order.spec.md` **§17**。**备份（本轮补救）**：窗口内写入**开工前无备份**（`~/jiazu-backups/` 最新 = `2026-09-23-kevin-writes/`）⇒ **已补建只读快照** `~/jiazu-backups/2026-09-24-stage-backup/`（含 `migrate-output/` + `config/` 全量 + `MD5-LEDGER.txt` **32,671 B**，时点 **2026-09-24 18:30**）。同步登记 = `docs/PENDING_DEPLOY.md` **§32-3 复核块 + §32-8 (1)**。
- **真源写入登记 · 2026-09-24 归属确认追记（**归 Kevin 本人 · 已当面确认** · 只追加，不改上列各行）**：上列「真源写入登记 · 2026-09-24 追记」行中的 **「归属 = 待 Kevin 确认」措辞原文保留**，其语义**自本行起被覆盖**（本手册 §10 纪律；先例 = 2026-09-23 `shen_27784_01` 的「待确认 → 追记确认」两行）。**Kevin 于 2026-09-24 当面确认**：窗口内 **4 笔 `edit_fee`（`gu_39038_01`：1 次「调整排行：顾纯海 第 4 位」+ 3 次人物保存，operator `166****1656` / `chief_editor`，64 秒内）= Kevin 本人在 **5199** 上的**真实编辑**（**非脚本 / 非直改文件 / 非本批代码**）**。**必登记要素（本行定稿 · 读数均 Jing 只读实测，除注明「Kevin 给定」者）**：
  - **触发方 = 人工前端编辑会话**（H5 `5199`）；**逐笔走计费闸门**（非直改文件）。
  - **读数 ①（树档）**：`migrate-output/trees/gu_39038_01.json` `version` **17 → 21**、md5 **`7224c15728b0fd5084141ac6c02d6483`（= 2026-09-23 只读快照实测全值；Kevin 给定记法为截断形态 `d7224c15…`）→ `d3669b730b655bbf9a9bfe7f485bdcfc`**；`updated_at` = **`2026-09-24T09:48:10.294Z`**。
  - **读数 ②（树内变更面 = 3 处 · 逐字段比对实测）**：(a) `people.103f95b87b5a464242933ee319d5`（顾清学）`is_living` **新增 `false`** + `residence_places` **新增 `[]`**；(b) `people.103f95b87b9a398b1289942102ec`（顾秀英）`is_living` **`true → false`** + `death_date` **`'' → '2025'`**；(c) **`families.103f95b8792451191a492bcabff3.child_handles` 9 元素整体重排**（**集合等价**；顾纯海 `…fb261f` 由 **index 6 → index 3** = **第 7 位 → 第 4 位**，与流水 `desc` 逐字吻合）。⚠️ **易误判口径 ①**：**不得**把树内变更概括为「2 个 person 节点」—— **实为 3 处（多出 1 个 family 记录）**。
  - **读数 ③（账本文件）**：`migrate-output/collections/jiazu_assets.json` md5 **`9f17a77f7871584a563047c3ab45f09e`（批次登记值）→ `610cc94d39feb90fedfe2f41e164f69c`**（另：2026-09-23 只读快照值 = `076221b867c0c5d201361dda5cfe8791`）。
  - **读数 ④（账本流水）**：4 笔 `edit_fee` 各 **−1 竹片**；`ref.lots` **逐笔同一批次** `lot_id = 'bl_mu67o50m30bxt'`（`qty: 1`）；**`fee_refund` = 0 笔**（**2026-09-24 全天 0 笔**；**17:47–17:49 CST 窗口 0 笔** —— 两次均实测）。
  - ⚠️ **易误判口径 ②：「735 → 723」≠ 这 4 笔**。竹片批次 `bl_mu67o50m30bxt` 自 **2026-09-23 只读快照**（快照值 = **735**，实测）以来的累计消费 = **12 笔 qty=1（合计 12 片）**：**8 笔在 2026-09-23**（`13:25:32Z`–`14:01:02Z`：4 笔 `调整排行` + 4 笔 `修改节点` 沈 / 潘系列）+ **4 笔在本轮窗口**（2026-09-24 `09:47:06Z`–`09:48:10Z`）⇒ **735 − 12 = 723**（现盘 `bamboos[0].qty = 723`，实测一致）；**本轮只占 −4 片**，另 **−8 片不得记在本批头上**。
  - **结论 = 无需回滚 / 退费**：4 笔全为**走闸门的正常编辑**（逐笔扣 1 片、**零冲正**）、树内变更面自洽（2 person + 1 family）、**无越权写入 / 无绕过闸门 / 无直改文件痕迹**。**备份**：窗口内写入**开工前无备份** ⇒ **已补建只读快照** `~/jiazu-backups/2026-09-24-stage-backup/`（`MD5-LEDGER.txt` **32,671 B**，时点 **2026-09-24 18:30**）。**同步定稿** = `docs/sibling-order.spec.md` **§17**（排行落点自证）+ `docs/PENDING_DEPLOY.md` **§32-8 (1)**（§32-3 追记）。
- **`npm test` 终值基线（追加 · 2026-09-24 · **本批终校** · **取代上条「480 系列 · 收尾前读数」**，上列各行原文一律保留）**：`cd /Users/kevin/bistro/jiazu && npm test` → **480 tests / 480 pass / 0 fail / 0 skipped（exit 0）**（**两次读数同值**：**Neng 终校复跑 2026-09-24 20:18 CST** + **Jing 收口复跑 2026-09-24 20:31:17–20:31:19 CST**；TAP **逐字** = `1..480` / `# tests 480` / `# pass 480` / `# fail 0` / `# cancelled 0` / `# skipped 0`；`duration_ms` = **2129.6**（Neng）/ **2363.5**（Jing））。**`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = 29**（**未注册 = 假绿**）；另 **`cd frontend && npm run type-check`（`vue-tsc --noEmit`）= EXIT 0**（Neng 实测）。⇒ 上条「⚠️ **终值以 Neng 终校复跑为准**」的**挂账自本行起关闭**（**两项读数同值、无第三值**）；**`npm test` 全绿 = 本批交付门槛，现已达标**（仍以**冻结时点终校**为准）。读数与复现证据见 `docs/PENDING_DEPLOY.md` **§32-5 + §32-8 (2)**。
- **`npm test` 读数（本批 · 图标批 · 2026-09-24）**：`cd /Users/kevin/bistro/jiazu && npm test` → **480 tests / 480 pass / 0 fail / 0 skipped（exit 0）**（**本批零新增测试文件**）；`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = **29**（**未注册 = 假绿**）；另 `cd frontend && npm run type-check`（`vue-tsc --noEmit`）= **EXIT 0**。**取代上列各条读数**（上列各行原文一律保留）。读数与产物 / 风险登记见 `docs/economy.spec.md` **§14-10 / §14-11**。
- **`npm test` 读数（V3 特效批 · 2026-09-25）**：`cd /Users/kevin/bistro/jiazu && npm test` → **480 tests / 480 pass / 0 fail / 0 skipped（exit 0）**（**本批零新增测试文件**）；**`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = 29**（**未注册 = 假绿**；本环节独立复算一致）；另 `cd frontend && npm run type-check`（`vue-tsc --noEmit`）= **EXIT 0**。⚠️ **本行为引用终校读数，未复跑、不自报**（同体例 = `docs/PENDING_DEPLOY.md` §32-5 (2)）。读数与口径 / 已接受差异登记见 `docs/economy.spec.md` **§14-12**；上云动作与判据见 `docs/PENDING_DEPLOY.md` **§32-9**；产物判据（小程序 `asset-inventory.wxss` 的 `@keyframes` / `animation` 计数 = 0）见 §14-12 E2。**取代上列各条读数**（上列各行原文一律保留）。

- **真源写入登记 · 追记（**追加 · 2026-09-24 · 归 Kevin 本人** · 只追加，不改上列各行）**：2026-09-24 **CST 21:52:50–21:55:12** 真源 `migrate-output/collections/jiazu_assets.json` **被写入** —— **归属 = 归 Kevin 本人**（他在 **5199** 上**实操测行囊的合成 / 分解**）。**Jing 只读实测读数列（逐字引用 · 不得改写 / 不得推算）**：
  - **账本 5 笔新流水**（operator `166****1656` / `chief_editor`）：`jade_decompose` `2026-09-24T13:52:50.251Z`（ref `jd_mu592iykburg5`）· `jade_synth` `13:52:55.606Z` · `jade_synth` `13:53:00.217Z` · `jade_synth` `13:53:02.950Z` · `jade_decompose` `13:55:12.053Z`（ref `jd_mu9mnogl1oi2x`）；
  - **该用户 `txs` 149 → 154**；**字段变化** = `seeds` 批次 **1 → 3**、`jades` **11 → 12**；
  - **文件内容 `md5`** = **`610cc94d39feb90fedfe2f41e164f69c`（18:30 快照）→ `6977ad9a5a713d1951453208a09671d0`**（size **106872 B**、mtime **Sep 24 21:55**）；同窗口 `migrate-output/collections/jiazu_market.json` mtime **21:54**（**同源 = 市集页访问**）；
  - **结论 = 归 Kevin 本人、无需回滚 / 退费**；**口径备注**：「读 `GET /assets/summary` 触发 `sweep` 回写」**只能解释 `mtime` 变、不能解释内容变** —— 本次**内容变已由上述 5 笔流水完全解释**。
  - **同步登记** = `docs/PENDING_DEPLOY.md` **§32-8 追加追记 · (3)**（本行所引落点）。

- **`npm test` 读数（本批 · **兰帖/行囊/图标 + 好友域 + 邀请链路**批 · 2026-09-25）**：`cd /Users/kevin/bistro/jiazu && npm test` → **496 tests / 496 pass / 0 fail / 0 skipped（exit 0）**（**实现单实测读数**；本行为**引用登记、未复跑、不自报**，体例同 §7 上方 2026-09-25 V3 批行）。⚠️ **注册差量（**Jing 落笔时自算** · 2026-09-25 · **本手册不沿用任何他人转述值**）**：根 `package.json` 的 `scripts.test` **注册 = 30 项**，磁盘 `cloudfunctions/compat-api/lib/*.test.js` **= 32 个** ⇒ **差 2 个未注册 = `lib/friends.test.js` / `lib/invite.test.js`**（**全仓其它目录 `*.test.js` = 0 个** ⇒ 差异全部落在 `lib/` 内；**注册端由另一条改单在同步**）。**注册端同步已发生（Jing 复核 · 2026-09-25 13:40:16 后）**：`package.json` 实测 `mtime` = **2026-09-25 13:40:16**，**复算注册 = 32 项 = 磁盘 = 32 个、未注册 = 0** ⇒ **差异已关闭**（**本行两读数并存**：落笔时 **30 / 32** → 复核后 **32 / 32**；**口径不变 = 以对应命令的实际输出为准**，**执行时仍须自行重算**）。⇒ **未注册 = 假绿**（本节既有口径，承 `docs/PENDING_DEPLOY.md` §14-4 / §16-1）：**注册补齐并复跑前，上述 496 读数不得当作全量覆盖证据**；**`scripts.test` 注册数与磁盘文件数一律以对应命令的实际输出为准**（本行两项数值为落笔时实测，**随后续改单必然变动**）。⚠️ **终值以 Neng 终校复跑为准**；**`npm test` 未全绿前不得打包 / 部署 / 重传**（承 §29-6 第 1 条门槛口径）。读数与口径落点 = `docs/friend-domain.spec.md` **§12-1**（新文件须注册）；上云动作与判据 = `docs/PENDING_DEPLOY.md` **§35-1**（前置门槛）/ **§35-6**（冒烟）。
- **真源写入登记 · 本批（追加 · 2026-09-25 · **归属 = 待 Kevin 确认** · 只追加，不改上列各行）**：本批窗口内 `migrate-output/collections/jiazu_assets.json` **内容被写入**（**非只走 `mtime`** —— 与前两次「读侧 `sweep` 回写」登记形态**不同**）。**Jing 只读实测读数（逐列）**：
  - **写入时点 = 2026-09-25 12:57:56**（**属派单给定事实**）；**Jing 实测 `mtime` = `2026-09-25 13:32:33`**（`mtime` 为**动值** —— 每次读 `GET /assets/summary` 都可能移动，同 §2.1 上列两次登记的形态）；`size` = **109351 B**。
  - **内容 `md5` = `a221831f17a394cfb5a17ce9c2cb23ef`（前）→ `594d25dfea0f78a17c86851e86401169`（后 · 现盘实测 · 写后复核同值）**。
  - **判定初步 = 非本批代码所写**：该文件内 **`grep -c "scroll_fragments"` = 0**、**`grep -c "scrolls"` = 0**（Jing 现盘实测）⇒ **不含本批兰帖 / 好友域新账本字段** ⇒ **不是本批新增写路径（`lib/friends.js` / `lib/invite.js`）所写**（本批新路径的字段面为好友关系与邀请记录，落点在两新集合）。
  - **触发方 = 待定**（**两个子代理各自报出该写入、均声明非自己写入** ⇒ 属**第三方触发**）；**形态备注（只如实描述、不加重）**：`3100` 端口**有 node 在监听**（Jing 实测 `lsof -nP -iTCP:3100 -sTCP:LISTEN` = `node` PID 69131）⇒ 本机数据层在跑，形似**经 UI / API 的既有链路写入** —— **属初步形态描述，不构成归属裁定**。
  - **归属 = 待 Kevin 确认**（**本手册不代裁定**；先例 = 2026-09-23 `shen_27784_01` / 2026-09-24 `gu_39038_01` 的「待确认 → 追记确认」两行体例）。
  - **备份（本轮补救）**：窗口内写入**开工前无备份**（`~/jiazu-backups/` 最新 = `2026-09-24-stage-backup/`）⇒ **已补建只读快照** `~/jiazu-backups/2026-09-25-stage-backup/`（含 `migrate-output/` + `config/` 全量 + `MD5-LEDGER.txt`）；**条目数 = 342**（与快照内实际文件数 **342** 逐条一致、唯一路径数 **342**、ledger **33091 B**）；**快照内该文件 md5 = `594d25dfea0f78a17c86851e86401169` = 现盘一致** ⇒ 快照时点 **≥** 写入时点、可作回滚基线。**原文件未改 / 未移 / 未删**（`cp -a` 只读拷贝，源侧零写入）。
  - **同步登记** = `docs/PENDING_DEPLOY.md` **§35-3**。

- **真源写入登记 · 2026-09-25 归属确认追记（**归 Kevin 本人 · 已当面确认** · 只追加，不改上列各行）**：上列「真源写入登记 · 本批（追加 · 2026-09-25 · **归属 = 待 Kevin 确认**）」行中的 **「归属 = 待 Kevin 确认」措辞原文保留**，其语义**自本行起被覆盖**（本手册 §10 纪律；先例 = 2026-09-23 `shen_27784_01` / 2026-09-24 `gu_39038_01` 的「待确认 → 追记确认」两行）。**Kevin 于 2026-09-25 当面确认：该笔真源写入 = 本人所为**。**必登记要素（本行定稿 · 读数均 Jing 只读实测，除注明「派单给定」者）**：
  - **写入时点 = 2026-09-25 12:57:56 CST**（派单给定）；**文件 = `migrate-output/collections/jiazu_assets.json`**；**内容 `md5` = `a221831f17a394cfb5a17ce9c2cb23ef`（前）→ `594d25dfea0f78a17c86851e86401169`（后 · 现盘复核同值）**。
  - **归属（定稿）= 归 Kevin 本人 · 已当面确认（2026-09-25）**。
  - **判定依据 = 非本批代码所写**：该文件内 `scroll_fragments` / `scrolls` 两串 **grep 均 0 命中**（现盘实测）⇒ 不含本批兰帖 / 好友域新账本字段 ⇒ **不是本批新增写路径（`lib/friends.js` / `lib/invite.js`）所写**。
  - **改动面特征（流水实测 · 窗口 = 2026-09-25 12:40–13:10 CST · 对象 = 该用户 `txs`）**：**实测命中 1 笔（非「未找到」）**，逐笔逐字如下 —— `id` = `tx_mughpdj2qfzbt` · `ts` = `2026-09-25T04:57:56.413Z`（= **12:57:56.413 CST**，**与写入时点同秒**）· `type` = `jade_synth` · `desc` 逐字 = `合成石榴籽玉` · `delta` = `{seeds: -999, jades: 1}` · `ref` = `{}`（空）· **`operator` = 该记录内无此键**（该用户 `txs` 各条键集 = `delta` / `desc` / `id` / `ref` / `ts` / `type`）⇒ **形态 = 经 UI / API 既有链路的合成操作**（扣 999 籽、得 1 玉），**非脚本 / 非直改文件 / 非本批代码**。
  - **快照（本轮补救）**：`~/jiazu-backups/2026-09-25-stage-backup/`（`migrate-output/` + `config/` 全量 + `MD5-LEDGER.txt` **33091 B**）；**现盘实测**：ledger **342 行** = **非 ledger 文件数 342**（ledger **不含自身**）⇒ **磁盘 `find -type f` = 343**（含 ledger 自身），与 §35-3 登记的「条目数 = 342」**一致**；**快照内该文件 md5 = `594d25dfea0f78a17c86851e86401169` = 现盘一致** ⇒ 快照时点 **≥** 写入时点、可作回滚基线；**原文件未改 / 未移 / 未删**（源侧只读 `cp -a`）。
  - **结论 = 归 Kevin 本人、无需回滚 / 退费**（正常合成操作；零越权写入 / 零绕过闸门 / 零直改文件痕迹）。**同步登记** = `docs/PENDING_DEPLOY.md` **§35-3 追记**。
- **`npm test` 读数（本批 · **好友域 + 邀请链路 + 批 3 任务中心**批 · 2026-09-25 · **只追加，不改上列各行**）**：`cd /Users/kevin/bistro/jiazu && npm test` → **579 tests / 579 pass / 0 fail / 0 skipped（exit 0）**（本读数由**独立复检单**与**主代理**各跑一次，**三方一致**）；**`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = 34**（**未注册 = 假绿**）；**读数一律以对应命令的实际输出为准，本手册不推算、不预填**（注册数与磁盘文件数随后续改单必然变动，执行时自行重算；口径承 `docs/PENDING_DEPLOY.md` §35-1 末条）。
- **真源写入登记 · 本批（追加 · 2026-09-25 · **零写入** · 只追加，不改上列各行）**：本批**真源零写入**，三处独立读数并列（**均实测**）：① **独立复检单**：`migrate-output` **339 文件** + `config` **3 文件** 于**开工**时取 md5 台账，**收尾逐字节一致**（`cmp` 无差异）；② **实现单**：`migrate-output` + `config` **全量 342 文件聚合 md5 前后同值**；③ **主代理亲跑**：`migrate-output/collections/jiazu_assets.json` md5 **前后同值 = `594d25dfea0f78a17c86851e86401169`**。**写入仅发生在 `/tmp` 副本栈**（`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 钩子指向 `/tmp` 副本）⇒ **真源侧零写入**。**本批无待确认归属项**（本批唯一一次真源写入已由 **Kevin 当面认领**，并已在本手册 §7 上方「真源写入登记 · 2026-09-25 归属确认追记（归 Kevin 本人 · 已当面确认）」行登记）。**落点 = `docs/PENDING_DEPLOY.md` §35-9 / §35-3**（§35-9 = 批 3 上云动作清单落点；§35-3 = 本批真源零写入块）。

---

## 8. 部署口径（只做本地阶段）

- 所有上云动作**登记在 `docs/PENDING_DEPLOY.md`**（P0–P5 代码批次、纯数据批次、每批的命令 / 判据 / 冒烟步骤）；执行时**逐项照做**，不合并、不跳过。
- 典型三件套：**云函数重打包 + `tcb fn deploy`**（`cloudbaserc.json` 已配 `functionRoot=./cloudfunctions/deploy`、`envId`）→ **前端 `build:h5`（带 `VITE_API_BASE`）+ `tcb hosting deploy`** → **`build:mp-weixin` + 开发者工具上传**；纯数据批次只需重跑 `node scripts/upload-migrated-to-cloudbase.mjs` **加上手工删旧详情键**。
- 云函数环境变量：`MASTER_TREE_ID=zhonghua`、`COMPAT_SOURCE=cloud`（`cloudbaserc.json` / `docs/PENDING_DEPLOY.md` §1）。
- 上传脚本 `COLLECTIONS` 现为 **12 项**；新增集合必须同步该列表，否则云端对应路由首写报错（§11-2）。
- ⚠️ **部署阻塞项（未解除前不得上云）**：`jiazu_assets` 为全体用户共用单文档（`_id='global'`）+ 仅进程内锁 → 云端多实例可丢更新 / 双花；**部署前必须重构为「每手机号一文档 + `version` 乐观锁 CAS 重试」**（`docs/PENDING_DEPLOY.md` §7-7，跨批次登记见 §10-2）——`jiazu_spirit` / `jiazu_market` / `jiazu_messages` / `jiazu_ops_logs` 同形态，一并评估。
- `auth-server/`、`scripts/*` 一次性修复脚本、`migrate-output/` 中间报告、`/tmp/jiazu-*` **明确不进云**（§6 / §7-6 / §12-7 等「不需要上云」小节）。

---

## 9. 常见任务速查

| 任务 | 入口 |
|---|---|
| 新建家族树 | 首页「＋ 新建家族树」（仅总编辑）→ `POST /api/admin/create-tree`；`tree_id` = **姓氏拼音_码点_两位序号**，注音**无兜底**（取不到拼音一律 **400 抱错**，绝不生成 `shi_*` 伪前缀）——口径见 `docs/tree-id.spec.md` |
| 树内加人 / 改挂 / 续编 / 加配偶 | 人物档案底部「谱系管理」（`README.md` §树内操作）；批量添加子孙走 `POST /admin/chain-append-batch`（世本 + 祖谱，≤10 代 / 单名 ≤20 字） |
| 批量导入旧谱 | `node scripts/gedcom-import.mjs <tree_id> <input.ged>`（离线写树 JSON + 详情，独立管线） |
| 数据体检 / 修复 | `node scripts/audit-person-names.mjs`（体检）→ `node scripts/fix-person-names.mjs [--apply]`；性别污染 `fix-zhonghua-gender.mjs`；`tree_id` 注音迁移 `migrate-tree-id-pinyin.mjs`（默认 dry-run、幂等） |
| 世本清理 | `docs/zhonghua-cleanup-2026-09.spec.md`（作业依据 / 前后 md5 / 备份）+ `docs/zhonghua-cleanup-candidates-2026-09.md`（清单，附录 A = 云端待删 `_id`） |
| 写前端接口封装 | `frontend/src/business/api.ts` 新增函数 → `business/index.ts` 转出 → 类型进 `business/types.ts` |
| 查端口 / 起服务 | `../ctrl/PORTS.md` 或 ctrl 面板（sid `jiazu-api` 3100、`jiazu` 5199；批量启动按表序，数据层先起） |
| **查排行口径** | 「子女标签可拖曳排序（排行）」= `docs/sibling-order.spec.md`（**排行真源 = `family.child_handles[]` 数组位次 · 不新增字段**；路由 `POST /admin/sibling-reorder` 收 `{tree_id, family_handle, person_handle, child_handles[]}`）；**计费 1 片 / 次**、`Tx.type='edit_fee'`（复用既有枚举）、**no-op 0 片不写库** —— 计费口径见 `docs/economy-fee.spec.md` **§3-1 #36 / §15**；上云动作与判据 = `docs/PENDING_DEPLOY.md` **§31** |
| **查排行 · 终校收口与质检证据（追加 · 2026-09-23）** | 状态 = **已终校（Neng 复检通过 · 2026-09-23）** ⇒ `docs/sibling-order.spec.md` **§14**（收口索引 + 终值基线 `478 / 478 / 0 / 0 exit 0`）· **§3-1-1**（`person_handle` = **被移动的那个子女**；原 `personHandle` prop 已删除）· **§9-2-1**（二次确认层 = **自绘** z-index 1010，`uni.showModal` 因 `.uni-modal` 999 < `.som-mask` 1000 **已弃用**；no-op **双路径** + 两条文案）；三轮证据 = **`docs/sibling-order.qa.md`**；`mirror-count` 点名重同步 = **本手册 §7 追加行（本回合未落盘 —— 内容见 `docs/sibling-order.spec.md` §14「落盘状态」）** |
| **查排行 · 追记（追加 · 2026-09-23）** | 上行为过时标注：「§7 追加行未落盘」**已不成立** —— 终值基线行 = `AGENTS.md` **第 213 行**、**真源写入登记行 = 第 214 行**，均已落盘（`git diff --numstat AGENTS.md` = **13 / 0**（本行落盘后实测；本行落盘前 = **12 / 0**），**删除行 = 0**，纯追加）；上列「未落盘」措辞**原文保留**，语义**自本行起被覆盖**（`AGENTS.md` §10 纪律）。同步追记 = `docs/sibling-order.spec.md` §14「落盘状态追记」与 `docs/PENDING_DEPLOY.md` §31-7 追记 |
| 查部署判据 | `docs/PENDING_DEPLOY.md` 对应批次小节的 `grep -c` 重打包判据 + 「部署后冒烟验证（按序做）」 |
| 改「发源地」字段 | `docs/geo-origin.spec.md`（口径真源）；结构化真源 = `origin_code`（**读侧判据一律 `(entry.origin_code ?? '') === ''`** —— 缺字段与空串同判，裁定见 §7-3 修正），`origin` 是**写时由名称表反查生成**的软冗余（**禁前端手改**）；写路径 = `PUT /tree-meta` 白名单 + 建树 / 建祖谱 / 立支复制 / 拆树置空**五处必须同步**；真源 `config/geo-divisions.json` + 反查模块 `lib/geo.js`（**静态 JSON import 被 esbuild 内联 ⇒ 无需随云函数包发布 `config/`**，见 §5-6R） |
| 查「始祖真源 / 认祖只读」口径 | `docs/founder-attach.spec.md` **§9**（始祖真源反转 v2 · **变体 A = 始祖真身在家族树**；R1 单一真源 / R2 真身可写 / R2b 取消空白占位锁 / R3 方向无关只读（例外 = 出生地·居住地，契约 v2 C6）/**R6** 世数下钻真身）；波及 `docs/clan-tree.spec.md` **§11**、`docs/branch-clan-ops.spec.md` **§16**（R4 宗谱登记镜像通用化 / R5 立支·汇宗连带 / R7 存量季·顾两条链就地反转）；上云动作面与判据 = `docs/PENDING_DEPLOY.md` **§29** |
| **查行囊（道具栏）口径（追加 · 2026-09-24）** | **现行** = `docs/economy.spec.md` **§14**（`§13` = v1 / v2 旧口径，标题下已标「**已被取代 · 原文保留**」，逐条对照见 **§14-7**）：**6 × 6 = 36 栏位**（`SLOT_COUNT` 36 / `SLOT_COLUMNS` 6）· 1 格 = 1 道具换算（`SEEDS_PER_ITEM` 9999 / `JADES_PER_ITEM` 1 / `BAMBOO_PIECES_PER_ITEM` 100 / `FRAGMENTS_PER_ITEM` 10）· **碎片占 1 格**（角标 = 实际个数）· **余数占格**（零头行已取消）· 默认序 **竹简 → 玉 → 籽 → 碎片** · 溢出（> 36）**不入格** + 逐类提示行（玉 `背包空间不足，无法合成` / 其它 `空间不足，无法持有`）· 属性提示层 **`z-index: 1010`**（层内【合成】/【分解】须先 `closeTip()`）· 拖曳 = **插入式重排、纯内存无持久化**（刷新 / 重进回默认序；**tabBar 切回保留内存序 = 已裁定可接受**；命中判定 **H5 `getBoundingClientRect()` / 小程序 `boundingClientRect()` 不得混用**）；上云动作与判据 = `docs/PENDING_DEPLOY.md` **§32** |
| **查玉归属与注入者口径（追加 · 2026-09-24）** | `docs/spirit-domain.spec.md` **§14**：**用户面** `GET /assets/summary` **只显未镶嵌**（`jades_total` 同口径）/ **管理面** `GET /admin/assets/user`（`chief_editor`）**全量原始记录**（含 `mounted_tree_id`，两端口径**不得互相套用**）/ `GET /spirit` 出参 **`injector` 三态**（可点档案卡 · 「注入者无本树节点」·「注入者信息不可考」）/ **手机号不下发**（昵称缺失只出脱敏串）/ 已镶嵌玉 = **永久占用、到期不影响**（展示「永久有效（镶嵌即永久占用）」）；上云动作与判据 = `docs/PENDING_DEPLOY.md` **§32** |
| **查家谱 tab 口径（追加 · 2026-09-24）** | `docs/home-sort-search.spec.md` **§11**：家谱 tab = **tabBar 页** `pages/family/index`（标题「我的家谱」）**单真源组件化** —— 已登录已绑定 ⇒ **整页只渲染同一份** `components/tree-hall/tree-hall.vue`（`pages/hall/index.vue` 变**薄壳 · 23 行**；**禁止复制第二份模板**）；prop = `tree-id` / `sync-nav-title`（家谱 tab 传 **false** ⇒ 标题保持「我的家谱」，`pages.json` 不动）；移除 hero 卡（含发源地）/ 身份节点卡 / 导航格 / 收录人物统计（**两组空态文案逐字保留**）；**易混澄清**：与同册 **§10「首页列表 tab（家族 / 祖谱）」不是同一个 tab**；受影响既有口径 = `docs/geo-origin.spec.md` §7-5 **D3** / `docs/person-places.spec.md` **D3**（家族页 hero 发源地，**旧行原文保留**）；部署面 = `docs/PENDING_DEPLOY.md` **§32-2 追加行** |
| **查行囊提示层定位 / 命中坐标 / D-01（追加 · 2026-09-24）** | `docs/economy.spec.md` **§14-9**：**定位** = 末两行（`TIP_ABOVE_ROW` = 4）上摆、其余下摆，**零间隙**（下摆 `tip.top = cell.bottom` / 上摆 `tip.bottom = cell.top`）、**padding-box 原点修正**（H5 `clientTop` / 小程序恒 `0`）、`top` **3 位小数**、实测高度**只校正一次**（**绝不递归自我重排**）；阈值 `TIP_FIT_EPS` **0.5** / `TIP_UNION_TOL` **2**；**两端口径不得混用** = H5 **原生事件 + `getBoundingClientRect()`** / 小程序 **uni touch + `boundingClientRect()`**（H5 若走 uni 包装触摸会恒差 **44px** 头部高）；**D-01 = 已知可接受行为（低危非阻塞 · 本轮不修）** = 上摆分支「格中心 → 层内按钮」的**直线斜插**中途离开联合区域 ⇒ 层关闭并改指相邻格（未覆盖带宽约 **4px**），**自然手势 24/24 段全通、真实点击成功**；Neng-6 复检读数（下摆 **0.0000px** / 上摆残余 **+0.0156px** / 交界扫描无真实空洞）见 **§14-9-2** |
| **查排行落点（追加 · 2026-09-24）** | `docs/sibling-order.spec.md` **§17**：以 **2026-09-24 17:47 CST 真源内一次真实排行写入**自证「**排行真源 = `family.child_handles[]` 数组位次 · 不新增字段**」—— 家族 `103f95b8792451191a492bcabff3` 的 `child_handles` **9 元素集合等价、仅位次变化**（**纯排列**）；顾纯海 **第 7 位 → 第 4 位**，与流水 `desc`（`调整排行：顾纯海 第 4 位`）逐字吻合；**该笔走计费闸门**（`type='edit_fee'`、−1 竹片），与 2026-09-23 那批「**未走闸门**」的档案字段写入**形态不同** |

---

## 10. 本手册的维护与引用纪律

- 本文件由 **Jing（制度员）** 维护；口径变更须**先有裁定**（Kevin / Zang），再落本文件，**不改代码**。
- 引用本手册做质检判据时：**只引用能落到真实文件 / 行号的口径**；本文件未写的事实**不得据本文件推定**。
- 新增事实只有两个来源：**真实文件内容**或**实测输出**（命令 + 时点）。**不得编数字、不得凭记忆写端口**（端口以 `ctrl/PORTS.md` 为准）。
- 与 `ctrl/PORTS.md` 的分工：**本文件管 jiazu 仓内**的 AI 权限、真源与数据流向、spec 纪律、验证与部署口径；**端口数值与面板运维制度一律以 `ctrl/PORTS.md` 为准**，本文件只做引用与登记。

---

## 勘误追加区（**只追加 · 不上移 · 不删行 · 2026-09-25**）

- **勘误 1（文案统一 · Kevin 指令 2026-09-25）**：本手册 **§0 文档索引**的「道具栏（背包）UI 口径」行（**第 22 行**）现记默认序 = 竹简 → 石榴籽玉 → **标准石榴籽** → 碎片。**名称口径已裁定统一为「石榴籽」**（`标准石榴籽` → `石榴籽`；**石榴籽玉 / 石榴籽碎片 / 竹简 / 兰帖一律不动**）；**单一来源 = `frontend/src/business/inventory.ts` 的 `seed` 显示名**（**以 `grep` 的实际输出为准** —— 本轮实测该单点**仍为旧名** ⇒ 按 §0「代码即事实」，**第 22 行在代码同批改名之前维持现名**；**改名同批执行时**，该行改后须**同格保一括注**，形如 **石榴籽（原称 标准石榴籽）**）。**登记落点** = `docs/economy.spec.md` **§16-3「文案统一登记（2026-09-25）」**（本册现行区 11 处落点清单在该节）；**已标「已被取代 · 原文保留」的历史区旧名一律保留、不改**（`docs/economy.spec.md` §13 全节，含该册第 794 行一格）。
- **勘误 2（数值）**：`docs/economy.spec.md` **§15-2 / §15-4** 的 **9 / 10 / 10 / 9** 已由该册 **§16-1**（**§15-2 / §15-4 数值勘误 · Zang 裁定 2026-09-25**）取代为 **99 / 100 / 100 / 99**（`SCROLL_FRAGMENT_CAP` / `SCROLL_FRAGMENT_SYNTH_THRESHOLD` / `SCROLL_PIECES_PER_SCROLL` / `SCROLL_DECOMPOSE_REFUND`；**§15 旧行原文保留 + 标『已取代』**）。**后端 `SCROLL_PIECES_PER_SCROLL` 与前端 `SCROLL_PIECES_PER_ITEM` 两处不得混用**（前者 = 真源导出名；后者**仅作前端常量名**，在后端 `cloudfunctions/**` 中**不存在**）。好友域侧同标一份 = `docs/friend-domain.spec.md` **§17-8**。
- **本节维护纪律**：本「勘误追加区」为**只追加**区（**不上移、不删行、不改写上文任何行**）；**本手册维护纪律以 §10 为准**。
- **勘误 3（行囊文案 · **本行即执行落笔** · 2026-09-25）**：**勘误 1 的挂账自本行起关闭** —— 其单一来源（`frontend/src/business/inventory.ts` 的 `seed` 显示名）**已实测改为 `石榴籽`**（Jing 现盘只读实测：`grep -rn "标准石榴籽" frontend/src cloudfunctions/compat-api` ⇒ **0 命中** ⇒ **现行区无旧名**）⇒ 按 §0「代码即事实」，本手册 **§0 文档索引「道具栏（背包）UI 口径」行（第 22 行）**的默认序**已就地改写为** `竹简 → 石榴籽玉 → **石榴籽（原称 标准石榴籽）** → 碎片`（**同格保括注**；该行**其余文字一字未改、未删行、未上移**）。**勘误 1 原文保留**，其前提句「第 22 行在代码同批改名之前维持现名」的**前置条件已消失**。**口径不变的两项**：① 已标「已被取代 · 原文保留」的**历史区旧名一律保留、不改**（`docs/economy.spec.md` §13 全节）；② `石榴籽玉` / `石榴籽碎片` / `竹简` / `兰帖` **一字不动**。同步落点 = `docs/economy.spec.md` **§16-3** / `docs/PENDING_DEPLOY.md` **§34-3 · §35-1**。
