<template>
  <view class="container">
    <!-- ① 官方竹简发售区（每日 21:00 惰性释放，售罄即止、不结转） -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">🏪 官方竹简发售</text>
        <t-tag :theme="officialTagTheme" variant="light" size="small">{{ officialTagText }}</t-tag>
      </view>
      <text class="official-price">官方竹简 ¥{{ officialPriceYuan }}/束（100 片）· 每日 21:00 限量发售</text>
      <text class="official-stock">{{ stockText }}</text>

      <view class="buy-row">
        <t-input
          class="input"
          type="number"
          :value="buyBundles"
          placeholder="购买束数（整束）"
          @update:value="(v: any) => buyBundles = v"
        />
        <t-button
          theme="primary"
          :loading="buyingOfficial"
          :disabled="officialDisabled"
          @click="doOfficialBuy"
        >购买</t-button>
      </view>
      <text class="section-hint">应付 ¥{{ officialTotalYuan }} · 到账 {{ buyBundlesNum * 100 }} 片</text>
      <view v-if="officialError" class="section-error">
        <text>{{ officialError }}</text>
        <t-button
          v-if="officialNeedRecharge"
          size="small"
          theme="primary"
          variant="outline"
          class="inline-btn"
          @click="goWallet"
        >去充值</t-button>
      </view>
      <text class="section-hint">竹片有效期 365 天 · 绑定个人账号，不支持家族共享、账号转移、私人转赠</text>
      <text class="section-hint">当前时间 {{ nowText }}（CST）· 可点「刷新」重新读取库存</text>
    </view>

    <!-- ② 我的资产（市集口径：籽可用 / 竹片可用与挂单锁定） -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">我的资产</text>
        <t-button size="small" variant="text" @click="loadAll">刷新</t-button>
      </view>
      <view v-if="!isAuthenticated()" class="empty">
        <text>登录后可查看石榴籽与竹片可用量</text>
        <text class="link" @click="goLogin">去登录</text>
      </view>
      <template v-else>
        <view class="asset-row">
          <text class="asset-name">完整石榴籽</text>
          <text class="asset-value">{{ seedsAvailable }} 颗</text>
        </view>
        <view class="asset-row">
          <text class="asset-name">竹片可用</text>
          <text class="asset-value">{{ bambooAvailable }} 片</text>
        </view>
        <view class="asset-row">
          <text class="asset-name">挂单锁定</text>
          <text class="asset-value">{{ bambooLocked }} 片</text>
        </view>
        <text v-if="myError" class="section-error">{{ myError }}</text>
        <text class="compliance">人民币仅用于购买官方竹简，不可购买石榴籽；石榴籽不可兑换人民币</text>
      </template>
    </view>

    <!-- ③ 市场挂单列表（guest 可读；自己不能买自己的单，置灰） -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">市场挂单</text>
        <text class="section-extra">在售 {{ listings.length }} 条</text>
      </view>
      <view v-if="listingsLoading" class="section-hint">加载中…</view>
      <view v-else-if="listingsError" class="section-error">{{ listingsError }}</view>
      <view v-else-if="!listings.length" class="empty">
        <text>暂无在售挂单</text>
      </view>
      <view v-for="l in listings" :key="l.id" class="row-item">
        <view class="row-left">
          <view class="ico-line">
            <image class="ico-sm" :src="ICON.SEED" mode="aspectFit" />
            <text class="row-main">{{ l.price_seeds }} 籽 · {{ l.bundles }} 束（{{ l.pieces }} 片）</text>
          </view>
          <text class="row-sub">卖方 {{ maskPhone(l.seller_phone) }} · 剩 {{ daysLeft(l) }} 天</text>
        </view>
        <t-button
          v-if="!isMine(l)"
          size="small"
          theme="primary"
          @click="openBuyConfirm(l)"
        >买入</t-button>
        <text v-else class="own-tag">自己的挂单</text>
      </view>
    </view>

    <!-- ④ 挂单表单（整束 + 自由报价；不含家族树选择器） -->
    <view class="section">
      <text class="section-title">出售竹简 · 挂单</text>
      <view v-if="!isAuthenticated()" class="empty">
        <text>登录后可挂单出售竹简</text>
        <text class="link" @click="goLogin">去登录</text>
      </view>
      <template v-else>
        <view class="form-row">
          <text class="form-label">束数</text>
          <t-input
            class="input"
            type="number"
            :value="formBundles"
            placeholder="整数（1 束 = 100 片）"
            @update:value="(v: any) => formBundles = v"
          />
        </view>
        <view class="form-row">
          <text class="form-label">标价（籽）</text>
          <t-input
            class="input"
            type="number"
            :value="formPrice"
            placeholder="石榴籽数量（整单总价）"
            @update:value="(v: any) => formPrice = v"
          />
        </view>
        <text class="section-hint">可用 {{ availableBundles }} 束（已扣除挂单占用）</text>
        <text class="section-hint">整束挂单，成交后手续费 1%（扣石榴籽）</text>
        <text class="section-hint">挂单 7 天内未成交自动下架，锁定竹片随之释放（挂单与家族树无关）</text>
        <t-button
          theme="primary"
          block
          class="form-submit"
          :loading="creating"
          :disabled="creating"
          @click="doCreateListing"
        >发布挂单</t-button>
        <text v-if="formError" class="section-error">{{ formError }}</text>
      </template>
    </view>

    <!-- ⑤ 我的挂单（状态 + 剩余时限 + 撤单） -->
    <view class="section">
      <text class="section-title">我的挂单</text>
      <view v-if="!isAuthenticated()" class="empty">
        <text>登录后可查看自己的挂单</text>
      </view>
      <template v-else>
        <view v-if="!myListings.length" class="empty">
          <text>暂无挂单</text>
        </view>
        <view v-for="l in myListings" :key="l.id" class="row-item">
          <view class="row-left">
            <view class="ico-line">
              <image class="ico-sm" :src="ICON.SEED" mode="aspectFit" />
              <text class="row-main">{{ l.price_seeds }} 籽 · {{ l.bundles }} 束（{{ l.pieces }} 片）</text>
            </view>
            <text class="row-sub">{{ statusLabel(l.status) }} · {{ daysLeft(l) > 0 ? `剩 ${daysLeft(l)} 天` : '已到期' }}</text>
          </view>
          <t-button
            v-if="l.status === 'open'"
            size="small"
            variant="outline"
            theme="warning"
            :loading="cancellingId === l.id"
            :disabled="cancellingId !== ''"
            @click="confirmCancel(l)"
          >撤单</t-button>
        </view>
        <text class="section-hint">存在未成交挂单时无法注销账号，请先撤销未成交挂单</text>
      </template>
    </view>

    <!-- 常驻风控小字（未登录也可见） -->
    <text v-if="!isAuthenticated()" class="compliance compliance-footer">
      人民币仅用于购买官方竹简，不可购买石榴籽；石榴籽不可兑换人民币
    </text>

    <!-- 买入确认弹窗：标价 / 手续费 / 卖方实收 -->
    <view v-if="buyTarget" class="modal-mask" @click="closeBuyConfirm">
      <view class="modal" @click.stop>
        <text class="modal-title">确认买入</text>
        <text class="modal-sub">整单全量成交，不支持部分购买与议价</text>
        <view class="modal-row">
          <text class="modal-label">标价</text>
          <view class="ico-line">
            <image class="ico-sm" :src="ICON.SEED" mode="aspectFit" />
            <text class="modal-value">{{ buyTarget.price_seeds }} 籽</text>
          </view>
        </view>
        <view class="modal-row">
          <text class="modal-label">手续费（1%）</text>
          <text class="modal-value">{{ buyFeeText }}</text>
        </view>
        <view class="modal-row">
          <text class="modal-label">卖方实收</text>
          <text class="modal-value">{{ buySellerGets }} 籽</text>
        </view>
        <view class="modal-row">
          <text class="modal-label">所得竹片</text>
          <text class="modal-value">{{ buyTarget.pieces }} 片（{{ buyTarget.bundles }} 束）</text>
        </view>
        <text class="modal-hint">买方实付 = 标价；手续费从卖方收入中扣除并销毁</text>
        <text v-if="buyError" class="section-error">{{ buyError }}</text>
        <view class="modal-actions">
          <t-button theme="primary" block :loading="buying" :disabled="buying" @click="doBuy">确认买入</t-button>
          <t-button variant="text" block @click="closeBuyConfirm">取消</t-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ApiStatusError,
  fetchMarketListings,
  fetchMyListings,
  postMarketBuy,
  postMarketCancel,
  postMarketList,
  postOfficialBuy,
} from '@/business/api';
import type { MarketListing, MarketMyAssets, MarketOfficial } from '@/business/api';
import { authState, isAuthenticated } from '@/business/auth';
import { isAssetInsufficientError, showAssetInsufficientGuide } from '@/business/asset-guide';
import { ICON } from '@/business/icons';

