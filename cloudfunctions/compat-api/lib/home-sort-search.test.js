/**
 * 家族树活跃度 + 全站人物搜索 + 家族树资金下线 —— 单测
 *
 * 覆盖（派单口径 A/B/C）：
 *   A. `GET /tree/rank` 出参新增 `activity`（近 30 天互动事件数）与 `updated_at`（树 JSON 原值；缺失 → ''）；
 *      既有字段（rank_key / rank_label / rank_en / rank_desc / person_count / total_generations / access …）逐字段仍在。
 *      `lib/tree-activity.js`：`eventTrees` / `countRecentEvents` / `treeActivity`（窗口含等号边界、
 *      时间字段顺序 created_at → ts → handled_at → decided_at、全缺不计、集合缺失恒 0 不抛、
 *      `master_tree_id` 不计入、婚姻记录 from_tree / to_tree 各计 1）。
 *   B. `GET /search/global`：编号 / handle 精确命中置顶（matched='id'）、编号匹配、姓名匹配（tree_title 正确）、
 *      guest 节点级可见裁剪、空 query → []、limit clamp 生效、meta 有登记但树文件缺失 → 不 500。
 *   D. `GET /search/global` 镜像归并（M1–M5）：镜像（`external_mirror==='true'`，非「有 external_*」）按真身
 *      handle 折叠 → 同一人只出一条；组内选代表 ①matched==='id' ②真身 ③tree_id / handle 字典序；
 *      真身被可达层级裁剪时返回镜像条并置 `restricted:true`（只填镜像自身可见信息、绝不夹带真身 handle/编号/树名）；
 *      不得按姓名合并两个不同真身；先归并后截断 limit。
 *   D-2（假受限修复 · N1–N5）：镜像链**递归**解析到最终真身（防环 / 防深 / 绝不抛），并**直接判定真身对当前
 *      访问者的可见性** —— 真身可见（即使查询只命中镜像）→ 代表取真身且 `restricted:false`；真身不可见 /
 *      解析不到 → 代表保持镜像且 `restricted:true`（不泄漏真身）。restricted **不得**再用「组内有无真身」代理。
 *      三级链折叠为 1 条；环状镜像不死循环且结果确定；同名不同真身仍各自成条。
 *   C. `POST /wallet/transfer`、`GET /wallet/tree-balance` → 410 + `code='TREE_FUND_RETIRED'`（在任何鉴权/参数校验之前）。
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本；文末断言真源（config/tree-meta.json +
 * migrate-output/trees + migrate-output/collections）md5 逐字节未变（照 economy-market.test.js / assets.test.js 模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/home-sort-search.test.js
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
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-home-sort-search-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = dirBaseline(REAL_TREES);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

const DAY = 86400000;
/** 相对「现在」的天数偏移（活跃度窗口用真实时钟：/tree/rank 内部取 new Date()） */
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

// ---- 沙箱目录 ----
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2));
const writeTree = (tree) => writeJson(path.join(TMP, 'trees', `${tree.tree_id}.json`), tree);
const writeCol = (col, docs) => {
  const obj = {};
  for (const d of docs) obj[d._id || `k_${Object.keys(obj).length}`] = d;
  writeJson(path.join(TMP, 'collections', `${col}.json`), obj);
};

// ---- tree-meta：ghost_tree 只登记、不落树文件（口径 B · 树文件缺失不得整体 500）----
// 口径 D（镜像归并）夹具：mm/nn/mdeep/pp/qq 五棵树（命名与既有夹具不重叠，故不影响 B1–B5 的计数断言）
writeJson(process.env.COMPAT_META_FILE, {
  _schema: '1.1',
  trees: {
    aa_tree: { tree_id: 'aa_tree', kind: 'clan', display_title: '甲氏宗谱' },
    bb_tree: { tree_id: 'bb_tree', kind: 'clan', display_title: '乙氏宗谱' },
    deep_tree: { tree_id: 'deep_tree', kind: 'clan', display_title: '深树宗谱' },
    zz_tree: { tree_id: 'zz_tree', kind: 'clan', display_title: '支氏宗谱' },
    ghost_tree: { tree_id: 'ghost_tree', kind: 'clan', display_title: '幽灵宗谱' },
    mm_tree: { tree_id: 'mm_tree', kind: 'clan', display_title: '季氏支谱' },
    nn_tree: { tree_id: 'nn_tree', kind: 'clan', display_title: '季氏本宗' },
    mdeep_tree: { tree_id: 'mdeep_tree', kind: 'clan', display_title: '季氏远谱' },
    pp_tree: { tree_id: 'pp_tree', kind: 'clan', display_title: '傅氏甲谱' },
    qq_tree: { tree_id: 'qq_tree', kind: 'clan', display_title: '傅氏乙谱' },
    // 口径 D-2（假受限修复 · N1–N5）夹具
    n1_tree: { tree_id: 'n1_tree', kind: 'clan', display_title: '岳氏小谱' },
    n1r_tree: { tree_id: 'n1r_tree', kind: 'clan', display_title: '岳氏本宗' },
    n3a_tree: { tree_id: 'n3a_tree', kind: 'clan', display_title: '龙氏甲谱' },
    n3b_tree: { tree_id: 'n3b_tree', kind: 'clan', display_title: '龙氏乙谱' },
    n3c_tree: { tree_id: 'n3c_tree', kind: 'clan', display_title: '龙氏深处' },
    n4a_tree: { tree_id: 'n4a_tree', kind: 'clan', display_title: '花氏甲谱' },
    n4b_tree: { tree_id: 'n4b_tree', kind: 'clan', display_title: '花氏乙谱' },
    n5a_tree: { tree_id: 'n5a_tree', kind: 'clan', display_title: '慕容甲谱' },
    n5b_tree: { tree_id: 'n5b_tree', kind: 'clan', display_title: '慕容乙谱' },
  },
});

// ---- 树文件 ----
// aa_tree：key 序 张三三 → 张一一（模拟树内旧号 I123，用于验证「置顶」不被字典序抢先）
writeTree({
  tree_id: 'aa_tree',
  version: 3,
  updated_at: '2026-09-01T00:00:00.000Z',
  people: {
    h_aa_name: {
      handle: 'h_aa_name', gramps_id: 'I000900', name: '张三三', surname: '张', given: '三三',
      gender: 'M', birth_date: '1900-01-01', death_date: '',
    },
    h_aa_123: {
      handle: 'h_aa_123', gramps_id: 'I123', name: '张一一', surname: '张', given: '一一',
      gender: 'F', birth_date: '', death_date: '',
    },
  },
  families: {},
});

// bb_tree：**无 updated_at**（→ /tree/rank 应回空串）
writeTree({
  tree_id: 'bb_tree',
  version: 1,
  people: {
    h_bb_1: { handle: 'h_bb_1', gramps_id: 'I000901', name: '李四', surname: '李', given: '四', gender: 'M', birth_date: '', death_date: '' },
  },
  families: {},
});

