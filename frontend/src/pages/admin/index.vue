<template>
  <view class="container">
    <view v-if="!isAuthenticated()" class="not-logged">
      <text>请先登录</text>
      <t-button theme="primary" block class="btn-login" @click="goLogin">去登录</t-button>
    </view>

    <view v-else-if="!canManage" class="not-logged">
      <text>需要族谱主理人（tree_steward）或以上权限</text>
    </view>

    <template v-else>
      <view class="header-card">
        <text class="header-title">角色管理</text>
        <text class="header-sub">您的角色：{{ roleName(authState.role) }}</text>
      </view>

      <!-- 用户列表 -->
      <view class="section">
        <text class="section-title">用户列表（{{ users.length }}）</text>
        <view v-if="!users.length" class="empty">暂无用户</view>
        <view v-for="u in users" :key="u.phone" class="user-item">
          <view class="user-info">
            <text class="user-name">{{ u.nickname }}</text>
            <text class="user-phone">{{ u.phone }}</text>
            <t-tag
              :theme="tagTheme(u.role)"
              variant="light"
              size="small"
              class="user-role"
            >{{ roleName(u.role) }}</t-tag>
          </view>
          <view class="user-actions" v-if="u.phone !== authState.phone && canManageUser(u.role)">
            <t-dropdown-menu>
              <t-dropdown-item
                :options="roleOptions"
                :value="u.role"
                :label="roleName(u.role)"
                @change="(val: string) => changeRole(u, val)"
              />
            </t-dropdown-menu>
          </view>
          <view class="anchor-row" v-if="u.phone !== authState.phone && canManageUser(u.role)">
            <t-input
              :model-value="anchorInputs[u.phone]?.tree || ''"
              placeholder="锚点树 ID"
              size="small"
              class="anchor-input"
              @update:model-value="(v: string) => setAnchorField(u.phone, 'tree', v)"
            />
            <t-input
              :model-value="anchorInputs[u.phone]?.person || ''"
              placeholder="锚点人物 handle"
              size="small"
              class="anchor-input"
              @update:model-value="(v: string) => setAnchorField(u.phone, 'person', v)"
            />
            <t-button
              size="small"
              variant="outline"
              @click="saveAnchor(u)"
            >设锚点</t-button>
          </view>
        </view>
      </view>

      <!-- 解绑申请审批 -->
      <view class="section">
        <text class="section-title">解绑申请（{{ pendingLeaves.length }} 待审批）</text>
        <view v-if="!leaveRequests.length" class="empty">暂无解绑申请</view>
        <view v-for="lr in leaveRequests" :key="lr.id" class="leave-item">
          <view class="leave-info">
            <text class="leave-name">{{ lr.nickname }}（{{ lr.phone }}）</text>
            <text class="leave-desc">申请离开 {{ lr.tree_id }} · {{ formatTime(lr.created_at) }}</text>
            <text v-if="lr.reason" class="leave-desc">原因：{{ lr.reason }}</text>
            <t-tag
              :theme="lr.status === 'pending' ? 'warning' : lr.status === 'approved' ? 'success' : 'default'"
              variant="light"
              size="small"
              class="leave-status"
            >{{ leaveStatusText(lr.status) }}</t-tag>
          </view>
          <view v-if="lr.status === 'pending'" class="leave-actions">
            <t-button size="small" theme="primary" @click="handleLeave(lr, true)">通过</t-button>
            <t-button size="small" variant="outline" theme="danger" @click="handleLeave(lr, false)">拒绝</t-button>
          </view>
        </view>
      </view>

      <!-- 联姻/离异申请审批（docs/marriage.spec.md：发起 → 目标树审批；口径 C） -->
      <view class="section">
        <text class="section-title">联姻/离异申请（{{ pendingMarriages.length }} 待审批）</text>
        <view v-if="!pendingMarriages.length" class="empty">暂无待审批申请</view>
        <view v-for="mq in pendingMarriages" :key="mq._id" class="leave-item">
          <view class="leave-info">
            <text class="leave-name">
              {{ marriageActionText(mq) }}：{{ mq.from_person_name }}（{{ mq.from_tree }}） ↔ {{ mq.to_person_name }}（{{ mq.to_tree }}）
            </text>
            <text class="leave-desc">
              发起：{{ mq.requested_by }} · {{ formatTime(mq.created_at) }}
              <template v-if="mq.action === 'marry' && mq.marriage_date"> · 成婚 {{ mq.marriage_date }}</template>
              <template v-if="mq.action === 'divorce' && mq.end_date"> · 结束 {{ mq.end_date }}</template>
            </text>
            <text v-if="mq.note" class="leave-desc">说明：{{ mq.note }}</text>
          </view>
          <view class="leave-actions">
            <t-button size="small" theme="primary" @click="approveMarriage(mq)">通过</t-button>
            <t-button size="small" variant="outline" theme="danger" @click="rejectMarriage(mq)">驳回</t-button>
          </view>
        </view>
      </view>

      <!-- 加入申请审批（申请-审批制：docs/permission-tier.spec.md §9） -->
      <view class="section">
        <text class="section-title">加入申请（{{ pendingJoins.length }} 待审批）</text>
        <view v-if="!joinRequests.length" class="empty">暂无加入申请</view>
        <view v-for="jr in joinRequests" :key="jr.id" class="leave-item">
          <view class="leave-info">
            <text class="leave-name">{{ jr.self_name || jr.nickname || jr.phone }}</text>
            <text class="leave-desc">
              {{ jr.phone }} · 申请加入 {{ jr.tree_id }} · {{ formatTime(jr.created_at) }}
            </text>
            <text class="leave-desc">
              支系节点：{{ jr.reference_name
              }}<template v-if="jr.reference_depth">（第 {{ jr.reference_depth }} 世）</template>
            </text>
            <text v-if="jr.note" class="leave-desc">说明：{{ jr.note }}</text>
            <t-tag
              :theme="jr.status === 'pending' ? 'warning' : jr.status === 'approved' ? 'success' : 'default'"
              variant="light"
              size="small"
              class="leave-status"
            >{{ joinStatusText(jr.status) }}</t-tag>
          </view>
          <view v-if="jr.status === 'pending'" class="leave-actions">
            <t-button size="small" theme="primary" @click="openApprove(jr)">通过</t-button>
            <t-button size="small" variant="outline" theme="danger" @click="rejectJoin(jr)">拒绝</t-button>
          </view>
        </view>

        <!-- 通过审批（在申请树中检索并绑定申请人本人节点；面板位于列表下方） -->
        <view v-if="approving" class="approve-box">
          <text class="leave-desc">
            批准 {{ approving.self_name || approving.nickname || approving.phone }} 加入
            {{ approving.tree_id }} —— 检索申请人本人节点（谱中已收录则直接选择；未收录请先在树中新增该成员）
          </text>
          <view class="search-row">
            <t-input
              :value="approveQuery"
              placeholder="按姓名搜索本家族节点"
              class="search-input"
              @update:value="(v: string) => approveQuery = v"
              @confirm="searchApproveCandidates"
            />
            <t-button size="small" theme="primary" @click="searchApproveCandidates">搜索</t-button>
          </view>
          <view v-if="approveSearching" class="approve-tip">搜索中...</view>
          <view v-else-if="approveResults.length" class="approve-results">
            <view
              v-for="r in approveResults"
              :key="r.handle"
              class="approve-result"
              :class="{ selected: approveCandidate?.handle === r.handle }"
              @click="approveCandidate = r"
            >
              <text class="approve-result-name">{{ r.name }}</text>
              <text class="approve-result-id">{{ personIdDisplay(r.gramps_id) }}</text>
            </view>
          </view>
          <view v-else-if="approveSearched" class="approve-tip">未找到匹配节点，请换名字搜索或先新增节点</view>
          <view v-if="joinError" class="approve-error">{{ joinError }}</view>
          <view class="approve-actions">
            <t-button
              size="small"
              theme="primary"
              :disabled="!approveCandidate"
              :loading="approvingSubmitting"
              @click="confirmApprove(approving)"
            >绑定并批准</t-button>
            <t-button size="small" variant="text" @click="approving = null">收起</t-button>
          </view>
        </view>
      </view>

      <!-- 资产运维（docs/economy-ops.spec.md §5）：仅 chief_editor 可见，与后端 403 口径一致 -->
      <view class="section">
        <text class="section-title">资产运维</text>
        <view v-if="!isChief" class="empty">需要总编辑权限</view>

        <template v-else>
          <!-- 发放 / 扣减表单 -->
          <text class="field-label">目标手机号</text>
          <t-input
            :value="grantPhone"
            type="number"
            placeholder="11 位手机号"
            class="field"
            @update:value="(v: string) => grantPhone = v"
          />

          <text class="field-label">资产增减（可正可负；留空 = 该项不变）</text>
          <view class="delta-grid">
            <view v-for="f in DELTA_FIELDS" :key="f.key" class="delta-cell">
              <text class="delta-name">{{ f.label }}</text>
              <t-input
                :value="grantDelta[f.key]"
                type="number"
                :placeholder="f.unit"
                size="small"
                @update:value="(v: string) => setDelta(f.key, v)"
              />
            </view>
          </view>

          <text class="field-label">操作原因（必填）</text>
          <t-input
            :value="grantReason"
            placeholder="如：上传史料奖励"
            class="field"
            @update:value="(v: string) => grantReason = v"
          />

          <text class="field-label">依据（选填，随日志留痕）</text>
          <t-input
            :value="grantEvidence"
            placeholder="如：上传史料：某年族谱影印"
            class="field"
            @update:value="(v: string) => grantEvidence = v"
          />

          <view v-if="grantError" class="grant-error">{{ grantError }}</view>
          <t-button theme="primary" block :loading="granting" @click="submitGrant">
            发放 / 扣减
          </t-button>

          <!-- 用户资产查询 -->
          <view class="grant-sub">
            <text class="field-label">用户资产查询（手机号）</text>
            <view class="query-row">
              <t-input
                :value="queryPhone"
                type="number"
                placeholder="11 位手机号"
                class="query-input"
                @update:value="(v: string) => queryPhone = v"
                @confirm="queryUserAssets()"
              />
              <t-button size="small" variant="outline" :loading="querying" @click="queryUserAssets()">
                查询
              </t-button>
            </view>
            <view v-if="queryError" class="grant-error">{{ queryError }}</view>
            <view v-if="snapshot" class="snap">
              <view class="snap-row">
                <text class="snap-label">碎片</text>
                <text class="snap-value">{{ snapshot.fragments }} / 9 片</text>
              </view>
              <view class="snap-row">
                <text class="snap-label">石榴籽</text>
                <text class="snap-value">{{ snapshot.seeds_total }} 颗</text>
              </view>
              <view class="snap-row">
                <text class="snap-label">竹片</text>
                <text class="snap-value">{{ snapshot.bamboos_total_pieces }} 片</text>
              </view>
              <view class="snap-row">
                <text class="snap-label">石榴籽玉</text>
                <text class="snap-value">{{ snapshotJadeCount }} 枚</text>
              </view>
              <view class="snap-row">
                <text class="snap-label">兰帖</text>
                <text class="snap-value">{{ snapshot.scrolls_item_count ?? 0 }} 张（{{ snapshot.scrolls_total_pieces ?? 0 }} 片）</text>
              </view>
              <view class="snap-row">
                <text class="snap-label">兰帖残页</text>
                <text class="snap-value">{{ snapshot.scroll_fragments ?? 0 }} / {{ snapshot.scroll_fragment_cap ?? 99 }} 片</text>
              </view>
              <view class="snap-row">
                <text class="snap-label">最近签到</text>
                <text class="snap-value">{{ snapshot.signin_date || '—' }}</text>
              </view>
              <view v-for="lot in snapshot.seed_lots" :key="lot.id" class="snap-lot">
                石榴籽批次 {{ lot.id }} · {{ lot.qty }} 颗 · 到期 {{ formatTime(lot.expires_at) }}
              </view>
              <view v-for="lot in snapshot.bamboo_lots" :key="lot.id" class="snap-lot">
                竹片批次 {{ lot.id }} · {{ lot.qty }} 片 · 到期 {{ formatTime(lot.expires_at) }}
              </view>
              <view v-for="j in snapshotJades" :key="j.id" class="snap-lot">
                石榴籽玉 {{ j.id }} · {{ j.expires_at ? '到期 ' + formatTime(j.expires_at) : '永久' }}
                <template v-if="j.mounted_tree_id"> · 已镶嵌 {{ j.mounted_tree_id }}</template>
              </view>
              <!-- 兰帖批次：`ScrollLot.expires_at` 恒 `null`（永久）⇒ 恒显示「永久」，不走 `formatTime(undefined)` -->
              <view v-for="lot in snapshotScrollLots" :key="lot.id" class="snap-lot">
                兰帖批次 {{ lot.id }} · {{ lot.qty }} 片 · 永久
              </view>
            </view>
          </view>

          <!-- 资产变动日志 -->
          <view class="grant-sub">
            <text class="field-label">资产变动日志（最近 {{ opsLogs.length }} 条）</text>
            <view class="query-row">
              <t-input
                :value="logPhone"
                type="number"
                placeholder="目标手机号"
                class="query-input"
                @update:value="(v: string) => logPhone = v"
              />
              <t-input
                :value="logOperator"
                type="number"
                placeholder="操作人手机号"
                class="query-input"
                @update:value="(v: string) => logOperator = v"
              />
              <t-button size="small" variant="outline" :loading="logsLoading" @click="loadLogs">
                筛选
              </t-button>
            </view>
            <view v-if="logsError" class="grant-error">{{ logsError }}</view>
            <view v-if="!opsLogs.length" class="empty">暂无资产变动日志</view>
            <view v-for="log in opsLogs" :key="log.id" class="log-item">
              <view class="log-head">
                <text class="log-target">{{ log.target_phone }}</text>
                <text class="log-delta" :class="{ minus: isMinusDelta(log.delta) }">
                  {{ deltaText(log.delta) }}
                </text>
              </view>
              <text class="log-sub">操作人 {{ log.operator }} · {{ formatTime(log.ts) }}</text>
              <text class="log-reason">原因：{{ log.reason }}</text>
            </view>
          </view>
        </template>
      </view>

      <view v-if="error" class="error">{{ error }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchUserList, setUserRole, setAnchor, fetchLeaveRequests, approveLeave, fetchJoinRequests, approveJoinRequest, rejectJoinRequest, searchPeople, fetchMarriageRequests, decideMarriageRequest, postAdminAssetsGrant, fetchAdminAssetsLogs, fetchAdminAssetsUser, jadeListOf, jadeCountOf } from '@/business/api';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import type { ManagedUser, LeaveRequestItem, JoinRequestItem, OpsLog, AdminAssetSnapshot } from '@/business/api';
