<template>
  <view>
    <!-- 未登录 -->
    <view v-if="!isAuthenticated()" class="container">
      <view class="empty-state">
        <text class="empty-icon">🌳</text>
        <text class="empty-text">登录后查看您加入的家族树</text>
        <t-button theme="primary" size="small" @click="goLogin">去登录</t-button>
      </view>
    </view>

    <!-- 已登录但未绑定 -->
    <view v-else-if="!anchor" class="container">
      <view class="empty-state">
        <text class="empty-icon">🏡</text>
        <text class="empty-text">您尚未加入任何家族树</text>
        <text class="empty-sub">加入后这里将显示您家族树的世系与档案</text>
        <t-button theme="primary" size="small" @click="goHome">去家族列表加入</t-button>
      </view>
    </view>

    <!--
      已绑定：顶部双 tab 切换器 + 两面板（docs/task-center.spec.md T-1）。
      · tab1「我的家谱」= 现有内容（好友域入口格 + <TreeHall>）—— **单真源**，
        TreeHall 只有这一份模板（:key 绑定 tree_id + sync-nav-title=false 逐字不变）；
      · tab2「领取今日奖励」= 任务列表（components/task-center/task-list.vue，与子包页
        pages/task/index 同一份组件）；
      · 切换器体例照首页 pages/index/index.vue 的 .tab-switch / .tab-btn / .tab-text（ref 驱动，**无 t-tabs**）；
      · 两面板都用 v-show（**不卸载**）⇒ TreeHall 不因切换被卸载重建；
      · 导航栏标题保持 pages.json 的「我的家谱」（本页不调 setNavigationBarTitle）；
      · 未登录 / 未绑定走上面两组空态，**不显示切换器**（奖励需登录，T-2）。
    -->
    <view v-else class="bound-wrap">
      <view class="fam-bar">
        <view class="tab-switch">
          <view
            class="tab-btn"
            :class="{ active: famTab === 'tree' }"
            @click="famTab = 'tree'"
          >
            <text class="tab-text">我的家谱</text>
          </view>
          <view
            class="tab-btn"
            :class="{ active: famTab === 'task' }"
            @click="openTaskTab"
          >
            <text class="tab-text">领取今日奖励</text>
          </view>
        </view>
      </view>

      <!-- 面板 1 · 我的家谱（现有内容原样；入口格仍在 TreeHall 之外、页面之内） -->
      <view v-show="famTab === 'tree'">
        <view class="friend-entry">
          <view class="fe-item" @click="goFriends">
            <text class="fe-icon">👥</text>
            <text class="fe-text">好友列表</text>
          </view>
          <view class="fe-item" @click="goInviteFriend">
            <text class="fe-icon">＋</text>
            <text class="fe-text">邀请好友</text>
          </view>
        </view>
        <TreeHall
          :key="boundTreeId"
          :tree-id="boundTreeId"
          :sync-nav-title="false"
        />
      </view>

      <!-- 面板 2 · 领取今日奖励（首次切入才挂载 ⇒ 首屏不因任务取数阻塞；挂载后不卸载） -->
      <view v-show="famTab === 'task'">
        <TaskList v-if="taskPanelOn" ref="taskPanel" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { isAuthenticated, getAuthToken } from '@/business/auth';
import { fetchMyAnchor } from '@/business';
import TreeHall from '@/components/tree-hall/tree-hall.vue';
import TaskList from '@/components/task-center/task-list.vue';

const anchor = ref<{ tree_id: string; person_handle: string; updated_at: string } | null>(null);

/** 锚点所在家族树（空串 = 未加入，不渲染家族树内容） */
const boundTreeId = computed(() => anchor.value?.tree_id || '');

/** 已绑定分支内的双 tab 状态（默认 tab1 ⇒ 进页面先看到家族树，行为与改造前一致） */
const famTab = ref<'tree' | 'task'>('tree');
/** 任务面板是否已挂载（首次切入 tab2 才挂载；此后保持挂载，切回 tab1 只隐藏） */
const taskPanelOn = ref(false);
const taskPanel = ref<{ refresh?: () => Promise<void> } | null>(null);

/** 切到「领取今日奖励」：首次挂载（组件 onMounted 自取数），此后每次切入静默刷新当日三态 */
function openTaskTab() {
  famTab.value = 'task';
  if (!taskPanelOn.value) {
    taskPanelOn.value = true;
    return;
  }
  void taskPanel.value?.refresh?.();
}

/**
 * 解析锚点树：tab 页没有 onLoad 参数，故按登录态拉 /admin/get-anchor。
 * 取不到（无 token / 未加入 / 请求失败）保持 null ⇒ 渲染未加入空态。
 */
async function loadMyTree() {
  const token = getAuthToken();
  if (!token) {
    anchor.value = null;
    return;
  }
  try {
    anchor.value = await fetchMyAnchor(token);
  } catch {
    /* 读不到绑定状态：保持上一次结果（首次即 null ⇒ 空态），不打扰用户 */
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function goHome() {
  uni.switchTab({ url: '/pages/index/index' });
}

/** 好友域入口：两个页面都在**子包** `pages/friend`（主包不承载新页面） */
function goFriends() {
  uni.navigateTo({ url: '/pages/friend/list/index' });
}

function goInviteFriend() {
  uni.navigateTo({ url: '/pages/friend/invite/index' });
}

onMounted(loadMyTree);
// tabbar 页面切换回来时刷新（绑定状态可能变化；换树时 :key 变化触发子树重建）
onShow(() => {
  void loadMyTree();
  // 停在「领取今日奖励」tab 上回来时，顺手刷新当日三态（静默，不闪加载态）
  if (famTab.value === 'task') void taskPanel.value?.refresh?.();
});
</script>

<style scoped>
.container { padding: 20px; padding-bottom: 40px; }

/* 已绑定：入口格 + 家族树（本层不设 padding，家族树内容仍按原样铺满页面） */
.bound-wrap { display: block; }

/* 双 tab 切换器（体例照首页 pages/index/index.vue 的 .sort-bar / .tab-switch / .tab-btn / .tab-text） */
.fam-bar { display: flex; align-items: center; padding: 12px 16px 0; }
.tab-switch {
  display: flex; gap: 2px; margin-left: auto; flex-shrink: 0;
  padding: 2px; background: #FFFDF8;
  border: 1px solid #E0D5C8; border-radius: 999px;
}
.tab-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 6px 14px; border-radius: 999px;
}
.tab-text { font-size: 13px; color: #8B4513; white-space: nowrap; }
.tab-btn.active { background: #8B4513; }
.tab-btn.active .tab-text { color: #fff; }

/* 窄屏（≤370px）：收窄水平空间，保证两颗 tab 单行放得下 */
@media (max-width: 370px) {
  .tab-btn { padding: 6px 10px; }
  .tab-text { font-size: 12px; }
}

/* 好友域入口格（页面内、<TreeHall> 之外：不复制第二份 tree-hall 模板） */
.friend-entry { display: flex; gap: 10px; padding: 12px 16px 0; }
.fe-item {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 10px 0; border-radius: 12px;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.fe-icon { font-size: 16px; margin-right: 6px; }
.fe-text { font-size: 13px; color: #8B4513; }

/* 空态 */
.empty-state {
  text-align: center; padding: 80px 30px;
}
.empty-icon { font-size: 48px; display: block; }
.empty-text { font-size: 16px; color: #3E2723; display: block; margin: 14px 0 6px; }
.empty-sub { font-size: 12px; color: #999; display: block; margin-bottom: 18px; }
</style>
