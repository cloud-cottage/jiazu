/**
 * 跨 tree 软关联业务逻辑
 * 读取人物的 external_tree / external_person_handle 自定义属性
 * 生成跨 tree 跳转链接
 */

import type { TreeEntry, TreeMeta } from './types';
import { personIdDisplay } from './format';
import {
  CHAIN_MIRROR_LOCK_MESSAGE,
  CLAN_FOUNDER_LOCK_MESSAGE,
  FOUNDER_LOCK_MESSAGE,
  ORPHAN_MIRROR_LOCK_MESSAGE,
  familyMirrorLockMessage,
  fetchTreeMetaRemote,
} from './api';
import type { TreeKind } from './api';

/** 中华世本（总谱）tree_id */
export const MASTER_TREE_ID = 'zhonghua';
/**
 * 中华世本的可读 uri：独立地址 `/z/`（产品口径）。
 * tree-meta 真源里的 path_alias `/zhonghua` 视为 **legacy**：只在前端映射为 `/z/`，不改真源。
 */
export const MASTER_PATH = '/z/';

/**
 * 根据 tree-id 生成对外访问 URL
 * 优先级：平台子域 (subdomain + _root_domain) > 自定义域名 (custom_domains) > 路径别名
 */
export function buildTreeUrl(treeId: string, meta: TreeMeta): string | null {
  // 查找匹配的元配置
  for (const entry of Object.values(meta.trees)) {
    if (entry.tree_id === treeId) {
      // 中华世本（is_master）：统一输出独立可读 uri /z/（meta 里 /zhonghua 为 legacy，不改真源）
      if (entry.is_master || treeId === MASTER_TREE_ID) return MASTER_PATH;
      // 平台子域（如 shiben.jiapu100.com）
      if (entry.subdomain && meta._root_domain) {
        return `https://${entry.subdomain}.${meta._root_domain}`;
      }
      // 客户自有域名（完整域名列表）
      if (entry.custom_domains && entry.custom_domains.length > 0) {
        return `https://${entry.custom_domains[0]}`;
      }
      return entry.path_alias;
    }
  }
  // 回退：直接构造路径模式
  return `/tree/${treeId}`;
}

/**
 * 解析访问 Host，返回命中的 tree_id（平台子域模式）
 * - 主域（jiapu100.com / www.jiapu100.com）→ null
 * - 子域（shiben.jiapu100.com）→ 匹配 trees 中 subdomain 或 custom_domains 的 tree_id
 */
export function resolveTreeIdByHost(host: string, meta: TreeMeta): string | null {
  const clean = host.replace(/:\d+$/, '').toLowerCase();
  const root = (meta._root_domain || '').replace(/:\d+$/, '').toLowerCase();

  // 精确匹配 custom_domains（含客户自有域名）
  for (const [treeId, entry] of Object.entries(meta.trees)) {
    if (entry.custom_domains?.some((d) => d.toLowerCase() === clean)) {
      return treeId;
    }
  }

  // 平台子域：host 必须以 .<root_domain> 结尾，且前缀非空、非 www
  if (root && clean.endsWith(`.${root}`)) {
    const prefix = clean.slice(0, -(root.length + 1));
    if (!prefix || prefix === 'www') return null;
    for (const [treeId, entry] of Object.entries(meta.trees)) {
      if ((entry.subdomain || '').toLowerCase() === prefix) {
        return treeId;
      }
    }
  }
  return null;
}

/** 从 tree-meta 中查找 tree_id 对应的可读 path_alias（如 /ji_23395_01） */
export function treePathAlias(treeId: string, meta: TreeMeta | null): string {
  const entry = meta?.trees?.[treeId] || Object.values(meta?.trees || {}).find((t) => t.tree_id === treeId);
  // 中华世本（is_master）：独立地址 /z/（meta 里 /zhonghua 视为 legacy）；祖谱维持 /z/<tree_id>
  if (treeId === MASTER_TREE_ID || entry?.is_master) return MASTER_PATH;
  if (entry?.path_alias) return entry.path_alias;
  // 祖谱固定走 /z/<tree_id>（docs/clan-tree.spec.md §6）
  if (entry?.kind === 'clan') return `/z/${treeId}`;
  return `/${treeId}`;
}

