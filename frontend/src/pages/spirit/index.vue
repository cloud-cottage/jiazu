<template>
  <view class="container">
    <!-- 页面级错误（缺 tree_id / 404 家族树不存在 / 网络失败）：不崩，只降级提示 -->
    <view v-if="fatalError" class="section fatal-box">
      <text class="fatal-text">{{ fatalError }}</text>
    </view>

    <template v-else>
      <!-- ① 状态区：四态文案 + 灵气到期日 + 缓冲截止日 + 停用引导 -->
      <view class="section status" :class="statusClass">
        <text class="status-main">{{ stateMain }}</text>
        <text class="status-sub">{{ stateSub }}</text>
        <text v-if="info && info.spirit_expires_at" class="status-line">
          灵气到期日 {{ formatDate(info.spirit_expires_at) }}
        </text>
        <text v-if="info && info.status === 'buffer' && info.buffer_until" class="status-line">
          缓冲截止日 {{ formatDate(info.buffer_until) }}
        </text>
        <text v-if="info && info.status === 'active' && info.buffer_until_preview" class="status-line">
          到期后自动进入 30 天缓冲期（至 {{ formatDate(info.buffer_until_preview) }}）
        </text>
        <text v-if="treeId" class="status-tree">家族树 {{ treeTitle || treeId }}</text>

        <view v-if="guideText" class="guide">
          <text class="guide-text">{{ guideText }}</text>
        </view>
        <view v-if="info && info.status === 'expired'" class="banner">
          <text class="banner-text">时流子域已停用 · 灌注玉露灵泽可重新激活（数据保留）</text>
        </view>
      </view>

      <!-- ② 镶玉区：凹槽唯一、镶嵌不可逆 -->
      <view class="section">
        <view class="ico-line">
          <image class="ico-sm" :src="ICON.JADE" mode="aspectFit" />
          <text class="section-title">家族树凹槽 · 镶玉</text>
        </view>

        <template v-if="isMounted">
          <view class="jade-mounted">
            <view class="ico-line">
              <image class="ico-sm" :src="ICON.JADE" mode="aspectFit" />
              <text class="jade-line">已镶玉：{{ shortId(mountedJade?.jade_id) }}</text>
            </view>
            <text class="jade-line">镶嵌时间 {{ formatDate(mountedJade?.mounted_at || '') }}</text>
            <text class="jade-line">
              玉有效期 {{ mountedJade?.expires_at ? formatDate(mountedJade.expires_at) : '永久有效' }}
            </text>
            <text class="jade-warn">
              镶嵌即永久占用本树唯一凹槽：该玉已销毁，不可取回、不可分解、不可二次使用。
            </text>
            <view class="ico-line">
              <image class="ico-sm" :src="ICON.JADE" mode="aspectFit" />
              <text class="jade-note">凹槽已占用，每棵家族树仅可镶嵌 1 枚石榴籽玉。</text>
            </view>
          </view>
        </template>

        <template v-else>
          <view class="ico-line">
            <image class="ico-sm" :src="ICON.JADE" mode="aspectFit" />
            <text class="section-hint">本树凹槽未占用 · 选择本人未镶嵌的石榴籽玉即可解锁「时流子域」</text>
          </view>
          <view v-if="!isAuthenticated()" class="empty">
            <text>请先登录后镶嵌石榴籽玉</text>
            <text class="link" @click="goLogin">去登录</text>
          </view>
          <view v-else-if="unmountedJades.length === 0" class="empty">
            <text v-if="jades.length">您持有的石榴籽玉均已镶嵌，每棵家族树仅可镶嵌 1 枚</text>
            <text v-else>需先合成石榴籽玉（{{ JADE_SYNTH_SEEDS }} 颗石榴籽可合成 1 枚）</text>
            <text class="link" @click="goMyAssets">去我的资产</text>
          </view>
          <view v-for="j in unmountedJades" :key="j.id" class="row-item">
            <view class="row-left">
              <text class="row-main">{{ jadeLabel(j) }}</text>
              <text class="row-sub">合成于 {{ formatDate(j.created_at) }}</text>
            </view>
            <t-button
              size="small"
              theme="primary"
              :loading="mountingId === j.id"
              :disabled="mountingId !== ''"
              @click="confirmMount(j.id)"
            >镶嵌</t-button>
          </view>
        </template>
      </view>

      <!-- ③ 蓄能区：五档位（数值**只由接口 plans 下发**）+ 灌注玉露灵泽（8.1 定稿确认） -->
      <view class="section">
        <view class="section-head">
          <text class="section-title">玉露灵泽蓄能</text>
          <view class="ico-line ico-line-end">
            <image class="ico-seed" :src="ICON.SEED" mode="aspectFit" />
            <text class="section-extra">可用 {{ seedsTotal }} 颗石榴籽</text>
          </view>
        </view>

        <view v-if="!isMounted" class="section-hint">本树尚未镶嵌石榴籽玉，镶嵌后方可灌注玉露灵泽。</view>

        <!-- 档位数据缺失 / 为空：明确的加载失败态 + 重拉（不显示前端自造数值） -->
        <view v-if="!plansReady" class="empty">
          <text>档位数据加载失败，暂无可用档位</text>
          <t-button
            size="small"
            variant="outline"
            theme="primary"
            class="retry-btn"
            :loading="plansLoading"
            @click="reloadPlans"
          >重新加载档位</t-button>
        </view>

        <template v-else>
          <view class="plan-grid">
            <view
              v-for="c in planCards"
              :key="c.plan"
              class="plan-card"
              :class="{ on: c.plan === selectedKey }"
              @click="selectPlan(c.plan)"
            >
              <text class="plan-name">{{ c.label }}</text>
              <text class="plan-seeds">{{ c.seeds }} 颗石榴籽</text>
              <text class="plan-days">延长 {{ c.days }} 天</text>
              <text v-if="c.bundles > 0" class="plan-gift">赠 {{ c.bundles }} 束竹简</text>
              <text v-if="c.short" class="plan-short">籽不足（需 {{ c.seeds }} 颗）</text>
              <text v-if="c.activity" class="plan-activity">限时活动</text>
            </view>
          </view>

          <t-button
            theme="primary"
            block
            class="charge-btn"
            :loading="charging"
            :disabled="!isMounted || charging"
            @click="confirmCharge"
          >灌注玉露灵泽</t-button>
          <text class="section-hint">灵气时长按档位叠加顺延，绝不覆盖、绝不缩短。</text>
        </template>
      </view>

      <!-- ④ 玉操作区：合成（8.2 定稿确认）/ 分解（免费 + 二次确认） -->
      <view class="section">
        <view class="ico-line">
          <image class="ico-sm" :src="ICON.JADE" mode="aspectFit" />
          <text class="section-title">石榴籽玉</text>
        </view>
        <text class="section-hint">{{ JADE_SYNTH_SEEDS }} 颗石榴籽合成 1 枚玉；分解免费，返还 {{ JADE_SYNTH_SEEDS }} 颗石榴籽（统一 {{ SEED_VALID_DAYS }} 天有效期）。</text>

        <t-button
          theme="primary"
          block
          class="op-btn"
          :loading="synthesizing"
          :disabled="synthesizing"
          @click="confirmSynthesize"
        >
          <view class="btn-inline">
            <image class="ico-sm" :src="ICON.JADE" mode="aspectFit" />
            <text>合成石榴籽玉（999 颗）</text>
          </view>
        </t-button>

        <view v-if="!isAuthenticated()" class="empty">
          <text>请先登录后合成 / 分解石榴籽玉</text>
        </view>
        <view v-else-if="unmountedJades.length === 0" class="empty">
          <text>暂无可分解的石榴籽玉</text>
        </view>
        <view v-for="j in unmountedJades" :key="'d-' + j.id" class="row-item">
          <view class="row-left">
            <text class="row-main">{{ jadeLabel(j) }}</text>
            <text class="row-sub">未镶嵌 · 可免费分解</text>
          </view>
          <t-button
            size="small"
            variant="outline"
            theme="primary"
            :loading="decomposingId === j.id"
            :disabled="decomposingId !== ''"
            @click="confirmDecompose(j.id)"
          >分解</t-button>
        </view>
      </view>

      <!-- ⑤ 灌注流水（该树成员可看；非成员 / 未登录按接口文案降级） -->
      <view class="section">
        <view class="section-head">
          <text class="section-title">灵泽蓄能流水</text>
          <text v-if="logsTotal > 0" class="section-extra">共 {{ logsTotal }} 条</text>
        </view>
        <view v-if="logsNotice" class="empty">
          <text>{{ logsNotice }}</text>
        </view>
        <view v-else-if="logs.length === 0" class="empty">
          <text>暂无灌注记录</text>
        </view>
        <view v-for="l in logs" :key="l.id" class="row-item">
          <view class="row-left">
            <text class="row-main">{{ logText(l) }}</text>
            <text v-if="l.gift_bamboos > 0" class="row-sub">本次赠送 {{ l.gift_bamboos }} 片竹简</text>
          </view>
          <text class="row-right">+{{ l.days }} 天</text>
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
import { onLoad } from '@dcloudio/uni-app';
import {
  ApiStatusError,
  fetchAssetsSummary,
  fetchSpirit,
  postDecomposeJade,
  postMountJade,
  postSpiritCharge,
  postSynthesizeJade,
  stateTextPrimary,
  stateTextSecondary,
} from '@/business/api';
import type { AssetsSummary, Jade, SpiritInfo, SpiritLogItem, SpiritPlan, SpiritPlanItem } from '@/business/api';
import { isAssetInsufficientError, showAssetInsufficientGuide } from '@/business/asset-guide';
import {
  DECOMPOSE_CONFIRM_BODY,
  DECOMPOSE_CONFIRM_TITLE,
  JADE_SYNTH_SEEDS,
  MOUNT_CONFIRM_BODY,
  MOUNT_CONFIRM_TITLE,
  SEED_VALID_DAYS,
  SYNTH_CONFIRM_BODY,
  SYNTH_CONFIRM_TITLE,
} from '@/business/jade-ops';
import { isAuthenticated } from '@/business/auth';
import { ICON } from '@/business/icons';

