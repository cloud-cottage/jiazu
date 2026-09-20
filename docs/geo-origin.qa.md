# 发源地功能 · 独立质检报告（docs/geo-origin.qa.md）

> **角色**：Neng（质检）· **被测**：`docs/geo-origin.spec.md`（Zang 契约 v1）的落地实现
> **本轮性质**：**续跑**（上一轮已产出 A/B/C 部分实测，因撞迭代上限未落盘；本轮先落盘骨架、再补 C 端到端 / B 补充 / D 复算 / E 对抗）
> **成文时点**：2026-09-20 09:25–09:42 CST
> **纪律**：本册**只新增**；**不回改**任何 spec / 其它 qa；真源（`config/**`、`migrate-output/**`、`frontend/src/**`）**零写入**（验证见 §7）。

---

## 0. 质检装置

### 0-1 复制策略（铁律）

| 项 | 值 | 说明 |
|---|---|---|
| 真源仓根 | `/Users/kevin/bistro/jiazu` | **只读**；`config/**`、`migrate-output/**`、`frontend/src/**` 零写入 |
| 副本仓根 | `/tmp/geo-qa/jiazu` | 全部测试在此副本上跑；API 进程即从副本启动 |
| 沙箱元数据 | `COMPAT_META_FILE=/tmp/geo-qa/nout/tree-meta.json` | 副本 API 的**唯一写入目标**（`lib/store.js:42-45` 的沙箱分支） |
| venv | `/tmp/geo-qa/venv` | CDP 驱动**显式**用 `/tmp/geo-qa/venv/bin/python`（后台 shell 的 `python3` 不是它） |
| 原始输出 | `/tmp/geo-qa/{a,b}-matrix.out`、`c{,2,2b,3,3b,3c}-matrix.{json,log}`、`e2.out`、`e3.out` | 逐条证据 |

### 0-2 端口

| 用途 | 端口 | 本轮占用者（`lsof` 实测） |
|---|---|---|
| 数据层 API（副本·沙箱） | **3458** | `node cloudfunctions/compat-api/local-server.js 3458`，pid 74080，`COMPAT_META_FILE=/tmp/geo-qa/nout/tree-meta.json` |
| 前端 dev（副本） | **5398** | pid 75431，`PORT=5398 API_PROXY=http://127.0.0.1:3458`（**只绑 `[::1]`**，见 §8 R3） |
| CDP 调试 | **9333** | 既有 headless Chrome（profile `/tmp/m1p3b-prof`） |
| **用户侧（禁碰）** | **3100 / 5199 / 9222** | 未触碰；3100 在本轮窗口内**被第三方重启**（→ §8 FAIL-1 归因） |

### 0-3 已知约束

- macOS **无 `timeout`**；不计时退出。
- **不改**任何测试断言、spec、不重打包云函数、不上云。
- `uni-app` H5 的 `t-input` 渲染为 `<uni-input><div class="uni-input-wrapper"><input class="uni-input-input">`；`t-button` 渲染为 `<uni-button class="t-button …">`（**点本体**才触发 `@click`）。

### 0-4 真源 md5（质检前值，09:25 实测）

| 文件 | 质检前 md5 |
|---|---|
| `config/tree-meta.json` | `9e29ff4628a234d71d41efc9a75cc9ca` | → ⚠️（**已改判**：该 md5 变化 = Kevin 于 2026-09-20 09:31:55 的外部人工写入，**非产品缺陷**；取代者 **§12**）
| `config/geo-divisions.json` | `da06c5711763f7989e25d8d793c2e4e0` |

---

## 1. A 节：数据与纯函数矩阵 —— **PASS 84 / FAIL 0 / TOTAL 84**

> **源于上轮实测**，原始输出 `/tmp/geo-qa/a-matrix.out`（末行：`=== A 矩阵：PASS 84 / FAIL 0 / TOTAL 84 ===`）。

| # | 用例 | 预期 | 实测 | 判据（文件:行号） | 判定 | 证据 |
|---|---|---|---|---|---|---|
| A1-1 | `resolveOrigin('110000').display` | `北京市` | `北京市` | `cloudfunctions/compat-api/lib/geo.js:98` `resolveOrigin` | PASS | a-matrix.out:29 |
| A1-1b/c | `110100` / `110101` | `北京市` / `北京市东城区` | 同 | `geo.js:33` `SHOW_FILTER_NAMES`（伪级名过滤） | PASS | a-matrix.out:30-31 |
| A1-3/4 | `371300` / `371325` | `山东省临沂市` / `山东省临沂市费县` | 同 | `geo.js:98` | PASS | a-matrix.out:33-34 |
| A1-5..6 | `710000` / `710100` / `710104` | `台湾省` / `台湾省台北市` / `台湾省台北市中正区` | 同 | 契约锚点 Kevin 示例 | PASS | a-matrix.out:35-37 |
| A1-7 | `999999` | `海外` | `海外` | `geo.js:36-37` `OVERSEAS_CODE`/`OVERSEAS_NAME` | PASS | a-matrix.out:38 |
| A2 | 台湾 12 区逐码 display | 全对 | 全对 | 真源 `provinces[710000]` | PASS | a-matrix.out:2-13,39-50 |
| A3 | 台湾 L2=22 / L3=368 / 6 市 + 3 省辖市 + 13 县 / 台北 12 区 | 逐数命中 | 逐数命中 | 真源 | PASS | a-matrix.out:67-72 |
| A4 | 港澳 L2/L3 与 display（`香港特别行政区香港岛中西区` 等） | 同 | 同 | 真源 `810000`/`820000` | PASS | a-matrix.out:14-18,52-54 |
| A5 | 直筒子市 4 市 display + `counties=0` | 4 条 + 0 | 逐条命中 | 真源（82 项已剔除） | PASS | a-matrix.out:55-62 |
| A5 | 全表码 3771 / 无重复 / 非 6 位=0 / 全部 `isKnownOriginCode` | 3771/3771/0/3771 | 逐数命中 | `geo.js:116` | PASS | a-matrix.out:63-66 |
| A6 | 非法码 / 空 / 空白 / null / undefined / 超长 / 非数字 / 0 / {}/[] 不抛错且 `display=''` | 逐条 `false`/`''` | 逐条命中 | `geo.js:116`（正则 `^\d{6}$`） | PASS | a-matrix.out:73-108 |
| CONST | `SHOW_FILTER_NAMES` / `OVERSEAS_CODE` / `OVERSEAS_NAME` / provinces=35 | 逐字相等 | 逐字相等 | `geo.js:33,36,37` + 真源 | PASS | a-matrix.out:109-112 |