/** 挂单时限（天）：与后端常量 `LISTING_TTL_DAYS = 7` 同口径，仅用于文案 */
const LISTING_TTL_DAYS = 7;

/** 1 束 = 100 片（恒等，不可拆分交易） */
const PIECES_PER_BUNDLE = 100;

/** 手续费率：floor(标价 / 100) 籽，0 即免收（docs/economy-market.spec.md §4.1） */
function feeOfSeeds(priceSeeds: number): number {
  return Math.floor(priceSeeds / 100);
}

const myPhone = computed(() => authState.phone || '');
const listings = ref<MarketListing[]>([]);
const myListings = ref<MarketListing[]>([]);
const myAssets = ref<MarketMyAssets | null>(null);
const official = ref<MarketOfficial | null>(null);
/** 页面数据的取数时刻（用于剩余时限与 21:00 判定；每次刷新时更新） */
const nowTs = ref(Date.now());

const listingsLoading = ref(false);
const listingsError = ref('');
const myError = ref('');

const buyBundles = ref('1');
const buyingOfficial = ref(false);
const officialError = ref('');
const officialNeedRecharge = ref(false);

const formBundles = ref('');
const formPrice = ref('');
const creating = ref(false);
const formError = ref('');

const cancellingId = ref('');

const buyTarget = ref<MarketListing | null>(null);
const buying = ref(false);
const buyError = ref('');

