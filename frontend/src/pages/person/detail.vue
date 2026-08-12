<template>
  <view class="container">
    <view v-if="person" class="person-detail">
      <text class="name">{{ person.name }}</text>

      <view class="info-row" v-if="isLivingPerson">
        <text class="living-badge">在世（信息已脱敏）</text>
      </view>

      <view class="info-row" v-if="person.birth_date && !isLivingPerson">
        <text class="label">生</text>
        <text class="value">{{ person.birth_date }}</text>
      </view>

      <view class="info-row" v-if="person.death_date && !isLivingPerson">
        <text class="label">卒</text>
        <text class="value">{{ person.death_date }}</text>
      </view>

      <view v-if="person.events && person.events.length" class="section">
        <text class="section-title">生平大事</text>
        <view v-for="evt in person.events" :key="evt.handle" class="event-item">
          <text class="event-type">{{ evt.type }}</text>
          <text class="event-date">{{ evt.date }}</text>
          <text class="event-place">{{ evt.place }}</text>
        </view>
      </view>

      <view v-if="externalRefs.length" class="section">
        <text class="section-title">关联信息</text>
        <view
          v-for="attr in externalRefs"
          :key="attr.key"
          class="attr-item link"
          @click="goToExternal(attr.value)"
        >
          <text>{{ attr.key }}: 查看 →</text>
        </view>
      </view>
    </view>

    <view v-else class="loading">
      <text>加载中...</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchPerson, sanitizePerson, isLiving } from '@/business';
import type { PersonDetail } from '@/business/types';

const treeId = ref('');
const handle = ref('');
const person = ref<PersonDetail | null>(null);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
  handle.value = options?.handle || '';
});

const isLivingPerson = computed(() => (person.value ? isLiving(person.value) : false));

const externalRefs = computed(() => {
  if (!person.value?.attributes) return [];
  return person.value.attributes.filter(
    (a) => a.key === 'external_tree' || a.key === 'external_person_handle' || a.key === 'external_relation_note',
  );
});

onMounted(async () => {
  if (!treeId.value || !handle.value) return;
  try {
    const raw = await fetchPerson(treeId.value, handle.value);
    person.value = sanitizePerson(raw);
  } catch (e) {
    console.error('加载人物详情失败:', e);
  }
});

function goToExternal(treeId: string) {
  // TODO: 查 tree-meta 映射生成跳转链接
  uni.navigateTo({ url: `/pages/hall/index?tree_id=${treeId}` });
}
</script>

<style scoped>
.container { padding: 20px; }
.name { font-size: 24px; font-weight: bold; color: #3E2723; display: block; text-align: center; margin-bottom: 16px; }
.living-badge { color: #E65100; font-size: 14px; background: #FFF3E0; padding: 4px 12px; border-radius: 4px; }
.info-row { display: flex; align-items: center; margin-bottom: 8px; }
.label { font-size: 14px; color: #8B4513; width: 32px; font-weight: bold; }
.value { font-size: 14px; color: #555; }
.section { margin-top: 20px; }
.section-title { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 8px; }
.event-item { padding: 8px 0; border-bottom: 1px solid #eee; }
.event-type { font-size: 14px; color: #555; display: block; }
.event-date { font-size: 13px; color: #888; display: block; }
.event-place { font-size: 13px; color: #888; display: block; }
.attr-item { font-size: 14px; color: #1565C0; padding: 4px 0; }
.loading { text-align: center; padding: 60px; color: #999; }
</style>
