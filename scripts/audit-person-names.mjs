#!/usr/bin/env node
/**
 * 姓名结构体检（只读）：找出「姓被填进名里」等结构错乱的节点
 *
 * 分类：
 *   A 姓空 + 名以「父姓」开头      → 可自动规整（姓=父姓，名=去掉前缀）
 *   B 姓非空 + 名又以同姓开头      → 可自动规整（名去掉重复前缀）
 *   C 姓空 + 名以「本树姓氏」开头  → 可自动规整（无父可依时用树姓氏）
 *   D 姓空 + 其它                  → 仅提示（称谓/外树登记节点，需人工判断）
 *
 * 用法: node scripts/audit-person-names.mjs [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(__dirname);
const OUT = process.env.COMPAT_OUT_DIR || path.join(REPO, 'migrate-output');
const META = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'tree-meta.json'), 'utf8'));
const asJson = process.argv.includes('--json');

/** 判断节点姓名结构问题（纯函数，便于复用/单测） */
export function classifyPerson(tree, person, treeSurnameChar) {
  const surname = person.surname || '';
  const given = person.given || '';
  const name = person.name || '';
  const isHan = (s) => /^[\u4e00-\u9fa5]$/.test(s || '');
  const fatherHandle = (tree.families[person.parent_family] || {}).father_handle || '';
  const fatherSurname = (tree.people[fatherHandle] || {}).surname || '';

  // 跨树标记/镜像节点（指向别的家族树）：姓名是链接标签（如「容氏始祖」「二婶」），不自动拆
  if (person.external_tree && person.external_tree !== tree.tree_id) {
    return { kind: 'D', reason: '跨树标记节点（姓名为链接标签），需人工判断', suggest: null };
  }
  if (!given) return { kind: 'D', reason: '名为空', suggest: null };
  // 占位符姓名（？/未知）不拆
  if (!isHan(surname) && surname) return { kind: 'D', reason: `姓氏为占位符「${surname}」`, suggest: null };
  if (!isHan(given[0])) {
    // 混排名（中英混写，如「顾Eppa 纯江」）：name 前缀含姓但名非汉字开头 → 只报告不自动改
    if (!surname && treeSurnameChar && name.startsWith(treeSurnameChar)) {
      return { kind: 'E', reason: `name「${name}」以本树姓氏开头但名为混排（非汉字开头），需人工确认姓/名划分`, suggest: null };
    }
    return {
      kind: 'D',
      reason: surname ? '混排名（中英混写），姓/名划分需人工确认' : '名首字非汉字（疑为称谓/标签）',
      suggest: null,
    };
  }

  if (surname && given.startsWith(surname)) {
    const rest = given.slice(surname.length);
    if (!rest) return { kind: 'D', reason: `名与姓同字（「${surname}」），拆分后名为空`, suggest: null };
    return {
      kind: 'B',
      reason: `名「${given}」已重复包含姓「${surname}」`,
      suggest: { surname, given: rest },
    };
  }
  if (!surname) {
    if (fatherSurname && given.startsWith(fatherSurname)) {
      const rest = given.slice(fatherSurname.length);
      if (rest) {
        return {
          kind: 'A',
          reason: `姓空 + 名以父姓「${fatherSurname}」开头`,
          suggest: { surname: fatherSurname, given: rest },
        };
      }
    }
    if (treeSurnameChar && given.startsWith(treeSurnameChar)) {
      const rest = given.slice(treeSurnameChar.length);
      if (rest) {
        return {
          kind: 'C',
          reason: `姓空 + 名以本树姓氏「${treeSurnameChar}」开头`,
          suggest: { surname: treeSurnameChar, given: rest },
        };
      }
    }
    // 姓名不可分（称谓/外树登记等）→ 仅提示
    return { kind: 'D', reason: '姓空且名无法按父姓/树姓氏拆分', suggest: null };
  }
  return null;
}

function main() {
  const files = fs.readdirSync(path.join(OUT, 'trees')).filter((f) => f.endsWith('.json'));
  const report = {};
  const totals = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const file of files) {
    const tree = JSON.parse(fs.readFileSync(path.join(OUT, 'trees', file), 'utf8'));
    const treeId = tree.tree_id || file.replace(/\.json$/, '');
    const surnameChar = (META.trees?.[treeId] || {}).surname_char || '';
    const rows = [];
    for (const p of Object.values(tree.people)) {
      const hit = classifyPerson(tree, p, surnameChar);
      if (!hit) continue;
      totals[hit.kind] += 1;
      rows.push({
        kind: hit.kind,
        gramps_id: p.gramps_id,
        name: p.name,
        surname: p.surname || '',
        given: p.given || '',
        reason: hit.reason,
        suggest: hit.suggest,
      });
    }
    if (rows.length) report[treeId] = rows;
  }

  if (asJson) {
    console.log(JSON.stringify({ totals, report }, null, 2));
    return;
  }
  console.log(`📋 姓名结构体检（${Object.keys(report).length} 棵树有命中）`);
  console.log(`   A 姓空+名含父姓 ${totals.A} ｜ B 名重复含姓 ${totals.B} ｜ C 姓空+名含树姓氏 ${totals.C} ｜ D 需人工 ${totals.D} ｜ E 混排名待确认 ${totals.E}\n`);
  for (const [treeId, rows] of Object.entries(report)) {
    console.log(`【${treeId}】可自动规整 A/B/C=${rows.filter((r) => r.suggest).length}，需人工 D=${rows.filter((r) => r.kind === 'D').length}，混排 E=${rows.filter((r) => r.kind === 'E').length}`);
    for (const r of rows.filter((x) => x.suggest)) {
      console.log(`   ${r.kind} ${r.gramps_id} ${r.name}: 姓「${r.surname}」名「${r.given}」 → 姓「${r.suggest.surname}」名「${r.suggest.given}」（${r.reason}）`);
    }
    const e = rows.filter((x) => x.kind === 'E');
    if (e.length) {
      console.log(`   [E] 混排名待确认 ${e.length} 例：` + e.map((r) => `${r.gramps_id} ${r.name}`).join('、'));
    }
    const d = rows.filter((x) => x.kind === 'D');
    if (d.length) {
      console.log(`   [D] 需人工 ${d.length} 例，示例：` + d.slice(0, 6).map((r) => `${r.gramps_id} ${r.name}`).join('、'));
    }
    console.log('');
  }
}

// 仅作为 CLI 执行时才跑 main（可被 fix-person-names.mjs import 复用 classifyPerson）
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
