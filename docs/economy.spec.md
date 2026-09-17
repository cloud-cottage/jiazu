# 积分道具经济体系 — 总纲规格（economy.spec.md）

> 状态：**已按 Kevin 2026-09-16 拍板回改（K1–K11）**；逐条落点见 §11「状态」列与正文。其余条目状态见 §11（未标注者仍为待确认）。
> 真源级别：**本册是四大资产字段与全部经济算法的唯一权威**（集合名 / 字段名 / 枚举取值 / 路由清单 / 算法口径 / 价格表）。
> **总纲唯一权威声明（全册口径）**：`docs/economy.spec.md` 为**总纲唯一权威**；各分册——费用 `docs/economy-fee.spec.md`、运维与文案 `docs/economy-ops.spec.md`、市集 `docs/economy-market.spec.md`、时流子域 `docs/spirit-domain.spec.md`——**只在各自专业域内补充与展开**，不得另立集合 / 字段 / 枚举 / 路由 / 算法 / 价格；分册与本册冲突时以本册为准并同步修订分册。
> **文案真源**：全部弹窗与站内信文案以 `docs/economy-ops.spec.md` §6 为准，本册**只引用不重写**（§6 / §9 只指出落点与触发时机，不复制文案正文）。
> 其它分册**只引用本册，不重复定义**；如与 `docs/data-model.md`（集合与 API 契约）或 `docs/clan-tree.spec.md` 冲突，以本册为准并同步修订彼文件。
> 关联：`docs/data-model.md`、`docs/marriage.spec.md`、`docs/clan-tree.spec.md`、`docs/permission-tier.spec.md`、`docs/PENDING_DEPLOY.md`、
> 代码 `cloudfunctions/compat-api/lib/wallet.js`（既有人民币钱包）、`lib/store.js`（colGet / colSet / colDelete / colAtomicNext / updateTrees）、`lib/tree-write.js`、`cloudfunctions/compat-api/index.js`（路由判定链）。

## 1. 一句话

家谱平台引入**四级资产**（石榴籽碎片 / 完整石榴籽 / 竹简·竹片 / 石榴籽玉）作为全部付费能力的载体：
碎片靠**签到与贡献**稀有获得并**自动合成**石榴籽，石榴籽是**唯一通用付费单位**（建树 9 颗 / 关系与内容修改 1 片竹简 /
家族灵气充值 / 市集购买），竹简由**官方 21 点限量发售**与**用户市集整束交易**流通，玉由 **999 颗石榴籽**合成、
镶嵌家族树凹槽以**解锁时流子域（家族专属空间）**（镶嵌不可逆）；全部资产按**惰性结算**推进有效期，扣费一律 **FIFO（最早到期优先）+ 整单拒绝**，
不允许部分扣减，也不允许任何绕过业务接口的直写。

## 2. 术语与价值基准

| 术语 | 单位 | 基准价值 | 说明 |
|---|---|---|---|
| 石榴籽碎片（碎片） | 个 | **0.1 元** | 10 碎片 = 1 颗完整石榴籽 = 1.0 元；无有效期；单账户最多持 9 个 |
| 完整石榴籽（籽） | 颗 | **1.0 元** | 平台唯一通用支付单位；统一最长有效期 **365 天**；无永久籽 |
| 竹简（束） / 竹片（片） | 1 束 = 100 片 | **参考估价 10 元/束**、**官方售价 9.9 元/束** | 存储最小单位 = **片**，展示可折算为束；有效期 **365 天**，到期自动作废 |
| 石榴籽玉（玉） | 枚 | **100 元/枚** | 仅可由 **999 颗完整石榴籽**合成；不可购买，不进入市集 |
| 家族灵气（时流子域） | — | — | 家族树镶嵌玉后解锁的**家族专属空间**（本轮仅平台内页面）；灵气有到期日与状态机 |
| 惰性结算（sweep） | — | — | 任何资产读/写入口先按 `now` 结算过期批次与灵气状态，不依赖定时任务 |

> ★ 玉的基准价值（100 元/枚）与合成门槛（999 籽 ≈ 999 元）**不等值**，按需求原样实现：玉的基准价只用于运营报表与参考口径，
> 不是合成成本。见 §11-2。

## 3. 资产定义（四张表）

### 3-1 石榴籽碎片

| 项 | 口径 |
|---|---|
| 基准价值 | 1 碎片 = 0.1 元 |
| 有效期 | **无有效期**（永不过期） |
| 持有上限 | **单账户最多 9 个**；获得第 10 个时**立即**自动合成 1 颗完整石榴籽并令碎片归零 |
| 可否消耗 | **不可消耗**（永不参与任何扣费） |
| 可否交易 | **不可交易**（不可上架市集、不可转赠） |
| 可否转赠 | **不可转赠**、不可家族共享、不可账号转移 |
| 获取方式 | 签到每日固定 **1 碎片**；**邀请新用户注册 = 9 碎片/次，每日上限 3 次**；**贡献（上传史料 / 老照片 / 文献 / 族谱纠错）= 1 碎片/次，每日上限 9 次**（K3 · 已定稿；§5-1、§11-14 / §11-15）；本轮奖励**仅提供后台发放通道**（`POST /admin/assets/grant`，依据并入 `reason`），用户上传审核流本轮不做 |

> **奖励量与碎片上限的联动（K3 · 已定稿）**：单次邀请奖励 **9 碎片**恰好触及碎片上限 9——账上已有碎片时，`fragments + 9 ≥ 10` 会**立即自动合成** 1 颗完整石榴籽并把碎片降为余数（§5-1）：例如 `3 + 9 = 12` → **当场得 1 籽、碎片余 2**。**不得**出现「碎片 9 个 + 待合成」的中间态，也不得为凑整截断奖励量。贡献奖励 1 碎片/次 × 日限 9 次 = 每日最多 9 碎片，同样触发该联动。

### 3-2 完整石榴籽

| 项 | 口径 |
|---|---|
| 基准价值 | 1 颗 = 1.0 元 |
| 有效期 | **365 天**（统一最长有效期；**无永久石榴籽**） |
| 持有上限 | 无硬上限（合成玉需一次性 999 颗） |
| 可否消耗 | **可消耗**：建树 9 颗、家族灵气充值、市集购买竹简 |
| 可否交易 | 作为**计价与支付手段**，不可上架市集（市集只上架竹简） |
| 可否转赠 | **不可直接转赠**（无 P2P 转籽接口）；价值流转只能经市集交易间接完成 |
| 扣减顺序 | **FIFO by expires_at 升序**（剩余有效期最短的先扣），用户不可手选批次 |
| 获取方式 | 碎片自动合成；运营后台手动单独发放（高阶奖励）；市集出售竹简获得对应标价石榴籽；玉分解返还 |

### 3-3 竹简 / 竹片

| 项 | 口径 |
|---|---|
| 基准价值 | 参考估价 10 元/束、官方售价 9.9 元/束；1 束 = 100 片 |
| 有效期 | **365 天**，到期**自动作废**（不返还、不折算） |
| 持有上限 | 无硬上限（受官方每日限量发售与市集流通约束） |
| 可否消耗 | **可消耗**：修改 / 删除 / 迁移类写操作，单价见 **§5-8**（人物内容修改 1 片/节点、同树改父 1 片/节点、跨树改父 9 片/次、删除节点 3 片/节点）；**新增类 / 关系类一律 0 片** |
| 可否交易 | **仅整束可交易**（1 束 = 100 片，市集挂单单位必须是束）；官方限量发售通道见 §7 |
| 可否转赠 | **不可私人转赠**、不支持家族共享、不支持账号转移；竹片**绑定个人账号** |
| 存储单位 | **片**（`qty` 以片计）；展示层可折算「N 束 M 片」 |
| 获取方式 | 官方 21 点限量发售（人民币 ¥9.9/束）；家族灵气充值赠送（档位表见 §5-9）；市集购买 |

### 3-4 石榴籽玉

| 项 | 口径 |
|---|---|
| 基准价值 | 100 元/枚（运营报表口径，非购买价） |
| 获取方式 | **仅可 999 颗完整石榴籽合成**（不可购买、不可交易） |
| 有效期 | **合成时判定**：参与籽**全部**剩余有效期 ≥ 360 天 → `expires_at = null`（**永久**）；否则 `expires_at` = 本次所用籽中**最早到期**者的到期时刻原值（不按天取整）。见 §11-3 |
| 持有上限 | 无硬上限 |
| 可否消耗 | **可消耗**：镶嵌家族树凹槽（解锁时流子域）；**镶嵌后永久销毁（用户视角）：不可取回、不可分解、不可二次使用** |
| 可否分解 | **可分解（含永久玉）**：免费、无损耗，固定返还 999 籽、产出籽统一 365 天（§11-4）；**已镶嵌玉不可分解**（409，§11-19） |
| 可否交易 | **不可交易** |
| 可否转赠 | **不可转赠** |
| 生命周期 | 合成 → 镶嵌（`mounted_tree_id` 留痕）→ **无「取下」路径**（镶嵌不可逆、凹槽不释放，§4 / §11-19）；家族树被删除时该玉**不返还、不可重镶**（§11-18） |
| 可镶嵌的家族树 | **`kind='family'`（家族谱）与 `kind='clan'`（祖谱）均可镶嵌（K2 · 已定稿）**；**总谱 master（`zhonghua`）除外，不可镶嵌**（400） |

