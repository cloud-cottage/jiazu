#!/usr/bin/env node
/**
 * 一次性数据手术：把被静默兜底命名成 shi_* 的 3 棵树**原地迁移**到正确拼音前缀
 *
 * 背景（根因）：旧 `surnamePinyin()` = `PINYIN_MAP[char] || 'shi'`，手工表未收录
 * 「纪」「容」「恒」→ 三棵树被命名成 shi_32426_01 / shi_23481_01 / shi_24658_01。
 * 注音已改为 pinyin-pro 姓氏模式（不再兜底），本脚本把历史数据对齐。
 *
 * 迁移映射（已核实无冲突；ji_23395_01 是季氏，码点不同）
 *   shi_32426_01 → ji_32426_01    （surname_char=纪，纪氏家族）
 *   shi_23481_01 → rong_23481_01  （容，容氏家族）
 *   shi_24658_01 → heng_24658_01  （恒，恒氏家族）
 *
 * 迁移点（4 类位置，全仓无其它引用）：
 *   1. config/tree-meta.json 3 个条目：键名 + tree_id + path_alias，并补 surname_pinyin
 *   2. migrate-output/trees/<old>.json 3 个文件：文件名 + 内部 tree_id
 *   3. migrate-output/details/<old>:<handle>.json 5 个文件：文件名前缀 + 内部 tree_id
 *   4. migrate-output/collections/jiazu_assets.json 账本 ref.tree_id 与 desc 文案（不新增字段）
 *
 * 口径：**原地迁移、不保留旧 URL 别名**（旧 tree_id 一律不再可达）。
 * 幂等：重复执行必须报「已迁移，0 变更」并 exit 0。
 *
 * 用法：
 *   node scripts/migrate-tree-id-pinyin.mjs                # dry-run（默认，只打印计划）
 *   node scripts/migrate-tree-id-pinyin.mjs --apply        # 执行（写前自动备份）
 *   node scripts/migrate-tree-id-pinyin.mjs --root=<数据根> # 在副本上验证（默认 = 仓库根）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const MAPPING = [
  { from: 'shi_32426_01', to: 'ji_32426_01', surnameChar: '纪', pinyin: 'ji' },
  { from: 'shi_23481_01', to: 'rong_23481_01', surnameChar: '容', pinyin: 'rong' },
  { from: 'shi_24658_01', to: 'heng_24658_01', surnameChar: '恒', pinyin: 'heng' },
];

// 副本/测试环境护栏：与仓库其它一次性脚本同口径
if (process.env.COMPAT_OUT_DIR || process.env.COMPAT_META_FILE || process.env.NODE_TEST_CONTEXT) {
  console.error('拒绝运行：检测到 COMPAT_OUT_DIR / COMPAT_META_FILE / NODE_TEST_CONTEXT（脚本只应作用于真源，副本请用 --root=）');
  process.exit(2);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const rootArg = args.find((a) => a.startsWith('--root='));
const ROOT = rootArg ? path.resolve(rootArg.slice('--root='.length)) : REPO;

const META = path.join(ROOT, 'config/tree-meta.json');
const TREES = path.join(ROOT, 'migrate-output/trees');
const DETAILS = path.join(ROOT, 'migrate-output/details');
const COLLECTIONS = path.join(ROOT, 'migrate-output/collections');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');
const exists = (p) => fs.existsSync(p);

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

const plan = [];
const errors = [];

// ---- 1) 盘点：需要的文件是否在预期状态 ----
for (const m of MAPPING) {
  const oldTree = path.join(TREES, `${m.from}.json`);
  const newTree = path.join(TREES, `${m.to}.json`);
  const oldTreeExists = exists(oldTree);
  const newTreeExists = exists(newTree);
  if (!oldTreeExists && !newTreeExists) errors.push(`树文件既无旧也无新：trees/${m.from}.json / ${m.to}.json`);
  if (oldTreeExists && newTreeExists) errors.push(`树文件新旧同时存在：trees/${m.from}.json / ${m.to}.json`);

  const detailFiles = exists(DETAILS) ? fs.readdirSync(DETAILS).filter((f) => f.startsWith(`${m.from}:`) || f.startsWith(`${m.to}:`)) : [];
  const oldDetails = detailFiles.filter((f) => f.startsWith(`${m.from}:`));
  const newDetails = detailFiles.filter((f) => f.startsWith(`${m.to}:`));
  if (oldDetails.length && newDetails.length) {
    errors.push(`详情文件新旧前缀同时存在（${m.from} ${oldDetails.length} 个 / ${m.to} ${newDetails.length} 个），请人工确认`);
  }
  m.planTrees = { oldTree, newTree, from: oldTreeExists ? 'old' : newTreeExists ? 'new' : 'missing' };
  m.planDetails = { old: oldDetails, renamed: newDetails };
}

const metaText = read(META);
const metaTitle = JSON.parse(metaText).trees || {};
for (const m of MAPPING) {
  const hasOld = Object.prototype.hasOwnProperty.call(metaTitle, m.from);
  const hasNew = Object.prototype.hasOwnProperty.call(metaTitle, m.to);
  if (!hasOld && !hasNew) errors.push(`tree-meta 既无旧键也无新键：${m.from} / ${m.to}`);
  if (hasOld && hasNew) errors.push(`tree-meta 新旧键同时存在：${m.from} / ${m.to}`);
  m.metaState = hasOld ? 'old' : hasNew ? 'new' : 'missing';
}

const assetsFile = path.join(COLLECTIONS, 'jiazu_assets.json');
const assetsText = exists(assetsFile) ? read(assetsFile) : '';
for (const m of MAPPING) {
  m.assetsOld = countOccurrences(assetsText, m.from);
  m.assetsNew = countOccurrences(assetsText, m.to);
}

// 迁移是否已全部完成（幂等判据）
const fullyMigrated =
  MAPPING.every((m) => m.metaState === 'new' && m.planTrees.from === 'new' && m.planDetails.old.length === 0 && m.assetsOld === 0);

// 残留扫描（全仓，排除 .git/node_modules/.venv/dist 与本脚本自身 —— 脚本按设计保留映射文档）
const SELF = fileURLToPath(import.meta.url);
function scanDir(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === '.venv' || ent.name === 'dist') continue;
    if (ent.name.startsWith('.bak-')) continue; // 迁移自带备份，按设计保留旧 id
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) scanDir(p, out);
    else {
      if (path.resolve(p) === path.resolve(SELF)) continue;
      let s;
      try {
        s = read(p);
      } catch {
        continue;
      }
      for (const m of MAPPING) if (s.includes(m.from)) out.push(`${path.relative(ROOT, p)} ← ${m.from}`);
    }
  }
}
function runResidueScan() {
  const out = [];
  scanDir(ROOT, out);
  console.log(`\n残留扫描（排除 .git/node_modules/.venv/dist/.bak-* /本脚本自身）：${out.length} 处`);
  for (const l of out) console.log('  - ' + l);
  return out;
}

console.log(`数据根：${ROOT}`);
console.log(`模式：${apply ? 'APPLY（写盘 + 备份）' : 'DRY-RUN（只打印计划）'}`);
for (const m of MAPPING) {
  console.log(
    `  ${m.from} → ${m.to} [${m.surnameChar}]  meta=${m.metaState}  tree=${m.planTrees.from}` +
      `  details(旧)=${m.planDetails.old.length}  collectins(old refs)=${m.assetsOld}`,
  );
}

if (errors.length) {
  console.error('\n盘点失败：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(3);
}

if (fullyMigrated && !apply) {
  console.log('\n状态：已迁移完成（幂等），本次改动项 = 0。');
  runResidueScan();
  process.exit(0);
}

if (!apply) {
  console.log('\nDRY-RUN 结束（未写盘）。加 --apply 执行。');
  runResidueScan();
  process.exit(0);
}

// ---- 2) 幂等短路：已迁移则 0 变更 ----
if (fullyMigrated) {
  console.log('\n已迁移完成（幂等），本次改动项 = 0，exit 0。');
  process.exit(0);
}

// ---- 3) 备份 ----
const ts = new Date().toISOString().replace(/[:.]/g, '-');
// 备份：真源轮次放持久目录（~/jiazu-backups，/tmp 会被系统清理）；副本轮次放副本内
const BAK_ROOT = ROOT === REPO ? path.join(os.homedir(), 'jiazu-backups', `tree-id-pinyin-${ts}`) : path.join(ROOT, `.bak-${ts}`);
const BAK = BAK_ROOT;
fs.mkdirSync(path.join(BAK, 'trees'), { recursive: true });
fs.mkdirSync(path.join(BAK, 'details'), { recursive: true });
fs.mkdirSync(path.join(BAK, 'collections'), { recursive: true });
fs.mkdirSync(path.join(BAK, 'config'), { recursive: true });

const backupList = [];
function backup(src, rel) {
  if (!exists(src)) return;
  const dst = path.join(BAK, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  backupList.push(rel);
}
backup(META, 'config/tree-meta.json');
for (const m of MAPPING) {
  backup(m.planTrees.oldTree, path.join('trees', `${m.from}.json`));
  backup(m.planTrees.newTree, path.join('trees', `${m.to}.json`));
  for (const f of m.planDetails.old) backup(path.join(DETAILS, f), path.join('details', f));
}
backup(assetsFile, 'collections/jiazu_assets.json');
console.log(`\n备份：${BAK}（${backupList.length} 个文件）`);

const changed = [];

// ---- 4) 树文件：文本级替换 tree_id + 重命名（保持字节格式） ----
for (const m of MAPPING) {
  if (m.planTrees.from !== 'old') continue;
  const src = m.planTrees.oldTree;
  const dst = m.planTrees.newTree;
  if (exists(dst)) throw new Error(`目标已存在，拒绝覆盖：${dst}`);
  const before = read(src);
  const n = countOccurrences(before, m.from);
  if (n !== 1) throw new Error(`${path.basename(src)} 内旧 id 出现 ${n} 次（期望 1），拒绝改写`);
  if (countOccurrences(before, m.to) !== 0) throw new Error(`${path.basename(src)} 内已含新 id，拒绝改写`);
  const after = before.split(m.from).join(m.to);
  const tmp = dst + '.tmp';
  write(tmp, after);
  fs.renameSync(tmp, dst);
  fs.unlinkSync(src);
  changed.push(`trees/${m.from}.json → trees/${m.to}.json`);
}

// ---- 5) 详情文件：文本级替换 tree_id + 前缀重命名 ----
for (const m of MAPPING) {
  for (const f of m.planDetails.old) {
    const src = path.join(DETAILS, f);
    const dst = path.join(DETAILS, `${m.to}:${f.slice(m.from.length + 1)}`);
    if (exists(dst)) throw new Error(`目标已存在，拒绝覆盖：${dst}`);
    const before = read(src);
    const n = countOccurrences(before, m.from);
    if (n !== 1) throw new Error(`${f} 内旧 id 出现 ${n} 次（期望 1），拒绝改写`);
    write(src, before.split(m.from).join(m.to));
    fs.renameSync(src, dst);
    changed.push(`details/${f} → details/${path.basename(dst)}`);
  }
}

// ---- 6) 账本集合：ref.tree_id 与 desc 文案里的树号（文本级替换，不新增字段） ----
if (exists(assetsFile)) {
  let text = assetsText;
  let touched = 0;
  for (const m of MAPPING) {
    const n = countOccurrences(text, m.from);
    touched += n;
    text = text.split(m.from).join(m.to);
  }
  if (touched > 0) {
    if (text.endsWith('\n') !== assetsText.endsWith('\n')) throw new Error('末尾换行状态被改变，拒绝写回');
    write(assetsFile, text);
    changed.push(`collections/jiazu_assets.json（${touched} 处）`);
  }
}

// ---- 7) tree-meta：键名 + tree_id + path_alias（文本级，保持条目位置与格式） + 补 surname_pinyin ----
{
  let text = metaText;
  for (const m of MAPPING) {
    if (m.metaState !== 'old') continue;
    const keyOld = `"${m.from}": {`;
    if (countOccurrences(text, keyOld) !== 1) throw new Error(`tree-meta 键 "${m.from}": { 不唯一，拒绝改写`);
    text = text.replace(keyOld, `"${m.to}": {`);
    const n = countOccurrences(text, m.from);
    if (n !== 2) throw new Error(`tree-meta 内旧 id 残留 ${n} 处（期望 tree_id + path_alias 共 2 处），拒绝改写`);
    text = text.split(m.from).join(m.to);
    // 补 surname_pinyin（记录实际采用的拼音；紧跟 surname_char，条目内唯一）
    const scLine = `      "surname_char": "${m.surnameChar}",\n`;
    if (countOccurrences(text, scLine) !== 1) throw new Error(`tree-meta 内 ${scLine.trim()} 不唯一，拒绝插入 surname_pinyin`);
    text = text.replace(scLine, `${scLine}      "surname_pinyin": "${m.pinyin}",\n`);
  }
  if (!text.endsWith('\n')) text += '\n';
  write(META, text);
  changed.push('config/tree-meta.json（3 条目：键名 + tree_id + path_alias + surname_pinyin）');
}

// ---- 8) 结构校验 + 残留扫描 ----
{
  const meta = JSON.parse(read(META));
  for (const m of MAPPING) {
    const e = meta.trees[m.to];
    if (!e) throw new Error(`tree-meta 新键缺失：${m.to}`);
    if (e.tree_id !== m.to) throw new Error(`tree-meta tree_id 未对齐：${e.tree_id}`);
    if (e.path_alias !== `/${m.to}`) throw new Error(`tree-meta path_alias 未对齐：${e.path_alias}`);
    if (e.surname_pinyin !== m.pinyin) throw new Error(`tree-meta surname_pinyin 未写入：${m.to}`);
    if (meta.trees[m.from]) throw new Error(`tree-meta 旧键仍在：${m.from}`);
  }
  const treeFiles = fs.readdirSync(TREES);
  const detailFiles2 = fs.readdirSync(DETAILS);
  for (const m of MAPPING) {
    if (!treeFiles.includes(`${m.to}.json`)) throw new Error(`树文件缺失：${m.to}.json`);
    if (treeFiles.includes(`${m.from}.json`)) throw new Error(`旧树文件仍在：${m.from}.json`);
    if (detailFiles2.some((f) => f.startsWith(`${m.from}:`))) throw new Error(`旧详情文件仍在：${m.from}:*`);
    const t = JSON.parse(read(path.join(TREES, `${m.to}.json`)));
    if (t.tree_id !== m.to) throw new Error(`树 JSON tree_id 未对齐：${t.tree_id}`);
  }
}

console.log('\n改动项：');
for (const c of changed) console.log('  - ' + c);

// 残留扫描（全仓）
const leftovers = runResidueScan();
console.log(leftovers.length === 0 ? '\n✅ 迁移完成，旧 id 零残留。' : '\n❌ 仍有残留，需要人工处理。');
process.exit(leftovers.length === 0 ? 0 : 4);
