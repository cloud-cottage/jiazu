#!/usr/bin/env node
/**
 * 发源地显示串（`tree-meta.origin`）一致性修正 / 守卫 —— 真源修复专用（幂等）
 *
 * 背景（真 bug）：
 *   前端弹窗的 legacy 直写把已指定好的「发源地显示串」盖回旧文本，导致 `config/tree-meta.json`
 *   中「有码树」的 `origin_code` 与 `origin` 不一致（软冗余失同步）。
 *   契约 v1：`origin_code` = 结构化真源；`origin` = 写时由名称表反查生成的展示串（禁止人工编辑）。
 *
 * 口径（**唯一来源**）：
 *   · `origin` 的新值 **只** 取自 `resolveOrigin(origin_code).display`（`cloudfunctions/compat-api/lib/geo.js`），
 *     本脚本内**不出现任何手打地名串**，也不读环境变量里的地名。
 *   · **只改 `origin` 一个字段**：`origin_code` 与其它字段一律不动（写前有「屏掉 origin 后逐字节相同」自检）。
 *   · **无 `origin_code` 的树一律不碰**（未结构化 = 契约外，legacy 自由文本合法）。
 *   · `origin_code` 存在但**未知码**（`resolveOrigin` 反查不到）→ 归入「需人工裁定」，**不改写**（不把码吃成空串）。
 *
 * 幂等：`origin` 已等于 `resolveOrigin(code).display` 的树计入「已一致」，不产生任何写入；
 *       全部一致时 `--apply` **完全不写盘**（文件 md5 前后恒等），可反复执行。
 *
 * 用法：
 *   node scripts/fix-tree-origin-display.mjs                 # dry-run（默认，只打印计划）
 *   node scripts/fix-tree-origin-display.mjs --apply         # 执行（写前自动备份 + 写后自校验）
 *   node scripts/fix-tree-origin-display.mjs --check         # 守卫模式：只校验一致性，不一致 exit 1
 *   COMPAT_META_FILE=/tmp/jiazu-copy/tree-meta.json node scripts/fix-tree-origin-display.mjs --apply   # 副本演练
 *
 * 目标文件解析顺序（与 `cloudfunctions/compat-api/lib/store.js` 同序）：
 *   `COMPAT_META_FILE` > `COMPAT_OUT_DIR/tree-meta.json` > 真源 `config/tree-meta.json`
 *
 * 备份：`--apply` 且确有改动时，把目标文件复制到
 *   `~/jiazu-backups/<YYYY-MM-DD>-origin-display-repair[-copy]/tree-meta.json`
 *   （同级另存 `md5-before.txt` / `repair-plan.txt`；同名已存在则加序号，绝不覆盖旧备份）。
 *   回滚 = 把该备份拷回目标路径（脚本会在结尾打印精确命令）。
 *
 * 退出码：0 = 一致 / 写入成功 / 无需写入；1 = 存在不一致（`--check`）或写后自校验失败；2 = 用法错误 / 目标缺失。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveOrigin, isKnownOriginCode } from '../cloudfunctions/compat-api/lib/geo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ---- 参数 ----
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
if (flag('--help') || flag('-h')) {
  console.log('用法：node scripts/fix-tree-origin-display.mjs [--apply] [--check]');
  process.exit(0);
}
const KNOWN_FLAGS = new Set(['--apply', '--check']);
const unknown = argv.filter((a) => !KNOWN_FLAGS.has(a));
if (unknown.length) {
  console.error(`❌ 未知参数：${unknown.join(' ')}（仅支持 --apply / --check）`);
  process.exit(2);
}
const APPLY = flag('--apply');
const CHECK = flag('--check');
if (APPLY && CHECK) {
  console.error('❌ --apply 与 --check 互斥（--check 是只读守卫，不写盘）');
  process.exit(2);
}

// ---- 目标文件 ----
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const META_FILE = process.env.COMPAT_META_FILE
  ? path.resolve(process.env.COMPAT_META_FILE)
  : process.env.COMPAT_OUT_DIR
    ? path.join(path.resolve(process.env.COMPAT_OUT_DIR), 'tree-meta.json')
    : REAL_META;
const IS_COPY = path.resolve(META_FILE) !== path.resolve(REAL_META);
const BAK_ROOT = path.join(os.homedir(), 'jiazu-backups');
const STAMP = new Date().toISOString().slice(0, 10);

// ---- 工具 ----
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const md5s = (s) => crypto.createHash('md5').update(s).digest('hex');
const serialize = (meta) => `${JSON.stringify(meta, null, 2)}\n`;

/** CJK 宽度补齐（半角 1 / 全角 2） */
const width = (s) =>
  [...String(s)].reduce((k, ch) => k + (ch.codePointAt(0) > 127 ? 2 : 1), 0);
const w = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));

/** 行级 LCS diff → { removed:[], added:[], changedLines }（够用即止，不做行内字符 diff） */
function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const removed = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removed.push(a[i++]);
    } else {
      added.push(b[j++]);
    }
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added, changedLines: removed.length + added.length };
}

