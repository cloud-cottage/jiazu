/**
 * 家族树写路径守卫（用户 2026-09-19 拍板口径；逐条实现，可由一句话改）
 *
 * 口径：家族树（`kind === 'family'`）只应包含「本族成员（男女）+ 婚入配偶」——
 * **女性一旦婚配，她的后代默认不进本树**；唯一例外 = 手动挂载的「承母嗣」特例。
 * 本族 / 婚入妇 / 外来姻亲根的判定**全部复用** `lib/family-population.js` 的
 * `analyzeFamilyGraph`（与 /tree/rank 的人数口径同一个真源），本文件不另立判据。
 *
 * ---------------- 三条规则 ----------------
 * 规则 1（分层）：**只对 `kind === 'family'` 的家族树生效**。世本（master，含「华胥→
 *   风伏羲」这类母系起始节点）与祖谱（clan）不套用 —— 套上会直接断链。
 * 规则 2（父非本族拒）：挂载目标家庭里的**父**在目标树里不是本族成员、且不是本树镜像
 *   （镜像已有既有的「子女跳真身树」逻辑）→ 拒。父槽空缺而挂载对象本人是男性时，
 *   以本人为父同判。要点：外姓姻亲的子女应在对方家族树上登记。
 * 规则 3（承母嗣）：父槽为空、以母亲为家长的形态下，若该母是**本族**且**已婚配** →
 *   拒，除非显式 `maternal_succession: true`。未婚配的本族女性 → 放行。
 * 规则 4（落库）：`maternal_succession` 作为**详情文档属性**（key 固定
 *   `maternal_succession`、值 `'true'`）写入，与称号等档案属性同一通道；新建即写。
 *
 * 「已婚配」的判据 = **树内存在实际配偶**：本人在某个家族占配偶槽，且该家族**另一槽位有真人**。
 * 只看 `spouse_families` 非空是不行的 —— 单亲母亲第一次添子女后自己就有了一个父亲槽为空的
 * 家族（父不详），若把这种家族也算「婚配」，她第二次添子女就会被自家守卫拦死。
 *
 * 零 IO、零全局状态：纯函数（`analyzeFamilyGraph` 也是纯函数）。
 */

import { analyzeFamilyGraph, isMirrorNode } from './family-population.js';

/** 「承母嗣」标记：详情文档属性 key（固定字符串，前端勾选框 → 请求体 `maternal_succession`） */
export const MATERNAL_SUCCESSION_KEY = 'maternal_succession';
/** 「承母嗣」标记：详情文档属性 value（固定字符串） */
export const MATERNAL_SUCCESSION_VALUE = 'true';

function genderOf(person) {
  const g = person && typeof person.gender === 'string' ? person.gender.trim() : '';
  return g || 'U';
}

/** 挂载对象的第一位配偶家族（与 child-write.js 的取法逐字一致） */
function firstSpouseFamily(tree, person) {
  const fh = (person?.spouse_families || [])[0] || '';
  return fh ? tree?.families?.[fh] || null : null;
}

/**
 * 是否「已婚配」（树内存在实际配偶）：本人在某家族占配偶槽，且另一槽位坐着真人。
 * 本人 `spouse_families` 指向的家族同样在遍历范围内（两者本就是一回事：配偶槽即家族记录）。
 */
export function hasSpouseInTree(tree, handle) {
  if (!handle) return false;
  const people = tree?.people || {};
  for (const fam of Object.values(tree?.families || {})) {
    if (!fam) continue;
    const fa = fam.father_handle || '';
    const mo = fam.mother_handle || '';
    if (fa === handle && mo && people[mo]) return true;
    if (mo === handle && fa && people[fa]) return true;
  }
  return false;
}

/**
 * 「承母嗣」详情属性（规则 4）：勾选才写；已有同名属性时不重复追加。
 * @returns {Array<{key: string, value: string, type: string}>} 传出的新数组
 */
export function withMaternalSuccessionAttribute(attributes, maternalSuccession) {
  const out = Array.isArray(attributes) ? [...attributes] : [];
  if (!maternalSuccession) return out;
  if (out.some((a) => a && a.key === MATERNAL_SUCCESSION_KEY)) return out;
  out.push({ key: MATERNAL_SUCCESSION_KEY, value: MATERNAL_SUCCESSION_VALUE, type: MATERNAL_SUCCESSION_KEY });
  return out;
}

/**
 * 守卫（规则 1/2/3）：不通过即抛**裸 Error**（路由层 `safeError` → 400 业务文案），不写任何一棵树。
 *
 * @param {object} args
 * @param {object} args.tree     目标树（tree JSON：people / families）
 * @param {'family'|'clan'|'master'} args.kind 目标树种类（`treeKindOf(metaEntryOf(treeId))`）
 * @param {string} args.personHandle 挂载对象（新子女挂在其名下）
 * @param {boolean} [args.maternalSuccession] 是否显式声明「承母嗣」
 * @returns {void}
 */
export function assertChildWriteAllowed({ tree, kind = 'family', personHandle, maternalSuccession = false }) {
  // 规则 1：只对家族树生效（世本 / 祖谱不套用）
  if (kind !== 'family') return;
  const people = tree?.people || {};
  const attached = people[personHandle];
  if (!attached) return; // 节点不存在由调用方原有校验兜底，不在这里抢文案

  const { clan } = analyzeFamilyGraph(tree);
  const family = firstSpouseFamily(tree, attached);
  const fatherRef = family && people[family.father_handle] ? family.father_handle : '';
  // 规则 2 的判定对象：父槽里的人；父槽为空而挂载对象本人是男性时，以本人为父
  const father = fatherRef || (genderOf(attached) === 'M' ? attached.handle : '');

  // 规则 2：父不是本族成员、也不是本树镜像 → 拒
  if (father && !isMirrorNode(people[father]) && !clan.has(father)) {
    throw new Error(
      `「${people[father].name || father}」不是本族成员（外姓姻亲）：本树只允许本族成员的子女入谱，` +
        '其子女应在对方家族树上登记',
    );
  }

  // 规则 3：父槽为空（以母亲为家长）+ 本族 + 已婚配 → 需「承母嗣」
  if (!fatherRef && genderOf(attached) !== 'M' && clan.has(attached.handle) && hasSpouseInTree(tree, attached.handle)) {
    if (!maternalSuccession) {
      throw new Error(
        `「${attached.name || attached.handle}」已婚配：本族女性婚配后的后代默认不进本树；` +
          '如确属「承母嗣」特例，请勾选「承母嗣」后重试',
      );
    }
  }
}
