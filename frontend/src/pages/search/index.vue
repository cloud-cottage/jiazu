<template>
  <view class="container">
    <view class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="搜索人物姓名、字号..."
        @confirm="doSearch"
      />
      <text class="search-btn" @click="doSearch">搜索</text>
    </view>

    <view class="scope-toggle">
      <text
        :class="['scope-item', { active: scope === 'tree' }]"
        @click="scope = 'tree'"
      >当前家族</text>
      <text
        :class="['scope-item', { active: scope === 'global' }]"
        @click="scope = 'global'"
      >全局跨家族</text>
    </view>

    <view class="results">
      <view
        v-for="person in results"
        :key="person.handle"
        class="result-item"
        @click="goToPerson(person)"
      >
        <text class="result-name">{{ person.name }}</text>
        <text class="result-tree" v-if="scope === 'global'">来自: {{ person.tree_title }}</text>
        <text class="result-info" v-if="person.birth_date">
          {{ person.birth_date }} — {{ person.death_date || '?' }}
        </text>
      </view>

      <view v-if="searched && results.length === 0" class="empty">
        <text>未找到匹配结果</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { searchPeople } from '@/business';
import type { PersonSummary } from '@/business/types';

const treeId = ref('');
const query = ref('');
const scope = ref<'tree' | 'global'>('tree');
const searched = ref(false);
const results = ref<Array<PersonSummary & { tree_title?: string }>>([]);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

async function doSearch() {
  if (!query.value.trim()) return;
  searched.value = true;
  try {
    const res = await searchPeople({
      query: query.value,
      tree_id: scope.value === 'tree' ? treeId.value : undefined,
    });
    // 全局搜索时，结果中每项会有 tree_id/tree_title
    results.value = res.people as any[];
  } catch (e) {
    console.error('搜索失败:', e);
    results.value = [];
  }
}

function goToPerson(person: any) {
  const tid = scope.value === 'global' ? person.tree_id : treeId.value;
  uni.navigateTo({ url: `/pages/person/detail?tree_id=${tid}&handle=${person.handle}` });
}
</script>

<style scoped>
.container { padding: 20px; }
.search-bar { display: flex; gap: 8px; }
.search-input {
  flex: 1; height: 40px; border: 1px solid #ddd; border-radius: 8px;
  padding: 0 12px; font-size: 14px;
}
.search-btn { font-size: 14px; color: #fff; background: #8B4513; padding: 8px 16px; border-radius: 8px; line-height: 24px; }
.scope-toggle { display: flex; gap: 12px; margin-top: 12px; }
.scope-item { font-size: 13px; color: #999; padding: 4px 12px; border-radius: 12px; background: #f0f0f0; }
.scope-item.active { color: #fff; background: #8B4513; }
.results { margin-top: 16px; }
.result-item { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.result-name { font-size: 16px; font-weight: bold; color: #3E2723; display: block; }
.result-tree { font-size: 12px; color: #8B4513; display: block; }
.result-info { font-size: 13px; color: #888; display: block; margin-top: 2px; }
.empty { text-align: center; padding: 40px; color: #999; }
</style>
