# URI 口径：世本 `/z/` · 祖谱 `/z/<tree_id>` · 普通家族树 `/<tree_id>` — 规格（docs/uri-aliases.spec.md）

> 状态：**实施完成（2026-09-18）· 真机质检已通过 · 待部署上云**（部署项见 `docs/PENDING_DEPLOY.md` §17，**含数据项** §17-3）。
> 本册管**地址栏路径形态**、旧路径弃用与重定向、以及 `config/tree-meta.json` 的 `path_alias` 数据口径；**不管**节点字段 / 编号 / 权限 / 计费。
> 关联：`docs/clan-tree.spec.md`（世本 / 祖谱 / 普通家族树三类树）、`docs/chain-batch-append.spec.md`（同批扩展）、`docs/permission-tier.spec.md`。
> 代码锚点：`frontend/src/App.vue`（`CLAN_PATH_RE` 第 12 行、`MASTER_PATH` 第 18 行、`/z/zhonghua` 判定顺序第 35 行）、
> `frontend/src/business/cross-tree.ts`（`MASTER_PATH` 第 15 行）、`config/tree-meta.json`（`trees.zhonghua.path_alias` = `/z/`，第 66 行）。
> 证据：`docs/chain-batch-append.qa.md` **§9（T1 与真源体检）**。

---

## 0. 本册边界

| 项 | 口径 |
|---|---|
| **本册管** | 三种树的路径形态（含尾斜杠归一）、世本 `/z/` 的接受形态、`/zhonghua` 弃用与客户端重定向、`tree-meta.path_alias` 数据口径（含本次真源手术与备份）、跨树跳转的路径输出、子域现状（已知边界） |
| **本册不管** | 树的种类语义与数据模型 → `docs/clan-tree.spec.md`；批量续编行为 → `docs/chain-batch-append.spec.md`；权限档位 → `docs/permission-tier.spec.md`；部署动作 → `docs/PENDING_DEPLOY.md` §17 |
| **数值/字面纪律** | 路径串（`/z/`、`/zhonghua`）、正则、判定顺序、备份路径**逐字取自拍板与实测**；不得自行改口径、不得编数字 |

---

## 1. 三种路径形态（写死）

| 树类 | 判据 | 路径形态 | 示例 |
|---|---|---|---|
| **世本（中华世本总谱）** | `tree_id === 'zhonghua'`（`is_master`） | **`/z/`** | `/z/` |
| **祖谱** | 该树 `kind === 'clan'` | **`/z/` + tree_id** | `/z/ji_23395` |
| **普通家族树** | 其余（`kind === 'family'`） | **`/` + tree_id** | `/ji_23395_01` |

- 世本**不再占** `/<tree_id>` 形态；`/z/` 是世本的**唯一规范地址**。
- 祖谱沿用 `/z/` 前缀 → 祖谱与世本共享前缀，靠**段数 / 正则**区分（见 §2 的顺序约束）。

---

## 2. 世本 `/z/` 的接受形态与归一（含判定顺序约束）

| 输入 | 行为 |
|---|---|
| `/z` | 进入世本；**地址栏归一并保持 `/z/`** |
| `/z/` | 进入世本（规范形态） |
| `#/z/` | 进入世本（hash 路由） |
| `/z/zhonghua` | 进入世本（**兼容形态**）；地址栏保持 `/z/` |

⚠️ **`/z/zhonghua` 的判定必须先于 `CLAN_PATH_RE`**：`CLAN_PATH_RE = /^\/z\/([a-z0-9_]+)$/`（`App.vue` 第 12 行）会把 `zhonghua` 当成 `tree_id='zhonghua'` 的**祖谱**。代码注释（第 35 行）已登记该顺序约束；**任何后续改动都必须保持该判定先于祖谱正则**。

---

## 3. `/zhonghua` 弃用与重定向

