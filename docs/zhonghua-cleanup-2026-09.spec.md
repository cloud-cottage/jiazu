# 数据修正：世本删节点 I0046 + 家族树资金残留数据清理 — 手术记录（zhonghua-cleanup-2026-09.spec.md）

状态：**已对真源执行**（2026-09-18 06:48，同批代码提交 `2bf89f7` / `dc8214f`）。执行人 = 主代理；本册由制度员 Jing **回写留痕**（本册只记录事实与口径，不改口径）。

**追加执行（同册续记，2026-09-18 08:20）**：**批次 1 = 首批 51 个「补录登记节点」**已对真源执行 —— 用户拍板走**方案 B**（**不改权限、不加 UI 入口**，用一次性脚本分批删 + 留痕，理由：不改总谱删除守则），收费口径 = **按现规格 3 片竹片/节点（含总谱）**。
事实 / 判据 / 命令 / 结果与校验 / 扣费与审计证据 / 回滚 / 影响面全见 **§6**；批次关系（与 §2 的「第 0 批 · 单节点 I0046」）见 **§2-7**；候选清单见 **`docs/zhonghua-cleanup-candidates-2026-09.md`**（含附录 A：51 个 handle ↔ 云端待删详情 `_id`）。

**本轮收口追加（2026-09-18，制度员 Jing 回写）**：批次 1 引出的**测试硬编码真源编号（R1）已修复** —— 见 **§7**（含「every 都是 4 位」在真源上**为假**的事实）；**树内 `/search` 对不存在的编号可能返回 400「重号」（R2）登记为待裁决、默认保持现状** —— 见 **§8-1**；**备份规则（S4）入库为对后续批次的硬要求** —— 见 **§8-2**。
R1 / R2 / S4 的编号沿用 **`docs/home-sort-search.qa.md` §14.9** 的登记口径（R = 返工 / 裁决项，S = 可疑点 / 覆盖边界）；本册只记录**本轮收口的事实与状态**，不新立口径。

**从属关系（重要）**：

- 本册**不凌驾于任何总纲**。经济域的集合名 / 字段名 / 枚举取值 / 路由清单 / 算法口径 / 价格表的唯一权威是 **`docs/economy.spec.md`**；
  集合与 API 契约的权威是 **`docs/data-model.md`**；全站编号（`gramps_id` / `handle` / `resolveNode`）的权威是 **`docs/id-system.spec.md`**；
  搜索侧（`GET /search/global` 契约、镜像归并、`restricted` 语义、已知边界）的权威是 **`docs/home-sort-search.spec.md`**。
  本册只记录**本轮两项一次性数据手术**（世本删节点 + 钱包 `transfer` 残留清理）的**事实、取证与回滚路径**；
  与上述册子冲突时**以彼为准，并同步修订本册**。
- 本册**不是**经济域口径的出处：家族树资金功能**下线**的口径正文见 **`docs/economy.spec.md` §12-3**（本册只记录其**数据残留清理**这一后续动作）。
- 本册**不是**搜索口径的出处：搜索侧对「同名无指针双记录」边界的**状态更新**回写在 `docs/home-sort-search.spec.md` §7（本册只提供事实依据）。
- 上云动作（四要素）见 **`docs/PENDING_DEPLOY.md` §16**。

---

## 1. 一句话

两笔**真源数据手术**同批执行：① 从**中华世本 `zhonghua`** 删除孤立补录节点 **`I0046`（顾清学）**，消除与祖谱 `gu_39038/I000139` 的「同名无指针双记录」（`people` 140 → **139**）；
② 按用户拍板把**家族树资金（transfer）存档**从两个钱包文件里**直接删除**（各删 1 条 `type:'transfer'` 流水 + 删 `trees` 字段），**用户余额 `users[*].balance_cents` 未动（1070 分）**、那笔 ¥20 **不返还**。
两笔均已取**改前备份**（`/tmp/jiazu-bak-2026-09-17T22-45-56-507Z/` 与 `…-461Z/`，见 §4）。

**追加（第三笔，2026-09-18 08:20 · 批次 1）**：从**中华世本**删除**首批 51 个**孤立「补录登记节点」（`I0000`–`I0045` + `I0047`–`I0051`）——`people` **139 → 88**、`zhonghua:*` 详情 **287 → 236**；按 **3 片竹片/节点**等价扣 **153 片**并留痕。事实、校验与回滚见 **§6**。

---

## 2. 手术一：世本删除节点 `I0046`（顾清学 · 补录）

### 2-1 为什么删（用户拍板）

- `zhonghua/I0046`（顾清学）是「家族树 `gu_39038_01` 的始祖（**补录**）」的历史遗留节点；它与
  **祖谱 `gu_39038/I000139`（真身，handle `5ae4c6e505c90d290f71f66b`）**、**家族树 `gu_39038_01/I000143`（镜像，handle `103f95b87b5a464242933ee319d5`）**
  是**同名双记录**，且两条记录之间**没有**镜像指针（`external_person_handle` 为空串）。
- 用户拍板（2026-09-18）：**在世本中删除该节点**，消除「同名无指针双记录」。
  ⇒ `docs/home-sort-search.spec.md` §7-**b** 原口径「搜索保持出 **2 条**、不做数据手术」**本轮被推翻**，该边界**已解决**（状态回写见该册 §7-b）。

### 2-2 删前核查（**全部通过，任一不满足则脚本拒删**）

脚本 `scripts/remove-zhonghua-person.mjs` 的**前置安全断言**（`--apply` 前强制，不满足 → `exit 4`）：

| # | 断言 | 本案核查结果 |
|---|---|---|
| ① | 节点存在于目标树 JSON | 通过（`zhonghua` `people['103ff1c309eb7bf2cb4f6ff1762e']`） |
| ② | 无 `parent_family`（空串视为无）且 `spouse_families` 为空 | 通过（`parent_family: ""`、`spouse_families: []`）——**无家族关系** |
| ③ | 不被**任何树** `families` 的 `father_handle` / `mother_handle` / `child_handles` 引用 | 通过（**零引用**；比「该树内」更严） |
| ④ | **全库零跨树引用**：所有树 people 的 `external_person_handle`、全部字符串字段精确等于该 handle 的兜底扫描、`config/tree-meta.json` 的 `founder_handle` / `master_handle`、所有详情文档属性值 | 通过（**零跨树引用**；`tree-meta` 不含该 handle） |
| ⑤ | 不是任何 `tree-meta` 条目的 `founder_handle`（含 `founder_gramps_id` 与树 JSON 的 `founder_gramps_id`） | 通过 |
| ⑥ | 目标树是世本（`is_master === true`）时**写盘必须显式带 `--master-ok`** | 通过（命令已带 `--master-ok`） |