// zz_tree：全局编号 I000123（字典序最后 → 置顶判定必须靠 resolveNode，不能靠 tree_id 排序）
writeTree({
  tree_id: 'zz_tree',
  version: 2,
  updated_at: '2026-08-15T12:00:00.000Z',
  people: {
    h_zz_123: {
      handle: 'h_zz_123', gramps_id: 'I000123', name: '支小五', surname: '支', given: '小五',
      gender: 'M', birth_date: '1950-05-05', death_date: '2000-01-01',
    },
  },
  families: {},
});

// deep_tree：20 世链（guest 隐藏树梢 18 世 → 第 3–20 世不可见；第 1 世可见）
const DEEP_N = 20;
const deepPeople = {};
const deepFamilies = {};
for (let i = 1; i <= DEEP_N; i++) {
  const h = `h_deep_${i}`;
  const given = i === 1 ? '深根' : i === DEEP_N ? '深深' : `深${i}`;
  deepPeople[h] = {
    handle: h,
    gramps_id: `I000${String(i).padStart(3, '0')}`,
    name: `王${given}`,
    surname: '王',
    given,
    gender: 'M',
    birth_date: '',
    death_date: '',
  };
  if (i > 1) {
    const fh = `f_deep_${i}`;
    deepFamilies[fh] = {
      handle: fh,
      gramps_id: `F000${String(i).padStart(3, '0')}`,
      father_handle: `h_deep_${i - 1}`,
      mother_handle: '',
      child_handles: [h],
    };
  }
}
writeTree({ tree_id: 'deep_tree', version: 1, updated_at: '2026-08-20T00:00:00.000Z', people: deepPeople, families: deepFamilies });

// ---- 口径 D（镜像归并）夹具 ----
// 数据事实对齐真源：镜像带 external_mirror='true' + external_person_handle（=真身 handle）+ external_tree（=真身所在树）；
// **真身自己也可能带 external_*（配偶指针）→ 只有 external_mirror==='true' 才是镜像判据**（下方 h_nn_spouse 即为反例）。
// nn_tree：真身所在树（guest 可见）
writeTree({
  tree_id: 'nn_tree',
  version: 1,
  people: {
    h_nn_real: {
      handle: 'h_nn_real', gramps_id: 'I000950', name: '季清昆', surname: '季', given: '清昆',
      gender: 'M', birth_date: '1935-03-03', death_date: '',
      external_person_handle: 'h_nn_spouse', external_tree: 'nn_tree', // 真身自带 external_*（配偶指针）——不得被当成镜像
    },
    h_nn_spouse: {
      handle: 'h_nn_spouse', gramps_id: 'I000951', name: '季秦氏', surname: '季', given: '秦氏',
      gender: 'F', birth_date: '', death_date: '',
      external_person_handle: 'h_nn_real', external_tree: 'nn_tree',
    },
    h_nn_id: {
      handle: 'h_nn_id', gramps_id: 'I000970', name: '季承业', surname: '季', given: '承业',
      gender: 'M', birth_date: '', death_date: '',
    },
  },
  families: {},
});

// mm_tree：镜像所在树（guest 可见，无 family 链 → 全员第 1 世）
// 顺带：镜像上**不写** external_mirror 的「疑似镜像」节点，用于验证判据不看 external_* 的存在性
writeTree({
  tree_id: 'mm_tree',
  version: 1,
  people: {
    h_mm_m1: { // M1：季清昆 的镜像（真身 nn_tree/h_nn_real，guest 可见）
      handle: 'h_mm_m1', gramps_id: 'I000960', name: '季清昆', surname: '季', given: '清昆',
      gender: 'M', birth_date: '1935-03-03', death_date: '',
      external_mirror: 'true', external_person_handle: 'h_nn_real', external_tree: 'nn_tree',
    },
    h_mm_hid: { // M2：季望舒 的镜像（真身 mdeep_tree/h_md_20，第 20 世 → guest 被裁剪）
      handle: 'h_mm_hid', gramps_id: 'I000961', name: '季望舒', surname: '季', given: '望舒',
      gender: 'M', birth_date: '1960-06-06', death_date: '',
      external_mirror: 'true', external_person_handle: 'h_md_20', external_tree: 'mdeep_tree',
    },
    h_mm_id: { // M3：季承业 的镜像（编号 I000971 被精确命中）
      handle: 'h_mm_id', gramps_id: 'I000971', name: '季承业', surname: '季', given: '承业',
      gender: 'M', birth_date: '', death_date: '',
      external_mirror: 'true', external_person_handle: 'h_nn_id', external_tree: 'nn_tree',
    },
    h_mm_fake: { // 反例：非镜像节点（无 external_mirror），即便名字与上面的人无关也不得被折叠
      handle: 'h_mm_fake', gramps_id: 'I000962', name: '季独行', surname: '季', given: '独行',
      gender: 'M', birth_date: '', death_date: '',
    },
  },
  families: {},
});

// mdeep_tree：20 世链，真身 h_md_20（季望舒）在第 20 世 → guest 不可见（hide_tail=18 → 可见 1–2 世）
const MDEEP_N = 20;
const mdeepPeople = {};
const mdeepFamilies = {};
for (let i = 1; i <= MDEEP_N; i++) {
  const h = `h_md_${i}`;
  mdeepPeople[h] = {
    handle: h,
    gramps_id: `I000${700 + i}`,
    name: i === MDEEP_N ? '季望舒' : `季望${i}`,
    surname: '季',
    given: i === MDEEP_N ? '望舒' : `望${i}`,
    gender: 'M',
    birth_date: '',
    death_date: '',
  };
  if (i > 1) {
    const fh = `f_md_${i}`;
    mdeepFamilies[fh] = {
      handle: fh,
      gramps_id: `F000${700 + i}`,
      father_handle: `h_md_${i - 1}`,
      mother_handle: '',
      child_handles: [h],
    };
  }
}
writeTree({ tree_id: 'mdeep_tree', version: 1, people: mdeepPeople, families: mdeepFamilies });

// pp_tree / qq_tree：两个**不同真身同名**（傅明远），彼此无任何镜像关系 → 不得按姓名合并
writeTree({
  tree_id: 'pp_tree',
  version: 1,
  people: {
    h_pp_same: {
      handle: 'h_pp_same', gramps_id: 'I000980', name: '傅明远', surname: '傅', given: '明远',
      gender: 'M', birth_date: '', death_date: '',
    },
  },
  families: {},
});
writeTree({
  tree_id: 'qq_tree',
  version: 1,
  people: {
    h_qq_same: {
      handle: 'h_qq_same', gramps_id: 'I000981', name: '傅明远', surname: '傅', given: '明远',
      gender: 'M', birth_date: '', death_date: '',
    },
  },
  families: {},
});

// ---- 口径 D-2（假受限修复）夹具 ----
// N1：编号精确命中**镜像**，真身对访问者可见 → 代表必须取真身（不得报 restricted=true 的假受限）
writeTree({
  tree_id: 'n1_tree',
  version: 1,
  people: {
    h_n1_m: {
      handle: 'h_n1_m', gramps_id: 'I000991', name: '岳千山', surname: '岳', given: '千山',
      gender: 'M', birth_date: '1940-02-02', death_date: '',
      external_mirror: 'true', external_person_handle: 'h_n1_r', external_tree: 'n1r_tree',
    },
  },
  families: {},
});
writeTree({
  tree_id: 'n1r_tree',
  version: 1,
  people: {
    h_n1_r: {
      handle: 'h_n1_r', gramps_id: 'I000992', name: '岳千山', surname: '岳', given: '千山',
      gender: 'M', birth_date: '1940-02-02', death_date: '',
    },
  },
  families: {},
});

