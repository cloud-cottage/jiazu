#!/usr/bin/env python3
"""jiazu 本地启动脚本 — Gramps-Web API

macOS 本地开发环境适配:
1. Homebrew/uv Python 未启用 libintl → locale.textdomain 缺失，补齐最小实现
2. Gramps 创建数据库时弹 GTK 对话框 → web 模式下抑制（headless 兼容）

用法（与官方 CLI 一致）:
    python scripts/run-gramps-webapi.py run -t '*' -p 8000
    python scripts/run-gramps-webapi.py user add admin <pw> --role 5
    python scripts/run-gramps-webapi.py tree list
"""

import locale as _locale
import os
import sys

# ---- 0. 数据目录固定到项目内（对应 docker-compose 的 ./gramps_data） ----
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('GRAMPSHOME', os.path.join(_PROJECT_ROOT, 'gramps_data'))
# 精确指定数据库目录（官方 app.py 支持此变量，避免 GRAMPSHOME 多级拼接歧义）
_GRAMPS_DB_PATH = os.path.join(_PROJECT_ROOT, 'gramps_data', 'grampsdb')
os.environ.setdefault('GRAMPS_DATABASE_PATH', _GRAMPS_DB_PATH)
# Gramps 的 os.mkdir 不创建父目录，需预创建（对应 docker-compose 的 ./gramps_data 卷）
os.makedirs(_GRAMPS_DB_PATH, exist_ok=True)

# ---- 1. macOS 缺 libintl 补丁（只影响 gettext 翻译） ----
if not hasattr(_locale, 'textdomain'):
    _locale.textdomain = lambda domain: domain
if not hasattr(_locale, 'bindtextdomain'):
    _locale.bindtextdomain = lambda domain, localedir=None: localedir

# ---- 2. 抑制 GTK 对话框（web 模式 headless） ----
# Gramps 创建/升级数据库时会弹 Gtk.Dialog，服务器环境必须静默。
# 仅在 GI 可用时 patch；若环境无 GTK 则跳过（官方 Docker 场景）。
try:
    import gi

    gi.require_version('Gtk', '3.0')
    from gi.repository import Gtk

    _orig_dialog_run = Gtk.Dialog.run

    def _noop_run(self):
        print(f"[jiazu] suppressed Gtk dialog: {type(self).__name__}")
        return Gtk.ResponseType.OK

    Gtk.Dialog.run = _noop_run

    _orig_widget_show = Gtk.Widget.show

    def _noop_show(self):
        if isinstance(self, Gtk.Dialog):
            return
        return _orig_widget_show(self)

    Gtk.Widget.show = _noop_show
except (ImportError, ValueError):
    pass  # 无 GTK 环境（如官方 Docker 镜像），无需抑制

from gramps_webapi.__main__ import cli  # noqa: E402

if __name__ == '__main__':
    sys.exit(cli())
