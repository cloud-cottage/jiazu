<template>
  <view class="container">
    <!-- 顶部：总谱概览 -->
    <view class="hero">
      <text class="hero-title">中华世本</text>
      <text class="hero-sub">汇聚有记载的中国先人 · 串联各家族树始祖</text>
    </view>

    <view v-if="loading" class="center">
      <t-loading theme="spinner" text="加载总谱..." />
    </view>
    <view v-else-if="error" class="center error">{{ error }}</view>

    <template v-else>
      <!-- 代际快速导航（横向滚动） -->
      <scroll-view scroll-x class="gen-nav">
        <view class="gen-nav-inner">
          <view
            v-for="g in genMarkers"
            :key="g.gen"
            class="gen-marker"
            :class="{ active: activeGen === g.gen }"
            @click="scrollToGen(g.gen)"
          >
            <text class="gen-num">{{ g.gen }}</text>
            <text class="gen-name">{{ g.name }}</text>
          </view>
        </view>
      </scroll-view>

      <!-- 统计 -->
      <view class="stats">
        <text class="stat">共 {{ totalGens }} 世</text>
        <text class="stat">·</text>
        <text class="stat">{{ nodeCount }} 节点</text>
      </view>

      <!-- 纵向世系时间轴 -->
      <view class="timeline">
        <!-- 伏羲根节点 -->
        <view class="tl-root" @click="goPerson(rootNode)">
          <text class="tl-avatar">👑</text>
          <view class="tl-body">
            <text class="tl-name">{{ rootNode.name }}</text>
            <text class="tl-gen">第 {{ rootNode.gen }} 世 · 中华人文始祖</text>
          </view>
          <text class="tl-arrow">›</text>
        </view>

        <!-- 链条节点 -->
        <view
          v-for="node in chainNodes"
          :key="node.handle || node.key"
          class="tl-node"
          :class="{ highlight: node.highlight }"
        >
          <view class="tl-line">
            <view class="tl-dot" :class="{ hl: node.highlight }" />
          </view>
          <view class="tl-card" @click="goPerson(node)">
            <view class="tl-card-head">
              <text class="tl-name">{{ node.name }}</text>
              <t-tag
                v-if="node.tag"
                :theme="node.tagTheme || 'default'"
                variant="light"
                size="small"
              >{{ node.tag }}</t-tag>
            </view>
            <text class="tl-gen">第 {{ node.gen }} 世</text>
            <text v-if="node.note" class="tl-note">{{ node.note }}</text>
          </view>
        </view>

        <!-- 底部：季文子（本支始祖）-->
        <view class="tl-end">
          <text class="end-label">▼ 本支始祖（第 90 世）▼</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchMasterTree, API_BASE } from '@/business';
import type { MasterNode } from '@/business/api';

const loading = ref(true);
const error = ref('');
const nodes = ref<any[]>([]);
const activeGen = ref(1);

// 关键节点标记（key 用 Gramps 存储的 first+last 拼接格式）
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

const rootNode = computed(() => {
  const n = nodes.value.find((x) => x.gen === 1);
  return n || { name: '伏羲', gen: 1, handle: '' };
});

// 世系链（去掉根，从第 2 世起；聚合段折叠显示）
const chainNodes = computed(() => {
  const all = [...nodes.value].sort((a, b) => (a.gen || 0) - (b.gen || 0));
  const chain: any[] = [];
  let pendingAggregate: any = null;

  for (const n of all) {
    if (n.gen === 1) continue; // 根单独显示
    if (n.is_aggregate) {
      pendingAggregate = n;
      continue;
    }
    if (pendingAggregate) {
      chain.push(pendingAggregate);
      pendingAggregate = null;
    }
    chain.push(n);
  }
  if (pendingAggregate) chain.push(pendingAggregate);
  return chain;
});

const nodeCount = computed(() => nodes.value.length);
const totalGens = computed(() => {
  const gens = nodes.value.map((n) => n.gen || 0);
  return gens.length ? Math.max(...gens) : 0;
});

