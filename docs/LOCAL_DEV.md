# 本地开发环境（macOS，不使用 Docker）

> ⚠️ **Gramps-Web 已退出运行时链路（退役中）**：现在只有排查历史链路/做离线 `.gramps` 转换时才启动。
> **本地端口已于 2026-09 由 3000/8000 迁至 5197/5198**（auth-server **5197**、Gramps-Web **5198**，紧邻 jiazu 前端 5199）；**「退役中」的语义不变**。
> 日常开发只需 `compat-api(3100)` + 前端(5199)，见 `README.md` 快速开始。
> 前端默认代理已改指 3100；走本文件的 Gramps(5198)+auth-server(5197)（`dev:h5:legacy` 的 `API_PROXY=http://127.0.0.1:5197`）需 `npm run dev:h5:legacy`。
>
> ⚠️ **Node 版本陷阱（本机默认 node v18.19.0）**：v18 的 `fetch`/DNS 解析把 `localhost` **优先解析为 IPv6 `::1`**，而 **Gramps-Web 只绑 IPv4 `127.0.0.1`（5198）** → 症状是 **`ECONNREFUSED ::1:5198`**，auth-server（5197）侧则以 **502** 回落；**这不是服务没起，是地址写法问题**。
> - **解法一（推荐）**：上游地址一律写 **`http://127.0.0.1:5198`**——本机非生产链路**新增/新改**的引用（env / 脚本 / 注释 / 文档）**不再写 `localhost` 字面**（制度见 `ctrl/PORTS.md` §1 **(d)**）。
> - **解法二**：把运行这些脚本的 node 换成 **≥ 20**。
>
> ✅ **auth-server/.env 已按新端口更新**（`PORT=5197` / `GRAMPS_BASE_URL=http://127.0.0.1:5198`，Kevin 已授权）：现在**直接 `node auth-server/server.js` 启动即可，不再需要命令行覆盖** `PORT` / `GRAMPS_BASE_URL`；`.env` **其余行未动**。上游地址**统一为 `http://127.0.0.1:5198`**（不再用 `localhost` 字面）。
> ℹ️ 头部第 6 行已按制度 (d) 对齐为 **`API_PROXY=http://127.0.0.1:5197`**（该行原为照录 `frontend/package.json` 的 `localhost` 字面）；`frontend/package.json` 的 `dev:h5:legacy` **现状值仍为 `localhost` 字面**，待实现侧（Kong）统一时随之更新——**头部引用块内已无 `localhost` 地址字面**（其余 `localhost` 字样均为解释 Node 陷阱的说明文字，非地址援引）。

本地开发用 venv 直接跑 Gramps-Web API（生产环境仍用 docker-compose.yml：**生产容器映射仍为 `127.0.0.1:8000:5000`，生产端口不变**——**本地 dev 端口 5198 ≠ 生产映射**，两者不得互推）。

## 首次安装

```bash
# 系统依赖（Homebrew）
brew install pkg-config cairo gobject-introspection cmake icu4c gtk+3 redis

# Python 环境
/opt/homebrew/bin/python3.11 -m venv .venv

# 安装 gramps-webapi（注意：包名无连字符）
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:/opt/homebrew/share/pkgconfig:/opt/homebrew/opt/icu4c/lib/pkgconfig"
export ICU_VERSION=78.3
export C_INCLUDE_PATH="/opt/homebrew/opt/icu4c/include"
export CPLUS_INCLUDE_PATH="/opt/homebrew/opt/icu4c/include"
.venv/bin/pip install --index-url https://pypi.tuna.tsinghua.edu.cn/simple gramps-webapi

# 补装缺失的运行时依赖（PYTHONPATH 干扰时会漏装）
.venv/bin/pip install click markupsafe
```

## 数据库迁移（用户库）

pip 包未打包 alembic 迁移目录，已从官方源码复制到 `gramps_config/alembic_users/`：

```bash
env -u PYTHONPATH GRAMPS_API_CONFIG="$(pwd)/gramps_config/config.cfg" \
  GI_TYPELIB_PATH="/opt/homebrew/lib/girepository-1.0" \
  .venv/bin/python scripts/run-alembic.py upgrade head
```

## 启动服务

```bash
env -u PYTHONPATH GRAMPS_API_CONFIG="$(pwd)/gramps_config/config.cfg" \
  GI_TYPELIB_PATH="/opt/homebrew/lib/girepository-1.0" \
  .venv/bin/python scripts/run-gramps-webapi.py run -t '*' -p 5198
```

## 创建用户

```bash
# 站点管理员（role 5，无 tree）
env -u PYTHONPATH ... .venv/bin/python scripts/run-gramps-webapi.py \
  --config gramps_config/config.cfg user add admin <pw> --role 5

# 访客用户（role 0，必须绑定 tree 的 UUID）
env -u PYTHONPATH ... .venv/bin/python scripts/run-gramps-webapi.py \
  --config gramps_config/config.cfg user add guest <pw> --role 0 --tree <tree-uuid>
```

注意：`--tree` 需要 tree 的内部 UUID（`GET /api/trees/` 返回的 `id` 字段），不是 tree-id。

## 踩坑记录（macOS 特有）

1. **`locale.textdomain` 缺失**：Homebrew/uv Python 编译时未启用 libintl。`scripts/run-gramps-webapi.py` 和 `scripts/run-alembic.py` 启动时注入最小补丁。
2. **GTK 对话框崩溃**：Gramps 创建数据库时弹 Gtk.Dialog，headless 下崩溃。启动脚本抑制 `Gtk.Dialog.run`。
3. **必须用 `env -u PYTHONPATH`**：本机全局 PYTHONPATH 指向 Hermes venv，会干扰依赖解析。
4. **数据库目录**：脚本设置 `GRAMPS_DATABASE_PATH=gramps_data/grampsdb` 并预创建（Gramps 的 `os.mkdir` 不建父目录）。
5. **官方 pip 包缺 alembic 目录**：从源码复制到 `gramps_config/alembic_users/`。
