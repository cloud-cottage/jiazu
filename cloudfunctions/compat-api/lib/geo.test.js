/**
 * 发源地结构化单测 —— `lib/geo.js` 反查 + 数据产物一致性 + 写路径 400 口径 + `PUT /tree-meta` 接线
 *
 * 契约（Zang 契约 v1，2026-09-20；规格 = `docs/geo-origin.spec.md`）：
 *   · `origin_code` = 结构化真源（**6 位行政区划代码字符串**；空串 = 合法「未结构化」）；
 *   · `origin` = 写时由名称表**反查生成**的展示串（软冗余）；未知码 → **400**，文案逐字
 *     「发源地行政区划代码无效：<码>」；
 *   · 展示串 = 各级 name 顺序拼接，**过滤伪级名**（唯一真源 = `geo.js` 的 `SHOW_FILTER_NAMES`）；
 *     缺级合法（只到省 / 只到市）；
 *   · 只给 `origin_code=''` 时**不覆写** `origin`（legacy 兼容）；只给 `origin` 时仍直写（legacy 分支）；
 *   · 数据随云函数包 = **静态 JSON import**（`lib/geo/divisions.json`，esbuild 内联），无运行期读盘。
 *
 * 覆盖：
 *   U1  省 / 市 / 县三级反查（含 2 位省级码兼容分支）+ 未命中 → null
 *   U2  直辖市 110000/110100/110101 → 「北京市东城区」（伪级 `市辖区` 被过滤）
 *   U3  港澳（省 / 地级 / 县级三级；允许只落 L1）
 *   U4  海外哨兵码 999999（一级唯一项、无下级、名义逐字「海外」）
 *   U5  台湾省 12 条契约示例**逐条**（码值 / 名称 / 展示串）
 *   U6  台湾省结构：L2 = 22、L3 = 368（Kevin 口径「约 368 项」）
 *   U7  伪级名过滤：整名精确匹配（`市辖区` 过滤；`东城区` / `费县` 不得过滤）
 *   U8  缺级拼接：只到省 → 「山东省」；只到市 → 「山东省临沂市」
 *   U9  未知码 / 非 6 位 / 空码 / null → `display=''` + `isKnownOriginCode=false`（不抛）
 *   U10 三份数据件一致（`--check` exit 0 + 渲染确定性 + 两份产物各自与真源一致 + 前端载荷可还原 + 无静态死重）
 *   U11 真源结构完整性：计数 35 / 369 / 3,367、`_meta.source_sha256` 复算一致、**零非 6 位码**
 *   U12 写路径 400 口径（lib 层）：`createTree` / `createClanTree` 非法码 → 400 + 逐字文案
 *   U13 直筒子市（东莞 441900 / 中山 442000 / 儋州 460400 / 嘉峪关 620200）：无下级、止于第二级（码仍合法）
 *   R1  路由 `PUT /tree-meta`：合法码 → 反查覆盖 `origin`；未知码 → 400；空码不覆写；legacy 直写保留
 *   Z1  真源零写入（收尾）：`config/geo-divisions.json` / `config/tree-meta.json` / 两份产物 md5 逐字节未变
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本；本文件**只读**真源，
 * 收尾用 Z1 逐字节断言（沿用 `lib/*.test.js` 惯例）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const TRUTH = path.join(REPO, 'config', 'geo-divisions.json');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
/** 两份产物（**形状不同**）：云函数侧 = 真源全量紧凑 JSON；前端侧 = 紧凑数组 + base64(deflateRaw)、无 `_meta` */
const BACKEND_PRODUCT = path.join(HERE, 'geo', 'divisions.json');
const FRONTEND_PRODUCT = path.join(REPO, 'frontend', 'src', 'business', 'geo', 'divisions.json');
/** 已废弃：`frontend/src/static/geo/divisions.json` —— uni-app 原样拷贝 `src/static/**` ⇒ 小程序主包死重 */
const LEGACY_PRODUCT = path.join(REPO, 'frontend', 'src', 'static', 'geo', 'divisions.json');
const PRODUCTS = [BACKEND_PRODUCT, FRONTEND_PRODUCT];
const GEN_SCRIPT = path.join(REPO, 'scripts', 'gen-geo-divisions.mjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-geo-'));
const META_FILE = path.join(TMP, 'tree-meta.json');

