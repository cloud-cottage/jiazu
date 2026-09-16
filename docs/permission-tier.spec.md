# 家族树节点级可见分层 — 权限规格（permission-tier.spec.md）

> 状态：**已实施 + E2E 验证通过**（2026-09-04，Zang→编码闭环）
> 真源级别：规格文件。实施（auth-server / compat-api / frontend）必须与本文件一致。
> 关联：docs/data-model.md（存储/API 契约）、auth-server/scope.js（写权限，本次不动语义）、IDEA.md §9/§15（角色与合规）。

## 1. 目标

读路径增加「节点级（世级）可见分层」：对家族树近代世节点做隐私保护，
未登录/已登录未加入者只能看到古老谱系；加入家族后所属树全可见。
**服务端强制执行**（读 API 返回前裁剪），不依赖前端自律。

## 2. 身份档位（决定可见范围）

| 档位 | 判定 | 普通家族树可见范围 | zhonghua（is_master） |
|---|---|---|---|
| guest（未登录） | 请求无有效 JWT | 除最底 **18** 层外全部可见 | 全部可见 |
| logged-in（已登录未加入） | 有效 JWT，且该树 ≠ 用户锚点树 | 除最底 **9** 层外全部可见 | 全部可见 |
| member（已加入） | 有效 JWT，锚点 `tree_id == 该树` | 全部节点可见 | 全部可见（总谱不可加入，见 server.js join 限制） |

管理特权（与写权限 scope.js 既有语义一致，覆盖档位）：
- `chief_editor`：所有树全可见（含 zhonghua）。
- `tree_steward`：锚点所属树全可见；其它树按档位表回落（登录用户 → 除最底 9 层）。

## 3. 世级裁剪公式

术语：普通树世代号自根起 1..maxDepth（根=无父者=第 1 世，向下递增；算法与
auth-server/rank.js `computeTreeDepth` 一致）。**树梢端 = 大世代号端（近代）**。

- 可见世数 `visibleMax = maxDepth − hideN`，其中 guest `hideN=18`、logged-in `hideN=9`。
- **兜底规则（浅树）**：若 `visibleMax < 1`，取 `visibleMax = 1`（至少可见最古老 1 世 = 始祖层），
  并向前端标记 `clamped: true`（锁定提示）。
- 隐藏集合 = 世代号 > visibleMax 的全部 person；关联 families（任一成员被隐藏）一并裁掉，
  保证树图只含可见节点间的连接。被隐藏节点不得以任何字段（姓名/生卒/引用）泄漏。
- `maxDepth` 与逐人世代号在**同一请求周期内只计算一次**（auth-server 已有 families 缓存；
  compat-api 直接来自树 JSON）。

## 4. 实测基线（迁移数据 migrate-output/trees/*.json）

| 树 | maxDepth | guest 可见 | logged-in 可见 | member |
|---|---|---|---|---|
| ji_23395_01 | 26 | 1–8 世 | 1–17 世 | 全 26 世 |
| gu_39038_01 | 4 | 1 世（兜底 clamp） | 1 世（兜底 clamp） | 全 4 世 |
| liu_21016_01 | 5 | 1 世（clamp） | 1 世（clamp） | 全 5 世 |
| shen_27784_01 | 3 | 1 世（clamp） | 1 世（clamp） | 全 3 世 |
| zhonghua | — | 全放行 | 全放行 | 全放行 |

## 5. 读 API 契约（裁剪后行为）

所有裁剪在 auth-server 读代理与 compat-api 读输出层实现；响应形状对前端保持不变。

| 端点 | 行为 |
|---|---|
| GET /people/?profile=all | 仅返回可见 person |
| GET /families/ | 仅返回全成员可见的 family |
| GET /search/?query=… | 仅匹配可见 person（隐藏者不参与、不泄漏） |
| GET /people/<handle>（detail/编辑读取） | 隐藏节点 → 404（不区分"存在但隐藏"） |
| GET /tree/rank | 附加 `access` 元信息（见 §6） |

登录判定：读路径解析可选 Bearer JWT（与写路径同一 verifyJwt）。无/坏 token = guest。

## 6. Access 元信息（前端锁定 UI 依据）

`GET /tree/rank`（及树列表所需处）返回新增字段：

```jsonc
"access": {
  "mode": "full" | "partial" | "floor", // full=全可见; partial=可见 visible_max_depth 世; floor=触发兜底 clamp
  "visible_max_depth": 17,
  "hide_tail": 9,          // 本档位隐藏的尾世数（0 表示无隐藏）
  "is_master": true,       // zhonghua 恒 full
  "member": false,         // 当前用户是否已加入该树（member=true 时 mode=full）
  "login_required": false  // 提升可见性是否需要登录
}
```

前端规则：`mode=floor` 与 `partial` 显示锁定/引导条（文案区分 guest 与 logged-in）；
zhonghua 或 `full` 不显示。

## 7. 字段级隐私叠加（双层）

节点级分层之上，privacy.ts 在世者字段脱敏**继续生效于所有人**（含 member），
不因节点可见性提升而豁免（合规约束 IDEA.md §15：在世者生日/出生地/配偶完整信息/联系方式仅姓名可见）。

