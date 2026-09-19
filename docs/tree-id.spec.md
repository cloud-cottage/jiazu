# tree_id 生成口径：pinyin-pro 姓氏模式 · 无兜底 · `surname_pinyin` 字段 — 规格（docs/tree-id.spec.md）

> 状态：**代码已落盘（Kong）· Zang 已核验 · 3 棵树迁移已完成 · 待部署上云**（部署项见 `docs/PENDING_DEPLOY.md` §20，**含数据项**）。
> 本册管**家族树 / 祖谱的 `tree_id` 如何生成**：注音唯一真源、无兜底原则、`surname_pinyin` 字段、3 棵树迁移口径，以及**遗留注音实现与未完成口径的登记**。
> **不管**节点/家族编号 → `docs/id-system.spec.md`；**不管**地址栏路径形态与 `path_alias` → `docs/uri-aliases.spec.md`；**不管**部署动作 → `docs/PENDING_DEPLOY.md` §20。
> 关联：`docs/clan-tree.spec.md` §6（祖谱定义与 URL）、`docs/branch-clan-ops.spec.md` §5-2（立支新建树条目）、`docs/data-model.md` §5.5（tree-meta 文档）。
> 代码锚点（唯一真源）：`cloudfunctions/compat-api/lib/tree-write.js` 的 `surnamePinyin()` / `nextTreeId()` / `createTree()` / `splitTree()`；`cloudfunctions/compat-api/lib/clan.js` 的 `genClanTreeId()`（建祖谱）。
> 前端 `frontend/src/business/tree-id.ts` **只解析与格式校验，不注音**（H5 包体不引拼音词典，避免拼音表再次漂移）。

---

## 0. 本册边界

| 项 | 口径 |
|---|---|
| **本册管** | `tree_id` 格式与生成算法、汉字注音的唯一真源与选项、无兜底（抱错拒绝）原则与错误码、tree-meta `surname_pinyin` 字段的写入点、3 棵树改名迁移口径、遗留注音副本与未完成口径登记 |
| **本册不管** | 节点/家族编号（`handle` / `gramps_id`）→ `docs/id-system.spec.md`；地址栏路径与 `path_alias` → `docs/uri-aliases.spec.md`；建树计费 → `docs/economy-fee.spec.md`；部署动作 → `docs/PENDING_DEPLOY.md` §20 |
| **数值/字面纪律** | 正则、选项名、错误文案、tree_id 字面值**逐字取自实现与实测**；不得自行改口径、不得编数字 |

---

## 1. 格式（写死）

`<姓氏拼音>_<汉字 Unicode 十进制码点>_<两位支派序号>`

| 树类 | 生成函数 | 形态 | 示例 |
|---|---|---|---|
| 普通家族树（`kind='family'`） | `nextTreeId(meta, 姓)`（`lib/tree-write.js`） | `<拼音>_<码点>_<NN>`，NN 从 `01` 起取该前缀**最小未用**（`01..99`） | `ji_23395_01` |
| 祖谱（`kind='clan'`） | `genClanTreeId(meta, 姓)`（`lib/clan.js`） | **基形** `<拼音>_<码点>`；**冲突时**才追加 `_NN` | `ji_23395` |
| 中华世本 | — | 固定字面 `zhonghua`（**不走**生成规则） | `zhonghua` |

- 前端格式正则：`^[a-z]+_\d+_\d{2}$`（`frontend/src/business/tree-id.ts` 的 `isValidTreeId`）。
- **序号用尽**（同一前缀 `01..99` 全占）→ **400 拒绝**：不回绕、不改写前缀、不新造编号。
- 两处冲突判定都以**tree-meta 现有条目**为准（`meta.trees[*].tree_id`），不读树 JSON 文件名。
- 码点取 `char.codePointAt(0)`（十进制，与 tree_id 字面一致，如 `季` → `23395`）。

---

## 2. 注音唯一真源：pinyin-pro 姓氏模式

`surnamePinyin(surnameChar)`（`cloudfunctions/compat-api/lib/tree-write.js`）——**全站唯一**的「汉字 → tree_id 拼音前缀」实现：

```js
pinyin(char, { mode: 'surname', toneType: 'none', type: 'array', v: true })
```

| 选项 | 作用 | 为什么必须 |
|---|---|---|
| `mode: 'surname'` | **姓氏读音优先**（百家姓） | `曾` → `zeng`（非 `ceng`）、`单` → `shan`（非 `dan`） |
| `toneType: 'none'` | 去声调 | 前缀只允许 `[a-z]` |
| `type: 'array'` | 取首音节 | 单字读音以数组返回 |
| `v: true` | `ü` 写作 `v` | `吕` → `lv`（否则 `lü` 违反 `^[a-z]+_…`） |

