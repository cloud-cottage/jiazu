<template>
  <view v-if="hasAnyPermission" class="manage-panel">
    <view class="mp-head">
      <text class="mp-title">谱系管理</text>
      <text class="mp-sub">仅影响家族树结构，请谨慎操作</text>
    </view>

    <!-- 操作按钮（按角色/节点上下文显示） -->
    <view class="mp-actions">
      <!-- 中华世本总谱：源流链续编（新建节点 / 挂接已有节点） -->
      <template v-if="isMasterChain">
        <template v-if="canAppendChain">
          <t-button
            size="small"
            variant="outline"
            theme="primary"
            @click="openAddNode('child', 'new')"
          >＋ 续编第 {{ nextGen }} 世</t-button>
          <t-button
            size="small"
            variant="outline"
            theme="primary"
            @click="openAddNode('child', 'pick')"
          >＋ 挂接已有节点为第 {{ nextGen }} 世</t-button>
          <!-- 批量添加子孙：一次按「一条线单传」依次续编最多 10 代（姓随父姓，不可改姓） -->
          <t-button
            size="small"
            variant="outline"
            theme="primary"
            @click="openAddNode('child', 'batch')"
          >＋ 批量添加子孙</t-button>
        </template>
        <text v-else class="mp-hint">{{ chainBlockedHint }}</text>
      </template>

      <!-- 普通家族树：加父/加子/加配偶 + 拆分（始祖挂载「认祖」见 docs/founder-attach.spec.md §6） -->
      <template v-else>
        <t-button
          v-if="canAddNode"
          size="small"
          variant="outline"
          theme="primary"
          @click="openAddNode('parent', 'new')"
        >＋ 添加父节点</t-button>
        <t-button
          v-if="canAddNode"
          size="small"
          variant="outline"
          theme="primary"
          @click="openAddNode('child', 'new')"
        >＋ 添加子节点</t-button>
        <t-button
          v-if="canSplit"
          size="small"
          variant="outline"
          theme="danger"
          :loading="splitting"
          @click="confirmSplit"
        >{{ splitting ? '处理中...' : '⛔ 移除并新建家族树' }}</t-button>
        <!-- 立支（docs/branch-clan-ops.spec.md §6-1 / §9-1）：本树普通节点 N → 新家族树始祖（一次 9999 颗石榴籽） -->
        <t-button
          v-if="canEstablishBranch"
          size="small"
          variant="outline"
          theme="warning"
          :loading="establishing"
          @click="confirmEstablishBranch"
        >{{ establishing ? '处理中...' : '🌱 立支（新家族树）' }}</t-button>
      </template>

      <!-- 加配偶（总谱/普通树通用）：同树配偶；已有家族补空位，已满则新建家族 -->
      <t-button
        v-if="canAddNode"
        size="small"
        variant="outline"
        theme="success"
        @click="openAddNode('spouse', 'new')"
      >＋ 添加配偶</t-button>
    </view>
    <!-- 计费口径提示（docs/economy-fee.spec.md §7 / §3-1 #9–#18）：新增类一律 0 片，避免用户因删改计费而不敢新增 -->
    <text v-if="canAddNode" class="mp-hint">新增类操作（加父 / 加子 / 加配偶 / 挂接已有节点 / 续编 / 批量添加子孙）不消耗竹片</text>
    <text v-if="panelError" class="mp-error">{{ panelError }}</text>

    <!-- 加父/加子/续编/加配偶 内联面板 -->
    <view v-if="showAddNode" class="mp-panel">
      <view class="mp-panel-head">
        <text class="mp-panel-title">{{ panelTitle }}</text>
        <text class="mp-panel-close" @click="closeAddNode">✕</text>
      </view>
      <view class="mp-sub">{{ panelHint }}</view>

      <!-- 新建 / 挂接切换：批量档不渲染（批量内容绝不会走单节点表单提交路径） -->
      <view v-if="addPickMode !== 'batch'" class="mode-switch">
        <view
          class="mode-btn"
          :class="{ active: addPickMode === 'new' }"
          @click="addPickMode = 'new'"
        >新建节点</view>
        <view
          class="mode-btn"
          :class="{ active: addPickMode === 'pick' }"
          @click="addPickMode = 'pick'"
        >{{ isMasterChain || addMode === 'spouse' ? '挂接已有节点' : '从树中选择' }}</view>
      </view>

      <template v-if="addPickMode === 'new'">
        <!-- 姓 + 名：姓默认随父姓（锁定），「改姓」才解锁为特例 -->
        <view class="name-row">
          <t-input
            :value="addSurname"
            :disabled="surnameLocked"
            placeholder="姓"
            class="search-input surname-input"
            @update:value="(v: any) => addSurname = v"
          />
          <t-input
            :value="addName"
            placeholder="名"
            class="search-input"
            @update:value="(v: any) => addName = v"
          />
        </view>
        <view class="surname-hint">
          <text class="sh-text">{{ surnameHintText }}</text>
          <text v-if="showSurnameToggle" class="sh-link" @click="surnameLocked = !surnameLocked">
            {{ surnameLocked ? '改姓' : '恢复随父姓' }}
          </text>
        </view>
        <view class="gender-row">
          <t-radio-group :value="addGender" placement="horizontal" @update:value="(v: any) => addGender = v">
            <t-radio value="M">男</t-radio>
            <t-radio value="F">女</t-radio>
            <t-radio value="U">未知</t-radio>
          </t-radio-group>
        </view>
        <!-- 称号（选填）：封号 → 谥号 → 号（顺序同人物名称显示） -->
        <view class="title-row">
          <t-input
            :value="addFeng"
            placeholder="封号（选填）"
            class="search-input"
            @update:value="(v: any) => addFeng = v"
          />
          <t-input
            :value="addShi"
            placeholder="谥号（选填）"
            class="search-input"
            @update:value="(v: any) => addShi = v"
          />
        </view>
        <view class="title-row">
          <t-input
            :value="addHao"
            placeholder="号（选填）"
            class="search-input"
            @update:value="(v: any) => addHao = v"
          />
        </view>
      </template>
      <template v-else-if="addPickMode === 'pick'">
        <view class="search-row" style="margin-top: 8px;">
          <t-input
            :value="addQuery"
            placeholder="输入姓名搜索"
            class="search-input"
            @update:value="(v: any) => addQuery = v"
            @confirm="doSearchAddNode"
          />
          <t-button size="small" theme="primary" @click="doSearchAddNode">搜索</t-button>
        </view>
        <view v-if="addSearching" class="join-tip">搜索中...</view>
        <view v-else-if="addResults.length" class="attach-results">
          <view
            v-for="r in addResults"
            :key="r.handle"
            class="attach-item"
            :class="{ selected: addSelected?.handle === r.handle }"
            @click="addSelected = r"
          >
            <text class="attach-name">{{ r.name }}</text>
            <text class="attach-id">{{ personIdDisplay(r.gramps_id) }}</text>
          </view>
        </view>
        <view v-else-if="addSearched" class="join-tip">未找到匹配节点</view>
      </template>

      <!-- 批量添加子孙（总谱续编）：粘贴文本 → 实时解析预览 → 确认后按一条线依次续编 -->
      <template v-else>
        <view class="batch-tip">
          请输入一条线单传的后代（每代一人）：只填「名」，用「、」「，」或空格分隔，可带序号（如 1、2、3、）。不要填写分支（同辈多人）。
        </view>
        <!-- 姓：随父姓继承 + 锁定（批量录入不允许改姓，故无任何「改姓」开关/链接） -->
        <view class="name-row">
          <t-input
            :value="batchSurname"
            :disabled="true"
            placeholder="姓"
            class="search-input surname-input"
          />
        </view>
        <view class="surname-hint">
          <text class="sh-text">{{ batchSurnameHint }}</text>
        </view>
        <textarea
          v-model="batchText"
          class="batch-textarea"
          placeholder="例如：1、明远 2、承志 3、守拙（也可用「、」「，」或换行分隔）"
        />
        <view v-if="batchError" class="batch-error">{{ batchError }}</view>
        <view v-else-if="batchNames.length" class="batch-preview">
          <text class="batch-preview-line">{{ batchPreview }}</text>
        </view>
      </template>

      <view class="mp-panel-actions">
        <!-- 批量档独立的提交按钮：不复用单节点表单，避免把批量内容当单节点提交 -->
        <t-button
          v-if="addPickMode === 'batch'"
          theme="primary"
          block
          :loading="batchAdding"
          :disabled="!batchCanSubmit"
          @click="doBatchAdd"
        >确认添加</t-button>
        <t-button
          v-else
          theme="primary"
          block
          :loading="addingNode"
          :disabled="!addCanSubmit"
          @click="doAddNode"
        >确认添加</t-button>
        <t-button variant="outline" block @click="closeAddNode">取消</t-button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  splitTree,
  searchPeople,
  addParentNode,
  addChildNode,
  appendChainNode,
  appendChainBatch,
  addSpouseNode,
  postEstablishBranch,
  fetchAssetsSummary,
  fetchTreeMetaRemote,
} from '@/business/api';
import { isAssetInsufficientError, goMyAssets } from '@/business/asset-guide';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import { personIdDisplay } from '@/business/format';
import {
  BATCH_MAX_GEN,
  buildBatchConfirmContent,
  formatBatchPreview,
  parseBatchNames,
} from '@/business/chain-batch';
import type { PersonSummary } from '@/business/types';