// ---- 沙箱：meta 写路径一律落 /tmp 副本（必须在导入 index.js 之前设好）----
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = META_FILE;

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

const TRUTH_MD5 = md5(TRUTH);
const REAL_META_MD5 = md5(REAL_META);
const PRODUCT_MD5 = PRODUCTS.map((f) => md5(f));
const truth = JSON.parse(fs.readFileSync(TRUTH, 'utf8'));

// ---- 路由夹具：家族树 t_geo（legacy origin）+ 世本 zhonghua（中华特例）----
const CHIEF = '16600000907';
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({ [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' } }),
);
const FIXTURE = () => ({
  _schema: '1.1',
  trees: {
    zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, display_title: '中华世本', origin: '中华', origin_code: '' },
    t_geo: { tree_id: 't_geo', kind: 'family', display_title: '季氏测试家族', origin: '旧自由文本', origin_code: '' },
  },
});
fs.writeFileSync(META_FILE, JSON.stringify(FIXTURE(), null, 2) + '\n');

const geo = await import('./geo.js');
const tw = await import('./tree-write.js');
const clan = await import('./clan.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');
const { renderBackend, renderFrontend, decodeFrontend } = await import('../../../scripts/gen-geo-divisions.mjs');

const CHIEF_TOKEN = signJwt({ sub: CHIEF, phone: CHIEF, role: 'chief_editor' }, 3600);

/** PUT /tree-meta（chief_editor） */
async function putMeta(body) {
  const res = await handleRequest({
    path: '/tree-meta',
    httpMethod: 'PUT',
    headers: { authorization: `Bearer ${CHIEF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.statusCode, body: JSON.parse(res.body), saved: JSON.parse(fs.readFileSync(META_FILE, 'utf8')) };
}

// ================= U1 三级反查 =================

test('U1 省 / 市 / 县三级反查（含数据集原生 2 位省级码兼容分支）+ 未命中 → null', () => {
  assert.equal(geo.findProvince('370000').name, '山东省');
  assert.equal(geo.findProvince('37').name, '山东省', '2 位省级码兼容分支（真源全是 6 位，此分支仅为容错）');
  assert.equal(geo.findCity('371300').name, '临沂市');
  assert.equal(geo.findCounty('371325').name, '费县');
  assert.equal(geo.findCounty('371323').name, '沂水县');
  assert.equal(geo.findCounty('231281').name, '安达市');
  // 未知 / 空 / 非 6 位 → null（不抛）
  assert.equal(geo.findProvince('999998'), null);
  assert.equal(geo.findCity(''), null);
  assert.equal(geo.findCounty('3713'), null);
  assert.equal(geo.findCounty(null), null);
  // 层级不串门：市码不是县、县码不是市
  assert.equal(geo.findCounty('371300'), null);
  assert.equal(geo.findCity('371325'), null);
});

// ================= U2 直辖市 =================

test('U2 直辖市：110000/110100/110101 → 展示串「北京市东城区」（伪级 L2 被过滤）', () => {
  const r = geo.resolveOrigin('110101');
  assert.equal(r.level1.name, '北京市');
  assert.equal(r.level2.name, '市辖区', '存储层保留伪级节点（否则 L3 的父级悬空）');
  assert.equal(r.level3.name, '东城区');
  assert.equal(r.display, '北京市东城区');
  assert.equal(geo.resolveOrigin('110100').display, '北京市', 'L2 自身 = 伪级 → 只剩省名');
  assert.equal(geo.resolveOrigin('110000').display, '北京市');
});

// ================= U3 港澳 =================

test('U3 港澳：省级 / 地级 / 县级三级形态，允许只落 L1', () => {
  assert.equal(geo.resolveOrigin('810000').display, '香港特别行政区');
  assert.equal(geo.resolveOrigin('810100').display, '香港特别行政区香港岛');
  assert.equal(geo.resolveOrigin('810101').display, '香港特别行政区香港岛中西区');
  assert.equal(geo.resolveOrigin('820000').display, '澳门特别行政区');
  assert.equal(geo.resolveOrigin('820101').display, '澳门特别行政区澳门半岛大堂区');
});

// ================= U4 海外 =================

test('U4 海外哨兵码 999999：一级唯一项、无下级、名义逐字「海外」', () => {
  assert.equal(geo.OVERSEAS_CODE, '999999');
  assert.equal(geo.OVERSEAS_NAME, '海外');
  const p = geo.findProvince('999999');
  assert.equal(p.name, '海外');
  assert.deepEqual(p.cities, [], '海外无下级');
  assert.equal(geo.resolveOrigin('999999').display, '海外');
  assert.equal(geo.isKnownOriginCode('999999'), true);
  const last = geo.allProvinces().at(-1);
  assert.equal(last.code, '999999', 'L1 菜单末位 = 海外');
});

// ================= U5 台湾省 12 条契约示例 =================

test('U5 台湾省 12 条契约示例逐条（码 → 市+区 / 展示串）', () => {
  const CASES = [
    ['710104', '台北市', '中正区', '台湾省台北市中正区'],
    ['710111', '台北市', '士林区', '台湾省台北市士林区'],
    ['710201', '新北市', '板桥区', '台湾省新北市板桥区'],
    ['710211', '新北市', '淡水区', '台湾省新北市淡水区'],
    ['710301', '桃园市', '桃园区', '台湾省桃园市桃园区'],
    ['710302', '桃园市', '中坜区', '台湾省桃园市中坜区'],
    ['710402', '台中市', '西屯区', '台湾省台中市西屯区'],
    ['710405', '台中市', '南屯区', '台湾省台中市南屯区'],
    ['710510', '台南市', '安平区', '台湾省台南市安平区'],
    ['710503', '台南市', '东区', '台湾省台南市东区'],
    ['710606', '高雄市', '苓雅区', '台湾省高雄市苓雅区'],
    ['710603', '高雄市', '左营区', '台湾省高雄市左营区'],
  ];
  for (const [code, city, county, display] of CASES) {
    const r = geo.resolveOrigin(code);
    assert.equal(r.level1.name, '台湾省', `${code} L1`);
    assert.equal(r.level2.name, city, `${code} L2`);
    assert.equal(r.level3.name, county, `${code} L3`);
    assert.equal(r.display, display, `${code} 展示串`);
    assert.equal(geo.isKnownOriginCode(code), true, `${code} 合法`);
  }
});

// ================= U6 台湾省结构 =================

test('U6 台湾省结构：L2 = 22（6 市 + 3 省辖市 + 13 县）、L3 = 368', () => {
  const tw = geo.findProvince('710000');
  assert.equal(tw.name, '台湾省');
  assert.equal(tw.cities.length, 22);
  assert.equal(tw.cities.reduce((n, c) => n + c.counties.length, 0), 368);
  assert.equal(geo.findCity('710100').name, '台北市');
  assert.equal(geo.findCity('712200').name, '连江县', '上游未含、项目按行政区划通名补全');
  assert.equal(geo.findCity('712100').name, '金门县');
});

// ================= U7 伪级名过滤 =================

test('U7 伪级名过滤：整名精确匹配（伪级名整名被滤；真名含「区/县」不得被滤）', () => {
  assert.deepEqual(geo.SHOW_FILTER_NAMES, ['市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划']);
  for (const n of geo.SHOW_FILTER_NAMES) {
    const lvl = [geo.resolveOrigin('110101').level1, { name: n }, { name: '东城区' }].filter(Boolean);
    assert.equal(lvl.filter((x) => !geo.SHOW_FILTER_NAMES.includes(x.name)).map((x) => x.name).join(''), '北京市东城区', `「${n}」应被过滤`);
  }
  // 真名「东城区」「费县」逐字不等于伪级名 → 保留
  assert.equal(geo.resolveOrigin('371325').display.endsWith('费县'), true);
  assert.equal(geo.resolveOrigin('110101').display.endsWith('东城区'), true);
});

// ================= U8 缺级拼接 =================

test('U8 缺级合法：只到省 → 「山东省」；只到市 → 「山东省临沂市」', () => {
  assert.equal(geo.resolveOrigin('370000').display, '山东省');
  assert.equal(geo.resolveOrigin('371300').display, '山东省临沂市');
  assert.equal(geo.resolveOrigin('371325').display, '山东省临沂市费县');
  assert.equal(geo.resolveOrigin('231281').display, '黑龙江省绥化市安达市');
  assert.equal(geo.resolveOrigin('710000').display, '台湾省');
});

// ================= U9 未知码 / 空码 =================

test('U9 未知码 / 非 6 位 / 空码 / null → display 空串 + isKnownOriginCode=false（不抛）', () => {
  for (const bad of ['999998', '000000', '123456', '37132', '3713250', '37', '', '  ', null, undefined]) {
    const r = geo.resolveOrigin(bad);
    assert.equal(r.display, '', `${String(bad)} display 必须为空串`);
    assert.equal(r.level1, null);
    assert.equal(r.level2, null);
    assert.equal(r.level3, null);
    assert.equal(geo.isKnownOriginCode(bad), false, `${String(bad)} 不得判为合法码`);
  }
  // 数字形态：`norm()` 一律 String() 归一化 ⇒ 数字 370000 与 '370000' 同判（口径：origin_code 以字符串存储）
  assert.equal(geo.resolveOrigin(370000).display, '山东省');
  assert.equal(geo.isKnownOriginCode(370000), true);
  // 合法码逐个反证
  for (const ok of ['110000', '110100', '110101', '370000', '371300', '371325', '710000', '710104', '810000', '820000', '999999']) {
    assert.equal(geo.isKnownOriginCode(ok), true, `${ok} 应为合法码`);
  }
  assert.equal(geo.isKnownOriginCode(' 371325 '), true, '两端空白 trim 后合法');
});

// ================= U10 三份数据件一致 =================

test('U10 三份数据件一致：`--check` exit 0；两份产物形状各异但各自与真源一致；前端载荷可还原；无静态死重', () => {
  const out = execFileSync(process.execPath, [GEN_SCRIPT, '--check'], { cwd: REPO, encoding: 'utf8' });
  assert.match(out, /产物与真源一致/);
  assert.match(out, /前端载荷可还原/);
  assert.match(out, /无废弃静态产物/);

  // 云函数侧产物 = 真源全量紧凑序列化（含 _meta）
  const backend = renderBackend();
  assert.equal(renderBackend(), backend, 'renderBackend() 两次调用字节相同（确定性）');
  assert.equal(fs.readFileSync(BACKEND_PRODUCT, 'utf8'), backend, `${BACKEND_PRODUCT} 与真源渲染结果不一致`);

  // 前端侧产物 = 紧凑数组 + base64(deflateRaw)，**无 _meta**；形状与云函数侧刻意不同
  const frontend = renderFrontend();
  assert.equal(renderFrontend(), frontend, 'renderFrontend() 两次调用字节相同（确定性，deflate 输出确定）');
  assert.equal(fs.readFileSync(FRONTEND_PRODUCT, 'utf8'), frontend, `${FRONTEND_PRODUCT} 与真源渲染结果不一致`);
  assert.deepEqual(Object.keys(JSON.parse(frontend)).sort(), ['g', 'v'], '前端产物只含 {v,g} 两个键');
  assert.equal(JSON.parse(frontend).v, 1, '载荷版本 = 1');
  // 主包增量预算：前端产物必须 < 40 KiB（实测 31,179 B；全量明文 153,226 B —— 这是主包能否留在 1.95 MiB 内的关键）
  assert.equal(
    Buffer.byteLength(frontend) < 40 * 1024,
    true,
    `前端产物必须 < 40 KiB（实测 ${Buffer.byteLength(frontend)} 字节，云函数侧 ${Buffer.byteLength(backend)} 字节）`,
  );

  // 载荷 → 真源 provinces（生成端 = node zlib 写、校验端 = node zlib 读；前端解压实现另有独立模糊测试）
  const decoded = decodeFrontend(frontend);
  assert.deepEqual(decoded, truth.provinces, '前端载荷解压 + 相对码还原后必须与真源 provinces 逐字段一致');

  // 已废弃的 `src/static` 产物不得复活（uni-app 原样拷贝 ⇒ 主包死重，曾把主包顶到 2.139 MiB 越限）
  assert.equal(fs.existsSync(LEGACY_PRODUCT), false, '旧静态产物 ' + LEGACY_PRODUCT + ' 必须不存在');
});

// ================= U11 真源结构完整性 =================

test('U11 真源结构：计数 35 / 369 / 3,367、source_sha256 复算一致、码不重复、**零非 6 位码**', () => {
  const provinces = truth.provinces;
  assert.equal(provinces.length, 35, 'L1 = 34 省级 + 海外');
  assert.equal(provinces.reduce((n, p) => n + p.cities.length, 0), 369);
  // 3,367 = 上游 3,449 − 82 个街道/镇（9 位码，见 U13 与真源 _meta.note ⑤）
  assert.equal(provinces.reduce((n, p) => n + p.cities.reduce((m, c) => m + c.counties.length, 0), 0), 3367);
  assert.equal(truth._meta.source_sha256, crypto.createHash('sha256').update(JSON.stringify(provinces), 'utf8').digest('hex'));
  assert.equal(provinces[0].code, '110000');
  assert.equal(provinces.at(-1).code, '999999');
  const codes = [];
  for (const p of provinces) {
    for (const c of p.cities) {
      for (const a of c.counties) codes.push(a.code);
    }
  }
  const all = [...provinces.map((p) => p.code), ...provinces.flatMap((p) => p.cities.map((c) => c.code)), ...codes];
  assert.equal(new Set(all).size, all.length, '码表不得有重复码');
  // 裁定：非 6 位码恒不可作 origin_code（isKnownOriginCode 恒 false ⇒ 前端选中即 400）⇒ 已整批剔除
  assert.equal(all.length, 3771, '项数 = 35 + 369 + 3,367');
  assert.equal(all.filter((c) => !/^\d{6}$/.test(c)).length, 0, '剔除后真源不得残留任何非 6 位码');
  assert.equal(provinces.every((p) => /^\d{6}$/.test(p.code)), true);
  assert.equal(provinces.flatMap((p) => p.cities).every((c) => /^\d{6}$/.test(c.code)), true);
  // 剔除后每个「县级为空」的地级都必须是法定无县级行政区的直筒子市（U13 逐个断言），不得有漏剔的残项
  const emptyCities = provinces.flatMap((p) => p.cities.filter((c) => c.counties.length === 0).map((c) => c.code));
  assert.deepEqual(emptyCities.sort(), ['441900', '442000', '460400', '620200'], '县级为空的地级只能是这 4 个直筒子市');
});

// ================= U13 直筒子市止于第二级 =================

test('U13 直筒子市（东莞/中山/儋州/嘉峪关）：无下级、止于第二级、码仍合法；剔除的 9 位街道镇项不可达', () => {
  const CASES = [
    ['441900', '东莞市', '广东省东莞市'],
    ['442000', '中山市', '广东省中山市'],
    ['460400', '儋州市', '海南省儋州市'],
    ['620200', '嘉峪关市', '甘肃省嘉峪关市'],
  ];
  for (const [code, name, display] of CASES) {
    const c = geo.findCity(code);
    assert.equal(c.name, name, `${code} 地级反查`);
    assert.deepEqual(c.counties, [], `${code} 法定无县级行政区 ⇒ counties 为空数组（选择器止于第二级）`);
    assert.equal(geo.isKnownOriginCode(code), true, `${code} 仍是合法 origin_code（选到市即终点，不得 400）`);
    const r = geo.resolveOrigin(code);
    assert.equal(r.display, display, `${code} 展示串 = 若选择到市则为该串`);
    assert.equal(r.level2.name, name);
    assert.equal(r.level3, null, `${code} 无第三级`);
    assert.equal(geo.isKnownOriginCode(r.level1.code), true);
  }
  // 被剔除的上游街道 / 镇级 9 位项：既不可反查也不可提交（否则「选中即 400」）
  for (const gone of ['441900003', '442000001', '460400001', '620200001']) {
    assert.equal(geo.findCounty(gone), null, `${gone} 不得残留在码表里`);
    assert.equal(geo.resolveOrigin(gone).display, '', `${gone} 反查为空（不臆造）`);
    assert.equal(geo.isKnownOriginCode(gone), false, `${gone} 不是合法 origin_code`);
  }
  // 前端产物同一事实：直筒子市在紧凑载荷里同样是「市级在、县级为空」
  const decoded = decodeFrontend(fs.readFileSync(FRONTEND_PRODUCT, 'utf8'));
  for (const [code] of CASES) {
    const hit = decoded.flatMap((p) => p.cities).find((c) => c.code === code);
    assert.ok(hit, `${code} 必须在前端载荷里`);
    assert.deepEqual(hit.counties, [], `${code} 前端载荷县级必须为空（否则选择器会渲染空列）`);
  }
});

// ================= U12 写路径 400 口径（lib 层）=================

test('U12 lib 写路径：非法码 → 400 + 逐字文案「发源地行政区划代码无效：<码>」（校验先于任何 IO）', async () => {
  const cases = ['999998', '123456', '1101010'];
  for (const code of cases) {
    await assert.rejects(
      () => tw.createTree({ surnameChar: '季', founderName: '某', originCode: code }),
      (e) => e.status === 400 && e.message === `发源地行政区划代码无效：${code}`,
      `createTree ${code}`,
    );
    await assert.rejects(
      () => clan.createClanTree({ surname: '季', masterTreeId: 'zhonghua', masterHandle: 'h1', originCode: code }),
      (e) => e.status === 400 && e.message === `发源地行政区划代码无效：${code}`,
      `createClanTree ${code}`,
    );
  }
});

// ================= R1 路由 PUT /tree-meta =================

test('R1 PUT /tree-meta：合法码 → origin 反查覆盖（直写的 origin 被真源压过）', async () => {
  const { status, body, saved } = await putMeta({ tree_id: 't_geo', origin_code: '371325', origin: '手写的假展示串' });
  assert.equal(status, 200);
  assert.equal(body.entry.origin_code, '371325');
  assert.equal(body.entry.origin, '山东省临沂市费县', '软冗余以 origin_code 为准');
  assert.equal(saved.trees.t_geo.origin_code, '371325');
  assert.equal(saved.trees.t_geo.origin, '山东省临沂市费县', '落盘副本一致');
});

test('R1b PUT /tree-meta：未知码 → 400 + 逐字文案，且不落盘（含零内存副作用：见 R1c 接力断言）', async () => {
  const before = JSON.parse(fs.readFileSync(META_FILE, 'utf8')).trees.t_geo;
  for (const code of ['999998', '37abc1', '37132']) {
    const { status, body, saved } = await putMeta({ tree_id: 't_geo', origin_code: code, origin: '不该被写' });
    assert.equal(status, 400, `${code} 必须 400`);
    assert.equal(body.error, `发源地行政区划代码无效：${code}`, '文案逐字');
    assert.deepEqual(saved.trees.t_geo, before, `${code} 被拒时不得落盘`);
  }
});

test('R1c PUT /tree-meta：origin_code 空串 → 只落空码，**不覆写** origin（legacy 兼容）', async () => {
  const { status, saved } = await putMeta({ tree_id: 't_geo', origin_code: '' });
  assert.equal(status, 200);
  assert.equal(saved.trees.t_geo.origin_code, '');
  assert.equal(saved.trees.t_geo.origin, '山东省临沂市费县', '空码不覆写 origin（保留原值）');
});

test('R1d PUT /tree-meta：legacy 分支（只传 origin）仍直写；世本特例字段不动', async () => {
  const { status, saved } = await putMeta({ tree_id: 't_geo', origin: '江苏苏州洞庭' });
  assert.equal(status, 200);
  assert.equal(saved.trees.t_geo.origin, '江苏苏州洞庭', 'legacy 直写保留');
  assert.equal(saved.trees.t_geo.origin_code, '', '未传 origin_code → 不新增 / 不改码');
  assert.equal(saved.trees.zhonghua.origin, '中华');
  assert.equal(saved.trees.zhonghua.origin_code, '', '世本特例：中华 + 空码，不得改写');
});

// ================= Z1 真源零写入 =================

test('Z1 真源零写入：geo 真源 / tree-meta 真源 / 两份产物的 md5 逐字节未变', () => {
  assert.equal(md5(TRUTH), TRUTH_MD5, 'config/geo-divisions.json 被改动了');
  assert.equal(md5(REAL_META), REAL_META_MD5, 'config/tree-meta.json 被改动了');
  PRODUCTS.forEach((f, i) => assert.equal(md5(f), PRODUCT_MD5[i], `${f} 被改动了`));
  assert.notEqual(path.resolve(TMP), path.resolve(REPO), '沙箱 /tmp 副本');
});
