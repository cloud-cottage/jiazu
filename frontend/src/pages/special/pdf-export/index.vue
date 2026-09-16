<template>
  <view class="container">
    <text class="title">族谱 PDF 导出</text>
    <text class="tree-id">Tree: {{ treeId }}</text>
    <DocLayoutPanel :tree-id="treeId" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import DocLayoutPanel from '@/components/doc-layout-panel/doc-layout-panel.vue';

const treeId = ref('');

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }
</style>
