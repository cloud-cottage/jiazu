<template>
  <view class="container">
    <text class="title">世系图谱</text>
    <text class="tree-id" v-if="treeId">Tree: {{ treeId }}</text>
    <TreePedigree :tree-id="treeId" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import TreePedigree from '@/components/tree-pedigree/tree-pedigree.vue';

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