// ---------- 官方发售区 ----------

const officialPriceYuan = computed(() => ((official.value?.price_fen ?? 990) / 100).toFixed(2));
const stockLeft = computed(() => official.value?.stock_left_today ?? 0);
/** 当前是否已过北京时间（CST）当日 21:00 —— 发售时点 */
const afterRelease = computed(() => cnMinutesOfDay(nowTs.value) >= 21 * 60);

const officialTagText = computed(() => {
  if (!afterRelease.value) return '未到发售时间';
  return stockLeft.value > 0 ? '发售中' : '已售罄';
});
const officialTagTheme = computed(() => {
  if (!afterRelease.value) return 'default';
  return stockLeft.value > 0 ? 'success' : 'danger';
});

const stockText = computed(() => {
  if (!official.value) return '库存读取中…';
  if (!afterRelease.value) return '今日 21:00 开售';
  if (stockLeft.value <= 0) return '今日已售罄，明日 21:00 刷新';
  return `今日剩余 ${stockLeft.value} 束`;
});

const buyBundlesNum = computed(() => toPositiveInt(buyBundles.value));
const officialTotalYuan = computed(() =>
  (((official.value?.price_fen ?? 990) * buyBundlesNum.value) / 100).toFixed(2),
);
const officialDisabled = computed(
  () => buyingOfficial.value || !afterRelease.value || stockLeft.value <= 0,
);