/**
 * 打开家族树首页（可读 uri 地址，如 /ji_23395_01）
 * - 内部仍用 uni 路由跳转 hall 页
 * - H5 下将地址栏改写为可读 path_alias，且支持 /<alias> 直达（App.vue 解析）
 */
export function openTreeHome(treeId: string): void {
  uni.navigateTo({ url: `/pages/hall/index?tree_id=${treeId}` });
  // #ifdef H5
  setTimeout(() => {
    fetch('/api/tree-meta')
      .then((r) => (r.ok ? r.json() : null))
      .then((meta: TreeMeta | null) => {
        // 仅当仍停留在该树的首页时才改写地址栏（避免覆盖后续跳转）
        if (location.hash.includes(`pages/hall/index?tree_id=${treeId}`)) {
          history.replaceState(null, '', treePathAlias(treeId, meta));
        }
      })
      .catch(() => {});
  }, 60);
  // #endif
}

/**
 * 生成跨 tree 人物跳转链接
 */
export function buildCrossTreePersonUrl(
  targetTreeId: string,
  personHandle: string,
  meta: TreeMeta,
): string | null {
  // 总谱基址是 /z/（带尾斜杠）：拼人物深链前去掉尾斜杠，避免出现 /z//person/…
  const base = (buildTreeUrl(targetTreeId, meta) || '').replace(/\/$/, '');
  if (!base) return null;
  // 如果是完整 URL（自定义域名）
  if (base.startsWith('http')) {
    return `${base}/person/${personHandle}`;
  }
  return `${base}/person/${personHandle}`;
}

/**
 * 校验 external_tree 引用是否有效
 * @returns 无效引用的告警列表
 */
export function validateExternalRefs(
  records: Array<{
    personId: string;
    personName: string;
    externalTree: string;
    externalPersonHandle: string;
  }>,
  meta: TreeMeta,
): Array<{ personId: string; personName: string; externalTree: string; reason: string }> {
  const validTreeIds = new Set(Object.values(meta.trees).map((t) => t.tree_id));
  const warnings: Array<{
    personId: string;
    personName: string;
    externalTree: string;
    reason: string;
  }> = [];

  for (const rec of records) {
    if (!validTreeIds.has(rec.externalTree)) {
      warnings.push({
        personId: rec.personId,
        personName: rec.personName,
        externalTree: rec.externalTree,
        reason: `tree-id "${rec.externalTree}" 在 tree-meta.json 中未找到，可能为死链接`,
      });
    }
  }

  return warnings;
}

// ============================================================================
// 口径 A：镜像节点点击 = 打开真身档案（用户拍板；判据、文案、树名缓存都集中在本文件）
// ============================================================================

/**
 * 判定镜像所需的 external_* 指针字段。
 * 人物摘要（PersonSummary）、人物详情（PersonDetail）、树图节点（TreePersonNode）都结构兼容。
 *
 * ⚠️ 真身自身也会带 external_*（配偶登记 / 认祖指针），所以**绝不能**用「有 external_*」当镜像判据。
 */
export interface MirrorFields {
  external_mirror?: string;
  external_person_handle?: string;
  external_tree?: string;
  external_link_type?: string;
}

/**
 * 镜像节点的真身目标（口径 A 第 2 条）：
 * `treeId` = 真身所在树（external_tree），`handle` = 真身 handle（external_person_handle）。
 */
export interface MirrorTarget {
  treeId: string;
  handle: string;
  /** external_link_type：marriage / child / founder / chain / 其它 */
  linkType: string;
}

/**
 * 镜像可解析判据（口径 A 第 1 条，**三者齐备**才算镜像）：
 * `external_mirror === 'true'` 且 `external_person_handle` 非空 且 `external_tree` 非空。
 *
 * @returns 真身目标；非镜像 / 指针不全 → null（调用方按普通节点打开）
 */
