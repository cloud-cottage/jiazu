#!/usr/bin/env node
/**
 * 一次性数据手术：把存量家族树的自由文本 `origin` 迁移成结构化 `origin_code`
 * （展示串 `origin` 由名称表反查覆盖 → 与 `config/geo-divisions.json` 同口径）
 *
 * 口径（契约 v1 · 发源地结构化）：
 *   · `origin_code` = 结构化真源；`origin` = 写时反查生成的展示串（软冗余，不做人工编辑）。
 *   · 能判定到市/县的按三级落；只到省的止于一级；只到市的止于二级。
 *   · 世本 `zhonghua`（origin='中华'，非地名）= legacy 特例，**不改写**（origin_code 留空）。
 *   · 未被契约点名的树一律走「自动匹配」并**默认不落库**（加 `--include-auto` 才写）——
 *     不把猜测写成事实，映射先交 Zang/Neng 复核。
 *
 * 用法：
 *   node scripts/migrate-tree-origin.mjs                             # dry-run（默认，只打印映射表）
 *   node scripts/migrate-tree-origin.mjs --apply                     # 执行（写前自动备份）
 *   COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/migrate-tree-origin.mjs            # 副本演练（dry-run）
 *   COMPAT_OUT_DIR=/tmp/jiazu-copy node scripts/migrate-tree-origin.mjs --apply    # 副本演练（真写副本）
 *   COMPAT_META_FILE=/tmp/x/tree-meta.json node scripts/migrate-tree-origin.mjs    # 也可直接指 meta 文件
 *   node scripts/migrate-tree-origin.mjs --geo /tmp/geo.json                       # 换码表真源（默认 config/geo-divisions.json）
 *
 * 写前备份：`--apply` 时把目标 meta 复制到 `~/jiazu-backups/<YYYY-MM-DD>-<说明>/tree-meta.json`
 * （副本演练时为 `<YYYY-MM-DD>-migrate-tree-origin-copy`），并打印写入前后 md5。
 *
 * 码表来源：`--geo <file>` 显式传参（默认唯一真源 `config/geo-divisions.json`）—— **不读环境变量**，
 * 免得脚本依赖隐式状态；反查展示串走 `lib/geo.js`（其码表 = 随包产物，与真源由 `--check` 守卫一致）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SHOW_FILTER_NAMES, resolveOrigin } from '../cloudfunctions/compat-api/lib/geo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ---- 目标 meta 解析：与 lib/store.js 同序（COMPAT_META_FILE > COMPAT_OUT_DIR/tree-meta.json > 真源）----
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const META_FILE = process.env.COMPAT_META_FILE
  ? path.resolve(process.env.COMPAT_META_FILE)
  : process.env.COMPAT_OUT_DIR
    ? path.join(path.resolve(process.env.COMPAT_OUT_DIR), 'tree-meta.json')
    : REAL_META;
const IS_COPY = path.resolve(META_FILE) !== path.resolve(REAL_META);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includeAuto = args.includes('--include-auto');
/** 码表真源：显式 `--geo <file>`，缺省唯一真源（不读环境变量） */
const geoIdx = args.indexOf('--geo');
const GEO_TRUTH = geoIdx >= 0 ? path.resolve(args[geoIdx + 1]) : path.join(REPO, 'config', 'geo-divisions.json');

/**
 * 契约点名映射（**逐条核验**：code 均由 `config/geo-divisions.json` 反查确认，且与下方的
 * 名称自动匹配算法结论一致 —— 不一致则脚本直接报错，不静默落库）。
 *
 * 前 5 条 = Zang 契约 v1 点名；后 6 条 = 2026-09-20 Kevin 批准「契约外一并迁移（同规则、无歧义）」，
 * 与 `docs/geo-origin.spec.md` §8-2 的 11 行迁移表逐行相同（§8-3 已逐码核对存在）。
 * 特例 `zhonghua` 只在此登记「不改写」，`action='skip'`。
 */
