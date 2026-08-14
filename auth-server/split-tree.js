/**
 * 家族树拆分模块 —「移除并新建家族树」
 *
 * 流程（全部由 auth-server 调用 Gramps-Web API 完成）:
 * 1. 取始祖姓氏 → 生成新 tree-id（拼音_Unicode_序号）
 * 2. admin 登录 → 创建新 tree
 * 3. CLI 创建新 tree 的 owner 账号
 * 4. 原 tree owner → 导出始祖及其后代 (.gramps)
 * 5. 新 tree owner → 导入该子树
 * 6. 原 tree owner → 删除原树中该子树人物
 * 7. 更新 tree-meta.json（新增条目）
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as wallet from './wallet.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Gramps token 缓存（模块级，跨请求复用）+ 429 限流重试
const grampsTokenCache = new Map();

/** Gramps 登录（带缓存，供 splitTree 与总谱联动共用） */
async function grampsLogin(username, password) {
  const cached = grampsTokenCache.get(username);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const base = process.env.GRAMPS_BASE_URL || 'http://localhost:8000';
  let res = await fetch(`${base}/api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  // 限流：最多重试 3 次，间隔 1.2 秒
  for (let i = 0; i < 3 && res.status === 429; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    res = await fetch(`${base}/api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  }
  if (!res.ok) throw new Error(`Gramps 登录失败 (${username}): ${res.status}`);
  const data = await res.json();
  grampsTokenCache.set(username, { token: data.access_token, exp: Date.now() + 14 * 60 * 1000 });
  return data.access_token;
}

// 模块级 Gramps token 缓存（15 分钟有效，避免登录限流）

/** 常用姓氏 → 拼音（与前端 tree-id.ts 保持一致） */
const PINYIN_MAP = {
  季: 'ji', 纪: 'ji', 顾: 'gu', 李: 'li', 王: 'wang', 张: 'zhang',
  刘: 'liu', 陈: 'chen', 杨: 'yang', 赵: 'zhao', 黄: 'huang', 周: 'zhou',
  吴: 'wu', 徐: 'xu', 孙: 'sun', 胡: 'hu', 朱: 'zhu', 高: 'gao',
  林: 'lin', 何: 'he', 郭: 'guo', 马: 'ma', 罗: 'luo', 梁: 'liang',
  宋: 'song', 郑: 'zheng', 谢: 'xie', 韩: 'han', 唐: 'tang', 冯: 'feng',
  于: 'yu', 董: 'dong', 萧: 'xiao', 程: 'cheng', 曹: 'cao', 袁: 'yuan',
  邓: 'deng', 许: 'xu', 傅: 'fu', 沈: 'shen', 曾: 'zeng', 彭: 'peng',
  吕: 'lv', 苏: 'su', 卢: 'lu', 蒋: 'jiang', 蔡: 'cai', 贾: 'jia',
  丁: 'ding', 魏: 'wei', 薛: 'xue', 叶: 'ye', 阎: 'yan', 余: 'yu',
  潘: 'pan', 杜: 'du', 戴: 'dai', 夏: 'xia', 钟: 'zhong', 汪: 'wang',
  田: 'tian', 任: 'ren', 姜: 'jiang', 范: 'fan', 方: 'fang', 石: 'shi',
  姚: 'yao', 谭: 'tan', 廖: 'liao', 邹: 'zou', 熊: 'xiong', 金: 'jin',
  陆: 'lu', 郝: 'hao', 孔: 'kong', 白: 'bai', 崔: 'cui', 康: 'kang',
  毛: 'mao', 邱: 'qiu', 秦: 'qin', 江: 'jiang', 史: 'shi', 侯: 'hou',
  邵: 'shao', 孟: 'meng', 龙: 'long', 万: 'wan', 段: 'duan', 雷: 'lei',
  钱: 'qian', 汤: 'tang', 尹: 'yin', 黎: 'li', 易: 'yi', 常: 'chang',
  武: 'wu', 乔: 'qiao', 贺: 'he', 赖: 'lai', 龚: 'gong', 文: 'wen',
  辛: 'xin', 容: 'rong', 任: 'ren',
};

