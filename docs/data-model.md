# 数据模型设计文档（v1 草案）

> 目标：摆脱 Gramps-Web 运行时依赖，自定义数据层，同时保持前端零改动。
> 配套架构：EdgeOne 泛域名（H5 入口）或自建 nginx；后端 CloudBase 云函数或 Node 服务（二选一，见「开放问题」）；小程序直连同一套 API。
> 本文件覆盖：存储三层切分、各层 schema、兼容层 API 契约、写一致性、迁移路径。

---

## 1. 设计原则

1. **前端零改动**：新后端输出保持 Gramps-Web API 的 JSON 形状（`RawPerson` / `family` / `search` 等），前端 `business/api.ts`、世系图、详情页全部不动。
2. **字段零重叠**：同一字段只存在于一个存储位置 → 任何编辑都是单点写，不存在"两处同步"问题。
3. **一棵家族树 = 一个 JSON 聚合文件**：树是领域聚合根，整树序列化为一个文件（云存储/COS），备份、迁移、版本管理都以文件为单位。
4. **存储接口抽象**：树 JSON 放云存储还是服务器本地、业务表放 CloudBase 还是 SQLite，都是可替换实现；schema 与部署解耦。
5. **数据主权**：GEDCOM 导入/导出是独立管线，不依赖运行时存储（详见 §8）。

---

## 2. 存储总览（三层切分）

| 层 | 内容 | 存储 | 读写模式 | 真源 |
|---|---|---|---|---|
| **树 JSON** | 世系结构：全部人物概要 + 家族关系（扁平 map + handle 引用） | 云存储/COS 或服务器本地，一棵树一个文件 `trees/<tree_id>.json` | 整树读：一次 GET + CDN 缓存；整树写：PUT + version 乐观锁 | 结构真源（姓名/性别/生卒/关系/跨树软关联） |
| **人物详情** | 每人一条档案：events / media / citations / notes / attributes | CloudBase 文档库，集合 `person_details`，`_id = "<tree_id>:<handle>"` | 点开详情才读单文档；档案类字段单点写 | 档案真源（不含结构字段） |
| **业务表** | users / wallets / anchors / leave_requests / tree_meta / codes | CloudBase 文档库（集合见 §5） | 低频读写 | 各自独立 |

> 树 JSON **不含**人物档案（events/media/…），详情文档**不含**姓名/生卒/关系 → 字段零重叠。
> 例外（允许的软冗余）：`gramps_id`、`name` 会出现在详情文档的展示字段中，以 handle 关联，由"孤儿清理"兜底（§7）。

---

## 3. 树 JSON schema（核心）

文件：`trees/<tree_id>.json`（如 `trees/ji_23395_01.json`、`trees/zhonghua.json`）