**手工拼音表已整体废弃**：历史上三份手工表长期漂移（后端那份独缺「纪」），且旧实现 `PINYIN_MAP[char] || 'shi'` 会把未收录姓氏**静默命名**成 `shi_*` —— 这是三棵树被污染成 `shi_32426_01` / `shi_23481_01` / `shi_24658_01` 的事故根因（§5）。

前端**不注音**：`frontend/src/business/tree-id.ts` 已删除本地那份重复拼音表与无消费者的 `charToPrefix` / `makeTreeId`，只留 `parseTreeId` / `isValidTreeId`（消费情况见 §7-④）。

---

## 3. 无兜底原则（一律抱错拒绝）

**任何情况下不得生成伪前缀**，也不得回落默认值 / 默认姓氏 / 拼音表兜底：

| 输入 | 行为 | HTTP | 文案（实现为准） |
|---|---|---|---|
| 空串 / 全空白 | 拒绝 | **400** | `缺少姓氏，无法生成家族树编号前缀` |
| 非单个汉字（多字 / 拉丁 / 数字 / 内嵌空白） | 拒绝 | **400** | `姓氏「X」不是单个汉字，无法注音` |
| 单个汉字但取不到合法拼音（生僻字 / `pinyin()` 抛错 / 结果为空或含非 `[a-z]`） | 拒绝 | **400** | `姓氏「X」无法注音，请检查输入` |
| 同前缀序号 `01..99` 用尽 | 拒绝 | **400** | `姓氏「X」下支派序号已用尽（≥99）`（祖谱：`姓氏「X」的祖谱编号已用尽（≥99）`） |

- 拒绝发生在**建树写库之前**：不建树、不写 tree-meta、**不扣费**（扣费挂在 `onBeforeWrite`，校验全过才执行）。
- **错误自带 `status: 400`**（复用 `tree-write.js` 的 `fail()`）：lib 层单一错误约定 = 输入/校验类错误自带 4xx。否则路由 `catch` 会因「无有限 status」把它判成系统错误 → HTTP 400 + body `{"error":"服务内部错误","status":500}`（状态码与文案互相矛盾，用户看不到真实原因）。
- 实测锚点（副本实例真 HTTP）：`{surname_char:"乥"}` → **400** `姓氏「乥」无法注音，请检查输入`（**不再是**「服务内部错误」）；`{surname_char:"中国"}` → 400 `请填写单个汉字姓氏`；`{surname_char:"雷",founder_name:""}` → 400 `请填写始祖姓名`。

---

## 4. tree-meta 字段：`surname_pinyin`

tree-meta 条目新增 **`surname_pinyin`**（紧跟 `surname_char`）：记录**实际采用**的拼音前缀，即 `surnamePinyin(surname_char)` 的返回值。

- **用途**：兼作将来**多音字人工纠正 / 审计入口**（见 §7-①）——据此可判断某棵树的 id 前缀与当前读音口径是否一致，无需回头解析 `tree_id` 里的码点。
- **写入点（当前实现）**：

| 场景 | 代码位置 | 是否写 `surname_pinyin` |
|---|---|---|
| 新建家族树 `POST /admin/create-tree` | `lib/tree-write.js` `createTree()` | **是** |
| 拆分家族树 `POST /admin/split-tree` | `lib/tree-write.js` `splitTree()` | **是** |
| 新建祖谱（建谱审批通过） | `lib/clan.js`（`genClanTreeId()` 的调用方） | **是** |
| 立支 `POST /admin/establish-branch` 新树条目 | `lib/branch-clan-ops.js`（立支新树条目写入点，`surname_pinyin: surnamePinyin(surnameChar)`；file:line 见 §8 证据指针 5） | **是** |
| 遗留链路拆分（auth-server → Gramps-Web） | `auth-server/split-tree.js` | ⚠️ **否**（且不是真源，见 §6-②） |

- 字段只增不改：**不参与** tree_id 生成（生成只用 `surnamePinyin()` 的返回值），仅作记录与审计。

---

## 5. 3 棵树原地迁移（**不留旧 URL 别名**）

旧实现的静默兜底已污染 3 棵树；已**原地改名**（tree-meta 键 + `tree_id` + `path_alias`、树 JSON 文件名与内部 `tree_id`、详情文档文件名前缀与内部 `tree_id`、业务集合 `ref.tree_id`），**旧 tree_id 不再可达**：

| 旧 tree_id | 新 tree_id | 姓氏 |
|---|---|---|
| `shi_32426_01` | `ji_32426_01` | 纪 |
| `shi_23481_01` | `rong_23481_01` | 容 |
| `shi_24658_01` | `heng_24658_01` | 恒 |

