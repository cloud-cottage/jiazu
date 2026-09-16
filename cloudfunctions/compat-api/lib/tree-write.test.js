/**
 * tree-write 生卒/健在应用逻辑单测（applyLifespan 纯函数）
 *
 * 语义（docs/data-model.md §6.2 PUT 契约）：
 * - birth_date 可选，省略 = 不修改
 * - is_living=true → 健在，清空 death_date（健在必无卒年）
 * - is_living=false → 已故，death_date 可空（= 卒年不详）
 * - 省略 is_living → 按 death_date 推断（老调用方兼容：有卒年即已故）
 *
 * 运行：node --test cloudfunctions/compat-api/lib/tree-write.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLifespan, nextChainGen, nextGrampsId, nextTreeId, inheritedSurname, spouseSlots, resolvePersonRef, parentSlot, descendantsOf } from './tree-write.js';

function base() {
  return {
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
  };
}

test('设置出生年份 + 已故 + 卒年 → 三者落树 JSON', () => {
  const p = applyLifespan(base(), {
    birth_date: '1957',
    death_date: '2020-05-01',
    is_living: false,
  });
  assert.equal(p.birth_date, '1957');
  assert.equal(p.death_date, '2020-05-01');
  assert.equal(p.is_living, false);
});

test('出生支持完整日期 YYYY-MM-DD', () => {
  const p = applyLifespan(base(), {
    birth_date: '1957-12-04',
    death_date: '2020-05-01',
    is_living: false,
  });
  assert.equal(p.birth_date, '1957-12-04');
});

test('已故但卒年不详：is_living=false + death_date 空 → 保留空卒年且 is_living=false', () => {
  const p = applyLifespan({ ...base(), death_date: '2019-08-17' }, {
    is_living: false,
    death_date: '',
  });
  assert.equal(p.death_date, '');
  assert.equal(p.is_living, false);
});

test('健在：is_living=true → 清空历史卒年', () => {
  const p = applyLifespan({ ...base(), death_date: '2019-08-17', is_living: false }, {
    birth_date: '1957-12-04',
    is_living: true,
    death_date: '2019-08-17', // 前端健在时不会传，服务端防御性忽略
  });
  assert.equal(p.birth_date, '1957-12-04');
  assert.equal(p.death_date, '');
  assert.equal(p.is_living, true);
});

test('省略 is_living：death_date 非空 → 推断已故', () => {
  const p = applyLifespan(base(), {
    death_date: '2020-05-01',
  });
  assert.equal(p.death_date, '2020-05-01');
  assert.equal(p.is_living, false);
});

test('省略 is_living + death_date 空 → 保持健在（隐私保守默认）', () => {
  const p = applyLifespan(base(), {
    birth_date: '1990',
    death_date: '',
  });
  assert.equal(p.birth_date, '1990');
  assert.equal(p.death_date, '');
  assert.equal(p.is_living, undefined); // 无显式标记 → 读路径按 !death_date 推断
});

test('未提供任何生卒字段 → 完全不修改', () => {
  const src = { ...base(), birth_date: '1850', death_date: '1920' };
  const p = applyLifespan({ ...src }, { gender: 1 });
  assert.equal(p.birth_date, '1850');
  assert.equal(p.death_date, '1920');
  assert.equal(p.is_living, undefined);
});

test('空白字符串 trim 后落库为空串', () => {
  const p = applyLifespan(base(), {
    birth_date: '  1957  ',
    death_date: '  2020-05-01 ',
    is_living: false,
  });
  assert.equal(p.birth_date, '1957');
  assert.equal(p.death_date, '2020-05-01');
});

// ---- 总谱源流链续编世数（nextChainGen） ----

test('链上节点续编：父节点第 90 世 → 子节点第 91 世', () => {
  assert.equal(nextChainGen(90), 91);
});

test('链上首个节点（第 1 世）可续编第 2 世', () => {
  assert.equal(nextChainGen(1), 2);
  // 世数 0 = 原始节点（风华胥）→ 可续编第 1 世
  assert.equal(nextChainGen(0), 1);
});

test('不在链上（缺省 / NaN / 负数）→ 拒绝续编', () => {
  assert.throws(() => nextChainGen(undefined), /不在中华世本源流链上/);
  assert.throws(() => nextChainGen('abc'), /不在中华世本源流链上/);
  assert.throws(() => nextChainGen(-1), /不在中华世本源流链上/);
});

test('聚合虚位节点（代表多世）→ 拒绝续编', () => {
  assert.throws(() => nextChainGen(2, { aggregate: true }), /聚合虚位节点/);
});

// ---- Gramps 编号分配（nextGrampsId）：人/家族编号段独立，家族编号曾漏扫 ----

test('新建人编号沿用既有补零宽度（I0100 → I0101）', () => {
  const tree = { people: { a: { gramps_id: 'I0001' }, b: { gramps_id: 'I0100' } }, families: {} };
  assert.equal(nextGrampsId(tree, 'I'), 'I0101');
});

test('新建家族编号必须扫 families（F0047 → F0048，不得撞回 F1）', () => {
  const tree = {
    people: { a: { gramps_id: 'I0100' } },
    families: { f1: { gramps_id: 'F0000' }, f2: { gramps_id: 'F0047' } },
  };
  assert.equal(nextGrampsId(tree, 'F'), 'F0048');
});

test('无既有编号 → 从 1 起；混合宽度 → 取最大值的宽度', () => {
  assert.equal(nextGrampsId({ people: {}, families: {} }, 'I'), 'I1');
  assert.equal(nextGrampsId({ people: { a: { gramps_id: 'I0001' }, b: { gramps_id: 'I500057' } }, families: {} }, 'I'), 'I500058');
});

// ---- 新建家族树 tree_id 生成（nextTreeId） ----

test('首位序号：季（U+5B63）无同姓树 → ji_23395_01', () => {
  assert.equal(nextTreeId({ trees: {} }, '季'), 'ji_23395_01');
});

test('同姓已占序号跳号：季 01/04 已存在 → ji_23395_02', () => {
  const meta = { trees: { a: { tree_id: 'ji_23395_01' }, b: { tree_id: 'ji_23395_04' } } };
  assert.equal(nextTreeId(meta, '季'), 'ji_23395_02');
});

test('姓氏不在拼音表 → 前缀回退 shi；非单字姓氏由 createTree 拦截', () => {
  assert.equal(nextTreeId({ trees: {} }, '禚'), 'shi_31130_01');
});

// ---- 随父姓继承规则（inheritedSurname）：挂接节点为父/为母/无配偶家族 ----

test('挂接节点是父亲 → 子取父姓', () => {
  const tree = {
    people: { dad: { handle: 'dad', surname: '姬', spouse_families: ['f1'] } },
    families: { f1: { father_handle: 'dad', mother_handle: '', child_handles: [] } },
  };
  assert.equal(inheritedSurname(tree, 'dad'), '姬');
});

test('挂接节点是母亲 → 子随家族中父亲的姓', () => {
  const tree = {
    people: {
      mom: { handle: 'mom', surname: '姜', spouse_families: ['f1'] },
      dad: { handle: 'dad', surname: '姬' },
    },
    families: { f1: { father_handle: 'dad', mother_handle: 'mom', child_handles: [] } },
  };
  assert.equal(inheritedSurname(tree, 'mom'), '姬');
});

test('无配偶家族/父不详 → 取本人姓；handle 缺失 → 空串', () => {
  const tree = {
    people: { solo: { handle: 'solo', surname: '季', spouse_families: [] } },
    families: {},
  };
  assert.equal(inheritedSurname(tree, 'solo'), '季');
  assert.equal(inheritedSurname(tree, 'nobody'), '');
  assert.equal(inheritedSurname(tree, ''), '');
});

// ---- 配偶槽位分配（spouseSlots）：本人性别优先，未知则按配偶反推 ----

test('本人男 → 本人 father / 配偶 mother（夫妻任一性别未知也成立）', () => {
  assert.deepEqual(spouseSlots('M', 'F'), { selfSlot: 'father', spouseSlot: 'mother' });
  assert.deepEqual(spouseSlots('M', 'U'), { selfSlot: 'father', spouseSlot: 'mother' });
});

test('本人女 → 本人 mother / 配偶 father', () => {
  assert.deepEqual(spouseSlots('F', 'M'), { selfSlot: 'mother', spouseSlot: 'father' });
  assert.deepEqual(spouseSlots('F', 'U'), { selfSlot: 'mother', spouseSlot: 'father' });
});

test('本人未知 → 按配偶性别反推；都未知 → 本人 father 兜底', () => {
  assert.deepEqual(spouseSlots('U', 'F'), { selfSlot: 'father', spouseSlot: 'mother' });
  assert.deepEqual(spouseSlots('U', 'M'), { selfSlot: 'mother', spouseSlot: 'father' });
  assert.deepEqual(spouseSlots('U', 'U'), { selfSlot: 'father', spouseSlot: 'mother' });
  assert.deepEqual(spouseSlots(undefined, ''), { selfSlot: 'father', spouseSlot: 'mother' });
});

// ---- 改父节点：编号解析 / 父槽位 / 后代集合（成环校验） ----

const TREE = {
  people: {
    hA: { handle: 'hA', gramps_id: 'I0001', name: '风华胥', gender: 'F', spouse_families: ['f1'], parent_family: '' },
    hB: { handle: 'hB', gramps_id: 'I0052', name: '风伏羲', gender: 'M', spouse_families: ['f2'], parent_family: 'f1' },
    hC: { handle: 'hC', gramps_id: 'I0101', name: '姬高', gender: 'M', spouse_families: ['f3'], parent_family: 'f2' },
  },
  families: {
    f1: { handle: 'f1', gramps_id: 'F0001', father_handle: '', mother_handle: 'hA', child_handles: ['hB'] },
    f2: { handle: 'f2', gramps_id: 'F0002', father_handle: 'hB', mother_handle: '', child_handles: ['hC'] },
    f3: { handle: 'f3', gramps_id: 'F0003', father_handle: 'hC', mother_handle: '', child_handles: [] },
  },
};

test('编号解析：I0101 / 0101 / handle 都能定位；找不到返回 null', () => {
  assert.equal(resolvePersonRef(TREE, 'I0052'), 'hB');
  assert.equal(resolvePersonRef(TREE, '0052'), 'hB');
  assert.equal(resolvePersonRef(TREE, 'i0052'), 'hB');
  assert.equal(resolvePersonRef(TREE, 'hC'), 'hC');
  assert.equal(resolvePersonRef(TREE, '9999'), null);
  assert.equal(resolvePersonRef(TREE, ''), null);
});

test('父槽位：女 → mother，男/未知 → father', () => {
  assert.equal(parentSlot('F'), 'mother');
  assert.equal(parentSlot('M'), 'father');
  assert.equal(parentSlot('U'), 'father');
  assert.equal(parentSlot(undefined), 'father');
});

test('后代集合：沿本人作为父/母的家族向下（用于拒绝「把后代设为父节点」）', () => {
  const d = descendantsOf(TREE, 'hB');
  assert.deepEqual([...d].sort(), ['hC']);
  assert.deepEqual([...descendantsOf(TREE, 'hA')].sort(), ['hB', 'hC']);
  assert.deepEqual([...descendantsOf(TREE, 'hC')], []);
});
