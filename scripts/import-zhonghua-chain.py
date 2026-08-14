#!/usr/bin/env python3
"""
向中华世本（zhonghua）导入 90 世源流链
伏羲(1) → 聚合(2-44 伏羲氏诸世) → 少典氏初代(45) → 炎帝(46)/勗其(46) → 巨駓(47) → … → 季文子(90)

第 90 世季文子（季孙行父）为季氏支系始祖节点。
每个节点带 external_chain_gen 属性标记世数，前端纵向时间轴据此排序展示。

用法: python3 scripts/import-zhonghua-chain.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get("GRAMPS_BASE_URL", "http://localhost:8000")
CHIEF_USER = os.environ.get("GRAMPS_CHIEF_USERNAME", "chief_editor")
CHIEF_PASS = os.environ.get("GRAMPS_CHIEF_PASSWORD", "")
MASTER_TREE = os.environ.get("MASTER_TREE_ID", "zhonghua")
# 从 auth-server/.env 读凭据
ENV_FILE = os.path.join(ROOT, "auth-server", ".env")


def load_env():
    global CHIEF_USER, CHIEF_PASS
    if not os.path.exists(ENV_FILE):
        return
    for line in open(ENV_FILE):
        line = line.strip()
        if line.startswith("GRAMPS_CHIEF_USERNAME="):
            CHIEF_USER = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("GRAMPS_CHIEF_PASSWORD="):
            CHIEF_PASS = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("MASTER_TREE_ID="):
            global MASTER_TREE
            MASTER_TREE = line.split("=", 1)[1].strip().strip('"')


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
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def login():
    s, d = api("/token/", method="POST", body={"username": CHIEF_USER, "password": CHIEF_PASS})
    if s != 200:
        print(f"❌ 登录失败: {s} {d}")
        sys.exit(1)
    return d["access_token"]


# ---- 90 世链条数据 ----
# (gen, name, note, is_aggregate)
CHAIN = [
    (1, "伏羲", "中华人文始祖，三皇之首", False),
    (2, "伏羲氏诸世", "中间推演 44 世，无传世人名，虚拟聚合节点", True),
    (45, "少典氏・初代", "少典氏，黄帝之祖", False),
    (46, "炎帝", "初代神农，少典氏初代之子", False),
    (46, "勗其", "少典氏初代之子，主链", False),
    (47, "巨駓", "", False),
    (48, "芒昧", "", False),
    (49, "夷栗", "", False),
    (50, "柏坚", "", False),
    (51, "节", "", False),
    (52, "赫胡", "", False),
    (53, "封胥", "", False),
    (54, "依卢", "", False),
    (55, "启昆", "", False),
    (56, "黄帝", "五帝之首，中华民族始祖", False),
    (57, "玄嚣", "黄帝之子", False),
    (58, "蟜极", "", False),
    (59, "帝喾", "五帝之一", False),
    (60, "后稷・弃", "周人始祖，帝喾之子", False),
    (61, "不窋", "", False),
    (62, "鞠", "", False),
    (63, "公刘", "", False),
    (64, "庆节", "", False),
    (65, "皇仆", "", False),
    (66, "差弗", "", False),
    (67, "毁隃", "", False),
    (68, "公非", "", False),
    (69, "高圉", "", False),
    (70, "亚圉", "", False),
    (71, "公叔祖类", "", False),
    (72, "古公亶父", "周太王，迁岐山", False),
    (73, "季历", "周王季", False),
    (74, "周文王姬昌", "西周奠基者", False),
    (75, "周公旦", "元圣，制礼作乐", False),
    (76, "伯禽", "鲁国始君", False),
    (77, "鲁炀公", "", False),
    (78, "鲁幽公", "", False),
    (79, "鲁魏公", "", False),
    (80, "鲁厉公", "", False),
    (81, "鲁献公", "", False),
    (82, "鲁真公", "", False),
    (83, "鲁武公", "", False),
    (84, "鲁懿公", "", False),
    (85, "鲁孝公", "", False),
    (86, "鲁惠公", "", False),
    (87, "鲁桓公", "", False),
    (88, "季友", "姬友，成季，季氏得姓始祖", False),
    (89, "齐仲无佚", "", False),
    (90, "季文子", "季孙行父，确立季孙氏宗主", False),
]

# 主链父子关系（子 → 父），用于创建 family
# 伏羲 → 聚合 → 少典 → 勗其 → 巨駓 → ... → 季文子
# 炎帝是少典的另一个儿子（46 世，分支）
FAMILIES = [
    ("伏羲", "伏羲氏诸世"),
    ("伏羲氏诸世", "少典氏・初代"),
    ("少典氏・初代", "勗其"),
    ("少典氏・初代", "炎帝"),
    ("勗其", "巨駓"),
    ("巨駓", "芒昧"),
    ("芒昧", "夷栗"),
    ("夷栗", "柏坚"),
    ("柏坚", "节"),
    ("节", "赫胡"),
    ("赫胡", "封胥"),
    ("封胥", "依卢"),
    ("依卢", "启昆"),
    ("启昆", "黄帝"),
    ("黄帝", "玄嚣"),
    ("玄嚣", "蟜极"),
    ("蟜极", "帝喾"),
    ("帝喾", "后稷・弃"),
    ("后稷・弃", "不窋"),
    ("不窋", "鞠"),
    ("鞠", "公刘"),
    ("公刘", "庆节"),
    ("庆节", "皇仆"),
    ("皇仆", "差弗"),
    ("差弗", "毁隃"),
    ("毁隃", "公非"),
    ("公非", "高圉"),
    ("高圉", "亚圉"),
    ("亚圉", "公叔祖类"),
    ("公叔祖类", "古公亶父"),
    ("古公亶父", "季历"),
    ("季历", "周文王姬昌"),
    ("周文王姬昌", "周公旦"),
    ("周公旦", "伯禽"),
    ("伯禽", "鲁炀公"),
    ("鲁炀公", "鲁幽公"),
    ("鲁幽公", "鲁魏公"),
    ("鲁魏公", "鲁厉公"),
    ("鲁厉公", "鲁献公"),
    ("鲁献公", "鲁真公"),
    ("鲁真公", "鲁武公"),
    ("鲁武公", "鲁懿公"),
    ("鲁懿公", "鲁孝公"),
    ("鲁孝公", "鲁惠公"),
    ("鲁惠公", "鲁桓公"),
    ("鲁桓公", "季友"),
    ("季友", "齐仲无佚"),
    ("齐仲无佚", "季文子"),
]


def main():
    load_env()
    if not CHIEF_PASS:
        print("❌ 缺少 GRAMPS_CHIEF_PASSWORD")
        sys.exit(1)
    token = login()
    print(f"✅ 总编辑登录成功: {CHIEF_USER}")

    # 检查是否已导入（按名字查）
    s, existing = api("/people/?profile=all", token=token)
    existing_names = set()
    for p in existing:
        pn = p.get("primary_name", {})
        fn = pn.get("first_name", "")
        sn = pn.get("surname_list", [{}])[0].get("surname", "") if pn.get("surname_list") else ""
        existing_names.add(f"{fn}{sn}".strip())
    if "季文子" in existing_names:
        print("⚠️  90 世链已存在（检测到季文子），跳过导入")
        return

    # 创建 person，记录 handle
    handles = {}  # name -> handle
    for gen, name, note, is_agg in CHAIN:
        # 拆分名/姓（尽量取末尾汉字为姓）
        surname = ""
        first = name
        # 季文子 → 季/文子；周文王姬昌 → 姬/周文王昌 等，简化处理
        if name == "季文子":
            surname, first = "季", "文子"
        elif name == "季友":
            surname, first = "季", "友"
        elif name == "齐仲无佚":
            surname, first = "姬", "齐仲无佚"
        elif name.startswith("周文王"):
            surname, first = "姬", "昌"
        elif name == "周公旦":
            surname, first = "姬", "旦"
        elif name.startswith("鲁"):
            surname, first = "姬", name
        elif name == "炎帝":
            surname, first = "姜", "炎帝"
        elif name == "黄帝":
            surname, first = "姬", "黄帝"
        elif name == "伏羲":
            surname, first = "风", "伏羲"
        else:
            first = name

        body = {
            "primary_name": {
                "first_name": first,
                "surname_list": [{"surname": surname}] if surname else [],
            },
            "attribute_list": [
                {"type": "external_chain_gen", "value": str(gen)},
                {"type": "external_tree", "value": MASTER_TREE},
            ],
        }
        if is_agg:
            body["attribute_list"].append({"type": "external_chain_aggregate", "value": "true"})
        if note:
            body["attribute_list"].append({"type": "external_relation_note", "value": note})

        s, created = api("/people/", token=token, method="POST", body=body)
        if s not in (200, 201):
            print(f"❌ 创建 {name} 失败: {s} {created}")
            sys.exit(1)
        handle = created[0]["handle"] if isinstance(created, list) else created.get("handle")
        handles[name] = handle
        print(f"  ✅ 第{gen}世 {name} (handle={handle[:12]}...)")
        time.sleep(0.3)  # 节流

    # 创建 family 父子关系
    print("\n创建父子关系...")
    for parent, child in FAMILIES:
        if parent not in handles or child not in handles:
            print(f"  ⚠️ 缺 handle: {parent} → {child}")
            continue
        body = {
            "father_handle": handles[parent],
            "child_ref_list": [{"ref": handles[child]}],
        }
        s, created = api("/families/", token=token, method="POST", body=body)
        if s not in (200, 201):
            print(f"  ❌ family {parent}→{child} 失败: {s} {created}")
        else:
            print(f"  ✅ {parent} → {child}")
        time.sleep(0.3)

    print(f"\n🎉 导入完成: {len(handles)} 个节点, {len(FAMILIES)} 个父子关系")


if __name__ == "__main__":
    main()
