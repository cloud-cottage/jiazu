<template>
  <view class="shiben-view">
    <view class="hero">
      <text class="hero-title">中华世本</text>
      <text class="hero-sub">汇聚有记载的中国先人 · 串联各家族树始祖</text>
      <view v-if="rank" class="hero-rank">
        <t-tag theme="danger" variant="light" size="small">{{ rank.rank_label }}</t-tag>
        <text class="hero-rank-text">共 {{ rank.total_generations }} 世 · {{ rank.rank_en }}</text>
      </view>
      <view v-if="rank?.over_limit" class="hero-warn">
        ⚠️ 该谱系已超过普通家族树 {{ rank.max_depth }} 世上限，由总编辑专属维护
      </view>
    </view>

    <!-- 左侧功能按钮（与普通家族树 / 宗谱首页对齐）：血脉图示 / 版式文档（占位）/ 世本消息（管理权限） -->
    <view class="view-toggle">
      <view class="view-btn" :class="{ active: view === 'pedigree' }" @click="view = 'pedigree'">
        <text class="view-text">血脉图示</text>
      </view>
      <view class="view-btn" :class="{ active: view === 'doc' }" @click="view = 'doc'">
        <text class="view-text">版式文档</text>
      </view>
      <view
        v-if="canManageTree"
        class="view-btn"
        :class="{ active: view === 'msg' }"
        @click="view = 'msg'"
      >
        <text class="view-text">世本消息</text>
      </view>
    </view>

    <!-- 纵向世系树（唯一视图）：整树全展开，滚轮/拖动平移 + ＋/－ 缩放 -->
    <view v-if="view === 'pedigree'" class="tree-host">
      <view class="tree-host-head">
        <text class="tree-host-title">🌳 纵向世系树</text>
        <text class="tree-host-sub">按世代自上而下 · 点节点查看完整档案</text>
      </view>
      <TreePedigree
        tree-id="zhonghua"
        default-layout="vertical"
        hide-external-markers
        :gen-map="chainGenMap"
        :key-markers="keyMarkers"
      />
    </view>

    <!-- 版式文档（占位：世本版式文档尚未开放） -->
    <view v-else-if="view === 'doc'" class="doc-placeholder">
      <text class="doc-ph-title">版式文档</text>
      <text class="doc-ph-text">世本版式文档（印刷版式 / 排版导出）尚未开放，敬请期待。</text>
    </view>

    <!-- 世本消息（审批入口）：复用 family-messages，文案按层级 = 「世本消息」 -->
    <view v-else class="shiben-msg-body">
      <FamilyMessages tree-id="zhonghua" level="master" />
    </view>

    <!-- 世本链数据加载/缺失提示（不遮挡树图：树图自身按树 JSON 渲染） -->
    <view v-if="shibenLoading" class="center">
      <t-loading theme="spinner" text="加载世本链..." />
    </view>
    <view v-else-if="shibenError" class="center error">{{ shibenError }}</view>

    <!-- 人物完整档案弹窗（点击世系树人物不跳独立页面；总谱内可续编下一世） -->
    <PersonDetailModal ref="archiveModal" tree-manage @tree-changed="onTreeChanged" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchTreeRank, fetchMasterTree, API_BASE, fetchMyAnchor } from '@/business';
import type { TreeRankInfo } from '@/business/api';
import { authState, isAuthenticated, getAuthToken } from '@/business/auth';
import { personIdDisplay, TITLE_DISPLAY_ORDER } from '@/business/format';
import PersonDetailModal from '@/components/person-detail-modal/person-detail-modal.vue';
import TreePedigree from '@/components/tree-pedigree/tree-pedigree.vue';
import FamilyMessages from '@/components/family-messages/family-messages.vue';

// ---- 中华世本（纵向世系树；与首页「中华世本视图」为同一页面组件） ----
// 视图口径：只保留纵向树图（tree-pedigree，default-layout="vertical"）；
// 旧「📜 时间轴」模式已下线（叙述型列表与树图信息重复，且无法表达多支并列）。

