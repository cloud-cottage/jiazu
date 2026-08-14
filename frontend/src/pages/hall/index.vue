<template>
  <view class="container">
    <view class="hero">
      <text class="title">{{ hallInfo?.display_title || '加载中...' }}</text>
      <text class="hall-name" v-if="hallInfo?.hall_name">堂号：{{ hallInfo.hall_name }}</text>
      <text class="origin" v-if="hallInfo">堂号发源地：{{ hallInfo.origin }}</text>
      <text class="desc" v-if="hallInfo">{{ hallInfo.description }}</text>

      <!-- 管理员编辑入口 -->
      <view v-if="isAdmin" class="edit-entry" @click="openEdit">
        <text class="edit-btn-text">✏️ 编辑堂号 / 发源地</text>
      </view>
    </view>

    <view class="nav-grid">
      <t-grid :columns="3" :bordered="false">
        <t-grid-item
          v-for="item in navItems"
          :key="item.key"
          :text="item.label"
          @click="goTo(item.key)"
        >
          <template #icon>
            <text class="nav-icon">{{ item.icon }}</text>
          </template>
        </t-grid-item>
      </t-grid>
    </view>

    <view class="stats" v-if="stats">
      <text class="stat">收录人物：{{ stats.person_count }} 人</text>
      <text class="stat">家族分支：{{ stats.family_count }}</text>
      <text class="stat">历史文献：{{ stats.media_count }} 件</text>
    </view>

    <!-- 家族树资金（公开可见） -->
    <view class="tree-fund" v-if="treeBalance !== null">
      <text class="fund-label">家族树资金</text>
      <text class="fund-value">¥{{ treeBalance }}</text>
      <text v-if="isAuthenticated()" class="fund-action" @click="goTransfer">转账支持</text>
    </view>

    <!-- 编辑模态框 -->
    <view v-if="showEdit" class="modal-mask" @click="closeEdit">
      <view class="modal" @click.stop>
        <text class="modal-title">编辑家族馆信息</text>

        <view class="form-item">
          <text class="label">馆名</text>
          <input v-model="editForm.display_title" class="input" placeholder="如：季氏（苏南支）家族历史数字馆" />
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
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchTreeMetaRemote, fetchTreeStats, updateTreeMeta, fetchTreeBalance } from '@/business';
import { authState, isAuthenticated, getAuthToken } from '@/business/auth';
import type { TreeEntry } from '@/business/types';

const treeId = ref('');
const hallInfo = ref<TreeEntry | null>(null);
const stats = ref<any>(null);
const treeBalance = ref<string | null>(null);

const showEdit = ref(false);
const saving = ref(false);
const editError = ref('');
const editForm = ref({ display_title: '', hall_name: '', origin: '', description: '' });

// 导航项（TDesign grid）
const navItems = [
  { key: 'pedigree', label: '世系图谱', icon: '🌳' },
  { key: 'media', label: '文献浏览', icon: '📜' },
  { key: 'generation', label: '字辈检索', icon: '📖' },
  { key: 'migration', label: '迁徙地图', icon: '🗺️' },
  { key: 'pdf', label: 'PDF族谱', icon: '🖨️' },
  { key: 'search', label: '搜索', icon: '🔍' },
];

// 总编辑判定：登录用户 role === 'chief_editor'（最高权限）
const isAdmin = computed(() => isAuthenticated() && authState.role === 'chief_editor');

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});

onMounted(async () => {
  if (!treeId.value) return;

  try {
    const meta = await fetchTreeMetaRemote();
    for (const [, entry] of Object.entries(meta.trees)) {
      if (entry.tree_id === treeId.value) {
        hallInfo.value = entry;
        break;
      }
    }
  } catch (e) {
    console.error('加载数字馆信息失败:', e);
  }

  try {
    stats.value = await fetchTreeStats(treeId.value);
  } catch (e) {
    console.error('加载统计失败:', e);
  }

  // 家族树资金（公开）
  try {
    const fund = await fetchTreeBalance(treeId.value);
    treeBalance.value = fund.balance_yuan;
  } catch (e) {
    console.error('加载家族树资金失败:', e);
  }
});

function goTransfer() {
  // 跳转钱包页，预填 tree_id
  uni.navigateTo({ url: `/pages/wallet/index?tree_id=${treeId.value}` });
}

function openEdit() {
  if (!hallInfo.value) return;
  editForm.value = {
    display_title: hallInfo.value.display_title || '',
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

function goTo(page: string) {
  const prefix = page === 'generation' || page === 'migration' || page === 'pdf'
    ? '/pages/special'
    : '/pages';
  const paths: Record<string, string> = {
    pedigree: `${prefix}/pedigree/index?tree_id=${treeId.value}`,
    media: `${prefix}/media/index?tree_id=${treeId.value}`,
    generation: `/pages/special/generation-poem/index?tree_id=${treeId.value}`,
    migration: `/pages/special/migration-map/index?tree_id=${treeId.value}`,
    pdf: `/pages/special/pdf-export/index?tree_id=${treeId.value}`,
    search: `/pages/search/index?tree_id=${treeId.value}`,
  };
  uni.navigateTo({ url: paths[page] });
}
</script>

<style scoped>
.container { padding: 20px; }
.hero { text-align: center; margin-bottom: 30px; }
.title { font-size: 22px; font-weight: bold; color: #3E2723; display: block; }
.hall-name { font-size: 16px; color: #8B4513; font-weight: bold; margin-top: 10px; display: block; }
.origin { font-size: 14px; color: #888; margin-top: 6px; display: block; }
.desc { font-size: 14px; color: #555; margin-top: 8px; line-height: 1.6; display: block; }
.edit-entry {
  display: inline-block; margin-top: 14px; padding: 8px 18px;
  background: #FFF3E0; border: 1px solid #E8C9A0; border-radius: 18px;
}
.edit-btn-text { font-size: 13px; color: #8B4513; }
.nav-grid { margin: 16px 0; }
.nav-icon { font-size: 26px; }
.nav-grid :deep(.t-grid) { border-radius: 12px; overflow: hidden; }
.nav-grid :deep(.t-grid-item) { padding: 12px 0; }
.stats { text-align: center; margin-top: 24px; padding: 16px; background: #FFF8E1; border-radius: 8px; }
.stat { font-size: 14px; color: #5D4037; margin: 0 12px; display: inline-block; }

/* 家族树资金 */
.tree-fund {
  margin-top: 14px; padding: 16px; background: #E8F5E9;
  border-radius: 8px; text-align: center;
}
.fund-label { font-size: 13px; color: #2E7D32; display: block; }
.fund-value { font-size: 24px; font-weight: bold; color: #1B5E20; display: block; margin: 4px 0; }
.fund-action {
  display: inline-block; margin-top: 6px; padding: 4px 14px;
  background: #2E7D32; color: #fff; border-radius: 12px; font-size: 12px;
}

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
</style>
