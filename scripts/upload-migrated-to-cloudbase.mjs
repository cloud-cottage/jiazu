#!/usr/bin/env node
/**
 * P0 上传脚本：migrate-output/ → CloudBase（复用 liwu 环境，集合加 jiazu_ 前缀）
 *
 * - 树 JSON     → 云存储 trees/<tree_id>.json（云存储按环境隔离，无前缀）
 * - 人物详情    → 集合 jiazu_person_details（_id = "<tree_id>:<handle>", doc().set 幂等 upsert）
 * - tree-meta   → 集合 jiazu_tree_meta（_id = "global"）
 * - 预留业务集合：jiazu_users / jiazu_wallets / jiazu_anchors / jiazu_leave_requests / jiazu_sms_codes
 *
 * 用法:
 *   CB_ENV=<envId> CB_KEY=<jwt-api-key> node scripts/upload-migrated-to-cloudbase.mjs
 *
 * 安全: 密钥只从环境变量读取，不落盘、不打印。
 */
import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(__dirname);
const OUT = path.join(REPO, 'migrate-output');

const ENV = process.env.CB_ENV;
const KEY = process.env.CB_KEY;
if (!ENV || !KEY) {
  console.error('缺少 CB_ENV / CB_KEY 环境变量');
  process.exit(1);
}

const COLLECTIONS = [
  'jiazu_person_details',
  'jiazu_tree_meta',
  'jiazu_users',
  'jiazu_wallets',
  'jiazu_anchors',
  'jiazu_leave_requests',
  'jiazu_sms_codes',
  // P3 已实现的三个集合
  'jiazu_assets',
  'jiazu_spirit',
  'jiazu_market',
  // P4 新增：站内消息 / 运营审计（docs/economy-ops.spec.md §5.3）
  'jiazu_messages',
  'jiazu_ops_logs',
];

const app = cloudbase.init({ env: ENV, accessKey: KEY });
const db = app.database();

async function ensureCollections() {
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      console.log(`  ✓ 集合已创建: ${name}`);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('exist') || msg.includes('exist') || msg.includes('409') || msg.includes('already')) {
        console.log(`  · 集合已存在: ${name}`);
      } else {
        console.log(`  · 集合 ${name}: ${msg.slice(0, 100)}`);
      }
    }
  }
}

async function uploadTreeJson() {
  const report = JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8'));
  let uploaded = 0;
  const fileIds = {}; // tree_id -> fileID（兼容层 cloud 模式按此下载树 JSON）
  for (const [treeId, info] of Object.entries(report.trees || {})) {
    const src = path.join(OUT, info.tree_json);
    const cloudPath = `trees/${treeId}.json`;
    const r = await app.uploadFile({ cloudPath, fileContent: fs.readFileSync(src) });
    fileIds[treeId] = r.fileID;
    uploaded++;
    console.log(`  ✓ 树 JSON 已上传: ${cloudPath}`);
  }
  return { uploaded, fileIds };
}

async function uploadDetails() {
  const dir = path.join(OUT, 'details');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const col = db.collection('jiazu_person_details');
  let ok = 0;
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    // doc().set: upsert 语义（存在则覆盖），保证脚本可重复执行
    // 注意：_id 已由 doc(_id) 指定，body 中不能再包含 _id 字段
    const { _id, ...data } = doc;
    await col.doc(_id).set(data);
    ok++;
    if (ok % 50 === 0) console.log(`  … ${ok}/${files.length}`);
  }
  return ok;
}

async function uploadTreeMeta(fileIds) {
  const meta = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'tree-meta.json'), 'utf8'));
  // storage_files: 树 JSON 的云存储 fileID 映射（兼容层 getTree 按此下载）
  meta.storage_files = fileIds;
  await db.collection('jiazu_tree_meta').doc('global').set(meta);
  console.log('  ✓ tree-meta + storage_files 已写入 jiazu_tree_meta/global');
}

async function main() {
  console.log(`环境: ${ENV}`);
  console.log('--- 1/4 确保集合存在 ---');
  await ensureCollections();
  console.log('--- 2/4 上传树 JSON (云存储) ---');
  const { uploaded: nTrees, fileIds } = await uploadTreeJson();
  console.log(`  共 ${nTrees} 棵`);
  console.log('--- 3/4 写入人物详情 ---');
  const nDetails = await uploadDetails();
  console.log(`  共 ${nDetails} 条`);
  console.log('--- 4/4 写入 tree-meta ---');
  await uploadTreeMeta(fileIds);

  // 验证
  console.log('--- 验证 ---');
  const cnt = await db.collection('jiazu_person_details').count();
  console.log(`  jiazu_person_details 总数: ${cnt.total}`);
  const meta = await db.collection('jiazu_tree_meta').doc('global').get().catch(() => null);
  console.log(`  jiazu_tree_meta/global: ${meta ? 'OK' : '缺失'}`);
  const info = await app.getFileInfo({ fileList: Object.values(fileIds) }).catch(() => null);
  const okFiles = (info?.fileList || []).filter((f) => f.code === 'SUCCESS' || f.code === 0).length;
  console.log(`  云存储树 JSON: ${okFiles}/${Object.keys(fileIds).length} 存在`);
}

main().catch((e) => {
  console.error('上传失败:', e?.message || e);
  process.exit(1);
});
