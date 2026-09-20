#!/usr/bin/env node
/**
 * 一次性数据手术：**始祖真源反转 · 存量就地迁移**（Zang 2026-09-20 裁定书 v1 + 追加 v1.1〔A1/A2/A3〕；R1/R2/R4/R7）
 *
 * 旧模型（`docs/clan-tree.spec.md` 现行文本）：「家族树始祖是**宗谱节点的镜像**，真身在宗谱」。
 * 新模型（本裁定）：反向 —— **家族树始祖就是真身**（T2 家族树的身份数据以本树为准），
 * 宗谱自有段保留 **1 条指向家族树始祖的登记镜像**（T1），宗谱 `tree-meta.founder_handle`
 * 指向该登记镜像。顶端世本镜像段方向不变（宗谱 I0001 仍 mirror→zhonghua，本脚本**不碰**）。
 *
 * 本脚本只做「存量两条链」的**就地反转**，不新建任何节点：
 *
 *   链 A（季）：家族树 `ji_23395_01` ← 宗谱 `ji_23395`
 *     家族树始祖 handle `10400594c54f5203f61bf4fa4b20`（I000209 季花）当前 mirror→ji_23395:3c95530f8bd4f84dc0b87edc
 *   链 B（顾）：家族树 `gu_39038_01` ← 宗谱 `gu_39038`
 *     家族树始祖 handle `103f95b87b5a464242933ee319d5`（I000143 顾清学）当前 mirror→gu_39038:5ae4c6e505c90d290f71f66b
 *
 * 每条链 4 项改动（(a)~(d)）+ 1 项源侧清理（(e)），逐字对应裁定条目 v1 / 追加 v1.1：
 *   (a) 家族树侧始祖：清空 `external_tree` / `external_person_handle` / `external_link_type` /
 *       `external_mirror` / `external_relation_note` / **`external_founder_created_by`（v1.1 A3）**
 *       （**身份字段 name/surname/given/gender/birth_date/death_date/birth_place/death_place
 *       一字不动** —— 真身就是本树）。
 *       清空口径 = 置空串（与 `lib/founder-attach.js` 的 `planFounderPlaceholder()` 同形，
 *       也是真源里未挂载节点的既有形状：三个指针字段为 `''`），**不删键**。
 *   (b) 家族树侧始祖档案（v1.1 A2 · **只携带内容字段**）：以宗谱侧真身详情为**内容源**，只取
 *       `events` / `media` / `citations` / `notes` / `attributes` 五个内容字段（`attributes` 里的
 *       `external_chain_gen` 世数随之而来）；`_id` = `<家族树 tree_id>:<家族树始祖 handle>`、
 *       `tree_id` / `handle` 一并改写为新落点（否则文档归属错层：读侧按 `tree_id` 分片、
 *       `saveDetail` 按 `_id` 收口），**`gramps_id` / `legacy_gramps_id` / `name` 取本树节点现值**
 *       （实测 ji = `I000209` / `I0058`，gu = `I000143` / `I0070`），`updated_at` 刷新。
 *       **不再沿用宗谱侧 `I000163` / `I0002`。**
 *   (c) 宗谱侧原真身节点 → 改为指向家族树始祖的**登记镜像**：
 *       `external_tree=<家族树 tree_id>`、`external_person_handle=<家族树始祖 handle>`、
 *       `external_link_type='founder'`、`external_mirror='true'`；
 *       `external_relation_note` = **该节点已有备注的原措辞**（v1.1 A5：不重写文案）；仅当该节点
 *       无备注时才按 `lib/founder-attach.js:founderRegistrationNote()` 逐字口径写
 *       `<姓名>（<家族树标题> · 始祖）`。
 *   (d) `config/tree-meta.json`：
 *       · 宗谱条目 `founder_handle`：**仅在为空时**写为该登记镜像节点 handle（v1.1 A4）；
 *         非空且相符 = 只断言；非空且**不符** = 抱错退出（**不覆盖**既有值）；
 *       · 家族树条目 `founder_handle` **保持现值不变**（T3 后代结构一个字节不改），
 *         缺 `clan_tree_id` / `clan_handle` 则补齐（§13-5 口径：`clan_handle` = 该树在宗谱的落点）；
 *       · 树 JSON 里家族/人物结构、`families` 槽位、祖先节点一律不动。
 *   (e) **源侧详情不保留孤儿档**（v1.1 A1）：`--apply` 默认**连带删除**宗谱侧原真身详情
 *       （本例 = `details/ji_23395:3c95530f8bd4f84dc0b87edc.json` +
 *       `details/gu_39038:5ae4c6e505c90d290f71f66b.json`）—— 理由：档案真值已在家族树真身、
 *       **镜像节点不载档案**；对齐 `docs/PENDING_DEPLOY.md` §29-3「先重传 → 再删旧详情键」
 *       （本脚本同一轮内顺序 = 先写新键 → 再删旧键）。删除前**先把被删文件副本 + md5 写进
 *       `~/jiazu-backups/<批次>/deleted-source-details/`（另附清单 `md5.txt`）**。
 *       `--keep-source-detail` 可退回「保留源侧详情」（不删）。
 *
 * 幂等：目标值与现值一致即不写该文件（`--apply` 重跑报「0 改动」，文件 md5 前后恒等）。
 *
 * 用法：
 *   node scripts/migrate-founder-inversion-2026-09.mjs                        # dry-run（默认，只打印计划）
 *   node scripts/migrate-founder-inversion-2026-09.mjs --apply                # 写入真源（**本次任务禁止真跑**，待单独下令）；默认连带删除源侧详情（A1）
 *   node scripts/migrate-founder-inversion-2026-09.mjs --apply --keep-source-detail   # 写入但**保留**源侧详情（退回 A1）
 *   COMPAT_OUT_DIR=/tmp/jiazu-inv-mig COMPAT_META_FILE=/tmp/jiazu-inv-mig/tree-meta.json \
 *     node scripts/migrate-founder-inversion-2026-09.mjs [--apply]            # 副本演练
 *   node scripts/migrate-founder-inversion-2026-09.mjs --json=/tmp/plan.json  # 另存摘要 JSON（dry-run 也可）
 *
 * 目标文件解析顺序（与 `lib/store.js` 同序）：`COMPAT_META_FILE` > `COMPAT_OUT_DIR/tree-meta.json` > 真源。
 * 备份：`--apply` 且确有改动/删除时，改动到的文件按相对路径拷到
 *   `~/jiazu-backups/<YYYY-MM-DD>-founder-inversion[-copy]/`（另存 `md5-before.txt` 与 `summary.json`）；
 *   被删的源侧详情另拷到该批次的 `deleted-source-details/`（附 `md5.txt` 清单）。
 * 退出码：0 = dry-run 完成 / 写入成功 / 无需写入；1 = 前置复核失败（**绝不猜**）或写后自校验失败；2 = 用法错误 / 目标缺失。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ---- 参数 ----
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
if (flag('--help') || flag('-h')) {
  console.log('用法：node scripts/migrate-founder-inversion-2026-09.mjs [--apply] [--keep-source-detail] [--json=<path>]');
  console.log('  --apply                写入目标（真源写入须单独授权；副本演练请配合 COMPAT_OUT_DIR）');
  console.log('  --keep-source-detail   --apply 时**保留**宗谱侧原真身详情（退回裁定 v1.1 A1 的默认删除）');
  console.log('  --json=<path>          另存摘要 JSON');
  process.exit(0);
}
const KNOWN = new Set(['--apply', '--keep-source-detail']);
const unknown = argv.filter((a) => !KNOWN.has(a) && !a.startsWith('--json='));
if (unknown.length) {
  console.error(`❌ 未知参数：${unknown.join(' ')}（仅支持 --apply / --keep-source-detail / --json=<path>）`);
  process.exit(2);
}
const APPLY = flag('--apply');
/** v1.1 A1 退回开关：--apply 时保留源侧详情（不删） */
const KEEP_SOURCE_DETAIL = flag('--keep-source-detail');
const jsonArg = argv.find((a) => a.startsWith('--json='));
const JSON_OUT = jsonArg ? path.resolve(jsonArg.slice('--json='.length)) : '';