if (!fs.existsSync(META_FILE)) {
  console.error(`❌ 找不到 tree-meta：${META_FILE}`);
  process.exit(2);
}

// ================= ① 扫描 + 计划 =================
const rawBefore = fs.readFileSync(META_FILE, 'utf8');
const meta = JSON.parse(rawBefore);
const beforeMd5 = md5(META_FILE);
const trees = meta.trees || {};

const rows = [];
for (const [key, entry] of Object.entries(trees)) {
  const treeId = entry?.tree_id || key;
  const code = String(entry?.origin_code ?? '').trim();
  const current = String(entry?.origin ?? '');

  if (!code) {
    rows.push({ key, treeId, code: '', current, expected: '', action: 'no-code' });
    continue;
  }
  const expected = resolveOrigin(code).display;
  if (!isKnownOriginCode(code) || !expected) {
    // 未知码 / 反查为空：**不改写**（把码吃成空串是二次污染），交人工裁定
    rows.push({ key, treeId, code, current, expected, action: 'blocked-unknown-code' });
    continue;
  }
  rows.push({
    key,
    treeId,
    code,
    current,
    expected,
    action: current === expected ? 'ok' : 'fix',
  });
}

const coded = rows.filter((r) => r.action !== 'no-code');
const fixRows = rows.filter((r) => r.action === 'fix');
const okRows = rows.filter((r) => r.action === 'ok');
const blockedRows = rows.filter((r) => r.action === 'blocked-unknown-code');
const inconsistent = fixRows.length + blockedRows.length;

// ================= ② 打印映射表 =================
console.log('═'.repeat(118));
console.log(`tree-meta：${META_FILE}${IS_COPY ? '（副本演练）' : '（★真源★）'}`);
console.log(`模式：${CHECK ? '--check（只校验，不写盘）' : APPLY ? '--apply（写盘）' : 'dry-run（默认，不写盘）'}`);
console.log(`规约：\`origin\` 唯一来源 = resolveOrigin(origin_code).display（lib/geo.js）；只改 \`origin\` 一个字段`);
console.log(`md5（当前文件）= ${beforeMd5}`);
console.log('═'.repeat(118));
console.log(
  `${w('tree_id', 18)}${w('origin_code', 12)}${w('origin（现值）', 28)}${w('resolveOrigin(code).display', 30)}判定`,
);
console.log('─'.repeat(118));
for (const r of rows) {
  const mark =
    r.action === 'ok'
      ? '✅ 已一致'
      : r.action === 'fix'
        ? '🔧 待修正'
        : r.action === 'no-code'
          ? '· 无码（契约外，不动）'
          : '⚠️ 未知码（需人工裁定，不动）';
  console.log(
    `${w(r.treeId, 18)}${w(r.code || '(空)', 12)}${w(r.current === '' ? '(空串)' : r.current, 28)}` +
      `${w(r.code ? r.expected || '(反查为空)' : '—', 30)}${mark}`,
  );
}
console.log('─'.repeat(118));
console.log(
  `共 ${rows.length} 棵：有码 ${coded.length}（已一致 ${okRows.length} / 待修正 ${fixRows.length}）` +
    ` / 无码 ${rows.length - coded.length}（不碰） / 未知码 ${blockedRows.length}（不动）`,
);

// ================= ③ --check 守卫 =================
if (CHECK) {
  if (!inconsistent) {
    console.log('\n✅ --check 通过：全部有码树的 `origin` == resolveOrigin(code).display（exit 0）');
    process.exit(0);
  }
  console.log(`\n❌ --check 未通过：${inconsistent} 棵不一致（exit 1）`);
  for (const r of fixRows) {
    console.log(`   MISMATCH tree=${r.treeId} code=${r.code} current=${JSON.stringify(r.current)} expected=${JSON.stringify(r.expected)}`);
  }
  for (const r of blockedRows) {
    console.log(`   UNKNOWN-CODE tree=${r.treeId} code=${JSON.stringify(r.code)} current=${JSON.stringify(r.current)}（需人工裁定，本脚本不改写）`);
  }
  process.exit(1);
}

// ================= ④ 候选内容（不落盘） =================
// 深拷贝候选，仅改 `origin`
const next = JSON.parse(rawBefore);
const perTree = [];
for (const r of fixRows) {
  const entry = Object.values(next.trees).find((t) => t && (t.tree_id || '') === r.treeId) || next.trees[r.key];
  const beforeEntry = JSON.stringify(entry, null, 2);
  entry.origin = r.expected;
  const afterEntry = JSON.stringify(entry, null, 2);
  const d = lineDiff(beforeEntry, afterEntry);
  perTree.push({ ...r, removed: d.removed, added: d.added, changedLines: d.changedLines });
}

// 自检：屏掉每个 `origin` 后，候选与原文必须逐字节相同 —— 证明只动了 origin
const maskOrigin = (text) => text.replace(/("origin"\s*:\s*)("(?:[^"\\]|\\.)*")/g, '$1"__MASKED__"');
const onlyOriginChanged = maskOrigin(rawBefore) === maskOrigin(serialize(next));
if (!onlyOriginChanged) {
  console.error('❌ 自检失败：除 origin 之外的字段发生了变化（拒绝写入）');
  process.exit(1);
}

