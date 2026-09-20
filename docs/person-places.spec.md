# 人物地点属性规格：出生地 / 居住地 / 家族树发源地（人工指定） — 规格（docs/person-places.spec.md）

> **本册性质 = 「人物地点属性（出生地 / 居住地）」与「家族树发源地」的口径唯一真源。**
> 本册**只登记口径**：不改任何代码、不写真源数据、不重试 `AGENTS.md`（未获授权，口径沿用 `docs/geo-origin.spec.md` §13-9）。
> **成文时点 = 2026-09-20（Jing · 制度员）**；口径来源 = **Kevin 五问五答（2026-09-20 拍板）** + **Zang 契约 v2（已冻结，逐条照登，不得改动）** + **Zang 口径变更（2026-09-20 即时生效：C8 作废 → C8′ + C11）**。
> **与既有册的分工**：行政区划**码表 / 展示串拼接 / 反查函数**的口径真源仍是 **`docs/geo-origin.spec.md`**（`origin_code` 体系、`resolveOrigin` 展示串）；本册**只定义人物地点属性怎么存、怎么写、怎么读、怎么计费、发源地怎么人工指定**。两册互不复制表格（避免一套口径两处维护）。

> ⚠️ **顶部最新状态指针（2026-09-20 11:21 CST · 只读实测）**
> 1. **契约 C8（写时自动同步镜像）已于 2026-09-20 作废**，取代者 = **C8′**（用户人工指定，见 §6）。**本册所有历史 C8 行一律原文保留并标注「已作废」**（`AGENTS.md` §0 第 4 条）。
> 2. **Kong 正在并发落地 C1–C7 / C10**（`lib/person-places.js` 等已落盘；另按**原 C8** 落了一版镜像回写，**该部分按 C8′ 已作废**）⇒ 全部落地读数见 **§12 追补**（**§0–§11 为成文时点口径，§12 为落地实测**；两处冲突时以 **§12 + 本册口径** 为准）。

---

## 0. 口径来源与成文时点

### 0-1 Kevin 五问五答（**2026-09-20 拍板 · 逐字照登 · 不得改**）

**新需求（Kevin 原话，逐字）**：

1. 为节点添加新属性**【出生地】**：两部分 —— ① 按**结构化行政区划三级选定**（复用已完成的 `origin_code` 体系）；② 在选定行政区划基础上的**细节补充**，**文案叫「备注」**；**两部分都要储存**。
2. **家族树的【来源地】不再存于树自身，改为从【始祖节点】的【出生地】读取**（可定期同步一个镜像属性）。
3. 为节点新增**【居住地】**：设置逻辑与【出生地】相同；**可多条，最多 9 条**。

**五问答案（逐字照登）**：

| # | 问题 | Kevin 的答案（逐字） |
|---|---|---|
| 1 | **始祖认定** | 有 `founder_handle` 的用它（四棵：`gu_39038_01` / `ji_23395_01` 及其对应祖谱 `gu_39038` / `ji_23395`）；其余由 Kevin 逐树点选（**当时尚未回报，不得自行认定**）→ ⚠️（**状态更新**：**Kevin 已逐树点选完毕**，清单见 §7-2，取代者 = **§7-2**；本条历史字面保留） |
| 2 | **存储位置**（Kevin 选定高风险项） | **把树 JSON 的 `birth_place` 直接改成结构化** |
| 3 | **计费** | 算「节点内容修改」，**沿用 1 篇/次**（与称号一致，**不动计费口径**） |
| 4 | **家族树来源地镜像** | **写时同步**（始祖出生地一改立即回写树上镜像）+ 附一个**可重跑同步脚本** → 🚫 **本条已作废（2026-09-20，取代者 = Zang 口径变更 C8′）**：**不存在任何自动同步逻辑**，改为**用户人工指定**（`POST /admin/set-tree-origin`，§6） |
| 5 | **居住地适用范围** | **所有人物节点（含始祖）**都能填 |

> **高风险项登记**：第 2 条（直接改树 JSON `birth_place` 字段形状）是 **Kevin 明示选定的高风险项** —— 该字段**在线存量非空值共 17 处**（§0-4 第 5 行实测，成文时点），形状由字符串改对象**对读侧是破坏性变更**，故 **C3 读侧容错为强制项**（不是可选优化）。

### 0-2 Zang 契约（**v2 已冻结 · 逐条照登 · 不得改动 · 本册只登记不评价**）+ **2026-09-20 口径变更（C8 作废 → C8′ + C11）**

| # | 契约条文（逐字） |
|---|---|
| **C1** | 树 JSON `people.<handle>.birth_place`：**字符串 → 对象** `{ "origin_code": "<6 位码或空串>", "note": "<备注文本>" }`。 |
| **C2** | 树 JSON 新增 `people.<handle>.residence_places`：`[{ "origin_code": "", "note": "" }]`，**上限 9 条**，**顺序即展示顺序**，无则 `[]`。 |
| **C3** | **读侧容错（必须）**：历史 `birth_place` 为字符串时归一为 `{origin_code:'', note:<原串>}`；**非法类型 → 空对象**，**不崩不丢**。 |
| **C4** | 新建节点三处初始值改**对象 + 空数组**：`lib/tree-write.js` 的 `createTree`、`lib/child-write.js`、`chain-append-batch` / `/admin/chain-append`。 |
| **C5** | **计费 / 无改动判定**：`lib/economy-fee.js` 的 `PERSON_VALUE_FIELDS` 与 `hasPersonChanges` 必须纳入 `birth_place`（对象）与 `residence_places`；值级比对**按规范化逐字段**（数组**逐项 + 长度**）。 |
| **C6** | **始祖可编辑性**：`assertFounderEditable` **仅对 `birth_place` / `residence_places` 两项放行**；同请求里改了姓名 / 生卒等锁字段仍 **403**。 |
| **C7** | **读响应**：`profile.birth = { date, place, place_code, place_note }`（`place` = 码反查展示串，**空码则空串**）；新增顶层 `residence_places: [{ place, place_code, place_note }]`。**节点级可见性裁剪口径不变**。 |
| **~~C8~~** | ~~**镜像回写（写时同步）**：被编辑者 == 本树 `founder_handle` 且 `birth_place` 有改动时，**同一请求内**回写 tree-meta 该树：`origin_code = birth_place.origin_code`；`origin = code ? resolveOrigin(code).display : (note \|\| '')`。~~ → 🚫 **整条已作废（2026-09-20 即时生效，取代者 = C8′；本节以下「C8′」即取代文本）**。原文**保留不删**（历史行纪律）。 |
| **C8′** | **家族树「发源地」由用户人工指定 —— 不做自动同步**（取代 C8）：① **不存在任何「改始祖出生地就自动回写 tree-meta」的逻辑**；② 指定入口 = **`POST /admin/set-tree-origin`**，入参 `{ tree_id, person_handle }`，权限 = 与 `PUT /tree-meta` **同档（chief_editor）**，返回 `{ ok, origin_code, origin, source: { handle, gramps_id, name } }`；③ 可选范围 = **始祖节点 + 其下 1–2 代，共三代人**（第 1 代 = 始祖本人；第 2 代 = 以始祖为父/母的 families 的 `child_handles`；第 3 代 = 再下一层），**被指定节点的 `birth_place.origin_code` 必须非空**；④ **「始祖」认定** = `tree-meta.founder_handle` 优先，缺失时取**唯一「非镜像」根节点**（`String(external_mirror) !== 'true'` 且 `parent_family` 为空），**0 个或多个 → 400**；⑤ 候选读接口 = **`GET /tree/origin-candidates`** → `{ tree_id, founder: {...}\|null, current: {origin_code, origin}, candidates: [{handle, gramps_id, name, generation:1\|2\|3, birth_place:{place,place_code,place_note}, is_current}] }`，**始祖识别失败时返回 `founder:null, candidates:[]`（不报 400）**；⑥ 因此「家族树的 `origin` / `origin_code`」= **人工指定的结果（真源在始祖附近节点的出生地）**，**不是自动镜像**；`PUT /tree-meta` 的直写分支**保留为兼容入口**，**不再是正规入口**。 |
| **C9** | **迁移**：把 tree-meta 现有 `origin_code` / `origin` 写到**指定始祖节点**的 `birth_place`（有码 → `{code, note:''}`；无码且 origin 非空 → `{code:'', note:原文本}`）；**备份 + md5 + 可重跑幂等**。**始祖清单待 Kevin，未经他点选不得写入**。 → ⚠️（**状态更新**：**Kevin 已逐树点选完毕**，清单见 **§7-2**；**仍待 Zang 下令 `--apply`**。历史字面保留） |
| **C10** | `residence_places` **第 10 条必须在后端 400 拒绝**（**不能只靠前端**）。 |
| **C11** | **（新增 · 2026-09-20）**：建树（`POST /admin/create-tree`）时填写的发源地 → **同时写 tree-meta 与始祖节点的 `birth_place.origin_code`（`note:''`）**，使「**树上发源地 = 某节点出生地**」**恒成立**。 |

### 0-3 本册数值 / 字面纪律（承 `AGENTS.md` §0 第 3 条、`docs/geo-origin.spec.md` §0-3）

- 本册所有**行号 / 值 / 判据 / 计数**均为**只读实测**，**逐条可复现**；**未给的值一律留「待填」**，不编数字。
- 契约条文（§0-2）与 Kevin 原话（§0-1）**逐字照登**，本册**不评价、不改写**；**口径变更以「新增条目 + 原条作废标注」表达，不删历史行**。
- **两段实测时序**：**§0–§11 = 成文时点口径**（2026-09-20 上午，含当时的实测读数）；**§12 = Kong 并发落地实测**（2026-09-20 11:21 CST）；**§13 = `AGENTS.md` 拟稿**。

### 0-4 成文时点本仓实测底账（**逐条已复现 · 本册未做任何写入**）

| # | 项 | 成文时点实测值 | 落地后实测（§12） |
|---|---|---|---|
| 1 | 读响应构造点（原） | `cloudfunctions/compat-api/index.js:189` `if (person.birth_date) raw.profile.birth = { date, place }` | **已改** → `index.js:201-210`（`place_code` / `place_note`；门控含 `hasPlaceContent`）→ **§12-2** |
| 2 | 写路由 | `PUT /people/<handle>`（原 `:2478` 起）：`requireWriteUser` → `assertFounderEditable` → `hasPersonChanges` → `isPersonUnchanged` → 扣费 → `tw.updatePerson` → 写详情 | 结构不变，**行号后移**（§12-2） |
| 3 | 计费字段面 | `lib/economy-fee.js`：`hasPersonChanges` / `PERSON_VALUE_FIELDS`(`:147`) / 值级比对(`:279`) / `isPersonUnchanged`(`:325`) | **已改** → `:144` / `:145` / `:157` / `:291` / `:293-294` → **§12-1** |
| 4 | 现有单测 | `lib/economy-fee.test.js:313-322`（`hasPersonChanges` 断言，含「称号三字段」） | 未变（**本批未新增测试文件** ⇒ §12-4 假绿风险） |
| 5 | **在线 `birth_place` 非空值（成文时点）** | **17 处**（`ji_23395_01` 12 / `liu_21016_01` 2 / `shen_27784_01` 2 / `gu_39038_01` 1；其余 13 树 0）—— **C1 改形状的实际存量面** | 未变（§12-4 复测） |
| 6 | **`residence_places` 出现次数（成文时点）** | 源码 `index.js` = **0** / `lib/**` = **0** / 部署产物 = **0** | **已改**：`index.js` = **2** / `lib/**` = **17**（5 文件）/ 产物 = **0**（未重打包）→ **§12-1 / §12-3** |
| 7 | **`birth_place` 初始值落点（成文时点）** | **11 处**（全表 §4-2）—— **C4 只点名其中 3 处** | **已改 6 / 11 处**（`tree-write` 4 + `child-write` 2）；**仍为字符串 5 处** → **§12-4** |
| 8 | 部署产物 | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B / mtime 2026-09-19 12:50 / `grep -c 'origin_code'` = 0** | 未变（**未重打包**）→ §12-3 |
| 9 | 测试清单 | 根 `package.json` `scripts.test` 现枚举 **26** 个测试文件（均 `lib/` 内） | 未变（**无本批测试**）→ §12-4 |
| 10 | **tree-meta 真源底账（成文时点）** | md5 **`5817e4bb7f9fd461c11803e0df78a48a`** / **9,572 B** / mtime **2026-09-20 10:59:23** | 见 §12-3 复测 | → ✅（**2026-09-20 追补复核：真值未变** —— md5 仍 `5817e4bb7f9fd461c11803e0df78a48a` / 9,572 B / mtime 2026-09-20 10:59:23；见 **§14-1**） ⇒ ⚠️ **（2026-09-20 §15 追补：该读数已过期 —— 现 md5 `c9112e40760839bc8d2132d6300b838b` / 9,572 B / mtime 2026-09-20 11:31:21；取代者 §15-5）**
| 11 | **tree-meta 台账（成文时点）** | **`origin_code` 非空 = 8 / 17**：新增 `li_26446_01` = **`230305`** / `origin` = **`黑龙江省鸡西市梨树区`**（**真源外部人工写入，非本册所为**） | 见 §12-3 | → ✅（**2026-09-20 追补复核：台账同上（8 / 17）**；`li_26446_01` = `230305` 的**写入主体已认领 = Kevin 亲手写入** ⇒ §11 第 1 条闭合；取代者 **§14-1**）
| 12 | 备份惯例目录 | `~/jiazu-backups/`（含 `2026-09-20-migrate-tree-origin` 等 10 个批次目录） | 未变 |
| 13 | 树 JSON 真源位置 | `migrate-output/trees/<tree_id>.json`（**17 棵**；`migrate-output/**` 被 `.gitignore` 忽略，**不进版本管理**） | 未变 |
| 14 | **`founder_handle` 台账（成文时点）** | 非空 **4** / 存在但空串 **2**（`qin_31206` / `liu_21016`）/ 缺失 **11** | 未变（§12-3 复测） |

**第 5 行复现脚本**（只读）：

```bash
python3 -c "
import json,glob,os
tot=0
for p in sorted(glob.glob('migrate-output/trees/*.json')):
    d=json.load(open(p))
    n=[h for h,v in d.get('people',{}).items() if isinstance(v,dict) and v.get('birth_place')]
    tot+=len(n); print(os.path.basename(p),'people=',len(d.get('people',{})),'nonempty=',len(n))
print('TOTAL =',tot)"
```

**第 11 行逐字 diff（`HEAD:config/tree-meta.json` → 成文时点工作区）**：

```
li_26446_01 origin_code  <ABSENT>  ->  '230305'
li_26446_01 origin       ''        ->  '黑龙江省鸡西市梨树区'
```

⇒ **`docs/geo-origin.spec.md` §13-12-2「`origin_code` 非空 = 7 / 17」一表已不反映现行真源**；本册**只如实登记新读数**，**代规范围变更（谁在何时为何写入）不属于本册职责**（登记为 §11 第 1 条）。 → ✅（**2026-09-20 追补**：`li_26446_01` 的写入主体**已认领 = Kevin 亲手写入**（§11 第 1 条闭合）；`docs/geo-origin.spec.md` **§13-13-3 已将汇总行更新为 8 / 17**，两册现一致；见 **§14-1**）

**⚠️ 与 C9「跳过档」的冲突（必须由人类裁定）**：Kevin 的迁移清单把 **`li_26446_01` 计入「来源地为空、跳过」的 4 棵之一**（§7-2），但**成文时点实测该树 `origin_code` = `230305`、`origin` = `黑龙江省鸡西市梨树区`（非空）**。二者**不可同时成立** ⇒ 登记为 **§11 第 2 条**（**本册不自行裁定，`--apply` 前必须先澄清**）。 → 🚫（**2026-09-20 追补：已由 Zang 裁定** —— 取理解 **(a)**：`li_26446_01` **应当迁移**（有码 `230305` → 搬码到其始祖**李宝华**的 `birth_place.origin_code`）；Kevin 的「4 棵来源地为空」按 **10:59:23 之前的真源快照**理解。**取代者 §14-2**）

**成文时点工作区状态（只读登记，非本册所致）**：`git status --short` = ` M AGENTS.md` + ` M config/tree-meta.json`（**本册开工前即已 dirty**）；**本册未触碰二者**（`AGENTS.md` 前后 md5 均为 `e4c089818fbf7a3a7218e567e7b409ee`）。

---

## 1. 【出生地】（`people.<handle>.birth_place`）

### 1-1 两段语义（**Kevin 第 1 条原话拆解**）

| 段 | 名称（**文案口径**） | 数据类型 | 语义 |
|---|---|---|---|
| ① | **行政区划** | 结构化 `origin_code`（6 位码，**复用既有体系**） | 按**三级行政区划**（省 / 市 / 县）级联选定；**可任一级止步**（码表与止步口径见 `docs/geo-origin.spec.md` §1-1 / §1-3 / §13-2 直筒子市） |
| ② | **备注** | 自由文本 `note` | 在选定行政区划**基础上的细节补充**（如「村口老宅」「东厢房」）—— **文案一律叫「备注」**（**Kevin 原话：「文案叫『备注』」**） |

- **两段都要储存**（Kevin 原话「两部分都要储存」）⇒ **不存在「只存展示串」的实现路径**：`origin_code` 与 `note` **各自独立落库**，二者**不互相推导**。
- ⚠️ **不变量（本册登记的推论，非契约新增）**：`note` **不是** `origin_code` 的补全文本，二者**不拼接**（`profile.birth.place` 的展示串**只由码反查生成**，见 §3-3 / C7）；**无码时 `place` = 空串**，`note` 仍原样下发到 `place_note`。
- **无码但有备注的节点**（`origin_code === ''`、`note !== ''`）在**读响应上仍然是合法的**（`place=''` + `place_note=<文本>`）；但**在 C8′ 的「可指定为发源地」判定上不合格**（C8′ ③ 要求 `origin_code` **必须非空**）。

### 1-2 存储形状（C1 · 逐字）

```jsonc
// trees/<tree_id>.json → people.<handle>.birth_place
{ "origin_code": "<6 位码或空串>", "note": "<备注文本>" }
```

- **字段名固定**：`origin_code` / `note`。
- **空值形态**：`origin_code` 空 = **空串 `''`**（**沿用 `docs/geo-origin.spec.md` §7-3 修正口径：`(x ?? '') === ''`，字段缺失与空串同判**）；`note` 空 = 空串 `''`。
- **上限**：**无**（Kevin 第 1 条未设上限；`note` 长度上限**未裁定**，见 §11 第 5 条）。
- **写入侧必须写对象**（不得再写字符串）：字符串形态仅作为**历史数据的读侧输入**存在（C3）。

### 1-3 与「在树上新增字段」的分野（**登记级提醒**）

- `birth_place` **不是新字段**：它是**既有字段改形状**（Kevin 明示的高风险项）⇒ **存量 17 处非空字符串必须在读侧被容错覆盖**（C3），且**部署前不得假设云端已是对象**（新旧实例并存的窗口期内，读侧必须能吃两种形态）。
- 详情文档 `person_details`（`events` / `media` / `citations` / `notes` / `attributes`）**不参与**本属性：`birth_place` **只住树 JSON**（`docs/data-model.md` §3 / §4）。

---

## 2. 【居住地】（`people.<handle>.residence_places`）

### 2-1 存储形状与上限（C2 / C10 · 逐字）

```jsonc
// trees/<tree_id>.json → people.<handle>.residence_places
[ { "origin_code": "", "note": "" } ]     // 上限 9 条；无则 []
```

| 项 | 口径 |
|---|---|
| **字段名** | `residence_places`（顶层于 person 对象，**复数**） |
| **元素形状** | **与 `birth_place` 同构**：`{ origin_code, note }`（Kevin 第 3 条：「设置逻辑与【出生地】相同」） |
| **条数上限** | **9 条**（Kevin 第 3 条「最多 9 条」） |
| **无数据的形态** | **`[]`**（空数组；**不是 `null`、不是字段缺失**——C2 明确「无则 `[]`」） |
| **顺序** | **数组顺序即展示顺序**（C2）；**写入侧不得重排**（含「按码排序」这类自作主张的整理） |
| **适用范围** | **所有人物节点，含始祖**（Kevin 第 5 条）—— 与 §5 的始祖放行口径一致 |
| **第 10 条** | **后端 400 拒绝**（C10）——**不得只靠前端禁用按钮**（§4-5；落地文案实测见 §12-1） |

### 2-2 顺序与去重（**登记项**）

- **顺序 = 展示顺序**（C2）：实现侧**只做追加 / 按下标替换 / 按下标删除**，**不得**对数组做排序或按码去重（否则历史顺序丢失、前端展示与用户预期不一致）。
- **重复条目是否允许**：**契约未裁定**（C2 / C10 均未提去重）⇒ **本册不代出裁定**；登记为未决（§11 第 3 条）。默认**按契约字面：不去重**。

### 2-3 非空判定（**写侧 / 计费侧共用一档**）

- **条目的「非空」**：`origin_code` 或 `note` **任一非空**即视为**有效条目**（与 §1-2 空值形态同口径：`(x ?? '') === ''` 为空）。
- **整表的「空」**：`[]`（长度 0）或**全部条目皆空**两种形态都可能出现；**是否等价**由 C5 的规范化口径决定（见 §4-4）——**契约字面为「数组逐项 + 长度」**，本册**不额外定义「全空表等价于 `[]`」**（**该等价关系契约未给**，登记为未决 §11 第 4 条）。

---

## 3. 与既有 `birth_place` / `profile.birth.place` 的关系

### 3-1 结构化取代字符串（C1）

| 层面 | 变更前 | 变更后（C1 / C7） |
|---|---|---|
| 树 JSON 存储 | `birth_place: ""`（字符串，**自由文本**） | `birth_place: { origin_code, note }`（对象） |
| 语义承担者 | 字符串**同时**承担「行政区划」与「细节」 | **码承担行政区划**（可反查校验）、**note 承担细节**（不再解析） |
| 行政区划合法性 | **无法校验**（任意字符串可写） | 由 `origin_code` 体系校验（`isKnownOriginCode`，口径见 `geo-origin.spec.md` §6-4） |
| 前端展示串来源 | 直接显示该字符串 | **服务端由码反查生成**（C7 的 `place`），**空码则空串** |

⇒ **`birth_place` 字符串形态自本契约起 = 历史数据形态**，只允许在读侧出现（C3）。

### 3-2 读侧容错（C3 · **必须**）

| 输入形态 | 归一结果 |
|---|---|
| `{ origin_code, note }`（正常对象） | 原样使用（字段各自 `trim`） |
| **字符串**（历史数据，成文时点实测 **17 处**） | `{ origin_code: '', note: <原串> }` |
| **非法类型**（数字 / 布尔 / 数组 / `null` / `undefined`） | **空对象**（`{origin_code:'', note:''}`） |
| 缺省 | 同「非法类型」 |
| `residence_places` 非数组 | **`[]`**（同类容错；契约未明示，登记为 §11 第 6 条） |

- **硬要求：不崩不丢**（C3 逐字）——**读路径（含列表批量读）遇到任何形态都不得抛错**，且**字符串内容必须搬进 `note`，不得丢弃**（存量 17 处非空文本是唯一的行政区划线索来源，见 §7）。
- **归一实现必须唯一**（**禁止两处各写一套**）：落地实现 = **`lib/person-places.js`** 的 `normalizeBirthPlace` / `normalizeResidencePlaces`（§12-1 实测）。

### 3-3 读响应派生（C7 · 逐字）

```jsonc
// GET /people/<handle> 响应（raw.profile）
"profile": {
  "birth": {
    "date":       "<person.birth_date>",
    "place":      "<由 place_code 反查得到的展示串；空码 → 空串>",
    "place_code": "<birth_place.origin_code ?? ''>",
    "place_note": "<birth_place.note ?? ''>"
  }
},
"residence_places": [
  { "place": "<反查展示串；空码 → 空串>", "place_code": "<码 ?? ''>", "place_note": "<note ?? ''>" }
]
```

- **字段对应关系（硬口径）**：`place` ↔ `place_code` 由**码反查**得出（`resolveOrigin(code).display`，口径真源 `docs/geo-origin.spec.md` §7-1 / §7-2）；`place_note` = `note` **原样透传**；**三者一一对应、不得混用**。
- **`place` 空码则空串**（C7 逐字）：**不得**用 `note` 顶替 `place`（**注意与 `PUT /tree-meta` 的兼容分支口径不同** —— 后者在无码时以 `origin` 承载历史文本，见 §6-5）。⇒ **两处口径有意不同，不得「统一」。**
- **顶层新增 `residence_places`**：**元素顺序 = 树 JSON 数组顺序**（§2-2）；**空表下发 `[]`**。
- **`profile.birth` 的下发门控（C7 未提及，本册如实登记）**：成文时点实测为 `if (person.birth_date)`（**只有出生地、没有出生日期的节点读不到地点**）；**落地实现已改为 `person.birth_date || hasPlaceContent(person.birth_place)`**（§12-2）⇒ **该未决项已由实现闭合**（口径以落地实测为准；若产品另有意图，须由 Zang 另出裁定）。
- **节点级可见性裁剪口径不变**（C7 逐字）：本属性的读裁剪**沿用既有分层**；**本册不新增裁剪规则**。⚠️ `residence_places` 是否属「在世人物敏感地点」需一并纳入脱敏，契约未点名 ⇒ 登记为未决（§11 第 7 条；前端现有脱敏实测只处理 `birth_date` / `death_date` / `Birth` 事件 place）。