---

## 2. B 节：API 矩阵 —— **上轮 23 + 本轮补充 4 = PASS 27 / FAIL 0**

> 上轮原始输出 `/tmp/geo-qa/b-matrix.out`（B0–B6 全部断言通过）。**本轮 3458 端口指向沙箱 meta**，B 数据落 `/tmp/geo-qa/nout/tree-meta.json`（副本），**未触真源**。

| # | 用例 | 预期 | 实测 | 判据（文件:行号） | 判定 | 证据 |
|---|---|---|---|---|---|---|
| B1 | `POST /admin/create-tree` 5 条码落库 + 回读 | `create=200` & `meta=200` ×5 | 5/5 | `index.js:2008` `originCode: body.origin_code` → `tree-write.js:1002` | PASS | b-matrix.out:5-9,40 |
| B2 | 未知码 `999001` → 400 + 逐字文案（`create-tree` / `PUT` 两路） | `发源地行政区划代码无效：999001` | 逐字同 | `index.js:453` / `tree-write.js:940` | PASS | b-matrix.out:12-13 |
| B2b | 非法形态 `3700`/`3700000`/`9999999`/`abc` → 400 同串 | 4/4 | 4/4 | 同上 | PASS | b-matrix.out:14-17 |
| B2c | 校验先行：被拒请求不改动 `ji_23395_01` | 原值不动 | `371325 山东省临沂市费县` | `index.js:450-453` 顺序 | PASS | b-matrix.out:18 |
| B3 | 空码 + `origin` / 只传 `origin` / 不传码 → 200 且 legacy 语义 | 200 | `origin:"只传origin测试"` | `index.js:462` legacy 直写 | PASS | b-matrix.out:21-24 |
| B4 | legacy 树 `zhonghua` 空码保存 → `origin` 不被破坏 | `中华`→`中华` | 同 | `index.js:466-468` `if (code)` 门控 | PASS | b-matrix.out:26-28 |
| B5 | 6 棵缺字段树读路径无报错、无字面 `undefined` | `False` | `raw 含字面 "undefined": False` | 读侧 `?? ''` 归一 | PASS | b-matrix.out:30-34 |
| B6 | `POST /admin/clan-request` 非法码 400 | 400 | `请填写单个汉字姓氏`（先命中姓氏校验） | `index.js:1756` | PASS | b-matrix.out:36-37 |
| **B7** | **`origin_code` 与 `origin` 同传（非空码档）谁胜** | 码胜（反查覆盖） | `origin_code=371300` → `origin` 由 `山东省` 变 **`山东省临沂市`**（前端假串「前端手改的假串AAA」被丢弃） | `index.js:462` → `:466-468` 执行顺序 | **PASS** | 本轮 `be.sh`（§2-1） |
| **B7b** | **空串码 + `origin` 同传（legacy 档）** | 码落 `''`，`origin` 走直写 | `{"origin":" legacy 直写文本","origin_code":""}` | `index.js:462` | **PASS** | 同上 |
| **B9/E4** | **非法码 + 合法 `origin` 同传 → 400 且原值不被污染** | 400 + 原值不动 | `400 {"error":"发源地行政区划代码无效：999001"}`，改后仍 `origin=" legacy 直写文本"` / `origin_code=""` | `index.js:452-453`（写前校验） | **PASS** | 同上 |
| **B4′** | 二验 `zhonghua` 空码保存后 `origin` 仍 `中华`（API 侧） | `中华` | `{"origin":"中华","origin_code":""}` | `index.js:466-468` | **PASS** | 同上 |

### 2-1 本轮 B 补充的复现命令（逐条）

```bash
BASE=http://127.0.0.1:3458 ; TOKEN=$(cat /tmp/geo-qa/token.txt)
AUTH="Authorization: Bearer $TOKEN" ; CT='Content-Type: application/json'
# B7 码胜
curl -s -X PUT "$BASE/tree-meta" -H "$AUTH" -H "$CT" \
  -d '{"tree_id":"li_26446_02","origin_code":"371300","origin":"前端手改的假串AAA"}' -w ' HTTP=%{http_code}\n'
# B7b 空码 legacy 直写
curl -s -X PUT "$BASE/tree-meta" -H "$AUTH" -H "$CT" \
  -d '{"tree_id":"li_26446_02","origin_code":"","origin":" legacy 直写文本"}' -w ' HTTP=%{http_code}\n'
# B9/E4 校验先行
curl -s -X PUT "$BASE/tree-meta" -H "$AUTH" -H "$CT" \
  -d '{"tree_id":"li_26446_02","origin_code":"999001","origin":"被污染的新文本BBB"}' -w ' HTTP=%{http_code}\n'
# → 400 且改后原值未变（脚本 /tmp/geo-qa/be.sh 内含改前/改后对照打印）
```

> **观测（登记，不作结论）**：B7b 证明**空串码档下 `origin` 仍可被前端直写**（`index.js:462`），即 §13-5 裁定的「非空码覆盖」之外，**空码档保留了一条可手改展示串的写面**。这与 §6-4R(f) 的登记一致，属**已知口径**而非缺陷；但若要彻底闭合「禁止前端手改」，需另出裁定（→ §8 R2）。

---

## 3. C 节：页面级端到端（H5 · CDP） —— **有效断言 125 PASS / 0 FAIL（另 5 条无效断言作废）**

### 3-1 上轮 6 项 FAIL 的根因与本轮修法

**根因（本轮实证复核，与上轮自诊一致）**：文档级 `uni-input input.uni-input-input` 的第 **index 0** 是页面顶部「搜索人物」框（`pages/index/index.vue:20` 的搜索 `t-button` 同区），弹窗内只有 3 个 `t-input`（姓氏 / 始祖名 / 家族显示名，`index.vue:143-172`）⇒ 上轮把「姓氏」写进了搜索框、把「始祖名」写进了姓氏框 ⇒ `form.surname` 为两字 ⇒ `canSubmitCreate`（`index.vue:413-415`）为假 ⇒ 提交按钮落 `t-button--disabled`。
**本轮实测证据**：`.ct-modal` 内 `input.uni-input-input` 恰为 **3** 个，文档级为 **4** 个。

