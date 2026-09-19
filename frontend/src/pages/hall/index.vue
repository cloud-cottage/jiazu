<template>
  <view class="container">
    <!-- 祖谱（kind='clan'）：三段版式（顶端世本镜像链 / 自有世代 / 支系入口列表） -->
    <ClanHall v-if="isClan" :tree-id="treeId" />

    <!-- 普通家族树首页 -->
    <template v-else-if="!isMaster">
      <view class="hero">
        <text class="title">{{ hallInfo?.display_title || '加载中...' }}</text>
        <text class="genealogy" v-if="hallInfo?.genealogy_name">谱名：{{ hallInfo.genealogy_name }}</text>
        <text class="hall-name" v-if="hallInfo?.hall_name && hallInfo.hall_name !== '暂无'">堂号：{{ hallInfo.hall_name }}</text>
        <text class="origin" v-if="hallInfo">发源地：{{ hallInfo.origin }}</text>
        <text class="desc" v-if="hallInfo">{{ hallInfo.description }}</text>

        <!-- 管理员编辑入口 -->
        <view v-if="isAdmin" class="edit-entry" @click="openEdit">
          <text class="edit-btn-text">✏️ 编辑家族信息</text>
        </view>

        <!-- 申请加入本家族（登录且未绑定；已加入者全可见无此入口） -->
        <view v-if="isAuthenticated() && !isMaster && !joined" class="join-entry" @click="openJoin">
          <text class="join-btn-text">🌳 申请加入本家族</text>
        </view>

        <!-- 申请建立祖谱（docs/clan-tree.spec.md §5）：本姓现有树 steward/chief 发起 → 总编审批。
             已绑定祖谱（本树始祖已认祖到某祖谱）的家族隐藏该入口 -->
        <view v-if="canManageTree && !hasClan" class="join-entry" @click="openClanRequest">
          <text class="join-btn-text">📜 申请建立祖谱</text>
        </view>
        <view v-else-if="canManageTree && hasClan" class="clan-bound-hint">
          <text class="clan-bound-text">本家族树已绑定祖谱：始祖已认祖到本姓祖谱，无需再申请建谱。</text>
        </view>

        <!-- 节点级可见分层提示（docs/permission-tier.spec.md）：guest/未加入仅部分世系可见 -->
        <view
          v-if="accessInfo && accessInfo.mode !== 'full'"
          class="access-bar"
          @click="onAccessBarTap"
        >
          <text class="access-text">{{ accessNotice }}</text>
          <text class="access-cta">{{ accessCta }}</text>
        </view>

        <!-- 时流子域入口（docs/spirit-domain.spec.md §8-1）：状态文案与到期日由 GET /spirit 下发；
             已停用态置灰但仍可进入（灌注可重新激活） -->
        <view class="spirit-entry" :class="{ off: spiritOff }" @click="goSpirit">
          <view class="spirit-entry-main">
            <text class="spirit-entry-title">🕰 时流子域</text>
            <text class="spirit-entry-sub">{{ spiritEntrySub }}</text>
          </view>
          <text class="spirit-entry-arrow">›</text>
        </view>
      </view>

      <!-- 树内搜索框 + 左侧视图切换（血脉图示 / 版式文档） -->
      <!-- 树内搜索框（血脉图示 / 版式文档 两个视图共用） -->
      <view class="search-box">
        <t-input
          :value="searchQuery"
          placeholder="搜索本家族人物姓名、字号..."
          class="search-input"
          @update:value="(v: any) => searchQuery = v"
          @confirm="doSearch"
        />
        <t-button size="small" theme="primary" @click="doSearch">搜索</t-button>
      </view>

      <!-- 搜索结果（树内） -->
      <view v-if="searchDone" class="search-panel">
        <view v-if="searching" class="search-tip">搜索中...</view>
        <template v-else>
          <view
            v-for="p in searchResults"
            :key="p.handle"
            class="search-result"
            @click="goSearchResult(p)"
          >
            <text class="result-name">{{ p.name }}</text>
            <text class="result-id">{{ personIdDisplay(p.gramps_id) }}</text>
            <text v-if="p.birth_date" class="result-birth">{{ p.birth_date }}</text>
          </view>
          <view v-if="searchResults.length === 0" class="search-tip">未找到匹配结果</view>
          <text class="search-clear" @click="clearSearch">收起结果</text>
        </template>
      </view>

      <!-- 左侧视图切换（正方形按钮）：血脉图示（默认）/ 版式文档 -->
      <view class="view-toggle">
        <view
          class="view-btn"
          :class="{ active: view === 'pedigree' }"
          @click="view = 'pedigree'"
        >
          <text class="view-text">血脉图示</text>
        </view>
        <view
          class="view-btn"
          :class="{ active: view === 'doc' }"
          @click="view = 'doc'"
        >
          <text class="view-text">版式文档</text>
        </view>
        <!-- 家族消息（审批入口）：仅本树管理权限可见 -->
        <view
          v-if="canManageTree"
          class="view-btn"
          :class="{ active: view === 'msg' }"
          @click="view = 'msg'"
        >
          <text class="view-text">家族消息</text>
        </view>
      </view>

      <!-- 视图内容 -->
      <view v-if="view === 'pedigree'" class="view-body">
        <TreePedigree :tree-id="treeId" :people-total="peopleTotal" />
      </view>

      <!-- 家族消息（审批入口） -->
      <view v-else-if="view === 'msg'" class="view-body">
        <FamilyMessages :tree-id="treeId" />
      </view>

      <view v-else class="view-body">
        <!-- 版式文档（暂以 PDF 导出面板占位） -->
        <DocLayoutPanel :tree-id="treeId" />

        <!-- 文献地址入口（版式文档视图底部） -->
        <view class="archive-section">
          <view class="archive-entry" @click="openArchive">
            <text class="archive-icon">📚</text>
            <text class="archive-title">文献地址</text>
            <text class="archive-value">{{ archiveUrl || '暂未配置' }}</text>
            <text class="archive-arrow">›</text>
          </view>
          <view class="archive-note">
            <text class="note-zh">
              家族树涉及的史料、参考文献等资料归档于网盘，资料管理权限归属本谱系主理人（Tree Steward）。如有增补、修改需求，请联系管理员。
            </text>
            <text class="note-en">
              Relevant historical materials and reference documents are archived in the cloud disk, managed by Tree Steward. Please contact him for additions or revisions.
            </text>
          </view>
          <view class="archive-link" @click="openArchive">
            <text class="link-label">百度网盘：</text>
            <text class="link-value">{{ archiveUrl || '待管理员配置' }}</text>
          </view>
        </view>
      </view>

    <!-- 申请加入弹窗（申请-审批制；docs/permission-tier.spec.md §9） -->
    <view v-if="showJoin" class="modal-mask" @click="showJoin = false">
      <view class="modal" @click.stop>
        <text class="modal-title">申请加入 {{ hallInfo?.display_title || treeId }}</text>
        <text class="modal-sub">在公开谱系中选择一个代表您支系的节点（认领线索，审核人将据此核对您的族亲关系）</text>

        <view class="search-row">
          <t-input
            :value="joinQuery"
            placeholder="搜索公开谱系中您的祖先/亲缘节点"
            class="search-input"
            @update:value="(v: any) => joinQuery = v"
            @confirm="doSearchJoin"
          />
          <t-button size="small" theme="primary" @click="doSearchJoin">搜索</t-button>
        </view>

        <view v-if="joinSearching" class="join-tip">搜索中...</view>
        <view v-else-if="joinResults.length" class="join-results">
          <view
            v-for="r in joinResults"
            :key="r.handle"
            class="join-result"
            :class="{ selected: selectedJoin?.handle === r.handle }"
            @click="selectJoin(r)"
          >
            <text class="result-name">{{ r.name }}</text>
            <text class="result-id">{{ personIdDisplay(r.gramps_id) }}</text>
            <text v-if="r.birth_date" class="result-birth">{{ r.birth_date }}</text>
          </view>
        </view>
        <view v-else-if="joinSearched" class="join-tip">公开谱系中未找到匹配节点，请换一个支系节点试试</view>

        <!-- 支系节点确认 -->
        <view v-if="selectedJoin" class="identity-confirm">
          <text class="identity-text">
            我确认：节点「{{ selectedJoin.name }}」（{{ personIdDisplay(selectedJoin.gramps_id) }}）代表我所属支系，
            将作为认领线索提交族谱主理人审核。
          </text>
        </view>

        <!-- 认领线索（姓名/关系说明至少填一项） -->
        <view class="form-item" style="margin-top: 12px">
          <text class="label">您的姓名（谱名/常用名）</text>
          <input v-model="joinSelfName" class="input" placeholder="如：季明远" />
        </view>
        <view class="form-item">
          <text class="label">与所选节点的关系 / 补充说明</text>
          <textarea
            v-model="joinNote"
            class="textarea"
            placeholder="如：我是季X公第 23 世孙、祖父季X 在谱；可留下联系方式供核实"
          />
        </view>

        <view v-if="joinError" class="edit-error">{{ joinError }}</view>

        <view class="modal-actions">
          <t-button
            theme="primary"
            block
            :loading="joining"
            :disabled="!selectedJoin"
            @click="submitJoinApplication"
          >提交申请</t-button>
          <t-button variant="text" block @click="showJoin = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 建谱申请弹窗：选中华世本始祖节点 → 提交（总编审批后建祖谱树，URL 形如 /z/<tree_id>） -->
    <view v-if="showClanRequest" class="modal-mask" @click="showClanRequest = false">
      <view class="modal" @click.stop>
        <text class="modal-title">申请建立祖谱</text>
        <text class="modal-sub">
          祖谱按姓建立：祖谱始祖是中华世本（总谱）节点的镜像；普通家族树此后认祖到祖谱（不得直挂世本）。提交后待总编辑审批建谱。
        </text>

        <view class="form-item">
          <text class="label">姓氏（单个汉字）</text>
          <input v-model="clanSurname" class="input" placeholder="如：季" />
        </view>
        <view class="form-item">
          <text class="label">谱名（选填）</text>
          <input v-model="clanTitle" class="input" placeholder="如：季氏祖谱" />
        </view>

        <text class="label">选择中华世本中的始祖节点</text>
        <view class="search-row">
          <t-input
            :value="clanMasterQuery"
            placeholder="搜索世本中的始祖节点姓名"
            class="search-input"
            @update:value="(v: any) => clanMasterQuery = v"
            @confirm="doSearchClanMaster"
          />
          <t-button size="small" theme="primary" @click="doSearchClanMaster">搜索</t-button>
        </view>
        <view v-if="clanMasterSearching" class="join-tip">搜索中...</view>
        <view v-else-if="clanMasterResults.length" class="join-results">
          <view
            v-for="r in clanMasterResults"
            :key="r.handle"
            class="join-result"
            :class="{ selected: selectedClanMaster?.handle === r.handle }"
            @click="selectedClanMaster = r"
          >
            <text class="result-name">{{ r.name }}</text>
            <text class="result-id">{{ personIdDisplay(r.gramps_id) }}</text>
          </view>
        </view>
        <view v-else-if="clanMasterSearched" class="join-tip">世本中未找到匹配节点</view>

        <view v-if="selectedClanMaster" class="identity-confirm">
          <text class="identity-text">
            将以中华世本始祖「{{ selectedClanMaster.name }}」（{{ personIdDisplay(selectedClanMaster.gramps_id) }}）
            建立「{{ clanSurname }}氏祖谱」（同姓同世本节点只能建立一支）。
          </text>
        </view>

        <view v-if="clanRequestError" class="edit-error">{{ clanRequestError }}</view>
        <view class="modal-actions">
          <t-button
            theme="primary"
            block
            :loading="clanRequestSubmitting"
            :disabled="!selectedClanMaster"
            @click="doSubmitClanRequest"
          >提交建谱申请</t-button>
          <t-button variant="text" block @click="showClanRequest = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 编辑模态框 -->
    <view v-if="showEdit" class="modal-mask" @click="closeEdit">
      <view class="modal" @click.stop>
        <text class="modal-title">编辑家族信息</text>

        <view class="form-item">
          <text class="label">家族名称</text>
          <input v-model="editForm.display_title" class="input" placeholder="如：季氏费县白露村家族" />
        </view>
        <view class="form-item">
          <text class="label">谱名（家谱/族谱/祖谱名称）</text>
          <input v-model="editForm.genealogy_name" class="input" placeholder="如：季氏家谱" />
        </view>
        <view class="form-item">
          <text class="label">文献地址（线上网盘 uri）</text>
          <input v-model="editForm.archive_url" class="input" placeholder="如：https://pan.baidu.com/s/xxxx" />
        </view>
        <view class="form-item">
          <text class="label">堂号</text>
          <input v-model="editForm.hall_name" class="input" placeholder="如：三让堂" />
        </view>
        <view class="form-item">
          <text class="label">堂号发源地</text>
          <input v-model="editForm.origin" class="input" placeholder="如：江苏苏州洞庭" />
        </view>
        <view class="form-item">
          <text class="label">简介</text>
          <textarea v-model="editForm.description" class="textarea" placeholder="支系简介" />
        </view>

        <view v-if="editError" class="edit-error">
          <text>{{ editError }}</text>
        </view>

        <view class="modal-actions">
          <button class="btn-save" :disabled="saving" @click="saveEdit">
            {{ saving ? '保存中...' : '保存' }}
          </button>
          <text class="btn-cancel" @click="closeEdit">取消</text>
        </view>
      </view>
    </view>
    </template>

    <!-- 中华世本总谱：与首页「中华世本视图」完全一致（同一页面组件） -->
    <ShibenTimeline v-else />

    <!-- 人物完整档案弹窗（树内搜索点结果不再跳独立页面） -->
    <PersonDetailModal ref="archiveModal" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchTreeMetaRemote, updateTreeMeta, fetchTreeRank, searchPeople, submitJoinRequest, fetchMyAnchor, submitClanRequest, fetchPerson, fetchPersonList } from '@/business';
