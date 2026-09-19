# 首页列表范围 · 三档排序 · 全站人物搜索 · 家族树资金下线 — 规格（home-sort-search.spec.md）

状态：**已实施**（2026-09-17，本轮；由主代理亲验）。测试基线：全量 `npm test` = **350 pass / 0 fail**。
关联与**从属关系**（重要）：

- **本册不凌驾于任何总纲之上**。经济域（集合名 / 字段名 / 枚举取值 / 路由清单 / 算法口径 / 价格表）的唯一权威是
  **`docs/economy.spec.md`**；集合与 API 契约的权威是 `docs/data-model.md`；节点级（世级）读可见分层的权威是
  `docs/permission-tier.spec.md`；全站编号（`gramps_id` / `handle` / `resolveNode`）的权威是 `docs/id-system.spec.md`。
  **本册只描述本批四项改动的落地口径**；与上述册子冲突时**以彼为准，并同步修订本册**。
- 待部署动作（四要素）见 `docs/PENDING_DEPLOY.md` §16（本批四项）与 **§4-1**（2026-09-18 追加：首页列表 tab / 人数标签 / 窄屏）；
  独立质检报告见 `docs/home-sort-search.qa.md`（本册不复制、不预告其结论；2026-09-18 增量验收 = 该册 **§15**）。
- 代码落点：`frontend/src/pages/index/index.vue`（列表范围 / 三档排序 / 搜索框）、`cloudfunctions/compat-api/lib/tree-activity.js`（活跃度）、
  `cloudfunctions/compat-api/index.js`（`GET /tree/rank` 增量、`GET /search/global`、两条 wallet 路由 410）、
  `cloudfunctions/compat-api/lib/wallet.js`、`frontend/src/business/{api,index,types}.ts`、
  `frontend/src/pages/{hall,wallet,about,mine}/**`；测试 `cloudfunctions/compat-api/lib/home-sort-search.test.js`。

---

## 1. 一句话

首页列表分**两个 tab**（**家族** / **祖谱**，默认家族；中华世本仍走右下浮动按钮），卡片按综合分排序（默认「综合」，`0.4×人数 + 0.4×活跃度 + 0.2×新近度`；**三档排序切换仅家族档**），每张卡带**人数标签**；
首页新增**全站人物搜索**框，后端 `GET /search/global`（跨全部登记树 + 节点级可见裁剪 + **镜像归并到真身** + `restricted` 标记）；
同一批把**家族树资金功能**落地为下线 —— `POST /wallet/transfer` 与 `GET /wallet/tree-balance` **恒 410**。

---

## 2. 范围

### 2-1 首页列表范围：**两个列表 tab**（本批变更）

- 落点：`frontend/src/pages/index/index.vue`。
- 首页从「单列表」改为**两个列表 tab**：**家族**（默认） / **祖谱**。该 tab **只决定渲染哪个列表**，与既有「首页 / 中华世本」浮动按钮双视图**正交**（切 tab 不改 `showMaster`，切视图不改 `listTab`）。

  ```js
  // 家族档（＝改造前的列表；除新增 tab 外，语义与行为均未变）
  const normalHalls = computed(() => halls.value.filter((h) => !h.isMaster && h.kind !== 'clan'));
  // 祖谱档
  const clanHalls   = computed(() => halls.value.filter((h) => h.kind === 'clan'));
  ```

- **家族档**：只列普通家族树 —— 排除中华世本（`is_master`）与**祖谱**（`kind !== 'clan'`）；**缺 `kind` 的旧 meta 条目按 `family` 兼容**（`kind !== 'clan'` 天然放行 `undefined`）；三档排序 / 卡片 / 入口与改造前**逐条一致**。
- **祖谱档**：只列 `kind === 'clan'` 的树（当前 **3** 本：季氏 `ji_23395` / 顾氏 `gu_39038` / 秦氏 `qin_31206`）；**排序 pill 组不渲染**，只按综合分降序（§3-5、§10-3）。
- **卡片统一模板**：家族与祖谱**同一张卡**（标题 / 「发源地：」副行 / 简介 / **人数标签** / 等级徽章）；点击走**同一入口** `openTreeHome(tree_id)` → `/pages/hall/index?tree_id=…`，由 `hall` 页**按 `kind` 自动切祖谱版式**；H5 地址栏别名对 `kind === 'clan'` 仍生成 `/z/<tree_id>`（别名规则**未变**）。
- 中华世本入口不变（右下浮动按钮 → `ShibenTimeline`）；卡片模板 / 等级徽章 / 视图切换按钮本批不变（「＋ 新建家族树」入口**收紧为仅家族档**，见 §10-4）。

### 2-2 明确**不在**本册范围 / 本批未改

- **树内 `GET /search` 完全未改**（**不得改**）：加父 / 加子 / 挂接 / 认祖 / 审批选人靠它，它必须仍然能看到**本树镜像 / 登记节点**；
  跨树检索是**新路由**（§5-2），不改树内语义、不改其鉴权（仍需 `X-Tree-Id`）。
