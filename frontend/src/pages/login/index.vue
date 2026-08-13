<template>
  <view class="container">
    <view class="card">
      <text class="logo">📖</text>
      <text class="title">家族历史数字馆</text>
      <text class="subtitle">手机号登录</text>

      <view class="form">
        <view class="phone-row">
          <input
            v-model="phone"
            class="input"
            type="number"
            maxlength="11"
            placeholder="手机号"
            placeholder-class="ph"
          />
        </view>
        <view class="code-row">
          <input
            v-model="code"
            class="input"
            type="number"
            maxlength="6"
            placeholder="验证码"
            placeholder-class="ph"
            @confirm="doLogin"
          />
          <text
            class="send-btn"
            :class="{ disabled: countdown > 0 }"
            @click="doSendCode"
          >
            {{ countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
          </text>
        </view>
        <button class="btn" :disabled="loading" @click="doLogin">
          {{ loading ? '登录中...' : '登 录' }}
        </button>
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
    // 开发阶段：auth-server 返回 dev_code，直接填入方便调试
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
.form { display: flex; flex-direction: column; gap: 14px; }
.input {
  height: 44px; border: 1px solid #E0D5C8; border-radius: 8px;
  padding: 0 14px; font-size: 15px; background: #FBF8F4; flex: 1;
}
.ph { color: #C4B5A5; }
.code-row { display: flex; gap: 10px; align-items: center; }
.send-btn {
  flex-shrink: 0; height: 44px; line-height: 44px; padding: 0 14px;
  font-size: 13px; color: #8B4513; background: #FFF3E0;
  border-radius: 8px; text-align: center;
}
.send-btn.disabled { color: #C4B5A5; background: #F5F0EA; }
.btn {
  height: 44px; background: #8B4513; color: #fff; font-size: 16px;
  border-radius: 8px; line-height: 44px; margin-top: 4px;
}
.btn[disabled] { opacity: 0.6; }
.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }
.switch { text-align: center; margin-top: 18px; }
.switch-text { color: #8B4513; font-size: 14px; }
</style>