import { fetchSpirit, stateTextPrimary } from '@/business/api';
import type { TreeAccessInfo, SpiritInfo } from '@/business/api';
import { authState, isAuthenticated, getAuthToken } from '@/business/auth';
import type { TreeEntry, PersonSummary } from '@/business/types';
import { personIdDisplay, attrMapOf } from '@/business/format';
import TreePedigree from '@/components/tree-pedigree/tree-pedigree.vue';
import ClanHall from '@/components/clan-hall/clan-hall.vue';
import DocLayoutPanel from '@/components/doc-layout-panel/doc-layout-panel.vue';
import FamilyMessages from '@/components/family-messages/family-messages.vue';
import ShibenTimeline from '@/components/shiben-timeline/shiben-timeline.vue';
import PersonDetailModal from '@/components/person-detail-modal/person-detail-modal.vue';

const treeId = ref('');
const spiritInfo = ref<SpiritInfo | null>(null);
const hallInfo = ref<TreeEntry | null>(null);
// 节点级可见分层（rank 返回 access 元信息；full=全可见无提示）
const accessInfo = ref<TreeAccessInfo | null>(null);
// 家族人数（/tree/rank person_count 新口径）：传给树图统计栏，与首页卡片同口径；0 = 未取到/不适用
const peopleTotal = ref(0);