- ~~`auth-server/**`（遗留 Gramps 链路）仍保留 `/wallet/transfer` 与 `transferToTree`，**本轮未动**~~ → **已于 2026-09-18 删除**（见 §7-c「已解决」条；事实与回滚见 `docs/zhonghua-cleanup-2026-09.spec.md`）。
- 不新增任何列表聚合路由（如 `GET /trees/overview`）：每树派生指标一律加在**既有** `GET /tree/rank` 出参上（§5-1）。

---

## 3. 首页列表与三档排序

### 3-1 排序档（枚举）

`SortMode = 'comprehensive' | 'members' | 'activity'`；**默认 `comprehensive`（综合）**。

### 3-2 综合分公式

```
score = 0.4 * norm(人员数) + 0.4 * norm(活跃度) + 0.2 * norm(新近度)
```

- 权重逐字固定：人员数 **0.4** / 活跃度 **0.4** / 新近度 **0.2**。
- `norm` = **本次列表内极值归一化** `(v - min) / (max - min)`；**`max === min` 时一律记 1**（不记 0、不除零）。
- 三项指标各自独立归一化，极值取**本次渲染列表**（`normalHalls`）内的极值；**不跨批 / 不跨档缓存**。
- 指标取值与兜底：
  - 人员数 = rankMap 的 `person_count`，缺失 / 非数值 → `0`；
  - 活跃度 = rankMap 的 `activity`，缺失 / 非数值 → `0`（后端未重启时显示 0，**不得显示 NaN**）；
  - 新近度 = 树 JSON `updated_at` 时间戳（`Date.parse` 无法解析 / 缺失 → `0`）。
- 综合分**仅「综合」档使用**；另两档不比综合分。

### 3-3 tie-break（三档统一，显式写全）

**主指标降序 → 其余两项指标降序 → `updated_at` 降序 → `tree_id` 升序**。不依赖列表原始顺序（原始顺序随 meta 文件顺序漂移）。

逐档展开（与实现逐字一致）：

| 档 | 比较链（依次） |
|---|---|
| `comprehensive`（综合） | 综合分降序 → 人员数降序 → 活跃度降序 → `updated_at` 降序 → `tree_id` 升序 |
| `members`（人数） | 人员数降序 → 活跃度降序 → `updated_at` 降序 → `tree_id` 升序 |
| `activity`（活跃度） | 活跃度降序 → 人员数降序 → `updated_at` 降序 → `tree_id` 升序 |

排序只作用于**渲染**（`sortedHalls`），不改 `normalHalls` 本身、不改卡片数据。

### 3-4 数据源

- 数据源 = **既有 `fetchTreeRank`（`GET /tree/rank`）**，首页等级徽章本就按树调用（`rankMap` 已在手）→
  **不新增任何网络请求**；活跃度与更新时间随该接口出参下发（§5-1）。

### 3-5 排序作用域（**本批新增 · 2026-09-18**）

- **三档排序（`comprehensive` / `members` / `activity`）只作用于家族档**：**祖谱档只有综合档、没有排序切换**（祖谱 tab 下排序 pill 组 `v-if` 不渲染，**不在 DOM**、不是 `display:none`，§10-3）。
- **两个列表的综合分各自在自己列表内归一化**（实现 = `scoreByList(list)` 一方一算）：家族档极值取 `normalHalls`、祖谱档极值取 `clanHalls`；**公式与权重是同一条**（§3-2，`max === min` 记 1）。
- **tie-break 是同一条**（§3-3 的「综合」链，家族 / 祖谱共用 `compareByScore(a, b, scores)`）：综合分降序 → 人数降序 → 活跃度降序 → `updated_at` 降序 → `tree_id` 升序。
- **切 tab 不重置 `sortMode`**：祖谱档下 `sortMode` 保持原值，切回家族档仍是用户上次选择（排序控件在祖谱档只是不渲染，状态不被清空）。
- 排序仍**只作用于渲染**：`sortedHalls` / `sortedClanHalls` 各自 `slice().sort(...)`，不改 `normalHalls` / `clanHalls` 本身、不改卡片数据。

---

## 4. 活跃度定义（**唯一权威定义**）

某树「**近 30 天互动事件数**」= `jiazu_join_requests` / `jiazu_marriage_requests` / `jiazu_founder_requests` /
`jiazu_clan_requests` **四个集合**中，记录的 `tree_id` / `from_tree` / `to_tree` **任一等于该树**的条数。

- **婚姻记录对 `from_tree` 与 `to_tree` 各计 1**（两棵树各自 +1；同一条记录内同一棵树不重复计数）。
- **认祖 / 建谱只计 `tree_id`**；`master_tree_id` **不计入**（不是本树的互动）。
- 时间字段取值顺序 **`created_at` → `ts` → `handled_at` → `decided_at`**（**首个可解析值即用**）；全部缺失或均不可解析 → **该条不计入**。
- 窗口判定：**`t >= now - 30d`（含等号）**。
- **集合不可用（不存在 / 为空 / 读取抛错）→ 返回 0 且不抛**（活跃度是附属字段，不得拖垮 `/tree/rank`）。
- 实现：`cloudfunctions/compat-api/lib/tree-activity.js`（导出 `EVENT_COLLECTIONS` / `WINDOW_DAYS = 30` /
  `TIME_FIELDS` / `eventTrees` / `countRecentEvents` / `treeActivity`）。