// N3：三级镜像链 A(n3a_tree,镜像) → B(n3b_tree,镜像) → C(n3c_tree,真身，第 20 世)
// A/B 是浅树（无 families → 第 1 世，任何访客可见）；C 在 20 世深树 → guest 不可见、本树成员可见
writeTree({
  tree_id: 'n3a_tree',
  version: 1,
  people: {
    h_n3_a: {
      handle: 'h_n3_a', gramps_id: 'I000993', name: '龙云舟', surname: '龙', given: '云舟',
      gender: 'M', birth_date: '', death_date: '',
      external_mirror: 'true', external_person_handle: 'h_n3_b', external_tree: 'n3b_tree',
    },
  },
  families: {},
});
writeTree({
  tree_id: 'n3b_tree',
  version: 1,
  people: {
    h_n3_b: {
      handle: 'h_n3_b', gramps_id: 'I000994', name: '龙云舟', surname: '龙', given: '云舟',
      gender: 'M', birth_date: '', death_date: '',
      external_mirror: 'true', external_person_handle: 'h_n3_c', external_tree: 'n3c_tree',
    },
  },
  families: {},
});
const N3C_N = 20;
const n3cPeople = {};
const n3cFamilies = {};
for (let i = 1; i <= N3C_N; i++) {
  const isC = i === N3C_N;
  const h = isC ? 'h_n3_c' : `h_n3c_${i}`;
  n3cPeople[h] = {
    handle: h,
    gramps_id: isC ? 'I000995' : `I001${String(i).padStart(3, '0')}`,
    name: isC ? '龙云舟' : `龙云${i}`,
    surname: '龙',
    given: isC ? '云舟' : `云${i}`,
    gender: 'M',
    birth_date: '',
    death_date: '',
  };
  if (i > 1) {
    const fh = `f_n3c_${i}`;
    n3cFamilies[fh] = {
      handle: fh,
      gramps_id: `F001${String(i).padStart(3, '0')}`,
      father_handle: `h_n3c_${i - 1}`,
      mother_handle: '',
      child_handles: [h],
    };
  }
}
writeTree({ tree_id: 'n3c_tree', version: 1, people: n3cPeople, families: n3cFamilies });

// N4：环状镜像 A → B → A（两侧都不是真身）→ 不得抛、不得死循环
writeTree({
  tree_id: 'n4a_tree',
  version: 1,
  people: {
    h_n4_a: {
      handle: 'h_n4_a', gramps_id: 'I000996', name: '花无涯', surname: '花', given: '无涯',
      gender: 'M', birth_date: '', death_date: '',
      external_mirror: 'true', external_person_handle: 'h_n4_b', external_tree: 'n4b_tree',
    },
  },
  families: {},
});
writeTree({
  tree_id: 'n4b_tree',
  version: 1,
  people: {
    h_n4_b: {
      handle: 'h_n4_b', gramps_id: 'I000997', name: '花无涯', surname: '花', given: '无涯',
      gender: 'M', birth_date: '', death_date: '',
      external_mirror: 'true', external_person_handle: 'h_n4_a', external_tree: 'n4a_tree',
    },
  },
  families: {},
});

// N5：两个不同真身同名（无镜像关系）→ 各自成条
writeTree({
  tree_id: 'n5a_tree',
  version: 1,
  people: {
    h_n5_a: {
      handle: 'h_n5_a', gramps_id: 'I000998', name: '慕容怀', surname: '慕容', given: '怀',
      gender: 'M', birth_date: '', death_date: '',
    },
  },
  families: {},
});
writeTree({
  tree_id: 'n5b_tree',
  version: 1,
  people: {
    h_n5_b: {
      handle: 'h_n5_b', gramps_id: 'I000999', name: '慕容怀', surname: '慕容', given: '怀',
      gender: 'M', birth_date: '', death_date: '',
    },
  },
  families: {},
});

// ---- 互动事件集合（口径 A）----
// aa_tree：join 2 + marriage(from_tree) 1 + clan(decided_at 回退) 1 = 4；founder 的 tree_id 是 zz_tree（master_tree_id=aa_tree 不计入）
writeCol('jiazu_join_requests', [
  { _id: 'JR_1', tree_id: 'aa_tree', created_at: ago(1) },
  { _id: 'JR_2', tree_id: 'aa_tree', created_at: ago(29) },
]);
writeCol('jiazu_marriage_requests', [
  { _id: 'MR_1', from_tree: 'aa_tree', to_tree: 'zz_tree', created_at: ago(2) },
]);
writeCol('jiazu_founder_requests', [
  { _id: 'FR_1', tree_id: 'zz_tree', master_tree_id: 'aa_tree', created_at: ago(3) },
]);
writeCol('jiazu_clan_requests', [
  { _id: 'CR_1', tree_id: 'aa_tree', created_at: '', decided_at: ago(5) },
  { _id: 'CR_2', tree_id: 'aa_tree' }, // 时间字段全缺 → 不计入
]);
// 独立集合缺失对照：jiazu_* 之外不写，treeActivity 对不存在的树恒 0

// ---- 口径 D-2 · N3 成员可见性：登录用户锚定 n3c_tree（= 真身 C 所在树）→ 该树 full 可见 ----
const N3_MEMBER = '17700001234';
writeCol('jiazu_users', [
  { _id: N3_MEMBER, phone: N3_MEMBER, nickname: '龙氏成员', role: 'user' },
]);
writeCol('jiazu_anchors', [
  { _id: N3_MEMBER, phone: N3_MEMBER, tree_id: 'n3c_tree', person_handle: 'h_n3_c' },
]);

const { handleRequest } = await import('../index.js');
const ta = await import('./tree-activity.js');
const { signJwt } = await import('./auth.js');
/** 已登录请求头（角色 + 锚点树决定节点级可见分层；no anchor → 隐藏 9 世） */
const bearer = (phone = N3_MEMBER, role = 'user') => ({
  authorization: `Bearer ${signJwt({ sub: phone, phone, role }, 3600)}`,
});

const call = (p, { method = 'GET', headers = {}, query, body } = {}) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: query,
    body: body ? JSON.stringify(body) : undefined,
  });
