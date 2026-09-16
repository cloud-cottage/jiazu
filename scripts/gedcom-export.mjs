#!/usr/bin/env node
/**
 * GEDCOM 导出：树 JSON → GEDCOM 5.5.1（数据主权管线，零依赖）
 *
 * 用法:
 *   node scripts/gedcom-export.mjs <tree_id> [--out <path>]
 *
 * 输出 migrate-output/gedcom/<tree_id>.ged（默认）。
 * 数据来源：migrate-output/trees/<tree_id>.json + details/（与兼容层 local 模式一致）。
 *
 * 映射规则：
 *   - @I<gramps_id>@ 保留人物标识（如 I0001 → @I0001@）
 *   - NAME "Given /Surname/"，SEX M/F/U
 *   - BIRT/DEAT → DATE + PLAC（树 JSON 基本字段）
 *   - FAM 记录 HUSB/WIFE/CHIL + MARR（详情事件）
 *   - 跨树软关联/链属性 → GEDCOM 自定义标签（_ 前缀，5.5.1 允许）：
 *     _EXTERNAL_TREE / _EXTERNAL_PERSON / _EXTERNAL_LINK_TYPE / _CHAIN_GEN / _CHAIN_FROM
 *   - 其余详情 attributes → 1 NOTE 行（_ATTR 标签保留 key）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'migrate-output');

function readTree(treeId) {
  const p = path.join(OUT, 'trees', `${treeId}.json`);
  if (!fs.existsSync(p)) {
    console.error(`❌ 树 JSON 不存在: ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readDetail(treeId, handle) {
  const p = path.join(OUT, 'details', `${treeId}:${handle}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function esc(v) {
  // 只清理换行/制表；@ 保留（FAMC/FAMS 引用依赖，用户数据里的 @ 由导入方容错）
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}

const lines = [];
function add(level, xref, tag, value) {
  const x = xref ? ` @${xref}@` : '';
  const v = value !== undefined && value !== null && value !== '' ? ` ${esc(value)}` : '';
  lines.push(`${' '.repeat(level)}${level}${x} ${tag}${v}`.replace(/  +$/, ''));
}

/** 详情事件 → GEDCOM 事件（MARR/DEAT 等按类型） */
const EVENT_TAG = {
  Marriage: 'MARR',
  Birth: 'BIRT',
  Death: 'DEAT',
  Divorce: 'DIV',
  'Ordination': 'ORDN',
  Residence: 'RESI',
  Occupation: 'OCCU',
};

function eventLines(ind, type, ev) {
  const tag = EVENT_TAG[type] || 'EVEN';
  if (tag === 'EVEN') add(ind, null, 'EVEN', type);
  else add(ind, null, tag);
  if (ev.date) add(ind + 1, null, 'DATE', ev.date);
  if (ev.place) add(ind + 1, null, 'PLAC', ev.place);
  if (ev.description) add(ind + 1, null, 'NOTE', ev.description);
}

