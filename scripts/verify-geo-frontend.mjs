#!/usr/bin/env node
/**
 * 前端发源地载荷的**独立验证脚本**（Kong · 2026-09-20）：两件事各用「另一套实现」交叉验证，不靠自证。
 *
 *   ① 自带 raw DEFLATE 解压器（`frontend/src/business/geo/inflate.ts`）—— 用 `tsc` 单文件转译到临时目录，
 *      再与 node `zlib.deflateSync/inflateRawSync` 做**模糊测试**：随机文本 + 真实载荷明文 + 各压缩级别/
 *      策略（含 level 0 存储块、Z_FIXED 固定霍夫曼、Z_RLE、Z_HUFFMAN_ONLY）+ 边界（空串 / 单字节 /
 *      全 CJK / 随机二进制转义）逐个 round-trip 比对。
 *   ② **已构建产物** `frontend/dist/build/mp-weixin/business/geo.js`（小程序主包里真正跑的那份代码，
 *      CommonJS 可直接 `require`）—— 断言 `provincesOf()` 与真源 `config/geo-divisions.json` 的 provinces
 *      **逐字段一致**（覆盖 base64 → inflate → UTF-8 → JSON.parse → 相对码还原全链路），并断言
 *      「直筒子市止于第二级」与「`origin_code` 缺失（undefined / null）不报错、不臆造」。
 *
 * 前置：先 `cd frontend && npm run build:mp-weixin`（② 需要构建产物）。
 * 用法：node scripts/verify-geo-frontend.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const TRUTH = path.join(REPO, 'config', 'geo-divisions.json');
const INFLATE_TS = path.join(REPO, 'frontend', 'src', 'business', 'geo', 'inflate.ts');
const FRONTEND_PRODUCT = path.join(REPO, 'frontend', 'src', 'business', 'geo', 'divisions.json');
const BUILT_MODULE = path.join(REPO, 'frontend', 'dist', 'build', 'mp-weixin', 'business', 'geo.js');

let checks = 0;
const ok = (msg) => {
  checks += 1;
  console.log(`  ✓ ${msg}`);
};
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
};

// ---------- ① 自研解压器 vs node zlib：模糊测试 ----------

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-inflate-'));
const TSC = path.join(REPO, 'frontend', 'node_modules', '.bin', 'tsc');
if (!fs.existsSync(TSC)) throw new Error(`找不到 tsc：${TSC}`);
/** `--typeRoots` 指向空目录：只转译本文件，不自动拉起 `@types/*`（本机 TS 4.9 与新版 @types/node 语法不兼容） */
const EMPTY_TYPES = path.join(TMP, 'no-types');
fs.mkdirSync(EMPTY_TYPES, { recursive: true });
execFileSync(
  TSC,
  [INFLATE_TS, '--target', 'ES2020', '--module', 'ES2020', '--lib', 'ES2020', '--typeRoots', EMPTY_TYPES, '--skipLibCheck', '--outDir', TMP],
  { cwd: path.join(REPO, 'frontend'), stdio: 'pipe' },
);
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module"}\n');
const { inflateBase64ToUtf8 } = await import(path.join(TMP, 'inflate.js'));

/** 确定性伪随机（可复现；不用 Math.random） */
let seed = 20260920;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const randChars = (chars, n) => Array.from({ length: n }, () => chars[Math.floor(rnd() * chars.length)]).join('');

const CJK = '市区县镇街道省市自治旗盟东西南北中正松山信义大安屯桥溪城乡';
const ASCII = 'abcXYZ019-|_.,:;[]{}()"\'\\/=+*&^%$#@!?<>~` ';
const cases = [
  ['空串', ''],
  ['单字节', 'a'],
  ['中文单字', '京'],
  ['纯 ASCII 短串', randChars(ASCII, 37)],
  ['纯 CJK 短串', randChars(CJK, 17)],
  ['混合 1 KiB', randChars(CJK + ASCII, 1024)],
  ['混合 64 KiB', randChars(CJK + ASCII, 65536)],
  ['高度重复 200 KiB（触发长回拷）', '北京市东城区'.repeat(30000)],
  ['代理对（表情 / 生僻字）', '𠀀𠀁𠀂'.repeat(500)],
];
// 真实载荷明文（79 KB 量级）：从产物里用 node zlib 解出，再按各压缩参数回压，验自家解压器
const payload = JSON.parse(fs.readFileSync(FRONTEND_PRODUCT, 'utf8'));
cases.push(['真实载荷明文（前 200 字节起）', zlib.inflateRawSync(Buffer.from(payload.g, 'base64')).toString('utf8')]);

const PARAMS = [
  { level: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY },
  { level: 6, strategy: zlib.constants.Z_DEFAULT_STRATEGY },
  { level: 1, strategy: zlib.constants.Z_DEFAULT_STRATEGY },
  { level: 0, strategy: zlib.constants.Z_DEFAULT_STRATEGY }, // 存储块
  { level: 9, strategy: zlib.constants.Z_FIXED }, // 固定霍夫曼块
  { level: 9, strategy: zlib.constants.Z_RLE },
  { level: 9, strategy: zlib.constants.Z_HUFFMAN_ONLY },
];

