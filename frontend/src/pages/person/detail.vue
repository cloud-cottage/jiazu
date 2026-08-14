<template>
  <view class="container">
    <view v-if="person" class="person-detail">
      <view class="name-row">
        <text class="name">{{ person.name }}</text>
        <!-- 编辑按钮（有编辑权限时显示） -->
        <t-button
          v-if="canEdit"
          size="small"
          variant="outline"
          theme="primary"
          class="edit-btn"
          @click="openEdit"
        >✏️ 编辑</t-button>
      </view>

      <view class="info-row" v-if="isLivingPerson">
        <t-tag theme="warning" variant="light">在世（信息已脱敏）</t-tag>
      </view>

      <view class="info-card">
        <t-cell-group :bordered="false">
          <t-cell
            v-if="person.birth_date && !isLivingPerson"
            title="生"
            :note="person.birth_date"
          />
          <t-cell
            v-if="person.death_date && !isLivingPerson"
            title="卒"
            :note="person.death_date"
          />
          <t-cell title="编号" :note="person.gramps_id" />
        </t-cell-group>
      </view>

      <view v-if="person.events && person.events.length" class="section">
        <text class="section-title">生平大事</text>
        <t-cell-group :bordered="false">
          <t-cell
            v-for="evt in person.events"
            :key="evt.handle"
            :title="evt.type"
            :description="evt.place"
            :note="evt.date"
          />
        </t-cell-group>
      </view>

      <view v-if="externalRefs.length" class="section">
        <text class="section-title">关联信息</text>
        <t-cell-group :bordered="false">
          <t-cell
            v-for="attr in externalRefs"
            :key="attr.key"
            :title="`${attr.key}: 查看 →`"
            arrow
            @click="goToExternal(attr.value)"
          />
        </t-cell-group>
      </view>
    </view>

    <view v-else class="loading">
      <t-loading size="40px" theme="spinner" text="加载中..." />
    </view>

    <!-- 编辑模态框 -->
    <view v-if="showEdit" class="modal-mask" @click.self="showEdit = false">
      <view class="modal">
        <text class="modal-title">编辑人物</text>
        <scroll-view scroll-y class="modal-body">
          <!-- 基本信息 -->
          <text class="field-label">基本信息</text>
          <t-input :value="editForm.first_name" placeholder="名" class="field" 
          @update:value="(v: any) => editForm.first_name = v"
          />
          <t-input :value="editForm.surname" placeholder="姓" class="field" 
          @update:value="(v: any) => editForm.surname = v"
          />
          <t-radio-group :value="editForm.gender" placement="horizontal" class="field"
          @update:value="(v: any) => editForm.gender = v">
            <t-radio value="M">男</t-radio>
            <t-radio value="F">女</t-radio>
            <t-radio value="U">未知</t-radio>
          </t-radio-group>

          <!-- 生卒 -->
          <text class="field-label">生卒（格式：YYYY-MM-DD 或 YYYY 或 YYYY/MM/DD）</text>
          <t-input :value="editForm.birth_date" placeholder="出生日期" class="field" 
          @update:value="(v: any) => editForm.birth_date = v"
          />
          <t-input :value="editForm.death_date" placeholder="去世日期" class="field" 
          @update:value="(v: any) => editForm.death_date = v"
          />

          <!-- 生平事件 -->
          <text class="field-label">生平事件</text>
          <view v-for="(evt, i) in editForm.events" :key="i" class="event-edit-row">
            <t-input :value="evt.type" placeholder="事件类型（如：出生/结婚）" class="field" 
            @update:value="(v: any) => evt.type = v"
            />
            <t-input :value="evt.date" placeholder="日期" class="field" 
            @update:value="(v: any) => evt.date = v"
            />
            <t-input :value="evt.place" placeholder="地点" class="field" 
            @update:value="(v: any) => evt.place = v"
            />
            <t-button size="small" variant="outline" theme="danger" @click="removeEvent(i)">删除</t-button>
          </view>
          <t-button size="small" variant="outline" @click="addEvent">＋ 添加事件</t-button>
        </scroll-view>

        <view v-if="editError" class="edit-error">{{ editError }}</view>
        <view class="modal-actions">
          <t-button theme="primary" block :loading="saving" @click="doSave">保存</t-button>
          <t-button variant="text" block @click="showEdit = false">取消</t-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchPerson, fetchPersonForEdit, savePerson, sanitizePerson, isLiving, API_BASE } from '@/business';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import type { PersonDetail } from '@/business/types';

const treeId = ref('');
const handle = ref('');
const person = ref<PersonDetail | null>(null);

const showEdit = ref(false);
const saving = ref(false);
const editError = ref('');
const editForm = ref({
  first_name: '',
  surname: '',
  gender: 'U',
  birth_date: '',
  death_date: '',
  events: [] as Array<{ type: string; date: string; place: string }>,
});

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
  handle.value = options?.handle || '';
});

const isLivingPerson = computed(() => (person.value ? isLiving(person.value) : false));

// 编辑权限：登录 + 非 guest；总谱仅 chief_editor
const canEdit = computed(() => {
  if (!isAuthenticated()) return false;
  if (authState.role === 'guest') return false;
  if (treeId.value === 'zhonghua' && authState.role !== 'chief_editor') return false;
  return true;
});