// ---- 目标文件解析（与 lib/store.js 同序）----
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const OUT_DIR = process.env.COMPAT_OUT_DIR ? path.resolve(process.env.COMPAT_OUT_DIR) : REAL_OUT;
const TREES_DIR = path.join(OUT_DIR, 'trees');
const DETAILS_DIR = path.join(OUT_DIR, 'details');
const META_FILE = process.env.COMPAT_META_FILE
  ? path.resolve(process.env.COMPAT_META_FILE)
  : process.env.COMPAT_OUT_DIR
    ? path.join(OUT_DIR, 'tree-meta.json')
    : REAL_META;
const IS_COPY = path.resolve(OUT_DIR) !== path.resolve(REAL_OUT);
const IS_META_COPY = path.resolve(META_FILE) !== path.resolve(REAL_META);
/** 打印/备份用的相对根：副本演练取副本根（OUT_DIR 的父目录），真源取仓库根 */
const ROOT = IS_COPY ? path.dirname(OUT_DIR) : REPO;

// ---- 两条链（handle 逐字取自真源实测；脚本仍会逐条复核，不符即拒绝）----
const CHAINS = [
  {
    label: '季',
    familyTreeId: 'ji_23395_01',
    clanTreeId: 'ji_23395',
    familyFounderHandle: '10400594c54f5203f61bf4fa4b20',
    familyFounderGrampsId: 'I000209',
    familyFounderLegacyGrampsId: 'I0058',
    familyFounderName: '季花',
    clanTrueSelfHandle: '3c95530f8bd4f84dc0b87edc',
    clanTrueSelfGrampsId: 'I000163',
    clanTopMirrorHandle: 'mir_103ff661b13b19b0f44c89cbe2f7', // 世本镜像（顶端段）—— 本脚本只断言不动
  },
  {
    label: '顾',
    familyTreeId: 'gu_39038_01',
    clanTreeId: 'gu_39038',
    familyFounderHandle: '103f95b87b5a464242933ee319d5',
    familyFounderGrampsId: 'I000143',
    familyFounderLegacyGrampsId: 'I0070',
    familyFounderName: '顾清学',
    clanTrueSelfHandle: '5ae4c6e505c90d290f71f66b',
    clanTrueSelfGrampsId: 'I000139',
    clanTopMirrorHandle: 'mir_a824b97dab17c3f590b4e3fc',
  },
];

// ---- 工具 ----
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const md5text = (t) => crypto.createHash('md5').update(t).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, obj, nl = false) =>
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + (nl ? '\n' : ''), 'utf8');
const w = (s, n) => {
  const len = [...String(s)].reduce((k, ch) => k + (ch.codePointAt(0) > 127 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - len));
};
const treeFile = (id) => path.join(TREES_DIR, `${id}.json`);
const detailFile = (treeId, handle) => path.join(DETAILS_DIR, `${treeId}:${handle}.json`);
const kindOf = (e) => String(e?.kind || 'family');
const entryKeyOf = (meta, treeId) =>
  Object.keys(meta.trees || {}).find((k) => meta.trees[k]?.tree_id === treeId) || (meta.trees?.[treeId] ? treeId : '');
const MIRROR_FIELDS = [
  'external_tree',
  'external_person_handle',
  'external_link_type',
  'external_mirror',
  'external_relation_note',
];
/** v1.1 A3：家族树始祖**额外同批清空**的字段（与 4 个指针 + 备注同批） */
const FAMILY_EXTRA_CLEAR_FIELDS = ['external_founder_created_by'];
/** 家族树始祖清空面 = 5 个镜像字段 + A3 追加字段（共 6 个） */
const FAMILY_CLEAR_FIELDS = [...MIRROR_FIELDS, ...FAMILY_EXTRA_CLEAR_FIELDS];
/**
 * v1.1 A2：复制档**只携带**的内容字段。
 * 其余键（`_id` / `tree_id` / `handle` / `gramps_id` / `legacy_gramps_id` / `name`）一律用**本树节点现值**。
 */
const CARRIED_CONTENT_FIELDS = ['events', 'media', 'citations', 'notes', 'attributes'];
/** 详情文档全部已知键（用于源档「有无未列键」自检；出现未列键 → 报出，不静默夹带） */
const DETAIL_KNOWN_KEYS = new Set([
  ...CARRIED_CONTENT_FIELDS,
  '_id',
  'tree_id',
  'handle',
  'gramps_id',
  'legacy_gramps_id',
  'name',
  'updated_at',
]);
const isCleared = (p, fields = MIRROR_FIELDS) => fields.every((k) => String(p?.[k] ?? '') === '');

/** 清空给定字段（置空串；键序尽量原地，缺失则在 spouse_families 后统一补出） */
function withClearedFields(person, fields) {
  const clear = Object.fromEntries(fields.map((k) => [k, '']));
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(person)) {
    if (k in clear) {
      if (!placed) {
        Object.assign(out, clear);
        placed = true;
      }
      continue;
    }
    out[k] = v;
    if (k === 'spouse_families' && !placed) {
      Object.assign(out, clear);
      placed = true;
    }
  }
  if (!placed) Object.assign(out, clear);
  return out;
}