export function mirrorTargetOf(personOrNode: MirrorFields | null | undefined): MirrorTarget | null {
  if (!personOrNode) return null;
  if (String(personOrNode.external_mirror ?? '').trim() !== 'true') return null;
  const treeId = String(personOrNode.external_tree ?? '').trim();
  const handle = String(personOrNode.external_person_handle ?? '').trim();
  if (!treeId || !handle) return null;
  return { treeId, handle, linkType: String(personOrNode.external_link_type ?? '').trim() };
}

/**
 * 镜像档位文案（口径 A 第 6/7 条）：树图卡片角标与统计栏共用，唯一真源。
 * marriage→外树配偶 / child→外树子女 / founder→外树始祖 / chain→外树上层链 / 其它→外树登记。
 */
export function mirrorLabelOf(linkType?: string | null): string {
  switch (String(linkType ?? '').trim()) {
    case 'marriage':
      return '外树配偶';
    case 'child':
      return '外树子女';
    case 'founder':
      return '外树始祖';
    case 'chain':
      return '外树上层链';
    default:
      return '外树登记';
  }
}

/** 真身内容不可见（口径 A 第 5 条兜底提示，文案逐字） */
export const MIRROR_UNAVAILABLE_NOTE = '真身内容不可见';

/**
 * 镜像标注文案（口径 A 第 3 条，文案逐字）：
 * `本节点为 (真身树 display_title) (真身全局编号) 的镜像 · 内容取自真身`
 */
export function mirrorNoteText(realTreeTitle: string, realGrampsId: string): string {
  return `本节点为 ${realTreeTitle} ${personIdDisplay(realGrampsId)} 的镜像 · 内容取自真身`;
}

/**
 * 模块级 tree-meta 缓存：树名（display_title）只取一次复用，**不要每次点击都请求**（口径 A 第 3 条）。
 * 失败也缓存（null）——标注回退显示 tree_id，不反复重试。
 */
let metaPromise: Promise<TreeMeta | null> | null = null;
function cachedTreeMeta(): Promise<TreeMeta | null> {
  if (!metaPromise) {
    metaPromise = fetchTreeMetaRemote()
      .then((m) => m)
      .catch(() => null);
  }
  return metaPromise;
}

/** tree-meta 层级（**与后端 `treeKindOf` 同口径**：显式 kind 优先，缺省按 family 兼容旧数据） */
export function treeKindOf(entry: TreeEntry | null | undefined): TreeKind {
  const k = String(entry?.kind ?? '').trim();
  if (k === 'master' || k === 'clan' || k === 'family') return k;
  return entry?.is_master ? 'master' : 'family';
}

/** 树的层级 + 展示名（tree-meta；取不到 → family + tree_id） */
export async function treeLayerOf(treeId: string): Promise<{ kind: TreeKind; title: string }> {
  const id = String(treeId || '').trim();
  if (!id) return { kind: 'family', title: '' };
  const meta = await cachedTreeMeta();
  const entry = Object.values(meta?.trees || {}).find((t) => t.tree_id === id);
  return { kind: treeKindOf(entry), title: entry?.display_title || id };
}

/**
 * 树的 display_title（取 tree-meta；**取不到时回退显示 tree_id**，口径 A 第 3 条）。
 */
export async function treeDisplayTitleOf(treeId: string): Promise<string> {
  const id = String(treeId || '').trim();
  if (!id) return '';
  return (await treeLayerOf(id)).title;
}

// ============================================================================
// R3 只读不变量（始祖真源反转 · 变体 A；裁定书 v1 · Zang 2026-09-20）
// 前端判据必须与后端 **逐条一致**，否则会出现「界面可点、后端 403」或「真身被误锁」。
// ============================================================================

/**
 * **只读镜像判据**（与后端 `lib/founder-attach.js` 的 `isReadonlyMirror` 逐条同口径）：
 * `external_mirror === 'true'` 且 `external_tree` 非空 且 `external_tree !== 本树 treeId`，
 * 且 `external_link_type` ∈ {founder, chain}。
 *
 * **与方向无关**：镜像指向上层（家族树 ← 祖谱 / 世本）还是**下层**（祖谱 ← 家族树始祖的登记镜像）都只读；
 * 真身节点在**其所在树**内可写 —— 家族树始祖即真身（R2），本树内不再有只读徽标 / 禁用态。
 * 唯一例外 = 出生地 / 居住地（契约 v2 C6，后端 `isPlaceFieldsOnly` 在只读闸门内放行）。
 */
