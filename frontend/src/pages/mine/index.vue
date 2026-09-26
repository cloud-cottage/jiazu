<template>
  <view class="container">
    <!-- 用户卡片 -->
    <view class="user-card">
      <view class="avatar">👤</view>
      <view class="user-info">
        <text v-if="isAuthenticated()" class="user-name">{{ authState.nickname }}</text>
        <text v-else class="user-name">未登录</text>
        <text v-if="isAuthenticated()" class="user-phone">{{ maskPhone(authState.phone) }}</text>
        <t-tag
          v-if="isAuthenticated()"
          :theme="roleTagTheme(authState.role)"
          variant="light"
          size="small"
          class="role-tag"
        >{{ roleName(authState.role) }}</t-tag>
      </view>
      <view class="user-action">
        <t-button
          v-if="!isAuthenticated()"
          size="small"
          theme="primary"
          @click="goLogin"
        >登录 / 注册</t-button>
        <t-button
          v-else
          size="small"
          variant="outline"
          theme="danger"
          @click="doLogout"
        >退出</t-button>
      </view>
    </view>

    <!-- 行囊（游戏背包样式 · 6×6 = 36 栏位）：位于「用户卡正下方」（未登录亦同址渲染 36 空格 + 提示）；
         占格（整堆 / 余数 / 碎片）/ 默认序 / 溢出 / 玉只计未镶嵌见 business/inventory.ts；
         操作成功（合成 / 分解）由组件 emit('refresh') 就地重拉 summary -->
    <asset-inventory
      :summary="inventorySummary"
      :error="inventoryError"
      :loading="inventoryLoading"
      :authenticated="isAuthenticated()"
      :scroll-lock="scrollLock"
      @refresh="refreshInventory"
    />

    <!-- 每日签到（独立卡 · 古风印章式）：置于行囊卡下方；**不展示碎片进度（N/9）**，签到结果只走 toast -->
    <view v-if="isAuthenticated()" class="sign-card">
      <view
        class="sign-seal"
        :class="{ 'sign-seal-done': signedToday, 'sign-seal-busy': signing }"
        @click="doSignin"
      >签</view>
      <view class="sign-body">
        <text class="sign-title">每日签到</text>
        <text class="sign-hint">{{ signedToday ? '今日已签到' : '轻触印章 · 领 1 枚石榴籽碎片' }}</text>
        <text v-if="signError" class="sign-error">{{ signError }}</text>
      </view>
    </view>

    <!-- 我的家族树（绑定状态 + 加入/解绑入口） -->
    <view v-if="isAuthenticated()" class="bind-card">
      <view class="bind-header">
        <text class="bind-title">🌳 我的家族树</text>
        <t-tag v-if="anchor" theme="primary" variant="light" size="small">已绑定</t-tag>
        <t-tag v-else theme="default" variant="light" size="small">未绑定</t-tag>
      </view>

      <view v-if="anchor" class="bind-body">
        <view class="bind-row">
          <text class="bind-label">家族</text>
          <text class="bind-value">{{ boundTreeName }}</text>
        </view>
        <view class="bind-row">
          <text class="bind-label">我的节点</text>
          <text class="bind-value">{{ anchorPersonName || anchor.person_handle }}</text>
        </view>
        <view v-if="anchorError" class="bind-error">{{ anchorError }}</view>
        <t-button
          size="small"
          variant="outline"
          theme="warning"
          class="bind-btn"
          :loading="leaving"
          @click="openLeaveModal"
        >申请解绑</t-button>
        <text class="bind-hint">一人一树终身制：解绑需家族树主理人审批，通过后可改绑其他家族树</text>
      </view>

      <view v-else class="bind-body">
        <text class="bind-empty">尚未加入任何家族树</text>
        <t-button
          size="small"
          theme="primary"
          class="bind-btn"
          @click="goHall"
        >去家族馆加入</t-button>
      </view>
    </view>

    <!-- 解绑申请弹窗 -->
    <view v-if="showLeaveModal" class="modal-mask" @click="showLeaveModal = false">
      <view class="modal" @click.stop>
        <text class="modal-title">申请解绑</text>
        <text class="modal-sub">解绑后需主理人审批通过，才能加入其他家族树</text>
        <t-input
          :value="leaveReason"
          placeholder="解绑原因（选填）"
          class="field"
          @update:value="(v: any) => leaveReason = v"
        />
        <view v-if="leaveError" class="bind-error">{{ leaveError }}</view>
        <view class="modal-actions">
          <t-button theme="primary" block :loading="leaving" @click="doLeave">提交申请</t-button>
          <t-button variant="text" block @click="showLeaveModal = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="menu-card">
      <t-cell-group :bordered="false">
        <t-cell
          :title="messagesCellTitle"
          description="资产到期 / 家族灵气通知"
          arrow
          @click="goMessages"
        />
        <t-cell
          title="🧺 我的资产"
          description="碎片 / 石榴籽 / 竹片 · 收支流水"
          arrow
          @click="go('/pages/assets/index')"
        />
        <t-cell
          title="🏪 竹简市集"
          description="官方发售 · 挂单买卖 · 石榴籽标价"
          arrow
          @click="go('/pages/market/index')"
        />
        <t-cell
          title="🕰 时流子域"
          description="家族专属空间 · 灵气状态 / 蓄能"
          arrow
          @click="goSpirit"
        />
        <t-cell
          title="💰 我的钱包"
          description="余额 / 充值 / 交易流水"
          arrow
          @click="go('/pages/wallet/index')"
        />
        <t-cell
          v-if="canManage"
          title="⚙️ 角色管理"
          description="用户角色 / 锚点 / 解绑审批"
          arrow
          @click="go('/pages/admin/index')"
        />
        <t-cell
          title="📖 关于本站"
          description="声明 / 隐私 / 联系"
          arrow
          @click="go('/pages/about/about')"
        />
      </t-cell-group>
    </view>

    <!-- 账号注销（docs/economy-ops.spec.md §7）：清空四类资产、不可恢复；存在未成交挂单 → 后端 409 拒绝 -->
    <view v-if="isAuthenticated()" class="menu-card danger-card">
      <t-cell-group :bordered="false">
        <t-cell
          title="🚪 注销账号"
          description="清空碎片 / 石榴籽 / 竹片 / 玉 · 不可恢复"
          arrow
          @click="openDeleteAccount"
        />
      </t-cell-group>
      <view v-if="deleteError" class="danger-error">{{ deleteError }}</view>
    </view>

    <view class="footer">
      <text class="version">家族历史数字馆 v0.3 · 手机号验证码登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { isAuthenticated, authState, clearAuth, getAuthToken } from '@/business/auth';
