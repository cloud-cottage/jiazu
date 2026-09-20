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
| 质检汇编 | `docs/*.qa.md` | `branch-clan-ops` / `chain-batch-append` / `home-sort-search` 的**历史质检证据** |
| 候选/执行清单 | `docs/zhonghua-cleanup-candidates-2026-09.md` | 世本清理逐节点清单 + 附录 A（上云待删详情 `_id`） |
| 端口唯一真源 | `../ctrl/PORTS.md` | bistro 工作台端口口径（jiazu 条目见其 §2） |

**真源优先级（冲突时的裁决顺序）**

1. **代码即事实**：`cloudfunctions/compat-api/**` 是运行时真源；文档与它不一致时**先如实登记差异**，不得反过来照文档改代码。
2. **spec 是口径权威**：`docs/*.spec.md` 为规格真源，实现必须与其一致；spec 之间冲突时**以被引用方明示的优先声明为准**（例：`docs/marriage.spec.md` 头部声明与 `docs/data-model.md` / `docs/permission-tier.spec.md` 冲突时以本文件为准并同步修订彼文件）。
3. **数值 / 字面纪律**：正则、选项名、错误文案、`tree_id` 字面值**逐字取自实现与实测**；**不得自行改口径、不得编数字**（`docs/tree-id.spec.md` §0）。
4. **历史版本行不机械改写**：spec 的旧行、旧批次段落**保留原文**，新口径以**新增章节 + 「已作废 / 已取代」标注**落地（例：`docs/PENDING_DEPLOY.md` §23 取代 §21 的卡片显示口径，**§21 正文不改写**、字段降级为保留字段）。
5. **`docs/*.qa.md` 是历史质检证据，不得回改**；新结论以新章节追加。
6. **端口口径不看文档记忆**：一律以 `ctrl/PORTS.md` + 运行时 `../ctrl/index.js` 的 `services` 表为准。

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
| 查部署判据 | `docs/PENDING_DEPLOY.md` 对应批次小节的 `grep -c` 重打包判据 + 「部署后冒烟验证（按序做）」 |
| 改「发源地」字段 | `docs/geo-origin.spec.md`（口径真源）；结构化真源 = `origin_code`（**读侧判据一律 `(entry.origin_code ?? '') === ''`** —— 缺字段与空串同判，裁定见 §7-3 修正），`origin` 是**写时由名称表反查生成**的软冗余（**禁前端手改**）；写路径 = `PUT /tree-meta` 白名单 + 建树 / 建祖谱 / 立支复制 / 拆树置空**五处必须同步**；真源 `config/geo-divisions.json` + 反查模块 `lib/geo.js`（**静态 JSON import 被 esbuild 内联 ⇒ 无需随云函数包发布 `config/`**，见 §5-6R） |
| 查「始祖真源 / 认祖只读」口径 | `docs/founder-attach.spec.md` **§9**（始祖真源反转 v2 · **变体 A = 始祖真身在家族树**；R1 单一真源 / R2 真身可写 / R2b 取消空白占位锁 / R3 方向无关只读（例外 = 出生地·居住地，契约 v2 C6）/**R6** 世数下钻真身）；波及 `docs/clan-tree.spec.md` **§11**、`docs/branch-clan-ops.spec.md` **§16**（R4 宗谱登记镜像通用化 / R5 立支·汇宗连带 / R7 存量季·顾两条链就地反转）；上云动作面与判据 = `docs/PENDING_DEPLOY.md` **§29** |

---

## 10. 本手册的维护与引用纪律

- 本文件由 **Jing（制度员）** 维护；口径变更须**先有裁定**（Kevin / Zang），再落本文件，**不改代码**。
- 引用本手册做质检判据时：**只引用能落到真实文件 / 行号的口径**；本文件未写的事实**不得据本文件推定**。
- 新增事实只有两个来源：**真实文件内容**或**实测输出**（命令 + 时点）。**不得编数字、不得凭记忆写端口**（端口以 `ctrl/PORTS.md` 为准）。
- 与 `ctrl/PORTS.md` 的分工：**本文件管 jiazu 仓内**的 AI 权限、真源与数据流向、spec 纪律、验证与部署口径；**端口数值与面板运维制度一律以 `ctrl/PORTS.md` 为准**，本文件只做引用与登记。
