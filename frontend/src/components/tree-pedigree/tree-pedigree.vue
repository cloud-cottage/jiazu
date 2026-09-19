<template>
  <view class="tree-pedigree">
    <view class="stats" v-if="visibleForest.length">
      <text class="stat">共 {{ props.peopleTotal > 0 ? props.peopleTotal : totalPeople }} 人</text>
      <text class="stat">{{ founderLabel }}</text>
      <text v-if="mirrorTierText" class="stat stat-hint">{{ mirrorTierText }}</text>
      <text v-if="keyMarkerCount > 0" class="stat stat-hint">关键节点 {{ keyMarkerCount }}</text>
      <text v-if="hiddenMarkerCount > 0" class="stat stat-hint">（已隐 {{ hiddenMarkerCount }} 个外树登记）</text>
    </view>

    <view v-if="loading" class="loading">
      <text>加载中...</text>
    </view>

    <view v-else-if="error" class="error">
      <text>{{ error }}</text>
    </view>

    <!-- ECharts 世系树 -->
    <view v-else-if="visibleForest.length" class="chart-wrap">
      <view id="tree-chart" class="chart" />
      <text class="hint">💡 点击人物节点查看详情 · {{ panHint }} · 拖动平移 · ＋/－ 缩放</text>
    </view>

    <!-- 缩放控制按钮（左下角） -->
    <view v-if="visibleForest.length" class="zoom-controls">
      <view class="zoom-btn" @click="zoomIn">
        <text class="zoom-icon">＋</text>
      </view>
      <view class="zoom-btn" @click="zoomOut">
        <text class="zoom-icon">－</text>
      </view>
      <view class="zoom-btn" @click="zoomReset">
        <text class="zoom-icon">⟳</text>
      </view>
    </view>

    <!-- 图示切换按钮（右侧悬浮：纵向/横向 + 迁徙地图） -->
    <view v-if="visibleForest.length" class="layout-switcher">
      <view
        v-for="opt in layoutOptions"
        :key="opt.id"
        class="layout-btn"
        :class="{ active: opt.id !== 'migration' && currentLayout === opt.id }"
        @click="switchLayout(opt.id)"
      >
        <text class="layout-icon">{{ opt.icon }}</text>
        <text class="layout-name">{{ opt.name }}</text>
      </view>
      <!-- 跨树登记标记显隐（总谱专用：隐藏 52 个链接标签，只留血缘主链） -->
      <view
        v-if="markerTotal > 0"
        class="layout-btn"
        :class="{ active: showMarkers }"
        @click="toggleMarkers"
      >
        <text class="layout-icon">🏷️</text>
        <text class="layout-name">{{ showMarkers ? '隐藏外树' : `外树+${hiddenMarkerCount}` }}</text>
      </view>
    </view>

    <view v-else-if="!loading" class="empty">
      <text>该家族暂无世系数据</text>
    </view>

    <!-- 多支始祖列表（虚拟根「始祖」点击展开）：始祖也是具体人物，点击看档案 -->
    <view v-if="showRoots" class="modal-mask" @click="closeRootsList">
      <view class="modal" @click.stop>
        <text class="modal-name">本树共 {{ visibleForest.length }} 支始祖</text>
        <text class="promote-sub">
          始祖也是具体的人物节点，点击可查看并编辑其档案。分迁占位始祖将跳转对应新家族树。
        </text>
        <scroll-view scroll-y class="attach-results">
          <view
            v-for="r in visibleForest"
            :key="r.handle"
            class="attach-item"
            @click="goRootPerson(r)"
          >
            <text class="attach-name">{{ r.name }}</text>
            <text class="attach-id">{{ personIdDisplay(r.gramps_id) }}</text>
          </view>
        </scroll-view>
        <view class="modal-actions">
          <text class="btn-close" @click="closeRootsList">关闭</text>
        </view>
      </view>
    </view>

    <!-- 唯一人物弹窗（点击节点/支始祖直达；档案内可内联编辑 + 谱系管理，不叠弹窗） -->
    <PersonDetailModal ref="archiveModal" :tree-manage="treeManage" @tree-changed="onTreeChanged" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { fetchPersonList, fetchFamilyList, fetchTreeMetaRemote } from '@/business/api';
import type { FamilySummary } from '@/business/api';
import { buildPedigreeForest } from '@/business/pedigree';
import { personIdDisplay, nameWithTitles } from '@/business/format';
import { openTreeHome, mirrorLabelOf, mirrorTargetOf } from '@/business';
import type { TreePersonNode } from '@/business/pedigree';
import * as echarts from 'echarts';
import PersonDetailModal from '@/components/person-detail-modal/person-detail-modal.vue';