import type { AssetDelta, Jade } from '@/business/api';
import { scrollDeltaLabel, scrollFragmentDeltaLabel } from '@/business/asset-text';
import { SCROLL_PIECES_PER_ITEM } from '@/business/inventory';
import type { ScrollLot } from '@/business/types';
import type { PersonSummary } from '@/business/types';
import { personIdDisplay } from '@/business/format';

const users = ref<ManagedUser[]>([]);
const error = ref('');
const anchorInputs = ref<Record<string, { tree: string; person: string }>>({});
const leaveRequests = ref<LeaveRequestItem[]>([]);
// 加入申请（申请-审批制；docs/permission-tier.spec.md §9）
const joinRequests = ref<JoinRequestItem[]>([]);
const approving = ref<JoinRequestItem | null>(null);
const approveQuery = ref('');
const approveResults = ref<PersonSummary[]>([]);
const approveSearching = ref(false);
const approveSearched = ref(false);
const approveCandidate = ref<PersonSummary | null>(null);
const joinError = ref('');
const approvingSubmitting = ref(false);

const pendingLeaves = computed(() => leaveRequests.value.filter((r) => r.status === 'pending'));
const pendingJoins = computed(() => joinRequests.value.filter((r) => r.status === 'pending'));

function leaveStatusText(s: string): string {
  return s === 'pending' ? '待审批' : s === 'approved' ? '已通过' : '已拒绝';
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

async function loadLeaveRequests() {
  const token = getAuthToken();
  if (!token) return;
  try {
    leaveRequests.value = await fetchLeaveRequests(token);
  } catch (e: any) {
    console.error('加载解绑申请失败:', e.message);
  }
}

async function handleLeave(lr: LeaveRequestItem, approve: boolean) {
  const token = getAuthToken();
  if (!token) return;
  try {
    await approveLeave(token, lr.id, approve);
    uni.showToast({ title: approve ? '已通过解绑' : '已拒绝申请', icon: 'success' });
    await loadLeaveRequests();
  } catch (e: any) {
    error.value = e.message || '审批失败';
  }
}

// ---- 联姻/离异申请审批（docs/marriage.spec.md：目标树审批） ----

const marriageRequests = ref<any[]>([]);
const pendingMarriages = computed(() => marriageRequests.value.filter((r: any) => r.status === 'pending'));

function marriageActionText(r: any): string {
  if (r.action === 'marry') return r.direction === 'in' ? '娶入' : '嫁出';
  return r.kind || '合离';
}

async function loadMarriageRequests() {
  const token = getAuthToken();
  if (!token) return;
  try {
    const res = await fetchMarriageRequests('', token);
    marriageRequests.value = res.list || [];
  } catch (e: any) {
    console.error('加载联姻申请失败:', e.message);
  }
}

/** 通过：目标树审批 → 服务端在同一事务内完成双侧写入 */
async function approveMarriage(r: any) {
  const token = getAuthToken();
  if (!token) return;
  try {
    await decideMarriageRequest(r.to_tree, r._id, true, token);
    uni.showToast({ title: '已通过，双方家族已建立/解除关系', icon: 'success' });
    await loadMarriageRequests();
  } catch (e: any) {
    uni.showModal({ title: '审批失败', content: e.message || '请稍后重试', showCancel: false });
  }
}

async function rejectMarriage(r: any) {
  const token = getAuthToken();
  if (!token) return;
  try {
    await decideMarriageRequest(r.to_tree, r._id, false, token, '管理员驳回');
    uni.showToast({ title: '已驳回', icon: 'none' });
    await loadMarriageRequests();
  } catch (e: any) {
    uni.showModal({ title: '驳回失败', content: e.message || '请稍后重试', showCancel: false });
  }
}

// ---- 加入申请审批（docs/permission-tier.spec.md §9） ----

function joinStatusText(s: string): string {
  return s === 'pending' ? '待审批' : s === 'approved' ? '已通过' : '已拒绝';
}

async function loadJoinRequests() {
  const token = getAuthToken();
  if (!token) return;
  try {
    joinRequests.value = await fetchJoinRequests(token);
  } catch (e: any) {
    console.error('加载加入申请失败:', e.message);
  }
}

/** 打开通过审批（在申请树中检索申请人本人节点） */
function openApprove(jr: JoinRequestItem) {
  approving.value = jr;
  approveQuery.value = '';
  approveResults.value = [];
  approveSearched.value = false;
  approveCandidate.value = null;
  joinError.value = '';
}

async function searchApproveCandidates() {
  if (!approving.value) return;
  const q = approveQuery.value.trim();
  if (!q) return;
  approveSearching.value = true;
  approveSearched.value = true;
  approveCandidate.value = null;
  joinError.value = '';
  try {
    const res = await searchPeople({ query: q, tree_id: approving.value.tree_id });
    approveResults.value = res.people;
  } catch (e: any) {
    joinError.value = e.message || '搜索失败';
    approveResults.value = [];
  } finally {
    approveSearching.value = false;
  }
}

/** 绑定申请人本人节点并批准（handle 必须归属该树，服务端复验） */
async function confirmApprove(jr: JoinRequestItem) {
  const token = getAuthToken();
  if (!token || !approveCandidate.value) return;
  joinError.value = '';
  approvingSubmitting.value = true;
  try {
    await approveJoinRequest(token, jr.id, approveCandidate.value.handle);
    uni.showToast({ title: `已批准 ${jr.self_name || jr.phone} 加入`, icon: 'success' });
    approving.value = null;
    await loadJoinRequests();
  } catch (e: any) {
    joinError.value = e.message || '审批失败';
  } finally {
    approvingSubmitting.value = false;
  }
}

async function rejectJoin(jr: JoinRequestItem) {
  const token = getAuthToken();
  if (!token) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '拒绝加入申请',
      content: `确定拒绝 ${jr.self_name || jr.nickname || jr.phone} 加入 ${jr.tree_id} 吗？`,
      confirmText: '拒绝',
      cancelText: '取消',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    await rejectJoinRequest(token, jr.id);
    uni.showToast({ title: '已拒绝', icon: 'success' });
    await loadJoinRequests();
  } catch (e: any) {
    error.value = e.message || '操作失败';
  }
}

