<template>
  <!-- 任务列表（tab「领取今日奖励」的面板 = 子包页 `pages/task/index` 的同一份组件，**单真源**） -->
  <view class="tq">
    <!-- 加载态（与列表同形的占位，不闪「空列表」） -->
    <view v-if="loading && tasks.length === 0" class="tq-loading">
      <text class="tq-loading-text">任务加载中…</text>
    </view>

    <!-- 失败态（spec §3-2：显式失败提示 + 可重试；**不得**渲染成「全部未达标」的假象） -->
    <view v-else-if="loadError && tasks.length === 0" class="tq-fail">
      <text class="tq-fail-text">{{ loadError }}</text>
      <view class="tq-retry" @click="load()">
        <text class="tq-retry-text">重新加载</text>
      </view>
    </view>

    <template v-else>
      <view class="tq-head">
        <text class="tq-day">每日任务 · 北京时间自然日 {{ day || '—' }}（次日重置）</text>
        <text v-if="loading" class="tq-refreshing">刷新中…</text>
      </view>

      <view v-for="t in tasks" :key="t.task" class="tq-card">
        <view class="tq-row">
          <text class="tq-title">{{ t.title }}</text>
          <text class="tq-state" :class="'tq-state-' + t.state">{{ stateTextOf(t) }}</text>
        </view>
        <!-- 规则说明：**逐字取后端下发**（前端不自编说明文案） -->
        <text class="tq-rule">{{ t.rule }}</text>
        <!-- 未达标 / 不可领的原因（后端下发的中文文案；空串 = 该态无原因行） -->
        <text v-if="t.blocked_reason" class="tq-block">{{ t.blocked_reason }}</text>

        <view class="tq-act">
          <view
            class="tq-btn"
            :class="{ 'tq-btn-on': isHighlighted(t), 'tq-btn-busy': claiming === t.task }"
            @click="onClaim(t)"
          >
            <text class="tq-btn-text">{{ claiming === t.task ? '领取中…' : '领取' }}</text>
          </view>
          <text
            v-if="feedbackOf[t.task]"
            class="tq-feedback"
            :class="{ 'tq-feedback-err': !!feedbackErr[t.task] }"
          >{{ feedbackOf[t.task] }}</text>
        </view>
      </view>

      <!-- 行囊摘要（领取成功后重取 `GET /assets/summary`；文案单点 = business/asset-text.ts） -->
      <text v-if="bagLine" class="tq-bag">{{ bagLine }}</text>
      <text v-else-if="loadError" class="tq-warn">{{ loadError }}</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue';
import { fetchAssetsSummary } from '@/business/api';
import {
  bagSummaryLine,
  claimReceiptLines,
  fetchTasksToday,
  isAlreadyClaimed,
  isHighlighted,
  isTaskUnauthorized,
  postTaskClaim,
  stateTextOf,
  taskErrorText,
  type TaskView,
} from '@/business/tasks';

const day = ref('');
const tasks = ref<TaskView[]>([]);
const loading = ref(false);
const loadError = ref('');
const bagLine = ref('');
/** 正在领取的任务名（同一时刻只允许一次领取请求） */
const claiming = ref('');
/** 每行可见反馈（成功 = 回执行；失败 = 后端中文错因） */
const feedbackOf = reactive<Record<string, string>>({});
const feedbackErr = reactive<Record<string, boolean>>({});

/** 行囊摘要（只展示后端读数；取不到 → 不显示该行，不打扰） */
async function loadBag() {
  try {
    const s = await fetchAssetsSummary();
    bagLine.value = bagSummaryLine({ fragments: s.fragments, bamboos_total_pieces: s.bamboos_total_pieces });
    loadError.value = '';
  } catch {
    bagLine.value = '';
  }
}

/**
 * 拉当日三态（`GET /tasks/today`）。
 * 静默刷新（已有数据）时复用同一路径：`tasks` 非空则不闪加载态。
 */
async function load() {
  loading.value = true;
  try {
    const data = await fetchTasksToday();
    day.value = data.day;
    tasks.value = data.tasks;
    loadError.value = '';
  } catch (e) {
    loadError.value = isTaskUnauthorized(e)
      ? '登录已过期，请重新登录后领取奖励'
      : `任务读取失败：${taskErrorText(e, '请稍后重试')}`;
  } finally {
    loading.value = false;
  }
}

