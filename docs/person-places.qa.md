# 出生地 / 居住地 / 家族树发源地（人工指定）— 独立质检报告（Neng）

> **性质**：本册 = **独立质检证据册**（Neng 2026-09-20）。对「出生地 / 居住地 / 家族树发源地人工指定」这一批功能做**全量重推**：
> 迁移结果验收（矩阵 A）、读写 API 矩阵（B）、H5 页面级真机矩阵（C）、回归与真源零写入不变量（D）、对抗性检查（E）。
> **不采信任何声称**，每条判据**自己复现**；**未实测的项一律标「未验证 + 原因」，绝不推算**。
> **边界**：本册**只写本文件** —— 不改任何测试断言 / spec / 源码 / 真源；**不得回改其它 qa/spec**。

## 0. 装置表（instrumentation）

| 项 | 值 / 命令 |
|---|---|
| 时间基准 | `date` = **2026-09-20 11:42:21 CST**（质检开始） |
| 仓根 | `/Users/kevin/bistro/jiazu` |
| **真源（只读）** | `migrate-output/**`、`config/tree-meta.json`、`frontend/src/**` |
| **数据副本** | `cp -R migrate-output /tmp/qa2/data`（trees/details/collections）；`cp config/tree-meta.json /tmp/qa2/meta/tree-meta.json` |
| **副本 compat-api** | `COMPAT_SOURCE=local COMPAT_OUT_DIR=/tmp/qa2/data COMPAT_META_FILE=/tmp/qa2/meta/tree-meta.json node cloudfunctions/compat-api/local-server.js 3460` |
| **副本前端 H5** | `cd frontend && PORT=5299 API_PROXY=http://localhost:3460 npm run dev:h5`（H5 = `http://localhost:5299`） |
| **页面级驱动** | 独立 Chrome 实例：`--headless=new --user-data-dir=/tmp/qa2-chrome --remote-debugging-port=9334`（**不碰用户默认 profile，不杀用户 Chrome**） |
| 端口避让 | 用户实例 **3100 / 5199 全程不动**（`lsof` 实测 32445 / 32460 持有）；质检只用 **3460 / 5299 / 9334** |
| venv python | 见 §0-2（CDP 驱动必须显式用该解释器） |
| macOS 无 `timeout` | 所有等待用显式轮询 / 后台日志，**不用 `timeout` 命令** |

### 0-1 真源 md5 前值（质检开始时点）

| 路径 | md5（前） |
|---|---|
| `config/tree-meta.json` | `c9112e40760839bc8d2132d6300b838b` |
| `migrate-output/**`（全量聚合，`find -type f \| sort \| xargs md5 -q \| md5 -q`） | `684ceb0bd03d31ef9c08104e3eb6ac41` |
| `frontend/src/**`（全量聚合） | `4258b066b683721fd4e70483cb10d596` |
| `cloudfunctions/deploy/compat-api/index.js` | `d61a8aebfb3f3095baae4e1e731fd675`（998,338 B → **未重打包**，预期） |

### 0-2 已知约束（开局登记）

1. `config/tree-meta.json` 在本会话内**被外部（Kevin 手工）改动 4 次**（最近 11:31:21）。本册质检开始时其 md5 = `c9112e40760839bc8d2132d6300b838b`；若收尾不同，先做**写入者归因**再判定（见 §5）。
2. `docs/person-places.spec.md` = 923 行（`wc -l` 实测），末节 §14-8 为最新真值。
3. `cloudfunctions/deploy/**` 为打包产物，**未重打包 = 预期**，不得作为缺陷上报；**严禁重打包**。
4. 本册所有 API 调用均打 **3460（副本）**，页面打 **5299（副本前端 → 副本后端）**。

### 0-3 进度回写纪律

每跑完一个矩阵**立即回写对应小节**并 `wc -l` 自证；交付物不攒到最后写。

## A. 迁移结果验收（13 棵树 · 对照 `scripts/founder-map.json` + 备份 md5）

**方法**：不采信任何声称，**从磁盘重推**：① 读 `~/jiazu-backups/2026-09-20-founder-birthplace/trees/*.json`（**迁移前的 11:36 前值快照**）；
② 与当前真源 `migrate-output/trees/*.json` 做**结构化 deep-diff**（逐字段，非仅 md5）；③ 与 `scripts/founder-map.json` 的 handle/gramps_id/name 逐条核对；④ 与当前 `config/tree-meta.json` 按 `treeOriginPatchOf` 口径（C8′ ⑥：`origin = code ? resolveOrigin(code).display : (note || '')`）复算期望值。

| # | 用例 | 预期 | 实测 | 判据（文件:行号） | 判定 |
|---|---|---|---|---|---|
| A1 | 13 位始祖 `birth_place` 与 `founder-map.json` 节点对应 | handle 存在于该树、`gramps_id` 与 `name` 逐字一致 | 13/13 handle 命中；gramps_id / name 全等 | `scripts/founder-map.json:1-67`；`scripts/migrate-founder-birthplace.mjs:149-171`（写入前三重复核） | **PASS** |
| A2 | 写入值 = 迁移规则（有码→`{码,note:''}`；无码且 `origin` 非空→`{code:'',note:旧文本}`） | 13/13 命中规则 | 13/13 与「当前 meta 复算的期望值」逐字段相等（见下方明细） | `migrate-founder-birthplace.mjs:174-196` | **PASS** |
| A3 | 被写树**只有**始祖 `birth_place` 一处变化 | deep-diff 恰 1 处，且路径 = `people.<始祖 handle>.birth_place` | **12 棵各恰 1 处**，逐条为 `""` → 目标对象；`families` / 其它 `people` / `version` 等**零差异** | `migrate-founder-birthplace.mjs:212-216`（只改该字段） | **PASS** |
| A4 | 被写树当前 md5 ≠ 备份 `md5-before.txt` 的「前值」 | 每棵不同 | **12/12 不同**（列表见 A6）；另 1 棵见 A7 | `~/jiazu-backups/2026-09-20-founder-birthplace/md5-before.txt:1-18` | **PASS** |
| A5 | 跳过的 4 棵**未被改** | md5 与「前值」逐字节相同、无 deep-diff | `qin_31206_01`（空树 145 B / `people=0`）、`liu_21016`、`rong_23481_01`、`li_26446_03`：**md5 全等、零差异** | 同上 `md5-before.txt:9,10,14,15` | **PASS** |
| A6 | 写盘序列化与 `store.saveTree` 同形状（canonical） | 文件字节 == `JSON.stringify(tree,null,2)` | **17/17 逐字节相同**（md5 与 canonical md5 相等） | `lib/store.js` 写路径口径 | **PASS** |
| A7 | `shen_27784_01` 是 13 棵之一，但**当前 md5 == 前值** | 需归因 | 其始祖 `沈克强` 在 **11:36 备份（迁移前）里已是 `{origin_code:'230305',note:''}`** ⇒ 迁移判 `same`（幂等）**未写**；最终值与当前 meta **一致** | 备份 `trees/shen_27784_01.json` 的 `people.103f95b8762b433c7159c8ea1006` | **PASS（带归因）** |
| A8 | `shen_27784_01` 的码值是否与册载一致 | `docs/person-places.spec.md` §14-2 记 **`371300`** | 真源现值 = **`230305`**（= `黑龙江省鸡西市梨树区`），而其 `origin` 文本 = **`山东省临沂市`** ⇒ **码与文本互斥** | `config/tree-meta.json`（`tree_id=shen_27784_01`）；`spec §14-2:748` | **FAIL（见 F1）** ⇒ **（Jing 追补 2026-09-20：已登记为**待 Kevin 裁定项** —— 见本册末「追补（Jing）」§6；本行判定与归因不改）** | ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**

**A2/A4 明细（真源实测）**

| tree_id | 始祖 | 类型 | 写入值 | 当前 md5（前 8） | 备份前值 md5（前 8） | 变化 |
|---|---|---|---|---|---|---|
| gu_39038_01 | 顾清学 I000143 | 有码 | `{231281,''}` | `2a29eae5` | `fb950f95` | ✔ |
| gu_39038 | 顾清学 I000139 | 无码→note | `{'','浙江绍兴'}` | `e10c6033` | `806dbb75` | ✔ |
| ji_23395_01 | 季花 I000209 | 有码 | `{371325,''}` | `05212dcb` | `64aa3dc3` | ✔ |
| ji_23395 | 季花 I000163 | 无码→note | `{'','山东临沂'}` | `30404dc5` | `c0f70ebc` | ✔ |
| liu_21016_01 | 刘芳池 I000258 | 有码 | `{370000,''}` | `10a7a0a0` | `1cea4ac8` | ✔ |
| shen_27784_01 | 沈克强 I000277 | 有码 | `{230305,''}` | `07cece42` | `07cece42` | **未变（A7）** |
| heng_24658_01 | 恒未知 I000363 | 有码 | `{211300,''}` | `bb3a1532` | `71fce744` | ✔ |
| ji_32426_01 | 纪未知 I000377 | 有码 | `{230303,''}` | `83220d14` | `31c457bf` | ✔ |
| long_40857_01 | 龙未知 I000362 | 无码→note | `{'','贵州'}` | `aa7854ba` | `6669c9e2` | ✔ |
| li_26446_02 | 李未知 I000373 | 无码→note | `{'','山东'}` | `61c6907c` | `584a9f2a` | ✔ |
| li_26446_01 | 李宝华 I000356 | 有码 | `{230305,''}` | `5ae4fe53` | `de857741` | ✔ |
| qin_31206 | 姬搢 I000289 | 无码→note | `{'','山东临沂'}` | `3fdded7e` | `1ed95b8b` | ✔ |
| zhonghua | 风华胥 I0104 | 无码→note | `{'','中华'}` | `cac49710` | `de776b5a` | ✔ |

**跳过 4 棵（md5 逐字节未变）**：`qin_31206_01`（空树）、`liu_21016`、`rong_23481_01`、`li_26446_03`。

**观察（不判缺陷）**：`~/jiazu-backups/2026-09-20-founder-birthplace-copy/`（11:30/11:31）是**副本演练**产物 —— 其 `trees/` 内容是**归一后**的副本状态（`birth_place` 全为对象），其 `md5-before.txt` 记录的是**副本**前值，与真源 11:36 清单**不同（1/17 命中）**。另：其 `tree-meta.json` md5 = `c9112e40760839bc8d2132d6300b838b`，与真源**当前值相同** ⇒ 反证 `tree-meta` 的外部改动发生在 **11:30 之前**（早于两次迁移运行）。

**复现命令**

```bash
cd /Users/kevin/bistro/jiazu
# A2：13 位始祖 vs 当前 meta 复算（输出 13 行，全 PASS）
node -e "import('./cloudfunctions/compat-api/lib/person-places.js').then(async pp=>{const fs=require('fs');const m=JSON.parse(fs.readFileSync('scripts/founder-map.json'));const meta=Object.values(JSON.parse(fs.readFileSync('config/tree-meta.json')).trees);let ok=0;for(const [t,f] of Object.entries(m)){const d=JSON.parse(fs.readFileSync('migrate-output/trees/'+t+'.json'));const n=d.people[f.handle];const e=meta.find(x=>x.tree_id===t)||{};const exp=pp.treeOriginPatchOf(n.birth_place);const want={origin_code:String(e.origin_code||''),origin:String(e.origin||'')};const pass=exp.origin_code===want.origin_code&&exp.origin===want.origin;ok+=pass;console.log(pass?'PASS':'FAIL',t,JSON.stringify(exp),'want',JSON.stringify(want));}console.log('一致',ok,'/13')})"
# A3/A5：deep-diff 备份 vs 真源（12 棵各 1 处；4 棵零差异）
# A6：canonical 序列化（17/17 字节相同）
```

---

## B. 读 / 写 API 矩阵（curl · 副本实例 3460 · token = `16601061656` chief_editor）

