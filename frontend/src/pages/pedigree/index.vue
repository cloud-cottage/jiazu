<template>
  <view class="container">
    <text class="title">世系图谱</text>
    <text class="tree-id">Tree: {{ treeId }}</text>

    <!-- 世系图谱占位 — 后续用 Canvas 或 SVG 渲染 -->
    <view class="chart-placeholder">
      <text class="placeholder-text">世系图谱可视化区域</text>
      <text class="placeholder-hint">将使用 D3.js / Canvas 渲染家族世系树</text>
    </view>

    <view class="generations">
      <text class="subtitle">世代列表</text>
      <view v-for="gen in generations" :key="gen.level" class="gen-row">
        <text class="gen-level">第 {{ gen.level }} 世</text>
        <text class="gen-names">{{ gen.names.join('、') }}</text>
      </view>
      <text v-if="generations.length === 0" class="empty">暂无数据</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const treeId = ref('');
const generations = ref<Array<{ level: number; names: string[] }>>([]);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

onMounted(async () => {
  // TODO: fetch pedigree data from Gramps-Web API
});
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }
.chart-placeholder {
  margin: 20px 0; padding: 60px 20px; background: #f5f5f5;
  border-radius: 12px; text-align: center; border: 2px dashed #ddd;
}
.placeholder-text { font-size: 16px; color: #999; display: block; }
.placeholder-hint { font-size: 13px; color: #bbb; display: block; margin-top: 8px; }
.subtitle { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 12px; }
.gen-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.gen-level { font-size: 14px; color: #8B4513; width: 60px; font-weight: bold; }
.gen-names { font-size: 14px; color: #555; flex: 1; }
.empty { color: #999; text-align: center; padding: 20px; }
</style>
