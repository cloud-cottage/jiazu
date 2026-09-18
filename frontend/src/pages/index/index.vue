<template>
  <view class="container">
    <view class="header">
      <text class="title">家族历史数字馆</text>
      <text class="subtitle">多姓氏、多支派家谱数字化展示平台</text>
    </view>

    <!-- 双视图：家族列表 / 中华世本（浮动按钮切换，无 t-tabs） -->
    <!-- 视图1：普通家族树列表（不含 zhonghua） -->
    <view v-if="!showMaster" class="hall-list">
      <!-- 全站人物搜索（跨家族树：姓名 / 编号；回车或点「搜索」触发） -->
      <view class="person-search">
        <t-input
          :value="personQuery"
          placeholder="搜索人物（姓名 / 编号）"
          class="person-search-input"
          @update:value="onPersonQueryChange"
          @confirm="doSearchPeople"
        />
        <t-button size="small" theme="primary" @click="doSearchPeople">搜索</t-button>
      </view>
      <view v-if="personSearched" class="person-search-panel">
        <view v-if="personSearching" class="ps-tip">搜索中…</view>
        <view v-else-if="personSearchError" class="ps-tip ps-error">{{ personSearchError }}</view>
        <template v-else>
          <view
            v-for="hit in personHits"
            :key="`${hit.tree_id}:${hit.handle}`"
            class="ps-result"
            :class="{ 'ps-result-restricted': hit.restricted }"
            @click="goPersonHit(hit)"
          >
            <text class="ps-name">{{ hit.name }}</text>
            <text class="ps-id">{{ personIdDisplay(hit.gramps_id) }}</text>
            <text class="ps-tree">{{ hit.tree_title }}</text>
            <text v-if="hit.restricted" class="ps-restricted">权限受限，不可见详情</text>
          </view>
          <view v-if="personHits.length === 0" class="ps-tip">未找到匹配人物</view>
        </template>
      </view>

      <!-- 一行两段：左＝排序分段控件（综合 / 人数 / 活跃度，仅「家族」tab 有）；
           右＝列表切换（家族 | 祖谱）。只用已加载的等级数据，不新增请求 -->
      <view class="sort-bar">
        <view v-if="listTab === 'family'" class="sort-group">
          <view
            class="sort-btn"
            :class="{ active: sortMode === 'comprehensive' }"
            @click="sortMode = 'comprehensive'"
          >
            <text class="sort-text">综合</text>
          </view>
          <view
            class="sort-btn"
            :class="{ active: sortMode === 'members' }"
            @click="sortMode = 'members'"
          >
            <text class="sort-text">人数</text>
          </view>
          <view
            class="sort-btn"
            :class="{ active: sortMode === 'activity' }"
            @click="sortMode = 'activity'"
          >
            <text class="sort-text">活跃度</text>
          </view>
        </view>
        <view class="tab-switch">
          <view
            class="tab-btn"
            :class="{ active: listTab === 'family' }"
            @click="listTab = 'family'"
          >
            <text class="tab-text">家族</text>
          </view>
          <view
            class="tab-btn"
            :class="{ active: listTab === 'clan' }"
            @click="listTab = 'clan'"
          >
            <text class="tab-text">祖谱</text>
          </view>
        </view>
      </view>

      <!-- 加载态（与卡片同形，避免先闪「暂无」空态、避免布局跳动） -->
      <view v-if="loading" class="loading">
        <t-loading theme="spinner" text="加载中…" />
      </view>

      <t-cell-group v-else-if="visibleHalls.length > 0" :bordered="false">
        <t-cell
          v-for="card in visibleHalls"
          :key="card.tree_id"
          :title="card.title"
          :description="`发源地：${card.origin || '待完善'}`"
          :border="true"
          arrow
          @click="goToHall(card)"
        >
          <template #note>
            <view class="note-line">
              <text class="note-text">{{ card.description }}</text>
              <text class="people-tag">{{ peopleText(card.tree_id) }}</text>
              <t-tag v-if="rankLabel(card.tree_id)" :theme="rankTheme(card.tree_id)" variant="light" size="small" class="rank-tag">
                {{ rankLabel(card.tree_id) }}
              </t-tag>
            </view>
          </template>
        </t-cell>
      </t-cell-group>

      <view v-else class="empty">
        <text>{{ listTab === 'clan' ? '暂无祖谱' : '暂无已上线的家族数字馆' }}</text>
      </view>

      <!-- 新建家族树（仅总编辑；只在「家族」tab 显示 —— 它是建家族树的入口） -->
      <view v-if="canCreateTree && listTab === 'family'" class="create-entry" @click="openCreateTree">
        <text class="create-icon">＋</text>
        <text class="create-text">新建家族树</text>
        <text class="create-hint">消耗 {{ TREE_CREATE_FEE_SEEDS }}颗石榴籽</text>
      </view>
    </view>

    <!-- 视图2：中华世本（纵向时间轴；与 /zhonghua 为同一页面组件） -->
    <ShibenTimeline v-else />

    <view class="footer">
      <text class="link" @click="goToPage('/pages/about/about')">关于本站 · 免责声明</text>
    </view>

    <!-- 浮动切换按钮（右侧，固定在 tabbar 上方） -->
    <view class="floating-switch" @click="toggleView">
      <text class="floating-icon">{{ showMaster ? '🏠' : '🌐' }}</text>
      <text class="floating-text">{{ showMaster ? '家族列表' : '中华世本' }}</text>
    </view>

    <!-- 新建家族树表单（内联弹层） -->
    <view v-if="showCreate" class="ct-mask" @click="closeCreate">
      <view class="ct-modal" @click.stop>
        <view class="ct-head">
          <text class="ct-title">新建家族树</text>
          <text class="ct-close" @click="closeCreate">✕</text>
        </view>
        <view class="ct-body">
          <text class="ct-label">姓氏（单个汉字）</text>
          <t-input
            :value="form.surname"
            placeholder="如：季"
            @update:value="(v: any) => (form.surname = v)"
          />
          <text class="ct-label">始祖名（姓随家族姓氏）</text>
          <t-input
            :value="form.founder_name"
            placeholder="如：文子 → 季文子"
            @update:value="(v: any) => (form.founder_name = v)"
          />
          <text class="ct-label">始祖性别</text>
          <t-radio-group
            :value="form.gender"
            placement="horizontal"
            @update:value="(v: any) => (form.gender = v)"
          >
            <t-radio value="M">男</t-radio>
            <t-radio value="F">女</t-radio>
            <t-radio value="U">未知</t-radio>
          </t-radio-group>
          <text class="ct-label">家族显示名（选填，默认「{{ form.surname || 'X' }}氏家族」）</text>
          <t-input
            :value="form.display_title"
            placeholder="选填"
            @update:value="(v: any) => (form.display_title = v)"
          />
          <text class="ct-label">发源地（选填）</text>
          <t-input
            :value="form.origin"
            placeholder="选填，如：山东费县"
            @update:value="(v: any) => (form.origin = v)"
          />
          <view class="ct-fee">
            <text class="ct-fee-text">建树消耗 {{ TREE_CREATE_FEE_SEEDS }}颗石榴籽（可用籽数见「我的资产」）</text>
            <text class="ct-fee-sub">tree_id 自动生成（姓氏拼音_码点_序号），创建后可立即新增人物</text>
          </view>
          <text v-if="createError" class="ct-error">{{ createError }}</text>
          <t-button
            theme="primary"
            block
            :loading="creating"
            :disabled="!canSubmitCreate"
            @click="doCreateTree"
          >创建家族树</t-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchTreeMetaRemote, buildTreeUrl, fetchTreeRank, openTreeHome, clearMetaCache, createTree, feeText, isAssetInsufficientError, showAssetInsufficientGuide, searchPeopleGlobal, personIdDisplay } from '@/business';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import type { DigitalHallCard, TreeMeta } from '@/business/types';