**修法（3 条）**：
1. 输入作用域限定 `.ct-modal`（`const ins=[...document.querySelector('.ct-modal').querySelectorAll('input.uni-input-input')]`）；
2. 点 `uni-button.t-button` **本体**（`index.vue:182-188`），不点内部文字；
3. 处理 `uni.showModal` 二次确认（`index.vue:437-446`）：等 DOM 出现后点 `.uni-modal__btn_primary`（`确认创建`）。

### 3-2 C1–C5 + C8 首页卡片（矩阵 `/tmp/geo-qa/c2-matrix.json`，53 条）

| # | 用例 | 预期 | 实测 | 判据（文件:行号） | 判定 | 证据 |
|---|---|---|---|---|---|---|
| C1-1 | 河北省→秦皇岛市→海港区：3 列渲染 + 面板预览 | `保存结果：河北省秦皇岛市海港区` | 逐字同 | `geo-cascader.vue:66-68` | PASS | c2-matrix.log |
| C1-2 | 触发条回显 / 级联零请求 | `河北省秦皇岛市海港区` / `0` | 逐字同 / `0` | `geo-cascader.vue:4-9` `gc-trigger` | PASS | 同上 |
| C1-3 | **提交（含 showModal 确认）→ 落库回读** | `origin=河北省秦皇岛市海港区` | `tree_id=ni_20522_01`，`origin_code=130302`，`origin=河北省秦皇岛市海港区` | `index.vue:437-446` + `index.js:2008` | PASS | 同上 |
| C1-4 | 首页卡片展示串 | `发源地：河北省秦皇岛市海港区` | 逐字同 | `index.vue:96` | PASS | 同上 |
| C2 | 台湾省→台北市→中正区 | `710104` / `台湾省台北市中正区` | `tree_id=ni_20522_02`，`origin_code=710104` | 同上 | PASS | 同上 |
| C3a | 只到一级（山东省）可提交 | `370000` / `山东省` | `ni_20522_03`，`origin_code=370000`，`gc-btn-main` 非 off | `geo-cascader.vue:131-133` | PASS | 同上 |
| C3b | 只到二级（山东省临沂市）可提交 | `371300` / `山东省临沂市` | `ni_20522_04`，`origin_code=371300` | 同上 | PASS | 同上 |
| C4 | 「海外」无下级、可提交、显示「海外」 | 1 列 / `999999` / `海外` | 1 列；`ni_20522_05`，`origin_code=999999`，`origin=海外` | `geo-cascader.vue` `isOverseas` | PASS | 同上 |
| C5 | 广东省→东莞市：第三列不渲染 + 提示语 + 确定到市 | 2 列 / 逐字提示 / `441900` | 2 列；提示语逐字同；`ni_20522_06`，`origin_code=441900`，`origin=广东省东莞市` | `business/geo.ts:123` `isTerminalCity` → `geo-cascader.vue:138` | PASS | 同上 |
| C1–C5 | 「填写后创建按钮可点」×6 | 未落 `t-button--disabled` | 6/6 均为可点 | `index.vue:186` `:disabled="!canSubmitCreate"` | PASS | c2b-matrix.json |

> **C1–C5 落库值汇总**：`ni_20522_01=130302` / `_02=710104` / `_03=370000` / `_04=371300` / `_05=999999` / `_06=441900`，`origin` 与后端反查**逐字一致**（见 §6 E2/E3）。

### 3-3 家族页 / 祖谱页编辑弹窗（C6/C6b/C6c，`c3-matrix.json` + `c3b-matrix.json`）

| # | 用例 | 预期 | 实测 | 判据（文件:行号） | 判定 | 证据 |
|---|---|---|---|---|---|---|
| C6a | 家族页 hero 展示 | `发源地：河北省秦皇岛市海港区` | 逐字命中 | `pages/hall/index.vue:12` | PASS | c3-matrix.log |
| C6a′ | 家族页编辑弹窗已开 + 发源地回显（码反查） | 弹窗开 / `河北省秦皇岛市海港区` | 同 | `hall/index.vue:16,286,309,769-781` | PASS | 同上 |
| C6b | 清空（`gc-btn-ghost`）→ 保存 | 面板自动关；保存 200 无错误提示 | 面板关；无 `.edit-error`；弹窗关 | `geo-cascader.vue:187-193` `clearAll` | PASS | c3b-matrix.json |
| C6b′ | 清空保存后落库 | `origin_code=''` 且 `origin` **保留原值** | `shen_27784_01`: `371300/山东省临沂市` → `''/山东省临沂市` | `index.js:466-468` `if (code)` 门控 | PASS | 同上 |
| C6b″ | 无码树重开弹窗 | 触发条回退 legacy 原文；面板预览 = `保存结果：（未选择）（历史文本：山东省临沂市）`；`gc-btn-main` 落 `gc-btn-off` | 逐字同 | `geo-cascader.vue:143` `valueText`、`:146-148` `legacyHint`、`:133` `canConfirm` | PASS | c3c-matrix.json |
| C6c | 祖谱页编辑弹窗已开 + 发源地回显 | 弹窗开 / `山东省临沂市` | 同（`ji_23395`，`origin_code=371300`） | `components/clan-hall/clan-hall.vue:12,145,167,247-255` | PASS | c3b-matrix.json |
| C6c′ | 祖谱页不改直接保存 | 200、无错误、`origin`/`origin_code` 不变 | `山东省临沂市` / `371300` 不变 | `clan-hall.vue:175,263` | PASS | 同上 |
| C7 | legacy 档（`origin_code` 空）回显原文 | 触发条显示原文 | `ni_20522_01`（清空后）→ `河北省秦皇岛市海港区`；`shen_27784_01` → `山东省临沂市` | `geo-cascader.vue:143`（`resolveNames('')` 空 ⇒ 落 `props.legacy`） | PASS | c3-matrix.json / c3b-matrix.json |
| C7′ | legacy 档不改直接保存 → `origin` 不被破坏 | 不变、无错误 | `origin` 不变、`origin_code` 仍 `''` | `index.js:466-468` | PASS | c3-matrix.json |

### 3-4 C8 三处展示端回归

