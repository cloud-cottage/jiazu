#!/usr/bin/env python3
"""重建新家族树的 owner 账号密码（CLI delete + add），并保存凭据到 auth-server/data/gramps-owners.json

用法: python3 scripts/reset-tree-owners.py
"""

import json
import os
import secrets
import string
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = [
    os.path.join(ROOT, ".venv", "bin", "python"),
    os.path.join(ROOT, "scripts", "run-gramps-webapi.py"),
    "--config",
    os.path.join(ROOT, "gramps_config", "config.cfg"),
]
OWNERS_FILE = os.path.join(ROOT, "auth-server", "data", "gramps-owners.json")


def run_cli(args):
    env = dict(os.environ)
    env.pop("PYTHONPATH", None)
    subprocess.run(CLI + args, check=True, capture_output=True, text=True, env=env)


def gen_password(n=16):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def main():
    # tree_id -> (uuid, surname) 由调用方传入或从 users.sqlite 读取
    import sqlite3

    db = sqlite3.connect(os.path.join(ROOT, "gramps_db", "users.sqlite"))
    owners = {}
    for name, fullname, role, tree in db.execute(
        "SELECT name, fullname, role, tree FROM users WHERE name LIKE 'owner_%' AND role = 4"
    ):
        tree_id = name[len("owner_"):]
        owners[tree_id] = {"username": name, "tree_uuid": tree, "fullname": fullname}

    saved = {}
    if os.path.exists(OWNERS_FILE):
        saved = json.load(open(OWNERS_FILE))

    for tree_id, info in owners.items():
        username = info["username"]
        password = gen_password()
        print(f"重建 {username} (tree={tree_id}, uuid={info['tree_uuid']})")
        # 删除旧账号（忽略不存在错误）
        try:
            run_cli(["user", "delete", username])
        except subprocess.CalledProcessError:
            pass
        # 重建
        run_cli([
            "user", "add", username, password,
            "--fullname", info["fullname"] or f"{tree_id} 管理员",
            "--email", f"{username}@jiazutong.cn",
            "--role", "4",
            "--tree", info["tree_uuid"],
        ])
        saved[tree_id] = {
            "username": username,
            "password": password,
            "created_at": saved.get(tree_id, {}).get("created_at"),
        }

    os.makedirs(os.path.dirname(OWNERS_FILE), exist_ok=True)
    json.dump(saved, open(OWNERS_FILE, "w"), indent=2, ensure_ascii=False)
    print(f"\n✅ 已保存 {len(owners)} 个新树凭据到 {OWNERS_FILE}")


if __name__ == "__main__":
    main()
