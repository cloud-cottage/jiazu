<template>
  <view class="fd-page">
    <view class="fd-head">
      <view class="fd-head-left">
        <view class="fd-title-mark" />
        <text class="fd-title">好友</text>
      </view>
      <t-button size="small" theme="primary" @click="goInvite">邀请好友</t-button>
    </view>
    <text class="fd-hint">
      好友关系有有效期：到期前进入续约窗口后可发起续约，对方确认后双方各消耗 1 张兰帖、有效期一并延长。
      到期后进入缓冲期，缓冲期内仍可解除好友。任何时候均可单方【解除好友】：关系立即终止、已消耗的兰帖不返还、历史奖励保留不追回。
    </text>

    <!-- 未登录 -->
    <view v-if="!authed" class="fd-empty">
      <text class="fd-empty-text">登录后查看你的好友</text>
      <t-button size="small" theme="primary" @click="goLogin">去登录</t-button>
    </view>

    <!-- 取数失败（后端文案原样） -->
    <view v-else-if="loadError" class="fd-empty">
      <text class="fd-empty-text fd-err">{{ loadError }}</text>
      <t-button size="small" @click="load">重试</t-button>
    </view>

    <view v-else-if="loading" class="fd-empty">
      <t-loading theme="spinner" text="加载中…" />
    </view>

    <template v-else>
      <view v-for="g in groups" :key="g.key" class="fd-group">
        <view v-if="g.items.length" class="fd-group-head">
          <text class="fd-group-title">{{ g.title }}</text>
          <text class="fd-group-count">{{ g.items.length }}</text>
        </view>
        <view v-for="r in g.items" :key="r.relation_token" class="fd-card">
          <view class="fd-card-head">
            <text class="fd-name">{{ peerName(r) }}</text>
            <text class="fd-status" :class="`fd-status-${r.status}`">{{ friendStatusText(r) }}</text>
          </view>
          <text class="fd-line fd-line-sub">{{ peerNumber(r) }}</text>
          <text class="fd-line">{{ friendExpiryLine(r) }}</text>
          <text class="fd-line">{{ friendRewardLine(r) }}</text>
          <text v-if="waitLine(r)" class="fd-line fd-line-wait">{{ waitLine(r) }}</text>
          <text v-if="lockLine(r)" class="fd-line fd-line-lock">{{ lockLine(r) }}</text>

          <view v-if="rowActions(r, nowMs).length" class="fd-acts">
            <view
              v-for="a in rowActions(r, nowMs)"
              :key="a.key"
              class="fd-btn"
              :class="{
                'fd-btn-primary': a.primary && !a.disabled,
                'fd-btn-off': a.disabled,
                'is-busy': busyToken === r.relation_token,
              }"
              @click="onAction(r, a)"
            >
              <text class="fd-btn-text">{{ a.label }}</text>
            </view>
            <text v-if="disabledReason(r)" class="fd-reason">{{ disabledReason(r) }}</text>
          </view>

          <text v-if="doneOf(r)" class="fd-done">{{ doneOf(r) }}</text>
          <text v-if="errOf(r)" class="fd-err">{{ errOf(r) }}</text>
        </view>
      </view>

      <view v-if="total === 0" class="fd-empty">
        <text class="fd-empty-text">还没有好友：邀请好友后，对方在列表里接受即建立关系</text>
        <t-button size="small" theme="primary" @click="goInvite">邀请好友</t-button>
      </view>
    </template>

    <!--
      解除好友二次确认层（**自绘**，遮罩 z-index **1010** / 面板 1011）—— 恒高于 `uni` 弹窗
      （`.uni-modal` 999）与页面既有遮罩（`.som-mask` 1000）⇒ **不得改用 `uni.showModal`**。
      文案逐字取 `business/friends.ts` 的 `DISSOLVE_CONFIRM_*`（写明后果：立即终止 / 不返还已消耗兰帖 /
      历史奖励不追回）；生效中（active）与缓冲期（grace）的【解除好友】共用本层，待邀请态走【取消邀请】不受影响。
    -->
    <view v-if="dissolveConfirm" class="fd-cfm-mask" @click.stop="closeDissolveConfirm">
      <view class="fd-cfm" @click.stop>
        <view class="fd-cfm-ribbon" />
        <text class="fd-cfm-title">{{ dissolveTitle }}</text>
        <text class="fd-cfm-peer">对象：{{ dissolveConfirm.name }}</text>
        <text v-for="(line, li) in dissolveLines" :key="li" class="fd-cfm-body">{{ line }}</text>
        <view class="fd-cfm-acts">
          <view class="fd-cfm-btn" @click.stop="closeDissolveConfirm">
            <text class="fd-cfm-btn-text">取消</text>
          </view>
          <view class="fd-cfm-btn ok" @click.stop="confirmDissolve">
            <text class="fd-cfm-btn-text">{{ dissolveOkText }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 好友列表（子包 `pages/friend` —— **不进主包 pages**）。
 *
 * 页面只做渲染与事件转发；分组 / 文案 / 按钮三态判据全在 `business/friends.ts`（跨端纯逻辑）。
 * 口径要点：
 * - 三态分组（待邀请 / 生效中 / 到期缓冲期）由 `groupFriends` 给出；
 * - 续约按钮**仅在窗口开启时可用**，未开窗时禁用并显示后端口径的原因文案（点按也会 toast 同一句 ⇒ 不静默）；
 * - 每条操作三态可见：未达标（禁用 + 原因）/ 可操作（按钮）/ 已完成（后端回执文案）；
 * - 失败一律显示后端 `error.message` 原文（不吞、不自造）；
 * - `relation_token` 只透传（作为 key 与请求入参），不解析、不依赖其结构。
 */
import { computed, onUnmounted, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { isAuthenticated } from '@/business/auth';
import { SCROLL_LOCK_TEXT } from '@/business/asset-text';
import {
  DISSOLVE_CONFIRM_LINES,
  DISSOLVE_CONFIRM_OK_TEXT,
  DISSOLVE_CONFIRM_TITLE,
  fetchFriends,
  friendErrorText,
  friendExpiryLine,
  friendRewardLine,
  friendStatusText,
  groupFriends,
  isFriendUnauthorized,
  rowActions,
  runFriendAction,
  type FriendAction,
  type FriendRelation,
} from '@/business/friends';

const authed = ref(false);
const loading = ref(false);
const loadError = ref('');
const friends = ref<FriendRelation[]>([]);
const busyToken = ref('');
/** 每行的操作回执（已完成态文案）与失败文案（键 = relation_token，只透传不当标识语义用） */
const doneText = ref<Record<string, string>>({});
const errText = ref<Record<string, string>>({});
/**
 * 「现在」的**响应式**读数（按钮三态判据用；**不进任何请求参数**）。
 *
 * 旧实现 = `const nowMs = Date.now()`（setup 里只取一次、非响应式）⇒ 页面**驻留**跨过续约开窗时刻时，
 * 【发起续约】不会自动转为可操作、「还有 N 天」定格，必须重进页面才刷新。
 * 现修 = `ref` + **轻量定时器**（按 `NOW_TICK_MS` 节拍重取）+ `onShow` 入口重取；`onHide` 与**卸载时清理定时器**。
 *
 * 方案取舍（为何不用「只靠 `onShow` 重取」）：`onShow` 只在**进页面 / 从后台回前台**时触发 ——
 * 用户**盯着本页**跨过开窗时刻的那条路径它覆盖不到，而低危项症状正是这条；判据是**天级**（开窗时刻 /
 * 剩余天数），30s 节拍顶多让「定格」滞后 30s，且只写一个 `ref`（无请求、无副作用）；`onHide` 停表
 * 避免后台空转，卸载清理确保不泄漏（小程序端页面实例可能长期驻留，`onUnmounted` 与 `onHide` 双保险）。
 */
const nowMs = ref(Date.now());
/** 「现在」的刷新节拍（ms）—— 天级判据 ⇒ 30s 足够；只重取时间戳，不发任何请求 */
const NOW_TICK_MS = 30000;
let nowTimer: ReturnType<typeof setInterval> | null = null;

function startNowTimer(): void {
  if (nowTimer) return;
  nowTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, NOW_TICK_MS);
}

/** 停表（`onHide` 与卸载共用）：**必须清理**，否则页面卸载后定时器继续跑（引用泄漏 + 无谓重渲染） */
function stopNowTimer(): void {
  if (!nowTimer) return;
  clearInterval(nowTimer);
  nowTimer = null;
}

/**
 * 解除好友二次确认层状态（`null` = 关闭）—— **自绘层，禁用 `uni.showModal`**（其 `.uni-modal` z-index 999
 * 低于页面既有遮罩 `.som-mask` 1000，会被压住）。携带对端名（让确认对象可见）与点击那一刻的按钮快照。
 */
const dissolveConfirm = ref<{ token: string; name: string; action: FriendAction } | null>(null);
/** 确认层文案（逐字取 `business/friends.ts` 单点，页面不另写一份） */
const dissolveTitle = DISSOLVE_CONFIRM_TITLE;
const dissolveLines = DISSOLVE_CONFIRM_LINES;
const dissolveOkText = DISSOLVE_CONFIRM_OK_TEXT;

const groups = computed(() => groupFriends(friends.value));
const total = computed(() => friends.value.length);

/** 对端名称 / 脱敏号（两者都要展示：出参无明文手机号，只有脱敏串） */
function peerName(r: FriendRelation): string {
  return r.friend?.nickname || '未设置昵称';
}
function peerNumber(r: FriendRelation): string {
  return r.friend?.phone_masked || '—';
}
function waitLine(r: FriendRelation): string {
  if (!r.pending) return '';
  if (r.pending.kind === 'renew') {
    return r.pending.initiated_by_me
      ? '续约申请待对方确认'
      : '对方发起续约申请，待你确认';
  }
  return r.pending.initiated_by_me ? '邀请待对方接受' : '邀请待你处理';
}
/** 本人发起、待对方确认的续约申请 ⇒ 那张兰帖在行囊里处于锁定态（文案单点 = business/asset-text.ts） */
function lockLine(r: FriendRelation): string {
  const p = r.pending;
  return p && p.kind === 'renew' && p.locked && p.locked.by_me ? SCROLL_LOCK_TEXT : '';
}
/** 未达标原因（该行任一禁用按钮的原因，逐字来自 business/friends.ts；判据时间 = 响应式 `nowMs`） */
function disabledReason(r: FriendRelation): string {
  return rowActions(r, nowMs.value).find((a: FriendAction) => a.disabled)?.reason || '';
}
function doneOf(r: FriendRelation): string {
  return doneText.value[r.relation_token] || '';
}
function errOf(r: FriendRelation): string {
  return errText.value[r.relation_token] || '';
}

async function load(): Promise<void> {
  authed.value = isAuthenticated();
  if (!authed.value) {
    friends.value = [];
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const payload = await fetchFriends();
    friends.value = payload.friends;
  } catch (e) {
    loadError.value = friendErrorText(e, '好友列表获取失败');
    if (isFriendUnauthorized(e)) authed.value = false;
  } finally {
    loading.value = false;
    busyToken.value = '';
  }
}

async function onAction(r: FriendRelation, a: FriendAction): Promise<void> {
  // 未达标：直出原因（不静默、不假装成功）
  if (a.disabled) {
    uni.showToast({ title: a.reason || '当前不可操作', icon: 'none' });
    return;
  }
  // 解除好友 = **破坏性且不可逆**（需求原文：关系直接终止、不返还已消耗的兰帖、历史奖励保留不追回）
  // ⇒ **恒先开自绘二次确认层**（遮罩 1010），确认后才发请求。待邀请态走【取消邀请】，不经过本分支。
  if (a.key === 'dissolve') {
    if (busyToken.value) return;
    openDissolveConfirm(r, a);
    return;
  }
  await submitAction(r, a);
}

/** 真正提交一条关系操作（二次确认后调用；三态回执 / 失败文案口径与既有实现一致） */
async function submitAction(r: FriendRelation, a: FriendAction): Promise<void> {
  if (busyToken.value) return;
  busyToken.value = r.relation_token;
  const token = r.relation_token;
  doneText.value[token] = '';
  errText.value[token] = '';
  try {
    const res = await runFriendAction(a.key, token);
    doneText.value[token] = res.message;
    uni.showToast({ title: res.message, icon: 'none', duration: 3000 });
    friends.value = (await fetchFriends()).friends;
  } catch (e) {
    const msg = friendErrorText(e, `${a.label}失败`);
    errText.value[token] = msg;
    uni.showToast({ title: msg, icon: 'none', duration: 3000 });
    if (isFriendUnauthorized(e)) authed.value = false;
  } finally {
    busyToken.value = '';
  }
}

/**
 * 打开解除确认层（先关旧层 ⇒ 连点不叠层；并清掉该行上一次的错误文案）。
 *
 * ⚠️ 口径说明：需求里的「先 `closeTip()` 再弹窗」针对的是**行囊属性提示层**（1010）与 `.uni-modal`（999）
 * 的层序冲突；**本页没有属性提示层** ⇒ 该「先关」动作在本页无对应物。本层自绘于 **1010 / 1011**、
 * 恒高于页面既有遮罩（`.som-mask` 1000）与 `uni` 弹窗（999），**全程不调 `uni.showModal`**。
 */
function openDissolveConfirm(r: FriendRelation, a: FriendAction): void {
  closeDissolveConfirm();
  errText.value[r.relation_token] = '';
  dissolveConfirm.value = { token: r.relation_token, name: peerName(r), action: a };
}

/** 取消：零状态变更、零请求（不返还 / 不追回语义只在确认后生效） */
function closeDissolveConfirm(): void {
  dissolveConfirm.value = null;
}

/**
 * 确认解除：先复核该关系仍在当前列表内（列表已刷新 / 关系已消失 ⇒ 明确文案 + 重拉，**不静默**），
 * 再提交后端。失败走 `submitAction` 既有失败分支（后端 `error.message` 原样显示 + toast）。
 */
function confirmDissolve(): void {
  const target = dissolveConfirm.value;
  closeDissolveConfirm();
  if (!target) return;
  const rel = friends.value.find((x) => x.relation_token === target.token);
  if (!rel) {
    const msg = '该好友关系已变化，请刷新列表后重试';
    errText.value[target.token] = msg;
    uni.showToast({ title: msg, icon: 'none', duration: 3000 });
    void load();
    return;
  }
  void submitAction(rel, target.action);
}

function goInvite(): void {
  uni.navigateTo({ url: '/pages/friend/invite/index' });
}
function goLogin(): void {
  uni.navigateTo({ url: '/pages/login/index' });
}

/**
 * 页面显示：① **重取「现在」**（切页回来立刻是当前时刻，不等定时器节拍 —— 低危项修复的入口重取）；
 * ② 启动节拍定时器（页面驻留期间自动翻转三态）；③ 拉取好友列表（原有行为不变）。
 */
onShow(() => {
  nowMs.value = Date.now();
  startNowTimer();
  void load();
});
/** 页面隐藏（切走 / 进后台）：停表，避免后台空转 */
onHide(stopNowTimer);
/** 卸载：**必须清理定时器**（`onHide` 之外的兜底；页面实例被销毁后不再有回调） */
onUnmounted(stopNowTimer);
</script>

<style scoped>
.fd-page { padding: 16px; padding-bottom: 40px; }
.fd-head { display: flex; align-items: center; justify-content: space-between; }
.fd-head-left { display: flex; align-items: center; }
.fd-title-mark {
  width: 4px; height: 15px; border-radius: 2px; margin-right: 8px;
  background: linear-gradient(180deg, #A8322D, #8B4513);
}
.fd-title { font-size: 16px; font-weight: bold; color: #3E2723; letter-spacing: 2px; }
.fd-hint { display: block; font-size: 11px; color: #B5A594; line-height: 1.6; margin: 8px 0 12px; }

.fd-group { margin-bottom: 10px; }
.fd-group-head { display: flex; align-items: center; margin: 6px 0; }
.fd-group-title { font-size: 13px; font-weight: bold; color: #8B4513; }
.fd-group-count { font-size: 11px; color: #B08D57; margin-left: 6px; }

.fd-card {
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE; border-radius: 12px;
  padding: 12px; margin-bottom: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.fd-card-head { display: flex; align-items: center; justify-content: space-between; }
.fd-name { font-size: 15px; font-weight: bold; color: #3E2723; }
.fd-status { font-size: 11px; color: #8B4513; background: #F6E9D8; border-radius: 8px; padding: 2px 8px; }
.fd-status-grace { color: #C62828; background: #FDECEC; }
.fd-status-pending { color: #1565C0; background: #E8F1FC; }
.fd-line { display: block; font-size: 12px; color: #5D4037; line-height: 1.7; margin-top: 6px; }
.fd-line-sub { color: #8D6E63; }
.fd-line-wait { color: #8B4513; }
.fd-line-lock { color: #A8322D; font-weight: bold; }

.fd-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.fd-btn {
  padding: 5px 14px; border-radius: 6px;
  background: #FBF8F5; border: 1px solid #E0D6CB;
}
.fd-btn-primary { background: linear-gradient(180deg, #EFA9B4, #C4747F); border-color: #C4747F; }
.fd-btn-primary .fd-btn-text { color: #FFF6F8; }
.fd-btn-off { background: #F2EFEA; border-color: #E6E0D8; }
.fd-btn-off .fd-btn-text { color: #B0A79C; }
.fd-btn.is-busy { opacity: 0.6; }
.fd-btn-text { font-size: 12px; color: #5D4037; }
.fd-reason { font-size: 11px; color: #B08D57; }
.fd-done { display: block; font-size: 11px; color: #2E7D32; margin-top: 6px; }
.fd-err { display: block; font-size: 11px; color: #C62828; margin-top: 6px; line-height: 1.6; }

.fd-empty { text-align: center; padding: 60px 20px; }
.fd-empty-text { display: block; font-size: 13px; color: #999; margin-bottom: 14px; line-height: 1.6; }

/*
  解除好友自绘二次确认层：遮罩 **1010** / 面板 **1011** —— 恒高于 `uni` 弹窗（`.uni-modal` 999）与
  页面既有遮罩（`.som-mask` 1000）⇒ **不得改用 `uni.showModal`**（会被压住而不可见 / 不可点）。
  文案逐行取 `business/friends.ts` 的 `DISSOLVE_CONFIRM_*`。
*/
.fd-cfm-mask {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 1010;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.fd-cfm {
  position: relative; z-index: 1011;
  width: 80%; max-width: 340px; box-sizing: border-box; padding: 18px; border-radius: 14px;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  display: flex; flex-direction: column;
}
.fd-cfm-ribbon {
  height: 3px; border-radius: 2px; margin: -6px 0 12px; opacity: .9;
  background: linear-gradient(90deg, rgba(168, 50, 45, 0), #A8322D 30%, #EFA9B4 50%, #A8322D 70%, rgba(168, 50, 45, 0));
}
.fd-cfm-title { display: block; font-size: 16px; font-weight: 600; color: #3E2723; letter-spacing: .5px; }
.fd-cfm-peer { display: block; font-size: 12px; color: #8B4513; margin-top: 8px; }
.fd-cfm-body { display: block; font-size: 13px; color: #5D4037; line-height: 1.6; margin-top: 8px; }
.fd-cfm-acts { display: flex; gap: 10px; margin-top: 16px; }
.fd-cfm-btn { flex: 1; text-align: center; padding: 8px 0; border-radius: 8px; background: #FBF8F5; border: 1px solid #E0D6CB; }
.fd-cfm-btn-text { font-size: 14px; color: #5D4037; }
/* 破坏性操作：确认键用朱红（与「解除」语义一致） */
.fd-cfm-btn.ok { background: linear-gradient(180deg, #C4747F, #A8322D); border-color: #A8322D; }
.fd-cfm-btn.ok .fd-cfm-btn-text { color: #FFF6F8; }
</style>
