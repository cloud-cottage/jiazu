# 市集交易 + 官方竹简每日限量发售 规格（economy-market.spec.md）

> 状态：**设计已确认（Kevin 2026-09-16）· 待实施**｜已按 Kevin 拍板 K4/K7/K8/K9/K10 回改：官方每日库存初值 50 束/日 与「拒绝自买自卖」升为定稿；挂单与家族树解耦；挂单新增 7 天时限 `LISTING_TTL_DAYS = 7` 与 `expired` 状态；存在未成交挂单时拒绝注销
> **真源级别**：本册为市集与官方发售的专业域分册；**集合/字段/枚举/路由名以 `docs/economy.spec.md`（总纲）为准**。本册在总纲之内细化市集与官方发售的专业口径（手续费算法与边界、挂单锁定语义、惰性释放、验收夹具、前端落点与实施清单）。
> 关联：`docs/economy.spec.md`（总纲 · 唯一权威）、`docs/data-model.md`（集合与 API 契约）、`docs/id-system.spec.md`、`docs/permission-tier.spec.md`、`docs/PENDING_DEPLOY.md`；实现落点 `cloudfunctions/compat-api/lib/economy-market.js`、`frontend/src/pages/market/index.vue`、`frontend/src/business/api.ts`、`frontend/src/pages.json`。
> 冲突处理：与总纲冲突时**以总纲为准并回改本册**（引用总纲时写章节名，如「见 `docs/economy.spec.md`（存储契约）」）；与 `docs/data-model.md`（集合命名）、`docs/PENDING_DEPLOY.md`（部署清单）冲突时，按总纲口径同步修订彼文件。

---

## 0. 口径来源与 Kevin 拍板修正（K 裁定）

用户需求原文（语义不得增删）：市集**仅支持整束竹简（100 片）**上架交易；碎片、零散竹片、石榴籽、石榴籽玉**均不可上架**。交易币种仅支持石榴籽标价与支付，**无人民币交易、无线下交易**。定价自由报价，平台不设最低最高价。风控：禁止石榴籽/道具反向兑换人民币，无变现通道。官方竹简发售：参考估价 10 元/束，平台官方实际售价 **9.9 元/束**；**每日 21 点限量定时发售**，发售总库存由后台根据平台活跃用户动态配置，售罄即止，等待次日刷新。竹片有效期 365 天，到期自动作废；绑定个人账号，不支持家族共享、账号转移、私人转赠。

以下为 **Kevin 已拍板修正（不得改）**：

| # | 修正项 | 修正后口径 |
|---|---|---|
| 1 | 手续费 | 手续费 = **标价 × 1%**，**扣石榴籽**（不是竹片）；买方实付 = 标价，卖方实收 = 标价 − 手续费，手续费部分**直接销毁**（平台收入为零，只做通缩）；**不足 1 籽的手续费免收** |
| 2 | 人民币用途 | 人民币**只用于购买官方竹简**（保留既有 ¥ 钱包 `jiazu_wallets` 与充值入口）；人民币不可购买石榴籽，石榴籽不可变现 |
| 3 | 每日 21 点发售 | 走**惰性释放**（访问市集/官方入口时判定），**不建定时任务**；**21:00 前购买请求 → 409「未到发售时间」**；**当日未售完不结转** |
| 4 | 官方购买 | ¥ 钱包扣 990 分/束（`price_fen = 990` = ¥9.90/束）→ 得 100 片/束（BambooLot，365 天，`source='official_purchase'`，`Tx{ type:'official_buy' }`）；¥ 余额不足 → 拦截并引导充值；当日库存不足 → 409「今日已售罄」 |
| 5 | 挂单成交 | **一次性全量成交**：不支持部分成交、不支持议价；卖方须拥有 ≥ 100×bundles 片竹片且**整束计价**；挂单时竹片**锁定**，成交时按批次整束转移（有效期随原 lot 走，不重置） |
| 6 | 扣减顺序 | 资产一律 **FIFO by `expires_at` 升序**扣减，不足即整单拒绝 409，**禁透支** |
| 7 | 挂单与家族树 | **挂单与家族树无关（K7）**：`Listing` **无任何家族树字段**（不传、不派生、不展示）；挂单不再校验家族树前置条件，原挂单相关的家族树 400 错误码一并删除；前端挂单表单不含家族树选择器 |
| 8 | 自买自卖 | **拒绝自买自卖由待确认升为定稿（K8）**：同一账号不可买入自己的挂单 → 400「不可购买自己的挂单」 |
| 9 | 挂单时限（新规则） | `Listing.expires_at` = 挂单时刻 + **7 天**（常量 `LISTING_TTL_DAYS = 7`，可配）；`Listing.status` 枚举扩为 `open`｜`sold`｜`cancelled`｜`expired`；惰性 sweep 把 `status='open'` 且 `expires_at <= now` 的挂单置 `expired` 并**释放锁定**；成交与撤单仅对 `open` 有效（`expired` → 409「挂单已过期」）；市集列表与「我的挂单」默认不展示 `expired` |
| 10 | 注销前置（交叉规则） | 存在 `status='open'` 挂单时**拒绝注销** → 409「请先撤销未成交挂单」；`sold` / `cancelled` / `expired` 的挂单无碍。注销主规则在运营册，本册只登记交叉点（见 §8、§9.1、§10-7） |
| 11 | 官方每日库存初值 | `official.daily_stock = 50` 束/日 由待确认**升为定稿（K4）**；后台仍可按活跃用户动态配置 |

