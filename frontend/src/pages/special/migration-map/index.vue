<template>
  <view class="container">
    <text class="title">迁徙地图</text>
    <text class="tree-id">Tree: {{ treeId }}</text>

    <!-- ECharts 地图占位 — 后续集成 echarts-for-weixin 或 H5 ECharts -->
    <view class="map-placeholder">
      <text class="placeholder-text">🗺️ 迁徙路线地图</text>
      <text class="placeholder-hint">将使用 ECharts 渲染迁徙路线和分布点位</text>
    </view>

    <view class="routes">
      <text class="subtitle">迁徙路线</text>
      <view v-for="(route, idx) in routes" :key="idx" class="route-item">
        <text class="route-num">{{ idx + 1 }}</text>
        <text class="route-path">{{ route.from }} → {{ route.to }}</text>
        <text class="route-era">{{ route.era }}</text>
      </view>
      <text v-if="routes.length === 0" class="empty">暂无迁徙记录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const treeId = ref('');
const routes = ref<Array<{ from: string; to: string; era: string }>>([]);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

onMounted(async () => {
  // TODO: fetch migration events from Gramps-Web
});
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }
.map-placeholder {
  margin: 20px 0; padding: 60px 20px; background: #f5f5f5;
  border-radius: 12px; text-align: center; border: 2px dashed #ddd;
}
.placeholder-text { font-size: 16px; color: #999; display: block; }
.placeholder-hint { font-size: 13px; color: #bbb; display: block; margin-top: 8px; }
.subtitle { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 12px; }
.route-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.route-num { font-size: 13px; color: #fff; background: #8B4513; width: 24px; height: 24px; border-radius: 12px; text-align: center; line-height: 24px; margin-right: 8px; }
.route-path { font-size: 14px; color: #555; flex: 1; }
.route-era { font-size: 12px; color: #999; }
.empty { color: #999; text-align: center; padding: 20px; }
</style>