// ---- 资产运维（docs/economy-ops.spec.md §5，仅 chief_editor） ----

type DeltaKey = 'fragments' | 'seeds' | 'bamboos' | 'jades' | 'scrolls' | 'scroll_fragments';

/**
 * 六类资产输入项（docs/economy.spec.md §3 + §15：碎片 / 石榴籽 / 竹片 / 石榴籽玉 / 兰帖 / 兰帖残页）。
 * 顺序 = 后端 `DELTA_KEYS` 顺序 = 表单显示序；量词随品类（碎片类「片」、兰帖「张」）。
 */
const DELTA_FIELDS: Array<{ key: DeltaKey; label: string; unit: string }> = [
  { key: 'fragments', label: '碎片', unit: '片（可负）' },
  { key: 'seeds', label: '石榴籽', unit: '颗（可负）' },
  { key: 'bamboos', label: '竹片', unit: '片（可负）' },
  { key: 'jades', label: '石榴籽玉', unit: '枚（可负）' },
  { key: 'scrolls', label: '兰帖', unit: '张（可负，1 张 = 100 片）' },
  { key: 'scroll_fragments', label: '兰帖残页', unit: '片（可负）' },
];

/** 资产运维区仅 chief_editor 可见（非总编显示提示条，与后端 403「需要总编辑权限」一致） */
const isChief = computed(() => isAuthenticated() && authState.role === 'chief_editor');