const props = withDefaults(
  defineProps<{
    treeId: string;
    /** 默认布局：vertical（纵向）/ horizontal（横向）；总谱树图用 vertical */
    defaultLayout?: 'vertical' | 'horizontal';
    /** 首屏展开层数（0/缺省 = 整树全展开，保持既有行为）；总谱 49 层建议 12 */
    initialDepth?: number;
    /** 默认隐藏「跨树登记标记」节点（external_tree 指向别的家族树；总谱里它们是链接标签不是血缘节点） */
    hideExternalMarkers?: boolean;
    /** handle → 世数（总谱源流链 external_chain_gen）：卡片内显示「第 N 世」 */
    genMap?: Record<string, number>;
    /**
     * handle → 关键节点标注（中华世本原「时间轴」的 KEY_NODES：人文始祖 / 五帝 / 周文王 / 元圣…）。
     * 命中节点在卡片内加一行「★标签」并把卡面文字改为主题色；缺省空对象 = 与原有行为完全一致。
     */
    keyMarkers?: Record<string, { label: string; color?: string }>;
    /**
     * 档案弹窗内是否启用「谱系管理」操作区（加父/加子/加配偶/续编/批量添加子孙；缺省 true = 与原行为一致）。
     * 宿主想在自己那层知道谱系改动（刷新人数/统计）时监听 `@tree-changed`。
     */
    treeManage?: boolean;
    /**
     * 统计栏「共 N 人」的权威人数（可选；> 0 时优先于本组件自行拉取的 people 条数）。
     * 宿主传入后端 /tree/rank 的 person_count（家族人数新口径）→ 家族页统计栏与首页卡片同口径。
     * 缺省 0 = 沿用既有 totalPeople（其它宿主行为完全不变）。
     */
    peopleTotal?: number;
  }>(),
  {
    defaultLayout: 'vertical',
    initialDepth: 0,
    hideExternalMarkers: false,
    genMap: () => ({}),
    keyMarkers: () => ({}),
    treeManage: true,
    peopleTotal: 0,
  },
);

const emit = defineEmits<{
  /** 树结构已被修改（加父/加子/加配偶/拆分/续编/批量）：宿主按需刷新自己加载的数据 */
  (e: 'tree-changed'): void;
}>();

// 完整档案弹窗（点节点/支始祖直达；档案内内联编辑 + 谱系管理，唯一弹窗层）
const archiveModal = ref<InstanceType<typeof PersonDetailModal> | null>(null);

/** 档案内谱系管理操作完成（加父加子/拆分/续编/批量）：刷新树图（PersonArchive 已自行刷新档案）+ 通知宿主 */
function onTreeChanged() {
  loadData();
  emit('tree-changed');
}

// 指定始祖 gramps_id（来自 tree-meta.json）：以始祖为根构建世系
const founderGrampsId = ref('');
const loading = ref(true);
const error = ref('');
const forest = ref<TreePersonNode[]>([]);
const totalPeople = ref(0);
const currentLayout = ref<string>(props.defaultLayout);
// 布局切换（右侧悬浮图标列）：纵向/横向 + 迁徙地图（跳转专页）
const layoutOptions = [
  { id: 'vertical', name: '纵向', icon: '📊' },
  { id: 'horizontal', name: '横向', icon: '📐' },
  { id: 'migration', name: '迁徙地图', icon: '🗺️' },
];
// 缩放状态（1 = 100%）
const zoomLevel = ref(1);

// ---- 跨树登记标记显隐（总谱：默认隐藏，避免外树登记占位把树图压糊） ----
const showMarkers = ref(!props.hideExternalMarkers);

/** 家族关系数据（用于判定「孤立占位」）：父子/配偶关系都在 families 里 */
const familyList = ref<FamilySummary[]>([]);

/** 本树内有任何家族关系（父/母/子女/配偶）的 handle 集合 */
const relatedHandles = computed(() => {
  const s = new Set<string>();
  for (const f of familyList.value) {
    if (f.father_handle) s.add(f.father_handle);
    if (f.mother_handle) s.add(f.mother_handle);
    for (const c of f.child_handles) s.add(c);
  }
  return s;
});

/** 跨树登记：external_tree 指向别的家族树（链接标签，不是血缘节点） */
function isExternalMarker(n: TreePersonNode): boolean {
  return !!n.external_tree && n.external_tree !== props.treeId;
}

/**
 * 孤立占位：本树内**无任何家族关系**（无父母、无配偶、无子女）且无下代。
 * 仅这类跨树登记节点按「外树登记」隐藏（docs/marriage.spec.md §7-3 / docs/founder-attach.spec.md §6）：
 * 带家族关系的真人或镜像（如祖谱顶端世本镜像段）**不得**整支隐藏。
 */
function isIsolatedPlaceholder(n: TreePersonNode): boolean {
  if (relatedHandles.value.has(n.handle)) return false;
  if (n.children?.length) return false;
  if (n.spouseNames?.length) return false;
  return true;
}

/** 可隐藏的外树登记：跨树登记 **且** 孤立占位（两者缺一不隐藏） */
function isHidableMarker(n: TreePersonNode): boolean {
  return isExternalMarker(n) && isIsolatedPlaceholder(n);
}

function countMarkers(nodes: TreePersonNode[]): number {
  let n = 0;
  for (const x of nodes) {
    if (isHidableMarker(x)) n += 1;
    if (x.children?.length) n += countMarkers(x.children);
  }
  return n;
}