## 4. 存储契约（唯一权威 · 部署名 = `jiazu_` + 逻辑名）

> 全部集合均为**单文档**（`_id = 'global'`），与既有 `jiazu_wallets` 同构（单文档 + 内嵌明细），量级小、无需拆表。
> 本地模式落 `migrate-output/collections/<部署名>.json`；云上走 `jiazu_` 前缀集合（§12-1）。
> **任何路径禁止直写这些集合**：只经业务接口（§5-7）。

### 4-1 `jiazu_assets`（`_id = 'global'`）

```jsonc
{
  "_id": "global",
  "users": {
    "<手机号>": {
      "fragments": 0,              // number(0-9)：碎片，永不参与扣费、永不过期
      "seeds": [],                 // SeedLot[]
      "bamboos": [],               // BambooLot[]
      "jades": [],                 // Jade[]
      "txs": [],                   // Tx[]
      "signin_date": "2026-09-16"  // 'YYYY-MM-DD'：最近一次签到日期（同日重复 → 409，§6-2）
    }
  }
}
```

| 记录 | 字段 | 类型 / 取值 | 含义 |
|---|---|---|---|
| `SeedLot` | `id` | string | 批次 id |
| | `qty` | number（颗） | 该批次剩余颗数（扣减后可为 0，0 即由 sweep 移除） |
| | `expires_at` | ISO 字符串 | 到期时刻（= `created_at` + 365 天） |
| | `source` | `'signin'` \| `'fragment_synth'` \| `'admin'` \| `'market'` \| `'jade_decompose'` \| `'contribution'` | 来源（§4-6 同级唯一枚举） |
| | `created_at` | ISO 字符串 | 创建时刻 |
| `BambooLot` | `id` | string | 批次 id |
| | `qty` | number（**片**） | 该批次剩余片数（1 束 = 100 片） |
| | `expires_at` | ISO 字符串 | 到期时刻（= `created_at` + 365 天） |
| | `source` | `'official_purchase'` \| `'spirit_gift'` \| `'market'` \| `'admin'` | 来源 |
| | `created_at` | ISO 字符串 | 创建时刻 |
| `Jade` | `id` | string | 玉 id |
| | `expires_at` | ISO 字符串 **或 `null` = 永久** | **合成时判定**（§11-3）：参与籽全部剩余 ≥ 360 天 → `null`；否则取所用籽中最早到期批的原值。**无「默认永久」口径** |
| | `created_at` | ISO 字符串 | 合成时刻 |
| | `source` | `'synthesis'` \| `'admin'` | 来源（用户合成 / 运营发放） |
| | `mounted_tree_id` | string（可选） | 已镶嵌的家族树 id；未镶嵌时字段缺省。**写入即不可逆**（不可取回 / 不可分解 / 不可二次使用，§11-19） |
| `Tx` | `id` | string | 流水 id |
| | `ts` | ISO 字符串 | 发生时刻 |
| | `type` | string | 流水类型（§4-6 枚举） |
| | `delta` | `{ fragments?, seeds?, bamboos?, jades? }` | 各资产变动量（正=入账，负=出账） |
| | `fee_seeds` | number（可选） | 该笔交易的中介/手续费籽数（市集用，算法见 §11-8） |
| | `ref` | `{ tree_id?, listing_id?, trade_id?, person_handle? }` | 关联对象 |
| | `desc` | string | 人类可读说明 |
| | `operator` | string（可选） | 运营操作人手机号（`admin` 类流水必填） |

> **⚠️ 本节已知限制 · 部署前必须重构（总监 2026-09-16 拍板：本地阶段暂不改）**：本集合现为**全体用户共用单文档**（`_id = 'global'`，全部用户内嵌在同一份文档的 `users` 映射里），写入只靠 `lib/economy-ledger.js` 的**进程内**同手机号串行锁 → **云端多实例并发可丢更新 / 双花**（本地单实例安全）。
> **重构目标 = 每手机号一文档（`_id` = 手机号）+ `version` 乐观锁 CAS 重试**。详见 §5-7 第 5 条与 `docs/PENDING_DEPLOY.md` §7-7。

### 4-2 `jiazu_spirit`（`_id = 'global'`）

```jsonc
{
  "_id": "global",
  "trees": {
    "<tree_id>": {
      "jade": { "jade_id": "jd_...", "mounted_at": "2026-09-16T00:00:00.000Z", "expires_at": null },
      "spirit_expires_at": "2027-09-16T00:00:00.000Z",   // 家族灵气到期时刻
      "buffer_until": null,                              // 缓冲期结束时刻（status='buffer' / 'expired' 时有值）
      "status": "inactive",                              // 'inactive' | 'active' | 'buffer' | 'expired'
      "logs": []                                         // SpiritLog[]
    }
  }
}
```

| 记录 | 字段 | 类型 / 取值 | 含义 |
|---|---|---|---|
| `SpiritLog` | `id` | string | 日志 id |
| | `ts` | ISO 字符串 | 时刻 |
| | `phone` | string | 操作人手机号 |
| | `plan` | `'daily'` \| `'monthly'` \| `'quarterly'` \| `'half_year'` \| `'yearly'` | 充值套餐档位（§5-9 唯一表） |
| | `seeds` | number | 本次消耗籽数（= 档位实价） |
| | `days` | number | 本次延长天数 |
| | `gift_bamboos` | number（片） | 赠送竹片数（0 = 无赠送） |
| | `spirit_expires_at_after` | ISO 字符串 | 本次充值后的灵气到期时刻 |

### 4-3 `jiazu_market`（`_id = 'global'`）

```jsonc
{
  "_id": "global",
  "listings": [],                  // Listing[]（字段与 expires_at 见下表；惰性过期 = sweep，K9）
  "trades": [],
  "official": {
    "price_fen": 990,                 // 官方售价（分）：¥9.90 / 束
    "daily_stock": 50,                // 后台按活跃用户动态配置的每日配额（束），初值 50（K4 · 已定稿 · Kevin 2026-09-16 拍板）
    "stock": { "2026-09-16": 50 },    // { <YYYY-MM-DD>: number } 当日剩余库存（束）
    "last_release_date": "2026-09-16" // 最近一次释放库存的日期
  }
}
```

| 记录 | 字段 | 类型 / 取值 | 含义 |
|---|---|---|---|
| `Listing` | `id` | string | 挂单 id |
| | `seller_phone` | string | 卖家手机号 |
| | `bundles` | number | 挂单束数（≥1，整数） |
| | `pieces` | number | 挂单片数（= `bundles` × 100） |
| | `price_seeds` | number | 标价籽数（整单总价，不按片计价；**自由报价，平台不设最低价与最高价**，§11-10） |
| | `status` | `'open'` \| `'sold'` \| `'cancelled'` \| `'expired'` | 状态（`expired` = 惰性过期，由 `sweep` 置入并释放锁定，§5-4） |
| | `created_at` | ISO 字符串 | 挂单时刻 |
| | `expires_at` | ISO 字符串 | 挂单时限 = `created_at` + **`LISTING_TTL_DAYS` 天（常量默认 7）**；`expires_at <= now` → `sweep` 置 `status='expired'` 并释放锁定（K9，§5-4 / §11-25） |
| | `sold_at` | ISO 字符串（可选） | 成交时刻 |
| | `buyer_phone` | string（可选） | 买家手机号 |
| `Trade` | `id` | string | 成交 id |
| | `listing_id` | string | 对应挂单 |
| | `buyer_phone` / `seller_phone` | string | 双方手机号 |
| | `pieces` | number | 成交片数 |
| | `price_seeds` | number | 成交籽数（买方支付总额 = 标价） |
| | `fee_seeds` | number | 市集手续费籽数（= `floor(price_seeds × 1/100)`，0 即免收；销毁，§11-8） |
| | `ts` | ISO 字符串 | 成交时刻 |

> **市集挂单与家族树无关（K7 · 已定稿）**：`Listing` **不再含任何家族树字段**（原「卖家锚点家族树」字段随本轮删除，不保留、不复用）——挂单、撤单、购买、成交**不需要买卖双方加入任何家族树**；挂单**不得要求「先加入家族树」**，也**不存在该 400 错误码**（原「锚点树」口径已废除）。家族树锚点只用于家族域内路由，与市集无关。
> **挂单锁定与过期释放（K9 · §11-20 / §11-25）**：挂单期间所涉竹片锁定（不可用于扣费），`expired` 时**锁定释放**（挂单占量消失、竹片回到可用片数 `bamboo_available_pieces`）。

### 4-4 `jiazu_messages`（`_id = 'global'`）

```jsonc
{
  "_id": "global",
  "items": { "<手机号>": [] },        // { <手机号>: Message[] }
  "warned": { "<去重键>": true }      // { <去重键>: true }
}
```

