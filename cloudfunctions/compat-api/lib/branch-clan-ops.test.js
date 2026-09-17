/**
 * 立支 / 汇宗 单测 — lib/branch-clan-ops.js（规格：docs/branch-clan-ops.spec.md §10-1 全 25 条）
 *
 * 覆盖（用例名 → §10-1 条目号）：
 *   1) 立支 · 祖先链上移 + 换树不换号 + 详情随迁改键 + 原树归属 + 扣 9999 籽   → #1 #2 #3 #5
 *   2) 立支 · 新树始祖镜像（新树仅 1 节点）+ 宗谱两条登记 + 支系入口推导 +2      → #4 #6
 *   3) 立支 · 籽不足 409 一分未扣、一字未写                                      → #7
 *   4) 立支 · 落库失败（真实 EACCES）→ 结构回滚 + 原路返还同一批次 + fee_refunded → #8
 *   5) 立支 · 无宗谱归属 / 宗谱落点为空 → 400 不扣籽                             → #9
 *   6) 立支 · 始祖位 / 镜像节点 / 总谱 / 祖谱 → 400 不扣籽                       → #10
 *   7) 立支 · 跨树引用红线（external_person_handle / tree-meta.founder_handle）  → #11
 *   8) 汇宗 · 整树迁移 + 换树不换号 + 条目与树 JSON 删除 + 详情改 _id           → #12
 *   9) 汇宗 · 始祖镜像丢弃                                                       → #14
 *  10) 汇宗 · 落点家族复用顺序（槽位空 / 有家族 / 都没有 → 新建）                → #13
 *  11) 汇宗 · 折损比例与取整（10→5 / 3→2 / 已过期→0）                            → #16
 *  12) 汇宗 · 叠加不覆盖（目标树已有灵气 → 顺延 + buffer_until=null）            → #17
 *  13) 汇宗 · 目标树未镶嵌玉 → 不并入 + skipped_reason + transferred_days=0      → #18
 *  14) 汇宗 · 跨树引用红线 → 409，两树 / tree-meta / jiazu_spirit 全不变         → #15
 *  15) 汇宗 · confirm_people 不符 → 409 DELETE_SCOPE_CHANGED 不写                → #19
 *  16) 汇宗 · 0 片 0 籽 + R5 口径保持                                            → #20 #21
 *  17) 汇宗 · 目标解析与校验（同树 / 祖谱 / 总谱 / 镜像 / 解析不到）             → #22
 *  18) 后台设置键 branch_fee_seeds / converge_spirit_ratio 改后生效              → #24（+§5-4）
 *  19) 数值契约（9999 籽 / 0 片 0 籽 / ceil / 默认 0.5）                          → #24
 *  20) 真源未变（config/tree-meta.json + migrate-output/）开篇与收尾各断言一次   → #23
 *  21) 立支 · 详情缺失告警出参 warnings?（有缺失 → 非空且含节点编号；无缺失 → 无该键）→ #25（§8-1）
 *  22) 系统级失败文案统一「服务内部错误」（汇宗 ④ 树文件删除失败 / ⑤ 灵气写入失败）→ #8（§7 / §15-#8）
 *  23) 立支 ↔ 汇宗 **互逆闭环**（立支产物的始祖镜像指回原树普通节点 → 直接汇宗 200）+ 认祖路线回归 → §6-2-2 放宽口径（§13-17）
 *  24) 系统级失败**不得泄露本机路径**（/admin/add-child 真实 EACCES → 500 + 通用文案；业务裸异常仍 400 + 业务文案）→ §7
 *
 * 数据安全：COMPAT_SOURCE=local + COMPAT_OUT_DIR / COMPAT_META_FILE 全部指向 /tmp 副本；
 * 本文件**不写** migrate-output/ 与 config/tree-meta.json（文首 + 文末各断言一次，照 lib/node-delete.test.js）。
 * 真源护栏口径见下方 assertRealUntouched 的注释（migrate-output/** 逐字节；config/tree-meta.json 用
 * 「本套件写不进 + 真源无夹具指纹」的确定性口径 —— 该文件是运行中的服务 / 用户在界面上实时编辑的**活文件**）。
 *
 * 注：原「缺陷复现（只上报）」用例（store.updateTrees 失败侧未回滚进程内缓存）已随实现修复
 * 改写为 ⑰ 的回归断言（失败侧缓存 === 磁盘）；两条实现缺陷的修复见
 * lib/store.js 的 updateTrees 失败回滚 与 index.js 两条路由的 catch 状态码（§7-1 / §7-2 500）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/branch-clan-ops.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');
const REAL_COLS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-branch-clan-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;
const TREES_DIR = path.join(TMP, 'trees');
const DETAILS_DIR = path.join(TMP, 'details');
const COLS_DIR = path.join(TMP, 'collections');
for (const d of [TREES_DIR, DETAILS_DIR, COLS_DIR]) fs.mkdirSync(d, { recursive: true });

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));

// ---- 真源基线（文首取一次；文首 / 文末各断言一次）----
// ⚠️ 两类真源对象的护栏口径**不同**（本轮 flake 猎杀的根因，勿随手「统一」）：
//   · migrate-output/**（trees / details / collections）= 本套件真正的误伤对象，且**无进程外写者**
//     （实测：跑测试期间该目录无任何文件被外部触碰）→ 保留**逐字节 md5 + 清单**全额断言。
//   · config/tree-meta.json = 运行中的本地服务（:3100）与用户在界面上实时编辑的**活文件**
//     （实测：连续观察中 md5 数秒内即变；与 HEAD 的差异含 description / display_title / genealogy_name /
//      origin / hall_name / archive_url 等字段，甚至新增整条树登记）→ 对它做「与文首逐字节一致」的断言
//      在**任何**一次并发保存时都会变红，且红哪几条取决于保存落在哪个断言之前
//      （落在开篇断言之前 = 开篇 + 收尾同时红 = 历史上观测到的 24 tests / 22 pass / 2 fail 签名）。
//      这与「本套件是否写穿真源」无关，故改成**不依赖外部写入时机**的确定性口径：
//      ① 结构证明本套件写不进真源：沙箱生效 + 写根 = /tmp 副本（用例①断言，机制见 lib/store.js assertWriteAllowed）；
//      ② 语义指纹：真源 meta 里**不得出现任何夹具专属 tree_id**（本套件若写穿真源，必然是夹具内容整体覆盖）；
//      ③ 真源内容与文首基线不同时**只打印归因**（变更字段路径），不判红 —— 那是用户 / 界面的并发编辑。
const REAL_META_RAW = fs.readFileSync(REAL_META, 'utf8');
const REAL_META_OBJ = JSON.parse(REAL_META_RAW);
const REAL_META_MD5 = md5(REAL_META);
const REAL_TREES_MD5 = dirBaseline(REAL_TREES);
const REAL_DETAILS_MD5 = dirBaseline(REAL_DETAILS);
const REAL_COLS_MD5 = dirBaseline(REAL_COLS);

/** 两份 JSON 之间「值不同」的字段路径（真源 meta 并发编辑的归因用；只记录、不判红） */
function changedPaths(a, b, p = '') {
  if (a === b) return [];
  const bothObj = a && b && typeof a === 'object' && typeof b === 'object';
  if (!bothObj) return [p || '(<root>)'];
  const out = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (!(k in a) || !(k in b)) out.push(`${p}.${k}(新增/删除)`);
    else out.push(...changedPaths(a[k], b[k], `${p}.${k}`));
  }
  return out;
}

/**
 * 真源护栏（§10-1 #23）：
 * - migrate-output/**（trees / details / collections）逐字节 + 清单，全额断言；
 * - config/tree-meta.json：结构「写不进」+ 真源无夹具指纹（确定性）；内容变化只记归因（见文件头注释）。
 */
function assertRealUntouched(tag) {
  const trees = fs.readdirSync(REAL_TREES);
  assert.deepEqual(trees.slice().sort(), [...REAL_TREES_MD5.keys()].sort(), `[${tag}] 真源 migrate-output/trees 清单变了`);
  for (const f of trees) assert.equal(md5(path.join(REAL_TREES, f)), REAL_TREES_MD5.get(f), `[${tag}] 真源树 ${f} 被改动了`);
  const details = fs.readdirSync(REAL_DETAILS);
  assert.deepEqual(details.slice().sort(), [...REAL_DETAILS_MD5.keys()].sort(), `[${tag}] 真源 migrate-output/details 清单变了`);
  for (const f of details) assert.equal(md5(path.join(REAL_DETAILS, f)), REAL_DETAILS_MD5.get(f), `[${tag}] 真源详情 ${f} 被改动了`);
  const cols = fs.readdirSync(REAL_COLS);
  assert.deepEqual(cols.slice().sort(), [...REAL_COLS_MD5.keys()].sort(), `[${tag}] 真源 collections 清单变了`);
  for (const f of cols) assert.equal(md5(path.join(REAL_COLS, f)), REAL_COLS_MD5.get(f), `[${tag}] 真源集合 ${f} 被改动了`);

  // config/tree-meta.json：本套件写不进真源（①）+ 真源里不得出现夹具指纹（②）+ 内容变化只记归因（③）
  const raw = fs.readFileSync(REAL_META, 'utf8');
  const real = JSON.parse(raw); // 真源被截断 / 写坏 → 直接红（这一条同样与外部编辑时机无关）
  assert.equal(typeof real.trees, 'object', `[${tag}] 真源 config/tree-meta.json 的 trees 结构被破坏`);
  for (const id of FIXTURE_TREE_IDS) {
    assert.equal(id in real.trees, false, `[${tag}] 夹具树「${id}」出现在真源 tree-meta 里：本套件写穿了真源（P0 事故）`);
  }
  if (raw !== REAL_META_RAW) {
    const paths = changedPaths(REAL_META_OBJ, real, '').slice(0, 8);
    console.log(
      `[真源护栏 · ${tag}] config/tree-meta.json 被**进程外写者**改动（本套件写不进真源）：` +
        `${paths.length ? paths.join('、') : '内容变化'} → 判为用户 / 界面并发编辑，记录跳过字节比对；` +
        `基线 md5 ${REAL_META_MD5} → 当前 ${md5(REAL_META)}`,
    );
  }
}

// ================= 夹具（全部落在 /tmp 副本） =================

const DAY = 86400000;
const NOW0 = Date.now();
const isoPlus = (days) => new Date(NOW0 + days * DAY).toISOString();

const P = (handle, gramps_id, name, extra = {}) => ({
  handle,
  gramps_id,
  name,
  surname: '季',
  given: name,
  gender: 'M',
  birth_date: '',
  death_date: '',
  birth_place: '',
  death_place: '',
  parent_family: '',
  spouse_families: [],
  ...extra,
});

/** 普通家族树（始祖 = 宗谱节点镜像 m）：m ─ ftop ─ top ─ fmid ─ mid ─ fn ─ N ─ fkid ─ kid，另有旁支 side */
function chainTree(id, { clanId = 'bc_clan', clanHandle = 'own_ji', extraMirror = false } = {}) {
  const H = { m: `${id}-m`, top: `${id}-top`, side: `${id}-side`, mid: `${id}-mid`, n: `${id}-n`, kid: `${id}-kid` };
  const F = { ftop: `${id}-ftop`, fmid: `${id}-fmid`, fn: `${id}-fn`, fkid: `${id}-fkid` };
  const people = {
    [H.m]: P(H.m, 'I0001', `季${id}始祖镜像`, {
      given: '始祖镜像',
      spouse_families: [F.ftop],
      external_tree: clanId,
      external_person_handle: clanHandle,
      external_link_type: 'founder',
      external_mirror: 'true',
      external_relation_note: `「季${id}立支点」（${clanId} 宗谱镜像）`,
    }),
    [H.top]: P(H.top, 'I0010', `季${id}上移一`, { given: '上移一', parent_family: F.ftop, spouse_families: [F.fmid] }),
    [H.side]: P(H.side, 'I0011', `季${id}旁支`, { given: '旁支', parent_family: F.ftop }),
    [H.mid]: P(H.mid, 'I0012', `季${id}上移二`, { given: '上移二', parent_family: F.fmid, spouse_families: [F.fn] }),
    [H.n]: P(H.n, 'I0013', `季${id}立支点`, { given: '立支点', parent_family: F.fn, spouse_families: [F.fkid] }),
    [H.kid]: P(H.kid, 'I0014', `季${id}后代`, { given: '后代', parent_family: F.fkid }),
  };
  if (extraMirror) {
    people[`${id}-m2`] = P(`${id}-m2`, 'I0015', `季${id}婚姻镜像`, {
      given: '婚姻镜像',
      external_tree: 'bc_ref_other',
      external_person_handle: 'bc_ref_other-real',
      external_link_type: 'marriage',
      external_mirror: 'true',
    });
  }
  return {
    _schema: '1.0',
    tree_id: id,
    founder_gramps_id: 'I0001',
    version: 3,
    people,
    families: {
      [F.ftop]: { handle: F.ftop, gramps_id: 'F0001', father_handle: H.m, mother_handle: '', child_handles: [H.top, H.side] },
      [F.fmid]: { handle: F.fmid, gramps_id: 'F0002', father_handle: H.top, mother_handle: '', child_handles: [H.mid] },
      [F.fn]: { handle: F.fn, gramps_id: 'F0003', father_handle: H.mid, mother_handle: '', child_handles: [H.n] },
      [F.fkid]: { handle: F.fkid, gramps_id: 'F0004', father_handle: H.n, mother_handle: '', child_handles: [H.kid] },
    },
  };
}

/** 普通家族树（始祖是真身节点，非镜像）：top ─ fmid ─ mid ─ fn ─ N ─ fkid ─ kid */
function plainTree(id) {
  const H = { top: `${id}-top`, mid: `${id}-mid`, n: `${id}-n`, kid: `${id}-kid` };
  const F = { fmid: `${id}-fmid`, fn: `${id}-fn`, fkid: `${id}-fkid` };
  return {
    _schema: '1.0',
    tree_id: id,
    founder_gramps_id: 'I0001',
    version: 2,
    people: {
      [H.top]: P(H.top, 'I0001', `季${id}始祖真身`, { given: '始祖真身', spouse_families: [F.fmid] }),
      [H.mid]: P(H.mid, 'I0012', `季${id}上移`, { given: '上移', parent_family: F.fmid, spouse_families: [F.fn] }),
      [H.n]: P(H.n, 'I0013', `季${id}立支点`, { given: '立支点', parent_family: F.fn, spouse_families: [F.fkid] }),
      [H.kid]: P(H.kid, 'I0014', `季${id}后代`, { given: '后代', parent_family: F.fkid }),
    },
    families: {
      [F.fmid]: { handle: F.fmid, gramps_id: 'F0002', father_handle: H.top, mother_handle: '', child_handles: [H.mid] },
      [F.fn]: { handle: F.fn, gramps_id: 'F0003', father_handle: H.mid, mother_handle: '', child_handles: [H.n] },
      [F.fkid]: { handle: F.fkid, gramps_id: 'F0004', father_handle: H.n, mother_handle: '', child_handles: [H.kid] },
    },
  };
}