function pruneMarkers(nodes: TreePersonNode[]): TreePersonNode[] {
  return nodes
    .filter((n) => !isHidableMarker(n))
    .map((n) => (n.children?.length ? { ...n, children: pruneMarkers(n.children) } : n));
}

/**
 * 镜像档位顺序（marriage → child → founder → chain → 其它档）：文案统一经 mirrorLabelOf 取，
 * 不在树图里写第二套「外树配偶/外树子女/…」映射（口径 A 第 6/7 条）。
 */
const MIRROR_TIER_LINK_TYPES = ['marriage', 'child', 'founder', 'chain', ''];

/**
 * 统计栏的镜像分档文案（口径 A 第 7 条）：
 * 按档分列、**只显示大于 0 的档**，形如「外树配偶 1 · 外树子女 2 · 外树始祖 1」；
 * 无镜像节点 → 空串（该项不渲染）。
 */
const mirrorTierText = computed(() => {
  const counts = new Map<string, number>();
  const walk = (nodes: TreePersonNode[]) => {
    for (const x of nodes) {
      const label = mirrorTierOf(x);
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
      if (x.children?.length) walk(x.children);
    }
  };
  walk(forest.value);
  return MIRROR_TIER_LINK_TYPES.map((lt) => mirrorLabelOf(lt))
    .map((label) => ({ label, count: counts.get(label) || 0 }))
    .filter((g) => g.count > 0)
    .map((g) => `${g.label} ${g.count}`)
    .join(' · ');
});

/** 登记标记总数（用于开关文案与显隐） */
const markerTotal = computed(() => countMarkers(forest.value));
/** 实际画进图里的森林（隐藏标记时不含它们） */
const visibleForest = computed(() => (showMarkers.value ? forest.value : pruneMarkers(forest.value)));
/** 被隐藏的标记数 */
const hiddenMarkerCount = computed(() => markerTotal.value - countMarkers(visibleForest.value));

function toggleMarkers() {
  showMarkers.value = !showMarkers.value;
  scheduleRender();
}

// 多支始祖列表（虚拟根「始祖」点击展开）：始祖也是具体人物，可查看/编辑
const showRoots = ref(false);

function openRootsList() {
  showRoots.value = true;
}
function closeRootsList() {
  showRoots.value = false;
}

/** 支始祖点击：分迁占位跳新家族树；其余弹窗内看完整档案（可编辑） */
function goRootPerson(node: TreePersonNode) {
  showRoots.value = false;
  if (node.external_link_type === 'branch' && node.external_tree) {
    openTreeHome(node.external_tree);
    return;
  }
  if (!node.handle) return;
  // 口径 A：镜像节点（external_mirror='true' + 真身指针齐备）→ 弹窗解析为真身档案
  archiveModal.value?.open(props.treeId, node.handle, node);
}

let chart: echarts.ECharts | null = null;
let renderTimer: ReturnType<typeof setTimeout> | null = null;

// 统计栏：指定始祖时显示始祖姓名，否则显示支数（按当前可见森林计算）
const founderLabel = computed(() => {
  if (founderGrampsId.value && visibleForest.value.length === 1) {
    return `始祖：${visibleForest.value[0]?.name || ''}`;
  }
  return `${visibleForest.value.length} 支始祖`;
});


/** 加载世系数据（人物 + 家族 + 始祖指定）并渲染 */
async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const [meta, people, families] = await Promise.all([
      fetchTreeMetaRemote().catch(() => null),
      fetchPersonList(props.treeId, 0, 0),
      fetchFamilyList(props.treeId),
    ]);
    // tree-meta 仅用于 founder_gramps_id（不单独缓存）
    founderGrampsId.value = meta?.trees?.[props.treeId]?.founder_gramps_id || '';
    totalPeople.value = people.data.length;
    // 家族关系（用于「孤立占位」判定：仅无任何家族关系的外树登记才隐藏）
    familyList.value = families;
    forest.value = buildPedigreeForest(people.data, families, {
      founderGrampsId: founderGrampsId.value || undefined,
    });
    if (chart) {
      chart.dispose();
      chart = null;
    }
    scheduleRender();
  } catch (e: any) {
    error.value = `加载失败: ${e.message || e}`;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!props.treeId) {
    error.value = '缺少 tree_id 参数';
    loading.value = false;
    return;
  }
  loadData();
});

// tree_id 变化时重载（组件复用场景）
watch(
  () => props.treeId,
  (val) => {
    if (val && val !== '') {
      loadData();
    }
  },
);

onUnmounted(() => {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  unbindWheel();
  if (chart) {
    chart.dispose();
    chart = null;
  }
});

/** 等待图表容器完成布局后再初始化（容器隐藏/0 宽时 ECharts 会渲染空白） */
function scheduleRender(attempt = 0) {
  if (!visibleForest.value.length) return;
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!el || el.clientWidth === 0 || el.clientHeight === 0) {
    if (attempt < 50) {
      renderTimer = setTimeout(() => scheduleRender(attempt + 1), 100);
    }
    return;
  }
  renderTimer = null;
  renderChart();
}

