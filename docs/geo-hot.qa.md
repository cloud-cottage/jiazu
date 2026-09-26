# 行政区划热度排序（geo-hot）—— 独立质检报告（n1 · 转录册）

- **质检对象**：`cloudfunctions/compat-api/lib/geo-hot.js`、`cloudfunctions/compat-api/index.js`、`cloudfunctions/compat-api/lib/geo-hot.test.js`、`package.json`、`frontend/src/business/api.ts`、`frontend/src/business/geo.ts`、`frontend/src/components/geo-cascader/geo-cascader.vue`
- **质检人**：独立质检（只验不改 —— 结论一律由真机实例 + 真实数据 + 独立复算得出，不接受源码扫描当结论）
- **本批背景**：口径真源 = `docs/geo-origin.spec.md` 的 **§14（行 1373 起，含子节 14-1 … 14-12）** 与 `docs/PENDING_DEPLOY.md` 的 **§39（行 4688 起）**（两处行锚已只读核对）。本批 = **读侧派生 + 24h 进程内缓存**，**零新增集合、零新写路径**。
- **本册性质**：**转录册**。把 `/tmp/qa-geo-hot` 盘上原始日志与派单登记的实测读数**逐字转录入仓**，**未做任何新探测、未起服务、未跑浏览器**；凡盘上无落盘的读数，均逐条标注来源。本册**不回改**规格册，冲突处一律进 §9。

---

## 0. 取证形态声明（**先读这段**）

| 项 | 声明 |
|---|---|
| **A / B / D / E / F / G 的实测形态** | **副本内最小挂载页**：`/tmp/qa-geo-hot/repo/frontend/src/pages/qa-geo/index.vue`（**真仓零改动**）。组成 = **真实 `geo-cascader.vue` SFC + 真实 `business/api.ts` + Vite dev 代理 + 真源副本后端 3461**。挂载页源码全文见 §7（`mount.vue`，20 行）。 |
| **真实产品页通路（部分取证）** | 真机走「家庭页 → 树内搜索 → 点结果 → 编辑」，弹出的档案表单里**确实渲染了 2 个 `.gc-trigger`**（run1 实测，见 §5 作废轮次），但该通路卡在 **`modal-mask` 遮挡** + **同 URL 导航不重载（复用旧 JS 上下文）**，**未能闭环**，故转挂载页。 |
| **未覆盖处的记法** | 凡此形态不覆盖之处一律记 **NOT TESTED**，**不记 FAIL**。 |

---

## 1. 判定总表（A–J）

| 判据 | 验项 | 结论 | 主要读数锚点 |
|---|---|---|---|
| **A** | 清空基线回原序 | **PASS** | 省级列码序 = 数据集原序**逐位相同**（35 项）；DOM 名序一致 |
| **B1** | 一级造票（省） | **PASS** | `710000` 由 idx31 → **首位**；其后 34 项与 A 序列逐位相同 |
| **B2** | 地级造票 | **PASS** | `rankedCities(710000)` 22 项 = `712200,710100…712000,712100`，与 DOM col1 名序逐位对拍 `True` |
| **B3** | 县级造票 | **PASS** | `rankedCounties(710000,712200)` = `712204,712201,712202,712203`，DOM col2 = 东引乡/南竿乡/北竿乡/莒光乡 逐位 `True` |
| **C** | 真源独立现算对拍 | **PASS** | counts 28 键 / direct 19 键，与独立现算**逐键一致**（only_api=空、only_mine=空、值不符=空） |
| **D** | 接口 500 降级 | **PASS** | 列序回原序；页面噪声词扫描 = 空；面板可「确定到当前层级」，v-model 由空串→`110000` |
| **E** | 单飞（去重） | **PASS**（限单实例） | 首次展开 + 开/关 9 次 ⇒ `/geo/hot` 实际请求数 = **1**（`HOT_CALLS_TOTAL=1`） |
| **F** | 重排时机 | **PASS** | 票延迟 **2.12s** 放行：前=原序（北京市…），后=造票序（台湾省首位）；`rankedProvinces[0]='710000'` |
| **G** | 真实指针交互 | **PASS** | 全程 `Input.dispatchMouseEvent`；`elementFromPoint` 每次命中 `gc-item`；确定后 v-model 空串→**`230305`**，trigger=「黑龙江省鸡西市梨树区」 |
| **H** | 小程序编译 | **PASS** | 副本内 `npm run build:mp-weixin` **exit=0**「DONE Build complete.」；产物中 `geo/hot` 命中 1 文件（`business/api.js`）⇒ 双 `script` 块 SFC 可编译 |
| **I** | 真源零写入 | **PASS**（未决项已由派单方关闭） | 19/19 trees md5 SAME、`config/tree-meta.json` SAME、`collections/jiazu_assets.json` SAME；`jiazu_sms_codes.json` 未决项见 §2-I |
| **J** | 口径 ↔ 实现抽查 | **一致（抽查面）** | 五组口径-实现锚点逐条对上（见 §2-J）；含「无 X-Tree-Id 直连 3461 亦 200」实测 |