**装置**：副本树 = `ji_23395_01`（`kind=family`，母层 `ji_23395`=祖谱，始祖 `季花` `10400594c54f5203f61bf4fa4b20`）；
非始祖节点 = `季友某` `104005911bbaa2edb7dc17b9dc0`（第 2 代）；`季宣某` = 第 3 代（无码）；`季瑞某` = 第 4 代（三代外）。
**竹片基线** = 785 片；每次成功保存 = −1 片。证据目录 `/tmp/qa2/b/`（每例一份 `.code` + `.body`）。驱动脚本 `/tmp/qa2/matrixB.sh`。

| # | 用例 | 预期 | 实测 | 判据（文件:行号） | 判定 |
|---|---|---|---|---|---|
| B0 | 基线读（无地点数据的节点） | `profile.birth` 缺省、`residence_places: []` | `profile.birth=null`、`residence_places=[]` | `index.js:199-210`（`residenceViewOf` / 门控 `birth_date \|\| hasPlaceContent`） | **PASS** |
| B1 | 非始祖 PUT 出生地+居住地 | 200、扣 1 片、树落盘 | `200 {fee:{pieces:1,balance:785,balance_after:784}}`；树 md5 `05212dcb→d920bbdd`；资产文档出现 `edit_fee -1` 流水 | 路由序 `index.js:2545-2600` | **PASS** |
| B2 | 回读四字段逐字 | `profile.birth={date,place,place_code,place_note}` + 顶层 `residence_places[]` | `{date:'',place:'黑龙江省鸡西市梨树区',place_code:'230305',place_note:'质检备注B1'}`；`[{place:'山东省临沂市',place_code:'371300',place_note:'居住地一条'},{place:'',place_code:'',place_note:'无码一条'}]` —— **逐字一致，且 `place` 只由码反查（无码 → 空串，备注重不冒充展示串）** | `index.js:199`；`lib/person-places.js:86-98` | **PASS** |
| B3 | 第 10 条居住地 | 400「居住地最多 9 条」且不扣费不落盘 | `400 {"error":"居住地最多 9 条"}`；竹片 784→784；树 md5 不变 | `lib/person-places.js:22-25,52-58`；接线 `index.js:2550-2556` | **PASS** |
| B4 | 出生地脏码 | 400 文案带该码 | `400 {"error":"出生地行政区划代码无效：999998"}` | `lib/person-places.js:113-115,126-144` | **PASS** |
| B5 | 居住地**第 2 条**脏码 | 同上（逐条判） | `400 {"error":"出生地行政区划代码无效：888888"}` | 同上 | **PASS** |
| B6 | 始祖**只**改两项 | 200；且树内姓名不被改写（回归上一位修的抹姓名缺陷） | `200 {pieces:1}`；竹片 784→783；副本树 deep-diff 仅 `birth_place.note` 与 `residence_places` 两处，`name/surname/given/gramps_id` **零变化**（`季花/季/花/I000209`） | `lib/tree-write.js:184-190`（**只在显式提供 `primary_name` 时改姓名**） | **PASS** |
| B7 | 始祖夹带 `primary_name`（其始祖为**祖谱**镜像） | 403；不得净扣费 | `403 {"error":"始祖节点信息需在本姓祖谱中修改","fee_refunded":true}`；竹片 783→783（净零）；流水出现成对 `edit_fee -1` + `fee_refund +1` | `lib/founder-attach.js:42`（`CLAN_FOUNDER_LOCK_MESSAGE`）；见 **F2** | **PASS（带观察 F2）** ⇒ **（Jing 追补 2026-09-20：**F2 已闭合** —— 现口径 403 拦在扣费前、响应无 `fee_refunded`、流水零新增；见「追补（Jing）」§1-b）** |
| B7b | 始祖夹带 `primary_name`（其始祖为**世本**镜像 · `qin_31206`） | 403 + 声称文案 | `403 {"error":"始祖节点信息需在中华世本（总谱）中修改"}`，**无** `fee_refunded`（路由层拦，未扣费） | `lib/founder-attach.js:40,95-101`（`isFounderMirror` 仅认 `external_tree === masterTreeId`） | **PASS** |
| B8 | `POST /admin/set-tree-origin` 成功 | 200 `{ok,origin_code,origin,source}` | `200 {"ok":true,"origin_code":"230305","origin":"黑龙江省鸡西市梨树区","source":{"handle":"104005911bbaa2edb7dc17b9dc0","gramps_id":"I000208","name":"季友某"}}`；副本 meta **仅** `ji_23395_01.origin_code/origin` 两字段变化（deep-diff 2 处） | `index.js:504-534` | **PASS** |
| B9a | 未登录 | 401 | `401 {"error":"未登录或登录已过期"}` | `index.js:505-506` | **PASS** |
| B9b | 非 chief（member token） | 403 | `403 {"error":"需要总编辑权限"}` | `index.js:507-508` | **PASS** |
| B9c | meta 无该树 | 404 文案带 tree_id | `404 {"error":"未找到 tree: no_such_tree_zzz"}` | `index.js:512` | **PASS** |
| B9d | 节点不属于本树 | 400 | `400 {"error":"该节点不属于本树"}` | `index.js:516` | **PASS** |
| B9e | 节点在始祖三代外（第 4 代 `季瑞某`） | 400 | `400 {"error":"该节点不在本树始祖三代范围内（仅始祖及其下两代可作为发源地）"}` | `index.js:520` | **PASS** |
| B9f | 三代内但出生地无码（`季宣某`） | 400 | `400 {"error":"该节点未填写出生地行政区划代码"}` | `index.js:522` | **PASS** |
| B9g | 始祖无法认定（`zhonghua`：无 `founder_handle` + 3 个非镜像根） | 400 带实际根数 | `400 {"error":"本树无法认定始祖：未登记始祖，且非镜像根节点有 3 个"}` | `lib/founder-attach.js:191-192` | **PASS** |
| B10a | `GET /tree/origin-candidates` 全列 | 含**无码节点**；`generation` 1/2/3；`is_current` | `200`；3 项：`季花(g1, 371325, is_current=true)`、`季友某(g2, place_code:'')`、`季宣某(g3, place_code:'')` —— **无码节点未过滤** | `index.js:2644-2668` | **PASS** |
| B10b | 始祖无法认定时**不报 400** | 200 + `founder:null` + `candidates:[]` | `200 {"founder":null,"current":{"origin_code":"","origin":"中华"},"candidates":[]}` | 同上 | **PASS** |
| B11 | 历史字符串节点读侧归一（C3） | `place:''` + `place_note:<原串>` | 节点 `季志全`（`103f95b86f7c41b9ec482ae0799c`，树内 `birth_place="山东省费县"`）→ `place=''`、`place_note='山东省费县'`（不崩不丢） | `lib/person-places.js:39-43` | **PASS** |
| B11b | 历史字符串 vs 对象：**保存路径**等价（E2） | 归一后同值 → `unchanged:true`、0 片 | `200 {"ok":true,"unchanged":true,"fee":{"pieces":0,...}}`；树 md5 不变 | `lib/economy-fee.js` `isPersonUnchanged` | **PASS** |
| B12 | 空 body | 400 逐字文案 | `400 {"error":"请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）"}` | `index.js:2566` | **PASS** |
| B13 | `residence_places` 传**非数组**（`"not-an-array"`） | 契约未裁定 | `200`，**扣 1 片**，落库被归一为 `[]`（原 2 条被清空） | `lib/person-places.js:46-49`（非数组 → `[]`） | **观察 O3** ⇒ **（Jing 追补 2026-09-20：**O3 已定案** —— 现口径 = 400 `居住地格式无效，应为数组`，不扣费、不落盘、原值不变；见「追补（Jing）」§1-a）** |
| B14 | `birth_place: null` | 视为「未提供」 | `400` 无效请求（同 B12） | `lib/economy-fee.js` `hasPersonChanges`（`null` 不算显式提供） | **PASS** |
| B15 | `{origin_code:'',note:''}`（有旧备注时） | 视为变更（清空） | `200` 扣 1 片 | — | **PASS** |
| B16 | 非 6 位码 `12345`（R1 边界） | 400 | `400 {"error":"出生地行政区划代码无效：12345"}` | `lib/geo.js` `isKnownOriginCode` | **PASS** |
| B17 | 仅备注无码（`{origin_code:'',note:'仅备注'}`） | 合法读响应形态 | `200`；落库 `{origin_code:'',note:'仅备注'}` | `lib/person-places.js:39-43` | **PASS** |
| B18 | **恰好 9 条**（上限边界） | 200（只有第 10 条被拒） | `200 {pieces:1}`；副本树 `residence_places` 长度 = 9 | `lib/person-places.js:52-58`（`length > 9`） | **PASS** |
| B19 | 10 条 + 夹带 `primary_name` | 400 且**姓名不被先改写** | `400 {"error":"居住地最多 9 条"}`；`name=季友某/季/友某` 未变 | `lib/tree-write.js:192-195`（上限校验在任何字段写入之前） | **PASS** |

**B 矩阵证据目录**：`/tmp/qa2/b/*.{code,body}`（B12–B19 为后补批，其余由 `matrixB.sh` 生成）。竹片快照：`b0=785 / b1=784 / b3=784 / b5=784 / b6=783 / b7=783 / b8=783 / b9=783 / b11=783 / 末=779`。

**复现（节选）**

```bash
TOK=$(cat /tmp/qa2/chief.token)   # 由 3460 实例 send-code/login 现取（写的是副本 collections）
curl -s -X PUT http://localhost:3460/api/people/104005911bbaa2edb7dc17b9dc0 \
  -H "Authorization: Bearer $TOK" -H 'X-Tree-Id: ji_23395_01' -H 'Content-Type: application/json' \
  -d '{"birth_place":{"origin_code":"230305","note":"质检备注B1"},"residence_places":[{"origin_code":"371300","note":"居住地一条"}]}'
```

---

## C. H5 页面级真机矩阵（独立 Chrome 9334 → 副本前端 5299 → 副本后端 3460）

**登录态注入方式（本轮改用，规避上轮 `SyntaxError: Invalid regular expression flags`）**：
不再用 `Page.addScriptToEvaluateOnNewDocument` 传内联脚本字符串，而是
① `Page.navigate` 到页面原点 `http://localhost:5299/`（先建立 origin）→ ② `Runtime.evaluate` 执行
`localStorage.setItem('jiazu_auth', JSON.stringify({loggedIn,phone,nickname,role,token,expiresAt}))` →
③ `Page.navigate` 到深链 → ④ **整页 `Page.reload()`**（H5 的 `auth.ts` 在模块加载时读一次 storage，
hash 内跳转不重建文档，必须整页重载才能让注入生效）。
**装置脚本**：`/tmp/qa2/cdplib.py`（CDP 封装，显式用 `/tmp/qc-cdpenv/bin/python`，websocket-client 1.9.0）、
`/tmp/qa2/csession.py`、`/tmp/qa2/c0_smoke.py`、`/tmp/qa2/c1b.py`、`/tmp/qa2/c1d.py`、`/tmp/qa2/c2.py`；
网络取证 = 包装 `window.fetch` 记 `{method,url,body}` 于 `window.__req`（`api.ts` 全部走 `fetch`）。

### C0 装置自检（前置，非判据）

| 项 | 实测 |
|---|---|
| `localStorage` 注入 | `jiazu_auth` 写入成功；`role=chief_editor`；`expiresAt > Date.now()` ✓ |
| 档案页「✏️ 编辑」入口 | **出现**（`UNI-BUTTON`，文本 `✏️ 编辑`，宽 74.67px）✔ |
| 网络录制器 | `window.__req` 存在且随请求增长 ✔（对照组实测捕获到 PUT） |

### C1 人物档案：出生地（省→市→区）+ 备注 → 保存 → 重开回显

**对象**：副本树 `ji_23395_01` · 节点 `季友某` `104005911bbaa2edb7dc17b9dc0`（第 2 代，非始祖）。
页面 = `#/pages/person/detail?tree_id=ji_23395_01&handle=104005911bbaa2edb7dc17b9dc0`。

