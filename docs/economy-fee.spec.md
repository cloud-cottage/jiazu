# 竹片扣费闸门 — 规格（economy-fee.spec.md）

> 状态：**设计已确认（Kevin 2026-09-16）· 待实施**
> 真源级别：规格文件。实施（compat-api / frontend）必须与本文件一致；与 `docs/data-model.md`、`docs/permission-tier.spec.md`、`docs/marriage.spec.md`、`docs/clan-tree.spec.md` 冲突时以本文件为准并同步修订彼文件。**与 docs/economy.spec.md（总纲）冲突时，一律以总纲为准并回改本册。**
> 本册是**经济总册 `docs/economy.spec.md` 的扣费分册**：只规定「哪些写操作扣多少竹片 / 石榴籽、在哪一步扣、失败怎么回滚、前端怎么提示」。
> **存储契约（集合与批次结构）、有效期常量、FIFO/sweep 算法、`Tx.type` 枚举由总册唯一权威定义**（`docs/economy.spec.md` §3–§5、§4-6）；本册逐字引用、不改字段、不改算法契约；本册需总册补内容时只在实施报告里提出、不擅自动手改总册（本册曾提出的 5 项已由总册终审裁定同步，见 §13）。
> 本分册落盘文件名 `docs/economy-fee.spec.md`；总册中曾出现的多一个字母 s 的笔误写法，已由总册终审裁定统一为 `docs/economy-fee.spec.md`（本册不改总册）。
>
> **本册与总册的固定对齐表（实施时逐条照抄，不得自创）**
>
> | 项 | 总册出处 | 本册一律采用 |
> |---|---|---|
> | 存储契约 / 批次字段 | 总册 §4-1 | 集合 `jiazu_assets`（`_id='global'`），字段名逐字一致 |
> | `Tx.type` 枚举 | 总册 §4-6 | **一律取总册枚举，本册不自造类型**：人物内容修改 / 同树改父 = **`edit_fee`**；删除节点 = **`delete_fee`**；跨树迁移（带 `new_parent_tree_id`）= **`move_fee`**；建树扣 9 籽 = **`tree_create`**；冲正返还 = **`fee_refund`**；签到 `signin`；过期 `expire`；运营发放 `admin_grant` |
> | 有效期 | 总册 §5-3 | 籽 **365 天**、竹片 **365 天**（到期作废、不返还、不折算）；碎片**无期限**；玉 `expires_at = null` 恒不过期 |
> | 惰性结算 | 总册 §5-4 | **任何资产读/写入口先 `sweep(now)`**，再执行业务逻辑；`qty=0` 的批次由 sweep 移除 |
> | 扣减优先级 | 总册 §5-2 | FIFO by `expires_at` 升序 + **整单拒绝 409**，绝不部分扣、绝不透支 |
> | 建树扣 9 籽 | 总册 §5-5 | 校验通过后落库前扣；失败不扣；已扣而落库失败 → **原路返还同一批次**；删树不退 |
> | 无豁免通道 | 总册 §5-6-3 | 管理员 / `chief_editor` 同样不例外 |
> | 资产读接口 | 总册 §6-1 | **`GET /assets/summary`**（本册不另造 `/assets/balance`） |
> | 路由挂载位置 | 总册 §6 注 | 资产路由必须挂在 `index.js` 树编辑闸门（约 1586 行 `缺少 X-Tree-Id`）**之前** |
> 关联：`cloudfunctions/compat-api/lib/wallet.js`（既有 ¥ 建树费）、`lib/tree-write.js`（updatePerson / reparentNode / deleteNode / createTree / appendChainNode / addSpouseNode / splitTree / removeBranchLink）、`lib/child-write.js`（add-child 跨树）、`lib/store.js`（updateTree / updateTrees）。

---

## 1. 已确认口径（Kevin，逐条写死）

| # | 口径 | 对设计的影响 |
|---|---|---|
| 1 | **新增类一律 0 片**：加父、加子、加配偶、挂接已有节点、总谱续编（chain-append）、认祖、建谱、跨树嫁娶（嫁出/娶入/绝婚/合离）及其审批、解除挂载、绑定类、`POST /people` 与 `POST /families` 新增 | 这些路由**不接扣费闸门**；本册在矩阵里逐行标 0 片，杜绝实施时"顺手加一刀" |
| 2 | **总谱续编属新增 → 不扣**（明确口径） | `POST /admin/chain-append` 两个模式（new / attach）都是 0 片 |
| 3 | **修改删除类扣费**：人物节点内容修改 1 片 / 节点；同树改父 1 片 / 节点；跨树改父（整体迁移）**9 片 / 次**；删除节点 **3 片 / 节点**（两模式同价，subtree 模式 N 人 = 3N 片） | 只有 4 个操作计费，全部走同一闸门模块 |
| 4 | 跨树改父 **9 片 / 次，与带多少后代无关**（用户明确覆盖了"按迁移人数计费"的建议） | 不得实现为 `9 × 人数`；迁移 1 人和迁移 200 人同价 |
| 5 | 删除节点：**批量删除多条人物节点，每条节点独立扣费，不合并计费** | subtree 模式 = `3 × people_count`；promote 模式 = 3 片；永不"打包折扣" |
| 6 | 扣费范围：**所有树都扣**（含中华世本 `zhonghua` 与祖谱 `kind='clan'`），**无豁免通道** | 不按 `treeId === MASTER_TREE_ID` 或 `kind` 免单；但始祖 / 上层镜像本就是只读节点，写不进去 → 403，不存在扣费 |
| 7 | 建树：`POST /admin/create-tree` 由原 ¥9.90 **改为扣 9 颗完整石榴籽**；成功才扣，失败不扣 / 原路返还；**删树不退** | 替换 `wallet.deductTreeCreateFee(u.phone)` 钩子；`jiazu_wallets` 保留（充值 / 转账仍用它） |
| 8 | 扣减优先级：籽 / 竹片一律 **FIFO by `expires_at` 升序**；不足 → **整单拒绝 409**「资产不足，需 X 片竹片，当前 Y 片」 | 绝不部分扣、绝不透支、绝不先扣一部分再报错 |
| 9 | 闸门必须**先扣费成功再落库**，且与既有写入同事务语义：跨树迁移的扣费要与 `store.updateTrees` 的双树事务一致（**扣费失败 → 两棵树都不写**；**写入失败 → 扣费回滚**） | 禁止出现「扣了片但没改数据」与「改了数据但没扣片」两种脏态 |
| 10 | 未登录 / 无权限 → **401 / 403，且不得先扣费**（权限校验必须在扣费之前） | 路由内固定顺序：鉴权 → 只读预检 → 余额预检 → 扣费 → 落库 |

---

## 2. 存储契约（唯一权威：总册；本册逐字一致，不得更名）