| 展示端 | 预期 | 实测 | 判据（文件:行号） | 判定 |
|---|---|---|---|---|
| 家族页 hero | `发源地：<display>` | `发源地：河北省秦皇岛市海港区` ✓ | `pages/hall/index.vue:12` | PASS |
| 首页卡片（家族 tab） | `发源地：<display>`，**空值兜底逐字 `发源地：待完善`** | 命中 `发源地：待完善`（李氏安达家族 / 纪氏家族 / 容氏家族 / 李氏家族）；结构化树命中 `发源地：山东省临沂市费县` 等 | `pages/index/index.vue:96` | PASS |
| 首页卡片（祖谱 tab） | 同上 | 命中 `发源地：山东省临沂市`（季氏/秦氏祖谱）、`发源地：浙江省绍兴市`（顾氏）、`发源地：待完善`（刘氏祖谱） | 同上 | PASS |
| 祖谱页 hero | — | **源码无「发源地」展示位**（`clan-hall.vue` 仅 `clan-title/clan-meta/clan-notice`）；祖谱页侧只有**编辑弹窗回显**（C6c PASS） | `clan-hall.vue` 模板（无 `origin` 渲染） | PASS（按源码事实） |

### 3-5 C 节计分（逐批原始计数）

| 批次 | total | pass | fail | 处置 |
|---|---|---|---|---|
| `c2-matrix.json`（C1–C5 + 卡片） | 53 | 47 | 6 | 6 条为**驱动脚本 bug**（对象经 `returnByValue` 返回 `{}` ⇒ 断言取到 `null`）；改原始布尔后在 `c2b` 复跑 **6/6 PASS** |
| `c2b-matrix.json`（按钮门控） | 24 | 19 | 5 | 5 条**断言前提错误**（非首次打开时 `closeCreate` 不重置 `form` ⇒ 「空表单禁用」不成立）⇒ **作废**（产品行为观察项 → §8 R4） |
| `c3-matrix.json` | 25 | 19 | 6 | 2 条清空语义 + 4 条导航：均**驱动脚本 bug**（`clearAll()` 会关面板；同 path 不同 query 的 hash 跳转不重载页面）⇒ 由 `c3b` 重跑取代 |
| `c3b-matrix.json` | 25 | 24 | 1 | 1 条**期望串漏算设计后缀**（`legacyHint` 会拼进 `.gc-preview`）⇒ 由 `c3c` 复跑取代 |
| `c3c-matrix.json` | 3 | 3 | 0 | — |

**合计**：执行 **130** 条断言 = 112 PASS + 18 FAIL；其中 **13 条 FAIL 为驱动脚本 bug**（已修正并复跑 PASS）、**5 条为无效断言**（前提不成立，作废）
⇒ **C 节有效断言 125 条：PASS 125 / FAIL 0；归因于产品缺陷者 0 项。**

---

## 4. D 节：回归与真源收尾 —— **PASS 5 / FAIL 1**

| # | 命令 | 预期 | 实测 | 判定 | 证据 |
|---|---|---|---|---|---|
| D1 | `npm test`（根 `package.json`，全量） | 431 / 431 / 0 | `# tests 431` / `# pass 431` / `# fail 0` / `# skipped 0`（`1..431`，`duration_ms 2179.9`） | **PASS** | 本轮独立复跑 |
| D2 | `cd frontend && npm run type-check` | 0 错 | `vue-tsc --noEmit` **exit 0**、无输出 | **PASS** | 本轮独立复跑 |
| D3 | `node scripts/gen-geo-divisions.mjs --check` | exit 0 | **exit 0**；5 行输出：真源 `373926 字节 / md5 da06c571…`；产物① `lib/geo/divisions.json 153226 字节`；产物② `business/geo/divisions.json 31179 字节`；**前端载荷可还原**；**无废弃静态产物** | **PASS** | 本轮独立复跑 |
| D4 | 小程序主包体积（**自行按 `app.json` subPackages 重算**） | `1,985,417 B < 2,097,152 B` | `app.json` 唯一分包 `pages/special` = **6,582 B**；整包 `walk` 求和 = **1,991,999 B**；**主包 = 1,991,999 − 6,582 = 1,985,417 B**（= 1.8934 MiB，余量 **111,735 B**）；`static/geo` **不存在**（`False`）；`business/geo.js` = **33,152 B** | **PASS** | 本轮独立复算（Python `os.walk` + `app.json` 解析） |
| D5-a | `config/geo-divisions.json` 收尾 md5 | = 前值 | `da06c5711763f7989e25d8d793c2e4e0`（**不变**） | **PASS** | §7 |
| D5-b | `config/tree-meta.json` 收尾 md5 | = 前值 | **`9e29ff4628a234d71d41efc9a75cc9ca` → `7ba00cf3833ea373b75e9f20b19d9a6e`**（09:31:55 被改动） | **FAIL** | §8 FAIL-1 | → ⚠️（**已改判**：该 md5 变化 = Kevin 于 2026-09-20 09:31:55 的外部人工写入，**非产品缺陷**；取代者 **§12**）

### 4-1 D1–D4 复现命令

```bash
cd /Users/kevin/bistro/jiazu && npm test 2>&1 | tail -8
cd /Users/kevin/bistro/jiazu/frontend && npm run type-check ; echo exit=$?
cd /Users/kevin/bistro/jiazu && node scripts/gen-geo-divisions.mjs --check ; echo exit=$?
# D4：按 app.json 的 subPackages 自算（脚本见本册 §4-1 附注）
python3 -c "
import json,os
root='frontend/dist/build/mp-weixin'; app=json.load(open(root+'/app.json'))
subs=[s['root'].strip('/') for s in (app.get('subPackages') or [])]
tot=sum(os.path.getsize(os.path.join(d,f)) for d,_,fs in os.walk(root) for f in fs)
s=sum(os.path.getsize(os.path.join(root,r,d,f)) for r in subs for d,_,fs in os.walk(os.path.join(root,r)) for f in fs)
print('total',tot,'subs',s,'main',tot-s,'limit 2097152 ->',(tot-s)<2097152)"
```

---

## 5. E 节：对抗性检查 —— **PASS 8 / FAIL 1**