/** 写成登记镜像（键序：external_tree → external_person_handle → external_link_type → external_mirror → external_relation_note） */
function withMirrorFields(person, { tree, handle, linkType, note }) {
  const mirror = {
    external_tree: tree,
    external_person_handle: handle,
    external_link_type: linkType,
    external_mirror: 'true',
    external_relation_note: note,
  };
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(person)) {
    if (k in mirror) {
      if (!placed) {
        Object.assign(out, mirror);
        placed = true;
      }
      continue;
    }
    out[k] = v;
    if (k === 'spouse_families' && !placed) {
      Object.assign(out, mirror);
      placed = true;
    }
  }
  if (!placed) Object.assign(out, mirror);
  return out;
}

/** tree-meta 条目补 clan_tree_id / clan_handle（插在 founder_name 之后，沿用立支写法顺序） */
function withClanLink(entry, clanTreeId, clanHandle) {
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'clan_tree_id' || k === 'clan_handle') continue;
    out[k] = v;
    if (k === 'founder_name') {
      out.clan_tree_id = clanTreeId;
      out.clan_handle = clanHandle;
      placed = true;
    }
  }
  if (!placed) {
    out.clan_tree_id = clanTreeId;
    out.clan_handle = clanHandle;
  }
  return out;
}

/**
 * (b) 由宗谱侧真身详情构造家族树侧始祖详情（v1.1 A2：**只携带内容字段**）。
 *
 * 携带面 = `events` / `media` / `citations` / `notes` / `attributes`（逐字段深拷贝，含
 * `attributes` 里的 `external_chain_gen` 世数）；其余键一律取**本树节点现值**：
 * `_id` / `tree_id` / `handle` 改写为家族树落点，`gramps_id` / `legacy_gramps_id` / `name`
 * 取家族树始祖节点实测值（**不再沿用宗谱侧 `I000163` / `I0002`**）。
 * 键序与真源既有家族树侧详情文档同形：
 *   `_id → tree_id → handle → gramps_id → name → events → media → citations → notes → attributes → updated_at → legacy_gramps_id`
 */
function buildFamilyFounderDetail(src, { familyTreeId, familyFounderHandle, grampsId, name, legacyGrampsId, now }) {
  const doc = {
    _id: `${familyTreeId}:${familyFounderHandle}`,
    tree_id: familyTreeId,
    handle: familyFounderHandle,
    gramps_id: String(grampsId ?? ''),
    name: String(name ?? ''),
  };
  for (const k of CARRIED_CONTENT_FIELDS) {
    doc[k] = JSON.parse(JSON.stringify(src?.[k] ?? []));
  }
  doc.updated_at = now;
  doc.legacy_gramps_id = String(legacyGrampsId ?? '');
  return doc;
}

const stripUpdatedAt = (o) => {
  const { updated_at, ...rest } = o || {};
  return rest;
};
const sameExceptUpdatedAt = (a, b) => JSON.stringify(stripUpdatedAt(a)) === JSON.stringify(stripUpdatedAt(b));

// ================= 前置：目标存在性 =================
if (!fs.existsSync(TREES_DIR)) {
  console.error(`❌ 找不到树目录：${TREES_DIR}`);
  process.exit(2);
}
if (!fs.existsSync(DETAILS_DIR)) {
  console.error(`❌ 找不到详情目录：${DETAILS_DIR}`);
  process.exit(2);
}
if (!fs.existsSync(META_FILE)) {
  console.error(`❌ 找不到 tree-meta：${META_FILE}`);
  process.exit(2);
}

const now = new Date().toISOString();
const metaTextBefore = fs.readFileSync(META_FILE, 'utf8');
const meta = JSON.parse(metaTextBefore);
const metaBefore = md5(META_FILE);

// ================= 逐链复核 + 计划 =================
/** 文件级计划：rel → { abs, kind: 'tree'|'detail'|'meta', before, afterText, note } */
const filePlan = new Map();
const chains = [];

function planFile(abs, kind, afterText, note) {
  const rel = path.relative(ROOT, abs);
  const exists = fs.existsSync(abs);
  filePlan.set(abs, {
    abs,
    rel,
    kind,
    exists,
    before: exists ? md5(abs) : '',
    afterText,
    after: afterText === null ? '' : md5text(afterText),
    note,
  });
}