---

## 1. 术语与单位

| 术语 | 定义 |
|---|---|
| 竹片 | 竹简最小单位；**1 束 = 100 片**（恒等，不可拆分为非整束交易） |
| 束 | 市集与官方发售的**计量单位**（挂单束数 `bundles`、库存 `daily_stock` / `stock` 均以束计）；展示可折 `100 片/束` |
| 石榴籽 | 市集唯一交易币种；标价与支付均以籽为单位（正整数） |
| 批次（Lot） | 一次入账形成的资产集合；竹片为 `BambooLot`、石榴籽为 `SeedLot`，各自带 `expires_at` |
| 整束 | 100 片；市集挂单 `pieces` 必须是 100 的整数倍 |
| 锁定 | 挂单期间对卖方竹片可用量的**派生占量**（见 §5），不写批次字段 |
| 销毁 | 手续费从系统中移除、不入任何账户（非平台收入） |
| 惰性释放 | 官方每日库存按访问时判定并即时写入，不依赖定时任务（见 §7） |
| 惰性结算（sweep） | 读写资产前先作废已过期批次，保证可用量口径正确（见 §6） |
| 挂单时限 | 挂单自创建起 **7 天**（`LISTING_TTL_DAYS = 7`，可配）；到期由惰性 sweep 置 `expired` 并释放锁定占量（见 §6.1） |

---

## 2. 存储契约（与总纲一致；集合/字段/枚举以总纲为准）

### 2.1 集合 `jiazu_market`（`_id='global'`，单文档）

```jsonc
{
  "_id": "global",
  "listings": [ /* Listing[] */ ],
  "trades": [ /* Trade[] */ ],
  "official": {
    "price_fen": 990,                    // 官方售价（分）：¥9.90 / 束
    "daily_stock": 50,                   // 每日配额（束）：初值 50 束，后台按活跃用户动态配置
    "stock": { "2026-09-16": 50 },       // { "YYYY-MM-DD": number } 当日剩余库存（束）
    "last_release_date": "2026-09-16"    // 最近一次释放库存的日期
  }
}
```

- `Listing = { id, seller_phone, bundles, pieces, price_seeds, status: 'open'|'sold'|'cancelled'|'expired', created_at, expires_at, sold_at?, buyer_phone? }`
  - `expires_at` = 挂单时刻 + **7 天**（常量 `LISTING_TTL_DAYS = 7`，可配）；到期由惰性 sweep 置 `status='expired'` 并**释放锁定**（该挂单占量消失、被锁竹片回到卖方可用）
  - `status`：`open`（可买、可撤）｜`sold`（已成交）｜`cancelled`（已撤单）｜`expired`（到期下架）；**成交与撤单仅对 `open` 有效**
  - `Listing` **不含任何家族树字段**：挂单与家族树无关（客户端不传、服务端不派生）
- `Trade = { id, listing_id, buyer_phone, seller_phone, pieces, price_seeds, fee_seeds, ts }`

### 2.2 集合 `jiazu_assets`（`_id='global'`，单文档）

```jsonc
{
  "_id": "global",
  "users": {
    "16601061656": {
      "fragments": 0,
      "seeds": [ /* SeedLot[] */ ],
      "bamboos": [ /* BambooLot[] */ ],
      "jades": [ /* Jade[] */ ],
      "txs": [ /* Tx[] */ ],
      "signin_date": "2026-09-16"
    }
  }
}
```

- `SeedLot = { id, qty, expires_at, source, created_at }`（石榴籽批次；`source` ∈ `signin` | `fragment_synth` | `admin` | `market` | `jade_decompose` | `contribution`）
- `BambooLot = { id, qty(片), expires_at, source, created_at }`（竹片批次；`source` ∈ `official_purchase` | `spirit_gift` | `market` | `admin`）
- `Tx = { id, ts, type, delta: { fragments?, seeds?, bamboos?, jades? }, fee_seeds?, ref: { tree_id?, listing_id?, trade_id?, person_handle? }, desc, operator? }`（`ref.tree_id` / `ref.person_handle` 是其它域的通用留痕字段，**与挂单无关**；本册市集留痕只用 `ref.listing_id` / `ref.trade_id`）
- `Tx.type`（本册相关取值，枚举以总纲为准）：`market_list`（挂单）｜`market_cancel`（撤单）｜`market_sell`（卖方入账籽）｜`market_buy`（买方出账籽）｜`official_buy`（官方竹简购买）｜`expire`（批次过期作废 / 挂单到期下架留痕）
- 手续费留痕字段为 **`Trade.fee_seeds`**（定义见 §2.1 的 `Trade`），不新增其它手续费字段。

### 2.3 契约约束（实施红线）

1. `jiazu_market` 与 `jiazu_assets` 均为**单文档 `_id='global'`**，读改写必须在单文档内完成；不得为市集新增集合内其它文档（计数器等）。
2. 批次字段集**不得增删**：任何"锁定/占量"必须由 `listings` 派生（§5），**不得**给 `BambooLot` 增加 `locked` 之类字段。
3. `pieces` 恒为片；`1 束 = 100 片`，`pieces = bundles × 100` 必须成立。
4. ¥ 钱包（`jiazu_wallets`，`_id='global'`，`users[手机号].balance_cents` 人民币分、`transactions` 流水）**保留**，但**仅可用于购买官方竹简**（§7）。既有 `wallet.js` 的 `recharge` 入口保留。

---

## 3. 资产流转总表

