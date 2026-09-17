<template>
  <view class="container">
    <view v-if="!isAuthenticated()" class="not-logged">
      <text>请先登录后查看我的资产</text>
      <t-button theme="primary" block class="btn-login" @click="goLogin">去登录</t-button>
    </view>

    <template v-else>
      <!-- 消息提醒（站内信：资产到期 / 家族灵气通知；文案由后端下发，前端逐字渲染） -->
      <view class="section">
        <view class="overview-head">
          <text class="section-title">消息提醒</text>
          <view class="msg-head-right">
            <text v-if="unread" class="unread-badge">{{ unread }} 条未读</text>
            <t-button
              v-if="unread"
              size="small"
              variant="text"
              :loading="readingAll"
              @click="markAllRead"
            >全部标为已读</t-button>
          </view>
        </view>
        <view v-if="messagesFailed" class="section-error">
          <text>{{ messagesError }}</text>
        </view>
        <view v-if="!messages.length" class="empty">
          <text>暂无消息</text>
        </view>
        <view
          v-for="msg in messages"
          :key="msg.id"
          class="msg-item"
          :class="{ unread: !msg.read }"
          @click="readMsg(msg)"
        >
          <view class="msg-head">
            <view class="msg-dot" v-if="!msg.read" />
            <text class="msg-title">{{ msg.title }}</text>
            <text class="msg-time">{{ formatTime(msg.created_at) }}</text>
          </view>
          <text class="msg-text">{{ msg.text }}</text>
        </view>
      </view>

      <!-- 资产总览 + 每日签到 -->
      <view class="section overview">
        <view class="overview-head">
          <text class="section-title">我的资产</text>
          <t-button
            size="small"
            theme="primary"
            :loading="signing"
            :disabled="signedToday || signing"
            @click="doSignin"
          >{{ signedToday ? '今日已签到' : '签到 · 领 1 碎片' }}</t-button>
        </view>

        <view v-if="!hasAnyAsset" class="empty">
          <text>暂无资产，每日签到可获得石榴籽碎片</text>
        </view>

        <view class="asset-row">
          <text class="asset-name">石榴籽碎片</text>
          <view class="asset-value-wrap">
            <text class="asset-value">{{ fragments }} / 9</text>
            <text class="asset-sub">满 10 自动合成 1 颗石榴籽</text>
          </view>
        </view>
        <view class="frag-grid">
          <view v-for="i in 9" :key="i" class="frag-cell" :class="{ on: i <= fragments }" />
        </view>

        <view class="asset-row">
          <view class="asset-name-cell">
            <image class="ico-card" :src="ICON.SEED" mode="aspectFit" />
            <text class="asset-name">完整石榴籽</text>
          </view>
          <view class="asset-value-wrap">
            <text class="asset-value">{{ seedsTotal }} 颗</text>
            <text class="asset-sub">{{ seedLotCount }} 个批次 · 最近到期 {{ formatDate(nearestSeedExpiry) }}</text>
          </view>
        </view>

        <view class="asset-row">
          <text class="asset-name">竹简 / 竹片</text>
          <view class="asset-value-wrap">
            <text class="asset-value">{{ bambooPieces }} 片</text>
            <text class="asset-sub">折算 {{ bambooBundles }} 束 {{ bambooRest }} 片 · 1 束 = 100 片</text>
          </view>
        </view>

        <view class="asset-row">
          <view class="asset-name-cell">
            <image class="ico-card" :src="ICON.JADE" mode="aspectFit" />
            <text class="asset-name">石榴籽玉</text>
          </view>
          <view class="asset-value-wrap">
            <text class="asset-value">{{ jades.length }} 枚</text>
            <text class="asset-sub">{{ jadeSub }}</text>
          </view>
        </view>

        <!-- 合成石榴籽玉（固定 999 颗；8.2 定稿二次确认）：籽不足 → 置灰 + 现算「再攒 N 颗」 -->
        <view class="jade-ops">
          <t-button
            theme="primary"
            block
            :loading="synthesizing"
            :disabled="!canSynthesize || synthesizing"
            @click="confirmSynthesize"
          >
            <view class="btn-inline">
              <image class="ico-inline" :src="ICON.SEED" mode="aspectFit" />
              <text>合成石榴籽玉（消耗 {{ JADE_SYNTH_SEEDS }} 颗）</text>
            </view>
          </t-button>
          <text class="jade-ops-hint">{{ synthHint }}</text>
        </view>
      </view>

      <!-- 我的玉：逐枚列出；**未镶嵌**的玉才提供「分解」（已镶嵌玉不可分解 → 不给可点错的入口） -->
      <view class="section">
        <text class="section-title">我的玉</text>
        <view v-if="!jades.length" class="empty">
          <text>暂未持有石榴籽玉（{{ JADE_SYNTH_SEEDS }} 颗石榴籽可合成 1 枚）</text>
        </view>
        <view v-for="j in jades" :key="j.id" class="row-item">
          <image class="ico-list" :src="ICON.JADE" mode="aspectFit" />
          <view class="row-left">
            <text class="row-main">{{ jadeTitle(j) }}</text>
            <text class="row-sub">{{ jadeSubLine(j) }}</text>
          </view>
          <t-button
            v-if="!isJadeMounted(j)"
            size="small"
            variant="outline"
            theme="primary"
            :loading="decomposingId === j.id"
            :disabled="decomposingId !== ''"
            @click="confirmDecompose(j)"
          >分解</t-button>
        </view>
      </view>

      <!-- 即将过期 -->
      <view class="section">
        <text class="section-title">即将过期 · {{ EXPIRING_DAYS }} 天内</text>
        <view v-if="expiringFailed" class="section-error">
          <text>{{ expiringError }}</text>
        </view>
        <view v-if="!expiringList.length" class="empty">
          <text>暂无即将过期的资产</text>
        </view>
        <view v-for="item in expiringList" :key="item.lot_id" class="row-item">
          <view class="row-left">
            <text class="row-main">{{ expiringAssetLabel(item) }} {{ expiringQtyLabel(item) }}</text>
            <text class="row-sub">到期日 {{ formatDate(item.expires_at) }}</text>
          </view>
          <text class="row-right">剩 {{ item.days_left }} 天</text>
        </view>
      </view>

      <!-- 最近流水 -->
      <view class="section">
        <text class="section-title">最近流水</text>
        <view v-if="!txs.length" class="empty">
          <text>暂无流水记录</text>
        </view>
        <view v-for="tx in txs" :key="tx.id" class="row-item">
          <view class="row-left">
            <text class="row-main">{{ txTypeLabel(tx.type) }}</text>
            <text class="row-sub">{{ formatTime(tx.ts) }}</text>
          </view>
          <text class="row-right" :class="{ minus: isMinus(tx.delta) }">{{ txDeltaText(tx.delta) }}</text>
        </view>
      </view>
    </template>

    <view v-if="error" class="error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ApiStatusError,
  fetchAssetsExpiring,
  fetchAssetsSummary,
  fetchMessages,
  postDecomposeJade,
  postMessagesRead,
  postSignin,
  postSynthesizeJade,
} from '@/business/api';
import type { AssetDelta, AssetsSummary, ExpiringAsset, Jade, MessageItem } from '@/business/api';
import { isAssetInsufficientError, showAssetInsufficientGuide } from '@/business/asset-guide';
import { isAuthenticated } from '@/business/auth';
import { ICON } from '@/business/icons';
import {
  DECOMPOSE_CONFIRM_BODY,
  DECOMPOSE_CONFIRM_TITLE,
  JADE_SYNTH_SEEDS,
  SEED_VALID_DAYS,
  SYNTH_CONFIRM_BODY,
  SYNTH_CONFIRM_TITLE,
} from '@/business/jade-ops';

