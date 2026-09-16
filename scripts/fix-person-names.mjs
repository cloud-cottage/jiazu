#!/usr/bin/env node
/**
 * 批量规整「姓被填进名里」的历史节点（A/B/C 三类，规则见 audit-person-names.mjs）
 *
 * 只改 surname / given 两个结构字段；`name`（展示名）保持不变 → 界面文案零变化，
 * 但 GEDCOM 导出的 NAME 从 `NAME 姬高 //` 变为 `NAME 高 /姬/`（标准格式）。
 *
 * 用法:
 *   node scripts/fix-person-names.mjs            # dry-run：只打印计划
 *   node scripts/fix-person-names.mjs --apply    # 落盘（写 migrate-output/trees/*.json）
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/fix-person-names.mjs --apply   # 改副本（测试用）
 *
 * 不处理（仅体检报告提示）：跨树标记节点、占位符姓名、混排名（中英混写）→ 需人工判断。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyPerson } from './audit-person-names.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(__dirname);
const OUT = process.env.COMPAT_OUT_DIR || path.join(REPO, 'migrate-output');
const META = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'tree-meta.json'), 'utf8'));
const APPLY = process.argv.includes('--apply');

function main() {
  const files = fs.readdirSync(path.join(OUT, 'trees')).filter((f) => f.endsWith('.json'));
  let totalChanged = 0;
  const treesTouched = [];

  for (const file of files) {
    const p = path.join(OUT, 'trees', file);
    const tree = JSON.parse(fs.readFileSync(p, 'utf8'));
    const treeId = tree.tree_id || file.replace(/\.json$/, '');
    const surnameChar = (META.trees?.[treeId] || {}).surname_char || '';
    const changes = [];
    for (const person of Object.values(tree.people)) {
      const hit = classifyPerson(tree, person, surnameChar);
      if (!hit?.suggest) continue;
      const before = `${person.surname}|${person.given}`;
      const after = `${hit.suggest.surname}|${hit.suggest.given}`;
      if (before === after) continue;
      changes.push({ person, before, after, kind: hit.kind });
    }
    if (!changes.length) continue;
    treesTouched.push(treeId);
    console.log(`【${treeId}】${changes.length} 人`);
    for (const c of changes) {
      console.log(`   ${c.kind} ${c.person.gramps_id} ${c.person.name}: 姓/名 ${c.before} → ${c.after}`);
    }
    if (APPLY) {
      for (const c of changes) {
        c.person.surname = c.after.split('|')[0];
        c.person.given = c.after.split('|')[1];
      }
      tree.version = (tree.version || 1) + 1;
      tree.updated_at = new Date().toISOString();
      fs.writeFileSync(p, JSON.stringify(tree, null, 2));
    }
    totalChanged += changes.length;
  }

  if (!totalChanged) {
    console.log('✅ 无可自动规整项（A/B/C 全空）');
    return;
  }
  console.log(`\n${APPLY ? '✅ 已写回' : '（dry-run 未落盘）'}：${treesTouched.length} 棵树 / ${totalChanged} 人`);
  if (!APPLY) console.log('   加 --apply 生效；写后需重启本地 compat-api（内存 treeCache），云端副本另需重跑上传脚本');
}

main();