| # | 用例 | 预期 | 实测 | 判据 | 判定 |
|---|---|---|---|---|---|
| C1a | 三级联动选择（出生地） | 省→市→县逐级可选，确认后触发条回显 | `.gc-panel` 打开；`山东省`→`临沂市`→`费县` 三级列表均命中；`.gc-preview = 保存结果：山东省临沂市费县`；确定后 `.gc-trigger = 山东省临沂市费县▾`；遮罩层消失 | `components/geo-cascader/geo-cascader.vue:20-56,72` | **PASS** |
| C1b | **仅**改出生地 + 备注 → 保存 | 发 1 个 PUT、扣 1 片、面板关闭 | **toast「未做修改」，`PUT` 计数 = 0**，编辑面板**不关闭**（`formDirty=false`） | `person-archive.vue:2076-2078`（`if (!formDirty && !parentDirty)`） | **FAIL（见 F3）** ⇒ **（Jing 追补 2026-09-20：**修复已落盘（工作区，未提交）⇒ 待复验**，**不记「已修复」**；另注该行号已随修复漂移；见「追补（Jing）」§3）** |
| C1c | **仅**改居住地（新增 1 条带码 + 备注）→ 保存 | 发 1 个 PUT | **toast「未做修改」，`PUT` 计数 = 0** | 同上 | **FAIL（同 F3）** ⇒ **（Jing 追补 2026-09-20：同 §C1b —— 已定位 / 修复已落盘 / **待复验**；见「追补（Jing）」§3）** |
| C1d | 对照组：改「名」（顶层字段）→ 保存 | 发 1 个 PUT | `PUT /api/people/104005911bbaa2edb7dc17b9dc0`，toast「已保存（本次消耗 1 片竹片，余 784 片）」，面板关闭 | — | **PASS**（证明保存链路本身通） |
| C1e | 同请求里带上地点改动时 PUT body 的形状 | `birth_place` 只含 `origin_code`/`note`，**不夹带派生 `place`**；`residence_places` 逐项同 | body 实测：`"birth_place":{"origin_code":"371325","note":"QA出生地备注C1"}`、`"residence_places":[{"origin_code":"371300","note":"QA居住地一条"},{"origin_code":"","note":"QA居住地二条无码"}]` —— **无 `place` 字段**；且空条目（第 3 行）**未被提交** | `person-archive.vue:2101-2105`（`normalizePlace` + `prunePlaces`）；`business/place.ts:61-64` | **PASS** |
| C1f | 重开回显 | 出生地展示串 + 备注；居住地逐条回显 | 页面文本：`出生地山东省临沂市费县 · QA出生地备注C1`；`居住地 1 山东省临沂市 · QA居住地一条`；`居住地 2 QA居住地二条无码`（分隔符 ` · ` = `PLACE_NOTE_SEP`；空条目未回显） | `business/place.ts:78-86` | **PASS** |

**C1b/C1c 根因探针（页面内实测，非推断）**：打开编辑面板后，从 `.edit-inline` 的 `__vueParentComponent`
上取组件实例，实测

```
refProbe = { sameBirthPlaceRef: true, sameResidenceArrayRef: true }
```

即 `editForm.birth_place` 与 `editBaseline.birth_place` 是**同一个对象**、`editForm.residence_places`
与 `editBaseline.residence_places` 是**同一个数组**（`person-archive.vue:1992-1994` 的
`editBaseline.value = { ...editForm.value }` 是**浅拷贝**）。
而表单的写入方式是**原地赋值**（`@update:model-value="(v) => editForm.birth_place.origin_code = v"`、
`rp.origin_code = v`、`addResidence` 里的 `push`）⇒ 基线被同步改写 ⇒ `personEditDirty()`
（`placesDirty`）恒判「无改动」⇒ 保存被 `未做修改` 分支吞掉。
**影响面**：只要本次改动**全部**落在出生地 / 居住地两项（本功能的主用例），保存就静默不落库；
只有同一次编辑里**顺带改了姓名 / 生卒 / 性别 / 称号**等顶层字段，地点改动才会随该 PUT 一起提交（C1e 实测）。

### C2 居住地上限（9 条）与第 10 条前端拦截

| # | 用例 | 预期 | 实测 | 判据 | 判定 |
|---|---|---|---|---|---|
| C2a | 由 2 条加到 9 条 | 可加到 9 条 | `initialRows=2` → 连续点「添加居住地」**7 次**，`adds = ["ok"×7]`；`rowCount9 = 9` | `person-archive.vue:2012-2020`（`addResidence`） | **PASS** |
| C2b | 满 9 条时按钮置灰 + 提示 | `disabled` 态 + 文案 | 提示文本 `residenceHint9 = 已达上限 9 条，如需新增请先删除一条。`；按钮 class 含 `t-button--disabled` 且 `disabled` 属性存在（`aria-disabled` 亦在） | `person-archive.vue:412-428`、`:2005-2010` | **PASS** |
| C2c | 第 10 条前端不发请求 | 行数不变、零请求 | 第 10 次点击后 `rowCountAfter10Click = 9`、`noNewRow = true`（按钮处于 disabled 态，点击不新增行） | `person-archive.vue:2013-2017` | **PASS**（行数不变实测；请求计数本用例未单独计数，以「按钮 disabled + 无新行」为判据） |
| C2d | 9 条随 PUT 提交 → 后端 200 → 回显 9 条 | 200、回显 9 条 | `PUT /api/people/104005911bbaa2edb7dc17b9dc0` 发出（本次因**同批改了顶层字段「名」**`友某→友某Z` 才走到保存分支 → 见 F3）；body 的 `residence_places` 恰 **9 项**、逐项仅 `{origin_code,note}`（**无派生 `place`**），`birth_place` 同为 `{origin_code:'371325',note:'QA出生地备注C1'}`；toast `已保存（本次消耗 1 片竹片，余 782 片）`（783→782）；`panelGone=true`；整页 reload 后页面文本按序回显 `居住地 1..9`（含无码条目 `居住地 2 QA居住地二条无码`） | 证据 `/tmp/qa2/c2.txt`；`person-archive.vue:2101-2115` | **PASS** |

**C2 证据原文（`/tmp/qa2/c2.txt`，本轮回填，非重跑）**

```
=== C2 LIMIT PHASE ===
{"refProbe":{"sameBirthPlaceRef":true,"sameResidenceArrayRef":true},"initialRows":2,
 "adds":["ok","ok","ok","ok","ok","ok","ok"],"rowCount9":9,
 "residenceHint9":"已达上限 9 条，如需新增请先删除一条。",
 "addBtn":{"cls":"t-button  t-button--outline t-button--default t-button--rectangle t-button--size-small t-button--disabled","disabledAttr":"","ariaDisabled":"","opacity":"1"},
 "rowTriggers9":[...9 项...],"rowCountAfter10Click":9,"noNewRow":true}
=== C2 SAVE 9 ===
{"nameBefore":"友某","nameAfter":"友某Z","toast":"已保存（本次消耗 1 片竹片，余 782 片）...","puts":[{... "residence_places":[9 项],"birth_place":{"origin_code":"371325","note":"QA出生地备注C1"}}],"panelGone":true}
=== C2 RELOAD ECHO ===
{"echoRows":[],"count":0,"bodyHead":"人物详情季友某Z ... 居住地 1山东省临沂市 · QA居住地一条 ... 居住地 9山东省 · QA居住地9 ..."}
```

**回填备注（回填时点实测，非本轮）**

1. C2 的 `refProbe` 再次复现 `{sameBirthPlaceRef:true, sameResidenceArrayRef:true}` ⇒ 与 C1b/C1c 根因（F3 浅拷贝基线）同一处，不另立缺陷。
2. C2d 的 PUT **之所以能发出**，是因为同批改了顶层字段「名」；若只改居住地（即 C1c 场景）保存会被 `未做修改` 吞掉 —— 故 C2a–C2d 全 PASS **不推翻** F3。
3. C2d 的 `echoRows` 为空是**选择器未命中**（渲染为非 `.place-edit-row` 的展示块），非回显缺失；同次运行的 `bodyHead` 文本已逐条列出 9 条串，故按文本判 PASS。
4. C2 全部在副本（`/tmp/qa2/data` + 3460 + 5299）上执行，**真源未写**；该副本节点的 `primary_name.first_name` 被改为 `友某Z` 仅落在副本。

### C3 空条目（无码也无备注）不落库、不计入 9 条 —— 「9 行含 1 行空」边界（本轮新跑）

**装置（本轮新建，避免污染上轮副本）**：`/tmp/qa3/data`（`migrate-output` 副本）+ `/tmp/qa3/meta/tree-meta.json`（meta 副本）→
副本后端 **3461**（`COMPAT_SOURCE=local COMPAT_OUT_DIR=/tmp/qa3/data COMPAT_META_FILE=/tmp/qa3/meta/tree-meta.json`）→
副本前端 **5298**（`PORT=5298 API_PROXY=http://localhost:3461 npm run dev:h5`）→ 独立 Chrome **9334**（`--headless=new --user-data-dir=/tmp/qa2-chrome3`，非用户 profile）。
装置脚本 `/tmp/qa3/csession3.py`（CDP 封装 + 带 **status** 的 fetch 录制器）、`/tmp/qa3/c4.py`、`/tmp/qa3/c56.py`、`/tmp/qa3/c6b.py`、`/tmp/qa3/c3.py`；证据 `/tmp/qa3/ev/*.json`。

| # | 用例 | 预期 | 实测 | 判据 | 判定 |
|---|---|---|---|---|---|
| C3 | 9 行含 1 行空（8 行有备注 + 第 9 行无码无备注）→ 保存 | 空条目不落库、提交体 8 条、回显 8 条 | 面板 `rowsTotal=9`、`rowNotes=[行1..行8, ""]`；保存后 `PUT` **200**，请求体 `residence_places` **恰 8 项**（末行空条目被丢弃）；副本树落库 8 条；整页重载后页面按序回显 **8 条**（`QA-C3-行1..8`，空行不回显） | `business/place.ts:53-64`（`isBlankPlace` / `prunePlaces`）；`person-archive.vue:2101-2105` | **PASS** |
| C3-o | 同上行数下「加入口」与上限提示 | — | 9 行（含 1 空行）时「＋ 添加居住地」已置灰、提示 `已达上限 9 条，如需新增请先删除一条。` | `person-archive.vue:2005`（`residenceFull` 用**原始行数**），而**上限拦截**用 `prunePlaces(...).length`（`:2071`） | **观察 O4**（口径不一致：置灰/hint 数空行、拦截不数空行；删掉空行即可再加，**不产生落库越界**） |

**C3 关键实测串**：`{"initialRows":0,"add0..add8":"ok","rowsTotal":9,"rowNotes":["QA-C3-行1",…,"QA-C3-行8",""],"hint":"已达上限 9 条，如需新增请先删除一条。","nameAfter":"友某C3"}`；`put_status=[200]`、`put_residence_len=8`、`toast=已保存（本次消耗 1 片竹片`、`panel_gone=true`。
**注**：本用例按 C1d 对照组方式**同批改了顶层「名」**（`友某→友某C3`）才走到保存分支 —— 这是 F3 未修的既有事实，非 C3 的判据。

### C4 家族页（`pages/hall/index.vue`）发源地候选选择器（本轮新跑）

**对象**：副本树 `ji_23395_01`（`kind=family`，页面 `#/pages/hall/index?tree_id=ji_23395_01`）。
**副本夹具**：先给第 2 代 `季友某` 一个码（`PUT {"birth_place":{"origin_code":"371300","note":"QA-C4-fixture"}}` → `200 pieces:1`，785→784），使其成为**非当前的可选候选**；第 3 代 `季宣某` 保持无码作置灰样本。