const grantPhone = ref('');
const grantDelta = ref<Record<DeltaKey, string>>({
  fragments: '', seeds: '', bamboos: '', jades: '', scrolls: '', scroll_fragments: '',
});
const grantReason = ref('');
const grantEvidence = ref('');
const grantError = ref('');
const granting = ref(false);

const queryPhone = ref('');
const snapshot = ref<AdminAssetSnapshot | null>(null);
const queryError = ref('');
const querying = ref(false);

const opsLogs = ref<OpsLog[]>([]);
const logPhone = ref('');
const logOperator = ref('');
const logsError = ref('');
const logsLoading = ref(false);

const snapshotJades = computed<Jade[]>(() => (snapshot.value ? jadeListOf(snapshot.value) : []));
/** 兰帖批次（后端 §A4 追加出参；旧后端不返 ⇒ 空数组，不抛错） */
const snapshotScrollLots = computed<ScrollLot[]>(() => snapshot.value?.scroll_lots || []);
const snapshotJadeCount = computed(() => (snapshot.value ? jadeCountOf(snapshot.value) : 0));

function setDelta(key: DeltaKey, value: string) {
  grantDelta.value[key] = value;
}

/** 输入串 → delta：空串 = 该项不变；非整数当场拦截（后端仍复验，不代替服务端校验） */
function parseDeltaInput(): AssetDelta {
  const delta: AssetDelta = {};
  for (const f of DELTA_FIELDS) {
    const raw = (grantDelta.value[f.key] || '').trim();
    if (!raw) continue;
    if (!/^-?\d+$/.test(raw)) throw new Error(`${f.label}数量必须为整数`);
    // 兰帖输入按「张」：提交前 ×100 折算成片（**1 张 = 100 片**；线上一律以片计）
    // —— 这是全站**唯一**的张 → 片换算点，其余任何地方都不得再折算
    delta[f.key] = f.key === 'scrolls' ? Number(raw) * SCROLL_PIECES_PER_ITEM : Number(raw);
  }
  return delta;
}

