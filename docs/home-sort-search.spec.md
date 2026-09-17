# 首页列表范围 · 三档排序 · 全站人物搜索 · 家族树资金下线 — 规格（home-sort-search.spec.md）

状态：**已实施**（2026-09-17，本轮；由主代理亲验）。测试基线：全量 `npm test` = **350 pass / 0 fail**。
关联与**从属关系**（重要）：

- **本册不凌驾于任何总纲之上**。经济域（集合名 / 字段名 / 枚举取值 / 路由清单 / 算法口径 / 价格表）的唯一权威是
  **`docs/economy.spec.md`**；集合与 API 契约的权威是 `docs/data-model.md`；节点级（世级）读可见分层的权威是
  `docs/permission-tier.spec.md`；全站编号（`gramps_id` / `handle` / `resolveNode`）的权威是 `docs/id-system.spec.md`。
  **本册只描述本批四项改动的落地口径**；与上述册子冲突时**以彼为准，并同步修订本册**。
- 待部署动作（四要素）见 `docs/PENDING_DEPLOY.md` §16；本轮独立质检报告见 `docs/home-sort-search.qa.md`（本册不复制、不预告其结论）。
- 代码落点：`frontend/src/pages/index/index.vue`（列表范围 / 三档排序 / 搜索框）、`cloudfunctions/compat-api/lib/tree-activity.js`（活跃度）、
  `cloudfunctions/compat-api/index.js`（`GET /tree/rank` 增量、`GET /search/global`、两条 wallet 路由 410）、
  `cloudfunctions/compat-api/lib/wallet.js`、`frontend/src/business/{api,index,types}.ts`、
  `frontend/src/pages/{hall,wallet,about,mine}/**`；测试 `cloudfunctions/compat-api/lib/home-sort-search.test.js`。

---

## 1. 一句话

首页列表**只列普通家族树**（排除世本与祖谱），卡片按**三档排序**（默认「综合」，`0.4×人数 + 0.4×活跃度 + 0.2×新近度`）；
首页新增**全站人物搜索**框，后端 `GET /search/global`（跨全部登记树 + 节点级可见裁剪 + **镜像归并到真身** + `restricted` 标记）；
同一批把**家族树资金功能**落地为下线 —— `POST /wallet/transfer` 与 `GET /wallet/tree-balance` **恒 410**。

---

## 2. 范围

### 2-1 首页列表范围（本批变更）

- 落点：`frontend/src/pages/index/index.vue`。

  ```js
  const normalHalls = computed(() => halls.value.filter((h) => !h.isMaster && h.kind !== 'clan'));
  ```

- 语义：**只列普通家族树** —— 排除中华世本（`is_master`）与**祖谱**（`kind !== 'clan'`）。
- **缺 `kind` 的旧 meta 条目按 `family` 兼容**（`kind !== 'clan'` 天然放行 `undefined`）。
- 中华世本入口不变（右下浮动按钮 → `ShibenTimeline`）；祖谱入口不变（`/z/<tree_id>` 别名路由）；卡片模板 / 等级徽章 / 新建入口 / 视图切换按钮本批不变。

### 2-2 明确**不在**本册范围 / 本批未改

- **树内 `GET /search` 完全未改**（**不得改**）：加父 / 加子 / 挂接 / 认祖 / 审批选人靠它，它必须仍然能看到**本树镜像 / 登记节点**；
  跨树检索是**新路由**（§5-2），不改树内语义、不改其鉴权（仍需 `X-Tree-Id`）。
- `auth-server/**`（遗留 Gramps 链路）仍保留 `/wallet/transfer` 与 `transferToTree`，**本轮未动**（见 §7-c）。
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

数据源 = **既有 `fetchTreeRank`（`GET /tree/rank`）**，首页等级徽章本就按树调用（`rankMap` 已在手）→
**不新增任何网络请求**；活跃度与更新时间随该接口出参下发（§5-1）。

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
- **b. 世本「补录」节点与祖谱自有段始祖是「同名无指针的双记录」。**
  实例：世本 `zhonghua/I0046` 顾清学 vs 祖谱 `gu_39038/I000139` 顾清学（两条记录之间**没有**镜像指针）。
  搜索**保持出 2 条** —— **不做数据手术、不按姓名合并**；参考事实：全站按真身 handle 归并后**仍有 41 组**同名不同人。
- **c. `auth-server/**`（遗留 Gramps 链路）仍保留 `/wallet/transfer` 与 `transferToTree`。**
  （`auth-server/server.js`、`auth-server/wallet.js`）本轮**未动**；它属**遗留链路**，不在运行链路口径内，
  不得据它判定「资金功能未下线」。

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
- **前端验收项**（本册不代为断言结果）：`npx vue-tsc --noEmit` exit 0；首页三档切换 + 搜索框（受限条只 toast / 非受限跳转）可用。
- **部署**：本轮**不部署**；需上云的动作（重打包 / 前端 hosting）逐条登记在 `docs/PENDING_DEPLOY.md` §16。
