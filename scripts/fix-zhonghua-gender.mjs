#!/usr/bin/env node
/**
 * 一次性修复：中华世本（zhonghua）人物性别被上游默认值污染
 *
 * 背景：Gramps-Web 的 `POST /people/` 不带 gender 时会把性别落成 2(女)，
 * 而 `scripts/import-zhonghua-chain.py`（源流链）与始祖登记（补录）都没传 gender
 * → zhonghua 全部 101 人性别被写成「女」（伏羲、黄帝、季文子……都挂「女」章）。
 *
 * 修复规则（能确定的才改，推断不出来的置「未知」而不猜）：
 * - 源流链节点（详情文档含 external_chain_gen）        → M（父系主链，父子关系构造上即男性）
 * - 其他登记/镜像节点（external_tree 指向别的家族树）   → U（未知；源树 handle 缺失，无法回查真实性别）
 *   → 单个节点可在档案「✏️ 编辑」里手工选性别，改完即生效
 *
 * 用法:
 *   node scripts/fix-zhonghua-gender.mjs                          # dry-run（默认，只打印计划）
 *   node scripts/fix-zhonghua-gender.mjs --apply                  # 落盘 migrate-output/trees/zhonghua.json
 *   node scripts/fix-zhonghua-gender.mjs --apply --markers=keep   # 只修源流链，镜像节点保持原值
 *
 * 生效范围：写的是 migrate-output（compat-api local 模式的结构真源）。
 * - 本地 compat-api 进程内有 treeCache：改完需重启进程（或换端口起新实例）才读到新值。
 * - 云端生产副本需重跑上传：CB_ENV=<envId> CB_KEY=<key> node scripts/upload-migrated-to-cloudbase.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(__dirname);
const OUT = path.join(REPO, 'migrate-output');
const TREE_ID = process.env.MASTER_TREE_ID || 'zhonghua';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const markersArg = args.find((a) => a.startsWith('--markers='));
const MARKERS = markersArg ? markersArg.split('=')[1] : 'unknown'; // unknown | keep

/** 读取该树全部详情文档 → { handle: {key: value} }（链节点判定依据） */
function loadDetailAttrs(treeId) {
  const map = new Map();
  const dir = path.join(OUT, 'details');
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(`${treeId}:`) || !f.endsWith('.json')) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const attrs = {};
    for (const a of doc.attributes || []) attrs[a.key] = a.value;
    map.set(doc.handle, attrs);
  }
  return map;
}

function main() {
  const treePath = path.join(OUT, 'trees', `${TREE_ID}.json`);
  if (!fs.existsSync(treePath)) {
    console.error(`❌ 树 JSON 不存在: ${treePath}`);
    process.exit(1);
  }
  const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
  const details = loadDetailAttrs(TREE_ID);

  const changes = [];
  const skipped = [];
  for (const person of Object.values(tree.people)) {
    const attrs = details.get(person.handle) || {};
    const before = person.gender;
    let after = before;
    let reason = '';
    if (attrs.external_chain_gen) {
      after = 'M';
      reason = `源流链第 ${attrs.external_chain_gen} 世（父系主链）`;
    } else if (MARKERS === 'unknown') {
      after = 'U';
      reason = `登记/镜像节点（external_tree=${person.external_tree || '-'}，源 handle 缺失，无法回查）`;
    } else {
      skipped.push({ person, reason: '镜像节点：--markers=keep 保持不变' });
      continue;
    }
    if (before !== after) changes.push({ person, before, after, reason });
  }

  console.log(`📋 ${TREE_ID}：人物 ${Object.keys(tree.people).length} 人，待修 ${changes.length} 人，跳过 ${skipped.length} 人`);
  for (const c of changes.slice(0, 8)) {
    console.log(`   ${c.person.gramps_id} ${c.person.name}: ${c.before} → ${c.after}  (${c.reason})`);
  }
  if (changes.length > 8) console.log(`   … 其余 ${changes.length - 8} 人同理`);

  if (!APPLY) {
    console.log('\n（dry-run，未落盘。加 --apply 生效）');
    return;
  }
  for (const c of changes) c.person.gender = c.after;
  tree.version = (tree.version || 1) + 1;
  tree.updated_at = new Date().toISOString();
  fs.writeFileSync(treePath, JSON.stringify(tree, null, 2));
  console.log(`\n✅ 已写回 ${path.relative(REPO, treePath)}（version ${tree.version}，${changes.length} 人）`);
  console.log('   下一步：重启本地 compat-api（内存 treeCache）；云端副本重跑 upload-migrated-to-cloudbase.mjs');
}

main();
