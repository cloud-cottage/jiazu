<template>
  <view class="container">
    <text class="title">世系图谱</text>
    <text class="tree-id" v-if="treeId">Tree: {{ treeId }}</text>

    <view class="stats" v-if="forest.length">
      <text class="stat">共 {{ totalPeople }} 人</text>
      <text class="stat">{{ forest.length }} 支始祖</text>
    </view>

    <view v-if="loading" class="loading">
      <text>加载中...</text>
    </view>

    <view v-else-if="error" class="error">
      <text>{{ error }}</text>
    </view>

    <!-- ECharts 世系树 -->
    <view v-else-if="forest.length" class="chart-wrap">
      <view id="tree-chart" class="chart" />
      <text class="hint">💡 点击人物节点查看详情 · 支持缩放拖动</text>
    </view>

    <view v-else class="empty">
      <text>该家族暂无世系数据</text>
    </view>

    <!-- 人物详情模态框 -->
    <view v-if="selected" class="modal-mask" @click="closeModal">
      <view class="modal" @click.stop>
        <text class="modal-name">{{ selected.name }}</text>

        <view class="modal-tags">
          <text class="tag" :class="genderClass">{{ genderLabel }}</text>
          <text v-if="selected.is_living" class="tag tag-living">在世（脱敏）</text>
        </view>

        <view class="modal-row" v-if="selected.birth_date && !selected.is_living">
          <text class="row-label">生</text>
          <text class="row-value">{{ selected.birth_date }}</text>
        </view>
        <view class="modal-row" v-if="selected.death_date && !selected.is_living">
          <text class="row-label">卒</text>
          <text class="row-value">{{ selected.death_date }}</text>
        </view>
        <view class="modal-row">
          <text class="row-label">编号</text>
          <text class="row-value">{{ selected.gramps_id }}</text>
        </view>

        <view class="modal-actions">
          <button class="btn-detail" @click="goDetail">查看完整档案</button>
          <!-- admin 专属：移除并新建家族树 -->
          <button
            v-if="isAdmin"
            class="btn-split"
            :disabled="splitting"
            @click="confirmSplit"
          >
            {{ splitting ? '处理中...' : '⛔ 移除并新建家族树' }}
          </button>
          <text v-if="splitError" class="split-error">{{ splitError }}</text>
          <text class="btn-close" @click="closeModal">关闭</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchPersonList, fetchFamilyList, splitTree } from '@/business/api';
import { buildPedigreeForest } from '@/business/pedigree';
import { authState, isAuthenticated, getAuthToken } from '@/business/auth';
import type { PersonSummary } from '@/business/types';
import type { TreePersonNode } from '@/business/pedigree';
import * as echarts from 'echarts';

const treeId = ref('');
const loading = ref(true);
const error = ref('');
const forest = ref<TreePersonNode[]>([]);
const totalPeople = ref(0);
const selected = ref<TreePersonNode | null>(null);
const splitting = ref(false);
const splitError = ref('');

// admin 判定：登录用户 role === 'admin'
const isAdmin = computed(() => isAuthenticated() && authState.role === 'admin');

let chart: echarts.ECharts | null = null;

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

function genderLabel(): string {
  if (!selected.value) return '';
  return selected.value.gender === 'M' ? '男' : selected.value.gender === 'F' ? '女' : '未知';
}
function genderClass(): string {
  if (!selected.value) return '';
  return selected.value.gender === 'M' ? 'tag-male' : selected.value.gender === 'F' ? 'tag-female' : '';
}

function goDetail() {
  if (!selected.value) return;
  uni.navigateTo({
    url: `/pages/person/detail?tree_id=${treeId.value}&handle=${selected.value.handle}`,
  });
}

function closeModal() {
  selected.value = null;
  splitError.value = '';
}

/** admin 确认并执行「移除并新建家族树」 */
async function confirmSplit() {
  if (!selected.value) return;
  const node = selected.value;

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '移除并新建家族树',
      content: `以「${node.name}」为始祖新建一支家族树？\n\n新树姓氏：${node.name[0] || '?'}氏\n原树中将移除 ${node.name} 及其全部后代。此操作不可撤销！`,
      confirmText: '确认拆分',
      cancelText: '取消',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  const token = getAuthToken();
  if (!token) {
    splitError.value = '登录已过期，请重新登录';
    return;
  }

  splitting.value = true;
  splitError.value = '';
  try {
    const res = await splitTree(token, {
      tree_id: treeId.value,
      ancestor_handle: node.handle,
      ancestor_name: node.name,
    });
    uni.showModal({
      title: '拆分成功',
      content: `已创建新家族树「${res.newTreeId}」\n${res.message}`,
      showCancel: false,
      confirmText: '刷新查看',
      success: () => {
        selected.value = null;
        // 重新加载当前树（原树已移除该支）
        reloadData();
      },
    });
  } catch (e: any) {
    splitError.value = e.message || '拆分失败';
  } finally {
    splitting.value = false;
  }
}