// ---- 定稿文案（真源 docs/economy-ops.spec.md §6.1；§6.3 运行时填值；逐字引用，不得改写） ----

/** 8.1 灌注玉露灵泽确认：标题行（逐字） */
const CHARGE_CONFIRM_TITLE = '⚠️ 灌注玉露灵泽确认';
/** 8.1 正文（【XX】颗石榴籽 = 档位实价；【XX】天 = 档位延长天数，运行时填值） */
function chargeConfirmBody(seeds: number, days: number): string {
  return [
    `本次操作将消耗${seeds}颗石榴籽，为家族谱系大树灌注玉露灵泽，家族灵气到期时间将向后延长${days}天。`,
    '消耗时将优先扣除您账户内即将最先到期的石榴籽，消耗后的石榴籽直接消失，不可退回。',
    '是否确认继续灌注玉露灵泽？',
  ].join('\n');
}

// 8.2 / 8.3 定稿文案与 999 / 360 / 365 常量统一来自唯一副本 @/business/jade-ops（见文件头 import）。

// ---- 渲染常量 ----

/** 档位中文名（仅用于展示；档位数值一律取自接口 plans） */
const PLAN_LABELS: Record<string, string> = {
  daily: '单日',
  monthly: '月度',
  quarterly: '季度',
  half_year: '半年度',
  yearly: '年度',
};