| 记录 | 字段 | 类型 / 取值 | 含义 |
|---|---|---|---|
| `Message` | `id` | string | 消息 id |
| | `type` | `'expiring'` \| `'spirit'` \| `'market'` \| `'system'` | 消息类型（唯一枚举；生成条件与文案见 `docs/economy-ops.spec.md`） |
| | `title` | string | 标题 |
| | `text` | string | 正文（文案真源 = `docs/economy-ops.spec.md` §6） |
| | `created_at` | ISO 字符串 | 生成时刻 |
| | `read` | boolean | 是否已读 |

> `warned` 是**预警去重表**：键为 `<type>:<手机号>:<批次/对象 id>`（阶段后缀见 `docs/economy-ops.spec.md` §4.4），为 `true` 即已发过，不再重复写消息。

### 4-5 `jiazu_ops_logs`（`_id = 'global'`）

```jsonc
{
  "_id": "global",
  "logs": []                          // OpsLog[]
}
```

| 记录 | 字段 | 类型 / 取值 | 含义 |
|---|---|---|---|
| `OpsLog` | `id` | string | 日志 id |
| | `ts` | ISO 字符串 | 时刻 |
| | `operator` | string | 操作人手机号 |
| | `target_phone` | string | 被发放/被操作账号手机号 |
| | `delta` | `{ fragments?, seeds?, bamboos?, jades? }` | 发放量 |
| | `reason` | string | 原因（必填） |

### 4-6 枚举唯一清单（本册为唯一权威 · 实现用，新增取值不改本契约）

**`SeedLot.source`**：`signin`（签到）｜`fragment_synth`（碎片自动合成）｜`admin`（运营发放）｜`market`（市集买入竹简所得）｜`jade_decompose`（玉分解返还）｜`contribution`（贡献奖励）

**`BambooLot.source`**：`official_purchase`（官方购买）｜`spirit_gift`（灵气充值赠送）｜`market`（市集买入）｜`admin`（运营发放）

**`Jade.source`**：`synthesis`（用户合成）｜`admin`（运营发放）

**`Message.type`**：`expiring`（资产到期）｜`spirit`（家族灵气）｜`market`（市集）｜`system`（系统）

**`Listing.status`**：`open`（在售）｜`sold`（已成交）｜`cancelled`（已撤单）｜`expired`（已过期：惰性 `sweep` 置入并**释放锁定**，K9 · 已定稿）

**`Tx.type`**（19 项）：`signin`（签到）｜`fragment_synth`（碎片满 10 自动合成 1 颗籽）｜`reward`（邀请 / 贡献等奖励发放）｜
`expire`（过期作废，§5-4）｜`tree_create`（建树扣 9 颗籽）｜`edit_fee`（人物内容修改 / 同树改父，扣竹片，§5-8）｜
`move_fee`（跨树改父，扣竹片 9 片/次，§5-8）｜`delete_fee`（删除节点，扣竹片 3 片/节点，§5-8）｜
`spirit_charge`（灵气充值，§5-9）｜`jade_synth`（999 籽 → 玉）｜`jade_decompose`（玉 → 999 籽）｜`jade_mount`（镶嵌，`delta` 为 0 的记账条）｜
`market_list` / `market_cancel` / `market_sell` / `market_buy`（市集：上架 / 撤单 / 卖方入账 / 买方出账）｜
`official_buy`（官方竹简购买）｜`admin_grant`（运营发放）｜`account_clear`（账号注销清空）

> 另**保留 1 项既有冲正类型** `fee_refund`（建树扣费后落库失败时原路返还，§5-5-3；`docs/economy-fee.spec.md` §2 对齐表与 §4-3 闸门顺序同用此值）：冲正只允许用该值，不得另造第二套冲正类型。

## 5. 核心算法（逐条，全部实现必须与本册一致）

### 5-1 碎片上限 9 与自动合成

1. 碎片在任何时刻满足 `0 ≤ fragments ≤ 9`（不变量）。
2. 发放碎片时 `fragments += n`；若结果 `≥ 10`：**立即**合成 `floor(fragments / 10)` 颗石榴籽（每颗一个新 `SeedLot`：`expires_at = now + 365 天`、`source = 'fragment_synth'`），并令 `fragments = fragments % 10`。
3. 合成与碎片落库**同一写入**完成（不出现「碎片 10 个、籽未生成」的中间态）；合成写一条 `type='fragment_synth'` 流水。
4. 碎片**永不参与扣费、不可交易、永不过期**；扣费算法（§5-2）只认 `seeds` 与 `bamboos`。
5. **奖励发放与上限的联动（K3 · 已定稿）**：邀请新用户注册 **9 碎片/次（每日上限 3 次）**、贡献（上传史料 / 老照片 / 文献 / 族谱纠错）**1 碎片/次（每日上限 9 次）**。因上限为 9：账上已有碎片时，一次 9 碎片奖励**必然触发第 2 步的立即合成**（`fragments + 9 ≥ 10` → 当场合成 1 籽、碎片取余），**不得**落地「碎片满 9 + 待合成」中间态，**不得**为凑整截断奖励量；超额次数静默不发放（防刷）。

### 5-2 扣减优先级（FIFO + 整单拒绝）

1. 籽与竹片一律按 **`expires_at` 升序**（最早到期优先）扣减，**用户不可手选批次**。
2. 所需数量 > 可用总数 → **整单拒绝**，返回 **409「资产不足」**；**绝不部分扣减、绝不透支为负**。
3. 扣减后可扣量恰好耗尽的批次 `qty = 0` → 由 sweep（§5-4）移除，不在列表里留 0 批次。
4. 同一请求内的扣费（如建树 9 籽 + 立即可选的灵气充值）**顺序执行、各自独立整单校验**，不存在跨单凑数。
5. 扣费与业务写入在同一业务接口内完成；失败时已完成的扣费按 §5-5 返还。
6. **市集成交的批次归属**：买方所得竹片 = 卖方原批次**整束转移**（`expires_at` **继承、不重置**，不因交易续命）；卖方所得籽 = 新建批次（365 天、`source='market'`）。整束与散片的取整规则见 §11-21。

### 5-3 有效期常量

| 资产 | 常量 |
|---|---|
| 石榴籽 | **365 天**（`created_at + 365d`） |
| 竹片 | **365 天**（`created_at + 365d`），到期作废不返还 |
| 碎片 | **无期限** |
| 玉 | **合成时判定**（§11-3）：参与籽全部剩余 ≥ 360 天 → `null`（永久）；否则 = 所用籽中最早到期批的原值 |

### 5-4 惰性结算 `sweep(now)`

1. **任何资产读/写入口**（`GET /assets/summary`、`GET /assets/expiring`、签到、扣费、市集、灵气、运营发放等）**先**执行 `sweep(now)`，再执行业务逻辑。
2. `sweep` 剔除所有 `expires_at <= now` 的 `SeedLot` / `BambooLot`（`expires_at` 为 `null` 的 Jade **恒不过期**，不参与剔除），并为每个被剔除批次写一条 `type='expire'` 流水（`delta` 为负、`desc` 含批次 id 与数量）。
3. **家族灵气状态机在同一入口按 `now` 推进**：
   - **无 `jiazu_spirit.trees[tree_id]` 记录** = 该树**未镶嵌**（不进四态，前端显示「未开启时流子域」）。
   - `inactive`：已镶嵌玉但**从未灌注**（`spirit_expires_at = null`）。
   - `active`：`spirit_expires_at > now`。
   - `buffer`：`spirit_expires_at <= now < buffer_until`（缓冲期，时流子域仍可访问，提示续费）。
   - `expired`：`now >= buffer_until`（时流子域入口停用；或家族树已被删除）。
   - 推进规则：`active` 且到期 → `buffer` 并置 `buffer_until = spirit_expires_at + 30 天`（§11-5）；`buffer` 且越过 `buffer_until` → `expired`；充值成功 → `active`（并清空 `buffer_until`）。**无「取下玉」迁移**（镶嵌不可逆，§11-19）；家族树被删除 → 记录保留、`status` 置 `expired`（§11-18）。
4. **官方竹简库存惰性释放**：进页（任意资产/市集入口的 `sweep`）时判定「当日 21:00 已过」，若 `last_release_date < 当日` 且 `now >= 当日 21:00` → 令 `stock[当日] = daily_stock`、`last_release_date = 当日`。
5. 本轮**无定时任务**：到期作废、21 点发售、到期预警全部靠惰性结算在请求内完成（定时任务与推送留部署阶段，§12-4）。
6. **市集挂单惰性过期与锁定释放（K9 · 已定稿）**：同一次 `sweep(now)` 内，凡 `status='open'` 且 `expires_at <= now` 的挂单 → 置 `status='expired'` **并释放其锁定**（挂单占量消失、该批次竹片回到可用量，§11-20）；**成交与撤单仅对 `open` 有效**，对 `expired` 挂单调用 → **409「挂单已过期」**；`GET /market/listings` 默认不展示 `expired`（§6-1）。`expires_at = created_at + LISTING_TTL_DAYS 天`（常量默认 **7**，可配，见 §11-25）。