for (const chain of CHAINS) {
  const row = {
    label: chain.label,
    familyTreeId: chain.familyTreeId,
    clanTreeId: chain.clanTreeId,
    familyFounder: chain.familyFounderHandle,
    clanTrueSelf: chain.clanTrueSelfHandle,
    checks: [],
    errors: [],
    changes: [],
    observed: {},
  };
  const err = (m) => row.errors.push(m);
  const ok = (m) => row.checks.push(`✅ ${m}`);

  const famKey = entryKeyOf(meta, chain.familyTreeId);
  const clanKey = entryKeyOf(meta, chain.clanTreeId);
  const famEntry = famKey ? meta.trees[famKey] : null;
  const clanEntry = clanKey ? meta.trees[clanKey] : null;

  const famPath = treeFile(chain.familyTreeId);
  const clanPath = treeFile(chain.clanTreeId);
  for (const p of [famPath, clanPath]) {
    if (!fs.existsSync(p)) err(`树 JSON 缺失：${path.relative(ROOT, p)}`);
  }
  if (!famKey) err(`tree-meta 缺家族树条目：${chain.familyTreeId}`);
  if (!clanKey) err(`tree-meta 缺宗谱条目：${chain.clanTreeId}`);
  if (row.errors.length) {
    chains.push(row);
    continue;
  }
  if (kindOf(famEntry) !== 'family') err(`tree-meta.${chain.familyTreeId} kind=${kindOf(famEntry)}（期望 family）`);
  if (kindOf(clanEntry) !== 'clan') err(`tree-meta.${chain.clanTreeId} kind=${kindOf(clanEntry)}（期望 clan）`);

  const famTree = readJson(famPath);
  const clanTree = readJson(clanPath);
  const famTreeText = fs.readFileSync(famPath, 'utf8');
  const clanTreeText = fs.readFileSync(clanPath, 'utf8');
  row.observed.familyReserializeByteIdentical = JSON.stringify(famTree, null, 2) === famTreeText;
  row.observed.clanReserializeByteIdentical = JSON.stringify(clanTree, null, 2) === clanTreeText;

  // ① 家族树始祖节点
  const ff = famTree.people?.[chain.familyFounderHandle];
  if (!ff) {
    err(`家族树始祖节点不存在（${chain.familyFounderHandle}）`);
  } else {
    if (String(ff.gramps_id) !== chain.familyFounderGrampsId) {
      err(`家族树始祖 gramps_id 不符：树内 ${ff.gramps_id} vs 期望 ${chain.familyFounderGrampsId}`);
    }
    if (String(ff.legacy_gramps_id || '') !== chain.familyFounderLegacyGrampsId) {
      err(`家族树始祖 legacy_gramps_id 不符：树内 ${ff.legacy_gramps_id} vs 期望 ${chain.familyFounderLegacyGrampsId}（v1.1 A2：复制档取本树现值）`);
    }
    if (String(ff.name) !== chain.familyFounderName) {
      err(`家族树始祖 name 不符：树内「${ff.name}」vs 期望「${chain.familyFounderName}」`);
    }
    if (String(famTree.founder_gramps_id || '') !== chain.familyFounderGrampsId) {
      err(`家族树顶层 founder_gramps_id 不符：${famTree.founder_gramps_id} vs ${chain.familyFounderGrampsId}`);
    }
    if (String(famEntry.founder_handle || '') !== chain.familyFounderHandle) {
      err(`tree-meta.founder_handle 与实测始祖不符：${famEntry.founder_handle} vs ${chain.familyFounderHandle}（R2：家族树始祖 handle 不得变）`);
    }
  }

  // ② 宗谱侧原真身节点
  const ct = clanTree.people?.[chain.clanTrueSelfHandle];
  if (!ct) {
    err(`宗谱侧原真身节点不存在（${chain.clanTrueSelfHandle}）`);
  } else {
    if (String(ct.gramps_id) !== chain.clanTrueSelfGrampsId) {
      err(`宗谱侧节点 gramps_id 不符：${ct.gramps_id} vs ${chain.clanTrueSelfGrampsId}`);
    }
    if (ff && String(ct.name) !== String(ff.name)) {
      err(`两侧姓名不一致：宗谱「${ct.name}」vs 家族树「${ff.name}」—— 拒绝猜`);
    }
    if (String(clanTree.founder_gramps_id || '') !== chain.clanTrueSelfGrampsId) {
      row.checks.push(`ℹ️ 宗谱顶层 founder_gramps_id=${clanTree.founder_gramps_id}（与自有段 handle 无关，本脚本不动）`);
    }
  }

  // ③ 宗谱顶端世本镜像 —— 只断言方向不变（R1）
  const top = clanTree.people?.[chain.clanTopMirrorHandle];
  if (!top) {
    err(`宗谱顶端世本镜像节点不存在（${chain.clanTopMirrorHandle}）`);
  } else if (String(top.external_tree) !== 'zhonghua' || String(top.external_link_type) !== 'founder' || String(top.external_mirror) !== 'true') {
    err(`宗谱顶端镜像方向已被改动（${JSON.stringify({ tree: top.external_tree, type: top.external_link_type, mirror: top.external_mirror })}）—— 拒绝在非预期态上动手`);
  } else {
    ok(`宗谱顶端世本镜像 ${chain.clanTopMirrorHandle} → zhonghua（本脚本不动）`);
  }

  // ④ 状态判定（幂等基础）：两侧各自「待反转」或「已反转」，且必须成对
  const famIsMirrorToClan =
    ff &&
    String(ff.external_mirror || '') === 'true' &&
    String(ff.external_link_type || '') === 'founder' &&
    String(ff.external_tree || '') === chain.clanTreeId &&
    String(ff.external_person_handle || '') === chain.clanTrueSelfHandle;
  const famCleared = !!ff && isCleared(ff, FAMILY_CLEAR_FIELDS);
  /** v1→v1.1 收敛态：5 个镜像字段已清，仅剩 A3 的 `external_founder_created_by` */
  const famNeedsExtraClear = !!ff && !famCleared && isCleared(ff, MIRROR_FIELDS);
  if (ff && !famIsMirrorToClan && !famCleared && !famNeedsExtraClear) {
    err(
      `家族树始祖既非「指向宗谱的镜像」也非「已清空态」：${JSON.stringify(
        Object.fromEntries(FAMILY_CLEAR_FIELDS.map((k) => [k, ff[k] ?? null])),
      )}`,
    );
  }
  const clanIsMirrorToFamily =
    ct &&
    String(ct.external_mirror || '') === 'true' &&
    String(ct.external_link_type || '') === 'founder' &&
    String(ct.external_tree || '') === chain.familyTreeId &&
    String(ct.external_person_handle || '') === chain.familyFounderHandle;
  const clanIsTrueSelf = !!ct && isCleared(ct);
  if (ct && !clanIsMirrorToFamily && !clanIsTrueSelf) {
    err(
      `宗谱自有段节点既非「本宗真身（无 external_*）」也非「指向家族树始祖的镜像」：${JSON.stringify(
        Object.fromEntries(MIRROR_FIELDS.map((k) => [k, ct[k] ?? null])),
      )}`,
    );
  }
  if (ff && ct && famIsMirrorToClan !== clanIsTrueSelf) {
    err('两侧状态不同步（一侧待反转、另一侧已反转）—— 拒绝继续');
  }
  row.state =
    famIsMirrorToClan && clanIsTrueSelf
      ? '待反转'
      : (famCleared || famNeedsExtraClear) && clanIsMirrorToFamily
        ? '已反转'
        : '异常';
  row.famNeedsExtraClear = famNeedsExtraClear;
  row.observed.familyMirrorFields = ff ? Object.fromEntries(FAMILY_CLEAR_FIELDS.map((k) => [k, ff[k] ?? null])) : null;
  row.observed.clanMirrorFields = ct ? Object.fromEntries(MIRROR_FIELDS.map((k) => [k, ct[k] ?? null])) : null;

  // ⑤ 家族树内不得有第二个节点指向该宗谱（避免误判落点）
  if (ff) {
    const others = Object.values(famTree.people || {}).filter(
      (p) => p.handle !== chain.familyFounderHandle && String(p.external_tree || '') === chain.clanTreeId,
    );
    if (others.length) err(`家族树内另有 ${others.length} 个节点指向宗谱 ${chain.clanTreeId}（${others.map((p) => p.handle).join('、')}）`);
    else ok('家族树内指向该宗谱的节点唯一（仅始祖）');
  }

  // ⑥ 详情文档
  const clanDetailPath = detailFile(chain.clanTreeId, chain.clanTrueSelfHandle);
  const famDetailPath = detailFile(chain.familyTreeId, chain.familyFounderHandle);
  const clanDetailExists = fs.existsSync(clanDetailPath);
  const famDetailExists = fs.existsSync(famDetailPath);
  const clanDetailBeforeMd5 = clanDetailExists ? md5(clanDetailPath) : '';
  row.observed.clanDetailBefore = clanDetailBeforeMd5;
  row.observed.sourceDetailExists = clanDetailExists;
  row.observed.familyDetailExists = famDetailExists;
  row.observed.familyDetailBefore = famDetailExists ? md5(famDetailPath) : '';
  row.clanDetailPath = clanDetailPath;
  row.famDetailPath = famDetailPath;

  // ⑦ 目标形态
  const famTitle = String(famEntry.display_title || chain.familyTreeId);
  /** A5：宗谱节点**已有备注原措辞**优先；无备注时才用 R4 工厂口径（`founderRegistrationNote()`） */
  const existingClanNote = String(ct?.external_relation_note || '');
  const generatedNote = `${ff?.name || chain.familyFounderName}（${famTitle} · 始祖）`;
  const note = existingClanNote || generatedNote;
  row.note = note;
  row.generatedNote = generatedNote;
  row.noteSource = existingClanNote ? 'kept-existing' : 'generated(R4)';
  row.famTitle = famTitle;

  // 源侧详情缺失：① 未反转（含部分态）→ 无内容源，抱错（负例 A）；
  //              ② **已反转且家族树侧详情已就位**（上一轮 --apply 已按 A1 连带删除源档）→ 正常幂等终态
  const famDetailCur = famDetailExists ? readJson(famDetailPath) : null;
  const famDetailIsPlaced = !!(
    famDetailCur &&
    famDetailCur._id === `${chain.familyTreeId}:${chain.familyFounderHandle}` &&
    String(famDetailCur.tree_id || '') === chain.familyTreeId &&
    String(famDetailCur.handle || '') === chain.familyFounderHandle &&
    String(famDetailCur.gramps_id || '') === chain.familyFounderGrampsId &&
    String(famDetailCur.legacy_gramps_id || '') === chain.familyFounderLegacyGrampsId &&
    CARRIED_CONTENT_FIELDS.every((k) => k in famDetailCur)
  );
  const srcDetailMissingOk =
    !clanDetailExists && (famCleared || famNeedsExtraClear) && clanIsMirrorToFamily && famDetailIsPlaced;
  if (!clanDetailExists) {
    if (srcDetailMissingOk) {
      ok(`宗谱侧原真身详情已按 A1 删除（${path.relative(ROOT, clanDetailPath)} 不存在），家族树侧详情已就位 → 幂等终态`);
    } else {
      err(`宗谱侧真身详情缺失，无法复制：${path.relative(ROOT, clanDetailPath)}`);
    }
  }
  row.observed.sourceDetailMissingOk = srcDetailMissingOk;

  if (row.errors.length) {
    chains.push(row);
    continue;
  }

  // ---- 改动 (a)：家族树始祖清空指针（v1.1 A3：含 external_founder_created_by）----
  if (famIsMirrorToClan || famNeedsExtraClear) {
    const next = { ...famTree, people: { ...famTree.people } };
    next.people[chain.familyFounderHandle] = withClearedFields(ff, FAMILY_CLEAR_FIELDS);
    next.version = (famTree.version || 1) + 1;
    next.updated_at = now;
    const text = JSON.stringify(next, null, 2);
    planFile(
      famPath,
      'tree',
      text,
      `${chain.familyTreeId} 始祖清空 external_*（${FAMILY_CLEAR_FIELDS.join('/')}）`,
    );
    row.changes.push({
      kind: famNeedsExtraClear
        ? '(a) 家族树始祖补清 external_founder_created_by（A3 收敛）'
        : '(a) 家族树始祖清空指针',
      file: path.relative(ROOT, famPath),
      before: row.observed.familyMirrorFields,
      after: Object.fromEntries(FAMILY_CLEAR_FIELDS.map((k) => [k, ''])),
    });
    row.familyTreeNextText = text;
  } else {
    ok('家族树始祖 external_* 已为空（含 A3 的 external_founder_created_by；幂等：无需清洗）');
  }

  // ---- 改动 (b)：家族树始祖详情 ← 宗谱侧真身详情（v1.1 A2：只携带内容字段）----
  const srcDetail = clanDetailExists ? readJson(clanDetailPath) : null;
  if (srcDetail) {
    const target = buildFamilyFounderDetail(srcDetail, {
      familyTreeId: chain.familyTreeId,
      familyFounderHandle: chain.familyFounderHandle,
      grampsId: ff.gramps_id,
      name: ff.name,
      legacyGrampsId: ff.legacy_gramps_id,
      now,
    });
    row.observed.targetDetail = target;
    const srcExtraKeys = Object.keys(srcDetail).filter((k) => !DETAIL_KNOWN_KEYS.has(k));
    row.observed.sourceExtraKeys = srcExtraKeys;
    const cur = famDetailCur;
    const contentEqual = !!cur && sameExceptUpdatedAt(cur, target);
    /** 本轮正是该链 待反转 → 已反转 的**迁移轮**：详情随迁落盘（`updated_at` 刷新），
     *  即便内容字面已等于 A2 目标（真源实测即此情形）；重跑时 state='已反转' → 不再写（幂等）。 */
    const midMigration = row.state === '待反转';
    if (!contentEqual || midMigration) {
      planFile(famDetailPath, 'detail', JSON.stringify(target, null, 2), `${chain.familyTreeId} 始祖详情 ← 宗谱真身档（只携带内容字段）`);
      row.changes.push({
        kind: '(b) 家族树始祖详情 ← 宗谱真身详情（A2：只携带内容字段）',
        file: path.relative(ROOT, famDetailPath),
        before: cur ? stripUpdatedAt(cur) : null,
        after: stripUpdatedAt(target),
        source: path.relative(ROOT, clanDetailPath),
        sourceMd5: clanDetailBeforeMd5,
        carriedContentFields: CARRIED_CONTENT_FIELDS,
        localGrampsId: chain.familyFounderGrampsId,
        localLegacyGrampsId: chain.familyFounderLegacyGrampsId,
        sourceGrampsId: String(srcDetail.gramps_id || ''),
        sourceLegacyGrampsId: String(srcDetail.legacy_gramps_id || ''),
        contentAlreadyEqualToTarget: contentEqual,
        reason: contentEqual ? '迁移轮刷新 updated_at（内容已等于 A2 目标）' : '内容/身份键随迁',
      });
    } else {
      ok('家族树始祖详情已等于「A2 只携带内容字段 + 本树身份键」（幂等：无需复制）');
    }
  }

  // ---- 改动 (c)：宗谱原真身节点 → 登记镜像 ----
  if (clanIsTrueSelf) {
    const next = { ...clanTree, people: { ...clanTree.people } };
    next.people[chain.clanTrueSelfHandle] = withMirrorFields(ct, {
      tree: chain.familyTreeId,
      handle: chain.familyFounderHandle,
      linkType: 'founder',
      note,
    });
    next.version = (clanTree.version || 1) + 1;
    next.updated_at = now;
    const text = JSON.stringify(next, null, 2);
    planFile(clanPath, 'tree', text, `${chain.clanTreeId} 自有段真身 → 登记镜像（→ ${chain.familyTreeId}）`);
    row.changes.push({
      kind: '(c) 宗谱真身 → 登记镜像',
      file: path.relative(ROOT, clanPath),
      before: row.observed.clanMirrorFields,
      after: { external_tree: chain.familyTreeId, external_person_handle: chain.familyFounderHandle, external_link_type: 'founder', external_mirror: 'true', external_relation_note: note },
      noteSource: row.noteSource,
    });
  } else {
    // A5：已反转 → **不改写备注文案**（原措辞保留；R4 工厂口径与现文案不同也只报不动）
    ok('宗谱自有段节点已是指向家族树始祖的登记镜像（幂等：本脚本不改写备注文案）');
    if (note !== generatedNote) {
      row.checks.push(
        `ℹ️ A5 保留原措辞：现有 external_relation_note=「${note}」≠ R4 工厂口径「${generatedNote}」—— 只报不动`,
      );
    }
  }

  // ---- 改动 (d)：tree-meta ----
  const metaPatch = {};
  // 宗谱条目（v1.1 A4）：**仅在为空时**写为登记镜像节点 handle；非空且相符 = 只断言；
  // 非空且不符 = 抱错（绝不覆盖宗谱既有 founder_handle 指向）
  const curClanFounder = String(clanEntry.founder_handle || '');
  if (!curClanFounder) {
    metaPatch.clanFounderHandle = { before: '', after: chain.clanTrueSelfHandle };
    row.checks.push(`ℹ️ tree-meta.${chain.clanTreeId}.founder_handle 为空 → 按 A4 补写为登记镜像 ${chain.clanTrueSelfHandle}`);
  } else if (curClanFounder === chain.clanTrueSelfHandle) {
    ok(`tree-meta.${chain.clanTreeId}.founder_handle 已指向登记镜像（${chain.clanTrueSelfHandle}；A4 只断言）`);
  } else {
    err(
      `tree-meta.${chain.clanTreeId}.founder_handle 非空且与登记镜像不符：${curClanFounder} vs ${chain.clanTrueSelfHandle}（A4：仅在为空时补写，本脚本不覆盖）—— 拒绝继续`,
    );
  }
  // 家族树条目：保持 founder_handle；缺 clan_tree_id / clan_handle 则补齐
  const needClanLink =
    String(famEntry.clan_tree_id || '') !== chain.clanTreeId || String(famEntry.clan_handle || '') !== chain.clanTrueSelfHandle;
  if (needClanLink) {
    // 补齐宗谱归属（§13-5：clan_handle = 该树在宗谱的落点）；founder_* 三字段保持现值
    meta.trees[famKey] = withClanLink(famEntry, chain.clanTreeId, chain.clanTrueSelfHandle);
    row.metaNeedsWrite = true;
    row.changes.push({
      kind: '(d) tree-meta 家族树条目补宗谱归属',
      file: path.relative(ROOT, META_FILE),
      before: { clan_tree_id: famEntry.clan_tree_id ?? null, clan_handle: famEntry.clan_handle ?? null, founder_handle: famEntry.founder_handle },
      after: { clan_tree_id: chain.clanTreeId, clan_handle: chain.clanTrueSelfHandle, founder_handle: famEntry.founder_handle },
    });
  } else {
    ok(`tree-meta.${chain.familyTreeId} 已有 clan_tree_id/clan_handle（幂等）`);
  }
  if (metaPatch.clanFounderHandle) {
    meta.trees[clanKey] = { ...meta.trees[clanKey], founder_handle: metaPatch.clanFounderHandle.after };
    row.metaNeedsWrite = true;
    row.changes.push({
      kind: '(d) tree-meta 宗谱条目 founder_handle 改指登记镜像',
      file: path.relative(ROOT, META_FILE),
      before: { founder_handle: metaPatch.clanFounderHandle.before },
      after: { founder_handle: metaPatch.clanFounderHandle.after },
    });
  }
  chains.push(row);
}