/** 四态主文案兜底（§4-6 非定稿文案，实施可调；后端 state_text.primary 优先） */
const STATE_FALLBACK: Record<string, string> = {
  none: '未开启时流子域',
  inactive: '时流子域 · 未激活',
  active: '灵气充盈',
  buffer: '灵气已尽 · 缓冲期',
  expired: '时流子域已停用',
};

/** 档位展示条目 */
interface PlanCard {
  plan: SpiritPlan;
  label: string;
  /** 单次扣费籽数（档位实价，8.1 文案取值口径） */
  seeds: number;
  days: number;
  /** 赠送束数（1 束 = 100 片） */
  bundles: number;
  /** 体验层置灰：可用籽数 < 档位实价（仍可点，准确数由后端 409 给出） */
  short: boolean;
  /** 限时活动档位（依据 interface activity.gift_enabled_plans） */
  activity: boolean;
}

// ---- 状态 ----

const treeId = ref('');
const treeTitle = ref('');
const info = ref<SpiritInfo | null>(null);
const remotePlans = ref<SpiritPlanItem[] | null>(null);
const assets = ref<AssetsSummary | null>(null);
const fatalError = ref('');
const error = ref('');
const selectedKey = ref<SpiritPlan>('daily');
const charging = ref(false);
const synthesizing = ref(false);
const mountingId = ref('');
const decomposingId = ref('');
/** 档位重拉中（蓄能区失败态的重试按钮 loading） */
const plansLoading = ref(false);