/** 发放 / 扣减（POST /admin/assets/grant）：成功 toast「资产已变更」并回读快照 + 日志 */
async function submitGrant() {
  grantError.value = '';
  const phone = grantPhone.value.trim();
  if (!/^1\d{10}$/.test(phone)) {
    grantError.value = '手机号格式不正确';
    return;
  }
  const reason = grantReason.value.trim();
  if (!reason) {
    grantError.value = '请填写操作原因';
    return;
  }
  let delta: AssetDelta;
  try {
    delta = parseDeltaInput();
  } catch (e: any) {
    grantError.value = e?.message || '资产数量不合法';
    return;
  }
  if (!Object.keys(delta).length) {
    grantError.value = '资产数量不能全为 0';
    return;
  }
  const evidence = grantEvidence.value.trim();
  granting.value = true;
  try {
    await postAdminAssetsGrant({ target_phone: phone, delta, reason, ...(evidence ? { evidence } : {}) });
    uni.showToast({ title: '资产已变更', icon: 'success' });
    grantDelta.value = {
      fragments: '', seeds: '', bamboos: '', jades: '', scrolls: '', scroll_fragments: '',
    };
    grantReason.value = '';
    grantEvidence.value = '';
    await queryUserAssets(phone);
    await loadLogs();
  } catch (e: any) {
    grantError.value = e?.message || '资产变更失败';
  } finally {
    granting.value = false;
  }
}