/** 即将过期查询窗口（docs/economy.spec.md §11-11：默认 30 天） */
const EXPIRING_DAYS = 30;

/** Tx.type → 中文（docs/economy.spec.md §4-6 枚举唯一清单） */
const TX_TYPE_LABELS: Record<string, string> = {
  signin: '每日签到',
  fragment_synth: '碎片合成石榴籽',
  reward: '奖励发放',
  expire: '过期作废',
  tree_create: '建树扣费',
  edit_fee: '内容修改扣费',
  move_fee: '跨树迁移扣费',
  delete_fee: '删除节点扣费',
  spirit_charge: '家族灵气充值',
  jade_synth: '合成石榴籽玉',
  jade_decompose: '分解石榴籽玉',
  jade_mount: '镶嵌石榴籽玉',
  market_list: '市集上架',
  market_cancel: '市集撤单',
  market_sell: '市集卖出',
  market_buy: '市集买入',
  official_buy: '官方竹简购买',
  admin_grant: '运营发放',
  account_clear: '账号注销清空',
  fee_refund: '费用冲正',
};

const DELTA_UNITS: Array<{ key: keyof AssetDelta; unit: string }> = [
  { key: 'fragments', unit: '碎片' },
  { key: 'seeds', unit: '颗' },
  { key: 'bamboos', unit: '片' },
  { key: 'jades', unit: '枚' },
];

