<template>
  <view class="container">
    <view class="header">
      <text class="title">家族历史数字馆</text>
      <text class="subtitle">多姓氏、多支派家谱数字化展示平台</text>
    </view>

    <!-- 双视图：家族列表 / 中华世本（浮动按钮切换，无 t-tabs） -->
    <!-- 视图1：普通家族树列表（不含 zhonghua） -->
    <view v-if="!showMaster" class="hall-list">
      <t-cell-group :bordered="false">
        <t-cell
          v-for="card in normalHalls"
          :key="card.tree_id"
          :title="card.title"
          :description="`发源地：${card.origin || '待完善'}`"
          :note="card.description"
          :border="true"
          arrow
          @click="goToHall(card)"
        >
          <template #note>
            <view class="note-line">
              <text class="note-text">{{ card.description }}</text>
              <t-tag v-if="rankLabel(card.tree_id)" :theme="rankTheme(card.tree_id)" variant="light" size="small" class="rank-tag">
                {{ rankLabel(card.tree_id) }}
              </t-tag>
            </view>
          </template>
        </t-cell>
      </t-cell-group>

      <view v-if="normalHalls.length === 0" class="empty">
        <text>暂无已上线的家族数字馆</text>
      </view>

      <!-- 新建家族树（仅总编辑）：写树 JSON + 始祖 + tree-meta，扣建树费 -->
      <view v-if="canCreateTree" class="create-entry" @click="openCreateTree">
        <text class="create-icon">＋</text>
        <text class="create-text">新建家族树</text>
        <text class="create-hint">费用 ¥{{ feeYuan }}</text>
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
            <text class="ct-fee-text">建树费用 ¥{{ feeYuan }}（余额 ¥{{ balanceYuan }}）</text>
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
import { fetchTreeMetaRemote, buildTreeUrl, fetchTreeRank, openTreeHome, clearMetaCache, fetchWallet, createTree } from '@/business';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import type { DigitalHallCard, TreeMeta } from '@/business/types';
import type { TreeRankInfo } from '@/business/api';
import ShibenTimeline from '@/components/shiben-timeline/shiben-timeline.vue';

const halls = ref<DigitalHallCard[]>([]);
const meta = ref<TreeMeta | null>(null);

// ---- 双视图切换（浮动按钮） ----
const showMaster = ref(false);

/** 普通家族树列表（不含总谱 zhonghua） */
const normalHalls = computed(() => halls.value.filter((h) => !h.isMaster));

function toggleView() {
  showMaster.value = !showMaster.value;
}

/** 加载家族列表 + 等级徽章（建树后可重建调用） */
async function loadHalls() {
  // 用远程数据源（tree-meta），保证拆分/建树/编辑后首页立即同步
  meta.value = await fetchTreeMetaRemote();
  halls.value = Object.entries(meta.value.trees).map(([_, entry]) => ({
    tree_id: entry.tree_id,
    title: entry.display_title,
    surname: entry.surname_char,
    origin: entry.origin,
    description: entry.description,
    isMaster: !!entry.is_master,
    url: buildTreeUrl(entry.tree_id, meta.value!) || `/tree/${entry.tree_id}`,
  }));
  loadRanks();
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
const feeYuan = ref('9.90');
const balanceYuan = ref('0.00');
const form = ref({ surname: '', founder_name: '', gender: 'M' as 'M' | 'F' | 'U', display_title: '', origin: '' });

const canCreateTree = computed(() => isAuthenticated() && authState.role === 'chief_editor');
const canSubmitCreate = computed(
  () => /^[\u4e00-\u9fa5]$/.test(form.value.surname.trim()) && !!form.value.founder_name.trim(),
);

async function openCreateTree() {
  createError.value = '';
  showCreate.value = true;
  const token = getAuthToken();
  if (!token) return;
  try {
    const w = await fetchWallet(token);
    feeYuan.value = w.tree_create_fee_yuan;
    balanceYuan.value = w.user_balance_yuan;
  } catch {
    /* 钱包读取失败不阻塞；提交时服务端仍会校验余额 */
  }
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
  creating.value = true;
  createError.value = '';
  try {
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
    uni.showToast({ title: res.message, icon: 'none' });
    showCreate.value = false;
    form.value = { surname: '', founder_name: '', gender: 'M', display_title: '', origin: '' };
    clearMetaCache();
    await loadHalls();
    openTreeHome(res.tree_id);
  } catch (e: any) {
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

function goToHall(card: DigitalHallCard) {
  openTreeHome(card.tree_id);
}

function goToPage(path: string) {
  uni.navigateTo({ url: path });
}
</script>

<style scoped>
.container { padding: 20px; padding-bottom: 90px; }
.header { text-align: center; margin-bottom: 30px; }
.title { font-size: 24px; font-weight: bold; display: block; }
.subtitle { font-size: 14px; color: #666; margin-top: 8px; display: block; }
.hall-list { display: flex; flex-direction: column; gap: 12px; }
.hall-list :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.empty { text-align: center; padding: 40px; color: #999; }
.rank-tag { margin-left: 6px; }
.note-line { display: flex; align-items: center; }
.note-text { flex: 1; }
.footer { text-align: center; margin-top: 30px; }
.link { color: #8B4513; font-size: 14px; }

/* 浮动切换按钮（右侧固定，位于 tabbar 上方） */
.floating-switch {
  position: fixed;
  right: 14px;
  bottom: 110px;
  z-index: 950;
  width: 58px; height: 58px;
  border-radius: 50%;
  background: #8B4513;
  box-shadow: 0 4px 14px rgba(139, 69, 19, 0.4);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.floating-icon { font-size: 20px; line-height: 1; }
.floating-text { font-size: 10px; color: #fff; margin-top: 2px; }

/* 新建家族树入口 + 表单弹层 */
.create-entry {
  display: flex; align-items: center; gap: 8px;
  margin-top: 14px; padding: 14px 16px;
  background: #FBF6EF; border: 1px dashed #C8A88A; border-radius: 12px;
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