```jsonc
{
  "_schema": "1.0",
  "tree_id": "ji_23395_01",

  // 并发乐观锁：每次结构写操作 +1；写前比对，冲突返回 409
  "version": 12,
  "updated_at": "2026-08-15T08:00:00.000Z",

  // 世系图单根构建用（tree-meta.founder_gramps_id 的冗余，便于纯文件自包含）
  "founder_gramps_id": "I0058",

  // 扁平人物 map：handle -> person（结构概要）
  "people": {
    "H1234567890abcdef": {
      "handle": "H1234567890abcdef",
      "gramps_id": "I0058",
      "name": "季X",            // 完整显示名（姓+名），前端直接消费
      "surname": "季",
      "given": "X",
      "gender": "M",            // "M" | "F" | "U"（前端形状，不照搬 Gramps 0/1/2）
      "birth_date": "1850",     // 字符串日期（兼容前端 "1850" / "1920-03"），仅年份时即"年"
      "death_date": "1920",
      "is_living": true,        // 显式健在状态（可选）。true=健在；false=已故（death_date 可空=卒年不详）。
                                // 缺省（旧数据无此字段）由读路径推断：有 death_date → 已故，否则视作健在（隐私保守）
      "birth_place": { "origin_code": "", "note": "" },   // 出生地（**2026-09-20 起为对象**，非字符串）：
                                // origin_code = 三级行政区划码（可空串）；note = 细节补充（展示文案 =「备注」）
                                // 历史存量形态为字符串 ⇒ 读侧必须容错归一为 {origin_code:'', note:<原串>}，非法类型 → 空对象
                                // 口径真源 = docs/person-places.spec.md（§1 / §3-2）
      "residence_places": [],   // 居住地（**2026-09-20 新增**）：[{ origin_code, note }] 数组，**上限 9 条**，
                                // 顺序即展示顺序；无则 []；第 10 条由后端 400 拒绝（C10）
                                // 口径真源 = docs/person-places.spec.md（§2）
      "death_place": "",
      "parent_family": "F1001",          // 所属父母家族 handle（无则缺省 = 根候选）
      "spouse_families": ["F2001"],      // 本人作为父亲/母亲的家族列表
      "external_tree": "",               // 跨树软关联（分迁占位/出嫁/登记始祖）
      "external_person_handle": "",
      "external_link_type": ""           // "branch" | "marriage" | "founder"
    }
  },

  // 扁平家族 map：handle -> family（父母 + 子女引用）
  "families": {
    "F1001": {
      "handle": "F1001",
      "gramps_id": "F1001",
      "father_handle": "H1234567890abcdef",   // 缺省 = 单亲家族
      "mother_handle": "",
      "child_handles": ["H9999..."]
    }
  }
}
```

### 3.1 与前端类型的映射（关键：`buildPedigreeForest` 零改动）

| 前端类型 | 来源 |
|---|---|
| `PersonSummary`（people 数组） | 树 JSON `people` 值，逐字段同名（handle/gramps_id/name/surname/gender/birth_date/death_date/external_*）；`is_living` 显式字段优先，缺省 = `!death_date`（有卒年即已故，否则隐私保守视作健在） |
| `FamilySummary`（families 数组） | 树 JSON `families` 值（father_handle/mother_handle/child_handles） |
| 根候选判定 | `buildPedigreeForest` 从 families 反推 `childToFamilies`——`parent_family` 字段**仅供编辑/校验**，不参与世系构建（现有逻辑无需改） |

### 3.2 规模预估

- 单节点概要 ~150 字节；1,000 人 ≈ 300KB；10,000 人 ≈ 2MB（含 families）。
- 整树一次 GET：国内 2MB 可接受；zhonghua 总谱超过 2 万人时按代/分支分片（后续迭代，v1 不做）。

---

## 4. 人物详情文档 schema

集合：`person_details`，`_id = "<tree_id>:<handle>"`（保证跨树隔离，天然支持按 tree_id 前缀查询）

```jsonc
{
  "_id": "ji_23395_01:H1234567890abcdef",
  "tree_id": "ji_23395_01",
  "handle": "H1234567890abcdef",
  "gramps_id": "I0058",           // 展示冗余（软冗余，孤儿清理兜底）
  "name": "季X",                  // 展示冗余（软冗余）

  "events": [
    { "type": "Birth", "date": "1850", "place": "山东省临沂市费县", "description": "" },
    { "type": "Death", "date": "1920", "place": "", "description": "" }
  ],
  "media": [
    { "url": "https://media.jiapu100.com/xxx.jpg", "thumbnail_url": "", "description": "旧谱影印", "mime_type": "image/jpeg" }
  ],
  "citations": [
    { "source_title": "季氏族谱（民国版）", "page": "卷三 p12", "confidence": "High" }
  ],
  "notes": [
    { "type": "Note", "text": "…", "format": "text" }
  ],
  "attributes": [
    { "key": "字", "value": "某某", "type": "字" }
  ],
  "updated_at": "2026-08-15T08:00:00.000Z"
}
```

> 前端 `PersonDetail` 的 `profiles` / `families` 字段由兼容层从树 JSON 现算（§6 接口 `/people/<handle>`），不落库。