集合 `jiazu_assets`（`_id='global'`）：

```
{ users: { <手机号>: { fragments, seeds: SeedLot[], bamboos: BambooLot[], jades: Jade[], txs: Tx[], signin_date } } }
```

- `SeedLot = { id, qty, expires_at, source, created_at }`
- `BambooLot = { id, qty(片), expires_at, source, created_at }`
- `Tx = { id, ts, type, delta:{fragments?,seeds?,bamboos?,jades?}, fee_seeds?, ref:{tree_id?,listing_id?,trade_id?,person_handle?}, desc, operator? }`
- 竹片最小单位 = **片**（1 束 = 100 片）。

本册**不新增任何字段**，只按总册 §4-1 的既有字段写入：

| 用途 | 写法（类型名一律取总册 §4-6 枚举） |
|---|---|
| 扣竹片（修改 / 删除 / 迁移） | `BambooLot.qty -= n`（按 `expires_at` 升序逐批）；`Tx.type` 取总册枚举（人物内容修改 / 同树改父 `edit_fee`、删除节点 `delete_fee`、跨树迁移 `move_fee`）、`delta.bamboos = -n`、`ref.tree_id` / `ref.person_handle`、`desc` 写人类可读说明（如「修改节点 季志全」）、`operator` 写发起人手机号 |
| 扣石榴籽（建树） | `SeedLot.qty -= n`；`Tx.type='tree_create'`、`delta.seeds = -n`、`fee_seeds` 留作市集手续费字段（**本册只登记口径、不实现**：市集手续费 = **floor(标价 × 1/100) 籽**、**0 则免收**、**扣籽不扣竹片**（标价 199 → 买方 199 / 卖方 198）；细则见 `docs/economy.spec.md` 市集章节） |
| 冲正（回滚） | 追加一条 `Tx.type='fee_refund'`、`delta` 取原 Tx 反向值、`ref` 沿用原 `ref`、`desc` 写明原 Tx id；**原路返还同一批次**（恢复该 lot 的原 `qty` 与 `expires_at`，**不新造批次**，总册 §5-5-3） |
| 余额口径 | 先 `sweep(now)`（总册 §5-4）：剔除 `expires_at <= now` 的籽 / 竹片批次并各写一条 `type='expire'` 流水；随后**只计剩余批次**。碎片无期限、玉 `expires_at = null` 恒不过期 |
| 碎片 | 按总册 §3-1：**永不参与扣费**（本册任何一行都不读 `fragments` 做扣减）、永不过期、不可交易 |

---

## 3. 扣费矩阵总表

### 3-1 主表（穷举本轮列出的全部现有写路由，无空项、无「待定」）

`片数` 列一律以**竹片**为单位；唯一例外是第 8 行（建树，石榴籽）与第 34 行（立支，石榴籽）。

| # | 操作 | 路由 | 类别 | 片数 | dry_run 豁免 | 备注 |
|---|---|---|---|---|---|---|
| 1 | 人物节点内容修改（姓名/性别/生卒/健在/称号三字段） | `PUT /people/<handle>` | 修改 | **1 片 / 节点** | 无 | 一次 PUT = 一个节点 = 1 片；总谱节点同价（口径 6）；始祖 / 上层镜像只读 → 403 不扣 |
| 2 | 同树改父 | `POST /admin/reparent`（**不带** `new_parent_tree_id`） | 修改 | **1 片 / 节点** | 无 | 只改本节点挂靠 + 原家族清理；后代不动，不按后代计费；总谱世数平移不额外计费 |
| 3 | 跨树改父 / 整体迁移 | `POST /admin/reparent`（**带** `new_parent_tree_id`） | 迁移 | **9 片 / 次** | 无 | **定稿：与带多少后代无关**（口径 4）；不得写成按迁移人数递增计费；源树 / 目标树都写，一次计一次 |
| 4 | 删除节点 · 整支（subtree）正式提交 | `POST /admin/delete-node`（`mode='subtree'`，`dry_run≠true`） | 删除 | **3 片 × N**（N = `people_count`） | — | 需求原文：批量删除多条人物节点，**每条节点独立扣费，不合并计费** |
| 5 | 删除节点 · 仅本节点（promote）正式提交 | `POST /admin/delete-node`（`mode='promote'`，`dry_run≠true`） | 删除 | **3 片** | — | 两模式同价；子女上提一级不额外计费 |
| 6 | 删除节点 · 预演 | `POST /admin/delete-node`（`dry_run=true`） | 删除 | **0 片** | ✅ dry_run | 只算不写；响应须带 `fee` 供前端拼确认文案 |
| 7 | 删除节点 · 确认数不符 | `POST /admin/delete-node`（`confirm_count` 与实际 `people_count` 不符 → 409） | 删除 | **0 片**（409 前不扣） | — | 校验在扣费之前；重跑 dry_run 后重新提交才扣 |
| 8 | 新建家族树 | `POST /admin/create-tree` | 建树 | **9 颗完整石榴籽**（非竹片） | 无 | 原 ¥9.90 改口径；**成功才扣**，失败不扣 / 原路返还；**删树不退** |
| 9 | 添加子节点（父母均在本树） | `POST /admin/add-child` | 新增 | **0 片** | — | 新增类 |
| 10 | 添加子节点（跨树婚姻家庭 → 子女落父真身树） | `POST /admin/add-child`（父为镜像，`cross_tree=true`） | 新增 | **0 片** | — | 跨树也不扣：一次操作只新增节点 |
| 11 | 添加父节点（前端 `addParentNode`） | `POST /people/` + `POST /families/` | 新增 · 绑定 | **0 片** | — | 加父 = 新建 person + 建家族绑定，两步都属新增 / 绑定 |
| 12 | 添加配偶（同树 · 新建） | `POST /admin/add-spouse`（`mode='new'`） | 新增 · 关系 | **0 片** | — | 补空位与"家族已满再建新家族（再婚）"同价 0 |
| 13 | 挂接已有节点为配偶 | `POST /admin/add-spouse`（`mode='attach'`） | 关系 | **0 片** | — | 挂接类 |
| 14 | 新建人物 | `POST /people/` | 新增 | **0 片** | — | 用户明确列入 0 片清单 |
| 15 | 新建家族（关系绑定） | `POST /families/` | 新增 · 绑定 | **0 片** | — | 用户明确列入 0 片清单 |
| 16 | 更新家族（父/母/子女槽位改组） | `PUT /families/<handle>` | 修改 · 绑定 | **0 片** | — | 绑定类；不在修改删除类扣费清单内（见 §11-5） |
| 17 | 总谱续编 · 新建 | `POST /admin/chain-append`（`mode='new'`） | 新增 | **0 片** | — | 口径 2：总谱续编属新增，不扣 |
| 18 | 总谱续编 · 挂接 | `POST /admin/chain-append`（`mode='attach'`） | 新增 · 挂接 | **0 片** | — | 同上 |
| 19 | 认祖发起 | `POST /admin/founder-request` | 新增 · 关系 | **0 片** | — | |
| 20 | 认祖审批（回写始祖） | `POST /admin/decide-founder` | 新增 · 审批 | **0 片** | — | 审批类不扣（口径 1） |
| 21 | 始祖挂载（直接挂） | `POST /admin/attach-founder` | 新增 · 关系 | **0 片** | — | 挂接已有节点 |
| 22 | 解除挂载（下层树侧） | `POST /admin/detach-founder` | 关系解除 | **0 片** | — | 用户明确：解除挂载 0 片 |
| 23 | 分迁链接清除 | `POST /admin/remove-branch-link` | 解除挂载 | **0 片** | — | 同类动作同价 |
| 24 | 重置始祖 | `POST /admin/reset-founder` | 修改 · 治理 | **0 片** | — | 只写 `tree-meta`，不属人物节点 |
| 25 | 建谱申请 | `POST /admin/clan-request` | 新增 | **0 片** | — | |
| 26 | 建谱审批（建 `kind='clan'` 树） | `POST /admin/decide-clan` | 新增 · 审批 | **0 片** | — | 祖谱建树**不走**建树费：建谱是新增类且是审批产物（口径 1、2） |
| 27 | 跨树嫁娶申请（嫁出 / 娶入 / 合离） | `POST /marriage-request` | 新增 · 关系 | **0 片** | — | |
| 28 | 嫁娶审批通过（双侧写入） | `POST /admin/approve-marriage` | 新增 · 关系 | **0 片** | — | 即使走 `updateTrees` 双树事务也不扣 |
| 29 | 嫁娶驳回 | `POST /admin/reject-marriage` | 审批 | **0 片** | — | 不改数据 |
| 30 | 绝婚（男方单方生效） | `POST /admin/marry-end` | 关系解除 | **0 片** | — | 关系解除 ≠ 删除节点；明确列入 0 片 |
| 31 | 拆分家族树 | `POST /admin/split-tree` | 建树 · 迁移 | **0 片**（默认口径，见 §11-3） | — | 不新增节点、不删节点内容 |
| 33 | 树元信息修改（标题 / 堂号 / 郡望等） | `PUT /tree-meta` | 修改 · 治理 | **0 片** | — | 见 §11-6；治理类，非人物节点 |
| 34 | 立支（普通家族树的普通节点立为新家族树的始祖；祖先链上移并入宗谱） | `POST /admin/establish-branch` | 建树 · 迁移 | **9999 颗石榴籽 / 次**（**不是竹片**） | 不适用（**无 `dry_run`**） | 扣费内核引用总册（存储契约 / 扣减算法）的籽扣减：从**发起人个人**资产 FIFO by 最早到期扣、整单不足 409 `ASSET_INSUFFICIENT`、绝不部分扣；与建树费（第 8 行）同档口径但**金额不同**（9999 ≠ 9）；在权限校验与全部结构校验通过后、写库前扣，**失败原路返还同一批次**（`fee_refund`）；后台可配（`jiazu_wallets.config.branch_fee_seeds`，默认 9999）；完整口径见 `docs/branch-clan-ops.spec.md` |
| 35 | 汇宗（家族树整体并入另一棵普通树的普通节点之下） | `POST /admin/converge-clan` | 迁移 · 并入 | **0 片 + 0 籽** | 不适用（用 `confirm_people` 二次强确认，**无 `dry_run`**） | 整树并入类：**不接竹片闸门、不扣籽**（与新增 / 迁移类同价）；`confirm_people` 不符 409 范围变化时同样不扣不写；**资产折损并入**（源树灵气剩余有效期 × 比例累加至目标树）见 `docs/branch-clan-ops.spec.md` §3-10 与 §6-2-6（比例键 `converge_spirit_ratio`，默认 0.5） |