/** 目标账号资产快照（GET /admin/assets/user；含批次到期） */
async function queryUserAssets(phone = queryPhone.value.trim()) {
  const target = phone.trim();
  queryError.value = '';
  if (!/^1\d{10}$/.test(target)) {
    snapshot.value = null;
    queryError.value = '手机号格式不正确';
    return;
  }
  querying.value = true;
  try {
    snapshot.value = await fetchAdminAssetsUser(target);
    queryPhone.value = target;
  } catch (e: any) {
    snapshot.value = null;
    queryError.value = e?.message || '查询失败';
  } finally {
    querying.value = false;
  }
}

/** 资产变动日志（GET /admin/assets/logs；目标手机号 / 操作人筛选可叠加） */
async function loadLogs() {
  logsError.value = '';
  logsLoading.value = true;
  const phone = logPhone.value.trim();
  const operator = logOperator.value.trim();
  try {
    opsLogs.value = await fetchAdminAssetsLogs({
      ...(phone ? { phone } : {}),
      ...(operator ? { operator } : {}),
      limit: 50,
    });
  } catch (e: any) {
    opsLogs.value = [];
    logsError.value = e?.message || '加载日志失败';
  } finally {
    logsLoading.value = false;
  }
}

/**
 * 单项 delta → 文本（量词随品类）。
 * 兰帖域（`scrolls` / `scroll_fragments`）**走 `business/asset-text.ts` 单点**（与「我的资产」流水页同一函数）：
 * 兰帖线上以**片**计 ⇒ 可整张 `N 张兰帖`、非整百 `M 片兰帖`；残页恒 `N 片兰帖残页`。
 * 本页**不写第二份换算**。
 */
