#!/usr/bin/env node
/**
 * fix-stale-branch-placeholders.mjs
 *
 * 清除历史「拆分 / 分迁」流程在原树留下的**孤立占位节点**
 * （person.external_link_type === 'branch' 且 external_tree 指向拆出去的那棵树）。
 *
 * 产品决策（Kevin 2026-09-17）：这种占位不应存在于原树里，必须清除。
 *
 * 默认 **dry-run**（只列将要删的节点与详情文件，不写盘）；加 `--apply` 才写盘。
 *
 * 用法：
 *   node scripts/fix-stale-branch-placeholders.mjs                 # dry-run，全库扫描
 *   node scripts/fix-stale-branch-placeholders.mjs --apply         # 真正删除
 *   node scripts/fix-stale-branch-placeholders.mjs --tree=ji_23395_01          # 只看某棵树
 *   node scripts/fix-stale-branch-placeholders.mjs --tree=ji_23395_01 --apply
 *   node scripts/fix-stale-branch-placeholders.mjs --root=/tmp/replica --apply # 指向数据副本
 *
 * ⚠️ 前置三件套（本项目踩过的坑）：
 *   1) 先停 compat-api（内存 treeCache 常驻，服务活着时任何写入都会把旧快照回写）。
 *   2) 进程必须 COMPAT_SOURCE=local；且**不得**设置 COMPAT_META_FILE / COMPAT_OUT_DIR /
 *      NODE_TEST_CONTEXT —— 那些是沙箱标记，会让 store.js 把读写都落到副本。
 *      本脚本直接 fs 读写真源，不走 store.js，故不受沙箱标记影响；但为避免你在
 *      “以为在改副本” 的情况下改真源，脚本在检测到上述标记时会**拒绝运行**（除 --allow-sandbox-markers）。
 *   3) 复核**不要**用同进程的 getTree()（缓存会返回改前值）→ 磁盘直读 + 重启后走 HTTP API。
 *
 * 删除判据（**全部满足才删**；任一不满足 → 只报告不删）：
 *   A. external_link_type === 'branch'
 *   B. external_tree 非空
 *   C. 该 handle 在**全库所有** families 里都没有任何槽位（父 / 母 / 子女 / 配偶）
 *   D. 遍历 migrate-output/trees/*.json 全库，没有任何节点的 external_person_handle 指向它
 *   E. 它不是任何 config/tree-meta.json 条目的 founder_handle
 *   （额外补强）D2. 任何详情文档的 attributes / 字段里没有 external_person_handle 指向它
 *
 * 备份：脚本自身不删前备份 —— 请先手工 `cp` 树 JSON + 详情文件 + tree-meta.json 到
 *      /tmp/jiazu-bak-branch-<ts>/，并记录删前 md5（`md5 -r`）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');

// ---------- 参数 ----------
function parseArgs(argv) {
  const out = { apply: false, tree: null, root: DEFAULT_ROOT, allowSandbox: false, quiet: false };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
    else if (a === '--allow-sandbox-markers') out.allowSandbox = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a.startsWith('--tree=')) out.tree = a.slice('--tree='.length);
    else if (a.startsWith('--root=')) out.root = path.resolve(a.slice('--root='.length));
    else if (a === '-h' || a === '--help') { out.help = true; }
    else { console.error(`未知参数：${a}`); process.exit(2); }
  }
  return out;
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  process.exit(0);
}

// ---------- 沙箱标记拦截（防“以为在改副本”）----------
const SANDBOX_VARS = ['COMPAT_META_FILE', 'COMPAT_OUT_DIR', 'NODE_TEST_CONTEXT'];
const sandboxHits = SANDBOX_VARS.filter((k) => {
  const v = process.env[k];
  return v !== undefined && v !== '';
});
if (sandboxHits.length && !args.allowSandbox) {
  console.error(
    `❌ 检测到沙箱标记环境变量：${sandboxHits.join(', ')}\n` +
    `   这些是 store.js 的沙箱判定开关（读写根会落到副本），会让本脚本的行为与真源不一致。\n` +
    `   请 unset 后重跑（真源手术时禁用）；确实要在副本上跑 → 加 --allow-sandbox-markers。`
  );
  process.exit(3);
}
if ((process.env.COMPAT_SOURCE || '') !== 'local' && (process.env.COMPAT_SOURCE || '') !== '') {
  console.warn(`⚠️ COMPAT_SOURCE=${process.env.COMPAT_SOURCE}（本脚本直接读盘，不受影响；真源手术建议 COMPAT_SOURCE=local）`);
} else if (!process.env.COMPAT_SOURCE) {
  console.warn('⚠️ 未设置 COMPAT_SOURCE=local（本脚本直接读盘，不受影响；仅提醒）');
}

// ---------- 路径 ----------
const TREES_DIR = path.join(args.root, 'migrate-output', 'trees');
const DETAILS_DIR = path.join(args.root, 'migrate-output', 'details');
const META_FILE = path.join(args.root, 'config', 'tree-meta.json');

for (const p of [TREES_DIR, DETAILS_DIR, META_FILE]) {
  if (!fs.existsSync(p)) { console.error(`❌ 缺少路径：${p}`); process.exit(1); }
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ---------- 载入全库 ----------
const allTreeFiles = fs
  .readdirSync(TREES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const trees = new Map(); // treeId -> {file, json}
for (const f of allTreeFiles) {
  const json = readJson(path.join(TREES_DIR, f));
  const treeId = json.tree_id || f.replace(/\.json$/, '');
  trees.set(treeId, { file: path.join(TREES_DIR, f), json });
}
const meta = readJson(META_FILE);
const metaTrees = meta.trees || {};

// ---------- 全库引用索引（判据 D / D2 / C / E）----------
// handle -> 出现在哪些 families 的哪个槽位
const slotIndex = new Map();      // handle -> [{tree, family, slot}]
// external_person_handle 目标 -> 引用者
const ephRefs = new Map();        // handle -> [{where}]
// founder_handle
const founderHandles = new Set();

for (const [treeId, { json }] of trees) {
  for (const [fh, fam] of Object.entries(json.families || {})) {
    const push = (h, slot) => {
      if (!h) return;
      if (!slotIndex.has(h)) slotIndex.set(h, []);
      slotIndex.get(h).push({ tree: treeId, family: fh, slot });
    };
    push(fam.father_handle, 'father');
    push(fam.mother_handle, 'mother');
    for (const c of fam.child_handles || []) push(c, 'child');
  }
  for (const [h, p] of Object.entries(json.people || {})) {
    const eph = p && p.external_person_handle;
    if (eph) {
      if (!ephRefs.has(eph)) ephRefs.set(eph, []);
      ephRefs.get(eph).push({ tree: treeId, person: h, gramps_id: p.gramps_id });
    }
  }
}
for (const [tid, e] of Object.entries(metaTrees)) {
  if (e && e.founder_handle) founderHandles.add(e.founder_handle);
}

// 详情文档里的 external_person_handle 引用（补强判据 D2）
const detailFiles = fs.readdirSync(DETAILS_DIR).filter((f) => f.endsWith('.json'));
const detailEphRefs = new Map(); // handle -> [{file}]
for (const f of detailFiles) {
  let doc;
  try { doc = readJson(path.join(DETAILS_DIR, f)); } catch { continue; }
  const vals = [];
  if (doc.external_person_handle) vals.push(doc.external_person_handle);
  for (const a of doc.attributes || []) {
    if (a && a.key === 'external_person_handle' && a.value) vals.push(a.value);
  }
  for (const v of vals) {
    if (!detailEphRefs.has(v)) detailEphRefs.set(v, []);
    detailEphRefs.get(v).push({ file: f });
  }
}

// ---------- 找候选 ----------
const targetTreeIds = args.tree ? [args.tree] : [...trees.keys()].sort();
for (const t of targetTreeIds) {
  if (!trees.has(t)) { console.error(`❌ 树不存在：${t}`); process.exit(1); }
}

const plan = [];        // 通过全部判据 → 将删
const rejected = [];    // 命中 branch 占位但判据不满足 → 只报告

for (const treeId of targetTreeIds) {
  const { json: tree } = trees.get(treeId);
  for (const [handle, p] of Object.entries(tree.people || {})) {
    if (!p) continue;
    if (p.external_link_type !== 'branch') continue;      // 判据 A
    if (!p.external_tree || !String(p.external_tree).trim()) continue; // 判据 B（空 external_tree 不算占位）

    const fails = [];
    const slots = slotIndex.get(handle) || [];            // 判据 C
    if (slots.length) fails.push(`families 槽位 ${slots.length} 处：${slots.map((s) => `${s.tree}/${s.family}:${s.slot}`).join(', ')}`);
    const refs = ephRefs.get(handle) || [];               // 判据 D
    if (refs.length) fails.push(`external_person_handle 被引用 ${refs.length} 处：${refs.map((r) => `${r.tree}/${r.person}`).join(', ')}`);
    const drefs = detailEphRefs.get(handle) || [];        // 判据 D2
    if (drefs.length) fails.push(`详情文档 external_person_handle 被引用：${drefs.map((r) => r.file).join(', ')}`);
    if (founderHandles.has(handle)) fails.push('是某个 tree-meta 条目的 founder_handle'); // 判据 E

    const detailFile = path.join(DETAILS_DIR, `${treeId}:${handle}.json`);
    const entry = {
      tree_id: treeId,
      handle,
      gramps_id: p.gramps_id,
      name: p.name,
      external_tree: p.external_tree,
      detail_file: fs.existsSync(detailFile) ? detailFile : null,
      detail_exists: fs.existsSync(detailFile),
    };
    if (fails.length) rejected.push({ ...entry, fails });
    else plan.push(entry);
  }
}

// ---------- 报告 ----------
const mode = args.apply ? 'APPLY（写盘）' : 'DRY-RUN（只读）';
console.log(`\n=== fix-stale-branch-placeholders | ${mode} ===`);
console.log(`数据根：${args.root}`);
console.log(`扫描树：${targetTreeIds.length} 棵（${args.tree ? args.tree : '全部'}）`);

console.log(`\n将删除的「分迁占位」节点（${plan.length}）：`);
if (!plan.length) console.log('  （无）');
for (const e of plan) {
  console.log(
    `  - ${e.tree_id}  ${e.gramps_id}  ${e.handle}  ${e.name}  → external_tree=${e.external_tree}` +
    `  详情=${e.detail_exists ? '有（将删）' : '无'}`
  );
}

if (rejected.length) {
  console.log(`\n⚠️ 命中 branch 占位但**判据不满足**、不会删除（${rejected.length}）：`);
  for (const e of rejected) {
    console.log(`  - ${e.tree_id} ${e.gramps_id} ${e.name}`);
    for (const f of e.fails) console.log(`      ✗ ${f}`);
  }
}

console.log(`\n计数：将删节点 ${plan.length}，将删详情文件 ${plan.filter((e) => e.detail_exists).length}，被拒 ${rejected.length}`);
console.log(`删除后预计：树 ${[...new Set(plan.map((e) => e.tree_id))].map((t) => `${t} people ${Object.keys(trees.get(t).json.people).length} → ${Object.keys(trees.get(t).json.people).length - plan.filter((e) => e.tree_id === t).length}`).join(' | ') || '（无变化）'}`);

if (!args.apply) {
  console.log('\n（dry-run 模式，未写盘。加 --apply 才真正删除。）\n');
  process.exit(0);
}

if (rejected.length) {
  console.error('\n❌ 有候选不满足判据 —— 按约定「有候选不满足就只报告不删」，本次不写盘。');
  process.exit(4);
}

// ---------- 写盘（surgical：只摘 people 条目 + 删详情文件；不动 version/updated_at）----------
const planByTree = new Map();
for (const e of plan) {
  if (!planByTree.has(e.tree_id)) planByTree.set(e.tree_id, []);
  planByTree.get(e.tree_id).push(e);
}

let removedPeople = 0;
let removedDetails = 0;

for (const [treeId, entries] of planByTree) {
  const { file, json: tree } = trees.get(treeId);
  const before = Object.keys(tree.people).length;
  for (const e of entries) delete tree.people[e.handle];
  const after = Object.keys(tree.people).length;
  // 与 lib/store.js saveTree 同一序列化形状：JSON.stringify(tree, null, 2)，无尾换行
  fs.writeFileSync(file, JSON.stringify(tree, null, 2));
  removedPeople += before - after;
  console.log(`✓ 已写 ${file}：people ${before} → ${after}（-${before - after}）`);
}

for (const e of plan) {
  if (e.detail_file && fs.existsSync(e.detail_file)) {
    fs.unlinkSync(e.detail_file);
    removedDetails += 1;
    console.log(`✓ 已删详情 ${e.detail_file}`);
  }
}

console.log(`\n完成：删除节点 ${removedPeople}，删除详情文件 ${removedDetails}。`);
console.log('下一步：重启 compat-api（沿用原命令行与环境变量），再走 HTTP API 回读验证。\n');