> 复核（本册成文时**磁盘直读**当前真源所得）：`migrate-output/trees/*.json` 中**再无任何** people 字段 / families 槽位引用该 handle；
> `migrate-output/details/` 下**无**该 handle 的详情文件；`config/tree-meta.json` **不含**该 handle。
> **保留项**（未被牵连）：祖谱 `gu_39038` 的 `I000139`（真身）与家族树 `gu_39038_01` 的 `I000143`（镜像）**原样保留**。

### 2-3 执行命令

```bash
# dry-run（只读，打印计划与全部前置断言；真源安全）
node scripts/remove-zhonghua-person.mjs --gramps-id=I0046

# 真源删除（世本必须 --master-ok）
node scripts/remove-zhonghua-person.mjs --gramps-id=I0046 --apply --master-ok
```

`--apply` 动作（逐条）：① 从树 JSON `people` 删除该 handle；② 同一次写入里清掉 `families` 中可能存在的槽位引用（本案前置③已证不存在）；
③ 删除详情文档 `migrate-output/details/zhonghua:103ff1c309eb7bf2cb4f6ff1762e.json`；④ 先备份到 `/tmp/jiazu-bak-<timestamp>/`（保留相对路径），再写盘并打印前后 `people` 数 + md5。

### 2-4 前后对比（取证）

| 项 | 手术前 | 手术后 |
|---|---|---|
| `migrate-output/trees/zhonghua.json` `people` 数 | **140** | **139** |
| `migrate-output/trees/zhonghua.json` md5 | `9b22e0b9b66f6c3588228eb0d86c1f68`（备份件实测） | `2c6fbdcae6cd9b7a1cf811408d7b017d`（真源实测） |
| 详情文档 `migrate-output/details/zhonghua:103ff1c309eb7bf2cb4f6ff1762e.json` | 存在（md5 `6ca7e089e26548b85468cb2f79f140c9`） | **已删除**（文件不存在） |
| `version` / `updated_at` | `72` / `2026-09-16T05:54:39.003Z` | **故意未动**（`72` / `2026-09-16T05:54:39.003Z`）——与既有一次性清理脚本同口径，不借数据手术推进版本 |
| 被写文件数 | — | **1**（`zhonghua.json`；详情文档为删除） |

### 2-5 效果（搜索侧）

| 查询 | 手术前 | 手术后 |
|---|---|---|
| 搜索「顾清学」 | **2 条**（世本 + 祖谱） | **guest 1 条**（`gu_39038_01` 镜像 · `restricted=true` / 点击只 toast）；**chief 1 条**（祖谱 `gu_39038` `I000139` 真身） |
| 按编号 `I0046` 检索 | 1 条（世本） | **0 条** |

> 编号检索面不变：其它树自有编号（如 `liu_21016_01` / `ji_23395_01` 各自的 `I0046`）**与本案无关、不受影响**（本册只删 `zhonghua` 树内的该 handle）。

### 2-6 明确**不做**的事（防误引）

- **不按姓名合并**：全站按真身 handle 归并后**仍有 41 组**同名不同人（参见 `docs/home-sort-search.spec.md` §7-b），本轮**只删这一个**孤立补录节点，**未**做任何姓名级去重。
- **不动 `version` / `updated_at`**（见 §2-4）；**不动**任何其它树的 people / families；**不删**任何其它详情文档。

### 2-7 与「批次 1」（首批 51 个节点）的关系 —— 两批同口径、分两次执行

| 项 | 第 0 批（本 §2） | 批次 1（§6，2026-09-18 08:20） |
|---|---|---|
| 目标 | **单节点** `I0046`（顾清学）—— 搜索侧「同名无指针双记录」个案 | **首批 51 个**「补录登记节点」（世本内的整体集合） |
| 编号 | `I0046` | `I0000`–`I0045`（46）+ `I0047`–`I0051`（5）；**`I0046` 不在其中**（已在本 §2 删除）→ 批次 1 编号缺口**只有 `I0046`** |
| 判据 | 同一脚本 `scripts/remove-zhonghua-person.mjs` 的 **6 条前置断言**（§2-2 ①–⑥），逐节点独立评估 | **同一套断言**，批量模式逐节点独立守卫 + 同批引用源排除 + 一次写盘 |
| 口径 | 用户拍板删该节点（无收费记录） | 用户拍板**方案 B**（不改权限 / 不加 UI 入口，脚本分批删 + 留痕）+ **3 片竹片/节点**（含总谱） |
| 留痕 | 本册 §2 + 备份 `/tmp/jiazu-bak-2026-09-17T22-45-56-507Z/` | 本册 **§6** + 备份 `/tmp/jiazu-batch1-bak-20260918-082012/` 与 `/tmp/jiazu-bak-2026-09-18T00-22-21-710Z/` |
| 结果 | `people` **140 → 139**、详情 **-1** | `people` **139 → 88**、详情 **-51** |

- **同源同口径**：两批用的是**同一脚本、同一套前置断言、同一备份约定、同一册留痕**，差别只在**目标集合** —— 第 0 批是「个案先行」，批次 1 是把候选清单（`docs/zhonghua-cleanup-candidates-2026-09.md`）里**当时全部 51 个**一次性清掉。
- **合计效果**：世本 `people` **140 → 88**（两批共删 **52** 个节点、共删 **52** 份详情文档），`families` **80 个未变**，源流链节点 **86 个未变**。
- **不是「同一件事的两种说法」**：批次 1 **不包含** `I0046`、**不重做** §2 的核查（§2 的 `I0046` 结论仅对 `I0046` 有效）；两批**互不替代**，上云时两批的云端动作**合并为一次**执行（见 §5 与 `docs/PENDING_DEPLOY.md` §16-3）。

---

## 3. 手术二：家族树资金（`transfer`）残留数据清理

### 3-1 为什么清（用户拍板）

- 家族树资金功能（`trees[tree_id].balance_cents` + `transferToTree`）**已整体下线**（口径 = `docs/economy.spec.md` §12-3；本轮代码侧两条路由恒 410）。
- 用户拍板（2026-09-18）：**没有保留存档的必要，直接下线** —— 钱包集合里的 `transfer` 残留**删除**；
  **用户余额 `users[*].balance_cents` 不动**（那笔 **¥20 不返还**、不做冲正、不给用户加钱）。

### 3-2 执行命令

```bash
# dry-run（默认，只打印计划，不写盘、不建备份目录）
node scripts/cleanup-retired-transfer-data.mjs

# 真源清理
node scripts/cleanup-retired-transfer-data.mjs --apply
```

**前置三件套**（脚本强制，本项目踩过的坑）：① **先停本地 compat-api**（内存 `treeCache` 常驻，服务活着时任何写入会把旧快照回写）；
② 进程建议 `COMPAT_SOURCE=local`，且**不得**带 `COMPAT_META_FILE` / `COMPAT_OUT_DIR` / `NODE_TEST_CONTEXT`（命中即 **`exit 3` 拒跑**，除非显式 `--allow-sandbox-markers`）；
③ **复核用磁盘直读**，不用同进程缓存。

