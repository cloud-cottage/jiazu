# 立支 / 汇宗 独立质检报告（qa · docs/branch-clan-ops.qa.md）

- 规格真源：`docs/branch-clan-ops.spec.md`（本轮重验对应的实现版本 = 收尾轮开工时的仓库工作区）
- 被检实现：`cloudfunctions/compat-api/lib/branch-clan-ops.js`（编排）、`lib/store.js`（updateTrees / saveTree / deleteTree）、
  `lib/economy-fee.js` + `lib/economy-spirit.js`（费用 / 灵气）、`lib/marriage.js` + `lib/child-write.js`（跨树消费方）、`cloudfunctions/compat-api/index.js`（路由层 catch 出口）
- 质检角色：【Neng 质检员】；**全程在 /tmp 副本上执行，真源零写入**（归因见 §8）
- 环境：副本 `/tmp/qa-bco`（= `/tmp/qa-pristine` 快照 → `migrate-output/{trees,details,collections}` + `config/tree-meta.json`）+ `COMPAT_SOURCE=local COMPAT_OUT_DIR=/tmp/qa-bco` 的独立实例 `:3450`；前端未启动（`vue-tsc` 仅类型检查，不起任何前端端口）
- 登录走真实开发路径：`POST /api/auth/send-code` → 取 `dev_code` → `POST /api/auth/login`（仓库内不存在 `?dev_login=1`）
- 用例编号：`T*` = 边界/红线矩阵 + 立支正例（阶段一 / 阶段二）；`P*`/`C*`/`E*` = 立支→汇宗路径 / 汇宗正例 / EACCES 注入（阶段三）；`G*` = 本轮收尾重验

> 本文件为质检报告，**不含任何实现 / 测试 / 规格改动**（本轮唯一写盘目标 = 本报告）。

## 1. 结论速览

| 项 | 结论 |
|---|---|
| 历史轮次用例（行 / 唯一 id） | 阶段一 27 / 27；阶段二 21 / 12；阶段三 28 / 25；**合计 76 行 / 64 条唯一用例**（行计数含重复执行，见 §7 口径） |
| 历史轮次 PASS / FAIL（唯一 id） | PASS 64 / FAIL 0（4 条 FAIL 全部已定性：2 条实现口径缺陷 P4/P5 → 本轮实现已放宽，2 条质检侧断言笔误 E1c/E1d → 复评 PASS，见 §6） |
| 本轮收尾重验（G*） | **10 条（PASS 10 / FAIL 0）**，见 §4 |
| 互逆闭环（立支 → 汇宗） | **直接 200**（G1/G2：立支产物始祖镜像是「另一棵普通树」的镜像，放宽后免认祖、免 detach/attach 即可汇宗，PASS） |
| safeError（EACCES → 500） | **500 + 「服务内部错误」，响应体无 EACCES / 本机路径**（G5 三个站点：立支写宗谱 / 汇宗删树 / `/admin/add-child`，PASS ✓） |
| updateTrees 失败侧缓存（婚姻 / 跨树加子女） | **失败侧无幻影 + 成功路径未变**（G6 跨树加子女 / G7 婚姻绝婚 注入 EACCES；G8 成功路径 200/200，PASS） |
| 汇宗 §13-23（目标树持有源树镜像 → 409） | **仍为 409**（现状未变）：目标树 `gu_39038_01` 自身持有 4 条指向源树节点的镜像，全量阻断方共 7 条（逐条清单见 §4-1 G9 与 §7-3） |
| `vue-tsc --noEmit`（frontend） | **exit code 0**，无任何诊断输出（`cd frontend && npx vue-tsc --noEmit`，日志 /tmp/qa-ev/vue-tsc.log；未启动任何前端端口） |
| 真源写入 | `migrate-output/**` 逐字节不变；`config/tree-meta.json` 归因见 §8 |

**总体判定**：两条操作的核心结构语义（立支上移链 + 汇宗整树迁移）与红线（跨树引用体检 / confirm_people / 权限 / 深度）在历史轮次已逐条取证；
本轮按**最新代码**重验了三处收尾变动点（汇宗前置放宽 → 互逆闭环直接 200；`safeError` 系统级失败 500 化；`updateTrees` 失败侧缓存失效），**三处均按新代码成立**。
遗留的**未拍板口径**（§13-19 ~ §13-23）不属缺陷，见 §7。

## 2. 阶段一：边界与红线矩阵（27 条）

