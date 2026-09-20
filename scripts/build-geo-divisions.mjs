#!/usr/bin/env node
/**
 * 构建 `config/geo-divisions.json`（发源地三级行政区划 · **唯一真源**）
 *
 * 用途：把上游开源区划数据集规范化成 jiazu 需要的形状（省—市/地级—县/县级），
 *       并补全数据集未含的部分（台湾省 金门县/连江县、港澳二级、单列「海外」哨兵码）。
 *       真源本身**入库受版本管理**，本脚本只是它的可复现构建过程（不是运行时依赖）。
 *
 * 上游（固定 commit，避免上游变动导致真源漂移）：
 *   · 仓库   https://github.com/modood/Administrative-divisions-of-China （npm: china-division v2.7.0）
 *   · 文件   dist/pca-code.json    @ dc3a1d7acd85ca1b0979543e9259604142c52e8e
 *   · 文件   dist/HK-MO-TW.json    @ 30104e31ebbaf90dd7285b9aab08cfc067216ca3
 *   · 来源   国家统计局《2023年统计用区划代码和城乡划分代码》（截止 2023-06-30，发布 2023-09-11）
 *   · 许可   WTFPL-2.0（仓库 LICENSE 全文；非 MIT —— 别照抄「MIT 数据集」的说法）
 *
 * 编码规则（本文件产出的 code 一律 6 位）：
 *   · 省级：数据集 2 位（`13`）→ `130000`
 *   · 地级：数据集 4 位（`1303`）→ `130300`
 *   · 县级：数据集已是 6 位（`130302`），原样
 *   · 台湾省 / 港澳二级及县级 / 海外 = **项目自建扩展码**（见 _meta.note；上游无权威码源）
 *   · 第三级只保留 6 位码：上游「直筒子市」的街道 / 镇（9 位码）整批剔除（见 _meta.note ⑤），不编造 6 位码
 *
 * 用法：
 *   node scripts/build-geo-divisions.mjs                 # 联网抓取 → 写 config/geo-divisions.json
 *   GEO_SRC_DIR=/tmp/geo-src node scripts/build-geo-divisions.mjs   # 用本地已下载的上游文件（离线）
 *   node scripts/build-geo-divisions.mjs --out /tmp/geo.json        # 写别处（演练）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const PCA_COMMIT = 'dc3a1d7acd85ca1b0979543e9259604142c52e8e';
const HKMO_COMMIT = '30104e31ebbaf90dd7285b9aab08cfc067216ca3';
const RAW = 'https://raw.githubusercontent.com/modood/Administrative-divisions-of-China';
const PCA_URL = `${RAW}/${PCA_COMMIT}/dist/pca-code.json`;
const HKMO_URL = `${RAW}/${HKMO_COMMIT}/dist/HK-MO-TW.json`;
const SRC_NAME = `Administrative-divisions-of-China（npm china-division v2.7.0）· 国家统计局《2023年统计用区划代码和城乡划分代码》（截止 2023-06-30）`;
const SRC_LICENSE = 'WTFPL-2.0';

/** 伪级名：展示串拼接时一律过滤（不是真实地名，只是代码编制用的占位层） */
const SHOW_FILTER_NAMES = ['市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划'];

/** 合法 `origin_code` 形状：6 位数字（口径唯一真源；`lib/geo.js` 的 `CODE_RE` 逐字一致） */
const CODE_RE = /^\d{6}$/;

/** 「海外」自建哨兵码（一级唯一项、无下级；不得占用真实码段） */
const OVERSEAS = { code: '999999', name: '海外' };

/**
 * 台湾省县级项序：默认沿用上游 HK-MO-TW.json 的项序；
 * 台北市例外 —— 契约 §发源地 锚定 `710104 = 台北市中正区`，故 12 区按下列项目自建序排列。
 */
const TW_TAIPEI_DISTRICT_ORDER = [
  '松山区', '信义区', '大安区', '中正区', '大同区', '中山区',
  '万华区', '文山区', '南港区', '内湖区', '士林区', '北投区',
];

/** 上游 HK-MO-TW.json 未含：金门县（3镇3乡）/ 连江县（马祖，4乡）→ 项目按行政区划通名补全 */
const TW_SUPPLEMENT = {
  金门县: ['金城镇', '金湖镇', '金沙镇', '金宁乡', '烈屿乡', '乌丘乡'],
  连江县: ['南竿乡', '北竿乡', '莒光乡', '东引乡'],
};