/**
 * 谱系管理操作面板（档案弹窗内的次级操作区）
 * 承载树图管理操作：
 * - 普通家族树：添加父/子节点、添加配偶、移除并新建家族树
 * - 中华世本总谱：源流链续编下一世（新建节点 / 挂接已有节点），需 chainGen 传入当前节点世数
 * 全程内联于所在弹窗，不产生新的整屏弹窗层。
 * 所有操作成功后 emit('tree-changed')，由宿主刷新树图与档案。
 *
 * 注：把祖先链并入总谱并删源的旧入口已按 docs/founder-attach.spec.md §6 移除，
 * 改走始祖挂载的「认祖」（不删源，见 person-archive.vue）。
 */
const props = defineProps<{
  treeId: string;
  /** 当前人物的档案摘要（name/gramps_id 用于展示与确认文案） */
  personName: string;
  /** 当前人物的树内 handle（空 = 虚拟/占位，不可执行树操作） */
  handle: string;
  /** 总谱源流链世数（>=1 = 在链上；0/缺省 = 不在链上，不可续编） */
  chainGen?: number;
  /** 当前节点是链上聚合虚位节点（代表多世，如「伏羲氏诸世」2–44 世） */
  chainAggregate?: boolean;
  /** 当前节点本人的姓（加父时默认随子姓） */
  personSurname?: string;
  /** 当前节点本人性别（加配偶时默认选相反性别） */
  personGender?: 'M' | 'F' | 'U';
  /** 新增子节点的默认姓（随父姓：父方姓优先，父不详取本人姓） */
  childSurnameDefault?: string;
  /** 本树层级（tree-meta.kind；'family' 才可立支，总谱 / 祖谱节点不可立支，§6-1-2） */
  treeKind?: string;
  /** 当前节点是否本树始祖位（始祖节点本身不可立支，§3-5） */
  isFounder?: boolean;
  /** 当前节点是否外树镜像节点（external_mirror='true' / 指向别树的始祖镜像 → 不可立支） */
  isMirror?: boolean;
}>();

