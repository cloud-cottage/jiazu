<template>
  <view class="fi-page">
    <view class="fi-head">
      <view class="fi-title-mark" />
      <text class="fi-title">邀请好友</text>
    </view>
    <text class="fi-hint">
      填写对方的手机号即可发出好友邀请。<text class="fi-hint-strong">对方注册时填入你的手机号即建立好友关系</text>；
      同意后关系生效，双方各得一份有效期。
    </text>

    <view class="fi-card">
      <text class="fi-label">对方手机号</text>
      <t-input
        :value="to"
        placeholder="请输入 11 位手机号"
        class="fi-input"
        @update:value="onToChange"
        @confirm="submit"
      />
      <view
        class="fi-btn"
        :class="{ 'fi-btn-off': !canSubmit || busy, 'is-busy': busy }"
        @click="submit"
      >
        <text class="fi-btn-text">{{ busy ? '提交中…' : '发起邀请' }}</text>
      </view>
      <text v-if="!canSubmit" class="fi-reason">{{ reasonText }}</text>
    </view>

    <text v-if="okText" class="fi-ok">{{ okText }}</text>
    <text v-if="errText" class="fi-err">{{ errText }}</text>

    <view v-if="okText" class="fi-acts">
      <t-button size="small" theme="primary" @click="goList">去好友列表</t-button>
    </view>

    <text class="fi-note">
      日限与防刷限制由服务端判定：若被拒绝，此处会如实显示服务端返回的原因。
    </text>
  </view>
</template>

<script setup lang="ts">
/**
 * 邀请好友（子包 `pages/friend` —— **不进主包 pages**）。
 *
 * 口径：入参手机号是**唯一**需要明文的一方（后端仅据此建关系）；前端只做「11 位数字」这一层
 * 未达标三态（按钮禁用 + 原因文案），**日限 / 防刷 / 重复邀请等一律由后端判**，页面只如实展示
 * 后端返回的失败文案（`friendErrorText`），不自造提示、不吞错误。
 */
import { computed, ref } from 'vue';
import { isAuthenticated } from '@/business/auth';
import { friendDate, friendErrorText, isFriendUnauthorized, sendFriendInvite } from '@/business/friends';

const to = ref('');
const busy = ref(false);
const okText = ref('');
const errText = ref('');

/** 未达标判据：11 位数字（后端仍会再校一次，此处只为给出按钮的三态与原因） */
const canSubmit = computed(() => /^\d{11}$/.test(to.value.trim()));
const reasonText = computed(() =>
  to.value.trim() ? '请输入 11 位手机号' : '请先填写对方手机号');

function onToChange(value: string): void {
  to.value = value;
  errText.value = '';
  okText.value = '';
}

async function submit(): Promise<void> {
  if (busy.value) return;
  if (!canSubmit.value) {
    uni.showToast({ title: reasonText.value, icon: 'none' });
    return;
  }
  if (!isAuthenticated()) {
    errText.value = '未登录或登录已过期';
    uni.navigateTo({ url: '/pages/login/index' });
    return;
  }
  busy.value = true;
  okText.value = '';
  errText.value = '';
  try {
    const res = await sendFriendInvite(to.value.trim());
    const invite = (res.data.invite || {}) as { to_masked?: string; expires_at?: string };
    okText.value = `${res.message}：${invite.to_masked || '对方'}（邀请有效至 ${friendDate(invite.expires_at || '')}）`;
    to.value = '';
    uni.showToast({ title: res.message, icon: 'none', duration: 3000 });
  } catch (e) {
    errText.value = friendErrorText(e, '邀请发送失败');
    uni.showToast({ title: errText.value, icon: 'none', duration: 3000 });
    if (isFriendUnauthorized(e)) uni.navigateTo({ url: '/pages/login/index' });
  } finally {
    busy.value = false;
  }
}

function goList(): void {
  uni.navigateTo({ url: '/pages/friend/list/index' });
}
</script>

<style scoped>
.fi-page { padding: 16px; padding-bottom: 40px; }
.fi-head { display: flex; align-items: center; }
.fi-title-mark {
  width: 4px; height: 15px; border-radius: 2px; margin-right: 8px;
  background: linear-gradient(180deg, #A8322D, #8B4513);
}
.fi-title { font-size: 16px; font-weight: bold; color: #3E2723; letter-spacing: 2px; }
.fi-hint { display: block; font-size: 11px; color: #B5A594; line-height: 1.7; margin: 8px 0 12px; }
.fi-hint-strong { color: #8B4513; font-weight: bold; }

.fi-card {
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE; border-radius: 12px; padding: 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.fi-label { display: block; font-size: 12px; color: #8B4513; margin-bottom: 8px; }
.fi-input { margin-bottom: 12px; }
.fi-btn {
  padding: 8px 0; border-radius: 8px; text-align: center;
  background: linear-gradient(180deg, #EFA9B4, #C4747F);
  border: 1px solid #C4747F;
}
.fi-btn-off { background: #F2EFEA; border-color: #E6E0D8; }
.fi-btn-text { font-size: 14px; color: #FFF6F8; }
.fi-btn-off .fi-btn-text { color: #B0A79C; }
.fi-btn.is-busy { opacity: 0.7; }
.fi-reason { display: block; font-size: 11px; color: #B08D57; margin-top: 8px; }

.fi-ok { display: block; font-size: 12px; color: #2E7D32; margin-top: 12px; line-height: 1.7; }
.fi-err { display: block; font-size: 12px; color: #C62828; margin-top: 12px; line-height: 1.7; }
.fi-acts { display: flex; gap: 10px; margin-top: 12px; }
.fi-note { display: block; font-size: 11px; color: #B5A594; margin-top: 16px; line-height: 1.7; }
</style>