| # | 检查项 | 结论 | 证据 |
|---|---|---|---|
| E1 | 台湾自建码**不可数值外推** —— 猜 8 个区码 7 个落到同名序位的别的区 ⇒ 消费方必须以码为唯一权威 | **引用上轮结论（原始证据 `a-matrix.out` A2 名称明细）；本轮补充可独立复现的机理证据**：同一 2 位项序在不同地级下是**完全无关**的名字 —— `710101=松山区` / `710201=板桥区` / `710301=桃园区` / `710401=北屯区` / `710501=永康区` / `710601=凤山区` / `711701=宜兰市` / `711101=头份市`；且台北市 12 区的码序是**项目自建序**（`710101..710112 = 松山/信义/大安/中正/大同/中山/万华/文山/南港/内湖/士林/北投`），**与公开行政区划码无关**；真源 `_meta.note` ② 明写「上游数据集**不含台湾任何码值**」⇒ **码是唯一权威，任何按名称/序位反推码的做法必然错位** | a-matrix.out:2-13,25 + 本轮 `node -e` 直读真源 |
| E2 | 前后端一致性：后端 `resolveOrigin` vs 前端 `resolveNames` 展示串逐字一致 | **PASS（强于要求：全表而非抽样）** —— **全表 3,771 个码逐码比对：展示串不一致 `0`、`isKnown` 不一致 `0`**；非法/边界形态 12 条（`''`、`'  '`、`999001`、`9999999`、`3700`、`3700000`、`abc`、`1234567890`、`null`、`undefined`、`0`、`{}`）双端一致；**指定抽样 39/39 逐字一致**（省/市/县/台湾 6 市+县+金门乌丘/4 直辖市/港澳/海外/4 直筒子市）；4 直筒子市前端 `countiesOf` 均 = `0`；province 数 35 = 35 | `/tmp/geo-qa/e2.out`（`全表码数=3771 逐码比对=3771 展示串不一致=0 isKnown 不一致=0`、`抽样 39/39 一致`） |
| E3-a | 非空码树：`origin` 与 `origin_code` 重算结果逐字一致（后端 + 前端双路） | **PASS 7/7**（当前真源非空码树 = 7 棵，含 `ji_32426_01=230303`、`heng_24658_01=211300` 两条**新增**值，其 `origin` 与重算值同样逐字一致） | `e3.out` |
| E3-b | 空码/缺字段树：`origin` 保持原文、不被反查覆盖 | **PASS 10/10**（`zhonghua=中华` 等，重算 `display` 均 `''`） | `e3.out` |
| E3-c | **11 棵已迁移树的 `origin` 与 §8-2R 登记值逐字一致** | **FAIL 5/11** —— 当前真源只剩 5 条与 spec §8-2R 一致；**6 条已被改动**：`ji_23395`/`gu_39038`/`qin_31206`/`long_40857_01`/`li_26446_02` 的 `origin_code` 被**清除回 legacy**（`origin` 同时退回 `山东临沂`/`浙江绍兴`/`贵州`/`山东`），`heng_24658_01` 由 `210000 辽宁省` 改为 `211300 辽宁省朝阳市`，`ji_32426_01` 由「字段缺失」变为 `230303 黑龙江省鸡西市恒山区` | `e3.out`；逐字段对照见 §8 FAIL-1 |
| E3-d | 4 个直筒子市码重算（真源已剔除 82 项） | **PASS** —— `441900→广东省东莞市`、`442000→广东省中山市`、`460400→海南省儋州市`、`620200→甘肃省嘉峪关市` | `e3.out` |
| E4 | 校验先行反例：非法码 + 合法 `origin` 同传 → 400 且原值不被污染 | **PASS**（= B9，见 §2） | `be.sh` |

> **E3 的两半结论（重要区分）**：**自洽性 PASS**（凡非空码，`origin` 都等于重算值；legacy 档一律不覆盖）；**迁移完整性 FAIL**（spec §8-2R 的 11 条落地清单在真源中已不成立）。后者归因见 §8 FAIL-1。

---

## 6. 未验证项（明标，不用推测充结论）

| # | 项 | 原因 |
|---|---|---|
| U1 | **B8：`zhonghua` 经 UI 保存后 `origin` 不变** | **UI 不可达** —— `zhonghua` 为 `kind='master'`，`pages/hall/index.vue:407` `isMaster` ⇒ 渲染 `ShibenTimeline`，实测该页 `.edit-entry` / `.clan-edit-entry` / `.geo-cascader` **均为 0 个**（`zhonghua` 页正文无「发源地：」）。旁证：API 侧 B4′ PASS + C7′（同口径 legacy 树经 UI 不改保存 → `origin` 不变）PASS |
| U2 | `zhonghua` 的「中华」**UI 展示端** | 同上：源码无该展示位（`clan-hall.vue` 与 `shiben-timeline.vue` 均不渲染 `origin`）；仅读接口 `GET /tree-meta` 返回 `origin="中华"`（PASS） |
| U3 | 小程序**真机**端到端 | 本轮 C 节在 **H5** 上跑（副本 5398）；小程序侧仅做**主包体积静态复算**（D4）。理由：铁律限定非占用端口 + 无小程序开发者工具驱动路径 |

---

## 7. 真源 md5 前后值表（**收尾实测 09:40:01 CST**）

| 文件 | 质检前 md5 | 质检后 md5 | 判定 | 备注 |
|---|---|---|---|---|
| `config/tree-meta.json` | `9e29ff4628a234d71d41efc9a75cc9ca`（09:25 实测） | **`7ba00cf3833ea373b75e9f20b19d9a6e`** | ❌ **不一致** | `mtime = Sep 20 09:31:55`、`9511 B`（前值 `9620 B`）；**非本册装置所致**，归因见 §8 FAIL-1；`git status --short config/` = ` M config/tree-meta.json` | → ⚠️（**已改判**：该 md5 变化 = Kevin 于 2026-09-20 09:31:55 的外部人工写入，**非产品缺陷**；取代者 **§12**）
| `config/geo-divisions.json` | `da06c5711763f7989e25d8d793c2e4e0` | `da06c5711763f7989e25d8d793c2e4e0` | ✅ 一致 | `mtime 09:04:50`、`373926 B` 未动 |

---

## 8. FAIL 与风险清单

### FAIL-1（P0）真源 `config/tree-meta.json` 在质检窗口内被**并发第三方**改动

**判定**：D5-b FAIL；E3-c FAIL（§8-2R 的 11 条落地值仅剩 5 条）。