import type { TreeRankInfo, GlobalPersonHit } from '@/business/api';
import ShibenTimeline from '@/components/shiben-timeline/shiben-timeline.vue';

/**
 * 建树确认弹窗文案（docs/economy-ops.spec.md §6.1 第 8.4 条 · 定稿文案，
 * **逐字使用，不得改写 / 增删标点**；原文 `/` 为换行：首行为弹窗标题，其余为正文）。
 */
const TREE_CREATE_CONFIRM = {
  title: '⚠️ 创建家族树确认',
  content:
    '本次操作将消耗9颗石榴籽，创建全新家族谱系大树。\n' +
    '消耗时将优先扣除您账户内即将最先到期的石榴籽；若后续删除家族树，本次消耗的石榴籽不予退回。\n' +
    '确认创建家族树？',
  confirmText: '确认创建',
  cancelText: '取消',
} as const;

/**
 * 建树费籽数（石榴籽）。
 * 展示口径（用户拍板）：一律写「9颗石榴籽」——不带空格、不带「完整」二字，与 8.4 定稿确认弹窗逐字一致。
 * 规格依据：`docs/economy.spec.md` §5-5（建树改扣石榴籽）+ §9 前端落点表；
 * 单价真源：`cloudfunctions/compat-api/lib/economy-fee.js` 的 `FEE.tree_create_seeds: 9`
 * （前端无可读接口，故以命名常量承载，勿在模板里散写数字）。
 * 展示口径：建树费**不再用 ¥ 展示**（人民币余额只用于购买官方竹简）。
 */
