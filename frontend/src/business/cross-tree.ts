/**
 * 跨 tree 软关联业务逻辑
 * 读取人物的 external_tree / external_person_handle 自定义属性
 * 生成跨 tree 跳转链接
 */

import type { TreeMeta } from './types';

/**
 * 根据 tree-id 生成对外访问 URL
 * 优先级：平台子域 (subdomain + _root_domain) > 自定义域名 (custom_domains) > 路径别名
 */
export function buildTreeUrl(treeId: string, meta: TreeMeta): string | null {
  // 查找匹配的元配置
  for (const entry of Object.values(meta.trees)) {
    if (entry.tree_id === treeId) {
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
  const base = buildTreeUrl(targetTreeId, meta);
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