/** 自建码段的项序（契约口径）：台湾省 6 市 → 3 省辖市 → 13 县；港澳沿用上游地理分组序 */
const TW_LEVEL2_ORDER = [
  '台北市', '新北市', '桃园市', '台中市', '台南市', '高雄市',
  '基隆市', '新竹市', '嘉义市',
  '新竹县', '苗栗县', '彰化县', '南投县', '云林县', '嘉义县', '屏东县',
  '宜兰县', '花莲县', '台东县', '澎湖县', '金门县', '连江县',
];
const HK_LEVEL2_ORDER = ['香港岛', '九龙', '新界'];
const MO_LEVEL2_ORDER = ['澳门半岛', '澳门外岛'];

const pad6 = (n) => String(n).padStart(2, '0');
/** 地级项序 → 6 位码：`71` + NN + `00` */
const level2Code = (prefix, idx) => `${prefix}${pad6(idx + 1)}00`;
/** 县级项序 → 6 位码：地级码前 4 位 + NN */
const level3Code = (cityCode, idx) => `${cityCode.slice(0, 4)}${pad6(idx + 1)}`;

async function loadSource(name, url) {
  const localDir = process.env.GEO_SRC_DIR;
  if (localDir) {
    const local = path.join(localDir, name);
    if (!fs.existsSync(local)) throw new Error(`GEO_SRC_DIR 里找不到 ${name}（期望 ${local}）`);
    return JSON.parse(fs.readFileSync(local, 'utf8'));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`抓取上游失败：${url} → HTTP ${res.status}`);
  return res.json();
}

/** 大陆 31 个省级行政区（数据集顺序）→ 6 位码 */
function buildMainland(pcaCode) {
  return pcaCode.map((p) => ({
    code: `${p.code}0000`,
    name: p.name,
    cities: (p.children || []).map((c) => ({
      code: `${c.code}00`,
      name: c.name,
      counties: (c.children || []).map((a) => ({ code: a.code, name: a.name })),
    })),
  }));
}

/**
 * 剔除不合 `origin_code` 形状的第三级项（2026-09-20 裁定，Kong 实施）——
 * 上游「直筒子市」东莞市 / 中山市 / 儋州市 / 嘉峪关市（法定无县级行政区）的第三级是
 * **街道 / 镇**（9 位码），不满足 `^\d{6}$` ⇒ `isKnownOriginCode` 恒 false（前端选中即 400）；
 * 故整批剔除、**不编造 6 位码**，这 4 个地级市 `counties` 恒为空数组（选择器止于第二级）。
 * 判据只用码形状（不写死地名），任何新增的非法形状项同样会被剔除并在日志里列出。
 */
function pruneUncodedLevel3(provinces) {
  const dropped = [];
  for (const p of provinces) {
    for (const c of p.cities) {
      c.counties = c.counties.filter((a) => {
        if (CODE_RE.test(a.code)) return true;
        dropped.push(`${p.name}/${c.name}/${a.code} ${a.name}（${a.code.length} 位）`);
        return false;
      });
    }
  }
  if (dropped.length) {
    console.log(`   剔除第三级非法码形状项 ${dropped.length} 个（不编造 6 位码）：`);
    for (const d of dropped) console.log(`     · ${d}`);
  }
  return dropped;
}