// tree-meta 是否需写：把内存 meta 序列化回文本比对（本脚本不写 meta 的其它字段，字节级等值即不写）
const metaTextAfter = JSON.stringify(meta, null, 2) + (metaTextBefore.endsWith('\n') ? '\n' : '');
if (metaTextAfter !== metaTextBefore) {
  planFile(META_FILE, 'meta', metaTextAfter, 'tree-meta：宗谱 founder_handle / 家族树 clan_tree_id+clan_handle');
}

// ================= v1.1 A1：源侧详情删除计划 =================
/**
 * 默认（未给 `--keep-source-detail`）：源侧原真身详情**不保留孤儿档** → 本轮 `--apply` 连带删除。
 * 只在本轮结束后该链确为「已反转」时列入；已删（上一轮 --apply 已删）则跳过（幂等）。
 * 删除前会先把副本 + md5 落到备份目录的 `deleted-source-details/`。
 */
const deletePlan = [];
for (const row of chains) {
  if (row.errors.length) continue;
  if (row.state !== '待反转' && row.state !== '已反转') continue;
  if (!row.clanDetailPath || !fs.existsSync(row.clanDetailPath)) continue; // 已删 → 幂等跳过
  if (KEEP_SOURCE_DETAIL) continue;
  deletePlan.push({
    abs: row.clanDetailPath,
    rel: path.relative(ROOT, row.clanDetailPath),
    md5: md5(row.clanDetailPath),
    chain: row.label,
    familyDetail: path.relative(ROOT, row.famDetailPath),
    familyDetailMd5: fs.existsSync(row.famDetailPath) ? md5(row.famDetailPath) : '',
  });
}