---

## 4. 读写路径与计费

### 4-1 写路由（成文时点实测锚点）

`PUT /people/<handle>`：`requireWriteUser` → `getTree` → **C10 上限校验（400，先于扣费）** → `assertFounderEditable`（C6）→ `!hasPersonChanges` → 400 → `isPersonUnchanged` → 200 `unchanged:true`（不扣费）→ `chargeBamboo(FEE.person_update)` → `tw.updatePerson` → 详情文档后写。

- **计费额度不动**（Kevin 第 3 条）：`lib/economy-fee.js:43` `person_update: 1`（**1 片 / 节点 / 次**）。
- **顺序硬口径**：**上限校验（400）与始祖判定（403）都必须先于扣费**（否则产生「拒绝但已扣费」）。落地实测顺序见 §12-2。

### 4-2 新建 / 复制节点的初始值（C4 + **实测全量落点清单**）

**C4 点名的 3 处**：

| # | 位置 | 成文时点锚点 | 落地状态（§12-4） |
|---|---|---|---|
| 1 | `lib/tree-write.js` 的 `createTree` | 形参区 `:925`；person 初始值 `:967` | ✅ 已改对象 + `[]`（`:980-981`） |
| 2 | `lib/child-write.js` | `:50`（`newPerson`）/ `:346`（`addChildNode`） | ✅ 已改（`:50` / `:347`） |
| 3 | `chain-append-batch` / `/admin/chain-append` | 路由 `index.js:2048` / `:2078`；实现 `lib/tree-write.js:543` / `:750`；person 初始值 `:450`（`newChainPerson`） | ✅ 已改（`:462-463`） |

**实测 `birth_place: ''` 全量落点 = 11 处**（C4 只点名 3 处）：

| # | 文件:行（成文时点） | 所在函数 | 该处角色 | C4 点名 | 落地状态（§12-4） |
|---|---|---|---|---|---|
| 1 | `lib/tree-write.js:250` | `createPerson` | `POST /people` 新建人物 | ✗ | ✅ 已改（`:261-262`） |
| 2 | `lib/tree-write.js:450` | `newChainPerson` | 总谱续编（单 / 批） | ✔ | ✅ 已改（`:462-463`） |
| 3 | `lib/tree-write.js:967` | `createTree` | 新建家族树（始祖节点） | ✔ | ✅ 已改（`:980-981`） |
| 4 | `lib/tree-write.js:1184` | `addSpouseNode` | 新增配偶节点 | ✗ | ✅ 已改（`:1198-1199`） |
| 5 | `lib/child-write.js:50` | `newPerson` | 新增子女 | ✔ | ✅ 已改 |
| 6 | `lib/child-write.js:346` | `addChildNode` | 跨树镜像子女 | ✔ | ✅ 已改（`:347`） |
| 7 | `lib/founder-attach.js:279` | `planFounderPlaceholder` | 始祖空白占位态 | ✗ | ❌ **仍为 `''`**（`:288`） |
| 8 | `lib/marriage.js:147` | `buildMirror` | 婚姻镜像节点 | ✗ | ❌ **仍为 `''`** |
| 9 | `lib/branch-clan-ops.js:169` | `mirrorFieldsOf` | 立支 / 汇宗镜像字段 | ✗ | ❌ **仍为 `''`** |
| 10 | `lib/clan.js:214` | `planClanMirrorPerson` | 祖谱镜像节点 | ✗ | ❌ **仍为 `''`** |
| 11 | `lib/clan.js:641` | `createClanTree` | 新建祖谱树（顶端节点） | ✗ | ❌ **仍为 `''`** |

- **口径（本册登记，不改契约）**：**任何新落盘的 person 对象，`birth_place` 必须是对象、`residence_places` 必须是数组**（C1 / C2）。**仍为字符串的 5 处**若新节点由此产生，则**违反 C1**，并在读侧被 C3 归一回空对象（**症状隐蔽：不报错、值静默丢失**）⇒ **本册判定：11 处应当在同批统一**（**依据 = C1 是全局存储口径，不是局部口径**）；**最终裁定权在 Zang / Kong**（未决 §11 第 8 条）。
- **`residence_places` 初始值**：**新增字段**，同样需在**全部落点**落 `[]`（C2）—— 未落者，读侧必须按 `[]` 兜底（C3 的同类容错**契约只对 `birth_place` 明示** ⇒ 见 §11 第 6 条）。

### 4-3 写路径补写（C1 的必要组成 · **落地实测已闭合**）

- **成文时点实测缺口**：`tw.updatePerson`（`lib/tree-write.js:155-221`）当时**不写 `birth_place` / `death_place`** —— 只落姓名 / 性别 / 生卒日期（`applyLifespan` `:113`）/ `external_*` / 详情 `attributes` ⇒ C1 的结构化 `birth_place` **在 PUT 路径上没有任何落点**（而 `economy-fee.js:279` 已把它纳入比对 ⇒ **当时的状态是「判变更并扣费、但值不落盘」**）。
- **落地实测（§12-1）**：`lib/tree-write.js:198-199` 已补 **`person.birth_place = normalizeBirthPlace(...)`** / **`person.residence_places = normalizeResidencePlaces(...)`**（**仅在 `body` 显式提供该键时覆盖**）⇒ **该缺口已闭合**。

### 4-4 计费与无改动判定（C5 · 逐字）

| 改动点 | 成文时点实现 | C5 要求 | 落地实测（§12-1） |
|---|---|---|---|
| 请求体是否含可改内容 | `hasPersonChanges`：逐字判 `['name',…,'birth_place','death_place','is_living']` 中「非 `undefined` / `null` / `''`」者 | **必须纳入 `birth_place`（对象）与 `residence_places`** | ✅ 新增两条**按「键显式提供」判**（`!== undefined && !== null`，`birth_place: ''` / `residence_places: []` 视为**真实清空**，不算无效请求） |
| 值级比对字段表 | `PERSON_VALUE_FIELDS`（含 `birth_place` / `death_place` 字符串形态） | **必须纳入两项** | ✅ `:157` 已含 `birth_place` + `residence_places` |
| 值级比对实现 | `birth_place` 按 `emptyText` 字符串比 | **规范化逐字段；数组逐项 + 长度** | ✅ 改用 `sameBirthPlace` / `sameResidencePlaces`（顺序敏感） |
| 无改动判定 | `isPersonUnchanged` | 同左 | ✅ 经 `personValueDiff` 复用同一比对 |

- **空值语义（本册登记，取代成文时点的疑虑）**：**「键显式提供」判**已落地 ⇒ **空对象 / 空数组 = 「真实清空」= 计费**（不再是「无效请求」），**而「键未提供」= 不参与比对**。⇒ **成文时点的 §11 第 4 条疑虑（对象永不等于 `''` → 误判）已由实现闭合**。
- **测试面（**必须同步扩展**）**：`lib/economy-fee.test.js:313-322` 现有断言 **尚未覆盖新字段**（成文时点与落地实测均无本批测试文件）⇒ **假绿风险，见 §12-4**。

### 4-5 `residence_places` 上限校验（C10 · 逐字 + 落地文案）

- **第 10 条必须在后端 400 拒绝**（**不能只靠前端**）。
- **落点（硬）**：`PUT /people/<handle>` 的**只读预检段**，**在扣费之前**（400 不得产生扣费）。落地实现 = **路由层** `index.js` 调用 `assertResidencePlacesLimit(body.residence_places)` 并在 catch 中 `send(400, { error: e.message })`；**写路径 `lib/tree-write.js` 内亦有同判据**（§12-1 / §12-2）。
- **错误文案位（**已落地 · 逐字实测**）**：**`'居住地最多 9 条'`**（常量 `RESIDENCE_LIMIT_MESSAGE`，`lib/person-places.js:23`）。
- **相邻 400 文案（**因本批而改，逐字实测**）**：`'请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）'`（**旧文案无「出生地 / 居住地」两项**，`index.js` 已同步扩展）。
- **校验对象（登记项）**：上限校验**只看条数**（> 9 → 400）；**条目 `origin_code` 的合法性**（是否已知码）**契约未给** ⇒ 登记为未决（§11 第 9 条）。

---

## 5. 始祖可编辑性放行口径（C6 · 逐字）

**契约条文**：`assertFounderEditable` **仅对 `birth_place` / `residence_places` 两项放行**；**同请求里改了姓名 / 生卒等锁字段仍 403**。

### 5-1 成文时点实现（实测锚点）

| 项 | 实测 |
|---|---|
| 断言入口 | `lib/founder-attach.js:203` `assertFounderEditable(tree, handle, masterTreeId, entry)` → 无 person **直接 return**；**总谱自身直接 return**；否则算 `founderLockMessage`，非空 → `403` |
| 锁文案判定 | `lib/founder-attach.js:194` `founderLockMessage`：`isFounderMirror` → `MIRROR_LOCK_MESSAGE`；`isPlaceholderFounder` → `PLACEHOLDER_LOCK_MESSAGE` |
| 调用点 | `index.js:2484`（`PUT /people`，**唯一与本册相关处**）+ `:1087` / `:1866` / `:1904`（改父 / 删除等，**不属本册**） |
| 二次防线 | `lib/tree-write.js:164-173` `updatePerson` 内**再判一次** ⇒ **C6 的放行必须在两处口径一致** |

### 5-2 放行口径（**按 C6 字面**）

1. **放行面 = 恰好两项**：`birth_place`、`residence_places`。**不得**顺带放行 `death_place` / `is_living` / `birth_date` / `death_date`。
2. **判据 = 「本次请求的改动集合 ⊆ {birth_place, residence_places}」**：**纯地点请求** ⇒ **放行**；**混合请求** ⇒ **403 整单拒绝**（不得「地点部分照写、其余忽略」）。
3. **判定必须用「请求里的显式提供项」**（不得用「有键就判」的粗判，否则带空 `primary_name` 的原样回传会被 403，破坏既有 no-op 保存链路）。
4. **两种锁态都受 C6 约束**：`isFounderMirror` 与 `isPlaceholderFounder` —— C6 未区分 ⇒ 字面**两者都放行地点两项**。
   - ⚠️ **风险登记（不代出裁定）**：**空白占位态**写入地点，等于**在「请先认祖」状态上写入地点数据**；与既有占位态「不允许自行填写身份数据」的意图是否冲突，**契约未表态** ⇒ 未决（§11 第 10 条）。**不得自行收紧为 403，也不得自行放宽到其它字段。**
5. **镜像节点（`isFounderMirror`）放行的影响**：写入落在**镜像树**；**C8′ 下不存在任何「自动回写 tree-meta」逻辑**（见 §6）⇒ **镜像树的地点写入不再有任何镜像副作用**（**成文时点关于「是否触发 C8 回写」的疑虑，随 C8 作废而消失**）。

---

## 6. 家族树「发源地」：**用户人工指定（C8′）**

### 6-1 **§原 C8-已作废（2026-09-20，取代者 C8′）** —— 历史行原文保留

> **原 C8（已作废 · 原文逐字保留）**：~~**镜像回写（写时同步）**：被编辑者 == 本树 `founder_handle` 且 `birth_place` 有改动时，**同一请求内**回写 tree-meta 该树：`origin_code = birth_place.origin_code`；`origin = code ? resolveOrigin(code).display : (note || '')`（无码时用备注兜底，保持家族页 hero 与首页卡片现状连续）。~~
> **作废声明（2026-09-20 即时生效 · Zang）**：**C8 整体作废**；**不存在任何「改始祖出生地就自动回写 tree-meta」的逻辑**。原因与替代方案见 **C8′**（§0-2 表 / §6-2）。
> **代码面连带登记（实测，见 §12-1）**：Kong 已按**原 C8** 落盘 `index.js:274 mirrorFounderBirthPlace()` 与 `lib/person-places.js:102 treeOriginPatchOf()` —— **按 C8′ 这两处已失去契约依据**；**删除 / 保留不用 由 Zang / Kong 定**（登记为 §11 第 11 条，**本册不代做处置**）。

### 6-2 C8′ 口径（**取代 C8 · 逐字照登**）

| 项 | 口径 |
|---|---|
| **总则** | **家族树「发源地」由用户人工指定 —— 不做自动同步** |
| **自动同步** | **不存在**（原 C8 的写时同步逻辑整体作废） |
| **指定入口** | **`POST /admin/set-tree-origin`**；入参 `{ tree_id, person_handle }`；**权限 = 与 `PUT /tree-meta` 同档（chief_editor）**；返回 `{ ok, origin_code, origin, source: { handle, gramps_id, name } }` |
| **可选范围** | **始祖节点 + 其下 1–2 代，共三代人**：第 1 代 = 始祖本人；第 2 代 = 以始祖为父/母的 families 的 `child_handles`；第 3 代 = 再下一层 |
| **可选节点的资格** | **被指定节点的 `birth_place.origin_code` 必须非空**（无码节点不可作为发源地来源） |
| **「始祖」认定** | `tree-meta.founder_handle` **优先**；缺失时取**唯一「非镜像」根节点**（`String(external_mirror) !== 'true'` **且** `parent_family` 为空）；**0 个或多个 → 400** |
| **候选读接口** | **`GET /tree/origin-candidates`** → `{ tree_id, founder: {...}\|null, current: {origin_code, origin}, candidates: [{handle, gramps_id, name, generation:1\|2\|3, birth_place:{place,place_code,place_note}, is_current}] }`；**始祖识别失败时返回 `founder:null, candidates:[]`（不报 400）** |
| **语义结论** | 「家族树的 `origin` / `origin_code`」= **人工指定的结果**；**真源 = 始祖附近（三代内）被指定节点的 `birth_place`**；**不是自动镜像** |
| **兼容入口** | `PUT /tree-meta` 的直写分支**保留为兼容入口**，**但不再是正规入口** |

### 6-3 「真源」的位置（C8′ 下必须写清）

| 角色 | 字段 | 地位 |
|---|---|---|
| **真源（发源地的内容来源）** | 树 JSON `people.<被指定节点>.birth_place`（**三代内任一有非空 `origin_code` 的节点**） | **发源地文本的权威来源** |
| **指定记录（谁被指定）** | **由 `POST /admin/set-tree-origin` 写入 tree-meta 的 `origin_code` / `origin`**（`source: {handle, gramps_id, name}` 供回显） | **人工指定的结果**；**不是「自动镜像」** |
| **展示** | tree-meta `origin`（首页卡片 / 家族树页头 / 家族页 hero 继续读它，§8-1 D1–D3） | **无需改造**（展示口径不变） |

> ⇒ **与成文时点的差别（一句话）**：原来写「tree-meta 是始祖出生地的**自动镜像**」；现在写「**tree-meta 记录的是用户人工指定的结果**，其内容取自被指定节点（三代内、码非空）的出生地」。

### 6-4 与 C11 的关系（**建树时的一致性**）

**C11**：`POST /admin/create-tree` 的入参中填写的发源地 ⇒ **同时写两处**：
1. **tree-meta**（既有行为：`origin_code` + 反查生成的 `origin`）；
2. **始祖节点的 `birth_place.origin_code`**（`note:''`）。

⇒ **目的**：使「**树上发源地 = 某节点出生地**」**恒成立**（否则新建树会出现「tree-meta 有码、但始祖出生地为空、C8′ 候选列表全空」的不一致）。**建树 → 立即可以用该树自己的始祖重新指定发源地。**

### 6-5 无码兜底口径（**登记：两处口径有意不同，不得统一**）

| 场景 | `place`（读响应 · C7） | `origin`（tree-meta · 直写兼容分支 / C11 反查） |
|---|---|---|
| 有码 | `resolveOrigin(code).display` | 同左 |
| **无码** | **空串 `''`**（备注落 `place_note`，**不冒充展示串**） | `PUT /tree-meta` 兼容分支以**入参原文本**承载（历史展示文本，**不丢**） |

⇒ **两处不得合并成一个函数**：C7 的 `place` 是「**结构化展示串**」（**不给假数据**），tree-meta 的 `origin` 是「**展示连续性兜底层**」。

### 6-6 可重跑同步脚本（**状态：随 C8 作废**）

- 成文时点登记「可重跑同步脚本」（Kevin 第 4 条）**已随 C8 作废**（C8′ 无自动同步 ⇒ **无镜像需对齐**）。
- ⚠️ **但 C9 迁移仍需要一次性的「存量写入脚本」**（把 tree-meta 现有 `origin_code` / `origin` 写进被点选始祖节点的 `birth_place`），其纪律（dry-run / 备份 / md5 / 幂等 / 副本演练）**继续有效**（§7-5）。
- ⚠️ **`PUT /tree-meta` 兼容分支与 C8′ 结果漂移的核对**：C8′ 下二者可能不一致（人工指定后再用兼容入口直改 tree-meta）⇒ **是否需要「只读核对脚本」由 Zang 定**（登记为 §11 第 12 条）。

---

## 7. 历史数据迁移（C9）

### 7-1 迁移映射（C9 逐字）

| tree-meta 现状 | → 被指定始祖节点 `birth_place.origin_code` | → 该节点 `birth_place.note` |
|---|---|---|
| **有码**（`origin_code` 非空） | **该码** | **`''`**（**不搬 `origin` 文本**） |
| **无码 且 `origin` 非空** | **`''`** | **`origin` 原文本**（legacy 文本进备注） |
| **无码 且 `origin` 空** | **不迁移**（Kevin 清单已把这些树归入「跳过」档） | — |

- **备份 + md5 + 可重跑幂等**（C9 逐字）：三项**硬要求**，登记位见 §10-2。
- **不得反向删改 tree-meta**：迁移**只写树 JSON 的 `birth_place`**；tree-meta 的 `origin_code` / `origin` **保留**。

### 7-2 **Kevin 逐树点选清单（2026-09-20 · 逐字照登 · 写入规格作为待执行清单）**

> **⚠️ 状态 = 「已点选、**仍待 Zang 下令 `--apply`**」**：**在 Zang 下令前，任何写入动作一律禁止**（纪律承 `docs/geo-origin.spec.md` §13-12-3 第 2 条）。

**A. 待写入的 12 棵（`tree_id` → 被指定节点）** → 🚫（**2026-09-20 追补：已取代 = 13 棵**（新增 `li_26446_01` → 李宝华）；**取代者 §14-2**）

| # | `tree_id` | 被指定节点（Kevin 逐字） | 档 |
|---|---|---|---|
| 1 | `liu_21016_01` | **刘芳池 I000258** | Kevin 点选 |
| 2 | `shen_27784_01` | **沈克强 I000277** | Kevin 点选 |
| 3 | `heng_24658_01` | **恒未知 I000363** | Kevin 点选 |
| 4 | `ji_32426_01` | **纪未知 I000377** | Kevin 点选 |
| 5 | `long_40857_01` | **龙未知 I000362** | Kevin 点选 |
| 6 | `li_26446_02` | **李未知 I000373** | Kevin 点选 |
| 7 | `qin_31206`（**祖谱**） | **姬搢 I000289** | Kevin 点选 |
| 8 | `zhonghua`（**世本**） | **风华胥 I0104** | Kevin 点选 |
| 9 | `gu_39038_01` | **顾清学** | 已有 `founder_handle` |
| 10 | `gu_39038`（祖谱） | **顾清学** | 已有 `founder_handle` |
| 11 | `ji_23395_01` | **季花** | 已有 `founder_handle` |
| 12 | `ji_23395`（祖谱） | **季花** | 已有 `founder_handle` |

**B. 跳过档（Kevin 逐字）**：**`qin_31206_01`（空树）** + **4 棵来源地为空的树**。 → 🚫（**2026-09-20 追补：已取代 = 跳过 4 棵**：`qin_31206_01`（空树）/ `liu_21016` / `rong_23481_01` / `li_26446_03`；**取代者 §14-2**）

| # | `tree_id` | 跳过理由（Kevin） | 实测状态 |
|---|---|---|---|
| 13 | `qin_31206_01` | **空树** | ✅ **实测一致**：`people = 0`（文件 145 B） |
| 14 | `liu_21016` | **来源地为空** | ✅ 一致（`origin = ''`、无 `origin_code` 字段） |
| 15 | `rong_23481_01` | **来源地为空** | ✅ 一致（`origin = ''`） |
| 16 | `li_26446_03` | **来源地为空** | ✅ 一致（`origin = ''`） |
| 17 | **`li_26446_01`** | **来源地为空** | ❌ **实测不一致**：现行真源 **`origin_code = 230305` / `origin = 黑龙江省鸡西市梨树区`（非空）** | → 🚫（**2026-09-20 追补：已裁定移入待写入档**（始祖 = 李宝华，实测唯一非镜像根节点）；**取代者 §14-2**）

> ⚠️ **冲突（必须先澄清再 `--apply`，登记为 §11 第 2 条）**：Kevin 的「4 棵来源地为空」把 **`li_26446_01`** 计入跳过档，但**该树现行真源非空**（`230305`，2026-09-20 10:59:23 的外部人工写入；逐字 diff 见 §0-4 第 11 行）。⇒ **两种理解**：(a) 该树**应当迁移**（有码 → 搬码到其始祖 `birth_place`）；(b) 该树**仍按跳过**（Kevin 的清单基于更早的真源快照）。**本册不自行裁定。** → 🚫（**2026-09-20 追补：已裁定 = (a)** —— 该树**应迁移**；跳过档由 5 棵改正为 **4 棵**；**取代者 §14-2**）

### 7-3 始祖 handle 实测台账（**只读实测 · 逐条可复现**）

复现命令：

```bash
python3 -c "
import json
t=json.load(open('config/tree-meta.json'))['trees']
for k,v in t.items(): print(k, repr(v.get('founder_handle','<ABSENT>')), repr(v.get('origin')), repr(v.get('origin_code','<ABSENT>')))"
```

| 档 | 树数 | 清单（实测） |
|---|---|---|
| **A. `founder_handle` 非空** | **4** | `ji_23395_01` = `10400594c54f5203f61bf4fa4b20`（季花）/ `gu_39038_01` = `103f95b87b5a464242933ee319d5`（顾清学）/ `ji_23395` = `3c95530f8bd4f84dc0b87edc`（季花）/ `gu_39038` = `5ae4c6e505c90d290f71f66b`（顾清学） |
| **B. `founder_handle` 存在但为空串**（🆕 本册实测登记） | **2** | `qin_31206` = `''` / `liu_21016` = `''` |
| **C. `founder_handle` 字段缺失** | **11** | `liu_21016_01` / `qin_31206_01` / `shen_27784_01` / `zhonghua` / `li_26446_01` / `ji_32426_01` / `rong_23481_01` / `long_40857_01` / `heng_24658_01` / `li_26446_02` / `li_26446_03` |

- **始祖认定判据（C8′ ④）**：`founder_handle` **优先**；缺失时取**唯一非镜像根节点**（`String(external_mirror) !== 'true'` **且** `parent_family` 为空），**0 个或多个 → 400**。
- ⚠️ **B 档陷阱（落地红线）**：`qin_31206` / `liu_21016` 的 `founder_handle` **字段存在但为 `''`** ⇒ 判据必须是 **非空**（`(v ?? '') !== ''`），**不得**用「字段存在」或非严格真值判断（否则会跳过「唯一非镜像根节点」兜底，或误认祖先）。
- **四个始祖节点当前 `birth_place` 全为空字符串（实测）**、`residence_places` 全为**字段缺失** ⇒ **存量无争议**；**未获 Zang 下令前一律不得写入**。

### 7-4 迁移执行纪律（登记）

1. **备份 + md5（C9）/ 幂等 / 副本演练**：三重门槛**全部前置**（§10）。
2. **只写 `birth_place`，不动其它字段**（对照 `migrate-tree-origin.mjs` 的「独立 diff 证明只动目标字段」做法）。
3. **写入对象 = `migrate-output/trees/*.json`**（本地真源）；**云端 tree JSON 的同步是独立部署动作**（`docs/PENDING_DEPLOY.md` §25-3）。
4. **`config/**` / `migrate-output/**` 本册零写入**（硬纪律）。
5. **C9 与 C11 的一致性**：迁移后应满足「tree-meta `origin_code` == 被指定节点 `birth_place.origin_code`」；**新树**由 C11 保证同一不变量；**存量树的 C8′ 一致性无自动保障**（人工指定后才对齐）。

---

## 8. 展示端

### 8-1 落点表（**逐处实测锚点；本册只登记口径，落地由 Kong / 前端承担**）