### 3-3 清理目标与动作

| 目标文件 | 动作 |
|---|---|
| `migrate-output/collections/jiazu_wallets.json`（compat-api local 真源集合，形状 `{ global: {…} }`） | 删 `transactions[]` 中 `type === 'transfer'` 的条目（**1 条**）+ 删 `trees` 字段（家族账户储籽） |
| `auth-server/data/wallets.json`（auth-server 遗留链路，顶层形状） | 同上（**1 条** transfer 流水 + `trees` 字段） |

其它字段（`users` / `config` / 其它流水）**一律不动、不重排**；写盘前脚本逐键深度相等自检「**只有目标字段变了**」，自检不过则拒写（`exit 4`）。

### 3-4 前后对比（取证）

| 文件 | 手术前 md5 | 手术后 md5（真源实测） |
|---|---|---|
| `migrate-output/collections/jiazu_wallets.json` | `1b52c2e7166573b43b45887abdaf414f` | `1c2ca5a078eee318bd3f0f80fefad69d` |
| `auth-server/data/wallets.json` | `e8c4464922f487b3b3cd7e71514f4c1c` | `b0818848e4435dfb9969746e862b929e` |

- 每个文件：`type:'transfer'` 流水 **1 → 0 条**；`trees` 字段 **已删除**（`grep -c transfer` 两文件均 = **0**）。
- **用户余额未动**：`users[*].balance_cents` 保持 **1070 分**（¥10.70）；那笔 ¥20 **不返还**。
- 幂等：再跑一次 → 「无可清理项，0 变更」，**不写盘、不建备份目录**（`exit 0`）。

### 3-5 同批代码侧（同一决策的另一半）

- `auth-server/server.js`：**删** `/api/wallet/transfer` 与 `/api/wallet/tree-balance` 两条路由（-35 行）；
- `auth-server/wallet.js`：**删** `transferToTree` / `getTreeBalance`（含 `type:'transfer'` 流水写入）；
- 复核：`grep -rn "transferToTree\|getTreeBalance\|wallet/transfer\|tree-balance" auth-server/` = **0 残留**（本册成文时实测）。
- 提交：`2bf89f7`（`auth-server/server.js` -35 行、`auth-server/wallet.js` 改写；同批还新增两个一次性脚本 `scripts/remove-zhonghua-person.mjs` / `scripts/cleanup-retired-transfer-data.mjs`，并统一建树费文案）；前端文案在 `dc8214f`。

---

## 4. 备份与回滚路径

### 4-1 备份位置（**一次性、/tmp 内**）

| 备份目录 | 内容 | 对应手术 |
|---|---|---|
| `/tmp/jiazu-bak-2026-09-17T22-45-56-507Z/` | `migrate-output/trees/zhonghua.json`（140 人，md5 `9b22e0b9…`）+ `migrate-output/details/zhonghua:103ff1c309eb7bf2cb4f6ff1762e.json`（md5 `6ca7e089…`） | 手术一（世本删 I0046） |
| `/tmp/jiazu-bak-2026-09-17T22-45-56-461Z/` | `migrate-output/collections/jiazu_wallets.json`（md5 `1b52c2e7…`）+ `auth-server/data/wallets.json`（md5 `e8c44649…`） | 手术二（transfer 残留清理） |
| `/tmp/jiazu-batch1-bak-20260918-082012/` | `zhonghua.json`（**139 人版**，md5 `2c6fbdcae6cd9b7a1cf811408d7b017d`，**= 批次 1 改前值**）+ `baseline-md5.txt`（该件与 `collections/jiazu_assets.json` 的改前 md5） | **批次 1**（世本删首批 51 节点，§6） |
| `/tmp/jiazu-bak-2026-09-18T00-22-21-710Z/` | 脚本自身备份（`--apply` 前自动建）：`migrate-output/trees/zhonghua.json`（同 md5 `2c6fbdcae…`）+ `migrate-output/details/zhonghua:<handle>.json` **51 份已删详情** —— 共 **52** 个文件 | **批次 1**（§6）。另有一份**逐字节同内容**的目录 `/tmp/jiazu-bak-2026-09-18T00-21-32-384Z/`（52 个文件、md5 全同）→ 两者互为副本 |

> ⚠️ **`/tmp` 会被系统清理**（macOS 定期清理 `/tmp`，重启亦可能清空）→ **长期保留必须另存**：
> `cp -R /tmp/jiazu-bak-2026-09-17T22-45-56-507Z/ /tmp/jiazu-bak-2026-09-17T22-45-56-461Z/ <仓库外或 backups/ 下的持久目录>/`
> （`backups/` 在仓库内；`migrate-output/` 已被 `.gitignore` 忽略，备份件不进版本库。）
> **两份备份件是回滚的唯一依据**；丢失即无法恢复原状（详情文档删除是**不可逆**操作，只能靠备份件复原）。

### 4-2 回滚步骤（数据侧，逐条）

```bash
cd /Users/kevin/bistro/jiazu
# 0) 前置：先停本地 compat-api（内存 treeCache 常驻；服务活着回滚会被旧快照回写）
# 1) 树 JSON（140 人版）回位
cp /tmp/jiazu-bak-2026-09-17T22-45-56-507Z/migrate-output/trees/zhonghua.json \
   migrate-output/trees/zhonghua.json
# 2) 详情文档回位（恢复 I0046 详情）
cp "/tmp/jiazu-bak-2026-09-17T22-45-56-507Z/migrate-output/details/zhonghua:103ff1c309eb7bf2cb4f6ff1762e.json" \
   migrate-output/details/
# 3) 两个钱包文件回位
cp /tmp/jiazu-bak-2026-09-17T22-45-56-461Z/migrate-output/collections/jiazu_wallets.json \
   migrate-output/collections/jiazu_wallets.json
cp /tmp/jiazu-bak-2026-09-17T22-45-56-461Z/auth-server/data/wallets.json \
   auth-server/data/wallets.json
# 4) 回滚判据（三条 md5 必须回到改前值）
md5 migrate-output/trees/zhonghua.json                                        # 期望 9b22e0b9b66f6c3588228eb0d86c1f68
md5 migrate-output/collections/jiazu_wallets.json                              # 期望 1b52c2e7166573b43b45887abdaf414f
md5 auth-server/data/wallets.json                                             # 期望 e8c4464922f487b3b3cd7e71514f4c1c
# 5) 重启本地 compat-api（读回滚后的真源）
```

### 4-3 回滚**不覆盖**的部分