// 人物完整档案弹窗（树内搜索 / 查看成员 → 弹窗内看档案）
const archiveModal = ref<InstanceType<typeof PersonDetailModal> | null>(null);

const showEdit = ref(false);
const saving = ref(false);
const editError = ref('');
const editForm = ref({ display_title: '', genealogy_name: '', archive_url: '', hall_name: '', origin: '', description: '' });

// 视图切换：血脉图示（默认） / 版式文档 / 家族消息（审批入口，仅管理权限）
const view = ref<'pedigree' | 'doc' | 'msg'>('pedigree');

/**
 * 是否显示「家族消息」入口（审批入口）：
 * chief_editor 全局可见；tree_steward 仅在本树可见（锚点树 == 当前树）。
 */
const canManageTree = ref(false);

// 树内搜索
const searchQuery = ref('');
const searchResults = ref<PersonSummary[]>([]);
const searching = ref(false);
const searchDone = ref(false);

// 申请加入状态
const showJoin = ref(false);
const joinQuery = ref('');
const joinResults = ref<PersonSummary[]>([]);
const joinSearching = ref(false);
const joinSearched = ref(false);
const selectedJoin = ref<PersonSummary | null>(null);
const joining = ref(false);
const joinError = ref('');
const joinSelfName = ref('');
const joinNote = ref('');
/** 当前用户是否已绑定某棵家族树（member；已绑不再显示申请入口） */
const joined = ref(false);