| # | 落点 | 实测锚点 | 结构化后的要求 | 实测状态 |
|---|---|---|---|---|
| **D1** | 首页家族 / 祖谱卡片副标题 | `frontend/src/pages/index/index.vue:96`（`发源地：${card.origin \|\| '待完善'}`） | **继续读 `origin`**；「待完善」兜底**逐字保留** | 无需改 |
| **D2** | 家族树页头 | `frontend/src/pages/hall/index.vue:12`（`发源地：{{ hallInfo.origin }}`） | 同上 | 无需改 |
| **D3** | **家族页（`family`）头图 hero** | `frontend/src/pages/family/index.vue:24`（`:v-if="hallInfo?.origin"` + `发源地：{{ hallInfo.origin }}`） | 同上 | 无需改 |
| **D4** | **人物档案 · 出生地展示** | `frontend/src/components/person-archive/person-archive.vue` —— **成文时点无 `profile.birth.place` 消费者**（`:1870` 只读 `birth.date`；`evt.place` 来自**详情文档 events**） | **消费 `place` / `place_code` / `place_note`**（C7）：行政区划串 + 「备注」分段显示 | **落地中**（§12-4：`person-archive.vue` 已改 +54 行、新增 `business/place.ts` 104 行） |
| **D5** | **人物档案 · 居住地展示** | 同上（**成文时点无落点**） | **新增**：按 `residence_places` 顺序展示 ≤ 9 条（`place` + `place_note`） | 同上 |
| **D6** | **人物档案 · 编辑表单** | `person-archive.vue` `editForm`（`:1532` 起）/ 出生日期 `:358` / 保存 `:1999` | 新增**出生地三段编辑**（级联 + 备注输入）+ **居住地多条编辑（≤ 9）**；提交字段名 = `birth_place`（对象）/ `residence_places`（数组） | 同上 |
| **D7** | **时间轴** | `person-archive.vue:223`（`:description="evt.place"`，来源 = 详情文档 `events[].place`）；`tree-pedigree.vue:729` | **契约未把 `birth_place` 接入时间轴**（`docs/data-model.md:61` 旧注释「时间轴可用」是**改形状前的形态**）⇒ **本册不擅自接入**；未决（§11 第 13 条） | — |
| **D8** | 类型定义 | `frontend/src/business/api.ts:185` / `:192`（`birth?: { date?: string; place?: string }`）；`types.ts:68` | **新增 `place_code` / `place_note`**（C7）+ 顶层 `residence_places` 类型；**既有 `place` 保留** | **落地中**（§12-4：`api.ts` / `types.ts` / `business/index.ts` 已改） |
| **D9** | 隐私脱敏 | `frontend/src/business/privacy.ts:21-22` / `:26-33` / `:58` | **C7 逐字「裁剪口径不变」** ⇒ **不新增规则**；`residence_places` 是否纳入脱敏 = 未决（§11 第 7 条） | — |
| **D10** | **发源地指定 / 候选（🆕 C8′）** | **成文时点无落点**（`GET /tree/origin-candidates` 未落盘） | 新增**候选选择 UI**（始祖 + 1–2 代、只列 `place_code` 非空者、标注 `is_current`）→ 调 `POST /admin/set-tree-origin`；**入口位置未定**（家族树页 / 家族页 hero 附近） | ⚠️ **未落盘**（§12-5） |

> **关键实测结论（写入本册以免落地时误判）**：**成文时点 `profile.birth.place` 在 H5 / 小程序端没有任何消费者**（全仓 `frontend/src` 内 `grep -n 'birth'` 无 `birth.place` 消费点）⇒ **C7 的 `place` / `place_code` / `place_note` 是「先建字段、后接展示」**；**「线上已有出生地展示」的判断是错的。**

### 8-2 「展示串」与「备注」的分工（**前端口径**）

| 展示元素 | 取值 | 说明 |
|---|---|---|
| 行政区划串 | `place`（C7，服务端码反查） | **前端不得自行拼接展示串**（沿用 `docs/geo-origin.spec.md` §7-5R 的既有纪律：选择器**只提交码**） |
| 「备注」 | `place_note`（C7） | **文案逐字 = 「备注」**（Kevin 原话）；**空则整段不展示** |
| 无码但有备注 | `place=''` + `place_note=<文本>` | **两段分别展示**（**不得**用备注顶替行政区划位显示，见 §3-3） |

---

## 9. 校验与测试口径

### 9-1 测试注册（**硬纪律 · 未注册 = 假绿**）

- **新增测试文件必须同步注册进根 `package.json` 的 `scripts.test`** —— **未注册 = 假绿**（`docs/PENDING_DEPLOY.md` §14-4 / §16-1；`AGENTS.md` §7 同条）。
- **现行清单实测**：`scripts.test` 枚举 **26** 个测试文件（**全部在 `cloudfunctions/compat-api/lib/`**）：

  ```bash
  python3 -c "import json;print(len([p for p in json.load(open('package.json'))['scripts']['test'].split() if p.endswith('.js')]))"
  # → 26
  ```