**汇总：A–J 全部 PASS / 一致，未发现可复现的产品缺陷。** 被检 7 文件 sha256 开轮 / 收尾逐项相同（见 §8）⇒ 结论对**现行**哈希有效。

---

## 2. 逐条读数（逐字）

### A 清空基线回原序 — **PASS**

拦截改写为空票表 ⇒ 省级列码序 = 数据集原序逐位相同（**35 项**）：

```
110000,120000,130000,140000,150000,210000,220000,230000,310000,320000,330000,340000,350000,
360000,370000,410000,420000,430000,440000,450000,460000,500000,510000,520000,530000,540000,
610000,620000,630000,640000,650000,710000,810000,820000,999999
```

- DOM `col0(n=35)` 名序（run4.log:12）：`北京市, 天津市, 河北省, 山西省, 内蒙古自治区, 辽宁省, 吉林省, 黑龙江省, 上海市, 江苏省, 浙江省, 安徽省, 福建省, 江西省, 山东省, 河南省, 湖北省, 湖南省, 广东省, 广西壮族自治区, 海南省, 重庆市, 四川省, 贵州省, 云南省, 西藏自治区, 陕西省, 甘肃省, 青海省, 宁夏回族自治区, 新疆维吾尔自治区, 台湾省, 香港特别行政区, 澳门特别行政区, 海外`
- `A provinces_codes` 与 `A divisions_order` 逐位相同；`RESULT A = ["PASS", …]`（run4.log:13-15）。

### B1 一级造票 — **PASS**

- `710000` 由 **idx31 → 首位**；其后 34 项与 A 序列**逐位相同**（共 35 项）：

```
710000,110000,120000,130000,140000,150000,210000,220000,230000,310000,320000,330000,340000,350000,
360000,370000,410000,420000,430000,440000,450000,460000,500000,510000,520000,530000,540000,610000,
620000,630000,640000,650000,810000,820000,999999
```

- DOM `col0(n=35)` 名序首位 = **台湾省**（run4.log:23）；`B1 got == B1 exp`，`RESULT B1 = ["PASS", …]`（run4.log:24-26）。

### B2 地级造票 — **PASS**

- `rankedCities(710000)`（run5.log:32）= **22 项**：

```
712200,710100,710200,710300,710400,710500,710600,710700,710800,710900,711000,711100,711200,711300,
711400,711500,711600,711700,711800,711900,712000,712100
```

- DOM `col1(n=22)` 名序（run5.log:31）：`连江县, 台北市, 新北市, 桃园市, 台中市, 台南市, 高雄市, 基隆市, 新竹市, 嘉义市, 新竹县, 苗栗县, 彰化县, 南投县, 云林县, 嘉义县, 屏东县, 宜兰县, 花莲县, 台东县, 澎湖县, 金门县`
- `B2 DOM_NAME_MATCH col0=True col1=True`；`B2 got == B2 exp`，`RESULT B2 = ["PASS", …]`（run5.log:34-37）。
- **注**：run4.log:41-43 的 B2 `FAIL` 是**探针自伤**（name→code 映射歧义，见 §5），**非判负**；有效读数为 run5。

