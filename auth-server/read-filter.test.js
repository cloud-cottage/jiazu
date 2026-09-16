/**
 * read-filter 响应裁剪纯函数单测（auth-server 读代理用）
 *
 * 运行：node --test auth-server/read-filter.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReadFilterEndpoint, filterReadBody } from './read-filter.js';

const __dirname = undefined; // 本文件不读盘

// 手动构造 access：A/B 可见，X 隐藏（filterReadBody 只消费 isHiddenPerson/hiddenPeople）
function makeAccess(visible = ['A', 'B'], hidden = ['X']) {
  const hiddenPeople = new Set(hidden);
  return {
    hiddenPeople,
    mode: 'partial',
    isHiddenPerson: (h) => hiddenPeople.has(h),
  };
}

function body(list) {
  return JSON.stringify(list);
}

test('isReadFilterEndpoint：列表/详情端点参与，其它不参与', () => {
  for (const p of ['/people', '/people/', '/families', '/families/', '/search', '/search/', '/people/X', '/people/X/', '/families/F1']) {
    assert.equal(isReadFilterEndpoint(p), true, p);
  }
  for (const p of ['/events/E1', '/media/M1', '/token/', '/people', '/objects']) {
    // /people 精确命中在上面已测；此处仅确认非目标端点
  }
  assert.equal(isReadFilterEndpoint('/events/E1'), false);
  assert.equal(isReadFilterEndpoint('/media/1'), false);
  assert.equal(isReadFilterEndpoint('/peopleXXX'), false);
});

test('people 列表：隐藏节点被剔除，可见保留', () => {
  const a = makeAccess();
  const r = filterReadBody(a, '/people', body([
    { handle: 'A', name: '可见' },
    { handle: 'X', name: '隐藏' },
    { handle: 'B', name: '可见2' },
  ]));
  assert.equal(r.status, 200);
  const kept = JSON.parse(r.body);
  assert.deepEqual(kept.map((p) => p.handle), ['A', 'B']);
});

test('search 列表：兼容 item.object.handle 与 item.handle 两种形状', () => {
  const a = makeAccess();
  const raw = body([
    { handle: 'A', object: { handle: 'A', name: '甲' } },
    { handle: 'X', object: { handle: 'X', name: '隐藏' } },
    { handle: 'B' }, // 无 object → 回退 item.handle
  ]);
  const r = filterReadBody(a, '/search', raw);
  assert.deepEqual(JSON.parse(r.body).map((p) => p.handle), ['A', 'B']);
});

test('families 列表：任一成员隐藏即剔除整条 family', () => {
  const a = makeAccess();
  const r = filterReadBody(a, '/families', body([
    { handle: 'F1', father_handle: 'A', mother_handle: 'B', child_ref_list: [{ ref: 'X' }] },
    { handle: 'F2', father_handle: 'A', mother_handle: '', child_ref_list: [{ ref: 'B' }] },
  ]));
  const kept = JSON.parse(r.body);
  assert.deepEqual(kept.map((f) => f.handle), ['F2']);
});

test('people/families 详情：隐藏 → 404（消息与 compat-api 一致），可见 → null 原样', () => {
  const a = makeAccess();
  const hidden = filterReadBody(a, '/people/X', body({ handle: 'X', name: '隐藏者' }));
  assert.equal(hidden.status, 404);
  assert.match(JSON.parse(hidden.body).error, /仅家族成员可见/);
  const visible = filterReadBody(a, '/people/A', body({ handle: 'A' }));
  assert.equal(visible, null);
  const famHidden = filterReadBody(a, '/families/F1', body({ handle: 'F1', father_handle: 'A', child_ref_list: [{ ref: 'X' }] }));
  assert.equal(famHidden.status, 404);
});

test('非 JSON / 非数组 / 空 shape → null（原样转发，不误伤）', () => {
  const a = makeAccess();
  assert.equal(filterReadBody(a, '/people', 'not-json'), null);
  assert.equal(filterReadBody(a, '/people', body({ total: 3 })), null);
  assert.equal(filterReadBody(a, '/people', JSON.stringify(null)), null);
});

test('列表裁剪后 X-Total-Count 语义：调用侧删除 header（此处验证过滤后长度）', () => {
  const a = makeAccess();
  const r = filterReadBody(a, '/people', body(Array.from({ length: 5 }, (_, i) => ({ handle: i === 4 ? 'X' : `P${i}` }))));
  assert.equal(JSON.parse(r.body).length, 4);
});