function deltaValueText(f: { key: DeltaKey; label: string }, v: number): string {
  if (f.key === 'scrolls') return scrollDeltaLabel(v, SCROLL_PIECES_PER_ITEM);
  if (f.key === 'scroll_fragments') return scrollFragmentDeltaLabel(v);
  return `${v} ${f.label}`;
}

/** delta → 文本（保留符号；0 项不显示） */
function deltaText(delta: AssetDelta | undefined): string {
  if (!delta) return '';
  const parts: string[] = [];
  for (const f of DELTA_FIELDS) {
    const v = delta[f.key];
    if (typeof v === 'number' && v !== 0) parts.push(`${v > 0 ? '+' : ''}${deltaValueText(f, v)}`);
  }
  return parts.join(' · ') || '—';
}

function isMinusDelta(delta: AssetDelta | undefined): boolean {
  if (!delta) return false;
  return DELTA_FIELDS.some((f) => (delta[f.key] ?? 0) < 0);
}

const ROLE_LABELS: Record<string, string> = {
  guest: '游客',
  user: '普通用户',
  branch_curator: '支系记录官',
  tree_steward: '族谱主理人',
  chief_editor: '总编辑',
};

const roleOptions = [
  { label: '普通用户', value: 'user' },
  { label: '支系记录官', value: 'branch_curator' },
  { label: '族谱主理人', value: 'tree_steward' },
];

const ROLE_LEVEL: Record<string, number> = {
  guest: 0,
  user: 1,
  branch_curator: 2,
  tree_steward: 3,
  chief_editor: 4,
};

const canManage = computed(() => {
  if (!isAuthenticated()) return false;
  return (ROLE_LEVEL[authState.role] ?? 0) >= ROLE_LEVEL.tree_steward;
});

function roleName(role: string): string {
  return ROLE_LABELS[role] || role;
}

function tagTheme(role: string): string {
  switch (role) {
    case 'chief_editor': return 'danger';
    case 'tree_steward': return 'warning';
    case 'branch_curator': return 'primary';
    default: return 'default';
  }
}

function canManageUser(targetRole: string): boolean {
  // 不能管理级别不低于自己的用户
  return (ROLE_LEVEL[authState.role] ?? 0) > (ROLE_LEVEL[targetRole] ?? 0);
}

function setAnchorField(phone: string, field: 'tree' | 'person', value: string) {
  if (!anchorInputs.value[phone]) anchorInputs.value[phone] = { tree: '', person: '' };
  anchorInputs.value[phone][field] = value;
}

async function changeRole(u: ManagedUser, newRole: string) {
  if (!newRole || newRole === u.role) return;
  try {
    await setUserRole(getAuthToken(), u.phone, newRole);
    uni.showToast({ title: `已升级为${roleName(newRole)}`, icon: 'success' });
    await loadUsers();
  } catch (e: any) {
    error.value = e.message || '设置失败';
  }
}

async function saveAnchor(u: ManagedUser) {
  const input = anchorInputs.value[u.phone];
  if (!input?.tree || !input?.person) {
    error.value = '请输入树 ID 和人物 handle';
    return;
  }
  try {
    await setAnchor(getAuthToken(), u.phone, input.tree, input.person);
    uni.showToast({ title: '锚点已设置', icon: 'success' });
  } catch (e: any) {
    error.value = e.message || '设置锚点失败';
  }
}

async function loadUsers() {
  try {
    users.value = await fetchUserList(getAuthToken());
    // 初始化锚点输入
    for (const u of users.value) {
      if (!anchorInputs.value[u.phone]) anchorInputs.value[u.phone] = { tree: '', person: '' };
    }
  } catch (e: any) {
    error.value = e.message || '加载用户失败';
  }
}

