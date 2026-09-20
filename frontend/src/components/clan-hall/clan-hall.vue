<template>
  <view class="clan-hall">
    <view class="clan-hero">
      <text class="clan-title">{{ info?.title || treeId }}</text>
      <view class="clan-meta">
        <t-tag theme="primary" variant="light" size="small">祖谱</t-tag>
        <text v-if="info?.surname" class="clan-surname">{{ info.surname }}氏</text>
        <text v-if="info?.genealogy_name" class="clan-genealogy">谱名：{{ info.genealogy_name }}</text>
      </view>
      <text v-if="info?.notice" class="clan-notice">⚠️ {{ info.notice }}</text>
      <!-- 编辑祖谱信息（复用普通树的编辑表单 + PUT /tree-meta；该接口限总编辑） -->
      <view v-if="isAdmin" class="clan-edit-entry" @click="openEdit">
        <text class="clan-edit-text">✏️ 编辑祖谱信息</text>
      </view>
    </view>

    <view v-if="loading" class="clan-loading">
      <t-loading theme="spinner" text="加载祖谱..." />
    </view>
    <view v-else-if="error" class="clan-error">
      <text>{{ error }}</text>
      <t-button size="small" variant="outline" @click="load">重试</t-button>
    </view>

    <template v-else>
      <!-- 左侧功能按钮（与普通家族树首页对齐）：血脉图示 / 版式文档（占位）/ 祖谱消息（管理权限） -->
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
          <text class="view-text">祖谱消息</text>
        </view>
      </view>

      <view v-if="view === 'pedigree'">
      <!-- ① 顶端：世系链（世本镜像段 · 只读）——真身在中华世本，本层只读 -->
      <view class="segment">
        <view class="seg-head">
          <text class="seg-title">世系链（世本镜像段 · 只读）</text>
          <text class="seg-count">{{ mirrors.length }} 节点</text>
        </view>
        <text class="seg-hint">
          镜像自中华世本（总谱），以真身为准；本层内不可修改，要改请到真身所在层。
        </text>
        <view v-if="!mirrors.length" class="seg-empty">
          该祖谱未认祖世本：请在本祖谱始祖节点发起「认祖（挂到中华世本）」。
        </view>
        <view v-else class="mirror-list">
          <view
            v-for="m in mirrors"
            :key="m.handle"
            class="mirror-row"
            @click="openUpperPerson(m)"
          >
            <view class="mirror-gutter">
              <view class="mirror-dot" :class="{ hl: m.link_type === 'founder' }" />
              <view class="mirror-line" />
            </view>
            <view class="mirror-card">
              <view class="mirror-head">
                <text class="mirror-name">{{ m.name }}</text>
                <t-tag theme="primary" variant="light" size="small">
                  {{ m.link_type === 'founder' ? '祖谱始祖' : '世系链' }}
                </t-tag>
                <t-tag theme="default" variant="light" size="small">只读</t-tag>
              </view>
              <text class="mirror-sub">{{ m.relation_note || `镜像自 ${m.upper_tree_id}` }}</text>
              <text class="mirror-sub">编号：{{ personIdDisplay(m.gramps_id) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ② 中部：本宗自有世代（真实数据，可编辑/续编；图示含顶端镜像段） -->
      <view class="segment">
        <view class="seg-head">
          <text class="seg-title">本宗自有世代</text>
          <text class="seg-count">自有 {{ ownCount }} 人 · 镜像 {{ mirrors.length }} · 合计 {{ totalCount }}</text>
        </view>
        <text class="seg-hint">
          自有世代是本宗真实数据（可编辑、可续编、可被普通家族树认祖）；祖谱人数不计入世本统计。
        </text>
        <view v-if="info?.founder_handle" class="seg-actions">
          <t-button size="small" variant="outline" theme="primary" @click="openOwnFounder">
            📄 本宗支系入口节点档案
          </t-button>
        </view>
        <!-- tree-manage：本段节点档案内启用「谱系管理」（加父 / 加子 / 加配偶 / 批量添加子孙）；
             @tree-changed：谱系结构变动后刷新本祖谱信息（自有/镜像人数等） -->
        <TreePedigree
          :tree-id="treeId"
          default-layout="vertical"
          tree-manage
          @tree-changed="load"
        />
      </view>

      <!-- ③ 底部：支系入口列表（认本祖谱为祖的普通家族树） -->
      <view class="segment">
        <view class="seg-head">
          <text class="seg-title">支系入口列表</text>
          <text class="seg-count">{{ branches.length }} 支</text>
        </view>
        <text class="seg-hint">认本祖谱为祖的普通家族树；各支人数不计入本祖谱。</text>
        <view v-if="!branches.length" class="seg-empty">暂无家族树认本祖谱为祖。</view>
        <view
          v-for="b in branches"
          :key="b.tree_id"
          class="branch-row"
          @click="goBranch(b)"
        >
          <view class="branch-body">
            <text class="branch-name">{{ b.tree_title }}</text>
            <text class="branch-sub">
              {{ b.tree_id }} · {{ b.person_count }} 人<template v-if="b.founder_name"> · 始祖 {{ b.founder_name }}</template>
            </text>
          </view>
          <text class="branch-arrow">›</text>
        </view>
      </view>
      </view>

      <!-- 版式文档（占位：祖谱版式文档尚未开放） -->
      <view v-else-if="view === 'doc'" class="doc-placeholder">
        <text class="doc-ph-title">版式文档</text>
        <text class="doc-ph-text">祖谱版式文档（印刷版式 / 排版导出）尚未开放，敬请期待。</text>
      </view>

      <!-- 祖谱消息（审批入口）：复用 family-messages，文案按层级 = 「祖谱消息」 -->
      <view v-else class="clan-msg-body">
        <FamilyMessages :tree-id="treeId" level="clan" />
      </view>
    </template>

    <!-- 编辑祖谱信息弹窗（字段与普通家族树首页一致；PUT /tree-meta） -->
    <view v-if="showEdit" class="modal-mask" @click="showEdit = false">
      <view class="modal" @click.stop>
        <text class="modal-title">编辑祖谱信息</text>
        <view class="form-item">
          <text class="label">祖谱名称</text>
          <input v-model="editForm.display_title" class="input" placeholder="如：季氏祖谱" />
        </view>
        <view class="form-item">
          <text class="label">谱名（祖谱/族谱名称）</text>
          <input v-model="editForm.genealogy_name" class="input" placeholder="如：季氏祖谱" />
        </view>
        <view class="form-item">
          <text class="label">文献地址（线上网盘 uri）</text>
          <input v-model="editForm.archive_url" class="input" placeholder="如：https://pan.baidu.com/s/xxxx" />
        </view>
        <view class="form-item">
          <text class="label">祠堂名（堂号 / 宗祠）</text>
          <input v-model="editForm.hall_name" class="input" placeholder="如：季氏宗祠" />
        </view>
        <view class="form-item">
          <text class="label">发源地</text>
          <!-- 契约 v2 C8′：发源地 = 由本树始祖三代内**某节点的出生地**人工指定（不再直接选行政区划） -->
          <OriginPicker :tree-id="treeId" @updated="onOriginUpdated" />
        </view>
        <view class="form-item">
          <text class="label">简介</text>
          <textarea v-model="editForm.description" class="textarea" placeholder="祖谱简介" />
        </view>
        <view v-if="editError" class="edit-error">{{ editError }}</view>
        <view class="modal-actions">
          <t-button theme="primary" block :loading="saving" @click="saveEdit">保存</t-button>
          <t-button variant="text" block @click="showEdit = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 人物档案（镜像节点 → 打开真身档案；自有节点 → 常规档案） -->
    <PersonDetailModal ref="archiveModal" />
  </view>
</template>

<script setup lang="ts">
/**
 * 祖谱首页（docs/clan-tree.spec.md §3-5 / §7 P4）：三段版式
 *   ① 顶端「世系链（世本镜像段 · 只读）」—— link_type='founder'/'chain'，真身在中华世本
 *   ② 中部「本宗自有世代」—— 真实数据，可编辑/续编（树图复用 TreePedigree）
 *   ③ 底部「支系入口列表」—— 认本祖谱为祖的普通家族树，可点进
 * 路由：/z/<tree_id>（App.vue 解析）；数据：GET /admin/clan-info
 * 统计口径：祖谱人数不计入世本；普通树人数不计入祖谱。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { fetchClanInfo, openTreeHome, updateTreeMeta, fetchTreeMetaRemote, fetchMyAnchor, fetchPerson } from '@/business';
import type { ClanInfo, ClanMirrorNode } from '@/business/api';
import type { TreeEntry, SetTreeOriginResult } from '@/business/types';
import { authState, isAuthenticated, getAuthToken } from '@/business/auth';
import { personIdDisplay } from '@/business/format';
import TreePedigree from '@/components/tree-pedigree/tree-pedigree.vue';
import PersonDetailModal from '@/components/person-detail-modal/person-detail-modal.vue';
import FamilyMessages from '@/components/family-messages/family-messages.vue';
import OriginPicker from '@/components/origin-picker/origin-picker.vue';

const props = defineProps<{ treeId: string }>();

const archiveModal = ref<InstanceType<typeof PersonDetailModal> | null>(null);

const info = ref<ClanInfo | null>(null);
const loading = ref(true);
const error = ref('');

// ---- 视图切换与功能入口（与普通家族树首页对齐） ----
/** 血脉图示（默认）/ 版式文档（占位）/ 祖谱消息（管理权限） */
const view = ref<'pedigree' | 'doc' | 'msg'>('pedigree');
/** 祖谱消息入口可见性：chief_editor 全局；tree_steward 仅本祖谱（锚点树 == 本树） */
const canManageTree = ref(false);
/** 总编辑（PUT /tree-meta 限 chief_editor）→ 编辑祖谱信息入口 */
const isAdmin = computed(() => isAuthenticated() && authState.role === 'chief_editor');
/** 本祖谱 tree-meta 条目（编辑表单回填） */
const clanEntry = ref<TreeEntry | null>(null);
const showEdit = ref(false);
const saving = ref(false);
const editError = ref('');
const editForm = ref({ display_title: '', genealogy_name: '', archive_url: '', hall_name: '', description: '' });

/**
 * 打开编辑弹窗（字段：祖谱名称/谱名/文献地址/祠堂名/简介；**发源地不在本表单内** —— 由弹窗内的
 * `OriginPicker` 走 `POST /admin/set-tree-origin` 单独指定并即时落库，契约 v2 C8′）。
 * 表单**不含 `origin` / `origin_code`**：回传旧显示串会被 `PUT /tree-meta` 的 legacy 直写分支
 * 覆盖掉刚指定的发源地。
 */
function openEdit() {
  const e: any = clanEntry.value || {};
  editForm.value = {
    display_title: e.display_title || info.value?.title || '',
    genealogy_name: e.genealogy_name || info.value?.genealogy_name || '',
    archive_url: e.archive_url || '',
    hall_name: e.hall_name || '',
    description: e.description || '',
  };
  editError.value = '';
  showEdit.value = true;
}

/**
 * 发源地指定成功（`OriginPicker` 内部已重拉候选）→ 就地刷新本地祖谱元条目。
 * 后端已即时落库；本表单**不回传**发源地，故此处只作展示缓存。本页 hero 原不展示发源地，无展示改动。
 */
function onOriginUpdated(r: SetTreeOriginResult) {
  if (clanEntry.value) {
    clanEntry.value = { ...clanEntry.value, origin: r.origin, origin_code: r.origin_code };
  }
}

/** 管理权限判定（口径与普通家族树首页一致：chief_editor 全局 / 本树 tree_steward） */
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
    canManageTree.value = !!anchor && anchor.tree_id === props.treeId;
  } catch {
    canManageTree.value = false;
  }
}