// ================= 打印 =================
const nErr = chains.filter((c) => c.errors.length).length;
const nChanges = chains.reduce((n, c) => n + c.changes.length, 0);
console.log('═'.repeat(118));
console.log('始祖真源反转 · 存量就地迁移（裁定书 v1 + 追加 v1.1〔A1/A2/A3〕· R1/R2/R4/R7）');
console.log(`树目录   ：${TREES_DIR}${IS_COPY ? '（副本演练）' : '（★真源★）'}`);
console.log(`详情目录 ：${DETAILS_DIR}${IS_COPY ? '（副本）' : '（★真源★）'}`);
console.log(`tree-meta：${META_FILE}${IS_META_COPY ? '（副本）' : '（★真源★）'}  md5(前)=${metaBefore}`);
console.log(
  `模式     ：${APPLY ? '--apply（写盘）' : 'dry-run（不写盘）'} / A1 源侧详情：${
    KEEP_SOURCE_DETAIL ? '--keep-source-detail（保留）' : '默认删除（连带删源侧详情）'
  }`,
);
console.log('═'.repeat(118));

for (const c of chains) {
  console.log(`\n【链 ${c.label}】家族树 ${c.familyTreeId} ← 宗谱 ${c.clanTreeId}   状态：${c.state || '❌ 复核失败'}`);
  console.log(`  始祖：家族树 ${c.familyFounder} / 宗谱原真身 ${c.clanTrueSelf}${c.note ? ` / 镜像备注「${c.note}」(${c.noteSource})` : ''}`);
  for (const m of c.checks) console.log(`  ${m}`);
  for (const e of c.errors) console.log(`  ❌ ${e}`);
  if (c.observed.familyReserializeByteIdentical === false || c.observed.clanReserializeByteIdentical === false) {
    console.log('  ⚠️ 该树 JSON 重新序列化与现文件**非逐字节相同**：写入会整文件重排（内容语义不变）');
  }
  for (const ch of c.changes) {
    console.log(`\n  ▸ ${ch.kind}  →  ${ch.file}`);
    if (ch.source) console.log(`      来源：${ch.source}  md5=${ch.sourceMd5}`);
    console.log(`      改动前：${JSON.stringify(ch.before)}`);
    console.log(`      改动后：${JSON.stringify(ch.after)}`);
    if (ch.kind.startsWith('(b)')) {
      console.log(
        `      · A2 只携带内容字段：[${(ch.carriedContentFields || []).join('/')}]；身份键取本树节点现值 gramps_id=${ch.localGrampsId} / legacy=${ch.localLegacyGrampsId}`,
      );
      console.log(
        `      · 宗谱源档同名键（**不再沿用**）：gramps_id=${ch.sourceGrampsId} / legacy=${ch.sourceLegacyGrampsId}`,
      );
    }
  }
  if (!c.changes.length) console.log('  （本链 0 改动，幂等）');
  if (c.observed.sourceExtraKeys?.length) {
    console.log(`  ⚠️ 宗谱源档含未列键（未携带，仅报出）：${c.observed.sourceExtraKeys.join(', ')}`);
  }
}