### 5-5 建树扣 9颗石榴籽

1. 新建家族树改为扣 **9颗石榴籽**；原 `deductTreeCreateFee`（¥9.90，`wallet.js`）的**人民币扣费钩子废弃**（`/admin/create-tree` 的 `onBeforeWrite: () => wallet.deductTreeCreateFee(...)` 替换为资产侧扣费）。
2. 时序：**全部校验通过后、落库前扣费**（校验 = 权限 / 姓氏 / 始祖 / 唯一性 / 树 id 等既有校验）。
3. 创建失败 → **不扣**；若已扣而后落库失败 → **原路返还同一批次**（恢复原 `qty` 与 `expires_at`，写 `type='fee_refund'` 流水，不新造批次）。
4. 家族树**后续删除不退还**建树籽。
5. 建树扣费为**新增类**操作，与 §5-2 的关系类免费口径独立（单价与闸门见 §5-8）。

### 5-6 账号注销

1. **前置校验（K10 · 已定稿）**：该账号存在**任何 `status='open'` 的市集挂单** → **拒绝注销，409「请先撤销未成交挂单」**（**不自动撤单、不动任何资产**）；已 `sold` / `cancelled` / `expired` 的挂单**不影响注销**。
2. 校验通过后：清空该手机号全部 `fragments` / `seeds` / `bamboos` / `jades`（写一条 `type='account_clear'` 流水留痕后整体置空），**保留审计流水供回溯**。
3. **所有扣费场景资产不足一律直接拦截，无任何豁免通道**（管理员、chief_editor 同样不例外）。
> 本口径**取代**原「注销时 `open` 挂单自动置 `cancelled`」写法（§11-16）。

### 5-7 唯一写入路径与原子性

1. **只通过业务接口写资产**：禁止任何路径（脚本、云函数内部旁路、前端）直接改 `jiazu_assets` / `jiazu_spirit` / `jiazu_market`。
2. 跨树/跨集合写入走 `store.updateTrees` 或 `colAtomicNext` 的原子语义；**禁止读改写竞态**（并发下不得丢更新、不得重复扣费）。
3. 同一挂单的并发购买必须**只有一个成功**（以 `Listing.status` 的条件更新为临界区：仍为 `open` → 置 `sold`，否则 409）。
4. 资产扣费按手机号串行化（同一进程内互斥队列 + 单文档整体 `colSet`），云端并发兜底靠 `colAtomicNext` 计数器与状态条件更新。
5. **⚠️ 已知限制（总监 2026-09-16 拍板：本轮本地阶段暂不改，登记为部署前必须重构项）**：资产集合当前是**全体用户共用单文档**（`jiazu_assets`，`_id = 'global'`）**+ 仅进程内串行锁**（`assetsLocks` 队列只在同一个 Node 实例内按手机号排队）。**云端多实例并发可丢更新 / 双花**：两个实例各自 `colGet` 出同一份文档快照、各自在内存副本上改**各自用户**的条目、再各自整体 `colSet` 回写 → **后写者整体覆盖前者的全部写入**（已扣减的批次复活、已写流水消失、`signin_date` 回退可重复签到；同一批资产被两边各扣一次 = 双花）。本地单实例下不会发生，**测试全绿不能证明云端安全**。**重构目标 = 每手机号一文档（`_id` = 手机号）+ `version` 字段乐观锁 CAS 重试**（读 → 改 → 条件更新校验 `version` → 冲突则重读重试，且余额校验必须在 CAS 成功的那次读内完成）。登记见 `docs/PENDING_DEPLOY.md` §7-7。

### 5-8 竹片扣费单价表与闸门顺序（与 `docs/economy-fee.spec.md` §3-1 / §4-3 一致）

| 操作 | 路由 | 类别 | 单价 |
|---|---|---|---|
| 人物节点内容修改（姓名 / 性别 / 生卒 / 健在 / 称号三字段） | `PUT /people/<handle>` | 修改 | **1 片 / 节点** |
| 同树改父（不带 `new_parent_tree_id`） | `POST /admin/reparent` | 修改 | **1 片 / 节点** |
| 跨树改父 / 整体迁移（带 `new_parent_tree_id`） | `POST /admin/reparent` | 迁移 | **9 片 / 次**（**与带多少后代无关**，不得实现为 9 × 人数） |
| 删除节点 · 整支（subtree）正式提交 | `POST /admin/delete-node`（`mode='subtree'`，`dry_run≠true`） | 删除 | **3 片 / 节点 → 3N 片**（N = 本次删除节点数；每条节点独立计费，不合并计费） |
| 删除节点 · 仅本节点（promote）正式提交 | `POST /admin/delete-node`（`mode='promote'`，`dry_run≠true`） | 删除 | **3 片** |
| 删除节点 · `dry_run=true` 预演 | `POST /admin/delete-node` | 删除 | **0 片**（只算不写；响应带 `fee` 供前端拼确认文案） |
| 删除节点 · 确认数不符（409 范围变化） | `POST /admin/delete-node` | 删除 | **0 片**（校验先于扣费，409 之前不扣） |
| 新建家族树 | `POST /admin/create-tree` | 建树 | **9颗石榴籽**（非竹片，§5-5） |
| 新增类 / 关系类：加父、加子、加配偶、挂接已有节点、总谱续编、认祖及其审批、建谱及其审批、跨树嫁娶及其审批、解除挂载、绑定类、`POST /people`、`POST /families` | 各自路由 | 新增 / 关系 | **0 片**（**不接扣费闸门**） |

- **扣费范围**：**全树都扣**（含中华世本 `zhonghua` 与祖谱 `kind='clan'`），**无豁免通道**；管理员 / `chief_editor` 同样不例外。始祖与上层镜像节点本就只读 → 403，结构上写不进去，不存在扣费。
- **原子性**：扣费与业务写入同事务语义（单树路由扣费在 `updateTree` 之前、跨树迁移在 `updateTrees` 闭包首步；扣费失败则两棵树都不写，落库失败则冲正），**绝不出现「扣了片但数据没改」或「改了数据但没扣片」两种脏态**。
- **扣费顺序（固定，任一实现不得颠倒）**：鉴权（401 / 403）→ 只读预检（403）→ 余额预检（不足 → 409，一个批次都不动）→ **扣费**（权限校验**之后**、store 写入**之前**）→ store 落库 → 落库失败 → 原路返还同一批次（`fee_refund`）。
- **响应新增字段 `fee`**：`PUT /people/<handle>`、`POST /admin/reparent`、`POST /admin/delete-node`（含 `dry_run`）的响应**新增** `fee`（`{ unit, pieces, balance, balance_after }`）——只新增、不改既有字段语义。
- 竹片与籽同规则：**FIFO by `expires_at` 升序 + 整单拒绝 409**（§5-2），绝不部分扣、绝不透支、绝不为负。
- 单价唯一真源 = 实现模块的 `FEE` 常量（`lib/economy-fee.js`），路由内**禁止写魔法数字**；前端文案与「如何获得竹片」提示见 `docs/economy-fee.spec.md` §6 / §8。

### 5-9 蓄能档位表（定稿 · 全文唯一版本，与 `docs/spirit-domain.spec.md` §6-2 一致）

| 档位 `plan` | 实价（籽，**最终扣费标准**） | 延长天数 | 赠送竹简 | 折扣（展示口径） | 活动最低折扣 |
|---|---|---|---|---|---|
| `daily`（单日） | **1** | 1 | 无（0 束） | 100% | 无活动 |
| `monthly`（月度） | **29** | 30 | 无（0 束） | 97% | 无活动 |
| `quarterly`（季度） | **109** | 90 | **1 束（100 片）**（临时活动赠送，默认关闭 → 0 片） | 91% | 83% |
| `half_year`（半年度） | **149** | 180 | **2 束（200 片）** | 83% | 72% |
| `yearly`（年度） | **299** | 365 | **8 束（800 片）** | 82% | 60% |

1. 「实价」= 本次扣费籽数，是**唯一扣费依据**；**折扣列仅展示、不参与任何计算**，不得由折扣反推籽数、不得对实价取整或四舍五入。
2. 赠送竹片写入 `BambooLot`（`qty` 以**片**计、`expires_at = now + 365 天`、`source='spirit_gift'`）；`SpiritLog.gift_bamboos` 记**片**数；赠送不写 `jiazu_ops_logs`。
3. 档位表由 `GET /spirit` 的 `plans` 字段下发（**单一真源**，前端不得硬编码数值）。
4. 充值消耗**个人**石榴籽（FIFO 升序、不足整单拒绝 409）；灵气到期时间在原值上**叠加顺延**（`newExp = max(now, 原值) + days`，绝不覆盖、绝不缩短）；状态机与 30 天缓冲期见 §5-4-3，完整算法与站内提醒见 `docs/spirit-domain.spec.md` §6。

## 6. 接口清单

> 全部路由沿用现有矩形响应约定（`{statusCode, headers, body}`）；鉴权走既有 `authUser` / `requireWriteUser` / `scope.js`。
> ⚠️ **实现位置**：资产与市集路由必须挂在 `index.js` 的**树编辑闸门之前**（现有 `if (!treeId) return send(400, { error: '缺少 X-Tree-Id' })` 位于约 1586 行），否则没有 `X-Tree-Id` 的账号级请求会先被 400 拦掉。仅 `GET /spirit` 需要 `tree_id` 参数。