const TREE_CREATE_FEE_SEEDS = 9;

const halls = ref<DigitalHallCard[]>([]);
const meta = ref<TreeMeta | null>(null);
/** 列表加载态（纯视觉：首屏不再先闪「暂无…」空态） */
const loading = ref(true);

// ---- 双视图切换（浮动按钮） ----
const showMaster = ref(false);

/**
 * 列表 tab（家族 / 祖谱）：只切换渲染的列表与入口，不改双视图逻辑；
 * 切换 tab **不重置** sortMode（切回家族 tab 时保留用户上次选择）。
 */
const listTab = ref<'family' | 'clan'>('family');

/**
 * 普通家族树列表：排除中华世本（is_master）与祖谱（kind='clan'）。
 * 旧 meta 条目缺 kind 字段 → 按 family 兼容（`kind !== 'clan'` 天然放行 undefined）。
 */
const normalHalls = computed(() => halls.value.filter((h) => !h.isMaster && h.kind !== 'clan'));

/** 祖谱列表（kind='clan'）：只按综合分降序，没有排序切换 */
const clanHalls = computed(() => halls.value.filter((h) => h.kind === 'clan'));

// ---- 排序（综合 / 人数 / 活跃度）：数据只用 rankMap，不新增网络请求 ----

type SortMode = 'comprehensive' | 'members' | 'activity';

/** 当前排序档（默认「综合」） */
const sortMode = ref<SortMode>('comprehensive');

/** 综合分权重（写死：人数 0.4 / 活跃度 0.4 / 新近度 0.2） */
const SCORE_WEIGHT_MEMBERS = 0.4;
const SCORE_WEIGHT_ACTIVITY = 0.4;
const SCORE_WEIGHT_RECENCY = 0.2;

/** 本次列表内极值归一化；max === min 时一律记 1（不记 0、不除零） */
function norm(v: number, min: number, max: number): number {
  if (max === min) return 1;
  return (v - min) / (max - min);
}