console.log('\n' + '─'.repeat(118));
console.log(
  `合计：${chains.length} 条链 / 改动项 ${nChanges} / 复核失败链 ${nErr} / 待写文件 ${filePlan.size} / 待删文件 ${deletePlan.length}${
    KEEP_SOURCE_DETAIL ? '（A1 已退回：保留源侧详情）' : ''
  }`,
);
if (filePlan.size) {
  console.log('文件级 md5（前 → 后，预算）：');
  for (const f of filePlan.values()) {
    console.log(`  ${w(f.kind, 8)}${w(f.rel, 58)}${f.exists ? f.before : '<不存在>'} → ${f.after}`);
  }
}
if (deletePlan.length) {
  console.log(`待删文件（A1 · 删前先落备份 deleted-source-details/ + md5 清单）：`);
  for (const d of deletePlan) console.log(`  ${w('delete', 8)}${w(d.rel, 58)} md5=${d.md5}`);
}

if (nErr) {
  console.log(`\n❌ 有 ${nErr} 条链前置复核失败，**未写入 / 未删除任何文件**（退出码 1）。`);
  process.exit(1);
}

// ---- dry-run：证明零写入（含「零删除」）----
if (!APPLY) {
  const touched = [...filePlan.values()].filter((f) => f.exists);
  const drift = touched.filter((f) => md5(f.abs) !== f.before);
  const metaNow = md5(META_FILE);
  console.log(`\nmd5（tree-meta 前/后）= ${metaBefore} / ${metaNow}  ${metaNow === metaBefore ? '未写盘 ✅' : '⚠️ 已变'}`);
  console.log(
    `待写文件现盘 md5 复算：${drift.length === 0 ? `全部与「前」一致（${touched.length} 个文件，真源零写入 ✅）` : `⚠️ ${drift.length} 个已变`}`,
  );
  const delDrift = deletePlan.filter((d) => !fs.existsSync(d.abs) || md5(d.abs) !== d.md5);
  console.log(
    `待删文件现盘复核：${delDrift.length === 0 ? `全部仍在且 md5 一致（${deletePlan.length} 个文件，本轮零删除 ✅）` : `⚠️ ${delDrift.length} 个已变/已缺`}`,
  );
  console.log('（dry-run，未写盘、未删文件。加 --apply 才真正写入并连带删除源侧详情。）');
  if (JSON_OUT) {
    fs.writeFileSync(
      JSON_OUT,
      JSON.stringify(buildSummary({ applied: false, backupDir: '', filePlan, deletePlan }), null, 2) + '\n',
      'utf8',
    );
    console.log(`摘要 JSON：${JSON_OUT}`);
  }
  process.exit(0);
}

// ================= 写入 =================
if (!filePlan.size && !deletePlan.length) {
  console.log('\n✅ 无需写入、无需删除（两条链均已就位：真身在本树 + 源侧详情已按 A1 清理）—— 全部文件一个字节不改。');
  if (JSON_OUT) {
    fs.writeFileSync(
      JSON_OUT,
      JSON.stringify(buildSummary({ applied: false, backupDir: '', filePlan, deletePlan }), null, 2) + '\n',
      'utf8',
    );
  }
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 10);
let bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-founder-inversion${IS_COPY ? '-copy' : ''}`);
for (let i = 2; fs.existsSync(bakDir); i += 1) {
  bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-founder-inversion${IS_COPY ? '-copy' : ''}-${i}`);
}
const manifest = [];
const rollback = [];
for (const f of filePlan.values()) {
  if (f.exists) {
    const dest = path.join(bakDir, f.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f.abs, dest);
    manifest.push(`${f.before}  ${f.rel}`);
    rollback.push(`cp ${dest} ${f.abs}`);
  } else {
    manifest.push(`<不存在，无需备份>  ${f.rel}`);
    rollback.push(`rm -f ${f.abs}`);
  }
}
fs.mkdirSync(bakDir, { recursive: true });
fs.writeFileSync(path.join(bakDir, 'md5-before.txt'), manifest.join('\n') + '\n', 'utf8');