- **`npm test` 跑的是本地副本**（`COMPAT_SOURCE=local` + `/tmp` 副本、`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 钩子），**与云端数据无关，不得当云端回归用**（`docs/PENDING_DEPLOY.md` §14-4）。
- **本批应新增的测试（规划名 / 由 Kong 登记为准，本册不预设路径）**：

  | 覆盖面 | 必测内容 |
  |---|---|
  | **C1 / C2 存储形状** | 各落点（§4-2）产出的 `birth_place` 为对象、`residence_places` 为 `[]` |
  | **C3 读侧容错** | 字符串 → `{code:'', note:原串}`；数字 / 布尔 / 数组 / `null` / 缺省 → 空对象；`residence_places` 非数组 → `[]`；**不抛错、文本不丢** |
  | **C7 读响应** | `place_code` / `place_note` / `place` 三字段；**无码时 `place === ''`**；`residence_places` 顺序保持、空表下发 `[]`；**门控 `hasPlaceContent`** |
  | **C5 计费** | 对象形态变更 / `residence_places` 长度与逐项变更 / 顺序变更 → 判变更；**原样回传 → `unchanged:true`、`pieces:0`**；**键未提供 → 不参与比对** |
  | **C6 放行** | 纯地点请求（含空值）→ 放行；**混合请求（含姓名/生卒）→ 403 且不扣费** |
  | **C10 上限** | **第 10 条 → 400（`居住地最多 9 条`）、不扣费** |
  | **C8′（新增）** | `POST /admin/set-tree-origin`：始祖认定（`founder_handle` 优先 / 唯一非镜像根兜底 / 0 或多个 → 400）、**三代范围**边界、`origin_code` 非空判定、返回 `source`；`GET /tree/origin-candidates`：**始祖识别失败 → `founder:null, candidates:[]`（不 400）** |
  | **C11（新增）** | `POST /admin/create-tree` 的 `origin_code` → **同时**落 tree-meta 与始祖 `birth_place.origin_code`（`note:''`） |

- **既有测试的必跑回归**：`lib/economy-fee.test.js`、`lib/tree-write.test.js`、`lib/child-write.test.js`、`lib/chain-append-batch.test.js`、`lib/founder-attach.test.js`、`lib/noop-edit-integrity.test.js`（**no-op 不得误扣**）。
- **基线**：`docs/geo-origin.spec.md` §13-11-3 的 **431 / 431 / 0** 为**本批之前**的基线；**本批新增测试后基线必然上移**，**新基线必须实测回填，不得推算**（本册不编数字）。 ⇒ ✅ **（2026-09-20 §15 追补：已实测回填 —— `scripts.test` 26 → 27 项；全量基线 `431 / 431 / 0` → `448 / 448 / 0`；取代者 §15-4）**

### 9-2 真源零写入（测试纪律）

- 测试对真源（`config/tree-meta.json`、`config/geo-divisions.json`、`migrate-output/**`）**零写入**；收尾断言比对 **md5 前后一致**。
- 需要写 tree-meta 的用例一律走 **`COMPAT_META_FILE` 副本**（**现行有效钩子**；`GEO_DIVISIONS_FILE` 已作废）。
- **本属性的测试额外要求**：凡构造**非对象 `birth_place`** 的用例，**必须走副本树 JSON**（`COMPAT_OUT_DIR`），**严禁**在 `migrate-output/trees/` 真源上做形态实验（**存量 17 处非空文本是唯一线索来源，破坏后不可逆**）。

### 9-3 前端校验

- H5 / 小程序类型检查：`cd frontend && npm run type-check`（`vue-tsc --noEmit`）。
- 前端**只提交码**（`GeoCascader` 既有形态：`emit('update:modelValue', draftCode)`）；**备注为独立输入**，**不得拼进码字段**。

---

## 10. 回滚口径

### 10-1 备份路径（**任何写入前必做**）

| 对象 | 备份路径惯例 | 备注 |
|---|---|---|
| `config/tree-meta.json` | `~/jiazu-backups/<YYYY-MM-DD>-<说明>/tree-meta.json`（另有 `/tmp/jiazu-bak-<ts>/` 惯例） | 沿用 `migrate-tree-origin.mjs` 既有做法 |
| `migrate-output/trees/<tree_id>.json`（**本批新增备份对象**） | `~/jiazu-backups/<YYYY-MM-DD>-person-places/trees/<tree_id>.json` | **C9 迁移必须写前备份** |
| `cloudfunctions/deploy/compat-api/index.js` | 由 esbuild 重生成，**无需备份** | 判据见 `docs/PENDING_DEPLOY.md` §25-2 |

### 10-2 md5 登记位（**未填项留空，不得编数字**）

| # | 对象 | 写入前 md5（成文时点实测） | 写入后 md5 | 备份路径 |
|---|---|---|---|---|
| 1 | `config/tree-meta.json` | **`5817e4bb7f9fd461c11803e0df78a48a`**（9,572 B / 2026-09-20 10:59:23） | *（待填）* | *（待填）* | → ✅（**2026-09-20 追补复核：写入前 md5 未变**（见 §14-1）；**「写入后 md5」仍为待填 —— 本批未执行任何迁移写入**） ⇒ ✅ **（2026-09-20 §15 追补：C9 迁移已执行；`config/tree-meta.json` 迁移前后 md5 均 `c9112e40760839bc8d2132d6300b838b`（未变）；见 §15-5）**
| 2 | `migrate-output/trees/ji_23395_01.json` | **`64aa3dc36cb1bf538edc73e8de5bd8ef`**（47,483 B） | *（待填）* | *（待填）* |
| 3 | `migrate-output/trees/gu_39038_01.json` | **`fb950f95f37736b413c5d6bf4fcf7b5b`**（18,041 B） | *（待填）* | *（待填）* |
| 4 | `migrate-output/trees/ji_23395.json` | **`c0f70ebc2d913e71e469f8298bd715eb`**（1,783 B） | *（待填）* | *（待填）* |
| 5 | `migrate-output/trees/gu_39038.json` | **`806dbb75161e1aee67d23706f9d7a875`**（1,769 B） | *（待填）* | *（待填）* |
| 6 | 其余 13 棵树 JSON | **见 §10-3 全表** | *（待填）* | *（待填）* |
| 7 | `cloudfunctions/deploy/compat-api/index.js` | **998,338 B**（mtime 2026-09-19 12:50；`grep -c 'residence_places'` = 0） | *（待填）* | 无需备份（esbuild 重生成） |

- **复测命令**：`md5 -q config/tree-meta.json; wc -c config/tree-meta.json; stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' config/tree-meta.json`。
- **回滚核对步**：回滚后**逐项比对**上表「写入前 md5」，**并** 跑 `node scripts/gen-geo-divisions.mjs --check`（期望 exit 0）。

### 10-3 成文时点树 JSON 全表 md5（**只读实测 · 17 棵 · 供回滚基线**）

| # | 文件 | 字节 | md5 |
|---|---|---|---|
| 1 | `gu_39038.json` | 1,769 | `806dbb75161e1aee67d23706f9d7a875` |
| 2 | `gu_39038_01.json` | 18,041 | `fb950f95f37736b413c5d6bf4fcf7b5b` |
| 3 | `heng_24658_01.json` | 2,726 | `71fce7442855b26ef20a5e98037e2988` |
| 4 | `ji_23395.json` | 1,783 | `c0f70ebc2d913e71e469f8298bd715eb` |
| 5 | `ji_23395_01.json` | 47,483 | `64aa3dc36cb1bf538edc73e8de5bd8ef` |
| 6 | `ji_32426_01.json` | 2,740 | `31c457bf2ea4cd16bccdc7214df6e962` |
| 7 | `li_26446_01.json` | 1,974 | `de857741dc050e447b35d429a7bfba3b` |
| 8 | `li_26446_02.json` | 2,740 | `584a9f2a1372399f5f4bb9937063ad50` |
| 9 | `li_26446_03.json` | 4,108 | `9df8f87b098c291bbf6996e371690c22` |
| 10 | `liu_21016.json` | 29,956 | `97aca360b5cf266150927b7d5441a20c` |
| 11 | `liu_21016_01.json` | 14,985 | `1cea4ac85d2b9d72bec24f1def3433e1` |
| 12 | `long_40857_01.json` | 2,863 | `6669c9e2d4f2e5bfe2bbb770b57a2e52` |
| 13 | `qin_31206.json` | 3,482 | `1ed95b8bc75bfc5f2cbf5cd63868dece` |
| 14 | `qin_31206_01.json` | 145 | `e7b319df5145e5c3603fe917fd756700` |
| 15 | `rong_23481_01.json` | 2,772 | `3d910c9de344cc83881be185f02a7d90` |
| 16 | `shen_27784_01.json` | 11,686 | `4315d7bd025d72c8c20f218bf38af5d0` |
| 17 | `zhonghua.json` | 89,683 | `de776b5ae129d1b2d87cdc28f44c0106` |

**复现命令**：`for f in migrate-output/trees/*.json; do echo "$(md5 -q $f) $(wc -c < $f | tr -d ' ') $f"; done`

- ⚠️ **`migrate-output/**` 被 `.gitignore` 忽略** ⇒ 上表**只在本册留档**，`git` 无法回滚；**备份目录（§10-1）是唯一恢复途径**。

### 10-4 回滚顺序（登记）

1. **停写**：确认没有实例持有过期内存副本（`docs/geo-origin.qa.md` §12-4 **R8**：过期副本回写是**整文件**回写，比单行差异更危险）。
2. **恢复 tree JSON**：用 `~/jiazu-backups/<批次>/trees/*.json` 覆盖。
3. **恢复 tree-meta**：用同批次的 `tree-meta.json` 覆盖。
4. **重打云函数 / 前端**：`docs/PENDING_DEPLOY.md` §25-2 / §25-4。
5. **核对**：§10-2 逐项 md5 + `gen-geo-divisions.mjs --check`。

---

## 11. 已知未决（**逐条登记 · 不得当已定案引用**）

| # | 未决项 | 现状 / 依据 | 需要谁决定 |
|---|---|---|---|
| 1 | **tree-meta 台账的外部变动未认领** | 实测 `origin_code` 非空 = **8 / 17**（`li_26446_01` = `230305`），与 `docs/geo-origin.spec.md` §13-12-2 的 7 / 17 不一致；**写入主体 / 时点未登记**（mtime `2026-09-20 10:59:23`） | **Kevin** | → ✅（**2026-09-20 追补**：**写入主体 = Kevin 亲手写入**（mtime `2026-09-20 10:59:23`）；**本条闭合**，取代者 **§14-1**）
| 2 | **`li_26446_01` 在 C9 清单里「来源地为空 vs 实测非空」冲突** | §7-2 B 表：Kevin 归入「跳过」；实测 `origin_code = 230305`。**`--apply` 前必须先澄清** | **Kevin / Zang** | → ✅（**2026-09-20 追补**：Zang 已裁定 `li_26446_01` **应迁移**（始祖 = 李宝华）；**本条闭合**，取代者 **§14-2**）
| 3 | **`residence_places` 是否允许重复条目** | C2 / C10 均未提去重；本册按字面**不去重** | **Zang** |
| 4 | ~~空值等价关系（`[]` vs 全空表；空对象在 `hasPersonChanges` 下是否算「有改动」）~~ | **已由落地闭合**：`hasPersonChanges` 改为「**键显式提供**」判（§12-1） | ~~Zang~~（闭合） |
| 5 | **`note` 文本长度上限 / 是否富文本 / 是否需 XSS 过滤** | Kevin 第 1 条只说「备注」，未设限 | **Kevin / Zang** |
| 6 | **`residence_places` 字段缺失时的读侧兜底** | C3 只对 `birth_place` 明示容错；落地已按 `[]` 兜底（§12-1）⇒ **建议追认** | **Zang**（追认） | → ✅（**2026-09-20 已追认（Zang 定稿）**：读侧缺失 / 非数组一律 `[]` 兜底；取代者 **§14-5-1**）
| 7 | **`residence_places` 是否纳入在世人物脱敏** | C7 只说「裁剪口径不变」；前端现有脱敏只覆盖 `birth_date` / `death_date` / `Birth` 事件 place | **Kevin / Zang** | → ✅（**2026-09-20 已追认（Zang 定稿）**：**前端不额外做在世脱敏**、服务端裁剪口径不变；取代者 **§14-5-4**）
| 8 | **`birth_place` 初始值是否 11 处全改** | C4 只点名 3 处；**落地已改 6 / 11**，**仍为字符串 5 处**（`founder-attach.js:288` / `marriage.js:147` / `branch-clan-ops.js:169` / `clan.js:214` / `clan.js:641`） | **Zang / Kong** |
| 9 | **`residence_places` 条目的 `origin_code` 合法性是否校验** | C10 只提条数上限 | **Zang / Kong** | → ✅（**2026-09-20 已定稿（Zang 裁定 R1）**：非空码必须是已登记码，未知码 → 400；取代者 **§14-4-1**）
| 10 | **空白占位态（`isPlaceholderFounder`）是否也在 C6 放行范围内** | C6 未区分两种锁态 | **Zang** |
| 11 | **原 C8 的已落盘代码如何处置**（`index.js:274 mirrorFounderBirthPlace` / `lib/person-places.js:102 treeOriginPatchOf`） | C8 作废 ⇒ 失去契约依据；**删除 / 保留不用未定** | **Zang / Kong** |
| 12 | **是否需要一个「tree-meta 直写 vs C8′ 指定结果」的只读核对脚本** | C8′ 保留 `PUT /tree-meta` 为兼容入口 ⇒ 二者可能漂移（随 C8 作废，原「可重跑同步脚本」需求已消解） | **Zang** |
| 13 | **`birth_place` 是否接入时间轴** | `docs/data-model.md:61` 旧注释「时间轴可用」是改形状前的形态；C7 / §8 未提 | **Kevin / Zang** |
| 14 | **C8′ 的 UI 入口位置与交互** | 契约只给接口（`GET /tree/origin-candidates` / `POST /admin/set-tree-origin`），**未给入口落点** | **Kevin / Kong** |
| 15 | **C11 与 C8′ 的先后语义**：建树写入始祖 `birth_place` 后，是否需要**自动**把该节点设为 tree-meta 的「被指定节点」（即写 `source`） | C11 只要求「两处同写」，未要求记 `source` | **Zang** |
| 16 | **云函数重打包判据串** | 候选见 `docs/PENDING_DEPLOY.md` §25-2（`grep -c 'residence_places'` / `'place_note'` ≥ 1）；**最终以 Kong 实现字面为准** | **Kong** | → 🔄（**2026-09-20 追补**：源码 / 产物**双栏实测值已回填**（§14-7）；**最终字面仍待 Kong 回填**）
| 17 | **C8′ / C11 路由未落盘** | 实测 `grep`：`set-tree-origin` / `origin-candidates` **全仓 0 命中** | **Kong** | → ✅（**2026-09-20 追补：已落盘** —— `index.js:502` `POST /admin/set-tree-origin` / `index.js:2631` `GET /tree/origin-candidates`；取代者 **§14-4**）
| 18 | **本批测试文件未落盘（假绿）** | 实测：`scripts.test` 仍 **26** 项，**无 `person-places` 测试文件**；而 `lib/person-places.js` 已 118 行 | **Kong** | → ⚠️（**2026-09-20 追补复核：仍成立** —— `scripts.test` 仍 **26** 项、**无 `person-places` 测试文件**；`lib/person-places.js` 现 **154 行**；**R1 与新文案零测试覆盖**；见 **§14-7**） ⇒ ✅ **（2026-09-20 §15 追补：已注册 —— `scripts.test` 27 项 / `npm test` 448 / 448 / 0，假绿闭合；取代者 §15-4）**

---

## 12. 追补：**Kong 并发落地实测**（2026-09-20 11:21 CST · 只读快照 · **取代 §0-4 中标注「已改」的各行读数**）

> **性质**：本册成文（2026-09-20 上午）与 Kong 落地**同日并发**进行 ⇒ §0–§11 的实测读数为**成文时点**；本节为**落地后实测**（**同一会话内两次 `grep` 之间 `index.js` 已变化**，证明落地正在进行）。
> **本节的读数带时点（11:21 CST）**；**Kong 若继续落地，本节读数可能再次过期** —— 届时**新增追补小节**，**不改本节历史行**。

### 12-1 落地的新模块与改动点（逐条实测锚点）

| 项 | 实测 |
|---|---|
| **新增模块** | **`cloudfunctions/compat-api/lib/person-places.js`**（**118 行**，纯函数、零 IO、零 npm 依赖；`import { resolveOrigin } from './geo.js'`） |
| 导出常量 | `MAX_RESIDENCE_PLACES = 9`（`:20`）/ `RESIDENCE_LIMIT_MESSAGE = '居住地最多 9 条'`（`:23`）/ `PERSON_PLACE_FIELDS = ['birth_place','residence_places']`（`:26`） |
| 导出函数 | `normalizeBirthPlace`（`:37`，C3 归一）/ `normalizeResidencePlaces`（`:44`）/ `assertResidencePlacesLimit`（`:50`，C10，`status=400`）/ `hasPlaceContent`（`:60`）/ `sameBirthPlace`（`:66`）/ `sameResidencePlaces`（`:73`，**逐项 + 长度，顺序敏感**）/ `placeViewOf`（`:84`，C7）/ `residenceViewOf`（`:94`，C7）/ `treeOriginPatchOf`（`:102`，**原 C8 ⇒ 已作废**）/ `isPlaceFieldsOnly`（`:114`，C6 判据） |
| **写路径补写** | `lib/tree-write.js:32` 引入；**`:179` `assertResidencePlacesLimit(body.residence_places)`**；**`:198-199`** `person.birth_place = normalizeBirthPlace(...)` / `person.residence_places = normalizeResidencePlaces(...)`（**仅键显式提供时覆盖**） |
| **初始值对象化** | `lib/tree-write.js`：`:261-262`（`createPerson`）/ `:462-463`（`newChainPerson`）/ `:980-981`（`createTree`）/ `:1198-1199`（`addSpouseNode`）；`lib/child-write.js`：`:50` / `:347` |
| **仍为字符串（5 处）** | `lib/founder-attach.js:288`（`planFounderPlaceholder`）/ `lib/marriage.js:147`（`buildMirror`）/ `lib/branch-clan-ops.js:169`（`mirrorFieldsOf`）/ `lib/clan.js:214`（`planClanMirrorPerson`）/ `lib/clan.js:641`（`createClanTree`） |
| **计费面（C5）** | `lib/economy-fee.js:40` 引入两个 `same*`；**`:144` `if (b.birth_place !== undefined && b.birth_place !== null) return true;`**；**`:145`** 同判 `residence_places`；**`:157` `PERSON_VALUE_FIELDS` 已含 `birth_place` + `residence_places`**；**`:291`** `birth_place` 用 `sameBirthPlace`；**`:293-294`** `residence_places` 用 `sameResidencePlaces` |
| **始祖放行（C6）** | `lib/founder-attach.js:24` 引入 `isPlaceFieldsOnly`；**`:218` `if (msg && !isPlaceFieldsOnly(body))`** ⇒ 仅当请求体**非空且全部键**都在白名单内时放行；调用点已传第 5 形参 `body`（`index.js:2534`） |
| **读响应（C7）** | `index.js:197-198` 顶层 `residence_places: residenceViewOf(person.residence_places)`；`:201-210` `profile.birth = { date, place, place_code, place_note }`；**`:205` 门控 = `person.birth_date \|\| hasPlaceContent(person.birth_place)`**（⇒ **§11 成文时点的门控未决已闭合**） |
| **上限 400（C10）** | `index.js:2528-2532`：`assertResidencePlacesLimit(body.residence_places)` → `send(errorStatusOf(e, 400), { error: e.message })`（**在扣费之前**；文案 = `居住地最多 9 条`） |
| **相邻 400 文案扩展** | `index.js:2531` → `'请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）'`（**旧文案无「出生地 / 居住地」**） |
| **原 C8 的落盘代码** | `index.js:274 mirrorFounderBirthPlace()`（注释仍写「契约 v2 C8」）+ `lib/person-places.js:102 treeOriginPatchOf()` ⇒ 🚫 **按 C8′ 已作废**（处置未定，§11 第 11 条） |

### 12-2 `PUT /people/<handle>` 现行执行顺序（落地实测）

```
requireWriteUser
  → getTree（只读预检）
  → assertResidencePlacesLimit(body.residence_places)   ← C10，400 先于扣费
  → fa.assertFounderEditable(tree, handle, MASTER_TREE_ID, null, body)   ← C6（第 5 参 body）
  → !eco.hasPersonChanges(body) → 400（文案已含「出生地 / 居住地」）
  → eco.isPersonUnchanged(...) → 200 unchanged:true（不扣费）
  → chargeBamboo(FEE.person_update = 1 片)
  → tw.updatePerson(...)（内部再判上限 + 写 birth_place / residence_places）
  → 详情文档后写（detailSaved / detail_warning）
```

### 12-3 未变项（落地未触及）

| 项 | 实测 |
|---|---|
| **部署产物** | `cloudfunctions/deploy/compat-api/index.js` = **998,338 B / mtime 2026-09-19 12:50**；`grep -c 'residence_places'` = **0**、`grep -c 'place_note'` = **0** ⇒ **未重打包**（§24 的硬阻塞延续） |
| **源码 `index.js` 计数** | `residence_places` = **2**、`place_note` = **3**（对比产物 = 0） |
| **`lib/**` 计数** | `residence_places` 命中 **5 个文件**（`child-write` 2 / `economy-fee` 5 / `founder-attach` 1 / `person-places` 3 / `tree-write` 6） |
| **测试清单** | `scripts.test` 仍 **26** 项；**无 `person-places` 测试文件**（`ls lib/*place*test*` 空） |
| **tree-meta 真源** | md5 与台账**见 §12-6 复测**（成文时点 = `5817e4bb…` / 8/17） | → ✅（**2026-09-20 追补复核：同值未变**，见 **§14-1**）
| **`founder_handle` 台账** | 未变（非空 4 / 空串 2 / 缺失 11） |
| **C8′ / C11 路由** | **未落盘**：`grep -rn 'set-tree-origin\|origin-candidates'` ⇒ **全仓 0 命中** |

### 12-4 前端落地实测

| 项 | 实测 |
|---|---|
| **新增** | `frontend/src/business/place.ts`（**104 行**；`MAX_RESIDENCE_PLACES = 9` / `PLACE_NOTE_SEP = ' · '` / `emptyPlaceInput` / `normalizePlace` / `prunePlaces` / `placesDirty` / `placeDisplayOf` / `placeViewOf` / `placeViewsOf`） |
| **修改** | `business/api.ts`（+37/-…）、`business/types.ts`（+38）、`business/index.ts`（+2）、`components/person-archive/person-archive.vue`（+54）—— 合计 **+124 / −7**（`git diff --stat frontend/src`） |
| **未落盘** | **发源地指定 UI（D10，C8′）** —— 依赖未落盘的 `GET /tree/origin-candidates` |

### 12-5 **新增结论：本批「已落盘但未注册测试」= 假绿风险（硬登记）**

- `lib/person-places.js`（118 行）+ 11 处落点改动 + 计费面 + 路由 400 **全部无测试覆盖**，且 `scripts.test` **未新增文件**。
- ⇒ **按 §9-1 硬纪律，本批当前状态属「未注册 = 假绿」**；**部署前必须补齐测试并注册**。

### 12-6 复测命令（本节读数的可复现入口）

```bash
cd /Users/kevin/bistro/jiazu
# 落地计数
for f in cloudfunctions/compat-api/index.js cloudfunctions/deploy/compat-api/index.js; do
  echo "$f residence=$(grep -c residence_places $f) place_note=$(grep -c place_note $f)"; done
grep -rc 'residence_places' cloudfunctions/compat-api/lib/*.js | grep -v ':0'
# 仍为字符串的 birth_place 落点
grep -rn "birth_place: ''" cloudfunctions/compat-api/lib/*.js
# 未落盘的 C8′ 路由
grep -rn 'set-tree-origin\|origin-candidates' cloudfunctions/compat-api/ frontend/src
# 测试注册
python3 -c "import json;s=json.load(open('package.json'))['scripts']['test'];f=[p for p in s.split() if p.endswith('.js')];print(len(f))"
# 真源台账
python3 -c "import json;t=json.load(open('config/tree-meta.json'))['trees'];print(sum(1 for v in t.values() if v.get('origin_code')),'/',len(t))"
```

> **本节边界**：本节为**只读实测追加** —— **未改代码、未写真源、未改 `AGENTS.md`、未执行部署 / 打包 / 迁移**；§0–§11 与 §13 的历史行**一律原文保留**。

---

## 13. `AGENTS.md` 待补写拟稿（**未获授权 · 本册不改 `AGENTS.md`**）

> **状态**：`AGENTS.md` **本轮未获授权**（未经 Kevin 现场批准不得修改；同 `docs/geo-origin.spec.md` §13-9 口径）。
> 以下为**逐字拟稿**，**待批准后原样插入**；本册**不做任何插入动作**。
> **另注（只读实测）**：`AGENTS.md` 在本册开工前**已处于 dirty 状态**（`git status --short AGENTS.md` = ` M AGENTS.md`；工作区 md5 全程 = `e4c089818fbf7a3a7218e567e7b409ee`）—— **该改动非本册所为**，本册未触碰该文件。

### 13-1 §0 索引行（拟稿）

```
- **人物地点属性（出生地 / 居住地）与家族树发源地**：口径真源 = **`docs/person-places.spec.md`**（2026-09-20 成文；口径来源 = Kevin 五问五答 + Zang 契约 v2 + 同日口径变更 C8→C8′/C11）。**`birth_place` 由字符串改为对象 `{origin_code, note}`**（读侧容错为强制项）、**新增 `residence_places`（≤9 条，第 10 条后端 400）**、**家族树发源地 = 用户人工指定**（`POST /admin/set-tree-origin` + `GET /tree/origin-candidates`，**不存在自动同步**；原 C8「写时同步」**已作废**）、**建树时发源地同时写 tree-meta 与始祖 `birth_place`（C11）**；行政区划码表与展示串口径仍在 **`docs/geo-origin.spec.md`**。
```

### 13-2 §9（或对应章节）速查行（拟稿）

```
- **人物地点属性（出生地 / 居住地）**：存储 = 树 JSON `people.<handle>.birth_place`（对象）/ `residence_places`（数组 ≤9）；读响应 = `profile.birth.{date,place,place_code,place_note}` + 顶层 `residence_places`；计费 = 仍算「节点内容修改」**1 片 / 次**（不动计费口径）；始祖节点**仅这两项**可编辑（`assertFounderEditable` 放行，混合请求仍 403）；**发源地 = 人工指定**（始祖 / 其下 1–2 代、被指定节点码必须非空；始祖认定 = `founder_handle` 优先、否则唯一非镜像根节点，0 或多 → 400）—— **没有任何自动同步逻辑**。**口径真源 = `docs/person-places.spec.md`**。
```

### 13-3 §7（测试基线）若需变动（拟稿）

```
- **人物地点属性批次新增测试**：`scripts.test` 清单由 **26** 项增至 **（新值待填）** 项；全量基线由 **431 / 431 / 0** 更新为 **（新值待填）**。**未注册进 `scripts.test` 的测试 = 假绿**；⚠️ 截至 2026-09-20 11:21 CST，**本批代码已落盘但测试尚未注册**（假绿状态）。基线新值**必须实测回填**，不得推算。 ⇒ ✅ **（2026-09-20 §15 追补：26 → 27 项；431 / 431 / 0 → 448 / 448 / 0；取代者 §15-4）** ⇒ ✅ **（2026-09-20 §16 末次追补：拟稿终稿已出（27 项 / 449 / 449 / 0）；取代者 §16-8 拟稿 ③）**
```

---

## 14. 追补二：**真源读数刷新 + 13 / 4 迁移清单 + R1 / R2 裁定 + 四条追认 + 懒转换口径**（2026-09-20 · 只读实测 + 逐字照登 · **取代 §0-4 / §7-2 / §11 / §12-3 的相应行**）

> **性质**：本节为**只读实测 + 逐字照登**的台账追补 —— **未改代码、未写真源、未改 `AGENTS.md`、未执行部署 / 打包 / 迁移**。
> §0–§13 的历史行**一律原文保留**；凡被本节取代 / 闭合者，**已在原行行尾追加标注**（不删不改）。
> **时点**：真源 mtime 仍为 **2026-09-20 10:59:23** ⇒ **自 Kevin 10:59 写入后真源未再变动**；本节读数均在该时点之后复核。

### 14-1 真源读数复核（**本条为新真值**）

| 项 | 复核实测（新真值） | 与旧行的关系 |
|---|---|---|
| `config/tree-meta.json` md5 | **`5817e4bb7f9fd461c11803e0df78a48a`** | ✅ 与 §0-4 第 10 行 / §10-2 第 1 行 / §12-3 **同值（未变）** ⇒ ⚠️ **（2026-09-20 §15 追补：该读数已过期 —— 现 md5 `c9112e40760839bc8d2132d6300b838b` / mtime 2026-09-20 11:31:21；取代者 §15-5）** |
| 字节 / mtime | **9,572 B** / **2026-09-20 10:59:23** | 同上 |
| `origin_code` 非空 | **8 / 17** | ✅ 与 §0-4 第 11 行同值；`docs/geo-origin.spec.md` §13-12-2 的「7 / 17」**已由该册 §13-13-3 更新为 8 / 17**，两册现一致 |
| 新增条目 | `li_26446_01` = **`230305`** / `origin` = **`黑龙江省鸡西市梨树区`** | **写入主体已认领 = Kevin 亲手写入** ⇒ **§11 第 1 条闭合** |
| 17 棵树 JSON md5 | **与 §10-3 全表逐条一致**（17/17 命中，含 `zhonghua` = `de776b5ae129d1b2d87cdc28f44c0106` / 89,683 B） | ⇒ 存量树 JSON 自本册成文起 **零写入**（§10-3 基线仍有效） |
| `founder_handle` 台账 | 非空 **4** / 存在但空串 **2** / 缺失 **11** | ✅ 与 §7-3 / §12-3 同值 |

**复现命令**：

```bash
cd /Users/kevin/bistro/jiazu
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json; stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' config/tree-meta.json
python3 -c "import json;t=json.load(open('config/tree-meta.json'))['trees'];print(sum(1 for v in t.values() if v.get('origin_code')),'/',len(t))"
for f in migrate-output/trees/*.json; do echo "$(md5 -q $f) $(wc -c < $f | tr -d ' ') $(basename $f)"; done   # 对照 §10-3
```

### 14-2 迁移清单刷新：**13 待写 / 4 跳过**（按 10:59:23 真源重算 · **Zang 已核准** · 取代 §7-2） ⇒ ✅ **（2026-09-20 追补：已执行 —— 12 写入 + 1 幂等跳过（`shen_27784_01`）+ 4 跳过；取代者 §15-5）**

**与 §7-2 的唯一差异**：`li_26446_01` 由「跳过」**移入「待写」**（Zang 裁定取理解 (a)）；其余逐字不变。

**A. 待写入 13 棵**（`tree_id` → 被指定始祖节点）

| # | `tree_id` | 被指定节点 | 档 | 写入形状（按 §7-1 规则） |
|---|---|---|---|---|
| 1 | `gu_39038_01` | 顾清学 | 已登 `founder_handle` | 有码 `231281` → `{origin_code:'231281', note:''}` |
| 2 | `gu_39038`（祖谱） | 顾清学 | 已登 `founder_handle` | 无码、`origin` = `浙江绍兴` → `{origin_code:'', note:'浙江绍兴'}` |
| 3 | `ji_23395_01` | 季花 | 已登 `founder_handle` | 有码 `371325` |
| 4 | `ji_23395`（祖谱） | 季花 | 已登 `founder_handle` | 无码、`origin` = `山东临沂` → note |
| 5 | `liu_21016_01` | 刘芳池 I000258 | Kevin 点选 | 有码 `370000` |
| 6 | `shen_27784_01` | 沈克强 I000277 | Kevin 点选 | 有码 `371300` |
| 7 | `heng_24658_01` | 恒未知 I000363 | Kevin 点选 | 有码 `211300` |
| 8 | `ji_32426_01` | 纪未知 I000377 | Kevin 点选 | 有码 `230303` |
| 9 | `long_40857_01` | 龙未知 I000362 | Kevin 点选 | 无码、`origin` = `贵州` → note |
| 10 | `li_26446_02` | 李未知 I000373 | Kevin 点选 | 无码、`origin` = `山东` → note |
| 11 | **`li_26446_01`** | **李宝华**（handle `0904fea0e152aa12d89d9a63` / `I000356`） | **Zang 2026-09-20 裁定** | 有码 `230305` |
| 12 | `qin_31206`（祖谱） | 姬搢 I000289 | Kevin 点选 | 无码、`origin` = `山东临沂` → note |
| 13 | `zhonghua`（世本） | 风华胥 I0104 | Kevin 点选 | 无码、`origin` = `中华` → note |

- **`li_26446_01` 的始祖认定（实测复核）**：`founder_handle` **字段缺失** ⇒ 走「唯一非镜像根节点」兜底（§7-3 判据）；实测 `nonMirrorRoots()` = **1 个** ⇒ **李宝华**（该树 `people = 3`）。⚠️ 该节点现 `birth_place = ''` ⇒ 迁移**只会新增** `{origin_code:'230305', note:''}`，不覆盖任何既有内容。
- **`qin_31206_01` 的例外（勿误读）**：该树在 tree-meta 里**有码 `371323`**，但**空树（`people = 0`，文件 145 B）⇒ 无节点可写 ⇒ 仍按「跳过」**（「空树」判据优先于「有码」）。

**B. 跳过 4 棵**

| # | `tree_id` | 跳过理由 | 实测 |
|---|---|---|---|
| 1 | `qin_31206_01` | **空树** | `people = 0`（145 B）—— ⚠️ 与 tree-meta 是否有码无关 |
| 2 | `liu_21016` | `origin` 为空（且无码） | `origin = ''`、`origin_code` 字段缺失 |
| 3 | `rong_23481_01` | `origin` 为空 | 同 |
| 4 | `li_26446_03` | `origin` 为空 | 同 |

**写入规则（照登 · 与 §7-1 同口径）**：有码 → `{origin_code: 码, note: ''}`；**无码且 `origin` 非空** → `{origin_code: '', note: <`origin` 原文本>}`；**两者均空** → **不动**。

**执行纪律（照登）**：**默认 dry-run**（不加 `--apply` 不写盘）；**`--apply` 前先备份**；**幂等**（重复执行结果一致）。

**自检（复核结果）**：按上表规则重算 = **`origin_code` 非空 8 + 无码但 `origin` 非空 6 = 14**，其中 **1 棵为空树（`qin_31206_01`）⇒ 待写 13**；**两者均空 = 3 ⇒ 加空树 = 跳过 4**。**与 Zang 核准的 13 / 4 一致。**

```bash
python3 -c "
import json
t=json.load(open('config/tree-meta.json'))['trees']
w=s=[]
for k,v in t.items():
    c=str(v.get('origin_code') or '').strip(); o=str(v.get('origin') or '').strip()
    print(k, c or '(空)', o or '(空)')"
```

### 14-3 逐字文案登记（**实现已落地 · 逐字引用 · 实测锚点**）

| 场景 | HTTP | 逐字文案 | 实测锚点 |
|---|---|---|---|
| 居住地上限（C10） | 400 | `居住地最多 9 条` | `lib/person-places.js:23`（`RESIDENCE_LIMIT_MESSAGE`）/ 抛出在 `:50-57` |
| 无效请求（**文案已扩**） | 400 | `请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）` | `index.js:2566` |
| `set-tree-origin`：meta 无该树 | 404 | `未找到 tree: <tree_id>` | `index.js:512` |
| `set-tree-origin`：树 JSON 缺失 | 404 | `树不存在: <tree_id>` | `index.js:514` |
| `set-tree-origin`：节点不属于本树 | 400 | `该节点不属于本树` | `index.js:516` |
| 始祖无法认定（0 个非镜像根） | 400 | `本树无法认定始祖：未登记始祖，且树内没有非镜像根节点` | `lib/founder-attach.js:191` |
| 始祖无法认定（多个非镜像根） | 400 | `本树无法认定始祖：未登记始祖，且非镜像根节点有 N 个`（N = 实测非镜像根数） | `lib/founder-attach.js:192` |
| 节点不在始祖三代内 | 400 | `该节点不在本树始祖三代范围内（仅始祖及其下两代可作为发源地）` | `index.js:520` |
| 节点出生地无码 | 400 | `该节点未填写出生地行政区划代码` | `index.js:522` |
| 未登录 / 登录已过期 | 401 | `未登录或登录已过期` | `index.js:504` |
| 权限不足 | 403 | `需要总编辑权限` | `index.js:506` |
| **R1：未知码** | 400 | `出生地行政区划代码无效：<码>` | `lib/person-places.js:113-115`（`unknownOriginCodeMessage`） |

- ⚠️ **两串并存（登记为有意为之 · 不得统一）**：`PUT /tree-meta`（`index.js:477`）、`lib/tree-write.js:964`、`lib/clan.js:599` 用**「发源地」**串 `发源地行政区划代码无效：<码>`；**人物写路径（R1）与 `set-tree-origin` ④′ 用「出生地」串**（`index.js:528` 走 `unknownOriginCodeMessage`）。**同一裁定、两处措辞不同**，本册照登、不评价。

### 14-4 R1 / R2（**Zang 新裁定 · 逐字 + 落地实测**）

#### 14-4-1 R1：非空 `origin_code` 必须是已登记码

- **裁定（逐字）**：人物写路径与 `set-tree-origin` 对**非空 `origin_code` 必须校验已知码**；未知码 → **400**，文案逐字 = `出生地行政区划代码无效：<码>`；**`residence_places` 每一条同判**。
- **落地（实测 · 已落盘）**：
  - `lib/person-places.js:126-144` `assertKnownOriginCodes(body)`：覆盖 `birth_place` 与 `residence_places[]` **每一条**；**空码 = 合法「未结构化」，一律放行**（历史字符串归一后无码 ⇒ 放行）；未知码 → `error.status = 400`。
  - 人物写路径接线：`index.js:2558-2562`（**位置在 C6 始祖放行与 `hasPersonChanges` 之前、扣费之前**）。
  - `set-tree-origin` 接线：**④′** `index.js:526-528`（在 ④「必须非空码」之后，**先于 `saveMeta`**）。
  - 引入点：`index.js:67`（`assertKnownOriginCodes`）/ `index.js:73`（`unknownOriginCodeMessage`）。
- **目的（逐字照登）**：脏码不得从**节点**渗进树（进而被 C8′ 镜像进 tree-meta），与 `PUT /tree-meta` 同闸门。
- ⚠️ **测试覆盖 = 0（实测）**：`*.test.js` 全量 `grep` `assertKnownOriginCodes` / `unknownOriginCodeMessage` / `出生地行政区划代码无效` ⇒ **0 命中** ⇒ **R1 当前零测试覆盖**（§9-1 假绿风险延续，见 §14-7）。

#### 14-4-2 R2：候选接口全列（含无码），**前端置灰**

- **裁定（逐字）**：候选接口**全列**（含无码节点，`birth_place.place == ''` 且 `place_code == ''`），由**前端置灰**；事后 400 由 `set-tree-origin` 负责。
- **落地（实测 · 接口已落盘）**：`index.js:2631-2658` 的 `candidates` **不对 `place_code` 做过滤**（仅按节点可见性 `isHiddenPerson` 过滤；始祖识别失败 ⇒ `founder: null` / `candidates: []`，**不是 400**）；每项返回 `birth_place`（`{place, place_code, place_note}` 归一视图）+ `is_current` ⇒ 前端据 `place_code === ''` 置灰。
- ⚠️ **未落盘部分（实测）**：**「由前端置灰」的 UI 未落** —— `grep -rn 'origin-candidates' frontend/src` = **0 命中** ⇒ 仍为前端待办（D10，§12-4）。
- ⚠️ **上式读数为本节较早时点**；**同日稍后复核已翻转** —— `frontend/src/components/origin-picker/origin-picker.vue`（**9,118 B / mtime 2026-09-20 11:29:19**）已落盘，「**无码节点置灰不可选**」已实现 ⇒ **R2 的前端侧已闭合**；逐条实测见 **§14-8**。

### 14-5 Zang 追认四条口径（**定稿 · 逐条登记**）

| # | 口径（定稿） | 落地锚点（实测） | 对应旧行 |
|---|---|---|---|
| 1 | `residence_places` **缺失 / 非数组 ⇒ 读侧一律 `[]` 兜底**（C3 的延伸） | `lib/person-places.js:44-47`（`normalizeResidencePlaces`：非数组 → `[]`）；读响应 `index.js:199`（`residenceViewOf`） | §11 第 6 条 **闭合** |
| 2 | C6 的 place-only 放行**同时作用于路由层与写路径内层镜像锁**（**同一判据**，避免「路由放行、写路径 403」的洞） | **两处同用 `isPlaceFieldsOnly(body)`**：路由层 `index.js:2564` 传第 5 参 → `lib/founder-attach.js:275`；**写路径内层镜像锁** `lib/tree-write.js:178`（`if (lock && !isPlaceFieldsOnly(body))`）；判据本体 `lib/person-places.js:150`（**只有一份**） | 补 §12-1（C6 项） |
| 3 | `profile.birth` 的输出条件由「**有生年**」**放宽为「有生年 或 有出生地内容」**（否则只填出生地、生年不详的节点**存了读不回来**，前端保存时会把出生地写空） | `index.js:201-210`：门控 = `person.birth_date \|\| hasPlaceContent(person.birth_place)`；`hasPlaceContent` = `lib/person-places.js:60` | §0-4 第 1 行 / §12-1 **闭合（本行为定稿依据）** |
| 4 | 前端**空条目（无码也无备注）一律丢弃且不计入 9 条上限**；**服务端裁剪口径不变**；**前端不额外做在世脱敏** | 前端：`frontend/src/business/place.ts:61-64`（`prunePlaces` 以 `isBlankPlace` 丢弃空条目）、`:67-73`（`placesDirty` 两侧**先 prune 再比**）；提交装配 `person-archive.vue:2070`（`prunePlaces(editForm…)`）；**脱敏：前端不新增任何在世脱敏**、服务端 C7 裁剪口径不变 | §11 第 7 条 **闭合** |

- ⚠️ **口径 4 的一处实现边界（实测登记 · 未裁定）**：**添加按钮的门控按「原始行数」计** —— `person-archive.vue:2005` `residenceFull = editForm.value.residence_places.length >= MAX_RESIDENCE_PLACES`（**未先 `prunePlaces`**）⇒ 若表单里存在**空行**，满 9 **原始行**即禁用「＋ 添加居住地」，与「空条目不**计入** 9 条上限」的字面**尚未完全对齐**（**提交前 prune** 已对齐，故**不影响落库结果**，仅 UI 门控偏保守）。**本册只登记，不自行裁定**（归属 Kong / 前端）。

### 14-6 历史 `birth_place` 字符串的处理口径（**不做强制形状迁移**）

**实测存量面（只读复现）**：树 JSON 中 `birth_place` 为**非空字符串**的共 **17 处**：

| 树 | 处数 | 实测样例（该树实际取值） |
|---|---|---|
| `ji_23395_01` | **12** | `山东省费县` / `黑龙江省鸡西市梨树区河西村` … |
| `liu_21016_01` | **2** | `黑龙江省安达市` |
| `shen_27784_01` | **2** | `黑龙江省鸡西市梨树区` |
| `gu_39038_01` | **1** | `黑龙江省安达市` |

- **实测去重后共 6 个不同字符串**：`山东省费县` / `河北省秦皇岛市` / `秦皇岛市妇幼保健院` / `黑龙江省安达市` / `黑龙江省鸡西市梨树区` / `黑龙江省鸡西市梨树区河西村`。
- **口径（定稿 · 逐条）**：
  1. **不做强制形状迁移**（不批量改写这 17 处）。
  2. **读侧归一**：字符串 → `{ origin_code:'', note:<原串> }`（C3；`lib/person-places.js:37-40`）。
  3. **保存时懒转成对象**：该节点下次被保存时，归一后的对象形态随写路径落库（`lib/tree-write.js:198-199`）。
  4. **迁移脚本提供一个默认关闭的 `--normalize-birthplace-shape` 开关**（**默认不生效**；显式加上才批量转形）。
- ⚠️ **落盘状态（实测）**：`grep -rn 'normalize-birthplace-shape'`（全仓，除 `node_modules`）⇒ **0 命中** ⇒ **该开关尚未落盘**（现 `scripts/migrate-tree-origin.mjs` 的既有开关只有 `--apply` / `--include-auto` / `--geo`，且其写入对象是 **tree-meta**，**不写树 JSON 的 `birth_place`**）。

```bash
python3 -c "
import json,glob,os
vals={}
for p in sorted(glob.glob('migrate-output/trees/*.json')):
    d=json.load(open(p)); n=[h for h,v in d.get('people',{}).items() if isinstance(v,dict) and isinstance(v.get('birth_place'),str) and v['birth_place']]
    if n: print(os.path.basename(p),len(n))
    for h in n: vals[d['people'][h]['birth_place']]=1
print('TOTAL =',sum(1 for p in glob.glob('migrate-output/trees/*.json') for v in json.load(open(p)).get('people',{}).values() if isinstance(v,dict) and isinstance(v.get('birth_place'),str) and v['birth_place']))
print('DISTINCT =',len(vals), sorted(vals))"
```

### 14-7 落地状态复核（**本节读数的可复现入口**）

| 项 | 复核实测 | 判定 |
|---|---|---|
| 源码 `residence_places` / `place_note` 计数 | `index.js` = **3** / **3** | 已接线（较 §12-3 的 2 / 3 再 +1） |
| C8′ 两条路由 | `index.js`：`set-tree-origin` = **1**、`origin-candidates` = **2**（路由行 + 注释行） | ✅ **已落盘**（取代 §12-3「全仓 0 命中」） |
| `lib/person-places.js` | **154 行**（§12-1 记 118 行） | 已扩（新增 R1 的 `unknownOriginCodeMessage` / `assertKnownOriginCodes`） |
| 部署产物 | **998,338 B / mtime 2026-09-19 12:50 / md5 `d61a8aebfb3f3095baae4e1e731fd675`**；4 个判据串计数**全 0** | ❌ **未重打包**（硬阻塞延续） |
| 测试注册 | `scripts.test` 仍 **26** 项；`ls lib/*place*.test.js` 空；新文案 / R1 **零测试覆盖** | ⚠️ **假绿未闭合**（§9-1） ⇒ ✅ **（2026-09-20 §15 追补：已注册 —— 27 项 / 448 / 448 / 0；取代者 §15-4）** |
| 前端 C8′ UI | `grep -rn 'origin-candidates' frontend/src` = **0 命中** | ❌ 未落盘（D10） |
| 前端 C8′ UI（**同日 11:29 后复核**） | `origin-picker.vue` **已落盘**（9,118 B / mtime 2026-09-20 11:29:19）+ `api.ts` / `types.ts` / `hall/index.vue` | ✅ **已落盘**（上行为较早时点读数，**取代者 §14-8**） |
| `--normalize-birthplace-shape` | 全仓 **0 命中** | ❌ 未落盘（§14-6） |

```bash
cd /Users/kevin/bistro/jiazu
for f in cloudfunctions/compat-api/index.js cloudfunctions/deploy/compat-api/index.js; do
  echo "$f res=$(grep -c residence_places $f) pn=$(grep -c place_note $f) sto=$(grep -c set-tree-origin $f) oc=$(grep -c origin-candidates $f)"; done
md5 -q cloudfunctions/deploy/compat-api/index.js; wc -c < cloudfunctions/deploy/compat-api/index.js
wc -l cloudfunctions/compat-api/lib/person-places.js
python3 -c "import json;s=json.load(open('package.json'))['scripts']['test'];print(len([p for p in s.split() if p.endswith('.js')]))"
grep -rn 'assertKnownOriginCodes\|unknownOriginCodeMessage\|出生地行政区划代码无效' cloudfunctions/compat-api/lib/*.test.js
grep -rn 'normalize-birthplace-shape' . 2>/dev/null | grep -v node_modules
```

> **本节边界（逐条）**：本节**只写文档** —— **未改任何代码**、**未写真源**（`config/**` / `migrate-output/**` 零写入，`config/tree-meta.json` 前后 md5 均 `5817e4bb7f9fd461c11803e0df78a48a`）、**未改 `AGENTS.md`**（其工作区 md5 前后均 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行任何部署 / 打包 / 迁移**。
> 本节数值与行号均为**只读实测**（§14-1 / §14-3～§14-7）；**裁定与追认口径为逐字照登**（来源 = Zang）；**未实测项一律标「未落盘 / 待回填」，不推算。**

---

### 14-8 追补三（同日稍后复核）：**C8′ 前端 UI 落盘 —— R2 的前端侧闭合**（2026-09-20 · 只读实测）

> **缘起**：§14-4-2 / §14-7 的「前端 C8′ UI 未落（0 命中）」为**同轮较早时点**读数；复核时该文件**已在两轮 `git status` 之间落盘**（与 §12 所述「Kong 并发落地」同一现象）。**本节取代上述两处的该条读数，历史行原文保留。**

| 项 | 实测 |
|---|---|
| 新组件 | **`frontend/src/components/origin-picker/origin-picker.vue`** —— **9,118 B** / mtime **2026-09-20 11:29:19** |
| 接口接线 | `frontend/src/business/api.ts:1931`（`GET /tree/origin-candidates`）/ `:1954`（`POST /admin/set-tree-origin`） |
| 类型 | `frontend/src/business/types.ts:280-314`（候选节点 / 候选读响应 / 指定出参） |
| 入口挂载 | `frontend/src/pages/hall/index.vue`（`git diff --stat` = **+19 / −5**） |
| **R2「由前端置灰」的落地** | **已实现**：判据 = **`birth_place.place_code` 非空** —— `origin-picker.vue:40`（行样式 `op-row-off`）/ `:50`（`op-place-off`）/ `:53`（无码行**逐行提示**）/ `:127`（缺字段兜底空形状）/ **`:149-151`（点选拦截：`if (!c?.birth_place?.place_code …) return;`）** ⇒ **与后端 400（`该节点未填写出生地行政区划代码`）同判据** |
| §14-4-2 的裁定一致性 | ✅ **R2 全项闭合**：接口**全列**（`index.js:2631-2658` 不做 `place_code` 过滤）+ 前端**据码置灰**（本节），**事后 400 仍由 `set-tree-origin` 负责** |
| 部署产物 | **仍未重打包**：`998,338 B` / mtime **2026-09-19 12:50** / md5 **`d61a8aebfb3f3095baae4e1e731fd675`**；4 个判据串计数仍 **全 0** |
| 测试注册 | `scripts.test` 仍 **26** 项（**未新增**）⇒ 前端新组件与 R1 **仍无测试覆盖** ⇒ ✅ **（2026-09-20 §15 追补：`scripts.test` 27 项 / `npm test` 448 / 448 / 0 —— 只注册了后端 `lib/person-places.test.js`，**前端新组件仍无测试覆盖**；取代者 §15-4）** |

```bash
cd /Users/kevin/bistro/jiazu
grep -rn 'origin-candidates\|set-tree-origin' frontend/src
ls -l frontend/src/components/origin-picker/
git diff --stat frontend/src/pages/hall/index.vue
md5 -q cloudfunctions/deploy/compat-api/index.js; for s in residence_places place_note set-tree-origin origin-candidates; do echo "$s=$(grep -c $s cloudfunctions/deploy/compat-api/index.js)"; done
```

> **边界**：本节亦为**只读追加** —— **未改代码、未写真源**（`config/tree-meta.json` md5 前后均 `5817e4bb7f9fd461c11803e0df78a48a`）、**未改 `AGENTS.md`**、**未执行部署 / 打包 / 迁移**。

---

> **本册边界（逐条）**：本册**只写文档** —— **未改任何代码**（`lib/**`、`cloudfunctions/**`、`frontend/**`、`scripts/**` 均零改动；其中的 dirty 项均为 **Kong 并发落地**所致，非本册）、**未写真源**（`config/**`、`migrate-output/**` 零写入）、**未改 `AGENTS.md`**（§13 仅为拟稿）、**未执行任何部署 / 打包 / 迁移动作**。
> 本册的**所有数值与行号**均为**只读实测**（§0–§11 = 成文时点；**§12 = 2026-09-20 11:21 CST 落地快照**），逐条附复现命令；**未实测的值一律留「待填」**。

---

## 15. 追补四：**后端两缺陷已修（RED→GREEN 实测）+ 新增 2 条 400 文案 + 三支保留 403 文案 + 判据收敛函数 `personEditLockMessage` + 测试基线刷新 + C9 迁移执行结果 + 前端 F3**（2026-09-20 12:06 CST · Jing 制度员台账追补 · **取代 §0-4 第 10 行 / §9-1 / §10-2 / §11-18 / §13-3 / §14-1 / §14-2 / §14-7 / §14-8 的相应行**）

> **性质**：本节为**台账追补**（**只追加**）—— **未改任何代码**、**未写真源**（`config/**` / `migrate-output/**` 零写入；`config/tree-meta.json` md5 本节前后均 `c9112e40760839bc8d2132d6300b838b`）、**未改 `AGENTS.md`**（工作区状态开工前 = 收工后 = `M AGENTS.md`，md5 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行部署 / 打包 / 迁移**。
> §0–§14 历史行**一律原文保留**；凡被本节取代 / 闭合者**只在原行行尾追加标注**（不删不改）。
> **时点**：`date` = **2026-09-20 12:06:44 CST**；本节**所有行号与数值均为本次实测**（口径 = 工作区当前代码）。
> ⚠️ **行号漂移提示（必读）**：本批修复向源码**追加了行** —— `lib/person-places.js` 196 行 / `lib/founder-attach.js` 787 行 / `lib/tree-write.js` 2,437 行 / `frontend/src/components/person-archive/person-archive.vue` **2,531 行** ⇒ **§12 / §14 中的部分行号（尤其前端）已失效**；旧行保留原样，**以本节行号为准**。

### 15-1 后端两缺陷（**已修 · 带 RED→GREEN 证据**）

**RED 证据的两个来源**：① **修复前实测台账**（§11-4/§11-18 的假绿状态；质检册 §B7 / §B13）；② **本节在 `/tmp` 副本上还原旧口径后重跑新测试得到的 RED**（仓内代码零改动；命令见 §15-8）。

#### 15-1-1 缺陷 A：非法入参**静默清空 + 照常扣费**

| 项 | 旧口径（RED） | 新口径（GREEN） |
|---|---|---|
| `PUT /people/<handle>` 的 `residence_places` = **非数组**（字符串 / 对象 / 数字 / 布尔） | **200 + 扣 1 片 + 原值被静默清成 `[]`** | **400 `居住地格式无效，应为数组`** —— **先于扣费与落盘，原值不变** |
| `PUT /people/<handle>` 的 `birth_place` = **非对象**（字符串 / 数字 / 数组 / 布尔） | **200 + 扣 1 片 + 归一为 `{origin_code:'', note:<原串>}`**（口径变更：旧行为即「静默改写」） | **400 `出生地格式无效，应为对象`** —— **先于扣费与落盘，原值不变** |
| 未提供（`undefined` / `null`） | 等同「不改写」 | **不变**（仍放行，等同不改写） |

- **RED 证据（修复前实测 · 逐字引用）**：质检册 §B13 —— `residence_places` 传 `"not-an-array"` 实测 `200`、**扣 1 片**、落库被归一为 `[]`（**原 2 条被清空**），判据行 = 修复前 `lib/person-places.js:46-49`（非数组 → `[]`），判定 = **观察 O3**。
- **RED 复现（本节实测）**：在 `/tmp/jing-rg` 副本上还原旧口径后，测试 `C1′/C2′ 形状闸门：…` **FAIL**，`AssertionError: 被拒请求不得产生任何资产流水`（`expected 1 / actual 19`，`person-places.test.js:762`）⇒ 旧口径下**被拒请求确实扣费并产生流水**。
- **GREEN 判据锚点（实测）**：
  - 形状闸门本体：`lib/person-places.js:92-101`（`assertPlaceFieldShapes(body)`）；`:78`（`isBirthPlaceShape` = 非空对象且非数组）；
  - 抛出：非数组 `residence_places` → `:94-96`（`throw shapeError(RESIDENCE_SHAPE_MESSAGE)` **`:95`**）；非对象 `birth_place` → `:97-99`（**`:98`**）；文案常量 `:31` / `:34`；
  - 接线（**唯一调用点**）：`index.js:2555`，位于 `:2550` `getTree` 之后、`:2561` 条数上限 / `:2568` R1 码校验 / `:2576` 只读预检 / **`:2599` `chargeBamboo`** 之前 ⇒ **400 不扣费、不写树、不动原值**。
  - 设计理由（源码注释照登）：归一化只是**读侧**容错，拿它当**写侧清洗**会把原居住地 / 出生地码静默抹掉还收 1 片。
- **GREEN 证据（本节实测）**：同一测试在**工作区当前代码**上 **PASS**；全量 `npm test` = **448 / 448 / 0**。

#### 15-1-2 缺陷 B：祖谱镜像锁**扣费之后才拦**

| 项 | 旧口径（RED） | 新口径（GREEN） |
|---|---|---|
| 对**祖谱镜像**节点夹带锁字段（如 `primary_name`） | **403 + `fee_refunded:true`**；资产流水出现**成对** `edit_fee -1` / `fee_refund +1` | **403 拦在扣费前**：**流水零新增、响应无 `fee_refunded`** |

- **RED 证据（修复前实测 · 逐字引用）**：质检册 §B7 —— 响应逐字 `403 {"error":"始祖节点信息需在本姓祖谱中修改","fee_refunded":true}`；竹片 `783→783`（净零）；流水出现成对 `edit_fee -1` + `fee_refund +1`（判定 **PASS（带观察 F2）**）。
- **RED 复现（本节实测）**：副本还原旧口径（路由层预检只查始祖锁、不传 `body`）后，测试 `只读预检先于扣费：…` **FAIL**，`AssertionError: 祖谱镜像（上层 = 祖谱）：预检拦在扣费之前 → 不得出现 fee_refunded`（`expected false / actual true`）。
- **修法（登记·逐字）**：判据**收敛为单一函数** `personEditLockMessage`（见 §15-3），**路由层 `assertFounderEditable` 与写路径 `lib/tree-write.js updatePerson` 共用同一函数**，覆盖**本树始祖镜像 / 空白占位 / 祖谱镜像 / 世本镜像 / chain 镜像**全部分支。
- **GREEN 判据锚点（实测）**：
  - 路由层预检：`index.js:2576`（**在 `:2599` `chargeBamboo` 之前**，传第 5 参 `body`）；其他调用点 `index.js:1154` / `:1933` / `:1971`（无 body 参数 ⇒ 一律按只读断言，行为不变）；
  - 写路径：`lib/tree-write.js:163`（`updatePerson`）→ `:181`（`await personEditLockMessage(...)`）→ `:182`（`if (lock && !isPlaceFieldsOnly(body))` → 403）；import 于 `:27`；
  - 判据本体：`lib/founder-attach.js:272-279`（见 §15-3）。
- **GREEN 证据（本节实测）**：测试 `person-places.test.js:803-880` 逐支断言「403 文案正确 + 无 `fee_refunded` + 树未写 + 资产流水零新增 + 余额不变」，工作区当前代码 **PASS**。

### 15-2 逐字文案登记（**新增 2 条 · 保留 3 支 403 · 空白占位 1 条**）

| 逐字文案 | HTTP | 触发场景 | 实测锚点（当前工作区） | 状态 |
|---|---|---|---|---|
| `居住地格式无效，应为数组` | **400** | `residence_places` 显式提供但非数组（缺陷 A） | `lib/person-places.js:31`（常量 `RESIDENCE_SHAPE_MESSAGE`）/ `:95`（抛出）/ `index.js:2555`（接线） | 🆕 **新增** |
| `出生地格式无效，应为对象` | **400** | `birth_place` 显式提供但非对象（缺陷 A） | `lib/person-places.js:34`（`BIRTH_PLACE_SHAPE_MESSAGE`）/ `:98`（抛出）/ `index.js:2555`（接线） | 🆕 **新增** |
| `始祖节点信息需在本姓祖谱中修改` | **403** | 上层 = **本姓祖谱**（founder 镜像） | `lib/founder-attach.js:42`（`CLAN_FOUNDER_LOCK_MESSAGE`）；分支判据 `:122` | **保留 · 不得与另两支合并** |
| `始祖节点信息需在中华世本（总谱）中修改` | **403** | 上层 = **中华世本**（founder 镜像） | `lib/founder-attach.js:40`（`MIRROR_LOCK_MESSAGE`） | **保留 · 不得与另两支合并** |
| `该节点为上层（中华世本）镜像，需到总谱修改` | **403** | **chain 镜像**分支（祖谱顶端链等） | `lib/founder-attach.js:44`（`CHAIN_MIRROR_LOCK_MESSAGE`） | **保留 · 不得与另两支合并** |
| `空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息` | **403** | `isPlaceholderFounder` 为真（既有口径） | `lib/founder-attach.js:46`（`PLACEHOLDER_LOCK_MESSAGE`）；分支判据 `:122` | 保留（既有） |

> **硬纪律（登记）**：**三支 403 文案逐字不同、各自对应不同上层镜像是非合并项**；测试 `person-places.test.js:855-857` 已把三条串**逐字冻结**（`assert.equal`）⇒ 任何合并 / 改写措辞会立刻红。既有 400 / 403 / 401 / 404 其余文案见 §14-3（本批未变）。

### 15-3 判据收敛函数 `personEditLockMessage`（**路由与写路径的唯一判据**）

| 项 | 实测 |
|---|---|
| 定义 | `lib/founder-attach.js:272-279`（`export async function personEditLockMessage(person, tree, masterTreeId, entry = null)`） |
| 优先级（登记·逐字） | ① **上层镜像优先** —— `:277` `upperMirrorLockMessage(person, tree.tree_id)`（chain 镜像 / founder 镜像指向祖谱或世本）；② **其后才是始祖锁** —— `:278` `founderLockMessage(person, tree, masterTreeId, entry)`（本树始祖镜像 / 空白占位）；中华世本树自身 `:275` 恒返回 `''`（可编辑） |
| 覆盖分支 | 本树始祖镜像 / 空白占位 / 祖谱镜像 / 世本镜像 / chain 镜像（测试 `person-places.test.js:803-880` 逐支断言 + `:872-877` 在 lib 层直调同判 + `:878-880` 写路径 `tw.updatePerson` 同判） |
| 共用点 ①（路由预检） | `lib/founder-attach.js:292-301` `assertFounderEditable(...)`（`:297` 调 `personEditLockMessage`）；调用 `index.js:2576`（**带 body**，C6 例外生效）/ `:1154` / `:1933` / `:1971`（**不带 body**，一律只读） |
| 共用点 ②（写路径） | `lib/tree-write.js:181` → `:182`（**与路由同一函数**，消灭「路由放行、写路径 403」的洞） |
| C6 例外（不变） | 请求体**只**含 `birth_place` / `residence_places` → 放行；**夹带任一锁字段照旧 403**；判据 `isPlaceFieldsOnly`（`lib/person-places.js:192`）在**两处同用**（`lib/founder-attach.js:298` / `lib/tree-write.js:182`） ⇒ **§14-5 第 2 条的收敛结论本批保持成立** |
| 为何必须同一函数（源码注释照登） | 两条判据此前**分别**落在路由层（只查 `founderLockMessage`）与写路径（再并上 `upperMirrorLockMessage`）⇒ 祖谱镜像 / chain 镜像节点**在路由预检漏放**，走到**扣费之后**才 403，响应带 `fee_refunded` 且流水出现成对 `edit_fee -1` + `fee_refund +1`（= 缺陷 B） |

### 15-4 测试基线刷新（**取代 §9-1 / §11-18 / §13-3 / §14-7 / §14-8 的旧值**）

| 项 | 旧值（册内历史行） | **新值（本节实测）** |
|---|---|---|
| `scripts.test` 注册测试文件数 | **26** | **27**（新增 `cloudfunctions/compat-api/lib/person-places.test.js`；注册位置 = `package.json:10` 的**末项**） |
| 全量 `npm test` | **431 / 431 / 0** | **446 → 448 / 448 / 0**（`fail 0` / `cancelled 0` / `skipped 0` / `todo 0`；`duration_ms` ≈ 2,273.7） ⇒ ✅ **（2026-09-20 §16 末次追补：终稿 = **27 项 / 449 / 449 / 0**（`fail 0` / `cancelled 0` / `skipped 0` / `todo 0`）；取代者 §16-4）** |
| 本批新增单测 | — | **2 条**（= 后端两缺陷）：`lib/person-places.test.js:729`（缺陷 A）/ `:803`（缺陷 B） |
| 假绿判定（§9-1） | ⚠️ **假绿未闭合**（新文案 / R1 零覆盖） | ✅ **已闭合**：新 400 文案、R1（未知码）、只读预检先于扣费**均有注册测试**；⚠️ **前端新组件（`origin-picker`）仍无测试覆盖**（只注册了后端） |
| 复现 | `python3 -c` 计 `scripts.test` 项数；`npm test` | 同 §15-8 |

### 15-5 C9 迁移执行结果（**取代 §14-2 的「待执行清单」**）

| 项 | 实测（本节） |
|---|---|
| 执行结果 | **12 棵写入** + **1 棵幂等跳过**（`shen_27784_01`）+ **4 棵跳过**（`qin_31206_01` 空树、`liu_21016`、`rong_23481_01`、`li_26446_03`） |
| 复核方式（本节重算） | 备份 `md5-before.txt` vs 真源逐棵比对 ⇒ **12 棵已变 / 5 棵未变**（5 = 1 幂等 + 4 跳过，17 棵全对上） |
| 备份目录 | `~/jiazu-backups/2026-09-20-founder-birthplace/`（`md5-before.txt` 1,015 B + `tree-meta.json` + `trees/`；目录 mtime **2026-09-20 11:36**） |
| 映射表 | `scripts/founder-map.json` —— **13 条**（`tree_id → {gramps_id, handle}`，`gramps_id → handle` 已校验） |
| `config/tree-meta.json` | **迁移全程未变**：备份内副本 md5 = 当前真源 md5 = **`c9112e40760839bc8d2132d6300b838b`**（9,572 B / mtime **2026-09-20 11:31:21** / `origin_code` 非空 **8 / 17**）⇒ 与 **C8 作废（无任何镜像回写）** 的口径一致 |
| ⚠️ 与旧行的关系 | §14-1 第 1 行记 `5817e4bb…` / mtime `10:59:23` 为**更早时点**读数 ⇒ 已被本节取代（该行已加行尾标注） |
| 未决（**不得当已定案**） | `shen_27784_01` 见 §15-6 | ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**
| 未部署 | 迁移写入的是**本地真源** `migrate-output/**`；**部署产物未重打包**（`cloudfunctions/deploy/compat-api/index.js` = 998,338 B / md5 `d61a8aebfb3f3095baae4e1e731fd675`，与 §14-7 / 质检册 §0-1 同值）；云端部署动作面归 `docs/PENDING_DEPLOY.md`（**本册本节不改该册**） |

### 15-6 待 Kevin 裁定项（**未决 · 登记为未决，本册不改口径**） ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**

- **事项**：`shen_27784_01` 的真源 `origin_code = 230305`（= **黑龙江省鸡西市梨树区**）与其 `origin` 文本 = **山东省临沂市** **互斥**；且该树无 `founder_handle`（实测 `None`）。
- **实测（本节）**：该树始祖 **`沈克强`**（`I000277` / handle `103f95b8762b433c7159c8ea1006`）的 `birth_place` **在迁移前（11:36 备份内）就已是** `{origin_code:'230305', note:''}` ⇒ 迁移判**幂等跳过**（未写）。
- **口径修正（登记 · 只登记事实）**：「**13 棵已写入**」应读作「**12 棵由本次迁移写入 + 1 棵（`shen_27784_01`）迁移前已就位**」。
- **旧清单冲突（不改，留痕）**：§14-2 第 6 行按旧清单记 `371300`，与真源 `230305` **不一致**（质检册 §A8 记 **FAIL（见 F1）**）。
- **裁定人 = Kevin**；本册**只登记、不自行裁定**（`§11` 未决体例一致）。裁定前，映射表 / 验收计数的口径**不得**按任一解释对外引用。 ⇒ ✅ **（2026-09-20 §16 末次追补：至末轮仍**未决** —— 84 判据中的**唯一 FAIL**；口径见 §16-5）** ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**

### 15-7 前端缺陷 F3（**已定位 / 修复已落盘 / 待复验 —— 不得记为「已修复」**）

- **症状**：人物档案面板里**只改【出生地】**或**只新增 1 条【居住地】**→ 保存提示「未做修改」、**不发 PUT**（主用例静默不落库）。
- **根因（已定位）**：`editBaseline.value = { ...editForm.value }` 是**浅拷贝**，而表单写入一律**原地赋值** ⇒ 基线与表单共享同一批子对象引用、被连带改写 ⇒ 脏比对（`placesDirty`）恒判「无改动」。定位时点行号 = `person-archive.vue:1992-1994`；质检册 §C1b / §C1c 附**页面内组件态探针**两次复现 `refProbe = { sameBirthPlaceRef:true, sameResidenceArrayRef:true }`，并有对照组（C1d「只改名能存」）排除伪 FAIL。
- **修复落盘（本节实测 · 工作区，未提交）**：`git diff` 实测 `- editBaseline.value = { ...editForm.value };` → `+ editBaseline.value = cloneFormDeep(editForm.value);`（现 **`:2011`**）；新增深拷贝 `cloneFormDeep`（**`:1639-1652`**，保留 `undefined` 键、不依赖 `structuredClone`）+ 脏比对新增两条 `placesDirty`（**`:1622-1623`**）+ 解释性注释（**`:1626-1637`**）。文件现 **2,531 行**。
- **状态登记（逐字）**：**已定位 / 修复已落盘（工作区，未提交）/ 待复验** —— **本册不写「已修复」**；页面级 C1b / C1c 尚未复跑（复验装置见质检册 §C）。 ⇒ ✅ **（2026-09-20 §16 末次追补：F3 已修 · 末轮复验 **4/4 PASS**（质检册 P1-a ～ P1-d）；状态改读作「已修」，取代者 §16-1）**
- **行号漂移（复验须重取）**：质检册 §C1b 的 `person-archive.vue:2076-2078`、§C2 的 `:2012-2020` / `:412-428` 均为**修复前**行号（该文件已 +133 / −6 行）⇒ 复验时以现状行号为准。

```bash
cd /Users/kevin/bistro/jiazu
git diff --unified=0 frontend/src/components/person-archive/person-archive.vue | grep -n 'editBaseline\|cloneFormDeep'
grep -n 'function cloneFormDeep\|editBaseline.value = cloneFormDeep' frontend/src/components/person-archive/person-archive.vue
wc -l frontend/src/components/person-archive/person-archive.vue
```

### 15-8 复现命令（本节全部读数的可复现入口）

```bash
cd /Users/kevin/bistro/jiazu
# ① 真源读数（本节时点）
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json; stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' config/tree-meta.json
python3 -c "import json;t=json.load(open('config/tree-meta.json'))['trees'];print(sum(1 for v in t.values() if str(v.get('origin_code') or '').strip()),'/',len(t))"
# ② 测试基线（本节实测：27 项 / 448 / 448 / 0） —— 【§16 末次追补：终稿 = 27 项 / 449 / 449 / 0】
python3 -c "import json;s=json.load(open('package.json'))['scripts']['test'];print(len([p for p in s.split() if p.endswith('.js')]))"
npm test | tail -6
# ③ GREEN（两条后端缺陷测试，在工作区代码上）
node --test --test-name-pattern='形状闸门|只读预检先于扣费' cloudfunctions/compat-api/lib/person-places.test.js
# ④ RED 复现（/tmp 副本还原旧口径；仓内代码零改动）
rm -rf /tmp/jing-rg && mkdir -p /tmp/jing-rg/cloudfunctions
cp -R cloudfunctions/compat-api /tmp/jing-rg/cloudfunctions/
ln -s /Users/kevin/bistro/jiazu/node_modules /tmp/jing-rg/node_modules
ln -s /Users/kevin/bistro/jiazu/config /tmp/jing-rg/config
ln -s /Users/kevin/bistro/jiazu/migrate-output /tmp/jing-rg/migrate-output
#    副本内两处还原旧口径：① 删除 index.js 里 assertPlaceFieldShapes(body) 的 try/catch 块；
#                            ② 路由预检调用改回不带第 5 参 body，assertFounderEditable 内判据退回 founderLockMessage
cd /tmp/jing-rg && node --test --test-name-pattern='形状闸门|只读预检先于扣费' cloudfunctions/compat-api/lib/person-places.test.js
#    → not ok（2 条 FAIL，RED；逐字报错见 §15-1）
# ⑤ 迁移执行结果复核（12 棵已变 / 5 棵未变；tree-meta 未变）
python3 -c "
import hashlib,os
b=os.path.expanduser('~/jiazu-backups/2026-09-20-founder-birthplace/md5-before.txt')
before={l.split()[-1]:l.split()[0] for l in open(b) if len(l.split())>=2}
chg=[]
for f,h in before.items():
    p=os.path.join('migrate-output',f)
    if os.path.exists(p) and hashlib.md5(open(p,'rb').read()).hexdigest()!=h: chg.append(f)
print('changed',len(chg)); print(sorted(chg))"
md5 -q ~/jiazu-backups/2026-09-20-founder-birthplace/tree-meta.json   # 与当前真源同值 ⇒ 迁移未写 tree-meta
python3 -c "import json;print(len(json.load(open('scripts/founder-map.json'))))"   # 13
# ⑥ 边界自查
git status --short AGENTS.md; md5 -q AGENTS.md
```

> **本节边界（逐条）**：本节**只写文档** —— **未改任何代码**（`cloudfunctions/**`、`frontend/**`、`scripts/**` 零改动；其中的 dirty 项均为此前并发落地所致，非本节）、**未写真源**（`config/**`、`migrate-output/**` 零写入；`config/tree-meta.json` md5 前后均 `c9112e40760839bc8d2132d6300b838b`）、**未改 `AGENTS.md`**（前后均 `M AGENTS.md` / md5 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行部署 / 打包 / 迁移**。
> 本节行号 / 数值全部**本次实测**（§15-8 可逐条复跑）；**RED 复现只在 `/tmp/jing-rg` 副本上进行**，仓内源码零改动；**未实测项（页面级 F3 复验）一律标「待复验」，不推算、不写结论**。

---

## 16. 末次台账追补：**5 缺陷 + 2 观察全部闭合 · 末轮复验 84 判据（81 PASS / 1 待裁定）· E3-x 裁定 · 逐字文案总表 · 测试基线 27 项 / 449 · 迁移执行记录与 md5 · 残留风险 · `AGENTS.md` 拟稿终稿**（Jing 制度员 · 2026-09-20 12:32:33 CST · **本批收尾 · 只追加**）

> **性质**：本节为**台账追补**（**只追加**）—— **未改任何代码**（`cloudfunctions/**` / `frontend/**` / `scripts/**` / `package.json` **零写入**；`git status` 中的 dirty 项均为此前并发落地所致，非本节）、**未写真源**（`config/**` / `migrate-output/**` 零写入；`config/tree-meta.json` md5 本节前后均 **`c9112e40760839bc8d2132d6300b838b`**；`migrate-output/**` 聚合本节前后均 **`684ceb0bd03d31ef9c08104e3eb6ac41`**）、**未改 `AGENTS.md`**（开工前 = 收工后 = `M AGENTS.md` / md5 **`e4c089818fbf7a3a7218e567e7b409ee`**）、**未执行部署 / 打包 / 迁移**。
> §0–§15 历史行**一律原文保留**；凡被本节取代者**只在原行行尾追加标注**（不删不改）。
> **时点**：`date` = **2026-09-20 12:32:33 CST**；本节**所有数值均为本次实测**（复现命令 = §16-9）。
> ⚠️ **行号再次漂移（必读）**：`frontend/src/components/person-archive/person-archive.vue` 现 **2,537 行**（§15-7 记 2,531 ⇒ **+6 行**）⇒ **前端复验一律以现状行号为准**；`lib/person-places.js` 仍 **196 行**（§15 同值）。

### 16-1 缺陷与观察闭合总表（**5 缺陷 + 2 观察 = 7 项，全部闭合**）

| # | 编号 | 症状（一句话） | 状态 | 末轮复验 / 证据位（实测锚点） |
|---|---|---|---|---|
| 1 | **缺陷 A** | `residence_places` 传非数组 → **200 + 扣 1 片 + 静默清空原值**（`birth_place` 非对象 → 同理被静默归一） | ✅ **已修** | 现 **400 `居住地格式无效，应为数组`** / **400 `出生地格式无效，应为对象`**，**先于扣费与落盘**（形状闸门 `lib/person-places.js:92` / 抛 `:95` `:98`；接线 `index.js:2555`，在 `:2599` `chargeBamboo` 之前） |
| 2 | **缺陷 B** | 祖谱镜像锁 403 **发生在扣费之后** ⇒ 流水成对 ±1 + 响应带 `fee_refunded` | ✅ **已修** | 判据收敛为单一函数 **`personEditLockMessage`**（路由预检 `index.js:2576` 在 `:2599` 扣费之前；写路径 `lib/tree-write.js` 同函数）⇒ **403 拦在扣费前：流水零新增、无 `fee_refunded`** |
| 3 | **缺陷 F3**（前端） | 只改出生地 / 只加 1 条居住地 → 提示「未做修改」、**根本不发 PUT** | ✅ **已修 · 末轮复验 4/4 PASS** | 浅拷贝 → 深拷贝：`cloneFormDeep` **`:1639-1652`**、基线赋值 **`:2011`**（`person-archive.vue`，2,537 行）；复验 = 质检册 **P1-a / P1-b / P1-c（负对照）/ P1-d（对照组）** 全 PASS |
| 4 | **缺陷 F5**（后端） | `birth_place` / `residence_places` 传显式 `null` → **同批带其他改动时静默清空并照收 1 片** | ✅ **已修 · 末轮复验 4/4 PASS** | 三处口径收敛为「**`null` 一律等同未提供**」（`tree-write.updatePerson` / `economy-fee.personValueDiff` / `hasPersonChanges`）；复验 = 质检册 **P1-e / P1-f / P1-g（核心：同批改名照收 1 片但地点字段不清空）/ P1-h（合法空值仍可清空）** 全 PASS |
| 5 | **缺陷 H**（早期） | 始祖「只改出生地」的放行路径曾把**始祖姓名抹成「未知」** | ✅ **已修** | 只在**显式提供 `primary_name`** 时才改写姓名 |
| 6 | **观察 O3** | 非数组入参被静默清空（缺陷 A 的观察态） | ✅ **已闭合** | 随缺陷 A 定案（现 = 400 + 不扣费）；留档行 = 质检册 §B13 |
| 7 | **观察 O4** | 9 条上限的**入口门控数空行**、拦截不数空行的**口径不一致** | ✅ **已修 · 末轮复验 3/3 PASS** | 门控改按「**丢弃空条目后条数**」判定：`residenceFull` = `prunePlaces(...).length >= MAX_RESIDENCE_PLACES`（`person-archive.vue:2033-2035`；常量 `business/place.ts:19` = `9`）；复验 = 质检册 **P1-i / P1-j / P1-k** 全 PASS |

- **合计**：**5 条缺陷（A / B / F3 / F5 / H）+ 2 条口径观察（O3 / O4）= 7 项，全部闭合，无未闭合缺陷**。
- **§15-7 的状态取代**：`F3` 原登记「**已定位 / 修复已落盘 / 待复验**」，**自本节起读作「已修（末轮复验 4/4 PASS）」**（该行已行尾标注）。
- **不得误记**：F3 的复验依赖**页面级真 UI 脚本**（一次性、不入仓）；**`npm test` 449 项不含任何前端用例**（见 §16-7 第 1 条），前端回归**只能**靠手工 / 脚本重跑。

### 16-2 E3-x 裁定：发源地「人工指定」= **一次性结果，不自动回落**（★ 本批口径，后续引用一律以此为准）

- **事项**：发源地指定后，若把**来源节点**的出生地码**清空**，`tree-meta` 的 `origin_code` **不自动回落**（`GET /tree/origin-candidates` 候选中**不再有 `is_current`**）。
- **裁定人 = Zang**；**裁定结论（逐字精神）**：**设计如此，非缺陷** —— **不登记为缺陷**。
- **依据（Kevin 口径）**：Kevin 已明确要求「**删掉自动同步镜像的代码逻辑**」⇒ **人工指定是一次性结果**：指定当时写入 `tree-meta`（+ 建树时同步写始祖 `birth_place`，C11），**来源节点此后被改动（含清空）不回落、不需要镜像对齐**；如发源地不再合适，**须由人重新指定**（再走一次 `POST /admin/set-tree-origin`）。
- **与 C8 作废的一致性**：C8「写时自动同步镜像」**已作废、代码已删** ⇒ `tree-meta` 的 `origin_code` / `origin` **只有两条显式写入路径**（`PUT /tree-meta` 人工填写、`POST /admin/set-tree-origin` 人工指定），**不存在任何自动写回**。
- **登记为「已知特性」而非风险**：不得据本节把「无自动回落」当缺陷上报；亦**不得**在任何册内写成「发源地在来源节点变更时自动同步」。
- **「发源地」`origin_code` 与节点 `birth_place.origin_code` 的关系**：**仅指定当时取值一次**，此后**各自独立**（节点改码不影响已指定的发源地）。

### 16-3 逐字文案总表（**本批新增 / 保留 · 逐字冻结 · 不得合并**）

**（1）后端 400（逐字照登 · 本批新增 / 扩写）**

| 逐字文案 | HTTP | 触发场景 | 实测锚点（本节） | 状态 |
|---|---|---|---|---|
| `居住地格式无效，应为数组` | **400** | `residence_places` 显式提供但**非数组**（缺陷 A） | 常量 `lib/person-places.js:31`；抛出 `:95`；接线 `index.js:2555` | 🆕 新增 |
| `出生地格式无效，应为对象` | **400** | `birth_place` 显式提供但**非对象**（缺陷 A） | 常量 `lib/person-places.js:34`；抛出 `:98`；接线 `index.js:2555` | 🆕 新增（口径变更：旧行为是**静默归一**） |
| `出生地行政区划代码无效：<码>` | **400** | 非空 `origin_code` **不在码表内**（R1；`residence_places` **逐条同判**） | 模板 `lib/person-places.js:155`（`unknownOriginCodeMessage`）；抛出 `:181` | 保留（R1） |
| `居住地最多 9 条` | **400** | 第 **10** 条居住地（服务端裁剪口径不变） | 常量 `lib/person-places.js:28`（`RESIDENCE_LIMIT_MESSAGE`）；抛出 `:63` | 保留 |
| `请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）` | **400** | 无可修改内容（含 `null` = 未提供 · 缺陷 F5 分支） | `index.js:2578` | 保留（本批**文案已扩**，括号内列出 7 类字段） |

**（2）前端 guard / 提示（逐字渲染值 · 模板插值 `MAX_RESIDENCE_PLACES` = `9`）**

| 逐字文案 | 出现条件 | 实测锚点（本节） |
|---|---|---|
| `居住地最多 9 条，请先删除多余的条目` | **组件态注入 10 条**（绕过置灰）点保存 ⇒ 前端拦、**零 PUT** | `person-archive.vue:2102`（模板串 `` `居住地最多 ${MAX_RESIDENCE_PLACES} 条，请先删除多余的条目` ``）；文案常量 `business/place.ts:19` |
| `已达上限 9 条，如需新增请先删除一条。` | 有效条数 ≥ 9 ⇒ 添加按钮置灰时的 hint | `person-archive.vue:2039`（`residenceHint` computed）；未满时 hint = `最多 9 条；无码也无备注的空条目不会保存。` |
| （按钮拦截 toast）`居住地最多 9 条` | 兜底：置灰被绕过时点「＋ 添加居住地」 | `person-archive.vue:2046`（`addResidence` 内 `uni.showToast`） |

**（3）403 四支（**逐字不同 · 各自对应不同镜像 · 非合并项**）**

| 逐字文案 | 触发场景 | 锚点 |
|---|---|---|
| `始祖节点信息需在本姓祖谱中修改` | 上层 = **本姓祖谱**（founder 镜像） | `lib/founder-attach.js:42` |
| `始祖节点信息需在中华世本（总谱）中修改` | 上层 = **中华世本**（founder 镜像） | `lib/founder-attach.js:40` |
| `该节点为上层（中华世本）镜像，需到总谱修改` | **chain 镜像**分支 | `lib/founder-attach.js:44` |
| `空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息` | `isPlaceholderFounder` 为真 | `lib/founder-attach.js:46` |

> **硬纪律（登记）**：以上三支镜像 403 **逐字不同**，**任何合并 / 改写措辞**都会使测试 `person-places.test.js` 的逐字冻结断言立刻红（§15-2 同口径，本节重申）。
> **另**：`PUT /tree-meta` 侧仍用**「发源地」**串（`发源地行政区划代码无效：<码>`），与 R1 / `set-tree-origin` 的**「出生地」**串**两串并存、有意为之、不得统一**（§25-11(5) 同口径）。

### 16-4 测试基线终稿（**取代 §9-1 / §11-18 / §13-3 / §14-7 / §14-8 / §15-4 的全部旧值**）

| 项 | 链路（实测逐次） | **终稿（本节实测）** |
|---|---|---|
| `scripts.test` 注册测试文件数 | 26 → **27** | **27**（新增 `cloudfunctions/compat-api/lib/person-places.test.js`，含 **18** 条用例；注册位置 = 根 `package.json` 的 `scripts.test` 末项） |
| 全量 `npm test` | 431 → 446 → 448 → **449** | **`1..449` · `# tests 449` · `# pass 449` · `# fail 0` · `# cancelled 0` · `# skipped 0` · `# todo 0`**（`duration_ms` 实测 **1,944.9**） |
| 假绿判定（§9-1 / §14-7） | ⚠️ 曾为「假绿未闭合」 | ✅ **后端已闭合**（新 400 文案 / R1 / 只读预检先于扣费均有注册测试）；⚠️ **前端（`origin-picker` / `GeoCascader` / `person-archive` / `place.ts`）仍零测试覆盖**（见 §16-7） |
| 复现 | — | §16-9 ①② |

### 16-5 质检终稿（**84 判据 = PASS 81 / FAIL 1 / 已闭合留档 2**）

| 项 | 值（源自 `docs/person-places.qa.md`，551 行） |
|---|---|
| 质检册行数 | **551 行**（实测 `wc -l`） |
| 累计判据 | **84** |
| PASS | **81** |
| FAIL | **1**（唯一） |
| 已闭合留档（写入时非 PASS、现行已闭合） | **2 行**：`B13`（观察 O3 ⇒ 已定案）· `C3-o`（观察 O4 ⇒ 已闭合）；另 `B7` / `C1b` / `C1c` 等的改判见质检册「累计计数 ②」 |
| 唯一 FAIL | **`shen_27784_01`（= `A8` = `F1`）· 待 Kevin 裁定** | ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**

- **唯一 FAIL 的实情（逐字登记）**：真源 `origin_code = 230305`（黑龙江省鸡西市梨树区）与其 `origin` 文本 = 「山东省临沂市」**互斥**；且该树始祖 **`沈克强`**（`I000277` / handle `103f95b8762b433c7159c8ea1006`）的 `birth_place` **在迁移前（11:36 备份内）就已就位** ⇒ 迁移判**幂等跳过**。
- **口径须读作（登记 · 只登记事实）**：「13 棵已写入」**必须**读作「**12 棵由本次迁移写入 + 1 棵（`shen_27784_01`）迁移前已就位**」（§15-6 同口径，本节重申）。
- **不得改判**：本册**只登记、不自行裁定**；**裁定前**映射表 / 验收计数**不得**按任一解释对外引用。

### 16-6 迁移执行记录与 md5（C9 · 本次实测复核）

| 项 | 实测（本节重算） |
|---|---|
| 执行结果 | **12 棵写入** + **1 棵幂等跳过**（`shen_27784_01`）+ **4 棵跳过**（`qin_31206_01` 空树 / `liu_21016` / `rong_23481_01` / `li_26446_03`） |
| **12 棵已变（本节逐棵重算 · 供重传点名用）** | `gu_39038` · `gu_39038_01` · `heng_24658_01` · `ji_23395` · `ji_23395_01` · `ji_32426_01` · `li_26446_01` · `li_26446_02` · `liu_21016_01` · `long_40857_01` · `qin_31206` · `zhonghua`（= `migrate-output/trees/*.json`，**12 / 17**） |
| 复核方式 | 备份 `md5-before.txt`（**18 项** = 17 棵树 JSON + `tree-meta.json`）逐项 vs 真源比对 ⇒ **已变 12 / 未变 5（1 幂等 + 4 跳过）= 17 棵全对上** |
| 备份目录 | `~/jiazu-backups/2026-09-20-founder-birthplace/` —— `md5-before.txt` **1,015 B** + `tree-meta.json` **9,572 B** + `trees/`（目录 mtime **2026-09-20 11:36**） |
| 映射表 | `scripts/founder-map.json` = **13 条**（`gramps_id → handle` 已逐条校验） |
| `config/tree-meta.json` | md5 **`c9112e40760839bc8d2132d6300b838b`** · **9,572 B** · mtime **2026-09-20 11:31:21** · `origin_code` 非空 **8 / 17** ⇒ **迁移全程未变**（与 C8 作废「无任何镜像回写」一致） |
| `migrate-output/**` 聚合 | `find -type f \| sort \| xargs md5 -q \| md5 -q` = **`684ceb0bd03d31ef9c08104e3eb6ac41`**（**318 文件**；与质检册 §P2 同值） |
| 未部署 | 迁移写入的是**本地真源**；**部署产物未重打包、树 JSON 未上云** ⇒ 动作面登记见 **`docs/PENDING_DEPLOY.md` §26** |

### 16-7 残留风险登记（**不得据本节推断为已验证**）

| # | 残留风险 | 现状（实测） |
|---|---|---|
| 1 | **前端零单测覆盖（假绿面）** | `origin-picker` / `GeoCascader` / `business/place.ts` / `person-archive` 均**无单测**；`npm test` 的 **449 项全部是后端**（`cloudfunctions/compat-api/lib/*.test.js`）⇒ F3 / O4 的复验**只**依赖一次性页面级脚本（不入仓） |
| 2 | **小程序真机端到端未验** | 只自算了主包字节与 `type-check`；**未**在微信开发者工具 / 真机跑「编辑 → 保存 → 回显」（`GeoCascader` 点选、`uni.showToast`、按需加载行为差异未知） |
| 3 | **`t-button` 禁用态未落根元素 `disabled`** | 实测 `hasAttribute('disabled') = false`，仅 `t-button--disabled` class + 组件内部拦截 ⇒ **功能上拦得住**（点击零新增），但**键盘 / 读屏可访问性存疑** |
| 4 | **生产 `cloud` 路径未验** | 全部实测走 `COMPAT_SOURCE=local` + `/tmp` 副本；生产（MongoDB + 云函数）的**并发扣费 / 冲正 / 事务语义未验** |
| 5 | **本批修复仍是工作区未提交改动** | `person-archive.vue` / `lib/*.js` / `index.js` 等 `git status` = ` M` ⇒ **未入库**，有被工作区其它操作覆盖的风险 |
| 6 | **`shen_27784_01` 未决** | 见 §16-5（唯一 FAIL，待 **Kevin** 裁定） | ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**

### 16-8 `AGENTS.md` 拟稿（终稿 · **本册仍未获授权 · 本节不写 `AGENTS.md`**）

> **状态**：`AGENTS.md` **未经 Kevin 现场批准不得修改**（同 §13 口径）。以下为**逐字拟稿（终稿，取代 §13-1 / §13-2 / §13-3 的「待填 / 待回填」占位）**，**待批准后原样插入**；本册**不做任何插入动作**。
> **锚点（本节只读实测）**：§0 索引 = `AGENTS.md:20`（`docs/geo-origin.spec.md` 行）**之后插入**；§7 测试基线 = `AGENTS.md:189`（`npm test` = `node --test` + **26** 个测试文件）；§9 速查 = `AGENTS.md:224`（「改『发源地』字段」行）。

**拟稿 ① §0 索引行（新增一行 · 插在 `AGENTS.md:20` 之后）**

```
| 人物地点属性规格 | `docs/person-places.spec.md` | 人物节点【出生地】（`birth_place` 对象 `{origin_code, note}`）/【居住地】（`residence_places` ≤9 条）与家族树**发源地人工指定**（`POST /admin/set-tree-origin` + `GET /tree/origin-candidates`；**人工指定 = 一次性结果、来源节点后改不自动回落**，E3-x 裁定）；**无自动同步镜像**（原 C8 已作废）；建树时发源地同时写始祖出生地（C11）；逐字文案 / 测试基线 / 迁移记录 / 残留风险见该册 §15–§16 |
```

**拟稿 ② §9 速查行（**替换** `AGENTS.md:224` 的「改『发源地』字段」行）**

```
| 改「发源地 / 出生地 / 居住地」字段 | 发源地行政区划口径真源 = `docs/geo-origin.spec.md`；**人物地点属性（出生地 / 居住地）与发源地人工指定真源 = `docs/person-places.spec.md`**。`birth_place` = 对象 `{origin_code, note}`（历史字符串**读侧归一 + 保存懒转**，不做强制形状迁移）；`residence_places` = 数组 **≤9**（第 10 条后端 400；**前端置灰 + 提交双层拦截**）；`null` **一律等同未提供**（不清空）；非法形状 → **400 且不扣费**。发源地 = **人工指定**（始祖 / 其下 1–2 代、被指定节点码必须非空；始祖认定 = `founder_handle` 优先、否则唯一非镜像根节点，0 或多 → 400），**指定是一次性结果、来源节点后改不自动回落、需重新指定**（E3-x：设计如此），**不存在自动同步**。始祖节点**仅这两项**可编辑（混合请求仍 403）；计费不变（1 片 / 次） |
```

**拟稿 ③ §7 测试基线行（**替换** `AGENTS.md:189` 的数量 + 追加一条基线行）**

```
- **`npm test` = `node --test` + 27 个测试文件**（根 `package.json` 的 `scripts.test`）：**27 个全部**在 `cloudfunctions/compat-api/lib/*.test.js`（…原 26 项清单… / **person-places**）。2026-09-20 实测：`scripts.test` 枚举 **27** 项 = 磁盘 `lib/*.test.js` 27 个，无未注册文件。
  - **2026-09-20 本批终稿基线**：`npm test` → **449 tests / 449 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**（链路 431 → 446 → 448 → **449**；新增 `lib/person-places.test.js`，18 条用例）。⚠️ **449 项全为后端**；**前端（`origin-picker` / `GeoCascader` / `place.ts` / `person-archive`）零单测覆盖 = 假绿面**，前端回归只能手工 / 脚本重跑（见 `docs/person-places.spec.md` §16-7）。
```

- **插入后自检（供批准后执行）**：`grep -c 'person-places.spec.md' AGENTS.md` ≥ 2；`grep -n '27 个测试文件\|449 tests' AGENTS.md` 各 1 命中；`grep -n '改「发源地 / 出生地 / 居住地」字段' AGENTS.md` 1 命中。
- **⚠️ 本册未执行**：以上仅拟稿；`AGENTS.md` 工作区状态 = `M`（md5 `e4c089818fbf7a3a7218e567e7b409ee`，**非本批所为**，本节未触碰）。

### 16-9 复现命令（本节全部读数的可执行入口 · **只读**）

```bash
cd /Users/kevin/bistro/jiazu
# ① 测试基线终稿（27 项 / 449 / 449 / 0）
python3 -c "import json;s=json.load(open('package.json'))['scripts']['test'];print('注册项数:',len([p for p in s.split() if p.endswith('.js')]))"
npm test | tail -8
# ② 真源 / 迁移读数（本节实测值）
md5 -q config/tree-meta.json                      # c9112e40760839bc8d2132d6300b838b
wc -c < config/tree-meta.json                     # 9572
stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' config/tree-meta.json   # 2026-09-20 11:31:21
find migrate-output -type f | sort | xargs md5 -q | md5 -q   # 684ceb0bd03d31ef9c08104e3eb6ac41
find migrate-output -type f | wc -l                          # 318
python3 -c "import json;print(len(json.load(open('scripts/founder-map.json'))))"   # 13
python3 -c "import json;t=json.load(open('config/tree-meta.json'))['trees'];print(sum(1 for v in t.values() if str(v.get('origin_code') or '').strip()),'/',len(t))"   # 8 / 17
# ③ 12 棵已变树 JSON（重传点名用 · 与 11:36 备份 md5 逐棵比对）
python3 - <<'PY'
import hashlib,os
b=os.path.expanduser('~/jiazu-backups/2026-09-20-founder-birthplace/md5-before.txt')
before={l.split()[-1]:l.split()[0] for l in open(b) if len(l.split())>=2}
chg=[f for f,h in before.items() if os.path.exists(os.path.join('migrate-output',f))
     and hashlib.md5(open(os.path.join('migrate-output',f),'rb').read()).hexdigest()!=h]
print('changed',len(chg)); print('\n'.join(sorted(chg)))
PY
# ④ 逐字文案锚点（本节实测行号）
grep -n 'RESIDENCE_LIMIT_MESSAGE =\|RESIDENCE_SHAPE_MESSAGE =\|BIRTH_PLACE_SHAPE_MESSAGE =\|unknownOriginCodeMessage' cloudfunctions/compat-api/lib/person-places.js
grep -n '请求体不包含可修改内容' cloudfunctions/compat-api/index.js
grep -n '居住地最多 9 条，请先删除多余的条目\|已达上限\|MAX_RESIDENCE_PLACES = \|cloneFormDeep\b' frontend/src/components/person-archive/person-archive.vue frontend/src/business/place.ts | head
grep -n "LOCK_MESSAGE\|CHAIN_MIRROR_LOCK_MESSAGE\|PLACEHOLDER_LOCK_MESSAGE" cloudfunctions/compat-api/lib/founder-attach.js
# ⑤ 部署产物仍为旧包（8 条判据串产物侧全 0 ⇒ 未重打包）
wc -c < cloudfunctions/deploy/compat-api/index.js; md5 -q cloudfunctions/deploy/compat-api/index.js
for s in residence_places place_note set-tree-origin origin-candidates '居住地格式无效' '居住地最多 9 条' assertPlaceFieldShapes personEditLockMessage; do printf '%s: ' "$s"; grep -c "$s" cloudfunctions/deploy/compat-api/index.js; done
# ⑥ 边界自查
git status --short AGENTS.md; md5 -q AGENTS.md
wc -l docs/person-places.spec.md docs/person-places.qa.md docs/PENDING_DEPLOY.md docs/geo-origin.spec.md
```

> **本节边界（逐条）**：本节**只写文档** —— **未改任何代码**（`cloudfunctions/**` / `frontend/**` / `scripts/**` / `package.json` 零写入）、**未写真源**（`config/**` / `migrate-output/**` 零写入；`config/tree-meta.json` md5 前 = 后 = `c9112e40760839bc8d2132d6300b838b`）、**未改 `AGENTS.md`**（前 = 后 = `M AGENTS.md` / md5 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行部署 / 打包 / 迁移**。
> 本节数值**全部本次实测**（§16-9 可逐条复跑）；**凡未实测者一律标注来源册节，不推算、不写结论**；**E3-x 与 `shen_27784_01` 两项的裁定权分别属 Zang / Kevin**，本册只登记。 ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**

## 17. 追补五：**缺陷 J —— 弹窗 legacy 直写覆盖「发源地」显示串**（根因 · 前端修复 · 真源显示串修正 · 守卫脚本 `--check` · 冻结 md5 断言换值口径 · 测试基线 · 仍待验项）（Jing 制度员 · 2026-09-20 · **只追加 · 不改历史行 · 取代 §15-6 / §16-5「唯一 FAIL」行 / §16-7 第 6 行的「`shen_27784_01` 待 Kevin 裁定」类表述**）

> **本节边界（先声明）**：本节**只写文档** —— 未改代码（`cloudfunctions/**` / `frontend/**` / `scripts/**` / `package.json` 零写入）、**未写真源**（`config/**` / `migrate-output/**` 零写入；`config/tree-meta.json` md5 本节**前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**）、**未改 `AGENTS.md`**（`git status --short AGENTS.md` 前 = 后 = **空**）、**未执行部署 / 打包 / 重传 / 迁移 / 提交**。
> **口径**：**只登记事实**。凡本节标注「**报告口径**」者 = 修复方 / 取证方陈述，本册**未复跑**；凡标注「**本册实测**」者 = Jing 本节时点**实跑读数**（§17-10 可逐条复跑）。**两者不一致处一律并列登记 —— 不择一、不推算、不写成已验证**。

### 17-0 定位与取代关系

| 项 | 值 |
|---|---|
| 缺陷编号 | **J**（本册首次登记；承接 §16-1 的 A / B / F3 / F5 / H 五缺陷之后的**第 6 个**） |
| 一类根因（一句话） | **弹窗表单携带「打开时的旧显示串」，保存时经 `PUT /tree-meta` 的 legacy 直写分支覆盖刚落地的新显示串** ⇒ **码对、显示串错** |
| 报告人 | **Kevin**（家族页实操报告） |
| 触发树（报告） | `li_26446_02` —— 家族页把发源节点指定为 **`I000374 李玉梅`** 后，家族树**发源地显示串未变** |
| 本节取代 | §15-6 · §16-5（「唯一 FAIL」行）· §16-7 第 6 行 · 质检册 §A8 / §F1 / §6 /「累计计数」①②/「仍存在的风险」第 2 条 —— **凡把 `shen_27784_01` 记为「待 Kevin 裁定」者一律作废**（行尾已逐处标注，索引见 §17-9） |

### 17-1 根因（报告方逐字 · 本册代码级核对同结论）

- **写入链**：家族页 / 祖谱页**编辑弹窗**的 `editForm` **仍带 `origin`**（= 弹窗打开时的旧文本）；保存时 `updateTreeMeta(token, { tree_id, ...editForm })` 把这份旧文本交给 **`PUT /tree-meta`**。
- **覆盖点**：`PUT /tree-meta` 的 **legacy 直写分支**接受纯文本 `origin` 并**直接落库** ⇒ **覆盖掉弹窗内 `OriginPicker` 经 `POST /admin/set-tree-origin` 刚落地的显示串**。
- **净效果**：`origin_code`（码）**正确**、`origin`（显示串）**为旧文本** ⇒ 前端「发源地」显示回旧值。
- **本册核对（只读）**：`frontend/src/business/api.ts` 的 `updateTreeMeta` 入参类型**至今仍含 `origin?: string`**（其注释亦明示「legacy 旧数据**原样回传**即可；有码时后端以码反查结果覆盖，前端不拼串」）⇒ **公共 API 面未收窄**，缺陷面仍在（见 §17-8 第 4 条）。

### 17-2 前端修复（报告方逐字 + 本册行号核对）

| 文件 | 修法（报告） | 本册核对（只读实测） |
|---|---|---|
| `frontend/src/pages/hall/index.vue` | 约 `:369` `editForm` 声明 / `:781` 回填处**去掉 `origin`** | ✅ 实测 `:369` = `const editForm = ref({ display_title: '', genealogy_name: '', archive_url: '', hall_name: '', description: '' })`（**无 `origin`**）；`:771-773` 附解释性注释（逐字：「表单**不含 `origin` / `origin_code`**：若把弹窗打开时的旧显示串回传给 `PUT /tree-meta`，其 legacy 直写分支会覆盖刚指定好的 `origin`」） |
| `frontend/src/components/clan-hall/clan-hall.vue` | 约 `:226` / `:240` 同改 | ✅ 实测 `:226` = 同上形状（**无 `origin`**）；`:230-231` 注释同口径；`:285` 保存语句 = `updateTreeMeta(token, { tree_id: props.treeId, ...editForm.value })` |
| `frontend/src/business/api.ts` | 入参类型 `origin?: string` **保留未改** | ✅ 一致（**故意保留**：兼容 legacy「无码」旧数据的原样回传） |

- **落库路径不变（报告 · 本册核对一致）**：发源地**仍**由弹窗内 **`OriginPicker`** 经 **`POST /admin/set-tree-origin`** **即时落库**（「选完即写」，不依赖保存按钮）。页面内确有该回写：`hall/index.vue:794` / `clan-hall.vue:253` = `clanEntry.value = { ...clanEntry.value, origin: r.origin, origin_code: r.origin_code }`。

### 17-3 页面级实测与负向对照（**报告口径 · 本册未复跑**）

- **家族页三条 PASS（报告）**：
  1. **选定后再保存弹窗** ⇒ 显示串**保持『黑龙江省牡丹江市穆棱市』、不被盖回**；
  2. **只改堂号** ⇒ 发源地**零变化**；
  3. **什么都不改保存** ⇒ **零变化**。
- **祖谱页同类三条**：报告**未实测** ⇒ 登记为待验（§17-8 第 3 条）。
- **负向对照（报告 · 关键判据）**：**直接发 `PUT /tree-meta` 带旧文本**，**确实能把显示串盖回**（HTTP **200**）⇒ ① **回读（`--check`）可以侦测该缺陷**；② **前端修复并不关闭服务端缺陷面**。
- **证据位置**：报告方页面级复跑为**一次性脚本、未入仓**（同 §16-7 第 1 条「假绿面」口径）；**本册无该脚本、无日志 ⇒ 未复跑、不复述为已验证**。

### 17-4 真源污染面与数据修正（**报告口径**）

| 项 | 值 |
|---|---|
| 污染面 | 全库 **17 棵**中「有码」**9 棵**；被本缺陷污染 **2 棵**（**并非 Kevin 有意保留**） |
| ① `shen_27784_01` | 码 `230305`（= 黑龙江省鸡西市梨树区）；`origin` 显示串**曾为**『山东省临沂市』 |
| ② `li_26446_02` | 码 `231085`（= 黑龙江省牡丹江市穆棱市）；`origin` 显示串**曾为**『山东』 |
| 修正口径 | **只改 `origin` 单字段**；`origin_code` **未动**；`diff` **仅 `65c65` 与 `253c253`** | ⇒ **已作废（2026-09-20 13:08 修正被回退 —— 现值差量 = 仅 `li_26446_02` 一处 / 4+ 3-；取代者 §18）** |
| md5 | `8be379b43a014154646191d81623c93c` → **`5963106e1a3d21272565f5ed2a884413`** | ⇒ **已作废（真源现值 = `35b08517791c11be68fb3d7b2f4d9820`；取代者 §18-1）** |
| 一致性 | **9 棵有码树现已全部一致** | ⇒ **已作废（现值 = 有码 9 棵中一致 **8** / 待修正 **1**（`shen_27784_01`）；取代者 §18-1）** |
| 备份 | `~/jiazu-backups/2026-09-20-origin-display-repair/`（`md5-before.txt` = `8be379b4…` · `repair-plan.txt` · `tree-meta.json` = `8be379b4…`） |
| 幂等 | **复跑字节不变** | ⇒ **已作废（该「修正后」状态在真源现值上不成立，幂等复跑无从成立；取代者 §18-1）** |
| 回滚命令 | `cp ~/jiazu-backups/2026-09-20-origin-display-repair/tree-meta.json /Users/kevin/bistro/jiazu/config/tree-meta.json` |

#### 17-4.1 ⚠️ 本册实测复核：**上述「修正后」状态在真源现值上不成立**

| 项 | 报告口径 | **本册实测（只读）** |
|---|---|---|
| `config/tree-meta.json` md5 | `5963106e1a3d21272565f5ed2a884413` | **`35b08517791c11be68fb3d7b2f4d9820`**（**9,636 B** · mtime **2026-09-20 13:08:00** · 间隔读数 2 次稳定） |
| 有码树一致性 | **9 棵全部一致** | **8 棵一致 / 1 棵待修正**（`shen_27784_01`） |
| 守卫 `--check` | exit **0** | **exit 1** —— `MISMATCH tree=shen_27784_01 code=230305 current="山东省临沂市" expected="黑龙江省鸡西市梨树区"` |
| `npm test` | 449 / 449 / **0** | 449 / **448** / **1**（唯一红 = §17-6 冻结值用例，见 §17-7） |
| `li_26446_02` | 已修正 | ✅ `origin` = 黑龙江省牡丹江市穆棱市；**另有 2 处计划外变动**：新增 `origin_code: "231085"`、`display_title` 由『李氏家族』→『李氏穆棱家族』 |
| `shen_27784_01` | 已修正 | ❌ **`origin` 仍为『山东省临沂市』**（`origin_code` = `230305` 未动） |
| `git diff config/tree-meta.json` | — | `4 insertions(+), 3 deletions(-)`，**仅 `li_26446_02` 一处**（工作区**未提交**） |

- **事实链（只登记，不推责）**：备份 `md5-before.txt` = `8be379b4…`（**≠ 现值**）⇒ 备份**已建立**、`--apply` **曾执行**；但现值**既非** `8be379b4…`（修复前）**亦非** `5963106e…`（修复后）⇒ **13:06 之后真源又被写过一次**（`tree-meta.json` mtime = **13:08:00**，**晚于**备份目录 mtime **13:06**）。
- **机制核对（本册代码级只读 · 属推断，未做写入实验）**：`cloudfunctions/compat-api/lib/store.js` —— ① `metaCache`（**`:91`**）为**进程级缓存**，仅由 `saveMeta` 更新（**`:294` / `:298`**），**不检测磁盘外部变更**；② `saveMeta`（**`:285-296`**）在**非沙箱**下把**内存中的整份 meta** `JSON.stringify` 落盘到**真源** `config/tree-meta.json`。⇒ **在修复前启动、且修复期间一直存活**的 local-server 进程，一旦响应任何元数据写入（如 `POST /admin/set-tree-origin`）就会把**其启动时的旧内存整份写回**，**覆盖掉刚恢复的显示串**。本册实测存活进程：**pid 25692** = `local-server.js 3410`（**启动 08:55**，早于修复）、**pid 35229** = `local-server.js 3100`（启动 **13:16**）⇒ **缺陷 J 的同一类根因已在服务端以「陈旧内存整份回写」形式再现**。 ⇒ ✅ **（2026-09-20 §18-3：本条机制已由「属推断」升级为「已定位（逐字引用，仍属只读核对）」；结论不变）**
- **对既有台账的影响**：§15-5 / §16-6 / §26-4 等行内「`config/tree-meta.json` = `c9112e40760839bc8d2132d6300b838b`」为**更早时点**读数，**已被本节取代**；本节**不回改**那些历史行。
- **处置建议（**待 Kevin 拍板 · 不得当已采纳**）**：① 重跑修正**前先停掉修复前启动的 local-server 进程**（否则可能再次被整份回写覆盖）；② `--apply` 后**立即** `--check` 复验并落 md5；③ 中期把 `metaCache` 改为**带 mtime / 摘要校验的失效**或按需重读。 ⇒ **（2026-09-20 §18-5：建议①已由 Zang ① 改写为「先落加固、再重放修正」；三项原文保留）**

### 17-5 守卫脚本 `scripts/fix-tree-origin-display.mjs`（**新增 · 已落盘**）

| 项 | 实测（本册只读核对） |
|---|---|
| 路径 / 体量 | `scripts/fix-tree-origin-display.mjs` · **14,026 B** · mtime **2026-09-20 13:06:11** · `git status` = **`??`（未入库）** |
| 默认模式 | **dry-run**（只打印计划，**不写盘**） |
| `--apply` | 执行写盘；**写前自动备份**（确有改动时）；**写后重读自校验** |
| `--check` | **只读守卫**：不一致 → **exit 1**；一致 → **exit 0** |
| 互斥 | `--apply` 与 `--check` 同时给 → **exit 2** |
| 参数校验 | 未知参数 → **exit 2**；目标缺失 → **exit 2** |
| 副本演练 | 支持 `COMPAT_META_FILE`（优先级 > `COMPAT_OUT_DIR/tree-meta.json` > 真源 `config/tree-meta.json`） |
| 写前自检 | 「屏掉 `origin` 后原文 == 候选」⇒ **仅 `origin` 变动**（否则不写） |
| 判定规约 | `origin` 唯一来源 = `resolveOrigin(origin_code).display`（`lib/geo.js`）；**无码 / 未知码树一律不碰** |
| 报告口径 | 修复前 `--check` = **exit 1，列出 2 棵**；修复后 = **exit 0** |
| **本册实测** | `--check` = **exit 1，列出 1 棵**（`shen_27784_01`）；17 棵全表：有码 **9**（一致 **8** / 待修正 **1**）/ 无码 **8**（不碰）/ **未知码 0** |
| **建议（待 Kevin 拍板 · ⚠️ 未采纳）** | 把它纳入 `npm test` 或**部署前检查**（本节**不写成已采纳**；部署册登记见 `docs/PENDING_DEPLOY.md` **§27**） |

### 17-6 冻结 md5 断言换值（**已落盘**）与口径登记

| 项 | 实测（本册只读核对） |
|---|---|
| 文件 | `cloudfunctions/compat-api/lib/person-places.test.js`（`git status` = ` M`，未提交） |
| 换值 3 处 | ① 头注释 **`:25`**（`:26` 附前值作废说明）② **`:63`** = `const FROZEN_META_MD5 = '5963106e1a3d21272565f5ed2a884413';`（`:62` 注释同）③ 用例名 **`:981`** |
| 前值 → 新值 | `c9112e40760839bc8d2132d6300b838b` → **`5963106e1a3d21272565f5ed2a884413`** | ⇒ **已作废（该值既非真源现值 `35b08517…`、亦已非有效契约口径；取代者 §18-5 ②）** |
| 改动性质 | **只换值、断言逻辑未动**（**仍逐字锁具体值**以守住「真源零写入」）⇒ 本册核对 ✅ 一致 | ⇒ **已作废（口径已改：绝对冻值 → 「测试前后自比 + 打印当时指纹」；取代者 §18-5 ② / §18-4）** |
| **口径登记（制度员）** | **冻结值是随真源授权变更而更新的**；**旧值不作永久真值**。任何换值**必须**与一次**已授权的真源变更**同批登记（本次 = 发源地显示串修正），**禁止**为让测试变绿而单独改值 | ⇒ **已作废（旧口径「锁绝对指纹 / 换值须与已授权真源变更同批登记」已被 Zang 2026-09-20 新口径取代；取代者 §18-5 ②）** |
| ⚠️ 本册实测 | 真源现值 `35b08517…` **≠** 冻结值 `5963106e…` ⇒ 该用例**现为 RED**。**该红既不是断言逻辑缺陷、也不是本节（前端）修复引入**，而是「**冻结值已换、真源未到位**」（§17-4.1） |

### 17-7 测试基线

| 项 | 报告口径 | **本册实测** |
|---|---|---|
| `npm test` | **449 / 449 / 0** | **`# tests 449` · `# pass 448` · `# fail 1` · `# cancelled 0` · `# skipped 0` · `# todo 0`**（`duration_ms` ≈ **1,879**） | ⇒ **已作废（报告口径列：现值 = 449 / 448 / 1；取代者 §18-1）** |
| 注册测试文件数 | 27 项（`scripts.test`） | 27 项（未变） |
| 唯一红 | — | **`not ok 391`** = 「真源零写入：`config/tree-meta.json` md5 == `5963106e1a3d21272565f5ed2a884413`，且 `migrate-output` 逐字节未变」 |
| 修复前工作副本 | 曾为 **448 / 449 / 1**（因冻结值失配） | ✅ 与本节实测**同值**（448 / 449 / 1）—— **该红不是本次（前端）修复引入**，而是**冻结值已换而真源未到位** / 工作副本自 **13:01** 起含**未提交的真源改动** |
| 另一支「Z1 真源零写入」（`ok 256`） | — | ✅ **PASS**（自基线自比、**不校验冻结值**，故不受影响） |

### 17-8 仍待验 / 待定（**如实登记 · 不得据本节推断为已验证**）

1. **真源未到位（本节新发现 · 阻断级）**：`config/tree-meta.json` md5 = `35b08517…`（**≠** 冻结值 `5963106e…`）；`--check` **exit 1**；`shen_27784_01` 的 `origin` **仍为『山东省临沂市』**。**在上云 / 重传 / 重打包前必须先闭合**（处置建议见 §17-4.1）。
2. **小程序双端 build 与主包字节未复测**：上一版口径 **1,998,964 B / 204 文件**（§26-3）在根因修复后**尚未复测**（且本册实测 `uni build -p mp-weixin` 进程于 **13:21** 在跑 ⇒ 产物可能已变，**读数须重取**）。
3. **祖谱页弹窗的页面级三条未实测**（家族页三条 PASS 属**报告口径**，见 §17-3）。
4. **`PUT /tree-meta` 的 legacy 直写分支仍能被旧客户端用来覆盖显示串** —— **后踊加固建议（待 Kevin 拍板 · ⚠️ 未采纳）**：**请求只给 `origin` 文本、不给码、而该树已有码时拒绝覆盖**（即「有码树拒绝纯文本直写」）。
5. **小程序真机端到端未验**（同 §16-7 第 2 条）。
6. **前端无单测覆盖**（同 §16-7 第 1 条；`npm test` 的 449 项**全为后端**）⇒ §17-2 / §17-3 的改动**无回归网**。
7. **服务端 `metaCache` 生命周期缺陷未修**（§17-4.1 机制）—— 建议纳入「部署前检查」或改为**带校验的缓存失效**。

### 17-9 作废标注索引（**只加行尾标注 · 不回改历史行**）

| 册 | 行号 | 原表述（摘） | 行尾标注 |
|---|---|---|---|
| 本册 `docs/person-places.spec.md` | `:1015` | §15-5「未决（**不得当已定案**）`shen_27784_01` 见 §15-6」 | ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）** |
| 本册 | `:1018` | §15-6 标题「待 Kevin 裁定项」 | 同上 |
| 本册 | `:1024` | §15-6「裁定人 = Kevin」 | 同上 |
| 本册 | `:1166` | §16-5「唯一 FAIL ⋯ 待 Kevin 裁定」 | 同上 |
| 本册 | `:1194` | §16-7 第 6 行「`shen_27784_01` 未决」 | 同上 |
| 本册 | `:1261` | §16 边界「`shen_27784_01` 的裁定权属 Kevin」 | 同上 |
| 质检册 `docs/person-places.qa.md` | `:57` | §A 表 `A8` 行（含 Jing 追补注「待 Kevin 裁定项」） | 同上 |
| 质检册 | `:326` | 追补 §「缺陷编号收口」（`F1` 归位） | 同上 |
| 质检册 | `:371` | 「追补（Jing）」§6 标题 | 同上 |
| 质检册 | `:373` | §6 第 1 条 | 同上 |
| 质检册 | `:375` | §6「裁定人 = Kevin」 | 同上 |
| 质检册 | `:491` | 「累计计数」① §A 行 | 同上 |
| 质检册 | `:502` | 「累计计数」② `A8` 行 | 同上 |
| 质检册 | `:513` | 「仍存在的风险 / 未验证项」第 2 条 | 同上 |
| 质检册 | `:566` | 「制度员复核结论」(1) FAIL 行 | 同上 |
| 质检册 | `:584` | 「制度员复核结论」(4) 第 1 条 | 同上 |

- **共 16 处**（本册 6 + 质检册 10）；**行号为本节写入时点**（本节为**纯行尾追加**，不增删行 ⇒ 行号不变）。
- **作废的语义（逐字）**：`shen_27784_01` 的 `origin` 与 `origin_code` 互斥**从来不是**「Kevin 有意保留、待其裁定」的方案题，而是**缺陷 J 的另一例**（同一根因造成的**污染**，与 `li_26446_02` 同类）⇒ **「待裁」口径一律作废，取代者 = 本节**。
- **不受影响者**：`A8` / `F1` 的**判据编号、FAIL 字样、归因、所在表结构与行内其它字段一律保留**（Neng 的历史行**逐字原样**）；本节**不新增判据、不复跑判据、不改任何判据编号**。质检册的 `84 = 81 PASS / 1 FAIL` 计数**照旧**。

### 17-10 复现命令（本节全部读数 · **只读**）

```bash
cd /Users/kevin/bistro/jiazu
# ① 真源现值 + 稳定性（本节：35b08517791c11be68fb3d7b2f4d9820 / 9,636 B / mtime 2026-09-20 13:08:00）
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json
stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' config/tree-meta.json
# ② 守卫（本节：exit 1 / 列 1 棵 shen_27784_01）
node scripts/fix-tree-origin-display.mjs --check; echo "check_exit=$?"
# ③ 与备份 / 修复计划对账（md5-before 应 = 8be379b4…）
md5 -q ~/jiazu-backups/2026-09-20-origin-display-repair/tree-meta.json
cat ~/jiazu-backups/2026-09-20-origin-display-repair/repair-plan.txt
# ④ 测试基线（本节：449 / 448 / 1；唯一红 = 冻结值用例）
npm test | tail -8
npm test 2>&1 | grep -nE '^not ok'
# ⑤ 换值 3 处（本节：:25 / :63 / :981）
grep -n 'c9112e40760839bc8d2132d6300b838b\|5963106e1a3d21272565f5ed2a884413' cloudfunctions/compat-api/lib/person-places.test.js
# ⑥ 前端修复核对（两处 editForm 应无 origin；api.ts 的 origin?: string 故意保留）
grep -n 'const editForm = ref' frontend/src/pages/hall/index.vue frontend/src/components/clan-hall/clan-hall.vue
grep -n 'origin?: string' frontend/src/business/api.ts
# ⑦ 污染面差量（本节：仅 li_26446_02 一处，4+ / 3-，未提交）
git diff --stat config/tree-meta.json; git diff config/tree-meta.json
# ⑧ 服务端陈旧缓存（机制核对）
grep -n 'metaCache' cloudfunctions/compat-api/lib/store.js
ps aux | grep -E 'local-server\.js' | grep -v grep   # 本节存活：:3410（启动 08:55）/ :3100（启动 13:16）
# ⑨ 边界自查
git status --short AGENTS.md; md5 -q AGENTS.md
wc -l docs/person-places.spec.md docs/person-places.qa.md docs/PENDING_DEPLOY.md
```

### 17-11 本节边界（逐条）

- **只写文档**：本节**未改任何代码**（`cloudfunctions/**` / `frontend/**` / `scripts/**` / `package.json` **零写入**）、**未写真源**（`config/**` / `migrate-output/**` **零写入**；`config/tree-meta.json` md5 **前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**）、**未改 `AGENTS.md`**（前 = 后 = **空** / md5 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行部署 / 打包 / 重传 / 迁移 / 提交**。
- **只追加**：本节为**新节**（接现有最大 §16）；**历史行原文保留**，仅在 §17-9 所列 **16 处行尾追加**作废标注（**未删字、未改字、未动表格结构**）。
- **未复跑项**：§17-3（页面级三条 + 负向对照）与 §17-2 的**报告行号**均属**报告口径** —— 本册**未复跑**，**不推算、不写成已验证**。
- **裁定权**：本缺陷**是否**按 §17-4.1 / §17-8 的建议加固、真源**如何**处置、`--check` **是否**纳入部署门槛 —— **裁定权属 Kevin**，本节**只登记、不自行裁定**（§11 / §15-6 体例一致）。

---

## 18. 追补六：**「13:08 修正被回退」事件登记 —— 长驻实例「过期内存整文件回写」+ `tree-meta` 无乐观锁**（真源现值 `35b08517…` · `shen_27784_01` 重新不一致 · 守卫 `--check` 现 **exit 1** · `npm test` **449 / 448 / 1** · 机制**已定位** · 修复**已派 · 进行中 · 未落盘** · Zang **已定** 与 **仍待拍板** 口径）（Jing 制度员 · 2026-09-20 · **只追加 · 不改历史行 · 本节取代 §17-4 表「报告口径」列 / §17-6 旧口径登记行 / §17-7 表「报告口径」列的相应读数 —— 行尾已逐处标注，索引见 §18-7**）

> **本节边界（先声明）**：本节**只写文档** —— **未改代码**（`cloudfunctions/**` / `frontend/**` / `scripts/**` / `package.json` **零写入**；**本节不实现 §18-4 所列修复**）、**未写真源**（`config/**` / `migrate-output/**` 零写入；`config/tree-meta.json` md5 **前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**，本节前后各测 2 次稳定）、**未改 `AGENTS.md`**（`git status --short AGENTS.md` **前 = 后 = 空**）、**未执行部署 / 打包 / 重传 / 迁移 / 提交**。
> **口径**：**只登记事实**。凡标「**本册实测**」= Jing 本节时点**实跑读数**（§18-9 可逐条复跑）；凡标「**Zang 已定**」= **制度口径已定、尚未落地**；**凡未落地者，本册一律不写「已修 / 已加固 / 已采纳」**。
> **本节不新增判据、不重跑判据、不改任何判据编号与判定**（质检册「累计计数」① / ② 与「制度员复核结论」各表**一律照旧**，`84 = 81 PASS / 1 FAIL` **不变**）。

### 18-0 定位与取代关系

| 项 | 值 |
|---|---|
| 事件编号 | **K**（本册首次登记；承接缺陷 **J**（§17）—— **同一根因族在服务端以「陈旧内存整文件回写」形式再现**） |
| 事件名 | **「13:08 修正被回退」**：§17 登记的显示串修正（`shen_27784_01`）于 **13:08** 被一次元数据写入**整体抹掉** |
| 一类根因（一句话） | **一个「修正前就已启动」的长驻 local-server 实例，响应一次元数据写入时把其过期进程内存副本整份落盘** ⇒ **覆盖掉守卫脚本刚在磁盘上落地的修正** |
| 观测锚点 | 真源 `config/tree-meta.json` mtime = **2026-09-20 13:08:00**（**晚于** 13:06 `--apply` / 备份目录；**早于** §17 复核） |
| 本节取代 | §17-4 表「报告口径」列（md5 `5963106e…` / 「9 棵全部一致」/ 差量 `65c65`+`253c253` / 幂等）· §17-6 的旧口径登记行 · §17-7 表「报告口径」列（`449 / 449 / 0`）—— **行尾已逐处标注**（索引见 §18-7） |

### 18-1 本册实测读数（现值 · 只读）

| 项 | 现值（**本册实测**） |
|---|---|
| `config/tree-meta.json` md5 | **`35b08517791c11be68fb3d7b2f4d9820`**（**9,636 B** · mtime **2026-09-20 13:08:00**；本节前后各 2 次读数稳定） |
| 契约冻结值（`person-places.test.js:63`） | `5963106e1a3d21272565f5ed2a884413` ⇒ **≠ 真源现值** |
| 备份 | `~/jiazu-backups/2026-09-20-origin-display-repair/`：`md5-before.txt` = `8be379b43a014154646191d81623c93c`（= 修复前）；目录内 `tree-meta.json` md5 = `8be379b4…`（**未变**） |
| `shen_27784_01` | `origin_code` = `230305`（= 黑龙江省鸡西市梨树区）· `origin` = **『山东省临沂市』**（**应为『黑龙江省鸡西市梨树区』**）· `display_title` = 『沈氏临沂家族』 ⇒ ❌ **重新不一致**（§17-4「已修正」**在现值上不成立**） |
| `li_26446_02` | `origin_code` = `231085` · `origin` = **『黑龙江省牡丹江市穆棱市』（修正**保留**）** · `display_title` = **『李氏穆棱家族』**（**Kevin 手工**改动） |
| 一致性守卫 `node scripts/fix-tree-origin-display.mjs --check` | **exit 1**（逐字见下行） |
| 守卫逐字输出（尾 3 行） | `共 17 棵：有码 9（已一致 8 / 待修正 1） / 无码 8（不碰） / 未知码 0（不动）` · `❌ --check 未通过：1 棵不一致（exit 1）` · `   MISMATCH tree=shen_27784_01 code=230305 current="山东省临沂市" expected="黑龙江省鸡西市梨树区"` |
| 守卫全表 | 17 棵：**有码 9**（一致 **8** / 待修正 **1**）/ **无码 8**（不碰）/ **未知码 0** |
| `npm test` | **`# tests 449` · `# pass 448` · `# fail 1` · `# cancelled 0` · `# skipped 0` · `# todo 0`**（`duration_ms` ≈ **1,980.7**） |
| 唯一红 | **`not ok 391`** = 「真源零写入：`config/tree-meta.json` md5 == `5963106e1a3d21272565f5ed2a884413`，且 `migrate-output` 逐字节未变」 |
| `git diff --stat config/tree-meta.json` | `1 file changed, 4 insertions(+), 3 deletions(-)` —— **仅 `li_26446_02` 一处**（**未提交**） |
| 存活 local-server（**本册实测**） | pid **25692** = `local-server.js 3410`（**启动 08:55** ⇒ **早于 13:06 修正**，本次回退的**嫌疑实例**）· pid **35229** = `local-server.js 3100`（启动 **13:16**） |

### 18-2 事件序列（时间轴 · 只登记 · 不推责）

| 时刻 | 事件 | 依据 |
|---|---|---|
| **13:01** | 发源地人工指定经 **`POST /admin/set-tree-origin`** 写入，**由长驻实例（pid 25692）处理** ⇒ 该实例内存中的 `li_26446_02` 被更新为『黑龙江省牡丹江市穆棱市』 | §17-4.1（工作副本差量自 13:01 起） |
| **13:06** | 守卫脚本 `--apply` **直接落盘**修正 `shen_27784_01`（**不经**任何 local-server 实例）；写前自动备份（`8be379b4…`） | §17-4 / §17-5 |
| **13:08:00** | Kevin 手工改某树 `display_title` ⇒ **同一长驻实例（pid 25692，启动 08:55）**响应该写入并调用 `saveMeta`，把**其过期内存的整份 meta** 落盘 ⇒ **`shen_27784_01` 被抹回『山东省临沂市』**；**`li_26446_02` 保住**（其值早在 13:01 已进入该实例内存，回写内容与之一致） | §18-1 读数 + §18-3 机制 |
| 本节时点 | 真源 = `35b08517…` · 守卫 **exit 1** · `npm test` **449 / 448 / 1** | §18-1 |

- **净效果（逐字）**：**「被直接改盘」的树被回退，「曾经该实例内存更新」的树保留** ⇒ **一次修正能否存活，取决于它是否经过长驻实例的内存，而与修正本身是否正确无关**。
- **可复跑锚点**：`13:08:00`（文件 mtime）与 `08:55`（进程启动）**均可实测**（§18-9 ⑧）；**本节未做写入实验**，故不写「已实验复现」。

### 18-3 机制（**已定位** · 逐字引用 · 只读核对）

`cloudfunctions/compat-api/lib/store.js`：

```js
// :91 —— 进程级 meta 缓存（模块级变量）
let metaCache = null;

// :266-284 —— getMeta()：仅在「缓存为空」时读盘，之后一律返回缓存；无外部变更检测
export async function getMeta() {
  if (metaCache) return metaCache;
  if (SOURCE === 'local') {
    try { metaCache = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
    catch (e) { /* 沙箱副本未建：只读回退到真源作基线（写仍落副本，由 saveMeta 保证）*/ }
  } else { /* 云数据库读 */ }
  return metaCache;
}

