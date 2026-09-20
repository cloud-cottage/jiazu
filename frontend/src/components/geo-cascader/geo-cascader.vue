<template>
  <view class="geo-cascader">
    <!-- 折叠态：单行触发条（不随候选数量变化，宿主弹窗不会被撑开） -->
    <view class="gc-trigger" @click="openPanel">
      <text class="gc-trigger-text" :class="{ 'gc-trigger-empty': !valueText }">
        {{ valueText || placeholder }}
      </text>
      <text class="gc-trigger-arrow">▾</text>
    </view>

    <!-- 展开态：独立覆盖层（z-index 1200 > 既有 .modal-mask 的 999/960）；点遮罩 = 取消（不改动已选值） -->
    <view v-if="panelOpen" class="gc-mask" @click="panelOpen = false">
      <view class="gc-panel" @click.stop>
        <view class="gc-head">
          <text class="gc-head-title">发源地（省 / 市 / 县）</text>
          <text class="gc-head-close" @click="panelOpen = false">✕</text>
        </view>

        <!-- 三级联动列：海外无下级 → 只渲染一列并给终止说明 -->
        <view class="gc-cols">
          <scroll-view class="gc-col" scroll-y>
            <view
              v-for="p in provinces"
              :key="p.code"
              class="gc-item"
              :class="{ 'gc-item-on': draftProvince === p.code }"
              @click="pickProvince(p)"
            >
              <text class="gc-item-text">{{ p.name }}</text>
            </view>
          </scroll-view>

          <scroll-view v-if="draftProvince && !isOverseas" class="gc-col" scroll-y>
            <view
              v-for="c in cities"
              :key="c.code"
              class="gc-item"
              :class="{ 'gc-item-on': draftCity === c.code }"
              @click="pickCity(c)"
            >
              <text class="gc-item-text">{{ c.name }}</text>
            </view>
          </scroll-view>

          <scroll-view v-if="draftCity && !cityTerminal" class="gc-col" scroll-y>
            <view
              v-for="a in counties"
              :key="a.code"
              class="gc-item"
              :class="{ 'gc-item-on': draftCounty === a.code }"
              @click="pickCounty(a)"
            >
              <text class="gc-item-text">{{ a.name }}</text>
            </view>
          </scroll-view>
        </view>

        <text v-if="isOverseas" class="gc-hint">「海外」无下级，确定后即保存为「海外」</text>
        <text v-else-if="!draftProvince" class="gc-hint">逐级选择；可只选到省或市（缺级合法）</text>
        <text v-else-if="!draftCity" class="gc-hint">可「确定到当前层级」只保存到省，或继续选地级</text>
        <text v-else-if="cityTerminal" class="gc-hint">该市无县级行政区划（直筒子市）⇒ 止于本级，确定后保存到市</text>
        <text v-else-if="!draftCounty" class="gc-hint">可「确定到当前层级」保存到地级，或继续选县级</text>

        <text class="gc-preview">
          保存结果：{{ draftDisplay || '（未选择）' }}<text v-if="legacyHint">{{ legacyHint }}</text>
        </text>

        <view class="gc-actions">
          <view class="gc-btn gc-btn-ghost" @click="clearAll">
            <text class="gc-btn-text">清空</text>
          </view>
          <view class="gc-btn gc-btn-main" :class="{ 'gc-btn-off': !canConfirm }" @click="confirm">
            <text class="gc-btn-text gc-btn-text-main">确定到当前层级</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 发源地三级联动选择器（uni-app 跨端：H5 + 小程序，无浏览器 DOM API）
 *
 * - `v-model` 绑定**结构化真源 `origin_code`**（6 位码字符串）；组件内部反查各级名称回显，
 *   并可由一级 / 二级 / 三级码直接定位（码即层级，取最深一级即当前码）。
 * - 缺级合法：只选到省（如 370000）或市（如 371300）后点「确定到当前层级」即可。
 * - 「海外」（999999）作为一级项时直接终止，无下级。
 * - **「直筒子市」止于第二级**：东莞市 / 中山市 / 儋州市 / 嘉峪关市 法定无县级行政区（上游街道 / 镇级项
 *   已被按 `^\d{6}$` 口径整批剔除）⇒ 县级列表为空时**不渲染第三列**、给出终止说明，且「确定到当前层级」
 *   照常可用（选到市即终点）——判据来自数据（`isTerminalCity`），不写死地名。
 * - `origin_code` 缺失（`undefined` / `null`，如 `tree-meta` 里未登记码的老树）不报错：
 *   一律归一到空串 ⇒ 回显 `legacy` 历史文本、面板可正常展开选择、只提交码。
 * - 支持清空；空码 / 未知码 / 未选择时展示 `legacy`（历史自由文本）兜底，不改动旧数据。
 * - 展示串仅在面板内做**即时预览**，前端不拼展示串落库（真源在后端写路径）。
 */
import { computed, ref } from 'vue';
import {
  OVERSEAS_CODE,
  provincesOf,
  citiesOf,
  countiesOf,
  isTerminalCity,
  resolveNames,
  pathOfCode,
  type GeoCity,
  type GeoCounty,
  type GeoProvince,
} from '@/business/geo';

