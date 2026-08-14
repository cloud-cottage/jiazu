<template>
  <view class="container">
    <view class="card">
      <text class="logo">📖</text>
      <text class="title">家族历史数字馆</text>
      <text class="subtitle">手机号登录</text>

      <view class="form">
        <t-input
          @update:value="(v: any) => phone = v"
          :value="phone"
          type="number"
          :maxlength="11"
          placeholder="手机号"
          clearable
        />
        <view class="code-row">
          <t-input
            @update:value="(v: any) => code = v"
            :value="code"
            type="number"
            :maxlength="6"
            placeholder="验证码"
            clearable
            @enter="doLogin"
          />
          <t-button
            class="send-btn"
            size="small"
            variant="outline"
            theme="primary"
            :disabled="countdown > 0"
            @click="doSendCode"
          >
            {{ countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
          </t-button>
        </view>
        <t-button
          theme="primary"
          size="large"
          :loading="loading"
          :disabled="loading"
          block
          @click="doLogin"
        >
          登 录
        </t-button>
      </view>

      <view v-if="error" class="error">
        <text>{{ error }}</text>
      </view>

      <view class="switch">
        <text class="switch-text" @click="goRegister">没有账号？立即注册</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { sendSmsCode, loginByPhone } from '@/business/api';
import { setAuth, authState } from '@/business/auth';

const phone = ref('');
const code = ref('');
const loading = ref(false);
const error = ref('');
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

onLoad(() => {
  if (authState.loggedIn && authState.phone) {
    phone.value = authState.phone;
  }
});

function isValidPhone(p: string): boolean {
  return /^1\d{10}$/.test(p);
}

async function doSendCode() {
  if (countdown.value > 0) return;
  if (!isValidPhone(phone.value)) {
    error.value = '请输入正确的 11 位手机号';
    return;
  }
  error.value = '';
  try {
    const res = await sendSmsCode(phone.value);
    if (res.dev_code) {
      code.value = res.dev_code;
      uni.showToast({ title: `验证码: ${res.dev_code}`, icon: 'none' });
    } else {
      uni.showToast({ title: '验证码已发送', icon: 'success' });
    }
    countdown.value = 60;
    timer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    }, 1000);
  } catch (e: any) {
    error.value = e.message || '发送失败';
  }
}

async function doLogin() {
  if (!isValidPhone(phone.value)) {
    error.value = '请输入正确的手机号';
    return;
  }
  if (!code.value) {
    error.value = '请输入验证码';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await loginByPhone(phone.value, code.value);
    setAuth({
      phone: res.phone,
      nickname: res.nickname,
      role: res.role,
      token: res.token,
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000 - 60_000,
    });
    uni.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        uni.navigateBack();
      } else {
        uni.redirectTo({ url: '/pages/index/index' });
      }
    }, 800);
  } catch (e: any) {
    error.value = e.message || '登录失败';
  } finally {
    loading.value = false;
  }
}

function goRegister() {
  uni.navigateTo({ url: '/pages/register/index' });
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(160deg, #3E2723 0%, #6D4C41 100%);
}
.card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 16px;
  padding: 32px 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}
.logo { font-size: 44px; display: block; text-align: center; }
.title { font-size: 20px; font-weight: bold; color: #3E2723; display: block; text-align: center; margin-top: 8px; }
.subtitle { font-size: 13px; color: #999; display: block; text-align: center; margin: 6px 0 20px; }
.form { display: flex; flex-direction: column; gap: 16px; }
.code-row { display: flex; gap: 10px; align-items: center; }
.code-row :deep(.t-input) { flex: 1; }
.send-btn { flex-shrink: 0; }
.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }
.switch { text-align: center; margin-top: 18px; }
.switch-text { color: #8B4513; font-size: 14px; }
</style>