- **云端副本**：数据侧回滚后**必须重新同步云端**（否则云端仍是清理后的版本）——见 §5；云端若已删过 I0046 详情文档，回滚需**重新写入**该文档。
- **代码侧**（本轮已提交，**不随数据回滚**）：`auth-server` 两条路由 / 两个方法的删除、建树费文案统一（`9颗石榴籽`）、`economy-ledger.js` 409 文案
  —— 需**另行** `git revert`（本批提交 `2bf89f7` / `dc8214f`）或手工恢复。
- **不返还的 ¥20 与余额**：手术二**本来就不动** `users[*].balance_cents`（1070 分）——回滚也不会产生任何余额变动。

---

## 5. 云端同步要求（**必须与本次数据变更同批做**）

本地真源改完之后，**云端副本不会自动跟随**：必须按 `docs/PENDING_DEPLOY.md` §16-3 的清单执行（本册不复制其四要素，只列本次新增项）。

| # | 云端动作 | 为什么 / 注意 |
|---|---|---|
| 1 | **重传 `zhonghua` 树 JSON（139 人）** | 云端树 JSON = 云存储 `trees/zhonghua.json`；上传脚本按 `migrate-output/report.json` 的树清单**逐棵覆盖上传**（`app.uploadFile({cloudPath})`）→ 全量重跑即覆盖该棵。⚠️ **与批次 1（§6）合并后按 88 人重传**（本表第 5 项即终值，两者是同一份文件、同一个动作） |
| 2 | **删除云端 I0046 详情文档** | 云端详情在集合 `jiazu_person_details`，`_id = "<tree_id>:<handle>"` → 需删 **`zhonghua:103ff1c309eb7bf2cb4f6ff1762e`**。⚠️ 上传脚本对详情是 `doc(_id).set()`（**upsert，只增不删**）→ **重跑上传脚本不会删旧键**，必须**显式删除**该文档 |
| 3 | **重传清理后的钱包集合** | `jiazu_wallets` **在**上传脚本的 `COLLECTIONS` 清单内（12 项），重跑即覆盖 `global` 文档 → 云端 `transactions[]` 的 `transfer` 流水与 `trees` 字段随之消失。⚠️ **以云端实际为准**：若云端该文档本就没有这些字段（例如从未上传过家族树资金数据），则本项无实际影响，只需在部署记录里注明 |
| 4 | 上云命令（写法同既有批次） | `CB_ENV=<envId> CB_KEY=<key> node scripts/upload-migrated-to-cloudbase.mjs`（脚本会顺带重写 `jiazu_tree_meta/global` 的 `storage_files` 映射） |
| 5 | **重传 `zhonghua` 树 JSON（88 人 · 批次 1）** | 同「重传即覆盖」路径：云端树 JSON = 云存储 `trees/zhonghua.json`，全量重跑上传即覆盖为 **88 人**版（§6-3） |
| 6 | **删除云端 51 份详情文档（批次 1）** | 集合 `jiazu_person_details`，`_id = "zhonghua:<handle>"` —— 逐条清单见 **`docs/zhonghua-cleanup-candidates-2026-09.md` 附录 A**；⚠️ 上传脚本对详情是 `doc(_id).set()`（**upsert，只增不删**）→ **重跑不会删旧键**，必须**显式删除** |
| 7 | **重传本批窗口内被写过的集合（以云端实际为准）** | 窗口内 `collections/jiazu_assets.json` / `jiazu_messages.json` / `jiazu_spirit.json` 有过写入，但**来源 = 用户自己的界面操作 + 惰性结算（非本次手术）**；若云端已有对应变更，**不要**用本地件覆盖（本地覆盖会把云端更新回退），只做核对 |

**另记（同批相关，非数据项）**：

- `auth-server` 转账代码**已删除**（§3-5）：该链路属**遗留链路，当前不部署**；若日后仍要部署 `auth-server`，需**与本次代码同批发布**（否则线上仍是旧的可转账版本）。
- 前端建树费文案变更（`9颗石榴籽`）**随 hosting 发布**（见 `docs/PENDING_DEPLOY.md` §16-4）。

---

## 6. 批次 1：首批 51 个「补录登记节点」清理（**已执行** 2026-09-18 08:20–08:22）

> **本批 = 世本 `zhonghua` 的第二笔删节点手术**（第一笔 = §2 的单节点 `I0046`；两批关系见 **§2-7**）。
> 事实与口径来源 = 用户拍板 + 候选清单 **`docs/zhonghua-cleanup-candidates-2026-09.md`**（该文档头部为**执行记录**、附录 A 为 51 个 handle ↔ 云端待删详情 `_id`）。
> **执行人**：主代理（真源执行）；**回写留痕**：制度员 Jing（本 §6 只记录事实与口径，不改口径）。

### 6-1 口径（用户拍板）

| 项 | 决定 |
|---|---|
| 清理对象 | 中华世本（`zhonghua`）里的「**补录登记节点**」——即历史遗留的**孤立登记节点**（详见 6-2 判据） |
| 执行方式 | **方案 B：不改权限、不加 UI 入口**，用**一次性脚本分批删**（用户理由：**不改总谱删除守则**，走「脚本 + 留痕」） |
| 收费口径 | **按现规格 3 片竹片/节点（含总谱）**；脚本路径**不经 API 收费闸门** → **等价扣费**通过 `POST /admin/assets/grant`（`delta:{bamboos:-153}`）完成并留痕（见 6-5） |
| 分批 | 本批 = **首批 = 候选清单当时全部 51 个**（`I0000`–`I0045` 46 个 + `I0047`–`I0051` 5 个）；`I0046` 属 §2 的第 0 批 |
| 工具 | `scripts/remove-zhonghua-person.mjs` —— 已支持批量（`--gramps-ids` / `--from-file`；**逐节点独立守卫**、**同批引用源排除**、**一次写盘**、`--strict`、`--master-ok`、**默认 dry-run**、**幂等**） |

### 6-2 候选判据（「补录登记节点」= 孤立节点；**任一不满足即不入清单**）

1. **无父母 / 无配偶**：树 JSON 中 `parent_family` 为空串、`spouse_families` 为空；
2. **无子女**：不被**任何树** `families` 的 `child_handles` 引用（比「仅本树」更严）；
3. **不在任何家族槽位**：所有树 `families` 的 `father_handle` / `mother_handle` / `child_handles` 均不引用该 handle；
4. **零跨树引用**：全库 people 的 `external_person_handle`、全部字符串字段精确等于该 handle 的兜底扫描、`config/tree-meta.json` 的 `founder_handle` / `master_handle`、所有详情文档属性值 —— 均无引用（含「认祖镜像」与 `tree-meta` founder）；
5. **不在源流链上**：详情文档的 `attributes` 不带 `external_chain_gen`（带该属性者 = 源流链节点，**不入选**）；
6. **不指向「有主」关系的登记源**：本批 4 个节点的 `external_tree` 指向**已不存在的家族树**（幽灵登记），其余 47 个指向存在但**零引用**的家族树。

