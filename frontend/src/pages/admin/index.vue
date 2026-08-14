<template>
  <view class="container">
    <view v-if="!isAuthenticated()" class="not-logged">
      <text>请先登录</text>
      <t-button theme="primary" block class="btn-login" @click="goLogin">去登录</t-button>
    </view>

    <view v-else-if="!canManage" class="not-logged">
      <text>需要族谱主理人（tree_steward）或以上权限</text>
    </view>

    <template v-else>
      <view class="header-card">
        <text class="header-title">角色管理</text>
        <text class="header-sub">您的角色：{{ roleName(authState.role) }}</text>
      </view>

      <!-- 用户列表 -->
      <view class="section">
        <text class="section-title">用户列表（{{ users.length }}）</text>
        <view v-if="!users.length" class="empty">暂无用户</view>
        <view v-for="u in users" :key="u.phone" class="user-item">
          <view class="user-info">
            <text class="user-name">{{ u.nickname }}</text>
            <text class="user-phone">{{ u.phone }}</text>
            <t-tag
              :theme="tagTheme(u.role)"
              variant="light"
              size="small"
              class="user-role"
            >{{ roleName(u.role) }}</t-tag>
          </view>
          <view class="user-actions" v-if="u.phone !== authState.phone && canManageUser(u.role)">
            <t-dropdown-menu>
              <t-dropdown-item
                :options="roleOptions"
                :value="u.role"
                :label="roleName(u.role)"
                @change="(val: string) => changeRole(u, val)"
              />
            </t-dropdown-menu>
          </view>
          <view class="anchor-row" v-if="u.phone !== authState.phone && canManageUser(u.role)">
            <t-input
              :model-value="anchorInputs[u.phone]?.tree || ''"
              placeholder="锚点树 ID"
              size="small"
              class="anchor-input"
              @update:model-value="(v: string) => setAnchorField(u.phone, 'tree', v)"
            />
            <t-input
              :model-value="anchorInputs[u.phone]?.person || ''"
              placeholder="锚点人物 handle"
              size="small"
              class="anchor-input"
              @update:model-value="(v: string) => setAnchorField(u.phone, 'person', v)"
            />
            <t-button
              size="small"
              variant="outline"
              @click="saveAnchor(u)"
            >设锚点</t-button>
          </view>
        </view>
      </view>

      <view v-if="error" class="error">{{ error }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchUserList, setUserRole, setAnchor } from '@/business/api';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import type { ManagedUser } from '@/business/api';

const users = ref<ManagedUser[]>([]);
const error = ref('');
const anchorInputs = ref<Record<string, { tree: string; person: string }>>({});

const ROLE_LABELS: Record<string, string> = {
  guest: '游客',
  user: '普通用户',
  branch_curator: '支系记录官',
  tree_steward: '族谱主理人',
  chief_editor: '总编辑',
};

const roleOptions = [
  { label: '普通用户', value: 'user' },
  { label: '支系记录官', value: 'branch_curator' },
  { label: '族谱主理人', value: 'tree_steward' },
];

const ROLE_LEVEL: Record<string, number> = {
  guest: 0,
  user: 1,
  branch_curator: 2,
  tree_steward: 3,
  chief_editor: 4,
};

const canManage = computed(() => {
  if (!isAuthenticated()) return false;
  return (ROLE_LEVEL[authState.role] ?? 0) >= ROLE_LEVEL.tree_steward;
});

function roleName(role: string): string {
  return ROLE_LABELS[role] || role;
}

function tagTheme(role: string): string {
  switch (role) {
    case 'chief_editor': return 'danger';
    case 'tree_steward': return 'warning';
    case 'branch_curator': return 'primary';
    default: return 'default';
  }
}

function canManageUser(targetRole: string): boolean {
  // 不能管理级别不低于自己的用户
  return (ROLE_LEVEL[authState.role] ?? 0) > (ROLE_LEVEL[targetRole] ?? 0);
}

function setAnchorField(phone: string, field: 'tree' | 'person', value: string) {
  if (!anchorInputs.value[phone]) anchorInputs.value[phone] = { tree: '', person: '' };
  anchorInputs.value[phone][field] = value;
}

async function changeRole(u: ManagedUser, newRole: string) {
  if (!newRole || newRole === u.role) return;
  try {
    await setUserRole(getAuthToken(), u.phone, newRole);
    uni.showToast({ title: `已升级为${roleName(newRole)}`, icon: 'success' });
    await loadUsers();
  } catch (e: any) {
    error.value = e.message || '设置失败';
  }
}

async function saveAnchor(u: ManagedUser) {
  const input = anchorInputs.value[u.phone];
  if (!input?.tree || !input?.person) {
    error.value = '请输入树 ID 和人物 handle';
    return;
  }
  try {
    await setAnchor(getAuthToken(), u.phone, input.tree, input.person);
    uni.showToast({ title: '锚点已设置', icon: 'success' });
  } catch (e: any) {
    error.value = e.message || '设置锚点失败';
  }
}

async function loadUsers() {
  try {
    users.value = await fetchUserList(getAuthToken());
    // 初始化锚点输入
    for (const u of users.value) {
      if (!anchorInputs.value[u.phone]) anchorInputs.value[u.phone] = { tree: '', person: '' };
    }
  } catch (e: any) {
    error.value = e.message || '加载用户失败';
  }
}

onMounted(() => {
  if (canManage.value) loadUsers();
});

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}
</script>

<style scoped>
.container { padding: 20px; }
.not-logged { text-align: center; padding: 60px 0; color: #999; }
.btn-login { margin-top: 14px; }
.header-card {
  background: linear-gradient(135deg, #8B4513, #A66B32);
  border-radius: 14px; padding: 20px; color: #fff; margin-bottom: 16px;
}
.header-title { font-size: 20px; font-weight: bold; display: block; }
.header-sub { font-size: 13px; color: #E8D5C0; margin-top: 4px; display: block; }
.section {
  background: #fff; border-radius: 12px; padding: 16px;
  margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.section-title { font-size: 15px; font-weight: bold; color: #3E2723; display: block; margin-bottom: 12px; }
.empty { text-align: center; color: #999; padding: 20px; font-size: 13px; }
.user-item {
  padding: 12px 0; border-bottom: 1px solid #f5f0ea;
}
.user-item:last-child { border-bottom: none; }
.user-info { display: flex; align-items: center; gap: 8px; }
.user-name { font-size: 15px; color: #3E2723; font-weight: 500; }
.user-phone { font-size: 12px; color: #999; }
.user-role { margin-left: 4px; }
.user-actions { margin-top: 8px; }
.anchor-row { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
.anchor-input { flex: 1; }
.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }
</style>
