# 时流子域 — 石榴籽玉 · 玉露灵泽 · 灵气状态机 规格（spirit-domain.spec.md）

> 状态：**设计待确认 Kevin 2026-09-16**
> 真源级别：本册是**时流子域**（石榴籽玉合成 / 分解 / 镶嵌 → 凹槽永久占用 → 玉露灵泽蓄能 → 灵气状态机）的唯一权威；
> **集合名、字段名、路由名与通用扣减算法以总册 `docs/economy.spec.md` 为准**，本册只展开时流子域相关字段与算法，不新造集合、不改总册字段名。
> **文案真源 = `docs/economy-ops.spec.md`**（§6.1 弹窗 4 条 + §6.2 站内信 4 条，共 8 条定稿）。本册 §6-5 / §8-3 是时流子域相关条目的**副本**，逐字引用（不得改写、不得增删标点或【】包裹词）；两册不一致时**一律以文案真源为准**。
> 逐字校验结果（2026-09-16）：本册 6 条文案副本与真源**字节级一致（6/6）**，明细见 §8-3 文末。
> 关联：`docs/economy.spec.md`（总册：存储契约与算法唯一权威）、`docs/economy-ops.spec.md`（站内信 / 签到 / 资产运维 / 全场景文案）、
> `docs/clan-tree.spec.md`（世本 / 祖谱 / 普通树三层结构）、`docs/founder-attach.spec.md`（镜像只读）、`docs/permission-tier.spec.md`（角色档位）、
> `docs/PENDING_DEPLOY.md`（部署清单）；
> 代码：`cloudfunctions/compat-api/lib/store.js`（`colGet` / `colSet` / `updateTrees`）、`lib/tree-access.js`（member 判定）、`lib/scope.js`（锚点）、
> `lib/wallet.js`（¥ 钱包）、`lib/economy-spirit.js`（时流子域模块）、`cloudfunctions/compat-api/index.js`（路由判定链）、`frontend/src/pages/spirit/index.vue`（时流子域页，8.1 / 8.2 / 8.3 三张定稿弹窗**唯一落点**）、`frontend/src/pages/hall/index.vue`（家族树首页，仅状态展示与跳转）、`frontend/src/business/api.ts`。

---

## 0. 本册边界与对齐（先读）

| 项 | 口径 |
|---|---|
| **本册管** | 灵气四态状态机与时间字段推进、石榴籽玉的合成判定 / 分解 / 镶嵌（凹槽唯一性与不可逆）、玉露灵泽蓄能档位与扣费、灵气流水视图与读权限、时流子域页面与入口、三段定稿确认弹窗的逐字引用、测试与部署要点 |
| **本册不管**（回总册 / 运维册） | 碎片与籽的通用有效期与 `sweep`、FIFO 扣减通用算法、市集、官方竹简发售、建树扣费、¥ 钱包收缩、站内信集合形态与去重键机制（回 `economy-ops.spec.md` §4） |
| **冲突处理** | 字段名 / 集合名 / 路由名冲突 → 以总册为准；业务数值与口径（蓄能档位表、合成三态判定、镶嵌不可逆、30 天缓冲）冲突 → 以本册为准（来源 = 用户需求原文）；**§9 登记的 13 处差异已由总监终审裁定统一（2026-09-16），总册已按裁定同步，§9 现仅作历史登记**；任何变动先改本册再改代码 |
| **引用约定** | 总册正在修订、§ 号可能变动：**新增引用一律写章节名**（例：见 `docs/economy.spec.md`（存储契约）），不新增具体 § 号；既有 § 号引用待总册定稿后一并核对 |
| **需求原文** | 本册 §4 / §5 / §6 是需求原文（时流子域部分）的可执行展开，**语义不得增删**；数值不得四舍五入、不得补零取整 |
| **本轮不做** | 真二级域名绑定、定时任务与推送通道、跨家族共享灵气、玉的交易与转赠；「子域名」本轮一律指**平台内「家族专属空间」页面** |

---

## 1. 一句话

石榴籽玉（仅可由 **999 颗**完整石榴籽合成，基准价值 **100 元/枚**）只能镶嵌进**一棵家族树的唯一凹槽**；
镶嵌即**永久占用凹槽、永久解锁**「时流子域」（家族专属空间）并开启玉露灵泽蓄能权限；
此后由**任何已登录用户**消耗**个人**石榴籽灌注玉露灵泽（不限本树成员，**已定稿（Kevin 2026-09-16 拍板）**，K1），灵气时长在原有到期时间上**叠加顺延（绝不覆盖、绝不缩短）**；
灵气到期后自动进入 **30 天缓冲期**，缓冲期结束仍无续期则时流子域**自动失效**（凹槽与权限保留、已积累数据保留、仅入口停用）。
全部状态推进走**惰性结算**（任何读/写入口按当前时间推进），不依赖定时任务。

---

## 2. 术语与已拍板口径

### 2-1 术语

| 术语 | 定义 |
|---|---|
| 石柳籽玉（玉） | `jiazu_assets.users[<手机号>].jades[]` 内的一条 `Jade`；仅可合成获得，不可购买、不可交易、不可转赠 |
| 凹槽 | 每棵家族树自带的**唯一**玉槽位（`jiazu_spirit.trees[<tree_id>].jade`）；单树仅可镶嵌 1 枚，占用后不释放 |
| 时流子域 | 家族专属空间（平台内页面 `pages/spirit/index`）；镶嵌解锁，可用性由灵气有效期决定 |
| 玉露灵泽 | 灌注物：消耗**个人**石榴籽 → 延长家族灵气到期时间；无家族储籽池 |
| 灵气 | 家族级时长属性（`spirit_expires_at`）；与玉自身的 `expires_at` **相互独立** |
| 缓冲期 | 灵气到期后的 30 天宽限期（`buffer_until = spirit_expires_at + 30 天`），期内子域仍可用 |
| 惰性结算 | `settle(now)`：任何时流子域 / 资产读或写入口**先**按当前时间推进状态机与过期批次，再执行业务逻辑 |
| 站内提醒 | 写入 `jiazu_messages`（`economy-ops.spec.md` §4.1 `Message` 形态）的站内信；推送通道留部署阶段 |

### 2-2 已拍板口径（不得改）

| # | 口径 |
|---|---|
| 1 | **凹槽永久占用、权限永久，可用性由灵气有效期决定**；停用后已积累数据保留、仅入口停用 |
| 2 | 「子域名」本轮**不绑真域名**：只落平台内「家族专属空间」页面 + 灵气到期日与状态数据；真二级域名绑定留部署阶段 |
| 3 | 到期 / 状态推进走**惰性结算**（active → buffer → expired），不依赖定时任务；定时推送留部署阶段 |
| 4 | 镶嵌后**不自动赠送**初始灵气时长：`status` 初始 = `'inactive'`，首次灌注后转 `'active'`（**已定稿（Kevin 2026-09-16 拍板）**，K6；见 §13 #1） |
| 5 | 扣减优先级：籽一律 **FIFO by `expires_at` 升序**；999 颗不足 → **整单拒绝 409**，绝不部分扣；禁透支 |

---

## 3. 存储契约（逐字一致；完整定义见总册 §4）

### 3-1 集合 `jiazu_spirit`（`_id = 'global'`）

```
集合 jiazu_spirit（_id='global'）：{ trees: { <tree_id>: { jade: { jade_id, mounted_at, expires_at }, spirit_expires_at, buffer_until, status: 'inactive'|'active'|'buffer'|'expired', logs: SpiritLog[] } } }
SpiritLog = { id, ts, phone, plan: 'daily'|'monthly'|'quarterly'|'half_year'|'yearly', seeds, days, gift_bamboos, spirit_expires_at_after }
```

| 字段 | 类型 / 取值 | 含义 |
|---|---|---|
| `trees` | `{ <tree_id>: TreeSpirit }` | 以家族树 id 为键；**无键 = 该树未镶嵌**（不存在第五条状态） |
| `jade` | 对象或不存在 | 凹槽占用真源：`{ jade_id, mounted_at, expires_at }`；`expires_at` 为 `null` 表示**永久玉** |
| `spirit_expires_at` | ISO 字符串 或 `null` | 家族灵气到期时刻；`null` = 尚未灌注（首次灌注前） |
| `buffer_until` | ISO 字符串 或 `null` | 缓冲期结束时刻；`status` 为 `'buffer'` / `'expired'` 时有值，`active` / `inactive` 时清空为 `null` |
| `status` | `'inactive'` / `'active'` / `'buffer'` / `'expired'` | 四态之一（§4） |
| `logs` | `SpiritLog[]` | **灌注流水**（唯一写入者是 `POST /spirit/charge`）；按 `ts` 升序追加 |
| `SpiritLog.id` | string | `spl_<毫秒时间戳>_<6 位随机>`（沿用 `lib/wallet.js` 的 id 风格） |
| `SpiritLog.ts` | ISO 字符串 | 灌注时刻 |
| `SpiritLog.phone` | string | **灌注者**手机号 |
| `SpiritLog.plan` | 五档枚举 | 本次档位（§6-2） |
| `SpiritLog.seeds` | number（颗） | 本次消耗籽数（= 档位实价） |
| `SpiritLog.days` | number（天） | 本次延长天数（= 档位天数） |
| `SpiritLog.gift_bamboos` | number（**片**） | 本次赠送竹片数（`0` = 无赠送；1 束 = 100 片） |
| `SpiritLog.spirit_expires_at_after` | ISO 字符串 | 本次灌注后的灵气到期时刻 |

> 镶嵌、合成、分解**不写 `logs`**（`SpiritLog` 形态只承载灌注）；它们的流水写 `jiazu_assets.users[<手机号>].txs`（`type` 见 §5 / 总册 §4-6）。

### 3-2 个人资产 `jiazu_assets`（节选，完整定义见总册 §4-1）

```
集合 jiazu_assets（_id='global'）：{ users: { <手机号>: { fragments, seeds: SeedLot[], bamboos: BambooLot[], jades: Jade[], txs: Tx[], signin_date } } }
SeedLot = { id, qty, expires_at, source, created_at }
BambooLot = { id, qty(片), expires_at, source, created_at }
Jade = { id, expires_at(ISO 或 null=永久), created_at, source: 'synthesis', mounted_tree_id(可选) }
```

| 记录 | 本册使用到的字段与枚举 | 口径 |
|---|---|---|
| `SeedLot` | `qty`（颗）、`expires_at`、`source` = `'jade_decompose'`（分解产籽） | 籽统一最长有效期 **365 天**；**无永久籽** |
| `BambooLot` | `qty`（**片**）、`expires_at`、`source` = `'spirit_gift'`（灌注赠送） | 赠送竹片 **365 天**、到期自动作废 |
| `Jade` | `expires_at`（ISO 或 `null` = 永久）、`source` = `'synthesis'`、`mounted_tree_id` | 镶嵌后写 `mounted_tree_id = <tree_id>` 作为**去向留痕**；该玉随即进入「不可取回 / 不可分解 / 不可二次使用」态（§5-3） |
| `Tx.type` | `'jade_synthesize'`（籽→玉）、`'jade_decompose'`（玉→籽）、`'spirit_charge'`（灵气充值）、`'jade_mount'`（镶嵌，`delta` 为 0 的记账条） | 枚举以总册 §4-6 为准；`'jade_mount'` 为本册新增记账类型（需在总册 §4-6 补一项） |

### 3-3 单位与常量（唯一取值来源）

| 常量 | 值 | 说明 |
|---|---|---|
| `SEED_COST` | **999**（颗） | 合成一枚玉的固定消耗；分解固定返还 999 颗 |
| `PERMANENT_THRESHOLD_DAYS` | **360**（天） | 永久判定阈值；参与合成的籽**全部**剩余 ≥ 360 天 → 玉永久 |
| `SEED_DAYS` | **365**（天） | 籽的统一有效期（分解产籽同样 365 天） |
| `BAMBOO_DAYS` | **365**（天） | 赠送竹片有效期 |
| `BUFFER_DAYS` | **30**（天） | 缓冲期长度 |
| `BAMBOO_PER_BUNDLE` | **100**（片） | 竹简最小单位 = 片；1 束 = 100 片；**存储一律以片计** |
| `JADE_BASE_VALUE` | 100（元/枚） | 运营报表口径，**不是**合成成本（999 籽 ≈ 999 元，不等值，按需求原样实现） |
| `TREE_ID_MASTER` | `zhonghua` | 中华世本；无时流子域凹槽（`kind='master'` 拒绝镶嵌） |

