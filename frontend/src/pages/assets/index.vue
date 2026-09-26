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

      <!-- 资产总览（只读数值；签到 / 合成 / 分解等操作入口已迁至「我的」页行囊与提示层） -->
      <view class="section overview">
        <view class="overview-head">
          <text class="section-title">我的资产</text>
        </view>

        <view v-if="!hasAnyAsset" class="empty">
          <text>暂无资产，可在「我的」页签到领石榴籽碎片</text>
        </view>

        <view class="asset-row">
          <view class="asset-name-cell">
            <image class="ico-card" :src="ICON.FRAGMENT" mode="aspectFit" />
            <text class="asset-name">石榴籽碎片</text>
          </view>
          <view class="asset-value-wrap">
            <text class="asset-value">{{ fragments }} / 9</text>
            <text class="asset-sub">满 10 自动合成 1 颗石榴籽</text>
          </view>
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
          <view class="asset-name-cell">
            <image class="ico-card" :src="ICON.BAMBOO" mode="aspectFit" />
            <text class="asset-name">竹简 / 竹片</text>
          </view>
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
            <text class="asset-value">{{ unmountedJades.length }} 枚</text>
            <text class="asset-sub">{{ jadeSub }}</text>
          </view>
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
  fetchAssetsExpiring,
  fetchAssetsSummary,
  fetchMessages,
  postMessagesRead,
} from '@/business/api';
import type { AssetDelta, AssetsSummary, ExpiringAsset, MessageItem } from '@/business/api';
import { formatAssetDate as formatDate, scrollDeltaLabel, scrollFragmentDeltaLabel } from '@/business/asset-text';
import { isAuthenticated } from '@/business/auth';
import { ICON } from '@/business/icons';
import { SCROLL_PIECES_PER_ITEM } from '@/business/inventory';
import { JADE_SYNTH_SEEDS } from '@/business/jade-ops';

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

/**
 * 流水 delta 的**六类**品类序与单项文案（**逐字**与后台「资产变动日志」一致）。
 * 兰帖域（`scrolls` / `scroll_fragments`）**不在本表自算换算** —— 一律走 `business/asset-text.ts` 的
 * `scrollDeltaLabel` / `scrollFragmentDeltaLabel` 单点：兰帖可整张 ⇒ `2 张兰帖`、非整百 ⇒ `150 片兰帖`、
 * 残页恒 `99 片兰帖残页`。
 *
 * 此前本表只列四类，`admin_grant` 流水里含 `scrolls` / `scroll_fragments` 的 delta 因逐项取键**被静默丢弃**
 * （既不显示也不告警）—— 补齐为六类即修复（2026-09-26，缺陷 = 质检观察项 1）。
 */
const DELTA_UNITS: Array<{ key: keyof AssetDelta; text: (v: number) => string }> = [
  { key: 'fragments', text: (v) => `${v} 碎片` },
  { key: 'seeds', text: (v) => `${v} 颗` },
  { key: 'bamboos', text: (v) => `${v} 片` },
  { key: 'jades', text: (v) => `${v} 枚` },
  { key: 'scrolls', text: (v) => scrollDeltaLabel(v, SCROLL_PIECES_PER_ITEM) },
  { key: 'scroll_fragments', text: (v) => scrollFragmentDeltaLabel(v) },
];

const summary = ref<AssetsSummary | null>(null);
const expiring = ref<ExpiringAsset[]>([]);
const expiringFailed = ref(false);
const expiringError = ref('');
const error = ref('');

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
/**
 * 石榴籽玉：**只计未镶嵌**（口径 v6：`mounted_tree_id` 非空 = 已归属家族树、不再属于个人）。
 * 后端 `/assets/summary` 的 `jades` 已只返未镶嵌，此处 `filter` 为**幂等防御**（两端口径双保险）。
 */
const unmountedJades = computed(() => (summary.value?.jades || []).filter((j) => !j.mounted_tree_id));
const txs = computed(() => summary.value?.txs || []);

const hasAnyAsset = computed(
  () =>
    fragments.value > 0 ||
    seedsTotal.value > 0 ||
    bambooPieces.value > 0 ||
    unmountedJades.value.length > 0,
);

const jadeSub = computed(() => {
  const list = unmountedJades.value;
  if (!list.length) return `暂未持有（${JADE_SYNTH_SEEDS} 颗石榴籽可合成 1 枚）`;
  const permanent = list.filter((j) => !j.expires_at).length;
  const dated = list.filter((j) => j.expires_at).map((j) => j.expires_at as string);
  const parts: string[] = [permanent ? `永久 ${permanent} 枚` : '无永久玉'];
  if (dated.length) parts.push(`最近到期 ${formatDate(isoMin(dated))}`);
  return parts.join(' · ');
});

/** 即将过期列表：/assets/expiring 失败时回退 /assets/summary 的 expiring */
const expiringList = computed<ExpiringAsset[]>(() =>
  expiringFailed.value ? summary.value?.expiring || [] : expiring.value,
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

// 玉 / 日期的展示文案：单点复用 `business/asset-text.ts`（与行囊属性提示同一份文案）

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

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mi}`;
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

/** delta → 文本（保留符号；0 项不显示；兰帖 / 残页文案与换算经 `asset-text.ts` 单点） */
function txDeltaText(delta: AssetDelta | undefined): string {
  if (!delta) return '';
  const parts: string[] = [];
  for (const { key, text } of DELTA_UNITS) {
    const v = delta[key];
    if (typeof v === 'number' && v !== 0) parts.push(`${v > 0 ? '+' : ''}${text(v)}`);
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

/* 资产行图标：石榴籽碎片 / 石榴籽 / 竹简 / 石榴籽玉（统一经 business/icons.ts 常量引用，禁止手写 /static 路径） */
.asset-name-cell { display: flex; align-items: center; gap: 10rpx; flex-shrink: 0; }
.ico-card { width: 64rpx; height: 64rpx; flex-shrink: 0; }
.asset-value { font-size: 16px; font-weight: bold; color: #8B4513; display: block; }
.asset-sub { font-size: 11px; color: #B5A594; display: block; margin-top: 2px; }

.empty { text-align: center; color: #999; padding: 16px 0; font-size: 13px; }
.section-error { font-size: 12px; color: #C62828; margin-bottom: 8px; }

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