/**
 * 领取（`POST /tasks/claim`）。三条纪律：
 * ① 成功与失败**都有可见反馈**（行内文案 + toast），绝不静默；
 * ② 后端 409「同日已领」⇒ **映射为「已领取」态**（重取当日状态），不作错误弹窗；
 * ③ 成功后**重取当日状态 + 行囊摘要**（奖励含石榴籽碎片 / 竹片 / 奖励池分发）。
 */
async function onClaim(t: TaskView) {
  if (claiming.value) return;
  claiming.value = t.task;
  feedbackErr[t.task] = false;
  feedbackOf[t.task] = '';
  try {
    const { message, result } = await postTaskClaim(t.task);
    feedbackOf[t.task] = claimReceiptLines(message, result).join('；');
    if (result.tasks.length) {
      tasks.value = result.tasks;
      day.value = result.day || day.value;
    }
    uni.showToast({ title: message || '领取成功', icon: 'success' });
    await Promise.all([load(), loadBag()]);
  } catch (e) {
    feedbackErr[t.task] = true;
    feedbackOf[t.task] = isTaskUnauthorized(e)
      ? '登录已过期，请重新登录后领取奖励'
      : taskErrorText(e);
    uni.showToast({ title: feedbackOf[t.task], icon: 'none' });
    // 409「同日已领」按 spec §5-2 第 3 条映射为「已领取」态（重取下发展示真态）
    if (isAlreadyClaimed(e)) await load();
  } finally {
    claiming.value = '';
  }
}

/** 供页面调用：切入「领取今日奖励」tab 时刷新（静默；首次由 onMounted 承担） */
async function refresh() {
  await Promise.all([load(), loadBag()]);
}

onMounted(() => {
  void refresh();
});

defineExpose({ refresh });
</script>

<style scoped>
.tq { padding: 12px 16px 24px; }
.tq-loading { padding: 40px 0; text-align: center; }
.tq-loading-text { font-size: 13px; color: #B5A594; }
.tq-fail { padding: 32px 16px; text-align: center; }
.tq-fail-text { display: block; font-size: 13px; color: #A8322D; line-height: 1.8; }
.tq-retry {
  display: inline-flex; align-items: center; justify-content: center;
  margin-top: 12px; padding: 7px 16px; border-radius: 999px;
  background: #FFFDF8; border: 1px solid #E3D3BE;
}
.tq-retry-text { font-size: 13px; color: #8B4513; }
.tq-head { display: flex; align-items: center; }
.tq-day { font-size: 11px; color: #B5A594; }
.tq-refreshing { margin-left: auto; font-size: 11px; color: #B5A594; }

.tq-card {
  margin-top: 10px; padding: 12px 14px; border-radius: 12px;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.tq-row { display: flex; align-items: center; }
.tq-title { font-size: 14px; font-weight: bold; color: #3E2723; }
.tq-state { margin-left: auto; font-size: 12px; padding: 2px 10px; border-radius: 999px; }
.tq-state-not_achieved { color: #8A8A8A; background: #F1EDE7; }
.tq-state-claimable { color: #fff; background: #8B4513; }
.tq-state-claimed { color: #2F6B3A; background: #E8F2E9; }
.tq-rule { display: block; font-size: 11px; color: #9C8C7C; line-height: 1.7; margin-top: 6px; }
.tq-block { display: block; font-size: 11px; color: #B07A2A; line-height: 1.7; margin-top: 4px; }
.tq-act { display: flex; align-items: center; margin-top: 10px; }
.tq-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 6px 18px; border-radius: 999px;
  background: #F1EDE7; border: 1px solid #E0D5C8;
}
.tq-btn-on { background: #8B4513; border-color: #8B4513; }
.tq-btn-busy { opacity: 0.6; }
.tq-btn-text { font-size: 13px; color: #8B4513; }
.tq-btn-on .tq-btn-text { color: #fff; }
.tq-feedback { flex: 1; min-width: 0; margin-left: 10px; font-size: 11px; color: #2F6B3A; line-height: 1.6; }
.tq-feedback-err { color: #A8322D; }
.tq-bag { display: block; margin-top: 12px; font-size: 11px; color: #9C8C7C; }
.tq-warn { display: block; margin-top: 12px; font-size: 11px; color: #A8322D; }
</style>