> **移除说明（本表唯一的移除项）**：原 **#32 晋宗（祖先链并入世本）| `POST /admin/promote`** 整行已随功能下线**移除**（2026-09-17 产品决策：该操作整体移除，路由与 `promoteTree()` 一并删除，由新的【立支】/【汇宗】两条操作取代）；**表内其余编号保持不变、不重排**（即编号 #32 在本表中空缺，后续新增行续编 #34、#35），本行只作留痕、不再有单价与闸门口径。

**合计口径**：主表 **34 行**（编号排到 #35，其中 **#32 空缺**），其中 **扣费行 7 行**（#1–#5、#8、#34），**0 片行 27 行**（#6、#7 及 #9–#31、#33、#35）。

### 3-2 附录：其余写路由（本册一律 0 片，不受扣费闸门约束）

| 路由 | 类别 | 片数 |
|---|---|---|
| `POST /join-request`（发起） / `GET /admin/join-requests`（列待办） / `POST /admin/approve-join`（审批通过；需 `id` + `person_handle`） / `POST /admin/reject-join`（驳回；可带 `reason`） | 加入申请 · 审批 | 0 |
| `POST /leave-request`（发起） / `GET /admin/leave-requests`（列待办） / `POST /admin/approve-leave`（审批；**传 `approve:false` 即驳回**） | 退出申请 · 审批 | 0 |
| `POST /admin/set-role` / `POST /admin/set-anchor` | 治理 | 0 |
| `PUT /admin/wallet-fee` | 治理（¥ 费率配置） | 0 |
| `POST /wallet/recharge` / `POST /wallet/transfer` | ¥ 钱包 | 0（走 `jiazu_wallets`，与竹片互不换算） |
| `POST /auth/send-code` / `/auth/login` / `/auth/register` | 账号 | 0 |

> **本清单必须与 `compat-api/index.js` 实际路由一致；不得列幽灵路由**（实施与复审时逐条核对 `index.js` 中 `pathname ===` 的分支判断；示例：leave 类驳回走 `POST /admin/approve-leave` 传 `approve:false`，**没有** `POST /admin/reject-leave`）。

---

## 4. 扣减算法（**算法本体在总册**；本册只规定闸门顺序）

### 4-1 FIFO 扣减（引用总册 §5-2）
- **算法唯一实现在总册规定的资产模块**（总册 §10 的 `lib/assets.js` 口径）；本册的 `lib/economy-fee.js` 只做薄封装（单价表 + 闸门顺序 + 冲正编排），**不自写第二套 FIFO**。
- 取该用户 `bamboos[]` 中未过期批次，按 `expires_at` **升序**排列，逐批扣到需求量用尽。
- 扣减后恰好耗尽的批次 `qty = 0` → **由 `sweep` 移除**（总册 §5-2-3、§5-4），**不在列表里留 0 批次**，也不在扣费函数内直接 `delete`。
- 石榴籽同规则，但最小单位是**颗**：`qty` 必须整数；「完整石榴籽」= 整颗（不拆分、不接受小数尾巴）。