onMounted(() => {
  if (canManage.value) {
    loadUsers();
    loadLeaveRequests();
    loadJoinRequests();
    loadMarriageRequests();
  }
  // 资产运维区仅总编加载（其余角色后端 403，前端不发请求）
  if (isChief.value) loadLogs();
});

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}
</script>

<style scoped>
.container { padding: 20px; }
.not-logged { text-align: center; padding: 60px 0; color: #999; }
.btn-login { margin-top: 14px; }
.header-card {
  background: linear-gradient(135deg, #8B4513, #A66B32);
  border-radius: 14px; padding: 20px; color: #fff; margin-bottom: 16px;
}
.header-title { font-size: 20px; font-weight: bold; display: block; }
.header-sub { font-size: 13px; color: #E8D5C0; margin-top: 4px; display: block; }
.section {
  background: #fff; border-radius: 12px; padding: 16px;
  margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.section-title { font-size: 15px; font-weight: bold; color: #3E2723; display: block; margin-bottom: 12px; }
.empty { text-align: center; color: #999; padding: 20px; font-size: 13px; }
.user-item {
  padding: 12px 0; border-bottom: 1px solid #f5f0ea;
}
.user-item:last-child { border-bottom: none; }
.user-info { display: flex; align-items: center; gap: 8px; }
.user-name { font-size: 15px; color: #3E2723; font-weight: 500; }
.user-phone { font-size: 12px; color: #999; }
.user-role { margin-left: 4px; }
.user-actions { margin-top: 8px; }
.anchor-row { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
.anchor-input { flex: 1; }
.leave-item {
  padding: 12px 0; border-bottom: 1px solid #f5f0ea;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.leave-item:last-child { border-bottom: none; }
.leave-info { flex: 1; }
.leave-name { font-size: 14px; color: #3E2723; font-weight: 500; display: block; }
.leave-desc { font-size: 12px; color: #999; display: block; margin-top: 2px; }
.leave-status { margin-top: 6px; }
.leave-actions { display: flex; gap: 8px; flex-shrink: 0; }
.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }

/* 加入申请审批面板 */
.approve-box {
  margin-top: 10px; padding: 12px;
  background: #FBF6EF; border: 1px solid #F0E0C8; border-radius: 10px;
}
.search-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.search-input { flex: 1; }
.approve-tip { text-align: center; color: #999; font-size: 13px; padding: 12px 0; }
.approve-results { max-height: 34vh; overflow-y: auto; margin-top: 8px; }
.approve-result {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1px solid #F0E8DE; border-radius: 8px;
  margin-bottom: 6px;
}
.approve-result.selected { border-color: #8B4513; background: #FFF3E0; }
.approve-result-name { font-size: 14px; color: #3E2723; font-weight: 500; }
.approve-result-id { font-size: 11px; color: #999; margin-left: auto; }
.approve-error { color: #C62828; font-size: 13px; text-align: center; margin: 8px 0; }
.approve-actions { display: flex; gap: 8px; margin-top: 8px; }

/* 资产运维（资产发放 / 用户快照 / 变动日志） */
.field-label { font-size: 13px; color: #3E2723; display: block; margin: 10px 0 4px; }
.field { margin-bottom: 4px; }
.delta-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.delta-cell { flex: 1 1 45%; }
.delta-name { font-size: 12px; color: #999; display: block; margin-bottom: 2px; }
.grant-error { color: #C62828; font-size: 13px; margin: 8px 0; }
.grant-sub { margin-top: 18px; padding-top: 12px; border-top: 1px solid #f5f0ea; }
.query-row { display: flex; gap: 6px; align-items: center; }
.query-input { flex: 1; }
.snap { margin-top: 8px; background: #FBF6EF; border: 1px solid #F0E0C8; border-radius: 10px; padding: 10px; }
.snap-row { display: flex; justify-content: space-between; padding: 4px 0; }
.snap-label { font-size: 13px; color: #999; }
.snap-value { font-size: 13px; color: #3E2723; font-weight: 500; }
.snap-lot { font-size: 11px; color: #B5A594; display: block; margin-top: 2px; }
.log-item { padding: 10px 0; border-bottom: 1px solid #f5f0ea; }
.log-item:last-child { border-bottom: none; }
.log-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.log-target { font-size: 14px; color: #3E2723; font-weight: 500; }
.log-delta { font-size: 13px; color: #2E7D32; font-weight: bold; }
.log-delta.minus { color: #C62828; }
.log-sub { font-size: 11px; color: #B5A594; display: block; margin-top: 2px; }
.log-reason { font-size: 12px; color: #777; display: block; margin-top: 2px; }
</style>