| 项 | 口径 |
|---|---|
| 弃用对象 | 旧世本路径 **`/zhonghua`**（含 **path** 与 **hash** 两种写法） |
| 行为 | **客户端重定向**到 **`/z/`**（重定向后地址栏为 `/z/`） |
| 实现层 | **仅前端**（`App.vue`）：真源里**不再有** `/zhonghua` 这类 `path_alias` |
| 是否服务端 301/302 | **未做**（无 hosting 重写规则改动）—— 属**已拍板事实**，不是缺陷 |
| 语义边界 | `/z/ji_23395` 一类祖谱路径**不受影响**（仍为祖谱） |

---

## 4. 数据口径：`config/tree-meta.json` 的 `path_alias`

| 树类 | `path_alias` |
|---|---|
| 世本 | **`/z/`**（`trees.zhonghua.path_alias`，第 66 行） |
| 祖谱 | `/z/<tree_id>`（例 `/z/ji_23395`；支系祖谱按其自身条目） |
| 普通家族树 | `/<tree_id>`（例 `/ji_23395_01`） |
| 其它展示字段（`surname_char` / `display_title` / `hall_name` / `origin` / `description` / `founder_*` / `kind` …） | **不变** |

**本批真源手术（2026-09-18）**

- 变更：`trees.zhonghua.path_alias` **由 `/zhonghua` 改为 `/z/`**。
- 备份：**`~/jiazu-backups/20260918-144857-tree-meta-alias/`**。
- ⚠️ `config/tree-meta.json` 是**云端数据的一部分** → 上云时**必须随云端数据同步**（`docs/PENDING_DEPLOY.md` §17-3）；**重打包云函数不覆盖该项**。

---

## 5. 子域现状（已知边界）

- `shiben.*` 子域的地址栏**仍为子域根**，**未改写**为 `/z/`。
- 归类：**已知边界**（不是缺陷）——本册只规定主域路径口径；子域改写如需，另立批次。

---

## 6. 跨树跳转的路径输出

- `frontend/src/business/cross-tree.ts` 对 **`is_master` / `zhonghua`** 统一输出 **`MASTER_PATH`（= `/z/`）**（第 15 行），**不再输出 `/zhonghua`**。
- 祖谱跳转输出 `/z/<tree_id>`，普通树输出 `/<tree_id>` —— 与 §1 表一致。

---

## 7. 验收与证据指针

| # | 验收点 | 证据指针 |
|---|---|---|
| 1 | `/z/` 进入世本（90 世 / 112 人），**地址栏保持 `/z/`** | `docs/chain-batch-append.qa.md` §9（T1） |
| 2 | `/zhonghua` → 重定向到 **`/z/`** | 同上（T1） |
| 3 | `/z/ji_23395` 仍为**祖谱**（未被 `/z/` 世本判定吞掉） | 同上（T1） |
| 4 | `tree-meta` 的 `zhonghua.path_alias` = `/z/`（真源体检） | 同上（§9 真源体检） |

---

## 8. 已知边界与信息缺口

| # | 项 | 口径 |
|---|---|---|
| 1 | `shiben.*` 子域地址栏未改写为 `/z/` | **已知边界**（§5） |
| 2 | 服务端未做 `/zhonghua` → `/z/` 的 301/302 | **客户端重定向**即口径（§3）；如需 SEO/深链保真，另立批次 |
| 3 | `/z/zhonghua` 判定的顺序约束 | 属**脆弱点**（正则会误吞）：改动 `App.vue` 时必须保持判定先于 `CLAN_PATH_RE`（§2）；本轮**未加独立单测**断言该顺序（前端无对应单测文件）→ **信息缺口** |
| 4 | `path_alias` 其它树条目的形态 | 本册只写死三类**形态规则**；逐树逐条的字面值以 `config/tree-meta.json` 现场为准（不复制全量） |

---

## 9. 交叉引用

| 文件 | 关系 |
|---|---|
| `docs/clan-tree.spec.md` | 世本 / 祖谱 / 普通家族树三类树的数据语义 |
| `docs/chain-batch-append.spec.md` | 同批「批量添加子孙」扩展到祖谱（§3-5 祖谱档） |
| `docs/chain-batch-append.qa.md` | §9 扩展轮质检（T1 URI 证据、真源体检） |
| `docs/PENDING_DEPLOY.md` | 部署项 = §17（云函数重打包 + **§17-3 数据项 `path_alias`** + 前端 H5） |