/** ---- 方案 B：矩形名卡（传统谱系方框） ----
 * 汉字姓名是 ~3:1 的宽矩形，塞进小圆形必然字号被压小。
 * 改为「节点即名卡」：卡片宽按姓名宽度自适应，字号恒定可读（14px），
 * 性别用卡面底色区分（男浅蓝/女浅粉，见 genderFillColor），矩形边框另有严格约定
 * （见 decorateTree：默认 0 宽，仅已故者黑框）。
 * 注意：ECharts tree 布局按叶子数均分宽度、不感知 symbolSize，
 * 因此卡宽设上限、靠 roam 缩放承载密集区。
 * 说明：未用 roundRect —— ECharts 的 roundRect 圆角按 symbol 本地 2x2 再非等比
 * 放大，宽扁卡会变成椭圆角/胶囊形；直角方框视觉最可控、最贴近传统谱牒。
 */
const CARD_FONT = 14;
const CARD_PAD_X = 8; // 单侧内边距
const CARD_H = 28;
const CARD_MAX_W = 128; // 含 padding，约 8 个汉字 / 17 个拉丁字符
const CARD_MAX_W_TITLED = 216; // 带称号卡（姓+名+封号+谥号+号）放宽上限，避免称号被截断

/** 近似测量字符串渲染宽度（全角≈fontSize，半角≈0.62em，空格≈0.5em） */
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x20000;
    w += wide ? fontSize : ch === ' ' ? fontSize * 0.5 : fontSize * 0.62;
  }
  return w;
}

/** 卡内文本：按最大内宽截断并补省略号（tooltip 仍显全名） */
function cardText(name: string, cardW: number): string {
  const inner = cardW - CARD_PAD_X * 2;
  let t = name || '';
  while (t && estimateTextWidth(t, CARD_FONT) > inner) t = t.slice(0, -1);
  return t === name ? name : `${t}…`;
}

/** 性别 → 卡面浅色底（保证与深棕字的对比度） */
function genderFillColor(g: string | undefined): string {
  return g === 'M' ? '#EDF3F8' : g === 'F' ? '#FCEFF1' : '#F2F2F2';
}

/** 递归生成名卡节点树（返回克隆，不改业务数据）：写入自适应卡宽/卡高 + 名卡样式。
 * 夫妇卡：节点有配偶（嫁入成员）时卡体加高，第二行起每行一个「配XX」，
 * 子女连线仍挂在整卡下方 —— 谱式“夫 + 配某氏”一格并列。 */
const CARD_LINE_STEP = 22; // 每增一行的卡高增量（单行 CARD_H=28）
const CARD_GAP = 12; // 世代行距：卡高之外每层再留的间距（整树展开时按卡高铺开）
/** 卡片行数（与 decorateTree 的行构成一致）：姓名 / 关键节点标签 / 第N世 / 每位配偶各一行 */
function cardLines(node: TreePersonNode, artifact = false): number {
  let n = 1;
  if (!artifact && keyMarkerOf(node)) n++;
  if (!artifact && props.genMap?.[node.handle] !== undefined) n++;
  if (isMirrorNode(node) && !artifact) n++;
  n += (node.spouseNames || []).filter(Boolean).length;
  return n;
}

/**
 * 外树镜像节点（嫁娶 / 跨树子女 / 认祖 / 上层链生成的「对方在本树的代表」）。
 * 判据集中在 `mirrorTargetOf`（口径 A 第 1 条：external_mirror='true' + 真身 handle + 真身树 三者齐备）。
 */
function isMirrorNode(node: TreePersonNode): boolean {
  return mirrorTargetOf(node) !== null;
}

/** 镜像档位文案（口径 A 第 6/7 条：卡片角标与统计栏同源）；非镜像 → null */
function mirrorTierOf(node: TreePersonNode): string | null {
  const t = mirrorTargetOf(node);
  return t ? mirrorLabelOf(t.linkType) : null;
}

/**
 * 关键节点标注（宿主传入 keyMarkers 时命中；虚拟根/占位节点无标注）。
 * 用于卡片内「★标签」行与统计栏计数 —— 与「外树配偶」「第N世」行同一套行内排版。
 */
function keyMarkerOf(node: TreePersonNode): { label: string; color?: string } | null {
  if (!node.handle || !node.gramps_id) return null;
  return props.keyMarkers?.[node.handle] || null;
}

/** 命中关键节点标注的可见卡片数（统计栏提示） */
const keyMarkerCount = computed(() => {
  let n = 0;
  const walk = (nodes: TreePersonNode[]) => {
    for (const x of nodes) {
      if (keyMarkerOf(x)) n += 1;
      if (x.children?.length) walk(x.children);
    }
  };
  walk(visibleForest.value);
  return n;
});

