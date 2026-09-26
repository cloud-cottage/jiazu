<template>
  <view class="som-mask" @click="requestClose">
    <view class="som-panel" @click.stop>
      <view class="som-head">
        <text class="som-title">调整排行</text>
        <text class="som-close" @click="requestClose">✕</text>
      </view>

      <!-- 分段：一个节点可有多个配偶家族（每段独立排行；一次提交只动当前这一段） -->
      <text class="som-sub">
        {{ personName }} 的子女排行：长按姓名后上下拖曳，或用 ▲▼ 微调位次。
      </text>
      <view v-if="segments.length > 1" class="som-seg-tabs">
        <view
          v-for="(s, i) in segments"
          :key="s.family_handle"
          class="som-seg-tab"
          :class="{ active: i === activeIndex }"
          @click="switchSegment(i)"
        >
          <text class="som-seg-text">{{ segmentLabel(s, i) }}</text>
        </view>
      </view>
      <text v-if="segments.length > 1" class="som-hint">
        一次提交只保存当前这一段（{{ activeSpouseLabel }}）；切换分段不会保存另一段的改动。
      </text>

      <view class="som-list" @touchmove="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchEnd">
        <view
          v-for="(kid, i) in rows"
          :key="kid.handle"
          class="som-row"
          :class="{ 'som-row-dragging': dragFrom === i && dragging }"
          :style="rowStyle(i)"
          @touchstart="onTouchStart($event)"
          @longpress="onLongPress(i, $event)"
        >
          <text class="som-seq">{{ i + 1 }}</text>
          <text class="som-name">{{ kid.name }}</text>
          <view class="som-arrows">
            <text
              class="som-arrow"
              :class="{ 'som-arrow-off': locked || i === 0 }"
              @click.stop="nudge(i, -1)"
            >▲</text>
            <text
              class="som-arrow"
              :class="{ 'som-arrow-off': locked || i === rows.length - 1 }"
              @click.stop="nudge(i, 1)"
            >▼</text>
          </view>
        </view>
        <text v-if="!rows.length" class="som-empty">本段暂无子女</text>
      </view>

      <!-- 只读节点（后端 403）优先：文案原样取自后端，不禁用自拼口径 -->
      <text v-if="lockedMsg" class="som-error">{{ lockedMsg }}</text>
      <text v-else-if="submitError" class="som-error">{{ submitError }}</text>
      <view v-else class="som-note">
        <text class="som-note-text">本次调整消耗 1 片竹片（未改动不扣费）；确定后请再确认一次。</text>
      </view>

      <view class="som-actions">
        <t-button variant="outline" block @click="requestClose">取消</t-button>
        <t-button
          theme="primary"
          block
          :loading="submitting"
          :disabled="locked || submitting"
          @click="askConfirm"
        >确定</t-button>
      </view>
    </view>

    <!--
      计费二次确认层（**自绘**，不用 `uni.showModal`）。
      成因：`uni.showModal` 的 `.uni-modal` z-index = 999，而本组件遮罩 `.som-mask` = 1000
      → 确认框被完全盖住、`elementFromPoint` 落到底层面板、真实指针点不到「确定调整」。
      自绘层与 `.som-panel` 同处 `.som-mask` 的层叠上下文内，只按组件内层级比较，跨端行为可控。
    -->
    <view v-if="confirmOpen" class="som-confirm-mask" @click.stop="cancelConfirm">
      <view class="som-confirm">
        <text class="som-confirm-title">调整排行</text>
        <text class="som-confirm-body">调整 {{ movedChildName }} 的排行，消耗 1 片竹片。</text>
        <text class="som-confirm-body">{{ activeSpouseLabel }}的子女排行将按调整后的顺序保存。</text>
        <view class="som-confirm-actions">
          <view class="som-confirm-btn" @click.stop="cancelConfirm">取消</view>
          <view class="som-confirm-btn som-confirm-ok" @click.stop="confirmSubmit">确定调整</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 调整排行（子女标签拖曳排序）次级模态框。
 *
 * 口径（Zang 裁定 v1）：
 * - **按 family 分段**：一个节点可有多个 `spouse_families`，每段独立排序，**一次提交只动一段**的 `child_handles`；
 * - **双通道**：长按拖曳（uni-app touch 事件自算位移与目标位次，**不使用 HTML5 drag&drop**——微信小程序无此 API）
 *   + ▲▼ 逐位微调（跨端兜底）；两通道修改**同一份本地顺序 state**；
 * - 提交：确定 → **计费二次确认（明示「本次调整消耗 1 片竹片」+ 被移动子女姓名）** →
 *   `POST /admin/sibling-reorder` → 成功后关闭并回 `done`（宿主刷新档案子区）；
 * - 契约 `person_handle` = **本次被移动的那个子女**（不是档案本人）：由 `movedHandle` 统一裁定
 *   （明细见该 computed 的注释）；后端 `lib/tree-write.js:489` 硬校验、`docs/sibling-order.spec.md` §3-4；
 * - 二次确认层**自绘**（不用 `uni.showModal`）：`uni-modal` 的 z-index = 999 低于本组件遮罩
 *   `.som-mask` 的 1000，原实现用户既看不到也点不到确认按钮；
 * - 409 余额不足：原样展示后端文案并**保留本地顺序可重试**（不自动重试、不静默吞错）；
 * - 后端 403（只读节点）：原样展示后端文案并禁用入口（不自拼口径）。
 */
