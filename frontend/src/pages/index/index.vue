<template>
  <view class="container">
    <view class="header">
      <view class="header-top">
        <view class="header-left">
          <!-- 登录后显示钱包入口 -->
          <view v-if="isAuthenticated()" class="wallet-badge" @click="goWallet">
            <text class="wallet-text">💰 我的钱包</text>
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

    <view class="hall-list">
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

    <view class="footer">
      <text class="link" @click="goToPage('/pages/about/about')">关于本站 · 免责声明</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchTreeMetaRemote, buildTreeUrl } from '@/business';
import { isAuthenticated, authState } from '@/business/auth';
import type { DigitalHallCard, TreeMeta } from '@/business/types';

const halls = ref<DigitalHallCard[]>([]);

onMounted(async () => {
  try {
    // 用远程数据源（auth-server → config/tree-meta.json），
    // 保证拆分/编辑后首页立即同步，不依赖静态副本
    const meta: TreeMeta = await fetchTreeMetaRemote();
    halls.value = Object.entries(meta.trees).map(([_, entry]) => ({
      tree_id: entry.tree_id,
      title: entry.display_title,
      surname: entry.surname_char,
      origin: entry.origin,
      description: entry.description,
      isMaster: !!entry.is_master,
      url: buildTreeUrl(entry.tree_id, meta) || `/tree/${entry.tree_id}`,
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
</script>

<style scoped>
.container { padding: 20px; }
.header { text-align: center; margin-bottom: 30px; }
.header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.wallet-badge { padding: 6px 14px; background: #E8F5E9; border-radius: 16px; }
.wallet-text { font-size: 13px; color: #2E7D32; }
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
</style>