import { fetchMyAnchor, requestLeave, fetchTreeMetaRemote, fetchMessages, deleteAccount, ApiStatusError } from '@/business';
import { fetchAssetsSummary, postSignin } from '@/business/api';
import type { AssetsSummary } from '@/business/api';
import { fetchFriends, scrollLockOf, type ScrollLockView } from '@/business/friends';
import AssetInventory from '@/components/asset-inventory/asset-inventory.vue';

const anchor = ref<{ tree_id: string; person_handle: string; updated_at: string } | null>(null);
const anchorPersonName = ref('');
const boundTreeName = ref('未绑定');
const anchorError = ref('');
const showLeaveModal = ref(false);
const leaveReason = ref('');
const leaveError = ref('');
const leaving = ref(false);

// 站内信未读角标（GET /messages 的 unread；0 时不显示）
const unreadCount = ref(0);
// 行囊（GET /assets/summary）：取数在页面侧完成，组件只收 prop（数据流单一，组件内不二次请求）
const inventorySummary = ref<AssetsSummary | null>(null);
const inventoryError = ref('');
const inventoryLoading = ref(false);
/**
 * 兰帖锁定态（好友域续约申请：本人发起、等待对方确认期间那枚兰帖被占用）——
 * 由 `GET /friends` 的 `pending` 推导后交给行囊组件渲染；`null` = 无锁定态。
 */
const scrollLock = ref<ScrollLockView | null>(null);
// 每日签到（POST /assets/signin）：独立印章卡；已签到状态以服务端 signin_date（UTC+8 自然日）为准
const signing = ref(false);
/** 本次会话内已签到（签到成功 / 同自然日 409 均置位） */
const signedLocal = ref(false);
const signError = ref('');
// 账号注销（docs/economy-ops.spec.md §7）
const deleting = ref(false);
const deleteError = ref('');

