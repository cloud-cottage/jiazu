# 家族历史数字馆 (jiazu)

多姓氏、多支派家谱数字化展示平台。

底层支撑 Gramps-Web 多 Tree 家谱内核，Vue3/uni-app 外殼，一套代码同时编译 H5 网页与微信小程序。

## 技术栈

| 模块 | 选型 |
|------|------|
| 家谱内核 | Gramps-Web (Docker, multi-tree) |
| 前端 | uni-app (Vue3 + TypeScript + Vite) |
| 反向代理 | Nginx |
| 数据库 | SQLite (每 tree 独立) |
| 缓存 | Redis |
| 对象存储 | 腾讯云 COS (S3 兼容) |
| 容器编排 | Docker Compose |

## 目录结构

```
jiazu/
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

## 快速开始

### 前端开发

```bash
cd frontend
npm install
npm run dev:h5          # H5 网页开发
npm run dev:mp-weixin   # 微信小程序开发
```

### 后端启动

```bash
cp .env.example .env    # 编辑填入真实密钥
docker compose up -d
```

### 新增家族树

```bash
# 1. 生成 tree-id
node shell-scripts/gen-tree-id.mjs 季 01

# 2. 在 admin.jiazutong.cn 后台新建 tree，导入 .gramps

# 3. 更新 config/tree-meta.json，提交 git
```

## 许可证

个人研究项目，源码保留所有权利。
