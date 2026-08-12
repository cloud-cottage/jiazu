<template>
  <view class="container">
    <view class="header">
      <text class="title">家族历史数字馆</text>
      <text class="subtitle">多姓氏、多支派家谱数字化展示平台</text>
    </view>

    <view class="hall-list">
      <view
        v-for="card in halls"
        :key="card.tree_id"
        class="hall-card"
        @click="goToHall(card)"
      >
        <text class="hall-surname">{{ card.surname }}氏</text>
        <text class="hall-title">{{ card.title }}</text>
        <text class="hall-origin">发源地：{{ card.origin }}</text>
        <text class="hall-desc">{{ card.description }}</text>
      </view>

      <view v-if="halls.length === 0" class="empty">
        <text>暂无已上线的家族数字馆</text>
      </view>
    </view>

    <view class="footer">
      <text class="link" @click="goToPage('/pages/about/about')">关于本站 · 免责声明</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchTreeMeta, buildTreeUrl } from '@/business';
import type { DigitalHallCard, TreeMeta } from '@/business/types';

const halls = ref<DigitalHallCard[]>([]);

onMounted(async () => {
  try {
    const meta: TreeMeta = await fetchTreeMeta();
    halls.value = Object.entries(meta.trees).map(([_, entry]) => ({
      tree_id: entry.tree_id,
      title: entry.display_title,
      surname: entry.surname_char,
      origin: entry.origin,
      description: entry.description,
      url: buildTreeUrl(entry.tree_id, meta) || `/tree/${entry.tree_id}`,
    }));
  } catch (e) {
    console.error('加载元数据失败:', e);
  }
});

function goToHall(card: DigitalHallCard) {
  uni.navigateTo({ url: `/pages/hall/index?tree_id=${card.tree_id}` });
}

function goToPage(path: string) {
  uni.navigateTo({ url: path });
}
</script>

<style scoped>
.container { padding: 20px; }
.header { text-align: center; margin-bottom: 30px; }
.title { font-size: 24px; font-weight: bold; display: block; }
.subtitle { font-size: 14px; color: #666; margin-top: 8px; display: block; }
.hall-list { display: flex; flex-direction: column; gap: 16px; }
.hall-card {
  padding: 16px; border-radius: 12px; background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.hall-surname { font-size: 20px; font-weight: bold; color: #8B4513; display: block; }
.hall-title { font-size: 16px; margin-top: 4px; display: block; }
.hall-origin { font-size: 13px; color: #888; margin-top: 6px; display: block; }
.hall-desc { font-size: 14px; color: #555; margin-top: 4px; display: block; }
.empty { text-align: center; padding: 60px 0; color: #999; }
.footer { text-align: center; margin-top: 30px; }
.link { color: #8B4513; font-size: 14px; }
</style>