const ROLE_LABELS: Record<string, string> = {
  guest: '游客',
  user: '普通用户',
  branch_curator: '支系记录官',
  tree_steward: '族谱主理人',
  chief_editor: '总编辑',
};

const canManage = computed(() => {
  if (!isAuthenticated()) return false;
  return authState.role === 'tree_steward' || authState.role === 'chief_editor';
});

/** 消息中心入口标题：未读为 0 时不显示角标（docs/economy.spec.md 「前端落点与入口」消息行） */
const messagesCellTitle = computed(() =>
  unreadCount.value ? `📮 消息中心（${unreadCount.value} 条未读）` : '📮 消息中心',
);

/** 当日（北京时间自然日）是否已签到：以服务端 `signin_date` 为准（本会话签到成功 / 409 亦置位） */
const signedToday = computed(
  () =>
    signedLocal.value ||
    (inventorySummary.value?.signin_date || '') === cnDateOf(Date.now()),
);

function roleName(role: string): string {
  return ROLE_LABELS[role] || role;
}

function roleTagTheme(role: string): string {
  switch (role) {
    case 'chief_editor': return 'danger';
    case 'tree_steward': return 'warning';
    case 'branch_curator': return 'primary';
    default: return 'default';
  }
}

function maskPhone(phone: string): string {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '';
}

async function loadAnchor() {
  const token = getAuthToken();
  if (!token) return;
  anchorError.value = '';
  try {
    anchor.value = await fetchMyAnchor(token);
    if (anchor.value) {
      // 树名（tree-meta）
      try {
        const meta = await fetchTreeMetaRemote();
        for (const [, entry] of Object.entries(meta.trees)) {
          if (entry.tree_id === anchor.value.tree_id) {
            boundTreeName.value = entry.display_title || entry.tree_id;
            break;
          }
        }
      } catch {
        boundTreeName.value = anchor.value.tree_id;
      }
      // 节点名（读该树 person）
      try {
        const res = await fetch(`/api/people/${anchor.value.person_handle}?profile=all`, {
          headers: { 'X-Tree-Id': anchor.value.tree_id },
        });
        if (res.ok) {
          const p = await res.json();
          const pn = p.primary_name || {};
          anchorPersonName.value =
            (pn.surname_list?.[0]?.surname || '') + (pn.first_name || '') || anchor.value.person_handle;
        }
      } catch {
        /* 读不到节点名则显示 handle */
      }
    }
  } catch (e: any) {
    anchorError.value = e.message || '加载绑定状态失败';
  }
}

function openLeaveModal() {
  leaveError.value = '';
  leaveReason.value = '';
  showLeaveModal.value = true;
}

async function doLeave() {
  const token = getAuthToken();
  if (!token) {
    leaveError.value = '登录已过期，请重新登录';
    return;
  }
  leaving.value = true;
  leaveError.value = '';
  try {
    await requestLeave(token, leaveReason.value);
    showLeaveModal.value = false;
    uni.showToast({ title: '解绑申请已提交，等待审批', icon: 'none' });
  } catch (e: any) {
    leaveError.value = e.message || '申请失败';
  } finally {
    leaving.value = false;
  }
}

function goHall() {
  uni.switchTab({ url: '/pages/index/index' });
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function go(path: string) {
  uni.navigateTo({ url: path });
}

/** 时流子域：按本人锚点树进入本家族子域；无锚点树 → toast 提示并回到数字馆（不报错） */
function goSpirit() {
  const treeId = anchor.value?.tree_id;
  if (!treeId) {
    uni.showToast({ title: '请先加入家族树', icon: 'none' });
    goHall();
    return;
  }
  uni.navigateTo({ url: `/pages/spirit/index?tree_id=${treeId}` });
}

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号吗？',
    success: (res) => {
      if (res.confirm) {
        clearAuth();
        uni.showToast({ title: '已退出', icon: 'success' });
        setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 500);
      }
    },
  });
}

