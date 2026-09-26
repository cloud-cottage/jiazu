# 运营后台资产运维 / 站内信预警 / 签到与获取规则 / 全场景文案清单 — 分册规格（economy-ops.spec.md）

> 状态：**规格已定稿，尚未实施**（本册只定契约与文案，不含代码）。
> 真源级别：分册。**字段名 / 集合名 / 算法 / 路由语义一律以总册 `docs/economy.spec.md` 为准**，本册只引用与展开，不另立口径；
> 与总册的**全部差异集中登记在 §12**（7 项差异已逐条裁定：第 1–6 项由总监终审，第 7 项由 Kevin 2026-09-16 拍板，无待裁定项）。
> 关联：总册 `docs/economy.spec.md`（字段与算法唯一权威）、`docs/economy-fee.spec.md`（费用）、`docs/economy-market.spec.md`（市集）、
> `docs/data-model.md`（存储/API 契约）、`docs/permission-tier.spec.md`（角色档位）、`docs/PENDING_DEPLOY.md`（部署清单）、
> 代码 `cloudfunctions/compat-api/lib/store.js`、`lib/wallet.js`、`cloudfunctions/compat-api/index.js`、`frontend/src/pages/admin/index.vue`。

---

## 1. 范围与不变量

### 1.1 本册管什么 / 不管什么

| | 内容 |
|---|---|
| **本册管** | 资产获取规则总表、签到（`POST /assets/signin` 的行为细则）、站内信（`jiazu_messages` 的 `Message` 形态 + 四类预警 + 去重键 + 已读）、运营后台资产运维（`grant` / `logs` / 用户资产快照）、全场景定稿文案清单与前端落点、注销清空口径、测试与部署要点 |
| **本册不管**（一律以总册为准） | 四级资产定义与价值基准、碎片合成算法与 FIFO/整单拒绝算法、`sweep` 惰性结算、建树扣 9 籽与返还、灵气套餐与状态机、玉合成/拆解/镶嵌、市集全部规则、官方竹简发售；¥ 人民币钱包（`lib/wallet.js`） |

### 1.2 六条不可变口径（本册所有条款不得与之冲突）

1. **无负资产**：任何扣费/消耗场景余额不足**一律拦截**，任何场景都不允许资产为负，无豁免（总册「核心算法」）。
2. **注销即清空**：账号注销后个人账户内全部石榴籽、碎片、竹片清空，**数据不可恢复**（总册「核心算法」）。
3. **后台操作全留痕**：运营后台每一次增减都写 `jiazu_ops_logs`，记录**操作人**与**原因**；`reason` 缺失即拒绝（总册「存储契约」）。
4. **预警走惰性生成**：按 `now` 在资产入口补齐未生成过的预警（`jiazu_messages.warned` 去重），**本轮不依赖定时任务**（总册「待确认默认口径」）。
5. **签到按自然日**：每自然日 1 碎片、无连签/补签（总册「待确认默认口径」）；`signin_date` 判重。
6. **文案即契约**：本册 §6 的文案逐字生效，实施不得改写、增删标点或【】包裹词；**§6 是全部弹窗（8.1–8.4）与全部站内信（4 条）合计 8 条文案的唯一真源**，其它分册一律引用本册。

### 1.3 先行规则：一切资产入口先 `sweep(now)`

按总册（核心算法），**任何资产读/写入口先执行 `sweep(now)`**（剔除过期批次 + 推进灵气状态机），之后才执行业务逻辑。
本册的**预警生成是 `sweep` 之后的一步**（§4.4）：过批次已被剔除 → 天然满足「剩余 ≤ 0 不生成提醒」。

---

## 2. 存储契约（引用总册，不重复定义）

### 2.1 本册触及的集合（逐字引用总册「存储契约」）

```
集合 jiazu_assets（_id='global'）：{ users: { <手机号>: { fragments: number(0-9), seeds: SeedLot[], bamboos: BambooLot[], jades: Jade[], txs: Tx[], signin_date: 'YYYY-MM-DD' } } }
集合 jiazu_messages（_id='global'）：{ items: { <手机号>: Message[] }, warned: { <去重键>: true } }
集合 jiazu_ops_logs（_id='global'）：{ logs: OpsLog[] }
SeedLot = { id, qty, expires_at, source, created_at }；BambooLot = { id, qty(片), expires_at, source, created_at }；Jade = { id, expires_at(ISO 或 null=永久), created_at, source, mounted_tree_id(可选) }；Message = { id, type, title, text, created_at, read }；OpsLog = { id, ts, operator, target_phone, delta: { fragments?, seeds?, bamboos?, jades? }, reason }；Tx = { id, ts, type, delta, fee_seeds?, ref, desc, operator? }
```

本册用到的**枚举取值**（照总册「存储契约」，不得自造）：

| 位置 | 允许取值 | 本册用法 |
|---|---|---|
| `SeedLot.source` | `'signin'` \| `'fragment_synth'` \| `'admin'` \| `'market'` \| `'jade_decompose'` \| `'contribution'` | 后台发放 = **`'admin'`**；签到合成 = `'signin'` / `'fragment_synth'` |
| `BambooLot.source` | `'official_purchase'` \| `'spirit_gift'` \| `'market'` \| `'admin'` | 后台发放 = **`'admin'`**（枚举已由总册补全，见 §12-3） |
| `Jade.source` | `'synthesis'` \| `'admin'` | 后台发放的玉 = **`'admin'`**；合成出的玉 = `'synthesis'`（枚举已由总册补全，见 §12-3） |
| `Tx.type` | 总册（存储契约）全表 | 本册新增/使用：`signin`、`fragment_synth`、`admin_grant`、`account_clear` |
| `Tx.ref` | `{ tree_id?, listing_id?, trade_id?, person_handle? }`（对象） | 本册不新增 `ref` 键；审计关联信息写进 `desc` |
| `Message.type` | `'expiring'` \| `'spirit'` \| `'market'` \| `'system'`（总册「存储契约」） | 资产到期 = **`'expiring'`**；灵气三条 = **`'spirit'`** |

### 2.2 只读取值（灵气预警的数据源）

| 取值 | 来源（总册「存储契约」） | 用途 |
|---|---|---|
| `jiazu_spirit.trees[<tree_id>].status` | `'inactive'` \| `'active'` \| `'buffer'` \| `'expired'` | 判定三条灵气预警各自的阶段 |
| `jiazu_spirit.trees[<tree_id>].spirit_expires_at` | ISO | 「灵气剩余 30 天」的剩余天数计算与去重键 |
| `jiazu_spirit.trees[<tree_id>].buffer_until` | ISO 或 `null` | 「缓冲期剩 7 天」的剩余天数计算与去重键 |
| `jiazu_spirit.trees[<tree_id>].jade.mounted_tree_id` | ISO/string | 判定「时流子域已开启」（未镶嵌 → 不发灵气预警） |

> 预警生成**只读**这些值，绝不写 `jiazu_spirit`（状态推进由总册「核心算法」的 `sweep` 负责）。

---

## 3. 资产获取规则总表

> 「本轮是否实现」列：**手动（P4 实现）** = 本轮实现的后台发放/扣减通道；**自动（本轮仅后台通道）** = 规则已定稿、用户侧触发点本轮不接，暂由后台按该规则代发；
> **引用总册** = 算法在总册，本册只说明签到/发放路径的**调用时机**。

| # | 途径 | 触发点 | 奖励内容 | 上限 | 是否自动 | 本轮是否实现 |
|---|---|---|---|---|---|---|
| 1 | **每日签到** | 「我的资产」页签到按钮 → `POST /assets/signin` | 碎片 **1 个**（总册「待确认默认口径」：固定 1 个，无连签加成、无补签） | **1 个/自然日** | 自动 | 是（P4-2 / P4-4） |
| 2 | **添加家族成员** | 新建/挂接人物节点成功（`POST /people/`、`POST /admin/add-child`、`POST /admin/chain-append` 等新增类写路径之后） | 碎片 **1 个**（总册「待确认默认口径」） | 每新增节点 1 次；**每日最多 9 次**（总册「待确认默认口径」，超出静默不发） | 自动 | **否**（本轮仅后台通道） |
| 3 | **邀请新用户注册**（被邀请人首次登录平台） | 被邀请人**首次登录**成功（`/auth/login` 首个成功登录） | 碎片 **9 个/次**（即 **9 碎片**/次；**已定稿（Kevin 2026-09-16 拍板）**，K3；发放口径见本节末「碎片上限联动」注） | 每个被邀请人 1 次（终身）；**每日上限 3 次**（**已定稿（Kevin 2026-09-16 拍板）**） | 自动 | **否**（本轮仅后台通道） |
| 4 | **上传史料 / 老照片 / 文献**（优质贡献） | 用户提交并被认定为优质贡献 | 碎片 **1 个/次**（**已定稿（Kevin 2026-09-16 拍板）**，K3） | 每份贡献 1 次；**每日上限 9 次**（**已定稿（Kevin 2026-09-16 拍板）**） | 自动 | **否**（本轮仅后台通道） |
| 5 | **族谱纠错**（优质贡献） | 纠错被采纳 | 碎片 **1 个/次**（**已定稿（Kevin 2026-09-16 拍板）**，K3） | 每次有效纠错 1 次；**每日上限 9 次**（**已定稿（Kevin 2026-09-16 拍板）**） | 自动 | **否**（本轮仅后台通道） |
| 6 | **后台手动发放 · 完整石榴籽**（高阶特殊奖励） | `POST /admin/assets/grant`（`delta.seeds > 0`） | 石榴籽 N 颗（新 `SeedLot`，`source='admin'`、有效期 **365 天**，总册「接口清单」注） | 无硬上限，逐笔留日志 | 手动 | 是（P4-3） |
| 7 | **后台手动发放 · 碎片** | `POST /admin/assets/grant`（`delta.fragments > 0`） | 碎片 N 个；`n ≥ 10` 时**立即**按总册（核心算法）合成 `floor(n/10)` 颗籽、碎片取余 | 稳态上限 **9**（不变量） | 手动 | 是（P4-3） |
| 8 | **后台手动发放 · 竹片** | `POST /admin/assets/grant`（`delta.bamboos > 0`） | 竹片 N **片**（新 `BambooLot`、365 天、`source='admin'`） | 无硬上限，逐笔留日志 | 手动 | 是（P4-3） |
| 9 | **后台手动发放 · 石榴籽玉** | `POST /admin/assets/grant`（`delta.jades > 0`） | 玉 N 枚（`expires_at = null` 永久、`source='admin'`） | 无硬上限，逐笔留日志 | 手动 | 是（P4-3） |
| 10 | **后台手动扣减（四类）** | `POST /admin/assets/grant`（`delta` 为负） | 按总册（核心算法） **FIFO（`expires_at` 升序）** 扣减；不足 → **整单拒绝、不部分扣减** | 不得扣至负（不变量 1） | 手动 | 是（P4-3） |
| 11 | **碎片满 10 自动合成 1 颗石榴籽** | **任何**使 `fragments ≥ 10` 的路径（签到 / 后台发放 / 合成后残留） | 合成 `floor(fragments/10)` 颗籽（每颗新批次：`expires_at = now + 365 天`、`source='fragment_synth'`），碎片取余（**引用总册「核心算法」**） | — | 自动 | 是（P4-1 复用总册函数） |
| 12 | **石榴籽玉拆解返还 999 颗石榴籽** | 玉拆解入口（市集页/资产页） | 石榴籽 **999 颗**（新批次、365 天、`source='jade_decompose'`），无折损（**引用总册「待确认默认口径」**） | 每枚未镶嵌玉 1 次（总册「待确认默认口径」） | 手动 | **否**（本轮仅引用；由总册/后续批次实现） |