| # | 用例 | 预期 | 实测 | 判据 | 判定 |
|---|---|---|---|---|---|
| C4a | hero 初值 | 展示当前发源地 | `发源地：山东省临沂市费县`（= 始祖 `季花` 的码 `371325`） | `hall/index.vue:12,792-796` | **PASS** |
| C4b | 候选行内容 | 名称 + 代数 + 出生地串 | 3 行：`季花 / 始祖 / 山东省临沂市费县 / 当前来源`、`季友某 / 子代 / 山东省临沂市`、`季宣某 / 孙代 / 未填写出生地`；顶部 `当前发源地：山东省临沂市费县` + `来源节点：季花` | `origin-picker.vue:34-57,113-119` | **PASS** |
| C4c | **无码节点置灰不可选** | 置灰 + 逐行提示 + 点选无效 | `季宣某` 行 class = `op-row op-row-off` + 行内提示 `该节点未填写出生地行政区划代码，不可作为发源地`；**点击该行后 `on:false`（未被选中）** | `origin-picker.vue:36-38,150-152`（`pick()` 以 `place_code` 为判据） | **PASS** |
| C4d | 未选中时点「指定为发源地」 | 不发请求 | 按钮 class `op-btn op-btn-off`；点击后 `POST /set-tree-origin` 计数 **0** | `origin-picker.vue:161-163` | **PASS** |
| C4e | 选定（有码·非当前）→ 确认 | 发 POST、200、hero 就地刷新 | 选中 `季友某` → 行 `op-row-on`、按钮 class 变 `op-btn`；点确认 → `POST /api/admin/set-tree-origin` body `{"tree_id":"ji_23395_01","person_handle":"104005911bbaa2edb7dc17b9dc0"}` → **200** `{"ok":true,"origin_code":"371300","origin":"山东省临沂市","source":{"gramps_id":"I000208","name":"季友某"}}`；候选就地重拉（`当前来源` 标签移到 `季友某`、`当前发源地：山东省临沂市`）；**hero 就地变 `发源地：山东省临沂市`（未整页刷新）** | `origin-picker.vue:165-176`；`hall/index.vue:792-796` | **PASS** |
| C4f | `founder:null` 的树给可读提示 | 可读文案、无候选、不写 | 树 `qin_31206_01`（`kind=family`，`founder:null`）：`empty = 本树无法认定始祖，暂不能指定发源地。`，`rows=[]`、`confirmBtn=null`、零 POST | `origin-picker.vue:17-19`；`index.js:2644-2668` | **PASS** |

### C5 祖谱页（`components/clan-hall/clan-hall.vue`）同类入口（本轮新跑）

**对象**：副本树 `liu_21016`（`kind=clan` → `#/pages/hall/index?tree_id=liu_21016` 渲染 `ClanHall`）；**副本夹具**：给第 2 代 `姬昌益`（自有节点）置码 `370000`（`200 pieces:1`，784→783）。

| # | 用例 | 预期 | 实测 | 判据 | 判定 |
|---|---|---|---|---|---|
| C5a | 祖谱页入口存在 | 弹窗内同一 `OriginPicker` | `.clan-hall` 渲染成功（`祖谱` 标签 / `刘氏祖谱` / 世系链段）；点 `✏️ 编辑祖谱信息` 后弹窗内出现 `.origin-picker` | `clan-hall.vue:11-14,165-167` | **PASS** |
| C5b | 候选行 + 无码置灰 | 同 C4b/C4c | 3 行：`姬累/始祖/未填写出生地`(off+提示)、`姬昌益/子代/山东省`(可选)、`刘咏/孙代/未填写出生地`(off+提示)；`当前发源地：未指定` | 同上（共用组件） | **PASS** |
| C5c | 置灰不可选 + 未选中不发请求 | 同 C4c/C4d | 点 `姬累` 行后 `on:false`；未选中点确认 → `POST` 计数 **0** | 同上 | **PASS** |
| C5d | 选定 → 确认 → 200 + 候选就地刷新 | 200；`当前来源` 就地更新 | `POST` body `{"tree_id":"liu_21016","person_handle":"42f5696f40bd3612da2c1dc5"}` → **200** `{"ok":true,"origin_code":"370000","origin":"山东省","source":{"gramps_id":"I000320","name":"姬昌益"}}` → `当前发源地：山东省` + `来源节点：姬昌益`（`op-row-cur`） | `origin-picker.vue:165-176`；`clan-hall.vue:248-254` | **PASS** |
| C5e | 副本 meta 落盘 | 仅该树两字段变 | `/tmp/qa3/meta/tree-meta.json` 实测 `liu_21016 {origin_code:'370000', origin:'山东省'}`、`ji_23395_01 {origin_code:'371300', origin:'山东省临沂市'}`（均为副本） | — | **PASS** |

**C5 备注**：`ClanHall` 的 `onOriginUpdated` 只回写 `clanEntry`（该页 hero 本就不展示发源地，源码注释已言明）⇒ 祖谱页的「就地刷新」判据落在**选择器自身**（`当前来源` / `当前发源地`）+ `clanEntry`，与家族页 hero 不同，**已按实际版式判定，不按家族页口径强求**。

### C6 无码旧数据（历史字符串 → 备注）读 / 回填 / 保存（本轮新跑）

**对象**：副本树 `ji_23395_01` 节点 `季志全` `103f95b86f7c41b9ec482ae0799c`（`gramps_id=I000164`，树内 `birth_place = "山东省费县"` **历史字符串**，无码）。

| # | 用例 | 预期 | 实测 | 判据 | 判定 |
|---|---|---|---|---|---|
| C6a | 档案页能看到备注 | 无码旧数据展示为备注串 | 读形状 `place=''`、`place_note='山东省费县'` → 页面 `t-cell 出生地` 的 note = **`山东省费县`**（`display_before=true`） | `business/place.ts:78-86`（`placeDisplayOf` 无码→只给备注）；后端 `lib/person-places.js:39-43` | **PASS** |
| C6b | 编辑回填 | 备注进「备注」输入、码位为空 | 面板实测 `{"surname":"季","given":"志全","birthNote":"山东省费县","codeTrigger":"选填，逐级选择省 / 市 / 县▾"}` ⇒ 旧串**归入备注**、码**不冒充** | `person-archive.vue:383-390,1997-2000` | **PASS** |
| C6c | 保存不丢备注 | 提交体带 `{origin_code:'',note:'山东省费县'}` | `PUT /api/people/103f95b8…` **200**，body `birth_place = {"origin_code":"","note":"山东省费县"}`（同批顶层改名 `志全→志全Q` 触保存，见 F3）；toast `已保存（本次消耗 1 片竹片…）`；面板关闭 | `person-archive.vue:2101-2105` | **PASS** |
| C6d | 重开回显 + 落库形态 | 备注仍在；树内为对象形态 | 整页重载后 `出生地山东省费县` 仍在；副本树落库 `{"origin_code":"","note":"山东省费县"}`（字符串已被归一为对象，**原串当备注保留**） | `lib/person-places.js` 写路径 | **PASS** |

**P1 小结**：C3 / C4 / C5 / C6 全部 **PASS**（1 条观察 O4：家族页「加入口置灰/hint」按原始行数、上限拦截按丢弃空条目后条数，二者口径不一致但**不产生落库越界**）。
**C4/C5/C6 的写入全部落在副本**（`/tmp/qa3/data`、`/tmp/qa3/meta/tree-meta.json`；3461/5298），真源 `migrate-output/**`、`config/tree-meta.json`、`frontend/src/**` 零写入（见 §P5 收尾 md5）。

**复现（节选）**

```bash
# 装置
COMPAT_SOURCE=local COMPAT_OUT_DIR=/tmp/qa3/data COMPAT_META_FILE=/tmp/qa3/meta/tree-meta.json node cloudfunctions/compat-api/local-server.js 3461
(cd frontend && PORT=5298 API_PROXY=http://localhost:3461 npm run dev:h5)
/tmp/qc-cdpenv/bin/python /tmp/qa3/get_token.py     # 3461 实例 chief token → /tmp/qa3/auth_state.json
/tmp/qc-cdpenv/bin/python /tmp/qa3/c4.py            # C4（家族页）
/tmp/qc-cdpenv/bin/python /tmp/qa3/c56.py           # C5（祖谱页）
/tmp/qc-cdpenv/bin/python /tmp/qa3/c6b.py           # C6（无码旧数据）
/tmp/qc-cdpenv/bin/python /tmp/qa3/c3.py            # C3（空条目边界）
```

---

## 追补：**制度员（Jing）台账追补 —— 后端两缺陷 RED→GREEN 复验 + 基线刷新 + 迁移执行结果回写 + F3 状态登记**（2026-09-20 12:06 CST · **只追加 · 不改历史行**）

> **性质**：本节由 **Jing（制度员）** 追加，**只写文档** —— **未改代码、未真源写入、未改 `AGENTS.md`、未执行部署 / 打包 / 迁移**。§0–§C2 历史行**一律原文保留**；被本节收口 / 取代者**只在原行行尾追加标注**。
> **行数台账**：本节开工时本册 **201 行**（上一位质检员读数）→ 本节追加前实测 **223 行**（其间 **+22 行 = Neng 的 C2 回填**，见 §C2 及「C2 证据原文」）→ 追加后见 `wc -l`。
> **行号漂移提示**：本批后端修复与前端修复**均追加了行** ⇒ §B / §C 中部分判据行号已失效（前端 `person-archive.vue` 现 **2,531 行**）；以本节行号为准。
> 若与其他并发子代理的追加相撞，**以文件内先后顺序为准，本册不删任何行**。

### 1. 后端缺陷 A / B：RED→GREEN 复验（本节实测）

#### 1-a 缺陷 A：`residence_places` 非数组 / `birth_place` 非对象 → 静默清空 + 照常扣费

| 项 | 实测 |
|---|---|
| RED（修复前） | 质检册 §B13 实测：传 `"not-an-array"` → **200 + 扣 1 片 + 原 2 条被清空为 `[]`**（旧判据行 `lib/person-places.js:46-49`）；判定 = **观察 O3** |
| RED（本节复现） | `/tmp` 副本还原旧口径后重跑新测试 → `C1′/C2′ 形状闸门：…` **FAIL**，`AssertionError: 被拒请求不得产生任何资产流水`（`expected 1 / actual 19`，`person-places.test.js:762`） |
| GREEN（现口径） | **400**（文案见 §2），**先于扣费 / 落盘**，**原值不变**；`undefined` / `null`（未提供）仍放行 |
| 锚点 | `lib/person-places.js:92-101`（闸门）/ `:95`（非数组抛出）/ `:98`（非对象抛出）/ `:31`·`:34`（常量）；接线 **`index.js:2555`**（在 `:2561` 上限、`:2568` R1、`:2576` 预检、**`:2599` 扣费**之前） |
| 判定 | ✅ **已修 · GREEN 复验通过**（测试 `person-places.test.js:729` 全断言通过） |

#### 1-b 缺陷 B：祖谱镜像锁「扣费后才拦」→ 403 + `fee_refunded:true`

| 项 | 实测 |
|---|---|
| RED（修复前） | 质检册 §B7 逐字：`403 {"error":"始祖节点信息需在本姓祖谱中修改","fee_refunded":true}`；竹片 `783→783`（净零）；流水成对 `edit_fee -1` + `fee_refund +1` ⇒ 判定 **PASS（带观察 F2）**，**F2 = 待收敛的缺陷** |
| RED（本节复现） | 副本还原旧口径（路由预检只查始祖锁、不传 `body`）后 → `只读预检先于扣费：…` **FAIL**，`AssertionError: 祖谱镜像（上层 = 祖谱）：预检拦在扣费之前 → 不得出现 fee_refunded`（`expected false / actual true`） |
| GREEN（现口径） | **403 拦在扣费前**：**流水零新增**、响应**无 `fee_refunded`**、树未写、余额不变 |
| 修法 | 判据**收敛为单一函数** `personEditLockMessage`（`lib/founder-attach.js:272-279`）：**路由预检 `assertFounderEditable`（`:297`，调用点 `index.js:2576`）与写路径 `lib/tree-write.js:181` 共用**，覆盖本树始祖镜像 / 空白占位 / 祖谱镜像 / 世本镜像 / chain 镜像 |
| 判定 | ✅ **已修 · GREEN 复验通过**（测试 `person-places.test.js:803-880` 逐支通过；**F2 闭合**） |

