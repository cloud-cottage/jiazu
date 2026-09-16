/**
 * 锚点 + 节点编辑范围校验（与 auth-server/scope.js 行为一致）
 * 锚点集合：jiazu_anchors（phone -> {tree_id, person_handle, updated_at}）
 */
import { colGet, colSet, colDelete } from './store.js';

export async function setAnchor(phone, treeId, personHandle) {
  await colSet('jiazu_anchors', phone, {
    tree_id: treeId,
    person_handle: personHandle,
    updated_at: new Date().toISOString(),
  });
}

export async function clearAnchor(phone) {
  await colDelete('jiazu_anchors', phone);
}

export async function getAnchor(phone) {
  return colGet('jiazu_anchors', phone);
}

/**
 * 构建用户可编辑的 person/family 范围
 * user: 锚点节点 + 全部后代；branch_curator: 上下三代；tree_steward/chief_editor: 无限制
 */
export async function buildScope(families, phone, role) {
  if (role === 'tree_steward' || role === 'chief_editor') {
    return { person: null, family: null, unrestricted: true };
  }
  const anchor = await getAnchor(phone);
  if (!anchor) return { person: new Set(), family: new Set(), unrestricted: false };

  const personScope = new Set([anchor.person_handle]);
  const familyScope = new Set();

  // person -> 作为父母的家族 / 作为子女的家族
  const parentOf = new Map();
  const childOf = new Map();
  for (const f of families) {
    for (const p of [f.father_handle, f.mother_handle]) {
      if (!p) continue;
      if (!parentOf.has(p)) parentOf.set(p, []);
      parentOf.get(p).push(f.handle);
    }
    for (const ch of f.child_handles || []) {
      if (!childOf.has(ch)) childOf.set(ch, []);
      childOf.get(ch).push(f.handle);
    }
  }

  const descend = (start, limit) => {
    const queue = [start];
    const depth = new Map([[start, 0]]);
    while (queue.length) {
      const h = queue.shift();
      const d = depth.get(h) || 0;
      if (limit !== null && d >= limit) continue;
      for (const famHandle of parentOf.get(h) || []) {
        familyScope.add(famHandle);
        const fam = families.find((x) => x.handle === famHandle);
        for (const ch of fam?.child_handles || []) {
          if (!depth.has(ch)) {
            depth.set(ch, d + 1);
            personScope.add(ch);
            queue.push(ch);
          }
        }
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
    descend(anchor.person_handle, 3);
    let cur = anchor.person_handle;
    for (let i = 0; i < 3; i++) {
      const fams = childOf.get(cur) || [];
      if (!fams.length) break;
      const fam = families.find((x) => x.handle === fams[0]);
      if (!fam) break;
      familyScope.add(fam.handle);
      const parent = fam.father_handle || fam.mother_handle;
      if (!parent) break;
      personScope.add(parent);
      cur = parent;
    }
  } else {
    descend(anchor.person_handle, null);
  }

  return { person: personScope, family: familyScope, unrestricted: false };
}

/** 便捷：用户能否编辑某 person */
export async function canEditPerson(families, phone, role, personHandle) {
  const scope = await buildScope(families, phone, role);
  if (scope.unrestricted) return true;
  return scope.person.has(personHandle);
}

/** 便捷：用户能否编辑某 family（family 内的孩子或父母在范围内即可） */
export async function canEditFamily(families, phone, role, familyHandle) {
  const scope = await buildScope(families, phone, role);
  if (scope.unrestricted) return true;
  return scope.family.has(familyHandle);
}