> 途径 2–5 的触发点口径（去重键 `reward:<type>:<phone>:<ref>`、靠 `Tx` 流水扫描判重、**不新增** `jiazu_assets` 顶层字段）：途径 3（**邀请新用户注册**）**已定稿（Kevin 2026-09-16 拍板）** = 9 碎片/次、每日上限 3 次；途径 4–5（**贡献**：上传史料 / 老照片 / 文献 / 族谱纠错）**已定稿（Kevin 2026-09-16 拍板）** = 1 碎片/次、每日上限 9 次；途径 2（添加家族成员）**未涉本轮裁定**，维持总册（待确认默认口径）的 1 碎片/次、每日上限 9 次。本轮这四类**只走后台发放通道**（`grant`，依据文本并入 `reason`，见 §5.2），不做用户上传审核流（本册 §11-4）。
>
> **碎片上限联动（K3 · 已定稿（Kevin 2026-09-16 拍板））**：碎片**持有上限 = 9**（不变量，见 §3 途径 11 与 §8.3 断言 `0 ≤ fragments ≤ 9`）。邀请单次发 **9 碎片**，因此**已有碎片的用户一经发放即触发**「满 10 自动合成 1 籽」：例 —— 账户原有 1 个碎片，收 9 个后 `fragments = 10` → **同一请求内**立即合成 **1 颗石榴籽**（新批次 `expires_at = now + 365 天`、`source = 'fragment_synth'`）、`fragments` 取余 = **0**，并写一条 `type='fragment_synth'` 流水；账户原有 0 个碎片则 `fragments = 9`、不合成。贡献类每次 **1 碎片**，累计到第 10 个碎片时按同一函数即时合成（不得各写一份）。
> ¥ 人民币钱包不属于本经济体系：按总册（部署要点）收缩为**只用于购买官方竹简**，本册不改其字段与算法。

---

## 4. 签到与站内信规格

### 4.1 签到接口

| 项 | 内容 |
|---|---|
| 路由 | **`POST /assets/signin`**（总册「接口清单」定稿命名；本册不改名） |
| 鉴权 | Bearer（`user` 及以上）；未登录 → `401 { error: '未登录或登录已过期' }` |
| 请求体 | 无（手机号取自 JWT） |
| 成功 | `200 { ok: true, fragments: 3, synthesized: 0, seed_lot: null, signin_date: '2026-09-16' }`（字段照总册「接口清单」） |
| 同自然日重复 | **`409 { error: '今日已签到' }`**（§1.2-5；已由总监终审裁定：采 409，总册已同步；登记见 **§12-1**） |
| 自然日口径 | 北京时间（UTC+8）日历日（本册 §11-1）；写入 `signin_date = 'YYYY-MM-DD'` |
| 前置 | 先 `sweep(now)`（总册「核心算法」），再判重与发放 |

**结算顺序（固定）**

1. `sweep(now)`。
2. 取 `jiazu_assets.users[phone]`（缺省初始化空资产对象）。
3. `signin_date === today(+08:00)` → 返回 `409`，**不写任何数据**。
4. `fragments += 1`；`signin_date = today`。
5. **同一请求内**立即执行总册（核心算法）的合成判定：`fragments ≥ 10` → `synthesized = floor(fragments/10)` 颗籽、`fragments = fragments % 10`；写一条 `type='fragment_synth'` 流水（若有合成）与一条 `type='signin'` 流水。
6. 一次写入（碎片 / 籽批次 / 流水同一 `colSet`，不出现「碎片满 10、籽未生成」中间态）。

> 触发时机说明：**签到路径的合成与碎片落库同一请求内完成**，不延后；后台发放路径（§5）同样即时结算 —— **两条路径必须调用同一个总册合成函数**（禁止各写一份）。

### 4.2 消息字段（`jiazu_messages`，`_id='global'`）

| 字段 | 类型 | 必填 | 本册口径 |
|---|---|---|---|
| `id` | string | 是 | `msg_<毫秒时间戳>_<6 位随机>`（沿用 `lib/wallet.js` 的 id 风格） |
| `type` | string | 是 | `'expiring'`（资产到期）/ `'spirit'`（灵气三条）；枚举照总册（存储契约） |
| `title` | string | 是 | 定稿文案首段短标题（§6.3 映射表，不含【】） |
| `text` | string | 是 | **定稿文案逐字全文**（含【】与标点，§6.3） |
| `created_at` | string(ISO) | 是 | 生成时刻（= `sweep` 时的 `now`） |
| `read` | boolean | 是 | 已读标记，初值 `false` |

列表按 `created_at` 倒序；**同一 `created_at` 的多条按写入顺序倒序（后写入者在前），且实现不得依赖 JS 稳定排序的隐式行为**（口径与 §5.3「同刻定序」同一套，理由见该节）；每用户保留**最近 200 条**（超出裁剪最旧的**已读**消息，本册 §11-5）。

### 4.3 接口

| 路由 | 方法 | 鉴权 | 入参 | 出参 |
|---|---|---|---|---|
| `/messages` | GET | Bearer（本人） | `unread?`（照总册「接口清单」） | `200 { items: [Message…], unread: 2 }`；未登录 `401` |
| `/messages/read` | POST | Bearer（本人） | `{ ids?: string[] }`；**缺省 = 全部标记已读** | `200 { ok: true, unread: 0 }`；不属于本人的 id 忽略不计（不报错） |

> `GET /messages` 同时返回 `read` 状态（前端直接渲染列表），`POST /messages/read` 负责写已读 —— 两者并存、不互斥。
> `POST /messages/read` 是**本册新增**路由（总册「接口清单」未定义「写已读」）→ §12-2 登记，**已由总监终审裁定采纳**（总册已补登记）。

### 4.4 四类预警：生成条件与去重键

| # | 预警 | `Message.type` | 生成条件（`sweep` 之后、按 `now` 惰性判定） | 去重键（`warned` 的 key） | 收件人 |
|---|---|---|---|---|---|
| 1 | **资产过期提醒 · 30 天** | `expiring` | 存在 `0 < 剩余天数 ≤ 30` 的 `SeedLot` / `BambooLot`（每批次一条） | `expiring:<手机号>:<lotId>@30` | 该批次归属用户 |
| 2 | **资产过期提醒 · 7 天** | `expiring` | 同一批次 `0 < 剩余天数 ≤ 7` | `expiring:<手机号>:<lotId>@7` | 同上 |
| 3 | **家族灵气预警（30 天）** | `spirit` | `jiazu_spirit.trees[tree].status = 'active'` 且 `0 < 灵气剩余天数 ≤ 30` | `spirit:<手机号>:<tree_id>@30@<spirit_expires_at>` | 该树收件人集合（本册 §11-6），**逐人各自一份** |
| 4 | **家族缓冲期通知** | `spirit` | `status = 'buffer'`（灵气已耗尽、缓冲期未结束） | `spirit:<手机号>:<tree_id>@buffer@<spirit_expires_at>` | 同上 |
| 5 | **紧急通知（缓冲期剩 7 天）** | `spirit` | `status = 'buffer'` 且 `0 < 缓冲期剩余天数 ≤ 7` | `spirit:<手机号>:<tree_id>@7@<buffer_until>` | 同上 |

- 键格式 = 总册（存储契约）「`<type>:<手机号>:<批次/对象 id>`」三段 + 阶段后缀；**每个键终身只生成一次**。
- `warned[key] = true` 与消息写入**同一次 `colSet`**（避免重复投递）。
- **剩余天数** = `Math.ceil((到期时刻 − now) / 86400000)`（本册 §11-7）；文案中的「30 日 / 7 日」为**固定值**，不随实际剩余天数变化。
- 已过期/已失效（剩余 ≤ 0）**不生成提醒**（`sweep` 已剔除该批次；灵气 `status='expired'` 不发第 3/5 条）。
- 与任务书示例键的对应：`expire30:手机号:lotId` → `expiring:<手机号>:<lotId>@30`；`spirit30:tree_id:到期日` → `spirit:<手机号>:<tree_id>@30@<spirit_expires_at>`（**语义一致，键形改为总册三段格式**，理由 = 总册为字段与算法唯一权威）。

### 4.5 惰性生成算法（伪代码）

```
ensureWarnings(phone, now):                       # 资产入口在 sweep(now) 之后调用
  assets = jiazu_assets.users[phone]
  for lot in assets.seeds + assets.bamboos:       # 每批次
    d = ceil((lot.expires_at - now) / 86400000)
    if 0 < d <= 30: put('expiring:%s:%s@30' % (phone, lot.id), X=30)
    if 0 < d <= 7:  put('expiring:%s:%s@7'  % (phone, lot.id), X=7)
  for tree in 该用户有接收权的树(phone):            # 本册 §11-6
    sp = jiazu_spirit.trees[tree]                 # 只读
    if sp.jade and sp.status == 'active':
      d = ceil((sp.spirit_expires_at - now) / 86400000)
      if 0 < d <= 30: put('spirit:%s:%s@30@%s' % (phone, tree, sp.spirit_expires_at), kind='spirit_30')
    if sp.jade and sp.status == 'buffer':
      put('spirit:%s:%s@buffer@%s' % (phone, tree, sp.spirit_expires_at), kind='spirit_buffer')
      d = ceil((sp.buffer_until - now) / 86400000)
      if 0 < d <= 7: put('spirit:%s:%s@7@%s' % (phone, tree, sp.buffer_until), kind='spirit_7')
  # put(key, …)：key 不在 warned 才 push 消息 + warned[key]=true
  if 有新消息: 一次 colSet('jiazu_messages','global',{items, warned})   # 消息与 warned 同一次落库
```

- **触发入口**（总册「待确认默认口径」：在资产入口惰性写入）：`GET /messages`、`GET /assets/summary`、`GET /assets/expiring`、`POST /assets/signin` 等**任一已 `sweep` 的资产入口**（统一调用同一函数）。
- **只补当前请求人**那一份（去重键含手机号，天然按人隔离）；不做他人预生成。
- 真定时推送留待部署阶段（§13-3），复用同一 `ensureWarnings` 与同一 `warned` 键，**逻辑不重写**。

### 4.6 前端落点

| 落点 | 变更 |
|---|---|
| `frontend/src/pages/assets/index.vue`（总册「前端落点与入口」新建页） | 签到按钮（当日已签 → 置灰，`409` 时 toast「今日已签到」）；**即将过期批次 + 消息预警列表**（`GET /messages`）+ 未读计数（总册「前端落点与入口」「消息」行） |
| `frontend/src/pages/mine/index.vue` | 功能菜单新增 cell「📮 消息中心」（描述「资产到期 / 家族灵气通知」），未读角标取 `GET /messages` 的 `unread`，0 时不显示；已登录时同时显示资产总览入口 |
| `frontend/src/pages/messages/index.vue` | **本册定稿的独立消息列表页**（`pages.json` 注册，`navigationBarTitleText: 消息中心`）：列表（标题 / 正文 / 时间 / 未读圆点）→ 展开即 `POST /messages/read { ids:[id] }`；顶部「全部标为已读」（不带 ids）。总册（前端落点与入口）只写了「首页/我的 未读红点」，本页为展开形态（§12-2 登记） |
| `frontend/src/business/api.ts` | 新增 `signin(token)`、`fetchMessages(token, opts?)`、`readMessages(token, ids?)`；`business/index.ts` 转出 |

> 现有 `frontend/src/components/family-messages/family-messages.vue` 是**管理员审批入口**（联姻/认祖/建谱/加入申请），与站内信中心**职责不同、互不复用**，不改其行为。

---

## 5. 运营后台规格（资产运维）

### 5.1 `POST /admin/assets/grant`

