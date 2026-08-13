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
├── auth-server/       # 手机号验证码认证代理服务 (Node.js, 端口 3000)
│   └── server.js      #   验证码/注册/登录/JWT + 反向代理到 Gramps
├── frontend/          # uni-app 前端（H5 + 微信小程序）
│   └── src/
│       ├── business/  # 纯业务逻辑（跨端复用）
│       ├── pages/     # 页面组件
│       └── api/       # API 封装
├── docker-compose.yml # 后端服务编排
├── nginx/             # Nginx 配置
├── config/            # tree-meta.json 元数据
├── shell-scripts/     # 辅助脚本
└── gramps_db/         # SQLite 数据库目录
```

## 认证架构

```
用户 (手机号 + 验证码)
      │
      ▼
前端 (uni-app, 5173)
      │  /api/auth/* (注册/登录/发码)
      ▼
auth-server (Node.js, 3000)   ← 签发 JWT，7 天有效
      │  /api/* 代理 + 注入 Gramps 访客凭据
      ▼
Gramps-Web (8000)
```

- 无密码：手机号 + 短信验证码登录/注册
- 新用户默认 **guest 只读角色**，管理员审核后升级（编辑/管理）
- auth-server 持有 Gramps 凭据，前端不接触家谱数据库认证信息

## 快速开始

### 本地开发（三个服务）

```bash
# 1. Gramps-Web (venv 方式，见 docs/LOCAL_DEV.md)
env -u PYTHONPATH GRAMPS_API_CONFIG="$(pwd)/gramps_config/config.cfg" \
  GI_TYPELIB_PATH="/opt/homebrew/lib/girepository-1.0" \
  .venv/bin/python scripts/run-gramps-webapi.py run -t '*' -p 8000

# 2. auth-server
cd auth-server && set -a && source .env && set +a && node server.js

# 3. 前端
cd frontend && npm run dev:h5   # http://localhost:5173
```

开发阶段验证码由 auth-server 打印到控制台（并直接返回 dev_code 便于调试）。

### 后端启动（生产 Docker）

```bash
cp .env.example .env    # 编辑填入真实密钥
docker compose up -d
```

### 新增家族树

```bash
# 1. 生成 tree-id
node shell-scripts/gen-tree-id.mjs 季 01

# 2. 在 admin 后台新建 tree，导入 .gramps

# 3. 更新 config/tree-meta.json，提交 git
```

## 合规说明

企业化运营：开放注册，无密码（手机号验证码）。用户协议与隐私政策需在注册页展示。