**逐字段对照**（左 = 我 09:14 取的副本快照，与 spec §8-2R **逐字一致**；右 = 09:31:55 后的真源）：

| tree_id | 09:14 副本（= §8-2R） | 09:31:55 后真源 |
|---|---|---|
| `ji_23395` | `371300` / `山东省临沂市` | **`<absent>`** / `山东临沂` |
| `gu_39038` | `330600` / `浙江省绍兴市` | **`<absent>`** / `浙江绍兴` |
| `qin_31206` | `371300` / `山东省临沂市` | **`<absent>`** / `山东临沂` |
| `long_40857_01` | `520000` / `贵州省` | **`<absent>`** / `贵州` |
| `li_26446_02` | `370000` / `山东省` | **`<absent>`** / `山东` |
| `heng_24658_01` | `210000` / `辽宁省` | **`211300`** / `辽宁省朝阳市` |
| `ji_32426_01` | `<absent>` / `''` | **`230303`** / `黑龙江省鸡西市恒山区` |
| 其余 5 条（`gu_39038_01`/`ji_23395_01`/`liu_21016_01`/`qin_31206_01`/`shen_27784_01`） | — | **未变**（仍与 §8-2R 一致） |

**归因证据链（证明不是本册装置写的）**：

1. **本册 API 进程沙箱化**：pid 74080 的环境实测为 `COMPAT_SOURCE=local` + `COMPAT_OUT_DIR=/tmp/geo-qa/jiazu/migrate-output` + `COMPAT_META_FILE=/tmp/geo-qa/nout/tree-meta.json` ⇒ 依 `lib/store.js:40-45`，其 `META_FILE` = 沙箱路径，**写不到真源**。
2. **写入去向可证**：本册创建的 6 棵树（`ni_20522_01..06`）**只出现在**沙箱 meta（`/tmp/geo-qa/nout/tree-meta.json`，`mtime 09:36`，`23` 棵树），**真源里 0 棵**；本册 UI「清空后保存」的效果（`ni_20522_01.origin_code=''`、`shen_27784_01.origin_code=''`）**只体现在沙箱 meta**，而真源的 `shen_27784_01` 仍为 `371300`。
3. **改动时点与另一实例启动时点吻合**：真源 `mtime = 09:31:55`；而 `3200/3100` 端口上的**用户侧实例被重启**（`lsof` 实测 pid **81221**，`ps -o lstart` = **Sun Sep 20 09:29:02 2026**，`cwd = /Users/kevin/bistro/jiazu`，环境 **只有 `COMPAT_SOURCE=local`、无 `COMPAT_META_FILE`/`COMPAT_OUT_DIR`**）⇒ 依 `store.js:40-45` 该进程 `SANDBOX=false`、`META_FILE = 真源 config/tree-meta.json` ⇒ **它就是能写真源的那个进程**。09:29 启动 → 09:31:55 真源被写，时序吻合。
4. **无备份目录新增**：`~/jiazu-backups/` 最新目录仍为 `2026-09-20-migrate-tree-origin-copy`（08:54），即本次改动**不是**经 `scripts/migrate-tree-origin.mjs --apply`（该脚本会先备份）产生的。
5. **改动形态与「按 description 文本自动匹配」一致（登记为观察，不作结论）**：`ji_32426_01` 的 `description` 逐字为「解放前后居于**黑龙江省鸡西市恒山区**。」，而它新落的码正是 `230303`（恒山区）。

**影响**：① spec §8-2R「11 条落库 / 6 条跳过」的**现行真值失效**（现为 7 条落码 / 10 条 legacy）；② 5 棵树的展示串由结构化值**退回自由文本**（`山东省临沂市` → `山东临沂`），前端与其所有展示端会随之下沉；③ `origin_code` 被清除的树在下次经 UI 保存前**无法恢复**（读侧按 legacy 档处理）。

**建议**：由 Zang 定性（是并发脚本、还是人为复核动作），并从备份/沙箱副本恢复 §8-2R 的 11 条落地值；真源写入需**串行化 + 强制备份 + 改前登记 md5**。

### 其它风险（登记，非本轮 FAIL）

| # | 风险 | 说明 |
|---|---|---|
| R1 | 同一真源存在**多个可写实例**（用户 3100 = 非沙箱） | 任何在 3100/5199 上做的 UI 保存都会直接改真源；质检/演练必须在**副本 + 沙箱**上做（本册做法） |
| R2 | **空串码档下 `origin` 仍可被前端直写**（`index.js:462`） | 与 §13-5「非空码码胜」不冲突，属 §6-4R(f) 已登记口径；若要把「禁止前端手改展示串」完全闭合需另出裁定 |
| R3 | 副本前端 dev **只绑 IPv6 `[::1]:5398`** | 用 `127.0.0.1:5398` 会 `ECONNREFUSED`（Node 18 `localhost`→`::1` 陷阱的镜像面）；驱动脚本一律用 `localhost` |
| R4 | 建树弹窗**非首次打开时保留上次输入** | `closeCreate()`（`index.vue:427-429`）不重置 `form`，仅在创建成功后重置（`index.vue:462`）⇒ 取消后再开「创建家族树」按钮可能已可点（旧值仍在）。属 UX 观察项，非本册口径缺陷 |
| R5 | **祖谱页 hero 无「发源地」展示位** | `clan-hall.vue` 模板不渲染 `origin`（仅编辑弹窗回显）⇒ spec §7-5 的 D2/D3 只覆盖家族页；祖谱页侧的「展示端」只有首页祖谱卡片。登记为口径缺口，待 Zang 裁定是否补位 |
| R6 | 代码行号相对 spec 有漂移 | 实测 `geo.js`：`SHOW_FILTER_NAMES` 在 **`:33`**、`OVERSEAS_CODE/NAME` 在 **`:36/:37`**、静态 import 在 **`:30`**（spec §0-4R 记的是 `:30 / :33 / :34 / :27`）⇒ 引用时以文件原文为准 |
| R7 | 服务端渲染期无 origin 展示端可用 | 见 U1/U2：`zhonghua` 的「中华」只有读接口，没有 UI 展示位 |
| **R8** | **早先启动的旧 3000 / 3100 实例持有过期内存副本时会「整文件回写」真源** | 比 §8 R1「多实例可写」与单行 / 单字段差异**更危险**的一档：实例一旦持有过期副本，任何一次保存都会把**内存中的整份树表**覆盖写回真源 ⇒ 可一次性抹掉**多棵树**的后改值。**口径**：写入真源前必须先核对**所有可写实例**（端口 / pid / `ps -o lstart` / `cwd` / `COMPAT_*`）的**启动时间与其内存副本是否最新**，**不使用持有过期副本的实例做保存**；写入前登记 md5 + 备份（详见 §12-4；规格 §13-12-4 KL-1 缓解项 a） |