### 6-1 读

| 方法 | 路径 | 入参 | 返回（200） | 错误码 |
|---|---|---|---|---|
| GET | `/assets/summary` | —（Bearer 必填） | `{ fragments, fragment_cap, seeds_total, seed_lot_count, seed_lots:[SeedLot], bamboos_total_pieces, bamboo_bundles, bamboo_lot_count, bamboo_lots:[BambooLot], jades_total, jades:[Jade]（**每项附 `permanent` = `expires_at === null`**）, signin_date, expiring:[{asset,lot_id,qty,expires_at,days_left}], txs:[Tx]（最近 50 条、倒序） }` | 401 未登录 |
| GET | `/assets/expiring` | `days?`（默认 30，§11-11） | `{ items: [{ asset:'seed'\|'bamboo', lot_id, qty, expires_at, days_left }] }` | 401 |
| GET | `/messages` | `unread?` | `{ items:[Message], unread: number }`（仅本人） | 401 |
| GET | `/market/listings` | `status?`（默认 `open`；**`expired` 挂单默认不展示**，显式传 `status=expired` 才返回，K9） | `{ listings:[Listing]（含 `expires_at`）, official: { price_fen, daily_stock, stock_left_today, release_at:'21:00', released: boolean } }` | — |
| GET | `/market/my` | —（Bearer 必填） | `{ listings:[Listing]（本人挂单）, assets: { seeds_available, bamboo_available_pieces, bamboo_locked_pieces, lots:[…] } }` | 401 |
| GET | `/spirit` | `tree_id`（必填） | `{ tree_id, mounted, status, spirit_expires_at, buffer_until, jade, days_left, logs:[SpiritLog], state_text, plans:[…] }` | 400 缺 tree_id；404 树不存在 |

> **`/assets/summary` 出参即账本实现真源（逐字段对账 `lib/economy-ledger.js` 的 `summarize()`）**：`fragment_cap` = 碎片上限常量 `FRAGMENT_CAP`（9）、`seed_lot_count` = 籽批次数、`bamboo_lot_count` = 竹片批次数、`bamboo_bundles` = `floor(bamboos_total_pieces / 100)`、`jades_total` = 玉的枚数、`txs` = 最近 50 条流水（倒序）、`expiring` = 默认 30 天内到期批次（同 `/assets/expiring` 的 item 形态）。**作为账本实现真源，新增出参必须先改本节**，再改 `summarize()` 与前端类型（`frontend/src/business/api.ts` 的 `AssetsSummary`）。
> **签到态口径**：`/assets/summary` 的 `signin_date` = 最近一次签到的**北京时间自然日 `YYYY-MM-DD`**（从未签到为空串）。前端判定「今日已签到」**以读 `signin_date` 为准**（与当前北京时间自然日相等即视为已签到，无需翻流水）；`POST /assets/signin`（§6-2）的 **409「今日已签到」仅作兜底**。

### 6-2 写

| 方法 | 路径 | 入参 | 返回（200） | 错误码 |
|---|---|---|---|---|
| POST | `/assets/signin` | —（Bearer 必填） | `{ ok:true, fragments, synthesized, seed_lot?, signin_date }`；**同自然日重复 → 409 `{ error: '今日已签到' }`** | 401；**409 今日已签到** |
| POST | `/assets/synthesize-jade` | `{ }`（消耗 999 籽） | `{ ok:true, jade_id, seeds_deducted:999, expires_at, permanent }`（`expires_at` 按 §11-3 三态判定：全部剩余 ≥ 360 天 → `null`、`permanent:true`；否则取所用籽中最早到期批原值） | 401；**409 资产不足**（籽 < 999） |
| POST | `/assets/decompose-jade` | `{ jade_id }` | `{ ok:true, seeds_returned:999, seed_lot }`（产出籽统一 365 天；**永久玉同样可分解**） | 401；404 无此玉；**409「已镶嵌的玉不可分解」**（镶嵌不可逆，**无「取下」路由**） |
| POST | `/messages/read` | `{ ids? }`（缺省 = 全部标为已读） | `{ ok:true, unread }` | 401 |
| POST | `/spirit/mount-jade` | `{ tree_id, jade_id }` | `{ ok:true, status:'inactive', spirit_expires_at:null }`（**镶嵌不赠送初始灵气**，§11-23；镶嵌后玉永久销毁；**任何已登录用户可镶嵌，与灌注同权**，K1） | 401 未登录；404 无此玉/无此树；**400 该树不可镶嵌**（总谱 master / `zhonghua`，K2）；**409 该树凹槽已占**或玉已镶嵌他树 |
| POST | `/spirit/charge` | `{ tree_id, plan }` | `{ ok:true, spirit_expires_at, seeds_deducted, gift_bamboos }`（档位与单价见 §5-9；**任何已登录用户可灌注**，K1） | 401 未登录；400 plan 非法；**409 资产不足** |
| POST | `/market/list` | `{ bundles, price_seeds }` | `{ ok:true, listing_id, pieces, expires_at }`（`expires_at` = 挂单时刻 + 7 天，K9；`price_seeds` 为自由报价，**无上限、无下限**，§11-10；**挂单与家族树无关（无家族树字段、无家族树前置）**，K7） | 401；400 bundles<1 或非整数；**409 资产不足**（可用片数 < `bundles`×100）；**不含任何「先加入家族树」类错误码** |
| POST | `/market/cancel` | `{ listing_id }` | `{ ok:true }` | 401；403 非本人；404 无此挂单；**409 非 `open` 挂单**（已售出 / 已撤单 / **已过期「挂单已过期」**，K9） |
| POST | `/market/buy` | `{ listing_id }` | `{ ok:true, trade_id, pieces, price_seeds, fee_seeds }`（`fee_seeds = floor(price_seeds × 1/100)`，0 即免收；买方实付 = 标价，卖方实收 = 标价 − `fee_seeds`，手续费销毁，§11-8） | 401；404；**409 非 `open` 挂单**（已售出 / 已撤单 / **已过期「挂单已过期」**，K9）；**409 资产不足**；400 买自己的挂单（§11-9） |
| POST | `/market/official-buy` | `{ bundles? }`（默认 1） | `{ ok:true, pieces, balance_cents, stock_left_today }` | 401；**409 未到发售时间**（21:00 前）；**409 今日已售罄**；**409 人民币余额不足**（引导充值） |

> 市集与官方购买中的「资产不足」= 籽不足（`/market/buy`）或人民币余额不足（`/market/official-buy`），统一 409 + `error` 文案不同。
> **既有写路由改语义（路由名不变，响应新增 `fee` 字段，单价与顺序见 §5-8）**：`PUT /people/<handle>`（人物内容修改 1 片/节点）、`POST /admin/reparent`（同树改父 1 片/节点；跨树改父 9 片/次）、`POST /admin/delete-node`（正式提交 3 片/节点；`dry_run` 与 409 范围变化不扣）、`POST /admin/create-tree`（建树扣 9颗石榴籽）。

### 6-3 管理

| 方法 | 路径 | 入参 | 返回（200） | 错误码 |
|---|---|---|---|---|
| POST | `/admin/assets/grant` | `{ target_phone, delta:{fragments?,seeds?,bamboos?,jades?}, reason }` | `{ ok:true, summary }` | 401；403 非 chief_editor；400 缺 target_phone 或 reason |
| GET | `/admin/assets/logs` | `phone?`, `limit?`（默认 50） | `{ logs:[OpsLog] }` | 401；403 |
| GET | `/admin/assets/user` | `phone`（必填） | `{ phone, fragments, seeds_total, bamboos_total_pieces, jades, seed_lots, bamboo_lots, signin_date }`（字段与 `/assets/summary` 同形，主体由「本人」改为 `phone`） | 401；403；400 缺 phone；404 用户不存在 |
| PUT | `/admin/market/official-stock` | `{ daily_stock }` | `{ ok:true, daily_stock }` | 401；403；400 daily_stock < 0 |

> 运营发放的**完整石榴籽**为高阶奖励默认通道；发放的籽批次 `source='admin'`、有效期同样 365 天（不因运营发放变永久）。
> 运营发放竹片以**片**为单位写入 `bamboos`（`source='admin'`），`delta.bamboos` 允许 100 的整数倍亦允许任意片数（存储单位 = 片）。
> 运营发放的玉 `source='admin'`、`expires_at = null`（永久）。

## 7. 官方竹简限量发售

| 项 | 口径 |
|---|---|
| 售价 | **¥9.90/束**（`price_fen = 990`），只扣**既有人民币钱包**（`jiazu_wallets`）余额 |
| 时间 | **每日 21 点**释放当日配额；21:00 前购买 → 409「未到发售时间」 |
| 配额 | `daily_stock` 初值 **50 束/日**（**已定稿 · K4 · Kevin 2026-09-16 拍板**），由**运营后台按活跃用户动态配置**（`PUT /admin/market/official-stock`） |
| 记账 | `stock[<YYYY-MM-DD>]` 记当日剩余；`last_release_date` 记最近释放日 |
| 售罄 | **售罄即止**；当日未售完**不结转**，次日重新释放 `daily_stock`（§11-6） |
| 到账 | 生成 `BambooLot`（`source='official_purchase'`、365 天、`qty = bundles × 100`） |