### 4-2 整单拒绝（引用总册 §5-2、§5-6-3）
- **入口先 `sweep(now)`**，再算可扣总量；可扣总量 `< 需求量` → **抛 409，一个批次都不动**。
- 禁止实现：先扣能扣的、再报错；或允许余额为负。
- **无任何豁免通道**：管理员、`chief_editor`、总谱、祖谱一律同价同拦截（总册 §5-6-3）；本册不设"内部账号免单"。

### 4-3 事务语义（本册的核心闸门）
固定顺序，任何一步失败都不产生脏态：

```
① requireWriteUser(...)                  → 401 / 403（不读资产、不扣费）
② 只读性预检（assertFounderEditable 等）  → 403（不扣费）
③ 余额预检 quoteBamboo(phone, need)       → 不足 → 409（不写任何一棵树）
④ 扣费 chargeBamboo(...)                  → 写 jiazu_assets + Tx
⑤ 落库（updateTree / updateTrees 闭包体内执行）
⑥ 落库失败 → refundAssets(phone, txn_id)  → 追加 fee_refund 冲正
```

- **单树路由（1 / 2 / 4 / 5 / 8 行）**：④ 在调用 `tw.*` 之前；⑤ 抛错时在路由 `catch` 里先冲正再把原错误抛出。
- **删除节点（`tw.deleteNode`）**：④ 必须在 `updateTrees([treeId], …)` **闭包体的第一步**（`removePeopleFromTree` 之前）——闭包抛错 → `updateTrees` 不写树，同时由 `deleteNode` 在自身失败路径里调 `refundAssets`。
- **跨树迁移（`tw.reparentAcrossTrees`）**：④ 必须在 `updateTrees([treeId, targetTreeId], async (trees) => { … })` 闭包体的第一步（`moveLineage(...)` 之前）。效果：
  - 扣费失败（409）→ 闭包抛错 → `updateTrees` 两棵树都不写 ✅
  - `moveLineage` 或 `checkTreeIntegrity` 或 `saveTree` 抛错 → 事务回滚树快照 + 闭包外 `refundAssets` 冲正 ✅
  - 详情文档随迁是 best-effort（既有语义），**不因它失败而冲正**（结构真源已落库）。
- **建树（第 8 行）**：`onBeforeWrite` 钩子内扣籽（`treeId` 在 `onBeforeWrite` 之前已由 `nextTreeId` 生成，可写进 `ref.tree_id`）；`createTreeFile` / `saveMeta` 失败 → 路由 `catch` 冲正。
- **绝不出现**：先改数据后扣费；或扣费与落库之间夹着第二个 `await` 才做的权限校验。

### 4-4 惰性结算与过期批次（引用总册 §5-4）
- **本册不设"过期清理定时任务"**：所有扣费与余额读数前一律先 `sweep(now)`（总册 §5-4-1、§5-4-5），由 sweep 剔除过期批次并写 `type='expire'` 流水。
- 过期批次在扣费与余额口径里**一律视为 0**（sweep 之后本就不在列表内）。
- 冲正回填时保留原 `expires_at`（不因冲正而"续命"；总册 §5-5-3 的"同一批次"口径）。

### 4-5 冲正还原与批次数组顺序（非契约）

- **冲正按原 `lot_id` / `qty` / `expires_at` 复原**：只恢复该批次的原 `qty` 与到期时间（总册 §5-5-3「原路返还同一批次」口径），不新造批次，也不改 `source` / `created_at`。
- **批次在数组中的位置可能与扣费前不同**：扣减时被扣尽的批次（`qty = 0`）已由 `sweep` 移除（§4-1），冲正复原时该批次 **append 回 `bamboos[]` / `seeds[]` 的数组尾**，不会回到原下标。
- **FIFO 只依赖 `expires_at` 升序，批次数组顺序不是契约**：任何调用方（含前端展示、流水核对、快照 diff）**不得依赖 `bamboos[]` / `seeds[]` 的元素顺序**；需要稳定展示时由调用方自行按 `expires_at` 升序（同到期再按 `lot.id`）排序。
- **对比冲正前后的一致性应使用按 `lot.id` 排序后的指纹**（按 `lot.id` 升序排序后再序列化取 JSON / md5）：直接对批次数组做逐元素 diff 会因位置变化而误报差异；§9-1 第 8 条的「资产总分还原」断言即属此类顺序无关口径。

---

## 5. 复用点与实现锚点

### 5-1 新增模块 `cloudfunctions/compat-api/lib/economy-fee.js`（**薄封装，不重复实现算法**）

本模块只做三件事：**单价表** + **闸门顺序编排** + **冲正编排**；FIFO / 整单拒绝 / sweep / 批次读写全部复用总册口径的资产模块（`lib/assets.js`，总册 §5、§10），本册**不自写第二套扣减算法**。

导出（命名固定，index.js 按此调用）：

| 导出 | 签名 | 职责 |
|---|---|---|
| `FEE` | `{ person_update: 1, reparent_same_tree: 1, reparent_cross_tree: 9, delete_node_per_person: 3, tree_create_seeds: 9 }` | 全部单价的**唯一真源**（禁止在路由里写魔法数字） |
| `chargeBamboo` | `chargeBamboo(phone, pieces, ref) → { txn_id, spent:[{lot_id, qty}], balance }` | 写 `Tx.type`（取总册枚举：修改类 `edit_fee` / 删除 `delete_fee` / 迁移 `move_fee`）；不足抛 409（带 `need` / `current` / `how_to_get`） |
| `chargeSeeds` | `chargeSeeds(phone, seeds, ref) → { txn_id, spent, balance }` | 建树用，写 `Tx.type='tree_create'`；不足抛 409 |
| `quoteBamboo` / `quoteSeeds` | `quote*(phone, need) → { need, current, enough }` | 只读预检（不写），**内部先 sweep** |
| `getAssetSummary` | `getAssetSummary(phone)` | 直接转发总册 `GET /assets/summary` 的数据口径（`fragments` / `seeds_total` / `bamboos_total_pieces` / `jades` / 批次 / `expiring` / `txs`），本册不另立字段名 |
| `refundAssets` | `refundAssets(phone, txn_id, reason) → { ok }` | 按原 Tx 反向冲正：**原路返还同一批次**（恢复原 `qty` 与 `expires_at`）、写 `Tx.type='fee_refund'`（总册 §5-5-3） |
| `HOW_TO_GET` | 常量数组（§8 四条文案） | 409 响应与前端弹窗**共用**的唯一文案真源 |