const props = withDefaults(
  defineProps<{
    /** 结构化发源地码（6 位行政区划代码；空串 = 未设置；`undefined` / `null` 一律按未设置处理） */
    modelValue?: string;
    /** 未选择时的占位文案 */
    placeholder?: string;
    /** 历史自由文本发源地（legacy 旧数据的 `origin`）：仅在无码时作为兜底展示 */
    legacy?: string;
  }>(),
  { modelValue: '', placeholder: '选填，逐级选择省 / 市 / 县', legacy: '' },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const panelOpen = ref(false);
const draftProvince = ref('');
const draftCity = ref('');
const draftCounty = ref('');

/** 已存码归一（真源 `origin_code` 可能缺失：`tree-meta` 老树为 `undefined`，不得透传进反查 / 提交） */
const selectedCode = computed(() => props.modelValue || '');

const provinces = computed(() => provincesOf());
const cities = computed(() => citiesOf(draftProvince.value));
const counties = computed(() => countiesOf(draftProvince.value, draftCity.value));
const isOverseas = computed(() => draftProvince.value === OVERSEAS_CODE);
/** 县级列表为空的地级（直筒子市）⇒ 止于第二级：不渲染第三列，但「确定到当前层级」照常可用 */
const cityTerminal = computed(() => isTerminalCity(draftProvince.value, draftCity.value));

/** 当前已存码的展示串（空码 → 历史文本兜底） */
const valueText = computed(() => resolveNames(selectedCode.value).display || props.legacy || '');
/** 面板内草稿码（取最深一级，码本身即层级） */
const draftCode = computed(() => draftCounty.value || draftCity.value || draftProvince.value);
const draftDisplay = computed(() => resolveNames(draftCode.value).display);
const canConfirm = computed(() => !!draftCode.value);
/** 历史文本提示：仅在无码且确有旧文本时出现 */
const legacyHint = computed(() =>
  !selectedCode.value && props.legacy ? `（历史文本：${props.legacy}）` : '',
);

/** 展开面板：按已存码反查各级选中项（无码 → 空选择） */
function openPanel() {
  const path = pathOfCode(selectedCode.value);
  draftProvince.value = path.province?.code || '';
  draftCity.value = path.city?.code || '';
  draftCounty.value = path.county?.code || '';
  panelOpen.value = true;
}

function pickProvince(p: GeoProvince) {
  if (draftProvince.value !== p.code) {
    draftProvince.value = p.code;
    draftCity.value = '';
    draftCounty.value = '';
  }
}

function pickCity(c: GeoCity) {
  if (draftCity.value !== c.code) {
    draftCity.value = c.code;
    draftCounty.value = '';
  }
}

function pickCounty(a: GeoCounty) {
  draftCounty.value = a.code;
}

/** 确定到当前层级：只提交码，展示串由后端写路径生成 */
function confirm() {
  if (!canConfirm.value) return;
  emit('update:modelValue', draftCode.value);
  panelOpen.value = false;
}

/** 清空（结构码置空；历史文本由宿主按自身策略处理） */
function clearAll() {
  draftProvince.value = '';
  draftCity.value = '';
  draftCounty.value = '';
  emit('update:modelValue', '');
  panelOpen.value = false;
}
</script>

<style scoped>
.geo-cascader { width: 100%; }

/* 折叠态触发条（与既有 .input 同高同风格） */
.gc-trigger {
  height: 42px; border: 1px solid #E0D5C8; border-radius: 8px;
  padding: 0 12px; background: #FBF8F4; width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  box-sizing: border-box;
}
.gc-trigger-text { font-size: 14px; color: #3E2723; flex: 1; }
.gc-trigger-empty { color: #B5A594; }
.gc-trigger-arrow { font-size: 16px; color: #B5A594; margin-left: 6px; }

/* 覆盖层：z-index 1200 > 既有 .modal-mask 的 999（首页建树弹窗为 960） */
.gc-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.55); z-index: 1200;
  display: flex; align-items: center; justify-content: center;
}
.gc-panel {
  width: 92%; max-width: 420px; background: #fff; border-radius: 14px;
  padding: 18px 16px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  box-sizing: border-box;
}
.gc-head {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.gc-head-title { font-size: 16px; font-weight: bold; color: #3E2723; }
.gc-head-close { font-size: 16px; color: #B5A594; padding: 0 4px; }

/* 三级列：等宽三列 + 各自内部滚动（scroll-view，H5 与小程序一致） */
.gc-cols { display: flex; gap: 6px; }
.gc-col {
  flex: 1; height: 230px; border: 1px solid #F0E8DE; border-radius: 8px;
  background: #FFFDF8; box-sizing: border-box;
}
.gc-item { padding: 9px 8px; border-bottom: 1px solid #F7F1E8; }
.gc-item-on { background: #FFF3E0; }
.gc-item-text { font-size: 13px; color: #5D4037; }
.gc-item-on .gc-item-text { color: #8B4513; font-weight: bold; }

.gc-hint { font-size: 12px; color: #A1887F; margin-top: 10px; display: block; }
.gc-preview { font-size: 12px; color: #8B4513; margin-top: 6px; display: block; }

.gc-actions { display: flex; gap: 10px; margin-top: 14px; }
.gc-btn {
  flex: 1; height: 40px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.gc-btn-ghost { background: #FBF8F4; border: 1px solid #E0D5C8; }
.gc-btn-main { background: #8B4513; }
.gc-btn-off { opacity: 0.5; }
.gc-btn-text { font-size: 14px; color: #8B4513; }
.gc-btn-text-main { color: #fff; }
</style>
