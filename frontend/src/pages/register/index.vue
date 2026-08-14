<template>
  <view class="container">
    <view class="card">
      <text class="logo">📖</text>
      <text class="title">注册账号</text>
      <text class="subtitle">手机号 + 验证码，无需密码</text>

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
            @enter="doRegister"
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
        <t-input
          @update:value="(v: any) => nickname = v"
          :value="nickname"
          :maxlength="30"
          placeholder="昵称（选填）"
          clearable
        />
        <t-button
          theme="primary"
          size="large"
          :loading="loading"
          :disabled="loading"
          block
          @click="doRegister"
        >
          注 册
        </t-button>
      </view>

      <view v-if="error" class="error">
        <text>{{ error }}</text>
      </view>

      <view class="tip">
        <text class="tip-text">
          注册即表示同意《用户协议》与《隐私政策》。新用户默认可浏览家谱资料，
          如需参与编辑请联系管理员升级权限。
        </text>
      </view>

      <view class="switch">
        <text class="switch-text" @click="goLogin">已有账号？去登录</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { sendSmsCode, registerByPhone } from '@/business/api';
import { setAuth } from '@/business/auth';

const phone = ref('');
const code = ref('');
const nickname = ref('');
const loading = ref(false);
const error = ref('');
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

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

async function doRegister() {
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
    const res = await registerByPhone(phone.value, code.value, nickname.value);
    setAuth({
      phone: res.phone,
      nickname: res.nickname,
      role: res.role,
      token: res.token,
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000 - 60_000,
    });
    uni.showToast({ title: '注册成功', icon: 'success' });
    setTimeout(() => {
      uni.redirectTo({ url: '/pages/index/index' });
    }, 800);
  } catch (e: any) {
    error.value = e.message || '注册失败';
  } finally {
    loading.value = false;
  }
}

function goLogin() {
  uni.navigateBack();
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
.tip { margin-top: 18px; padding: 12px; background: #FFF8E1; border-radius: 8px; }
.tip-text { font-size: 12px; color: #8A7A6A; line-height: 1.6; display: block; }
.switch { text-align: center; margin-top: 16px; }
.switch-text { color: #8B4513; font-size: 14px; }
</style>
