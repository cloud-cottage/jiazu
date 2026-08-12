#!/usr/bin/env node

/**
 * 跨 tree 软关联校验脚本
 *
 * 扫描 tree-meta.json 中所有 tree 的人物记录，
 * 校验 external_tree 引用的 tree-id 是否存在，
 * 输出无效引用告警。
 *
 * 用法:
 *   node shell-scripts/validate-cross-refs.mjs [--gramps-api=http://localhost:8000]
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const GRAMPS_API = process.env.GRAMPS_API || 'http://localhost:8000';
const META_PATH = resolve(process.cwd(), 'config/tree-meta.json');

async function main() {
  console.log('=== 跨 Tree 软关联校验 ===');
  console.log(`元数据: ${META_PATH}`);
  console.log(`API:    ${GRAMPS_API}`);
  console.log('');

  // 1. 读取 tree-meta.json
  let meta;
  try {
    meta = JSON.parse(readFileSync(META_PATH, 'utf-8'));
  } catch (e) {
    console.error(`错误: 无法读取 tree-meta.json — ${e.message}`);
    process.exit(1);
  }

  const validTreeIds = new Set(Object.values(meta.trees).map((t) => t.tree_id));
  console.log(`已注册 tree 数量: ${validTreeIds.size}`);
  for (const tid of validTreeIds) {
    console.log(`  - ${tid}`);
  }
  console.log('');

  const warnings = [];

  // 2. 逐 tree 扫描人物
  for (const [key, entry] of Object.entries(meta.trees)) {
    const treeId = entry.tree_id;
    console.log(`扫描: ${treeId} (${entry.display_title})...`);

    try {
      const people = await fetchPeople(treeId);
      for (const person of people) {
        // 检查 external_tree 属性
        const extTree = getAttribute(person, 'external_tree');
        if (extTree && !validTreeIds.has(extTree)) {
          warnings.push({
            tree: treeId,
            person_name: person.name || person.handle,
            external_tree: extTree,
            reason: `tree-id "${extTree}" 未在 tree-meta.json 中注册`,
          });
        }
      }
      console.log(`  已检查 ${people.length} 条人物记录`);
    } catch (e) {
      console.error(`  错误: ${e.message}`);
    }
  }

  // 3. 输出结果
  console.log('');
  if (warnings.length === 0) {
    console.log('✅ 所有跨 tree 引用均有效');
  } else {
    console.log(`⚠️  发现 ${warnings.length} 条无效引用:`);
    console.log('');
    for (const w of warnings) {
      console.log(`  [${w.tree}] ${w.person_name} → ${w.external_tree}  ❌ ${w.reason}`);
    }
  }
}

async function fetchPeople(treeId) {
  const url = `${GRAMPS_API}/api/people/?tree=${treeId}&pagesize=0`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  return data || [];
}

function getAttribute(person, key) {
  if (!person?.extended?.attributes) return null;
  const attr = person.extended.attributes.find((a) => a.type === key);
  return attr?.value || null;
}

main().catch((e) => {
  console.error('校验失败:', e.message);
  process.exit(1);
});