import { computed, getCurrentInstance, onMounted, ref } from 'vue';
import {
  siblingReorder,
  ApiStatusError,
  feeText,
  isAssetInsufficientError,
  showAssetInsufficientGuide,
} from '@/business';
import { getAuthToken } from '@/business/auth';
import type { SiblingReorderSegment } from '@/business/types';

const props = withDefaults(defineProps<{
  treeId: string;
  /** 档案本人姓名（副标题展示用；**不参与提交**——提交的 `person_handle` 是被移动的子女） */
  personName?: string;
  /** 分段：一个配偶家族 = 一段（`children` 顺序即服务端当前排行） */
  segments: SiblingReorderSegment[];
  /** 打开时定位到的分段（family_handle；不匹配 / 空串 → 第一段） */
  initialFamilyHandle?: string;
}>(), {
  personName: '',
  initialFamilyHandle: '',
});

const emit = defineEmits<{
  /** 关闭模态框（取消 / 右上角 ✕ / 遮罩） */
  (e: 'close'): void;
  /** 排序已落库（宿主据此刷新档案子区） */
  (e: 'done'): void;
}>();

/** 行高兜底（px）：`createSelectorQuery` 测量失败时按此换算拖曳位次 */
const ROW_H = 44;
/** 长按后位移阈值（px）：未超过不换位（防长按后手抖误改位次） */
const DRAG_THRESHOLD = 12;

/** 各段本地顺序 state（键 = family_handle；拖曳与 ▲▼ 改的都是这一份） */
const orderMap = ref<Record<string, string[]>>({});
/** 各段载入时基线（判「未改动」与提交前比对，不参与展示） */
const baseMap = ref<Record<string, string[]>>({});
/**
 * 各段**最近一次被移动**的子女 handle（键 = family_handle）。
 * 唯一写入点 = `applyMove`（拖曳落位与 ▲▼ 微调的共同入口）⇒ 与顺序 state 永远同步。
 */
const movedMap = ref<Record<string, string>>({});
const activeIndex = ref(0);

const activeSegment = computed<SiblingReorderSegment | null>(() => props.segments[activeIndex.value] || null);
const activeFamilyHandle = computed(() => activeSegment.value?.family_handle || '');

/** 全部分段的子女索引（handle → { handle, name }） */
const kidMap = computed<Record<string, { handle: string; name: string }>>(() => {
  const m: Record<string, { handle: string; name: string }> = {};
  for (const s of props.segments) {
    for (const c of s.children) m[c.handle] = { handle: c.handle, name: c.name };
  }
  return m;
});

/** 当前段的展示行：数组位次即排行（序号 = 下标 + 1） */
const rows = computed(() => (orderMap.value[activeFamilyHandle.value] || [])
  .map((h) => kidMap.value[h] || { handle: h, name: h }));

/** 当前段是否已改动（与基线逐位比对） */
const dirty = computed(() => {
  const k = activeFamilyHandle.value;
  if (!k) return false;
  const cur = orderMap.value[k] || [];
  const base = baseMap.value[k] || [];
  return cur.length !== base.length || cur.some((h, i) => h !== base[i]);
});

const locked = ref(false);
const lockedMsg = ref('');
const submitError = ref('');
const submitting = ref(false);
/** 自绘二次确认层开关（原 `uni.showModal` 被 `.som-mask` 压住，见模板注释） */
const confirmOpen = ref(false);

