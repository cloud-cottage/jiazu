<template>
  <view class="container">
    <t-search
      v-model="query"
      placeholder="搜索人物姓名、字号..."
      shape="round"
      :action="'搜索'"
      @submit="doSearch"
    />

    <view class="scope-toggle">
      <t-radio-group v-model="scope">
        <t-radio-button value="tree">当前家族</t-radio-button>
        <t-radio-button value="global">全局跨家族</t-radio-button>
      </t-radio-group>
    </view>

    <view class="results">
      <t-cell-group :bordered="false">
        <t-cell
          v-for="person in results"
          :key="person.handle"
          :title="person.name"
          :description="
            scope === 'global'
              ? `来自: ${person.tree_title}`
              : person.birth_date
                ? `${person.birth_date} — ${person.death_date || '?'}`
                : ''
          "
          arrow
          @click="goToPerson(person)"
        />
      </t-cell-group>

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
.scope-toggle { display: flex; justify-content: center; margin-top: 16px; }
.results { margin-top: 16px; }
.results :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.empty { text-align: center; padding: 40px; color: #999; }
</style>