> 候选来源：世本 139 人里按上述判据筛出的**全部**孤立登记节点 = **51 个**；被跨树引用者 **0 个**。
> 逐节点名单与当时快照见候选清单文档；**判据 4/5 的执行期实现**见 §2-2（同一脚本的 ①–⑥ 断言，批量模式逐节点跑，且把**本批自身**的引用源排除后再判 ③）。

### 6-3 执行命令

```bash
# 前置：先停本地 compat-api 3100（内存 treeCache 常驻；服务活着写入会被旧快照回写）
# ① dry-run（只读；打印逐节点断言结果 + 预测 people 数 + 预测 md5）
node scripts/remove-zhonghua-person.mjs --from-file=/tmp/zhonghua-batch1.txt --master-ok

# ② 真源删除（世本必须 --master-ok；一次写盘）
node scripts/remove-zhonghua-person.mjs --from-file=/tmp/zhonghua-batch1.txt --master-ok --apply
```

- 清单文件 `/tmp/zhonghua-batch1.txt`：注释行 + **51 行**编号（`I0000`–`I0045`、`I0047`–`I0051`，**无 `I0046`**）。
- **干跑预测与实际逐字一致**（people 数、md5、被拒 0 个）。
- 幂等：再跑一次为「无可删项 / 0 变更」，不写盘、不建备份目录。

### 6-4 结果与校验（**真源实测**）

| 项 | 手术前 | 手术后 |
|---|---|---|
| `migrate-output/trees/zhonghua.json` `people` 数 | **139** | **88**（-51） |
| 同文件 md5 | `2c6fbdcae6cd9b7a1cf811408d7b017d` | **`3cc6089aeaa723247065de2549f060c8`** |
| `migrate-output/details/` 全树详情份数 | **287** | **236**（**-51**，删掉的 51 份全部是 `zhonghua:*` 键） |
| 其中 `zhonghua:*` 前缀详情份数 | **139** | **88**（= 88 人各 1 份；世本无镜像节点） |
| 其余树详情份数（= 236 − 88 现盘实测） | 148 | **148**（未变；差额恰好 = 51 → 未删任何其它树的详情） |
| `families` | **80** | **80**（**深度相等**，逐字段未变） |
| 其余 **88 人** people 叶子 | — | **零差异**（逐 handle 字符串级比对一致） |
| 带 `external_chain_gen` 的源流链节点（在详情 `attributes` 内） | **86** | **86**（**未动**） |
| `version` / `updated_at` | `72` / `2026-09-16T05:54:39.003Z` | **故意未动**（同 §2-4 口径：不借数据手术推进版本） |
| 落盘时刻（取证） | 改前基线备份目录 `…-082012`（08:20:12） | 树 JSON mtime **08:22:22**、脚本自身备份目录 `…T00-22-21-710Z` |

**API 复验**（本地 compat-api，重启后）：

| 查询 | 结果 |
|---|---|
| 世本 `GET /people/` | **88** 人 |
| 世本 `GET /tree/rank` 的 `person_count` | **86**（= 源流链计数，**未变**） |
| chief 搜 `I0029` | **0 条**（该世本登记节点已删） |
| chief 搜「季志山」 | **1 条 `ji_23395_01/I000174`**（**用户意图：删世本登记节点、保留家族树里的那个人**） |
| chief 搜「顾清学」 | **1 条 `gu_39038/I000139`**（祖谱真身；§2 第 0 批已删世本同名节点） |
| 搜 `I0000` / `I0051` | **0 条**（均 0） |

### 6-5 扣费与审计证据（**等价扣费**，非脚本内收费）

| 项 | 值 |
|---|---|
| 计费口径 | **3 片竹片/节点（含总谱）** × 51 = **153 片** |
| 扣费路径 | `POST /admin/assets/grant`，`delta: { bamboos: -153 }`（原因必填，已留痕） |
| 余额变化 | 竹片 **1094 → 941 片** |
| 审计日志 | `jiazu_ops_logs` **`op_1789690996088_1qpdiv`**（`ts = 2026-09-18T00:23:16.088Z`、operator `16601061656`）；`reason` **逐字**：「总谱补录登记节点清理：首批 51 节点 × 3 片/节点（docs/zhonghua-cleanup-candidates-2026-09.md）」 |
| 用户流水 | `jiazu_assets.users["16601061656"].txs` **`tx_mu67t6k81fka9`**（`type = admin_grant`、`delta.bamboos = -153`、`desc` 含同一 reason 与审计 id）；扣后余量批次 `bl_mu67o50m30bxt` `qty = 941` |
| 前置事实（非本手术） | 用户**先自行补足资产**（`admin: +999` 竹片，审计 **`op_1789690760806_xbkvlk`**、流水 `tx_mu67o50m4umcl`）**才够付** —— 记录备查，非本批动作 |

### 6-6 回滚（**先停 3100，再回位，后校验，最后重启**）

```bash
cd /Users/kevin/bistro/jiazu
# 0) 前置：先停本地 compat-api 3100（内存 treeCache 常驻；服务活着回滚会被旧快照回写）
# 1) 树 JSON（139 人版）回位
cp /tmp/jiazu-batch1-bak-20260918-082012/zhonghua.json migrate-output/trees/zhonghua.json
# （等价来源：/tmp/jiazu-bak-2026-09-18T00-22-21-710Z/migrate-output/trees/zhonghua.json）
# 2) 51 份详情回位（唯一副本来自脚本自身备份）
cp -R /tmp/jiazu-bak-2026-09-18T00-22-21-710Z/migrate-output/details/. migrate-output/details/
# 3) 判据：三项都要回到改前值
md5 migrate-output/trees/zhonghua.json                    # 期望 2c6fbdcae6cd9b7a1cf811408d7b017d
ls migrate-output/details | grep -c '^zhonghua:'          # 期望 287
node -e "const d=require('./migrate-output/trees/zhonghua.json');console.log(Object.keys(d.people).length)"   # 期望 139
# 4) 重启本地 compat-api（读回滚后的真源）
```

- **回滚不覆盖的部分**：① **云端副本**必须**重新同步**（云端若已删过那 51 份详情文档，回滚需**重新写入**，见 §5 第 5–6 项）；② **扣费不自动返还**（153 片已扣、审计已留痕 —— 若判定回滚，需另行拍板是否冲正，**本册不预设口径**）；③ 脚本能力的代码侧改动（`scripts/remove-zhonghua-person.mjs` 批量支持）**不随数据回滚**。
- **备份须另存**：两处备份都在 `/tmp` 内、**会被系统清理** → 长期保留必须 `cp -R` 到持久目录（见 §4-1 与候选清单文档头部提醒）。**51 份详情文档只存在于脚本备份**（`…T00-22-21-710Z/` 与同内容的 `…T00-21-32-384Z/` 两份，均在 `/tmp` 内），**丢失即不可逆**。