## 8. 权限口径

沿用现有阶梯（**不新造权限体系**）：`guest` < `user` < `branch_curator` < `tree_steward` < `chief_editor`；
写路径经既有 `requireWriteUser` / `lib/scope.js` 判定（总谱 `zhonghua` 仅 `chief_editor`；user/branch_curator 受节点范围校验；≤72 世深度上限不改）。

| 路由 | 最低权限 | 说明 |
|---|---|---|
| `GET /assets/summary`、`/assets/expiring`、`/messages`、`/market/my` | **user（已登录）** | 只读本人，未登录 401 |
| `POST /assets/signin`、`/messages/read` | **user** | 本人签到 / 本人已读 |
| `POST /assets/synthesize-jade`、`/assets/decompose-jade` | **user** | 本人玉，无需树权限 |
| `GET /spirit?tree_id=` | **guest 可读** | 家族门面信息；未登录可看状态与到期日（精确到天）；**`logs` = 全量灌注流水，该树成员可查看（K1 · 已定稿；需求原文「家族全体成员可查看」）**（`docs/spirit-domain.spec.md` §7-2） |
| `POST /spirit/mount-jade`、`/spirit/charge` | **user（任何已登录用户）** | **K1 · 已定稿：任何已登录用户均可为家族树灌注玉露灵泽（`/spirit/charge`）与镶嵌玉（`/spirit/mount-jade`），镶嵌与灌注同权**——不再限于 `tree_steward` / `chief_editor`，**不再走树写权判定**（仅 401 未登录拦截）。**K2 · 已定稿**：可镶嵌树 = `kind='family'` / `kind='clan'`；**总谱 master（`zhonghua`）不可镶**（400） |
| `POST /market/list`、`/market/cancel` | **user** | 竹片绑定个人账号，只对本人挂单生效；**挂单与家族树无关（K7 · 已定稿）：不校验、不要求账号归属任何家族树** |
| `POST /market/buy`、`/market/official-buy` | **user** | 市集买卖与家族树无关（K7：`Listing` 无任何家族树字段，无「先加入家族树」前置）；**官方购买同样与家族树无关**——不校验、不要求账号已绑定任何家族树（原「官方购买需绑定家族树 / 403 未绑定家族树」口径**已作废**，与 `docs/economy-market.spec.md` §3 / §7 一致） |
| `GET /market/listings` | **guest 可读** | 市集公开浏览 |
| `POST /admin/assets/grant`、`GET /admin/assets/logs`、`GET /admin/assets/user`、`PUT /admin/market/official-stock` | **chief_editor** | 运营侧 |

## 9. 前端落点与入口

| 落点 | 文件 | 内容 |
|---|---|---|
| 资产总览 | 新增 `frontend/src/pages/assets/index.vue` | 「我的资产」：碎片（9 格进度 + 「满 10 自动合成」提示）、完整籽（总数 + 批次明细 + 有效期倒计时）、竹片（折算「N 束 M 片」）、玉；即将过期批次 + 流水列表；签到按钮（当日已签 → 置灰，409 时提示「今日已签到」） |
| 钱包 | `frontend/src/pages/wallet/index.vue` | 保留人民币余额展示，文案收敛为「仅用于购买官方竹简」；新增「市集」入口与「官方竹简 · 每日 21:00 限量」购买区；建树费文案由「¥9.90」改为「**9颗石榴籽**」 |
| 市集 | 新增 `frontend/src/pages/market/index.vue` | 挂单（选束数 + 自由报价籽数，仅整束；**无需任何家族树归属**，K7）、我的挂单（撤单；**展示 7 天有效期 `expires_at` 与「已过期」态，`expired` 不可撤单**，K9）、购买、官方限量区（21 点倒计时 + 今日剩余）；买入确认弹窗显示 `fee_seeds`（0 时显示「免收」） |
| 家族专属空间（时流子域） | `frontend/src/pages/hall/index.vue` 家族页顶部区块（本轮仅平台内页面） | 灵气状态（未开启/未激活/生效中/缓冲中/已过期）、灵气到期日、已镶玉、五档蓄能套餐（§5-9）、镶嵌玉入口（选本人未镶嵌玉）；**镶嵌与灌注入口对任何已登录用户开放（K1 · 已定稿），不再受本树写权限门禁**；**灌注流水对本树成员全量可见**；总谱页不提供镶嵌入口（K2） |
| 人物档案 | `frontend/src/pages/person/detail.vue` | 修改类保存前提示「本次修改将扣 1 片竹简」；竹片不足 → 引导去签到/市集；新增类操作（加父/加子/加配偶/挂接/认祖）**不提示扣费**；删除 / 跨树改父按 `fee` 字段拼确认文案（`docs/economy-fee.spec.md` §7） |
| 管理台 | `frontend/src/pages/admin/index.vue` | 新增「资产发放」（手机号 + 四类资产 + 原因）、「资产流水」（`GET /admin/assets/logs`）、「用户资产快照」（`GET /admin/assets/user`）、「官方竹简库存」（`daily_stock`） |
| 消息 | 首页/我的 未读红点 + `frontend/src/pages/messages/index.vue` 消息中心 | `GET /messages` 未读计数 + 到期预警列表；`POST /messages/read` 标记已读 |
| 路由注册 | `frontend/src/pages.json` | 新增 `pages/assets/index`、`pages/market/index`、`pages/messages/index` 三条路由 |

> 真二级域名（家族专属空间的域名绑定）**本轮不做**，留部署阶段；本轮只落平台内页面 + 灵气到期日/状态数据。
> 全部弹窗与站内信文案以 `docs/economy-ops.spec.md` §6 为准（本册只指出落点，不重写文案）。

## 10. 测试与约束

- **单测（新文件，须注册进 `package.json` 的 `scripts.test`）**
  - `cloudfunctions/compat-api/lib/assets.test.js`：碎片上限 9 与自动合成（第 10 个 → 立即 1 籽 + 归零）、FIFO 升序扣减、整单拒绝（409，不部分扣、不变负）、sweep 过期与 `type='expire'` 流水、玉合成有效期三态判定（参与籽全部剩余 ≥ 360 天 → `expires_at=null`；否则 = 所用籽中最早到期批的原值）、玉分解固定返还 999 籽 + 产出统一 365 天 + 永久玉同样可分解 + 已镶嵌玉 409、建树扣 9 籽 + 失败原路返还同一批次、签到同日重复 409、**奖励量 9/3 与 1/9（邀请 9 碎片/次·日限 3 次；贡献 1 碎片/次·日限 9 次）+ 满 10 自动合成联动（存量 3 碎片领 9 碎片 → 当场 1 籽 + 碎片 2）**、**账号注销前置校验（存在 `open` 挂单 → 409「请先撤销未成交挂单」；无 `open` 挂单 → 清空四类资产）**。
  - `cloudfunctions/compat-api/lib/economy-fee.test.js`：竹片单价矩阵（1 / 1 / 9 / 3 / 3N 与 9 籽）、跨树改父 9 片与后代人数无关、`dry_run` 与 409 范围变化不扣、新增类 / 关系类 0 片（资产总分逐字节不变，含 `zhonghua` 与 `kind='clan'` 各一例）、扣费在权限校验之后（401/403 时资产不变）、落库失败原路返还同一批次、响应 `fee` 字段。
  - `cloudfunctions/compat-api/lib/economy-spirit.test.js`：状态机推进（active→buffer→expired）、缓冲期内续费回 active、五档位逐档（实价 1 / 29 / 109 / 149 / 299 籽，天数 1 / 30 / 90 / 180 / 365，赠送 0 / 0 / 1 束 / 2 束 / 8 束）、镶嵌建立初态（`status='inactive'`、`spirit_expires_at=null`）、镶嵌不可逆（同树二次镶嵌 409、已镶嵌玉调分解 409、**全文无「取下」路由与用例**）。
  - `cloudfunctions/compat-api/lib/economy-market.test.js`：仅整束挂单、挂单锁定批次的可用量、购买 FIFO 付籽 + 卖家入账 + 手续费（199 → 买方 199 / 卖方 198 / 销毁 1；99 → 免收，卖方 99）、并发购买同一挂单仅 1 次成功（第二次 409）、撤单状态守卫、**挂单惰性过期（`expires_at <= now` → `status='expired'` 且锁定释放、可用片数回升）、过期挂单成交 / 撤单 → 409「挂单已过期」、列表默认不展示 `expired`、`Listing` 模型无家族树字段（无家族树前置）**、官方 21 点惰性释放库存与售罄。
  - `cloudfunctions/compat-api/lib/messages.test.js`：到期预警惰性生成与 `warned` 去重、`POST /messages/read` 已读与 `unread` 计数。