const json = async (p, opts) => {
  const res = await call(p, opts);
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

// ================= A. 活跃度内核（纯函数） =================

test('A1 countRecentEvents：窗口内 3 条 + 40 天前 1 条 → 3；恰好 30 天边界计入；时间字段全缺不计', () => {
  const now = new Date('2026-09-17T00:00:00.000Z');
  const at = (days) => new Date(now.getTime() - days * DAY).toISOString();
  const records = [
    { tree_id: 'T', created_at: at(0) },
    { tree_id: 'T', created_at: at(10) },
    { tree_id: 'T', created_at: at(29.5) },
    { tree_id: 'T', created_at: at(40) }, // 窗口外
    { tree_id: 'T' }, // 时间字段全缺 → 不计入
    { tree_id: 'T', created_at: '不是时间', ts: '' }, // 无法解析 → 不计入
    { tree_id: 'OTHER', created_at: at(1) }, // 非本树 → 不计入
  ];
  assert.equal(ta.countRecentEvents(records, 'T', now), 3, '窗口内应恰好 3 条');

  // 恰好 30 天（含等号边界）→ 计入
  const boundary = [{ tree_id: 'T', created_at: new Date(now.getTime() - 30 * DAY).toISOString() }];
  assert.equal(ta.countRecentEvents(boundary, 'T', now), 1, 't === now - 30d 必须计入（含等号边界）');
  const justOutside = [{ tree_id: 'T', created_at: new Date(now.getTime() - 30 * DAY - 1).toISOString() }];
  assert.equal(ta.countRecentEvents(justOutside, 'T', now), 0, '早 1ms 即窗口外');

  // 时间字段取值顺序：created_at → ts → handled_at → decided_at
  assert.equal(ta.countRecentEvents([{ tree_id: 'T', ts: at(1) }], 'T', now), 1, 'created_at 缺 → 取 ts');
  assert.equal(ta.countRecentEvents([{ tree_id: 'T', handled_at: at(1) }], 'T', now), 1, '再缺 → 取 handled_at');
  assert.equal(ta.countRecentEvents([{ tree_id: 'T', decided_at: at(1) }], 'T', now), 1, '再缺 → 取 decided_at');
  assert.equal(ta.countRecentEvents([{ tree_id: 'T', created_at: '', ts: '', handled_at: '', decided_at: '' }], 'T', now), 0);
  assert.equal(ta.countRecentEvents([], 'T', now), 0, '空集合 → 0');
  assert.equal(ta.countRecentEvents(null, 'T', now), 0, 'null 记录集 → 0（不抛）');
});

test('A2 eventTrees：tree_id / from_tree / to_tree 非空去重；婚姻记录对 from_tree 与 to_tree 各计 1', () => {
  const rec = { _id: 'MR_1', from_tree: 'A', to_tree: 'B', created_at: ago(1) };
  assert.deepEqual(ta.eventTrees(rec), ['A', 'B'], '两棵树各出现一次');
  assert.deepEqual(ta.eventTrees({ tree_id: 'A', from_tree: 'A', to_tree: '' }), ['A'], '非空去重');
  assert.deepEqual(ta.eventTrees({ tree_id: '', from_tree: '', to_tree: '' }), [], '全空 → []');
  assert.deepEqual(ta.eventTrees({}), [], '字段全缺 → []');

  const now = new Date();
  assert.equal(ta.countRecentEvents([rec], 'A', now), 1, 'from_tree 侧 +1');
  assert.equal(ta.countRecentEvents([rec], 'B', now), 1, 'to_tree 侧 +1（同一条记录）');
  assert.equal(ta.countRecentEvents([rec], 'C', now), 0, '无关树 → 0');
});

test('A3 treeActivity：读 4 个集合求和（master_tree_id 不计入、时间字段回退、集合缺失/未知树恒 0 不抛）', async () => {
  assert.equal(await ta.treeActivity('aa_tree'), 4, 'aa_tree = join 2 + marriage 1 + clan(decided_at) 1');
  assert.equal(await ta.treeActivity('zz_tree'), 2, 'zz_tree = marriage(to_tree) 1 + founder 1');
  assert.equal(await ta.treeActivity('ghost_tree'), 0, 'meta 无关树 → 0');
  assert.equal(await ta.treeActivity('no_such_tree'), 0, '无数据 → 0');
  assert.equal(await ta.treeActivity(''), 0, '空 tree_id → 0');
  assert.equal(await ta.treeActivity(undefined), 0, 'undefined → 0');
  // master_tree_id 不计入的直接证据：FR_1 的 master_tree_id 是 aa_tree，但 aa_tree 计数已由上面口径固定
  assert.equal(
    ta.countRecentEvents([{ tree_id: 'zz_tree', master_tree_id: 'aa_tree', created_at: ago(1) }], 'aa_tree', new Date()),
    0,
    'master_tree_id 不参与活跃度',
  );
});

// ================= A. /tree/rank 出参扩展 =================

test('C1 /tree/rank：新增 activity / updated_at，且既有字段逐字段仍在（一个不许少）', async () => {
  const { status, body } = await json('/tree/rank', { headers: { 'X-Tree-Id': 'aa_tree' } });
  assert.equal(status, 200);
  assert.equal(body.activity, 4, 'activity = 近 30 天与该树相关的互动事件数');
  assert.equal(body.updated_at, '2026-09-01T00:00:00.000Z', 'updated_at 取树 JSON 原值');

  // 既有字段逐字段存在断言（不是「包含」）
  assert.equal(body.tree_id, 'aa_tree');
  assert.equal(typeof body.total_generations, 'number');
  assert.equal(typeof body.rank_key, 'string');
  assert.equal(typeof body.rank_label, 'string');
  assert.equal(typeof body.rank_en, 'string');
  assert.equal(typeof body.rank_desc, 'string');
  assert.equal(typeof body.over_limit, 'boolean');
  assert.equal(typeof body.max_depth, 'number');
  assert.equal(typeof body.root_count, 'number');
  assert.equal(typeof body.person_count, 'number');
  assert.equal(typeof body.explicit, 'boolean');
  assert.ok(body.access && typeof body.access === 'object', 'access 元信息仍在');
  assert.equal(typeof body.access.mode, 'string');
  assert.equal(typeof body.access.hide_tail, 'number');
  assert.equal(typeof body.access.is_master, 'boolean');
  assert.equal(typeof body.access.member, 'boolean');
  assert.equal(typeof body.access.login_required, 'boolean');
  assert.equal(typeof body.access.clamped, 'boolean');
  assert.ok('visible_max_depth' in body.access, 'access.visible_max_depth 仍在');
  assert.equal(body.person_count, 2, 'person_count 口径未变');
  assert.equal(body.rank_key, 'family_rank', '浅树 = 家乘级（原有口径）');
});

test('C2 /tree/rank：树 JSON 无 updated_at → 空串；activity 对无互动树 → 0', async () => {
  const { status, body } = await json('/tree/rank', { headers: { 'X-Tree-Id': 'bb_tree' } });
  assert.equal(status, 200);
  assert.equal(body.updated_at, '', '缺失 updated_at → 空串');
  assert.equal(body.activity, 0, 'bb_tree 无互动记录 → 0');
  const bad = await json('/tree/rank'); // 无 X-Tree-Id → 既有闸门照旧 400
  assert.equal(bad.status, 400);
});

// ================= B. /search/global =================

test('B1 /search/global：全局编号命中置顶且 matched == "id"（不被 tree_id 字典序抢先）', async () => {
  const { status, body } = await json('/search/global', { query: { query: '000123' } });
  assert.equal(status, 200);
  assert.equal(body[0].tree_id, 'zz_tree', '置顶的是编号命中（zz_tree 字典序最后）');
  assert.equal(body[0].handle, 'h_zz_123');
  assert.equal(body[0].gramps_id, 'I000123');
  assert.equal(body[0].matched, 'id');
  assert.equal(body[0].tree_title, '支氏宗谱');
  assert.equal(body[0].name, '支小五');
  assert.equal(body[0].birth_date, '1950-05-05');
  assert.equal(body[0].death_date, '2000-01-01');
  assert.equal(body[0].gender, 'M');
  // 其余 id 命中（aa_tree 的树内旧号 I123 数值等价）仍在，排在其后
  const aa = body.find((x) => x.handle === 'h_aa_123');
  assert.ok(aa, 'aa_tree 的 I123 也应被编号等价命中');
  assert.equal(aa.matched, 'id');
  assert.ok(body.indexOf(aa) > 0, '非置顶命中排在置顶命中之后');

  // 同一编号的三种写法都应命中 I000123
  for (const q of ['I000123', '123']) {
    const r = await json('/search/global', { query: { query: q } });
    assert.equal(r.status, 200);
    assert.ok(r.body.some((x) => x.gramps_id === 'I000123'), `query=${q} 应命中 I000123`);
  }

  // 不需要 X-Tree-Id（且未被树编辑闸门拦成 400）
  assert.notEqual(body.error, '缺少 X-Tree-Id');
});

test('B2 /search/global：姓名包含命中 + tree_title 正确（大小写/空格不敏感）', async () => {
  const { status, body } = await json('/search/global', { query: { query: '三三' } });
  assert.equal(status, 200);
  assert.equal(body.length, 1, '仅 aa_tree 张三三命中');
  assert.equal(body[0].handle, 'h_aa_name');
  assert.equal(body[0].name, '张三三');
  assert.equal(body[0].tree_title, '甲氏宗谱', 'tree_title = meta.display_title');
  assert.equal(body[0].tree_id, 'aa_tree');
  assert.equal(body[0].matched, 'name');
  assert.equal(body[0].gramps_id, 'I000900');
  assert.equal(body[0].birth_date, '1900-01-01');
  assert.equal(body[0].death_date, '', '原字段缺失 → 空串');

  // 空格 + 大小写不敏感
  const spaced = await json('/search/global', { query: { query: ' 三 三 ' } });
  assert.equal(spaced.status, 200);
  assert.ok(spaced.body.some((x) => x.handle === 'h_aa_name'), '去空格后仍应命中');

  // surname / given 各自独立命中
  assert.ok((await json('/search/global', { query: { query: '支小' } })).body.some((x) => x.handle === 'h_zz_123'));
  assert.ok((await json('/search/global', { query: { query: '小五' } })).body.some((x) => x.handle === 'h_zz_123'));
});

test('B3 /search/global：guest 被节点级可见分层隐藏的节点不出现，可见节点照常返回', async () => {
  // guest（无 JWT）在 20 世深树上隐藏树梢 18 世 → 第 20 世「王深深」不可见、第 1 世「王深根」可见
  const hidden = await json('/search/global', { query: { query: '深深' } });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.length, 0, '被隐藏 handle 不得出现在结果中');
  assert.ok(!hidden.body.some((x) => x.handle === `h_deep_${DEEP_N}`), '被隐藏 handle 不在结果');

  const visible = await json('/search/global', { query: { query: '深根' } });
  assert.equal(visible.status, 200);
  assert.ok(visible.body.some((x) => x.handle === 'h_deep_1'), '可见 handle 应在结果中');
  assert.equal(visible.body.find((x) => x.handle === 'h_deep_1').tree_title, '深树宗谱');

  // 中层（第 10 世）同样被 guest 裁剪
  const mid = await json('/search/global', { query: { query: '深10' } });
  assert.equal(mid.status, 200);
  assert.equal(mid.body.length, 0, '第 10 世（>2）对 guest 不可见');
});

