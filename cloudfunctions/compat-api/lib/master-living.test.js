/** 总谱（zhonghua）节点「一律已故 + 字段锁死」单元测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-master-living-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const { applyLifespan, updatePerson } = await import('./tree-write.js');
const MASTER = 'zhonghua';

function writeTree(tree) {
  const p = path.join(TMP, 'trees', `${tree.tree_id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tree, null, 2));
}
function readTree(id) {
  return JSON.parse(fs.readFileSync(path.join(TMP, 'trees', `${id}.json`), 'utf8'));
}
function person(handle, extra = {}) {
  return { handle, gramps_id: 'I0001', name: '季甲', surname: '季', given: '甲', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [], external_tree: '', external_person_handle: '', external_link_type: '', ...extra };
}

test('applyLifespan：总谱锁定 → 恒落 is_living=false（生卒仍可写）', () => {
  const p = applyLifespan(person('h1', { is_living: true }), { is_living: false, birth_date: '1957' }, { lockedDeceased: true });
  assert.equal(p.is_living, false);
  assert.equal(p.birth_date, '1957');
});

test('applyLifespan：总谱锁定 → 显式传 is_living=true 拒绝（403）', () => {
  assert.throws(() => applyLifespan(person('h2'), { is_living: true }, { lockedDeceased: true }), (e) => e.status === 403 && /一律为「已故」/.test(e.message));
});

test('updatePerson：总谱节点改「健在」→ 403 且不落盘', async () => {
  writeTree({ tree_id: MASTER, version: 1, updated_at: new Date().toISOString(), people: { h: person('h') }, families: {} });
  await assert.rejects(() => updatePerson(MASTER, 'h', { is_living: true }, { masterTreeId: MASTER }), (e) => e.status === 403 && /在世状态不可修改/.test(e.message));
  assert.equal(readTree(MASTER).people.h.is_living, undefined, '拒绝后不应改动');
});

test('updatePerson：总谱节点正常编辑（生卒）→ is_living 恒为 false', async () => {
  await updatePerson(MASTER, 'h', { birth_date: '1957', death_date: '2020' }, { masterTreeId: MASTER });
  const p = readTree(MASTER).people.h;
  assert.equal(p.is_living, false);
  assert.equal(p.birth_date, '1957');
  assert.equal(p.death_date, '2020');
});

test('updatePerson：非总谱树 → 在世状态仍可改', async () => {
  writeTree({ tree_id: 'other_tree', version: 1, updated_at: new Date().toISOString(), people: { h: person('h') }, families: {} });
  await updatePerson('other_tree', 'h', { is_living: true }, { masterTreeId: MASTER });
  assert.equal(readTree('other_tree').people.h.is_living, true);
});
