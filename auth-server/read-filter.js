/**
 * 读路径响应裁剪 — 纯函数（auth-server 用）
 *
 * 规格：docs/permission-tier.spec.md §5（读 API 契约）
 * 与 cloudfunctions/compat-api/lib/tree-access.js + index.js 的裁剪语义一致：
 * - /people|/search 列表：filter（handle 或 object.handle）
 * - /families 列表：family 任一成员隐藏即剔除（Gramps 原生 father_handle/mother_handle/child_ref_list）
 * - /people/<handle>、/families/<handle> 详情：隐藏 → 404（不泄漏"存在但隐藏"）
 */

import { isHiddenFamily } from './tree-access.js';

/** GET 列表/详情读端点是否参与节点级裁剪 */
export function isReadFilterEndpoint(pathname) {
  return (
    pathname === '/people' || pathname === '/people/' ||
    pathname === '/families' || pathname === '/families/' ||
    pathname === '/search' || pathname === '/search/' ||
    /^\/people\/[^/]+\/?$/.test(pathname) ||
    /^\/families\/[^/]+\/?$/.test(pathname)
  );
}

/**
 * 按 access 裁剪读响应体。返回 { status, body } | null（null = 原样转发）。
 * 仅处理 JSON；非 JSON / 非数组列表 / 可见详情 → null。
 */
export function filterReadBody(access, pathname, bodyText) {
  let obj;
  try {
    obj = JSON.parse(bodyText);
  } catch {
    return null; // 非 JSON 原样
  }
  const isDetail = /^\/(people|families)\/[^/]+\/?$/.test(pathname);
  if (isDetail) {
    const isPerson = pathname.startsWith('/people/');
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.handle) {
      const hidden = isPerson
        ? access.isHiddenPerson(obj.handle)
        : isHiddenFamily(access, obj);
      if (hidden) {
        return { status: 404, body: JSON.stringify({ error: '该节点暂不可见（近代世谱系仅家族成员可见）' }) };
      }
    }
    return null;
  }
  if (!Array.isArray(obj)) return null;
  if (pathname === '/families' || pathname === '/families/') {
    const kept = obj.filter((f) => !isHiddenFamily(access, f));
    return { status: 200, body: JSON.stringify(kept) };
  }
  const kept = obj.filter((item) => {
    const handle = item && typeof item === 'object'
      ? item.handle || item.object?.handle
      : null;
    return handle ? !access.isHiddenPerson(handle) : true;
  });
  return { status: 200, body: JSON.stringify(kept) };
}