test('B4 /search/global：空 query → []；limit 生效并 clamp 到 1..100', async () => {
  assert.deepEqual((await json('/search/global', { query: { query: '' } })).body, []);
  assert.deepEqual((await json('/search/global', { query: { query: '   ' } })).body, []);
  assert.deepEqual((await json('/search/global', { query: {} })).body, []);

  const all = await json('/search/global', { query: { query: '深' } });
  assert.equal(all.status, 200);
  assert.equal(all.body.length, 2, 'guest 在深树上仅见第 1、2 世（可见 2 世）');

  const one = await json('/search/global', { query: { query: '深', limit: '1' } });
  assert.equal(one.body.length, 1, 'limit=1 生效');
  const zero = await json('/search/global', { query: { query: '深', limit: '0' } });
  assert.equal(zero.body.length, 1, 'limit=0 clamp 到 1');
  const huge = await json('/search/global', { query: { query: '深', limit: '9999' } });
  assert.ok(huge.body.length <= 100, 'limit clamp 上限 100');
  const bad = await json('/search/global', { query: { query: '深', limit: 'abc' } });
  assert.equal(bad.body.length, 2, '非法 limit → 默认 30');
});

test('B5 /search/global：meta 登记了 tree_id 但无树文件 → 不 500，其余树结果照常返回', async () => {
  const { status, body } = await json('/search/global', { query: { query: '三三' } });
  assert.equal(status, 200, '幽灵 tree_id 不得让整站搜索 500');
  assert.ok(body.some((x) => x.tree_id === 'aa_tree'), '其余树结果照常返回');
  assert.ok(!body.some((x) => x.tree_id === 'ghost_tree'), '无树文件的 tree_id 不得出现在结果');

  // 幽灵树也不参与编号扫描
  const byId = await json('/search/global', { query: { query: 'I000123' } });
  assert.equal(byId.status, 200);
  assert.ok(!byId.body.some((x) => x.tree_id === 'ghost_tree'));

  // 真正不存在的路径仍 404（路由未兜底吞掉；带 X-Tree-Id 以越过树编辑闸门）
  assert.equal((await call('/search/nope', { headers: { 'X-Tree-Id': 'aa_tree' } })).statusCode, 404);
});

// ================= M. /search/global · 镜像归并（口径 D） =================

/** 出参字段全集（口径 D · 第 3/4 条：只新增 restricted，不得新增镜像计数 / 附注字段） */
const RESULT_KEYS = ['birth_date', 'death_date', 'gender', 'gramps_id', 'handle', 'matched', 'name', 'restricted', 'tree_id', 'tree_title'];

