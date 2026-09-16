#!/usr/bin/env node
/**
 * GEDCOM 导入：GEDCOM 5.5.1 → 树 JSON + 详情文档（数据主权管线，零依赖）
 *
 * 用法:
 *   node scripts/gedcom-import.mjs <tree_id> <input.ged> [--out <dir>]
 *
 * 默认输出 migrate-output/trees/<tree_id>.json + migrate-output/details/。
 * 支持标签：INDI/NAME/SEX/BIRT/DEAT/PLAC/DATE/FAMS/FAMC/FAM/HUSB/WIFE/CHIL、
 * CONT/CONC 续行，自定义扩展 _EXTERNAL_TREE/_EXTERNAL_PERSON/_EXTERNAL_LINK_TYPE/
 * _CHAIN_GEN/_CHAIN_FROM/_ATTR。
 */
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'migrate-output');

function genHandle() {
  return crypto.randomBytes(12).toString('hex');
}

// ---- GEDCOM 解析 ----

/** 解析一行: level [xref] tag [value]（容忍前导缩进空格） */
function parseLine(line) {
  const m = line.match(/^\s*(\d+)\s+(?:@([^@]+)@\s+)?([A-Z0-9_]+)(?:\s+(.*))?$/i);
  if (!m) return null;
  return { level: parseInt(m[1], 10), xref: m[2] || null, tag: m[3].toUpperCase(), value: (m[4] || '').trim() };
}

/** 把行流解析成记录树（处理 CONT/CONC） */
function parseGedcom(text) {
  const records = []; // {record, lines: [{tag, value, sub}]}
  const stack = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const ln = parseLine(raw);
    if (!ln) continue;
    const node = { tag: ln.tag, value: ln.value, sub: [] };
    if (ln.level === 0) {
      current = { record: node, xref: ln.xref };
      records.push(current);
      stack.length = 0;
      stack.push(node);
    } else {
      while (stack.length > ln.level) stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) continue;
      // CONT/CONC：续行合并到父 value
      if (ln.tag === 'CONT' || ln.tag === 'CONC') {
        parent.value = (parent.value || '') + (ln.tag === 'CONC' ? '' : '\n') + ln.value;
        continue;
      }
      parent.sub.push(node);
      stack.push(node);
    }
  }
  return records;
}

// ---- 映射 ----

/** 名字解析："Given /Surname/" → {given, surname} */
function parseName(value) {
  const m = String(value || '').match(/(.*?)\s*\/([^/]*)\//);
  if (m) return { given: m[1].trim(), surname: m[2].trim() };
  return { given: String(value || '').trim(), surname: '' };
}

/** 日期归一化（尽力转 ISO；失败保留原文） */
function parseDate(value) {
  if (!value) return '';
  const v = String(value).trim();
  // 去掉修饰词 ABT/BEF/AFT/EST/CAL
  const bare = v.replace(/^(ABT|BEF|AFT|EST|CAL|ABOUT|BETWEEN)\s+/i, '').trim();
  // YYYY-MM-DD
  let m = bare.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // DD Mon YYYY / Mon DD YYYY / Mon YYYY
  const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  m = bare.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m && MONTHS[m[2].toUpperCase()]) return `${m[3]}-${MONTHS[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`;
  m = bare.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (m && MONTHS[m[1].toUpperCase()]) return `${m[3]}-${MONTHS[m[1].toUpperCase()]}-${m[2].padStart(2, '0')}`;
  m = bare.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (m && MONTHS[m[1].toUpperCase()]) return `${m[2]}-${MONTHS[m[1].toUpperCase()]}`;
  m = bare.match(/^(\d{4})$/);
  if (m) return m[1];
  return v; // 无法解析保留原文
}

const EVENT_TYPE = {
  MARR: 'Marriage',
  DIV: 'Divorce',
  BIRT: 'Birth',
  DEAT: 'Death',
  ORDN: 'Ordination',
  RESI: 'Residence',
  OCCU: 'Occupation',
  EVEN: null, // 值即类型
};

function findSub(node, tag) {
  return node.sub.find((s) => s.tag === tag);
}

function subValue(node, tag) {
  return findSub(node, tag)?.value || '';
}