// ---- v1.1 A1：**删除前**先把被删的源侧详情副本 + md5 落进备份目录 ----
const deletedManifest = [];
let delDir = '';
if (deletePlan.length) {
  delDir = path.join(bakDir, 'deleted-source-details');
  fs.mkdirSync(delDir, { recursive: true });
  for (const d of deletePlan) {
    const dest = path.join(delDir, path.basename(d.abs));
    fs.copyFileSync(d.abs, dest);
    const destMd5 = md5(dest);
    if (destMd5 !== d.md5) {
      console.log(`\n❌ 备份副本 md5 不符（不删）：${d.rel} 源=${d.md5} 副本=${destMd5}（退出码 1）。`);
      process.exit(1);
    }
    deletedManifest.push(`${d.md5}  ${d.rel}  →  deleted-source-details/${path.basename(d.abs)}  副本md5=${destMd5}`);
    rollback.push(`cp ${dest} ${d.abs}   # 恢复被删的源侧详情`);
  }
  fs.writeFileSync(path.join(delDir, 'md5.txt'), deletedManifest.join('\n') + '\n', 'utf8');
  console.log(`\n🗄️  A1 被删源侧详情已先备份：${delDir}（${deletePlan.length} 个 + md5.txt）`);
  for (const l of deletedManifest) console.log(`    ${l}`);
}

// 写树 / 详情 / meta（内容已预置在 filePlan 里，逐文件落盘）
let written = 0;
for (const f of filePlan.values()) {
  if (f.afterText === null) continue;
  fs.writeFileSync(f.abs, f.afterText, 'utf8');
  written += 1;
}

// 写后自校验
let bad = 0;
console.log('\n写后自校验：');
for (const f of filePlan.values()) {
  const after = fs.existsSync(f.abs) ? md5(f.abs) : '';
  const ok = after === f.after;
  if (!ok) bad += 1;
  console.log(`  ${ok ? '✅' : '⚠️'} ${w(f.rel, 58)}md5 ${f.before || '<不存在>'} → ${after}  （预算 ${f.after}）`);
  try {
    if (f.kind !== 'meta') JSON.parse(fs.readFileSync(f.abs, 'utf8'));
  } catch (e) {
    bad += 1;
    console.log(`  ❌ JSON.parse 失败：${f.rel} — ${e.message}`);
  }
}
// ---- v1.1 A1：写新键之后 → 再删旧键（顺序不可交换；对齐 docs/PENDING_DEPLOY.md §29-3）----
console.log('\nA1 源侧详情删除（备份已就位 → 删除 → 复核）：');
for (const d of deletePlan) {
  fs.unlinkSync(d.abs);
  const gone = !fs.existsSync(d.abs);
  if (!gone) bad += 1;
  const copyOk = md5(path.join(delDir, path.basename(d.abs))) === d.md5;
  if (!copyOk) bad += 1;
  console.log(`  ${gone && copyOk ? '✅' : '⚠️'} 已删 ${w(d.rel, 58)}（原 md5=${d.md5}；备份副本 ${copyOk ? 'md5 一致' : 'md5 不符'}）`);
}
console.log(`\n📦 备份：${bakDir}（${filePlan.size} 个改动文件 + md5-before.txt + summary.json${
  deletePlan.length ? ` + deleted-source-details/（${deletePlan.length} 个 + md5.txt）` : ''
}）`);
console.log(`✅ 已写入 ${written} 个文件 / 已删 ${deletePlan.length} 个源侧详情`);
console.log('回滚（逐条）：');
for (const r of rollback) console.log(`  ${r}`);

const summary = buildSummary({ applied: true, backupDir: bakDir, filePlan, deletePlan, deletedManifest });
fs.writeFileSync(path.join(bakDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2) + '\n', 'utf8');
if (bad) {
  console.log(`\n❌ ${bad} 项写后校验不符（退出码 1）。`);
  process.exit(1);
}
console.log('下一步：重启本地 compat-api（内存 treeCache 常驻）；云端生产副本另需重跑 upload-migrated-to-cloudbase.mjs。');

function buildSummary({ applied, backupDir, filePlan, deletePlan = [], deletedManifest = [] }) {
  return {
    script: 'scripts/migrate-founder-inversion-2026-09.mjs',
    ruling: '裁定书 v1 + 追加 v1.1（A1 源侧详情默认连带删除 / A2 复制档只携带内容字段 + 本树身份键 / A3 家族树始祖同批清空 external_founder_created_by）（Zang 2026-09-20）R1/R2/R4/R7 —— 始祖真源反转 · 存量就地迁移',
    at: new Date().toISOString(),
    applied,
    keep_source_detail: KEEP_SOURCE_DETAIL,
    targets: { out_dir: OUT_DIR, details_dir: DETAILS_DIR, meta_file: META_FILE, is_copy: IS_COPY, is_meta_copy: IS_META_COPY },
    backup_dir: backupDir,
    md5: {
      'config/tree-meta.json': { before: metaBefore, after: fs.existsSync(META_FILE) ? md5(META_FILE) : '' },
      files: [...filePlan.values()].map((f) => ({
        path: f.rel,
        kind: f.kind,
        before: f.before || null,
        after_expected: f.after,
        after_actual: fs.existsSync(f.abs) ? md5(f.abs) : null,
      })),
      deleted_source_details: deletePlan.map((d) => ({
        path: d.rel,
        md5_before: d.md5,
        exists_after: fs.existsSync(d.abs),
        backup_copy: deletedManifest.find((l) => l.includes(d.rel)) || '',
      })),
    },
    chains: chains.map((c) => ({
      label: c.label,
      family_tree_id: c.familyTreeId,
      clan_tree_id: c.clanTreeId,
      state: c.state,
      family_founder: c.familyFounder,
      clan_true_self: c.clanTrueSelf,
      registration_note: c.note || '',
      registration_note_source: c.noteSource || '',
      checks: c.checks,
      errors: c.errors,
      observed: c.observed,
      changes: c.changes,
    })),
  };
}
