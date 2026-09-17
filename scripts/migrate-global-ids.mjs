#!/usr/bin/env node
/**
 * 全局编号迁移脚本（一次性）—— docs/id-system.spec.md §4
 *
 * 规则：
 * 1. **中华世本（zhonghua）现有编号原样保留**（文档与用户记忆里引用最多的一棵树）；
 * 2. 计数器初值 = max(zhonghua 编号) + 1；
 * 3. 其它所有树（宗谱 + 普通树）逐树重编号，顺序固定（tree_id 字典序 → 原编号升序）；
 * 4. 产出映射表 `<root>/id-migration.json`：`{ tree_id: { 旧编号: 新编号 } }`；
 *    同时在节点上写 `legacy_gramps_id`（只读留痕；详情文档 + 树 JSON 各一份，便于解析器快速回退）；
 * 5. 幂等可重放：已带 legacy_gramps_id 的节点/家族**不再次重编号**（第二次运行零改动，逐字节）。
 *
 * 数据根（**默认不对真实数据执行**）：
 *   node scripts/migrate-global-ids.mjs --root /tmp/jiazu-copy          # 副本（推荐）
 *   JIAZU_DATA_ROOT=/tmp/jiazu-copy node scripts/migrate-global-ids.mjs
 *   node scripts/migrate-global-ids.mjs --root <repo>/migrate-output --confirm-real   # 真源（需显式确认）
 * 其它参数：--dry-run（只打印计划，不写任何文件）｜--master zhonghua（总谱 tree_id）
 *
 * 只碰数据根下的 trees/ · details/ · collections/jiazu_id_seq.json · id-migration*.json；
 * 绝不写 config/tree-meta.json，绝不碰其它目录。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const REAL_ROOT = path.join(REPO, 'migrate-output');

// ---- 参数 ----
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const ROOT = path.resolve(opt('root', process.env.JIAZU_DATA_ROOT || REAL_ROOT));
const MASTER = opt('master', process.env.JIAZU_MASTER_TREE || 'zhonghua');
const DRY = flag('dry-run');
const CONFIRM_REAL = flag('confirm-real');
const WIDTH = 6;

const samePath = (a, b) => path.resolve(a) === path.resolve(b);
if (samePath(ROOT, REAL_ROOT) && !CONFIRM_REAL) {
  console.error(
    `[migrate-global-ids] 拒绝在真实数据根上运行：${ROOT}\n` +
      '  先复制副本再跑（推荐）：\n' +
      `    rsync -a --delete ${REAL_ROOT}/ /tmp/jiazu-id-migrate/\n` +
      '    node scripts/migrate-global-ids.mjs --root /tmp/jiazu-id-migrate\n' +
      '  确认要在真源执行时显式加 --confirm-real（并由总编辑复核映射表）。',
  );
  process.exit(2);
}

const TREES_DIR = path.join(ROOT, 'trees');
const DETAILS_DIR = path.join(ROOT, 'details');
const COLS_DIR = path.join(ROOT, 'collections');
const MAP_FILE = path.join(ROOT, 'id-migration.json');
const REPORT_FILE = path.join(ROOT, 'id-migration.report.json');
const SEQ_FILE = path.join(COLS_DIR, 'jiazu_id_seq.json');

const numOf = (id) => {
  const m = String(id || '').match(/^[IF]?(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
};
const fmt = (prefix, n) => `${prefix}${String(n).padStart(WIDTH, '0')}`;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

/** 稳定写盘：内容没变就不写（幂等重放 = 零改动、mtime/md5 都不变） */
function writeIfChanged(file, content) {
  const next = content;
  let prev = null;
  try {
    prev = fs.readFileSync(file, 'utf8');
  } catch {
    prev = null;
  }
  if (prev === next) return false;
  if (!DRY) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next);
  }
  return true;
}

