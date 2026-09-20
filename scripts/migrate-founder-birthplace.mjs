#!/usr/bin/env node
/**
 * 一次性数据手术：把每棵树**始祖节点**的出生地按 tree-meta 的发源地写成结构化形状
 * （契约 v2 C1/C8′；不变量：「树上发源地 = 某节点出生地」——见 docs/person-places.spec.md）
 *
 * 口径（写入规则，逐字对应 Zang 2026-09-20 裁定）：
 *   · tree-meta `origin_code` 非空 → `birth_place = { origin_code:<码>, note:'' }`；
 *   · 无码且 `origin` 非空     → `birth_place = { origin_code:'', note:<原文本> }`；
 *   · 两者都空                 → **不动**（跳过）。
 * 只写**始祖节点**（映射表指定），树的其余部分一字节不动；不写 tree-meta（本脚本只读 meta）。
 *
 * 始祖映射：`scripts/founder-map.json`（形状 `{ "<tree_id>": { handle, gramps_id, name } }`）。
 *   ⚠️ 该文件的 `handle` 是**按 gramps_id 在树 JSON 里解析出来的真值**，本脚本仍会在**写入前逐条复核**：
 *   ① handle 确实存在于该树；② 该节点 gramps_id 与映射一致；③ 节点 name 与映射一致。
 *   任一不符 → 该树跳过并打印原因（**绝不猜**）。
 *
 * 用法：
 *   node scripts/migrate-founder-birthplace.mjs                       # dry-run（默认，只打印）
 *   node scripts/migrate-founder-birthplace.mjs --apply               # 执行（写前自动备份）
 *   node scripts/migrate-founder-birthplace.mjs --map=/tmp/m.json     # 换映射表（默认 scripts/founder-map.json）
 *   COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/migrate-founder-birthplace.mjs          # 副本演练（dry-run）
 *   COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/migrate-founder-birthplace.mjs --apply  # 副本演练（真写副本）
 *   COMPAT_META_FILE=/tmp/x/tree-meta.json node scripts/migrate-founder-birthplace.mjs  # 也可直接指 meta 文件
 *
 * 可选（默认关，本轮**不跑**）：
 *   --normalize-birthplace-shape
 *     把树 JSON 里**仍是字符串**形态的既有 `birth_place` 归一为 `{ origin_code:'', note:<原串> }`
 *     （读侧 `lib/person-places.js` 已容错，保存时会懒转；此开关只做批量一次性归口）。
 *     实测全量 296 处字符串形态，其中**非空 17 处**（gu_39038_01×1 / ji_23395_01×12 /
 *     liu_21016_01×2 / shen_27784_01×2 —— 与 Zang 的 17 处口径一致）。
 *
 * 幂等：目标值与现值**规范化后相同**即跳过不写；重跑时零写入 ⇒ 逐字节不变（脚本打印门禁断言）。
 * 数据安全：默认指向真源（`migrate-output/` + `config/tree-meta.json`）；`--apply` 前先把
 * `migrate-output/trees/*.json` + `config/tree-meta.json` 备份到
 * `~/jiazu-backups/<YYYY-MM-DD>-founder-birthplace/`（含 `md5-before.txt` 清单）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isKnownOriginCode, resolveOrigin } from '../cloudfunctions/compat-api/lib/geo.js';
import { normalizeBirthPlace } from '../cloudfunctions/compat-api/lib/person-places.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ---- 目标解析：与 lib/store.js 同序（COMPAT_META_FILE > COMPAT_OUT_DIR/tree-meta.json > 真源）----
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const OUT_DIR = process.env.COMPAT_OUT_DIR ? path.resolve(process.env.COMPAT_OUT_DIR) : REAL_OUT;
const TREES_DIR = path.join(OUT_DIR, 'trees');
const META_FILE = process.env.COMPAT_META_FILE
  ? path.resolve(process.env.COMPAT_META_FILE)
  : process.env.COMPAT_OUT_DIR
    ? path.join(OUT_DIR, 'tree-meta.json')
    : REAL_META;
const IS_COPY = path.resolve(OUT_DIR) !== path.resolve(REAL_OUT);
const IS_META_COPY = path.resolve(META_FILE) !== path.resolve(REAL_META);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const NORMALIZE = args.includes('--normalize-birthplace-shape');
const mapArg = args.find((a) => a.startsWith('--map='));
const MAP_FILE = mapArg ? path.resolve(mapArg.slice('--map='.length)) : path.join(HERE, 'founder-map.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
/** 显示宽度（中日韩宽字符按 2 列） */
const w = (s, n) => {
  const len = [...String(s)].reduce((k, ch) => k + (ch.codePointAt(0) > 127 ? 2 : 1), 0);
  const pad = Math.max(0, n - len);
  return String(s) + ' '.repeat(pad);
};
const treeFile = (id) => path.join(TREES_DIR, `${id}.json`);
const readTree = (id) => JSON.parse(fs.readFileSync(treeFile(id), 'utf8'));
const samePlace = (a, b) => {
  const x = normalizeBirthPlace(a);
  const y = normalizeBirthPlace(b);
  return x.origin_code === y.origin_code && x.note === y.note;
};