| 动作 | 输入 | 前置校验 | 扣减 | 入账 | 手续费 / 销毁 | 失败回滚 | 错误码 |
|---|---|---|---|---|---|---|---|
| **挂单** | `{ bundles, price_seeds }`（挂单与家族树无关：**客户端不传、服务端也不派生**家族树字段） | 登录有效；`bundles ≥ 1` 且整数；`price_seeds` 为 ≥ 1 整数（自由报价，**平台不设最低/最高限价**）；待挂单的 `pieces = bundles×100` ≤ 卖方竹片**可用量**（= 全部未过期 `bamboos.qty` 之和 − 本方 `status='open'` 挂单 `pieces` 之和，先 sweep，本人已到期的 `open` 挂单先置 `expired` 并释放占量，见 §6.1）；挂单不校验家族树前置 | 无物理扣减（登记锁定占量，见 §5） | 新增 `Listing`（`status='open'`，`expires_at = now + LISTING_TTL_DAYS 天`）入 `jiazu_market.listings`；卖方资产不变；写 `Tx{ type:'market_list' }` 留痕 | 无 | 单文档写入前完成全部校验 → 校验失败时不写；写入失败即不产生 `Listing` | 400 非整束 / 400 价格非法 / 401 未登录 / 409 可用竹片不足 |
| **撤单** | `{ listing_id }` | 登录有效；`listing_id` 存在；`listing.seller_phone` = 当前用户；`listing.status='open'`（**仅 `open` 可撤**） | 无（释放派生锁定占量） | `listing.status` → `'cancelled'`；卖方可用量随之回升；写 `Tx{ type:'market_cancel' }` 留痕 | 无 | 状态非 `open` → 不动数据（`sold` / `cancelled` → 409 已成交或已撤；`expired` → 409 挂单已过期） | 401 未登录 / 403 非本人挂单 / 404 挂单不存在 / 409 已成交或已撤 / 409 挂单已过期 |
| **成交（买入，全量）** | `{ listing_id }` | 登录有效；`listing.status='open'`（**仅 `open` 可买**；`expired` → 409「挂单已过期」）；买方 ≠ 卖方（**自买自卖拒绝 · 定稿 K8**）；买方石榴籽可用量（sweep 后 FIFO 合计）≥ `price_seeds`；卖方竹片可用量（sweep 后）≥ `listing.pieces`；`price_seeds` 未变（无议价字段） | 买方：按 `expires_at` 升序 FIFO 扣 `price_seeds` 籽（写 `Tx{ type:'market_buy', delta:{ seeds:-price_seeds }, fee_seeds }`） | 卖方：按 `expires_at` 升序 FIFO 入 `price_seeds − fee_seeds` 籽（新建 `SeedLot`，`source='market'`，写 `Tx{ type:'market_sell' }` 留痕）；买方：按卖方原批次**整束转移** `listing.pieces` 片竹片（复制原 lot 的 `expires_at`，**不重置**，`source='market'`） | `fee_seeds = floor(price_seeds/100)`；`>0` 即从卖方应收入账中扣除并**销毁**（不入任何账户）；`=0` 免收 | 单文档读改写：先在内存完成全部扣减/入账/状态转移，再一次性持久化；任何校验失败 → 不写 | 400 自买自卖 / 401 未登录 / 403 卖方本人不可买 / 404 挂单不存在 / 409 挂单已成交或已撤 / 409 挂单已过期 / 409 石榴籽不足 / 409 竹片不足（含部分已过期） |
| **官方购买** | `{ bundles }`（默认 1，恒为整束） | 登录有效；先执行惰性释放（§7）得到当日剩余；**`now ≥ 当日 21:00`（未到 → 409「未到发售时间」）**；`official.stock[today] ≥ bundles`；`jiazu_wallets.users[手机号].balance_cents ≥ 990 × bundles` | ¥ 钱包扣 `990 × bundles` 分（走 `wallet.js` 既有口径，写 `jiazu_wallets.transactions` 一条 `official_bamboo` ¥ 钱包流水——该字段是 ¥ 流水类型，非 `Tx.type`） | `BambooLot` 入账 `100 × bundles` 片，`expires_at = now + 365d`，`source='official_purchase'`，并写 `Tx{ type:'official_buy' }` 留痕；`official.stock[today] -= bundles` | 无（官方发售非市集交易，不收籽手续费） | ¥ 扣款与竹片入账为两步：**先校验全部前置**，再扣 ¥ → 入竹片；竹片写入失败则不扣（顺序写 + 校验前置） | 401 未登录 / 409「未到发售时间」（21:00 前）/ 409「今日已售罄」/ 409 人民币余额不足（拦截并引导充值） |

> 说明：表中"资产流转表"共 **4 行**（挂单 / 撤单 / 成交 / 官方购买），与用户需求原文的四种动作一一对应。

---

## 4. 手续费算法与边界表

### 4.1 算法（定稿）

```
fee_seeds   = floor(price_seeds × 1 / 100)     // 整数除法
buyer_paid  = price_seeds                       // 买方实付 = 标价（不叠加手续费）
seller_got  = price_seeds - fee_seeds           // 卖方实收 = 标价 − 手续费
destroyed   = fee_seeds                          // 手续费全额销毁，平台收入为零
if (fee_seeds === 0) seller_got = price_seeds    // 不足 1 籽免收
```

- 手续费**扣石榴籽**，与竹片无关；竹片仅在成交时按整束转移，不受手续费影响。
- 手续费**只从卖方应收入账中扣除**，买方不额外加价。
- 手续费销毁 = 不入买方、不入卖方、不入平台账户、不入任何合集；仅作为 `Trade.fee_seeds` 留痕。