/** 汇宗落点树 / 目标树：X = <id>-x（variant: none | slot-empty | slot-filled | mirror） */
function targetTree(id, variant = 'none') {
  const H = { x: `${id}-x`, w: `${id}-w`, mir: `${id}-mir` };
  const F = { fx: `${id}-fx` };
  const people = { [H.x]: P(H.x, 'I0300', `季${id}落点`, { given: '落点' }) };
  const families = {};
  if (variant === 'slot-empty' || variant === 'slot-filled') {
    people[H.x].spouse_families = [F.fx];
    if (variant === 'slot-filled') {
      people[H.w] = P(H.w, 'I0301', `季${id}落点配偶`, { given: '落点配偶', gender: 'F', spouse_families: [F.fx] });
    }
    families[F.fx] = {
      handle: F.fx,
      gramps_id: 'F0300',
      father_handle: H.x,
      mother_handle: variant === 'slot-filled' ? H.w : '',
      child_handles: [],
    };
  }
  if (variant === 'mirror') {
    people[H.mir] = P(H.mir, 'I0302', `季${id}外树镜像`, {
      given: '外树镜像',
      external_tree: 'bc_clan',
      external_person_handle: 'own_ji',
      external_link_type: 'founder',
      external_mirror: 'true',
    });
    people[H.x].external_link_type = '';
  }
  return { _schema: '1.0', tree_id: id, version: 1, people, families };
}

/** 宗谱树（自有段落点 own_*；owner 为空 → 落点未设置） */
function clanTree(id, ownHandle) {
  const people = {};
  if (ownHandle) people[ownHandle] = P(ownHandle, 'I0002', `季氏宗谱${id}自有段`, { given: `宗谱${id}` });
  return { _schema: '1.0', tree_id: id, kind: 'clan', founder_gramps_id: 'I0001', version: 1, people, families: {} };
}