/**
 * 本次提交的契约 `person_handle` = **被移动的那个子女**（不是档案本人）。
 *
 * 契约（`lib/tree-write.js:489` 硬校验；`docs/sibling-order.spec.md` §3-4 / §4）：
 * `person_handle` 必须是该 family 现有子女列表内的节点；后端按它算 `Tx.ref.person_handle`、
 * `Tx.desc`（`调整排行：<姓名> 第 N 位`）与 `position` / `previous_position`。
 *
 * 选取规则（Zang 裁定 v1 · 整改轮）：
 * ① 优先取本段**最近一次被移动**的 handle（`movedMap`，由唯一数组改写入口 `applyMove` 记录
 *    ⇒ 拖曳落位与 ▲▼ 两条通道等价；一次会话移动多个 = 取**最后移动者**）；
 * ② 极端情况（本段无移动记录、或记录已不在本段列表）→ **保持原位重算**：按基线序逐位比对，
 *    取**第一个位次发生变化**的 handle（基线里第 i 位的节点在现序中已不在第 i 位 ⇒ 它就是被移位者）。
 */
const movedHandle = computed(() => {
  const k = activeFamilyHandle.value;
  if (!k) return '';
  const cur = orderMap.value[k] || [];
  const rec = movedMap.value[k] || '';
  if (rec && cur.indexOf(rec) > -1) return rec;
  const base = baseMap.value[k] || [];
  for (let i = 0; i < base.length; i += 1) {
    const j = cur.indexOf(base[i]);
    if (j !== -1 && j !== i) return base[i];
  }
  return '';
});

/** 被移动子女的姓名（二次确认文案用；取不到 → 空串） */
const movedChildName = computed(() => {
  const h = movedHandle.value;
  return h ? (kidMap.value[h]?.name || '') : '';
});

const rowHeight = ref(ROW_H);
const dragFrom = ref(-1);
const dragDy = ref(0);
const dragStartY = ref(0);
const dragging = computed(() => dragFrom.value >= 0);

/** 拖曳中的目标位次（位移 ÷ 行高取整；未过阈值 = 原位次） */
const targetIndex = computed(() => {
  const from = dragFrom.value;
  if (from < 0) return from;
  const d = dragDy.value;
  if (Math.abs(d) < DRAG_THRESHOLD) return from;
  const steps = Math.trunc(d / rowHeight.value);
  const to = from + steps;
  return Math.min(Math.max(to, 0), Math.max(rows.value.length - 1, 0));
});

const activeSpouseLabel = computed(() => {
  const s = activeSegment.value;
  if (!s) return '本段';
  return s.spouse_name ? `配偶：${s.spouse_name}` : '本段';
});

function segmentLabel(s: SiblingReorderSegment, i: number): string {
  return s.spouse_name ? `配偶：${s.spouse_name}` : `第 ${i + 1} 段`;
}

/** 用 props 的当前顺序重置本地 state（宿主按 :key 重挂载，无需 watch props） */
function resetOrders(): void {
  const order: Record<string, string[]> = {};
  for (const s of props.segments) order[s.family_handle] = s.children.map((c) => c.handle);
  orderMap.value = order;
  baseMap.value = JSON.parse(JSON.stringify(order));
  movedMap.value = {};
  // 入口来自哪一段就从哪一段开始（找不到 / 空串 → 第一段）
  const idx = props.segments.findIndex((s) => s.family_handle === props.initialFamilyHandle);
  activeIndex.value = idx > -1 ? idx : 0;
}

const inst = getCurrentInstance();
/** 量首行高度 → 拖曳位次换算真源；测量失败沿用 ROW_H 常量（纯计算兜底） */
function measureRowHeight(): void {
  try {
    const q = inst ? uni.createSelectorQuery().in(inst) : uni.createSelectorQuery();
    q.select('.som-row').boundingClientRect((rect: any) => {
      const h = Array.isArray(rect) ? rect[0]?.height : rect?.height;
      if (h && h > 0) rowHeight.value = Math.round(h);
    }).exec();
  } catch {
    rowHeight.value = ROW_H;
  }
}

function switchSegment(i: number): void {
  if (i === activeIndex.value) return;
  dragFrom.value = -1;
  dragDy.value = 0;
  activeIndex.value = i;
}

function touchY(e: any): number {
  const t = e?.touches?.[0] || e?.changedTouches?.[0];
  return Number(t?.clientY ?? 0);
}