- **副本 E2E**：一律 `COMPAT_OUT_DIR` 指向 `/tmp` 副本，并断言 `migrate-output/` 真实数据与 `config/tree-meta.json` 的 **md5 未变**（沿用现有约定）。
- **不变量断言**（每个测试末尾校验）：`0 ≤ fragments ≤ 9`；`Σ seeds.qty`、`Σ bamboos.qty` 与总览读数一致；无 `qty = 0` 残留批次；无负值；挂单 `status` 只取 `open / sold / cancelled / expired`，且 **sweep 后不存在 `status='open'` 且 `expires_at <= now` 的挂单**。
- **并发约束**：扣费路径不得读改写竞态；跨集合写入必须经 `colAtomicNext` / `updateTrees`；云端 SDK 调用继续走 `store.js` 的 `sdkCall` 互斥队列。
- **保持 `npm test` 全绿**（当前 150/150；新测试文件必须注册进 `scripts.test`，否则等于没测）。
- **前端**：`npx vue-tsc --noEmit` 必须 exit 0；新增页面须进 `pages.json`。
- **本轮不做**：真二级域名绑定、定时任务、推送通道、人民币购买积分（永久禁止：人民币 → 籽/碎片/玉）。

## 11. 口径登记表（状态列：**已定稿** = Kevin 拍板口径，实现不得再改；**待确认** = 仍按默认口径实现，如不符一句话即可改）

> **已定稿**项（K1–K11 · Kevin 2026-09-16 拍板）已逐条落入正文（§3 / §4 / §5 / §6 / §8 / §9 / §10）；本表为登记与检索入口，正文与本表冲突时**以正文为准并同步本表**。

| # | 默认口径 | 一句话改法 | 状态 |
|---|---|---|---|
| 1 | **蓄能档位（定稿 · 全文唯一版本）**：`daily` 1 籽 / 1 天 / 无赠送；`monthly` 29 籽 / 30 天 / 无赠送；`quarterly` 109 籽 / 90 天 / 1 束（100 片，**临时活动赠送、默认关闭 · K5 已定稿**）；`half_year` 149 籽 / 180 天 / 2 束（200 片）；`yearly` 299 籽 / 365 天 / 8 束（800 片）。折扣列（100% / 97% / 91% / 83% / 82%）**仅展示、不参与计算**；活动最低折扣 83% / 72% / 60%。完整表见 **§5-9** | 档位为需求原文，改动需 Kevin 重裁；实现只改套餐表一处 | **已定稿**（K5 · Kevin 2026-09-16 拍板） |
| 2 | 玉的基准价（100 元/枚）与 999 籽合成门槛**不等值**，按需求原样实现；玉的基准价只用于运营报表 | 只需在报表口径里换数 | 待确认 |
| 3 | **玉的合成有效期（需求原文）**：消耗 999 籽（FIFO，最早到期优先）；参与籽**全部**剩余有效期 **≥ 360 天** → `expires_at = null`（永久）；否则 `expires_at` = 本次所用籽中**最早到期者的到期时刻原值**（不按天取整）。**无「默认永久」口径** | 判定式 `now + 360 天 <= min(used.expires_at)`；改动需 Kevin 重裁 | 待确认；**P2 实施合成接口时定稿**；实现层面已禁止 `addLot` 对玉隐式默认永久，必须由调用方**显式传 `expires_at`**（`null` = 永久） |
| 4 | **玉分解（需求原文）**：**任意玉（含永久玉）免费分解、无损耗**，固定返还 **999 籽**（单一新批次、`source='jade_decompose'`），产出籽**统一 365 天**（无永久籽）；已镶嵌玉不可分解（§11-19） | 改动需 Kevin 重裁 | 待确认 |
| 5 | 灵气 **buffer 期 = 30 天**（到期后缓冲 30 天仍可用，之后 `expired` 关闭时流子域） | 改 `BUFFER_DAYS` 一处 | 待确认 |
| 6 | 官方竹简**每日 21:00 释放**当日配额，**未售完不结转**；21:00 前购买 409 | 改释放判定一处 | 待确认 |
| 7 | 官方 `daily_stock` 初值 = **50 束/日**（**K4 · 已定稿**；后台按活跃用户动态配置的起点） | 改一个数字 | **已定稿**（K4 · Kevin 2026-09-16 拍板） |
| 8 | **市集手续费（Kevin 定稿）**：`fee_seeds = floor(标价 × 1/100)`，结果为 0 则**免收**；买方实付 = 标价；卖方实收 = 标价 − `fee_seeds`；手续费**销毁**（不入买方、不入卖方、不入平台，平台零收入）。锚点：标价 **199** → 买方 199 / 卖方 198 / 销毁 1；标价 **99** → 免收（卖方 99 / 销毁 0） | 已定稿；改动需 Kevin 重裁 | **已定稿**（Kevin 拍板） |
| 9 | 市集挂单**不允许买自己的挂单**（400「不可购买自己的挂单」；**K8 · 已定稿**） | 去掉一处守卫 | **已定稿**（K8 · Kevin 2026-09-16 拍板） |
| 10 | **平台不设最低价与最高价**（需求明令）：市集标价为自由报价，**无单束上限、无下限**（全文不设任何价格上限/下限常量） | 本行为否定项，无需改动（不设上限常量） | 待确认 |
| 11 | `GET /assets/expiring` 默认阈值 = **30 天内到期** | 改默认天 | 待确认 |
| 12 | 到期预警：在资产入口惰性写入 `jiazu_messages`（去重键存 `warned`），**本轮不推送** | 部署阶段接推送时启用 | 待确认 |
| 13 | **签到仅固定 1 碎片**，无连签加成、无补签；同自然日重复签到 → **409「今日已签到」**（§6-2） | 加连签逻辑一处 | 待确认 |
| 14 | **奖励量（K3 · 已定稿）**：**邀请新用户注册 = 9 碎片/次，每日上限 3 次**；**贡献（上传史料 / 老照片 / 文献 / 族谱纠错）= 1 碎片/次，每日上限 9 次**；去重键 `reward:<type>:<phone>:<ref>`、靠 `Tx` 流水（`type='reward'`）扫描判定重复、**不新增 `jiazu_assets` 顶层字段**的写法不变；**本轮仅提供后台发放通道**（`POST /admin/assets/grant`，依据并入 `reason`），用户侧触发点本轮不接。**9 碎片会触发碎片上限 9 与「满 10 自动合成」联动**：账上已有碎片时**当场合成 1 籽**、碎片取余（§5-1 / §3-1） | 改奖励量一处 | **已定稿**（K3 · Kevin 2026-09-16 拍板） |
| 15 | **奖励每日上限（K3 · 已定稿）**：邀请 **3 次/日**、贡献 **9 次/日**（按奖励类型分别计数，超出**静默不发放**，防刷）；计数同样靠 `Tx`（`type='reward'`）流水扫描，不新增顶层字段 | 改上限一处 | **已定稿**（K3 · Kevin 2026-09-16 拍板） |
| 16 | **账号注销前置校验（K10 · 已定稿）**：存在任何 `status='open'` 挂单 → **拒绝注销 409「请先撤销未成交挂单」**；已 `sold` / `cancelled` / `expired` 的无碍；通过后按原口径清空个人四类资产并**保留审计流水**。**取代**原「注销时 `open` 挂单自动置 `cancelled`」口径（§5-6） | 去掉前置校验一处 | **已定稿**（K10 · Kevin 2026-09-16 拍板） |
| 17 | **市集挂单与家族树无关（K7 · 已定稿）**：`Listing` **删除原家族树锚点字段**（字段表、§6 接口入参 / 出参全部清除）；挂单**不得要求「先加入家族树」**，**不得出现该 400 错误码** | 重新引入该家族树字段一处 | **已定稿**（K7 · Kevin 2026-09-16 拍板） |
| 18 | **家族树删除后**：`jiazu_spirit[tree_id]` 记录**保留**、`status` 置 `expired`；该树已镶嵌的玉**不返还、不可重镶**（镶嵌即永久销毁） | 改为随树作废一处 | 待确认 |
| 19 | **镶嵌不可逆（需求原文）**：镶嵌后玉**永久销毁**、不可取回、不可分解、不可二次使用；**无「取下」路由**，凹槽不释放。已镶嵌玉调分解接口 → **409「已镶嵌的玉不可分解」** | 已定稿；恢复「取下」需 Kevin 重裁 | **已定稿**（Kevin 拍板） |
| 20 | 已上架竹片**锁定**：挂单期间该批次不可用于其它消耗（本版本竹片唯一消耗是修改 / 删除 / 迁移类扣费，§5-8）；**挂单过期（`expired`）时锁定释放**（K9 · 见 §5-4 与第 25 行） | 改为挂单不锁一处 | 待确认 |
| 21 | 市集成交按**整束**转移：从卖方最早的批次起整束取用（取到 100 片的整数倍）；卖方单批不足 1 束时**不得**与其它批次拼成一束上架（挂单可用量 = `floor(可用片数 / 100) × 100` 片），买入方接收到的批次 `expires_at` 继承卖方原值 | 改为允许拼束一处 | 待确认 |
| 22 | 市集成交后卖方入账籽的 `source='market'`（本册统一枚举），实现若细分来源，只允许值为 `'market'` | 换枚举值一处 | 待确认 |
| 23 | **镶嵌后不自动赠送初始灵气（K6 · 已定稿）**：`status` 初始 = `'inactive'`（`spirit_expires_at = null`），首次灌注后转 `'active'`；玉自身的 `expires_at`（含永久）**不驱动**灵气有效期 | 改为赠送初始灵气一处 | **已定稿**（K6 · Kevin 2026-09-16 拍板） |