const emit = defineEmits<{
  /** 树结构已被修改（加父/加子/加配偶/拆分/续编），宿主刷新 */
  (e: 'tree-changed'): void;
}>();

const panelError = ref('');

// 角色权限：拆分为 chief_editor；加父/加子/加配偶为 tree_steward/chief_editor（总谱仅 chief）
const canAddNode = computed(() => {
  if (!isAuthenticated()) return false;
  const role = authState.role;
  if (role !== 'tree_steward' && role !== 'chief_editor') return false;
  if (props.treeId === 'zhonghua' && role !== 'chief_editor') return false;
  return !!props.handle;
});
const canSplit = computed(
  () => isAuthenticated() && authState.role === 'chief_editor' && props.treeId !== 'zhonghua' && !!props.handle,
);

// ---- 总谱源流链续编（zhonghua）----
const isMasterChain = computed(() => props.treeId === 'zhonghua');
const chainGen = computed(() => props.chainGen);
const nextGen = computed(() => (props.chainGen === undefined ? 0 : props.chainGen + 1));
/** 可续编：总谱 + 有写权限 + 该节点在源流链上（世数 0 = 原始节点也算在链上；非聚合虚位节点） */
const canAppendChain = computed(
  () => canAddNode.value && props.chainGen !== undefined && props.chainGen >= 0 && !props.chainAggregate,
);
const chainBlockedHint = computed(() => {
  if (!canAddNode.value) return '仅总编辑（chief_editor）可续编中华世本';
  if (props.chainAggregate) return '聚合虚位节点代表多世（如「伏羲氏诸世」2–44 世），请在其后继节点上续编';
  return '该节点不在源流链上（无世数），无法续编下一世';
});
const panelTitle = computed(() => {
  if (addPickMode.value === 'batch') return `为「${props.personName}」批量添加子孙`;
  if (isMasterChain.value && addMode.value !== 'spouse') return `为「${props.personName}」续编第 ${nextGen.value} 世`;
  if (addMode.value === 'spouse') return `为「${props.personName}」添加配偶`;
  return `为「${props.personName}」添加${addMode.value === 'parent' ? '父节点' : '子节点'}`;
});
const panelHint = computed(() => {
  if (addPickMode.value === 'batch') {
    return `按「一条线单传」依次续编：第 1 个名字为第 ${nextGen.value} 世，最多 1 次添加 ${BATCH_MAX_GEN} 代；姓随父姓继承，批量录入不可改姓。`;
  }
  if (addMode.value === 'spouse') {
    return '配偶将与本人同属一个家族：本人已有家族则补上空位，家族已满则新建家族（再婚/多配偶）。';
  }
  if (isMasterChain.value) {
    return `新节点将带「第 ${nextGen.value} 世」标记写入源流链，总谱时间轴立即可见；也可把总谱内已有节点挂接为第 ${nextGen.value} 世。`;
  }
  return '新建节点后自动挂接到世系中；也可从树中选择已有节点。';
});

