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

> **§4-1 追加登记（2026-09-25 · Zang 裁定 **Z-7** · 承「**先改总纲，再改实现**（R-16 / R-18）」· **上方 JSON 示形与字段表的既有行一律原文保留、一字不改**）**

| 记录 | 追加字段 / 键 | 类型 / 取值 | 含义 |
|---|---|---|---|
| `users[<手机号>]` | **`scroll_fragments`** | number（**0–9**） | **兰帖碎片**（第二个碎片标量；与既有 `fragments`（石榴籽碎片）**各自独立** ⇒ **不得共用同一常量**） |
| `users[<手机号>]` | **`scrolls`** | `ScrollLot[]` | **成品兰帖批次数组**（与 `seeds` / `bamboos` / `jades` **并列**） |
| `ScrollLot` | `id` / `qty` / `expires_at` / `source` / `created_at` | string / number（**片**）/ **恒 `null`（永久，写入必须显式传）** / string（取值见 §4-6 追加登记）/ ISO 字符串 | 批次 id / 片数 / **无有效期** / 来源 / 创建时刻 |
| `Tx.delta` | **追加两键** `scroll_fragments?` / `scrolls?` | number / `ScrollLot[]` | **允许扩展**（**只增键、不改既有键语义**；**已有实现先例**）⇒ 键集 = `{ fragments?, seeds?, bamboos?, jades?, scroll_fragments?, scrolls? }` |

- **纪律（三条）**：① `scrolls[].expires_at` **写入必须显式传 `null`**（承 §15-3：「**不得给批次构造函数引入默认永久**、**缺省即抛错**」）；② **`bamboo_fragments` 不存在**（**R-1**：竹简碎片 = **既有竹片**，**不新增碎片层、不新增字段**）；③ 追加键**不得**改变既有四键的语义与存在性（**任何按 `delta` 键集穷举的读取方**须同步）。
- **裁定来源**：`docs/friend-domain.spec.md` §15-10 的两读法 ⇒ **已裁定 = 允许扩展**（该册 **§17-9-C-7** 登记）；**本表的唯一权威性不变**（§12-8）。§15-5 ⑥ 末句「是否允许扩展 `delta` 形状**未裁**」⇒ **已裁定**（旧行原文保留）。
- **一句话可改**：改本表 `Tx.delta` 那一行一处（撤回扩展须同步 `lib/economy-ledger.js` 的 `delta` 组装、§4-6 追加登记与 `docs/friend-domain.spec.md` §9-3 / §17-9-C-7）。

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

> **§4-6 追加登记（2026-09-25 · Zang 裁定 **Z-7** · 承「**先改总纲，再改实现**（R-16 / R-18）」· **上方六条枚举清单的既有行一律原文保留、一字不改**）**

**① `Tx.type`（追加 4 项 + 复用 2 项）**

| 取值 | 注释 | 状态 |
|---|---|---|
| **`scroll_synth`** | 兰帖碎片满 100 自动合成 1 枚成品兰帖（与既有 `fragment_synth` **对称**，**不得复用** `fragment_synth`） | **已裁**（**Z-7** 登记） |
| **`scroll_decompose`** | 兰帖分解返还（与既有 `jade_decompose` 对称） | **已裁**（**Z-7** 登记） |
| **`friend_renew`** | 好友续约消耗成品兰帖（**双方各一条**，`delta` 为负；`ref` 须含 `rel_id` 与**对端脱敏标识**） | **已裁**（**Z-7** 登记）；**同步落 `docs/economy-fee.spec.md` §3-1 #37** |
| **`scroll_consume`** | 好友续约**双边各消耗 1 枚成品兰帖**（各 100 片；`delta = { scrolls: -100 }`，与既有 `scroll_decompose` 同键同向）；**冲正仍只用既有 `fee_refund`** | 已裁（本批 · 裁定 1 登记） |
| **`friend_reward`** | 好友奖励池分发 / 基础奖励发放（**每位收件人各一条**） | **已裁**（**Z-7** 登记） |
| 复用 **`reward`** | 邀请新用户注册奖励（`delta` 可**同时**含 `fragments` 与 `scroll_fragments`；**不新造邀请类流水类型**） | 复用（**不增量**） |
| 复用 **`fee_refund`** | **唯一允许的冲正类型**（**继续唯一**，不得另造第二套冲正） | 复用（**不增量**） |

⇒ 追加后 `Tx.type` 取值项数 = **既有 19 项 + 新增 4 项 = 23 项**（**复用项不增量**）；**命名不得与既有 19 项重名**。

> **项数重算（好友域路由批次 · **裁定 1** 追加登记 · **只增行 · 上方项数行原文保留、一字未改**）**：本表**登记行** = 既有 19 项 + 新增 **5** 行（`scroll_synth` / `scroll_decompose` / `friend_renew` / `friend_reward` / 本批追加的 `scroll_consume`）= **24 行**；其中 **`friend_renew` 已废止、由 `scroll_consume` 取代**（见下方取代标注）⇒ **有效不同取值 = 24 − 1 = 23 项**；**复用项（`reward` / `fee_refund`）不增量**。**算例逐字**：`19 + 5 = 24`（登记行数）、`24 − 1 = 23`（有效取值数）。**⚠️ 两口径不得混用**：引用「项数」时**必须**写明按**登记行数（= 24）**还是按**有效不同取值数（= 23）**。
> **取代标注（原文保留 · 一行未删）**：本表 **`friend_renew`** 一行**原文保留、一字未改**，其**语义已由 `scroll_consume` 取代** ⇒ **实现与后续引用一律以 `scroll_consume` 为准**（`friend_renew` **不再作为可实现的 `Tx.type` 取值**）；其 `ref` 内既有的 `rel_id` 字面**同批已废止**，一律改 `relation_token`。落点 = `docs/friend-domain.spec.md` **§19-1 / §19-2**（路由字面与取代标注）。
> **同批未裁项不变**：`SeedLot.source.friend_reward` / `BambooLot.source.friend_reward` / `ScrollLot.source.friend_reward` 的拟定行**本批未裁**（承本小节 **②** 各行的拟定状态；**未裁前不得据任一名判实现负**）。

**② 各批次数组的 `source`**

| 枚举 | 追加取值 | 注释 | 状态 |
|---|---|---|---|
| `ScrollLot.source`（**`scrolls[]`，§4-1 追加登记**） | **`scroll_synth`** | 兰帖碎片满 100 自动合成 1 枚成品兰帖 | **已裁**（**Z-7** 登记） |
| `ScrollLot.source` | `friend_reward` | 池**直接**产出成品兰帖 | **拟定**（**本轮不启用**：池内给的是**碎片**，承 **R-5**） |
| `SeedLot.source` | `friend_reward` | 好友奖励产出的石榴籽（**与既有 `fragment_synth` 二选一未裁**） | **拟定（未裁）** |
| `BambooLot.source` | `friend_reward` | 好友奖励产出（= **既有竹片**，**R-1**） | **拟定（未裁）** |
| `ScrollLot.source` / 其余 | `admin` | 运营发放（**复用既有语义**） | 已定稿（沿用本清单） |

**③ `Message.type`（追加 1 项，**拟定 · 未裁**）**：`friend` = 好友邀请 / 续约申请 / 到期与缓冲期提醒 / 关系解除；**落地集合 = 既有 `jiazu_messages`**（§4-4）—— **不得造第二套消息域**（**R-16**）；去重键沿用既有形态 `<type>:<手机号>:<rel_id>`（拟定）。

**④ 不在本清单的域内字段**：`FriendRel.status`（`pending_invite` / `active` / `buffer` / `revoked`）、`revoke_reason` —— 属**新集合字段**，域内字段表 = `docs/friend-domain.spec.md` **§7-1**；**字面仍待裁**（该册 §15-6）。

> **状态汇总（本轮）**：**已裁** = `Tx.type` 4 项 + `Tx.delta` 两键（**Z-7**）；**拟定（未裁）** = `SeedLot.source.friend_reward` / `BambooLot.source.friend_reward` / `ScrollLot.source.scroll_synth` 之外的 `friend_reward` / `Message.type.friend`（承 §15-5 ②③④⑤）—— **未裁前不得据任一名判实现负**。
> **一句话可改**：改上表任一枚举取值一处（须同步实现侧同源枚举、§4-1 追加登记与 `docs/friend-domain.spec.md` §9 / §17-9-C-7）。

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

---

## 13. 道具栏（背包）UI 口径（**追加章节 · Zang 裁定 v1 / v2 · 纯展示层 · 无新集合 / 无新字段 / 无新枚举 / 无新路由 / 无新算法**）

> ⚠️ **已被取代 · 原文保留（追加 · 2026-09-24 · Zang 裁定 v3–v6）**：本节登记的 **v1 / v2 口径已整体被 `§14` 取代** —— 其中 §13-2（碎片恒不占格）、§13-3（零头行）、**§13-4（默认序「玉 → 籽 → 竹简」）**与 v3+ 代码 / 实测**不一致**（§13-4 详见 §14-7 第 4 行）。**本节正文（§13-1 – §13-9）一律原文保留、不得据本节实现或验收**；**现行口径 = §14**，逐条取代对照见 **§14-7**。本节所载行号为 **v1 / v2 修订时点**的读数，**已随 v3–v6 漂移**（现行行号见 §14 各条）。

> **性质（`AGENTS.md` §0 第 4 条 / §10 纪律）**：本节为**追加章节** —— 本册 **§1–§12 的既有行一律原文保留**，本节不改写、不重排任何历史行。
> **范围**：只登记**前端展示层口径**（换算、默认序、零头、溢出、属性提示、拖曳、文案单点）；**不新增**集合 / 字段 / 枚举 / 路由 / 算法 / 价格，数据源 = 本册 §6-1 既有的 `GET /assets/summary`（路由与出参口径不变）。
> **数值 / 字面纪律（承 `AGENTS.md` §0 第 3 条）**：本节全部常量、文案、阈值均**从代码逐字读取**；出处行号为 **2026-09-24** 实测。代码落点（真源）= `frontend/src/business/inventory.ts`（纯逻辑）、`frontend/src/business/asset-text.ts`（文案单点）、`frontend/src/components/asset-inventory/asset-inventory.vue`（容器组件）、`frontend/src/pages/mine/index.vue`（取数 + 挂载）、`frontend/src/pages/assets/index.vue`（文案复用）。

### 13-1 换算常量（`business/inventory.ts`）

| 常量 | 值 | 含义（逐字注释） | 出处 |
|---|---|---|---|
| `SEEDS_PER_ITEM` | **9999** | 标准石榴籽：9999 颗 = 1 个道具 | `inventory.ts:20` |
| `JADES_PER_ITEM` | **1** | 石榴籽玉：1 枚 = 1 个道具 | `inventory.ts:22` |
| `BAMBOO_PIECES_PER_ITEM` | **100** | 竹简：100 片 = 1 个道具 | `inventory.ts:24` |
| `FRAGMENTS_PER_ITEM` | **10** | 石榴籽碎片：10 个 = 1 个道具 | `inventory.ts:26` |
| `SLOT_COUNT` | **36** | 道具栏位总数：6 × 6 = 36 | `inventory.ts:28` |
| `SLOT_COLUMNS` | **6** | 道具栏列数（6 × 6；渲染端取本常量，避免第二套网格口径） | `inventory.ts:30` |

- **1 格 = 1 道具**（`inventory.ts:5-6` 文件头口径）：标准石榴籽 `floor(seeds_total / 9999)` 格（实现 = 按到期升序 FIFO 切整道具，`inventory.ts:204`）、石榴籽玉 **1 枚 = 1 格**（`inventory.ts:171`）、竹简 `floor(bamboos_total_pieces / 100)` 格。
- 渲染端列数**只取 `SLOT_COLUMNS`**：`grid-template-columns: repeat(${SLOT_COLUMNS}, 1fr)`（`asset-inventory.vue:144`）⇒ 网格恒 6 × 6。
- 数据源字段（既有，未改）：`AssetsSummary.fragments` / `fragment_cap` / `seeds_total` / `bamboos_total_pieces` / `jades` / `seed_lots` / `bamboo_lots`（`business/api.ts:2194-2213`）；封装 = `fetchAssetsSummary()` → `GET /assets/summary`（`api.ts:2232-2234`）。

### 13-2 碎片恒不占格（**不特判为 1 格**）

- **口径**：碎片按换算规则 `floor(fragments / FRAGMENTS_PER_ITEM)`（= `floor(fragments / 10)`）折算；服务端 `fragment_cap = 9`（`AssetsSummary.fragment_cap`，`api.ts:2198`；注释逐字「碎片上限（服务端常量 FRAGMENT_CAP，当前为 9）」）⇒ **按规则自然导出为 0 格**，**不得特判为 1 格**（`inventory.ts:6-8`）。
- **实现落点**：`buildInventory` 的 `items` **只由 `jades` / `seed_lots` / `bamboo_lots` 组成**（`inventory.ts:120-124`），碎片不参与 `items`，只出现在零头行（`inventory.ts:250`）⇒ 碎片占格**恒为 0**。
- ⚠️ **落点差异（如实登记）**：文件头注释以 `floor(fragments / 10)` 表述该口径，而实现中**不存在对 `fragments` 的 `Math.floor` 计算**（碎片按**构造**不进 `items`）；两种表述**结论一致（0 格）**。

### 13-3 零头行（不足 1 个整道具的余量：**不占格、单行展示**）

| 项 | 逐字文案模板 | 出处 |
|---|---|---|
| 籽余 | `${seeds_total % SEEDS_PER_ITEM} 颗石榴籽`（例：`9998 颗石榴籽`） | `inventory.ts:246-247` |
| 竹简余 | `${bamboos_total_pieces % BAMBOO_PIECES_PER_ITEM} 片竹简`（例：`99 片竹简`） | `inventory.ts:248-249` |
| 碎片 | `${fragments} 个石榴籽碎片（满 ${FRAGMENTS_PER_ITEM} 自动合成 1 颗石榴籽）`（例：`9 个石榴籽碎片（满 10 自动合成 1 颗石榴籽）`） | `inventory.ts:250-255` |

- **余量 0 的项不出现**：`if (seedRest > 0)` / `if (bambooRest > 0)` / `if (fragments > 0)`（`inventory.ts:247 / 249 / 250`）；全为 0 ⇒ `leftovers` 为空数组、零头行整体不渲染（`asset-inventory.vue:54`）。
- 行首标签**逐字 `零头：`**（`asset-inventory.vue:55`）；多项以 **` · `** 连接成**单行**（`leftoverText` = `leftovers.map(part => part.text).join(' · ')`，`asset-inventory.vue:145`）。

### 13-4 默认序（玉 → 籽 → 竹简）

1. **类型分组：石榴籽玉 → 标准石榴籽 → 竹简**（`KIND_ORDER = { jade: 0, seed: 1, bamboo: 2 }`，`inventory.ts:116`；比较器 `compareItems`，`inventory.ts:156-161`）。
2. **同类内：到期近的在前**（`a.expiresAtMs - b.expiresAtMs`，`inventory.ts:158`）。
3. **永久玉在该类最后**：`expires_at` 空 ⇒ `expiresAtMs = Infinity`（`inventory.ts:166 / 178`；`timestampOf` 对空值 / 非法值同样返 `Infinity`，`inventory.ts:276-281`）。
4. **同到期以稳定 id 兜底**（`a.id < b.id ? -1 : 1`，`inventory.ts:159-160`）⇒ 默认序确定可复现；玉 id = `jade:${j.id}`（`inventory.ts:168`）、籽 / 竹简整道具 id = `${kind}:${k}`（`inventory.ts:210`）。
5. **占用格连续排在前、空格在后**：`slots` 固定 `SLOT_COUNT` 项、未占用为 `null`（`inventory.ts:127-128`）；组件只把占用格放进 `ordered`，渲染时尾部补 `null`（`asset-inventory.vue:141-143 / 184`）。
6. 籽 / 竹简的切格法 = **按到期升序的 FIFO**，每格取该格覆盖原始单位的**最近到期**（`lotItems`，`inventory.ts:189-223`；`nearestExpiryOfRange`，`inventory.ts:225-241`），与「到期近的在前」自洽。

### 13-5 溢出口径（占格需求 > 36）

- **触发判据**：占格道具总数 > `SLOT_COUNT`（36）⇒ `overflows` 非空（`overflowLines(items.slice(SLOT_COUNT))`，`inventory.ts:137`；`occupiedTotal` = 全部占格道具数（含溢出、未截断），`inventory.ts:138`）。
- **网格不变**：仍是 6 × 6；`cells` 恒为 `SLOT_COUNT` 长（`asset-inventory.vue:141-143`）。
- **溢出道具不入格**：`slots` 只取前 `SLOT_COUNT` 个（`inventory.ts:128`），超出的道具**不渲染格子**（`inventory.ts:74-75`）。
- **按类型汇总、每类一行**，顺序 = 玉 → 籽 → 竹简（`inventory.ts:261-263`）；行首量词短语逐字 = `溢出 ${count} ${KIND_ITEM_UNIT[kind]}${KIND_NAME[kind]}`（`inventory.ts:269`）：

| 类型 | `KIND_ITEM_UNIT` | `KIND_NAME` | **溢出提示文案（逐字）** | 出处 |
|---|---|---|---|---|
| 玉 | `枚` | `石榴籽玉` | **`背包空间不足，无法合成`** | `inventory.ts:95-99 / 81-85 / 110` |
| 籽 | `个` | `标准石榴籽` | **`空间不足，无法持有`** | `inventory.ts:95-99 / 81-85 / 111` |
| 竹简 | `个` | `竹简` | **`空间不足，无法持有`** | `inventory.ts:95-99 / 81-85 / 112` |

- **完整渲染句式（逐字）** = `{{ ov.label }}：{{ ov.text }}`（`asset-inventory.vue:60-63`）⇒ 例：**`溢出 4 枚石榴籽玉：背包空间不足，无法合成`**、**`溢出 2 个标准石榴籽：空间不足，无法持有`**（计数单位 `枚` / `个` / `个`，`inventory.ts:95-99`）。
- 溢出行为红色（`.inv-overflow-label` / `.inv-overflow-text` 均 `#C62828`，`asset-inventory.vue:615-618`）。

### 13-6 属性提示层（**自绘** · `z-index: 1010` · `pointer-events: none`）

| 项 | 口径（逐字 / 实测值） | 出处 |
|---|---|---|
| 打开方式 | **悬停（H5 独有）与轻触（全端）打开同一自绘层** | `asset-inventory.vue:44-46` |
| 层级 | **`z-index: 1010`**（CSS `.inv-tip`） | `asset-inventory.vue:602` |
| 鼠标穿透 | **`pointer-events: none`**（不拦鼠标，避免悬停抖动） | `asset-inventory.vue:605` |
| 空格 | **空格不弹提示**（空格 / 栏位外 ⇒ 关掉已开提示且不弹新提示） | `asset-inventory.vue:46 / 316-323 / 481` |
| 层内标题 / 正文 | 标题 = 道具名（`石榴籽玉` / `标准石榴籽` / `竹简`）；正文 = `tooltipLines` 逐行 | `asset-inventory.vue:49-50` |
| 提示正文（玉） | `1 枚` → `jadeTitle(j)`（`<短 id> · 有效期至 YYYY-MM-DD` / `<短 id> · 永久有效`）→ `jadeSubLine(j)`（`已镶嵌至 <tree_id> · 不可分解` / `未镶嵌 · 可免费分解`）→ `1 个道具 = 1 枚石榴籽玉` | `inventory.ts:172-177`；`asset-text.ts:37-44` |
| 提示正文（籽 / 竹简） | `9999 颗` / `100 片` → `最近到期 YYYY-MM-DD` → `1 个道具 = 9999 颗石榴籽` / `1 个道具 = 100 片竹简` | `inventory.ts:214-218 / 102-106` |
| 日期空值 / 非法值 | **`—`** / 原样返回（`formatAssetDate`） | `asset-text.ts:21-24` |

**关闭路径** —— **实现可达路径**逐条（H5 鼠标 + 全端轻触）：

| # | 路径 | 实现 | 出处 |
|---|---|---|---|
| ① | **卡片外**（指针离开 `.inv-card`） | `!inOwnCard(e)` ⇒ `closeTip()` | `asset-inventory.vue:476-478` |
| ② | **同格再轻触 toggle**（**不依赖空格** ⇒ 36 格全满也能关；由悬停打开的提示被轻触「接手」为轻触态后，下次轻触才关） | `if (tipIndex === index && tipSource === 'tap') closeTip()` | `asset-inventory.vue:318-319` |
| ③ | **空格 / 栏位外**（轻触） | `tapAt(index)` 兜底 `closeTip()`；栏位外 `slotIndexAt` 返 `-1` | `asset-inventory.vue:316-323` |
| ④ | **卡片内空格 / 空白**（悬停） | `hoverAt` 的 `else closeTip()` | `asset-inventory.vue:481` |
| ⑤ | 拖曳落位 / 滚动 / 数据刷新（状态刷新路径） | 落位即 `closeTip()`；`onDocumentScroll` 关悬停态；`rebuild` 数据一变换序即 `closeTip()` | `asset-inventory.vue:373 / 499-502 / 188` |

> ⚠️ **登记差异（如实登记，注释原文保留）**：组件文件头注释登记为「**关闭路径三条**」（① 指针离开 `.inv-card`（H5，含移入卡片内空格 / 空白）；② 同格再轻触 toggle 关闭；③ 拖曳 / 滚动 / 数据刷新，`asset-inventory.vue:80-81`），而**实现可达**的独立关闭路径为上表 ①–⑤（把「卡片内空格 / 空白」单列即 4 条交互路径 + 1 条状态刷新路径）。**本节以代码实现为准登记**，注释「三条」措辞**原文保留**、**待后续批次随代码注释收敛**（本节不改代码）。

**层级先例关系（注释逐字）**：本层**自绘**（**不用 `uni.showModal`**），原因 = 「`uni-modal` 的 z-index = 999 会被自绘遮罩压住」，**先例 = `components/sibling-order-modal/`（`docs/sibling-order.spec.md` §9-2-1）**；本层 `z-index = 1010`（`asset-inventory.vue:44-45`）。§9-2-1 实测口径 = `.som-confirm-mask` **z-index 1010**、`.som-mask` **1000**、`.uni-modal` **999**（`docs/sibling-order.spec.md:277 / 279`）—— 本层取先例同值 **1010**。

**`TOUCH_MOUSE_GUARD`（触摸后「兼容鼠标事件」抑制窗口）**

| 项 | 值 / 口径 | 出处 |
|---|---|---|
| 常量名 / 值 | **`TOUCH_MOUSE_GUARD` = 450（ms）** | `asset-inventory.vue:129` |
| 作用 | 触摸后 Chrome 补发的一串 `mouseover` / `mousemove` / `mousedown` / `mouseup`（含把 hover 还原到鼠标静置格的那次 `mouseover`）在窗口内一律忽略 ⇒ **不抢**轻触选中的格；**窗口外的正常悬停不受影响** | `asset-inventory.vue:124-129 / 169-176` |
| 生效入口 | `mousedown` / `mouseup` / `mouseover` / `mousemove`（悬停跟随）四个入口**均先判 `mouseGuarded()`** | `asset-inventory.vue:442 / 456 / 485 / 495` |
| 计时 | `touchstart` / `touchend` / `touchcancel` **各调一次 `armMouseGuard()`**，每次把窗口推到 `now + 450ms`（`touchend` 之后才补发 compat mouse 事件 ⇒ 从该刻重新计时） | `asset-inventory.vue:174-176 / 384 / 398` |

### 13-7 拖曳（插入式重排 · 纯内存态 · **无持久化**）