function writeTree(tree) {
  fs.writeFileSync(path.join(TREES_DIR, `${tree.tree_id}.json`), JSON.stringify(tree, null, 2));
}
function readTreeDisk(id) {
  return JSON.parse(fs.readFileSync(path.join(TREES_DIR, `${id}.json`), 'utf8'));
}
function treeExistsDisk(id) {
  return fs.existsSync(path.join(TREES_DIR, `${id}.json`));
}
function treeMd5Disk(id) {
  return md5(path.join(TREES_DIR, `${id}.json`));
}
function writeDetailDoc(doc) {
  fs.writeFileSync(path.join(DETAILS_DIR, `${doc._id}.json`), JSON.stringify(doc, null, 2));
}
function detailExists(treeId, handle) {
  return fs.existsSync(path.join(DETAILS_DIR, `${treeId}:${handle}.json`));
}
function readDetailDisk(treeId, handle) {
  const p = path.join(DETAILS_DIR, `${treeId}:${handle}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
const treeFileCount = () => fs.readdirSync(TREES_DIR).filter((f) => f.endsWith('.json')).length;
const stripVolatile = (tree) => {
  const c = JSON.parse(JSON.stringify(tree));
  delete c.version;
  delete c.updated_at;
  return c;
};
/** 批次指纹（按 lot.id 排序）：批次数组顺序不是契约（见技能「冲正还原不等于逐字节不变」） */
const lotFingerprint = (lots) =>
  (lots || [])
    .map((l) => ({ id: l.id, qty: l.qty, expires_at: l.expires_at }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

// ---- 写树 / 写 meta ----

const MIRROR_FAMILIES = [
  'bc_src',
  'bc_nopoint',
  'bc_mirror',
  'bc_poor',
  'bc_rollback',
  'bc_fee1',
  'bc_ref',
  'bc_refmeta',
  'bc_route',
  'cv_main',
  'cv_skip',
  'cv_d3',
  'cv_exp',
  'cv_ref',
  'cv_conf',
  'cv_self',
  'cv_ru1',
  'cv_ru2',
  'cv_ru3',
  'cv_ratio',
  // #25 详情缺失告警（warnings?）专用源树：bc_warn_yes 的上移链缺 top 的详情；bc_warn_no 两条详情齐备
  'bc_warn_yes',
  'bc_warn_no',
  // 系统级失败文案（§15-#8）专用源树：④ 阶段（树文件删除）/ ⑤ 阶段（jiazu_spirit 写入）各一条
  'cv_stage4',
  'cv_stage5',
];
// 立支用例的源树用**专属宗谱** bc_clan3（否则其它树的始祖镜像也会落进 bc_clan 的支系入口列表，无法逐条断言「+2」）
const CLAN_OF = Object.fromEntries(MIRROR_FAMILIES.map((id) => [id, 'bc_clan']));
CLAN_OF.bc_nopoint = 'bc_clan2';
CLAN_OF.bc_rollback = 'bc_clan_rb';
CLAN_OF.bc_src = 'bc_clan3';
const OWN_OF = { bc_clan: 'own_ji', bc_clan_rb: 'own_rb', bc_clan2: '', bc_clan3: 'own_ts' };
for (const id of MIRROR_FAMILIES) {
  writeTree(chainTree(id, { clanId: CLAN_OF[id], clanHandle: OWN_OF[CLAN_OF[id]], extraMirror: id === 'bc_mirror' }));
}
for (const id of ['bc_noclan', 'bc_founderonly', 'cv_bad']) writeTree(plainTree(id));
// 缓存回滚回归用例专用：两棵纯结构树（无 tree-meta 条目；只被 store.updateTrees 直接驱动，
// 用作「已落盘一侧 / 落库失败一侧」，使该用例不依赖其它用例的副作用）
for (const id of ['rb_a', 'rb_b']) writeTree(plainTree(id));

const TARGET_VARIANTS = {
  cv_t_main: 'slot-empty',
  cv_t1: 'slot-empty',
  cv_t2: 'none',
  cv_t3: 'slot-filled',
  cv_t4: 'none',
  cv_t5: 'none',
  cv_t6: 'none',
  cv_t7: 'none',
  cv_t8: 'none',
  cv_t9: 'none',
  cv_t_ratio: 'none',
  cv_t_mirror: 'mirror',
  cv_t_s4: 'none',
  cv_t_s5: 'none',
};
for (const [id, variant] of Object.entries(TARGET_VARIANTS)) writeTree(targetTree(id, variant));
writeTree({ _schema: '1.0', tree_id: 'bc_ref_other', version: 1, people: {}, families: {} });

/**
 * 夹具专属 tree_id 全集（真源护栏 §10-1 #23 的语义指纹）：
 * 本套件若写穿真源 `config/tree-meta.json`，必然是**夹具 meta 整体覆盖**真源 → 这些 id 必现。
 * 刻意**不含** `zhonghua`（真源里真实存在的总谱条目）与 `ji_23395_NN`（真源里同名的真实树）
 * —— 用真源里也合法存在的 id 做指纹会假红。
 */
const FIXTURE_TREE_IDS = [
  ...MIRROR_FAMILIES,
  ...Object.keys(TARGET_VARIANTS),
  'bc_noclan',
  'bc_founderonly',
  'cv_bad',
  'rb_a',
  'rb_b',
  'bc_clan',
  'bc_clan2',
  'bc_clan3',
  'bc_clan_rb',
  'bc_ref_other',
  'bc_refmeta_upper',
  // 互逆闭环 / 上层镜像回归 / 真人始祖拒绝 / 系统级失败（add-child EACCES）补测夹具
  'cv_loop_a',
  'bc_clan_loop',
  'cv_reg_src',
  'bc_clan_reg',
  'cv_t_reg',
  'cv_plain_src',
  'cv_t_reg2',
  'cv_ec_child',
];

// 祖谱 / 总谱
writeTree(clanTree('bc_clan', 'own_ji'));
writeTree(clanTree('bc_clan_rb', 'own_rb'));
writeTree(clanTree('bc_clan2', ''));
writeTree(clanTree('bc_clan3', 'own_ts'));
writeTree({ _schema: '1.0', tree_id: 'zhonghua', founder_gramps_id: 'I0001', version: 1, people: { mRoot: P('mRoot', 'I0001', '风伏羲', { given: '伏羲' }) }, families: {} });

// bc_ref_other：外树镜像指向 bc_ref 的上移链节点（红线用例）
const refOther = readTreeDisk('bc_ref_other');
refOther.people['bc_ref_other-mir'] = P('bc_ref_other-mir', 'I0500', '季bc_ref上移二镜像', {
  given: '上移二镜像',
  external_tree: 'bc_ref',
  external_person_handle: 'bc_ref-mid',
  external_link_type: 'founder',
  external_mirror: 'true',
});
// bc_ref_other：再加一条镜像指向 cv_ref 的真实段节点 —— 汇宗红线（§10-1-15）的夹具：
// 红线要求「迁移集合任一 handle 被其他树引用 → 409」，本文件原先没为 cv_ref 造任何外树引用，
// 导致该用例「Missing expected rejection」（夹具缺口，不是实现放行）。
refOther.people['bc_ref_other-mir-cv'] = P('bc_ref_other-mir-cv', 'I0501', '季cv_ref上移二镜像', {
  given: '上移二镜像',
  external_tree: 'cv_ref',
  external_person_handle: 'cv_ref-mid',
  external_link_type: 'founder',
  external_mirror: 'true',
});
writeTree(refOther);

// ---- tree-meta 副本 ----
const metaFixture = { _schema: '1.1', trees: {} };
const regFamily = (id, { clan = 'bc_clan', founder = `${id}-m`, title = null, founderName = '' } = {}) => {
  const entry = {
    tree_id: id,
    kind: 'family',
    path_alias: `/${id}`,
    surname_char: '季',
    display_title: title || `季氏测试家族（${id}）`,
    genealogy_name: '季氏家谱',
    founder_handle: founder,
    founder_gramps_id: 'I0001',
    founder_name: founderName || `季${id}始祖`,
  };
  if (clan) entry.clan_tree_id = clan;
  metaFixture.trees[id] = entry;
};
for (const id of MIRROR_FAMILIES) {
  regFamily(id, { clan: CLAN_OF[id], founder: `${id}-m`, title: id === 'bc_src' ? '季氏测试家族（立支源）' : null });
}
regFamily('bc_noclan', { clan: null, founder: 'bc_noclan-top' });
regFamily('bc_founderonly', { clan: 'bc_clan', founder: 'bc_founderonly-top' });
regFamily('cv_bad', { clan: 'bc_clan', founder: 'cv_bad-top' });
for (const id of Object.keys(TARGET_VARIANTS)) regFamily(id, { clan: null, founder: `${id}-x` });
regFamily('bc_ref_other', { clan: null, founder: '' });
// 只存在于 meta 的「他树始祖登记」（擦掉镜像节点后反指针仍在 meta 里的兜底路径）
metaFixture.trees.bc_refmeta_upper = {
  tree_id: 'bc_refmeta_upper',
  kind: 'family',
  path_alias: '/bc_refmeta_upper',
  surname_char: '季',
  display_title: '季氏测试家族（bc_refmeta 的登记方）',
  founder_handle: 'bc_refmeta-mid',
  founder_gramps_id: 'I0600',
  founder_name: '季bc_refmeta上移二',
};
metaFixture.trees.zhonghua = {
  tree_id: 'zhonghua',
  kind: 'master',
  is_master: true,
  path_alias: '/zhonghua',
  surname_char: '华',
  display_title: '中华世本 · 全球华人家谱总谱',
};
metaFixture.trees.bc_clan = {
  tree_id: 'bc_clan',
  kind: 'clan',
  path_alias: '/z/bc_clan',
  surname: '季',
  surname_char: '季',
  display_title: '季氏宗谱（立支落点）',
  founder_handle: 'own_ji',
  master_tree_id: 'zhonghua',
  master_handle: 'mRoot',
};
metaFixture.trees.bc_clan_rb = {
  tree_id: 'bc_clan_rb',
  kind: 'clan',
  path_alias: '/z/bc_clan_rb',
  surname: '季',
  surname_char: '季',
  display_title: '季氏宗谱（冲正用例）',
  founder_handle: 'own_rb',
};
metaFixture.trees.bc_clan3 = {
  tree_id: 'bc_clan3',
  kind: 'clan',
  path_alias: '/z/bc_clan3',
  surname: '季',
  surname_char: '季',
  display_title: '季氏宗谱（立支专属）',
  founder_handle: 'own_ts',
};
metaFixture.trees.bc_clan2 = {
  tree_id: 'bc_clan2',
  kind: 'clan',
  path_alias: '/z/bc_clan2',
  surname: '季',
  surname_char: '季',
  display_title: '季氏宗谱（落点未设置）',
  founder_handle: '',
};

// ---- 补测夹具：互逆闭环 / 上层镜像回归 / 真人始祖拒绝 / 系统级失败（/admin/add-child EACCES）----
// ① 立支 ↔ 汇宗 互逆闭环：源树 cv_loop_a + 专属祖谱 bc_clan_loop。
//    立支产物的新树 id 由 nextTreeId 动态铸造（承接立支产物的始祖镜像 external_tree = cv_loop_a）。
writeTree(chainTree('cv_loop_a', { clanId: 'bc_clan_loop', clanHandle: 'own_loop' }));
writeTree(clanTree('bc_clan_loop', 'own_loop'));
regFamily('cv_loop_a', { clan: 'bc_clan_loop', founder: 'cv_loop_a-m' });
metaFixture.trees.bc_clan_loop = {
  tree_id: 'bc_clan_loop',
  kind: 'clan',
  path_alias: '/z/bc_clan_loop',
  surname: '季',
  surname_char: '季',
  display_title: '季氏宗谱（互逆闭环专用）',
  founder_handle: 'own_loop',
  master_tree_id: 'zhonghua',
};
// ② 回归：源树始祖镜像指向祖谱（先认祖的老路线）→ 仍 200
writeTree(chainTree('cv_reg_src', { clanId: 'bc_clan_reg', clanHandle: 'own_reg' }));
writeTree(clanTree('bc_clan_reg', 'own_reg'));
regFamily('cv_reg_src', { clan: 'bc_clan_reg', founder: 'cv_reg_src-m' });
metaFixture.trees.bc_clan_reg = {
  tree_id: 'bc_clan_reg',
  kind: 'clan',
  path_alias: '/z/bc_clan_reg',
  surname: '季',
  surname_char: '季',
  display_title: '季氏宗谱（放宽口径回归）',
  founder_handle: 'own_reg',
  master_tree_id: 'zhonghua',
};
writeTree(targetTree('cv_t_reg', 'slot-empty'));
regFamily('cv_t_reg', { clan: null, founder: 'cv_t_reg-x' });
// ③ 拒绝：源树始祖是**真人节点**（非镜像）→ 400《不是上层镜像》，不写不扣
writeTree(plainTree('cv_plain_src'));
regFamily('cv_plain_src', { clan: null, founder: 'cv_plain_src-top' });
writeTree(targetTree('cv_t_reg2', 'none'));
regFamily('cv_t_reg2', { clan: null, founder: 'cv_t_reg2-x' });
// §7 系统级失败专用树（/admin/add-child 真实 EACCES → 不得泄露本机路径）
writeTree(plainTree('cv_ec_child'));
regFamily('cv_ec_child', { clan: null, founder: 'cv_ec_child-top' });

fs.writeFileSync(META_FILE, JSON.stringify(metaFixture, null, 2) + '\n');

// ---- 详情夹具 ----
writeDetailDoc({
  _id: 'bc_src:bc_src-mid',
  tree_id: 'bc_src',
  handle: 'bc_src-mid',
  gramps_id: 'I0012',
  name: '季bc_src上移二',
  events: [{ handle: 'ev_mid', type: 'Birth' }],
  attributes: [{ key: '封号', value: '上移大夫', type: '封号' }],
  media: [],
  citations: [],
  notes: [{ handle: 'nt_mid', text: '详情随迁标记' }],
});
writeDetailDoc({ _id: 'cv_main:cv_main-mid', tree_id: 'cv_main', handle: 'cv_main-mid', gramps_id: 'I0012', name: '季cv_main上移二', events: [], attributes: [{ key: '号', value: '汇宗氏', type: '号' }], notes: [{ handle: 'nt_cv', text: '汇宗详情随迁标记' }] });
writeDetailDoc({ _id: 'cv_main:cv_main-m', tree_id: 'cv_main', handle: 'cv_main-m', gramps_id: 'I0001', name: '季cv_main始祖镜像', events: [], attributes: [] });
// #25 warnings? 夹具 ①：bc_warn_yes 的上移链 = top（**缺详情**）+ mid（有详情）→ warnings 非空且只含 top
writeDetailDoc({ _id: 'bc_warn_yes:bc_warn_yes-mid', tree_id: 'bc_warn_yes', handle: 'bc_warn_yes-mid', gramps_id: 'I0012', name: '季bc_warn_yes上移二', events: [{ handle: 'ev_wy', type: 'Birth' }], attributes: [], notes: [] });
// #25 夹具 ②：bc_warn_no 的上移链两条详情都齐备 → 出参不得出现 warnings 键
writeDetailDoc({ _id: 'bc_warn_no:bc_warn_no-mid', tree_id: 'bc_warn_no', handle: 'bc_warn_no-mid', gramps_id: 'I0012', name: '季bc_warn_no上移二', events: [], attributes: [], notes: [] });
writeDetailDoc({ _id: 'bc_warn_no:bc_warn_no-top', tree_id: 'bc_warn_no', handle: 'bc_warn_no-top', gramps_id: 'I0010', name: '季bc_warn_no上移一', events: [], attributes: [], notes: [] });

// ---- 用户 / 资产 / 灵气 ----
const STEWARD = '16600000701'; // tree_steward（立支正例，11000 籽）
const CHIEF = '16600000702'; // chief_editor（汇宗 0 片 0 籽）
const POOR = '16600000705'; // tree_steward（9998 籽 → 409）
const ROLLBK = '16600000706'; // tree_steward（落库失败冲正）
const FEE1U = '16600000707'; // tree_steward（立支费改 1）
const GUEST = '16600000703'; // guest → 403
const PLAIN = '16600000704'; // user → 403

fs.writeFileSync(
  path.join(COLS_DIR, 'jiazu_users.json'),
  JSON.stringify({
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '主理人', role: 'tree_steward' },
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [GUEST]: { _id: GUEST, phone: GUEST, nickname: '游客', role: 'guest' },
    [PLAIN]: { _id: PLAIN, phone: PLAIN, nickname: '普通用户', role: 'user' },
    [POOR]: { _id: POOR, phone: POOR, nickname: '籽不足主理人', role: 'tree_steward' },
    [ROLLBK]: { _id: ROLLBK, phone: ROLLBK, nickname: '冲正主理人', role: 'tree_steward' },
    [FEE1U]: { _id: FEE1U, phone: FEE1U, nickname: '费一主理人', role: 'tree_steward' },
  }),
);

const seedLot = (id, qty, expDays) => ({ id, qty, expires_at: isoPlus(expDays), source: 'admin', created_at: new Date().toISOString() });
const blankUser = () => ({ fragments: 0, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' });
// 夹具形状（local 模式）：集合文件 = **{ 文档 id → 文档 }**（store.loadCol 读顶层键当 _id；
// 真源 `migrate-output/collections/*.json` 亦为 `{ "global": {...} }`）——漏掉 `global` 外层会让
// colGet('…','global') 恒返 null（资产 / 灵气 / 钱包全读成空），本文件曾因此 7 条用例假红。
fs.writeFileSync(
  path.join(COLS_DIR, 'jiazu_assets.json'),
  JSON.stringify({
    global: {
      _id: 'global',
      users: {
        // 数组顺序故意把晚到期批次放前面：FIFO 必须按 expires_at 升序命中 sl_a
        [STEWARD]: { ...blankUser(), seeds: [seedLot('sl_b', 6000, 20), seedLot('sl_a', 5000, 10)] },
        [ROLLBK]: { ...blankUser(), seeds: [seedLot('sl_y', 6000, 20), seedLot('sl_x', 5000, 10)] },
        [POOR]: { ...blankUser(), seeds: [seedLot('sl_p', 9998, 10)] },
        [FEE1U]: { ...blankUser(), seeds: [seedLot('sl_f', 3, 10)] },
        [CHIEF]: {
          ...blankUser(),
          fragments: 3,
          seeds: [seedLot('sl_c', 5, 30)],
          bamboos: [{ id: 'bl_c', qty: 10, expires_at: isoPlus(30), source: 'admin', created_at: new Date().toISOString() }],
          jades: [{ id: 'jd_c', expires_at: isoPlus(300), created_at: new Date().toISOString(), source: 'admin' }],
        },
      },
    },
  }),
);

const jade = (id) => ({ id, expires_at: isoPlus(300), created_at: new Date().toISOString(), source: 'admin' });
fs.writeFileSync(
  path.join(COLS_DIR, 'jiazu_spirit.json'),
  JSON.stringify({
    global: {
      _id: 'global',
      trees: {
        cv_main: { jade: jade('jd_cv_main'), spirit_expires_at: isoPlus(10), status: 'active', buffer_until: null, logs: [{ id: 'lg_cv_main', plan: 'quarter', days: 90 }] },
        cv_t_main: { jade: jade('jd_cv_t_main'), spirit_expires_at: isoPlus(100), status: 'active', buffer_until: null, logs: [] },
        cv_skip: { jade: jade('jd_cv_skip'), spirit_expires_at: isoPlus(10), status: 'active', buffer_until: null, logs: [] },
        cv_d3: { jade: jade('jd_cv_d3'), spirit_expires_at: isoPlus(3), status: 'active', buffer_until: null, logs: [] },
        cv_t5: { jade: jade('jd_cv_t5'), spirit_expires_at: isoPlus(50), status: 'active', buffer_until: null, logs: [] },
        cv_exp: { jade: jade('jd_cv_exp'), spirit_expires_at: isoPlus(-5), status: 'expired', buffer_until: isoPlus(25), logs: [] },
        cv_t6: { jade: jade('jd_cv_t6'), spirit_expires_at: isoPlus(20), status: 'active', buffer_until: null, logs: [] },
        cv_ratio: { jade: jade('jd_cv_ratio'), spirit_expires_at: isoPlus(10), status: 'active', buffer_until: null, logs: [] },
        cv_t_ratio: { jade: jade('jd_cv_t_ratio'), spirit_expires_at: isoPlus(100), status: 'active', buffer_until: null, logs: [] },
        // §15-#8 系统级失败文案夹具：源树都有玉 + 10 天灵气（⑤ 阶段写入失败的那条走真实 EACCES）
        cv_stage4: { jade: jade('jd_cv_stage4'), spirit_expires_at: isoPlus(10), status: 'active', buffer_until: null, logs: [] },
        cv_stage5: { jade: jade('jd_cv_stage5'), spirit_expires_at: isoPlus(10), status: 'active', buffer_until: null, logs: [] },
        cv_t_s4: { jade: jade('jd_cv_t_s4'), spirit_expires_at: isoPlus(100), status: 'active', buffer_until: null, logs: [] },
        cv_t_s5: { jade: jade('jd_cv_t_s5'), spirit_expires_at: isoPlus(100), status: 'active', buffer_until: null, logs: [] },
      },
    },
  }),
);

fs.writeFileSync(
  path.join(COLS_DIR, 'jiazu_wallets.json'),
  JSON.stringify({ global: { _id: 'global', users: {}, trees: {}, transactions: [], config: {} } }),
);

// ---- 模块（env 就位后再动态 import）----
const store = await import('./store.js');
const tw = await import('./tree-write.js');
const cw = await import('./child-write.js');
const eco = await import('./economy-fee.js');
const el = await import('./economy-ledger.js');
const bco = await import('./branch-clan-ops.js');
const clanLib = await import('./clan.js');
const walletLib = await import('./wallet.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const tokenOf = (phone, role) => signJwt({ sub: phone, phone, role }, 3600);
const call = (p, body, token) =>
  handleRequest({
    path: p,
    httpMethod: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
const bodyOf = (res) => JSON.parse(res.body);
const metaNow = () => JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
const spiritColMd5 = () => md5(path.join(COLS_DIR, 'jiazu_spirit.json'));
const assetsColMd5 = () => md5(path.join(COLS_DIR, 'jiazu_assets.json'));
/** 读集合 jiazu_spirit 的单文档（_id='global'；local 模式文件形状 = { global: doc }） */
const spiritDocNow = () => JSON.parse(fs.readFileSync(path.join(COLS_DIR, 'jiazu_spirit.json'), 'utf8')).global;
const expect400 = (e, re) => e && e.status === 400 && re.test(e.message);

let NEW_TREE_ID = '';

// ================= ① 真源护栏（开篇） =================

test('§10-1-23 真源护栏（开篇）：副本路径生效（本套件写不进真源）+ migrate-output/ 逐字节未变', () => {
  assert.equal(store.PATHS.out, TMP, 'COMPAT_OUT_DIR 副本未生效');
  assert.equal(store.PATHS.metaFile, META_FILE);
  assert.equal(store.PATHS.sandbox, true, '沙箱模式：真源写保护生效');
  assert.ok(TMP.startsWith(os.tmpdir()), '数据根必须在 /tmp 副本内');
  assertRealUntouched('开篇');
});

// ================= ② 数值契约（#24） =================

test('§10-1-24 数值契约：立支 9999 籽（可配）/ 汇宗 0 片 0 籽 / 折损 ceil / 比例默认 0.5', async () => {
  assert.equal(eco.FEE.branch_fee_seeds, 9999);
  assert.equal(eco.TX_TYPE_OF_OP.establish_branch, 'tree_create', '复用既有枚举，不新造');
  assert.deepEqual(eco.feeOf('establish_branch'), { unit: 'seeds', pieces: 9999, tx_type: 'tree_create' });
  assert.equal(eco.feeOf('establish_branch', { branch_fee_seeds: 3 }).pieces, 3, '后台值覆盖默认');
  assert.equal(eco.feeOf('establish_branch', { branch_fee_seeds: 0 }).pieces, 9999, '非法后台值回落默认');
  const conv = eco.feeOf('converge_clan');
  assert.equal(conv.pieces, 0);
  assert.equal(conv.free, true);
  assert.equal(conv.reason, 'not_charged');

  assert.equal(bco.DEFAULT_BRANCH_FEE_SEEDS, 9999);
  assert.equal(bco.DEFAULT_CONVERGE_SPIRIT_RATIO, 0.5);
  assert.equal(bco.SCOPE_CHANGED_CODE, 'DELETE_SCOPE_CHANGED', '复用既有已登记域名码');

  // 折损：剩余天数 = ceil(剩余毫秒/86400000)；折损天数 = ceil(剩余天数 × 比例)（先取整天数再乘比例再向上取整）
  const at = (days, ratio) => bco.computeSpiritTransfer({ sourceExpiresAt: isoPlus(days), now: new Date(NOW0), ratio });
  assert.equal(at(10, 0.5).source_days_left, 10);
  assert.equal(at(10, 0.5).transferred_days, 5);
  assert.equal(at(3, 0.5).transferred_days, 2, 'ceil(3×0.5)=2（不得向下取整）');
  assert.equal(at(4, 0.1).transferred_days, 1, 'ceil(4×0.1)=1（不得四舍五入/向下取整为 0）');
  assert.equal(at(-1, 0.5).source_days_left, 0, '已过 → 0');
  assert.equal(at(-1, 0.5).transferred_days, 0);
  assert.equal(bco.computeSpiritTransfer({ sourceExpiresAt: null, now: new Date(NOW0) }).source_days_left, 0);
  assert.equal(bco.computeSpiritTransfer({ sourceExpiresAt: isoPlus(10), now: new Date(NOW0) }).ratio, 0.5, '缺省比例 0.5');

  // 后台设置键默认值与非法值（沿用既有治理路由载体，不新增设置路由）
  assert.equal(await walletLib.getBranchFeeSeeds(), 9999);
  assert.equal(await walletLib.getConvergeSpiritRatio(), 0.5);
  await walletLib.setBranchFeeSeeds(7);
  assert.equal(await walletLib.getBranchFeeSeeds(), 7, '设置键改后生效');
  await walletLib.setBranchFeeSeeds(9999);
  await walletLib.setConvergeSpiritRatio(0.25);
  assert.equal(await walletLib.getConvergeSpiritRatio(), 0.25);
  await walletLib.setConvergeSpiritRatio(0.5);
  await assert.rejects(() => walletLib.setBranchFeeSeeds(0), /正整数/);
  await assert.rejects(() => walletLib.setConvergeSpiritRatio(1.5), /0–1/);
});

// ================= ③ 纯函数 =================

test('纯函数：planAncestorChainMove 上移集合（始祖镜像不随迁、链顶家族留原树）', () => {
  const tree = readTreeDisk('bc_src');
  const plan = bco.planAncestorChainMove({ tree, personHandle: 'bc_src-n', founderHandle: 'bc_src-m' });
  assert.equal(plan.ok, true);
  // 规格 §6-1-3 只定义**集合**（链上除始祖镜像外的全部真实节点与家族），未定义数组顺序
  // → 断言集合内容（sorted，与本文件 #5 / #13 / #14 同口径），不锁定遍历方向
  assert.deepEqual(plan.moved_people.slice().sort(), ['bc_src-mid', 'bc_src-top'].sort(), 'N 的父 → … → 始祖前的整链');
  assert.deepEqual(plan.moved_families.slice().sort(), ['bc_src-fmid', 'bc_src-fn'].sort(), '随迁家族 = fmid + fn');
  assert.equal(plan.chain_top_handle, 'bc_src-top');
  assert.equal(plan.top_family_handle, 'bc_src-ftop', '连着始祖镜像的家族留原树');
  assert.equal(plan.dropped_mirror_handle, 'bc_src-m');
  assert.equal(plan.moved_people.includes('bc_src-m'), false, '始祖镜像不计入迁入集合');
  assert.equal(plan.moved_people.includes('bc_src-n'), false, 'N 本人留在原树');
  // 始祖位节点自己不产生上移集合（调用方按「始祖节点本身不可立支」拒绝）
  const p2 = bco.planAncestorChainMove({ tree, personHandle: 'bc_src-m', founderHandle: 'bc_src-m' });
  assert.deepEqual(p2.moved_people, []);
});

test('纯函数：planBranchRegistrations 两条登记镜像字段口径（原树 / 新树各一条）', () => {
  const person = readTreeDisk('bc_src').people['bc_src-n'];
  const rows = bco.planBranchRegistrations({
    sourceTreeId: 'bc_src',
    sourceTreeTitle: '季氏测试家族（立支源）',
    newTreeId: 'ji_23395_01',
    newTreeTitle: '季氏测试家族（立支源） · 季bc_src立支点支',
    person,
    mirrorHandle: 'mir_new',
    handles: ['reg_src', 'reg_new'],
    grampsIds: ['I000900', 'I000901'],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.external_tree), ['bc_src', 'ji_23395_01']);
  assert.deepEqual(rows.map((r) => r.external_person_handle), ['bc_src-n', 'mir_new']);
  for (const r of rows) {
    assert.equal(r.external_link_type, 'founder');
    assert.equal(r.external_mirror, 'true');
    assert.equal(r.parent_family, '');
    assert.equal(r.name, person.name, '展示副本 = N 的姓名');
    assert.match(r.external_relation_note, /立支登记/);
  }
});

test('纯函数：planConvergeMove 迁移集合 + 镜像丢弃 + 落点家族复用（不动 IO）', () => {
  const src = readTreeDisk('cv_self');
  const dst = readTreeDisk('cv_t9');
  const plan = bco.planConvergeMove({ src, dst, targetHandle: 'cv_t9-x', newFamilyIds: [] });
  assert.deepEqual(
    plan.moved_people.slice().sort(),
    ['cv_self-top', 'cv_self-side', 'cv_self-mid', 'cv_self-n', 'cv_self-kid'].sort(),
    '迁移集合 = 全部真实节点',
  );
  assert.deepEqual(plan.moved_families.slice().sort(), ['cv_self-fmid', 'cv_self-fn', 'cv_self-fkid'].sort(), '连着镜像家长的家族不随迁');
  assert.deepEqual(plan.discarded_mirrors, ['cv_self-m'], '始祖镜像丢弃');
  // 旁支 side 的父家族连着始祖镜像 → 不随迁 → 它在目标树成为**第二个根**（与 top 一并挂到 X 的家族下）；
  // 依据 = §6-2-3「迁移集合 = 源树全部真实节点」+ §6-2-4 ②「家族整体搬入并重挂」（规格未单列该现象）
  assert.deepEqual(
    plan.roots.slice().sort(),
    ['cv_self-side', 'cv_self-top'].sort(),
    '源树真实段的根 = 主根 top + 旁支 side（后者父家族随始祖镜像留在源树）',
  );
  assert.equal(plan.created_family, true, 'X 本身没有家族 → 新建');
  assert.equal(dst.families[plan.family_handle].father_handle, 'cv_t9-x');
  assert.deepEqual(dst.families[plan.family_handle].child_handles.slice().sort(), ['cv_self-side', 'cv_self-top'].sort());
  assert.equal(src.people['cv_self-top'], undefined, '源树已清空真实节点');
  assert.deepEqual(Object.keys(src.people), ['cv_self-m'], '源树只剩丢弃前的镜像节点对象');
  assert.deepEqual(tw.checkTreeIntegrity(dst), []);
});

// ================= ④ 立支正例（#1 #2 #3 #5） =================

test('§10-1-1/2/3/5 立支正例：祖先链上移 + 换树不换号 + 详情随迁改键 + 原树归属 + 扣 9999 籽（FIFO）', async () => {
  const SRC = 'bc_src';
  const CLAN = 'bc_clan3';
  const srcBefore = readTreeDisk(SRC);
  const clanBefore = readTreeDisk(CLAN);
  const metaBefore = md5(META_FILE);
  const assetsBefore = await el.getAssets(STEWARD);
  const treesBefore = treeFileCount();

  const res = await call('/admin/establish-branch', { tree_id: SRC, person_handle: 'bc_src-n' }, tokenOf(STEWARD, 'tree_steward'));
  assert.equal(res.statusCode, 200, `立支应 200（无 X-Tree-Id 也要通 —— 路由注册在树编辑闸门之前）：${res.body}`);
  const body = bodyOf(res);
  NEW_TREE_ID = body.new_tree_id;

  assert.equal(body.ok, true);
  assert.equal(body.original_tree_id, SRC);
  assert.match(NEW_TREE_ID, /^ji_23395_\d{2}$/, '新树 id = 姓氏拼音_码点_序号');
  assert.notEqual(NEW_TREE_ID, SRC);
  assert.equal(body.moved_ancestors, 2, '上移链 = 上移一 + 上移二（始祖镜像不计入）');
  assert.equal(body.moved_families, 2, '随迁家族 = fmid + fn');
  assert.deepEqual(body.founder, { handle: 'bc_src-n', gramps_id: 'I0013', name: '季bc_src立支点' }, 'founder = N 的真身标识');
  assert.equal(body.fee.unit, 'seed');
  assert.equal(body.fee.amount, 9999);
  assert.equal(body.fee.balance_after, 1001, '11000 - 9999');

  // #5 原树归属：只摘上移链，N 及全部后代 + 旁支 + 旧始祖镜像留在原树
  const src = readTreeDisk(SRC);
  assert.equal(Object.keys(src.people).length, 4, '6 - 2');
  for (const h of ['bc_src-mid', 'bc_src-top']) assert.equal(src.people[h], undefined, `${h} 已迁出原树`);
  for (const h of ['bc_src-m', 'bc_src-n', 'bc_src-kid', 'bc_src-side']) assert.ok(src.people[h], `${h} 留在原树`);
  assert.deepEqual(Object.keys(src.families).sort(), ['bc_src-fkid', 'bc_src-ftop'].sort(), '随迁家族已摘除');
  assert.deepEqual(src.families['bc_src-ftop'].child_handles, ['bc_src-side'], '链顶家族只摘掉随迁子女');
  assert.equal(src.people['bc_src-n'].parent_family, '', 'N 成为原树根（父家族已随迁 → 悬空引用已修）');
  assert.equal(src.founder_gramps_id, 'I0013', '树 JSON 顶层 founder_gramps_id 同步为 N 的编号（读侧兜底一致）');
  assert.deepEqual(tw.checkTreeIntegrity(src), [], '原树无悬空引用');

  // #1 上移链并入宗谱自有段（挂在宗谱 founder_handle 指向节点之下）
  const clan = readTreeDisk(CLAN);
  assert.ok(clan.people['bc_src-mid'] && clan.people['bc_src-top'], '上移链进入宗谱');
  for (const h of ['bc_src-fmid', 'bc_src-fn']) assert.ok(clan.families[h], `${h} 家族随迁入宗谱`);
  const topNode = clan.people['bc_src-top'];
  const clanFamily = clan.families[topNode.parent_family];
  assert.ok(clanFamily, '链顶已挂到宗谱落点家族下');
  assert.equal(clanFamily.father_handle, 'own_ts', '挂在该宗谱 founder_handle 指向的节点之下');
  assert.deepEqual(clanFamily.child_handles, ['bc_src-top']);
  assert.equal(clan.people['own_ts'].spouse_families.includes(clanFamily.handle), true);
  assert.deepEqual(tw.checkTreeIntegrity(clan), [], '宗谱无悬空引用');

  // #2 换树不换号：handle（键）与 gramps_id 逐字不变
  assert.equal(clan.people['bc_src-mid'].gramps_id, srcBefore.people['bc_src-mid'].gramps_id);
  assert.equal(clan.people['bc_src-top'].gramps_id, srcBefore.people['bc_src-top'].gramps_id);
  assert.equal(clan.people['bc_src-mid'].gramps_id, 'I0012');
  assert.equal(clan.people['bc_src-top'].gramps_id, 'I0010');

  // #3 详情随迁改键：旧键不存在、新键有内容（专防「只删未写」）
  assert.equal(detailExists(SRC, 'bc_src-mid'), false, '旧键必须删除');
  const moved = readDetailDisk(CLAN, 'bc_src-mid');
  assert.ok(moved, '新键必须有内容（只删未写 = 缺陷）');
  assert.equal(moved._id, `${CLAN}:bc_src-mid`);
  assert.equal(moved.tree_id, CLAN);
  assert.equal(moved.handle, 'bc_src-mid');
  assert.deepEqual(moved.attributes, [{ key: '封号', value: '上移大夫', type: '封号' }], '详情内容随迁');
  assert.deepEqual(moved.notes, [{ handle: 'nt_mid', text: '详情随迁标记' }]);
  assert.deepEqual(moved.events, [{ handle: 'ev_mid', type: 'Birth' }]);

  // 扣费：9999 籽、FIFO by expires_at（数组里晚到期批次在前，仍必须命中 sl_a）、Tx.type 复用 tree_create
  const assets = await el.getAssets(STEWARD);
  assert.equal(el.sumLots(assets.seeds), 1001);
  const chargeTx = assets.txs.find((t) => t.type === 'tree_create');
  assert.ok(chargeTx, '必须写一条 Tx');
  assert.equal(chargeTx.delta.seeds, -9999);
  assert.equal(chargeTx.ref.tree_id, NEW_TREE_ID);
  assert.equal(chargeTx.ref.person_handle, 'bc_src-n');
  assert.equal(chargeTx.ref.lots[0].lot_id, 'sl_a', 'FIFO：最早到期的 sl_a 先扣');
  assert.equal(chargeTx.ref.lots[1].lot_id, 'sl_b');
  assert.equal(chargeTx.desc, `立支（季bc_src立支点 → ${NEW_TREE_ID}）`, 'Tx.desc 逐字「立支（N → 新树）」');
  assert.equal(assets.txs.some((t) => t.type === 'fee_refund'), false, '成功路径不得冲正');

  // tree-meta 回写（原树 founder_* = N；新树整条登记）
  assert.notEqual(md5(META_FILE), metaBefore, 'tree-meta 必须被写');
  const meta = metaNow();
  const srcEntry = meta.trees[SRC];
  assert.equal(srcEntry.founder_handle, 'bc_src-n');
  assert.equal(srcEntry.founder_gramps_id, 'I0013');
  assert.equal(srcEntry.founder_name, '季bc_src立支点');
  assert.equal('founder_state' in srcEntry, false, '回到「有始祖」态');
  assert.equal(srcEntry.clan_tree_id, CLAN, '宗谱归属沿用');
  assert.match(srcEntry.clan_handle || '', /^[0-9a-f]{24}$/, 'clan_handle 改写为宗谱登记镜像 handle');
  const newEntry = meta.trees[NEW_TREE_ID];
  assert.ok(newEntry, '新树必须登记进 tree-meta');
  assert.equal(newEntry.kind, 'family');
  assert.equal(newEntry.clan_tree_id, CLAN, '新树与原树同宗谱');
  assert.equal(newEntry.display_title.includes('季bc_src立支点'), true);
  assert.equal(treeFileCount(), treesBefore + 1, '新增 1 个新树文件');
  assert.equal(newEntry.clan_handle !== srcEntry.clan_handle, true, '两树在宗谱各留一条登记');
});

// ================= ⑤ 立支新树镜像 + 宗谱两条登记（#4 #6） =================

test('§10-1-4/6 立支：新树仅 1 个始祖镜像节点 + 宗谱两条登记镜像 + 支系入口列表 +2', async () => {
  const SRC = 'bc_src';
  const CLAN = 'bc_clan3';
  const mine = readTreeDisk(NEW_TREE_ID);
  const handles = Object.keys(mine.people);
  assert.equal(handles.length, 1, '新树初始不含其它真实节点');
  assert.deepEqual(Object.keys(mine.families), []);
  const mirror = mine.people[handles[0]];
  assert.equal(mirror.external_link_type, 'founder');
  assert.equal(mirror.external_mirror, 'true');
  assert.equal(mirror.external_person_handle, 'bc_src-n', '指向 N 的真身');
  assert.equal(mirror.external_tree, SRC);
  assert.equal(mirror.parent_family, '');
  assert.equal(mirror.name, '季bc_src立支点', '姓名 = N 的展示副本');
  assert.match(mirror.external_relation_note, /立支始祖/);
  const meta = metaNow();
  assert.equal(meta.trees[NEW_TREE_ID].founder_handle, mirror.handle);
  assert.equal(mine.founder_gramps_id, mirror.gramps_id, '新树顶层 founder_gramps_id = 镜像编号');
  assert.match(mirror.gramps_id, /^I\d{6}$/);
  assert.notEqual(mirror.gramps_id, 'I0013', '镜像另铸全站新号（N 真身编号不变）');

  // 全站唯一：新铸编号在副本所有树里只出现一次
  const owners = [];
  for (const f of fs.readdirSync(TREES_DIR)) {
    const t = JSON.parse(fs.readFileSync(path.join(TREES_DIR, f), 'utf8'));
    for (const p of Object.values(t.people || {})) if (String(p.gramps_id) === mirror.gramps_id) owners.push(t.tree_id);
  }
  assert.deepEqual(owners, [NEW_TREE_ID], '新铸编号全站唯一');

  // 宗谱两条登记镜像（一条登记 = 一个支系入口），落在宗谱自有段
  const clan = readTreeDisk(CLAN);
  const regs = Object.values(clan.people).filter((p) => p.external_mirror === 'true' && p.external_link_type === 'founder' && [SRC, NEW_TREE_ID].includes(p.external_tree));
  assert.equal(regs.length, 2, '原树 / 新树各一条 N 始祖登记');
  const regSrc = regs.find((r) => r.external_tree === SRC);
  const regNew = regs.find((r) => r.external_tree === NEW_TREE_ID);
  assert.equal(regSrc.external_person_handle, 'bc_src-n', '原树登记的指针 = N 真身');
  assert.equal(regNew.external_person_handle, mirror.handle, '新树登记的指针 = 新树始祖镜像');
  assert.match(regSrc.external_relation_note, /立支登记/);
  assert.match(regNew.external_relation_note, /立支登记/);
  assert.equal(meta.trees[SRC].clan_handle, regSrc.handle, '原树 clan_handle = 其登记镜像');
  assert.equal(meta.trees[NEW_TREE_ID].clan_handle, regNew.handle);

  // 读侧推导：宗谱支系入口列表 = 原树 + 新树（各 1 个入口，均由登记镜像推导）
  const branches = await clanLib.listClanBranches({ clanTreeId: CLAN });
  const ids = branches.map((b) => b.tree_id).sort();
  assert.deepEqual(ids, [SRC, NEW_TREE_ID].sort(), '立支后两树都进宗谱「支系入口列表」');
  assert.equal(branches.length, 2, '不得重复计入（同 tree_id 只算一条）');
  for (const b of branches) assert.equal(b.via, 'branch_register', '经登记镜像推导（原树始祖已是真身，无跨树指针）');
  assert.equal(branches.find((b) => b.tree_id === NEW_TREE_ID).master_handle, mirror.handle);
  assert.equal(branches.find((b) => b.tree_id === SRC).master_handle, 'bc_src-n');
  // 既有推导（「始祖镜像的 external_tree = 本祖谱」）在立支后的口径：
  // 原树始祖位已是 N 真身（无跨树指针）→ 新树的入口**只能由新推导（§6-1-6 登记镜像）给出**；
  // 原树仍会被既有推导命中（原树里按 §13-4 口径留下的旧始祖镜像节点仍带 external_tree = 祖谱）
  // —— 这不影响入口条数（listClanBranches 按 tree_id 去重，上一条已断言 = 2）。
  const attached = await (await import('./founder-attach.js')).listAttachedTrees({ masterTreeId: CLAN });
  assert.equal(
    attached.some((a) => a.tree_id === NEW_TREE_ID),
    false,
    '新树的支系入口只能由新推导（§6-1-6）给出，既有推导认不出新树',
  );
  assert.deepEqual(attached.map((a) => a.tree_id), [SRC], '既有推导只命中原树（残留旧始祖镜像节点）');
});

// ================= ⑥ 立支 409 籽不足（#7） =================

test('§10-1-7 立支 · 籽不足 409 ASSET_INSUFFICIENT：一分未扣、一字未写、无新树文件', async () => {
  const SRC = 'bc_poor';
  const clanMd5 = treeMd5Disk('bc_clan');
  const srcMd5 = treeMd5Disk(SRC);
  const metaMd5 = md5(META_FILE);
  const assetsMd5 = assetsColMd5();
  const treesBefore = treeFileCount();
  const before = await el.getAssets(POOR);
  assert.equal(el.sumLots(before.seeds), 9998);

  const res = await call('/admin/establish-branch', { tree_id: SRC, person_handle: 'bc_poor-n' }, tokenOf(POOR, 'tree_steward'));
  assert.equal(res.statusCode, 409);
  const body = bodyOf(res);
  assert.equal(body.code, 'ASSET_INSUFFICIENT');
  assert.equal(body.need, 9999);
  assert.equal(body.current, 9998);
  assert.equal(body.unit, 'seeds');
  assert.equal(Array.isArray(body.how_to_get), true, '必带 how_to_get');
  assert.ok(body.how_to_get.length >= 1);
  assert.equal('fee_refunded' in body, false, '未扣费 → 不带 fee_refunded');

  assert.equal(assetsColMd5(), assetsMd5, '资产文件逐字节不变');
  assert.equal((await el.getAssets(POOR)).txs.length, 0, '一个批次都没动、无任何流水');
  assert.equal(treeMd5Disk(SRC), srcMd5, '原树不写');
  assert.equal(treeMd5Disk('bc_clan'), clanMd5, '宗谱不写');
  assert.equal(md5(META_FILE), metaMd5, 'tree-meta 不写');
  assert.equal(treeFileCount(), treesBefore, '无新树文件残留');
});

// ================= ⑦ 立支 400 矩阵（#9 #10 #11） =================

test('§10-1-9 立支 · 无宗谱归属 / 宗谱落点为空 → 400 且不扣籽、不写树', async () => {
  const cases = [
    ['bc_noclan', 'bc_noclan-n', /请先为该家族建立或认祖宗谱/],
    ['bc_nopoint', 'bc_nopoint-n', /该祖谱尚未设置认祖落点（founder_handle 为空）/],
  ];
  for (const [tree, handle, re] of cases) {
    const md5Before = treeMd5Disk(tree);
    const clanMd5 = treeMd5Disk('bc_clan2');
    const metaMd5 = md5(META_FILE);
    const assetsMd5 = assetsColMd5();
    await assert.rejects(() => bco.establishBranch({ treeId: tree, personRef: handle, phone: STEWARD }), (e) => expect400(e, re));
    assert.equal(treeMd5Disk(tree), md5Before, `${tree} 拒绝时不写树`);
    assert.equal(treeMd5Disk('bc_clan2'), clanMd5);
    assert.equal(md5(META_FILE), metaMd5);
    assert.equal(assetsColMd5(), assetsMd5, '拒绝时不扣籽（连读都不落盘）');
  }
});

test('§10-1-10 立支 · 始祖位 / 镜像节点 / 总谱 / 祖谱 → 400 且不扣籽', async () => {
  const cases = [
    ['bc_founderonly', 'bc_founderonly-top', /始祖节点本身不可立支/],
    ['bc_mirror', 'bc_mirror-m2', /该节点是外树镜像节点/],
    ['zhonghua', 'mRoot', /中华世本（总谱）不可立支/],
    ['bc_clan', 'own_ji', /祖谱不可立支/],
  ];
  for (const [tree, handle, re] of cases) {
    const assetsMd5 = assetsColMd5();
    const before = treeExistsDisk(tree) ? treeMd5Disk(tree) : '';
    await assert.rejects(() => bco.establishBranch({ treeId: tree, personRef: handle, phone: STEWARD }), (e) => expect400(e, re));
    assert.equal(assetsColMd5(), assetsMd5, `${tree} 拒绝时不扣籽`);
    if (before) assert.equal(treeMd5Disk(tree), before, `${tree} 拒绝时不写树`);
  }
  // 节点不存在 → 404；缺参 → 400（§7-1）
  await assert.rejects(() => bco.establishBranch({ treeId: 'bc_src', personRef: '不存在-节点', phone: STEWARD }), (e) => e.status === 404 && /节点不存在/.test(e.message));
  await assert.rejects(() => bco.establishBranch({ treeId: '', personRef: 'bc_src-n' }), (e) => expect400(e, /缺少 tree_id/));
  await assert.rejects(() => bco.establishBranch({ treeId: 'bc_src', personRef: '' }), (e) => expect400(e, /缺少 person_handle/));
  await assert.rejects(() => bco.establishBranch({ treeId: '没有这棵树', personRef: 'x' }), (e) => e.status === 404 && /家族树不存在/.test(e.message));
  // 始祖镜像本身（也是始祖位）→ 先命中镜像口径（§6-1-2 校验顺序：非镜像 → 非始祖位）
  await assert.rejects(() => bco.establishBranch({ treeId: 'bc_src', personRef: 'bc_src-m' }), (e) => expect400(e, /外树镜像节点/));
});

test('§10-1-11 立支 · 跨树引用红线 → 400，所有参与的树都不写、不扣籽（两种引用路径）', async () => {
  // ① 上移链上任一节点被他树 external_person_handle 引用（bc_ref-other-mir → bc_ref-mid）
  {
    const srcMd5 = treeMd5Disk('bc_ref');
    const otherMd5 = treeMd5Disk('bc_ref_other');
    const clanMd5 = treeMd5Disk('bc_clan');
    const metaMd5 = md5(META_FILE);
    const assetsMd5 = assetsColMd5();
    const treesBefore = treeFileCount();
    await assert.rejects(
      () => bco.establishBranch({ treeId: 'bc_ref', personRef: 'bc_ref-n', phone: STEWARD }),
      (e) =>
        expect400(e, /其它家族树中存在关联（始祖挂载\/镜像\/跨树婚姻）/ ) &&
        /解除关系后再立支/.test(e.message) &&
        e.message.includes('季氏测试家族（bc_ref_other）') &&
        e.message.includes('季bc_ref上移二镜像'),
    );
    assert.equal(treeMd5Disk('bc_ref'), srcMd5, '发起树不写');
    assert.equal(treeMd5Disk('bc_ref_other'), otherMd5, '对方树绝不级联修改');
    assert.equal(treeMd5Disk('bc_clan'), clanMd5, '宗谱不写');
    assert.equal(md5(META_FILE), metaMd5);
    assert.equal(assetsColMd5(), assetsMd5, '红线拒绝时不扣籽');
    assert.equal(treeFileCount(), treesBefore, '不建新树');
  }
  // ② 上移链上任一节点被他树 tree-meta.founder_handle 登记（镜像已删、反指针仍在 meta）
  {
    const srcMd5 = treeMd5Disk('bc_refmeta');
    const metaMd5 = md5(META_FILE);
    const assetsMd5 = assetsColMd5();
    await assert.rejects(
      () => bco.establishBranch({ treeId: 'bc_refmeta', personRef: 'bc_refmeta-n', phone: STEWARD }),
      (e) => expect400(e, /其它家族树中存在关联/) && e.message.includes('季氏测试家族（bc_refmeta 的登记方）'),
    );
    assert.equal(treeMd5Disk('bc_refmeta'), srcMd5);
    assert.equal(md5(META_FILE), metaMd5);
    assert.equal(assetsColMd5(), assetsMd5);
  }
});

// ================= ⑧ 立支路由：401 / 403 / 缺参（§7-1） =================

test('立支路由：未登录 401 / 游客与普通用户 403 / 缺参 400（且都不写树不扣籽）', async () => {
  const md5Before = treeMd5Disk('bc_route');
  const assetsMd5 = assetsColMd5();
  const anon = await call('/admin/establish-branch', { tree_id: 'bc_route', person_handle: 'bc_route-n' });
  assert.equal(anon.statusCode, 401);
  assert.match(bodyOf(anon).error, /请先登录后再进行编辑操作/);
  for (const [phone, role, re] of [
    [GUEST, 'guest', /游客无编辑权限/],
    [PLAIN, 'user', /立支需要本家族树主理人/],
  ]) {
    const res = await call('/admin/establish-branch', { tree_id: 'bc_route', person_handle: 'bc_route-n' }, tokenOf(phone, role));
    assert.equal(res.statusCode, 403);
    assert.match(bodyOf(res).error, re);
  }
  const noTree = await call('/admin/establish-branch', { person_handle: 'bc_route-n' }, tokenOf(STEWARD, 'tree_steward'));
  assert.equal(noTree.statusCode, 400);
  assert.match(bodyOf(noTree).error, /缺少 tree_id/);
  const noHandle = await call('/admin/establish-branch', { tree_id: 'bc_route' }, tokenOf(STEWARD, 'tree_steward'));
  assert.equal(noHandle.statusCode, 400);
  assert.match(bodyOf(noHandle).error, /缺少 person_handle/);
  assert.equal(treeMd5Disk('bc_route'), md5Before);
  assert.equal(assetsColMd5(), assetsMd5, '401/403/400 全程不扣籽');
});

// ================= ⑨ 汇宗正例（#12 #14 #17 #20 #21 与 #16-10天） =================

test('§10-1-12/14/17/20/21 汇宗正例：整树迁移 + 始祖镜像丢弃 + 叠加顺延不覆盖 + 0 片 0 籽 + R5', async () => {
  const SRC = 'cv_main';
  const DST = 'cv_t_main';
  const srcBefore = readTreeDisk(SRC);
  const dstBefore = readTreeDisk(DST);
  const spiritBefore = spiritDocNow();
  const chiefBefore = await el.getAssets(CHIEF);
  const chiefRawBefore = JSON.stringify(chiefBefore);
  const metaBefore = metaNow();

  const res = await call(
    '/admin/converge-clan',
    { tree_id: SRC, target_person_id: 'cv_t_main-x', confirm_people: 5 },
    tokenOf(CHIEF, 'chief_editor'),
  );
  assert.equal(res.statusCode, 200, res.body);
  const body = bodyOf(res);
  assert.equal(body.ok, true);
  assert.equal(body.source_tree_id, SRC);
  assert.equal(body.target_tree_id, DST);
  assert.equal(body.target_handle, 'cv_t_main-x');
  assert.equal(body.moved_people, 5, '5 个真实节点（始祖镜像不计入）');
  assert.equal(body.moved_families, 3, 'fmid / fn / fkid 随迁（连着始祖镜像的 ftop 不随迁）');
  assert.equal(body.spirit.ratio, 0.5);
  assert.equal(body.spirit.source_days_left, 10);
  assert.equal(body.spirit.transferred_days, 5, 'ceil(10 × 0.5)');
  assert.equal(body.spirit.target_spirit_expires_at, isoPlus(105), '叠加顺延：目标树原值 + 5 天（绝不覆盖）');
  assert.equal('skipped_reason' in body.spirit, false, '并入成功不带 skipped_reason');

  // #12 源树：树 JSON 与 tree-meta 条目一并消失
  assert.equal(treeExistsDisk(SRC), false, '源树树 JSON 已删除');
  assert.equal(SRC in metaNow().trees, false, '源树 tree-meta 条目已删除');
  assert.equal(metaNow().trees[DST].display_title, metaBefore.trees[DST].display_title, '目标树条目不变');

  // #12 整树迁移：编号不变、挂到 X 的家族下
  const dst = readTreeDisk(DST);
  for (const h of ['cv_main-top', 'cv_main-side', 'cv_main-mid', 'cv_main-n', 'cv_main-kid']) {
    assert.ok(dst.people[h], `${h} 已迁入目标树`);
    assert.equal(dst.people[h].gramps_id, srcBefore.people[h].gramps_id, `${h} 换树不换号`);
    assert.equal(dst.people[h].handle, srcBefore.people[h].handle);
  }
  assert.equal(dst.people['cv_main-top'].gramps_id, 'I0010', '换树不换号');
  assert.equal(dst.people['cv_main-mid'].gramps_id, 'I0012');
  assert.equal(dst.people['cv_main-top'].parent_family, 'cv_t_main-fx', '源树真实段的根挂到 X 的家族下');
  assert.equal(dst.families['cv_t_main-fx'].child_handles.includes('cv_main-top'), true);
  assert.equal(dst.people['cv_main-mid'].parent_family, 'cv_main-fmid', '随迁家族保持内部挂接');
  for (const f of ['cv_main-fmid', 'cv_main-fn', 'cv_main-fkid']) assert.ok(dst.families[f], `${f} 随迁`);
  assert.equal(dst.families['cv_main-ftop'], undefined, '连着始祖镜像的家族不随迁');
  assert.equal(dst.people['cv_t_main-x'].spouse_families.includes('cv_t_main-fx'), true);
  assert.deepEqual(tw.checkTreeIntegrity(dst), [], '迁移后目标树无悬空引用');

  // #14 始祖镜像丢弃
  assert.equal('cv_main-m' in dst.people, false, '源树始祖镜像不随迁');
  assert.equal('cv_main-m2' in dst.people, false);
  assert.equal(detailExists(SRC, 'cv_main-m'), false, '镜像详情随树作废');

  // #12 详情随迁改键
  assert.equal(detailExists(SRC, 'cv_main-mid'), false);
  const movedDetail = readDetailDisk(DST, 'cv_main-mid');
  assert.ok(movedDetail, '详情新键必须有内容');
  assert.equal(movedDetail._id, `${DST}:cv_main-mid`);
  assert.equal(movedDetail.tree_id, DST);
  assert.deepEqual(movedDetail.attributes, [{ key: '号', value: '汇宗氏', type: '号' }]);

  // #20 0 片 0 籽：发起人资产文档逐字节不变、无任何 Tx
  const chiefAfter = await el.getAssets(CHIEF);
  assert.equal(JSON.stringify(chiefAfter), chiefRawBefore, '汇宗 0 片 0 籽：资产逐字节不变');
  assert.equal(chiefAfter.txs.length, 0);
  assert.equal(el.sumLots(chiefAfter.seeds), 5);
  assert.equal(chiefAfter.fragments, 3);
  assert.equal(chiefAfter.bamboos.length, 1);
  assert.equal(chiefAfter.jades.length, 1);

  // #17 叠加不覆盖 + #21 源树灵气保留且 expired
  const spiritAfter = spiritDocNow();
  const srcEntry = spiritAfter.trees[SRC];
  assert.ok(srcEntry, '源树 jiazu_spirit 记录保留（不删）');
  assert.equal(srcEntry.status, 'expired', '源树 status 置 expired');
  assert.equal(srcEntry.spirit_expires_at, spiritBefore.trees[SRC].spirit_expires_at, '源树原值保留作废留痕');
  assert.deepEqual(srcEntry.jade, spiritBefore.trees[SRC].jade, '源树玉留痕保留');
  assert.deepEqual(srcEntry.logs, spiritBefore.trees[SRC].logs);
  const tgtEntry = spiritAfter.trees[DST];
  assert.equal(new Date(tgtEntry.spirit_expires_at).getTime() - new Date(spiritBefore.trees[DST].spirit_expires_at).getTime(), 5 * DAY, '只在原值上顺延 5 天');
  assert.equal(tgtEntry.buffer_until, null);
  assert.equal(tgtEntry.status, 'active');
  // 玉不返还：jades 不新增、不产 SeedLot
  assert.deepEqual(chiefAfter.jades, chiefBefore.jades, '已镶嵌玉不返还（R5）');
  assert.equal(chiefAfter.seeds.length, chiefBefore.seeds.length, '不产 SeedLot');
});

// ================= ⑩ 汇宗落点家族复用（#13） =================

test('§10-1-13 汇宗 · 落点家族复用顺序：槽位家族 → 直接挂入；X 无家族 → 新建并铸号', async () => {
  // ① X 已有「本人在对应槽位且另一半空着」的家族 → 复用，不新建落点家族
  const a = await bco.convergeClan({ treeId: 'cv_ru1', targetRef: 'cv_t1-x', confirmPeople: 5 });
  assert.equal(a.moved_people, 5);
  const t1 = readTreeDisk('cv_t1');
  assert.equal(t1.people['cv_ru1-top'].parent_family, 'cv_t1-fx', '直接挂入 X 的既有家族');
  assert.deepEqual(
    Object.keys(t1.families).filter((f) => !['cv_ru1-fmid', 'cv_ru1-fn', 'cv_ru1-fkid'].includes(f)),
    ['cv_t1-fx'],
    '落点不新建家族（随迁家族本身照常搬入：fmid / fn / fkid）',
  );
  // 源树真实段的两个根（top + 旁支 side）都挂到复用的槽位家族下
  assert.deepEqual(t1.families['cv_t1-fx'].child_handles.slice().sort(), ['cv_ru1-side', 'cv_ru1-top'].sort());

  // ② X 完全没有家族 → 新建家族（编号铸全站新号）
  const b = await bco.convergeClan({ treeId: 'cv_ru2', targetRef: 'cv_t2-x', confirmPeople: 5 });
  assert.equal(b.moved_people, 5);
  const t2 = readTreeDisk('cv_t2');
  const newFams = Object.keys(t2.families).filter((f) => !['cv_ru2-fmid', 'cv_ru2-fn', 'cv_ru2-fkid'].includes(f));
  assert.equal(newFams.length, 1, 'X 无家族 → 新建 1 个落点家族');
  const fam2 = newFams[0];
  assert.notEqual(fam2, 'cv_t2-fx');
  assert.equal(t2.families[fam2].father_handle, 'cv_t2-x', '本人性别 M → 父亲位');
  assert.equal(t2.families[fam2].mother_handle, '');
  assert.match(t2.families[fam2].gramps_id, /^F\d{6}$/, '家族编号由铸号器给出（全站唯一）');
  assert.deepEqual(t2.families[fam2].child_handles.slice().sort(), ['cv_ru2-side', 'cv_ru2-top'].sort());
  assert.equal(t2.people['cv_ru2-top'].parent_family, fam2);
  assert.equal(t2.people['cv_t2-x'].spouse_families.includes(fam2), true, '新家族登记回 X 的家族列表');

  // ③ X 已有家族（另一半是配偶）→ 仍复用该槽位家族
  const c = await bco.convergeClan({ treeId: 'cv_ru3', targetRef: 'cv_t3-x', confirmPeople: 5 });
  assert.equal(c.moved_people, 5);
  const t3 = readTreeDisk('cv_t3');
  assert.deepEqual(
    Object.keys(t3.families).filter((f) => !['cv_ru3-fmid', 'cv_ru3-fn', 'cv_ru3-fkid'].includes(f)),
    ['cv_t3-fx'],
    '复用既有家族（不新建落点家族）',
  );
  assert.deepEqual(t3.families['cv_t3-fx'].child_handles.slice().sort(), ['cv_ru3-side', 'cv_ru3-top'].sort());
  assert.equal(t3.people['cv_ru3-top'].parent_family, 'cv_t3-fx');
  assert.deepEqual(tw.checkTreeIntegrity(t3), []);
});

// ================= ⑪ 汇宗灵折损（#16） =================

test('§10-1-16 汇宗 · 折损取整：剩余 3 天 → 并 2 天；灵气已过期 → 0 天且不入', async () => {
  // 3 天 → ceil(3 × 0.5) = 2
  const r = await bco.convergeClan({ treeId: 'cv_d3', targetRef: 'cv_t5-x', confirmPeople: 5 });
  assert.equal(r.spirit.source_days_left, 3);
  assert.equal(r.spirit.transferred_days, 2, 'ceil(3 × 0.5) = 2（不得向下取整为 1）');
  const t5 = readTreeDisk('cv_t5');
  assert.equal(new Date(r.spirit.target_spirit_expires_at).getTime() - new Date(isoPlus(50)).getTime(), 2 * DAY);
  assert.equal(treeExistsDisk('cv_d3'), false);
  assert.ok(r.moved_people === 5 && Object.keys(t5.people).length === 6, '迁移照旧完成（折损只影响灵气）');

  // 已过期（buffer / expired 期）→ 折损 0 天、目标树灵气时刻不变
  const spiritBefore = spiritDocNow();
  const r2 = await bco.convergeClan({ treeId: 'cv_exp', targetRef: 'cv_t6-x', confirmPeople: 5 });
  assert.equal(r2.spirit.source_days_left, 0);
  assert.equal(r2.spirit.transferred_days, 0);
  assert.match(r2.spirit.skipped_reason || '', /剩余有效期为 0 天/);
  const spiritAfter = spiritDocNow();
  assert.equal(spiritAfter.trees.cv_t6.spirit_expires_at, spiritBefore.trees.cv_t6.spirit_expires_at, '0 天 → 目标树灵气不动');
  assert.equal(spiritAfter.trees.cv_exp.status, 'expired', '源树记录仍保留并置 expired');
  assert.equal(treeExistsDisk('cv_exp'), false, '结构迁移照常完成（源树已消失）');
});

// ================= ⑫ 汇宗 · 目标树未镶嵌玉（#18） =================

test('§10-1-18 汇宗 · 目标树未镶嵌玉 → 200 且不并入：transferred_days=0 + skipped_reason 非空', async () => {
  const spiritBefore = spiritDocNow();
  assert.equal('cv_t4' in spiritBefore.trees, false, '前置：目标树无 jiazu_spirit 记录（未镶嵌玉）');
  const r = await bco.convergeClan({ treeId: 'cv_skip', targetRef: 'cv_t4-x', confirmPeople: 5 });
  assert.equal(r.moved_people, 5, '结构迁移照常完成');
  assert.equal(r.spirit.transferred_days, 0);
  assert.ok(r.spirit.skipped_reason, '必须带 skipped_reason');
  assert.match(r.spirit.skipped_reason, /目标树尚未镶嵌石榴籽玉/);
  assert.equal(r.spirit.source_days_left, 10, '源树灵气本身有 10 天，只是无载体不并入');
  assert.equal(r.spirit.target_spirit_expires_at, null);
  const spiritAfter = spiritDocNow();
  assert.equal('cv_t4' in spiritAfter.trees, false, '绝不产生「无玉却有灵气」的记录');
  assert.equal(spiritAfter.trees.cv_skip.status, 'expired', '源树记录仍置 expired');

  // 源树未镶嵌玉（无 jade）→ 同样不并入（另一条 skipped_reason）
  const spiritDoc = spiritDocNow();
  spiritDoc.trees.cv_nojade = { spirit_expires_at: isoPlus(10), status: 'inactive', buffer_until: null, logs: [] };
  await store.colSet('jiazu_spirit', 'global', spiritDoc);
  const applied = await bco.applySpiritTransfer({ sourceTreeId: 'cv_nojade', targetTreeId: 'cv_t6' });
  assert.equal(applied.transferred_days, 0);
  assert.match(applied.skipped_reason, /源树未镶嵌石榴籽玉/);
});

// ================= ⑬ 汇宗红线 / confirm_people / 目标校验（#15 #19 #22） =================

test('§10-1-15 汇宗 · 跨树引用红线 → 409：两树 / tree-meta / jiazu_spirit 全不变、无 Tx', async () => {
  const srcMd5 = treeMd5Disk('cv_ref');
  const dstMd5 = treeMd5Disk('cv_t7');
  const metaMd5 = md5(META_FILE);
  const spiritMd5 = spiritColMd5();
  const assetsMd5 = assetsColMd5();
  const assetsBefore = await el.getAssets(CHIEF);
  await assert.rejects(
    () => bco.convergeClan({ treeId: 'cv_ref', targetRef: 'cv_t7-x', confirmPeople: 5 }),
    (e) =>
      e.status === 409 &&
      /其它家族树中存在关联（始祖挂载\/镜像\/跨树婚姻）/.test(e.message) &&
      /解除关系后再汇宗/.test(e.message) &&
      e.message.includes('季氏测试家族（bc_ref_other）') &&
      e.message.includes('季cv_ref上移二镜像'),
  );
  assert.equal(treeMd5Disk('cv_ref'), srcMd5);
  assert.equal(treeMd5Disk('cv_t7'), dstMd5, '目标树不写');
  assert.equal(md5(META_FILE), metaMd5, 'tree-meta 不删');
  assert.equal(spiritColMd5(), spiritMd5, 'jiazu_spirit 不变');
  assert.equal(assetsColMd5(), assetsMd5, '0 籽：资产不变');
  assert.equal((await el.getAssets(CHIEF)).txs.length, assetsBefore.txs.length);
});

test('§10-1-19 汇宗 · confirm_people 不符 → 409 DELETE_SCOPE_CHANGED：不写树、不删 meta、灵气不变', async () => {
  const srcMd5 = treeMd5Disk('cv_conf');
  const dstMd5 = treeMd5Disk('cv_t8');
  const metaMd5 = md5(META_FILE);
  const spiritMd5 = spiritColMd5();
  const before = (await el.getAssets(CHIEF)).txs.length;
  await assert.rejects(
    () => bco.convergeClan({ treeId: 'cv_conf', targetRef: 'cv_t8-x', confirmPeople: 2 }),
    (e) => e.status === 409 && e.code === 'DELETE_SCOPE_CHANGED' && /汇宗范围已变化（当前 5 人，确认时 2 人）/.test(e.message),
  );
  assert.equal(treeMd5Disk('cv_conf'), srcMd5, '校验先于写入：源树不写');
  assert.equal(treeMd5Disk('cv_t8'), dstMd5);
  assert.equal(md5(META_FILE), metaMd5);
  assert.equal(spiritColMd5(), spiritMd5);
  assert.equal((await el.getAssets(CHIEF)).txs.length, before, '无任何 Tx');
  // 缺 confirm_people → 400（不是 409）
  await assert.rejects(
    () => bco.convergeClan({ treeId: 'cv_conf', targetRef: 'cv_t8-x' }),
    (e) => expect400(e, /缺少 confirm_people/),
  );
});

test('§10-1-22 汇宗 · 目标解析与校验：同树 / 祖谱 / 总谱 / 镜像 / 解析不到', async () => {
  const cases = [
    ['cv_self', 'cv_self-n', 400, /汇宗目标须是另一棵普通家族树中的普通节点/],
    ['cv_self', 'own_ji', 400, /汇宗目标须是另一棵普通家族树中的普通节点/, '目标在祖谱（kind=clan）'],
    ['cv_self', 'mRoot', 400, /汇宗目标须是另一棵普通家族树中的普通节点/, '目标在总谱（kind=master）'],
    ['cv_self', 'cv_t_mirror-mir', 400, /汇宗目标须是另一棵普通家族树中的普通节点/, '目标是镜像节点'],
    ['cv_self', 'cv_nowhere-x', 404, /找不到编号\/句柄为「cv_nowhere-x」的节点/],
  ];
  const srcMd5 = treeMd5Disk('cv_self');
  for (const [tree, ref, status, re, note] of cases) {
    await assert.rejects(
      () => bco.convergeClan({ treeId: tree, targetRef: ref, confirmPeople: 5 }),
      (e) => e.status === status && re.test(e.message),
      note || ref,
    );
  }
  assert.equal(treeMd5Disk('cv_self'), srcMd5, '目标校验不过时源树不写');
  // 源树始祖不是上层镜像（真人节点 / 非镜像）→ 400（另一条前置；§6-2-2 放宽口径后文案 = 「上层镜像」）
  await assert.rejects(
    () => bco.convergeClan({ treeId: 'cv_bad', targetRef: 'cv_t9-x', confirmPeople: 4 }),
    (e) => expect400(e, /该家族树当前始祖不是上层镜像，无法汇宗/),
  );
  // 源树为总谱 / 祖谱 → 400
  await assert.rejects(() => bco.convergeClan({ treeId: 'zhonghua', targetRef: 'cv_t9-x', confirmPeople: 1 }), (e) => expect400(e, /中华世本（总谱）不可汇宗/));
  await assert.rejects(() => bco.convergeClan({ treeId: 'bc_clan', targetRef: 'cv_t9-x', confirmPeople: 1 }), (e) => expect400(e, /祖谱不可汇宗/));
});

// ================= ⑭ 汇宗路由（401 / 403） =================

test('汇宗路由：未登录 401 / tree_steward 403 需要总编辑权限 / 缺 tree_id 400', async () => {
  const srcMd5 = treeMd5Disk('bc_route');
  const anon = await call('/admin/converge-clan', { tree_id: 'bc_route', target_person_id: 'cv_t9-x', confirm_people: 1 });
  assert.equal(anon.statusCode, 401);
  const steward = await call('/admin/converge-clan', { tree_id: 'bc_route', target_person_id: 'cv_t9-x', confirm_people: 1 }, tokenOf(STEWARD, 'tree_steward'));
  assert.equal(steward.statusCode, 403);
  assert.match(bodyOf(steward).error, /需要总编辑权限/);
  const noParam = await call('/admin/converge-clan', { target_person_id: 'cv_t9-x', confirm_people: 1 }, tokenOf(CHIEF, 'chief_editor'));
  assert.equal(noParam.statusCode, 400);
  assert.match(bodyOf(noParam).error, /缺少 tree_id/);
  assert.equal(treeMd5Disk('bc_route'), srcMd5);
});

// ================= ⑮ 后台设置键生效（§5-4 / #24） =================

test('后台设置键生效：branch_fee_seeds=1 → 立支只扣 1 籽；converge_spirit_ratio=0.25 → 折损 3 天', async () => {
  // ① 立支费改 1 → 只扣 1 籽（金额与流水同步变小）
  const treesBefore = treeFileCount();
  try {
    await walletLib.setBranchFeeSeeds(1);
    assert.equal(await walletLib.getBranchFeeSeeds(), 1);
    assert.equal((await el.getAssets(FEE1U)).seeds[0].qty, 3);
    const res = await call('/admin/establish-branch', { tree_id: 'bc_fee1', person_handle: 'bc_fee1-n' }, tokenOf(FEE1U, 'tree_steward'));
    assert.equal(res.statusCode, 200, res.body);
    const body = bodyOf(res);
    assert.equal(body.fee.amount, 1, '后台设置键改后立支费生效');
    assert.equal(body.fee.balance_after, 2);
    const assets = await el.getAssets(FEE1U);
    assert.equal(el.sumLots(assets.seeds), 2, '只扣 1 籽');
    const tx = assets.txs.find((t) => t.type === 'tree_create');
    assert.equal(tx.delta.seeds, -1);
    assert.equal(tx.ref.tree_id, body.new_tree_id);
    assert.equal(treeFileCount(), treesBefore + 1);
  } finally {
    await walletLib.setBranchFeeSeeds(9999);
  }

  // ② 折损比例改 0.25 → 剩余 10 天只并入 ceil(10 × 0.25) = 3 天
  try {
    await walletLib.setConvergeSpiritRatio(0.25);
    const res = await call('/admin/converge-clan', { tree_id: 'cv_ratio', target_person_id: 'cv_t_ratio-x', confirm_people: 5 }, tokenOf(CHIEF, 'chief_editor'));
    assert.equal(res.statusCode, 200, res.body);
    const body = bodyOf(res);
    assert.equal(body.spirit.ratio, 0.25, '路由读的是后台设置键');
    assert.equal(body.spirit.source_days_left, 10);
    assert.equal(body.spirit.transferred_days, 3, 'ceil(10 × 0.25)');
    const spirit = spiritDocNow();
    assert.equal(new Date(spirit.trees.cv_t_ratio.spirit_expires_at).getTime() - new Date(isoPlus(100)).getTime(), 3 * DAY);
  } finally {
    await walletLib.setConvergeSpiritRatio(0.5);
    assert.equal(await walletLib.getConvergeSpiritRatio(), 0.5, '收工复原默认比例');
  }
});

// ================= ⑯ 立支落库失败冲正（真实 EACCES，§10-1-8） =================

test('§10-1-8 立支 · 真实 EACCES 落库失败 → 结构回滚 + 新树文件回收 + 原路返还同一批次 + fee_refunded', async () => {
  const SRC = 'bc_rollback';
  const CLAN = 'bc_clan_rb';
  const srcBefore = readTreeDisk(SRC);
  const clanMd5 = treeMd5Disk(CLAN);
  const metaMd5 = md5(META_FILE);
  const treesBefore = treeFileCount();
  const assetsBefore = await el.getAssets(ROLLBK);
  const fpBefore = lotFingerprint(assetsBefore.seeds);
  const metaKeysBefore = Object.keys(metaNow().trees).length;
  assert.equal(el.sumLots(assetsBefore.seeds), 11000);

  const clanFile = path.join(TREES_DIR, `${CLAN}.json`);
  let res;
  try {
    fs.chmodSync(clanFile, 0o444); // 真实 EACCES：宗谱树文件只读 → updateTrees 落库失败
    res = await call('/admin/establish-branch', { tree_id: SRC, person_handle: 'bc_rollback-n' }, tokenOf(ROLLBK, 'tree_steward'));
  } finally {
    fs.chmodSync(clanFile, 0o644);
  }
  const body = bodyOf(res);
  // §7-1 500 行：落库失败 = **服务内部错误 + 500**（系统级异常不得回落 400）
  assert.equal(res.statusCode, 500, `§7-1 系统级落库失败一律 500，实际 ${res.statusCode}`);
  assert.equal(body.status, 500, '错误体自带 status = 500（与通用文案配套）');
  assert.equal(body.fee_refunded, true, '响应必须带 fee_refunded（原始落库错误不得掩盖冲正）');
  assert.equal(body.error, eco.INTERNAL_ERROR_TEXT, '系统错误 → 通用文案（不回显 errno / 堆栈）');
  assert.equal(body.code === undefined || body.code !== 'EACCES', true, 'EACCES 不得作为业务 code 回显');
  for (const leak of ['EACCES', 'permission denied', 'chmod', TMP]) {
    assert.equal(res.body.includes(leak), false, `落库失败响应不得泄露「${leak}」：${res.body}`);
  }

  // 结构回滚：新树文件回收、原树结构还原、宗谱文件一字未写
  assert.equal(treeFileCount(), treesBefore, '新树文件必须回收（不留半成品）');
  assert.deepEqual(stripVolatile(readTreeDisk(SRC)), stripVolatile(srcBefore), '原树结构回滚到操作前（version/updated_at 除外）');
  assert.equal(treeMd5Disk(CLAN), clanMd5, '失败侧的宗谱文件一字未写');
  assert.equal(md5(META_FILE), metaMd5, 'tree-meta 未登记新树');
  const meta = metaNow();
  assert.equal(meta.trees[SRC].founder_handle, 'bc_rollback-m', '原树始祖登记未被改写');
  assert.equal(Object.keys(meta.trees).length, metaKeysBefore, '没有残留的新树条目');

  // 资产：原路返还同一批次（按 lot.id 指纹）+ 1 条 fee_refund，总分还原
  const assets = await el.getAssets(ROLLBK);
  assert.deepEqual(lotFingerprint(assets.seeds), fpBefore, '返回的是同一批次（原 lot_id / qty / expires_at）');
  assert.equal(el.sumLots(assets.seeds), 11000, '总分还原');
  assert.equal(assets.seeds.length, 2, '不新造批次');
  const types = assets.txs.map((t) => t.type);
  assert.deepEqual(types, ['tree_create', 'fee_refund'], '先扣费后冲正各一条');
  assert.equal(assets.txs[0].delta.seeds, -9999);
  assert.equal(assets.txs[1].delta.seeds, 9999);
  assert.equal(assets.txs[1].ref.txn_id, assets.txs[0].id, 'fee_refund 指向原流水');
});

// ================= ⑰ 回归：updateTrees 失败侧缓存回滚（原「缺陷复现」，实现已修） =================

test('回归 · updateTrees 落库失败后**两侧**进程内缓存都与磁盘一致（原缺陷：失败侧读回幻影结构）', async () => {
  const disk = readTreeDisk('bc_clan_rb');
  const cached = await store.getTree('bc_clan_rb');
  // 上一用例（EACCES）里宗谱是**未落盘的一侧**：磁盘一字未写
  assert.equal('bc_rollback-mid' in disk.people, false, '磁盘：失败侧的宗谱文件干净');
  // 修复前：fn 已**就地改脏**缓存对象且只回滚了 written 一侧 → 这里会读到盘上不存在的幻影结构
  // （含 bc_rollback-mid 与两条立支登记镜像）→ 本条必须红。
  assert.deepEqual(stripVolatile(cached), stripVolatile(disk), '失败侧缓存 === 磁盘（不留盘上不存在的幻影结构）');
  assert.equal('bc_rollback-mid' in cached.people, false, '幻影节点已消除');
  assert.equal(
    Object.values(cached.people).some((p) => p.external_tree === 'bc_rollback'),
    false,
    '幻影里不再带立支的两条登记镜像',
  );
  // 已落盘后回滚的一侧（原树）：快照回写后缓存也必须 === 磁盘
  const srcDisk = readTreeDisk('bc_rollback');
  const srcCached = await store.getTree('bc_rollback');
  assert.deepEqual(stripVolatile(srcCached), stripVolatile(srcDisk), '已落盘侧回滚后缓存 === 磁盘');

  // 自包含复现（不依赖其它用例的副作用）：直接驱动 store.updateTrees，让**第二棵**树落库 EACCES
  const rbB = path.join(TREES_DIR, 'rb_b.json');
  const beforeA = stripVolatile(readTreeDisk('rb_a'));
  const beforeB = stripVolatile(readTreeDisk('rb_b'));
  try {
    fs.chmodSync(rbB, 0o444);
    await assert.rejects(() =>
      store.updateTrees(['rb_a', 'rb_b'], (trees) => {
        trees.rb_a.people['ghost-a'] = { handle: 'ghost-a', gramps_id: 'I9001', name: '幻影A' };
        trees.rb_b.people['ghost-b'] = { handle: 'ghost-b', gramps_id: 'I9002', name: '幻影B' };
      }),
    );
  } finally {
    fs.chmodSync(rbB, 0o644);
  }
  assert.deepEqual(stripVolatile(readTreeDisk('rb_a')), beforeA, '已落盘侧回滚：盘上还原');
  assert.deepEqual(stripVolatile(readTreeDisk('rb_b')), beforeB, '失败侧：盘上原样（一字未写）');
  assert.deepEqual(stripVolatile(await store.getTree('rb_a')), beforeA, '已落盘侧：缓存 === 磁盘');
  assert.deepEqual(stripVolatile(await store.getTree('rb_b')), beforeB, '失败侧：缓存 === 磁盘（不得留盘上不存在的幻影）');
});

// ================= ⑱ 立支 · 详情缺失告警出参 warnings?（§10-1 #25 / §8-1） =================

test('§10-1-25 立支 · 详情缺失告警出参 warnings?：有缺失 → 非空且含该节点编号；无缺失 → 出参无该键', async () => {
  // ① 有缺失：bc_warn_yes 的上移链 = 上移一（top，**无详情文档**）+ 上移二（mid，有详情）
  const r1 = await bco.establishBranch({ treeId: 'bc_warn_yes', personRef: 'bc_warn_yes-n' });
  assert.equal(r1.ok, true);
  assert.ok(Array.isArray(r1.warnings), 'warnings 必须是 string[]');
  assert.equal(r1.warnings.length, 1, '只有缺详情的 top 进告警（mid 有详情 → 不入）');
  assert.match(r1.warnings[0], /详情文档缺失，仅结构真源已迁移/);
  assert.ok(r1.warnings[0].includes('I0010'), `必须含该节点的全站编号：${r1.warnings[0]}`);
  assert.ok(r1.warnings[0].includes('bc_warn_yes-top'), `必须含该节点 handle：${r1.warnings[0]}`);
  assert.ok(r1.warnings[0].includes('季bc_warn_yes上移一'), '必须含该节点姓名（按 handle 回查）');
  // 详情是 best-effort：结构写入不受影响、计数不变、不回滚
  assert.equal(r1.moved_ancestors, 2);
  assert.equal(r1.moved_families, 2);
  const clan1 = readTreeDisk('bc_clan');
  assert.ok(clan1.people['bc_warn_yes-mid'] && clan1.people['bc_warn_yes-top'], '上移链两条都已入宗谱');
  assert.ok(clan1.families['bc_warn_yes-fmid'] && clan1.families['bc_warn_yes-fn'], '随迁家族照旧入宗谱');
  const src1 = readTreeDisk('bc_warn_yes');
  assert.equal(src1.people['bc_warn_yes-top'], undefined, '原树已摘链（不因缺详情而回滚）');
  assert.ok(src1.people['bc_warn_yes-n'], 'N 本人仍在原树（只摘上移链）');
  assert.deepEqual(tw.checkTreeIntegrity(clan1), []);
  assert.deepEqual(tw.checkTreeIntegrity(src1), []);
  assert.equal(detailExists('bc_warn_yes', 'bc_warn_yes-mid'), false, '有详情的那条旧键已删');
  assert.ok(readDetailDisk('bc_clan', 'bc_warn_yes-mid'), '有详情的那条新键必须有内容（照旧随迁改 _id）');
  assert.equal(readDetailDisk('bc_clan', 'bc_warn_yes-mid')._id, 'bc_clan:bc_warn_yes-mid');
  assert.equal(readDetailDisk('bc_clan', 'bc_warn_yes-mid').events.length, 1, '详情内容随迁');

  // ② 无缺失：bc_warn_no 的上移链（mid + top）详情齐备 → 出参**不得出现** warnings 键（不是空数组）
  const r2 = await bco.establishBranch({ treeId: 'bc_warn_no', personRef: 'bc_warn_no-n' });
  assert.equal(r2.ok, true);
  assert.equal('warnings' in r2, false, '无缺失时不得出现 warnings 字段（不是空数组）');
  assert.deepEqual(
    Object.keys(r2).sort(),
    ['fee', 'founder', 'moved_ancestors', 'moved_families', 'new_tree_id', 'ok', 'original_tree_id'],
    '无缺失时出参字面形状 = 既有契约（不新增字段）',
  );
  assert.equal(r2.moved_ancestors, 2);
  assert.equal(r2.moved_families, 2);
  for (const h of ['bc_warn_no-mid', 'bc_warn_no-top']) {
    assert.equal(detailExists('bc_warn_no', h), false, `${h} 旧键已删`);
    assert.ok(readDetailDisk('bc_clan', h), `${h} 新键必须有内容`);
  }
});

// ================= ⑲ 系统级失败文案统一（§7 / §15-#8） =================

test('§15-#8 系统级失败文案 = 「服务内部错误」（汇宗 ④ 树文件删除阶段真实 EACCES）', async () => {
  assert.equal(bco.INTERNAL_ERROR_TEXT, '服务内部错误');
  assert.equal(bco.INTERNAL_ERROR_TEXT, eco.INTERNAL_ERROR_TEXT, '与 lib/economy-fee.js 的共享口径逐字一致');

  const SRC = 'cv_stage4';
  const DST = 'cv_t_s4';
  const metaMd5 = md5(META_FILE);
  const spiritMd5 = spiritColMd5();
  let res;
  try {
    // 真实 EACCES：trees 目录不可写 → ④ 阶段 deleteTree 的 unlink 失败（写已有文件不受影响，故结构迁移照旧成功）
    fs.chmodSync(TREES_DIR, 0o555);
    res = await call(
      '/admin/converge-clan',
      { tree_id: SRC, target_person_id: `${DST}-x`, confirm_people: 5 },
      tokenOf(CHIEF, 'chief_editor'),
    );
  } finally {
    fs.chmodSync(TREES_DIR, 0o755);
  }
  assert.equal(res.statusCode, 500, `§7 系统级失败一律 500：${res.body}`);
  const body = bodyOf(res);
  assert.equal(body.error, '服务内部错误', '④ 阶段失败 → 统一文案（不是「服务器开小差了，请稍后重试」）');
  assert.equal(body.error, bco.INTERNAL_ERROR_TEXT);
  assert.equal('code' in body, false, '不得回显系统错误码（§7）');
  for (const leak of ['EACCES', 'permission denied', 'unlink', TMP]) {
    assert.equal(res.body.includes(leak), false, `不得泄露「${leak}」：${res.body}`);
  }
  // §6-2-4 ⑥：结构已迁移**不回滚**；源树树文件仍在（删除失败）；tree-meta 条目按原条目补回 + reconcile 标记
  const dst = readTreeDisk(DST);
  assert.equal(Object.keys(dst.people).filter((h) => h.startsWith(`${SRC}-`)).length, 5, '迁移照旧完成、不回滚');
  assert.equal(treeExistsDisk(SRC), true, '④ 阶段删除失败 → 源树树文件仍在');
  assert.deepEqual(Object.keys(readTreeDisk(SRC).people), [`${SRC}-m`], '源树只剩待作废的始祖镜像（真实节点已迁出）');
  assert.notEqual(md5(META_FILE), metaMd5, 'reconcile 登记已写 meta');
  const entry = metaNow().trees[SRC];
  assert.ok(entry, '源树条目按原条目补回留痕');
  assert.equal(entry.reconcile_state, 'empty_source_shell');
  assert.match(entry.reconcile_note, /汇宗后清理失败/);
  assert.equal(spiritColMd5(), spiritMd5, '④ 阶段失败 → 未走到灵气写入');
});

test('§15-#8 系统级失败文案 = 「服务内部错误」（汇宗 ⑤ 灵气写入阶段真实 EACCES）', async () => {
  const SRC = 'cv_stage5';
  const DST = 'cv_t_s5';
  const spiritFile = path.join(COLS_DIR, 'jiazu_spirit.json');
  const spiritMd5 = spiritColMd5();
  let res;
  try {
    fs.chmodSync(spiritFile, 0o444); // 真实 EACCES：集合文件只读 → ⑤ 阶段 colSet 落盘失败
    res = await call(
      '/admin/converge-clan',
      { tree_id: SRC, target_person_id: `${DST}-x`, confirm_people: 5 },
      tokenOf(CHIEF, 'chief_editor'),
    );
  } finally {
    fs.chmodSync(spiritFile, 0o644);
  }
  assert.equal(res.statusCode, 500, `§7 系统级失败一律 500：${res.body}`);
  const body = bodyOf(res);
  assert.equal(body.error, '服务内部错误', '⑤ 阶段失败 → 统一文案');
  assert.equal(body.error, bco.INTERNAL_ERROR_TEXT);
  for (const leak of ['EACCES', 'permission denied', TMP]) {
    assert.equal(res.body.includes(leak), false, `不得泄露「${leak}」：${res.body}`);
  }
  // ④ 阶段成功（树文件 + tree-meta 条目都已删）→ ⑤ 失败后按原条目补回带 reconcile 标记
  assert.equal(treeExistsDisk(SRC), false, '④ 阶段成功 → 源树树文件已删');
  const entry = metaNow().trees[SRC];
  assert.ok(entry, '⑤ 失败后源树条目补回留痕（§6-2-4 ⑥）');
  assert.equal(entry.reconcile_state, 'empty_source_shell');
  assert.match(entry.reconcile_note, /汇宗后清理失败/);
  assert.equal(spiritColMd5(), spiritMd5, '灵气集合文件逐字节未变（写入失败，缓存不留幻影）');
  assert.equal(spiritDocNow().trees[SRC].status, 'active', '源树灵气记录未被改写');
  assert.equal(
    Object.keys(readTreeDisk(DST).people).filter((h) => h.startsWith(`${SRC}-`)).length,
    5,
    '结构迁移照旧完成（不回滚）',
  );
});

// ================= ㉑ 立支 ↔ 汇宗 互逆闭环（§6-2-2 放宽口径 · 新增 3 条） =================

test('§6-2-2 互逆闭环 · 立支产物（始祖镜像指回原树普通节点）直接汇宗 → 200，产物真实节点回到立支点之下', async () => {
  const A = 'cv_loop_a';
  const filesBefore = treeFileCount();

  // ① 立支：N = cv_loop_a-n 成为新树始祖（立支产物初始只有 1 个始祖镜像节点）
  const boot = await bco.establishBranch({ treeId: A, personRef: `${A}-n` });
  const B = boot.new_tree_id;
  assert.equal(boot.ok, true);
  assert.equal(boot.founder.handle, `${A}-n`);
  const b0 = readTreeDisk(B);
  const mirrorHandle = Object.keys(b0.people)[0];
  assert.equal(Object.keys(b0.people).length, 1, '立支产物初始只有始祖镜像');
  assert.equal(b0.people[mirrorHandle].external_link_type, 'founder');
  assert.equal(b0.people[mirrorHandle].external_mirror, 'true');
  assert.equal(b0.people[mirrorHandle].external_tree, A, '立支产物的始祖镜像指回**原树**');
  assert.equal(
    metaNow().trees[A].kind,
    'family',
    '互逆闭环的关键：镜像的 external_tree 是**普通家族树**（放宽口径前按 clan 卡死 → 必 400）',
  );

  // ② 产物里长出真实节点（新支系人口）：走正常加子女通道
  const child = await cw.addChildNode({ treeId: B, personHandle: mirrorHandle, name: '互逆闭环', gender: 'M' });
  assert.equal(child.cross_tree, false, '父为产物始祖镜像、母缺位 → 子女落在产物树内');
  assert.equal(typeof child.child_handle, 'string');
  const childGramps = readTreeDisk(B).people[child.child_handle].gramps_id;

  // ③ 直接汇宗回原树（不认祖、不 detach/attach —— 旧口径这一步必 400）
  const res = await bco.convergeClan({ treeId: B, targetRef: `${A}-n`, confirmPeople: 1 });
  assert.equal(res.ok, true);
  assert.equal(res.source_tree_id, B);
  assert.equal(res.target_tree_id, A);
  assert.equal(res.moved_people, 1, '产物里的真实节点整树回迁');
  assert.equal(res.moved_families, 0, '连着始祖镜像的家族记录留源树、随树作废');

  // ④ 产物树消失，原树收回节点（挂到立支点 X 的家族之下）
  assert.equal(treeExistsDisk(B), false, '源树（立支产物）树 JSON 已删');
  assert.equal(B in metaNow().trees, false, '源树 tree-meta 条目已删');
  const aAfter = readTreeDisk(A);
  const back = aAfter.people[child.child_handle];
  assert.ok(back, '回迁节点落在原树');
  assert.equal(back.gramps_id, childGramps, '换树不换号');
  const fam = aAfter.families[back.parent_family];
  assert.ok(fam, '落点家族存在');
  assert.equal(fam.father_handle, `${A}-n`, '落点家族挂在立支点 X 之下');
  assert.equal(fam.child_handles.includes(child.child_handle), true);
  assert.equal(aAfter.people[`${A}-n`].spouse_families.includes(fam.handle), true);
  assert.ok(aAfter.people[`${A}-n`], '立支点本身仍留在原树');
  assert.ok(readTreeDisk('bc_clan_loop').people[`${A}-mid`], '立支时上移的祖先链仍在祖谱（立支侧结果未受影响）');
  assert.equal(metaNow().trees[A].founder_handle, `${A}-n`, '原树始祖登记仍是立支点');
  assert.deepEqual(tw.checkTreeIntegrity(aAfter), [], '回迁后原树无悬空引用');
  assert.equal(treeFileCount(), filesBefore, '产物树文件已回收（净增 0）');
});

test('§6-2-2 回归 · 源树始祖镜像指向祖谱（认祖路线）→ 仍 200，整树真实节点迁入目标树', async () => {
  const SRC = 'cv_reg_src';
  const DST = 'cv_t_reg';
  const res = await bco.convergeClan({ treeId: SRC, targetRef: `${DST}-x`, confirmPeople: 5 });
  assert.equal(res.ok, true, '放宽口径不得误伤「认祖后的汇宗」');
  assert.equal(res.target_tree_id, DST);
  assert.equal(res.moved_people, 5, '5 个真实节点（始祖镜像不计入）');
  assert.equal(res.moved_families, 3);
  assert.equal(treeExistsDisk(SRC), false, '源树树 JSON 已删');
  assert.equal(SRC in metaNow().trees, false, '源树 tree-meta 条目已删');
  const dst = readTreeDisk(DST);
  for (const h of ['cv_reg_src-top', 'cv_reg_src-side', 'cv_reg_src-mid', 'cv_reg_src-n', 'cv_reg_src-kid']) {
    assert.ok(dst.people[h], `${h} 已迁入目标树`);
  }
  assert.equal('cv_reg_src-m' in dst.people, false, '始祖镜像随树丢弃');
  assert.equal(dst.people['cv_reg_src-top'].parent_family, `${DST}-fx`, '真实段根挂到 X 的家族下');
  assert.deepEqual(tw.checkTreeIntegrity(dst), []);
});

test('§6-2-2 拒绝 · 源树始祖是真人节点（非镜像）→ 400「不是上层镜像」，不写不扣', async () => {
  const SRC = 'cv_plain_src';
  const DST = 'cv_t_reg2';
  const srcMd5 = treeMd5Disk(SRC);
  const dstMd5 = treeMd5Disk(DST);
  const metaMd5 = md5(META_FILE);
  const spiritMd5 = spiritColMd5();
  const chiefBefore = JSON.stringify(await el.getAssets(CHIEF));
  await assert.rejects(
    () => bco.convergeClan({ treeId: SRC, targetRef: `${DST}-x`, confirmPeople: 4 }),
    (e) => expect400(e, /该家族树当前始祖不是上层镜像，无法汇宗/),
  );
  assert.equal(treeMd5Disk(SRC), srcMd5, '源树一字未写');
  assert.equal(treeMd5Disk(DST), dstMd5, '目标树一字未写');
  assert.equal(md5(META_FILE), metaMd5, 'tree-meta 一字未写');
  assert.equal(spiritColMd5(), spiritMd5, 'jiazu_spirit 一字未写');
  assert.equal(JSON.stringify(await el.getAssets(CHIEF)), chiefBefore, '汇宗 0 片 0 籽：发起人资产逐字节不变');
  assert.equal(treeExistsDisk(SRC), true, '源树树文件仍在');
});

// ================= ㉒ 系统级失败不得泄露本机路径（§7 · 入口 /admin/add-child） =================

test('§7 系统级失败 · /admin/add-child 真实 EACCES → 500 + 通用文案（响应体不含本机路径 / EACCES）', async () => {
  const TREE = 'cv_ec_child';
  const treeFile = path.join(TREES_DIR, `${TREE}.json`);
  const treeMd5Before = treeMd5Disk(TREE);
  let res;
  try {
    fs.chmodSync(treeFile, 0o444); // 真实 EACCES：树文件只读 → updateTrees 落盘失败（e.message 里带本机绝对路径）
    res = await call(
      '/admin/add-child',
      { tree_id: TREE, person_handle: `${TREE}-top`, name: '泄露探针' },
      tokenOf(STEWARD, 'tree_steward'),
    );
  } finally {
    fs.chmodSync(treeFile, 0o644);
  }
  // 旧口径 `send(e.status || 400, { error: e.message })`：400 + 「EACCES: permission denied, open '/private/var/…'」
  assert.equal(res.statusCode, 500, `§7 系统级失败一律 500：${res.body}`);
  const body = bodyOf(res);
  assert.equal(body.error, eco.INTERNAL_ERROR_TEXT, '只回通用文案，绝不透传底层异常文本');
  assert.equal(body.status, 500);
  assert.equal('code' in body, false, '不得回显系统错误码（§7）');
  for (const leak of ['EACCES', 'permission denied', 'open ', TMP, '/Users/', '/private/', '/var/']) {
    assert.equal(res.body.includes(leak), false, `不得泄露「${leak}」：${res.body}`);
  }
  assert.equal(treeMd5Disk(TREE), treeMd5Before, '落盘失败 → 树 JSON 逐字节未变（失败侧缓存已失效）');

  // 对照组：同一路由的**业务裸异常**仍是 400 + 业务文案（改用通用句会误吞业务信息，故只对系统级失败吃通用文案）
  const biz = await call(
    '/admin/add-child',
    { tree_id: TREE, person_handle: `${TREE}-top`, child_handle: 'nope', gender: 'M' },
    tokenOf(STEWARD, 'tree_steward'),
  );
  assert.equal(biz.statusCode, 400, `业务裸异常仍 400：${biz.body}`);
  assert.equal(bodyOf(biz).error, '所选节点不存在于该树', '业务文案不得被通用句覆盖');
});

// ================= ⑳ 真源护栏（收尾） =================

test('§10-1-23 真源护栏（收尾）：migrate-output/ 逐字节未变 + 真源 meta 无夹具指纹', () => {
  assertRealUntouched('收尾');
});