// 文献地址（tree-meta archive_url）
const archiveUrl = computed(() => hallInfo.value?.archive_url || '');

// 总编辑判定：登录用户 role === 'chief_editor'（最高权限）
const isAdmin = computed(() => isAuthenticated() && authState.role === 'chief_editor');

// 中华世本总谱（is_master；tree_id=zhonghua 为兜底，避免首帧闪跳）
const isMaster = computed(() => hallInfo.value?.is_master === true || treeId.value === 'zhonghua');

/** 祖谱（kind='clan'）：走三段版式，不走普通树首页（docs/clan-tree.spec.md §3-5） */
const isClan = computed(() => hallInfo.value?.kind === 'clan');

/**
 * 本树是否已绑定祖谱（已绑定 → 隐藏「📜 申请建立祖谱」入口）：
 * ① tree-meta 条目带 clan_tree_id / clan_handle → 已绑定；
 * ② 本树始祖节点是指向某「祖谱」的镜像（external_link_type='founder' 且 external_tree 对应树 kind='clan'）→ 已绑定。
 * 读不到始祖节点时保守处理：保持入口可见（后端建谱申请会再校验同姓同始祖唯一）。
 */
const hasClan = ref(false);

async function detectClanBound(meta: any) {
  const entry: any = hallInfo.value || {};
  if (entry.clan_tree_id || entry.clan_handle) {
    hasClan.value = true;
    return;
  }
  const kindOf = (tid: string) =>
    (Object.values(meta?.trees || {}) as any[]).find((t) => t?.tree_id === tid)?.kind || '';
  let fh = entry.founder_handle || '';
  if (!fh && entry.founder_gramps_id) {
    // 只登记了编号 → 在树内按编号找始祖节点
    const list: any = await fetchPersonList(treeId.value, 0, 0).catch(() => ({ data: [] }));
    fh = (list.data || []).find((p: any) => p.gramps_id === entry.founder_gramps_id)?.handle || '';
  }
  if (!fh) return;
  try {
    const p: any = await fetchPerson(treeId.value, fh);
    const attrs = attrMapOf(p?.attributes);
    const upper = attrs['external_tree'] || '';
    if (attrs['external_link_type'] === 'founder' && upper && kindOf(upper) === 'clan') {
      hasClan.value = true;
    }
  } catch {
    /* 读不到始祖节点 → 保守：保持入口可见（后端会再校验） */
  }
}

