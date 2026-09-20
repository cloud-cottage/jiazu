#!/usr/bin/env node
/**
 * 由**唯一真源** `config/geo-divisions.json` 生成两份产物（**形状不同**，各自服务于所在运行时的硬约束）：
 *
 *   ① 云函数随包 `cloudfunctions/compat-api/lib/geo/divisions.json`
 *      = 真源的**全量紧凑序列化**（含 `_meta` 全文），与真源逐字段 1:1；供 `lib/geo.js` 静态 JSON import
 *        （esbuild 把 JSON 内联进 `cloudfunctions/deploy/compat-api/index.js`，云端实例工作目录不需要 `config/`）。
 *   ② 前端随包 `frontend/src/business/geo/divisions.json`
 *      = **紧凑 + deflate 压缩**（**不含 `_meta`**），由 `frontend/src/business/geo.ts` 解压还原。
 *
 * 为什么两份形状不同（2026-09-20 实测裁定，勿改回同一形状）：
 *   · 微信小程序**主包上限 2 MiB**：`src/static/**` 被 uni-app **原样拷贝**进产物，但运行时**根本不读**它
 *     ⇒ 纯死重（实测 152 KiB）。`src/business/**` 走 bundler（压缩后并入 JS）⇒ 前端数据产物必须放源码目录，
 *     **不得放回 `src/static/`**：真源放回即主包越限（本脚本 `--check` 对旧 `src/static` 死重直接判失败）。
 *   · 且前端只需六元信息（省码 / 省名 / 市相对码 / 市名 / 县相对码 / 县名）；实测体量：
 *     全量 JSON 明文 156 KB → 数组化 + 相对码 79 KB → deflateRaw + base64 **31 KB** —— 这是把主包压回
 *     1.95 MiB 以内的关键。云函数侧不压缩（`lib/geo.js` 直接吃 JSON，且云函数包体不受小程序上限约束）。
 *
 * 前端产物形状（**改这里必须同步改 `frontend/src/business/geo.ts` 的 `decodePayload()`**）：
 *   { "v": 1, "g": "<base64(deflateRaw(明文 UTF-8))>" }
 *   明文 = 一维数组（数据集顺序）：
 *     [ [省 6 位码, 省名, [ [市 2 位相对码, 市名, [ [县 2 位相对码, 县名], ... ] ], ... ] ], ... ]
 *   · 市 2 位相对码 = 市码第 3–4 位（还原：省码前 2 位 + 该 2 位 + `00`）
 *   · 县 2 位相对码 = 县码第 5–6 位（还原：市码前 4 位 + 该 2 位）
 *   · 上述「相对码可还原」由本脚本生成时**断言**（不满足即抛错，绝不静默降级）；还原逻辑仅两处（此处生成 + geo.ts 消费）。
 *   · 不含 `_meta`：前端运行时不需要（来源登记见真源 `_meta` 与产物①）。
 *   · 用 base64 而非 `\uXXXX` 转义：deflate 输出含控制字节，转义会显著膨胀（base64 = 4/3，转义 ≥ 2×）。
 *
 * 口径（勿造第二套真源）：
 *   · 只有 `config/geo-divisions.json` 是人工维护的真源；两份产物都是**生成物**，禁止手工编辑，也不得反向手改产物。
 *   · 幂等：真源不变 ⇒ 产物字节不变（`deflateRawSync(level=9)` 输出确定）。
 *   · `--check` 只校验不写（CI / 一致性守卫用）：任一产物缺失 / 与真源不一致 / 前端载荷还原不出真源 /
 *     已废弃的 `frontend/src/static/geo/divisions.json` 死重仍在 ⇒ **exit 1**（非零退出 = 需重生成或清理）。
 *
 * 用法：
 *   node scripts/gen-geo-divisions.mjs           # 生成/更新两份产物（并清掉已废弃的 src/static 死重）
 *   node scripts/gen-geo-divisions.mjs --check   # 只校验（不写盘）
 *   node scripts/gen-geo-divisions.mjs --out /tmp/x.json [--compact]   # 只写一个文件（演练；--compact 写前端形状）
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const TRUTH = path.join(REPO, 'config', 'geo-divisions.json');

const BACKEND_PRODUCT = path.join(REPO, 'cloudfunctions', 'compat-api', 'lib', 'geo', 'divisions.json');
const FRONTEND_PRODUCT = path.join(REPO, 'frontend', 'src', 'business', 'geo', 'divisions.json');
/** 已废弃：uni-app 对 `src/static/**` 原样拷贝进产物 ⇒ 小程序主包死重（曾把主包顶到 2.139 MiB 越限） */
const LEGACY_FRONTEND_PRODUCT = path.join(REPO, 'frontend', 'src', 'static', 'geo', 'divisions.json');

/** 两份产物（形状 + 渲染函数；顺序 = 打印顺序） */
export const PRODUCTS = [
  { path: BACKEND_PRODUCT, shape: '全量紧凑 JSON（含 _meta）', render: renderBackend },
  { path: FRONTEND_PRODUCT, shape: '紧凑 + deflateRaw + base64（无 _meta）', render: renderFrontend },
];