/** 是否有任一管理权限（决定整个操作区是否显示） */
const hasAnyPermission = computed(() => canAddNode.value || canSplit.value);

// ---- 添加父/子/配偶节点 ----
const showAddNode = ref(false);
const addMode = ref<'parent' | 'child' | 'spouse'>('parent');
const addPickMode = ref<'new' | 'pick' | 'batch'>('new');
const addName = ref('');
const addSurname = ref('');
/** 姓默认随（父/子）姓锁定；点「改姓」解锁为特例姓氏 */
const surnameLocked = ref(true);
const addGender = ref<'M' | 'F' | 'U'>('M');
const addHao = ref('');
const addFeng = ref('');
const addShi = ref('');
const addQuery = ref('');
const addResults = ref<PersonSummary[]>([]);
const addSearching = ref(false);
const addSearched = ref(false);
const addSelected = ref<PersonSummary | null>(null);
const addingNode = ref(false);

// ---- 批量添加子孙（总谱续编）状态 ----
/** 粘贴的文本（只填「名」，姓随父姓继承） */
const batchText = ref('');
const batchAdding = ref(false);
/** 批量档展示的姓：预填父姓（来源同单节点表单：childSurnameDefault，父不详取本人姓）并锁定 */
const batchSurname = computed(() => props.childSurnameDefault || props.personSurname || '');
/** 姓提示：批量录入**不允许改姓**，故无「改姓」开关/链接 */
const batchSurnameHint = computed(() =>
  batchSurname.value
    ? `姓随父姓「${batchSurname.value}」继承（批量录入不可改姓）`
    : '姓随父姓继承（批量录入不可改姓；父姓不详时由服务端按父节点继承）',
);
/** 实时解析（纯函数；空文本 → names=[] + error「请粘贴要添加的子孙名字」） */
const batchParsed = computed(() => parseBatchNames(batchText.value, BATCH_MAX_GEN));
const batchNames = computed(() => batchParsed.value.names);
const batchError = computed(() => batchParsed.value.error);
/** 可提交：无解析错误、至少 1 个名字、且没有正在提交 */
const batchCanSubmit = computed(() => !batchError.value && batchNames.value.length > 0 && !batchAdding.value);
/** 预览：「将按顺序添加 N 代：第 49 世 → 甲；第 50 世 → 乙；…」（起始世数 = nextGen） */
const batchPreview = computed(() => formatBatchPreview(batchNames.value, nextGen.value));

/** 姓继承提示文案（父姓不详时提示手填；配偶姓不继承） */
const surnameHint = computed(() => {
  if (addMode.value === 'spouse') return '配偶姓氏与本人可不同，请直接填写';
  if (addMode.value === 'parent') {
    return props.personSurname ? `默认随子姓「${props.personSurname}」` : '子节点姓氏不详，请点「改姓」填写';
  }
  return props.childSurnameDefault ? `默认随父姓「${props.childSurnameDefault}」` : '父姓不详，请点「改姓」填写';
});

/** 姓提示文案（配偶模式无「改姓」概念，恒显示自由填写提示） */
const surnameHintText = computed(() =>
  addMode.value === 'spouse' ? surnameHint.value : surnameLocked.value ? surnameHint.value : '已改为特例姓氏（不再随父姓）',
);
/** 是否显示「改姓/恢复随父姓」开关（配偶模式不需要） */
const showSurnameToggle = computed(() => addMode.value !== 'spouse');

