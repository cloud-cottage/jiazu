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
 * 用法（单节点）：
 *   node scripts/remove-zhonghua-person.mjs --gramps-id=I0046                       # dry-run（真源，只读）
 *   node scripts/remove-zhonghua-person.mjs --gramps-id=I0046 --master-ok --apply   # 真源删除（世本需 --master-ok）
 *   node scripts/remove-zhonghua-person.mjs --handle=103ff1c309eb7bf2cb4f6ff1762e --root=/tmp/replica --apply
 *   node scripts/remove-zhonghua-person.mjs --gramps-id=I0046 --tree=ji_23395_01 --root=/tmp/replica
 *
 * 用法（批量）：
 *   node scripts/remove-zhonghua-person.mjs --gramps-ids=I0000,I0045,I0047,I0051 --master-ok            # 批量 dry-run
 *   node scripts/remove-zhonghua-person.mjs --from-file=/tmp/list.txt --master-ok --apply               # 按文件批量删
 *   node scripts/remove-zhonghua-person.mjs --from-file=/tmp/list.txt --strict --apply                  # 严格模式：有被拒 → 整体不写
 *
 * 参数：
 *   --gramps-id=<I0046|0046>   人读编号（大小写/I 前缀均容忍）
 *   --handle=<hex>            机器主键（16–64 位 hex；与 --gramps-id 二选一；两者都给则以 --handle 为准）
 *   --gramps-ids=A,B,C         批量：逗号分隔的人读编号或 handle（允许空格/空段；每段自动判定形态）
 *   --from-file=<path>         批量：每行一个编号或 handle；`#` 起为注释（整行或行内），空行忽略
 *   --tree=<tree_id>           目标树，默认 zhonghua
 *   --root=<dir>               数据根，默认仓库根（由脚本位置推导，不写死真源路径）
 *   --apply                    真正写盘（默认 dry-run）
 *   --strict                   批量严格模式：任一节点被拒 → 整批不写盘（exit 4）；默认非 strict（只删通过的）
 *   --master-ok                目标树是世本（tree-meta `is_master === true`）时**必须显式给出**才允许写盘
 *   --allow-sandbox-markers    确有需要时放行 COMPAT_* / NODE_TEST_CONTEXT 沙箱标记
 *   --backup-dir=<dir>         自定义备份目录（默认 /tmp/jiazu-bak-<timestamp>）
 *
 * 前置安全断言（**任一不满足 → 该节点拒结（exit 4）并打印具体原因；禁止“强行删”**）。
 * 单节点与批量**共用同一套实现**（函数 evaluateNode），批量只是逐个节点跑一遍：
 *   ① 节点存在于目标树 JSON
 *   ② 无 `parent_family`（空串视为无）且 `spouse_families` 为空
 *   ③ 不被**任何树** families 的 father_handle / mother_handle / child_handles 引用
 *      （口径比“该树内”更严：本项目「跨树指针一律拒绝」，删节点是唯一不可逆操作）
 *   ④ 全库零跨树引用：所有树 people 的 `external_person_handle`（并额外做「全部字符串字段
 *      精确等于该 handle」的兜底扫描）、`config/tree-meta.json` 的 `founder_handle` /
 *      `master_handle`、以及**所有详情文档的属性值**（跳过目标自身的详情文档）
 *      ⚠️ 批量：**本次同批也要删掉的节点**作为“引用源”一律忽略（它们自己也会被删），
 *         否则一批里后一个会被前一个的残留引用误拦；忽略条数在报告里打印。
 *   ⑤ 不是任何 tree-meta 条目的 `founder_handle`（也检查 `founder_gramps_id` 与本树 JSON 的 `founder_gramps_id`）
 *   ⑥ 目标树是世本（`is_master === true`）时，**写盘必须显式带 `--master-ok`**（批量：整批拒结 exit 4；dry-run 只警告不拦）
 *
 * 批量语义：
 *   - **逐节点独立守卫**：每个节点单独跑 ①②③④⑤⑥，单节点失败**不影响其它节点**（默认只删通过的，被拒的只报告）；
 *   - 不存在的节点 → 「节点不存在，跳过」（幂等，不算拒绝）；
 *   - **写盘只做一次**：所有通过前置的节点合并在**一次**树 JSON 写入里删除 + 逐个删详情文档；
 *   - 报告：逐节点结果表（编号/姓名/通过或拒绝+原因）+ 批次汇总（成功 N / 拒绝 M / 详情删除数）
 *           + 改前/改后 people 数 + 改前/改后 md5（dry-run 为预测值）+「已忽略的同批引用源 N 处」；
 *   - 全批都无可删节点 → 打印「无可删节点，0 变更（未写盘、未建备份）」并 exit 0。
 *
 * `--apply` 动作：
 *   - 从树 JSON `people` 删除这些 handle；**同一次写入里**顺手清掉 families 中可能存在的槽位引用
 *     （father_handle/mother_handle 置空串、child_handles 过滤）——前置③已保证不会有，代码仍兼容
 *   - 删除对应详情文档 `migrate-output/details/<tree_id>:<handle>.json`（不存在 → 打印「无详情，跳过」）
 *   - 先备份到 `/tmp/jiazu-bak-<timestamp>/`（保留相对路径）
 *   - 打印改前/改后 `people` 数 + 改前/改后 md5
 *
 * 写盘风格：保持原 JSON 缩进与末尾换行（树 JSON 通常 2 空格且**无**末尾换行 —— 先读现有文件判定）；
 *           `version` / `updated_at` **不动**（与 scripts/fix-stale-branch-placeholders.mjs 同口径：最小改动）。
 *
 * 幂等：第二次跑会报「节点不存在，无事可做」并 **exit 0**（不写盘）；批量重复跑同理（整批都跳过 → 0 变更）。
 *
 * ⚠️ 前置三件套：先停 compat-api（内存 treeCache 常驻）；进程建议 COMPAT_SOURCE=local；
 *    复核不要用同进程缓存读取 —— 用本脚本打印的 md5 或重启后走 HTTP API。
 *
 * 退出码：0 = 正常（含 dry-run / 幂等无事可做）；2 = 参数错误；3 = 命中沙箱标记；
 *         4 = 前置断言不满足（拒结，含「世本缺 --master-ok」与 --strict 下任一被拒）；6 = 落盘前自检失败（脚本缺陷）。
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
    grampsIds: null, fromFile: null, strict: false,
    masterOk: false, allowSandbox: false, backupDir: null, help: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
    else if (a === '--strict') out.strict = true;
    else if (a === '--master-ok') out.masterOk = true;
    else if (a === '--allow-sandbox-markers') out.allowSandbox = true;
    else if (a.startsWith('--gramps-id=')) out.grampsId = a.slice('--gramps-id='.length).trim();
    else if (a.startsWith('--gramps-ids=')) out.grampsIds = a.slice('--gramps-ids='.length);
    else if (a.startsWith('--from-file=')) out.fromFile = path.resolve(a.slice('--from-file='.length));
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