- 底层读写走 `store.colGet('jiazu_assets','global')` / `colSet`（与 `lib/wallet.js` 同模式），保证 `COMPAT_SOURCE=local` 时落 `migrate-output/collections/jiazu_assets.json`、`cloud` 时落云集合；**禁止绕过业务接口直写**（总册 §5-7-1）。
- 并发：按手机号串行化（互斥队列），禁止读改写竞态、禁止重复扣费（总册 §5-7-2、§5-7-4）。

### 5-2 `index.js` 各写路由的调用位置

| 路由 | 调用点 | 写法要点 |
|---|---|---|
| `PUT /people/<handle>` | `requireWriteUser`（401/403）之后、`tw.updatePerson(...)` **之前** | 先 `fa.assertFounderEditable` 类只读预检；`chargeBamboo(phone, FEE.person_update, { tree_id, person_handle })`；`tw.updatePerson` 抛错 → `refundAssets` 后原样抛 |
| `POST /admin/reparent` | 由 `tw.reparentNode` / `tw.reparentAcrossTrees` 内部承担 | 路由把 `charge` 回调（含 `phone`）透传进 `tw.reparentNode`；同树分支在 `updateTree` 闭包首步扣 1，跨树分支在 `updateTrees` 闭包首步扣 9（**由 lib 层决定单价**，路由不判价） |
| `POST /admin/delete-node` | 由 `tw.deleteNode` 内部承担 | `deleteNode({ …, charge })`：`dry_run` 分支**不调** `charge`（天然免费）；正式分支在 `updateTrees([treeId], …)` 闭包首步扣 `FEE.delete_node_per_person × deleted.size`；`confirm_count` 不符在闭包外先抛 409（不扣） |
| `POST /admin/create-tree` | `onBeforeWrite` 钩子 | `onBeforeWrite: () => eco.chargeSeeds(u.phone, FEE.tree_create_seeds, { tree_id: plannedTreeId })`，**替换**现有 `wallet.deductTreeCreateFee(u.phone)`；路由 `catch` 里对冲正 |
| `POST /admin/add-spouse` / `add-child` / `chain-append` / `remove-branch-link` / `split-tree` / `founder-*` / `detach-founder` / `reset-founder` / `clan-*` / `marriage-request` / `approve-marriage` / `marry-end` / `POST /people` / `POST /families` / `PUT /families/<handle>` / `PUT /tree-meta` | **不接闸门** | 0 片；实施时禁止在这些路由里调 `chargeBamboo`（矩阵即契约） |

### 5-3 读接口（余额提示用）

- 前端余额提示**只用总册既定的 `GET /assets/summary`**（总册 §6-1，Bearer 必填，401 未登录），返回 `{ fragments, seeds_total, bamboos_total_pieces, jades:[…], seed_lots:[SeedLot], bamboo_lots:[BambooLot], expiring:[…], txs:[Tx] }`；**本册不新增 `/assets/balance` 之类的重复接口**。
- 前端取「余 M 片」用 `bamboos_total_pieces`；`how_to_get` 文案来自本册 `HOW_TO_GET` 常量（前端本地常量，不要求后端另开字段）。
- ⚠️ **实现位置**：`GET /assets/summary` 与 `GET /assets/expiring` 等资产路由必须挂在 `index.js` 树编辑闸门（约 1586 行 `if (!treeId) return send(400, { error: '缺少 X-Tree-Id' })`）**之前**（总册 §6 注），否则无 `X-Tree-Id` 的账号级请求会先被 400 拦掉。

---

## 6. 错误码与前端回显

| 场景 | 状态码 | 响应体（要点） |
|---|---|---|
| 竹片不足 | **409** | `{ error: '资产不足，需 X 片竹片，当前 Y 片', code: 'ASSET_INSUFFICIENT', need: X, current: Y, unit: 'bamboos', how_to_get: ['官方 9.9 元/束', '每日 21 点限量发售', '市集购买', '蓄能档位赠送（季度 1 束 / 半年度 2 束 / 年度 8 束）'] }` |
| 石榴籽不足（建树） | **409** | `{ error: '资产不足，需 9 颗完整石榴籽，当前 N 颗', code: 'ASSET_INSUFFICIENT', need: 9, current: N, unit: 'seeds', how_to_get: [同上四条] }` |
| 删除范围变化 | **409** | `{ error: '删除范围已变化（当前 N 人，确认时 M 人），请重新确认', code: 'DELETE_SCOPE_CHANGED' }` —— 沿用既有 `confirm_count` 语义，**先于扣费**判定，不扣费 |
| 未登录 | **401** | `{ error: '请先登录后再进行编辑操作' }`（沿用 `requireWriteUser` 文案），**不扣费** |
| 无权限 / 无写权 / 游客 / 权限范围外 / 总谱仅总编 | **403** | 沿用既有文案（`游客无编辑权限，请注册后编辑` / `您的权限范围仅限本人及向下节点` / `中华世本总谱仅总编辑（chief_editor）可编辑` 等），**不扣费** |
| 只读节点（始祖 / 上层镜像 / 总谱删除） | **403** | 沿用既有 `assertFounderEditable` / 镜像锁文案，**不扣费**（结构上不可写，不存在扣费） |
| 落库后冲正成功 | 原始错误状态码 | 响应里带 `{ fee_refunded: true }`（可选，便于排查），`error` 仍是落库失败原因 |

**错误体码口径（强约束）**

- **响应体只允许出现域名错误码**：本册登记的 `ASSET_INSUFFICIENT`、`DELETE_SCOPE_CHANGED`，以及本册 / 总册已列的同域名业务码；`code` 字段一律取登记过的枚举值，不得临时新造。
- **系统级错误码与底层异常原文一律不得回显**：`EACCES` / `ENOENT` / `ERR_*` 等 Node 系统错误码，以及 `err.stack`、`err.message` 原文（含本机绝对路径、内部函数名、内部实现细节）**不得透出到响应体**；应**统一为通用文案 + 对应状态码**（例如落库失败统一为 500 `{ error: '服务器开小差了，请稍后重试' }`），避免泄露本机路径与内部实现。
- **`ASSET_INSUFFICIENT` 必须继续带 `need` / `current` / `unit` / `how_to_get` 四个字段**：前端全靠它们渲染「差多少 / 怎么获得」提示，实施时**不得删减**、不得改名（`how_to_get` 文案真源为 §8 的 `HOW_TO_GET` 常量）。

前端识别统一按 `err.code`（`ASSET_INSUFFICIENT` / `DELETE_SCOPE_CHANGED`），**不要**用中文文案正则匹配；现有 `person-archive.vue` 里的中文正则兜底保留但降级为备份路径。

---

## 7. 前端落点