function main() {
  const treeId = process.argv[2];
  if (!treeId) {
    console.error('用法: node scripts/gedcom-export.mjs <tree_id> [--out <path>]');
    process.exit(1);
  }
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : path.join(OUT, 'gedcom', `${treeId}.ged`);

  const tree = readTree(treeId);
  const people = Object.values(tree.people || {});
  const families = Object.values(tree.families || {});

  // ---- 头部 ----
  add(0, null, 'HEAD');
  add(1, null, 'SOUR', 'jiapu100.com');
  add(2, null, 'NAME', '家族历史数字馆');
  add(1, null, 'GEDC');
  add(2, null, 'VERS', '5.5.1');
  add(2, null, 'FORM', 'LINEAGE-LINKED');
  add(1, null, 'CHAR', 'UTF-8');
  add(1, null, 'SUBM', 'SUBM1');
  add(1, null, 'DATE', new Date().toISOString().slice(0, 10));
  add(0, 'SUBM1', 'SUBM');
  add(1, null, 'NAME', tree.tree_id);

  // ---- 人物 ----
  for (const p of people) {
    const gid = (p.gramps_id || `I${p.handle.slice(0, 8)}`).replace(/[^A-Za-z0-9]/g, '');
    add(0, gid, 'INDI');
    add(1, null, 'NAME', `${p.given || ''} /${p.surname || ''}/`);
    if (p.gender && p.gender !== 'U') add(1, null, 'SEX', p.gender);
    // BIRT/DEAT：日期或地点任一存在即输出（只填地点、未填日期的「待考」节点也曾丢地点）
    if (p.birth_date || p.birth_place) {
      add(1, null, 'BIRT');
      if (p.birth_date) add(2, null, 'DATE', p.birth_date);
      if (p.birth_place) add(2, null, 'PLAC', p.birth_place);
    }
    if (p.death_date || p.death_place) {
      add(1, null, 'DEAT');
      if (p.death_date) add(2, null, 'DATE', p.death_date);
      if (p.death_place) add(2, null, 'PLAC', p.death_place);
    }
    // 引用（xref value 不转义）
    for (const fh of p.spouse_families || []) {
      const fgid = families.find((f) => f.handle === fh)?.gramps_id || fh.slice(0, 8);
      add(1, null, 'FAMS', `@${fgid}@`);
    }
    if (p.parent_family) {
      const fgid = families.find((f) => f.handle === p.parent_family)?.gramps_id || p.parent_family.slice(0, 8);
      add(1, null, 'FAMC', `@${fgid}@`);
    }
    // 跨树软关联 → 自定义标签
    if (p.external_tree) add(1, null, '_EXTERNAL_TREE', p.external_tree);
    if (p.external_person_handle) add(1, null, '_EXTERNAL_PERSON', p.external_person_handle);
    if (p.external_link_type) add(1, null, '_EXTERNAL_LINK_TYPE', p.external_link_type);
    // 详情：事件（BIRT/DEAT 已在基本字段，跳过）+ 属性
    const detail = readDetail(treeId, p.handle);
    for (const ev of detail?.events || []) {
      if (ev.type === 'Birth' || ev.type === 'Death') continue;
      eventLines(1, ev.type, ev);
    }
    for (const a of detail?.attributes || []) {
      if (a.key === 'external_chain_gen') add(1, null, '_CHAIN_GEN', a.value);
      else if (a.key === 'external_chain_from') add(1, null, '_CHAIN_FROM', a.value);
      // 称号类走 GEDCOM 标准标签：封号 → TITL（nobility/title），号 → NICK
      // （谥号在 5.5.1 无标准标签，落 _ATTR 保留 key）
      else if (a.key === '封号') add(1, null, 'TITL', a.value);
      else if (a.key === '号') add(1, null, 'NICK', a.value);
      else add(1, null, '_ATTR', `${a.key}: ${a.value}`);
    }
  }

  // ---- 家族 ----
  for (const f of families) {
    const gid = (f.gramps_id || `F${f.handle.slice(0, 8)}`).replace(/[^A-Za-z0-9]/g, '');
    add(0, gid, 'FAM');
    const personGid = (h) => {
      const fp = people.find((p) => p.handle === h);
      return (fp?.gramps_id || h.slice(0, 8)).replace(/[^A-Za-z0-9]/g, '');
    };
    if (f.father_handle) add(1, null, 'HUSB', `@${personGid(f.father_handle)}@`);
    if (f.mother_handle) add(1, null, 'WIFE', `@${personGid(f.mother_handle)}@`);
    for (const ch of f.child_handles || []) add(1, null, 'CHIL', `@${personGid(ch)}@`);
  }

  add(0, null, 'TRLR');

  const text = lines.join('\n') + '\n';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, text);
  console.log(`✓ 已导出 ${treeId}: ${people.length} 人 / ${families.length} 家族 → ${outPath} (${(text.length / 1024).toFixed(1)}KB)`);
}

main();