// ---------- 请求列表（单节点 / 批量，统一成一条列表）----------
const batchMode = !!(args.grampsIds || args.fromFile);
const classify = (origin, raw) => (HANDLE_RE.test(raw) ? { origin, raw, handle: raw } : { origin, raw, grampsId: raw });
const requests = [];
if (args.handle) requests.push({ origin: '--handle', raw: args.handle, handle: args.handle });
if (args.grampsId) requests.push({ origin: '--gramps-id', raw: args.grampsId, grampsId: args.grampsId });
if (args.grampsIds !== null) {
  for (const part of String(args.grampsIds).split(',')) {
    const v = part.trim();
    if (v) requests.push(classify('--gramps-ids', v));
  }
}
if (args.fromFile) {
  if (!fs.existsSync(args.fromFile)) { console.error(`❌ --from-file 不存在：${args.fromFile}`); process.exit(2); }
  fs.readFileSync(args.fromFile, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const v = line.split('#')[0].trim(); // `#` 起为注释（整行或行内），空行忽略
    if (v) requests.push(classify(`--from-file:${i + 1}`, v));
  });
}
if (!requests.length) {
  console.error('❌ 必须给 --gramps-id=<I0046> / --handle=<16–64 位 hex> / --gramps-ids=<A,B> / --from-file=<path> 之一');
  process.exit(2);
}
for (const r of requests) {
  if (r.handle && !HANDLE_RE.test(r.handle)) {
    console.error(`❌ handle 形状非法（应为 16–64 位 hex）：${JSON.stringify(r.raw)}（来源 ${r.origin}）`);
    process.exit(2);
  }
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

// 显示宽度（CJK 按 2 算），仅用于批量结果表对齐
const dispWidth = (s) => [...String(s)].reduce((n, ch) => n + (/[\u1100-\uFFE6]/.test(ch) && !/[\uFF61-\uFF9F]/.test(ch) ? 2 : 1), 0);
const padTo = (s, w) => s + ' '.repeat(Math.max(0, w - dispWidth(s)));

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
const DETAIL_FILES = fs.readdirSync(DETAILS_DIR).filter((f) => f.endsWith('.json'));

// ---------- 解析节点 ----------
const normId = (s) => String(s || '').trim().replace(/^i/i, '').toUpperCase();
const findHandleByGrampsId = (gid) => {
  const want = normId(gid);
  for (const [h, p] of Object.entries(peopleMap)) {
    if (p && normId(p.gramps_id) === want) return h;
  }
  return null;
};

// ==========================================================================
// 前置安全断言 ①–⑥（**单节点与批量共用的同一套实现**）
//   excludeSet：本批待删 handle 集合（单节点模式 = {自身}）。
//               批量时，作为“引用源”出现在该集合里的节点一律忽略（它们自己也会被删）。
// ==========================================================================
function evaluateNode(handle, excludeSet) {
  const person = peopleMap[handle];
  const trace = []; // { ok, text } —— 按 ①–⑥ 的检查顺序记录，批量模式逐条按序打印
  const markOk = (text) => trace.push({ ok: true, text });
  const markFail = (text) => trace.push({ ok: false, text });
  let ignoredSameBatch = 0;

  // ① 节点存在（调用方已保证）
  markOk(`\n① 节点存在于 ${args.tree}.people ✓`);

  // ② 无家族关系
  {
    const pf = person.parent_family;
    const sf = Array.isArray(person.spouse_families) ? person.spouse_families : [];
    const bad = [];
    if (pf && String(pf).trim()) bad.push(`parent_family=${pf}`);
    if (sf.filter(Boolean).length) bad.push(`spouse_families=${JSON.stringify(sf)}`);
    if (bad.length) markFail(`② 节点仍有家族关系：${bad.join(' / ')}`);
    else markOk(`② 无 parent_family、spouse_families 为空 ✓`);
  }

  // ③ 不被任何树 families 的槽位引用（同批不豁免：同树槽位会被同一写盘清理，跨树槽位无法清理）
  {
    const hits = [];
    for (const [tid, { json: t }] of trees) {
      for (const [fh, fam] of Object.entries(t.families || {})) {
        if (fam.father_handle === handle) hits.push(`${tid}/${fh}:father`);
        if (fam.mother_handle === handle) hits.push(`${tid}/${fh}:mother`);
        for (const c of fam.child_handles || []) if (c === handle) hits.push(`${tid}/${fh}:child`);
      }
    }
    if (hits.length) markFail(`③ 被 families 槽位引用 ${hits.length} 处：${hits.join(', ')}`);
    else markOk(`③ 不被任何树（共 ${trees.size} 棵）families 的 father/mother/child 槽位引用 ✓`);
  }

  // ④ 全库零跨树引用（同批待删节点作为引用源忽略）
  {
    const ephHits = [];
    const genericHits = [];
    for (const [tid, { json: t }] of trees) {
      for (const [h, p] of Object.entries(t.people || {})) {
        if (tid === args.tree && h === handle) continue; // 跳过目标自身
        const hitEph = p && p.external_person_handle === handle;
        const genKeys = [];
        for (const [k, v] of Object.entries(p || {})) if (typeof v === 'string' && v === handle) genKeys.push(k);
        if (tid === args.tree && excludeSet.has(h)) {
          if (hitEph || genKeys.length) ignoredSameBatch += 1; // 同批待删节点：它自己也会被删，忽略
          continue;
        }
        if (hitEph) ephHits.push(`${tid}/${p.gramps_id || h}`);
        for (const k of genKeys) genericHits.push(`${tid}/${p.gramps_id || h}.${k}`);
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
    for (const f of DETAIL_FILES) {
      if (f === ownDetail) continue; // 跳过目标自身详情文档
      const ci = f.indexOf(':');
      const dTid = ci > 0 ? f.slice(0, ci) : null;
      const dHandle = ci > 0 ? f.slice(ci + 1).replace(/\.json$/, '') : null;
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
      if (!hit) continue;
      if (dTid === args.tree && dHandle && excludeSet.has(dHandle) && dHandle !== handle) {
        ignoredSameBatch += 1; // 同批待删节点的详情文档也会被删，忽略
        continue;
      }
      detailHits.push(`${f}#${hit}`);
    }
    const refs = [];
    if (ephHits.length) refs.push(`people.external_person_handle：${ephHits.join(', ')}`);
    if (genericHits.length) refs.push(`其它字符串字段精确等于 handle：${genericHits.join(', ')}`);
    if (metaHandleHits.length) refs.push(`tree-meta：${metaHandleHits.join(', ')}`);
    if (detailHits.length) refs.push(`详情文档引用：${detailHits.join(', ')}`);
    if (refs.length) markFail(`④ 存在跨树/外部引用：\n      - ${refs.join('\n      - ')}`);
    else {
      const tail = excludeSet.size > 1
        ? `；跳过目标自身 + 同批待删 ${excludeSet.size - 1} 个节点（已忽略的同批引用源 ${ignoredSameBatch} 处）`
        : '；跳过目标自身';
      markOk(`④ 全库零跨树引用 ✓（扫描 ${trees.size} 棵树 people + tree-meta founder/master_handle + ${DETAIL_FILES.length} 份详情文档的属性值${tail}）`);
    }
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
    if (hits.length) markFail(`⑤ 该节点是始祖登记：${hits.join(', ')}（始祖节点不可删/不可迁出）`);
    else markOk(`⑤ 非任何 tree-meta 条目的 founder_handle，也不是本树 JSON 的 founder_gramps_id ✓`);
  }

  // ⑥ 世本需显式 --master-ok
  if (isMaster) {
    if (args.masterOk) markOk(`⑥ 目标树是世本（is_master=true），已显式给出 --master-ok ✓`);
    else if (args.apply) markFail(`⑥ 目标树 ${args.tree} 是世本（tree-meta is_master=true），写盘必须显式加 --master-ok`);
    else markOk(`⑥ ⚠️ 目标树是世本（is_master=true）：dry-run 放行，--apply 需显式 --master-ok`);
  } else {
    markOk(`⑥ 目标树非世本（is_master≠true），无需 --master-ok ✓`);
  }

  const detailFile = path.join(DETAILS_DIR, `${args.tree}:${handle}.json`);
  const detailExists = fs.existsSync(detailFile);
  const slotCleanupPreview = [];
  for (const [fh, fam] of Object.entries(tree.families || {})) {
    if (fam.father_handle === handle) slotCleanupPreview.push(`${fh}:father`);
    if (fam.mother_handle === handle) slotCleanupPreview.push(`${fh}:mother`);
    for (const c of fam.child_handles || []) if (c === handle) slotCleanupPreview.push(`${fh}:child`);
  }

  const lines = trace.filter((e) => e.ok).map((e) => e.text);
  const failed = trace.filter((e) => !e.ok).map((e) => e.text);
  return { handle, person, failed, lines, trace, detailFile, detailExists, slotCleanupPreview, ignoredSameBatch };
}

// ==========================================================================
// 落盘准备：构造删除后的树 JSON（含自检）。单节点/批量共用。
// ==========================================================================
function buildNext(handles) {
  const next = JSON.parse(target.raw);
  for (const h of handles) delete next.people[h];
  let slotCleanup = 0;
  for (const fam of Object.values(next.families || {})) {
    for (const h of handles) {
      if (fam.father_handle === h) { fam.father_handle = ''; slotCleanup += 1; }
      if (fam.mother_handle === h) { fam.mother_handle = ''; slotCleanup += 1; }
      if (Array.isArray(fam.child_handles)) {
        const n = fam.child_handles.length;
        fam.child_handles = fam.child_handles.filter((c) => c !== h);
        slotCleanup += n - fam.child_handles.length;
      }
    }
  }
  // 自检：除 people 少若干项 / 槽位清理外，其它键必须不变；people 里除目标外逐项相等
  const problems = [];
  for (const k of Object.keys(tree)) {
    if (k === 'people' || k === 'families') continue;
    if (JSON.stringify(tree[k]) !== JSON.stringify(next[k])) problems.push(`顶层键 ${k} 发生变化（不应改）`);
  }
  if (JSON.stringify(Object.keys(tree)) !== JSON.stringify(Object.keys(next))) problems.push('顶层键顺序发生变化');
  const a = { ...tree.people };
  for (const h of handles) delete a[h];
  if (JSON.stringify(a) !== JSON.stringify(next.people)) problems.push('people 其余节点内容/顺序发生变化');
  for (const h of handles) if (Object.prototype.hasOwnProperty.call(next.people, h)) problems.push(`目标 handle ${h} 仍在 people 中`);
  const famKeysBefore = Object.keys(tree.families || {});
  const famKeysAfter = Object.keys(next.families || {});
  if (JSON.stringify(famKeysBefore) !== JSON.stringify(famKeysAfter)) problems.push('families 的家族集合发生变化（不应增删家族）');
  const indent = detectIndent(target.raw);
  const trailing = detectTrailing(target.raw);
  const text = JSON.stringify(next, null, indent) + trailing;
  return { next, problems, slotCleanup, text, indent, trailing };
}

const beforeCount = Object.keys(peopleMap).length;

// ==========================================================================
// 单节点模式（输出与历史版本逐字一致）
// ==========================================================================
if (!batchMode) {
  let handle = args.handle;
  let resolvedBy = '--handle';
  if (!handle) {
    handle = findHandleByGrampsId(args.grampsId);
    resolvedBy = `--gramps-id=${args.grampsId} → ${handle || '(未解析到)'}`;
  }

  console.log(`\n=== remove-zhonghua-person | ${args.apply ? 'APPLY（写盘）' : 'DRY-RUN（只读）'} ===`);
  console.log(`数据根：${args.root}`);
  console.log(`目标树：${args.tree}${isMaster ? '（tree-meta is_master=true，世本）' : ''}  people=${beforeCount}`);
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

  const ev = evaluateNode(handle, new Set([handle]));
  for (const l of ev.lines) console.log(l);
  const failed = ev.failed;

  console.log(`\n计划：`);
  console.log(`  - ${args.tree}.people 删除 ${person.gramps_id} ${person.name}（handle=${handle}）：people ${beforeCount} → ${beforeCount - 1}`);
  console.log(`  - families 槽位引用清理：${ev.slotCleanupPreview.length ? ev.slotCleanupPreview.join(', ') + `（${ev.slotCleanupPreview.length} 处）` : '无（前置③已保证）'}`);
  console.log(`  - 详情文档 ${ev.detailFile}：${ev.detailExists ? '存在，将删除' : '无详情，跳过'}`);
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
  const detailBeforeMd5 = ev.detailExists ? md5(fs.readFileSync(ev.detailFile)) : null;

  const bakTreeRel = path.join('migrate-output', 'trees', `${args.tree}.json`);
  const bakTree = path.join(backupDir, bakTreeRel);
  fs.mkdirSync(path.dirname(bakTree), { recursive: true });
  fs.copyFileSync(target.file, bakTree);
  console.log(`\n备份 → ${backupDir}`);
  console.log(`  ✓ ${bakTreeRel}（md5 ${md5(fs.readFileSync(bakTree))}）`);
  if (ev.detailExists) {
    const bakDetail = path.join(backupDir, 'migrate-output', 'details', `${args.tree}:${handle}.json`);
    fs.mkdirSync(path.dirname(bakDetail), { recursive: true });
    fs.copyFileSync(ev.detailFile, bakDetail);
    console.log(`  ✓ migrate-output/details/${args.tree}:${handle}.json（md5 ${detailBeforeMd5}）`);
  }

  // ---------- 写盘 ----------
  const built = buildNext([handle]);
  if (built.problems.length) {
    console.error(`❌ 落盘前自检不通过 → 拒写：\n  - ${built.problems.join('\n  - ')}`);
    process.exit(6);
  }
  fs.writeFileSync(target.file, built.text);
  const treeAfterMd5 = md5(fs.readFileSync(target.file));

  console.log(`\n✓ 已写 migrate-output/trees/${args.tree}.json`);
  console.log(`  people：${beforeCount} → ${Object.keys(built.next.people).length}（-${beforeCount - Object.keys(built.next.people).length}）`);
  console.log(`  md5：${treeBeforeMd5} → ${treeAfterMd5}`);
  console.log(`  缩进/末尾换行：indent=${JSON.stringify(built.indent)} trailing=${built.trailing ? '\\n' : '(无)'}（保持原风格）；version/updated_at 未改动（与 fix-stale-branch-placeholders.mjs 同口径）`);

  if (ev.detailExists) {
    fs.unlinkSync(ev.detailFile);
    console.log(`✓ 已删详情文档 migrate-output/details/${args.tree}:${handle}.json（md5 改前 ${detailBeforeMd5}）`);
  } else {
    console.log(`· 无详情，跳过（${ev.detailFile} 不存在）`);
  }

  console.log(`\n完成：${args.tree} 删除 ${person.gramps_id} ${person.name}（handle=${handle}），清理 families 槽位 ${built.slotCleanup} 处。`);
  console.log(`保留：祖谱 gu_39038 的 I000139、家族树 gu_39038_01 的 I000143 不受影响。`);
  console.log('下一步：重启本地 compat-api（内存 treeCache）；云端副本需重跑 scripts/upload-migrated-to-cloudbase.mjs。\n');
  process.exit(0);
}

// ==========================================================================
// 批量模式
// ==========================================================================
console.log(`\n=== remove-zhonghua-person | BATCH ${requests.length} 个 | ${args.apply ? 'APPLY（写盘）' : 'DRY-RUN（只读）'}${args.strict ? ' | --strict' : ''} ===`);
console.log(`数据根：${args.root}`);
console.log(`目标树：${args.tree}${isMaster ? '（tree-meta is_master=true，世本）' : ''}  people=${beforeCount}`);
console.log(`批次来源：${[...new Set(requests.map((r) => r.origin.split(':')[0]))].join(', ')}`);

// 世本 + --apply 缺 --master-ok → 整批拒结（exit 4），不逐节点跑
if (isMaster && args.apply && !args.masterOk) {
  console.error(`\n❌ ⑥ 目标树 ${args.tree} 是世本（tree-meta is_master=true），整批写盘必须显式加 --master-ok → 整批拒结（未写盘）。\n`);
  process.exit(4);
}
if (isMaster && !args.masterOk) {
  console.log(`ℹ️ ⑥ 目标树是世本（is_master=true）：dry-run 放行；--apply 时必须显式 --master-ok（缺则整批拒结 exit 4）。`);
}

// ① 解析每个请求 → handle / 不存在 / 重复
const resolved = [];
const seen = new Set();
for (const r of requests) {
  const h = r.handle || findHandleByGrampsId(r.grampsId);
  resolved.push({ ...r, handle: h || null });
}
const dupDropped = [];
const unique = [];
for (const r of resolved) {
  if (r.handle && seen.has(r.handle)) { dupDropped.push(r); continue; }
  if (r.handle) seen.add(r.handle);
  unique.push(r);
}
if (dupDropped.length) console.log(`ℹ️ 重复请求已合并 ${dupDropped.length} 条：${dupDropped.map((r) => `${r.raw}(${r.origin})`).join(', ')}`);

const existing = unique.filter((r) => r.handle && peopleMap[r.handle]);
const missing = unique.filter((r) => !r.handle || !peopleMap[r.handle]);

// ② 逐节点独立守卫（含同批引用源排除的定点迭代：pending 只会缩小，引用命中也只会增加）
let pending = new Set(existing.map((r) => r.handle));
const evals = new Map();
for (let iter = 0; iter < 4; iter += 1) {
  const next = new Set(pending);
  for (const h of pending) {
    const ev = evaluateNode(h, pending);
    evals.set(h, ev);
    if (ev.failed.length) next.delete(h);
  }
  if (next.size === pending.size) break;
  pending = next;
}
const passedHandles = existing.map((r) => r.handle).filter((h) => pending.has(h));
const rejectedHandles = existing.map((r) => r.handle).filter((h) => !pending.has(h));
const passed = existing.filter((r) => pending.has(r.handle));
const rejected = existing.filter((r) => !pending.has(r.handle));
const ignoredSameBatchTotal = passed.reduce((n, r) => n + (evals.get(r.handle)?.ignoredSameBatch || 0), 0);
const slotCleanupPreviewAll = passed.flatMap((r) => evals.get(r.handle).slotCleanupPreview);
const detailsToDelete = passed.filter((r) => evals.get(r.handle).detailExists);
const detailMissing = passed.filter((r) => !evals.get(r.handle).detailExists);

// ③ 逐节点结果表
const rows = unique.map((r, i) => {
  const h = r.handle;
  const p = h ? peopleMap[h] : null;
  const ev = h ? evals.get(h) : null;
  let verdict;
  if (!h || !p) verdict = `· 跳过：节点不存在（handle=${r.handle || '(未解析到)'}）`;
  else if (pending.has(h)) verdict = '✔ 通过';
  else verdict = `✘ 拒绝：${ev.failed.map((f) => f.split('\n')[0]).join(' / ').slice(0, 70)}${ev.failed.length > 1 ? ` …（共 ${ev.failed.length} 条）` : ''}`;
  return {
    idx: i + 1, req: r.raw, origin: r.origin, handle: h,
    grampsId: p ? p.gramps_id : '(未解析)', name: p ? p.name : '(未知)',
    verdict, ev, passed: !!(h && pending.has(h)),
  };
});
const w = (idx) => Math.max(...rows.map((r) => dispWidth(String(idx(r)))));
const wIdx = w((r) => r.idx);
const wId = w((r) => r.grampsId);
const wName = w((r) => r.name);
console.log(`\n逐节点结果表（请求 ${requests.length} 条 → 去重后 ${rows.length} 条）：`);
console.log(`  ${padTo('#', wIdx)}  ${padTo('编号', wId)}  ${padTo('姓名', wName)}  结果`);
for (const r of rows) {
  console.log(`  ${padTo(String(r.idx), wIdx)}  ${padTo(r.grampsId, wId)}  ${padTo(r.name, wName)}  ${r.verdict}${r.handle ? `  handle=${r.handle}` : ''}`);
}

// ④ 每个节点的断言明细
console.log(`\n前置断言明细：`);
for (const r of rows) {
  console.log(`\n【${r.idx}】${r.grampsId} ${r.name}${r.handle ? `（handle=${r.handle}，来源 ${r.origin}）` : `（来源 ${r.origin}）`}`);
  if (!r.ev) { console.log(`  · 节点不存在，跳过（幂等路径，不算拒绝）`); continue; }
  for (const e of r.ev.trace) console.log(e.ok ? e.text : `  ✗ ${e.text.replace(/\n/g, '\n    ')}`);
  if (r.passed) console.log(`→ 通过：将删除（详情文档 ${r.ev.detailExists ? '存在，将删除' : '无详情，跳过'}）`);
  else console.log(`→ 拒绝：不删除（逐节点独立，不影响其它节点）`);
}

// ⑤ 写盘计划 + dry-run 预测
const predicted = passed.length ? buildNext(passedHandles) : null;
if (predicted && predicted.problems.length) {
  console.error(`❌ 落盘前自检不通过 → 拒写：\n  - ${predicted.problems.join('\n  - ')}`);
  process.exit(6);
}
const nodeLabel = (r) => { const p = peopleMap[r.handle]; return `${p ? p.gramps_id : r.raw} ${p ? p.name : '(未知)'}`; };
console.log(`\n计划（写盘只做一次）：`);
console.log(`  - ${args.tree}.people 删除 ${passed.length} 个节点：people ${beforeCount} → ${beforeCount - passed.length}`);
for (const r of passed) console.log(`      · ${nodeLabel(r)}  handle=${r.handle}`);
if (rejected.length) for (const r of rejected) console.log(`      ✗ 跳过 ${nodeLabel(r)}（被拒：${evals.get(r.handle).failed.map((f) => f.split('\n')[0].slice(0, 40)).join(' / ')}）`);
if (missing.length) for (const r of missing) console.log(`      · 跳过 ${r.raw}（节点不存在）`);
console.log(`  - families 槽位引用清理：${slotCleanupPreviewAll.length ? slotCleanupPreviewAll.join(', ') + `（${slotCleanupPreviewAll.length} 处）` : '无（前置③已保证）'}`);
console.log(`  - 详情文档：删除 ${detailsToDelete.length} 份${detailMissing.length ? `，无详情跳过 ${detailMissing.length} 份` : ''}`);
console.log(`  - 备份目录：${BACKUP_DIR}`);

const treeBeforeMd5 = md5(Buffer.from(target.raw, 'utf8'));
console.log(`\n改前：people=${beforeCount}  md5=${treeBeforeMd5}`);

// ⑥ 汇总
console.log(`\n批次汇总：成功 ${passed.length} / 拒绝 ${rejected.length} / 不存在（跳过）${missing.length}`);
console.log(`  详情删除数：${args.apply ? detailsToDelete.length : `预计 ${detailsToDelete.length}`}`);
console.log(`  已忽略的同批引用源 ${ignoredSameBatchTotal} 处（本批待删节点自身的引用）`);

if (!passed.length) {
  if (rejected.length && args.strict) {
    console.error(`\n❌ --strict：本批有 ${rejected.length} 个节点被拒 → 整体不写盘（exit 4）。`);
    process.exit(4);
  }
  console.log(`\n无可删节点，0 变更（未写盘、未建备份）。\n`);
  process.exit(0);
}
if (rejected.length && args.strict) {
  console.error(`\n❌ --strict：本批有 ${rejected.length} 个节点被拒 → 整体不写盘（通过 ${passed.length} 个也不删，exit 4）。`);
  console.error(`  去掉 --strict 可只删通过的 ${passed.length} 个。\n`);
  process.exit(4);
}
if (rejected.length) console.log(`  ℹ️ 非严格模式：只删通过的 ${passed.length} 个，被拒的 ${rejected.length} 个保留原状（如要“有拒即整体不写”请加 --strict）。`);

if (!args.apply) {
  console.log(`\ndry-run 模式未写盘。预测：people ${beforeCount} → ${beforeCount - passed.length}，树 JSON md5 ${treeBeforeMd5} → ${md5(Buffer.from(predicted.text, 'utf8'))}（预测值，未落盘）。`);
  console.log(`加 --apply 才真正删除${isMaster && !args.masterOk ? '（世本：--apply 还需 --master-ok）' : ''}。\n`);
  process.exit(0);
}

// ---------- 备份（树 JSON + 本批所有将被删的详情文档）----------
const backupDir = BACKUP_DIR;
const bakTreeRel = path.join('migrate-output', 'trees', `${args.tree}.json`);
const bakTree = path.join(backupDir, bakTreeRel);
fs.mkdirSync(path.dirname(bakTree), { recursive: true });
fs.copyFileSync(target.file, bakTree);
console.log(`\n备份 → ${backupDir}`);
console.log(`  ✓ ${bakTreeRel}（md5 ${md5(fs.readFileSync(bakTree))}）`);
for (const r of detailsToDelete) {
  const ev = evals.get(r.handle);
  const rel = path.join('migrate-output', 'details', `${args.tree}:${r.handle}.json`);
  const bak = path.join(backupDir, rel);
  fs.mkdirSync(path.dirname(bak), { recursive: true });
  fs.copyFileSync(ev.detailFile, bak);
  console.log(`  ✓ ${rel.replace(/\\/g, '/')}（md5 ${md5(fs.readFileSync(bak))}）`);
}

// ---------- 写盘（一次）----------
fs.writeFileSync(target.file, predicted.text);
const treeAfterMd5 = md5(fs.readFileSync(target.file));
const afterCount = Object.keys(predicted.next.people).length;
console.log(`\n✓ 已写 migrate-output/trees/${args.tree}.json（一次写入，共删 ${passed.length} 个节点）`);
console.log(`  people：${beforeCount} → ${afterCount}（-${beforeCount - afterCount}）`);
console.log(`  md5：${treeBeforeMd5} → ${treeAfterMd5}`);
console.log(`  缩进/末尾换行：indent=${JSON.stringify(predicted.indent)} trailing=${predicted.trailing ? '\\n' : '(无)'}（保持原风格）；version/updated_at 未改动（与 fix-stale-branch-placeholders.mjs 同口径）`);

let detailsDeleted = 0;
for (const r of passed) {
  const ev = evals.get(r.handle);
  if (ev.detailExists) {
    fs.unlinkSync(ev.detailFile);
    detailsDeleted += 1;
    console.log(`✓ 已删详情文档 migrate-output/details/${args.tree}:${r.handle}.json`);
  } else {
    console.log(`· 无详情，跳过（${ev.detailFile} 不存在）`);
  }
}

console.log(`\n完成：${args.tree} 删除 ${passed.length} 个节点（拒绝 ${rejected.length}，跳过不存在 ${missing.length}），清理 families 槽位 ${predicted.slotCleanup} 处，删详情文档 ${detailsDeleted} 份。`);
console.log(`下一步：重启本地 compat-api（内存 treeCache）；云端副本需重跑 scripts/upload-migrated-to-cloudbase.mjs。\n`);
process.exit(0);
