#!/usr/bin/env python3
"""
历史始祖批量补录到中华世本总谱

对每个已拆分/已存在的家族树：
1. 找出树的始祖（parent_family_list 为空 = 无父母链的人，可能有多个）
2. 检查总谱是否已登记该树（external_tree 属性），避免重复
3. 未登记的 → 在总谱创建 person 节点 + external_tree 跨树引用

用法:
  python3 scripts/backfill-master-tree.py
环境变量（或 .env）:
  GRAMPS_BASE_URL=http://localhost:8000
  通过 auth-server/data/gramps-owners.json 读取各树 owner 凭据
"""

import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get("GRAMPS_BASE_URL", "http://localhost:8000")
OWNERS_FILE = os.path.join(ROOT, "auth-server", "data", "gramps-owners.json")
META_FILE = os.path.join(ROOT, "config", "tree-meta.json")
CHIEF_USER = os.environ.get("GRAMPS_CHIEF_USERNAME", "chief_editor")
CHIEF_PASS = os.environ.get("GRAMPS_CHIEF_PASSWORD", "")
MASTER_TREE = os.environ.get("MASTER_TREE_ID", "zhonghua_shiben_01")
# 原树（ji_23395_01）的 guest 只读凭据（从 auth-server .env）
ENV_FILE = os.path.join(ROOT, "auth-server", ".env")
GUEST_USER = "guest"
GUEST_PASS = ""


def load_env():
    global GUEST_USER, GUEST_PASS
    if not os.path.exists(ENV_FILE):
        return
    for line in open(ENV_FILE):
        line = line.strip()
        if line.startswith("GRAMPS_GUEST_USERNAME="):
            GUEST_USER = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("GRAMPS_GUEST_PASSWORD="):
            GUEST_PASS = line.split("=", 1)[1].strip().strip('"')


def api(path, token=None, method="GET", body=None):
    req = urllib.request.Request(
        f"{BASE}/api{path}",
        method=method,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def login(username, password):
    d = api("/token/", method="POST", body={"username": username, "password": password})
    time.sleep(1.2)  # 登录限流 1/second，节流
    return d["access_token"]


def find_ancestors(people):
    """始祖 = parent_family_list 为空的人物（无父母链）"""
    return [p for p in people if not p.get("parent_family_list")]


def main():
    if not CHIEF_PASS:
        print("❌ 缺少 GRAMPS_CHIEF_PASSWORD（总谱编辑账号）")
        sys.exit(1)

    load_env()
    chief_token = login(CHIEF_USER, CHIEF_PASS)
    print(f"✅ 总编辑登录成功: {CHIEF_USER}")

    owners = json.load(open(OWNERS_FILE))
    meta = json.load(open(META_FILE))
    trees = meta["trees"]

    # 总谱已有登记（避免重复）
    existing = set()
    master_people = api("/people/?profile=all", token=chief_token)
    for p in master_people:
        for a in p.get("attribute_list", []):
            if a.get("type") == "external_tree":
                existing.add(a.get("value"))
    print(f"ℹ️  总谱已登记 {len(existing)} 棵树: {sorted(existing) if existing else '无'}")

    added = 0
    skipped = 0
    for key, entry in trees.items():
        tree_id = entry["tree_id"]
        if entry.get("is_master"):
            continue  # 跳过总谱自身
        if tree_id in existing:
            print(f"⏭️  {tree_id}: 已在总谱登记，跳过")
            skipped += 1
            continue

        owner_info = owners.get(tree_id)
        if not owner_info:
            # 原树（ji_23395_01）用 guest 只读凭据；其余无凭据跳过
            if tree_id == "ji_23395_01" and GUEST_PASS:
                owner_info = {"username": GUEST_USER, "password": GUEST_PASS}
            else:
                print(f"⚠️  {tree_id}: 无 owner 凭据（gramps-owners.json），跳过")
                continue

        try:
            owner_token = login(owner_info["username"], owner_info["password"])
            people = api("/people/?profile=all", token=owner_token)
            ancestors = find_ancestors(people)
            if not ancestors:
                print(f"⚠️  {tree_id}: 未找到始祖（所有人都有父母链？），登记第一个: {people[0].get('gramps_id')}")
                ancestors = [people[0]]

            for anc in ancestors:
                pn = anc.get("primary_name", {})
                first = pn.get("first_name", "")
                surname_list = pn.get("surname_list", [])
                surname = surname_list[0].get("surname", "") if surname_list else ""
                display = f"{first}{surname}" if first else f"{surname}氏始祖"

                # 总谱创建节点
                body = {
                    "primary_name": {
                        "first_name": first or f"{surname or '未知'}氏始祖",
                        "surname_list": [{"surname": surname or ""}],
                    },
                    "attribute_list": [
                        {"type": "external_tree", "value": tree_id},
                        {"type": "external_relation_note", "value": f"{display} — 家族树 {tree_id} 的始祖（补录）"},
                    ],
                }
                created = api("/people/", token=chief_token, method="POST", body=body)
                handle = created[0]["handle"] if isinstance(created, list) else created.get("handle")
                print(f"✅  {tree_id}: 登记始祖「{display}」(handle={handle})")
                added += 1
        except Exception as e:
            print(f"❌  {tree_id}: 补录失败: {e}")

    print(f"\n🎉 补录完成: 新增 {added} 个总谱节点，跳过 {skipped} 个已登记树")


if __name__ == "__main__":
    main()