- **不留别名**：改名前发出的链接一律 **404**（属预期，不是缺陷）；tree-meta 里**不写**旧 `path_alias`。
- 迁移脚本：`scripts/migrate-tree-id-pinyin.mjs`（一次性手术；默认 **dry-run**，`--apply` 落盘前自动备份，`--root=<数据根>` 可在副本上验证；**幂等** —— 重复执行报「已迁移，0 变更」并 exit 0）。
- 与 `docs/uri-aliases.spec.md` §3 的 `/zhonghua → /z/`（**客户端重定向 + 保留兼容形态**）是**两类不同的弃用处理**，不可互相套用：本批 3 棵树**不做重定向**。
- 上云载荷清单与执行步骤见 `docs/PENDING_DEPLOY.md` §20-2（本册只写口径，不重述部署动作）。

---

## 6. 遗留注音实现登记（**均为陈旧副本，不参与运行时真源**）

> 口径：**注音唯一真源只有一处**（§2 的 `lib/tree-write.js` `surnamePinyin()`）。下表三处是历史遗留 / 陈旧副本，**登记待处置，本册不改代码**。

| # | 位置 | 现状 | 与真源的关系 | 建议处置 |
|---|---|---|---|---|
| ① | `shell-scripts/gen-tree-id.mjs` | 独立 CLI（`node shell-scripts/gen-tree-id.mjs 季 01`），内含 **101 键手工拼音表**；未收录姓 → 报错 `未找到 "X" 的拼音映射，请在 PINYIN_MAP 中添加` + exit 1（**无**静默兜底）；全仓**无调用方**（无脚本 / 构建 / 测试引用） | **手工表副本**：读音口径可能与 `surnamePinyin()` 不一致（未收录姓不能自动注音，需人工加表）；`lib/tree-write.js` `nextTreeId()` 的注释仍写「与 shell-scripts/gen-tree-id.mjs 同规则」 | 删除，或改为 `import` `surnamePinyin()` 复用（保留 CLI 形态）；**短期**至少加文件头注释「非真源、不得用于生产」，并把 `nextTreeId()` 注释里的「同规则」改为指向本册 |
| ② | `auth-server/split-tree.js` | **遗留 Gramps 链路**（auth-server 5197 → Gramps-Web 5198，仅 `npm run dev:h5:legacy` 排查用）的拆分模块；内含**自己那份手工拼音表（105 条 / 104 个不同汉字，重复键「任」）**；`pinyinOf()` 未命中返回 `null` → 抛出拒绝（行为上无静默兜底）；其 tree-meta 新条目**只写 `surname_char`、不写 `surname_pinyin`** | **遗留链路的第二份注音实现**（Gramps-Web 已退出运行时链路）。文件注释写「与前端 tree-id.ts 保持一致」，而**前端那份拼音表已删除** → 该注释已失效 | 随 Gramps 链路退役一并删除；若短期仍需保留，至少标注「非真源」，并**去掉**已失效的「与前端 tree-id.ts 保持一致」表述 |
| ③ | `frontend/src/static/tree-meta.json` | **陈旧快照**：仅 **6 棵树**（`zhonghua` / `ji_23395_01` / `gu_39038_01` / `liu_21016_01` / `shen_27784_01` / `qin_31206_01`），真源 `config/tree-meta.json` 现为 **15 棵**；`zhonghua.path_alias` 仍是旧值 `/zhonghua`（真源已改 `/z/`）；**不含** `kind` / `surname_pinyin` 等新字段；`api.ts` 的 `fetchTreeMeta()`（读该静态文件）**当前无任何消费者**（全仓调用的是 `fetchTreeMetaRemote()` → `GET /tree-meta`） | **陈旧副本且已被旁路**：不是任何读路径的真源；一旦被重新接入，前端会少 9 棵树、世本回到旧路径 | 删除该文件与 `fetchTreeMeta()`；若确需离线兜底，改为**构建时**从 `config/tree-meta.json` 生成（单一真源），**不得**手工维护第二份 |

---

## 7. 未完成口径与已收口项（登记）

> 未完成项在下表（编号沿用原序，**留空的原 ③ 已收口**、移入 §7-1，编号不重排以免他册交叉引用漂移）。