test('M1 /search/global：真身 + 同名镜像 → 恰好 1 条（取真身，restricted=false，不夹带镜像信息）', async () => {
  const { status, body } = await json('/search/global', { query: { query: '季清昆' } });
  assert.equal(status, 200);
  assert.equal(body.length, 1, '真身 + 镜像 = 同一人 → 只出一条');
  const it = body[0];
  assert.equal(it.tree_id, 'nn_tree', '取真身所在树');
  assert.equal(it.handle, 'h_nn_real');
  assert.equal(it.gramps_id, 'I000950');
  assert.equal(it.tree_title, '季氏本宗');
  assert.equal(it.name, '季清昆');
  assert.equal(it.matched, 'name');
  assert.equal(it.restricted, false, '真身在候选里 → restricted=false');
  assert.deepEqual(Object.keys(it).sort(), [...RESULT_KEYS].sort(), '只新增 restricted，不得新增镜像计数/附注字段');

  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('h_mm_m1'), '不得出现镜像自身 handle');
  assert.ok(!raw.includes('I000960'), '不得出现镜像自身编号');
  assert.ok(!raw.includes('mm_tree'), '不得出现镜像所在树 id');
  assert.ok(!raw.includes('external_'), '不得把 external_* 镜像内部字段透出');

  // 真身自带 external_*（配偶指针）不得被当成镜像：两名互为配偶指针的真身仍是两个人
  const spouse = await json('/search/global', { query: { query: '季秦氏' } });
  assert.equal(spouse.body.length, 1);
  assert.equal(spouse.body[0].handle, 'h_nn_spouse');
  assert.equal(spouse.body[0].restricted, false, '非镜像节点（无 external_mirror）→ restricted=false');

  // 非镜像节点（同树同姓）照常独立成条
  const solo = await json('/search/global', { query: { query: '季独行' } });
  assert.equal(solo.body.length, 1);
  assert.equal(solo.body[0].handle, 'h_mm_fake');
  assert.equal(solo.body[0].tree_id, 'mm_tree');
});

test('M2 /search/global：真身被可见分层裁剪 → 返回镜像条 + restricted=true（不泄漏真身 handle/编号/树）', async () => {
  // 先证明真身确实存在且确实被裁剪（否则本用例会「假绿」）
  const mdTree = JSON.parse(fs.readFileSync(path.join(TMP, 'trees', 'mdeep_tree.json'), 'utf8'));
  assert.equal(mdTree.people.h_md_20.name, '季望舒', '夹具：真身存在于深树第 20 世');
  assert.equal(mdTree.people.h_md_20.gramps_id, 'I000720');
  const hiddenReal = await json('/search/global', { query: { query: '季望1' } });
  assert.equal(hiddenReal.body.length, 1, 'guest 仅见深树第 1 世（第 3–20 世被裁剪）');

  const { status, body } = await json('/search/global', { query: { query: '季望舒' } });
  assert.equal(status, 200);
  assert.equal(body.length, 1, '真身被裁剪 → 只返回镜像条（1 条）');
  const it = body[0];
  assert.equal(it.tree_id, 'mm_tree', 'tree_id 取镜像自身所在树');
  assert.equal(it.handle, 'h_mm_hid', 'handle 取镜像自身');
  assert.equal(it.gramps_id, 'I000961', 'gramps_id 取镜像自身');
  assert.equal(it.tree_title, '季氏支谱', 'tree_title 取镜像自身所在树');
  assert.equal(it.name, '季望舒');
  assert.equal(it.birth_date, '1960-06-06', '生卒取镜像自身');
  assert.equal(it.restricted, true, '组内无真身（真身被可见分层裁剪）→ restricted=true');
  assert.deepEqual(Object.keys(it).sort(), [...RESULT_KEYS].sort(), '不得新增 real_tree_id 之类的字段');

  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('h_md_20'), '不得泄漏真身 handle');
  assert.ok(!raw.includes('I000720'), '不得泄漏真身 gramps_id');
  assert.ok(!raw.includes('mdeep_tree'), '不得泄漏真身所在 tree_id');
  assert.ok(!raw.includes('季氏远谱'), '不得泄漏真身所在树名');
});

test('M3 /search/global：编号精确命中镜像 → 取被命中的镜像节点且 matched=id', async () => {
  // 【口径 D-2 修订】旧断言「代表 = 被命中的镜像节点」正是假受限缺陷的同一条路径：h_mm_id 的真身 h_nn_id
  // 对该访问者（guest）可见 → 按派单口径代表必须取真身（见 N1）。用例名与 matched==='id' 断言保留，
  // 仅把代表断言改到真身上。
  for (const q of ['I000971', '000971', '971']) {
    const { status, body } = await json('/search/global', { query: { query: q } });
    assert.equal(status, 200, `query=${q}`);
    assert.equal(body.length, 1, `query=${q}：编号只指向镜像节点 → 1 条（不得再出真身第二条）`);
    assert.equal(body[0].tree_id, 'nn_tree', `query=${q}：真身可见 → 代表取真身所在树`);
    assert.equal(body[0].handle, 'h_nn_id', `query=${q}：代表 handle 取真身`);
    assert.equal(body[0].gramps_id, 'I000970', `query=${q}：代表编号取真身`);
    assert.equal(body[0].matched, 'id', `query=${q}：编号精确命中 → matched=id`);
    assert.equal(body[0].restricted, false, `query=${q}：真身可见 → 不得报假受限`);
    assert.ok(!JSON.stringify(body).includes('h_mm_id'), `query=${q}：不得出现镜像 handle`);
    assert.ok(!JSON.stringify(body).includes('I000971'), `query=${q}：不得出现镜像编号`);
  }

  // 真身（季承业，nn_tree）也能被姓名检索到 —— 证明上面的 1 条不是「真身不存在」
  const real = await json('/search/global', { query: { query: '季承业' } });
  assert.equal(real.body.length, 1, '真身 + 其镜像 → 归并为 1 条');
  assert.equal(real.body[0].tree_id, 'nn_tree');
  assert.equal(real.body[0].handle, 'h_nn_id');
  assert.equal(real.body[0].restricted, false);
  const raw = JSON.stringify(real.body);
  assert.ok(!raw.includes('h_mm_id') && !raw.includes('I000971'), '不得出现镜像 handle / 编号');
});

test('M4 /search/global：两个不同真身同名（无镜像关系）→ 仍返回 2 条（不得按姓名合并）', async () => {
  const { status, body } = await json('/search/global', { query: { query: '傅明远' } });
  assert.equal(status, 200);
  assert.equal(body.length, 2, '姓名相同但归并键（handle）不同 → 不得合并');
  assert.deepEqual(body.map((x) => x.handle).sort(), ['h_pp_same', 'h_qq_same']);
  assert.deepEqual(body.map((x) => x.tree_id).sort(), ['pp_tree', 'qq_tree']);
  assert.ok(body.every((x) => x.restricted === false), '两条都是真身');
  assert.ok(body.every((x) => x.matched === 'name'));
});

test('M5 /search/global：先归并、后截断 —— 同一人不占两个名额，limit 仍生效', async () => {
  // 未归并时「季清昆」= 真身 + 镜像 = 2 条；limit=2 下必须仍只有 1 条（同一人不占两名额）
  const two = await json('/search/global', { query: { query: '季清昆', limit: '2' } });
  assert.equal(two.body.length, 1, 'limit=2：归并后同一人只占 1 个名额');
  assert.equal(two.body[0].handle, 'h_nn_real');

  // 跨人检索：limit 在归并之后截断；同姓多人互不折叠
  const all = await json('/search/global', { query: { query: '季' } });
  assert.equal(all.body.length, 7, '归并后「季」可见人 = 7（季望1/季望2/季清昆/季承业/季独行/季秦氏 + 季望舒镜像）');
  const handles = all.body.map((x) => x.handle);
  assert.equal(new Set(handles).size, handles.length, '同一人不得出现两条');
  assert.ok(!handles.includes('h_mm_m1'), '镜像条不得与真身同时出现');
  assert.ok(!handles.includes('h_mm_id'), '镜像条不得与真身同时出现');
  assert.ok(handles.includes('h_mm_hid'), '真身不可见时镜像条必须在');

  const one = await json('/search/global', { query: { query: '季', limit: '1' } });
  assert.equal(one.body.length, 1, 'limit=1 生效（归并后截断）');
  const three = await json('/search/global', { query: { query: '季', limit: '3' } });
  assert.equal(three.body.length, 3, 'limit=3 生效');
  const big = await json('/search/global', { query: { query: '季', limit: '100' } });
  assert.equal(big.body.length, 7, 'limit 不改变归并结果条数');
});