const externalRefs = computed(() => {
  if (!person.value?.attributes) return [];
  return person.value.attributes.filter(
    (a) => a.key === 'external_tree' || a.key === 'external_person_handle' || a.key === 'external_relation_note',
  );
});

onMounted(async () => {
  if (!treeId.value || !handle.value) return;
  try {
    const raw = await fetchPerson(treeId.value, handle.value);
    person.value = sanitizePerson(raw);
  } catch (e) {
    console.error('加载人物详情失败:', e);
  }
});

async function openEdit() {
  editError.value = '';
  const token = getAuthToken();
  if (!token) {
    editError.value = '登录已过期，请重新登录';
    return;
  }
  try {
    const raw = await fetchPersonForEdit(treeId.value, handle.value, token);
    const pn = raw.primary_name || {};
    const surname = pn.surname_list?.[0]?.surname || '';
    // gender 数字枚举 → M/F/U
    const genderNum = raw.gender;
    const genderStr = genderNum === 1 ? 'M' : genderNum === 2 ? 'F' : genderNum === 0 ? 'U' : (genderNum || 'U');
    // 提取生卒（从出生/死亡事件日期）
    let birth = '';
    let death = '';
    const events: Array<{ type: string; date: string; place: string }> = [];
    // event_ref_list 只有 ref handle，需要逐个拉事件详情
    const refs = raw.event_ref_list || [];
    const eventPromises = refs.map(async (er: any) => {
      try {
        const evtRes = await fetch(
          `${API_BASE}/events/${er.ref}`,
          { headers: { 'X-Tree-Id': treeId.value } },
        );
        if (!evtRes.ok) return null;
        return evtRes.json();
      } catch {
        return null;
      }
    });
    const eventObjs = await Promise.all(eventPromises);
    for (const evt of eventObjs) {
      if (!evt) continue;
      const type = typeof evt.type === 'string' ? evt.type : evt.type?.text || '';
      const date = evt.date?.text || '';
      const place = evt.place?.name || evt.place || '';
      if (type.includes('Birth')) birth = date;
      if (type.includes('Death')) death = date;
      events.push({ type, date, place });
    }
    editForm.value = {
      first_name: pn.first_name || '',
      surname,
      gender: genderStr,
      birth_date: birth,
      death_date: death,
      events,
    };
    showEdit.value = true;
  } catch (e: any) {
    editError.value = e.message || '加载编辑数据失败';
  }
}

function addEvent() {
  editForm.value.events.push({ type: '', date: '', place: '' });
}

function removeEvent(i: number) {
  editForm.value.events.splice(i, 1);
}

async function doSave() {
  saving.value = true;
  editError.value = '';
  const token = getAuthToken();
  if (!token) {
    editError.value = '登录已过期，请重新登录';
    saving.value = false;
    return;
  }
  try {
    // 重新 GET 最新对象（避免构造完整对象）
    const raw = await fetchPersonForEdit(treeId.value, handle.value, token);
    // 关键：profile 字段会导致 PUT 反序列化失败（Unknown classes），必须删除
    delete raw.profile;
    // 注意：gender 保持数字枚举（1男/2女/0未知），PUT 接受数字，不要转 M/F/U
    // 更新基本信息
    raw.primary_name = raw.primary_name || {};
    raw.primary_name.first_name = editForm.value.first_name;
    raw.primary_name.surname_list = [{ surname: editForm.value.surname }];
    // 表单 gender 是 M/F/U，映射回数字
    const genderNumMap: Record<string, number> = { M: 1, F: 2, U: 0 };
    raw.gender = genderNumMap[editForm.value.gender] ?? raw.gender;
    await savePerson(treeId.value, handle.value, raw, token);
    uni.showToast({ title: '保存成功', icon: 'success' });
    showEdit.value = false;
    // 刷新详情
    const fresh = await fetchPerson(treeId.value, handle.value);
    person.value = sanitizePerson(fresh);
  } catch (e: any) {
    editError.value = e.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

function goToExternal(treeId: string) {
  uni.navigateTo({ url: `/pages/hall/index?tree_id=${treeId}` });
}
</script>

<style scoped>
.container { padding: 20px; }
.name-row { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 16px; }
.name { font-size: 24px; font-weight: bold; color: #3E2723; }
.edit-btn { flex-shrink: 0; }
.info-row { display: flex; justify-content: center; margin-bottom: 12px; }
.info-card :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.section { margin-top: 20px; }
.section-title { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 8px; }
.section :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.loading { text-align: center; padding: 60px; color: #999; }

/* 编辑模态框 */
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 88%; max-width: 420px; max-height: 85vh;
  background: #fff; border-radius: 14px; padding: 20px;
  display: flex; flex-direction: column;
}
.modal-title { font-size: 18px; font-weight: bold; color: #3E2723; text-align: center; margin-bottom: 12px; }
.modal-body { flex: 1; max-height: 55vh; }
.field-label { font-size: 13px; color: #8B4513; font-weight: bold; display: block; margin: 12px 0 6px; }
.field { margin-bottom: 8px; }
.event-edit-row { background: #FBF8F4; border-radius: 8px; padding: 8px; margin-bottom: 8px; }
.edit-error { text-align: center; color: #C62828; font-size: 13px; margin: 8px 0; }
.modal-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
</style>