| 项 | 内容 |
|---|---|
| 鉴权 | **仅 `chief_editor`**（总册「权限口径」：运营侧；未登录 `401`、其它角色 `403 { error: '需要总编辑权限' }`，沿用 `/admin/wallet-fee`、`/tree-meta` PUT 的既有口径） |
| 入参 | `{ target_phone: string, delta: { fragments?, seeds?, bamboos?, jades? }, reason: string, evidence?: string }` |
| 出参 | `200 { ok: true, summary }`（字段照总册「接口清单」；`summary` 至少含目标账号更新后的 `fragments` / `seeds_total` / `bamboos_total_pieces` / `jades` 与 `log_id`） |
| 前置 | `sweep(now)` 先行（总额校验基于结算后的可用量） |

**逐项校验（任一不通过即整体不写，`sweep` 也不回滚）**

| # | 校验 | 失败响应 |
|---|---|---|
| 1 | `target_phone` 必填且匹配 `^1\d{10}$` | `400 { error: '手机号格式不正确' }` |
| 2 | 目标用户在 `jiazu_users` 存在 | `404 { error: '用户不存在: <手机号>' }` |
| 3 | `reason` 必填，`trim()` 后非空 | `400 { error: '请填写操作原因' }` |
| 4 | `delta` 至少含一项，且至少一项非 0 | `400 { error: '资产数量不能全为 0' }` |
| 5 | 每项为整数（可为负） | `400 { error: '资产数量必须为整数' }` |
| 6 | 负向扣减后**任一资产不得为负**；籽/竹片按 FIFO 逐批扣减，**不足即整单拒绝**（总册「核心算法」） | **`409 { error: '资产不足', code: 'ASSET_INSUFFICIENT', need, current, unit, how_to_get }`**（与总册扣费不足同码同文案；`unit` 的四类取值见下「负向不足 409 的响应体」） |
| 7 | 发放后 `fragments ≥ 10` → 按总册（核心算法） **即时合成**（不拒绝、不截断） | `200`（`summary.synthesized ≥ 1`） |

**负向不足 409 的响应体（`unit` 枚举 · 四类补全）**

不足一律返回 `409`，响应体形状沿用 `docs/economy-fee.spec.md` §6 的真源：`{ error, code: 'ASSET_INSUFFICIENT', need, current, unit, how_to_get }`。其中 **`unit` 取值与总册（存储契约）的资产键同名，共四类**（原规格只枚举了 `seeds` / `bamboos`，此处补全 `fragments` / `jade`）：

| `unit` | 资产（`delta` 键 / `jiazu_assets` 字段） | 文案量词 | 文案模板（`N` = `need`、`M` = `current`） |
|---|---|---|---|
| `fragments` | 碎片（`fragments`） | 个 | 资产不足，需 N 个碎片，当前 M 个 |
| `seeds` | 石榴籽（`seeds`） | 颗 | 资产不足，需 N 颗石榴籽，当前 M 颗 |
| `bamboos` | 竹片（`bamboos`） | 片 | 资产不足，需 N 片竹片，当前 M 片 |
| `jade` | 石榴籽玉（`jades`） | 枚 | 资产不足，需 N 枚石榴籽玉，当前 M 枚 |

- **适用范围（两处，口径一致）**：① **扣费不足的 409 响应体**（`/spirit/charge`、`/market/*`、建树费、竹片闸门等全部既有扣费路径）；② **`grant` 负向扣减不足**（上表校验 6）。
- **归一规则**：实现内部按量词区分文案时可能用单数形（`seed` / `bamboo`），但**响应体 `unit` 一律归一为四类资产键名**（`seeds` / `bamboos`），**单数形不得出现在响应体里**；碎片与玉两类无需归一（直接 `fragments` / `jade`）。
- **文案真源**：`how_to_get` 与既有场景文案（如建树「需 9颗石榴籽」这类长文案）以 `docs/economy-fee.spec.md` §6 / §8 为准；本表只定 `unit` 枚举与量词，**不改既有文案**。

**副作用（同一请求内完成，顺序固定）**

1. 写 `jiazu_assets`：`seeds` / `bamboos` 追加新批次（`source='admin'`、365 天）；`jades` 追加（`expires_at=null`、`source='admin'`）；负向按 `expires_at` 升序扣减、`qty` 归零批次整条移除（总册「核心算法」）；`fragments` 取余结算。
2. 写 `jiazu_ops_logs`：追加一条 `OpsLog`（字段见 §5.3）。
3. 写该用户 `txs`：一条 `Tx = { id, ts, type: 'admin_grant', delta, ref: {}, desc: '运营发放：<reason>（log <log_id>）', operator: <操作人手机号> }`（`operator` 总册「存储契约」规定 admin 类必填）。

### 5.2 `evidence`（贡献奖励依据）的落库方式

- `evidence` 是**可选入参**，用于承载贡献奖励的依据文本（如「上传史料：某年族谱影印」）。
- **不新增任何集合字段**（总册「存储契约」的 `OpsLog` 无 `evidence`）：落库时并入 `reason`，格式 `reason = '<原因>｜依据：<evidence>'`（未传 `evidence` 则 `reason` 原样）。
- 用途：贡献奖励（途径 2–5）本轮的唯一发放通道就是本接口，依据必须可追溯。

### 5.3 `GET /admin/assets/logs`

| 项 | 内容 |
|---|---|
| 鉴权 | 仅 `chief_editor`（同上） |
| 入参 | `phone?`（按 `target_phone` 过滤）、`limit?`（默认 **50**，照总册「接口清单」）；本册**追加**可选 `operator?`（按操作人过滤） |
| 出参 | `200 { logs: [OpsLog…] }`，按 `ts` 倒序；**同刻定序见下表后「同刻定序」** |
| 说明 | 过滤可叠加；空集合 → `{ logs: [] }`；`limit` 上限 200（上限口径见本册 §11-8） |

**审计日志字段（`OpsLog`，逐字对齐总册「存储契约」）**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `op_<毫秒时间戳>_<6 位随机>` |
| `ts` | ISO | 是 | 操作时刻 |
| `operator` | string | 是 | **操作人手机号**（服务端取自 JWT，不接受前端传） |
| `target_phone` | string | 是 | 被操作用户手机号 |
| `delta` | object | 是 | `{ fragments?, seeds?, bamboos?, jades? }`，**保留符号**（负值原样记录） |
| `reason` | string | 是 | 操作原因（`trim` 后非空；含 §5.2 的依据文本） |

**同刻定序（`ts` 相同的多条，本册定稿口径）**

- 排序键 = **`ts` 降序**；`ts` **相同**的多条按**写入顺序倒序** —— **后写入者在前**（同一次请求可写多条日志，其 `ts` 完全相同，是常态而非异常）。
- 实现**不得依赖 JS `Array.prototype.sort` 稳定排序的隐式行为**：稳定排序会把同刻项保持为数组原序（即「先写入者在前」），**与本条口径相反**；必须显式提供次序判定（如日志追加时落一枚单调递增的写入序 / 下标，再以「`ts` 降序 → 写入序降序」二级比较）。
- 理由：同刻不定序 → 列表顺序随实现细节漂移、界面顺序「飘」、单测同刻断言 flake。**站内信列表（§4.2，按 `created_at`）同一套口径**，两条列表共用一个实现。
- 配套约束：过滤（`phone?` / `operator?`）与 `limit` 都在排序**之后**截取，不得改变同刻次序。

> 两条台账都要写，缺一视为实现缺陷：`jiazu_ops_logs` = **管理侧审计**（谁改的、为什么）；`Tx` = **用户侧流水**（用户在资产页看得到自己的变动）。

### 5.4 `GET /admin/assets/user`（本册新增的辅助读接口）

| 项 | 内容 |
|---|---|
| 用途 | 后台「资产运维」区展示目标账号当前资产（发放前核对 / 发放后回读校验） |
| 入参 | `phone`（必填） |
| 出参 | `200 { phone, fragments, seeds_total, bamboos_total_pieces, jades, seed_lots: [SeedLot…], bamboo_lots: [BambooLot…], jade_list: [Jade…], signin_date }`（字段名对齐总册「接口清单」的 `/assets/summary` 公开形态，仅把「本人」改为 `phone`） |
| 错误码 | `401`；`403` 非 chief_editor；`400` 缺 `phone`；`404` 用户不存在 |

> 总册（接口清单）未定义该读接口 → §12-2 登记，**已由总监终审裁定采纳**（总册已补登记；本接口为定稿）。
> **总册新增原则**：总册为字段与算法唯一权威；任何字段名 / 集合名 / 算法 / 路由语义改动**先改总册**再改代码（总册「部署要点」）。

### 5.5 界面落点

| 落点 | 变更 |
|---|---|
| `frontend/src/pages/admin/index.vue` | 现有第 5 个 `section`「**资产运维**」，与总册（前端落点与入口）「管理台」的「资产发放 / 资产流水」为**同一区**（不重复建两个区）：① 目标手机号输入；② 四类资产数量输入（可负）；③ 原因**必填**输入；④ 依据（选填，落 `evidence`）；⑤「发放 / 扣减」按钮 → `POST /admin/assets/grant`，成功 toast「资产已变更」并回读 `GET /admin/assets/user` 刷新快照；⑥ 日志列表（`GET /admin/assets/logs`，按手机号/操作人过滤，显示时间 / 操作人 / 目标 / 四类 delta / 原因）。总册（前端落点与入口）的「官方竹简库存」（`PUT /admin/market/official-stock`）由市集分册负责，不在本区 |
| 页头权限 | 现有页头 `canManage`（`ROLE_LEVEL` 档位判定：≥ 主理人档，档位定义见 `docs/permission-tier.spec.md`）**不变**（用户列表/审批区照旧）；「资产运维」区**仅 `chief_editor` 可见**，非总编显示提示条「需要总编辑权限」，与后端 `403` 口径一致 |
| `frontend/src/business/api.ts` | 新增 `grantAssets(token, payload)`、`fetchOpsLogs(token, filters)`、`fetchAdminUserAssets(token, phone)`；`business/index.ts` 转出 |

---

## 6. 全场景定稿文案清单（逐字）

> **共 8 条**：弹窗 4 条（8.1–8.4，编号沿用定稿编号）+ 站内信 4 条（资产到期提醒 1 条模板 + 家族灵气预警 3 条）。
> **唯一真源**：本节（§6）是上述 8 条文案的唯一文案真源；其它分册（市集 / 时流子域 / 费用 / 账号）与前端一律**引用本册**，不得另存副本或改写一字。
> 逐字要求：实施时**整段照抄**，含全角标点、【】包裹词、`/` 换行与感叹号；除 §6.3 的运行时填值项外不得改字。

### 6.1 弹窗（4 条）

