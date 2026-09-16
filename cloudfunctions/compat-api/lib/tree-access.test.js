/**
 * tree-access 规则模块单测（compat-api 形状：树 JSON people/families map）
 *
 * 数据真源：migrate-output/trees/*.json（§4 实测基线，与 auth-server/tree-access.test.js 同源）
 * 运行：node --test cloudfunctions/compat-api/lib/tree-access.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAccess, computePersonDepth } from './tree-access.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const treesDir = path.join(__dirname, '..', '..', '..', 'migrate-output', 'trees');

function loadTree(treeId) {
  return JSON.parse(fs.readFileSync(path.join(treesDir, `${treeId}.json`), 'utf8'));
}

function accessFor(treeId, { role = null, anchorTreeId = null, isMaster = false }) {
  const tree = loadTree(treeId);
  return computeAccess({ treeId, isMaster, role, anchorTreeId, people: tree.people, families: tree.families });
}

test('ji_23395_01: guest → partial 1–8 世；已登录未加入 → 1–17 世；member → full', () => {
  const tree = loadTree('ji_23395_01');
  const { depth, maxDepth } = computePersonDepth(tree.people, tree.families);
  assert.equal(maxDepth, 26);
  const countHidden = (v) => [...depth.values()].filter((d) => d > v).length;

  const guest = accessFor('ji_23395_01', {});
  assert.equal(guest.mode, 'partial');
  assert.equal(guest.visibleMaxDepth, 8);
  assert.equal(guest.hideTail, 18);
  assert.equal(guest.hiddenPeople.size, countHidden(8));

  const login = accessFor('ji_23395_01', { role: 'user' });
  assert.equal(login.visibleMaxDepth, 17);
  assert.equal(login.hideTail, 9);
  assert.equal(login.hiddenPeople.size, countHidden(17));

  const member = accessFor('ji_23395_01', { role: 'user', anchorTreeId: 'ji_23395_01' });
  assert.equal(member.mode, 'full');
  assert.equal(member.hiddenPeople.size, 0);
});

test('浅树兜底（gu/liu/shen）：guest 与 logged-in 均 floor → 仅最古老 1 世', () => {
  for (const tid of ['gu_39038_01', 'liu_21016_01', 'shen_27784_01']) {
    for (const role of [null, 'user']) {
      const a = accessFor(tid, { role });
      assert.equal(a.mode, 'floor', `${tid} role=${role}`);
      assert.equal(a.visibleMaxDepth, 1);
      assert.equal(a.clamped, true);
    }
  }
});

test('zhonghua（is_master）恒 full', () => {
  const a = accessFor('zhonghua', { isMaster: true });
  assert.equal(a.mode, 'full');
  assert.equal(a.isMaster, true);
});

test('跨树：ji 成员访问 gu → 已登录档（藏 9 层，floor 兜底）', () => {
  const a = accessFor('gu_39038_01', { role: 'user', anchorTreeId: 'ji_23395_01' });
  assert.equal(a.member, false);
  assert.equal(a.mode, 'floor');
  assert.equal(a.hideTail, 9);
});
