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
