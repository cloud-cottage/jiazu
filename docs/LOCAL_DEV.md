# 本地开发环境（macOS，不使用 Docker）

本地开发用 venv 直接跑 Gramps-Web API（生产环境仍用 docker-compose.yml）。

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
  .venv/bin/python scripts/run-gramps-webapi.py run -t '*' -p 8000
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