- **插入式重排（非交换）**：`moveItem(list, from, to)` = `splice` 取出 → `splice` 插回（其余元素依次让位）；越界 / 原位不动 ⇒ 原序副本；口径**同 `docs/sibling-order.spec.md` §9 的拖曳**（`inventory.ts:142-153`，数组唯一改写入口）。
- **只在已占用格之间生效**：起点必须落在已占用格，否则不进入拖曳（`asset-inventory.vue:334-346`）；落位上限 = `Math.min(hit, ordered.length - 1)`（`:351`）；空格不参与重排（`:335-340`）。
- **仅内存态、无持久化**：唯一写入 = 组件内存 `ordered`（`asset-inventory.vue:372`），**无 localStorage / 无后端写 / 无持久化**；`summary` 一变（含首次）即按默认序重建 ⇒ **刷新 / 重进页面回默认序**（`asset-inventory.vue:84 / 178-189`）。界面提示**逐字** = **`6 × 6 栏位 · 每格 1 个道具 · 拖曳可调整显示顺序（仅当前页面有效，刷新后恢复默认）`**（`asset-inventory.vue:8`）。
- **拖曳 / 轻触区分的位移阈值**：**`DRAG_THRESHOLD` = 5（px）**，判据 = **`|Δx| + |Δy| > 5`**（**曼哈顿距离**，非欧氏）⇒ 判拖曳，否则**整场会话按轻触处理**（两者不互抢）（`asset-inventory.vue:117 / 330`）。
- 拖曳中拦页面滚动（H5 真实事件 `preventDefault`；小程序侧为空实现、靠坐标节流兜底）（`asset-inventory.vue:393-394`）。

### 13-8 文案单点（玉状态文案**唯一真源**）

- **真源** = `frontend/src/business/asset-text.ts`（导出 `formatAssetDate` / `shortAssetId` / `jadeTitle` / `jadeSubLine`，`asset-text.ts:21-44`）；文件头逐字：「玉的状态文案以本模块为唯一真源，新增页面一律引用本模块，禁止再复制一套」（`asset-text.ts:5-6`；同 `business/jade-ops.ts` 的「前端唯一副本」约定）。
- **两条链路**：① **资产页**「我的玉」= `pages/assets/index.vue`（import 于 `:199`，渲染于 `:131-132`）；② **道具栏属性提示** = `components/asset-inventory/asset-inventory.vue`（经 `business/inventory.ts:17` 引用 `jadeTitle` / `jadeSubLine` / `formatAssetDate`）。
- **已登记例外（既有代码，待后续批次收敛，本次未改该页）**：`pages/spirit/index.vue` 仍自带**第三份手写副本** —— 第 **175** 行 `<text class="row-sub">未镶嵌 · 可免费分解</text>`、第 **586** 行 `` ? `（有效期至 ${formatDate(res.expires_at)}）` ``、第 **658** 行 `` const exp = j.expires_at ? `有效期至 ${formatDate(j.expires_at)}` : '永久有效'; ``（另自带 `shortId`（`:662-665`）与 `formatDate`（`:667`）副本）；例外清单逐字见 `asset-text.ts:8-11`。

### 13-9 已接受差异 / 未决项

| # | 项 | 状态 / 口径 |
|---|---|---|
| 1 | **小程序端未真机实测** | 已接受：本批只做 H5 实测；小程序侧 touch 路径（`asset-inventory.vue:15-18 / 383-401`）**未真机验证**，`preventDefault` 在小程序为空实现、靠坐标节流兜底（`:393`） |
| 2 | **`TOUCH_MOUSE_GUARD` 为定值** | 已接受：**450 ms** 为**定值常量**（`asset-inventory.vue:129`），**需随实测调整** |
| 3 | **拖曳落位后指针停在落位格会按悬停语义自动开提示** | 已接受（**既有行为**）：落位即 `closeTip()`（`:373`），但鼠标静止于该格时，抑制窗口结束后 `mousemove` 路径恢复悬停语义 ⇒ 自动开提示（设计说明逐字见 `asset-inventory.vue:489-497`） |

> **与其它分册的关系**：本节为**纯展示层口径**，**不涉及计费**（计费仍以 `docs/economy-fee.spec.md` 为准）；道具栏**不新增任何计费入口**，只读既有 `GET /assets/summary`。

---

## 14. 行囊（道具栏）口径 **v3–v6 收口**（**追加章节 · Zang 裁定 v3 / v4 / v5 / v6 / v6-附 · 2026-09-24 · 整体取代 §13**）

> **性质（`AGENTS.md` §0 第 4 / 5 条）**：本节为**追加章节** —— 本册 **§1–§12 与 §13 的既有行一律原文保留**（§13 已在标题下标注「**已被取代 · 原文保留**」）。**本节不改写、不重排任何历史行**，取代关系以「新章节 + 作废标注」落地。
> **为什么整节取代 §13**：§13 记的是 **v1 / v2** 口径（「碎片恒不占格」「零头行」「默认序 玉 → 籽 → 竹简」…）。v3 起实现已改变，其中 **§13-4 的默认序与代码 / 实测不一致** —— **首格实测 = `bamboo:100`（100 片竹简）** ⇒ 按 `AGENTS.md` §0 第 1 条「**代码即事实**」，**以代码为准登记**，§13-4 逐字标注「**已被取代 · 原文保留**」（对照见 §14-7）。
> **范围**：前端展示层（栏位 / 换算 / 占格 / 默认序 / 溢出 / 拖曳 / 搬迁落点）+ **两条既有读路由的出参口径**（`GET /assets/summary` 玉过滤、`GET /spirit` 新增 `injector`）；**无新集合 / 无新字段 / 无新枚举 / 无新算法 / 无新计费项**（玉归属的域口径另见 `docs/spirit-domain.spec.md` **§14**）。
> **字面纪律**：本节常量、文案、阈值**逐字取自 2026-09-24 实测读到的代码**；行号为该次读数（代码仍在动，行号可能再漂；§13 的行号即为漂移先例）。代码落点 = `frontend/src/business/inventory.ts`（纯逻辑）、`business/asset-text.ts`（文案单点）、`components/asset-inventory/asset-inventory.vue`（容器组件）、`pages/mine/index.vue`（取数 + 挂载 + 签到）、`pages/assets/index.vue` + `pages/spirit/index.vue`（页面改版）、后端 `lib/economy-ledger.js` / `lib/economy-ops.js` / `lib/economy-spirit.js`（读侧三处）。

### 14-1 v3 行囊基础（6 × 6 = 36 栏位 · 1 格 = 1 道具）

| 常量 | 值 | 含义（逐字注释） | 出处（2026-09-24 实测） |
|---|---|---|---|
| `SEEDS_PER_ITEM` | **9999** | 石榴籽：9999 颗 = 1 个道具 | `inventory.ts:26` |
| `JADES_PER_ITEM` | **1** | 石榴籽玉：1 枚 = 1 个道具 | `inventory.ts:28` |
| `BAMBOO_PIECES_PER_ITEM` | **100** | 竹简：100 片 = 1 个道具 | `inventory.ts:30` |
| `FRAGMENTS_PER_ITEM` | **10** | 石榴籽碎片：10 个 = 1 个道具（服务端 `fragment_cap = 9` ⇒ 实测 1–9 个，**仍占 1 格**） | `inventory.ts:32` |
| `SLOT_COUNT` | **36** | 道具栏位总数：6 × 6 = 36 | `inventory.ts:34` |
| `SLOT_COLUMNS` | **6** | 道具栏列数（渲染端取本常量，避免第二套网格口径） | `inventory.ts:36` |

1. **1 格 = 1 道具**：竹简 `floor(bamboos_total_pieces / 100)` 格、石榴籽 `floor(seeds_total / 9999)` 格、石榴籽玉 **1 枚 = 1 格**（`inventory.ts:5-7 / 180-202 / 231-286`）；网格 = `grid-template-columns: repeat(${SLOT_COLUMNS}, 1fr)`、单元格恒 `SLOT_COUNT` 长（`asset-inventory.vue:184-187`）。
2. **碎片 1–9 个占 1 格**，角标 = **实际个数**（`fragments > 0` 即 `[1 格]`；`inventory.ts:11 / 204-222`，`badge: true` 见 `:214`）—— **取代 §13-2 的「碎片恒不占格」**。
3. **余数占格**：竹简 / 籽 `% 每格量 > 0` 时**另加 1 格**，角标 = **实际余量**（例：竹简余 **37** 片 ⇒ 1 格、角标 **37**；籽余 **1234** 颗 ⇒ 1 格、角标 **1234**）；该类内**排在最后**（余数格判定 `slotKind === 'remainder'`，`inventory.ts:10 / 267-284` + 比较器 `:168-170`）。
4. **零头行取消**：v2 的「零头：…」单行展示**连同模板 / 样式 / 数据字段 / 逻辑一并废弃、不留死代码**（逐字依据 = `inventory.ts:12`；模板侧已无该行，`asset-inventory.vue` 全文无 `零头`）。
5. **玉只计未镶嵌**：`summary.jades` 中 `mounted_tree_id` 非空的玉**不入行囊、不渲染、不计格、不参与溢出**（`inventory.ts:8-9 / 182`）；玉格**不显示数量角标**（`badge: false`，`inventory.ts:191`；模板 `v-if="cell.badge"` 见 `asset-inventory.vue:41`）。
6. **默认序 = 竹简 → 石榴籽玉 → 石榴籽 → 碎片**（`KIND_ORDER = { bamboo: 0, jade: 1, seed: 2, fragment: 3 }`，`inventory.ts:127`；比较器 `compareItems`，`inventory.ts:166-174`）；同类内 —— **到期近的在前**（`:171`）、**永久玉在该类最后**（`expires_at` 空 ⇒ `expiresAtMs = Infinity`，`:199 / 323-327`）、**余数格排该类最后**（`:168-170`）、**同到期以稳定 id 兜底**（`:172-173`）⇒ 默认序确定可复现；**占用格连续排 1..N、空格在 N+1..36**（`inventory.ts:142-143` + `asset-inventory.vue:184-186`）。
7. **容器位置 = 用户卡正下方**：行囊卡挂在「我的」页用户卡**之后、功能菜单之前**（逐字注释「位于「用户卡正下方」」，`mine/index.vue:35-44`）。
8. **标题 = 「行囊」**（`asset-inventory.vue:6`）；副行 = `{{ occupiedTotal }} / {{ SLOT_COUNT }} 格`（`:8`）；界面提示**逐字** = **`6 × 6 栏位 · 每格 1 个道具 · 拖曳可调整显示顺序（仅当前页面有效，刷新后恢复默认）`**（`:11`）。
9. 数据源仍是既有 `GET /assets/summary`（`business/api.ts` 的 `fetchAssetsSummary`；**路由未改**，`cloudfunctions/compat-api/index.js:654`），取数在页面侧完成、组件只收 prop（`mine/index.vue:380-394`；`asset-inventory.vue:96-98`）。

### 14-2 v4 溢出口径（占格需求 > 36）

- **格子恒 36**：`cells` 恒 `SLOT_COUNT` 长（`asset-inventory.vue:184-186`）；`slots` 只取默认序前 36（`inventory.ts:143`）。
- **溢出道具不入格**：超出部分**不渲染格子**，改为**逐类提示行**（`inventory.ts:147`），占格需求（标题里的 N）= `occupiedTotal`（**含溢出、未截断**，`inventory.ts:148 / 82`）。
- **类型序 = 玉 → 竹简 → 籽 → 碎片**（`OVERFLOW_KIND_ORDER = ['jade','bamboo','seed','fragment']`，`inventory.ts:130`；`overflowLines`，`:307-320`；**玉行恒在最前**，其余三类按默认序）。
- **逐字文案**：玉 = **`背包空间不足，无法合成`**；**其它（竹简 / 籽 / 碎片）= `空间不足，无法持有`**（`KIND_OVERFLOW_TEXT`，`inventory.ts:119-124`）。
- 行首量词短语逐字 = `溢出 ${count} ${KIND_ITEM_UNIT[kind]}${KIND_NAME[kind]}`（`inventory.ts:315`）；计数单位 = 玉 `枚`、竹简 / 籽 / 碎片 `个`（`KIND_ITEM_UNIT`，`:103-108`）。
- 渲染句式逐字 = `{{ ov.label }}：{{ ov.text }}`（`asset-inventory.vue:80-83`）⇒ 例：**`溢出 4 枚石榴籽玉：背包空间不足，无法合成`**、**`溢出 2 个竹简：空间不足，无法持有`**。
- **与 §13-5 的差异**：§13-5 的类型序为 玉 → 籽 → 竹简且**无碎片一类**；v4 起为 **玉 → 竹简 → 籽 → 碎片**、**新增碎片一类**（文案不变），其余（格子恒 36 / 不入格 / 逐类一行）**沿用**。

### 14-3 v5 搬迁（签到 → 独立印章卡；合成 / 分解 → 行囊提示层）

| 项 | 现行口径（逐字 / 实测） | 出处 |
|---|---|---|
| 签到落点 | 行囊卡**下方**的**独立印章卡**（朱红方印「签」+ 标题「每日签到」）；注释逐字「置于行囊卡下方；**不展示碎片进度（N/9）**，签到结果只走 toast」 | `mine/index.vue:46-58`（样式 `:510-532`） |
| **无进度条** | 印章卡**不渲染**碎片进度（原资产页 9 格进度条亦已删除，见下）；碎片数值行保留在资产页 | `mine/index.vue:46` / `assets/index.vue`（diff：`frag-grid` 删除） |
| 签到 toast（逐字） | 基础 = **`获得石榴籽碎片 +1`**；**本次触发自动合成时追加** = **`满 10 已合成 ${synthesized} 颗石榴籽`**（两句以 `，` 连接；零件不得静默吞掉状态变化） | `mine/index.vue:411-412` |
| 同自然日重复 | **409** ⇒ 印章置灰 + toast **`今日已签到`**（不弹错误） | `mine/index.vue:415-419` |
| 合成入口 | **点籽格** → 属性提示层内【合成】按钮（`合成`；籽不足置灰 + 「再攒 N 颗」） | `asset-inventory.vue:58-67` |
| 分解入口 | **点玉格** → 属性提示层内【分解】按钮（免费 / 返还 `JADE_SYNTH_SEEDS` / 统一 365 天） | `asset-inventory.vue:68-76 / 463-469` |
| **二次确认层** | 沿用既有 `uni.showModal`（`business/jade-ops.ts` 定稿文案），**必须先 `closeTip()` 再 `showModal`** —— 行囊提示层 `z-index: 1010`（`:844`）会盖住 `.uni-modal` 的 `z-index = 999` | `asset-inventory.vue:411-422`（合成）/ `:463-469`（分解） |
| 层级先例 | 同 `docs/sibling-order.spec.md` **§9-2-1**（自绘 1010 / `.uni-modal` 999）；本件不新造层级值 | `asset-inventory.vue:48-53 / 101-108` |
| 资产页**移除** | ① 签到按钮（「签到 · 领 1 碎片」）②「合成石榴籽玉」按钮 + 提示 ③「我的玉」整段列表（含逐枚【分解】）；资产页改为**只读数值** | `assets/index.vue:46`（注释逐字「签到 / 合成 / 分解等操作入口已迁至「我的」页行囊与提示层」）+ diff 三处删除 |
| 未变 | 合成 / 分解**仍是既有路由**（`POST /assets/synthesize-jade` / `POST /assets/decompose-jade`）、**计费与文案零改动**（`business/jade-ops.ts` / `business/asset-guide.ts` 复用） | `asset-inventory.vue:105-108 / 120-129` |

### 14-4 v6 玉归属（用户面 / 管理面双口径）+ `GET /spirit` 注入者反查

**① 归属总则**：`mounted_tree_id` 非空的玉 = **已归属家族树**、**不再属于个人** ⇒ 个人面读侧一律不含它；**原始记录不迁移、不删除、不改写**（读侧 `filter`，真源那条玉的 `mounted_tree_id` 原样保留，供注入者反查与凹槽去向追溯）。域口径另见 `docs/spirit-domain.spec.md` **§14**。

| 面 | 路由 | 玉出参口径 | 出处（2026-09-24 实测） |
|---|---|---|---|
| **用户面** | `GET /assets/summary` | **只返未镶嵌**；`jades_total` **同口径**（只计未镶嵌）；出参不带 `mounted_tree_id` | `economy-ledger.js:362-378 / 389`（缺省 `opts.include_mounted` 为假） |
| **后台管理面** | `GET /admin/assets/user` | **全量原始记录**：`summarize(..., { include_mounted: true })` ⇒ 枚数（`jades`）与 `jade_list` **含已镶嵌**、**保留 `mounted_tree_id`** | `economy-ops.js:640-641 / 652 / 658 / 661` |
| 前端资产页 | `pages/assets/index.vue` | 玉枚数**只计未镶嵌**（`{{ unmountedJades.length }} 枚`）；`filter` 为幂等防御（后端已过滤） | `assets/index.vue:89 / 211 / 223` |
| 行囊 | `business/inventory.ts` | 玉格**只收未镶嵌**（`filter((j) => !j.mounted_tree_id)`） | `inventory.ts:8-9 / 182` |

- **原始记录一字节不动**（读侧过滤、零落写）已由本轮新增用例断言（真源仍 5 枚、顺序不变、`mounted_tree_id` 原样；`lib/assets.test.js` 本轮新增用例「`GET /assets/summary` 玉归属（v6）」）。
- 后台口径的必要性逐字依据：`economy-ops.js:640-641`「后台必须看到『已镶嵌玉去哪了、镶进哪棵树』」⇒ 后台页「`· 已镶嵌 <tree_id>`」分支**可达，不是死代码**。

**② `GET /spirit` 新增出参 `injector`（注入者反查）**

| 项 | 口径 | 出处 |
|---|---|---|
| 出参 | `injector = { nickname, person_handle } \| null`；**未镶嵌 → `null`** | `economy-spirit.js:763`（`injector: mounted ? await injectorOf(treeId) : null`） |
| 反查链 | 读 `jiazu_assets`（`_id='global'`）→ 找 `mounted_tree_id === tree_id` 的那枚玉 → 持有者手机号 → `jiazu_users` 昵称 + `jiazu_anchors` 锚点（`tree_id` / `person_handle`） | `economy-spirit.js:699-716` |
| **手机号不下发** | 出参**只含 `nickname` 与 `person_handle`**；**昵称缺失时脱敏兜底**（`maskPhone`：`前 3 + **** + 后 4`） | `economy-spirit.js:678-682 / 711` |
| 只读性 | 全程 `colGet` **只读**（不 `sweep`、不回写 ⇒ 不扰动真源） | `economy-spirit.js:699-716` 注释 |
| 三态兜底 | ① 反查到 + 锚点 `tree_id === tree_id` ⇒ `{ nickname, person_handle }` ⇒ 前端给**可点档案卡**；② 反查到 + 无锚点 / 跨树 ⇒ `person_handle = null` ⇒ 文案 **`注入者无本树节点`**；③ 反查不到 ⇒ `null` ⇒ 文案 **`注入者信息不可考`** | `economy-spirit.js:707-716`；`spirit/index.vue:49-59` |
| spirit 页展示 | **`此玉由 {{ injector.nickname }} 注入`** + 节点卡片（`查看注入者档案 ›`）→ 点击跳**人物档案页** `/pages/person/detail?tree_id=&handle=` | `spirit/index.vue:51-54 / 572-576` |
| 状态文案 | 已镶玉区块**不再渲染「玉有效期 至 <日期>」**，统一 = **`永久有效（镶嵌即永久占用）`** | `spirit/index.vue:46` |
| spirit 页**移除** | 玉操作区（合成 / 分解 整块「石榴籽玉」区块）已删除，页面区块顺延（现 ④ = 灌注流水）；相关 import / state / 函数一并移除 | `spirit/index.vue` diff（区块删除 + 注释逐字「合成 / 分解：**已迁至「我的 → 行囊」**」） |
| 资产页**移除** | 碎片 **9 格进度条**（`frag-grid` / `frag-cell`）删除，**保留数值行**（「N / 9 · 满 10 自动合成 1 颗石榴籽」） | `assets/index.vue` diff（`:60` 一带 `frag-grid` 整块删除） |

### 14-5 v6-附 到期语义（已镶嵌玉 = **永久占用**；到期不影响任何行为）

- **口径**：已镶嵌玉 = **永久占用、等价永久玉**；**到期不影响任何行为**。
- **核实（2026-09-24 只读实测）**：`jadeExpired` **仅**在两处使用 —— ① **未镶嵌玉的分解**（`economy-spirit.js:449`）② **镶嵌前置**（`:494`）；凹槽槽位的 `jade.expires_at` **仅被记录**（`:498`，槽位字段 `{ jade_id, mounted_at, expires_at }`）与**回传**（`:509 / :555`）⇒ **不参与任何后续行为判定**（§4 灵气状态机只看 `spirit_expires_at` / `buffer_until`，不受玉到期影响）。
- **展示口径**：**不再渲染「玉有效期 至 <日期>」**；已镶玉统一 **`永久有效（镶嵌即永久占用）`**（`spirit/index.vue:46`）。
- ⚠️ 本条**不改** §4 状态机、**不改** §5-4 玉状态矩阵中「未镶嵌玉过期 ⇒ 404」的既有口径（那两条只作用于**未镶嵌**玉）。

### 14-6 拖曳与默认序口径（插入式重排 · 纯内存 · 刷新即回默认）

| # | 口径 | 出处 |
|---|---|---|
| 1 | **插入式重排（pop + insert，非交换）**：`moveItem(list, from, to)` = `splice` 取出 → `splice` 插回（其余元素依次让位）；越界 / 原位不动 ⇒ 原序副本；口径同 `docs/sibling-order.spec.md` §9 的拖曳 | `inventory.ts:157-163`（数组唯一改写入口） |
| 2 | **纯内存**：唯一写入 = 组件内存 `ordered`；**无 localStorage / 无写请求 / 无持久化** | `asset-inventory.vue:109-110 / 180 / 372` |
| 3 | **刷新 / 重进页面回默认序**：`summary` 一变（含首次）即按默认序重建 | `asset-inventory.vue:110 / 178-189` |
| 4 | **tabBar 切走再切回保留内存序 = 已裁定的可接受行为**（**非缺陷**）：§13-7 逐字只承诺「**刷新 / 重进**回默认序」，与实现一致 ⇒ **不以本现象开缺陷单** | 本条为裁定；口径文面见 §13-7（原文保留）+ `asset-inventory.vue:110` |
| 5 | **命中判定坐标系口径**：**H5 = `getBoundingClientRect()`（视口坐标，与 `clientX/clientY` 同源）**；**小程序 = `boundingClientRect()`（显示区域坐标，与 touch 同源）**；两条路径各自自洽、**零常量补偿**，**不得混用** | `asset-inventory.vue:111-114 / 280-300` |
| 6 | 上述混用**已修一个缺陷**：H5 误用 `boundingClientRect()` 导致 **44px 偏移**（现已按第 5 条修） | `asset-inventory.vue:280-294` 注释（如实登记） |
| 7 | 拖曳 / 轻触区分阈值 = **`DRAG_THRESHOLD` = 5（px）**，判据 = `|Δx| + |Δy| > 5`（**曼哈顿距离**）；拖曳中拦页面滚动（H5 真实 `preventDefault`，小程序侧空实现） | `asset-inventory.vue:158-159 / 330 / 392-394` |

**§14-6-附 【Zang 裁定 · **Z-9**】行囊默认序插入点 + 逐类提示行类型序（**追加 · 2026-09-25** · **§14-1 – §14-6 既有行与 §14-7 对照表原文一律保留、一字不改**）**