const summary = ref<AssetsSummary | null>(null);
const expiring = ref<ExpiringAsset[]>([]);
const expiringFailed = ref(false);
const expiringError = ref('');
const error = ref('');
const signing = ref(false);
/** 本次会话内已签到（签到成功 / 409 均置位；跨自然日由服务端 signin_date 判定） */
const signedLocal = ref(false);
/** 合成中（8.2 确认后 → POST /assets/synthesize-jade） */
const synthesizing = ref(false);
/** 正在分解的玉 id（并发保护；空串 = 空闲） */
const decomposingId = ref('');

// 站内信（docs/economy-ops.spec.md §4）：列表 + 未读计数，文案逐字取自后端
const messages = ref<MessageItem[]>([]);
const unread = ref(0);
const messagesFailed = ref(false);
const messagesError = ref('');
const readingAll = ref(false);
const readingId = ref('');

const fragments = computed(() => summary.value?.fragments ?? 0);
const seedsTotal = computed(() => summary.value?.seeds_total ?? 0);
const seedLotCount = computed(() => summary.value?.seed_lots?.length ?? 0);
const nearestSeedExpiry = computed(() =>
  isoMin((summary.value?.seed_lots || []).map((l) => l.expires_at)),
);
const bambooPieces = computed(() => summary.value?.bamboos_total_pieces ?? 0);
const bambooBundles = computed(() => Math.floor(bambooPieces.value / 100));
const bambooRest = computed(() => bambooPieces.value % 100);
const jades = computed(() => summary.value?.jades || []);
const txs = computed(() => summary.value?.txs || []);

const hasAnyAsset = computed(
  () =>
    fragments.value > 0 ||
    seedsTotal.value > 0 ||
    bambooPieces.value > 0 ||
    jades.value.length > 0,
);

const jadeSub = computed(() => {
  const list = jades.value;
  if (!list.length) return `暂未持有（${JADE_SYNTH_SEEDS} 颗石榴籽可合成 1 枚）`;
  const permanent = list.filter((j) => !j.expires_at).length;
  const dated = list.filter((j) => j.expires_at).map((j) => j.expires_at as string);
  const parts: string[] = [permanent ? `永久 ${permanent} 枚` : '无永久玉'];
  if (dated.length) parts.push(`最近到期 ${formatDate(isoMin(dated))}`);
  if (list.some((j) => j.mounted_tree_id)) parts.push('含已镶嵌玉');
  return parts.join(' · ');
});

// 石榴籽玉合成条件（docs/spirit-domain.spec.md §3 SEED_COST = 999；不足时按钮置灰）

/** 条件：已登录（本页整段在 isAuthenticated 之内）且可用籽总数 ≥ 999 */
const canSynthesize = computed(() => seedsTotal.value >= JADE_SYNTH_SEEDS);

/** 还差多少颗可合成（由 summary 现算，不写死示例值） */
const seedsToGo = computed(() => Math.max(0, JADE_SYNTH_SEEDS - seedsTotal.value));

/** 合成按钮下的提示：不足 → 「再攒 N 颗可合成」 */
const synthHint = computed(() =>
  canSynthesize.value
    ? `消耗 ${JADE_SYNTH_SEEDS} 颗，合成后剩余 ${seedsTotal.value - JADE_SYNTH_SEEDS} 颗石榴籽`
    : `再攒 ${seedsToGo.value} 颗可合成`,
);