const CODE_RE = /^\d{6}$/;

/** 真源 → 解析后的配置（先解析：真源格式坏掉时立刻抛出，而不是把坏内容复制过去） */
function parseTruth(truthPath = TRUTH) {
  const cfg = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
  if (!cfg?._meta?.source_sha256) throw new Error('真源缺少 _meta.source_sha256，请先跑 scripts/build-geo-divisions.mjs');
  if (!Array.isArray(cfg.provinces) || !cfg.provinces.length) throw new Error('真源 provinces 为空');
  return cfg;
}

/** 真源运行期形状守卫（生成前拦下会被前端静默解错的数据） */
function assertTruthShape(cfg) {
  const bad = [];
  for (const p of cfg.provinces) {
    if (!CODE_RE.test(p.code)) bad.push(`省 ${p.code}`);
    for (const c of p.cities || []) {
      if (!CODE_RE.test(c.code)) bad.push(`市 ${p.name}/${c.code}`);
      if (c.code.slice(0, 2) !== p.code.slice(0, 2) || c.code.slice(4, 6) !== '00') bad.push(`市码不可由相对码还原 ${c.code}（上级 ${p.code}）`);
      for (const a of c.counties || []) {
        if (!CODE_RE.test(a.code)) bad.push(`县 ${p.name}/${c.name}/${a.code}`);
        if (a.code.slice(0, 4) !== c.code.slice(0, 4)) bad.push(`县码不可由相对码还原 ${a.code}（上级 ${c.code}）`);
      }
    }
  }
  if (bad.length) throw new Error(`真源形状不合产物契约（前 5 条）：\n  - ${bad.slice(0, 5).join('\n  - ')}`);
}

/** 产物①：真源全量紧凑序列化（`lib/geo.js` 静态 import 的源） */
export function renderBackend(truthPath = TRUTH) {
  return `${JSON.stringify(parseTruth(truthPath))}\n`;
}

/** 产物②：紧凑数组 → deflateRaw → base64（前端随包；见文件头形状说明） */
export function renderFrontend(truthPath = TRUTH) {
  const cfg = parseTruth(truthPath);
  assertTruthShape(cfg);
  const rows = cfg.provinces.map((p) => [
    p.code,
    p.name,
    (p.cities || []).map((c) => [
      c.code.slice(2, 4),
      c.name,
      (c.counties || []).map((a) => [a.code.slice(4, 6), a.name]),
    ]),
  ]);
  const g = zlib.deflateRawSync(Buffer.from(JSON.stringify(rows), 'utf8'), { level: 9 }).toString('base64');
  return `${JSON.stringify({ v: 1, g })}\n`;
}

/**
 * 产物② → 真源 `provinces` 形状（**校验用**，与 `geo.ts` 的 `decodePayload()` 同算法；
 * 此处刻意用 node `zlib.inflateRawSync` 而非自研 inflate —— 跨实现交叉验证，避免自证）。
 */
export function decodeFrontend(payloadText) {
  const { v, g } = JSON.parse(payloadText);
  if (v !== 1 || typeof g !== 'string') throw new Error('前端产物载荷版本/形状不合契约（期望 {v:1,g:<base64>}）');
  const rows = JSON.parse(zlib.inflateRawSync(Buffer.from(g, 'base64')).toString('utf8'));
  return rows.map(([pCode, pName, cities]) => ({
    code: pCode,
    name: pName,
    cities: cities.map(([cSub, cName, counties]) => {
      const cCode = `${pCode.slice(0, 2)}${cSub}00`;
      return {
        code: cCode,
        name: cName,
        counties: counties.map(([aSub, aName]) => ({ code: cCode.slice(0, 4) + aSub, name: aName })),
      };
    }),
  }));
}