| # | 名称 | 文案（逐字，`/` = 换行） | 触发时机 | 前端落点 |
|---|---|---|---|---|
| **8.1** | 灌注玉露灵泽确认 | 「⚠️ 灌注玉露灵泽确认 / 本次操作将消耗【XX】颗石榴籽，为家族谱系大树灌注玉露灵泽，家族灵气到期时间将向后延长【XX】天。/ 消耗时将优先扣除您账户内即将最先到期的石榴籽，消耗后的石榴籽直接消失，不可退回。/ 是否确认继续灌注玉露灵泽？」 | 时流子域页 `frontend/src/pages/spirit/index.vue` 蓄能区「灌注玉露灵泽」按钮（选完档位后）→ `POST /spirit/charge` 提交前确认 | **落点 = 新建独立页 `frontend/src/pages/spirit/index.vue`（家族专属空间 · 时流子域）的灌注按钮；家族树首页顶部入口仅作状态展示与跳转**（详见 `docs/spirit-domain.spec.md` 的页面与入口节） |
| **8.2** | 石榴籽玉合成确认 | 「⚠️ 合成提示 / 本次将消耗999颗石榴籽。/ 若全部999颗石榴籽剩余有效期均≥360天，合成石榴籽玉为永久有效；/ 若存在有效期不足360天的石榴籽，石榴籽玉有效期将取本次所用石榴籽中最早到期的剩余时长。/ 石榴籽玉可免费分解，分解后返还999颗石榴籽，分解所得石榴籽统一拥有365天有效期。/ 请确认是否继续合成？」 | 时流子域页 `frontend/src/pages/spirit/index.vue` 玉操作区「合成石榴籽玉（999 颗）」按钮（**不在市集页**）→ `POST /assets/synthesize-jade` 提交前确认 | **落点 = 新建独立页 `frontend/src/pages/spirit/index.vue`（家族专属空间 · 时流子域）的玉操作区「合成石榴籽玉（999 颗）」按钮**（详见 `docs/spirit-domain.spec.md` 的页面与入口节） |
| **8.3** | 石榴籽玉镶嵌不可逆确认 | 「⚠️ 不可逆操作确认 / 您即将把石榴籽玉镶嵌至家族树凹槽。镶嵌后该石榴籽玉将永久销毁，不可取回、不可分解。/ 镶嵌成功将解锁本家族树【时流子域】，您可以通过灌注玉露灵泽维持灵气持续生效。/ 是否确认镶嵌？」 | 时流子域页 `frontend/src/pages/spirit/index.vue` 镶玉区「镶嵌」按钮 → `POST /spirit/mount-jade` 提交前确认（不可逆二次确认） | **落点 = 新建独立页 `frontend/src/pages/spirit/index.vue`（家族专属空间 · 时流子域）的镶玉区「镶嵌」按钮；家族树首页顶部入口仅作状态展示与跳转**（详见 `docs/spirit-domain.spec.md` 的页面与入口节） |
| **8.4** | 创建家族树确认 | 「⚠️ 创建家族树确认 / 本次操作将消耗9颗石榴籽，创建全新家族谱系大树。/ 消耗时将优先扣除您账户内即将最先到期的石榴籽；若后续删除家族树，本次消耗的石榴籽不予退回。/ 确认创建家族树？」 | 首页「新建家族树」表单提交前（**现有建树漏斗**） | `frontend/src/pages/index/index.vue`：现有 `＋ 新建家族树` 入口 + 内联表单弹层（`showCreate` / `doCreateTree`）；在调用 `createTree()` **之前**插入本确认弹窗，取消则不发起请求。建树费已按总册（核心算法）改为**扣 9颗石榴籽**（人民币 ¥9.90 钩子废弃）；表单内的「建树费用 ¥…（余额 ¥…）」文案**已改**为「建树消耗 9颗石榴籽」（`frontend/src/pages/index/index.vue` 第 101 / 161 行；用户拍板：不带空格、不带「完整」，与 8.4 定稿弹窗逐字一致）——8.4 弹窗**正文逐字未动** |

### 6.2 站内信（4 条）

| # | 名称 | 文案（逐字） | `Message.type` | 触发（生成条件） | 收件人 / 落点 |
|---|---|---|---|---|---|
| **M1** | 资产过期提醒 | 「【资产到期提醒】您的【石榴籽/竹片】即将于X日后到期失效，请尽快使用避免损耗。」 | `expiring` | 到期前 30 天与到期前 7 天**各推送一次**（§4.4 第 1、2 行） | 该批次归属用户 → 「我的」页「📮 消息中心」入口 → `frontend/src/pages/messages/index.vue`；同屏在 `frontend/src/pages/assets/index.vue` 的预警列表 |
| **M2** | 家族灵气预警（30 天） | 「【家族灵气预警】本家族【时流子域】灵气剩余30天，即将到期。请及时灌注玉露灵泽续期，避免子域名停用。」 | `spirit` | `status='active'` 且灵气剩余 ≤ 30 天（§4.4 第 3 行） | 该树收件人集合（本册 §11-6）→ 消息中心 |
| **M3** | 家族缓冲期通知 | 「【家族缓冲期通知】本家族灵气已耗尽，现已进入30天缓冲期。若未及时续期，缓冲期结束后子域名将自动失效。」 | `spirit` | `status='buffer'`（§4.4 第 4 行） | 同上 |
| **M4** | 紧急通知（缓冲期剩 7 天） | 「【紧急通知】本家族【时流子域】缓冲期仅剩7天，未灌注玉露灵泽续期将永久停用子域名，请尽快操作！」 | `spirit` | `status='buffer'` 且缓冲期剩余 ≤ 7 天（§4.4 第 5 行） | 同上 |

### 6.3 运行时填值与落库映射

| 文案 | 运行时项 | 填值口径 |
|---|---|---|
| 8.1 | 【XX】颗石榴籽 | 本次灌注实际消耗籽数（总册「待确认默认口径」套餐表按 `plan` 给出） |
| 8.1 | 【XX】天 | 本次延长的天数（同上套餐表 `days`） |
| M1 | 【石榴籽/竹片】 | 该批次资产类型，二选一 |
| M1 | X 日 | 固定 **30**（30 天预警）/ 固定 **7**（7 天预警） |
| M2 / M4 | 【时流子域】 | 字面保留（家族专属空间的固定称谓），不替换 |

| 文案 | `Message.title`（短标题，不含【】） | `Message.text` |
|---|---|---|
| M1 | 资产到期提醒 | 定稿文案全文（逐字） |
| M2 | 家族灵气预警 | 定稿文案全文（逐字） |
| M3 | 家族缓冲期通知 | 定稿文案全文（逐字） |
| M4 | 紧急通知 | 定稿文案全文（逐字） |

### 6.4 非定稿文案（实施可自由调整，仅作建议）

| 场景 | 建议文案 |
|---|---|
| 签到成功 toast | 签到成功 +1 碎片 |
| 同日重复签到 toast | 今日已签到 |
| 后台发放成功 toast | 资产已变更 |
| 消息中心空态 | 暂无消息 |
| 非总编看「资产运维」区 | 需要总编辑权限 |

---

## 7. 账号注销口径

### 7.1 仓库现状（不得臆造新账号体系）

| 现状项 | 事实 |
|---|---|
| 注销接口 | **不存在**（`/auth/*` 仅有 `send-code` / `register` / `login` / `me`；全仓无 `deleteAccount` / `delete-account` 路由） |
| 现有「退出」 | `frontend/src/pages/mine/index.vue` 的「退出」= `clearAuth()`，**仅清本地 token**，不动任何服务端数据 |
| 账号数据面 | `jiazu_users`（账号）/ `jiazu_anchors`（锚点）/ `jiazu_assets`（本册资产）/ `jiazu_spirit`（灵气）/ `jiazu_market`（挂单）/ `jiazu_wallets`（人民币）/ `jiazu_ops_logs`（审计） |
| 解绑通道 | 解绑走现有 `POST /leave-request` + `/admin/approve-leave` 审批；**注销 ≠ 解绑**，本册不改该流程 |

### 7.2 注销清空（照总册「核心算法 / 待确认默认口径」，本册补充落地口径）

1. **清空资产**：`fragments = 0`、`seeds = []`、`bamboos = []`、`jades = []`、`signin_date` 清空（总册「核心算法」：先写一条 `type='account_clear'` 流水，再整体置空）；**不可恢复**，不做软删除/回收站。
2. **注销前置 · 挂单检查（K10 · 已定稿（Kevin 2026-09-16 拍板））**：注销前先查 `jiazu_market` —— 存在**任一** `status='open'` 的市集挂单 → **拒绝注销**，返回 **409「请先撤销未成交挂单」**（**不**自动撤销、**不**改挂单状态、不清资产）；`status` 为 `'sold'` / `'cancelled'` / `'expired'` 的挂单**无碍注销**。**本口径取代原「注销时把 `status='open'` 挂单自动置为 `'cancelled'`」的默认口径**（总册「待确认默认口径」按本册同步）。
3. **保留历史审计**：`jiazu_ops_logs`、`jiazu_wallets.transactions`、`jiazu_assets.users[phone].txs`（历史 `Tx` 保留）。
4. **锚点与账号文档**：默认**保留**（`jiazu_anchors` / `jiazu_users` 不随注销删除）；`jiazu_users` 是否删除留待账号体系批次决策（本册 §11-9）。
5. **由后台代注销时**额外写一条 `OpsLog`（`operator` = 操作人、`target_phone` = 被注销账号、`reason` = 「后台代注销」，`reason` 必填口径不豁免）。
6. **注销页须明示影响面**：注销后该账号的碎片/石榴籽/竹片/玉**不可恢复**；若其家族树时流子域依赖其资产续期，续期需另行操作；**存在未成交挂单时须先自行撤销**，否则注销被 **409** 拒绝（文案「请先撤销未成交挂单」）。
7. **注销错误码**：存在 `status='open'` 挂单 → **409「请先撤销未成交挂单」**（K10 定稿）；未登录 → **401**；其余校验沿用既有档位文案。
8. **重复注销 = 幂等 `200`（本册定稿口径）**：同一账号**再次**调 `POST /account/delete` → 资产已空（`fragments = 0` / `seeds` / `bamboos` / `jades` 均空 / `signin_date` 空）、**不报错**，返回 **`200 { ok: true, phone, cleared, tx_id, txs_kept }`**（本次再写一条 `delta` 全 0 的 `type='account_clear'` 流水，审计与历史流水仍保留、不删）；**无未成交挂单时不因「已注销」而被拒**。**如需改为 `409`（如「账号已注销」）另行拍板** —— 改动面 = 本条 + §8.2 用例 13 的断言 + 前端注销流程的 409 分支（后端仅一处判定）。

---

## 8. 测试与约束

### 8.1 测试文件归属（对齐总册「测试与约束」）

总册（测试与约束）已把单测分配到 `lib/assets.test.js` / `lib/economy-spirit.test.js` / `lib/economy-market.test.js`。本册用例**并入现有分配**，避免重复文件：

| 文件 | 归属本册的用例 |
|---|---|
| `cloudfunctions/compat-api/lib/assets.test.js` | #1–#9、#12–#13（签到 / 合成 / 发放校验 / 负资产 / 注销） |
| `cloudfunctions/compat-api/lib/messages.test.js`（**新增**） | #10–#11、#14（预警惰性生成 / 去重 / 已读） |

> 测试文件名 `cloudfunctions/compat-api/lib/assets.test.js` + `cloudfunctions/compat-api/lib/messages.test.js` **已由总监终审裁定采纳**（总册「测试与约束」已登记）；两个文件**都必须注册进 `package.json` 的 `scripts.test`**（未注册等于没测）。

### 8.2 用例清单

数据安全基线照 `lib/node-delete.test.js` 模式：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 `/tmp` 副本，文末 md5 断言真源未变。

