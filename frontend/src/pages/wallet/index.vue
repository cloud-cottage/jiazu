<template>
  <view class="container">
    <!-- 余额卡片 -->
    <view class="balance-card">
      <text class="balance-label">我的余额</text>
      <text class="balance-value">¥{{ wallet?.user_balance_yuan || '0.00' }}</text>
      <text class="balance-hint">新建家族树费用：¥{{ wallet?.tree_create_fee_yuan || '9.90' }}</text>
    </view>

    <view v-if="!isAuthenticated()" class="not-logged">
      <text>请先登录后使用钱包功能</text>
      <button class="btn-login" @click="goLogin">去登录</button>
    </view>

    <template v-else>
      <!-- 操作区 -->
      <view class="section">
        <text class="section-title">充值</text>
        <view class="row">
          <input v-model="rechargeAmount" class="input" type="digit" placeholder="金额（元）" />
          <button class="btn-primary" :disabled="busy" @click="doRecharge">充值</button>
        </view>
        <text class="dev-tip">开发阶段模拟充值，上线后接入微信支付</text>
      </view>

      <view class="section">
        <text class="section-title">转账到家族树</text>
        <view class="row">
          <input v-model="transferTree" class="input input-tree" placeholder="家族树 ID（如 gu_39038_01）" />
          <input v-model="transferAmount" class="input input-amt" type="digit" placeholder="金额" />
          <button class="btn-primary" :disabled="busy" @click="doTransfer">转账</button>
        </view>
        <view v-if="transferResult" class="transfer-result">
          <text>{{ transferResult }}</text>
        </view>
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
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchWallet,
  rechargeWallet,
  transferToTree,
} from '@/business/api';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import type { WalletOverview } from '@/business/api';

const wallet = ref<WalletOverview | null>(null);
const rechargeAmount = ref('');
const transferTree = ref('');
const transferAmount = ref('');
const transferResult = ref('');
const busy = ref(false);
const error = ref('');

onLoad((options: any) => {
  // 从家族树主页跳转时预填 tree_id
  if (options?.tree_id) {
    transferTree.value = options.tree_id;
  }
});

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

async function doTransfer() {
  const amount = Number(transferAmount.value);
  if (!transferTree.value.trim() || !amount || amount <= 0) {
    error.value = '请输入家族树 ID 和正确金额';
    return;
  }
  busy.value = true;
  error.value = '';
  transferResult.value = '';
  try {
    const res = await transferToTree(getAuthToken(), transferTree.value.trim(), amount);
    transferResult.value = `转账成功：树余额 ¥${res.tree_balance_yuan}`;
    transferAmount.value = '';
    await loadWallet();
  } catch (e: any) {
    error.value = e.message || '转账失败';
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
.btn-login {
  margin-top: 14px; height: 40px; line-height: 40px;
  background: #8B4513; color: #fff; border-radius: 8px; font-size: 15px;
}
.section {
  background: #fff; border-radius: 12px; padding: 16px;
  margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.section-title { font-size: 15px; font-weight: bold; color: #3E2723; display: block; margin-bottom: 12px; }
.row { display: flex; gap: 8px; align-items: center; }
.input {
  flex: 1; height: 40px; border: 1px solid #E0D5C8; border-radius: 8px;
  padding: 0 12px; font-size: 14px; background: #FBF8F4;
}
.input-tree { flex: 2; }
.input-amt { flex: 1; }
.btn-primary {
  height: 40px; line-height: 40px; padding: 0 16px;
  background: #8B4513; color: #fff; font-size: 14px; border-radius: 8px;
  flex-shrink: 0;
}
.btn-primary[disabled] { opacity: 0.6; }
.dev-tip { font-size: 11px; color: #B5A594; margin-top: 8px; display: block; }
.transfer-result { margin-top: 10px; color: #2E7D32; font-size: 13px; }
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
