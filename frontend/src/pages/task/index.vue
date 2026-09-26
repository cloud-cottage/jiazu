<template>
  <view class="task-page">
    <view class="tp-head">
      <text class="tp-title">领取今日奖励</text>
      <text class="tp-sub">每日任务 · 北京时间自然日重置 · 每条每日可领 1 次</text>
    </view>
    <!-- 与家谱页 tab「领取今日奖励」面板**同一份组件**（单真源；本页为子包独立入口） -->
    <TaskList />
  </view>
</template>

<script setup lang="ts">
import TaskList from '@/components/task-center/task-list.vue';
</script>

<style scoped>
.task-page { padding: 16px 0 40px; }
.tp-head { padding: 0 16px; }
.tp-title { font-size: 16px; font-weight: bold; color: #3E2723; letter-spacing: 2px; }
.tp-sub { display: block; margin-top: 6px; font-size: 11px; color: #B5A594; }
</style>