### 4.2 边界表

| 标价（籽） | `floor(标价×1%)` | 是否收取 | 买方扣减（籽） | 卖方实收（籽） | 销毁（籽） | 备注 |
|---|---|---|---|---|---|---|
| 1 | 0 | 免收 | 1 | 1 | 0 | 下限 |
| 50 | 0 | 免收 | 50 | 50 | 0 | 免收区间 |
| 99 | 0 | 免收 | 99 | 99 | 0 | **免收上边界** |
| 100 | 1 | 收取 | 100 | 99 | 1 | **起收下边界** |
| 101 | 1 | 收取 | 101 | 100 | 1 | — |
| 199 | 1 | 收取 | 199 | 198 | 1 | **定稿样例锚点（验收夹具）** |
| 200 | 2 | 收取 | 200 | 198 | 2 | — |
| 999 | 9 | 收取 | 999 | 990 | 9 | — |
| 1000 | 10 | 收取 | 1000 | 990 | 10 | — |

### 4.3 定稿样例锚点（必须写进规格作为验收夹具）

> **竹简标价 199 籽 → 买方扣 199 籽、卖方实收 198 籽**（即手续费 1 籽，销毁 1 籽）。

测试断言（`lib/economy-market.test.js` 必备）：
- `trade.price_seeds === 199`
- `trade.fee_seeds === 1`
- 买方石榴籽净变化 = `-199`
- 卖方石榴籽净变化 = `+198`
- 系统净销毁 = `1`（买卖双方 + 平台账户合计减少 1 籽）

---

## 5. 挂单锁定语义与并发安全

### 5.1 锁定实现建议（采用方案 A，保契约不增字段）

**方案 A（采纳）——`listings` 占量 + 派生可用量**

```
可用竹片(卖方) = Σ(未过期 bamboos.qty) − Σ(status='open' 且 seller_phone=本人 的 listings.pieces)
```

- 优点：`BambooLot` 字段集完全不动（§2.3 红线 2），锁定可随 `listings` 状态自动回落（撤单/成交即释放）。
- 挂单**到期**（`status='expired'`）同样使占量消失：`expired` 不满足 `status='open'`，卖方可用竹片即时回升，**无需单独的解锁写操作**（§6.1 的挂单 sweep 与 `status` 同步）。
- 锁定是**纯派生量**，不落库、不写批次，因此不存在"锁没释放"的脏数据。

**方案 B（不采纳）——预占批次**：从批次中拆出锁定块并打标记。
- 需给 `BambooLot` 增字段（如 `locked_by`）→ 违反 §2.3 红线 2；且拆分/合并批次引入额外一致性负担。**仅在日后修订存储契约时再评估。**

### 5.2 并发安全

| 风险 | 防护 |
|---|---|
| 同一挂单被两人同时买入（重复成单） | 成单是 `jiazu_market(_id='global')` 的**单文档读改写**：在内存把 `listing.status` 由 `'open'` 改为 `'sold'` 并写入 `trades`，**状态转移只可能成功一次**；持久化走 store 已有的 `sdkCall()` 互斥队列（同进程串行），第二个请求读到 `status='sold'` → 409 |
| 同一账号并发挂单超额（超卖锁定） | 挂单校验读取的"可用量"基于同一份 `jiazu_market` 快照；同进程由 `sdkCall` 队列串行，第二个挂单看到第一个已计入 `listings` → 409 可用竹片不足 |
| id 生成重号 | 沿用 `wallet.js` 既有口径：`lst_${Date.now()}_${rand}` / `trd_${Date.now()}_${rand}`。**正确性不依赖 id 唯一**，而依赖 §5.2 第 1 行的状态转移幂等；若日后需要严格单调序号，可用 `store.colAtomicNext()`（需落独立集合，**不得**塞进 `jiazu_market` 单文档） |
| 跨实例并发（云函数多实例） | CloudBase 无事务兜底：以"状态转移 + `trades` 追加在同一文档同一次写"为准；极端竞态下以 `listing.status` 已是 `sold` 的一方为胜者，落败方 409（与 `docs/data-model.md` §7「顺序写 + 幂等」一致） |

### 5.3 自买自卖（定稿）

- **口径：拒绝**（同一账号不可买入自己的挂单）→ 400「不可购买自己的挂单」。
- 该口径已由 Kevin 拍板**由待确认升为定稿（K8）**，不再列为待确认项；成交前置校验中固定保留「买方 ≠ 卖方」一条。

---

## 6. 有效期与作废在交易中的表现

### 6.1 惰性结算（sweep）

读写资产 / 挂单前先执行 sweep（`lib/economy-market.js` 纯函数；**资产 sweep 与挂单 sweep 同批执行**）：

| 触发点 | 动作 |
|---|---|
| 读取资产/挂单/成交前置 | 遍历 `bamboos` / `seeds`，凡 `expires_at <= now` → 批次作废（`qty` 归零剔除，或移出可用集合），并写入一条 `Tx{ type:'expire', delta:{ bamboos:-n } }` 留痕 |
| 挂单前置 | sweep 后重算可用量 → **已过期批次不得挂单**（天然不参与可用量） |
| 成交前置 | 重新 sweep 后重算卖方可用竹片；若 `可用 < listing.pieces` → 409「部分竹片已过期，请撤单后重挂」 |
| 挂单 sweep（读取 / 挂单 / 我的挂单 / 成交前置） | 遍历 `listings`，凡 `status='open'` 且 `expires_at <= now` → `status='expired'`（**保留原行**，不物理删）：该挂单占量消失（§5.1 派生量不再计入），**被锁竹片回到卖方可用**；无资产变动，写一条 `Tx{ type:'expire', desc:'挂单到期下架' }` 留痕 |