| 位置 | 变更 |
|---|---|
| `frontend/src/components/person-archive/person-archive.vue` → `doSave()`（宿主页 `frontend/src/pages/person/detail.vue`，总册 §9「人物档案」落点） | 提交前：`fetchAssetSummary()` 预检，`bamboos_total_pieces < 1` → 弹「本次消耗 1 片竹片，当前 M 片，竹片不足」+「如何获得竹片」；成功后 toast `已保存（本次消耗 1 片竹片，余 M 片）`。跨树迁移成功（`migratedTo` 非空）toast 追加 `（本次消耗 9 片竹片，余 M 片）` |
| 同上 → 编辑表单「父节点编号(改挂上级)」块 | 填的编号**属别的家族树**时，提交前先弹「本次为跨树整体迁移，消耗 **9 片竹片**（与迁移人数无关），是否继续？」；确认后带 `new_parent_tree_id` 提交 |
| 同上 → `startDelete()`（删除节点两段式） | 第一段 `dry_run` 响应新增 `fee: { unit:'bamboos', pieces, balance, balance_after }`；强确认弹窗文案追加一行「本次消耗 N 片竹片，余 M 片（N = 待删人数 × 3）」；第二段收到 409 资产不足 → `deleteError` + `showModal`「资产不足」并给「如何获得竹片」清单，保持在弹窗内可重试 |
| 同上 → 删除 / 保存的 409 处理 | 文案与 `how_to_get` 直出，不自行改写；用户可获得「9.9 元/束购买」入口（跳钱包页） |
| `frontend/src/components/person-manage-panel/person-manage-panel.vue` | 「＋ 添加父节点 / ＋ 添加子节点 / ＋ 添加配偶」面板加一行灰字提示 **「新增类操作不消耗竹片」**，避免用户因删改计费而不敢新增 |
| `frontend/src/business/api.ts` | 新增 `fetchAssetSummary(token)` → `GET /assets/summary`（总册 §6-1，不新增重复接口）；`NodeDeleteResult` 增加 `fee: { unit, pieces, balance, balance_after }`；`reparentNode()` 返回类型增加 `fee`；错误对象透出 `code` / `need` / `current` / `how_to_get`（供弹窗） |
| 钱包 / 资产页（总册 §9 落点 `frontend/src/pages/wallet/index.vue`、新增 `pages/assets/index.vue`） | 竹片区块展示：当前折算「N 束 M 片」、最近流水（`Tx.type` 取总册枚举：`edit_fee` / `delete_fee` / `move_fee` / `tree_create` / `fee_refund` / `official_buy` / `market_buy` / `spirit_charge` / `admin_grant` / `expire`）、入口「官方竹简 · 每日 21:00 限量」「去市集」；建树费文案由「¥9.90」改为「**9 颗完整石榴籽**」（总册 §9） |

---

## 8. 竹片来源提示（`how_to_get` 唯一文案真源）

四条渠道按总册 §3-3「竹片获取方式」与 §7 官方发售口径列出：

| 来源 | 说明 | 单位换算 |
|---|---|---|
| 官方购买（官方竹简） | **¥9.90 / 束**，只扣**既有人民币钱包**（`jiazu_wallets`）余额；只用于买竹片，人民币不可直接购买籽 / 碎片 / 玉 | 1 束 = 100 片 |
| 每日限量发售 | **每日 21:00** 释放当日配额（`daily_stock`，运营配置）；21:00 前购买 409「未到发售时间」；售罄即止、当日不结转 | 按 `bundles` 整束购买（`qty = bundles × 100` 片，`source='official_purchase'`） |
| 市集购买 | 向其他用户购买（**仅整束可交易**）；买方所得竹片**继承卖方原批次 `expires_at`**（不因交易续命） | 按挂单 `bundles`（≥1 整数） |
| 蓄能档位赠送（家族灵气充值） | 家族灵气充值套餐随赠竹片（`gift_bamboos`，**唯一版本**）：`daily` = 1 籽 / 1 天 / **赠 0 束**；`monthly` = 29 籽 / 30 天 / **赠 0 束**；`quarterly` = 109 籽 / 90 天 / **赠 1 束**；`half_year` = 149 籽 / 180 天 / **赠 2 束**；`yearly` = 299 籽 / 365 天 / **赠 8 束** | 1 / 2 / 8 束 = 100 / 200 / 800 片；`daily` / `monthly` 两档**不赠**竹片 |

> 本节数值为**唯一版本**（需求原文，终审裁定确认）：季度 **1 束 = 100 片** / 半年度 **2 束 = 200 片** / 年度 **8 束 = 800 片**，`daily` 与 `monthly` 两档**不赠**竹片。总册套餐表（`gift_bamboos`）已按终审裁定同步为同一数值，两册一致；曾出现的「季度 2 束 / 半年度 4 束」写法**作废**。实施与文案均以本节数值出数（详见 §13 同步记录）。
>
> 文案在 `lib/economy-fee.js` 导出为 `HOW_TO_GET` 常量数组（409 响应与前端弹窗**共用**），禁止前后端各写一套。

---

## 9. 测试与约束

### 9-1 单测 `cloudfunctions/compat-api/lib/economy-fee.test.js`
必须覆盖（每条一个 `test`）：