---

## 4. 灵气状态机（四态）

### 4-1 四态总表

| 态 | 进入条件 | 时间字段 | 可执行操作 | 页面表现 |
|---|---|---|---|---|
| **`inactive`** | 已镶嵌玉且**从未灌注**（`spirit_expires_at = null`） | `spirit_expires_at = null`；`buffer_until = null` | 灌注（首次灌注 → `active`）；查看流水（空）；镶嵌入口已关闭（凹槽已占） | 「时流子域 · 未激活」+「灌注玉露灵泽即可开启」；子域功能未解锁 |
| **`active`** | `spirit_expires_at > now` | `buffer_until = null`；`buffer_until_preview = spirit_expires_at + 30 天` | 灌注（**叠加**顺延）、查看流水、使用子域全部功能 | 「灵气充盈 · 剩余 N 天」+ 到期日 YYYY-MM-DD |
| **`buffer`** | `spirit_expires_at <= now < buffer_until` | `buffer_until = spirit_expires_at + 30 天` | 灌注（从 `max(now, spirit_expires_at)` 顺延）、查看流水；子域功能**保留**（宽限期） | 「灵气已尽 · 缓冲期剩余 N 天（至 YYYY-MM-DD），续期可恢复」 |
| **`expired`** | `now >= buffer_until` | `buffer_until` 保留（已过去的截止时刻，供追溯） | 仅灌注（重新激活 → `active`）与查看流水；**入口停用**，已积累数据保留 | 「时流子域已停用 · 灌注玉露灵泽可重新激活」 |

> 说明一：**无 `jiazu_spirit.trees[<tree_id>]` 记录 = 该树未镶嵌**，不属于四态（前端显示「未开启时流子域」+「镶嵌石榴籽玉」入口）。
> 说明二：`status` 是**派生字段**，唯一真源是 `spirit_expires_at` / `buffer_until` 与 `now` 的比较结果；任何入口读到不一致都必须先 `settle` 再返回。
> 说明三：`buffer` 期「子域功能保留」是默认口径（§13 #6）；`expired` 起才「子域名停用」= 平台内页面入口停用（真域名绑定留部署阶段）。
> 说明四（**终审裁定 R5**）：家族树删除后 `jiazu_spirit.trees[tree_id]` 记录**保留**、`status` 置 `'expired'`（不删记录）；该树已镶嵌的玉**不返还、不可重镶**（已销毁），个人侧 `mounted_tree_id` 去向留痕保留。本册**不提供任何**把已镶嵌玉恢复为未镶嵌态的操作。
> 说明四追加（**引用**）：经【汇宗】并入他树的情况适用 `docs/branch-clan-ops.spec.md`（立支 / 汇宗）的资产折损口径 —— 源树**灵气剩余有效期 × 比例**累加至目标树（叠加顺延、不覆盖）、源树已镶嵌玉**仍不返还、不可重镶**；**目标树未镶嵌玉（无凹槽）不并入时长**，只作提示。本条只作引用补充，**不改写说明四（R5）的原文结论**。

### 4-2 迁移表（7 条）

| # | 迁移 | 触发 | 时间字段变化 |
|---|---|---|---|
| T1 | **（无记录）→ `inactive`** | `POST /spirit/mount-jade` 成功（凹槽建立） | `jade = { jade_id, mounted_at: now, expires_at }`；`spirit_expires_at = null`；`buffer_until = null`；`logs = []` |
| T2 | `inactive` → `active` | 首次灌注成功 | `spirit_expires_at = now + days`；`buffer_until = null` |
| T3 | `active` → `active`（**自迁移 · 叠加**） | `active` 期灌注成功 | `spirit_expires_at = 原 spirit_expires_at + days`（**不覆盖、不缩短**） |
| T4 | `active` → `buffer` | 惰性推进：`now >= spirit_expires_at` | 置 `buffer_until = spirit_expires_at + 30 天` |
| T5 | `buffer` → `active` | 缓冲期内灌注成功 | `spirit_expires_at = max(now, 原 spirit_expires_at) + days`；`buffer_until = null` |
| T6 | `buffer` → `expired` | 惰性推进：`now >= buffer_until` | `buffer_until` 保留（已过去） |
| T7 | `expired` → `active` | 失效后灌注成功 | 基期取 `now`（原 `spirit_expires_at` 已过去）→ `spirit_expires_at = now + days`；`buffer_until = null` |

> 迁移条数 = **7**（含 1 条入口建立 T1 + 1 条自迁移 T3）；不存在 `buffer → buffer`（缓冲期内灌注一律回到 `active`），不存在 `inactive → buffer`（无到期日即无缓冲）。

### 4-3 迁移图

```
                    (无记录 = 未镶嵌)
                          │ T1 镶嵌成功
                          ▼
                     ┌──────────┐  T2 首次灌注   ┌────────┐
                     │ inactive │ ────────────▶ │ active │◀──┐
                     └──────────┘                └────────┘   │
                                                     │  T3 灌注续期（自迁移·叠加）
                                                     │ ────────┘
                                                     │ T4 now ≥ spirit_expires_at
                                                     ▼
                                                ┌────────┐  T6 now ≥ buffer_until  ┌─────────┐
                                                │ buffer │ ──────────────────────▶ │ expired │
                                                └────────┘                          └─────────┘
                                                     │  T5 缓冲期内灌注                      │ T7 灌注
                                                     └──────────────▶ active ◀─────────────┘
```

### 4-4 惰性推进 `settle(entry, now)`

```
settle(entry, now):                     # 任何时流子域 / 资产读、写入口先执行；返回是否有变化
  if not entry or not entry.jade: return false            # 未镶嵌 → 不进四态
  if not entry.spirit_expires_at:
       变化 = (entry.status != 'inactive') or (entry.buffer_until != null)
       entry.status = 'inactive'; entry.buffer_until = null; return 变化
  exp = parse(entry.spirit_expires_at)
  if now < exp:
       entry.status = 'active';   entry.buffer_until = null
  else if now < exp + BUFFER_DAYS(30 天):
       entry.status = 'buffer';   entry.buffer_until = ISO(exp + 30 天)
  else:
       entry.status = 'expired';  entry.buffer_until = ISO(exp + 30 天)
  若字段有变化 → colSet('jiazu_spirit', 'global', doc)      # 只在真有变化时写回
```

**触发点（全部必经）**：`GET /spirit`、`POST /spirit/charge`、`POST /spirit/mount-jade`、`POST /assets/synthesize-jade`、`POST /assets/decompose-jade`、
以及总册/运维册定义的任何资产读入口（`GET /assets/summary`、`GET /assets/expiring`、签到、市集、运营发放、`GET /messages`）。
**触发点唯一写法**：入口函数第一行调用 `settle`；**不注册任何定时任务、不使用 `setInterval`**（定时任务与推送留部署阶段，§12）。

### 4-5 时间字段口径

| 项 | 口径 |
|---|---|
| 时间基准 | 服务端 `now`（UTC ISO 毫秒）；同一请求内**只取一次** `now`，请求处理过程中不再刷新 |
| `spirit_expires_at` | 唯一真源；`null` = 未灌注。写入规则只有三处：首次灌注（`now + days`）、`active` 期灌注（原值 `+ days`）、`buffer`/`expired` 期灌注（`max(now, 原值) + days`） |
| `buffer_until` | = `spirit_expires_at + 30 天`；仅 `buffer` / `expired` 态有值，`active` / `inactive` 态一律 `null` |
| `buffer_until_preview` | **出参计算字段**（不落库）：`spirit_expires_at ? spirit_expires_at + 30 天 : null`；供 `active` 态页面提示「到期后自动进入 30 天缓冲期」 |
| 剩余天数 | 出参 `days_left` = `Math.ceil((spirit_expires_at − now) / 86400000)`（≤0 时按 0 返回）；`buffer_days_left` 同式对 `buffer_until` 计算 |
| 时区 | 计算一律用毫秒差；**展示用日期**（YYYY-MM-DD）按北京时间 UTC+8 折算（与 `economy-ops.spec.md` §10-1 同一口径） |

### 4-6 状态文案（**非定稿**，实施可调，与 `economy-ops.spec.md` §6.4 同级别）

| 态 | 主文案 | 副文案 |
|---|---|---|
| 未镶嵌 | 未开启时流子域 | 镶嵌石榴籽玉，解锁本家族专属空间 |
| `inactive` | 时流子域 · 未激活 | 灌注玉露灵泽即可开启 |
| `active` | 灵气充盈 · 剩余 N 天 | 灵气到期日 YYYY-MM-DD |
| `buffer` | 灵气已尽 · 缓冲期剩余 N 天 | 缓冲期至 YYYY-MM-DD，续期可恢复 |
| `expired` | 时流子域已停用 | 灌注玉露灵泽可重新激活（数据保留） |

> 站内信**定稿**文案为 M2 / M3 / M4 三条（文案真源 = `docs/economy-ops.spec.md`）；「灵泽灌注成功」提醒为本册新增场景（随文案真源册同批定稿），逐字引用见 §6-5。

---

## 5. 石榴籽玉：合成 / 分解 / 镶嵌

### 5-1 合成（`POST /assets/synthesize-jade`）

| 项 | 口径 |
|---|---|
| 入参 | 无（`{}`；手机号取自 JWT） |
| 权限 | 已登录 `user`（本人资产，无需树权限）——沿用总册 §8 |
| 固定消耗 | **999 颗**完整石榴籽；系统**自动**优先选取账户内**最早到期**的籽，**用户无法手动选择**批次 |
| 判定基准时点 | 服务端处理本请求的 `now`（同一请求内恒定）；参与批次在扣减前先 `sweep(now)`（已过期批不参与、不计入 999） |
| 参与批次 | `seeds` 中 `qty > 0` 的全部批次按 `expires_at` **升序**（同值按 `created_at` 升序）取用；跨批取用，若某批被部分取用 → **拆批**（已用部分移除，剩余部分保留原 `expires_at`） |
| 不足拦截 | 累计可用 < 999 → **409**，**整单不扣、不部分扣、不产生玉** |
| 永久判定 | 若参与合成的 999 颗**全部**剩余有效期 **≥ 360 天** → 玉 `expires_at = null`（**永久**）。判定式：`now + 360 天 <= min(used.expires_at)`；**恰好 360 天算 ≥360 天（取永久）** |
| 期限判定 | 任意一颗剩余有效期 **< 360 天** → 玉 `expires_at = 本次所用籽中最早到期的那个批次的 `expires_at` 原值`（即 `min(used.expires_at)`，**不按天取整、不改写**） |
| 产出 | `Jade = { id: 'jd_<毫秒>_<6 位随机>', expires_at, created_at: now, source: 'synthesis' }` 追加进 `jades`；未镶嵌时**不带** `mounted_tree_id` |
| 流水 | `Tx = { type: 'jade_synthesize', delta: { seeds: -999, jades: +1 }, ref: {}, desc: '合成石榴籽玉' }` |
| 返回值 | `{ ok: true, jade_id, seeds_deducted: 999, expires_at, permanent: boolean, seeds_used: [ { lot_id, qty, expires_at } ] }` |
| 并发 | 同一手机号的资产操作走**进程内按手机号串行队列**；禁止读改写竞态（不得重复消耗同一批籽） |

```
synthesizeJade(phone, now):
  assets = assetsOf(phone); sweep(assets, now)
  lots   = assets.seeds.filter(qty > 0).sortBy(expires_at asc, created_at asc)
  avail  = Σ lots.qty
  if avail < 999: throw 409 '石榴籽不足：合成石榴籽玉需 999 颗完整石榴籽，当前可用 <avail> 颗'
  used   = consumeFIFO(lots, 999)                  # 跨批取用；部分取用 → 拆批（剩余批 expires_at 不变）
  earliest = min(used.expires_at)
  jade.expires_at = (now + 360 天 <= earliest) ? null : ISO(earliest)
  assets.jades.push(jade); assets.txs.push(tx); colSet('jiazu_assets','global',doc)
```

