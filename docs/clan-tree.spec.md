# 宗谱（Clan Tree）规格

状态：**设计已确认 Kevin 2026-09-15 · 待实施**
关联：`docs/founder-attach.spec.md`（同一原语）、`docs/marriage.spec.md`、`docs/data-model.md`、`docs/PENDING_DEPLOY.md`

## 1. 一句话

在「中华世本（总谱）」与「普通家族树」之间新增一层 **宗谱**（按姓 / 支系，可多个）：
宗谱始祖是**世本节点的镜像**，宗谱顶端是**世本世系链的镜像段**（只读），
其下为宗谱**自有世代**；普通家族树的始祖是**宗谱节点的镜像**。
**普通树不得跳过宗谱直挂世本。**

```
中华世本 zhonghua
   │  宗谱始祖 = 世本节点镜像（link_type='founder'）
   ▼
宗谱（kind='clan'）  例：季氏宗谱 ji_23395
   ├─ 顶端链镜像段：季孙子 → … （link_type='chain'，只读）
   └─ 自有支系段：季花 及以下（宗谱自有真人，可编辑/续编）
   ▼  普通树始祖 = 宗谱节点镜像（link_type='founder'）
普通家族树（kind='family'） ji_23395_01 …
```

## 2. 术语与层级字段

| 项 | 值 |
|---|---|
| `tree-meta.trees[*].kind` | `'master'`（zhonghua）/ `'clan'`（宗谱）/ `'family'`（普通树）；缺省按 `'family'` 兼容旧数据 |
| 宗谱字段 | `surname`（如 `季`）、`master_tree_id='zhonghua'`、`master_handle`（始祖指向的世本节点）、`founder_handle`（宗谱自有支系的下端点 = 各普通树认祖的落点，如 `季花`） |
| 普通树字段 | `clan_tree_id`、`clan_handle`（其始祖指向的宗谱节点） |

## 3. 已确认口径（Kevin 2026-09-15）

1. **顶端链中间节点 = 世本镜像、只读**（世本唯一真相）；宗谱的自有真实数据从链路下端点（如 `季花`）开始，此后可自行向下续编支系。
2. **普通树不可跳过宗谱直挂世本**：必须先建立宗谱（内容再少也要建），认祖 target 只能是 `kind='clan'` 的树。
3. **始祖唯一性按"世本节点 × 姓"**：同一世本节点在**同姓**宗谱中只能被**一支**认作始祖；**不同姓**的宗谱可多支共享同一世本节点（赐姓/改姓等，不罕见）。
4. **宗谱创建 = 申请制**：该姓现有树 steward / chief_editor 发起 → chief_editor 审批 → 建树。
5. **宗谱页面版式**（独立于普通树首页）：顶部「世系链（世本镜像段，只读）」→ 中部「本宗自有世代」→ 底部「**支系入口列表**」（所有认此宗谱为祖的普通家族树，可点进）。
6. 统计口径：宗谱的人**不计入**世本人数/世数；普通树的人**不计入**宗谱；支系列表可显示各树人数。
7. 镜像与只读：位于任一层上方的镜像节点在本层内**整节点只读**（沿用 `founder-attach.spec` §5），要改到其真身所在层。

## 4. 数据结构

### 4-1 宗谱顶端（镜像段）

```
person: { gramps_id, external_tree: 'zhonghua', external_person_handle: <世本 handle>,
          external_link_type: 'founder' | 'chain', external_mirror: 'true',
          external_relation_note: '<真身姓名>（中华世本 · 第 N 世）' }
```
- 首个（最高）节点 = 始祖，`link_type='founder'`；其下链路节点 = `'chain'`。
- 均为只读镜像，本层不落独立身份数据（姓名/生卒为展示副本，真身为准）。

### 4-2 宗谱自有段

`季花` 及以下为宗谱自有真人节点（`external_*` 为空），可编辑、可续编、可再被普通树认祖。

### 4-3 普通树始祖

