<template>
  <view class="container">
    <text class="title">文献浏览</text>
    <text class="tree-id">Tree: {{ treeId }}</text>

    <view class="media-grid">
      <view v-for="item in mediaList" :key="item.handle" class="media-card">
        <image
          v-if="item.mime_type?.startsWith('image/')"
          :src="item.thumbnail_url || item.url"
          mode="aspectFill"
          class="media-img"
        />
        <view v-else class="media-file">
          <text class="file-icon">📄</text>
        </view>
        <text class="media-desc">{{ item.description }}</text>
      </view>

      <view v-if="mediaList.length === 0" class="empty">
        <text>暂无可浏览的文献</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { MediaRef } from '@/business/types';

const treeId = ref('');
const mediaList = ref<MediaRef[]>([]);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

onMounted(async () => {
  // TODO: fetch media list from Gramps-Web API
});
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }
.media-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.media-card {
  width: calc(50% - 6px); background: #fff; border-radius: 8px;
  overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}
.media-img { width: 100%; height: 150px; }
.media-file { height: 120px; display: flex; align-items: center; justify-content: center; background: #f9f9f9; }
.file-icon { font-size: 40px; }
.media-desc { font-size: 12px; color: #666; padding: 8px; display: block; }
.empty { text-align: center; padding: 60px; color: #999; width: 100%; }
</style>
