<template>
  <view class="container">
    <view class="hero">
      <text class="title">{{ hallInfo?.display_title || '加载中...' }}</text>
      <text class="origin" v-if="hallInfo">堂号发源地：{{ hallInfo.origin }}</text>
      <text class="desc" v-if="hallInfo">{{ hallInfo.description }}</text>
    </view>

    <view class="nav-grid">
      <view class="nav-item" @click="goTo('pedigree')">
        <text class="nav-icon">🌳</text>
        <text class="nav-label">世系图谱</text>
      </view>
      <view class="nav-item" @click="goTo('media')">
        <text class="nav-icon">📜</text>
        <text class="nav-label">文献浏览</text>
      </view>
      <view class="nav-item" @click="goTo('generation')">
        <text class="nav-icon">📖</text>
        <text class="nav-label">字辈检索</text>
      </view>
      <view class="nav-item" @click="goTo('migration')">
        <text class="nav-icon">🗺️</text>
        <text class="nav-label">迁徙地图</text>
      </view>
      <view class="nav-item" @click="goTo('pdf')">
        <text class="nav-icon">🖨️</text>
        <text class="nav-label">PDF族谱</text>
      </view>
      <view class="nav-item" @click="goTo('search')">
        <text class="nav-icon">🔍</text>
        <text class="nav-label">搜索</text>
      </view>
    </view>

    <view class="stats" v-if="stats">
      <text class="stat">收录人物：{{ stats.person_count }} 人</text>
      <text class="stat">家族分支：{{ stats.family_count }}</text>
      <text class="stat">历史文献：{{ stats.media_count }} 件</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchTreeMeta, fetchTreeStats } from '@/business';
import type { TreeEntry } from '@/business/types';

const treeId = ref('');
const hallInfo = ref<TreeEntry | null>(null);
const stats = ref<any>(null);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

onMounted(async () => {
  if (!treeId.value) return;

  try {
    const meta = await fetchTreeMeta();
    for (const [, entry] of Object.entries(meta.trees)) {
      if (entry.tree_id === treeId.value) {
        hallInfo.value = entry;
        break;
      }
    }
  } catch (e) {
    console.error('加载数字馆信息失败:', e);
  }

  try {
    stats.value = await fetchTreeStats(treeId.value);
  } catch (e) {
    console.error('加载统计失败:', e);
  }
});

function goTo(page: string) {
  const prefix = page === 'generation' || page === 'migration' || page === 'pdf'
    ? '/pages/special'
    : '/pages';
  const paths: Record<string, string> = {
    pedigree: `${prefix}/pedigree/index?tree_id=${treeId.value}`,
    media: `${prefix}/media/index?tree_id=${treeId.value}`,
    generation: `/pages/special/generation-poem/index?tree_id=${treeId.value}`,
    migration: `/pages/special/migration-map/index?tree_id=${treeId.value}`,
    pdf: `/pages/special/pdf-export/index?tree_id=${treeId.value}`,
    search: `/pages/search/index?tree_id=${treeId.value}`,
  };
  uni.navigateTo({ url: paths[page] });
}
</script>

<style scoped>
.container { padding: 20px; }
.hero { text-align: center; margin-bottom: 30px; }
.title { font-size: 22px; font-weight: bold; color: #3E2723; display: block; }
.origin { font-size: 14px; color: #888; margin-top: 8px; display: block; }
.desc { font-size: 14px; color: #555; margin-top: 8px; line-height: 1.6; display: block; }
.nav-grid { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
.nav-item {
  width: 30%; padding: 16px 8px; text-align: center;
  background: #fff; border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}
.nav-icon { font-size: 28px; display: block; }
.nav-label { font-size: 13px; color: #555; margin-top: 6px; display: block; }
.stats { text-align: center; margin-top: 24px; padding: 16px; background: #FFF8E1; border-radius: 8px; }
.stat { font-size: 14px; color: #5D4037; margin: 0 12px; display: inline-block; }
</style>