### 6-7 影响面（**删节点不影响源流链 / 认祖指针**的取证）

- **源流链不变**：`external_chain_gen` 只存在于**详情文档 `attributes`**（`lib/tree-write.js`；树 JSON 内**没有**该字段）；被删的 51 个节点**本就不带该属性** → **无链上节点被删、无世数平移**；链节点计数 **86 → 86**（API `/tree/rank` `person_count = 86` 佐证）。⇒ **无需额外重建索引**。
- **认祖 / 联姻指针不变**：51 个 handle 的 `external_person_handle` **全部为空串**、`external_link_type` 为空；`config/tree-meta.json` 的 `founder_handle` / `master_handle` **不含**任一 handle；本批 4 个节点指向的家族树**已不存在**（幽灵登记），其余 47 个指向的家族树**零引用**这些 handle。
- **家族结构不变**：`families` **80 个深度相等**（逐字段未变）；其余 88 人**零差异** —— 即「只少了 51 个孤立节点」，没有级联改动、没有槽位清理。
- **搜索侧**：这些节点在世本内的编号（`I0029` 等）检索 **0 条**；**家族树自有编号面不受影响**（`ji_23395_01` / `gu_39038` 等树里的同号记录照旧，例如「季志山」仍搜到 `ji_23395_01/I000174` 一条）。
- **编号计数器不动**：`migrate-output/collections/jiazu_id_seq.json` 保持 `person.next = 295` / `family.next = 152`（删节点**不铸号**）。
- **写入面（谁改了什么）**：本手术只写 `migrate-output/trees/zhonghua.json` + 删 51 份详情文档；同窗口内 `collections/jiazu_assets.json`（08:23:16 扣费/签到）、`jiazu_ops_logs.json`（08:23:16 审计）、`jiazu_messages.json`（08:21:04）、`jiazu_spirit.json`（08:22:05）、`jiazu_sms_codes.json`（08:26:06）也有写入，但**来源 = 用户自己的界面操作 + 惰性结算（非本次手术）**，已核实；`jiazu_wallets.json`（06:45:56）属 §3 手术二，不属本批。
- **上云要求**：见 §5 第 5–7 项与 `docs/PENDING_DEPLOY.md` §16-3 追加块（重传 88 人树 JSON + **手工删 51 份详情文档**）。

### 6-8 本批明确**不做**的事（防误引）

- **不改权限、不加 UI 入口**（方案 B，用户拍板）；**不改总谱删除守则**、**不动** `POST /admin/delete-node` 与前端危险区口径。
- **不动** `version` / `updated_at`；**不动**任何其它树（`trees/zhonghua.json` 之外的树文件 mtime / md5 见 6-4 与候选清单复核）；
- **不做姓名级合并**（本批是「孤立节点」清理，不是同名去重）；**不删**任何家族树节点（「季志山」等家族树记录**保留**）；
- **不动编号计数器**（6-7）；**不新建集合 / 不新增路由 / 不新增脚本文件**（工具能力为既有脚本的批量增强）。

> 本批引出的**测试回归收口（R1）**、登记为**待裁决的搜索边界（R2）**与**备份规则（S4）**见 **§7 / §8**。

---

## 7. 测试回归收口：R1「测试断言硬编码真源编号」—— **已修复**（适配，非放水）

> 登记来源：**`docs/home-sort-search.qa.md` §14.8 / §14.9**（必修项 R1、可疑点 S1）。本节只记录**修复事实、口径与实测**。
> 修复已入库：提交 **`6547ac3`**（`feat(scripts): 世本节点删除脚本支持批量；测试断言去真源快照依赖`；`cloudfunctions/compat-api/lib/id-system.test.js` 净 diff **27 行**，与本批批量脚本同提交）。

### 7-1 现象（修复前）

| 项 | 值 |
|---|---|
| 命令 | `npm test` |
| 结果 | **`# tests 350 / # pass 349 / # fail 1`**（`not ok 243`），唯一红点 = `cloudfunctions/compat-api/lib/id-system.test.js:308`（QA 捕获于 2026-09-18） |
| 红点文案 | `error: 'zhonghua 4 位原号保留'` |

### 7-2 根因（**测试快照依赖**，非数据缺陷）

原断言把**真源当前数据快照**钉进了测试：

```js
assert.ok(zhIds.includes('I0000') && zhIds.includes('I0052'), 'zhonghua 4 位原号保留');
```

批次 1 删掉的 **正是 `I0000`**（51 个候选之一）⇒ 断言与「真源当时存在哪两个具体历史编号」耦合，节点一删即假红。真实意图（**zhonghua 原号不被重编号**）在现数据下**仍然成立**。

### 7-3 修法（已入库 `6547ac3`）：抽查具体编号 → **形状 / 区间不变量**

| # | 不变量 | 位置（`cloudfunctions/compat-api/lib/id-system.test.js`） |
|---|---|---|
| ① | `zhonghua` **全部**人物编号 **只允许**两种形状：老 4 位 `^I\d{4}$`（原号）或迁移后 6 位 `^I\d{6}$`（全局号） | `:311`–`:316` |
| ② | `zhonghua` **老 4 位原号仍存在**（≥1 个）⇒ 未被重编号 | `:317` |
| ③ | 家族（`F`）同理：只允许 `^F\d{4}$` / `^F\d{6}$`，且老 4 位 F 号仍在 | `:318`–`:323` |
| ④ | **新增强不变量**：`zhonghua` **不进重编号映射表**（`id-migration.json` 无 `zhonghua` 键或为空对象） | `:333` |
| ⑤ | **新增强不变量**：`zhonghua` **全部**编号的数值 `<` 重编号起点 `firstNew`（总谱号段与重编号号段不相交 → 若 zhonghua 被一并重编号，此条必红） | `:343`–`:346` |
| ⑥ | 已加注释**锁定 `zhMax` 口径** = `zhonghua` **全部**编号（**含 6 位**）的最大值，与 `scripts/migrate-global-ids.mjs` 的 `computeBaseline` 一致（只取 4 位老号会算错重编号起点） | `:327`–`:330` |

⇒ 覆盖面由「**2 个抽查编号**」扩大为「**全部 88 人编号的形状 + 号段不相交 + 不进映射表**」，且**节点增删不再假红**。

### 7-4 关键事实（**必读：不要把「every 都是 4 位」写进任何断言 / 文档**）

**「zhonghua 全部编号都是 4 位」在真源上为假**（本节数字为本册成文时磁盘直读实测）：

```
$ node -e "…migrate-output/trees/zhonghua.json…"
every 4位 : false          ← 该写法必红
every 6位 : false          ← 反向写法也必红（变异体）
some  4位 : true
只允许 4/6 位 : true       ← ①+② 的真实约束
zhMax 288
非 4 位号: I000287,I000288
```

