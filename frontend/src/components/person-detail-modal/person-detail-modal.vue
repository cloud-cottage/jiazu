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
          :mirror-of="mirror"
          :mirror-fallback-note="mirrorFallbackNote"
          @open-person="onOpenPerson"
          @open-tree="onOpenTree"
          @tree-changed="onTreeChanged"
          @load-failed="onLoadFailed"
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
import { openTreeHome, mirrorTargetOf, MIRROR_UNAVAILABLE_NOTE } from '@/business';
import type { MirrorFields, MirrorTarget } from '@/business';
import PersonArchive from '@/components/person-archive/person-archive.vue';

/**
 * 人物档案弹窗宿主（唯一档案弹窗层）
 * - 在图谱/时间轴/搜索结果等浏览场景点击人物时打开，档案内容即完整详情页，可内联编辑（不再叠编辑弹窗）
 * - treeManage=true：档案内启用「谱系管理」操作区（加父/加子/拆分），供树图宿主使用
 * - 同树人物（父母/配偶/子女）→ 弹窗内直接换人；跨树 → 关闭弹窗再跳转
 * - 右上 ✕ / 底部「关闭」均可关闭
 * - 口径 A（镜像节点点击 = 打开真身档案）：`open` 的第 3 参传镜像指针 → 自动解析真身（treeId/handle）；
 *   真身拉取失败时回退本树副本 + 顶部提示「真身内容不可见」
 */
const props = withDefaults(defineProps<{ treeManage?: boolean }>(), {
  treeManage: false,
});

const emit = defineEmits<{
  /** 树结构被管理操作修改（加父/加子/拆分等），宿主需刷新树图 */
  (e: 'tree-changed'): void;
}>();

const show = ref(false);
const curTreeId = ref('');
const curHandle = ref('');
const scrollTop = ref(0);
/** 口径 A 第 3 条：本次打开由镜像节点进入时的真身目标（null = 普通打开，零影响） */
const mirror = ref<MirrorTarget | null>(null);
/** 口径 A 第 5 条兜底：镜像节点的本树副本坐标（真身拉取失败时回退用） */
const mirrorOrigin = ref<{ treeId: string; handle: string } | null>(null);
/** 是否已回退过（防重复回退 / 防循环） */
const mirrorFellBack = ref(false);
/** 顶部标注：由 PersonArchive 依此显示（回退态 = 「真身内容不可见」） */
const mirrorFallbackNote = ref('');

/**
 * 打开人物档案。
 * @param treeId 树 id（普通节点即目标树）
 * @param handle 人物 handle（普通节点即目标人物）
 * @param mirrorOf 可选的镜像指针（点击树图卡片 / 搜索结果 / 镜像列表中的镜像节点时传入）：
 *   启用口径 A —— 打开时 treeId/handle 一律换成真身（external_tree / external_person_handle）。
 */
function open(treeId: string, handle: string, mirrorOf?: MirrorFields | null) {
  const target = mirrorTargetOf(mirrorOf || null);
  mirror.value = target;
  mirrorOrigin.value = target ? { treeId, handle } : null;
  mirrorFellBack.value = false;
  mirrorFallbackNote.value = '';
  curTreeId.value = target ? target.treeId : treeId;
  curHandle.value = target ? target.handle : handle;
  show.value = true;
  resetScroll();
}

function close() {
  show.value = false;
  curTreeId.value = '';
  curHandle.value = '';
  mirror.value = null;
  mirrorOrigin.value = null;
  mirrorFallbackNote.value = '';
  mirrorFellBack.value = false;
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

/**
 * 口径 A 第 5 条兜底：真身档案拉取失败（404 / 权限不可见 / 网络错）
 * → 回退用镜像本树副本打开，并在顶部提示「真身内容不可见」。
 */
function onLoadFailed() {
  if (!mirror.value || mirrorFellBack.value) return;
  const origin = mirrorOrigin.value;
  if (!origin) return;
  mirrorFellBack.value = true;
  mirrorFallbackNote.value = MIRROR_UNAVAILABLE_NOTE;
  curTreeId.value = origin.treeId;
  curHandle.value = origin.handle;
  resetScroll();
}

function onOpenPerson(payload: { treeId: string; handle: string; mirrorOf?: MirrorFields | null }) {
  // 口径 A：目标本身是镜像 → 先解析真身，再决定「弹窗内换人 / 跨树跳转」
  const target = mirrorTargetOf(payload.mirrorOf || null);
  const listTreeId = target ? target.treeId : payload.treeId;
  const listHandle = target ? target.handle : payload.handle;
  const listMirrorOrigin = target ? { treeId: payload.treeId, handle: payload.handle } : null;
  if (listTreeId === curTreeId.value) {
    // 同树：弹窗内换人
    curHandle.value = listHandle;
    mirror.value = target;
    mirrorOrigin.value = listMirrorOrigin;
    mirrorFellBack.value = false;
    mirrorFallbackNote.value = '';
    resetScroll();
    return;
  }
  // 跨树人物：弹窗上下文失效，关闭后走页面跳转（深链页自行处理镜像解析，见 pages/person/detail.vue）
  const treeId = listTreeId;
  const handle = listHandle;
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
