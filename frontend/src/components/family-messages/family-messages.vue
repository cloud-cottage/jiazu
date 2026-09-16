<template>
  <view class="family-messages">
    <view class="fm-head">
      <text class="fm-title">{{ messageTitle }}</text>
      <text class="fm-sub">{{ messageSub }}</text>
    </view>

    <view v-if="loading" class="fm-empty">加载中…</view>
    <template v-else>
      <view v-if="!items.length" class="fm-empty">暂无待办消息</view>

      <view v-for="it in items" :key="it.key" class="fm-item">
        <view class="fm-item-head">
          <t-tag :theme="it.theme" variant="light" size="small">{{ it.kind }}</t-tag>
          <text class="fm-item-title">{{ it.title }}</text>
        </view>
        <text class="fm-item-desc">{{ it.desc }}</text>
        <text v-if="it.note" class="fm-item-desc">说明：{{ it.note }}</text>

        <view class="fm-item-actions">
          <template v-if="it.actionable">
            <t-button size="small" theme="primary" :loading="busy === it.key" @click="decide(it, true)">通过</t-button>
            <t-button size="small" variant="outline" theme="danger" :disabled="busy === it.key" @click="decide(it, false)">驳回</t-button>
          </template>
          <t-button v-else size="small" variant="outline" theme="primary" @click="goAdmin">去管理工作台处理</t-button>
        </view>
      </view>
    </template>

    <view v-if="error" class="fm-error">{{ error }}</view>
    <view v-if="items.length || error" class="fm-foot">
      <text class="fm-foot-text" @click="load">刷新</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 家族消息（审批入口）：本树管理员在此处理
 * - 联姻 / 离异申请（跨树嫁娶，docs/marriage.spec.md 权限口径 C）→ 可就地通过/驳回
 * - 认祖申请（始祖挂载，docs/founder-attach.spec.md）→ 目标上层树 chief_editor 就地通过/驳回
 * - 建谱申请（宗谱，docs/clan-tree.spec.md §5）→ 仅 chief_editor 就地通过/驳回
 * - 加入申请 / 退出申请 → 需要选人/复核，跳管理工作台处理
 * 入口只在有管理权限（chief_editor / 本树 tree_steward）时可见（hall 页控制）。
 */
import { computed, onMounted, ref } from 'vue';
import {
  fetchJoinRequests,
  fetchLeaveRequests,
  fetchMarriageRequests,
  decideMarriageRequest,
  fetchFounderRequests,
  decideFounderRequest,
  fetchClanRequests,
  decideClanRequest,
  treeKindLabel,
} from '@/business/api';
import { getAuthToken } from '@/business/auth';
import { personIdDisplay } from '@/business/format';

const props = withDefaults(
  defineProps<{
    treeId: string;
    /**
     * 层级（只影响文案，不影响权限口径与数据源）：
     * master = 中华世本 →「世本消息」/ clan = 宗谱 →「宗谱消息」/ family = 普通树 →「家族消息」
     */
    level?: 'master' | 'clan' | 'family';
  }>(),
  { level: 'family' },
);

/** 层级文案（入口可见性仍由宿主控制：chief_editor 全局 / 本树 tree_steward） */
const levelLabel = computed(() => (props.level === 'master' ? '世本' : props.level === 'clan' ? '宗谱' : '家族'));
const messageTitle = computed(() => `${levelLabel.value}消息`);
const messageSub = computed(() => {
  const who = props.level === 'master' ? '总谱' : props.level === 'clan' ? '本宗谱' : '本树';
  return `需要${who}管理员审批的事项（联姻/离异 · 认祖 · 建谱；仅管理权限可见）`;
});

const items = ref<any[]>([]);
const loading = ref(true);
const busy = ref('');
const error = ref('');

function marriageText(r: any): string {
  if (r.action === 'marry') return r.direction === 'in' ? '娶入申请' : '嫁出申请';
  return r.kind || '合离申请';
}