### 5-2 分解（`POST /assets/decompose-jade`）

| 项 | 口径 |
|---|---|
| 入参 | `{ jade_id }` |
| 权限 | 已登录 `user`（本人玉） |
| 费用 | **免费分解**：无手续费、无损耗、无折损 |
| 返还 | 固定返还 **999 颗籽**，产出**单一新批次** `SeedLot = { id: 'sl_<毫秒>_<6 位随机>', qty: 999, expires_at: now + 365 天, source: 'jade_decompose', created_at: now }` |
| 有效期统一 | **所有分解产出的籽统一 365 天**；**永久玉分解同样遵循**（**无永久籽产出**） |
| 守卫 | 玉不存在 → **404**「未找到该石榴籽玉」；玉已镶嵌（`mounted_tree_id` 非空）→ **409**「已镶嵌的石榴籽玉不可分解」（**镶嵌不可逆**：本接口不提供任何反向操作路径，§5-3） |
| 永久玉 | `expires_at = null` 的玉同样可分解，产出仍是 365 天籽 |
| 流水 | `Tx = { type: 'jade_decompose', delta: { jades: -1, seeds: +999 }, ref: {}, desc: '分解石榴籽玉' }` |
| 返回值 | `{ ok: true, seeds_returned: 999, seed_expires_at, seed_lot_id, jade_id }` |

### 5-3 镶嵌（`POST /spirit/mount-jade`）

| 项 | 口径 |
|---|---|
| 入参 | `{ tree_id, jade_id }` |
| 权限 | **任何已登录用户**（**已定稿（Kevin 2026-09-16 拍板）**，K1）：不再要求本树 `tree_steward` / `chief_editor`、不判 `jiazu_anchors` 锚点；未登录 → **401**（不设 403 档） |
| 可镶嵌的树 | `tree-meta` 注册的任一**非总谱**树（`kind='family'` 与 `kind='clan'`（祖谱）均可，§13 #3 · **已定稿（Kevin 2026-09-16 拍板）**，K2）；`kind='master'`（`zhonghua`）→ **400**「中华世本无时流子域凹槽」；树不存在 → **404** |
| 基数 | **每棵家族树自带唯一凹槽；单棵树仅可镶嵌 1 枚** |
| 不可逆 | 镶嵌后玉**永久销毁**（用户视角）：**不可取回、不可分解、不可二次使用**；凹槽**永久占用、不释放**，**无任何反向路由**（终审裁定 R4） |
| 落库 | ① `jiazu_spirit.trees[tree_id]` 写入 `jade = { jade_id, mounted_at: now, expires_at }` + `spirit_expires_at = null` + `buffer_until = null` + `status = 'inactive'` + `logs = []`；② 个人侧 `jades[]` 该玉写 `mounted_tree_id = tree_id`（**去向留痕**，记录保留、不做物理删除） |
| 冲突/幂等 | 凹槽已被占用 → **409**「该家族树凹槽已镶嵌石榴籽玉」（**二次镶嵌一律拒绝**，不做幂等 200：重复请求不产生第二次副作用）；同一 `jade_id` 已在任意树的 `jiazu_spirit.jade` 中 → **409**「该石榴籽玉已镶嵌，不可重复使用」 |
| 与灵气的关系 | 镶嵌**不赠送**初始灵气（`status='inactive'`，§13 #1）；玉自身的 `expires_at`（含永久）**不驱动**灵气有效期，只作凹槽展示 |
| 流水 | `Tx = { type: 'jade_mount', delta: { jades: 0 }, ref: { tree_id }, desc: '镶嵌石榴籽玉，解锁时流子域' }` |
| 返回值 | `{ ok: true, tree_id, jade_id, mounted_at, jade_expires_at, status: 'inactive', spirit_expires_at: null }` |
| 原子性 | 跨集合（`jiazu_assets` + `jiazu_spirit`）无事务 API：**先写 `jiazu_spirit`（凹槽占用 = 唯一性临界区）再写 `jiazu_assets`**，第二步失败 → 用快照回滚第一步（与 `store.updateTrees` 的「顺序写 + 失败回滚」口径一致）；云端极端失败由 reconcile 补一致性 |

### 5-4 玉的状态矩阵（守卫一览）

| 玉的状态 | 判据 | 可分解 | 可镶嵌 | 可再合成参与 | 展示 |
|---|---|---|---|---|---|
| 未镶嵌 | `mounted_tree_id` 缺省且不在任何 `jiazu_spirit.jade` 中 | ✅（返 999 籽 / 365 天） | ✅ | ✅ | 「未镶嵌」+「镶嵌」按钮 |
| 已镶嵌 | `mounted_tree_id` 非空 | ❌ 409 | ❌ 409 | ❌（已出账，不再计入账户可用玉） | 「已镶嵌至 <家族树>」+ 镶嵌时间 |
| 永久 | `expires_at = null` | ✅（产 365 天籽） | ✅ | ✅ | 「永久有效」 |

---

## 6. 玉露灵泽蓄能（`POST /spirit/charge`）

### 6-1 接口

| 项 | 内容 |
|---|---|
| 路由 | `POST /spirit/charge` |
| 鉴权 | `Bearer`；**任何已登录用户**（**已定稿（Kevin 2026-09-16 拍板）**，K1）——不再限于本树 `tree_steward` / `chief_editor`、不判锚点；未登录 → **401**（不设 403 档，见 §13 #2） |
| 入参 | `{ tree_id: string, plan: 'daily'|'monthly'|'quarterly'|'half_year'|'yearly' }` |
| 前提 | 该树必须**已镶嵌玉**（`jiazu_spirit.trees[tree_id].jade` 存在）→ 否则 **409**「该家族树尚未镶嵌石榴籽玉，无法灌注玉露灵泽」 |
| 消耗 | **个人**石榴籽（**取消家族账户储籽模式**：不存在家族储籽池，`jiazu_wallets.trees[tree_id].balance_cents` 与 `transferToTree` 已随总册 §12-3 下线）；籽**消耗后直接销毁**（不入任何池、不返还） |
| 效果 | **仅**更新家族树的灵气到期日属性与状态；**灵气时长叠加**——在原有到期时间基础上顺延延长，**无覆盖** |
| 返回值（200） | `{ ok: true, tree_id, plan, seeds_deducted, days, spirit_expires_at, spirit_expires_at_before, buffer_until_preview, status: 'active', gift_bamboos, gift_bundles, gift_lot_id, seeds_used: [ { lot_id, qty, expires_at } ], seeds_balance_after, message }`（`spirit_expires_at` 为灌注后到期时刻，与总册 §6-2 同名同义） |

### 6-2 蓄能档位表（**定稿**，共 5 行；数值为需求原文，实施不得改写、不得由折扣反推籽数）

| 档位 `plan` | 实价（籽，**最终扣费标准**） | 延长天数 | 折扣（展示口径） | 赠送竹简 | 活动最低折扣 |
|---|---|---|---|---|---|
| `daily`（单日） | **1** | 1 | 100% | 无 | — |
| `monthly`（月度） | **29** | 30 | 97% | 无 | — |
| `quarterly`（季度） | **109** | 90 | 91% | **临时活动赠送，上限 1 束**（= 100 片；活动关闭时 = 0 片） | 83% |
| `half_year`（半年度） | **149** | 180 | 83% | **2 束**（= 200 片） | 72% |
| `yearly`（年度） | **299** | 365 | 82% | **8 束**（= 800 片） | 60% |

> 列口径一（**扣费唯一依据**）：「实价（籽）」= 最终扣费籽数；`折扣` 列为**营销展示口径，不参与任何计算**，实现不得由折扣反推籽数、不得对实价取整或四舍五入。
> 列口径二（赠送）：「赠送竹简」为**常态赠送**（`half_year` / `yearly`）；`quarterly` 为**临时活动赠送**（上限 1 束，受 §6-4 开关约束，默认关闭 → 0 片）。
> 列口径三（活动最低折扣）：「活动最低折扣」是**未来临时活动的价格下限**（活动实价不得优于该折扣对应的籽数）；本轮不开展任何活动，仅作常量登记。
> 档位表由接口随 `GET /spirit` 的 `plans` 字段下发（**单一真源**，前端不得硬编码数值）。

### 6-3 扣费与叠加算法

```
charge(headers, tree_id, plan, now):
  requireLogin(headers) → 401                              # K1 定稿：任何已登录用户可灌注，不再判本树角色档 / 锚点
  P = PLANS[plan]; if not P: throw 400 '不支持的蓄能档位'
  doc   = colGet('jiazu_spirit','global'); entry = doc.trees[tree_id]
  if not entry or not entry.jade: throw 409 '该家族树尚未镶嵌石榴籽玉，无法灌注玉露灵泽'
  settle(entry, now)                          # 先推进：buffer / expired 均允许续期
  assets = assetsOf(phone); sweep(assets, now)
  if Σ assets.seeds.qty < P.seeds:            # FIFO by expires_at 升序、整单拒绝
        throw 409 '石榴籽不足：本次需 <P.seeds> 颗，当前可用 <avail> 颗'      # 一分不扣
  used = consumeFIFO(assets.seeds, P.seeds)   # 跨批取用；部分取用拆批
  base   = (entry.spirit_expires_at and parse(entry.spirit_expires_at) > now)
             ? parse(entry.spirit_expires_at) : now          # 叠加顺延基期（绝不覆盖）
  newExp = base + P.days 天
  gift片 = (P.gift_bundles 受活动开关放行 ? P.gift_bundles * 100 : 0)
  if gift片 > 0: assets.bamboos.push({ id, qty: gift片, expires_at: now + 365 天, source: 'spirit_gift', created_at: now })
  entry.spirit_expires_at = ISO(newExp); entry.buffer_until = null; entry.status = 'active'
  entry.logs.push({ id: 'spl_…', ts: now, phone, plan, seeds: P.seeds, days: P.days,
                    gift_bamboos: gift片, spirit_expires_at_after: ISO(newExp) })
  assets.txs.push({ type:'spirit_charge', delta:{ seeds:-P.seeds, bamboos: gift片>0 ? +gift片 : undefined },
                    ref:{ tree_id }, desc:'灌注玉露灵泽（<plan>）' })
  写 jiazu_assets → 写 jiazu_spirit → 写站内提醒（§6-5）；任一步失败按快照回滚
```

| 规则 | 口径 |
|---|---|
| 叠加公式 | `newExp = max(now, 原 spirit_expires_at) + days`；三态统一用此式：`active`（原值未来 → 原值 + days）、`buffer`/`expired`（原值已过 → now + days）、`inactive`（无原值 → now + days） |
| 绝不覆盖 | 新到期时刻**恒 ≥** 原到期时刻 + days；任何情况下不得缩短灵气 |
| 扣减顺序 | FIFO by `expires_at` 升序（与总册 §5-2 同一算法），用户不可手选批次 |
| 不足 | **409 整单拒绝**：不扣籽、不延长灵气、不赠竹片、不追加 `logs`、不发提醒（五种副作用全不发生） |
| 幂等 | 以手机号串行锁防并发重复扣费；无幂等 token（同一 `plan` 重复提交 = 重复扣费与重复顺延，属用户明确操作） |
| 灌注不受锚点限制 | 灌注者可为本树成员，亦可是**任何其他已登录用户**（§6-1 权限，**已定稿（Kevin 2026-09-16 拍板）**，K1）；其 `jiazu_anchors` 锚点树不参与判定；流水记 `phone` |

### 6-4 赠送竹简与「临时活动赠送」开关