// ================= N. /search/global · 递归真身 + 真身可见性直判（口径 D-2 · 假受限修复） =================

test('N1 /search/global：编号精确命中镜像 + 真身对访问者可见 → 恰好 1 条，代表取真身、restricted=false', async () => {
  // 夹具自证（防假绿）：镜像 I000991（岳千山）指向真身 n1r_tree/h_n1_r（I000992），两者对 guest 都可见
  const m = JSON.parse(fs.readFileSync(path.join(TMP, 'trees', 'n1_tree.json'), 'utf8'));
  assert.equal(m.people.h_n1_m.external_mirror, 'true');
  assert.equal(m.people.h_n1_m.external_person_handle, 'h_n1_r');
  assert.equal(m.people.h_n1_m.external_tree, 'n1r_tree');

  for (const q of ['I000991', '000991', '991']) {
    const { status, body } = await json('/search/global', { query: { query: q } });
    assert.equal(status, 200, `query=${q}`);
    assert.equal(body.length, 1, `query=${q}：同一人只出一条`);
    const it = body[0];
    assert.equal(it.tree_id, 'n1r_tree', `query=${q}：代表必须取真身所在树（编号只命中镜像也不得留在镜像树）`);
    assert.equal(it.handle, 'h_n1_r', `query=${q}：代表 handle 取真身`);
    assert.equal(it.gramps_id, 'I000992', `query=${q}：代表编号取真身`);
    assert.equal(it.tree_title, '岳氏本宗', `query=${q}：tree_title 取真身所在树`);
    assert.equal(it.name, '岳千山');
    assert.equal(it.matched, 'id', `query=${q}：保留原命中类型（编号命中）`);
    assert.equal(it.restricted, false, `query=${q}：真身对当前访问者可见 → 不得报假受限`);
    assert.deepEqual(Object.keys(it).sort(), [...RESULT_KEYS].sort(), '不得新增字段');
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes('h_n1_m'), '不得泄漏镜像 handle');
    assert.ok(!raw.includes('I000991'), '不得泄漏镜像编号');
    assert.ok(!raw.includes('n1_tree'), '不得泄漏镜像所在 tree_id');
    assert.ok(!raw.includes('external_'), '不得透出 external_* 内部字段');
  }

  // 姓名路径同理：镜像与真身同时命中 → 仍 1 条且取真身
  const byName = await json('/search/global', { query: { query: '岳千山' } });
  assert.equal(byName.status, 200);
  assert.equal(byName.body.length, 1);
  assert.equal(byName.body[0].handle, 'h_n1_r');
  assert.equal(byName.body[0].restricted, false);
});

test('N2 /search/global：真身不可见 + 镜像可见 → 代表=镜像、restricted=true，响应不含真身任何信息', async () => {
  // 沿用 mdeep_tree 夹具：镜像 h_mm_hid（I000961）指向真身 mdeep_tree/h_md_20（第 20 世 → guest 被裁剪）
  const mdTree = JSON.parse(fs.readFileSync(path.join(TMP, 'trees', 'mdeep_tree.json'), 'utf8'));
  assert.equal(mdTree.people.h_md_20.name, '季望舒', '夹具：真身存在（第 20 世）');
  assert.equal(mdTree.tree_id, 'mdeep_tree');

  // ① 编号只命中镜像（h_mm_hid 自己的编号）
  for (const q of ['I000961', '961']) {
    const { status, body } = await json('/search/global', { query: { query: q } });
    assert.equal(status, 200, `query=${q}`);
    assert.equal(body.length, 1, `query=${q}：真身被裁剪 → 只出一条镜像条`);
    const it = body[0];
    assert.equal(it.tree_id, 'mm_tree', `query=${q}：代表保持镜像所在树`);
    assert.equal(it.handle, 'h_mm_hid', `query=${q}：代表保持镜像 handle`);
    assert.equal(it.gramps_id, 'I000961', `query=${q}：代表保持镜像编号`);
    assert.equal(it.tree_title, '季氏支谱', `query=${q}：tree_title 取镜像所在树`);
    assert.equal(it.matched, 'id');
    assert.equal(it.restricted, true, `query=${q}：真身不可见 → restricted=true`);
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes('h_md_20'), `query=${q}：不得泄漏真身 handle`);
    assert.ok(!raw.includes('I000720'), `query=${q}：不得泄漏真身 gramps_id`);
    assert.ok(!raw.includes('mdeep_tree'), `query=${q}：不得泄漏真身 tree_id`);
    assert.ok(!raw.includes('季氏远谱'), `query=${q}：不得泄漏真身 tree_title`);
  }

  // ② 姓名路径：镜像可见、真身被裁剪 → 同样只出镜像条
  const byName = await json('/search/global', { query: { query: '季望舒' } });
  assert.equal(byName.body.length, 1);
  assert.equal(byName.body[0].handle, 'h_mm_hid');
  assert.equal(byName.body[0].restricted, true);
  assert.ok(!JSON.stringify(byName.body).includes('mdeep_tree'));
});

