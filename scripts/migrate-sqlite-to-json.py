#!/usr/bin/env python3
"""
P0 迁移脚本：Gramps SQLite → 自有数据模型（树 JSON + 人物详情 JSON）

- 输入: gramps_data/grampsdb/<uuid>/sqlite.db（每 tree 一个）+ gramps_db/users.sqlite（tree_id ↔ uuid 映射）
- 输出: <out>/trees/<tree_id>.json         —— 树 JSON（结构真源，schema 见 docs/data-model.md §3）
        <out>/details/<tree_id>:<handle>.json —— 人物详情（档案真源，schema §4）
        <out>/report.json                   —— 迁移报告（统计 + 跳过项）
- 只读源库，不修改任何 Gramps 数据
- 零第三方依赖（标准库 sqlite3/json）

用法:
    python3 scripts/migrate-sqlite-to-json.py [--out migrate-output] [--tree ji_23395_01]
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERS_DB = os.path.join(REPO, "gramps_db", "users.sqlite")
GRAMPSDB_DIR = os.path.join(REPO, "gramps_data", "grampsdb")

# 树 JSON schema 版本（docs/data-model.md §3）
TREE_SCHEMA = "1.0"

# 跨树软关联：存树 JSON（结构字段），从详情 attributes 中排除（字段零重叠）
EXTERNAL_KEYS = {"external_tree", "external_person_handle", "external_link_type"}

# Gramps confidence 数值 → 可读字符串（前端 citations.confidence: string）
CONFIDENCE_MAP = {4: "Very High", 3: "High", 2: "Normal", 1: "Low", 0: "Very Low"}

# Gramps note format 数值 → 字符串
NOTE_FORMAT_MAP = {0: "flowed", 1: "preformatted"}


def derive_tree_map():
    """从 users.sqlite 推导 tree_id ↔ grampsdb 目录映射。

    - owner_<tree_id> 用户 → tree_id
    - chief_editor → zhonghua（总谱）
    - guest → ji_23395_01（默认树，无 owner 前缀）
    """
    db = sqlite3.connect(USERS_DB)
    rows = db.execute("SELECT name, tree FROM users WHERE tree IS NOT NULL").fetchall()
    db.close()
    mapping = {}
    for username, uuid in rows:
        if not uuid:
            continue
        tree_id = None
        if username.startswith("owner_"):
            candidate = username[len("owner_"):]
            # owner_gu_39038_01 → gu_39038_01
            import re
            if re.fullmatch(r"[a-z]+_\d+_\d{2}", candidate):
                tree_id = candidate
        elif username == "chief_editor":
            tree_id = "zhonghua"
        elif username == "guest":
            tree_id = "ji_23395_01"
        if tree_id:
            mapping[tree_id] = uuid
    return mapping


def type_string(t):
    """Gramps type 对象 → 字符串（{string: "X"} 或 {value, string}）"""
    if isinstance(t, str):
        return t
    if isinstance(t, dict):
        return t.get("string") or ""
    return ""


def ref_of(item):
    """引用列表元素 → handle（Gramps 混用 str 与 {ref: ...} 两种形态）"""
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return item.get("ref") or ""
    return ""


def date_string(d):
    """Gramps Date 对象 → 可读字符串。

    SQLite 存储形态：顶层 year/month/day 可能为空，真实日期在 dateval 数组，
    语义 = [day, month, year, ...]（已用 sortval/JD 实证：date(1957,12,4) 匹配
    sortval=2436177，对应 dateval=[4, 12, 1957]）。
    优先 text（本地化文本如 "3月13,1958"），其次 dateval。
    """
    if not isinstance(d, dict):
        return ""
    if d.get("text"):
        return d["text"]
    dv = d.get("dateval") or []
    if len(dv) >= 3 and dv[2]:
        year, month, day = dv[2], dv[1], dv[0]
    else:
        year = d.get("year") or 0
        month, day = d.get("month") or 0, d.get("day") or 0
    if not year:
        return ""
    s = str(year)
    if month:
        s += f"-{month:02d}"
        if day:
            s += f"-{day:02d}"
    return s


# 本地数据实证的 EventType value 映射（type.string 为空时的可读回退）
EVENT_TYPE_FALLBACK = {12: "Birth", 13: "Death"}


def event_type_label(e):
    """事件类型可读名：优先自定义 string，其次实证映射，兜底 Event"""
    label = type_string(e.get("type"))
    if label:
        return label
    value = (e.get("type") or {}).get("value")
    if isinstance(value, int):
        return EVENT_TYPE_FALLBACK.get(value, "Event")
    return "Event"


class TreeReader:
    """单棵 Gramps SQLite 的只读访问器"""

    def __init__(self, db_path):
        self.db = sqlite3.connect(db_path)
        self.db.row_factory = sqlite3.Row
        self.places = {}

    def close(self):
        self.db.close()

    def load_all(self, table):
        """返回 {handle: json_dict}"""
        out = {}
        try:
            rows = self.db.execute(f"SELECT json_data FROM {table}").fetchall()
        except sqlite3.OperationalError:
            return out
        for r in rows:
            try:
                d = json.loads(r["json_data"])
            except (json.JSONDecodeError, TypeError):
                continue
            if d.get("handle"):
                out[d["handle"]] = d
        return out

    def place_name(self, handle):
        if not handle:
            return ""
        p = self.places.get(handle)
        if p:
            n = p.get("name") or {}
            return n.get("value") if isinstance(n, dict) else ""
        return ""


def gender_str(g):
    if g == 1:
        return "M"
    if g == 2:
        return "F"
    return "U"


def build_person_node(p, ev, reader):
    """person json_data → 树 JSON 节点（docs/data-model.md §3）"""
    pn = p.get("primary_name") or {}
    surname = ""
    for s in pn.get("surname_list") or []:
        if s.get("primary") or not surname:
            surname = s.get("surname") or ""
            if s.get("primary"):
                break
    given = pn.get("first_name") or ""
    name = f"{surname}{given}" if (surname or given) else (p.get("gramps_id") or "未知")

    # 生卒：birth_ref_index/death_ref_index → event_ref_list → event 表
    def event_date_place(ref_index):
        refs = p.get("event_ref_list") or []
        if not (isinstance(ref_index, int) and 0 <= ref_index < len(refs)):
            return "", ""
        ev_handle = refs[ref_index].get("ref")
        e = ev.get(ev_handle) if ev_handle else None
        if not e:
            return "", ""
        return date_string(e.get("date")), reader.place_name(e.get("place"))

    birth_date, birth_place = event_date_place(p.get("birth_ref_index"))
    death_date, death_place = event_date_place(p.get("death_ref_index"))

    # 跨树软关联（结构字段 → 树 JSON）
    external = {}
    for a in p.get("attribute_list") or []:
        key = type_string(a.get("type"))
        if key in EXTERNAL_KEYS:
            external[key] = a.get("value") or ""

    return {
        "handle": p["handle"],
        "gramps_id": p.get("gramps_id") or "",
        "name": name,
        "surname": surname,
        "given": given,
        "gender": gender_str(p.get("gender")),
        "birth_date": birth_date,
        "death_date": death_date,
        "birth_place": birth_place,
        "death_place": death_place,
        "parent_family": (p.get("parent_family_list") or [None])[0] or "",
        "spouse_families": p.get("family_list") or [],
        "external_tree": external.get("external_tree", ""),
        "external_person_handle": external.get("external_person_handle", ""),
        "external_link_type": external.get("external_link_type", ""),
    }


def build_person_detail(tree_id, p, ev, media, citations, sources, notes, reader):
    """person json_data → 详情文档（docs/data-model.md §4，档案真源）"""
    pn = p.get("primary_name") or {}
    surname = next((s.get("surname", "") for s in pn.get("surname_list") or [] if s.get("primary")), "")
    given = pn.get("first_name") or ""

    # 事件（全部，不只生卒；过滤 _UPD 系统噪音事件）
    # handle = 源事件 handle，兼容层 /events/<handle> 与编辑模式 event_ref_list 需要
    events = []
    for er in p.get("event_ref_list") or []:
        e = ev.get(ref_of(er))
        if not e:
            continue
        label = event_type_label(e)
        if label == "_UPD":
            continue
        events.append({
            "handle": e.get("handle") or "",
            "type": label,
            "date": date_string(e.get("date")),
            "place": reader.place_name(e.get("place")),
            "description": e.get("description") or "",
        })

    # 媒体
    media_list = []
    for mr in p.get("media_list") or []:
        m = media.get(ref_of(mr))
        if not m:
            continue
        media_list.append({
            "url": m.get("path") or "",
            "thumbnail_url": m.get("thumb") or "",
            "description": m.get("desc") or "",
            "mime_type": m.get("mime") or "",
        })

    # 引用
    citation_list = []
    for cr in p.get("citation_list") or []:
        c = citations.get(ref_of(cr))
        if not c:
            continue
        src = sources.get(c.get("source_handle")) if c.get("source_handle") else None
        citation_list.append({
            "source_title": (src.get("title") if src else "") or "",
            "page": c.get("page") or "",
            "confidence": CONFIDENCE_MAP.get(c.get("confidence"), "Normal"),
        })

    # 备注
    note_list = []
    for nr in p.get("note_list") or []:
        n = notes.get(ref_of(nr))
        if not n:
            continue
        txt = n.get("text") or {}
        note_list.append({
            "type": type_string(n.get("type")) or "Note",
            "text": txt.get("string") if isinstance(txt, dict) else "",
            "format": NOTE_FORMAT_MAP.get(n.get("format"), "flowed"),
        })

    # 自定义属性：排除跨树软关联（已在树 JSON，零重叠）
    attributes = []
    for a in p.get("attribute_list") or []:
        key = type_string(a.get("type"))
        if not key or key in EXTERNAL_KEYS:
            continue
        attributes.append({"key": key, "value": a.get("value") or "", "type": key})

    return {
        "_id": f"{tree_id}:{p['handle']}",
        "tree_id": tree_id,
        "handle": p["handle"],
        "gramps_id": p.get("gramps_id") or "",   # 软冗余（展示/编辑）
        "name": f"{surname}{given}" or (p.get("gramps_id") or ""),  # 软冗余（展示）
        "events": events,
        "media": media_list,
        "citations": citation_list,
        "notes": note_list,
        "attributes": attributes,
        "updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def migrate_tree(tree_id, uuid, out_dir, report):
    db_path = os.path.join(GRAMPSDB_DIR, uuid, "sqlite.db")
    if not os.path.exists(db_path):
        report["skipped"].append(f"{tree_id}: 数据库文件不存在 {db_path}")
        return

    reader = TreeReader(db_path)
    people = reader.load_all("person")
    families = reader.load_all("family")
    ev = reader.load_all("event")
    media = reader.load_all("media")
    citations = reader.load_all("citation")
    sources = reader.load_all("source")
    notes = reader.load_all("note")
    reader.places = reader.load_all("place")

    # ---- 树 JSON ----
    tree = {
        "_schema": TREE_SCHEMA,
        "tree_id": tree_id,
        "version": 1,
        "updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "people": {},
        "families": {},
    }
    # founder_gramps_id 从 config/tree-meta.json 注入（世系图单根构建用）
    meta_path = os.path.join(REPO, "config", "tree-meta.json")
    if os.path.exists(meta_path):
        try:
            meta = json.load(open(meta_path, encoding="utf-8"))
            entry = meta.get("trees", {}).get(tree_id) or {}
            if entry.get("founder_gramps_id"):
                tree["founder_gramps_id"] = entry["founder_gramps_id"]
        except (json.JSONDecodeError, OSError):
            pass

    for p in people.values():
        node = build_person_node(p, ev, reader)
        tree["people"][node["handle"]] = node

    for f in families.values():
        tree["families"][f["handle"]] = {
            "handle": f["handle"],
            "gramps_id": f.get("gramps_id") or "",
            "father_handle": f.get("father_handle") or "",
            "mother_handle": f.get("mother_handle") or "",
            "child_handles": [c.get("ref") for c in f.get("child_ref_list") or []],
        }

    # ---- 详情文档 ----
    details = []
    for p in people.values():
        details.append(build_person_detail(tree_id, p, ev, media, citations, sources, notes, reader))
    reader.close()

    # ---- 写盘 ----
    os.makedirs(os.path.join(out_dir, "trees"), exist_ok=True)
    os.makedirs(os.path.join(out_dir, "details"), exist_ok=True)
    tree_path = os.path.join(out_dir, "trees", f"{tree_id}.json")
    with open(tree_path, "w", encoding="utf-8") as fh:
        json.dump(tree, fh, ensure_ascii=False, indent=2)
    for d in details:
        with open(os.path.join(out_dir, "details", f"{tree_id}:{d['handle']}.json"), "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False, indent=2)

    # 统计
    n_events = sum(len(d["events"]) for d in details)
    n_media = sum(len(d["media"]) for d in details)
    n_notes = sum(len(d["notes"]) for d in details)
    n_cit = sum(len(d["citations"]) for d in details)
    report["trees"][tree_id] = {
        "uuid": uuid,
        "people": len(people),
        "families": len(families),
        "events": n_events,
        "media": n_media,
        "notes": n_notes,
        "citations": n_cit,
        "tree_json": os.path.relpath(tree_path, out_dir),
        "details": len(details),
    }
    print(f"  ✓ {tree_id}: {len(people)} 人 / {len(families)} 家族 / {n_events} 事件 / {n_media} 媒体 / {n_notes} 备注 / {n_cit} 引用")


def main():
    ap = argparse.ArgumentParser(description="Gramps SQLite → 树 JSON + 人物详情 迁移")
    ap.add_argument("--out", default="migrate-output", help="输出目录（默认 migrate-output）")
    ap.add_argument("--tree", default=None, help="只迁移指定 tree_id（默认全部）")
    args = ap.parse_args()

    out_dir = os.path.join(REPO, args.out)
    tree_map = derive_tree_map()
    if not tree_map:
        print("无法从 users.sqlite 推导 tree 映射", file=sys.stderr)
        sys.exit(1)

    print("推导的 tree_id ↔ uuid 映射:")
    for tid, uuid in tree_map.items():
        print(f"  {tid:20s} {uuid}")

    report = {"generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "trees": {}, "skipped": []}

    targets = [args.tree] if args.tree else list(tree_map.keys())
    for tid in targets:
        if tid not in tree_map:
            report["skipped"].append(f"{tid}: 映射表中不存在")
            print(f"  ✗ {tid}: 映射表中不存在")
            continue
        migrate_tree(tid, tree_map[tid], out_dir, report)

    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(f"\n完成。报告: {os.path.join(out_dir, 'report.json')}")
    if report["skipped"]:
        print("跳过项:")
        for s in report["skipped"]:
            print("  -", s)


if __name__ == "__main__":
    main()