/** 产物② 与真源 `provinces` 的逐字段一致性（真源单一性的机器守卫） */
function verifyFrontendPayload(frontendText, truthPath = TRUTH) {
  const cfg = parseTruth(truthPath);
  const got = decodeFrontend(frontendText);
  const want = cfg.provinces;
  if (got.length !== want.length) throw new Error(`前端载荷还原后一级项数不符：${got.length} ≠ ${want.length}`);
  for (let i = 0; i < want.length; i++) {
    if (got[i].code !== want[i].code || got[i].name !== want[i].name) throw new Error(`前端载荷省级项不符：${JSON.stringify(got[i])} ≠ ${JSON.stringify(want[i])}`);
    const gc = got[i].cities;
    const wc = want[i].cities || [];
    if (gc.length !== wc.length) throw new Error(`前端载荷 ${want[i].name} 地级数不符：${gc.length} ≠ ${wc.length}`);
    for (let j = 0; j < wc.length; j++) {
      if (gc[j].code !== wc[j].code || gc[j].name !== wc[j].name) throw new Error(`前端载荷地级项不符：${JSON.stringify(gc[j])} ≠ ${JSON.stringify(wc[j])}`);
      const ga = gc[j].counties;
      const wa = wc[j].counties || [];
      if (ga.length !== wa.length) throw new Error(`前端载荷 ${wc[j].name} 县级数不符：${ga.length} ≠ ${wa.length}`);
      for (let k = 0; k < wa.length; k++) {
        if (ga[k].code !== wa[k].code || ga[k].name !== wa[k].name) throw new Error(`前端载荷县级项不符：${JSON.stringify(ga[k])} ≠ ${JSON.stringify(wa[k])}`);
      }
    }
  }
  return got;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const compact = argv.includes('--compact');
  const outIdx = argv.indexOf('--out');
  /** `--out` = 演练口（只写该文件）；缺省 = 两份进仓产物 */
  const targets = outIdx >= 0 ? [{ path: path.resolve(argv[outIdx + 1]), render: compact ? renderFrontend : renderBackend }] : PRODUCTS;

  if (check) {
    const bad = [];
    for (const f of PRODUCTS) {
      if (!fs.existsSync(f.path)) {
        console.error(`❌ 产物缺失：${f.path}\n   请运行 node scripts/gen-geo-divisions.mjs`);
        bad.push(f.path);
        continue;
      }
      const cur = fs.readFileSync(f.path, 'utf8');
      if (cur !== f.render()) {
        console.error(`❌ 产物与真源不一致：${f.path}\n   请重新运行 node scripts/gen-geo-divisions.mjs`);
        bad.push(f.path);
      }
    }
    if (fs.existsSync(LEGACY_FRONTEND_PRODUCT)) {
      console.error(
        `❌ 已废弃的前端静态产物仍在：${LEGACY_FRONTEND_PRODUCT}\n` +
          '   uni-app 会把 src/static/** 原样拷贝进小程序产物（运行时读不到/用不上）⇒ 主包死重、直接顶穿 2 MiB 上限。\n' +
          '   修复：rm -rf frontend/src/static/geo（前端产物现已生成到 frontend/src/business/geo/）',
      );
      bad.push(LEGACY_FRONTEND_PRODUCT);
    }
    try {
      verifyFrontendPayload(fs.readFileSync(FRONTEND_PRODUCT, 'utf8'));
    } catch (e) {
      console.error(`❌ 前端产物载荷无法还原真源：${e.message}`);
      bad.push(FRONTEND_PRODUCT);
    }
    if (bad.length) process.exit(1);
    console.log(`✅ 真源（唯一真源，不参与比对、只作基准）：${TRUTH}（${fs.statSync(TRUTH).size} 字节，md5 ${crypto.createHash('md5').update(fs.readFileSync(TRUTH)).digest('hex')}）`);
    for (const f of PRODUCTS) console.log(`✅ 产物与真源一致（${f.path}，${fs.statSync(f.path).size} 字节，形状：${f.shape}）`);
    console.log('✅ 前端载荷可还原：deflateRaw 解压 + 相对码还原后与真源 provinces 逐字段一致');
    console.log('✅ 无废弃静态产物：frontend/src/static/geo/divisions.json 不存在（主包死重守卫）');
    console.log(`— 三件一致：真源 1 + 产物 ${PRODUCTS.length}（形状各异，同源于唯一真源；前端载荷可还原性已校验）`);
    process.exit(0);
  }

  let wrote = 0;
  for (const f of targets) {
    const want = f.render();
    const cur = fs.existsSync(f.path) ? fs.readFileSync(f.path, 'utf8') : null;
    if (cur === want) {
      console.log(`↺ 产物已是最新，未改写（${f.path}，${Buffer.byteLength(want)} 字节）`);
      continue;
    }
    fs.mkdirSync(path.dirname(f.path), { recursive: true });
    fs.writeFileSync(f.path, want, 'utf8');
    wrote += 1;
    console.log(`✅ 已生成 ${f.path}（${Buffer.byteLength(want)} 字节）`);
  }

  if (outIdx < 0) {
    // 旧静态产物是主包死重，生成时顺手清掉（目录空则删目录）；`--check` 侧同样守卫
    if (fs.existsSync(LEGACY_FRONTEND_PRODUCT)) {
      fs.rmSync(LEGACY_FRONTEND_PRODUCT);
      const dir = path.dirname(LEGACY_FRONTEND_PRODUCT);
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      console.log(`🧹 已删除废弃的前端静态产物（主包死重）：${LEGACY_FRONTEND_PRODUCT}`);
    }
    const payload = fs.readFileSync(FRONTEND_PRODUCT, 'utf8');
    verifyFrontendPayload(payload);
    const cfg = parseTruth();
    const counties = cfg.provinces.reduce((n, p) => n + p.cities.reduce((m, c) => m + c.counties.length, 0), 0);
    console.log(`— 共 ${targets.length} 份产物，本次改写 ${wrote} 份；真源 ${cfg.provinces.length} 一级 / ${cfg.provinces.reduce((n, p) => n + p.cities.length, 0)} 地级 / ${counties} 县级`);
    console.log(`— 前端载荷已自校验：解压还原后与真源 provinces 逐字段一致（${Buffer.byteLength(payload)} 字节，source_sha256=${cfg._meta.source_sha256}）`);
  }
}