// :287-299 —— saveMeta()：local 非沙箱 ⇒ 把内存中的整份 meta 写回真源
export async function saveMeta(meta) {
  if (SOURCE === 'local') {
    const target = assertWriteAllowed(META_FILE);      // 非沙箱 ⇒ config/tree-meta.json 真源
    fs.writeFileSync(target, JSON.stringify(meta, null, 2) + '\n');   // ← 整份落盘
    metaCache = meta;                                  // 先落盘、后更新缓存
    return;
  }
  /* 云写 */ metaCache = meta;
}
```

- **两点合起来即本事件**：① **`getMeta()` 仅在缓存为空时读盘、不 stat、不比对 mtime+size** ⇒ 长驻实例**永远看不到**磁盘上由**其它进程**（守卫脚本 / 编辑器 / 其它实例）写入的新值；② **`saveMeta()` 在 local 非沙箱下整份 `JSON.stringify` 落盘** ⇒ **任何**一次元数据写入，都会**用该进程的内存副本覆盖全文件**。
- **⇒ 口径（逐字）**：**`config/tree-meta.json` 是本仓唯一「无乐观锁（无版本号 / 无 ETag / 无 mtime 校验）的整份落盘文件」** ⇒ **最易被过期内存覆盖**；且**覆盖是静默的**（schema 合法、接口与肉眼**都读不出**）。
- **与缺陷 J 的关系**：**同属「写入方携带陈旧值」这一根因族** —— J 的写入方 = **弹窗表单**（§17-1）；K 的写入方 = **长驻进程的过期内存**（本节）。**关闭条件不同**：J 可由前端去掉 `origin` 规避（§17-2）；**K 不能** —— **只要实例存活且曾缓存 meta，就有覆盖风险**。
- **升级声明**：§17-4.1 的机制段原标「**属推断**」，**现由本节升级为「已定位」**（依据 = 上述逐字代码 + §18-2 时间轴；**仍属只读核对，未做写入实验**）。§17-4.1 的其余实测读数与现值一致，**保持有效**（行尾已标注，§18-7）。

### 18-4 修复：**已派 · 进行中 · 未落盘**（本册**不写「已修」**）

| # | 派发内容 | **本册实测（本节时点）** |
|---|---|---|
| ① | 给 **local 模式**的 **`getMeta()`** 加「**stat mtime + size 变化则重读**」（磁盘被外部改动 ⇒ 丢弃缓存重读） | ❌ **未落盘** —— `cloudfunctions/compat-api/lib/store.js` 内 `statSync` / `mtime` **零命中**；`getMeta()`（`:266-285`）**仍只有** `if (metaCache) return metaCache;` | ⇒ ✅ **（本节初稿之后、13:32:06 之前**已落盘**（**工作区未提交**）—— 本行「未落盘」结论**仅在本节初稿时点成立**；逐字引用见 §18-11，**①已落盘 ≠ 风险闭合**）** |
| ② | 把 `cloudfunctions/compat-api/lib/person-places.test.js` 的**绝对冻值断言**改为「**测试前后自比**」，并**新增**「**码 == `resolveOrigin(code).display`**」一致性断言 | ❌ **未落盘** —— 该文件**仍有** `:63` `const FROZEN_META_MD5 = '5963106e…'` 与 `:982` `assert.equal(md5(REAL_META), FROZEN_META_MD5, 'config/tree-meta.json 指纹被改动')`；**`resolveOrigin` 在该测试文件内零命中** ⇒ 一致性断言**尚未新增** |

- **口径（逐字）**：以上两项 = **已派 · 进行中 · 仓内未落盘** ⇒ **本册一律不写「已修 / 已加固 / 已入库」**；落地后须**由实测复跑回填**（入口见 §18-9）。

### 18-5 制度口径：**Zang 已定**（登记 · 尚未落地）

| # | 口径 | 状态 |
|---|---|---|
| ① | **修正即将「重放」** —— **待 §18-4 ①② 加固落地后执行**（即：先落外部变更检测，再重跑守卫 `--apply` 恢复 `shen_27784_01`，随后 `--check` 必须 **exit 0**） | **已定 · 未执行** |
| ② | **冻值断言口径变更**：由「**锁绝对指纹**」改为「**测试前后自比 + 打印当时指纹**」。**理由（逐字）**：**真源会随「人类授权写入」而变化**，绝对冻值**必然反复失配** | **已定 · 未落地** |

- **取代关系**：Zang ② **取代** §17-6 的旧口径登记行（「冻结值随真源授权变更而更新 / 换值须与一次已授权的真源变更同批登记」）—— **行尾已标注**（§18-7）。
- **与 §17-4.1 处置建议的关系**：§17-4.1 建议①「重跑修正前先停掉修复前启动的 local-server」**仍成立**，但**已由 Zang ① 改写为更完整口径**（**先落加固、再重放**；停实例不再是唯一手段）—— 原文保留（行尾已标注）。

### 18-6 仍待 Kevin 拍板（**如实登记 · 不得当已采纳 / 已生效**）

| # | 待拍板项 | 现状 |
|---|---|---|
| ① | **一致性守卫纳入 `npm test` / 部署前检查** | **未采纳**（部署册 §27 为**建议性质**；本事件登记见部署册 **§28**） |
| ② | **`PUT /tree-meta` 的 legacy 直写加固**：请求**只给文本、不给码**且该树**已有码**时**拒绝覆盖** | **未采纳**（缺陷 J 的**服务端面仍开放**，§17-8 第 4 条） |

- **裁定权属 Kevin**；本节**只登记、不自行裁定**（§11 / §15-6 / §17-11 体例一致）。

### 18-7 作废标注索引（**只加行尾标注 · 不回改历史行**）

| 册 | 行号 | 被推翻的读数（原表述摘） | 行尾标注（逐字） |
|---|---|---|---|
| 本册 `docs/person-places.spec.md` | `:1312` | §17-4「修正口径 ⋯ `diff` **仅 `65c65` 与 `253c253`**」 | ⇒ **已作废（13:08 修正被回退 —— 现值差量 = 仅 `li_26446_02` 一处 / 4+ 3-；取代者 §18）** |
| 本册 | `:1313` | §17-4「md5 ⋯ **`5963106e…`**」 | ⇒ **已作废（真源现值 = `35b08517…`；取代者 §18-1）** |
| 本册 | `:1314` | §17-4「一致性 = **9 棵有码树现已全部一致**」 | ⇒ **已作废（现值 = 一致 **8** / 待修正 **1**；取代者 §18-1）** |
| 本册 | `:1316` | §17-4「幂等 = **复跑字节不变**」 | ⇒ **已作废（该「修正后」状态在真源现值上不成立，幂等复跑无从成立；取代者 §18-1）** |
| 本册 | `:1359` | §17-6「前值 → 新值 ⋯ `5963106e…`」 | ⇒ **已作废（该值既非真源现值 `35b08517…`、亦已非有效契约口径；取代者 §18-5 ②）** |
| 本册 | `:1360` | §17-6「**仍逐字锁具体值**」 | ⇒ **已作废（口径已改：绝对冻值 → 「测试前后自比 + 打印当时指纹」；取代者 §18-5 ② / §18-4）** |
| 本册 | `:1361` | §17-6「口径登记（制度员）」 | ⇒ **已作废（旧口径「锁绝对指纹 / 换值须与已授权真源变更同批登记」已被 Zang 2026-09-20 新口径取代；取代者 §18-5 ②）** |
| 本册 | `:1368` | §17-7 表「报告口径」列 = **`449 / 449 / 0`** | ⇒ **已作废（报告口径列：现值 = 449 / 448 / 1；取代者 §18-1）** |
| 本册 | `:1332` | §17-4.1 机制段（原标「**属推断**」） | ⇒ ✅ **（2026-09-20 §18-3：本条机制已由「属推断」升级为「已定位（逐字引用，仍属只读核对）」；结论不变）** |
| 本册 | `:1334` | §17-4.1 处置建议 ①–③ | ⇒ **（2026-09-20 §18-5：建议①已由 Zang ① 改写为「先落加固、再重放修正」；三项原文保留）** |

- **共 10 处**（**纯行尾追加 · 不增删行** ⇒ §17 各节行号**不变**）。
- **与 §17-9 既有 16 处的关系**：**互不重叠** —— §17-9 作废的是**历史台账**（§15 / §16 / 质检册）中「`shen_27784_01` 待 Kevin 裁定」类**口径**；本节作废的是 **§17 自身**被 13:08 回退**推翻的读数**。**两处并存、语义不同**。
- **不受影响者**：§17-4.1 的实测对照表 · §17-5（守卫脚本能力表）· §17-6 的 ⚠️ 实测行 · §17-7 的「注册测试文件数 / 唯一红 / 修复前工作副本」行 · §17-8（仍待验项）—— 其读数与现值**一致**，**逐字保留有效**。

### 18-8 跨册登记

| 册 | 位置 | 内容 |
|---|---|---|
| 质检册 `docs/person-places.qa.md` | **「追补（Jing · 第三）」**（新增） | 本事件登记 + 本册 `449 / 449 / 0` 两处（`:471` 判据行 / `:545` 复现命令注释）系 **12:29 时点读数**之说明 + 跨册索引 |
| 部署册 `docs/PENDING_DEPLOY.md` | **§28**（新增） | 「真源仍红 / 守卫仍 **exit 1** / 打包前回归门槛为红」+ **部署 / 联调前必须重启 local-server 实例** + Zang 已定 / 待拍板 |

### 18-9 复现命令（本节全部读数 · **只读**）

```bash
cd /Users/kevin/bistro/jiazu
# ① 真源现值（本节：35b08517791c11be68fb3d7b2f4d9820 / 9,636 B / mtime 2026-09-20 13:08:00）
md5 -q config/tree-meta.json; wc -c < config/tree-meta.json
stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' config/tree-meta.json
# ② 守卫（本节：exit 1 / 列 1 棵 shen_27784_01）
node scripts/fix-tree-origin-display.mjs --check | tail -3   # 本册实测：exit 1
# ③ 两棵关键树现值（本节：shen = 山东省临沂市 / li = 黑龙江省牡丹江市穆棱市 · 李氏穆棱家族）
node -e "const m=require('./config/tree-meta.json').trees;for(const i of ['shen_27784_01','li_26446_02'])console.log(i,JSON.stringify(m[i]))"
# ④ 测试基线（本节：449 / 448 / 1；唯一红 = not ok 391 = 冻结值用例）
npm test 2>&1 | tail -8; npm test 2>&1 | grep -nE '^not ok'
# ⑤ 机制（本节：:91 缓存 / getMeta 无 stat / saveMeta 整份落盘）
grep -n 'metaCache' cloudfunctions/compat-api/lib/store.js
grep -n 'statSync\|mtime' cloudfunctions/compat-api/lib/store.js    # 本节：0 命中 ⇒ 加固未落盘
# ⑥ 加固未落盘（本节：:63 仍有 FROZEN_META_MD5 / :982 仍有 assert.equal / resolveOrigin 0 命中）
grep -n 'FROZEN_META_MD5\|resolveOrigin' cloudfunctions/compat-api/lib/person-places.test.js
# ⑦ 差量 / 备份
git diff --stat config/tree-meta.json
md5 -q ~/jiazu-backups/2026-09-20-origin-display-repair/tree-meta.json   # 本节：8be379b4…
# ⑧ 存活实例（本节：pid 25692 = :3410 启动 08:55（嫌疑）/ pid 35229 = :3100 启动 13:16）
ps aux | grep -E 'local-server\.js' | grep -v grep
# ⑨ 边界自查
git status --short AGENTS.md; md5 -q AGENTS.md
wc -l docs/person-places.spec.md docs/person-places.qa.md docs/PENDING_DEPLOY.md
```

### 18-10 本节边界（逐条）

- **只写文档**：未改**任何**代码（**含 §18-4 所列修复 —— 本节不实现**）、未写真源（`config/**` / `migrate-output/**` 零写入；`config/tree-meta.json` md5 **前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**）、未改 `AGENTS.md`（前 = 后 = **空**）、未执行部署 / 打包 / 重传 / 迁移 / 提交。
- **只追加**：本节为**新节**（接 §17）；历史行**原文保留**，仅在 §18-7 所列 **10 处行尾追加**标注（**未删字、未改字、未动表格结构、未增删行**）。
- **不推算**：§18-1 / §18-2 的分时刻结论均锚定 **mtime（13:08:00）** 与 **进程启动时间（08:55）** 等**可复跑**读数；**未做写入实验** ⇒ 机制表述为「**已定位（只读代码 + 时间轴）**」，**不写「已实验复现 / 已证实」**。
- **不写「已修」**：§18-4 两项**未落盘**、§18-5 两条口径**未落地**、§18-6 两项**未采纳** ⇒ **不得据本节认为风险已闭合**。
- **裁定权**：加固**是否**合并、修正**何时**重放、守卫**是否**纳入门槛 —— **裁定权属 Zang（口径）/ Kevin（拍板）**，本节**只登记、不自行裁定**。

### 18-11 本节撰写期间的状态变更（**只追加**：加固 ① 已落盘 · 复核时点 **2026-09-20 13:32:06 CST**）

| 项 | **复核时点实测** |
|---|---|
| ① 外部变更检测 | ✅ **已落盘**（**工作区未提交**）：`cloudfunctions/compat-api/lib/store.js` `git diff --stat` = `1 file changed, 69 insertions(+), 14 deletions(-)`（本节初稿时点该文件**不在** `git status` 中） |
| 落盘内容（逐字引用） | `let metaStamp = null;`（**`:93`**，注释「local 模式：`metaCache` 对应的磁盘指纹（mtimeMs/size/ctimeMs）」）· `function statMetaFile()`（**`:273-278`**：`fs.statSync(META_FILE)` → `{ mtimeMs, size, ctimeMs }`，拿不到 stat → `null`）· `function sameMetaStamp(a, b)`（**`:282-284`**）· **`getMeta()`**（**`:303-338`**）：local 分支「`metaCache` 命中时**先 `stat` 再比对 `mtimeMs + size + ctimeMs`**，**任一变化即重读并刷新缓存**」；cloud 分支「行为与改动前一致」· **`saveMeta()`**（**`:340-354`**）：写后 `metaCache = meta; metaStamp = statMetaFile();`（注释：对齐指纹，避免把自己刚写的文件误判为外部变更） |
| 与 §18-3 口径的一致性 | ✅ **实现侧独立复述本节口径** —— `store.js` 注释**逐字**：「tree-meta 是**唯一没有乐观锁的全量落盘文件**……（2026-09-20 事故：修正脚本改好的 `origin` 被「修正前就已启动」的实例整份回写抹回）」 |
| 残留窗口（实现侧自述 · **逐字**） | 「⚠️ 残留窗口：`getMeta()` → `saveMeta()` 之间仍有 TOCTOU（本函数只解决**读侧陈旧**，不引入写锁 —— 写侧的整份覆盖语义不在本次改动范围内）」 |
| ② 冻值断言改造 | ❌ **仍未落盘** —— `person-places.test.js` **仍有** `:63` `FROZEN_META_MD5 = '5963106e…'` + `:982` `assert.equal(...)`；**`resolveOrigin` 零命中** ⇒ §18-4 ② 行**仍有效** |
| 复测读数 | 真源 md5 **`35b08517791c11be68fb3d7b2f4d9820`（未变）** · 守卫 `--check` **exit 1** · `npm test` **449 / 448 / 1**（`not ok 391` 仍在 · `duration_ms` ≈ 2,025.5）· `git status --short AGENTS.md` **空** |
| 存活实例 | **未变**：pid **25692**（:3410，启动 **08:55**）· pid **35229**（:3100，启动 **13:16**） |

- **★ 关键推论（登记 · 影响部署规程）**：加固 ① **只对「改动落盘之后启动」的实例生效** —— **pid 25692 启动于 08:55，仍在运行改动前的代码** ⇒ **它仍是活跃的覆盖风险源**。故 §18-2 与部署册 **§28-2 第 5 条「重启所有 local-server 实例」仍是必需项**，**不得**因加固落地而省略。
- **口径（逐字 · 不得写「已修」）**：① 虽**已落盘**，但**未提交、②未落盘、修正未重放、无专项复跑证据** ⇒ **风险未闭合**；本节**不写「已修 / 已闭合」**。落地后的读数须**由实测回填**（入口 §18-9 ⑤⑥）。
- **本节纪律不变**：本次追加**仍为只写文档** —— 未改代码（`store.js` 的改动**非本节所为**，本节**未触碰**）、`config/tree-meta.json` md5 **仍 = `35b08517791c11be68fb3d7b2f4d9820`**、`AGENTS.md` 前 = 后 = **空**、未执行部署 / 打包 / 迁移 / 提交。