始祖节点 = 指向宗谱节点的镜像（`external_tree='<宗谱 tree_id>'`、`external_link_type='founder'`、`external_mirror='true'`），整节点只读；除始祖外本树任何节点可编辑。

### 4-4 集合

- `jiazu_clan_requests`（新建，需并入部署清单）：`{ _id, surname, tree_id?, master_handle, master_name, clan_title, requested_by, status: 'pending'|'approved'|'rejected', decided_by, reject_reason, created_at, decided_at }`

## 5. 操作

| 操作 | 入口 | 权限 | 规则 |
|---|---|---|---|
| 建谱申请 | 「我的 / 家族树管理」或该姓现有树档案 →「申请建立宗谱」 | 该姓现有树 steward / chief | 写 pending；审批通过后建树（`kind='clan'`），并写入始祖镜像 |
| 建谱审批 | 「家族消息」/ 管理工作台 | chief_editor | 通过 → 校验 §3-3 唯一性 → 建树 + `updateTrees`；驳回不改数据 |
| 宗谱认祖（对世本） | 宗谱始祖节点 →「认祖（挂到中华世本）」 | 宗谱 steward / chief | 复用 `founder-attach` 申请制；target 必须是 `kind='master'` |
| 普通树认祖（对宗谱） | 普通树始祖节点 →「认祖（挂到宗谱）」 | 本树 steward / chief | 复用 `founder-attach`；target 必须是 `kind='clan'`；**禁止** target=`kind='master'` |
| 解除挂载 | 双方均可 | 本层 steward / chief | 无需申请，立即生效；解除后始祖回到**空白占位**态（不可直挂世本，需重新认祖到某宗谱） |
| 宗谱与世本解除 | 宗谱始祖节点 / 世本真身节点 | 同上 | 顶端镜像段清空、宗谱**自有段保留**；页面提示「该宗谱未认祖世本」 |

## 6. URL 与 tree_id

- 宗谱 URL：`/z/<tree_id>`；普通树保持现状（`/<tree_id>`）。
- `tree_id` 规范：`<姓拼音缩写>_<编号>`（例 `ji_23395`）；冲突时追加 `_01`（例 `ji_23395_01`）。
- `kind` 决定前端版式；路由只认 `tree_id`，层级由 tree-meta 判定。

## 7. 实施清单

- **P1** `tree-meta.kind` + 建谱申请/审批 + 宗谱建树（始祖镜像 + tree_id 规范 + `/z/<id>` 路由与页面骨架）
- **P2** 宗谱认祖世本（顶端链镜像段：`founder` + `chain`，只读校验）
- **P3** 普通树认祖宗谱（`founder-attach` 的 target 泛化为"任意上层树"，加 §3-2/§3-3 校验）
- **P4** 宗谱页面三段版式（镜像链只读 / 自有世代 / 支系入口列表）+ 统计口径 + 文档与部署清单
- **并入 P3 一起做**（`founder-attach` 剩余项）：认祖**选择器**（按 target 层级搜索：宗谱/世本）、`family-messages` 的**认祖 + 建谱**待办、`tree-pedigree` 隐藏规则收紧（仅孤立占位隐藏）

## 8. 测试与约束

- 单测/路由测：建谱唯一性（同姓同世本节点第二次 → 400；异姓可共享）、禁止直挂世本（target=master → 400）、镜像只读 403、解除回空白占位、统计不计入。
- 写测试只用 `COMPAT_OUT_DIR` → `/tmp` 副本，并断言 `migrate-output/` 真实树与 `config/tree-meta.json` 的 md5 未变。
- 保持 `npm test` 全绿（当前 92 pass / 0 fail），新测试文件需注册进 `package.json` 的 `scripts.test`。
- 前端 `npx vue-tsc --noEmit` 必须 exit 0。

## 9. 待确认的默认口径（按此实现，如不符一句话即可改）

- 宗谱与世本解除挂载后：**保留宗谱自有段**，仅清空顶端镜像段（不整树清空）。
- 建谱申请通过后，宗谱的 `founder_handle` 可暂为空（此时"支系入口列表"为空，允许后续在宗谱内续编后再被认祖）。
