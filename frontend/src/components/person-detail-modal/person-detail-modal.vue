<template>
  <view v-if="show" class="detail-mask" @click="close">
    <view class="detail-modal" @click.stop>
      <view class="detail-head">
        <text class="detail-title">人物详情</text>
        <text class="detail-close" @click="close">✕</text>
      </view>
      <scroll-view
        scroll-y
        class="detail-body"
        :scroll-top="scrollTop"
        :show-scrollbar="false"
      >
        <!-- 同树换人：key 变化整体重挂载档案面板（滚动/编辑状态自动重置） -->
        <PersonArchive
          v-if="show"
          :key="`${curTreeId}:${curHandle}`"
          :tree-id="curTreeId"
          :handle="curHandle"
          mode="modal"
          :tree-manage="treeManage"
          @open-person="onOpenPerson"
          @open-tree="onOpenTree"
          @tree-changed="onTreeChanged"
        />
      </scroll-view>
      <view class="detail-foot">
        <t-button theme="primary" variant="outline" block @click="close">关闭</t-button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { openTreeHome } from '@/business';
import PersonArchive from '@/components/person-archive/person-archive.vue';

/**
 * 人物档案弹窗宿主（唯一档案弹窗层）
 * - 在图谱/时间轴/搜索结果等浏览场景点击人物时打开，档案内容即完整详情页，可内联编辑（不再叠编辑弹窗）
 * - treeManage=true：档案内启用「谱系管理」操作区（加父/加子/晋宗/拆分），供树图宿主使用
 * - 同树人物（父母/配偶/子女）→ 弹窗内直接换人；跨树 → 关闭弹窗再跳转
 * - 右上 ✕ / 底部「关闭」均可关闭
 */
const props = withDefaults(defineProps<{ treeManage?: boolean }>(), {
  treeManage: false,
});

const emit = defineEmits<{
  /** 树结构被管理操作修改（加父/加子/晋宗/拆分等），宿主需刷新树图 */
  (e: 'tree-changed'): void;
}>();

const show = ref(false);
const curTreeId = ref('');
const curHandle = ref('');
const scrollTop = ref(0);

function open(treeId: string, handle: string) {
  curTreeId.value = treeId;
  curHandle.value = handle;
  show.value = true;
  resetScroll();
}

function close() {
  show.value = false;
  curTreeId.value = '';
  curHandle.value = '';
}

/** 换人后回到弹窗顶部（scroll-view 的 scroll-top 需数值变化才生效，用 1→0 强制刷新） */
function resetScroll() {
  scrollTop.value = 1;
  nextTick(() => {
    scrollTop.value = 0;
  });
}

/** 树变更（管理操作完成）：上抛宿主刷新树图 */
function onTreeChanged() {
  emit('tree-changed');
}

function onOpenPerson(payload: { treeId: string; handle: string }) {
  if (payload.treeId === curTreeId.value) {
    // 同树：弹窗内换人
    curHandle.value = payload.handle;
    resetScroll();
    return;
  }
  // 跨树人物：弹窗上下文失效，关闭后走页面跳转
  const treeId = payload.treeId;
  const handle = payload.handle;
  close();
  uni.navigateTo({ url: `/pages/person/detail?tree_id=${treeId}&handle=${handle}` });
}

function onOpenTree(treeId: string) {
  close();
  openTreeHome(treeId);
}

defineExpose({ open });
</script>

<style scoped>
.detail-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 950;
  display: flex; align-items: center; justify-content: center;
}
.detail-modal {
  width: 92%; max-width: 460px;
  max-height: 86vh; height: 82vh;
  background: #fff; border-radius: 16px;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 30px rgba(0,0,0,0.3);
  overflow: hidden;
}
.detail-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px 8px;
  border-bottom: 1px solid #F0E8DE;
  flex-shrink: 0;
}
.detail-title { font-size: 16px; font-weight: bold; color: #3E2723; }
.detail-close {
  width: 30px; height: 30px; line-height: 30px; text-align: center;
  font-size: 16px; color: #999; border-radius: 50%;
}
.detail-close:active { background: #F5F0EA; }
.detail-body { flex: 1; height: 100%; min-height: 0; }
.detail-foot { padding: 10px 14px 14px; flex-shrink: 0; }
</style>