// 代际导航标记（每 5 世一个 + 关键节点）
const genMarkers = computed(() => {
  const markers: { gen: number; name: string }[] = [];
  const gens = nodes.value.map((n) => n.gen || 0).sort((a, b) => a - b);
  const maxGen = gens.length ? gens[gens.length - 1] : 0;
  // 关键节点
  for (const [, info] of Object.entries(KEY_NODES)) {
    // 导航显示简化名：取 tag 核心词或世数
    const label = info.tag.replace('·', '');
    markers.push({ gen: info.gen, name: label.slice(0, 4) });
  }
  markers.sort((a, b) => a.gen - b.gen);
  return markers;
});

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    // 拉总谱节点
    const masterNodes = await fetchMasterTree();
    // 拉总谱的 90 世链：先看现有节点（含 90 世链则用；否则提示导入）
    const chain = await fetchChainData();
    nodes.value = chain.length ? chain : masterNodes.map((m) => ({
      name: m.name,
      handle: m.handle,
      gen: 0,
      is_master_ref: true,
    }));
    if (!chain.length) {
      error.value = '中华世本 90 世源流链尚未导入，请管理员执行导入脚本';
    }
  } catch (e: any) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
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
      // 原始拼接名（first+last，用于关键节点匹配）：季文子 → 文子季
      const rawName = `${fn}${sn}`.trim();
      // 显示名：姓在前（文子季 → 季文子）
      const displayName = sn && fn ? `${sn}${fn}` : rawName;
      chain.push({
        handle: p.handle,
        gramps_id: p.gramps_id,
        name: displayName || p.gramps_id,
        gen: parseInt(attrs.external_chain_gen, 10) || 0,
        is_aggregate: attrs.external_chain_aggregate === 'true',
        note: attrs.external_relation_note || '',
      });
      // 关键节点标记（基于原始拼接名匹配）
      const keyInfo = KEY_NODES[rawName];
      if (keyInfo) {
        chain[chain.length - 1].tag = keyInfo.tag;
        chain[chain.length - 1].tagTheme = keyInfo.theme;
      }
    }
  }
  chain.sort((a, b) => a.gen - b.gen);
  return chain;
}

function scrollToGen(gen: number) {
  activeGen.value = gen;
  // 简单滚动：找对应节点滚动到可视区
  const el = document.querySelector(`[data-gen="${gen}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function goPerson(node: any) {
  if (!node.handle) return;
  uni.navigateTo({
    url: `/pages/person/detail?tree_id=zhonghua&handle=${node.handle}`,
  });
}

onMounted(loadData);
</script>

<style scoped>
.container { padding: 16px; padding-bottom: 80px; }
.hero {
  background: linear-gradient(135deg, #3E2723, #6D4C41);
  border-radius: 14px; padding: 20px; color: #fff; margin-bottom: 14px;
}
.hero-title { font-size: 22px; font-weight: bold; display: block; }
.hero-sub { font-size: 12px; color: #D7CCC8; margin-top: 4px; display: block; }
.center { text-align: center; padding: 60px 0; color: #999; }
.center.error { color: #C62828; }

/* 代际导航 */
.gen-nav { white-space: nowrap; margin-bottom: 10px; }
.gen-nav-inner { display: inline-flex; gap: 8px; padding: 4px 2px; }
.gen-marker {
  display: inline-flex; flex-direction: column; align-items: center;
  padding: 6px 12px; background: #fff; border-radius: 10px;
  border: 1px solid #E0D5C8;
}
.gen-marker.active { background: #8B4513; border-color: #8B4513; }
.gen-num { font-size: 12px; font-weight: bold; color: #8B4513; }
.gen-marker.active .gen-num { color: #fff; }
.gen-name { font-size: 10px; color: #999; }
.gen-marker.active .gen-name { color: #E8D5C0; }

.stats { text-align: center; margin: 8px 0 14px; color: #999; font-size: 12px; }
.stat { margin: 0 4px; }

/* 纵向时间轴 */
.timeline { position: relative; }
.tl-root {
  display: flex; align-items: center; gap: 12px;
  background: linear-gradient(135deg, #B8860B, #DAA520);
  border-radius: 12px; padding: 14px 16px; color: #fff; margin-bottom: 4px;
}
.tl-avatar { font-size: 26px; }
.tl-body { flex: 1; }
.tl-name { font-size: 16px; font-weight: bold; display: block; }
.tl-gen { font-size: 11px; color: rgba(255,255,255,0.85); display: block; margin-top: 2px; }
.tl-arrow { font-size: 18px; }

.tl-node { display: flex; position: relative; }
.tl-line {
  width: 40px; display: flex; justify-content: center; position: relative;
}
.tl-line::before {
  content: ''; position: absolute; top: 0; bottom: 0; width: 2px;
  background: #E0D5C8;
}
.tl-dot {
  width: 12px; height: 12px; border-radius: 50%;
  background: #D49355; border: 3px solid #F5E6D3;
  margin-top: 14px; z-index: 1;
}
.tl-dot.hl { background: #8B4513; border-color: #E8C9A0; }

.tl-card {
  flex: 1; background: #fff; border-radius: 10px;
  padding: 10px 12px; margin: 4px 8px 4px 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  cursor: pointer;
}
.tl-card-head { display: flex; align-items: center; gap: 8px; }
.tl-card .tl-name { font-size: 14px; color: #3E2723; }
.tl-card .tl-gen { color: #B5A594; }
.tl-note { font-size: 11px; color: #999; display: block; margin-top: 4px; line-height: 1.5; }
.tl-node.highlight .tl-card { border: 1px solid #8B4513; }

.tl-end { text-align: center; padding: 14px 0 4px; }
.end-label { font-size: 12px; color: #8B4513; font-weight: bold; }
</style>
