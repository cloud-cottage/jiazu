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
        </template>
        <text v-else class="mp-hint">{{ chainBlockedHint }}</text>
      </template>

      <!-- 普通家族树：加父/加子/加配偶 + 拆分（晋宗入口已废弃：见 docs/founder-attach.spec.md §6，改走始祖挂载「认祖」） -->
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
    <text v-if="panelError" class="mp-error">{{ panelError }}</text>

    <!-- 加父/加子/续编/加配偶 内联面板 -->
    <view v-if="showAddNode" class="mp-panel">
      <view class="mp-panel-head">
        <text class="mp-panel-title">{{ panelTitle }}</text>
        <text class="mp-panel-close" @click="closeAddNode">✕</text>
      </view>
      <view class="mp-sub">{{ panelHint }}</view>

      <view class="mode-switch">
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
      <template v-else>
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

      <view class="mp-panel-actions">
        <t-button
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
  addSpouseNode,
} from '@/business/api';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import { personIdDisplay } from '@/business/format';
import type { PersonSummary } from '@/business/types';

/**
 * 谱系管理操作面板（档案弹窗内的次级操作区）
 * 承载树图管理操作：
 * - 普通家族树：添加父/子节点、添加配偶、移除并新建家族树
 * - 中华世本总谱：源流链续编下一世（新建节点 / 挂接已有节点），需 chainGen 传入当前节点世数
 * 全程内联于所在弹窗，不产生新的整屏弹窗层。
 * 所有操作成功后 emit('tree-changed')，由宿主刷新树图与档案。
 *
 * 注：「晋宗」（把祖先链并入总谱并删源）入口已按 docs/founder-attach.spec.md §6 废弃，
 * 改为始祖挂载的「认祖」（不删源，见 person-archive.vue）；promoteTree() 后端函数保留给历史数据。
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
  if (isMasterChain.value && addMode.value !== 'spouse') return `为「${props.personName}」续编第 ${nextGen.value} 世`;
  if (addMode.value === 'spouse') return `为「${props.personName}」添加配偶`;
  return `为「${props.personName}」添加${addMode.value === 'parent' ? '父节点' : '子节点'}`;
});
const panelHint = computed(() => {
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
const addPickMode = ref<'new' | 'pick'>('new');
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

function openAddNode(mode: 'parent' | 'child' | 'spouse', pickMode: 'new' | 'pick' = 'new') {
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
      if (res.branch) {
        const names = res.siblings.map((s) => s.name).join('、');
        uni.showModal({
          title: `第 ${res.gen} 世已有节点`,
          content: `同世并列显示为分支：${names}`,
          showCancel: false,
          confirmText: '知道了',
        });
      }
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
</style>