// ---- 载入数据 ----
if (!fs.existsSync(TREES_DIR)) {
  console.error(`[migrate-global-ids] 数据根下没有 trees/ 目录：${TREES_DIR}`);
  process.exit(1);
}
const treeFiles = fs.readdirSync(TREES_DIR).filter((f) => f.endsWith('.json'));
const trees = new Map();
for (const f of treeFiles) {
  const tree = readJson(path.join(TREES_DIR, f));
  const id = tree.tree_id || f.replace(/\.json$/, '');
  trees.set(id, tree);
}
if (!trees.has(MASTER)) {
  console.error(`[migrate-global-ids] 找不到总谱树 ${MASTER}（--master 可指定）`);
  process.exit(1);
}

/** 一族节点排序键：原编号数值升序（无编号者置后，用 handle 稳定兜底） */
const sortKey = (o) => {
  const n = numOf(o.gramps_id);
  return [n === null ? Number.MAX_SAFE_INTEGER : n, String(o.gramps_id || ''), String(o.handle || '')];
};
const cmpNodes = (a, b) => {
  const [na, ia, ha] = sortKey(a);
  const [nb, ib, hb] = sortKey(b);
  if (na !== nb) return na - nb;
  if (ia !== ib) return ia < ib ? -1 : 1;
  return ha < hb ? -1 : ha > hb ? 1 : 0;
};

const masterTree = trees.get(MASTER);
const masterPersonIds = Object.values(masterTree.people || {}).map((p) => numOf(p.gramps_id)).filter((n) => n !== null);
const masterFamilyIds = Object.values(masterTree.families || {}).map((f) => numOf(f.gramps_id)).filter((n) => n !== null);
const masterPersonMax = masterPersonIds.length ? Math.max(...masterPersonIds) : 0;
const masterFamilyMax = masterFamilyIds.length ? Math.max(...masterFamilyIds) : 0;

// 待重编号的树：除 zhonghua 外的全部树，按 tree_id 字典序
const otherIds = [...trees.keys()].filter((id) => id !== MASTER).sort();