/** 称号等档案属性（仅新建时，非空才提交） */
function titleAttributes(): Array<{ key: string; value: string }> {
  return [
    { key: '号', value: addHao.value.trim() },
    { key: '封号', value: addFeng.value.trim() },
    { key: '谥号', value: addShi.value.trim() },
  ].filter((a) => a.value);
}

function openAddNode(mode: 'parent' | 'child' | 'spouse', pickMode: 'new' | 'pick' | 'batch' = 'new') {
  panelError.value = '';
  addMode.value = mode;
  addPickMode.value = pickMode;
  addName.value = '';
  // 姓：加子随父姓 / 加父随子姓（默认锁定跟随，改姓才解锁）；配偶姓不继承 → 空 + 可编辑
  addSurname.value = (mode === 'parent' ? props.personSurname : mode === 'child' ? props.childSurnameDefault : '') || '';
  surnameLocked.value = mode !== 'spouse';
  // 配偶性别默认选与本人相反（本人男 → 女），减少一次点击
  addGender.value = mode === 'spouse' ? (props.personGender === 'F' ? 'M' : 'F') : 'U';
  addHao.value = '';
  addFeng.value = '';
  addShi.value = '';
  addQuery.value = '';
  addResults.value = [];
  addSearched.value = false;
  addSelected.value = null;
  // 批量档：每次打开都清空粘贴文本与解析结果（不复用上次输入）
  batchText.value = '';
  batchAdding.value = false;
  showAddNode.value = true;
}
function closeAddNode() {
  showAddNode.value = false;
}

const addCanSubmit = computed(() => {
  if (addPickMode.value === 'pick') return !!addSelected.value;
  // 姓（继承值或手填）与名都必填
  return !!addName.value.trim() && !!addSurname.value.trim();
});

async function doSearchAddNode() {
  const q = addQuery.value.trim();
  if (!q) {
    panelError.value = '请输入姓名关键字';
    return;
  }
  addSearching.value = true;
  addSearched.value = true;
  panelError.value = '';
  addSelected.value = null;
  try {
    const res = await searchPeople({ query: q, tree_id: props.treeId });
    addResults.value = res.people;
  } catch (e: any) {
    panelError.value = e.message || '搜索失败';
    addResults.value = [];
  } finally {
    addSearching.value = false;
  }
}

async function doAddNode() {
  // 防御：批量档有独立提交按钮（doBatchAdd），绝不把批量内容当单节点表单提交
  if (addPickMode.value === 'batch') {
    await doBatchAdd();
    return;
  }
  const token = getAuthToken();
  if (!token) {
    panelError.value = '登录已过期，请重新登录';
    return;
  }
  addingNode.value = true;
  panelError.value = '';
  try {
    // 姓：锁定时提交空串 → 服务端按「随父姓」继承；点过「改姓」才提交显式姓
    const surname = surnameLocked.value ? '' : addSurname.value.trim();
    // 添加配偶（同树）：新建或挂接已有节点
    if (addMode.value === 'spouse') {
      const r = await addSpouseNode(
        props.treeId,
        props.handle,
        {
          mode: addPickMode.value === 'pick' ? 'attach' : 'new',
          name: addName.value.trim(),
          surname,
          gender: addGender.value,
          child_handle: addSelected.value?.handle,
          attributes: titleAttributes(),
        },
        token,
      );
      uni.showToast({
        title: r.filled_existing_family ? `配偶已补入现有家族：${r.spouse_name}` : `已添加配偶：${r.spouse_name}`,
        icon: 'none',
      });
      closeAddNode();
      emit('tree-changed');
      return;
    }
    // 总谱源流链续编：世数由服务端按父节点世数 +1 计算并写入链属性
    if (isMasterChain.value) {
      const res = await appendChainNode(
        props.treeId,
        props.handle,
        {
          mode: addPickMode.value === 'pick' ? 'attach' : 'new',
          name: addName.value.trim(),
          surname,
          gender: addGender.value,
          child_handle: addSelected.value?.handle,
          attributes: titleAttributes(),
        },
        token,
      );
      uni.showToast({ title: `已续编第 ${res.gen} 世`, icon: 'success' });
      closeAddNode();
      emit('tree-changed');
      // 注：同世并列分支（res.branch）不再弹「第 N 世已有节点」提示——属确认类信息，非报错，
      // 且时间轴已在卡片上打「分支」tag（产品决策：该弹窗不必要，已移除）。
      return;
    }
    const input =
      addPickMode.value === 'pick'
        ? { handle: addSelected.value?.handle, gender: addSelected.value?.gender || 'U' }
        : { name: addName.value.trim(), surname, gender: addGender.value, attributes: titleAttributes() };
    let toastTitle = addMode.value === 'parent' ? '父节点已添加' : '子节点已添加';
    let toastIcon: 'success' | 'none' = 'success';
    if (addMode.value === 'parent') {
      await addParentNode(props.treeId, props.handle, input, token);
    } else {
      const res = await addChildNode(props.treeId, props.handle, input, token);
      // 跨树婚姻家庭（父/母为外树镜像）：子女真身落到对方树，本地只留镜像子女（marriage.spec §7-4）
      if (res.cross_tree) {
        toastTitle = res.message || `子节点已建到「${res.landed_tree_id}」，本树留镜像`;
        toastIcon = 'none';
      }
    }
    uni.showToast({ title: toastTitle, icon: toastIcon });
    closeAddNode();
    emit('tree-changed');
  } catch (e: any) {
    panelError.value = e.message || '添加失败';
  } finally {
    addingNode.value = false;
  }
}