/** 提取字符串中第一个汉字 */
function extractHanChar(s) {
  for (const ch of s) {
    if (/[\u4e00-\u9fff]/.test(ch)) return ch;
  }
  return '';
}

/** 汉字 → 拼音 */
function pinyinOf(char) {
  return PINYIN_MAP[char] || null;
}

/** 生成新 tree-id: 拼音_Unicode码点_序号 */
export function makeTreeId(char, seq) {
  const pinyin = pinyinOf(char);
  if (!pinyin) return null;
  const cp = char.codePointAt(0);
  return `${pinyin}_${cp}_${String(seq).padStart(2, '0')}`;
}

/** 从 tree-meta 找该姓氏的现有序号，返回下一个 */
function nextSequence(treeMeta, surname) {
  let max = 0;
  for (const entry of Object.values(treeMeta.trees || {})) {
    const char = entry.surname_char || '';
    if (char === surname) {
      const m = (entry.tree_id || '').match(/_(\d{2})$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return max + 1;
}

/**
 * 执行 Gramps CLI（创建新 tree 的 owner 账号）
 * GRAMPS_CLI_CMD 是完整命令字符串，用 /bin/sh -c 执行
 */
function runGrampsCli(args) {
  const cmd = process.env.GRAMPS_CLI_CMD || '';
  if (!cmd) throw new Error('未配置 GRAMPS_CLI_CMD（auth-server/.env）');
  const full = `${cmd} ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`;
  execFileSync('/bin/sh', ['-c', full], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: '' },
  });
}

/**
 * 核心拆分逻辑
 * @param {object} opts
 * @param {string} opts.treeId   源 tree（如 ji_23395_01）
 * @param {string} opts.ancestorHandle  始祖 person handle
 * @param {string} opts.ancestorName    始祖姓名（展示用）
 * @param {string} opts.grampsBase      Gramps-Web 基地址
 * @param {string} opts.initiatorPhone  发起人手机号（从发起人余额扣建树费）
 */
export async function splitTree(opts) {
  const {
    treeId,
    ancestorHandle,
    ancestorName,
    grampsBase,
    adminUser,
    adminPass,
    ownerUser,
    ownerPass,
    initiatorPhone,
    chiefUser,
    chiefPass,
    masterTreeId,
  } = opts;

  // ---- 0. 扣建树费（从发起人余额） ----
  if (!initiatorPhone) throw new Error('缺少发起人信息，无法扣除建树费用');
  const feeYuan = wallet.getTreeCreateFeeYuan();
  wallet.deductTreeCreateFee(initiatorPhone);
  console.log(`[split-tree] 已从 ${initiatorPhone} 扣除建树费 ¥${feeYuan}`);

  const api = `${grampsBase}/api`;

  async function grampsFetch(token, urlPath) {
    const res = await fetch(`${api}${urlPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Gramps GET 失败 ${res.status}: ${urlPath}`);
    return res.json();
  }

  async function grampsPost(token, urlPath, body, raw = false) {
    const res = await fetch(`${api}${urlPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gramps POST 失败 ${res.status}: ${urlPath} — ${text.slice(0, 200)}`);
    }
    return res;
  }

  // ---- 0. 找到源 tree 的 UUID ----
  const adminToken = await grampsLogin(adminUser, adminPass);
  const trees = await grampsFetch(adminToken, '/trees/');
  const sourceTree = trees.find((t) => t.name === treeId);
  if (!sourceTree) throw new Error(`找不到源 tree: ${treeId}`);
  const sourceTreeUuid = sourceTree.id;

  // ---- 1. 取始祖信息（姓氏）----
  const ownerToken = await grampsLogin(ownerUser, ownerPass);
  const personRaw = await grampsFetch(
    ownerToken,
    `/people/${ancestorHandle}?profile=all`,
  );
  const surnameRaw =
    personRaw.primary_name?.surname_list?.[0]?.surname || '';
  // 姓氏可能含英文（MyHeritage 导出 "Ji 季"），取第一个汉字
  const surnameChar = extractHanChar(surnameRaw) || '?';

  // 生成新 tree-id
  const meta = readTreeMeta();
  const seq = nextSequence(meta, surnameChar);
  const newTreeId = makeTreeId(surnameChar, seq);
  if (!newTreeId) throw new Error(`无法为姓氏「${surnameChar}」生成 tree-id`);

  // ---- 2. admin 创建新 tree ----
  const createRes = await grampsPost(adminToken, '/trees/', { name: newTreeId });
  const created = await createRes.json();
  const newTreeUuid = created.id;

  // ---- 3. CLI 创建新 tree 的 owner 账号 ----
  const ownerName = `owner_${newTreeId}`;
  const ownerPassword = cryptoRandom(16);
  try {
    runGrampsCli([
      'user',
      'add',
      ownerName,
      ownerPassword,
      '--fullname',
      `${surnameChar}氏新支系管理员`,
      '--email',
      `${ownerName}@jiazutong.cn`,
      '--role',
      '4',
      '--tree',
      newTreeUuid,
    ]);
    // 保存新 tree 的管理凭据（data/gramps-owners.json）
    saveOwnerCredential(newTreeId, ownerName, ownerPassword);
  } catch (e) {
    // 回滚：删除刚创建的 tree
    await grampsPost(adminToken, `/trees/${newTreeUuid}/delete/`, undefined).catch(() => {});
    throw new Error(`创建新 tree 管理员失败: ${e.message}`);
  }

  try {
    // ---- 4. 导出始祖及其后代 ----
    const exportRes = await grampsPost(
      ownerToken,
      `/exporters/gramps/file?person=Descendants&handle=${encodeURIComponent(ancestorHandle)}`,
      undefined,
    );
    const exportData = await exportRes.json();
    if (!exportData.url) throw new Error('导出未返回文件 URL');
    const exportFile = await grampsFetchRaw(ownerToken, exportData.url);
    const exportContent = gunzipIfNeeded(exportFile);

    // ---- 5. 新 owner 导入 ----
    const newOwnerToken = await grampsLogin(ownerName, ownerPassword);
    const importRes = await grampsPost(
      newOwnerToken,
      '/importers/gramps/file',
      exportContent,
      true,
    );
    const importData = await importRes.json().catch(() => null);
    if (importData?.error) throw new Error(`导入失败: ${importData.error.message}`);

    // ---- 6. 删除原树中该子树 ----
    const deletedHandles = collectSubtreeHandles(exportContent);
    await deleteSubtree(ownerToken, api, deletedHandles);

    // ---- 7. 更新 tree-meta.json ----
    const meta2 = readTreeMeta();
    meta2.trees[`${newTreeId}`] = {
      tree_id: newTreeId,
      path_alias: `/${newTreeId}`,
      surname_char: surnameChar,
      display_title: `${surnameChar}氏（新支系）家族历史数字馆`,
      hall_name: '',
      origin: '',
      description: `由 ${treeId} 拆分而来，始祖：${ancestorName || surnameChar}氏`,
      enable_custom_domain: false,
    };
    writeTreeMeta(meta2);

    // ---- 7. 总谱联动：在中华世本创建始祖节点（chief_editor 凭据） ----
    const masterLink = await linkAncestorToMaster({
      grampsBase,
      chiefUser,
      chiefPass,
      masterTreeId,
      newTreeId,
      newTreeUuid,
      ancestorName,
      surnameChar,
    }).catch((e) => {
      console.warn(`[split-tree] 总谱联动失败（不影响建树）: ${e.message}`);
      return null;
    });

    return {
      ok: true,
      newTreeId,
      newTreeUuid,
      surname: surnameChar,
      movedPeople: deletedHandles.people.length,
      movedFamilies: deletedHandles.families.length,
      masterNode: masterLink,
      message: `已创建新家族树 ${newTreeId}，原树中移除 ${deletedHandles.people.length} 人${
        masterLink ? `，已在中华世本登记始祖「${ancestorName}」` : ''
      }`,
    };
  } catch (e) {
    // 回滚：删除新 tree（数据没导入成功的场景）
    await grampsPost(adminToken, `/trees/${newTreeUuid}/delete/`, undefined).catch(() => {});
    throw e;
  }
}