console.log('① 自研 raw DEFLATE 解压器 vs node zlib（转译后模糊测试）');
let rounds = 0;
for (const [label, text] of cases) {
  const raw = Buffer.from(text, 'utf8');
  for (const opt of PARAMS) {
    for (const tuning of [{}, { memLevel: 9, windowBits: 15 }, { memLevel: 1, windowBits: 9 }]) {
      const deflated = zlib.deflateRawSync(raw, { ...opt, ...tuning });
      const b64 = deflated.toString('base64');
      let got;
      try {
        got = inflateBase64ToUtf8(b64);
      } catch (e) {
        fail(`${label} level=${opt.level} strategy=${opt.strategy} tuning=${JSON.stringify(tuning)} 抛错：${e.message}`);
        continue;
      }
      rounds += 1;
      if (got !== text) fail(`${label} level=${opt.level} strategy=${opt.strategy} tuning=${JSON.stringify(tuning)} round-trip 不一致`);
    }
  }
}
// 真实载荷：自家解压器解出的文本必须与 node zlib 解出的完全相同（逐字节）
{
  const viaZlib = zlib.inflateRawSync(Buffer.from(payload.g, 'base64')).toString('utf8');
  const viaSelf = inflateBase64ToUtf8(payload.g);
  if (viaSelf === viaZlib) ok(`真实前端载荷 round-trip 一致（${Buffer.byteLength(viaZlib)} 字节明文 / ${payload.g.length} 字节 base64）`);
  else fail('真实前端载荷 round-trip 不一致');
}
ok(`模糊测试 ${rounds} 组 round-trip（${cases.length} 个样本 × ${PARAMS.length} 压缩参数 × 3 组 memLevel/windowBits）全部逐字节一致`);

// ---------- ② 已构建小程序产物（真正跑的代码）----------

console.log('② 已构建产物 frontend/dist/build/mp-weixin/business/geo.js（须先 build:mp-weixin）');
if (!fs.existsSync(BUILT_MODULE)) {
  fail(`构建产物不存在：${BUILT_MODULE}（先 cd frontend && npm run build:mp-weixin）`);
} else {
  const require = createRequire(import.meta.url);
  const geo = require(BUILT_MODULE);
  const truth = JSON.parse(fs.readFileSync(TRUTH, 'utf8'));
  const plain = JSON.parse(JSON.stringify(geo.provincesOf()));

  if (JSON.stringify(plain) === JSON.stringify(truth.provinces)) {
    ok(`provincesOf() 与真源 provinces 逐字段一致（35 一级 / 369 地级 / 3367 县级，共 3771 项）`);
  } else {
    fail('provincesOf() 与真源 provinces 不一致');
  }
  const flat = plain.flatMap((p) => [p.code, ...p.cities.map((c) => c.code), ...p.cities.flatMap((c) => c.counties.map((a) => a.code))]);
  if (flat.every((c) => /^\d{6}$/.test(c))) ok(`解压还原后 ${flat.length} 个码全为 6 位（无街道 / 镇级 9 位残项）`);
  else fail('解压还原后仍有非 6 位码');

  // 直筒子市：止于第二级（第三列不渲染的依据 = isTerminalCity）
  for (const [code, display] of [
    ['441900', '广东省东莞市'],
    ['442000', '广东省中山市'],
    ['460400', '海南省儋州市'],
    ['620200', '甘肃省嘉峪关市'],
  ]) {
    const t = geo.isTerminalCity(code.slice(0, 2) + '0000', code);
    const r = geo.resolveNames(code);
    const empty = geo.countiesOf(code.slice(0, 2) + '0000', code).length === 0;
    if (t && empty && r.display === display) ok(`直筒子市 ${code} → isTerminalCity=true / 县级列表为空 / display=「${display}」`);
    else fail(`直筒子市 ${code} 判定异常：isTerminalCity=${t} empty=${empty} display=${JSON.stringify(r.display)}`);
  }
  if (!geo.isTerminalCity('370000', '371300')) ok('普通地级（371300 临沂市）isTerminalCity=false（仍会渲染第三列）');
  else fail('普通地级被误判为终止');

  // origin_code 缺失（undefined / null）：不报错、不臆造、归一为空
  const missing = [
    ['resolveNames(undefined)', geo.resolveNames(undefined), { province: '', city: '', county: '', display: '' }],
    ['resolveNames(null)', geo.resolveNames(null), { province: '', city: '', county: '', display: '' }],
    ['resolveNames("")', geo.resolveNames(''), { province: '', city: '', county: '', display: '' }],
    ['pathOfCode(undefined)', geo.pathOfCode(undefined), { province: null, city: null, county: null }],
    ['pathOfCode(null)', geo.pathOfCode(null), { province: null, city: null, county: null }],
    ['countiesOf(undefined,undefined)', geo.countiesOf(undefined, undefined), []],
    ['isTerminalCity(undefined,undefined)', geo.isTerminalCity(undefined, undefined), false],
  ];
  for (const [label, got, want] of missing) {
    if (JSON.stringify(got) === JSON.stringify(want)) ok(`${label} → ${JSON.stringify(got)}（不报错、不出现 undefined 字样）`);
    else fail(`${label} → ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`);
  }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${process.exitCode ? '❌ 有断言失败' : '✅ 全部通过'}：${checks} 项检查`);
