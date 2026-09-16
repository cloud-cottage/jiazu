<template>
  <view class="page">
    <PersonArchive
      v-if="ready"
      :key="`${treeId}:${handle}`"
      :tree-id="treeId"
      :handle="handle"
      mode="page"
      @open-person="openPersonPage"
      @open-tree="openTreePage"
    />
    <view v-else class="page-loading">
      <t-loading size="40px" theme="spinner" text="加载中..." />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { openTreeHome } from '@/business';
import PersonArchive from '@/components/person-archive/person-archive.vue';

/**
 * 人物详情页（薄壳）
 * 全部档案内容已抽到 PersonArchive 组件（components/person-archive/）。
 * 本页仅保留为深链落点（外部链接/跨树跳转/分享直达），浏览场景请用 PersonDetailModal。
 */
const treeId = ref('');
const handle = ref('');
const ready = ref(false);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
  handle.value = options?.handle || '';
  ready.value = true;
});

function openPersonPage(payload: { treeId: string; handle: string }) {
  uni.navigateTo({ url: `/pages/person/detail?tree_id=${payload.treeId}&handle=${payload.handle}` });
}

function openTreePage(treeId: string) {
  openTreeHome(treeId);
}
</script>

<style scoped>
.page { min-height: 100vh; }
.page-loading { padding: 80px 0; text-align: center; color: #999; }
</style>