1. **矩阵穷举**：§3-1 的 7 个扣费行逐一断言单价（1 / 1 / 9 / 3N / 3 / 9 籽 / 9999 籽），且**不随人数变化**（跨树 9 片：迁移 1 人与迁移 30 人同价；立支 9999 籽：上移 1 位祖先与上移 30 位祖先同价）；
2. **0 片行穷举**：§3-1 的 27 个 0 片行逐一断言"操作成功后资产总分**逐字节不变**"（含总谱 `zhonghua`、祖谱 `kind='clan'` 各至少一例）；
3. **整单不足拦截**：余额 = X-1 → 409，`need` / `current` 正确，且**所有批次 qty 不变**；
4. **dry_run 免费**：`delete-node dry_run=true` 不写任何树、不产生任何 `Tx`；
5. **`confirm_count` 不符**：409，不写树、不扣费；
6. **FIFO by `expires_at`**：三个乱序到期批次 → 扣减命中最早到期的（与总册 `lib/assets.test.js` 同口径，本册只断言闸门调到同一个函数）；
7. **sweep 先于扣费**：入口先 `sweep(now)`——过期批次被剔除并各写一条 `type='expire'` 流水后，再判可扣量；
8. **失败回滚**：注入落库失败 → 资产总分还原 + 存在一条 `type='fee_refund'` 的 `Tx`，且**返还到原批次**（原 `qty` 与 `expires_at` 一致，不新造批次）；**不存在**"扣了片但树没变"或"树变了但没扣片"；
9. **权限优先**：未登录 401 / 游客 403 / 范围外 403 → 资产总分逐字节不变（**证明扣费在权限校验之后**）；
10. **跨树迁移双树一致**：扣费失败 → 两棵树 md5 不变；`moveLineage` 抛错 → 两棵树 md5 不变且资产还原；
11. **建树改口径**：成功扣 9 籽、树已建；`createTreeFile` 失败 → 籽原路返还同一批次；删树不退籽；
12. **总谱续编 0 片**：`chain-append` 两模式跑通后资产不变；
13. **真源未变**：文末断言真实数据 md5 逐字节一致（照 `lib/node-delete.test.js` 既有模式）：
    - `migrate-output/config/tree-meta.json`
    - `migrate-output/trees/*.json` 全量
    - `migrate-output/details/*.json` 全量
    测试数据一律写 `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 `/tmp` 副本；真实 `jiazu_assets` 真源同样纳 md5 断言。

### 9-2 注册与约束
- 该文件必须注册进仓库根 `package.json` 的 `scripts.test`（追加到现有 `node --test …` 列表；当前 14 个文件、150/150 全绿，**本轮不得打破**）。
- 与总册测试的分工：总册 §10 的 `lib/assets.test.js` 测**资产算法本体**（碎片合成 / FIFO / sweep / 玉）；本册 `lib/economy-fee.test.js` 测**闸门与单价**（矩阵、顺序、冲正）。两者都注册进 `scripts.test`，互不重复断言。
- 断言原则：**"资产总分不变" 比 "某个字段没被写" 更可靠**——0 片行一律断言 `fragments/seeds/bamboos/jades` 总分逐字节一致，而不是只看 `txs` 长度。
- 前端 `npx vue-tsc --noEmit` 必须 exit 0（总册 §10）。
- 禁止在测试里修改真实数据 / 重启服务 / 跑迁库脚本。

---

## 10. 实施清单

**后端 compat-api**
1. 新建 `lib/economy-fee.js`（§5-1 全部导出：`FEE` / `chargeBamboo` / `chargeSeeds` / `quote*` / `getAssetSummary` / `refundAssets` / `HOW_TO_GET`），底层复用总册口径的资产模块 `lib/assets.js`（**不重写 FIFO / sweep**）。
2. `lib/tree-write.js`：`deleteNode` / `reparentAcrossTrees` / `reparentNode` 增加 `charge` / `refund` 注入参数，并在对应 `updateTree` / `updateTrees` 闭包**首步**调用；`createTree` 的 `onBeforeWrite` 契约保持不变（只在 `index.js` 侧换成扣籽）。
3. `index.js`：`PUT /people/<handle>` 接闸门；`/admin/reparent`、`/admin/delete-node` 透传 `charge`；`/admin/create-tree` 换 `onBeforeWrite`；**资产读接口用总册既定的 `GET /assets/summary`**（挂在树编辑闸门之前，总册 §6 注），本册**不再新增** `/assets/balance`；其余路由**保持不接闸门**。
4. `lib/wallet.js`：`deductTreeCreateFee` 保留但不再被 `create-tree` 调用（总册 §12-3：¥ 钱包收缩为「只用于购买官方竹简」；`trees[tree_id]` 与 `transferToTree` 下线属总册范围，本册不越界）。

**前端**
5. `business/api.ts`：`fetchAssetSummary`（`GET /assets/summary`）、响应类型补 `fee`、错误对象透出 `code/need/current/how_to_get`。
6. `person-archive.vue`：`doSave()` 预检 + 成功文案；删除两段式确认文案 + 409 引导；改父跨树确认弹窗。
7. `person-manage-panel.vue`：新增类「不消耗竹片」提示。
8. 竹片展示落进总册 §9 的资产页 / 钱包页（`pages/assets/index.vue`、`pages/wallet/index.vue`）。

**文档**
9. 本文件状态改「已实施」；`docs/PENDING_DEPLOY.md` 补本批（§12）；总册 `docs/economy.spec.md` **已落盘**，本册按它对齐；本册曾提出的 5 项已**由总册终审裁定同步（R12/R13）**，清单见 §13（本册不擅改总册）。

---

## 11. 待确认默认口径（一句话可改，不阻塞实施）

实施按下列**默认值**执行；Kevin 若要改，逐条给一句话即可，改动点都收敛在 `FEE` 常量或单条判断里。

| # | 默认口径 | 改成什么要动哪里 |
|---|---|---|
| 1 | **删除 subtree 模式按待删节点数计费**：`3 片 × people_count`（每节点独立扣费，不合并） | 若改"整支一口价"，只改 `FEE.delete_node_per_person` 的用法（乘数去掉） |
| 2 | **同树改父按 1 片 / 节点**（不随后代数放大） | 改 `FEE.reparent_same_tree` |
| 3 | **`POST /admin/split-tree` = 0 片**（拆分不新增人物、不删人物内容；建树费只对 `create-tree` 收） | 若要求收费：改 §3-1 #31 行为 **9 片 / 次**（与跨树迁移同价），或按 1 片 / 分出的树；只需改该路由的 `charge` 调用 |
| 4 | **已作废：晋宗 `POST /admin/promote` 已整体移除**（2026-09-17 产品决策：该操作整体移除，路由与 `promoteTree()` 一并删除，由【立支】/【汇宗】取代；原 §3-1 #32 行已同批移除，本行只作留痕、不再有收费口径） | —（无单价可改） |
| 5 | **`PUT /families/<handle>` = 0 片**（绑定类；不在用户列明的修改删除扣费清单内） | 若要求收费：改 §3-1 #16 行为 **1 片 / 家族** |
| 6 | **`PUT /tree-meta` = 0 片**（治理类，非人物节点） | 若要求收费：改 §3-1 #33 行为 **1 片 / 次** |
| 7 | **石榴籽最小单位 = 颗**（不拆分，"完整"= 整颗）；建树扣 9 颗 | 若籽可分割：需总册同步改 `SeedLot.qty` 语义 |
| 8 | **服务端不做幂等键**：重复提交 = 各自扣费（前端用 `saving` / `deleting` loading 态防抖动） | 若要幂等：加客户端 `request_id` → `Tx.ref.trade_id` 去重 |
| 9 | **本册与总册同价的三个单价**：同树改父 **1 片**、跨树改父 **9 片/次**、删除节点 **3 片/节点**（总册的修改类「可否消耗」章节与扣减章节已按终审裁定同步这三行，见 §13） | 改单价只改 `FEE` 一处（两册同批同步） |
| 10 | **`POST /admin/split-tree` / `PUT /tree-meta` / `PUT /families/<handle>` 均为 0 片**（见 #3、#5、#6；原 `POST /admin/promote` 一项已随功能整体移除，见 #4） | 若总册后续为它们定单价，本册三行同步改 |
| 11 | **响应新增 `fee` 字段**（`PUT /people` / `/admin/reparent` / `/admin/delete-node` 的 `dry_run`）：只做**新增**，不改既有字段语义 | 若不愿改响应形状：前端改为**提交前单独调 `GET /assets/summary`** 自算余量（`fee` 字段可去掉） |
| 12 | **建树「完整」口径**：只扣整颗籽，`SeedLot.qty` 不接受小数尾巴 | 若籽可分割：同 #7 |

---

## 12. 部署要点

**新增 / 变更路由（本批）**

| 路由 | 变更 |
|---|---|
| `PUT /people/<handle>` | **变更**：接竹片闸门（1 片 / 节点），响应新增 `fee` |
| `POST /admin/reparent` | **变更**：同树 1 片、跨树 9 片；响应新增 `fee`；跨树路径接入 `updateTrees` 闭包内扣费 + 冲正 |
| `POST /admin/delete-node` | **变更**：正式提交 3 片 / 节点；`dry_run` 响应新增 `fee`（免费）；409 不扣 |
| `POST /admin/create-tree` | **变更**：扣费由 ¥9.90 改为 **9 颗完整石榴籽**（`onBeforeWrite` 钩子替换） |
| `GET /assets/summary` | **不新增**：沿用总册 §6-1 既定接口作为前端余额提示的数据源（挂树编辑闸门之前） |
| 其余全部写路由 | **不变**（0 片，不接闸门） |

> 本册**不新增任何路由**：只改 4 条既有写路由的扣费行为。总册 §12-2 的 19 条新增路由与本节互不重叠；总册的「既有路由改语义」清单已按终审裁定补齐第 4 条 `POST /admin/delete-node`（见 §13 同步记录）。

**新增文件 / 集合**

- 新增模块：`cloudfunctions/compat-api/lib/economy-fee.js`（+ `lib/economy-fee.test.js`）。
- 新增集合 **`jiazu_assets`** → **必须并入 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`**（当前只有 7 个基础集合：`jiazu_person_details` / `jiazu_tree_meta` / `jiazu_users` / `jiazu_wallets` / `jiazu_anchors` / `jiazu_leave_requests` / `jiazu_sms_codes`；总册 §12-1 另有 `jiazu_spirit` / `jiazu_market` / `jiazu_messages` / `jiazu_ops_logs` 与四个申请集合一起补），否则云端扣费写入报错。
- `PENDING_DEPLOY.md` §2 需补本批：新增集合 `jiazu_assets`、新增模块 `lib/economy-fee.js`、4 条既有写路由改语义（§12-2 表）。
- 建议顺带加索引：`jiazu_assets` 按 `_id='global'` 单点读写，无需额外索引。