> 本口径为全站唯一权威；其它文档 / 代码若描述「活跃度」，一律引用本节，不得另立（不得用 `jiazu_messages` 等无 `tree_id` 的集合充当家族活跃度）。

---

## 5. 接口契约

### 5-1 `GET /tree/rank`（**增量 · 向后兼容**）

出参**新增两个字段**：

| 字段 | 类型 | 口径 |
|---|---|---|
| `activity` | number | 近 30 天互动事件数（§4；集合不可用恒 **0**，绝不抛） |
| `updated_at` | string | 树 JSON 的 `updated_at` 原值；**缺失 / 空 → 空串 `''`**（不是 `null`、不是 `0`、不是时间戳数字） |

**既有字段全部保留**（本批未删未改语义）：`tree_id`、`total_generations`、`rank_key`、`rank_label`、`rank_en`、`rank_desc`、
`over_limit`、`max_depth`、`root_count`、`person_count`、`explicit`、`access`（`{mode, visible_max_depth, hide_tail, is_master, member, login_required, clamped}`）。

- 前端为新增字段声明**可选**类型（`activity?: number` / `updated_at?: string`）并给 `0` / `''` 兜底
  ——本地 compat-api 无 watch，后端未重启时必须**不崩、不显示 NaN**。
- 鉴权 / 可见性口径不变（读路由，匿名 200；`access` 仍按既有节点级分层计算）。
- **`person_count` 语义修订（2026-09-19 拍板 · 全文见 §10-6）**：字段名 / 形状 / 类型**不变**，但**取值口径已由「树内全部节点数（含镜像）」改为「家族人数」**（本姓男女 + 外姓嫁入女性计入；**本姓女性嫁出的外姓子女不计入**）；**排序归一化仍用它**；**`mirror_count` 保留为字段、不再参与展示（降级登记）**。

### 5-2 `GET /search/global`（**新增** · compat-api）

- **注册位置：树编辑闸门（`缺少 X-Tree-Id`）之前**；**无需 `X-Tree-Id`**（跨树检索，不带该 header 也必须能进业务逻辑）。
- **入参**：
  - `query`（string）：**trim 后为空 → 200 `[]`**（不打库、不报错）；
  - `limit`：**默认 30**，**clamp 1..100**，**非法 / 不可解析 → 回落 30**。
- **范围**：**全部 `tree-meta` 登记树（含世本与祖谱）**；某些 `tree_id` 在 meta 里有登记但**无树文件 → 跳过该树**，
  **不整体 500**。
- **匹配**（三类；出参 `matched` 取值 `'id'` / `'name'`）：
  1. **全局编号 / handle**：`resolveNode(query)`（**不传 treeId = 全局解析**）命中 → `matched:'id'` 且**置顶**；
  2. **编号数字形态等值**：`123` / `000123` / `I000123` **均命中 `I000123`** → `matched:'id'`；
  3. **姓名**：`name` / `surname` / `given` **任一包含** query → `matched:'name'`（**去空格 + 大小写不敏感**，三字段各自 `contains`）。
- **可见性**：逐树套 `resolveTreeAccess(...).isHiddenPerson(handle)` 做**节点级裁剪**（服务端职责；与既有树内搜索 / 隐私分层同口径）。
- **排序 / 截断**：`matched==='id'`（`resolveNode` 置顶命中优先于其它编号命中）置顶 → 其余按 `tree_id` **字典序**
  （**同树内保持 `people` 键序**）；**先归并、后截断到 `limit`**（同一人不会占多个名额）。
- **出参**：条目数组（`200`），每条字段 = `tree_id` / `tree_title` / `handle` / `gramps_id` / `name` / `gender` /
  `birth_date` / `death_date` / `matched` / `restricted`。
- **前端消费**（首页）：搜索框 `placeholder = "搜索人物（姓名 / 编号）"`；
  - **受限条**（`restricted === true`）：显示姓名 / 编号 / 所属树 + 小字「权限受限，不可见详情」，**点击只 `uni.showToast` 提示、不跳转**；
  - **非受限条**：跳 `/pages/person/detail?tree_id=…&handle=…`。

---

## 6. 镜像归并与 `restricted` 语义

- **镜像判据** = `external_mirror === 'true'` **且** `external_person_handle` 非空；
  **不得**用「有 `external_*`」作判据（真身自身也会带外部指针，如跨树婚姻的配偶指针 → 会把真身误判为镜像）。