| # | 用例 | 断言要点 |
|---|---|---|
| 1 | 首次签到 `POST /assets/signin` | `200`；`fragments +1`；`signin_date` = 当日（+08:00） |
| 2 | 同自然日重复签到 | `409 { error: '今日已签到' }`；资产与 `signin_date` 不变 |
| 3 | 自然日切换（`signin_date` 置昨日 / 注入时钟） | 可再次签到，`fragments` 再 +1 |
| 4 | 碎片满 10 自动合成（签到路径） | `fragments` 取余、`seeds + floor(n/10)`、`synthesized` 正确、写 `type='fragment_synth'` 流水 |
| 5 | 碎片满 10 自动合成（后台发放路径） | `grant` 后同样即时进位（**与签到同一函数**） |
| 6 | `grant` 校验矩阵 | 缺 `reason` → `400`；`reason` 全空格 → `400`；`delta` 缺项/全 0 → `400`；非整数 → `400`；手机号格式错 → `400`；用户不存在 → `404`；未登录 → `401`；`tree_steward`/`user` → `403` |
| 7 | `grant` 正向 | 四类各 +N 到账（批次 `qty` / `expires_at`=+365 天 / `source='admin'`（玉 `null`+`'admin'`）正确）；`jiazu_ops_logs` 新增一条（`operator`/`reason`/`delta`/`ts` 齐全）；目标用户 `txs` 新增一条 `type='admin_grant'` 且 `operator` = 操作人 |
| 8 | 负数发放到不足 | `grant { fragments: -5 }`（余额 3）→ **`409 { error: '资产不足' }`**；资产、日志、流水**三者都不变**（无部分扣减） |
| 9 | 负数在可用量内 | 扣减成功；籽/竹片按 `expires_at` 升序扣，`qty` 归零批次被移除；`fragments` 不为负 |
| 10 | 预警去重 | 同一批次连续两次 `GET /messages` → 只生成 1 条 `expiring@30`；`warned` 含该键且与消息同次落库 |
| 11 | 预警惰性推进 | 30 天批次推进到 ≤7 天 → 新增 `expiring@7`（`@30` 不重复）；`sweep` 剔除后再取 → 不生成 |
| 12 | 家族灵气三条 | `active` ≤30 天 → `@30`；`buffer` → `@buffer`；`buffer` 剩 ≤7 天 → `@7`；同一树同一阶段不重复生成 |
| 13 | 注销清空与注销前置 | 四类清零 + `signin_date` 清空 + `type='account_clear'` 流水；`jiazu_ops_logs`、历史 `txs`、`wallet` 流水保留；**注销前置（K10 定稿）**：存在 `status='open'` 挂单 → `409「请先撤销未成交挂单」`，且**资产、挂单、流水三者都不变**（不再就地作废挂单）；`sold` / `cancelled` / `expired` 挂单不影响注销（可正常清空） |
| 14 | 已读标记 | `POST /messages/read { ids }` → 该条 `read=true`、`unread` 下降；重复调用幂等；缺省 `ids` = 全部已读；他人 id 被忽略 |
| 15 | **真源未变** | `migrate-output/trees/*.json`、`migrate-output/details/*.json`、`migrate-output/collections/*.json`、`config/tree-meta.json` 的 md5 与测试前逐字节一致 |
| 16 | **邀请奖励与碎片上限联动（K3 定稿）** | 邀请发放 9 碎片：账户原有 0 → `fragments = 9` 且**不合成**；账户原有 ≥1（如 1）→ `fragments = 10` → **同一请求内**合成 1 颗籽（`source='fragment_synth'`、`expires_at = now + 365 天`）、`fragments` 取余 = 0、写 `type='fragment_synth'` 流水；每日上限：同一自然日第 4 次邀请奖励 → 不发（每日上限 3 次），第 10 次贡献奖励 → 不发（每日上限 9 次） |

### 8.3 不变量与约束

- **不变量断言（每个测试收尾）**：`0 ≤ fragments ≤ 9`；`Σ seeds.qty` / `Σ bamboos.qty` 与总览读数一致；无 `qty = 0` 残留批次；无负值。
- 所有写路径走 `lib/store.js` 的 `colGet` / `colSet`（local 模式自动落 `migrate-output/collections/<集合名>.json`）；禁止任何路径直写三个集合（总册「核心算法」）。
- **负资产拦截在服务端**（前端置灰只是体验，不作为约束）。
- 预警生成只读 `jiazu_spirit`，**绝不写**灵气状态、树 JSON、详情文档、`tree-meta`。
- 云端 SDK 调用继续走 `store.js` 的 `sdkCall` 互斥队列；并发下不得丢更新/重复扣费（总册「核心算法」）。
- 前端 `npx vue-tsc --noEmit` 必须 exit 0；新增页面须进 `pages.json`。

---

## 9. 实施清单（P4 档）

| 批次 | 内容 | 依赖 | 验证 |
|---|---|---|---|
| **P4-1** | `cloudfunctions/compat-api/lib/economy-ops.js`：资产发放/扣减封装（FIFO 整单拒绝、批次追加与清理）+ 复用总册合成函数 + `ensureWarnings` | 总册（字段与算法） | 单测 #4/#5/#7–#9/#10–#12 |
| **P4-2** | 路由 `POST /assets/signin`（409 口径）、`GET /messages`、`POST /messages/read` | P4-1 | 单测 #1–#3、#10–#12、#14 |
| **P4-3** | 路由 `POST /admin/assets/grant`、`GET /admin/assets/logs`、`GET /admin/assets/user`（`chief_editor`）+ 审计日志 + 用户流水 | P4-1 | 单测 #6–#9、#13 |
| **P4-4** | 前端：`pages/assets/index.vue` 签到按钮 + 预警/未读；`mine` 页「📮 消息中心」入口与角标；新建 `pages/messages/index.vue` + `pages.json` 注册；`business/api.ts` 三个函数 | P4-2、总册（前端落点与入口） | 手工 + E2E（签到 / 消息 / 已读） |
| **P4-5** | 前端确认弹窗接线：8.4 `pages/index/index.vue` 建树漏斗；**8.1、8.2、8.3 均落在新建独立页 `frontend/src/pages/spirit/index.vue`（时流子域）**——8.1 蓄能区「灌注玉露灵泽」按钮、8.2 玉操作区「合成石榴籽玉（999 颗）」按钮、8.3 镶玉区「镶嵌」按钮；`pages/hall/index.vue` 仅作状态展示与跳转入口（不再承载弹窗）；**`pages/market/index.vue` 是市集页，不承载玉合成** | 总册（灵气/玉算法）+ 市集/费用分册 | 文案逐字比对 + 取消路径不发请求 |
| **P4-6** | 前端：`admin/index.vue`「资产运维」区（发放/扣减表单 + 用户快照 + 日志列表，仅 `chief_editor` 可见） | P4-3 | 权限矩阵（总编可见 / 主理人不可见 / 后端 403） |
| **P4-7** | 收尾：测试文件注册进 `scripts.test`、集合与路由并入 `PENDING_DEPLOY.md` 待上云记录 | P4-1…P4-6 | §8.2 全绿 + md5 未变 |

---

## 10. 部署要点

### 10.1 新增路由（本册归属）

| 路由 | 方法 | 鉴权 | 状态 |
|---|---|---|---|
| `/assets/signin` | POST | user | **总册已定义**（本册补 409 口径；已由总监终审裁定，总册已同步，§12-1） |
| `/messages` | GET | user | **总册已定义**（本册补预警生成时机与去重键） |
| `/messages/read` | POST | user | **本册新增**（已由总监终审裁定采纳）→ 并入总册（部署要点）的路由清单 |
| `/admin/assets/grant` | POST | chief_editor | **总册已定义**（本册补校验矩阵与副作用顺序） |
| `/admin/assets/logs` | GET | chief_editor | **总册已定义**（本册补 `operator` 过滤） |
| `/admin/assets/user` | GET | chief_editor | **本册新增**（已由总监终审裁定采纳）→ 并入总册（部署要点）的路由清单 |

> ⚠️ 与总册（接口清单）注一致：这些路由必须挂在 `index.js` 的**树编辑闸门之前**（`cloudfunctions/compat-api/index.js:1586` 的 `if (!treeId) return send(400, { error: '缺少 X-Tree-Id' })`），否则没有 `X-Tree-Id` 的账号级请求会先被 400 拦掉（`/spirit*` 与 `/admin/assets/*` 亦同理）。
> 上线动作沿用 `docs/PENDING_DEPLOY.md` §1：`esbuild` 重打包 → `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`。

### 10.2 集合