**保留属性 key（称号类，与姓名结构字段分离）**：`号` / `封号` / `谥号`。
本名（姓+名）只进树 JSON 的 `surname`/`given`；称号一律走详情文档 attributes，展示层统一读这三个 key
（姓名旁短标签取 `封号 → 号 → 谥号` 首个非空项）。GEDCOM 管线映射：`封号 → TITL`、`号 → NICK`、
`谥号 → _ATTR 谥号:`（5.5.1 无标准谥号标签），导入侧对称还原（`scripts/gedcom-{export,import}.mjs`）。

---

## 5. 业务集合 schema（CloudBase 文档库）

> **部署命名**：jiazu 与 liwu 复用同一 CloudBase 环境（`liwu-d8gek6jjdab1d087c`），
> 为避免集合冲突，**所有集合统一加 `jiazu_` 前缀**（下表为逻辑名，实际部署名 = `jiazu_` + 逻辑名）。
> 树 JSON 存云存储 `trees/<tree_id>.json`（云存储按环境隔离，无需前缀）。

### 5.1 `users`（部署名 `jiazu_users`）

```jsonc
{ "_id": "16601061656", "phone": "16601061656", "nickname": "季节", "role": "chief_editor", "created_at": "..." }
```

角色枚举（沿用 scope.js）：`guest`（默认，只读）/ `user` / `tree_steward` / `chief_editor` / `branch_curator`

### 5.2 `wallets`（单文档 + 内嵌事务日志，沿用现状结构，量小无需拆分集合）

```jsonc
{
  "_id": "global",
  "users": { "16601061656": { "balance_cents": 1070 } },
  "trees": { "gu_39038_01": { "balance_cents": 2000 } },
  "transactions": [
    { "id": "tx_...", "type": "recharge" | "transfer" | "tree_create_fee", "user": "...", "tree": "...", "amount_cents": 5000, "desc": "...", "ts": "..." }
  ],
  "tree_create_fee_cents": 990
}
```

### 5.3 `anchors`（原 role-anchors.json）

```jsonc
{ "_id": "16601061656", "tree_id": "ji_23395_01", "person_handle": "H...", "updated_at": "..." }
```

> 约束：一人一树终身制（重复绑定被拒，逻辑在服务端）。

### 5.4 `leave_requests`

```jsonc
{ "_id": "LR_1786701875176_xxx", "phone": "...", "tree_id": "...", "person_handle": "...", "reason": "...", "status": "pending" | "approved" | "rejected", "created_at": "...", "handled_by": "...", "handled_at": "..." }
```

### 5.5 `tree_meta`

tree-meta 从"配置文件"升级为**文档**（`_id = "global"`，内容 = 现 config/tree-meta.json 整体），由管理接口写入；`config/tree-meta.json` 保留为 git 管理的 seed/备份，部署时单向同步。

```jsonc
{ "_id": "global", "_schema": "1.1", "_root_domain": "jiapu100.com", "trees": { "zhonghua": { "...": "..." } } }
```