| 项 | 已裁口径 |
|---|---|
| **默认序（插两品类后）** | **竹简 → 兰帖 → 石榴籽玉 → 石榴籽 → 兰帖碎片 → 石榴籽碎片**（`KIND_ORDER` **六值**）—— **成品兰帖紧随竹简**；**兰帖碎片在石榴籽碎片之前** |
| **逐类提示行类型序** | **玉 → 竹简 → 兰帖 → 籽 → 兰帖碎片 → 石榴籽碎片**（**玉优先不变**：**玉行恒在最前**） |
| 取代关系 | **§14-1 第 6 条**的**原默认序**（竹简 → 石榴籽玉 → 〔§16-3「改名词对」所涉的**旧词形**〕→ 碎片）与 **§14-2** 的**原类型序**（玉 → 竹简 → 籽 → 碎片）⇒ **位次已扩展**（插入两类新品类）；**§14-1 第 6 条的同类内排序口径继续有效**（到期近的在前 / 永久在该类最后 / 余数格排该类最后 / 同到期以稳定 id 兜底）；**§15-6 ③ 两处「插入点未裁」⇒ 已裁定**（旧行原文保留） |
| 现证（不写读数） | `grep -n "石榴籽\|兰帖\|KIND_ORDER" frontend/src/business/inventory.ts` 的**实际输出为准**：文件头**默认序注释**、**溢出序注释**与 **`KIND_ORDER` 分组注释**三处**已与本节一致** ⇒ **文档与代码同向**（**以代码为唯一源**，`AGENTS.md` §0 第 1 条） |
| 一句话可改 | 改本表「默认序」一行一处（须同步 `KIND_ORDER` 与 `OVERFLOW_KIND_ORDER` 两处常量及其注释） |

> **与 §15-6 的关系**：§15-6 ③ 的「**位置待裁**」两行（默认序 / 溢出口径）⇒ **已裁定**（由本节 + `docs/friend-domain.spec.md` **§17-9-C-9** 取代其未裁状态）；**§15-6 原文保留**。**本节的完整登记（Z-9 裁定 + 跨界引用）另见本册 §17-1**。

### 14-7 §13 逐条取代对照表（**§13 正文原文保留，本表为准**）

| §13 条 | §13 旧口径（原文保留） | v3–v6 现行口径 | 现行落点 |
|---|---|---|---|
| 13-1 换算常量 | `9999 / 1 / 100 / 10` + `SLOT_COUNT 36` / `SLOT_COLUMNS 6` | **数值不变**；出处行号已漂移（§13 记 `:20/22/24/26/28/30` ⇒ 现 `:26/28/30/32/34/36`） | §14-1 表 |
| 13-2 碎片恒不占格 | 「碎片不特判为 1 格、按规则自然导出 0 格」 | **已被取代**：**碎片 1–9 个占 1 格**，角标 = 实际个数（0 个不占） | §14-1 第 2 项 |
| 13-3 零头行 | 「零头：…」单行展示（籽余 / 竹简余 / 碎片） | **已被取消**：模板 / 样式 / 数据字段 / 逻辑一并废弃、不留死代码；余量改由**余数占格**承载 | §14-1 第 3 / 4 项 |
| **13-4 默认序** | 「默认序 玉 → 籽 → 竹简」（`KIND_ORDER = { jade: 0, seed: 1, bamboo: 2 }`） | **已被取代 · 原文保留**：现行默认序 = **竹简 → 石榴籽玉 → 标准石榴籽 → 碎片**；§13-4 与代码 / 实测**不一致**（**首格实测 = `bamboo:100`**）⇒ **以代码为准**（`AGENTS.md` §0 第 1 条） | §14-1 第 6 项（`inventory.ts:127`） |
| 13-5 溢出 | 格子恒 36 / 超出不入格 / 逐类一行；类型序 玉 → 籽 → 竹简；文案 玉 `背包空间不足，无法合成`、籽·竹简 `空间不足，无法持有` | **部分沿用 + 序变更**：格子恒 36 / 不入格 / 逐类一行**沿用**；**类型序改为 玉 → 竹简 → 籽 → 碎片**（新增**碎片**一类）；两条文案**不变** | §14-2 |
| 13-6 属性提示层 | 自绘层 `z-index: 1010`、`pointer-events: none`、空格不弹；关闭路径 ①–⑤ | **沿用 + 新增**：层内新增【合成】（籽格）/【分解】（玉格）直操作；**点按钮先 `closeTip()` 再 `showModal`**（1010 遮 `.uni-modal` 999）；`pointer-events` 因层内可交互而改（`:842-844`） | §14-3 |
| 13-7 拖曳 | 插入式重排 / 纯内存无持久化 / 刷新回默认序 / 界面提示逐字 | **沿用**；**补**：命中判定坐标系口径、tabBar 切回保留内存序 = **已裁定的可接受行为**、44px 偏移缺陷已修 | §14-6 |
| 13-8 文案单点 | 单点 = `business/asset-text.ts`；已登记例外 = `pages/spirit/index.vue` 第三份副本（行号 `:175 / :586 / :658`） | **单点口径沿用**；**例外条目行号已过时**（v6 改了该页 ⇒ 现为 `:46`（永久有效）/ 其余副本位置随改），例外**未被收敛**（该页仍自带副本） | §14-4 表末 + `asset-text.ts:8-11` |
| 13-9 已接受差异 | ① 小程序未真机实测 ② `TOUCH_MOUSE_GUARD = 450` 定值 ③ 拖曳落位后悬停自动开提示 | **三条均沿用、未变**（本批未新增已接受差异；新增口径 = 14-6 第 4 / 5 条，均已裁定） | §14-6 / §13-9（原文保留） |

### 14-8 未决项与与其它分册的关系

| # | 项 | 状态 |
|---|---|---|
| 1 | **小程序端未真机实测** | 承 §13-9 #1（本批只做 H5 实测；小程序 touch 路径未真机验证） |
| 2 | **`TOUCH_MOUSE_GUARD` = 450 ms 定值** | 承 §13-9 #2（需随实测调整） |
| 3 | **§13 的历史行号全部漂移** | 已在 §13 标题下标注（本册**不改写 §13 正文**）；引用旧行号时以 §14 为准 |
| 4 | **`asset-text.ts` 的「唯一真源」例外仍在** | `pages/spirit/index.vue` 第三份文案副本**未收敛**（待后续批次；本批未动该页文案副本） |

> **与其它分册的关系**：① **计费**——行囊只复用既有合成 / 分解路由，**不新增任何计费入口**，计费仍以 `docs/economy-fee.spec.md` 为准；② **玉归属 / 注入者 / 永久占用**的域口径 = `docs/spirit-domain.spec.md` **§14**（本册只登记展示与读侧过滤面）；③ **上云动作与判据** = `docs/PENDING_DEPLOY.md` **§32**。

---

### 14-9 提示层定位口径 · 命中坐标两端口径 · 已登记可接受行为 **D-01**（**追加 · 2026-09-24 · Neng-6 独立复检读数 · §14-1–§14-8 既有行原文一律保留**）

> **性质（`AGENTS.md` §0 第 4 / 5 条）**：本节为**追加小节**，**属「补全」不属「取代」** —— **§14-1–§14-8 既有行全部原文保留**；**§14-6 第 5 / 6 条**（命中坐标系口径 / 44px 偏移已修）**继续有效**，本节**只细化「提示层定位」口径并补齐独立复检读数**。
> **读数来源（逐字引用 · 不自报）**：**Neng-6 独立复检**（2026-09-24 19:50–20:23 CST）—— **自建副本栈**（`COMPAT_OUT_DIR` 副本 + compat-api `3450` + frontend `5299` + 自起 headless Chrome `9333`）、**自造夹具**（`16601061656`：未镶嵌玉 **21** 枚 + 已镶嵌 **2** 枚 / 籽 **25925** / 竹简 **723 + 3 = 726** / 碎片 **3**）、**真实指针 / 触摸事件**，**未采信任何自报数据**。结论 = **PASS**（四条判据全过 + 上摆不卡死 + 真实点击合成 / 分解全链路成功 + `type-check` / `npm test` 全绿 + 真源零写入），**另附 1 条低危非阻塞观察 D-01**（登记见 **14-9-4**）。

#### 14-9-1 提示层定位口径（逐字取自 2026-09-24 实测代码）

| # | 口径 | 逐字锚点（`frontend/src/components/asset-inventory/asset-inventory.vue`） |
|---|---|---|
| 1 | **摆向判定**：`Math.floor(index / SLOT_COLUMNS) >= TIP_ABOVE_ROW`（**末两行摆到格位上方**，其余摆到下方）；`TIP_ABOVE_ROW = SLOT_COUNT / SLOT_COLUMNS − 2` = **4** | `:167` / `:523` |
| 2 | **零间隙（硬口径）**：下摆 **层上缘 = 格位下缘**；上摆 **层下缘 = 格位上缘**。理由逐字 = 「**留缝会让「格位 → 层内按钮」的指针轨迹穿过格间缝 / 空白 ⇒ 层被判成「已离开」而关掉，真实指针永远点不到按钮**」 | `:438-441` |
| 3 | **坐标原点修正**：绝对定位基准 = 卡片 **padding box**，而量测得到的是 **border-box** ⇒ 必须减 `originTop`（H5 = `el.clientTop` / `el.clientLeft`；**小程序端无 DOM ⇒ 恒返回 0**）；**除此之外零常量补偿** | `:291-306` / `:443-447` |
| 4 | **`top` 保留 3 位小数**（`Math.round(top * 1000) / 1000`，**不四舍五入到整数**）—— 逐字理由：取整会挪动 ±0.5px，正是「缝」的来源 | `:450`（注释 `:447-449`） |
| 5 | **首次渲染用估算高度**（`TIP_LINE_H = 18` / `TIP_ACTIONS_H = 30`），量到实测高度后**同步重写一次**样式；**上摆贴合校正 = 硬上界「最多一次」**（`tipFitDone`），**绝不递归自我重排**（逐字：旧版 `nextTick(measureTipBox)` 在「`top` 被 `Math.max(..., 0)` 夹住」时**实测 20001 次不收敛**） | `:163` / `:165` / `:391` / `:407-431` |
| 6 | **阈值**：`TIP_FIT_EPS = 0.5`（贴合判定）/ `TIP_UNION_TOL = 2`（「**源格 ∪ 提示层**」联合区域归属容差）/ `TIP_WIDTH = 240` | `:174` / `:176` / `:161` |
| 7 | **层横向夹取**：窄屏 / 贴边时按卡片边界夹取（移动端实测夹取上限 `350 − 2 − 240 − 4 = 125`），**层恒在卡片内** | 见 14-9-2 |

#### 14-9-2 独立复检读数（Neng-6 · 逐条照抄，**不得改写数值**）

| 判据 | 实测读数 |
|---|---|
| **下摆零间隙** | `place = below`；cell `{left 558.3281, top 349.1719, h 78.6719, bottom 427.8438}` / tip `{left 478, top 427.8438, w 240, h 140.375}` ⇒ **`gap = tip.top − cell.bottom = 0.0000px`**（**dpr 1 / 2 / 3 三档均 0.0000**）；层中心 − 格中心 = **`+0.3438px`**；`tipInsideCard = true`；style 实测 `left: 457px; top: 240.844px; width: 240px;`（**非兜底 `8px/8px`**） |
| **上摆零间隙** | `place = above`；dpr2：`cell.top 603.1875` vs `tip.bottom 603.1719` ⇒ **残余 `+0.0156px`**（= 1/64 CSS px；dpr2 下 0.031 设备像素）；移动端 dpr3 **同为 `+0.0156px`**；两档均 `< TIP_FIT_EPS(0.5)` 与 `< TIP_UNION_TOL(2)` |
| **交界扫描（0.25px + 加密 0.005px）** | 下摆（idx8 · dpr2 + dpr3）：`scan_025_none = []`、`scan_001_none = []`、`hit_other = []`；上摆（idx29 · dpr2 + dpr3）：**几何未覆盖仅 `+0.0156px` 带内的 4 个 0.005px 采样点**，且这些点的 `elementFromPoint` **全部解析为源格**（`inv-slot-box｜slot:29`）、`hit_other = []`；**两分支扫描后 `.inv-tip` 均仍在** ⇒ **交界处无真实可命中的空洞** |
| **尺子灵敏度对照（反证探针有效）** | 人为把层挪 **±4px** ⇒ **立刻判出 13–17 个坏点**（`el = uni-view｜inv-grid`）；复原后 style 与基线**完全相同**、`tip.top` 逐值相同（`427.8438 / 480.3906`）、`restored_style_identical = true` ⇒ 上条的「0 差」是**真一致** |
| **真实指针轨迹** | **4 组各 24 段**（dpr2 下摆 idx8 / dpr2 上摆 idx29 / 移动端 dpr3 下摆 idx8 / 移动端 dpr3 上摆 idx29）：`cls ∈ {slot, tip}` **24/24**、**层全程打开 24/24**、终点 `elementFromPoint` **命中层内按钮**（`span｜inTip:true`）、终点 `active` = 源格序号（**不跳格**） |
| **上摆不卡死（判据）** | 上摆格 idx29 ↔ idx24 往返悬停 **10 轮**：每轮 `active` 正确、`tip = true`、`place_ok = true`；单次 `evaluate` **1.4–3.2ms**（渲染进程全程可响应）；**style 写入共 8 次**（新增基准时 **1 次初摆 + 1 次贴合校正**；**同一基准内 0 次** ⇒ 幂等）；`add-tip` 后 **2.5ms 内恰好 1 次校正**，**无 20001 次级别的自激**；wall 4.18s |
| **真实点击写链路** | **合成**（上摆籽格 idx29）：点击后 **tip 先关** → `.uni-modal` 文案逐字 = **`⚠️ 合成提示…请确认是否继续合成？取消确认合成`**，确认按钮 `hit = div｜uni-modal__btn uni-modal__btn_primary`（**未被 1010 层盖住**）→ 服务端 **`seeds_total` 25925 → 24926（−999）**、**`jades_total` 21 → 22（+1）**；页面 **`33 / 36 格` → `34 / 36 格`**、籽余数角标 **5927 → 4928**；toast 逐字 = `合成成功：新玉有效期至 2027-09-17，消耗 999 颗，余 24926 颗石榴籽`。**分解**（下摆玉格 idx8）：modal 文案逐字 = **`分解石榴籽玉本次分解免费，不收取任何费用。固定返还 999 颗石榴籽，产出的石榴籽统一 365 天有效期。是否确认分解？取消确认分解`**；确认后 **`jades_total` 22 → 21**、**`seeds_total` 24926 → 25925（+999）**、页面 `34 / 36 格` → `33 / 36 格`、籽角标 `4928 → 5927`。**副作用一律「服务端读回 + 页面角标」双向核对**（不采信 toast 单方） |
| **回归** | 鼠标 **36 格全扫**（33 占用格 ok **33/33**、**3 空格不弹**、格间移动后上一格 `active` 正确让位）；**触摸路径**（移动端 390×844 dpr3）：`idx8 → below`（**无偏上一行**）、同格再轻触 ⇒ **toggle 关闭**、`idx29 → above`、空格不弹、轻触层内标题 ⇒ **层不关 / `active` 不变 / `tip.top` 前后同值**；**拖曳插入式重排**：`before` = `[100×7, 26, jade×21, 9999, 9999, 5927, 3, empty×3]` → `after` = `[100,100,100,jade,100,100,100,100,26,jade×20,9999,9999,5927,3,empty×3]`（**插入式语义成立**）；**未登录态**：36 格 / `filled 0` / 「0 / 36 格」/ `登录后即可查看行囊` / **无 `.inv-tip`** |
| **硬门** | `cd frontend && npm run type-check`（`vue-tsc --noEmit`）→ **EXIT 0，无任何诊断输出**；`npm test` → **480 tests / 480 pass / 0 fail / 0 skipped**（**exit 0**），`duration_ms ≈ 2129.6` |
| **真源零写入** | **339 个真源文件**（`migrate-output/**` + `config/tree-meta.json` + `auth-server/data/**`）**逐文件 md5 前后逐行一致**（合并签名 `8c6230a64805692ec1da4228052b47ee` 前后同值）；被验文件 `asset-inventory.vue` md5 = **`d3cc6388aa96af480057a3b51c2283ab`**、mtime **2026-09-24 19:37:16** 全程未变；`git status --porcelain` **39 行不变** |

#### 14-9-3 命中坐标两端口径（**不得混用** · 承 §14-6 第 5 条，本节补齐实现路径）

| 端 | 事件通道 | 量测 API | 坐标系 |
|---|---|---|---|
| **H5** | **文档级原生鼠标事件** + **原生触摸事件**（`bindTouchListeners` 原生通道；`composedPath` 限本卡片内） | **`getBoundingClientRect()`** | **视口坐标**（与 `clientX` / `clientY` 同源） |
| **小程序** | uni 包装的 `touch` | **`boundingClientRect()`** | **显示区域坐标**（与 uni touch 同源） |

- **为什么 H5 不走 uni 包装的触摸事件（根因 · 逐字）**：uni-h5 的 `normalizeTouchEvent(touches, getWindowTop())` 会把 `clientY` 减去 `getWindowTop() = parseInt(--window-top) + safe-area-inset-top`；本页实测该值 = **44px**（= 页面头部高）⇒ H5 上「uni 包装的触摸坐标」与「DOM 视口坐标」**恒差一个页面头部高**（约一行 = **偏上一行 / −6 格**）。**修法 = H5 触摸路径改走原生事件 + DOM 量测**（同一 API、同一坐标系、**零常量补偿**，**严禁硬编码 44 或任何魔法数字**）；**小程序保持原路径**（本轮**不改变小程序行为**）。锚点 = `asset-inventory.vue:303-319`（`measureRects` 注释）/ §14-6 第 6 条（**44px 偏移缺陷已修**）。
- **一致性守卫**：提示层包围盒与触摸坐标**必须同源**（命中守卫 `inTipBox` 与 `measureRects` 同一坐标系）；量测节流 = 距上次量测点 **> 24px** 或 **> 400ms**（`:376-381`）。

#### 14-9-4 已登记可接受行为 **D-01**（**低危 · 非阻塞 · 本轮不修**）

> **登记口径** = 本批收口指令（「**D-01 已知可接受行为**」）+ **Neng-6 建议「低危登记、不修」**；理由（意译、不加重）：该路径**已耗掉四轮修复**，而收益仅「斜向接近时少一次闪烁」⇒ **登记为「已知可接受行为」，不以本现象开缺陷单**。若 Kevin / Zang 改判，**以改判为准**。

| 项 | 内容（逐字 / 实测） |
|---|---|
| **现象** | **上摆分支**下，「**从源格中心沿直线斜插**走向层内按钮」的指针路径会在**中途离开**「**源格 ∪ 层**」联合区域 ⇒ 提示层**随即关闭**（`active = −1`）；再移入相邻格时**层改指相邻格**（用户看到提示层消失并跳到别格） |
| **根因** | 联合区域的**横向**归属容差只有 **`TIP_UNION_TOL = 2px`**，而相邻格之间是 **6px 列缝** ⇒ **源格左右各留约 4px 未覆盖带**；上摆的【合成】按钮**横向偏离格中心 83.66px**（**远大于格半宽 39.3px**）⇒ 从格中心到按钮的**直线必然先横越本格左右边缘**（y 仍在本行纵向范围内）。**下摆分支不触发**（按钮在格下方，直线先沿纵向进入层） |
| **逐字读数** | 直线路径（dpr2 · idx29 格中心 `(851.656, 642.52)` → 按钮中心 `(768, 582.17)`，**20 段**）**第 10 段**：`x = 809.83 y = 612.347`、`el = 'uni-view｜inv-grid｜inTip:false｜slot:-1'`、`tip = false`、`active = -1`（余 9 段正常）；`MutationObserver`：`{'t':1724.7,'ev':'remove-tip'}` → `{'t':1795.4,'ev':'add-tip'}` → `{'t':1798.8,'ev':'style:left: 626px; top: 293.406px; width: 240px;'}`（**改指 idx28**）；横向 1px 步进定界（y = 格上缘 + 3）：**idx29** `dx = −1.000px` 仍开、**`dx = −2.000px` 起关闭**（`active = -1`）、**`dx = −7.000px` 起层重开为 `slot:28`**；**idx8 同形**（`−2.000px` 起关、`−7.000px` 起重开为 `slot:7`）⇒ **未覆盖带宽约 4px**（格边 `−6px … −2px`） |
| **非阻塞性证据** | **自然手势**（先竖直进层、再层内横移）**四组各 24/24 段全通**且层全程打开；**真实点击合成 / 分解均成功**（14-9-2）；**阻塞性 = none**、**可恢复 = 重新移入** |
| **不修口径（如实登记）** | 本批**不改代码**；**若要修 = 一句话级**（把联合区域容差 2px 调到覆盖列缝，或让联合区域含「源格 ↔ 层」之间的横向带）—— **留待后续批次裁定**，本节**不预填**修改后的读数 |

#### 14-9-5 本轮**未覆盖**（Neng-6 自报 `not_covered` · 逐条登记，**不得当已验**）

1. **小程序（mp-weixin）运行路径未实测**：无小程序运行时 ⇒ `#ifndef H5` 分支（uni 触摸 + `boundingClientRect()`）本轮**只做代码级阅读**，**未取真机读数**。
2. 移动端只做 **4 例几何采样 + 触摸全路径回归**，**未**在移动端对 36 格做鼠标路径全扫（桌面端已全扫 36/36）。
3. **溢出提示行**（占格 > 36）**未走 UI**：夹具 33 占格无溢出 ⇒ `.inv-overflow` 文案本轮**未渲染取证**；「已镶嵌玉不计格」只有「2 枚 mounted 玉未入格、总数 21」的**间接佐证**，**未单独断言**。
4. 层内按钮的 **busy 置灰态**、**籽不足置灰 +「再攒 N 颗」**、**409 `ASSET_INSUFFICIENT` / 404 错误分支**均**未走 UI**（只覆盖成功链路）。
5. **非整数倍 / 极端 dpr**（如 dpr 1.5 / 4）与浏览器缩放**未覆盖**；卡片部分滚出视口时的层定位只做「滚动后悬停」的**间接观察**，**未做定点比对**。
6. 提示层**横向被卡片边界夹取**的分支只在移动端 `idx0 / idx29` 采样到（`tipInsideCard = true`），**未穷举 36 格**的夹取边界。

> **与 `docs/PENDING_DEPLOY.md` §32 的关系**：本节读数 = **§32-2 前端重打必要性**的补充证据（被验文件 `asset-inventory.vue` 未重打）；**部署后冒烟**仍按 **§32-4** 执行；**§32-4 第 4 条**「命中判定不得混用」的**口径真源 = 本节 14-9-3**。

---

### 14-10 图标批（竹简 / 石榴籽碎片 SVG）产物 · 验证读数 · 风险登记（**追加 · 2026-09-24 · 图标批 · §14-1–§14-9 既有行原文一律保留 · 不回改任何行号引用**）

> **性质（`AGENTS.md` §0 第 4 / 5 条）**：本节为**追加小节**，属「**补全**」不属「**取代**」—— **§14-1–§14-9 既有行 / 既有编号 / 既有读数全部原文保留**；**§14 内既有行号引用（如 `.inv-tip` / `:167` / `:438-441` 等）一律不回改**；实现变更若已使旧行号漂移，**照实登记漂移、保留原行**（登记见 **14-10-6**）。
> **读数来源（逐字照抄 · 不自报）**：**Zang 独立复核 + Neng 独立质检**（**2026-09-24 21:44–22:12 CST 实测**）；其中**两 SVG 的字节 / md5 / 文件头由 Jing 只读复核**（`wc -c` + `md5` + `head`，**与登记值逐字一致，真源零写入**）。
> **本节不新增任何集合 / 字段 / 枚举 / 路由 / 算法 / 价格口径**（承本册头部「总纲唯一权威声明」）；本节只登记**前端资源（图标）+ 模板 / 常量落点**与**验证读数**。

#### 14-10-1 产物（文件 · 字节 · md5 · 内容口径）