**缺陷编号收口（行内引用 → 本节归位）**：本册 §A8 / §B7 / §C1b 分别引用了 **F1 / F2 / F3**，但册内此前**无 F 节** ⇒ 本节按引用归位：**F1** = `shen_27784_01` 码与文本互斥（**待 Kevin 裁定**，见 §6）；**F2** = 祖谱镜像锁扣费后才拦（**已闭合**，见 §1-b）；**F3** = 前端脏比对浅拷贝（**已定位 / 修复已落盘 / 待复验**，见 §3）。 ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**

### 2. 逐字文案（新增 2 条 · 保留 3 支 403）

| 逐字文案 | HTTP | 锚点 | 状态 |
|---|---|---|---|
| `居住地格式无效，应为数组` | 400 | `lib/person-places.js:31` / `:95`；`index.js:2555` | 🆕 **新增**（缺陷 A） |
| `出生地格式无效，应为对象` | 400 | `lib/person-places.js:34` / `:98`；`index.js:2555` | 🆕 **新增**（缺陷 A） |
| `始祖节点信息需在本姓祖谱中修改` | 403 | `lib/founder-attach.js:42` | **保留 · 不得合并** |
| `始祖节点信息需在中华世本（总谱）中修改` | 403 | `lib/founder-attach.js:40` | **保留 · 不得合并** |
| `该节点为上层（中华世本）镜像，需到总谱修改` | 403 | `lib/founder-attach.js:44` | **保留 · 不得合并** |
| `空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息` | 403 | `lib/founder-attach.js:46` | 保留（既有） |

- 三条 403 串已被测试**逐字冻结**（`person-places.test.js:855-857` 的 `assert.equal`）⇒ 合并 / 改措辞会立刻红。

### 3. 前端 F3 状态登记（**已定位 / 修复已落盘 / 待复验 —— 不记「已修复」**）

| 项 | 实测 |
|---|---|
| 症状 | 只改【出生地】或只新增 1 条【居住地】→ toast「未做修改」、**PUT 计数 0**（本册 §C1b / §C1c） |
| 根因（已定位） | `editBaseline.value = { ...editForm.value }` **浅拷贝** + 表单**原地赋值** ⇒ 基线被连带改写 ⇒ `placesDirty` 恒判无改动；探针两次复现 `sameBirthPlaceRef:true, sameResidenceArrayRef:true`；对照组 C1d「只改名能存」排除伪 FAIL |
| 修复落盘（本节实测 · 工作区，未提交） | `git diff`：`- editBaseline.value = { ...editForm.value };` → `+ editBaseline.value = cloneFormDeep(editForm.value);`（现 `:2011`）；新增 `cloneFormDeep`（`:1639-1652`）；脏比对新增 `placesDirty` 两条（`:1622-1623`） |
| 状态 | **待复验**（页面级 C1b / C1c 未复跑）⇒ **本册不写「已修复」** |
| 复验注意 | §C1b 的 `:2076-2078`、§C2 的 `:2012-2020` / `:412-428` 为**修复前**行号，须重取 |

### 4. 测试基线刷新

| 项 | 旧值 | 新值（本节实测） |
|---|---|---|
| `scripts.test` | **26** 项 | **27** 项（新增 `lib/person-places.test.js`，`package.json:10` 末项） |
| `npm test` | **431 / 431 / 0** | **448 / 448 / 0**（fail / cancelled / skipped / todo 全 0） |
| 本批新增单测 | — | **2 条**（后端两缺陷：`person-places.test.js:729` / `:803`） |
| 假绿 | 新文案 / R1 零覆盖 | ✅ 已闭合（后端侧）；⚠️ **前端 `origin-picker` 仍无测试覆盖** |

### 5. 迁移执行结果回写（本节重算）

| 项 | 实测 |
|---|---|
| 结果 | **12 棵写入** + **1 棵幂等跳过**（`shen_27784_01`）+ **4 棵跳过**（`qin_31206_01` 空树 / `liu_21016` / `rong_23481_01` / `li_26446_03`） |
| 复核 | 备份 `md5-before.txt` vs 真源逐棵比对 = **12 已变 / 5 未变**（与 §A3 / §A5 / §A7 一致） |
| 备份 | `~/jiazu-backups/2026-09-20-founder-birthplace/`（`md5-before.txt` 1,015 B + `tree-meta.json` + `trees/`；mtime 11:36） |
| 映射表 | `scripts/founder-map.json` **13 条** |
| tree-meta | **全程未变**：备份副本 md5 = 当前真源 md5 = `c9112e40760839bc8d2132d6300b838b`（9,572 B / mtime 2026-09-20 11:31:21；`origin_code` 非空 **8 / 17**） |
| 部署面 | **未重打包**（`cloudfunctions/deploy/compat-api/index.js` = 998,338 B / `d61a8aebfb3f3095baae4e1e731fd675`，与 §0-1 同值）⇒ 本册 §0-2「不重打包 = 预期」继续成立 |

### 6. 待 Kevin 裁定项（**未决 · 不改口径**） ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**

- `shen_27784_01`：真源 `origin_code = 230305`（黑龙江省鸡西市梨树区）与其 `origin` 文本 `山东省临沂市` **互斥**；该树无 `founder_handle`（实测 `None`）。 ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**
- 该树始祖 **`沈克强`**（`I000277` / handle `103f95b8762b433c7159c8ea1006`）的 `birth_place` **迁移前（11:36 备份内）已是** `{origin_code:'230305', note:''}` ⇒ 迁移判**幂等跳过**。
- ⇒ 「**13 棵已写入**」的正确读法 = 「**12 棵由本次迁移写入 + 1 棵迁移前已就位**」；本册 §A8 的 **FAIL（见 F1）** 归因不变，**裁定人 = Kevin**，裁定前不得按任一解释对外引用。 ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**
- 另：规格册 §14-2 第 6 行按旧清单记 `371300`，与真源 `230305` 不一致（本册 §A8 已记）。

### 7. 进度回写（本节时点实测）

| 批次 | 状态 |
|---|---|
| A 迁移验收 | **7 / 8 PASS**（A8 = FAIL 归因，见 §6） |
| B API 矩阵 | **28 / 29 + 3 观察**（观察 O3 / F2 已由本节 §1 收口；B 侧其余判定不改） |
| C0 / C1 / C2 | 已跑（C2 已由 Neng 回填：**C2a–C2d 全 PASS**，见 §C2 与「C2 证据原文」） |
| C3–C6 / D / E | **未跑**（本册未给结论） |

### 8. 复现命令

```bash
cd /Users/kevin/bistro/jiazu
# GREEN
node --test --test-name-pattern='形状闸门|只读预检先于扣费' cloudfunctions/compat-api/lib/person-places.test.js
npm test | tail -6                       # 448 / 448 / 0
python3 -c "import json;s=json.load(open('package.json'))['scripts']['test'];print(len([p for p in s.split() if p.endswith('.js')]))"   # 27
# RED（/tmp 副本还原旧口径；仓内零改动 —— 逐步见规格册 §15-8）
md5 -q config/tree-meta.json             # c9112e40760839bc8d2132d6300b838b
git status --short AGENTS.md             # 与本节开工前一致
```

> **本节边界**：只追加 —— **未改代码、未写真源**（`config/tree-meta.json` md5 前后均 `c9112e40760839bc8d2132d6300b838b`）、**未改 `AGENTS.md`**（`M AGENTS.md` / md5 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行部署 / 打包 / 迁移**；§0–§C2 历史行原文保留（除被收口处的行尾标注）。

---

## 末轮复验：**F3 / F5 / O4 三缺陷独立重推 + P5 md5 收尾 + D 回归复算 + E5 前端 guard**（Neng · 2026-09-20 12:24:54–12:35 CST · **只追加 · 不改历史行**）

> **性质**：本节由 **Neng（质检）** 追加 —— **只写本文件**；**未改代码 / 未真源写入 / 未改 `AGENTS.md` / 未执行部署 · 打包 · 迁移**；§0–§C2 与「追补（Jing）」各节**原文保留**（仅在文末给出闭合改判，不回改历史行）。
> **前提**：F3 / F5 / O4 的实现方证据与自报读数**一律不采信** —— 三个缺陷**全部独立重推**：F5 走 HTTP（真扣费闸门 / 真流水的端到端路径），F3 / O4 / E5 走**页面级真 UI + 真请求录制**。
> **装置（本轮**全新**副本，端口避让）**：数据层 **3462**（`COMPAT_SOURCE=local COMPAT_OUT_DIR=/tmp/qa4/data COMPAT_META_FILE=/tmp/qa4/meta/tree-meta.json node cloudfunctions/compat-api/local-server.js 3462`）；前端 H5 **5297**（`PORT=5297 API_PROXY=http://localhost:3462 npm run dev:h5`）；独立 Chrome **9334**（`--headless=new --user-data-dir=/tmp/qa2-chrome3 --remote-allow-origins=*`）。
> **铁律遵守**：用户实例 **3100 / 5199 全程未动**（`lsof` 实测 32445 / 32460 持有）；**未杀用户 Chrome**（独立 `--user-data-dir`）；登录态注入用已验证配方（导航原点 → `Runtime.evaluate` 写 `localStorage.jiazu_auth` → 深链 → `Page.reload()`）；末轮全部写入落在 `/tmp/qa4/**` 副本。
> **判据编号**：本节自编号 **P1-a … P4-a**，与册内历史编号（A* / B* / C* / O* / F*）不冲突。

### P1 三个缺陷的修复后复验（本节实测）

#### P1-1 `F3`（前端脏比对浅拷贝）— **已闭合 · 4/4 PASS**

| 判据 | 操作（真 UI） | 期望 | 实测（逐字） | 判定 |
|---|---|---|---|---|
| P1-a | **只改【出生地】**：开编辑面板 → 走 `GeoCascader` 真三级联动把码从 `山东省临沂市费县` 改为 `河北省秦皇岛市海港区`（`.gc-preview = 保存结果：河北省秦皇岛市海港区`）→ 保存 | 真发 **PUT≥1**；body `birth_place` 只含 `origin_code`/`note`（**不含派生 `place`**）；面板关闭 | `PUT /api/people/104005911bbaa2edb7dc17b9dc0` 计数 **1** → `200 {"ok":true,"fee":{"unit":"bamboos","pieces":1,"balance":782,"balance_after":781}}`；body `birth_place = {"origin_code":"130302","note":"费县老宅"}`（键集恰 `note`/`origin_code`）；`residence_places` 逐项键集恰 `note`/`origin_code`（**无 `place`**）；toast `已保存（本次消耗 1 片竹片`；`!document.querySelector('.edit-inline') = true`；副本树落库 `birth_place` = `{"origin_code":"130302","note":"费县老宅"}` | **PASS** |
| P1-b | **只新增 1 条【居住地】**：点「＋ 添加居住地」（2 行 → 3 行）→ 只填该行备注 `QA-F3-NEW-居住地` → 保存（不动任何其它字段） | 真发 **PUT≥1**；body `residence_places` 含新条目 | `PUT` 计数 **1** → `200 {"ok":true,"fee":{"unit":"bamboos","pieces":1,"balance":781,"balance_after":780}}`；body `residence_places = [{"origin_code":"370000","note":"济南"},{"origin_code":"","note":"无码一条"},{"origin_code":"","note":"QA-F3-NEW-居住地"}]`（逐项键恰 `note`/`origin_code`）；面板关闭 | **PASS** |
| P1-c | **负对照**：重开面板**不动任何字段** → 保存 | PUT=0 + toast「未做修改」 | `PUT` 计数 **0**；toast `未做修改`；`!!document.querySelector('.edit-inline') = true`（面板保持）；副本树零变化 | **PASS** |
| P1-d | **对照组**：只改【名】（顶层字段，`友某明 → 友某明F3`）→ 保存 | 正常发 PUT、面板关闭 | `PUT` 计数 **1** → `200`（pieces 1）；`birth_place` 键集仍恰 `note`/`origin_code`；toast `已保存（本次消耗 1 片竹片`；副本树 `name = 季友某明F3` | **PASS** |