// ---- 派生 ----

const isMounted = computed(() => info.value?.mounted === true);
const mountedJade = computed(() => info.value?.jade || null);

const statusClass = computed(() => {
  const st = info.value?.status || 'none';
  return `status-${st}`;
});

const stateMain = computed(() => {
  const s = info.value;
  if (!s) return '加载中...';
  const fromApi = stateTextPrimary(s.state_text);
  if (fromApi) return fromApi;
  if (s.status === 'active') return `灵气充盈 · 剩余 ${Math.max(0, s.days_left || 0)} 天`;
  if (s.status === 'buffer') return `灵气已尽 · 缓冲期剩余 ${Math.max(0, s.buffer_days_left || 0)} 天`;
  return STATE_FALLBACK[s.status] || STATE_FALLBACK.none;
});

const stateSub = computed(() => {
  const s = info.value;
  if (!s) return '';
  const fromApi = stateTextSecondary(s.state_text);
  if (fromApi) return fromApi;
  if (s.status === 'active') {
    return s.spirit_expires_at ? `灵气到期日 ${formatDate(s.spirit_expires_at)}` : '灵气生效中';
  }
  if (s.status === 'buffer') {
    return s.buffer_until
      ? `缓冲期至 ${formatDate(s.buffer_until)}，续期可恢复`
      : '缓冲期内子域仍可用，续期可恢复';
  }
  if (s.status === 'inactive') return '灌注玉露灵泽即可开启';
  if (s.status === 'expired') return '灌注玉露灵泽可重新激活（数据保留）';
  return '镶嵌石榴籽玉，解锁本家族专属空间';
});

/** 停用态 / 未就绪态的引导文案（需先镶玉 / 需灌注续期） */
const guideText = computed(() => {
  const s = info.value;
  if (!s) return '';
  if (!s.mounted) return '需先镶玉：本树尚未镶嵌石榴籽玉，镶嵌后解锁「时流子域」并开启蓄能权限。';
  if (s.status === 'inactive') return '需灌注续期：凹槽已占用但灵气尚未激活，灌注玉露灵泽即可开启子域。';
  if (s.status === 'buffer') return '灵气已尽：缓冲期内子域仍可用，灌注玉露灵泽可恢复灵气。';
  if (s.status === 'expired') return '已停用：入口停用、已积累数据保留，灌注玉露灵泽即可重新激活。';
  return '';
});

/** 档位表：**唯一真源 = GET /spirit 出参 `plans`**（前端不得硬编码数值，docs/spirit-domain.spec.md §6-2 / §8-2） */
const plans = computed<SpiritPlanItem[]>(() => remotePlans.value || []);

/** 档位数据是否可用：缺失 / 为空 → 蓄能区显示加载失败 + 重试，不自行造数值 */
const plansReady = computed(() => plans.value.length > 0);

/** 活动开关放行的档位（限时活动赠送） */
const activityPlans = computed<string[]>(() => info.value?.activity?.gift_enabled_plans || []);

const planCards = computed<PlanCard[]>(() =>
  plans.value.map((p) => {
    const bundles = typeof p.gift_bundles === 'number'
      ? p.gift_bundles
      : Math.floor((p.gift_bamboos || 0) / 100);
    return {
      plan: p.plan,
      label: p.label || PLAN_LABELS[p.plan] || p.plan,
      seeds: p.seeds,
      days: p.days,
      bundles,
      short: assets.value !== null && seedsTotal.value < p.seeds,
      activity: activityPlans.value.includes(p.plan) && bundles > 0,
    };
  }),
);

const selectedCard = computed<PlanCard | null>(
  () => planCards.value.find((c) => c.plan === selectedKey.value) || planCards.value[0] || null,
);