function onTouchStart(e: any): void {
  if (locked.value) return;
  dragStartY.value = touchY(e);
  dragFrom.value = -1; // 仅记录起点：长按才真正进入拖曳
  dragDy.value = 0;
}

function onLongPress(i: number, e: any): void {
  if (locked.value || submitting.value) return;
  dragFrom.value = i;
  dragDy.value = 0;
  dragStartY.value = touchY(e) || dragStartY.value;
}

function onTouchMove(e: any): void {
  if (dragFrom.value < 0) return;
  const y = touchY(e);
  if (!y) return;
  dragDy.value = y - dragStartY.value;
  // 拖曳期间拦掉页面滚动（H5 原生事件调用；小程序侧 preventDefault 为空实现，靠 ▲▼ 兜底）
  if (typeof e?.preventDefault === 'function') e.preventDefault();
}

function onTouchEnd(): void {
  if (dragFrom.value < 0) return;
  const from = dragFrom.value;
  const to = targetIndex.value;
  dragFrom.value = -1;
  dragDy.value = 0;
  applyMove(from, to);
}

/** 位移预览：被拖行跟手，区间内其余行让位（数组本身松手才改） */
function rowStyle(i: number): string {
  if (!dragging.value) return '';
  const from = dragFrom.value;
  const to = targetIndex.value;
  const h = rowHeight.value;
  if (i === from) return `transform: translateY(${dragDy.value}px); z-index: 3; position: relative;`;
  if (from < to && i > from && i <= to) return `transform: translateY(${-h}px);`;
  if (from > to && i < from && i >= to) return `transform: translateY(${h}px);`;
  return '';
}

/** 唯一的数组改写入口（拖曳落位与 ▲▼ 逐位微调共用，改的都是本地顺序 state） */
function applyMove(from: number, to: number): void {
  const k = activeFamilyHandle.value;
  if (!k) return;
  const cur = (orderMap.value[k] || []).slice();
  if (from < 0 || to < 0 || from >= cur.length || to >= cur.length || from === to) return;
  const [moved] = cur.splice(from, 1);
  cur.splice(to, 0, moved);
  orderMap.value = { ...orderMap.value, [k]: cur };
  // 记下「本次被移动的子女」：提交时它就是契约 person_handle（取最后移动者）
  movedMap.value = { ...movedMap.value, [k]: moved };
}

function nudge(i: number, dir: number): void {
  if (locked.value || submitting.value || dragging.value) return;
  dragFrom.value = -1;
  applyMove(i, i + dir);
}

function requestClose(): void {
  if (submitting.value) return;
  emit('close');
}

/** 计费二次确认：明示单价 + 被移动子女姓名后再发请求（no-op 由后端裁定，不在前端复制口径） */
function askConfirm(): void {
  if (locked.value || submitting.value) return;
  if (!dirty.value) {
    uni.showToast({ title: '排行未改动，无需保存', icon: 'none' });
    return;
  }
  submitError.value = '';
  confirmOpen.value = true;
}

function cancelConfirm(): void {
  if (submitting.value) return;
  confirmOpen.value = false;
}

function confirmSubmit(): void {
  if (submitting.value) return;
  confirmOpen.value = false;
  doSubmit();
}

async function doSubmit(): Promise<void> {
  const k = activeFamilyHandle.value;
  if (!k || submitting.value) return;
  const moved = movedHandle.value;
  if (!moved) {
    // 只可能在本段无任何位次变化时命中（正常路径下「确定」已被未改动短路拦住）
    submitError.value = '无法确定被移动的子女，请重新调整位次后再试';
    return;
  }
  const token = getAuthToken();
  if (!token) {
    submitError.value = '登录已过期，请重新登录';
    return;
  }
  submitting.value = true;
  submitError.value = '';
  try {
    const res = await siblingReorder(props.treeId, {
      family_handle: k,
      // 契约 = 被移动的那个子女（绝非档案本人）；仍须在该 family 的子女列表内
      person_handle: moved,
      child_handles: (orderMap.value[k] || []).slice(),
    }, token);
    // 后端裁定 no-op（拖回原位等）：0 片、未写库
    uni.showToast({
      title: res.noop ? '排行未变化，未消耗竹片' : (feeText(res.fee) || '排行已保存'),
      icon: 'none',
      duration: 3000,
    });
    baseMap.value = { ...baseMap.value, [k]: (res.child_handles || orderMap.value[k] || []).slice() };
    emit('done');
    emit('close');
  } catch (e: any) {
    if (e instanceof ApiStatusError && e.status === 403) {
      // 只读节点：原样展示后端文案并禁用入口，本地顺序保留（不改口径、不重试）
      locked.value = true;
      lockedMsg.value = e.message || '该节点为只读节点，无法调整排行';
      return;
    }
    // 409 资产不足：toast 直出后端文案（「资产不足，需 1 片竹片，当前 Y 片」）+ 来源引导；
    // 本地顺序原样保留 → 用户可充值后再点「确定」重试（不自动重试、不静默吞错）
    submitError.value = e?.message || '保存失败，请重试';
    if (isAssetInsufficientError(e)) showAssetInsufficientGuide(e);
    else uni.showToast({ title: submitError.value, icon: 'none', duration: 3000 });
  } finally {
    submitting.value = false;
  }
}