- 结论：`editBaseline.value = { ...editForm.value }` 浅拷贝导致的「地点单独改动被『未做修改』吞掉」**已不再是缺陷**（对照 / 负对照同时成立 ⇒ 排除伪 PASS）。
- 登记：修复为**工作区未提交**改动（`git status` 实测 ` M frontend/src/components/person-archive/person-archive.vue`，diff `+139 / -6` 行；`cloneFormDeep` 现 `:1639-1652`、基线赋值现 `:2011`）。

#### P1-2 `F5`（后端显式 `null`）— **已闭合 · 4/4 PASS**

副本种子（**只改 `/tmp/qa4/data/trees/ji_23395_01.json`**）：`104005911bbaa2edb7dc17b9dc0`（季友某 I000208）`birth_place = {"origin_code":"371325","note":"费县老宅"}`、`residence_places = [{"origin_code":"370000","note":"济南"},{"origin_code":"","note":"无码一条"}]`；起始资产 `txs=102 / 竹片 785`。

| 判据 | 请求（HTTP，`X-Tree-Id: ji_23395_01` + chief token） | 期望 | 实测（逐字） | 判定 |
|---|---|---|---|---|
| P1-e | `PUT /people/<h>` body `{"birth_place": null}` | 400「请求体不包含可修改内容…」+ 原值不变 + 零扣费 + txs 零新增 | `400 {"error":"请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）"}`；树文件 md5 **不变**；`txs Δ0 / 竹片 Δ0`；`birth_place` 仍 `{"origin_code":"371325","note":"费县老宅"}`、`residence_places` 仍 2 条原样 | **PASS** |
| P1-f | body `{"residence_places": null}` | 同上 | `400` 同逐字文案；树 md5 **不变**；`txs Δ0 / 竹片 Δ0`；两地点字段原样（同上） | **PASS** |
| P1-g | **同批带改名**：body `{"primary_name":{"first_name":"友某明","surname_list":[{"surname":"季"}]},"birth_place":null,"residence_places":null}` | 200 扣 1 片，**地点字段原值不变**（核心） | `200 {"ok":true,"fee":{"unit":"bamboos","pieces":1,"balance":785,"balance_after":784}}`；`txs +1`（末笔 `edit_fee`）/ `竹片 -1`；`name = 季友某明`（改名已落盘）；`birth_place` **仍** `{"origin_code":"371325","note":"费县老宅"}`、`residence_places` **仍** 2 条（`unchanged_vs_seed = {birth_place:true, residence_places:true}`）；读响应 `profile.birth = {"date":"","place":"山东省临沂市费县","place_code":"371325","place_note":"费县老宅"}`、`residence_places = [{"place":"山东省","place_code":"370000","place_note":"济南"},{"place":"","place_code":"","place_note":"无码一条"}]`（**未被 `null` 抹空**） | **PASS** |
| P1-h | **合法空值**：`PUT` 另一节点 `{"birth_place":{"origin_code":"","note":""},"residence_places":[]}`（该节点原 `birth_place = {"origin_code":"371325","note":""}`） | 200 · 正常清空（修复不得堵死清空路径） | `200 {"ok":true,"fee":{"unit":"bamboos","pieces":1,"balance":784,"balance_after":783}}`；落库 `birth_place = {"origin_code":"","note":""}`、`residence_places = []`；随后再写回 `{"origin_code":"371325","note":""}` 亦 `200`（清空后仍可再写，非单向堵死） | **PASS** |

- 结论：`null` = **未提供**（`hasPersonChanges` 不计内容字段 ⇒ 单独提交走「无可修改内容」400；同批改名照收 1 片但**不清空**地点字段）；合法空值（`{origin_code:'',note:''}` / `[]`）**仍可清空** ⇒ 三处口径一致，**已修**。
- 边界登记：`null` 与「形状非法」（`"x"` / `12`）**不是同一分支** —— 后者走 `400 居住地格式无效，应为数组` / `400 出生地格式无效，应为对象`（册内 §1-a / §2 已登记，本节未复跑该分支，**见残留风险 6**）。

#### P1-3 `O4`（前端 9 条门控口径）— **已闭合 · 3/3 PASS**

| 判据 | 构造（真 UI） | 期望 | 实测（逐字） | 判定 |
|---|---|---|---|---|
| P1-i | **9 行含 1 空行**（有效 8：`济南 / 无码一条 / QA-F3-NEW-居住地 / O4-行4…行8` + 1 空行）→ 看「＋ 添加居住地」 | **应可用**（按 prune 后条数） | 按钮 `class` **无** `t-button--disabled`；`hasAttribute('disabled')=false`；hint `最多 9 条；无码也无备注的空条目不会保存。`；**真点得动**：行数 9 → **10**（`add_ok=true`） | **PASS** |
| P1-j | **有效 9 条**（两种构造各一次：① 10 行 = 9 有效 + 1 空行；② 11 行 = 9 有效 + 2 空行）→ 看按钮 | **置灰** + 文案「已达上限 9 条，如需新增请先删除一条。」 | 两种构造下 `class` 均含 **`t-button--disabled`**；hint 逐字 `已达上限 9 条，如需新增请先删除一条。`；**点击不新增**（行数 10→10 / 11→11，`click_noop=true`） | **PASS** |
| P1-k | **边界提交**：11 行（有效 9 + 空行 2）→ 保存 | 200；**空条目不入 body**（body 恰 9 条） | `PUT` 计数 **1** → `200 {"ok":true,"fee":{"unit":"bamboos","pieces":1,"balance":779,"balance_after":778}}`；body `residence_places` **恰 9 条**（两条空条目不出现）、逐项键恰 `note`/`origin_code`；`birth_place` 键恰 `note`/`origin_code`；落库 9 条 | **PASS** |

- 结论：门控（置灰 / hint）与拦截（提交）**同按 `prunePlaces` 后条数** ⇒ 册内 **观察 O4**（「置灰/hint 数空行、拦截不数空行」的口径不一致）**已闭合**，且**未产生落库越界（仍 ≤9）**。
- **观察（不判缺陷 · 登记为残留风险 4）**：`t-button` 的禁用态**未落到根元素的 `disabled` 属性**（`hasAttribute('disabled')=false`、`disabled prop=false`），仅以 `t-button--disabled` class + 组件内部事件拦截实现 —— **功能上确实拦住**（点击零新增），但**键盘 / 读屏可访问性存疑**。

> **本节 P1 判定：F3 ✅ 已修（4/4）· F5 ✅ 已修（4/4）· O4 ✅ 已修（3/3）** —— 三个缺陷**全部闭合**，无 FAIL。

### P2 `P5` 真源 md5 收尾值（本节前后两次读数，**同算法**）

聚合算法与 §0-1 **完全一致**：`find <路径> -type f | sort | xargs md5 -q | md5 -q`；`config/tree-meta.json` 用 `md5 -q`。

| 路径 | 本节**前**值（12:24:54 CST） | 本节**后**值（12:30:12 CST） | 与 §0-1（11:42）比对 | 判定 |
|---|---|---|---|---|
| `config/tree-meta.json` | `c9112e40760839bc8d2132d6300b838b` | `c9112e40760839bc8d2132d6300b838b` | **未变**（= 期望值） | **PASS** |
| `migrate-output/**`（318 文件） | `684ceb0bd03d31ef9c08104e3eb6ac41` | `684ceb0bd03d31ef9c08104e3eb6ac41` | **未变**（= §0-1 值） | **PASS** |
| `frontend/src/**`（60 文件） | `326de355542956cf0615b04a896d9c9e` | `326de355542956cf0615b04a896d9c9e` | **已变**（§0-1 = `4258b066b683721fd4e70483cb10d596`）—— **已归因，非缺陷** | **PASS（带归因）** |

- **归因（写入者 = 并行子代理的 F3 / O4 修复，发生在本节开工之前）**：`frontend/src/components/person-archive/person-archive.vue` mtime **12:16:23**（`+139 / -6` 行）、`frontend/src/business/place.ts` mtime **11:18:21**、`frontend/src/components/origin-picker/` mtime **11:29:19** ⇒ 全部 **早于本节前值读数（12:24:54）**；且本节**前 / 后两次读数完全相同** ⇒ **本节质检过程对 `frontend/src/**` 零写入**。
- 副本侧：`/tmp/qa4/meta/tree-meta.json` = 真源同值 `c9112e40760839bc8d2132d6300b838b`（副本随本周全部写入落 `/tmp/qa4/**`）。
- 部署面：`cloudfunctions/deploy/compat-api/index.js` = **998,338 B / `d61a8aebfb3f3095baae4e1e731fd675`**（mtime 2026-09-19 12:50），与 §0-1 / Jing 节**同值** ⇒ **未重打包**（预期，**不得**作为缺陷上报；亦**严禁**在质检中重打包）。

### P3 `D` 回归复算（本节自跑）

| 判据 | 命令 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| P3-a | `npm test`（27 个测试文件全量） | 449 / 449 / 0 | `1..449` · `# tests 449` · `# suites 0` · `# pass 449` · `# fail 0` · `# cancelled 0` · `# skipped 0` · `# todo 0`（`duration_ms 1867.43`） | **PASS** |
| P3-b | `cd frontend && npm run type-check`（`vue-tsc --noEmit`） | 0 错 | **零输出**，退出码 **0** | **PASS** |
| P3-c | 小程序主包字节（**自算**，按 `dist/build/mp-weixin/app.json` 的 `subPackages`） | 主包 ≤ 2,097,152 B | `subPackages = ["pages/special"]` ⇒ **主包 1,998,964 B / 204 文件**（**与实现方报值逐字节相同**）；分包 6,582 B / 12 文件；合计 2,005,546 B；限 **2,097,152 B（2 MiB）** ⇒ **余量 98,188 B**，**未超** | **PASS** |

- 复算脚本口径：遍历 `dist/build/mp-weixin/**` 全部文件，路径属于任一 `subPackages[].root` 子树者计入分包，其余计入主包（目录自身字节不计）。`dist/build/mp-weixin` 构建产物 mtime **12:17**（属本轮既有产物，**本节未重新构建**）。

### P4 `E5` 前端 guard（组件态注入，绕过置灰）

| 判据 | 操作 | 期望 | 实测（逐字） | 判定 |
|---|---|---|---|---|
| P4-a | 面板打开后，**直接往组件态注入 10 条非空居住地**（`person-archive` 实例 `setupState.editForm`，注：`setupState` 已被 `proxyRefs` 解包，`ef.value` 为 `undefined`，须直接写 `ef.residence_places`）→ 保存 | 前端拦、**零 PUT**、逐字文案 | 注入后 DOM `10` 行（`QA-E5-注入10-行1…10`），按钮 `class` 含 `t-button--disabled`；点保存 → `PUT` 计数 **0**；`.edit-inline .edit-error` = **`居住地最多 9 条，请先删除多余的条目`**（逐字，与前端 `:2102` 一致）；面板未关闭（`true`）；副本树居住地仍为原 9 条（**服务端零变化**） | **PASS** |

- 追加登记：**本轮 UI 路径同样拦得住**（见 P1-j：置灰 → 点击零新增），组件态注入路径**双保险**（P4-a）—— 且后端另有第 10 条 `400 居住地最多 9 条`（册内 §B3 / §B18 已验，本节未复跑）。

### 累计计数（**本节为末轮：历史行原样 + 本节改判，两栏分列**）

**① 册内判据行累计（含本节；历史行按写入时判定，不回改）**

| 来源 | 判据行 | PASS | FAIL | 观察（仅观察） | 备注 |
|---|---|---|---|---|---|
| §A 迁移验收 | 8 | 7 | 1（A8） | 0 | A8 = F1 = `shen_27784_01` 待 Kevin 裁定 | ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**
| §B 读写 API 矩阵 | 29 | 28 | 0 | 1（B13 ⇒ O3） | 另有 1 行 PASS 附带观察（B7 ⇒ F2） |
| §C H5 页面级矩阵 | 27 | 24 | 2（C1b / C1c） | 1（C3-o ⇒ O4） | |
| 「追补（Jing）」后端两缺陷 A/B | 2 | 2 | 0 | 0 | 缺陷 A 已修、F2 闭合 |
| **本节末轮复验 P1–P4** | **18** | **18** | **0** | **0** | F3 4 + F5 4 + O4 3 + P2 3 + P3 3 + E5 1 |
| **合计** | **84** | **79** | **3** | **2** | |