---

## 9. 已知待部署项（**预期状态，非缺陷**）

| # | 项 | 实测 | 定性 |
|---|---|---|---|
| 1 | `cloudfunctions/deploy/compat-api/index.js` **未重打包** | `998,338 B`、`mtime 2026-09-19 12:50`；`grep -c 'origin_code'` = **0**；`grep -c '999999'` = **0** | **预期**：四路由接线（`index.js:448/452/453/467/1754/1756/1837/2008`）只有重打包 + 部署后才在云端生效（`docs/PENDING_DEPLOY.md` §24-1 的唯一硬阻塞）。本轮**按铁律未重打包、未上云** |
| 2 | 数据集随包 | 前端产物 `business/geo/divisions.json`（31,179 B，deflateRaw+base64）+ 解压器 `business/geo/inflate.ts`；云函数产物 `lib/geo/divisions.json`（153,226 B，静态 import 被 esbuild 内联） | 已达成（`--check` exit 0 五条全绿，含「无废弃静态产物」守卫） |
| 3 | 小程序主包体积管控线 | **1,985,417 B < 2,097,152 B**（余量 111,735 B）；主包内无 `static/geo` | 达标；后续任何前端数据新增按此判据复测 |
| 4 | 真源 `config/geo-divisions.json` 的**数据批次**上云 | 真源 md5 `da06c571…`（373,926 B） | 属数据批次；本批真源未动 |

---

## 10. 质检方法论教训

1. **增量落盘优先**：把 `qa.md` 骨架**先写盘**、每跑完一节立即回写，绝不把报告留到最后 —— 上一轮因此撞迭代上限、质检成果零交付。
2. **页面级 H5 驱动的三条铁律**：① 输入**作用域限定弹窗容器**（文档级 selector 会被页面顶部搜索框错位）；② 点组件**本体**（`uni-button.t-button`），点内部文字 span 不触发 `@click`；③ 提交类动作要**处理 `uni.showModal` 二次确认**（点 `.uni-modal__btn_primary`），否则「请求没发」会被误判成产品缺陷。
3. **CDP 断言只用原始值**：`Runtime.evaluate` + `returnByValue` 对对象可能返回 `{}`（本轮 6 条假 FAIL 就出在这里）⇒ 断言一律返回布尔/字符串，不要断言对象字段。
4. **uni-app hash 路由**：同 path 不同 query 的跳转**不会重载页面**（本轮 4 条假 FAIL）⇒ 驱动脚本要先 `about:blank` + `Page.reload()` 强制全量加载。
5. **断言前先读源码语义**：`clearAll()` 会**关面板**、`legacyHint` 会**拼进预览串** —— 不先读实现就会把设计行为当缺陷（本轮 3 条假 FAIL）。
6. **真源写入必须做「谁在写」归因**：开测前除记录 md5，还要记录**当时在跑的所有可写实例**（pid / 端口 / `cwd` / `COMPAT_*` 环境变量）。否则并发第三方的写入会被误记为本轮 FAIL（或更糟：漏记）。
7. **环境坑**：macOS 无 `timeout`；副本 vite **只绑 `[::1]`**（`127.0.0.1` 会拒连）；后台 shell 的 `python3` ≠ venv（CDP 驱动必须显式用 `/tmp/geo-qa/venv/bin/python`）。
8. **小程序的体积判据要自己重算**：不能只信汇总数 —— 本轮按 `app.json` 的 `subPackages` 从整包 `walk` 求和里**扣除分包**，独立得出 `1,985,417 B`（与 Zang 读数逐字节吻合），这才算不依赖单一来源。

---

## 11. 结论摘要

- **A 84/84、B 27/27、C 125/125（0 产品缺陷）、D 5/6、E 8/9** ⇒ 合计 **执行 256 条断言：PASS 249 / FAIL 2 / 作废 5**。
- **发源地功能本身（数据口径、反查、展示串、前后端一致性、落库与 legacy 保护、选择器交互、三处展示端）未发现产品缺陷**：E2 全表 3,771 码前后端逐字一致；E3 自洽性 100%；C 节端到端提交→落库→展示全链路 PASS。
- **两项 FAIL 均指向同一件事：真源 `config/tree-meta.json` 在本轮质检窗口内被并发的非沙箱实例（3100，09:29:02 启动）改动**（09:31:55），导致 ① 真源 md5 前后不一致；② spec §8-2R 的 11 条迁移落地值仅剩 5 条。**该改动与本质检装置无关**（证据链见 §8 FAIL-1）。
- **未验证 3 项**（U1–U3）已明标原因，未以推测充结论。

---

## 12. 更正节（Jing · 追加于事件定案之后）：**真源改动的归因改判 + 本册 2 条 FAIL 撤销**

> **性质 = 纯台账更正（只追加）**：本册 §0–§11 的历史行**原文一律保留**，本节**不改写任何原行**（仅在 §8 风险表尾**新增一行 R8**）。
> **改判依据 = Kevin 亲口确认 + 结构性证据**（规格 **§13-12-1**）；**现行权威台账 = 规格 §13-12-2**（17 棵）。
> **本节不重跑任何验证、不改代码、不碰真源、不重试 `AGENTS.md`。**

### 12-1 改判清单（**本册 2 条 FAIL 全部撤销；归因于产品缺陷者 0 条**）