### 6.2 成交转移不重置到期日

- 买方获得的竹片批次 `expires_at` **复制卖方原 lot 的到期日**，不重新计算 365 天、不从成交日起算。
- 实现：整束转移时按卖方 FIFO 顺序切片，逐片按原批次 `expires_at` 生成买方 `BambooLot`（同 `expires_at` 的切片可合并为一 lot，`source='market'`）。
- 官方竹简购买是**新入账**，故按 `now + 365d` 计算到期日（§7），与市集成交的"随 lot"规则区分。

### 6.3 到期语义

- 竹片有效期 **365 天**，到期自动作废（惰性 sweep 落实），不可续期、不可转移给他人。
- 竹片**绑定个人账号**：不支持家族共享、不支持账号转移、不支持私人转赠（市集成交是唯一的竹片换手路径，且经平台撮合、收手续费、留 `Trade` 痕迹）。

---

## 7. 官方竹简每日限量发售

### 7.1 定价与参数

| 项 | 值 |
|---|---|
| 参考估价 | 10 元/束 |
| 官方实际售价 | **9.9 元/束**（`official.price_fen = 990`，即 ¥ 钱包扣 990 分/束） |
| 单次购买单位 | 整束（100 片） |
| 有效期 | 365 天（`now + 365d`，`source='official_purchase'`） |
| 每日库存 | `official.daily_stock`（后台动态配置，按平台活跃用户数调整；**初值 50 束（定稿 K4）**，单位「束」，展示可折 100 片/束） |
| 发售时点 | 每日 **21:00（CST, UTC+08:00）**；21:00 前购买请求 → 409「未到发售时间」 |
| 结转 | **当日未售完不结转**，次日 21:00 重新释放 `daily_stock` |
| 购买上限（限购口径 · 2026-09-16 对齐） | **无限购**：官方发售与市集挂单**均不设**每人 / 每账号的束数或笔数上限；历史稿中任何「限购 / 超限 / 每人每日限购 N 束」表述**一律作废**。唯一的「限额」= **平台级每日限额库存** `official.daily_stock`（当前 50 束/日，K4），售罄即止、次日刷新 |

### 7.2 惰性释放（不建定时任务）

访问市集 / 官方入口时执行：

```
today = 当日(YYYY-MM-DD, UTC+08:00)
if (now >= 当日 21:00) and (official.last_release_date < today):
    official.stock[today] = official.daily_stock   // 覆盖当日键：不累加昨日余量（未售完不结转）
    official.last_release_date = today
    persist(jiazu_market)
remaining = official.stock[today] ?? 0
```

- `now` 作为**可注入参数**（生产 `new Date()`，单测固定时钟）便于跨日/售罄/未到时点用例。
- 释放幂等：`last_release_date == today` 时不再重复释放。
- **21:00 前不开售**：`now < 当日 21:00` 时购买请求 → 409「未到发售时间」（不扣 ¥、不入竹片）；此时 `remaining` 仅用于展示，不代表可购买。
- **未售完不结转**：释放时以 `daily_stock` **覆盖**当日键；当日剩余次日作废，次日 21:00 由同一判定重新释放新一批，无需清理旧日期键（`stock` 历史键可保留作审计）。
- 售罄即止：`remaining == 0` → 前端显示「今日已售罄，明日 21:00 再上架」，购买请求 → 409「今日已售罄」。
- 与 sweep 的关系：访问市集 / 官方入口时先执行 §6.1 的资产 sweep 与**挂单 sweep**（到期挂单下架并释放占量），再做官方库存惰性释放；两者互不影响（挂单到期只回落竹片可用量，不改 `official.stock`）。

### 7.3 购买流程

1. 惰性释放 → 取当日 `remaining`；
2. 校验发售时点 `now ≥ 当日 21:00`（未到 → 409「未到发售时间」）；
3. 校验 `remaining ≥ bundles`（不足 → 409「今日已售罄」）；
4. 校验 ¥ 余额 `≥ 990 × bundles`（不足 → 409 人民币余额不足，拦截并引导充值，见 §7.4）；
5. ¥ 钱包扣款（`wallet.js`，写 `jiazu_wallets.transactions`，`type:'official_bamboo'`）；
6. 入账 `BambooLot{ qty: 100×bundles, expires_at: now+365d, source:'official_purchase' }`，并写 `Tx{ type:'official_buy' }` 留痕；
7. `official.stock[today] -= bundles`。

### 7.4 ¥ 充值入口与文案

- 入口：市集页官方发售区「余额不足 → 去充值」直接跳 `pages/wallet/index`；wallet 页既有充值区保留（`frontend/src/pages/wallet/index.vue`）。
- 文案（与仓库中文简洁风格一致）：
  - 官方发售区：「官方竹简 ¥9.90/束（100 片）· 每日 21:00 限量发售」
  - 剩余显示：「今日剩余 N 束」
  - 21:00 前：「今日 21:00 开售」
  - 售罄：「今日已售罄，明日 21:00 再上架」
  - 余额不足：「余额不足，官方竹简需 ¥X.XX，请先充值」
  - 风控提示（常驻小字）：「人民币仅用于购买官方竹简，不可购买石榴籽；石榴籽不可兑换人民币」

