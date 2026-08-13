<template>
  <view class="container">
    <text class="title">世系图谱</text>
    <text class="tree-id" v-if="treeId">Tree: {{ treeId }}</text>

    <view class="stats" v-if="people.length">
      <text class="stat">共 {{ people.length }} 人</text>
      <text class="stat">{{ surnameGroups.length }} 个姓氏</text>
    </view>

    <view v-if="loading" class="loading">
      <text>加载中...</text>
    </view>

    <view v-else-if="error" class="error">
      <text>{{ error }}</text>
    </view>

    <!-- 按姓氏分组的世系列表 -->
    <view v-else class="surname-groups">
      <view v-for="group in surnameGroups" :key="group.surname" class="group">
        <view class="group-header">
          <text class="group-surname">{{ group.surname || '（无姓）' }}</text>
          <text class="group-count">{{ group.people.length }} 人</text>
        </view>
        <view class="person-list">
          <view
            v-for="p in group.people"
            :key="p.handle"
            class="person-item"
            @click="goToPerson(p)"
          >
            <text class="person-name">{{ p.name }}</text>
            <text class="person-life" v-if="p.birth_date || p.death_date">
              {{ p.birth_date || '?' }} — {{ p.death_date || '?' }}
            </text>
            <text class="person-life" v-else-if="!isLiving(p)">已故</text>
          </view>
        </view>
      </view>

      <text v-if="people.length === 0" class="empty">该家族暂无人物记录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchPersonList, isLiving } from '@/business';
import type { PersonSummary } from '@/business/types';

const treeId = ref('');
const people = ref<PersonSummary[]>([]);
const loading = ref(true);
const error = ref('');

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

const surnameGroups = computed(() => {
  const groups = new Map<string, PersonSummary[]>();
  for (const p of people.value) {
    const surname = p.surname || '（无姓）';
    if (!groups.has(surname)) groups.set(surname, []);
    groups.get(surname)!.push(p);
  }
  // 按人数降序
  return Array.from(groups.entries())
    .map(([surname, list]) => ({ surname, people: list }))
    .sort((a, b) => b.people.length - a.people.length);
});

onMounted(async () => {
  if (!treeId.value) {
    error.value = '缺少 tree_id 参数';
    loading.value = false;
    return;
  }
  try {
    // 一次拉取全部（117 人规模小；后续大数据量改分页）
    const res = await fetchPersonList(treeId.value, 1, 500);
    people.value = res.data;
  } catch (e: any) {
    console.error('加载世系数据失败:', e);
    error.value = `加载失败: ${e.message || e}`;
  } finally {
    loading.value = false;
  }
});

function goToPerson(p: PersonSummary) {
  uni.navigateTo({
    url: `/pages/person/detail?tree_id=${treeId.value}&handle=${p.handle}`,
  });
}
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }
.stats { text-align: center; margin: 16px 0; padding: 10px; background: #FFF8E1; border-radius: 8px; }
.stat { font-size: 14px; color: #5D4037; margin: 0 12px; display: inline-block; }
.loading, .error, .empty { text-align: center; padding: 40px; color: #999; }
.error { color: #C62828; }
.surname-groups { margin-top: 12px; }
.group { margin-bottom: 20px; }
.group-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: #8B4513; border-radius: 8px 8px 0 0;
}
.group-surname { font-size: 17px; font-weight: bold; color: #fff; }
.group-count { font-size: 12px; color: #E8D5C0; }
.person-list { background: #fff; border-radius: 0 0 8px 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
.person-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid #f0f0f0;
}
.person-item:last-child { border-bottom: none; }
.person-name { font-size: 15px; color: #3E2723; font-weight: 500; }
.person-life { font-size: 12px; color: #999; }
</style>