const CONTRACT_MAP = [
  { tree: 'gu_39038_01', code: '231281', basis: '「黑龙江安达」→ 省「黑龙江」+ 县级「安达」（县级市，属 绥化市）' },
  { tree: 'ji_23395_01', code: '371325', basis: '「山东临沂费县新庄季家白露」→ 省+市「临沂」+ 县「费县」，尾巴「新庄季家白露」为村落地名不入级' },
  { tree: 'liu_21016_01', code: '370000', basis: '「山东」仅到省 → 止于一级' },
  { tree: 'qin_31206_01', code: '371323', basis: '「山东沂水」→ 省+县级「沂水」（属 临沂市）' },
  { tree: 'shen_27784_01', code: '371300', basis: '「山东临沂」仅到市 → 止于二级' },
  { tree: 'gu_39038', code: '330600', basis: '「浙江绍兴」→ 省「浙江」+ 市「绍兴」，可判定到二级（Kevin 2026-09-20 批准迁移）' },
  { tree: 'ji_23395', code: '371300', basis: '「山东临沂」仅到市 → 止于二级（Kevin 2026-09-20 批准迁移）' },
  { tree: 'qin_31206', code: '371300', basis: '「山东临沂」仅到市 → 止于二级（Kevin 2026-09-20 批准迁移）' },
  { tree: 'long_40857_01', code: '520000', basis: '「贵州」仅到省 → 止于一级（Kevin 2026-09-20 批准迁移）' },
  { tree: 'heng_24658_01', code: '210000', basis: '「辽宁」仅到省 → 止于一级（Kevin 2026-09-20 批准迁移）' },
  { tree: 'li_26446_02', code: '370000', basis: '「山东」仅到省 → 止于一级（Kevin 2026-09-20 批准迁移）' },
  { tree: 'zhonghua', code: '', special: true, basis: '世本 legacy 特例：origin=「中华」非行政区划地名，不改写' },
];

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const stripSuffix = (name, suffixes) => {
  for (const s of suffixes) if (name.endsWith(s)) return name.slice(0, -s.length);
  return name;
};
/** 别名（>=2 字；单字别名噪声太大，一律不用） */
const aliasesOf = (name, suffixes) => {
  const out = new Set([name]);
  const short = stripSuffix(name, suffixes);
  if (short) out.add(short);
  return [...out].filter((a) => a.length >= 2);
};

const PROV_SUFFIX = ['特别行政区', '自治区', '省', '市'];
const CITY_SUFFIX = ['自治州', '地区', '市', '盟', '林区', '新区'];
const COUNTY_SUFFIX = ['自治县', '自治旗', '市', '区', '县', '旗'];

/** 在 text 中找候选（长别名优先；同长同位置多命中 → 记为歧义） */
function candidatesIn(text, items, suffixes) {
  const hits = [];
  for (const it of items) {
    let best = '';
    for (const a of aliasesOf(it.name, suffixes)) {
      if (text.includes(a) && a.length > best.length) best = a;
    }
    if (best) hits.push({ ...it, alias: best });
  }
  if (!hits.length) return { hits: [], ambiguous: false };
  const maxLen = Math.max(...hits.map((h) => h.alias.length));
  const top = hits.filter((h) => h.alias.length === maxLen);
  return { hits: top, ambiguous: top.length > 1 };
}

/** 自由文本 → { code, basis }（无法判定 → { code: '', basis: 原因 }） */
function matchOrigin(text, provinces) {
  const raw = String(text || '').trim();
  if (!raw) return { code: '', basis: 'origin 为空串，无历史值可判定' };

  const prov = candidatesIn(raw, provinces.map((p) => ({ code: p.code, name: p.name, node: p })), PROV_SUFFIX);
  if (!prov.hits.length) return { code: '', basis: `无法匹配任何省级行政区（原值「${raw}」）` };
  if (prov.ambiguous) return { code: '', basis: `省级候选歧义：${prov.hits.map((h) => h.name).join(' / ')}` };
  const p = prov.hits[0].node;
  // 关键：下级只在该省别名**之后的余串**里找（否则「黑龙江安达」会误命中「龙江县」）
  const afterProv = raw.slice(raw.indexOf(prov.hits[0].alias) + prov.hits[0].alias.length);

  const city = candidatesIn(afterProv, p.cities || [], CITY_SUFFIX);
  if (city.ambiguous) return { code: '', basis: `地级候选歧义：${city.hits.map((h) => h.name).join(' / ')}` };
  const c = city.hits[0] || null;
  const afterCity = c ? afterProv.slice(afterProv.indexOf(c.alias) + c.alias.length) : afterProv;

  const countyPool = c ? c.counties || [] : (p.cities || []).flatMap((x) => x.counties || []);
  const county = candidatesIn(afterCity, countyPool, COUNTY_SUFFIX);
  if (county.ambiguous) return { code: '', basis: `县级候选歧义：${county.hits.map((h) => h.name).join(' / ')}` };
  const a = county.hits[0] || null;

  const parts = [`省「${p.name}」`];
  if (c) parts.push(`地级「${c.name}」`);
  if (a) parts.push(`县级「${a.name}」${c ? '' : '（由省内县级匹配唯一确定）'}`);
  if (!c && !a) parts.push(`（仅到省，余串「${afterProv}」未进入更细级别）`);
  return { code: (a || c || p).code, basis: `名称自动匹配：${parts.join(' + ')}` };
}

// ================= 主流程 =================
if (!fs.existsSync(META_FILE)) {
  console.error(`❌ 找不到 tree-meta：${META_FILE}`);
  process.exit(1);
}

const metaRaw = fs.readFileSync(META_FILE, 'utf8');
const meta = JSON.parse(metaRaw);
const beforeMd5 = md5(META_FILE);

const geoTruthRaw = fs.readFileSync(GEO_TRUTH, 'utf8');
const geoTruth = JSON.parse(geoTruthRaw);
const geoMd5 = crypto.createHash('md5').update(geoTruthRaw).digest('hex');
const provinces = geoTruth.provinces;
const filterNote = `展示串按契约过滤伪级名 ${SHOW_FILTER_NAMES.join('/')}`;