---

## 8. 接口清单（compat-api）

| 路由 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/market/listings` | GET | guest 可读 | 市集首页数据：先惰性释放官方库存 → 返回 `{ listings: Listing[], official: { price_fen, daily_stock, stock_left_today, release_at: '21:00', released } }`；默认**只返回 `status='open'` 的挂单（不展示 `expired`）**，可选 `status?` 显式指定；每条挂单含 `expires_at` 与剩余时限 |
| `/market/my` | GET | 需登录 | 我的挂单（`seller_phone=本人`，**默认不展示 `expired`**，每条含 `expires_at` 与剩余时限）+ 我的资产概览（石榴籽可用、竹片可用/锁定/批次到期）；**注销前置交叉规则见 §10-7** |
| `/market/list` | POST | 需登录 | 挂单：`{ bundles, price_seeds }` → 校验 + 落 `Listing`（`status='open'`，`expires_at = now + LISTING_TTL_DAYS 天`；**入参无家族树字段**） |
| `/market/cancel` | POST | 需登录 | 撤单：`{ listing_id }` → 状态置 `cancelled`（**仅 `open` 可撤**；`expired` → 409「挂单已过期」） |
| `/market/buy` | POST | 需登录 | 全量成交：`{ listing_id }`（**仅 `open` 可买**；`expired` → 409「挂单已过期」）→ 账目 + 手续费销毁 + 批次整束转移 → `{ ok:true, trade_id, pieces, price_seeds, fee_seeds }` |
| `/market/official-buy` | POST | 需登录 | 官方购买：`{ bundles? }`（默认 1）→ 时点/库存/余额校验 + ¥ 扣款 + `BambooLot` 入账 + 库存递减 → `{ ok:true, pieces, balance_cents, stock_left_today }` |
| `/admin/market/official-stock` | PUT | `chief_editor` | 动态库存配置：`{ daily_stock, price_fen? }` → 写 `official.daily_stock`（`price_fen` 默认 990，可配） |

错误码（统一）：400 参数/自买自卖（定稿 K8）、401 未登录、403 非本人挂单或后台无权限、404 挂单不存在、409 资产不足/挂单已成交或已撤/挂单已过期/未到发售时间（21:00 前）/今日已售罄/人民币余额不足（注销前置交叉 409 见 §10-7）；响应体沿用仓库既有 `{ error: '中文文案' }` 形状。

---

## 9. 前端落点

### 9.1 新增页面 `pages/market/index.vue`（竹简市集）

| 区块 | 内容 |
|---|---|
| 官方发售区 | 「官方竹简 ¥9.90/束 · 每日 21:00 限量」+「今日剩余 N 束」+ 购买按钮（整束）；21:00 前显示「今日 21:00 开售」；售罄/余额不足按 §7.4 文案；「去充值」跳钱包 |
| 我的资产 | 石榴籽可用数、竹片可用/锁定片数、最近批次到期日 |
| 用户挂单列表 | 每行：标价 N 籽 · M 束（= 100×M 片）· 卖方 · **剩余时限**（由 `expires_at − now` 向上取整到天，如「剩 5 天」）；「买入」按钮；默认不展示 `expired` 挂单 |
| 我的挂单 | 本人 `status='open'` 挂单（每条显示**剩余时限**，到期自动下架、不展示 `expired`）+ 「撤单」按钮；**存在 `open` 挂单时提示「注销前请先撤销未成交挂单」（§10-7）** |
| 挂单表单 | 束数（整数）、标价（籽，自由报价，平台不设最低/最高限价）；**不含家族树选择器**（挂单与家族树无关，表单与列表均不展示、不派生家族树）；开单须知写明「整束挂单，成交后手续费 1%（扣石榴籽）；**挂单 7 天内未成交自动下架，锁定竹片随之释放**」 |
| 买入确认弹窗 | 显示：标价 N 籽、手续费 `floor(N/100)` 籽（0 时显示"免收"）、卖方实收 N−fee；确认后调 `/market/buy` |

### 9.2 入口

- `frontend/src/pages/mine/index.vue` 功能菜单新增：`t-cell`「🏪 竹简市集」→ `go('/pages/market/index')`。
- `frontend/src/pages/wallet/index.vue` 新增入口 `t-cell`「🏪 竹简市集」+ 文案「官方竹简 ¥9.90/束 · 每日 21:00 限量」。

> **入口图标口径（2026-09-16 对齐）**：mine / wallet 两处入口 cell 图标一律为 **🏪**（与实现 `frontend/src/pages/mine/index.vue`、`frontend/src/pages/wallet/index.vue` 一致）；历史稿的 🏛 **作废**。语义不变（仍为「竹简市集」）。

### 9.3 API 封装（`frontend/src/business/api.ts`）

新增（沿用 `authedFetch` / `getAuthToken` 既有模式）。**函数名已按实现对齐（2026-09-16 收口；下方名单即实现名，不得再写旧名）**：`fetchMarketListings`、`fetchMyListings`、`postMarketList`、`postMarketCancel`、`postMarketBuy`、`postOfficialBuy`，并导出对应 TS 接口（`MarketListing`、`MarketOfficial`、`MarketListingsResult`、`MarketMyResult`、`MarketListResult`、`MarketBuyResult`、`OfficialBuyResult` 等）。

> **`setOfficialStock` 未实现，已从本名单删除**：官方库存后台配置 UI 是否新建，**由运营批次（P4）裁定**。
> 后端路由 `PUT /admin/market/official-stock`（限 `chief_editor`）本轮已实现并保留（见 §8 / §12 / §14.2），但**前端本轮不封装、页面不提供配置入口**；日后若 P4 决定建 UI，再在本节补写封装名。

### 9.4 页面注册（`frontend/src/pages.json`）

在 `pages` 数组新增：

```jsonc
{ "path": "pages/market/index", "style": { "navigationBarTitleText": "竹简市集" } }
```

---

## 10. 「反变现」合规约束

| # | 约束 |
|---|---|
| 1 | 界面文案**不得出现**「提现」「兑换人民币」「人民币购买石榴籽」「转让积分」等任何变现/双向兑换承诺 |
| 2 | 人民币**仅**用于购买官方竹简；石榴籽**仅**用于市集交易（标价与支付） |
| 3 | 石榴籽/道具**无变现通道**：不得以任何形式换回人民币、不得兑换法定货币或等价物 |
| 4 | 竹片绑定个人账号：不支持家族共享、账号转移、私人转赠；市集是全站唯一换手通道 |
| 5 | 平台明确**不设最低价与最高价**（自由报价，需求原文口径）：本册**不得**出现限价（最低价/最高价）类限制；同时不得出现"投资/理财/收益"类表述 |
| 6 | 风控文案常驻「我的资产」区：人民币不可购买石榴籽，石榴籽不可变现 |
| 7 | **注销前置（与运营册交叉）**：用户存在 `status='open'` 的市集挂单时**拒绝注销** → 409「请先撤销未成交挂单」；`sold` / `cancelled` / `expired` 挂单不阻碍注销。注销主规则见运营册，本册只登记该交叉点 |

---

## 11. 测试与约束

新增单测 `cloudfunctions/compat-api/lib/economy-market.test.js`（纯函数 + 副本数据，`COMPAT_OUT_DIR` 指向 `/tmp` 副本），须注册进根 `package.json` 的 `scripts.test`（追加路径）。

| # | 用例 | 断言要点 |
|---|---|---|
| 1 | 挂单校验：非整束 | `bundles` 缺省/非整数 → 拒绝；`pieces` 非 100 整数倍 → 400 |
| 2 | 挂单校验：无足量竹片 | 可用 < `100×bundles` → 409 |
| 3 | 挂单校验：已锁定素材 | 已有 `open` 挂单占量后再挂超额 → 409（可用量 = 总量 − 已锁定） |
| 4 | 成交账目 | 买方 `-price_seeds`、卖方 `+(price_seeds − fee)`、`fee` 销毁；`Trade.fee_seeds` 正确；`Tx.type` 为 `market_buy`（买方）/ `market_sell`（卖方） |
| 5 | 费用锚点 | **199 → 买方 199 / 卖方 198 / 销毁 1**（§4.3） |
| 6 | 免手续费边界 | 99 → 免收（卖方 99、销毁 0）；100 → 收 1（卖方 99、销毁 1） |
| 7 | 撤单释放锁定 | 撤单后可用量回升；重复撤单/撤已成交单 → 409 |
| 8 | 21 点惰性释放跨日与未到时点 | 注入时钟跨 21:00 → `stock[today] = daily_stock`、`last_release_date = today`；同日重复调用不重复释放；**21:00 前购买 → 409「未到发售时间」** |
| 9 | 售罄 | 当日 `stock` 扣完 → 再次购买 409「今日已售罄」；跨日释放不累计昨日余量（未售完不结转） |
| 10 | 并发不重复成单 | 同一 `listing_id` 并发买入 → 仅 1 单成功，另 1 单 409；`trades` 只追加 1 条 |
| 11 | 批次到期 | 成交转移后买方批次 `expires_at` = 卖方原 lot（不重置）；过期批次不可挂单 |
| 12 | 官方购买 | ¥ 扣 990 分 / 得 100 片 / 365 天 / `source='official_purchase'` / `Tx.type='official_buy'`；余额不足 409 拦截；库存不足 409 |
| 13 | 挂单惰性到期下架与锁定释放 | 注入时钟跨过挂单 `expires_at` → 该挂单 `status='expired'`、`sold_at` / `buyer_phone` 不变；卖方可用竹片回升 `+pieces`，可重新挂出等量竹片 |
| 14 | `expired` 不可买不可撤 | 对 `expired` 挂单调 `/market/buy` 或 `/market/cancel` → 409「挂单已过期」；`trades` 不追加、资产不变 |
| 15 | 残余时限显示 | 列表 / 我的挂单出参含 `expires_at`；剩余时限 = `expires_at − now` 向上取整到天，`open` 挂单恒落在 1..`LISTING_TTL_DAYS` 天；`expired` 默认不出参 |
| 16 | 真源 md5 未变 | 全部用例在副本目录执行，断言 `migrate-output/` 与 `config/tree-meta.json` 真源 md5 未变 |

---

## 12. 实施清单（P3 档）

| 序 | 项 | 落点 | 依赖 |
|---|---|---|---|
| P3-1 | 纯函数模块与常量：`feeOf(price)`、`availablePieces(user, listings, now)`、`sweepAssets(user, now)`、`sweepListings(listings, now)`（到期挂单置 `expired` 并释放占量）、`releaseOfficial(official, now)`、`planTrade(...)`、`applyOfficialPurchase(...)`、`LISTING_TTL_DAYS = 7` | `cloudfunctions/compat-api/lib/economy-market.js` | 无 |
| P3-2 | 单测（§11 全 16 项） | `lib/economy-market.test.js` + `package.json` scripts.test | P3-1 |
| P3-3 | 资产读写封装（`jiazu_assets` 单文档）与 `jiazu_market` 读写封装 | `lib/economy-market.js`（走 `store.colGet/colSet`） | P3-1 |
| P3-4 | 路由：`GET /market/listings`、`GET /market/my`、`POST /market/list`、`POST /market/cancel`、`POST /market/buy`、`POST /market/official-buy`、`PUT /admin/market/official-stock` | `cloudfunctions/compat-api/index.js` | P3-3 |
| P3-5 | ¥ 钱包对接官方购买（保留 `wallet.js`，新增 `official_bamboo` ¥ 钱包流水类型） | `lib/wallet.js` | P3-4 |
| P3-6 | 前端页面 `pages/market/index.vue` + `pages.json` 注册 + 入口 cell（mine / wallet） | `frontend/src/pages/market/index.vue`、`frontend/src/pages/market/`、`frontend/src/pages.json`、`frontend/src/pages/mine/index.vue`、`frontend/src/pages/wallet/index.vue` | P3-4 |
| P3-7 | API 封装与类型 | `frontend/src/business/api.ts` | P3-4 |
| P3-8 | 部署清单更新（集合 + 路由） | `scripts/upload-migrated-to-cloudbase.mjs`、`docs/PENDING_DEPLOY.md` | P3-4 |

---

## 13. 默认口径与定稿项

> **已定稿（Kevin 拍板，不得擅改）**：官方每日库存初值 **50 束/日**（K4）｜**拒绝自买自卖** 400（K8）｜挂单 **7 天时限**（`LISTING_TTL_DAYS = 7`，K9）｜存在 `open` 挂单时**拒绝注销**（K10，主规则在运营册）｜**平台不设最低价与最高价**（需求原文口径）｜**官方发售不限购**（无每人 / 每账号购买上限；「限额」仅指平台级每日库存 `official.daily_stock`，售罄即止 —— 历史稿「限购 / 超限」表述作废，见 §7.1）。
> 下表为其余默认口径，按此实现，一句话可改。

| # | 项 | 默认口径 | 变更代价 |
|---|---|---|---|
| 1 | 每日释放时点 | 21:00（CST）；21:00 前购买 409「未到发售时间」 | 改 `releaseOfficial` 中的时点常量 |
| 2 | 免收手续费阈值 | `fee = floor(标价/100)`，0 免收 | 改 `feeOf` 一处 |
| 3 | 过期批次落库方式 | 惰性 sweep 后**保留 `qty=0` 留痕 + 写 `Tx type='expire'`**（不物理删批次） | 改 sweep 一处（是否物理删除） |
| 4 | 石榴籽批次有效期 | **一律 365 天**（发放时刻 + 365 天；签到/合成/市集入账/后台发放/分解返还全部适用），**无永久籽**；批次 `expires_at` 恒有值，按同 FIFO 规则消耗 | 不适用（需求明令，不得改为不过期） |
| 5 | 挂单是否可指定片数（非整束） | **一律整束**（`pieces = 100×bundles`） | 需修挂单校验与成交切片 |
| 6 | 挂单锁定表示 | 仅由 `listings` **派生**占量，**不给 `BambooLot` 加 `locked` 字段** | 需修存储契约（§2.3 红线 2） |
| 7 | 成交到期日 | 买方批次 `expires_at` **继承卖方原 lot，不重置** | 改成交切片一处 |
| 8 | 价格区间 | **平台不设最低价与最高价**（需求原文口径，非待确认项） | 不适用（不得新增限价） |
| 9 | 挂单到期留痕 | 到期只置 `status='expired'` 并释放派生占量，写 `Tx{ type:'expire' }` 留痕；**不物理删 `Listing`** | 改 `sweepListings` 一处 |

---

## 14. 部署要点

### 14.1 新集合

- `jiazu_market`、`jiazu_assets` 必须并入 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（当前列表为 `jiazu_person_details` / `jiazu_tree_meta` / `jiazu_users` / `jiazu_wallets` / `jiazu_anchors` / `jiazu_leave_requests` / `jiazu_sms_codes`），否则云端 `/market/*` 写入报错。

### 14.2 新增路由（随 compat-api 重打包 + `tcb fn deploy` 上线）

`GET /market/listings`、`GET /market/my`、`POST /market/list`、`POST /market/cancel`、`POST /market/buy`、`POST /market/official-buy`、`PUT /admin/market/official-stock`。

### 14.3 每日 21 点发售与库存刷新

- **结论：不需要定时触发器**。每日 21:00 释放完全由 §7.2 惰性释放实现，只在有访问时落地；无访问即无消耗，符合"售罄即止、次日刷新、不结转"语义。
- 该结论作为候选条目写入 `docs/PENDING_DEPLOY.md`（章节：待部署清单 → 新增「市集 / 官方发售」一行，注明"惰性释放，无定时器；集合 `jiazu_market`/`jiazu_assets` 需并入 COLLECTIONS"）。
- 若日后后台要求"离线也按日刷新库存键"（如审计需要连续日期键），再评估加入定时触发器；当前不建。

### 14.4 前端

- `pages/market/index` 需随 H5 构建（`VITE_API_BASE` 指向云函数域名）与小程序构建一并打包；入口 cell 归属 `pages/mine/index.vue` 与 `pages/wallet/index.vue`。