async function load() {
  const token = getAuthToken();
  if (!token) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [marriages, joins, leaves, founders, clans] = await Promise.all([
      fetchMarriageRequests(props.treeId, token).catch(() => ({ list: [] as any[] })),
      fetchJoinRequests(token).catch(() => [] as any[]),
      fetchLeaveRequests(token).catch(() => [] as any[]),
      fetchFounderRequests(props.treeId, token).catch(() => ({
        list: [] as any[],
        can_approve_all: false,
        my_tree: '',
        attachments: [],
        clans: [],
      })),
      fetchClanRequests(token).catch(() => ({ ok: false, list: [] as any[], can_approve_all: false, my_tree: '' })),
    ]);

    const out: any[] = [];
    for (const m of marriages.list || []) {
      const bits: string[] = [`${m.from_tree} → ${m.to_tree}`];
      if (m.action === 'marry' && m.marriage_date) bits.push(`成婚 ${m.marriage_date}`);
      if (m.action === 'divorce' && m.end_date) bits.push(`结束 ${m.end_date}`);
      bits.push(`${m.requested_by || ''} 于 ${(m.created_at || '').slice(0, 10)}`);
      out.push({
        key: `m:${m._id}`,
        type: 'marriage',
        kind: marriageText(m),
        theme: m.action === 'divorce' ? 'danger' : 'warning',
        title: `${m.from_person_name} ↔ ${m.to_person_name}`,
        desc: bits.join(' · '),
        note: m.note || '',
        actionable: true,
        request: m,
      });
    }
    for (const j of (joins as any[]).filter((x) => x.status === 'pending')) {
      out.push({
        key: `j:${j.id}`,
        type: 'join',
        kind: '加入申请',
        theme: 'primary',
        title: j.self_name || j.nickname || j.phone,
        desc: `申请加入 ${j.tree_id}${j.reference_name ? ` · 支系节点 ${j.reference_name}` : ''} · ${(j.created_at || '').slice(0, 10)}`,
        note: j.note || '',
        actionable: false,
      });
    }
    for (const l of (leaves as any[]).filter((x) => x.status === 'pending')) {
      out.push({
        key: `l:${l.id}`,
        type: 'leave',
        kind: '退出申请',
        theme: 'default',
        title: l.nickname || l.phone,
        desc: `申请退出 ${l.tree_id}${l.person_handle ? ` · 本人节点 ${personIdDisplay(l.person_handle)}` : ''} · ${(l.created_at || '').slice(0, 10)}`,
        note: l.reason || '',
        actionable: false,
      });
    }
    // 认祖申请（docs/founder-attach.spec.md）：目标上层树的 chief_editor 就地通过/驳回
    // 通过 → 建立镜像挂载（宗谱→世本 / 普通树→宗谱）；驳回 → 只写理由，不改数据
    const founderCanApproveAll = !!founders.can_approve_all;
    for (const f of (founders.list || []).filter((x: any) => x.status === 'pending')) {
      const targetKind = f.target_kind || (f.master_tree_id === 'zhonghua' ? 'master' : 'clan');
      out.push({
        key: `f:${f._id}`,
        type: 'founder',
        kind: '认祖申请',
        theme: 'primary',
        title: `${f.founder_name || f.founder_gramps_id || f.tree_id} ⛩ ${f.master_name || f.master_handle}`,
        desc:
          `${f.tree_id} 的始祖认祖到${treeKindLabel(targetKind)}「${f.master_tree_id}」` +
          (` · ${f.requested_by || ''} 于 ${(f.created_at || '').slice(0, 10)}`),
        note: f.note || '',
        actionable: founderCanApproveAll || (!!founders.my_tree && founders.my_tree === f.master_tree_id),
        request: f,
      });
    }
    // 建谱申请（docs/clan-tree.spec.md §5）：仅 chief_editor 可就地审批（通过 → 建宗谱树）
    for (const c of (clans.list || []).filter((x: any) => x.status === 'pending')) {
      out.push({
        key: `c:${c._id}`,
        type: 'clan',
        kind: '建谱申请',
        theme: 'warning',
        title: `${c.surname}氏宗谱 · 始祖 ${c.master_name || c.master_handle}`,
        desc:
          `${c.surname} 姓建谱申请（锚：${c.tree_id || '—'}）· ` +
          `${c.requested_by || ''} 于 ${(c.created_at || '').slice(0, 10)}`,
        note: c.note || '',
        actionable: !!clans.can_approve_all,
        request: c,
      });
    }
    items.value = out;
  } catch (e: any) {
    error.value = e?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 就地审批：联姻/离异（目标树写权）、认祖（目标上层树 chief_editor）、建谱（仅 chief_editor）。
 * 服务端会再次校验权限；无权限者本条显示「去管理工作台处理」。
 */
async function decide(it: any, approve: boolean) {
  const token = getAuthToken();
  if (!token) return;
  busy.value = it.key;
  try {
    if (it.type === 'founder') {
      const targetTree = it.request.master_tree_id || props.treeId;
      await decideFounderRequest(targetTree, it.request._id, approve, token, approve ? '' : '管理员驳回');
      uni.showToast({ title: approve ? '已通过，始祖挂载已建立' : '已驳回', icon: approve ? 'success' : 'none' });
    } else if (it.type === 'clan') {
      await decideClanRequest(it.request._id, approve, token, approve ? '' : '管理员驳回');
      uni.showToast({ title: approve ? '已通过，宗谱已建立' : '已驳回', icon: approve ? 'success' : 'none' });
    } else {
      await decideMarriageRequest(it.request.to_tree, it.request._id, approve, token, approve ? '' : '管理员驳回');
      uni.showToast({ title: approve ? '已通过，双方家族已更新' : '已驳回', icon: approve ? 'success' : 'none' });
    }
    await load();
  } catch (e: any) {
    uni.showModal({ title: approve ? '审批失败' : '驳回失败', content: e?.message || '请稍后重试', showCancel: false });
  } finally {
    busy.value = '';
  }
}

function goAdmin() {
  uni.navigateTo({ url: '/pages/admin/index' });
}

onMounted(load);
</script>

<style scoped>
.family-messages { padding: 4px 2px 24px; }
.fm-head { margin-bottom: 10px; }
.fm-title { font-size: 16px; font-weight: bold; color: #8B4513; display: block; }
.fm-sub { font-size: 12px; color: #A1887F; display: block; margin-top: 4px; }
.fm-empty { text-align: center; color: #999; padding: 28px 0; font-size: 13px; }
.fm-item { background: #FFFDF8; border: 1px solid #EFE3D3; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
.fm-item-head { display: flex; align-items: center; gap: 8px; }
.fm-item-title { font-size: 15px; font-weight: bold; color: #3E2723; }
.fm-item-desc { font-size: 12px; color: #795548; display: block; margin-top: 6px; }
.fm-item-actions { display: flex; gap: 8px; margin-top: 10px; }
.fm-error { color: #C62828; font-size: 12px; margin-top: 8px; }
.fm-foot { text-align: center; margin-top: 10px; }
.fm-foot-text { font-size: 12px; color: #8B4513; }
</style>
