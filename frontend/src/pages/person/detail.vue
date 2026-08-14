<template>
  <view class="container">
    <view v-if="person" class="person-detail">
      <text class="name">{{ person.name }}</text>

      <view class="info-row" v-if="isLivingPerson">
        <t-tag theme="warning" variant="light">在世（信息已脱敏）</t-tag>
      </view>

      <view class="info-card">
        <t-cell-group :bordered="false">
          <t-cell
            v-if="person.birth_date && !isLivingPerson"
            title="生"
            :note="person.birth_date"
          />
          <t-cell
            v-if="person.death_date && !isLivingPerson"
            title="卒"
            :note="person.death_date"
          />
          <t-cell title="编号" :note="person.gramps_id" />
        </t-cell-group>
      </view>

      <view v-if="person.events && person.events.length" class="section">
        <text class="section-title">生平大事</text>
        <t-cell-group :bordered="false">
          <t-cell
            v-for="evt in person.events"
            :key="evt.handle"
            :title="evt.type"
            :description="evt.place"
            :note="evt.date"
          />
        </t-cell-group>
      </view>

      <view v-if="externalRefs.length" class="section">
        <text class="section-title">关联信息</text>
        <t-cell-group :bordered="false">
          <t-cell
            v-for="attr in externalRefs"
            :key="attr.key"
            :title="`${attr.key}: 查看 →`"
            arrow
            @click="goToExternal(attr.value)"
          />
        </t-cell-group>
      </view>
    </view>

    <view v-else class="loading">
      <t-loading size="40px" theme="spinner" text="加载中..." />
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
.info-row { display: flex; justify-content: center; margin-bottom: 12px; }
.info-card :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.section { margin-top: 20px; }
.section-title { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 8px; }
.section :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.loading { text-align: center; padding: 60px; color: #999; }
</style>
