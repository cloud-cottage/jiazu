<template>
  <view class="tree-picker">
    <!-- 折叠态：恒为单行触发条（高 44px，不随候选数量变化）→ 宿主弹窗不会被候选列表撑开 -->
    <view class="tp-trigger" @click="openPicker">
      <text class="tp-trigger-text" :class="{ 'tp-trigger-empty': !selectedItem }">{{ triggerText }}</text>
      <text class="tp-trigger-arrow">▾</text>
    </view>

    <!-- 展开态：独立覆盖层（z-index 高于既有 .modal-mask 的 999）；点遮罩 = 取消（不改动已选值） -->
    <view v-if="panelOpen" class="tp-mask" @click="cancelPicker">
      <view class="tp-panel" @click.stop>
        <view class="tp-head">
          <text class="tp-head-title">{{ title }}</text>
          <text class="tp-head-close" @click="cancelPicker">✕</text>
        </view>

        <t-input
          :value="query"
          placeholder="搜索家族树（名称 / 姓氏 / tree_id）"
          class="tp-search"
          @update:value="(v: any) => query = v"
        />

        <!-- 列表区高度上限 36vh + 内部滚动；分组小标题由 group 推导（无 group 归「家族树」），仅 2+ 分组时渲染 -->
        <view class="tp-list">
          <view v-for="g in groupedItems" :key="g.name" class="tp-group">
            <text v-if="groupedItems.length > 1" class="tp-group-title">{{ g.name }}</text>
            <view
              v-for="it in g.items"
              :key="it.tree_id"
              class="tp-item"
              :class="{ selected: draftId === it.tree_id }"
              @click="draftId = it.tree_id"
            >
              <view class="tp-item-main">
                <text class="tp-item-label">{{ it.label }}</text>
                <text v-if="it.sub" class="tp-item-sub">{{ it.sub }}</text>
              </view>
              <text class="tp-item-id">{{ it.tree_id }}</text>
            </view>
          </view>
          <text v-if="!groupedItems.length" class="tp-empty">未找到匹配的家族树</text>
        </view>

        <view class="tp-actions">
          <t-button variant="outline" block @click="cancelPicker">取消</t-button>
          <t-button theme="primary" block @click="confirmPicker">确定</t-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * 共享家族树 / 祖谱选择器（嫁出娶入弹窗、认祖选择器、挂载祖谱选择器共用）。
 * 折叠态只有一行（不随候选数量增长），展开态是独立覆盖层：搜索 + 限高分组列表 + 取消/确定。
 * 图标一律用文本字符（▾ / ✕），不手写 SVG 路径（仓库约定：图标走 @/business/icons 的 ICON 常量）。
 */
interface TreePickerItem {
  tree_id: string;
  label: string;
  /** 副文案（如「自有 N 人 · 已认祖世本」），渲染在 label 下方单行小字，同时参与搜索匹配 */
  sub?: string;
  /** 分组名（缺省归「家族树」；空组不渲染——分组由 items 现推，天然不产生空组） */
  group?: string;
}

const props = withDefaults(defineProps<{
  items: TreePickerItem[];
  /** 当前选中的 tree_id（空串 = 未选） */
  modelValue: string;
  placeholder?: string;
  title?: string;
}>(), {
  placeholder: '请选择目标家族树',
  title: '选择家族树',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'select', item: TreePickerItem): void;
}>();

const panelOpen = ref(false);
const query = ref('');
/** 覆盖层内的草稿选择：取消 / 点遮罩一律丢弃，不动已选值 */
const draftId = ref('');

const selectedItem = computed<TreePickerItem | undefined>(
  () => props.items.find((it) => it.tree_id === props.modelValue),
);
const triggerText = computed(() => selectedItem.value?.label || props.placeholder);

/** 本地过滤（大小写不敏感，匹配 label / sub / tree_id 子串）→ 按 group 分组 */
const groupedItems = computed<Array<{ name: string; items: TreePickerItem[] }>>(() => {
  const q = query.value.trim().toLowerCase();
  const hit = props.items.filter((it) => {
    if (!q) return true;
    return `${it.label} ${it.sub || ''} ${it.tree_id}`.toLowerCase().includes(q);
  });
  const groups: Array<{ name: string; items: TreePickerItem[] }> = [];
  hit.forEach((it) => {
    const name = (it.group || '').trim() || '家族树';
    const g = groups.find((x) => x.name === name);
    if (g) g.items.push(it);
    else groups.push({ name, items: [it] });
  });
  return groups;
});

function openPicker() {
  draftId.value = props.modelValue;
  query.value = '';
  panelOpen.value = true;
}

/** 取消 / 点遮罩：只关闭覆盖层，已选值原样保留 */
function cancelPicker() {
  query.value = '';
  panelOpen.value = false;
}

function confirmPicker() {
  emit('update:modelValue', draftId.value);
  const item = props.items.find((it) => it.tree_id === draftId.value);
  if (item) emit('select', item);
  query.value = '';
  panelOpen.value = false;
}
</script>

<style scoped>
/* 折叠态触发条：单行、固定 44px 高（候选再多也不增高） */
.tree-picker { display: block; }
.tp-trigger {
  display: flex; align-items: center; justify-content: space-between;
  height: 44px; box-sizing: border-box; padding: 0 12px;
  border: 1px solid #F0E8DE; border-radius: 8px; background: #FBF6EF;
}
.tp-trigger:active { background: #F5F0EA; }
.tp-trigger-text {
  flex: 1; font-size: 13px; color: #3E2723;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.tp-trigger-empty { color: #A1887F; }
.tp-trigger-arrow { font-size: 12px; color: #8B4513; margin-left: 8px; }

/* 覆盖层：z-index 1200 > 既有 .modal-mask 的 999 */
.tp-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 1200;
  display: flex; align-items: center; justify-content: center;
}
.tp-panel {
  width: 88%; max-width: 420px; max-height: 80vh;
  background: #fff; border-radius: 14px; padding: 16px;
  display: flex; flex-direction: column;
}
.tp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.tp-head-title { font-size: 16px; font-weight: bold; color: #3E2723; }
.tp-head-close {
  width: 28px; height: 28px; line-height: 28px; text-align: center;
  font-size: 15px; color: #A1887F; border-radius: 50%;
}
.tp-head-close:active { background: #F5F0EA; }
.tp-search { margin-bottom: 10px; }
/* 列表区：固定高度上限 + 内部滚动（弹窗外溢的根治点） */
.tp-list { max-height: 36vh; overflow-y: auto; }
.tp-group-title {
  display: block; font-size: 12px; color: #A1887F; padding: 8px 0 6px;
}
.tp-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border: 1px solid #F0E8DE; border-radius: 8px; margin-bottom: 8px;
}
.tp-item.selected { border-color: #8B4513; background: #FBF6EF; }
.tp-item-main { flex: 1; min-width: 0; }
.tp-item-label {
  display: block; font-size: 13px; color: #3E2723;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
/* sub 副文案：label 下方单行小字，超出省略（无 sub 的项保持单行） */
.tp-item-sub {
  display: block; margin-top: 2px; font-size: 11px; color: #A1887F;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.tp-item-id { font-size: 11px; color: #A1887F; margin-left: 8px; }
.tp-empty { display: block; text-align: center; color: #A1887F; font-size: 13px; padding: 24px 0; }
.tp-actions { display: flex; gap: 8px; margin-top: 12px; }
</style>