### B3 县级造票 — **PASS**

- `rankedCounties(710000,712200)`（run5.log:63）= **4 项**：

```
712204,712201,712202,712203
```

- DOM `col2(n=4)`（run5.log:62）= `东引乡, 南竿乡, 北竿乡, 莒光乡`（原始 unicode 记法 `\u4e1c\u5f15\u4e61, \u5357\u7aff\u4e61, \u5317\u7aff\u4e61, \u8392\u5149\u4e61`，run5.log:64）
- `B3 DOM_NAME_MATCH col1=True col2=True`；`B3 got == B3 exp`，`RESULT B3 = ["PASS", …]`（run5.log:65-69）。
- **注**：run4.log:65-67 的 B3 `FAIL` 同为探针自伤（见 §5）；有效读数为 run5。

### C 真源独立现算对拍 — **PASS**

- 接口 `counts` = **28 键**、`direct` = **19 键**（`/tmp/qa-geo-hot/api-hot.json`，`generated_at=2026-09-26T12:02:39.985Z`，`v=1`）。
- 与 `/usr/bin/python3` 现算（脚本 `recompute.py`，按 §14-2/14-3/14-4 口径）**逐键一致**：`only_api=空`、`only_mine=空`、`值不符=空`。
- **票源分解**：`birth=22`、`residence=13`、`meta=11`，**共 46 票**；**已知码表 3771**。

（`counts` 键集逐字：`130000,130200,130208,130229,130300,130302,210000,210900,230000,230100,230300,230302,230303,230305,231000,231025,231081,231085,231200,231281,370000,370100,371300,371323,371325,610000,610100,610122`；`direct` 键集 = `122` 级 19 键。）

### D 接口 500 降级 — **PASS**

- 列序回原序（**同 A 序列**，35 项逐位相同）；`D order_matches_original=True`（run4.log:83、run6.log:38）。
- **页面噪声词扫描 = 空**：`D page_noise=[]`（run4.log:76、run6.log:31）。
- 面板仍可选择并「确定到当前层级」成功：`D after confirm qa='110000' sel=None trigger='北京市' panel=False`（run6.log:37）⇒ **v-model 由空串 → `110000`，面板关闭**。
- `RESULT D = ["PASS", …]`（run6.log:39）。

### E 单飞（去重） — **PASS（限单实例）**

- 读数（run3.log:65-69）：`E hot_calls=1 panel=True`；`RESULT E = ["PASS", 1]`；**`HOT_CALLS_TOTAL=1`**。
- 手法：**首次展开 + 开/关 9 次**（run3.log:45-64 共 10 次展开）⇒ `/geo/hot` 实际请求数 = **1**。
- **限制**：同一 JS 上下文内**换入口 / 换实例未做成**，**只证单实例 10 次展开**（见 §4 未实测项）。

### F 重排时机 — **PASS**

- 手法：**票延迟 2.12s 放行**（run6.log:13 `[delay] fulfilled after 2.12s`）。
- **t≈5.6s**（run6.log:9-12）：`col0(n=35)` = **原序**（`北京市, 天津市, 河北省, 山西省, …`）。
- **t≈9.2s**（run6.log:14-17）：`col0(n=35)` = **造票序**（**台湾省**首位）。
- `F t0_dom=[北京市,天津市,河北省,山西省]`、`F t1_dom=[台湾省,北京市,天津市,河北省]`（run6.log:18-19，原始 unicode 记法）。
- `F t1_ranked=["710000", "110000", "120000", "130000", "140000", "150000"]`（run6.log:21）⇒ `rankedProvinces[0]='710000'`。
- `RESULT F = ["PASS", …]`（run6.log:22）。**两时点均留真实读数。**
- （run3.log:36 / run4.log:87 的 F `NOT TESTED` 系该轮挂载页 `.gc-trigger[0]` 未就绪，属 NOT TESTED，**不记 FAIL**。）

