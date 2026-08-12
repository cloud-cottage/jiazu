#!/usr/bin/env python3
"""jiazu 本地数据库迁移脚本 — 包装 alembic

与 run-gramps-webapi.py 相同的 macOS locale 补丁逻辑。
用法:
    python scripts/run-alembic.py upgrade head
    python scripts/run-alembic.py current
"""

import locale as _locale
import sys

if not hasattr(_locale, 'textdomain'):
    _locale.textdomain = lambda domain: domain
if not hasattr(_locale, 'bindtextdomain'):
    _locale.bindtextdomain = lambda domain, localedir=None: localedir

from alembic.config import main as alembic_main  # noqa: E402

if __name__ == '__main__':
    sys.argv = ['alembic', '-c', 'gramps_config/alembic.ini'] + sys.argv[1:]
    sys.exit(alembic_main(argv=sys.argv[1:]))
