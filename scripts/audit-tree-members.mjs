#!/usr/bin/env node
/**
 * 树成员体检：产出「树里不该有的人」清理清单（**只读，不写任何真源**）
 *
 * 口径与 `/tree/rank` 的 `person_count` 完全一致（lib/family-population.js，纯血缘图）：
 *   本族 = （根 − 外来姻亲根）沿父→子女闭包；婚入妇 = 非本族 + 性别≠M + 配偶本族；
 *   人数 = |本族 ∪ 婚入妇|；世本（is_master）/ 祖谱（kind=clan）不适用（= people 数）。
 *
 * 删除候选（`candidates`）= **非镜像** 且 **不计入人数** 的真节点，分三类：
 *   1. `孤立无关系`：无父、无母记录、不在任何家族配偶槽、无 spouse_families（也不在任何 child_handles？—— 
 *      本类要求「不在任何家族关系里」：无父无母、非任何家族的父亲/母亲槽、无 spouse_families）
 *   2. `外姓男性姻亲`：性别 M 且占某家族配偶槽，而该家族另一槽属本树谱系（姑父 / 妹夫 / 女婿 / 大姨夫类）
 *   3. `外嫁女后代留错树`：非本族、有母亲记录，且母亲不是「本族男性之妻」谱系位
 *      （即其父槽为空或不属本族 ⇒ 挂在嫁出女性名下的外姓后代）
 *   未命中任何一类 → 归入 `其它`（安全桶，应恒为空，非空即需人工判断）。
 *
 * 镜像节点（`String(external_mirror) === 'true'`）**不在删除候选内**（别处真身在本树的显示占位，
 * 产品接口 403 拒绝删除）；单独列在 `mirrors_not_counted` 里供人工核对。
 *
 * 用法：
 *   node scripts/audit-tree-members.mjs                # 全部树
 *   node scripts/audit-tree-members.mjs ji_23395_01    # 指定树
 *   node scripts/audit-tree-members.mjs --json /tmp/audit-tree-members.json
 * 退出码恒 0（只读体检工具）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFamilyGraph, countFamilyMembers, isMirrorNode, treeKind } from '../cloudfunctions/compat-api/lib/family-population.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TREES_DIR = process.env.AUDIT_TREES_DIR || path.join(ROOT, 'migrate-output', 'trees');
const META_FILE = process.env.AUDIT_META_FILE || path.join(ROOT, 'config', 'tree-meta.json');

const args = process.argv.slice(2);
let jsonOut = '/tmp/audit-tree-members.json';
const jsonFlag = args.indexOf('--json');
if (jsonFlag >= 0) jsonOut = args.splice(jsonFlag, 2)[1] || jsonOut;
const only = args.filter((a) => !a.startsWith('--'));

const CAT_ISOLATED = '孤立无关系';
const CAT_MALE_INLAW = '外姓男性姻亲';
const CAT_DAUGHTER_DESC = '外嫁女后代留错树';
const CAT_OTHER = '其它';

const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
const entryOf = (tid) => Object.values(meta.trees || {}).find((t) => t && t.tree_id === tid) || null;

const display = (p) => (p && (p.name || p.gramps_id || p.handle)) || '?';

/** 单树体检 → { tree_id, kind, people_count, person_count, candidates[], mirrors_not_counted[] } */
function auditTree(tid, tree, entry) {
  const people = tree.people || {};
  const families = Object.values(tree.families || {}).filter(Boolean);
  const kind = treeKind(entry);
  const g = analyzeFamilyGraph(tree);

  // 家族槽位统计
  const spouseSlotOf = new Map(); // handle → [families]（本人作为父/母槽）
  const childOf = new Map(); // handle → [families]（本人在 child_handles 里）
  for (const f of families) {
    for (const slot of [f.father_handle, f.mother_handle]) {
      if (!slot || !people[slot]) continue;
      if (!spouseSlotOf.has(slot)) spouseSlotOf.set(slot, []);
      spouseSlotOf.get(slot).push(f);
    }
    for (const c of f.child_handles || []) {
      if (!c || !people[c]) continue;
      if (!childOf.has(c)) childOf.set(c, []);
      childOf.get(c).push(f);
    }
  }
  const partnerInTree = (f, h) => {
    const other = f.father_handle === h ? f.mother_handle : f.father_handle;
    return other && people[other] ? other : '';
  };
  /** 该家族里与 h 配对的另一方是否属本树谱系（有父记录） */
  const partnerIsLineage = (f, h) => {
    const other = partnerInTree(f, h);
    return !!other && g.fatherOf.has(other);
  };

  const candidates = [];
  const mirrors = [];
  const record = (h, category, reason) => {
    const p = people[h];
    candidates.push({
      tree_id: tid,
      handle: h,
      gramps_id: p.gramps_id || '',
      name: p.name || '',
      gender: (p.gender || '') || '',
      category,
      reason,
    });
  };

  for (const h of Object.keys(people)) {
    if (g.counted.has(h)) continue; // 已计入人数 ⇒ 不是清理对象
    const p = people[h];
    if (isMirrorNode(p)) {
      mirrors.push({
        tree_id: tid,
        handle: h,
        gramps_id: p.gramps_id || '',
        name: p.name || '',
        gender: p.gender || '',
        link_type: p.external_link_type || '',
        external_tree: p.external_tree || '',
        reason: '外树真身在本树的显示占位（不计入人数，但接口拒绝删除）',
      });
      continue;
    }
    const slots = spouseSlotOf.get(h) || [];
    const hasFather = g.fatherOf.has(h);
    const hasMother = g.motherOf.has(h);
    const hasAnyRelation =
      slots.length > 0 || !!hasFather || !!hasMother || (Array.isArray(p.spouse_families) && p.spouse_families.length > 0);
    // 母亲记录：本人所在的 child_handles 家族里的 mother 槽（本族女性嫁出 ⇒ 后代留错树）
    const motherFamily = (childOf.get(h) || []).find((f) => f.mother_handle && people[f.mother_handle]) || null;
    const motherHandle = motherFamily ? motherFamily.mother_handle : '';
    const fatherHandle = motherFamily ? motherFamily.father_handle : '';
    const motherIsClan = !!motherHandle && g.clan.has(motherHandle);
    const fatherNonClan = !fatherHandle || !g.clan.has(fatherHandle);

    if (!hasAnyRelation) {
      record(h, CAT_ISOLATED, '无父无母、不在任何家族槽位、无 spouse_families');
    } else if (motherIsClan && fatherNonClan) {
      // 本族女性（嫁出/招赘）名下的后代：父槽为空或父不属本族 ⇒ 后代不随本族父系
      record(
        h,
        CAT_DAUGHTER_DESC,
        `母亲 ${display(people[motherHandle])} 属本族，父槽${
          fatherHandle && people[fatherHandle] ? ` ${display(people[fatherHandle])}（非本族）` : '为空'
        } ⇒ 嫁出女性后代留错树`,
      );
    } else if (String(p.gender).trim() === 'M' && slots.length > 0) {
      const lineage = slots.find((f) => partnerIsLineage(f, h));
      record(
        h,
        CAT_MALE_INLAW,
        lineage
          ? `占配偶槽（${display(people[partnerInTree(lineage, h)])} 属本树谱系）⇒ 外来姻亲根`
          : `男性姻亲，占配偶槽（${slots.map((f) => display(people[partnerInTree(f, h)])).join(' / ')}）`,
      );
    } else if (slots.length > 0) {
      record(h, CAT_OTHER, `占配偶槽但性别非 M 且未计入婚入妇（需人工判断）：${slots.map((f) => display(people[partnerInTree(f, h)])).join(' / ')}`);
    } else {
      record(h, CAT_OTHER, '未命中三类判据（需人工判断）');
    }
  }

  return {
    tree_id: tid,
    kind,
    is_master: !!(entry && entry.is_master),
    people_count: Object.keys(people).length,
    person_count: countFamilyMembers(tree, entry, { kind: entry && entry.kind, is_master: !!(entry && entry.is_master) }),
    counted: g.counted.size,
    roots: g.roots.size,
    in_law_roots: g.inLawRoots.size,
    candidates,
    mirrors_not_counted: mirrors,
  };
}

