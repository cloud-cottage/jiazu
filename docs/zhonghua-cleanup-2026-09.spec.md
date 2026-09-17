# 数据修正：世本删节点 I0046 + 家族树资金残留数据清理 — 手术记录（zhonghua-cleanup-2026-09.spec.md）

状态：**已对真源执行**（2026-09-18 06:48，同批代码提交 `2bf89f7` / `dc8214f`）。执行人 = 主代理；本册由制度员 Jing **回写留痕**（本册只记录事实与口径，不改口径）。

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
| 1 | **重传 `zhonghua` 树 JSON（139 人）** | 云端树 JSON = 云存储 `trees/zhonghua.json`；上传脚本按 `migrate-output/report.json` 的树清单**逐棵覆盖上传**（`app.uploadFile({cloudPath})`）→ 全量重跑即覆盖该棵 |
| 2 | **删除云端 I0046 详情文档** | 云端详情在集合 `jiazu_person_details`，`_id = "<tree_id>:<handle>"` → 需删 **`zhonghua:103ff1c309eb7bf2cb4f6ff1762e`**。⚠️ 上传脚本对详情是 `doc(_id).set()`（**upsert，只增不删**）→ **重跑上传脚本不会删旧键**，必须**显式删除**该文档 |
| 3 | **重传清理后的钱包集合** | `jiazu_wallets` **在**上传脚本的 `COLLECTIONS` 清单内（12 项），重跑即覆盖 `global` 文档 → 云端 `transactions[]` 的 `transfer` 流水与 `trees` 字段随之消失。⚠️ **以云端实际为准**：若云端该文档本就没有这些字段（例如从未上传过家族树资金数据），则本项无实际影响，只需在部署记录里注明 |
| 4 | 上云命令（写法同既有批次） | `CB_ENV=<envId> CB_KEY=<key> node scripts/upload-migrated-to-cloudbase.mjs`（脚本会顺带重写 `jiazu_tree_meta/global` 的 `storage_files` 映射） |

**另记（同批相关，非数据项）**：

- `auth-server` 转账代码**已删除**（§3-5）：该链路属**遗留链路，当前不部署**；若日后仍要部署 `auth-server`，需**与本次代码同批发布**（否则线上仍是旧的可转账版本）。
- 前端建树费文案变更（`9颗石榴籽`）**随 hosting 发布**（见 `docs/PENDING_DEPLOY.md` §16-4）。

---

## 6. 权威与引用

| 主题 | 权威出处 |
|---|---|
| 家族树资金**下线口径**（路由 / 集合 / 字段 / 状态） | `docs/economy.spec.md` §12-3 |
| 搜索契约 / 镜像归并 / `restricted` / 已知边界 | `docs/home-sort-search.spec.md`（§7-b 已按本册更新为「已解决」） |
| 全站编号（`gramps_id` / `handle` / `resolveNode`） | `docs/id-system.spec.md` |
| 集合与 API 契约（`jiazu_wallets` / `jiazu_person_details` …） | `docs/data-model.md` |
| 上云四要素（本批） | `docs/PENDING_DEPLOY.md` §16（§16-3 云端数据） |
| 一次性脚本 | `scripts/remove-zhonghua-person.mjs`、`scripts/cleanup-retired-transfer-data.mjs`（**均幂等**：脚本不满足前置断言即拒跑；数据已清理后再跑为「0 变更」） |
