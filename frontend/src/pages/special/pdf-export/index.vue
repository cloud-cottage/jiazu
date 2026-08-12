<template>
  <view class="container">
    <text class="title">族谱 PDF 导出</text>
    <text class="tree-id">Tree: {{ treeId }}</text>

    <view class="config-section">
      <text class="section-title">导出选项</text>

      <label class="option">
        <checkbox :checked="includePreface" @click="includePreface = !includePreface" />
        <text>谱序</text>
      </label>
      <label class="option">
        <checkbox :checked="includeTanghao" @click="includeTanghao = !includeTanghao" />
        <text>堂号</text>
      </label>
      <label class="option">
        <checkbox :checked="includeGeneration" @click="includeGeneration = !includeGeneration" />
        <text>字辈</text>
      </label>
      <label class="option">
        <checkbox :checked="includeLineage" @click="includeLineage = !includeLineage" />
        <text>世系图</text>
      </label>
      <label class="option">
        <checkbox :checked="includeBiography" @click="includeBiography = !includeBiography" />
        <text>人物小传</text>
      </label>
      <label class="option">
        <checkbox :checked="includeMigration" @click="includeMigration = !includeMigration" />
        <text>迁徙备注</text>
      </label>
    </view>

    <view class="preview-section">
      <text class="section-title">格式说明</text>
      <text class="desc">
        完整印刷级竖排中式族谱，使用 paged.js 渲染。
        包含谱序、堂号、字辈、世系、人物小传、迁徙备注等内容。
        竖排格式符合传统中式族谱排版规范。
      </text>
    </view>

    <button class="export-btn" @click="doExport">生成并下载 PDF</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const treeId = ref('');
const includePreface = ref(true);
const includeTanghao = ref(true);
const includeGeneration = ref(true);
const includeLineage = ref(true);
const includeBiography = ref(true);
const includeMigration = ref(true);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

function doExport() {
  // #ifdef H5
  // 使用 paged.js 渲染后导出 PDF
  uni.showToast({ title: 'PDF 生成中...', icon: 'loading' });
  // TODO: 调用 paged.js 渲染引擎
  // #endif

  // #ifdef MP-WEIXIN
  uni.showToast({ title: '请使用网页版导出', icon: 'none' });
  // #endif
}
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }
.config-section { margin-top: 24px; }
.section-title { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 12px; }
.option { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 14px; }
.preview-section { margin-top: 20px; padding: 16px; background: #FFF8E1; border-radius: 8px; }
.desc { font-size: 13px; color: #666; line-height: 1.6; display: block; }
.export-btn { margin-top: 24px; background: #8B4513; color: #fff; font-size: 16px; border-radius: 8px; }
</style>