/** 人数（rankMap 缺失 → 0） */
function membersOf(treeId: string): number {
  const n = rankMap.value[treeId]?.person_count;
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

/** 活跃度（rankMap 缺失 → 0；后端未下发该字段时同样按 0，不显示 NaN） */
function activityOf(treeId: string): number {
  const n = rankMap.value[treeId]?.activity;
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

/** 新近度：updated_at 的毫秒时间戳；缺失 / 无法解析 → 0 */
function recencyOf(treeId: string): number {
  const ts = Date.parse(rankMap.value[treeId]?.updated_at || '');
  return Number.isNaN(ts) ? 0 : ts;
}

/**
 * 综合分表（可复用于任一列表）：0.4×人数 + 0.4×活跃度 + 0.2×新近度，
 * 三项各自在该列表自身内极值归一化（同一公式、同一权重；max === min 记 1）。
 */
function scoreByList(list: DigitalHallCard[]): Record<string, number> {
  const members = list.map((h) => membersOf(h.tree_id));
  const activity = list.map((h) => activityOf(h.tree_id));
  const recency = list.map((h) => recencyOf(h.tree_id));
  const bounds = (arr: number[]) => ({ min: Math.min(...arr), max: Math.max(...arr) });
  const m = bounds(members);
  const a = bounds(activity);
  const r = bounds(recency);
  const map: Record<string, number> = {};
  list.forEach((h, i) => {
    map[h.tree_id] =
      SCORE_WEIGHT_MEMBERS * norm(members[i], m.min, m.max) +
      SCORE_WEIGHT_ACTIVITY * norm(activity[i], a.min, a.max) +
      SCORE_WEIGHT_RECENCY * norm(recency[i], r.min, r.max);
  });
  return map;
}

/** 家族列表的综合分表（归一化范围＝家族列表自身，结果与改造前逐值一致） */
const scoreMap = computed<Record<string, number>>(() => scoreByList(normalHalls.value));

/** 祖谱列表的综合分表（归一化范围＝祖谱列表自身） */
const clanScoreMap = computed<Record<string, number>>(() => scoreByList(clanHalls.value));

/**
 * 「综合」档 tie-break：综合分降序 → 人数降序 → 活跃度降序 → updated_at 降序 → tree_id 升序。
 * 家族列表与祖谱列表共用（传入各自的综合分表）。
 */
function compareByScore(
  a: DigitalHallCard,
  b: DigitalHallCard,
  scores: Record<string, number>,
): number {
  let d = (scores[b.tree_id] || 0) - (scores[a.tree_id] || 0);
  if (d) return d;
  d = membersOf(b.tree_id) - membersOf(a.tree_id);
  if (d) return d;
  d = activityOf(b.tree_id) - activityOf(a.tree_id);
  if (d) return d;
  d = recencyOf(b.tree_id) - recencyOf(a.tree_id);
  if (d) return d;
  return a.tree_id < b.tree_id ? -1 : a.tree_id > b.tree_id ? 1 : 0;
}

/**
 * 家族列表三档统一 tie-break：主指标降序 → 其余两项指标降序 → updated_at 降序 → tree_id 升序。
 * 显式写全，不依赖列表原始顺序（原始顺序随 meta 文件顺序变化）。
 */
function compareHalls(a: DigitalHallCard, b: DigitalHallCard): number {
  let d = 0;
  if (sortMode.value === 'members') {
    d = membersOf(b.tree_id) - membersOf(a.tree_id);
    if (d) return d;
    d = activityOf(b.tree_id) - activityOf(a.tree_id);
    if (d) return d;
  } else if (sortMode.value === 'activity') {
    d = activityOf(b.tree_id) - activityOf(a.tree_id);
    if (d) return d;
    d = membersOf(b.tree_id) - membersOf(a.tree_id);
    if (d) return d;
  } else {
    return compareByScore(a, b, scoreMap.value);
  }
  d = recencyOf(b.tree_id) - recencyOf(a.tree_id);
  if (d) return d;
  return a.tree_id < b.tree_id ? -1 : a.tree_id > b.tree_id ? 1 : 0;
}

/** 渲染用列表（排序只作用于渲染；卡片模板 / 等级徽章 / 新建入口 / 切换按钮均不变） */
const sortedHalls = computed(() => normalHalls.value.slice().sort(compareHalls));

/** 祖谱渲染列表：只按综合分降序（综合分归一化范围＝祖谱列表自身，无排序切换） */
const sortedClanHalls = computed(() =>
  clanHalls.value.slice().sort((a, b) => compareByScore(a, b, clanScoreMap.value)),
);

/** 当前 tab 实际渲染的列表 */
const visibleHalls = computed(() =>
  listTab.value === 'clan' ? sortedClanHalls.value : sortedHalls.value,
);

function toggleView() {
  showMaster.value = !showMaster.value;
}

/** 加载家族列表 + 等级徽章（建树后可重建调用） */
async function loadHalls() {
  loading.value = true;
  try {
    // 用远程数据源（tree-meta），保证拆分/建树/编辑后首页立即同步
    meta.value = await fetchTreeMetaRemote();
    halls.value = Object.entries(meta.value.trees).map(([_, entry]) => ({
      tree_id: entry.tree_id,
      title: entry.display_title,
      surname: entry.surname_char,
      origin: entry.origin,
      description: entry.description,
      isMaster: !!entry.is_master,
      kind: entry.kind,
      url: buildTreeUrl(entry.tree_id, meta.value!) || `/tree/${entry.tree_id}`,
    }));
    loadRanks();
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    await loadHalls();
  } catch (e) {
    console.error('加载元数据失败:', e);
  }
});

// ---- 新建家族树（仅总编辑） ----
const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const form = ref({ surname: '', founder_name: '', gender: 'M' as 'M' | 'F' | 'U', display_title: '', origin: '' });

const canCreateTree = computed(() => isAuthenticated() && authState.role === 'chief_editor');
const canSubmitCreate = computed(
  () => /^[\u4e00-\u9fa5]$/.test(form.value.surname.trim()) && !!form.value.founder_name.trim(),
);

function openCreateTree() {
  createError.value = '';
  showCreate.value = true;
}

function closeCreate() {
  showCreate.value = false;
}

async function doCreateTree() {
  const token = getAuthToken();
  if (!token) {
    createError.value = '登录已过期，请重新登录';
    return;
  }
  if (creating.value) return;
  creating.value = true; // 兼作确认弹窗期间的防重复提交
  createError.value = '';
  try {
    // 建树确认弹窗（8.4 定稿文案）：取消则不发起请求
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: TREE_CREATE_CONFIRM.title,
        content: TREE_CREATE_CONFIRM.content,
        confirmText: TREE_CREATE_CONFIRM.confirmText,
        cancelText: TREE_CREATE_CONFIRM.cancelText,
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    const res = await createTree(
      {
        surname_char: form.value.surname.trim(),
        founder_name: form.value.founder_name.trim(),
        founder_gender: form.value.gender,
        display_title: form.value.display_title.trim(),
        origin: form.value.origin.trim(),
      },
      token,
    );
    // 扣费回执（建树 = 9颗石榴籽）追加在成功提示里；后端未返回 fee 时不追加，避免自造数字
    uni.showToast({
      title: res.fee ? `${res.message}（${feeText(res.fee)}）` : res.message,
      icon: 'none',
    });
    showCreate.value = false;
    form.value = { surname: '', founder_name: '', gender: 'M', display_title: '', origin: '' };
    clearMetaCache();
    await loadHalls();
    openTreeHome(res.tree_id);
  } catch (e: any) {
    // 石榴籽不足（409 ASSET_INSUFFICIENT）：后端 error 文案不隐藏 + 「如何获得」清单 + 引导「我的资产」
    if (isAssetInsufficientError(e)) {
      createError.value = e?.message || '石榴籽不足';
      showAssetInsufficientGuide(e, { title: '石榴籽不足' });
      return;
    }
    createError.value = e.message || '创建失败';
  } finally {
    creating.value = false;
  }
}

// ---- 家族等级 ----
const rankMap = ref<Record<string, TreeRankInfo>>({});

async function loadRanks() {
  const results = await Promise.allSettled(
    halls.value.map((h) => fetchTreeRank(h.tree_id)),
  );
  const map: Record<string, TreeRankInfo> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map[halls.value[i].tree_id] = r.value;
  });
  rankMap.value = map;
}

