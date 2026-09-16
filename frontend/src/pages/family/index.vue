<template>
  <view class="container">
    <!-- 未登录 -->
    <view v-if="!isAuthenticated()" class="empty-state">
      <text class="empty-icon">🌳</text>
      <text class="empty-text">登录后查看您加入的家族树</text>
      <t-button theme="primary" size="small" @click="goLogin">去登录</t-button>
    </view>

    <!-- 已登录但未绑定 -->
    <view v-else-if="!anchor" class="empty-state">
      <text class="empty-icon">🏡</text>
      <text class="empty-text">您尚未加入任何家族树</text>
      <text class="empty-sub">加入后这里将显示您家族树的世系与档案</text>
      <t-button theme="primary" size="small" @click="goHome">去家族列表加入</t-button>
    </view>

    <!-- 已绑定：我的家族树（卡片可点击进入家族树首页） -->
    <template v-else>
      <view class="hero" @click="goTreeHome">
        <text class="hero-title">{{ hallInfo?.display_title || boundTreeId }}</text>
        <text class="hero-hall" v-if="hallInfo?.genealogy_name">谱名：{{ hallInfo.genealogy_name }}</text>
        <text class="hero-hall" v-if="hallInfo?.hall_name && hallInfo.hall_name !== '暂无'">堂号：{{ hallInfo.hall_name }}</text>
        <text class="hero-origin" v-if="hallInfo?.origin">发源地：{{ hallInfo.origin }}</text>
        <text class="hero-desc" v-if="hallInfo?.description">{{ hallInfo.description }}</text>
        <t-tag v-if="rank" :theme="rankTheme" variant="light" size="small" class="hero-rank">
          {{ rank.rank_label }} · {{ rank.total_generations }} 世
        </t-tag>
        <text class="hero-enter">进入家族树 ›</text>
      </view>

      <!-- 我的节点（身份锚点） -->
      <view class="anchor-card">
        <text class="anchor-label">我的身份节点</text>
        <text class="anchor-name">{{ anchorPersonName }}</text>
        <text class="anchor-id">{{ anchor.person_handle }}</text>
      </view>

      <!-- 导航入口 -->
      <view class="nav-grid">
        <t-grid :columns="3" :bordered="false">
          <t-grid-item text="世系图谱" @click="goPedigree">
            <template #icon><text class="nav-icon">🌳</text></template>
          </t-grid-item>
          <t-grid-item text="文献地址" @click="goMedia">
            <template #icon><text class="nav-icon">📜</text></template>
          </t-grid-item>
        </t-grid>
      </view>

      <!-- 统计 -->
      <view class="stats" v-if="stats">
        <text class="stat">收录人物：{{ stats.person_count }} 人</text>
      </view>

      <view v-if="loadError" class="error">{{ loadError }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import { fetchMyAnchor, fetchTreeMetaRemote, fetchTreeStats, fetchTreeRank, openTreeHome } from '@/business';
import type { TreeEntry } from '@/business/types';
import type { TreeRankInfo } from '@/business/api';

const anchor = ref<{ tree_id: string; person_handle: string; updated_at: string } | null>(null);
const hallInfo = ref<TreeEntry | null>(null);
const anchorPersonName = ref('');
const stats = ref<any>(null);
const rank = ref<TreeRankInfo | null>(null);
const loadError = ref('');

const boundTreeId = computed(() => anchor.value?.tree_id || '');

const rankTheme = computed(() => {
  const r = rank.value;
  if (!r) return 'default';
  if (r.over_limit) return 'danger';
  switch (r.rank_key) {
    case 'family_rank': return 'default';
    case 'clan_rank': return 'primary';
    case 'lineage_rank': return 'warning';
    case 'stemma_rank': return 'danger';
    default: return 'default';
  }
});

async function loadMyTree() {
  loadError.value = '';
  const token = getAuthToken();
  if (!token) return;
  try {
    anchor.value = await fetchMyAnchor(token);
  } catch (e: any) {
    loadError.value = e.message || '加载绑定状态失败';
    return;
  }
  if (!anchor.value) return;

  const tid = anchor.value.tree_id;
  // 树信息（tree-meta）
  try {
    const meta = await fetchTreeMetaRemote();
    for (const [, entry] of Object.entries(meta.trees)) {
      if (entry.tree_id === tid) {
        hallInfo.value = entry;
        break;
      }
    }
  } catch {
    /* 读不到则仅显示 tree_id */
  }
  // 我的节点名
  try {
    const res = await fetch(`/api/people/${anchor.value.person_handle}?profile=all`, {
      headers: { 'X-Tree-Id': tid },
    });
    if (res.ok) {
      const p = await res.json();
      const pn = p.primary_name || {};
      anchorPersonName.value =
        (pn.surname_list?.[0]?.surname || '') + (pn.first_name || '') || anchor.value.person_handle;
    }
  } catch {
    /* 节点名读不到则显示 handle */
  }
  // 统计 + 等级
  try {
    stats.value = await fetchTreeStats(tid);
  } catch {
    stats.value = null;
  }
  try {
    rank.value = await fetchTreeRank(tid).catch(() => null);
  } catch {
    rank.value = null;
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function goHome() {
  uni.switchTab({ url: '/pages/index/index' });
}

function goPedigree() {
  if (!boundTreeId.value) return;
  uni.navigateTo({ url: `/pages/pedigree/index?tree_id=${boundTreeId.value}` });
}

/** 进入家族树首页（可读 uri 地址） */
function goTreeHome() {
  if (!boundTreeId.value) return;
  openTreeHome(boundTreeId.value);
}

function goMedia() {
  if (!boundTreeId.value) return;
  uni.navigateTo({ url: `/pages/media/index?tree_id=${boundTreeId.value}` });
}

onMounted(loadMyTree);
// tabbar 页面切换回来时刷新（绑定状态可能变化）
onShow(() => {
  if (isAuthenticated()) loadMyTree();
});
</script>

<style scoped>
.container { padding: 20px; padding-bottom: 40px; }

/* 空态 */
.empty-state {
  text-align: center; padding: 80px 30px;
}
.empty-icon { font-size: 48px; display: block; }
.empty-text { font-size: 16px; color: #3E2723; display: block; margin: 14px 0 6px; }
.empty-sub { font-size: 12px; color: #999; display: block; margin-bottom: 18px; }

/* 我的家族树 */
.hero {
  background: linear-gradient(135deg, #8B4513, #A66B32);
  border-radius: 14px; padding: 20px; color: #fff; margin-bottom: 14px;
}
.hero-title { font-size: 20px; font-weight: bold; display: block; }
.hero-hall { font-size: 14px; color: #FFD54F; display: block; margin-top: 8px; }
.hero-origin { font-size: 13px; color: #E8D5C0; display: block; margin-top: 6px; }
.hero-desc { font-size: 13px; color: #F5E6D3; display: block; margin-top: 8px; line-height: 1.6; }
.hero-rank { margin-top: 10px; }
.hero-enter {
  display: inline-block;
  margin-top: 12px;
  padding: 6px 16px;
  background: rgba(255,255,255,0.18);
  border-radius: 14px;
  font-size: 12px;
  color: #fff;
}

.anchor-card {
  background: #FFF8E1; border-radius: 10px; padding: 12px 14px;
  margin-bottom: 14px;
}
.anchor-label { font-size: 12px; color: #8B4513; font-weight: bold; display: block; }
.anchor-name { font-size: 16px; color: #3E2723; font-weight: bold; display: block; margin-top: 4px; }
.anchor-id { font-size: 11px; color: #B5A594; display: block; margin-top: 2px; }

.nav-grid { margin-bottom: 14px; }
.nav-icon { font-size: 24px; }
.nav-grid :deep(.t-grid) { border-radius: 12px; overflow: hidden; }

.stats { text-align: center; padding: 14px; background: #FFF8E1; border-radius: 8px; }
.stat { font-size: 14px; color: #5D4037; }

.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 14px; }
</style>
