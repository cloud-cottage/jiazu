<template>
  <view class="container">
    <view class="header">
      <view class="header-top">
        <view class="header-left">
          <!-- 登录后显示钱包入口 -->
          <view v-if="isAuthenticated()" class="wallet-badge" @click="goWallet">
            <text class="wallet-text">💰 我的钱包</text>
          </view>
          <!-- 管理角色显示角色管理入口 -->
          <view v-if="canManage" class="admin-badge" @click="goAdmin">
            <text class="admin-text">⚙️ 角色管理</text>
          </view>
        </view>
        <view class="auth-badge" @click="goAuth">
          <text v-if="isAuthenticated()" class="auth-text">👤 {{ authState.nickname }}</text>
          <text v-else class="auth-text">登录 / 注册</text>
        </view>
      </view>
      <text class="title">家族历史数字馆</text>
      <text class="subtitle">多姓氏、多支派家谱数字化展示平台</text>
    </view>

    <!-- 双模式切换：矩阵式 / 总谱目录树 -->
    <view class="mode-tabs">
      <t-tabs v-model="activeTab" :theme="'light'" @change="onTabChange">
        <t-tab-panel label="家族馆" value="grid" />
        <t-tab-panel label="中华世本目录" value="master" />
      </t-tabs>
    </view>

    <!-- 模式1：矩阵式家族馆列表 -->
    <view v-if="activeTab === 'grid'" class="hall-list">
      <t-cell-group :bordered="false">
        <t-cell
          v-for="card in halls"
          :key="card.tree_id"
          :title="`${card.surname}氏 · ${card.title}`"
          :description="`发源地：${card.origin || '待完善'}`"
          :note="card.description"
          :border="!card.isMaster"
          arrow
          @click="goToHall(card)"
        >
          <template #note>
            <view v-if="card.isMaster">
              <t-tag theme="primary" variant="light" size="small">总谱</t-tag>
              <text class="master-desc">{{ card.description }}</text>
            </view>
            <text v-else>{{ card.description }}</text>
          </template>
        </t-cell>
      </t-cell-group>

      <view v-if="halls.length === 0" class="empty">
        <text>暂无已上线的家族数字馆</text>
      </view>
    </view>

    <!-- 模式2：总谱目录树（中华世本为根 → 各家族树 → 始祖节点） -->
    <view v-else class="master-view">
      <view v-if="masterLoading" class="empty">
        <t-loading theme="spinner" text="加载总谱目录..." />
      </view>
      <view v-else-if="masterError" class="error">{{ masterError }}</view>
      <template v-else>
        <!-- 总谱根 -->
        <view class="master-root" @click="masterCard && goToHall(masterCard)">
          <text class="root-icon">🌐</text>
          <view class="root-info">
            <text class="root-title">中华世本</text>
            <text class="root-sub">{{ masterNodes.length }} 个始祖节点 · 串联 {{ masterGroups.length }} 棵家族树</text>
          </view>
          <text class="root-arrow">›</text>
        </view>

        <!-- 各家族树分支（可展开） -->
        <view
          v-for="g in masterGroups"
          :key="g.tree_id"
          class="tree-branch"
        >
          <view class="branch-header" @click="toggleBranch(g.tree_id)">
            <text class="branch-arrow" :class="{ open: isOpen(g.tree_id) }">▸</text>
            <text class="branch-name">{{ g.surname }}氏 · {{ g.title }}</text>
            <text class="branch-count">{{ g.nodes.length }} 人</text>
          </view>
          <view v-if="isOpen(g.tree_id)" class="branch-nodes">
            <view
              v-for="node in g.nodes"
              :key="node.handle"
              class="branch-node"
              @click="goToPerson(node)"
            >
              <text class="node-dot">•</text>
              <text class="node-name">{{ node.name }}</text>
              <text class="node-id">{{ node.gramps_id }}</text>
            </view>
          </view>
        </view>
      </template>
    </view>

    <view class="footer">
      <text class="link" @click="goToPage('/pages/about/about')">关于本站 · 免责声明</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchTreeMetaRemote, buildTreeUrl, fetchMasterTree } from '@/business';
import { isAuthenticated, authState } from '@/business/auth';
import type { DigitalHallCard, TreeMeta } from '@/business/types';
import type { MasterNode } from '@/business/api';

const halls = ref<DigitalHallCard[]>([]);
const meta = ref<TreeMeta | null>(null);

// ---- 双模式切换 ----
const activeTab = ref('grid');

// ---- 总谱目录树 ----
const masterNodes = ref<MasterNode[]>([]);
const masterLoading = ref(false);
const masterError = ref('');
const expanded = ref<Set<string>>(new Set());

interface MasterGroup {
  tree_id: string;
  surname: string;
  title: string;
  nodes: MasterNode[];
}

const masterGroups = computed<MasterGroup[]>(() => {
  const byTree = new Map<string, MasterNode[]>();
  for (const n of masterNodes.value) {
    const tid = n.external_tree || '';
    if (!tid) continue;
    if (!byTree.has(tid)) byTree.set(tid, []);
    byTree.get(tid)!.push(n);
  }
  const groups: MasterGroup[] = [];
  for (const [tid, nodes] of byTree) {
    const card = halls.value.find((h) => h.tree_id === tid);
    groups.push({
      tree_id: tid,
      surname: card?.surname || (tid.match(/^([a-z]+)_/) || [])[1] || '?',
      title: card?.title || tid,
      nodes,
    });
  }
  return groups;
});

