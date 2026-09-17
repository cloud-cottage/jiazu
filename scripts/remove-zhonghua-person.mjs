#!/usr/bin/env node
/**
 * remove-zhonghua-person.mjs
 *
 * 一次性数据清理：从指定树（默认中华世本 `zhonghua`）删除**孤立节点**（本案 = I0046 顾清学）。
 *
 * 背景：zhonghua/I0046 是「家族树 gu_39038_01 的始祖（补录）」的历史遗留节点——
 * 与祖谱 gu_39038 的 I000139、家族树 gu_39038_01 的 I000143 是同名**无指针双记录**。
 * Kevin 拍板（2026-09-18）：在世本中删除该孤立节点。
 *
 * 默认 **dry-run**（只打印计划与全部前置断言结果，不写盘）；加 `--apply` 才删。
 *
 * 用法：
 *   node scripts/remove-zhonghua-person.mjs --gramps-id=I0046                       # dry-run（真源，只读）
 *   node scripts/remove-zhonghua-person.mjs --gramps-id=I0046 --master-ok --apply   # 真源删除（世本需 --master-ok）
 *   node scripts/remove-zhonghua-person.mjs --handle=103ff1c309eb7bf2cb4f6ff1762e --root=/tmp/replica --apply
 *   node scripts/remove-zhonghua-person.mjs --gramps-id=I0046 --tree=ji_23395_01 --root=/tmp/replica
 *
 * 参数：
 *   --gramps-id=<I0046|0046>   人读编号（大小写/I 前缀均容忍）
 *   --handle=<hex>            机器主键（16–64 位 hex；与 --gramps-id 二选一；两者都给则以 --handle 为准）
 *   --tree=<tree_id>           目标树，默认 zhonghua
 *   --root=<dir>               数据根，默认仓库根（由脚本位置推导，不写死真源路径）
 *   --apply                    真正写盘（默认 dry-run）
 *   --master-ok                目标树是世本（tree-meta `is_master === true`）时**必须显式给出**才允许写盘
 *   --allow-sandbox-markers    确有需要时放行 COMPAT_* / NODE_TEST_CONTEXT 沙箱标记
 *   --backup-dir=<dir>         自定义备份目录（默认 /tmp/jiazu-bak-<timestamp>）
 *
 * 前置安全断言（**任一不满足 → 拒结（exit 4）并打印具体原因；禁止“强行删”**）：
 *   ① 节点存在于目标树 JSON
 *   ② 无 `parent_family`（空串视为无）且 `spouse_families` 为空
 *   ③ 不被**任何树** families 的 father_handle / mother_handle / child_handles 引用
 *      （口径比“该树内”更严：本项目「跨树指针一律拒绝」，删节点是唯一不可逆操作）
 *   ④ 全库零跨树引用：所有树 people 的 `external_person_handle`（并额外做「全部字符串字段
 *      精确等于该 handle」的兜底扫描）、`config/tree-meta.json` 的 `founder_handle` /
 *      `master_handle`、以及**所有详情文档的属性值**（跳过目标自身的详情文档）
 *   ⑤ 不是任何 tree-meta 条目的 `founder_handle`（也检查 `founder_gramps_id` 与本树 JSON 的 `founder_gramps_id`）
 *   ⑥ 目标树是世本（`is_master === true`）时，**写盘必须显式带 `--master-ok`**（exit 5；dry-run 只警告不拦）
 *
 * `--apply` 动作：
 *   - 从树 JSON `people` 删除该 handle；**同一次写入里**顺手清掉 families 中可能存在的槽位引用
 *     （father_handle/mother_handle 置空串、child_handles 过滤）——前置③已保证不会有，代码仍兼容
 *   - 删除对应详情文档 `migrate-output/details/<tree_id>:<handle>.json`（不存在 → 打印「无详情，跳过」）
 *   - 先备份到 `/tmp/jiazu-bak-<timestamp>/`（保留相对路径）
 *   - 打印改前/改后 `people` 数 + 改前/改后 md5
 *
 * 写盘风格：保持原 JSON 缩进与末尾换行（树 JSON 通常 2 空格且**无**末尾换行 —— 先读现有文件判定）；
 *           `version` / `updated_at` **不动**（与 scripts/fix-stale-branch-placeholders.mjs 同口径：最小改动）。
 *
 * 幂等：第二次跑会报「节点不存在，无事可做」并 **exit 0**（不写盘）。
 *
 * ⚠️ 前置三件套：先停 compat-api（内存 treeCache 常驻）；进程建议 COMPAT_SOURCE=local；
 *    复核不要用同进程缓存读取 —— 用本脚本打印的 md5 或重启后走 HTTP API。
 *
 * 退出码：0 = 正常（含 dry-run / 幂等无事可做）；2 = 参数错误；3 = 命中沙箱标记；
 *         4 = 前置断言不满足（拒结，含「世本缺 --master-ok」）；6 = 落盘前自检失败（脚本缺陷）。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const SANDBOX_VARS = ['COMPAT_META_FILE', 'COMPAT_OUT_DIR', 'NODE_TEST_CONTEXT'];
// ⚠️ 本项目 handle 长度不统一：全库实测 24/26/27/28/32 位 hex（世本多数为 28 位，如本案 I0046 的
//    `103ff1c309eb7bf2cb4f6ff1762e` 是 28 位）→ **校验只按「16–64 位 hex」**，别写死 24 位。
const HANDLE_RE = /^[0-9a-f]{16,64}$/i;

// ---------- 参数 ----------
function parseArgs(argv) {
  const out = {
    apply: false, tree: 'zhonghua', root: DEFAULT_ROOT, grampsId: null, handle: null,
    masterOk: false, allowSandbox: false, backupDir: null, help: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
    else if (a === '--master-ok') out.masterOk = true;
    else if (a === '--allow-sandbox-markers') out.allowSandbox = true;
    else if (a.startsWith('--gramps-id=')) out.grampsId = a.slice('--gramps-id='.length).trim();
    else if (a.startsWith('--handle=')) out.handle = a.slice('--handle='.length).trim();
    else if (a.startsWith('--tree=')) out.tree = a.slice('--tree='.length).trim();
    else if (a.startsWith('--root=')) out.root = path.resolve(a.slice('--root='.length));
    else if (a.startsWith('--backup-dir=')) out.backupDir = path.resolve(a.slice('--backup-dir='.length));
    else if (a === '-h' || a === '--help') out.help = true;
    else { console.error(`未知参数：${a}`); process.exit(2); }
  }
  return out;
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  process.exit(0);
}
if (!args.grampsId && !args.handle) {
  console.error('❌ 必须给 --gramps-id=<I0046> 或 --handle=<16–64 位 hex> 之一');
  process.exit(2);
}
if (args.handle && !HANDLE_RE.test(args.handle)) {
  console.error(`❌ --handle 形状非法（应为 16–64 位 hex）：${JSON.stringify(args.handle)}`);
  process.exit(2);
}
if (args.handle && args.handle.length !== 24) {
  console.log(`ℹ️ --handle 长度 ${args.handle.length}（本项目 handle 长度不统一 24/26/27/28/32 位，按 16–64 位 hex 校验通过）`);
}

// ---------- 沙箱标记拦截（防“以为在改副本”）----------
const sandboxHits = SANDBOX_VARS.filter((k) => {
  const v = process.env[k];
  return v !== undefined && v !== '';
});
if (sandboxHits.length && !args.allowSandbox) {
  console.error(
    `❌ 检测到沙箱标记环境变量：${sandboxHits.join(', ')}\n` +
    `   这些是 store.js 的沙箱判定开关（读写根会落到副本）。请 unset 后重跑；\n` +
    `   确实要在副本上跑 → 改用 --root=<副本>（推荐），或确认无误后加 --allow-sandbox-markers。`
  );
  process.exit(3);
}

// ---------- 路径 ----------
const TREES_DIR = path.join(args.root, 'migrate-output', 'trees');
const DETAILS_DIR = path.join(args.root, 'migrate-output', 'details');
const META_FILE = path.join(args.root, 'config', 'tree-meta.json');
for (const p of [TREES_DIR, DETAILS_DIR, META_FILE]) {
  if (!fs.existsSync(p)) { console.error(`❌ 缺少路径：${p}`); process.exit(2); }
}

// 备份目录（一次确定，dry-run 预览与 --apply 实际使用同一个）
const BACKUP_TS = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = args.backupDir || path.join('/tmp', `jiazu-bak-${BACKUP_TS}`);

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const detectIndent = (raw) => { const m = raw.match(/^([ \t]+)"/m); return m ? m[1] : '  '; };
const detectTrailing = (raw) => (raw.endsWith('\n') ? '\n' : '');

// ---------- 载入全库 ----------
const treeFiles = fs.readdirSync(TREES_DIR).filter((f) => f.endsWith('.json')).sort();
const trees = new Map(); // treeId -> { file, raw, json }
for (const f of treeFiles) {
  const file = path.join(TREES_DIR, f);
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw);
  const treeId = json.tree_id || f.replace(/\.json$/, '');
  trees.set(treeId, { file, raw, json });
}
if (!trees.has(args.tree)) {
  console.error(`❌ 目标树不存在：${args.tree}（可用：${[...trees.keys()].join(', ')}）`);
  process.exit(2);
}
const meta = readJson(META_FILE);
const metaTrees = meta.trees || {};
const metaEntry = metaTrees[args.tree] || null;
const isMaster = !!(metaEntry && metaEntry.is_master === true);

const target = trees.get(args.tree);
const tree = target.json;
const peopleMap = tree.people || {};

// ---------- 解析节点 ----------
const normId = (s) => String(s || '').trim().replace(/^i/i, '').toUpperCase();
let handle = args.handle;
let resolvedBy = '--handle';
if (!handle) {
  const want = normId(args.grampsId);
  for (const [h, p] of Object.entries(peopleMap)) {
    if (p && normId(p.gramps_id) === want) { handle = h; resolvedBy = `--gramps-id=${args.grampsId} → ${h}`; break; }
  }
}

console.log(`\n=== remove-zhonghua-person | ${args.apply ? 'APPLY（写盘）' : 'DRY-RUN（只读）'} ===`);
console.log(`数据根：${args.root}`);
console.log(`目标树：${args.tree}${isMaster ? '（tree-meta is_master=true，世本）' : ''}  people=${Object.keys(peopleMap).length}`);
console.log(`解析方式：${resolvedBy}${handle ? `  handle=${handle}` : ''}`);

if (!handle || !peopleMap[handle]) {
  // 幂等路径
  console.log(`\n节点不存在，无事可做（0 变更，未写盘）。`);
  console.log(`  ${args.grampsId ? `gramps_id=${args.grampsId} / ` : ''}handle=${args.handle || '(未解析到)'} 不在 ${args.tree} 的 people 中。\n`);
  process.exit(0);
}

const person = peopleMap[handle];
console.log(`\n命中节点：${person.gramps_id}  ${person.name}  handle=${handle}  gender=${person.gender}`);
console.log(`  parent_family=${JSON.stringify(person.parent_family || '')}  spouse_families=${JSON.stringify(person.spouse_families || [])}`);
console.log(`  external_tree=${JSON.stringify(person.external_tree || '')}  external_person_handle=${JSON.stringify(person.external_person_handle || '')}  external_link_type=${JSON.stringify(person.external_link_type || '')}`);

// ---------- 前置安全断言 ----------
const failed = [];   // 硬拒结

// ① 节点存在（上面已保证）
console.log(`\n① 节点存在于 ${args.tree}.people ✓`);

// ② 无家族关系
{
  const pf = person.parent_family;
  const sf = Array.isArray(person.spouse_families) ? person.spouse_families : [];
  const bad = [];
  if (pf && String(pf).trim()) bad.push(`parent_family=${pf}`);
  if (sf.filter(Boolean).length) bad.push(`spouse_families=${JSON.stringify(sf)}`);
  if (bad.length) failed.push(`② 节点仍有家族关系：${bad.join(' / ')}`);
  else console.log(`② 无 parent_family、spouse_families 为空 ✓`);
}

// ③ 不被任何树 families 的槽位引用
{
  const hits = [];
  for (const [tid, { json: t }] of trees) {
    for (const [fh, fam] of Object.entries(t.families || {})) {
      if (fam.father_handle === handle) hits.push(`${tid}/${fh}:father`);
      if (fam.mother_handle === handle) hits.push(`${tid}/${fh}:mother`);
      for (const c of fam.child_handles || []) if (c === handle) hits.push(`${tid}/${fh}:child`);
    }
  }
  if (hits.length) failed.push(`③ 被 families 槽位引用 ${hits.length} 处：${hits.join(', ')}`);
  else console.log(`③ 不被任何树（共 ${trees.size} 棵）families 的 father/mother/child 槽位引用 ✓`);
}

// ④ 全库零跨树引用
{
  const ephHits = [];
  const genericHits = [];
  for (const [tid, { json: t }] of trees) {
    for (const [h, p] of Object.entries(t.people || {})) {
      if (tid === args.tree && h === handle) continue; // 跳过目标自身
      if (p && p.external_person_handle === handle) ephHits.push(`${tid}/${p.gramps_id || h}`);
      for (const [k, v] of Object.entries(p || {})) {
        if (typeof v === 'string' && v === handle) genericHits.push(`${tid}/${p.gramps_id || h}.${k}`);
      }
    }
  }
  const metaHandleHits = [];
  for (const [tid, e] of Object.entries(metaTrees)) {
    if (!e) continue;
    if (e.founder_handle === handle) metaHandleHits.push(`${tid}:founder_handle`);
    if (e.master_handle === handle) metaHandleHits.push(`${tid}:master_handle`);
  }
  const detailHits = [];
  const ownDetail = `${args.tree}:${handle}.json`;
  for (const f of fs.readdirSync(DETAILS_DIR).filter((f) => f.endsWith('.json'))) {
    if (f === ownDetail) continue; // 跳过目标自身详情文档
    let doc;
    try { doc = readJson(path.join(DETAILS_DIR, f)); } catch { continue; }
    const stack = [doc];
    let hit = null;
    while (stack.length && !hit) {
      const cur = stack.pop();
      if (cur === null || typeof cur !== 'object') continue;
      for (const [k, v] of Object.entries(cur)) {
        if (typeof v === 'string' && v === handle) { hit = `${k}=${v}`; break; }
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    if (hit) detailHits.push(`${f}#${hit}`);
  }
  const refs = [];
  if (ephHits.length) refs.push(`people.external_person_handle：${ephHits.join(', ')}`);
  if (genericHits.length) refs.push(`其它字符串字段精确等于 handle：${genericHits.join(', ')}`);
  if (metaHandleHits.length) refs.push(`tree-meta：${metaHandleHits.join(', ')}`);
  if (detailHits.length) refs.push(`详情文档引用：${detailHits.join(', ')}`);
  if (refs.length) failed.push(`④ 存在跨树/外部引用：\n      - ${refs.join('\n      - ')}`);
  else console.log(`④ 全库零跨树引用 ✓（扫描 ${trees.size} 棵树 people + tree-meta founder/master_handle + ${fs.readdirSync(DETAILS_DIR).filter((f) => f.endsWith('.json')).length} 份详情文档的属性值；跳过目标自身）`);
}

// ⑤ 非 founder
{
  const hits = [];
  for (const [tid, e] of Object.entries(metaTrees)) {
    if (!e) continue;
    if (e.founder_handle === handle) hits.push(`${tid}:founder_handle`);
    if (tid === args.tree && e.founder_gramps_id && person.gramps_id && normId(e.founder_gramps_id) === normId(person.gramps_id)) {
      hits.push(`${tid}:founder_gramps_id=${e.founder_gramps_id}`);
    }
  }
  if (tree.founder_gramps_id && person.gramps_id && normId(tree.founder_gramps_id) === normId(person.gramps_id)) {
    hits.push(`${args.tree}.json:founder_gramps_id=${tree.founder_gramps_id}`);
  }
  if (hits.length) failed.push(`⑤ 该节点是始祖登记：${hits.join(', ')}（始祖节点不可删/不可迁出）`);
  else console.log(`⑤ 非任何 tree-meta 条目的 founder_handle，也不是本树 JSON 的 founder_gramps_id ✓`);
}

// ⑥ 世本需显式 --master-ok
if (isMaster) {
  if (args.masterOk) console.log(`⑥ 目标树是世本（is_master=true），已显式给出 --master-ok ✓`);
  else if (args.apply) failed.push(`⑥ 目标树 ${args.tree} 是世本（tree-meta is_master=true），写盘必须显式加 --master-ok`);
  else console.log(`⑥ ⚠️ 目标树是世本（is_master=true）：dry-run 放行，--apply 需显式 --master-ok`);
} else {
  console.log(`⑥ 目标树非世本（is_master≠true），无需 --master-ok ✓`);
}

// ---------- 计划与拒结 ----------
const detailFile = path.join(DETAILS_DIR, `${args.tree}:${handle}.json`);
const detailExists = fs.existsSync(detailFile);
const beforeCount = Object.keys(peopleMap).length;
let slotCleanupPreview = [];
for (const [fh, fam] of Object.entries(tree.families || {})) {
  if (fam.father_handle === handle) slotCleanupPreview.push(`${fh}:father`);
  if (fam.mother_handle === handle) slotCleanupPreview.push(`${fh}:mother`);
  for (const c of fam.child_handles || []) if (c === handle) slotCleanupPreview.push(`${fh}:child`);
}

console.log(`\n计划：`);
console.log(`  - ${args.tree}.people 删除 ${person.gramps_id} ${person.name}（handle=${handle}）：people ${beforeCount} → ${beforeCount - 1}`);
console.log(`  - families 槽位引用清理：${slotCleanupPreview.length ? slotCleanupPreview.join(', ') + `（${slotCleanupPreview.length} 处）` : '无（前置③已保证）'}`);
console.log(`  - 详情文档 ${detailFile}：${detailExists ? '存在，将删除' : '无详情，跳过'}`);
console.log(`  - 备份目录：${BACKUP_DIR}`);

if (failed.length) {
  console.error(`\n❌ 前置安全断言不满足 → 拒结（不写盘）。共 ${failed.length} 条：`);
  for (const f of failed) console.error(`  ✗ ${f}`);
  console.error('  按约定：任一不满足即拒结，禁止“强行删”。请先解除对应关系（认祖/跨树婚姻/家族槽位/始祖登记）再重试。\n');
  process.exit(4);
}

if (!args.apply) {
  console.log(`\n全部前置断言通过。dry-run 模式未写盘。加 --apply 才真正删除。${isMaster && !args.masterOk ? '（世本：--apply 还需 --master-ok）' : ''}\n`);
  process.exit(0);
}

// ---------- 备份 ----------
const backupDir = BACKUP_DIR;
const treeBeforeMd5 = md5(Buffer.from(target.raw, 'utf8'));
const detailBeforeMd5 = detailExists ? md5(fs.readFileSync(detailFile)) : null;

const bakTreeRel = path.join('migrate-output', 'trees', `${args.tree}.json`);
const bakTree = path.join(backupDir, bakTreeRel);
fs.mkdirSync(path.dirname(bakTree), { recursive: true });
fs.copyFileSync(target.file, bakTree);
console.log(`\n备份 → ${backupDir}`);
console.log(`  ✓ ${bakTreeRel}（md5 ${md5(fs.readFileSync(bakTree))}）`);
if (detailExists) {
  const bakDetail = path.join(backupDir, 'migrate-output', 'details', `${args.tree}:${handle}.json`);
  fs.mkdirSync(path.dirname(bakDetail), { recursive: true });
  fs.copyFileSync(detailFile, bakDetail);
  console.log(`  ✓ migrate-output/details/${args.tree}:${handle}.json（md5 ${detailBeforeMd5}）`);
}

// ---------- 写盘 ----------
const next = JSON.parse(target.raw);
delete next.people[handle];
let slotCleanup = 0;
for (const fam of Object.values(next.families || {})) {
  if (fam.father_handle === handle) { fam.father_handle = ''; slotCleanup += 1; }
  if (fam.mother_handle === handle) { fam.mother_handle = ''; slotCleanup += 1; }
  if (Array.isArray(fam.child_handles)) {
    const n = fam.child_handles.length;
    fam.child_handles = fam.child_handles.filter((c) => c !== handle);
    slotCleanup += n - fam.child_handles.length;
  }
}
// 自检：除 people 少一项 / 槽位清理外，其它键必须不变；people 里除目标外逐项相等
{
  const problems = [];
  for (const k of Object.keys(tree)) {
    if (k === 'people' || k === 'families') continue;
    if (JSON.stringify(tree[k]) !== JSON.stringify(next[k])) problems.push(`顶层键 ${k} 发生变化（不应改）`);
  }
  if (JSON.stringify(Object.keys(tree)) !== JSON.stringify(Object.keys(next))) problems.push('顶层键顺序发生变化');
  const a = { ...tree.people }; delete a[handle];
  if (JSON.stringify(a) !== JSON.stringify(next.people)) problems.push('people 其余节点内容/顺序发生变化');
  if (Object.prototype.hasOwnProperty.call(next.people, handle)) problems.push('目标 handle 仍在 people 中');
  const famKeysBefore = Object.keys(tree.families || {});
  const famKeysAfter = Object.keys(next.families || {});
  if (JSON.stringify(famKeysBefore) !== JSON.stringify(famKeysAfter)) problems.push('families 的家族集合发生变化（不应增删家族）');
  if (problems.length) {
    console.error(`❌ 落盘前自检不通过 → 拒写：\n  - ${problems.join('\n  - ')}`);
    process.exit(6);
  }
}

const indent = detectIndent(target.raw);
const trailing = detectTrailing(target.raw);
const outText = JSON.stringify(next, null, indent) + trailing;
fs.writeFileSync(target.file, outText);
const treeAfterMd5 = md5(fs.readFileSync(target.file));

console.log(`\n✓ 已写 migrate-output/trees/${args.tree}.json`);
console.log(`  people：${beforeCount} → ${Object.keys(next.people).length}（-${beforeCount - Object.keys(next.people).length}）`);
console.log(`  md5：${treeBeforeMd5} → ${treeAfterMd5}`);
console.log(`  缩进/末尾换行：indent=${JSON.stringify(indent)} trailing=${trailing ? '\\n' : '(无)'}（保持原风格）；version/updated_at 未改动（与 fix-stale-branch-placeholders.mjs 同口径）`);

if (detailExists) {
  fs.unlinkSync(detailFile);
  console.log(`✓ 已删详情文档 migrate-output/details/${args.tree}:${handle}.json（md5 改前 ${detailBeforeMd5}）`);
} else {
  console.log(`· 无详情，跳过（${detailFile} 不存在）`);
}

console.log(`\n完成：${args.tree} 删除 ${person.gramps_id} ${person.name}（handle=${handle}），清理 families 槽位 ${slotCleanup} 处。`);
console.log(`保留：祖谱 gu_39038 的 I000139、家族树 gu_39038_01 的 I000143 不受影响。`);
console.log('下一步：重启本地 compat-api（内存 treeCache）；云端副本需重跑 scripts/upload-migrated-to-cloudbase.mjs。\n');