### G 真实指针交互 — **PASS**

- **全程 `Input.dispatchMouseEvent`**（driver.py 内实现，见 §8 复现指引）；每次 `elementFromPoint` 命中 `gc-item`（run6.log:49-51：`hit=gc-item|UNI-VIEW`）。
- 路径：`G before sel='' trigger='选填，逐级选择省 / 市 / 县'`（run6.log:48）→ 点省 / 市 / 县（run6.log:49-51）→ col1(n=13) / col2(n=9) 见 run6.log:56-57 → 点 `.gc-btn-main[0]`（run6.log:59）。
- 确定后（run6.log:63）：`G after confirm sel=None qa='230305' trigger='黑龙江省鸡西市梨树区' panel=False` ⇒ **v-model 由空串 → `230305`，trigger 文本「黑龙江省鸡西市梨树区」，面板关闭**。
- `G codes picked p=['230000'] c=['230300'] a=['230305']`（run4.log:112、run6.log:64）；`RESULT G = ["PASS", "", "230305"]`（run6.log:65）。

### H 小程序编译 — **PASS**

- 副本内 `npm run build:mp-weixin` ⇒ **exit=0**，日志尾 `DONE  Build complete.`（`/tmp/qa-geo-hot/mpbuild.log`，Compiler version 5.23（vue3）；含小程序端 `span` 选择器提示，非错误）。
- 产物 `dist/build/mp-weixin` 中 `geo/hot` 命中 **1 文件（`business/api.js`）** ⇒ **双 `script` 块 SFC 可编译**。

### I 真源零写入 — **PASS（未决项已由派单方关闭）**

| 对象 | 读数 | 结论 |
|---|---|---|
| `migrate-output/trees/*.json` | **19/19 md5 SAME** | 未写 |
| `config/tree-meta.json` | **md5 SAME** | 未写 |
| `collections/jiazu_assets.json` | **md5 SAME** | 未写 |
| `collections/jiazu_sms_codes.json` | 质检原报**一处未决**（真 / 副本 md5 同值却键集矛盾） | 见下 |

**未决项关闭（派单方 2026-09-26 20:19 只读实测）**：真源 `migrate-output/collections/jiazu_sms_codes.json`
- `mtime = 2026-09-23 08:48:58`
- `md5 = 6c7e9892bda7102e17f455c0258a4586`
- `键 = ['13900000003','16601061608']`，**不含 `16601061656`**

⇒ 质检登录写入落在**副本**，**真源未被写**。另派单方实测：该账本**内容 md5 恒为 `31e9ea9c10498bf75770ce10c35f9544`**（= 上批已登记值）、**仅 mtime 移至 20:15:20** ⇒ **读侧 sweep 回写形态（内容零变化）**。

### J 口径 ↔ 实现抽查 — **一致（抽查面）**

| # | 口径 | 实现锚点 | 抽查结论 |
|---|---|---|---|
| 1 | 票源三源 | `lib/geo-hot.js:105-121` | 一致 |
| 2 | 前缀级联 + 码表内才计票 | `lib/geo-hot.js:52-59` | 一致 |
| 3 | 排序降序 + 原序次键 | `frontend/src/business/geo.ts:234-244` | 一致（实测与原序一致） |
| 4 | meta 抛错只让第三源 0 票 | `lib/geo-hot.js:116-121` | 一致 |
| 5 | `listTreeIds` 抛错整体失败不缓存 | `lib/geo-hot.js:94` / `142-143` | 一致 |
| 6 | TTL 24h + 单飞 | `lib/geo-hot.js:40` / `128-148` | 一致 |
| 7 | 路由注册在树编辑闸门之前 | `index.js:586` | 一致（**无 X-Tree-Id 直连 3461 亦 200**，实测） |

---

## 3. 缺陷清单

**未发现可复现的产品缺陷。** 被检 7 文件 sha256 开轮 / 收尾**逐项相同**（§8）⇒ 结论对现行哈希有效。

---

## 4. 未实测项（4 条，均记 NOT TESTED）

