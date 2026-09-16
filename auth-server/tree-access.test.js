/**
 * tree-access 规则模块单测（auth-server 形状：normalized families 数组）
 *
 * 数据真源：migrate-output/trees/*.json（§4 实测基线）
 * 运行：node --test auth-server/tree-access.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAccess, computePersonDepth, accessToPayload } from './tree-access.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const treesDir = path.join(__dirname, '..', 'migrate-output', 'trees');

function loadTree(treeId) {
  const tree = JSON.parse(fs.readFileSync(path.join(treesDir, `${treeId}.json`), 'utf8'));
  const families = Object.values(tree.families).map((f) => ({
    handle: f.handle,
    father_handle: f.father_handle || '',
    mother_handle: f.mother_handle || '',
    child_handles: f.child_handles || [],
  }));
  return { tree, families };
}

const accessFor = (treeId, { role = null, anchorTreeId = null, isMaster = false }) => {
  const { families } = loadTree(treeId);
  return computeAccess({ treeId, isMaster, role, anchorTreeId, families });
};

// 深度分布计数（与模块实现一致的自洽校验）
function depthHist(treeId) {
  const { families } = loadTree(treeId);
  const { depth, maxDepth } = computePersonDepth(null, families);
  const byDepth = new Map();
  for (const d of depth.values()) byDepth.set(d, (byDepth.get(d) || 0) + 1);
  return { maxDepth, byDepth };
}

test('ji_23395_01: guest → partial 1–8 世（藏最底 18 层）', () => {
  const { maxDepth, byDepth } = depthHist('ji_23395_01');
  assert.equal(maxDepth, 26, 'ji 树实测 26 世');
  const expectedHidden = [...byDepth.entries()]
    .filter(([d]) => d > 8)
    .reduce((s, [, c]) => s + c, 0);
  const a = accessFor('ji_23395_01', {});
  assert.equal(a.mode, 'partial');
  assert.equal(a.visibleMaxDepth, 8);
  assert.equal(a.hideTail, 18);
  assert.equal(a.hiddenPeople.size, expectedHidden);
  assert.equal(a.loginRequired, true);
});

test('ji_23395_01: logged-in（已登录未加入）→ partial 1–17 世', () => {
  const { byDepth } = depthHist('ji_23395_01');
  const expectedHidden = [...byDepth.entries()]
    .filter(([d]) => d > 17)
    .reduce((s, [, c]) => s + c, 0);
  const a = accessFor('ji_23395_01', { role: 'user' });
  assert.equal(a.mode, 'partial');
  assert.equal(a.visibleMaxDepth, 17);
  assert.equal(a.hideTail, 9);
  assert.equal(a.hiddenPeople.size, expectedHidden);
  assert.equal(a.loginRequired, false);
});

test('ji_23395_01: member（锚点=本树）→ full', () => {
  const a = accessFor('ji_23395_01', { role: 'user', anchorTreeId: 'ji_23395_01' });
  assert.equal(a.mode, 'full');
  assert.equal(a.hiddenPeople.size, 0);
  assert.equal(a.member, true);
});

test('chief_editor 任意树 → full；tree_steward 其它树 → logged-in 档（藏 9 层）', () => {
  const ce = accessFor('gu_39038_01', { role: 'chief_editor' });
  assert.equal(ce.mode, 'full');
  // tree_steward 锚点在 ji，访问 gu（非本树）→ 回落已登录档
  const ts = accessFor('gu_39038_01', { role: 'tree_steward', anchorTreeId: 'ji_23395_01' });
  assert.equal(ts.mode, 'floor');
  assert.equal(ts.visibleMaxDepth, 1);
  assert.equal(ts.hideTail, 9);
});

test('浅树兜底：gu(4世)/liu(5世)/shen(3世) guest 与 logged-in 均 floor（仅最古老 1 世）', () => {
  for (const tid of ['gu_39038_01', 'liu_21016_01', 'shen_27784_01']) {
    for (const role of [null, 'user']) {
      const a = accessFor(tid, { role });
      assert.equal(a.mode, 'floor', `${tid} role=${role} → floor`);
      assert.equal(a.visibleMaxDepth, 1);
      assert.equal(a.clamped, true);
    }
  }
});

test('zhonghua（is_master）恒 full，任何人/guest 全可见', () => {
  for (const role of [null, 'user', 'branch_curator']) {
    const a = computeAccess({ treeId: 'zhonghua', isMaster: true, role, anchorTreeId: null, families: [] });
    assert.equal(a.mode, 'full');
    assert.equal(a.isMaster, true);
  }
});

test('accessToPayload 输出 §6 形状（visible_max_depth 随档位）', () => {
  const guest = accessFor('ji_23395_01', {});
  const p = accessToPayload(guest, 26);
  assert.equal(p.mode, 'partial');
  assert.equal(p.visible_max_depth, 8);
  assert.equal(p.hide_tail, 18);
  assert.equal(p.is_master, false);
  assert.equal(p.member, false);
  assert.equal(p.login_required, true);
  const member = accessFor('ji_23395_01', { role: 'user', anchorTreeId: 'ji_23395_01' });
  assert.equal(accessToPayload(member, 26).visible_max_depth, 26);
});