const rawAfter = serialize(next);
const afterMd5 = md5s(rawAfter);
const fileDiff = lineDiff(rawBefore, rawAfter);

console.log('\n──── 计划明细（逐树，origin 单字段） ────');
if (!perTree.length) {
  console.log('（无待修正项）');
}
for (const r of perTree) {
  console.log(`${r.treeId}  [code ${r.code}]  改动 ${r.changedLines} 行`);
  for (const line of r.removed) console.log(`  -${line.replace(/^\s*/, '')}`);
  for (const line of r.added) console.log(`  +${line.replace(/^\s*/, '')}`);
}
console.log(`\n自检：屏掉 origin 后原文 == 候选 ⇒ 仅 origin 变动 = ${onlyOriginChanged ? '✅' : '❌'}`);
console.log(`md5（写入前）= ${beforeMd5}`);
console.log(`md5（写入后）= ${afterMd5}${rawAfter === rawBefore ? '  （内容无变化）' : ''}`);
console.log(`整文件 diff：-${fileDiff.removed.length} / +${fileDiff.added.length} 行`);

if (!APPLY) {
  console.log('\n（dry-run，未写盘。加 --apply 才真正写 meta；--check 为只读守卫。）');
  process.exit(0);
}

if (!fixRows.length) {
  console.log('\n✅ 无待修正项（幂等空跑）：未写盘，文件 md5 保持 ' + beforeMd5);
  if (blockedRows.length) {
    console.log(`⚠️ 仍有 ${blockedRows.length} 棵未知码需人工裁定（见上表）`);
    process.exit(1);
  }
  process.exit(0);
}

// ================= ⑤ 备份 → 写入 =================
const bakDir = path.join(BAK_ROOT, `${STAMP}-origin-display-repair${IS_COPY ? '-copy' : ''}`);
fs.mkdirSync(bakDir, { recursive: true });
let bakFile = path.join(bakDir, 'tree-meta.json');
let seq = 1;
while (fs.existsSync(bakFile)) bakFile = path.join(bakDir, `tree-meta.${++seq}.json`);
fs.copyFileSync(META_FILE, bakFile);
const bakMd5 = md5(bakFile);
if (bakMd5 !== beforeMd5) {
  console.error(`❌ 备份 md5 与写入前不一致（${bakMd5} != ${beforeMd5}），拒绝写入`);
  process.exit(1);
}
fs.writeFileSync(path.join(bakDir, `md5-before.txt`), `${beforeMd5}  ${META_FILE}\n`, 'utf8');
fs.writeFileSync(
  path.join(bakDir, 'repair-plan.txt'),
  [
    `target: ${META_FILE}`,
    `md5-before: ${beforeMd5}`,
    `md5-after(expected): ${afterMd5}`,
    ...perTree.map((r) => `${r.treeId}\tcode=${r.code}\t${r.current}\t=>\t${r.expected}`),
    '',
  ].join('\n'),
  'utf8',
);

fs.writeFileSync(META_FILE, rawAfter, 'utf8');

// ---- 写后自校验（重读真盘：md5 + 逐树重算） ----
const readBack = fs.readFileSync(META_FILE, 'utf8');
const gotMd5 = md5(META_FILE);
console.log(`\n📦 备份：${bakFile}（md5 ${bakMd5}）`);
console.log(`md5（写入前）= ${beforeMd5}`);
console.log(`md5（写入后）= ${gotMd5}`);
console.log(`✅ 已写入 ${fixRows.length} 棵树的 origin → ${META_FILE}`);

const verify = [];
for (const [k, t] of Object.entries(JSON.parse(readBack).trees || {})) {
  const code = String(t?.origin_code ?? '').trim();
  if (!code) continue;
  const exp = resolveOrigin(code).display;
  const cur = String(t?.origin ?? '');
  verify.push({ treeId: t.tree_id || k, code, cur, exp, ok: !!exp && cur === exp });
}
const bad = verify.filter((v) => !v.ok);
console.log(`\n写后自校验（重读真盘，有码 ${verify.length} 棵）：${bad.length ? `❌ ${bad.length} 棵仍不一致` : '✅ 全部一致'}`);
for (const v of verify) console.log(`   ${v.ok ? 'OK ' : 'BAD'} ${v.treeId} ${v.code} → ${JSON.stringify(v.cur)}`);
console.log(`文件 md5 与候选一致 = ${gotMd5 === afterMd5 ? '✅' : '❌'}`);

console.log(`\n↩️ 回滚命令：cp ${bakFile} ${META_FILE}`);
console.log(`   （回滚后 md5 应回到 ${beforeMd5}；校验：md5 -q ${META_FILE}）`);
console.log(`   守 卫：node scripts/fix-tree-origin-display.mjs --check   # 应 exit 0`);

if (bad.length || gotMd5 !== afterMd5) process.exit(1);
if (blockedRows.length) {
  console.log(`\n⚠️ 仍有 ${blockedRows.length} 棵未知码需人工裁定`);
  process.exit(1);
}
process.exit(0);