const jades = computed<Jade[]>(() => assets.value?.jades || []);
/** 本人未镶嵌的玉（已镶嵌玉不可分解、不可二次使用） */
const unmountedJades = computed<Jade[]>(() => jades.value.filter((j) => !j.mounted_tree_id));
const seedsTotal = computed(() => assets.value?.seeds_total ?? 0);

const logs = computed<SpiritLogItem[]>(() => info.value?.logs || []);
const logsTotal = computed(() => info.value?.logs_total || 0);
/** 流水不可见文案（成员口径之外的降级；后端文案优先） */
const logsNotice = computed(() => {
  const s = info.value;
  if (!s) return '';
  if (s.logs_visible) return '';
  if (s.logs_notice) return s.logs_notice;
  return isAuthenticated() ? '灵泽蓄能流水仅家族成员可查看' : '请先登录后查看灵泽蓄能流水';
});

// ---- 生命周期 ----

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

onMounted(async () => {
  await refreshAll();
});

async function refreshAll() {
  await loadSpirit();
  await loadAssets();
}

async function loadSpirit() {
  if (!treeId.value) {
    fatalError.value = '缺少 tree_id：请从家族树首页的「🕰 时流子域」入口进入';
    return;
  }
  fatalError.value = '';
  try {
    const data = await fetchSpirit(treeId.value);
    info.value = data;
    treeTitle.value = data.tree_title || '';
    const list = normalizePlans(data.plans);
    remotePlans.value = list;
    if (list.length && !list.some((p) => p.plan === selectedKey.value)) {
      selectedKey.value = list[0].plan;
    }
  } catch (e: any) {
    info.value = null;
    remotePlans.value = null;
    fatalError.value = e?.message || '加载时流子域失败';
  }
}

/**
 * 档位重拉（蓄能区失败态的重试入口）：重发 `GET /spirit` 取唯一真源 `plans`。
 * 再次失败仍停留在失败态（不显示任何前端自造数值）。
 */
async function reloadPlans() {
  if (plansLoading.value) return;
  plansLoading.value = true;
  await loadSpirit();
  plansLoading.value = false;
}

async function loadAssets() {
  if (!isAuthenticated()) {
    assets.value = null;
    return;
  }
  try {
    assets.value = await fetchAssetsSummary();
  } catch {
    assets.value = null;
  }
}

/**
 * 档位表归一化：只接受接口下发的数组形态（`plans` 出参 = 数组，数值真源）。
 * 非数组 / 为空 → 返空数组，由蓄能区走「加载失败 + 重试」，**不造数值**。
 */
function normalizePlans(raw: SpiritPlanItem[] | undefined): SpiritPlanItem[] {
  if (Array.isArray(raw) && raw.length) {
    return raw.filter((p) => typeof p?.seeds === 'number' && typeof p?.days === 'number');
  }
  return [];
}

// ---- 蓄能（8.1 定稿确认 → POST /spirit/charge） ----

function selectPlan(plan: SpiritPlan) {
  selectedKey.value = plan;
}

function confirmCharge() {
  if (!isMounted.value || charging.value) return;
  if (!isAuthenticated()) {
    goLogin();
    return;
  }
  const card = selectedCard.value;
  if (!card) return;
  // 取消则不发请求（docs/spirit-domain.spec.md §8-2）
  uni.showModal({
    title: CHARGE_CONFIRM_TITLE,
    content: chargeConfirmBody(card.seeds, card.days),
    confirmText: '确认灌注',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) doCharge(card.plan);
    },
  });
}

async function doCharge(plan: SpiritPlan) {
  charging.value = true;
  error.value = '';
  try {
    const res = await postSpiritCharge(treeId.value, plan);
    const gift = res?.gift_bamboos > 0 ? `，赠 ${res.gift_bamboos} 片竹简` : '';
    uni.showToast({ title: `灌注成功${gift}`, icon: 'none' });
    await refreshAll();
  } catch (e: any) {
    if (isSeedsInsufficient(e)) {
      // 籽不足 409：toast 后端原文（含准确可用数）+ 资产页引导
      showAssetInsufficientGuide(e);
    } else {
      error.value = e?.message || '灌注失败';
      uni.showToast({ title: error.value, icon: 'none' });
    }
    await loadSpirit();
  } finally {
    charging.value = false;
  }
}

// ---- 镶嵌（8.3 定稿不可逆确认 → POST /spirit/mount-jade） ----