const masterCard = computed<DigitalHallCard | null>(
  () => halls.value.find((h) => h.isMaster) || null,
);

function isOpen(treeId: string): boolean {
  return expanded.value.has(treeId);
}

function toggleBranch(treeId: string) {
  const next = new Set(expanded.value);
  if (next.has(treeId)) next.delete(treeId);
  else next.add(treeId);
  expanded.value = next;
}

async function loadMasterTree() {
  if (masterNodes.value.length) return;
  masterLoading.value = true;
  masterError.value = '';
  try {
    masterNodes.value = await fetchMasterTree();
  } catch (e: any) {
    masterError.value = e.message || '加载总谱失败';
  } finally {
    masterLoading.value = false;
  }
}

function onTabChange() {
  if (activeTab.value === 'master') {
    loadMasterTree();
  }
}

function goToPerson(node: MasterNode) {
  // 跳转到该人物在总谱中的详情
  uni.navigateTo({
    url: `/pages/person/detail?tree_id=zhonghua_shiben_01&handle=${node.handle}`,
  });
}

// 管理角色（tree_steward / chief_editor）显示角色管理入口
const canManage = computed(() => {
  if (!isAuthenticated()) return false;
  return authState.role === 'tree_steward' || authState.role === 'chief_editor';
});

onMounted(async () => {
  try {
    // 用远程数据源（auth-server → config/tree-meta.json），
    // 保证拆分/编辑后首页立即同步，不依赖静态副本
    meta.value = await fetchTreeMetaRemote();
    halls.value = Object.entries(meta.value.trees).map(([_, entry]) => ({
      tree_id: entry.tree_id,
      title: entry.display_title,
      surname: entry.surname_char,
      origin: entry.origin,
      description: entry.description,
      isMaster: !!entry.is_master,
      url: buildTreeUrl(entry.tree_id, meta.value!) || `/tree/${entry.tree_id}`,
    }));
  } catch (e) {
    console.error('加载元数据失败:', e);
  }
});

function goToHall(card: DigitalHallCard) {
  uni.navigateTo({ url: `/pages/hall/index?tree_id=${card.tree_id}` });
}

function goToPage(path: string) {
  uni.navigateTo({ url: path });
}

function goAuth() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function goWallet() {
  uni.navigateTo({ url: '/pages/wallet/index' });
}

function goAdmin() {
  uni.navigateTo({ url: '/pages/admin/index' });
}
</script>

<style scoped>
.container { padding: 20px; }
.header { text-align: center; margin-bottom: 30px; }
.header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.wallet-badge { padding: 6px 14px; background: #E8F5E9; border-radius: 16px; }
.wallet-text { font-size: 13px; color: #2E7D32; }
.admin-badge { padding: 6px 14px; background: #FFEBEE; border-radius: 16px; margin-left: 8px; }
.admin-text { font-size: 13px; color: #C62828; }
.auth-badge { padding: 6px 14px; background: #FFF3E0; border-radius: 16px; }
.auth-text { font-size: 13px; color: #8B4513; }
.title { font-size: 24px; font-weight: bold; display: block; }
.subtitle { font-size: 14px; color: #666; margin-top: 8px; display: block; }
.hall-list { display: flex; flex-direction: column; gap: 12px; }
.hall-list :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.empty { text-align: center; padding: 40px; color: #999; }
.master-desc { font-size: 12px; color: #8B4513; margin-left: 6px; }
.hall-title { font-size: 16px; margin-top: 4px; display: block; }
.hall-origin { font-size: 13px; color: #888; margin-top: 6px; display: block; }
.hall-desc { font-size: 14px; color: #555; margin-top: 4px; display: block; }
.empty { text-align: center; padding: 60px 0; color: #999; }
.footer { text-align: center; margin-top: 30px; }
.link { color: #8B4513; font-size: 14px; }

/* 双模式切换 */
.mode-tabs { margin-bottom: 12px; }

/* 总谱目录树 */
.master-view { background: #fff; border-radius: 12px; padding: 8px 0; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
.master-root {
  display: flex; align-items: center; padding: 14px 16px;
  background: linear-gradient(135deg, #3E2723, #6D4C41);
  border-radius: 12px; margin: 8px; color: #fff;
}
.root-icon { font-size: 22px; margin-right: 10px; }
.root-info { flex: 1; }
.root-title { font-size: 16px; font-weight: bold; display: block; }
.root-sub { font-size: 11px; color: #D7CCC8; display: block; margin-top: 2px; }
.root-arrow { font-size: 20px; color: #D7CCC8; }
.tree-branch { border-bottom: 1px solid #f5f0ea; }
.tree-branch:last-child { border-bottom: none; }
.branch-header {
  display: flex; align-items: center; padding: 12px 16px; cursor: pointer;
}
.branch-arrow {
  font-size: 12px; color: #8B4513; margin-right: 8px;
  transition: transform 0.2s; display: inline-block;
}
.branch-arrow.open { transform: rotate(90deg); }
.branch-name { flex: 1; font-size: 14px; color: #3E2723; font-weight: 500; }
.branch-count { font-size: 12px; color: #999; }
.branch-nodes { padding: 0 16px 8px 34px; }
.branch-node {
  display: flex; align-items: center; padding: 7px 0;
  border-bottom: 1px dashed #f0ebe4;
}
.branch-node:last-child { border-bottom: none; }
.node-dot { color: #8B4513; margin-right: 8px; font-size: 12px; }
.node-name { font-size: 13px; color: #555; }
.node-id { font-size: 11px; color: #B5A594; margin-left: 8px; }
</style>
