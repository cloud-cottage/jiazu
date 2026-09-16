/**
 * 晋宗模块 —「节点以上并入中华世本总谱」
 *
 * 规则（rank.js）: 普通家族树深度超限（>72 世）或需入谱时，
 * 把某节点 N 及其以上祖先并入 zhonghua：
 * - N 成为原家族树的新始祖（根），N 及以下保留在原树
 * - 祖先链导入 zhonghua，挂接到指定的挂接节点（如 季文子）下继续编号
 * - N 在 zhonghua 建登记副本（external_tree 回链原树），总谱目录自动归集
 *
 * 流程:
 * 1. 收集 N 的祖先链（沿父系 parent_family_list 向上到链顶）
 * 2. 读挂接节点的 external_chain_gen（无则取 zhonghua 最大 gen）
 * 3. chief 凭据在 zhonghua 从链顶向下逐个建 person + family 父子关系，
 *    链顶挂接到 attachHandle 之下，逐代 external_chain_gen 递增
 * 4. N 副本带 external_tree / external_link_type=founder 回链
 * 5. 原树删除祖先（N 的父家族 + 祖先 people），N 成为新始祖
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 从 person 提取 姓/名 */
function nameOf(person) {
  const pn = person?.primary_name || {};
  const surname = pn.surname_list?.[0]?.surname || '';
  const given = pn.first_name || '';
  return { surname, given, full: `${surname}${given}` || person?.gramps_id || '未知' };
}

/** 读取 person 的自定义属性（attribute_list 兼容两种 key 形态） */
function attrsOf(person) {
  const out = {};
  for (const a of person?.attribute_list || person?.extended?.attributes || []) {
    const key = typeof a.type === 'string' ? a.type : a.type?.text;
    if (key) out[key] = a.value;
  }
  return out;
}

/**
 * 执行晋宗
 * @param {object} opts
 * @param {string} opts.treeId        原家族树（如 ji_23395_01）
 * @param {string} opts.nodeHandle    节点 N（成为新始祖）
 * @param {string} opts.attachHandle  zhonghua 中的挂接节点 handle
 * @param {Function} opts.getToken    (treeId, forWrite) => Gramps token（server.js 注入）
 * @param {string} opts.grampsBase    Gramps-Web 基地址
 * @param {string} opts.masterTreeId  zhonghua tree id
 */