| 24 | **灌注 / 镶嵌权限放开（K1 · 已定稿）**：任何**已登录用户**均可为家族树灌注玉露灵泽（`POST /spirit/charge`）与镶嵌玉（`POST /spirit/mount-jade`），**镶嵌同权**（与灌注一致），不再限于 `tree_steward` / `chief_editor`；灌注流水（`SpiritLog` / `logs`）**该树成员可查看全量**（需求原文「家族全体成员可查看」）。见 §8 / §6-2 | 恢复树写权门禁一处 | **已定稿**（K1 · Kevin 2026-09-16 拍板） |
| 25 | **挂单时限（K9 · 已定稿）**：`Listing.expires_at` = 挂单时刻 + **`LISTING_TTL_DAYS` 天（常量默认 7，可配）**；惰性 `sweep` 把 `status='open'` 且 `expires_at <= now` 的挂单置 `status='expired'` **并释放锁定**（占量消失、竹片回到可用）；`status` 枚举 = `open` / `sold` / `cancelled` / `expired`；成交与撤单**仅对 `open` 有效**，`expired` → **409「挂单已过期」**；列表**默认不展示** `expired`。见 §4-3 / §4-6 / §5-4 / §6 / §10 | 改 `LISTING_TTL_DAYS` 一处 | **已定稿**（K9 · Kevin 2026-09-16 拍板） |
| 26 | **祖谱可以镶玉（K2 · 已定稿）**：`kind='family'`（家族谱）与 `kind='clan'`（祖谱）**均可镶嵌**；**总谱 master（`zhonghua`）除外**，不可镶嵌（400）。见 §3-4 / §8 | 已定稿；改动需 Kevin 重裁 | **已定稿**（K2 · Kevin 2026-09-16 拍板） |

## 12. 部署要点

1. **新集合并入上传脚本**：`jiazu_assets`、`jiazu_spirit`、`jiazu_market`、`jiazu_messages`、`jiazu_ops_logs` 五个集合
   必须补进 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 列表（当前列表只有 7 个基础集合，另有
   `jiazu_join_requests` / `jiazu_marriage_requests` / `jiazu_founder_requests` / `jiazu_clan_requests` 四个申请集合待补），
   否则云端对应路由写入报错。本地模式对应 `migrate-output/collections/jiazu_*.json`。
2. **新增路由清单**（共 **20 条**，与 §6 接口清单逐条一致，全部需在 `tcb fn deploy compat-api` 前打包）：
   - 读（6 条）：`GET /assets/summary`、`GET /assets/expiring`、`GET /messages`、`GET /market/listings`、`GET /market/my`、`GET /spirit`
   - 写（10 条）：`POST /assets/signin`、`POST /assets/synthesize-jade`、`POST /assets/decompose-jade`、`POST /messages/read`、
     `POST /spirit/mount-jade`、`POST /spirit/charge`、`POST /market/list`、`POST /market/cancel`、`POST /market/buy`、`POST /market/official-buy`
   - 管理（4 条）：`POST /admin/assets/grant`、`GET /admin/assets/logs`、`GET /admin/assets/user`、`PUT /admin/market/official-stock`
   - 另有 **4 条既有路由改语义**（路由名不变，响应新增 `fee` 字段，单价见 §5-8）：`POST /admin/create-tree`（扣费钩子换成扣 9颗石榴籽）、
     `POST /admin/reparent`（同树改父 1 片/节点；跨树改父 9 片/次）、`PUT /people/<handle>`（人物内容修改 1 片/节点）、
     **`POST /admin/delete-node`**（正式提交 3 片/节点；`dry_run` 与 409 范围变化不扣）。
   - ⚠️ 上述路由必须挂在 `index.js` 树编辑闸门（约 1586 行 `缺少 X-Tree-Id`）**之前**。
3. **人民币钱包收缩**：`jiazu_wallets` 保留，但**只用于购买官方竹简**；`trees[tree_id].balance_cents` 与
   `transferToTree` **下线**（`/wallet/transfer`、`/wallet/tree-balance` 关闭或返回 410，前端对应入口移除）；
   `config.tree_create_fee_cents` 不再参与建树。**人民币不可直接购买积分**（永久口径）。

   > **§12-3 状态（2026-09-17 回写 · 已实施）** —— 本节文字为原文，状态以本括注为准；逐字落点与测试见
   > `docs/home-sort-search.spec.md` §8（本册为该口径的唯一权威，彼册只引用不重写）。
   > ① **两条路由已在下线端落地**：`POST /wallet/transfer` 与 `GET /wallet/tree-balance` 在**鉴权 / 参数校验之前**
   > **恒返 410** + `{ error: '家族树资金功能已下线', code: 'TREE_FUND_RETIRED' }`（本批 **15 种请求组合实测全 410**；
   > 对照组 `GET /wallet/balance` 仍按原口径 401 / 200 正常，未被牵连）。
   > ② **`lib/wallet.js` 已删 `transferToTree` / `getTreeBalance`**，**保留** `deductTreeCreateFee`（建树费钩子不变）。
   > ③ **前端入口已移除**：家族树页「家族树资金」区块 + 「转账支持」入口、钱包页「转账到家族树」区块，
   > 以及 `business/{api,index}.ts` 的两个封装（`transferToTree` / `fetchTreeBalance`）均已删除，并同步 `about.vue` / `mine/index.vue` 文案。
   > ④ **已处理（2026-09-18 · ✅）**：`auth-server/**`（遗留 Gramps 链路）的同名转账残留**已删除** ——
   > `auth-server/server.js` 的 `/api/wallet/transfer` 与 `/api/wallet/tree-balance` 两条路由、`auth-server/wallet.js` 的
   > `transferToTree` / `getTreeBalance` 均已移除（`grep` 0 残留），其**钱包数据残留**（`trees` 字段 + `type:'transfer'` 流水）同批清理。
   > 它**仍属遗留链路、当前不部署**（若日后部署需与本次代码同批发布）；事实 / 备份 / 回滚见 **`docs/zhonghua-cleanup-2026-09.spec.md`**。
   > ⑤ **已处理（2026-09-18 · ✅）**：钱包页余额卡片文案已由「新建家族树费用：¥9.90」改为「新建家族树消耗 **9颗石榴籽**」
   > （`frontend/src/pages/wallet/index.vue` 第 8 行 + 常量 `TREE_CREATE_FEE_SEEDS = 9`），与本册 **§5-5 建树扣 9颗石榴籽**
   > 及 **§9 前端落点表** 口径一致；原登记项 `docs/PENDING_DEPLOY.md` §16-7 已同步标为 ✅。
4. **无定时任务**：本轮不注册任何定时任务，到期作废 / 21 点发售 / 到期预警 / **挂单过期释放锁定（K9）**全靠**惰性结算**在请求内完成；
   定时任务与推送（含真二级域名绑定）统一留部署阶段。
5. **打包与部署**：沿用现有流程 —— `npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`，
   再 `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`。
6. **前端产物**：`build:h5`（带 `VITE_API_BASE`）+ hosting 部署；小程序 `build:mp-weixin` 后上传；新增页面进 `pages.json`。
7. **部署后冒烟**：签到 → 满 10 碎片得 1 籽；同日重复签到 → 409「今日已签到」；建树（无 9 籽 → 409；有 → 扣 9 籽）；改一个人物内容（扣 1 片）；删除一个节点（扣 3 片，响应带 `fee`）；21 点前后各买一次官方竹简（未到点 409 / 到点成功）；挂单 → 另一账号购买（FIFO 付籽、卖家实收 = 标价 − `fee_seeds`）；合成玉（全 ≥ 360 天 → `expires_at=null`）→ 镶嵌（`status='inactive'`）→ 蓄能 `daily`（1 籽 / 1 天）→ 已镶嵌玉调分解 409；`GET /spirit` 状态随到期推进；**任意已登录账号为家族树灌注 / 镶嵌（不再限树管，K1）**；**挂单 7 天到期后 sweep 置 `expired` 且可用片数回升、对该挂单成交 / 撤单 → 409「挂单已过期」**；**存在 `open` 挂单时注销 → 409「请先撤销未成交挂单」**；祖谱（`kind='clan'`）可镶玉、总谱不可镶（K2）。
8. **本册为字段与算法唯一权威**：任何实施改动涉及字段名、集合名、枚举取值、路由清单、算法口径、价格表时，**先改本册**再改代码；
   分册（费用 / 运维文案 / 时流 / 市集）只允许在专业域内引用与展开，不得另立口径。