// ---- 页面功能按钮（与普通家族树 / 宗谱首页对齐） ----
/** 血脉图示（默认）/ 版式文档（占位）/ 世本消息（管理权限） */
const view = ref<'pedigree' | 'doc' | 'msg'>('pedigree');
/** 世本消息入口可见性：chief_editor 全局；tree_steward 仅其锚点树为总谱时可见（口径与家族树首页一致） */
const canManageTree = ref(false);

async function loadManageRights() {
  if (!isAuthenticated()) {
    canManageTree.value = false;
    return;
  }
  if (authState.role === 'chief_editor') {
    canManageTree.value = true;
    return;
  }
  try {
    const anchor = await fetchMyAnchor(getAuthToken());
    canManageTree.value = !!anchor && anchor.tree_id === 'zhonghua';
  } catch {
    canManageTree.value = false;
  }
}

/** 源流链 handle → 世数（传给树图，卡片内显示「第 N 世」/「原始」） */
const chainGenMap = computed(() => {
  const map: Record<string, number> = {};
  for (const n of shibenNodes.value as any[]) {
    // 世数 0 = 原始节点（在链上）；始祖标记节点（is_founder，无链世数）不参与
    if (n.handle && n.gen >= 0 && !n.is_founder) map[n.handle] = n.gen;
  }
  return map;
});

const archiveModal = ref<InstanceType<typeof PersonDetailModal> | null>(null);

// ---- 关键节点标注（原「📜 时间轴」模式的 KEY_NODES：人文始祖 / 五帝 / 周文王 / 元圣 / 得姓始祖 / 宗主）----
// 时间轴视图下线后这份锚点改由纵向树图承载：命中节点在卡片内加一行「★标签」+ 卡面文字主题色。
/** 关键节点（key = Gramps 存储的「名+姓」拼接写法，如 伏羲风 / 文子季；gen = 源流链世数） */
const KEY_NODES: Record<string, { tag: string; theme: string; gen: number }> = {
  伏羲风: { tag: '人文始祖', theme: 'warning', gen: 1 },
  黄帝姬: { tag: '五帝', theme: 'warning', gen: 56 },
  帝喾姬: { tag: '五帝', theme: 'warning', gen: 59 },
  昌姬: { tag: '周文王', theme: 'danger', gen: 74 },
  旦姬: { tag: '周公·元圣', theme: 'danger', gen: 75 },
  伯禽姬: { tag: '鲁国始君', theme: 'primary', gen: 76 },
  友季: { tag: '季氏得姓始祖', theme: 'primary', gen: 88 },
  文子季: { tag: '季孙氏宗主', theme: 'success', gen: 90 },
};

/** 主题 → 标注文字色（沿用原时间轴 t-tag 的 warning/danger/primary/success 语义，暖棕主旋律里的点缀色） */
const KEY_THEME_COLORS: Record<string, string> = {
  warning: '#B26A00',
  danger: '#C62828',
  primary: '#1565C0',
  success: '#2E7D32',
};

/**
 * 关键节点匹配索引：原键之外补「去掉末尾姓字」的写法（KEY_NODES 常量本身不改），
 * 以便节点改名（如 帝喾姬 → 帝喾 / 文子季 → 号「文子」）后仍能命中。
 */
const KEY_INDEX: Record<string, { tag: string; theme: string; gen: number }> = (() => {
  const idx: Record<string, { tag: string; theme: string; gen: number }> = {};
  for (const [key, info] of Object.entries(KEY_NODES)) {
    idx[key] = info;
    if (key.length > 1 && !idx[key.slice(0, -1)]) idx[key.slice(0, -1)] = info;
  }
  return idx;
})();

/** 命中关键节点：候选串 = 名+姓 / 姓+名 / 名 / 称号（谥号 · 封号 · 号） */
function matchKeyNode(fn: string, sn: string, attrs: Record<string, string>) {
  const cands = [`${fn}${sn}`.trim(), `${sn}${fn}`.trim(), fn.trim()];
  for (const k of ['谥号', '封号', '号']) if (attrs[k]) cands.push(attrs[k].trim());
  for (const c of cands) if (c && KEY_INDEX[c]) return KEY_INDEX[c];
  return null;
}