- **递归解析到最终真身**：沿 `external_person_handle` 逐级向上，直到**非镜像节点**。
  - **防环**：已访问 handle 集合命中环 → 环上无真身（返回 `null`，**绝不拿镜像冒充真身**）；
  - **上限 32 跳**（`MAX_MIRROR_HOPS = 32`）；
  - **断链兑底**：某环解析失败 / 超深 → 返回**最后一个已解析节点**；**任何一环异常都收敛为「解析不到」，绝不抛**。
- **归并键 = 最终真身的 handle**；同一人**只出一条**；**不附注镜像数量**（出参不含「镜像 N 条」类字段）。
  解析不到真身时退回「镜像取 `external_person_handle` / 真身取自身 handle」（handle 全站唯一，**绝不按姓名归并**）。
- **代表选取**：
  1. 组内有 `matched === 'id'` 命中 → 在其中优先 → **真身优先** → `tree_id` → `handle`；
  2. 否则 **真身优先** → `tree_id` → `handle`。
- **`restricted:boolean`**（**不泄漏真身**是硬口径）：
  - 真身对当前访问者**可见** → 代表取**真身**且 `restricted = false`
    ——**即使查询只命中镜像**（例如用镜像自己的编号搜），也返回真身；
  - 真身**不可见或解析不到** → 代表取**镜像**且 `restricted = true`，
    **且响应不泄漏真身 `handle` / `gramps_id` / `tree_id` / `tree_title`**（只填镜像自身对访问者可见的字段）。
- **不得用「组内有没有真身节点」代理 `restricted`**（那是「假受限」的根因）：必须**直接判定真身对当前访问者的可见性**。

---

## 7. 已知边界（**已拍板**，勿当 bug 处理、勿擅自改口径）

- **a. 被可见性裁剪的真身，用其编号搜索返回 0 条。**
  与既有树内搜索 / 隐私分层口径一致（裁剪在服务端读路径，编号等值命中前已过 `isHiddenPerson`）。
  要改成「回落到可见镜像（返回镜像条 + `restricted=true`）」**需另行拍板**。
- **b.（已解决 · 2026-09-18 · ✅）世本「补录」节点与祖谱自有段始祖的「同名无指针双记录」已做数据手术消除。**
  原实例：世本 `zhonghua/I0046` 顾清学 vs 祖谱 `gu_39038/I000139` 顾清学（两条记录之间**没有**镜像指针）→ 原口径「搜索**保持出 2 条**、不做数据手术」。
  **用户拍板后本轮已删世本孤立补录节点 `I0046`**（`people` **140 → 139**，同批删其详情文档 `zhonghua:103ff1c309eb7bf2cb4f6ff1762e`）⇒
  **该边界不再存在**：搜索「顾清学」现为 **guest 1 条**（`gu_39038_01` 镜像 · `restricted = true`）/ **chief 1 条**（祖谱 `gu_39038` `I000139` 真身）；
  按编号 `I0046` 检索 **0 条**。事实、删前核查、备份 / 回滚与云端同步要求见 **`docs/zhonghua-cleanup-2026-09.spec.md`**。
  **归并口径未变**：仍**不按姓名合并**（全站按真身 handle 归并后**仍有 41 组**同名不同人）——本次只删这一个孤立节点，**不是**姓名级去重。
- **c.（已解决 · 2026-09-18 · ✅）`auth-server/**`（遗留 Gramps 链路）的同名转账残留已删除。**
  `auth-server/server.js` 的 `/api/wallet/transfer` 与 `/api/wallet/tree-balance` 两条路由、`auth-server/wallet.js` 的
  `transferToTree` / `getTreeBalance` **本轮已删**（`grep` 0 残留）；其**钱包数据残留**（`trees` 字段 + `type:'transfer'` 流水，两个文件各 1 条）同批清理。
  它**仍属遗留链路、当前不部署**（若日后部署需与本次代码同批发布）。
  事实 / 备份 / 回滚见 **`docs/zhonghua-cleanup-2026-09.spec.md`**（§3-5 / §4 / §5）。

---

## 8. 关联改动：家族树资金功能下线（**引用 `docs/economy.spec.md` §12-3，本册不重写**）

本批与该下线的落地状态**同一批**完成、共用同一测试文件，故在此**只做引用与交叉索引**；权威表述（集合 / 字段 / 路由清单）在
**`docs/economy.spec.md` §12-3**（本册不复制其口径正文）：

- `POST /wallet/transfer` 与 `GET /wallet/tree-balance` 在**鉴权 / 参数校验之前**恒返 **410** +
  `{ error: '家族树资金功能已下线', code: 'TREE_FUND_RETIRED' }`；
- `cloudfunctions/compat-api/lib/wallet.js` 已删 `transferToTree` / `getTreeBalance`，**保留** `deductTreeCreateFee`；
- 前端已删家族树页「家族树资金」区块 + 「转账支持」入口、钱包页「转账到家族树」区块，以及 `business/{api,index}.ts` 两个封装，
  并同步 `about.vue` / `mine/index.vue` 文案；
- `auth-server/**` 的同名残留见 §7-c。

---

## 9. 测试与验收