/** 即将过期列表：/assets/expiring 失败时回退 /assets/summary 的 expiring */
const expiringList = computed<ExpiringAsset[]>(() =>
  expiringFailed.value ? summary.value?.expiring || [] : expiring.value,
);

/** 当日（北京时间自然日）是否已签到：以服务端 signin_date（UTC+8 自然日）为准 */
const signedToday = computed(
  () =>
    signedLocal.value ||
    (summary.value?.signin_date || '') === cnDateOf(Date.now()),
);

onMounted(async () => {
  await load();
});

async function load() {
  if (!isAuthenticated()) return;
  error.value = '';
  try {
    summary.value = await fetchAssetsSummary();
  } catch (e: any) {
    error.value = e?.message || '加载资产失败';
  }
  await loadExpiring();
  await loadMessages();
}

/** 站内信列表（GET /messages）：读列表同时补齐服务端按 now 惰性生成的预警 */
async function loadMessages() {
  messagesError.value = '';
  messagesFailed.value = false;
  try {
    const res = await fetchMessages();
    messages.value = res?.items || [];
    unread.value = res?.unread || 0;
  } catch (e: any) {
    messagesFailed.value = true;
    messages.value = [];
    unread.value = 0;
    messagesError.value = e?.message || '读取消息失败';
  }
}

/** 点击消息 = 标记已读（POST /messages/read { ids:[id] }；已读项幂等跳过） */
async function readMsg(msg: MessageItem) {
  if (msg.read || readingId.value) return;
  readingId.value = msg.id;
  try {
    const res = await postMessagesRead([msg.id]);
    msg.read = true;
    unread.value = typeof res?.unread === 'number' ? res.unread : Math.max(0, unread.value - 1);
  } catch (e: any) {
    error.value = e?.message || '标记已读失败';
  } finally {
    readingId.value = '';
  }
}

/** 全部标为已读（POST /messages/read 不带 ids） */
async function markAllRead() {
  if (!unread.value || readingAll.value) return;
  readingAll.value = true;
  try {
    const res = await postMessagesRead();
    for (const msg of messages.value) msg.read = true;
    unread.value = res?.unread ?? 0;
  } catch (e: any) {
    error.value = e?.message || '标记已读失败';
  } finally {
    readingAll.value = false;
  }
}

async function loadExpiring() {
  expiringError.value = '';
  expiringFailed.value = false;
  try {
    expiring.value = await fetchAssetsExpiring(EXPIRING_DAYS);
  } catch (e: any) {
    expiringFailed.value = true;
    expiring.value = [];
    expiringError.value = e?.message || '读取即将过期资产失败';
  }
}

async function doSignin() {
  if (signedToday.value || signing.value) return;
  signing.value = true;
  error.value = '';
  try {
    const res = await postSignin();
    signedLocal.value = true;
    const parts = ['签到成功 +1 碎片'];
    if (typeof res?.fragments === 'number') parts.push(`当前 ${res.fragments}/9`);
    if (res?.synthesized > 0) parts.push(`满 10 合成 ${res.synthesized} 颗石榴籽`);
    uni.showToast({ title: parts.join('，'), icon: 'none' });
    await load();
  } catch (e: any) {
    if (e instanceof ApiStatusError && e.status === 409) {
      // 同自然日重复：置灰按钮 + toast 提示，不弹错误
      signedLocal.value = true;
      uni.showToast({ title: '今日已签到', icon: 'none' });
    } else {
      error.value = e?.message || '签到失败';
    }
  } finally {
    signing.value = false;
  }
}

// ---- 石榴籽玉：合成（8.2 定稿确认 → POST /assets/synthesize-jade）/ 分解（免费 → POST /assets/decompose-jade） ----

/** 合成石榴籽玉：固定消耗 999 颗；二次确认 = 8.2 定稿文案（取消则不发请求） */
function confirmSynthesize() {
  if (synthesizing.value) return;
  if (!canSynthesize.value) {
    // 按钮已置灰，这里再兜一层（服务端同样整单 409 拒绝）
    uni.showToast({ title: `再攒 ${seedsToGo.value} 颗可合成`, icon: 'none' });
    return;
  }
  uni.showModal({
    title: SYNTH_CONFIRM_TITLE,
    content: SYNTH_CONFIRM_BODY,
    confirmText: '确认合成',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) doSynthesize();
    },
  });
}