| # | 项 | 现状 | 缺口 | 建议 |
|---|---|---|---|---|
| ① | **多音字「候选人工确认」UI** | **未做**。当前只有 pinyin-pro `mode:'surname'` 的**自动判定**（单一结果），无候选列表、无人工改写入口 | 姓氏模式覆盖不了的疑难读音（异读姓、生僻姓、非姓氏用法）只能吃自动结果，**无审计/纠正通道** | 建树表单在 `surnamePinyin()` 后展示候选（如 `pinyin(char, { multiple: true })`）供人工确认；确认结果写入 tree-meta `surname_pinyin`（该字段即为此入口预留，见 §4） |
| ② | **历史 12 棵树的 `surname_pinyin` 未回填** | **未回填**。`config/tree-meta.json` **15 条中仅 3 条**有值（`ji_32426_01` / `rong_23481_01` / `heng_24658_01`，即 §5 迁移的 3 棵） | 其余 **12 条**（含 `zhonghua`、4 棵祖谱、其余普通树）缺该字段 → 审计 / 多音字纠正入口对它们失效 | 一次性回填：逐条取 `surname_char`（缺失者可由 `tree_id` 的码点反解，§1）跑 `surnamePinyin()` 写回；**只补字段、不改 tree_id**（id 前缀与读音不一致的历史树另案处理，不属本册） |
| ④ | **前端 `isValidTreeId` / `parseTreeId` 无消费者**（本轮核查新发现） | `frontend/src/business/tree-id.ts` 导出的这两个函数**全仓无调用方**；且 `parseTreeId` 对无序号基形的祖谱 id（如 `ji_23395`）会返回 `null`（它要求 `parts.length >= 3`） | 「前端只做解析与格式校验」这句口径**实际未被任何路径执行** → 格式约束目前只在后端与 tree-meta 现状上成立 | 属**信息缺口**：要么接入（如建树 / 建谱表单前置校验，并处理祖谱基形），要么删除死代码；接入前**不得**声称前端已校验 tree_id 格式 |

### 7-1 已收口项（保留原编号）

| # | 项 | 结论 | 证据 |
|---|---|---|---|
| ③ | **立支新建树未写 `surname_pinyin`** | **已修复**（实现侧，非本册改）。立支新树条目现写 `surname_pinyin: surnamePinyin(surnameChar)`，与其余新建路径（§4）同口径 | 实现 = `cloudfunctions/compat-api/lib/branch-clan-ops.js:709-710`（注释逐字引 `docs/branch-clan-ops.spec.md` §5-2 / 本册 §4）；回归断言 = `lib/branch-clan-ops.test.js:896-898`（值必等于 `surnamePinyin(surname_char)` 且等于 `tree_id` 拼音前缀、不得是 `shi` 一类兜底值）；全量 `npm test` 398/398；重打包产物体积 / md5 见 `docs/PENDING_DEPLOY.md` §20-1 |

---

## 8. 验收与证据指针

| # | 验收点 | 证据指针 |
|---|---|---|
| 1 | `{surname_char:"乥"}` 建树 → **HTTP 400** + `姓氏「乥」无法注音，请检查输入`（不再 500「服务内部错误」），且**未建树、未扣籽** | `docs/PENDING_DEPLOY.md` §20-1（副本实例真 HTTP 实测） |
| 2 | 3 棵树改名完成：`shi_32426` / `shi_23481` / `shi_24658` 在 `migrate-output/**` 与 `config/tree-meta.json` 的**内容与文件名命中均为 0** | `docs/PENDING_DEPLOY.md` §20-2 |
| 3 | 云函数重打包判据：`grep -c '\|\| "shi"' cloudfunctions/deploy/compat-api/index.js` → **0**（旧静默兜底不得再出现） | `docs/PENDING_DEPLOY.md` §20-1 ③ |
| 4 | 全量 `npm test` **398/398 全绿**（含 2 条 `status === 400` 断言） | `docs/PENDING_DEPLOY.md` §20 引 |
| 5 | 立支新树条目写入 `surname_pinyin`：值 = `surnamePinyin(surname_char)` 且 = `tree_id` 的拼音前缀（**四条新建路径一律写**：建树 / 拆分 / 祖谱 / 立支） | 实现 `cloudfunctions/compat-api/lib/branch-clan-ops.js:709-710`；断言 `lib/branch-clan-ops.test.js:896-898` |

---

## 9. 交叉引用

| 文件 | 关系 |
|---|---|
| `docs/clan-tree.spec.md` | 祖谱定义、`kind` 语义、URL 与 tree_id（§6 指向本册） |
| `docs/uri-aliases.spec.md` | 地址栏路径形态、`path_alias` 数据口径、3 棵树改名的不留别名口径（§4） |
| `docs/id-system.spec.md` | 节点 / 家族编号（`handle` / `gramps_id`），与本册的 tree_id **正交** |
| `docs/branch-clan-ops.spec.md` | 立支 / 汇宗的 tree-meta 字段改动表（§5-2，含立支新树条目写 `surname_pinyin` 的口径与实现位置） |
| `docs/data-model.md` | 存储三层切分、tree-meta 文档 schema（§5.5） |
| `docs/PENDING_DEPLOY.md` | 部署项 = §20（云函数重打包 + 数据项 3 棵树改名） |