**② 现行有效结论（把本节已闭合项改判后；A8 不变）**

| 项 | 写入时判定 | 现行判定 | 依据 |
|---|---|---|---|
| A8（F1 `shen_27784_01` 码与文本互斥） | FAIL | **FAIL（未决）** —— 待 **Kevin** 裁定 | 本节未触及该树 | ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**
| B7（F2 祖谱镜像锁） | PASS（带观察 F2） | **PASS（F2 已闭合）** | Jing 节 §1-b RED→GREEN |
| B13（O3 非数组静默清空） | 观察 O3 | **PASS（O3 已定案）** | Jing 节 §1-a（现 = 400 + 不扣费） |
| C1b / C1c（F3 只改地点不发 PUT） | FAIL | **PASS** | **本节 P1-a / P1-b**（真 UI 复验） |
| C3-o（O4 门控口径不一致） | 观察 O4 | **PASS（已闭合）** | **本节 P1-i / P1-j / P1-k** |

⇒ **现行**：84 判据 = **PASS 81 / FAIL 1（A8，待裁定）/ 其余 2 行为已闭合留档**；**三个前端 / 后端缺陷（F2 / F3 / F5）与两个观察（O3 / O4）全部闭合**。

### 仍存在的风险 / 未验证项（**不得据本节推断为已验证**）

1. **小程序真机端到端：未验证** —— 本节只**自算**了 `dist/build/mp-weixin` 主包字节（P3-c）与 `type-check`；**未**在微信开发者工具 / 真机上跑「编辑 → 保存 → 回显」（`t-button` 禁用态、`GeoCascader` 点击、`uni.showToast` 在真机端的行为差异未知）。
2. **`shen_27784_01` 待裁定（F1 / A8）：未决** —— 真源 `origin_code = 230305`（黑龙江省鸡西市梨树区）与 `origin` 文本 `山东省临沂市` 互斥；裁定人 = **Kevin**，裁定前**不得**按任一解释对外引用（见 §6）。 ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**
3. **`cloudfunctions/deploy/**` 未重打包** —— `998,338 B / d61a8aebfb3f3095baae4e1e731fd675`（与 §0-1 同值）；**部署前必须重打包**，否则线上仍是旧口径（F5 的 `null` 闸门 / F3 的前端修复都到不了生产）。
4. **`t-button` 禁用态未落 `disabled` 属性（可访问性）** —— 仅 `t-button--disabled` class + 内部拦截；功能已拦（P1-j），但键盘 / 读屏路径**未验证**（§P1-3 观察）。
5. **前端 `origin-picker` / `GeoCascader` / `place.ts` 仍无单测覆盖**（假绿面）—— 本节 F3 / O4 的复验全部依赖**页面级真 UI 脚本**（一次性、不入仓），`npm test` 的 449 项**不含**任何前端用例；前端回归**只能**靠手工 / 脚本重跑。
6. **`null` 与「形状非法」两个分支只验了前者** —— 本节 P1-e/f/g/h 覆盖 `null` 与合法空值；`{"residence_places":"x"}` / `{"birth_place":12}` 的 `400 居住地格式无效，应为数组` / `400 出生地格式无效，应为对象` 仅有册内 §1-a 与单测证据，**本节未复跑**。
7. **前端修复未提交** —— `person-archive.vue` 等仍为工作区改动（`git status` = ` M`）；**未入库**（未 commit / 未 push），有被工作区其它操作覆盖的风险。
8. **副本 ≠ 生产** —— 本节全部读写打在 `/tmp/qa4` 副本（`COMPAT_SOURCE=local`）；生产 `cloud`（MongoDB + 云函数）路径**未验证**，尤其是并发扣费 / 事务语义。
9. **E 组对抗性检查不完整** —— 本册仅有 **E2**（§B11b）与本节 **E5** 的判据；`E1 / E3 / E4` **无登记判据 ⇒ 未验证**。
10. **本轮未复跑 §C 其余页面项** —— C4 / C5 / C6（家族页 / 祖谱页 / 无码旧数据）沿用上轮读数，本节**未重跑**（其结论仍以上轮为准）。

### 复现命令（本节全部读数的可执行入口）

```bash
cd /Users/kevin/bistro/jiazu
# ── 装置（副本 3462 / 5297，用户 3100 / 5199 不动）──
rm -rf /tmp/qa4 && mkdir -p /tmp/qa4/meta /tmp/qa4/ev
cp -R migrate-output /tmp/qa4/data && cp config/tree-meta.json /tmp/qa4/meta/tree-meta.json
COMPAT_SOURCE=local COMPAT_OUT_DIR=/tmp/qa4/data COMPAT_META_FILE=/tmp/qa4/meta/tree-meta.json \
  node cloudfunctions/compat-api/local-server.js 3462 &
(cd frontend && PORT=5297 API_PROXY=http://localhost:3462 npm run dev:h5) &
/tmp/qc-cdpenv/bin/python /tmp/qa4/get_token.py          # chief token → /tmp/qa4/auth_state.json
# ── P1-2 F5（后端 HTTP，含种入 / 扣费 / 流水 / md5 断言）──
python3 /tmp/qa4/f5_be.py
# ── P1-1 F3 / P1-3 O4 / P4 E5（页面级真 UI + 真请求录制，Chrome 9334）──
/tmp/qc-cdpenv/bin/python /tmp/qa4/f3_arm1.py           # P1-a（GeoCascader 真三级联动）
/tmp/qc-cdpenv/bin/python /tmp/qa4/f3_arms234.py        # P1-b/c/d
/tmp/qc-cdpenv/bin/python /tmp/qa4/o4b.py               # P1-i/j/k
/tmp/qc-cdpenv/bin/python /tmp/qa4/e5_fe.py             # P4-a（组件态注入 10 条）
# ── P2 / P3 ──
md5 -q config/tree-meta.json                                                    # c9112e40760839bc8d2132d6300b838b
find migrate-output -type f | sort | xargs md5 -q | md5 -q                       # 684ceb0bd03d31ef9c08104e3eb6ac41
find frontend/src  -type f | sort | xargs md5 -q | md5 -q                        # 326de355542956cf0615b04a896d9c9e（已归因）
npm test | tail -8                                                              # 449 / 449 / 0
(cd frontend && npm run type-check)                                             # 退出码 0
python3 /tmp/qa4/d_pkg.py                                                       # 主包 1,998,964 B / 限 2,097,152 B
```

> **本节边界**：只追加 —— **未改代码 / 未真源写入**（`config/tree-meta.json` 前 = 后 = `c9112e40760839bc8d2132d6300b838b`；`migrate-output/**` 前 = 后 = `684ceb0bd03d31ef9c08104e3eb6ac41`；`frontend/src/**` 本节前 = 后 = `326de355542956cf0615b04a896d9c9e`）、**未改 `AGENTS.md`**、**未执行部署 / 打包 / 迁移**；`docs/person-places.qa.md` 历史行**原文保留**（闭合改判只在「累计计数 ②」与本节判据行内）。
> 数据安全：本节全部写入落在 `/tmp/qa4/**`（副本树 / 副本 meta / 副本资产账本）；用户实例 3100 / 5199 与真源全程零写入。

---

## 制度员复核结论（**Jing · 2026-09-20 12:32:33 CST · 只追加 · 不回改 Neng 的历史行 / 表格与任何判据行**）

> **性质**：本节由 **Jing（制度员）** 追加 —— **只写本文件**，**未改代码、未写真源、未改 `AGENTS.md`、未执行部署 / 打包 / 迁移**。
> **复核对象**：本册全文（551 行）+ 规格册 §15 / §16 + `docs/PENDING_DEPLOY.md` §25 / §26 的**一致性**。**不重跑任何判据、不新增判据、不回改历史行**；本节**不改变**任何判据编号与判定。

**（1）判据计数复核（与 Neng「累计计数 ②」一致，制度员认可，不改判）**

| 项 | 值 |
|---|---|
| 累计判据 | **84** |
| PASS | **81** |
| FAIL | **1**（唯一 = `A8` = `F1` = `shen_27784_01` **待 Kevin 裁定**） | ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**
| 写入时非 PASS、现行已闭合（留档行） | **2**（`B13` 观察 O3 ⇒ 已定案；`C3-o` 观察 O4 ⇒ 已闭合） |
| 制度员结论 | ✅ **与 §「累计计数」② 表逐项一致**；**无冲突、无需改判** |

**（2）缺陷 / 观察闭合复核（对照规格册 §16-1）**

- **5 缺陷 + 2 观察 = 7 项全部闭合**：缺陷 A ✅ · 缺陷 B ✅ · 缺陷 F3 ✅（**末轮 4/4 PASS**：本节 P1-a ～ P1-d）· 缺陷 F5 ✅（**4/4 PASS**：P1-e ～ P1-h）· 缺陷 H ✅（早期已修）· 观察 O3 ✅ · 观察 O4 ✅（**3/3 PASS**：P1-i ～ P1-k）。
- **制度员判定**：**§B7 / §B13 的「观察」不再挂账**（A 已修 ⇒ O3 定案；B 已修 ⇒ F2 闭合）；**§C1b / §C1c 的 FAIL 已由 P1-a / P1-b 的真 UI 复验改判 PASS**（**历史行的 FAIL 字样保留**，改判口径见 §「累计计数」②）。
- **§P1-3 的观察（`t-button` 禁用态未落根元素 `disabled`）**：制度员**同意**登记为**残留风险 / 可访问性观察**，**不判缺陷**（功能拦截已由 P1-j 证实：点击零新增；另有 P4-a 组件态注入路径双保险 + 后端第 10 条 400）。

**（3）E3-x 裁定登记（制度员口径 · 后续引用一律以此为准）**

- **发源地「人工指定」= 一次性结果；来源节点后改（含清空出生地码）⇒ `tree-meta` 不自动回落、候选无 `is_current`，需重新指定**。
- **裁定人 = Zang**，结论 = 「**设计如此，非缺陷**」；依据 = Kevin 已明确「**删掉自动同步镜像的代码逻辑**」（**C8 作废、代码已删**）。
- **制度员纪律**：**禁止**在任何册内把「无自动回落」写成缺陷或风险；**禁止**再出现「发源地自动同步 / 随节点变更回写」的表述。

**（4）未决与不得引用项（登记 · 不予裁定）**

1. **`shen_27784_01`（A8 / F1）**：真源 `origin_code = 230305` 与 `origin` 文本「山东省临沂市」**互斥** ⇒ **唯一 FAIL，待 Kevin 裁定**；裁定前**不得**按任一解释对外引用，映射表 / 验收计数口径须读作「**12 棵由本次迁移写入 + 1 棵迁移前已就位**」。 ⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**
2. **前端修复未提交**（`git status` = ` M`）—— 属**交付纪律风险**（§P1-d 登记、§「仍存在的风险」第 7 条）；制度员同意照登。
3. **残留风险 1–5、7–10**（小程序真机 / `cloud` 路径并发 / 假绿面 / `null` 与形状非法两分支只验前者 / E 组不完整 / 未复跑 §C 其余页项）**照登**：**不得**据本册推断为已验证。

**（5）跨册一致性**

| 册 | 登记位置 | 状态 |
|---|---|---|
| 规格册 | `docs/person-places.spec.md` **§15 / §16**（§16-1 闭合总表 · §16-2 E3-x · §16-3 逐字文案 · §16-4 基线终稿 · §16-5 84 判据 · §16-6 迁移与 md5 · §16-7 残留风险 · §16-8 `AGENTS.md` 拟稿） | ✅ 已追加 |
| 部署册 | `docs/PENDING_DEPLOY.md` **§26**（12 棵树 JSON 重传 / 云函数重打包 / 前端重打 / 冒烟 15 条 / 阻塞 6 条） | ✅ 已追加 |
| 本册 | 本节 | ✅ 只追加 |