// ---- 批量添加子孙（总谱续编；契约见 api.ts 的 appendChainBatch）----

/**
 * 批量添加子孙：「确认添加」→ 二次确认弹窗（前 5 项 + 共 N 代 + 第 A–B 世）→ `POST /admin/chain-append-batch`。
 * 只提交「名」序列（姓随父姓继承）；请求中按钮 loading 防重复提交；
 * 成功 toast 优先用后端 message（缺失时回落「已续编第 A–B 世，共 N 代」）。
 */
async function doBatchAdd() {
  const token = getAuthToken();
  if (!token) {
    panelError.value = '登录已过期，请重新登录';
    return;
  }
  const names = batchNames.value;
  if (batchError.value || !names.length) {
    // 解析未通过时不允许发请求（预览区也据此不展示可提交状态）
    panelError.value = batchError.value || '请粘贴要添加的子孙名字';
    return;
  }
  const startGen = nextGen.value;
  const endGen = startGen + names.length - 1;

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '批量添加子孙确认',
      content: buildBatchConfirmContent(names, startGen),
      confirmText: '确认添加',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  batchAdding.value = true;
  panelError.value = '';
  try {
    const res = await appendChainBatch(props.treeId, props.handle, names, token);
    const a = res.start_gen ?? startGen;
    const b = res.end_gen ?? endGen;
    const n = res.count ?? names.length;
    uni.showToast({
      title: res.message || `已续编第 ${a}–${b} 世，共 ${n} 代`,
      icon: 'success',
      duration: 3000,
    });
    closeAddNode();
    emit('tree-changed');
  } catch (e: any) {
    // 失败不静默：文案落面板错误区（资产不足沿用既有弹窗 + 「去我的资产」分支）
    const msg = e?.message || '批量添加失败';
    panelError.value = msg;
    if (isAssetInsufficientError(e)) {
      uni.showModal({
        title: '⚠️ 批量添加失败',
        content: msg,
        confirmText: '去我的资产',
        cancelText: '稍后再说',
        success: (r) => { if (r.confirm) goMyAssets(); },
      });
      return;
    }
    uni.showModal({ title: '批量添加失败', content: msg, showCancel: false });
  } finally {
    batchAdding.value = false;
  }
}

// ---- 移除并新建家族树（拆分） ----
const splitting = ref(false);

async function confirmSplit() {
  const token = getAuthToken();
  if (!token) {
    panelError.value = '登录已过期，请重新登录';
    return;
  }
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '移除并新建家族树',
      content: `以「${props.personName}」为始祖新建一支家族树？\n新树姓氏：${(props.personName || '?')[0]}氏。此操作不可撤销！`,
      confirmText: '确认拆分',
      cancelText: '取消',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  splitting.value = true;
  panelError.value = '';
  try {
    const res = await splitTree(token, {
      tree_id: props.treeId,
      ancestor_handle: props.handle,
      ancestor_name: props.personName,
    });
    uni.showModal({
      title: '拆分成功',
      content: `已创建新家族树「${res.newTreeId}」\n${res.message}`,
      showCancel: false,
      confirmText: '刷新查看',
      success: () => emit('tree-changed'),
    });
  } catch (e: any) {
    panelError.value = e.message || '拆分失败';
  } finally {
    splitting.value = false;
  }
}