- 现世本 **88** 人编号构成：**86 个老 4 位**（`I0000`…`I0137` 号段）+ **2 个迁移后新铸的 6 位全局号** —— **`I000287`、`I000288`**（世本里**后来新增**的 2 人）。
- 因此 `zhIds.every((x) => /^I\d{4}$/.test(x))`（原建议口径的「every」形式）**必然为假**；正确写法只能是「**只允许 4 位或 6 位两种形状**」+「**老 4 位号仍存在**」= 上表 ①+②。
- 同理，**`zhMax`（重编号起点基线）= 288**（= `I000288`），**不是** 4 位号段里的 `I0137` —— 口径错了会让重编号起点少算 151。
- 提示：现盘 `migrate-output/id-migration.json` 的 `firstNew = 138`（**迁移当时的快照**，那时 zhonghua 尚无 6 位号），与现在的 `zhMax = 288` 不同 —— 这是**历史产物的正常现象**（迁移脚本幂等，不会重跑）。测试里跑的是**副本上重新执行迁移脚本**后重算的 `firstNew`（= `zhMax + 1`），两者不可混用。

### 7-5 验证（修复后实测）

| 项 | 结果 |
|---|---|
| 单文件 | `node --test cloudfunctions/compat-api/lib/id-system.test.js` → **`# tests 11 / # pass 11 / # fail 0`** |
| 全量 | `npm test` → **`# tests 350 / # pass 350 / # fail 0 / # skipped 0`**（本册成文时实测；QA 记录的 `350/349/1` 已复绿） |
| 变异验证（约束力） | 两个方向都**必红**且已用真源数据证伪：`every 6 位` → `false`、`every 4 位` → `false`（§7-4 实测输出）⇒ 新断言对该不变量**有真实约束力而非恒真**。QA 另做过**自主变异**（`docs/home-sort-search.qa.md` §14.11.2 M1–M4：逐条把新断言打红、共 `10/1`，回滚后 md5 一致）与 **M0 决定性实证**（旧断言在现真源上 100% 红、无 flake 成分）；**本册未复跑变异体**，此处以真源数据 + QA 的 M0–M4 记录为据。 |
| 判定 | **属「适配」而非「放水」（QA 终判 = 「适配 + 净强化」）**：意图不变、覆盖变大（断言 1 → 6 条、人编号覆盖 2 → 88、新增 families / mapping / 号段三面）、假红消除；依据 = `docs/id-system.spec.md` **§8-3**「任何硬编码编号的测试夹具/脚本需同步更新」。⇒ **R1 关闭**（QA §14.11.4 同判：R1 已闭合；§14 原「不通过」随之解除 → 本批总体结论改为「通过」） |
| **有意取舍（诚实登记的边界）** | 新写法对「**某个具体**节点被误删 / 被改名」**不再敏感** —— 这是有意取舍且口径正确：真源节点增删属**合法业务动作**，节点级完整性由本批数据手术的验收面承担（§6-4 逐 handle 比对、候选清单附录 A 51/51、详情正反向），**不该由一个 ID 体系的单元测试钉住真源的具体节点**。（同 QA §14.11.3 的边界说明。） |

---

## 8. 已知边界 / 待裁决（本批登记）

### 8-1 R2（**待裁决 · 默认保持现状**）：树内 `GET /search` 对**不存在**的编号可能返回 **400「重号」**，而不是 200 + 0 条

**现象与链路**（现盘代码 + 真源实测；**本册只登记，不改口径**）：

树内 `/search` 的编号解析入口是 `resolveNode(query, treeId)`（`cloudfunctions/compat-api/index.js:2388`），**该调用未捕获异常**（对照：全局端点 `/search/global` 有 try/catch 降级，`index.js:2156`–`2160`）→ 异常穿到外层 `safeError`，按 `err.status` 返回。具体链路：

1. **全局编号查不到**（该编号已被删 / 从不存在）→ 解析器按既有口径回退到**「树内旧号」**（`lib/id-resolve.js:③`）；
2. 该号在 **≥2 棵其它树**里作为树内号存在 → 抛 `编号「X」在多个家族树中重号：…；请指定目标家族树后再操作`（`lib/id-resolve.js:178`–`180`，**带 `err.status = 400`**）；
3. 树内 `/search` 未捕获 → **HTTP 400**（带「重号」文案），而非 `200 + []`。

**实测（离线解析探针 `resolveNode(编号, 'zhonghua')`，只读；未碰 3100 / 未启停任何服务）**：

| 输入（均已删/不存在） | `resolveNode` 结果 | 树内 `/search?query=…` 实际 |
|---|---|---|
| `I0000` | `null` | **200 + 0 条** ✅ |
| `I0029` | `null` | **200 + 0 条** ✅ |
| `I0010` / `I0050` | 回退命中 `ji_23395_01`（legacy） | **200 + 0 条** ✅（`tree_id ≠ zhonghua` 不入结果 → 落姓名扫描） |
| **`I0046`** | **抛错** | **400**「编号「I0046」在多个家族树中重号：ji_23395_01（季方某）、liu_21016_01（刘振业）；请指定目标家族树后再操作」 |
| **`I0051`** | **抛错** | **400**「编号「I0051」在多个家族树中重号：ji_23395_01（季堂某）、liu_21016_01（Liu大姥爷）；请指定目标家族树后再操作」 |

**性质**：属 **`docs/id-system.spec.md` §5「绝不猜」的既有设计**（多树重号 → 要求用户显式指定目标树）的**连带效应**，**不是本批引入**：同样的 400 在**上一批删 `I0046` 之前**就已存在（QA §14.9 S2 的删前 / 删后双探针已定位），QA §14.6 亦以真机复验记录「`I0051` 树内 400」。**全局端点不受影响**（`/search/global` 对该异常降级 → 200 + 0 条）。

**影响面（用户可见）**：**用户在树内搜索框里粘一个不存在的编号，可能看到 400 + 一句「重号…请指定目标家族树」的错误提示，而不是「没有结果」**。触发条件是**该编号同时在 ≥2 棵其它树里当树内号**（现例 = `I0046` / `I0051`）；其余不存在编号仍是 200 + 0 条。⇒ 表现为**「删掉的编号」本该 0 条，实际可能报错**，对普通用户是可困惑的错误面。

**裁决状态**：**用户尚未拍板 → 主代理默认保持现状**。一句话可改：若要求「已删 / 不存在的编号一律 0 条」，最小改法 = 树内 `/search` 把解析异常**降级为「不置顶、继续姓名扫描」**（对齐 `/search/global` 的既有写法）→ 200 + 0 条。**但这一改属搜索侧口径变更** —— 按本册从属关系，口径应落在 **`docs/home-sort-search.spec.md` §7** 与 **`docs/id-system.spec.md` §5**，须**产品拍板**后由规格侧修，**不宜在数据侧修**（QA 同判）。本册**不改口径**。