function confirmMount(jadeId: string) {
  if (!jadeId || mountingId.value) return;
  uni.showModal({
    title: MOUNT_CONFIRM_TITLE,
    content: MOUNT_CONFIRM_BODY,
    confirmText: '确认镶嵌',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) doMount(jadeId);
    },
  });
}

async function doMount(jadeId: string) {
  mountingId.value = jadeId;
  error.value = '';
  try {
    await postMountJade(treeId.value, jadeId);
    uni.showToast({ title: '镶嵌成功，时流子域已解锁', icon: 'none' });
    await refreshAll();
  } catch (e: any) {
    // 失败直出后端原文（400「中华世本无时流子域凹槽」/ 409「该家族树凹槽已镶嵌石榴籽玉」/
    // 409「该石榴籽玉已镶嵌，不可重复使用」/ 404「未找到该石榴籽玉」），并刷新两侧真源状态
    error.value = e?.message || '镶嵌失败';
    uni.showToast({ title: error.value, icon: 'none' });
    await refreshAll();
  } finally {
    mountingId.value = '';
  }
}

// ---- 合成（8.2 定稿确认）/ 分解（免费 + 二次确认） ----

function confirmSynthesize() {
  if (synthesizing.value) return;
  if (!isAuthenticated()) {
    goLogin();
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
    const tail = res?.permanent
      ? '（永久有效）'
      : res?.expires_at
        ? `（有效期至 ${formatDate(res.expires_at)}）`
        : '';
    await loadAssets();
    uni.showToast({
      title: `合成成功${tail}，消耗 ${res?.seeds_deducted || JADE_SYNTH_SEEDS} 颗，余 ${seedsTotal.value} 颗石榴籽`,
      icon: 'none',
      duration: 4000,
    });
  } catch (e: any) {
    if (isSeedsInsufficient(e)) {
      showAssetInsufficientGuide(e);
    } else {
      error.value = e?.message || '合成失败';
      uni.showToast({ title: error.value, icon: 'none' });
    }
  } finally {
    synthesizing.value = false;
  }
}

function confirmDecompose(jadeId: string) {
  if (!jadeId || decomposingId.value) return;
  // 分解免费：仅需二次确认（不走 8.2 合成文案）
  uni.showModal({
    title: DECOMPOSE_CONFIRM_TITLE,
    content: DECOMPOSE_CONFIRM_BODY,
    confirmText: '确认分解',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) doDecompose(jadeId);
    },
  });
}

async function doDecompose(jadeId: string) {
  decomposingId.value = jadeId;
  error.value = '';
  try {
    const res = await postDecomposeJade(jadeId);
    uni.showToast({
      title: `已分解，返还 ${res?.seeds_returned || JADE_SYNTH_SEEDS} 颗石榴籽，余 ${seedsTotal.value} 颗`,
      icon: 'none',
    });
    await loadAssets();
  } catch (e: any) {
    error.value = e?.message || '分解失败';
    uni.showToast({ title: error.value, icon: 'none' });
  } finally {
    decomposingId.value = '';
  }
}

/** 籽不足判定：优先业务码，其次后端文案（含「石榴籽不足 / 资产不足」） */
function isSeedsInsufficient(e: unknown): boolean {
  if (isAssetInsufficientError(e)) return true;
  if (!(e instanceof ApiStatusError) || e.status !== 409) return false;
  return /石榴籽不足|资产不足/.test(e.message || '');
}

// ---- 展示工具 ----

/** 档位中文名（流水展示用） */
function planLabelOf(plan: string): string {
  return PLAN_LABELS[plan] || plan;
}

/** 流水文案：「X 于 YYYY-MM-DD 灌注 <档位>，消耗 N 颗，灵气延长至 Z」 */
function logText(l: SpiritLogItem): string {
  return `${l.phone || '匿名'} 于 ${formatDate(l.ts)} 灌注${planLabelOf(l.plan)}，消耗 ${l.seeds} 颗，灵气延长至 ${formatDate(l.spirit_expires_at_after)}`;
}

function jadeLabel(j: Jade): string {
  const exp = j.expires_at ? `有效期至 ${formatDate(j.expires_at)}` : '永久有效';
  return `${shortId(j.id)} · ${exp}`;
}