// ---------- 我的资产 / 挂单 ----------

const seedsAvailable = computed(() => myAssets.value?.seeds_available ?? 0);
const bambooAvailable = computed(() => myAssets.value?.bamboo_available_pieces ?? 0);
const bambooLocked = computed(() => myAssets.value?.bamboo_locked_pieces ?? 0);
/** 可用束数：可用片数折算（挂单占用已由服务端扣除） */
const availableBundles = computed(() => Math.floor(bambooAvailable.value / PIECES_PER_BUNDLE));

// ---------- 买入确认弹窗 ----------

const buyFeeSeeds = computed(() => feeOfSeeds(buyTarget.value?.price_seeds ?? 0));
const buyFeeText = computed(() => (buyFeeSeeds.value > 0 ? `${buyFeeSeeds.value} 籽` : '免收'));
const buySellerGets = computed(() =>
  Math.max(0, (buyTarget.value?.price_seeds ?? 0) - buyFeeSeeds.value),
);

const nowText = computed(() => {
  const d = new Date(nowTs.value + 8 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${cnDateOf(nowTs.value)} ${hh}:${mi}`;
});

onMounted(() => {
  void loadAll();
});

async function loadAll() {
  nowTs.value = Date.now();
  await Promise.all([loadListings(), loadMine()]);
}

async function loadListings() {
  listingsLoading.value = true;
  listingsError.value = '';
  try {
    const res = await fetchMarketListings();
    listings.value = res.listings || [];
    official.value = res.official || null;
  } catch (e: any) {
    listingsError.value = e?.message || '加载市集挂单失败';
  } finally {
    listingsLoading.value = false;
  }
}

async function loadMine() {
  if (!isAuthenticated()) {
    myListings.value = [];
    myAssets.value = null;
    return;
  }
  myError.value = '';
  try {
    const res = await fetchMyListings();
    myListings.value = res.listings || [];
    myAssets.value = res.assets || null;
  } catch (e: any) {
    myError.value = e?.message || '加载我的挂单失败';
  }
}

/** 官方购买：填写束数 → 确认 → POST /market/official-buy */
function doOfficialBuy() {
  if (buyingOfficial.value) return;
  officialError.value = '';
  officialNeedRecharge.value = false;
  if (!isAuthenticated()) {
    uni.showToast({ title: '请先登录后再购买', icon: 'none' });
    goLogin();
    return;
  }
  const bundles = buyBundlesNum.value;
  if (bundles < 1) {
    officialError.value = '请输入整数束数（1 束 = 100 片）';
    return;
  }
  uni.showModal({
    title: '确认购买官方竹简',
    content: `${bundles} 束（${bundles * PIECES_PER_BUNDLE} 片）· 应付 ¥${officialTotalYuan.value}`,
    confirmText: '确认支付',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) void submitOfficialBuy(bundles);
    },
  });
}

async function submitOfficialBuy(bundles: number) {
  buyingOfficial.value = true;
  officialError.value = '';
  officialNeedRecharge.value = false;
  try {
    const res = await postOfficialBuy(bundles);
    uni.showToast({
      title: `购买成功：到账 ${res.pieces} 片，余额 ¥${(res.balance_cents / 100).toFixed(2)}`,
      icon: 'none',
    });
    buyBundles.value = '1';
    await loadAll();
  } catch (e: any) {
    const msg = e?.message || '购买失败';
    officialError.value = msg;
    // 409「人民币余额不足」→ 后端文案 + 去钱包页充值引导（docs/economy-market.spec.md §7.4）
    officialNeedRecharge.value = e instanceof ApiStatusError && e.status === 409 && /余额不足/.test(msg);
  } finally {
    buyingOfficial.value = false;
  }
}

/** 挂单：整束 + 自由报价（平台不设最低/最高价，不做任何限价校验） */
async function doCreateListing() {
  if (creating.value) return;
  formError.value = '';
  const bundles = toPositiveInt(formBundles.value);
  const priceSeeds = toPositiveInt(formPrice.value);
  if (bundles < 1) {
    formError.value = '请输入整数束数（1 束 = 100 片）';
    return;
  }
  if (priceSeeds < 1) {
    formError.value = '请输入石榴籽标价（正整数）';
    return;
  }
  creating.value = true;
  try {
    const res = await postMarketList(bundles, priceSeeds);
    uni.showToast({
      title: `挂单成功：${res.pieces} 片（${bundles} 束）· ${priceSeeds} 籽 · ${LISTING_TTL_DAYS} 天内未成交自动下架`,
      icon: 'none',
      duration: 3000,
    });
    formBundles.value = '';
    formPrice.value = '';
    await loadAll();
  } catch (e: any) {
    const msg = e?.message || '挂单失败';
    formError.value = msg;
    if (isAssetInsufficientError(e)) {
      // 可用竹片不足：后端文案 + 「可用 N 束（已扣除挂单占用）」+ 去我的资产引导
      formError.value = `${msg}（可用 ${availableBundles.value} 束，已扣除挂单占用）`;
      showAssetInsufficientGuide(e, { title: '可用竹片不足' });
    }
  } finally {
    creating.value = false;
  }
}

function confirmCancel(listing: MarketListing) {
  uni.showModal({
    title: '撤销挂单',
    content: `确认撤销「${listing.bundles} 束 · ${listing.price_seeds} 籽」的挂单？撤销后锁定竹片回到可用量。`,
    confirmText: '确认撤单',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) void doCancel(listing);
    },
  });
}

async function doCancel(listing: MarketListing) {
  if (cancellingId.value) return;
  cancellingId.value = listing.id;
  myError.value = '';
  try {
    await postMarketCancel(listing.id);
    uni.showToast({ title: '已撤单，锁定竹片已释放', icon: 'none' });
    await loadAll();
  } catch (e: any) {
    myError.value = e?.message || '撤单失败';
  } finally {
    cancellingId.value = '';
  }
}

function openBuyConfirm(listing: MarketListing) {
  if (!isAuthenticated()) {
    uni.showToast({ title: '请先登录后再买入', icon: 'none' });
    goLogin();
    return;
  }
  buyError.value = '';
  buyTarget.value = listing;
}

function closeBuyConfirm() {
  if (buying.value) return;
  buyError.value = '';
  buyTarget.value = null;
}

async function doBuy() {
  const target = buyTarget.value;
  if (!target || buying.value) return;
  buying.value = true;
  buyError.value = '';
  try {
    const res = await postMarketBuy(target.id);
    buyTarget.value = null;
    const feeText = res.fee_seeds > 0 ? `手续费 ${res.fee_seeds} 籽` : '手续费免收';
    uni.showToast({
      title: `买入成功：${res.pieces} 片 / 付出 ${res.price_seeds} 籽（${feeText}）`,
      icon: 'none',
      duration: 3000,
    });
    await loadAll();
  } catch (e: any) {
    const msg = e?.message || '买入失败';
    if (isAssetInsufficientError(e)) {
      // 籽不足 409：后端文案 + 去我的资产引导
      buyTarget.value = null;
      buyError.value = '';
      showAssetInsufficientGuide(e, { title: '石榴籽不足' });
      await loadAll();
    } else {
      buyError.value = msg;
    }
  } finally {
    buying.value = false;
  }
}

// ---------- 展示工具 ----------

function isMine(listing: MarketListing): boolean {
  return !!myPhone.value && listing.seller_phone === myPhone.value;
}

/** 剩余时限：优先服务端 days_left，否则按 expires_at 向上取整到天 */
function daysLeft(listing: MarketListing): number {
  if (typeof listing.days_left === 'number' && listing.days_left > 0) return listing.days_left;
  const ms = new Date(listing.expires_at).getTime() - nowTs.value;
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / 86400000));
}

const STATUS_LABELS: Record<string, string> = {
  open: '在售中',
  sold: '已成交',
  cancelled: '已撤单',
  expired: '已过期',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

function maskPhone(phone: string): string {
  if (!phone) return '—';
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
}

/** 严格正整数解析（小数、负数、空串一律视为无效，不静默截断） */
function toPositiveInt(raw: string): number {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) return 0;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : 0;
}

/** 北京时间（UTC+8）当日的分钟数（用于 21:00 发售时点判定） */
function cnMinutesOfDay(ts: number): number {
  const d = new Date(ts + 8 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** 北京时间（UTC+8）自然日 YYYY-MM-DD */
function cnDateOf(ts: number): string {
  const d = new Date(ts + 8 * 3600 * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function goWallet() {
  uni.navigateTo({ url: '/pages/wallet/index' });
}
</script>

<style scoped>
.container { padding: 20px; }
.section {
  background: #fff; border-radius: 12px; padding: 16px;
  margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.section-title { font-size: 15px; font-weight: bold; color: #3E2723; display: block; }
.section-extra { font-size: 12px; color: #999; }
.section-hint { font-size: 11px; color: #B5A594; display: block; margin-top: 6px; line-height: 1.6; }
.section-error { font-size: 12px; color: #C62828; display: block; margin-top: 8px; line-height: 1.6; }

.official-price { font-size: 14px; color: #8B4513; font-weight: bold; display: block; margin-top: 10px; }
.official-stock { font-size: 14px; color: #2E7D32; display: block; margin-top: 6px; }
.buy-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
.buy-row .input { flex: 1; }
.inline-btn { margin-top: 8px; }

.asset-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid #f5f0ea;
}
.asset-row:last-child { border-bottom: none; }
.asset-name { font-size: 14px; color: #3E2723; }
.asset-value { font-size: 15px; font-weight: bold; color: #8B4513; }

.compliance { font-size: 11px; color: #B5A594; display: block; margin-top: 10px; line-height: 1.6; }
.compliance-footer { text-align: center; margin-top: 4px; }

.empty { text-align: center; color: #999; padding: 16px 0; font-size: 13px; }
.link { color: #8B4513; font-size: 13px; display: block; margin-top: 8px; text-decoration: underline; }

.row-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-bottom: 1px solid #f5f0ea;
}
.row-item:last-child { border-bottom: none; }
.row-left { flex: 1; }
.row-main { font-size: 14px; color: #555; display: block; }
.row-sub { font-size: 11px; color: #B5A594; margin-top: 2px; display: block; }
.own-tag { font-size: 12px; color: #B5A594; }

/* 石榴籽行内图标（统一经 business/icons.ts 常量引用，禁止手写 /static 路径） */
.ico-line { display: flex; align-items: center; gap: 6rpx; }
.ico-sm { width: 28rpx; height: 28rpx; flex-shrink: 0; }

.form-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.form-label { font-size: 13px; color: #3E2723; width: 72px; flex-shrink: 0; }
.form-row .input { flex: 1; }
.form-submit { margin-top: 14px; }

.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 86%; max-width: 380px; background: #fff; border-radius: 14px;
  padding: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}
.modal-title { font-size: 17px; font-weight: bold; color: #3E2723; display: block; text-align: center; }
.modal-sub { font-size: 12px; color: #999; display: block; text-align: center; margin: 6px 0 14px; }
.modal-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid #f5f0ea;
}
.modal-label { font-size: 13px; color: #999; }
.modal-value { font-size: 14px; font-weight: bold; color: #3E2723; }
.modal-hint { font-size: 11px; color: #B5A594; display: block; margin-top: 10px; line-height: 1.6; }
.modal-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }

.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }
</style>
