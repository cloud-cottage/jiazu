<template>
  <view class="container">
    <!-- 余额卡片 -->
    <view class="balance-card">
      <text class="balance-label">我的余额</text>
      <text class="balance-value">¥{{ wallet?.user_balance_yuan || '0.00' }}</text>
      <text class="balance-hint">余额仅用于购买官方竹简</text>
      <text class="balance-hint">新建家族树消耗 {{ TREE_CREATE_FEE_SEEDS }}颗石榴籽</text>
    </view>

    <view v-if="!isAuthenticated()" class="not-logged">
      <text>请先登录后使用钱包功能</text>
      <t-button theme="primary" block class="btn-login" @click="goLogin">去登录</t-button>
    </view>

    <template v-else>
      <!-- 竹简市集入口（官方竹简 ¥9.90/束 · 每日 21:00 限量） -->
      <view class="section entry" @click="goMarket">
        <view class="entry-left">
          <text class="entry-title">🏪 竹简市集</text>
          <text class="entry-desc">官方竹简 ¥9.90/束 · 每日 21:00 限量</text>
        </view>
        <text class="entry-arrow">›</text>
      </view>

      <!-- 操作区 -->
      <view class="section">
        <text class="section-title">充值</text>
        <view class="row">
          <t-input
            @update:value="(v: any) => rechargeAmount = v"
            :value="rechargeAmount"
            type="number"
            placeholder="金额（元）"
            clearable
            class="input"
          />
          <t-button theme="primary" :loading="busy" :disabled="busy" @click="doRecharge">
            充值
          </t-button>
        </view>
        <text class="dev-tip">开发阶段模拟充值，上线后接入微信支付</text>
      </view>

      <!-- 交易流水 -->
      <view class="section">
        <text class="section-title">交易流水</text>
        <view v-if="!wallet?.transactions?.length" class="empty">
          <text>暂无交易记录</text>
        </view>
        <view v-for="t in wallet?.transactions || []" :key="t.id" class="tx-item">
          <view class="tx-left">
            <text class="tx-desc">{{ t.desc }}</text>
            <text class="tx-time">{{ formatTime(t.ts) }}</text>
          </view>
          <text class="tx-amount" :class="{ minus: t.amount_cents < 0 }">
            {{ t.amount_cents >= 0 ? '+' : '' }}{{ (t.amount_cents / 100).toFixed(2) }}
          </text>
        </view>
      </view>
    </template>

    <view v-if="error" class="error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  fetchWallet,
  rechargeWallet,
} from '@/business/api';
import { isAuthenticated, getAuthToken } from '@/business/auth';
import type { WalletOverview } from '@/business/api';

/**
 * 建树费籽数（石榴籽）。
 * 展示口径（用户拍板）：一律写「9颗石榴籽」——不带空格、不带「完整」二字，与 8.4 定稿确认弹窗逐字一致。
 * 规格依据：`docs/economy.spec.md` §9 前端落点表（钱包行）建树费由人民币金额改为按石榴籽计；
 * 单价真源：`cloudfunctions/compat-api/lib/economy-fee.js` 的 `FEE.tree_create_seeds: 9`
 * （前端无可读接口，故以命名常量承载，勿在模板里散写数字）。
 */
const TREE_CREATE_FEE_SEEDS = 9;

const wallet = ref<WalletOverview | null>(null);
const rechargeAmount = ref('');
const busy = ref(false);
const error = ref('');

onMounted(async () => {
  await loadWallet();
});

async function loadWallet() {
  if (!isAuthenticated()) return;
  try {
    wallet.value = await fetchWallet(getAuthToken());
  } catch (e: any) {
    error.value = e.message || '加载钱包失败';
  }
}

async function doRecharge() {
  const amount = Number(rechargeAmount.value);
  if (!amount || amount <= 0) {
    error.value = '请输入正确的充值金额';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const res = await rechargeWallet(getAuthToken(), amount);
    uni.showToast({ title: `充值成功：¥${res.balance_yuan}`, icon: 'success' });
    rechargeAmount.value = '';
    await loadWallet();
  } catch (e: any) {
    error.value = e.message || '充值失败';
  } finally {
    busy.value = false;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

/** 竹简市集（官方竹简购买 / 挂单买卖；pages.json 已注册 pages/market/index） */
function goMarket() {
  uni.navigateTo({ url: '/pages/market/index' });
}
</script>

<style scoped>
.container { padding: 20px; }
.balance-card {
  background: linear-gradient(135deg, #8B4513, #A66B32);
  border-radius: 14px;
  padding: 24px 20px;
  color: #fff;
  margin-bottom: 20px;
}
.balance-label { font-size: 13px; color: #E8D5C0; display: block; }
.balance-value { font-size: 34px; font-weight: bold; display: block; margin: 8px 0; }
.balance-hint { font-size: 12px; color: #E8D5C0; display: block; }
.not-logged { text-align: center; padding: 40px 0; color: #999; }
.btn-login { margin-top: 14px; }
.section {
  background: #fff; border-radius: 12px; padding: 16px;
  margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.section-title { font-size: 15px; font-weight: bold; color: #3E2723; display: block; margin-bottom: 12px; }
.row { display: flex; gap: 8px; align-items: center; }
.row .input { flex: 1; }
.dev-tip { font-size: 11px; color: #B5A594; margin-top: 8px; display: block; }
.entry { display: flex; align-items: center; justify-content: space-between; }
.entry-left { flex: 1; }
.entry-title { font-size: 15px; font-weight: bold; color: #3E2723; display: block; }
.entry-desc { font-size: 12px; color: #B5A594; display: block; margin-top: 4px; }
.entry-arrow { font-size: 20px; color: #B5A594; }
.empty { text-align: center; color: #999; padding: 20px; font-size: 13px; }
.tx-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-bottom: 1px solid #f5f0ea;
}
.tx-item:last-child { border-bottom: none; }
.tx-left { flex: 1; }
.tx-desc { font-size: 14px; color: #555; display: block; }
.tx-time { font-size: 11px; color: #B5A594; margin-top: 2px; display: block; }
.tx-amount { font-size: 15px; font-weight: bold; color: #2E7D32; }
.tx-amount.minus { color: #C62828; }
.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }
</style>