async function doSynthesize() {
  synthesizing.value = true;
  error.value = '';
  try {
    const res = await postSynthesizeJade();
    await load();
    const exp = res?.permanent
      ? '永久有效'
      : res?.expires_at
        ? `有效期至 ${formatDate(res.expires_at)}`
        : '有效期见资产明细';
    uni.showToast({
      title: `合成成功：新玉${exp}，消耗 ${res?.seeds_deducted ?? JADE_SYNTH_SEEDS} 颗，余 ${seedsTotal.value} 颗石榴籽`,
      icon: 'none',
      duration: 4000,
    });
  } catch (e: any) {
    if (isAssetInsufficientError(e)) {
      // 409 ASSET_INSUFFICIENT：直出后端原文 + how_to_get 清单（与既有「籽不足」同一套提示写法）
      showAssetInsufficientGuide(e, { title: '石榴籽不足' });
    } else {
      error.value = e?.message || '合成失败';
      uni.showToast({ title: error.value, icon: 'none' });
    }
  } finally {
    synthesizing.value = false;
  }
}

/** 已镶嵌的玉（`mounted_tree_id` 有值）：不可分解（后端 409「已镶嵌的石榴籽玉不可分解」） */
function isJadeMounted(j: Jade): boolean {
  return !!j.mounted_tree_id;
}

/** 分解石榴籽玉：免费、无折损；二次确认说明「固定返还 999 颗 + 产出统一 365 天」 */
function confirmDecompose(jade: Jade) {
  if (!jade?.id || decomposingId.value || isJadeMounted(jade)) return;
  uni.showModal({
    title: DECOMPOSE_CONFIRM_TITLE,
    content: DECOMPOSE_CONFIRM_BODY,
    confirmText: '确认分解',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) doDecompose(jade.id);
    },
  });
}

async function doDecompose(jadeId: string) {
  decomposingId.value = jadeId;
  error.value = '';
  try {
    const res = await postDecomposeJade(jadeId);
    await load();
    const exp = res?.seed_expires_at ? `，${formatDate(res.seed_expires_at)} 到期` : '';
    uni.showToast({
      title: `已分解，返还 ${res?.seeds_returned ?? JADE_SYNTH_SEEDS} 颗石榴籽（统一 ${SEED_VALID_DAYS} 天${exp}），余 ${seedsTotal.value} 颗`,
      icon: 'none',
      duration: 4000,
    });
  } catch (e: any) {
    // 404「未找到该石榴籽玉」/ 409「已镶嵌的石榴籽玉不可分解」等一律直出后端原文
    error.value = e?.message || '分解失败';
    uni.showToast({ title: error.value, icon: 'none' });
  } finally {
    decomposingId.value = '';
  }
}

/** 玉的展示标题（永久玉显示「永久有效」） */
function jadeTitle(j: Jade): string {
  return `${shortId(j.id)} · ${j.expires_at ? `有效期至 ${formatDate(j.expires_at)}` : '永久有效'}`;
}

/** 玉的状态行：已镶嵌（不可分解）/ 未镶嵌（可免费分解） */
function jadeSubLine(j: Jade): string {
  return j.mounted_tree_id ? `已镶嵌至 ${j.mounted_tree_id} · 不可分解` : '未镶嵌 · 可免费分解';
}

function shortId(id: string | undefined): string {
  if (!id) return '—';
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}