// ---- 节点级可见分层提示（docs/permission-tier.spec.md §6） ----

/** 提示文案（guest/已登录未加入；member 与总谱 mode=full 不显示） */
const accessNotice = computed(() => {
  const a = accessInfo.value;
  if (!a || a.mode === 'full' || isMaster.value) return '';
  const scope =
    a.mode === 'floor'
      ? '本谱对访客仅公开展示始祖世系'
      : `本谱当前公开至第 ${a.visible_max_depth} 世`;
  return a.login_required ? `${scope}，完整世系仅家族成员可见` : `${scope}，加入本家族后可见完整世系`;
});

/** CTA 文案（点击行为见 onAccessBarTap） */
const accessCta = computed(() => {
  const a = accessInfo.value;
  if (!a || isMaster.value) return '';
  if (a.member) return '';
  return a.login_required ? '去登录' : '加入家族';
});

/** 点击提示条：guest → 登录页；已登录未加入 → 加入流程 */
function onAccessBarTap() {
  const a = accessInfo.value;
  if (!a || a.member || isMaster.value) return;
  if (a.login_required) {
    uni.navigateTo({ url: '/pages/login/index' });
  } else {
    openJoin();
  }
}

/** 打开申请加入弹窗 */
function openJoin() {
  joinError.value = '';
  joinQuery.value = '';
  joinResults.value = [];
  joinSearched.value = false;
  selectedJoin.value = null;
  joinSelfName.value = '';
  joinNote.value = '';
  showJoin.value = true;
}

/** 搜索当前树公开谱系内的节点（作为支系认领线索） */
async function doSearchJoin() {
  const q = joinQuery.value.trim();
  if (!q) {
    joinError.value = '请输入姓名关键字';
    return;
  }
  joinSearching.value = true;
  joinSearched.value = true;
  joinError.value = '';
  selectedJoin.value = null;
  try {
    const res = await searchPeople({ query: q, tree_id: treeId.value });
    joinResults.value = res.people;
  } catch (e: any) {
    joinError.value = e.message || '搜索失败';
    joinResults.value = [];
  } finally {
    joinSearching.value = false;
  }
}

function selectJoin(p: PersonSummary) {
  selectedJoin.value = p;
}

/** 提交加入申请（选公开谱系支系节点 + 姓名/关系线索 → 族谱主理人审核绑定） */
async function submitJoinApplication() {
  if (!selectedJoin.value) return;
  if (!joinSelfName.value.trim() && !joinNote.value.trim()) {
    joinError.value = '请填写您的姓名或补充说明（认领线索）';
    return;
  }
  const token = getAuthToken();
  if (!token) {
    joinError.value = '登录已过期，请重新登录';
    return;
  }
  joining.value = true;
  joinError.value = '';
  try {
    await submitJoinRequest(token, {
      tree_id: treeId.value,
      reference_handle: selectedJoin.value.handle,
      self_name: joinSelfName.value.trim(),
      note: joinNote.value.trim(),
    });
    showJoin.value = false;
    uni.showModal({
      title: '申请已提交',
      content: '族谱主理人将核对您的族亲关系并完成绑定，请耐心等待。',
      showCancel: false,
      confirmText: '知道了',
    });
  } catch (e: any) {
    joinError.value = e.message || '提交申请失败';
  } finally {
    joining.value = false;
  }
}

// ---- 建谱申请（docs/clan-tree.spec.md §5）：本姓现有树 steward/chief 发起 → chief_editor 审批 ----
const showClanRequest = ref(false);
const clanSurname = ref('');
const clanTitle = ref('');
const clanMasterQuery = ref('');
const clanMasterResults = ref<PersonSummary[]>([]);
const clanMasterSearching = ref(false);
const clanMasterSearched = ref(false);
const selectedClanMaster = ref<PersonSummary | null>(null);
const clanRequestSubmitting = ref(false);
const clanRequestError = ref('');

/** 打开建谱申请弹窗（姓氏默认取本树 tree-meta 的姓） */
function openClanRequest() {
  clanRequestError.value = '';
  clanSurname.value = hallInfo.value?.surname_char || hallInfo.value?.surname || '';
  clanTitle.value = '';
  clanMasterQuery.value = '';
  clanMasterResults.value = [];
  clanMasterSearched.value = false;
  selectedClanMaster.value = null;
  showClanRequest.value = true;
}