/** 重新加载世系数据 */
async function reloadData() {
  loading.value = true;
  try {
    const [people, families] = await Promise.all([
      fetchPersonList(treeId.value, 0, 0),
      fetchFamilyList(treeId.value),
    ]);
    totalPeople.value = people.data.length;
    forest.value = buildPedigreeForest(people.data, families);
    if (chart) {
      chart.dispose();
      chart = null;
    }
    setTimeout(() => {
      if (forest.value.length) renderChart();
    }, 100);
  } catch (e: any) {
    error.value = `加载失败: ${e.message || e}`;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!treeId.value) {
    error.value = '缺少 tree_id 参数';
    loading.value = false;
    return;
  }
  try {
    const [people, families] = await Promise.all([
      fetchPersonList(treeId.value, 0, 0),
      fetchFamilyList(treeId.value),
    ]);
    totalPeople.value = people.data.length;
    forest.value = buildPedigreeForest(people.data, families);
    // 等待 DOM 渲染后初始化图表
    setTimeout(() => {
      if (forest.value.length) renderChart();
    }, 100);
  } catch (e: any) {
    console.error('加载世系数据失败:', e);
    error.value = `加载失败: ${e.message || e}`;
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (chart) {
    chart.dispose();
    chart = null;
  }
});

function renderChart() {
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!el) return;

  chart = echarts.init(el);

  // 多根森林 → 包虚拟根，避免 radial 布局下根节点全部重叠在圆心
  const rootNode: TreePersonNode = {
    name: '始祖',
    handle: '__root__',
    gramps_id: '',
    gender: 'U',
    is_living: false,
    itemStyle: { color: '#8B4513' },
    children: forest.value,
  };

  chart.setOption({
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      formatter: (params: any) => {
        const d = params.data as TreePersonNode;
        if (!d || !d.gramps_id) return d?.name || '';
        const life = d.birth_date ? `${d.birth_date} — ${d.death_date || '?'}` : '';
        return `<b>${d.name}</b><br/>${d.gramps_id}${life ? `<br/>${life}` : ''}`;
      },
    },
    series: [
      {
        type: 'tree',
        data: [rootNode],
        // 径向布局：根系状
        layout: 'radial',
        symbol: 'circle',
        symbolSize: 16,
        // 全量展开（最大深度 5 代，10 足够覆盖），44 支始祖沿圆周分布
        initialTreeDepth: 10,
        expandAndCollapse: true,
        animationDuration: 550,
        animationDurationUpdate: 750,
        lineStyle: { color: '#A1887F', width: 1.2, curveness: 0.5 },
        label: {
          position: 'inside',
          rotate: 0,
          fontSize: 9,
          color: '#fff',
          formatter: (params: any) => {
            const d = params.data as TreePersonNode;
            return d.name ? d.name.slice(0, 4) : '';
          },
        },
        emphasis: {
          focus: 'descendant',
          itemStyle: { borderColor: '#8B4513', borderWidth: 2 },
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1,
        },
      },
    ],
  });

  chart.on('click', (params: any) => {
    const d = params?.data as TreePersonNode | undefined;
    // 虚拟根（无 gramps_id）不弹模态框
    if (d && d.gramps_id) {
      selected.value = d;
    }
  });
}
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }
.stats { text-align: center; margin: 16px 0; padding: 10px; background: #FFF8E1; border-radius: 8px; }
.stat { font-size: 14px; color: #5D4037; margin: 0 12px; display: inline-block; }
.loading, .error, .empty { text-align: center; padding: 40px; color: #999; }
.error { color: #C62828; }
.chart-wrap { margin-top: 8px; }
.chart { width: 100%; height: 70vh; min-height: 480px; }
.hint { display: block; text-align: center; font-size: 12px; color: #999; margin-top: 8px; }

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
.modal-tags { display: flex; justify-content: center; gap: 8px; margin: 10px 0 14px; }
.tag { font-size: 12px; padding: 3px 10px; border-radius: 10px; }
.tag-male { background: #E3F0FA; color: #2C5F8A; }
.tag-female { background: #FBE9EC; color: #A0505A; }
.tag-living { background: #FFF3E0; color: #E65100; }
.modal-row { display: flex; padding: 6px 0; }
.row-label { width: 40px; color: #8B4513; font-weight: bold; font-size: 14px; }
.row-value { color: #555; font-size: 14px; flex: 1; }
.modal-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.btn-detail {
  height: 40px; line-height: 40px; background: #8B4513; color: #fff;
  font-size: 15px; border-radius: 8px;
}
.btn-split {
  height: 40px; line-height: 40px; background: #C62828; color: #fff;
  font-size: 14px; border-radius: 8px;
}
.btn-split[disabled] { opacity: 0.6; }
.split-error { text-align: center; color: #C62828; font-size: 12px; }
.btn-close { text-align: center; color: #999; font-size: 14px; padding: 4px 0; }
</style>