`jiazu_messages`、`jiazu_ops_logs` 属总册（部署要点）的**五个新集合**之一（另三个：`jiazu_assets` / `jiazu_spirit` / `jiazu_market`），必须补进 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`（当前 7 个基础集合 + 4 个申请集合待补）；本地模式对应 `migrate-output/collections/jiazu_messages.json`、`.../jiazu_ops_logs.json`。**以总册（部署要点）为准**，本册不另列。

### 10.3 定时推送（留待部署阶段）

- 本轮**只做惰性生成**（资产入口补齐），**不注册任何定时任务**（总册「部署要点」）。
- 真定时推送（准点触达、含无登录用户）留部署阶段，形态建议：CloudBase 定时触发器 → 调用同一 `ensureWarnings`（或全量扫描版 `sweepWarnings`），**复用同一 `warned` 去重键与同一文案**，逻辑不重写。

### 10.4 部署后冒烟

1. `POST /assets/signin`（Bearer）→ `200` 且 `fragments +1`；再调一次 → `409`（**已裁定：采 409，总册已同步**，见 §12-1）。
2. `GET /messages` → `200`，含预警时为**定稿文案逐字**文本；`POST /messages/read` → `unread` 归零。
3. `POST /admin/assets/grant`（总编）→ `200`；`GET /admin/assets/logs` 读回该条（含 `operator` / `reason`）；`tree_steward` token → `403`；未登录 → `401`。
4. 负向扣减到不足 → `409`，且资产、日志、流水都未变。
5. 前端：资产页签到可用；「我的」页「📮 消息中心」入口与角标正常；admin 页「资产运维」区仅总编可见。

---

## 11. 待确认默认口径（按此实现，一句话即可改）

> 以下默认口径**已由总监终审确认保留**（本轮按此实现）：贡献奖励本轮仅后台发放通道（不做用户上传审核流）、注销清空个人四类资产并保留审计流水、玉在发放时 `expires_at = null` 永久。
> **本轮定稿项（Kevin 2026-09-16 拍板）**：#2（邀请 = 9 碎片/次 · 每日上限 3 次；贡献 = 1 碎片/次 · 每日上限 9 次，K3）与 #9（注销前置：存在 `status='open'` 挂单则拒绝注销并提示「请先撤销未成交挂单」，K10）已在表中逐条标注「**已定稿（Kevin 2026-09-16 拍板）**」；**其余条目（#1 / #3–#8 / #10 / #11）未涉本轮裁定，维持原默认口径、一句话可改、不得删。**

| # | 口径 | 默认取值 | 改动影响面 |
|---|---|---|---|
| 1 | 自然日时区 | 北京时间 **UTC+8**；`signin_date` 与预警天数一律按 +08:00 计算（总册未定义时区） | 签到判重、预警生成 |
| 2 | 贡献 / 邀请奖励数量与上限 | **已定稿（Kevin 2026-09-16 拍板）**：**邀请新用户注册 = 9 碎片/次、每日上限 3 次**；**贡献（上传史料 / 老照片 / 文献 / 族谱纠错）= 1 碎片/次、每日上限 9 次**；去重键 `reward:<type>:<phone>:<ref>`；两者本轮均**仅后台发放通道**（K3）。碎片持有上限 9 → **9 碎片发放必然触发**「满 10 自动合成 1 籽」（见 §3 表下「碎片上限联动」注） | 规则表途径 3–5；§3 联动注；§8.3 不变量 |
| 3 | 后台发放批次有效期 | 籽 / 竹片：发放日 **+365 天**（总册「核心算法 / 接口清单」）；玉：发放时 `expires_at = null` 永久，见总册（待确认默认口径） | `grant` 出参、到期预警触发面 |
| 4 | 贡献奖励通道 | 本轮**只提供后台发放通道**（`grant`，依据并入 `reason`），**不做**用户上传/审核流 | P4-3 / P4-6 |
| 5 | 消息保留上限 | 每用户**最近 200 条**（裁剪最旧的**已读**消息，未读不裁剪）；总册未定义 | `jiazu_messages` 体量、消息中心列表 |
| 6 | 家族灵气预警收件人 | 该树 **anchor 用户 + 该树 `tree_steward` + 全部 `chief_editor`**，**逐人各自一份**（去重键含手机号）；惰性生成只补当前请求人 | 消息分发面（改成「仅 anchor 用户」即一句话） |
| 7 | 剩余天数取整 | `Math.ceil(毫秒差 / 86400000)`；文案中的 30 / 7 为**固定值** | 预警生成边界 |
| 8 | 日志查询上限 | `limit?` 默认 50（总册「接口清单」）、**上限 200**；本册追加 `operator?` 过滤 | `GET /admin/assets/logs` |
| 9 | 注销前置与注销后账号文档 | **已定稿（Kevin 2026-09-16 拍板）**：**注销前置** —— 存在 `status='open'` 市集挂单时**拒绝注销**（**409「请先撤销未成交挂单」**），`sold` / `cancelled` / `expired` 无碍（K10，取代原「自动作废 open 挂单」口径）；通过后清空资产（四类）+ 写 `account_clear` 流水（总册「核心算法」）；`jiazu_users` / `jiazu_anchors` **保留**，审计与流水保留 | §7.2；账号体系批次可能再改 |
| 10 | 后台扣减碎片 | 允许（用于纠错），受 0 下限约束；**不改变**总册（资产定义）「碎片不参与业务扣费」的口径 | `grant` 负向 `fragments` |
| 11 | 扣减顺序 | 一律 **FIFO（`expires_at` 升序）**；玉的 `null` 视为最晚（总册「核心算法」） | `grant` 负向结果 |

---

## 12. 与总册的对齐差异（登记项，已由总监终审逐条裁定）

> 本册与总册 `docs/economy.spec.md` **不冲突**的部分不再列举；以下为**必须记录**的差异，
> 原则：**字段名 / 集合名 / 算法 / 路由语义以总册为准**；以下 7 项差异**已逐条裁定**（第 1–6 项由总监终审、第 7 项由 Kevin 2026-09-16 拍板），「处置」列即落地口径。

| # | 差异 | 总册口径 | 本册口径 | 处置 |
|---|---|---|---|---|
| **1** | **同自然日重复签到的响应** | 原为幂等 `200 { ok:true, already:true }`（总册「接口清单」） | **`409 { error: '今日已签到' }`**（本轮拍板口径：`signin_date` 判重、同日重复 409） | **已由总监终审裁定：采 409，总册已同步**（本册 §4.1 的 409 口径为定稿，前端 toast 不变） |
| 2 | **本册新增的 2 条路由** | 原未定义 `POST /messages/read`、`GET /admin/assets/user`（总册「接口清单」）；消息落点只写「首页/我的 未读红点」（总册「前端落点与入口」） | 定稿为已读写接口 + 后台资产快照读接口 + 独立 `pages/messages/index.vue` 消息列表页 | **已由总监终审裁定采纳**（总册已补登记路由与消息落点）；本册 §4.3 / §5.4 及消息列表页为定稿形态 |
| 3 | **`BambooLot.source` / `Jade.source` 枚举** | 原无运营发放值：竹片仅 `'official_purchase'` \| `'spirit_gift'` \| `'market'`，玉仅 `'synthesis'`（但总册「接口清单」注明运营可发竹片） | 后台发放竹片写 `source='admin'`；后台发放的玉写 `source='admin'` | **已由总册补全**：`BambooLot.source` = `'official_purchase'` \| `'spirit_gift'` \| `'market'` \| `'admin'`；`Jade.source` = `'synthesis'` \| `'admin'`（后台发放的玉用 `'admin'`，合成出的玉用 `'synthesis'`） |
| 4 | **贡献奖励依据的落库** | `OpsLog` 只有 `reason`（总册「存储契约」），无 `evidence` 字段 | 接口保留可选入参 `evidence`，落库时**并入 `reason`**（`<原因>｜依据：<依据>`） | **已由总监终审裁定保留**：`evidence` 并入 `reason`、不新增字段；`grant` 的 `reason` 必填、缺 `reason` → `400` 不变 |
| 5 | **测试文件命名** | 总册（测试与约束）分派 `lib/assets.test.js` / `lib/economy-spirit.test.js` / `lib/economy-market.test.js` | 本册用例并入 `lib/assets.test.js` + 新增 `lib/messages.test.js` | **已由总监终审裁定采纳**（总册「测试与约束」已登记）；保留，两个文件都必须注册进 `scripts.test` |
| 6 | **剩余天数与文案数值** | 总册（待确认默认口径）只定 `GET /assets/expiring` 默认阈值 30 天 | 文案中的「30 日 / 7 日」为**固定值**，天数取整用 `ceil` | 无需改总册；如日后要「动态显示实际剩余天数」→ 改本册 §4.4 两处 |
| **7** | **邀请 / 贡献奖励的数量与上限** | 总册（待确认默认口径）：邀请与贡献奖励**各 1 碎片/次、每日上限 9 次** | **邀请新用户注册 = 9 碎片/次、每日上限 3 次；贡献（上传史料 / 老照片 / 文献 / 族谱纠错）= 1 碎片/次、每日上限 9 次**；两者本轮均仅后台发放通道（K3） | **已定稿（Kevin 2026-09-16 拍板，K3）**：本册 §3 规则表途径 3–5 与 §11 #2 为定稿口径，总册该默认口径按本册同步；碎片持有上限 9 → 9 碎片发放必然触发「满 10 自动合成 1 籽」（同段「碎片上限联动」注） |

---

## 13. 附：本册接口一览（速查）

| 路由 | 方法 | 鉴权 | 写集合 | 本册章节 |
|---|---|---|---|---|
| `/assets/signin` | POST | user | `jiazu_assets`（+ `txs`） | §4.1 |
| `/messages` | GET | user | `jiazu_messages`（惰性补齐预警） | §4.3 / §4.5 |
| `/messages/read` | POST | user | `jiazu_messages` | §4.3 |
| `/admin/assets/grant` | POST | **chief_editor** | `jiazu_assets` + `jiazu_ops_logs` + `txs` | §5.1 |
| `/admin/assets/logs` | GET | **chief_editor** | 只读 | §5.3 |
| `/admin/assets/user` | GET | **chief_editor** | 只读 | §5.4 |

---

## 14. 资产运维**六类补全** + 全站量词统一（**追加章节 · Kevin 已裁 2026-09-26 · 只追加 · 不改 §1–§13 任何历史行 · 删除行 = 0**）

> **性质（只追加）**：本节为**纯追加章节** —— **§1–§13 既有行原文一律保留、一字不改、一行不删**；凡被本节取代者，**只在本节新增行里标「已被取代」并写明取代者**（`AGENTS.md` §0-4「历史版本行不机械改写」；`docs/*.qa.md` 不得回改 = §0-5，本单**未碰任何 `.qa.md`**）。**落盘方 = Jing（制度员）**（`AGENTS.md` §1.1：**无代码修改权限**，只登记口径；代码实现归**另单**）。
> **⚠️ 取代关系（本节头部明写）**：**本节取代本册 §5 的「四类资产」口径** —— 自本节起，运营后台「资产运维」区的资产面 = **六类**（§5 的四类 **+ 兰帖 + 兰帖残页**）。**§5（含 §5.1 / §5.4 / §5.5）内所有「四类」字面一律原文保留、不回改、不上移**；其**语义自本节起按六类读取**。**唯一例外 = §7.2 的注销清空仍为四类**（**本批不纳入 · 登记为待裁**，见 §14-7）。
> **来源**：Kevin **2026-09-26 当面拍定**两件事 —— ① **资产运维区由 4 类扩为 6 类**（兰帖 / 兰帖残页的发放 / 扣减 + 用户资产快照 + 资产变动日志显示）；② **全站量词统一**。**量词真源表** = 本节 §14-1（与 `docs/economy.spec.md` **§21** **同批同表**；好友域侧 = `docs/friend-domain.spec.md` **§24**）。
> **数值 / 字面纪律**：本节**不写任何实现现状读数**（行数 / 测试条数 / 构建字节 / 常量值一律不写）；凡引用文件、字段、路由、文案，**一律以对应命令（`grep` / 源码现证）的实际输出为准**；**行号一律以现证命令为准**。
> **本批冻结变更面（登记 · 供对齐 · 本节不复述为实现规格）**：`cloudfunctions/compat-api/lib/economy-ops.js`（`DELTA_KEYS` 扩 6 项 / `grantAssets` 新分支 / `adminUserAssets` 出参追加五项）· `frontend/src/business/api.ts`（`AssetDelta` / `AdminAssetSnapshot`）· `frontend/src/pages/admin/index.vue`（`DELTA_FIELDS` 与快照区）；**量词文案落点（未单点化者）** = `frontend/src/business/asset-text.ts` / `business/inventory.ts` / `business/friends.ts` / `business/tasks.ts` / `components/asset-inventory/asset-inventory.vue`（**落点登记，非口径**）。

### 14-1 六类清单 · 真源键 · 量词 · 换算（**逐字**）

| # | 品类 | 真源键（`jiazu_assets` 字段 / `delta` 键） | 量词（**本批现行**） | 旧量词 | 换算 |
|---|---|---|---|---|---|
| 1 | 石榴籽 | `seeds` | **颗** | 颗（不变） | **1 格 = 9999 颗** |
| 2 | 竹片（行囊名「竹简」） | `bamboos` | **片** | 片（不变） | **1 格 = 100 片** |
| 3 | 石榴籽碎片 | `fragments` | **片** | ~~个~~ | **10 片 = 1 颗籽**（满 10 自动合成） |
| 4 | 石榴籽玉 | `jades` | **枚** | 枚（不变） | **1 枚 = 1 格** |
| 5 | **兰帖** | **`scrolls`** | **张** | ~~枚~~ | **1 张 = 100 片**；`scrolls[].qty` **仍以片计**（**存储量级一字不改**） |
| 6 | **兰帖残页** | **`scroll_fragments`** | **片** | ~~个~~ | **100 片 = 1 张**（满 100 自动合成） |

- **词形原则（逐字）**：**碎片类（石榴籽碎片 / 兰帖残页）一律「片」；兰帖一律「张」**；**玉仍「枚」、籽仍「颗」、竹片仍「片」**。
- **兰帖的「张」是展示 / 输入量词，不是存储单位** —— 存储与传输**一律以片计**（承 §14-2）。**「旧量词」列仅作对照**，历史行里的「枚」「个」**原文保留**（§14-8 旧行清单）。

### 14-2 线上 `delta` 键与单位（**六类**）

| `delta` 键 | 单位（**线上存储 / 传输**） | 换算 |
|---|---|---|
| `seeds` | **颗** | 1 格 = 9999 颗 |
| `bamboos` | **片** | 1 格 = 100 片 |
| `fragments` | **片** | 10 片 = 1 颗籽 |
| `jades` | **枚** | 1 枚 = 1 格 |
| **`scrolls`** | **片**（**以片计**） | 1 张 = 100 片 |
| **`scroll_fragments`** | **片**（**以片计**） | 100 片 = 1 张 |

- **硬约束**：`delta.scrolls` **以片计**（**与既有 `scroll_decompose` / `scroll_consume` 同键同向**，见 `docs/economy.spec.md` §4-6 追加登记）；**不得**改为以「张」存储或传输。**`delta` 键名一律为真源资产键**（六类如上行）。
- **量词只活在展示层与输入层**：响应体、落库、流水、批次 `qty` 一律用最小单位（颗 / 片 / 枚）。

### 14-3 表单输入单位与换算（后台「资产运维」区的数量输入）

- **输入按用户可见量词**：石榴籽 **颗** · 竹片 **片** · 石榴籽碎片 **片** · 石榴籽玉 **枚** · **兰帖 张** · **兰帖残页 片**（**可负**，承 §5.1 既有口径）。
- **唯一换算（兰帖单点）**：**提交 ×100**（张 → 片，写入 `delta.scrolls`）/ **展示 ÷100**（片 → 张，快照与日志）。**其余五类输入即存储单位、无换算**。
- **示例（形态，非读数）**：输入 **2 张** ⇒ `delta.scrolls = 200`（片）；输入 **−1 张** ⇒ `delta.scrolls = −100`（片）；快照 / 日志把 `… 片` **÷100** 显示为张。
- **不得**据「输入张数」直接判扣减充足与否 —— **充足性判定用精确片数**（见 §14-6）。

### 14-4 快照新增出参字段（**逐字名 · 单位口径**）

`GET /admin/assets/user` 出参在 §5.4 既有字段之外**追加五项（字段名逐字）**：

| 字段名 | 含义 | 单位口径 |
|---|---|---|
| `scroll_fragments` | 兰帖残页持有量（标量） | **片** |
| `scroll_fragment_cap` | 兰帖残页上限（常量） | **—**（**数值以 `docs/economy.spec.md` §16-1 为准，本节不复述**） |
| `scrolls_total_pieces` | 兰帖总片数（跨批次合计） | **片** |
| `scrolls_item_count` | 兰帖**整张数（整道具数）** = `floor(总片数 / 100)` | **张** —— **措辞不得写成「格数」**（承 `docs/economy.spec.md` **§14-13 ⑥** 与 **§18-4**：**该两处的「枚数」措辞按本批量词表读作「张数」**；**两处旧行原文保留**） |
| `scroll_lots` | 兰帖批次数组（逐批 `qty`） | **片** |

- **§5.4 的旧出参行（现证行号 = 287）原文保留**，其语义自本节起**追加**上列五项；出参字段名 / 集合名 / 算法的总原则不变（**字段名以总册为唯一权威**，`docs/economy.spec.md` §12-8）。

### 14-5 资产变动日志显示（**六类 delta**）

- **日志列表（`GET /admin/assets/logs`）的 `delta` 显示一律按用户可见量词**：兰帖 **÷100 显示「张」**、兰帖残页 **直接「片」**、籽「颗」/ 竹片「片」/ 石榴籽碎片「片」/ 玉「枚」。
- **扣减同口径**：`delta` 为负时**负号跟随数值**（如 `−1 张` / `−100 片`）。
- **不整除的显示形态**：兰帖片数**除不尽 100 时不得四舍五入成整张** —— 形态须能同时表达整张与余片；**具体渲染字面以实现落地的现证输出为准，本节不预填**（`AGENTS.md` §0-3）。
- **§5.5 的旧界面落点行（现证行号 = 297，含「四类资产数量输入」「四类 delta」）原文保留**，其语义自本节起按**六类**读取。

### 14-6 409 `ASSET_INSUFFICIENT` 的 `unit` 枚举：**四类 → 六类**

不足一律 `409`，响应体形状沿用 `docs/economy-fee.spec.md` §6 的真源：`{ error, code: 'ASSET_INSUFFICIENT', need, current, unit, how_to_get }`。

| `unit`（**现行六项**） | 资产 | 量词 | 文案形态 |
|---|---|---|---|
| `fragments` | 石榴籽碎片 | **片** | 资产不足，需 N 片石榴籽碎片，当前 M 片 |
| `seeds` | 石榴籽 | 颗 | 资产不足，需 N 颗石榴籽，当前 M 颗 |
| `bamboos` | 竹片 | 片 | 资产不足，需 N 片竹片，当前 M 片 |
| `jade` | 石榴籽玉 | 枚 | 资产不足，需 N 枚石榴籽玉，当前 M 枚 |
| **`scrolls`** | **兰帖** | **张 / 片** | **须同时含「需求张数」与「当前精确片数」**（形态例：`资产不足，需 N 张兰帖（= N×100 片），当前 M 片`）—— **`current` 不得四舍五入成张**（**精确片数**），`need` 亦以片为机器可读值 |
| **`scroll_fragments`** | **兰帖残页** | **片** | 资产不足，需 N 片兰帖残页，当前 M 片 |

- **既有四项的字面与量词不改**（`jade` **不是** `jades` —— **沿用既有字面**）；**新增两项** = `scrolls` / `scroll_fragments`（**与 §14-2 的 `delta` 键同名同单位**）。
- **归一规则继续有效**（§5.1 尾注）：实现内部如需单数形（`seed` / `bamboo`），**响应体 `unit` 一律归一为资产键名**，**单数形不得出现在响应体里**。
- **§5.1 的旧「`unit` 枚举 · 四类补全」块（现证行号 = 225 / 227 / 229–234 / 237）原文保留**，其语义自本节起按**六类**读取。

### 14-7 账号注销清空：**仍四类 · 本批不纳入 · 登记为待裁**

- **本批不动注销面**：注销清空仍只清 §7.2 第 1 条所列**四类**（`fragments` / `seeds` / `bamboos` / `jades`）+ `signin_date`；**兰帖（`scrolls`）与兰帖残页（`scroll_fragments`）本批不清**。
- **状态 = 待裁**（**未裁前不得据任一读法判任何实现负**；**不得**写成「已定稿」，亦**不得**据本节反推注销面已扩六类）。
- **受影响旧行（原文一律保留、不回改）**：§7.2 第 1 条（现证行号 = 369）· §8.2 用例 13（**411**，含「四类清零」）· §11 注（**478**，「注销清空个人四类资产」）· §11 表 #9（**491**，「通过后清空资产（四类）」）。**上列四行的「四类」字面与现有行为一致，本批既未取代、也未改写。**

### 14-8 受影响既有行清单（**一律「已被取代 · 原文保留」** · 现证 grep 行号）

**量词面（本批取代）**：

| 行号（现证） | 该行涉及的旧量词 | 处置 |
|---|---|---|
| **79 / 80 / 81 / 82 / 83 / 85** | 途径 1–5 / 7 的「碎片 **N 个**」 | **已被取代** ⇒ 「个」按 §14-1 读作 **片**（**数值不变**） |
| **94** | 「碎片上限联动（K3 …）」内「原有 1 个碎片」「收 9 个后」 | **已被取代** ⇒「个」读作 **片** |
| **231** | 负向不足 409 表 `fragments` 行的文案量词「**个**」（`资产不足，需 N 个碎片，当前 M 个`） | **已被取代** ⇒ 量词 = **片**（§14-6 表） |
| **234** | 同表 `jade` 行的「枚」 | **不变**（玉仍「枚」） |

**「四类」面（本批取代）**：

| 行号（现证） | 该行字面 | 处置 |
|---|---|---|
| **88** | §3 途径 10「**后台手动扣减（四类）**」 | **已被取代** ⇒ 六类（本节 §14-1） |
| **222** | §5.1 校验 6「`unit` 的**四类**取值见下…」 | **已被取代** ⇒ 六类（§14-6） |
| **225 / 227 / 237** | §5.1「负向不足 409 的响应体（`unit` 枚举 · **四类**补全）」标题 + 「共**四类**」+ 归一规则句 | **已被取代** ⇒ 六类（§14-6；**归一规则本身继续有效**） |
| **297** | §5.5「② **四类**资产数量输入（可负）」「显示…/ **四类** delta」 | **已被取代** ⇒ 六类 + 兰帖 ×100 / ÷100 换算（§14-3 / §14-5） |
| **405** | §8.2 用例 7「**四类**各 +N 到账」 | **已被取代** ⇒ 六类（用例面见 §14-9） |
| **287** | §5.4 出参行（未含兰帖 / 残页五项） | **已被取代（追加面）** ⇒ §14-4 五项 |
| **411 / 478 / 491 / 369** | 注销面「四类清零」「个人四类资产」「清空资产（四类）」 | **未取代 · 继续有效**（**本批不纳入 · 待裁**，见 §14-7） |

- **同名不同义（防误标 · 逐字）**：**§4.4「四类预警：生成条件与去重键」（现证行号 = 147）与本节的「六类资产」无关** —— 那是**站内信预警**的四类（到期 / 灵气等），**本批一字不动**；**不得**把它标成「已被取代」。
- **现证命令（可复现）**：`grep -n "四类" docs/economy-ops.spec.md`；`grep -nE "碎片 ?\*?\*?[0-9]+ ?个|个碎片" docs/economy-ops.spec.md`；`grep -n "枚" docs/economy-ops.spec.md`（**该册「枚」命中 12 条，其中 9 条为「枚举」一词**，量词位仅 §3 途径 9 / 途径 12 与 §5.1 `jade` 行 —— **玉的量词本批不变**）。

### 14-9 测试与验收口径（**判据 · 不含实测读数**）

- **用例面（形态登记）**：六类各一条正向发放 + 一条负向扣减；兰帖按**张**输入 → 落库 / 流水 / 快照**按片**（**×100**）；快照五项字段可读回；409 `unit` 两个新值（`scrolls` / `scroll_fragments`）各一条，且兰帖不足文案**同时含张数与精确片数**；日志六类 delta 显示按用户可见量词。
- **注销清空用例维持四类**（**待裁** ⇒ **不得据「未清兰帖」判实现负**）。
- **本节不登记任何读数**（测试条数 / 通过数 / 注册数一律以对应命令的实际输出为准，`AGENTS.md` §7 纪律）。

### 14-10 本节未做项（**如实登记**）

- **未改任何代码 / 配置 / `migrate-output/` / `config/`**（**真源零写入**、全程只读）；**未打包 / 未部署 / 未上传**；**未跑测试 / 未跑构建**。
- **本册 §1–§13 删除行 = 0**、**未回改任何历史行**、**未碰任何 `.qa.md`**（`AGENTS.md` §0-5）。
- **未裁任何【待裁】项**（含 §14-7 的注销清空四类 / 六类）；**未写实现现状读数**（除上列 **现证 `grep` 行号**）。
- **一句话可改**：改本节 §14-1 任一量词一处（须同步同步 `docs/economy.spec.md` §21 同表 + `docs/friend-domain.spec.md` §24）。

### 14-11 追记：账号注销清空 **四类 → 六类**（**追加子节 · Kevin 已裁 2026-09-26 当面 · 只追加 · 不改 §14-1 – §14-10 任何行 · §1–§13 删除行 = 0**）

> **性质（只追加）**：本子节为**纯追加** —— **§1–§13 与 §14-1 – §14-10 既有行原文一律保留、一字不改、一行不删**；凡被本子节取代者，**只在本子节新增行里标「已被取代」并写明取代者**（`AGENTS.md` §0-4「历史版本行不机械改写」；`docs/*.qa.md` 不得回改 = §0-5，本单**未碰任何 `.qa.md`**）。**落盘方 = Jing（制度员）**（`AGENTS.md` §1.1：**无代码修改权限**，只登记口径；**代码实现归另单**）。
> **⚠️ 取代关系（本子节头部明写 · 逐字）**：**本子节取代 §14-7 的「账号注销清空 **仍四类 · 本批不纳入 · 登记为待裁**」口径**，并**取代本册 §7（含 §7.2）内一切「注销仍只清四类」的写法**，亦**取代 §14 引言行内「唯一例外 = §7.2 的注销清空仍为四类（本批不纳入 · 登记为待裁）」的写法** —— **自本子节起，注销清空 = 六类**。**上列各处旧行一律原文保留、不回改、不上移**；其**语义自本子节起按六类读取**。

- **裁定（Kevin 2026-09-26 当面 · 逐字照录）**：`POST /account/delete` 的 **`cleared` 出参**与 **`account_clear` 流水 `delta`** 各**新增 `scrolls`（**以片计**）/ `scroll_fragments`（**以片计**）两键**；注销时置空 **`scrolls = []`** / **`scroll_fragments = 0`**；**K10 挂单前置**、**先写 `account_clear` 流水再置空**、**幂等重入 `200`**、**保留** `jiazu_users` / `jiazu_anchors` / 历史 `Tx` / `jiazu_ops_logs` / 钱包流水 —— **一律不变**。
- **前端注销二次确认文案**：**只追加**品类枚举（**逐字形态**：`…石榴籽玉、兰帖、兰帖残页将全部清空…`）；**既有文案其余字面不变**。
- **量词与单位（承 §14-1 / §14-2）**：`scrolls` **以片计**（**不得**改以「张」存储 / 传输）；`scroll_fragments` **以片计**；**展示 / 输入层量词** = 兰帖 **张** / 兰帖残页 **片**。
- **数值零改动**：本裁定**不改任何数值**（99 / 100 / 100 / 99 一字不改 —— 承 `AGENTS.md` **勘误 2**）。
- **状态 = 已裁**（Kevin 2026-09-26 当面）⇒ **§14-7 / §14-9 / §14-10 内「待裁」措辞自本子节起不再适用**（**各旧行原文保留**）；**同步落点** = `AGENTS.md` **勘误追加区 勘误 8**（含被取代旧行逐条行号）· `docs/PENDING_DEPLOY.md` **§38 追加行**（上云面补登 + 部署后冒烟补一条）。

**被取代的旧行位置（**现证 `grep` 行号 · 逐条列出 · 本子节不回改任何一行**）**：

| # | 本册现证行号 | 该行字面（节选） | 处置 |
|---|---|---|---|
| 1 | **24** | §1.2 不变量 2「注销即清空：…全部石榴籽、碎片、竹片清空」 | **补充面（非取代）** ⇒ **未列兰帖 / 兰帖残页**，**按六类读**（该行其余字面不动） |
| 2 | **369** | §7.2 第 1 条「清空资产：`fragments = 0`、`seeds = []`、`bamboos = []`、`jades = []`、`signin_date` 清空」 | **已被取代** ⇒ 六类（**追加 `scrolls = []` / `scroll_fragments = 0`**） |
| 3 | **374** | §7.2 第 6 条「注销后该账号的碎片/石榴籽/竹片/玉**不可恢复**」 | **已被取代** ⇒ 品类枚举**追加「兰帖 / 兰帖残页」** |
| 4 | **376** | §7.2 第 8 条「资产已空（`fragments = 0` / `seeds` / `bamboos` / `jades` 均空 / `signin_date` 空）」 | **已被取代** ⇒ 六类（**幂等 `200` 口径本身不变**） |
| 5 | **411** | §8.2 用例 13「**四类清零** + `signin_date` 清空 + `type='account_clear'` 流水」 | **已被取代** ⇒ **六类清零**（用例面追加） |
| 6 | **478** | §11 注「注销清空个人**四类**资产并保留审计流水」 | **已被取代** ⇒ 六类 |
| 7 | **491** | §11 表 #9「通过后清空资产（**四类**）+ 写 `account_clear` 流水」 | **已被取代** ⇒ 六类 |
| 8 | **530** | §14 引言「**唯一例外 = §7.2 的注销清空仍为四类**（本批不纳入 · 登记为待裁）」 | **已被取代** ⇒ **无例外、六类** |
| 9 | **608** | §14-7 标题「账号注销清空：**仍四类 · 本批不纳入 · 登记为待裁**」 | **已被取代** ⇒ 本子节 §14-11 |
| 10 | **610 / 611 / 612** | §14-7 正文（「本批不动注销面…仍只清四类」「**状态 = 待裁**」「受影响旧行…本批既未取代、也未改写」） | **已被取代** ⇒ 六类 · **已裁** |
| 11 | **635** | §14-8 表行「**411 / 478 / 491 / 369** …**未取代 · 继续有效**（本批不纳入 · 待裁）」 | **已被取代** ⇒ 上列四行**自本子节起被取代** |
| 12 | **643** | §14-9「注销清空用例维持**四类**（**待裁** ⇒ 不得据「未清兰帖」判实现负）」 | **已被取代** ⇒ 用例面 = 六类（**判负禁令随「待裁」一并失效**） |
| 13 | **650** | §14-10「**未裁任何【待裁】项**（含 §14-7 的注销清空四类 / 六类）」 | **已被取代** ⇒ 该项**已裁** |

- **§7 内其余注销行不受影响（明文 · 一字不动）**：**362**（注销接口现状登记）· **365**（注销 ≠ 解绑）· **370**（K10 挂单前置）· **372**（`jiazu_anchors` / `jiazu_users` 默认保留）· **373**（后台代注销额外写 `OpsLog`）· **375**（注销错误码）—— **一律继续有效**（本裁定明写「**一律不变**」）。
- **判据面（承 `AGENTS.md` §0-3「不写实现现状读数」）**：**本节只登记口径与行号**；测试条数 / 通过数 / 构建字节 / 路由条数 / 产物 md5**一律以对应命令的实际输出为准**；**未推算、未预填**。上云动作与判据 = `docs/PENDING_DEPLOY.md` **§38 追加行**。
- **本节未做项（如实登记）**：**未改任何代码 / 配置 / `migrate-output/` / `config/`**（**真源零写入**、全程只读）；**未打包 / 未部署 / 未上传 / 未重传**；**未跑测试 / 未跑构建**；**未碰任何 `.qa.md`**（`AGENTS.md` §0-5）。

### 14-12 追记：**§14-6 形态例以现盘为准**（**追加子节 · 只追加 · 不改 §14-1 – §14-11 任何行 · §1–§13 删除行 = 0 · 零代码 / 零真源**）

> **性质（只追加）**：本子节 = **§14-6 之追记**（**§14-6 标题现证行号 591 · 其表内形态例行现证行号 601**）。**纯追加** —— **§14-1 – §14-11 既有行原文一律保留、一字不改、一行不删**；凡被本子节取代者，**只在本子节新增行里标「已被取代 · 原文保留」并写明取代者**（`AGENTS.md` §0-4「历史版本行不机械改写」）。**本子节对真源零写入**（`migrate-output/` 与 `config/` **未改 / 未移 / 未删**，全程只读）；**未改任何代码 / 配置**；**未碰任何 `.qa.md`**（`AGENTS.md` §0-5）。
> **落点说明（防行号漂移 · 逐字）**：本子节**落于 §14 末（§14-11 之后）而不插在 §14-6 与 §14-7 之间** —— 若在其间插行，则 §14-7 标题（**现证 608**）· §14-7 正文（**610 / 611 / 612**）· §14-8 表行（**635**）· §14-9（**643**）· §14-10（**650**）· §14-11（**653**）以及 `AGENTS.md` **勘误 7 / 勘误 8** 与 `docs/PENDING_DEPLOY.md` **§38** 所引同一批**现证行号将全体漂移**；**本子节落点 = 不改动任何既有行号**（**行号一律现证 · `awk NR==n`**）。

- **裁定（Zang 2026-09-26）**：**改规格、不改代码**。§14-6 表内兰帖行的**形态例成文早于代码定型**（**现证行号 601**），其字面与**现盘逐字不符**；**现盘文案含三项**（**需求张数 + 当前张数 + 当前精确片数**），信息更全，**且正是 §14-6 自己要求的「须同时含需求张数与当前精确片数」** ⇒ **形态例以现盘为准**。
- **现盘逐字形态例（`unit = 'scrolls'` · 两个分支 · 逐字照录）**：
  - **整除分支（需求片数为 100 的整数倍 · 经 UI 可达）**：`资产不足，需 999 张兰帖，当前 0 张（55 片）`；
  - **非整除分支（仅 API 直调可达 —— 前端表单送出的恒为 100 的倍数）**：`资产不足，需 150 片兰帖，当前 0 张（55 片）` —— **需求退片、当前仍给「张 + 精确片」**（**绝不写「1.5 张」这类假张数**）。
- **机器可读字段的硬口径（已由 commit `e3a1fa0` 保证 · 逐字）**：`need` / `current` **一律为「片」**，与 `unit = 'scrolls'`、**线上存储（`scrolls[].qty` / `scroll_lots[].qty`）**、**请求 `delta.scrolls`** **同分母**；**「张」只出现在人文文案 `message` 里**（**不得**进机器可读字段）。**原因（一句）**：**不得同一响应体内两套单位**。**历史缺陷（如实登记）**：曾把 **`need` 覆写成张**，且 **不可整除时 `need` 退片 / `current` 恒张** ⇒ 同一响应体内「片 + 张」两套单位，消费者直拼两数即读错。
- **旧行原文保留声明**：§14-6 表内形态例（**现证行号 601**）的 **「（= N×100 片）」** 与 **「当前 M 片」** 措辞**原文保留**，其**语义自本追记起按现盘读取**（**本手册 §0-4 体例**）；**不得回改 601 行**；**不得据 601 行判实现负**。
- **观察项（未修 · 只登记 · 非本批缺陷）**：`frontend/src/components/person-manage-panel/person-manage-panel.vue` **现证行号 838** 的 `seedShortageLines()` 把 `need` / `current` 两数**直拼**并**硬编码量词「颗」**（**逐字**：``本次需 ${err?.need ?? '—'} 颗，当前可用 ${err?.current ?? '—'} 颗``）；它**当前只服务籽域**（**兰帖 409 不经过该函数**）；**若将来被兰帖 / 竹片域复用，会输出错误量词**。**建议后续把量词收敛到 `asset-text.ts` 量词单点**。**本批未触碰该文件**（**未改 / 未删 / 未移**）。
- **判据面（承 `AGENTS.md` §0-3）**：本子节**只登记口径与逐字形态例**；**测试条数 / 通过数 / 构建字节一律以对应命令的实际输出为准**；**未跑测试 / 未跑构建 / 未打包 / 未部署 / 未重传**。
- **观察项关账（**追加 · 只追加，上条观察项文字一字不改、一律保留**）**：**已修** —— commit **`0666140`**（`fix(copy): 行囊「道具」计数措辞统一为「格」+ 立支籽不足明细行量词收敛至 asset-text 单点`，2026-09-26）。**新文案（逐字）** = `本次需 X <量词>，当前可用 Y <量词>`；**量词走 `frontend/src/business/asset-text.ts` 单点**（`SHORTAGE_UNIT_BY_KEY` **现证 `NR==235–242`** · `shortageLine()` **现证 `NR==251–256`**）；**`scrolls` = 片** —— **依据 = 本子节上条「机器可读字段的硬口径」**（`e3a1fa0` 后 `need` / `current` **恒为片** ⇒ **量词跟着数字口径走**）。**落点（`awk NR==n` 现证 · 以现证为准）** = `frontend/src/components/person-manage-panel/person-manage-panel.vue` **`NR==833`**（函数注释）/ **`NR==834`**（`function seedShortageLines(e: unknown)`）/ **`NR==838`**（量词单点注释）/ **`NR==839`**（`lines.push(shortageLine(err?.need, err?.current, err?.unit));`）。**说明（防误引旧行号）**：上条观察项所引「**现证行号 838**」系**落笔时点**的行号，**现证 `NR==838` 已非该函数体**（该函数现证起于 **`NR==834`**、调用行现证 **`NR==839`**）—— **上条文字原文保留、不回改**，**本次落点行号一律以现证为准**。**结果**：该组件**已零「颗」/「枚」量词字面**、**不再展示英文 `unit` 键**（**未知 / 缺失键 ⇒ 不加量词、只出数字**，**不回退「颗」**）；**上条「建议后续把量词收敛到 `asset-text.ts` 量词单点」已落地**。**口径落点 = `docs/economy.spec.md` §21-7**；**本子节对真源零写入 / 零代码**（**实现 = 另单**）。