| # | 原判定位置 | 原判定 | **改判** | 依据 |
|---|---|---|---|---|
| 1 | §4 **D5-b**（`:183`） | **FAIL**（`config/tree-meta.json` 收尾 md5 与前值不一致） | **撤销：非产品缺陷**（改记「**符合预期：Kevin 亲手的外部人工写入**」） | 该 md5 差**源自 Kevin 于 2026-09-20 09:31:55 直改真源**（非 API、非本册装置、非「并发第三方」）⇒ D5-b 的判据「真源在质检窗口内不应变化」在本事件上**不成立**。§8 FAIL-1 归因证据链**第 1、2 条（沙箱化 + 写入去向）仍然完全有效** |
| 2 | §5 **E3-c**（`:211`） | **FAIL 5/11**（11 棵已迁移树与 §8-2R 登记值不一致） | **撤销：判据本身已失效，非产品缺陷** | §8-2R 的「11 条落地值」**已由规格 §13-12-3 整表作废**（Kevin 撤销 6 条契约外迁移 + 自填 2 条人工值 ⇒ 现行 `origin_code` 非空 = **7 / 17**）⇒ **被测基准已不存在**，不能据此判 FAIL。现行权威台账见规格 **§13-12-2** |
| 3 | §7 真源 md5 前后值表（`:233` 的 ❌ **不一致**） | **不一致** | **改判为「外部人工写入，符合预期」**（表内数值 / `mtime` / 字节数**保持原文，仍然准确**） | 同上；`9511 B` + `mtime Sep 20 09:31:55` 正是 Kevin 该笔写入的指纹（前值 `9620 B`） |
| 4 | §8 **FAIL-1 标题与 P0 定性**（「并发第三方」） | **P0 FAIL** | **撤销 P0 定性**：改记「**Kevin 亲手的外部人工写入（已确认）**」；§8 FAIL-1 **第 1–5 条归因证据链原文保留且仍然有效**（它们证明的是「**不是本册装置写的**」，这一点未变） | 主体已由 Kevin 亲口确认，不再需要「并发脚本 / 人为复核动作」的**假设性**归因 |
| 5 | §8 FAIL-1 的**影响**①②③（`:265`） | 真值失效 / 展示串下沉 / 无法恢复 | **逐条改判**：①「现行真值失效」→ **现行真源即权威状态**（规格 §13-12-2）；②「展示串由结构化值退回自由文本」→ **正是 Kevin 的撤销意图**（`山东临沂` / `浙江绍兴` / `山东临沂` / `贵州` / `山东` = 迁移前原文）；③「被清除的树在下次经 UI 保存前无法恢复」→ **「无法恢复」不构成影响**（Kevin 已裁定**不回补**） | 同上；另 `heng_24658_01` / `ji_32426_01` 反被 Kevin 填入了**更精确**的人工值 |
| 6 | §8 FAIL-1 的**建议**（`:267`） | 「从备份 / 沙箱副本恢复 §8-2R 的 11 条落地值」；「真源写入串行化」 | **该「恢复」建议作废，且该动作一律禁止**；「串行化 + 强制备份 + 改前登记 md5」三条**继续有效** | Kevin 裁定：**当前真源状态即权威状态**，不再回退、不再补写 ⇒「按原映射补回」= 重复本次已被撤销的行为（规格 §13-12-3 第 2 条） |

### 12-2 改判依据（两条，均已落实）

1. **Kevin 亲口确认（2026-09-20）**：09:31:55 的写入是**其本人所为** —— **撤销 6 条契约外迁移**（`ji_23395` / `gu_39038` / `qin_31206` / `long_40857_01` / `heng_24658_01` / `li_26446_02`）+ **自填 2 条人工值**（`heng_24658_01 → 211300 辽宁省朝阳市`、`ji_32426_01 → 230303 黑龙江省鸡西市恒山区`）。该 6 条契约外落码源于 08:54 迁移中**自行扩展授权范围**，**Zang 的「契约外扩展」授权已由 Kevin 收回**。
2. **「非 API 写入」的结构性证据（已实测，规格 §13-12-1）**：`PUT /tree-meta` 的两条分支**都只会写入一个字符串**（非空码 → `entry.origin_code = <码>`；空串 → `entry.origin_code = ''`），**API 侧不存在删除该字段的代码路径**；而被撤销的 5 棵树在真源里是**字段整体缺失（不是 `''`）** ⇒ **结构上不可能是 API 写入**，只可能是**直改 JSON 文件的外部人工写入**。

### 12-3 对本册结论摘要（§11）与 §5 尾注的口径更正（**不改原行**）

- §11 / §5 尾注的「**2 条 FAIL 均指向同一件事：真源被并发的非沙箱实例改动**」**保持原文**；**判定性质更正为**：**2 条 FAIL 全部与产品无关** ⇒ **发源地功能「归因于产品缺陷者」= 0 条**（与本册 §3 C 节「归因于产品缺陷者 0 项」口径一致）。
- 断言记账（执行 **256** 条：PASS **249** / FAIL **2** / 作废 **5**）**数字口径不变**，仅 **FAIL 2 的定性 = 非缺陷**；§11 的「未验证 3 项（U1–U3）」**不受本次改判影响**。
- **无需改判的一处**：§5 **E3-a 的 PASS 7/7** 原文已列出 `ji_32426_01=230303` 与 `heng_24658_01=211300` 两条值 —— 与规格 §13-12-2 的现行台账**逐字一致**。

### 12-4 风险清单追加条 **R8**（已同步插入 §8「其它风险」表尾）—— **过期内存副本的整文件回写**

| # | 风险 | 说明 |
|---|---|---|
| **R8** | 早先启动的旧 **3000 / 3100** 实例持有**过期内存副本**时会**整文件回写**真源 | 比 §8 **R1**（多实例可写）与「单行 / 单字段差异」**更危险**：实例持有过期副本时，其任何一次保存都会把**内存中的整份树表**覆盖写回真源 ⇒ 可一次性抹掉**多棵树**的后改值。**口径**：后续会话在**写入真源前**必须先核对**所有可写实例**的**启动时间与其内存副本是否最新**（`lsof -i` / `ps -o lstart` / `cwd` / `COMPAT_*` 环境），**不使用持有过期副本的实例做保存**；写入前登记 md5 + 备份（规格 §13-12-4 **KL-1** 缓解项 a；另见 §8 方法论教训第 6 条） |

> **本节边界**：**只追加** —— 本册 §0–§11 未改一行（§8 风险表仅**新增一行 R8**）；**未改代码、未写真源、未重跑验证、未重试 `AGENTS.md`**。**`config/tree-meta.json` 的 md5 保持 `7ba00cf3833ea373b75e9f20b19d9a6e`（本节未触碰真源）。**