// ---- 立支（普通节点 → 新家族树始祖；docs/branch-clan-ops.spec.md §6-1 / §9-1 / §9-2）----

/**
 * 立支单价默认值（颗石榴籽）：真源在后端 `jiazu_wallets.config.branch_fee_seeds`（默认 9999，§5-4），
 * 前端只用于**提交前**确认文案的明示数字；实际扣费以后端响应 `fee.amount` 为准。
 */
const BRANCH_FEE_SEEDS = 9999;

/** 籽不足时的附注清单（§9-2 L3 定稿：签到 / 邀请 / 贡献 / 玉分解返还） */
const HOW_TO_GET_SEEDS = '签到 / 邀请 / 贡献 / 玉分解返还';

const establishing = ref(false);

/**
 * 可立支（§9-1 显示条件）：本树写权（`tree_steward` / `chief_editor`，即 canAddNode）
 * 且树 `kind='family'`（总谱 / 祖谱节点不可立支）且该节点非始祖位、非镜像节点。
 */
const canEstablishBranch = computed(
  () =>
    canAddNode.value &&
    (props.treeKind || 'family') === 'family' &&
    !props.isFounder &&
    !props.isMirror,
);

/** 预读当前石榴籽可用量（L1 的「当前可用【XX】颗」；读失败 → 占位写「以实际扣费为准」，不阻塞） */
async function readSeedBalance(): Promise<number | null> {
  try {
    const summary = await fetchAssetsSummary();
    return summary.seeds_total;
  } catch {
    return null;
  }
}

/**
 * L1 立支确认（**定稿文案逐字使用**，§9-2；` / ` = 换行，【】内为运行时填值）。
 * 一次性写清：原树保留 N 及其全部后代 / 祖先链上移并入宗谱 / 新树以 N 为始祖 / 费用与不可退回。
 */
function establishConfirmText(name: string, balance: number | null): string {
  const balanceText = balance === null ? '以实际扣费为准' : String(balance);
  return [
    '⚠️ 立支确认',
    `本次将把「${name}」立为新家族树的始祖：其上级祖先链将整体上移并入本家族宗谱；原家族树保留「${name}」及其全部后代（始祖改为「${name}」）。`,
    `本次操作将消耗${BRANCH_FEE_SEEDS}颗石榴籽，消耗时优先扣除您账户内即将最先到期的石榴籽，消耗后不可退回（当前可用${balanceText}颗）。`,
    '是否确认立支？',
  ].join('\n');
}

/** 新树展示名：立支出参无该字段（§8-1）→ 用 tree-meta 现查；查不到回落 tree_id */
async function resolveNewTreeTitle(newTreeId: string): Promise<string> {
  try {
    const meta = await fetchTreeMetaRemote();
    const hit = Object.values(meta.trees || {}).find((t: any) => t.tree_id === newTreeId);
    return hit?.display_title || newTreeId;
  } catch {
    return newTreeId;
  }
}

/** 籽不足时的明细行（`ASSET_INSUFFICIENT` 的 need / current / unit / how_to_get **带到 UI**） */
function seedShortageLines(e: unknown): string[] {
  const err = e as { need?: number; current?: number; unit?: string; howToGet?: string[] } | undefined;
  const lines: string[] = [];
  if (err?.need !== undefined || err?.current !== undefined || err?.unit !== undefined) {
    lines.push(
      `本次需 ${err?.need ?? '—'} 颗，当前可用 ${err?.current ?? '—'} 颗${err?.unit ? `（单位：${err.unit}）` : ''}`,
    );
  }
  const provided = err?.howToGet;
  const items = Array.isArray(provided) && provided.length ? provided.join(' / ') : HOW_TO_GET_SEEDS;
  lines.push(`如何获得石榴籽：${items}`);
  return lines;
}

/**
 * 立支：二次强确认（L1）→ 提交 `{ tree_id, person_handle }` → L2 成功 toast（含新树名 / 上移人数 / 余量）。
 * 取消一律**不发请求**（§9-1）；失败 L3「立支失败：【后端 error 原文】」（籽不足附「如何获得石榴籽」）。
 */