function rankLabel(treeId: string): string {
  return rankMap.value[treeId]?.rank_label || '';
}

/** 人数标签文案（数据全部来自已加载的 rankMap，不新增请求；缺失 / NaN → 「— 人」） */
function peopleText(treeId: string): string {
  const n = rankMap.value[treeId]?.person_count;
  return typeof n === 'number' && !Number.isNaN(n) ? `${n} 人` : '— 人';
}

function rankTheme(treeId: string): string {
  const r = rankMap.value[treeId];
  if (!r) return 'default';
  if (r.over_limit) return 'danger';
  switch (r.rank_key) {
    case 'family_rank': return 'default';
    case 'clan_rank': return 'primary';
    case 'lineage_rank': return 'warning';
    case 'stemma_rank': return 'danger';
    default: return 'default';
  }
}

// ---- 全站人物搜索（跨家族树；GET /search/global，limit 30） ----

const personQuery = ref('');
const personHits = ref<GlobalPersonHit[]>([]);
const personSearching = ref(false);
/** 结果区开关：输入清空即收起 */
const personSearched = ref(false);
const personSearchError = ref('');

/** 输入变化：清空 → 清结果并收起结果区 */
function onPersonQueryChange(v: string) {
  personQuery.value = v;
  if (!v.trim()) {
    personHits.value = [];
    personSearchError.value = '';
    personSearched.value = false;
  }
}