export async function promoteToMaster(opts) {
  const { treeId, nodeHandle, attachHandle, getToken, grampsBase, masterTreeId } = opts;
  if (!getToken) throw new Error('缺少 getToken（服务端注入）');
  if (!treeId || !nodeHandle || !attachHandle) {
    throw new Error('参数错误：treeId + nodeHandle + attachHandle 必填');
  }
  if (treeId === masterTreeId) throw new Error('总谱本身不可晋宗');

  const api = `${grampsBase}/api`;
  const tokenT = await getToken(treeId, true);        // 原树 owner（写）
  const tokenM = await getToken(masterTreeId, true);  // zhonghua chief（写）

  async function gf(token, urlPath) {
    const res = await fetch(`${api}${urlPath}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Gramps GET 失败 ${res.status}: ${urlPath}`);
    return res.json();
  }
  async function post(token, urlPath, body) {
    const res = await fetch(`${api}${urlPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Gramps POST 失败 ${res.status}: ${urlPath} — ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  async function put(token, urlPath, body) {
    const res = await fetch(`${api}${urlPath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Gramps PUT 失败 ${res.status}: ${urlPath} — ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  // ---- 1. 收集祖先链（从 N 向上沿父系） ----
  // chain[i] = { fam_handle, parent_handle, child_surname, child_given }
  // chain[0].child = N；chain[i].parent = 第 i+1 代祖先；链顶 = topPerson
  const chain = [];
  let cur = nodeHandle;
  let topPerson = null;
  while (true) {
    const person = await gf(tokenT, `/people/${cur}?profile=all`);
    const pf = (person.parent_family_list || [])[0];
    if (!pf) { topPerson = person; break; }
    const fam = await gf(tokenT, `/families/${pf}`);
    const parent = fam.father_handle || fam.mother_handle;
    if (!parent) { topPerson = person; break; }
    const nm = nameOf(person);
    chain.push({
      fam_handle: pf,
      parent_handle: parent,
      child_surname: nm.surname,
      child_given: nm.given,
    });
    cur = parent;
  }
  if (!topPerson) throw new Error('无法定位祖先链');
  const topName = nameOf(topPerson);
  const nodeName = nameOf(await gf(tokenT, `/people/${nodeHandle}?profile=all`));
  const m = chain.length; // 祖先代数（不含 N）
  if (m === 0) {
    throw new Error(`节点「${nodeName.full}」已是原树始祖（无祖先可并入）`);
  }
  console.log(`[晋宗] ${treeId}/${nodeName.full} 祖先链 ${m} 代: ${topName.full} → ${nodeName.full}`);

  // ---- 2. 确定挂接世代号 ----
  const attachPerson = await gf(tokenM, `/people/${attachHandle}?profile=all`);
  if (!attachPerson) throw new Error('挂接节点不存在于中华世本');
  const attachAttrs = attrsOf(attachPerson);
  let attachGen = Number(attachAttrs.external_chain_gen || 0);
  if (!attachGen) {
    // 挂接点无显式世数 → 取 zhonghua 当前最大 gen
    const all = await gf(tokenM, '/people/?profile=all&pagesize=2000');
    let maxGen = 0;
    for (const p of all) {
      const g = Number(attrsOf(p).external_chain_gen || 0);
      if (g > maxGen) maxGen = g;
    }
    attachGen = maxGen;
    console.log(`[晋宗] 挂接点无 external_chain_gen，取 zhonghua 最大世数 ${attachGen}`);
  }
  const attachName = nameOf(attachPerson);
  console.log(`[晋宗] 挂接节点「${attachName.full}」(gen=${attachGen})，新链从 gen=${attachGen + 1} 续编`);

  // ---- 3. zhonghua 建链（链顶 → N，逐代挂接） ----
  const created = [];
  async function createMasterPerson(surname, given, gen, extraAttrs = []) {
    const body = {
      primary_name: {
        first_name: given,
        surname_list: [{ surname }],
      },
      attribute_list: [
        { type: 'external_chain_gen', value: String(gen) },
        { type: 'external_chain_from', value: treeId },
        ...extraAttrs,
      ],
    };
    const res = await post(tokenM, '/people/', body);
    const handle = Array.isArray(res) ? res[0]?.handle : res?.handle;
    if (!handle) throw new Error(`zhonghua 建节点失败: ${JSON.stringify(res).slice(0, 200)}`);
    created.push({ handle, name: `${surname}${given}`, gen });
    return handle;
  }
  async function createMasterFamily(fatherHandle, childHandle) {
    const res = await post(tokenM, '/families/', {
      father_handle: fatherHandle,
      child_ref_list: [{ ref: childHandle }],
    });
    const handle = Array.isArray(res) ? res[0]?.handle : res?.handle;
    if (!handle) throw new Error(`zhonghua 建家族关系失败`);
    return handle;
  }

  // 链顶挂接
  let prevHandle = await createMasterPerson(topName.surname, topName.given, attachGen + 1);
  await createMasterFamily(attachHandle, prevHandle);
  // 逐代向下（chain 从近到远，需倒序：i=m-1 是最靠近链顶的一代）
  for (let i = m - 1; i >= 1; i--) {
    const c = chain[i];
    const gen = attachGen + 1 + (m - i); // 链顶=attachGen+1，逐代 +1
    const h = await createMasterPerson(c.child_surname, c.child_given, gen);
    await createMasterFamily(prevHandle, h);
    prevHandle = h;
  }
  // N 副本（登记始祖，回链原树）
  const nodeGen = attachGen + m + 1;
  const nHandle = await createMasterPerson(nodeName.surname, nodeName.given, nodeGen, [
    { type: 'external_tree', value: treeId },
    { type: 'external_link_type', value: 'founder' },
    { type: 'external_relation_note', value: `${nodeName.full} — 家族树 ${treeId} 的始祖（晋宗登记）` },
  ]);
  await createMasterFamily(prevHandle, nHandle);
  console.log(`[晋宗] zhonghua 已建 ${created.length} 个节点 + ${nodeName.full}(gen=${nodeGen}) 登记始祖`);

  // ---- 4. 原树删除祖先（N 保留为新始祖） ----
  const famsToDelete = chain.map((c) => c.fam_handle);
  const peopleToDelete = [...new Set(chain.map((c) => c.parent_handle))];
  // 先删 family（含 N 的父家族，断开与祖先的联系），再删祖先 people
  if (famsToDelete.length) {
    await post(tokenT, '/objects/delete-by-handle/', {
      namespace: 'families',
      handles: famsToDelete,
    }).catch(async (e) => {
      // 逐个删除兜底
      for (const h of famsToDelete) {
        await fetch(`${api}/families/${h}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokenT}` } }).catch(() => {});
      }
    });
  }
  if (peopleToDelete.length) {
    await post(tokenT, '/objects/delete-by-handle/', {
      namespace: 'people',
      handles: peopleToDelete,
    }).catch(async () => {
      for (const h of peopleToDelete) {
        await fetch(`${api}/people/${h}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokenT}` } }).catch(() => {});
      }
    });
  }
  console.log(`[晋宗] 原树 ${treeId} 已删除 ${famsToDelete.length} 家族 + ${peopleToDelete.length} 祖先，${nodeName.full} 成为新始祖`);

  return {
    ok: true,
    treeId,
    nodeHandle,
    nodeName: nodeName.full,
    movedPeople: peopleToDelete.length,
    movedFamilies: famsToDelete.length,
    attach: { handle: attachHandle, name: attachName.full, gen: attachGen },
    chainGens: `${attachGen + 1}–${nodeGen}`,
    masterNode: { handle: nHandle, name: nodeName.full },
    message: `已把「${nodeName.full}」以上 ${peopleToDelete.length} 位祖先并入中华世本（挂接于「${attachName.full}」下，世数 ${attachGen + 1}–${nodeGen}），「${nodeName.full}」成为 ${treeId} 新始祖`,
  };
}