### 8-2 备份规则（**S4 入库：对后续批次为硬要求**）

**事实（本册成文时逐目录实测）**：本批两处备份件**均不含**本批被写入的业务集合文件 ——

| 备份目录 | 内容 | 含 `jiazu_assets.json` / `jiazu_ops_logs.json`？ |
|---|---|---|
| `/tmp/jiazu-batch1-bak-20260918-082012/` | `zhonghua.json`（139 人版）+ `baseline-md5.txt`（2 个文件） | **否**（只有改前 md5，无文件本体） |
| `/tmp/jiazu-bak-2026-09-18T00-22-21-710Z/` | 树 JSON + 51 份已删详情（52 个文件） | **否** |

（全 `/tmp/jiazu-*` 备份目录扫描：`jiazu_assets.json` / `jiazu_ops_logs.json` 副本数 **0**。仅改前 `jiazu_assets.json` 的 **md5** 被记在 `baseline-md5.txt`：`b02eefbc914a3d07f562edc977c0d2a5`，现盘 `28beb86bb17412847f3dfedac33d3aa6`。）

**后果**：扣费前的竹片余额 **1094** 在磁盘上**无副本**，**只能靠审计流水重建** —— 已验证可重建：现余 **941** + 审计 `op_1789690996088_1qpdiv` 的 `-153` = **1094**（上游另有 `+999` = `op_1789690760806_xbkvlk`）。⇒ 结论是「**可重建**」，**不是「有副本」**：一旦流水本身被后续写入覆盖/清理，1094 这一环就不可证。

> **规则（S4，入库 · 后续批次必须遵守）**：**后续批次的备份必须纳入「本批会被写入的全部文件」** —— 树 JSON + 被删/被改的详情文档 + **本批涉及的业务集合**（如 `migrate-output/collections/jiazu_assets.json`、`jiazu_ops_logs.json`、`jiazu_wallets.json` …）。
> 判据：**先列「本批写集合」（谁会被写），再按该集合建备份**；只备份「结构性文件」而漏掉业务集合 ⇒ **回滚 / 审计不可证**（扣费、发奖这类活在流水里的写入，事后只剩推演一条路）。
> 配套（同口径重申，见 §4-1 / §6-6）：备份件落在 `/tmp` 会被系统清理 → **长期留存必须 `cp -R` 到持久目录**；`migrate-output/` 已被 `.gitignore` 忽略，备份件**不进版本库**。

---

## 9. 权威与引用

| 主题 | 权威出处 |
|---|---|
| 家族树资金**下线口径**（路由 / 集合 / 字段 / 状态） | `docs/economy.spec.md` §12-3 |
| 搜索契约 / 镜像归并 / `restricted` / 已知边界 | `docs/home-sort-search.spec.md`（§7-b 已按本册更新为「已解决」） |
| 全站编号（`gramps_id` / `handle` / `resolveNode`） | `docs/id-system.spec.md` |
| 集合与 API 契约（`jiazu_wallets` / `jiazu_person_details` …） | `docs/data-model.md` |
| 上云四要素（本批） | `docs/PENDING_DEPLOY.md` §16（§16-3 云端数据） |
| 一次性脚本 | `scripts/remove-zhonghua-person.mjs`、`scripts/cleanup-retired-transfer-data.mjs`（**均幂等**：脚本不满足前置断言即拒跑；数据已清理后再跑为「0 变更」） |
| **批次 1（§6）的候选判据与执行记录** | `docs/zhonghua-cleanup-candidates-2026-09.md`（头部「执行状态」块 = 执行记录；**附录 A** = 51 个 handle ↔ 云端待删详情 `_id`） |
| 世本删节点的**脚本**判据（6 条前置断言） | 本册 §2-2（第 0 批已逐条核实；批次 1 用**同一套**断言，批量模式逐节点跑） |
| **R1 / R2 / S4 的登记来源**（返工 / 裁决项 / 可疑点） | `docs/home-sort-search.qa.md` **§14.8 / §14.9**（本册 §7 / §8 只记录收口状态与口径引用，不新立口径） |
| 测试夹具硬编码编号的**同步义务** | `docs/id-system.spec.md` **§8-3**（「任何硬编码编号的测试夹具/脚本需同步更新」= R1 属「适配」的依据） |
| 多树重号时「绝不猜」的解析口径 | `docs/id-system.spec.md` **§5**（R2 的 400 是其实施后果） |

**回写校验（2026-09-18，制度员 Jing 磁盘直读 / 只读复算，**未改任何数字口径**）**：

| 校验对象 | 实测 | 结论 |
|---|---|---|
| 本册 §6-4 / §6-7 结果数字 | `people` **88** / `families` **80** / 树 md5 **`3cc6089aeaa723247065de2549f060c8`** / 全树详情 **236** / `zhonghua:` 详情 **88**（其余 148）/ 链节点 **86** / `version`+`updated_at` = **72** + `2026-09-16T05:54:39.003Z` | **逐项一致** ✅ |
| 本册 §6-5 扣费与留痕 | 审计 `op_1789690996088_1qpdiv`（`bamboos:-153`、reason 逐字、ts `2026-09-18T00:23:16.088Z`）/ 流水 `tx_mu67t6k81fka9`（`-153`）/ 批次 `bl_mu67o50m30bxt` `qty = 941` / 现余 **941**（= 1094 − 153）/ `jiazu_id_seq` = `person.next 295` + `family.next 152` | **逐项一致** ✅ |
| `docs/zhonghua-cleanup-candidates-2026-09.md` 附录 A | **51 行**；51 个 handle **与实测删除集合（139 人备份 − 现盘 88 人）逐 handle 全等**；每个 handle 在 139 人备份中的 `gramps_id` 与表内编号**全部吻合**；现盘这 51 个 handle **0 残留**、其详情**0 个存在**（备份内 **51 份**齐备） | **51/51 一致** ✅ |
| `docs/PENDING_DEPLOY.md` §16-3 追加块 | 已含 **重传 88 人树 JSON**（含终值 md5）、**手工删 51 份云端详情**（清单指向候选清单附录 A）、**无需重建索引**（链节点 86 未变 + `person_count` 86）；`jiazu_id_seq` 不动 | **三项齐备** ✅ |
| 回归计数 | 单文件 `11/11/0`；全量 **`350/350/0`** | **已复绿**（QA 的 `350/349/1` 为修复前状态） ✅ |

**未发现与实测不一致之处** —— 唯一需要读者留意的是 §7-4 提示的 `id-migration.json` `firstNew = 138`（迁移当时快照）与现 `zhMax = 288` 的**历史性差异**（非错误，见该节说明）。