**条目字段（`trees.<tree_id>`）补充**：`tree_id`、`path_alias`、`surname_char`（姓氏汉字）、**`surname_pinyin`**（该树**实际采用**的姓氏拼音；新建树 / 拆分 / 新建祖谱均写，口径与遗留缺口见 `docs/tree-id.spec.md` §4）、`kind`（`'master'` / `'clan'` / `'family'`，见 `docs/clan-tree.spec.md` §2）、`display_title` / `genealogy_name` / `hall_name` / `origin` / `description` / `founder_*` 等展示字段。
**条目字段补充（2026-09-20 新增 · 发源地结构化）**：**`origin_code`**（**字符串**：6 位行政区划代码；**空串意为「未结构化」**；**结构化真源**；口径见 `docs/geo-origin.spec.md`）；同条的 **`origin` 降级**为「**写时由名称表反查 `origin_code` 生成的展示串**（**软冗余**，**禁止前端手改**）」——两者冲突时**以 `origin_code` 为准**；**读侧 legacy 判据一律 `(entry.origin_code ?? '') === ''`**（**字段缺失与空串同判**：存量未迁移树**不补写空串**）。
**条目字段补充（2026-09-20 追加 · 发源地 ＝ 人工指定）**：`trees.<tree_id>.origin_code` / `origin` 的**内容来源**自本日起为「**用户在始祖附近节点中人工指定的结果**」—— **不存在任何「改始祖出生地即自动回写 tree-meta」的逻辑**（Zang 2026-09-20 口径变更：原「写时同步镜像」**已作废**）。指定入口 = **`POST /admin/set-tree-origin`** `{ tree_id, person_handle }`（权限同 `PUT /tree-meta` = chief_editor；返回含 `source: {handle, gramps_id, name}`）；**可选范围 = 始祖节点 + 其下 1–2 代（共三代）**，且**被指定节点的 `birth_place.origin_code` 必须非空**；候选读接口 = `GET /tree/origin-candidates`（始祖识别失败时返回 `founder:null, candidates:[]`，不报 400）；**始祖认定 = `founder_handle` 优先，缺失时取唯一「非镜像」根节点**（`String(external_mirror) !== 'true'` 且 `parent_family` 为空；**0 个或多个 → 400**；⚠️ 实测 `qin_31206` / `liu_21016` 的 `founder_handle` 为**空串**，判据必须是「非空」而非「字段存在」）。**建树时**（`POST /admin/create-tree`）填写的发源地 **同时写 tree-meta 与始祖节点 `birth_place.origin_code`（`note:''`）**，使「树上发源地 = 某节点出生地」恒成立。`PUT /tree-meta` 的直写分支**保留为兼容入口，不再是正规入口**。**完整口径（契约 C1–C11、读响应形状、迁移、回滚）= `docs/person-places.spec.md`**。
条目的 `tree_id` **不是**自由填写的字符串：由 `<姓氏拼音>_<汉字码点>_<两位序号>` 规则生成（唯一真源 = `cloudfunctions/compat-api/lib/tree-write.js` 的 `surnamePinyin()` / `nextTreeId()` / `genClanTreeId()`；**无兜底**，取不到拼音一律 400）→ 完整口径见 **`docs/tree-id.spec.md`**。

### 5.6 `sms_codes`（临时验证码，TTL 索引 5 分钟）

```jsonc
{ "_id": "16601061656", "code": "123456", "expires_at": "..." }
```

---

## 6. 兼容层 API 契约（前端接口 → 数据源映射）

实现形态：**`cloudfunctions/compat-api/`**（CloudBase 云函数，`exports.main` 导出；
本地开发 `COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js [port]`，
cloud 模式需 `CB_ENV`/`CB_KEY` 环境变量）。
输出形状 = Gramps-Web 形状（`RawPerson` 等），**前端 api.ts 的解析逻辑原样可用**。