| 项 | 口径 |
|---|---|
| 赠送落地 | `BambooLot`：`qty` 以**片**计（束 × 100）、`expires_at = now + 365 天`、`source = 'spirit_gift'` |
| 常态赠送 | `half_year` = 2 束（200 片）、`yearly` = 8 束（800 片）——不受开关影响，恒发放 |
| 临时活动赠送 | 仅 `quarterly`，**上限 1 束**（100 片）；受开关控制；`daily` / `monthly` 任何情况都无赠送 |
| 开关名与取值 | 云函数环境变量 `SPIRIT_GIFT_ACTIVITY`，值为**逗号分隔的档位列表**（例：`quarterly`）；**缺省未设 = 活动关闭** → `quarterly` 赠送 0 片 |
| 开关生效 | 读取点：`charge` 计算 `gift片` 前一次读取；`GET /spirit` 出参 `activity = { gift_enabled_plans: [...] }` 供前端显示「限时活动」标签 |
| 改动成本 | 开启活动 = 在云函数环境变量补一处（无需改代码、无需改集合字段）；关闭 = 清空该变量 |
| 记账 | `SpiritLog.gift_bamboos` 记**片**；`Tx.delta.bamboos` 记**片**（`long` 正数）；赠送不写 `jiazu_ops_logs`（非运营发放） |

### 6-5 站内提醒（`jiazu_messages`）

| 场景 | `type` / 场景标签 | 收件人 | 去重键（`warned`） | 是否推送 |
|---|---|---|---|---|
| 每次灌注完成 → 自动发送站内提醒 | `spirit_charged`（**本册新增枚举**，需在 `economy-ops.spec.md` §4.1 类型行补一项） | 该树收件人集合（`anchor` 用户 + 该树 `tree_steward` + 全部 `chief_editor`，沿用 `economy-ops.spec.md` §10-6）+ 灌注者本人 | `spirit_charge:<tree_id>:<SpiritLog.id>` | 本轮仅落站内信；推送通道留部署阶段 |
| 灵气剩余 ≤ 30 天 | `spirit_30` | 同上 | `spirit30:<tree_id>:<spirit_expires_at>` | 同上 |
| 灵气耗尽进入缓冲期 | `spirit_buffer` | 同上 | `spirit_buffer:<tree_id>:<spirit_expires_at>` | 同上 |
| 缓冲期剩 ≤ 7 天 | `spirit_7` | 同上 | `spirit7:<tree_id>:<buffer_ends_at>` | 同上 |

**定稿文案（文案真源 = `docs/economy-ops.spec.md`（§6.2）；下列 3 条为副本，逐字引用、实施不得改写）**

| # | `type` | 文案（逐字） | `Message.title` |
|---|---|---|---|
| M2 | `spirit_30` | 「【家族灵气预警】本家族【时流子域】灵气剩余30天，即将到期。请及时灌注玉露灵泽续期，避免子域名停用。」 | 家族灵气预警 |
| M3 | `spirit_buffer` | 「【家族缓冲期通知】本家族灵气已耗尽，现已进入30天缓冲期。若未及时续期，缓冲期结束后子域名将自动失效。」 | 家族缓冲期通知 |
| M4 | `spirit_7` | 「【紧急通知】本家族【时流子域】缓冲期仅剩7天，未灌注玉露灵泽续期将永久停用子域名，请尽快操作！」 | 紧急通知 |

> **逐字校验结果（2026-09-16）**：M2 / M3 / M4 三条副本与文案真源（`docs/economy-ops.spec.md` §6.2）单元格**逐字一致（3/3）**；真源站内信共 4 条定稿，其中 M1（资产到期提醒）不在时流子域，本册不复制。
> **落库 `Message.type` 与 `warned` 键形以文案真源册为准**（真源册「消息字段」与「惰性预警」章节）：真源册落库枚举为资产到期 `expiring`、灵气三条 `spirit`；本表 `spirit_30` / `spirit_buffer` / `spirit_7` 是**生成逻辑内的场景标签（kind）**，`warned` 键形同样以真源册为准（本表登记形为简写）。差异登记见 §9 #13。

**灌注成功提醒文案**（本册新增，**非需求定稿**，随附 `economy-ops.spec.md` 文案册同批定稿；`【】` 为运行时填值，口径见下）：

| 项 | 内容 |
|---|---|
| 文案 | 「【灵泽灌注成功】本家族【时流子域】已灌注玉露灵泽，本次消耗【XX】颗石榴籽，灵气到期时间延长至【YYYY-MM-DD】。」 |
| `Message.title` | 灵泽灌注成功 |
| 运行时填值 | 【XX】= 本次 `SpiritLog.seeds`；【YYYY-MM-DD】= `spirit_expires_at_after` 按北京时间 UTC+8 折算的日期 |
| 落库 | 与 `settle` / 扣费的写入同批完成；同一 `SpiritLog.id` 对同一收件人只生成 1 条（`warned` 去重键） |
| 收件人上限 | 每用户最近 200 条（沿用 `economy-ops.spec.md` §10-5），裁剪最旧已读 |

> 说明：三条灵气预警（M2 / M3 / M4）的生成条件与惰性生成算法（读消息入口 `ensureWarnings`）**归 `economy-ops.spec.md` §4.3 / §4.4**，本册只提供其状态源（`spirit_expires_at` / `buffer_until` / `status`）与收件人集合口径，**不重复定义**、预警生成**只读不写**灵气字段。

### 6-6 错误码表

| 路由 | 码 | 条件 | `error` 文案 |
|---|---|---|---|
| `POST /spirit/charge` | 401 | 未登录（**K1 定稿后本路由唯一的权限档**） | 请先登录后再进行编辑操作（沿用既有 `requireWriteUser` 文案） |
| | 403 | **不再适用（已定稿（Kevin 2026-09-16 拍板），K1）**：灌注不判本树 `tree_steward` / `chief_editor`、不判锚点，本路由不返回 403 | —（无此响应） |
| | 400 | `plan` 缺失或不在五档内 | 不支持的蓄能档位 |
| | 400 | 缺 `tree_id` | 缺少 tree_id |
| | 404 | 树不存在（`tree-meta` 无登记） | 家族树不存在 |
| | 409 | 该树未镶嵌玉 | 该家族树尚未镶嵌石榴籽玉，无法灌注玉露灵泽 |
| | 409 | 籽不足（整单拒绝） | 石榴籽不足：本次需 <P.seeds> 颗，当前可用 <avail> 颗 |
| `POST /spirit/mount-jade` | 401 | 未登录（**已定稿（Kevin 2026-09-16 拍板）**：镶嵌与灌注**同权** = 任何已登录用户，不设 403 档） | 请先登录后再进行编辑操作 |
| | 400 | 缺 `tree_id` 或 `jade_id` | 缺少 tree_id / 缺少 jade_id |
| | 400 | 目标为中华世本 | 中华世本无时流子域凹槽 |
| | 404 | 树或玉不存在 | 家族树不存在 / 未找到该石榴籽玉 |
| | 409 | 凹槽已占（二次镶嵌） | 该家族树凹槽已镶嵌石榴籽玉 |
| | 409 | 玉已镶嵌 | 该石榴籽玉已镶嵌，不可重复使用 |
| `GET /spirit` | 400 | 缺 `tree_id` | 缺少 tree_id |
| | 404 | 树不存在 | 家族树不存在 |

---

## 7. 灵气流水视图（`GET /spirit`）

### 7-1 接口

| 项 | 内容 |
|---|---|
| 路由 | `GET /spirit?tree_id=<tree_id>`（`tree_id` **必填**；本册范围内唯一带树参数的资产读路由） |
| 处理顺序 | 取树 → `settle(entry, now)`（推进状态）→ 组装出参（**推进后**的状态与时间字段为准） |
| 返回值（200） | `{ tree_id, kind, mounted, status, spirit_expires_at, buffer_until, buffer_until_preview, days_left, buffer_days_left, jade, logs: [SpiritLog], logs_total, logs_visible, logs_notice, state_text, can_charge, activity: { gift_enabled_plans: [] }, plans: [ … ] }` |
| 字段口径 | `mounted` = 是否已镶嵌；`jade` = `{ jade_id, mounted_at, expires_at }` 或 `null`；`state_text` = §4-6 对应文案；`can_charge` = 当前访问者是否可灌注（按 §6-1 权限判定；**K1 定稿：已登录即为 `true`**）；`plans` = §6-2 五档表（单一真源） |
| `logs` | **按 `ts` 倒序**取最近 **100** 条（`logs_total` 给总条数）；不可见时 `logs = []` |
| 只读性 | 本路由**不写任何灵气字段**（除 `settle` 的状态推进外无副作用）；`logs` 只能由 `POST /spirit/charge` 追加 |

### 7-2 读权限口径（**家族全体成员可见流水；guest 不可见流水**）

| 访问者 | 判据（沿用仓库既有口径） | 可见内容 |
|---|---|---|
| **guest**（无 `Authorization`） | 无登录态 | **仅摘要**：`mounted` / `status` / `spirit_expires_at` / `buffer_until` / `days_left` / `jade`（家族门面信息，与总册 §8「guest 可读状态与到期日」一致）；`logs = []`、`logs_visible = false`、`logs_notice = '请先登录后查看灵泽蓄能流水'` |
| **家族成员**（登录 + 本树锚点） | `jiazu_anchors[phone].tree_id === tree_id`（与 `lib/tree-access.js` `computeAccess` 的 `member` 判定同源；同时满足 `chief_editor` 全可见、`tree_steward` 亦按锚点命中） | **全量**：摘要 + `logs`（最近 100 条，倒序）+ `logs_total` |
| **登录非成员**（含 `user` / `branch_curator` / 未加入者） | 有登录态但锚点树不等于 `tree_id` | 摘要 + `logs = []`、`logs_visible = false`、`logs_notice = '灵泽蓄能流水仅家族成员可查看'` |
| `chief_editor` | 全局角色（`ROLE_LEVEL`） | 视为成员：全量可见（与总册 §8「总谱仅 chief_editor」不冲突） |
| **树本身不存在** | `tree-meta` 无登记 | **404**「家族树不存在」 |
| **缺 `tree_id`** | — | **400**「缺少 tree_id」 |

> 成员判定**不新造规则**：新增任何「成员可见」判定一律复用 `jiazu_anchors` + `lib/tree-access.js` 的 `member` 口径；`guest` 判定 = 无有效 `Bearer`（`authUser` 返回空）。
> **K1 影响（已定稿（Kevin 2026-09-16 拍板））**：本轮放开的是**写**权限（灌注 / 镶嵌 = 任何已登录用户），**不改本表读数** —— 全量流水仍**仅该树成员**可见，guest 与登录非成员一律 `logs = []` + `logs_notice`（非成员读流水按本表成员口径处理）；`GET /spirit` 无 `Bearer` 时仍按**摘要返回 200**（不返回 401 —— 401 只出现在写路由 `POST /spirit/charge` / `POST /spirit/mount-jade`）。

### 7-3 `logs` 组织

| 项 | 口径 |
|---|---|
| 排序 | `ts` 倒序（最新在最上） |
| 条数 | 返回最近 100 条；`logs_total` = 全量条数；超过 100 由前端「加载更多」（分页参数留部署阶段，`?limit=` + `?before=` 为扩展位） |
| 内容 | 每条含 `phone`（灌注者）、`plan`、`seeds`、`days`、`gift_bamboos`、`ts`、`spirit_expires_at_after`；前端展示「X 于 YYYY-MM-DD 灌注 <档位>，消耗 N 颗，灵气延长至 Z」 |
| 不可变 | `logs` 只追加、不修改、不删除（家族全体成员可查看的**公共留痕**；账号注销也不裁剪树侧流水） |

---

## 8. 前端落点

### 8-1 页面与入口

> **落点口径（2026-09-16 收口 · 唯一版本）**：8.1 / 8.2 / 8.3 三张定稿弹窗**全部**落在新建独立页 `frontend/src/pages/spirit/index.vue`，按页面区块标题对应为——
> 8.1 灌注确认 → **「玉露灵泽蓄能」区块**（五档位选择器 +「灌注玉露灵泽」）；8.2 合成确认 → **「石榴籽玉」区块**（合成 / 分解入口）；8.3 镶嵌不可逆确认 → **「家族树凹槽 · 镶玉」区块**。
> `frontend/src/pages/hall/index.vue` **仅作状态展示与跳转**（入口条 + 进入本页）；`frontend/src/pages/market/index.vue` 是**市集页（竹简市集）**、**不承载玉合成 / 分解 / 镶嵌**。
> **旧口径作废声明**：本册历史版本与总册旧稿中「8.2 落点 = 玉市页 `frontend/src/pages/market/index.vue`（主入口）」「8.3 主入口含 `pages/market/index.vue`」等表述**一律作废**，实现与验收不得再按旧口径检查。