**打包与部署（沿用现有流程）**

```bash
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

**部署后冒烟**

1. `GET /assets/summary`（带 Bearer）→ 200 且返回 `bamboos_total_pieces`（总册 §6-1 形状）；
2. 无竹片账号 `PUT /people/<handle>` → **409**「资产不足，需 1 片竹片，当前 0 片」，且树 JSON 未变；
3. 有竹片账号同请求 → 200，`jiazu_assets` 里出现 `type='edit_fee'` 的 `Tx`（总册 §4-6 枚举），树 JSON 已变；
4. 未登录同请求 → 401，且**未产生任何 `Tx`**（证明扣费在鉴权之后）；
5. `POST /admin/delete-node`（`dry_run:true`）→ 200 且 `fee.pieces = 3 × people_count`、资产未变；
6. `POST /admin/delete-node`（正式，带 `confirm_count`）→ 200，扣 `3N` 片；
7. 跨树改父 1 人 / 30 人各一次 → 两次都只扣 **9 片**（与后代人数无关），各写一条 `move_fee`；8. 删除 5 人后代子树（`subtree`，带 `confirm_count:5`）→ 扣 **15 片**，`Tx` 一条 `delete_fee`（`delta.bamboos=-15`）。

---

## 13. 与总册的同步记录（**已由总册终审裁定同步（R12/R13）**）

本册原登记的 5 处「需总册补写」事项，**已由总册终审裁定同步（R12/R13）**，总册已按下表口径落盘；本节只作对照记录，**不再要求总册补写**，本册不擅改总册。

| # | 位置（总册） | 同步后的口径（两册一致） |
|---|---|---|
| 1 | 修改类「可否消耗」章节与扣减章节 | 已补写四类单价：人物内容修改 **1 片 / 节点**、同树改父 **1 片 / 节点**、跨树改父 **9 片 / 次**（与后代人数无关）、删除节点 **3 片 / 节点**（subtree = 3N、promote = 3），与本册 §3-1 逐行一致 |
| 2 | 「既有路由改语义」清单 | 已补齐 4 条：`POST /admin/create-tree`、`POST /admin/reparent`、`PUT /people/<handle>`、`POST /admin/delete-node`（正式提交 3 片 / 节点；`dry_run` 免、409 范围变化免） |
| 3 | 本分册文件名交叉引用 | 多一个字母 s 的笔误写法已统一为 `docs/economy-fee.spec.md`（本册仅文首一处说明） |
| 4 | 套餐表 `gift_bamboos` | 已同步为**季度 1 束（100 片）/ 半年度 2 束（200 片）/ 年度 8 束（800 片）**，`daily` / `monthly` 两档不赠；与本册 §8 完全一致（曾出现的 200 片 / 400 片写法作废） |
| 5 | 接口清单 | 已声明写路由扣费闸门顺序（鉴权 → 只读预检 → 余额预检 → 扣费 → 落库 → 失败冲正）以 `docs/economy-fee.spec.md` §4-3 为准；`fee` 为新增响应字段，不改既有字段语义 |

> 除上述 5 处外，本册与总册在**集合名 / 字段名 / 有效期常量 / `Tx.type` 枚举 / FIFO+sweep 算法 / 整单拒绝 / 建树 9 籽口径 / 无豁免通道**上**完全一致**，实施时直接照抄，无需二次判断。

---

## 14. 与既有规格文件的交叉引用

| 文件 | 关系 |
|---|---|
| `docs/economy.spec.md`（总册） | 字段与算法唯一权威；本册 §1 对齐表 + §13 同步记录（已由总册终审裁定同步，R12/R13） |
| `docs/marriage.spec.md` | 跨树嫁娶（嫁出/娶入/绝婚/合离）及其审批 = **0 片**（§3-1 #27–#30）；本册不介入其事务 |
| `docs/clan-tree.spec.md` | 祖谱（`kind='clan'`）**不豁免扣费**（§1 口径 6）；建谱 / 建谱审批 = 0 片 |
| `docs/founder-attach.spec.md` | 认祖 / 挂载 / 解除挂载 / 重置始祖 = 0 片；只读节点（始祖 / 上层镜像）403 且不扣 |
| `docs/id-system.spec.md` | 跨树迁移的编号「终身不变」口径（§3-1 #3 备注：编号不变，与人数无关） |
| `docs/permission-tier.spec.md` | 权限阶梯与 `requireWriteUser` 语义；本册只规定「校验必须在扣费之前」 |
| `docs/PENDING_DEPLOY.md` | 本批部署项按 §12 补入 |