const contractByTree = new Map(CONTRACT_MAP.map((m) => [m.tree, m]));
const rows = [];
let changes = 0;

for (const [key, entry] of Object.entries(meta.trees || {})) {
  const treeId = entry.tree_id || key;
  const oldOrigin = String(entry.origin ?? '');
  const oldCode = String(entry.origin_code ?? '');
  const contract = contractByTree.get(treeId);

  let code = '';
  let basis = '';
  let special = false;
  let action = 'skip';
  let scope = '';

  if (contract) {
    scope = '契约点名';
    special = !!contract.special;
    basis = contract.basis;
    code = contract.code;
    if (special) {
      action = 'skip';
    } else {
      // 交叉核验：契约码必须与名称自动匹配结论一致（防「把猜测写成事实」）
      const auto = matchOrigin(oldOrigin, provinces);
      if (auto.code !== contract.code) {
        console.error(`❌ 契约映射与自动匹配不一致（${treeId}）：契约 ${contract.code} vs 自动 ${auto.code || '未判定'}（${auto.basis}）`);
        process.exit(1);
      }
      action = 'set';
    }
  } else {
    scope = '自动匹配';
    const auto = matchOrigin(oldOrigin, provinces);
    code = auto.code;
    basis = auto.basis;
    action = auto.code && includeAuto ? 'set' : auto.code ? 'auto-pending' : 'skip';
  }

  const display = code ? resolveOrigin(code).display : '';
  if (action === 'set') changes += 1;
  rows.push({ treeId, oldOrigin, oldCode, code, display, basis, special, action, scope });
}

// ---- 打印映射表 ----
const w = (s, n) => String(s).padEnd(n - [...String(s)].reduce((k, ch) => k + (ch.codePointAt(0) > 127 ? 2 : 1), 0));
console.log('═'.repeat(120));
console.log(`tree-meta：${META_FILE}${IS_COPY ? '（副本）' : '（★真源★）'}`);
console.log(`码表真源：${GEO_TRUTH}（md5 ${geoMd5}；本脚本只读，不写码表）`);
console.log(`md5（写入前）= ${beforeMd5}`);
console.log(`模式：${apply ? '--apply（写盘）' : 'dry-run（不写盘）'}${includeAuto ? ' + --include-auto' : ''}；${filterNote}`);
console.log('═'.repeat(120));
console.log(`${w('tree_id', 20)}${w('旧值', 32)}${w('新 code', 10)}${w('新展示串', 24)}${w('判定依据', 52)}是否特例`);
console.log('─'.repeat(130));
for (const r of rows) {
  console.log(
    `${w(r.treeId, 20)}${w(r.oldOrigin === '' ? '(空)' : r.oldOrigin, 32)}${w(r.code || '(不改)', 10)}` +
      `${w(r.display || '(不变)', 24)}${w(r.basis, 52)}${r.special ? '特例' : '—'}`,
  );
}
console.log('─'.repeat(130));
console.log(`共 ${rows.length} 棵：待写 ${changes} / 自动匹配待复核 ${rows.filter((r) => r.action === 'auto-pending').length} / 跳过 ${rows.filter((r) => r.action === 'skip').length}（含特例 ${rows.filter((r) => r.special).length}）`);

if (!apply || changes === 0) {
  const after = md5(META_FILE);
  console.log(`\nmd5（写入后）= ${after}  ${after === beforeMd5 ? '（未写盘，真源零改动 ✅）' : '（⚠️ 内容已变）'}`);
  if (!apply) console.log('（dry-run，未写盘。加 --apply 才真正写 meta。）');
  process.exit(0);
}

// ---- 备份 → 写入 ----
const stamp = new Date().toISOString().slice(0, 10);
const bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-${IS_COPY ? 'migrate-tree-origin-copy' : 'migrate-tree-origin'}`);
fs.mkdirSync(bakDir, { recursive: true });
const bakFile = path.join(bakDir, 'tree-meta.json');
let seq = 1;
let finalBak = bakFile;
while (fs.existsSync(finalBak)) finalBak = path.join(bakDir, `tree-meta.${++seq}.json`);
fs.copyFileSync(META_FILE, finalBak);

for (const r of rows) {
  if (r.action !== 'set') continue;
  const entry = Object.values(meta.trees).find((t) => (t.tree_id || '') === r.treeId) || meta.trees[r.treeId];
  entry.origin_code = r.code;
  entry.origin = r.display; // 反查覆盖：禁止保留手写串
}
fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

const afterMd5 = md5(META_FILE);
console.log(`\n📦 备份：${finalBak}（md5 ${beforeMd5}）`);
console.log(`md5（写入前）= ${beforeMd5}`);
console.log(`md5（写入后）= ${afterMd5}`);
console.log(`✅ 已写入 ${changes} 条 origin_code → ${META_FILE}`);
console.log(`   复核：node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));for(const t of Object.values(m.trees))console.log(t.tree_id, t.origin_code||'(空)', t.origin)" ${META_FILE}`);