/** handle → 关键节点标注（传给纵向树图 tree-pedigree 的 keyMarkers：★标签 + 主题色） */
const keyMarkers = ref<Record<string, { label: string; color?: string }>>({});

const shibenLoading = ref(false);
const shibenError = ref('');
const shibenNodes = ref<any[]>([]);
const rank = ref<TreeRankInfo | null>(null);

/** 加载中华世本数据（世系链世数地图 + 世代/排名） */
async function loadShibenData() {
  shibenLoading.value = true;
  shibenError.value = '';
  try {
    rank.value = await fetchTreeRank('zhonghua').catch(() => null);
    const masterNodes = await fetchMasterTree();
    const chain = await fetchChainData();
    shibenNodes.value = chain.length ? chain : masterNodes.map((m) => ({
      name: m.name,
      handle: m.handle,
      gen: 0,
      is_master_ref: true,
      external_tree: (m as any).external_tree || '',
    }));
    // 完全无数据（既无 90 世链也无始祖标记）才提示导入
    if (!chain.length) {
      shibenError.value = '中华世本 90 世源流链尚未导入，请管理员执行导入脚本';
    }
  } catch (e: any) {
    shibenError.value = e.message || '加载失败';
  } finally {
    shibenLoading.value = false;
  }
}

/** 拉取总谱 90 世链（按 external_chain_gen 属性排序） */
async function fetchChainData(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/people/?profile=all`, {
    headers: { 'X-Tree-Id': 'zhonghua' },
  });
  if (!res.ok) throw new Error('加载总谱失败');
  const raw = await res.json();
  const chain: any[] = [];
  /** 本次命中的关键节点标注（handle → 标签/主题色） */
  const markers: Record<string, { label: string; color?: string }> = {};
  for (const p of raw) {
    const attrs: Record<string, string> = {};
    for (const a of p.attribute_list || []) {
      if (typeof a.type === 'string') attrs[a.type] = a.value;
    }
    // 90 世链节点带 external_chain_gen 标记
    if (attrs.external_chain_gen) {
      const pn = p.primary_name || {};
      const sn = pn.surname_list?.[0]?.surname || '';
      const fn = pn.first_name || '';
      // 显示名：姓在前（文子季 → 季文子）
      const displayName = sn && fn ? `${sn}${fn}` : `${fn}${sn}`.trim();
      // 关键节点（KEY_NODES）：命中则记入 keyMarkers，由纵向树图画「★标签」+ 主题色
      const keyInfo = matchKeyNode(fn, sn, attrs);
      if (keyInfo) {
        markers[p.handle] = { label: keyInfo.tag, color: KEY_THEME_COLORS[keyInfo.theme] };
      }
      chain.push({
        handle: p.handle,
        gramps_id: p.gramps_id,
        name: displayName || personIdDisplay(p.gramps_id),
        gen: parseInt(attrs.external_chain_gen, 10) || 0,
        is_aggregate: attrs.external_chain_aggregate === 'true',
        note: attrs.external_relation_note || '',
        external_tree: attrs.external_tree || '',
        // 称号：封号 → 谥号 → 号（顺序同人物名称显示）
        title: TITLE_DISPLAY_ORDER.map((k) => (attrs[k] || '').trim())
          .filter(Boolean)
          .join('·'),
      });
    }
  }
  chain.sort((a, b) => a.gen - b.gen);

  // 附加：已是普通家族树始祖的 zhonghua 节点（无链世数，如分迁占位节点）
  const seen = new Set(chain.map((n: any) => n.handle));
  for (const p of raw) {
    const attrs: Record<string, string> = {};
    for (const a of p.attribute_list || []) {
      if (typeof a.type === 'string') attrs[a.type] = a.value;
    }
    if (attrs.external_tree && !attrs.external_chain_gen && !seen.has(p.handle)) {
      const pn = p.primary_name || {};
      const sn = pn.surname_list?.[0]?.surname || '';
      const fn = pn.first_name || '';
      chain.push({
        handle: p.handle,
        gramps_id: p.gramps_id,
        name: `${sn}${fn}`.trim() || personIdDisplay(p.gramps_id),
        gen: 0,
        is_founder: true,
        note: attrs.external_relation_note || '',
        external_tree: attrs.external_tree,
      });
      seen.add(p.handle);
    }
  }
  // 关键节点标注随链数据一并更新（无链数据 / 加载失败时不残留上一次的标注）
  keyMarkers.value = markers;
  return chain;
}

/** 总谱续编/档案编辑完成：重载世本链（新节点按世数进入世数地图） */
function onTreeChanged() {
  loadShibenData();
}

onMounted(() => {
  loadShibenData();
  loadManageRights();
});
</script>

<style scoped>
/* 中华世本（纵向世系树）— 与时间轴同一套棕色配色：暖米底 #FFFDF8 / 棕边 #8B4513 / 深棕字 #3E2723 */
.shiben-view { padding-bottom: 20px; }
.hero {
  background: linear-gradient(135deg, #3E2723, #6D4C41);
  border-radius: 14px; padding: 20px; color: #fff; margin-bottom: 14px;
}
.hero-title { font-size: 22px; font-weight: bold; display: block; }
.hero-sub { font-size: 12px; color: #D7CCC8; margin-top: 4px; display: block; }
.hero-rank { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.hero-rank-text { font-size: 12px; color: #FFD54F; }
.hero-warn { margin-top: 6px; font-size: 11px; color: #FFB74D; background: rgba(255,183,77,0.15); padding: 4px 8px; border-radius: 6px; }
.center { text-align: center; padding: 24px 0; color: #A1887F; font-size: 12px; }
.center.error { color: #C62828; }

/* 左侧功能按钮（与普通家族树 / 宗谱首页同款：固定悬浮正方按钮） */
.view-toggle {
  position: fixed; left: 10px; top: 50%; transform: translateY(-50%);
  display: flex; flex-direction: column; gap: 10px; z-index: 950;
}
.view-btn {
  width: 56px; height: 56px; background: #fff; border: 1px solid #E0D5C8;
  border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  display: flex; align-items: center; justify-content: center; padding: 2px;
}
.view-text { font-size: 11px; color: #8B4513; line-height: 1.3; text-align: center; }
.view-btn.active { background: #8B4513; border-color: #8B4513; }
.view-btn.active .view-text { color: #fff; }

/* 版式文档占位 */
.doc-placeholder {
  background: #FFFDF8; border: 1px dashed #E0D5C8; border-radius: 12px;
  padding: 30px 16px; text-align: center; margin-bottom: 12px;
}
.doc-ph-title { font-size: 15px; font-weight: bold; color: #8B4513; display: block; }
.doc-ph-text { font-size: 12px; color: #A1887F; display: block; margin-top: 8px; line-height: 1.6; }

/* 世本消息视图（左侧按钮留位） */
.shiben-msg-body { margin-left: 8px; }

/* 树图宿主卡片：暖米底 + 棕边 + 深棕字（与档案卡片一致） */
.tree-host {
  background: #FFFDF8;
  border: 1px solid #E0D5C8;
  border-radius: 12px;
  padding: 10px 10px 6px;
}
.tree-host-head { display: flex; align-items: baseline; gap: 8px; margin: 2px 2px 8px; }
.tree-host-title { font-size: 14px; font-weight: bold; color: #3E2723; }
.tree-host-sub { font-size: 11px; color: #A1887F; }

/* 树图内部：用同一套棕色配色收敛（统计条 / 提示 / 图例），不改结构与图标 */
.tree-host :deep(.stats) { background: #FBF6EF; border: 1px solid #E0D5C8; color: #3E2723; }
.tree-host :deep(.stats .stat) { color: #3E2723; }
.tree-host :deep(.stat-hint) { color: #8B4513; }
.tree-host :deep(.hint) { color: #A1887F; }
.tree-host :deep(.loading), .tree-host :deep(.empty) { color: #A1887F; }
</style>