function isoMin(list: string[]): string {
  let best = '';
  let bestTs = Infinity;
  for (const iso of list) {
    const ts = new Date(iso).getTime();
    if (!Number.isNaN(ts) && ts < bestTs) {
      bestTs = ts;
      best = iso;
    }
  }
  return best;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mi}`;
}

/** 北京时间（UTC+8）日历日 */
function cnDateOf(ts: number): string {
  const d = new Date(ts + 8 * 3600 * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function expiringAssetLabel(item: ExpiringAsset): string {
  return item.asset === 'seed' ? '石榴籽' : '竹片';
}

function expiringQtyLabel(item: ExpiringAsset): string {
  return `${item.qty} ${item.asset === 'seed' ? '颗' : '片'}`;
}

function txTypeLabel(type: string): string {
  return TX_TYPE_LABELS[type] || type;
}

function txDeltaText(delta: AssetDelta | undefined): string {
  if (!delta) return '';
  const parts: string[] = [];
  for (const { key, unit } of DELTA_UNITS) {
    const v = delta[key];
    if (typeof v === 'number' && v !== 0) parts.push(`${v > 0 ? '+' : ''}${v} ${unit}`);
  }
  return parts.join(' · ');
}

function isMinus(delta: AssetDelta | undefined): boolean {
  if (!delta) return false;
  return DELTA_UNITS.some(({ key }) => (delta[key] ?? 0) < 0);
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}
</script>

<style scoped>
.container { padding: 20px; }
.not-logged { text-align: center; padding: 40px 0; color: #999; }
.btn-login { margin-top: 14px; }
.section {
  background: #fff; border-radius: 12px; padding: 16px;
  margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.section-title { font-size: 15px; font-weight: bold; color: #3E2723; display: block; }
.overview-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 12px;
}
.overview-head .section-title { margin-bottom: 0; }

.asset-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid #f5f0ea;
}
.asset-row:last-child { border-bottom: none; }
.asset-name { font-size: 14px; color: #3E2723; flex-shrink: 0; }
.asset-value-wrap { flex: 1; text-align: right; }

/* 石榴籽 / 石榴籽玉 图标（统一经 business/icons.ts 常量引用，禁止手写 /static 路径） */
.asset-name-cell { display: flex; align-items: center; gap: 10rpx; flex-shrink: 0; }
.ico-card { width: 64rpx; height: 64rpx; flex-shrink: 0; }
.ico-list { width: 32rpx; height: 32rpx; flex-shrink: 0; margin-right: 10rpx; }
.ico-inline { width: 32rpx; height: 32rpx; flex-shrink: 0; vertical-align: middle; }
.btn-inline { display: flex; align-items: center; justify-content: center; gap: 8rpx; }
.asset-value { font-size: 16px; font-weight: bold; color: #8B4513; display: block; }
.asset-sub { font-size: 11px; color: #B5A594; display: block; margin-top: 2px; }

.frag-grid { display: flex; gap: 6px; padding: 4px 0 12px; }
.frag-cell {
  flex: 1; height: 6px; border-radius: 3px; background: #F0E7DC;
}
.frag-cell.on { background: #C62828; }

.empty { text-align: center; color: #999; padding: 16px 0; font-size: 13px; }
.section-error { font-size: 12px; color: #C62828; margin-bottom: 8px; }

/* 石榴籽玉操作（合成 / 分解） */
.jade-ops { margin-top: 12px; }
.jade-ops-hint { font-size: 12px; color: #B5A594; display: block; margin-top: 6px; text-align: center; }

/* 消息提醒 */
.msg-head-right { display: flex; align-items: center; gap: 8px; }
.unread-badge {
  font-size: 11px; color: #fff; background: #C62828;
  border-radius: 10px; padding: 2px 8px;
}
.msg-item {
  padding: 10px 0; border-bottom: 1px solid #f5f0ea;
}
.msg-item:last-child { border-bottom: none; }
.msg-item.unread .msg-title { color: #3E2723; font-weight: bold; }
.msg-head { display: flex; align-items: center; gap: 6px; }
.msg-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #C62828; flex-shrink: 0;
}
.msg-title { font-size: 14px; color: #555; flex: 1; }
.msg-time { font-size: 11px; color: #B5A594; flex-shrink: 0; }
.msg-text { font-size: 12px; color: #777; display: block; margin-top: 4px; line-height: 1.6; }
.row-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-bottom: 1px solid #f5f0ea;
}
.row-item:last-child { border-bottom: none; }
.row-left { flex: 1; }
.row-main { font-size: 14px; color: #555; display: block; }
.row-sub { font-size: 11px; color: #B5A594; margin-top: 2px; display: block; }
.row-right { font-size: 14px; font-weight: bold; color: #2E7D32; }
.row-right.minus { color: #C62828; }
.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }
</style>