| # | 文件 | 字节 | md5 | 内容口径（Jing 只读复核） |
|---|---|---|---|---|
| 1 | `frontend/src/static/icons/bamboo.svg` | **5732 B** | **`640e279e18ded176ad5b05ad132f9a93`** | = Kevin 原件（附件）**byte-exact 副本**（`cmp` IDENTICAL）；`viewBox="0 0 1024 1024"`、**2 个 `path`**、`fill="#92523f"`、根 `<svg width="256" height="256">`；`git` 状态 = **`??` untracked** |
| 2 | `frontend/src/static/icons/fragment.svg` | **560 B** | **`5df487baefd88b12601b85a25f91db1b`** | **不等边不等角三角形**（幂立式几何实算：三边 `105.366266` / `138.681001` / `166.394982` **互异**，三角 `39.096375°` / `56.100631°` / `84.802994°` **互异**，**和 = 180.000000°**）；`stroke="#C9843F"` + `stroke-dasharray="14 11"` + `radialGradient`（`#FBE0E4 → #EFA9B4 → #D07E8D`）；`viewBox="0 0 200 200"`、根 `<svg width="512" height="512">`；`git` 状态 = **`??` untracked** |

#### 14-10-2 常量落点与引用点（逐点只读复核一致）

| 项 | 落点 | 复核结果 |
|---|---|---|
| 常量 | `frontend/src/business/icons.ts` 新增 **`BAMBOO`**（`:15-16`）/ **`FRAGMENT`**（`:17-18`） | `BAMBOO: '/static/icons/bamboo.svg'`（`:16`）/ `FRAGMENT: '/static/icons/fragment.svg'`（`:18`），两者**同一 `ICON` 常量对象** |
| 转出 | `frontend/src/business/index.ts:34` | `export { ICON, genderIconSrc } from './icons';` —— **转出路径不变** |
| 引用 1 | `frontend/src/components/asset-inventory/asset-inventory.vue:38`（竹简格）/ `:39`（碎片格） | `:38` = `<image v-else-if="cell.kind === 'bamboo'" class="inv-ico" :src="ICON.BAMBOO" mode="aspectFit" />`；`:39` = `<image v-else class="inv-ico" :src="ICON.FRAGMENT" mode="aspectFit" />`（**两格均为 `<image>` 元素，非纯 CSS**） |
| 引用 2 | `frontend/src/pages/assets/index.vue:58`（碎片行）/ `:80`（竹简行） | `:58` = `<image class="ico-card" :src="ICON.FRAGMENT" mode="aspectFit" />`；`:80` = `<image class="ico-card" :src="ICON.BAMBOO" mode="aspectFit" />`（均在 `asset-name-cell` 内） |

#### 14-10-3 删除项与作废口径

| 项 | 内容 | 证据（本批只读复核） |
|---|---|---|
| 删除 1 | **`.inv-bamboo`**（纯 CSS 简牍条纹）**整块删除** | 全仓 `grep -rn 'inv-bamboo'` = **0 命中** |
| 删除 2 | **`.inv-frag`**（旋转 −12deg 虚线方框）**整块删除** | 全仓 `grep -rn 'inv-frag'` = **0 命中**（与删除 1 合并统计亦为 **0**） |
| **作废 1（自 2026-09-24 起作废）** | 旧措辞「**竹简仓库无图标且不得自行新增 SVG 资源**」 | 全仓 **0 命中** ⇒ **该口径自 2026-09-24（图标批落盘）起作废** |
| **作废 2（自 2026-09-24 起作废）** | 旧措辞「**无图标资源可引用，不得新增 SVG**」 | 全仓 **0 命中** ⇒ **同上作废** |
| ⚠️ 登记口径 ① | `frontend/src/components/asset-inventory/` 处于 **git untracked**（`git status --porcelain` = `?? frontend/src/components/asset-inventory/`）⇒ **被删的旧 CSS 无 git 历史行可保留**；本册据此**不引用任何「旧 CSS 历史行」**，**只登记现盘事实**（如实说明，不补造行号） | 同批实测 |
| ⚠️ 登记口径 ② | **两 SVG 亦为 `??` untracked**（`?? frontend/src/static/icons/bamboo.svg` / `?? frontend/src/static/icons/fragment.svg`）⇒ 其「byte-exact = Kevin 原件」的判据为 **`cmp` 比对（Zang 实测）**，**非 git 版本比对** | 同批实测 |

> **① 作废生效范围**：上述两条旧口径**自 2026-09-24 起作废**，**凡本册 / §13 / §14 内出现同类措辞处，一律以 14-10-1 / 14-10-2 的现行落点为准**（旧行**原文保留、不回改**，语义自本节起被覆盖 —— `AGENTS.md` §0-5 / §10 纪律）。
> **② 行号不回改**：**§14 内既有行号引用一律不回改**（如 `.inv-tip` 相关 `:167` / `:523` / `:438-441` / `:450` 等，见 14-10-6）；如需**现行行号**，**以 14-10-6 的现测值为准**，**不得以「修订旧行」的方式实现**（`AGENTS.md` §0-4）。

#### 14-10-4 验证读数（Zang 复核 + Neng 独立复跑）

| 判据 | 实测读数 |
|---|---|
| **类型检查** | `cd frontend && npm run type-check`（`vue-tsc --noEmit`）→ **EXIT 0** |
| **单测（Neng 独立复跑，与 Kong 自述一致）** | 仓库根 `npm test` → **480 tests / 480 pass / 0 fail / 0 skipped**（**exit 0**）；`scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` = **29** ⇒ **本批零新增测试**（**未注册 = 假绿**） |
| **H5 真机（/tmp 副本栈：compat `3458` + 前端 `5399`；未占 3100 / 5199）** | 两 SVG HTTP **200** + `Content-Type: image/svg+xml`、**字节与仓库一致**；行囊 **18 / 36 格**全为 `uni-image`，`naturalWidth` = **256**（bamboo）/ **512**（fragment）**> 0**，4 个资源**全 200、无 404**；资产页 **4 行**图标均 **32×32 可见、无破图**；格尺寸 **78.66 × 78.66**（**w = h**）；角标 `right 3.00 / bottom 1.00` **与 CSS 声明逐值吻合** |
| **小程序构建** | `npm run build:mp-weixin` → **exit 0**；产物内 `static/icons/bamboo.svg`（**5732 B** / md5 **`640e…93`**）与 `fragment.svg`（**560 B** / md5 **`5df4…1b`**）**均已随包**；两个 wxml **各 4 个** `<image mode="aspectFit">` |
| **真源零写入** | `find migrate-output config -type f` 全量 md5 **前后同值**、`find … -newermt` = **0 文件**（**本批真源零写入**） |

#### 14-10-5 风险与已接受差异（**逐条如实登记，不加重**）

| # | 项 | 登记口径 |
|---|---|---|
| 1 | **资源缺失 = 静默空白**（**实测**：CDP 阻断 `fragment.svg` ⇒ 图标区**空白**、元素**被移除**、**无破图 / 无问号**，角标仍在） | ⇒ **漏拷资源在上线后表现为无声空白、不报错**；可选加固 = `<image @error>` 兜底或打包断言 —— **本轮未做**（**留待后续批次裁定**） |
| 2 | **小程序主包余量告急** | 主包 **2,009,911 B / 上限 2,097,152 B**（余 **87,241 B**；本批 **+6,292 B**）⇒ **后续新增 static 资源需先算体积**（**与后续 UI 特效批直接相关**） |
| 3 | **「籽色」口径待产品确认** | fragment 用**粉 / 玫瑰系渐变**，而 `seed.svg` 为**红系**（`#c1121f` / `#e63946`）—— **两套色值不同**，属**设计确认项**（Zang 已上报 Kevin；本册**不代裁定**） |
| 4 | **小程序真机渲染未实测** | 无微信开发者工具环境 ⇒ 仅验证**产物与 wxml 编译**；沿用既有已接受差异 **§13-9 #1 / §14-6 #1** 的形态（**本批未新增已接受差异类别**，**未当已验**） |

#### 14-10-6 §14 既有行号引用的**漂移登记**（**只登记、不回改** · 承 14-10-3 口径 ②）

> **口径**：下表**只登记现盘实测行号**，**不回改 §14-9-1 任何既有行**；漂移**方向不一致**（多数 −1，个别非 −1）⇒ **不得按「整体偏移量」换算旧引用**，引用现行行号时**一律以本表现测值为准**。**成因未取证、不臆断**：`asset-inventory.vue` 处于 **untracked**（`??`）⇒ **无 git 历史可比对**，本批**未做归因断言**。

| 出处（**原文保留**） | 旧引用 | 现盘实测（本批只读，文件现 `1063` 行） | 差值 |
|---|---|---|---|
| §14-9-1 第 1 项 `TIP_ABOVE_ROW` | `:167` / `:523` | 定义 `:166`；使用 `Math.floor(index / SLOT_COLUMNS) >= TIP_ABOVE_ROW` = `:522` | **−1 / −1** |
| §14-9-1 第 2 项 零间隙断言 | `:438-441` | 注释 `:437-438` + `originTop` 减法 `:439-441`（现 `:437-441`） | **−1** |
| §14-9-1 第 3 项 坐标原点修正 | `:291-306` | `cardOrigin()` 整块现 `:285-300`（注释 `:285-293` / 函数 `:294-300`）；`:291-306` 行段现**跨** `cardOrigin` 尾 + `measureRects` 注释头（`measureRects` 注释 `:302-315`、函数 `:316`） | **边界已移动** |
| §14-9-1 第 4 项 `top` 保留 3 位小数 | `:450`（注释 `:447-449`） | `tipStyle.value = \`left: …; top: ${Math.round(top * 1000) / 1000}px; …\`` = `:449`（注释 `:446-448`） | **−1** |
| §14-9-1 第 5 项 估算高度 + 贴合校正 | `:163` / `:165` / `:391` / `:407-431` | `TIP_LINE_H` `:162` / `TIP_ACTIONS_H` `:164` / `tipFitDone` **`:391`（不变）** / `measureTipBox` `:406`（重合校正块 `:413-430`） | **−1 / −1 / 0 / −1** |
| §14-9-1 第 6 项 阈值 | `:174`（`TIP_FIT_EPS`）/ `:176`（`TIP_UNION_TOL`）/ `:161`（`TIP_WIDTH`） | **`:175` / `:173` / `:160`**（现盘声明顺序 = `TIP_WIDTH` `:160` → `TIP_LINE_H` `:162` → `TIP_ACTIONS_H` `:164` → `TIP_ABOVE_ROW` `:166` → `TIP_UNION_TOL` `:173` → `TIP_FIT_EPS` `:175`） | **+1 / −3 / −1（方向不一致）** |

> **范围声明**：本表只复核 **§14-9-1 表内**的点名行号（逐点只读实测）；**§14-9-2 / 14-9-3 / 14-9-4 的其余行号本轮未逐条重锚**（**不作全面重锚、不改旧行**）—— 如后续需要，**另开批次**追加登记。
> **与其它分册的关系**：图标批的**产物与资源体积**登记 = 本节 14-10-1 / 14-10-5 #2；**上云动作与判据**仍以 `docs/PENDING_DEPLOY.md` **§32** 为准；`npm test` 读数登记 = `AGENTS.md` **§7 追加行**（本批）。

---

### 14-11 图标批 · 终校补登（**追加 · 2026-09-24 · 图标批 · 承 §14-10** · **本小节不取代 14-10** · **§14-1–§14-10 既有行 / 既有编号 / 既有读数一律原文保留**）

> **性质（`AGENTS.md` §0 第 4 / 5 条）**：本小节为**追加补登**，**不取代 14-10** —— 14-10（产物 / 常量与引用点 / 删除项与作废口径 / 验证读数 / 风险与已接受差异 / 行号漂移登记）**继续全文有效、原文一字不改**。本小节只做三件事：**(a)** 补登 14-10 落盘时**尚未取得终校结论**的两项事实（**375 真机视口读数**、**碎片色值口径终校裁定**）；**(b)** 登记 14-10 的**落盘时点**（说明 14-10-5 #3「待产品确认」措辞的由来）；**(c)** 关闭 14-10 末句对 `AGENTS.md` §7 的**悬空引用**。
> **① 旧口径作废（重申 · 承 14-10-3）**：旧「**竹简仓库无图标且不得自行新增 SVG 资源**」与旧「**无图标资源可引用，不得新增 SVG**」**自 2026-09-24（图标批落盘）起作废**；本册内该两处旧行**原文保留、不回改**，语义自 14-10-3 起被覆盖。
> **② 行号不回改（重申 · 承 14-10-3 口径 ② / 14-10-6）**：**§14 内既有行号引用一律不回改**；实现变更已使旧行号漂移者，**漂移照实登记于 14-10-6、原始引用照旧保留**（`AGENTS.md` §0-4）。
> **③ 本小节不新增任何集合 / 字段 / 枚举 / 路由 / 算法 / 价格口径**（承本册头部「总纲唯一权威声明」）。

#### 14-11-1 本批四类登记的落点与终校状态（**14-10 继续有效** · 只作索引，不复制 14-10 正文）

| 类别 | 登记落点（14-10 正文，原文保留） | 终校状态（本小节） |
|---|---|---|
| 产物（两 SVG：字节 / md5 / 内容口径） | 14-10-1 | **有效**（本小节落盘前 Jing 只读复核一致：`wc -c` = **5732** / **560** B，`md5` = **`640e279e18ded176ad5b05ad132f9a93`** / **`5df487baefd88b12601b85a25f91db1b`**） |
| 常量落点与引用点 | 14-10-2 | **有效**（同批复核一致：`business/icons.ts` 的 `BAMBOO` 常量行 `:16` / `FRAGMENT` 常量行 `:18`；`components/asset-inventory/asset-inventory.vue` `:38` / `:39`；`pages/assets/index.vue` `:58` / `:80`） |
| 删除项与作废口径 | 14-10-3 | **有效**（同批复核：全仓 `grep -rn 'inv-bamboo'` / `'inv-frag'` **除本册 14-10-3 登记文本自身外 0 命中**；两条旧措辞同口径 **0 命中**） |
| 验证读数 / 风险与已接受差异 | 14-10-4 / 14-10-5 | **有效**，但 **14-10-5 #3 已由 14-11-2 取代**（见下）；**新增补登读数见 14-11-3** |

#### 14-11-2 碎片色值口径 **终校裁定**（承 14-10-5 #3 · **14-10-5 #3 原文一字不改**）

| 项 | 裁定（终校） |
|---|---|
| 色值归属 | **保留粉 / 玫瑰系**：`radialGradient id="fragBody"` 三停点 **`#FBE0E4`（0%）→ `#EFA9B4`（55%）→ `#D07E8D`（100%）** —— 该三值 = **被删的旧 CSS `.inv-frag` 原有色值**（承 14-10-3 删除 2）；**Kevin 只纠正形状（改为不规则三角形）、未质疑颜色** ⇒ **颜色不变更** |
| 与 `seed.svg` 的关系 | `seed.svg` 为**红系**（`#c1121f` / `#e63946`）⇒ **两套色值不同**：此为**已知差异、非缺陷**（**不列为风险项**） |
| 对 14-10-5 #3 的处理 | 14-10-5 #3 原文（「**籽色」口径待产品确认** … **本册不代裁定**」）**原文保留、不回改**；其语义**自本小节起被覆盖**（`AGENTS.md` §10 纪律；同体例 = 本手册「待确认 → 追记确认」两行）⇒ 该确认项**已裁定完毕、本表为终态** |

#### 14-11-3 补登验证读数（14-10 未载 · Zang 复核 + Neng 独立质检 · 2026-09-24 21:44–22:12 实测）

| # | 项 | 登记口径 |
|---|---|---|
| 1 | **H5 375 真机视口格尺寸**（**与 14-10-4 的桌面读数并列、不可互换**） | **375 真机实测：格宽 42.16px、格内图标 23.59px**；14-10-4 的 **`78.66 × 78.66`（w = h）系桌面视口读数** ⇒ **引用格尺寸一律必须带视口宽度**：桌面视口 = **78.66**、375 视口 = **42.16**，**两者不得互相替代、不得只写其一而隐去视口** |
| 2 | **真源零写入（精确判据）** | `find migrate-output config -type f` 全量 md5 **前后同值**；**`-newermt '2026-09-24 21:56:46'` = 0 文件**（Zang 亦独立复核同值）⇒ 图标批**真源零写入** |
| 3 | **质检副本栈端口回收** | 质检栈 **compat `3458` + 前端 `5399`** 用完**已回收**；用户自用 **`3100` / `5199` 全程未占**（与 14-10-4「未占 3100 / 5199」同源读数） |
| 4 | **上线加固项（仍为未做）** | 「资源缺失 = 静默空白」的加固（`<image @error>` 兜底或打包断言）= **本轮未做**（承 14-10-5 #1，**本小节未变更其状态**） |

#### 14-11-4 §14-10 的落盘时点与悬空引用收口（只读实测）

| 项 | 登记 |
|---|---|
| 14-10 落盘时点 | `docs/economy.spec.md` **mtime = 2026-09-24 22:18:01**（`stat` 只读实测）⇒ 14-10 于**本批测量窗口（2026-09-24 21:44–22:12）结束之后**落盘，故其 14-10-5 #3 记的是「**待产品确认**」；**终校结论补登于 14-11-2** |
| 悬空引用收口 | 14-10 末句「`npm test` 读数登记 = `AGENTS.md` **§7 追加行**（本批）」曾为**悬空引用**（14-10 落盘时 §7 尚无本批行）—— 现**已收口**：`AGENTS.md` **§7** 已落盘逐字标题 **「`npm test` 读数（本批 · 图标批 · 2026-09-24）」** 行；**14-10 末句原文保留**，其语义**自本小节起指向已存在的落点**（`AGENTS.md` §10 纪律；同体例 = 本手册「悬空引用收口」追记行） |

---

### 14-12 V3「灵石共鸣」特效批（石榴籽玉【合成】/【分解】）· 已终校口径 · 已接受差异（**追加 · 2026-09-25** · §14-1–§14-11 既有行 / 编号 / 读数一律原文保留）

> **性质（`AGENTS.md` §0 第 4 / 5 条）**：本节为**追加小节**，属「**补全**」不属「**取代**」—— **本小节不取代 14-10 / 14-11**（图标批两节继续**全文有效、原文一字不改**）；**§14-1–§14-11 既有行 / 既有编号 / 既有读数全部原文保留**；**§14 内既有行号引用一律不回改**；**新口径与旧行冲突处，旧行原文保留、语义自本小节起被覆盖**。
> **本节不新增任何集合 / 字段 / 枚举 / 路由 / 算法 / 价格口径**（承本册头部「总纲唯一权威声明」）；本节只登记**前端单文件渲染层（`asset-inventory.vue`）的交互 / 层级 / 动效 / 降级口径**与**终校读数**。
> **读数来源**：**Zang 裁定**（交互层级 / 跨端安全子集 / 已接受差异）+ **三轮独立质检（独立于实现方）** + **Neng 终校**；本小节落盘前由本环节**对磁盘只读抽验**（见 **14-12-4**）—— **与派单口径不一致者一律照实登记，不美化、不代改**。

#### 14-12-1 口径（A–H）

| # | 项 | 登记口径（现盘只读实测为准） |
|---|---|---|
| A1 | 定版 | 版本 = **V3「灵石共鸣」**（用户 Kevin 定版）；承接 = §14-4 v6 玉归属 / §14-6 拖曳口径 / `docs/PENDING_DEPLOY.md` §32 行囊 v3–v6 |
| A2 | 改动面 | **单文件**改动 = `frontend/src/components/asset-inventory/asset-inventory.vue`（现盘 **1940 行**、`git status --porcelain` = **`?? frontend/src/components/asset-inventory/`** untracked）；同批 `frontend/src/business/inventory.ts` 亦 **`??` untracked**；`frontend/src/business/jade-ops.ts` = **tracked 且本批未改**（`git status` 无该文件，**文案真源本批零改**） |
| A3 | 静态资源 | **零新增静态资源** —— 本批不新增任何 SVG / 位图，**不动** `frontend/src/static/icons/*`（承 14-10-5 #2「主包余量告急」） |
| B1 | 动作面 | 石榴籽玉的【合成】/【分解】两个动作（行囊提示层内按钮） |
| B2 | 确认框 | **自绘确认框取代 `uni.showModal`**（`.inv-confirm-mask` **1030** / `.inv-confirm` **1031**）；**文案逐字**取 `frontend/src/business/jade-ops.ts`，**合成**确认 = `SYNTH_CONFIRM_TITLE` + `SYNTH_CONFIRM_LINES`，来源 = `docs/economy-ops.spec.md` **§6.1 条目 8.2**（该册 `:314`） |
| B2a | ⚠️ 分组口径 | **分解**确认（`DECOMPOSE_CONFIRM_TITLE` / `DECOMPOSE_CONFIRM_LINES`）按 `jade-ops.ts:49` 自注 = **「非 §6 定稿文案」**（内容按 `docs/spirit-domain.spec.md` §5-2 的免费 / 999 颗 / 365 天口径）⇒ **不得**把分解确认文案一并记为「§6.1 定稿文案」 |
| B3 | 按钮文案 | `取消` / `确认合成`，`取消` / `确认分解`（现盘 = 模板 `:128` 静态 `取消` + `confirmOkText` computed `:750`） |
| B4 | 完整回执 | 仍由 `uni.showToast` 交付，**一字未改**（结果浮字**不取代、不改写** toast 文案；现盘 `:1207` 注释同口径） |
| B5 | 结果浮字 | = **数量摘要**（**非**新造文案）：经 `frontend/src/business/inventory.ts` 的 `buildInventory` **唯一出口**装配，取 `item.name` / `item.tooltipLines[0]`（`inventory.ts:133` 函数 / `:52` `name` / `:60` `tooltipLines`）⇒ **组件内零字面量**；失败浮字**沿用既有「再攒 N 颗」** |
| C1 | 层级链（Zang 裁定 · 现盘实测） | `.inv-tip` **1010** / `.fx-layer` **1014** / `.fx-global` **1016** / `.fx-result` **1018** / `.inv-confirm-mask` **1030** / `.inv-confirm` **1031**（现盘 `:1746/:1865/:1870/:1874/:1896/:1901`） |
| C2 | 命中安全 | **特效层（1014 / 1016 / 1018）与 `.fx-el` 全部 `pointer-events: none`（不得夺命中）**（现盘逐条复核） |
| C3 | ⚠️ 与派单口径的分歧 | 派单口径另列 `.fx-bubble` **1022** 与 toast **1035** —— **现盘未取证**：全仓 `grep -rn 'fx-bubble'` = **0 命中**、前端源码 `grep -rn '1022'` / `'1035'` = **0 命中**；现盘类名集合 = `fx-layer / fx-global / fx-result / fx-el / fx-float / fx-label / fx-mockup / fx-vein / fx-breathe`。⇒ **本册登记现盘事实**；`1022` / `1035` 两条**列为待核**（若属未落盘设计值 / 后续片，须另取证后追加，**不得据派单数字当已验**） |
| D1 | 跨端安全子集 | **只准** `transform / opacity / 多层 box-shadow（含 inset）/ 多层 gradient / @keyframes / CSS 变量`；**禁用** `filter / blur / backdrop-filter / mask / clip-path / conic-gradient / mix-blend-mode` |
| D2 | 现盘复核 | `asset-inventory.vue` 内禁用字样**仅出现在注释**（`:173` 禁用清单注释 / `:513` 说明环改用 border + scale **替代** `conic-gradient`/`mask`）⇒ **零实际声明** |
| E1 | 小程序降级 | `@keyframes` **只留 2 条最小循环态**（`inv-fx-vein` 玉纹扫过 / `inv-fx-breathe` 呼吸）且**整块包在 `/* #ifdef H5 */`**（现盘声明 `:1850-1851`）；**一次性特效 = 纯 `transition` + 定时链（零 `@keyframes`）**（现盘 `:360` 注释同口径） |
| E2 | 产物实测（wxss） | `frontend/dist/build/mp-weixin/components/asset-inventory/asset-inventory.wxss`（**8249 B**、mtime **2026-09-25 08:53:31**）：`@keyframes` 计数 = **0**、`animation` 计数 = **0** —— **本环节独立复测，与派单读数一致** |
| E3 | 主包体积 | 派单读数 = **2,025,467 B**（上限 2,097,152 ⇒ 余 **71,685 B**）；**本环节现盘实测 = 2,025,818 B（余 71,334 B）**（= `frontend/dist/build/mp-weixin` 全量去 `app.json.subPackages` 根 `pages/special`（该子包 **6,582 B**）之和）⇒ **两者差 351 B、成因未取证**（产物 mtime = 落盘当日 08:53，疑为读数时点 / 构建时点不同）；**两读数同向结论 = 余量告急，后续新增 static 资源须先算体积** |
| F1 | 悬停 / 按下接线（本批修复） | 模板 `:class` **真实绑定** `is-hover` / `is-press`（现盘 `:70-71` 合成 / `:85-86` 分解）—— **修复前二者为死 CSS**；H5 = 原生鼠标事件 + `composedPath` 识别 `.inv-tip-btn`；小程序 = **仅 `is-press`**（touch 起点 / 滑出 / 抬起），**悬停由一次性扫光承担** |
| F2 | 按钮盒 | 按钮 layout box **恒 52×26**；`TIP_ACTIONS_H = 30`（现盘 `:247`）= 提示层定位的 **JS 估算常量** ⇒ **不得变**；按下只动**渲染盒**（`scale(.965)`，现盘 `:1781`）⇒ rect **50.18×25.09** |
| G1 | 动效排他 | 一次性扫光挂 `.btn-sheen`（`transition`）、H5 悬停循环挂**独立子节点** `.btn-vein`（`animation`）⇒ **两者不得挂在同一元素上**（现盘 `:1815` `…sheen-once:not(.is-hover) .btn-sheen` vs `:1852` `.is-hover … .btn-vein`） |
| G2 | 判负 / 判正对照 | 修复前（同元素）= 悬停期间 `transition-duration` 被压到 0s，离开时**一步跳到终点**：**实测一个 35ms 采样内 −61% → +122%、0 个中间值**；修复后 = **28 个中间值**、最大单步 **11.2%**（**含 `transition:none` 判负对照**） |
| G3 | 扫光窗口 | 一次性扫光的 **900ms 窗口改为可重排句柄**（`SHEEN_ONCE_MS = 900` / `sheenTimer`，现盘 `:761-767`）：窗口内离开按钮**只后延一次**（不叠第二次扫光）、窗口过后再离开**不补播**、`onUnmounted` 清句柄（现盘 `:1669` / `:1676-1678`） |
| H1 | 时长 | 合成 **780ms** / 分解 **680ms** / 失败 **520ms**（现盘 `FX_SYNTH_MS :365` / `FX_DECOMP_MS :367` / `FX_FAIL_MS :369`）；reveal **560 / 520**（`FX_REVEAL_SYNTH_MS :371` / `FX_REVEAL_DECOMP_MS :373`） |
| H2 | 阻塞 | 动画期间 `busy` **阻塞**，**无跳过入口**（现盘 `:1191` 注释同口径） |