test('N3 /search/global：三级镜像链 A→B→C —— 只出 1 条；C 可见取 C，C 不可见取镜像', async () => {
  // 夹具自证：A(n3a) → B(n3b) → C(n3c)，B 自身也是镜像（链长 3）
  const a = JSON.parse(fs.readFileSync(path.join(TMP, 'trees', 'n3a_tree.json'), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.join(TMP, 'trees', 'n3b_tree.json'), 'utf8'));
  assert.equal(a.people.h_n3_a.external_person_handle, 'h_n3_b');
  assert.equal(b.people.h_n3_b.external_mirror, 'true', '中间节点 B 也是镜像（三级链）');
  assert.equal(b.people.h_n3_b.external_person_handle, 'h_n3_c');

  // ① 访问者可见 C（本树成员：锚定 n3c_tree → full）
  const memberName = await json('/search/global', { query: { query: '龙云舟' }, headers: bearer() });
  assert.equal(memberName.status, 200);
  assert.equal(memberName.body.length, 1, '三级链 → 同一人只出 1 条');
  assert.equal(memberName.body[0].handle, 'h_n3_c', 'C 可见 → 代表 = C');
  assert.equal(memberName.body[0].tree_id, 'n3c_tree');
  assert.equal(memberName.body[0].gramps_id, 'I000995');
  assert.equal(memberName.body[0].restricted, false);
  assert.equal(memberName.body[0].matched, 'name');

  const memberId = await json('/search/global', { query: { query: 'I000993' }, headers: bearer() });
  assert.equal(memberId.body.length, 1, '编号只命中镜像 A，真身 C 可见 → 仍只出 1 条');
  assert.equal(memberId.body[0].handle, 'h_n3_c', 'C 可见 → 代表跨链取 C（即使编号只命中一级镜像）');
  assert.equal(memberId.body[0].tree_id, 'n3c_tree');
  assert.equal(memberId.body[0].gramps_id, 'I000995');
  assert.equal(memberId.body[0].matched, 'id');
  assert.equal(memberId.body[0].restricted, false);

  // ② 访问者不可见 C（guest：C 在第 20 世）→ 代表 = 镜像，restricted=true，不泄漏 C
  const guestName = await json('/search/global', { query: { query: '龙云舟' } });
  assert.equal(guestName.body.length, 1, 'guest 只见 A/B → 归并后 1 条');
  assert.equal(guestName.body[0].tree_id, 'n3a_tree', '代表 = 组内 tree_id 字典序最前的镜像 A');
  assert.equal(guestName.body[0].handle, 'h_n3_a');
  assert.equal(guestName.body[0].restricted, true, 'C 不可见 → restricted=true');

  const guestId = await json('/search/global', { query: { query: 'I000993' } });
  assert.equal(guestId.body.length, 1);
  assert.equal(guestId.body[0].handle, 'h_n3_a');
  assert.equal(guestId.body[0].matched, 'id');
  assert.equal(guestId.body[0].restricted, true);
  const raw = JSON.stringify(guestId.body) + JSON.stringify(guestName.body);
  assert.ok(!raw.includes('h_n3_c'), '不得泄漏真身 handle');
  assert.ok(!raw.includes('I000995'), '不得泄漏真身 gramps_id');
  assert.ok(!raw.includes('n3c_tree'), '不得泄漏真身 tree_id');
  assert.ok(!raw.includes('龙氏深处'), '不得泄漏真身 tree_title');
});

test('N4 /search/global：环状镜像（A→B→A）→ 不抛、不死循环、结果确定', async () => {
  // 环上没有真身 → 递归解析在环处收敛（不得无限展开）
  const byName = await json('/search/global', { query: { query: '花无涯' } });
  assert.equal(byName.status, 200, '环状镜像不得让请求抛错/挂死');
  assert.equal(byName.body.length, 2, '两侧都不是真身 → 各留一条（每条 restricted=true）');
  assert.deepEqual(byName.body.map((x) => x.handle).sort(), ['h_n4_a', 'h_n4_b']);
  assert.ok(byName.body.every((x) => x.restricted === true), '解析不到真身 → restricted=true');
  assert.ok(byName.body.every((x) => x.matched === 'name'));

  // 编号路径同样收敛
  for (const [q, h] of [['I000996', 'h_n4_a'], ['I000997', 'h_n4_b']]) {
    const r = await json('/search/global', { query: { query: q } });
    assert.equal(r.status, 200, `query=${q}`);
    assert.equal(r.body.length, 1, `query=${q}：只出被命中的镜像条`);
    assert.equal(r.body[0].handle, h);
    assert.equal(r.body[0].restricted, true);
  }

  // 确定性：连查两次结果完全一致
  const again = await json('/search/global', { query: { query: '花无涯' } });
  assert.deepEqual(again.body, byName.body, '同一输入两次结果必须逐字节一致');
});

test('N5 /search/global：两个不同真身同名（无镜像关系）→ 仍 2 条（不得按姓名合并）', async () => {
  const { status, body } = await json('/search/global', { query: { query: '慕容怀' } });
  assert.equal(status, 200);
  assert.equal(body.length, 2, '姓名相同但各自是真身（归并键 = 各自 handle）→ 不得合并');
  assert.deepEqual(body.map((x) => x.handle).sort(), ['h_n5_a', 'h_n5_b']);
  assert.deepEqual(body.map((x) => x.tree_id).sort(), ['n5a_tree', 'n5b_tree']);
  assert.ok(body.every((x) => x.restricted === false), '两条都是真身 → restricted=false');
  assert.ok(body.every((x) => x.matched === 'name'));
});

// ================= C. 家族树资金 / 转账下线 =================

test('D1 /wallet/transfer 与 /wallet/tree-balance → 410 + code=TREE_FUND_RETIRED（在任何鉴权/参数校验之前）', async () => {
  const t = await json('/wallet/transfer', { method: 'POST', body: { tree_id: 'aa_tree', amount: 10 } });
  assert.equal(t.status, 410);
  assert.equal(t.body.error, '家族树资金功能已下线');
  assert.equal(t.body.code, 'TREE_FUND_RETIRED');

  const b = await json('/wallet/tree-balance', { query: { tree_id: 'aa_tree' } });
  assert.equal(b.status, 410);
  assert.equal(b.body.error, '家族树资金功能已下线');
  assert.equal(b.body.code, 'TREE_FUND_RETIRED');

  // 未登录也拿 410（不是 401）；缺参数也拿 410（不是 400）
  const anon = await json('/wallet/transfer', { method: 'POST', body: {} });
  assert.equal(anon.status, 410, '无 body / 无 token 也必须 410');
  const noTree = await json('/wallet/tree-balance', { query: {} });
  assert.equal(noTree.status, 410, '缺 tree_id 也必须 410');
});

test('D2 lib/wallet.js：transferToTree / getTreeBalance 已删除，deductTreeCreateFee 保留', async () => {
  const wallet = await import('./wallet.js');
  assert.equal(wallet.transferToTree, undefined, 'transferToTree 应已下线');
  assert.equal(wallet.getTreeBalance, undefined, 'getTreeBalance 应已下线');
  assert.equal(typeof wallet.deductTreeCreateFee, 'function', 'deductTreeCreateFee 保留（规格明确保留）');
  assert.equal(typeof wallet.recharge, 'function');
  assert.equal(typeof wallet.getUserBalance, 'function');
  assert.equal(typeof wallet.getWalletOverview, 'function');
  const src = fs.readFileSync(path.join(HERE, 'wallet.js'), 'utf8');
  assert.ok(!/function\s+transferToTree/.test(src), '源码里不得再定义 transferToTree');
  assert.ok(!/function\s+getTreeBalance/.test(src), '源码里不得再定义 getTreeBalance');
});

// ================= 真源体检 =================

test('E1 真源未被改动：config/tree-meta.json + migrate-output/trees + collections 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 真源 md5 不得变化');
  const trees = dirBaseline(REAL_TREES);
  const cols = dirBaseline(REAL_COLLECTIONS);
  assert.deepEqual([...trees.keys()].sort(), [...realTreeBaseline.keys()].sort(), 'trees 目录文件清单不得变化');
  assert.deepEqual([...cols.keys()].sort(), [...realColBaseline.keys()].sort(), 'collections 目录文件清单不得变化');
  for (const [f, h] of realTreeBaseline) assert.equal(trees.get(f), h, `trees/${f} 不得变化`);
  for (const [f, h] of realColBaseline) assert.equal(cols.get(f), h, `collections/${f} 不得变化`);
  assert.ok(TMP.startsWith(os.tmpdir()), '沙箱目录必须在 /tmp 下');
});
