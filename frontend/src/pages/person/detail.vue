<template>
  <view class="page">
    <PersonArchive
      v-if="ready"
      :key="`${treeId}:${handle}`"
      :tree-id="treeId"
      :handle="handle"
      mode="page"
      :mirror-of="mirrorOf"
      :mirror-fallback-note="mirrorFallbackNote"
      @open-person="openPersonPage"
      @open-tree="openTreePage"
      @load-failed="onLoadFailed"
    />
    <view v-else class="page-loading">
      <t-loading size="40px" theme="spinner" text="加载中..." />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { openTreeHome, fetchPerson, mirrorTargetOf, MIRROR_UNAVAILABLE_NOTE } from '@/business';
import type { MirrorFields, MirrorTarget } from '@/business';
import PersonArchive from '@/components/person-archive/person-archive.vue';

/**
 * 人物详情页（薄壳）
 * 全部档案内容已抽到 PersonArchive 组件（components/person-archive/）。
 * 本页仅保留为深链落点（外部链接/跨树跳转/分享直达），浏览场景请用 PersonDetailModal。
 *
 * 口径 A（镜像节点点击 = 打开真身档案）· 深链落地：
 * 落点 handle 若是镜像节点（external_mirror='true' + 真身树/真身 handle 齐备）→ 就地解析真身
 * （tree_id/handle 换成 external_tree / external_person_handle）、收敛地址栏，并交给 PersonArchive
 * 显示第 3 条标注；真身拉取失败 → 回退镜像本树副本 + 顶部提示「真身内容不可见」（第 5 条）。
 */
const treeId = ref('');
const handle = ref('');
const ready = ref(false);
/** 本次落地由镜像解析而来时的真身目标（普通落地为 null = 零影响） */
const mirrorOf = ref<MirrorTarget | null>(null);
/** 回退态（真身不可见）：非空即顶部提示文案 */
const mirrorFallbackNote = ref('');
/** 镜像原坐标（回退用） */
const mirrorOrigin = ref<{ treeId: string; handle: string } | null>(null);
const mirrorFellBack = ref(false);

onLoad(async (options: any) => {
  let t: string = options?.tree_id || '';
  let h: string = options?.handle || '';
  // 口径 A：深链落点可能是镜像节点 → 解析真身并收敛 URL（失败则维持落点原样）
  if (t && h) {
    try {
      const target = mirrorTargetOf(await fetchPerson(t, h));
      if (target) {
        mirrorOf.value = target;
        mirrorOrigin.value = { treeId: t, handle: h };
        convergeUrlTo(target.treeId, target.handle);
        t = target.treeId;
        h = target.handle;
      }
    } catch {
      // 拉取失败：按原落点打开本树副本（PersonArchive 自行展示错误态）
    }
  }
  treeId.value = t;
  handle.value = h;
  ready.value = true;
});

/** 真身不可见（404/权限/网络）→ 回退镜像本树副本 + 顶部提示（口径 A 第 5 条） */
function onLoadFailed() {
  if (!mirrorOf.value || mirrorFellBack.value) return;
  const origin = mirrorOrigin.value;
  if (!origin) return;
  mirrorFellBack.value = true;
  mirrorFallbackNote.value = MIRROR_UNAVAILABLE_NOTE;
  treeId.value = origin.treeId;
  handle.value = origin.handle;
  // 地址栏必须收敛回镜像原坐标：否则刷新即真身 404 错误页（且分享链接对访客失效）。
  // 只做 replaceState，不 push/不重新 navigate → 不引入跳转循环。
  convergeUrlTo(origin.treeId, origin.handle);
}

/** H5 地址栏收敛到目标坐标（App.vue 的别名路由不受影响：本页只在 hash 路由下出现） */
function convergeUrlTo(t: string, h: string) {
  // #ifdef H5
  const hash = window.location.hash || '';
  if (hash.includes('/pages/person/detail')) {
    window.history.replaceState(
      null,
      '',
      `#/pages/person/detail?tree_id=${encodeURIComponent(t)}&handle=${encodeURIComponent(h)}`,
    );
  }
  // #endif
}

function openPersonPage(payload: { treeId: string; handle: string; mirrorOf?: MirrorFields | null }) {
  const target = mirrorTargetOf(payload.mirrorOf || null);
  const t = target ? target.treeId : payload.treeId;
  const h = target ? target.handle : payload.handle;
  uni.navigateTo({ url: `/pages/person/detail?tree_id=${t}&handle=${h}` });
}

function openTreePage(treeId: string) {
  openTreeHome(treeId);
}
</script>

<style scoped>
.page { min-height: 100vh; }
.page-loading { padding: 80px 0; text-align: center; color: #999; }
</style>