#### 14-12-2 已接受差异与未做项（**逐条如实登记，不美化**）

| # | 项 | 登记口径 |
|---|---|---|
| 1 | 跨格 **6px 缝闪关** | **既有口径**（`TIP_UNION_TOL = 2 < 6px`，现盘 `:256`；`hoverAt` **本批未改**）⇒ **可恢复、无状态残留**；**非本批新增** |
| 2 | **落位后提示层自动弹开** | **既有**（Chrome 在 DOM / 类变更后重算 hover 并补发 `mouseover/mousemove`，走**既有** `hoverAt`）⇒ **非本批新增** |
| 3 | **上摆提示分支在当前数据下不可达** | 需 **≥25 占格** 才可达 ⇒ 属**既有性质**（承 §14-2 溢出口径 / 14-9-1 `TIP_ABOVE_ROW`）；**非本批新增** |
| 4 | **小程序真机未测** | **环境无微信开发者工具** ⇒ 仅验产物（wxss 计数 / 编译产物）；沿用既有已接受差异形态（承 14-10-5 #4 / §13-9 #1 / §14-6 #1），**未当已验** |
| 5 | **「资源缺失 = 静默空白」加固仍为未做** | 承 **14-10-5 #1 / 14-11-3 #4**；本批**未变更其状态**（**仍为未做**） |

> **登记纪律**：上表为**已接受差异 / 未做项**，后续引用**不得**写成「已修复 / 已覆盖 / 已验」；如需关闭，**另开批次并附判据**（`AGENTS.md` §10）。

#### 14-12-3 终校读数与质检证据（承 J / K / L）

