# 待部署清单（本地已完成 · 云端未部署）

> 约定：当前阶段**只做本地**。所有"已本地验证、需要上云"的动作按顺序累积在本文件里，
> 日后一次性执行；每项都注明**为什么需要**与**本地验证证据**，避免部署时靠回忆。
> 最后更新：**P4 批次（运营侧）** —— 云函数 `compat-api` 新增 `GET /messages` / `POST /messages/read`（**需登录**）/
> `POST /admin/assets/grant` / `GET /admin/assets/logs` / `GET /admin/assets/user`（**限 `chief_editor`**）/
> `POST /account/delete`（**需登录**）**六条路由**（模块 `lib/economy-ops.js` + 集合 `jiazu_messages` / `jiazu_ops_logs`
> —— 两集合**已并入上传脚本 `COLLECTIONS`，现 12 项**），前端落点为资产页「消息提醒」区 + 后台「资产运维」区 +
> 「我的」页消息中心 / 注销入口（**`build:h5` 与 `build:mp-weixin` 都必须重跑**）。
> ⚠️ **本批必须一次性重跑 esbuild 重打包**：`cloudfunctions/deploy/compat-api/index.js` **仍是旧产物**，
> 已落后 **P0–P4 全部改动**（P0 三条 / P2 五条 / P3 七条 / P4 六条 = **21 条新路由**，含 `lib/store.js` 缓存顺序修复）。
> 详见 P0 → §7、P2 → §8、P3 → §9、**P4 → §11**；跨批次已知限制与已修复项见 §10。
> **2026-09-18 追加（本批 → §17）**：总谱【**批量添加子孙**】+ 移除【同世并列】弹窗 + **缺陷 A（no-op 编辑不扣费）** + **缺陷 B（单树写一致性）** ——
> 云函数 `compat-api` **新增 1 条路由** `POST /admin/chain-append-batch`，并变更 `lib/economy-fee.js` / `lib/store.js` / `lib/tree-write.js` / `index.js`
> （**必须重打包，否则云端新路由 404**）；前端 H5 批量面板 / 删弹窗 / dirty 比对 / 首页 tab·人数 / 窄屏样式（**必须重打包**）；
> **CloudBase 集合与云端数据：无变化**。规格见 `docs/chain-batch-append.spec.md`，质检汇编见 `docs/chain-batch-append.qa.md`。
> **2026-09-19 追加（本批 → §18）**：镜像节点**口径 A**「树内保持可见 · 点开即真身」（规格 `docs/marriage.spec.md` **§9-7** 九条 + **§9-3 / §9-4** 修订 + **§10** 前端落点）——
> **纯前端改动**（`frontend/src/business/cross-tree.ts` / `components/tree-pedigree/tree-pedigree.vue` / `components/person-archive/person-archive.vue`）：
> `build:h5` + hosting 部署、小程序同批重打；**云函数路由 / CloudBase 集合 / 云端数据三项均为「本轮无」**（见 §18-0）。
> 本轮实施已完成：**已实施 + 真机质检通过（2026-09-19）**（证据见 §18-1「本地验证证据」），本清单只登记上云动作。
> **2026-09-19 追加（本批 → §19）**：**跨树嫁娶配偶发现通道**（口径 A+B；规格 `docs/marriage.spec.md` **§9-8** 八条 + **§10** 后端 / 前端落点；
> 权限登记 `docs/permission-tier.spec.md` **§11**「定点例外」）——
> 云函数 `compat-api` **新增 1 条路由** `GET /search/marriage-candidates`（**必须重打包，否则云端 404**）；前端娶入 / 嫁出弹窗改调该通道 + 新增「按全局编号指定」输入框（**必须重打包**）；
> **CloudBase 集合与云端数据：无变化**（§19-0 第 2–3 行均为「无」）。本轮实施已完成：**已实施 + 冒烟 / 单测通过（2026-09-19）**（证据见 §19-1 / §19-4「本地验证证据」），本清单只登记上云动作。
> **2026-09-19 追加（本批 → §21）**：**首页卡片人数单列镜像**（规格 `docs/marriage.spec.md` **§9-4 修订** + **§11-4**）——
> 云函数 `compat-api` 的 `GET /tree/rank` **新增出参字段 `mirror_count`**（全树 `external_mirror === 'true'` 节点数；**必须重打包**，否则云端无该字段）；
> 首页家族 / 祖谱卡片文案改「N 人（含外树 M）」（**必须重打包**）；**CloudBase 集合与云端数据：无变化**（§21-2 / §21-3 均为「无」）；
> **`mirror_count` 只用于展示，排序归一化仍用 `person_count`**。
> **2026-09-19 追加（本批 → §22）**：**家族树共享选择器（展示层）+ uni-app H5 遮罩关闭修复**（规格 `docs/marriage.spec.md` **§9-9** / **§9-10**）——
> 新增共享组件 `frontend/src/components/tree-picker/tree-picker.vue`（折叠态恒一行 44px + 展开态独立覆盖层 z-index 1200）并接入 `person-archive.vue` 三处（嫁出 / 娶入、认祖、挂载祖谱）；
> 同批把全仓 **11 处**「点遮罩关闭」由 `@click.self` 改为「遮罩 `@click` + 内层面板 `@click.stop`」**成对写法**（`grep '@click.self'` = **0**）。
> **云函数 compat-api：无新增路由 / 无改动；CloudBase 集合：无；云端数据：无**（§22-0）；**前端 H5 必须重打包**（hosting 部署）、小程序同批重打包上传。
> **2026-09-19 追加（本批 → §23）**：**家族人数口径修订**（规格 `docs/home-sort-search.spec.md` **§10-6** 七条全文 + 本册 §23；权限侧补注 `docs/permission-tier.spec.md` **§5 末条**）——
> 云函数 `compat-api` 的 `GET /tree/rank` **`person_count` 语义变更**（**字段名 / 形状 / 类型不变** ⇒ **必须重打包**，否则云端**不报错、只静默返旧口径数值**）；首页家族 / 祖谱卡片文案改「**N 人**」+ 家族页（`hall`）树图统计栏改为同一口径（**H5 必须重打包 + hosting 部署**）；**CloudBase 集合与云端数据：无变化**（§23-2 / §23-3 均为「无」）。
> **取代 §21 的卡片显示口径**（旧「N 人（含外树 M）」单列镜像显示已作废；**§21 正文不改写**，其 `mirror_count` 降级为**保留字段、不再参与展示**）。
> 本批状态：**已实施（本地已验证，2026-09-19（Zang 汇总））** —— 实施与本地验证已完成（证据见 §23-1）；上云动作仍未执行；本节只登记上云动作，**不表示已实现 / 已通过 / 已部署**。
> **2026-09-20 追加（本批 → §24）**：**家族树「发源地」结构化（三级行政区划 + 台湾省补全 + 海外单列）**（规格 `docs/geo-origin.spec.md`；口径来源 = Kevin 四问裁定 + Zang 契约 v1）——
> 云函数 `compat-api` **新增结构化字段 `origin_code`**（`PUT /tree-meta` 白名单 + 建树 / 建祖谱落库 + 立支复制 / 拆树置空共 5 处，**必须重打包**，否则云端不认 `origin_code` 且不会做「未知码 → 400」）；
> **云端数据：有变更**（**纯数据批次**：`config/tree-meta.json` 存量 `origin` → `origin_code` + 展示串重算，§8 逐树映射 17 行，含 md5 前后登记位）；**CloudBase 集合：无变化**（§24-2「无」）；
> 前端 H5 / 小程序**必须重打包**（建树弹窗 + 家族树编辑 + 祖谱编辑三处自由文本 → 三级级联菜单；数据集随包发布、**零请求**）。
> **2026-09-23 追加（本批 → §31）**：**子女标签可拖曳排序（排行）**（规格 `docs/sibling-order.spec.md`；计费口径 = `docs/economy-fee.spec.md` §3-1 #36 / **§15**）——
> 云函数 `compat-api` **新增 1 条写路由** `POST /admin/sibling-reorder`（**必须重打包，否则云端 404**）；前端 H5 / 小程序**必须重打包**（人物档案子女区新增「调整排行」入口 + 新建次级模态框 `components/sibling-order-modal/`）；
> **CloudBase 集合与云端数据：本轮无**（不新建集合、`COLLECTIONS` 保持 **12 项**；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰）。
> 本批状态：**实现已落盘（Kong 实测 · 工作区在途未提交）· 待 Neng 终校**；`npm test` 当前 **478 / 476 / 2（红）**（2 红 = 预存在的 `mirror-count` 真源漂移，见 §31-5）⇒ **本清单只登记上云动作，不表示已通过 / 已部署**。

---

## 0. 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | 重打包 + `tcb fn deploy`：**必须重打**（`cloudfunctions/deploy/compat-api/index.js` 目前仍是旧产物、已落后 P0–P4 全部改动 —— 见 §7-1 / §8-1 / §9-1 / **§11-1**） | 无 |
| 2 | CloudBase 集合 | 新建 `jiazu_join_requests`、`jiazu_marriage_requests`、`jiazu_founder_requests`、`jiazu_clan_requests`（+ `jiazu_person_details.tree_id` 索引） | 需 CB_ENV/CB_KEY |
| 3 | 云端数据 | 重跑迁移上传（树 JSON / 详情 / tree-meta） | 需 CB_ENV/CB_KEY |
| 4 | 前端 H5 / 小程序 | `build:h5`（带 `VITE_API_BASE`）+ hosting 部署；`build:mp-weixin` + 开发者工具上传 | 需确认 hosting 目标与域名 |

> ⚠️ 本批前端产物**必须重打包**（`frontend/dist/` 现存的是上一版产物）：不重打包会缺
> 「世本关键节点标注 / 祖谱删除入口收紧 / 跨树改父·删除节点前端调用」等本批改动。见 §4 末尾。
> ⚠️ **2026-09-18 追加**：首页**家族 / 祖谱列表 tab** + 卡片**人数标签** + 排序行**窄屏样式**（见 **§4-1**）
> 同属**纯前端**改动，**随同一次前端重打包发布**，不需要任何后端 / 集合 / 云端数据动作。

---

## 1. 云函数 compat-api（**主要一项**）

```bash
# ① 重打包（仓库根；产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

- 打包已完成：产物 104.4kb（`grep -c "admin/reparent"` = 1）。
- 云函数环境变量（cloudbaserc.json 已含）：`MASTER_TREE_ID=zhonghua`、`COMPAT_SOURCE=cloud`。

### 本批待上云的新增/变更（均已在本地验证）

| 路由 / 能力 | 变更内容 | 本地验证 |
|---|---|---|
| **跨树嫁娶（嫁出/娶入/绝婚/合离）** | **新增**（`docs/marriage.spec.md`）：`POST /marriage-request`、`POST /admin/approve-marriage`、`POST /admin/reject-marriage`、`GET /admin/marriage-requests`、`POST /admin/marry-end`；跨树事务写入 `store.updateTrees()`（顺序写 + 失败回滚）；新增结构字段 `external_marriage_id/_no/_date/_created_by/_end_kind/_end_date/_end_by` + `external_mirror` | 单测 9 项（合计 45/45）+ E2E **25/25**（副本数据，真源 md5 未变） |
| **`POST /admin/add-child`（跨树子女归属）** | **新增**（`docs/marriage.spec.md` §7-4，`lib/child-write.js`）：目标家庭的父（或父空缺时的母）为外树镜像 → 子女经 `updateTrees()` 建到**父真身所在树**的真实家族，本树只留镜像子女（`external_mirror='true'` + `external_link_type='child'`）；跨树「选人挂接」把节点整体搬到真身树（换 handle + 重分配编号 + 详情随迁）；普通家庭沿用老口径。前端 `addChildNode()` 改走该路由 | 单测 12 项（合计 **66/66**）+ 副本 E2E（shen→ji，真源 md5 未变） |
| `POST /admin/reparent` | **新增**：改挂父节点（编号 `0054`/`I0054`/handle；槽位按新父性别；原家族空则清理；成环保护；总谱世数 delta 平移）。**本批加跨树参数 `new_parent_tree_id`**（`lib/tree-write.js` §跨家族树迁移）：新父编号属于**别的家族树**时，本人及全部后代整体迁入目标树 —— `store.updateTrees([源树, 目标树])` 单事务 + 失败双侧回滚；handle 沿用（24 位全局唯一 → 外部镜像指针不悬空）、`gramps_id` 按目标树编号段重分配、连接子孙的家族随迁、留在源树的配偶槽位清空、目标树里指向迁入节点的镜像清理（有本树婚姻家庭的只清指针）；详情文档随迁（`tree_id:handle` → 目标树新 key）；拒绝：源/目标是总谱、迁移范围含始祖/镜像、超世代上限 | 单测 45/45（基础）+ **跨树 13 项**（`reparent-cross.test.js`，含真源 md5 断言）→ 合计 **150/150** + E2E 17/17 + UI 实测（迁移后提示「已迁移到 X（编号已重新分配，共 N 人）」） |
| **`POST /admin/delete-node`（删除节点）** | **新增**（`lib/tree-write.js` §删除节点）：`{ tree_id, person_handle, mode: 'subtree' \| 'promote', dry_run?, confirm_count? }`；两段式 —— 先 `dry_run:true` 只算不写（`people_count`/`families_count`/`promoted` 清单），再由前端强确认带 `confirm_count` 正式提交；拒绝：总谱、始祖节点、镜像节点、未登录 401、**待删子树内任何节点被其它家族树引用 → 409**（绝不级联改对方树，拒绝时两棵树都不写） | 单测 17 项（`node-delete.test.js`，含真源 md5 断言）→ 合计 **150/150** + 前端 UI 实测（dry_run → 确认两步） |
| **`POST /admin/reset-founder`（重置始祖）** | **新增**（`lib/founder-attach.js` §重置始祖）：清空本树始祖登记（`tree-meta` 的 `founder_handle`/`founder_gramps_id`/`founder_name` 删除 + `founder_state='none'`）→ 本树回到「无始祖」态，可在**任意节点**重新「认祖」；只写 tree-meta（走 store 护栏），树 JSON/详情不动；拒绝：总谱 400 / 当前始祖为镜像 400（须先解除挂载）/ 无该树 404 / 未登录 401。**它同时是下表「无始祖态认祖」的入口**（重置后才允许任意节点发起） | 单测 7 项（`reset-founder.test.js`，含真源 md5 断言）+ 临时实例 HTTP 探针 4/4（401/400 总谱/400 镜像/200 正常，副本 meta 回读一致，真源 md5 未变） |
| **认祖 `POST /admin/founder-request` + `/admin/decide-founder` `/admin/attach-founder` `/admin/detach-founder`** | **新增 / 泛化**（`lib/founder-attach.js`、`docs/founder-attach.spec.md`、`docs/clan-tree.spec.md`）：请求体新增 **`target_tree_id`**（旧字段 `master_tree_id` 兼容；祖谱缺省 = `zhonghua`，普通树必填祖谱 id，全都缺 → 400「请选择认祖目标」）+ `target_handle`；目标层级硬口径：**祖谱 → 只可挂中华世本（master）**、**普通家族树 → 只能挂祖谱（clan），直挂世本 400**（`assertAttachTarget`）；**「无始祖」态口径**：`tree-meta.founder_state='none'`（如刚 `reset-founder`）时 **该树任意节点都可发起认祖**，审批通过即把该节点**回写为始祖**（落 `founder_handle`/`founder_gramps_id`/`founder_name` 并删除 `founder_state`）；已登记的树仍只允许始祖位置节点发起；每树仅 1 个 pending | 单测 19 + 7 项（`founder-attach` / `founder-reattach`）→ 合计 **150/150**；HTTP 探针同 reset-founder 行 |
| 祖谱接口 `POST /admin/clan-request`、`GET /admin/clan-requests`、`POST /admin/decide-clan`、`GET /admin/clans`、`GET /admin/clan-info` | **新增**（`lib/clan.js`、`docs/clan-tree.spec.md`）：建谱申请 → chief 审批通过建 `kind='clan'` 树并写始祖镜像；祖谱清单（认祖目标选择器用，可按姓过滤）；祖谱页数据（顶端镜像链 / 自有世代 / 支系入口列表）。写集合 **`jiazu_clan_requests`**（见 §2） | **暂无独立单测文件**（祖谱→世本 / 家族树→祖谱 的 target 校验被 `founder-attach.test.js` 覆盖，含在 **150/150**）；建谱申请/审批为本地 HTTP + UI 实测 |
| `POST /admin/add-spouse` | 同树配偶：补空位 / 满则新建家族（再婚） | 单测 + E2E 12/12 + 真数据已使用（风娲） |
| `POST /admin/chain-append` | 总谱续编：新建/挂接、`extraAttributes`、随父姓、聚合虚位节点守卫 | E2E 通过 |
| `POST /admin/create-tree` | 新建家族树：`nextTreeId` + 建树费钩子（¥9.90）+ tree-meta 落库 | E2E 17/17 |
| `GET /tree/rank` / 读路径 | 节点级可见分层（guest 藏尾 18 世等）已在 auth-server 与 compat-api 两处一致 | E2E 13/13（若 auth-server 不上云，只需 compat-api 版） |
| **世数 0 = 原始节点** | `getChainInfo.onChain`、`nextChainGen` 允许 0、挂接守卫改判 `onChain` | 单测 45/45 |
| 人物写路径 | 生卒/健在（`birth_date`/`death_date`/`is_living`）、称号三字段（`号/封号/谥号`）、`inherit_surname_from` 随父姓 | 单测 + GEDCOM 往返 0 差异 |
| `nextGrampsId` 修复 | 扫 people+families 并沿用补零宽度（避免新建家族撞号 F1） | 单测回归 |
| 家族/详情写入 | `createFamily`/`updateFamily`/`saveDetail` 与 `COMPAT_OUT_DIR` 测试钩子 | 副本 E2E |

> ⚠️ 云端写路径与本地差异：本地是 `migrate-output/*.json`，云上是**云存储 trees/*.json + 集合 `jiazu_person_details`**。
> 部署后必须验证「写一个人 → 云上读回」（见 §5 冒烟）。

---

## 2. CloudBase 集合

- **新建 `jiazu_join_requests`**（加入申请-审批制，本地已实施）：`scripts/upload-migrated-to-cloudbase.mjs` 的
  `COLLECTIONS` 列表里**还没有**它 → 需补进列表（或控制台手建），否则云端 `/join-request` 写入报错。
- **新建 `jiazu_marriage_requests`**（跨树嫁娶申请-审批，本地已实施）→ 同上，需补进 `COLLECTIONS`，否则云端 `/marriage-request` 写入报错。
- **新建 `jiazu_founder_requests`**（始祖挂载·认祖申请-审批，见 `docs/founder-attach.spec.md`）→ 同上，需补进
  `COLLECTIONS`，否则云端 `/admin/founder-request` 写入报错。
- **新建 `jiazu_clan_requests`**（建谱申请-审批，见 `docs/clan-tree.spec.md` §4-4；字段 `surname` / `tree_id?` /
  `master_handle` / `master_name` / `clan_title` / `requested_by` / `status` / `decided_by` / `reject_reason` /
  `created_at` / `decided_at`）→ **`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 里当前只有 7 个基础集合**
  （`jiazu_person_details` / `jiazu_tree_meta` / `jiazu_users` / `jiazu_wallets` / `jiazu_anchors` /
  `jiazu_leave_requests` / `jiazu_sms_codes`），四个申请集合**全都要补进去**（join / marriage / founder / clan），
  或用控制台手建，否则云端对应路由写入报错。
- 建议顺带加索引：`jiazu_person_details.tree_id`（按树取详情用 `where({tree_id})`）。
- 既有集合（脚本已覆盖）：`jiazu_person_details`、`jiazu_tree_meta`、`jiazu_users`、`jiazu_wallets`、`jiazu_anchors`、`jiazu_leave_requests`、`jiazu_sms_codes`。

---

## 3. 云端数据（重跑迁移上传）

```bash
CB_ENV=liwu-d8gek6jjdab1d087c CB_KEY=<云开发 API Key> \
  node scripts/upload-migrated-to-cloudbase.mjs
```

本批数据变化（本地 `migrate-output/` 为真源）：

| 数据 | 变化 | 说明 |
|---|---|---|
| `trees/zhonghua.json` | **105 人 / 49 家族**（原 104 / 48）；新增原始节点 | 新增 `风华胥` I0104（姓风名华胥，女）+ 家族 F0048（母 风华胥 / 子 风伏羲）；`0052` 的 `parent_family` 指向 F0048 |
| `details/zhonghua:6dfb6ba8dc8a57625a115395.json` | 新增 | `external_chain_gen=0`（原始节点）+ 备注 |
| 其余树 | 无结构变化 | — |
| `config/tree-meta.json` | 本次未改 | 若要重传以本地为准 |

> 备注：本地写入前后备份 `/tmp/jiazu-bak-<ts>`（rolling，可回溯）；真源 md5 已记录在对应 E2E 输出里。

---

## 4. 前端 H5

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5
# 产物 frontend/dist/build/h5 → 按现有 hosting 流程部署（tcb hosting deploy <dir> -e liwu-d8gek6jjdab1d087c）
```

本批前端变更（均已本地验证）：

| 区域 | 变更 |
|---|---|
| 总谱首页 | **单一「纵向世系树」视图**（原「📜 时间轴」模式已下线，`shiben-timeline` 唯一视图 = 纵向树图）：默认纵向、隐藏跨树登记标记、整树展开（按卡高铺开世代行距）、＋/− 缩放锁死滚轮、滚轮改为平移（纵向上下 / 横向左右 + 边界夹取）、⟳ 复位视野 |
| **总谱关键节点标注（本批恢复）** | 时间轴里原有的 `KEY_NODES` 锚点改由纵向树图承载：命中节点卡片内加一行 **「★标签」**（人文始祖 / 五帝 / 周文王 / 周公·元圣 / 鲁国始君 / 季氏得姓始祖 / 季孙氏宗主），卡面文字用主题色，hover 摘要也带标签；统计栏显示「关键节点 N」。实现 = `tree-pedigree` 新增**可选 prop `keyMarkers`**（缺省空对象 → 其它复用页面行为不变），`shiben-timeline` 按 handle 传入 |
| 人物名称 | 统一「姓+名+封号+谥号+号」；称号多值时用 `·` 连接（卡片/档案/时间轴 tag）；带称号卡宽放宽 216px |
| 编辑表单 | 字段顺序 姓 → 名 → 性别 → 封号 → 谥号 → 号；**新增「父节点编号（改挂上级）」** + 当前父母提示；目标编号属于**别的家族树** → 走跨树迁移（`new_parent_tree_id`），成功后档案提示「已迁移到 <树>（编号已重新分配，共 N 人）」并刷新树图 |
| **人物档案（危险区·祖谱，本批收紧）** | 祖谱（`tree-meta.kind='clan'`）内 **「🗑 删除节点」仅总编 `chief_editor` 可见**（普通家族树维持 `canEdit` 口径不变：登录 + 非 guest + 非总谱 + 非始祖/镜像）；祖谱危险区同屏显示风险提示「删支系节点风险较高——祖谱自有支系常是下级普通家族树的认祖落点」 |
| 人物档案（删除节点） | 删除走 `POST /admin/delete-node` 两段式：选模式 → `dry_run`（只算不写，显示人数/家族数）→ 强确认带 `confirm_count` → 正式提交；被其它家族树引用时后端 409、前端提示先解引用 |
| 总谱 | 世数 0 显示「原始」（根卡/卡片/时间轴）；续编入口支持原始节点 |
| 加子女 | `addChildNode()` 改走 `POST /admin/add-child`；跨树婚姻家庭的子女自动落到父真身树，提示改为「…已建到「<树>」，本树保留镜像子女」 |
| 默认后端 | vite 默认代理 → `3100` compat-api（`dev:h5:legacy` 回旧链路 → 本地 auth-server `5197` / Gramps-Web `5198`，**2026-09 由 3000/8000 迁来**） |
| 人物档案（始祖行） | 始祖节点操作区新增 **「🔁 重置始祖」**（`isFounderNode && !founderMirror && canEdit`）：确认弹窗 → `POST /admin/reset-founder` → 刷新 tree-meta，页面立即变「无始祖」态并出现「⛩ 认祖」入口 |

### 4-1 本批追加（2026-09-18）：首页家族 / 祖谱列表 tab + 卡片人数标签 + 排序行窄屏样式

**为什么需要**

- 首页从「单列表」改为**两个列表 tab**（**家族** | **祖谱**，默认家族；祖谱档只按综合分排序、无排序切换），
  卡片新增**人数标签**（数据来自既有 `GET /tree/rank` 的 `person_count`，**不新增网络请求**），
  排序行加**窄屏单行约束**（`nowrap` + `min-height: 36px` + `@media (max-width: 370px)`），
  修掉 320px 下排序 pill 换行导致「切 tab 时列表跳动 18px」的缺陷。
- 改动**全部落在** `frontend/src/pages/index/index.vue`（工作区已改、**未提交**；`git status --short` 仅此一文件）。
- **本批后端零改动**（无新增路由、无出参变更、无集合变更）→ **`compat-api` 不需要为此单独重打包**；
  但**前端必须重打包**：不重打包则线上仍是「无 tab、无人数标签、窄屏排序行换行」的旧首页。
- 口径定稿见 `docs/home-sort-search.spec.md` **§3-5 / §10**；两轮真机质检收口见 `docs/home-sort-search.qa.md` **§15**。

**具体命令**（写法同 §1 / §7-4 / §9-4 / §11-4；纯前端，无新增集合 / 无云端数据动作）

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5      # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c
npm run build:mp-weixin                                        # 产物交微信开发者工具上传
```

**本地验证证据**（两轮独立真机质检；原档 `/tmp/jiazu_qa_report.md`（第一轮）、`/tmp/jiazu_qa_round2.md`（第二轮））

- **四档宽度实测（320 / 360 / 375 / 414）**：家族档与祖谱档 `.sort-bar` **行高均为 36px（差 0）**；三颗排序 pill **恒单行**；
  `documentElement.scrollWidth == innerWidth`（**无横向溢出**）；tab 组与 pill 组间距 **+22 ~ +68px**（不重叠）；字号 ≤370px 走 12px、>370px 走 13px。
- **祖谱顺序 = 综合分独立复算**：列表内极值归一化，`[秦氏, 顾氏, 季氏]` ↔ `1.0 / 0.406486 / 0.4`，与 DOM 逐位一致。
- **人数标签 = `person_count`**：家族 5 卡（90/23/19/11/0 人）、祖谱 3 卡（4/2/2 人），每卡均有标签，逐值相等。
- **零新增请求**：切 tab 与点三颗 pill 增量 = **0 fetch + 0 XHR**（含阳性对照）。
- **回归**：`npx vue-tsc --noEmit` **exit 0**；家族档三档排序与 HEAD 版排序逻辑抽纯 node 脚本喂同一快照 → **三档序列逐位相同**。
- **本批真源零改动**：`config/tree-meta.json` 与 `migrate-output/**` 未被本批触碰（质检期间的真源写入全部归因于用户自己的并发录入 + 质检探针的 dev 登录，见 qa §15.7）。
- 截图留档：`/tmp/jiazu_home_family_tab.png`、`/tmp/jiazu_home_clan_tab.png`、`/tmp/jiazu_home_320_family.png`、`/tmp/jiazu_home_320_clan.png`。

**阻塞点**

- H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §4 / §11-4）。
- **不阻塞本清单其它项**：本批**不新增集合**（`COLLECTIONS` 保持 §11-2 的 12 项）、**不改云端数据**（§3 / §16-3 不新增条目）、
  **不动编号计数器**（`jiazu_id_seq` 不变）；可与 §16 的前端重打包**同一次发布**。

> 遗留缺口（如实登记，未覆盖项不得当作已覆盖）：370/371px 断点边界、<320px 极窄视宽、真实移动端 UA / 真机字体未测；
> 空态两档文案为**响应拦截模拟空库**验证（真源真空库未验证）。详见 `docs/home-sort-search.qa.md` §15.8。

---

## 5. 部署后冒烟验证（按序做）

1. `curl -s -X POST <fn>/admin/reparent -H 'Authorization: Bearer <chief>' ...` → 400/403（说明路由已上线）；
2. 云端读：`GET /people/?profile=all`（`X-Tree-Id: zhonghua`）→ 105 人、含 `风华胥`（`external_chain_gen=0`）；
3. 云端写：网页上给某人加配偶 / 改父 → 云上读回一致（验证云存储 + 集合双写）；
4. 前端：`/zhonghua` 时间轴根卡显示「风华胥｜原始」；树图根卡「风华胥／原始」→「风伏羲／第1世」；
5. 权限：普通用户对总谱改父 → 403；未登录 → 401。

---

## 6. 明确**不需要**上云的东西

- `auth-server/`（本地遗留链路 → Gramps-Web，本地端口 `5197` → `5198`）：**不进云**，云上由 `compat-api` 承担；
- `scripts/*` 里的一次性修复脚本（`fix-zhonghua-gender.mjs`、`fix-person-names.mjs`、`audit-person-names.mjs`）与 E2E 脚本：离线工具，只在需要时本地跑；
- `/tmp/jiazu-*`（E2E 数据副本、备份）：临时产物。

---

## 7. P0 批次（资产账本内核）

> 经济系统 **P0（资产账本内核）**：新增资产只读（`/assets/summary`、`/assets/expiring`）与签到（`/assets/signin`）
> 三个账号级接口 + 集合 `jiazu_assets`；真源 `migrate-output/` **未动**。
> 落地依据 `docs/economy.spec.md` §4-1 / §6-1 / §6-2；本地验证 = 单测 **173/173** 通过，
> 真源 md5 在实施与测试前后**逐字节未变**。

### 7-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包**（`cloudfunctions/deploy/compat-api/index.js` 仍是旧产物）+ `tcb fn deploy` | 无 |
| 2 | CloudBase 集合 | 新建 `jiazu_assets` + 并入脚本 `COLLECTIONS` 列表 | 需 CB_ENV/CB_KEY |
| 3 | 云端数据 | **无需重跑**（本批无树 / 详情数据变化） | — |
| 4 | 前端 H5 | `build:h5`（带 `VITE_API_BASE`）+ hosting 部署 | 需确认 hosting 目标与域名 |
| **⚠️ 5** | **资产账本并发模型**（`jiazu_assets` 单文档 `_id='global'`） | **部署前必须重构为「每手机号一文档 + `version` 乐观锁 CAS 重试」**（总监 2026-09-16 拍板：本地阶段暂不改） | **⚠️ 部署阻塞项 —— 见 §7-7** |

> ⚠️ 与 §1 同理：本批不进包 = 云端 `/assets/*` 全部 404。见 §7-1。
> ⚠️ **本批另有一项部署阻塞项（先看这个）**：`jiazu_assets` 是**全体用户共用的单文档**（`_id='global'`）、写入只有**进程内**锁 → **云端多实例并发可丢更新 / 双花**。**部署前必须重构为「每手机号一文档 + `version` 乐观锁 CAS 重试」，否则视为带缺陷上线。**详见 §7-7。

### 7-1 云函数 compat-api（**本批必须重打包**）

本批新增三条路由，**均为账号级、要求登录**（未登录 401；不依赖 `X-Tree-Id`，故挂在 `index.js` 树编辑闸门之前）：

| 路由 | 说明 |
|---|---|
| `GET /assets/summary` | 资产总览（碎片 / 籽 / 竹片 / 玉 / 最近流水 / **`signin_date`**），入口先 `sweep` 惰性结算过期批次 |
| `GET /assets/expiring` | 即将过期批次（`days?`，默认 30） |
| `POST /assets/signin` | 每日签到（北京时间自然日 +1 碎片，满 10 自动合成；同日重复 → 409「今日已签到」） |

新增模块 **`cloudfunctions/compat-api/lib/economy-ledger.js`**（账本内核：`sweep` / `summarize` / `expiringItems` / 签到写入）。

```bash
# ① 重打包（仓库根；产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

> ⚠️ **当前 `cloudfunctions/deploy/compat-api/index.js` 是旧产物，未含本批三条路由** → 必须重跑上面的
> esbuild 重打包，再执行 `tcb fn deploy`；否则云端 `/assets/summary`、`/assets/expiring`、`/assets/signin` 全部 404。

### 7-2 CloudBase 集合

- **新建 `jiazu_assets`**：资产账本，**单文档 `_id = 'global'`**，`sql` 结构 = `users` 映射
  （`<手机号>` → `{ fragments, seeds, bamboos, jades, txs, signin_date }`，见 `docs/economy.spec.md` §4-1）。
- **并入 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 列表**：该列表现为 **7 个基础集合**
  （`jiazu_person_details` / `jiazu_tree_meta` / `jiazu_users` / `jiazu_wallets` / `jiazu_anchors` /
  `jiazu_leave_requests` / `jiazu_sms_codes`），本批需**补上 `jiazu_assets`**，否则云端账本读写报错；也可控制台手建。
- **本批次后续还会新增**：`jiazu_spirit` / `jiazu_market` / `jiazu_messages` / `jiazu_ops_logs` —— **P2–P4 落地时一并补进同一列表**。

### 7-3 云端数据

- **本批无树 / 详情数据变化**：真源 `migrate-output/` 在实施与测试前后 **md5 逐字节未变**。
- **无需重跑数据上传**（§3 的 `node scripts/upload-migrated-to-cloudbase.mjs` 不在本批范围）。

### 7-4 前端 H5

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5
# 产物 frontend/dist/build/h5 → 按现有 hosting 流程部署（tcb hosting deploy <dir> -e liwu-d8gek6jjdab1d087c）
```

本批前端变更（均已本地验证）：

| 区域 | 变更 |
|---|---|
| 新增页 | `pages/assets/index`（我的资产：四类资产 + 每日签到 + 即将过期；`frontend/src/pages/assets/index.vue`） |
| 「我的」页 | 新增「我的资产」入口（`pages/mine/index.vue` → `/pages/assets/index`） |
| 接口封装 | `frontend/src/business/api.ts` 新增三个封装 `fetchAssetsSummary` / `fetchAssetsExpiring` / `postSignin` 与类型 `AssetsSummary`（含 `signin_date`）/ `ExpiringAsset` / `SigninResult` |

### 7-5 部署后冒烟验证（按序做）

1. 未登录访 `/assets/summary` → **401**；
2. 登录后 `GET /assets/summary` → 200，含 `fragments` / `seeds_total` / `bamboos_total_pieces` / `jades` / **`signin_date`**；
3. `POST /assets/signin` 首次 → 200、碎片 **+1**（满 10 自动合成 1 颗籽）；**同日再调 → 409「今日已签到」**；
4. 前端资产页可打开且数值与接口一致（`signin_date` 为空串 → 可签到；等于今日 → 显示「今日已签到」）。

### 7-6 明确**不需要**上云的东西

- 本批单测文件（`cloudfunctions/compat-api/*.test.js` 等）：离线运行，不进云；
- `/tmp/jiazu-*` 下的 E2E 数据副本：临时产物。

### 7-7 ⚠️ 部署阻塞项：`jiazu_assets` 单文档并发模型（P0 已知限制 · 部署前必须重构）

> **结论：本节是本批次唯一的「部署阻塞项」。不完成重构，本批不得上云**（或必须明确限定 `compat-api` 以**单实例**运行，且不得靠自动扩缩容）。

**现状（本地已实现，代码即事实）**

- 集合 `jiazu_assets` 是**全体用户共用单文档**（`_id = 'global'`）：所有用户的 `fragments` / `seeds` / `bamboos` / `jades` / `txs` / `signin_date` 都内嵌在**同一份文档**的 `users` 映射里（`docs/economy.spec.md` §4-1）。
- 每次写入 = **读整份文档 → 在内存副本上改 → 整份回写一次** `colSet`（`lib/economy-ledger.js` 的 `withAssets`）；串行化**只有进程内的 `assetsLocks` 队列**（同一个 Node 实例内按手机号排队）。

**为什么是阻塞项（不做会发生什么）**

- 云端 `compat-api` 可以水平多实例：两个实例并发处理请求（不同用户、甚至同一用户）时，各自 `colGet` 到**同一份快照**、各自改内存副本、再各自整体 `colSet` → **后写者整体覆盖前者的全部写入**。
- 落到本批三条路由的具体后果：**丢更新** —— 已扣减的批次复活、已写流水消失、`signin_date` 回退（可重复签到）；**双花** —— 同一批籽被两个实例各扣一次，两边业务都返回成功。
- 本地单实例下不会发生，**单测 173/173 全绿不能证明云端安全**；这是存储形态问题，不是测试覆盖问题。

**重构目标（部署前必须完成）**

1. **每手机号一文档**：`jiazu_assets` 的文档 `_id` 由 `'global'` 改为**手机号**（并发面从「全体用户」缩到「同一用户」）。
2. **`version` 乐观锁 + CAS 重试**：文档带 `version` 字段；写入协议 = 「读（含 `version`）→ 改 → 条件更新 `where({ _id, version: 读到的值 })` 且 `version + 1`」；条件不命中（被他人改过）→ **重读重试**（有限次 + 退避）。
3. **余额校验必须在 CAS 成功的那次读内完成**：重试后重新校验并重新走 FIFO，**绝不基于陈旧快照扣减**（否则重试也可能透支）。
4. 对外不变：路由、出参、唯一写入路径（§5-7-1）与文案**均不改**，重构**只动存储形态与写入协议**（`lib/economy-ledger.js` 内部 + 集合 `_id` 形态）。
5. 重构后补并发用例：同一手机号并发签到 / 并发扣费 → 只成功一次、无负值、无重复流水、无 `qty = 0` 残留。

**登记与状态**

- 依据 `docs/economy.spec.md` §4-1 与 **§5-7 第 5 条**（口径唯一真源，本文件只是落地清单）。
- **总监 2026-09-16 拍板：本轮（本地阶段）暂不改，登记为部署前必须重构项。**
- 上云前自检：若 `jiazu_assets` 仍是 `_id='global'`，**本批次视为未就绪**。

---

## 8. P2 批次（时流子域）

> 经济系统 **P2（时流子域）**：石榴籽玉的**合成 / 分解 / 镶嵌**（凹槽永久占用、不可逆）→ **玉露灵泽蓄能** →
> **灵气状态机四态**（`inactive` / `active` / `buffer` / `expired`，惰性结算、不建定时任务）；落点依据
> `docs/spirit-domain.spec.md` §5 / §6 / §7 / §12，真源 `migrate-output/` **未动**。
> 本地验证 = 测试套件 **237 → 237**（纯追加注册、全绿）、子域单测 **43 例**（`cloudfunctions/compat-api/lib/economy-spirit.test.js`）、
> 独立质检（Neng）覆盖 **22 个边界用例**（合成阈值 / 叠加顺延 / 缓冲与失效 / 权限放开）；真源 md5 在实施与测试前后**逐字节未变**。

### 8-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包**（`cloudfunctions/deploy/compat-api/index.js` 不含本批 5 条路由）+ `tcb fn deploy` | 无 |
| 2 | CloudBase 集合 | 新建 `jiazu_spirit`（**已并入脚本 `COLLECTIONS`**） | 需 CB_ENV/CB_KEY |
| 3 | 云端数据 | **无需重跑**（本批无树 / 详情 / tree-meta 数据变化） | — |
| 4 | 前端产物 | `build:h5`（带 `VITE_API_BASE`）+ hosting 部署；`build:mp-weixin` + 开发者工具上传 | 需确认 hosting 目标与域名 |

> ⚠️ 与 §1 / §7 同理：**本批必须重跑 esbuild 重打包**；不重打包 = 云端 `/spirit`、`/spirit/charge`、
> `/spirit/mount-jade`、`/assets/synthesize-jade`、`/assets/decompose-jade` 全部 404。见 §8-1。
> ⚠️ 本批**不改** §7-7 登记的 `jiazu_assets` 单文档并发模型（仍为部署阻塞项）；跨批次口径见 §10-2。

### 8-1 云函数 compat-api（**本批必须重打包**）

本批新增 5 条路由，**全部注册在 `index.js` 树编辑闸门（`缺少 X-Tree-Id`）之前**（账号级 / 无树头的请求不能被闸门先 400 拦掉）：

| 路由 | 鉴权 | 说明 |
|---|---|---|
| `GET /spirit` | **guest 可读** | 无 `Bearer` → **200 摘要**（不 401）：灵气状态 / 到期日 / 缓冲截止 / 五档位 `plans`；`tree_id` **必填**（缺 → 400，树不存在 → 404）；`logs` 流水仅该树成员可见（guest / 登录非成员 `logs = []` + `logs_notice`） |
| `POST /spirit/charge` | 已登录（未登录 **401**；**无 403 档**） | 玉露灵泽蓄能：五档位实价 **1 / 29 / 109 / 149 / 299** 籽，FIFO 按 `expires_at` 升序扣籽（不足整单 409）、灵气**叠加顺延绝不覆盖**、常态赠竹片（`half_year` 2 束 / `yearly` 8 束） |
| `POST /spirit/mount-jade` | 已登录（未登录 **401**；镶嵌与灌注**同权**，无 403 档） | 镶嵌：每树唯一凹槽、**永久不可逆**、二次镶嵌 409、中华世本 400 |
| `POST /assets/synthesize-jade` | 已登录 | 999 颗石榴籽合成 1 枚玉（参与批次**全部**剩 ≥ 360 天 → 永久 `expires_at = null`，否则取最早到期批原值）；不足 409 整单不扣 |
| `POST /assets/decompose-jade` | 已登录 | 免费分解，返还 999 颗籽（**统一 365 天有效期，无永久籽**）；已镶嵌玉 → 409 |

新增模块 **`cloudfunctions/compat-api/lib/economy-spirit.js`**（`PLANS` 五档表 / `settle` 惰性推进 / `synthesizeJade` / `decomposeJade` / `mountJade` / `chargeSpirit` / `spiritInfo`），
复用 `lib/economy-fee.js` 的 `sweep` / `consumeFIFO` 与 `lib/store.js` 访问层。

```bash
# ① 重打包（仓库根；产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

> ⚠️ **当前 `cloudfunctions/deploy/compat-api/index.js` 不含本批 5 条路由** → 必须重跑上面的 esbuild
> 重打包，再执行 `tcb fn deploy`。本批同时携带 §7（P0 三条 `/assets/*`）与 §9（P3 市集七条路由）。

### 8-2 CloudBase 集合

- **新建 `jiazu_spirit`**：时流子域，**单文档 `_id = 'global'`**，`trees` 映射
  （**以家族树 id 为键** → `{ jade, spirit_expires_at, buffer_until, status, logs }`，见 `docs/spirit-domain.spec.md` §3-1）。
- **`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 已补**：由 7 个基础集合扩为**10 个** ——
  原 7 个（`jiazu_person_details` / `jiazu_tree_meta` / `jiazu_users` / `jiazu_wallets` / `jiazu_anchors` /
  `jiazu_leave_requests` / `jiazu_sms_codes`）**+ `jiazu_assets` / `jiazu_spirit` / `jiazu_market`**；
  `jiazu_messages` / `jiazu_ops_logs` **随 P4 批次再补**。不补进列表 → 云端 `POST /spirit/charge` 首写报错（也可控制台手建）。

### 8-3 云端数据（无变化）

- 本批**无树 / 详情 / tree-meta 数据变化**：真源 `migrate-output/` 在实施与测试前后 **md5 逐字节未变**。
- **无需重跑数据上传**（§3 的 `node scripts/upload-migrated-to-cloudbase.mjs` 不在本批范围）。

### 8-4 前端产物（**必须重打包**）

```bash
cd frontend
# 构建前注入 VITE_API_BASE = 云函数 HTTP 域名（取值同 §1 / §7-4）
npm run build:h5
# 产物 frontend/dist/build/h5 → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c
```

本批前端变更（均已本地验证）：

| 区域 | 变更 |
|---|---|
| 新增页 | `pages/spirit/index`（时流子域：顶部状态卡 → 家族树凹槽 · 镶玉 → 玉露灵泽蓄能 → 石榴籽玉 + 灵泽流水；**8.1 / 8.2 / 8.3 三张定稿弹窗的唯一落点**） |
| 家族树首页 | `pages/hall/index.vue` 新增「🕰 时流子域」入口条（**仅状态展示与跳转**：未镶嵌 / 状态文案 + 到期日 / `expired` 置灰） |
| 「我的」页 | `pages/mine/index.vue` 新增「🕰 时流子域」cell（按锚点树进入本家族子域） |
| 接口封装 | `frontend/src/business/api.ts` 新增 `fetchSpirit` / `postSpiritCharge` / `postMountJade` / `postSynthesizeJade` / `postDecomposeJade` + `business/index.ts` 转出 |

> 落点口径（`docs/spirit-domain.spec.md` §8-1 / §12-3 收口声明）：8.1 / 8.2 / 8.3 三张弹窗**全部**落在 `pages/spirit/index`；
> `pages/market/index` 是**市集页**、**不承载玉合成 / 分解 / 镶嵌**（旧「玉市页为主入口」口径作废）。

### 8-5 部署后冒烟验证（按序做）

1. **guest 可读**：`curl -s "$FN/spirit?tree_id=$TREE_ID"`（**无 Bearer**；`$FN` = 云函数 HTTP 域名、`$TREE_ID` = 目标家族树 id）→ **200 摘要**、`logs_visible = false`；去掉 `tree_id` → 400；不存在的树 → 404；
2. **写路由鉴权**：无 Bearer 调 `POST /spirit/charge` / `POST /spirit/mount-jade` → **401**（本批无 403 档）；
3. **非成员灌注**：任意已登录、锚点不在该树的普通账号 → `POST /spirit/charge`（`daily`）→ **200**，灵气顺延、`SpiritLog.phone` 记其手机号；同账号 `GET /spirit` → `logs = []`（非成员仅摘要）；
4. **镶嵌**：`POST /spirit/mount-jade` → 200 后 `GET /spirit` 返回 `status='inactive'`；同树二次镶嵌 → 409；`zhonghua` → 400；
5. **合成 / 分解**：籽 < 999 → 409（整单不扣、无新玉）；籽 ≥ 999 且全部剩 ≥ 360 天 → `expires_at = null`（永久）；分解 → 返 999 籽、`expires_at` = now + 365 天；
6. **状态推进**：手工把 `spirit_expires_at` 置为过去 → `GET /spirit` 立即返回 `buffer` + `buffer_until`；再把 `buffer_until` 置为过去 → `expired`（不依赖定时任务）；
7. **前端**：`pages/spirit/index` 可打开、五档位数值与接口 `plans` 一致、`hall` / `mine` 入口可进入。

### 8-6 明确**不需要**上云的东西

- 本批单测文件（`cloudfunctions/compat-api/lib/economy-spirit.test.js` 等）：离线运行，不进云；
- `/tmp/jiazu-*` 下的 E2E 数据副本与备份：临时产物；
- **定时任务与推送通道**（灵气到期 / 缓冲期预警 M2 / M3 / M4 与灌注提醒 `spirit_charged` 的准点触达）、**真二级域名绑定**：留部署阶段，本批不建（见 `docs/spirit-domain.spec.md` §12-3）。

---

## 9. P3 批次（市集）

> 经济系统 **P3（市集）**：整束竹简挂单 / 撤单 / 全量成交（手续费 = 标价 × 1% 扣**石榴籽**并销毁）+ **官方竹简每日 21:00 限量发售**
> （¥9.90/束，惰性释放、**不建定时任务**）；落点依据 `docs/economy-market.spec.md` §4 / §5 / §6 / §7 / §14，真源 `migrate-output/` **未动**。
> 本地验证 = 测试套件 **237 → 274**（全绿）、市集单测 **37 例**（`cloudfunctions/compat-api/lib/economy-market.test.js`）、
> 独立质检（Neng）含 **199 籽手续费锚点**（买方 −199 / 卖方 +198 / 销毁 1）与 **3 人并发抢单实测**（仅 1 单成交、其余 409、`trades` 只追加 1 条）；
> 真源 md5 在实施与测试前后**逐字节未变**。

### 9-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包**（`cloudfunctions/deploy/compat-api/index.js` 不含本批 7 条路由）+ `tcb fn deploy` | 无 |
| 2 | CloudBase 集合 | 新建 `jiazu_market`（**已并入脚本 `COLLECTIONS`**） | 需 CB_ENV/CB_KEY |
| 3 | 云端数据 | **无需重跑**（本批无树 / 详情 / tree-meta 数据变化） | — |
| 4 | 前端产物 | `build:h5`（带 `VITE_API_BASE`）+ hosting 部署；`build:mp-weixin` + 开发者工具上传 | 需确认 hosting 目标与域名 |

> ⚠️ 与 §1 / §7 / §8 同理：**本批必须重跑 esbuild 重打包**；不重打包 = 云端 `/market/*` 全部 404（见 §9-1）。
> ⚠️ 本批**不改** §7-7 登记的并发模型口径；跨批次登记见 §10-2。

### 9-1 云函数 compat-api（**本批必须重打包**）

本批新增 7 条路由，**同 §8 一并注册在 `index.js` 树编辑闸门之前**：

| 路由 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/market/listings` | GET | **guest 可读** | 市集首页：先惰性释放官方库存 → 返回挂单列表（默认只 `open`）+ 官方区参数（`price_fen` / `daily_stock` / `stock_left_today` / `release_at: '21:00'`） |
| `/market/my` | GET | 需登录 | 我的挂单（含 `expires_at` 与剩余时限）+ 我的资产概览 |
| `/market/list` | POST | 需登录 | 挂单：整束（`pieces = bundles × 100`）、`expires_at = now + 7 天`；**入参无家族树字段（K7）** |
| `/market/cancel` | POST | 需登录 | 撤单（**仅 `open` 可撤**；`expired` → 409「挂单已过期」） |
| `/market/buy` | POST | 需登录 | 全量成交（不支持部分成交）：手续费 `floor(标价 / 100)` 籽从卖方应收入账扣、**销毁**；自买自卖 400 |
| `/market/official-buy` | POST | 需登录 | 官方购买：¥ 钱包扣 **990 分/束**（= ¥9.90）得 100 片；**21:00 前 → 409「未到发售时间」**；售罄 / 余额不足 → 409 |
| `/admin/market/official-stock` | PUT | **限 `chief_editor`** | 动态库存配置（`daily_stock` / `price_fen`）；**前端本轮不封装**（是否建配置 UI 由运营批次 P4 裁定） |

新增模块 **`cloudfunctions/compat-api/lib/economy-market.js`**（`feeOf` / `availablePieces` / `sweepAssets` / `sweepListings` / `releaseOfficial` / `planTrade` / `applyOfficialPurchase`、`LISTING_TTL_DAYS = 7`）；
`lib/wallet.js` 新增 **`deductUserBalance(phone, amountCents, opts)`**（官方购买 ¥ 扣款，写 `jiazu_wallets.transactions`，`type = 'official_bamboo'`）。

```bash
# ① 重打包（仓库根；产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

> ⚠️ **当前 `cloudfunctions/deploy/compat-api/index.js` 不含本批 7 条路由** → 必须重跑 esbuild 重打包再 `tcb fn deploy`。
> **每日 21:00 发售不需要定时触发器**：释放完全由惰性释放（访问市集 / 官方入口时判定并即时写入）实现，无访问即无消耗，符合「售罄即止、次日刷新、不结转」语义（`docs/economy-market.spec.md` §14.3）。

### 9-2 CloudBase 集合

- **新建 `jiazu_market`**：市集，**单文档 `_id = 'global'`**，含 `listings` / `trades` / `official`
  （`price_fen = 990` / `daily_stock = 50` / `stock[YYYY-MM-DD]` / `last_release_date`，见 `docs/economy-market.spec.md` §2.1）。
- **`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 已补**：原 7 个基础集合
  **+ `jiazu_assets` / `jiazu_spirit` / `jiazu_market`**（共 10 个）；`jiazu_messages` / `jiazu_ops_logs` **随 P4 批次再补**。
  不补进列表 → 云端 `/market/*` 写入报错（也可控制台手建）。
- 市集读写用到的既有集合 `jiazu_assets`（§7-2）与 ¥ 钱包 `jiazu_wallets` **已在列表中**，无需额外动作。

### 9-3 云端数据（无变化）

- 本批**无树 / 详情 / tree-meta 数据变化**：真源 `migrate-output/` 在实施与测试前后 **md5 逐字节未变**。
- **无需重跑数据上传**（§3 的 `node scripts/upload-migrated-to-cloudbase.mjs` 不在本批范围）。

### 9-4 前端产物（**必须重打包**）

```bash
cd frontend
# 构建前注入 VITE_API_BASE = 云函数 HTTP 域名（取值同 §1 / §7-4）
npm run build:h5
# 产物 frontend/dist/build/h5 → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c
```

本批前端变更（均已本地验证）：

| 区域 | 变更 |
|---|---|
| 新增页 | `pages/market/index`（竹简市集：官方发售区 / 我的资产 / 用户挂单列表 / 我的挂单 / 挂单表单 / 买入确认弹窗） |
| 「我的」页 | `pages/mine/index.vue` 入口 cell「🏪 竹简市集」（官方发售 · 挂单买卖 · 石榴籽标价） |
| 钱包页 | `pages/wallet/index.vue` 入口 cell「🏪 竹简市集」+「官方竹简 ¥9.90/束 · 每日 21:00 限量」；余额不足「去充值」跳本页 |
| 接口封装 | `frontend/src/business/api.ts` 新增 `fetchMarketListings` / `fetchMyListings` / `postMarketList` / `postMarketCancel` / `postMarketBuy` / `postOfficialBuy`（**`setOfficialStock` 未实现、不封装**） |
| 页面注册 | `frontend/src/pages.json` 新增 `pages/market/index`（`navigationBarTitleText: 竹简市集`） |

### 9-5 部署后冒烟验证（按序做）

1. **guest 可读**：无 Bearer 调 `GET /market/listings` → **200**（挂单列表 + 官方区参数，`release_at = '21:00'`）；
2. **未到发售时间**：本地时间 **21:00 前**调 `POST /market/official-buy` → **409「未到发售时间」**（不扣 ¥、不入竹片）；
3. **手续费锚点账目**：以标价 **199 籽**的挂单成交 → 买方 −199、卖方 **+198**、销毁 **1**（`Trade.fee_seeds = 1`）；
4. **售罄**：当日 `stock` 扣完后再次购买 → **409「今日已售罄」**；跨日释放**不累计**昨日余量（未售完不结转）；
5. **并发**：同一 `listing_id` 并发买入 → 仅 1 单成功、另 1 单 409，`trades` 只追加 1 条；
6. **前端**：`pages/market/index` 可打开，官方发售区文案与「今日剩余 N 束」与接口一致，`mine` / `wallet` 入口可进入。

### 9-6 明确**不需要**上云的东西

- 本批单测文件（`cloudfunctions/compat-api/lib/economy-market.test.js` 等）：离线运行，不进云；
- `/tmp/jiazu-*` 下的 E2E 数据副本与备份：临时产物；
- **定时触发器**：每日 21:00 库存刷新走惰性释放，**当前不建**（若日后后台要求「离线也按日刷新库存键」再评估，见 `docs/economy-market.spec.md` §14.3）。

---

## 10. 已知限制 / 阻塞（跨批次登记）

> 本节只登记**跨批次**的已知限制与修复，避免 P2 / P3 章节重复；「已修复 · 非阻塞」项无部署动作。

### 10-1 `lib/store.js` 集合写路径：已修为「先落盘成功再更新缓存」（**已修复 · 非阻塞**）

- **原实现（问题）**：`cloudfunctions/compat-api/lib/store.js` 的 `colSet` / `colDelete` 是**先写进程内缓存（`colCache.set`）再落盘**。
  落盘失败（`EACCES` / `ENOSPC` 等）时缓存已被改脏 → 同进程后续 `colGet` 会读回一条**磁盘上并不存在的「幻影文档」**
  （**落盘失败后的进程内脏读**：对调用方表现为写入成功，磁盘仍是旧值）。
- **本轮修复**：改为**先落盘成功、再更新缓存** —— 新增内部函数 `persistColMap(col, map)`（只接收待落盘的**新**集合内容、不读 `colCache`）；
  `colSet` / `colDelete` 先构造 `pending` 副本 → `await persistColMap(...)` → **成功后才** `colCache.set(col, pending)`；
  落盘抛错则**缓存保持旧值并向外抛错**，绝不留幻影文档。云端分支维持「SDK 写入成功后才更新内存映射」。
- **影响面**：本地模式（`COMPAT_SOURCE=local`）与云端模式共用该写路径；本批 P2 / P3 的全部集合写（`jiazu_spirit` / `jiazu_market` / `jiazu_assets`）一并受益。
- **状态**：**已修复（非阻塞）**，随本文件任一批次重打包自动生效，**无独立部署动作**。

### 10-2 §7-7 旧阻塞项未变（交叉引用）

- `jiazu_assets` 单文档并发模型重构（**每手机号一文档 + `version` 乐观锁 CAS 重试**）**仍是 §7-7 登记的部署阻塞项**；本轮（P2 / P3）**未改存储形态** ——
  `jiazu_spirit` / `jiazu_market` 同为**单文档 `_id='global'` + 进程内锁**，上云前按 §7-7 的口径一并评估（跨实例并发兜底口径见 `docs/economy-market.spec.md` §5.2）。

---

## 11. P4 批次（运营侧）

> 经济系统 **P4（运营侧）**：站内信中心（`jiazu_messages`：四类预警**读入口惰性生成** + `warned` 去重 + 已读）、运营后台
> **资产运维**（`grant` / `logs` / 用户资产快照 + `jiazu_ops_logs` 审计 + 目标用户 `txs` 流水）、**账号注销**
> （`POST /account/delete`，注销前置挂单检查 K10）；落点依据 `docs/economy-ops.spec.md` §4 / §5 / §7 / §10，真源
> `migrate-output/` **未动**。
> 本地验证 = 单测并入 `cloudfunctions/compat-api/lib/assets.test.js` 与 `lib/messages.test.js`（两者**均已注册进根
> `package.json` 的 `scripts.test`**），用例清单见 `docs/economy-ops.spec.md` §8.2（#1–#16）；真源 md5 按该节用例 15 的
> 收尾断言校验（实施与测试前后**逐字节未变**）。
> 编号说明：本章追写在 P3（§9）之后、编号顺延为 **§11**；§10 为跨批次登记，其位置与 §8 / §9 中的 `§10-2` 交叉引用**保持不动**。

### 11-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包**（`cloudfunctions/deploy/compat-api/index.js` **仍是旧产物、已落后 P0–P4 全部改动**）+ `tcb fn deploy` | 无 |
| 2 | CloudBase 集合 | 新建 `jiazu_messages` / `jiazu_ops_logs`（**已并入脚本 `COLLECTIONS`，现 12 项**） | 需 CB_ENV/CB_KEY |
| 3 | 云端数据 | **无需重跑**（本批无树 / 详情 / tree-meta 数据变化） | — |
| 4 | 前端产物 | `build:h5`（带 `VITE_API_BASE`）+ hosting 部署；**`build:mp-weixin` + 开发者工具上传** | 需确认 hosting 目标与域名 |

> ⚠️ 与 §1 / §7 / §8 / §9 同理：**本批必须重跑 esbuild 重打包**；不重打包 = 云端 `/messages`、`/messages/read`、
> `/admin/assets/*`、`/account/delete` 全部 404，且 P0–P3 的路由也一并缺席（见 §11-1）。
> ⚠️ 本批**不改** §7-7 登记的并发模型口径：`jiazu_messages` / `jiazu_ops_logs` 同为**单文档 `_id='global'` + 进程内锁**，
> 上云前按 §7-7 一并评估（跨批次登记见 §10-2）。

### 11-1 云函数 compat-api（**本批必须重打包**）

本批新增 **6 条路由**，**同 §8 / §9 一并注册在 `index.js` 树编辑闸门（`缺少 X-Tree-Id`）之前**：

| 路由 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/messages` | GET | **需登录**（未登录 → **401**） | 站内信列表：入口先 `sweep` + 惰性补齐预警（`warned` 去重）→ `200 { items, unread }`；查询参数 `unread` 只回未读 |
| `/messages/read` | POST | **需登录** | 标为已读：`{ ids?: string[] }`，**缺省 = 全部标记已读** → `200 { ok: true, unread }`；不属于本人的 id 忽略不计（不报错） |
| `/admin/assets/grant` | POST | **限 `chief_editor`**（未登录 401；其它角色 **403「需要总编辑权限」**） | 四类资产发放 / 扣减（`delta` 可负）：`reason` 必填（缺 → 400）；负向不足 → **409 整单拒绝**（响应体含 `unit`）；发放后 `fragments ≥ 10` **即时合成**；同时写 `jiazu_ops_logs` 审计 + 目标用户 `txs` 流水 |
| `/admin/assets/logs` | GET | **限 `chief_editor`** | 审计日志（`operator?` / `phone?` / `limit?` 默认 50、上限 200），按 `ts` 倒序（同刻按写入顺序倒序）；空集合 → `{ logs: [] }` |
| `/admin/assets/user` | GET | **限 `chief_editor`** | 目标账号资产快照（`phone` 必填 → 缺 400、用户不存在 404） |
| `/account/delete` | POST | **需登录** | 账号注销：先挂单前置检查（存在 `status='open'` 挂单 → **409「请先撤销未成交挂单」**，不自动撤单）→ 清空四类资产 + `signin_date` 并写 `account_clear` 流水；**重复注销幂等 200**；保留审计 / 历史流水 / `jiazu_users` / `jiazu_anchors` |

新增模块 **`cloudfunctions/compat-api/lib/economy-ops.js`**（站内信：`ensureWarnings` / `messagesOf` / `readMessages`；
运营：`grantAssets` / `opsLogs` / `adminUserAssets`；注销：`deleteAccount` / `openListingGuard`），
复用 `lib/economy-ledger.js` 的 `sweep` / `chargeLots` / `assetInsufficient` 与 `lib/store.js` 访问层。

```bash
# ① 重打包（仓库根；产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

> ⚠️ **重打包是硬前置（P0–P4 一次性合并）**：`cloudfunctions/deploy/compat-api/index.js` **仍是旧产物** ——
> 证据：`grep -c "/messages"` = **0**、`grep -c "admin/assets/grant"` = **0**，文件时间戳停在 **9 月 15 日**。
> 即该产物**不含 P0 三条 `/assets/*`、P2 五条时流子域、P3 七条市集、P4 六条运营侧的任意一条**，
> 也**不含 `lib/store.js` 的缓存顺序修复**（§10-1：先落盘成功再更新缓存）。
> 因此本批**必须**重跑上面的 esbuild 重打包再 `tcb fn deploy`，一次覆盖 P0–P4（合计 **21 条**新路由）。

### 11-2 CloudBase 集合

- **新建 `jiazu_messages`**：站内信，**单文档 `_id = 'global'`**，`{ items: { <手机号>: Message[] }, warned: { <去重键>: true } }`
  （`Message = { id, type, title, text, created_at, read }`，见 `docs/economy-ops.spec.md` §4.2）。
- **新建 `jiazu_ops_logs`**：运营审计，**单文档 `_id = 'global'`**，`{ logs: OpsLog[] }`
  （`OpsLog = { id, ts, operator, target_phone, delta, reason }`，见 `docs/economy-ops.spec.md` §5.3）。
- **`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 已补，现为 12 项** ——
  **7 个基础集合**（`jiazu_person_details` / `jiazu_tree_meta` / `jiazu_users` / `jiazu_wallets` / `jiazu_anchors` /
  `jiazu_leave_requests` / `jiazu_sms_codes`）**+ P2 / P3 三个**（`jiazu_assets` / `jiazu_spirit` / `jiazu_market`）**+
  本批两个**（`jiazu_messages` / `jiazu_ops_logs`，脚本内注释标注「P4 新增」）。
- 至此总册（部署要点）登记的**五个新集合全部落位**，P0–P4 **不再有待补集合**；本地模式对应
  `migrate-output/collections/jiazu_messages.json` / `.../jiazu_ops_logs.json`。
- 不补进列表 → 云端 `GET /messages` 首次写预警、`POST /admin/assets/grant` 首次留痕即报错（也可控制台手建）。

### 11-3 云端数据（无变化）

- 本批**无树 / 详情 / tree-meta 数据变化**：真源 `migrate-output/` 在实施与测试前后 **md5 逐字节未变**。
- **无需重跑数据上传**（§3 的 `node scripts/upload-migrated-to-cloudbase.mjs` 不在本批范围）。

### 11-4 前端产物（**必须重打包：H5 + 小程序**）

```bash
cd frontend
# ① H5：构建前注入 VITE_API_BASE = 云函数 HTTP 域名（取值同 §1 / §7-4 / §8-4 / §9-4）
npm run build:h5
# 产物 frontend/dist/build/h5 → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c

# ② 微信小程序：同一批改动，必须一并重打并用开发者工具上传
npm run build:mp-weixin
# 产物 frontend/dist/build/mp-weixin → 微信开发者工具上传
```

本批前端变更（均已本地验证）：

| 区域 | 变更 |
|---|---|
| 资产页「消息提醒」区 | `pages/assets/index.vue` 新增站内信列表（标题 / 正文 / 时间 / 未读圆点）+「N 条未读」计数 + 空态「暂无消息」；点单条 → `POST /messages/read { ids:[id] }`、顶部「全部标为已读」→ 不带 ids；正文由后端下发、前端逐字渲染 |
| 后台「资产运维」区 | `pages/admin/index.vue` 新增第 5 个 `section`：目标手机号 + 四类资产数量（可负）+ 原因（必填）+ 依据（选填）→ `POST /admin/assets/grant`；用户资产快照 `GET /admin/assets/user`；变动日志 `GET /admin/assets/logs`（按手机号 / 操作人过滤）；**仅 `chief_editor` 可见**，非总编显示「需要总编辑权限」提示条（与后端 403 一致） |
| 「我的」页 | `pages/mine/index.vue` 新增「📮 消息中心」入口（未读为 0 不显示角标）与「🚪 注销账号」入口（二次确认明示不可恢复 + 挂单前置；409 直出后端原文并引导去市集页撤单；成功后登出回首页） |
| 接口封装 | `frontend/src/business/api.ts` 新增 `fetchMessages` / `postMessagesRead` / `postAdminAssetsGrant` / `fetchAdminAssetsLogs` / `fetchAdminAssetsUser` / `deleteAccount`，`business/index.ts` 转出 |

> 消息中心**列表形态的实现落点**：本批落在**资产页「消息提醒」区**（`pages/assets/index.vue`），「我的」页入口跳该页；
> `docs/economy-ops.spec.md` §4.6 记载的独立消息页（`pages/messages/index.vue` + `pages.json` 注册）**未在本批落地**，如需该形态另行拍板。

### 11-5 部署后冒烟验证（按序做）

1. **未登录**：无 Bearer 调 `GET /messages` → **401**；
2. **站内信 + 去重**：登录后 `GET /messages` → **200**，体为 `{ items, unread }`；**连续第二次调用 `items` 条数不新增**（`warned` 去重生效、不重复投递）；`POST /messages/read` → `unread` 归零；
3. **权限**：非总编（`tree_steward` / `user`）调 `POST /admin/assets/grant` → **403**；缺 `reason` → **400**；未登录 → **401**；
4. **负向不足**：`grant` 负向扣减超余额（如 `delta.fragments` 扣到负数）→ **409**，响应体含 `code: 'ASSET_INSUFFICIENT'` 与 `unit`（`fragments` / `seeds` / `bamboos` / `jade` 之一），且资产 / 审计日志 / 用户流水**三者都未变**；
5. **注销前置**：账号存在未成交挂单（`status='open'`）时 `POST /account/delete` → **409「请先撤销未成交挂单」**（资产与挂单均未变）；撤销挂单后再调 → **200**（四类资产清零 + `signin_date` 清空）；
6. **前端**：资产页「消息提醒」区可读且文案与接口逐字一致；admin 页「资产运维」区仅总编可见（主理人只见提示条）；「我的」页「📮 消息中心」角标与「🚪 注销账号」可用；**小程序端**重打后同样可用。

### 11-6 明确**不需要**上云的东西

- 本批单测文件（`cloudfunctions/compat-api/lib/assets.test.js` / `lib/messages.test.js` 等）：离线运行，不进云；
- `/tmp/jiazu-*` 下的 E2E 数据副本与备份：临时产物；
- **站内信定时推送**：本轮**只做读入口惰性生成**（`GET /messages` 等资产入口按 `now` 补齐预警、`warned` 去重），
  **不建任何定时触发器**；真定时推送（准点触达、含无登录用户）**留部署阶段**，复用同一 `ensureWarnings` 与同一
  `warned` 去重键、同一文案，**逻辑不重写**（`docs/economy-ops.spec.md` §10.3）。

---

## 12. 数据修正批次：跨树子女归父树（季庭亦/季季贺为）

> **为什么**：一次**真源数据修正**已在本机完成（Kevin 直接指示，**只改数据、不改代码**）—— 季庭亦 `I000149` /
> 季季贺为 `I000159` 的父应为**季清昆 `I000254`（ji 树真身）**，原本错误地记在母树 `gu_39038_01` 的「父槽空」家庭
> `F000080` 下。修正口径与既有「**跨树婚姻子女归父树**」规则一致：两孩子**真身迁入** `ji_23395_01` 的新家族
> **`F000150`**（father = 季清昆 `I000254`、mother = 顾景月镜像 `I000291`）；母树 `gu_39038_01` 的 `F000080` 改为
> **镜像家庭**（father = 季清昆镜像 `I000292`、children = 镜像子女 `I000293` / `I000294`，均 `external_mirror='true'`）。
> 同时补记**婚配事实**：季清昆 × 顾景月，`external_marriage_date = 2014-06-08`，两侧同一个
> `external_marriage_id = 6016ead71ee77c91e47cb129`（`external_marriage_no = 1`）。
> **编号不变**：两人沿用 `I000149` / `I000159`（全站编号终身不变，跨树迁移不重编号）；本轮新铸号 =
> 人 `I000291`–`I000294`、家族 `F000150`（另 `F000151` 为铸号器空耗，无对应实体）。
> **本地验证**：磁盘直读结构一致（`ji_23395_01` = **94 人 / 36 家族**、`gu_39038_01` = **23 人 / 8 家族**）；带 chief
> 令牌的 API 视角 georgia ji 树 **94 人**且三新节点可见；两名孩子详情可读（含 `event` ref）；详情文档随迁落盘已确认。

> ⚠️ 本批**不含任何代码改动** → `compat-api` **不需要重打包**（若与 P0–P4 尚未上云的同一次部署合并，按 §11-1 一次性重打即可，
> 本批不额外增加路由）。本批是本文件**首个纯数据批次**：动的只有**云端树 JSON / 详情文档 / 编号计数器**。
> ⚠️ 两处**手工动作不可省略**：① 旧键详情文档必须**显式删除**（§12-2，上传脚本只 upsert 不删）；② 计数器集合
> `jiazu_id_seq` **不在上传脚本覆盖面内**，必须手工同步（§12-3），否则云端铸号会与本地新号撞号。

### 12-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **无需重打包**（本批 0 行代码改动；如与 P0–P4 同批部署按 §11-1 走） | 无 |
| 2 | CloudBase 集合 | **无需新建**；需**删除 2 条旧键详情文档**（§12-2）+ **同步 `jiazu_id_seq` 2 条计数器**（§12-3） | 需 CB_ENV/CB_KEY |
| 3 | 云端数据 | **必须重跑上传**（`trees/gu_39038_01.json` 与 `trees/ji_23395_01.json` 两份真源已变） | 需 CB_ENV/CB_KEY |
| 4 | 前端产物 | **无变化**（纯数据批次，**不需要** `build:h5` / `build:mp-weixin`） | — |

### 12-1 云端数据重传（**本批必做**）

```bash
CB_ENV=liwu-d8gek6jjdab1d087c CB_KEY=<云开发 API Key> \
  node scripts/upload-migrated-to-cloudbase.mjs
```

> 写法同 §3 / §7-3：脚本按 `migrate-output/report.json` 的 `trees` 列表**逐棵全量上传** → 一次重跑即覆盖
> `gu_39038_01` 与 `ji_23395_01`（无需逐棵指定）；树 JSON 落云存储 `trees/gu_39038_01.json` /
> `trees/ji_23395_01.json`，`tree-meta.global.storage_files` 的 fileID 由脚本回写（第 4 步）。

需重传的文件清单（本地 `migrate-output/` 为真源）：

| 文件 | 修正后状态 | 说明 |
|---|---|---|
| `migrate-output/trees/ji_23395_01.json` | **94 人 / 36 家族**（含新家族 `F000150`、新增镜像 `I000291` 顾景月） | 孩子**真身**（`I000149` / `I000159`）的新父家庭落在此树；两孩子 `parent_family` 指向 `F000150` |
| `migrate-output/trees/gu_39038_01.json` | **23 人 / 8 家族**（`F000080` 改镜像；新增 `I000292` / `I000293` / `I000294`） | 母树只见镜像：`F000080.father_handle = 004d145b7d78e51c92cbfbb0`（`I000292` 季清昆镜像）、`children = 717f61816a317dff570be164` / `753f8a77dafb9728b0057327`（`I000293` / `I000294`） |
| `migrate-output/config/tree-meta.json`（源 `config/tree-meta.json`） | 本次未改 | 脚本会随树 JSON 一起回写 `storage_files`（fileID 变则必须让脚本写） |
| `migrate-output/details/` 下 `ji_23395_01:` 前缀的**两份新详情** | **新增落盘**（同两名孩子旧的 `gu_39038_01:` 前缀详情已不在磁盘） | 由同一次重跑写入云端；**旧键云端残留需手工删除 → §12-2** |

> 备注：本地每次写入前后备份 `/tmp/jiazu-bak-<ts>`（rolling，可回溯）；本次修正的备份见 §12-6。

### 12-2 云端详情文档的**键变更**（重要：旧键必须删除）

- **随迁事实**：两名孩子的详情键由 `gu_39038_01:<handle>` 改为 **`ji_23395_01:<handle>`**（各一份，均已落盘：
  `migrate-output/details/ji_23395_01:103f95b87cce41e76a2a24618702.json`、
  `migrate-output/details/ji_23395_01:103f95b87eae32faba04050101ed.json`）。
- ⚠️ **重跑上传不足以完成本次键变更**：上传脚本对详情只做 **upsert**（脚本第 89–92 行 `col.doc(_id).set(data)`），
  **只写新键、不删旧键**。不删旧键的后果：云端 `jiazu_person_details` 残留**母树旧详情**（`tree_id = 'gu_39038_01'`
  的脏文档，后端按 `tree_id` 取详情时多出一份旧口径），且若旧键被旧路径读取则与真身详情**口径分叉**；反向（先删后传）
  则会出现孩子详情 **404**。**故必须先重传、再删旧键。**

| # | 需**删除**的旧 `_id` | 需**写入**的新 `_id`（§12-1 已写） | 指向 |
|---|---|---|---|
| 1 | `gu_39038_01:103f95b87cce41e76a2a24618702` | `ji_23395_01:103f95b87cce41e76a2a24618702` | `I000149` 季庭亦 |
| 2 | `gu_39038_01:103f95b87eae32faba04050101ed` | `ji_23395_01:103f95b87eae32faba04050101ed` | `I000159` 季季贺为 |

- **删除方式（二选一，均需执行后回读确认）**：
  1. 控制台：云开发 → 数据库 → `jiazu_person_details` → 按 `_id` **精确**查询上面两个旧值 → 删除记录；
  2. 一次性脚本（**不入库**）：`await db.collection('jiazu_person_details').doc('gu_39038_01:103f95b87cce41e76a2a24618702').remove()`，
     第 2 条同法替换 `_id`。
- **回读确认**：两条旧 `_id` 查不到；两条新 `_id` 存在且 `tree_id = 'ji_23395_01'`、`gramps_id` 分别为
  `I000149` / `I000159`（新详情含 `events` · 出生 2015-12-14 河北省秦皇岛市 / 2017-11-27 秦皇岛市妇幼保健院）。
- 其余详情**不受影响**（脚本全量 upsert）：`ji_23395_01:*` 现存 **93 份**（含本次两条新键）、`gu_39038_01:*` 现存 **20 份**。

### 12-3 编号集合 `jiazu_id_seq` 同步（重要：不写会**撞号**）

- **本地已推进**：`migrate-output/collections/jiazu_id_seq.json` = `{ _id:'person', next: **295** }` +
  `{ _id:'family', next: **152** }`（本轮新铸 `I000291`–`I000294` / `F000150`，`F000151` 空耗）。
- ⚠️ **重跑上传不会同步它**：`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（现 **12 项**）**不含**
  `jiazu_id_seq`，脚本四步流程（建集合 → 传树 JSON → 写详情 → 写 tree-meta）也**不写**该集合 → 必须**手工写入云端**。
- **云端写入内容**（`_id` 与本地同构，取值为**覆盖写入**、不是只补缺失）：

| 集合 | 文档 `_id` | 字段 |
|---|---|---|
| `jiazu_id_seq` | `person` | `{ _id: 'person', next: 295 }` |
| `jiazu_id_seq` | `family` | `{ _id: 'family', next: 152 }` |

- **不同步的后果**：铸号器 `cloudfunctions/compat-api/lib/id-seq.js` 的 `initSeqIfMissing` **只抬不降**
  （第 111 行 `if (!cur || (force && cur < want))`）—— 云端计数器**缺失 → 播种为 1**、**陈旧 → 原样保留旧值**，
  之后云端铸号从旧值继续 → 与本地新铸的 `I000291`–`I000294` / `F000150` **撞号**（同号两人 / 两家族，
  外部镜像指针与详情键双双错乱）。
- **上云后自检**：云端读 `jiazu_id_seq` 两条文档 `next` 均 ≥ 295 / 152；随后云端执行一次新建（如加一个空节点）
  确认铸号从 **`I00295` / `F00152`** 起，不与本地新号重叠。

### 12-4 前端产物（**无变化**）

- 本批**只改数据、不改前端代码** → **不需要** `build:h5` / `build:mp-weixin`，也无需 hosting / 小程序重传。
- 若与 P0–P4 同批部署，前端仍按 §11-4 **一次性重打**（本批不额外增加改动，重打原因与本批无关）。

### 12-5 部署后冒烟验证（按序做）

1. **ji 树（孩子真身归位）**：登录后打开 `ji_23395_01`，家族 **`F000150`** 下确有 **2 名子女**，编号仍为
   **`I000149`（季庭亦）** / **`I000159`（季季贺为）**（跨树迁移**不重编号**）；
2. **gu 树（母树只留镜像）**：`F000080` 显示 **「季清昆（镜像）＋ 顾景月」**，两名子女均为**镜像**节点
   （`external_mirror = 'true'` + `external_link_type = 'child'`）；
3. **两人档案**：`I000149` / `I000159` 均可打开，生卒与事件完整（详情含 `event` ref，**不 404**）；
4. **婚配日期**：季清昆 × 顾景月显示 **`2014-06-08`**，且 ji 侧 `I000254` 与 gu 侧 `I000140` 两侧
   `external_marriage_id` 一致（`6016ead71ee77c91e47cb129`）；
5. **详情键**：§12-2 表中两条**旧 `_id` 已不存在**、两条**新 `_id` 存在**且 `tree_id = 'ji_23395_01'`；
6. **编号集合**：`jiazu_id_seq` 两条文档 `next = 295 / 152`；云端新建节点铸号不与 `I000291`–`I000294` / `F000150` 重号。

### 12-6 备注

- **`external_marriage_created_by` 留空**：本次为手工修正、无发起人（该字段由跨树嫁娶流程写入，手工修正不伪造发起人）。
- **备份留存**：修正前状态备份在 **`/tmp/jiazu-bak-1789612125859/`**（**5 个文件**）——
  `gu_39038_01.json`、`ji_23395_01.json`、`jiazu_id_seq.json`、
  `gu_39038_01:103f95b87cce41e76a2a24618702.json`、`gu_39038_01:103f95b87eae32faba04050101ed.json`
  （供回滚或校对；属临时产物，清理前请确认线上已核对完毕）。

### 12-7 明确**不需要**上云的东西

- 本批**无新增脚本、无测试文件、无前端产物**（无 `build:h5` / `build:mp-weixin`、无 hosting / 小程序重传）；
- `/tmp/jiazu-bak-1789612125859/` 下的修正前备份：临时产物，仅本地留存，**不上云**；
- `migrate-output/` 内的中间报告（`report.json` / `id-migration*.json`）：离线工具产物，不进云。

---

## 13. 本批：晋宗整体下线（代码） + ji 树分迁占位清理（数据修正）

> **本批两件事**（同一轮的两条独立动作）：
> **A ——【晋宗】整体下线**：Kevin 2026-09-17 产品决策，历史思路里的【晋宗】操作**整体移除**（不只是入口下线，而是路由、函数、
> 规格描述一并清除），由新的【立支】（普通树普通节点 → 立为新的家族树始祖、祖先链上移到该树宗谱，暂定消耗 9999 石榴籽）
> 与【汇宗】（家族树始祖改挂到某普通家族树节点、整树节点迁移到目标节点下、原树元数据删除、资产折损并入，暂定消耗 0）取代；
> **【立支】/【汇宗】两条新操作的规格不在本批**（等上层拍板后单独派单），本批只做「移除晋宗 + 登记下线」。
> **B —— ji 树数据修正**：`ji_23395_01` 删除 4 个历史分迁占位节点 `I000178`–`I000181`（纯数据，无代码改动）。
> ⚠️ A 是**代码改动**（随 P0–P4 同一次重打包上云）、B 是**数据改动**（重传 + 手工删键）—— 两者的云端动作**不能互相替代**。

### 13-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包 + `tcb fn deploy`**（本批删掉 `POST /admin/promote` 与 `promoteTree()`；产物仍是 9 月 15 日旧产物，见 §11-1） | 无 |
| 2 | CloudBase 集合 | **无需新建、无需改脚本**（`COLLECTIONS` 仍 12 项）；需**手工删除 4 条详情文档**（§13-2） | 需 CB_ENV / CB_KEY |
| 3 | 云端数据 | **必须重跑上传**（真源 `migrate-output/trees/ji_23395_01.json` 已变） | 需 CB_ENV / CB_KEY |
| 4 | 前端产物 | **必须重打包**（`business/api.ts` 的 `promoteTree()` 封装与导出已删；H5 + 小程序，随 §11-4 一次性重打） | 需确认 hosting 目标与域名 |

### 13-1 本批 A：云函数 `compat-api`（**必须重打包：本批删了一条路由**）

**为什么需要**

- 本批从代码里**删掉**了【晋宗】，四处同批删：`cloudfunctions/compat-api/index.js` 的 `POST /admin/promote` 路由、
  `cloudfunctions/compat-api/lib/tree-write.js` 的 `promoteTree()`、前端 `frontend/src/business/api.ts` 的 `promoteTree()` 及其导出、
  `auth-server` 遗留链路里的 `/api/admin/promote`。
- 而云端产物 `cloudfunctions/deploy/compat-api/index.js` **仍是 9 月 15 日旧产物**（已落后 P0–P4 全部改动，见 §11-1），
  **里面还带着已删除的旧路由** → 不重打就等于**晋宗功能仍在线上**，与本次产品决策直接冲突。

**具体命令**

```bash
# ① 重打包（仓库根；产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy；envId 取该文件的 envId 字段）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

**本地验证证据（重打的判据，已实测）**

```bash
grep -c 'admin/promote' cloudfunctions/deploy/compat-api/index.js   # 重打前 = 1 → 重打后 = 0
grep -c 'promoteTree'   cloudfunctions/deploy/compat-api/index.js   # 重打前 = 2 → 重打后 = 0
```

- **重打前实测 = 1 / 2**（旧产物仍含该路由与函数 ⇒ 快照落后、**必须重打**）；**重打后应为 0 / 0**。
  即 **命中 0 = 已重打；命中 ≥1 = 未重打**（`grep` 命中非 0 则本批 A 视为未完成）。
- 源码侧判据（本批代码侧删除完成后核对，三条都应为 **0**）：`grep -c 'admin/promote' cloudfunctions/compat-api/index.js`、
  `grep -c 'promoteTree' cloudfunctions/compat-api/lib/tree-write.js`、`grep -c 'promoteTree' frontend/src/business/api.ts`。
- 本批 A **无数据 / 无集合 / 无模块新增**，不产生 §2 / §3 动作。

**部署后冒烟**

1. 带 chief 令牌调 `POST /admin/promote` → **404**（路由已不存在）；
2. 前端普通树人物档案「谱系管理」不再出现【⛩ 晋宗】入口（H5 与小程序各一次）。

### 13-2 本批 B：`ji_23395_01` 分迁占位节点清理（**纯数据批次**）

**为什么需要**

- 4 个**历史分迁占位节点**已无实际内容：身份字段空、`external_link_type='branch'`、`external_person_handle` 为空、
  姓名带「（已分迁）」字样、无 `parent_family`、无 `spouse_families`；属历史分迁遗留的占位壳，随本批「分迁占位」口径清理。

**本地已完成（Kevin 直接指示；只改数据、不改代码）**

| 项 | 修正前 | 修正后 |
|---|---|---|
| `migrate-output/trees/ji_23395_01.json` | **94 人 / 36 家族**（md5 `0a9b43932fece0b27ac592b6014f582b`） | **90 人 / 36 家族**（md5 `ee99232e42ff38eecf81e9d75d63d6fe`） |
| `migrate-output/details/ji_23395_01:*` | **93 份** | **89 份**（净删 4 键） |

> 计数口径说明：详情文档数**不等于** people 数 —— 镜像节点不写详情（本树 `I000291` 顾景月为镜像、本就无详情文档），
> 故本地详情是 **93 → 89**、people 是 **94 → 90**；两侧**净删都是 4**，与派单口径「people 94 → 90 / 详情 94 → 90」的**删除量**一致，
> 差别只在详情基数少算了镜像那一份。

**4 个被删节点（编号 / 姓名 / handle）**

| # | gramps_id | 姓名（树 JSON 的 `surname` + `given`） | handle（= 详情键后缀） |
|---|---|---|---|
| 1 | `I000178` | 顾 / 顾清学（已分迁） | `10400362aa90de5e976cc2900d` |
| 2 | `I000179` | 刘 / 刘芳池（已分迁） | `1040036d05f847e643b3353addd9` |
| 3 | `I000180` | 沈 / 沈克强（已分迁） | `104003760fbf7b8d3933189f0817` |
| 4 | `I000181` | 秦 / 秦（已分迁） | `104004642aca6d48ee3f95144d24` |

**具体命令**

```bash
# ① 重传（一次全量，覆盖 ji_23395_01.json；命令与 §3 / §12-1 同）
CB_ENV=liwu-d8gek6jjdab1d087c CB_KEY=云开发APIKey node scripts/upload-migrated-to-cloudbase.mjs
```

② **手工删除云端 4 个详情文档键**（上传脚本对详情是 **upsert-only**：只写新键、**不会**删掉已不存在的旧键）——
集合 `jiazu_person_details`，按 `_id` 精确删除：

| # | 需**删除**的 `_id` | 指向（已被删的占位节点） |
|---|---|---|
| 1 | `ji_23395_01:10400362aa90de5e976cc2900d` | `I000178` 顾清学（已分迁） |
| 2 | `ji_23395_01:1040036d05f847e643b3353addd9` | `I000179` 刘芳池（已分迁） |
| 3 | `ji_23395_01:104003760fbf7b8d3933189f0817` | `I000180` 沈克强（已分迁） |
| 4 | `ji_23395_01:104004642aca6d48ee3f95144d24` | `I000181` 秦（已分迁） |

- **删除方式（二选一，执行后回读确认；写法同 §12-2）**：
  1. 控制台：云开发 → 数据库 → `jiazu_person_details` → 按 `_id` **精确**查询上面 4 个值 → 删除记录；
  2. 一次性脚本（**不入库**）：对上面 4 个 `_id` 逐个执行 `await db.collection('jiazu_person_details').doc(该 _id).remove()`。
- **不删的后果**：云端 `jiazu_person_details` 残留 **4 份孤儿详情**（`tree_id = 'ji_23395_01'`，但树 JSON 已无对应节点），
  与 §7「孤儿清理」口径冲突，且按 `tree_id` 取详情时会多出无主文档。

**本地验证证据（已实测）**

```bash
ls migrate-output/details | grep -c '^ji_23395_01:'   # 修正后预期 89
node -e "const d=require('./migrate-output/trees/ji_23395_01.json');console.log(Object.keys(d.people).length, Object.keys(d.families).length)"
# 修正后预期输出：90 36
```

- 实测：people **90** / families **36**；`ji_23395_01:` 前缀详情 **89** 份；`I000178`–`I000181` 四个编号**均查不到**。
- **修正前**读数：people **94** / families **36**、详情 **93** 份、四个编号均在。
- **修正前状态已备份**：`/tmp/jiazu-bak-branch-1789614581/`（**6 个文件** = `trees/ji_23395_01.json`、`config/tree-meta.json`
  ＋上表 4 个 handle 对应的 `details/ji_23395_01:*` 详情键文件）→ 可回滚校对；临时产物，**不上云**。
- **其余真源未变**：`config/tree-meta.json` md5 仍为 `eaf4663620911c43c0289dc53e93f9e0`（本次未改）；
  `/tmp/jiazu-md5-before.txt` 与 `/tmp/jiazu-md5-after.txt` 的 diff **只有 `ji_23395_01.json` 一行**（其余树逐字节未变）。

**阻塞点**

- 需 `CB_ENV` + `CB_KEY`（云开发 API Key，取值方式同 §3）才能重传与删键；无密钥时数据改动只在本地。
- **两步都不可省，顺序固定**：先重传（树 JSON 上新）、再删 4 个旧键；反过来会出现「树里已无该节点、详情仍在」的空窗。

### 13-3 部署后冒烟验证（按序做）

1. `grep -c 'admin/promote' cloudfunctions/deploy/compat-api/index.js` → **0**（未重打为 **1**）；`grep -c 'promoteTree'` → **0**（未重打为 **2**）；
2. 带 chief 令牌调 `POST /admin/promote` → **404**；
3. 云端读 `ji_23395_01` → **90 人 / 36 家族**，`I000178`–`I000181` 均查不到；
4. 云端 `jiazu_person_details` 按 §13-2 表里 4 个 `_id` 查询 → **均不存在**；该树 `ji_23395_01:` 前缀详情计数 = **89**；
5. 前端：普通树人物档案「谱系管理」无【⛩ 晋宗】入口；`build:h5` 与 `build:mp-weixin` 重打后同样无该入口。

### 13-4 明确**不需要**上云的东西

- `/tmp/jiazu-bak-branch-1789614581/`（修正前备份）、`/tmp/jiazu-md5-before.txt` / `/tmp/jiazu-md5-after.txt`（取证文本）：临时产物，不上云；
- 本批**无新增集合 / 无新增模块 / 无新增脚本 / 无新路由** → `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`
  保持 §11-2 的 **12 项**不变；`jiazu_id_seq` 也**不动**（无新铸号，见 §12-3 口径）。

---

## 14. P5 批次：立支 / 汇宗（两条结构操作新路由 + 2 个设置键）

> 规格 = `docs/branch-clan-ops.spec.md`（设置键 §5-4 / 操作定义 §6 / 拒绝矩阵 §7 / 接口契约 §8 / 部署要点 §12 / 实现偏差登记 §15）。
> 本批**不新建集合、不新增上传项、不迁移真源数据**（`migrate-output/` 与 `config/tree-meta.json` 保持现状，运行时按业务接口写入）
> → **§2（CloudBase 集合）与 §3（云端数据重跑上传）无新增条目**；`jiazu_wallets` 已在既有上传清单内。

### 14-1 云函数 compat-api：新增两条路由（**必须重打包 + 部署**）

**为什么需要**：`POST /admin/establish-branch`（立支）与 `POST /admin/converge-clan`（汇宗）两条路由本地已实现 ——
`cloudfunctions/compat-api/index.js` 第 **1829** 行（立支）/ 第 **1867** 行（汇宗），**均在树编辑闸门「缺少 X-Tree-Id」之前**（闸门在第 1984 行；
树上下文取 body 的 `tree_id`，不依赖 `X-Tree-Id`，见规格 §8 / §13-14）；新模块 `cloudfunctions/compat-api/lib/branch-clan-ops.js`。
云端 `cloudfunctions/deploy/compat-api/index.js` 仍是旧产物 → **不重打包则线上两条路由 404**（前端无可用入口）。

**具体命令**（仓库根；写法同 §1）：

```bash
# ① 重打包（产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

**重打包判据（先判后打，两条都要查）**：

```bash
grep -c 'establish-branch' cloudfunctions/deploy/compat-api/index.js   # 命中 0 = 未重打（本次只读实测 = 0）
grep -c 'converge-clan'   cloudfunctions/deploy/compat-api/index.js   # 同上（本次只读实测 = 0）
```

**本地验证证据**：`npm test` **327 pass / 0 fail**（旧记「296/296」已作废）、`npx vue-tsc --noEmit` **exit 0**；
「无 `X-Tree-Id` + 未登录」下两条新路由均返 **401** → 证明注册位置确在树编辑闸门之前（已过闸门）。
**原缺口已闭合**：`cloudfunctions/compat-api/lib/branch-clan-ops.test.js` **已落盘**并**已注册**进 `package.json` 的 `scripts.test`
（现 **20 个**测试文件、末尾追加、纯追加不重排；旧记「19 个测试文件」已作废）→ 立支 / 汇宗业务路径**已纳入**全量套件
（两条路由端到端、落库失败冲正、真实 EACCES、真源护栏、`warnings?`、折损与叠加、跨树红线等；旧记「不含立支 / 汇宗业务路径、仅 `lib/economy-fee.test.js` 覆盖单价与 `Tx.type` 三处断言」已作废）；
详见规格 §15 第 13 条。

**阻塞点**：需 `tcb` 登录态 + `envId liwu-d8gek6jjdab1d087c`；线上写路径是云存储 `trees/*.json` + 集合 `jiazu_person_details`（本地是 `migrate-output/*.json`），故部署后必须按 §14-5 冒烟回读，不能只看 200。

### 14-2 设置键 2 个：`PUT /admin/wallet-fee` 扩展（不新增设置路由）

**为什么需要**：立支单价与汇宗折损比例后台可配 —— `jiazu_wallets`（`_id='global'`）的 `config` 上新增
**`branch_fee_seeds`（默认 9999，单位 = 完整石榴籽 / 颗）** 与 **`converge_spirit_ratio`（默认 0.5，取值 0–1）**；
读写入口复用 `lib/wallet.js`（`getBranchFeeSeeds()` / `getConvergeSpiritRatio()` / `setBranchFeeSeeds()` / `setConvergeSpiritRatio()`），
治理路由沿用既有 `PUT /admin/wallet-fee`（`cloudfunctions/compat-api/index.js` 第 **468** 行，内已含两个键的写入分支）。
**无需新建集合、无需新增上传项**（`jiazu_wallets` 已在既有清单内）。

**具体命令**：无（**没有新集合 / 新脚本要执行**）；两个键**只被读取**，运行时取缺省值即可，**不要求预先在云端写入**。
若要显式确认云端取值，部署后带 chief 令牌调用（仅一次、可跳过）：

```bash
curl -X PUT "$API_BASE/admin/wallet-fee" -H 'Content-Type: application/json' -H "Authorization: Bearer $CHIEF_TOKEN" \
  -d '{"branch_fee_seeds":9999,"converge_spirit_ratio":0.5}'
```

**本地验证证据**：`lib/wallet.js` 两对读写函数 + 该路由的两段 `has(...)` 分支已落地（本地已验证）；
缺省 / 非法值回落到 9999 / 0.5（同规格 §5-4）。

**阻塞点**：无（缺省即可跑）；只有「想改默认值」时才需要这一步。

### 14-3 前端产物（**必须重打包 H5 + 小程序**）

**为什么需要**：两个入口与全部文案在本地已落地并**按规格字面**实现 ——
`frontend/src/business/api.ts` 第 1481 行 `postEstablishBranch` / 第 1499 行 `postConvergeClan`、`frontend/src/business/index.ts` 第 9 行转出、
`business/types.ts`（`EstablishBranchResult` / `ConvergeClanResult`）、`components/person-manage-panel/person-manage-panel.vue` 第 61 行
= 「🌱 立支（新家族树）」、`components/person-archive/person-archive.vue` 第 67 行与汇宗确认弹窗标题（第 526 行）= 「⛩ 汇宗（并入他树）」
→ **不重打包则线上无这两个入口与弹窗**（不新增 `pages.json` 页面）。

**具体命令**：

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5      # 产物 frontend/dist/build/h5 → tcb hosting deploy <dir> -e liwu-d8gek6jjdab1d087c
npm run build:mp-weixin                                        # 产物交微信开发者工具上传
```

**本地验证证据**：`npx vue-tsc --noEmit` **exit 0**（上一轮实证）；入口字面与规格 §9-1 / §9-2 逐字一致（本轮只读核对 = 上述三处行号）。

**阻塞点**：H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限。

### 14-4 本批**不需要**上云的东西（含「新测试文件」的定位）

- **不新建集合 / 不新增上传项 / 不重跑迁移上传**：`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 保持 §11-2 的 **12 项**；
  `jiazu_id_seq` 不动；`migrate-output/`、`config/tree-meta.json` 保持现状（两条操作**不迁移真源数据**）。
- **测试文件与云端无关**：`cloudfunctions/compat-api/lib/branch-clan-ops.test.js`（规格 §10-1 全 25 条 + 两条操作相关新增用例；实测该文件 **31 条**用例）**已落盘并注册**
  （旧记「现**未落盘** / 待补」已作废）= 纯本地动作（落盘 + 追加进 `package.json` 的 `scripts.test` + 本地 `npm test` 重跑），
  **不进打包产物、不影响云端重传、不产生任何部署项**。注意 `npm test` 跑的是本地副本（`COMPAT_SOURCE=local` + `/tmp` 副本），
  与云端数据无关；**不要在部署前用 `npm test` 当云端回归**。
- **`/tmp` 下的副本与取证文件、备份目录**：临时产物，不上云。
- **两个设置键**：不回填云端（读侧缺省即 9999 / 0.5，见 §14-2）。

### 14-5 部署后冒烟验证（按序做）

1. 重打包判据两条都为 **≥ 1**：`grep -c 'establish-branch' cloudfunctions/deploy/compat-api/index.js`、`grep -c 'converge-clan' …`（未重打 = **0**）；
2. 无 `X-Tree-Id` + 带普通登录令牌调两条新路由 → 不是「缺少 X-Tree-Id」（能走到业务校验 = 注册位置正确）；
3. **立支**：普通家族树的**普通节点** → **200**（响应含 `fee.amount = 9999`、`fee.balance_after`、`original_tree_id` / `new_tree_id` / `moved_ancestors` / `moved_families` / `founder`；
   新树出现、祖先链进祖谱、发起人籽扣 9999）；籽不足账号 → **409 `ASSET_INSUFFICIENT`** 且数据未变；始祖位 → **400**「始祖节点本身不可立支」；
   未登录 → **401**；
4. **汇宗**：`chief_editor` 对某家族树始祖 → **200**（源树消失、节点进目标树且 `handle` / `gramps_id` 不变、目标树灵气延长折损天数）；
   非 chief → **403**「需要总编辑权限」；跨树婚姻中的树 → **409**；`confirm_people` 不符 → **409 `DELETE_SCOPE_CHANGED`** 且不写；
   目标树未镶玉 → **200 + `spirit.skipped_reason`**（不是错误）；
5. **云上回读**（关键，本地差异点）：从目标树/宗谱各取一个刚迁移的节点 → 云存储 `trees/*.json` 与 `jiazu_person_details` 均能读回（改 `_id` 后旧键不存在、新键有内容）；
6. **失败面**：人为触发汇宗 ④/⑤ 阶段失败 → **500「服务内部错误」**，且**源树 tree-meta 条目出现 `reconcile_state = 'empty_source_shell'` / `reconcile_note` / `reconcile_at`** 三个标记（规格 §5-2 / §6-2-4 ⑥；**不新建集合**）。

---

## 15. 数据修正：祖谱落点 + 陈旧编号回写（**纯数据批次**）

> 关联规格 = `docs/branch-clan-ops.spec.md`（立支前提「宗谱 `founder_handle` 非空」= §3-6；读侧一致性注 = §5-2；§13-21 / §13-22 / §13-23 三条已由 Kevin 2026-09-17 复核为「暂未决定 → 维持现状实现，不得擅自更改」）。
> 本批**只改数据**：改 3 个文件、重传这 3 个；**不改代码、不重打包、不新增集合、不新增上传项、不新增脚本**。

**为什么需要**

- 立支（`POST /admin/establish-branch`）的前置之一是「宗谱 `founder_handle` 非空」（规格 §3-6）。本批之前，两个祖谱条目 `ji_23395` / `gu_39038` 的 `founder_handle` 是**空串** → 在真实数据上跑立支会直接 **400**「该祖谱尚未设置认祖落点（founder_handle 为空），请先在祖谱内指定落点后再立支」，即**立支在真实数据上没有可达路径**。
- 两棵普通树 `ji_23395_01` / `gu_39038_01` 的 tree-meta `founder_gramps_id` 与树 JSON **顶层** `founder_gramps_id` 仍是**迁移前的旧编号**（`I0058` / `I0070`），与全站编号口径（`docs/id-system.spec.md`：换树不换号）不一致；树 JSON 顶层该字段是 `resolveFounderHandle` 的**兜底**来源（`lib/founder-attach.js`）→ 不改正会让读侧在 meta 缺字段时解析回**旧始祖**（规格 §5-2 读侧一致性注）。

**本批改了哪三个文件（改后值）**

| 文件 | 改动 | 改后值 |
|---|---|---|
| `config/tree-meta.json` | 两个祖谱条目补「认祖落点」（原为空） | `ji_23395.founder_handle = 3c95530f8bd4f84dc0b87edc`（季花 · `I000163`）、`gu_39038.founder_handle = 5ae4c6e505c90d290f71f66b`（顾清学 · `I000139`） |
| `migrate-output/trees/ji_23395_01.json` | 顶层 `founder_gramps_id` 旧编号 → 新编号 | `I000209` |
| `migrate-output/trees/gu_39038_01.json` | 顶层 `founder_gramps_id` 旧编号 → 新编号 | `I000143` |

**具体命令**（仓库根；写法沿用清单既有命令，同 §3 / §12-1 / §13-2 —— **密钥由用户提供，不代取、不打印**）：

```bash
CB_ENV=<envId> CB_KEY=<key> node scripts/upload-migrated-to-cloudbase.mjs

# 部署后回读判据（三条，都要看）：
# ① config/tree-meta.json：ji_23395.founder_handle = 3c95530f8bd4f84dc0b87edc、gu_39038.founder_handle = 5ae4c6e505c90d290f71f66b
# ② migrate-output/trees/ji_23395_01.json：顶层 founder_gramps_id = I000209
# ③ migrate-output/trees/gu_39038_01.json：顶层 founder_gramps_id = I000143
```

**本地验证证据**（本地已改完）

- 文件侧（本清单本轮**只读复核**：三个文件按上表取值读回一致）：`ji_23395.founder_handle = 3c95530f8bd4f84dc0b87edc`（季花 `I000163`）、`gu_39038.founder_handle = 5ae4c6e505c90d290f71f66b`（顾清学 `I000139`）、`ji_23395_01` 顶层 `founder_gramps_id = I000209`、`gu_39038_01` 顶层 `founder_gramps_id = I000143`；
- 服务侧（**实施轮实测**）：本地 `GET /tree-meta` 回读与上列值**一致**。

**阻塞点**

- **无**（本地已完）。云端需 `CB_ENV` + `CB_KEY`（云开发 API Key，取值方式同 §3）才能重传；无密钥时本批改动只在本地、云端祖谱仍无认祖落点。
- **（提示）立支在真实数据上的先决条件 = 本批落点已补**：云端重传并回读一致后，立支即可按 §14-5 第 3 条冒烟**真跑**（本批之前该路径必 400）。

---

## 16. 本批：首页列表范围 / 三档排序 / 全站人物搜索 + 家族树资金功能下线（**代码批次**）

> **权威规格**：`docs/home-sort-search.spec.md`（本批新建；**从属于** `docs/economy.spec.md` 等总纲——经济域口径的唯一权威仍是 `docs/economy.spec.md`）；
> 资金下线的**总纲表述** = `docs/economy.spec.md` **§12-3**（已回写状态）。
> **本批性质**：**代码批次 + 数据修正批次**（后端 `cloudfunctions/**` + 前端 `frontend/**` + `auth-server/**` + 根 `package.json`；两项数据手术已对**真源**执行）。
> **无新增集合**；但**本轮有真源数据变更**（原「无」已作废 → 见 **§16-3**）：① 世本 `zhonghua` 删节点 `I0046`（顾清学）：`people` **140 → 139** + 删其详情文档；
> ② 钱包集合删 `type:'transfer'` 流水与 `trees` 字段（`migrate-output/collections/jiazu_wallets.json` + `auth-server/data/wallets.json`；**用户余额未动**）；
> ③ **批次 1（2026-09-18 08:22）世本再删 51 个「补录登记节点」**：`people` **139 → 88** + 删 51 份详情文档 + 按 3 片竹片/节点等价扣 **153 片**（**§16-3 追加块**）。
> 作业依据 / 删前核查 / 前后 md5 / 备份与回滚见 **`docs/zhonghua-cleanup-2026-09.spec.md`**（第 0 批 = §2、批次 1 = **§6**）；逐节点清单见 `docs/zhonghua-cleanup-candidates-2026-09.md`。
> ⚠️ **云函数必须重打包**：`cloudfunctions/deploy/compat-api/index.js` **仍是旧产物**，落后本批全部后端改动
> （新增 **1 条路由** + **1 条路由出参增量** + **2 条路由改 410** + **建树 409 文案统一**）。
> ⚠️ **前端 H5 / 小程序同样必须重打包**：不重打包则线上仍是被删掉的资金入口 + 没有首页搜索框。

### 16-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包 + `tcb fn deploy`**（§16-1：`GET /search/global` 新增、`GET /tree/rank` 出参增量、`/wallet/transfer` 与 `/wallet/tree-balance` 改 410） | 无 |
| 2 | CloudBase 集合 | **无**（不新增集合；`COLLECTIONS` 保持 §11-2 的 12 项） | — |
| 3 | 云端数据 | **有变更**（§16-3：重传 `zhonghua` 树 JSON（**88 人**）+ **手工删**云端 **52 份** `zhonghua:<handle>` 详情文档（`I0046` 1 份 + 批次 1 的 51 份）+ 重传清理后的钱包集合 `jiazu_wallets`） | 需 CB_ENV/CB_KEY |
| 4 | 前端 H5 / 小程序 | **必须重打包 + hosting 部署**（§16-4：首页列表 / 三档排序 / 搜索框、家族树页删资金块、钱包页删转账区、business 封装 + 两处文案） | 需确认 hosting 目标与云函数 HTTP 域名 |

### 16-1 云函数 `compat-api`：新增 1 条路由 + 1 条出参增量 + 2 条路由改 410（**必须重打包 + 部署**）

**为什么需要**（逐条列出本批新增 / 变更的路由）：

| 路由 / 模块 | 变更内容 | 本地验证 |
|---|---|---|
| **`GET /search/global`** | **新增**（全站人物搜索）：**无需 `X-Tree-Id`**，注册在**树编辑闸门之前**；`query` trim 空 → **200 `[]`**、`limit` 默认 **30** / clamp **1..100** / 非法回落 30；匹配 = ①`resolveNode` 编号或 handle（`matched='id'` 置顶）②编号数字形态（`123` / `000123` / `I000123` 均命中 `I000123`）③姓名（`name`/`surname`/`given` 任一包含，去空格 + 大小写不敏感）；逐树套 `resolveTreeAccess(...).isHiddenPerson` **节点级裁剪**；**镜像归并**（判据 `external_mirror==='true'` + `external_person_handle` 非空；沿镜像链**递归**到最终真身，防环、上限 32 跳；归并键 = 真身 handle，同一人只出**一条**、**不附注镜像数量**）；`restricted` 判定 = **真身对访问者可见 → 取真身且 `restricted=false`（即使只命中镜像）**、真身不可见 / 解析不到 → 取镜像且 `restricted=true` 并**不泄漏真身 handle / gramps_id / tree_id / tree_title**；排序 = 编号置顶 → `tree_id` 字典序（同树内保持 people 键序）；**先归并、后截断** | `lib/home-sort-search.test.js` B / D / D-2 组 + 本轮 `npm test` **350 pass / 0 fail** |
| **`GET /tree/rank`** | **出参增量（向后兼容）**：新增 `activity`（number，近 30 天互动事件数）与 `updated_at`（string，树 JSON 原值；缺失 → `''`）；既有字段（`rank_key` / `rank_label` / `rank_en` / `rank_desc` / `person_count` / `total_generations` / `access` …）**全部保留**；活跃度实现 = 新模块 **`cloudfunctions/compat-api/lib/tree-activity.js`**（集合缺失 / 读失败 → 0 且不抛） | `lib/home-sort-search.test.js` A 组 + 既有 rank 断言无回归 |
| **`POST /wallet/transfer`** | **改语义为下线**：在**鉴权 / 参数校验之前**恒返 **410** + `{ error: '家族树资金功能已下线', code: 'TREE_FUND_RETIRED' }` | `lib/home-sort-search.test.js` C 组（**15 种请求组合实测全 410**；对照组 `GET /wallet/balance` 仍 401 / 200 正常） |
| **`GET /wallet/tree-balance`** | 同上（恒 **410** + `TREE_FUND_RETIRED`） | 同上 |
| `lib/wallet.js` | **删** `transferToTree` / `getTreeBalance`；**保留** `deductTreeCreateFee`（建树费钩子不变） | 同上（模块级导出已核对） |
| **`lib/economy-ledger.js`** | **后续批次（2026-09-18）文案统一**：籽域 409 文案改为 **`资产不足，需 9颗石榴籽，当前 N 颗`**（数字与量词**连写**、**不带**「完整」；用户拍板）；竹片 / 玉域**沿用既有**「需 N 片竹片 / 需 N 枚石榴籽玉」空格写法；`need` / `current` / `unit` / `how_to_get` 的**字段名与取值一律不变** | `lib/economy-fee.test.js`（#8 / #34 与 409 文案断言）+ 全量 `npm test` **350 pass / 0 fail** |

**具体命令**（仓库根；写法同 §1 / §11-1 / §14-1）：

```bash
# ① 重打包（产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c

# ③ 重打包判据（两条都要 ≥ 1；未重打 = 0）
grep -c 'search/global'     cloudfunctions/deploy/compat-api/index.js
grep -c 'TREE_FUND_RETIRED' cloudfunctions/deploy/compat-api/index.js
```

**本地验证证据**：

- 重打包判据**当前实测 = 0 / 0** → `grep -c 'search/global' cloudfunctions/deploy/compat-api/index.js` = **0**、
  `grep -c 'TREE_FUND_RETIRED' …` = **0** ⇒ **确认本批尚未进打包产物**（必须重打）。
- ⚠️ **不要用 `grep -c 'wallet/transfer'` / `grep -c 'tree-balance'` 当判据**：这两个串在**旧产物里本就存在**（旧实现），
  当前实测各 = **1**，命中**不代表**本批的 410 已进产物（会给出假绿）。
- 全量 `npm test` = **350 pass / 0 fail**；新增文件 `cloudfunctions/compat-api/lib/home-sort-search.test.js`
  **已注册**进根 `package.json` 的 `scripts.test`（未注册 = 假绿）。
- 前端改动与规格逐条对应（§16-4 表）；`git diff --stat` 覆盖 `cloudfunctions/` 2 个文件、`frontend/` 7 个文件、根 `package.json`，**无真源数据文件**。
- **后续批次（2026-09-18，同批登记在本节）**：建树费文案统一（提交 `dc8214f` / `2bf89f7`，涉 `cloudfunctions/compat-api/lib/{economy-ledger,economy-fee}.js` + 2 个测试文件 +
  `frontend/src/pages/{wallet,index}/index.vue` / `business/{api,asset-guide}.ts`）、`auth-server` 转账路由与方法删除（提交 `2bf89f7`）、两项数据手术（§16-3）。
  该批次完成后**重跑**全量 `npm test` = **350 pass / 0 fail**（数据手术后的真源上仍全绿）。

**阻塞点**：**无**（命令与判据齐备）；仅需 `tcb` 登录态与 envId 权限（同既有批次）。

### 16-2 CloudBase 集合：**无**

- **无新增集合**（明确「**无**」）：本批不新建、不改动任何集合 → `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`
  **保持 §11-2 的 12 项不变**，**无需补列表、无需控制台手建**。
- 附注（不构成部署项）：`lib/tree-activity.js` 只**读**四个申请集合（`jiazu_join_requests` / `jiazu_marriage_requests` /
  `jiazu_founder_requests` / `jiazu_clan_requests`）—— 它们已在 §2 / §11-2 的清单内；**某个集合在云端尚不存在时，活跃度只返回 0、不报错**（不阻塞本批）。

### 16-3 云端数据：**有变更**（两项数据手术 · **必须重跑迁移上传 + 1 项手工删除**）

> ⚠️ 本节为**回写变更**（原为「**无**」）：2026-09-18 用户拍板批次对真源做了两项数据手术 —— 世本删节点 `I0046` 与钱包 `transfer` 残留清理。
> 作业依据 / 删前核查 / 前后 md5 / 备份与回滚 / 云端要求见 **`docs/zhonghua-cleanup-2026-09.spec.md`**（本清单只列**上云动作**）。

**为什么需要**（逐条列出被改的真源 → 对应云端副本）：

| 真源文件（本地） | 变更 | 对应云端副本 |
|---|---|---|
| `migrate-output/trees/zhonghua.json` | 删 `I0046`（顾清学）：`people` **140 → 139**；md5 `9b22e0b9b66f6c3588228eb0d86c1f68` → **`2c6fbdcae6cd9b7a1cf811408d7b017d`**（`version` / `updated_at` 故意未动） | 云存储 **`trees/zhonghua.json`**（重跑全量上传即覆盖）。⚠️ **批次 1 后终值 = 88 人 / md5 `3cc6089aeaa723247065de2549f060c8`** → 见下「§16-3 追加」（同一份文件，重传一次即含两批结果） |
| `migrate-output/details/zhonghua:103ff1c309eb7bf2cb4f6ff1762e.json` | **删除**（原 md5 `6ca7e089e26548b85468cb2f79f140c9`） | 集合 `jiazu_person_details` 的 **`_id = zhonghua:103ff1c309eb7bf2cb4f6ff1762e`**（**必须手工删**，见下） |
| `migrate-output/collections/jiazu_wallets.json` | 删 `type:'transfer'` 流水 1 条 + 删 `trees` 字段；md5 `1b52c2e7166573b43b45887abdaf414f` → **`1c2ca5a078eee318bd3f0f80fefad69d`**；`users[*].balance_cents` **未动（1070 分）**，那笔 ¥20 **不返还** | 集合 `jiazu_wallets` 的 `global` 文档（重跑覆盖） |
| `auth-server/data/wallets.json` | 同上（各 1 条 / 1 处）；md5 `e8c4464922f487b3b3cd7e71514f4c1c` → `b0818848e4435dfb9969746e862b929e` | 属**遗留链路、不上云**（见 §16-7-1） |

**具体命令**：

```bash
# ① 全量重跑迁移上传（树 JSON 逐棵覆盖 + 详情 upsert + tree-meta.storage_files 回写）
CB_ENV=liwu-d8gek6jjdab1d087c CB_KEY=<云开发 API Key> \
  node scripts/upload-migrated-to-cloudbase.mjs

# ② ⚠️ 手工删除云端已不存在的详情文档
#    重跑**不会**删旧键：脚本对详情是 doc(_id).set()（upsert，只增不删）→ 不删 = 云端残留已删节点的详情
#    控制台：云开发 → 数据库 → jiazu_person_details → 按 _id **精确**查询后删除记录
#    或一次性脚本（不入库）：await db.collection('jiazu_person_details')
#        .doc('zhonghua:103ff1c309eb7bf2cb4f6ff1762e').remove()

# ③ 本地侧判据
python3 -c "import json;d=json.load(open('migrate-output/trees/zhonghua.json'));print(len(d['people']))"   # 期望 139
python3 -c "import json;g=json.load(open('migrate-output/collections/jiazu_wallets.json'))['global'];print(sum(1 for t in g['transactions'] if t['type']=='transfer'), 'trees' in g)"   # 期望 0 False
```

**本地验证证据**：

- 上表 md5 / `people` 数**均在真源实测**（备份件见 `docs/zhonghua-cleanup-2026-09.spec.md` §4-1；详情文档已确认不在磁盘）。
- 数据手术后**重跑**全量 `npm test` = **350 pass / 0 fail**（2026-09-18）。
- 云端侧断言见 **§16-5 第 8 步**（上传后回读）。
- ⚠️ **`jiazu_wallets` 以云端实际为准**：若云端该文档**本就没有** `transfer` 流水 / `trees` 字段（例如从未上传过家族树资金数据），
  则该文件属**幂等无变化** —— 在部署记录里注明「云端本来就无该字段」即可，**不构成阻塞**。

**阻塞点**：需 CB_ENV / CB_KEY；第 ② 步**必须显式执行**（遗漏 → 云端残留失效详情文档，按 `tree_id` 取详情时命中已删节点，与真源口径分叉）。

#### 16-3 追加（**2026-09-18 · 批次 1**）：世本再删 **51 个补录登记节点** —— 云端动作增量

> 本节 = **§16-3 的增量**（同属本批数据变更）。作业依据 / 候选判据 / 结果与校验 / 扣费证据 / 回滚见 **`docs/zhonghua-cleanup-2026-09.spec.md` §6**；
> 逐节点清单与上云删除清单见 **`docs/zhonghua-cleanup-candidates-2026-09.md`**（头部 = 执行记录；**附录 A = 51 个 handle ↔ 待删详情 `_id`**）。

**为什么需要**（真源已变 → 云端必须跟随；逐条对应）

| ☑ | 云端动作 | 为什么 / 注意 |
|---|---|---|
| ☑ | **重传 `zhonghua` 树 JSON（88 人）** | 真源 `migrate-output/trees/zhonghua.json` 已由 **139 → 88 人**（md5 `2c6fbdcae6cd9b7a1cf811408d7b017d` → **`3cc6089aeaa723247065de2549f060c8`**；`version` / `updated_at` **故意未动**）；云端树 JSON = 云存储 `trees/zhonghua.json`，全量重跑上传即覆盖 |
| ☑ | **手工删云端 51 份 `zhonghua:<handle>` 详情文档** | 云端详情在集合 `jiazu_person_details`（`_id = "<tree_id>:<handle>"`）。⚠️ 上传脚本对详情是 `doc(_id).set()`（**upsert，只增不删**）→ **重跑不会删旧键**，必须**按 `_id` 精确手工删除**；清单 = 候选清单文档 **附录 A**（与 §16-3 原第 ② 步的 `I0046` 合计 **52 份**） |
| ☑ | **重传清理后的集合（若云端有对应变更）** | 本批窗口内 `collections/jiazu_assets.json` / `jiazu_messages.json` / `jiazu_spirit.json` **有写入**，但**来源 = 用户自己的界面操作 + 惰性结算（非本次手术）**，已核实。**以云端实际为准**：云端已有对应变更时**不要**用本地件覆盖（本地覆盖会把云端更新回退），只做核对；`jiazu_wallets` 不属本批（§16-3 原表已列） |
| — | **无需额外重建索引** | **删节点不影响源流链**：`external_chain_gen` 只存在于**详情文档 `attributes`**，被删的 51 个节点**本就不带该属性** → 链节点 **86 → 86**（`GET /tree/rank` 的 `person_count` 亦为 **86**，未变）、无世数平移 ⇒ **不需要重建任何索引、不需要迁移锚点** |
| — | **编号计数器不动** | `jiazu_id_seq` 保持 `person.next = 295` / `family.next = 152`（删节点**不铸号**；§12-3 口径不变） |

**具体命令**

```bash
# ① 全量重跑迁移上传（树 JSON 逐棵覆盖 + 详情 upsert + tree-meta.storage_files 回写）
CB_ENV=liwu-d8gek6jjdab1d087c CB_KEY=<云开发 API Key> \
  node scripts/upload-migrated-to-cloudbase.mjs

# ② ⚠️ 手工删除云端已不存在的详情文档（upsert-only → 必须显式删）
#    清单见 docs/zhonghua-cleanup-candidates-2026-09.md 附录 A：51 个 _id，全部形如 zhonghua:<handle>
#    控制台：云开发 → 数据库 → jiazu_person_details → 按 _id **精确**查询后删除记录
#    或一次性脚本（不入库）：对附录 A 的 51 个 _id 逐个
#        await db.collection('jiazu_person_details').doc(该 _id).remove()

# ③ 本地侧判据（磁盘直读）
python3 -c "import json;d=json.load(open('migrate-output/trees/zhonghua.json'));print(len(d['people']))"   # 期望 88
ls migrate-output/details | grep -c '^zhonghua:'                                                         # 期望 88
ls migrate-output/details | wc -l                                                                        # 期望 236
```

**本地验证证据**（本记录成文时**磁盘直读**实测）

- `people` **88** / `families` **80**；树 md5 **`3cc6089aeaa723247065de2549f060c8`**；`version` / `updated_at` 仍为 `72` / `2026-09-16T05:54:39.003Z`（**故意未动**）。
- 与改前备份件（139 人版）逐 handle 比对：其余 88 人**叶子级零差异**、`families` **深度相等**、`zhonghua:*` 详情 **139 → 88**、全树详情 **287 → 236**。
- 扣费与留痕：竹片 **1094 → 941**（-153 = 51 × 3）、审计 `jiazu_ops_logs` **`op_1789690996088_1qpdiv`**、用户流水 **`tx_mu67t6k81fka9`**（详见 spec §6-5）。
- 备份（**回滚唯一依据**；`/tmp` 会被系统清理 → **必须另存**）：`/tmp/jiazu-batch1-bak-20260918-082012/`（139 人树 JSON）+ `/tmp/jiazu-bak-2026-09-18T00-22-21-710Z/`（树 JSON + **51 份已删详情** = 52 个文件；另有一份**逐字节同内容**的 `/tmp/jiazu-bak-2026-09-18T00-21-32-384Z/`，两者互为副本）。

**阻塞点**：需 CB_ENV / CB_KEY；第 ② 步**必须显式执行**（遗漏 → 云端残留 **51 份孤儿详情**，按 `tree_id` 取详情时命中已删节点，与真源口径分叉 —— 同 §12-2 / §13-2 口径）。

**另记（文档侧）**：候选清单 `docs/zhonghua-cleanup-candidates-2026-09.md` 已在仓库 `docs/` 落盘（头部 = **执行记录/状态**，附录 A = 上云删除清单）；
⚠️ 它**尚未 `git add`**（`git status --short` 显示为 **untracked**）—— 与 `docs/zhonghua-cleanup-2026-09.spec.md`（本册 §6 的批次 1 记录）一同**入库待提交**。

### 16-4 前端 H5（**必须重打包 + hosting 部署**；小程序同理）

**为什么需要**（改动区域逐条）：

| 区域 | 文件 | 改动 |
|---|---|---|
| 首页列表范围 | `frontend/src/pages/index/index.vue` | `normalHalls` = `!isMaster && kind !== 'clan'`（**家族档**只列普通家族树；缺 `kind` 按 family 兼容）。**2026-09-18 起**首页另有**祖谱档**（`kind === 'clan'`），见 **§4-1** |
| 首页三档排序 | 同上 | 排序档 `comprehensive` / `members` / `activity`（默认「综合」）+ 综合分 `0.4×人数 + 0.4×活跃度 + 0.2×新近度`（`max===min` 记 1）+ 统一 tie-break |
| 首页全站搜索 | 同上 | 「搜索人物（姓名 / 编号）」框；受限条显示「权限受限，不可见详情」且**点击只 toast 不跳转**，非受限跳 `/pages/person/detail?tree_id=…&handle=…` |
| 家族树页删资金块 | `frontend/src/pages/hall/index.vue` | **删**「家族树资金」区块 + 「转账支持」入口（连带 `fetchTreeBalance` 调用与 `goTransfer`），导入行同步收敛 |
| 钱包页删转账区 | `frontend/src/pages/wallet/index.vue` | **删**「转账到家族树」区块（-61 行） |
| business 封装 | `business/api.ts` / `business/index.ts` / `business/types.ts` | **删** `transferToTree` / `fetchTreeBalance` 封装与转出；**新增** `searchPeopleGlobal` + `GlobalPersonHit`；`DigitalHallCard.kind?`；rank 类型加 `activity?: number` / `updated_at?: string` |
| 文案同步 | `pages/about/about.vue`、`pages/mine/index.vue` | 「转账支持家族树」→「充值购买站内资产」；「我的钱包」描述「余额 / 充值 / 转账」→「余额 / 充值 / 交易流水」 |
| **建树费文案统一**（后续批次 2026-09-18） | `pages/wallet/index.vue`、`pages/index/index.vue`、`business/asset-guide.ts` | 一律写「**9颗石榴籽**」（数字与量词**连写**、**不带**「完整」）：钱包页余额卡片「新建家族树消耗 9颗石榴籽」（第 8 行，常量 `TREE_CREATE_FEE_SEEDS = 9`）、首页入口行「消耗 9颗石榴籽」（第 101 行）、建树弹窗费用行「建树消耗 9颗石榴籽（可用籽数见「我的资产」）」（第 161 行）、籽域扣费回执 `feeText`「本次消耗 9颗石榴籽，余 N 颗」；**8.4 定稿弹窗正文逐字未动** |

**具体命令**：

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5      # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c
npm run build:mp-weixin                                        # 产物交微信开发者工具上传
```

**本地验证证据**：上表改动与 `docs/home-sort-search.spec.md` §2 / §3 / §5-2（前端消费）/ §8 逐条对应；
`git diff --stat` = `cloudfunctions/compat-api/index.js`、`lib/wallet.js`、`frontend/` 7 个文件、根 `package.json`（**无真源数据文件**）。
**后续批次补记**：建树费文案统一另涉 `frontend/src/business/asset-guide.ts`（上表末行）与 `frontend/src/business/api.ts` 注释，
提交 `dc8214f`；该文案**随本次 hosting 发布**，不与数据手术耦合。
（`npx vue-tsc --noEmit` 与前端真机点测属本轮验收项，**不由本清单代为断言**。）
- **增量（2026-09-18）：首页家族 / 祖谱列表 tab + 卡片人数标签 + 排序行窄屏样式** —— 同一前端产物内的追加改动，
  **上云动作与本节完全相同**（`build:h5` + `build:mp-weixin` + hosting 发布），命令与本地验证证据见 **§4-1**（不重复列）。

**阻塞点**：H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限。

### 16-5 部署后冒烟验证（按序做）

1. **重打包判据**两条都 **≥ 1**：`grep -c 'search/global' cloudfunctions/deploy/compat-api/index.js`、`grep -c 'TREE_FUND_RETIRED' …`（未重打 = 0）；
2. **无需 `X-Tree-Id`**：**不带** `X-Tree-Id` 调 `GET /search/global?query=<姓氏或编号>` → **200**（能走到业务逻辑 = 注册位置正确），不是「缺少 X-Tree-Id」；
3. **搜索契约**：`query=I000123`（或 `123` / `000123`）→ 该人**置顶**且 `matched='id'`；空 / 全空格 `query` → **200 `[]`**；`limit=999` → 实际生效上限 100；
   **被可见性裁剪的真身用其编号搜 → 0 条**（规格 §7-a 已知边界，**不是** bug）；
4. **归并 / 受限**：同一真身的多条镜像命中 → **只出 1 条**；真身可见 → 条目指向真身、`restricted=false`；
   真身不可见 → 条目为镜像、`restricted=true`，且响应**不含**真身的 `handle` / `gramps_id` / `tree_id` / `tree_title`；
5. **`/tree/rank` 增量**：带 `X-Tree-Id` 调 → 200 且含 `activity`（number）与 `updated_at`（string；缺失为 `''`），既有字段仍在；首页三档切换 / 徽章不显示 NaN；
6. **资金下线**：不带令牌 / 带普通令牌 / 带非法金额 / 带 `X-Tree-Id` 等组合调 `POST /wallet/transfer` 与 `GET /wallet/tree-balance`
   → **一律 410 + `code='TREE_FUND_RETIRED'`**；对照 `GET /wallet/balance` → 未登录 **401** / 登录 **200**（证明只下线这两条）；
7. **页面**：首页**家族档**不出现祖谱与世本卡片（**2026-09-18 起首页另有「祖谱」tab，切过去应出现 3 本祖谱卡并在每张卡上带人数标签 —— 见 §4-1**；本步原表述「首页不再出现祖谱卡片」**已过期，勿据此判失败**）；三档排序切换顺序可复现（同分按 `tree_id` 升序）；
   搜索框：受限条点击只出 toast「权限受限，不可见详情」、**不进详情页**，非受限条正常跳人物详情；
   家族树页无「家族树资金」区块、钱包页无「转账到家族树」区块；钱包页建树费文案显示「**新建家族树消耗 9颗石榴籽**」（**不带**空格、**不带**「完整」）。
8. **数据手术后自检（§16-3 + §16-3 追加回读，重要）**：云端树 JSON `trees/zhonghua.json` 的 `people` 数 = **88**（不是 139 / 140）；
   `jiazu_person_details` 按 `_id = zhonghua:103ff1c309eb7bf2cb4f6ff1762e`（`I0046`）与**候选清单文档附录 A 的 51 个 `_id`** 查询**均查不到**（**合计 52 份**均应不存在）；
   云端 `jiazu_wallets/global` 的 `transactions[]` **无** `type='transfer'`、**无** `trees` 字段（若云端本来就没有 → 注明，不作缺陷）；
   首页搜索「顾清学」→ **guest 1 条（受限）/ chief 1 条（祖谱真身）**，按编号 `I0046` 检索 → **0 条**；
   按编号 `I0029` 检索 → **0 条**、搜「季志山」→ **1 条 `ji_23395_01/I000174`**（世本登记节点已删、家族树里的人保留）、搜 `I0000` / `I0051` → **0 条**；
   带 `X-Tree-Id: zhonghua` 调 `GET /tree/rank` → `person_count` = **86**（源流链计数不变 → 无需重建索引）
   （口径与事实见 `docs/zhonghua-cleanup-2026-09.spec.md` §2-5 与 **§6-4 / §6-7**）。

### 16-6 本批**不需要**上云的东西

- **测试文件** `cloudfunctions/compat-api/lib/home-sort-search.test.js`：纯本地动作（落盘 + 已进 `package.json` 的 `scripts.test` + 本地 `npm test`），
  **不进打包产物、不影响云端重传**；`npm test` 跑 `/tmp` 副本，**不得当云端回归**。
- `/tmp` 下的数据副本与取证文件：临时产物。
- 规格与质检文档（`docs/home-sort-search.spec.md` / `docs/home-sort-search.qa.md`）：不进产物、不影响云端。

### 16-7 顺带登记：原「未处理事项」—— **本批已全部处理（2026-09-18 · ✅）**

1. **`auth-server` 遗留转账链路 → ✅ 已处理**：`auth-server/server.js` 的 `/api/wallet/transfer` 与 `/api/wallet/tree-balance` 两条路由、
   `auth-server/wallet.js` 的 `transferToTree` / `getTreeBalance`（含 `type:'transfer'` 流水写入）**均已删除**（提交 `2bf89f7`；`grep` 0 残留）；
   其**钱包数据残留**（`trees` 字段 + `type:'transfer'` 流水，两个文件各 1 条）同批清理（§16-3）。
   该链路**仍属遗留链路、当前不部署**；若日后部署 `auth-server`，需**与本次代码同批发布**。
   事实 / 备份 / 回滚 / 云端同步见 `docs/zhonghua-cleanup-2026-09.spec.md`。
2. **钱包页余额卡片人民币口径 → ✅ 已处理**：文案已由 `新建家族树费用：¥{{ wallet?.tree_create_fee_yuan || '9.90' }}` 改为
   **「新建家族树消耗 {{ TREE_CREATE_FEE_SEEDS }}颗石榴籽」**（`frontend/src/pages/wallet/index.vue` 第 8 行 + 第 85 行常量 `TREE_CREATE_FEE_SEEDS = 9`），
   与经济总纲 `docs/economy.spec.md` **§5-5（建树扣 9颗石榴籽）** 及 **§9 前端落点表** 口径一致（该册 §12-3-⑤ 已同步标 ✅）。
   - 同根因的**附带观察**也一并处理：`frontend/src/pages/index/index.vue` 的新建家族树弹窗**不再取** `fetchWallet().tree_create_fee_yuan`，
     费用行改为「建树消耗 9颗石榴籽（可用籽数见「我的资产」）」（第 161 行）、入口行第 101 行同口径；原 `const feeYuan = ref('9.90')` **已不存在**。
   - **建树费措辞统一口径（用户拍板 2026-09-18）**：一律写「**9颗石榴籽**」（数字与量词**连写**、**不带**「完整」二字），与 8.4 定稿弹窗逐字一致；
     后端 409 文案同步为 `资产不足，需 9颗石榴籽，当前 N 颗`（`lib/economy-ledger.js`）。
     **未动**：玉合成「999 颗石榴籽」、官方竹简「¥9.90/束」、立支 9999 颗石榴籽、竹片 / 玉域的「需 N 片竹片 / 需 N 枚石榴籽玉」写法
     （钱包页残留的 `¥9.90` 全部属**官方竹简售价**语境）。

     ---

## 17. 本批：【批量添加子孙】扩到世本 + 祖谱（含祖谱已故锁 / 祖谱管理面板）+ 移除同世并列弹窗 + 缺陷 A（no-op 不扣费）+ 缺陷 B（写一致性）+ 世本 URI 改 `/z/`（**代码批次 + 数据项**）

> 规格：`docs/chain-batch-append.spec.md`（批量 + 需求一 + **§3-5 祖谱档**）、`docs/uri-aliases.spec.md`（URI 口径，**扩展轮新增**）、`docs/economy-fee.spec.md` §3-2 / §4-3 / **§4-6**（0 片清单与 no-op 口径）、`docs/data-model.md` §7.1（写一致性不变量）。
> 质检汇编：`docs/chain-batch-append.qa.md`（§1–§8 = 上轮 单测 372/372/0 · 真 HTTP · 真机 H5；**§9 = 扩展轮 20/20 · 380/380/0 · 真机 T1–T4 · 变异 2/2 · 真源体检**）。

### 17-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包 + 部署**：新增 **1 条路由** + **5 个文件**变更（`index.js` / `lib/economy-fee.js` / `lib/store.js` / `lib/tree-write.js` / **`lib/child-write.js`（扩展轮）**） | 无（**但不重打包 = 云端新路由 404**，见 §17-7） |
| 2 | CloudBase 集合 | **无**（不新建集合、不加索引：批量续编只写既有树 JSON / 详情 / 编号计数器） | — |
| 3 | 云端数据 | **有 1 项**（**扩展轮新增**）：`config/tree-meta.json` 的 `zhonghua.path_alias` 由 `/zhonghua` 改为 `/z/`，**须随云端数据同步**（见 §17-3） | — |
| 4 | 前端 H5 | **必须重打包 + hosting 部署**（`build:h5` 带 `VITE_API_BASE`）；小程序**同批重打**并上传；**扩展轮追加 6 个前端文件**（`App.vue` / `business/cross-tree.ts` / `components/clan-hall/clan-hall.vue` / `components/tree-pedigree/tree-pedigree.vue` / `components/person-manage-panel/person-manage-panel.vue` / `components/person-archive/person-archive.vue`） | 需确认 hosting 目标与云函数 HTTP 域名 |

### 17-1 云函数 `compat-api`：新增 1 条路由 + 5 个文件变更（**必须重打包 + 部署**）

**为什么需要**（逐条列出本批新增 / 变更）：

| 路由 / 模块 | 变更内容 | 本地验证 |
|---|---|---|
| **`POST /admin/chain-append-batch`** | **新增**（`index.js` 第 2038 行，紧跟单节点续编 `/admin/chain-append`）：鉴权档位 = **仅 `chief_editor`**（401 / 403）；入参 `{tree_id, parent_handle, names}`（**names 由前端解析好**，服务端不解析标点 / 序号；**不接受 `surname`**）；出参 `{ok, start_gen, end_gen, count, added:[{handle,name,gramps_id,gen}], message}`；**仅限中华世本总谱**；每批 ≤ **10 代** / 单名 ≤ **20 字（码点）**；**无 72 / 90 世深度上限** | `lib/chain-append-batch.test.js` **12/12**（含拒绝矩阵 13 条 + 真实 IO 失败注入的原子性 4 条；变异 3/3 有效）+ 全量 `npm test` **372/372/0** + 真机 H5（落盘 3 人严格线性 `少典氏・初代 → 甲(I000310) → 乙(I000311) → 丙(I000312)`、姓随父姓、全 `M` / 全已故、详情 `external_chain_gen` 递 1·2·3 + `external_tree=zhonghua`、**无竹片扣减**） |
| **`lib/tree-write.js`** | **新增** `appendChainBatch` / `normalizeBatchNames` / 导出常量 `MAX_BATCH_CHAIN = 10` / 模块内常量 `MAX_BATCH_NAME_LEN = 20` / `restoreTreeInPlace`（失败就地还原内存树对象，消除幻影）；**变更** `updatePerson`：详情文档**改为树落盘成功之后才写**，详情失败返回 `detailSaved:false`（不回滚树、不退费） | 同上单测（原子性 ⓪①②③：整批只落盘一次 / 详情目录只读 / 树文件只读后详情全部回收 / 铸号计数器失败）+ `lib/noop-edit-integrity.test.js` 第 6·7 例 |
| **`lib/economy-fee.js`** | **新增** `personValueDiff` / `isPersonUnchanged` / `effectivePersonValues`（有效现值 = 树节点 ∪ 详情 `attributes`，与读路径 `toRawPerson` 同口径） | `lib/noop-edit-integrity.test.js` **10/10**（含链节点 no-op、窄 body 未提供键不判变更、反向对照；变异：短路有效现值合并 → 变红、还原旧口径 → 2 条全红）+ 真 HTTP（链节点「姒不降」原样 PUT → `200 unchanged:true / pieces:0` + 树 md5·version·updated_at 三不变 + 零新流水；改 `birth_date` / `death_place` / `is_living` → **各 1 片**） |
| **`index.js`（`PUT /people/<handle>`）** | **变更**：加 **②′ 值级比对**分支 —— 规范化后完全相同 → **200 `{ok:true, unchanged:true, fee:{unit:'bamboos',pieces:0,balance,balance_after}}`**，不写树 / 不写详情 / 零流水；响应新增 `detail_warning`（详情写失败时）；错误出口改走 `errorStatusOf`（**业务错误沿用自身 status；系统级失败 EACCES/ENOENT… → 500**，不吐本机路径） | 真 HTTP：`chmod 0444` → **500 + `fee_refunded:true`** + 磁盘 md5 / version 不变 + 紧接着 `GET` 读回**磁盘真值** + 幻影未落盘（副本变异去掉两层缓存失效 → `PHANTOM_VISIBLE:true`） |
| **`lib/store.js`** | **变更**：`saveTree` 落盘失败 → **原地回滚 `version` / `updated_at`** 且**失效 `treeCache` / `eventIndexCache`**；`updateTree` 闭包（含业务校验）抛错 → 同样失效两个缓存（与 `updateTrees` 的失败处理同口径） | 同上（`noop-edit-integrity.test.js` 第 4·5 例：同进程读回磁盘真值、`version` 未脏、幻影不得落盘） |
| **`lib/tree-write.js`（扩展轮追加）** | **变更**：新增 **`isChainBatchTree(kind)`**（第 672 行，**白名单单一真源** = `zhonghua` ∪ `kind === 'clan'`）；`appendChainBatch` 按白名单拒绝 → **400「批量续编仅适用于中华世本与祖谱」**（第 751 行，**路由不写第二套**）；**祖谱世数结构推导**（始祖 = 第 1 世：`founder_handle → founder_gramps_id → I0001`，沿 `families` 父/母 BFS 递 1，节点自带 `external_chain_gen` 时以其为准，断链 → **400「该节点不在祖谱世系内」**）；祖谱详情**不写 `external_tree`**；祖谱新节点 surname 随父姓 / `gender='M'` / `is_living=false` / 单事务 ≤ 10 代 / **0 片**；**不设任何深度上限** | `lib/chain-append-batch.test.js` **20/20** + 全量 `npm test` **380/380/0** + 真机 T3（`季花→季甲→季乙→季丙` 严格线性、`external_chain_gen` 2/3/4、**无 `external_tree`**、md5 `15668641c175d55cbd7cd2facbdc5b1b` 不变 = 0 片） |
| **`lib/child-write.js`（扩展轮）** | **新增/变更**：`deceasedLockedTree(treeId, masterTreeId)`（第 **24** 行）—— 已故锁判据 = **master 或 clan**；锁定树内新建子节点恒 `is_living=false` | 真机 T4（祖谱 403 + **普通树同 PUT → 200**）+ 单测 |
| **`index.js`（扩展轮追加）** | **变更**：`/admin/chain-append-batch` 白名单分支 → **400「批量续编仅适用于中华世本与祖谱」**（第 **2045** 行，与 `lib/tree-write.js` 同一真源）；**祖谱鉴权档 = `requireWriteUser`**（本树 tree_steward + `chief_editor`），**未登录恒 401**；`PUT /people/<handle>` 显式 `is_living:true` 对**祖谱** → **403「祖谱节点一律为「已故」，在世状态不可修改」**（**世本同类文案逐字不变**） | 真机 T1–T4 + 单测（鉴权分档 / 已故锁 / 普通树不受影响） |

**具体命令**（仓库根；写法同 §1 / §11-1 / §16-1）：

```bash
# ① 重打包（产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
--bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
--outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c

# ③ 重打包判据（两条都要 ≥ 1；未重打 = 0）
grep -c 'admin/chain-append-batch' cloudfunctions/deploy/compat-api/index.js
grep -c 'detail_warning'          cloudfunctions/deploy/compat-api/index.js
```

- **本批不新增集合、不改 `cloudbaserc.json`、不动环境变量**（`MASTER_TREE_ID=zhonghua` / `COMPAT_SOURCE=cloud` 均沿用）。
- ⚠️ `cloudfunctions/deploy/compat-api/index.js` 若仍是旧产物，则**同时落后 §16 与 §17 两批改动** → 云端 `/search/global` 与新路由一起缺。

### 17-2 CloudBase 集合：**无**

- 不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（批量续编只写既有树 JSON、详情文档与编号计数器）。

### 17-3 云端数据：**有 1 项（扩展轮新增：`tree-meta` 的 `path_alias`）**

| # | 数据项 | 动作 | 依据 / 备份 |
|---|---|---|---|
| 1 | `config/tree-meta.json` → `trees.zhonghua.path_alias` | 由 **`/zhonghua` 改为 `/z/`**，**须随云端数据同步**（云端 `tree-meta` 仍为旧值时，`/z/` 的世本路径无数据别名支撑） | 2026-09-18 **真源手术**；备份 **`~/jiazu-backups/20260918-144857-tree-meta-alias/`**；口径见 `docs/uri-aliases.spec.md` §4 |

- 其余**无变化**：不重跑迁移上传、无 `jiazu_person_details` 手工删除、不动 `jiazu_id_seq`。
- 本批的「零写入」证据只在**本地副本**上采集（质检汇编 §6 与 **§9-4**）；云端的编号计数器由**线上新增节点时自然递增**（`gramps_id` 取全站单计数器），**不需要任何离线同步动作**。
- ⚠️ 该数据项与**云函数重打包是两件事**：重打包只解决路由 404；`path_alias` 需在**云端数据侧**一并落地（见 §17-7）。

### 17-4 前端 H5（**必须重打包 + hosting 部署**；小程序同批）

| 区域 | 文件 | 改动 |
|---|---|---|
| 批量面板（第三颗按钮） | `components/person-manage-panel/person-manage-panel.vue` | 新增 `＋ 批量添加子孙` 按钮 + 内联面板：提示语含「**一条线单传**」「**不要填写分支**」、姓 input **预填父姓且 `disabled=true`**（面板内**无改姓入口**）、解析预览、二次确认弹窗（标题「批量添加子孙确认」）、成功 toast 用后端 `message` + 关面板 + 刷新、失败文案落面板错误区 |
| 单节点续编删弹窗（需求一） | 同上 | 续编成功后**不再弹**「第 N 世已有节点 / 同世并列显示为分支」；仅 toast + 关面板 + 刷新（**同世并列数据事实不变**） |
| 批量解析纯函数 | `business/chain-batch.ts`（新增） | `parseBatchNames` / `formatBatchPreview` / `buildBatchConfirmContent` + `BATCH_MAX_GEN = 10` / `BATCH_MAX_NAME_LEN = 20` |
| API 封装 | `business/api.ts` | 新增 `appendChainBatch(treeId, parentHandle, names, token)`（**只传「名」，不发 `surname` 字段**） |
| 保存 dirty 比对（缺陷 A 前端侧） | `components/person-archive/person-archive.vue` | 与后端同一口径的 dirty 判定；**「只改父节点编号」不算未修改**，改父仍照常走 `reparent` |
| 首页家族 / 祖谱 tab + 人数标签 + 窄屏样式 | `pages/index/index.vue` | 见 **§4-1**（同一前端产物内的追加改动，随本次发布） |
| **URI 口径（扩展轮）** | `App.vue` | `MASTER_PATH = '/z/'`（第 **18** 行）；接受 `/z`、`/z/`、`#/z/`、`/z/zhonghua` → 世本（**地址栏保持 `/z/`**）；旧 **`/zhonghua`（path / hash）→ 客户端重定向 `/z/`**；⚠️ **`/z/zhonghua` 判定必须先于 `CLAN_PATH_RE`**（第 12 行正则会把 `zhonghua` 当祖谱 `tree_id`；代码注释第 35 行已登记该顺序约束） |
| **跨树跳转路径输出（扩展轮）** | `business/cross-tree.ts` | `MASTER_PATH = '/z/'`（第 **15** 行）；对 `is_master` / `zhonghua` **统一输出 `MASTER_PATH`**（不再输出 `/zhonghua`） |
| **祖谱接管理面板（扩展轮）** | `components/clan-hall/clan-hall.vue` | 给 `TreePedigree` 传 **`tree-manage`** + **`@tree-changed`**（第 99–102 行）→ 祖谱**自有段首次获得完整谱系管理面板**（加父 / 加子 / 加配偶 / 批量） |
| **谱系组件契约（扩展轮）** | `components/tree-pedigree/tree-pedigree.vue` | **必须声明 `treeManage` prop（第 126 行，默认 `true` 第 134 行）** 并 `emit('tree-changed')` —— 不声明则属性**静默失效**（无报错、面板不接） |
| **批量按钮祖谱分支（扩展轮）** | `components/person-manage-panel/person-manage-panel.vue` | 批量按钮条件分两支：世本 `canAppendChain`（不变）｜祖谱 **`canAppendClanBatch`**（第 **355** 行）= `treeKind === 'clan' && canAddNode && !isChainMirror`（**顶端链镜像 `external_link_type === 'chain'` 不可作父节点**）；**普通树两处都不渲染**；祖谱预览用**相对序号**（`后代 1 → 甲；后代 2 → 乙…`，前端拿不到结构世数、**不猜**）；成功 toast 统一用后端 `message` |
| **祖谱已故锁定 UI（扩展轮）** | `components/person-archive/person-archive.vue` | 祖谱节点在世状态显示**锁定态 `已故（本谱锁定）`**、不提供在世开关（与后端 403 同口径） |

**具体命令**：

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5      # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c
npm run build:mp-weixin                                        # 产物交微信开发者工具上传
```

**本地验证证据**：真机 H5 两轮（T1 单节点续编无弹窗；T2 批量面板元素 / 预览 / 确认弹窗 / 线性落盘）见 `docs/chain-batch-append.qa.md` §2；
`npx vue-tsc --noEmit` 属质检轮结论（**不由本清单代为断言**）。

### 17-5 部署后冒烟验证（按序做）

1. **重打包判据**两条都 **≥ 1**：`grep -c 'admin/chain-append-batch' cloudfunctions/deploy/compat-api/index.js`、`grep -c 'detail_warning' …`（未重打 = 0）；
2. 未鉴权 `POST /admin/chain-append-batch` → **401**（云端不再 404）；
3. 非 `chief_editor` 账号同请求 → **403**「需要总编辑权限」；
4. `chief_editor` + `names` 3 项（总谱链节点为父）→ **200**：`{ok,start_gen,end_gen,count:3,added[3],message:'已续编第 A–B 世，共 3 代'}`；**落盘 3 人严格线性**、姓随父姓、全 `M` / 全已故、详情 `external_chain_gen` 递 1·2·3 + `external_tree=zhonghua`；**竹片余额前后一致**（新增类 0 片，`GET /assets/summary` 对照）；
5. 链节点「原样 PUT」（GET → 不改 → PUT）→ **200 `unchanged:true` / `fee.pieces:0`**，树 `version` / `updated_at` 不变、**零新流水**；
6. 只改 `birth_date`（或称号）→ **200 + 1 片**（no-op 判定不放水）；
7. 前端：人物管理面板出现第三颗按钮 → 复制 3 个名字 → 预览 / 确认弹窗文案正确 → 提交后 toast 文案 + 面板关闭 + 树刷新；
8. 前端：单节点续编成功 → toast + 关面板，**无任何弹窗**；
9. 云函数日志无 `EACCES` / 本机路径泄漏（系统级失败一律 500 + 通用文案）。
10. **扩展轮 · URI**：浏览器打开 `/z/` → 世本（**地址栏保持 `/z/`**）；`/zhonghua` → **重定向 `/z/`**；`/z/ji_23395` → 仍为祖谱；
11. **扩展轮 · 白名单**：普通家族树 `tree_id` 调 `POST /admin/chain-append-batch` → **400「批量续编仅适用于中华世本与祖谱」**；祖谱（`kind === 'clan'`）本树 tree_steward 同请求 → **200**；
12. **扩展轮 · 祖谱落盘**：祖谱链节点为父、`names` 3 项 → 落盘**严格线性**、姓随父姓、全 `M` / 全已故、详情 `external_chain_gen` 递 1 且**无 `external_tree`**、竹片余额前后一致（**0 片**）；
13. **扩展轮 · 已故锁**：祖谱节点 `PUT /people/<handle>` 显式 `is_living:true` → **403**（文案含「祖谱」）；**普通家族树同 PUT → 200**（不受影响）；
14. **扩展轮 · 祖谱管理面板**：祖谱页（`/z/<tree_id>`）人物档案出现**完整谱系管理面板**（加父 / 加子 / 加配偶 / 批量）；批量面板姓 input `disabled`、**无可点击改姓元素**。

### 17-6 本批**不需要**上云的东西

- **测试文件** `cloudfunctions/compat-api/lib/chain-append-batch.test.js` / `lib/noop-edit-integrity.test.js`：纯本地（已进 `package.json` 的 `scripts.test`），**不进打包产物**；`npm test` 跑 `/tmp` 副本，**不得当云端回归**。
- **文档**：`docs/chain-batch-append.spec.md` / `docs/chain-batch-append.qa.md` / **`docs/uri-aliases.spec.md`（扩展轮新增）** / 本清单 §17：不进产物、不影响云端。
- `/tmp` 下的副本与取证文件（含截图 `/tmp/jz-qa3-p1-batch.png`）：临时产物。

### 17-7 阻塞点

⚠️ **必须先重打包云函数产物**：`cloudfunctions/deploy/compat-api/index.js` 当前仍是**旧产物**（已落后 §16 与 §17 两批改动）。
不重打包直接部署或不部署 → 云端 `POST /admin/chain-append-batch` 返回 **404**，且 `PUT /people/<handle>` 仍按旧口径**误扣 1 片**（无 no-op 分支）、写一致性缺陷 B 仍在。
重打包判据见 §17-5 第 1 条（两条都要 ≥ 1）。

**阻塞点沿用（扩展轮不改结论）**：仍以「**必须先重打包云函数产物**」为唯一硬阻塞。
⚠️ 扩展轮另有**独立的数据项**（§17-3：`tree-meta.zhonghua.path_alias` 由 `/zhonghua` 改为 `/z/`）需**随云端数据同步**；**重打包不覆盖该数据项**，两者都要做。

---

## 18. 本批：镜像节点「点开即真身」（口径 A · **纯前端批次**）

> 规格 = `docs/marriage.spec.md` **§9-7**（镜像节点口径 A 九条，Kevin 2026-09-19 拍板）+ **§9-3 / §9-4**（差距表两条修订）+ **§10**（前端落点）+ **§11-4**（登记项：首页卡片人数未单列镜像 —— **已由本清单 §21 落地**）。
> **本批性质**：**纯前端改动** —— **无新增云函数路由、无新增集合、无数据变更**（三项均为「本轮无」，见 §18-0 第 1–3 行）。
> **实施状态：已实施 + 真机质检通过（2026-09-19）**（证据见 §18-1「本地验证证据」）；本清单只登记**上云动作**。

### 18-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **本轮无**（0 条新路由、`cloudfunctions/**` 本批 0 改动）→ **不需要为本批单独重打包**；若与 §16 / §17 尚未上云的改动同一次发布，按 **§17-1** 一次性重打即可 | — |
| 2 | CloudBase 集合 | **本轮无**（不新建集合、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`，保持 §11-2 的 **12 项**） | — |
| 3 | 云端数据 | **本轮无**（`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰；不重跑迁移上传、无手工删键、不动 `jiazu_id_seq`） | — |
| 4 | 前端 H5 / 小程序 | **必须重打包 + hosting 部署**（`build:h5` 带 `VITE_API_BASE`）；小程序**同批重打**并上传 | 需确认 hosting 目标与云函数 HTTP 域名 |

### 18-1 前端产物（**必须重打包：H5 + 小程序**）

**为什么需要**

- 镜像节点口径 A（`docs/marriage.spec.md` §9-7）改变了**三处前端行为**，不重打包则线上仍是旧行为：
  - **树图卡片角标**：由单一「外」角标改为按 `external_link_type` **分档**（`marriage` 外树配偶 / `child` 外树子女 / `founder` 外树始祖 / `chain` 外树上层链 / 其它 外树登记；§9-7-6）；
  - **树图统计栏**：由「含外树配偶 M」改为**按档分列、只显示大于 0 的档**（形如 `外树子女 2 · 外树始祖 1`；§9-7-7）；分档统计**按当前可见森林里实际绘制出的镜像节点**计算 —— `外树配偶` 档可为 **0**，属正常（见 §9-7「统计栏口径澄清」）；
  - **点镜像 → 打开真身档案**（`treeId = external_tree`、`handle = external_person_handle`；§9-7-2）＋ 档案**顶部镜像标注**（§9-7-3）＋ 编辑 / 谱系管理按**真身树权限**判定（§9-7-4）＋ 真身不可见 / 拉取失败**回退镜像本树副本**并提示「真身内容不可见」（§9-7-5）。
- 改动落点（规格 §10）：`frontend/src/business/cross-tree.ts`（新增纯函数 `mirrorTargetOf` / `mirrorLabelOf`）、`frontend/src/components/tree-pedigree/tree-pedigree.vue`（角标分档 + 统计栏分档）、`frontend/src/components/person-archive/person-archive.vue`（顶部镜像标注 prop + 打开 / 权限 / 回退口径）。
- **两条红线不随本批改动**：管理选人 / 审批选人列表**保留镜像本身、不做解析**（§9-7-8，写路径依赖镜像 handle）；`external_link_type='branch'` 分迁占位**维持跳转新树**（§9-7-9）。

**具体命令**

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5      # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c

npm run build:mp-weixin                                        # 产物交微信开发者工具上传
```

**本地验证证据**

- ✅ **真机质检通过（2026-09-19 · 真机质检裁定；数值照抄，不得改写）**：
  - **树图渲染完整性**（口径 A 的前置修复，规格 §9-7-10）：顾树 `gu_39038_01` 树图 `serie.data` **23 项**（**1 虚拟根 + 22 真人**）、**有图形元素的真人项 = 22**、`notDrawn` **空**；
  - **点镜像 → 打开真身档案**：chief 点 `I000294` → 弹窗顶部「**本节点为 季氏费县白露家族 000159 的镜像 · 内容取自真身**」、**编号行显真身 `000159`**；点 `I000293` → 同口径得 **`000149`**；
  - **真身不可见 → 回退本树副本**：guest 点 `I000143` → 回退副本 + 提示「**真身内容不可见**」、`exceptions = 0`；
  - **祖谱顶端链镜像**（`clan-hall`，姒期视）→ 「**本节点为 中华世本 · 全球华人家谱总谱 0137 的镜像**」；
  - **统计栏分档实测 = 「外树子女 2 · 外树始祖 1」**（**无「外树配偶」档**，属设计，见 `docs/marriage.spec.md` §9-7「统计栏口径澄清」）。
- ✅ **深链页（`frontend/src/pages/person/detail.vue`）三用例 + 变异验证**：① chief → 收敛到真身；② guest → 回退副本且**地址栏收敛回镜像原坐标**；③ 非镜像节点 → 行为不变。**变异验证**：移除回退收敛那一行 → `reload` 后 body **20 字**错误页 + **2×404**。
- **真源事实锚点**（真源已核对，可作部署后冒烟的对照值）：
  - `gu_39038_01` `I000294` 季贺为 = 镜像（`external_mirror='true'`、`external_link_type='child'`、`external_tree='ji_23395_01'`、`external_person_handle=103f95b87eae32faba04050101ed`）→ 真身 = `ji_23395_01` **`I000159`**；
  - 同树另有镜像 `I000143`（`founder` → 祖谱 `gu_39038`）、`I000292`（`marriage`）、`I000293`（`child`）⇒ 共 **4 个镜像**（`person_count = 23` → 真人 **19**）；
  - ⇒ 该树树图统计栏**真机质检裁定（2026-09-19）= `外树子女 2 · 外树始祖 1`**，**没有「外树配偶」档** —— 不是缺陷、是设计：`marriage` 类型镜像 `I000292` 季清昆是「**配偶姻亲根**」，被 `frontend/src/business/pedigree.ts`（**第 108-129 行**「排除配偶姻亲根」）恒排除、**不作为树图节点**；`marriage` 档只在「**婚姻镜像本身构成树图节点**」时才可能出现（口径见 `docs/marriage.spec.md` §9-7「统计栏口径澄清」）。

**阻塞点**

- H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §4 / §16-4 / §17-4）。
- **不阻塞本清单其它项**：本批无后端 / 集合 / 数据动作（§18-0 第 1–3 行「本轮无」），可与 §16 / §17 的前端重打包**同一次发布**。
- **未决项已落地**：**首页卡片人数单列镜像**（`GET /tree/rank` 新增出参 `mirror_count`；`person_count` **含镜像**，实测 `gu_39038_01` = 23 含 4 个镜像 → 真人 19）→ 见本清单 **§21**（规格 `docs/marriage.spec.md` **§11-4** 已回写为「**已实施 + 冒烟（2026-09-19）**」）；**`mirror_count` 只用于展示、排序归一化仍用 `person_count`**。

### 18-2 本批**不需要**上云的东西

- **本轮无新增云函数路由、无新增集合、无数据变更**（三项明确「本轮无」）：`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 保持 §11-2 的 **12 项**；`jiazu_id_seq` 不动；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰。
- **纯前端临时产物**：`/tmp` 下的真机点测截图与副本：临时产物，不上云。
- **文档**：`docs/marriage.spec.md`（本轮 §2 / §6 / §9-3 / §9-4 / §9-7 / §10 / §11-4 回写）与本清单 **§18**：不进产物、不影响云端。

---

## 19. 本批：跨树嫁娶配偶发现通道（口径 A+B · **代码批次：新增 1 条路由 + 前端弹窗**）

> 规格 = `docs/marriage.spec.md` **§9-8**（八条，Kevin 2026-09-19 拍板）+ **§10**（后端 / 前端落点）+ **§11-5**（登记项：发现通道与镜像候选，**本轮不改**）；权限登记 = `docs/permission-tier.spec.md` **§11**（定点例外：跨树选配偶发现通道）。
> **本批性质**：云函数 `compat-api` **新增 1 条路由** `GET /search/marriage-candidates`（**必须重打包，否则云端 404**）+ 前端娶入 / 嫁出弹窗改调该通道并新增「按全局编号指定」输入框（**必须重打包**）；**CloudBase 集合与云端数据：无变化**（§19-2 / §19-3 均为「无」）。
> **实施状态：已实施 + 冒烟 / 单测通过（2026-09-19）**（证据见 §19-1 / §19-4「本地验证证据」）；本清单只登记**上云动作**。

### 19-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包 + 部署**：**新增 1 条路由** `GET /search/marriage-candidates`（`index.js`，**注册在树编辑闸门之前**）→ 不重打包 = 云端 **404** | 无（硬阻塞见 §19-7） |
| 2 | CloudBase 集合 | **无**（不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`，保持 §11-2 的 **12 项**） | — |
| 3 | 云端数据 | **无**（不重跑迁移上传、不动 `jiazu_id_seq`、无手工删键；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰） | — |
| 4 | 前端 H5 / 小程序 | **必须重打包 + hosting 部署**（`build:h5` 带 `VITE_API_BASE`）；小程序**同批重打**并上传（落点 `frontend/src/business/api.ts` + `components/person-archive/person-archive.vue`） | 需确认 hosting 目标与云函数 HTTP 域名 |

### 19-1 云函数 `compat-api`：新增 1 条路由（**必须重打包 + 部署**）

**为什么需要**

| 路由 | 变更内容（口径 = 规格 §9-8） | 本地验证 |
|---|---|---|
| **`GET /search/marriage-candidates`** | **新增**（`index.js`；**必须注册在树编辑闸门之前** —— 闸门 `缺少 X-Tree-Id` 在**第 2331 行**，同段先例 `GET /search/global` 在**第 2096 行**）：① **需登录**（无有效 JWT / token 失效 / 过期 → **401**，**不得**静默回落 guest 档）；② **不套节点级读裁剪**（**不调用** `isHiddenPerson`）→ 这是 `docs/permission-tier.spec.md` **§11** 登记的**唯一**定点例外；③ 入参 `query` / `tree_id` / `gender`（可空；`tree_id` 走**查询参数**）；④ 出参**五键白名单**：`handle` / `gramps_id` / `name` / `gender` / `is_living`（**不得**返回生卒 / 出生地 / 详情 / 家族关系 / `external_*` 指针 / 真身 handle·编号·树）；⑤ 性别口径**不变**（娶入取 `F`、嫁出取 `M`，**性别未知 `U` / `0` 不列入**）；⑥ 上限沿用 `/search` 的 **20**（可配）、**空 `query` → `200 []`** | ✅ **已实施 + 冒烟通过（2026-09-19；数值照抄，不得改写）**：未登录 → **401 `{"error":"登录已过期或未登录"}`**（**不降级 guest**）；member（`13800000001`）搜 `gu_39038_01`「景月」→ **1 条** `I000140 顾景月 F`、搜 `long_40857_01`「扬」→ **1 条** `I000239 龙扬 F`（**修复前**同身份树内 `/search` 对照：guest **0** 条 / 季树 member **0** 条 / chief **1** 条）；出参键集**恰为五键**；**镜像排除**：`I000292` 计 **0**；空 `query` → **`200 []`**。**单测** `cloudfunctions/compat-api/lib/marriage-candidates.test.js` **11/11**（已注册进根 `package.json` 的 `scripts.test`）；**变异验证**（改回套 `isHiddenPerson`）= **5 pass / 6 fail**；**真源 28 个文件 md5 前后一致** |

**具体命令**（仓库根；写法同 §1 / §11-1 / §16-1 / **§17-1**）

```bash
# ① 重打包（产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
--bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
--outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c

# ③ 重打包判据（≥ 1；未重打 = 0）
grep -c 'search/marriage-candidates' cloudfunctions/deploy/compat-api/index.js
```

- **本批不新增集合、不改 `cloudbaserc.json`、不动环境变量**（`MASTER_TREE_ID=zhonghua` / `COMPAT_SOURCE=cloud` 均沿用）。
- ⚠️ `cloudfunctions/deploy/compat-api/index.js` 若仍是旧产物，则**同时落后 §16 / §17 / §19 三批改动**（§18 是纯前端批次、不含云函数改动）。

### 19-2 CloudBase 集合：**无**

- 不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（保持 §11-2 的 **12 项**）；本通道**只读**既有树 JSON（内存态），不落任何新集合。

### 19-3 云端数据：**无**

- 不重跑迁移上传、不动 `jiazu_id_seq`、无手工删键；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰。

### 19-4 前端产物（**必须重打包：H5 + 小程序**）

**为什么需要**

- 娶入 / 嫁出弹窗**改调**新通道（原走树内 `GET /search` → 受节点级分层裁剪，目标树近代女性节点搜不到）；**不重打包则线上仍是旧行为**（弹窗仍只搜到 0 条，且不区分「被隐藏」与「确实无此人」）。
- 改动落点（规格 §9-8 / §10）：`frontend/src/business/api.ts`（在 `searchPeople`（**约 1680 行**）旁新增发现通道查询函数）+ `business/index.ts`（导出）+ `components/person-archive/person-archive.vue`：
  - `doSearchMarry`（**第 2115-2138 行**）改调新通道；
  - 空态（**第 452 行**）由「未找到…节点」单一句**拆三态**：① 未登录 / 登录过期（401）② 通道错误 ③ 确实无匹配；
  - **新增「按全局编号指定」输入框**（兜底；**编号优先、可与搜索共存**；编号解析失败文案**沿用后端现有文案**）；
  - `filter(p => p.gender === want)`（**第 2132-2133 行**）**保留**（性别口径不变）。
- **红线不随本批改动**：树内 `/search` **保留镜像**、`GET /search/global` **按镜像归并**两条分工**均不变**（`docs/marriage.spec.md` §9-7 / §9-8 第 7 条）；管理选人 / 审批选人列表**保留镜像本身、不做解析**（§9-7-8）。

**具体命令**

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5      # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c

npm run build:mp-weixin                                        # 产物交微信开发者工具上传
```

**本地验证证据**

- ✅ **已实施 + 冒烟 / 真机质检通过（2026-09-19；数值照抄，不得改写）**：
  - **发现通道**（§19-1 表格 / §19-5 第 2–6 条）：**未登录 → 401「登录已过期或未登录」**（**不降级 guest**）；member（`13800000001`）搜 `gu_39038_01`「景月」→ **1 条** `I000140 顾景月 F`、搜 `long_40857_01`「扬」→ **1 条** `I000239 龙扬 F`（**同身份**树内 `/search` 对照 = **0 条**）；出参键集**恰为五键**；**镜像排除**：`I000292` 计 **0**；**单测 11/11**（已注册进根 `package.json` 的 `scripts.test`）；**变异验证 = 5 pass / 6 fail**；全量 `npm test` = **391 tests / 391 pass / 0 fail**（⚠️ 该计数跑于 **2026-09-19 12:10**；其后**并发工作流**改过 `cloudfunctions/compat-api/lib/tree-write.js` / `lib/clan.js` ⇒ **提交前必须重跑**，本条**不据此断言当前工作区全绿**）；**真源 28 个文件 md5 前后一致**。
  - **选人与三态（T2 / T4）**：**管理选人**（加子 → 从树中选择）搜「清昆」→ 候选 `季清昆 / 000292`（**未被解析成真身**、**无 000254** ⇒ §9-7-8 红线：写路径选人**保留镜像本身**）；**娶入弹窗** ① 龙树搜「扬」→ **龙扬 / 000239 / 女** ② 空态文案「**未找到符合条件的女性节点**」 ③ 填 `000140` → 确认文案**含 000140**、按钮 **disabled → enabled** ④ **真实 401** → 文案「**登录已过期，请重新登录**」；**全程非 GET 请求 = 0**。
- 可供部署后冒烟复用的**对照锚点**：`GET /search/global` 镜像归并**不变**的锚点 = 搜「季贺为」只返 **1 条**（真身 `ji_23395_01` `I000159`）。

**阻塞点**

- H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §4 / §16-4 / §17-4 / §18-1）。
- **硬阻塞 = 必须先重打包云函数产物**（§19-7）：不重打包则云端 `GET /search/marriage-candidates` **404**，前端改调后**必然落在「通道错误」档**。
- **未决项不在本批**：发现通道的**镜像候选**（字段白名单不含 `external_*` ⇒ 前端无从辨别）按规格 **§11-5** 登记为「另需拍板、本轮不改」；**不影响本批上云**。

### 19-5 部署后冒烟验证（按序做）

1. **重打包判据 ≥ 1**：`grep -c 'search/marriage-candidates' cloudfunctions/deploy/compat-api/index.js`（未重打 = 0）；云端同路径不再 **404**；
2. **未登录**（无 `Authorization`）`GET /search/marriage-candidates?query=景月&tree_id=gu_39038_01` → **401**（**不得** `200 []`、**不得**按 guest 档返 0 条）；
3. **失效 / 过期 token** 同请求 → **401**（**不降级 guest** 档 —— 本批的定点判据）；
4. **已登录**（非该树成员即可）同请求 → **200** 且含 `I000140` 顾景月（`gender 'F'`）；`long_40857_01` 搜「扬」→ 含 `I000239` 龙扬；
5. **出参键集恰为五键**（`handle` / `gramps_id` / `name` / `gender` / `is_living`）：**无** `birth_date` / `death_date` / 详情字段 / `external_*` / 真身 handle·编号·树；
6. **性别口径**：娶入取 `F`、嫁出取 `M`；**`U` / `0` 不列入**；空 `query` → **`200 []`**；超上限返回 **≤ 20** 条；
7. **非例外回归（必须不变）**：树内 `GET /search?query=景月&tree_id=gu_39038_01`（带 `X-Tree-Id`）→ guest 仍 **0 条**；`GET /search/global?query=季贺为` → 仍 **1 条**（镜像归并）；隐藏节点 `GET /people/<handle>` → 仍 **404**；`GET /tree/rank` 的 `access` 元信息不变；
8. **前端三态文案**：未登录 / 登录过期点搜索 → 文案为「未登录 / 登录过期」档；后端不可达（副本停服）→ 文案为「通道错误」档；确认无匹配 → 文案为「确实无匹配」档（**三态可辨**）；
9. **前端编号兜底**：弹窗「按全局编号指定」填 `I000140`（或 `000140`）→ 提交 `/marriage-request` 成功（**编号优先**、可与搜索共存）；填错编号 → 报错文案与后端一致（`找不到编号/句柄为「…」的配偶节点`）。

### 19-6 本批**不需要**上云的东西

- **本批无新增集合、无数据变更**（§19-2 / §19-3 均「无」）：`COLLECTIONS` 保持 §11-2 的 **12 项**；`jiazu_id_seq` 不动；`migrate-output/**` 与 `config/tree-meta.json` 未被触碰。
- **测试文件**（实施侧新增的单测，如 `cloudfunctions/compat-api/lib/marriage-candidates.test.js`）：纯本地，**不进打包产物**。
- **文档**：`docs/marriage.spec.md`（本批回写 §9-8 / §10 / §11-5）、`docs/permission-tier.spec.md`（本批登记 §11）、本清单 **§19**：不进产物、不影响云端。
- `/tmp` 下的副本与取证文件：临时产物。

### 19-7 阻塞点

⚠️ **必须先重打包云函数产物**：不重打包 → 云端 `GET /search/marriage-candidates` 返回 **404**（前端弹窗三态会落在「通道错误」档）；重打包判据见 §19-5 第 1 条。
> 📌 **现状（2026-09-19 12:50 校验）**：产物**已由并发批次重打**（`cloudfunctions/deploy/compat-api/index.js` = **998,338 B** / md5 `d61a8aebfb3f3095baae4e1e731fd675`，与 §20-1 登记值一致），其中 `grep -c 'search/marriage-candidates'` = **1** ⇒ 本批路由**已在产物内**；**`tcb fn deploy` 仍未执行**（本清单不代劳）。
⚠️ 本批**不前置**任何数据项（§19-3「无」），故**无**「重打包覆盖不到的数据项」这类并行阻塞（与 §17-7 不同）。

---

## 20. 本批：tree_id 注音修复（pinyin-pro 姓氏模式）+ 3 棵树原地改名迁移 + 输入类校验错误自带 400（**代码批次 + 数据项**）

> **本批性质**：云函数 `compat-api` **必须重打包 + 部署**（注音逻辑与错误码都在函数内）；**CloudBase 集合：无变化**；**云端数据：有 3 棵树改名**（`tree-meta` + 树 JSON + 详情文档，**旧 URL 不留别名**）。
> **本批状态**：注音修复 + 3 棵树迁移 + 云函数重打包**均已完成**（`npm test` **398/398 全绿**，含收尾轮新增的 2 条 `status === 400` 断言）；本节只登记**上云动作**，**`tcb fn deploy` 不在本清单执行**。

### 20-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包（已完成）+ `tcb fn deploy`**：`lib/tree-write.js` 的 `surnamePinyin` 改 `pinyin-pro` 姓氏模式、删掉 `PINYIN_MAP[char]` 的 `'shi'` 静默兜底、输入/校验类拒绝改自带 `status:400`；**不部署 = 云端继续按旧逻辑把未收录姓氏写成 `shi_*`**，且输入类拒绝仍回 `{"error":"服务内部错误","status":500}` | ⚠️ 产物体积（§20-1）；部署后需重启实例刷内存缓存 |
| 2 | CloudBase 集合 | **无**（不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`） | — |
| 3 | 云端数据 | **有**：3 棵树原地改名（§20-2）→ 重传 `tree-meta` + 3 个树 JSON + 5 个详情文档 + **核对 `jiazu_assets`（本地已改写 7 处旧 id 引用）** | 旧 URL 不留别名：改名前已发出的链接会 404（预期） |
| 4 | 前端 H5 / 小程序 | **本批无上云动作**：`business/tree-id.ts` 只删了前端那份重复拼音表与**无消费者**的 `charToPrefix` / `makeTreeId`（行为不变，H5 不引 `pinyin-pro`） | — |

### 20-1 云函数 `compat-api`（**必须重打包（已完成）+ 部署**）

**为什么需要**：`cloudfunctions/deploy/compat-api/index.js` 是**打包快照** —— 不重打，云端继续用旧注音逻辑（未收录姓氏一律 `shi_*`）与旧错误处理（输入类拒绝被 `eco.errorPayload` 吞成「服务内部错误」）。

```bash
# ① 重打包（✅ 已完成；同时覆盖 §16 / §17 / §19 的云函数改动 —— 同一份产物）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
--bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
--outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（**本清单不执行**；cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c

# ③ 重打包判据（两条都要）
grep -c '|| "shi"' cloudfunctions/deploy/compat-api/index.js                     # → 0（旧静默兜底不得再出现）
grep -Fc '\u65E0\u6CD5\u6CE8\u97F3' cloudfunctions/deploy/compat-api/index.js   # → 2（「无法注音」文案在产物内）
# 注：esbuild 默认 --charset=ascii，产物里的中文是 \uXXXX 转义 → 中文判据须用 grep -F 定长匹配
```

- **产物体积 106,888 → 998,225 B**（≈ +0.9 MB，全部来自 `pinyin-pro` 拼音词典）；收尾轮再重打后实测 **998,150 B**（源码注释/短函数名增减所致，同一量级）；**本批（立支建树路径补 `surname_pinyin`）再次重打后为 998,338 B / md5 `d61a8aebfb3f3095baae4e1e731fd675`**（旧值 998,150 B / `dc5de32e0c92b5961703e3f0b3fcf8f0`；判据不变：`grep -c '|| "shi"'` = 0、`grep -c 'PINYIN_MAP'` = 0、`grep -Fc '\u65E0\u6CD5\u6CE8\u97F3'` = 2、`grep -c 'surname_pinyin'` = 4）。**部署前先确认云函数代码包体积限制**，并留意冷启动时间增长。
- **内存缓存**：`lib/store.js` 的 `treeCache` / `metaCache` 进程内常驻 —— **云端部署后 / 本地改完数据后都必须重启实例**才生效（本地：`COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js 3100`；云端：重新部署或触发一次冷启动）。不重启的症状 = 读接口继续返旧快照，且下一次保存会把旧 id/旧值写回。
- 验收锚点（副本实例真 HTTP 实测，修后）：`POST /admin/create-tree {surname_char:"乥"}` → **HTTP 400** + body `{"error":"姓氏「乥」无法注音，请检查输入"}`（**不再是**「服务内部错误」），且**未建树、未扣籽**；`{surname_char:"中国"}` → 400「请填写单个汉字姓氏」；`{surname_char:"雷",founder_name:""}` → 400「请填写始祖姓名」。

### 20-2 云端数据：3 棵树原地改名（**旧 URL 不留别名**）

| 旧 tree_id | 新 tree_id | 改名载荷 |
|---|---|---|
| `shi_32426_01` | `ji_32426_01` | `tree-meta` 键 + `tree_id` + `path_alias`；`migrate-output/trees/<id>.json`（文件名 + 内部 `tree_id`）；`migrate-output/details/<id>:<handle>.json`（文件名前缀 + 内部 `tree_id`）；业务集合 **`jiazu_assets`**（`migrate-output/collections/jiazu_assets.json`）的 `ref.tree_id` 与 `desc` 文案 —— **实测 7 处**（4× `ref.tree_id` + 3× `desc`；行号 976 / 987 / 998 / 1009 / 1134 / 1145 / 1156）。复现：`python3 -c "s=open('migrate-output/collections/jiazu_assets.json').read();print(s.count('ji_32426_01')+s.count('rong_23481_01')+s.count('heng_24658_01'))"` → `7`（此前本节误记为「实测无引用」，已按上述实测更正） |
| `shi_23481_01` | `rong_23481_01` | 同上 |
| `shi_24658_01` | `heng_24658_01` | 同上 |

- 本地已完成：`migrate-output/**` 与 `config/tree-meta.json` 内 `shi_32426` / `shi_23481` / `shi_24658` **内容与文件名命中均为 0**；`trees/` 15 个文件，3 棵改名树的详情文档共 **5 个**（`ji_32426_01` 1 个 / `rong_23481_01` 2 个 / `heng_24658_01` 2 个）已随迁。
- 云端动作 = 重传 `tree-meta` + 上述 3 个树 JSON + 5 个详情文档 + **核对/重传 `jiazu_assets` 集合**（`CB_ENV=<envId> CB_KEY=<key> node scripts/upload-migrated-to-cloudbase.mjs`，密钥由用户给；`jiazu_assets` 已在 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 内，该命令会**确保集合存在**，但**不上传集合数据**）——**`jiazu_assets/global` 数据需另行核对**：本地件里 3 棵树旧 id 的 **7 处**（4× `ref.tree_id` + 3× `desc`）已被本次迁移改写为 `ji_32426_01` / `rong_23481_01` / `heng_24658_01`，云端该文档若仍是旧 id 需同步；⚠️ 该文档同时含**用户界面操作产生的流水**，**以云端实际为准**：云端已有更晚写入时**不要**用本地件全量覆盖（§16-3 追加的既有口径），只做逐条核对与定向改写；**不留 `path_alias` 旧值**（旧 URL 404 属预期）。
- ⚠️ 重传/重启前先按 §20-1 末条刷新实例缓存，否则进程内 `treeCache` 仍是旧 id。

### 20-3 阻塞点

- **云函数包体积**：998 KB（`pinyin-pro` 词典为主）—— 超限则需裁剪词典或改按需加载，属部署前置判断。
- **改名不可逆且旧 URL 不留别名**：部署前确认无对外引用 3 条旧链接；云端重传的数据项与 §20-1 的重打包**必须同批**执行（只做一半会出现「tree-meta 指向新 id、树 JSON 仍叫旧文件名」的坏链）。

---

## 21. 本批：首页卡片人数单列镜像（**代码批次：云函数新增出参字段 + 前端卡片文案**）

> 规格 = `docs/marriage.spec.md` **§9-4 修订**（首页卡片口径）+ **§11-4**（原登记项「首页卡片人数未单列镜像 · 本轮不改」，**本批落地**）。
> **本批性质**：云函数 `compat-api` 的 `GET /tree/rank` **新增出参字段 `mirror_count`**（**必须重打包**）+ 首页卡片文案改「N 人（含外树 M）」（**必须重打包**）；**CloudBase 集合：无变化**；**云端数据：无变化**（§21-2 / §21-3 均为「无」）。
> **本批状态：已实施 + 冒烟（2026-09-19）** —— 数值证据见 §21-1「本地验证证据」；本节只登记**上云动作**。

### 21-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包 + 部署**：`GET /tree/rank` **新增出参字段 `mirror_count`**（本树 `people` 中 `external_mirror === 'true'` 的节点数）→ 不重打包 = 云端响应无该字段、卡片只显「N 人」 | 无（产物已于 2026-09-19 12:50 重打，见 §19-7「现状」） |
| 2 | CloudBase 集合 | **无**（不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`，保持 §11-2 的 **12 项**） | — |
| 3 | 云端数据 | **无**（不重跑迁移上传、不动 `jiazu_id_seq`、无手工删键；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰） | — |
| 4 | 前端 H5 / 小程序 | **必须重打包 + hosting 部署**（`build:h5` 带 `VITE_API_BASE`）；小程序**同批重打**并上传 | 需确认 hosting 目标与云函数 HTTP 域名 |

### 21-1 云函数 `compat-api`：`/tree/rank` 新增出参 `mirror_count`（**必须重打包 + 部署**）

**为什么需要**：首页家族 / 祖谱卡片的人数口径要求**单列镜像**（规格 §9-4 修订 → 卡片显「N 人（含外树 M）」），而原出参只有 `person_count`（**含镜像**）—— 不重打包则云端无 `mirror_count`，前端兜底后卡片只显「N 人」。

| 路由 | 变更内容 | 本地验证 |
|---|---|---|
| **`GET /tree/rank`** | **新增出参字段 `mirror_count`**（`index.js` 约 **486–489 行**：`Object.values(tree.people).filter(p => String(p.external_mirror) === 'true').length`）；**`person_count` 口径不变（仍含镜像）**；`access` / `activity` / `updated_at` / `rank_*` 元信息**一律不动** | ✅ **已实施 + 冒烟通过（2026-09-19）**：见下方实测表 + 单测 7/7 |

**具体命令**（仓库根；写法同 §17-1 / §19-1 / §20-1）

```bash
# ① 重打包（产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
--bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
--outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c

# ③ 重打包判据（≥ 1；未重打 = 0）
grep -c 'mirror_count' cloudfunctions/deploy/compat-api/index.js
```

**本地验证证据**

- ✅ **接口 / 真机实测（2026-09-19；数值照抄，不得改写）**：

  | tree_id | `person_count` | `mirror_count` | 卡片文案（`pages/index/index.vue` `peopleText()`） |
  |---|---|---|---|
  | `gu_39038_01` | **23** | **4** | 23 人（含外树 4） |
  | `ji_23395_01` | **89** | **3** | 89 人（含外树 3） |
  | `long_40857_01` | **2** | **0** | 只显「**2 人**」（`mirror_count` **不 > 0** → 不加括号） |
  | 祖谱 `ji_23395` | **2** | **1** | 2 人（含外树 1） |

  （四个 tree_id 的 `people` 长度与 `String(external_mirror) === 'true'` 计数**已按真源 `migrate-output/trees/<tree_id>.json` 独立复核一致**。）
- ✅ **单测**：`cloudfunctions/compat-api/lib/mirror-count.test.js` **7/7**，**已注册进根 `package.json` 的 `scripts.test`**；与既有 `cloudfunctions/compat-api/lib/home-sort-search.test.js` **合跑 30/30**。
- ✅ **排序公式未动**：综合分**归一化仍用 `person_count`** —— `mirror_count` **只用于展示**（`frontend/src/business/api.ts` 的 `TreeRankInfo.mirror_count` 注释明写「**不参与任何排序归一化**」）；`0.4×norm(人数) + 0.4×norm(活跃度) + 0.2×norm(新近度)` 与 tie-break 规则**逐字不变**（`docs/home-sort-search.spec.md`）。
- **并发批次产物现状（2026-09-19 12:50 校验）**：`cloudfunctions/deploy/compat-api/index.js` = **998,338 B** / md5 `d61a8aebfb3f3095baae4e1e731fd675`；`grep -c 'mirror_count'` = **7**、`grep -c 'search/marriage-candidates'` = **1** ⇒ 本批与 §19 的路由**同在一份产物内**。
- **前端兜底口径**（`pages/index/index.vue` `peopleText()`）：`mirror_count` **缺失 / 非数值 / ≤ 0**（含本地后端未重启）→ 回退只显「N 人」；`person_count` 缺失 → 「— 人」；**任一分支都不产出 NaN / undefined**。

**阻塞点**

- H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §16-4 / §17-4 / §18-1 / §19-4）。
- **命名提示**：`TreeRankInfo.mirror_count`（全树镜像数）与 `ClanInfo.mirror_count`（祖谱顶端镜像段节点数）**同名字段、语义不同**，属两类型既有命名、**不重命名**（裁定见 `docs/marriage.spec.md` §11-8）。
- **不阻塞本清单其它项**：本批无集合 / 无数据动作（§21-2 / §21-3「无」），与 §16 / §17 / §19 的云函数重打包**同一次发布**即可。

### 21-2 CloudBase 集合：**无**

- 不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（保持 §11-2 的 **12 项**）；本批只改一条既有路由的出参字段，不落任何新集合。

### 21-3 云端数据：**无**

- 不重跑迁移上传、不动 `jiazu_id_seq`、无手工删键；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰。

### 21-4 本批**不需要**上云的东西

- **测试文件**（`cloudfunctions/compat-api/lib/mirror-count.test.js`）：纯本地，**不进打包产物**。
- **文档**：`docs/marriage.spec.md`（本批回写 §9-4 / §11-4 / §11-8）、本清单 **§21**：不进产物、不影响云端。
- `/tmp` 下的副本与取证文件：临时产物。

---

## 22. 本批：家族树共享选择器（展示层）+ uni-app H5 遮罩关闭修复（**纯前端批次**）

> 规格 = `docs/marriage.spec.md` **§9-9**（tree-picker 展示层 / 交互 / 冻结红线 / 真机质检证据 / 已知边界）与 **§9-10**（`@click.self` 在 uni-app H5 失效这一**跨模块通用坑** + 全仓 11 处修正清单）。
> 性质：**纯前端批次** —— 只动 `frontend/`（**新增 1 个组件 + 修改 5 个 `.vue`**）；**云函数 `compat-api` 无新增路由、无任何改动**；**CloudBase 集合：无**；**云端数据：无**。
> 状态：**已实施 + 真机质检通过（2026-09-19）**；本清单只登记上云动作，不表示已上线。

### 22-0 三项「无」的结论（部署时不必为它做任何后端 / 数据动作）

| 类别 | 本批变化 |
|---|---|
| 云函数 `compat-api` | **无新增路由、无改动**（不产生新的重打包需求；**§19 / §21 的云函数重打包仍然待执行**，见 §21-1 的产物校验） |
| CloudBase 集合 | **无**：不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（保持 **12 项**） |
| 云端数据 | **无**：不重跑迁移上传、不动 `jiazu_id_seq`、无手工删键；本批**未触碰** `migrate-output/**` 与 `config/tree-meta.json` |

### 22-1 前端（**H5 必须重打包** + hosting 部署；**小程序需同批重打包上传**）

**新增文件（1）**

| 文件 | 内容 |
|---|---|
| `frontend/src/components/tree-picker/tree-picker.vue` | 家族树共享选择器：折叠态**恒一行（实测 44px，不随候选数变化）**；展开态**独立覆盖层 `z-index:1200`**（> 既有 `.modal-mask` 999）= 搜索框（本地过滤 `label`/`sub`/`tree_id`，大小写不敏感）+ 列表区 `max-height:36vh` 内部滚动 + 底部取消 / 确定；props `items`/`modelValue`/`placeholder`，emit `update:modelValue` + `select` |

**被改文件（5；本批前端写入面 = 1 新增 + 5 修改，共 6 个文件）**

| # | 文件 | 本批改动 |
|---|---|---|
| 1 | `frontend/src/components/person-archive/person-archive.vue` | ① **三处接入 tree-picker**：嫁出 / 娶入（选择目标家族树）、认祖（选择认祖目标）、挂载祖谱（选择要挂载的祖谱）——旧平铺 `.tree-opt` 列表整体删除（全仓 `grep 'tree-opt'` = **0**）；② **遮罩修复 6 处**：嫁出 / 娶入、删除节点、汇宗、认祖、挂载祖谱、绝婚 / 合离；③ `.modal` 补 `overflow-y:auto` + `margin:auto`、`.modal-mask` 补 `overflow-y:auto` + `padding:5vh 0`（超高不再外溢 / 顶裁） |
| 2 | `frontend/src/components/clan-hall/clan-hall.vue` | 遮罩修复 1 处（编辑祖谱信息） |
| 3 | `frontend/src/pages/hall/index.vue` | 遮罩修复 2 处（加入申请、建谱申请） |
| 4 | `frontend/src/pages/mine/index.vue` | 遮罩修复 1 处（解绑申请） |
| 5 | `frontend/src/pages/market/index.vue` | 遮罩修复 1 处（购买确认） |

- **遮罩修复合计 11 处 = 6 + 1 + 2 + 1 + 1**，写法 = **遮罩 `@click="原 handler"` + 紧邻内层面板 `@click.stop`**（**两者必须同时改**：只改遮罩会得到「点弹窗内部任意处即关闭」的重大回归）。
- **回归自查判据**：`grep -rn '@click.self' frontend/src --include=*.vue` = **0 命中**（本批实测 **0**）。
- **冻结项（换壳不得顺手改）**：空态三态文案、「按全局编号指定（兜底，如 000052 / I000052）」label 与 placeholder、初娶 / 再娶（第 N 次）序号文案、身份确认块、提交按钮禁用条件、**候选集合（嫁出 / 娶入 仍为「非 `is_master` 且非本树」）**——逐条见 `docs/marriage.spec.md` **§9-9**。

**构建与部署命令（与 §4 / §16-4 同）：**

```bash
cd frontend && VITE_API_BASE=<云函数 HTTP 域名> npm run build:h5   # H5 产物
cd frontend && npm run build:mp-weixin                              # 小程序产物（同批上传）
```

### 22-2 CloudBase 集合：**无**

- 不新建集合、不加索引、不改 `COLLECTIONS`（保持 §11-2 的 **12 项**）。

### 22-3 云端数据：**无**

- 不重跑迁移上传、不动 `jiazu_id_seq`；本批只改前端 `.vue`。

### 22-4 部署后冒烟（按序做，任一步不符即视为发布带回退）

1. 打开任意人物档案 → **🤵 娶入** → 弹窗出现（**弹窗不再被长列表撑开**）。
2. **目标家族树选择器折叠态 = 一行**（实测 44px 量级）；旧平铺胶囊列表 `.tree-opt` **数量 0**。
3. 点开选择器 → **搜索框**输入（如「顾」）→ 列表**收敛**；**分组小标题**只在 ≥2 组时出现；选中 → **确定 → 回填**显示所选树。
4. **点遮罩 → 弹窗关闭**（这是本批修的核心症状：修复前点外面无反应）。
5. **点弹窗内部（标题 / 表单空白处）→ 弹窗不关**（成对断言，防「点内部即关」回归）。
6. 嫁出侧同样验一遍；空态文案 = 「未找到符合条件的女性节点 / 未找到符合条件的男性节点」；假 token → 「登录已过期，请重新登录」。
7. 其余 5 个弹窗各点一次遮罩（祖谱编辑 / 加入申请 / 建谱申请 / 解绑申请 / 购买确认）→ 均能关闭。

### 22-5 已知边界（登记项 —— 不当缺陷、不阻塞发布）

1. **嵌套两层选择器时，在同一坐标快速连点两下**：第一下关内层、**第二下落在外层遮罩上把外层也关掉** —— 属**两次独立点击（非事件穿透）**；**不追加时间戳守卫**（登记于 `docs/marriage.spec.md` §9-9）。
2. **两处无法真机触达**（因当前数据现状，非实现缺陷）：① `pages/market/index.vue`「购买确认」弹窗 —— 当前**无在售挂单**；其改动与**已验证的 4 处同构**、`vue-tsc --noEmit` **exit 0**；② **认祖选择器** —— 全库**无 `founder_state='none'`**（始祖均已挂载）。发布后一旦有数据，按 §22-4 第 3 / 第 7 步补验即可。

**阻塞点**

- H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §16-4 / §17-4 / §18-1 / §19-4 / §21）。
- **不阻塞本清单其它项**：本批与 §18（口径 A 纯前端）/ §19（发现通道）/ §21（mirror_count）的**前端改动同一次重打包发布**即可；它们各自的云函数重打包仍按 §19-1 / §21-1 执行。
- **本批前端写入面（mtime 取证）**：1 个新增 + 5 个修改（`tree-picker.vue` / `person-archive.vue` / `clan-hall.vue` / `mine/index.vue` / `market/index.vue` / `hall/index.vue`），无其它前端文件被本批触碰。

---

## 23. 本批：家族人数口径修订（**代码批次：`GET /tree/rank` 出参语义变更 + 首页卡片文案 + 家族页统计栏**）

> 规格 = `docs/home-sort-search.spec.md` **§10-6**（现行口径七条全文 · 2026-09-19 拍板；同时作废旧「N 人（含外树 M）」单列镜像显示口径）+ 本册 §23；权限侧补注 = `docs/permission-tier.spec.md` **§5 末条**（聚合计数不随节点级读裁剪变化）。
> **本批性质**：云函数 `compat-api` 的 `GET /tree/rank` **`person_count` 语义变更**（**字段名 / 形状 / 类型不变** ⇒ **必须重打包**；不重打包**不报错**、只**静默返旧口径数值**）+ 首页家族 / 祖谱卡片文案改「N 人」+ 家族页（`hall`）树图统计栏改为同一口径（**H5 必须重打包 + hosting 部署**）；**CloudBase 集合：无变化**；**云端数据：无变化**（§23-2 / §23-3 均为「无」）。
> **实施状态：已实施（本地已验证，2026-09-19（Zang 汇总））** —— 本地实施与验证已完成（实施侧证据见 §23-1「本地验证证据」：`npm test` **427/427**、运行中 3100 逐树实测、质检独立复算、UI 实测）；本节只登记**上云动作**，**部署仍未执行** ⇒ **不得**把本节任何本地数值当**线上已部署**证据引用。
> ⚠️ **本轮（写路径守卫批）范围界定（2026-09-19）**：实施侧**已完成的是「口径」那一段**（家族树**纯血缘图**人数口径 + 清理，即下面 §23-1 的本地验证证据），**写路径守卫仍在实施中** —— 家族树写路径守卫 + 「承母嗣」的口径见 `docs/home-sort-search.spec.md` **§10-7**，其状态一律 = **本轮实施中（待 Zang 汇总后回写）**，本清单**不预登记**其测试结论 / 产物 / 数值。
> **取代 §21 的卡片显示口径**（§21 = 旧「新增 `mirror_count` + 卡片 N 人（含外树 M）」批次）：**§21 正文不改写**；其 `mirror_count` **降级为保留字段、不再参与展示**（仍随出参下发，做形状兼容）。

### 23-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包 + 部署**：`GET /tree/rank` 的 `person_count` 改新口径（出参字段名 / 形状 / 类型不变）；`mirror_count` **保留但不再用于展示** → 不重打包**不报错**，只静默返旧口径数值 | ⚠️ **无字符串型重打包判据**（新旧产物都含 `person_count`）⇒ 只能靠部署后**数值比对**（§23-5 第 1 条） |
| 2 | CloudBase 集合 | **无**（不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`，保持 §11-2 的 **12 项**） | — |
| 3 | 云端数据 | **无**（不重跑迁移上传、不动 `jiazu_id_seq`、无手工删键；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰） | — |
| 4 | 前端 H5 / 小程序 | **必须重打包 + hosting 部署**（`build:h5` 带 `VITE_API_BASE`）；小程序**同批重打**并上传 | 需确认 hosting 目标与云函数 HTTP 域名（同 §4 / §16-4 / §19-4 / §21 / §22） |

### 23-1 云函数 `compat-api`：`GET /tree/rank` 的 `person_count` 语义变更（**必须重打包 + 部署**）

**为什么需要**

- 家族人数口径本轮修订为「**本姓节点无论男女 + 外姓嫁入女性一律计入；本姓女性嫁出后所生的外姓子女不计入**」（全文 = `docs/home-sort-search.spec.md` §10-6 七条）；旧「树内全部节点数（含镜像）」口径**作废**。
- 该路由的**字段名 / 形状 / 类型都不变** ⇒ 云端**不重打包不会 404、不会报错**，只会**继续返回旧口径数值**；判别只能靠**值**，不能靠**串**。
- 同一批的**两处展示变更**（① 首页家族 / 祖谱卡片文案「N 人（含外树 M）」→「**N 人**」；② 家族页 `hall` 树图统计栏由「按登录档位裁剪后的人物列表长度」改为**读 `/tree/rank` 的 `person_count`**）**不重发 H5 就仍是旧行为**（前端动作见 §23-4）。
- 排序**逐字不变**：归一化**继续用 `person_count`**，权重与 tie-break 见规格 §3-2 / §3-3 / §3-5。

| 路由 | 变更内容 | 本地验证 |
|---|---|---|
| **`GET /tree/rank`** | `person_count` **取值口径变更**（新口径 = 规格 §10-6 七条）；**出参字段名 / 形状 / 类型一律不变**；`mirror_count` **保留（降级：不再参与展示、不参与排序）**；`access` / `activity` / `updated_at` / `rank_*` / `total_generations` / `root_count` **全不动** | ✅ **已实施（本地已验证，2026-09-19（Zang 汇总））**：实施侧测试 + 运行实测证据见下「本地验证证据」（**`npm test` 427/427**、运行中 3100 逐树数值与 §23-5 第 1 条逐位一致）；文档角色的**只读真源复算**见下（该复算本身**非实施证据**、只作交叉校验） |

**具体命令**（仓库根；写法同 §17-1 / §19-1 / §20-1 / §21-1）

```bash
# ① 重打包（产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
--bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
--outfile=cloudfunctions/deploy/compat-api/index.js

# ② 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c

# ③ 重打包判据：⚠️ 本批**没有字符串型判据** —— 字段名 / 出参形状均不变，
#    `grep -c 'person_count'` 新旧产物都 ≥ 1、不区分口径，**不能**用作本批判据。
#    替代判据 = ① 产物 mtime 晚于源码最后修改；② 部署后按 §23-5 第 1 条逐树比对数值。
ls -l cloudfunctions/deploy/compat-api/index.js cloudfunctions/compat-api/index.js
```

- **本批不新增集合、不改 `cloudbaserc.json`、不动环境变量**（`MASTER_TREE_ID=zhonghua` / `COMPAT_SOURCE=cloud` 均沿用）。
- ⚠️ 本批云函数改动与 **§16 / §17 / §19 / §20 / §21** 的改动**同在一份产物**：**一次重打包覆盖全部**，不要只重打一半（§19-7 / §20-1 登记的产物现状为 2026-09-19 12:50 重打）。
- **内存缓存**：`lib/store.js` 的 `treeCache` / `metaCache` 进程内常驻 —— **云端部署后 / 本地改完数据后都必须重启实例**才生效（本地：`COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js 3100`；云端：重新部署或触发一次冷启动）。

**本地验证证据**

- ✅ **已实施（本地已验证，2026-09-19（Zang 汇总））** —— 实施侧证据（由实施者提供、Zang 汇总；**数值照抄**）：① 全量 `npm test` = **# tests 427 / # pass 427 / # fail 0**（本批新增/修正：`lib/family-population.test.js` **22/22**、`lib/mirror-count.test.js` **7/7**）；② **运行中的 3100（重启后）实测** `person_count`：`ji_23395_01` **89** / `gu_39038_01` **22** / `liu_21016_01` **18** / `shen_27784_01` **11** / `zhonghua` **112** —— 与 §23-5 第 1 条**逐位一致**；③ **质检（Neng：独立 Python 复算 + 变异验证）**：16 棵树**逐棵与 3100 一致（0 不一致）**、全库共 **7 个节点**被排除、**24 个外树节点中仅 3 个** `child` 镜像被排除；④ **UI 实测（headless Chrome + CDP）**：首页卡片「**季氏费县白露家族 … 89 人**」（**无「含外树」字样**）、家族页 `共 89 人` —— 对应 §23-5 第 3 / 第 5 条**本地已过**。**本节只作「本地已验证」登记；上云 / 部署仍未执行**（重打包硬要求见 §23-1 / §23-4）。
- ✅ **已实施（本地已验证，2026-09-19（Zang 汇总））：保险判据本姓保护修复** —— 契约收口：**规则 1（本姓无论男女一律计入）优先于规则 3 的保险判据** ⇒ `external_mirror === 'true'` 且 `external_link_type === 'child'` 的节点，**本人本姓时仍按规则 1 计入**，**仅当本人非本姓时才排除**（质检发现契约不一致 → Zang 终审；口径全文见 `docs/home-sort-search.spec.md` §10-6 规则 3 + 该节末修订记录）。**本姓保护已按 Zang 终审落地（规则 1 优先），真源数值零变化**（同批回归证据见上条 ①–④）。
- 🔎 **文档角色只读复算（2026-09-19 · 非实施证据 · 未改真源）**：按规格 §10-6 的七条口径，对 `migrate-output/trees/*.json` + `config/tree-meta.json` 做**只读**重算（**未写任何文件、未实施、未改真源**），结果与规格 §10-6「真源期望值」表**逐位一致**：

  | tree_id | 现状（`people` 长度） | 新口径期望 | `S` 解析来源 | 排除节点（命中规则） |
  |---|---|---|---|---|
  | `ji_23395_01` | 90 | **89** | `tree-meta.surname_char` = 季 | `I000237 满满`（规则 3） |
  | `gu_39038_01` | 24 | **22** | 始祖节点兜底（该树 meta **无** `surname_char`）= 顾 | `I000293 季庭亦` / `I000294 季贺为`（规则 3 + 保险判据 `external_link_type='child'`） |
  | `liu_21016_01` | 19 | **18** | 全树众数兜底 = 刘 | `I000266 李阳 独生 表哥`（规则 3） |
  | `shen_27784_01` | 14 | **11** | 全树众数兜底 = 沈 | `I000286 季清昆`（规则 3 + `child` 镜像）/ `I000279 纪青森` / `I000281 秦铭铭`（规则 3） |
  | `zhonghua` | 112 | **112** | `tree-meta.surname_char` = 华 | 无 |
  | 其余 **11** 棵树 | 见规格 §10-6 | **不变** | — | 排除集为空 |

- ⚠️ **§21 的旧证据锚点已被真源增长超越（登记项；不改写 §21）**：§21-1 登记 `gu_39038_01` = **23 / `mirror_count` 4**、`ji_23395_01` = **89 / 3**；按 2026-09-19 16:2x 真源只读复核，现为 `gu_39038_01` = **24 / 5**、`ji_23395_01` = **90 / 4**（各 +1 人 / +1 镜像）⇒ 部署后冒烟**以 §23-5 的数值为准**；`mirror_count` 仅作形状兼容，**不再有展示意义**。

- 🚧 **本轮实施中：家族树写路径守卫 + 「承母嗣」（实施单进行中，待 Zang 汇总后回写证据）** —— 口径已拍板并登记在 `docs/home-sort-search.spec.md` **§10-7**（本册对应的上云 / 部署登记随 Zang 汇总后回写，**本轮不预登记**）。**状态一律 = 本轮实施中（待 Zang 汇总后回写）** ⇒ **不得**引用为**已实现 / 已通过 / 已部署**。**范围提示**：实施侧**已完成的是「口径」那一段**（家族树**纯血缘图**人数口径 + 清理，即本条之上「本地验证证据」），**写路径守卫仍在实施中**。**口径要点（供实施者对照，非证据）**：守卫**只对 `kind === 'family'` 生效**（世本 / 祖谱**有母系起始节点**，套上会**断链** ⇒ 不套用）；新增子节点挂父下而父**非本族成员且非本树镜像** ⇒ **400 拒**；挂母下（父槽空）而母**本族且已婚配** ⇒ **400 拒**，**除非显式** `maternal_succession: true`（**承母嗣**）；`maternal_succession` 落库 = **详情文档属性**（key 字符串 `maternal_succession`、值 `'true'`）；前端「＋ 添加子女」加「承母嗣」勾选框 + 提示文案。**存量数据不在本轮修正**；**人数仍按 §10-6**（家族树 = `people` − 被排除项；世本 / 祖谱 = `people` 数）。

**阻塞点**

- ⚠️ **无字符串型重打包判据**：旧口径与本批口径的产物**都含 `person_count`** ⇒ **唯一可判别手段 = 部署后逐树数值比对**（§23-5 第 1 条）；**漏重打包不会报错**、只会静默返旧口径数值。
- **必须与 §23-4 的前端两项同批发布**：只发云函数不发 H5 ⇒ 数值已是新口径但文案仍「N 人（含外树 M）」、家族页统计栏仍按裁剪长度；只发 H5 不发云函数 ⇒ 新文案配旧数值。
- H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §4 / §16-4 / §17-4 / §18-1 / §19-4 / §21 / §22）。
- ✅ **跨册回写已做（2026-09-19）**：`docs/marriage.spec.md` 已按关键字逐处加注「**已作废 2026-09-19**」（命中：§9-4 第 4 行、§9-7 第 7 条、§10 `tree-pedigree.vue` 条目、§11-4 及其交叉引用第 7 条、§11-8 命名说明）—— **只加标注、原句保留**；本清单 **§21 / §22 正文按约定不改写**。
- **不阻塞本清单其它项**：本批**无集合 / 无数据动作**（§23-2 / §23-3「无」），与 §16 / §17 / §19 / §20 / §21 的云函数重打包**同一次发布**即可。

### 23-2 CloudBase 集合：**无**

- 不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（保持 §11-2 的 **12 项**）；本批只改一条既有路由的出参**取值口径**，不落任何新集合。

### 23-3 云端数据：**无**

- 不重跑迁移上传、不动 `jiazu_id_seq`、无手工删键；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰（口径只读真源，不写真源）。

### 23-4 前端产物（**必须重打包：H5 + 小程序**）

**为什么需要**

- ① **首页卡片文案**：家族 / 祖谱卡片由「N 人（含外树 M）」改为「**N 人**」—— `mirror_count` 不再进入文案（`frontend/src/pages/index/index.vue` 的 `peopleText()`；**「— 人」兜底分支照旧**：`person_count` 缺失 / NaN → 「— 人」）。
- ② **家族页统计栏**：普通家族树页（`hall`）树图统计栏「**共 N 人**」改为**与卡片同一口径** —— **读 `/tree/rank` 的 `person_count`**，**不再用「按登录档位裁剪后的人物列表长度」**（落点 `frontend/src/pages/hall/index.vue` / `frontend/src/components/tree-pedigree/tree-pedigree.vue`）。
- **纯展示口径**：排序公式 / 权重 / tie-break **逐字不变**（规格 §3-2 / §3-3 / §3-5）；**不重发 H5 ⇒ 线上两项仍是旧行为**（旧文案 + 统计栏随登录档位变小）。

**具体命令**

```bash
cd frontend && VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5   # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c

cd frontend && npm run build:mp-weixin                                      # 小程序产物（同批上传）
```

**本地验证证据**

- ✅ **已实施（本地已验证，2026-09-19（Zang 汇总））** —— 前端两项改动已完成，**UI 实测（headless Chrome + CDP）**：首页卡片「**季氏费县白露家族 … 89 人**」（**无「含外树」字样**）、家族页统计栏 `共 89 人`（与 §23-5 第 3 / 第 5 条一致）。本节**仍不登记**构建结果 / 产物版本 / `vue-tsc --noEmit` 结论（**未由本角色运行**，亦不得代为断言）；**H5 / 小程序重打包硬要求不变**（见下阻塞点）。

**阻塞点**

- H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §4 / §16-4 / §19-4 / §21 / §22）。
- ⚠️ **本批「必须重打包」是硬要求：不重打包就发 = 线上仍旧行为** —— `frontend/dist/build/h5/**` **当前仍是含旧文案与旧 prop 的构建产物**（质检 grep **命中「含外树」**，命中文件 = `frontend/dist/build/h5/assets/tree-pedigree.DI3CNQ9Z.js`；本角色只读复核该产物目录 mtime = **2026-09-16 23:17:19**，早于本批 2026-09-19 的源码改动）⇒ **沿用现有产物直接 `tcb hosting deploy` = 线上仍是旧文案「N 人（含外树 M）」+ 旧统计栏**（云函数若已更新则进一步变成「新数值配旧文案」）。**本批 H5 必须与 §23-1 的云函数产物在**同一次发布**里重打包后上线；本批不重打包即视为未完成本批**。
- **与 §23-1 的云函数口径必须同批**（见 §23-1 阻塞点第 2 条）。
- **家族页统计栏改数据源后依赖 `/tree/rank` 请求成功**：请求失败 / 字段缺失时须有兜底文案（与卡片「— 人」同类处理），**不得显示 `NaN` / `undefined`**（实现细节由实施者落定，本清单不代为断言）。

### 23-5 部署后冒烟验证（按序做）

1. `GET /tree/rank` 逐树核对 `person_count`：`ji_23395_01` **89** / `gu_39038_01` **22** / `liu_21016_01` **18** / `shen_27784_01` **11** / `zhonghua` **112**；其余树与规格 §10-6 表一致（**值不符 = 云函数产物未重打或未部署**，见 §23-1 阻塞点第 1 条）。
2. **出参形状回归（不得因本批删字段）**：`person_count` 仍为 number；`mirror_count` **仍在**（降级保留）；`access` / `activity` / `updated_at` / `rank_*` / `total_generations` / `root_count` 逐字段仍在。
3. **首页卡片文案**：家族档 / 祖谱档卡片均为「**N 人**」且**不再出现「含外树」字样**；`rank` 请求失败的树仍显「— 人」（无 NaN / undefined）。
4. **首页排序回归**：三档排序序列与 tie-break 逐位不变（人数仍按 `person_count` 归一化）。
5. **家族页统计栏 = 同一棵树 `/tree/rank` 的 `person_count`**（同一档位下与卡片数值**逐位相等**）。
6. **统计栏不随登录档位变化**：同一棵树 guest / logged-in 两种身份下「共 N 人」**相同**（改前用「裁剪后人物列表长度」时会随档位变小）；同时**树图节点数仍按档位裁剪**（对照 `docs/permission-tier.spec.md` §4 基线）—— **聚合计数与节点列表长度是两件事**（§10 的「ji guest 可见 1–8 世」仍成立）。
7. **`mirror_count` 降级回归**：前端**不再**因 `mirror_count` 改变卡片文案；该字段缺失 / 为 0 时「N 人」显示不变。

### 23-6 本批**不需要**上云的东西

- **本批无新增集合、无数据变更**（§23-2 / §23-3 均「无」）：`COLLECTIONS` 保持 §11-2 的 **12 项**；`jiazu_id_seq` 不动；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰。
- **测试文件**（实施侧新增 / 修改的单测，如既有 `cloudfunctions/compat-api/lib/home-sort-search.test.js`）：纯本地，**不进打包产物**。
- **文档**：`docs/home-sort-search.spec.md`（本批 §10-6 新增 · §10-2 作废标记 · §5-1 末条 · §9 部署指针）、`docs/permission-tier.spec.md`（§5 末条补注）、本清单 **§23**：不进产物、不影响云端。
- `/tmp` 下的副本与取证文件：临时产物。

---

## 24. 本批：家族树「发源地」结构化（三级行政区划 + 台湾省补全 + 海外单列；**代码批次 + 纯数据批次**）

> **权威规格** = `docs/geo-origin.spec.md`（2026-09-20 成文，Zang 契约 v1；**口径唯一真源**）。口径来源 = Kevin 2026-09-20 四问四答（存储结构 = 行政区划代码 / 数据源 = 内置静态数据集进仓 / 台湾省全省补全 / 存量批量迁移）+ Zang 补充裁定（`origin` 降级为写时反查生成的软冗余、`origin_code` 为结构化真源、海外哨兵码 `999999`、世本 `中华` legacy 特例）。
> **本批性质** = **代码批次（云函数 + 前端）** **＋ 纯数据批次（`config/tree-meta.json` 存量迁移）** —— 两类动作的云端步骤**不能互相替代**（同 §13 A / B 的分野）。
> **云端数据：有变更**（§24-3：tree-meta 存量 `origin` → `origin_code` + 展示串重算，逐树映射见规格 §8）；**CloudBase 集合：无变化**（§24-2「无」）。
> ⚠️ **落地实况（2026-09-20 08:39–08:45 只读实测，规格 §0-4 逐条）**：数据集 `config/geo-divisions.json`、反查模块 `lib/geo.js`、生成脚本 `scripts/gen-geo-divisions.mjs`、迁移脚本 `scripts/migrate-tree-origin.mjs`、三处落库/复制改动（`lib/tree-write.js` / `lib/clan.js` / `lib/branch-clan-ops.js`）**已落盘**；`PUT /tree-meta` 白名单、`POST /admin/create-tree` 与祖谱路由接线、前端菜单、单测**未落盘**。`grep -c 'origin_code' cloudfunctions/compat-api/index.js` = **0**。
> ⚠️ **新增部署项（本批独有）**：数据集**必须随云函数包发布**（`lib/geo.js` 运行时读盘，esbuild 不会把 JSON 打进产物）—— 见 §24-1 第 2 条步骤与判据。

> 🔄 **§24R 现状回写（2026-09-20 09:01–09:03 CST · Jing 实测）** —— 上列「落地实况」与「新增部署项」**均已过期**：**本节的判据与动作按本块更新**；本节以下的正文是 08:45 时点的历史清单，**旧行保留原文**，逐条作废 / 取代见下。
>
> | 子节 | 状态（实测 2026-09-20） |
> |---|---|
> | §24-0 第 1 行（云函数重打包） | **代码面已全部落地**（四路由接线 + `PUT /tree-meta` 白名单）⇒ **仅剩「重打包 + 部署」**（见 **§24-1R**） |
> | §24-0 第 2 行（CloudBase 集合：无） | ✅ **保持「无」** |
> | §24-0 第 3 行（云端数据：有变更） | ✅ **有变更**，且**迁移已执行完成**（md5 前后值见 **§24-3R / §24-3-1R**）⇒ **仅剩「上传云端」** |
> | §24-0 第 4 行（前端产物） | **前端改造已落地**（三处级联菜单 + 类型 + 类型定义）；**未落盘项 = 数据产物迁出 `src/static/`**（🆕 见 **§24-4R / §24-9**） |
> | §24-1 第 ② 步（数据集必须随云函数包发布 / `GEO_DIVISIONS_FILE`） | 🚫 **已作废（2026-09-20，取代者 §24-1R）** —— `lib/geo.js` 改为**静态 JSON import**，esbuild **内联** |
> | §24-2（集合：无） | ✅ 保持 |
> | §24-3（迁移命令 + md5 登记位） | ✅ **已执行完成**；md5 已填（**§24-3R / §24-3-1R**） |
> | §24-4（前端重打包） | ⚠️ **部分被超越**（见 §24-4R）；🆕 **新增小程序主包体积项**（**§24-9**） |
> | §24-5（冒烟） | 判据数值更新见 **§24-5R** |
> | §24-6（不需要上云的东西） | ⚠️ **部分被超越**（测试文件已落盘）见 **§24-6R** |
> | §24-7（阻塞点） | 更新见 **§24-7R** |
>
> **两条关键判据的新值（旧 → 新）**：
> - **源码侧**：`grep -c 'origin_code' cloudfunctions/compat-api/index.js` = **0 → 8**（四路由接线完成）。
> - **产物侧**：`grep -c 'origin_code' cloudfunctions/deploy/compat-api/index.js` **仍为 0**（未重打包）⇒ **「重打包 + 部署」仍是本批唯一硬阻塞**（另有两条 🆕 阻塞项见 §24-7R）。
> - **原「数据集随包」判据整体作废**，取代者 = esbuild **内联判据**：`grep -c '999999'` ≥ 1 **且** `grep -c '无法读取行政区划真源'` = 0（**§24-1R**）。
>
> **本批次总览另见 §24-10。**


### 24-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包 + 部署**（已完成部分：`lib/geo.js` + `lib/tree-write.js` / `lib/clan.js` / `lib/branch-clan-ops.js` 三处改动；**待落**：`PUT /tree-meta` 白名单 + 两条路由接线）+ **数据集随包发布**（见 §24-1 第 2 条） | 无（硬阻塞见 §24-7） |
| 2 | CloudBase 集合 | **无**（不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`，保持 §11-2 的 **12 项**） | — |
| 3 | 云端数据 | **有变更**：`config/tree-meta.json` 存量迁移（**17 行逐树映射**中 **11 行迁移**；**1 行 legacy 特例不动** = `zhonghua`；**5 行空值不动**）→ **重跑迁移上传** + **核对 `jiazu_assets` 是否引用旧 id（本批无 id 变更 ⇒ 通常无需动）** | 需 CB_ENV / CB_KEY |
| 4 | 前端 H5 / 小程序 | **必须重打包 + hosting 部署**：三处自由文本输入（建树弹窗 / 家族树编辑 / 祖谱编辑）→ **三级级联菜单**；数据集 `frontend/src/static/geo/divisions.json` 随包发布、**零请求** | 需确认 hosting 目标与云函数 HTTP 域名 |

### 24-1 云函数 `compat-api`（**必须重打包 + 部署**）

**为什么需要**：结构化真源 `origin_code` 与「未知码 400」「由码反查生成展示串」全在云函数内；不重打包 ⇒ 云端**不认 `origin_code`**（`PUT /tree-meta` 白名单不含该字段 ⇒ 结构化编辑**静默丢弃**）、且**无码表校验**（可写入任意码）。

**本批代码改动面（规格 §6-2 / §6-3，共 5 处硬要求；行号为 2026-09-20 只读实测）**：

| # | 文件 | 实测锚点 | 改动 | 状态 |
|---|---|---|---|---|
| W1 | `cloudfunctions/compat-api/index.js` | `:439` 路由 / **`:445` 字段白名单** / `:454` `entry.origin = origin` | 白名单**新增 `origin_code`**；`origin` 改为**反查生成**（不再直取入参） | ⚠️ **待 Kong-A**（`grep -c 'origin_code' index.js` = **0**） |
| W2 | `index.js` + `lib/tree-write.js` | `index.js:1967` 路由 / `:1982` `origin: body.origin` → `lib/tree-write.js:929`（形参 `originCode`）/ **`:998-999`** 落库 | 路由传 `originCode: body.origin_code` | ✅ **lib 层已落盘** / ⚠️ **路由接线待做** |
| W3 | `index.js` + `lib/clan.js` | `index.js:1696` / `:1779` → `lib/clan.js:589`（形参）/ **`:699-700`** 落库；`:378`（`buildClanRequest`） | 两条路由传 `originCode` | ✅ **lib 层已落盘** / ⚠️ **路由接线待做** |
| C1 | `lib/branch-clan-ops.js` | **`:716` `origin_code: entry.origin_code || ''`**（立支整条复制） | 已补 | ✅ **已落盘** |
| C3 | `lib/tree-write.js` | **`:1088` `origin_code: ''`**（拆树新树） | 已补 | ✅ **已落盘** |

> 无需改（已核实）：`lib/branch-clan-ops.js:915`（汇宗 `delete trees[srcKey]`，字段随条目消失）、`:964` `markShellSource()`（`{...base}` 展开保真）、`lib/tree-write.js:2377-2388` `refreshTreeMetaStats()`（`patch` 只含统计键）。
> 新增模块：**`cloudfunctions/compat-api/lib/geo.js`**（133 行，零 npm 依赖，纯读；导出 `resolveOrigin` / `isKnownOriginCode` / `SHOW_FILTER_NAMES` / `OVERSEAS_CODE` / `GEO_FILE` 等）。

```bash
# ① 重打包（仓库根；产物 cloudfunctions/deploy/compat-api/index.js）
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
--bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
--outfile=cloudfunctions/deploy/compat-api/index.js

# ② ⚠️ 数据集必须随云函数包发布（本批独有；缺此步 = 云端首次调用即抛错）
#    lib/geo.js 用 fs.readFileSync 运行时读盘（esbuild 只 bundle JS，不会把 JSON 打进去）
#    二选一：
#      (a) 把真源副本放进云函数目录（随 functionRoot=./cloudfunctions/deploy 一起上传）
#          —— 随包路径须在本节登记（待 Kong-A 定案，规格 §11-2 第 3 条）
#      (b) 设云函数环境变量 GEO_DIVISIONS_FILE 指向随包副本的绝对路径
#    不做 (a)/(b) 的后果：lib/geo.js:48 抛 `[geo] 无法读取行政区划真源 <路径>：<原因>`

# ③ 部署（cloudbaserc.json 已配 functionRoot=./cloudfunctions/deploy、envId=liwu-d8gek6jjdab1d087c）
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c

# ④ 重打包判据（两条都要 ≥ 1；未重打 = 0）
grep -c 'origin_code' cloudfunctions/deploy/compat-api/index.js
grep -c 'GEO_DIVISIONS_FILE\|geo-divisions' cloudfunctions/deploy/compat-api/index.js
```


#### 24-1R 云函数重打包判据 · 回写（2026-09-20）

- 🚫 **上列第 ② 步「数据集必须随云函数包发布 / 二选一（随包副本 or `GEO_DIVISIONS_FILE`）」已作废（2026-09-20，取代者本小节）** —— `lib/geo.js` 已改为**静态 JSON import**（`import divisions from './geo/divisions.json' assert { type: 'json' }`，`:27`），**esbuild 会把 JSON 内联**进产物；`fs` / `GEO_FILE` / `GEO_DIVISIONS_FILE` 的**运行期读盘逻辑整体删除**（规格 **§5-6R**）。
- **取代后的判据（三条，重打包后逐条跑）**：
  ```bash
  # ① 四路由接线（本批新增）必须体现在产物里
  grep -c 'origin_code' cloudfunctions/deploy/compat-api/index.js         # 期望 ≥ 1（当前 = 0，未重打）
  # ② 数据集已内联（取代原「GEO_DIVISIONS_FILE / geo-divisions」字符串代理判据）
  grep -c '999999' cloudfunctions/deploy/compat-api/index.js              # 期望 ≥ 1
  # ③ 旧读盘失败路径已不存在
  grep -c '无法读取行政区划真源' cloudfunctions/deploy/compat-api/index.js # 期望 = 0
  ```
  **打前 /tmp 预检**（**不碰 `deploy/`**）：`npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=esm --outfile=/tmp/geo-bundle-check.js` → **实测 `999999` = 1、`无法读取行政区划真源` = 0**（2026-09-20 09:01）。
- **源码侧现状（回写实测）**：`grep -c 'origin_code' cloudfunctions/compat-api/index.js` = **0 → 8**（行 `448` / `452` / `465` / `467` / `1751` / `1754` / `1837` / `2008`）；`grep -c '发源地行政区划代码无效' cloudfunctions/compat-api/index.js` = **2**（`:453` / `:1756`）。⇒ **上列「判据当前实测 = `0` / `0`」中，源码侧那半已作废（2026-09-20，取代者本小节）**。
- ⚠️ **「数据集与前端产物同源」的叙述仍需一处修正**：产物①`cloudfunctions/compat-api/lib/geo/divisions.json` **只为「让 esbuild 有 JSON 可内联」而存在**，**不是**运行期读盘对象；**云端实例工作目录不需要 `config/`**。


- **判据当前实测 = `0` / `0`**（2026-09-20 08:36 只读）：`grep -c 'origin_code'`（产物）= **0**；源码侧 `grep -rc 'origin_code' cloudfunctions/compat-api/index.js cloudfunctions/compat-api/lib/` 合计 = **7**（`index.js` **0** / `lib/geo.js` 2（注释）/ `lib/tree-write.js` 2（`:998-999` 落库与 `:1088` 置空）/ `lib/clan.js` 2（`:378` 与 `:699-700`）/ `lib/branch-clan-ops.js` 1（`:716`））⇒ **lib 层已落地、产物未重打、路由层未接线**（命中 ≥1 才是「已重打」）。
- ⚠️ **判据 ④ 第二条（`GEO_DIVISIONS_FILE` / `geo-divisions`）**：它是「数据集已随包」的**字符串型代理判据**（`lib/geo.js` 内即有 `geo-divisions` 字面 ⇒ 重打后应 ≥1）；**真正判据是部署后冒烟**（§24-5 第 2 条能返 200 而非抛 `[geo] 无法读取行政区划真源`）。**不得**只看字符串就判「数据集已随包」——需**同时**确认随包副本存在或环境变量已设。
- **本批不新增集合、不改 `cloudbaserc.json`（除可能新增 `GEO_DIVISIONS_FILE` 环境变量）、不动既有环境变量**（`MASTER_TREE_ID=zhonghua` / `COMPAT_SOURCE=cloud` 均沿用）。
- ⚠️ `cloudfunctions/deploy/compat-api/index.js` 现为 **998,338 B**（2026-09-19 12:50 重打；§19-7 / §21-1 登记值）→ 若仍是该份，则**同时落后 §24 与 §23 的口径**（§23 的 `person_count` 语义变更**无字符串判据**，只能靠数值比对，见 §23-5 第 1 条）。
- ⚠️ **数据集与前端产物同源**：真源 `config/geo-divisions.json`（381,631 B）→ 产物 `frontend/src/static/geo/divisions.json`（156,131 B，**紧凑序列化**，非字节副本）；一致性守卫 = `node scripts/gen-geo-divisions.mjs --check`（**实测 exit 0**）。云函数侧**不得**另抄一份码表（`AGENTS.md` §2.3 第二套真源禁令）。


#### 24-1R-2 数据集真源与产物的回写（2026-09-20）

- **真源**：`config/geo-divisions.json`，**381,631 B / md5 `b8d268c3b4f47da99b3afb0eb633a209`**（本批**未改真源**）。
- **产物两份、字节相同**：产物① `cloudfunctions/compat-api/lib/geo/divisions.json` + 产物② `frontend/src/static/geo/divisions.json`，各 **156,131 B**（**紧凑序列化**，**不是**真源字节副本）；守卫 = `node scripts/gen-geo-divisions.mjs --check` → **实测 exit 0**，输出「— 三件一致：真源 1 + 产物 2（同一渲染输出）」。 → **（已由 §24-11 / §24-12 取代**：现行 = **形状各异**的 2 份 —— 产物① **153,226 B**（全量紧凑 JSON，含 `_meta`）/ 产物② = **`frontend/src/business/geo/divisions.json`** **31,179 B**（紧凑 + deflateRaw + base64，无 `_meta`）；`--check` 输出行亦已改为「形状各异，同源于唯一真源；前端载荷可还原性已校验」，并**新增两条守卫**（前端载荷可还原 / 无废弃静态产物）**）**
- ⚠️ **真源读数更正（2026-09-20 · 见 §24-12）**：上行为**剔除 82 项前**的读数；现行真源 = **373,926 B / md5 `da06c5711763f7989e25d8d793c2e4e0`**（取代 **381,631 B / `b8d268c3b4f47da99b3afb0eb633a209`**）。
- **云函数侧不得另抄码表**（`AGENTS.md` §2.3 第二套真源禁令）—— 口径保持。
- 🆕 **产物②的落位是新增缺陷项**：`frontend/src/static/**` 会被 uni-app **原样拷贝**进小程序主包 ⇒ **超包体上限**，见 **§24-9**。


### 24-2 CloudBase 集合：**无**

- 不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（保持 §11-2 的 **12 项**）；本批只改 tree-meta 两个既有字段的取值与新增一个字段，**不落任何新集合**、不加任何索引。
- **（2026-09-20 · §24-12 附注）** 通读本节：**无**涉及「数据集规模 / md5 / 产物形态与路径 / 测试基线 / 主包体积」的读数 ⇒ **本节无需更正**；上述五类口径的现行真值见 **§24-12**（登记此行以免「未提即漏」）。

### 24-3 云端数据：**有变更**（**纯数据批次：tree-meta 存量迁移**）

**为什么需要**：`origin_code` 是**新增字段**，云端 `jiazu_tree_meta` 文档里**不存在** ⇒ 不迁移则所有存量树在结构化口径下都是「未结构化」（`origin_code = ''`），前端菜单回显为空、展示串只能走 legacy 档；且**能判定到市 / 县的存量值**（Kevin 裁定第 4 条：能到市 / 县的按三级落、只能到省的止于一级）一旦漏迁，后续每次编辑都会把 legacy 原值冲成新值（数据不可逆）。

**逐树映射清单**：**见 `docs/geo-origin.spec.md` §8-2（17 行全表，含 `tree_id` / 旧值 / 新 code / 新展示串 / 判定依据；全表统一标记「待 Kevin 复核」）**；汇总 = **11 行迁移**（止于 L1 = 4 行 / 到 L2 = 4 行 / 到 L3 = 3 行）+ **1 行 legacy 特例不动**（`zhonghua`：`origin='中华'`、`origin_code=''`）+ **5 行空值不动**。**本清单不复制该表**（避免两处各写一套口径）。


#### 24-3R 存量迁移 · 执行结果回写（2026-09-20）

- ✅ **迁移已执行完毕**（`node scripts/migrate-tree-origin.mjs --apply`）—— **本地真源已落库**；本节的命令**已跑过**，**剩余动作 = 上传云端**（第 ③ 步）。
- **md5 前后值（逐字，取代 §24-3-1 的「待填」）**：

  | 对象 | 写入前 md5 | 写入后 md5 |
  |---|---|---|
  | `config/tree-meta.json` | **`06c0d732d365b040cc372483d5eebaf1`** | **`9e29ff4628a234d71d41efc9a75cc9ca`** | → ⚠️（**已作废**：现行权威 md5 = `7ba00cf3833ea373b75e9f20b19d9a6e`（9,511 B / 2026-09-20 09:31:55 · Kevin 亲手直改 JSON），取代者 **§24-13(1)**）

- **备份**：`~/jiazu-backups/2026-09-20-migrate-tree-origin/tree-meta.json`（md5 = **写入前值**）+ `/tmp/jiazu-bak-20260920-085451/`。
- **逐树结果**：共 **17** 棵 → **待写 11 / 跳过 6（含特例 1）**；脚本对每条做「**契约码 vs 名称自动匹配**」交叉核验：**11 条全过**；`--include-auto` **未产生任何补写**；**独立 diff 证明只动 `origin` / `origin_code` 两字段**。 → ⚠️（**判据更正**：现行非空 = **7 / 17**，取代者 **§24-13(2)** / 规格 §13-12-2）
- **逐条落地值（11 条，逐字）**：`gu_39038_01`→`231281`；`ji_23395_01`→`371325`；`liu_21016_01`→`370000`；`qin_31206_01`→`371323`；`shen_27784_01`→`371300`；`ji_23395`→`371300`；`gu_39038`→`330600`；`qin_31206`→`371300`；`long_40857_01`→`520000`；`heng_24658_01`→`210000`；`li_26446_02`→`370000`。**后 6 条为契约外、经 Zang 批准并入**（完整表 + 展示串见规格 **§8-2R**）。 → ⚠️（**已作废**：6 条契约外迁移已被 Kevin 于 2026-09-20 09:31:55 撤销 ⇒ 现行非空 = **7 / 17**，取代者 **§24-13(2)** / 规格 §13-12-2）
- **跳过 6 条**：`zhonghua`（`origin='中华'`，**未动**，且 `origin_code` **字段缺失**）+ 5 棵空值树（`ji_32426_01` / `li_26446_01` / `li_26446_03` / `liu_21016` / `rong_23481_01`，**均字段缺失**）。**裁定：不补写空串** ⇒ 读侧判据一律 `(entry.origin_code ?? '') === ''`（规格 §7-3 修正）。
- **幂等已实测**：`/tmp/jiazu-copy` 副本 `--apply` 得**同值**、复跑**无第二次变化**。
- **第 ④ 步本地判据现应返回**：`11 / 17`（`origin_code` 非空条目）+ `--check` exit 0。 → ⚠️（**判据更正**：非空条目**期望 7 / 17**（不再期望 11 / 17），取代者 **§24-13(2)**）


**具体命令**（仓库根；写法沿用 §3 / §12-1 / §13-2 / §15 既有命令 —— **密钥由用户提供，不代取、不打印**）：

```bash
# ① 【先副本演练】迁移脚本以 COMPAT_OUT_DIR / COMPAT_META_FILE 指向副本（实测已落盘的脚本与旗标）
node scripts/migrate-tree-origin.mjs                            # dry-run（默认，只打印映射表）
COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/migrate-tree-origin.mjs            # 副本演练（dry-run）
COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/migrate-tree-origin.mjs --apply    # 副本演练（真写副本）

# ② 真源迁移（--apply 前自动备份到 ~/jiazu-backups/<YYYY-MM-DD>-<说明>/tree-meta.json，并打印前后 md5）
node scripts/migrate-tree-origin.mjs --apply
#    ⚠️ `--include-auto`（未被契约点名的树走自动匹配）**默认关闭**；本轮 17 树已被规格 §8-2 全表点名
#       ⇒ 本轮**不需要**该开关（是否允许自动落库待 Kevin / Zang 复核，规格 §8-4 第 5 条）

# ③ 重跑迁移上传（tree-meta 逐棵覆盖；命令同 §3 / §12-1）
CB_ENV=liwu-d8gek6jjdab1d087c CB_KEY=<云开发 API Key> \
  node scripts/upload-migrated-to-cloudbase.mjs

# ④ 本地侧判据
python3 -c "import json;t=json.load(open('config/tree-meta.json'))['trees'];print(sum(1 for v in t.values() if v.get('origin_code')),'/',len(t))"   # 期望 11 / 17 → ⚠️（**判据更正**：非空条目**期望 7 / 17**（不再期望 11 / 17），取代者 **§24-13(2)**）
node scripts/gen-geo-divisions.mjs --check   # 期望 exit 0「✅ 产物与真源一致」
md5 config/tree-meta.json                   # 与 §24-3-1 登记值比对
```

#### 24-3-1 备份与 md5 登记位（**迁移前必做；数值由迁移执行者填写**）

| # | 对象 | 写入前 md5 | 写入后 md5 | 备份路径 |
|---|---|---|---|---|
| 1 | `config/tree-meta.json` | **`06c0d732d365b040cc372483d5eebaf1`**（2026-09-20 08:36 实测） | *（待填）* | *（待填；惯例 `~/jiazu-backups/<YYYYMMDD-HHMMSS>-geo-origin/` + `/tmp/jiazu-bak-<ts>` 各一份）* |
| 2 | `cloudfunctions/deploy/compat-api/index.js` | **998,338 B**（2026-09-19 12:50；判据 `grep -c 'origin_code'` = 0） | *（待填）* | 由 esbuild 重生成，无需备份 |


#### 24-3-1R md5 登记位 · 已填（2026-09-20，取代上表两行的「待填」）

| # | 对象 | 写入前 md5 | 写入后 md5 | 备份路径 |
|---|---|---|---|---|
| 1 | `config/tree-meta.json` | **`06c0d732d365b040cc372483d5eebaf1`** | **`9e29ff4628a234d71d41efc9a75cc9ca`** | `~/jiazu-backups/2026-09-20-migrate-tree-origin/tree-meta.json`（md5 = 写入前值）+ `/tmp/jiazu-bak-20260920-085451/` | → ⚠️（**已作废**：现行权威 md5 = `7ba00cf3833ea373b75e9f20b19d9a6e`；旧快照 `9e29ff46…` 不得用于回滚 / 上传，取代者 **§24-13**）
| 2 | `cloudfunctions/deploy/compat-api/index.js` | **998,338 B** / md5 `d61a8aebfb3f3095baae4e1e731fd675`（2026-09-19 12:50） | *（仍待重打包；目标判据见 §24-1R）* | 由 esbuild 重生成，无需备份 |

- **上列「只取一份的判据」已实测成立**：迁移后除 `origin` / `origin_code` 两字段外**逐字节未变**（独立 diff）。


- ⚠️ **`/tmp` 备份不可作为唯一依据**（系统会清理）→ 必须另存 `~/jiazu-backups/`（既有口径：§16-3 追加 / §17-3）。
- **只取一份的判据**：迁移后 `config/tree-meta.json` 的**其余字段逐字节未变**（口径 `AGENTS.md` §2.1：口径变更必须走 spec 章节 + 数据修正批次，**不得顺手统一其它字段**）。
- ⚠️ **`jiazu_assets` 无需为本批改写**：本批**不改任何 `tree_id`**（不是 §20-2 的原地改名）⇒ 集合内 `ref.tree_id` / `desc` **不涉及**本批；若迁移执行时发现引用异常，**以云端实际为准**、只做核对（§16-3 追加既有口径）。
- **不需要动作的两项**：`jiazu_id_seq` **不动**（不铸号）；`jiazu_person_details` **无手工删键**（本批不删节点、不改详情键）。

### 24-4 前端产物（**必须重打包：H5 + 小程序**）

**为什么需要**：三处自由文本输入换成三级级联菜单 + 数据集随包发布 —— **不重打包则线上仍是自由文本输入**（可写入任意字符串 ⇒ 与结构化真源分叉）。

| 区域 | 文件（规格 §7-5 实测锚点） | 改动 |
|---|---|---|
| 建树弹窗（选填） | `frontend/src/pages/index/index.vue`（`:174-179` 输入；`form` `:412`；提交 `:457`；重置 `:467`） | 自由文本 → **三级级联菜单**；提交字段由 `origin` 改为 **`origin_code`** |
| 家族树页「编辑族谱信息」 | `frontend/src/pages/hall/index.vue`（`:308` 输入；`editForm` `:367`；回填 `:774`） | 同上 |
| 祖谱页「编辑祖谱信息」 | `frontend/src/components/clan-hall/clan-hall.vue`（`:166` 输入；`editForm` `:224`；回填 `:252`） | 同上 |
| 展示（**不改**） | `pages/index/index.vue:96`、`pages/hall/index.vue:12`、`pages/family/index.vue:24` | 继续读 `origin`（服务端生成的软冗余）；**「待完善」兜底字面逐字保留** |
| 类型 | `business/types.ts:28` / `:170`、`business/api.ts:1085` / `:1862` | 新增 `origin_code?: string`（`origin` **保留**） |
| 数据集产物 | `frontend/src/static/geo/divisions.json`（**新增**，由真源生成） | 随包发布；消费方式 = **构建期静态引入**（**禁止运行时 `fetch`**，规格 §5-4） |


#### 24-4R 前端产物 · 回写（2026-09-20）

- ✅ **上表前 4 行的前端改造均已落盘**：新增 `frontend/src/business/geo.ts`（**144 行**）+ `frontend/src/components/geo-cascader/geo-cascader.vue`（**239 行**）；三处录入点（`frontend/src/pages/index/index.vue:202` / `frontend/src/pages/hall/index.vue:353` / `frontend/src/components/clan-hall/clan-hall.vue:204`）均已 `import GeoCascader from '@/components/geo-cascader/geo-cascader.vue'`；选择器**只提交码**（`emit('update:modelValue', draftCode)`），**不拼展示串**（展示串真源在后端写路径）。
- 🚫 **上表「数据集产物」行已作废（2026-09-20，取代者本小节 + §24-9）**：产物**不得**留在 `frontend/src/static/geo/divisions.json`（uni-app 对 `src/static/**` **原样拷贝** ⇒ 小程序主包死重）。**新路径与新结构以 Kong 落地为准**（规格 **§13-3**，本册**不预设**路径）。
- **零请求判据保持**（**构建期静态引入**，非运行时 `fetch`）；**反例登记保持**（`frontend/src/business/api.ts:1832` 的 `fetch('/static/tree-meta.json')` **不得**照抄）。


```bash
cd frontend && VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5   # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c

cd frontend && npm run build:mp-weixin                                      # 小程序产物（同批上传）
```

- **零请求判据**（与 `docs/home-sort-search.qa.md` §4-1 同口径）：打开建树弹窗 / 家族树编辑弹窗 / 首页列表，网络面板增量 = **`0 fetch + 0 XHR`**（含阳性对照）。
- **反例登记（不得照抄）**：`frontend/src/business/api.ts:1832` 现以 `fetch('/static/tree-meta.json')` **运行时取静态件** —— geo 数据集**不得**采用该形态（规格 §5-4）。

### 24-5 部署后冒烟验证（按序做）

1. **重打包判据 ≥ 1**：`grep -c 'origin_code' cloudfunctions/deploy/compat-api/index.js`（未重打 = **0**）；**数据集随包判据**：确认随包副本存在或 `GEO_DIVISIONS_FILE` 已设（§24-1 第 ② 步；字符串代理判据见 §24-1 判据 ④ 第二条的注意事项）；
2. **数据集可用（本批独有 · 关键）**：登录后打开建树弹窗（或任一带发源地的读接口）→ **不得**出现 `[geo] 无法读取行政区划真源 …` / `[geo] 行政区划真源为空 …`；带 `chief_editor` 令牌 `POST /admin/create-tree` 传 `origin_code:'370000'` → **200**（**若 500 + 上述文案 = 数据集未随包**）；
3. **结构化写入（白名单）**：带 `chief_editor` 令牌 `PUT /tree-meta` 传 `{tree_id, origin_code:'370000'}` → **200**，且响应 `entry.origin` = **「山东省」**（服务端反查生成），`entry.origin_code` = `'370000'`（**字段未被静默丢弃**）；
4. **未知码 → 400**：同请求传 `origin_code:'000000'`（不在码表内）→ **400** + 文案 **`发源地行政区划代码无效：000000`**（**逐字取自实现**，见规格 §6-4(a)），且 tree-meta **未写入**（回读 `origin_code` 仍为原值）；
5. **legacy 不覆盖**：对 `zhonghua` 传 `{tree_id:'zhonghua', origin_code:''}` → **200**，`origin` **仍为「中华」**（不得被清空）；
6. **立支复制（C1）**：普通树立支 → 新树 tree-meta 条目的 `origin_code` = 源树值（**不为空**），`origin` = 反查结果；
7. **拆树置空（C3）**：拆树 → 新树 `origin_code` = `''` **且** `origin` = `''`（无孤儿码）；
8. **存量迁移回读**：云端 `jiazu_tree_meta` 中 `origin_code` **非空条目 = 11**、`zhonghua` 的 `origin` 仍为 **「中华」**、5 个空值树仍为 `''`（逐条与规格 §8-2 表比对）；
9. **前端**：建树弹窗 / 家族树编辑 / 祖谱编辑三处均为**三级级联菜单**（任一级可止步）；**伪级名不出现在可选项**；选「海外」→ 无下级、展示 **「海外」**；卡片 / 页头展示串与规格 §7-2 黄金用例逐条一致；**网络增量 0 请求**；
10. **小程序端**：重打后同 §24-5 第 9 条验一遍。


#### 24-5R 冒烟验证 · 判据更新（2026-09-20）

- **第 1 条判据更新**：源码侧 `grep -c 'origin_code' cloudfunctions/compat-api/index.js` = **8**（已接线）；**产物侧仍须重打包后 ≥ 1**。🚫 **原「数据集随包判据（随包副本存在 / `GEO_DIVISIONS_FILE` 已设）」整条作废（2026-09-20，取代者本小节）**，改为「产物内 `grep -c '999999'` ≥ 1 **且** `grep -c '无法读取行政区划真源'` = 0」。
- **第 2 条判据更新**：云端**不再**需要 `config/`（静态 import 内联）⇒ 若仍见 `[geo] 无法读取行政区划真源 …`，说明**产物是旧版（未重打包）**，**不是**「数据集未随包」。
- **第 8 条（存量迁移回读）**：本地真源已满足（**11 / 17**；`zhonghua` 的 `origin` 仍为 `中华`；5 棵空值树的 `origin_code` **字段缺失**，非空串）；云端的回读**待第 ③ 步上传后**执行。 → ⚠️（**判据更正**：现行非空 = **7 / 17**，取代者 **§24-13(2)** / 规格 §13-12-2）
- **第 9 条新增子判据（前端）**：三处录入点菜单均可止步于任一级；🆕 **直筒子市（东莞市 / 中山市 / 儋州市 / 嘉峪关市）县级列表为空时须可正常「确定」**（规格 §13-2 第 3 条）。
- **第 10 条新增**：小程序**主包体积**须 ≤ **`2,097,152 B`**（见 **§24-9**）。


### 24-6 本批**不需要**上云的东西

- **测试文件**（**实测尚未落盘**：`cloudfunctions/compat-api/lib/` 下只有 `geo.js`、无 `geo*.test.js`；`grep -c 'geo' package.json` = **0**）：规划名 `cloudfunctions/compat-api/lib/geo-divisions.test.js` / `lib/geo-origin-write.test.js`；纯本地（**必须注册进根 `package.json` 的 `scripts.test`，未注册 = 假绿**），**不进打包产物**；`npm test` 跑 `/tmp` 副本，**不得当云端回归**；
- **数据集与生成脚本本身**：`config/geo-divisions.json`（真源，进 Git）+ `scripts/build-geo-divisions.mjs` / `scripts/gen-geo-divisions.mjs` 是**离线工具与数据**，**不进云函数 JS 产物**（但真源**必须随云函数包发布**，见 §24-1 第 ② 步 —— 两件事不同，勿混）。
- **文档**：`docs/geo-origin.spec.md`（本批规格真源）与本清单 **§24**：不进产物、不影响云端；
- **`/tmp/jiazu-*` 下的副本、备份与取证文件**：临时产物（正式备份另存 `~/jiazu-backups/`）；
- **`frontend/dist/**` 现有构建产物**：需重打，**不得**沿用（同 §23-4 既有口径）。


#### 24-6R 「不需要上云」清单 · 回写（2026-09-20）

- 🚫 **上列第 1 条「测试文件实测尚未落盘」已作废（2026-09-20，取代者本小节）**：`cloudfunctions/compat-api/lib/geo.test.js`（**349 行 / 17 test**）**已建并注册**进根 `package.json` 的 `scripts.test`（**25 → 26 项**）；全量基线 **430 tests / 430 pass / 0 fail / 0 skipped**（规格 **§9-1R / §13-7**）。**纯本地、不进打包产物**的口径保持；`npm test` 跑 `/tmp` 副本、**不得当云端回归**（口径不变）。
- ⚠️ **上列第 2 条的「真源必须随云函数包发布」半句已作废（2026-09-20，取代者 §24-1R）**：数据集由 **esbuild 内联**，**不需要**随包副本；但**产物①`cloudfunctions/compat-api/lib/geo/divisions.json` 会进云函数产物**（作为内联源）—— 与「`config/` 真源不进产物」**是两件事**。
- **其余各条保持**（文档 / `/tmp` 副本与备份 / `frontend/dist/**` 不得沿用）。


### 24-7 阻塞点

- ⚠️ **必须先完成实施再部署**：**lib 层与脚本已落盘**（实测），但 `PUT /tree-meta` 白名单、`POST /admin/create-tree` 与祖谱两条路由的接线、前端菜单、单测**仍待 Kong-A**（规格 §0-4 未落盘清单）；`grep -c 'origin_code' cloudfunctions/compat-api/index.js` = **0** ⇒ **路由层与产物均不含本批改动**。
- ⚠️ **新增阻塞项：数据集必须随云函数包发布**（本批独有，见 §24-1 第 ② 步）。`lib/geo.js:14-16` 头部明写该要求：`fs.readFileSync` **运行时读盘**、esbuild 只 bundle JS ⇒ 不把真源副本放进云函数目录、或未设 `GEO_DIVISIONS_FILE`，云端**首次调用即抛** `[geo] 无法读取行政区划真源 <路径>：<原因>`（`lib/geo.js:48`）⇒ 建树 / 建祖谱 / 结构化编辑路径**全部 500**。**二选一必须做，并在本节登记随包路径或环境变量取值**。
- ⚠️ **云函数重打包与数据迁移是两件事、都要做**：只重打包不迁移 ⇒ 存量树 `origin_code` 全为空、菜单回显为空；只迁移不重打包 ⇒ 云端 `PUT /tree-meta` **静默丢弃** `origin_code`（新值写不进）。
- ⚠️ **前端与云函数必须同批发布**：只发云函数不发 H5 ⇒ 线上仍是自由文本输入（可写入与真源分叉的字符串）；只发 H5 不发云函数 ⇒ 菜单选了码但云端不落库（回显立刻变空）。
- **内存缓存**：`lib/store.js` 的 `metaCache` 进程内常驻 —— 本地迁移后 / 云端部署后**必须重启实例**才生效（口径见 §20-1 末条）。
- **未决项不影响部署本身**：港澳下级清单 / 台湾省确切项数 / 「候选」码值核对等（规格 §11-2）由实施批次收口；**核对未通过的映射行一律降级或不迁移**（规格 §8-4 第 1 条）。
- H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §4 / §16-4 / §17-4 / §22 / §23-4）。


#### 24-7R 阻塞点 · 回写（2026-09-20）

- ⚠️ **上列第 1 条已大幅收敛**：**代码面全部落地**（lib 层 + 四路由 + 白名单 + 前端菜单 + 单测）⇒ **唯一硬阻塞 = 云函数重打包 + 部署**（判据见 **§24-1R**）。
- 🚫 **上列第 2 条「新增阻塞项：数据集必须随云函数包发布」已作废（2026-09-20，取代者 §24-1R）** —— **该阻塞点已消除**（esbuild 内联）。
- 🆕 **新增阻塞项①（前端）**：**数据产物仍在 `frontend/src/static/geo/`** ⇒ 小程序**主包超限**（**2,243,357 B** > **2,097,152 B**），**必须迁出后方可上传小程序**（规格 **§13-3** / **§24-9**）。**H5 不受此限**，但**同批发布口径**要求一并处理。
- 🆕 **新增阻塞项②（数据面 · 未落盘）**：**真源仍含 82 个非 6 位第三级项**（东莞 **36** / 中山 **23** / 儋州 **18** / 嘉峪关 **5**）⇒ 4 个直筒子市**尚未止于第二级**（规格 **§13-2**）。
- **上列第 3 / 4 条（重打包与数据迁移都要做、前端与云函数同批发布）保持有效**。
- **上列第 5 条（`lib/store.js` 的 `metaCache` 常驻 ⇒ 迁移后 / 部署后必须重启实例）保持有效**。
- **上列第 6 条（未决项不影响部署本身）保持有效**；港澳 / 台湾项数 / 候选码值等未决以规格 **§11-2R** 的收口表为准。


### 24-8 跨册登记

- **口径唯一真源 = `docs/geo-origin.spec.md`**（本清单只登记上云动作与判据，不复制口径）。
- **跨册回写（未完成）**：`AGENTS.md` §0 文档索引 + §9 速查的本册登记行、`docs/data-model.md` 的 `origin_code` 字段行 —— 落盘状态以规格 §12 的登记表为准。

#### 24-8R 跨册登记 · 回写（2026-09-20）

- ✅ **上列第 2 项已作废（2026-09-20，取代者本小节）**：`docs/data-model.md` §5.5 的 **`origin_code` 字段行已落盘**（**本次回写完成**；`origin` 降级说明同处）。
- 🚫 **上列第 1 项仍未落盘**：`AGENTS.md` §0 / §9 的登记行 —— **本轮不重试**（写入被保护策略拦截 = 未获同意），**由 Zang 向 Kevin 取授权后写**；**拟稿（已按新实测更新）见规格 §12-1**。
- **接口口径不变**：本清单只登记上云动作与判据，**口径唯一真源仍是 `docs/geo-origin.spec.md`**。



### 24-9 小程序主包体积（🆕 **新增项 · 2026-09-20 裁定**）

**为什么新增**：本批把数据产物放进 `frontend/src/static/**`，而 **uni-app 对 `src/static/**` 是「原样拷贝」** ⇒ **主包直接背上全量数据集**，属**本次改动引入的回归**（规格 **§13-3**）。

| 时点 | 小程序主包 | MiB | 上限 `2,097,152 B`（2 MiB） |
|---|---|---|---|
| **改前** | **1,948,274 B** | 1.858 MiB | ✅ **未越线** |
| **改后（当前）** | **2,243,357 B** | 2.139 MiB | ❌ **超限 146 KB**（= 146,205 B） |

- **Jing 复核实测（2026-09-20 09:02 CST）**：`find frontend/dist/build/mp-weixin -type f -exec stat -f%z {} \; | awk '{s+=$1} END {print s}'` = **2,249,939 B**（同口径、同量级、**同样越线**）；H5 同法 = **2,379,757 B**（**H5 无同款硬上限，不作阻塞项**）。**以「越线」为定论**，具体字节数以**最新一次构建**为准。
- **死重主因对照**：`frontend/dist/build/mp-weixin/static/geo/divisions.json` 实测 **156,131 B**（= 产物② 全量拷贝）；但**不得**把「改前 → 改后」的全部差额（**295,083 B**）都归给数据集（含本批其它前端改动）。
- **动作（必须先做）**：把前端数据产物**迁出 `frontend/src/static/**`** → 重打小程序 → **实测主包 ≤ `2,097,152 B`**；**新路径以 Kong 落地为准**（规格 §13-3）。**未达标不得上传小程序**。
- **判据命令**：`cd frontend && npm run build:mp-weixin` 后按上表重算，并把**前后值登记到本小节**。

#### 24-9R 本小节「当前读数」更正（**追加 · 2026-09-20 09:13–09:17 CST 实测 · 取代上表「改后（当前）」行**）

> 上表「**改后（当前）2,243,357 B / 超限 146 KB**」是**迁移前的中间态**读数（该状态下前端产物曾**同时**存在于旧 `src/static/geo/` 与新路径 ⇒ **双份**）。**现行真值（本册最终口径）**：

| 时点 | 小程序主包 | MiB | 上限 `2,097,152 B`（2 MiB） |
|---|---|---|---|
| **改前**（未含本次改动的基线） | **1,948,274 B** | 1.858 MiB | ✅ 未越线 |
| 迁移前中间态（产物双份） | 2,243,357 B | 2.139 MiB | ❌ 超限 146 KB |
| **修复后（现行 · 本次发布口径）** | **1,985,417 B** | **1.8934 MiB** | ✅ **未越线，余量 111,735 B** |

- **实测**（09:13–09:17 CST）：整包 `frontend/dist/build/mp-weixin` = **1,991,999 B**（其中唯一分包 `pages/special` = **6,582 B**）⇒ 主包 = 1,991,999 − 6,582 = **1,985,417 B**；主包内 **`static/geo` 已无**（`ls dist/build/mp-weixin/static/geo` → `No such file or directory`）；`business/geo.js` = **33,152 B**；dist 重建于 **09:10–09:11**。
- 相对「改前」基线的净增量 = **+37,143 B**（= 1,985,417 − 1,948,274）；上表第 2 行的超限额 146 KB 与第 3 行的差额 295,083 B **均为历史行，不得再引用**。
- ⇒ **§24-7R「新增阻塞项①」关闭**（体积判据达标）；**管控线不变**：**≤ 2,097,152 B**，且**产物不得再落 `frontend/src/static/**`**（规格 **§13-11-2**）。
- 逐条取代清单（含测试基线 431 / 26）见 **§24-12**。

### 24-10 本批次「已实现 / 已作废」总览（🆕 2026-09-20 回写）

| 子节 | 状态 |
|---|---|
| §24-0 | ⚠️ 第 1 / 4 行部分被超越；第 2 / 3 行保持 |
| §24-1 | ✅ 代码面全部落地；**判据与第 ② 步按 §24-1R / §24-1R-2 执行** |
| §24-2 | ✅ 保持（CloudBase 集合：无） |
| §24-3 | ✅ **已执行完成**（§24-3R / §24-3-1R）；**剩余动作 = 上传云端** |
| §24-4 | ⚠️ 前端改造已落盘；**数据产物落位按 §24-4R + §24-9 修正** |
| §24-5 | ⚠️ 冒烟判据按 §24-5R 执行 |
| §24-6 | ⚠️ 第 1 / 2 条被超越（§24-6R） |
| §24-7 | ⚠️ 阻塞点按 §24-7R 执行 |
| §24-8 | ✅ 保持（口径真源 = `docs/geo-origin.spec.md`）；跨册回写状态见规格 **§12-2** |
| **§24-9** | 🆕 **小程序主包体积项（新增）** |
| **§24-10** | 🆕 **本总览（新增）** |

> **边界声明**：§24 正文成文于 2026-09-20 08:45 的实测时点，本轮回写**只对 §24 追加**；**其余批次（§1–§23）本轮回写未改动一行**（`AGENTS.md` §0 第 4 条）。`AGENTS.md` **本轮未修改**（未获授权，见规格 §13-9）。



### 24-11 追补：2026-09-20 09:07–09:08 实测（**Kong 落地中 · 取代 §24-1R-2 / §24-4R / §24-9 的相应读数**）

> **时点 = 2026-09-20 09:07–09:09 CST（只读实测）**。§24 上文与 §24R / §24-9 的相应读数**已被本小节取代**；**旧行保留原文**。
>
> ⚠️ **本小节的部分读数已作废（追加标注 · 2026-09-20 · 取代者 §24-12）**：**（2）末行「主包体积须重测」→ 已重测（1,985,417 B 未越线，见 §24-9R）**；**（3）整段「测试基线变为 414 / 413 / 1」→ 已修（431 / 431 / 0，`geo.test.js` 单跑 18/18，见 §24-12(3)）**；**（4）第 1 / 2 / 3 行 → 均已关闭（geo.ts 已切新路径 / `scripts/verify-geo-frontend.mjs` 已落盘 9,458 B / 主包已达标）**；**（1）与（4）第 4 行（云函数未重打包）仍成立** —— 现行为 `cloudfunctions/deploy/compat-api/index.js` **998,338 B / mtime 2026-09-19 12:50 / `grep -c 'origin_code'` = 0**。**以下原文一律保留**。

**（1）直筒子市 82 项已剔除（取代 §24-7R 的「新增阻塞项②」）**：

| 项 | 剔除前 | **剔除后（实测 09:07）** |
|---|---|---|
| 真源 `config/geo-divisions.json` | 381,631 B / md5 `b8d268c3b4f47da99b3afb0eb633a209` | **373,926 B / md5 `da06c5711763f7989e25d8d793c2e4e0`** |
| `counties` | 3,449（码长 `{6: 3367, 9: 82}`） | **3,367（码长 `{6: 3367}`）** |
| 全部码 | 3,853 | **3,771**（无重复） |
| 东莞 / 中山 / 儋州 / 嘉峪关 | 36 / 23 / 18 / 5 | **`counties` = 0**（止于第二级） |
| `_meta.source_sha256` | `7f150ed0…` | **`9114c1454e8cf3e35af5223c99df281e2266fb73287d96b1ef589db1bb0392d7`** |

⇒ **§24-7R 的「新增阻塞项②」关闭**（可选：重跑 `node scripts/gen-geo-divisions.mjs --check` → **实测 exit 0**）。

**（2）前端数据产物已迁出 `src/static/`（取代 §24-4R 的「按 §13-3 修正」与 §24-9 的迁移前口径）**：

- 产物②新路径 = **`frontend/src/business/geo/divisions.json`**（**31,179 B**，形状 = **紧凑 + deflateRaw + base64（无 `_meta`）**）；**`frontend/src/static/geo/` 已删除**（死重来源消失）。
- 产物①（云函数）= `cloudfunctions/compat-api/lib/geo/divisions.json`，**153,226 B**（**全量紧凑 JSON（含 `_meta`）**）—— **两份产物形状各异**（**取代 §24-1R-2 的「产物两份、字节相同」**）。
- **新增前端解压模块** `frontend/src/business/geo/inflate.ts`（raw DEFLATE / RFC 1951 + base64 / UTF-8；零依赖、零 IO）。
- **`--check` 新增两条守卫**（**实测 exit 0**）：「前端载荷可还原：deflateRaw 解压 + 相对码还原后与真源 `provinces` 逐字段一致」+「**无废弃静态产物**：`frontend/src/static/geo/divisions.json` 不存在（主包死重守卫）」。
- ⚠️ **主包体积须重测**：现存 `frontend/dist/build/mp-weixin/static/geo/divisions.json` 是 **08:54 旧构建**（`dist/` 不进 Git）⇒ §24-9 的 `2,243,357 B` 是**迁移前**读数，**重打后按 §24-9 判据复测并回填**。

**（3）测试基线变为 414 / 413 / 1（取代 §24-6R 的「430 / 430 / 0」）**：

- 实测 `npm test` → **`# tests 414` / `# pass 413` / `# fail 1` / `# skipped 0`**；`scripts.test` 仍 **26** 项。
- **唯一失败项 = `cloudfunctions/compat-api/lib/geo.test.js` 的整文件加载期失败**（照录）：`ENOENT … '/Users/kevin/bistro/jiazu/frontend/src/static/geo/divisions.json' at …geo.test.js:66:30` —— **它仍在读已被删除的旧产物②路径**。⇒ 判据**生效**（已注册的测试项让 `npm test` **变红**，非假绿）；**修复属代码面**（改读新路径 / 后端产物 / 纯函数），**本清单不动代码**。

**（4）该时点的未一致项（登记 · 不代为判定）**：

| # | 现象 | 影响 |
|---|---|---|
| 1 | `frontend/src/business/geo.ts:15` 仍 `import divisionsJson from '@/static/geo/divisions.json';`（mtime 08:49，未随迁移更新） | 旧路径已删除 ⇒ **前端当前构建会失败**（未切到 `inflate.ts`） |
| 2 | `inflate.ts` 头部引用的 `scripts/verify-geo-frontend.mjs` **实测不存在** | 悬空引用 / 未落盘 |
| 3 | `frontend/dist/build/mp-weixin/static/geo/divisions.json` 为 08:54 旧构建 | 主包体积**待重测** |
| 4 | `cloudfunctions/deploy/compat-api/index.js` 仍未重打包 | **§24-1 的唯一硬阻塞不变** |

> **边界**：以上均为 **09:07–09:08 的只读实测**；Kong 当时仍在收尾 ⇒ 属**「落地中的中间态」**，不得据此判缺陷。**其余批次（§1–§23）本轮未改一行；`AGENTS.md` 本轮未修改。**



### 24-12 追补二：**2026-09-20 09:13–09:17 CST 实测真值** —— **§24-11 的 414 基线与 4 条未一致项整批作废**（含 §24-1R-2 / §24-2 / §24-9 的行内更正）

> **时点 = 2026-09-20 09:13–09:17 CST（Jing 只读实测；每条读数均附复测命令）**。
> ⚠️ **§24-11 是「Kong 收尾中」的中间态快照** ⇒ 其 **（2）末行「主包体积须重测」/（3）整段「414 / 413 / 1」/（4）第 1、2、3 行，全部作废**；**§24-9 的「改后（当前）2,243,357 B」与 §24-1R-2 的「真源 381,631 B / 产物②旧路径 / 两份产物字节相同 / 守卫输出『同一渲染输出』」亦作废**（取代者 = 本节）。**旧行原文完整保留**，仅在行尾 / 小节尾**追加标注**（`AGENTS.md` §0 第 4 条）。
> **本清单不改代码、不重试 `AGENTS.md`、不执行任何部署动作。**

**（1）逐条取代（上轮所写 → 实测真值）**

| # | 上轮所写（中间态） | **实测真值（09:13–09:17 CST）** | 证据 |
|---|---|---|---|
| 1 | §24-11(4)-1 = 规格 §13-10-4-1：「`frontend/src/business/geo.ts:15` 仍 import 旧 `@/static/geo/…` ⇒ **前端当前构建会失败**」 | **已修**：`geo.ts:28` = `import divisionsJson from '@/business/geo/divisions.json';`、`:29` = `import { inflateBase64ToUtf8 } from './geo/inflate';`；`cd frontend && npm run type-check`（`vue-tsc --noEmit`）= **exit 0 / 零错**；`build:h5` 与 `build:mp-weixin` **均成功**（dist 产物 mtime **09:10:43**） | `sed -n '26,30p' frontend/src/business/geo.ts`；`npm run type-check`；`stat -f '%Sm %N' frontend/dist/build/mp-weixin/app.js` |
| 2 | §24-11(3)：「测试基线变为 **414 / 413 / 1**（`geo.test.js` 整文件 ENOENT，读已删除的旧产物②）」 | **已修**：`npm test` = **431 tests / 431 pass / 0 fail / 0 skipped**；`node --test cloudfunctions/compat-api/lib/geo.test.js` 单跑 = **18 / 18 / 0**；`scripts.test` 枚举 = **26** 项 | `npm test`（末尾 `# tests 431` / `# pass 431` / `# fail 0`）；`node --test cloudfunctions/compat-api/lib/geo.test.js`（`1..18`） |
| 3 | §24-11(4)-2：「`scripts/verify-geo-frontend.mjs` **实测不存在** ⇒ 悬空引用」 | **已落盘**：**9,458 B**，mtime **09:12**；实跑 **16 项检查全过、exit 0**（含「自研 DEFLATE vs node `zlib` **210 组模糊测试逐字节一致**」与 4 个直筒子市 `isTerminalCity=true / 县级列表为空`） | `ls -l scripts/verify-geo-frontend.mjs` → `9458 Sep 20 09:12`；`node scripts/verify-geo-frontend.mjs` → `✅ 全部通过：16 项检查` |
| 4 | §24-9 表「改后（当前）**2,243,357 B** / 超限 146 KB」；§13-3 的 Jing 复核值 2,249,939 B | **已重测**：主包 **1,985,417 B = 1.8934 MiB**（上限 `2,097,152 B` ⇒ **余量 111,735 B，未越线**）；整包 **1,991,999 B**（唯一分包 `pages/special` = 6,582 B）；**主包内已无 `static/geo`**；`business/geo.js` = **33,152 B** | 见 **§24-9R**（`find frontend/dist/build/mp-weixin -type f -exec stat -f%z {} \;` 求和；`ls …/static/geo` → `No such file or directory`） |
| 5 | §24-1R-2：「真源 `config/geo-divisions.json` **381,631 B / md5 `b8d268c3b4f47da99b3afb0eb633a209`**（本批**未改真源**）」 | **已重建**：**373,926 B / md5 `da06c5711763f7989e25d8d793c2e4e0`**；`counties` **3,367**（码长分布 `{6: 3367}`，**无非 6 位项**）；全部码 **3,771**（**无重复**）；`_meta.source_sha256` = `9114c1454e8cf3e35af5223c99df281e2266fb73287d96b1ef589db1bb0392d7` | `wc -c config/geo-divisions.json` + `md5 -q`；python3 统计 `counties` / 码长分布 / 重复 |
| 6 | §24-1R-2：「**产物两份、字节相同**，各 **156,131 B**；产物② = `frontend/src/static/geo/divisions.json`」 | **形状各异**：产物①（云函数）`cloudfunctions/compat-api/lib/geo/divisions.json` **153,226 B**（全量紧凑 JSON，含 `_meta`）/ 产物②（前端）`frontend/src/business/geo/divisions.json` **31,179 B**（紧凑 + deflateRaw + base64，无 `_meta`，由 `frontend/src/business/geo/inflate.ts` 还原）；**`frontend/src/static/geo/` 已删除**（uni-app 对 `src/static/**` 原样拷贝 = **死重**，主包越限的**真正根因**） | `ls -l` 两产物；`ls frontend/src/static/` → `icons/`、`logo.png`、`tree-api.json`、`tree-meta.json` |
| 7 | §24-1R-2 守卫输出：「— 三件一致：真源 1 + 产物 2（**同一渲染输出**）」 | **`node scripts/gen-geo-divisions.mjs --check` = exit 0**，输出 5 行，末行改为「— 三件一致：真源 1 + 产物 2（**形状各异**，同源于唯一真源；**前端载荷可还原性已校验**）」；**新增两条守卫**：「**前端载荷可还原**」（deflateRaw 解压 + 相对码还原后与真源 `provinces` 逐字段一致）+「**无废弃静态产物**」（`frontend/src/static/geo/divisions.json` 不存在；**存在即 exit 1**） | `node scripts/gen-geo-divisions.mjs --check; echo exit=$?` → `exit=0` |
| 8 | （§24-11 未登记）发布前的中间态把前端产物构建为**双份** | ⇒ 主包 2,243,357 B（超限 146 KB）**属本次改动引入的回归**；修复后 **1,985,417 B**，相对**未含本次改动的基线 1,948,274 B** 增量 **+37,143 B** ⇒ **回归已消解** | `1,991,999 − 6,582 = 1,985,417`；`1,985,417 − 1,948,274 = 37,143`；`2,097,152 − 1,985,417 = 111,735` |

**（2）三条已定口径（本册口径登记；与规格 §13-11-1 / §13-11-2 / §13-11-3 同源）**

1. **直筒子市（已落盘）**：真源剔除 **82** 个非 6 位码的街道 / 镇级项（广东东莞 **36** / 广东中山 **23** / 海南儋州 **18** / 甘肃嘉峪关 **5**）；这 4 市**法定无县级** ⇒ **止于第二级**（**选到市即终点**）；前端以**数据驱动**的 `isTerminalCity()`（`frontend/src/business/geo.ts:123`；`geo-cascader.vue:138` 消费）终止且**不渲染空列**，**不写死地名**；构建脚本 `scripts/build-geo-divisions.mjs` 同步加 `pruneUncodedLevel3()`（`:116` 定义 / `:204` 调用，**判据只用码形状** `^\d{6}$`，日志列出被剔除项）；真源 `_meta.note` ⑤ 已登记。⇒ **§24-7R「新增阻塞项②」关闭**。
2. **前端产物形态与主包体积管控线**：前端产物 = `frontend/src/business/geo/divisions.json`（**31,179 B**）+ `frontend/src/business/geo/inflate.ts`（自研 raw DEFLATE（RFC 1951）/ base64 / UTF-8 还原；**小程序与 H5 运行时均无** `zlib` / `DecompressionStream`）。**管控线：小程序主包 ≤ `2,097,152 B`（2 MiB），且产物不得落 `frontend/src/static/**`** —— **后续任何前端数据新增一律按此判据**（现行余量 **111,735 B**）；**未达标不得上传小程序**（H5 无同款硬上限，不作阻塞项）。
3. **测试基线（本册最终口径）**：`scripts.test` = **26** 项；`npm test` = **431 tests / 431 pass / 0 fail / 0 skipped**（含 `geo.test.js` **18** 条）。⇒ **§24-6R 的 430 / 430 / 0 与 §24-11(3) 的 414 / 413 / 1 两套读数一并作废**（历史行保留）。

**（3）仍未关闭项（唯一）：云函数未重打包** —— `cloudfunctions/deploy/compat-api/index.js` = **998,338 B / mtime 2026-09-19 12:50**、`grep -c 'origin_code'` = **0** ⇒ **§24-1 的硬阻塞不变**（属部署动作，本清单不代做）。

> **边界**：本轮回写**只对 §24 追加**（§24-1R-2 / §24-2 / §24-9 / §24-11 为行尾或小节尾**追加标注**，§24-12 为**新增小节**）；**§1–§23 未改一行**；**`AGENTS.md` 未修改**（未获授权，见规格 §13-9）；**未改任何代码、未重试 `AGENTS.md`、未执行部署**。

---

### 24-13 追补三：**2026-09-20 09:31:55 真源外部人工写入（Kevin）后的权威台账** —— **§24-3 / §24-3-1R 的「md5 前后值 + 11 条落地值」一并更新**

> **时点 = 2026-09-20（Jing · 只读复核；真源逐条读盘，未做任何写入）**。
> **本节只追加**：§24-3 / §24-3-1R 的历史行**原文完整保留**，仅在行尾追加标注；**不改代码、不碰真源、不重试 `AGENTS.md`、未执行任何部署动作。**

**（1）`config/tree-meta.json` 的 md5 三态（**现行权威 = 第三行**）**

| 状态 | md5 | 字节 | 时点 | 效力 |
|---|---|---|---|---|
| 迁移前 | `06c0d732d365b040cc372483d5eebaf1` | — | 08:54 之前 | 历史（备份 `~/jiazu-backups/2026-09-20-migrate-tree-origin/tree-meta.json` = 写入前值） |
| 首次 `--apply` 后 | `9e29ff4628a234d71d41efc9a75cc9ca` | `9620 B` | 08:54–09:31:55 | **已作废**（中间态快照：含 6 条契约外落码 + `heng_24658_01` 的 `210000`） |
| **现行权威** | **`7ba00cf3833ea373b75e9f20b19d9a6e`** | **`9511 B`** | **2026-09-20 09:31:55（Kevin 亲手直改 JSON）** | **上传云端 / 一切口径的唯一源状态** |

- **复测命令**：`wc -c config/tree-meta.json; md5 -q config/tree-meta.json; stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' config/tree-meta.json`。
- **写入方式 = 直改真源 JSON 文件（非 API）**：`PUT /tree-meta` 只会写入一个字符串（非空码 → `entry.origin_code = <码>`；空串 → `entry.origin_code = ''`），**API 侧不存在删除该字段的代码路径**，而真源中被撤销的树是**字段整体缺失** ⇒ 结构性证据见规格 **§13-12-1**。
- **本册 7 处已在行尾追加标注**（原字保留）：`:2122`（§24-3 md5 表 · md5 作废）、`:2125`（§24-3「逐树结果：待写 11 / 跳过 6」· 判据更正）、`:2126`（「逐条落地值（11 条）」· 作废）、`:2129`（「第 ④ 步本地判据现应返回 11 / 17」· 判据更正）、`:2150`（判据命令「期望 11 / 17」· 判据更正）、`:2167`（§24-3-1R md5 表 · 作废）、`:2227`（§24-5 冒烟第 8 条「11 / 17」· 判据更正）。

**（2）17 棵权威台账（**更替 §24-3 / §24-3-1R 的「11 行迁移 + 6 行跳过」**）**

- **现行 `origin_code` 非空 = `7 / 17`**（判据命令的期望值从 **11 / 17 更正为 7 / 17**）：
  - **契约内 5 棵**（迁移前后一致）：`gu_39038_01` = `231281`（`黑龙江省绥化市安达市`）/ `ji_23395_01` = `371325`（`山东省临沂市费县`）/ `liu_21016_01` = `370000`（`山东省`）/ `qin_31206_01` = `371323`（`山东省临沂市沂水县`）/ `shen_27784_01` = `371300`（`山东省临沂市`）；
  - **Kevin 人工值 2 棵**：`heng_24658_01` = `211300`（`辽宁省朝阳市`，**取代** `210000` / `辽宁省`）/ `ji_32426_01` = `230303`（`黑龙江省鸡西市恒山区`，**原 `origin` 为空、原无码字段**）；
- **经 Kevin 于 09:31:55 撤销、回退为 legacy 5 棵**（`origin_code` 字段**不存在**，`origin` 为迁移前旧文本）：`ji_23395` = `山东临沂` / `gu_39038` = `浙江绍兴` / `qin_31206` = `山东临沂` / `long_40857_01` = `贵州` / `li_26446_02` = `山东`；
- **特例**：`zhonghua` = `中华`（无 `origin_code` 字段，本轮未动）；
- **空 origin（字段缺失）4 棵**：`liu_21016` / `li_26446_01` / `rong_23481_01` / `li_26446_03`（`origin` 均为空串）。
- ⇒ **§24-3 的「逐条落地值（11 条）」与「跳过 6 条」两行作废**；**取代者 = 规格 §13-12-2**（含档位与逐字展示串的完整表）。

**（3）上传口径（**硬，无例外**）**

1. **云端上传一律以 `7ba00cf3833ea373b75e9f20b19d9a6e` 这一状态的 `config/tree-meta.json` 为源**；**不得上传** §24-3 / §24-3-1R 记录的旧快照（`9e29ff46…`），**不得**用任何备份 / 沙箱副本覆盖现行真源。
2. **禁止「按原映射补回」**：6 条契约外迁移**已被 Kevin 撤销**，`heng_24658_01` 的 `210000`、`ji_23395` 的 `371300` 等旧值**不得回写**；后续任何同类动作（含一切存量迁移补写）**必须先取得人类一句明确同意**（**Zang 的「契约外扩展」授权已由 Kevin 收回**，规格 §13-12-3 第 2 条）。
3. **首次 apply 过的 `9e29ff46…` 快照已作废**（**保留记录、仅供追溯**：`9620 B` / 08:54 / 含 6 条契约外落码 + `heng` 的 `210000`）⇒ §24-3-1R 的「写入后 md5」一栏**以本节第三行为准**。
4. **新增已知限制 KL-1**（**非缺陷、不修**）：`PUT /tree-meta` 的空串码分支会把**已迁移**的 `origin_code` 落为 `''`（last-write-wins，无版本 / 并发校验）⇒ **迁移前就已加载的旧页面若原样保存，会静默丢失结构化码**；替换口径与缓解项见规格 **§13-12-4**。

**（4）跨册：`docs/geo-origin.qa.md` 的 2 条 FAIL 已改判为非缺陷（同一笔外部写入所致）**

| 该册位置 | 原判定 | 现判定 |
|---|---|---|
| §4 **D5-b**（收尾 md5 与前值不一致） | FAIL | **撤销：非产品缺陷**（Kevin 亲手外部人工写入） |
| §5 **E3-c**（11 棵与 §8-2R 不一致） | FAIL 5/11 | **撤销：判据失效**（§8-2R 已整表作废） |

⇒ 该册 §7 md5 表的「❌ 不一致」同批改判为「**外部人工写入，符合预期**」；§8 FAIL-1 的「**从备份 / 沙箱副本恢复 §8-2R 的 11 条落地值**」**建议作废且动作禁止**；该册新增风险条 **R8**（过期内存副本整文件回写）。**依据与逐条改判见该册 §12。**

**（5）本批唯一仍成立的硬阻塞（不变）**：`cloudfunctions/deploy/compat-api/index.js` **未重打包** —— `998,338 B` / `mtime 2026-09-19 12:50` / `grep -c 'origin_code'` = **0** ⇒ **§24-1 的硬阻塞不变**（属部署动作，本节**只登记、不代做**）。

> **边界**：本轮回写**只对 §24 追加**（§24-3 / §24-3-1R 共 5 处**行尾标注** + 本节**新增小节**）；**§1–§23 未改一行**；**`AGENTS.md` 未修改**（未获授权，见规格 §13-9）；**未改代码、未写真源、未重跑验证、未执行部署**。


---

## 25. 本批：人物地点属性（出生地 / 居住地）与家族树来源地镜像（**代码批次 + 纯数据批次**）

> **权威规格** = **`docs/person-places.spec.md`**（**2026-09-20 成文 · 口径唯一真源**；契约冻结于 Zang **v2 · C1–C10**，逐条见该册 §0-2）。
> 口径来源 = **Kevin 五问五答（2026-09-20 拍板）** + Zang 契约 v2（含 **`birth_place` 由字符串改对象**这一 **Kevin 明示的高风险项**）。
> **本批性质** = **代码批次（云函数 + 前端）** **＋ 纯数据批次（`migrate-output/trees/*.json` 形状迁移 + tree-meta 镜像对齐）** —— 两类动作的云端步骤**不能互相替代**（同 §13 A / B 的分野）。
> **相关册**：行政区划码表 / 展示串口径 = `docs/geo-origin.spec.md`（本批**复用**其 `origin_code` 体系）；tree-meta 字段口径 = `docs/data-model.md` §5.5 / §3。
> **成文时点 = 2026-09-20（Jing）**；**本节只登记待办与判据，不代做任何部署 / 迁移动作**。

### 25-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **必须重打包 + 部署**（判据见 §25-1） | ⚠️ **本批代码面全部未落盘**（实测：`residence_places` 在源码 `index.js` / `lib/**` / 部署产物**三处均为 0 次**）⇒ 先由 Kong 落地，本批才具备可部署物 |
| 2 | CloudBase 集合 | **无**（不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`，保持 §11-2 的 **12 项**） | — |
| 3 | 云端数据 | **有变更**：**①** 树 JSON 形状迁移（`birth_place` 字符串 → 对象；新增 `residence_places`）；**② ~~tree-meta 镜像对齐~~** → 🚫 **已作废（C8 作废 ⇒ 不存在自动同步 ⇒ 无「镜像对齐」这一步）**；tree-meta 的 `origin_code` / `origin` 语义**继续有效**（本批**只增不删**），其内容来源改为 **C8′ 人工指定** | 需 CB_ENV / CB_KEY；形状迁移**受 §25-3 第 0 条前置约束**（→ ⚠️ **状态更新**：**Kevin 已逐树点选完毕**，**仍待 Zang 下令 `--apply`**；并有一条 `li_26446_01` 冲突待澄清，见 §25-10(3)） |
| 4 | 前端 H5 / 小程序 | **必须重打包 + hosting 部署**：人物档案新增**出生地（级联 + 备注）**与**居住地（多条 ≤ 9）**的展示与编辑 | 需确认 hosting 目标与云函数 HTTP 域名 |

### 25-1 云函数 `compat-api`（**必须重打包 + 部署**）

**为什么需要**：C1–C10 全部落在云函数内 —— 读侧容错（C3）、读响应派生（C7）、计费字段面（C5）、始祖放行（C6）、镜像写时同步（C8）、第 10 条 400（C10）。**不重打包 ⇒ 云端仍把 `birth_place` 当字符串**：
- 读侧：**对象会被当字符串透传**（`index.js:189` 现为 `place: person.birth_place || ''`）⇒ 前端拿到对象，**展示错乱**；
- 写侧：新字段 `residence_places` 与地点编辑**静默丢弃或误判扣费**。

**本批代码改动面（规格 §4 / §5 / §6 / §7 / §9；行号为 2026-09-20 只读实测）**：

| # | 文件 | 实测锚点 | 改动 | 状态 |
|---|---|---|---|---|
| W1 | `index.js` | **`:189`**（`raw.profile.birth = { date, place }`） | 改为 **`{ date, place, place_code, place_note }`**（C7）；**归一函数**（C3） | ⚠️ 待 Kong |
| W2 | `index.js` | `:2478` 起 `PUT /people/<handle>`；预检段 **`:2483-2486`** | 新增 **`residence_places` > 9 → 400**（C10，**扣费前**）；文案字面待回填（规格 §4-4） | ⚠️ 待 Kong |
| W3 | `lib/economy-fee.js` | **`:129`** `hasPersonChanges` / **`:147`** `PERSON_VALUE_FIELDS` / **`:279`** 值级比对 / **`:325`** `isPersonUnchanged` | 纳入 **对象 `birth_place`** 与 **`residence_places`**（**数组逐项 + 长度**，C5） | ⚠️ 待 Kong |
| W4 | `lib/founder-attach.js` | **`:194`** `founderLockMessage` / **`:203`** `assertFounderEditable` | **仅对 `birth_place` / `residence_places` 放行**；混合请求仍 403（C6） | ⚠️ 待 Kong |
| W5 | `lib/tree-write.js` | **`updatePerson` `:155-221`** | **补写 `birth_place` / `residence_places` 落库**（现状该函数**只落姓名 / 性别 / 生卒 / external_* / 详情 attributes**，**无地点落点**——规格 §4-5 第一号落地项） | ⚠️ 待 Kong |
| W6 | `lib/tree-write.js` + `lib/child-write.js` + 续编 | `tree-write.js:967`（`createTree`）/ `child-write.js:50` / `:346` / `tree-write.js:450`（`newChainPerson`） | 初始值改**对象 + `[]`**（C4 点名的 3 组）；⚠️ **实测 `birth_place: ''` 全量落点共 11 处**（清单规格 §4-2），**其余 8 处是否同批待 Zang / Kong 定** | ⚠️ 待 Kong |
| W7 | **~~镜像回写（C8）~~** → **取代者 = C8′（人工指定）** | 落点**未定**（新增两条路由） | 🚫 **原 C8 已作废（2026-09-20，取代者 C8′）**；**不存在任何自动同步逻辑**。取代后的改动面 = **`POST /admin/set-tree-origin`**（`{tree_id, person_handle}`，权限同 `PUT /tree-meta`，返回 `{ ok, origin_code, origin, source }`）+ **`GET /tree/origin-candidates`**（始祖识别失败 → `founder:null, candidates:[]`） | 🚫 **作废** / ⚠️ **C8′ 待 Kong（未落盘）** |
| W8 | 🆕 **C11（建树一致性）** | `POST /admin/create-tree` 落库处 | 建树时填写的发源地 ⇒ **同时写 tree-meta 与始祖节点 `birth_place.origin_code`（`note:''`）** | ⚠️ 待 Kong |
| W9 | 🆕 **始祖认定（C8′ ④）** | 落点未定 | `founder_handle` **优先**；缺失 → **唯一非镜像根节点**（`String(external_mirror) !== 'true'` 且 `parent_family` 为空）；**0 个或多个 → 400**（⚠️ 实测 `qin_31206` / `liu_21016` 的 `founder_handle` 为**空串**，判据须「非空」） | ⚠️ 待 Kong |

> **不需改（已核实）**：`docs/data-model.md` 的两处字段口径已由规格册登记（§3 person 字段 / §5.5 tree-meta 镜像行），**属文档面**，非云函数。
> **不得另建第二套码表**（`AGENTS.md` §2.3）：展示串一律走既有 `resolveOrigin`（`lib/geo.js:98`）。

```bash
# ① 重打包（仓库根；产物 cloudfunctions/deploy/compat-api/index.js）
#    命令与 §23 / §24 同一条（以仓库既有打包脚本为准，本册不新造）
# ② 重打包判据（**候选串 · 待 Kong 落地后回填最终值**）
grep -c 'residence_places' cloudfunctions/compat-api/index.js             # 源码侧；**当前实测 = 0**
grep -c 'residence_places' cloudfunctions/deploy/compat-api/index.js      # 产物侧；**当前实测 = 0**，重打后期望 ≥ 1
grep -c 'place_note'       cloudfunctions/deploy/compat-api/index.js      # 产物侧；**当前实测 = 0**，重打后期望 ≥ 1（C7 字段）
#    ⚠️ 是否采用上述两条字面串为最终判据 ⇒ **判据待 Kong 落地后回填**（若实现取名不同，以 Kong 实现的实际字面为准）
# ③ 旧产物必须被取代（沿用 §24 的判据风格）：若产物仍为 §24 登记的那一份，则本批与 §23 / §24 的口径同时落后
ls -l cloudfunctions/deploy/compat-api/index.js    # §24 登记值 = 998,338 B / mtime 2026-09-19 12:50（grep -c 'origin_code' = 0）
```

- **判据当前实测（2026-09-20 · 只读）**：源码 `index.js` `grep -c 'residence_places'` = **0**；`lib/**` 合计 = **0**；产物 `cloudfunctions/deploy/compat-api/index.js` = **0**（且 `origin_code` 亦为 **0** ⇒ **§24 的未重打包阻塞仍未被解除**）。
- ⇒ **本批的唯一硬阻塞 = 「Kong 落地面 + 重打包 + 部署」两道**（§25-7）。

### 25-2 CloudBase 集合：**无**

- 不新建集合、不加索引、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（保持 §11-2 的 **12 项**）。
- 本批只改 **树 JSON 的两个既有 / 新增字段**（`birth_place` 形状、`residence_places` 新增）与 **tree-meta 两个既有字段的取值**（镜像），**不落任何新集合**。

### 25-3 云端数据：**有变更**（**纯数据批次：树 JSON 形状迁移 + tree-meta 镜像对齐**）

**0. 前置约束（硬 · 先于一切写入）**

- **始祖清单待 Kevin 逐树点选**：契约 C9 明确「**未经 Kevin 点选不得写入**」；已认定仅 **4 棵**（`ji_23395_01` / `gu_39038_01` / `ji_23395` / `gu_39038`，逐棵核对见规格 §7-3），**待点选 13 棵**。
- **不得自动认定**（禁 `--include-auto` 类自动落库行为；纪律同规格 §13-12-3 第 2 条）。
- ⇒ **在 Kevin 回报清单前，本批的树 JSON 写入步骤不得执行**（读侧容错 C3 落地后可先部署云函数，**写入延后**）。

**1. 为什么需要**

- `birth_place` **字段形状变更**：存量 **17 处非空字符串**（实测；`ji_23395_01` 12 / `liu_21016_01` 2 / `shen_27784_01` 2 / `gu_39038_01` 1）在新口径下是**历史形态**，读侧必须容错（C3）；**若不做形状迁移**，这些文本**永远停在 legacy 档**，且**用户下次编辑时会被写对象覆盖 / 或读不到**（数据不可逆）。
- **`residence_places` 是新字段**：现存出现次数 = **0**（源码 / lib / 产物全为 0）⇒ 无历史数据可搬，**只需保证新写入形态为 `[]`**（C2）。

**2. 备份（**写前必做**）**

```bash
# 树 JSON 真源（本批新增备份对象）
mkdir -p ~/jiazu-backups/2026-09-20-person-places/trees
cp migrate-output/trees/*.json ~/jiazu-backups/2026-09-20-person-places/trees/
# tree-meta（沿用既有惯例）
cp config/tree-meta.json ~/jiazu-backups/2026-09-20-person-places/tree-meta.json
# 打印写前 md5（逐棵 + tree-meta）
for f in migrate-output/trees/*.json; do echo "$(md5 -q $f) $(wc -c < $f | tr -d ' ') $f"; done
md5 -q config/tree-meta.json; wc -c config/tree-meta.json
```

- **写前基线已登记**：**17 棵全表 md5 + 字节** = `docs/person-places.spec.md` §10-3；`config/tree-meta.json` = **`5817e4bb7f9fd461c11803e0df78a48a`**（9,572 B / mtime 2026-09-20 10:59:23）。
- ⚠️ **`migrate-output/**` 被 `.gitignore` 忽略**（`AGENTS.md` §7 已登记）⇒ **备份目录是唯一恢复途径**，`git` 帮不上。

**3. 写入（脚本：**默认 dry-run → 副本演练 → `--apply`**，惯例如 `scripts/migrate-tree-origin.mjs`）**

```bash
# ① 副本演练（先跑，再写真源）
COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/<本批迁移脚本>.mjs                 # dry-run
COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/<本批迁移脚本>.mjs --apply         # 真写副本
COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/<本批迁移脚本>.mjs --apply         # 复跑：必须无第二次变化（幂等判据）
# ② 真源迁移（写前自动备份 + 打印前后 md5）
node scripts/<本批迁移脚本>.mjs --apply
# ③ 镜像对齐（可重跑同步脚本；Kevin 第 4 条要求）
node scripts/<镜像同步脚本>.mjs            # dry-run
node scripts/<镜像同步脚本>.mjs --apply    # ⚠️ 只写 tree-meta（镜像）；真源写入必须显式开关且默认关闭
```

> **脚本名 / 路径 = 未定**（由 Kong 落地时登记；**本册不预设文件名**，与 §24-4R「不预设路径」的既有做法一致）。**规格 §6-4 已登记脚本形态要求**（dry-run / 备份 / md5 / 幂等 / 副本钩子）。

**4. 上传顺序（**硬 · 不可颠倒**）**

| 序 | 动作 | 理由 |
|---|---|---|
| **①** | **云函数重打包 + 部署**（§25-1） | **必须先于数据上传**：旧的云端读侧把对象当字符串透传（`index.js:189`）⇒ **若先上传对象形态的树 JSON，线上读响应会立刻错乱**（无容错、无降级） |
| **②** | 部署后**冒烟第 1 条**（§25-5 第 1 条：读一棵**未迁移**树，确认字符串形态不崩 / 不丢） | 确认 C3 容错在**云端**生效（而不是只在本地测试里生效） |
| **③** | **上传树 JSON**（17 棵逐棵覆盖云存储 `trees/<tree_id>.json`） | 顺序在云函数之后、tree-meta 之前；**同一棵树不要分两次上传** |
| **④** | 上传 **tree-meta**（含 `storage_files` 回写） | tree-meta 的 `storage_files` fileID 由上传脚本回写（`scripts/upload-migrated-to-cloudbase.mjs:101-104`）⇒ **tree-meta 必须最后上传**，否则 fileID 与实际文件不同步 |
| **⑤** | 上传后**冒烟第 2–5 条**（§25-5） | 读响应 / 编辑 / 镜像 / 上限逐条验 |

```bash
# ③④ 一条命令覆盖（脚本按 report 逐树上传到 trees/<tree_id>.json，并回写 tree-meta + storage_files）
CB_ENV=liwu-d8gek6jjdab1d087c CB_KEY=<云开发 API Key> \
  node scripts/upload-migrated-to-cloudbase.mjs
```

- **密钥由用户提供，不代取、不打印**（沿用 §3 / §12-1 既定口径）。

**5. 本地侧判据**

```bash
# 树 JSON 形状覆盖率（期望 = 所有应迁移节点均为对象）
python3 -c "
import json,glob
ok=bad=0
for p in glob.glob('migrate-output/trees/*.json'):
    d=json.load(open(p))['people']
    for h,v in d.items():
        b=v.get('birth_place')
        if isinstance(b,dict): ok+=1
        elif b is None: pass
        else: bad+=1
print('object=',ok,'string/legacy=',bad)"
# 幂等复跑判据：同副本再 --apply 一次，md5 不变
md5 -q config/tree-meta.json        # 与 §25-3 第 2 节的写前值比对（本册不预填「写入后」值）
node scripts/gen-geo-divisions.mjs --check   # 期望 exit 0（确认未误伤 geo 产物链路）
```

### 25-4 前端产物（**必须重打包：H5 + 小程序**）

**为什么需要**：C7 新增 `place_code` / `place_note` 与顶层 `residence_places`，而**前端现无任何消费者**（实测：`frontend/src` 内 `profile.birth.place` **零消费点**；`person-archive.vue:1870` 只读 `birth.date`）⇒ 不重打包 ⇒ **用户看不到出生地 / 居住地，也填不了**。

| 区域 | 文件（规格 §8-1 实测锚点） | 改动 |
|---|---|---|
| 人物档案 · **出生地展示** | `frontend/src/components/person-archive/person-archive.vue`（**新增**；现状无落点） | 显示 `place`（行政区划展示串）+ `place_note`（**文案「备注」**）两段 |
| 人物档案 · **出生地编辑** | 同上；`editForm`（`:1532` 起）/ 保存 `:1999` | 新增**级联选择（复用 `GeoCascader`，只提交码）** + **备注输入**；提交字段名 = `birth_place`（**对象**） |
| 人物档案 · **居住地（多条 ≤ 9）** | 同上（**新增**） | 展示按数组顺序；编辑支持增删（**前端须在上限处禁用第 10 条按钮**，但**最终拦截在后端 400**，C10） |
| **展示（不改）** | `pages/index/index.vue:96`、`pages/hall/index.vue:12`、`pages/family/index.vue:24` | **继续读 `origin`（镜像）**；「待完善」兜底字面**逐字保留**（C8 连续性要求） |
| 类型 | `business/api.ts:185` / `:192`（`birth?: { date?, place? }`）、`types.ts:68` | 新增 `place_code` / `place_note` + 顶层 `residence_places` 类型；**既有 `place` 保留** |
| 脱敏 | `business/privacy.ts:21-22` / `:58` | **C7：裁剪口径不变**；`residence_places` 是否纳入脱敏 = **未决**（规格 §11 第 6 条） |

```bash
cd frontend && VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5   # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c

cd frontend && npm run build:mp-weixin                                      # 小程序产物（同批上传）
```

### 25-5 部署后冒烟验证（按序做）

| # | 验证 | 期望 | 依据 |
|---|---|---|---|
| 1 | 读一棵**未迁移**树（`birth_place` 仍为字符串，如 `ji_23395_01` 的 11 个非空节点） | 读响应正常，`place_code = ''`、**`place_note = 原文本`** | C3 / C7（**不崩不丢**） |
| 2 | 读一棵**已迁移**树的始祖节点 | `profile.birth.place` = 码反查展示串；`place_code` = 码；`place_note` = `''` | C7 / C9 |
| 3 | 改始祖**出生地**（仅地点） | 200 扣 1 片；**同一响应周期内** tree-meta 该树 `origin_code` / `origin` 已变；家族页 hero 立即显示新发源地 | C6 / C8 |
| 4 | **混合请求**（同请求改姓名 + 出生地） | **403**，且**不扣费** | C6 |
| 5 | `residence_places` 提交 **10 条** | **400 拒绝**（非前端拦截）、**不扣费** | C10 |
| 6 | 原样回传（打开弹窗直接保存） | `200 + unchanged:true + fee.pieces:0` | C5（对照 §24-5 既有冒烟口径） |
| 7 | 镜像一致性抽样 | tree-meta `origin_code` == 始祖 `birth_place.origin_code`（逐树） | C8 / §6-4 脚本 |

### 25-6 本批**不需要**上云的东西

- 测试文件（`lib/*.test.js`）：**仅本地**（`npm test` 跑本地副本，与云端无关）。
- 迁移 / 镜像脚本（`scripts/*.mjs`）：**仅本地执行**（不随云函数包发布）。
- 行政区划码表：**不重生成**（本批不改 `config/geo-divisions.json`；`gen-geo-divisions.mjs --check` 只作**未误伤**核对）。
- `config/**` / `migrate-output/**`：**真源，不上传**（云端数据由 §25-3 第 4 节的上传步骤单独更新）。

### 25-7 阻塞点

| # | 阻塞 | 现状（实测 2026-09-20） | 需要谁 |
|---|---|---|---|
| 1 | **Kong 代码面全部未落盘** | `residence_places` 源码 = **0** 次、`lib/**` = **0** 次、产物 = **0** 次；C1–C10 均无实现 | **Kong** |
| 2 | **云函数未重打包** | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B / mtime 2026-09-19 12:50 / `grep -c 'origin_code'` = 0**（**§24 的阻塞延续未解**） | **部署动作（需授权）** |
| 3 | **始祖清单待 Kevin 点选** | 已认定 **4** 棵 / 待点选 **13** 棵（规格 §7-3；含 `qin_31206` / `liu_21016` 的**空串陷阱**） | **Kevin** |
| 4 | **C7 的 `if (person.birth_date)` 门控未定** | `index.js:189` 现状；契约未提 | **Zang**（规格 §11 第 5 条） |
| 5 | **`updatePerson` 地点落库（W5）属契约必要推论** | 实测该函数无地点落点；契约未点名 | **Zang**（规格 §11 第 11 条） |
| 6 | **写入后 md5 / 新测试基线未实测** | §25-3 第 5 节 / 规格 §9-1 均留「待填」 | **执行者回填** |

### 25-8 跨册登记（**本节与规格册的对应**）

| 本册位置 | 规格位置 |
|---|---|
| §25-1（代码面 + 判据） | `docs/person-places.spec.md` §4-1～§4-5 / §5 / §6-2 |
| §25-3（纯数据批次 + 上传顺序） | 同上 §7（迁移）/ §6-4（镜像脚本）/ §10（备份 + md5 + 回滚） |
| §25-4（前端） | 同上 §8-1（D1–D9） |
| §25-5（冒烟） | 同上 §9（测试口径）+ §0-2（C1–C10） |
| 码表 / 展示串 | `docs/geo-origin.spec.md` §13-13（跨册登记）+ §7-1 / §7-2 |
| tree-meta 字段口径 | `docs/data-model.md` §5.5（镜像行）、§3（person 字段） |

> **本批与 §24 的关系（硬）**：**§24 的云端动作（tree-meta `origin_code` 上传 / 前端重打 / 云函数重打）本批不替代** —— 若 §24 尚未部署，本批部署时**一并包含** §24 的代码面（同一份云函数产物）；**但不把 §24 的未完成项记为本批已完成**。

### 25-9 边界

> **本节只登记**：**未改任何代码**、**未写真源**（`config/**` / `migrate-output/**` 零写入）、**未改 `AGENTS.md`**（未获授权，口径同规格 §13-9）、**未执行任何部署 / 打包 / 迁移动作**、**未重跑验证**。
> 本节的判据 / 值均为 **2026-09-20 只读实测**，**未实测值一律留「待填」或标注「待 Kong 落地后回填」**。
> 本节的**唯一权威规格 = `docs/person-places.spec.md`**；两册若有冲突，**以规格册为准**。


---

### 25-10 追补：**C8 作废 → C8′/C11 口径变更 + Kong 并发落地实测**（2026-09-20 11:21 CST · **本批的动作面按本节更新**）

> **性质**：本节为**只读实测追加** —— **未改代码、未写真源、未改 `AGENTS.md`、未执行部署 / 打包 / 迁移**。
> §25-0～§25-9 的历史行**原文保留**；本节**取代**其中已过期的「动作面 / 阻塞 / 判据」读数。

**（1）口径变更（Zang · 2026-09-20 即时生效 · 逐字）**

1. 🚫 **原 C8（写时同步镜像）整体作废** —— **不存在任何「改始祖出生地就自动回写 tree-meta」的逻辑**。⇒ **§25-0 第 3 行「② tree-meta 镜像对齐」、§25-1 的 W7、§25-3 第 3 节「③ 镜像对齐（可重跑同步脚本）」、§25-5 冒烟第 3 条第后半段、§25-7「镜像」相关项 一并作废**（规格册 §6-1）。
2. **取代者 C8′（人工指定）**：`POST /admin/set-tree-origin`（入参 `{tree_id, person_handle}`；权限 = 与 `PUT /tree-meta` **同档 chief_editor**；返回 `{ ok, origin_code, origin, source: {handle, gramps_id, name} }`）+ `GET /tree/origin-candidates`（返回 `{ tree_id, founder, current, candidates[] }`；**始祖识别失败 → `founder:null, candidates:[]`，不报 400**）；**可选范围 = 始祖 + 其下 1–2 代（共三代）**，**被指定节点 `birth_place.origin_code` 必须非空**；**始祖认定 = `founder_handle` 优先 → 否则唯一非镜像根节点**（**0 个或多个 → 400**）。
3. 🆕 **C11**：`POST /admin/create-tree` 的发源地 ⇒ **同时写 tree-meta 与始祖 `birth_place.origin_code`（`note:''`）**（保证「树上发源地 = 某节点出生地」恒成立）。
4. ⇒ **本批云函数改动面 = W1–W6 + W8（C11）+ W9（始祖认定）+ C8′ 两条路由；W7 作废**（§25-1 表已行内标注）。

**（2）Kong 并发落地实测（2026-09-20 11:21 CST · 只读；**同一会话两次 `grep` 之间 `index.js` 已变化**）**

| 项 | 实测 |
|---|---|
| 🆕 新增模块 | **`cloudfunctions/compat-api/lib/person-places.js`（118 行）**：`MAX_RESIDENCE_PLACES=9` / `RESIDENCE_LIMIT_MESSAGE='居住地最多 9 条'` / `PERSON_PLACE_FIELDS` / `normalizeBirthPlace` / `normalizeResidencePlaces` / `assertResidencePlacesLimit` / `hasPlaceContent` / `sameBirthPlace` / `sameResidencePlaces` / `placeViewOf` / `residenceViewOf` / `treeOriginPatchOf`（**原 C8 ⇒ 已作废**）/ `isPlaceFieldsOnly` |
| ✅ W1 读响应 | `index.js:197-198` 顶层 `residence_places`；`:201-210` `profile.birth{date,place,place_code,place_note}`；**门控 `person.birth_date \|\| hasPlaceContent(...)`** |
| ✅ W2 上限 400 | `index.js:2528-2532`（**扣费前**）；文案 = **`居住地最多 9 条`** |
| ✅ W3 计费 | `economy-fee.js:144/145`（**键显式提供判**）/ `:157`（`PERSON_VALUE_FIELDS` 含两项）/ `:291` / `:293-294` |
| ✅ W4 C6 | `founder-attach.js:218` `if (msg && !isPlaceFieldsOnly(body))`（调用点 `index.js:2534` 传第 5 参） |
| ✅ W5 写路径 | `tree-write.js:179`（上限）/ `:198-199`（落库） |
| ✅ W6 初始值 | `tree-write.js:261-262 / 462-463 / 980-981 / 1198-1199` + `child-write.js:50 / 347` = **6 / 11 处已改**；**仍为字符串 5 处**：`founder-attach.js:288` / `marriage.js:147` / `branch-clan-ops.js:169` / `clan.js:214` / `clan.js:641` |
| 🚫 W7 | 已按**原 C8** 落盘：`index.js:274 mirrorFounderBirthPlace()` + `lib/person-places.js:102 treeOriginPatchOf()` ⇒ **按 C8′ 失去契约依据**（**处置未定**：删除 / 保留不用） |
| ⚠️ W8 / W9 / C8′ 路由 | **未落盘**：`grep -rn 'set-tree-origin\|origin-candidates'` ⇒ **全仓 0 命中** |
| ⚠️ 前端 | **已落**：新增 `frontend/src/business/place.ts`（104 行）+ `api.ts` / `types.ts` / `business/index.ts` / `person-archive.vue`（**+124 / −7**）；**发源地指定 UI（D10）未落**（依赖未落盘接口） |
| ❌ **部署产物** | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B / mtime 2026-09-19 12:50**；`grep -c 'residence_places'` = **0**、`grep -c 'place_note'` = **0** ⇒ **未重打包** |
| ❌ **测试** | `scripts.test` 仍 **26** 项，**无 `person-places` 测试文件** ⇒ **「未注册 = 假绿」（本批当前状态即假绿）** |

**（3）C9 迁移清单（Kevin 已点选 · **仍待 Zang 下令 `--apply`**）**

- **逐字清单 + `li_26446_01` 冲突（Kevin 归入「跳过」但实测 `origin_code = 230305` 非空）= `docs/person-places.spec.md` §7-2**（本册不复制该表）。 → 🚫（**已取代**：该冲突已由 Zang 裁定闭合，清单刷新为 **13 待写 / 4 跳过**；取代者 **§25-11(3)**）
- **跳过档**：`qin_31206_01`（**空树，实测 `people=0`**）+ 4 棵（`liu_21016` / `rong_23481_01` / `li_26446_03` / **`li_26446_01`（⚠️ 冲突）**）。 → 🚫（**已取代**：跳过档 = `qin_31206_01`（空树）/ `liu_21016` / `rong_23481_01` / `li_26446_03`，**共 4 棵**；`li_26446_01` **移入待写**；取代者 **§25-11(3)**）
- ⚠️ **`--apply` 前置**：① 澄清 `li_26446_01`；② 备份 + md5（§25-3 第 2 节）；③ **副本演练**；④ **人类一句明确同意**（规格册 §13-12-3 第 2 条纪律）。 → 🔄（**① 已闭合**（Zang 已裁定 `li_26446_01` **应迁移**）；②③④ 仍为前置，并补 **默认 dry-run / `--apply` 前备份 / 幂等**；取代者 **§25-11(3)**）

**（4）本批动作面（**取代 §25-0 总览**）**

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **重打包 + 部署**（判据见 §25-1；**代码面待补 W8 / W9 / C8′ 路由 + W7 处置**） | **Kong 补落 + 部署授权** |
| 2 | CloudBase 集合 | **无** | — |
| 3 | 云端数据 | 树 JSON 形状迁移（**待 Zang 下令**）；tree-meta **无「镜像对齐」动作**（C8 作废） | Kevin 已点选 ⇒ **等 Zang 一句** |
| 4 | 前端 H5 / 小程序 | **重打 + hosting**：人物档案出生地 / 居住地（已落地前端代码）；**发源地指定 UI 待接口落盘后另批** | hosting 目标 + 云函数域名 |

**（5）判据串更新（**候选 · 待 Kong 落地后回填最终值**）** → 🔄（**实测双栏已回填 = §25-11(2)**；**最终字面仍待 Kong 回填**）

```bash
# 源码侧（当前实测）
grep -c 'residence_places' cloudfunctions/compat-api/index.js   # = 2（已接线）
grep -c 'place_note'       cloudfunctions/compat-api/index.js   # = 3（已接线）
# 产物侧（**当前实测 = 0 / 0 ⇒ 未重打包**）
grep -c 'residence_places' cloudfunctions/deploy/compat-api/index.js   # 期望 ≥ 1
grep -c 'place_note'       cloudfunctions/deploy/compat-api/index.js   # 期望 ≥ 1
# C8′ / C11 落盘判据（Kong 落地后才有意义；当前 = 0）
grep -c 'set-tree-origin'  cloudfunctions/compat-api/index.js   # 期望 ≥ 1
grep -c 'origin-candidates' cloudfunctions/compat-api/index.js  # 期望 ≥ 1
# 已作废的 C8 残留（C8′ 下的期望 = 0，**处置待定**）
grep -c 'mirrorFounderBirthPlace' cloudfunctions/compat-api/index.js
```

**（6）冒烟表的变更（取代 §25-5 第 3 条第后半段）**

| # | 验证 | 期望 | 依据 |
|---|---|---|---|
| 3′ | 改始祖**出生地**（仅地点） | 200 扣 1 片；**tree-meta 的 `origin_code` / `origin` 不变**（**不得有任何自动回写**） | **C8′ ①** |
| 3″ | 调 `POST /admin/set-tree-origin`（指定某候选节点） | 200 返回 `{ ok, origin_code, origin, source }`；tree-meta 该树随之更新；家族页 hero / 首页卡片立即同步 | **C8′**（**属新增冒烟项**） |
| 3‴ | 调 `GET /tree/origin-candidates`（始祖识别失败的树） | `founder:null, candidates:[]`，**HTTP 不是 400** | **C8′ ⑤** |
| 3⁗ | 新建树（`POST /admin/create-tree` 带 `origin_code`） | tree-meta 写入 **且** 始祖节点 `birth_place.origin_code` = 同码、`note:''` | **C11** |

**（7）跨册（本节新增登记）**

| 项 | 位置 |
|---|---|
| C8′ / C11 逐字口径 + 落地实测 | `docs/person-places.spec.md` §0-2 / §6 / §12 |
| geo 侧接口变更登记 | `docs/geo-origin.spec.md` **§13-13-6** |
| tree-meta 字段口径（人工指定） | `docs/data-model.md` **§5.5**（「发源地 ＝ 人工指定」行） |

> **本节边界**：只读追加 —— **未改代码、未写真源、未改 `AGENTS.md`、未执行任何部署 / 打包 / 迁移**；§25-0～§25-9 历史行原文保留（除已行内标注的 W7 / 第 3 行）。

---

### 25-11 追补二：**真源读数刷新（8 / 17）+ R1 / R2 裁定 + 逐字文案 + 13 / 4 迁移清单 + 四条追认 + 懒转换口径**（2026-09-20 · **本批动作面按本节更新**）

> **性质**：只读实测 + 逐字照登 —— **未改代码、未写真源、未改 `AGENTS.md`、未执行部署 / 打包 / 迁移**。
> §25-0～§25-10 历史行**原文保留**；被本节取代的行**已在行尾标注**（不删不改）。
> **时点**：真源 mtime 仍为 **2026-09-20 10:59:23**（**Kevin 10:59 写入后未再变动**）；**本批仍未重打包、仍未部署、测试仍未注册**。

**（1）真源读数刷新（新真值 = 本行）**

| 项 | 复核实测 | 判定 |
|---|---|---|
| `config/tree-meta.json` | md5 **`5817e4bb7f9fd461c11803e0df78a48a`** / **9,572 B** / mtime **2026-09-20 10:59:23** | ✅ 与 §24-13 / §25-3 台账同值（**未变**） |
| `origin_code` 非空 | **8 / 17**（新增 `li_26446_01` = **`230305`**，`origin` = `黑龙江省鸡西市梨树区`） | ✅ **取代 §24-13(2) 的「7 / 17」**；**写入主体 = Kevin 亲手写入** |
| 17 棵树 JSON md5 | **与规格册 §10-3 全表 17/17 逐条一致** | 存量树 JSON **零写入**（基线仍有效） |
| 部署产物 | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B** / mtime **2026-09-19 12:50** / md5 **`d61a8aebfb3f3095baae4e1e731fd675`** | ❌ **未重打包**（§24 / §25 的硬阻塞延续） **（§26-1 末次复核：同值 · 仍未重打包；产物侧 8 判据串全 0）** |

**（2）重打包判据串（**实测双栏** · 加粗 = 实测值；⚠️ 最终字面**仍待 Kong 回填**）**

```bash
cd /Users/kevin/bistro/jiazu
# 源码侧（**实测**）
grep -c 'residence_places'  cloudfunctions/compat-api/index.js   # = 3
grep -c 'place_note'        cloudfunctions/compat-api/index.js   # = 3
grep -c 'set-tree-origin'   cloudfunctions/compat-api/index.js   # = 1（C8′ 路由已落盘）
grep -c 'origin-candidates' cloudfunctions/compat-api/index.js   # = 2（C8′ 路由已落盘）
# 产物侧（**期望 ≥ 1；实测当前 = 0 / 0 / 0 / 0 ⇒ 未重打包**）
grep -c 'residence_places'  cloudfunctions/deploy/compat-api/index.js
grep -c 'place_note'        cloudfunctions/deploy/compat-api/index.js
grep -c 'set-tree-origin'   cloudfunctions/deploy/compat-api/index.js
grep -c 'origin-candidates' cloudfunctions/deploy/compat-api/index.js
# 新增闸门（R1）落盘判据（源码侧实测 = 1 / 1；产物侧期望 ≥ 1）
grep -c 'unknownOriginCodeMessage' cloudfunctions/compat-api/lib/person-places.js
grep -c 'assertKnownOriginCodes'   cloudfunctions/compat-api/index.js
```
⚠️ **以上 4 串（源码 / 产物）为待回填候选**；**最终判据串以 Kong 实现的实际字面为准**（未回填前不视为定稿）。

**（3）C9 迁移清单刷新：**13 待写 / 4 跳过**（按 10:59:23 真源重算 · **Zang 已核准** · 取代 §25-10(3) 与规格册 §7-2）

- **待写 13（`tree_id` → 始祖）**：`gu_39038_01`→顾清学 · `ji_23395_01`→季花 · 祖谱 `ji_23395`→季花 · 祖谱 `gu_39038`→顾清学（**四棵用已登 `founder_handle`**）；`liu_21016_01`→刘芳池 I000258 · `shen_27784_01`→沈克强 I000277 · `heng_24658_01`→恒未知 I000363 · `ji_32426_01`→纪未知 I000377 · `long_40857_01`→龙未知 I000362 · `li_26446_02`→李未知 I000373 · **`li_26446_01`→李宝华**（Kevin 10:59 新填 `230305` 后，按「**唯一非镜像根节点**」判据认定；实测 `nonMirrorRoots` = 1） · 祖谱 `qin_31206`→姬搢 I000289 · 世本 `zhonghua`→**风华胥 I0104**。
- **跳过 4**：`qin_31206_01`（**空树 0 人** ⇒ 无节点可写，与 tree-meta 是否有码无关）、`liu_21016`、`rong_23481_01`、`li_26446_03`（**`origin` 为空**）。
- **写入规则**：有码 → `{origin_code: 码, note: ''}`；**无码且 `origin` 非空** → `{origin_code: '', note: <`origin` 原文本>}`；**两者均空 → 不动**。
- **执行纪律**：**默认 dry-run**；**`--apply` 前先备份**；**幂等**。
- **始祖认定依据**：`founder_handle` **优先**（非空判定，注意空串陷阱）→ 否则**唯一非镜像根节点**（`external_mirror !== 'true'` 且 `parent_family` 为空）；**0 个或多个 → 400**。
- ⚠️ **`--apply` 前置**：① ✅ 已闭合（`li_26446_01` 裁定完毕）；② 备份 + md5（§25-3 第 2 节）；③ **副本演练**；④ **人类一句明确同意**（规格册 §13-12-3 第 2 条）。
- **逐字全表 + 复核命令 = `docs/person-places.spec.md` §14-2**（本册不复制整表）。

**（4）R1 / R2（Zang 新裁定 · 落地状态实测）**

| 裁定 | 逐字口径 | 落地状态（实测） |
|---|---|---|
| **R1** | 人物写路径与 `set-tree-origin` 对**非空 `origin_code` 必须校验已知码**；未知码 → **400**，文案逐字 `出生地行政区划代码无效：<码>`；**`residence_places` 每条同判** | ✅ **已落盘**：`lib/person-places.js:113-115`（文案）/ `:126-144`（`assertKnownOriginCodes`）；人物写路径 `index.js:2558-2562`（**先于 C6 放行与扣费**）；`set-tree-origin` ④′ `index.js:526-528`。⚠️ **测试覆盖 = 0** |
| **R2** | 候选接口**全列**（含无码节点，`birth_place.place == ''` 且 `place_code == ''`），由**前端置灰**；事后 400 由 `set-tree-origin` 负责 | ✅ **接口已落盘**：`index.js:2631-2658`（**不做 `place_code` 过滤**，仅按节点可见性过滤；始祖识别失败 → `founder:null` / `candidates:[]`，**不是 400**）；每项带 `birth_place` + `is_current`。⚠️ **前端置灰 UI 当时未落**（0 命中）→ **同日 11:29 后复核已落盘并闭合**：`origin-picker.vue`（9,118 B / mtime 2026-09-20 11:29:19）判据 = `birth_place.place_code`（`:40 / :50 / :53 / :149-151`）；见 **§25-11(10)** |

**（5）逐字文案（部署后冒烟断言用 · 逐字照登）**

| 场景 | HTTP | 逐字文案 | 锚点 |
|---|---|---|---|
| 居住地上限 | 400 | `居住地最多 9 条` | `lib/person-places.js:23` |
| 无效请求（**文案已扩**） | 400 | `请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）` | `index.js:2566` |
| R1 未知码 | 400 | `出生地行政区划代码无效：<码>` | `lib/person-places.js:113-115` |
| `set-tree-origin` 无此树 | 404 | `未找到 tree: <tree_id>` | `index.js:512` |
| `set-tree-origin` 树 JSON 缺失 | 404 | `树不存在: <tree_id>` | `index.js:514` |
| `set-tree-origin` 节点不属于本树 | 400 | `该节点不属于本树` | `index.js:516` |
| 始祖无法认定（0 根） | 400 | `本树无法认定始祖：未登记始祖，且树内没有非镜像根节点` | `lib/founder-attach.js:191` |
| 始祖无法认定（多根） | 400 | `本树无法认定始祖：未登记始祖，且非镜像根节点有 N 个` | `lib/founder-attach.js:192` |
| 节点不在始祖三代内 | 400 | `该节点不在本树始祖三代范围内（仅始祖及其下两代可作为发源地）` | `index.js:520` |
| 节点出生地无码 | 400 | `该节点未填写出生地行政区划代码` | `index.js:522` |
| 未登录 / 过期 | 401 | `未登录或登录已过期` | `index.js:504` |
| 权限不足 | 403 | `需要总编辑权限` | `index.js:506` |

- ⚠️ **两串并存（有意为之 · 不得统一）**：`PUT /tree-meta` / `lib/tree-write.js:964` / `lib/clan.js:599` 用**「发源地」**串（`发源地行政区划代码无效：<码>`）；**R1 与 `set-tree-origin` 用「出生地」串**。

**（6）Zang 追认四条口径（定稿）+ `birth_place` 懒转换口径**

1. `residence_places` **缺失 / 非数组** ⇒ 读侧按 **`[]`** 兜底（C3 的延伸；`lib/person-places.js:44-47`）。
2. C6 的 place-only 放行**同时作用于路由层与写路径内层镜像锁**（**同一判据**，避免「路由放行、写路径 403」的洞）：两处同用 `isPlaceFieldsOnly(body)`（`lib/founder-attach.js:275` 路由层 / `lib/tree-write.js:178` 内层镜像锁；判据本体 `lib/person-places.js:150` **只一份**）。
3. `profile.birth` 输出条件由「有生年」**放宽为「有生年 或 有出生地内容」**（`index.js:201-210`；否则只填出生地、生年不详的节点**存了读不回来**，前端保存时会把出生地写空）。
4. 前端**空条目（无码也无备注）一律丢弃且不计入 9 条上限**；**服务端裁剪口径不变**；**前端不额外做在世脱敏**。（提交装配 `person-archive.vue:2070` 用 `prunePlaces`；⚠️ **添加按钮门控按原始行数计**（`person-archive.vue:2005`，未先 prune）⇒ 口径 4 的 UI 门控字面**尚未完全对齐**，**不影响落库结果**，本册只登记。）
5. **历史 `birth_place` 字符串 = 不做强制形状迁移**：两段口径 = **读侧归一**（字符串 → `{origin_code:'', note:<原串>}`）+ **保存时懒转成对象**；迁移脚本提供**默认关闭**的 `--normalize-birthplace-shape` 开关。**实测存量 = 17 处非空字符串**（`ji_23395_01` 12 / `liu_21016_01` 2 / `shen_27784_01` 2 / `gu_39038_01` 1；去重后 6 个不同串）。⚠️ **该开关未落盘**（全仓 `0` 命中）。

**（7）本批动作面（取代 §25-10(4)）** ⇒ ✅ **（2026-09-20 §26 末次追补：动作面新增必登项 —— 「12 棵树 JSON 重传」+ 前端重打；以 §26-0 为准）**

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **重打包 + 部署**（判据见 §25-11(2)） | **Kong 回填判据串 + 补测试注册 + 部署授权** |
| 2 | CloudBase 集合 | **无** | — |
| 3 | 云端数据 | 树 JSON `birth_place` 迁移（**13 待写 / 4 跳过**，**待 Zang 下令 `--apply`**）；tree-meta **无「镜像对齐」动作**（C8 作废） | 备份 / 演练 / 一句同意（① 已闭合） ⇒ ✅ **（§26-2 追补：必登项 = 重跑 `node scripts/upload-migrated-to-cloudbase.mjs` 重传 **12 棵树 JSON**；12 棵 `tree_id` 点名见 §26-2）** |
| 4 | 前端 H5 / 小程序 | **重打 + hosting**：人物档案出生地 / 居住地已落地；**发源地指定 UI（含 R2 置灰）已于同日 11:29 落盘**（§25-11(10)）⇒ **本批前端面已闭合，可同批重打** | hosting 目标 + 云函数域名 |

**（8）冒烟表追补（追加于 §25-10(6)）**

| # | 验证 | 期望 | 依据 |
|---|---|---|---|
| 5 | `PUT /people/<h>` 带**未知** `birth_place.origin_code` | **400** + `出生地行政区划代码无效：<码>`，**不扣费** | **R1** |
| 6 | `PUT /people/<h>` 带未知码的**某一条** `residence_places` | **400** 同上（**逐条同判**） | **R1** |
| 7 | `PUT /people/<h>` 空码（未结构化） | **放行**（空码 = 合法「未结构化」） | **R1** |
| 8 | `GET /tree/origin-candidates` 于**含无码节点**的树 | **全列**（无码节点也在列，`birth_place.place_code == ''`），前端置灰；**接口不报 400** | **R2** |
| 9 | `POST /admin/set-tree-origin` 指定**无码节点** | **400** `该节点未填写出生地行政区划代码` | C8′ ④ |
| 10 | 只填出生地、**生年不详**的节点存后重读 | `profile.birth` **存在**（`place` / `place_code` / `place_note` 齐全） | 追认 3 |

**（9）跨册登记**

| 项 | 位置 |
|---|---|
| §14 全节（真源复核 / 13-4 清单 / 逐字文案 / R1 R2 / 四条追认 / 懒转换 / 落地复核） | `docs/person-places.spec.md` **§14**（§14-1 ～ §14-7） |
| `origin_code` 非空 = 8 / 17 的权威行 | `docs/geo-origin.spec.md` **§13-13-2 / §13-13-3** |
| 本册历史 | §25-3 / §25-10（行尾已标注取代者） |

**（10）同日稍后复核：C8′ 前端 UI 落盘（R2 前端侧闭合）**

> §25-11(4) R2 行的「前端置灰 UI 未落（0 命中）」为该轮**较早时点**读数；复核时该文件**已在两轮 `git status` 之间落盘**。

| 项 | 实测 |
|---|---|
| 新组件 | **`frontend/src/components/origin-picker/origin-picker.vue`** —— **9,118 B** / mtime **2026-09-20 11:29:19** |
| 接口接线 | `business/api.ts:1931`（`GET /tree/origin-candidates`）/ `:1954`（`POST /admin/set-tree-origin`）；类型 `business/types.ts:280-314` |
| 入口挂载 | `frontend/src/pages/hall/index.vue`（`git diff --stat` = **+19 / −5**） |
| **R2「由前端置灰」** | **已实现**：判据 = `birth_place.place_code` 非空 —— `origin-picker.vue:40`（`op-row-off`）/ `:50`（`op-place-off`）/ `:53`（无码行提示）/ `:127`（空形状兜底）/ **`:149-151`（点选拦截）**，与后端 400 同判据 |
| 部署产物 | **仍未重打包**（998,338 B / mtime 2026-09-19 12:50 / md5 `d61a8aebfb3f3095baae4e1e731fd675`；4 判据串仍 0） |
| 测试注册 | 仍 **26** 项（**未新增**）⇒ 新组件与 R1 仍无测试覆盖 |

```bash
cd /Users/kevin/bistro/jiazu
grep -rn 'origin-candidates\|set-tree-origin' frontend/src
ls -l frontend/src/components/origin-picker/
git diff --stat frontend/src/pages/hall/index.vue
```
⇒ **（8）冒烟第 8 条（候选全列 + 前端置灰）前后端两侧均已就绪**，可同批重打前端验证。

> **本节边界**：只读追加 —— **未改代码、未写真源**（`config/tree-meta.json` 前后 md5 均 `5817e4bb7f9fd461c11803e0df78a48a`）、**未改 `AGENTS.md`**（前后 md5 均 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行任何部署 / 打包 / 迁移**；§25-0～§25-10 历史行原文保留。


---

## 26. 末次部署登记：**人物地点属性（出生地 / 居住地）+ 家族树发源地人工指定**（纯数据批次 + 代码批次 · **必登三项：12 棵树 JSON 重传 / 云函数重打包 / 前端重打**）（Jing 制度员 · 2026-09-20 12:32:33 CST · **只追加**）

> **性质**：本节为**部署台账登记**（**只追加**）—— **未改代码、未写真源、未改 `AGENTS.md`、未执行任何部署 / 打包 / 重传 / 迁移**。
> §25-0～§25-11 历史行**原文保留**；被本节取代者**只在原行行尾追加标注**（不删不改）。**编号接 §25**（本节为最大节 ⇒ 后续追补接 §27）。
> **时点**：`date` = **2026-09-20 12:32:33 CST**；本节所有读数**本次实测**（复现命令见 §26-9）。
> **跨册口径真源**：规格册 = `docs/person-places.spec.md` **§15 / §16**；质检终稿 = `docs/person-places.qa.md`（551 行 · 84 判据 = PASS 81 / FAIL 1 待裁定）。

### 26-0 总览（本批动作面 = 4 项 · 动作面**取代** §25-10(4) / §25-11(7) 的相应行）

| # | 目标 | 动作 | 阻塞 | 备注（本节实测） |
|---|---|---|---|---|
| 1 | 云函数 **`compat-api`** | **重打包 + 部署** | **无**（代码已全部落盘；仅需打包 + 授权部署） | ⚠️ 不重包则 **F5 的 `null` 闸门**与 **F3 的前端配套后端行为**都到不了线上 |
| 2 | **云端数据（树 JSON）** | **重传 12 棵树 JSON**（纯数据批次：**先重传、后手工删旧详情键**，按仓内惯例） | 备份已就位（11:36）；**需部署授权** | 本批**新增**必登项（§25-11(7) 第 3 行只记了 tree-meta「无镜像对齐动作」） |
| 3 | 云端 **`tree-meta`** | **本次迁移未修改它 ⇒ 不因本批上传** | — | ⚠️ 但 **Kevin 09:31 / 10:59 / 11:31 的三次手工改动仍未上云**，需**一并考虑**（见 §26-4） |
| 4 | 前端 **H5 + 小程序** | **重打 + hosting** | hosting 目标 + 云函数域名 | 前端面已闭合（人物档案地点字段 + 发源地指定 UI 含 R2 置灰） |
| — | CloudBase 集合 | **无** | — | 无 schema / 无索引变更 |

### 26-1 必登 ①：云函数 `compat-api` **必须重打包**（**当前实测未重打包**）

| 项 | 实测（本节） |
|---|---|
| 产物 | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B** / mtime **2026-09-19 12:50:59** / md5 **`d61a8aebfb3f3095baae4e1e731fd675`** |
| 判定 | ❌ **未重打包**（与 §24 / §25-3 / §25-10 / §25-11(1) 及质检册 §P2 **同值**） |
| 重打包判据（**产物侧 8 串实测全 0 ⇒ 铁证未重包**） | `residence_places` **0** · `place_note` **0** · `set-tree-origin` **0** · `origin-candidates` **0** · `居住地格式无效` **0** · `居住地最多 9 条` **0** · `assertPlaceFieldShapes` **0** · `personEditLockMessage` **0** |
| 源码侧对照 | `index.js`：`residence_places` **4** · `set-tree-origin` **1** · `personEditLockMessage` **1** ⇒ 产物侧期望 **≥1** |
| 打包命令 | 以**仓库既有打包脚本 / 惯例**为准（同 §23 / §24 / §25-1 的同一命令，本册**不新造**）；产物路径 = `cloudfunctions/deploy/compat-api/index.js` |
| 部署前必读 | **F3 / F5 的修复均在未提交的工作区** ⇒ 打包前须确认工作区代码为本批终态（否则会把半成品打进去） |

```bash
cd /Users/kevin/bistro/jiazu
wc -c < cloudfunctions/deploy/compat-api/index.js; md5 -q cloudfunctions/deploy/compat-api/index.js
for s in residence_places place_note set-tree-origin origin-candidates '居住地格式无效' '居住地最多 9 条' assertPlaceFieldShapes personEditLockMessage; do printf '%s: ' "$s"; grep -c "$s" cloudfunctions/deploy/compat-api/index.js; done
```

### 26-2 必登 ②：**12 棵树 JSON 必须重传**（★ 本批新增必登项 · 纯数据批次）

> **为什么必须单列**：本批迁移**修改了 12 棵树 JSON**（`migrate-output/trees/*.json`）—— 这**不是**「只改 tree-meta」的旧口径；**不重传 = 线上节点出生地永远缺失**，与后端新口径（读侧归一 / 懒转）配合后仍会表现为「出生地空白」。

| 项 | 实测（本节重算） |
|---|---|
| 已变树 JSON | **12 棵**（`migrate-output/trees/*.json`，= 12 / 17） |
| **12 棵 `tree_id` 逐条（重传点名）** | `gu_39038` · `gu_39038_01` · `heng_24658_01` · `ji_23395` · `ji_23395_01` · `ji_32426_01` · `li_26446_01` · `li_26446_02` · `liu_21016_01` · `long_40857_01` · `qin_31206` · `zhonghua` |
| 未变的 5 棵 | `qin_31206_01`（空树）· `liu_21016` · `rong_23481_01` · `li_26446_03`（4 棵跳过）+ `shen_27784_01`（幂等跳过，迁移前已就位） |
| 重传命令 | **`node scripts/upload-migrated-to-cloudbase.mjs`**（仓内既有脚本；按 §25-3 第 ④ 条口径：按 report 逐树上传到 `trees/<tree_id>.json`，并回写 tree-meta + `storage_files`） |
| 仓内惯例（**纯数据批次**） | **先重传、后手工删旧详情键**（旧详情键不会被上传覆盖） |
| 上传后判据 | 云端逐树 `md5` 与本地 `migrate-output/trees/<tree_id>.json` 一致（12 / 12）；未列出的 5 棵 **零变更** |
| ⚠️ 未决项不得照传 | `shen_27784_01` 的 `origin_code = 230305` 与 `origin` 文本「山东省临沂市」**互斥 · 待 Kevin 裁定**（规格册 §16-5）⇒ 该树**不在本次 12 棵名点内**（幂等跳过），裁定前**不得**按任一解释回写 |

```bash
cd /Users/kevin/bistro/jiazu
python3 - <<'PY'
import hashlib,os
b=os.path.expanduser('~/jiazu-backups/2026-09-20-founder-birthplace/md5-before.txt')
before={l.split()[-1]:l.split()[0] for l in open(b) if len(l.split())>=2}
chg=[f for f,h in before.items() if os.path.exists(os.path.join('migrate-output',f))
     and hashlib.md5(open(os.path.join('migrate-output',f),'rb').read()).hexdigest()!=h]
print('changed',len(chg)); print('\n'.join(sorted(x[:-5].replace('trees/','') for x in chg)))
PY
```

### 26-3 必登 ③：前端 **H5 + 小程序重打**

| 项 | 实测（本节） |
|---|---|
| 小程序主包 | **1,998,964 B / 204 文件**（自算，按 `dist/build/mp-weixin/app.json` 的 `subPackages = ["pages/special"]`） |
| 分包 / 合计 | 分包 6,582 B / 12 文件；合计 **2,005,546 B** |
| 限值 / 余量 | 限 **2,097,152 B（2 MiB）** ⇒ **余量 98,188 B，未超** |
| 构建产物 mtime | `frontend/dist/build/mp-weixin/app.json` = **2026-09-20 12:17:22**（= 本批既有产物，**须重打**以纳入 F3 / O4 修复） |
| H5 | `cd frontend && npm run build:h5`（或仓内既有脚本）→ hosting：`tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c`（沿用 §25-4 命令） |
| 打包含 | 人物档案【出生地】/【居住地】（`person-archive.vue` 2,537 行）· `business/place.ts` · 发源地指定 UI `origin-picker.vue`（含 R2 置灰）· `pages/hall/index.vue` 入口 |
| type-check 前置 | `cd frontend && npm run type-check`（质检册 P3-b 实测 = 退出码 **0** / 零输出） |

```bash
cd /Users/kevin/bistro/jiazu/frontend && npm run type-check && npm run build:h5
python3 - <<'PY'
import json,os
root='dist/build/mp-weixin'; app=json.load(open(os.path.join(root,'app.json')))
subs=[p['root'] for p in app.get('subPackages',[])]; main=0
for d,_,fs in os.walk(root):
    for f in fs:
        rel=os.path.relpath(os.path.join(d,f),root); sz=os.path.getsize(os.path.join(d,f))
        if not any(rel==s or rel.startswith(s+'/') for s in subs): main+=sz
print('主包',main,'限 2097152'); print('未超' if main<=2097152 else '超限')
PY
```

### 26-4 必登 ④：`tree-meta` **不因本批迁移上传**，但**三次手工改动仍未上云**（必读）

| 项 | 实测（本节） |
|---|---|
| 本批迁移是否写 `tree-meta` | **否** —— `config/tree-meta.json` md5 **`c9112e40760839bc8d2132d6300b838b`**（9,572 B / mtime **2026-09-20 11:31:21** / `origin_code` 非空 **8 / 17**）⇒ **迁移全程未变**（C8 作废：无任何镜像回写） |
| 但 | **Kevin 于 09:31 / 10:59 / 11:31 的三次手工写入仍未上云** —— 云端 `tree-meta` 侧的 `origin_code` / `origin` 与本地**可能不一致** |
| 处置（登记，不含裁定） | 本批**不应**以「迁移」为由上传 `tree-meta`；**是否随批上传 = 部署决策**（须一并考虑上述三次手工改动；尤其 `li_26446_01` 的 `230305` 写入） |
| 铁律 | **E3-x 裁定**：发源地人工指定 = **一次性结果，来源节点后改不自动回落**；**不存在自动同步镜像** ⇒ 上传 `tree-meta` 只是「把本地现状搬上去」，**不产生任何派生写回** |

### 26-5 部署后冒烟验证（**按序做**；1–4 沿用 §25-10(6) / 5–10 见 §25-11(8)，11–14 = 本批新增）

| # | 验证 | 期望 | 依据 |
|---|---|---|---|
| 1 | 人物档案改名保存 | 200 · 扣 1 片 · 面板关闭 | §25-10(6) |
| 2 | 只改出生地保存 | 200 · 扣 1 片 · 树上 `birth_place` 为**对象** | C11 / §25-10(6) |
| 3 | 居住地第 10 条 | **400** `居住地最多 9 条` | C10 |
| 4 | 无码旧数据读 / 保存 | 读侧归一为 `{origin_code:'', note:<原串>}`；保存后**懒转成对象** | §25-11(6) 第 5 条 |
| 5 | 未知 `birth_place.origin_code` | **400** `出生地行政区划代码无效：<码>`，**不扣费** | **R1** |
| 6 | 未知码出现在某一条 `residence_places` | **400** 同上（**逐条同判**） | **R1** |
| 7 | 空码（未结构化） | **放行** | **R1** |
| 8 | `GET /tree/origin-candidates`（含无码节点之树） | **全列**（无码行 `place_code == ''`），前端**置灰**；**接口不报 400** | **R2** |
| 9 | `POST /admin/set-tree-origin` 指定无码节点 | **400** `该节点未填写出生地行政区划代码` | C8′ ④ |
| 10 | 只填出生地、生年不详的节点存后重读 | `profile.birth` **存在**（`place` / `place_code` / `place_note` 齐全） | 追认 3 |
| 11 | **只改【出生地】→ 保存**（F3 主用例） | **真发 PUT ≥1**、200、`birth_place` 键集**恰** `origin_code` / `note`（**无派生 `place`**） | **F3（质检册 P1-a）** |
| 12 | **只新增 1 条【居住地】→ 保存** | **真发 PUT ≥1**、200、body `residence_places` 含新条目 | **F3（质检册 P1-b）** |
| 13 | `{"birth_place": null}` 或 `{"residence_places": null}` **单独提交** | **400** `请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）`，**原值不变、零扣费** | **F5（质检册 P1-e/f）** |
| 14 | **同批带改名 + 地点字段显式 `null`** | **200 扣 1 片**，但地点字段**原值不变**（**不被 `null` 抹空**） | **F5（质检册 P1-g）** |
| 15 | 发源地指定后清空来源节点出生地码 | `tree-meta` **不回落** / 候选**无 `is_current`** —— **这是设计如此（E3-x），不是缺陷** | **E3-x 裁定** |

**冒烟用逐字文案（逐字冻结 · 部署后必须逐字匹配）**：400 = `居住地格式无效，应为数组` / `出生地格式无效，应为对象` / `出生地行政区划代码无效：<码>` / `居住地最多 9 条` / `请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）`；403 = `始祖节点信息需在本姓祖谱中修改` / `始祖节点信息需在中华世本（总谱）中修改` / `该节点为上层（中华世本）镜像，需到总谱修改` / `空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息`（**四支逐字不同、不得合并**）；前端 = `居住地最多 9 条，请先删除多余的条目` / `已达上限 9 条，如需新增请先删除一条。`

### 26-6 本批**不需要**上云的东西

| 项 | 原因 |
|---|---|
| CloudBase 集合 / 索引 | **无 schema 变更**（§25-2 同口径） |
| `config/geo-divisions.json` | 由 `lib/geo.js` **静态 JSON import 被 esbuild 内联** ⇒ 无需随云函数包发布 `config/`（§5-6R） |
| 自动同步 / 镜像对齐任务 | **C8 已作废、代码已删**；**E3-x：人工指定为一次性结果，无自动回落** ⇒ **没有**需要部署的同步作业 |
| `migrate-output/**` 的 `--normalize-birthplace-shape` 开关 | 该开关**未落盘**（全仓 0 命中）；形状迁移**不做**（懒转换口径） |
| 后端历史字符串的强制形状迁移 | 不做（读侧归一 + 保存懒转） |

### 26-7 阻塞点

| # | 阻塞 | 影响 | 解除条件 |
|---|---|---|---|
| 1 | **云函数未重打包**（8 串产物侧全 0） | 线上仍是旧口径：F5 的 `null` 闸门、F3 的配套后端行为**都到不了生产** | 执行打包 + 部署授权 |
| 2 | **12 棵树 JSON 未重传** | 线上节点「出生地」缺失 / 与本地台账不一致 | `node scripts/upload-migrated-to-cloudbase.mjs` + 部署授权 |
| 3 | **前端未重打**（H5 / 小程序） | F3 / O4 修复、发源地指定 UI（含 R2 置灰）**都到不了线上** | 重打 + hosting |
| 4 | **本批修复为工作区未提交改动** | 打包可能纳入半成品或被并发覆盖；**无回滚点** | commit / 明确冻结工作区 |
| 5 | **`shen_27784_01` 未决（唯一 FAIL）** | 该树发源地码与文本互斥；**不得照传、不得对外引用** | **Kevin 裁定**（规格册 §16-5） |
| 6 | **`config/tree-meta.json` 的云端侧状态不明** | Kevin 09:31 / 10:59 / 11:31 三次手工改动未上云 ⇒ 云端 / 本地可能不一致 | 部署决策（§26-4） |

### 26-8 残留风险（**逐条与规格册 §16-7 同源 · 不得据本节推断为已验证**）

1. **前端零单测覆盖（假绿面）**：`origin-picker` / `GeoCascader` / `business/place.ts` / `person-archive` 无单测；`npm test` **449 项全为后端**。
2. **小程序真机端到端未验**：未在微信开发者工具 / 真机跑「编辑 → 保存 → 回显」。
3. **`t-button` 禁用态未落根元素 `disabled`**：键盘 / 读屏可访问性存疑（功能拦截已验）。
4. **生产 `cloud` 路径（并发扣费 / 冲正 / 事务）未验**：全部实测走 `/tmp` 副本 + `COMPAT_SOURCE=local`。
5. **`shen_27784_01` 未决**（见 §26-7 第 5 行）。

### 26-9 复现命令（本节全部读数 · **只读，不触发部署**）

```bash
cd /Users/kevin/bistro/jiazu
# ① 云函数产物（未重打包铁证）
wc -c < cloudfunctions/deploy/compat-api/index.js; md5 -q cloudfunctions/deploy/compat-api/index.js
for s in residence_places place_note set-tree-origin origin-candidates '居住地格式无效' '居住地最多 9 条' assertPlaceFieldShapes personEditLockMessage; do printf '%s: ' "$s"; grep -c "$s" cloudfunctions/deploy/compat-api/index.js; done
# ② 12 棵已变树 JSON（重传点名）
python3 - <<'PY'
import hashlib,os
b=os.path.expanduser('~/jiazu-backups/2026-09-20-founder-birthplace/md5-before.txt')
before={l.split()[-1]:l.split()[0] for l in open(b) if len(l.split())>=2}
chg=[f for f,h in before.items() if os.path.exists(os.path.join('migrate-output',f))
     and hashlib.md5(open(os.path.join('migrate-output',f),'rb').read()).hexdigest()!=h]
print('changed',len(chg)); print(sorted(x) for x in chg)
PY
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json; stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' config/tree-meta.json
find migrate-output -type f | sort | xargs md5 -q | md5 -q          # 684ceb0bd03d31ef9c08104e3eb6ac41
# ③ 前端主包字节
python3 - <<'PY'
import json,os
root='frontend/dist/build/mp-weixin'; app=json.load(open(os.path.join(root,'app.json')))
subs=[p['root'] for p in app.get('subPackages',[])]; main=0; n=0
for d,_,fs in os.walk(root):
    for f in fs:
        rel=os.path.relpath(os.path.join(d,f),root)
        if not any(rel==s or rel.startswith(s+'/') for s in subs): main+=os.path.getsize(os.path.join(d,f)); n+=1
print('主包',main,'/',n,'文件; 限 2097152; 余量',2097152-main)
PY
# ④ 测试基线（打包前回归门槛）
npm test | tail -8                                                   # 449 / 449 / 0
# ⑤ 边界自查
git status --short AGENTS.md; md5 -q AGENTS.md
```

> **本节边界**：只写文档 —— **未改代码、未写真源**（`config/tree-meta.json` 前后 md5 均 `c9112e40760839bc8d2132d6300b838b`；`migrate-output/**` 聚合前后均 `684ceb0bd03d31ef9c08104e3eb6ac41`）、**未改 `AGENTS.md`**（前后均 `M AGENTS.md` / md5 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行任何部署 / 打包 / 重传 / 迁移 / 提交**；§25-0～§25-11 历史行原文保留。
> **跨册登记**：口径与证据全文见 `docs/person-places.spec.md` **§15 / §16**；判据终稿见 `docs/person-places.qa.md`（84 = 81 PASS / 1 待裁定）。

---

## 27. 追补：**部署前先跑 `node scripts/fix-tree-origin-display.mjs --check`**（**建议性质 · 待 Kevin 拍板 · 尚未采纳**）（Jing 制度员 · 2026-09-20 · **只追加 · 不改 §25-0～§26-9 历史行**）

> **性质**：本节由 **Jing（制度员）** 追加 —— **只写文档**：未改代码、**未写真源**（`config/tree-meta.json` md5 本节**前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**；`migrate-output/**` 零写入）、**未改 `AGENTS.md`**、**未执行任何部署 / 打包 / 重传 / 迁移 / 提交**。
> **⚠️ 未采纳声明**：本节登记的是**建议**，**不是**已批准的动作面；**不得**据本节认为该门槛已生效。**裁定权属 Kevin**。

### 27-0 建议内容

- 在本批（§25 / §26）的**部署批次执行前**，**先跑**：

```bash
cd /Users/kevin/bistro/jiazu
node scripts/fix-tree-origin-display.mjs --check; echo "check_exit=$?"   # 期望 exit 0
```

- **门槛口径（建议）**：`--check` **exit 1 ⇒ 阻断部署** —— 有码树的 `origin` 显示串与 `resolveOrigin(origin_code).display` 不一致时，上线即**把错的显示串搬上云**。
- **为何需要**：缺陷 **J**（弹窗 legacy 直写覆盖发源地显示串）会**静默**把显示串改回旧文本 —— **码对、显示串错**，接口 schema 与肉眼**都看不出**（全文见规格册 **§17**）。
- **可选（建议 · 未采纳）**：把该守卫纳入 `npm test`（现基线 449 项**全为后端**、**无**此项）。

### 27-1 建议的时效（**关键**：按此口径当前即「阻断」）

| 项 | 实测（本册只读 · 本节时点） |
|---|---|
| 守卫脚本 | `scripts/fix-tree-origin-display.mjs` · **14,026 B** · mtime 2026-09-20 13:06:11 · `git status` = `??`（未入库） |
| **`--check` 结果** | **exit 1**（1 棵不一致：`shen_27784_01` —— current『山东省临沂市』/ expected『黑龙江省鸡西市梨树区』）；17 棵：有码 **9**（一致 **8** / 待修正 **1**）/ 无码 **8**（不碰）/ 未知码 **0** |
| **⇒ 结论（逐字）** | **按本节建议的口径，当前状态即为「阻断部署」** —— 须先闭合真源（处置建议见规格册 **§17-4.1**：**先停掉修复前启动的 local-server 进程**，再 `--apply`，再 `--check` 复验） |
| 真源 md5 | **`35b08517791c11be68fb3d7b2f4d9820`**（9,636 B · mtime **2026-09-20 13:08:00**）**≠** 契约冻结值 `5963106e1a3d21272565f5ed2a884413`（`cloudfunctions/compat-api/lib/person-places.test.js`） |
| `npm test` | **449 / 448 / 1**（唯一红 = 「真源零写入」冻结值用例）⇒ **打包前的回归门槛目前为红** |

### 27-2 与既有批量阻塞点的关系（**本节不回改 §26-7 表**）

1. **真源显示串未一致**（`--check` **exit 1**）⇒ 阻断「树 JSON 重传 / 云函数重打包 / 前端重打」三必登项的**前置条件**。
2. **`npm test` 现为 449 / 448 / 1（红）**⇒ 打包含**回归门槛未绿**，须先闭合真源再重跑。
3. **`metaCache` 陈旧整份回写**（`cloudfunctions/compat-api/lib/store.js:91` / `:294` / `:298`）⇒ 部署 / 联调前**必须重启 local-server**（否则刚做的修正可能**再次被整份回写覆盖**；本册实测存活：pid **25692** = `:3410` 启动 **08:55** · pid **35229** = `:3100` 启动 **13:16**）。
- **§26-4 的「`tree-meta` 不因本批迁移上传」口径不变**；但**若**决定随批上传，**必须先** `--check` = **exit 0**。

### 27-3 复现命令（**只读 · 不触发部署**）

```bash
cd /Users/kevin/bistro/jiazu
node scripts/fix-tree-origin-display.mjs --check; echo "check_exit=$?"    # 本节实测：exit 1
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json              # 本节：35b08517791c11be68fb3d7b2f4d9820 / 9636
npm test | tail -8                                                      # 本节：449 / 448 / 1
grep -n 'metaCache' cloudfunctions/compat-api/lib/store.js
ps aux | grep -E 'local-server\.js' | grep -v grep
git status --short AGENTS.md; md5 -q AGENTS.md
```

> **本节边界**：只写文档 —— **未改代码、未写真源**（`config/tree-meta.json` 前后均 `35b08517791c11be68fb3d7b2f4d9820`；`migrate-output/**` 零写入）、**未改 `AGENTS.md`**（前 = 后 = 空）、**未执行任何部署 / 打包 / 重传 / 迁移 / 提交**；§25-0～§26-9 历史行**原文保留**。
> **跨册登记**：缺陷 J 全文见 `docs/person-places.spec.md` **§17**；本册 16 处作废标注的质检册侧见 `docs/person-places.qa.md`「**追补（Jing · 第二）**」。

---

## 28. 追补二：**「13:08 修正被回退」—— 部署门槛仍为红**（真源 `35b08517…` · 守卫仍 **exit 1** · `npm test` **449 / 448 / 1** · 机制**已定位** · 修复**已派 · 进行中 · 未落盘** · **部署 / 联调前必须重启 local-server**）（Jing 制度员 · 2026-09-20 · **只追加 · 不改 §25-0～§27-3 历史行**）

> **性质**：本节由 **Jing（制度员）** 追加 —— **只写文档**：**未改代码**、**未写真源**（`config/tree-meta.json` md5 本节**前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**；`migrate-output/**` 零写入）、**未改 `AGENTS.md`**、**未执行任何部署 / 打包 / 重传 / 迁移 / 提交**。
> **与 §27 的关系**：§27 的「部署前先跑 `--check`」**仍为建议性质、仍未采纳**（**本节不写成已采纳**）；本节**只做事件登记 + 现行状态刷新**。§27-1 表的读数（`35b08517…` / **exit 1** / `449 / 448 / 1`）与现值**一致 ⇒ 原文保留有效**。

### 28-0 事件（全文见规格册 §18）

- **事件 K「13:08 修正被回退」**：规格册 §17 登记的显示串修正（`shen_27784_01`）在 **13:08:00** 被一次元数据写入**整体抹掉** —— 成因 = **一个「修正前就已启动」的长驻 local-server 实例**响应该写入时，把**其过期进程内存副本整份回写**到真源。
- **机制（已定位 · 逐字引用见规格册 §18-3）**：`cloudfunctions/compat-api/lib/store.js` 的 `metaCache`（**`:91`** 进程级缓存；仅由 `saveMeta` 更新、**不检测磁盘外部变更**）+ `getMeta()`（**`:266-285`**，**仅在缓存为空时读盘**）+ `saveMeta()`（**`:287-299`**，local 非沙箱下**整份** `JSON.stringify` 落盘）⇒ **`config/tree-meta.json` 是本仓唯一「无乐观锁的全量落盘文件」**。
- **⇒ 对部署的直接影响（逐字）**：**只要「部署 / 联调 / 页面实操」期间有修正前启动的实例存活，任何一次元数据写入（改 `display_title`、指定发源地）都可能把真源整份回写、抹掉修正**。

### 28-1 现行状态（**本册实测 · 本节时点**）

| 项 | 值 |
|---|---|
| 真源 md5 | **`35b08517791c11be68fb3d7b2f4d9820`**（9,636 B · mtime **2026-09-20 13:08:00**）**≠** 契约冻结值 `5963106e1a3d21272565f5ed2a884413` |
| 守卫 `node scripts/fix-tree-origin-display.mjs --check` | **exit 1**（1 棵不一致：`shen_27784_01` code=`230305` current『山东省临沂市』/ expected『黑龙江省鸡西市梨树区』）；17 棵：有码 **9**（一致 **8** / 待修正 **1**）/ 无码 **8** / 未知码 **0** |
| `npm test` | **449 / 448 / 1**（唯一红 = `not ok 391` 冻结 md5 断言）⇒ **打包前回归门槛为红** |
| `li_26446_02` | `origin` = 『黑龙江省牡丹江市穆棱市』（**修正保留**）· `display_title` = **『李氏穆棱家族』**（Kevin 手工） |
| 存活 local-server（实测） | pid **25692** = `local-server.js 3410`（启动 **08:55**，**修正前启动 ⇒ 覆盖风险源**）· pid **35229** = `local-server.js 3100`（启动 **13:16**） |
| 修复 / 口径 | 加固（`getMeta()` 外部变更检测 + 冻值断言改自比）**已派 · 进行中 · 未落盘**；**Zang 已定**：①修正**即将重放** ②冻值断言口径改「自比 + 打印当时指纹」。**仍待 Kevin 拍板**（**未采纳**）：守卫纳入 `npm test` / 部署前检查、`PUT /tree-meta` legacy 直写加固 |

### 28-2 对部署动作面的影响（**§26-0～§26-3 的必登项不变，本节不回改**）

- **必登三项仍全部未执行**（云函数重打包 / 12 棵树 JSON 重传 / 前端 H5+小程序重打）—— 本节**不改变**其清单与顺序（§26-1 / §26-2 / §26-3）。
- **新增前置条件（按序执行 · 缺一不可）**：
  1. **先落加固**（§18-4 ①②落地并复跑验证）；
  2. **重放修正**（Zang 已定 ①：重跑 `node scripts/fix-tree-origin-display.mjs --apply`，恢复 `shen_27784_01`）；
  3. **守卫复验** `--check` **必须 exit 0**（§27 建议口径下当前为**阻断**）；
  4. **`npm test` 必须回到全绿**（冻值断言按新口径落地 → 449 / 449 / 0 或换口径后的新基线，**须实测回填，不得推算**）；
  5. **★ 部署 / 联调 / 页面实操前，重启所有 local-server 实例**（含启动于修正前的 pid 25692）—— 否则真源**可能再次被整份回写覆盖**（事件 K 复现）；
  6. 若每次元数据写入后仍出现 `--check` 由 0 变 1 ⇒ **立即停手、登记事件、不得继续打包**。
- **§26-4 的「`tree-meta` 不因本批迁移上传」口径不变**；但**若**决定随批上传，**必须先** `--check` = **exit 0 且 `npm test` 全绿**。
- **§26-9 复现命令内的注释行**（`# 449 / 449 / 0` 等）为 **12:32 时点读数**；**现值 = 449 / 448 / 1**（**代码块内，本节不回改**）。

### 28-3 复现命令（**只读 · 不触发部署**）

```bash
cd /Users/kevin/bistro/jiazu
node scripts/fix-tree-origin-display.mjs --check | tail -3      # 本节：exit 1（MISMATCH shen_27784_01）
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json     # 本节：35b08517791c11be68fb3d7b2f4d9820 / 9636
npm test 2>&1 | tail -8                                        # 本节：449 / 448 / 1
grep -n 'statSync\|mtime' cloudfunctions/compat-api/lib/store.js          # 本节：0 命中 ⇒ 加固未落盘
grep -n 'metaCache' cloudfunctions/compat-api/lib/store.js
ps aux | grep -E 'local-server\.js' | grep -v grep              # 本节：:3410（08:55 启动，风险源）/ :3100（13:16）
git diff --stat config/tree-meta.json                           # 本节：仅 li_26446_02，4+ / 3-，未提交
git status --short AGENTS.md; md5 -q AGENTS.md
```

> **本节边界**：只写文档 —— **未改代码、未写真源**（`config/tree-meta.json` 前后均 `35b08517791c11be68fb3d7b2f4d9820`；`migrate-output/**` 零写入）、**未改 `AGENTS.md`**（前 = 后 = 空）、**未执行任何部署 / 打包 / 重传 / 迁移 / 提交**；§25-0～§27-3 历史行**原文保留**。
> **未采纳声明**：§27 的建议门槛与 §18-6 两项**均未采纳**，**不得**据本节认为门槛已生效；**裁定权属 Kevin**。
> **不得写「已修」**：加固**未落盘**、口径**未落地**、修正**未重放** ⇒ 本册**不得**据此认为风险已闭合。
> **跨册登记**：事件 K 全文见 `docs/person-places.spec.md` **§18**；质检册侧见 `docs/person-places.qa.md`「**追补（Jing · 第三）**」。

### 28-4 追加（复核时点 **2026-09-20 13:32:06 CST**）：加固 ① **已落盘（未提交）**，**规程不变**

- **状态变更**：§28-1 表「修复 / 口径」行的「**未落盘**」**仅在本节初稿时点成立** —— 复核时点 `cloudfunctions/compat-api/lib/store.js` 的**外部变更检测已落盘**（`git diff --stat` = `1 file changed, 69 insertions(+), 14 deletions(-)`，**工作区未提交**：新增 `metaStamp` 指纹 + `statMetaFile()` / `sameMetaStamp()`，`getMeta()` 改为「先 stat 比对 `mtimeMs + size + ctimeMs`，变化即重读」，`saveMeta()` 写后对齐指纹）。**② 冻值断言改造仍未落盘**。
- **★ 部署规程不变（关键）**：加固 ① **只对「改动落盘之后启动」的实例生效** —— **pid 25692（:3410，启动 08:55）仍在运行改动前的代码** ⇒ **仍是活跃的覆盖风险源**。故 **§28-2 第 5 条「部署 / 联调 / 页面实操前重启所有 local-server 实例」仍是必需项**，**不得**因加固落地而省略。
- **复测读数（未变）**：真源 md5 **`35b08517791c11be68fb3d7b2f4d9820`** · 守卫 **exit 1** · `npm test` **449 / 448 / 1**（`not ok 391`）· `git status --short AGENTS.md` **空**。
- **口径**：**①已落盘 ≠ 门槛转绿**（**未提交、②未落盘、修正未重放、无专项复跑证据**）⇒ 本册**不写「已修」**；逐字引用与残留 TOCTOU 窗口见规格册 **§18-11**。

---

## 29. 部署登记：**始祖真源反转（变体 A · 始祖真身在家族树）**（代码批次 + 纯数据批次 · **必登四项：云函数重打包 / 前端 H5+小程序重打 / 树 JSON 重传 / 存量季·顾两条链就地反转**）（Jing 制度员 · 2026-09-20 17:50 CST · **只追加 · 不改 §25-0～§28-4 历史行**）

> **性质**：本节为**部署台账登记**（**只追加**）—— **未改代码、未写真源、未改 `AGENTS.md` 之外的任何仓文件、未执行任何部署 / 打包 / 重传 / 迁移 / 提交**（本节改动的文档见节末「本节边界」）。
> **裁定来源**：Zang 终审 v1（2026-09-20）「始祖真源反转」**变体 A** —— 始祖**真身在家族树**；宗谱 / 世本各持**只读镜像**；**世系链镜像方向不变**。口径真源 = `docs/founder-attach.spec.md` **§9**（术语重定义 / R1–R3 / R6 / 代码锚点 / 真源锚点）、`docs/clan-tree.spec.md` **§11**、`docs/branch-clan-ops.spec.md` **§16**（R4 / R5 / R7）。
> **⚠️ 实现状态（实测 2026-09-20 18:00 CST）**：本批实现在 **17:51–17:56** 已**落到工作区（未提交）** —— `git status --short` = `M lib/{founder-attach.js,branch-clan-ops.js,tree-write.js,founder-attach.test.js}` + `M README.md` + `?? scripts/migrate-founder-inversion-2026-09.mjs`；**`cloudfunctions/compat-api/index.js` 本批未改**；**云函数产物仍未重打包**（md5 `d61a8aeb…` 不变）。落地证据与锚点见 `docs/founder-attach.spec.md` **§9-10**；测试基线仍为红（**454 / 447 / 7**，见 §29-6 第 1 行）⇒ **不得**据本节认为已实现完毕 / 已验证 / 已部署。
> **时点**：`date` = **2026-09-20 18:00 CST**；本节读数均为**本节实测**（复现命令见 §29-8）。**编号接 §28**（本节为最大节 ⇒ 后续追补接 §30）。
> **v1.1 校正时点（Jing · 2026-09-20 18:35 CST）**：本节经一轮**校正与收口** —— 追加 **§29-3-1（A1 / A2 / A3）** 与 **§29-9（A6）**；**改写 §29-6 第 1 条**为「**`npm test` 全绿 = 本批交付门槛**（前置条件）」；§29-4 追加第 **15–18** 条；§29-8 追加 v1.1 只读复核命令。**只追加 / 只校正本批新增行**：§25-0～§28-4 历史行**与本节 v1.0 正文一律原文保留**（新口径以「**已作废 / 已取代**」标注 + 追加行落地）。
> **v1.1 收尾实测（Jing · 2026-09-20 18:40 CST · **取代上列「⚠️ 实现状态」中的测试读数与「`index.js` 本批未改」**）**：① **`npm test` 已全绿** = **454 / 454 / 0 / 0（exit 0）**，实测 **18:38:20 CST** ⇒ §29-6 第 1 条的**交付门槛已达标**（仍以冻结时点的最终一次实测为准）；② **`cloudfunctions/compat-api/index.js` 本批已改**（`git diff --numstat` = **`9 +` / `0 -`**，mtime **18:34:15**）= **A6 接线**（`/tree/rank` 已调 `resolveChainGen`，见 **§29-9**）；③ 同批其余落盘 = `lib/branch-clan-ops.test.js` · `lib/founder-attach.test.js` · `lib/founder-reattach.test.js` · `frontend/src/business/api.ts` · `frontend/src/business/cross-tree.ts` ⇒ **§29-2「前端必须重打」的结论不变、且更必要**；④ **云函数产物仍未重打包**（`cloudfunctions/deploy/compat-api/index.js` = **998,338 B** · mtime **2026-09-19 12:50:59** · md5 **`d61a8aebfb3f3095baae4e1e731fd675`**，与 §29-1 同值 ⇒ §29-1 判定不变）。
> **v1.1 终校读数（Jing · 2026-09-20 **18:56:57** CST · 追加 · 代码仍在动）**：`npm test` 再测 → **454 tests / 454 pass / 0 fail / 0 skipped**（**exit 0**，`not ok` **0 条**）⇒ **与前一次全绿读数一致**。此后工作区**又新增落盘**（实测 mtime）：`lib/clan.js` `59 +` / `20 -`（18:48:29）、`lib/founder-attach.js` `418 +` / `91 -`（18:48:39）、`lib/tree-write.js` `24 +` / `7 -`（18:48:48）、`frontend/src/business/{types.ts,api.ts,index.ts}`、`frontend/src/components/{clan-hall,family-messages,person-archive,person-manage-panel}` ⇒ **本节的四项动作面（重打包 / 重打前端 / 重传树 JSON / 存量反转）判据不变**；**行号类登记以最新时点为准**（`docs/founder-attach.spec.md` §9-6 / §9-10 (e) 已按 18:57 复核实测校正）。
> **真源侧进程外写入（Jing · 2026-09-20 **18:58** CST 实测 · 只登记 · **与本次文档校正无关**）**：`migrate-output/**` **文件数实测 319**（本节 v1.0 与 §29-3-1 校正笔记的「318」为 17:5x 时点值，**已陈旧**）。新增 / 改写者 = **运行时写入**（进程外写者，非本校正轮）：新键 `migrate-output/details/zhonghua:6dfb6ba8dc8a57625a115395.json`（607 B，mtime **18:42:17**）+ 改写 `migrate-output/trees/zhonghua.json`（90,401 B）、`migrate-output/collections/jiazu_assets.json`（74,860 B）、`migrate-output/collections/jiazu_id_seq.json`（114 B）（mtime **18:40:16 / 18:42:17**）⇒ 与 `config/tree-meta.json` 是**无乐观锁的活文件**属同一类现象（§28-0 事件 K）。**本文档校正期间的自身写入 = 0**：`config/tree-meta.json` md5 **`5c8ca3aee29bd811cd7e2d4b2cbf8d05`**（9,648 B）与 mtime **2026-09-20 13:36:13** **均未变**，`migrate-output/trees/ji_23395.json`（11:36:14）与 `details/ji_23395:3c95530f8bd4f84dc0b87edc.json`（09-16 13:13:02）**均未被本校正触碰**。⚠️ **对 §29-3 的含义**：真源在**联调期间仍被运行中的实例改写** ⇒ **重传 / 反转的范围与前后 md5 必须以「全部 local-server 重启 + 冻结后」的一次实测为准**（§28-2 第 5 条同址要求）。

> **⭐ v1.2 裁定 D1 校正（Jing · 2026-09-20 **19:19:00** CST 实测 · 只追加 · **取代** v1.1 的「A6 已接线」口径）**：**A6 已回退**（裁定 **D1**）—— `/tree/rank` **不接线** `resolveChainGen`，`cloudfunctions/compat-api/index.js` 与 **HEAD 字节相同**（md5 **`f1f40096323de98f1f2b3d9188c2bac5`**；`git diff --numstat -- cloudfunctions/compat-api/index.js` = **空**、`git status --short` **不再列出该文件**，实测 **19:19** CST）。⇒ 本块上方「v1.1 收尾实测」的**第 ② 项**（『`index.js` 本批已改（`9 +` / `0 -`，mtime 18:34:15）= **A6 接线**』）**已作废**；**§29-9「同批校正」块同址作废**（见 §29-9「v1.2 裁定 D1 校正」）。**§29-1 的产物侧判据不受影响**（产物仍未重打包，md5 仍 `d61a8aebfb3f3095baae4e1e731fd675`）。**R6 的唯一落点 = `lib/tree-write.js` `clanSelfGenMap`（`:772` 定义 / `:781` 调用点，19:19 实测）**，**保留不变**。**逐项读数 / 裁定理由 / 复现命令见 §29-9「v1.2 裁定 D1 校正」块**。
> **v1.2 测试读数刷新（Jing · 2026-09-20 **19:18:14–19:18:17** CST 实测 · **取代**上列 454 读数）**：`cd /Users/kevin/bistro/jiazu && npm test` → **464 tests / 464 pass / 0 fail / 0 skipped**（`node --test` TAP 汇总逐字 = `1..464` / `# tests 464` / `# pass 464` / `# fail 0` / `# skipped 0`，**exit 0** = 全绿，`not ok` **0 条**）。增量 = **专测文件 `lib/founder-source-reversal.test.js` 已落地并注册**（**44,276 B**，mtime **2026-09-20 19:04**；`scripts.test` 注册数 = **28** = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` **28**）⇒ **+10 tests**（454 → 464）。⇒ 上列 **454 / 454 / 0**（18:38:20 / 18:56:57 两条）**已陈旧**（**同一门槛、更大分母，门槛仍达标**）。

### 29-0 总览（本批动作面 = 4 项 + 1 项「无变化」）

| # | 目标 | 动作 | 阻塞 | 备注（本节实测） |
|---|---|---|---|---|
| 1 | 云函数 **`compat-api`** | **重打包 + 部署**（**必须**） | **无**（先决：Kong **落盘终态** + `npm test` 转绿 + 工作区冻结） | 产物当前为 §26-1 同一份（**未重打包铁证**见 §29-1）；实现已在工作区（未提交） |
| 2 | 前端 **H5 + 小程序** | **重打 + hosting / 开发者工具上传**（**必须**） | hosting 目标 + 云函数域名 | 现有产物 = H5 `2026-09-20 13:20` / mp-weixin `2026-09-20 13:21`（**均早于本批实现 ⇒ 需重打**） |
| 3 | **云端数据（树 JSON）** | **重传变更树**（**纯数据批次**：**先重传、后手工删旧详情键**，仓内惯例 §12-2 / §26-2） | 备份 + 部署授权 | 变更树清单 = **以 Kong 实装后 `migrate-output/trees/*.json` 的 md5 前后比对为准**（本册不预填数字） |
| 4 | **`tree-meta`** | **会变**（宗谱 `founder_handle` 指向登记镜像；「R4 通用口径」） | — | ⚠️ 与 §26-4「本批不上传」中的「三次手工改动仍未上云」**同址**；`config/tree-meta.json` 是**无乐观锁的全量落盘文件**（§28-0 事件 K）⇒ **上传前必须重启全部 local-server 实例**（§28-2 第 5 条仍有效） |
| — | CloudBase 集合 / 索引 | **无**（不新建集合、不新增上传项） | — | 复用既有 `jiazu_tree_meta` / `jiazu_person_details` 等 |

### 29-1 必登 ①：云函数 `compat-api` **必须重打包**（**当前实测未重打包**）

| 项 | 实测（本节 2026-09-20 17:50 CST） |
|---|---|
| 产物 | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B** · mtime **2026-09-19 12:50** · md5 **`d61a8aebfb3f3095baae4e1e731fd675`** |
| 判定 | ❌ **未重打包**（与 §24 / §25-10 / §25-11(1) / **§26-1 同值** ⇒ 本批亦未落地） |
| **判据 A（立即可跑 · 首选）** | 重打包后 **md5 ≠ `d61a8aebfb3f3095baae4e1e731fd675`** 且 **mtime > 2026-09-20 17:50** —— 若产物仍是这一份，则本批与 §23 / §24 / §25 / §26 的口径**同时落后** |
| **判据 B（`grep -c` ≥1 形式 · **实测字面已可用**）** | 本批实装字面**已落到源码**（见 §29-1-1 表）：**源码侧 ≥1 / 产物侧期望 ≥1（当前 = 0）** —— 逐串判据与读数见下表 |
| 产物侧现状对照（**本节复测 18:17 CST**） | `personEditLockMessage` **0** · `residence_places` **0**（产物侧）；**源码侧** = `index.js:1` / `lib/founder-attach.js:3` / `lib/tree-write.js:3`（`personEditLockMessage`）、`lib/tree-write.js:10` / `index.js:4` / `lib/founder-attach.js:1`（`residence_places`） |
| 产物侧已存在的相关字面（**不构成判据**，仅防误判） | `isUpperMirror` **6** · `PLACEHOLDER_LOCK_MESSAGE` **2** · `planFounderPlaceholder` **2** · `listAttachedTrees` **4** · `external_chain_gen` **10** —— 说明**旧口径已在产物内**，故**只有「本轮新字面 ≥1」才算重打包判据** |
| 打包命令 | 以**仓库既有打包脚本 / 惯例**为准（同 §23 / §24 / §25-1 / §26-1 的同一命令，本册**不新造**）；产物路径 = `cloudfunctions/deploy/compat-api/index.js` |
| 部署前必读 | 本批实现**在工作区未提交**（Kong 在途）；打包前须**确认落盘终态 + 冻结工作区**（否则会把半成品打进去，且 `npm test` 当前为红 —— 见 §29-6 第 1 行）；`cloudfunctions/deploy/**` 是**产物**、不是编辑对象 |

#### 29-1-1 重打包判据（逐串 · **实测** 2026-09-20 18:17 CST）

> 口径：**源码侧 ≥1**（证明字面已实现）**且 产物侧期望 ≥1**（证明已重打包）；**产物侧当前全 0 ⇒ 未重打包**。命令见 §29-8。

| # | 字面（**逐字取自实现**） | 对应裁定 | 源码侧（文件:计数） | 产物侧（实测） |
|---|---|---|---|---|
| 1 | `isReadonlyMirror` | **R3** 方向无关只读判据 | `founder-attach.js:6` | **0** |
| 2 | `familyMirrorLockMessage` | **R3** 向下镜像新文案函数 | `founder-attach.js:2` | **0** |
| 3 | `该节点为孤儿镜像` | **R2b** 新 `PLACEHOLDER_LOCK_MESSAGE` 字面（首段） | `founder-attach.js:1` | **0** |
| 4 | `isOrphanMirror` | **R2b** 孤儿镜像判定 | `founder-attach.js:2` | **0** |
| 5 | `planFounderRegistration` | **R2** 真身始祖登记（不覆盖身份字段） | `founder-attach.js:4` | **0** |
| 6 | `planClanRegistrationMirror` | **R4** 宗谱登记镜像 | `founder-attach.js:2` | **0** |
| 7 | `clanRegistrations` | **R4** 登记集合读侧 | `founder-attach.js:3` | **0** |
| 8 | `resolveChainGen` | **R6** 世数下钻真身 | `founder-attach.js:2` + `tree-write.js:2` | **0** |
| 9 | `始祖的镜像，需在` | **R3** 新文案中段（`familyMirrorLockMessage` 模板） | `founder-attach.js:3` | **0** |
| 10 | `personEditLockMessage` | §26 批（**同批连带**） | `index.js:1` + `founder-attach.js:3` + `tree-write.js:3` | **0** |
| 11 | `residence_places` | §26 批（**同批连带**） | `index.js:4` + `tree-write.js:10` + `founder-attach.js:1` | **0** |

> **R5 无独立判据串**：其实装为**删改**（旧字面 `该家族树当前始祖不是上层镜像，无法汇宗` 在源码中**已 0 命中**、新字面 `该家族树当前没有始祖节点，无法汇宗` = `branch-clan-ops.js:1`）⇒ **R5 的判据形式是「旧串 = 0 且新串 ≥1（产物侧期望 ≥1）」**，与上表 1–11 的「≥1」方向相反，故单列。R1（读侧推导复用既有 `listAttachedTrees` / `founderTreeLabel`）**不产生新字面**，判据 = ① 头部注释串（`founder-attach.js` 的 `R1 单一真源` 注释，实测 `:1`）或 ② 行为判据（§29-4 第 14 条冒烟）。

```bash
cd /Users/kevin/bistro/jiazu
for s in isReadonlyMirror familyMirrorLockMessage isOrphanMirror resolveChainGen planFounderRegistration planClanRegistrationMirror clanRegistrations '该节点为孤儿镜像' '始祖的镜像，需在' personEditLockMessage residence_places; do printf '%s: ' "$s"; grep -c "$s" cloudfunctions/deploy/compat-api/index.js; done
grep -c '该家族树当前没有始祖节点，无法汇宗\|该家族树当前始祖不是上层镜像，无法汇宗' cloudfunctions/compat-api/lib/branch-clan-ops.js
```

```bash
cd /Users/kevin/bistro/jiazu
wc -c < cloudfunctions/deploy/compat-api/index.js; md5 -q cloudfunctions/deploy/compat-api/index.js   # 本节：998338 / d61a8aebfb3f3095baae4e1e731fd675
for s in personEditLockMessage residence_places isUpperMirror PLACEHOLDER_LOCK_MESSAGE; do printf '%s: ' "$s"; grep -c "$s" cloudfunctions/deploy/compat-api/index.js; done
```

### 29-2 必登 ②：前端 **H5 + 小程序重打**（当前产物早于本批）

| 项 | 实测（本节） |
|---|---|
| H5 产物 | `frontend/dist/build/h5/` mtime **2026-09-20 13:20**（`index.html` 847 B）；`assets/index-CCvLUJNW.js` 等为当日产物 |
| 小程序产物 | `frontend/dist/build/mp-weixin/app.json` = 1,287 B · mtime **2026-09-20 13:21** |
| 判定 | ❌ **早于本批实现** ⇒ 若本批含前端改动（始祖可写 / 取消占位锁 / 只读文案分支），**必须重打**，否则线上仍是旧只读态 |
| 命令 | `cd frontend && npm run build:h5`（带 `VITE_API_BASE`）+ `tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c`（沿用 §25-4 口径）；小程序 `npm run build:mp-weixin` + 开发者工具上传 |
| 判据（候选 · 待回填） | 前端产物的**实装字面**待 Kong 落地后回填；**本册不预设字面**。可立即用的判据 = 产物 mtime > 本节时点 |
| 备注 | 是否**必须**含前端改动，取决于 Kong 实装的文案分支（R3 / R2b 的只读文案选择）；**以 Kong 交付说明为准**（本册**不代判**） |

### 29-3 必登 ③：**纯数据批次**（树 JSON 重传 + 详情 `_id` 变更 → 旧键清理）

**顺序固定（仓内惯例 · 不可交换）**：**先重传树 JSON / 详情新键 → 再手工删旧详情键**。理由（沿用 §12-2 逐字口径）：上传脚本对详情是 `doc(_id).set()`（**upsert，只增不删**）⇒ 只写新键、不删旧键；**先删后传**会出现「树里已有节点、详情 404」的空窗。

| 步骤 | 动作 | 判据 / 备注 |
|---|---|---|
| ① 备份 | 真源备份（`migrate-output/**` + `config/tree-meta.json`），打印**写前 md5**（逐棵 + 聚合） | 仓内惯例：`/tmp/jiazu-bak-<ts>` 或 `~/jiazu-backups/<日期-说明>/` |
| ② 重传 | `node scripts/upload-migrated-to-cloudbase.mjs`（按 report 逐树上传到 `trees/<tree_id>.json`，并回写 tree-meta + `storage_files`） | 云端逐棵 md5 与本地一致 |
| ③ 删旧详情键 | **按 `_id` 精确手工删除**（云端 `jiazu_person_details`） | 清单见下表 |
| ④ 回读验证 | 新键能读回、旧键不存在 | 见 §29-4 冒烟第 5 条 |

**详情 `_id` 变更导致的旧键清理清单（R7 · 候选清单，以 Kong 实装 report 为准）**

| # | 旧键（本节实测**存在**） | 大小 | 对应新键（本节实测**存在**） | 大小 | 处置 |
|---|---|---|---|---|---|
| 1 | `ji_23395:3c95530f8bd4f84dc0b87edc`（季花 = 宗谱自有段真身） | 273 B | `ji_23395_01:10400594c54f5203f61bf4fa4b20`（季花 = 家族树始祖） | 333 B | 反转后**旧键删除**（真身落家族树） |
| 2 | `gu_39038:5ae4c6e505c90d290f71f66b`（顾清学 = 宗谱自有段真身） | 276 B | `gu_39038_01:103f95b87b5a464242933ee319d5`（顾清学 = 家族树始祖） | 336 B | 同上 |
| 3 | `ji_23395:mir_103ff661b13b19b0f44c89cbe2f7`（季行父 = 宗谱顶端镜像） | 284 B | —（**顶端镜像段方向不变**，不删） | — | **不动** |
| 4 | `gu_39038:mir_a824b97dab17c3f590b4e3fc`（姒期视 = 宗谱顶端镜像） | 280 B | —（同上） | — | **不动** |

> - **本清单为「实测存在键 + 候选迁移对」**：第 1 / 2 行的**键对**（谁迁到谁）取决于 Kong 的实现选择（是否搬节点 / 是否改 `founder_handle` 指向），**最终键对必须回填实装 report**；第 3 / 4 行是**确定性不动项**（R1：宗谱顶端镜像段方向不变）。
> - **树 JSON 变更范围**：至少 `ji_23395` · `ji_23395_01` · `gu_39038` · `gu_39038_01` 4 棵（两对反转涉及）；其余树是否变化**以 md5 前后比对为准**，本册**不预填数字**。
> - **`tree-meta` 同批上传的前置**（§28-2 第 5 条仍有效）：**先重启全部 local-server 实例**，否则 `config/tree-meta.json` 可能被进程内 `metaCache` **整份回写覆盖**（事件 K）。
> - **R7 迁移脚本已在工作区（未提交）**：`scripts/migrate-founder-inversion-2026-09.mjs`（`git status` = `??` 未入库；`README.md` 已登记用法 `node scripts/migrate-founder-inversion-2026-09.mjs`（dry-run）/ `--apply`，写前自动备份到 `~/jiazu-backups/<日期>-founder-inversion/`）。**本节实测**：`~/jiazu-backups/` 下**尚无** `founder-inversion` 目录 ⇒ **该脚本尚未跑过**（真源 md5 未变，见节末边界）。
> - **R7 与本批其它动作的关系**：该脚本写**真源**（`migrate-output/**` + 可能 `config/tree-meta.json`）⇒ 属**真源写入**，必须在**备份就位 + 授权**后执行；执行后再按 §29-3 步骤 ② ③ 走「先重传、再删旧详情键」。

#### 29-3-1 裁定追加 **v1.1**：A1 / A2 / A3（Jing · 2026-09-20 **18:35** CST · **只追加 · 不改上列各步 / 清单 / 表头**）

> **性质**：本节 v1.0（17:50 CST）之上的**三条追加裁定**（A1 / A2 / A3），**只登记口径 + 实测现状**——**未改代码、未写真源、未执行脚本**（含 dry-run）。
> **实现状态列一律为实测**；Kong 是否已跟改**以其实装 report 为准**（本轮**未收到该 report**，故不预填其结论）。

| # | 裁定（v1.1 · 逐条） | 口径 | 实测（Jing · 2026-09-20 18:35 CST） |
|---|---|---|---|
| **A1** | **宗谱侧旧详情键：默认删除** + **`--keep-source-detail` 退回** + **删除前备份副本与 md5** | ① 反转完成后，**宗谱侧原真身详情键**（`<宗谱 tree_id>:<handle>`，即上面清单**第 1 / 2 行**）**默认删除**（不再按 v1.0 的「降级为展示副本留档」处理）；② 提供 **`--keep-source-detail`** 作为**退回开关** —— 带该 flag 时**保留**该键（= 原 v1.0 行为），供留痕 / 回滚演练；③ **删除前必须先导出备份副本**（落到备份目录，并在 `summary.json` / `md5-before.txt` 记下**删除前 md5**），**无备份副本不得删**。删除属**云端动作**（`jiazu_person_details` 按 `_id`），与 §29-3 步骤 ③ 同址同序（**先重传、再删旧键**） | 脚本 `scripts/migrate-founder-inversion-2026-09.mjs` 实测：**flag 集 = `--apply` / `--json=<path>`**（`:69` `const KNOWN = new Set(['--apply'])`；`:72` 未知参数 → `exit 2`）⇒ **`--keep-source-detail` 尚未实现**；该脚本对宗谱侧详情**不产生任何删除计划**（`:407` 只**读** `clanDetailPath`；`planFile` 只落 `famDetailPath` / 宗谱树 JSON / `tree-meta`）⇒ **A1 待 Kong 落盘**（口径落本册，本册不执行） |
| **A2** | **复制档只携带「内容字段」；标识字段一律用本树节点现值** | (b) 复制出的**家族树侧始祖详情**只携带**内容字段**：`events` / `media` / `citations` / `notes` / `attributes`（含 `external_chain_gen`）等；**标识字段取本树节点现值** —— `_id` / `tree_id` / `handle` = 家族树侧落点（不变），**`gramps_id`（及其余编号类标识）= 家族树始祖节点现值**（`ji_23395_01` → **I000209** / `gu_39038_01` → **I000143**），**不得携带宗谱侧真身档的原编号**（`I000163` / `I000139`） | 脚本 `buildFamilyFounderDetail()`（注释 `:217`，函数 `:218`）实测当前 = **「只改写落点 + 其余字段原样携带」**（`:219` `const { _id, tree_id, handle, updated_at, ...body } = src;` ⇒ **`gramps_id` 仍在 `body` 内被携带**）；脚本自身即打印该差异（`:579` 逐字「携带 `gramps_id=${carriedGrampsId}`（宗谱真身档原值），本树节点 `gramps_id=${dataGrampsId}`」+ `:580` 「⚠️ 二者不同源：裁定 (b) 为「其余字段原样携带」→ 脚本按字面执行；**若要求两处一致须另行裁定**」）。**真源实测**两对编号 = 宗谱侧 `migrate-output/details/ji_23395:3c95530f8bd4f84dc0b87edc.json` **`gramps_id=I000163`** / `gu_39038:5ae4c6e505c90d290f71f66b.json` **`I000139`**；家族树侧 `ji_23395_01:10400594c54f5203f61bf4fa4b20.json` **`I000209`** / `gu_39038_01:103f95b87b5a464242933ee319d5.json` **`I000143`** ⇒ **A2 即该「另行裁定」**，**待 Kong 落盘** |
| **A3** | **`external_founder_created_by` 同批清空** | 反转批次的**同一次写入**里把该字段一并**清空**（**置空串、不删键** —— 与既有 `planFounderDetach()` 同形）；理由：它记的是**当年认祖发起人**，v2 下「家族树始祖 = 真身」、挂载关系由 `external_tree` 链表达 ⇒ 该字段语义不再成立 | 脚本 `MIRROR_FIELDS`（`:136-142`）实测**只含 5 个字段** = `external_tree` / `external_person_handle` / `external_link_type` / `external_mirror` / `external_relation_note` ⇒ **不含 `external_founder_created_by`**。**真源实测**该字段存在于反转涉及的**家族树侧始祖节点**：`migrate-output/trees/ji_23395_01.json` 始祖 `10400594c54f5203f61bf4fa4b20`（I000209 季花）、`gu_39038_01.json` 始祖 `103f95b87b5a464242933ee319d5`（I000143 顾清学），**均为 `16601061656`**（同字段亦见于 `ji_23395` / `gu_39038` / `liu_21016` / `qin_31206` 的**宗谱顶端镜像** —— 那两条链**方向不变、不在 A3 范围**）。**可复用的既有清空写法** = `lib/founder-attach.js:494` `planFounderDetach()` 内的 `external_founder_created_by: ''` ⇒ **A3 待 Kong 落盘** |

> **三条的交付形态**（登记 · 不改实现）：A1 为**脚本 flag + 云端删除步骤**、A2 为**脚本 (b) 的字段掩码**、A3 为**脚本字段清空表**；三者的**验收点**见 §29-4 新增第 15–17 条。本册**不预填**其行号 / 字面（以 Kong 实装为准）。

> **同批校正（Jing · 2026-09-20 **18:40** CST · **取代上表「实测」列**）—— **A1 / A2 / A3 均已由 Kong 落盘**（脚本 mtime 实测 **18:36:08**；上表「实测」列为 **18:35 时点快照**，其「待 Kong 落盘」结论**已作废**）：
> - **A1 ✅ 已落盘**：`scripts/migrate-founder-inversion-2026-09.mjs` 新增 flag **`--keep-source-detail`**（`:86` `const KNOWN = new Set(['--apply', '--keep-source-detail'])`、`:94` `const KEEP_SOURCE_DETAIL = flag('--keep-source-detail')`、`:80-82` 用法文本），**默认删除**源侧原真身详情（`:672` 注释 / `:702` 运行模式打印「默认删除（连带删源侧详情）」），且 **删除前先落备份副本 + md5**（`:48` / `:64` / `:674` 注释；`:821` `delDir = path.join(bakDir, 'deleted-source-details')`；`:831` 写 `md5.txt` 清单）。
> - **A2 ✅ 已落盘**：`buildFamilyFounderDetail()`（**`:268`**）改为**只携带内容字段** —— `:172` `const CARRIED_CONTENT_FIELDS = ['events', 'media', 'citations', 'notes', 'attributes'];`，且 `:270-274` 的 `_id` / `tree_id` / `handle` / **`gramps_id`** / `name` 一律**用本树节点现值**（由调用点 `:552` 传入），**不再携带宗谱侧真身档原编号**。
> - **A3 ✅ 已落盘**：新增 `:165` `const FAMILY_EXTRA_CLEAR_FIELDS = ['external_founder_created_by'];`，并入 (a) 段清空（`:523` 注释「v1.1 A3：含 `external_founder_created_by`」、`:538` 收敛路径、`:546` 幂等确认）。
> - **⚠️ 未执行**：上述均为**口径已落盘**；**脚本本轮仍未跑过**（`~/jiazu-backups/` 下无 `founder-inversion` 目录）⇒ **真源 md5 未变**（`config/tree-meta.json` = `5c8ca3aee29bd811cd7e2d4b2cbf8d05`，9,648 B；`migrate-output/**` = 318 文件）。**「先重传、再删旧键」的顺序与云端删除动作面（§29-3 步骤 ③）不变。**

### 29-4 部署后冒烟验证（**按序做**）

| # | 验证 | 期望 | 依据 |
|---|---|---|---|
| 1 | 家族树始祖节点（`ji_23395_01` / `gu_39038_01`）档案 **改名保存** | **200**（本树 steward / chief 可写；不再 403「始祖节点信息需在本姓祖谱中修改」） | **R2**（`docs/founder-attach.spec.md` §9-3） |
| 2 | 同上：保存后**详情未被清空**（称号 / 事件保留） | 详情仍在本树可读 | **R2** 第 2 条 |
| 3 | 未挂载树的始祖位**自填姓名 / 生卒** | **200**（不再返回旧字面 `空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息`） | **R2b**（§9-4） |
| 4 | 解除挂载后的始祖节点 | **不再被清成空白**；原真身数据保留 | **R2** 第 3 条 |
| 5 | 详情回读（反转后） | 新键（家族树侧）**能读回**；旧键（宗谱侧）**不存在**（§29-3 清单第 1 / 2 行） | **R7** |
| 6 | 宗谱顶端镜像节点（`ji_23395` I000162 / `gu_39038` I000138）改姓名 | **403** + 文案 `始祖节点信息需在中华世本（总谱）中修改`（**方向不变**） | **R1** / 既有 §26-5 文案 |
| 7 | 宗谱登记镜像（指向家族树始祖）改姓名 | **403** + **新文案（R3 · 逐字）**：`该节点为 <树标题> 始祖的镜像，需在 <树标题> 中修改`（函数 `familyMirrorLockMessage`，`lib/founder-attach.js:161-164`）—— **方向无关只读**（镜像指向层在**下**方时同样只读） | **R3**（§9-5 / §9-10） |
| 8 | 只改【出生地】/【居住地】（镜像态节点） | **200**（**唯一例外**，契约 v2 C6）；同请求夹带姓名 / 生卒 → **403** | **R3 例外**（C6） |
| 9 | 族谱支系入口列表 | 宗谱自有段登记镜像**按其 `external_tree` 计入**入口（R4 通用化后，非立支关系同样成立） | **R4**（§16-1） |
| 10 | 汇宗：源树始祖为**真身** | **200**（不再 400 `该家族树当前始祖不是上层镜像，无法汇宗` —— 该字面在源码中**已 0 命中**）；**真身随真实节点整体迁入**（`handle` / `gramps_id` 不变） | **R5**（§16-2 第 3 条） |
| 11 | 汇宗：源树始祖为**镜像** | **200**，镜像**丢弃**（现状不变） | **R5** |
| 12 | 立支后新树始祖 | 仍为 **N 的镜像**（同层指向、只读）；原树始祖**保持真身** | **R5** 第 1 / 2 条 |
| 13 | 世数（`external_chain_gen` 读法） | 沿 `external_*` 链**下钻真身**后取数（`resolveChainGen`，`lib/founder-attach.js:407`；调用点 `lib/tree-write.js:777`）；**人数（`person_count`）不变**；⚠️ `/tree/rank`（`index.js:549-551`）**本批未接线** | **R6**（§9-6 / §9-10(d)） |
| 14 | 「世本存宗谱始祖的镜像」反向登记展示 | 真身节点档案列出 `X 家族的始祖节点`；**真身侧无任何写入 / 无反指针** | **R1**（`listAttachedTrees` 读侧推导） |
| 15 | 宗谱侧**旧详情键**（§29-3 清单第 1 / 2 行） | **默认已删除**：`jiazu_person_details` 中该 `_id` **不存在**；加 `--keep-source-detail` 演练时**保留**，且备份副本 + 删除前 md5（`md5-before.txt` / `summary.json`）就位 | **A1**（§29-3-1） |
| 16 | 家族树侧始祖详情（反转后） | **`gramps_id` = 本树节点现值**（`ji_23395_01` → `I000209` / `gu_39038_01` → `I000143`），**不是**宗谱侧原编号（`I000163` / `I000139`）；**内容字段保留**（`events` / `notes` / `media` / `citations` / `attributes`（含 `external_chain_gen`）） | **A2**（§29-3-1） |
| 17 | 反转后的**家族树侧始祖节点** | `external_founder_created_by` = **空串**（**键仍在、值 = `''`**，同 `planFounderDetach()` 形状） | **A3**（§29-3-1） |
| 18 | **`/tree/rank` 世数**是否已接 `resolveChainGen` | **见 §29-9（A6）** —— 本节实测 = **未接**（`index.js` 本批未改）；该行**待另一个 Kong 的 report 回填**（拿不到即按 §29-9 实测结论） | **A6**（§29-9） |
| **18-追加** | **`/tree/rank` 世数**（**A6 回退后 · 唯一有效验收口径** · Jing · 2026-09-20 **19:19:00** CST 实测） | **`/tree/rank` 保持原状（不接线 `resolveChainGen`）**：`index.js` 与 **HEAD 字节相同**（md5 **`f1f40096323de98f1f2b3d9188c2bac5`**；`grep -c 'resolveChainGen' cloudfunctions/compat-api/index.js` = **0**；`/tree/rank` 段 `:543`–`:552` 仍是「**只读本树详情**」原循环 `:549-551`）+ **4 棵祖谱 `GET /tree/rank` 读数 = 世数 `2 / 2 / 37 / 4`（gu_39038 / ji_23395 / liu_21016 / qin_31206）且 `over_limit` 全 = `false`**（`explicit` = `false / false / true / false`；`rank_key` = `family_rank / family_rank / lineage_rank / family_rank`）。⚠️ `liu_21016` 的 `explicit=true` 属其**自身 details 本就带 `external_chain_gen`**（实测 54 个 details 文件中 **34** 个带该属性）的**既有行为**，**与本批无关** | **A6 / 裁定 D1**（§29-9 v1.2 块） |

> **§29-4 第 18 条的行内标注（Jing · 2026-09-20 **19:19** CST · 只追加 · 原行逐字保留）**：第 **18** 条原行「**未接**（`index.js` 本批未改）+ **待另一个 Kong 的 report 回填**」的**前半已随裁定 D1 恢复有效**（`/tree/rank` 确为未接线），**后半「待 report 回填」已作废**（不需外部报告：实装「接线 → 回退」两态均已落盘并实测复核）⇒ **验收一律以本表「18-追加」行为准**。


> **逐字文案（既有常量 · 部署后必须逐字匹配）**：`始祖节点信息需在中华世本（总谱）中修改`（`lib/founder-attach.js:54`）· `始祖节点信息需在本姓祖谱中修改`（`:56`）· `该节点为上层（中华世本）镜像，需到总谱修改`（`:58`）· **新字面（R2b · 逐字）** `该节点为孤儿镜像（真身不可达）：请先解除登记后在本树重建始祖信息`（`:63`）· **新字面（R3 · 逐字 · 模板）** `该节点为 <树标题> 始祖的镜像，需在 <树标题> 中修改`（`:163`）。⚠️ **旧字面 `空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息` 已随 R2b 作废**（源码 `grep` 实测 0 命中，`cloudfunctions/compat-api/**` 与 `frontend/src/**` 均为 0）—— **不得**再作为部署验收字面。

### 29-5 本批**不需要**上云的东西

| 项 | 原因 |
|---|---|
| CloudBase 集合 / 索引 | **无 schema 变更**（复用既有集合；无新增上传项） |
| `docs/*.qa.md` | 历史质检证据，**不得回改**、不上云 |
| `scripts/*` 一次性修复 / 迁移脚本 | 本册惯例：脚本不上云（§6 / §12-7 同口径） |
| 测试文件 / `npm test` | **只影响本地**（§14-4：`npm test` 跑 `/tmp` 副本，与云端数据无关） |
| `config/geo-divisions.json` 类静态数据 | 已被 esbuild 内联（§26-6 同口径） |

### 29-6 阻塞点

> **本轮校正（Jing · 2026-09-20 18:35 CST）**：第 1 条由「`npm test` 为红的阻塞登记」**改为明确的前置条件** —— **`npm test` 全绿 = 本批交付门槛**（不是「等问题消失」，而是「不达标不许进下一步」）。其余各行**原文保留**。

| # | 阻塞 | 影响 | 解除条件 |
|---|---|---|---|
| 1 | **前置条件（交付门槛 · **不是**阻塞登记）：`npm test` **必须全绿**，未全绿**一律不得**打包 / 部署 / 重传，工作区保持冻结** | 当前实测（**2026-09-20 18:22:53 CST** · Jing 本轮校正复测）：`454 tests / 447 pass / 7 fail / 0 skipped`（**exit 1**）⇒ **门槛未达**。红项 = `not ok 42` `52` `228` `229` `230` `234` `236`（**归另一个 Kong 收尾**：测试端尚未跟改本批新口径，如 `52` 断言的正是 R5 放宽掉的旧文案）。**旧表述「本批实现已在工作区（未提交）· 但 `npm test` 为红」原文保留**（同一事实） | **Kong 交付终态 + `npm test` 全绿（以实测回填，不得推算）** + 冻结工作区 + 本册**追加一行**登记全绿读数（**全绿前不得写成绿**） |
| 1-追加 | **门槛达成（Jing · 2026-09-20 **18:38:20** CST 实测 · **取代上行「门槛未达」**）** | `cd /Users/kevin/bistro/jiazu && npm test` → **454 tests / 454 pass / 0 fail / 0 skipped**（**exit 0** = **全绿**）⇒ **第 1 条的门槛已达成**；转绿 = Kong 于 **18:31–18:36** 落盘测试端跟改（`lib/founder-attach.test.js` `127 +` / `57 -`、`lib/branch-clan-ops.test.js` `26 +` / `19 -`、`lib/founder-reattach.test.js` `18 +` / `9 -`） | **仍需**：在**冻结时点**再跑一次终校并把读数追加到本册（**代码仍在动 ⇒ 达标状态须随冻结复核**） |
| **1-追加2** | **门槛复测（Jing · 2026-09-20 **19:18:14–19:18:17** CST 实测 · **取代上两行的 454 基数**）** | `cd /Users/kevin/bistro/jiazu && npm test` → **464 tests / 464 pass / 0 fail / 0 skipped**（TAP 逐字 `1..464` / `# tests 464` / `# pass 464` / `# fail 0` / `# skipped 0`，**exit 0** = **全绿**）⇒ **第 1 条门槛仍达标**（分母由 454 增至 464）。增量成因 = **专测文件 `lib/founder-source-reversal.test.js` 落地并注册**（44,276 B，mtime **19:04**；`scripts.test` 注册数 **28** = 磁盘 `lib/*.test.js` **28**）⇒ **+10 tests** | **仍需**：**A6 回退（裁定 D1）后**的同批冻结终校（见 **§29-9 v1.2 块**）；**以冻结时点的最终一次实测为准** |
| 2 | **云函数未重打包**（产物 md5 仍 `d61a8aebfb3f3095baae4e1e731fd675`，`personEditLockMessage` / `residence_places` 产物侧 **0**） | 线上仍是旧口径（含 §26 的 F3 / F5） | 执行打包 + 部署授权 |
| 3 | **前端产物早于本批**（H5 `13:20` / mp `13:21`） | 前端只读态 / 只读文案分支到不了线上 | 重打 + hosting / 上传 |
| 4 | **`tree-meta` 无乐观锁、可被整份回写**（§28-0 事件 K，机制 `lib/store.js` 的 `metaCache`） | 上传 / 联调 / 页面实操期间可能**抹掉**刚做的元数据改动 | **先重启全部 local-server 实例**（§28-2 第 5 条仍是必需项） |
| 5 | **R7 存量反转 = 真源写入** | 必须**先备份 + 登记前后 md5**；顺序错（先删后传）会造成详情空窗 | 备份就位 + 按 §29-3 顺序 + 部署授权 |

> **§29-6 与 A6 的关系（Jing · 2026-09-20 **19:19** CST · 只登记）**：本节**原表各行均未引用 A6 / `resolveChainGen` 接线**（实测：本节区段的 `A6` 命中 **0** 处）⇒ **无「A6 接线」表述需要更正**；A6 回退**不改变本节第 1–5 条的阻塞面**（唯一牵连项 = 上行 `1-追加2` 的读数刷新）。

### 29-7 跨册登记（本节与规格册的对应）

| 裁定 | 规格册位置 | 本节 |
|---|---|---|
| R1 单一真源 / 反向登记不建节点 | `docs/founder-attach.spec.md` §9-2 | §29-4 第 6 / 14 条 |
| R2 家族树始祖 = 真身可写 | 同上 §9-3 | §29-4 第 1 / 2 / 4 条 |
| R2b 取消空白占位锁 | 同上 §9-4 | §29-4 第 3 条 |
| R3 只读不变量统一（+ C6 例外） | 同上 §9-5 | §29-4 第 7 / 8 条 |
| R4 宗谱登记镜像通用化 | `docs/branch-clan-ops.spec.md` §16-1 · `docs/clan-tree.spec.md` §11-3 | §29-4 第 9 条 |
| R5 立支 / 汇宗连带 | `docs/branch-clan-ops.spec.md` §16-2 | §29-4 第 10–12 条 |
| R6 世数下钻真身 | `docs/founder-attach.spec.md` §9-6 | §29-4 第 13 条 |
| R7 存量季 / 顾两条链就地反转 | `docs/branch-clan-ops.spec.md` §16-3 | §29-3 清单 + §29-4 第 5 条 |
| R8 只做本地阶段 | `AGENTS.md` §0 / §8 | **本节即该条的产物**（动作面只登记，不在其它任务里顺手部署） |
| **A1** 宗谱侧旧详情键默认删除 + `--keep-source-detail` 退回 + 删除前备份副本与 md5 | §29-3-1（v1.1 追加） | §29-4 第 15 条 |
| **A2** 复制档只携带内容字段 / 标识字段用本树节点现值 | §29-3-1（v1.1 追加） | §29-4 第 16 条 |
| **A3** `external_founder_created_by` 同批清空 | §29-3-1（v1.1 追加） | §29-4 第 17 条 |
| **A6** `/tree/rank` 世数是否已接 `resolveChainGen` | **§29-9（v1.1 追加；实测结论 = 未接）** | §29-4 第 18 条 |
| **A6-追加**（**A6 回退 · 裁定 D1 · 唯一有效行**）`/tree/rank` 世数**不接线** `resolveChainGen`（保持原状） | **§29-9（v1.2 追加；实测结论 = **已评估并回退 / 未接线**）** | **§29-4 第 18-追加 条**（读数 2 / 2 / 37 / 4，`over_limit` 全 false） |

> **上表 A6 原行的处置（Jing · 2026-09-20 **19:19** CST · 只追加 · 原行逐字保留）**：A6 原行「实测结论 = **未接**」**经裁定 D1 后恢复有效**（`/tree/rank` 仍未接线），但该行**未登记回退事实与回退后读数** ⇒ **以「A6-追加」行为准**；`§29-9` 的 v1.1「同批校正（已接线）」块**已作废**，**取代者 = §29-9「v1.2 裁定 D1 校正」块**。**R6 唯一保留落点 = `lib/tree-write.js` `clanSelfGenMap`（`:772` / `:781`，19:19 实测）**。

### 29-8 复现命令（**只读 · 不触发部署**）

```bash
cd /Users/kevin/bistro/jiazu
wc -c < cloudfunctions/deploy/compat-api/index.js; md5 -q cloudfunctions/deploy/compat-api/index.js   # 未重打包铁证
for s in personEditLockMessage residence_places; do printf '%s: ' "$s"; grep -c "$s" cloudfunctions/deploy/compat-api/index.js; done
ls -ld frontend/dist/build/h5 frontend/dist/build/mp-weixin
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json
ls -l migrate-output/details/ji_23395:3c95530f8bd4f84dc0b87edc.json migrate-output/details/gu_39038:5ae4c6e505c90d290f71f66b.json
npm test 2>&1 | tail -8        # 本节复测：454 tests / 447 pass / 7 fail（exit 1）；同日 17:44 为 454 / 454 / 0
ps aux | grep -E 'local-server\.js' | grep -v grep     # 上传 / 联调前必须重启全部实例（§28-2 第 5 条）
```

> **v1.2 读数刷新（Jing · 2026-09-20 **19:18:14–19:18:17** CST 实测 · 取代上列 `npm test` 注释中的 454 / 447 / 7）**：`npm test 2>&1 | tail -8` → **464 tests / 464 pass / 0 fail / 0 skipped**（`1..464` / `# pass 464` / `# fail 0`，**exit 0**）。

**A1 / A2 / A3 / A6 只读复核命令（v1.1 追加 · **只读 · 不触发任何写入 / 部署**）**

```bash
cd /Users/kevin/bistro/jiazu
# A1：脚本当前 flag 集（--keep-source-detail 是否已实现 ⇒ 实测未实现）
grep -n "KNOWN = new Set\|未知参数" scripts/migrate-founder-inversion-2026-09.mjs
# A1：宗谱侧详情是否被计划删除（实测：只读、不 planFile）
grep -n "clanDetailPath\|famDetailPath\|planFile(" scripts/migrate-founder-inversion-2026-09.mjs
# A2：复制档字段面（实测 :219 原样携带 body ⇒ gramps_id 来自宗谱真身档）
sed -n '217,230p' scripts/migrate-founder-inversion-2026-09.mjs
grep -o '"gramps_id": "[^"]*"' migrate-output/details/ji_23395:3c95530f8bd4f84dc0b87edc.json   # I000163
grep -o '"gramps_id": "[^"]*"' migrate-output/details/ji_23395_01:10400594c54f5203f61bf4fa4b20.json  # I000209
# A3：清空表的字段集合（实测 5 个，不含 external_founder_created_by）
grep -n -A6 "const MIRROR_FIELDS" scripts/migrate-founder-inversion-2026-09.mjs
python3 -c "import json;t=json.load(open('migrate-output/trees/ji_23395_01.json'))['people']['10400594c54f5203f61bf4fa4b20'];print('efcb=',repr(t.get('external_founder_created_by')))"
# A6：/tree/rank 是否接 resolveChainGen（实测 0 命中）+ index.js 本批未改
grep -c "resolveChainGen" cloudfunctions/compat-api/index.js
sed -n '543,551p' cloudfunctions/compat-api/index.js
stat -f '%Sm %N' -t '%Y-%m-%d %H:%M:%S' cloudfunctions/compat-api/index.js
npm test 2>&1 | tail -8        # v1.1 复测（18:22:53 CST）：454 tests / 447 pass / 7 fail（exit 1）
```

> **v1.2 追加复核命令（Jing · 2026-09-20 **19:19** CST 实测 · **只读 · 不触发写入 / 部署**）**
>
> ```bash
> cd /Users/kevin/bistro/jiazu
> # A6 回退：与 HEAD 字节相同（md5 f1f40096323de98f1f2b3d9188c2bac5）+ 无接线命中
> git diff --numstat -- cloudfunctions/compat-api/index.js      # 实测：空
> md5 -q cloudfunctions/compat-api/index.js                      # f1f40096323de98f1f2b3d9188c2bac5
> grep -c "resolveChainGen" cloudfunctions/compat-api/index.js   # 实测 0
> sed -n '543,552p' cloudfunctions/compat-api/index.js           # 原「只读本树详情」循环（:549-551）
> # R6 唯一落点保留
> grep -n "clanSelfGenMap\|resolveChainGen" cloudfunctions/compat-api/lib/tree-write.js   # :772 / :781
> # 4 棵祖谱读数（COMPAT_OUT_DIR 指向 /tmp 副本 ⇒ 真源零写入）
> npm test 2>&1 | tail -8        # v1.2 复测（19:18:14 CST）：464 tests / 464 pass / 0 fail（exit 0）
> ```

### 29-9 裁定追加 **v1.1**（第 4 条）：**A6 —— `/tree/rank` 世数是否已接 `resolveChainGen`**（Jing · 2026-09-20 **18:35** CST · **只登记**）

| 项 | 结论 / 实测 |
|---|---|
| **A6 问题** | `/tree/rank` 的世数 Map 是否已改走 **R6 的 `resolveChainGen`**（沿 `external_*` 链下钻真身后取数）？ |
| **实测结论（Jing · 2026-09-20 18:35 CST · 三条独立证据）** | **未接（尚未接线）**：① `grep -c 'resolveChainGen' cloudfunctions/compat-api/index.js` = **0**；② `index.js:543-551` 的 `/tree/rank` 段实测 = `const details = await getAllDetails(treeId)` → `d.attributes?.find((a) => a.key === 'external_chain_gen')` ⇒ **只读本树详情**；③ `cloudfunctions/compat-api/index.js` **本批未改**（`git status --short` 无该文件；mtime 实测 **2026-09-20 11:57:58**，早于本批落盘 17:51–17:56） |
| **口径影响（登记 · 不代判）** | 现状读法对「始祖真身在**本树**」的家族树**不构成问题**（其始祖详情本就在本树）；对**镜像态节点**（宗谱登记镜像 / 顶端镜像 / chain 镜像 —— 真身在别树）**仍读本层详情** ⇒ **与 R6「沿链下钻真身」的新口径不一致** = **已知未接线项**（同址登记见 `docs/founder-attach.spec.md` §9-10 (a) 表末行 / (d)）。**是否同改 / 如何改由 Kong 判定**，本册**不预设实现细节** |
| **另一个 Kong 的报告** | **未获取到**（本轮只做文档校正，**未收到其实装 report**；仓内亦无 report 文件）⇒ **不臆断其结论**。**待回填**：若其报告给出「已接 / 已改 `index.js`」的结论、或给出不同的行号 / 字面，**以该报告为准并回填本表**（本节**不预填**） |
| **部署判据影响** | **无新增产物判据** —— `resolveChainGen` 的判据串已列在 §29-1-1 **第 8 行**（源码侧 ≥1 / 产物侧期望 ≥1）；A6 只登记「接线与否」这一事实，**不改变 §29-1 的表与读数** |

> **同批校正（Jing · 2026-09-20 **18:40** CST · **取代上表「实测结论」行与「另一个 Kong 的报告」行**）—— **A6 已由 Kong 接线落盘**：
> - `cloudfunctions/compat-api/index.js` 本批**已改**（`git diff --numstat` = **`9 +` / `0 -`**；mtime 实测 **2026-09-20 18:34:15**）。
> - `/tree/rank` 段（`:543` 起）实测新增镜像下钻循环 —— **逐字**：`:557` `for (const [handle, person] of Object.entries(tree.people || {})) {` → `:558` `if (gens.has(handle) || !fa.isMirrorMarked(person)) continue;` → **`:559` `const drilled = await fa.resolveChainGen({ treeId, handle });`** → `:560` `if (drilled.gen !== null) gens.set(handle, drilled.gen);`；前置注释 `:552-556` 逐字含「R6 世数（裁定追加 v1.1 · A6）：与 `lib/tree-write.js` 的 `clanSelfGenMap` / 认祖（`attachFounder`）**同一读侧口径**」+「链断 / 真身无该属性 → 不落表（**沿用既有结构推导**，绝不猜一个世数）」。
> - ⇒ **§29-4 第 18 条的验收期望 = **已接线**（`/tree/rank` 的世数 Map 对镜像节点沿链下钻真身取数）**；上表 18:35 的「**未接**」结论与「报告未获取到 / **待回填**」两项**均已作废**（同一批实装本身即证据，**不再需要外部 report 回填**）。
> - **仍待办（不因 A6 接线而消失）**：产物**未重打包** ⇒ 该接线**到不了线上**（判据见 §29-1 / §29-1-1 第 8 行产物侧期望 ≥1）。

> **本节边界**：只写文档 —— **未改代码、未写真源**（`config/tree-meta.json` 本节**前 = 后 = `5c8ca3aee29bd811cd7e2d4b2cbf8d05`**；`migrate-output/**` 聚合**前 = 后 = `55f0b1d32ae7f587f9d94eec61df4ba6`**，318 文件）、**未执行任何部署 / 打包 / 重传 / 迁移 / 提交**；§25-0～§28-4 历史行**原文保留**。
> **未采纳声明**：§27 的部署前守卫建议**仍未采纳**；本节的判据 B / 冒烟新增文案**均为待回填位**，**不得**据此认为门槛已生效。**裁定权属 Kevin / Zang**。
> **跨册登记**：口径全文见 `docs/founder-attach.spec.md` **§9** / `docs/clan-tree.spec.md` **§11** / `docs/branch-clan-ops.spec.md` **§16**；本节**不重述**其数值，只登记动作面与判据。
> **v1.1 校正边界（Jing · 2026-09-20 18:35 CST · **只追加**）**：本轮回写只改 `docs/**` 与 `AGENTS.md`（**未改代码、未写真源** —— `config/tree-meta.json` md5 **校正前 = 校正后 = `5c8ca3aee29bd811cd7e2d4b2cbf8d05`**（9,648 B）、`migrate-output/**` 文件数 = **318 不变**）；**未执行任何部署 / 打包 / 重传 / 迁移脚本（含 dry-run）/ 提交**；**历史行一律原文保留**（新口径 = 追加行 + 「已作废 / 已取代」标注）。**A1 / A2 / A3 / A6 均为待 Kong 落盘的口径登记，本册不代实现、不代跑。**
> **上条两点已作废（Jing · 2026-09-20 **18:58** CST · 追加）**：① 「`migrate-output/**` 文件数 = **318 不变**」→ 实测 **319**（成因 = **进程外运行时写入**，见本节头部「真源侧进程外写入」行；**本文档校正自身零写入真源**：`config/tree-meta.json` md5 与 mtime 均未变）；② 「**A1 / A2 / A3 / A6 均为待 Kong 落盘**」→ **四项均已由 Kong 落盘**（A1/A2/A3 = 脚本 mtime **18:36:08**，见 §29-3-1「同批校正」；A6 = `index.js` mtime **18:34:15**，见 §29-9「同批校正」）。**仍未执行者** = 部署 / 打包 / 重传 / 迁移脚本真跑 / 提交（**本节四项动作面判据不变**）。

> **⭐⭐ v1.2 裁定 D1 校正（Jing 制度员 · 2026-09-20 **19:19:00** CST 逐项实测 · 只追加 · **取代** §29-9 的「同批校正（18:40 CST · A6 已由 Kong 接线落盘）」**整块**、`§29-7` 的 A6 行口径、以及 `§29-4` 第 18 条的接线期望）**
>
> **裁定 D1（结论）**：**A6 = 已评估并回退**（`/tree/rank` **保持原状、不接线** `resolveChainGen`）。
>
> | 项 | 实测（Jing · 2026-09-20 19:19 CST） |
> |---|---|
> | **被取代的旧行（18:40 块首句 · 原文保留 · **已作废 / 已取代**）** | 「**同批校正（Jing · 2026-09-20 **18:40** CST · **取代上表「实测结论」行与「另一个 Kong 的报告」行**）—— **A6 已由 Kong 接线落盘**」／其下「`/tree/rank` 段（`:543` 起）实测新增镜像下钻循环 … `:559` `const drilled = await fa.resolveChainGen({ treeId, handle });` …」与「**§29-4 第 18 条的验收期望 = 已接线**」= **整块作废** |
> | **回退证据 ①（字节 · 铁证）** | `cloudfunctions/compat-api/index.js` 与 **HEAD 字节相同** —— md5 = **`f1f40096323de98f1f2b3d9188c2bac5`**；`git diff --numstat -- cloudfunctions/compat-api/index.js` = **空**；`git status --short` **不再列出该文件**（实测 **19:19:00** CST） |
> | **回退证据 ②（源码）** | `grep -c 'resolveChainGen' cloudfunctions/compat-api/index.js` = **0**；`/tree/rank` 段实测逐行 = `:543` 路由 → `:547` `const gens = new Map();` → `:548` `const details = await getAllDetails(treeId);` → **`:549-551` 原「只读本树详情」循环**（`:550` `d.attributes?.find((a) => a.key === 'external_chain_gen')`）⇒ 18:40 块所述的 **`:552-556` 注释与 `:557-561` 镜像下钻循环已不存在**（现 `:556-559` 为 `person_count` 口径注释） |
> | **回退证据 ③（行为）** | 4 棵祖谱 `GET /tree/rank` 前后对照 —— 见下一表 |
> | **R6 唯一落点（**保留 · 未随回退移除**）** | `lib/tree-write.js` **`clanSelfGenMap` = `:772`**（定义）/ **`:781`** `const drilled = await resolveChainGen({ treeId, handle });`（调用点）—— 19:19 实测 |
>
> **4 棵祖谱 `GET /tree/rank` 读数（Jing · 2026-09-20 **19:19:00–19:19:06** CST 实测）**
>
> | 树 | 接线时（裁定 D1 登记值 · 端口 **3455** 实测） | **回退后（本次实测 · 复核值）** |
> |---|---|---|
> | `gu_39038` | total **78** / `over_limit` **true** / `explicit` **true** | **2 / false / false** |
> | `ji_23395` | 90 / true / true | **2 / false / false** |
> | `liu_21016` | 76 / true / true | **37 / false / true** |
> | `qin_31206` | 78 / true / true | **4 / false / false** |
>
> - **本次复核口径（可复现 · **真源零写入**）**：以 `handleRequest` **进程内**调 `GET /tree/rank`（`COMPAT_SOURCE=local`），`COMPAT_OUT_DIR` = `migrate-output/**` 的 `/tmp` **逐字节副本**、`COMPAT_META_FILE` = `config/tree-meta.json` 的 `/tmp` 副本（同本仓测试纪律）；请求头 `X-Tree-Id: <tree>`。⇒ **与 D1 表（自起非占用端口 3455）逐项一致**。**实测期间真源 md5 前后同值** = `config/tree-meta.json` **`5c8ca3aee29bd811cd7e2d4b2cbf8d05`**（9,648 B）**未变**；`index.js` md5 亦同值。
> - **`rank_key` 同步回落（实测）**：`gu_39038` / `ji_23395` / `qin_31206` = **`family_rank`**、`liu_21016` = **`lineage_rank`**。
> - ⚠️ **`liu_21016` 回退后 `explicit=true` 非本次引入**：其**自身 details 本就有 `external_chain_gen`**（实测 `migrate-output/details/liu_21016*` 共 **54** 个文件、其中 **34** 个带该属性，值域 4–37）⇒ 属**既有行为**，**与本批 / A6 无关**。
>
> **裁定理由（D1 · 逐条）**：① **副作用超出预期** —— 接线后 4 棵祖谱 `over_limit` **全部由 `false` 翻 `true`**、`rank_key` **跳级**；而 A6 的**目标场景**（家族树侧真身始祖带的是**无镜像标记**的登记指针）**无观测量** ⇒ 无法用现有读数证明收益，风险却已实测显现；② 故**按 A6 原文的除外条款回退**（「链断 / 真身无该属性 → 不落表，绝不猜一个世数」——只读本层天然满足该条款）；③ **R6 的唯一落点保留** = `lib/tree-write.js` `clanSelfGenMap`（`:772` / `:781`）。
>
> **对 §29-9 上表（18:35 表）的处置**：该表「**实测结论**」行的 ①②（`grep -c` = 0、只读本树详情）**经 D1 后恢复有效**；其 ③ 的 mtime `11:57:58` 与「本批未改」措辞**已陈旧**（现状 = **与 HEAD 字节相同**）。该表「**另一个 Kong 的报告**」行的「**待回填**」**已作废** —— **不需要外部报告**（实装「接线 → 回退」两态均已落盘并实测复核）。
> **部署判据影响（不变）**：**无新增产物判据** —— `resolveChainGen` 的判据串仍按 §29-1-1 **第 8 行**（源码侧 ≥1 / 产物侧期望 ≥1）登记；**A6 回退只登记事实，不改变 §29-1 的表与读数**（产物仍未重打包，md5 仍 `d61a8aebfb3f3095baae4e1e731fd675`）。
> **本节（§29）动作面（不变）**：**重打包 / 重打前端 H5+小程序 / 重传树 JSON / 存量季·顾两条链就地反转** 四项判据**均不因 A6 回退而改变**（§29-0 / §29-6 同址）。
> **本轮（v1.2）文档侧写入账（Jing · 2026-09-20 **19:19–19:24** CST 实测）**：只改 `docs/**`（`docs/PENDING_DEPLOY.md` · `docs/clan-tree.spec.md` · `docs/branch-clan-ops.spec.md` · `docs/founder-attach.spec.md`）；**真源零写入** —— `config/tree-meta.json` md5 **校正前 = 校正后 = `5c8ca3aee29bd811cd7e2d4b2cbf8d05`**（9,648 B，mtime **2026-09-20 13:36:13** 未变）、`migrate-output/**` **文件数 = 319 不变**；**未改代码、未执行部署 / 打包 / 重传 / 迁移脚本（含 dry-run）/ 提交**；**历史行一律原文保留**（新口径 = 追加行 + 「已作废 / 已取代」标注）。
> **AGENTS.md 状态（只登记 —— Jing **不得**写）**：其逐字待写入文本**已备**，写入**被 protected-file 审批两次拦下**（**非本轮校正之责**）⇒ **待 Kevin 批准后由 Zang 在前台一次批量写入**；`git status --short AGENTS.md` 的 `6 +` / `0 -` 为**先前既存改动**，**非本轮**（本轮未尝试写该文件）。

---

### 29-10 **R7 真源迁移「已执行」登记**（Jing 制度员 · 2026-09-20 **21:31–21:36** CST **现盘实测** · **只追加 · 只标注取代 · 不重写历史行**）

> **取代标注（历史行一律原文保留）**：本块**取代**下列各行「**脚本尚未跑过 / 真源 md5 未变 / 319 不变**」的结论 —— §29-3 末两条（「`~/jiazu-backups/` 下**尚无** `founder-inversion` 目录 ⇒ **该脚本尚未跑过**」）、§29-3-1 末条 ⚠️（「**未执行**：…**脚本本轮仍未跑过**…`migrate-output/**` = 318 文件」）、§29-9 头部「本节边界」（`config/tree-meta.json` **前 = 后 = `5c8ca3aee29bd811cd7e2d4b2cbf8d05`**、`migrate-output/**` 文件数 = **319 不变**）、§29-9「v1.2 裁定 D1 校正」末行「**真源零写入** … **文件数 = 319 不变**」。**这些读数均为 R7 写入前（21:31 前）的快照**；R7 写入后的现值见下表（数值一律以**本节现盘实测**为准）。

**（a）执行命令与存证（实测）**

| 项 | 值 |
|---|---|
| 命令 | `node scripts/migrate-founder-inversion-2026-09.mjs --apply`（另带 `--json=/tmp/r7-apply-summary.json`） |
| 脚本状态 | `scripts/migrate-founder-inversion-2026-09.mjs` = **未入库**（`git status` = `??`） |
| 模式 | `--apply`（写盘）· A1 源侧详情 = **默认删除**（连带删源侧详情） |
| 执行时间 | `summary.json` 的 `at` = **2026-09-20T13:31:28.207Z** = **21:31:28 CST** |
| 真源根 | 树 `migrate-output/trees` · 详情 `migrate-output/details` · meta `config/tree-meta.json`（`summary.json` 的 `targets` 实测 `is_copy=false` / `is_meta_copy=false` ⇒ **确为真源、非副本演练**） |
| stdout 存证 | 首次 `--apply` = `/tmp/r7-apply.txt`（**13,193 B**）· 幂等二次 `--apply` = `/tmp/r7-apply2.txt`（**4,011 B**）· 写前基线 `/tmp/r7-before.txt`（**11,494 B**，记 **319** 文件）/ 写后 `/tmp/r7-after.txt`（**309 B**，记 **317** 文件） |
| 汇总 | `/Users/kevin/jiazu-backups/2026-09-20-founder-inversion/summary.json`（**15,563 B**） |

**（b）7 改（前 → 后 md5 · 后值 = 本节现盘复取）**

| # | 文件 | 前 md5（备份副本 / `/tmp/r7-before.txt`） | **后 md5（本节实测）** | 前 B → 后 B | 脚本自校验 |
|---|---|---|---|---|---|
| 1 | `config/tree-meta.json`（meta） | `5c8ca3aee29bd811cd7e2d4b2cbf8d05` | **`13616a89db2782256c3f33260aa32470`** | 9,648 → 9,814 | ✅ 与预算同值 |
| 2 | `migrate-output/trees/ji_23395_01.json` | `c60f5f87d9a9d3b90f1536b77bdddb76` | **`9af25c1b7a7811cad536b128fe268ab2`** | 47,657 → 47,585 | ✅ |
| 3 | `migrate-output/trees/ji_23395.json` | `30404dc54f06bfaefd709ce45997363b` | **`ba4124c36fd4672b3d94fb16b3102028`** | 1,848 → 2,009 | ✅ |
| 4 | `migrate-output/trees/gu_39038_01.json` | `2a29eae5db70be88c2f0476f4e696dfa` | **`91af5cb06d8715274e7d0c8abef55f4c`** | 18,100 → 18,025 | ✅ |
| 5 | `migrate-output/trees/gu_39038.json` | `e10c60334c76206cbad4fc8a23cfcc06` | **`1efbffeefc0136aaf59f372e3579a279`** | 1,834 → 1,992 | ✅ |
| 6 | `migrate-output/details/ji_23395_01:10400594c54f5203f61bf4fa4b20.json` | `0334905b03b135eaefde3b21ddae24cf` | **`f0153ea08aa568f867d4fd96c4f52512`** | 333 → 333 | ✅ |
| 7 | `migrate-output/details/gu_39038_01:103f95b87b5a464242933ee319d5.json` | `8369addfa752bce0393a2b95ba7fa9b6` | **`81e7c545c89cbe0c92e958e735ed58a1`** | 336 → 336 | ✅ |

> - 与 Kong 流转值的一致性：7 行**逐行相符**（含此前流转中写作 `1efbff4e…` 的第 5 行 —— **完整值 = `1efbffeefc0136aaf59f372e3579a279`**，本节以此为准）。
> - 第 6 / 7 行**字节数不变**（实测 333 B / 336 B 前后同值）：内容相等，仅刷新 `updated_at`（脚本 `reason` 逐字「迁移轮刷新 `updated_at`（内容已等于 A2 目标）」）⇒ **md5 变、字节数不变**。

**（c）2 删（A1 · 源侧旧详情键 · 删前先备份）**

| # | 被删键（宗谱侧原真身详情） | 删除前 md5 | 备份副本 md5（本节复取） | 现盘 |
|---|---|---|---|---|
| 1 | `migrate-output/details/ji_23395:3c95530f8bd4f84dc0b87edc.json`（季花，273 B） | `6eef4a753ba55a8d7e78fe40bfef5cd1` | **`6eef4a753ba55a8d7e78fe40bfef5cd1`**（一致） | **不存在**（实测 `ABSENT`） |
| 2 | `migrate-output/details/gu_39038:5ae4c6e505c90d290f71f66b.json`（顾清学，276 B） | `66938016d817ce8b12f02686a7323dba` | **`66938016d817ce8b12f02686a7323dba`**（一致） | **不存在**（实测 `ABSENT`） |

**（d）幂等（二次 `--apply` · 实测逐字）**

> `合计：2 条链 / 改动项 0 / 复核失败链 0 / 待写文件 0 / 待删文件 0` ＋ `✅ 无需写入、无需删除（两条链均已就位：真身在本树 + 源侧详情已按 A1 清理）—— 全部文件一个字节不改。`
> 两条链状态均 = **已反转**（`kept-existing` / 幂等确认 6 项 ✅）；**清单 diff 为空**（二次运行未产生任何写入 / 删除项）⇒ 二次运行后真源 md5 与上表 (b) **同值**（本节实测复取）。

**（e）备份内容与回滚命令（9 条）**

| 备份路径 | 内容（实测） |
|---|---|
| `/Users/kevin/jiazu-backups/2026-09-20-founder-inversion/config/tree-meta.json` | 改前副本（**9,648 B**） |
| `…/migrate-output/trees/` | 改前副本 4 个（`ji_23395_01.json` 47,657 B · `ji_23395.json` 1,848 B · `gu_39038_01.json` 18,100 B · `gu_39038.json` 1,834 B） |
| `…/migrate-output/details/` | 改前副本 2 个（`ji_23395_01:10400594…` 333 B · `gu_39038_01:103f95b8…` 336 B） |
| `…/md5-before.txt` | **544 B**（7 个改前 md5 逐行） |
| `…/summary.json` | **15,563 B**（含 `md5.files[]` 的 `before` / `after_expected` / `after_actual`、`deleted_source_details[]`、两条链的 `changes[]` / `observed`） |
| `…/deleted-source-details/` | 被删的 2 个源侧详情副本（273 B / 276 B）＋ `md5.txt`（**416 B**） |

> **回滚命令 = 9 条（7 恢复 + 2 复删/复现）** —— 由脚本 stdout 一次性打印（存证 `/tmp/r7-apply.txt` 末段「回滚（逐条）：」）：7 条 `cp <备份副本> <真源路径>`；2 条 `cp <deleted-source-details/键.json> <migrate-output/details/键.json>   # 恢复被删的源侧详情`。⚠️ **备份目录内不含任何 `.sh` 回滚脚本**（本节实测 `find` 无 `*rollback*` / `*.sh`）⇒ **命令文本以 `/tmp/r7-apply.txt` 与本节为准**（会话间易失，务请一并留档）。

**（f）文件数：`migrate-output/**` = 319 → 317**

> 实测 `find migrate-output -type f | wc -l` = **317**（写前基线 `/tmp/r7-before.txt` = **319**；净减 = A1 删除 2 个源侧详情）。**取代** §29-3-1 末条与 §29-9 各处的「318 / 319 不变」读数。

**（g）⚠️ `config/tree-meta.json` 是「被 Git 跟踪」的真源文件（与 `migrate-output/**` 不同）**

| 项 | 实测 |
|---|---|
| 忽略规则 | `.gitignore` **第 12 行** = `migrate-output/` ⇒ **树 JSON / 详情不可见**；`config/tree-meta.json` **不在忽略之列 = tracked** |
| `git status` | ` M config/tree-meta.json`（R7 写入**会出现在待提交清单里**） |
| `git diff --numstat` | **`4 0`**（**0 删除行**，2 个 hunk：`@@ -9,6 +9,8 @@` 与 `@@ -29,6 +31,8 @@`，两棵家族树各 `+2` 行 = `clan_tree_id` / `clan_handle`） |
| 行数 / 字节 | **276 → 280 行**；**9,648 → 9,814 B** |
| 与 HEAD 比对 | `git show HEAD:config/tree-meta.json` 的 md5 = **`5c8ca3aee29bd811cd7e2d4b2cbf8d05`** = **迁移前值** ⇒ 该 diff **恰为 R7 的 4 行插入**，无其它夹带 |
| 流转值校正 | 此前流转的「**前 24 行 / 后 25 行**」**未能在现盘复现**（实测 = 276 / 280 行、numstat = `4 0`）⇒ **以本节实测为准** |

> **处置要求**：`config/tree-meta.json` 的这 4 行为**真源数据变更**，提交 / 审阅时必须与本批代码一并评估（**本册不执行提交** —— 登记事实而已）。

**（h）云端动作清单「回填」（§29-3 步骤 ②③ · 按 R7 实测收口）**

| 步骤 | 回填内容（R7 实测） | 状态 |
|---|---|---|
| ② 重传 | `node scripts/upload-migrated-to-cloudbase.mjs`（树 JSON + `tree-meta` + `storage_files`） | **未执行**（云端仍为旧态） |
| ②前 前置 | **先重启 compat-api 实例**（否则 `metaCache` 整份回写覆盖，且读侧仍返旧树快照 —— 见 (i)）；同 §28-2 第 5 条 | **未执行** |
| ③ 删旧详情键（云端 `jiazu_person_details` 按 `_id` 精确删） | **`ji_23395:3c95530f8bd4f84dc0b87edc`**、**`gu_39038:5ae4c6e505c90d290f71f66b`**（本地真源**已删**，**云端副本仍在** ⇒ 删除动作**待做**） | **未执行**（顺序仍 = **先重传、再删旧键**） |
| ③ 新增 / 变更键（须在重传后可见） | **7 个** = 上表 (b) 的 7 行（`config/tree-meta.json` + 4 棵树 JSON + 2 个家族树侧始祖详情键 `ji_23395_01:10400594c54f5203f61bf4fa4b20` / `gu_39038_01:103f95b87b5a464242933ee319d5`） | **未执行** |
| ④ 回读验证 | 见 §29-4 冒烟第 5 条 | **未执行** |

**（i）⚠️ 运维口径（必须遵守）：树 JSON 无磁盘指纹 ⇒ 改真源后必须重启 compat-api**

> **实测结论**：`lib/store.js` 对 **`config/tree-meta.json` 有磁盘指纹**（`:272` `function statMetaFile()` / `:282` `function sameMetaStamp(a, b)`（`mtimeMs` / `size` / `ctimeMs` 三元组）/ `:313` `const stamp = statMetaFile();` / `:315` `if (!stamp || sameMetaStamp(stamp, metaStamp)) return metaCache;`）⇒ **外部改 meta，长驻实例会自动重读**；而 **树 JSON 没有任何磁盘指纹** —— `:356` 注释「`// ---- 树 JSON（结构真源） ----`」、`:358-374` `getTree()` 实测 **`:359` `if (treeCache.has(treeId)) return treeCache.get(treeId);`** ⇒ **命中进程内 `treeCache` 即返回，不做 stat / 不做 mtime 比对**。
> **⇒ 口径**：**任何外部改树 JSON 的动作（R7 迁移 / 手工改 / 从备份恢复 / 换数据目录）之后，必须重启 compat-api**，否则读侧（`/people`、`/tree/rank`、树图、搜索）持续返回**旧快照**；写侧更会**把旧快照整份回写**（与 §28-2 第 5 条 `metaCache` 的整份回写风险同源）。
> **本节实测回读证据（长驻实例：端口 3100 · PID 88224 · **未重启** · 2026-09-20 21:34 CST）**：`GET /tree-meta` → `ji_23395_01` 的 `clan_tree_id=ji_23395` / `clan_handle=3c95530f8bd4f84dc0b87edc` = **已是新值**（meta 有指纹 ✅）；`GET /people/10400594c54f5203f61bf4fa4b20`（`X-Tree-Id: ji_23395_01`）的 `attribute_list` **仍是旧的 4 条** `external_*`（`external_tree=ji_23395` / `external_person_handle=3c95530f8bd4f84dc0b87edc` / `external_link_type=founder` / `external_mirror=true`），而**现盘** `migrate-output/trees/ji_23395_01.json` 该节点的 6 个 `external_*`（含 `external_founder_created_by`）**全为空串**（实测）⇒ **差异即旧 `treeCache`，重启后消失**。
> **完整口径 / 代码锚点 / 复现命令** = `docs/founder-attach.spec.md` **§9-11**（同址）。

**（j）E1 / E2 裁定登记（摘要 · 全文见跨册）**

| 裁定 | 结论（Zang · 2026-09-20） | 本册登记 |
|---|---|---|
| **E1** | 「口径 A（点镜像节点 = 打开真身档案）」下，正常点击流 / 深链会把镜像坐标 `replaceState` **收敛到真身** ⇒ **镜像自身的只读档案在正常点击流不可达**；只读判据（`founder-lock` / `founder-hint`）只在内层弹窗 / 不可收敛分支可见。**裁定：不算缺陷** —— ① 与 R1 单一真源同向；② R3 仍是后端防线 + 不可收敛态兜底；③ **R7 后家族树始祖变真身、不再触发收敛** | 口径行见 `docs/founder-attach.spec.md` **§9-11** / `docs/clan-tree.spec.md` **§11-6** / `docs/branch-clan-ops.spec.md` **§16-7** |
| **E2** | 证据由 `PersonDetailModal.open(treeId, handle)`（**公开 API**）取得、**非真实鼠标点击** = **次优取证路径，已获接受**，但**必须写明理据**，避免后续会话误读为「正常路径可达」 | 同上（本节**如实登记**：Jing 本轮**尝试**真实点击流复现**未成** —— 浏览器后端被 `chrome … profile's Login Data … write lock` 拦下 ⇒ **未补证**） |

**（k）本节边界（Jing · 2026-09-20 21:31–21:36 CST 实测）**：本轮**只改 `docs/**`**（本册 + `docs/founder-attach.spec.md` + `docs/clan-tree.spec.md` + `docs/branch-clan-ops.spec.md`）；**未跑迁移脚本（含 dry-run / 二次 `--apply`）、未改代码、未重传、未部署、未打包、未提交、未尝试写 `AGENTS.md`**。真源现值 = 上表 (b)（`config/tree-meta.json` = **`13616a89db2782256c3f33260aa32470`**、`migrate-output/**` = **317 文件**）；**历史行一律原文保留**（新口径 = 追加行 + 「已作废 / 已取代」标注）。**R7 的云端动作（重传 / 删旧键）与本批「云函数重打包 / 前端 H5+小程序重打」四项判据（§29-0 / §29-6）均仍未执行。**

---

## 30. 本批：家族树树图不绘制「外树子女镜像」（**纯前端批次**）

> 规格 = `docs/marriage.spec.md` **§9-7-11**（新口径 v2：R1 显示口径 / R2 例外 / R3 数据零写入 / R4 后端零改动 / R5 回归面 + 事实基线）+ `docs/home-sort-search.spec.md` **§10-7 三** 追加行（v2）；口径拍板 = **Kevin 2026-09-22**。
> **本批性质**：**纯前端改动** —— **无新增云函数路由、无新增集合、无真源数据变更**（三项均为「本轮无」，见 §30-0 第 1–3 行）。
> **实施状态：前端实现「由 Kong 实施中 / 由 Neng 质检」**（**不表示已实现 / 已通过 / 已部署**）；本清单只登记**上云动作**。
> **文档侧登记（Jing 2026-09-22）**：`AGENTS.md` **§7** 的本批「口径指路」行**文本已备、写入被 protected-file 审批拦下**（未获同意 ⇒ 该文件本轮未被修改）→ 待 Kevin 批准后由前台 / Zang 写入；**不影响本节的部署登记**。

### 30-0 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | **本轮无**（`cloudfunctions/compat-api/**` 本批 0 改动）⇒ **无 esbuild 重打包项、无 `tcb fn deploy` 项** | — |
| 2 | CloudBase 集合 | **本轮无**（不新建集合、不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`，保持 §11-2 的 **12 项**） | — |
| 3 | 云端数据 | **本轮无**（`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰；不重跑迁移上传、无手工删键、不动 `jiazu_id_seq`） | — |
| 4 | 前端 H5 / 小程序 | **必须重打包 + hosting 部署**（`build:h5` 带 `VITE_API_BASE`）；小程序**同批重打**并上传 | 需确认 hosting 目标与云函数 HTTP 域名 |

### 30-1 前端产物（**必须重打包：H5 + 小程序**）

**为什么需要**

- 本批改的是**家族树树图绘制口径**（`docs/marriage.spec.md` §9-7-11 R1）：**家族树**（`kind === 'family'`，含 `kind` 缺省）内满足 `String(p.external_mirror) === 'true'` **且** `p.external_link_type === 'child'` 的节点**连同其子树整支不绘制**；不重打包则线上仍是旧绘制行为（`shen_27784_01` 树上仍绘出 `I000286`、`gu_39038_01` 树上仍绘出 `I000293` / `I000294`）。
- **世本 / 祖谱不受影响**（R2）：顶端链镜像（`chain`）/ 始祖镜像（`founder`）/ 祖谱登记镜像照旧绘制。
- **数据侧零写入**（R3）：镜像节点必须保留（`docs/marriage.spec.md` §9-7-8 红线，写路径依赖镜像 handle）—— 本批**不含**任何删改节点动作。

**具体命令**

```bash
cd frontend
VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5      # 产物 frontend/dist/build/h5
# → tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c

npm run build:mp-weixin                                        # 产物交微信开发者工具上传
```

**本地验证证据**

- ⚠️ **本批实施 / 质检结论尚未产生**（状态 = **由 Kong 实施中 / 由 Neng 质检**）⇒ 本清单**不预填**任何「已通过」结论；`npx vue-tsc --noEmit` / `npm test` / 真机树图读数**一律由 Neng 质检收口后回写**（本清单**不推算、不预填**）。
- 可引用的**改动前基线（Zang 2026-09-22 实测 · 数值照抄，不得改写）**：`shen_27784_01` 森林 **1 根 / 9 节点**（含镜像 `I000286`）；`gu_39038_01` 森林 **22 节点**（含镜像 `I000293` / `I000294`）；全站同类节点 **3 个 / 2 棵树**。真源 md5：`migrate-output/trees/shen_27784_01.json` = **`407445ab3a507b1f591faf005dfb6ae2`**（**Jing 2026-09-22 13:19:20 CST 只读复测同值**）。
  - ⚠️ Zang 登记的 `config/tree-meta.json` 基线 **`59e0271f443d4ae682cc939a064fadff`** 与 **Jing 现测 `5688ce406a59b3ca27b9a22ebd3ddb14`**、**`git show HEAD:` 值 `13616a89db2782256c3f33260aa32470`** **三值互不相等**（该文件当前为工作区在途改动 = Kevin 自己的在途工作，本批未触碰）⇒ **该值不作本批任何判据**，仅如实登记。
- 落点（**Jing 2026-09-22 只读观察，不代表实现完成**）：`frontend/src/business/pedigree.ts` 现盘已含 **`excludeChildMirrors`** 选项（`:18-24` 判据 `isChildMirrorPerson`；`:72-73` 语义注释「该节点连同其子树整支不进入森林。缺省 false = 既有行为逐字不变」）；组件侧 `frontend/src/components/tree-pedigree/tree-pedigree.vue` 的 `hideExternalMarkers` prop（`:114` / `:137` / `:176`）**语义不变**（R5）。**最终落点与行号以 Kong 交付 / Neng 质检版本为准。**

**阻塞点**：H5 需确认 hosting 目标目录与云函数 HTTP 域名；小程序需开发者工具上传权限（同 §4 / §18-1）。

### 30-2 云端动作：**本轮无**

- **无云函数项**：`cloudfunctions/compat-api/**` 本批 0 改动 ⇒ **不重打包、不 `tcb fn deploy`**（**本批没有云函数重打包项**）。
- **无集合项**：`COLLECTIONS` 保持 §11-2 的 **12 项**。
- **无数据项**：`migrate-output/**`、`config/tree-meta.json`、`jiazu_id_seq` 均不动（§9-7-11 R3：不删不改真源节点、镜像必须保留）。
- 本节**只登记前端发布**（§30-1）：`build:h5` + `tcb hosting deploy` / `build:mp-weixin` 上传。

### 30-3 部署后冒烟验证（按序做；⚠️ 均为**待执行**步骤，结论由 Neng 收口后回写，本清单不预填）

1. **家族树（受影响树）**：`shen_27784_01` 树图**不再绘制** `I000286`；`gu_39038_01` 树图**不再绘制** `I000293` / `I000294`（对照 §30-1 的改动前基线 = 9 节点 / 22 节点）。
2. **世本 / 祖谱不受影响**：`zhonghua`（世本）与祖谱（`kind === 'clan'`，如 `ji_23395` / `gu_39038`）内的**顶端链镜像**（`chain`）、**始祖镜像**（`founder`）、**祖谱登记镜像**照旧绘制。
3. **回归面（逐项不变，§9-7-11 R5）**：卡片角标档位、统计栏、**点卡片开真身档案**（§9-7-2）、树内搜索、全站搜索、**管理选人列表**（§9-7-8 红线：仍可见镜像本身、未被解析到真身）、多支始祖列表、`hideExternalMarkers` 开关语义。
4. **真源零写入**：上云前后 `migrate-output/trees/shen_27784_01.json` md5 **应仍为** `407445ab3a507b1f591faf005dfb6ae2`（本批只改前端绘制，不产生数据动作）。

### 30-4 明确**不需要**上云的东西

- 本批**无新增测试文件 / 无新增脚本 / 无云函数改动** ⇒ **无 esbuild 重打包项、无 `tcb fn deploy` 项**；
- 规格与质检文档（`docs/marriage.spec.md` **§9-7-11**、`docs/home-sort-search.spec.md` **§10-7 三** 追加行、本册 **§30**）：不进产物、不影响云端；
- `/tmp` 下的副本与取证文件：临时产物。

---

## 31. 本批：**子女标签可拖曳排序（排行）**（**代码批次：云函数新增 1 条路由 + 前端新交互** · **集合与云端数据本轮无**）（Jing 制度员 · 2026-09-23 13:30 CST · **只追加 · 不改 §0–§30 历史行**）

> **性质**：本节为**部署台账登记**（**只追加**）—— **未改代码、未写真源、未执行任何打包 / 部署 / 上传 / 重传**（本批仅新增 / 追加文档：`docs/sibling-order.spec.md`（新建）、`docs/economy-fee.spec.md` **§3-1 #36 + 头部对齐表新增行 + §12-1 新增行 + §15**、`AGENTS.md` **§0 / §7 / §9** 追加行、本册 **§31**）。
> **裁定来源**：**Zang 裁定 v1（2026-09-23）**；口径真源 = `docs/sibling-order.spec.md`（业务域规格）+ `docs/economy-fee.spec.md` **§3-1 #36 / §15**（计费与闸门）。
> **实现状态（如实登记）**：**Kong 已实测落盘 · 工作区在途未提交**（`cloudfunctions/compat-api/{index.js,lib/economy-fee.js,lib/tree-write.js,lib/sibling-reorder.test.js}` + `frontend/src/{business/api.ts,business/index.ts,business/types.ts,components/person-archive/person-archive.vue}` + 新建 `frontend/src/components/sibling-order-modal/`）；**云函数产物未重打包**（§31-1）；**`npm test` 当前为红**（**478 / 476 / 2**，2 红 = 预存在的真源漂移，§31-5）⇒ **不得**据本节认为已实现完毕 / 已验证 / 已部署。
> **时点**：`date` = **2026-09-23 13:30:46 CST**；本节读数均为**本节实测**（复现命令见 §31-1 / §31-5）。**编号接 §30**。

### 31-0 总览

| # | 目标 | 动作 | 阻塞 | 备注（本节实测） |
|---|---|---|---|---|
| 1 | 云函数 **`compat-api`** | **重打包 + `tcb fn deploy`**（**必须**） | 先决：`npm test` 转绿（§31-5）+ 工作区冻结 | 新增 1 条路由 `POST /admin/sibling-reorder`；**产物当前未重打包**（判据串命中 **0**） |
| 2 | **前端 H5 + 小程序** | **重打 + hosting / 开发者工具上传**（**必须**） | hosting 目标 + 云函数 HTTP 域名 | 现有产物均**早于**本批实现（H5 `2026-09-21 07:23` / 小程序 `2026-09-20 13:21`） |
| 3 | CloudBase **集合** | **本轮无**（不新建集合；`COLLECTIONS` 保持 **12 项**） | — | 本路由扣费写**既有** `jiazu_assets` |
| 4 | **云端数据（树 JSON / 详情 / tree-meta）** | **本轮无** | — | `migrate-output/**` 与 `config/tree-meta.json` 本批 0 改动 ⇒ **无重传、无手工删键、不动 `jiazu_id_seq`** |

### 31-1 必登 ①：云函数 `compat-api` **必须重打包 + `tcb fn deploy`**

| 项 | 实测（本节 2026-09-23 13:30 CST） |
|---|---|
| 产物 | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B** · mtime **2026-09-19 12:50:59** · md5 **`d61a8aebfb3f3095baae4e1e731fd675`**（与 §24-1 / §25-10 / §26-1 / **§29-1** 同值） |
| 判定 | ❌ **未重打包** |
| **判据 A（`grep -c` ≥1 · 首选 · 逐字）** | 在 **`cloudfunctions/deploy/compat-api/index.js`** 中：`grep -c 'sibling-reorder'` → **期望 ≥1**（证明本批已进产物）；**本节实测 = `0`** ⇒ 未重打包 |
| 判据 B（辅助 · 下划线形态） | 同产物 `grep -c 'sibling_reorder'` → **期望 ≥1**；**本节实测 = `0`** |
| 源码侧对照（证明字面已实现 · 本节实测命中数） | `sibling-reorder`：`cloudfunctions/compat-api/index.js` **2** · `lib/economy-fee.js` **2** · `lib/tree-write.js` **1**；`sibling_reorder`：`index.js` **1** · `lib/economy-fee.js` **6** · `lib/tree-write.js` **1** |
| 打包命令 | 沿用**仓库既有**打包命令（同 §24-1 / §25-1 / §26-1 / §29-1 的同一份，本册**不新造**）；产物路径 = `cloudfunctions/deploy/compat-api/index.js`；`cloudfunctions/deploy/**` 是**产物、不是编辑对象** |
| 部署命令 | `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`（沿用既有批次口径） |
| 部署后判定 | 再跑判据 A/B：**两者均 ≥1** 且产物 md5 **≠** `d61a8aebfb3f3095baae4e1e731fd675`、mtime > **2026-09-23 13:30** |
| 附带核对（非本批判据，防误判） | 若产物仍为 `d61a8aeb…`，则**本批与 §23 / §24 / §25 / §26 / §29 的口径同时落后**（该产物内 `personEditLockMessage` / `residence_places` 等 §29 判据串亦为 0） |

```bash
cd /Users/kevin/bistro/jiazu
grep -c 'sibling-reorder' cloudfunctions/deploy/compat-api/index.js   # 期望 ≥1；本节实测 0
grep -c 'sibling_reorder' cloudfunctions/deploy/compat-api/index.js   # 期望 ≥1；本节实测 0
wc -c < cloudfunctions/deploy/compat-api/index.js; md5 -q cloudfunctions/deploy/compat-api/index.js
```

### 31-2 必登 ②：前端 **H5 + 小程序重打**

| 项 | 实测（本节） |
|---|---|
| H5 产物 | `frontend/dist/build/h5/index.html` mtime **2026-09-21 07:23:37**（目录 mtime 同） |
| 小程序产物 | `frontend/dist/build/mp-weixin/app.json` mtime **2026-09-20 13:21:14** |
| 判定 | ❌ **均早于本批实现**（本批前端改动 = 人物档案子女区「调整排行」入口 + 新建 `frontend/src/components/sibling-order-modal/sibling-order-modal.vue`）⇒ **必须重打**，否则线上无该入口 |
| 命令 | `cd frontend && VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5` → `tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c`；`npm run build:mp-weixin` + 微信开发者工具上传 |
| 判据（候选） | 产物内命中本批新增字面 ≥1（示例字符串见 §31-4 第 8 条的可观察行为）；或产物 mtime > 本节时点。**本册不预设前端产物字面**（以 Kong 交付 / Neng 质检版本为准） |

### 31-3 云端动作：**集合与数据本轮无**（**纯数据面无**）

- **无集合项**：不新建集合、不新增上传项 —— `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 保持 **12 项**（本节只读核对 = 12）。本路由扣费写**既有** `jiazu_assets`（`_id='global'`）。
- **无数据项**：`migrate-output/**`（trees / details / collections）与 `config/tree-meta.json` 本批 **0 改动** ⇒ **不重跑上传脚本、无手工删旧详情键、不动 `jiazu_id_seq`**；排行真源就是既有树 JSON 的 `families[].child_handles[]` 数组序（**不新增字段**，`docs/sibling-order.spec.md` §2）。
- ⚠️ 若日后发现真源在本批期间被**运行时实例**改写（`migrate-output/**` 是活文件），按 §28-0 事件 K / §29 同址要求处理：**上传范围与前后 md5 必须以「全部 local-server 重启 + 冻结后」的一次实测为准**。

### 31-4 部署后冒烟验证（按序做；⚠️ 均为**待执行**步骤，结论由 Neng 收口后回写，本清单不预填）

1. **部署前判据**：`grep -c 'sibling-reorder' cloudfunctions/deploy/compat-api/index.js` **≥1**（§31-1 判据 A）。
2. **正常重排**：带 `Bearer` + `X-Tree-Id` 调 `POST /admin/sibling-reorder`（`{tree_id, family_handle, person_handle, child_handles:[…]}`）→ **200**，且 `fee = { unit:'bamboos', pieces:1, balance:<扣前>, balance_after:<扣后> }`、`position` / `previous_position` 与提交一致、`child_handles` = **提交序**。
3. **读侧零改动生效**：`GET /people/<handle>?profile=all` → `profile.families[].children` 的顺序 = **提交序**（`index.js:179` 按数组序出参）。
4. **流水核验**：`GET /assets/summary`（带 Bearer）→ `txs` 出现一条 **`type='edit_fee'`**、`desc='调整排行：<姓名> 第 N 位'`、`ref.tree_id` + `ref.person_handle` = **被拖动的子女节点**、`delta.bamboos = -1`。
5. **no-op**：把**同一顺序**再提交一次 → **200 + `noop:true` + `fee.pieces:0`**，且树 `version` / `updated_at` 不动、**无新流水**。
6. **被拒请求零痕迹**：①无 `Bearer` → **401 `请先登录后再进行编辑操作`**；②游客 → **403 `游客无编辑权限，请注册后编辑`**；③只读节点（始祖真身 / 镜像）→ **403**（既有只读文案）—— 三者均**不得产生任何 `Tx`**（含 `fee_refund`）。
7. **409 与集合校验**：①0 片账号 → **409 `资产不足，需 1 片竹片，当前 0 片`** 且树未变；②`child_handles` 少一个 / 换人 / 重复 → **400 `子女列表须与现有子女完全一致（等长 / 同元素 / 无重复）`**；③`family_handle` 不存在 → **404 `家族记录不存在`**。
8. **前端 H5 真机**：有写权的节点在档案子女区看到「调整排行」→ 模态框顶部分段（多配偶时）、行内序号 1/2/3… + 姓名 + ▲▼；**长按拖曳**与 **▲▼** 两条通道都能改位次（**位移 < 12px 不换位**）；点「确定」先出**二次确认**（文案含 `本次调整消耗 1 片竹片。`）；成功后子女标签顺序更新（**树图子女遍历顺序随之变化**，属既有读出参连带面，见 `docs/sibling-order.spec.md` §2）。
9. **小程序端**：同批冒烟（小程序侧 `preventDefault` 为空实现 ⇒ 拖曳中的页面滚动拦截以其空实现为准，**以 ▲▼ 通道作为兜底验证路径**）。
10. **数据面回归（应无变化）**：部署前后 `migrate-output/trees/*.json` 与 `config/tree-meta.json` 的 md5 **应一致**（本批无数据动作）；若不一致，按 §31-3 的运行时写入要求处理。

### 31-5 本节实测读数与证据（**供 Neng 终校**）

| 项 | 实测 |
|---|---|
| `npm test` | `cd /Users/kevin/bistro/jiazu && npm test` → **478 tests / 476 pass / 2 fail / 0 skipped**（**exit 1**）；TAP 汇总逐字 = `1..478` / `# tests 478` / `# pass 476` / `# fail 2` / `# skipped 0`；实测时点 **2026-09-23 13:30:28 CST**（Jing） |
| **2 红（预存在 · 与本批无关）** | 均为 `not ok 354` / `not ok 358` = **`cloudfunctions/compat-api/lib/mirror-count.test.js`** 的 **M2**（点名镜像 **`I000143`** 未命中）与 **M6**（点名镜像 **`I000209`** 未命中）；真源实测 = `migrate-output/trees/gu_39038_01.json` 的 `I000143`（顾清学）与 `migrate-output/trees/ji_23395_01.json` 的 `I000209`（季花）的 **`external_mirror` 现为空串** ⇒ **真源漂移，待重同步** |
| 本批专测 | `cloudfunctions/compat-api/lib/sibling-reorder.test.js`（**512 行**）**全绿**；已注册进根 `package.json` 的 `scripts.test` ⇒ **`scripts.test` 注册数 = 磁盘 `lib/*.test.js` 数 = 29**（**未注册 = 假绿**） |
| 门槛 | **`npm test` 全绿 = 本批交付门槛**（沿用 §29-6 第 1 条口径）；**未全绿前不得打包 / 部署 / 重传**，工作区保持冻结；**全绿读数由 Neng 终校后回写本节**（本册**不推算、不预填**） |
| 真源零写入 | 本节**只读**：未改 `migrate-output/**`、未改 `config/tree-meta.json`、未跑迁移 / 上传脚本、未改任何代码 |
| 复现命令 | `cd /Users/kevin/bistro/jiazu && npm test`；`node --test cloudfunctions/compat-api/lib/{sibling-reorder,mirror-count}.test.js`；`ls cloudfunctions/compat-api/lib/*.test.js \| wc -l` |

### 31-6 明确**不需要**上云的东西

- `auth-server/**`、一次性修复脚本、`migrate-output/` 中间报告、`/tmp` 下的副本与取证文件（临时产物）；
- 规格与制度文档（`docs/sibling-order.spec.md`、`docs/economy-fee.spec.md` §15、`AGENTS.md` 本批追加行、本册 §31）：**不进产物、不影响云端**；
- **本批追加（2026-09-23 18:20 CST）**：`docs/sibling-order.qa.md`（三轮质检汇编）与 `docs/sibling-order.spec.md` **§14**、`docs/economy-fee.spec.md` **§15-9**、`AGENTS.md` **§0 / §9** 追加行 —— 同属**文档面**，**不进产物、不影响云端**；
- 本批**无新增脚本**、**无新增集合**、**无真源数据变更**。

---

### 31-7 终校收口追加（**追加 · 2026-09-23 18:20 CST** · **只追加 · 不改 §31-0 – §31-6 历史行**）

> **性质**：**部署台账追加登记**（**未改代码、未写真源、未执行任何打包 / 部署 / 上传 / 重传**）。本节取代 §31-5 的**门槛待办态**与 §31-2 的**判据缺省态**（两处**原文均保留**）。

**① 交付门槛 —— 已达标（取代 §31-5 的 `478 / 476 / 2` 读数）**

| 项 | 实测 |
|---|---|
| 命令 / 时点 | `cd /Users/kevin/bistro/jiazu && npm test` · **2026-09-23 18:20 CST**（Jing） |
| 读数 | **478 tests / 478 pass / 0 fail / 0 skipped（exit 0）**；TAP = `1..478` / `# tests 478` / `# pass 478` / `# fail 0` / `# cancelled 0` / `# skipped 0` |
| 一致性 | **四方一致**：Zang 亲跑 + Kong / Neng 各跑过一次 + Jing 复跑 ⇒ 上列 **§31-5 的 2 红（`not ok 354` / `not ok 358`）已清零** ⇒ **§31-0 第 1 行的先决条件「`npm test` 转绿」已满足**（工作区冻结仍须以执行时点复核） |
| 本批专测 | `cloudfunctions/compat-api/lib/sibling-reorder.test.js`（512 行）全绿；`scripts.test` 注册数 = 磁盘 `lib/*.test.js` 数 = **29** |

**② `mirror-count` 点名重同步登记（本批副产物 · 断言零放宽）**

- `cloudfunctions/compat-api/lib/mirror-count.test.js` 本批**重同步**：点名 **`GU_MIRROR_GIDS` 5 → 4（删 `I000143`）**、**`JI_MIRROR_GIDS` 4 → 3（删 `I000209`）**，M2 标题 `5 个 → 4 个`。
- **依据 = 真源实测（只读）**：`migrate-output/trees/gu_39038_01.json` 的 `I000143`（顾清学）与 `ji_23395_01.json` 的 `I000209`（季花）的 **`external_mirror` 现为空串**（`external_person_handle` 亦空）⇒ 二者**已就地反转为非镜像**。
- **先例**：`058b5f7`（ji 排除集改空 ⇒ 回 427/427/0）、`23a8467`（M6 快照 61）。**断言零放宽**逐条 = 点名仍**包含式**、总数仍 `realMirrors()` **动态推导**、`person_count` 快照与不变量**一字未动**、其余点名**保留**、本批 diff 仅 **18 insertions / 9 deletions** 且全在**点名数组与注释 / 标题**。
- ⚠️ **本项与 §31-3「本轮无数据项」不冲突**：重同步改的是**测试文件**，**真源未被本批写入**（`external_mirror` 的空串是**既存漂移**，非本批所致）。

**③ 云函数动作：判据不变、**动作仍未执行**（§31-1 复核）**

- 实测（2026-09-23 **18:19 CST**）：`grep -c 'sibling-reorder' cloudfunctions/deploy/compat-api/index.js` = **0**；`grep -c 'sibling_reorder' …` = **0** ⇒ **§31-1 判据 A / B 仍不达标、产物仍未重打包**，§31-1 的打包 / 部署 / 部署后判定三行**一律照旧执行**。

**④ 前端重打判据 —— 补具体字面（取代 §31-2「本册不预设前端产物字面」的缺省态）**

- **覆盖文件面（整改后 · 均须进 H5 + 小程序产物）**：`frontend/src/components/sibling-order-modal/sibling-order-modal.vue`（**505 行**，含自绘确认层与 no-op 双路径）、`frontend/src/components/person-archive/person-archive.vue`（入口 `:210-218` / 挂载 `:475` / `canReorderKids` **:1985**）。
- **候选判据（`grep -c` ≥1 · **期望值**，本册**未执行打包 ⇒ 未实测**）**：
  ```bash
  # H5 产物（CSS 类名与 JS 字面在 minify 后均保留）
  grep -rc 'som-confirm-ok'            frontend/dist/build/h5   # 期望 ≥1（自绘确认层按钮类名）
  grep -rc '排行未改动，无需保存'        frontend/dist/build/h5   # 期望 ≥1（no-op ① 前端短路文案）
  grep -rc '调整' frontend/dist/build/h5                        # 粗判据（宽，仅作交叉验证）
  # 小程序产物
  grep -rc 'som-confirm-ok'            frontend/dist/build/mp-weixin   # 期望 ≥1
  ```
- **辅助判据**：产物 `mtime` > **2026-09-23 18:20 CST**（本批实现落盘之后）。**两者判据均不得预填实测值**（本册未执行打包）。

**⑤ 冒烟第 8 条 —— 文案口径更正（追加标注 · **§31-4 第 8 条原文保留**）**

- §31-4 第 8 条原写「点『确定』先出**二次确认**（文案含 `本次调整消耗 1 片竹片。`）」 ⇒ **该文案已作废**（旧实现 `uni.showModal`，且其 `.uni-modal` z-index = 999 **被 `.som-mask` 1000 盖住 ⇒ 不可点**）。
- **现行口径（逐字）**：二次确认层 = **自绘层**（`.som-confirm-mask` z-index = **1010**），正文 = **「调整 <被移动子女姓名> 的排行，消耗 1 片竹片。」** + 「<配偶标签>的子女排行将按调整后的顺序保存。」；按钮 = `取消` / `确定调整`（`.som-confirm-ok`）。
- **冒烟须加做三项**：① 确认层按钮**可点**（`elementFromPoint` 命中 `.som-confirm-ok` 本体；真实指针点击可提交）；② **no-op 双路径文案**：本地未改动点「确定」→ **零请求** + toast **「排行未改动，无需保存」**；同一顺序再提交 → 200 `noop:true` + `fee.pieces:0` + toast **「排行未变化，未消耗竹片」**；③ 详情见 `docs/sibling-order.spec.md` **§9-2-1** 与 `docs/sibling-order.qa.md` **§4.2**。

**⑥ 本批文档面（新增 / 追加 · 台账登记）**：`docs/sibling-order.spec.md`（**§14** 终校收口 + 头部状态行 + §3-1-1 + §9-2-1 + §3-5 追加行 + §12 ⑨–⑮）、**`docs/sibling-order.qa.md`（新建）**、`docs/economy-fee.spec.md`（§15-2 追加行 + **§15-9**）、`AGENTS.md`（**§0 / §9** 追加行已落盘；**§7 追加行本回合未落盘** —— 受保护文件写保护审批未获响应，内容见 `docs/sibling-order.spec.md` §14「落盘状态」）、本册 §31-7。

**⑥ 追记（追加 · 2026-09-23 18:48 CST · **只追加 · 不改 §31-0 – §31-7 既有行**）**：**`AGENTS.md` §7 追加行（`npm test` 终值基线 **478 / 478 / 0 / 0（exit 0）** + `mirror-count` 点名重同步登记）已于 2026-09-23 18:48 CST 落盘**，位于 `AGENTS.md` **第 213 行**（Jing 受保护文件写入获批后落盘）；上段 ⑥ 中「**§7 追加行本回合未落盘**」措辞**属本回合初态、原文保留**，其语义**自本追记起被覆盖**，**一律以本追记为准**。同步追记见 `docs/sibling-order.spec.md` §14「落盘状态追记」。

**⑥ 追记之二（追加 · 2026-09-23 · **只追加 · 不改 §31-0 – §31-7 既有行**）**：同上 —— 第 ⑥ 段及其 ⑥ 追记中凡指向「`AGENTS.md` §7 追加行」的「**未落盘**」措辞**均已过时**：该行**已落盘于 `AGENTS.md` 第 213 行**（真源写入登记 = **第 214 行** + 其**追记行** = **第 215 行**；§9 追记 = **第 243 行**，本批追记行插入**前** = 第 242 行），`git diff --numstat AGENTS.md` ⇒ **删除行 = 0（纯追加）**；**`shen_27784_01`（树 **14:25:10** + `details/shen_27784_01:*` × 2）归属已由 Kevin 当面确认 = 归 Kevin 本人** ⇒ 本批 2026-09-23 窗口内**四类写入**（`shen_27784_01` / `ji_23395_01` / `pan_28504_01` + `jiazu_assets` & `tree-meta.json` 连带变更）**全部已认领，无待确认项**。上列各行措辞**一律原文保留**，语义**自本行起被覆盖**（`AGENTS.md` §10 纪律）。同步追记见 `docs/sibling-order.spec.md` **§15** 与 `docs/sibling-order.qa.md` **§8**。**部署门槛不变**：云函数产物**仍未重打包**，打包 / 部署仍按 §31-1 – §31-6 逐项执行。

**§31-7 追记之三（追加 · 2026-09-23 · 只追加 · 不改 §31-0 – §31-7 既有行）**：**文件头本批状态块（第 44 行一带）已作废、原文保留** —— 该块所载 **「待 Neng 终校」** 与 **「`npm test` 当前 478 / 476 / 2（红）」** 均为**整改前**初态；**终值 = `npm test` 478 tests / 478 pass / 0 fail / 0 skipped（exit 0）**（2026-09-23 四方各跑一致）、**状态 = 已终校（Neng 复检通过）**。上文各行的「待终校 / 红」措辞**语义自本行起被覆盖**（`AGENTS.md` §10 纪律，原文一律保留）。**§31-7 ① 只取代 §31-5 的读数、未覆盖文件头状态块**，故在此补记。详见 `docs/sibling-order.spec.md` **§14 / §15 / §16** 与 `docs/sibling-order.qa.md` **§8**。**部署门槛不变**：云函数产物**仍未重打包**，打包 / 部署仍按 §31-1 – §31-6 逐项执行。

---

## 32. 本批：**行囊（道具栏）v3–v6 + 玉归属 v6**（**代码批次：云函数读侧改动 + 前端新交互** · **集合与云端数据本轮无**）（Jing 制度员 · 2026-09-24 · **只追加 · 不改 §0–§31 历史行**）

> **性质**：本节为**部署台账登记**（**只追加**）—— **未改代码、未写真源、未执行任何打包 / 部署 / 上传 / 重传**（本批仅追加文档：`docs/economy.spec.md` **§14**（新建）+ 其 **§13 标题下「已被取代 · 原文保留」**标注（`:562`）、`docs/spirit-domain.spec.md` **§14**（新建）、`AGENTS.md` **§0 / §7 / §9** 追加行、本册 **§32**）。
> **裁定来源**：**Zang 裁定 v3 / v4 / v5 / v6 / v6-附（2026-09-24）**；口径真源 = `docs/economy.spec.md` **§14**（展示层 · 行囊 36 栏位 / 换算 / 溢出 / 默认序 / 拖曳）+ `docs/spirit-domain.spec.md` **§14**（域口径 · 玉归属 / 注入者反查 / 永久占用）。
> **实现状态（如实登记）**：**Kong 已实测落盘 · 工作区在途未提交**（改动面见 §32-1 / §32-2）；**云函数产物未重打包**（§32-1 判据实测 = **0**）；**前端 H5 / 小程序产物均早于本批**（§32-2）⇒ **不得**据本节认为已实现完毕 / 已验证 / 已部署。
> **时点**：`date` = **2026-09-24 18:03:01 CST**；本节读数除注明外均为**本节实测**（复现命令见 §32-1 / §32-5）。**编号接 §31**。

### 32-0 总览

本批两件事：① **行囊（道具栏）展示层 v3–v6** —— 6 × 6 = **36 栏位**的展示与交互（1 格 = 1 道具换算 / 碎片占 1 格 / 余数占格 / 默认序 / 溢出提示 / 属性提示层 `z-index: 1010` / **插入式拖曳**，含本轮**拖曳坐标系归一化修复**）；② **玉归属与注入者读侧 v6** —— `GET /assets/summary` 用户面**只返未镶嵌**（`jades_total` 同口径）、`GET /admin/assets/user` 后台面**全量原始记录**（`include_mounted:true`）、`GET /spirit` 新增**只读**出参 `injector`（三态、手机号不下发）。**两件事都只落在「读侧 / 展示侧」**：本批代码对真源 **零写入（内容零变化）** —— 逐字结论、三处读数与**本节复核**见 **§32-3**。

| # | 目标 | 动作 | 阻塞 | 备注（本节实测） |
|---|---|---|---|---|
| 1 | 云函数 **`compat-api`** | **重打包 + `tcb fn deploy`**（**必须**） | 先决：`npm test` 转绿（§32-5）+ 工作区冻结 | 改动面 = `lib/economy-ledger.js` / `lib/economy-ops.js` / `lib/economy-spirit.js`（**`index.js` 未改** —— 路由原本就调 `adminUserAssets`）；**产物当前未重打包**（判据串命中 **0**） |
| 2 | **前端 H5 + 小程序** | **重打 + hosting / 开发者工具上传**（**必须**） | hosting 目标 + 云函数 HTTP 域名 | 现有产物均**早于**本批实现（H5 **2026-09-21 07:23:37** / 小程序 **2026-09-20 13:21:14**） |
| 3 | CloudBase **集合** | **本轮无**（不新建集合、不新增字段 / 枚举；`COLLECTIONS` 保持 **12 项**） | — | 本批零新路由：`injector` 挂在**既有** `GET /spirit` 出参上；玉过滤挂在**既有** `summarize` 的 `opts` 上 |
| 4 | **云端数据（树 JSON / 详情 / tree-meta）** | **本轮无**（零重传 / 零删键 / 不动 `jiazu_id_seq`） | — | 本批代码**不写** `migrate-output/**` 与 `config/**`；⚠️ 真源期内确有一次**与本批代码无关**的运行时写入，登记与归因见 **§32-3 复核块** |

### 32-1 必登 ①：云函数 `compat-api` **必须重打包 + `tcb fn deploy`**

| 项 | 实测（本节 2026-09-24 CST） |
|---|---|
| 改动面 ①（`lib/economy-ledger.js`） | `summarize(user, now, {include_mounted})` 按 `opts.include_mounted` 过滤玉：`const jades = (user.jades \|\| []).filter((j) => j && (opts.include_mounted \|\| !j.mounted_tree_id));`；`jades_total` **同口径**（用户面只计未镶嵌） |
| 改动面 ②（`lib/economy-ops.js`） | `adminUserAssets(phone, now)` 调 `summarize(assets, now, { include_mounted: true })` ⇒ 后台面出**全量原始记录**（含 `mounted_tree_id`） |
| 改动面 ③（`lib/economy-spirit.js`） | 新增 `maskPhone(phone)` 与只读反查 `injectorOf(treeId)`；`spiritInfo(...)` 出参**新增** `injector`（`injector: mounted ? await injectorOf(treeId) : null`）；全程 `colGet` 只读、**不 `sweep`、不回写** |
| **`index.js` 未改（逐字登记）** | `cloudfunctions/compat-api/index.js` 的 `/admin/assets/user` 路由（`index.js:894-899`，`chief_editor` 门禁 → `await ops.adminUserAssets(query.phone, new Date())`）与 `/spirit` 路由（`index.js:700-703` → `spirit.spiritInfo(treeId, …, new Date())`）本批**一字未改** ⇒ **本批无新增路由**（与 §31 那种「新增 1 条路由」不同）；**mtime 佐证（本节实测）**：`index.js` = **2026-09-23 13:08:00**，早于本批三处 lib 改动（`economy-ledger.js` **2026-09-24 12:51:13** / `economy-ops.js` **12:51:34** / `economy-spirit.js` **12:32:52**） |
| **判据（逐字可跑 · 本节实测值已填）** | `grep -c "include_mounted" cloudfunctions/compat-api/lib/economy-ledger.js` = **4**（**≥1 达标**）· `grep -c "include_mounted" cloudfunctions/compat-api/lib/economy-ops.js` = **2**（**≥1 达标**）· `grep -c "injectorOf" cloudfunctions/compat-api/lib/economy-spirit.js` = **3**（**≥1 达标**） |
| 产物 | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B** · mtime **2026-09-19 12:50:59** · md5 **`d61a8aebfb3f3095baae4e1e731fd675`**（与 §24-1 / §25-10 / §26-1 / §29-1 / §31-1 同值） |
| 产物判据（本节实测 = **0**） | 同产物内 `grep -c "include_mounted"` = **0**、`grep -c "injectorOf"` = **0**、`grep -c "maskPhone"` = **0** ⇒ ❌ **未重打包** |
| 打包命令 | 沿用**仓库既有**打包命令（同 §24-1 / §25-1 / §26-1 / §29-1 / §31-1 的同一份，本册**不新造**）；产物路径 = `cloudfunctions/deploy/compat-api/index.js`；`cloudfunctions/deploy/**` 是**产物、不是编辑对象** |
| 部署命令 | `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`（沿用既有批次口径） |
| 部署后判定 | 源码 3 条判据仍 ≥1（不变）；且**产物**内 `grep -c "include_mounted"` **≥1** 与 `grep -c "injectorOf"` **≥1**；产物 md5 **≠** `d61a8aebfb3f3095baae4e1e731fd675`、mtime > **2026-09-24 18:03** |

```bash
cd /Users/kevin/bistro/jiazu
grep -c "include_mounted" cloudfunctions/compat-api/lib/economy-ledger.js   # 期望 ≥1；本节实测 4
grep -c "include_mounted" cloudfunctions/compat-api/lib/economy-ops.js      # 期望 ≥1；本节实测 2
grep -c "injectorOf"      cloudfunctions/compat-api/lib/economy-spirit.js   # 期望 ≥1；本节实测 3
grep -c "include_mounted" cloudfunctions/deploy/compat-api/index.js         # 部署后期望 ≥1；本节实测 0（未重打包）
grep -c "injectorOf"      cloudfunctions/deploy/compat-api/index.js         # 部署后期望 ≥1；本节实测 0（未重打包）
wc -c < cloudfunctions/deploy/compat-api/index.js; md5 -q cloudfunctions/deploy/compat-api/index.js
```

### 32-2 必登 ②：前端 **H5 + 小程序重打**

| 项 | 实测（本节） |
|---|---|
| 改动面（7 个文件 · 均须进 H5 + 小程序产物） | `frontend/src/business/inventory.ts`（**327 行** · 行囊纯逻辑）· `frontend/src/business/asset-text.ts`（**44 行** · 玉状态文案单点）· `frontend/src/components/asset-inventory/asset-inventory.vue`（**873 行** · 容器组件，**本轮含拖曳坐标系归一化修复**）· `frontend/src/pages/mine/index.vue`（**572 行** · 行囊卡 + 签到印章卡）· `frontend/src/pages/assets/index.vue`（**427 行** · 四处移除）· `frontend/src/pages/spirit/index.vue`（**668 行** · 移除玉操作区 + 注入者区块 + 「永久有效」）· `frontend/src/business/api.ts`（**2,838 行** · 接口封装） |
| H5 产物 | `frontend/dist/build/h5/index.html` mtime **2026-09-21 07:23:37** |
| 小程序产物 | `frontend/dist/build/mp-weixin/app.json` mtime **2026-09-20 13:21:14** |
| 判定 | ❌ **均早于本批实现** ⇒ **必须重打**，否则线上无行囊容器 / 无注入者区块 / 资产页与 spirit 页仍是旧版（还带已移除的签到 / 合成 / 分解入口） |
| 命令 | `cd frontend && VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5` → `tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c`；`npm run build:mp-weixin` + 微信开发者工具上传 |
| 判据（候选 · **本册未执行打包 ⇒ 未实测**） | 产物内命中本批新增字面 ≥1（如容器组件类名 / 行囊标题「行囊」/ 溢出文案「背包空间不足，无法合成」/「此玉由」），或产物 mtime > 本节时点。**本册不预设前端产物字面**（以 Kong 交付 / Neng 质检版本为准，口径同 §31-2） |

### 32-3 真源零写入

> **逐字结论**：本批代码对真源 **零写入（内容零变化）**。依据 = 本节**三处读数**（**批次登记时点 = 2026-09-24 08:58 CST 一带**，同批登记见 `AGENTS.md` §7「真源写入登记 · 本批」行）：
>
> | # | 读数 | 登记值（批次登记时点） |
> |---|---|---|
> | ① | 被 touch 的真源文件 | `find migrate-output config -newermt "2026-09-24 00:00" -type f` = **1 条** ⇒ 仅 `migrate-output/collections/jiazu_assets.json` |
> | ② | 该文件 `mtime` | **动值**（每次读 `GET /assets/summary` 都可能移动；登记值 07:42:20 → 08:58:09）—— **`mtime` 不作为判据** |
> | ③ | 该文件**内容 `md5`** | 登记值 = **`9f17a77f7871584a563047c3ab45f09e`**（内容零变化） |
>
> **归因（批次登记时点）**：读侧 `GET /assets/summary` 触发 `sweep` 的**整体回写** ⇒ **内容不变、仅 `mtime` 变**（`lib/economy-ledger.js` / `lib/economy-ops.js` 的 `summarize` 前置于 `sweep`）—— **不是**本批代码的数据写入（本批代码改动全在 `filter` 与只读反查 `injectorOf`）。
> **制度口径**：**后续本机验证优先用 `/tmp` 副本栈**（`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 钩子），**避免无谓 touch 真源**；确需对真源跑时，**先备份**（`~/jiazu-backups/<日期-说明>/`）再按本节格式登记**前后 md5**。

**本节复核（Jing · 2026-09-24 18:01–18:03 CST 只读实测 · 只追加 · 上表原文保留）**

⚠️ **上表 ①②③ 中，① 的「1 条」与 ③ 的「内容 `md5` 恒为 `9f17a77f…`」两条读数在复核时点已不成立** —— 本批窗口内出现一次**与本批代码无关**的运行时写入。实测如下：

| # | 复核读数（2026-09-24 18:01:32 CST） |
|---|---|
| ① | `find migrate-output config -newermt "2026-09-24 00:00" -type f` = **4 条**（非 1 条） |
| ② | 逐条 `mtime` / 现行 `md5`（↔ 2026-09-23 只读快照 `~/jiazu-backups/2026-09-23-kevin-writes/` 对照）：**`collections/jiazu_assets.json`** `2026-09-24 17:48:10` · **`610cc94d39feb90fedfe2f41e164f69c`**（批次登记值 = `9f17a77f7871584a563047c3ab45f09e` ⇒ **已变**；快照值 = `076221b867c0c5d201361dda5cfe8791`）· **`trees/gu_39038_01.json`** `2026-09-24 17:48:10` · **`d3669b730b655bbf9a9bfe7f485bdcfc`**（快照 = `7224c15728b0fd5084141ac6c02d6483`；`version` **17 → 21**、`updated_at` **2026-09-24T09:48:10.294Z**）· **`details/gu_39038_01:103f95b87b5a464242933ee319d5.json`** `2026-09-24 17:47:33` · **`3aaf96364c9f79f9bc36fc41001b8951`**（快照 = `81e7c545c89cbe0c92e958e735ed58a1`）· **`details/gu_39038_01:103f95b87b9a398b1289942102ec.json`** `2026-09-24 17:48:10` · **`7889f0c036590ff72215dda01007092f`**（快照 = `0cd44543009ce01c1c77be7f54e1aeba`） |
| ③ | **归因判据 = 计费流水（`jiazu_assets` `txs` 136 → 149 条）**：其中 **4 条** = ts **`2026-09-24T09:47:06.672Z` / `09:47:33.235Z` / `09:48:01.371Z` / `09:48:10.293Z`**（= CST **17:47:06 / 17:47:33 / 17:48:01 / 17:48:10**）的 **`type='edit_fee'`**、`delta.bamboos = -1`、`ref.tree_id = gu_39038_01`（竹片 lot `bl_mu67o50m30bxt` **735 → 723**）；另有 **`signin`** 1 条（ts `2026-09-23T22:53:23.678Z`，`fragments` 2 → 3、`signin_date` 2026-09-18 → **2026-09-24**） |
| ④ | 逐节点内容差异（树 JSON vs 快照）= **2 个节点**：`103f95b87b5a464242933ee319d5`（**顾清学 I000143**：`is_living` 缺 → `false`、`residence_places` 缺 → `[]`）、`103f95b87b9a398b1289942102ec`（**顾秀英 I000147**：`is_living` `true → false`、`death_date` `'' → '2025'`）⇒ **形态 = 经 UI / API 的档案编辑（走计费闸门、逐次扣 1 片竹片）**，**不是**本批代码所致 |

- **结论（不改上表口径、只补事实）**：本批「**代码零写入真源**」的结论**不变** —— 本批改动全在**读侧**（`opts.include_mounted` 过滤 + 只读反查 `injectorOf`），**未新增任何写路径**；上述 4 次写入是**运行时人工编辑**（`edit_fee` × 4），**与本批归因无关**。
- **未决项（本节不裁定）**：① 该 4 次编辑（tree `gu_39038_01`，2026-09-24 17:47–17:48 CST）**写入主体待确认**（按 `AGENTS.md` §2.1「真源写入一律先备份、后登记」，**本次写入前无备份**：`~/jiazu-backups/` 最新 = `2026-09-23-kevin-writes/`）⇒ 建议照 2026-09-23 先例**补建只读快照**；② 是否在 `AGENTS.md` §7 追加「真源写入登记 · 2026-09-24 追记」行，**待 Zang / Kevin 拍板**（本册只登记事实，**不代改 `AGENTS.md` §7**）。

### 32-4 部署后冒烟验证（按序做；⚠️ 均为**待执行**步骤，结论由 Neng 收口后回写，本清单不预填）

1. **用户面玉口径**：带 `Bearer` 调 `GET /assets/summary` ⇒ 出参 `jades` **不含任何 `mounted_tree_id` 非空的玉**（已镶嵌玉一枚不出现），且 **`jades_total` = 未镶嵌枚数**（全为已镶嵌 ⇒ `jades = []`、`jades_total = 0`，不崩、无空壳项）。
2. **后台面玉口径**：以 `chief_editor` 调 `GET /admin/assets/user?phone=<号>` ⇒ **含已镶嵌玉**且**保留 `mounted_tree_id`**（枚数 / `jade_list` 均含）；非 `chief_editor` 同请求 ⇒ **403**（`ERR_CHIEF_ONLY` 文案）。**两端口径不得互相套用**（§32-0 第 3 行）。
3. **`injector` 三态 + 手机号不下发**：携 `X-Tree-Id` 调 `GET /spirit`，**三态各取一组** —— ① 正常（反查到 + 锚点同树）⇒ `injector = { nickname, person_handle }` 且 `person_handle` 可点；② 无锚点 / 跨树 ⇒ `injector.person_handle = null`（文案「注入者无本树节点」）；③ 反查不到 ⇒ `injector = null`（文案「注入者信息不可考」）；未镶嵌 ⇒ `injector = null`。**响应体不得含任何手机号**（昵称缺失时只出**脱敏串**：前 3 + `****` + 后 4）。
4. **行囊页**：36 格网格（`SLOT_COLUMNS` = 6 → 6 × 6）+ 溢出提示（占格需求 > 36 时逐类提示：玉 = 「背包空间不足，无法合成」、其它 = 「空间不足，无法持有」；**不入格**）；属性提示层 `z-index = 1010`；拖曳 = **插入式重排**（H5 与小程序命中判定分别用 `getBoundingClientRect()` / `boundingClientRect()`，**不得混用**；刷新 / 重进回默认序，**tabBar 切回保留内存序 = 已裁定可接受**）。
5. **spirit 页展示**：已镶玉区块出 **「此玉由〈昵称〉注入」**，① 态出卡片 **「查看注入者档案 ›」** 并可**跳到人物档案页**；**不得**再出现 **「玉有效期 至 <日期>」**（统一 = **永久有效（镶嵌即永久占用）**）；玉操作区（合成 / 分解）已移除（迁至「我的 → 行囊」）。

### 32-5 基线

| 项 | 实测 |
|---|---|
| 命令 / 时点 | `cd /Users/kevin/bistro/jiazu && npm test` · **2026-09-24 18:02–18:03:01 CST**（Jing） |
| 读数 | **480 tests / 480 pass / 0 fail / 0 skipped（exit 0）**；TAP = `1..480` / `# tests 480` / `# pass 480` / `# fail 0` / `# cancelled 0` / `# skipped 0`；`not ok` 行 = **0 条** |
| 增量 | **含本轮 2 个新增用例**：`lib/economy-spirit.test.js`「读口径 · 注入者反查（`injector`）」+1、`lib/assets.test.js`「`GET /assets/summary` 玉归属（v6）」+1 |
| 注册一致性 | `scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = **29**（**未注册 = 假绿**） |
| 门槛 | **`npm test` 全绿 = 本批交付门槛**（沿用 §29-6 第 1 条口径）；**未全绿前不得打包 / 部署 / 重传**，工作区保持冻结 |
| ⚠️ 终值 | **终值以 Neng 终校复跑为准**（本册**不推算、不预填**；若终校读数不同，再追加一行登记，本节原文保留） |
| 真源零写入（本节自身） | 本节**只读**：未改任何代码 / 真源，未跑迁移 / 上传脚本，未打包 / 部署 |
| 复现命令 | `cd /Users/kevin/bistro/jiazu && npm test`；`ls cloudfunctions/compat-api/lib/*.test.js \| wc -l` |

### 32-6 明确**不需要**上云的东西

- `migrate-output/**`（树 JSON / 详情 / collections 中间产物）与 `config/**`（含 `tree-meta.json` / `geo-divisions.json`）：**本轮无重传**；
- `docs/**`（`docs/economy.spec.md` §14 / `docs/spirit-domain.spec.md` §14 等）与 **本册 §32**、`AGENTS.md` 本批追加行：**不进产物、不影响云端**；
- `scripts/**`（含 `scripts/*.test.js` 与上传脚本）、一次性修复脚本：**不进云函数包**；
- `/tmp/**`（副本栈 / 取证文件）、`backups/**`、`~/jiazu-backups/**`：**离线 / 临时产物**，不同步云端、不参与打包；
- 本批**无新增集合**、**无新增路由**、**无新增字段 / 枚举**、**无真源数据变更**（玉归属全走读侧过滤）。

---

### 32-7 §32-2 追加行：家谱 tab 三文件进 **H5 + 小程序重打面**（**追加 · 2026-09-24 · 只追加 · 不改 §32-0 – §32-6 历史行**）

> **性质**：**部署台账追加登记**（**只追加**）—— **未改代码、未写真源、未执行任何打包 / 部署 / 上传 / 重传**。本节即 `docs/home-sort-search.spec.md` **§11-4 第 5 行**与 **§11-5** 两处所引「**`docs/PENDING_DEPLOY.md` §32-2 追加行**」的**落点本身**（该两处引用自本节起闭合）；§32-2 的改动面 7 文件、两产物读数、命令、判据各行**一律原文保留**。

| 项 | 实测（2026-09-24 · Jing 收口轮 · 只读） |
|---|---|
| 追加改动面（本批**家谱 tab** · **3 个新增文件** · 均须进 H5 + 小程序产物） | `frontend/src/components/tree-hall/tree-hall.vue`（**1055 行** · mtime **2026-09-24 18:28:55**）· `frontend/src/pages/family/index.vue`（**89 行** · **2026-09-24 18:29:14**）· `frontend/src/pages/hall/index.vue`（**23 行** · **2026-09-24 18:29:07**） |
| 本批前端**重打面合计** | §32-2 的 **7 个文件** + 本节 **3 个文件** = **10 个文件** ⇒ **H5 / 小程序各一次重打即可，不拆两批** |
| H5 产物 | `frontend/dist/build/h5/index.html` mtime **2026-09-21 07:23:37** |
| 小程序产物 | `frontend/dist/build/mp-weixin/app.json` mtime **2026-09-24 21:59:22** —— ⚠️ **本节撰写中途发生变动**：§32-2 登记值 = **2026-09-20 13:21:14**，实测**整树 219 / 219 文件同批写入**（**执行方 / 是否完整 / 是否含本批三文件改动 = 未验证**，见下方追记） |
| 判定 | ① **H5 产物早于本批三文件的最后 mtime（2026-09-24 18:29:14）** ⇒ ❌ **H5 必须重打（判定不变）**；② **小程序产物 mtime（21:59:22）已晚于本批三文件**，但其**改动面 / 完整性未验证** ⇒ **不得据「mtime 已新」免除小程序重打**（见下方追记）；③ 两产物在本批重打前，线上家谱 tab 仍是旧版（hero 卡 / 身份节点卡 / 导航格 /「收录人物：N 人」统计栏仍在，且**尚未**复用单真源组件） |
| 后端面（**本轮无**） | 家谱 tab **零后端改动** ⇒ **无云函数重打包项、无新增路由、无新增集合 / 字段**（口径真源 = `docs/home-sort-search.spec.md` **§11** / **§11-5**）；§32-1 的云函数必登项**不因本节增减** |
| 命令 | 与 §32-2 **同一份**（本册**不新造**）：`cd frontend && VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5` → `tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c`；`npm run build:mp-weixin` + 微信开发者工具上传 |
| 判据（候选 · **本册未执行打包 ⇒ 未实测 / 不预填**） | ① 产物内命中本批三文件的**可辨识字面** ≥1（**字面以 Kong 交付 / Neng 质检版本为准，本册不预设**，口径同 §31-2 / §32-2）；② 产物 `mtime` > **2026-09-24 18:29:14**（本批三文件最后 mtime） |
| 冒烟 | 家谱 tab **专面**判据 = `docs/home-sort-search.spec.md` **§11-5**（家谱 tab 与直开 `/pages/hall/index?tree_id=…` 的内容**逐字 / 逐项一致** + **两空态逐字** + hall 原链路回归 + `type-check` / `npm test` 不回归）；**结论待 Neng 收口后回写**，本节**不写「已通过」** |
| 真源零写入（本节自身） | 本节**只读**：未改代码 / 真源，未跑打包 / 部署 / 上传，未动 `frontend/dist/**` |

**追加读数追记（2026-09-24 22:08 CST 实测 · 只追加 · 本节新增行已按现读数更正，§32-2 登记值原文保留）**

- **实测（22:08 CST）**：`frontend/dist/build/h5/index.html` mtime = **2026-09-21 07:23:37**（**未变**）· `frontend/dist/build/mp-weixin/app.json` mtime = **2026-09-24 21:59:22**（**整树 219 文件同批写入**，时点 **21:59:22**，即本节初稿时点 **21:54** 之后）。
- ⚠️ **本册不代判定**：该次小程序写入的**执行方（是否属本批批次）、是否为完整构建、是否真正含本批三文件改动**，本节**均未验证**（本节**未执行打包**、未做任何产物内容判据）⇒ **不得**据本行认为小程序「已重打完毕 / 可免重打」；打包 / 部署 / 上传仍按 §32-1 – §32-7 **逐项执行并以本节判据复核**。
- **本节未做**：未改代码 / 真源，未跑打包 / 部署 / 上传，未动 `frontend/dist/**`（该次写入**非本节所为**，本节只登记读数）。

**追记更正（**追加实测 · 只追加** · 上列「⚠️ 本册不代判定」行措辞**原文保留**，其语义**自本块起被覆盖**）**

- **新增只读实测**：`frontend/dist/build/mp-weixin` **共 219 个文件、mtime 均为 2026-09-24 21:59**（**整树重写**；**执行方未核实**）。
- **产物内容判据（只读实测 · 特征串命中数）**：`搜索本家族人物姓名` = **1** 个文件 · `背包空间不足，无法合成` = **1** · `inv-tip-btn` = **2** · `本格为余数` = **1** · `tree-hall` = **7** ⇒ **实测产物已含本批改动** —— 上列「是否真正含本批三文件改动 = **未验证**」**自本块起关闭**。
- ⚠️ **仍未核实项**：该次小程序写入的**执行方**（是否属本批批次）**仍未核实** ⇒ 仍**不得**据「mtime 已新 / 内容已含本批改动」免除重打；打包 / 部署 / 上传仍按 §32-1 – §32-7 **逐项执行并以本节判据复核**。
- **H5 侧不变（陈旧）**：`frontend/dist/build/h5` 仍 = **2026-09-21 07:23:37**（**陈旧**）⇒ **部署时 H5 必须重打**。
- **本块未做**：未改代码 / 真源，未跑打包 / 部署 / 上传，未动 `frontend/dist/**`。

### 32-8 §32-3 / §32-5 追记：**归属确认（归 Kevin 本人）+ `npm test` 终值基线回填**（**追加 · 2026-09-24 · 只追加 · 不改 §32-0 – §32-7 历史行**）

> **性质**：**部署台账追加登记**（**只追加**）—— **未改代码、未写真源、未执行任何打包 / 部署 / 上传 / 重传**。本节即 `AGENTS.md` **§7「真源写入登记 · 2026-09-24 归属确认追记」行**、**§7「`npm test` 终值基线」行**与 `docs/sibling-order.spec.md` **§17** 三处所引「**`docs/PENDING_DEPLOY.md` §32-8 (1) / (2)**」的**落点本身**（该三处引用自本节起闭合）。§32-3 与 §32-5 的**全部既有行**（含 §32-3「本节复核」块 + 「未决项 ①②」、§32-5「⚠️ 终值」行）**一律原文保留**，其语义**自本节起被覆盖**（口径 = `AGENTS.md` §0 第 4 条「历史版本行不机械改写」）。

**(1) §32-3 追记：4 笔 `edit_fee` 的归属 = 归 Kevin 本人（已当面确认）**

| 项 | 口径 / 读数 |
|---|---|
| 触发方 / 形态 | **人工前端编辑会话（H5 `5199`）**、**逐笔走计费闸门**（`type = 'edit_fee'`、每笔扣 1 片竹片）⇒ **非脚本 / 非直改文件 / 非本批代码**（本批**未新增任何写路径**） |
| 归属（定稿） | **归 Kevin 本人** —— **Kevin 于 2026-09-24 当面确认**（operator 手机号 `16601061656` / 角色 `chief_editor` / 昵称「季节」；**64 秒内 = 1 次拖动排行 + 3 次人物保存**） |
| §32-3「未决项 ①」处置 | ✅ **已办结** —— **写入主体已确认**（见上）；**备份已补建** = 只读快照 `~/jiazu-backups/2026-09-24-stage-backup/`（含 `migrate-output/` + `config/` 全量 + `MD5-LEDGER.txt` **32,671 B**，时点 **2026-09-24 18:30**）⇒ §32-3 的「建议照 2026-09-23 先例补建只读快照」**已落地** |
| §32-3「未决项 ②」处置 | ✅ **已办结** —— **`AGENTS.md` §7 追加行已落盘**（「真源写入登记 · 2026-09-24 追记」+「归属确认追记」两行）；**同步定稿** = `docs/sibling-order.spec.md` **§17**（排行落点的真源侧自证） |
| 结论 | **无需回滚 / 退费** —— 4 笔全为**走闸门的正常编辑**（逐笔扣 1 片、**零冲正**：`fee_refund` **0 笔**）、树内变更面自洽、**无越权写入 / 无绕过闸门 / 无直改文件痕迹** |
| ⚠️ 易误判口径 ① | **不得**把树内变更概括为「2 个 person 节点」—— **实为 3 处**（2 person + **1 个 family 记录**：`families.103f95b8792451191a492bcabff3.child_handles` **9 元素整体重排、集合等价**；顾纯海 `…fb261f` **index 6 → 3** = 第 7 位 → 第 4 位，与流水 `desc` **逐字吻合**） |
| ⚠️ 易误判口径 ② | **「735 → 723」≠ 这 4 笔** —— 竹片批次 `bl_mu67o50m30bxt` 自 **2026-09-23 只读快照**（**735**）以来累计 **12 笔 `qty = 1`**（**8 笔在 2026-09-23** + **4 笔在本轮窗口**）⇒ **735 − 12 = 723**（现盘 `bamboos[0].qty = 723`）；**本轮只占 −4 片**，另 **−8 片不得记在本批头上** |
| 读数不重写 | §32-3「本节复核」块的 4 条实测读数（`newermt` **4 条**、逐条 `mtime` / `md5`、计费流水 `txs` 136 → 149 与 4 笔 `edit_fee`、逐节点差异 **2 个节点**）**继续有效、逐字不变**；本节**只补归属与处置**，**不改任何读数、不新增读数** |

**(2) §32-5 追记：`npm test` 终值基线回填（挂账关闭）**

| 项 | 值（**引用已登记读数 · 本节未复跑、不自报**） |
|---|---|
| 命令 | `cd /Users/kevin/bistro/jiazu && npm test` |
| 终值 | **480 tests / 480 pass / 0 fail / 0 skipped（exit 0）** —— **两次读数同值、无第三值** |
| 两次读数 | **Neng 终校复跑 2026-09-24 20:18 CST** + **Jing 收口复跑 2026-09-24 20:31:17–20:31:19 CST** |
| TAP 逐字 | `1..480` / `# tests 480` / `# pass 480` / `# fail 0` / `# cancelled 0` / `# skipped 0`；`not ok` 行 = **0 条** |
| `duration_ms` | **2129.6**（Neng）/ **2363.5**（Jing） |
| 注册一致性 | `scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = **29**（**未注册 = 假绿**） |
| 类型检查 | `cd frontend && npm run type-check`（`vue-tsc --noEmit`）= **EXIT 0**（Neng 实测） |
| 门槛 | ✅ **已达标** —— §32-5 的「⚠️ 终值以 Neng 终校复跑为准」**挂账自本行起关闭**（`AGENTS.md` §7 同条已落盘）；执行打包 / 部署前仍须做**冻结时点终校** |
| 仍未做的事（如实登记 · **不得**据本节认为已部署） | ① 云函数产物**未重打包**（§32-1 产物判据实测 = **0**，md5 仍 `d61a8aebfb3f3095baae4e1e731fd675`）；② 前端 **H5 产物早于本批**（`2026-09-21 07:23:37`；小程序产物已在本轮窗口被重写为 `2026-09-24 21:59:22`，**完整性未验证**，见 §32-7 追记）⇒ **打包 / 部署 / 上传 / 重传仍须按 §32-1 – §32-7 逐项执行** |

> **本节边界**：追加式登记 —— **未改代码、未写真源、未执行任何打包 / 部署 / 上传 / 重传、未 commit**；§32-0 – §32-7 的历史行**一律原文保留**。

**(3) §32-3 追记 · 真源写入登记：`jiazu_assets.json` 于 2026-09-24 21:52:50–21:55:12 被写入（**归 Kevin 本人**）**（**追加 · 只追加 · 不改 §32-8 (1) / (2) 既有行**）

> **性质**：**部署台账追加登记**（**只追加**）—— **未改代码、未写真源、未执行任何打包 / 部署 / 上传 / 重传**。本块补登 §32-3「真源零写入 / 内容 `md5` 恒为 `9f17a77f7871584a563047c3ab45f09e`」与 (1) 之后的**又一次内容变**；§32-3 全部既有行、§32-8 (1) / (2) 既有行**一律原文保留**，其语义**自本块起被覆盖**。

| 项 | 口径 / 读数（**逐字引用 · 不得改写 / 不得推算**） |
|---|---|
| 写入窗口 | **2026-09-24 CST 21:52:50–21:55:12** |
| 被写真源 | `migrate-output/collections/jiazu_assets.json`（size **106872 B**、mtime **Sep 24 21:55**） |
| 归属（定稿） | **归 Kevin 本人** —— 他在 **5199** 上**实操测行囊的合成 / 分解**（**非脚本 / 非直改文件**） |
| 账本 5 笔新流水 | operator `166****1656` / `chief_editor`：`jade_decompose` `2026-09-24T13:52:50.251Z`（ref `jd_mu592iykburg5`）· `jade_synth` `13:52:55.606Z` · `jade_synth` `13:53:00.217Z` · `jade_synth` `13:53:02.950Z` · `jade_decompose` `13:55:12.053Z`（ref `jd_mu9mnogl1oi2x`） |
| 该用户 `txs` | **149 → 154** |
| 字段变化 | `seeds` 批次 **1 → 3**、`jades` **11 → 12** |
| 文件内容 `md5` | **`610cc94d39feb90fedfe2f41e164f69c`（18:30 快照）→ `6977ad9a5a713d1951453208a09671d0`** |
| 同窗口另一文件 | `migrate-output/collections/jiazu_market.json` mtime **21:54**（**同源 = 市集页访问**） |
| 结论 | **归 Kevin 本人、无需回滚 / 退费** |
| 口径备注 | 「读 `GET /assets/summary` 触发 `sweep` 回写」**只能解释 `mtime` 变、不能解释内容变** —— 本次**内容变已由上述 5 笔流水完全解释** |
| 同步登记 | `AGENTS.md` **§7「真源写入登记 · 追记」行**（本册本块 = 其落点） |
| 本块未做 | 未改代码 / 真源，未跑打包 / 部署 / 上传 / 重传，未 commit |

### 32-9 §32-2 追加行：V3「灵石共鸣」特效批（`components/asset-inventory/asset-inventory.vue`）进前端重打面（**追加 · 2026-09-25 · 只追加 · 不改 §32-0 – §32-8 历史行**）

- **上云动作与判据** = **重打 H5 产物** + `npm run build:mp-weixin`；判据 = `dist/build/mp-weixin/…/asset-inventory.wxss` 的 `@keyframes` 计数 = **0**、`animation` 计数 = **0**，且主包体积不超 2,097,152 B（现盘实测 **2,025,818 B**，余 **71,334 B**）；**本批未部署**（**未打包 / 未上传 / 未重传**，云函数产物与前端产物均未动）。
- **口径与已接受差异登记落点** = `docs/economy.spec.md` **§14-12**（本节只登记上云动作与判据，**不复写** §14-12 正文）。

---

## 33. 本批：**好友关系 + 兰帖物品扩展**（**代码批次 + 新集合批次**：云函数新增路由 + 前端新页面 + **新增集合 `jiazu_friends`**）（Jing 制度员 · 2026-09-25 · **只追加 · 不改 §0–§32 历史行**）

### 33-0 总览

- **本批性质**：① **代码批次**（`cloudfunctions/compat-api/**` 新增好友域与兰帖路由 + `frontend/src/**` 新增页面 / 入口 / 行囊增量）；② **新集合批次**（**新增 `jiazu_friends`**，必须补进上传脚本 `COLLECTIONS`）；③ **字段批次**（`jiazu_assets.users[<手机号>]` **新增 2 个字段** `scroll_fragments` / `scrolls`）。
- **本轮无云端数据修正**（不重传树 JSON、不删旧详情键、不改真源 `migrate-output/` 与 `config/`）。
- **⚠️ 本批含【待裁】项**：`docs/friend-domain.spec.md` **§15**（13 条）与 `docs/economy.spec.md` **§15** 尾注 2 处（层位 / 默认序插入点）——**未裁前不得据任一案判实现负**；本节只登记**动作与判据形态**，**不预判口径**。
- **状态**：**本节为待执行清单**（**未打包 / 未部署 / 未上传 / 未重传**；结论由执行批与质检收口后回写，**本清单不预填**）。

### 33-1 必登 ①：云函数 `compat-api` **必须重打包 + `tcb fn deploy`**

- **为什么必登**：好友域与兰帖路由全在 `cloudfunctions/compat-api/**` ⇒ **不重打包，云端新路由 404 / 静默返旧口径**（口径见 `AGENTS.md` §2.1「不要忘记云函数重打包」；先例 §11-1 / §14-1 / §16-1 / §17-1 / §31-1 / §32-1）。
- **打包命令（沿用既有流程，逐字取自 `docs/economy.spec.md` §12-5）**：
  - `npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`
  - 再 `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087e`
- **判据形态**（**只登记形态，不登记数值** —— 数值一律以对应命令的实际输出为准）：

  | # | 判据 | 命令形态 | 通过条件 |
  |---|---|---|---|
  | 1 | 新路由字面已进产物 | `grep -c "<路由字面>" cloudfunctions/deploy/compat-api/index.js` | **≥ 1**（每个新增路由**各测一条**；**0 命中 = 未打包或漏路由 ⇒ 判负**） |
  | 2 | 新增字段名已进产物 | `grep -c "scroll_fragments" cloudfunctions/deploy/compat-api/index.js`、`grep -c "scrolls" …` | **≥ 1**（**各一条**） |
  | 3 | 作废字段名**未**进产物 | `grep -c "bamboo_fragments" cloudfunctions/deploy/compat-api/index.js` | **= 0**（**否定项判据**，配套 R-1；**非 0 ⇒ 判负**） |
  | 4 | 新增枚举字面已进产物 | `grep -c "friend_renew" …`、`grep -c "scroll_synth" …`、`grep -c "scroll_decompose" …`、`grep -c "friend_reward" …` | **≥ 1**（**逐枚举各一条**；枚举字面以 `docs/friend-domain.spec.md` **§9** 的登记为准） |
  | 5 | 冲正未另造 | `grep -c "fee_refund" …` | **≥ 1**，且**不得出现**第二套冲正类型字面（**承 `docs/economy.spec.md` §4-6 尾注**） |

  > **判据纪律**：上表 5 组判据**均为「形态」登记**（`grep -c` ≥1 或 = 0），**不含任何数值读数**；执行时**逐条贴实际输出**，**不得预填、不得推算**。

- **⚠️ 前置门槛（沿用既有口径）**：**`npm test` 未全绿前不得打包 / 部署 / 重传**（承 §29-6 第 1 条）；`npm test` 与类型检查的读数**以对应命令的实际输出为准**。
- **实现位置提醒（承 `docs/economy.spec.md` §6 头部）**：账号级路由（好友 / 资产 / 市集）必须挂在 `index.js` 的**树编辑闸门之前**，否则没有 `X-Tree-Id` 的账号级请求会先被 400 拦掉。

### 33-2 必登 ②：前端 **H5 + 小程序重打**

- **H5**：`build:h5`（带 `VITE_API_BASE`）+ `tcb hosting deploy`。
- **小程序**：`npm run build:mp-weixin` + 开发者工具上传。
- **进重打面的新增 / 变更文件（拟定，按 `docs/friend-domain.spec.md` §11 的落点）**：新增 `frontend/src/pages/friends/index.vue`；`frontend/src/pages.json`（**`pages` 数组新增一条路由 —— ⚠️ `tabBar` 数组一字不动，R-11 硬约束**）；`frontend/src/pages/mine/index.vue`（新增好友入口）；`frontend/src/business/api.ts` / `business/index.ts` / `business/types.ts`（新增封装与类型）；行囊侧（`business/inventory.ts` 及展示层）按 `docs/economy.spec.md` **§15-6** 的增量动。
- **判据形态（只登记形态）**：
  | # | 判据 | 命令形态 | 通过条件 |
  |---|---|---|---|
  | 1 | 新页面已进小程序产物 | `ls frontend/dist/build/mp-weixin/pages/friends/`（或等价路径核对） | 目录与页面文件**存在** |
  | 2 | **tabBar 结构未变** | `grep -c "pages/friends/index" frontend/src/pages.json` 与 tabBar 段核对 | **tabBar 段内 0 命中**（新路由只出现在 `pages` 数组，**不得**出现在 `tabBar.list`） |
  | 3 | 行囊新常量已进产物 | `grep -c "SCROLL_PIECES_PER_ITEM" frontend/dist/build/mp-weixin/…`（或源码侧 `grep -c`，二选一，**执行时写明用哪一侧**） | **≥ 1** |
  | 4 | 小程序真机未测（**如实登记**） | 环境无微信开发者工具时**只验产物** | 沿用既有已接受差异形态（承 §32-9 体例 / `docs/economy.spec.md` §14-12-2 #4），**未当已验** |

> **⚠️ 主包体积纪律**：本批**新增页面**（新页面 + 行囊增量）会进主包 ⇒ **新增 static 资源前必须先算体积**（承 §32-9 与 `docs/economy.spec.md` §14-12 E3「余量告急」口径）；**体积读数以对应命令的实际输出为准**，**本节不预填**。

### 33-3 必登 ③：**新增集合 `jiazu_friends` 登记进上传脚本 `COLLECTIONS`**

- **动作**：`scripts/upload-migrated-to-cloudbase.mjs` 的 `const COLLECTIONS = [...]` **追加一项 `'jiazu_friends'`**（既有形态 = 数组字面量 + `ensureCollections()` 逐个 `db.createCollection`）。
- **为什么必登**：**新增集合不入该列表 ⇒ 云端对应路由首写报错**（承 `AGENTS.md` §8 与 `docs/economy.spec.md` §12-1；先例 §11-2）。
- **判据形态（只登记形态）**：`grep -c "jiazu_friends" scripts/upload-migrated-to-cloudbase.mjs` ⇒ **≥ 1**；且 `grep -n "const COLLECTIONS" -A 30 …` 的数组字面量内**确实含该名**（**不得**只出现在注释里）。
- **形态纪律（R-15 硬约束）**：`jiazu_friends` **从设计起即为「每手机号一文档（`_id` = 手机号）+ `version` 乐观锁 CAS 重试」** ⇒ **本集合不在 §7-7 阻塞项范围内**（§7-7 针对的是 `jiazu_assets` 单文档 `_id='global'` 形态）；**但 `jiazu_assets` 的阻塞项仍然存在**（见 §33-4）。
- **本地对应**：本地模式落 `migrate-output/collections/jiazu_friends.json`（新增文件，**本批不预置数据**）。

### 33-4 ⚠️ 阻塞点（**未解除前不得上云**）

| # | 阻塞项 | 与本批的关系 | 口径出处 |
|---|---|---|---|
| 1 | **`jiazu_assets` 单文档 `_id='global'` + 仅进程内锁** ⇒ 云端多实例可**丢更新 / 双花** | **本批的字段扩展（`scroll_fragments` / `scrolls`）写在 `jiazu_assets` 上** ⇒ **本批同样受该阻塞项约束**（**不得**以为 `jiazu_friends` 走了 CAS 形态就顺带解决物品侧并发） | **`docs/PENDING_DEPLOY.md` §7-7**（跨批次 §10-2）；`docs/economy.spec.md` §4-1 尾注 / §5-7 第 5 条 |
| 2 | **`jiazu_spirit` / `jiazu_market` / `jiazu_messages` / `jiazu_ops_logs` 同形态** | 本批**复用了 `jiazu_messages`**（通知，R-16）⇒ **同受该形态约束**，上云前按 §7-7 一并评估 | 同上（§10-2 跨批次登记） |
| 3 | **本批含【待裁】口径**（`docs/friend-domain.spec.md` §15 共 13 条 + `docs/economy.spec.md` §15 尾注 2 处） | **未裁前不得据任一案判实现负**；实现若已落盘，**不得**以未裁项验收 | 本册 §33-0 |

> **上云前自检**：若 `jiazu_assets` 仍是 `_id='global'`，**本批次视为未就绪**（沿用 §7-7 末句制度）。

### 33-5 部署后冒烟验证（**按序做**；⚠️ 均为**待执行**步骤，结论由执行 / 质检收口后回写，**本清单不预填**）

1. **邀请 → 接受**：A 邀请 B ⇒ B 接受 ⇒ `GET /friends` 双侧可见、`expires_at` = 接受时刻 + 12 个月、`reward_months = 0`。
2. **窗口判定**：距到期 > 30 天时发起续约 ⇒ **409**；构造 ≤ 30 天（或副本改时刻）⇒ 通过。
3. **双边复校（R-10）**：发起方自持 < 1 枚成品兰帖 ⇒ 发起即 **409**；发起方自持足、确认前把兰帖花掉 ⇒ 确认时 **409** 且**申请仍保留**（未超时前可再次确认）。
4. **续约成功**：双方各 −1 枚成品兰帖、`reward_months += 1`、`expires_at` 重算（**从 `T0` 起算**，逐个锚点核对 12 / 13 / 24 个月三例）。
5. **奖励池**：触发一次活动 ⇒ 本人得**石榴籽碎片 1 + 竹片 1**（竹片入 `bamboos`）、每位**生效中**好友按分母得分（**缓冲期好友不参与**）；**不整除时余数销毁**；**重复触发同一活动实例不重复分发**。
6. **不连锁**：收件人收到的碎片**不再**触发新的池分发（无二次流水）。
7. **兰帖碎片上限**：`scroll_fragments` 到第 10 个 ⇒ **立即自动合成 1 枚成品兰帖**、碎片取余；**不得**出现「碎片 10 个 + 待合成」中间态。
8. **兰帖分解**：分解 1 枚成品 ⇒ 返还 **9 兰帖碎片**（**断言分解后碎片 ≠ 10、不触发自动合成** —— R-7 回环防护）。
9. **`expires_at` 永久**：新写入的兰帖批次 `expires_at` **恒为 `null`**；**缺省不静默永久**（缺省即抛错）。
10. **到期缓冲期**：过了原定到期时刻未续约 ⇒ 关系**保留、列表可见**、**奖励停发**、**不能发起续约**；缓冲期内**可单方解除**（立即终止）。
11. **缓冲期满自动解除**：缓冲期结束 ⇒ 关系**彻底解除**（惰性 sweep 推进）。
12. **解除不返还**：主动解除后**不返还已消耗的兰帖**；**历史奖励保留不追回**。
13. **重建清零**：彻底解除后重建 ⇒ **只能重新发起邀请**；新关系 `reward_months` **从 0 起算**。
14. **无定时任务核对**：**不得**出现新注册的 cron / 定时器（R-13：全部惰性 sweep）。
15. **作废字段核对**：全仓 `grep -rn "bamboo_fragments"` ⇒ **0 命中**（R-1 否定项）。
16. **行囊展示**（承 `docs/economy.spec.md` §15-6）：碎片类 **2 种**各占 1 格；兰帖 `floor(Σqty / 100)` 格 + 余数占格；**默认序落位待 Kevin 裁定后**核对（**未裁前不得判负**）。

### 33-6 明确**不需要**上云的东西

- **`migrate-output/` 与 `config/` 的既有真源内容**：本批**无数据修正**，**不重传树 JSON、不删旧详情键、不改 `config/tree-meta.json`**。
- **`auth-server/**`**：已退役 / 仅排查用的遗留链路，**不进云**（§6）。
- **`scripts/*` 一次性修复脚本、`shell-scripts/**`、`/tmp/jiazu-*`、`backups/**`**：离线 / 临时产物，**不参与打包、不同步云端**（`AGENTS.md` §2.4）。
- **`docs/**`**：规格与台账**不上云**（本册本节即纯台账追加）。
- **`cloudfunctions/deploy/**`**：是**打包产物**，**不是编辑对象**（`AGENTS.md` §2.1）。

### 33-7 本节的口径落点（**本节只登记上云动作与判据，不复写正文**）

| 口径面 | 落点 |
|---|---|
| 好友域完整口径（生命周期 / 时间轴 / 续约 / 奖励池 / 新集合字段表 / 接口清单 / 枚举 / 权限 / 前端落点 / **待裁 13 条**） | **`docs/friend-domain.spec.md`**（本轮新立分册；§15 = 待裁清单） |
| 物品域增量（竹简碎片 = 既有竹片 / `scroll_fragments` / `scrolls` / 合成分解 / 行囊衔接） | **`docs/economy.spec.md` §15**（本轮追加章节） |
| 计费（续约消耗成品兰帖，**非竹片**） | **本轮未落入** `docs/economy-fee.spec.md` §3-1 扣费矩阵（受「只许改 3 个文件」约束）⇒ **登记为待办**；该册竹片侧口径**一字不改** |
| 通知文案 | `docs/economy-ops.spec.md` §6（本批**不写文案**） |

### 33-8 本节未做

- **未改任何代码 / 配置 / `migrate-output/` / `config/`**；**未改 §0–§32 任何历史行**。
- **未打包 / 未部署 / 未上传 / 未重传**（云函数产物与前端产物**均未动**）。
- **未跑测试 / 未跑构建**；**未写任何实现现状读数**（测试条数 / 构建字节 / 当前行数等**一律不写**）。
- **未 commit / 未 push**。

---

## 34. 追补（好友域规格追记 v3）：**新增集合 `jiazu_invites` + 邀请链路 2 路由 + 三个新页面进子包**（制度员 · 2026-09-25 · **只追加 · 不改 §0–§33 历史行**）

> **本节性质**：`docs/friend-domain.spec.md` **§17 追记**与 `docs/economy.spec.md` **§16** 带来的**部署面增量**。**只追加**；**未打包 / 未部署 / 未上传 / 未重传**。判据形态沿用 **§33**。

### 34-1 新增集合与形态变更（**并入 `COLLECTIONS`，否则首写报错**）

- **`jiazu_invites`**（新增）：**每被邀请人一文档**，`_id` = **被邀请人手机号**，字段 = `inviter_phone` / `created_at` / `rewarded`。
- **`jiazu_friends`**（§33 已有）：**形态变更为「每关系一文档」**（`_id` = 双方手机号升序拼接；列表查询用 `colWhere`）。
- 与 §33 同规则：**两者都必须登记进 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 列表**。

### 34-2 云函数重打包（新增 / 变更路由）

- 新增 **`GET /invite/me`**、**`POST /invite/accept`** —— **两条都注册在「树编辑闸门」之前、均需登录、无效 token 回 401（不降级 guest）**。
- 邀请奖励 = **9 石榴籽碎片 + 11 兰帖碎片**（**被邀请人不得奖**）；日限 **3 次/日**（北京自然日；超限**静默不发、不回滚注册**）；防刷三条（不自邀 / 同一被邀请人只奖一次 / 邀请人必须已注册）。
- 奖励池触发点：**批 2 只挂后台 `POST /admin/assets/grant` 通道与内部函数，不接任何用户侧活动**（批 3 任务中心再接）。
- 启用 **`invite_code`** 注册参数（**邀请码 = 邀请人手机号，不引短码映射表**）。

### 34-3 前端两产物重打

- **三个新页面（好友页 / 邀请相关 / 任务中心）一律注册为 `subPackages` 子包**（不占主包余量；主包余量读数**以对应命令的实际输出为准**）。
- **入口改落「家谱页」**（**不动 tabBar 结构**；tabBar `list` 数组一字不动）。
- 行囊常量与文案：**前端 `SCROLL_FRAGMENTS_PER_ITEM` = 100、`SCROLL_PIECES_PER_ITEM` = 100**（后端真源导出名 = **`SCROLL_PIECES_PER_SCROLL`**，**两处不得混用**，见 `docs/economy.spec.md` §16-2）；文案统一 **`标准石榴籽` → `石榴籽`**（单一来源 = `inventory.ts` 的 `seed` 显示名；**行级改写待代码同批改名后执行**，见该册 §16-3）。**以上取值一律以对应命令的实际输出为准。**

### 34-4 本节未做

- **未改任何代码 / 配置 / `migrate-output/` / `config/`**；**未改 §0–§33 任何历史行**。
- **未打包 / 未部署 / 未上传 / 未重传**；**未跑测试 / 未跑构建**。
- **未写任何实现现状读数**（测试条数 / 构建字节 / 当前行数等**一律不写**）。
- **未 commit / 未 push**。
- **未裁项**（任务中心每项任务的周期与单次奖励量 / 贡献类核实表单形态 / 邀请码额外风控 / `_id` 分隔符与 `colWhere` 过滤字段名 / 签到与 R-4「签到逻辑不动」的并存读法 / 文案改名行级落点）**未落任何实现** —— **未裁前不得据任一案判任何实现负**（清单见 `docs/friend-domain.spec.md` §17-9）。

---

## 35. 本批：**兰帖 / 行囊 / 图标 + 好友关系域 + 邀请链路**（**代码批次 + 新集合批次**；**批 3 任务中心 = 规划中 · 不做动作**）（Jing 制度员 · 2026-09-25 · **只追加 · 不改 §0–§34 历史行**）

> **本节性质**：本批已由 **§33**（好友关系 + 兰帖物品扩展）与 **§34**（邀请链路追补 v3）分别登记；本节把**本批实际落盘的三个动作面 + 一个规划面**收口成**一张合并上云清单**，并补齐**资产生成面（兰帖 / 兰帖碎片账本）· 前端行囊与图标面 · 文案统一面**、**真源写入登记**与 **§7-7 复核点**。体例、判据形态与门槛**一律沿用 §33 / §34**，本节**不重复其正文**、**不预填任何读数**（凡数值一律写「**以对应命令的实际输出为准**」）。
>
> **§33 / §34 未被本节取代**：三节并存，冲突时以**更具体的一条**为准（本条只在收口面追加，**不回改任何历史行**）。

### 35-0 总览（本批动作面 = **4 项**）

| # | 动作面 | 落点 | 本轮动作定性 |
|---|---|---|---|
| **①** | **兰帖 / 兰帖碎片资产 + 前端行囊 / 图标 + 文案统一** | 后端 `cloudfunctions/compat-api/lib/economy-ledger.js`（及其调用面）· 前端 `frontend/src/business/inventory.ts` / `business/asset-text.ts` / `pages/assets/index.vue` 等 + **`frontend/src/static/icons/*.png`（6 图标位图化）**；文案统一 **`标准石榴籽` → `石榴籽`**（单一来源 = `inventory.ts` 的 `seed` 显示名） | **云函数重打包 + 前端 H5 / 小程序重打**（内容批次，**无新集合**） |
| **②** | **好友关系域** | `cloudfunctions/compat-api/lib/friends.js` + **新集合 `jiazu_friends`** | **云函数重打包 + 新集合建库 + 前端重打**（明细 = §33） |
| **③** | **邀请链路** | `cloudfunctions/compat-api/lib/invite.js` + `index.js` **两条路由** + **新集合 `jiazu_invites`** + `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` **已 12 → 13**（**以文件实际为准**，**项数不在本节预填**） | **云函数重打包 + 新集合建库 + 注册脚本已同步**（明细 = §34） |
| **④** | **批 3 任务中心** | `docs/task-center.spec.md`（§12 部署要点） | **规划中 · 本轮不做任何上云动作**（只登记规划面，见 §35-4） |

- **本轮云端数据修正 = 无**：**不重传树 JSON、不删旧详情键、不改 `config/tree-meta.json`**（同 §33-0）。
- **真源侧**：本批窗口内出现 **1 次内容写入**（`migrate-output/collections/jiazu_assets.json`），**归属待 Kevin 确认** —— 完整登记见 **§35-3**。
- **本批含【待裁】项**：`docs/friend-domain.spec.md` **§15**（13 条，含 **§15-5** 存储形态张力 / **§15-13** 兰帖在行囊默认序中的位置）与 `docs/economy.spec.md` §15 尾注 —— **未裁前不得据任一案判实现负**。
- **状态**：**本节为待执行清单**（**未打包 / 未部署 / 未上传 / 未重传 / 未建集合**）；结论由执行批与质检收口后回写，**本清单不预填**。

### 35-1 必登 ①：云函数 `compat-api` **必须重打包 + `tcb fn deploy`**（本批**唯一**一次重打包覆盖 ①②③）

- **为什么必登**：本批三面（账本字段 / 好友域 / 邀请链路）全在 `cloudfunctions/compat-api/**` ⇒ **不重打包，云端新路由 404 / 静默返旧口径**（`AGENTS.md` §2.1；先例 §11-1 / §14-1 / §16-1 / §17-1 / §31-1 / §32-1 / §33-1）。
- **打包命令（沿用既有流程，逐字取自 `docs/economy.spec.md` §12-5 / 本节承 §33-1）**：
  - `npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`
  - 再 `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087e`
- **判据形态（**只登记形态，不登记数值** —— 逐条执行时贴实际输出）**：

  | # | 判据 | 命令形态 | 通过条件 |
  |---|---|---|---|
  | 1 | 兰帖 / 兰帖碎片账本字段字面已进产物 | `grep -c "scroll_fragments" cloudfunctions/deploy/compat-api/index.js`、`grep -c "scrolls" …` | **≥ 1**（**各一条**） |
  | 2 | 好友域路由字面已进产物 | `grep -c "<friends 路由字面>" …`（**字面以代码为唯一源**，清单 = `docs/friend-domain.spec.md` §8） | **≥ 1**（**每条路由各一条**；**0 命中 = 未打包或漏路由 ⇒ 判负**） |
  | 3 | 邀请链路两路由字面已进产物 | `grep -c "/invite/me" …`、`grep -c "/invite/accept" …` | **≥ 1**（**各一条**） |
  | 4 | 两新集合名字面已进产物 | `grep -c "jiazu_friends" …`、`grep -c "jiazu_invites" …` | **≥ 1**（**各一条**） |
  | 5 | 作废字段名**未**进产物 | `grep -c "bamboo_fragments" …` | **= 0**（**否定项**，承 R-1；**非 0 ⇒ 判负**） |
  | 6 | 新枚举字面已进产物 | `grep -c "friend_renew" …`、`grep -c "scroll_synth" …`、`grep -c "scroll_decompose" …`、`grep -c "friend_reward" …` | **≥ 1**（**逐枚举各一条**；枚举清单以 `docs/friend-domain.spec.md` §9 与实际代码为源） |
  | 7 | 冲正未另造 | `grep -c "fee_refund" …` | **≥ 1**，且**不得出现**第二套冲正类型字面（承 `docs/economy.spec.md` §4-6 尾注） |
  | 8 | 好友 / 资产类账号级路由挂在**树编辑闸门之前** | 读 `cloudfunctions/compat-api/index.js` 的路由注册次序 | **在闸门之前**（否则无 `X-Tree-Id` 的账号级请求先被 400 拦掉，口径 = `docs/economy.spec.md` §6 头部 / §33-1） |

- **⚠️ 前置门槛（沿用既有口径）**：**`npm test` 未全绿前不得打包 / 部署 / 重传**（承 §29-6 第 1 条）。
  - ⚠️ **注册差量必核**（**本手册口径：未注册 = 假绿**，承 §14-4 / §16-1）：`scripts.test` 的**注册项数**与磁盘 `cloudfunctions/compat-api/lib/*.test.js` 的**文件数**执行时**自行重算并贴输出**；**两数不等即视为覆盖不全**（本批新增测试文件 `lib/friends.test.js` / `lib/invite.test.js` 属**必核项**；**注册端由另一条改单同步**）。**Jing 复核读数（2026-09-25 13:40:16 后）**：`scripts.test` **注册 = 32 = 磁盘 = 32、未注册 = 0** ⇒ **差量已关闭**（**落笔时读数 = 30 / 32，两读数并存**）；**执行时仍须自行重算**。**注册数 / 文件数 / 测试条数一律以对应命令的实际输出为准，本节不预填。**
- **重打包后本轮 `deploy/` 产物 md5 与 §32-x / §34 的旧产物 md5 必然不同** ⇒ **以命令实际输出为准**（**旧行一律原文保留**）。

### 35-2 必登 ②：**两新集合必须手工建**（**云端首写前**）

- **动作**：云端 CloudBase **手工建**两集合 —— **`jiazu_friends`** 与 **`jiazu_invites`**（控制台建库，或执行上传脚本时由 `ensureCollections()` 建；**无论走哪条，判据 = 首写前集合已存在**）。
- **形态（逐字取自 §33-3 / §34-1）**：
  - `jiazu_friends` = **每关系一文档**（`_id` = 双方手机号升序拼接；列表查询用 `colWhere`）；
  - `jiazu_invites` = **每被邀请人一文档**（`_id` = 被邀请人手机号；字段 `inviter_phone` / `created_at` / `rewarded`）。
- **为什么必登**：**新增集合不入 `COLLECTIONS` ⇒ 云端对应路由首写报错**（`AGENTS.md` §8；先例 §11-2 / §33-3）。
- **判据形态（**只登记形态**）**：
  | # | 判据 | 命令 / 动作形态 | 通过条件 |
  |---|---|---|---|
  | 1 | 脚本已登记两集合 | `grep -c "jiazu_friends" scripts/upload-migrated-to-cloudbase.mjs`、`grep -c "jiazu_invites" …` | **≥ 1**，且 `grep -n "const COLLECTIONS" -A 30 …` 的**数组字面量内确实含该名**（**不得只出现在注释里**） |
  | 2 | 云端集合已存在（**首写前**） | 控制台集合列表核对，或对空集合做一次读（`colWhere`）**不报「集合不存在」** | **存在**（读返空**不算**该集合已建的充分证据时，以控制台为准；**执行时写明用了哪一侧**） |
  | 3 | 本地对应文件 | `ls migrate-output/collections/jiazu_friends.json migrate-output/collections/jiazu_invites.json` | **首写后存在**（**本批不预置数据**，**首写前不存在属正常**；**不得**为凑判据手工造文件） |
- **顺序纪律（按序做）**：**① 先建两集合 → ② 再重打包 + `tcb fn deploy` → ③ 再前端 H5 / 小程序重打**（**首写在集合已建之后**；承 §7-7「上云前自检」体例）。
- **形态纪律**：两集合**从设计起**即「每关系一文档 / 每被邀请人一文档」⇒ **不复制 §7-7 欠债**；**但复核点必做（见 §35-5）**。

### 35-3 必登 ③：**真源写入登记 + 补救快照**（本批窗口 · **归属 = 待 Kevin 确认**）

| 项 | 登记值（**均为 Jing 只读实测 / 派单给定事实**） |
|---|---|
| 写入文件 | `migrate-output/collections/jiazu_assets.json` |
| 写入时点 | **2026-09-25 12:57:56**（派单给定事实）；Jing 实测 `mtime` = **2026-09-25 13:32:33**（**动值** —— 每次读 `GET /assets/summary` 都可能移动，同 §32-3 体例）；`size` = **109351 B** |
| 内容 `md5` | `a221831f17a394cfb5a17ce9c2cb23ef`（前）→ **`594d25dfea0f78a17c86851e86401169`**（后 · 现盘实测 · 写后复核同值） |
| 触发方 | **待定**（两个子代理各自报出该写入、**均声明非自己写入** ⇒ 第三方触发）；形态备注 = `3100` 端口**有 node 在监听**（实测 `node` PID 69131）⇒ 形似**经 UI / API 的既有链路写入** —— **初步形态描述，不构成归属裁定** |
| 归属 | **待 Kevin 确认**（**本册不代裁定**；先例 = 2026-09-23 `shen_27784_01` / 2026-09-24 `gu_39038_01` 的「待确认 → 追记确认」体例） |
| 判定初步 | **非本批代码所写**：该文件内 `grep -c "scroll_fragments"` = **0**、`grep -c "scrolls"` = **0**（现盘实测）⇒ **不含本批新账本字段** |
| 补救快照 | **已补建** `~/jiazu-backups/2026-09-25-stage-backup/`（`migrate-output/` + `config/` 全量 + `MD5-LEDGER.txt`）；**条目数 = 342**（= 快照内实际文件数 **342** = 唯一路径数 **342**；ledger **33091 B**）；**快照内该文件 md5 = `594d25dfea0f78a17c86851e86401169` = 现盘一致**；**原文件未改 / 未移 / 未删**（`cp -a` 只读拷贝） |

- **口径（承 `AGENTS.md` §2.1）**：**后续本机验证优先用 `/tmp` 副本栈**（`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 钩子），**避免无谓 touch 真源**；确需对真源跑时**先备份、后登记前后 md5**。
- **本节与 §32-3 的关系**：§32-3 是 **2026-09-24** 窗口的「真源零写入 / 读侧 sweep 回写」登记；**本行是新窗口、新事实**（**内容已被写**），§32-3 **原文保留、不改**。

**§35-3 追记（追加 · 2026-09-25 · **只追加 · 不改 §35-3 既有正文**）**：上表行「**归属 = 待 Kevin 确认**」措辞**原文保留**，其语义**自本追记起被覆盖**（口径 = `AGENTS.md` §0 第 4 条「历史版本行不机械改写」）。**性质 = 纯台账追加**（**未改代码、未写真源、未打包 / 未部署 / 未上传 / 未重传、未跑测试 / 未跑构建、未 commit**）。本块即 `AGENTS.md` **§7「真源写入登记 · 2026-09-25 归属确认追记（归 Kevin 本人 · 已当面确认）」行**所引「**§35-3 追记**」的**落点本身**。**读数（均 Jing 只读实测 / 派单给定事实）**：

| 项 | 值 |
|---|---|
| 归属（定稿） | **归 Kevin 本人** —— **Kevin 于 2026-09-25 当面确认**（本人所为） |
| 旧行处置 | §35-3 表内「归属 = **待 Kevin 确认**」措辞**原文保留**、语义**自本追记起被覆盖**；§35-3 其余各行**一字未改** |
| 写入时点 / 文件 | **2026-09-25 12:57:56 CST**（派单给定）/ `migrate-output/collections/jiazu_assets.json` |
| 内容 `md5` | `a221831f17a394cfb5a17ce9c2cb23ef`（前）→ `594d25dfea0f78a17c86851e86401169`（后 · 现盘复核同值） |
| 改动面特征（流水实测 · 窗口 = 2026-09-25 12:40–13:10 CST） | **命中 1 笔**：`tx_mughpdj2qfzbt` / `ts` = `2026-09-25T04:57:56.413Z`（= **12:57:56.413 CST**，**与写入时点同秒**）/ `type` = `jade_synth` / `desc` 逐字 = `合成石榴籽玉` / `delta` = `{seeds:-999, jades:1}` / `ref` = `{}`（空）；**该记录无 `operator` 键**（键集 = `delta` / `desc` / `id` / `ref` / `ts` / `type`）⇒ 形态 = 经 UI / API 既有链路的合成操作 |
| 判定依据 | **非本批代码所写**：`scroll_fragments` / `scrolls` 两串 **grep 均 0 命中**（现盘实测） |
| 快照 | `~/jiazu-backups/2026-09-25-stage-backup/`；**现盘实测**：ledger **342 行** = **非 ledger 文件数 342**（ledger **不含自身**）⇒ 磁盘 `find -type f` = **343**（含 ledger 自身），与本节登记的「条目数 = 342」**一致**；`MD5-LEDGER.txt` **33091 B**；**快照内该文件 md5 = `594d25dfea0f78a17c86851e86401169` = 现盘一致** |
| 结论 | **无需回滚 / 退费**（归 Kevin 本人的正常操作；**非脚本 / 非直改文件 / 非本批代码**） |
| 同步登记 | `AGENTS.md` **§7「真源写入登记 · 2026-09-25 归属确认追记」行**（本块 = 其落点） |

**未做项（本追记）**：**未跑测试 / 未跑构建 / 未改代码 / 未写真源 / 未打包 / 未部署 / 未建集合 / 未 commit**；**本册不写任何实现现状读数**（测试条数 / 构建字节 / 行数）—— 凡读数一律**以对应命令的实际输出为准**。

### 35-4 必登 ④：**批 3 任务中心 = 规划中 · 本轮不做动作**

- **本轮动作 = 无**：**不打包、不建集合、不重打前端、不写实现读数**（批 3 **未落实现**）。
- **规划面唯一落点** = `docs/task-center.spec.md`（**§12 部署要点** 只指向本册；**§13 待裁 2 项**不属本批）。
- **未来动作的登记纪律（预置）**：批 3 若**新增集合 / 路由** ⇒ **必须同步进上传脚本的集合列表与 `COLLECTIONS`**，并按**本节同体例**（§35-1 / §35-2 / §35-5 / §35-6）追加登记；**不得**留下「云端首写报错」的悬空项（口径 = `docs/task-center.spec.md` §12 第 2 条）。
- **⚠️ 未裁前不得据任一读法判实现负**（`docs/task-center.spec.md` §13-1 / §13-2）。

### 35-5 与已知部署阻塞项的关系（**§7-7 欠债 · 本批复核点**）

| # | 关系判定 | 说明 |
|---|---|---|
| 1 | **物品侧仍受 §7-7 约束（未解除）** | 本批 ① 的兰帖 / 兰帖碎片字段**仍写在 `jiazu_assets`**（设计上**不新建物品集合**，见 `docs/friend-domain.spec.md` §7-2）⇒ `_id='global'` 单文档 + 仅进程内锁 ⇒ **云端多实例可丢更新 / 双花**问题**本批物品面依旧存在**；**不得**以为新集合走了每关系一文档就顺带解决（同 §33-4 第 1 条） |
| 2 | **两新集合不复制该欠债** | `jiazu_friends` = **每关系一文档**、`jiazu_invites` = **每被邀请人一文档** ⇒ 并发面由「全体用户」缩到「**单条关系 / 单个被邀请人**」（口径 = `docs/friend-domain.spec.md` §7-1 / §17-1） |
| 3 | **通知面同受约束** | 本批复用 `jiazu_messages`（不造第二套消息域）⇒ 同形态、一并评估（同 §33-4 第 2 条） |

- **必须复核点（未复核不得判「已解除」，逐条贴实际输出）**：
  1. **形态落地复核**：两新集合的 `_id` 构造是否**确为**上述形态（**以代码为唯一源**：`lib/friends.js` / `lib/invite.js` 的 `_id` 构造）；列表查询用的**过滤字段名**（`colWhere` 口径）**属未裁项**（§34-4 尾注 / `docs/friend-domain.spec.md` §15-6）⇒ **未裁前不判负**。
  2. **同关系并发复核（**关键**）**：「每关系一文档」**只缩小并发面、不等于解除** —— 若同一关系的写协议仍是「读整份 → 改 → 整份回写」**且无 `version` 乐观锁 CAS**，**同一关系内两实例并发写仍可丢更新**（此即 `docs/friend-domain.spec.md` **§15-5【待裁】R-15 与 R-17 的张力**）⇒ **执行时须实测 / 读码确认写协议，结论以实际输出与代码为源**。
  3. **`COLLECTIONS` 复核**：两集合名均在数组字面量内（判据同 §35-2 判据 1）。
  4. **上云前自检（承 §7-7 末句）**：若 `jiazu_assets` 仍是 `_id='global'`，**本批物品侧视为未就绪**（本批**不因此被阻止登记**，但**上云决策须显式记入该欠债**）。

### 35-6 部署后冒烟验证（**按序做**；每步 = 判据 + 期望；⚠️ 结论由执行 / 质检收口后回写，**本清单不预填**）

1. **重打包判据逐串**：命令 = §35-1 表列 `grep -c` 全组 ⇒ **期望**：表列通过条件**逐条成立**（**实际输出为准**；任一否定项非 0 ⇒ 判负）。
2. **两集合已建**：控制台 / 读集合核对 ⇒ **期望**：两集合存在，账号级路由首写**不报「集合不存在」**；首写后本地 `migrate-output/collections/jiazu_friends.json` / `jiazu_invites.json` **按实际写入生成**。
3. **文案统一**：对前端**产物**（H5 `frontend/dist/build/h5/**` / 小程序 `frontend/dist/build/mp-weixin/**`）与源码侧各做一次 `grep -c "标准石榴籽"` ⇒ **期望 = 0**；`grep -c "石榴籽"` ⇒ **期望 ≥ 1**（**现行区**；**已标「已被取代 · 原文保留」的历史区旧名不计入本判据**）。
4. **6 图标位图化**：核对产物内图标资源与引用 ⇒ **期望**：图标按位图形态**已进产物**、页面不出现缺图（**逐项以实际产物路径为准**）。
5. **行囊展示（兰帖 / 兰帖碎片面）**：兰帖 = `floor(Σ scrolls[].qty / 100)` 格 + 余数格；兰帖碎片 **1–99 个占 1 格**、角标 = 实际个数 ⇒ **期望**：**不出现**「碎片满 100 个仍未自动合成」中间态；**默认序插入点（§15-13）未裁前不得判负**。
6. **好友关系建立**：A 邀请 B ⇒ B 接受 ⇒ **期望**：`GET /friends` 双侧可见、`expires_at` = 接受时刻 `T0` + **12 个月**、`reward_months = 0`。
7. **续约双边扣费**：窗口 ≤ 30 天发起并确认 ⇒ **期望**：**双方各 −1 枚成品兰帖**、`reward_months += 1`、`expires_at` **从 `T0` 重算**；窗口 > 30 天 ⇒ **期望 409**；单边兰帖不足 ⇒ **期望 409 且申请保留**（R-10）。
8. **奖励池**：触发一次 ⇒ **期望**：本人得基础奖励、每位**生效中**好友按分母得分（**缓冲期好友不参与**）、**不整除余数销毁**、**同一活动实例不重复分发**、**收件人所得不再触发新池（不连锁）**；**分母 = 0 的读法属未裁项（§15-4）⇒ 未裁前不判负**。
9. **邀请链路**：`GET /invite/me` / `POST /invite/accept` ⇒ **期望**：**均需登录**、无效 token 回 **401（不降级 guest）**；注册带 `invite_code` ⇒ **期望**：邀请人得 **9 石榴籽碎片 + 11 兰帖碎片**、**被邀请人不得奖**；**日限 3**（超限**静默不发、不回滚注册**）；防刷三条（不自邀 / 同一被邀请人只奖一次 / 邀请人须已注册）逐条成立。
10. **真源零写入核对（冒烟窗口）**：`find migrate-output config -newermt "<冒烟开始时刻>" -type f` ⇒ **期望为空**；若因读侧 `sweep` 只动 `mtime`，**须逐文件记录 `mtime` + `md5` 并登记**（口径承 `AGENTS.md` §2.1 / 本册 §32-3）。
11. **批 3 任务中心**：**本轮不验**（§35-4）。

### 35-7 明确**不需要**上云的东西

- **`migrate-output/` 与 `config/` 的既有真源内容**：本批**无数据修正**，**不重传树 JSON、不删旧详情键、不改 `config/tree-meta.json`**（**§35-3 登记的那次写入是「本地既有事实」，不是本次要上云的内容** —— 上云数据面**不由本批驱动**）。
- **`auth-server/**`**：已退役 / 仅排查用链路，**不进云**（§6）。
- **`scripts/*` 一次性修复脚本、`shell-scripts/**`、`/tmp/jiazu-*`、`backups/**`、`~/jiazu-backups/**`**：离线 / 临时产物，**不参与打包、不同步云端**（`AGENTS.md` §2.4；**§35-3 的快照目录即此类**）。
- **`docs/**`**：规格与台账**不上云**（本册本节即纯台账追加）。
- **`cloudfunctions/deploy/**`**：是**打包产物**，**不是编辑对象**（`AGENTS.md` §2.1）。

### 35-8 本节未做

- **未改任何代码 / 配置 / `migrate-output/` / `config/`**（**真源只读**：`cp -a` 快照为只读拷贝，源侧零写入）；**未改 §0–§34 任何历史行**。
- **未打包 / 未部署 / 未上传 / 未重传 / 未建集合**；**未跑测试 / 未跑构建**（本册本节**不写**测试条数 / 构建字节 / 哈希 / 行数；**注册差量以命令实际输出为准**）。
- **未 commit / 未 push**。
- **未裁任何【待裁】项**（`docs/friend-domain.spec.md` §15 十三条 / `docs/task-center.spec.md` §13 两条 / §35-5 复核点 1–2 的过滤字段名与写协议）—— **本册不代裁定**。

---

### 35-9 批 3 上云动作与判据（**追加 · 2026-09-25 · 只追加 · 不改 §35-0–§35-8 任何行**）

> **性质**：本节把 §35-0 表内 **④「批 3 任务中心 = 规划中 · 本轮不做动作」**与 §35-4 的**规划面**展开为**可执行上云清单**；§35-4 的「本轮动作 = 无」**措辞原文保留**，其语义**自本节起**只指「**本批尚未执行**」（**未打包 / 未部署 / 未上传**），**不再指「无动作面」**（口径 = `AGENTS.md` §10「历史版本行不机械改写」）。**执行时逐项照做，一律以对应命令的实际输出为准；本节不预填任何读数 / 结论**（测试条数 / 构建字节 / 路由条数 / 产物 md5 一概不预填）。

#### 35-9-1 动作面 ①：云函数 `compat-api` **必须重打包 + `tcb fn deploy`**（**批 3 任务中心两条路由 + 好友域路由**）

- **为什么必登**：批 3 新路由与好友域路由全在 `cloudfunctions/compat-api/**` ⇒ **不重打包，云端新路由 404 / 静默返旧口径**（`AGENTS.md` §2.1；先例 §35-1）。
- **批 3 任务中心两条路由（**Jing 现盘 `grep` 现证逐字 · 唯一源 = `cloudfunctions/compat-api/index.js`**）**：
  - **`GET /tasks/today`** —— 路由清单注释逐字（第 **22** 行）= `GET  /tasks/today | POST /tasks/claim（任务中心：三条每日任务三态 + 手动领取；领取即 friend-ops 奖励池入口）`；派发判据逐字 = `if (pathname === '/tasks/today' || pathname === '/tasks/claim') {`（第 **1031** 行）· `if (pathname === '/tasks/today' && method === 'GET') {`（第 **1045** 行）。
  - **`POST /tasks/claim`** —— 逐字 = `if (pathname === '/tasks/claim' && method === 'POST') {`（第 **1056** 行）；入参 `task ∈ signin / invite / write`（第 **1024–1025** 行注释 + `lib/task-center.js` 第 **84** 行枚举，逐字）。
  - **注册次序**：`/tasks/*` 段与 `/friends/*` 段同段、**注册在树编辑闸门之前**（口径 = §35-1 判据 8）。
- **好友域路由（**同为 `index.js` 现证逐字**；承 §35-1 判据 2「字面以代码为唯一源」**）**：现盘实测 `index.js` 内 `/friends*` 路由**逐条 = 9 条** ——
  1. `GET  /friends`（第 **922** 行）
  2. `POST /friends/invite`（第 **931** 行）
  3. `POST /friends/accept`（第 **939** 行）
  4. `POST /friends/reject`（第 **940** 行）
  5. `POST /friends/cancel`（第 **941** 行）
  6. `POST /friends/renew/request`（第 **942** 行）
  7. `POST /friends/renew/confirm`（第 **943** 行）
  8. `POST /friends/renew/cancel`（第 **944** 行）
  9. `POST /friends/dissolve`（第 **945** 行）
  - 该段**入口前缀判据逐字** = `pathname === '/friends' || pathname.startsWith('/friends/') || pathname === '/assets/scroll/decompose'`（第 **903–907** 行）⇒ **同一派发段实际覆盖 10 条路由**（上列 **9 条** + `POST /assets/scroll/decompose`，第 **906** 行）。
  - ⚠️ **口径备注（不代裁定）**：`docs/friend-domain.spec.md` §8 **拟定**清单内的 `GET /friends/requests` · `POST /friends/renew-request` · `POST /friends/renew-confirm` · `POST /friends/revoke` · `POST /friends/incr` 等字面**现盘 `index.js` 实测未出现**；**实现字面以代码为唯一源**，spec 拟定字面与实现的差量属**规格侧待裁项**（`docs/friend-domain.spec.md` §15-6）—— **本节不代裁定**。
  - **邀请链路两路由**（同批、同一次重打包覆盖）：`GET /invite/me`（第 **473** 行）· `POST /invite/accept`（第 **479** 行）（明细则 §34）。
- **打包 + 部署命令（沿用既有流程，逐字同 §35-1）**：
  - `npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`
  - `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087e`
- **判据（**只登记形态、不登记数值**）**：① `grep -c "/tasks/today" cloudfunctions/deploy/compat-api/index.js` ⇒ **≥ 1**、`grep -c "/tasks/claim" …` ⇒ **≥ 1**；② §35-1 表列判据 **1–8 逐条重跑**（全组通过条件不变，**实际输出为准**）。
- **⚠️ 前置门槛**：**`npm test` 未全绿前不得打包 / 部署 / 重传**（承 §29-6 第 1 条；注册差量口径 = §35-1 末条，**执行时自行重算**）。

#### 35-9-2 动作面 ②：前端子包 + 全量产物重打（随 ① 之后）

- **小程序**：`build:mp-weixin` 后在开发者工具**上传**；子包 = `frontend/src/pages.json` 现盘实测三个 `root` —— **`pages/friend`**（第 **96** 行）· **`pages/task`**（第 **103** 行）· **`pages/special`**（第 **109** 行）。
- **H5**：`build:h5`（**构建前注入 `VITE_API_BASE` = 云函数 HTTP 域名，取值同 §1 / §7-4**）⇒ 产物 `frontend/dist/build/h5` ⇒ `tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c`。
- **顺序纪律**：**先重打包云函数 → 再前端重打**（同 §35-2；**首写前集合已建**的先决条件不变）。
- **判据（**只登记形态**）**：对**产物**（`frontend/dist/build/mp-weixin/**` 与 `h5/**` 各一次）`grep -c "/tasks/today"` ⇒ **≥ 1**、`grep -c "/tasks/claim"` ⇒ **≥ 1**；三个子包目录按实际构建生成；**字节数 / md5 / 文件数一律以命令实际输出为准**。

#### 35-9-3 动作面 ③：`cloudfunctions/deploy/**` 产物 —— **本批未重打包**（**如实登记**）

- **现盘实测（目录级读数）**：`cloudfunctions/deploy/compat-api/` 目录 `mtime` = **Aug 15 16:01**（`ls -la cloudfunctions/deploy/`）。
- **本单（制度员落盘单）未执行任何 `esbuild` 重打包 / `tcb fn deploy` / 前端构建 / 上传** ⇒ **本批上云动作尚未开始**（未打包 / 未部署 / 未上传 / 未重传 / 未建集合），**本轮云端状态零变更**。
- **形态纪律**：`cloudfunctions/deploy/**` 是**打包产物、不是编辑对象**（§35-7 / `AGENTS.md` §2.1）。

#### 35-9-4 动作面 ④：集合同步（`COLLECTIONS`）

- **本批未新增集合**（实测依据）：`lib/task-center.js` 内出现的集合名**现盘实测唯一 = `jiazu_assets`**（`grep -o "jiazu_[a-z_]*" … | sort -u`）⇒ 批 3 任务中心**复用既有 `jiazu_assets`**，**不新建集合** ⇒ **本批无需同步 `COLLECTIONS`**。
- **现盘基线（供执行时比对，非预言值）**：`scripts/upload-migrated-to-cloudbase.mjs` 的 `const COLLECTIONS = [` 数组（第 **31–48** 行）现盘实测 **13 项**（末项 `jiazu_invites`）。
- **纪律**：**若执行时实测有新增集合，必须先同步该列表再上云**（否则云端对应路由首写报错，口径 = `AGENTS.md` §8 / §35-2 判据 1）。

#### 35-9-5 冒烟验证（**按序做**；⚠️ **不预填结论、不预填任何读数**）

1. **重打包判据全组**：命令 = §35-1 表列判据 1–8 + §35-9-1 判据 ① ⇒ **期望**：通过条件**逐条成立**（**实际输出为准**；任一否定项非 0 ⇒ 判负）。
2. **任务中心路由可达**：`GET /tasks/today`（带 Bearer）⇒ **期望**：200 且 `data.tasks` 出三条任务的**三态**；**无 token ⇒ 期望 401**；`POST /tasks/claim {"task": <signin|invite|write>}` 三值各一次 ⇒ **期望**：按 T-4 口径返回（**未达标 ⇒ 409 中文**；**已领取 ⇒ 幂等态**），**读数以实际输出为准**。
3. **`GET /tasks/today` 零写入**：同 §35-6 第 10 条手法（`find migrate-output config -newermt "<冒烟开始时刻>" -type f`）⇒ **期望为空**；若仅 `mtime` 动（读侧 `sweep`），**须逐文件登记 `mtime` + `md5`**（口径承 `AGENTS.md` §2.1 / §32-3）。
4. **好友域路由复用既有判据**：§35-6 第 **6–8** 条（建关系 / 续约双边扣费 / 奖励池）**逐条重跑** ⇒ **期望**同 §35-6 各条（**本节不预填读数**）。
5. **前端子包（小程序）**：开发者工具打开 ⇒ **期望**：`pages/friend` / `pages/task` / `pages/special` 三子包可加载、任务中心页与好友页**不报错 / 不缺图**（**逐项以实际产物路径为准**）。
6. **H5**：部署后访问对应页面 ⇒ **期望**：任务中心 / 好友页正常、**无 404 / 无白屏**。
7. **未裁项不判负**：`docs/task-center.spec.md` **§13-1 / §13-2**（任务每日重置时点 / 平台写操作达标判定粒度）与 `docs/friend-domain.spec.md` **§15** 各条 —— **未裁前不得据任一读法判实现负**。

#### 35-9-6 本节未做

- **未打包 / 未部署 / 未上传 / 未重传 / 未建集合**；**未改任何代码 / 配置 / `migrate-output/` / `config/`**（**真源只读**）；**未改 §0–§35-8 任何历史行**（**纯追加**）。
- **未跑测试 / 未跑构建**；**本节不写任何实现读数**（测试条数 / 构建字节 / 产物 md5 / 路由条数一律**以对应命令的实际输出为准**）。
- **未 commit / 未 push**；**未裁任何【待裁】项**。

---

## 36. 本批：**文案与入口结构批次（tabBar / 首页 / 家谱 tab / 「我的」页）**（**纯前端批次**：无云函数重打包 · 无集合变更 · 无数据修正）（Jing 制度员 · 2026-09-26 · **只追加 · 不改 §0–§35 历史行**）

> **性质**：本节把 **Kevin + Zang 已冻结裁定 2026-09-26（条款号 K-1 – K-5）** 对应的上云动作与判据落成**可执行清单**。**本节只登记动作与判据，不预填任何读数**（测试条数 / 构建字节 / 产物 md5 / 文件数 / 路由条数一律**以对应命令的实际输出为准**）。
> **本批动作面定性（硬）**：**纯前端** —— 改动面 = `frontend/src/pages.json`（两处**文案**）· `frontend/src/pages/index/index.vue`（两处**文案**）· `frontend/src/pages/family/index.vue`（**删三块**）· `frontend/src/pages/mine/index.vue`（**四块新落点**）。**不改 `cloudfunctions/**` ⇒ 无云函数重打包、无 `tcb fn deploy` 项**；**不新增集合 ⇒ `COLLECTIONS` 无变更**；**无数据修正**。
> **⚠️ 因 `pages.json` 文案变更（tabBar `text` 与页面 `navigationBarTitleText`），本批 `pages.json` 已进改动面 ⇒ H5 与小程序两个产物都必须重打**（口径 = `AGENTS.md` §8；先例 = 本节 §36-1 / §36-2）。
> **口径落点（唯一真源）**：家谱页结构 = `docs/task-center.spec.md` **§15-2** / `docs/home-sort-search.spec.md` **§13**；入口 = `docs/task-center.spec.md` **§15-3** / `docs/friend-domain.spec.md` **§23**；首页两处文案 = `docs/home-sort-search.spec.md` **§13-4**。本节**不复写**正文。

### 36-0 总览（本批动作面 = **2 项**）

| # | 动作面 | 落点 | 本轮动作定性 |
|---|---|---|---|
| **①** | **前端 H5 重打 + hosting 部署** | `frontend/src/**`（`pages.json` / `pages/index/index.vue` / `pages/family/index.vue` / `pages/mine/index.vue`） | **必登**（见 §36-1） |
| **②** | **小程序 `build:mp-weixin` 重打 + 开发者工具上传** | 同上 | **必登**（见 §36-2） |
| **③** | 云函数 `compat-api` 重打包 + `tcb fn deploy` | —— | **本轮无**（本批**不改** `cloudfunctions/**`；见 §36-3） |
| **④** | 集合 / 云端数据 | —— | **本轮无**（不新增集合、无数据修正；见 §36-3） |

**本批改动面与工作区状态（Jing 只读读数 · **2026-09-26 10:12 CST** · **动值** —— 代码实现归**另单**、可能仍在编辑 ⇒ **执行时以对应命令的实际输出为准**）**：

| 文件 | `git diff --numstat`（增 / 删） |
|---|---|
| `frontend/src/pages.json` | **2 / 2** |
| `frontend/src/pages/family/index.vue` | **10 / 117** |
| `frontend/src/pages/index/index.vue` | **8 / 8** |
| `frontend/src/pages/mine/index.vue` | **84 / 77** |

- **`git status --short` 读数**：上列 **4 个前端文件 = 工作区已改、未提交**（状态 `M`）；**`cloudfunctions/**` 零改动**（读数 = `git diff --numstat -- cloudfunctions` **0 条** ⇒ 与本节「**纯前端**」定性一致）。
- **本节不登记实现状态**（不进「已实现 / 已通过」口径）：代码实现归**另单**；本节**只承接上云动作与判据**。

- **顺序纪律**：① 与 ② **各自独立、无先后依赖**（无后端面）⇒ **按 ① → ② 顺序执行**（先 H5 再小程序，便于用 H5 侧先看文案与结构）。
- **⚠️ 前置门槛**：**`npm test` 未全绿前不得打包 / 部署 / 重传**（承 §29-6 第 1 条）；**注册差量必核**（**未注册 = 假绿**，承 §14-4 / §16-1；`scripts.test` 注册项数与磁盘 `cloudfunctions/compat-api/lib/*.test.js` 文件数**执行时自行重算并贴输出**）。本批为**前端面**，**不新增测试文件**（**以命令实际输出为准**）。

### 36-1 必登 ①：前端 **H5 重打 + `tcb hosting deploy`**

- **为什么必登**：本批改 `pages.json` 的两处**文案**（`tabBar.list[1].text` = `我的家族`、`pages/family/index` 的 `navigationBarTitleText` = `我的家族`）与三个页面 ⇒ **产物不重打则线上仍是旧文案 / 旧结构**。
- **命令（沿用既有流程，字面同 §35-9-2）**：
  - `cd frontend && npm run build:h5`（**构建前注入 `VITE_API_BASE` = 云函数 HTTP 域名**，取值口径同 §1 / §7-4）
  - `tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c`
- **判据形态（**只登记形态，不登记数值** —— 执行时贴实际输出）**：

  | # | 判据 | 命令形态 | 通过条件 |
  |---|---|---|---|
  | 1 | tabBar 文案已进产物 | 对 `frontend/dist/build/h5/**` 内 `pages.json` 副本 / 打包产物 `grep -c "我的家族"` | **≥ 1**（**0 命中 = 未重打或产物过期 ⇒ 判负**） |
  | 2 | 首页浮动按钮文案已进产物 | `grep -c "家谱列表"`（同一产物树） | **≥ 1** |
  | 3 | 旧文案已不在产物（**文案替换面**） | `grep -c "我的家谱"`（同一产物树） | **= 0**（家谱页标题与 tabBar 第二栏的旧字面；**若产物内其它位置以「我的家谱」表示别的语义，须逐条列出并说明，不据单一命中判负**） |
  | 4 | 家谱页产物**无切换器** | 读家谱页产物模板（`pages/family/index` 对应产物文件） | **不含** tab 切换器节点与 `famTab` 相关状态；**含** `tree-hall` 组件引用（**逐项以实际产物路径为准**） |
  | 5 | 我的页产物**含本批四块落点** | 同一产物树内 `grep -c "今日奖励"`、`grep -c "家族互动"`、`grep -c "申请解绑"` | **各 ≥ 1**（**以实际产物为准**） |

### 36-2 必登 ②：小程序 **`build:mp-weixin` 重打 + 开发者工具上传**

- **为什么必登**：同上（`pages.json` 文案 + 三页面结构变更）；**小程序产物与 H5 产物是两个独立产物，必须各自重打**。
- **命令**：`cd frontend && npm run build:mp-weixin` ⇒ **用微信开发者工具打开对应产物目录并上传**（上传动作与版本号由执行方按既有惯例填写）。
- **判据形态（**只登记形态**）**：① 产物内 `app.json` 的 `tabBar.list[1].text` = **`我的家族`**；② 家谱页对应产物（`pages/family/index.*`）**无切换器结构**；③ `subPackages` 三个 `root`（`pages/friend` / `pages/task` / `pages/special`）**按实际构建生成、可加载**；④ 我的页对应产物含 §36-1 判据 5 的三处字面（**各 ≥ 1**）；⑤ **字节数 / md5 / 文件数一律以命令实际输出为准**（**主包余量按现有口径评估**，不预填读数）。

### 36-3 云端动作：**本轮无**（**无云函数重打包 / 无集合变更 / 无数据修正**）

- **无云函数重打包**：本批**不改 `cloudfunctions/**`** ⇒ **无 `esbuild` 重打包、无 `tcb fn deploy`**；`cloudfunctions/deploy/**` 产物**本批不动**（**形态纪律**：`cloudfunctions/deploy/**` 是打包产物、不是编辑对象，`AGENTS.md` §2.1）。
- **无集合变更**：本批**不新增集合**、**不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`**；**三个子包页面（`pages/friend/list` / `pages/friend/invite` / `pages/task`）均沿用既有路由**，**本批不新建任何页面 / 路由**（口径 = `docs/task-center.spec.md` §15-3 第 ⑥ 条）。
- **无数据修正**：**不重传树 JSON、不删旧详情键、不改 `config/tree-meta.json`**。
- **与已知部署阻塞项（§7-7）的关系**：本批**不触碰 `jiazu_assets` / 好友域 / 邀请链路**的任何写路径或字段 ⇒ **既不影响、也不解除** §7-7 欠债（**本批不因此被阻止**；上云决策仍须显式记入该欠债，口径同 §35-5 第 4 条）。

### 36-4 部署后冒烟验证（**按序做**；每步 = 判据 + 期望；⚠️ 结论由执行 / 质检收口后回写，**本清单不预填**）

1. **tabBar 第二栏文案**：打开 H5 / 小程序 ⇒ **期望**：底栏第二项显示 **`我的家族`**（**`首页` / `我的` 两项文案不变**）；点进家谱 tab ⇒ **期望**：**导航栏标题 = `我的家族`**。
2. **首页列表 tab 与浮动按钮文案**：首页 ⇒ **期望**：列表切换器第一颗 = **`家谱`**（第二颗仍 = **`祖谱`**、排序 pill 组（综合 / 人数 / 活跃度）在「家谱」档照旧渲染）；点右下浮动按钮切到中华世本 ⇒ **期望**：按钮文案 = **`家谱列表`**（**切回家谱档时按钮显示 `中华世本` 不变**）。
3. **家谱 tab = 纯树页**：已登录且已绑定 ⇒ 打开家谱 tab ⇒ **期望**：**无切换器**、**无好友入口格**、**无任务面板**；整页内容与直开 `/pages/hall/index?tree_id=…` **逐字 / 逐项一致**（§11-5 判据**继续有效**）；换树（改绑后 `onShow`）⇒ **期望**：整棵重建、无残留旧树内容。
4. **「我的」页四块新落点**：已登录且已绑定 ⇒ **期望**：① 用户卡内**一行**显示 `家族名 · 我的节点`；② 每日签到卡内**一行** `今日奖励 · 去领取 →`，点击 ⇒ 进 `pages/task/index`（**子包页**），页内三条任务与三态正常、**无 404 / 无白屏**；③ **「家族互动」卡**（位置 = 签到卡之后、功能菜单之前）两格 ⇒ 分别进 `pages/friend/list/index` / `pages/friend/invite/index`；④ 功能菜单**末行** = **`🔓 申请解绑`** ⇒ 点击弹出**原解绑弹窗**（原因选填 + 提交申请 + 取消），提交走既有 `POST /leave-request`。原「🌳 我的家族树」卡 ⇒ **期望**：**已不存在**。
5. **未登录态不渲染**：未登录 ⇒ **期望**：家谱 tab = **未登录空态**（🌳 + `登录后查看您加入的家族树` + `去登录`）、**无切换器**；「我的」页 = **无绑定行 / 无签到卡 / 无「家族互动」卡 / 无「申请解绑」行**（登录 / 注册按钮照旧）；已登录未绑定 ⇒ 家谱 tab = **未绑定空态**（🏡 + `您尚未加入任何家族树` + `加入后这里将显示您家族树的世系与档案` + `去家族列表加入`；**文案逐字以现证命令为准**）。
6. **未绑定行跳转**：已登录未绑定 ⇒「我的」页绑定行为 `尚未加入任何家族树 · 去家谱列表`，点击 ⇒ **期望**：**`switchTab` 到首页**（**不是** `navigateTo`、地址栏不出现 `pages/index/index` 的 navigate 形态）。
7. **窄屏不溢出**：375 / 390 视口 ⇒ **期望**：签到卡新增行、家族互动卡两格、用户卡绑定行**均单行不横向溢出**（口径承本册 **§35-6 第 10 条** 同类做法；**逐项以实际测量为准**）。
8. **真源零写入核对（冒烟窗口）**：`find migrate-output config -newermt "<冒烟开始时刻>" -type f` ⇒ **期望为空**；若因读侧 `sweep` 只动 `mtime`，**须逐文件记录 `mtime` + `md5` 并登记**（口径承 `AGENTS.md` §2.1 / 本册 §32-3）。
9. **人工编辑面不复核**：本批**不改**计费闸门 / 资产 / 好友域 / 邀请链路 ⇒ 上述既有冒烟（§35-6 第 6–9 条、§35-9-5 第 2–4 条）**本批不重复执行**（**如需回归，另按该两条清单重跑**）。

### 36-5 真源登记（**本单 = 文档落盘单** · **本单零写入** + 现场第三方读数）

| 项 | 登记值（**均 Jing 只读实测**） |
|---|---|
| 本单性质 | **制度员文档落盘单**（`docs/task-center.spec.md` §15 / `docs/friend-domain.spec.md` §23 / `docs/home-sort-search.spec.md` §13 / 本节 / `AGENTS.md` §0 索引追加行 + §7 登记行 + §9 速查追加行 + 勘误追加区勘误 4） |
| **本单对真源的写入** | **零写入** —— 本单**全程只读**（`migrate-output/` 与 `config/` **未改、未移、未删**）；**未改任何代码 / 配置**；**未打包 / 未部署 / 未上传 / 未跑测试 / 未跑构建 / 未 commit / 未 push** |
| 现场读数（**2026-09-26 09:34 CST**） | `find migrate-output config -newermt "2026-09-26 00:00" -type f` = **1 条** ⇒ 仅 `migrate-output/collections/jiazu_assets.json`；**`config/**` 零触碰**、`trees/**` 与 `details/**` 零触碰 |
| 该文件读数 | `mtime` = **2026-09-26 09:12:26**（**动值** —— 每次读 `GET /assets/summary` 都可能移动，同 §32-3 / §35-3 体例）· `size` = **112200 B** · 内容 `md5` = **`99cd7c3746cad81970c00c61ce4f9279`** |
| **与旧登记的差** | 该 `md5` **≠** §35-3 登记的 2026-09-25 值 **`594d25dfea0f78a17c86851e86401169`** ⇒ **本窗口该文件内容确已被写**（**不只 `mtime` 变**）—— **本单未写入** |
| 形态读数（该文件内） | `grep -c "scroll_fragments"` = **0**、`grep -c "scrolls"` = **0**；该用户 `txs` 末 **4 笔** = `jade_decompose` `2026-09-26T01:05:45.704Z` · `jade_synth` `01:05:53.389Z` · `jade_synth` `01:05:56.858Z` · `signin` `01:06:28.518Z`（= **09:05–09:06 CST**）⇒ **形态 = 经 UI / API 既有链路的操作**（**初步形态描述，不构成归属裁定**） |
| **归属** | **待 Kevin 确认**（**本册不代裁定**；先例 = 2026-09-23 `shen_27784_01` / 2026-09-24 `gu_39038_01` / 2026-09-25 `jiazu_assets.json` 的「待确认 → 追记确认」体例） |
| **补救快照** | **已补建** `~/jiazu-backups/2026-09-26-stage-backup/`（含 `migrate-output/` + `config/` 全量 + `MD5-LEDGER.txt`）；**条目数 = 342**（= 快照内实际文件数 **342** = 唯一路径数 **342**；ledger **33433 B**；目录 `find -type f` = **343**（含 ledger 自身））；**快照内该文件 `md5` = `99cd7c3746cad81970c00c61ce4f9279` = 现盘一致** ⇒ 快照时点 **≥** 写入时点、可作回滚基线；**原文件未改 / 未移 / 未删**（`cp -a` 只读拷贝，源侧零写入） |

- **口径（承 `AGENTS.md` §2.1）**：**后续本机验证优先用 `/tmp` 副本栈**（`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 钩子），**避免无谓 touch 真源**；确需对真源跑时**先备份、后登记前后 md5**。
- **与 §35-3 / §35-3 追记的关系**：那两处是 **2026-09-25** 窗口的登记；**本行是新窗口、新事实**（**本单零写入 + 现场第三方写入读数**），**旧行原文保留、不改**。同步登记 = `AGENTS.md` **§7「真源写入登记 · 本批（追加 · 2026-09-26 …）」行**。

### 36-6 明确**不需要**上云的东西

- **`cloudfunctions/**`（含 `cloudfunctions/deploy/**`）**：本批**零改动** ⇒ **不重打包、不 `tcb fn deploy`**（`deploy/**` 是产物、不是编辑对象）。
- **`migrate-output/` 与 `config/`**：**无数据修正** ⇒ **不重传树 JSON、不删旧详情键、不改 `config/tree-meta.json`**（§36-5 现场写入为**本地既有事实**，**不是本次要上云的内容**）。
- **`scripts/*` 一次性修复脚本 / `shell-scripts/**` / `/tmp/jiazu-*` / `backups/**` / `~/jiazu-backups/**`**：离线 / 临时产物，**不参与打包、不同步云端**（`AGENTS.md` §2.4；§36-5 的快照目录即此类）。
- **`docs/**`**：规格与台账**不上云**（本节即纯台账追加）。
- **`auth-server/**`**：已退役 / 仅排查用链路，**不进云**（本册 §6）。

### 36-7 本节未做

- **未改任何代码 / 配置 / `migrate-output/` / `config/`**（真源只读）；**未改 §0–§35 任何历史行**（**纯追加**）。
- **未打包 / 未部署 / 未上传 / 未重传 / 未建集合**；**未跑测试 / 未跑构建**；**本节不写任何实现读数**（测试条数 / 构建字节 / 产物 md5 / 文件数 / 路由条数一律**以对应命令的实际输出为准**）。
- **未 commit / 未 push**；**未裁任何【待裁】/【未决】项**（`docs/task-center.spec.md` §13-3 相邻项 / `docs/friend-domain.spec.md` §15 各条 **未裁前不得据任一读法判实现负**）。

---

### 36-8 收口追记（**只追加** · 2026-09-26 · **不改 §36-0 – §36-7 任何行**）

> **性质（只追加）**：§36 的**收口追记**（**纯追加**）—— **§0–§35 与 §36-0 – §36-7 既有行原文一律保留、一字不改、一行不删**；被更正之处**只在新行里写明取代关系**（`AGENTS.md` §0-4；§0-5 = `docs/*.qa.md` 不回改，本追记**未碰任何 `.qa.md`**）。**行号与字面一律以现证命令的实际输出为准**。

#### 36-8-1 本批改动面更正：**前端 = 5 个文件**（§36-0 / §36-0 表与 §36-1 / §36-2 的「4 文件」清单**原文保留**）

- **现盘读数（Jing 只读实测 · 2026-09-26 10:40 CST · `git diff --numstat` · 动值）**：

| 文件 | `git diff --numstat`（增 / 删） |
|---|---|
| `frontend/src/pages.json` | **2 / 2** |
| `frontend/src/pages/family/index.vue` | **11 / 118** |
| `frontend/src/pages/index/index.vue` | **8 / 8** |
| `frontend/src/pages/mine/index.vue` | **84 / 77** |
| **`frontend/src/components/tree-hall/tree-hall.vue`** | **2 / 2** |

- **⚠️ 与 §36-0（现证行号 **4379–4382** 表）两处不同**，**§36-0 旧读数原文保留、本表自本节起为准**：① `family/index.vue` **10 / 117 → 11 / 118**（**差 ±1，恰为第 5 处字面变更那一行**；§36-0 自身已标读数为「**动值**」）；② **新增第 5 行** `tree-hall.vue` **2 / 2** —— **§36-0 / §36-1 / §36-2 的「4 文件」清单（现证行号 **4362** / **4370**）未列该文件 ⇒ 本追记补登**；其改动面 = **仅 2 行注释字面**（`我的家谱` → `我的家族`），**零模板 / 脚本 / 样式改动**。
- **§36-0 / §36-1 / §36-2 的其余定性继续有效**（**纯前端** · 无云函数重打包 · 无集合变更 · 无数据修正 · `pages.json` 进改动面 ⇒ **H5 + 小程序两产物必重打**）；**动作面仍为 2 项**（① H5 重打 + hosting 部署；② 小程序重打 + 上传）；**§36-0 末条「前置门槛」的达标状态见本 §36-8-4**。

#### 36-8-2 本批字面变更 = **5 处**（§36-4 第 5 条内枚举的旧字面更正）

- **第 5 处** = 家谱 tab **已登录未绑定空态按钮**：`去家族列表加入` → **`去家谱列表加入`**（落点 = `frontend/src/pages/family/index.vue`；**依据 = Kevin 已当面裁定「首页列表入口统一命名：家谱 / 家谱列表」（2026-09-26）**；**现盘只读实测**：`grep -n "去家谱列表加入" frontend/src/pages/family/index.vue` ⇒ **命中 1 处**，`grep -rn "去家族列表加入" frontend/src` ⇒ **零命中**）。
- **§36-4 第 5 条（现证行号 = 4425）** 内枚举的「🏡 + `您尚未加入任何家族树` + `加入后这里将显示您家族树的世系与档案` + **`去家族列表加入`**」—— **该旧字面已被取代**；该条**其余字面与「文案逐字以现证命令为准」的限定继续有效**；**旧行原文保留**。⇒ **冒烟时该按钮的期望字面 = `去家谱列表加入`**（其余四串逐字不变：`登录后查看您加入的家族树` / `去登录` / `您尚未加入任何家族树` / `加入后这里将显示您家族树的世系与档案`）。
- **原 4 处字面变更逐字不变**（`pages.json` 两处 + 首页 `pages/index/index.vue` 两处；口径 = `docs/home-sort-search.spec.md` **§13-4** 与 `AGENTS.md` **勘误追加区 勘误 4**）。
- **同步追记** = `docs/task-center.spec.md` **§15-7-1** · `docs/home-sort-search.spec.md` **§13-7 ①** · `AGENTS.md` **勘误 5 ①**。

#### 36-8-3 §36-5 归属确认追记（**归 Kevin 本人 · 已当面确认（2026-09-26）**）

- **§36-5（现证行号 4431–4445）内的「归属 = 待 Kevin 确认」措辞原文保留**，其语义**自本节起被覆盖**（先例 = 2026-09-23 `shen_27784_01` / 2026-09-24 `gu_39038_01` / 2026-09-25 `jiazu_assets.json` 三次「待确认 → 追记确认」体例）。**Kevin 于 2026-09-26 当面确认：该笔真源写入 = 本人所为**。
- **定稿要素（读数 = Neng 实测值逐字；Jing 现盘只读复核同值）**：文件 = `migrate-output/collections/jiazu_assets.json`；**内容 `md5` = `594d25dfea0f78a17c86851e86401169`（上批 §35-3 登记值）→ `99cd7c3746cad81970c00c61ce4f9279`（现盘实测）**；`size` = **112200 B**；**写入时点 = 2026-09-26 09:12:26 CST**（派单给定）。
- **`mtime` 为动值**：现盘实测已由 **2026-09-26 09:12:26** 移至 **2026-09-26 10:24:41**（Jing 落笔时只读实测；`npm test` 复跑后同值）—— **归因 = 读侧 `GET /assets/summary` 触发的惰性 `sweep` 整体回写**（**内容零变化、仅 `mtime` 变**；同形态先例 = `AGENTS.md` §2.1 / §7 既有两条登记）。
- **末 4 笔流水（用户 `16601061656`，该用户 `txs` 共 **170** 笔；现盘复核逐字一致）**：`tx_muhoun6w13gcw3` / `2026-09-26T01:05:45.704Z` / `jade_decompose` / `{jades:-1, seeds:999}` / `分解石榴籽玉`；`tx_muhout4e159ci1` / `01:05:53.389Z` / `jade_synth` / `{seeds:-999, jades:1}` / `合成石榴籽玉`；`tx_muhouvsr17uqpd` / `01:05:56.858Z` / `jade_synth` / `{seeds:-999, jades:1}` / `合成石榴籽玉`；`tx_muhovk8718uv2b` / `01:06:28.518Z` / `signin` / `{fragments:1}` / `每日签到 +1 碎片` ⇒ **CST 09:05:45–09:06:28**，走既有链路（分解 / 合成玉 + 签到），**与本批代码零关系**（本批 = **纯前端 + 文档**）。
- **快照（本轮补救）**：`~/jiazu-backups/2026-09-26-stage-backup/`（条目 **342** = `migrate-output` **339** + `config` **3**；`MD5-LEDGER.txt` **33433 B** / **342 行**；目录 `find -type f` = **343**（含 ledger 自身））；**快照内该文件 md5 = `99cd7c3746cad81970c00c61ce4f9279` = 现盘一致** ⇒ 快照时点 **≥** 写入时点、可作回滚基线；**原文件未改 / 未移 / 未删**（`cp -a` 只读拷贝，源侧零写入）。
- **结论 = 归 Kevin 本人、无需回滚 / 退费**（正常操作；**零越权写入 / 零绕过闸门 / 零直改文件痕迹**）⇒ **本批无待确认归属项**，**不构成上云阻塞**。**同步登记** = `AGENTS.md` **§7「真源写入登记 · 2026-09-26 归属确认追记」行**。

#### 36-8-4 前置门槛与终值读数（**`npm test` = 579 / 579 / 0 / 0 · exit 0** · 未触碰用户服务）

- **`npm test` 终值基线 = 579 tests / 579 pass / 0 fail / 0 skipped（exit 0）**（**三方读数同值**：**Kong 补单后复跑** + **Neng 定向补测独立复跑** + **Jing 本追记落笔前复跑**（Jing 复跑时点 **2026-09-26 10:43:30–10:43:34 CST**，TAP 逐字 = `1..579` / `# tests 579` / `# pass 579` / `# fail 0` / `# cancelled 0` / `# skipped 0`））；**注册数 = 磁盘数 = 34**（`scripts.test` = `cloudfunctions/compat-api/lib/*.test.js` = 全仓 `*.test.js`，**双向差集为空 ⇒ 无未注册假绿**）；**本批零新增测试文件**。⇒ **§36-0 末条「前置门槛」达标**（**仍以冻结时点终校为准**）。读数行 = `AGENTS.md` **§7 追加行**；质检证据 = `docs/task-center.spec.md` **§15-7-3**。
- **测试对真源零写入（只读复核）**：复跑前后 `migrate-output/collections/jiazu_assets.json` md5 **同值**（`99cd7c…`）；`find migrate-output config -newermt "2026-09-26 10:30" -type f` **为空**。
- **未触碰用户服务（只读复核）**：`3100` PID **69131** / `5199` PID **69243**，均 `STARTED Thu Sep 24 12:33:42`（`ELAPSED` **1d22h**）—— **未重启、未占用**（本追记全程只读）。

#### 36-8-5 本节未做项（**如实登记**）

- **未改任何代码 / 配置 / `migrate-output/` / `config/`**（**真源只读**）；**未改 §0–§35 与 §36-0 – §36-7 任何历史行**（**纯追加**）。
- **未打包 / 未部署 / 未上传 / 未重传 / 未建集合**；**未跑构建**（**`npm test` 复跑 = 只读验证**，非交付读数 —— 读数来源与体例见本 §36-8-4）；**未 commit / 未 push**；**未裁任何【待裁】/【未决】项**。
- **未写实现现状读数**（除 **§36-8-1 的 `git diff --numstat`** 与 **§36-8-4 的测试读数**，**均为现盘实测**）。

---

## §37 在线文谱批次（**纯前端** · 2026-09-26 · **只追加** · 不改 §0–§36 任何行）

> **性质（只追加）**：本节为「**在线文谱**」批次的**上云动作与冒烟判据**登记（**纯追加**；**§0–§36 既有行原文一律保留、一字不改、一行不删**；被更正之处**只在新行里写明取代关系**，承 `AGENTS.md` §0-4）。**口径真源 = `docs/wenpu.spec.md`**（**新立分册 · 首次落盘 2026-09-26 · Zang 裁定 v1 · §23 追加裁定 v2**）；**质检证据 = `docs/wenpu.qa.md`（只读引用、一字未动 · `AGENTS.md` §0-5）**。**本册只写判据 · 不预填读数**（读数位见 §37-4）。

### 37-0 批次定性与动作面

- **性质 = 纯前端**：**无云函数重打包需求**（`cloudfunctions/**` 本批**零改动** ⇒ **不 `tcb fn deploy`**、**不重打包**）；**无真源改动**（`migrate-output/` 与 `config/` **零写入** ⇒ **不重传树 JSON / 不删旧详情键 / 不改 `config/tree-meta.json`**）；**无集合变更**；**本批次不上云为约定**（⇒ 本节动作清单**登记备用**，**执行前须另行裁定**）。
- **动作面 = 2 项**（**H5 + 小程序两产物重打**）：
  1. **H5**：`cd frontend && npm run build:h5`（带 `VITE_API_BASE`）⇒ `tcb hosting deploy`；
  2. **小程序**：`cd frontend && npm run build:mp-weixin` ⇒ **开发者工具上传**。
- **前置门槛**（承 §29-6 第 1 条，沿用 §36-8-4 口径）：**`npm test` 全绿** 且 **`cd frontend && npm run type-check`（`vue-tsc --noEmit`）= `EXIT 0`** ⇒ **未达标一律不得打包 / 部署 / 上传**；**读数一律以对应命令的实际输出为准**（本册**不推算、不预填**）。
- **改动面（`git diff --numstat` 现盘实测 · **动值**）**：`frontend/src/business/types.ts` **5 / 0** · `frontend/src/business/api.ts` **4 / 0** · `frontend/src/components/tree-hall/tree-hall.vue` **12 / 12**（**该文件含前批「文案与入口结构批」的 2 / 2**，见 §36-8-1 ⇒ **不得把 12 / 12 整记在本批头上**）；**新增文件**（未跟踪 ⇒ `numstat` 不列）= `frontend/src/business/wenpu.ts` · `frontend/src/business/lunar.ts`（**6116 B**）· `frontend/src/business/traditional.ts`（**18382 B**）· `frontend/src/components/wenpu-book/wenpu-book.vue` · `scripts/gen-s2t-table.py` · `scripts/gen-lunar-table.py`。
- **真源零写入（本批复核）**：`find migrate-output config -newermt "2026-09-26 15:37" -type f` = **0 条**；质检两轮**全量 342 行台账 diff 均 = 0** ⇒ 同步登记 = `AGENTS.md` **§7 追加两行**（其中「**仅 mtime 变**」一笔见该处体例）。

### 37-1 部署后冒烟验证（**按序做** · 逐项判 PASS / FAIL）

1. **入口**：家族树页左侧浮动菜单点「**在线文谱**」⇒ 书页渲染；页内**不含**「导出选项」/「格式说明」字面。
2. **书页行数**：**4 行 / 页**（第 1 页 = 第 1–4 人；不足位补 `null` ⇒ **不渲染**）。
3. **满 10 字栏单行不折行**：栏内文本**恒单行**（**不得出现 9 + 1 折行**；折行时实测特征 = **栏宽 20 → 37px、行盒 2** ⇒ **命中即为 FAIL**）；纸页上下内边距 = **17px**（附件式 20px 会折行，**登记见 `docs/wenpu.spec.md` §23-1 ④**）。
4. **书口文案与页码**：左 = `▲ <谱名> 頁<汉字序>`（谱名空 ⇒ 回退 `display_title`）；右 = `▲ <堂号> 頁<汉字序>`（`hall_name` 空或字面「暂无」⇒ **该元素整条不渲染**，**不得印出「暂无」**）；左右**连号**（**2k+1 / 2k+2**）⇒ **实际形态 = 「頁一 / 頁三 / 頁五…」**（繁体汉字序）。
5. **翻页**：**首 / 末页对应按钮禁用**；页指示 = `页 x / N`（**简体**）。
6. **「⋯ 更多」菜单**：位于书页**上方工具条右侧**；菜单内**「生成并下载 PDF」= 弱化样式**（`font-size: 12px` / `color: #999`）且点按 = **既有 stub 提示**（**H5** = `PDF 生成中...` + `loading`；**小程序** = `请使用网页版导出`；**逐字**）。
7. **简繁分界**：**纸内**（所有栏 + 两侧书口）**全繁体**；**纸外**（翻页 / 页指示 / ⋯ 菜单 / 左侧按钮 / 加载与失败提示）**简体**。
8. **窄屏**：横向滚动容器**可横滑**，纸页**恒 960 × 720、不压缩**。
9. **接口异常**：注入 `fetch` **reject** / **500** / **404** ⇒ **显示「谱文读取失败」（纸外 · 简体）而非「暫無譜文」**，**且纸内无「暫無譜文」、不渲染纸页**；**合成真·无人物**（`empty:true` 且无错）⇒ **纸内「暫無譜文」、无错误提示**（口径 = `docs/wenpu.spec.md` **§23-2**）。
10. **小程序端竖排真机验收**：判据与现状见 **§37-2**。

### 37-2 小程序端竖排真机验收判据（**必做项 · 不生效不得静默降级**）

- **判据**：产物 WXSS 内**保留** `writing-mode: vertical-rl`；**小程序真机 / 开发者工具内渲染须为竖排**（同 `docs/wenpu.spec.md` **§19 判据 8** / **§15 L-3**）。
- **取证现状（如实登记 · 本批未取证）**：开发者工具 CLI 实测 **`CLI_EXIT=255`**、**profile 未初始化** ⇒ **未能运行验收**；且 **WXSS 对「含不支持标签选择器的整条规则」是「整条丢弃」还是「只丢该子句」亦未证**（**两种读法均未证实**）。
- **处置（硬）**：**不生效则记缺陷、另开改单**；**不得静默降级**（不得以 H5 竖排代替；不得写「已通过」；**未跑 = 未跑**）。

### 37-3 明确**不需要**上云的东西

- **`cloudfunctions/**`（含 `cloudfunctions/deploy/**`）**：本批**零改动** ⇒ **不重打包、不 `tcb fn deploy`**（`deploy/**` 是产物、不是编辑对象）。
- **`migrate-output/` 与 `config/`**：**无数据修正** ⇒ **不重传树 JSON、不删旧详情键、不改 `config/tree-meta.json`**。
- **`scripts/*`（含 `gen-s2t-table.py` / `gen-lunar-table.py`） / `shell-scripts/**` / `/tmp/jiazu-*` / `backups/**` / `~/jiazu-backups/**`**：离线 / dev 环节产物，**不参与打包、不同步云端**（`AGENTS.md` §2.4）。
- **`docs/**`**：规格与台账**不上云**（本节即纯台账追加）。
- **`auth-server/**`**：已退役 / 仅排查用链路，**不进云**（本册 §6）。

### 37-4 验收读数列位（**判据位 · 本册只写判据、不预填读数**）

- **冒烟读数位 = 10 项**（§37-1 第 1–10 项）逐项 **PASS / FAIL / 未跑**；其中**第 3 项（满 10 字栏不折行）与第 9 项（失败态）为质检差异-4 / -5 的复检锚点**，**第 10 项单独出结论**。
- **前置门槛读数位**：`npm test` → `____ tests / ____ pass / ____ fail / ____ skipped（exit ___）`；`scripts.test` 注册数 = `____`、磁盘 `cloudfunctions/compat-api/lib/*.test.js` = `____`（**未注册 = 假绿**）；`cd frontend && npm run type-check` = `EXIT ____`。
- **产物读数位**：H5 产物与小程序产物的**字节 / md5**（**以对应命令的实际输出为准**）。
- **本节留位不代填**；**若填读数，必须标明时点**，且**终值一律以冻结时点终校为准**。
- **参考（**非本节终值 · 仅备对照 · 时点须随行标注**）**：本批收尾前实测基线（**2026-09-26 16:10:08 CST**）= 根 `npm test` → **579 tests / 579 pass / 0 fail / 0 skipped（exit 0）**、`scripts.test` 注册 **34 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 34**（**未注册 0**）、`cd frontend && npm run type-check` = **EXIT 0**；**均为动值**。

### 37-5 本节未做项（**如实登记**）

- **未打包 / 未部署 / 未上传 / 未重传 / 未建集合**（**本批次不上云为约定**）；**未跑构建**；**未 commit / 未 push**。
- **未改任何代码 / 配置 / `migrate-output/` / `config/`**（**真源只读**）；**未改 §0–§36 任何历史行**（**纯追加**）；**未碰任何 `.qa.md`**（`AGENTS.md` §0-5）。
- **未写本批实现现状读数**（除 **§37-0 的 `git diff --numstat`** 与 **§37-4 参考读数**，**均为现盘实测并已标时点**）；**未裁任何【待裁】/【未决】项**。

---

## §38 资产运维六类 + 全站量词统一批次（**云函数重打包 + H5 / 小程序两产物重打** · 2026-09-26 · **只追加 · 不改 §0–§37 任何行**）

> **性质（只追加）**：本节为**纯追加章节**（**§0–§37 既有行原文一律保留、一字不改、一行不删**；被更正之处**只在新行里写明取代关系**，承 `AGENTS.md` §0-4）。**落盘方 = Jing（制度员）**；**本阶段不上云、只登记**（**未打包 / 未部署 / 未上传 / 未重传**）。
> **口径真源**：`docs/economy-ops.spec.md` **§14**（资产运维六类 + 量词 + 409 `unit` 六类）· `docs/economy.spec.md` **§21**（量词统一表）· `docs/friend-domain.spec.md` **§24**（兰帖 / 残页）；**登记侧** = `AGENTS.md` **§0 追加行 / §9 追加行 / §7 追加行 / 勘误追加区勘误 7**。**本节只写动作与判据、不预填任何读数**（测试条数 / 构建字节 / 产物 md5 / 路由条数一律**以对应命令的实际输出为准**）。
> **裁定来源**：Kevin **2026-09-26 当面拍定**（① 资产运维区 4 类 → **6 类**；② **全站量词统一**）。

### 38-0 批次定性与动作面（**2 项必登**）

| # | 动作面 | 触发依据 | 本轮定性 |
|---|---|---|---|
| **①** | **云函数 `compat-api` 重打包 + `tcb fn deploy`** | 本批改 `cloudfunctions/compat-api/lib/economy-ops.js`（`DELTA_KEYS` 扩 6 项 / `grantAssets` 新分支 / `adminUserAssets` 出参追加五项）⇒ **不重打包 = 云端新分支与五项出参静默返旧口径** | **必登**（见 §38-1） |
| **②** | **前端 H5 + 小程序两产物重打** | 本批改 `frontend/src/business/api.ts`（`AssetDelta` / `AdminAssetSnapshot`）· `frontend/src/pages/admin/index.vue`（`DELTA_FIELDS` 与快照区）· **量词文案落点**（`business/asset-text.ts` / `business/inventory.ts` / `business/friends.ts` / `business/tasks.ts` / `components/asset-inventory/asset-inventory.vue`）⇒ **两产物各自重打** | **必登**（见 §38-2） |
| ③ | 集合 / 云端数据 | 本批**不新增集合**（六类字段全落**既有** `jiazu_assets`）· **无数据修正** | **本轮无**（见 §38-3） |

- **顺序纪律**：按 **① → ②** 执行（**先重打包云函数 → 再前端重打**；承 §35-2）。
- **⚠️ 前置门槛**：**`npm test` 未全绿前不得打包 / 部署 / 重传**（承 §29-6 第 1 条、§36-8-4、§37-0）；**另需 `cd frontend && npm run type-check` = `EXIT 0`**（承 §37-0 体例）。**注册差量必核**（**未注册 = 假绿**，承 §14-4 / §16-1 / §35-1；`scripts.test` 注册项数与磁盘 `cloudfunctions/compat-api/lib/*.test.js` 文件数**执行时自行重算并贴输出**）。
- **本节不登记实现状态**（不进「已实现 / 已通过」口径）：代码实现归**另单**（Kong）；本节**只承接上云动作与判据**。

### 38-1 必登 ①：云函数 `compat-api` 重打包 + `tcb fn deploy`

- **打包命令（沿用既有流程，逐字同 §1 / §35-1 / §35-9-1）**：
  - `npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`
  - 再 `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`（**envId 以 `cloudbaserc.json` 的现证值为准**；**⚠️ §35-1 / §35-9-1 两处旧行所写的 `…d087e` 与本现证值 `…d087c` 不同 —— 旧行原文保留、不复改**，**执行时按 `cloudbaserc.json` 取值**）。
- **判据形态（**只登记形态、不登记数值** —— 逐条执行时贴实际输出）**：

  | # | 判据 | 命令形态 | 通过条件 |
  |---|---|---|---|
  | 1 | 六类资产键已进产物 | `grep -c "scrolls" cloudfunctions/deploy/compat-api/index.js`、`grep -c "scroll_fragments" …` | **各 ≥ 1**（**0 命中 = 未打包或漏改 ⇒ 判负**） |
  | 2 | 快照五项新字段名已进产物 | 对产物 `grep -c` 五项：`scroll_fragments` · `scroll_fragment_cap` · `scrolls_total_pieces` · `scrolls_item_count` · `scroll_lots` | **逐项 ≥ 1** |
  | 3 | `delta` 键集合（六类）字面已进产物 | 读产物内 `DELTA_KEYS` 相关段的 `grep -n` 输出 | **含 `seeds` / `bamboos` / `fragments` / `jades` / `scrolls` / `scroll_fragments` 六项**（**字面以代码为唯一源**） |
  | 4 | 409 `unit` 两新值字面已进产物 | `grep -c "scroll_fragments" …`、对 `unit` 相关段落 `grep -n` | **≥ 1**，且**既有四项**（`seeds` / `bamboos` / `fragments` / `jade`）**字面不变** |
  | 5 | 既有路由仍在（未被本批破坏） | 对 `/admin/assets/grant` · `/admin/assets/logs` · `/admin/assets/user` 各 `grep -c` | **各 ≥ 1**；**账号级路由仍挂在树编辑闸门之前**（承 §35-1 判据 8） |
  | 6 | 作废字面**未**引入 | `grep -c "friend_renew"` 等既有否定项（承 §35-1 判据 5 / 6 体例） | **按各既有否定项口径逐条判**（**本批不新增作废字面**） |

- **中文判据注**：**`esbuild` 默认 `--charset=ascii`，产物内中文为 `\uXXXX` 转义** ⇒ **凡以中文文案做判据须用 `grep -F` 定长匹配**（体例承 §9-2 尾注 / §35-1）。
- **重打包后本轮产物 md5 与 §32–§37 的旧产物 md5 必然不同** ⇒ **以命令实际输出为准**（**旧行一律原文保留**）。

### 38-2 必登 ②：前端 **H5 + 小程序**两产物重打（随 ① 之后）

- **H5**：`cd frontend && npm run build:h5`（**构建前注入 `VITE_API_BASE` = 云函数 HTTP 域名**，取值口径同 §1 / §7-4）⇒ `tcb hosting deploy frontend/dist/build/h5 -e liwu-d8gek6jjdab1d087c`。
- **小程序**：`cd frontend && npm run build:mp-weixin` ⇒ **用微信开发者工具打开对应产物目录并上传**（上传动作与版本号由执行方按既有惯例填写）。
- **判据形态（**只登记形态**）**：

  | # | 判据 | 命令 / 动作形态 | 通过条件 |
  |---|---|---|---|
  | 1 | 后台六类输入与快照字段已进 H5 产物 | 对 `frontend/dist/build/h5/**` `grep -c "scroll_fragments"`、`grep -c "scroll_lots"` | **各 ≥ 1**（**0 命中 = 未重打或产物过期 ⇒ 判负**） |
  | 2 | 量词文案已进产物 | 对同一产物树 `grep -c` 兰帖量词字面（**中文须 `grep -F`**） | **≥ 1**（**逐项以实际产物路径为准**） |
  | 3 | 小程序产物同步 | 对 `frontend/dist/build/mp-weixin/**` 重跑判据 1 / 2 | **同通过条件** |
  | 4 | 六类发放入口可见 | 部署后打开后台「资产运维」区 ⇒ **期望**：六类数量输入（兰帖按「张」、残页按「片」）与「发放 / 扣减」按钮可用 | **可见且可提交**（**以实际页面为准**） |
  | 5 | 字节数 / md5 / 文件数 | `wc -c` / `md5 -q` / `find` | **一律以命令实际输出为准**（**不预填**） |

### 38-3 云端动作：**无新增集合 / 无数据修正**

- **无集合变更**：本批**不新增集合** —— `scrolls` / `scroll_fragments` 落在**既有** `jiazu_assets` ⇒ **不改 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`**（现证基线 = §35-9-4 登记的 13 项，**执行时自行重算**）。
- **无数据修正**：**不重传树 JSON、不删旧详情键、不改 `config/tree-meta.json`**。
- **与已知部署阻塞项（§7-7）的关系**：本批**不触碰 `jiazu_assets` 的多实例并发形态**（**不重构为「每手机号一文档 + 乐观锁」**）⇒ **既不影响、也不解除** §7-7 欠债（**上云决策仍须显式记入该欠债**，口径同 §35-5 第 4 条 / §36-3）。

### 38-4 部署后冒烟验证（**按序做** · 每步 = 判据 + 期望；⚠️ 结论由执行 / 质检收口后回写，**本清单不预填**）

1. **六类正向发放**：`POST /admin/assets/grant`（总编）分别发 `seeds` / `bamboos` / `fragments` / `jades` / `scrolls` / `scroll_fragments` ⇒ **期望**：六类各 `200`；**兰帖按「张」填 2 ⇒ 落库 `delta.scrolls = 200`（片）**；`jiazu_ops_logs` 与目标用户 `txs` 各新增一条（`operator` / `reason` / `delta` 齐全）。
2. **六类负向扣减**：同接口 `delta` 取负 ⇒ **期望**：可用量内**扣减成功**（FIFO：`expires_at` 升序；兰帖按片扣、`qty` 归零批次整条移除）；**不足 ⇒ `409` 整单拒绝、不部分扣减**，且**资产 / 日志 / 流水三者都不变**（承 §8.2 用例 8 / 9 的既有判据）。
3. **409 出参（六类 `unit`）**：扣减不足 ⇒ **期望**：`unit` 为六类之一（**新增 `scrolls` / `scroll_fragments` 可命中**）；**兰帖不足文案同时含需求张数与当前精确片数**（**形态 = `docs/economy-ops.spec.md` §14-6**）；**`current` 不得被四舍五入成张**。
4. **用户资产快照**：`GET /admin/assets/user?phone=…` ⇒ **期望**：出参含五项新字段 `scroll_fragments` / `scroll_fragment_cap` / `scrolls_total_pieces` / `scrolls_item_count` / `scroll_lots`；**内部自洽**：`scrolls_item_count = floor(scrolls_total_pieces / 100)`、`scroll_lots` 逐批 `qty` **以片计**；**展示层 ÷100 为「张」**（**张数 ≠ 格数**，承 `docs/economy.spec.md` §14-13 / §21-3）。
5. **资产变动日志（六类显示）**：`GET /admin/assets/logs` ⇒ **期望**：六类 delta 均按**用户可见量词**显示（兰帖 **÷100 = 张**、残页 **片**、籽 **颗**、竹片 **片**、碎片 **片**、玉 **枚**）；**负号跟随数值**；**除不尽 100 时不四舍五入成整张**。
6. **后台换算回读校验**：表单填 **2 张** ⇒ 提交后读回快照 ⇒ **期望**：`scrolls_total_pieces` 增量 = **200**（**×100**）；再以 **−1 张** 扣减 ⇒ `delta.scrolls = −100`。
7. **权限与鉴权（不变项回归）**：`tree_steward` / `user` ⇒ **403**；未登录 ⇒ **401**；`GET /admin/assets/user` 口径不变（`docs/spirit-domain.spec.md` §14 的管理面口径**继续有效**，**用户面不显已镶嵌、管理面全量**）。
8. **真源零写入核对（冒烟窗口）**：`find migrate-output config -newermt "<冒烟开始时刻>" -type f` ⇒ **期望为空**；若因读侧 `sweep` 只动 `mtime`，**须逐文件记录 `mtime` + `md5` 并登记**（口径承 `AGENTS.md` §2.1 / §32-3）。
9. **前端量与形（H5 / 小程序各一次）**：后台「资产运维」区六类输入**单行不溢出**（窄屏 375 / 390）；行囊内量词文案与 §21-1 表**逐字一致** ⇒ **期望**：**兰帖显示「张」、残页显示「片」、碎片显示「片」**。
10. **未裁项不判负（硬）**：**账号注销清空仍只清四类**（**待裁** —— 登记 = `docs/economy-ops.spec.md` **§14-7**；**未裁前不得据「未清兰帖 / 残页」判实现负**）；`docs/friend-domain.spec.md` **§15 / §22-7** 与 `docs/task-center.spec.md` **§13-1 / §13-2** 其余各条**不受本批影响**。

### 38-5 **真源零写入声明行（本单 · 逐字）**

- **本单 = 制度员文档落盘单**（落点 = `docs/economy-ops.spec.md` **§14** / `docs/economy.spec.md` **§21** / `docs/friend-domain.spec.md` **§24** / `docs/task-center.spec.md` **§16** / 本节 / `AGENTS.md` **§0 追加行 + §9 追加行 + §7 追加行 + 勘误追加区勘误 7**）⇒ **本单对真源零写入**：`migrate-output/**` 与 `config/**` **未改 / 未移 / 未删**，**全程只读**（**未写任何真源文件、未建副本、未 touch**）。
- **本单未上云、未跑命令**：**未打包 / 未部署 / 未上传 / 未重传 / 未建集合**、**未跑测试 / 未跑构建**；**未 commit / 未 push 于本单正文写作时** —— **提交与 push 由本次收尾执行**（**只提交本批的 `docs/` 与 `AGENTS.md` 追加**，**`git add` 只列本单路径、绝不用 `-A` / `.`**）。
- **口径（承 `AGENTS.md` §2.1）**：**后续本机验证优先用 `/tmp` 副本栈**（`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 钩子），**避免无谓 touch 真源**；确需对真源跑时**先备份、后登记前后 md5**。
- **与 §36-5 / §37-0 的关系**：那两处是**前两批**的真源登记（**旧行原文保留**）；**本节不重复登记第三方写入**（**本单无现场第三方读数**；**若执行阶段发现真源被动，按 §36-5 体例另起新行登记，并标「归属 = 待 Kevin 确认」**）。

### 38-6 明确**不需要**上云的东西

- **`cloudfunctions/deploy/**` 的「编辑」**：该目录是**打包产物、不是编辑对象**（`AGENTS.md` §2.1 / §35-7 / §36-6 / §37-3）—— 本节只**登记重打包动作**。
- **`scripts/*` 一次性脚本 / `shell-scripts/**` / `/tmp/jiazu-*` / `backups/**` / `~/jiazu-backups/**`**：离线 / 临时产物，**不参与打包、不同步云端**（`AGENTS.md` §2.4）。
- **`docs/**`**：规格与台账**不上云**（本节即纯台账追加）。
- **`auth-server/**`**：已退役 / 仅排查用链路，**不进云**（本册 §6）。

### 38-7 本节未做（**如实登记**）

- **未打包 / 未部署 / 未上传 / 未重传 / 未建集合**（**本阶段不上云、只登记**）；**未跑测试 / 未跑构建**；**本节不写任何实现读数**（测试条数 / 构建字节 / 产物 md5 / 路由条数一律**以对应命令的实际输出为准**）。
- **未改任何代码 / 配置 / `migrate-output/` / `config/`**（**真源只读**）；**未改 §0–§37 任何历史行**（**纯追加**）；**未碰任何 `.qa.md`**（`AGENTS.md` §0-5）。
- **未裁任何【待裁】/【未决】项**（含 `docs/economy-ops.spec.md` §14-7 的注销清空四类 / 六类）。
- **一句话可改**：改本节 §38-0 表任一行一处（须同步 §38-1 / §38-2 判据与 §38-4 冒烟清单）。

### 38-8 追加（**只追加 · 不改 §38-0 – §38-7 任何行** · 2026-09-26 · 两件：① 真源归属确认追记同步登记；② 新裁定「账号注销清空 四类 → 六类」的上云面）

> **性质（只追加）**：本子节为**纯追加** —— **§0–§37 与 §38-0 – §38-7 既有行原文一律保留、一字不改、一行不删**；被取代之处**只在本子节新增行里标「已被取代」并写明取代者**（`AGENTS.md` §0-4）。**落盘方 = Jing（制度员）**；**本阶段不上云、只登记**。

**① 真源写入归属确认追记 · 同步登记（承 `AGENTS.md` §7 现证行号 311）**：

- **§38-5 内「本单无现场第三方读数」措辞原文保留**，其语义**自本行起按「本批窗口另有一次真人实操写入（该次写入 = 归 Kevin 本人 · 已当面确认）」读取**（口径 = `AGENTS.md` §0-4 历史版本行不机械改写）。
- **该笔写入（逐字照录）**：`ts` = **`2026-09-26T10:49:53.573Z`** / `operator` = **`16601061656`** / `target_phone` = **`16601061656`** / `delta` = **`{"scrolls":100,"scroll_fragments":22}`** / `reason` = **「奖励」**；**对象 = `migrate-output/collections/jiazu_assets.json`**（内容 md5 **`745408418deec5d8c82b2768e15dc192` → `976fd2fce18d398df2b2849acb0e8072`**）**+ 同窗口 `migrate-output/collections/jiazu_ops_logs.json`**（md5 **`52948ab8fc6d0ff5e9ed298450a6d254`**）⇒ **归属 = 归 Kevin 本人（2026-09-26 当面确认）· 无需回滚 / 无需退费**。
- **`mtime` 漂移归因（同格一句 · 不另起行）**：**内容 md5 恒为 `976fd2fce18d398df2b2849acb0e8072`** 而 `mtime` 漂移（**Kong 实测 `19:04:23`** / **Neng 实测 `18:57:18`** / **Jing 落笔前只读实测 `2026-09-26 19:04:23`**）⇒ **归因 = 读侧 `GET /assets/summary` 触发的 `sweep` 整体回写（内容不变、仅 `mtime` 变）**；同形态先例 = `AGENTS.md` §2.1 / §7 既有两条登记。

**② 新裁定：账号注销清空 **四类 → 六类**（口径真源 = `docs/economy-ops.spec.md` §14 新增子节 §14-11，现证行号 653）⇒ 上云面补登**：

- **上云面（补登 · 逐字）**：**云函数 `compat-api` 重打包需覆盖「注销六类」** —— 即 §38-0 ① / §38-1 的打包动作**须包含 `POST /account/delete`（`deleteAccount`）分支内新增的 `scrolls` / `scroll_fragments` 清空，以及 `cleared` 出参 / `account_clear` 流水 `delta` 的两键**；**判据面追加一条**：对产物 `cloudfunctions/deploy/compat-api/index.js` 以 `grep -c "scroll_fragments"` / 注销分支相关段落 `grep -n` **登记形态**（**逐条执行时贴实际输出**；**本节不预填读数**）。**不重打包 ⇒ 云端注销仍只清四类（静默返旧口径）**。
- **口径要点（不复述规格）**：注销时置空 **`scrolls = []` / `scroll_fragments = 0`**；`cleared` 出参与 `account_clear` 流水 `delta` 各**新增上述两键**（**以片计**）；**K10 挂单前置、先写流水再置空、幂等重入 `200`、保留 `jiazu_users` / `jiazu_anchors` / 历史 `Tx` / `jiazu_ops_logs` / 钱包流水 = 一律不变**；**前端注销二次确认文案只追加品类枚举**（`…石榴籽玉、兰帖、兰帖残页将全部清空…`）。

**③ 部署后冒烟补一条（并入 §38-4「按序做」清单 · 追加第 11 条）**：

- **11. 注销清空六类（含兰帖 / 兰帖残页）**：对测试账号调 `POST /account/delete` ⇒ **期望**：**`200`**；`cleared` 出参**含 `scrolls` / `scroll_fragments`**；该用户资产内 **`scrolls = []` / `scroll_fragments = 0`** 且**四类（`seeds` / `bamboos` / `fragments` / `jades`）+ `signin_date` 同步清空**；`type='account_clear'` 流水 `delta` **新增两键**；**K10 前置**：存在 `status='open'` 挂单 ⇒ **`409「请先撤销未成交挂单」`** 且**资产 / 挂单 / 流水三者不变**；**幂等**：重入 ⇒ **`200`**；**保留项核对**：`jiazu_users` / `jiazu_anchors` / 历史 `Tx` / `jiazu_ops_logs` / 钱包流水**均在**（含兰帖 / 残页在内的六类**不可恢复**）。

**④ 被取代旧行（**原文一律保留 · 不回改 · 现证行号**）**：

- **本册 §38-4 第 10 条（现证行号 4637）**：「**账号注销清空仍只清四类**（**待裁** …）」⇒ **已被取代**（**自本子节起按六类读**）。
- **本册 §38-7 第 3 条（现证行号 4657）**：「未裁任何【待裁】/【未决】项（含 `docs/economy-ops.spec.md` §14-7 的注销清空四类 / 六类）」⇒ **该项已裁**（**旧行原文保留**）。
- **本册「无注销面」字面 = 0 命中**（`grep -n "无注销\|注销面" docs/PENDING_DEPLOY.md` ⇒ **无输出**）⇒ **无数可列**（**如实登记**）。
- **本子节不写实现现状读数**（测试条数 / 构建字节 / 产物 md5 / 路由条数一律**以对应命令的实际输出为准**）；**未改任何代码 / 配置 / `migrate-output/` / `config/`**；**未旁改 §38-0 – §38-7 任何行**；**未碰任何 `.qa.md`**（`AGENTS.md` §0-5）。

---

## §39 行政区划热度排序（geo-hot）批次（**云函数重打包 + H5 / 小程序两产物重打** · **无集合变更 · 无数据修正** · 2026-09-26 · **只追加 · 不改 §0–§38 任何行**）（Jing 制度员）

> **性质（只追加）**：本子节为**纯追加** —— §0 – §38 既有行**原文一律保留、一字不改、一行不删**（口径 = `AGENTS.md` §0 第 4 条「历史版本行不机械改写」）。**落盘方 = Jing（制度员）**；**本阶段不上云、只登记**。
>
> **口径真源** = `docs/geo-origin.spec.md` **§14**（本批 = **读侧派生 + 24h 进程内缓存**；**不新增集合 / 不新增写路由 / 真源零写入**）。**本册只登记上云动作与判据，不复述规格**；**本子节不写实现现状读数**（测试条数 / 构建字节 / 产物 md5 / 路由条数**一律以逐条执行时的实际输出为准**）。

**① 本批形态（上云面判定用 · 一句）**：**纯读侧派生能力** —— **无集合新增 / 无数据迁移 / 无真源写入 / 无配置变更**；但**有云函数代码变更**（新增 `GET /geo/hot` **只读**路由）⇒ **必须重打包云函数**；**有前端展示变更**（`geo-cascader` 三级列序）⇒ **H5 + 小程序两产物必须重打**。**本批无写路径** ⇒ 上云风险面**仅新增一条只读路由**。

**② 按序做（上云动作 3 项）**：

1. **云函数 `compat-api` 重打包**。
   - **判据（命令与输出形态写清）**：`grep -c 'geo/hot' cloudfunctions/deploy/compat-api/index.js`
     - 输出形态 = **单个整数**（命中行数）；
     - **`≥ 1` ⇒ 判过**（路由字面已进产物）；
     - **`0` ⇒ 未打进产物**（**逐条执行时贴实际输出**；**本节不预填读数**）。
   - **不重打包的后果**：云端**无 `/geo/hot` 路由** ⇒ 前端**静默降级为原序**（不报错、无 UI 提示）；**其余功能不受影响**。
   - **`R12①`（机械判据 · 云函数产物）**：**在 `cloudfunctions/deploy/compat-api/index.js` 里 grep 命中 `geo/hot` 的计数 `≥ 1`**（即上条命令；**具体文件名以实际产物为准**）。
2. **H5 产物重打**（`frontend/dist/**` —— 本次上云批次动作；**本批工作区阶段不动产物**）。
   - **判据（行为面 · `R12` 形态①）**：重打后的**新产物**内含「按 `counts` 排序 + 同票回原序」的 `geo-cascader` 列序逻辑 ⇒ 由 **③ 冒烟第 2 条**在真机体现。
   - **`R12②`（机械判据 · H5 产物）**：**在 `frontend/dist/build/h5` 下的 js 产物里同名（`geo/hot`）grep 计数 `≥ 1`**（**具体文件名以实际产物为准**）。
3. **小程序产物重打**（**两产物各打一次**；H5 与小程序**缺一**即真机上有一端仍为原序）。
   - **判据（行为面）**：同 ②-2，在两端各跑一遍 **③**。
   - **`R12③`（机械判据 · 小程序产物）**：**在 `frontend/dist/build/mp-weixin` 下的 js 产物里同名（`geo/hot`）grep 计数 `≥ 1`**（**具体文件名以实际产物为准**）。
   - **判据形态（`R12` 明示两条 · 硬）**：**形①** = **判据落到 ③ 冒烟第 2 条**；**形②** = **冒烟不得以「改完立刻变」当判据**（24h TTL，见 ③-3 缓存口径）。**两条形态与上面三条机械判据并存，不得相互替换。**

**③ 部署后冒烟（3 条 · 逐条可判定）**：

1. **接口逐键一致（`R19` 修订：不以「`counts` 非空」为判据）**：对线上环境调 `GET /geo/hot` ⇒ **期望**：**`200`**，**顶层四键（成功路径恒在）+ 可选第五键 `failed`** 齐备（`v` / `generated_at` / `counts` / `direct`，`v = 1`；**`failed` 仅当确有树读失败时出现，其有无不作判过条件**，口径见 `spec §14-6`），**`generated_at` 非空（字符串）**，且 **`counts` 的键集 + 每个键的票数与「按真源独立现算」的结果逐键一致**（**可为空映射**）；**不以非空为判据**。两表**只含票数 > 0 的码**。
   - **`R10`（零票口径）**：**成功但全站零票** ⇒ **`generated_at` 给本次成功计算的时刻**（**不是 `null`**）；**`null` 专表「从未成功计算过」**。⇒ 冒烟**不得**把零票当失败，**不得**以 `generated_at` 是否为空单独判过。
   - **`R15②`（单源读失败不整体失败）**：`getMeta()` 失败 ⇒ **发源地那一源计 0 票、其余两源照常** ⇒ **接口仍 200**，**不**走整体失败降级 ⇒ 冒烟**不得**因单源读失败判负。
   - **`R19`（为何把「非空」判据改掉 · 区分「算了但无票」与「没算成」）**：原判据「**`counts` 非空**」与 **`R10`「零票是合法成功态」**直接冲突 —— **「算了但无票」**（成功、`generated_at` 给本次成功计算的时刻、两映射为 `{}`）**必须判过**；**「没算成」**（从未成功计算过 ⇒ `generated_at` 为 `null`）或**读数与真源不符**才判负。⇒ 判据改为 **`200` + 顶层四键齐备 + `generated_at` 非空（字符串）+ `counts` 键集与逐键票数与「按真源独立现算」结果逐键一致（可为空映射）**；**不以非空为判据**（规格面登记位 = `spec §14-12`）。
2. **列序随票数变化**：在**已知热点**省 / 市下展开 `geo-cascader` 三级面板 ⇒ **期望**：命中票数高者**上移**（与当次 24h 内 `counts` 一致）；**同票者保持数据集原序**；**三级各自独立**（省 / 市 / 县各用本列口径的票）。
   - **`R15③`（键序不作判据 · 硬）**：前端**按键取值、不依赖顺序** ⇒ 冒烟**不得以两映射（`counts` / `direct`）的键序作判据** —— 实现里的「票数降序 / 同票按码升序」**只登记为内部表示**（否则下一轮质检会产生**无意义判负**）。
   - **`R14`（市级列序键）**：**市级列序键 = `counts`**（**前缀级联，含下属县票**），**与省级列同口径**；`direct` **本批仅作备用读数、前端不消费** ⇒ 冒烟**不得**按 `direct` 校市级列序（口径见 `spec §14-8`）。
3. **无票回原序**：定位到**票数为 0** 或**未登记码**所在的层 ⇒ **期望**：与**数据集原序一致**；**接口不可达 / 无数据 / 未加载** 时 ⇒ **仍原序、不报错、不阻塞、无任何 UI 提示**（**无 loading / 无「按热度排序」文案 / 无错误 toast**）。
   - **缓存口径（对冒烟判据的约束）**：缓存 TTL = **24h** ⇒ 真源变更后**当天不再反映**；冒烟**以当次 `generated_at` 对应的读数**为准，**不得**以「改完立刻变」作判据。

**④ 本批边界（与 `docs/geo-origin.spec.md` §14-1 逐条一致）**：

- **无集合变更**（**不新增集合** · 不动 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`）；**无数据修正**（**真源零写入**：`migrate-output/**` / `config/**` 不动）；**无配置变更**。
- 未改 `config/geo-divisions.json`、两份 `divisions.json` 产物（`cloudfunctions/compat-api/lib/geo/divisions.json`、`frontend/src/business/geo/divisions.json`）、`scripts/gen-geo-divisions.mjs`、`frontend/src/pages.json`；**不加任何真源字段**；**不新增页面 / 路由 / tab / 依赖**。
- **未改任何 `.qa.md`**（`AGENTS.md` §0-5）；**未旁改 §0 – §38 任何行**。
- **本子节只登记** —— **未执行任何打包 / 部署 / 上传 / 重传、未 commit**。

**⑤ 未决（不阻塞本批）**：**热度时间衰减** / **每用户去重** —— **本批均不做**（登记位 = `docs/geo-origin.spec.md` **§14-9**；**本册不另起口径**）。

**⑤-补 · 待执行项登记（本批本地阶段不做 · 归上云冒烟执行单）**：

- **`R20` · 线上真实 `generated_at` 的取证**：**线上环境真实 `generated_at` 的取证（实调取数、记录其实际值）属「上云冒烟执行单」**，**不在本批本地阶段** —— 本册**只登记该待执行项**，**不预填任何读数**；执行时按 **③-1**（`R19` 修订后的判据）取值并贴实际输出。

**⑥ 终审裁定回填（`R9` – `R20` · 本册只登记落点 / **不复述规格**）**：

- **口径真源 = `docs/geo-origin.spec.md` §14**（`Zang` 终审已逐条逐字回填；全文落点索引 = **`spec §14-11`**，**本批第二轮 = `spec §14-12`**）。**本节不复制其条文。**
- **触上云面者 3 条**：
  - **`R12`**（云函数 / H5 / 小程序**三处机械判据** + **判据形态两条**）⇒ **本册 ②-1 / ②-2 / ②-3**；
  - **`R10`**（**成功但全站零票 ⇒ `generated_at` 给本次成功计算的时刻**，`null` 专表「从未成功计算过」）⇒ **本册 ③-1**（规格面登记位 = `spec §14-6`）；
  - **`R15①`**（顶层 = **四键（成功路径恒在）** + **可选第五键 `failed`**，仅确有树读失败时出现）⇒ **本册 ③-1**（规格面登记位 = `spec §14-6`）。
- **纯规格面者 4 条（本册不另起口径、不复述）**：
  - **`R9`**（tree-meta **唯一读入口 = store `getMeta()` 返回值**；计票字段 = `meta.trees` 各项 `origin_code`，**不含 `storage_files`**；两处不同步属上云 / 同步批次、**不在本批范围**）⇒ `spec §14-2`；
  - **`R11`**（整体失败**降级值不进缓存、不设负缓存、不刷新成功时刻** ⇒ 下次请求立即重试）⇒ `spec §14-7`；
  - **`R13`**（**县级码 `counts` ≡ `direct`**；**省级列序键 = 该省自身票 + 其下全部下级票之和**）⇒ `spec §14-5` / `§14-8`；**`R14`**（**市级列序键 = `counts`**，含下属县票，与省级列同口径；`direct` 本批仅作备用读数、前端不消费）⇒ `spec §14-8`；
  - **`R15②`**（`getMeta()` 失败 ⇒ **只该源计 0 票、其余两源照常、不整体失败**）⇒ `spec §14-2`；**`R15③`**（**两映射键序不作判据**；「票数降序 / 同票按码升序」只登记为内部表示）⇒ `spec §14-6`（对冒烟的约束已就地在 **③-2** 写明）。
- **本批第二轮新增（`R16` – `R20` · 本册只登记落点 / **不复述规格**）**：
  - **触冒烟面者 1 条**：**`R19`**（**冒烟第 1 条判据修订**：**改掉**「`counts` 非空」，改为 **`200` + 顶层四键齐备 + `generated_at` 非空（字符串）+ `counts` 键集与逐键票数与「按真源独立现算」结果**逐键一致（**可为空映射**）；**不以非空为判据**）⇒ **本册 ③-1**（已就地在 **③-1** 写明**判据全句 + 为何改**；规格面登记位 = `spec §14-12`）；
  - **纯规格面者 3 条（本册不另起口径、不复述）**：**`R16`**（**「树清单拉取失败」不得当成「成功但零票」** ⇒ 与**整体计算失败**同路：返回上一次成功值（无则空表降级）、**不刷新成功时刻、不进缓存**、**下一次请求立即重试**；**单树读抛错只跳过该树（进 `failed`）/ 单树返回 `null` 只跳过（不进 `failed`）两条不变**）⇒ `spec §14-2` / **`§14-6`** / **`§14-7`**；**`R17`**（**`failed` 值形态 = 树 id 字符串数组**，只收「树清单里有、但读取抛错」者；「不存在 / 已删」**不入** `failed`）⇒ `spec §14-2` / `§14-6`；**`R18`**（**两层分开**：① `getMeta` 抛错 ⇒ **发源地那源计 0 票、其余两源照常**（前提 = 树清单仍取得到）；② 连树清单也取不到 ⇒ 按 `R16` **整体降级**）⇒ `spec §14-2` / `§14-6`；
  - **上云执行单项 1 条（归冒烟执行单）**：**`R20`**（**线上真实 `generated_at` 的取证**属**上云冒烟执行单**，**不在本批本地阶段**）⇒ **本册 ⑤-补**；
  - **不落本册 1 条**：**`R21`**（代码侧**测试文件注释对齐**）**不属本册口径**，**本册不落**。
- **本子节边界不变**：**只登记，不执行**；**未改 §0 – §38 任何行**。

**⑦ 终审裁定回填（`R22` – `R23` · 小补单 · 本册只登记落点 / **不复述规格**）**：

- **口径真源 = `docs/geo-origin.spec.md` §14**（`R22` – `R23` 全文落点索引 = **`spec §14-13`**）。**本节不复制其条文。**
- **触冒烟面 1 条 —— `R22`**（**整体降级路径的返回体形态**）：**降级返回体不得新增、也不得修改 `failed` 键** —— `failed` **只在成功路径出现**（语义 = **本次扫描**里读取抛错的树 id，`R17`）；**整体失败时「本次扫描」不成立** ⇒ **直接原样复用上一次成功值**（自带当时的 `generated_at` 与当时可能的 `failed`）**或**复用**空表降级常量**（不含 `failed`）⇒ **降级返回体不带「本次」语义的 `failed`**；其 `generated_at` **随上次成功值或为 `null`**、**不得因降级而改写**。⇒ **对本册 ③-1 的约束**：降级返回体**以当次返回值原样为准** ⇒ 冒烟**不得**因降级返回体**没有 `failed`** 或 **`generated_at` 沿用上次成功值 / 为 `null`** 而判负（`failed` 的有无**本就不作判过条件**，见 **③-1** 既有口径）；规格面登记位 = `spec §14-6` / **`§14-7`**。
- **触冒烟面 1 条 —— `R23`**（**「按真源独立现算」= 固定步骤 + 时点差口径**）：**独立现算固定步骤** = **①** 读真源的 **trees 全部树 JSON** 与 **tree-meta**；**②** 计票 = **出生地码 1 票** + **居住地每条 1 票** + **每棵树 tree-meta 的 `origin_code` 1 票**；**③** 每张票对其**自身**码与**祖先码**（**前 2 位 + `0000`**、**前 4 位 + `00`**）**各 +1**；**④** **只计在码表（`config/geo-divisions.json`）内**的码；**⑤** 产物 = **码到票数的映射**。**时点差口径** = 因 **24h 缓存** ⇒ **接口读数 = 上一次成功计算时刻的真源状态** ⇒ 两者不一致时**先查窗口内真源是否有写入**（**按仓内既有真源写入登记格式**，见 **⑧** 同一形态先例），**不得直接判负**。⇒ **本册 ③-1** 的「按真源独立现算 / 逐键一致」判据**按上列固定步骤执行**；**本册 ③-3** 的缓存口径**按上列时点差口径执行**（规格面登记位 = `spec §14-13`）。

**⑧ 真源零写入复核（本批窗口 · 含质检轮 · 只记事实 · 承 ④）**：

- **`migrate-output/collections/jiazu_assets.json` —— 本批窗口内一次「仅 `mtime` 变」漂移**：**内容 md5 恒为 `31e9ea9c10498bf75770ce10c35f9544`**（**= 上一批已登记值 ⇒ 内容零变化**）、`mtime` 移至 **2026-09-26 20:15:20**、`size` = **114373 B**；**末笔流水仍为已认领的** `2026-09-26T11:30:04.771Z` `edit_fee`（**本册不重登该笔**）⇒ **归因 = 读侧 `GET /assets/summary` 触发的 `sweep` 整体回写**（**形态 = 内容零变化、仅 `mtime` 变**）。
- **`migrate-output/collections/jiazu_sms_codes.json`**：真源 `mtime` 仍为 **2026-09-23 08:48:58**（**未被质检登录写入**）。
- ⇒ **结论（硬）**：**本批代码与质检对真源零写入**（与 **④**「真源零写入：`migrate-output/**` / `config/**` 不动」一致）。

**⑨ 挂账（小补单 · 本批只登记、不执行）**：

- **`AGENTS.md` 索引行 / 登记行本批不写（硬 · 挂账）**：截至 **2026-09-26 20:09:43** 该文件**仍在被另一条线写** ⇒ **本批不碰 `AGENTS.md`**（**一字不得动**），其索引行 / 登记行**挂到那条线停笔后的收口轮**；**本句即其接续登记位**（**本册不预填任何内容、不替写、不代改**）。
- **本批质检证据文件 = `docs/geo-hot.qa.md`（只指路、不复述）**：由**另一单**转录落盘 ⇒ 本册**只给指引**（**不复制其内容、不引用其读数、不作判据来源**）；**本册不改该文件任何行**（`AGENTS.md` §0-5：不改既有 `.qa.md`）。

**⑩ 小补单边界（承 ④ · 不变）**：**纯追加** —— **未改代码 / 未写真源 / 未改 `AGENTS.md` / 未改任何 `.qa.md` / 未执行任何打包 · 部署 · 上传 · 重传 / 未 commit**；**§0 – §38 各行与本节 ①–⑥ 各段一律原文保留、一字未改**。