## 8. 实施点

1. 抽取共享规则模块（hideN 配置 + 公式 + 兜底），auth-server 与 compat-api 复用同一语义；
   纯函数，可单测。
2. auth-server：`proxyToGramps` 读 GET 响应 JSON 后处理（people/families/search/detail），
   tree/rank 加 access 字段；读请求可选解析 JWT。
3. compat-api：读输出层（GET people/families/search/detail + rank）同样裁剪 + access。
4. frontend：tree/rank 消费 access → 锁定条/引导（登录、加入）；加入按钮在 member 后消失；
   列表卡片可带"部分可见"标识。zhonghua 入口不受影响。
5. 测试：单测规则模块（§4 基线表全部行 + 边界）+ 读 API 集成验证。

## 9. 加入通道（申请-审批制；2026-09-04 已实施，E2E 17/17）

> 背景：分层后近代层隐藏，用户看不到自己节点 → 自助认领不可达，且 `/api/join`
> 接受任意 handle = 注册后猜 handle 解锁全树近代数据的漏洞。**决策：彻底取消自助
> 认领（/api/join 退役），加入一律走「我是家族成员」申请 → 族谱主理人审批绑定。**

### 9.1 申请（用户侧，需登录且未绑定锚点）

`POST /api/join-request` → 201 `{ id }`

```jsonc
{
  "tree_id": "ji_23395_01",          // 普通树；zhonghua(is_master) 不可加入
  "reference_handle": "<handle>",    // 必填：可见层所选支系节点（申报归属线索）
  "self_name": "张三",               // 申请人自称姓名（提示审批人检索）
  "note": "我是季X公第23世孙，现居费县…" // 可选：关系/字辈/联系方式说明
}
```

服务端校验：登录态；用户无锚点（一人一树）；tree 存在且非 master；reference_handle
是该树真实 person **且对申请人当前档位（guest 登录后至少 logged-in 档）可见**
（禁止用隐藏 handle 申报）；同树无 pending 申请（拒绝后可重申）；`self_name` 或
`note` 至少一项非空（防止空申请）。

### 9.2 审批（管理侧）

- `GET /api/admin/join-requests` → 列表（形状对齐 leave-requests：`{id, phone,
  nickname, tree_id, reference_handle, reference_name, reference_depth,
  self_name, note, status: pending|approved|rejected, created_at, handled_by,
  handled_at}`）；tree_steward 仅见自己树，chief_editor 见全部。
- `POST /api/admin/approve-join {id, person_handle}`：审批人在该树全量数据中检索/
  定位申请人本人节点（可为谱中既有近代节点，或先经既有写接口新增后再绑）→
  服务端校验本人 handle 归属该树 → `setAnchor(phone, tree_id, person_handle)`
  （若申请人已有锚点 → 拒绝，提示先走解绑流程）→ 状态 approved。
- `POST /api/admin/reject-join {id, reason?}`：状态 rejected，申请人可重申。

状态机沿用 leave-requests（auth-server data/join-requests.json / CloudBase
`jiazu_join_requests` 集合）。审批权限隔离与解绑审批一致。

### 9.3 前端调整

- 用户侧**移除全部自助认领入口**：hall「🌳 加入本家族」搜索认领弹窗 → 改为
  「申请加入本家族」（可见层搜索选支系节点 + 自述）；person/detail「这是我」
  认领按钮移除（member 已绑；非 member 看不到近代节点，无自助意义）。
- 管理侧 admin/index.vue 增「加入申请」审批区（reference 节点展示 → 内嵌该树
  全量搜索选本人节点 → 通过/拒绝）。
- 首页列表/搜索聚合页对 `floor`（整树近代层全封）树的展示形态随前端改版落地。

### 9.4 兼容/退役

- `/api/join` 从 auth-server 与 compat-api 路由删除（前端 joinTree 一并移除）。
- `/api/admin/set-anchor` 保留（chief/steward 纠错与代录兜底），加入主通道为审批制。

## 10. 验证清单（全部通过 2026-09-04：单测 18/18 + 读 E2E 13/13 + 加入 E2E 17/17）

- [x] ji guest → 可见 1–8 世（人数吻合 §4）；detail 请求 9 世 handle → 404
- [x] ji logged-in → 可见 1–17 世；member → 全 26 世
- [x] gu/liu/shen guest 与 logged-in → 仅第 1 世 + access.mode=floor
- [x] zhonghua 全档位全可见
- [x] search 不返回隐藏 person；families 无隐藏成员引用
- [x] member 看在世者 → 节点可见但字段仍脱敏（前端渲染层 is_living 条件，天然叠加）
- [x] chief_editor / tree_steward(自己树) → 全可见；tree_steward 看其它树 → logged-in 档
- [x] auth-server 路径与 compat-api 路径行为一致（规则模块双份同 spec，单测同源基线）
- [x] `/api/join` 已移除（404）；join-request 用隐藏 reference_handle → 400；未登录/已绑定 → 401/400
- [x] 申请 → steward/chief 审批通过后用户成为 member（全树可见 89/89）；同树重复申请 pending 拦截；拒绝后重申放行