- **基线**：全量 `npm test` = **350 pass / 0 fail**（本轮）。
- **新增测试文件**：`cloudfunctions/compat-api/lib/home-sort-search.test.js`
  —— **必须已注册进根 `package.json` 的 `scripts.test`**（未注册 = 全量绿是**假绿**）。
  覆盖四组：A（`lib/tree-activity.js` 口径 + `GET /tree/rank` 增量：`activity` / `updated_at` / 既有字段逐字段仍在）、
  B（`GET /search/global` 基础：编号置顶 / 编号匹配 / 姓名匹配 / guest 裁剪 / 空 query → `[]` / `limit` clamp / 树文件缺失不 500）、
  D 与 D-2（镜像归并：递归真身折叠 / 防环防深 / 代表选取 / `restricted` 不泄漏真身 / 不按姓名合并 / 先归并后截断）、
  C（两条 wallet 路由 → 410 + `TREE_FUND_RETIRED`，在鉴权校验之前）。
- **数据安全**：测试一律把 `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 `/tmp` 副本，并在文末断言
  `config/tree-meta.json` + `migrate-output/trees` + `migrate-output/collections` 的 **md5 逐字节未变**。
- **真源数据本轮零改动**：会话期间唯一被写的真源文件是 `migrate-output/collections/jiazu_sms_codes.json`
  （由主代理取 dev 验证码产生），与本批改动无关。
  - **后注（2026-09-18 用户拍板批次）**：随后的数据修正批次对真源做了**两项数据手术**（世本删 `I0046` 顾清学 + 钱包 `transfer` 残留清理）——
    与**本批**（首页列表 / 三档排序 / 全站搜索 / 资金下线）的代码改动**无关**，本批代码本身仍零数据改动；
    该两笔手术的作业依据、前后 md5 与上云要求见 `docs/zhonghua-cleanup-2026-09.spec.md`。
- **前端验收项**（本册不代为断言结果）：`npx vue-tsc --noEmit` exit 0；首页三档切换 + 搜索框（受限条只 toast / 非受限跳转）可用。
- **本批（2026-09-18 增量：列表 tab / 人数标签 / 窄屏）验收要点**（逐条实测结论见 `docs/home-sort-search.qa.md` §15）：
  - 四档宽度（**320 / 360 / 375 / 414**）下，家族档与祖谱档的 `.sort-bar` **行高均为 36px（差 0）**、三颗排序 pill **恒单行**、`documentElement.scrollWidth === innerWidth`（**无横向溢出**）；
  - 切 tab 与点三颗 pill 的**增量网络请求 = 0**（含阳性对照，见 qa §15.5）；
  - **祖谱顺序 = 综合分独立复算**（列表内归一化；当前实测 `[秦氏, 顾氏, 季氏]` ↔ `1.0 / 0.406486 / 0.4`）；
  - **人数标签 = 该树 `/tree/rank` 的 `person_count`**（数值逐位相等）；
  - **家族档三档排序回归**：HEAD 版与工作区版排序逻辑抽成纯 node 脚本喂同一快照 → **三档序列逐位相同**。
- **部署**：本轮**不部署**；需上云的动作（重打包 / 前端 hosting）逐条登记在 `docs/PENDING_DEPLOY.md` §16；
  **2026-09-18 增量（列表 tab / 人数标签 / 窄屏，纯前端）同批随前端产物发布，登记于同文件 §4-1**（后端零改动、不新增集合与云端数据动作）。
  **2026-09-19 家族人数口径修订（§10-6）登记于同文件 §23**：云函数 `GET /tree/rank` 出参**语义变更 → 必须重打包**；首页卡片文案 + 家族页（`hall`）统计栏 **H5 必须重发**（**取代该文件 §21 的卡片显示口径**；状态见同文件 §10-6）。（**已实施（本地已验证，2026-09-19）**：卡片文案与家族页统计栏均已改）

---

## 10. 列表 tab、人数展示与窄屏口径（**2026-09-18 增量 · 已实施**）

落点：`frontend/src/pages/index/index.vue`（工作区已改、未提交）。本节为**口径定稿**；实现与验收证据见 `docs/home-sort-search.qa.md` §15，上云动作见 `docs/PENDING_DEPLOY.md` §4-1。
来源标注：**用户需求原文** = ①「首页的上方添加一个 tab 切换按钮，用户点击后切换到【祖谱】列表的显示，祖谱列表只按照综合排序，所以没有排序的切换。理想位置：搜索框和搜索结果的下方，【综合】【人数】【活跃度】一行的右侧。」②「在家族列表中，各个家族树的人数应予以展示。」；**总监裁决** = 归一化范围取各自列表、切 tab 不重置排序、建树入口仅家族档；**质检证据** = qa §15（两轮真机）。

### 10-1 列表 tab（位置 / 档位 / 正交）

- 档位枚举：`listTab: 'family' | 'clan'`，**默认 `'family'`**。
- 位置：`.sort-bar` 行内**右侧**；同一行左侧 = 排序 pill 组（**仅家族档渲染**）；该行位于**搜索框与搜索结果面板的下方**（DOM 文档序：`search-box → search-panel → sort-bar → 卡片列表`）。
- tab 组 `.tab-switch` 用 `margin-left: auto` 靠右 + `flex-shrink: 0`，与排序组**同一行、不重叠**，排序组隐藏时仍停在同一行右侧（不跳位）。
- 与「首页 / 中华世本」**浮动按钮双视图正交**：`listTab` 只管列表、`showMaster` 只管视图，互不读写对方 ref。
- 切 tab **不重置 `sortMode`**（§3-5）。

### 10-2 人数展示（卡片统一模板）

> ⚠️ **本节展示口径已于 2026-09-19 修订 —— 旧口径「N 人（含外树 M）」单列镜像显示 = 已作废（2026-09-19 口径修订）**。
> 旧口径登记在 `docs/marriage.spec.md` **§9-4 第 4 行** / **§11-4**，其上云动作登记在 **`docs/PENDING_DEPLOY.md` §21**（**本批取代 §21 的卡片显示口径**；§21 正文不改写）。
> **现行口径 = 本册 §10-6（七条全文）**；本节其余内容（卡片模板 / 数据源 / 兜底文案分支）**不变** —— 新口径下卡片**只显「N 人」**、「— 人」兜底分支照旧。

- 卡片统一模板 = 标题 / 「发源地：」副行 / 简介 / **人数标签** / 等级徽章；家族与祖谱**同一张卡**（同一 `<t-cell>` + `#note` 插槽）。
- 数据源 = **既有 `GET /tree/rank` 的 `person_count`**（首页 `rankMap` 本就对全部树并发加载）→ **不新增任何网络请求**。
- 展示口径：`typeof person_count === 'number' && !Number.isNaN(...)` → **「N 人」**；**缺失 / NaN / 该树 rank 请求失败 → 「— 人」**。
- ⚠️ **已知行为（登记项，不当缺陷）**：`loadRanks` 用 `Promise.allSettled` **静默丢弃**失败项 → 该树 `rankMap` 为空 → 卡片显示「— 人」**且按 0 参与综合分排序**（沉到列表尾部）。「真 0 人」与「没取到」在**文案**上可区分（`0 人` / `— 人`），在**排序**上不可区分。

