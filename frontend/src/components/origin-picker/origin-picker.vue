<template>
  <view class="origin-picker">
    <text class="op-hint">
      发源地由本树始祖及其下两代内某节点的出生地指定（不再直接选行政区划）。
    </text>

    <view v-if="loading" class="op-state">
      <text class="op-state-text">读取候选节点…</text>
    </view>

    <view v-else-if="loadError" class="op-state">
      <text class="op-err">{{ loadError }}</text>
      <view class="op-retry" @click="load"><text class="op-retry-text">重试</text></view>
    </view>

    <!-- 始祖无法认定（后端返 `founder:null` + `candidates:[]`，非错误） -->
    <view v-else-if="!founder" class="op-state">
      <text class="op-empty">本树无法认定始祖，暂不能指定发源地。</text>
    </view>

    <view v-else-if="!candidates.length" class="op-state">
      <text class="op-empty">
        始祖{{ founder.name ? `「${founder.name}」` : '' }}及其下两代暂无节点，暂不能指定发源地。
      </text>
    </view>

    <view v-else>
      <text class="op-current">当前发源地：{{ currentText }}</text>
      <text v-if="currentSourceName" class="op-current-src">
        来源节点：{{ currentSourceName }}
      </text>

      <view class="op-list">
        <view
          v-for="c in candidates"
          :key="c.handle"
          class="op-row"
          :class="{
            'op-row-on': selectedHandle === c.handle,
            'op-row-off': !c.birth_place.place_code,
            'op-row-cur': c.is_current,
          }"
          @click="pick(c)"
        >
          <view class="op-row-head">
            <text class="op-name">{{ c.name }}</text>
            <text class="op-gen">{{ genLabel(c.generation) }}</text>
            <text v-if="c.is_current" class="op-cur-tag">当前来源</text>
          </view>
          <text class="op-place" :class="{ 'op-place-off': !c.birth_place.place_code }">
            {{ placeTextOf(c) }}
          </text>
          <text v-if="!c.birth_place.place_code" class="op-off-hint">
            该节点未填写出生地行政区划代码，不可作为发源地
          </text>
        </view>
      </view>

      <view v-if="saveError" class="op-save-err">
        <text class="op-err">{{ saveError }}</text>
      </view>

      <view class="op-actions">
        <view
          class="op-btn"
          :class="{ 'op-btn-off': !selectedHandle || saving }"
          @click="confirm"
        >
          <text class="op-btn-text">{{ saving ? '指定中…' : '指定为发源地' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 家族树「发源地」候选选择器（契约 v2 C8′；docs/person-places.spec.md §6）。
 *
 * 口径：发源地**不再是自动同步的镜像**，也**不再让用户直接选行政区划** —— 用户只能在本树
 * **始祖及其下 1–2 代（共三代）**的节点里，挑一个**出生地已有行政区划代码**的节点来指定。
 *
 * - 打开即拉 `GET /tree/origin-candidates`（候选由后端算好，含无码节点）。
 * - 无码节点（`birth_place.place_code === ''`）**置灰不可选**并逐行提示；当前生效的（`is_current`）打标。
 * - 确认 → `POST /admin/set-tree-origin`；成功后重新拉候选（`current` / `is_current` 就地刷新）并
 *   `emit('updated', …)` 让宿主刷新页头展示；失败**原样展示后端逐字文案**（不改编）。
 * - 始祖无法认定（`founder:null`）给可读提示，不做任何写操作。
 * - 跨端：纯 `view` / `text`，无浏览器 DOM API（H5 + 小程序同一套码）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { fetchOriginCandidates, setTreeOrigin } from '@/business';
import type { SetTreeOriginResult, TreeOriginCandidate, TreeOriginCandidates } from '@/business/types';
import { getAuthToken } from '@/business/auth';

const props = defineProps<{ treeId: string }>();
const emit = defineEmits<{ (e: 'updated', result: SetTreeOriginResult): void }>();

const loading = ref(true);
const loadError = ref('');
/** 候选读响应（未取到 → null） */
const data = ref<TreeOriginCandidates | null>(null);
/** 用户点选的候选节点 handle（空 = 未选） */
const selectedHandle = ref('');
const saving = ref(false);
const saveError = ref('');

/** 始祖（无法认定 → null；界面据此提示不可指定） */
const founder = computed(() => data.value?.founder || null);
const candidates = computed(() => data.value?.candidates || []);
/** 当前已生效的发源地展示串（tree-meta 软冗余；未指定 → 「未指定」） */
const currentText = computed(() => data.value?.current?.origin || '未指定');
/** 当前来源节点名（`is_current` 命中者；无 → 不渲染该行） */
const currentSourceName = computed(
  () => candidates.value.find((c) => c.is_current)?.name || '',
);

/** 世代文案：1=始祖 / 2=子代 / 3=孙代（后端只给这三档） */
function genLabel(generation: number): string {
  if (generation === 1) return '始祖';
  if (generation === 2) return '子代';
  if (generation === 3) return '孙代';
  return `第 ${generation} 代`;
}

/** 候选行出生地展示串（码反查串优先；无码时退回备注 / 占位） */
function placeTextOf(c: TreeOriginCandidate): string {
  const bp = c.birth_place || { place: '', place_code: '', place_note: '' };
  return bp.place || bp.place_note || '未填写出生地';
}

async function load() {
  if (!props.treeId) {
    loadError.value = '缺少 tree_id';
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    data.value = await fetchOriginCandidates(props.treeId, getAuthToken());
  } catch (e: any) {
    data.value = null;
    loadError.value = e?.message || '读取发源地候选失败';
  } finally {
    loading.value = false;
  }
}

/** 点选候选：无码节点置灰不可选（判据 = `place_code` 非空，与后端 400 判定同口径） */
function pick(c: TreeOriginCandidate) {
  if (!c?.birth_place?.place_code || saving.value) return;
  selectedHandle.value = c.handle;
  saveError.value = '';
}

/** 指定发源地：成功后重新拉候选（就地刷新回显）并把结果交给宿主刷新页头 */
async function confirm() {
  if (!selectedHandle.value || saving.value) return;
  const token = getAuthToken();
  if (!token) {
    saveError.value = '未登录或登录已过期';
    return;
  }
  saving.value = true;
  saveError.value = '';
  try {
    const result = await setTreeOrigin(token, {
      tree_id: props.treeId,
      person_handle: selectedHandle.value,
    });
    uni.showToast({ title: '已指定发源地', icon: 'success' });
    emit('updated', result);
    selectedHandle.value = '';
    await load();
  } catch (e: any) {
    // 后端逐字文案（404 树不存在 / 400 不在三代内 · 未填码 · 无法认定始祖 / 401 / 403）
    saveError.value = e?.message || '指定发源地失败';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
watch(() => props.treeId, (v) => { if (v) load(); });
</script>

<style scoped>
.origin-picker { width: 100%; }
.op-hint { font-size: 11px; color: #A1887F; line-height: 1.6; display: block; margin-bottom: 8px; }

.op-state { padding: 10px 0; text-align: center; }
.op-state-text { font-size: 12px; color: #A1887F; }
.op-empty { font-size: 12px; color: #8B4513; line-height: 1.7; display: block; }
.op-err { font-size: 12px; color: #C62828; display: block; line-height: 1.6; }
.op-retry {
  display: inline-block; margin-top: 8px; padding: 4px 14px;
  border: 1px solid #D7B27A; border-radius: 12px;
}
.op-retry-text { font-size: 12px; color: #8B4513; }

.op-current { font-size: 12px; color: #3E2723; display: block; }
.op-current-src { font-size: 11px; color: #A1887F; display: block; margin-top: 2px; }

.op-list {
  margin-top: 8px; border: 1px solid #E0D5C8; border-radius: 8px;
  background: #FBF8F4; max-height: 260px; overflow-y: auto;
}
.op-row { padding: 8px 10px; border-bottom: 1px solid #F0E7DA; }
.op-row:last-child { border-bottom: none; }
.op-row-on { background: #FFF3E0; }
.op-row-off { opacity: 0.55; }
.op-row-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.op-name { font-size: 14px; color: #3E2723; font-weight: bold; }
.op-gen {
  font-size: 11px; color: #8B4513; padding: 1px 6px;
  border: 1px solid #E8C9A0; border-radius: 8px; background: #FFFDF8;
}
.op-cur-tag {
  font-size: 11px; color: #fff; padding: 1px 6px;
  border-radius: 8px; background: #8B4513;
}
.op-place { font-size: 12px; color: #5D4037; display: block; margin-top: 3px; }
.op-place-off { color: #9E9E9E; }
.op-off-hint { font-size: 11px; color: #C62828; display: block; margin-top: 2px; line-height: 1.5; }

.op-save-err { margin-top: 8px; }
.op-actions { margin-top: 10px; }
.op-btn {
  height: 38px; border-radius: 8px; background: #8B4513;
  display: flex; align-items: center; justify-content: center;
}
.op-btn-off { background: #C7B299; }
.op-btn-text { font-size: 13px; color: #fff; }
</style>