/**
 * 总谱联动：在中华世本创建始祖节点（仅 chief_editor 可编辑总谱）
 * - 用 chief_editor 凭据登录总谱 tree
 * - 创建 person 节点，名字 = 始祖姓名
 * - attributes 记录跨树引用（external_tree = 新树 id 等）
 */
async function linkAncestorToMaster({ grampsBase, chiefUser, chiefPass, masterTreeId, newTreeId, newTreeUuid, ancestorName, surnameChar }) {
  if (!chiefUser || !chiefPass) {
    throw new Error('未配置总谱编辑账号（GRAMPS_CHIEF_USERNAME/PASSWORD）');
  }
  const token = await grampsLogin(chiefUser, chiefPass);
  if (!token) throw new Error('总谱账号登录失败');

  const name = ancestorName || `${surnameChar || '未知'}氏始祖`;
  const body = {
    primary_name: {
      first_name: name,
      surname_list: [{ surname: surnameChar || '' }],
    },
    attribute_list: [
      { type: 'external_tree', value: newTreeId },
      { type: 'external_tree_uuid', value: newTreeUuid },
      { type: 'external_relation_note', value: `${name} — 家族树 ${newTreeId} 的始祖（自动登记）` },
    ],
  };
  const res = await fetch(`${grampsBase}/api/people/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Tree-Id': masterTreeId,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`总谱建节点失败: ${res.status}`);
  const created = await res.json();
  const handle = Array.isArray(created) ? created[0]?.handle : created?.handle;
  console.log(`[split-tree] 已在中华世本登记始祖「${name}」(handle=${handle})`);
  return { handle, name };
}

/** 随机密码 */
function cryptoRandom(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** 读取 tree-meta.json（config/ 共享，git 管理） */
function readTreeMeta() {
  const p = path.join(__dirname, '..', 'config', 'tree-meta.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { _schema: '1.0', trees: {} };
  }
}
function writeTreeMeta(meta) {
  const p = path.join(__dirname, '..', 'config', 'tree-meta.json');
  fs.writeFileSync(p, JSON.stringify(meta, null, 2) + '\n');
}

/** 保存新 tree 的管理凭据（data/gramps-owners.json，勿提交 git） */
function saveOwnerCredential(treeId, username, password) {
  const p = path.join(__dirname, 'data', 'gramps-owners.json');
  let all = {};
  try {
    all = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { /* 首次创建 */ }
  all[treeId] = { username, password, created_at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(all, null, 2));
}

/** GET 原始文件（导出结果） */
async function grampsFetchRaw(token, urlPath) {
  const res = await fetch(`${process.env.GRAMPS_BASE_URL || 'http://localhost:8000'}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`下载导出文件失败: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
/** gzip 解压（.gramps 导出默认压缩） */
function gunzipIfNeeded(buf) {
  // gzip 魔数 1f 8b
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipSync(buf);
  }
  return buf;
}

/** 从导出的 XML 中收集子树内所有 person/family handle（去掉 XML 的 _ 前缀） */
function collectSubtreeHandles(xmlBuf) {
  const xml = xmlBuf.toString('utf8');
  const people = [];
  const families = [];
  // Gramps XML: <person handle="_xxx" ...> / <family handle="_yyy" ...>
  // XML handle 带 _ 前缀，API 需要无前缀格式
  const personRe = /<person\s+handle="_([^"]+)"/g;
  const familyRe = /<family\s+handle="_([^"]+)"/g;
  let m;
  while ((m = personRe.exec(xml))) people.push(m[1]);
  while ((m = familyRe.exec(xml))) families.push(m[1]);
  return { people, families };
}

/** 删除子树对象（people + families）— POST /objects/delete-by-handle/ JSON body */
async function deleteSubtree(ownerToken, api, handles) {
  const del = async (namespace, list) => {
    if (list.length === 0) return;
    const res = await fetch(`${api}/objects/delete-by-handle/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ namespace, handles: list }),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`删除 ${namespace} 失败: ${res.status} — ${(await res.text()).slice(0, 200)}`);
    }
  };
  // 删除顺序：先删 family（解除关系），再删 person
  await del('families', handles.families);
  await del('people', handles.people);
}