/** 可见森林里最高的一张卡（决定世代行距；总谱卡带「第N世/配X」行会更高） */
const maxCardHeight = computed(() => {
  let h = CARD_H;
  const walk = (nodes: TreePersonNode[]) => {
    for (const n of nodes) {
      h = Math.max(h, CARD_H + (cardLines(n) - 1) * CARD_LINE_STEP);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(visibleForest.value);
  return h;
});

/**
 * 整树展开时的「世代行距」：ECharts 默认把 depth 层压进容器尺寸
 * （48 层的总谱 → 每层 ~7px，卡片全部压叠、文字看不清）。
 * → 按「层数 ×（最高卡高 + 行距）」铺开（TB/BT 撑 height、LR/RL 撑 width），
 *   超出容器的部分靠滚轮/拖动平移 + ＋/－ 缩放浏览；容器装得下则等于容器尺寸（= 原自适应行为）。
 * 注意：**两个维度都必须显式给出** —— setOption 是合并语义，切换布局时若只给一个维度，
 * 另一维度会残留上一次的值（曾因此横向模式套着纵向的 height → 画面近乎空白）。
 */
function layerBox(stretch: 'height' | 'width', depth: number): { width: number; height: number } | Record<string, never> {
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!el) return {};
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return {};
  const span = depth * (maxCardHeight.value + CARD_GAP);
  return {
    width: stretch === 'width' && span > w ? span : w,
    height: stretch === 'height' && span > h ? span : h,
  };
}

/** 当前布局下要撑开的维度：纵向撑高、横向撑宽 */
function stretchAxis(): 'height' | 'width' {
  return currentLayout.value === 'horizontal' ? 'width' : 'height';
}

function decorateTree(node: TreePersonNode, isVirtualRoot = false): TreePersonNode {
  const artifact = isVirtualRoot || !node.gramps_id; // 虚拟根/占位节点（可点入口），非人物卡
  // 边框严格约定：人物卡默认 0 宽；仅已故（is_living===false = 有死亡记录）→ 明显黑色
  // 边框；性别只由卡面底色区分（男浅蓝/女浅粉）。占位/虚拟根保留棕色细框以示可点。
  const border = artifact ? '#8B4513' : node.is_living === false ? '#000000' : 'transparent';
  const borderWidth = artifact ? 1.5 : node.is_living === false ? 2 : 0;
  const fill = artifact ? '#F7EFE3' : genderFillColor(node.gender);
  const lines = [nameWithTitles(node.name, node.titles)];
  // 关键节点标注（世本 KEY_NODES：人文始祖 / 五帝 / 元圣 / 得姓始祖 / 宗主）：
  // 姓名下一行加「★标签」角标，卡面文字改主题色（与「外树配偶」「第N世」同款行，不新造图标）
  const km = artifact ? null : keyMarkerOf(node);
  if (km) lines.push(`★${km.label}`);
  // 总谱：卡片内显示世数（源流链 external_chain_gen，由宿主传入 genMap）；世数 0 = 原始节点
  const gen = props.genMap?.[node.handle];
  if (gen !== undefined && !artifact) lines.push(gen === 0 ? '原始' : `第${gen}世`);
  // 外树镜像节点按 external_link_type 分档加角标行（口径 A 第 6 条），与真人区分
  if (isMirrorNode(node) && !artifact) lines.push(mirrorLabelOf(node.external_link_type));
  for (const s of node.spouseNames || []) if (s) lines.push(`配${s}`);
  const rawW =
    Math.max(...lines.map((l) => estimateTextWidth(l, CARD_FONT))) + CARD_PAD_X * 2;
  // 带称号（姓+名+封号+谥号+号）的卡允许更宽，避免称号被截断
  const maxW = node.titles ? CARD_MAX_W_TITLED : CARD_MAX_W;
  const w = Math.max(34, Math.min(maxW, rawW));
  const h = CARD_H + (cardLines(node, artifact) - 1) * CARD_LINE_STEP;
  const card: TreePersonNode = {
    ...node,
    itemStyle: { color: fill, borderColor: border, borderWidth },
    symbolSize: [w, h],
    _cardText: lines.map((l) => cardText(l, w)).join('\n'),
  };
  // 关键节点：卡面文字用标注主题色（ECharts per-node label 覆盖；不命中则沿用系列默认深棕）
  if (km?.color) card.label = { color: km.color };
  if (node.children) card.children = node.children.map((c) => decorateTree(c));
  return card;
}

/**
 * 树数据最大深度（根=1）。用于 initialTreeDepth —— 首次渲染即整树全展开，
 * 深层节点不再默认折叠（想看第 N 世直接靠 roam 缩放定位，而非逐层点击展开）。
 */
function treeMaxDepth(node: TreePersonNode): number {
  let d = 1;
  if (node.children && node.children.length) {
    for (const c of node.children) d = Math.max(d, 1 + treeMaxDepth(c));
  }
  return d;
}

/**
 * 当前漫游平移量（屏幕像素）。ECharts 未公开该状态，走内部 API 读取；
 * 每个调用点都做防御（失败返回 null → 调用方跳过限制）。
 */
function roamOffset(): { x: number; y: number } | null {
  const inst = chart as any;
  if (!inst) return null;
  const t = inst
    .getViewOfSeriesModel?.(inst.getModel?.().getSeriesByIndex(0))
    ?.group?.getComputedTransform?.();
  return t ? { x: t[4], y: t[5] } : null;
}

/**
 * 把滚轮平移量限制在内容边界内（长树滑到底/顶后不要再滑出去变成整屏空白）；
 * 返回本次实际可用的位移。仅对撑开尺寸的纵向/横向长树生效。
 */
function clampPan(dx: number, dy: number): { dx: number; dy: number } {
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!chart || !el) return { dx, dy };
  const o: any = (chart.getOption() as any).series?.[0];
  const off = roamOffset();
  if (!o || !off) return { dx, dy };
  const SLACK = 120; // 允许越过末尾一点，避免最后一张卡贴边
  if (o.orient === 'TB' || o.orient === 'BT') {
    const limit = Math.max(0, (o.height || 0) - el.clientHeight) + SLACK;
    return { dx, dy: Math.max(-limit - off.y, Math.min(-off.y, dy)) };
  }
  const limit = Math.max(0, (o.width || 0) - el.clientWidth) + SLACK;
  return { dx: Math.max(-limit - off.x, Math.min(-off.x, dx)), dy };
}