const files = fs
  .readdirSync(TREES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const report = { generated_at: new Date().toISOString(), source: TREES_DIR, trees: [] };

for (const file of files) {
  const tid = file.replace(/\.json$/, '');
  if (only.length && !only.includes(tid)) continue;
  const tree = JSON.parse(fs.readFileSync(path.join(TREES_DIR, file), 'utf8'));
  report.trees.push(auditTree(tid, tree, entryOf(tid)));
}

report.totals = {
  trees: report.trees.length,
  candidates: report.trees.reduce((n, t) => n + t.candidates.length, 0),
  by_category: report.trees
    .flatMap((t) => t.candidates)
    .reduce((acc, c) => ((acc[c.category] = (acc[c.category] || 0) + 1), acc), {}),
};

fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));

// ---------------- 打印 ----------------
const bar = (s) => `\n${'='.repeat(76)}\n${s}\n${'='.repeat(76)}`;
console.log(bar(`树成员体检（只读）· ${report.trees.length} 棵树 · 候选 ${report.totals.candidates} 个`));
console.log(`${'树'.padEnd(16)} ${'kind'.padEnd(7)} ${'people'.padStart(6)} ${'人数'.padStart(5)} ${'候选'.padStart(4)} ${'镜像未计'.padStart(7)}`);
for (const t of report.trees) {
  console.log(
    `${t.tree_id.padEnd(16)} ${t.kind.padEnd(7)} ${String(t.people_count).padStart(6)} ${String(t.person_count).padStart(5)} ${String(
      t.candidates.length,
    ).padStart(4)} ${String(t.mirrors_not_counted.length).padStart(7)}`,
  );
}
for (const t of report.trees) {
  if (!t.candidates.length) continue;
  console.log(bar(`${t.tree_id}（${t.kind}）：people ${t.people_count} · 新口径人数 ${t.person_count} · 删除候选 ${t.candidates.length}`));
  for (const c of t.candidates) {
    console.log(`  [${c.category}] ${c.gramps_id || c.handle} ${c.name || '（无名）'} g=${c.gender || '?'} — ${c.reason}`);
  }
}
const cat = report.totals.by_category;
console.log(bar('分类计数'));
for (const k of [CAT_ISOLATED, CAT_MALE_INLAW, CAT_DAUGHTER_DESC, CAT_OTHER]) {
  console.log(`  ${k.padEnd(18)} ${cat[k] || 0}`);
}
console.log(`  合计候选            ${report.totals.candidates}`);
console.log(`\n镜像节点（不计入人数、接口拒绝删除，仅登记）：`);
for (const t of report.trees) for (const m of t.mirrors_not_counted) console.log(`  ${t.tree_id} ${m.gramps_id || m.handle} ${m.name} (${m.link_type || '?'})`);
console.log(`\nJSON → ${jsonOut}`);