| 落点 | 文件 | 内容 |
|---|---|---|
| **时流子域页（新建）** | `frontend/src/pages/spirit/index.vue` | 平台内「家族专属空间 · 时流子域」：① 顶部状态卡（玉的镶嵌状态 / 灵气状态四态文案 / 灵气到期日 / 缓冲截止 / 剩余天数）；② 五档位选择器（§8-2）+「灌注玉露灵泽」按钮 → 8.1 确认弹窗；③ 已镶玉信息（`mounted_at` / `expires_at`，永久玉显示「永久有效」）；④ **灵泽蓄能流水**列表（`logs`，成员可见；非成员/guest 显示 §7-2 提示文案）；⑤ `expired` 态顶部横幅：「时流子域已停用 · 灌注玉露灵泽可重新激活（数据保留）」；**本页是 8.1 / 8.2 / 8.3 三张定稿弹窗的唯一落点**（页面区块顺序：顶部状态卡 → 家族树凹槽 · 镶玉 → 玉露灵泽蓄能 → 石榴籽玉） |
| **家族树首页入口** | `frontend/src/pages/hall/index.vue`（`hero` 区，与「家族树资金」同级的独立区块） | 「🕰 时流子域」入口条：未镶嵌 →「未开启 · 镶嵌石榴籽玉解锁」；已镶嵌 → 状态文案 + 到期日；点击进入 `pages/spirit/index?tree_id=<tree_id>`；`expired` 态入口条**置灰**并提示「已停用，灌注可重新激活」（点击仍可进页续期） |
| **「我的」入口** | `frontend/src/pages/mine/index.vue`（功能菜单 cell） | 「🕰 时流子域」cell：按 `jiazu_anchors` 锚点树进入本家族子域；无锚点 → toast「请先加入家族树」并引导 `pages/hall` |
| 玉的合成 / 分解入口 | **本页「石榴籽玉」区块**（`frontend/src/pages/spirit/index.vue`，8.2 合成弹窗**唯一落点**）；资产总览 `frontend/src/pages/assets/index.vue`（引用总册 §9，仅作资产查看与同文案复用）。**落点修正（2026-09-16）**：`frontend/src/pages/market/index.vue` 是**市集页（竹简市集）**、**不承载玉合成 / 分解**——旧口径「玉市页 = 玉合成主入口」**作废** | 合成前弹 8.2 确认、分解前提示返还 999 颗（365 天）；本页承载合成 / 分解入口与确认弹窗，表单与算法口径引用总册 §9 |
| 镶嵌入口 | **本页「家族树凹槽 · 镶玉」区块**（家族树凹槽发起，8.3 不可逆二次确认**唯一落点**）；`frontend/src/pages/hall/index.vue` 入口条**仅作状态展示与跳转**（点击进本页，不承载镶嵌操作） | 选本人**未镶嵌**玉 → 8.3 不可逆二次确认；已满/已镶嵌时按钮置灰显示「凹槽已占用」 |
| 路由与接口 | `frontend/src/pages.json`（新增 `pages/spirit/index`，`navigationBarTitleText: 时流子域`）；`frontend/src/business/api.ts`（新增 `fetchSpirit(treeId)`、**`postSpiritCharge(treeId, plan, token)`**、**`postMountJade(treeId, jadeId, token)`**、**`postSynthesizeJade()`**、**`postDecomposeJade(jadeId)`**）+ `business/index.ts` 转出 | 与总册 §9、`economy-ops.spec.md` §6.1 的 `pages/spirit/index.vue` 落点一致 |
| 命名口径（**前端封装 vs 后端模块**） | 前端封装**一律 `postXxx` 前缀**（实现名）：`postSpiritCharge` / `postMountJade` / `postSynthesizeJade` / `postDecomposeJade`；**`chargeSpirit` / `mountJade` / `synthesizeJade` / `decomposeJade` 是后端模块 `cloudfunctions/compat-api/lib/economy-spirit.js` 的函数名**（§10-1 / P2-1），**不是**前端封装名 | 按旧名 `chargeSpirit(...)` 去 `business/api.ts` 找函数会**找不到**；两套名的对应关系：`chargeSpirit` ↔ `postSpiritCharge`、`mountJade` ↔ `postMountJade`、`synthesizeJade` ↔ `postSynthesizeJade`、`decomposeJade` ↔ `postDecomposeJade` |

### 8-2 五档位选择器

| 项 | 口径 |
|---|---|
| 数据来源 | `GET /spirit` 出参 `plans`（**单一真源**，数值不在前端硬编码） |
| 展示 | 五张卡片（单日 / 月度 / 季度 / 半年度 / 年度）：主行「N 颗石榴籽」、副行「延长 N 天」、赠行「赠 N 束竹简」（无赠则不显示赠行）、活动档位加「限时活动」标签（由 `activity.gift_enabled_plans` 判定） |
| 默认选中 | `daily` |
| 置灰规则 | 可用籽数 < 档位实价 → 该卡片显示「籽不足（需 N 颗）」但**仍可点**（点后由后端 409 给出准确可用数；前端置灰仅体验层，不作为约束） |
| 提交 | 点击「灌注玉露灵泽」→ **8.1 定稿确认弹窗**（§8-3）→ 确认后 `POST /spirit/charge`；**取消则不发请求** |
| 成功反馈 | `uni.showToast`「灌注成功」（非定稿文案，可调）+ 刷新状态卡与流水列表 |
| 失败反馈 | 409 → toast 后端 `error` 原文（如「石榴籽不足：本次需 299 颗，当前可用 12 颗」） |

### 8-3 定稿文案（**文案真源 = `docs/economy-ops.spec.md`（§6.1）；逐字引用，实施不得改写、不得增删标点或【】包裹词**）

> ` / ` = **换行**（每处 ` / ` 渲染为一个换行符）；【】内为运行时填值（口径见表下）。

| # | 名称 | 文案（逐字） | 触发时机 | 本册落点 |
|---|---|---|---|---|
| **8.1** | 灌注玉露灵泽确认 | 「⚠️ 灌注玉露灵泽确认 / 本次操作将消耗【XX】颗石榴籽，为家族谱系大树灌注玉露灵泽，家族灵气到期时间将向后延长【XX】天。/ 消耗时将优先扣除您账户内即将最先到期的石榴籽，消耗后的石榴籽直接消失，不可退回。/ 是否确认继续灌注玉露灵泽？」 | 时流子域页点「灌注玉露灵泽」→ 提交前确认 | `frontend/src/pages/spirit/index.vue`（`pages.json` 注册）；同页承载灵气剩余天数与到期时间 |
| **8.2** | 石榴籽玉合成确认 | 「⚠️ 合成提示 / 本次将消耗999颗石榴籽。/ 若全部999颗石榴籽剩余有效期均≥360天，合成石榴籽玉为永久有效；/ 若存在有效期不足360天的石榴籽，石榴籽玉有效期将取本次所用石榴籽中最早到期的剩余时长。/ 石榴籽玉可免费分解，分解后返还999颗石榴籽，分解所得石榴籽统一拥有365天有效期。/ 请确认是否继续合成？」 | 时流子域页「石榴籽玉」区块 / 资产页点「合成石榴籽玉」→ 提交前确认 | **时流子域页 `frontend/src/pages/spirit/index.vue`（「石榴籽玉」区块 · 唯一落点 · 主入口）**；资产页 `frontend/src/pages/assets/index.vue` 复用同一定稿文案。**旧口径作废（2026-09-16）**：原「玉市页 `frontend/src/pages/market/index.vue`（主入口）」不再成立——`market` 是市集页、不承载玉合成 |
| **8.3** | 石榴籽玉镶嵌不可逆确认 | 「⚠️ 不可逆操作确认 / 您即将把石榴籽玉镶嵌至家族树凹槽。镶嵌后该石榴籽玉将永久销毁，不可取回、不可分解。/ 镶嵌成功将解锁本家族树【时流子域】，您可以通过灌注玉露灵泽维持灵气持续生效。/ 是否确认镶嵌？」 | 时流子域页「家族树凹槽 · 镶玉」区块点「镶嵌」→ 提交前确认（不可逆二次确认） | **时流子域页 `frontend/src/pages/spirit/index.vue`（「家族树凹槽 · 镶玉」区块 · 唯一落点 · 主入口）**；`frontend/src/pages/hall/index.vue` 入口条**仅作状态展示与跳转**（点击进本页镶玉区，不承载镶嵌操作）。**旧口径作废（2026-09-16）**：原「`pages/market/index.vue`（主入口）」不再成立——市集页不承载镶嵌 |

**运行时填值（对齐 `economy-ops.spec.md` §6.3）**

| 文案 | 运行时项 | 填值口径 |
|---|---|---|
| 8.1 | 【XX】颗石榴籽 | 选中档位的**实价**籽数（§6-2，不按折扣换算） |
| 8.1 | 【XX】天 | 选中档位的延长天数（§6-2） |
| 8.2 / 8.3 | — | 无运行时项，整段照抄（含「999」「360」「365」「【时流子域】」字面） |

> 逐字校验口径：以 `economy-ops.spec.md` §6.1 单元格文本为基准做**字节级**比对（含全角标点、`⚠️` 表情、句末「？」），实现与测试均以此为断言。
> **逐字校验结果（2026-09-16）**：8.1 / 8.2 / 8.3 三条副本与真源 §6.1 单元格**字节级一致（3/3）**——字符数 120 / 161 / 103，含 3 处 ` / ` 换行标记、全角标点与 `⚠️` 表情；本册 6 条文案副本合计**字节级一致 6/6**（另 3 条见 §6-5）。
> 真源 §6.1 弹窗共 4 条：8.4（创建家族树确认）落点为建树漏斗 `frontend/src/pages/index/index.vue`，**不属于时流子域**，本册不复制。

### 8-4 `pages.json` 与接口函数

| 文件 | 变更 |
|---|---|
| `frontend/src/pages.json` | `pages` 追加 `{ "path": "pages/spirit/index", "style": { "navigationBarTitleText": "时流子域" } }`（不加入 `tabBar`） |
| `frontend/src/business/api.ts` | `fetchSpirit(treeId)`（`GET /spirit?tree_id=`，含 `X-Tree-Id` 与可选 `Bearer`）、**`postSpiritCharge(treeId, plan, token)`**、**`postMountJade(treeId, jadeId, token)`**、**`postSynthesizeJade()`**、**`postDecomposeJade(jadeId)`**（前端封装名一律 `postXxx` 前缀；`chargeSpirit` / `mountJade` / `synthesizeJade` / `decomposeJade` 是后端模块名，见 §8-1 命名口径行）；`SpiritInfo` / `SpiritLogItem` / `SpiritPlan` 类型导出 |
| `frontend/src/business/index.ts` | 五个函数转出（`fetchSpirit` / `postSpiritCharge` / `postMountJade` / `postSynthesizeJade` / `postDecomposeJade`，与现有 `fetchWallet` / `submitJoinRequest` 同风格） |

---

## 9. 与总册 / 运维册的对齐与差异（改前先读本节）

> **裁定状态（2026-09-16 · 总监终审）**：本表 13 项差异**已由总监终审裁定统一，总册已按裁定同步**；本册保留差异登记作为**历史记录**，实施一律以裁定后的总册 + 本册为准，登记项不再具有待办性质。
> **路由名唯一版本（终审 R6）**：`GET /spirit`、`POST /spirit/mount-jade`、`POST /spirit/charge`；资产侧 `GET /assets/summary`、`POST /assets/synthesize-jade`、`POST /assets/decompose-jade`——本册 §5-1 / §5-2 / §5-3 / §6-1 / §7-1 / §12-1 与之一致，不改名、不设别名。
> **引用约定（终审 R9）**：总册正在修订、§ 号可能变动，本表一律用**章节名**引用总册（如「总册（存储契约）」= `docs/economy.spec.md` 的存储契约章节）。