### 10-3 祖谱档排序

- 列表 = `halls.filter(h => h.kind === 'clan')`（当前 3 本：季氏 `ji_23395` / 顾氏 `gu_39038` / 秦氏 `qin_31206`）。
- **排序 pill 组不渲染**（`v-if="listTab === 'family'"`）。
- **只按综合分降序**：公式与权重不变（§3-2），但**归一化范围 = 祖谱列表自身**（`max === min` 记 1）；tie-break 与家族档**同一口径**（§3-5）。

### 10-4 空态与建树入口

- 空态文案两档：家族档 **「暂无已上线的家族数字馆」** / 祖谱档 **「暂无祖谱」**（同一 `.empty` 元素按 `listTab` 三元切换）。
- **「＋ 新建家族树」入口仅家族档显示**（`v-if="canCreateTree && listTab === 'family'"`）：它是**建家族树**的入口，祖谱档下**不在 DOM**（不是 `display:none`）。

### 10-5 窄屏口径（单行硬约束）

- `.sort-bar`：`display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; min-height: 36px;`
- `.sort-group`：`display: flex; gap: 8px; flex-wrap: nowrap; min-width: 0;`
- `.tab-switch`：`flex-shrink: 0`（永不被排序组挤压）+ `margin-left: auto`。
- `@media (max-width: 370px)`：`.sort-bar` / `.sort-group` `gap: 6px`；`.sort-btn` `padding: 8px 9px`；`.tab-btn` `padding: 6px 10px`；`.sort-text` / `.tab-text` `font-size: 12px`（≤370px 走 12px、>370px 走 13px）。
- **行高恒等的依据（垂直账，已实测）**：排序组 = `padding 8×2 + border 1×2 = 18px`；tab 组 = `border 1×2 + padding 2×2 + 按钮 padding 6×2 = 18px`；两组文字同字号 → 行盒等高 ⇒ 家族档（有排序组）与祖谱档（排序组被 `v-if` 移除）**行高严格一致**，切 tab 时下方列表**不跳动**。
- 目标（已实测达成）：320 / 360 / 375 / 414 四档下**切换 tab 行高不跳、pill 不换行、无横向溢出**。

### 10-6 家族人数口径（**2026-09-19 拍板 · 现行** · 取代旧「N 人（含外树 M）」单列镜像口径）