/** 视野复位：把漫游平移量归零（否则长树平移后回不到树顶） */
function resetViewport() {
  const off = roamOffset();
  if (!chart || !off) return;
  chart.dispatchAction({ type: 'treeRoam', seriesIndex: 0, dx: -off.x, dy: -off.y });
}

/** 滚轮提示文案（随布局变化：纵向上下 / 横向左右） */
const panHint = computed(() => {
  if (currentLayout.value === 'vertical') return '滚轮上下滑动视野';
  if (currentLayout.value === 'horizontal') return '滚轮左右滑动视野';
  return '滚轮平移视野';
});

/** 缩放已锁死（roam:'move'）→ 滚轮改为平移视野：纵向模式上下滑、横向模式左右滑 */
function onWheel(e: WheelEvent) {
  if (!chart) return;
  // 触控板横向滑动（deltaX）优先；鼠标滚轮只有 deltaY
  const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!raw) return;
  e.preventDefault();
  // deltaMode===1 是「行」单位（Firefox），换算成像素；并限制单次步长
  const step = Math.max(-180, Math.min(180, e.deltaMode === 1 ? raw * 16 : raw));
  // treeRoam 的 dx/dy 是屏幕像素位移（正 = 内容右/下移）；滚轮下滑 = 看更下方内容 = 内容上移
  const layout = currentLayout.value;
  const dx0 = layout === 'horizontal' ? -step : layout === 'vertical' ? 0 : -(e.deltaX || 0);
  const dy0 = layout === 'vertical' ? -step : layout === 'horizontal' ? 0 : -(e.deltaY || 0);
  const { dx, dy } = clampPan(dx0, dy0);
  if (!dx && !dy) return; // 已到内容边界
  chart.dispatchAction({ type: 'treeRoam', seriesIndex: 0, dx, dy });
}

// 滚轮监听绑定的元素（只绑一次；卸载时解绑）
let wheelEl: HTMLElement | null = null;

/** 绑定滚轮平移（passive:false —— 需 preventDefault 阻止页面跟着滚） */
function bindWheel(el: HTMLElement) {
  if (wheelEl === el) return;
  if (wheelEl) wheelEl.removeEventListener('wheel', onWheel);
  el.addEventListener('wheel', onWheel, { passive: false });
  wheelEl = el;
}

/** 解绑滚轮平移 */
function unbindWheel() {
  if (wheelEl) {
    wheelEl.removeEventListener('wheel', onWheel);
    wheelEl = null;
  }
}