/** 在中华世本中搜索始祖节点（祖谱始祖 = 世本节点镜像） */
async function doSearchClanMaster() {
  const q = clanMasterQuery.value.trim();
  if (!q) {
    clanRequestError.value = '请输入姓名关键字';
    return;
  }
  clanMasterSearching.value = true;
  clanMasterSearched.value = true;
  clanRequestError.value = '';
  selectedClanMaster.value = null;
  try {
    const res = await searchPeople({ query: q, tree_id: 'zhonghua' });
    clanMasterResults.value = res.people;
  } catch (e: any) {
    clanRequestError.value = e?.message || '搜索失败';
    clanMasterResults.value = [];
  } finally {
    clanMasterSearching.value = false;
  }
}

/** 提交建谱申请（写 pending；总编审批通过后建祖谱树，URL 为 /z/<tree_id>） */
async function doSubmitClanRequest() {
  const token = getAuthToken();
  if (!token) {
    clanRequestError.value = '登录已过期，请重新登录';
    return;
  }
  if (!selectedClanMaster.value) return;
  clanRequestSubmitting.value = true;
  clanRequestError.value = '';
  try {
    const res = await submitClanRequest(
      {
        tree_id: treeId.value,
        surname: clanSurname.value.trim(),
        master_handle: selectedClanMaster.value.handle,
        clan_title: clanTitle.value.trim(),
      },
      token,
    );
    showClanRequest.value = false;
    uni.showModal({
      title: '建谱申请已提交',
      content: res?.message || '等待总编辑审批后建谱。',
      showCancel: false,
      confirmText: '知道了',
    });
  } catch (e: any) {
    clanRequestError.value = e?.message || '提交建谱申请失败';
  } finally {
    clanRequestSubmitting.value = false;
  }
}

/** 树内搜索（仅本家族树） */
async function doSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  searching.value = true;
  searchDone.value = true;
  try {
    const res = await searchPeople({ query: q, tree_id: treeId.value });
    searchResults.value = res.people;
  } catch (e: any) {
    uni.showToast({ title: (e as any).message || '搜索失败', icon: 'none' });
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
}

function clearSearch() {
  searchDone.value = false;
  searchResults.value = [];
  searchQuery.value = '';
}

function goSearchResult(p: PersonSummary) {
  // 口径 A：搜索结果里的镜像节点（external_mirror='true' + 真身指针齐备）→ 打开真身档案
  archiveModal.value?.open(treeId.value, p.handle, p);
}

/** 打开文献地址（线上网盘） */
function openArchive() {
  const url = archiveUrl.value;
  if (!url) {
    uni.showToast({ title: '文献地址暂未配置', icon: 'none' });
    return;
  }
  // #ifdef H5
  window.open(url);
  // #endif
}

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

onMounted(async () => {
  if (!treeId.value) return;

  // 「家族消息」入口可见性：chief_editor 全局；tree_steward 仅本树（锚点树 == 当前树）
  if (isAuthenticated()) {
    if (authState.role === 'chief_editor') {
      canManageTree.value = true;
    } else {
      try {
        const anchor = await fetchMyAnchor(getAuthToken());
        canManageTree.value = !!anchor && anchor.tree_id === treeId.value;
      } catch {
        canManageTree.value = false;
      }
    }
  }

  try {
    const meta = await fetchTreeMetaRemote();
    for (const [, entry] of Object.entries(meta.trees)) {
      if (entry.tree_id === treeId.value) {
        hallInfo.value = entry;
        break;
      }
    }
    // 导航栏标题 = 家族名称
    if (hallInfo.value?.display_title) {
      uni.setNavigationBarTitle({ title: hallInfo.value.display_title });
    }
    // 已绑定祖谱判定（普通树才需要：总谱/祖谱页面不出现建谱入口）
    if (!isMaster.value && !isClan.value) {
      await detectClanBound(meta);
    }
  } catch (e) {
    console.error('加载数字馆信息失败:', e);
  }

  // 时流子域入口状态（guest 亦可读摘要；失败只降级文案，不影响首页渲染）
  if (!isMaster.value) {
    try {
      spiritInfo.value = await fetchSpirit(treeId.value);
    } catch {
      spiritInfo.value = null;
    }
  }

  // 节点级可见分层 access（普通树才需要；总谱 full 无提示）
  if (!isMaster.value && !isClan.value) {
    try {
      const rank = await fetchTreeRank(treeId.value);
      accessInfo.value = rank.access || null;
      peopleTotal.value = typeof rank.person_count === 'number' && !Number.isNaN(rank.person_count) ? rank.person_count : 0;
    } catch (e) {
      console.error('加载谱系可见范围失败:', e);
    }
  }

  // 绑定状态：member（已加入）隐藏「申请加入」入口
  const tk = getAuthToken();
  if (tk && !isMaster.value) {
    try {
      const anchor = await fetchMyAnchor(tk);
      joined.value = !!anchor;
    } catch {
      joined.value = false;
    }
  }
});