> **本节边界**：只追加 —— **未改代码 / 未真源写入**（`config/tree-meta.json` = `c9112e40760839bc8d2132d6300b838b`；`migrate-output/**` = `684ceb0bd03d31ef9c08104e3eb6ac41`）、**未改 `AGENTS.md`**（`M` / md5 `e4c089818fbf7a3a7218e567e7b409ee`）、**未执行部署 / 打包 / 迁移**；Neng 的历史行与表格**逐字原样保留**。

---

## 追补（Jing · 第二）：**缺陷 J 登记 —— 本册「`shen_27784_01` 待 Kevin 裁定」类表述一律作废**（Jing 制度员 · 2026-09-20 · **只追加 · 不回改 Neng 的历史行与表格**）

> **性质**：本节由 **Jing（制度员）** 追加 —— **只写文档**：未改代码、**未写真源**（`config/tree-meta.json` md5 本节**前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**；`migrate-output/**` 零写入）、**未改 `AGENTS.md`**（`git status --short AGENTS.md` 前 = 后 = **空**）、**未执行部署 / 打包 / 重传 / 迁移 / 提交**。
> **本节不新增判据、不重跑判据、不改任何判据编号与判定**；本册「累计计数」① / ② 与「制度员复核结论」各表**一律照旧**（`84 = 81 PASS / 1 FAIL` **不变**）。

### 1. 作废事项（**逐字**）

- 本册**凡**把 `shen_27784_01`（= `A8` = `F1`）记为「**待 Kevin 裁定**」/「未决」/「不得按任一解释对外引用」者，**一律作废** —— **行尾已逐处标注**：`⇒ **已作废（为缺陷 J 的另一例，取代者 §17）**`（其中 **`§17` = 规格册 `docs/person-places.spec.md` §17**）。
- **作废理由（登记 · 只登记事实）**：`shen_27784_01` 的 `origin` 文本（曾 = 『山东省临沂市』）与其 `origin_code`（`230305` = 黑龙江省鸡西市梨树区）互斥，**并非** Kevin 有意保留、待其裁定的方案题，而是**缺陷 J**（弹窗 legacy 直写覆盖发源地显示串）造成的**污染** —— 与 `li_26446_02`（曾 = 『山东』）**同类同因**。污染面 = 全库有码 **9 棵**中的 **2 棵**。
- **不受影响者**：`A8` / `F1` 的**判据编号、FAIL 字样、归因、所在表结构与行内其它字段一律原样保留**（本节**未回改**）。**注意**：据规格册 §17-4.1 实测，`shen_27784_01` 的 `origin` 现值**仍为『山东省临沂市』** ⇒ 该行**照旧 FAIL** —— **判据结论未变，变的只是「待裁」这一口径**。

### 2. 行尾标注位置（本册 · **10 处**）

| 行号 | 位置 |
|---|---|
| `:57` | §A 表 `A8` 行（含上节 Jing 追补注） |
| `:326` | 追补 §「缺陷编号收口」（`F1` 归位） |
| `:371` | 「追补（Jing）」§6 标题 |
| `:373` | §6 第 1 条 |
| `:375` | §6「裁定人 = Kevin」 |
| `:491` | 「累计计数」① §A 行 |
| `:502` | 「累计计数」② `A8` 行 |
| `:513` | 「仍存在的风险 / 未验证项」第 2 条 |
| `:566` | 「制度员复核结论」(1) FAIL 行 |
| `:584` | 「制度员复核结论」(4) 第 1 条 |

（**共 10 处**；行号为本节写入时点 —— 本节为**纯行尾追加**，**不增删行** ⇒ 行号不变。）

### 3. 跨册索引

| 册 | 位置 | 内容 |
|---|---|---|
| 规格册 `docs/person-places.spec.md` | **§17**（新增 · **6 处**作废标注） | 缺陷 J 根因 / 前端修复 / 真源显示串修正 **+ 本册实测复核**（md5 `35b08517…` ≠ 冻结值 `5963106e…`） / 守卫脚本 `--check` / 冻结 md5 换值口径 / 测试基线 **449 / 448 / 1** / 仍待验项 |
| 部署册 `docs/PENDING_DEPLOY.md` | **§27**（新增 · **建议性质 · 待拍板**） | 「部署前先跑 `node scripts/fix-tree-origin-display.mjs --check`」+ 当前 `--check` = **exit 1** ⇒ 按该建议口径即**阻断部署** |

> **本节边界**：只追加 —— 校验读数：`config/tree-meta.json` md5 **前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**；`git status --short AGENTS.md` **前 = 后 = 空**；Neng 的历史行与表格**逐字原样保留**（**仅在 §2 所列 10 处行尾追加作废标注**）。
> **本节数值全部本次实测**（只读；可复跑入口见规格册 §17-10）。

---

## 追补（Jing · 第三）：**「13:08 修正被回退」事件登记 + 本册读数时效说明**（Jing 制度员 · 2026-09-20 · **只追加 · 不回改 Neng 的历史行与表格**）

> **性质**：本节由 **Jing（制度员）** 追加 —— **只写文档**：**未改代码**（`cloudfunctions/**` / `frontend/**` / `scripts/**` / `package.json` 零写入）、**未写真源**（`config/tree-meta.json` md5 本节**前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**；`migrate-output/**` 零写入）、**未改 `AGENTS.md`**（`git status --short AGENTS.md` 前 = 后 = **空**）、**未执行部署 / 打包 / 重传 / 迁移 / 提交**。
> **本节不新增判据、不重跑判据、不改任何判据编号与判定** —— 本册「累计计数」① / ② 与「制度员复核结论」各表**一律照旧**（`84 = 81 PASS / 1 FAIL` **不变**）。

### 1. 事件（跨册登记 · 全文见规格册 §18）

| 项 | 值（本册实测 · 本节时点） |
|---|---|
| 事件 | **K ·「13:08 修正被回退」** —— 规格册 §17 登记的显示串修正（`shen_27784_01`）被一次元数据写入**整体抹掉** |
| 真源 md5 | **`35b08517791c11be68fb3d7b2f4d9820`**（9,636 B · mtime **2026-09-20 13:08:00**）**≠** 契约冻结值 `5963106e1a3d21272565f5ed2a884413` |
| 有码树一致性 | **8 一致 / 1 待修正**（`shen_27784_01` 的 `origin` 仍 = 『山东省临沂市』，`origin_code` = `230305`） |
| 守卫 | `node scripts/fix-tree-origin-display.mjs --check` = **exit 1**（1 棵不一致） |
| `npm test` | **449 / 448 / 1**（唯一红 = `not ok 391` = 冻结 md5 断言） |
| 机制（**已定位**） | `cloudfunctions/compat-api/lib/store.js`：`metaCache`（**`:91`** 进程级缓存）+ `getMeta()`（**`:266-285`**）**仅在缓存为空时读盘、不检测磁盘外部变更** + `saveMeta()`（**`:287-299`**）在**非沙箱**下**整份** `JSON.stringify` 落盘 ⇒ **长驻实例把过期内存整份回写** |
| 定位（逐字） | **`config/tree-meta.json` 是本仓唯一「无乐观锁的全量落盘文件」** ⇒ 最易被过期内存覆盖，且**覆盖静默** |
| 修复 | **已派 · 进行中 · 仓内未落盘**（`store.js` 内 `statSync` / `mtime` **零命中**；测试文件 `:63` / `:982` **仍为绝对冻值**、`resolveOrigin` **零命中**）⇒ **本册不写「已修」** |
| 已定 / 待拍板 | **Zang 已定**：①修正**即将重放**（待加固落地）②冻值断言口径改为「**测试前后自比 + 打印当时指纹**」（真源随人类授权写入变化）。**仍待 Kevin 拍板**：守卫纳入 `npm test` / 部署前检查；`PUT /tree-meta` legacy 直写加固（**均未采纳**） |

### 2. 本册读数时效说明（**只说明，不改任何行**）

| 行号 | 内容 | 说明（**本节时点**） |
|---|---|---|
| `:471` | 「P3-a `npm test` 27 个文件全量 = **449 / 449 / 0**」· 判定 **PASS** | **12:29 时点读数**（Neng 自跑，**当时为真**）⇒ **按「只追加、不改历史行」原文保留**；**但同一命令在今日现值下必然得到 449 / 448 / 1**（真源被 13:08 回退 ⇒ 冻结值失配）—— **判据判定不改，读数时效在此说明** |
| `:545` | 复现命令注释 `# 449 / 449 / 0` | 同为**12:29 时点**读数（**代码块内，本节不回改**）；现值 = **449 / 448 / 1** |
| `:596` | 「追补（Jing · 第二）」边界内 `config/tree-meta.json` = `35b08517…` | ✅ **仍有效**（与现值一致） |
| `:609` | 「`shen_27784_01` 的 `origin` 现值**仍为『山东省临沂市』** ⇒ 该行**照旧 FAIL**」 | ✅ **仍有效**（与现值一致；本节**强化**登记其成因 = 事件 K，而非仅「缺陷 J 污染未清」） |

- **结论（逐字）**：本册**无**任何**判据判定**被 13:08 回退推翻 —— **被推翻的是「修正已落地」这一状态**（规格册 §17-4 / §17-6 / §17-7 的相应读数，**行尾已逐处标注**）。本册 `449 / 449 / 0` 系**历史时点读数**，**不必作废**，但**不得**当作**当前基线**引用。

### 3. 跨册索引

| 册 | 位置 | 内容 |
|---|---|---|
| 规格册 `docs/person-places.spec.md` | **§18**（新增 · **10 处**行尾标注） | 事件 K 全文：实测读数 / 时间轴 / 机制逐字引用 / 修复已派未落盘 / Zang 已定 / 待拍板 |
| 规格册 | **§17-4 / §17-6 / §17-7**（行尾标注） | 被 13:08 回退推翻的读数（`5963106e…` / 「9 棵全一致」/ `449 / 449 / 0`）**逐处标注作废**（原文保留） |
| 部署册 `docs/PENDING_DEPLOY.md` | **§28**（新增） | 部署门槛仍红 + **部署 / 联调前必须重启 local-server 实例** |

> **本节边界**：只追加 —— 校验读数：`config/tree-meta.json` md5 **前 = 后 = `35b08517791c11be68fb3d7b2f4d9820`**；`git status --short AGENTS.md` **前 = 后 = 空**；Neng 的历史行与表格**逐字原样保留**（**本节零行尾改动** —— 本册的时效差异已在 §2 说明）。

### 4. 追加（复核时点 **2026-09-20 13:32:06 CST**）：加固 ① **已落盘（未提交）**

| 项 | 复核时点实测 |
|---|---|
| ① 外部变更检测 | ✅ **已落盘（工作区未提交）**：`cloudfunctions/compat-api/lib/store.js` `git diff --stat` = `1 file changed, 69 insertions(+), 14 deletions(-)`（§1 表「修复」行的「**未落盘**」结论**仅在本节初稿时点成立**） |
| ② 冻值断言改造 | ❌ **仍未落盘** —— `person-places.test.js` `:63` / `:982` **仍为绝对冻值**、`resolveOrigin` **零命中** |
| 复测读数 | 真源 md5 **`35b08517791c11be68fb3d7b2f4d9820`（未变）** · 守卫 **exit 1** · `npm test` **449 / 448 / 1**（`not ok 391` 仍在）· `git status --short AGENTS.md` **空** |
| **★ 关键（部署 / 联调）** | 加固 ① **只对「改动落盘之后启动」的实例生效** —— **pid 25692（启动 08:55）仍在运行改动前的代码** ⇒ **仍是活跃的覆盖风险源**；**重启实例仍是必需动作**（部署册 **§28-2 第 5 条**） |
| 口径 | **①已落盘 ≠ 风险闭合**（未提交 / ②未落盘 / 修正未重放 / 无专项复跑证据）⇒ **本册不写「已修」**；逐字引用与残留 TOCTOU 窗口见规格册 **§18-11** |
