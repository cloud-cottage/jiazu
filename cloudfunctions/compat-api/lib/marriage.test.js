/**
 * 跨树嫁娶单元测试（docs/marriage.spec.md）
 * 只测纯逻辑：日期规范化 / 序号与标签 / 双侧写入 / 结束 / 守卫。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMarriageDate,
  nextMarriageNo,
  marriageLabel,
  normalizeEndKind,
  applyMarriage,
  applyMarriageEnd,
  applyLegacyMarriageEnd,
  findMarriageSide,
} from './marriage.js';

function treeA() {
  return {
    tree_id: 'tree_a',
    version: 1,
    people: {
      hA: { handle: 'hA', gramps_id: 'I0001', name: '风华胥', surname: '风', given: '华胥', gender: 'F', parent_family: '', spouse_families: [] },
    },
    families: {},
  };
}
function treeB() {
  return {
    tree_id: 'tree_b',
    version: 1,
    people: {
      hB: { handle: 'hB', gramps_id: 'I0052', name: '风伏羲', surname: '风', given: '伏羲', gender: 'M', parent_family: '', spouse_families: [] },
    },
    families: {},
  };
}

test('日期规范化（选填）：年份 / 完整日期 / 分隔符变体；非法报错', () => {
  assert.equal(normalizeMarriageDate(''), '');
  assert.equal(normalizeMarriageDate(undefined), '');
  assert.equal(normalizeMarriageDate('1957'), '1957');
  assert.equal(normalizeMarriageDate('1957-12-04'), '1957-12-04');
  assert.equal(normalizeMarriageDate('1957/12/4'), '1957-12-04');
  assert.equal(normalizeMarriageDate('1957.12'), '1957-12');
  assert.throws(() => normalizeMarriageDate('去年'), /日期格式/);
});

test('婚姻序号：无记录 → 1；已有第 N 次 → N+1；脏数据 → 1', () => {
  assert.equal(nextMarriageNo({}), 1);
  assert.equal(nextMarriageNo({ external_marriage_no: '1' }), 2);
  assert.equal(nextMarriageNo({ external_marriage_no: 3 }), 4);
  assert.equal(nextMarriageNo({ external_marriage_no: 'abc' }), 1);
});

test('序号标签：初嫁/再嫁（第 N 次）/初娶/再娶（第 N 次）', () => {
  assert.equal(marriageLabel(1, 'out'), '初嫁');
  assert.equal(marriageLabel(2, 'out'), '再嫁（第 2 次）');
  assert.equal(marriageLabel(1, 'in'), '初娶');
  assert.equal(marriageLabel(3, 'in'), '再娶（第 3 次）');
});

test('结束方式只接受「绝婚」/「合离」', () => {
  assert.equal(normalizeEndKind('绝婚'), '绝婚');
  assert.equal(normalizeEndKind('合离'), '合离');
  assert.throws(() => normalizeEndKind('离婚'), /绝婚/);
  assert.throws(() => normalizeEndKind(''), /绝婚/);
});

test('嫁出：两侧各建家族 + 镜像，指针互指、序号 1、可选日期写入', () => {
  const A = treeA();
  const B = treeB();
  const r = applyMarriage({
    treeA: A, treeB: B, handleA: 'hA', handleB: 'hB',
    direction: 'out', marriageDate: '1957', createdBy: '16600000000', marriageId: 'mid1',
  });
  assert.equal(r.marriage_id, 'mid1');
  assert.equal(r.no_a, 1);
  assert.equal(r.no_b, 1);
  assert.equal(r.label_a, '初嫁');

  // A 侧：本人在母位，镜像在父位
  const famA = A.families[r.family_a];
  assert.equal(famA.mother_handle, 'hA');
  assert.equal(famA.father_handle, r.mirror_b);
  const mirrorB = A.people[r.mirror_b];
  assert.equal(mirrorB.external_tree, 'tree_b');
  assert.equal(mirrorB.external_person_handle, 'hB');
  assert.equal(mirrorB.external_link_type, 'marriage');
  assert.equal(mirrorB.external_marriage_id, 'mid1');
  assert.equal(mirrorB.gender, 'M');
  assert.equal(mirrorB.name, '风伏羲');

  // B 侧对称
  const famB = B.families[r.family_b];
  assert.equal(famB.father_handle, 'hB');
  assert.equal(famB.mother_handle, r.mirror_a);
  assert.equal(B.people[r.mirror_a].external_person_handle, 'hA');
  assert.equal(B.people[r.mirror_a].external_marriage_id, 'mid1');

  // 两侧指针 + 日期
  assert.equal(A.people.hA.external_tree, 'tree_b');
  assert.equal(A.people.hA.external_person_handle, 'hB');
  assert.equal(A.people.hA.external_marriage_id, 'mid1');
  assert.equal(A.people.hA.external_marriage_no, '1');
  assert.equal(A.people.hA.external_marriage_date, '1957');
  assert.equal(A.people.hA.external_marriage_created_by, '16600000000');
  assert.equal(B.people.hB.external_tree, 'tree_a');
  assert.equal(B.people.hB.external_marriage_id, 'mid1');

  // 幂等性检查：同一对再来一次 → 拒绝
  assert.throws(
    () => applyMarriage({ treeA: A, treeB: B, handleA: 'hA', handleB: 'hB', direction: 'out', marriageId: 'mid2' }),
    /已建立婚姻关系/,
  );
});

test('娶入：男方发起；女方发起嫁出之外的方向一律拒绝', () => {
  const A = treeA();
  const B = treeB();
  // A 是女性 → 不能"娶入"
  assert.throws(
    () => applyMarriage({ treeA: A, treeB: B, handleA: 'hA', handleB: 'hB', direction: 'in' }),
    /不是男性/,
  );
  // 以男方为发起方（娶入）→ 通过
  const A2 = treeB(); // 男 风伏羲 为发起方
  const B2 = treeA(); // 女 风华胥 为对方
  const r = applyMarriage({ treeA: A2, treeB: B2, handleA: 'hB', handleB: 'hA', direction: 'in', marriageId: 'mid3' });
  assert.equal(r.label_a, '初娶');
  assert.equal(A2.families[r.family_a].father_handle, 'hB');
  assert.equal(A2.families[r.family_a].mother_handle, r.mirror_b);
  assert.equal(A2.people.hB.external_tree, 'tree_a');
});

test('绝婚/合离：删两侧镜像与家族、清有效配对、保留结束历史；再嫁序号递增', () => {
  const A = treeA();
  const B = treeB();
  const r = applyMarriage({ treeA: A, treeB: B, handleA: 'hA', handleB: 'hB', direction: 'out', marriageId: 'mid1' });
  const sideA = findMarriageSide(A, A.people.hA, 'mid1');
  assert.ok(sideA && sideA.mirrorHandle === r.mirror_b);

  const end = applyMarriageEnd({
    treeA: A, treeB: B, handleA: 'hA', handleB: 'hB',
    marriageId: 'mid1', kind: '绝婚', endDate: '1960',
  });
  assert.equal(end.kind, '绝婚');
  assert.equal(end.removed_mirror_a, true);
  assert.equal(end.removed_mirror_b, true);
  assert.equal(A.people[r.mirror_b], undefined);
  assert.equal(B.people[r.mirror_a], undefined);
  assert.equal(A.families[r.family_a], undefined); // 家族空 → 删除
  assert.equal(A.people.hA.external_marriage_id, '');
  assert.equal(A.people.hA.external_marriage_end_kind, '绝婚');
  assert.equal(A.people.hA.external_marriage_end_date, '1960');
  assert.equal(A.people.hA.external_marriage_end_by, 'husband_side');
  assert.equal(B.people.hB.external_marriage_end_by, 'husband_side');

  // 再嫁：序号 2
  const r2 = applyMarriage({ treeA: A, treeB: B, handleA: 'hA', handleB: 'hB', direction: 'out', marriageId: 'mid2' });
  assert.equal(r2.no_a, 2);
  assert.equal(r2.label_a, '再嫁（第 2 次）');
  // 结束：合离（双方自愿 → end_by = mutual）
  const end2 = applyMarriageEnd({
    treeA: A, treeB: B, handleA: 'hA', handleB: 'hB', marriageId: 'mid2', kind: '合离',
  });
  assert.equal(end2.kind, '合离');
  assert.equal(A.people.hA.external_marriage_end_by, 'mutual');
  assert.equal(A.people.hA.external_marriage_end_date, ''); // 日期选填

  // 已结束再结束 → 拒绝
  assert.throws(
    () => applyMarriageEnd({ treeA: A, treeB: B, handleA: 'hA', handleB: 'hB', marriageId: 'mid2', kind: '绝婚' }),
    /已结束或不存在/,
  );
});

test('家族不空时结束婚姻：保留家族与子女，只清掉镜像槽位', () => {
  const A = treeA();
  const B = treeB();
  const r = applyMarriage({ treeA: A, treeB: B, handleA: 'hA', handleB: 'hB', direction: 'out', marriageId: 'mid1' });
  // A 侧家族加一个孩子
  A.people.hKid = { handle: 'hKid', gramps_id: 'I0002', name: '风某', gender: 'M', parent_family: r.family_a, spouse_families: [] };
  A.families[r.family_a].child_handles.push('hKid');
  applyMarriageEnd({ treeA: A, treeB: B, handleA: 'hA', handleB: 'hB', marriageId: 'mid1', kind: '合离' });
  const fam = A.families[r.family_a];
  assert.ok(fam, '有子女 → 家族保留');
  assert.equal(fam.father_handle, '');
  assert.equal(fam.mother_handle, 'hA');
  assert.deepEqual(fam.child_handles, ['hKid']);
});

test('旧版出嫁链接（无 marriage_id / 无镜像）：结束只清链接并写结束信息', () => {
  const A = treeA();
  const B = treeB();
  A.people.hA.external_tree = 'tree_b';
  A.people.hA.external_person_handle = 'hB';
  A.people.hA.external_link_type = 'marriage';
  B.people.hB.external_tree = 'tree_a';
  B.people.hB.external_person_handle = 'hA';
  B.people.hB.external_link_type = 'marriage';
  const r = applyLegacyMarriageEnd({
    tree: A, person: A.people.hA, otherTree: B, otherPerson: B.people.hB,
    kind: '绝婚', endDate: '1962',
  });
  assert.equal(r.legacy, true);
  assert.equal(A.people.hA.external_link_type, '');
  assert.equal(A.people.hA.external_marriage_end_kind, '绝婚');
  assert.equal(A.people.hA.external_marriage_end_date, '1962');
  assert.equal(B.people.hB.external_link_type, '');
  assert.equal(B.people.hB.external_marriage_end_date, '1962');
});