/** 未读角标（GET /messages）：失败不阻塞页面，仅不显示角标 */
async function loadUnread() {
  if (!isAuthenticated()) return;
  try {
    const res = await fetchMessages();
    unreadCount.value = res?.unread || 0;
  } catch {
    unreadCount.value = 0;
  }
}

/** 消息中心（本批消息列表落在资产页「消息提醒」区） */
function goMessages() {
  go('/pages/assets/index');
}

/**
 * 兰帖锁定态取数（好友域只读）：判据全在 `business/friends.ts`（`scrollLockOf`），
 * 页面只把结果交给行囊组件。失败静默置空 ⇒ 不显示锁定文案（宁可少显示，不臆造状态）。
 */
async function loadFriendLock() {
  if (!isAuthenticated()) {
    scrollLock.value = null;
    return;
  }
  try {
    const payload = await fetchFriends();
    scrollLock.value = scrollLockOf(payload.friends);
  } catch {
    scrollLock.value = null;
  }
}

/** 行囊取数（GET /assets/summary）：失败不阻塞页面，容器内显示错误行（同消息角标口径）；
 *  `silent = true`（页内操作就地重拉，如签到 / 合成 / 分解）时不闪「行囊加载中…」 */
async function loadInventory(silent = false) {
  if (!isAuthenticated()) {
    scrollLock.value = null;
    return;
  }
  void loadFriendLock(); // 锁定态与行囊同一入口刷新（不新增刷新按钮）
  if (!silent) inventoryLoading.value = true;
  inventoryError.value = '';
  try {
    inventorySummary.value = await fetchAssetsSummary();
  } catch (e: any) {
    inventorySummary.value = null;
    inventoryError.value = e?.message || '加载行囊失败';
  } finally {
    inventoryLoading.value = false;
  }
}

/** 行囊卡内操作（合成 / 分解）成功后的就地重拉（组件 emit('refresh')；不靠 onShow 刷新） */
function refreshInventory() {
  loadInventory(true);
}

/**
 * 每日签到（POST /assets/signin）：每自然日 1 碎片（满 10 自动合成 1 颗石榴籽）。
 * 回执口径：基础「获得石榴籽碎片 +1」；**本次触发自动合成时必须追加一句**（不得静默吞掉状态变化）；
 * 同自然日重复 → 409「今日已签到」⇒ 按钮置灰 + 文案「今日已签到」（不弹错误）。
 */
async function doSignin() {
  if (!isAuthenticated() || signedToday.value || signing.value) return;
  signing.value = true;
  signError.value = '';
  try {
    const res = await postSignin();
    signedLocal.value = true;
    const parts = ['获得石榴籽碎片 +1'];
    if (res?.synthesized > 0) parts.push(`满 10 已合成 ${res.synthesized} 颗石榴籽`);
    uni.showToast({ title: parts.join('，'), icon: 'none', duration: 3000 });
    await loadInventory(true); // 就地更新行囊（碎片 / 籽格）
  } catch (e: any) {
    if (e instanceof ApiStatusError && e.status === 409) {
      // 同自然日重复：置灰 + 文案提示，不弹错误
      signedLocal.value = true;
      uni.showToast({ title: '今日已签到', icon: 'none' });
    } else {
      signError.value = e?.message || '签到失败';
    }
  } finally {
    signing.value = false;
  }
}

/** 北京时间（UTC+8）日历日（与服务端 `signin_date` 同口径） */
function cnDateOf(ts: number): string {
  const d = new Date(ts + 8 * 3600 * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** 注销入口：先二次确认（明示不可恢复与挂单前置），确认后才调接口 */
function openDeleteAccount() {
  if (deleting.value) return;
  deleteError.value = '';
  uni.showModal({
    title: '注销账号',
    content:
      '注销后本账号的碎片、石榴籽、竹片、石榴籽玉将全部清空，且不可恢复；历史审计与流水保留。若账号存在未成交的市集挂单，需先自行撤销，否则注销会被拒绝。是否确认注销？',
    confirmText: '确认注销',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) confirmDeleteAccount();
    },
  });
}