function renderChart() {
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!el) return;

  if (!chart) {
    chart = echarts.init(el);
    bindWheel(el);
    chart.on('click', (params: any) => {
      const d = params?.data as TreePersonNode | undefined;
      if (!d) return;
      // 虚拟根（无 gramps_id）：多支始祖入口 —— 展开支始祖列表
      if (!d.gramps_id) {
        openRootsList();
        return;
      }
      // 分迁占位节点：点击直接跳转新家族树（无自身数据可看）
      if (d.external_link_type === 'branch' && d.external_tree) {
        openTreeHome(d.external_tree);
        return;
      }
      // 普通人物节点：直接打开唯一档案弹窗（内联编辑 + 谱系管理，不再经过摘要弹窗）
      // 口径 A：镜像节点（external_mirror='true' + 真身树/真身 handle 齐备）→ 打开真身档案
      if (!d.handle) return;
      archiveModal.value?.open(props.treeId, d.handle, d);
    });
  }

  // 单根森林 → 以真实始祖为根（始祖本身是具体的人，可点击查看/编辑）；
  // 多根森林 → 包虚拟根「始祖」避免布局下根节点全部重叠，点击虚拟根展开支始祖列表
  const roots = visibleForest.value;
  const rawRoot: TreePersonNode =
    roots.length === 1
      ? roots[0]
      : {
          name: '始祖',
          handle: '__root__',
          gramps_id: '',
          gender: 'U',
          is_living: false,
          itemStyle: { color: '#8B4513' },
          children: roots,
        };

  // 方案B：把业务节点树克隆为「圆角矩形名卡」树（卡宽自适应姓名宽度）
  const chartRoot = decorateTree(rawRoot, roots.length !== 1);
  // 首屏展开层数（ECharts 口径，见 TreeSeries.js）：
  // - props.initialDepth <= 0（缺省值 / 普通家族树）→ 走「整树全展开」分支：initialTreeDepth 传 -1。
  //   依据 TreeSeries.js:90 `expandTreeDepth = expandAndCollapse && option.initialTreeDepth >= 0
  //   ? option.initialTreeDepth : treeDepth;` —— initialTreeDepth < 0 时 expandTreeDepth = 真实树深，
  //   第 94 行 `node.isExpand = node.depth <= expandTreeDepth` 对全部节点成立。
  //   不能传正数 treeDepth：TreeSeries.js:66-70 ECharts 会在 series.data 外再包一层虚拟根
  //   （root = {name: option.name, children: option.data}），你传的真实根深度为 1 → 少展开一层，
  //   最深一层的节点（如镜像节点）不建图形元素 → getItemGraphicEl() 为 null，不可见也不可点。
  // - props.initialDepth > 0（总谱 48+ 层等）→ 保持既有逐层展开语义（点开下一层）。
  const treeDepth = treeMaxDepth(chartRoot);
  const expandDepth = props.initialDepth > 0 ? Math.min(props.initialDepth, treeDepth) : -1;

  const labelFmt = (params: any) => {
    const d = params.data as TreePersonNode;
    return d._cardText ?? (d.name ? d.name.slice(0, 4) : '');
  };
  // hover 摘要：名卡上只放得下姓名（可能截断），这里补全「完整姓名 + 生卒 + 身份标签」。
  // 重要：uni-app H5 注入全局 wx → ECharts 判定 wxa 环境，tooltip 只能走 richText 渲染模式
  // （renderMode:'html' 下 TooltipHTMLContent 构造直接返回 null 会崩）。richText 不解析 HTML，
  // 因此 formatter 必须返回纯文本，用 '\n' 换行，由 tooltip 背景/边框配置呈现卡片观感。
  // 信息策略：只呈现可靠事实。guest 视角列表常缺生卒字段（is_living 由「无死亡记录」推断，
  // 会把无考远祖误判为在世），故不在 hover 里显示「在世」状态；性别/跨树标记/可考生卒才展示。
  const tooltipFmt = (params: any) => {
    const d = params.data as TreePersonNode;
    if (!d) return '';
    // 虚拟根「始祖」：多支汇总入口，引导点击展开
    if (!d.gramps_id) return `${d.name}\n点击查看各支始祖`;
    const name = d.name || '';
    // 身份标签：性别 / 关键节点（世本源流链锚点）/ 分迁链接 / 出嫁联姻（确定性信息，不含易误判的在世推断）
    const tags: string[] = [];
    if (d.gender === 'M') tags.push('♂');
    else if (d.gender === 'F') tags.push('♀');
    const km = keyMarkerOf(d);
    if (km) tags.push(km.label);
    if (d.external_link_type === 'branch') tags.push('分迁 → 他族');
    else if (d.external_link_type === 'marriage') tags.push('出嫁联姻');
    // 生卒摘要：有一方数据才显示，避免空行
    const life = d.birth_date || d.death_date
      ? `${d.birth_date || '?'} — ${d.death_date || '?'}`
      : '';
    const spouseLine =
      d.spouseNames && d.spouseNames.length
        ? `配偶：${d.spouseNames.join('、')}`
        : '';
    const lines = [
      `${name}${tags.length ? `（${tags.join(' · ')}）` : ''}`,
      `编号 ${personIdDisplay(d.gramps_id) || ''}`,
    ];
    if (spouseLine) lines.push(spouseLine);
    if (life) lines.push(life);
    return lines.join('\n');
  };

  const base = {
    tooltip: {
      trigger: 'item' as const,
      triggerOn: 'mousemove' as const,
      formatter: tooltipFmt,
      // richText 模式同样吃这些视觉配置：米色卡 + 棕边 + 深棕字，呼应名卡配色
      backgroundColor: '#FFFDF7',
      borderColor: '#8B4513',
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: '#3E2723', fontSize: 13 },
    },
  };

  const orient =
    currentLayout.value === 'horizontal' ? 'LR' : 'TB';

  chart.setOption({
    ...base,
    series: [
      {
        type: 'tree',
        data: [chartRoot],
        // 纵向/横向 = 正交布局
        layout: 'orthogonal',
        orient,
        // 整树展开：按卡高铺开世代行距（否则 ECharts 会把 48 层压进容器 → 卡片叠死）。
        // 盒子尺寸必须用真实树深 treeDepth（不能用 expandDepth：整树全展开时它是 -1，会算错高度）
        ...layerBox(stretchAxis(), treeDepth),
        symbol: 'rect',
        // -1 = 整树全展开（props.initialDepth<=0）；正数 = 首屏展开到第 N 层（逐层点开）
        initialTreeDepth: expandDepth,
        // 整树全展开模式（props.initialDepth<=0）下禁用点击折叠：ECharts TreeView.js:169 只在
        // expandAndCollapse === true 时给卡片绑 treeExpandAndCollapse 点击 → 否则「点卡片」会同时
        // 开档案 + 折叠该节点子树（后代静默消失）。关掉后 TreeSeries.js:90 的
        // `expandTreeDepth = expandAndCollapse && initialTreeDepth >= 0 ? … : treeDepth`
        // 取内部真实树深 → 整树依然全展开，只是不再绑点击折叠。
        // 逐层展开模式（props.initialDepth>0）保持 true，保留点开/折叠能力。
        expandAndCollapse: props.initialDepth > 0,
        // roam:'move' = 只允许平移（缩放锁死，走 ＋/－ 按钮；滚轮改为平移视野）
        roam: 'move',
        zoom: zoomLevel.value,
        animationDuration: 550,
        animationDurationUpdate: 750,
        lineStyle: { color: '#A1887F', width: 1.2, curveness: 0.5 },
        label: {
          position: 'inside',
          rotate: 0,
          fontSize: CARD_FONT,
          color: '#3E2723',
          formatter: labelFmt,
        },
        emphasis: {
          focus: 'descendant',
          itemStyle: { borderColor: '#8B4513', borderWidth: 2 },
        },
      },
    ],
  });
}

