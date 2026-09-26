<template>
  <!--
    数字馆（家族树首页）：薄壳。
    主体（hero / 搜索 / 视图切换 / 祖谱三段版式 / 世本 / 各类弹窗）已抽为单真源共享组件
    `components/tree-hall/tree-hall.vue`（家谱 tab 复用同一份，禁止复制第二份模板）。
    本页只负责页面级生命周期：从路由参数取 tree_id 传给组件。
    地址栏别名链路不变：/ji_23395_01、/z/（世本）、/z/<tree_id>（祖谱）由 App.vue 解析后
    reLaunch 到 #/pages/hall/index?tree_id=<tree_id> 与本页对接。
  -->
  <TreeHall :tree-id="treeId" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import TreeHall from '@/components/tree-hall/tree-hall.vue';

const treeId = ref('');

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});
</script>
