<template>
  <view class="container">
    <text class="title">文献地址</text>
    <text class="tree-id">Tree: {{ treeId }}</text>

    <view v-if="loading" class="center">加载中...</view>
    <view v-else class="archive-card">
      <view class="archive-entry" @click="openArchive">
        <text class="archive-icon">📚</text>
        <text class="archive-title">史料归档网盘</text>
        <text class="archive-value">{{ archiveUrl || '暂未配置' }}</text>
        <text class="archive-arrow">›</text>
      </view>

      <view class="archive-note">
        <text class="note-zh">
          家族树涉及的史料、参考文献等资料归档于网盘，资料管理权限归属本谱系主理人（Tree Steward）。如有增补、修改需求，请联系管理员。
        </text>
        <text class="note-en">
          Relevant historical materials and reference documents are archived in the cloud disk, managed by Tree Steward. Please contact him for additions or revisions.
        </text>
      </view>

      <view class="archive-link" @click="openArchive">
        <text class="link-label">百度网盘：</text>
        <text class="link-value">{{ archiveUrl || '待管理员配置' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchTreeMetaRemote } from '@/business';

const treeId = ref('');
const archiveUrl = ref('');
const loading = ref(true);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

onMounted(async () => {
  try {
    const meta = await fetchTreeMetaRemote();
    for (const [, entry] of Object.entries(meta.trees)) {
      if (entry.tree_id === treeId.value) {
        archiveUrl.value = entry.archive_url || '';
        break;
      }
    }
  } catch (e) {
    console.error('加载文献地址失败:', e);
  } finally {
    loading.value = false;
  }
});

function openArchive() {
  const url = archiveUrl.value;
  if (!url) {
    uni.showToast({ title: '文献地址暂未配置', icon: 'none' });
    return;
  }
  // #ifdef H5
  window.open(url);
  // #endif
}
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }
.center { text-align: center; padding: 60px 0; color: #999; }

.archive-card {
  margin-top: 24px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F0E8DE;
}
.archive-entry {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 4px;
}
.archive-icon { font-size: 18px; }
.archive-title { font-size: 15px; font-weight: bold; color: #3E2723; }
.archive-value {
  flex: 1; font-size: 12px; color: #8B4513;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.archive-arrow { font-size: 16px; color: #B5A594; }
.archive-note {
  padding: 10px 12px; background: #FFF8E1; border-radius: 8px;
}
.note-zh { font-size: 12px; color: #5D4037; line-height: 1.7; display: block; }
.note-en { font-size: 11px; color: #A1887F; line-height: 1.6; display: block; margin-top: 6px; }
.archive-link {
  margin-top: 10px; display: flex; align-items: center; gap: 6px;
  padding: 10px 12px; background: #FBF6EF; border-radius: 8px;
}
.link-label { font-size: 13px; color: #8B4513; font-weight: bold; flex-shrink: 0; }
.link-value {
  flex: 1; font-size: 12px; color: #2C5F8A;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
