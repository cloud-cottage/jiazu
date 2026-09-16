#!/usr/bin/env node
/**
 * 业务数据迁移：auth-server/data/*.json → CloudBase 集合（jiazu_ 前缀）
 *
 * - users.json          → jiazu_users（_id = phone）
 * - wallets.json        → jiazu_wallets（_id = 'global'，原结构整体作为文档）
 * - role-anchors.json   → jiazu_anchors（_id = phone）
 * - leave-requests.json → jiazu_leave_requests（_id = 原 key）
 *
 * 用法:
 *   本地模拟:  node scripts/migrate-business-data.mjs --local
 *   CloudBase: CB_ENV=<env> CB_KEY=<key> node scripts/migrate-business-data.mjs
 */
import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'auth-server', 'data');
const LOCAL_COLS = path.join(__dirname, '..', 'migrate-output', 'collections');

const LOCAL = process.argv.includes('--local');
const ENV = process.env.CB_ENV || '';
const KEY = process.env.CB_KEY || '';

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  } catch {
    return {};
  }
}

async function writeLocal(col, entries) {
  fs.mkdirSync(LOCAL_COLS, { recursive: true });
  const obj = {};
  for (const [id, doc] of entries) obj[id] = { _id: id, ...doc };
  fs.writeFileSync(path.join(LOCAL_COLS, `${col}.json`), JSON.stringify(obj, null, 2));
  console.log(`  ✓ local ${col}: ${entries.length} 条`);
}

async function writeCloud(col, entries) {
  const app = cloudbase.init({ env: ENV, ...(KEY ? { accessKey: KEY } : {}) });
  const db = app.database();
  let n = 0;
  for (const [id, doc] of entries) {
    const { _id, ...rest } = doc;
    await db.collection(col).doc(id).set({ ...rest });
    n++;
  }
  console.log(`  ✓ cloud ${col}: ${n} 条`);
}

async function main() {
  console.log(LOCAL ? '目标: 本地模拟集合' : `目标: CloudBase ${ENV}`);
  const mappings = [
    ['jiazu_users', 'users.json'],
    ['jiazu_anchors', 'role-anchors.json'],
    ['jiazu_leave_requests', 'leave-requests.json'],
  ];
  for (const [col, file] of mappings) {
    const data = read(file);
    const entries = Object.entries(data);
    if (LOCAL) await writeLocal(col, entries);
    else await writeCloud(col, entries);
  }
  // wallets：单文档
  const wallets = read('wallets.json');
  const walletEntries = [['global', wallets]];
  if (LOCAL) await writeLocal('jiazu_wallets', walletEntries);
  else await writeCloud('jiazu_wallets', walletEntries);
  console.log('完成');
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