async function doSearchPeople() {
  const q = personQuery.value.trim();
  if (!q) {
    onPersonQueryChange('');
    return;
  }
  personSearching.value = true;
  personSearched.value = true;
  personSearchError.value = '';
  personHits.value = [];
  try {
    personHits.value = await searchPeopleGlobal(q, 30);
  } catch (e: any) {
    // 不静默吞掉：错误文案直接显示在结果区
    personSearchError.value = e?.message || '搜索失败';
  } finally {
    personSearching.value = false;
  }
}

/** 点结果 → 既有薄壳人物详情页；受限条（真身不可见）只提示、不跳转 */
function goPersonHit(hit: GlobalPersonHit) {
  if (hit.restricted) {
    uni.showToast({ title: '权限受限，不可见详情', icon: 'none' });
    return;
  }
  uni.navigateTo({
    url: `/pages/person/detail?tree_id=${hit.tree_id}&handle=${hit.handle}`,
  });
}

function goToHall(card: DigitalHallCard) {
  openTreeHome(card.tree_id);
}

function goToPage(path: string) {
  uni.navigateTo({ url: path });
}
</script>

<style scoped>
/* ---- 页面骨架（暖棕主题：主色 #8B4513 / 深棕字 #3E2723 / 暖米底 #FFFDF8 / 辅助 #A1887F·#795548） ---- */
.container { padding: 20px; padding-bottom: 90px; }

/* 页头：名称（主）22/700 深棕 → 副标题（次）13 辅助棕，拉开字号与字重层级 */
.header { text-align: center; margin-bottom: 22px; }
.title {
  font-size: 22px; font-weight: 700; color: #3E2723;
  letter-spacing: 1px; line-height: 1.35; display: block;
}
.subtitle {
  font-size: 13px; color: #A1887F;
  line-height: 1.5; margin-top: 8px; display: block;
}

/* ---- 家族馆卡片列表 ---- */
.hall-list { display: flex; flex-direction: column; gap: 12px; }