/** 保存祖谱信息（复用现有 updateTreeMeta；成功后就地刷新祖谱信息） */
async function saveEdit() {
  const token = getAuthToken();
  if (!token) {
    editError.value = '登录已过期，请重新登录';
    return;
  }
  saving.value = true;
  editError.value = '';
  try {
    await updateTreeMeta(token, { tree_id: props.treeId, ...editForm.value });
    showEdit.value = false;
    uni.showToast({ title: '保存成功', icon: 'success' });
    await load();
  } catch (e: any) {
    editError.value = e?.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

const mirrors = computed(() => info.value?.mirrors || []);
const branches = computed(() => info.value?.branches || []);
const ownCount = computed(() => info.value?.own_count ?? 0);
const totalCount = computed(() => ownCount.value + mirrors.value.length);

async function load() {
  if (!props.treeId) {
    error.value = '缺少 tree_id 参数';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    info.value = await fetchClanInfo(props.treeId);
    if (info.value.title) {
      uni.setNavigationBarTitle({ title: info.value.title });
    }
    // 祖谱 tree-meta 条目（编辑表单回填；读不到就以 clan-info 为准）
    try {
      const m = await fetchTreeMetaRemote();
      clanEntry.value = (Object.values(m.trees) as TreeEntry[]).find((t) => t.tree_id === props.treeId) || null;
    } catch {
      clanEntry.value = null;
    }
  } catch (e: any) {
    error.value = e?.message || '加载祖谱失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 镜像节点 → 打开真身档案（真身在中华世本；本层只读，修改须到真身所在层）。
 * 口径 A：镜像指针齐备（external_mirror='true' + upper_handle + upper_tree_id）→ 传镜像指针给弹窗，
 * 由弹窗统一按 external_tree / external_person_handle 口径解析真身并加顶部标注（第 3/5 条）。
 */
function openUpperPerson(m: ClanMirrorNode) {
  if (!m.upper_handle) {
    uni.showToast({ title: '该镜像节点未记录真身 handle', icon: 'none' });
    return;
  }
  const upperTree = m.upper_tree_id || 'zhonghua';
  archiveModal.value?.open(upperTree, m.upper_handle, {
    external_mirror: 'true',
    external_person_handle: m.upper_handle,
    external_tree: upperTree,
    external_link_type: m.link_type,
  });
}

/**
 * 本宗自有支系入口节点（普通树认祖的落点）。
 * 口径 A：该节点自身也可能是镜像（认祖/跨树子女产物）→ 先取节点判定，是镜像则打开真身档案；
 * 拉取失败（404/权限/网络）时维持原行为 —— 直接打开本树副本（弹窗内不再二次解析）。
 */
async function openOwnFounder() {
  const h = info.value?.founder_handle;
  if (!h) return;
  try {
    const p = await fetchPerson(props.treeId, h);
    archiveModal.value?.open(props.treeId, h, p);
  } catch {
    archiveModal.value?.open(props.treeId, h);
  }
}

/** 支系入口：进入该普通家族树首页 */
function goBranch(b: { tree_id: string }) {
  if (!b?.tree_id) return;
  openTreeHome(b.tree_id);
}

onMounted(() => {
  load();
  loadManageRights();
});
watch(
  () => props.treeId,
  (v) => {
    if (v) load();
  },
);
</script>

<style scoped>
.clan-hall { padding: 12px 12px 32px; }

/* 编辑祖谱信息入口 */
.clan-edit-entry {
  display: inline-block; margin-top: 10px; padding: 7px 16px;
  background: #FFF3E0; border: 1px solid #E8C9A0; border-radius: 18px;
}
.clan-edit-text { font-size: 13px; color: #8B4513; }

/* 左侧功能按钮（与普通家族树首页同款：固定悬浮正方按钮） */
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

/* 祖谱消息视图（左侧按钮留位） */
.clan-msg-body { margin-left: 8px; }

/* 编辑弹窗 */
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

.clan-hero {
  background: #FFFDF8;
  border: 1px solid #EFE3D3;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.clan-title { font-size: 18px; font-weight: bold; color: #3E2723; display: block; }
.clan-meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.clan-surname { font-size: 13px; color: #8B4513; }
.clan-genealogy { font-size: 12px; color: #A1887F; }
.clan-notice { font-size: 12px; color: #C62828; display: block; margin-top: 8px; }

.clan-loading { text-align: center; padding: 40px 0; }
.clan-error { text-align: center; color: #C62828; font-size: 13px; padding: 24px 0; }

.segment {
  background: #FFFDF8;
  border: 1px solid #EFE3D3;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}
.seg-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.seg-title { font-size: 15px; font-weight: bold; color: #8B4513; }
.seg-count { font-size: 12px; color: #A1887F; }
.seg-hint { font-size: 11px; color: #A1887F; line-height: 1.6; display: block; margin-top: 6px; }
.seg-empty { font-size: 12px; color: #999; padding: 14px 0; text-align: center; }
.seg-actions { display: flex; gap: 8px; margin-top: 10px; }

.mirror-list { margin-top: 10px; }
.mirror-row { display: flex; gap: 8px; }
.mirror-gutter { width: 14px; display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.mirror-dot { width: 9px; height: 9px; border-radius: 50%; background: #D7CCC8; margin-top: 12px; }
.mirror-dot.hl { background: #8B4513; }
.mirror-line { flex: 1; width: 1px; background: #EFE3D3; }
.mirror-card { flex: 1; min-width: 0; padding: 8px 0 10px; }
.mirror-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mirror-name { font-size: 14px; font-weight: bold; color: #3E2723; }
.mirror-sub { font-size: 11px; color: #A1887F; display: block; margin-top: 4px; }

.branch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 2px;
  border-bottom: 1px solid #F3EBE0;
}
.branch-row:last-child { border-bottom: none; }
.branch-body { flex: 1; min-width: 0; }
.branch-name { font-size: 14px; font-weight: bold; color: #3E2723; display: block; }
.branch-sub { font-size: 11px; color: #A1887F; display: block; margin-top: 4px; }
.branch-arrow { font-size: 16px; color: #C7B299; }
</style>
