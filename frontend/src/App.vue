<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { resolveTreeIdByHost } from '@/business';

// #ifdef H5
/** 非家族树路径保留段（避免误解析静态资源/页面路径） */
const RESERVED_PATHS = new Set([
  'pages', 'static', 'assets', 'api', 'index.html', 'favicon.ico', 'node_modules', 'z',
]);

/** 宗谱可读 uri：/z/<tree_id>（仅表示 kind='clan' 的树，页面内按 kind 切三段版式） */
const CLAN_PATH_RE = /^\/z\/([a-z0-9_]+)$/;
/** hash 形式宗谱别名：#/z/<tree_id> */
const CLAN_HASH_RE = /^z\/([a-z0-9_]+)$/;

/**
 * 家族树可读 uri 解析：
 * - 路径形式  /ji_23395_01          → 家族树首页（地址栏保持可读 uri）
 * - 路径形式  /z/ji_23395           → 宗谱首页（kind='clan'）
 * - hash 形式 #/ji_23395_01 / #/z/ji_23395 → 同上
 */
function resolveTreeAlias() {
  const pathname = location.pathname.replace(/\/+$/, '');
  const hashPath = location.hash.replace(/^#\/?/, '');
  const onInternalRoute = hashPath.startsWith('pages/') || pathname.startsWith('/pages/');

  const clanPath = pathname.match(CLAN_PATH_RE);
  if (clanPath) {
    // 已有内部路由 hash（如 #/pages/pedigree/index）时尊重该路由，不劫持
    if (!onInternalRoute) openAlias(clanPath[1], false, true);
    return;
  }
  const clanHash = hashPath.match(CLAN_HASH_RE);
  if (clanHash && !onInternalRoute) {
    openAlias(clanHash[1], true, true);
    return;
  }

  const m = pathname.match(/^\/([a-z0-9_]+)$/);
  if (m && !RESERVED_PATHS.has(m[1])) {
    if (!onInternalRoute) {
      openAlias(m[1], false);
    }
    return;
  }
  if (/^[a-z0-9_]+$/.test(hashPath) && !RESERVED_PATHS.has(hashPath)) {
    openAlias(hashPath, true);
  }
}

/**
 * 平台子域定位（商业化核心）：shiben.jiapu100.com 等 → 直接打开对应家族树首页
 * 仅当未命中显式路径/hash 内部路由时触发，避免劫持站内跳转
 */
function resolveHostTree() {
  fetch('/api/tree-meta')
    .then((r) => (r.ok ? r.json() : null))
    .then((meta: any) => {
      if (!meta) return;
      const treeId = resolveTreeIdByHost(location.host, meta);
      if (!treeId) return;
      // 已有内部路由（hash 模式 #/pages/... / history 模式 /pages/...）时不劫持
      const hashPath = location.hash.replace(/^#\/?/, '');
      if (hashPath.startsWith('pages/')) return;
      const pathname = location.pathname.replace(/\/+$/, '');
      if (pathname.startsWith('/pages/')) return;
      // 显式路径别名（如 /ji_23395_01、宗谱 /z/ji_23395）优先于子域
      if (CLAN_PATH_RE.test(pathname)) return;
      const m = pathname.match(/^\/([a-z0-9_]+)$/);
      if (m && !RESERVED_PATHS.has(m[1])) return;
      uni.reLaunch({ url: `/pages/hall/index?tree_id=${treeId}` });
    })
    .catch(() => {});
}

/** 按别名跳转家族树 / 宗谱首页（isClan=true 时地址栏保持 /z/<tree_id>） */
function openAlias(alias: string, isHash: boolean, isClan = false) {
  // 常见形态：path_alias 即 /tree_id（ji_23395_01）或宗谱 /z/ji_23395，按规则直接跳转，零等待
  let treeId = /^[a-z]+_\d+(?:_\d{2})?$/.test(alias) ? alias : '';
  if (!treeId) {
    fetch('/api/tree-meta')
      .then((r) => (r.ok ? r.json() : null))
      .then((meta: any) => {
        const entry: any = meta?.trees
          ? Object.values(meta.trees).find(
              (t: any) =>
                t.tree_id === alias ||
                (t.path_alias || '').replace(/^\/?(z\/)?/, '') === alias,
            )
          : null;
        const id = entry?.tree_id || '';
        if (id) gotoAlias(id, alias, isHash, isClan);
      })
      .catch(() => {});
    return;
  }
  gotoAlias(treeId, alias, isHash, isClan);
}

function gotoAlias(treeId: string, alias: string, isHash: boolean, isClan = false) {
  if (isHash) {
    // hash 形式：替换为内部页面路由
    location.replace(`#/pages/hall/index?tree_id=${treeId}`);
    return;
  }
  // 路径形式：reLaunch 到首页，地址栏保持可读 uri（宗谱带 /z/ 前缀）
  uni.reLaunch({ url: `/pages/hall/index?tree_id=${treeId}` });
  keepAliasUrl(alias, treeId, isClan ? `/z/${alias}` : `/${alias}`);
}

/** 等待内部路由提交后，把地址栏改写为可读 uri（/ji_23395_01 或宗谱 /z/ji_23395） */
function keepAliasUrl(alias: string, treeId: string, readablePath: string, tries = 0) {
  if (location.hash.includes(`pages/hall/index?tree_id=${treeId}`)) {
    history.replaceState(null, '', readablePath);
    return;
  }
  if (tries < 30) {
    setTimeout(() => keepAliasUrl(alias, treeId, readablePath, tries + 1), 60);
  }
}
// #endif

onLaunch(() => {
  console.log('家族历史数字馆 App Launch');
  // #ifdef H5
  resolveTreeAlias();
  resolveHostTree();
  // 兜底：hash 形式别名（#/ji_23395_01）未命中内部路由时重定向
  uni.onPageNotFound(() => {
    const hashPath = location.hash.replace(/^#\/?/, '');
    if (/^[a-z0-9_]+$/.test(hashPath) && !RESERVED_PATHS.has(hashPath)) {
      openAlias(hashPath, true);
    }
  });
  // #endif
});

onShow(() => {
  console.log('App Show');
});

onHide(() => {
  console.log('App Hide');
});
</script>

<style>
/* 全局样式 */
page {
  background-color: #f8f8f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  color: #333;
  font-size: 14px;
}

/* ---- TDesign 主题覆盖：古籍棕 ---- */
/* #ifdef H5 */
:root,
/* #endif */
page,
.page {
  --td-brand-color-1: #fdf6ec;
  --td-brand-color-2: #f9e8d0;
  --td-brand-color-3: #f0d0a8;
  --td-brand-color-4: #e4b27e;
  --td-brand-color-5: #d49355;
  --td-brand-color-6: #b06e33;
  --td-brand-color-7: #8b4513;
  --td-brand-color-8: #7a3a0e;
  --td-brand-color-9: #5c2d0a;
  --td-brand-color-10: #3e2723;

  --td-primary-color: #8b4513;
  --td-primary-color-1: var(--td-brand-color-1);
  --td-primary-color-2: var(--td-brand-color-2);
  --td-primary-color-3: var(--td-brand-color-3);
  --td-primary-color-4: var(--td-brand-color-4);
  --td-primary-color-5: var(--td-brand-color-5);
  --td-primary-color-6: var(--td-brand-color-6);
  --td-primary-color-7: var(--td-brand-color-7);
  --td-primary-color-8: var(--td-brand-color-8);
  --td-primary-color-9: var(--td-brand-color-9);
  --td-primary-color-10: var(--td-brand-color-10);

  --td-success-color: #2e7d32;
  --td-warning-color: #e65100;
  --td-error-color: #c62828;
}

/* 声明文本样式 */
.disclaimer {
  font-size: 12px;
  color: #999;
  line-height: 1.6;
}
</style>