| # | 未实测项 | 说明 |
|---|---|---|
| 1 | **B2 / B3 在真实产品页上的列序** | 挂载页形态**已 PASS**；真实产品页通路未闭环（`modal-mask` 遮挡 + 同 URL 不重载） |
| 2 | **E 的多实例共用** | **只证单实例 10 次展开**；同 JS 上下文内换入口 / 换实例未做成 |
| 3 | **单树读抛错时 `failed` 数组形态（R17）** + `getMeta` 抛错只降第三源的**动态**用例 | 静态口径抽查已一致（§2-J），动态用例未跑 |
| 4 | **长时统计 / 降级值不进缓存的浏览器面动态复现** | **注：「降级值不进缓存」与「不被空值锁死」已由单测用例 H7 / H8 覆盖** |

---

## 5. 作废轮次（探针自伤，**不入判负**）

| 轮次 | 作废原因（探针自伤） | 处置 |
|---|---|---|
| **run1 / run2** | ① CDP 嵌套 `send` 响应错位；② 同 URL hash 导航不重载 ⇒ 复用旧 JS 上下文；③ `name→code` 映射歧义；④ 字典取键打印 `KeyError` | 整轮作废 |
| **run3 的 A/B/D/G 场景** | 字典取键 artifact（`ERROR 'sel'`）；该轮**仅 E 场景可判**（`HOT_CALLS_TOTAL=1`） | 只取 E 读数；A/B/D/G 不记 FAIL |
| **run4 的 B2 / B3** | `name→code` 映射歧义（同名「连江县」在闽 vs 台；「金门县」映射歧义）⇒ 探针取码错，报 FAIL（run4.log:41-43、65-67） | 该两格作废；改用 run5 有效读数 |

**修法已固化在 `driver.py`**：响应缓冲 + `about:blank` 强制重载 + `__qa_geo` 真实 `ranked*` 双路对拍。此后 **run4 / run5 / run6 全部可判**。

**真实产品页部分取证（run1 实录）**：家庭页「树内搜索 → 点结果 → 编辑」弹出的档案表单里**确实渲染了 2 个 `.gc-trigger`**（run1.log:18 `after edit: triggers=2`）；但该轮 `RESULT A = ERROR timed out`（run1.log:19），通路未闭环。

---

## 6. 环境复核与清理

| 项 | 读数 |
|---|---|
| 浏览器 | `Chrome/153.0.8010.54`，`pid=25875` |
| 后端（真源副本兼容层） | `http://localhost:3461 (source=local)`，`pid=23385`（`backend.log`） |
| 前端（H5 / Vite dev） | `http://localhost:3462/`（`vite v5.2.8`，`ready in 1282ms`），`pid=38363`（更早 `24325`） |
| 挂载页 URL | `http://localhost:3462/#/pages/qa-geo/index` |
| 真产品页 URL | `http://localhost:3462/#/pages/family/index` |
| 自建进程停止 | 按**精确 PID** 停止：后端 `23385`、前端 `38363`（及更早 `24325`）、Chrome `25875`（含 `lsof` 取的子 PID） |
| 端口复核 | `3461 / 3462 / 9333` 监听数 = **0** |
| 临时 profile | `/tmp/qa-geo-hot/prof` **已删** |

> 口径真源行锚（只读核对）：`docs/geo-origin.spec.md:1373` = `## 14. 行政区划热度排序（geo-hot）口径（2026-09-26 · 只追加 · 不改 §1–§13 任何行）`；`docs/PENDING_DEPLOY.md:4688` = `## §39 行政区划热度排序（geo-hot）批次（云函数重打包 + H5 / 小程序两产物重打 · 无集合变更 · 无数据修正 · 2026-09-26 · 只追加 · 不改 §0–§38 任何行）（Jing 制度员）`。

---

## 7. 复现指引

- **挂载页源码**（`/tmp/qa-geo-hot/mount.vue`，20 行，**仅副本、真仓零改动**）：