function main() {
  const treeId = process.argv[2];
  const input = process.argv[3];
  if (!treeId || !input) {
    console.error('用法: node scripts/gedcom-import.mjs <tree_id> <input.ged> [--out <dir>]');
    process.exit(1);
  }
  const outIdx = process.argv.indexOf('--out');
  const outDir = outIdx > -1 ? process.argv[outIdx + 1] : OUT;
  if (!fs.existsSync(input)) {
    console.error(`❌ 文件不存在: ${input}`);
    process.exit(1);
  }

  const text = fs.readFileSync(input, 'utf8');
  const records = parseGedcom(text);
  const indiRecs = records.filter((r) => r.record.tag === 'INDI');
  const famRecs = records.filter((r) => r.record.tag === 'FAM');

  // xref（@I0001@）→ 新 handle 映射
  const handleByXref = new Map();
  const people = {};
  for (const rec of indiRecs) {
    const handle = genHandle();
    handleByXref.set(rec.xref || `I${handle.slice(0, 8)}`, handle);
    people[handle] = null; // 占位，稍后填充
  }
  const famHandleByXref = new Map();
  const families = {};
  for (const rec of famRecs) {
    const handle = genHandle();
    famHandleByXref.set(rec.xref || `F${handle.slice(0, 8)}`, handle);
    families[handle] = null;
  }

  // 人物填充
  const details = {};
  for (const rec of indiRecs) {
    const node = rec.record;
    const handle = handleByXref.get(rec.xref);
    const gid = rec.xref || `I${handle.slice(0, 8)}`;
    const { given, surname } = parseName(subValue(node, 'NAME'));
    const sexRaw = subValue(node, 'SEX').toUpperCase();
    const gender = ['M', 'F', 'U'].includes(sexRaw) ? sexRaw : 'U';
    const birt = findSub(node, 'BIRT');
    const deat = findSub(node, 'DEAT');
    const person = {
      handle,
      gramps_id: gid,
      name: `${surname}${given}` || gid,
      surname,
      given,
      gender,
      birth_date: birt ? parseDate(subValue(birt, 'DATE')) : '',
      death_date: deat ? parseDate(subValue(deat, 'DATE')) : '',
      birth_place: birt ? subValue(birt, 'PLAC') : '',
      death_place: deat ? subValue(deat, 'PLAC') : '',
      parent_family: '',
      spouse_families: [],
      external_tree: subValue(node, '_EXTERNAL_TREE'),
      external_person_handle: subValue(node, '_EXTERNAL_PERSON'),
      external_link_type: subValue(node, '_EXTERNAL_LINK_TYPE'),
    };
    people[handle] = person;

    // 详情：事件（非 BIRT/DEAT）+ attributes
    const events = [];
    const attributes = [];
    for (const sub of node.sub) {
      const et = EVENT_TYPE[sub.tag];
      if (et !== undefined && sub.tag !== 'BIRT' && sub.tag !== 'DEAT') {
        events.push({
          handle: genHandle(),
          type: et || sub.value || sub.tag,
          date: parseDate(subValue(sub, 'DATE')),
          place: subValue(sub, 'PLAC'),
          description: subValue(sub, 'NOTE'),
        });
      }
      if (sub.tag === '_CHAIN_GEN') attributes.push({ key: 'external_chain_gen', value: sub.value, type: 'external_chain_gen' });
      if (sub.tag === '_CHAIN_FROM') attributes.push({ key: 'external_chain_from', value: sub.value, type: 'external_chain_from' });
      // 称号类：TITL → 封号，NICK → 号（与 gedcom-export.mjs 对称）
      if (sub.tag === 'TITL') attributes.push({ key: '封号', value: sub.value, type: '封号' });
      if (sub.tag === 'NICK') attributes.push({ key: '号', value: sub.value, type: '号' });
      if (sub.tag === '_ATTR') {
        const idx = sub.value.indexOf(':');
        if (idx > -1) {
          const key = sub.value.slice(0, idx).trim();
          const value = sub.value.slice(idx + 1).trim();
          attributes.push({ key, value, type: key });
        }
      }
    }
    details[handle] = { tree_id: treeId, handle, gramps_id: gid, name: person.name, events, media: [], citations: [], notes: [], attributes, updated_at: new Date().toISOString() };
  }

  // 家族填充
  for (const rec of famRecs) {
    const node = rec.record;
    const handle = famHandleByXref.get(rec.xref);
    const gid = rec.xref || `F${handle.slice(0, 8)}`;
    const personHandle = (xref) => {
      const g = String(xref || '').replace(/^@|@$/g, '');
      return handleByXref.get(g) || null;
    };
    families[handle] = {
      handle,
      gramps_id: gid,
      father_handle: personHandle(subValue(node, 'HUSB')) || '',
      mother_handle: personHandle(subValue(node, 'WIFE')) || '',
      child_handles: node.sub.filter((s) => s.tag === 'CHIL').map((s) => personHandle(s.value)).filter(Boolean),
    };
  }

  // 关系重建：FAMS/FAMC → spouse_families / parent_family
  for (const rec of indiRecs) {
    const node = rec.record;
    const handle = handleByXref.get(rec.xref);
    const famRef = (v) => {
      const g = String(v || '').replace(/^@|@$/g, '');
      return famHandleByXref.get(g) || null;
    };
    for (const sub of node.sub) {
      if (sub.tag === 'FAMS') {
        const fh = famRef(sub.value);
        if (fh && families[fh]) people[handle].spouse_families.push(fh);
      }
      if (sub.tag === 'FAMC') {
        const fh = famRef(sub.value);
        if (fh && families[fh]) people[handle].parent_family = fh;
      }
    }
  }

  // 写盘
  const tree = {
    _schema: '1.1',
    tree_id: treeId,
    version: 1,
    updated_at: new Date().toISOString(),
    people,
    families,
  };
  const treePath = path.join(outDir, 'trees', `${treeId}.json`);
  fs.mkdirSync(path.dirname(treePath), { recursive: true });
  fs.writeFileSync(treePath, JSON.stringify(tree, null, 2));
  fs.mkdirSync(path.join(outDir, 'details'), { recursive: true });
  for (const [handle, d] of Object.entries(details)) {
    fs.writeFileSync(path.join(outDir, 'details', `${treeId}:${handle}.json`), JSON.stringify(d, null, 2));
  }

  console.log(`✓ 已导入 ${treeId}: ${Object.keys(people).length} 人 / ${Object.keys(families).length} 家族`);
  console.log(`  树 JSON → ${treePath}`);
  console.log(`  详情文档 → ${Object.keys(details).length} 条`);
}

main();