function shortId(id: string | undefined): string {
  if (!id) return '—';
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function goMyAssets() {
  uni.navigateTo({ url: '/pages/assets/index' });
}
</script>

<style scoped>
.container { padding: 20px; }
.section {
  background: #fff; border-radius: 12px; padding: 16px;
  margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.section-title { font-size: 15px; font-weight: bold; color: #3E2723; display: block; }
.section-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 10px;
}
.section-head .section-title { margin-bottom: 0; }
.section-extra { font-size: 12px; color: #8B4513; }
.section-hint { font-size: 12px; color: #B5A594; display: block; margin: 8px 0; }

/* 石榴籽 / 石榴籽玉 行内图标（统一经 business/icons.ts 常量引用，禁止手写 /static 路径） */
.ico-line { display: flex; align-items: center; gap: 8rpx; }
.ico-line-end { justify-content: flex-end; flex-shrink: 0; }
.ico-sm { width: 40rpx; height: 40rpx; flex-shrink: 0; }
.ico-seed { width: 36rpx; height: 36rpx; flex-shrink: 0; }
.btn-inline { display: flex; align-items: center; justify-content: center; gap: 8rpx; }

.status { border-left: 4px solid #B5A594; }
.status-active { border-left-color: #2E7D32; }
.status-buffer { border-left-color: #EF6C00; }
.status-expired { border-left-color: #C62828; }
.status-none { border-left-color: #8B4513; }
.status-main { font-size: 17px; font-weight: bold; color: #3E2723; display: block; }
.status-sub { font-size: 13px; color: #8B4513; display: block; margin-top: 4px; }
.status-line { font-size: 12px; color: #555; display: block; margin-top: 4px; }
.status-tree { font-size: 11px; color: #B5A594; display: block; margin-top: 6px; }

.guide { margin-top: 10px; padding: 10px 12px; background: #FBF6EF; border-radius: 8px; }
.guide-text { font-size: 12px; color: #8B4513; }
.banner { margin-top: 10px; padding: 10px 12px; background: #FDECEA; border-radius: 8px; }
.banner-text { font-size: 12px; color: #C62828; font-weight: bold; }

.jade-mounted { margin-top: 8px; }
.jade-line { font-size: 13px; color: #3E2723; display: block; margin-bottom: 4px; }
.jade-warn { font-size: 12px; color: #C62828; display: block; margin-top: 8px; }
.jade-note { font-size: 11px; color: #B5A594; display: block; margin-top: 4px; }

.plan-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.plan-card {
  width: 30%; flex: 1 1 30%; min-width: 96px;
  border: 1px solid #F0E7DC; border-radius: 10px; padding: 10px 8px;
  background: #FFFDFA; text-align: center;
}
.plan-card.on { border-color: #8B4513; background: #FBF6EF; }
.plan-name { font-size: 13px; font-weight: bold; color: #3E2723; display: block; }
.plan-seeds { font-size: 12px; color: #8B4513; display: block; margin-top: 4px; }
.plan-days { font-size: 11px; color: #555; display: block; margin-top: 2px; }
.plan-gift { font-size: 11px; color: #2E7D32; display: block; margin-top: 2px; }
.plan-short { font-size: 11px; color: #C62828; display: block; margin-top: 2px; }
.plan-activity { font-size: 10px; color: #fff; background: #EF6C00; border-radius: 8px; padding: 1px 6px; display: inline-block; margin-top: 4px; }

.charge-btn { margin-top: 6px; }
.retry-btn { margin-top: 10px; }
.op-btn { margin-top: 4px; }

.empty { text-align: center; color: #999; padding: 14px 0; font-size: 13px; }
.link { color: #2C5F8A; font-size: 13px; display: block; margin-top: 6px; }

.row-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-bottom: 1px solid #f5f0ea;
}
.row-item:last-child { border-bottom: none; }
.row-left { flex: 1; }
.row-main { font-size: 13px; color: #555; display: block; }
.row-sub { font-size: 11px; color: #B5A594; margin-top: 2px; display: block; }
.row-right { font-size: 13px; font-weight: bold; color: #2E7D32; }

.fatal-box { text-align: center; }
.fatal-text { font-size: 13px; color: #C62828; }
.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }
</style>
