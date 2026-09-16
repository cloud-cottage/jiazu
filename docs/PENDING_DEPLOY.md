# 待部署清单（本地已完成 · 云端未部署）

> 约定：当前阶段**只做本地**。所有"已本地验证、需要上云"的动作按顺序累积在本文件里，
> 日后一次性执行；每项都注明**为什么需要**与**本地验证证据**，避免部署时靠回忆。
> 最后更新：本地迭代中（本批含宗谱 `kind='clan'` / 删除节点 / 跨树改父 / 重置始祖与「无始祖」态认祖 / 世本关键节点标注恢复）

---

## 0. 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | 重打包（已做，**本批改动后须再打一次**）+ `tcb fn deploy` | 无 |
| 2 | CloudBase 集合 | 新建 `jiazu_join_requests`、`jiazu_marriage_requests`、`jiazu_founder_requests`、`jiazu_clan_requests`（+ `jiazu_person_details.tree_id` 索引） | 需 CB_ENV/CB_KEY |
| 3 | 云端数据 | 重跑迁移上传（树 JSON / 详情 / tree-meta） | 需 CB_ENV/CB_KEY |
| 4 | 前端 H5 / 小程序 | `build:h5`（带 `VITE_API_BASE`）+ hosting 部署；`build:mp-weixin` + 开发者工具上传 | 需确认 hosting 目标与域名 |

> ⚠️ 本批前端产物**必须重打包**（`frontend/dist/` 现存的是上一版产物）：不重打包会缺
> 「世本关键节点标注 / 宗谱删除入口收紧 / 跨树改父·删除节点前端调用」等本批改动。见 §4 末尾。

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
| **认祖 `POST /admin/founder-request` + `/admin/decide-founder` `/admin/attach-founder` `/admin/detach-founder`** | **新增 / 泛化**（`lib/founder-attach.js`、`docs/founder-attach.spec.md`、`docs/clan-tree.spec.md`）：请求体新增 **`target_tree_id`**（旧字段 `master_tree_id` 兼容；宗谱缺省 = `zhonghua`，普通树必填宗谱 id，全都缺 → 400「请选择认祖目标」）+ `target_handle`；目标层级硬口径：**宗谱 → 只可挂中华世本（master）**、**普通家族树 → 只能挂宗谱（clan），直挂世本 400**（`assertAttachTarget`）；**「无始祖」态口径**：`tree-meta.founder_state='none'`（如刚 `reset-founder`）时 **该树任意节点都可发起认祖**，审批通过即把该节点**回写为始祖**（落 `founder_handle`/`founder_gramps_id`/`founder_name` 并删除 `founder_state`）；已登记的树仍只允许始祖位置节点发起；每树仅 1 个 pending | 单测 19 + 7 项（`founder-attach` / `founder-reattach`）→ 合计 **150/150**；HTTP 探针同 reset-founder 行 |
| 宗谱接口 `POST /admin/clan-request`、`GET /admin/clan-requests`、`POST /admin/decide-clan`、`GET /admin/clans`、`GET /admin/clan-info` | **新增**（`lib/clan.js`、`docs/clan-tree.spec.md`）：建谱申请 → chief 审批通过建 `kind='clan'` 树并写始祖镜像；宗谱清单（认祖目标选择器用，可按姓过滤）；宗谱页数据（顶端镜像链 / 自有世代 / 支系入口列表）。写集合 **`jiazu_clan_requests`**（见 §2） | **暂无独立单测文件**（宗谱→世本 / 家族树→宗谱 的 target 校验被 `founder-attach.test.js` 覆盖，含在 **150/150**）；建谱申请/审批为本地 HTTP + UI 实测 |
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
| **人物档案（危险区·宗谱，本批收紧）** | 宗谱（`tree-meta.kind='clan'`）内 **「🗑 删除节点」仅总编 `chief_editor` 可见**（普通家族树维持 `canEdit` 口径不变：登录 + 非 guest + 非总谱 + 非始祖/镜像）；宗谱危险区同屏显示风险提示「删支系节点风险较高——宗谱自有支系常是下级普通家族树的认祖落点」 |
| 人物档案（删除节点） | 删除走 `POST /admin/delete-node` 两段式：选模式 → `dry_run`（只算不写，显示人数/家族数）→ 强确认带 `confirm_count` → 正式提交；被其它家族树引用时后端 409、前端提示先解引用 |
| 总谱 | 世数 0 显示「原始」（根卡/卡片/时间轴）；续编入口支持原始节点 |
| 加子女 | `addChildNode()` 改走 `POST /admin/add-child`；跨树婚姻家庭的子女自动落到父真身树，提示改为「…已建到「<树>」，本树保留镜像子女」 |
| 默认后端 | vite 默认代理 → `3100` compat-api（`dev:h5:legacy` 回旧链路） |
| 人物档案（始祖行） | 始祖节点操作区新增 **「🔁 重置始祖」**（`isFounderNode && !founderMirror && canEdit`）：确认弹窗 → `POST /admin/reset-founder` → 刷新 tree-meta，页面立即变「无始祖」态并出现「⛩ 认祖」入口 |

---

## 5. 部署后冒烟验证（按序做）

1. `curl -s -X POST <fn>/admin/reparent -H 'Authorization: Bearer <chief>' ...` → 400/403（说明路由已上线）；
2. 云端读：`GET /people/?profile=all`（`X-Tree-Id: zhonghua`）→ 105 人、含 `风华胥`（`external_chain_gen=0`）；
3. 云端写：网页上给某人加配偶 / 改父 → 云上读回一致（验证云存储 + 集合双写）；
4. 前端：`/zhonghua` 时间轴根卡显示「风华胥｜原始」；树图根卡「风华胥／原始」→「风伏羲／第1世」；
5. 权限：普通用户对总谱改父 → 403；未登录 → 401。

---

## 6. 明确**不需要**上云的东西

- `auth-server/`（本地遗留链路 → Gramps-Web）：**不进云**，云上由 `compat-api` 承担；
- `scripts/*` 里的一次性修复脚本（`fix-zhonghua-gender.mjs`、`fix-person-names.mjs`、`audit-person-names.mjs`）与 E2E 脚本：离线工具，只在需要时本地跑；
- `/tmp/jiazu-*`（E2E 数据副本、备份）：临时产物。