| # | 项 | 总册 / 运维册现行表述（历史） | 本册（需求原文）口径 | 终审结论 |
|---|---|---|---|---|
| 1 | 蓄能档位数值 | 总册（待确认默认口径：蓄能套餐）原默认数值**低于需求原文**（月度 / 季度 / 半年度 / 年度的实价籽数与赠送竹片数均偏小；原错值已作废，本册不再保留，以免误用） | **本册 §6-2**（需求原文）：实价 **1 / 29 / 109 / 149 / 299** 籽；天数 **1 / 30 / 90 / 180 / 365**；赠送 **0 / 0 / 1 束（限时活动，上限 1 束）/ 2 束 / 8 束** | **采需求原文**：总册该数值行整行按 §6-2 同步（字段名与算法结构不动） |
| 2 | 玉的有效期判定 | 总册（石榴籽玉 · 待确认默认口径）：合成出的玉默认 `expires_at = null`（永久） | **本册 §5-1** 三态判定：参与合成的 999 颗**全部**剩余 ≥ 360 天 → 永久（`null`）；否则取本次所用籽中**最早到期批次**的 `expires_at` 原值 | **采需求原文**：总册同步为本册三态判定 |
| 3 | 镶嵌是否可逆 | 总册（石榴籽玉生命周期 · 玉分解 · 待确认默认口径）曾登记「把已镶嵌玉恢复为未镶嵌态再处置」这类反向路径 | **本册 §5-3**：镶嵌**永久不可逆**——玉永久销毁、不可取回、不可分解、不可二次使用、凹槽永久占用不释放、**无任何反向路由**；已镶嵌玉调分解接口一律 **409** | **采需求原文**：总册删除全部反向操作表述，本册不保留任何此类表述 |
| 4 | 家族树删除后的玉 | 总册（待确认默认口径）：玉**回到未镶嵌**（清除 `mounted_tree_id`），可再次镶嵌 | **本册 §4-1 说明四**：玉视为**已消耗**——**不返还、不可重镶**；`jiazu_spirit[tree_id]` 记录**保留**、`status` 置 `'expired'` | **采需求原文（终审 R5）**：总册删除「回到未镶嵌」表述 |
| 5 | `inactive` 定义 | 总册（存储契约 · 惰性结算）：`inactive` = 「从未镶嵌玉（或玉已不存在）」 | **本册 §4-1**：无 `jiazu_spirit.trees[tree_id]` 记录 = 未镶嵌（在四态之外）；有记录且 `status='inactive'` = 已镶嵌、未灌注 | **采需求原文**：总册该行措辞按本册改写 |
| 6 | `buffer_until` 有值范围 | 总册（存储契约，`jiazu_spirit` 字段注释）：仅 `status='buffer'` 时有值 | **本册 §4-5**：`buffer` 与 `expired` 均保留（便于追溯）、`active` / `inactive` 一律 `null` | **采拍板口径（本册细化）**：总册注释补「及 `expired`」；一句话可改回 |
| 7 | 单测文件名 | 总册（测试与约束）：`lib/economy-spirit.test.js` | **本册 §10-1**：`lib/economy-spirit.test.js` —— 总册与本册**已一致**，唯一登记名 = `lib/economy-spirit.test.js` | **已由总监终审裁定统一命名**：历史旧名一律作废、不再登记 |
| 8 | 前端路由注册 | 总册（前端落点与入口）只列 `pages/assets/index`、`pages/market/index`（**注（2026-09-16）：`pages/market/index` = 市集页，与玉合成 / 分解 / 镶嵌落点无关**） | **本册 §8-4** 追加 `pages/spirit/index` | **采需求原文**：总册该行补一条（运维册文案清单已指向同一页面，无需改） |
| 9 | `GET /spirit` 读权限 | 总册（权限口径）：guest 可读状态与到期日 | 需求：流水**家族全体成员**可见、guest 不可见 → **本册 §7-2**：guest 读**摘要**、`logs` 仅成员（两者合并执行，无冲突） | **采需求原文**：实施按 §7-2，总册权限行不动 |
| 10 | 灌注 / 镶嵌权限 | 总册（权限口径）：本树 `tree_steward` / `chief_editor` | **任何已登录用户**均可灌注与**镶嵌（同权）**；流水 = 该树成员可见全量（K1 定稿 · Kevin 2026-09-16 拍板） | **采拍板口径（K1）**：总册权限行按本册 §5-3 / §6-1 / §13 #2 同步（放开为**已登录用户**，去掉本树 `tree_steward` / `chief_editor` 档；不再有 403） |
| 11 | 分解 / 合成路由归属 | 总册（写接口清单）：`/assets/synthesize-jade`、`/assets/decompose-jade`（资产域） | 本册沿用同名路由，算法在 **本册 §5-1 / §5-2** | **采拍板口径**：沿用；实现挂资产批次 |
| 12 | 家族储籽 | 总册（部署要点 · 钱包收缩）：`trees[tree_id].balance_cents` 与 `transferToTree` 下线 | **本册 §6-1** 同一口径（取消家族账户储籽模式，灌注只消耗**个人**籽） | **采拍板口径**：无需改 |
| 13 | 站内信类型枚举 | 运维册（消息字段）：落库 `Message.type` 枚举 = `expiring`（资产到期）/ `spirit`（灵气三条）/ `market` / `system`；`spirit_30` / `spirit_buffer` / `spirit_7` 由惰性预警算法内部作场景标签使用 | **本册 §6-5** 以场景标签登记三条预警，并新增 `spirit_charged`（灌注成功提醒）场景；6 条文案副本已与真源字节级一致 | **采文案真源（运维册）**：文案、落库 `type` 枚举与 `warned` 键形一律以真源册为准；`spirit_charged` 的落库 `type` 随真源册枚举行增补后生效 |
---

## 10. 测试与约束

### 10-1 单测文件：`cloudfunctions/compat-api/lib/economy-spirit.test.js`（`node --test`）

数据安全基线照 `lib/node-delete.test.js` 的模式：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 `/tmp` 副本，文末 md5 断言真源未变。

| # | 用例 | 断言要点 |
|---|---|---|
| 1 | 合成 · 全永久态 | 参与的全部批剩余 ≥ 360 天 → 新玉 `expires_at === null`、`permanent: true` |
| 2 | 合成 · 取最早到期态 | 存在 < 360 天的批 → 玉 `expires_at` = 本次所用籽中最早到期批的 `expires_at` **原值** |
| 3 | 合成 · 阈值边界 | 恰好 360 天 → 永久（`>=` 判定，不用自然日四舍五入） |
| 4 | 合成 · 不足 999 拦截 | 409；`seeds` 与 `jades` **都不变**（无部分扣减）、无新 `Tx` |
| 5 | 合成 · FIFO 与拆批 | 最早到期批先扣；跨批取用后，被部分取用的批剩余 `qty` 正确且 `expires_at` 不变；无 `qty = 0` 残留批 |
| 6 | 合成 · 流水 | 新增 `Tx.type = 'jade_synthesize'`，`delta.seeds = -999`、`delta.jades = +1` |
| 7 | 分解 · 返还与有效期统一 | 返 999 籽、单一新批 `expires_at = now + 365 天`、`source = 'jade_decompose'`；**永久玉分解同样产 365 天籽**（无永久籽） |
| 8 | 分解 · 守卫 | 玉不存在 → 404；已镶嵌（`mounted_tree_id` 非空）→ 409；两种情况资产不变 |
| 9 | 镶嵌 · 建立与初态 | 200；`jiazu_spirit.trees[tree_id] = { jade, spirit_expires_at: null, buffer_until: null, status: 'inactive', logs: [] }`；个人侧 `mounted_tree_id` 落库 |
| 10 | 镶嵌 · 幂等与不可逆 | 同树二次镶嵌 → 409「凹槽已镶嵌石榴籽玉」；同一玉在另一树 → 409「已镶嵌，不可重复使用」；均无副作用 |
| 11 | 镶嵌 · 前置校验 | 未登录 401；**非本树成员的普通登录用户镶嵌成功（200，无 403 档）**；总谱 400 / 树不存在 404 / 缺参 400 |
| 12 | 蓄能 · 五档位逐档 | 五档各自 `seeds_deducted` = 1 / 29 / 109 / 149 / 299，`days` = 1 / 30 / 90 / 180 / 365，`SpiritLog` 五字段（`plan/seeds/days/gift_bamboos/spirit_expires_at_after`）正确 |
| 13 | 蓄能 · 叠加不覆盖 | `active` 期灌注 → 新到期 = 原到期 + days（≥ `now + days`）；连续两档 → 天数累加不丢 |
| 14 | 蓄能 · 缓冲期与失效后灌注 | `buffer` 期灌注 → `status='active'`、新到期 = `max(now, 原到期) + days`；`expired` 期灌注 → `now + days`、`buffer_until` 清空 |
| 15 | 蓄能 · 不足整单拒绝 | 409；籽不变、`spirit_expires_at` 不变、`logs` 不追加、无竹片、无站内信 |
| 16 | 蓄能 · 赠送竹简 | 常态：`half_year` 200 片、`yearly` 800 片，`BambooLot.qty` 以**片**计、`expires_at = now + 365 天`、`source = 'spirit_gift'`；开关未设 → `quarterly` = 0 片；开关设 `quarterly` → 100 片 |
| 17 | 蓄能 · 未镶嵌拦截 | 无 `jiazu_spirit.trees[tree_id].jade` → 409 |
| 18 | 站内提醒 | 灌注后 `jiazu_messages.items[收件人]` 新增 1 条 `type='spirit_charged'`、`text` = §6-5 定稿全文；`warned['spirit_charge:<tree_id>:<log_id>']` 落库；重复读消息不重复生成 |
| 19 | 状态机四态 | `active → buffer`（`now >= spirit_expires_at`，`buffer_until = exp + 30 天`）→ `expired`（`now >= buffer_until`）；`buffer_until` 在 `active` 态为 `null` |
| 20 | 惰性推进不依赖定时任务 | 仅调用 `GET /spirit` 即完成全部推进；断言实现中无 `setInterval` / `setTimeout` 驱动的状态推进、无 cron 注册 |
| 21 | 流水可见性 | 成员（锚点命中 `tree_id`）→ `logs` 非空 + `logs_visible = true`；**登录非成员 → 按成员口径处理：`logs = []` + `logs_visible = false` + `logs_notice`（不因 K1 放开写权而可见）**；guest（无 Bearer）→ 仅摘要、`logs = []`；树不存在 404；缺 `tree_id` 400 |
| 22 | 文案逐字 | 8.1 / 8.2 / 8.3 三段与 `economy-ops.spec.md` §6.1 单元格**字节级一致**（可作为前端常量断言用例） |
| 23 | **真源未变** | `migrate-output/trees/*.json`、`migrate-output/details/*.json`、`config/tree-meta.json`、`migrate-output/collections/*.json` 的 md5 与测试前逐字节一致 |
| 24 | 家族树删除后（**终审 R5**） | 删树后 `jiazu_spirit.trees[tree_id]` 记录**保留**且 `status = 'expired'`；该树已镶嵌玉**不返还**（`jades` 不新增、不产 `SeedLot`、`mounted_tree_id` 留痕保留）、**不可重镶**（同树再次镶嵌 → 404「家族树不存在」）；无任何把玉恢复为未镶嵌态的写入 |
| 25 | **权限放开（K1 · 已定稿（Kevin 2026-09-16 拍板））** | **非本树成员的普通登录用户**（`user`，锚点不在该树）`POST /spirit/charge` → **200**，灵气顺延、`SpiritLog.phone` 记其手机号；同种账号 `POST /spirit/mount-jade` → **200**（镶嵌与灌注同权）；未登录 → **401**；**非成员读流水按成员口径处理**：该账号 `GET /spirit` → `logs = []`、`logs_visible = false`、`logs_notice` = §7-2 文案，`can_charge = true` |

### 10-2 注册与门禁

| 项 | 口径 |
|---|---|
| `package.json` | `scripts.test` **末尾追加** `cloudfunctions/compat-api/lib/economy-spirit.test.js`（保持现有 14 个测试文件不变、纯追加不重排） |
| `npm test` | 必须全绿（当前 150/150）；新文件未注册 = 等于没测 |
| 前端 | `npx vue-tsc --noEmit` 必须 exit 0；新增页面须进 `pages.json` |
| 写路径约束 | 一律经 `lib/store.js` 的 `colGet` / `colSet`（local 模式自动落 `migrate-output/collections/<col>.json`）；禁止任何路径直写 `jiazu_spirit` / `jiazu_assets`；单测不得触碰 `migrate-output/` 真源与 `config/tree-meta.json`（沙箱护栏） |
| 不变量 | `status` 与 `spirit_expires_at` / `buffer_until` 推导结果一致；灵气到期时刻只增不减；无负资产；`logs` 只追加 |