| 项 | 登记读数 |
|---|---|
| J-1 第 1 轮质检（独立于实现方） | 抓出 **`is-hover` / `is-press` 未绑定模板 = 死 CSS** ⇒ 悬停扫光 / 按下凹陷 / 玉纹循环**全部静默失效**，且自动采样会给出「四态一致」的**假通过** ⇒ **该轮证据价值 = 证伪，不是通过** |
| J-2 第 2 轮质检 | **27 段指针轨迹** + 缝扫描（**0.25px × 2265 采样 · `badCount = 0`**）；拖曳**不抢焦**；按钮盒**四态恒等** |
| J-3 第 3 轮质检 | 对**两次修复独立复核**（含 14-12-1 **G2 的判负 / 判正对照**） |
| J-4 **方法论口径（必登）** | **量具必须有判负对照**，否则 **PASS 不算数**（例：G2 若只呈「修复后 28 个中间值」而无 `transition:none` 判负对照，则该 PASS **不成立**） |
| K-1 `npm test` | 根 `npm test` → **480 tests / 480 pass / 0 fail / 0 skipped（exit 0）**（**引用终校读数 · 本小节未复跑、不自报**） |
| K-2 类型检查 | `cd frontend && npm run type-check`（`vue-tsc --noEmit`）= **EXIT 0**（**引用终校读数 · 未复跑**） |
| K-3 注册一致性 | `scripts.test` 注册数 = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` 数 = **29**（**本环节独立复算，一致**；**未注册 = 假绿**）；**本批零新增测试文件** |
| L-1 分册边界 | 上云动作与判据 = `docs/PENDING_DEPLOY.md` **§32**（本批追加 **§32-9**）；**本小节不复写 §32**，只登记边界 |

#### 14-12-4 本小节落盘前的只读抽验（**与派单口径逐项比对 · 不一致处照实登记**）

| # | 抽验项 | 派单口径 | 现盘实测（本环节只读） | 结论 |
|---|---|---|---|---|
| 1 | `@keyframes` / `animation` 计数（`asset-inventory.wxss`） | 0 / 0 | **0 / 0**（8249 B、mtime 2026-09-25 08:53:31） | ✅ 一致 |
| 2 | `TIP_ACTIONS_H` + 模板绑定 | 30；`is-hover` / `is-press` 真实绑定 | **30**（`:247`）；绑定见 `:70-71` / `:85-86` | ✅ 一致 |
| 3 | 时长五值 | 780 / 680 / 520 / 560 / 520 | **780 / 680 / 520 / 560 / 520**（`:365` / `:367` / `:369` / `:371` / `:373`） | ✅ 一致 |
| 4 | 层级链 `1022` / `1035` | `.fx-bubble` 1022、toast 1035 | **未取证**：`fx-bubble` **0 命中**、`1022` / `1035` **0 命中** | ❌ **待核（照实登记）** |
| 5 | 主包体积 | 2,025,467 B（余 71,685 B） | **2,025,818 B（余 71,334 B）**，差 **351 B** | ⚠️ **同向、数值不一致（成因未取证）** |
| 6 | 测试文件注册数 | 29 | **29**（`ls` 计数 = `scripts.test` 枚举数 = 29） | ✅ 一致 |
| 7 | 禁用 CSS 项 | 零实际声明 | **仅注释命中**（`:173` / `:513`），**零实际声明** | ✅ 一致 |

> **抽验结论**：**7 项抽验 · 5 ✅ / 1 ❌ / 1 ⚠️**。**❌ / ⚠️ 两项未作「修正派单」处理**（本节**只追加、不回改任何历史行**）：本册**以现盘实测为准**，派单数字**原文保留于本表**，供后续批次取证后追加。

> **与其它分册的关系**：上云动作与判据 = `docs/PENDING_DEPLOY.md` **§32-9**（本批追加行）；`npm test` 读数登记 = `AGENTS.md` **§7** 追加行（逐字标题「`npm test` 读数（V3 特效批 · 2026-09-25）」）；**14-10 / 14-11 继续全文有效**（**本小节不取代**）。
> **本小节未做**：未改任何代码 / 配置 / `migrate-output` / `config`；**未跑测试、未跑构建**；未 commit / 未 push。

---

### 14-13 兰帖「格数 / 枚数」两口径 易混澄清（**追加 · 2026-09-25 · 授权收口单** · **独立质检实测提出** · **§14-1–§14-12 既有行原文一律保留**）

> **来源与责任口径（逐字）**：本澄清由**独立质检的实测**提出（实测 **250 片 ⇒ 3 格**、角标 **100 / 100 / 50**）；**派单方早期写错的期望值（250 片 ⇒ 2 格）不当作任何一方的错** —— 期望值写法有误、**质检实测为准**，双方均不因此判负。
> **承接**：§14-1 第 1 条（1 格 = 1 道具）与第 3 条（余数占格）**对兰帖同样适用**；本节**不改**该两条任何字面。

| # | 口径 | 逐字定义 | 实测例（**250 片**兰帖片） |
|---|---|---|---|
| ① | **格数**（**展示层唯一口径**） | **2 个整格 + 1 个余数格 = 3 格**（整格 + 零头另占 1 格，与竹简 / 籽**同体例**） | **3 格**；逐格角标 = **100 / 100 / 50** |
| ② | **枚数（整道具数）** | `floor(兰帖片总数 / 100)` | **2** |
| ③ | **`scrolls_item_count` 的口径 = ② 枚数** | 该出参 = **整道具数** ⇒ **措辞一律写「枚数 / 整道具数」，不得写成「格数」** | **2** |
| ④ | **展示层用的是 ① 格数** | 行囊占格 / 逐格角标 / 溢出判据**一律用格数**；`scrolls_item_count` **不参与**网格渲染 | — |

- **一句话防混（逐字）**：**「格数」看行囊（含余数格）、「枚数」看接口出参** —— **两者不是同一个数**（250 片 ⇒ **3 格 / 2 枚**）。
- **禁止写法（逐条）**：① 把 `scrolls_item_count` 写作「格数」；② 把 250 片写作「2 格」；③ 据枚数（2）判「行囊漏渲染了 1 个道具」。
- ⚠️ **现证待办（照实登记 · 本单禁改代码）**：实现侧该出参处的**现行注释措辞**与本节「枚数」措辞不同 ⇒ 该措辞差异**只登记**（**不改代码、不回改本册任何既有行**）；文档侧**一律按本节 ③ 用「枚数」**。现证命令（**以命令的实际输出为准**）：`grep -n "scrolls_item_count" cloudfunctions/compat-api/lib/economy-ledger.js`。
- **一句话可改**：改本表 ③ 一处（改口径须同步出参实现与 **§15-6 ④**）。

---

## 15. 物品域扩展：兰帖碎片 + 兰帖（竹简碎片 = 既有竹片）（**追加章节 · Zang 裁定 v2（含 Kevin 已裁 5 项）· 2026-09-25**）

> **性质（`AGENTS.md` §0 第 4 / 5 条）**：本节为**追加章节** —— 本册 **§1–§13 与 §14（含 §14-1–§14-12）的既有行、既有编号、既有读数一律原文保留**；本节**不改写、不重排任何历史行**；**与既有行冲突处，旧行原文保留、语义自本节起被覆盖**（`AGENTS.md` §10 纪律）。
> **范围**：物品域的**增量** —— ① 「竹简碎片」的落地口径（**= 既有竹片**，**不新增字段**）；② 兰帖碎片的**新增标量**；③ 兰帖的**新增批次数组**；④ 合成 / 分解关系；⑤ 新增字段与枚举的**登记要求**；⑥ **行囊展示层的增量与衔接**（承 §14）。
> **本节的数值 / 字面来源**：**Kevin 下发的需求原文逐字** + **Zang 裁定 v2（R-1 / R-2 / R-3 / R-5 / R-7，其中 R-1 / R-2 / R-3 / R-4 / R-5 为 Kevin 已裁）**；域内完整口径（生命周期 / 续约 / 奖励池 / 状态机）见 **`docs/friend-domain.spec.md`**（本轮新立分册）。
> **本节不写任何「实现现状」读数**（不写测试条数 / 构建字节 / 当前行数 / 代码行号）；凡本节未实测者，一律写成**「以对应命令的实际输出为准」**。
> **⚠️ 本节含 2 处【待裁】**（**层位**与**默认序插入点**）—— **未裁前不得据任一案判任何实现负**（详见 **`docs/friend-domain.spec.md` §15-2 / §15-13**）。

### 15-1 「竹简碎片」= **既有竹片**（**R-1 · Kevin 已裁** · **不新增碎片层**）

| 项 | 口径 |
|---|---|
| 落地 | 奖励里的「**竹简碎片**」**直接入既有 `bamboos`（`BambooLot[]`）** —— 单位与既有竹片**一致（片）** |
| 字段 | **`bamboo_fragments` 字段不存在** —— **不得新增、不得留悬空字段名**（R-1 明令） |
| 作废项 | 原 **D7「新增独立竹简碎片道具」作废**（原文保留于裁定记录，不在本册正文） |
| 既有口径继承 | 有效期 **365 天**（§5-3）、到期自动作废、扣费单价与闸门（§5-8 / `docs/economy-fee.spec.md` §3-1）**一律不变** |
| 影响 | 本节**不改** §3-3（竹简 / 竹片）任何一行；竹片**不新增持有形态**，只**新增一个来源语义**（好友奖励，见 §15-5） |

### 15-2 兰帖碎片（**R-2 · Kevin 已裁** · **新增标量 `scroll_fragments`**）

| 项 | 口径 |
|---|---|
| 字段 | **`scroll_fragments`** = `jiazu_assets.users[<手机号>]` 下**新增标量**（与既有 `fragments` **并列、同构**） |
| 类型 / 取值 | **整数**；**不变量 `0 ≤ scroll_fragments ≤ 9`** |
| 上限与自动合成 | **上限 9**；获得第 10 个时**立即自动合成 1 枚成品兰帖**（与 §5-1 第 1–3 步**逐条同构**：合成与碎片落库**同一写入**完成，不出现「碎片 10 个、兰帖未生成」的中间态） |
| 有效期 | **无期限**（永不过期；标量无 `expires_at`） |
| 可否消耗 | **不可直接消耗** —— **不得**直接用于续约（需求 §1-5 明令） |
| 可否交易 / 转赠 | **不可交易、不可转赠**（沿用碎片类既有纪律，§3-1） |
| ❌ 作废项 | 原 **D8「签到同发兰帖碎片」作废**；**签到逻辑不动**（签到仍是固定 1 石榴籽碎片，§11-13 不变） |
| 来源 | ① **好友奖励池**（池内 = 石榴籽碎片 + 兰帖碎片，均分）；② **邀请新用户注册奖励** = 9 石榴籽碎片 **+ 1 兰帖碎片**（**R-4**，日限并入既有 **3 次/日**；**数量 1 为 Zang 默认值，一句话可改**）⇒ **两源并存关系见 `docs/friend-domain.spec.md` §15-8（待裁）** |
| 硬约束（R-2 明令） | **只新增这一个碎片标量** —— **不得**把碎片重构成对象、**不得**改既有 `fragments` 的形状 |

### 15-3 兰帖（**R-3 · Kevin 已裁** · **新增批次数组 `scrolls`**）

| 项 | 口径 |
|---|---|
| 字段 | **`scrolls`** = `jiazu_assets.users[<手机号>]` 下**新增批次数组**，与 `seeds` / `bamboos` / `jades` **并列** |
| 计量单位 | **片**（`ScrollLot.qty` 以片计） |
| 有效期 | **无有效期** —— **`expires_at` 恒为 `null`（永久）** |
| ⚠️ 写入纪律 | **写入时必须显式传 `expires_at = null`** —— **照既有玉的纪律**（§4-1 `Jade.expires_at` 注 + §11-3 尾注）：**不得给批次构造函数引入「默认永久」**，**缺省即抛错**（**不得**静默永久） |
| 可否分解 | **可分解**（R-3 明令）；合成 / 分解关系见 §15-4 |
| 可否交易 / 转赠 | **不可交易、不可转赠**（本册拟定；**待 Kevin 确认**，见 `docs/friend-domain.spec.md` §15-9） |
| 用途 | **好友续约的唯一支付物** —— 双方**各自消耗 1 枚**（需求 §1-1）；**不可直接消耗兰帖碎片续约**（需求 §1-5） |
| 行囊换算 | **100 片 = 1 个道具（占 1 格）**（R-3 明令）—— ⚠️ **数值 100 的来源层位待裁** ⇒ §15-6 尾注与 **`docs/friend-domain.spec.md` §15-2** |
| `ScrollLot` 字段表（**本节登记的追加字段**） | `id`（string，批次 id）｜ `qty`（number，**片**）｜ `expires_at`（**恒 `null`**，永久；写入必须显式传）｜ `source`（string，**§15-5 枚举**）｜ `created_at`（ISO 字符串） |

### 15-4 合成与分解关系（**R-7 · Zang 裁定**）

| 动作 | 口径 | 一句话改法 |
|---|---|---|
| **合成** | **10 兰帖碎片 → 1 枚成品兰帖（= 100 片）** | 改合成比一处 |
| **分解** | **1 枚成品兰帖 → 返还 9 兰帖碎片**（**留 1 片为合成损耗**） | 改返还量一处 |

- **为什么分解返还 9 而不是 10（R-7 理由）**：若返还 **10** 片，则碎片在返还瞬间即**满 10 触发立即自动合成** ⇒ **分解成为空操作**（分解完又合回去，永远回不到碎片态）。返还 **9** 片即可**避开「分解即合成」的回环**。
- **与既有玉口径的关系（易混澄清）**：既有玉的分解释**免费、无损耗**（§11-4：固定返还 999 籽）；**兰帖分解有 1 片损耗**（9 而非 10 片碎片）—— **两套口径并存、不得互相套用**（玉的「无损耗」不得搬到兰帖，兰帖的「1 片损耗」不得搬到玉）。**理由不同**：玉的产出是**籽批次**（不触发自动合成），兰帖的产出是**碎片标量**（会触发）。
- ⚠️ **R-7 的数值只在「读法甲」下自洽** ⇒ **层位待裁**见 `docs/friend-domain.spec.md` **§15-2**。

### 15-5 新增字段与枚举的登记要求（**R-16 / R-18：先改总纲，再改实现**）

> **本节只登记「要求」，不代改 §4-1 / §4-6 正文** —— 字段表与枚举清单的**落笔**须按本册 §12-8「本册为字段与算法唯一权威」的既有纪律**由授权批次在本册正文追加**（本小节即为该登记的**发起方**）。

**① 字段（`jiazu_assets.users[<手机号>]`，只增字段、不改既有形状）**

| 新增字段 | 类型 | 含义 |
|---|---|---|
| `scroll_fragments` | number（0–9） | 兰帖碎片（§15-2） |
| `scrolls` | `ScrollLot[]` | 成品兰帖批次（§15-3） |
| ~~`bamboo_fragments`~~ | — | **不存在**（R-1 明令，不得新增） |

**② `BambooLot.source` 新增取值（拟定，待 Kevin 确认）**：`friend_reward` = **好友奖励产出**（「竹简碎片」即既有竹片，§15-1）｜既有 `official_purchase` / `spirit_gift` / `market` / `admin` **一项不改**。

**③ `ScrollLot.source` 新增取值（拟定，待 Kevin 确认）**：`scroll_synth` = **兰帖碎片满 10 自动合成 1 枚成品兰帖**｜`admin` = **运营发放**（复用既有语义）。

**④ `SeedLot.source`（拟定，待 Kevin 确认）**：`friend_reward` = **好友奖励产出的石榴籽**；亦可**沿用既有 `fragment_synth`**（由碎片满 10 合成而来时）—— **二选一未裁**（前者保留「来源 = 好友奖励」的审计信息，后者零新增）。

**⑤ `Message.type` 新增取值（拟定，待 Kevin 确认）**：`friend` = **好友邀请 / 续约申请 / 到期与缓冲期提醒 / 关系解除**；**落地集合 = 既有 `jiazu_messages`**（§4-4），**不得造第二套消息域**（**R-16**）。

**⑥ `Tx.type` 新增取值（拟定，待 Kevin 确认；命名不得与既有 19 项重名）**：`scroll_synth`（兰帖碎片满 10 自动合成）｜`scroll_decompose`（兰帖分解返还 9 碎片）｜`friend_renew`（好友续约消耗成品兰帖）｜`friend_reward`（好友奖励池分发 / 基础奖励发放）。
**复用既有取值（不新造）**：`reward`（邀请新用户注册奖励，含 +1 兰帖碎片）｜`fee_refund`（**唯一允许的冲正类型**，§4-6 尾注 / §5-5-3）。
**`Tx.delta` 键集**：需新增 `scroll_fragments?` / `scrolls?`（**只增键、不改既有键语义**）—— **是否允许扩展 `delta` 形状未裁** ⇒ `docs/friend-domain.spec.md` **§15-10**。

> **取代标注（好友域路由批次 · **只追加** · 本小节历史行**原文保留、一行未删**）**：上方 **⑥** 拟定清单中的 **`friend_renew`（好友续约消耗成品兰帖）已废止 / 已取代** ⇒ **取代者 = `scroll_consume`**（好友续约**双边各消耗 1 枚成品兰帖**，各 **100 片**；`delta = { scrolls: -100 }`，与既有 `scroll_decompose` **同键同向**；**冲正仍只用既有 `fee_refund`**）；该取值的**已裁登记行 = 本册 §4-6 追加登记**（本册同批追加）。**总纲侧除此登记行以外，不得再据 `friend_renew` 落任何实现**。上方 ⑥ 的 `scroll_synth` / `scroll_decompose` / `friend_reward` 三名**本批未裁**（照旧）。
> **跨册落点**：路由字面与入参名的对齐（`/friends/renew/request` 等实测字面、`relation_token` / `to` 取代 `rel_id` / `peer_phone`）、续约语义三条、隐私口径两条、测试注入点与本批未决清单 ⇒ `docs/friend-domain.spec.md` **§19**（该册同批追加）。

**⑦ `FriendRel.status`（新集合字段，拟定）**：`pending_invite` / `active` / `buffer` / `revoked`（域内完整字段表 = `docs/friend-domain.spec.md` §7-1）。

### 15-6 行囊展示层的增量与衔接（**承 §14，§14 既有行一字不改**）

> **性质**：本小节只登记**好友域 / 兰帖带来的展示层增量**与**与 §14 各条的衔接点**；§14 的栏位 / 换算 / 占格 / 溢出 / 提示层 / 拖曳口径**继续全文有效、原文一字不改**。**§13 的取代关系不变**（仍以 §14 为准）。

**① 碎片类从 1 种变 2 种**

| 项 | §14 现状口径（原文保留） | 本节增量 |
|---|---|---|
| 碎片种类 | **1 种** = 石榴籽碎片（`fragments`） | **2 种** = 石榴籽碎片（`fragments`）+ **兰帖碎片（`scroll_fragments`）** |
| 占格 | 碎片 **1–9 个占 1 格**，角标 = 实际个数（§14-1 第 2 条） | **兰帖碎片同口径**：`scroll_fragments > 0` 即**占 1 格**、角标 = 实际个数（**1–9 个仍占 1 格**） |
| 换算常量 | `FRAGMENTS_PER_ITEM = 10`（§14-1） | **新增一个与之一一对应的常量**（拟定 `SCROLL_FRAGMENTS_PER_ITEM = 10`）—— **不得**让两类碎片共用同一个常量（两类碎片**分属不同物品**，改动必须各自裁定） |
| 满 10 语义 | 石榴籽碎片满 10 ⇒ 合成 1 颗籽（§5-1） | 兰帖碎片满 10 ⇒ 合成 1 枚成品兰帖（§15-2）—— **产出物不同** |

**② 兰帖：100 片 = 1 个道具（占 1 格）**

| 项 | 口径 |
|---|---|
| 换算 | `floor(Σ scrolls[].qty / 100)` 格；**余数占格**，角标 = 实际余量（与 §14-1 第 3 条竹简 / 籽的余数口径**同体例**） |
| 拟定常量 | `SCROLL_PIECES_PER_ITEM = 100`（**与 §14-1 的 `BAMBOO_PIECES_PER_ITEM = 100` 数值相同、物品不同** —— **不得共用同一个常量**） |
| 永久性 | `expires_at` 恒 `null` ⇒ 在「同类内到期近的在前」的比较器中，**兰帖批次一律落到该类最后**（与 §14-1 第 6 条「永久玉在该类最后」同体例，`expiresAtMs = Infinity`） |
| 来源数组 | 数据仍来自既有 `GET /assets/summary`（**路由未改**）；**新增出参 = 改本节的前提**（承 §6-1 尾注「作为账本实现真源，新增出参必须先改本节」）⇒ 新增 `scroll_fragments` / `scrolls` / `scrolls_total_pieces` 等出参**须先落笔于 §6-1**，再由实现追加 |

**③ 与 §14 默认序 / 溢出 / 提示层的衔接（待裁，见下）**

| 衔接点 | §14 现状口径（原文保留） | 本节增量（**位置待裁**） |
|---|---|---|
| 默认序 | **竹简 → 石榴籽玉 → 石榴籽 → 碎片**（`KIND_ORDER` 四值） | 新增**两个品类**（兰帖、兰帖碎片）⇒ **插入点未裁** |
| 溢出口径 | 占格需求 > 36 ⇒ **不入格** + 逐类提示行 | 新增两类**同样受 36 格约束**；提示行的**类型序**（现为 玉 → 竹简 → 籽 → 碎片）**新增两类的落位未裁** |
| 提示行文案 | 玉 = `背包空间不足，无法合成`；其它 = `空间不足，无法持有` | 兰帖**沿用「其它」文案**（`空间不足，无法持有`）为拟定；兰帖碎片**同**（**待 Kevin 确认**） |
| 提示层 | 自绘层 `z-index: 1010`（层内【合成】/【分解】须先 `closeTip()`） | **不变**；兰帖的【合成】/【分解】**并入同一提示层**（不新造第二层、不新造层级值） |

> ⚠️ **【待裁】默认序与提示行的插入点**：§14-1 第 6 条的默认序与 §14-2 的逐类提示行序**均为已裁定的字面**（`KIND_ORDER` 四值）；插入两个新品类**改变了已裁字面的相对位次** ⇒ **属对已定稿口径的改动**，**必须 Kevin 裁定**，**本册不预选**。两读法（甲：兰帖紧随竹简、兰帖碎片紧随碎片；乙：兰帖与兰帖碎片成对相邻）与影响面见 **`docs/friend-domain.spec.md` §15-13**。
> ⚠️ **【待裁】「100 片」的层位**：R-3 的「行囊换算 **100 片 = 1 个道具**」与 R-6 的层位歧义**相互耦合** ⇒ 见 **`docs/friend-domain.spec.md` §15-2**（读法甲 / 读法乙并列）。**未裁前不得据任一案判任何实现负**。

**④ 易混澄清（兰帖「格数 / 枚数」两口径 · **独立质检实测提出** · 2026-09-25 授权收口单）**

- **兰帖在行囊里有两个口径** —— ① **格数 = 2 个整格 + 1 个余数格 = 3 格**（逐格角标 `100` / `100` / `50`；**§14-1 第 1 / 3 条对兰帖同样适用**）；② **枚数（整道具数）= 2**（**250 片**之例）。
- **`scrolls_item_count` 的口径 = 枚数**（**措辞不得写成格数**）；**展示层用的是格数**。四条口径逐字定义、禁止写法、来源口径（**该结论由独立质检实测提出；派单方早期写错的期望值「250 片 ⇒ 2 格」不当作任何一方的错**）全见 **§14-13**。

### 15-7 与其它分册的关系

| 分册 | 关系 |
|---|---|
| **`docs/friend-domain.spec.md`**（本轮新立） | **好友域完整口径**（生命周期状态机 / 时间轴 / 续约与双边扣费 / 奖励池算法 / 授权账本接口 / 新集合 / 待裁清单）**均在该册**；本小节只登记**物品侧增量**，**不复制**该册正文 |
| **`docs/economy-fee.spec.md`** | **续约消耗的是成品兰帖（道具），不是竹片** ⇒ **本轮的续约扣费口径未落入该册 §3-1 扣费矩阵**（受本轮「只许改 3 个文件」约束）—— **登记为待办**；竹片侧单价与闸门**一字不改** |
| **`docs/economy-ops.spec.md`** | 通知文案真源（§6）；本小节**不写文案** |
| **`docs/PENDING_DEPLOY.md`** | 上云动作与判据 = 该册 **§33**（本轮追加小节）；**本小节不复写** |

> **本小节未做**：未改任何代码 / 配置 / `migrate-output` / `config`；**未跑测试、未跑构建**；**未改 §14 任何既有行**；未 commit / 未 push。

---

## 16. 追记：**§15-2 / §15-4 数值勘误 · Zang 裁定 2026-09-25** + **文案统一登记（2026-09-25）**（**只追加 · 不改 §1–§15 任何历史行**）

> **本节性质**：纯**追加**章节 —— 本册 **§1–§15 的既有行一律原文保留、一字不改、一行不删**；凡被本节取代者，**只在本节新写的行里标『已取代』并写明由哪一节取代**。
> **数值纪律**：本节**不写任何实现现状读数**（测试条数 / 构建字节 / 行数 一律不写）；凡引用常量 / 显示名 / 行号，**一律以对应命令（`grep` / 源码现证）的实际输出为准**。

### 16-1 §15-2 / §15-4 数值勘误 · Zang 裁定 2026-09-25（**权威值 99 / 100 / 100 / 99**）

**现证命令（落笔前实测）**：
`grep -n "SCROLL_FRAGMENT_CAP\|SCROLL_FRAGMENT_SYNTH_THRESHOLD\|SCROLL_PIECES_PER_SCROLL\|SCROLL_DECOMPOSE_REFUND" cloudfunctions/compat-api/lib/economy-ledger.js`

| # | 项 | **权威值（新）** | **常数名（逐字）** | 旧值（**已取代**） |
|---|---|---|---|---|
| ① | 兰帖碎片上限 | **99** | **`SCROLL_FRAGMENT_CAP`** | 9 |
| ② | 兰帖碎片合成阈值（满此数立即合成 1 枚成品兰帖、碎片取余） | **100** | **`SCROLL_FRAGMENT_SYNTH_THRESHOLD`** | 10 |
| ③ | 每枚成品兰帖片数（= 1 个行囊格） | **100** | **`SCROLL_PIECES_PER_SCROLL`**（**后端真源导出名**） | 10 |
| ④ | 分解返还（1 枚 → n 碎片，留 1 片损耗） | **99** | **`SCROLL_DECOMPOSE_REFUND`** | 9 |

**裁决理由（Zang 裁定 2026-09-25，逐字保留）**：
> 若照 9/10/9，一次续约（双方各消耗 1 枚）只需 20 次邀请即得 2 枚，与「续约 1 次 = 额外 1 个月有效期」的价值锚严重失衡；按 100 片/枚，每次邀请发 11 碎片 ⇒ 约 9 次邀请得 1 枚，与续约价值匹配。

**定稿数值链**：`11 兰帖碎片 / 次邀请` → `满 100 碎片立即自动合成 1 枚成品兰帖（碎片取余）` → `1 枚 = 100 片 = 1 行囊格` → 分解 `1 枚 → 99 碎片`（损耗 1 碎片）。**碎片与「片」1:1**（「10 碎片 = 1 枚」的读法**已取代**）。

**被取代的本册历史行（原文保留，本节不回改）**：

- **§15-2** 的「不变量 **`0 ≤ scroll_fragments ≤ 9`**」与「**上限 9**；获得第 **10** 个时立即自动合成 1 枚成品兰帖」⇒ **已取代**（由 **§16-1** 取代为 **99 / 100**）。
- **§15-4** 的「**10 兰帖碎片 → 1 枚成品兰帖（= 100 片）**」与「**1 枚成品兰帖 → 返还 9 兰帖碎片**」⇒ **已取代**（由 **§16-1** 取代为 **100 / 99**）。
- **§15-2「来源」行**所载「邀请奖励 = 9 石榴籽碎片 **+ 1 兰帖碎片**」中的**兰帖碎片量** ⇒ **已取代**（由 `docs/friend-domain.spec.md` **§17-5** 取代为 **11**）；同行的**石榴籽碎片 9 与日限 3 次/日**继续有效。
- **§15-2「来源」行**的「两源并存关系见 `docs/friend-domain.spec.md` §15-8（待裁）」⇒ **已裁定 = 两源并存**（见 `docs/friend-domain.spec.md` **§17-9**）。
- **他册同源历史行**：`docs/friend-domain.spec.md` **§6-4 / §14 `R-2` / `R-7` / §12-1 断言 13 / §12-2 / §15-2** 的 **9 / 10 / 10 / 9** ⇒ **已取代**，**由该册 §17-8 承标**（原文保留）。

- **一句话可改**：改本节 §16-1 表的四个值一处（改动须同步 `cloudfunctions/compat-api/lib/economy-ledger.js` 同源常量与 `docs/friend-domain.spec.md` §17-8）。

### 16-2 行囊换算常量名（**前端 / 后端分离，不得混用**）

| 侧 | 常量名（逐字） | 取值 | 语义 |
|---|---|---|---|
| **后端** | **`SCROLL_PIECES_PER_SCROLL`** | **100** | 每枚成品兰帖的片数（**真源导出名**） |
| **前端** | **`SCROLL_FRAGMENTS_PER_ITEM`** | **100** | 碎片 → 成品换算（**覆盖**本册曾拟定的 `= 10` ⇒ 该拟定值**已取代**） |
| **前端** | **`SCROLL_PIECES_PER_ITEM`** | **100** | 兰帖片 → 行囊格换算 |

- ⚠️ **两处不得混用**：**后端叫 `SCROLL_PIECES_PER_SCROLL`**、**前端叫 `SCROLL_PIECES_PER_ITEM`**。**`SCROLL_PIECES_PER_ITEM` 在后端 `cloudfunctions/**` 中不存在**（既有测试断言逐字写明「真源导出名 = `SCROLL_PIECES_PER_SCROLL`（非 `SCROLL_PIECES_PER_ITEM`）」）⇒ **不得**据该名在后端落任何代码。
- **一句话可改**：改本节 §16-2 表的「取值」一格一处（两侧须同改）。

### 16-3 文案统一登记（2026-09-25）

| 项 | 内容 |
|---|---|
| **改名词对** | **`标准石榴籽` → `石榴籽`**（**只改这一个词**） |
| **不动的** | **`石榴籽玉` / `石榴籽碎片` / `竹简` / `兰帖` 一律不动** |
| **裁定来源** | **Kevin 指令 2026-09-25** |
| **生效范围（单一来源）** | **`frontend/src/business/inventory.ts` 的 `seed` 显示名** —— **不得**在该单点之外自造第二个真源 |
| **历史区旧名保留** | **已标「已被取代 · 原文保留」的历史区（§13 全节，含 §14-7 表中引述 §13 的那一格 = 本册第 794 行）一字不改、旧名原样保留** |
| **本册现行区落点（11 处 · Kevin 指令实测清单）** | 第 **572 / 579 / 602 / 619 / 622 / 633 / 698 / 705 / 710 / 1184** 行（**第 794 行在历史区 ⇒ 不动**） |
| **他册落点** | `docs/friend-domain.spec.md` **第 648 行 1 处**（§15-13）；`AGENTS.md` **第 22 行（§0 文档索引行）1 处** |

**生效条件（本轮实测 · 以对应命令的实际输出为准）**：

- **现证命令**：`grep -rn "标准石榴籽" --exclude-dir=node_modules --exclude-dir=dist .`
- **实测结果**：**显示名单点处（`frontend/src/business/inventory.ts` 的 `seed` 显示名）现行仍为 `标准石榴籽`** ⇒ 按 `AGENTS.md` §0「**代码即事实**」，**文档现行区行在代码同批改名之前先改会与代码 / 实测不一致**（违反 Kevin 指令自带的「改后与代码 / 实测一致」条件）。
- **因此**：本节**「文案统一」口径已落（登记在案）**；**行级改写待代码侧单点改名同批执行**（本轮**禁改任何代码**）⇒ **登记为待办**（见 `docs/friend-domain.spec.md` **§17-9 第 7 项**）。

- **一句话可改**：代码侧单点改名落地后，本节 §16-3 的 **11 处落点一句话即可改**（改词一处；**不得**动第 794 行与 §13 历史区）。

> **本节未做**：未改任何代码 / 配置 / `migrate-output` / `config`；**未改 §1–§15 任何既有行**（仅末尾追加本节）；**未跑测试 / 未跑构建 / 未打包 / 未部署 / 未上传 / 未重传 / 未 commit / 未 push**；**未写任何实现现状读数**。

---

## 17. 追记（**2026-09-25** · Zang 裁定 **Z-6 / Z-7 / Z-9** + 文案统一「石榴籽」**行级改写执行登记**）（**只追加 · 不改 §1–§16 任何历史行**）

> **性质（制度员 · 2026-09-25 · 只追加）**：本节**只追加** —— 本册 **§1–§16 的既有行一律原文保留、一字不改、一行不删**；凡被本节取代 / 已裁定者，**只在本节新写的行里标注**。
> **阅读纪律**：与本节冲突处**一律以本节为准**（本节 = **后发的已裁口径**）；**本节不适用于仍未裁项**（仍待裁项逐条见 `docs/friend-domain.spec.md` **§17-9 未决清单 1–8**）。
> **数值纪律**：本节**不写任何实现现状读数**（行数 / 测试条数 / 构建字节一律不写）；凡引用常量 / 字段 / 文案，**一律以对应命令（`grep` / 源码现证）的实际输出为准**。

### 17-1 【Zang 裁定 · **Z-9**】行囊默认序插入点 + 逐类提示行类型序

| 项 | 已裁口径 |
|---|---|
| **默认序（插两品类后）** | **竹简 → 兰帖 → 石榴籽玉 → 石榴籽 → 兰帖碎片 → 石榴籽碎片**（`KIND_ORDER` **六值**）—— **成品兰帖紧随竹简**；**兰帖碎片在石榴籽碎片之前** |
| **逐类提示行类型序** | **玉 → 竹简 → 兰帖 → 籽 → 兰帖碎片 → 石榴籽碎片**（**玉优先不变**：**玉行恒在最前**） |
| 落点 | 本册 **§14-6-附**（已落，见上方 §14 内）；完整裁定 + 跨界引用 = `docs/friend-domain.spec.md` **§17-9-C-9** |
| 取代 | **§14-1 第 6 条**的原默认序、**§14-2** 的原类型序、**§14-7** 表「13-4 默认序」那一格（**均为旧词形 / 旧位次，原文保留**）；**§15-6 ③ 两处「插入点未裁」⇒ 已裁定**（旧行原文保留） |
| 现证（不写读数） | `grep -n "石榴籽\|兰帖\|KIND_ORDER" frontend/src/business/inventory.ts` 的**实际输出为准** ⇒ 文件头默认序注释、溢出序注释、`KIND_ORDER` 分组注释三处**已与本节一致**（**以代码为唯一源**，`AGENTS.md` §0 第 1 条） |
| 一句话可改 | 改 **§14-6-附** 或本节「默认序」一行一处（须同步 `KIND_ORDER` / `OVERFLOW_KIND_ORDER` 两处常量） |

### 17-2 【Zang 裁定 · **Z-6**】成品兰帖：**本轮不可交易 / 不可转赠**

- **口径**：**本轮成品兰帖不可交易、不可转赠**（与碎片类既有纪律同向；**用户面与市集面均适用**）。
- **被取代 / 已裁定的历史行（原文保留，本节不回改）**：
  - **§15-3 表「可否交易 / 转赠」行**的「**本册拟定；待 Kevin 确认**」⇒ **已裁定 = 不可交易、不可转赠**。
  - **§15-9** 两读法（甲 = 不可交易不可转赠 / 乙 = 可整枚上架市集）⇒ **已取代 = 甲案**（乙案需**扩市集商品域**，**本轮不做**）。
- **预留约束（逐字）**：**市集域日后扩展兰帖商品时，必须复用 `docs/friend-domain.spec.md` §17-9-B 的锁定守卫**（锁定期间不得挂单卖出）。
- **一句话可改**：改本节第 1 条一处（改可交易 ⇒ 须同步市集域商品域、§4-3 `Listing` 字段表与锁定守卫）。

### 17-3 【Zang 裁定 · **Z-7**】`Tx.delta` **允许**扩展（只增键）+ 字段 / 枚举登记落点

| 项 | 口径 |
|---|---|
| **裁定** | **允许**扩展 **`scroll_fragments`** 与 **`scrolls`** 两键 —— **只增键、不改既有键语义**；**已有实现先例** |
| **落点（承「先改总纲，再改实现」= 已完成）** | 本册**正文两处追加登记**：**§4-1 追加登记**（字段 + `Tx.delta` 键集）与 **§4-6 追加登记**（`Tx.type` 新增 4 项 + 复用 2 项 + `source` / `Message.type` 新增取值）—— **两处均为追加，既有行原文保留** |
| **取代** | **§15-5 ⑥ 末句**「是否允许扩展 `delta` 形状**未裁**」⇒ **已裁定**；`docs/friend-domain.spec.md` **§15-10** 读法乙（不允许）⇒ **已取代 = 读法甲**（该册 §17-9-C-7 登记） |
| **一句话可改** | 改 **§4-1 追加登记**的 `Tx.delta` 行一处（撤回扩展须同步 `lib/economy-ledger.js` 的 `delta` 组装与 §4-6 追加登记） |

### 17-4 文案统一（`标准石榴籽` → `石榴籽`）**行级改写执行登记**（承 §16-3）

**① 生效条件（已满足 · 现证以命令的实际输出为准）**

- 现证命令 ①：`grep -rn "标准石榴籽" frontend/src | wc -l` ⇒ **实测 = 0**（`frontend/src` 下旧词残留 **0 命中**）。
- 现证命令 ②：`grep -n "seed: '" frontend/src/business/inventory.ts` ⇒ 实测含 **`114:  seed: '石榴籽',`**（**单点显示名已是新词**）—— 同一命令另见 `113:  jade: '石榴籽玉',`、`116:  fragment: '石榴籽碎片',`（按 §16-3「不动的」清单**未动**）。
- ⇒ §16-3 生效条件的两条（**代码侧单点改名** + **改后与代码 / 实测一致**）**均已满足** ⇒ **§16-3 的待办「行级改写待代码侧单点改名同批执行」现可关闭**（**该行原文保留、一字不改**）；跨册登记 = `docs/friend-domain.spec.md` **§17-9 第 7 项**。

**② 现行区执行清单（下表所列行内该词**一律读作 `石榴籽`**）**

现证命令：`grep -n "标准石榴籽" docs/economy.spec.md`（**行号以命令的实际输出为准**；本轮 §4-1 / §4-6 / §14-6-附 三处追加登记插入在这些行**之前** ⇒ 早期 §16-3 清单的行号**已整体下移**，下表为本轮落笔后的现证行号）：

| 行 | 所在节 | 处置 |
|---|---|---|
| **617 / 624 / 647 / 664 / 667 / 678** | **§13**（13-1 / 13-2 / 13-4 / 13-6） | **历史区 ⇒ 一字不改**（§14 标题与 §14-7 声明「§13 全节已被取代 · 原文保留」）。**注**：§16-3 的「现行区落点」清单**曾把这 6 行列作现行区** ⇒ **册内两读法冲突，本节不自行调和**（见末条） |
| **743 / 750 / 755** | **§14-1**（换算常量表 / 第 1 条 / 第 6 条） | **现行区 ⇒ 该词读作 `石榴籽`**（本节即该改写的**生效依据**） |
| **1241** | **§15-6 ③**（默认序衔接表） | **现行区 ⇒ 该词读作 `石榴籽`**；同行的「**插入点未裁**」另由 **§17-1** 取代 |
| **851** | **§14-7** 表引述 §13 的那一格 | **历史区 ⇒ 一字不改**（§16-3 明列） |
| **1309 / 1319 / 1320** | **§16-3**（改名词对 / 现证命令 / 实测结论） | **一字不改**（命令字面与旧名引述必须原样，否则命令失真、不可复跑） |

**③ 形态说明（本轮硬约束）**：本轮**删除行必须为 0** ⇒ **行内字面未就地替换**（就地替换会把该行计为 1 删 + 1 增）⇒ 以「**生效依据 + 逐行执行清单**」形态落地：**文档的约束内容即已更新**（现行区该词读作 `石榴籽`）；**物理字面替换**为**授权后即可机械执行**的一步（改后 `git diff --numstat` 将出现对应 10 处 ±）。

**④ 未做 / 待裁**：**本节不宣称已改字面**；§13 那 6 行的归属见上表与末条；**未裁前不得据任一读法判实现负**。

**⑤ 统计口径（现证）**：`grep -c "标准石榴籽" docs/economy.spec.md` 的计数**含本节自身 3 行**（§17-4 标题 + 上面两条**现证命令字面**）—— 这 3 行**必须原样保留**（否则命令不可复跑、不可复现），故统计「文档侧旧词残留」时应与 **§16-3 的 3 行登记行**（改名词对 / 现证命令 / 实测结论）**一并排除**；**排除后**的处置见本节 **②** 表。

- **一句话可改**：改本节 **②** 表「处置」列一处（须同步 `frontend/src/business/inventory.ts` 的 `seed` 显示名与 `docs/friend-domain.spec.md` §17-9 第 7 项）。
- **待裁（末条）**：**§13 的 6 行是否属「现行区」** —— §16-3 的清单与「§13 全节一字不改」两处表述**互相冲突**；本节按**后者**（**不改 §13**）落，**不自行调和**。

> **本节未做**：未改任何代码 / 配置 / `migrate-output` / `config`；**未改 §1–§16 任何既有行**（仅末尾追加本节；**删除行 = 0**）；**未跑测试 / 未跑构建 / 未打包 / 未部署 / 未上传 / 未重传 / 未 commit / 未 push**；**未写任何实现现状读数**。

---

## 18. 收口登记（**2026-09-25 · 授权收口单 · Zang 裁定**）（**只追加 · 不改 §1–§17 任何历史行**）

> **性质**：本节**只追加** —— 本册 **§1–§17 的既有行一律原文保留**；**唯 §18-2 列明的 4 处「现行区行内字面替换」**为例外（逐行改前 / 改后见 §18-2）。
> **删除纪律（本单口径 · 取代旧约束）**：**历史区**（**§13 全节** / **§14-7 对照表** / **§16-3 旧行** / **§17-4 自指行**）的**删除 / 改写行 = 0**（旧名原文一律保留）；**现行区**允许**行内替换**（**必须逐行给改前 vs 改后对照**），且**不得顺手改任何其它字样**（**只改那 4 个字**）。
> **数值纪律**：本节**不写任何实现现状读数**（行数 / 测试条数 / 构建字节一律不写）；常量 / 字段名 / 取值 / 文案 / 路由字面**一律以对应命令（`grep` / 源码现证）的实际输出为准**；本册行号引用**以现读为准**。

### 18-1 §13 归属裁定（**明文口径 · 一行** · 承 §17-4 末条 · 冲突关闭）

**明文口径：本册 `§13` 全节 = 历史区 —— 该节标题下已带「已被取代 · 原文保留」标注 ⇒ §13 全节一字不改。**

- **不动清单（历史区 · 旧名原样保留；行号以现读为准）**：**§13** 的 **6 行**旧词行（`617` §13-1 换算常量表 / `624` §13-1 换算条 / `647` §13-4 类型分组 / `664` §13-5 溢出表 / `667` §13-5 渲染句式 / `678` §13-6 层内标题）；**§14-7** 表引述 §13 的那一格（`851`）；**§16-3** 的 3 行登记行（改名词对 / 现证命令 / 实测结论）；**§17-4** 自身的自指行（标题 + 现证命令字面 + 统计口径行）。
- **据此关闭**：**§16-3「本册现行区落点（11 处）」清单**与 **§17-4 末条**登记的「两读法冲突」⇒ **一律以本条为准**（§16-3 / §17-4 旧行**原文保留、不回改**）；§16-3 那份 11 处清单**降级为历史读数**。
- **一句话可改**：改本条一处（改 §13 归属须同步 §13 首行标注与 §17-4 ② 表）。

### 18-2 行内字面替换执行登记（**已授权 · 已落** · 逐行改前 / 改后）

**现状**：**现行区 4 行已就地替换 `标准石榴籽` → `石榴籽`**（**只改这 4 个字，同行其它字样一字未动**）：

| # | 行（**以现读为准**） | 所在节 | **改前** | **改后** |
|---|---|---|---|---|
| 1 | `743` | §14-1 换算常量表（`SEEDS_PER_ITEM` 行） | 含义列 = 「标准石榴籽：9999 颗 = 1 个道具」 | 含义列 = 「石榴籽：9999 颗 = 1 个道具」 |
| 2 | `750` | §14-1 第 1 条（1 格 = 1 道具） | 「`落点`：竹简 … 格、标准石榴籽 `floor(seeds_total / 9999)` 格」 | 「竹简 … 格、石榴籽 `floor(seeds_total / 9999)` 格」 |
| 3 | `755` | §14-1 第 6 条（默认序） | 「**默认序 = 竹简 → 石榴籽玉 → 标准石榴籽 → 碎片**」 | 「**默认序 = 竹简 → 石榴籽玉 → 石榴籽 → 碎片**」 |
| 4 | `1241` | §15-6 ③ 衔接表「默认序」行（§14 现状口径列） | 「**竹简 → 石榴籽玉 → 标准石榴籽 → 碎片**（`KIND_ORDER` 四值）」 | 「**竹简 → 石榴籽玉 → 石榴籽 → 碎片**（`KIND_ORDER` 四值）」 |

- **计数与形态**：4 行**均为行内替换** ⇒ `git diff --numstat` 对应 **4 删 / 4 增**（**本单的预期形态**；**不得为凑「0 删」而改写历史区**）。
- **现行区命中 = 0**：替换后 `grep -n "标准石榴籽" docs/economy.spec.md` 的**全部剩余命中均落在历史区 / 登记行**（= 上条「不动清单」所列；**命中行号与计数一律以该命令的实际输出为准**）。
- **§17-4 ③ 的旧约束**（「本轮**删除行必须为 0** ⇒ 行内字面**未**就地替换」）= **上一轮的约束**，**本单已授权变更**（该行**原文保留、不回改**）；本单口径见本节文首「删除纪律」。
- **一句话可改**：改本表「改后」列一处（回退须同步 `frontend/src/business/inventory.ts` 的 `seed` 显示名）。

### 18-3 五条字面待裁 · 裁定落位（**逐字**）

| # | 待裁项 | **裁定（逐字）** | 落位 / 依据 |
|---|---|---|---|
| ① | `FriendRel.reward_months` 的字段名（语义已变） | **保留现有字段名 `reward_months`**（**不改名**）；**语义 = 累计成功续约次数**（**已由实现固定**） | 跨册 = `docs/friend-domain.spec.md` §7-1 字段表继续有效 + 该册 **§18-1** |
| ② | 关系**终态**取值字面 | **`dissolved`** | 旧拟定字面**原文保留、不回改**；跨册 = `docs/friend-domain.spec.md` §18-1 |
| ③ | 奖励**批次来源**字面 | **`friend_reward`**（常量 **`SOURCE_FRIEND_REWARD`**） | 跨册 = `docs/friend-domain.spec.md` §9-2 两行 + 该册 **§18-1** |
| ④ | `jiazu_friends._id` 的**连接符** + **参与方字段名** | **一律以实现为准**（**现证照拄**，见 §18-3-附）：`_id` = **双方手机号升序、半角冒号 `:` 连接**；参与方字段名 = **`a_phone` / `b_phone`** | 现证 = §18-3-附（**以命令实际输出为准**）；跨册 = `docs/friend-domain.spec.md` §17-9 第 4 项 ⇒ **已关闭** |
| ⑤ | `docs/economy-fee.spec.md` §3-1 #37 的**路由字面** | **保持「以实现为准」**（**正确作法** —— **该路由尚未建**） | **本单禁改 `docs/economy-fee.spec.md`** ⇒ 只在本行**登记该口径成立**，不落该册 |

#### 18-3-附 `relationIdOf` 与关系文档字段 · 现证照拄（**逐字**）

现证命令：`grep -n -A 6 "export function relationIdOf" cloudfunctions/compat-api/lib/friends.js`（**输出逐字照拄 · 以命令的实际输出为准**）：

```js
export function relationIdOf(phoneA, phoneB) {
  const x = normPhone(phoneA);
  const y = normPhone(phoneB);
  if (!x || !y) return '';
  return x <= y ? `${x}:${y}` : `${y}:${x}`;
}
```

- ⇒ **连接符 = 半角冒号 `:`**；**参与方字段名 = `a_phone` / `b_phone`**（**升序**：`a_phone` 为字典序较小者 —— 同文件 `createInvite` 内 `const a = from <= to ? from : to;` **照拄**）；**非法手机号 ⇒ 返 `''`**。`docs/friend-domain.spec.md` §17-1 拟定示形里的 **`phone_a` / `phone_b`** 与「**连接符字面未裁**」表述 ⇒ **一律以实现为准**（该册旧行**原文保留、不回改**）。
- **关系文档字段清单（现证照拄 · 以源码实际输出为准）**：`_id` / `version` / `a_phone` / `b_phone` / `status` / `created_at` / `expires_at` / `reward_months` / `renewals` / `pending` / `history` ＋ `grace_until` ＋ `reason` ＋（`kind = renew` 时）`pending.locked_by` / `pending.locked_pieces` / `pending.locked_lot_id` / `pending.locked_at`。现证命令（**以实际输出为准**）：`sed -n '30,36p' cloudfunctions/compat-api/lib/friends.js`。
- **不得据本节**改写 §17-1 / §7-1 / §6-3 任何既有行（**旧行原文保留**）。

### 18-4 D2 口径澄清（兰帖「格数 / 枚数」· **落点索引**）

- **落点**：**§14-13**（全表 · 四条口径 + 实测例 + 禁止写法）与 **§15-6 ④**（§15 侧同一落点）。
- **结论（逐字）**：① **格数 = 2 整格 + 1 余数格 = 3 格**；② **枚数 = 2**（250 片之例）；③ **`scrolls_item_count` 的口径 = 枚数**（**措辞不得写成格数**）；④ **展示层用的是格数**。
- **来源与责任**：该结论由**独立质检实测提出**；**派单方早期写错的期望值（250 片 ⇒ 2 格）不当作任何一方的错**。
- **一句话可改**：改 §14-13 表 ③ 一处（须同步 §15-6 ④）。

### 18-5 追认实现选择：续约「对方拒绝」与「发起方撤回」**共用 `renewCancel`**（+ 两条新错误码）

- **追认口径（逐字）**：**「对方拒绝」与「发起方撤回」共用同一个函数 `renewCancel`**，**以 `reason` 区分**（**发起方撤回 = `renew_cancelled`**、**对方拒绝 = `renew_rejected`**）；**不新增 `renewReject` 函数**（**不存在第二个入口**）⇒ **追认并登记**。
- **行为边界（照拄）**：调用后**解锁**（清空 `pending`）、**不产生任何流水**（返回值**不含 `deduct`**）、**不改 `expires_at`**；**发起方与对方均可调用**；第三方 ⇒ `FRIEND_NOT_PARTY`（409）；无待确认续约申请 ⇒ `FRIEND_STATE_INVALID`。
- **两条新错误码登记（均 409）**：

| 错误码 | HTTP | 含义（逐字） |
|---|---|---|
| `RENEW_ALREADY_PENDING` | **409** | **已有 `pending` 续约申请时二次发起**的结构化拒绝 |
| `RENEW_SELF_CONFIRM` | **409** | 续约**须由关系另一方确认**，**发起方不能自己确认** |

- **现证命令**（**以命令的实际输出为准**）：`grep -n "renewCancel\|RENEW_ALREADY_PENDING\|RENEW_SELF_CONFIRM\|renew_rejected\|renew_cancelled" cloudfunctions/compat-api/lib/friends.js`。
- **一句话可改**：改本条一处（拆分函数须同步 `lib/friends.js` 的导出清单与 `docs/friend-domain.spec.md` §18-2）。

### 18-6 本节未做项

- **未改任何代码** / 配置 / `migrate-output` / `config`；**未跑测试 / 未跑构建 / 未打包 / 未部署 / 未上传 / 未重传 / 未 commit / 未 push**。
- **未改 §1–§17 任何既有行**（**唯 §18-2 列明的 4 处现行区行内字面替换**）；**历史区删除 / 改写行 = 0**。
- **未改** `AGENTS.md` / `docs/PENDING_DEPLOY.md` / `docs/economy-fee.spec.md` / `docs/task-center.spec.md`（本单禁改）。
- **未写任何实现现状读数**；凡引用数值 / 字段 / 字面**一律以对应命令的实际输出为准**；行号**以现读为准**。

---

## 19. 追记批 v7（**2026-09-25** · **Kevin 当面裁定 / 指令 2 条** + **独立质检批次发现 2 条**）（**只追加 · 不改 §1–§18 任何历史行 · 删除行 = 0**）

> **性质（制度员 · 2026-09-25 · 只追加）**：本节**只追加** —— 本册 **§1–§18 的既有行一律原文保留、一字不改、一行不删**；凡被本节取代者，**只在本节新写的行里标『已取代』并写明取代者与裁定人 / 日期**。
> **本批两源**：① **Kevin 今日当面给定**：行囊**默认序变更**（**取代 Z-9**）+ 物品**显示名改名**；② **独立质检批次**实测发现两条（**D-1** 真缺陷已裁定、**D-2** 接线缺口已裁定）。
> **阅读纪律**：与本节冲突处**一律以本节为准**（本节 = **后发的已裁口径**）；**本节不适用于仍未裁项**。
> **数值纪律**：本节**不写任何实现现状读数**（行数 / 测试条数 / 构建字节 / 枚数 / 占格数一律不写）；凡引用常量 / 字段 / 文案 / 路由，**一律以对应命令（`grep` / 源码现证）的实际输出为准**；行号**以你现读为准**。

### 19-1 【Kevin 当面裁定 · 2026-09-25】行囊默认序**改定**：竹简 → 兰帖 → 兰帖残页 → 石榴籽玉 → 石榴籽 → 石榴籽碎片（**取代 Z-9 的默认序**）

| 项 | 现行口径（逐字） |
|---|---|
| **默认序（现行 · 新）** | **竹简 → 兰帖 → 兰帖残页 → 石榴籽玉 → 石榴籽 → 石榴籽碎片**（`KIND_ORDER` **六值** · **位次重排**）—— **成品兰帖紧随竹简**；**「兰帖残页」紧随「兰帖」**（成品与其残页相邻）；**石榴籽玉 → 石榴籽 → 石榴籽碎片 依次收在其后** |
| **裁定人 / 日期** | **Kevin · 当面裁定 · 2026-09-25** |
| **取代者** | **本册 §19-1**（＋ `docs/friend-domain.spec.md` **§21-1** 的同口径登记） |
| **被取代的旧行（标『已取代』· 原文保留 · 一行不删）** | **§14-6-附** 表「**默认序（插两品类后）**」行与 **§17-1** 表「**默认序（插两品类后）**」行 —— 两行原字面均为 **「竹简 → 兰帖 → 石榴籽玉 → 石榴籽 → 兰帖碎片 → 石榴籽碎片」** ⇒ **已取代**（**其内「兰帖碎片」一词另按 §19-3 读作「兰帖残页」**） |
| **继续有效（本批未变）** | §14-1 第 6 条的**同类内排序口径**（到期近的在前 / 永久玉在该类最后 / 余数格排该类最后 / 同到期以稳定 id 兜底）；**§14 其余各条不变**；**§15-6 其余各行不变** |
| **一句话可改** | 改本节表「**默认序（现行 · 新）**」一行一处（须同步 `KIND_ORDER` 常量及其注释） |

### 19-2 【口径 · 硬】行囊**溢出提示行的类型序 = 另一份清单 · 不同源 · 本批不变**

| 项 | 现行口径（逐字） |
|---|---|
| **溢出提示行类型序（现行 · 本批不变）** | **玉 → 竹简 → 兰帖 → 籽 → 兰帖残页 → 石榴籽碎片**（**玉优先**：**玉行恒在最前**） |
| **与默认序的关系** | **两份清单 · 不同源**：**默认序** = §19-1 的**六值序**；**溢出行** = 本节的**另一份序**（`OVERFLOW_KIND_ORDER`）—— 两表内容不同属**既裁形态**，**不得互推、不得据其一改其二** |
| **本批处置** | **不变**（Kevin 今日**只改默认序**，未改溢出行序） |
| **两表是否对齐** | **= Kevin 一句话可改**（**当前不对齐属已裁形态**）；若对齐，须同步 `KIND_ORDER` 与 `OVERFLOW_KIND_ORDER` **两处常量**及其注释 / 文件头注释 |
| **是否取代旧行** | **不取代** —— §14-6-附 / §17-1 的「**逐类提示行类型序**」两行**继续有效**（唯其中「兰帖碎片」按 §19-3 读作「兰帖残页」） |

### 19-3 【Kevin 当面指令 · 2026-09-25】物品**显示名**改名：「兰帖碎片」→「**兰帖残页**」

| 项 | 口径（逐字） |
|---|---|
| **改名（逐字）** | 显示名 **「兰帖碎片」→「兰帖残页」**（**Kevin 今日当面指令**） |
| **只改显示名（硬）** | **字段名 `scroll_fragments` 一字不动**；**接口入参 / 出参（键名与形状）一字不动**；**不新增字段 / 不改存储形态 / 不改上限与自动合成口径**（**上限与满额自动合成的既有行继续有效**，仅**显示名词形**更新） |
| **先例（同型处置）** | **`标准石榴籽` → `石榴籽`**（§16-3 文案统一 + §17-4 行级改写执行登记 + §18-1 归属裁定）：**现行区就地替换、历史区原文保留** |
| **本册读法（明文 · 一行）** | **本册现行区**凡出现「**兰帖碎片**」者**一律读作「兰帖残页」**；**历史区**（含 §14 / §15 / §16 / §17 / §18 各表原文行）**一律原文保留、一字不改、一行不删**（体例承 §18-1） |
| **落点（不改写既有行）** | 本单**不做行级就地替换**（与「**只追加 · 删除行 = 0**」硬口径一致）；如需**行级逐处替换登记**，由**收口单**另开一节（体例同 §18-2） |
| **一句话可改** | 改本节「**改名（逐字）**」一行一处（须同步前端**文案单点**，**以现证代码的实际输出为准**） |

### 19-4 【Kevin 当面给定 · 2026-09-25】六句诗句入册（**逐字 · 一字不改**）· 展示位置 = **道具属性提示层内**

| 物品（显示名） | 诗句（**逐字**） |
|---|---|
| 竹简 | 书于简策，以诏子孙，敦睦九族。——古·佚名 |
| 兰帖 | 金兰幸有同心契，莫负山中一段香。——明·唐寅《题画》 |
| 兰帖残页 | 用证兰盟，互通芳谱。——古·佚名 |
| 石榴籽玉 | 五龙一门，金友玉昆。——魏晋·无名氏《秦雍为辛氏语》 |
| 石榴籽 | 榴枝婀娜榴实繁，榴膜轻明榴子鲜。——唐·李商隐《石榴》 |
| 石榴籽碎片 | 千房同膜，千子如一。——西晋·潘尼《安石榴赋》 |

- **展示位置（逐字）**：**道具属性提示层内**（即 §14 既有的属性提示层；**层位 / `z-index` / 关闭路径口径不变**，见 §14-3 / §14-9）。
- **适用范围**：上表**六类物品**各一行诗句；**文案单点纪律不变**（§13-8 / §16-3：**单点 + 已登记例外**）。
- **纪律**：诗句**逐字入册，一字不改**（**不得**改写标点 / 出处 / 作者朝代）。
- **落点**：诗句的**代码落点与渲染形态**（组件 / 文案单点 / 行数）**以现证代码的实际输出为准**，本册**不预填**；**本单未改任何代码**。
- **一句话可改**：改本节表内一行一处（诗句逐字，**换行 / 出处不得改写**）。

### 19-5 【独立质检 · **D-1** · 已认定真缺陷 · 后端硬口径】`POST /assets/scroll/decompose` **必须校验续约锁定**

| 项 | 口径（逐字） |
|---|---|
| **现象（质检实测）** | 该路由**原不校验续约锁定** ⇒ **前端置灰可被 `curl` 绕过**：锁定只写**关系文档 `pending`**（**只占用、不扣除**），那 1 枚**仍在账本里** ⇒ **锁定中的兰帖可被直接分解**，对方确认续约时**双边预检必然不足**（续约作废） |
| **裁定（硬）** | **锁定必须在后端拦** —— **不得只靠前端置灰**：「前端置灰 / 按钮不可点」**只是可见性提示，不构成守卫**；任何以「前端已置灰」为由**放过后端校验**的写法**一律判负** |
| **可分解枚数（派生口径 · 现行）** | **可分解枚数 = `floor((总片数 − 未超期锁定片数) / 100)`** —— **只有「未超期」的锁定占用可分解额度**（TTL 内、`pending` 未清者）；**已超期 / 已被 sweep 清掉的 `pending` 不得占用额度**（**锁随 `pending` 消失**，解锁**不产生任何流水**） |
| **不足时形态** | 按**既有错误码族**结构化拒绝（**具体错误码 / HTTP 以实现者报告为准**，本册**不预填**）；**不得**静默失败 |
| **落点** | **后端**：分解路由的账本调用链须加载关系侧锁定信息（路由注册段见 `docs/friend-domain.spec.md` §19-1）；**前端**：§14 行囊兰帖格**只展示**该派生额度（**不得**作为唯一守卫） |
| **实现报告状态** | **待回填** —— 本单落盘时**实现者报告尚未到** ⇒ 本节按上述**逐字落**；**函数 / 参数 / 错误码 / 测试以实现者报告逐字为准**（**待实现报告回填逐字**）；本册**不预判实现形态** |
| **一句话可改** | 改本节「**可分解枚数（派生口径 · 现行）**」一行一处（须同步**后端扣减守卫**与**前端展示口径**两处） |

### 19-6 【独立质检 · **D-2** · 接线缺口】奖励池分发 `distributeFriendRewards` 经**批 3 任务中心领取**接线

| 项 | 口径 |
|---|---|
| **现象（质检实测）** | `distributeFriendRewards` **曾无任何路由入口**（全仓**仅测试可达**）⇒ 奖励池分发**在本阶段不可达** |
| **裁定 / 处置** | **批 3 经任务中心领取接线**（用户侧可达路径 = **任务中心**）—— **不新建第二套分发实现**，**复用既有 `distributeFriendRewards`** |
| **任务域口径（待回填）** | **三条任务 / 每日北京自然日日期串 / 手动领取 / 奖励数值 / 幂等（与既有签到共用 `signin_date`、不双发）** —— **以实现者报告逐字为准**（**待实现报告回填逐字**）；本册**不预填**任何任务条数 / 数值 / 字段名 / 路由字面 |
| **与既有已裁口径的关系** | §17-3（`Tx.delta` **允许**扩展）与 `docs/friend-domain.spec.md` **§17-9-C-10b**（**平台活动范围 = 任务中心（批 3）**）**继续有效**；本单**同口径登记于 `docs/friend-domain.spec.md` §21-4** |
| **一句话可改** | 改本节「**裁定 / 处置**」一行一处（须同步**任务中心册**与**路由注册段**两处） |

### 19-7 【未决清单（本册径内）· 承 §14-8 / §18-6】

> **完整未决清单**（逐条）另见 `docs/friend-domain.spec.md` **§21-6**（**本批更新版**）；本节只列**与本册径直接相关**者。

| # | 未决 / 未做项 | 说明 |
|---|---|---|
| 1 | **小程序真机实测** | **未做**（承 §14-8 #1 / §13-9 #1，**不变**；行囊展示层的微信真机路径**未验**） |
| 2 | **市集域兰帖商品扩展** | **未做**（**Z-6**：兰帖本轮**不可交易 / 不可转赠**；承 §17-2） |
| 3 | **云端 TCB 行为与重打包** | **未做**（本批**只做本地阶段**：**未验云端行为 / 未重打包 / 未上传 / 未部署**） |
| 4 | **A-5 隐私扫描 / A-6 终态不可逆** | **路由级反证未取证** ⇒ **只称「静态护卫存在」**（脱敏投影 / 终态守卫），**不得写成「已验」** |

### 19-8 本节未做项

- **未改任何代码** / 配置 / `migrate-output` / `config`；**未跑测试 / 未跑构建 / 未打包 / 未部署 / 未上传 / 未重传 / 未 commit / 未 push**。
- **本册 §1–§18**：**删除行 = 0**；**未改写任何历史行**（本批改动 = **纯追加**；§19-1 的「已取代」标注为**表外追加行**，被取代的旧行**一字未动**）。
- **未改** `AGENTS.md` / `docs/PENDING_DEPLOY.md`（本单禁改）。
- **未写任何实现现状读数**；凡引用常量 / 字段 / 路由 / 文案**一律以对应命令的实际输出为准**；行号**以你现读为准**。

---

## 20. 收口批 v8（**2026-09-25** · **回填 D-1 / D-2 实现逐字** + **三条已裁口径** + **两条工程纪律**）（**只追加 · 不改 §1–§19 任何历史行 · 删除行 = 0**）

> **性质（制度员 · 2026-09-25 · 只追加）**：本节**只追加** —— 本册 **§1–§19 的既有行一律原文保留、一字不改、一行不删**；凡被本节取代者，**只在本节新写的行里标『已取代 / 已回填』并写明取代者或落点**。
> **本批四件**：① 回填 §19-5（D-1）/ §19-6（D-2）标注为「**待回填**」的实现逐字（= §20-1 / §20-2）+ 「**`nowMs` 响应式化**」修法落点（= 跨册 `docs/friend-domain.spec.md` **§22-3**，本册只作**一句跨册登记**）+ 「**兰帖残页**」行级字面替换登记（= §20-3）；② 登记三条已裁口径（§20-4 / §20-5 / §20-6）；③ 登记两条工程纪律（§20-7 / §20-8）；④ 更新未决清单（§20-9，完整清单跨册 `docs/friend-domain.spec.md` **§22-6**）。
> **阅读纪律**：与本节冲突处**一律以本节为准**（本节 = **后发的已裁口径**）；**本节不适用于仍未裁项**。§19-5 / §19-6 内的「**待回填**」标注**原文保留、不回改**（其回填内容 = 本节 §20-1 / §20-2）。
> **数值纪律**：本节**不写任何实现现状读数**（行数 / 测试条数 / 构建字节 / 枚数 / 占格数 / 注册页数一律不写）；凡引用常量 / 字段 / 文案 / 路由 / 函数名，**一律以对应命令（`grep` / 源码现证）的实际输出为准**；行号**以你现读为准**。

### 20-1 【回填】D-1 实现逐字（承 §19-5「待回填」· **口径真源 = §19-5，本节只补实现字面**）

现证命令（**以下引用一律以该命令的实际输出为准**）：
`grep -rn "lockedScrollPieces\|SCROLL_LOCKED_INSUFFICIENT\|SCROLL_LOCKED_CHECK_FAILED" cloudfunctions/ frontend/src`

| 项 | 实现逐字（**以现证代码的实际输出为准**） |
|---|---|
| **锁定读数函数（函数名 / 参数）** | **`lockedScrollPieces(phone, now = new Date())`** —— 导出位置 = `cloudfunctions/compat-api/lib/friend-ops.js`；**入参 = `(phone, now)`**（`now` 可省，缺省 `new Date()`）；**只读、零写入** |
| **返回形状** | **`{ pieces, locks }`** —— `pieces` = 本人**未超期**续约锁定的**片数合计**；`locks[] = { relation_token, pieces }`（**出参只给 `relation_token`**，不给关系内明文手机号） |
| **判定三条** | 只计 **`pending.kind === 'renew'`** 且 **`pending.locked_by === 本人`**（对方发起的锁不计）且 **`locked_pieces > 0`** 者 |
| **超期锁如何不计** | 函数体先 `listRelations(me, { now })` ⇒ **内存 sweep 已把超期 `pending` 清空** ⇒ **不计入**（解锁不产生任何流水；与 §19-5「锁随 `pending` 消失」同口径） |
| **是否在资产事务内** | **是** —— 走 **`withAssets(me, …)`**（**同一把锁**）；此为「锁定读与扣减同锁」的守卫（残余窗口另见 §20-6） |
| **路由调用点** | `cloudfunctions/compat-api/index.js` 的 `POST /assets/scroll/decompose` 段：`locked = await friendOps.lockedScrollPieces(u.phone, now)` —— 位于 `ledger.mutateAssets` **之前**的只读预检位（行号**以你现读为准**） |
| **capacity 公式（逐字 · 三行）** | **`lockedPieces = Math.max(0, Math.floor(Number(locked?.pieces) \|\| 0))`**；**`availablePieces = Math.max(0, totalPieces − lockedPieces)`**；**`capacity = Math.floor(availablePieces / ledger.SCROLL_PIECES_PER_SCROLL)`**；判据 **`if (count > capacity)`** |
| **超限错误码（逐字）** | **`SCROLL_LOCKED_INSUFFICIENT`** —— **HTTP 409**；`error.detail = { total_pieces, locked_pieces, available_pieces, capacity, requested }`；文案为**整单拒绝**口径（**一片不扣**） |
| **读锁失败错误码（逐字）** | **`SCROLL_LOCKED_CHECK_FAILED`** —— **HTTP 409**，文案 = 「**无法校验续约锁定状态，请稍后重试**」；语义 = **失败关闭**（宁可拒分解，也不放行可能被锁定的那 1 枚）；**系统级失败例外**：`isSystemFailure` ⇒ 500 `INTERNAL_ERROR` |
| **前端只读展示** | `frontend/src/components/asset-inventory/asset-inventory.vue` 的 `lockedScrollPieces` 计算属性 + 由它派生的可分解枚数（按 `props.scrollLock?.pieces` 折算）—— **只展示，不得作为唯一守卫**（§19-5 继续有效） |
| **测试落点** | `cloudfunctions/compat-api/lib/task-center.test.js`（**D-1 单元面 + 路由面**）；**条数以该文件的实际输出为准** |
| **一句话可改** | 改 §19-5「**可分解枚数（派生口径 · 现行）**」一行一处（须同步上表 capacity 三行 + 前端展示口径） |

### 20-2 【回填】D-2 任务中心实现逐字（承 §19-6「待回填」· **口径真源 = §19-6，本节只补实现字面**）

现证命令（**以下引用一律以该命令的实际输出为准**）：
`grep -n "tasks/today\|tasks/claim\|claimTask\|idempotency_key" cloudfunctions/compat-api/index.js cloudfunctions/compat-api/lib/task-center.js`

| 项 | 实现逐字（**以现证代码的实际输出为准**） |
|---|---|
| **三条任务枚举名（逐字）** | **`signin`**（每日签到）/ **`invite`**（邀请新用户注册）/ **`write`**（平台写操作）—— 常量 **`TASK_IDS.{SIGNIN,INVITE,WRITE}`**，导出位置 = `cloudfunctions/compat-api/lib/task-center.js` |
| **每日北京自然日日期串（唯一口径）** | **`beijingDate(date)`**（导出位置 = `cloudfunctions/compat-api/lib/economy-ledger.js`；**北京时间 UTC+8 自然日 `YYYY-MM-DD`**）；**无定时任务、不依赖零点整**（源码无任何定时器） |
| **两条路由（逐字）** | **`GET /tasks/today`**（当日三任务三态 + 奖励口径；**只读、零写入、不 sweep**）/ **`POST /tasks/claim` `{ task }`**（**唯一发奖入口**，手动领取；`task ∈ signin / invite / write`）；注册段见 `cloudfunctions/compat-api/index.js` |
| **三态取值 / 中文（逐字）** | `not_achieved` = 「**未达标**」/ `claimable` = 「**可领取**」/ `claimed` = 「**已领取**」（常量 `TASK_STATE` / `TASK_STATE_TEXT`）；**不得静默失败**（未达标 / 不可领一律给 `blocked_reason`）。⚠️ **签到任务的形态另见 §20-4** |
| **奖励数值（逐字）** | `DAILY_TASK_REWARD = { base: { seed_fragments: 1, bamboo_pieces: 1 }, pool: { seed_fragments: 1, scroll_fragments: 1 } }` —— **`base` = 触发者本人**；**`pool` = 按领取时刻快照的生效好友数均分**（`floor(pool[键] / 分母)`，**余数销毁**；**分母 0 ⇒ 不建池、不写池流水**）；**触发者不参与池分配** |
| **幂等键（逐字）** | **`idempotency_key = \`${me}:${day}:${id}\``** —— 即 **手机号 + 自然日 + 任务**；池流水侧字段名 = **`ref.grant_key`**（常量 `REWARD_GRANT_KEY`）；语义 = 「**这一次**分发」；**收件人在其自身事务内按账本自证判重**，已有 ⇒ **跳过入账**（不重复发、不重复写流水，`replayed: true` 并回显既有 `tx_id`） |
| **达标判据（逐字）** | `signin` = **`user.signin_date === beijingDate(now)`**；`invite` = **当日 `countInviteRewardsToday > 0`**（`Tx.type='reward'` 且 `ref.kind='invite'`）；`write` = 当日一条 **`WRITE_TX_TYPES`**（`edit_fee` / `delete_fee` / `move_fee` / `tree_create`）内的**成功**流水 —— **均为既有枚举，本单不新增** |
| **领取标记字段（逐字）** | `invite` / `write` = 资产记录内 **`task_claims[任务名] = 当日日期串`**（常量 `CLAIMS_FIELD = 'task_claims'`）；**`signin` 不写此字段**（共用 `signin_date`，见 §20-4） |
| **错误码（逐字）** | `TASK_INVALID_PHONE` **400** / `TASK_UNKNOWN` **400** / `TASK_NOT_ACHIEVED` **409** / `TASK_ALREADY_CLAIMED` **409** / `TASK_REWARD_FAILED` **409** |
| **补偿路径已删除（逐字）** | 旧口径「先打标 → 再发奖 → 失败撤销打标」的 **`rollbackClaim` 已删除、无调用点**（保留注释以便追溯）—— 序列改定后（§20-5）**结构上不再需要撤标** |
| **与 §19-6 的关系** | §19-6 的**裁定与口径**（批 3 经任务中心领取接线、复用既有 `distributeFriendRewards`、不新建第二套分发实现）**一字未变**；本节只是把该节标注「待回填」的**实现字面**补齐 |
| **一句话可改** | 改 §19-6「**裁定 / 处置**」一行一处（须同步 `lib/task-center.js` 与路由注册段两处） |

### 20-3 【回填】「兰帖残页」**行级字面替换登记**（承 §19-3「落点」· 体例同 §18-2）

现证命令（**以下引用一律以该命令的实际输出为准**）：
① `grep -n "SCROLL_FRAGMENT_NAME" frontend/src/business/asset-text.ts`；
② `git diff -U0 -- frontend/src cloudfunctions/compat-api | grep "^-.*兰帖碎片"`（**用于判定是否存在「行内替换」**）；
③ `grep -rn "兰帖碎片\|兰帖残页" frontend/src cloudfunctions/compat-api/lib`（**现存命中计数**）。

| 项 | 登记（逐字 · **以现证命令的实际输出为准**） |
|---|---|
| **文案单点（唯一真源）** | `frontend/src/business/asset-text.ts` 的 **`export const SCROLL_FRAGMENT_NAME = '兰帖残页';`** —— 页面 / 组件可见文案的**唯一来源**；该文件头注释逐字写明「**2026-09-25 更名**：显示名『兰帖碎片』→『兰帖残页』（Kevin 当面给定）；字段名 `scroll_fragments` 与接口入出参**一字未动**」 |
| **行内替换 = 哪一处** | **改后字面所在行 = 上述 `SCROLL_FRAGMENT_NAME` 常量行**（**位置：该文件「兰帖残页：展示名（逐字；单点）」注释块 + 常量行**；行号**以你现读为准**） |
| **是否存在「旧行就地替换」** | **否** —— 现证②（`git diff` 全量筛 `兰帖碎片` 的删除行）**输出为空** ⇒ 本批**未改动任何既有的「兰帖碎片」行**（**删除行 = 0** 的代码侧同形）；上表常量行位于**本批新增文件**内（**整文件新增** ⇒ 非行内替换） |
| **现存命中（两类字面并存 · 属既裁形态）** | ① **「兰帖残页」**：新增文件的**展示文案与业务文案**（文案单点 / 账本 desc / 邀约奖励说明等）；② **「兰帖碎片」**：**既有注释 / 字段说明行**（类型定义、图标注释、`friends.ts` 的返还数量注释、行囊组件注释等）—— **一概原文保留、不回改**（**命中文件与条数以现证③的实际输出为准**，本册**不写读数**） |
| **读法（明文 · 承 §19-3）** | **本册现行区**凡出现「**兰帖碎片**」者**一律读作「兰帖残页」**；**历史区**（§14 / §15 / §16 / §17 / §18 / §19 各表原文行）**一律原文保留、一字不改、一行不删** |
| **只改显示名（硬 · 继续有效）** | 字段名 `scroll_fragments` 一字不动；接口入参 / 出参（键名与形状）一字不动；**不新增字段 / 不改存储形态 / 不改上限与自动合成口径** |
| **一句话可改** | 改 §19-3「**改名（逐字）**」一行一处（须同步**文案单点** `frontend/src/business/asset-text.ts`，**以现证代码的实际输出为准**） |

### 20-4 【已裁 · 硬】① **签到任务无「未达标」态**（与既有签到卡**共用同一自然日判定 `signin_date`**、**绝不双发**）

| 项 | 口径（逐字） |
|---|---|
| **裁定（硬）** | **签到任务与既有签到卡共用同一自然日判定（`signin_date`）** —— **绝不双发**；**签到卡的「已领取」标记就是 `signin_date`**，**不为 `signin` 另建第二套标记 / 第二套数值** |
| **签到卡已改为调同一入口** | `cloudfunctions/compat-api/index.js` 的 `POST /assets/signin` 段改为调用 **`tc.claimTask(u.phone, 'signin', new Date())`**（**唯一入口**；行号**以你现读为准**）；**出参形状逐字保留**（**以该段现证代码的实际输出为准**），**前端零改** |
| **可见态（逐字）** | 签到可见态**仅「可领取 / 已领取」** —— 判据 `claimable = !claimed`（`signin` 分支**不再要求 `achieved`**）；⇒ **「达标但未领取」对签到不可达**（`not_achieved` 对 `signin` **结构性不可达**） |
| **为什么** | 对 `signin` 而言「**达标（已签到）**」与「**已领取**」是**同一事件的两个名字**（调用签到卡或 `POST /tasks/claim {task:'signin'}` 都是「完成签到 + 领奖」）⇒ 三态退化为两态 |
| **与 §20-2 的关系** | §20-2 的**三态表**适用于 `invite` / `write` 两条（**三态齐备**）；`signin` 取本节两态口径 —— **本节为后发已裁口径**，冲突处**以本节为准** |
| **并发双领的最后一道闸** | 同一 `withAssets` 事务内**锁内复核** `claimGateOf`（已领 ⇒ 409 `TASK_ALREADY_CLAIMED`）—— 见 §20-5 |
| **一句话可改** | 改本节「**可见态（逐字）**」一行一处（须同步 `lib/task-center.js` 的 `taskViewOf` 与前端任务卡两处） |

### 20-5 【已裁】② **领取幂等实现序列**（**以实现者报告为准** · 三阶段逐字）

| 阶段 | 实现逐字（**以现证代码 / 实现者报告的实际输出为准**） |
|---|---|
| **⓪ 只读预检** | `getAssets` 快照 + `claimGateOf`：**未达标 / 已领取 ⇒ 立刻结构化拒绝，零写入** |
| **① 池分发** | **唯一入口 = `friend-ops.distributeFriendRewards`**（`base: null` ⇒ **不在那里发基础奖励**）；**幂等键 = `idempotency_key = \`${me}:${day}:${id}\``**（= **手机号 : 自然日 : 任务**）；**收件人按账本自证判重跳过**（不重复发、不重复写流水）；失败 ⇒ `TASK_REWARD_FAILED`（**此刻本人零写入、零打标** ⇒ **领取天然可重试、无悬空标记**） |
| **② 「打标 + 基础奖励入账」同一次事务** | **打标 + 基础奖励入账 = 同一 `withAssets` 事务**（**锁内入口名以实现为准**；本册**不预填**函数字面）；锁内**复核**幂等 / 达标（**并发双领的最后一道闸**）⇒ 打标（`signin` 写共用 `signin_date` + 既有枚举 `signin` 审计条；`invite` / `write` 写 `task_claims[任务]`）+ 基础奖励逐键入账（一条既有枚举 `reward` 流水）—— **原子提交 / 原子回滚** ⇒ **不存在「基础已入账但未打标」**；重试**绝不会二次入账**基础奖励；失败 ⇒ `TASK_REWARD_FAILED`（零写入）；**锁内复核失败 ⇒ 原样抛 409**（`TASK_ALREADY_CLAIMED` / `TASK_NOT_ACHIEVED`，**错误码与文案逐字保留**） |
| **③ 领取后读数** | 重读资产，出参含 `task / title / day / state / state_text / claimed_at / achieved / signin_date / reward / detail / tasks`（**供 `/assets/signin` 兼容出参**） |
| **⭐ 裁定理由（逐字 · 必须登记）** | **不采用「把跨用户池写入塞进触发者事务」** —— 池写的是**他人**资产（各自 `withAssets`），**若塞进触发者锁内会造成 A↔B 互锁死锁** ⇒ **故不采用**；池的幂等**改由幂等键保证**（非靠同锁） |
| **旧口径的处置** | 旧口径「先打标 → 再发奖 → 失败撤销打标」**已废止**（`rollbackClaim` 已删除）；其缺陷（「基础已入账、池分发中途失败」窗口内重试**重复入账一次基础奖励**）**在结构上消失** |
| **一句话可改** | 改本节「**②**」一行一处（须同步 `lib/task-center.js` 的 `claimTask` 与 `lib/friend-ops.js` 的 `distributeFriendRewards` 两处） |

### 20-6 【已裁】③ **TOCTOU 残余已接受**（`POST /assets/scroll/decompose` 的「锁定读 → 扣减」分处两次资产事务）

| 项 | 口径（逐字） |
|---|---|
| **残余（逐字）** | `POST /assets/scroll/decompose` 的「**锁定读**（`lockedScrollPieces`，自有 `withAssets`）」与「**扣减**（`ledger.mutateAssets`）」**分处两次资产事务** ⇒ 两次之间**存在极小窗口**（TOCTOU） |
| **为什么没修** | **`cloudfunctions/compat-api/index.js` 冻结（本批未改该文件的路由实现）** ⇒ 合并不属本批范围 |
| **裁定（逐字）** | **已接受**（**残余风险登记在案，不作为缺陷、不得据以判实现负**） |
| **接受理由 = 兜底三道** | ① **确认时双边预检**（续约确认前两侧各自复核锁定与余额）；② **`chargeLots` 整单拒绝**（任一笔不足 ⇒ 整单拒绝，**不部分成交**）；③ **补偿回滚**（扣减失败即补偿；**补偿成功 ⇒ 关系文档零变更**，承 `docs/friend-domain.spec.md` §20-1） |
| **另一重理由** | **消除它需让账本域反向依赖好友域**（分解路由须要求账本调用链直连好友域锁定读数）⇒ **循环依赖风险**，**故不采用** |
| **与 §19-5 的关系** | §19-5 的**硬口径（锁定必须在后端拦、不得只靠前端置灰）一字未变**；本节只登记**残余窗口 + 接受理由 + 兜底三道** |
| **一句话可改** | 改本节「**裁定（逐字）**」一行一处（须同步 `index.js` 分解段的两次事务合并与 `lib/friend-ops.js` 的锁定读） |

### 20-7 【工程纪律 · 硬】主包字节纪律补漏：**子包化只适用于页面；被主包页面引用的组件必须留在主包**

| 项 | 口径（逐字） |
|---|---|
| **硬约束（微信）** | **主包页面不得引用分包内资源** ⇒ **子包化只适用于页面**；**被主包页面引用的组件必须留在主包**（**不得**随页面一并移入分包） |
| **推论（写清）** | **主包字节预算必须把「主包页引用的组件」计入不可移项** —— 预算核算时，该类组件**不得**按「可分包」计入可移总量 |
| **本批实测的不可移代价** | **不可移项 = 主包页引用的组件 + `frontend/src/business/tasks.ts`**（派单字面写作 `business/tasks.js`；**文件名以现证实际输出为准**，现证为 `tasks.ts`）⇒ **已裁接受**（**承认主包字节增长，不以迁包换取**） |
| **选项 B「tab2 改跳转」= 已否决** | **否决理由（逐字）= 改变 Kevin 明确要求的 tab 切换交互形态** ⇒ **不得**以「省主包字节」为由改交互形态（**交互形态优先于字节优化**） |
| **现证** | `frontend/src/pages.json` 的 `subPackages` 清单（**逐条以该文件的实际输出为准**，本册**不抄读数**）；被主包页引用的组件落点以 `frontend/src/pages/*` 与 `frontend/src/components/*` 的实际引用为准 |
| **一句话可改** | 改本节「**选项 B**」一行一处（须同步 `pages.json` 与相关页面跳转实现两处） |

### 20-8 【工程纪律 · 硬】**断言腐化**两类形态（**本批各现一例** · 判据与处置先例）

| # | 形态（逐字） | 本批处置（逐字） | 后续判据 / 先例 |
|---|---|---|---|
| **(a)** | **整文件文本判据被新注释里的集合字面撞红** —— 断言以「整文件包含某字面」为判据时，**新加的注释里出现同形集合字面**即**假红** | **改注释**（调整注释措辞，使其不含被断言的字面）—— **不得放宽断言**（**不得**改成 `includes` 之外的弱判据、**不得**删断言、**不得**改断言为「只查某段」以绕开） | **先例**：整文件文本判据遇假红 ⇒ **一律先改被断言侧的注释字面**；**改动方向恒为「让注释让路」，永不为「让断言让路」** |
| **(b)** | **硬编码注册数定额随新增测试文件变假红** —— 以「注册表条数 = 某个写死的数」为断言，**新增测试文件后条数变化**即成**假红** | **改真值**（把定额更新为现证真值）—— 但 **必须保留**：**等值断言 + 去重断言 + 双向零缺口断言全部保留**（**不得**为消红而降级为「只查数量」或删去去重 / 零缺口断言） | **先例**：注册表定额遇假红 ⇒ **改真值而非改形态**；**四类断言（等值 / 去重 / 双向零缺口 / 数量）中只允许动「数量」这一项的真值** |
| **共通判据** | 一律先判定「**是产品变了还是断言过严 / 过时**」：**产品未变而断言红 ⇒ 断言腐化**（**不得**据此判实现负） | 处置**只动断言侧 / 注释侧**；**不得**为消红改产品代码或放宽口径 | 本条**只登记先例与判据**，**不写任何测试条数读数**（**以对应命令的实际输出为准**） |

### 20-9 【未决清单（本册径内）· 承 §19-7】本批更新版

> **完整未决清单**（逐条）另见 `docs/friend-domain.spec.md` **§22-6**（**本批更新版**）；本节只列**与本册径直接相关**者。
> **本表取代 §19-7 的未决状态**（§19-7 原文保留、不回改）。

| # | 未决 / 未做项 | 说明 |
|---|---|---|
| 1 | **小程序真机实测** | **未做**（承 §19-7 #1，**不变**） |
| 2 | **市集域兰帖商品扩展** | **未做**（**Z-6**：兰帖**不可交易 / 不可转赠**；承 §19-7 #2） |
| 3 | **云端 TCB 行为与重打包** | **未做**（本批**只做本地阶段**：**未验云端行为 / 未重打包 / 未上传 / 未部署**；承 §19-7 #3） |
| 4 | 「**返还 N 个兰帖残页**」的**单位词**是否改「**张 / 片**」 | **未定 · Kevin 一句话可改**（现行字面 = 「**返还 N 个兰帖残页**」，**以 `cloudfunctions/compat-api/lib/economy-ledger.js` 现证的分解 desc 实际输出为准**；改则须同步**前端浮字 / 流水文案**两处） |
| 5 | **行囊溢出类型序与新默认序不同源，是否对齐** | **未定 · Kevin 一句话可改**（现行 = **两份清单不同源**：默认序 `KIND_ORDER` 六值 vs 溢出行 `OVERFLOW_KIND_ORDER`；见 §19-2「**= Kevin 一句话可改**」；改则须同步**两处常量**及其注释 / 文件头注释） |
| 6 | **A-5 隐私扫描 / A-6 终态不可逆** | **未取证** ⇒ **只称「静态护卫存在」**，**不得写成「已验」**（承 §19-7 #4） |

### 20-10 本节未做项

- **未改任何代码** / 配置 / `migrate-output` / `config`；**未跑测试 / 未跑构建 / 未打包 / 未部署 / 未上传 / 未重传 / 未 commit / 未 push**。
- **本册 §1–§19**：**删除行 = 0**；**未改写任何历史行**（本批改动 = **纯追加**；§19-5 / §19-6 内的「**待回填**」标注**原文保留、不回改**，其回填内容 = 本节 §20-1 / §20-2）。
- **未改** `AGENTS.md` / `docs/PENDING_DEPLOY.md` / `docs/economy-fee.spec.md`（本单禁改）。
- **未写任何实现现状读数**（行数 / 测试条数 / 构建字节 / 页数一律不写）；凡引用常量 / 字段 / 路由 / 函数名**一律以对应命令的实际输出为准**；行号**以你现读为准**。
- **跨册落点**：`nowMs` 响应式化修法与三条已裁口径的逐条登记 = `docs/friend-domain.spec.md` **§22**（同批）；本节 §20-4 / §20-5 / §20-6 为该册 §22-1 / §22-2 / §22-4 的**同口径登记**。