/** 从 collections/jiazu_id_seq.json 读已有计数器（缺失 → 0） */
function readSeqCounter(kind) {
  try {
    const raw = readJson(SEQ_FILE);
    const doc = raw?.[kind];
    const n = Number(doc?.next);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// 计数器初值（docs/id-system.spec.md §4-2）：
// 基准 = max(总谱编号, 未被本次重编号的其它编号) + 1 —— 首次全量迁移时后者为空 → 就是 max(zhonghua)+1；
// 增量/重放时把「已迁移（带 legacy_gramps_id）节点占用的号」计入，绝不撞号。
function computeBaseline(kindKey, prefix, masterMax) {
  let max = masterMax;
  const legacyKey = 'legacy_gramps_id';
  for (const [id, tree] of trees) {
    if (id === MASTER) continue;
    for (const o of Object.values(tree[kindKey] || {})) {
      if (!o?.[legacyKey]) continue; // 本次会被重编号的节点不参与基准
      const n = numOf(o.gramps_id);
      if (n !== null && n > max) max = n;
    }
  }
  return max + 1;
}

const personNextStart = computeBaseline('people', 'I', masterPersonMax);
const familyNextStart = computeBaseline('families', 'F', masterFamilyMax);

// ---- 计划：逐树逐号 ----
const mapping = {}; // { tree_id: { old: new } }
const byHandle = {}; // { tree_id: { handle: new } }（重放/审计用；进 report 文件）
const detailWrites = new Map(); // `${tree_id}:${handle}` → legacy old id
let personSeq = personNextStart;
let familySeq = familyNextStart;
let totalPeople = 0;
let totalFamilies = 0;
let totalRenumberedPeople = 0;
let totalRenumberedFamilies = 0;
const perTree = [];

for (const treeId of otherIds) {
  const tree = trees.get(treeId);
  const treeMap = {};
  const handleMap = {};
  let renumbered = 0;

  // 人
  const people = Object.values(tree.people || {}).sort(cmpNodes);
  for (const p of people) {
    const old = String(p.gramps_id || '');
    totalPeople += 1;
    if (p.legacy_gramps_id) {
      // 已迁移（幂等重放）→ 保持现有编号
      handleMap[p.handle] = old;
      continue;
    }
    const next = fmt('I', personSeq++);
    if (old) treeMap[old] = next;
    p.legacy_gramps_id = old;
    p.gramps_id = next;
    handleMap[p.handle] = next;
    detailWrites.set(`${treeId}:${p.handle}`, old);
    renumbered += 1;
    totalRenumberedPeople += 1;
  }

  // 家族
  const families = Object.values(tree.families || {}).sort(cmpNodes);
  for (const f of families) {
    const old = String(f.gramps_id || '');
    totalFamilies += 1;
    if (f.legacy_gramps_id) {
      handleMap[f.handle] = old;
      continue;
    }
    const next = fmt('F', familySeq++);
    if (old) treeMap[old] = next;
    f.legacy_gramps_id = old;
    f.gramps_id = next;
    handleMap[f.handle] = next;
    renumbered += 1;
    totalRenumberedFamilies += 1;
  }

  if (Object.keys(treeMap).length) mapping[treeId] = treeMap;
  byHandle[treeId] = handleMap;
  perTree.push({
    tree_id: treeId,
    people: people.length,
    families: families.length,
    renumbered_entries: renumbered,
  });
}

// ---- 详情文档：写 legacy_gramps_id（只读留痕）+ 同步展示冗余 gramps_id/name ---- */
let detailsUpdated = 0;
let detailsCreated = 0;
const detailChanged = [];
if (fs.existsSync(DETAILS_DIR)) {
  for (const [key, legacyOld] of detailWrites) {
    const [treeId, handle] = key.split(/:(.+)/);
    const p = path.join(DETAILS_DIR, `${key}.json`);
    if (!fs.existsSync(p)) {
      // 原本没有档案的节点：建一个最小详情（保持「每节点一条详情」的口径）
      const node = trees.get(treeId)?.people?.[handle] || {};
      const content = {
        _id: key,
        tree_id: treeId,
        handle,
        gramps_id: node.gramps_id || '',
        name: node.name || '',
        legacy_gramps_id: legacyOld,
        events: [],
        media: [],
        citations: [],
        notes: [],
        attributes: [],
      };
      if (writeIfChanged(p, JSON.stringify(content, null, 2))) {
        detailsCreated += 1;
        detailChanged.push(key);
      }
      continue;
    }
    const detail = readJson(p);
    const node = trees.get(treeId)?.people?.[handle] || {};
    let changed = false;
    if (String(detail.legacy_gramps_id || '') === '') {
      detail.legacy_gramps_id = legacyOld;
      changed = true;
    }
    if (node.gramps_id && detail.gramps_id !== node.gramps_id) {
      detail.gramps_id = node.gramps_id;
      changed = true;
    }
    if (node.name && detail.name !== node.name) {
      detail.name = node.name;
      changed = true;
    }
    if (changed && writeIfChanged(p, JSON.stringify(detail, null, 2))) {
      detailsUpdated += 1;
      detailChanged.push(key);
    }
  }
}

// ---- 全局唯一性校验（迁移后） ----
const seenPerson = new Map();
const seenFamily = new Map();
const dupes = [];
for (const [treeId, tree] of trees) {
  for (const p of Object.values(tree.people || {})) {
    const id = String(p.gramps_id || '');
    if (!id) continue;
    if (seenPerson.has(id)) dupes.push(`人 ${id}：${seenPerson.get(id)} 与 ${treeId}:${p.handle}`);
    else seenPerson.set(id, `${treeId}:${p.handle}`);
  }
  for (const f of Object.values(tree.families || {})) {
    const id = String(f.gramps_id || '');
    if (!id) continue;
    if (seenFamily.has(id)) dupes.push(`家族 ${id}：${seenFamily.get(id)} 与 ${treeId}:${f.handle}`);
    else seenFamily.set(id, `${treeId}:${f.handle}`);
  }
}

// ---- 落盘：树 JSON（只写有改动的） ----
let treesWritten = 0;
for (const treeId of otherIds) {
  const tree = trees.get(treeId);
  const file = path.join(TREES_DIR, `${treeId}.json`);
  const content = JSON.stringify(tree, null, 2);
  if (writeIfChanged(file, content)) treesWritten += 1;
}

// ---- 落盘：映射表 + 计数器 + 报告 ----
const changedCount =
  treesWritten + detailsUpdated + detailsCreated + (Object.keys(mapping).length ? 1 : 0);

const nextPerson = Math.max(personSeq, readSeqCounter('person'));
const nextFamily = Math.max(familySeq, readSeqCounter('family'));
const seqContent = JSON.stringify(
  { person: { _id: 'person', next: nextPerson }, family: { _id: 'family', next: nextFamily } },
  null,
  2,
);
const seqWritten = writeIfChanged(SEQ_FILE, seqContent);

if (Object.keys(mapping).length) writeIfChanged(MAP_FILE, JSON.stringify(mapping, null, 2));

const report = {
  _schema: '1.0',
  master_tree_id: MASTER,
  root: ROOT,
  dry_run: DRY,
  counters: { person_next: nextPerson, family_next: nextFamily },
  person_id_start: personNextStart,
  family_id_start: familyNextStart,
  trees: perTree,
  totals: {
    trees: otherIds.length,
    people: totalPeople,
    families: totalFamilies,
    renumbered_people: totalRenumberedPeople,
    renumbered_families: totalRenumberedFamilies,
    trees_written: treesWritten,
    details_updated: detailsUpdated,
    details_created: detailsCreated,
    mapping_entries: Object.values(mapping).reduce((n, m) => n + Object.keys(m).length, 0),
  },
  by_handle: byHandle,
  duplicate_ids: dupes,
  changed: changedCount > 0,
};
if (changedCount > 0 || !fs.existsSync(REPORT_FILE)) {
  // 报告带 generated_at：只在真有改动时重写（重放零改动 → 报告保持不变，逐字节可验）
  writeIfChanged(REPORT_FILE, JSON.stringify({ ...report, generated_at: new Date().toISOString() }, null, 2));
}

// ---- 输出 ----
const line = (s) => console.log(s);
line(`[migrate-global-ids] root=${ROOT} master=${MASTER}${DRY ? ' （DRY RUN，未写任何文件）' : ''}`);
line(`  编号基准：人 I${personNextStart} 起 / 家族 F${familyNextStart} 起（= max(${MASTER} 编号)+1 或已用号之后）`);
line(`  重编号：人 ${totalRenumberedPeople} / 家族 ${totalRenumberedFamilies}（共 ${otherIds.length} 棵树）`);
line(`  写盘：树 ${treesWritten} 个 · 详情 更新 ${detailsUpdated}/新建 ${detailsCreated} · 计数器 ${seqWritten ? '已更新' : '未变'}`);
line(`  计数器现值：person.next=${nextPerson} family.next=${nextFamily}`);
if (Object.keys(mapping).length) line(`  映射表：${MAP_FILE}（${report.totals.mapping_entries} 条）`);
else line('  映射表：本次无改动（幂等重放）→ 未重写');
if (dupes.length) {
  line(`  ⚠️ 重号 ${dupes.length} 处：`);
  for (const d of dupes.slice(0, 10)) line(`     - ${d}`);
} else {
  line(`  唯一性校验：全站人/家族编号唯一 ✓（人 ${seenPerson.size} 个编号 / 家族 ${seenFamily.size} 个）`);
}
line(`  总改动：${changedCount} 处${changedCount === 0 ? '（幂等重放：零改动）' : ''}`);
if (DRY) line('  （DRY RUN：如需落盘请去掉 --dry-run）');
process.exit(dupes.length ? 3 : 0);
