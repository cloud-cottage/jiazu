<template>
  <view class="container">
    <text class="title">字辈检索</text>

    <view class="input-area">
      <t-input
        v-model="char"
        class="char-input"
        placeholder="输入一个汉字"
        :maxlength="1"
        clearable
        @enter="doSearch"
      />
      <t-button theme="primary" @click="doSearch">检索</t-button>
    </view>

    <view v-if="result" class="result">
      <t-tag
        v-if="result.found"
        theme="success"
        variant="light"
        size="large"
      >
        「{{ char }}」为 {{ result.tree_title }} 第 {{ result.generation }} 世字辈
      </t-tag>
      <t-tag v-else theme="danger" variant="light" size="large">
        未在已知字辈中找到「{{ char }}」
      </t-tag>
    </view>

    <view class="help">
      <text class="help-title">什么是字辈？</text>
      <text class="help-text">
        字辈又称派语、行第，是家族成员命名时统一使用的字。
        同一辈分的成员名字中嵌入相同的字，体现长幼有序、辈分分明。
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const treeId = ref('');
const char = ref('');
const result = ref<{ found: boolean; tree_title?: string; generation?: number } | null>(null);

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

function doSearch() {
  if (!char.value.trim()) return;
  // TODO: 从字辈数据源检索
  result.value = { found: false };
}
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.input-area { display: flex; gap: 8px; margin-top: 20px; justify-content: center; align-items: center; }
.char-input { width: 120px; }
.result { margin-top: 24px; text-align: center; }
.help { margin-top: 40px; padding: 16px; background: #FFF8E1; border-radius: 8px; }
.help-title { font-size: 14px; font-weight: bold; color: #8B4513; display: block; }
.help-text { font-size: 13px; color: #666; margin-top: 8px; line-height: 1.6; display: block; }
</style>
