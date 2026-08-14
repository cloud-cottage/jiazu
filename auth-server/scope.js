/**
 * 节点编辑权限校验 — 写请求拦截
 *
 * 角色权限（由小到大）:
 * - user:             编辑自己所在节点及向下节点（自己 + 全部后代）
 * - branch_curator:   维护本人上下三代节点（向上 3 代 + 向下 3 代）
 * - tree_steward:     单棵家族树完整管理（无节点限制）
 * - chief_editor:     全局最高权限（可编辑总谱 + 所有树）
 *
 * 实现:
 * - 用户在树中有「锚点节点」（自己对应的 person handle，加入树时绑定）
 * - 校验时从锚点按 family 关系遍历计算可达范围
 * - 写请求（PUT/POST/DELETE people/families）需 handle 在范围内
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANCHORS_FILE = path.join(__dirname, 'data', 'role-anchors.json');

// phone -> { tree_id, person_handle, role }
let anchors = load();

function load() {
  try {
    return JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function persist() {
  fs.mkdirSync(path.dirname(ANCHORS_FILE), { recursive: true });
  fs.writeFileSync(ANCHORS_FILE, JSON.stringify(anchors, null, 2));
}

// ---- 锚点管理 ----

/** 设置用户的锚点节点（加入某棵树时的自身节点） */
export function setAnchor(phone, treeId, personHandle) {
  anchors[phone] = { tree_id: treeId, person_handle: personHandle, updated_at: new Date().toISOString() };
  persist();
}

/** 获取用户锚点（每次读文件，支持运行时更新无需重启） */
export function getAnchor(phone) {
  const fresh = load();
  return fresh[phone] || null;
}

/**
 * 创建范围校验器
 * @param {object} familiesByTree tree_id -> families[]
 * @param {string} phone 用户手机号
 * @param {string} role 用户角色
 * @returns {{ person: Set<string>, family: Set<string>, unrestricted: boolean }}
 */
export function buildScope(familiesByTree, phone, role) {
  // tree_steward / chief_editor：无限制
  if (role === 'tree_steward' || role === 'chief_editor') {
    return { person: null, family: null, unrestricted: true };
  }

  const anchor = getAnchor(phone);
  // 无锚点（guest 或未分配）：不可编辑
  if (!anchor) {
    return { person: new Set(), family: new Set(), unrestricted: false };
  }

  const treeId = anchor.tree_id;
  const families = familiesByTree[treeId] || [];
  const personScope = new Set([anchor.person_handle]);
  const familyScope = new Set();

  // person handle -> families where person is parent (father/mother)
  const parentOf = new Map();
  // person handle -> families where person is child
  const childOf = new Map();
  for (const f of families) {
    if (f.father_handle) {
      if (!parentOf.has(f.father_handle)) parentOf.set(f.father_handle, []);
      parentOf.get(f.father_handle).push(f.handle);
    }
    if (f.mother_handle) {
      if (!parentOf.has(f.mother_handle)) parentOf.set(f.mother_handle, []);
      parentOf.get(f.mother_handle).push(f.handle);
    }
    for (const ch of f.child_handles || []) {
      if (!childOf.has(ch)) childOf.set(ch, []);
      childOf.get(ch).push(f.handle);
    }
  }

  // 向下遍历：BFS 经过 parentOf（此人作为父母/监护人的家族 → 子女），加入家族 + 子女 + 配偶
  const descend = (start, limit) => {
    const queue = [start];
    const depth = new Map([[start, 0]]);
    while (queue.length) {
      const h = queue.shift();
      const d = depth.get(h) || 0;
      if (limit !== null && d >= limit) continue;
      const fams = parentOf.get(h) || [];
      for (const famHandle of fams) {
        familyScope.add(famHandle);
        const fam = families.find((f) => f.handle === famHandle);
        const kids = fam?.child_handles || [];
        for (const ch of kids) {
          if (!depth.has(ch)) {
            depth.set(ch, d + 1);
            personScope.add(ch);
            queue.push(ch);
          }
        }
        // 配偶（子女的另一亲）
        if (fam?.father_handle && fam?.mother_handle) {
          const spouse = fam.father_handle === h ? fam.mother_handle : fam.father_handle;
          if (!depth.has(spouse)) {
            depth.set(spouse, d + 1);
            personScope.add(spouse);
          }
        }
      }
    }
  };

  if (role === 'branch_curator') {
    // 向下 3 代
    descend(anchor.person_handle, 3);
    // 向上 3 代：沿 childOf（此人作为子女的家族）找祖先
    let cur = anchor.person_handle;
    for (let i = 0; i < 3; i++) {
      const fams = childOf.get(cur) || [];
      if (!fams.length) break;
      const fam = families.find((f) => f.handle === fams[0]);
      if (!fam) break;
      familyScope.add(fam.handle);
      const parent = fam.father_handle || fam.mother_handle;
      if (!parent) break;
      personScope.add(parent);
      cur = parent;
    }
  } else {
    // user：无限向下
    descend(anchor.person_handle, null);
  }

  return { person: personScope, family: familyScope, unrestricted: false };
}

/**
 * 便捷判断：用户能否编辑某 person handle
 * @param {object} familiesByTree
 * @param {string} phone
 * @param {string} role
 * @param {string} treeId
 * @param {string} personHandle
 */
export function canEditPerson(familiesByTree, phone, role, treeId, personHandle) {
  const scope = buildScope(familiesByTree, phone, role);
  if (scope.unrestricted) return true;
  return scope.person.has(personHandle);
}
