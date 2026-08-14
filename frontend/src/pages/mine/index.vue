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

    <!-- 功能菜单 -->
    <view class="menu-card">
      <t-cell-group :bordered="false">
        <t-cell
          title="💰 我的钱包"
          description="余额 / 充值 / 转账"
          arrow
          @click="go('/pages/wallet/index')"
        />
        <t-cell
          v-if="canManage"
          title="⚙️ 角色管理"
          description="用户角色与锚点"
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

    <view class="footer">
      <text class="version">家族历史数字馆 v0.3 · 手机号验证码登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { isAuthenticated, authState, clearAuth } from '@/business/auth';

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

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function go(path: string) {
  uni.navigateTo({ url: path });
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
.menu-card :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.footer { text-align: center; margin-top: 30px; }
.version { font-size: 12px; color: #B5A594; }
</style>