> 状态：**已实施（本地已验证，2026-09-19（Zang 汇总））** —— 实施与本地验证已完成；本节只登记**口径**与**上云动作**，**不表示已实现 / 已通过 / 已部署**。
> **作废登记**：旧口径「**N 人（含外树 M）**」（首页家族 / 祖谱卡片 = `person_count` + 单列 `mirror_count`）登记在 `docs/marriage.spec.md` **§9-4 第 4 行** / **§11-4**，其上云动作登记在 **`docs/PENDING_DEPLOY.md` §21** —— **该显示口径已作废（2026-09-19 口径修订）**；本节的 7 条为**现行口径**，并**取代 §21 的卡片显示口径**（§21 正文不改写）。
> ⚠️ **编号提示**：**本册 §9 是「测试与验收」，无 `§9-4` 子节**；旧口径的「§9-4」一律指 **`docs/marriage.spec.md` §9-4**（该册本轮**未由本角色改动**，作废回写待 Zang 汇总）。

**一、口径正文（七条 · 逐条）**

1. **本姓节点（`surname === 本树本姓 S`）无论男女一律计入。**
2. **外姓嫁入的女性一律直接计入**，**不再单独标注 / 单列**（含 `external_mirror === 'true'` 且 `external_link_type === 'marriage'` 的媳妇镜像）。
3. **「本姓女性嫁出后所生的子女」不计入。** 判据：节点 `P` 存在家族 `F` 使 `P ∈ F.child_handles`、`surname(F.mother_handle) === S`、`F.father_handle` **为空或** `surname(F.father_handle) !== S`，**且** `surname(P) !== S`；另有**等价保险判据** `external_mirror === 'true'` **且** `external_link_type === 'child'` —— **该保险判据受本姓保护：本人本姓时按规则 1 计入（即使它是 child 镜像）；仅当本人非本姓时才排除**。**孩子本身本姓时仍计入。**
4. **其余节点本轮照旧计入**（外姓男性姻亲、无家族关系记录、外部登记占位节点）—— **不扩大排除范围**。
5. **本姓 `S` 解析顺序**：`tree-meta` 该树 `surname_char` → **始祖节点**（`founder_handle` / `founder_gramps_id` / `'I0001'` **三级兜底**）的 `surname` → **全树非空 `surname` 众数** → `''`（**`S` 为空则规则 3 不生效**）。
6. `GET /tree/rank` 的 **`person_count` 语义改为上述口径**（**字段名 / 形状 / 类型不变**）；`mirror_count` **保留为字段但不再用于展示（降级登记）**；**排序公式与 tie-break 不变**、归一化**继续用 `person_count`**（§3-2 / §3-3 / §3-5 逐字不变）。
7. **展示变更**：① 首页家族 / 祖谱卡片文案由「N 人（含外树 M）」改为「**N 人**」（§10-2 兜底「— 人」分支照旧）；② **家族页（普通家族树页 `hall`）树图统计栏「共 N 人」改为与卡片同一口径** —— 读 `/tree/rank` 的 `person_count`，**不再用「按登录档位裁剪后的人物列表长度」**（与 `docs/permission-tier.spec.md` §5 末条的「聚合计数」补注一致）。

**二、字段口径一句话（本册各节与实现共用）**

**`person_count` 语义 = 家族人数（上述七条），排序归一化仍用它；`mirror_count` 为保留字段、不再参与展示。**

**三、真源期望值（**未实施** · 供实施者与部署校验对照）**

| tree_id | 现状（真源 `people` 长度） | 新口径期望 | 备注 |
|---|---|---|---|
| `ji_23395_01` | 90 | **89** | 排除 1：`I000237 满满`（规则 3：本姓女嫁出所生外姓子女） |
| `gu_39038_01` | 24 | **22** | 排除 2：`I000293 季庭亦` / `I000294 季贺为`（同时命中规则 3 与保险判据 `external_link_type='child'`） |
| `liu_21016_01` | 19 | **18** | 排除 1：`I000266 李阳 独生 表哥`（规则 3） |
| `shen_27784_01` | 14 | **11** | 排除 3：`I000286 季清昆`（规则 3 + `child` 镜像）/ `I000279 纪青森` / `I000281 秦铭铭`（规则 3） |
| `zhonghua` | 112 | **112** | 无排除 |
| 其余 **11** 棵树 | `gu_39038` 2 / `ji_23395` 2 / `ji_32426_01` 3 / `li_26446_01` 3 / `li_26446_02` 3 / `liu_21016` 37 / `long_40857_01` 3 / `qin_31206` 4 / `qin_31206_01` 0（`people` 为空）/ `rong_23481_01` 3 / `heng_24658_01` 3 | **不变** | 排除集为空 |

**`S` 解析来源（真源实测）**：`ji_23395_01` / `zhonghua` = `tree-meta.surname_char`；`gu_39038_01` = **始祖节点兜底**（该树 `tree-meta` **无** `surname_char`）；`liu_21016_01` / `shen_27784_01` = **全树众数兜底** —— **三级来源各自都被真源用到** ⇒ 规则 5 的兜底链缺一不可。
**数值来源标注**：上表由**文档角色只读复算**（2026-09-19，只读 `migrate-output/trees/*.json` + `config/tree-meta.json`，**未写任何文件、未实施、未改真源**）得出，与 Kevin 本轮拍板口径**逐树一致**；**属口径登记，不是实施证据**。

**四、上云与回写**