/** 注销：409（存在未成交挂单）直出后端原文并引导去市集页撤单；成功则登出回首页 */
async function confirmDeleteAccount() {
  deleting.value = true;
  deleteError.value = '';
  try {
    await deleteAccount();
    clearAuth();
    uni.showToast({ title: '账号已注销', icon: 'success' });
    setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 600);
  } catch (e: any) {
    const status = e instanceof ApiStatusError ? e.status : 0;
    const message = e?.message || '注销失败';
    deleteError.value = message;
    if (status === 409) {
      uni.showModal({
        title: '暂时无法注销',
        content: message,
        confirmText: '去撤单',
        cancelText: '知道了',
        success: (res) => {
          if (res.confirm) uni.navigateTo({ url: '/pages/market/index' });
        },
      });
    } else {
      uni.showModal({ title: '注销失败', content: message, showCancel: false });
    }
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  if (isAuthenticated()) {
    loadAnchor();
    loadUnread();
    loadInventory();
  }
});
</script>

<style scoped>
.container { padding: 20px; }
.user-card {
  display: flex; align-items: center; gap: 14px;
  background: linear-gradient(135deg, #8B4513, #A66B32);
  border-radius: 14px; padding: 20px; color: #fff; margin-bottom: 16px;
}
.avatar {
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(255,255,255,0.2); font-size: 28px;
  display: flex; align-items: center; justify-content: center;
}
.user-info { flex: 1; }
.user-name { font-size: 18px; font-weight: bold; display: block; }
.user-phone { font-size: 12px; color: #E8D5C0; display: block; margin-top: 2px; }
.role-tag { margin-top: 4px; }
.user-action { flex-shrink: 0; }

/* 每日签到（古风印章式独立卡；位于行囊卡下方；不展示碎片进度） */
.sign-card {
  display: flex; align-items: center; gap: 16px;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE; border-radius: 14px; padding: 16px;
  margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
/* 朱红方印（点击区）；已签到 → 整体置灰 */
.sign-seal {
  width: 56px; height: 56px; flex-shrink: 0; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, #B2352C, #8C1F18);
  box-shadow: inset 0 0 0 2px rgba(255, 240, 220, 0.75), 0 2px 6px rgba(139, 69, 19, 0.25);
  color: #FFF6EA; font-size: 26px; font-weight: bold; transform: rotate(-4deg);
  user-select: none; -webkit-user-select: none;
}
.sign-seal-done {
  background: linear-gradient(160deg, #C9BEB2, #A79A8C);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.6);
  color: #F7F1E8; transform: none;
}
.sign-seal-busy { opacity: 0.6; }
.sign-body { flex: 1; }
.sign-title { font-size: 16px; font-weight: bold; color: #3E2723; letter-spacing: 2px; display: block; }
.sign-hint { font-size: 12px; color: #B08D57; display: block; margin-top: 4px; }
.sign-error { font-size: 12px; color: #C62828; display: block; margin-top: 4px; }

/* 我的家族树 */
.bind-card {
  background: #fff; border-radius: 14px; padding: 16px;
  margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.bind-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.bind-title { font-size: 16px; font-weight: bold; color: #3E2723; }
.bind-row { display: flex; margin-bottom: 8px; }
.bind-label { font-size: 13px; color: #999; width: 64px; flex-shrink: 0; }
.bind-value { font-size: 14px; color: #3E2723; flex: 1; }
.bind-empty { font-size: 13px; color: #999; display: block; margin-bottom: 10px; }
.bind-btn { margin-top: 10px; }
.bind-hint { font-size: 11px; color: #B5A594; display: block; margin-top: 10px; line-height: 1.5; }
.bind-error { font-size: 12px; color: #C62828; margin-top: 8px; }

/* 弹窗 */
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 86%; max-width: 380px; background: #fff; border-radius: 14px;
  padding: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}
.modal-title { font-size: 17px; font-weight: bold; color: #3E2723; display: block; text-align: center; }
.modal-sub { font-size: 12px; color: #999; display: block; text-align: center; margin: 6px 0 14px; }
.field { margin-bottom: 10px; }
.modal-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }

.menu-card :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.danger-card { margin-top: 16px; }
.danger-error { padding: 10px 16px; font-size: 12px; color: #C62828; line-height: 1.5; }
.footer { text-align: center; margin-top: 30px; }
.version { font-size: 12px; color: #B5A594; }
</style>