// ================= 主流程 =================
if (!fs.existsSync(TREES_DIR)) {
  console.error(`❌ 找不到树目录：${TREES_DIR}`);
  process.exit(1);
}
if (!fs.existsSync(META_FILE)) {
  console.error(`❌ 找不到 tree-meta：${META_FILE}`);
  process.exit(1);
}
if (!fs.existsSync(MAP_FILE)) {
  console.error(`❌ 找不到映射表：${MAP_FILE}`);
  process.exit(1);
}

const metaRaw = fs.readFileSync(META_FILE, 'utf8');
const meta = JSON.parse(metaRaw);
const metaBeforeMd5 = md5(META_FILE);
const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const treeIds = fs.readdirSync(TREES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

const rows = [];
/** 待写列表（dry-run 只打印；--apply 才落盘） */
const writes = [];
/** 串形态归一待办（--normalize-birthplace-shape 专用）：treeId → 已就地改过的树对象（写盘时直接用） */
const normRows = [];
const normTrees = new Map();
const stringFormTotal = { all: 0, nonEmpty: 0 };
const byTreeStrings = new Map();

for (const treeId of treeIds) {
  const file = treeFile(treeId);
  const rawText = fs.readFileSync(file, 'utf8');
  const tree = JSON.parse(rawText);
  const before = md5(file);
  // 格式自检：未改动的重新序列化必须与现文件**逐字节相同**（否则写入会整文件重排，须先说明）
  const reserOk = JSON.stringify(tree, null, 2) === rawText;

  const row = {
    treeId, before, reserOk, status: 'skip', reason: '', value: '', name: '', gramps_id: '', handle: '',
    after: before, metaMissingFounderHandle: false,
  };

  const entry = Object.values(meta?.trees || {}).find((t) => t && (t.tree_id || '') === treeId) || null;
  const mapped = map[treeId] || null;

  // ① 映射表未点名 → 跳过
  if (!mapped) {
    row.reason = '映射表未点名（不猜始祖）';
    rows.push(row);
    collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
    continue;
  }
  row.name = text(mapped.name);
  row.gramps_id = text(mapped.gramps_id);
  row.handle = text(mapped.handle);

  // ② meta 缺失 → 跳过（元数据是发源地真源）
  if (!entry) {
    row.status = 'error';
    row.reason = `tree-meta 里找不到 tree_id=${treeId}`;
    rows.push(row);
    collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
    continue;
  }
  row.metaMissingFounderHandle = !text(entry.founder_handle);

  // ③ 映射 handle 逐条复核：存在 / gramps_id 一致 / name 一致
  const person = tree.people?.[row.handle];
  if (!person) {
    row.status = 'error';
    row.reason = `映射 handle 在树内不存在（${row.handle}）`;
    rows.push(row);
    collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
    continue;
  }
  if (text(person.gramps_id) !== row.gramps_id) {
    row.status = 'error';
    row.reason = `gramps_id 不符：树内 ${text(person.gramps_id)} vs 映射 ${row.gramps_id}`;
    rows.push(row);
    collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
    continue;
  }
  if (text(person.name) !== row.name) {
    row.status = 'error';
    row.reason = `name 不符：树内「${text(person.name)}」vs 映射「${row.name}」`;
    rows.push(row);
    collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
    continue;
  }

  // ④ 写入值（写入规则）
  const code = text(entry.origin_code);
  const origin = text(entry.origin);
  let target = null;
  let basis = '';
  if (code) {
    if (!isKnownOriginCode(code)) {
      row.status = 'error';
      row.reason = `tree-meta.origin_code 不是已登记码（${code}）——拒绝写入`;
      rows.push(row);
      collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
      continue;
    }
    target = { origin_code: code, note: '' };
    basis = `meta.origin_code=${code}（${resolveOrigin(code).display}）`;
  } else if (origin) {
    target = { origin_code: '', note: origin };
    basis = `meta 无码，origin 文本「${origin}」入 note`;
  } else {
    row.reason = 'meta 无码且 origin 为空 → 不动';
    rows.push(row);
    collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
    continue;
  }
  row.basis = basis;

  // ⑤ 幂等：规范化后相同 → 不写
  if (samePlace(person.birth_place, target)) {
    row.status = 'same';
    row.value = JSON.stringify(target);
    row.reason = '现值已一致（幂等）';
    rows.push(row);
    collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
    continue;
  }

  row.status = 'set';
  row.value = JSON.stringify(target);
  row.oldValue = typeof person.birth_place === 'string' ? `字符串「${person.birth_place}」` : JSON.stringify(person.birth_place);
  person.birth_place = target;
  // 只改 birth_place：目标树里该节点的其余字段保持原值
  const nextText = JSON.stringify(tree, null, 2);
  writes.push({ treeId, file, name: row.name, grampsId: row.gramps_id, value: target, treeObj: tree });
  row.after = crypto.createHash('md5').update(nextText).digest('hex');
  rows.push(row);
  collectStrings(treeId, tree, normRows, stringFormTotal, byTreeStrings);
}

/** 串形态归一收集（--normalize-birthplace-shape；本轮默认不跑） */
function collectStrings(treeId, tree, norm, total, byTree) {
  if (!NORMALIZE) return;
  let hit = 0;
  for (const [handle, p] of Object.entries(tree.people || {})) {
    if (typeof p?.birth_place !== 'string') continue;
    total.all += 1;
    const note = p.birth_place.trim();
    if (note) total.nonEmpty += 1;
    byTree.set(treeId, (byTree.get(treeId) || 0) + 1);
    // 注意：值**不加尾随换行**；空串也归一为结构化空值（形状统一）
    norm.push({ treeId, handle, note, old: p.birth_place });
    p.birth_place = { origin_code: '', note };
    hit += 1;
  }
  // 记下**改过的树对象**（写盘时用它，别再从磁盘读回来 —— 那样会把归一整个吞掉）
  if (hit) normTrees.set(treeId, tree);
}

// ================= 打印：逐树映射表 =================
console.log('═'.repeat(150));
console.log(`树目录：${TREES_DIR}${IS_COPY ? '（副本演练）' : '（★真源★）'}`);
console.log(`tree-meta：${META_FILE}${IS_META_COPY ? '（副本）' : '（★真源★）'}  md5(前)=${metaBeforeMd5}`);
console.log(`映射表：${MAP_FILE}（${Object.keys(map).length} 条）`);
console.log(`模式：${APPLY ? '--apply（写盘）' : 'dry-run（不写盘）'}${NORMALIZE ? ' + --normalize-birthplace-shape' : ''}`);
console.log('═'.repeat(150));
console.log(
  `${w('tree_id', 16)}${w('始祖', 22)}${w('handle', 28)}${w('写入值', 46)}${w('依据', 40)}${w('状态', 8)}md5 前 → 后`,
);
console.log('─'.repeat(150));
for (const r of rows) {
  const who = `${r.name || '(未点名)'} ${r.gramps_id || ''}`.trim();
  const status = r.status === 'set' ? '待写' : r.status === 'same' ? '一致' : r.status === 'error' ? '❌错' : '跳过';
  const fmt = r.reserOk ? '' : ' ⚠重排';
  console.log(
    `${w(r.treeId, 16)}${w(who, 22)}${w(r.handle || '—', 28)}${w(r.value || r.reason || '—', 46)}` +
      `${w(r.basis || r.reason, 40)}${w(status, 8)}${r.before.slice(0, 8)} → ${r.after.slice(0, 8)}${fmt}`,
  );
}
console.log('─'.repeat(150));
const nSet = rows.filter((r) => r.status === 'set').length;
const nSame = rows.filter((r) => r.status === 'same').length;
const nSkip = rows.filter((r) => r.status === 'skip').length;
const nErr = rows.filter((r) => r.status === 'error').length;
console.log(
  `共 ${rows.length} 棵树：待写 ${nSet} / 已一致（幂等）${nSame} / 跳过 ${nSkip} / 复核失败 ${nErr}` +
    `；映射表点名 ${Object.keys(map).length} 条，未点名树 ${rows.filter((r) => r.status === 'skip' && /映射表未点名/.test(r.reason)).map((r) => r.treeId).join('、') || '无'}`,
);
const metaMissing = rows.filter((r) => r.metaMissingFounderHandle).map((r) => r.treeId);
if (metaMissing.length) {
  console.log(`⚠️ tree-meta 未登记 founder_handle 的树 ${metaMissing.length} 棵：${metaMissing.join('、')}（始祖按映射表判定；本脚本不写 meta）`);
}

if (NORMALIZE) {
  console.log(`\n---- --normalize-birthplace-shape（字符形态归一）----`);
  console.log(
    `字符串形态 birth_place：共 ${stringFormTotal.all} 处（非空 ${stringFormTotal.nonEmpty} 处）` +
      `；分布 ${[...byTreeStrings.entries()].map(([k, v]) => `${k}×${v}`).join('、')}`,
  );
  console.log(`本轮${APPLY ? '将写入' : '仅演练（dry-run）'} ${normRows.length} 处归一`);
}

if (nErr) {
  console.log(`\n❌ 有 ${nErr} 棵树复核失败，**未**写入任何文件。`);
  process.exit(1);
}

// ================= 写入（默认不写） =================
if (!APPLY) {
  // dry-run 门禁：证明真源零写入
  const metaAfter = md5(META_FILE);
  let drift = 0;
  for (const r of rows) if (r.status === 'set' && md5(treeFile(r.treeId)) !== r.before) drift += 1;
  console.log(
    `\nmd5（tree-meta 前/后）= ${metaBeforeMd5} / ${metaAfter}  ${metaAfter === metaBeforeMd5 ? '未写盘 ✅' : '⚠️ 已变'}`,
  );
  console.log(`待写树现文件 md5 复算：${drift === 0 ? '全部与「前」一致（真源零写入 ✅）' : `⚠️ ${drift} 棵已变`}`);
  console.log('（dry-run，未写盘。加 --apply 才真正写入。）');
  process.exit(0);
}

// ---- 备份 → 写入 ----
const stamp = new Date().toISOString().slice(0, 10);
const bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-founder-birthplace${IS_COPY ? '-copy' : ''}`);
fs.mkdirSync(path.join(bakDir, 'trees'), { recursive: true });
const manifest = [];
let copied = 0;
for (const f of fs.readdirSync(TREES_DIR).filter((x) => x.endsWith('.json'))) {
  fs.copyFileSync(path.join(TREES_DIR, f), path.join(bakDir, 'trees', f));
  manifest.push(`${md5(path.join(TREES_DIR, f))}  trees/${f}`);
  copied += 1;
}
fs.copyFileSync(META_FILE, path.join(bakDir, 'tree-meta.json'));
manifest.push(`${metaBeforeMd5}  tree-meta.json`);
fs.writeFileSync(path.join(bakDir, 'md5-before.txt'), manifest.join('\n') + '\n', 'utf8');
console.log(`\n📦 备份：${bakDir}（trees ${copied} 个 + tree-meta.json；清单 md5-before.txt）`);

for (const wr of writes) {
  // 写盘用**内存里的树对象**（可能同时含归一改动）—— 序列化形状与 store.saveTree 一致
  fs.writeFileSync(wr.file, JSON.stringify(wr.treeObj, null, 2), 'utf8');
}
if (NORMALIZE && normTrees.size) {
  // 注意：归一的树对象必须取自内存（`normTrees`），不能 re-read 磁盘 —— 否则归一被吞掉；
  // 已被上面写过的树无需重复写（同一对象引用）
  for (const [treeId, tree] of normTrees) {
    if (writes.some((x) => x.treeId === treeId)) continue;
    fs.writeFileSync(treeFile(treeId), JSON.stringify(tree, null, 2), 'utf8');
  }
}

console.log(`✅ 已写入 ${writes.length} 棵树的始祖出生地${NORMALIZE ? `（另归一 ${normRows.length} 处字符串形态）` : ''}`);
let bad = 0;
for (const wr of writes) {
  const after = md5(wr.file);
  const expect = crypto.createHash('md5').update(JSON.stringify(wr.treeObj, null, 2)).digest('hex');
  const ok = after === expect;
  if (!ok) bad += 1;
  const before = (rows.find((r) => r.treeId === wr.treeId) || {}).before || '';
  console.log(`   ${wr.treeId}  md5 前=${before}  后=${after}  ${ok ? '✅' : '⚠️ 与预算不符'}`);
}
console.log(`md5（tree-meta 前/后）= ${metaBeforeMd5} / ${md5(META_FILE)}（本脚本不写 meta）`);
if (bad) process.exit(1);