/** 时流子域入口文案：未镶嵌「未开启 · 镶嵌石榴籽玉解锁」；已镶嵌状态**主**文案（state_text.primary）+ 到期日；停用置灰 */
const spiritOff = computed(() => spiritInfo.value?.status === 'expired');
const spiritEntrySub = computed(() => {
  const s = spiritInfo.value;
  if (!s) return '家族专属空间 · 灵气蓄能';
  if (!s.mounted) return '未开启 · 镶嵌石榴籽玉解锁';
  if (s.status === 'expired') return '已停用，灌注可重新激活';
  const exp = (s.spirit_expires_at || '').slice(0, 10);
  // 入口条只取主文案（对象出参直接拼接会显示 [object Object]）
  const main =
    stateTextPrimary(s.state_text) ||
    (s.status === 'active' ? '灵气充盈' : s.status === 'buffer' ? '灵气已尽' : '未激活');
  return exp ? `${main} · 到期 ${exp}` : main;
});

/** 进入时流子域页（带当前 tree_id） */
function goSpirit() {
  if (!treeId.value) {
    uni.showToast({ title: '缺少家族树参数', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: `/pages/spirit/index?tree_id=${treeId.value}` });
}

function openEdit() {
  if (!hallInfo.value) return;
  editForm.value = {
    display_title: hallInfo.value.display_title || '',
    genealogy_name: hallInfo.value.genealogy_name || '',
    archive_url: hallInfo.value.archive_url || '',
    hall_name: hallInfo.value.hall_name || '',
    origin: hallInfo.value.origin || '',
    description: hallInfo.value.description || '',
  };
  editError.value = '';
  showEdit.value = true;
}

function closeEdit() {
  showEdit.value = false;
}

async function saveEdit() {
  saving.value = true;
  editError.value = '';
  try {
    const token = getAuthToken();
    if (!token) {
      editError.value = '登录已过期，请重新登录';
      return;
    }
    await updateTreeMeta(token, {
      tree_id: treeId.value,
      ...editForm.value,
    });
    uni.showToast({ title: '保存成功', icon: 'success' });
    showEdit.value = false;
    // 刷新展示
    const meta = await fetchTreeMetaRemote();
    for (const [, entry] of Object.entries(meta.trees)) {
      if (entry.tree_id === treeId.value) {
        hallInfo.value = entry;
        break;
      }
    }
  } catch (e: any) {
    editError.value = e.message || '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.container { padding: 20px; padding-bottom: 40px; }
.hero { text-align: center; margin-bottom: 14px; }
.title { font-size: 22px; font-weight: bold; color: #3E2723; display: block; }
.genealogy { font-size: 15px; color: #8B4513; font-weight: bold; margin-top: 10px; display: block; }
.hall-name { font-size: 14px; color: #8B4513; margin-top: 6px; display: block; }
.origin { font-size: 14px; color: #888; margin-top: 6px; display: block; }
.desc { font-size: 14px; color: #555; margin-top: 8px; line-height: 1.6; display: block; }
.edit-entry {
  display: inline-block; margin-top: 14px; padding: 8px 18px;
  background: #FFF3E0; border: 1px solid #E8C9A0; border-radius: 18px;
}
.edit-btn-text { font-size: 13px; color: #8B4513; }
.join-entry {
  display: inline-block; margin-top: 10px; padding: 8px 18px;
  background: #8B4513; border-radius: 18px;
}
.join-btn-text { font-size: 13px; color: #fff; }

/* 节点级可见分层提示条 */
.access-bar {
  margin-top: 12px; padding: 10px 12px;
  background: #FFF8E1; border: 1px solid #F0D9A8; border-radius: 8px;
  display: flex; align-items: center; gap: 8px;
}
.access-text { flex: 1; font-size: 12px; color: #5D4037; line-height: 1.6; }
.access-cta {
  flex-shrink: 0; font-size: 12px; color: #8B4513; font-weight: bold;
  padding: 4px 10px; border: 1px solid #D7B27A; border-radius: 12px;
}

/* 已绑定祖谱提示（替代建谱入口） */
.clan-bound-hint {
  display: inline-block; margin-top: 10px; padding: 6px 14px;
  background: #FBF6EF; border: 1px dashed #D7B27A; border-radius: 16px;
}
.clan-bound-text { font-size: 12px; color: #8B4513; }

/* 树内搜索框 */
.search-box { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
.search-input { flex: 1; }
.search-panel {
  background: #fff; border: 1px solid #F0E8DE; border-radius: 10px;
  padding: 6px 12px; margin-bottom: 10px;
}
.search-result {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 4px; border-bottom: 1px solid #F5F0EA;
}
.search-result:last-of-type { border-bottom: none; }
.result-name { font-size: 14px; color: #3E2723; font-weight: 500; }
.result-id { font-size: 11px; color: #999; }
.result-birth { font-size: 11px; color: #B5A594; margin-left: auto; }
.search-tip { text-align: center; color: #999; font-size: 13px; padding: 12px 0; }
.search-clear { display: block; text-align: center; color: #8B4513; font-size: 12px; padding: 6px 0; }

/* 左侧视图切换（正方形按钮，固定悬浮） */
.view-toggle {
  position: fixed;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 950;
}
.view-btn {
  width: 56px;
  height: 56px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}
.view-text { font-size: 11px; color: #8B4513; line-height: 1.3; text-align: center; }
.view-btn.active { background: #8B4513; border-color: #8B4513; }
.view-btn.active .view-text { color: #fff; }

/* 视图内容留出左右图标空间 */
.view-body { margin: 0 0 0 8px; }

/* 文献地址入口（版式文档视图底部） */
.archive-section {
  margin-top: 28px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F0E8DE;
}
.archive-entry {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 4px;
}
.archive-icon { font-size: 18px; }
.archive-title { font-size: 15px; font-weight: bold; color: #3E2723; }
.archive-value {
  flex: 1; font-size: 12px; color: #8B4513;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.archive-arrow { font-size: 16px; color: #B5A594; }
.archive-note {
  padding: 10px 12px; background: #FFF8E1; border-radius: 8px;
}
.note-zh { font-size: 12px; color: #5D4037; line-height: 1.7; display: block; }
.note-en { font-size: 11px; color: #A1887F; line-height: 1.6; display: block; margin-top: 6px; }
.archive-link {
  margin-top: 10px; display: flex; align-items: center; gap: 6px;
  padding: 10px 12px; background: #FBF6EF; border-radius: 8px;
}
.link-label { font-size: 13px; color: #8B4513; font-weight: bold; flex-shrink: 0; }
.link-value {
  flex: 1; font-size: 12px; color: #2C5F8A;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 时流子域入口 */
.spirit-entry {
  margin-top: 12px; padding: 12px 14px; background: #FBF6EF;
  border-radius: 10px; display: flex; align-items: center; gap: 10px;
  text-align: left;
}
.spirit-entry.off { background: #F2F2F2; opacity: 0.75; }
.spirit-entry-main { flex: 1; }
.spirit-entry-title { font-size: 14px; font-weight: bold; color: #8B4513; display: block; }
.spirit-entry-sub { font-size: 12px; color: #B5A594; display: block; margin-top: 2px; }
.spirit-entry-arrow { font-size: 18px; color: #B5A594; }

/* 编辑模态框 */
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 86%; max-width: 380px; background: #fff; border-radius: 14px;
  padding: 24px 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
  max-height: 85vh; overflow-y: auto;
}
.modal-title { font-size: 18px; font-weight: bold; color: #3E2723; display: block; text-align: center; margin-bottom: 18px; }
.form-item { margin-bottom: 14px; }
.label { font-size: 13px; color: #8B4513; font-weight: bold; display: block; margin-bottom: 6px; }
.input {
  height: 42px; border: 1px solid #E0D5C8; border-radius: 8px;
  padding: 0 12px; font-size: 14px; background: #FBF8F4; width: 100%;
}
.textarea {
  min-height: 80px; border: 1px solid #E0D5C8; border-radius: 8px;
  padding: 10px 12px; font-size: 14px; background: #FBF8F4; width: 100%;
}
.edit-error { color: #C62828; font-size: 13px; text-align: center; margin-bottom: 10px; }
.modal-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.btn-save {
  height: 42px; line-height: 42px; background: #8B4513; color: #fff;
  font-size: 15px; border-radius: 8px;
}
.btn-save[disabled] { opacity: 0.6; }
.btn-cancel { text-align: center; color: #999; font-size: 14px; padding: 4px 0; }

/* 加入流程 */
.modal-sub { font-size: 12px; color: #999; display: block; text-align: center; margin: 6px 0 14px; }
.search-row { display: flex; gap: 8px; align-items: center; }
.join-tip { text-align: center; color: #999; font-size: 13px; padding: 16px 0; }
.join-results { max-height: 40vh; overflow-y: auto; margin-top: 10px; }
.join-result {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1px solid #F0E8DE; border-radius: 8px;
  margin-bottom: 8px;
}
.join-result.selected { border-color: #8B4513; background: #FBF6EF; }
.identity-confirm {
  margin-top: 12px; padding: 12px; background: #FFF8E1; border-radius: 8px;
}
.identity-text { font-size: 13px; color: #5D4037; line-height: 1.6; }
</style>