---

## 11. 实施清单（P2 档，可再细分）

| 批次 | 内容 | 依赖 | 验证 |
|---|---|---|---|
| **P2-1** | `cloudfunctions/compat-api/lib/economy-spirit.js`（新，纯模块）：`PLANS` 五档表、`GIFT_ACTIVITY` 读取、`settle(entry, now)`、`synthesizeJade`、`decomposeJade`、`mountJade`、`chargeSpirit`、`spiritView`；复用总册的 `sweep` / `consumeFIFO` 与 `lib/store.js` 访问层 | 总册（§5-2 / §5-4 / §4-2） | 单测 #1–#17 |
| **P2-2** | `cloudfunctions/compat-api/index.js` 路由接线：`GET /spirit`、`POST /spirit/charge`、`POST /spirit/mount-jade`；**必须挂在树编辑闸门之前**（`缺少 X-Tree-Id` 判定位于 `index.js` 341 / 949 / 1178 / 1249 / 1586 行）；`GET /spirit` 自取 query 参数 `tree_id` | P2-1 | 单测 #11 / #21 / #25 + HTTP 探针（401 / 404 / 409 / 200；已无 403 档） |
| **P2-3** | 站内提醒：`type='spirit_charged'` 写入 `jiazu_messages`（复用 ops 册的 `Message` 形态与 `warned` 去重机制） | P2-1；`economy-ops.spec.md` §4 | 单测 #18 |
| **P2-4** | 前端：新建 `frontend/src/pages/spirit/index.vue` + `pages.json` 注册；`hall` 顶部入口区块；`mine` 功能菜单入口；`business/api.ts` 三函数 + `business/index.ts` 转出 | P2-2 | `vue-tsc --noEmit` exit 0；UI 实测（三态渲染、流水可见性） |
| **P2-5** | 定稿文案接线：8.1 灌注确认（本页「玉露灵泽蓄能」区块）、8.2 合成确认（本页「石榴籽玉」区块 / 资产页）、8.3 镶嵌不可逆确认（本页「家族树凹槽 · 镶玉」区块）；**取消一律不发请求**。**落点口径**：三张弹窗唯一落点 = `pages/spirit/index.vue`（见 §8-1 收口声明，旧「玉市页主入口」口径作废） | P2-4；`economy-ops.spec.md` §6.1 | 单测 #22 + 手工逐字比对 |
| **P2-6** | 收尾：`lib/economy-spirit.test.js` 注册进 `scripts.test`；`jiazu_spirit` 补进 `COLLECTIONS`；`PENDING_DEPLOY.md` 记录本批待上云条目（§12） | P2-1…P2-5 | §10-1 全绿 + 真源 md5 未变 |

---

## 12. 部署要点

### 12-1 新增路由清单（本册 3 条 + 引用 2 条）

