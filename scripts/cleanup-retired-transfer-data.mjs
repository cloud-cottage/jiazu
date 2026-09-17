#!/usr/bin/env node
/**
 * cleanup-retired-transfer-data.mjs
 *
 * 一次性数据清理：家族树「资金 / 转账」功能已整体下线（docs/economy.spec.md §12-3：
 * `trees[tree_id].balance_cents` 与 `transferToTree` 下线），但钱包集合里还留着它的数据残留。
 *
 * 产品口径（Kevin 2026-09-18）：**没有保留存档的必要，直接下线** —— 删掉残留；
 * 用户余额 `users[*].balance_cents` **不动**（那笔 ¥20 不返还，不做冲正、不给用户加钱）。
 *
 * 清理目标（相对数据根 `--root`）：
 *   ① migrate-output/collections/jiazu_wallets.json   compat-api local 真源集合（形状 `{ global: {...} }`）
 *   ② auth-server/data/wallets.json                   auth-server 遗留链路（顶层形状），文件不存在则跳过
 *
 * 对每个目标文件只做两件事：
 *   - 删除 `transactions[]` 中 `type === 'transfer'` 的条目（转账流水）
 *   - 删除 `trees` 字段（家族账户储籽 `{ <tree_id>: { balance_cents } }`）
 * 其它字段（`users` / `config` / 其它流水）**一律不动、不重排**；写盘前脚本会自检
 * 「只有目标字段变了」（逐键深度相等），自检不过则拒写。
 *
 * 用法：
 *   node scripts/cleanup-retired-transfer-data.mjs                          # dry-run（默认，只打印）
 *   node scripts/cleanup-retired-transfer-data.mjs --apply                  # 真正写盘
 *   node scripts/cleanup-retired-transfer-data.mjs --root=/tmp/replica      # 指向数据副本（副本验证）
 *   node scripts/cleanup-retired-transfer-data.mjs --root=/tmp/replica --apply
 *   node scripts/cleanup-retired-transfer-data.mjs --backup-dir=/tmp/my-bak # 自定义备份目录
 *
 * 幂等：再跑一次会报「无可清理项，0 变更」并 **不写盘、不建备份目录**（exit 0）。
 *
 * ⚠️ 前置三件套（本项目踩过的坑）：
 *   1) 先停 compat-api（内存 treeCache 常驻，服务活着时任何写入都会把旧快照回写）。
 *   2) 进程建议 COMPAT_SOURCE=local；且**不得**设置 COMPAT_META_FILE / COMPAT_OUT_DIR /
 *      NODE_TEST_CONTEXT —— 那些是 store.js 的沙箱标记（读写根会落到副本），
 *      为避免「以为在改副本、其实改了别的根」的混淆，脚本检测到这些变量会**拒绝运行**
 *      （确实要在带标记的环境里跑 → 加 --allow-sandbox-markers）。
 *   3) 复核**不要**用同进程的缓存读取 → 磁盘直读（本脚本打印 md5 前后值即可取证）。
 *
 * 退出码：0 = 正常（含 dry-run 与「无可清理项」）；2 = 参数错误；3 = 命中沙箱标记；4 = 自检/写盘失败。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..'); // 仓库根（由脚本位置推导，不写死真源路径）

const SANDBOX_VARS = ['COMPAT_META_FILE', 'COMPAT_OUT_DIR', 'NODE_TEST_CONTEXT'];

// 目标文件（相对数据根）
const TARGETS = [
  { rel: 'migrate-output/collections/jiazu_wallets.json', label: 'compat-api local 真源集合（jiazu_wallets）' },
  { rel: 'auth-server/data/wallets.json', label: 'auth-server 遗留链路（wallets.json）' },
];

// ---------- 参数 ----------
function parseArgs(argv) {
  const out = { apply: false, root: DEFAULT_ROOT, backupDir: null, allowSandbox: false, help: false };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
    else if (a === '--allow-sandbox-markers') out.allowSandbox = true;
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

// ---------- 沙箱标记拦截（防“以为在改副本”）----------
const sandboxHits = SANDBOX_VARS.filter((k) => {
  const v = process.env[k];
  return v !== undefined && v !== '';
});
if (sandboxHits.length && !args.allowSandbox) {
  console.error(
    `❌ 检测到沙箱标记环境变量：${sandboxHits.join(', ')}\n` +
    `   这些是 store.js 的沙箱判定开关（读写根会落到副本），会让本脚本的行为与真源不一致。\n` +
    `   请 unset 后重跑（真源手术时禁用）；确实要在副本上跑 → 改用 --root=<副本>（推荐），\n` +
    `   或确认无误后加 --allow-sandbox-markers。`
  );
  process.exit(3);
}

// ---------- 工具 ----------
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const readRaw = (p) => fs.readFileSync(p);

/** 从文件原文推断缩进（首个顶格缩进行） */
function detectIndent(raw) {
  const m = raw.match(/^([ \t]+)"/m);
  return m ? m[1] : '  ';
}
/** 保留原文件的末尾换行风格（存在则保留一个 \n，不存在则不加） */
function detectTrailing(raw) {
  return raw.endsWith('\n') ? '\n' : '';
}
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 定位钱包容器：集合形状取 `global`，顶层形状取自身 */
function walletContainer(doc) {
  const g = doc && doc.global;
  if (g && typeof g === 'object' && !Array.isArray(g) &&
      (Array.isArray(g.transactions) || Object.prototype.hasOwnProperty.call(g, 'trees') || (g.users && typeof g.users === 'object'))) {
    return { container: g, where: 'doc.global' };
  }
  return { container: doc, where: '(顶层)' };
}

/** 写盘前自检：除 transactions 的 transfer 条目与 trees 字段外，其它键必须逐键深度相等 */
function selfCheck(before, after, removedTxCount) {
  const problems = [];
  const lines = [];
  const bk = Object.keys(before);
  const ak = Object.keys(after);
  const removedKeys = bk.filter((k) => !ak.includes(k));
  const addedKeys = ak.filter((k) => !bk.includes(k));
  if (removedKeys.length !== 1 || removedKeys[0] !== 'trees') problems.push(`顶层被删键异常：${JSON.stringify(removedKeys)}（应仅 ["trees"]）`);
  else lines.push(`顶层键：仅删除 trees ✓（${removedKeys.join(',')}）`);
  if (addedKeys.length) problems.push(`顶层新增键异常：${JSON.stringify(addedKeys)}（不应新增）`);

  for (const k of bk) {
    if (k === 'transactions' || k === 'trees') continue;
    if (jsonEq(before[k], after[k])) lines.push(`${k} 深度相等 ✓`);
    else problems.push(`${k} 发生变化（不应改）`);
  }
  const beforeK = (before.transactions || []).filter((t) => !(t && t.type === 'transfer'));
  const afterK = after.transactions || [];
  if (beforeK.length !== afterK.length) problems.push(`transactions 保留下来的条目数不符（${beforeK.length} → ${afterK.length}）`);
  else if (!jsonEq(beforeK, afterK)) problems.push('transactions 保留下来的条目内容/顺序发生变化');
  else lines.push(`transactions 其余 ${afterK.length} 条逐条深度相等且顺序不变 ✓（删除 ${removedTxCount} 条 transfer）`);
  return { problems, lines };
}

// ---------- 载入目标 ----------
const files = [];
for (const t of TARGETS) {
  const abs = path.join(args.root, t.rel);
  const exists = fs.existsSync(abs);
  files.push({ ...t, abs, exists });
}

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = args.backupDir || path.join('/tmp', `jiazu-bak-${ts}`);

console.log(`\n=== cleanup-retired-transfer-data | ${args.apply ? 'APPLY（写盘）' : 'DRY-RUN（只读）'} ===`);
console.log(`数据根：${args.root}`);
console.log(`备份目录（写盘时才创建）：${backupDir}`);

const missing = files.filter((f) => !f.exists);
if (missing.length) {
  for (const m of missing) console.log(`· 跳过（不存在）：${m.rel}`);
}

const plans = []; // 有变更的文件
let totalRemovedTx = 0;
let totalRemovedTrees = 0;

for (const f of files) {
  if (!f.exists) continue;
  const raw = readRaw(f.abs);
  const beforeMd5 = md5(raw);
  const rawText = raw.toString('utf8');
  let doc;
  try {
    doc = JSON.parse(rawText);
  } catch (e) {
    console.error(`❌ ${f.rel} 不是合法 JSON：${e.message}`);
    process.exit(4);
  }
  const { container, where } = walletContainer(doc);
  if (!container || typeof container !== 'object') {
    console.log(`\n--- ${f.rel} ---\n  ⚠️ 无法定位钱包容器，跳过`);
    continue;
  }

  const txs = Array.isArray(container.transactions) ? container.transactions : null;
  const removedTx = txs ? txs.filter((t) => t && t.type === 'transfer') : [];
  const otherTransferish = txs ? txs.filter((t) => t && t.type !== 'transfer' && typeof t.type === 'string' && /transfer/i.test(t.type)) : [];
  const hasTrees = Object.prototype.hasOwnProperty.call(container, 'trees');
  const treesVal = hasTrees ? container.trees : undefined;

  console.log(`\n--- ${f.rel} ---`);
  console.log(`  容器：${where}    字段：${Object.keys(container).join(', ')}`);
  console.log(`  md5 改前：${beforeMd5}`);
  console.log(`  transactions：改前 ${txs ? txs.length : '(无该字段)'} 条${txs ? `（type 分布：${[...new Set(txs.map((t) => (t && t.type) || '?'))].join(', ')}）` : ''}`);
  console.log(`  transfer 流水将删：${removedTx.length} 条`);
  for (const t of removedTx) console.log(`    - ${JSON.stringify(t)}`);
  if (otherTransferish.length) {
    console.log(`  ⚠️ 另有 ${otherTransferish.length} 条「名字里含 transfer 但不是精确 type==='transfer'」的流水，**按口径不删**，请人工确认：`);
    for (const t of otherTransferish) console.log(`      ? ${JSON.stringify(t)}`);
  }
  console.log(`  trees 字段（家族账户储籽）：${hasTrees ? JSON.stringify(treesVal) : '(不存在)'}`);
  if (hasTrees) {
    const entries = treesVal && typeof treesVal === 'object' ? Object.entries(treesVal) : [];
    for (const [tid, v] of entries) {
      console.log(`    - ${tid}  balance_cents=${v && v.balance_cents !== undefined ? v.balance_cents : JSON.stringify(v)}`);
    }
  }

  // 无变更 → 幂等路径
  if (!removedTx.length && !hasTrees) {
    console.log('  ✓ 无可清理项，0 变更');
    continue;
  }

  // 在解析对象上做清理（dry-run 也做，用于展示「改后」摘要；只有 apply 才落盘）
  const after = JSON.parse(rawText);
  const { container: afterContainer } = walletContainer(after);
  if (removedTx.length) afterContainer.transactions = afterContainer.transactions.filter((t) => !(t && t.type === 'transfer'));
  if (hasTrees) delete afterContainer.trees;

  const indent = detectIndent(rawText);
  const trailing = detectTrailing(rawText);
  const outText = JSON.stringify(after, null, indent) + trailing;
  const check = selfCheck(container, afterContainer, removedTx.length);
  const afterMd5 = md5(Buffer.from(outText, 'utf8'));

  console.log(`  其余字段自检：${check.problems.length ? '✗ ' + check.problems.join(' | ') : '✓ ' + check.lines.join(' / ')}`);
  console.log(`  缩进/末尾换行：indent=${JSON.stringify(indent)} trailing=${trailing ? '\\n' : '(无)'}  → 保持原风格`);
  console.log(`  md5 预计改后：${afterMd5}（字节 ${raw.length} → ${Buffer.byteLength(outText, 'utf8')}）`);
  console.log(`  transactions 改后条数：${afterContainer.transactions ? afterContainer.transactions.length : '(无该字段)'}；trees 字段：${Object.prototype.hasOwnProperty.call(afterContainer, 'trees') ? '仍在' : '已删除'}`);

  if (check.problems.length) {
    console.error(`❌ ${f.rel} 自检不通过 → 拒写（此为脚本缺陷，请勿 --apply 绕过）`);
    process.exit(4);
  }

  plans.push({ file: f, raw, outText, beforeMd5, afterMd5, removedTx, hasTrees, treesVal, where });
  totalRemovedTx += removedTx.length;
  totalRemovedTrees += hasTrees ? 1 : 0;
}

// ---------- 汇总 ----------
console.log(`\n汇总：删除 transfer 流水 ${totalRemovedTx} 条；删除 trees 字段 ${totalRemovedTrees} 处；涉及文件 ${plans.length} 个`);

if (!plans.length) {
  console.log('无可清理项，0 变更（未写盘、未建备份目录）。\n');
  process.exit(0);
}

if (!args.apply) {
  console.log('（dry-run 模式，未写盘。加 --apply 才真正清理。）\n');
  process.exit(0);
}

// ---------- 备份 ----------
console.log(`\n备份 → ${backupDir}`);
for (const p of plans) {
  const dest = path.join(backupDir, p.file.rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(p.file.abs, dest);
  console.log(`  ✓ ${p.file.rel}（备份 md5 ${md5(fs.readFileSync(dest))}）`);
}

// ---------- 写盘 ----------
let wrote = 0;
for (const p of plans) {
  fs.writeFileSync(p.file.abs, p.outText);
  const nowMd5 = md5(fs.readFileSync(p.file.abs));
  if (nowMd5 !== p.afterMd5) {
    console.error(`❌ ${p.file.rel} 落盘 md5 与预计不符（${nowMd5} ≠ ${p.afterMd5}）`);
    process.exit(4);
  }
  wrote += 1;
  console.log(`✓ 已写 ${p.file.rel}：md5 ${p.beforeMd5} → ${nowMd5}（删除 transfer ${p.removedTx.length} 条，trees ${p.hasTrees ? '已删除' : '无'}）`);
}

console.log(`\n完成：${wrote} 个文件已清理（transfer 流水 ${totalRemovedTx} 条 / trees 字段 ${totalRemovedTrees} 处）。`);
console.log(`用户余额 users[*].balance_cents 未改动；那笔 ¥20 未返还（按产品口径）。`);
console.log('下一步：重启本地 compat-api（内存 treeCache）；云端副本需重跑 scripts/upload-migrated-to-cloudbase.mjs。\n');