resetOrders();
onMounted(measureRowHeight);
</script>

<style scoped>
/* 覆盖层 z-index 高于既有 .modal-mask（999）：本框由档案视图直接打开 */
.som-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  overflow-y: auto; padding: 5vh 0; box-sizing: border-box;
}
.som-panel {
  width: 88%; max-width: 420px; max-height: 85vh;
  background: #fff; border-radius: 14px; padding: 18px;
  display: flex; flex-direction: column;
  overflow-y: auto; margin: auto;
}
.som-head { display: flex; align-items: center; justify-content: space-between; }
.som-title { font-size: 17px; font-weight: 600; color: #5D4037; }
.som-close { font-size: 16px; color: #999; padding: 0 4px; }
.som-sub { font-size: 12px; color: #999; line-height: 1.6; margin-top: 6px; }
.som-hint { font-size: 12px; color: #B08D57; line-height: 1.6; margin-top: 8px; }
.som-seg-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.som-seg-tab {
  padding: 4px 10px; border: 1px solid #E0D6CB; border-radius: 12px;
  background: #FBF8F5;
}
.som-seg-tab.active { border-color: #8B4513; background: #FFF3E6; }
.som-seg-text { font-size: 12px; color: #5D4037; }
.som-list { margin-top: 12px; }
.som-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 8px; border-bottom: 1px solid #F5F0EA;
  background: #fff; transition: transform 0.12s ease;
}
.som-row:last-child { border-bottom: none; }
.som-row-dragging {
  transition: none; background: #FFF3E6;
  box-shadow: 0 2px 8px rgba(93,64,55,0.18); border-radius: 8px;
}
.som-seq {
  width: 22px; height: 22px; line-height: 22px; text-align: center;
  font-size: 12px; color: #fff; background: #B08D57; border-radius: 11px;
  flex-shrink: 0;
}
.som-name { flex: 1; font-size: 15px; color: #5D4037; }
.som-arrows { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.som-arrow { font-size: 15px; color: #8B4513; padding: 2px 6px; }
.som-arrow-off { color: #DDD; }
.som-empty { display: block; font-size: 13px; color: #999; padding: 16px 0; text-align: center; }
.som-error { display: block; font-size: 12px; color: #C62828; line-height: 1.6; margin-top: 10px; }
.som-note { margin-top: 10px; }
.som-note-text { font-size: 12px; color: #999; line-height: 1.6; }
.som-actions { display: flex; gap: 10px; margin-top: 14px; }

/*
  自绘二次确认层：与 `.som-panel` 同为 `.som-mask` 的子节点（`.som-mask` 有 z-index ⇒ 层叠上下文），
  故只需高于同层内的面板即可；`.som-mask` 自身仍是 1000，层级关系不变（实测 elementFromPoint 命中 `.som-confirm-ok`）。
*/
.som-confirm-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.45); z-index: 1010;
  display: flex; align-items: center; justify-content: center;
}
.som-confirm {
  width: 80%; max-width: 340px; background: #fff; border-radius: 14px; padding: 18px;
  display: flex; flex-direction: column;
}
.som-confirm-title { display: block; font-size: 16px; font-weight: 600; color: #5D4037; }
.som-confirm-body { display: block; font-size: 13px; color: #5D4037; line-height: 1.6; margin-top: 8px; }
.som-confirm-actions { display: flex; gap: 10px; margin-top: 16px; }
.som-confirm-btn {
  flex: 1; text-align: center; padding: 8px 0; border-radius: 8px;
  font-size: 14px; color: #5D4037; background: #FBF8F5; border: 1px solid #E0D6CB;
}
.som-confirm-ok { color: #fff; background: #8B4513; border-color: #8B4513; }
</style>