- **上云动作**（云函数重打包 + H5 重发）见 **`docs/PENDING_DEPLOY.md` §23**（**取代 §21 的卡片显示口径**；§21 正文不改写）；状态：**已实施（本地已验证，2026-09-19）**。
- **权限侧补注**见 **`docs/permission-tier.spec.md` §5 末条**：`/tree/rank` 的 `person_count` 与**家族页统计栏**属**聚合计数**，**不随节点级读裁剪变化**。
- **未回写项（待 Zang 汇总）**：`docs/marriage.spec.md` **§9-4 第 4 行 / §11-4** 仍留旧「N 人（含外树 M）」正文，需改记为「**已作废（2026-09-19 口径修订）**」；该册本轮**不在本角色的写入范围**内。

**修订记录（2026-09-19）：保险判据补本姓保护——与规则 1 互斥的边界由本行收口（质检发现、Zang 终审）。**
> **2026-09-19 追加（已落地 · 实施完成）**：本口径状态 = **已实施（本地已验证，2026-09-19（Zang 汇总））**，证据见 `docs/PENDING_DEPLOY.md` §23-1「本地验证证据」（全量 `npm test` **# tests 427 / # pass 427 / # fail 0**；运行中 3100 实测 `ji_23395_01` **89** / `gu_39038_01` **22** / `liu_21016_01` **18** / `shen_27784_01` **11** / `zhonghua` **112**；质检独立复算 16 棵树 0 不一致、全库排除 7 节点；UI 实测首页卡片「季氏费县白露家族 … 89 人」（无「含外树」）、家族页 `共 89 人`）；上条**未回写项已回写** —— `docs/marriage.spec.md` 已按关键字逐处加注「**已作废 2026-09-19**」（§9-4 第 4 行 / §9-7 第 7 条 / §10 `tree-pedigree` 条目 / §11-4 及其交叉引用第 7 条 / §11-8 命名说明）；**上云动作「必须重打包」不变**（部署仍未执行）。
> **本节末尾指引**：本节（§10-6）只定义**人数口径**；**家族树写路径守卫**与「**承母嗣**」标记另立 **§10-7**（写路径拒绝规则**不在**本节）。

### 10-7 家族树写路径守卫与「承母嗣」（**口径登记 · 2026-09-19 拍板**）

> 状态：**本轮实施中（待 Zang 汇总后回写）** —— 由另一位实施者**并行实施中**；本节**只登记口径**，**不表示已实现 / 已通过 / 已部署**，**不得**当作实施证据引用。

**目标不变量**：家族树（`kind === 'family'`）只应包含「**本族成员（男女）+ 婚入配偶**」；**女性一旦婚配，其后代不进本树**（由男方一侧算入）—— **唯一例外** = 手动挂载的「**承母嗣**」。

**一、写路径守卫口径（逐条 · 与实施单一一对应）**

1. **只对 `kind === 'family'` 的家族树生效。** 世本 / 祖谱（`kind !== 'family'`）**不套用**本守卫 —— 世本**有母系起始节点**，套上会**断链**（合法挂载被误拒）。
2. **新增子节点挂到父下**：若该**父**在目标树里**不是本族成员**（非本族本姓成员）**且不是本树镜像** ⇒ **400 拒绝**。
3. **新增子节点挂在母下（父槽为空）**：若**母是本族成员且已婚配** ⇒ **400 拒绝**，**除非**请求**显式**带上 `maternal_succession: true`（**承母嗣**，等价布尔）—— 显式声明后放行，后代挂在该女性名下。
4. **`maternal_succession` 落库形态**：写入**详情文档属性**（property）；key = 字符串 `maternal_succession`，值 = 字符串 `'true'`（与详情文档既有属性同形）。
5. **前端**：家族树「**＋ 添加子女**」表单新增「**承母嗣**」勾选框 + **提示文案** ——「**本族女性一旦婚配，其后代默认不入本树；勾选后才挂在女性名下**」；勾选 ⇒ 提交请求带 `maternal_succession: true`。

**二、拒绝语义（写路径）**

- 第 2 / 3 条的拒绝 = **HTTP 400**（前端表现为保存失败、**不新增节点**），**不是**静默丢弃、**不是** 500；拒绝发生在挂载前 ⇒ **不写任何节点 / 关系**（无半成品落库）。
- 守卫**只在写路径**生效：**读路径 / 树图绘制**不因本守卫对**存量节点**二次拒绝（存量照旧绘制）。

**三、边界与不变项**

- **存量数据不在本轮修正**：本轮只**加写路径守卫**，不回溯改已有节点的归属与层级。
- **人数仍 = §10-6 口径**：家族树 = `people` − 被排除项；世本 / 祖谱 = `people` 数（**不套用**家族树排除规则）。
- **不改 §10-6 七条**：`person_count` 语义 / 排序归一化 / tie-break **逐字不变**。
- 上云 / 部署登记由 **`docs/PENDING_DEPLOY.md` §23** 承接（本批**实施中**，证据待 Zang 汇总后回写）。