> **P2 写接口已完成**：认证/钱包/角色/锚点/join/leave/people+families 编辑/
> split-tree/remove-branch-link/tree-meta PUT，权限矩阵与 auth-server 一致
> （guest 只读、总谱仅 chief_editor、user/branch_curator 节点范围校验、≤72 世深度上限）。
> 业务数据迁移：`node scripts/migrate-business-data.mjs [--local]`
> （auth-server/data/*.json → jiazu_users/jiazu_wallets/jiazu_anchors/jiazu_leave_requests）。
>
> **部署（已上线）**：`cloudbaserc.json`（functionRoot=./cloudfunctions/deploy）→
> `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`。⚠️ CloudBase Node 云函数按
> **CommonJS** 加载入口（ESM 直接 exit 145），部署走 esbuild 打包产物：
> `npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs
> --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`
> （store.js 的 `__dirname` 用 `typeof __dirname !== 'undefined' ? __dirname : fileURLToPath(import.meta.url)` 兼容双形态）。
> HTTP 访问服务：触发路径 `/api/*`、无需鉴权、集成响应；域名
> `https://liwu-d8gek6jjdab1d087c-1463728495.ap-shanghai.app.tcloudbase.com`。
> 生产环境变量建议：`AUTH_JWT_SECRET`（控制台设置，当前为 dev 默认值）。

> 已知坑（已处理）：@cloudbase/node-sdk 并发请求会 `aborted`（令牌串扰）——SDK 调用
> 统一走 `sdkCall()` 互斥队列 + abort 自动重试；`doc().get()` 返回的 `data` 是数组需取 `[0]`；
> 树 JSON 的云存储 fileID 从 `jiazu_tree_meta/global.storage_files` 读取（上传脚本写入）。
> **`attribute_list` 的 type 必须是纯字符串**（Gramps 原生形式）——前端 `fetchMasterTree`
> 只处理字符串 type，对象形式 `{string: key}` 会导致 zhonghua 时间轴误判"源流链未导入"。

### 6.1 认证与账户（业务集合）

| 接口 | 方法 | 数据源 |
|---|---|---|
| `/auth/send-code` | POST | sms_codes（开发模式返回 dev_code） |
| `/auth/register` | POST | users（新用户 role=guest） |
| `/auth/login` | POST | users + JWT（沿用 7 天有效期） |
| `/auth/me` | GET | users |

### 6.2 人物与家族（树 JSON + 详情文档拼装）

**GET `/people/<handle>?profile=all`** → 输出 Gramps `RawPerson` 形状：

| RawPerson 字段 | 来源 |
|---|---|
| `handle` / `gramps_id` | 树 JSON person |
| `gender` (0/1/2) | 树 JSON `gender` 转数字（M→1, F→2, U→0） |
| `primary_name.first_name` / `surname_list` | 树 JSON `given` / `surname` |
| `attribute_list` | 详情文档 attributes + **external_* 三项**（前端 toPersonSummary 从这里读跨树软关联，必须塞进 attribute_list） |
| `profile.birth/death {date, place}` | 树 JSON `birth_date/birth_place/death_date/death_place` |
| `profile.families[]` / `primary_parent_family` | 树 JSON families 现算（father/mother/children 摘要：姓名/生卒从 people map 取） |
| `event_ref_list` / `family_list` / `parent_family_list` | 树 JSON `spouse_families` / `parent_family`（引用数组） |

**GET `/people/?profile=all`** → 树 JSON people 全量转 RawPerson[]（前端 `fetchPersonList` / `fetchMasterTree` / stats 共用）。
**GET `/families/`** → 树 JSON families 全量（`father_handle/mother_handle/child_ref_list` 形状）。
**GET `/search/?query=&profile=all&pagesize=20`** → 树 JSON 内存过滤（name/surname/given 包含 query，忽略大小写），返回 `[{handle, object: RawPerson}]`（前端读 `object` 字段，形状保持）。
**GET `/people/<handle>`（带 Bearer）** → 同 profile=all，编辑用（前端 fetchPersonForEdit）。
**PUT `/people/<handle>`（带 Bearer）** → 校验权限（scope.js 逻辑）→ 写树 JSON（概要字段）→ 写详情文档（档案字段）→ version+1。
body = Gramps RawPerson 形状 + 编辑表单约定顶层字段（仅 compat 消费，auth-server 转发前剥离，不影响 Gramps-Web）：

```jsonc
{
  "primary_name": { "first_name": "X", "surname_list": [{ "surname": "季", "primary": true }] },
  "gender": 1,
  "attribute_list": [],
  "birth_date": "1957-12-04",   // 可选：出生时间，仅年份也可（"1957"）；省略 = 不修改
  "death_date": "2020-05-01",   // 可选：离世时间；is_living=true 时强制忽略/清空
  "is_living": false            // 可选：显式健在状态。true=健在（清空 death_date）；
                                // false=已故（death_date 可空 = 已故但卒年不详）；省略 = 按 death_date 推断
}
```

### 6.3 树级操作（写树 JSON）

| 接口 | 说明 |
|---|---|
| `POST /people/` | 新建人：生成 handle → 写树 JSON → 建详情文档（空档案） |
| `POST /families/` / `PUT /families/<handle>` | 建/改家族：更新树 JSON families + 相关 person 的 parent_family/spouse_families |
| `POST /admin/split-tree` | 子树分割：从树 JSON 复制子树 → 生成新树 JSON（含新 tree_id、始祖、姓氏）→ 原树移除节点 → tree_meta 注册新树（新条目含 `surname_pinyin`；tree_id 生成口径见 `docs/tree-id.spec.md`） |
| `POST /admin/remove-branch-link` | 校验占位节点后删除跨树软关联 |

> 原 `POST /admin/promote`（晋宗：节点链并入 zhonghua + 原树移除）**已整体移除**（2026-09-17 产品决策：路由与 `promoteTree()` 均已删除）；
> 本表不再登记该路由，替代操作【立支】/【汇宗】待规格落地后另行补入。

### 6.4 业务接口（业务集合）

| 接口 | 数据源 |
|---|---|
| `/wallet/*`（balance/recharge/transfer/tree-balance） | wallets |
| `/admin/wallet-fee` | wallets |
| `/tree/rank` | 树 JSON 现算：世代深度（沿 parent_family 上溯）+ 等级映射（rank.js 逻辑搬入） |
| `/admin/users` / `/admin/set-role` / `/admin/set-anchor` / `/admin/get-anchor` | users / anchors |
| `/join` / `/leave-request` / `/admin/leave-requests` / `/admin/approve-leave` | anchors / leave_requests |
| `/tree-meta` GET/PUT | tree_meta 文档 |

---

## 7. 写一致性（无事务环境的兜底策略）

**原则：顺序写 + 幂等 + 孤儿清理，不做分布式事务。**

- **单点写**：结构字段只写树 JSON，档案字段只写详情文档（§1 原则 2）→ 绝大多数编辑天然一致。
- **交叉操作固定顺序**：
  - 新建人：先写树 JSON（handle 由后端生成）→ 再建详情文档；详情失败不阻塞（前端显示"档案待完善"）。
  - 删除人：先删树 JSON 节点 → 再删详情文档。
- **乐观锁**：树 JSON `version` 写前比对，冲突 409。
- **孤儿清理（兜底）**：每次结构写后/定时任务，对比树 JSON people 的 handle 集合，删除 `person_details` 中已不存在的文档（`_id` 前缀 = tree_id）→ 消除"树 JSON 删了、详情残留"的孤儿。
- **反方向无需兜底**：详情文档永远不产生结构字段，不存在"详情改了树没改"。

### 7.1 单树写路径的不变量（2026-09-18 缺陷 B 修正 · **必须逐条成立**）

> 本节是上节「顺序写 + 幂等」在**单树**（`saveTree` / `updateTree`）写路径上的硬规则。旧实现只对 `updateTrees`（多树事务）做了失败侧回滚与缓存处理，单树路径**没有** —— 这是缺陷 B 的根因。

| # | 不变量 | 具体规则 |
|---|---|---|
| R1 | **失败必须失效缓存** | `lib/store.js` 的 `saveTree` 落盘失败 / `updateTree` 闭包（含闭包内的业务校验）抛错 → **必须** `treeCache.delete(tree_id)` + `eventIndexCache.delete(tree_id)`。理由：闭包是**就地改对象**（`fn(tree)`），磁盘没写、内存已改 —— 不失效就会留下「盘上不存在、缓存里有」的**幻影结构**（与 `updateTrees` 的失败处理同一口径） |
| R2 | **失败必须回滚 `version` / `updated_at`** | 版本号自增与时间戳刷新发生在**落盘之前** → 失败路径要把 `version`、`updated_at` **原地还原**到操作前的值（磁盘才是真值），否则调用方持有的树对象与被拒的写入混在一起 |
| R3 | **详情在树落盘成功之后写** | `lib/tree-write.js` 的 `updatePerson` 在闭包内**只组装** `pendingDetail`（不落盘）→ 树 JSON 落盘成功后**才** `saveDetail`。详情写失败 → **不回滚树、不冲正退费**，返回 `detailSaved:false` → 路由响应带 `detail_warning`（已提交的结构改动不得被撕成失败，否则等于送一次免费更改）；反向（树失败）→ 详情字节必须**一字不变** |
| R4 | **系统错误 → 500** | 错误出口统一 `errorStatusOf`：**业务错误沿用自身 status**（400 / 403 / 404 / 409…）；**系统级失败（`EACCES` / `ENOENT` / `EPERM` 等 errno 类 code/name）一律 500 + 通用文案**，不得把本机绝对路径吐给前端；已扣费的路径失败时同响应带 `fee_refunded:true` |
| R5 | **批次写入的原子性** | 一次操作内的多节点 + 多详情 + 家族挂接必须在**同一次** `updateTree` 回调内完成（例：`POST /admin/chain-append-batch`，见 `docs/chain-batch-append.spec.md`）；回调抛错 → 整批不写 + 回收本批已写出的详情 + 就地还原内存对象 |

**断言要求（写一致性用例必须覆盖）**

1. **幻影不得可见**：注入落盘失败（树文件 `chmod 0444`）后，**同进程** `getTree` 必须返回**磁盘真值**、`version` / `updated_at` 未被改脏；
2. **幻影不得随下一次写入落盘**：失败之后的下一次成功写入，其产物**不得包含**上一批失败产生的节点 —— `migrate-output/` 与 `config/tree-meta.json` 逐字节不变；
3. **详情侧**：详情目录只读（首写 `EACCES`）→ 整批不写 + 详情字节不变；树成功 + 详情失败 → 200 + `detail_warning` + 扣费生效；
4. 上述用例均在 `/tmp` 副本上跑，**真源零写入**（前后聚合 md5 一致）。

---

## 8. 迁移路径（Gramps → 自有存储）

```
现有 Gramps SQLite（每 tree 一个 .sqlite 文件）
        │  migrate-sqlite-to-json.py（直读 gramps.db API，不经 GEDCOM，减少转换损耗）
        ▼
  树 JSON（people + families 全量）＋ 详情文档（events/media/citations/notes/attributes 迁移）
        │
        └── 迁移脚本同时输出迁移报告（跳过项、异常项）
```

- **GEDCOM 是独立产品能力**（数据主权）：`scripts/gedcom-export.mjs <tree_id>`（树 JSON → .ged）
  与 `scripts/gedcom-import.mjs <tree_id> <input.ged>`（.ged → 树 JSON + 详情）单独实现，
  与运行时存储解耦。导出保留 gramps_id（`@I0001@`/`@F0002@`）、BIRT/DEAT/PLAC、
  关系引用（FAMS/FAMC/HUSB/WIFE/CHIL），跨树软关联与链属性用 GEDCOM 自定义扩展标签
  （`_EXTERNAL_TREE`/`_EXTERNAL_PERSON`/`_EXTERNAL_LINK_TYPE`/`_CHAIN_GEN`/`_CHAIN_FROM`/`_ATTR`）。
  已双向验证：ji 89 人 / zhonghua 101 人 导出→导入→全量对比 0 不一致（姓名/性别/生卒/关系/
  external_tree/external_chain_gen 全部保留）。
- 迁移校验：迁移后树 JSON 人物数 = SQLite 人物数；随机抽样比对姓名/生卒/父母子女关系。

---

## 9. 开放问题（待决策，不影响 schema）

1. **后端形态**：CloudBase 云函数（HTTP 访问服务，无服务器，配 CloudBase 免费额度）vs Node 服务（云服务器，性能稳）。
   - 树 JSON 整树读建议走**云存储静态/CDN**（不进云函数），云函数只做写路径与业务接口 → 读流量不烧配额。
2. **树 JSON 存放**：CloudBase 云存储（COS，配 EdgeOne 泛域名回源）vs 服务器本地文件（快、简单）。
3. **小程序 request 合法域名**：指向 API 域名（云函数 HTTP 服务域名或自定义 API 域名）。
4. **搜索增强**（v1 用树 JSON 内存过滤；后续：拼音/同音字索引文档）。

---

## 10. 里程碑建议

1. **P0**：迁移脚本（SQLite → 树 JSON + 详情文档），交付首批树数据 + 迁移报告
2. **P1**：兼容层 API 只读半边（people/families/search/rank/tree-meta）→ 前端浏览功能全通
3. **P2**：写半边（auth/wallet/join/编辑/拆分）→ 全功能验收
4. **P3**：GEDCOM 导入导出管线（数据主权闭环）
