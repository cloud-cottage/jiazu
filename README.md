# 家族历史数字馆 (jiazu)

多姓氏、多支派家谱数字化展示平台。

底层支撑 Gramps-Web 多 Tree 家谱内核，uni-app 前端外壳（一套代码编译 H5 网页与微信小程序），
**手机号 + 短信验证码**认证（无密码），面向公众开放注册的企业化运营模式。

## 技术栈

| 模块 | 选型 |
|------|------|
| 家谱内核 | Gramps-Web (Docker, multi-tree) |
| 前端 | uni-app (Vue3 + TypeScript + Vite) |
| 认证层 | auth-server (Node.js 零依赖，手机号验证码 + JWT) |
| 反向代理 | Nginx |
| 数据库 | SQLite (每 tree 独立) |
| 缓存 | Redis |
| 对象存储 | 腾讯云 COS (S3 兼容) |
| 短信 | 腾讯云 SMS（开发阶段控制台打印验证码） |
| 容器编排 | Docker Compose |

## 目录结构

```
jiazu/
├── cloudfunctions/compat-api/  # 运行时后端：自有数据层兼容层 API（本地 3100 / 云端 CloudBase）
│   ├── index.js                #   路由（输出 Gramps Web API 形状 → 前端零改动）
│   └── lib/                    #   store（树 JSON/详情/集合）/ tree-write（写路径）/ scope / tree-access
├── migrate-output/             # 树 JSON（结构真源）+ 人物详情（档案真源）+ 模拟集合
├── frontend/          # uni-app 前端（H5 + 微信小程序）
│   └── src/
│       ├── business/  # 纯业务逻辑（跨端复用）
│       ├── pages/     # 页面组件
│       └── api/       # API 封装
├── auth-server/       # 【遗留】手机号验证码认证代理 (Node.js, 3000 → Gramps)，功能已迁入 compat-api
├── docker-compose.yml # 【遗留】Gramps-Web 部署编排
├── config/            # tree-meta.json 元数据（git seed）
└── scripts/           # 迁移/导入导出/修复脚本
```

## 运行时架构（自有数据层）

```
用户 (手机号 + 验证码)
      │
      ▼
前端 (uni-app, 5199)  ──/api──▶  compat-api（本地 3100 / 云端 CloudBase 云函数）
                                      │
                                      ├── 树 JSON      trees/<tree_id>.json（结构真源，version 乐观锁）
                                      ├── 人物详情      person_details（事件/媒体/引文/笔记/属性）
                                      └── 业务集合      jiazu_users / jiazu_wallets / jiazu_anchors / …
```

- 输出形状 = Gramps-Web API 形状（`RawPerson`/family/search），前端 `business/api.ts` 零改动。
- 标准格式导出/导入（GEDCOM 5.5.1）是**独立管线**，只读树 JSON + 详情，不依赖运行时存储：
  `node scripts/gedcom-export.mjs <tree_id>` / `node scripts/gedcom-import.mjs <tree_id> <input.ged>`。
- **Gramps-Web 正在退役**：不再作为运行时依赖，仅保留为离线 `.gramps` 转换/备份工具（`docs/LOCAL_DEV.md`）。
  剩余待补能力：媒体上传入 COS（建树已由 `POST /admin/create-tree` 覆盖，无需 Gramps 后台）。

## 快速开始

### 本地开发（两个服务）

```bash
# 1. 后端：自有数据层兼容层 API（读 migrate-output 树 JSON + 详情）
COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js 3100

# 2. 前端（vite 默认把 /api 代理到 3100）
cd frontend && npm run dev:h5   # http://localhost:5199（可用 PORT=5173 npm run dev:h5 改端口）
```

开发阶段验证码随 `POST /api/auth/send-code` 返回 `dev_code`（SMS_PROVIDER=console）。

> 仅在排查历史链路时才需要 Gramps-Web(8000) + auth-server(3000)：`npm run dev:h5:legacy`
> （Gramps 启动见 `docs/LOCAL_DEV.md`；该链路不支持新写能力，如总谱续编 / 生卒编辑）。