| 路由 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/spirit` | GET | guest 可读（`tree_id` 必填） | 灵气状态 + 到期日 + 缓冲截止 + `logs`（流水仅成员，§7-2） |
| `/spirit/charge` | POST | **任何已登录用户**（K1 定稿） | 玉露灵泽蓄能（五档位、FIFO 扣籽、叠加顺延、赠竹片） |
| `/spirit/mount-jade` | POST | **任何已登录用户**（K1 定稿，与灌注同权） | 镶嵌（凹槽唯一、不可逆、幂等拒绝） |
| `/assets/synthesize-jade` | POST | 已登录 `user` | **由总册资产批次上线**；算法在本册 §5-1 |
| `/assets/decompose-jade` | POST | 已登录 `user` | **由总册资产批次上线**；算法在本册 §5-2 |

> 实现位置硬约束：上述 5 条必须注册在 `index.js` 的树编辑闸门（`缺少 X-Tree-Id`，见 341 / 949 / 1178 / 1249 / 1586 行）**之前**，否则无 `X-Tree-Id` 的账号级请求会先被 400 拦掉；仅 `GET /spirit` 需要 `tree_id` 参数。
> 上线动作（沿用 `docs/PENDING_DEPLOY.md` §1）：`npx esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js` → `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`。

### 12-2 新集合

| 集合 | 用途 | 动作 |
|---|---|---|
| `jiazu_spirit` | 时流子域（`trees` 凹槽 / 灵气 / 流水） | 必须并入 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（当前列表 7 个基础集合；与总册/运维册批次合并后同批补入 `jiazu_assets` / `jiazu_spirit` / `jiazu_market` / `jiazu_messages` / `jiazu_ops_logs`），否则云端 `POST /spirit/charge` 首写报错 |

> 本地模式对应 `migrate-output/collections/jiazu_spirit.json`（由 `lib/store.js` 的 local 分支自动落盘，无需手工建文件）。

### 12-3 `docs/PENDING_DEPLOY.md` 候选条目（本册追加，不本轮写入）

| # | 条目 | 说明 |
|---|---|---|
| 1 | 路由：`GET /spirit`、`POST /spirit/charge`、`POST /spirit/mount-jade` | 需重打包 `compat-api` 后部署；本地验证 = 单测 #11 / #12 / #21 + HTTP 探针 |
| 2 | 集合：`jiazu_spirit` | 补进 `COLLECTIONS`，否则云端首写报错 |
| 3 | 前端产物：`pages/spirit/index`（新）+ `hall` 顶部入口 + `mine` 入口 | 必须重打包 `build:h5` / `build:mp-weixin`，否则线上无时流子域页；**8.1 / 8.2 / 8.3 三张定稿弹窗全部落在该页**（`market` 页是市集页、不承载玉操作——旧口径作废，见 §12-3 收口声明） |
| 4 | **真二级域名绑定**（留部署阶段） | 家族专属空间的真域名绑定（`*.jiazutong.cn` 或等价形态）本轮不做；本轮只落平台内页面 + 灵气到期日/状态数据 |
| 5 | **定时任务与推送**（留部署阶段） | 灵气到期 / 缓冲期预警（M2 / M3 / M4）与灌注提醒（`spirit_charged`）的准点触达；形态 = 定时触发器复用同一 `settle` + `ensureWarnings`，文案与去重键不变 |
| 6 | 云函数环境变量 `SPIRIT_GIFT_ACTIVITY` | 临时活动赠送开关（缺省不设 = 关闭）；开启/关闭仅需改环境变量，无需改代码 |

> **落点口径收口（2026-09-16 · 部署与验收唯一依据）**：8.1 / 8.2 / 8.3 三张定稿弹窗的部署落点 = **新建独立页 `frontend/src/pages/spirit/index.vue`**（8.1 →「玉露灵泽蓄能」区块 / 8.2 →「石榴籽玉」区块 / 8.3 →「家族树凹槽 · 镶玉」区块）；
> `frontend/src/pages/hall/index.vue` **仅作状态展示与跳转**；`frontend/src/pages/market/index.vue` 是**市集页（竹简市集）**、**不承载玉合成 / 分解 / 镶嵌**。
> 任何把 `market` 页写作玉合成 / 分解 / 镶嵌落点（含「主入口」字样）的旧表述**一律作废**，部署与冒烟不得再按旧口径检查；本册 §8-1 / §8-3 / §11 P2-5 / §12-3 已按此口径同步。

### 12-4 部署后冒烟

1. `GET /spirit?tree_id=<tree_id>`（无 Bearer）→ 200 摘要、`logs_visible = false`；缺 `tree_id` → 400；不存在的树 → 404。
2. 合成：籽 < 999 → 409；籽 ≥ 999 → 200 且 `expires_at` 与 §5-1 判定一致（全 ≥ 360 天 → `null`）。
3. 镶嵌：同树第二次 → 409；`zhonghua` → 400；成功后 `GET /spirit` 返回 `status='inactive'`。
4. 蓄能：`daily` 档 → `spirit_expires_at = now + 1 天`；再灌 `monthly` → 到期日 **在原值上 +30 天**（叠加不覆盖）；籽不足 → 409 且数据未变。
5. 状态推进：把 `spirit_expires_at` 手工置为过去 → `GET /spirit` 立即返回 `buffer` + `buffer_until`；再置 `buffer_until` 为过去 → 返回 `expired`。
6. 流水与提醒：成员账号 `GET /spirit` 可见 `logs`；非成员/guest 不可见；`GET /messages` 能读到 `spirit_charged` 全文。
7. **K1 权限放开**：非本树成员的普通登录账号灌注 `daily` → 200（不再 403）、灵气顺延；同一账号 `GET /spirit` → `logs = []`（非成员仅摘要）；未登录请求写路由 → 401。

---

## 13. 待确认的默认口径（按此实现，如不符一句话即可改）

> 裁定状态：**#1（镶嵌后不自动赠送初始灵气）/ #2（灌注与镶嵌权限）/ #3（可镶嵌的树含祖谱）/ #5（临时活动赠送默认关闭）已由 Kevin 2026-09-16 拍板定稿**（逐条标注「**已定稿（Kevin 2026-09-16 拍板）**」，正文 §2-2 #4 / §5-3 / §6-1 / §6-2 / §6-4 / §6-6 / §7-2 / §12-1 已同步）；**#9 已由终审裁定锁定（R5）**，不再作为可改口径；**其余条目（#4 / #6 / #7 / #8 / #10 / #11）未涉本轮裁定，维持原默认口径、一句话可改、不删**。

| # | 默认口径 | 一句话改法 |
|---|---|---|
| 1 | **已定稿（Kevin 2026-09-16 拍板）**：镶嵌后**不赠送**初始灵气 —— `status` 初始 = `'inactive'`，首次灌注后转 `'active'`（K6；见 §2-2 #4 / §5-3） | —（已定稿，不再作为可改口径） |
| 2 | **已定稿（Kevin 2026-09-16 拍板）**：灌注与镶嵌**同权** = **任何已登录用户**（不判本树 `tree_steward` / `chief_editor`、不判锚点，未登录 401）；流水 = **该树成员可看全量灌注流水**，guest 与登录非成员仅摘要（K1） | —（已定稿；总册权限行按本册同步） |
| 3 | **已定稿（Kevin 2026-09-16 拍板）**：可镶嵌的树 = `tree-meta` 注册的**非总谱**树 —— `kind='family'` 与 `kind='clan'`（祖谱）**均可**镶玉；`kind='master'`（`zhonghua` 中华世本）拒绝（K2） | —（已定稿，不再作为可改口径） |
| 4 | 站内提醒收件人 = 该树锚点用户 + 该树 `tree_steward` + 全部 `chief_editor` + 灌注者本人（沿用 `economy-ops.spec.md` §10-6） | 收件人集合改一处函数 |
| 5 | **已定稿（Kevin 2026-09-16 拍板）**：临时活动赠送**默认关闭**（`SPIRIT_GIFT_ACTIVITY` 缺省未设 → `quarterly` 赠送 0 片）；开启时 `quarterly` 上限 1 束（K5） | 云函数环境变量设 `quarterly`（开启）/ 清空（关闭）——**本轮维持默认关闭** |
| 6 | 缓冲期内**子域功能保留**（仅提示续期），`expired` 起才停用入口 | 缓冲即停用：把「停用」判定从 `expired` 改为 `status !== 'active'` |
| 7 | `logs` 出参上限 = 最近 **100** 条（倒序）+ `logs_total`；分页参数留部署阶段 | 改一处常量 |
| 8 | 玉的镶嵌后记录**保留**（个人侧打 `mounted_tree_id`）而非物理删除；「永久销毁」= 用户视角不可取回 / 不可分解 / 不可二次使用 | 改为物理删除：去掉一处字段写（同时补一条 `Tx` 说明去向） |
| 9 | **（已裁定锁定 · 终审 R5，不再作为可改口径）** 家族树删除后：`jiazu_spirit[tree_id]` 记录保留、`status` 置 `'expired'`；已镶嵌玉**不返还、不可重镶**（已销毁），个人侧 `mounted_tree_id` 去向留痕保留 |
| | 改法 | —（终审已锁定；总册已同步删除「回到未镶嵌」表述） |
| 10 | `GET /spirit` 的 `plans` 由接口下发（单一真源），前端不硬编码档位数值 | 改为前端常量：删一处出参、加一处前端常量 |
| 11 | 灌注确认文案 8.1 的【XX】取值 = 档位**实价**（不按折扣列换算） | 若改为按折扣计算：改一处取数（同时改 §6-2 列口径） |

---

## 14. 玉归属（口径 v6）+ 注入者反查 + 已镶嵌玉永久占用（**追加章节 · Zang 裁定 v6 / v6-附 · 2026-09-24**）

> **性质（`AGENTS.md` §0 第 4 / 5 条）**：本节为**追加章节** —— 本册 **§0–§13 的既有行一律原文保留**；本节不改写、不重排任何历史行。
> **与 §13 第 8 条的关系**：§13 第 8 条已定「玉的镶嵌后记录**保留**（个人侧打 `mounted_tree_id`）而非物理删除；『永久销毁』= 用户视角不可取回 / 不可分解 / 不可二次使用」（该条**原文保留、继续有效**）；本节把同一事实**细化为读侧归属口径与展示口径**，二者**不冲突**。
> **范围**：`jiazu_assets` 玉的**读侧归属**（用户面 / 后台管理面两种口径）、`GET /spirit` **新增出参 `injector`**（注入者反查 + 三态 + 手机号不下发）、已镶嵌玉的**到期语义**与展示口径、前端落点变更；**零迁移 / 零新字段 / 零新集合 / 零新枚举 / 零落写**（不新增路由 —— `injector` 挂在既有 `GET /spirit` 出参上）。
> **字面纪律**：本节口径与逐字文案取自 **2026-09-24** 实测读到的代码（行号为该次读数）；展示层完整口径（行囊 / 布局 / 拖曳）见 `docs/economy.spec.md` **§14**；上云动作与判据见 `docs/PENDING_DEPLOY.md` **§32**。

### 14-1 归属总则（已镶嵌玉**不再属于个人**）

- **真源不变**：`jiazu_assets` 单文档（`_id = 'global'`，§3-2）的 `users[phone].jades[]`；镶嵌 = 给该枚玉打 `mounted_tree_id`（既有写法，`lib/economy-spirit.js` 的镶嵌落点）。
- **v6 语义**：`mounted_tree_id` **非空** ⇒ 该玉**归属家族树（凹槽永久占用）、不再属于个人** ⇒ **个人面读侧一律不含它**（不计枚数、不入行囊、不渲染、不参与溢出）。
- **原始记录不迁移、不删除、不改写**：实现 = **读侧过滤**（`filter`），真源里那枚玉连 `mounted_tree_id` **原样保留** —— 用途 = `GET /spirit` 注入者反查 + 凹槽去向追溯（后台面仍可见）。
- 落点（逐字注释）：`lib/economy-ledger.js:362-378`（`summarize` 的玉过滤与 `jades_total` 同口径）；`lib/economy-ops.js:640-641`（后台口径理由）。

### 14-2 两种口径（**用户面 / 后台管理面**，不得互相套用）

| 面 | 路由 | 玉出参口径 | 出处（2026-09-24 实测） |
|---|---|---|---|
| **用户面** | `GET /assets/summary` | **只返未镶嵌玉**；`jades_total` **同口径**（只计未镶嵌）；出参**不带** `mounted_tree_id`；全为已镶嵌 ⇒ `jades = []` / `jades_total = 0`（不崩、不给空壳项） | `lib/economy-ledger.js:362-378 / 389` |
| **后台管理面** | `GET /admin/assets/user`（`chief_editor`） | **全量原始记录**：`summarize(assets, now, { include_mounted: true })` ⇒ 枚数（`jades`）与 `jade_list` **均含已镶嵌**、**保留 `mounted_tree_id`**（顺序同真源） | `lib/economy-ops.js:640-641 / 652 / 658 / 661` |
| 路由层 | — | **本批未新增 / 未改路由字面**（`/assets/summary` = `index.js:654`、`/admin/assets/user` = `index.js:894`）；口径差异**只**由 `summarize` 的 `opts.include_mounted` 承载 | `cloudfunctions/compat-api/index.js:654 / 894` |

- **两端口径分开是裁定，不是实现自由**：后台必须能答「**已镶嵌玉去哪了、镶进哪棵树**」（`economy-ops.js:640-641` 逐字）⇒ 后台页「`· 已镶嵌 <tree_id>`」展示分支**可达，不是死代码**。
- **两条读侧均零落写**：用户面与后台面都只 `filter` + `map`，**真源一字节不动**（本轮新增用例「`GET /assets/summary` 玉归属（v6）」断言真源仍 5 枚、顺序不变、`mounted_tree_id` 原样）。
- **前端对应**：资产页玉枚数只计未镶嵌（`pages/assets/index.vue:89 / 211`，`filter` 为幂等防御）；行囊玉格只收未镶嵌（`frontend/src/business/inventory.ts:182`）。

### 14-3 注入者反查（`GET /spirit` 新增出参 `injector`）

| 项 | 口径 | 出处 |
|---|---|---|
| 出参 | `injector = { nickname, person_handle } \| null`；**未镶嵌 → `null`**（`injector: mounted ? await injectorOf(treeId) : null`） | `lib/economy-spirit.js:763` |
| 反查链（**读侧反查 · 零迁移 / 零新字段 / 零新集合**） | `jiazu_assets`（`users[phone].jades`）中找 `mounted_tree_id === tree_id` 的那枚玉 → 持有者手机号 → `jiazu_users` 昵称 + `jiazu_anchors` 锚点（`tree_id` / `person_handle`） | `lib/economy-spirit.js:699-716` |
| **手机号不下发** | 出参**只含 `nickname` 与 `person_handle`**；**昵称缺失时脱敏兜底** = 脱敏手机号（`maskPhone`：`前 3 + **** + 后 4`） | `lib/economy-spirit.js:678-682 / 711` |
| 只读性 | 全程 `colGet` **只读**（不 `sweep`、不回写 ⇒ 不扰动真源） | `lib/economy-spirit.js:699-716` 注释逐字 |
| **三态兜底** | ① **可点档案卡**（反查到 + 锚点 `tree_id === tree_id`）⇒ `{ nickname, person_handle }`；② **`注入者无本树节点`**（反查到 + 无锚点 / 锚点跨树 ⇒ `person_handle = null`）；③ **`注入者信息不可考`**（反查不到 ⇒ `injector = null`） | `lib/economy-spirit.js:707-716`；`pages/spirit/index.vue:49-59` |

- **前端展示（逐字）**：主文案 = **`此玉由 {{ injector.nickname }} 注入`**；② 态纯文本兜底、③ 态纯文本兜底；① 态给**节点卡片**（`查看注入者档案 ›`）→ 点击跳**人物档案页**（`uni.navigateTo('/pages/person/detail?tree_id=<tree_id>&handle=<person_handle>')`，跳转口径同 `components/person-detail-modal`）（`pages/spirit/index.vue:49-59 / 572-576`）。
- **未镶嵌 / 反查不到一律不展示注入者区块**（`injector` 为 `null` 时仅出兜底文案；页面不因反查失败而报错）。
- ⚠️ **姓名面口径（如实登记）**：`nickname` 来自 `jiazu_users`；**昵称缺失时下发脱敏手机号** ⇒ 前端展示的是脱敏串，**不是**「无昵称」文案；本册**不另立**「匿名」文案。

### 14-4 已镶嵌玉的到期语义（v6-附：**永久占用**；到期不影响任何行为）

- **口径**：已镶嵌玉 = **永久占用、等价永久玉**；**到期不影响任何行为**（凹槽占用、灵气状态机、可灌注 / 可续期判定均**不看**该玉的 `expires_at`）。
- **核实（2026-09-24 只读实测）**：`jadeExpired` **仅两处使用** —— ① **未镶嵌玉的分解**（`lib/economy-spirit.js:449`）② **镶嵌前置**（`:494`）；凹槽槽位里的 `jade.expires_at` **仅被记录**（`:498`，槽位字段 `{ jade_id, mounted_at, expires_at }`）与**回传**（`:509 / :555`）⇒ **不参与任何后续行为判定**。
- **展示口径**：**不再渲染「玉有效期 至 <日期>」**；已镶玉统一 = **`永久有效（镶嵌即永久占用）`**（`pages/spirit/index.vue:46`；原文案 `玉有效期 {…}` 已删除）。
- **不改既有口径**：本节**不改** §4 灵气状态机（只看 `spirit_expires_at` / `buffer_until`）、**不改** §5-4 玉状态矩阵中「**未镶嵌**玉过期 ⇒ 404」的判定（那两条只作用于未镶嵌玉）。
- **与 §13 第 9 条的衔接**：家族树删除后已镶玉**不返还、不可重镶**（终审 R5 锁定）——本条与其一致（「永久占用」即可解释为何不返还）。

### 14-5 前端落点变更（本批 · 与 §8-1 并读，**§8-1 原文保留**）

| 页面 | 变更（逐字 / 实测） | 出处 |
|---|---|---|
| `pages/spirit/index.vue` | ① **移除玉操作区**（合成 / 分解 整块「石榴籽玉」区块与相关 import / state / 函数）⇒ 注释逐字「合成 / 分解：**已迁至「我的 → 行囊」**」；页面区块顺延（现 ④ = 灌注流水）；② 已镶玉区块新增**注入者**展示（§14-3）并把到期行改为 **`永久有效（镶嵌即永久占用）`**；③ **镶嵌入口 / 五档位 / 流水区不变** | `spirit/index.vue:46-59 / 153 一带（区块删除）/ 572-576` |
| `pages/assets/index.vue` | ① **移除**签到按钮 ② **移除**「合成石榴籽玉」按钮 + 提示 ③ **移除**「我的玉」整段列表（含逐枚【分解】）④ **删除碎片 9 格进度条**（`frag-grid` / `frag-cell`，**保留数值行**「N / 9 · 满 10 自动合成 1 颗石榴籽」）⑤ 玉枚数**只计未镶嵌** | `assets/index.vue:46 / 89 / 211`（+ diff 四处删除） |
| `pages/mine/index.vue` | 新增**行囊卡**（用户卡正下方）+ **签到印章卡**（行囊卡下方、**无进度条**）；签到 toast 逐字 = **`获得石榴籽碎片 +1`**（触发自动合成时追加 **`满 10 已合成 N 颗石榴籽`**） | `mine/index.vue:35-58 / 411-412` |

> ⚠️ **上表第 3 行的签到 toast 文案**与行囊 / 布局 / 拖曳等**全部展示层口径**，一律以 `docs/economy.spec.md` **§14-3** 为准（本册不重复登记展示文案，避免两套字面）。

### 14-6 未决项 / 已接受差异

| # | 项 | 状态 |
|---|---|---|
| 1 | **小程序端未真机实测** | 承 `docs/economy.spec.md` §14-8 #1（本批只做 H5 实测） |
| 2 | **注入者反查为 O(n) 遍历**（`jiazu_assets` 全 `users` 扫一遍找 `mounted_tree_id`） | 如实登记：当前**单文档 `global`** 形态下即为全表扫；**未做索引 / 未做缓存**（若日后按 §10 的多实例重构，须同步评估该反查的代价） |
| 3 | **同一棵树若被多枚玉「注入」** | 按实现 = 取**首个命中**（`for … of` + `break`）⇒ 展示单一注入者；**本批无多玉注入的正例**（镶嵌前置保证唯一凹槽），登记为已知边界 |
| 4 | **`pages/spirit/index.vue` 仍自带玉文案第三份副本** | 承 `docs/economy.spec.md` §14-7 第 8 行（未收敛，待后续批次） |

> **与其它分册的关系**：① **展示层完整口径**（行囊 36 栏位 / 换算 / 默认序 / 溢出 / 拖曳 / 布局） = `docs/economy.spec.md` **§14**（本节只登记域口径与反查链路）；② **计费**：合成 / 分解仍是既有路由与既有计费口径（`docs/economy-fee.spec.md`），**本批零计费改动、零新计费入口**；③ **上云动作与判据** = `docs/PENDING_DEPLOY.md` **§32**。