/** 切换图示布局；迁徙地图为跳转专页 */
function switchLayout(id: string) {
  if (id === 'migration') {
    uni.navigateTo({ url: `/pages/special/migration-map/index?tree_id=${props.treeId}` });
    return;
  }
  if (currentLayout.value === id) return;
  currentLayout.value = id;
  renderChart();
}

/** 放大 */
function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value * 1.25, 4);
  applyZoom();
}

/** 缩小 */
function zoomOut() {
  zoomLevel.value = Math.max(zoomLevel.value / 1.25, 0.2);
  applyZoom();
}

/** 重置缩放 + 视野复位（回到 100% 且回到树顶） */
function zoomReset() {
  zoomLevel.value = 1;
  applyZoom(true);
  // setOption 生效后再把漫游平移量归零（否则只复位缩放，平移仍停在原处）
  setTimeout(resetViewport, 80);
}

/** 将缩放应用到图表 */
function applyZoom(resetCenter = false) {
  if (!chart) return;
  chart.setOption({
    series: [
      {
        zoom: zoomLevel.value,
        ...(resetCenter ? { center: null } : {}),
      },
    ],
  });
}
</script>

<style scoped>
.stats { text-align: center; margin: 16px 0; padding: 10px; background: #FFF8E1; border-radius: 8px; }
.stat { font-size: 14px; color: #5D4037; margin: 0 12px; display: inline-block; }
.stat-hint { font-size: 12px; color: #A1887F; }
.loading, .error, .empty { text-align: center; padding: 40px; color: #999; }
.error { color: #C62828; }
.chart-wrap { margin-top: 8px; }
.chart { width: 100%; height: 68vh; min-height: 420px; }
.hint { display: block; text-align: center; font-size: 12px; color: #999; margin-top: 8px; }

/* 图示切换按钮（右侧悬浮：纵向/横向 + 迁徙地图） */
.layout-switcher {
  position: fixed;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 900;
}
.layout-btn {
  width: 52px;
  padding: 8px 4px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.layout-btn.active {
  background: #8B4513;
  border-color: #8B4513;
}
.layout-icon { font-size: 16px; }
.layout-name { font-size: 10px; color: #8B4513; margin-top: 2px; }
.layout-btn.active .layout-name { color: #fff; }

/* 缩放控制（左下角悬浮） */
.zoom-controls {
  position: fixed;
  left: 12px;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 900;
}
.zoom-btn {
  width: 40px;
  height: 40px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.zoom-icon { font-size: 18px; color: #8B4513; font-weight: bold; }

/* 模态框 */
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 82%; max-width: 360px; background: #fff; border-radius: 14px;
  padding: 24px 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}
.modal-name { font-size: 20px; font-weight: bold; color: #3E2723; display: block; text-align: center; }
.modal-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.btn-close { text-align: center; color: #999; font-size: 14px; padding: 4px 0; }

/* 始祖列表 */
.promote-sub { font-size: 12px; color: #666; line-height: 1.7; display: block; margin: 8px 0 14px; }
.attach-results { max-height: 32vh; overflow-y: auto; margin-top: 8px; }
.attach-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1px solid #F0E8DE; border-radius: 8px;
  margin-bottom: 8px;
}
.attach-item.selected { border-color: #8B4513; background: #FBF6EF; }
.attach-name { font-size: 14px; color: #3E2723; font-weight: 500; }
.attach-id { font-size: 11px; color: #999; margin-left: auto; }

/* 添加父/子节点弹窗 */
.mode-switch {
  display: flex; gap: 8px; margin-bottom: 4px;
}
.mode-btn {
  flex: 1; text-align: center; padding: 8px 0;
  border: 1px solid #E0D5C8; border-radius: 8px;
  font-size: 13px; color: #666;
}
.mode-btn.active {
  background: #8B4513; border-color: #8B4513; color: #fff;
}
.gender-row { margin-top: 10px; }
</style>
