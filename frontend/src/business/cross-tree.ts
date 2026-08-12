/**
 * 跨 tree 软关联业务逻辑
 * 读取人物的 external_tree / external_person_handle 自定义属性
 * 生成跨 tree 跳转链接
 */

import type { TreeMeta } from './types';

/**
 * 根据 tree-id 生成对外访问 URL
 * 优先自定义子域名，否则回退路径模式
 */
export function buildTreeUrl(treeId: string, meta: TreeMeta): string | null {
  // 查找匹配的元配置
  for (const [key, entry] of Object.entries(meta.trees)) {
    if (entry.tree_id === treeId) {
      if (entry.enable_custom_domain) {
        return `https://${key}`;
      }
      return entry.path_alias;
    }
  }
  // 回退：直接构造路径模式
  return `/tree/${treeId}`;
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