| # | 用例 | 结果 | 证据（响应关键行） | file:line |
|---|---|---|---|---|
| T1 | 立支 未登录 → 401 | **PASS** | POST /admin/establish-branch 无 token → 401 {'error': '请先登录后再进行编辑操作'} | index.js:1878-1879（establish-branch 路由内 authUser → 401） |
| T2 | 汇宗 未登录 → 401 | **PASS** | POST /admin/converge-clan 无 token → 401 {'error': '请先登录后再进行编辑操作'} | index.js:1916-1917（converge-clan 路由内 authUser → 401） |
| T3 | 立支 无写权（role=user）→ 403 | **PASS** | user token → 403 {'error': '立支需要本家族树主理人（tree_steward）或总编辑（chief_editor）权限'} | index.js:1884（权限判定 → 403） |
| T4 | 汇宗 非 chief_editor → 403 | **PASS** | user token → 403 {'error': '需要总编辑权限'} | index.js:1919（role !== chief_editor → 403） |
| T5a | 立支 缺 tree_id → 400 | **PASS** | 400 {'error': '缺少 tree_id'} | branch-clan-ops.js:516 |
| T5b | 立支 缺 person_handle → 400 | **PASS** | 400 {'error': '缺少 person_handle'} | branch-clan-ops.js:518 |
| T6 | 立支 树不存在 → 404 | **PASS** | 404 {'error': '家族树不存在'} | branch-clan-ops.js:525 / 530（fail(…,404)） |
| T7 | 立支 总谱 → 400 中华世本（总谱）不可立支 | **PASS** | 400 {'error': '中华世本（总谱）不可立支'} | branch-clan-ops.js:527 |
| T8 | 立支 祖谱 → 400 祖谱不可立支 | **PASS** | 400 {'error': '祖谱不可立支'} | branch-clan-ops.js:528 |
| T9 | 立支 N=镜像节点 → 400 | **PASS** | N=季花始祖镜像 10400594… → 400 {'error': '该节点是外树镜像节点，请到其真身所在家族树操作'} | branch-clan-ops.js:538-540（external_mirror → 400） |
| T10 | 立支 N=始祖节点 → 400 | **PASS** | N=I000209(季花, 即本树始祖位) → 400 {'error': '该节点是外树镜像节点，请到其真身所在家族树操作'} | branch-clan-ops.js:542 |
| T11 | 立支 无祖谱归属 → 400 | **PASS** | tree=liu_21016_01（无 clan_tree_id/无始祖镜像）→ 400 {'error': '请先为该家族建立或认祖宗谱'} | branch-clan-ops.js:546 / 549（clanAffiliationOf 为空） |
| T12 | 立支 祖谱落点为空 → 400 | **PASS** | tree=gu_39038_01（祖谱 gu_39038.founder_handle=""）→ 400 {'error': '该祖谱尚未设置认祖落点（founder_handle 为空），请先在祖谱内指定落点后再立支'} | branch-clan-ops.js:551-553（祖谱 founder_handle 为空） |
| T13 | 立支 节点不存在 → 404 | **PASS** | person_handle=999999 → 404 {'error': '节点不存在'} | branch-clan-ops.js:533 / 537（resolveNode 未命中 → 404） |
| T14 | 立支 籽不足 → 409 ASSET_INSUFFICIENT 且资产/树零变化 | **PASS** | 409 {'error': '资产不足，需 9999 颗石榴籽，当前 9998 颗', 'code': 'ASSET_INSUFFICIENT', 'need': 9999, 'current': 9998, 'unit': 'seeds', 'how_to_get': ['官方 9.9 元/束', '每日 21 点限量发售', '市集购买', '蓄能档位赠送（季度 1 束 / 半年度 2 束 /… | branch-clan-ops.js:614-623（charge 回调）+ lib/economy-fee.js:158-200（chargeLots → 409 ASSET_INSUFFICIENT）+ index.js:1874-1897（路由 catch → eco.errorPayload） |
| T15a | 汇宗 缺 confirm_people → 400 | **PASS** | 400 {'error': '缺少 confirm_people（请先展示将迁移的人数后再确认）'} | branch-clan-ops.js:798 |
| T15b | 汇宗 缺 target_person_id → 400 | **PASS** | 400 {'error': '缺少 target_person_id'} | branch-clan-ops.js:796 |
| T15c | 汇宗 源树不存在 → 404 | **PASS** | 404 {'error': '家族树不存在'} | branch-clan-ops.js:804 |
| T15d | 汇宗 源树=总谱 → 400 | **PASS** | 400 {'error': '中华世本（总谱）不可汇宗'} | branch-clan-ops.js:806 |
| T15e | 汇宗 源树=祖谱 → 400 | **PASS** | 400 {'error': '祖谱不可汇宗'} | branch-clan-ops.js:807 |
| T15f | 汇宗 源树始祖非祖谱镜像 → 400 | **PASS** | tree=liu_21016_01 → 400 {'error': '该家族树当前始祖不是祖谱节点镜像，无法汇宗（请先为该家族认祖宗谱）'} | branch-clan-ops.js:818-826 |
| T15g | 汇宗 跨树红线（源树真实节点被他树引用）→ 409 | **PASS** | 409 {'error': '该节点及其子树在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再汇宗；涉及：顾氏安达家族（gu_39038_01）「顾景月」（跨树婚姻镜像）、顾氏安达家族（gu_39038_01）「季清昆」（跨树婚姻镜像）、顾氏安达家族（gu_39038_01）「季庭亦」（跨树子女镜像） 等共 7 处'} | branch-clan-ops.js:848（assertNoExternalRefs status 409） |
| T16 | 汇宗 目标解析不到 → 404 | **PASS** | 404 {'error': '找不到编号/句柄为「XXXX」的节点'} | branch-clan-ops.js:830 |
| T17 | 汇宗 目标=本树节点 → 400 | **PASS** | target gi 编号在本树 → 400 {'error': '汇宗目标须是另一棵普通家族树中的普通节点'} | branch-clan-ops.js:831 |
| T18 | 汇宗 目标=祖谱节点 → 400 | **PASS** | target=祖谱季花 → 400 {'error': '汇宗目标须是另一棵普通家族树中的普通节点'} | branch-clan-ops.js:832-834 |
| T19 | 汇宗 目标=总谱节点 → 400 | **PASS** | target=zhonghua 真身节点 handle=103ff0f6b1ed7939f4b3b1e7c9a1 → 400 {'error': '汇宗目标须是另一棵普通家族树中的普通节点'} | branch-clan-ops.js:832-834 |
| T20 | 立支 跨树引用红线 → 400 且参与树零写入 | **PASS** | N=I000254季清昆（链含被引用 ['shen_27784_01:季志全']） → 400 {'error': '该节点及其上级链在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再立支；涉及：沈氏临沂家族（shen_27784_01）「沈伟」（跨树婚姻镜像）、沈氏临沂家族（shen_27784_01）「季志全」（跨树婚姻镜像）'} \| md5 差异 [] | branch-clan-ops.js:568-575（立支体检 status 400） |

> 阶段一 27 条全部 PASS（`/tmp/qa/results.json`；命令与断言见 `/tmp/qa/phase1.py`）。

## 3. 阶段二：立支正例（12 条）

| # | 用例 | 结果 | 证据（响应关键行） | file:line |
|---|---|---|---|---|
| T21a | 立支 出参（ok/新树/上移计数/founder/fee/warnings 缺省） | **PASS** | POST /admin/establish-branch {tree_id:ji_23395_01, person_handle:103f95b87f372febd70dfa47d487} → 200 {"ok": true, "original_tree_id": "ji_23395_01", "new_tree_id": "ji_23395_02", "moved_ancestors": 24… | branch-clan-ops.js:720-742（出参组装；`warnings` 仅非空时携带） |
| T21b | 立支 原树保留 N 及其全部后代、上移链已摘除 | **PASS** | 原树人数 90 → 66（差 24，期望 24）；N 及后代 1 个全部在树内=True；上移链 24 个已不在=True | branch-clan-ops.js:311（planAncestorChainMove 计数）+ 635-672（就地摘除） |
| T21c | 立支 原树始祖回写为 N（tree-meta + 树 JSON 顶层） | **PASS** | meta.trees[ji_23395_01]: founder_handle=103f95b87f372febd70dfa47d487 founder_gramps_id=I000250 founder_name=季梦童 founder_state=False；树 JSON founder_gramps_id=I000250 | branch-clan-ops.js:635-660（updateTrees 内原树始祖回写） |
| T21d | 立支 上移链挂到祖谱自有段落点（季花）之下 | **PASS** | chain_top=104005911bbaa2edb7dc17b9dc0 parent_family=92e5b808173816ef751e2b62 fam.father=3c95530f8bd4f84dc0b87edc kids=1；祖谱人数 2→28（期望 +24+2 登记） | branch-clan-ops.js:635-660（宗谱落点挂接） |
| T21e | 立支 换树不换号：handle 与 gramps_id 逐字不变 | **PASS** | 上移 24 人 handle 全在祖谱=True；随迁 24 家族 handle 全在=True；gramps_id 变化项=[]（逐字比对快照） | branch-clan-ops.js:586-593（镜像铸新 handle；真身编号不变） |
| T21f | 立支 详情文档随迁（显式改 _id：旧键不存在 / 新键在且 tree_id 正确） | **PASS** | 旧键残留=0；新键 ji_23395:<handle> 命中 24/24，tree_id/handle 不正确=0；details 文件数 288 → 289 | branch-clan-ops.js:650-680（saveDetail 显式改 _id + deleteDetail 旧键） |
| T21g | 立支 新树仅 1 个始祖镜像节点（无其它真实节点） | **PASS** | 新树 ji_23395_02: people=1 families=0；mirror={ext_mirror:true, link_type:founder, ext_ph:103f95b87f372febd70dfa47d487, ext_tree:ji_23395_01, gramps_id:I000295, name:季梦童}；顶层 founder_gramps_id=I000295 | branch-clan-ops.js:604-612（新树 people 仅 1 个镜像） |
| T21h | 立支 祖谱两条 N 登记镜像（原树 / 新树各 1） | **PASS** | 命中 2 条：[('I000296', 'ji_23395_01', '103f95b87f372febd70dfa47d487', '「季梦童」（季氏费县白露家族 · 立支登记）'), ('I000297', 'ji_23395_02', 'ea2d8ce709e8a8a24711ec71', '「季梦童」（季氏费县白露家族 · 季梦童支 · 立支登记）')] | branch-clan-ops.js:594-603（祖谱两条登记镜像） |
| T21i | 立支 支系入口列表：登记镜像 +2（去重后入口 1→2） | **PASS** | clan-info branches ['ji_23395_01'] → ['ji_23395_01', 'ji_23395_02']；登记镜像 2 条（原树被残留始祖镜像与登记镜像双路径命中、按 tree_id 去重，见规格 §13-22） | lib/clan.js（listClanBranches 推导 + tree_id 去重） |
| T21j | 立支 扣 9999 籽（FIFO 最早到期批次 sl_qa_1）+ 流水 Tx 正确 | **PASS** | 籽 [9999, 5001](sum 15000) → {'sl_qa_1': 0, 'sl_qa_2': 5001}(sum 5001)；新增流水 1 条：{"id": "tx_mu53j8yx1rqjq", "ts": "2026-09-17T05:35:48.009Z", "type": "tree_create", "delta": {"seeds": -9999}, "ref": {"t… | lib/economy-fee.js:158-200（chargeLots FIFO 最早到期）+ branch-clan-ops.js:614-628 |
| T22 | 立支 同一请求重放 → 失败且不重复建树 / 不重复扣费 | **PASS** | 第二次同请求 → 400 {'error': '始祖节点本身不可立支'}；籽 5001 → 5001（同批次指纹 一致）；tree-meta 新增树=[]；trees 文件集合一致=True（10 个） | branch-clan-ops.js:577-581（nextTreeId 推导 → 重放撞已存在）+ 614-623（扣费在写库前，失败即冲正） |
| T23 | 立支 N=始祖节点（非镜像真身）→ 400 始祖节点本身不可立支 | **PASS** | 立支后 meta.founder_handle=N（真身）→ 再以 N 立支 → 400 {'error': '始祖节点本身不可立支'} | branch-clan-ops.js:541-542（始祖节点本身不可立支） |

> 阶段二在 `/tmp/qa/results.json` 中占 21 行（`T21a–T21i` 被同一套件执行两次 → 9 条重复行）、唯一 id 12 条；全部 PASS。
> 单测侧同步：`cloudfunctions/compat-api/lib/branch-clan-ops.test.js` 31 条（`node --test`），主代理亲跑 = **327 pass / 0 fail**（全量套件）。

## 4. 阶段三：汇宗正例 / 路径 / EACCES（历史 25 条）+ 本轮收尾重验（G* 10 条）

### 4-1 本轮收尾重验（G*）——**按最新代码重跑**

| # | 用例 | 结果 | 证据（命令 / 响应关键行） | 断言 | file:line |
|---|---|---|---|---|---|
| G1 | 互逆闭环①：立支产物 → 汇宗 **直接 200**（不认祖、不 detach/attach） | **PASS** | 立支 200 → 产物 ji_23395_02（始祖镜像 ext_tree=ji_23395_01 / link_type=founder / mirror=true）→ 直接汇宗 → 200；产物树文件消失=True；tree-meta 条目消失=True | 200 + ok:true（源树始祖指向原树普通节点亦放行） | lib/branch-clan-ops.js:811-826（放宽为「是上层镜像」） |
| G2 | 互逆闭环②：产物真实节点回到立支点之下 + 产物树文件/meta 条目消失 + 换树不换号 | **PASS** | 产物真实节点 dcd8f3f86495d5ec3cd93af6（季季收尾）现落在原树 parent_family=d803e98a65ad9779755d8da2（father=103f95b87f372febd70dfa47d487 / mother=）；handle 逐字不变=True；gramps_id=I000298 | child ∈ 原树 people；其 parent_family 的 father/mother = 立支点 103f95b87f372febd70dfa47d487；handle/gramps_id 不变 | lib/branch-clan-ops.js:860-869 + applyConvergeMove |
| G3 | 旧口径回归：源树始祖**不是上层镜像** → 仍 400 | **PASS** | （副本夹具）tree-meta.trees[shen_27784_01].founder_handle := 103f95b86f98dd5f705a545ce84（普通节点，非镜像）→ POST /api/admin/converge-clan {tree_id:shen_27784_01, target_person_id:103f95b87a52368e3de1c6fe1732, confirm_people:9} → 400 {"error": "该家族树当前始祖不是上层镜像，无法汇宗"} | 400 + 「该家族树当前始祖不是上层镜像，无法汇宗」 | lib/branch-clan-ops.js:818-826 |
| G4 | 祖谱路线回归：认祖到祖谱后汇宗仍 **200**（旧路径未被放宽破坏） | **PASS** | 立支 200（产物 ji_23395_02）→ detach-founder 200 → attach-founder(祖谱 季花) 200（始祖 ext_tree=ji_23395）→ 汇宗 200 {"ok": true, "source_tree_id": "ji_23395_02", "target_tree_id": "ji_23395_01", "target_handle": "103f95b87f372febd70dfa47d487", "moved_people": 1, "moved_families": 0, "spirit": {"ratio": 0.5, "source_days_left": 0, "transferred_days": 0, "target_spirit_expires_at": null, "skipped_reason": "源树未镶嵌石榴籽玉，无灵气可折损"}} | attach-founder 200 + 始祖 ext_tree=ji_23395 + converge 200 + 产物树消失 | lib/branch-clan-ops.js:811-826（祖谱分支保留） |
| G5 | safeError 复验：三站点 EACCES → 500 + 「服务内部错误」+ 响应体无 EACCES / 本机绝对路径 | **PASS** | 立支 / 写宗谱树：chmod 0444 trees/ji_23395.json → establish-branch → 500 {"error": "服务内部错误", "status": 500, "fee_refunded": true}；汇宗 / 删树阶段：chmod 0555 trees/ → converge-clan → 500 {"error": "服务内部错误"}；跨树加子女 /admin/add-child：chmod 0444 trees/ji_23395_01.json → add-child(真身树) → 500 {"error": "服务内部错误", "status": 500} | 500 + {"error":"服务内部错误"}（无 /Users/·/private/·/tmp/·EACCES） | index.js:311-319（safeError）+ 479/499/1059/1085/1179/1267/1320/1394/1477/1550/1620/1645/173… |
| G6 | updateTrees 回归①：跨树加子女失败（真身树 0444）→ 已落盘侧回滚 + 未落盘侧缓存失效，无幻影 | **PASS** | chmod 0444 trees/ji_23395_01.json → POST /admin/add-child {tree_id:gu_39038_01, person_handle:004d145b7d78e51c92cbfbb0(季清昆镜像), name:季幻影} → 500 {"error": "服务内部错误", "status": 500} \| gu_39038_01 API/磁盘 people 一致=True；ji_23395_01 API/磁盘一致=True；幻影 handle：[] / []；幻影姓名命中=[]；两侧 people 结构 md5 复原=True/True | 500 + 两侧 API 读 == 磁盘读（新子节点 handle 在两侧都不存在）+ 两侧 people 结构逐字复原 | lib/store.js:463-485（未落盘侧 treeCache.delete + eventIndexCache.delete）；消费方 lib/child-write.j… |
| G7 | updateTrees 回归②：婚姻（marry-end/applyMarriageEnd）失败 → 两侧缓存与磁盘一致，结构零脏写 | **PASS** | chmod 0444 trees/ji_23395_01.json → POST /admin/marry-end {tree_id:gu_39038_01, person_handle:004d145b7d78e51c92cbfbb0(季清昆镜像, gender=M, external_marriage_id 存在)} → 500 {"error": "服务内部错误", "status": 500} \| gu_39038_01 API/磁盘一致=True；ji_23395_01 一致=True；幻影：[] / []；镜像节点结构逐字未变=True；真身结构逐字未变=True；tree-meta 未变=True | 500 + 两侧 API == 磁盘 + 镜像/真身节点与 tree-meta 逐字节复原 | lib/store.js:463-485；消费方 index.js:1294-1317 + lib/marriage.js:applyMarriageEnd |
| G8 | updateTrees 回归③：成功路径行为未变（跨树加子女 200：真身树建真实节点 + 发起树建镜像子节点；绝婚 200：两侧婚姻字段清空） | **PASS** | POST /admin/add-child {tree_id:gu_39038_01, person_handle:004d145b7d78e51c92cbfbb0(季清昆镜像), name:季成功} → 200 {"ok": true, "cross_tree": true, "landed_tree_id": "ji_23395_01", "message": "「季季成功」已建到「季清昆」真身所在家族树（ji_23395_01），本树保留镜像子女"} \| child_handle=bbea7fca03ab26a4e9fcef5f ∈ 真身树(ji_23395_01)=True 且为真实节点=True；mirror_handle=a9afb75c2ebf7fa64a201950 ∈ 发起树(gu_39038_01) 且 external_mirror=true=True；发起树内同名节点=['a9afb75c2ebf7fa… | 200/200；child_handle ∈ 真身树 ji_23395_01（真实节点）；mirror_handle ∈ 发起树 gu_39038_01（external_mirror=true）；landed_tree_id=ji_23395_01；绝婚两侧 external_marriage_id 清空 | lib/child-write.js:185-320（ids=[treeId, remoteTreeId] 单事务）；index.js:1294-1317 + lib/marria… |
| G9 | 汇宗 §13-23：目标树持有源树节点镜像 → 仍 **409**（现状未变） | **PASS** | POST /admin/converge-clan {tree_id:ji_23395_01, target_person_id:103f95b8791642f429d49388e158(顾纯江@gu_39038_01), confirm_people:87} → 409 {"error": "该节点及其子树在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再汇宗；涉及：顾氏安达家族（gu_39038_01）「顾景月」（跨树婚姻镜像）、顾氏安达家族（gu_39038_01）「季清昆」（跨树婚姻镜像）、顾氏安达家族（gu_39038_01）「季庭亦」（跨树子女镜像） 等共 7 处"} \| 全量阻断方 7 条（其中目标树 gu_39038_01 自身 4 条）：[{"tree_id": "gu_39038_01", "label": "顾氏安达家族", "handle": "103f95b878ee57… | 409 + 阻断方清单（含目标树自身指向源树节点的镜像） | lib/branch-clan-ops.js:460-484（refRefusal 只列前 3）+ lib/tree-write.js:1475-1511（scanExternal… |
| G10 | 前端类型检查：vue-tsc --noEmit（frontend，未起任何前端端口） | **PASS** | cd frontend && npx vue-tsc --noEmit → 无任何诊断输出；exit code = 0（原始日志 /tmp/qa-ev/vue-tsc.log） | exit code 0 + 0 条类型错误 | frontend/tsconfig.json + vue-tsc（只做类型检查，未启动 dev server） |

### 4-2 历史阶段三（28 行 / 25 条唯一 id）

| # | 用例 | 磁盘记录 | 报告口径 | 证据（摘要） |
|---|---|---|---|---|
| P1 | 立支→汇宗路径①：立支成功产出新树 | PASS | 同上 | POST /api/admin/establish-branch {tree_id:ji_23395_01, person_handle:103f95b87f372febd70dfa47d487} → 200 {"ok": true, "original_tree_id": "ji_23395_01", "new_tree_id": "ji_23395_02", "moved_ancestors"… |
| P2 | 立支→汇宗路径②：给新树加一个真实节点 | PASS | 同上 | POST /api/admin/add-child {tree_id:ji_23395_02, person_handle:fad76f074551d8185dddc29f(mirror), name:季测试} → 200 {"ok": true, "tree_id": "ji_23395_02", "person_handle": "fad76f074551d8185dddc29f", "chi… |
| P3 | 立支→汇宗路径③：不加认祖 → 400（口径问题取证） | PASS | **PASS/已过期**（上轮为「口径取证」（400）；本轮实现放宽后同一路径直接 200，见 §4 G1/G2） | POST /api/admin/converge-clan {tree_id:ji_23395_02, target_person_id:103f95b87f372febd70dfa47d487(=ji_23395_01 树内普通节点), confirm_people:1} → 400 {"error": "该家族树当前始祖不是祖谱节点镜像，无法汇宗（请先为该家族认祖宗谱）"} |
| P4 | 立支→汇宗路径④：新树认祖到祖谱（attach-founder） | FAIL | **PASS**（上轮 FAIL 原因为「已认祖 → 再认祖 400」的实现口径；本轮不再需要该步（立支产物始祖本就是镜像，直接汇宗 200），用例失效，见 §4 G1） | POST /api/admin/attach-founder {tree_id:ji_23395_02, target_tree_id:ji_23395, target_handle:3c95530f8bd4f84dc0b87edc(季花)} → 400 {"error": "该家族树已认祖，请先解除挂载"} \| 新树始祖节点 now: ext_tree=ji_23395_01 link_typ… |
| P5 | 立支→汇宗路径⑤：认祖后汇宗成功（整树并入） | FAIL | **PASS**（上轮 FAIL 后经 P4b/P4c（detach→attach）通过；本轮新代码免 detach，直接 200，见 §4 G1） | POST /api/admin/converge-clan {tree_id:ji_23395_02, target_person_id:103f95b87f372febd70dfa47d487, confirm_people:1} → 400 {"error": "该家族树当前始祖不是祖谱节点镜像，无法汇宗（请先为该家族认祖宗谱）"} \| 新树条目/文件消失=False；目标树人数 66→66… |
| P4b | 立支→汇宗路径④b：解除挂载（新树始祖镜像指向的是原树而非祖谱） | PASS | 同上 | POST /api/admin/detach-founder {tree_id:ji_23395_02, person_handle:fad76f074551d8185dddc29f(新树始祖镜像, external_tree=ji_23395_01)} → 200 {"ok": true, "tree_id": "ji_23395_02", "founder_handle": "fad76f07… |
| P4c | 立支→汇宗路径④c：解除挂载后可认祖到祖谱（此时汇宗前置才满足） | PASS | 同上 | POST /api/admin/attach-founder {tree_id:ji_23395_02, target_tree_id:ji_23395, target_handle:3c95530f8bd4f84dc0b87edc(季花)} → 200 {"ok":true,"founder_handle":"fad76f074551d8185dddc29f","master_handle":"… |
| C0 | 汇宗 跨树红线：源树真实节点被他树（含目标树）引用 → 409 拒绝，两侧零写入 | PASS | 同上 | POST /api/admin/converge-clan {tree_id:ji_23395_01, target_person_id:103f95b87d1656dbf4a6d177808(顾峰@gu_39038_01), confirm_people:87} → 409 {"error": "该节点及其子树在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再汇宗；… |
| C1 | 汇宗 出参（ok / 源树 / 目标树 / 目标节点 / 迁移人数 / 家族数） | PASS | 同上 | POST /api/admin/converge-clan {tree_id:ji_23395_01, target_person_id:103f95b87a52368e3de1c6fe1732(刘振宇), confirm_people:87} → 200 {"ok": true, "source_tree_id": "ji_23395_01", "target_tree_id": "liu_21… |
| C2 | 汇宗 整树迁移（人数 / 家族数）+ 源树树 JSON 与 tree-meta 条目消失 | PASS | 同上 | 目标树 people 19→106（期望 +87）；families 13→49（期望 +35 随迁 +1 落点新建）；trees/ji_23395_01.json 存在=False；tree-meta 含 ji_23395_01=False；源树 3 个镜像未随迁=True |
| C3 | 汇宗 详情文档随迁（旧键 0 残留 / 新键 tree_id=目标树）+ 源树镜像详情随树作废 | PASS | 同上 | details 文件数 288→286；旧键残留=0；新键 liu_21016_01:<handle> 命中 87/87；源树镜像详情残留=0 |
| C4 | 汇宗 落点家族（ensureParentFamily 复用顺序：目标节点无家族 → 新建 1 个并挂根） | PASS | 同上 | 落盘复评：目标树新建家族 36 个 = 随迁家族 35 + 落点新建 1；落点家族 de1f4426f1c6a8995dad8c79（father=103f95b87a52368e3de1c6fe1732 / mother='' / child_handles=40）在目标节点 spouse_families 内=True；源树真实段根 40 个全部改挂到落点家族=True（roots=['103… |
| C5 | 汇宗 灵气叠加顺延（目标树已镶嵌玉 → max(now,原值)+折损天数，精确到毫秒） | PASS | 同上 | spirit={"ratio": 0.5, "source_days_left": 10, "transferred_days": 5, "target_spirit_expires_at": "2026-09-25T05:41:32.000Z"}；期望 target_spirit_expires_at=2026-09-25T05:41:32.000Z（= 原值 2026-09-20T05:41:… |
| C6 | 汇宗 源树 jiazu_spirit 记录保留 + status='expired'（jade / 到期日 / 日志留痕） | PASS | 同上 | jiazu_spirit.trees[ji_23395_01] = {"jade": {"jade_id": "jade_qa_src", "mounted_at": "2026-01-01T00:00:00.000Z", "expires_at": null}, "spirit_expires_at": "2026-09-27T05:41:32.000Z", "buffer_until": nu… |
| C7 | 汇宗 0 片 0 籽（四类资产总分与流水逐字节不变、钱包文件 md5 不变） | PASS | 同上 | jiazu_assets.json md5 18f82adb0718 → 18f82adb0718（same）；四类资产 {'seeds': 15000, 'bamboos': 97, 'fragments': 1, 'jades': 0, 'txs': 6} → {'seeds': 15000, 'bamboos': 97, 'fragments': 1, 'jades': 0, 'txs': … |
| C8 | 汇宗 落点家族复用顺序（目标节点已有家族且对应槽位空着 → 复用，不新建） | PASS | 同上 | POST /api/admin/converge-clan {tree_id:gu_39038_01, target_person_id:103f95b8762b433c7159c8ea1006(沈克强@shen_27784_01), confirm_people:18} → 200 {"ok": true, "source_tree_id": "gu_39038_01", "target_tre… |
| C9 | 汇宗 目标树未镶嵌玉 → 灵气不并入（transferred_days=0 + skipped_reason），源树仍置 expired | PASS | 同上 | spirit={"ratio": 0.5, "source_days_left": 7, "transferred_days": 0, "target_spirit_expires_at": null, "skipped_reason": "目标树尚未镶嵌石榴籽玉（无凹槽），源树灵气不并入"}；目标树 jiazu_spirit 记录=None（未并入、不创建）；源树记录={"jade": {"ja… |
| E1a | 立支 写库阶段 EACCES → 500 + error='服务内部错误' + 不泄露 EACCES / 本机路径 + fee_refund… | PASS | 同上 | chmod 0444 trees/ji_23395.json → POST /api/admin/establish-branch → 500 {"error": "服务内部错误", "status": 500, "fee_refunded": true} |
| E1b | 立支 EACCES 后结构回滚（原树 / 宗谱 canon 逐字节等价）+ 新树文件回收 + tree-meta 不变 | PASS | 同上 | 原树 canon 相同=True；宗谱 canon 相同=True；tree-meta 相同=True；trees 目录 9 个文件，新增=[] |
| E1c | 立支 EACCES 后 9999 籽原路返回同一批次（批次指纹逐字节相等）+ 流水留痕 | FAIL | **PASS（复评）**（首轮 FAIL = 质检侧断言口径笔误（籽批次未按 id 排序比较 + 冲正流水顺序），/tmp/qa/phaseE1b.py 复评 PASS） | 籽批次 [('sl_qa_1', 9999), ('sl_qa_2', 5001)] → [('sl_qa_2', 5001), ('sl_qa_1', 9999)]（指纹相等=False）；资产文件 md5 18f82adb0718 → 7ded1d7dfca9（DIFF）；新增流水 2 条：[{"id": "tx_mu53secz1ubhp", "ts": "2026-09-17T05:42:… |
| E1d | 立支 EACCES 后两侧进程内缓存与磁盘一致（API 读 == 磁盘读，无幻影结构/无已回滚的上移链） | FAIL | **PASS（复评）**（首轮 FAIL = 质检侧断言未带 chief 凭据（guest 可见性过滤 50/90 被误判为缓存幻影），复评 PASS） | GET /api/people(X-Tree-Id:ji_23395_01) 50 个 handle vs 磁盘 90 个，一致=False；祖谱 API 1 / 磁盘 2，一致=False |
| E2a | 汇宗 删树阶段 EACCES → 500 + error='服务内部错误' + 不泄露 EACCES / 本机路径 | PASS | 同上 | chmod 0555 trees/ → POST /api/admin/converge-clan {tree_id:ji_23395_01, confirm_people:87} → 500 {"error": "服务内部错误"} |
| E2b | 汇宗 删树阶段失败 → 源树 tree-meta 条目回写 reconcile_state='empty_source_shell'（结构已… | PASS | 同上 | tree-meta.trees[ji_23395_01]={"tree_id": "ji_23395_01", "path_alias": "/ji_23395_01", "surname_char": "季", "display_title": "季氏费县白露家族", "hall_name": "暂无", "origin": "山东临沂费县新庄季家白露", "description": "祖籍山… |
| E3a | 汇宗 灵气写入阶段 EACCES → 500 + error='服务内部错误' + 不泄露 EACCES / 本机路径 | PASS | 同上 | chmod 0444 collections/jiazu_spirit.json → POST /api/admin/converge-clan {tree_id:ji_23395_01, confirm_people:87} → 500 {"error": "服务内部错误"} |
| E3b | 汇宗 灵气写入阶段失败 → 源树 tree-meta 条目回写 reconcile_state='empty_source_shell'；灵… | PASS | 同上 | tree-meta.trees[ji_23395_01].reconcile_state=empty_source_shell；jiazu_spirit.json md5 48a622cf6bc8 → 48a622cf6bc8（same）；源树树 JSON 已删=True；源树详情/结构：目标树人数=106 |

> 阶段三历史 25 条唯一用例（28 行，`C0` 重复 3 行）中，**磁盘上的 4 条 FAIL 全部已定性**：
> `P4`/`P5` = 实现口径缺陷（汇宗前置要求「始祖是祖谱镜像」，立支产物必须 detach→attach 才能汇宗）→ **本轮实现已放宽，见 §4-1 G1**；
> `E1c`/`E1d` = 质检侧断言笔误（未按 id 排序比较籽批次 / 未带 chief 凭据导致可见性过滤被误判为缓存幻影）→ `/tmp/qa/phaseE1b.py` 复评 PASS（注：该脚本只改内存未回写 results3.json，故磁盘仍是 FAIL，以本节为准）。

## 5. 明细表（阶段三历史用例逐条）

| # | 用例 | 结果 | 期望 | 实测 |
|---|---|---|---|---|
| P1 | 立支→汇宗路径①：立支成功产出新树 | PASS | 200 + new_tree_id + fee 9999 籽 | 200 {"ok": true, "original_tree_id": "ji_23395_01", "new_tree_id": "ji_23395_02", "moved_ancestors": 24, "moved_families": 24, "founder": {"handle": "… |
| P2 | 立支→汇宗路径②：给新树加一个真实节点 | PASS | 新树出现 ≥1 个 external_mirror!=true 的真实节点 | ['dfaadfd3b704d8cda6d1e853'] |
| P3 | 立支→汇宗路径③：不加认祖 → 400（口径问题取证） | PASS | 400 + 「该家族树当前始祖不是祖谱节点镜像，无法汇宗（请先为该家族认祖宗谱）」 | 400 该家族树当前始祖不是祖谱节点镜像，无法汇宗（请先为该家族认祖宗谱） |
| P4 | 立支→汇宗路径④：新树认祖到祖谱（attach-founder） | FAIL | 200 + 始祖节点 external_tree=ji_23395 / external_mirror=true | 400 ext_tree=ji_23395_01 |
| P5 | 立支→汇宗路径⑤：认祖后汇宗成功（整树并入） | FAIL | 200 + 源树条目/树 JSON 消失 + 真实节点进目标树 | 400 gone=False moved=[] |
| P4b | 立支→汇宗路径④b：解除挂载（新树始祖镜像指向的是原树而非祖谱） | PASS | 200 + 始祖节点 external_* 被清除 | 200 ext_tree='' |
| P4c | 立支→汇宗路径④c：解除挂载后可认祖到祖谱（此时汇宗前置才满足） | PASS | 200 + external_tree=ji_23395 / external_mirror=true / external_link_type=founder | ext_tree=ji_23395 mirror=true |
| C0 | 汇宗 跨树红线：源树真实节点被他树（含目标树）引用 → 409 拒绝，两侧零写入 | PASS | 409 + 「该节点及其子树在其它家族树中存在关联…请先解除关系后再汇宗」 | 409 |
| C1 | 汇宗 出参（ok / 源树 / 目标树 / 目标节点 / 迁移人数 / 家族数） | PASS | 200 + moved_people=87 + moved_families=35 + target_tree_id=liu_21016_01 + target_handle=103f95b87a52368e3de1c6fe1732 | 200 {"ok": true, "source_tree_id": "ji_23395_01", "target_tree_id": "liu_21016_01", "target_handle": "103f95b87a52368e3de1c6fe1732", "moved_people": 8… |
| C2 | 汇宗 整树迁移（人数 / 家族数）+ 源树树 JSON 与 tree-meta 条目消失 | PASS | people += 87；families += 35（源树家族）+1（新建落点家族）；源树树 JSON 与 meta 条目均消失；镜像随树作废 | people 19→106 families 13→49 gone_json=True meta_gone=True moved=True mirror_gone=True |
| C3 | 汇宗 详情文档随迁（旧键 0 残留 / 新键 tree_id=目标树）+ 源树镜像详情随树作废 | PASS | 旧键 0 残留；87 个新键存在且 tree_id=liu_21016_01；镜像详情 0 残留 | old_left=0 new_ok=87 mirror_left=0 |
| C4 | 汇宗 落点家族（ensureParentFamily 复用顺序：目标节点无家族 → 新建 1 个并挂根） | PASS | 新建家族数 = 随迁家族数 + 1（落点新建）；落点家族 father_handle=刘振宇 / mother_handle="" 并进入 spouse_families；源树真实段根全部挂其下 | new_fams=36 (land=1) roots_ok=True |
| C5 | 汇宗 灵气叠加顺延（目标树已镶嵌玉 → max(now,原值)+折损天数，精确到毫秒） | PASS | ratio=0.5 / source_days_left=10 / transferred_days=5 / target=原值+5 天（毫秒级相等）/ status=active / buffer_until=null | ratio=0.5 days_left=10 transferred=5 tgt=2026-09-25T05:41:32.000Z disk=2026-09-25T05:41:32.000Z status=active |
| C6 | 汇宗 源树 jiazu_spirit 记录保留 + status='expired'（jade / 到期日 / 日志留痕… | PASS | 记录保留 / status="expired" / jade 与 spirit_expires_at 原样保留 | {"jade": {"jade_id": "jade_qa_src", "mounted_at": "2026-01-01T00:00:00.000Z", "expires_at": null}, "spirit_expires_at": "2026-09-27T05:41:32.000Z", "b… |
| C7 | 汇宗 0 片 0 籽（四类资产总分与流水逐字节不变、钱包文件 md5 不变） | PASS | 资产文件 md5 逐字节不变；四类资产总分相同；流水条数不变；钱包 md5 不变 | assets_same=True fp_same=True tx=6→6 wallet_same=True |
| C8 | 汇宗 落点家族复用顺序（目标节点已有家族且对应槽位空着 → 复用，不新建） | PASS | 目标树 families 增量 == 源树随迁家族数（0 新建）；目标节点家族列表不变；people += 18 | new_fams=6 moved=18 |
| C9 | 汇宗 目标树未镶嵌玉 → 灵气不并入（transferred_days=0 + skipped_reason），源树仍置… | PASS | source_days_left=7 / transferred_days=0 / target_spirit_expires_at=null / skipped_reason=「目标树尚未镶嵌石榴籽玉（无凹槽），源树灵气不并入」/ 源树 status="expired" | {"ratio": 0.5, "source_days_left": 7, "transferred_days": 0, "target_spirit_expires_at": null, "skipped_reason": "目标树尚未镶嵌石榴籽玉（无凹槽），源树灵气不并入"} |
| E1a | 立支 写库阶段 EACCES → 500 + error='服务内部错误' + 不泄露 EACCES / 本机路径 + … | PASS | 500 + {"error":"服务内部错误", ... "fee_refunded":true}（响应体不含 EACCES / /tmp） | 500 {"error": "服务内部错误", "status": 500, "fee_refunded": true} |
| E1b | 立支 EACCES 后结构回滚（原树 / 宗谱 canon 逐字节等价）+ 新树文件回收 + tree-meta 不变 | PASS | 两树结构与 tree-meta 与失败前一致；无孤儿新树文件 | same=True/True/True new=[] |
| E1c | 立支 EACCES 后 9999 籽原路返回同一批次（批次指纹逐字节相等）+ 流水留痕 | FAIL | 籽批次 id/qty/到期日逐字节等于失败前（sl_qa_1=9999, sl_qa_2=5001）；资产文件 md5 不变 | lots_same=False new_tx=2 |
| E1d | 立支 EACCES 后两侧进程内缓存与磁盘一致（API 读 == 磁盘读，无幻影结构/无已回滚的上移链） | FAIL | 两侧 API 读与磁盘读 handle 集合完全一致 | src_same=False clan_same=False |
| E2a | 汇宗 删树阶段 EACCES → 500 + error='服务内部错误' + 不泄露 EACCES / 本机路径 | PASS | 500 + {"error":"服务内部错误"}（响应体不含 EACCES / /tmp） | 500 {"error": "服务内部错误"} |
| E2b | 汇宗 删树阶段失败 → 源树 tree-meta 条目回写 reconcile_state='empty_source_… | PASS | reconcile_state='empty_source_shell'；迁移结构保留（不回滚） | reconcile_state=empty_source_shell |
| E3a | 汇宗 灵气写入阶段 EACCES → 500 + error='服务内部错误' + 不泄露 EACCES / 本机路径 | PASS | 500 + {"error":"服务内部错误"}（响应体不含 EACCES / /tmp） | 500 {"error": "服务内部错误"} |
| E3b | 汇宗 灵气写入阶段失败 → 源树 tree-meta 条目回写 reconcile_state='empty_sourc… | PASS | reconcile_state='empty_source_shell'；jiazu_spirit.json 未被改写（EACCES 且缓存未换） | empty_source_shell |

## 6. 缺陷清单（含严重度与 file:line）

| # | 缺陷 | 严重度 | 发现轮次 | file:line | 现状 |
|---|---|---|---|---|---|
| D1 | **系统级失败（EACCES 等）经路由 catch 原样回显本机绝对路径与 errno**：`send(e.status || 400, { error: e.message })` → `EACCES: permission denied, open '/private/var/folders/…/trees/xx.json'`，与规格 §7 的 500 口径不一致 | 高（信息泄露 + 口径违约） | 阶段三 E1a/E2a/E3a | 旧 `index.js` catch（现被 `safeError` 取代：`index.js:276-319`） | **已修复**：新增 `safeError(e, fallbackStatus, prefix)`，系统级 errno / 本机路径 → `500` + `eco.INTERNAL_ERROR_TEXT`（`lib/economy-fee.js:424` = 「服务内部错误」），业务错误保留自身 status 与文案；已铺到 17 个写树 / 写集合站点（含 `/admin/add-child`）。本轮 G5 按新代码复验通过 |
| D2 | **`updateTrees` 失败时未落盘侧进程内缓存不失效**：`fn` 就地对脏改内存对象，回滚只复原「已落盘」一侧 → 同进程后续 `getTree` 读到盘上不存在的幻影结构（婚姻 / 跨树加子女 / 立支 / 汇宗共用本函数） | 高（跨树事务回滚不彻底，读侧幻影） | 阶段三 E1d 线索 | `lib/store.js:446-490`（修复点 `479-482`：`treeCache.delete(id)` + `eventIndexCache.delete(id)`） | **已修复**：本轮 G6（跨树加子女）/ G7（婚姻）注入 EACCES 后，两侧 API 读 == 磁盘读，无幻影 |
| D3 | **汇宗前置过严**：源树始祖必须指向「祖谱」，导致「立支 → 汇宗」互逆闭环不成立（立支产物始祖 mirrored 的是原树的普通节点）→ 用户必须 `detach-founder` → `attach-founder` 才能汇宗（多两步 + 中间态可被误操作） | 中（可用性 / 互逆性） | 阶段三 P3/P4/P5 | `lib/branch-clan-ops.js:811-826` | **已修复**：放宽为「是上层镜像」（`external_link_type="founder"` + `external_mirror="true"` + `external_tree` 非空且 ≠ 源树），祖谱或另一棵普通树均放行，文案 = 「该家族树当前始祖不是上层镜像，无法汇宗」；本轮 G1 直接 200 |
| Q1 | 质检侧断言口径笔误（非实现缺陷）：`E1c` 未按 id 排序比较籽批次（冲正会改变数组顺序）；`E1d` 未带 chief 凭据（guest 可见性过滤 50/90 被误判为缓存幻影）；`P3` 断言沿用旧文案「祖谱节点镜像」 | 低（质检工具问题） | 阶段三 | `/tmp/qa/phaseB*.py`、`/tmp/qa/phaseE1b.py` | 已定性 / 已复评，不计入实现缺陷 |

> 未发现新的实现缺陷：本轮 G* 全部按最新代码取值（见 §4-1），无回归。

## 7. 未覆盖项与口径风险

### 7-1 用例计数口径（必须先读）

- 派单口径「72 条」= **行计数**（阶段一 27 + 阶段二 21 + 阶段三 24）；
  实测磁盘记录为：阶段一 27 行、阶段二 21 行（`T21a–T21i` 被同一套件执行两次 → 9 条重复行，唯一 12）、**阶段三 28 行**（`C0` 重复 3 行、另含后补的 `P4b`/`P4c`，唯一 25）。
  → 派单的「阶段三 24」与磁盘的 28 行 / 25 唯一**均不一致**（推测为按「P1–P5 + C0–C9 + E1a–E1d + E2a/b + E3a/b」的分组近似，未计入 `P4b`/`P4c` 与 `C0` 的重复行）；本报告一律以磁盘记录为准，并双口径列出。
- 按**唯一 id** 去重：阶段一 27 + 阶段二 12 + 阶段三 25 = **64 条**（磁盘行计数 76 行）。本报告 §1 同时给出两个口径，避免以行计数冒充覆盖度。
- 本轮 G* 追加 **10 条**（唯一 id；其中 `G10` = `vue-tsc` 静态类型检查，非运行时用例）→ 唯一用例总数 = **74 条**（行计数 86 行）。
- 磁盘上的 4 条 FAIL（`P4`/`P5`/`E1c`/`E1d`）**均已定性**：`P4`/`P5` 的实现口径缺陷已被本轮改动消解（该两步用例本身不再需要，等价路径由 §4-1 `G1`/`G2` 覆盖）；`E1c`/`E1d` 为质检侧断言笔误，`/tmp/qa/phaseE1b.py` 复评 PASS（该脚本只改内存未回写 `results3.json`，故磁盘仍留 FAIL）。

### 7-2 未覆盖 / 未独立取证项

- **前端 UI 端到端**：未起前端端口、未用浏览器（派单约束）。立支 / 汇宗的前端落点（§9-1 ~ §9-3）只做了 `vue-tsc` 类型层校验，未验交互与文案渲染。
- **并发压力**：未做多请求并发（`treeWriteLocks` 串行化只做了单请求重放 T22）；`updateTrees` 的多树锁顺序 / 死锁面未压测。
- **云端数据源**：全程 `COMPAT_SOURCE=local` + 副本 JSON；CloudBase 分支的 `sdkCall` 路径（事务语义、乐观锁冲突重试）未验。
- **`tree-meta.json` 并发写**：本轮与历史轮次均为单实例串行操作，未验两个实例同时写 meta 的丢更新面。
- **§13-19 ~ §13-23 的「备选」实现路径**：只登记现状（见 §4-1 G9 + 本节 7-3），未按任一备选实现（属待拍板，非缺陷）。
- **修复后新路径的边界复用**：汇宗前置放宽后，「源树始祖镜像指向他树普通节点」这一新放行分支的**深度 / 世代语义**（跨到原树普通节点之下的世系计算）未单独取证。

### 7-3 待拍板口径风险（本轮仅登记，与 §13-19 ~ §13-23 对应）

**G9 阻断方全量清单**（复刻 `lib/tree-write.js:1475-1511` `scanExternalRefs` 的扫描口径：除源树外全部树 + tree-meta 始祖登记；源树 = `ji_23395_01`，其真实节点 87 个）：

| # | 阻断方所在树（tree_id） | 树名 | 阻断方节点编号（handle / gramps_id） | 节点名 | 归属路径 | 指向源树节点 |
|---|---|---|---|---|---|---|
| 1 | `gu_39038_01` | 顾氏安达家族 | `103f95b878ee57dc985ec7d9c97f` / I000140 | 顾景月 | 节点 `external_person_handle` | `7146eadb86a0af696614b36d` |
| 2 | `gu_39038_01` | 顾氏安达家族 | `004d145b7d78e51c92cbfbb0` / I000292 | 季清昆 | 节点 `external_person_handle` | `7146eadb86a0af696614b36d` |
| 3 | `gu_39038_01` | 顾氏安达家族 | `717f61816a317dff570be164` / I000293 | 季庭亦 | 节点 `external_person_handle` | `103f95b87cce41e76a2a24618702` |
| 4 | `gu_39038_01` | 顾氏安达家族 | `753f8a77dafb9728b0057327` / I000294 | 季季贺为 | 节点 `external_person_handle` | `103f95b87eae32faba04050101ed` |
| 5 | `shen_27784_01` | 沈氏临沂家族 | `103f95b86f98dd5f705a545ce84` / I000276 | 沈伟 | 节点 `external_person_handle` | `103f95b86f7c41b9ec482ae0799c` |
| 6 | `shen_27784_01` | 沈氏临沂家族 | `6fb875a1740942ae05e8b060` / I000285 | 季志全 | 节点 `external_person_handle` | `103f95b86f7c41b9ec482ae0799c` |
| 7 | `shen_27784_01` | 沈氏临沂家族 | `e775ed1f70955cc9f1f9b47a` / I000286 | 季清昆 | 节点 `external_person_handle` | `7146eadb86a0af696614b36d` |

**结论（§13-23 现状未变）**：汇宗 `ji_23395_01 → gu_39038_01`（目标节点 = 顾纯江 `103f95b8791642f429d49388e158`）**仍为 409**，响应体 = 「该节点及其子树在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再汇宗；涉及：顾氏安达家族（gu_39038_01）「顾景月」（跨树婚姻镜像）、顾氏安达家族（gu_39038_01）「季清昆」（跨树婚姻镜像）、顾氏安达家族（gu_39038_01）「季庭亦」（跨树子女镜像） 等共 7 处」。

- 阻断方共 **7 条**，其中**目标树自身**（`gu_39038_01`）**4 条** —— 即 §13-23 登记的口径问题点：目标树里指向源树节点的镜像（跨树婚姻 / 跨树子女镜像）**也被算作阻断方**，用户按提示「到对应家族树解除关系」时，要解除的恰恰是**目标树自己**的镜像（而汇宗本身就要把源树并入目标树，二者语义冲突）。

- 前端文案只列前 3 条 + 「等共 N 处」（`lib/branch-clan-ops.js:462-471` 的 `slice(0, 3)`），本表为**全量**（供拍板口径时逐条核对）。

### 相关待拍板口径（§13-19 ~ §13-23，本轮只登记现状）

| 条目 | 本轮实测现状 |
|---|---|
| §13-19 立支旁支处置（原树靠残留旧始祖镜像留父系） | 与历史轮次一致（历史轮次已取证：上移链 = 直系链，链顶连着始祖镜像的家族留在原树）；本轮未复跑 |
| §13-20 祖谱登记镜像副作用（不计入自有段 / 会进 mirrors / 重认祖即丢入口） | 同上（历史轮次取证：立支后祖谱 +2 条 `link_type=founder` 登记镜像） |
| §13-21 汇宗迁移「旁支断根 / 多根」 | 本轮 G1/G4 复现同一现象（`moved_families=0` 的小样本：产物真实节点挂到落点新建家族之下，非原父系家族）；历史轮次已用 `planConvergeMove` 纯函数用例取证 |
| §13-22 立支后原树残留旧始祖镜像（入口双路径） | 同上（历史轮次取证：`listAttachedTrees` 只返回原树、`listClanBranches` 去重后入口仍 2） |
| §13-23 汇宗红线把「目标树自身指向源树的镜像」算作阻断 | **本轮取证：仍为 409；本次该 409 的阻断方共 7 条，其中目标树自身 4 条（见上表）** |

## 8. 真源归因（md5）

开工前基线：`md5 -r config/tree-meta.json migrate-output/trees/*.json migrate-output/details/*.json migrate-output/collections/*.json`
→ 存于 `/tmp/qa-ev/md5-baseline.txt`（309 行）。收工后同命令存于 `/tmp/qa-ev/md5-after.txt`。

| 项 | 工前 | 工后 | 结论 |
|---|---|---|---|
| 指纹文件数 | 309 | 309 | 一致 |
| `migrate-output/**`（308 个文件） | — | — | **逐字节不变（0 处变化）** |
| `config/tree-meta.json` | `7baa9a8e6212` | `7baa9a8e6212` | **未变** |

## 9. 环境与清理

- 自起实例：`:3450`（API，`COMPAT_OUT_DIR=/tmp/qa-bco`）；**收工前已 kill**（见 `/tmp/qa-ev/cleanup.txt`）。
- 未触碰 `:3100` / `:5199`（用户自己的开发实例），未起任何前端端口。
- 工作副本：`/tmp/qa-bco`（每轮夹具由 `/tmp/qa/setup.py` / `/tmp/qa/h3.py reset_copy()` 从 `/tmp/qa-pristine` 重建）；实例运行期 chmod 均为副本内文件，收工前已恢复 `0644`。
- 真源写操作：**0 次**（`migrate-output/**` 逐字节不变 ⇒ 见 §8）；`config/tree-meta.json` 若变 ⇒ 逐字段归因（§8）。
- 本轮修改的唯一文件：`docs/branch-clan-ops.qa.md`（本报告）。未改实现 / 测试 / 规格。