```vue
<template>
  <view class="qa-geo">
    <view class="qa-title">QA 挂载页（仅 /tmp 副本，真仓零改动）</view>
    <GeoCascader v-model="code" legacy="" />
    <text class="qa-code">{{ code }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import GeoCascader from '@/components/geo-cascader/geo-cascader.vue';

const code = ref('');
</script>
```

- **复算脚本**：`/tmp/qa-geo-hot/recompute.py`（`/usr/bin/python3 recompute.py`，按 §14-2/14-3/14-4 口径现算，读 `data/config/{tree-meta,geo-divisions}.json` + `data/migrate-output/trees/*.json`，与 `api-hot.json` 逐键对拍，打印 `C_MATCH`）。
- **驱动**：`/tmp/qa-geo-hot/driver.py`（CDP 驱动；指针交互用 `Input.dispatchMouseEvent`；计数 `HOT_CALLS_TOTAL=%d`，见 driver.py:615）。
- **场景日志**：`run3.log`（E）、`run4.log`（A/B1/D/G）、`run5.log`（A/B2/B3）、`run6.log`（F/D/G）。
- **编译**：`npm run build:mp-weixin` ⇒ `dist/build/mp-weixin`。

---

## 8. 被检件 sha256（开轮 = 收尾，逐项相同）

| # | 文件 | sha256 |
|---|---|---|
| 1 | `cloudfunctions/compat-api/lib/geo-hot.js` | `0e63fd501b7c9a81c3914e13513a95daf5a395b3a632fe9ed9b58b40ab18400a` |
| 2 | `cloudfunctions/compat-api/index.js` | `0f3ec85374740ef5205755af9c357c5cd372b6420e293bfa30962528084d3b51` |
| 3 | `cloudfunctions/compat-api/lib/geo-hot.test.js` | `3039f13e816236856e6ba5efb8460234731eea8d9f3ad0fb5c2517465af412ab` |
| 4 | `package.json` | `5260700f8bad4a1f099c5c42d7b2803625f8d9af7cd126bea4de11437d7d6bad` |
| 5 | `frontend/src/business/api.ts` | `98682b6aaa54cee5117d6a41382750d47a3c3d38fe60e4dd5097faec07f6d2df` |
| 6 | `frontend/src/business/geo.ts` | `add593718008b59148361766d219a147c080d5d49bc4d0584ccdd1ead7a52019` |
| 7 | `frontend/src/components/geo-cascader/geo-cascader.vue` | `fb50049a9150a7d8a9dc0a863ad13efded5b6649001188afb1d1f7837fc55689` |

（清单落盘：`sha-start.txt`（开轮）与 `sha-end.txt`（收尾），两者逐行相同。）

---

## 9. 转录来源与冲突登记

- **盘上原始日志（权威源）**：`/tmp/qa-geo-hot/{run1,run2,run3,run4,run5,run6}.log`、`mpbuild.log`、`backend.log`、`frontend2.log`、`api-hot.json`、`recompute.py`、`mount.vue`、`driver.py`、`chrome.pid`。
- **哈希清单**：`…/cache/scratch/geo-hot/evidence/n1/{sha-start,sha-end}.txt`。
- **冲突登记**：逐条比对**未发现**「派单登记文本 ↔ 盘上日志」的数值冲突。**唯一需说明处**：`run4.log:41-43 / 65-67` 记录的 B2 / B3 `FAIL` 与派单登记的「B2/B3 PASS」表面相反 —— 经核，run4 该两格系**探针自伤**（§5 `name→code` 映射歧义），派单登记的 PASS 取自 `run5.log:32-37 / 63-69`，**两者不构成真冲突**。
- **来源标注**：`§2-C` 的票源分解 / 已知码表 3771、`§2-H` 的产物命中文件、`§2-I` 的三项 md5 SAME 与 `jiazu_sms_codes` 关闭读数，**未在本批 `/tmp/qa-geo-hot` 日志中落盘**（脚本 `recompute.py` 已留档、输出未留档；I 为派单方独立只读实测），故按**派单登记原文照录**并已在此标明来源。