async function confirmEstablishBranch() {
  const token = getAuthToken();
  if (!token) {
    panelError.value = '登录已过期，请重新登录';
    return;
  }
  panelError.value = '';
  const name = props.personName || '本节点';
  const balance = await readSeedBalance();
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '⚠️ 立支确认',
      content: establishConfirmText(name, balance),
      confirmText: '确认立支',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  establishing.value = true;
  try {
    const res = await postEstablishBranch(props.treeId, props.handle);
    const newTitle = await resolveNewTreeTitle(res.new_tree_id);
    // L2 立支成功（定稿文案逐字；数字取本次响应）
    uni.showToast({
      title: `立支成功：新家族树「${newTitle}」（${res.new_tree_id}）已建立，共上移${res.moved_ancestors}位祖先、${res.moved_families}个家族，本次消耗 ${res.fee?.amount ?? BRANCH_FEE_SEEDS} 颗石榴籽，余 ${res.fee?.balance_after ?? '—'} 颗`,
      icon: 'none',
      duration: 4000,
    });
    // 树图与档案刷新（原树始祖已改为 N，并多出一棵新树）
    emit('tree-changed');
  } catch (e: any) {
    // L3 立支失败（定稿文案逐字：直出后端 error 原文，不改写、不自造错误码文案）
    const msg = e?.message || '请求失败';
    panelError.value = `立支失败：${msg}`;
    if (isAssetInsufficientError(e)) {
      const lines = [`立支失败：${msg}`, ...seedShortageLines(e)];
      uni.showModal({
        title: '⚠️ 立支失败',
        content: lines.join('\n'),
        confirmText: '去我的资产',
        cancelText: '稍后再说',
        success: (r) => { if (r.confirm) goMyAssets(); },
      });
      return;
    }
    uni.showModal({ title: '立支失败', content: `立支失败：${msg}`, showCancel: false });
  } finally {
    establishing.value = false;
  }
}
</script>

<style scoped>
.manage-panel {
  margin-top: 18px;
  border-top: 1px dashed #E8DCCB;
  padding-top: 12px;
}
.mp-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.mp-title { font-size: 15px; font-weight: bold; color: #3E2723; }
.mp-sub { font-size: 12px; color: #999; flex: 1; }
.mp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mp-error { display: block; text-align: center; color: #C62828; font-size: 13px; margin: 8px 0; }
.mp-hint { font-size: 12px; color: #999; line-height: 1.6; }

.mp-panel {
  margin-top: 12px; padding: 12px;
  background: #FBF8F4; border-radius: 10px;
}
.mp-panel-head { display: flex; align-items: center; justify-content: space-between; }
.mp-panel-title { font-size: 14px; font-weight: bold; color: #3E2723; }
.mp-panel-close {
  width: 28px; height: 28px; line-height: 28px; text-align: center;
  font-size: 15px; color: #999; border-radius: 50%;
}
.mp-panel-close:active { background: #F0E8DE; }
.mp-panel-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }

.mode-switch { display: flex; gap: 8px; margin: 10px 0 4px; }
.mode-btn {
  padding: 6px 14px; border-radius: 8px; font-size: 13px;
  border: 1px solid #F0E8DE; color: #5D4037;
}
.mode-btn.active { border-color: #8B4513; background: #FBF6EF; color: #8B4513; }
.search-row { display: flex; gap: 8px; align-items: center; }
.search-input { flex: 1; }
.name-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.surname-input { max-width: 30%; }
.surname-hint { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.sh-text { font-size: 12px; color: #999; flex: 1; }
.sh-link { font-size: 12px; color: #8B4513; text-decoration: underline; }
.title-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.gender-row { margin-top: 8px; }
.join-tip { text-align: center; color: #999; font-size: 13px; padding: 12px 0; }

/* 批量添加子孙：提示 / 文本域 / 解析预览（沿用原生 textarea，与 hall 页 .textarea 同风格，不引新依赖） */
.batch-tip {
  font-size: 12px; color: #5D4037; line-height: 1.7;
  background: #FBF6EF; border-radius: 8px; padding: 8px 10px; margin-top: 8px;
}
.batch-textarea {
  min-height: 88px; width: 100%; box-sizing: border-box;
  border: 1px solid #E0D5C8; border-radius: 8px;
  padding: 10px 12px; font-size: 14px; background: #FBF8F4;
  margin-top: 8px; color: #3E2723;
}
.batch-error { color: #C62828; font-size: 12px; margin-top: 8px; line-height: 1.6; }
.batch-preview {
  margin-top: 8px; padding: 8px 10px;
  background: #F4F9F4; border: 1px solid #DCEBDC; border-radius: 8px;
}
.batch-preview-line { font-size: 12px; color: #2E5D34; line-height: 1.7; }
</style>