### 数据修复/一次性脚本

```bash
# 中华世本性别污染修复（上游缺省 gender=2 导致全标「女」）
node scripts/fix-zhonghua-gender.mjs            # dry-run
node scripts/fix-zhonghua-gender.mjs --apply

# 姓名结构体检 + 批量规整（「姓被填进名里」等；A/B/C 可自动，D/E 仅报告）
node scripts/audit-person-names.mjs             # 体检报告（--json 可导出全量）
node scripts/fix-person-names.mjs               # dry-run
node scripts/fix-person-names.mjs --apply

# 迁移产物上传云端（树 JSON → 云存储；详情/集合 → CloudBase）
CB_ENV=<envId> CB_KEY=<jwt-api-key> node scripts/upload-migrated-to-cloudbase.mjs
```

> 一次性修复脚本都支持 `COMPAT_OUT_DIR=<dir>` 指向数据副本，先在副本上演练再动真源。

### 后端启动（生产 Docker）

```bash
cp .env.example .env    # 编辑填入真实密钥
docker compose up -d
```

### 新增家族树

前端首页「＋ 新建家族树」（仅总编辑可见）→ 填姓氏 + 始祖名 → 服务端生成 tree_id（姓氏拼音_码点_序号）、
写树 JSON（含始祖 I0001）+ tree-meta 注册，并从发起人余额扣建树费（默认 ¥9.90，`PUT /admin/wallet-fee` 可调）。

接口直调（`POST /api/admin/create-tree`，chief_editor）：

```bash
curl -X POST http://localhost:3100/api/admin/create-tree \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"surname_char":"季","founder_name":"文子","founder_gender":"M","origin":"山东费县"}'
```

创建后即可在树内加人（普通加父/加子，或总谱续编）；批量导入旧谱仍用 `scripts/gedcom-import.mjs`（离线写树 JSON + 详情）。

### 树内操作（人物档案底部「谱系管理」）

| 操作 | 说明 |
|---|---|
| ＋ 添加父节点 / 子节点 | 姓默认随父姓（子）/随子姓（父），点「改姓」才解锁为特例；可同时录称号 |
| ＋ 添加配偶 | 同树配偶：本人已有家族则**补空位**，家族两槽已满则**新建家族**（再婚）；配偶姓独立填写 |
| ＋ 续编第 N 世 / 挂接已有节点（仅中华世本） | 源流链续编，世数 = 父节点世数 + 1；写 `external_chain_gen`，时间轴可见 |
| **编辑表单「父节点编号」（改挂上级）** | 填新父节点编号（`0054` / `I0054` 均可）→ 直接把本节点改挂到该节点家族下：槽位按新父节点性别（女→母位），原父母家族空则清理；总谱双方在链上时本人及下代世数按 delta 平移（`POST /admin/reparent`） |
| ⛔ 移除并新建家族树 | 仅总编辑（chief_editor） |

> 原【⛩ 晋宗】（`POST /admin/promote` / `promoteTree()`）**已整体移除**（2026-09-17 产品决策：路由、函数与前端入口一并删除），
> 「谱系管理」不再提供该操作；由【立支】/【汇宗】两条操作取代（规格待拍板后另行落地）。

称号三字段（`号` / `封号` / `谥号`）与姓名分离存储：录入、档案展示（姓名旁短标签 + 信息区三行）、
编辑、GEDCOM 导出（`封号→TITL`、`号→NICK`）全链路打通，规则见 `docs/data-model.md` §4。

中华世本（zhonghua）**世数 0 = 原始节点**（风华胥，风伏羲之母）：时间轴/树图根卡显示「原始」，其下可续编第 1 世；
链上下代世数由 `external_chain_gen` 属性承载，改父时按 delta 自动平移。

## 合规说明

企业化运营：开放注册，无密码（手机号验证码）。用户协议与隐私政策需在注册页展示。