export function isReadonlyMirror(fields: MirrorFields | null | undefined, treeId = ''): boolean {
  if (!fields) return false;
  if (String(fields.external_mirror ?? '').trim() !== 'true') return false;
  const target = String(fields.external_tree ?? '').trim();
  if (!target) return false;
  if (treeId && target === treeId) return false;
  const linkType = String(fields.external_link_type ?? '').trim();
  return linkType === 'founder' || linkType === 'chain';
}

/** 孤儿镜像（R2b）：镜像标记在、真身不可达（无 `external_tree`）→ 本层只读（后端 `isOrphanMirror` 同口径） */
export function isOrphanMirror(fields: MirrorFields | null | undefined): boolean {
  return (
    String(fields?.external_mirror ?? '').trim() === 'true' &&
    !String(fields?.external_tree ?? '').trim()
  );
}

/**
 * 家族树始祖的**登记指针**（R2）：`external_link_type === 'founder'` + `external_tree` 非空
 * 但**不带镜像标记** → 本树始祖仍是真身（身份字段本树可写），只是登记到了上层树。
 * （后端 `hasFounderRegistrationPointer` 同口径；与 `isReadonlyMirror` 互斥。）
 */
export function hasFounderRegistrationPointer(fields: MirrorFields | null | undefined): boolean {
  return (
    String(fields?.external_link_type ?? '').trim() === 'founder' &&
    !!String(fields?.external_tree ?? '').trim() &&
    String(fields?.external_mirror ?? '').trim() !== 'true'
  );
}

/** 本层节点的只读视图（徽标 + 方向相关提示；可编辑节点 → `readonly:false`、两串皆空） */
export interface MirrorReadonlyView {
  /** 本层是否整节点只读（R3 判据；孤儿镜像亦为 true） */
  readonly: boolean;
  /** 状态徽标文案（如「始祖节点 · 家族树镜像」；可编辑 → ''） */
  tag: string;
  /** 只读提示（按 `external_tree` 层级生成；可编辑 → ''） */
  note: string;
  /** 镜像指向层的 kind（可编辑 / 孤儿 → ''） */
  targetKind: TreeKind | '';
}

/**
 * 取本层节点的只读徽标与提示（**唯一入口**：页面不得自拼只读文案）。
 * 分档与后端 `mirrorLockMessageOf` 完全同构：
 * 孤儿镜像 → 孤儿文案；chain 镜像 → 需到总谱修改；founder 镜像按目标层
 * family（`该节点为 X 始祖的镜像，需在 X 中修改`）/ clan / master 取文案。
 */
export async function mirrorReadonlyViewOf(
  fields: MirrorFields | null | undefined,
  treeId = '',
): Promise<MirrorReadonlyView> {
  if (isOrphanMirror(fields)) {
    return {
      readonly: true,
      tag: '始祖节点 · 孤儿镜像',
      note: ORPHAN_MIRROR_LOCK_MESSAGE,
      targetKind: '',
    };
  }
  if (!isReadonlyMirror(fields, treeId)) {
    return { readonly: false, tag: '', note: '', targetKind: '' };
  }
  const linkType = String(fields?.external_link_type ?? '').trim();
  if (linkType === 'chain') {
    return {
      readonly: true,
      tag: '世系链节点 · 世本镜像',
      note: CHAIN_MIRROR_LOCK_MESSAGE,
      targetKind: 'master',
    };
  }
  const { kind, title } = await treeLayerOf(String(fields?.external_tree ?? ''));
  if (kind === 'family') {
    return { readonly: true, tag: '始祖节点 · 家族树镜像', note: familyMirrorLockMessage(title), targetKind: kind };
  }
  if (kind === 'clan') {
    return { readonly: true, tag: '始祖节点 · 祖谱镜像', note: CLAN_FOUNDER_LOCK_MESSAGE, targetKind: kind };
  }
  return { readonly: true, tag: '始祖节点 · 中华世本镜像', note: FOUNDER_LOCK_MESSAGE, targetKind: kind };
}