/** 某一级项下挂地级 + 县级（项目自建码）：`cities` = { 地级名: [县级名...] }，`order` = 地级项序 */
function buildProjectLevel2({ code, name, cities, prefix, order }) {
  const missing = order.filter((n) => !(n in cities));
  const extra = Object.keys(cities).filter((n) => !order.includes(n));
  if (missing.length || extra.length) {
    throw new Error(`[${name}] 地级项序与来源不一致：缺 ${missing.join('/')}；多 ${extra.join('/')}`);
  }
  return {
    code,
    name,
    cities: order.map((cityName, i) => {
      const cCode = level2Code(prefix, i);
      const raw = cities[cityName];
      const counties = cityName === '台北市' ? [...TW_TAIPEI_DISTRICT_ORDER] : raw;
      if (cityName === '台北市') {
        const same = counties.length === raw.length && counties.every((n) => raw.includes(n));
        if (!same) throw new Error(`[台北市] 12 区项目序与来源不一致：${counties.join('/')} vs ${raw.join('/')}`);
      }
      return {
        code: cCode,
        name: cityName,
        counties: counties.map((cn, j) => ({ code: level3Code(cCode, j), name: cn })),
      };
    }),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outFile = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(REPO, 'config', 'geo-divisions.json');

  const [pcaCode, hkmo] = await Promise.all([
    loadSource('pca-code.json', PCA_URL),
    loadSource('HK-MO-TW.json', HKMO_URL),
  ]);

  const taiwan = hkmo['台湾省'];
  const twCities = { ...taiwan };
  for (const [countyName, towns] of Object.entries(TW_SUPPLEMENT)) {
    if (twCities[countyName]) throw new Error(`上游已含 ${countyName}，请删除 TW_SUPPLEMENT 里的补全项`);
    twCities[countyName] = towns;
  }

  const provinces = [
    ...buildMainland(pcaCode),
    buildProjectLevel2({
      code: '710000',
      name: '台湾省',
      cities: twCities,
      prefix: '71',
      order: TW_LEVEL2_ORDER,
    }),
    buildProjectLevel2({
      code: '810000',
      name: '香港特别行政区',
      cities: hkmo['香港特别行政区'],
      prefix: '81',
      order: HK_LEVEL2_ORDER,
    }),
    buildProjectLevel2({
      code: '820000',
      name: '澳门特别行政区',
      cities: hkmo['澳门特别行政区'],
      prefix: '82',
      order: MO_LEVEL2_ORDER,
    }),
    { code: OVERSEAS.code, name: OVERSEAS.name, cities: [] },
  ];

  pruneUncodedLevel3(provinces);

  const cfg = {
    _meta: {
      schema: '1.0',
      source: `${SRC_NAME}；数据文件 dist/pca-code.json @ ${PCA_COMMIT} 与 dist/HK-MO-TW.json @ ${HKMO_COMMIT}，仓库 ${RAW} ，许可证 ${SRC_LICENSE}`,
      source_sha256: '',
      fetched_at: new Date().toISOString(),
      note: [
        '项目自建扩展码登记（**不得声称民政部 / 国家统计局码**；民政部与国家统计局自 2024-10 起不再公开具体区划代码）：',
        `①「海外」=${OVERSEAS.code}：项目自建哨兵码，一级唯一项、无下级，不占用真实码段。`,
        '② 台湾省：仅 710000（省级，与公开资料一致）可核验；地级 710100–712200 与县级 7101xx–7122xx 全为项目自建扩展码（上游数据集不含台湾任何码值）。',
        '   · 地级规则：71NN00，NN = 契约序 [台北/新北/桃园/台中/台南/高雄 6 市 → 基隆/新竹/嘉义 3 省辖市 → 13 县] 的项序。',
        '   · 县级规则：地级码前 4 位 + 2 位项序；项序默认沿用上游 HK-MO-TW.json 的项序。',
        `   · 例外：台北市 12 区按项目自建序 [松山/信义/大安/中正/大同/中山/万华/文山/南港/内湖/士林/北投]，以满足契约锚点 710104=台北市中正区。`,
        '   · 金门县（3镇3乡）、连江县（马祖，4乡）上游 HK-MO-TW.json 未含，由项目按行政区划通名补全（维基百科「金門縣」「連江縣 (中華民國)」条目），码值同为项目自建。',
        '   · 口径声明：金门县 / 连江县 大陆亦主张属福建省，本表按契约口径置于台湾省下。',
        '③ 港澳：810000 / 820000 为省级公开码；其下地级（香港岛/九龙/新界、澳门半岛/澳门外岛）与县级（各区/各堂区）均为项目自建扩展码（只沿用上游 HK-MO-TW.json 的地名，不沿用其无码结构）。',
        '④ 台湾省按契约忽略「直辖市」建制：台北/新北/桃园/台中/台南/高雄 6 市视作地级市，归属台湾省。',
        '⑤ 直筒子市剔除（2026-09-20 裁定，Kong 实施）：广东省东莞市（36 项）/ 广东省中山市（23 项）/ 海南省儋州市（18 项）/ 甘肃省嘉峪关市（5 项）共 82 个上游第三级项是**街道 / 镇**（9 位码），不满足 ^\\d{6}$ ⇒ isKnownOriginCode 恒 false（选中即 400），故整批剔除、**不编造 6 位码**；这 4 个地级市 counties 恒为空数组 ⇒ 选择器止于第二级（选到市即终点）。',
      ].join('\n'),
    },
    provinces,
  };

  // source_sha256 = provinces 段规范化 JSON（紧凑序列化，键序与文件一致）的 sha256
  cfg._meta.source_sha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify(cfg.provinces), 'utf8')
    .digest('hex');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');

  const counties = provinces.reduce(
    (n, p) => n + p.cities.reduce((m, c) => m + c.counties.length, 0),
    0,
  );
  console.log(`✅ 已写出 ${outFile}`);
  console.log(`   一级 ${provinces.length} 项 / 地级 ${provinces.reduce((n, p) => n + p.cities.length, 0)} 项 / 县级 ${counties} 项`);
  console.log(`   source_sha256=${cfg._meta.source_sha256}`);
  console.log(`   过滤伪级名 ${SHOW_FILTER_NAMES.length} 个：${SHOW_FILTER_NAMES.join(' / ')}`);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