/* ---- 全站人物搜索（跨家族树；暖棕同族样式） ---- */
.person-search { display: flex; gap: 8px; align-items: center; }
.person-search-input { flex: 1; }
.person-search-panel {
  background: #FFFDF8; border: 1px solid #E0D5C8; border-radius: 14px;
  padding: 6px 14px; box-shadow: 0 2px 10px rgba(62, 39, 35, 0.05);
}
.ps-result {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 2px; border-bottom: 1px solid #F0E8DE;
}
.ps-result:last-of-type { border-bottom: none; }
/* 受限条：追加一行中性辅助色小字（仅该类生效，不影响其它结果行） */
.ps-result-restricted { flex-wrap: wrap; }
.ps-restricted { flex-basis: 100%; font-size: 11px; color: #A1887F; line-height: 1.4; }
.ps-name { font-size: 14px; font-weight: 500; color: #3E2723; }
.ps-id { font-size: 11px; color: #A1887F; }
.ps-tree {
  margin-left: auto; max-width: 42%;
  font-size: 11px; color: #A1887F;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.ps-tip { text-align: center; font-size: 13px; color: #A1887F; padding: 14px 0; }
.ps-error { color: #C62828; }

/* ---- 排序 + 列表切换（同一行：左＝综合/人数/活跃度，右＝家族 | 祖谱） ----
   单行硬约束：nowrap 组内不换行 + min-height 钉住行高。
   垂直账：排序组 = padding 8×2 + border 1×2 = 18px；切 tab 组 = border 1×2 + padding 2×2 + 按钮 padding 6×2 = 18px；
   两组文字同字号 → 行盒等高，故「家族」tab（有排序组）与「祖谱」tab（排序组 v-if 移除）行高严格一致，列表不再跳动。 */
.sort-bar { display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; min-height: 36px; }
.sort-group { display: flex; gap: 8px; flex-wrap: nowrap; min-width: 0; }
.sort-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 8px 14px;
  background: #FFFDF8; border: 1px solid #E0D5C8; border-radius: 999px;
}
.sort-text { font-size: 13px; color: #8B4513; white-space: nowrap; }
.sort-btn.active { background: #8B4513; border-color: #8B4513; }
.sort-btn.active .sort-text { color: #fff; }

/* 列表切换组：靠右（排序组隐藏时仍停在同一行右侧，不跳位）；shrink:0 保证永不被排序组挤压 */
.tab-switch {
  display: flex; gap: 2px; margin-left: auto; flex-shrink: 0;
  padding: 2px; background: #FFFDF8;
  border: 1px solid #E0D5C8; border-radius: 999px;
}
.tab-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 6px 14px; border-radius: 999px;
}
.tab-text { font-size: 13px; color: #8B4513; white-space: nowrap; }
.tab-btn.active { background: #8B4513; }
.tab-btn.active .tab-text { color: #fff; }

/* 窄屏（≤370px，含 320px）：收窄水平空间，保证「三颗排序 pill + 两颗 tab」单行放得下且不溢出、不出现横向滚动 */
@media (max-width: 370px) {
  .sort-bar { gap: 6px; }
  .sort-group { gap: 6px; }
  .sort-btn { padding: 8px 9px; }
  .tab-btn { padding: 6px 10px; }
  .sort-text, .tab-text { font-size: 12px; }
}

/* 卡片容器：暖米底 + 暖棕描边 + 14 圆角 + 极轻投影（与「新建家族树」入口同族） */
.hall-list :deep(.t-cell-group) {
  background: #FFFDF8;
  border: 1px solid #E0D5C8;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(62, 39, 35, 0.05);
}

/* 卡片内节奏：名称 → 发源地 → 简介 纵向堆叠（不再左右分栏与简介抢宽，
   卡片高度只由内容行数决定，节奏稳定） */
.hall-list :deep(.t-cell) {
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  padding: 13px 16px 14px;
  background: transparent;
  --td-cell-hover-color: #FBF3E9;
  --td-cell-border-color: #F0E8DE;
  --td-cell-border-left-space: 16px;
  --td-cell-border-right-space: 16px;
  --td-cell-right-icon-color: #B5A594;
  --td-cell-right-icon-font-size: 20px;
}
/* 末张卡片不再多一条分割线（圆角内不露线） */
.hall-list :deep(.t-cell:last-child)::after { display: none; }

/* 右侧箭头：改为垂直居中定位于卡片右缘，为标题让出整行宽度 */
.hall-list :deep(.t-cell__title) { margin-right: 0; padding-right: 24px; }
.hall-list :deep(.t-cell__right) {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
}

/* 名称（一级信息）：17/700 深棕，单行截断 */
.hall-list :deep(.t-cell__title-text) {
  display: block; width: 100%;
  font-size: 17px; font-weight: 700; color: #3E2723; line-height: 1.35;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
/* 发源地（二/三级信息）：12 辅助棕，单行截断 */
.hall-list :deep(.t-cell__description) { font-size: 12px; color: #A1887F; line-height: 1.5; }
.hall-list :deep(.t-cell__description-text) {
  margin-top: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
/* 简介（正文）：13/1.6 辅助深棕，最多两行截断（长简介不再撑高卡片）；
   右侧留出 24px 箭头位，等级标签不再与右侧箭头相压 */
.hall-list :deep(.t-cell__note) {
  display: block; margin-top: 4px; padding-right: 24px; box-sizing: border-box;
  font-size: 13px; color: #795548;
}
.note-line { display: flex; align-items: flex-start; gap: 8px; }
.note-text {
  flex: 1 1 auto; min-width: 0;
  font-size: 13px; line-height: 1.6; color: #795548;
  word-break: break-word;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
/* 等级标签：与简介同排、右对齐成列；家乘级等中性等级收敛为暖中性灰（语义色不变） */
.hall-list :deep(.rank-tag) {
  --td-tag-default-color: #795548;
  --td-tag-default-font-color: #795548;
  --td-tag-default-light-color: #F3EAE0;
  flex: 0 0 auto; margin-left: 0; margin-top: 1px;
  padding: 0 6px; height: 18px; line-height: 18px; font-size: 11px;
}
/* 人数标签：与等级标签同排同族（浅底深字、无描边，避免同排两个描边元素） */
.people-tag {
  flex: 0 0 auto; margin-top: 1px;
  padding: 0 6px; height: 18px; line-height: 18px; font-size: 11px;
  border-radius: 4px; background: #F3EAE0; color: #795548;
}

/* 加载态（与卡片同形同宽，避免首屏空态闪烁与布局跳动） */
.loading {
  background: #FFFDF8; border: 1px solid #E0D5C8; border-radius: 14px;
  padding: 28px 0 30px; text-align: center;
}
/* 空态：暖色虚线卡片（与「新建家族树」入口同款） */
.empty {
  background: #FFFDF8; border: 1px dashed #C8A88A; border-radius: 14px;
  padding: 34px 16px; text-align: center;
  font-size: 13px; color: #A1887F; line-height: 1.6;
}

.footer { text-align: center; margin-top: 26px; }
/* 页脚链接：小圆角胶囊，扩大可点区（原为 20px 高的裸文字） */
.link {
  display: inline-block; padding: 9px 18px;
  font-size: 13px; color: #8B4513;
  background: #FFFDF8; border: 1px solid #E0D5C8; border-radius: 999px;
}

/* 浮动切换按钮（右侧，固定在 tabbar 上方） */
.floating-switch {
  position: fixed;
  right: 14px;
  bottom: 108px;
  z-index: 950;
  width: 58px; height: 58px;
  border-radius: 50%;
  background: #8B4513;
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 6px 16px rgba(62, 39, 35, 0.28), 0 1px 3px rgba(62, 39, 35, 0.18);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
/* 按压反馈（视觉，无新增交互逻辑） */
.floating-switch:active {
  transform: scale(0.94);
  box-shadow: 0 3px 9px rgba(62, 39, 35, 0.24);
}
.floating-icon { font-size: 21px; line-height: 1; }
.floating-text {
  font-size: 10px; color: #fff; margin-top: 3px;
  line-height: 1.2; letter-spacing: 0.3px; white-space: nowrap;
}

/* 新建家族树入口 + 表单弹层 */
.create-entry {
  display: flex; align-items: center; gap: 8px;
  margin-top: 14px; padding: 14px 16px;
  background: #FBF6EF; border: 1px dashed #C8A88A; border-radius: 14px;
}
.create-icon { font-size: 18px; color: #8B4513; font-weight: bold; }
.create-text { flex: 1; font-size: 15px; color: #3E2723; font-weight: bold; }
.create-hint { font-size: 12px; color: #999; }

.ct-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 960;
  display: flex; align-items: center; justify-content: center;
}
.ct-modal {
  width: 92%; max-width: 460px; max-height: 86vh;
  background: #fff; border-radius: 16px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}
.ct-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px 8px; border-bottom: 1px solid #F0E8DE;
}
.ct-title { font-size: 16px; font-weight: bold; color: #3E2723; }
.ct-close { width: 30px; height: 30px; line-height: 30px; text-align: center; font-size: 16px; color: #999; }
.ct-body { padding: 12px 14px 16px; overflow-y: auto; }
.ct-label { display: block; font-size: 12px; color: #8B4513; margin: 10px 0 4px; }
.ct-fee {
  margin: 14px 0 10px; padding: 10px 12px;
  background: #FBF8F4; border-radius: 10px;
}
.ct-fee-text { display: block; font-size: 13px; color: #3E2723; }
.ct-fee-sub { display: block; font-size: 11px; color: #999; margin-top: 4px; line-height: 1.5; }
.ct-error { display: block; text-align: center; color: #C62828; font-size: 13px; margin-bottom: 8px; }
</style>
