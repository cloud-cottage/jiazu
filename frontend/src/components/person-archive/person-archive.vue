<template>
  <view class="container" :class="mode">
    <!-- 档案视图（非编辑态）：完整档案 + 编辑/出嫁入口 + 图谱管理操作区 -->
    <view v-if="!showEdit" class="archive-view">
      <view v-if="person" class="person-detail">
      <!-- 口径 A 第 3/5 条：由镜像节点进入真身档案时的顶部标注（普通打开为空 → 零影响） -->
      <view v-if="mirrorNote" class="mirror-note">
        <text class="mirror-note-text">{{ mirrorNote }}</text>
      </view>
      <view class="name-row">
        <image
          v-if="genderIcon"
          class="gender-badge"
          :src="genderIcon"
          mode="aspectFit"
        />
        <text class="name">{{ person.name }}</text>
        <!-- 称号（封号优先，其次号/谥号）：毕公 / 周文王 … -->
        <text v-if="titleTag" class="name-title">{{ titleTag }}</text>
        <!-- 编辑按钮（有编辑权限时显示） -->
        <t-button
          v-if="canEdit"
          size="small"
          variant="outline"
          theme="primary"
          class="edit-btn"
          @click="openEdit"
        >✏️ 编辑</t-button>
        <!-- 跨树嫁娶（docs/marriage.spec.md）：嫁出（女）/ 娶入（男）→ 提交申请，对方家族审批后生效 -->
        <t-button
          v-if="canMarryOut"
          size="small"
          variant="outline"
          theme="warning"
          class="edit-btn"
          @click="openMarry"
        >💍 嫁出</t-button>
        <t-button
          v-if="canMarryIn"
          size="small"
          variant="outline"
          theme="warning"
          class="edit-btn"
          @click="openMarry"
        >🤵 娶入</t-button>
        <!-- 始祖挂载（docs/founder-attach.spec.md）：未挂载的始祖节点 →「认祖」；镜像态 →「解除挂载」 -->
        <t-button
          v-if="canFounderAttach"
          size="small"
          variant="outline"
          theme="primary"
          class="edit-btn"
          @click="openFounderAttach"
        >⛩ 认祖（挂到{{ founderTargetKindLabel }}）</t-button>
        <t-button
          v-if="canFounderDetach"
          size="small"
          variant="outline"
          theme="danger"
          class="edit-btn"
          @click="detachFounderHere"
        >⛓ 解除挂载</t-button>
        <!-- 汇宗（docs/branch-clan-ops.spec.md §6-2 / §9-1）：始祖为宗谱节点镜像时整体并入他树（仅总编） -->
        <t-button
          v-if="canConvergeClan"
          size="small"
          variant="outline"
          theme="danger"
          class="edit-btn"
          @click="openConvergeClan"
        >⛩ 汇宗（并入他树）</t-button>
        <!-- 重置始祖：清空本树始祖登记 → 本树回到「无始祖」态（可在任意节点用「⛩ 认祖」重新指定） -->
        <t-button
          v-if="canFounderReset"
          size="small"
          variant="outline"
          theme="danger"
          class="edit-btn"
          @click="resetFounderHere"
        >🔁 重置始祖</t-button>
        <!-- 身份认定已取消（申请-审批制；docs/permission-tier.spec.md §9）：自助认领不再提供 -->
      </view>

      <view class="info-row" v-if="isLivingPerson">
        <t-tag theme="warning" variant="light">在世</t-tag>
      </view>

      <!-- 只读镜像态（R3 方向无关；徽标与提示一律取自 business 的 mirrorReadonlyViewOf，页面不自拼）：
           真身始祖 / 自建始祖 / 普通节点 → 零提示；孤儿镜像 → 孤儿提示。
           R2b：「空白占位锁」已作废 —— 未登记始祖的树可直接在本树填写姓名 / 生卒等信息。 -->
      <view v-if="readonlyView.tag" class="info-row founder-lock">
        <t-tag theme="warning" variant="light">{{ readonlyView.tag }}</t-tag>
      </view>
      <text v-if="readonlyView.note" class="founder-hint">{{ readonlyView.note }}</text>

      <view class="info-card">
        <t-cell-group :bordered="false">
          <!-- 生：有录入即显示（仅年份 → 年份；完整日期 → 日期）。在世者也显示出生信息。 -->
          <t-cell
            v-if="birthText"
            title="生"
            :note="birthText"
          />
          <!-- 出生地：结构化码由后端反查出的展示串 + 备注（无数据不显示；旧数据只有备注也显示） -->
          <t-cell
            v-if="birthPlaceText"
            title="出生地"
            :note="birthPlaceText"
          />
          <!-- 卒：仅已故显示；有日期写日期，卒年不详显示「不详」 -->
          <t-cell
            v-if="!isLivingPerson"
            title="卒"
            :note="deathText"
          />
          <!-- 编号（全站唯一，终身不变）：点整行复制，便于人工引用/跨树定位 -->
          <view @click="copyPersonId">
            <t-cell
              title="编号（全站唯一）"
              :note="`${personIdDisplay(person.gramps_id) || '—'} · 点此复制`"
            />
          </view>
          <!-- 称号：封号 → 谥号 → 号（有录入才显示；与姓名顺序一致） -->
          <t-cell v-if="titleMap['封号']" title="封号" :note="titleMap['封号']" />
          <t-cell v-if="titleMap['谥号']" title="谥号" :note="titleMap['谥号']" />
          <t-cell v-if="titleMap['号']" title="号" :note="titleMap['号']" />
        </t-cell-group>
      </view>

      <view v-if="residenceTexts.length" class="section">
        <text class="section-title">居住地</text>
        <t-cell-group :bordered="false">
          <!-- 顺序即录入顺序；展示串 = 码反查展示串 + 备注（备注为空不带分隔符） -->
          <t-cell
            v-for="(t, i) in residenceTexts"
            :key="i"
            :title="residenceTexts.length > 1 ? `居住地 ${i + 1}` : '居住地'"
            :note="t"
          />
        </t-cell-group>
      </view>

      <view v-if="parentsFamily" class="section">
        <text class="section-title">父母</text>
        <t-cell-group :bordered="false">
          <t-cell
            v-if="parentsFamily.father"
            title="父"
            :note="parentsFamily.father.name"
            arrow
            @click="goPerson(parentsFamily.father)"
          />
          <t-cell
            v-if="parentsFamily.mother"
            title="母"
            :note="parentsFamily.mother.name"
            arrow
            @click="goPerson(parentsFamily.mother)"
          />
        </t-cell-group>
      </view>

      <!-- 跨树婚姻（嫁出/娶入/绝婚/合离）：外树配偶 + 婚姻序号 + 成婚/结束日期 -->
      <view v-if="crossMarriage" class="section">
        <text class="section-title">跨树婚姻</text>
        <t-cell-group :bordered="false">
          <t-cell :title="crossMarriage.title" :note="crossMarriage.note" />
        </t-cell-group>
        <view v-if="crossMarriage.active" class="marriage-actions">
          <t-button
            v-if="person && person.gender === 'M'"
            size="small"
            variant="outline"
            theme="danger"
            @click="openEndMarriage('绝婚')"
          >⚔️ 绝婚</t-button>
          <t-button
            size="small"
            variant="outline"
            theme="warning"
            @click="openEndMarriage('合离')"
          >🤝 合离</t-button>
        </view>
        <text v-else class="marriage-hint">{{ crossMarriage.endedHint }}</text>
      </view>

      <view v-if="spouseFamilies.length" class="section">
        <text class="section-title">配偶与子女</text>
        <t-cell-group :bordered="false">
          <view v-for="fam in spouseFamilies" :key="fam.handle" class="fam-block">
            <view class="fam-row">
              <text class="fam-label">配偶</text>
              <text
                v-if="spouseOf(fam)"
                class="fam-link"
                @click="goPerson(spouseOf(fam))"
              >{{ spouseOf(fam)?.name }}</text>
              <text v-else class="fam-none">未记录</text>
            </view>
            <view class="fam-row" v-if="fam.children.length">
              <text class="fam-label">子女</text>
              <view class="fam-kids">
                <text
                  v-for="c in fam.children"
                  :key="c.handle"
                  class="fam-link"
                  @click="goPerson(c)"
                >{{ c.name }}</text>
              </view>
            </view>
          </view>
        </t-cell-group>
      </view>

      <!-- 始祖挂载（zhonghua 真身侧）：本节点被哪些家族树认作始祖 + 总编辑直接挂载入口 -->
      <view v-if="isMasterTree && (attachedTrees.length || canAttachFounder)" class="section">
        <text class="section-title">始祖挂载</text>
        <view v-for="att in attachedTrees" :key="att.tree_id" class="fam-block">
          <view class="fam-row">
            <text class="fam-label">挂载</text>
            <text class="fam-link" @click="goToAttachedTree(att)">【{{ attachedTreeLabel(att) }}】{{ att.tree_title }}</text>
          </view>
          <view v-if="canAttachFounder" class="fam-row">
            <text class="fam-label"></text>
            <t-button size="small" variant="outline" theme="danger" @click="detachFounderHere(att)">解除挂载</t-button>
          </view>
        </view>
        <text v-if="!attachedTrees.length" class="founder-hint">该节点暂未挂载任何下层树的始祖。</text>
        <text v-if="canAttachFounder" class="founder-hint">
          普通家族树须先认祖到本姓祖谱（不得直挂世本），因此世本侧可直接挂载的只有祖谱。
        </text>
        <view v-if="canAttachFounder" class="marriage-actions">
          <t-button size="small" variant="outline" theme="primary" @click="openAttachFounder">⛩ 挂载祖谱</t-button>
        </view>
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

      <view v-if="externalLinks.length" class="section">
        <text class="section-title">关联信息</text>
        <t-cell-group :bordered="false">
          <t-cell
            v-for="link in externalLinks"
            :key="link.tree_id"
            :title="link.note"
            :description="link.tree_id"
            arrow
            @click="goToExternal(link)"
          />
        </t-cell-group>
        <!-- 分迁占位节点：管理员可删除链接（彻底断开） -->
        <view v-if="canRemoveBranchHere" class="branch-admin">
          <t-button
            size="small"
            variant="outline"
            theme="danger"
            block
            :loading="removingBranch"
            @click="removeBranchLinkHere"
          >🗑 删除分迁链接（彻底断开）</t-button>
        </view>
      </view>

      <!-- 危险区：删除节点（管理员；总谱 / 始祖 / 镜像节点不显示；跨树关联由后端拒绝） -->
      <view v-if="canDeleteNode" class="section danger-zone">
        <text class="section-title">危险区</text>
        <t-button
          size="small"
          variant="outline"
          theme="danger"
          block
          :loading="deleting"
          @click="openDelete"
        >🗑 删除节点</t-button>
        <text class="danger-hint">
          删除不可恢复：可「连本节点带全部后代」一起删除，或「仅删本节点」——配偶健在时子女留在原家族
          （只清本人槽位）；本人是该家族唯一家长时子女上提一级并入父母的家族。
          被其它家族树引用的节点一律拒绝删除，请先到对应家族树解除关系。
        </text>
        <text v-if="isClanTree" class="danger-hint clan-danger-hint">
          ⚠️ 本树为祖谱：删支系节点风险较高——祖谱自有支系常是下级普通家族树的认祖落点，
          删除后这些树会失去锚点。该操作仅总编（chief_editor）可见/可执行。
        </text>
      </view>

      <!-- 谱系管理操作区（树图/总谱时间轴宿主开启；加父加子/续编/拆分/立支内联在档案内） -->
      <PersonManagePanel
        v-if="treeManage && person"
        :tree-id="treeId"
        :person-name="person.name"
        :handle="person.handle"
        :chain-gen="chainGen"
        :chain-aggregate="chainAggregate"
        :person-surname="person.surname"
        :person-gender="person.gender"
        :child-surname-default="childSurnameDefault"
        :tree-kind="treeKind"
        :is-founder="isFounderNode"
        :is-mirror="isExternalMirror"
        :is-chain-mirror="isChainMirror"
        @tree-changed="onManageTreeChanged"
      />
    </view>

    <view v-else-if="loadError" class="loading archive-error">
      <text class="error-text">{{ loadError }}</text>
      <t-button size="small" variant="outline" @click="load()">重试</t-button>
    </view>

    <view v-else class="loading">
      <t-loading size="40px" theme="spinner" text="加载中..." />
    </view>
    </view>

    <!-- 编辑面板（原位替换档案视图：同一弹窗/页面内切换，不再是独立弹窗） -->
    <view v-if="showEdit && person" class="edit-inline">
      <view class="edit-inline-head">
        <text class="edit-inline-title">编辑「{{ person.name }}」</text>
        <text class="edit-inline-close" @click="cancelEdit">✕</text>
      </view>
      <view class="edit-inline-body">
        <!-- 只读镜像（R3 唯一例外 · 契约 v2 C6）：身份 / 生卒 / 健在 / 称号 / 事件以真身为准，
             本层只保留出生地 / 居住地两个可提交字段 -->
        <text v-if="readonlyMode" class="field-hint">{{ readonlyView.note }}</text>
        <template v-if="!readonlyMode">
        <!-- 基本信息：姓 → 名 → 性别（顺序与卡片人物名称一致） -->
        <text class="field-label">基本信息</text>
          <t-input :value="editForm.surname" placeholder="姓" class="field" 
          @update:value="(v: any) => editForm.surname = v"
          />
          <t-input :value="editForm.first_name" placeholder="名" class="field" 
          @update:value="(v: any) => editForm.first_name = v"
          />
          <t-radio-group :value="editForm.gender" placement="horizontal" class="field"
          @update:value="(v: any) => editForm.gender = v">
            <t-radio value="M">男</t-radio>
            <t-radio value="F">女</t-radio>
            <t-radio value="U">未知</t-radio>
          </t-radio-group>

          <!-- 称号：封号 → 谥号 → 号（与姓名分离，可留空；顺序同人物名称显示） -->
          <text class="field-label">封号（封国/爵位称号，选填）</text>
          <t-input :value="editForm.feng" placeholder="如：毕公 / 周文王" class="field"
          @update:value="(v: any) => editForm.feng = v"
          />
          <text class="field-label">谥号（选填）</text>
          <t-input :value="editForm.shi" placeholder="如：文忠" class="field"
          @update:value="(v: any) => editForm.shi = v"
          />
          <text class="field-label">号（别号/字号，选填）</text>
          <t-input :value="editForm.hao" placeholder="如：青莲居士" class="field"
          @update:value="(v: any) => editForm.hao = v"
          />

          <!-- 改挂父节点（管理员）：填全局编号或 handle → 本节点改挂到该节点家族下（槽位按新父节点性别）；
               编号属于别的家族树时 = 跨树迁移（自动识别所属树，无需再选目标树；编号终身不变） -->
          <text class="field-label">父节点编号（{{ PERSON_REF_HINT }}，选填）</text>
          <t-input :value="editForm.parent_id" :placeholder="`${PERSON_REF_PLACEHOLDER}；留空 = 不改`" class="field"
          @update:value="(v: any) => editForm.parent_id = v"
          />
          <text class="field-hint">{{ parentsHint }}</text>
          <text class="field-hint">
            改父扣费：同树改父消耗 1 片竹片；跨树整体迁移本次迁移共 9 片（与携带后代人数无关）。提交前会再确认一次，确认后才会扣费。
          </text>
          <text class="field-hint">
            选填：填全局编号一键定位（无需选择家族树）——该节点与本树同树则改挂父节点；
            属于别的家族树则本节点及其全部后代整体迁入该树（**编号终身不变**，跨树关联节点将被拒绝）。
          </text>

          <!-- 生卒：出生时间可填年份或完整日期；是否健在选择；已故时可选填离世时间 -->
          <text class="field-label">出生时间（可填年份，如 1957；或完整日期，如 1957-12-04）</text>
          <t-input :value="editForm.birth_date" placeholder="1957 或 1957-12-04" class="field"
          @update:value="(v: any) => editForm.birth_date = v"
          />
        </template>

          <!-- 出生地（契约 v2）：结构化三级行政区划真源（只提交 origin_code）+ 备注；
               展示串由后端按码反查生成，前端只在选择器内做即时预览 -->
          <text class="field-label">出生地（省 / 市 / 县，选填）</text>
          <GeoCascader
            :model-value="editForm.birth_place.origin_code"
            @update:model-value="(v: any) => editForm.birth_place.origin_code = v"
          />
          <text class="field-label">备注（选填）</text>
          <t-input :value="editForm.birth_place.note" placeholder="如：费县白露村老宅" class="field"
          @update:value="(v: any) => editForm.birth_place.note = v"
          />

        <template v-if="!readonlyMode">
          <text class="field-label">是否健在</text>
          <!-- 总谱（中华世本）与祖谱节点一律已故：字段锁死，仅展示不可改（普通家族树仍可编辑） -->
          <view v-if="livingLocked" class="living-locked">
            <t-tag theme="default" variant="light">{{ livingLockTag }}</t-tag>
            <text class="field-hint">{{ livingLockHint }}</text>
          </view>
          <t-radio-group v-else :value="editForm.is_living ? '1' : '0'" placement="horizontal" class="field"
          @update:value="(v: any) => editForm.is_living = v === '1'">
            <t-radio value="1">健在</t-radio>
            <t-radio value="0">已故</t-radio>
          </t-radio-group>

          <view v-if="!editForm.is_living" class="living-block">
            <text class="field-label">离世时间（选填，可留空 = 已故但卒年不详）</text>
            <t-input :value="editForm.death_date" placeholder="2020 或 2020-05-01" class="field"
            @update:value="(v: any) => editForm.death_date = v"
            />
          </view>
        </template>

          <!-- 居住地（契约 v2）：多条，**最多 9 条**，顺序即展示顺序；空条目（无码也无备注）保存时丢弃 -->
          <text class="field-label">居住地（最多 {{ MAX_RESIDENCE_PLACES }} 条，可增删）</text>
          <text v-if="!editForm.residence_places.length" class="field-hint">暂无居住地，点下方「＋ 添加居住地」新增。</text>
          <view v-for="(rp, i) in editForm.residence_places" :key="i" class="place-edit-row">
            <text class="field-label">居住地 {{ i + 1 }}（省 / 市 / 县，选填）</text>
            <GeoCascader
              :model-value="rp.origin_code"
              @update:model-value="(v: any) => rp.origin_code = v"
            />
            <text class="field-label">备注（选填）</text>
            <t-input :value="rp.note" placeholder="如：费县城关镇" class="field"
            @update:value="(v: any) => rp.note = v"
            />
            <t-button size="small" variant="outline" theme="danger" @click="removeResidence(i)">删除</t-button>
          </view>
          <t-button size="small" variant="outline" :disabled="residenceFull" @click="addResidence">＋ 添加居住地</t-button>
          <text class="field-hint">{{ residenceHint }}</text>

        <template v-if="!readonlyMode">
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
        </template>
        </view>

        <view v-if="editError" class="edit-error">{{ editError }}</view>
        <view class="edit-actions">
          <t-button theme="primary" block :loading="saving" @click="doSave">保存</t-button>
          <t-button variant="outline" block @click="cancelEdit">取消</t-button>
        </view>
    </view>

    <!-- 嫁出/娶入弹窗：选目标家族树的配偶节点 + 选填成婚日期 → 提交申请，对方家族审批后生效 -->
    <view v-if="showMarry" class="modal-mask" @click="showMarry = false">
      <view class="modal" @click.stop>
        <text class="modal-title">{{ marryTitle }}</text>
        <text class="modal-sub">
          在对方家族树中选择配偶节点（本人节点保留在本树）。提交后需「对方家族审批」通过才生效；两人各自树内都会建立配偶关系。
        </text>

        <text class="field-label">选择目标家族树</text>
        <!-- 候选集合不变（!is_master && !== 本树）；渲染改由共享树选择器承载：折叠态恒一行，展开态独立选择层 -->
        <TreePicker
          :items="marryTreeItems"
          :model-value="marryTreeId"
          title="选择目标家族树"
          placeholder="请选择目标家族树"
          @update:model-value="(v: any) => selectMarryTree(v)"
        />

        <template v-if="marryTreeId">
          <text class="field-label">搜索目标家族树中的{{ marryDirection === 'out' ? '男性' : '女性' }}节点</text>
          <view class="search-row">
            <t-input
              :value="marryQuery"
              placeholder="输入姓名搜索"
              class="search-input"
              @update:value="(v: any) => marryQuery = v"
              @confirm="doSearchMarry"
            />
            <t-button size="small" theme="primary" @click="doSearchMarry">搜索</t-button>
          </view>
          <view v-if="marrySearching" class="join-tip">搜索中...</view>
          <view v-else-if="marryResults.length" class="join-results">
            <view
              v-for="r in marryResults"
              :key="r.handle"
              class="join-result"
              :class="{ selected: selectedMarry?.handle === r.handle }"
              @click="selectMarry(r)"
            >
              <text class="result-name">{{ r.name }}</text>
              <text class="result-id">{{ personIdDisplay(r.gramps_id) }}</text>
              <text class="result-gender">{{ r.gender === 'M' ? '男' : '女' }}</text>
            </view>
          </view>
          <!-- 空态**必须区分三态**（此前只有一句「未找到…节点」= 本缺陷的可见性黑洞）：
               ① 未登录 / 登录过期（401）→「登录已过期，请重新登录」
               ② 通道错误 → 显示后端错误文案
               ③ 确实无匹配 →「未找到符合条件的女性/男性节点」（文案由 doSearchMarry 赋值） -->
          <view v-else-if="marrySearched" class="join-tip">{{ marrySearchNote }}</view>
        </template>

        <!-- 兜底入口：按全局编号指定（编号自带所属树 → 填了编号可不必先选树；
             提交时**编号优先**，后端 resolveNode 全局解析，失败文案沿用后端现有文案） -->
        <text class="field-label">按全局编号指定（兜底，如 000052 / I000052）</text>
        <t-input
          :value="marryRefInput"
          placeholder="填了编号将优先按编号提交"
          class="search-input"
          @update:value="(v: any) => marryRefInput = v"
        />

        <text class="field-label">成婚年份/日期（选填，如 1957 或 1957-12-04）</text>
        <t-input
          :value="marryDate"
          placeholder="留空表示不记录"
          class="search-input"
          @update:value="(v: any) => marryDate = v"
        />

        <view v-if="selectedMarry || marryRefInput.trim()" class="identity-confirm">
          <text v-if="marryRefInput.trim()" class="identity-text">
            将「{{ person?.name }}」{{ marryVerb }}至全局编号「{{ marryRefInput.trim() }}」指定的人物（{{ marryOrdinalHint }}）。
            提交后由对方家族审批。
          </text>
          <text v-else class="identity-text">
            将「{{ person?.name }}」{{ marryVerb }}至 {{ marryTreeName }} 的「{{ selectedMarry?.name }}」（{{ marryOrdinalHint }}）。
            提交后由对方家族审批。
          </text>
        </view>

        <view v-if="marryError" class="edit-error">{{ marryError }}</view>
        <view class="modal-actions">
          <t-button
            theme="primary"
            block
            :loading="marrying"
            :disabled="!selectedMarry && !marryRefInput.trim()"
            @click="doMarry"
          >提交申请</t-button>
          <t-button variant="text" block @click="showMarry = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 删除节点弹窗：选模式 → 先跑 dry_run 拿统计 → 强确认（带 confirm_count）→ 正式提交 -->
    <view v-if="showDelete" class="modal-mask" @click="showDelete = false">
      <view class="modal" @click.stop>
        <text class="modal-title">🗑 删除节点</text>
        <text class="modal-sub">
          将删除「{{ person?.name }}」（{{ personIdDisplay(person?.gramps_id || '') }}）及其相关记录。
        </text>
        <!-- 不可恢复用红色文字表达；此前写 **不可恢复**，星号会被字面显示在页面上 -->
        <text class="del-warn">注意：此操作不可恢复</text>
        <!-- 删除方式：subtree 实际删的是整支后代，措辞与后端 message 统一为「全部后代」 -->
        <text class="field-label">删除方式</text>
        <view
          v-for="m in deleteModes"
          :key="m.value"
          class="del-mode"
          :class="{ selected: deleteMode === m.value }"
          @click="selectDeleteMode(m.value)"
        >
          <text class="del-mode-name">{{ m.label }}</text>
          <text class="del-mode-hint">{{ m.hint }}</text>
        </view>

        <!-- dry_run 结果：人数 / 家族数 / 后端文案（范围说明与「不可恢复」均取后端 message，避免前后端各说一套）；
             扣费按 3 片 / 节点明示，预演本身不扣费（docs/economy-fee.spec.md §3-1 #4–#6） -->
        <view v-if="deletePreview" class="del-stat">
          <text class="del-stat-line">本次将删除 {{ deletePreview.people_count }} 人，消耗 {{ deleteFeePieces }} 片竹片</text>
          <text class="del-stat-line">涉及家族记录 {{ deletePreview.families_count }} 个（以上为预演，本次不扣费）</text>
          <text class="del-stat-line del-stat-msg">{{ deletePreviewText }}</text>
        </view>

        <view v-if="deleteError" class="edit-error">{{ deleteError }}</view>
        <view class="modal-actions">
          <t-button
            theme="danger"
            block
            :loading="deleting"
            @click="startDelete"
          >{{ deletePreview ? '确认删除' : '下一步：查看删除范围' }}</t-button>
          <t-button variant="text" block @click="showDelete = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 汇宗弹窗（docs/branch-clan-ops.spec.md §6-2 / §9-1 / §9-2；仅总编）：
         输入目标节点全局编号/handle → 现算迁移范围与灵气折损 → 二次强确认（H1）→ 带 confirm_people 提交 -->
    <view v-if="showConverge" class="modal-mask" @click="closeConverge">
      <view class="modal" @click.stop>
        <text class="modal-title">⛩ 汇宗（并入他树）</text>
        <text class="modal-sub">把本家族树整体并入另一棵普通家族树中的普通节点之下：源树的家族树登记与树数据将被删除。</text>
        <text class="del-warn">注意：此操作不可恢复</text>

        <text class="field-label">目标节点全局编号 / handle</text>
        <t-input
          :value="convergeTargetId"
          placeholder="如 000052 或 handle"
          class="search-input"
          @update:value="(v: any) => onConvergeTargetChange(v)"
        />
        <text class="field-hint">不做「选目标树」选择器：编号 / handle 由后台解析所属家族树（docs/id-system.spec.md §5）。</text>

        <view v-if="convergeLoading" class="join-tip">读取迁移范围...</view>
        <!-- 迁移范围：当前已加载的树数据现算（口径随行注明）+ 灵气折损预读 -->
        <view v-else-if="convergeRangeReady" class="del-stat">
          <text class="del-stat-line">本次将迁移 {{ convergePeopleCount }} 人、{{ convergeFamiliesCount }} 个家族</text>
          <text class="del-stat-line">口径：当前已加载 {{ convergeLoadedPeople }} 人 / {{ convergeLoadedFamilies }} 个家族（本次打开弹窗时从本树读取；镜像节点不计入迁移人数）</text>
          <text class="del-stat-line del-stat-msg">{{ convergeSpiritLine }}</text>
        </view>

        <!-- 二次强确认：H1 定稿文案（§9-2，逐字；不可逆） -->
        <view v-if="convergeConfirmReady" class="del-stat">
          <text v-for="(line, i) in convergeConfirmLines" :key="i" class="del-stat-line">{{ line }}</text>
        </view>

        <view v-if="convergeError" class="edit-error">{{ convergeError }}</view>
        <view class="modal-actions">
          <t-button
            theme="danger"
            block
            :loading="convergeLoading || converging"
            :disabled="!convergeTargetId.trim()"
            @click="startConvergeClan"
          >{{ convergeConfirmReady ? '确认汇宗' : '下一步：查看汇宗范围' }}</t-button>
          <t-button variant="text" block @click="closeConverge">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 认祖选择器（方式 A）：先选目标上层树（祖谱 / 中华世本），再在该树内搜索真身节点 -->
    <view v-if="showFounderPicker" class="modal-mask" @click="showFounderPicker = false">
      <view class="modal" @click.stop>
        <text class="modal-title">⛩ 认祖（挂到{{ founderTargetKindLabel }}）</text>
        <text class="modal-sub">{{ founderPickerHint }}</text>

        <text class="field-label">选择认祖目标</text>
        <view v-if="founderTargetsLoading" class="join-tip">加载可选祖谱...</view>
        <TreePicker
          v-else
          :items="founderPickerItems"
          :model-value="founderTargetId"
          title="选择认祖目标"
          placeholder="请选择认祖目标"
          @select="selectFounderTarget"
        />

        <template v-if="founderTargetId">
          <text class="field-label">搜索目标树中的真身节点</text>
          <view class="search-row">
            <t-input
              :value="founderQuery"
              placeholder="输入姓名搜索"
              class="search-input"
              @update:value="(v: any) => founderQuery = v"
              @confirm="doSearchFounderTarget"
            />
            <t-button size="small" theme="primary" @click="doSearchFounderTarget">搜索</t-button>
          </view>
          <view v-if="founderSearching" class="join-tip">搜索中...</view>
          <view v-else-if="founderResults.length" class="join-results">
            <view
              v-for="r in founderResults"
              :key="r.handle"
              class="join-result"
              :class="{ selected: selectedFounderTarget?.handle === r.handle }"
              @click="selectedFounderTarget = r"
            >
              <text class="result-name">{{ r.name }}</text>
              <text class="result-id">{{ personIdDisplay(r.gramps_id) }}</text>
              <text class="result-birth">{{ r.birth_date || '' }}</text>
            </view>
          </view>
          <view v-else-if="founderSearched" class="join-tip">未找到匹配节点</view>
        </template>

        <view v-if="selectedFounderTarget" class="identity-confirm">
          <text class="identity-text">
            将本树始祖节点「{{ person?.name }}」认祖挂到 {{ founderTargetName }} 的
            「{{ selectedFounderTarget.name }}」（{{ personIdDisplay(selectedFounderTarget.gramps_id) }}）。
            {{ founderRequestEffectHint }}
          </text>
        </view>

        <view v-if="founderPickerError" class="edit-error">{{ founderPickerError }}</view>
        <view class="modal-actions">
          <t-button
            theme="primary"
            block
            :loading="founderSubmitting"
            :disabled="!selectedFounderTarget"
            @click="doFounderRequest"
          >提交认祖申请</t-button>
          <t-button variant="text" block @click="showFounderPicker = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 直接挂载选择器（方式 B，仅总编辑）：在真身节点上从祖谱清单里选择要挂载的下层树 -->
    <view v-if="showAttachPicker" class="modal-mask" @click="showAttachPicker = false">
      <view class="modal" @click.stop>
        <text class="modal-title">⛩ 挂载祖谱</text>
        <text class="modal-sub">
          在真身节点「{{ person?.name }}」上选择要挂载的祖谱（无需申请，立即生效；该祖谱顶端随即出现世本镜像段）。
        </text>

        <text class="field-label">选择要挂载的祖谱</text>
        <view v-if="attachLoading" class="join-tip">加载祖谱清单...</view>
        <view v-else-if="!attachCandidates.length" class="join-tip">
          暂无祖谱可挂载：请由本姓现有家族树先申请建立祖谱。
        </view>
        <TreePicker
          v-else
          :items="attachPickerItems"
          :model-value="attachTargetId"
          title="选择要挂载的祖谱"
          placeholder="请选择要挂载的祖谱"
          @update:model-value="(v: any) => (attachTargetId = v)"
        />

        <view v-if="attachError" class="edit-error">{{ attachError }}</view>
        <view class="modal-actions">
          <t-button
            theme="primary"
            block
            :loading="attachSubmitting"
            :disabled="!attachTargetId"
            @click="doAttachFounder"
          >确认挂载</t-button>
          <t-button variant="text" block @click="showAttachPicker = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 绝婚 / 合离弹窗：绝婚=男方主动（单方生效）/ 合离=双方自愿（需对方审批）；日期均选填 -->
    <view v-if="showEndMarriage" class="modal-mask" @click="showEndMarriage = false">
      <view class="modal" @click.stop>
        <text class="modal-title">{{ endKind === '绝婚' ? '⚔️ 绝婚（男方主动解除）' : '🤝 合离（双方自愿解除）' }}</text>
        <text class="modal-sub">
          {{ endKind === '绝婚'
            ? '绝婚由男方家族单方发起，立即生效（无需对方审批）；双方树内的配偶关系与镜像节点会被一并清理。'
            : '合离需对方家族确认后生效：提交后进入待审批列表，对方通过即解除。' }}
        </text>
        <text class="field-label">{{ endKind === '绝婚' ? '绝婚' : '合离' }}年份/日期（选填，如 1960 或 1960-03-15）</text>
        <t-input
          :value="endDate"
          placeholder="留空表示不记录"
          class="search-input"
          @update:value="(v: any) => endDate = v"
        />
        <text class="field-label">说明（选填）</text>
        <t-input
          :value="endNote"
          placeholder="如：和离书已立 / 因故绝婚"
          class="search-input"
          @update:value="(v: any) => endNote = v"
        />
        <view v-if="endError" class="edit-error">{{ endError }}</view>
        <view class="modal-actions">
          <t-button theme="primary" block :loading="ending" @click="doEndMarriage">确认{{ endKind }}</t-button>
          <t-button variant="text" block @click="showEndMarriage = false">取消</t-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { fetchPerson, fetchPersonForEdit, savePerson, savePersonPlaces, isLiving, API_BASE, fetchTreeMetaRemote, searchPeople, searchMarriageCandidates, removeBranchLink, reparentNode, deleteNode, marriageRequest, marryEnd, founderRequest, fetchFounderRequests, attachFounder, detachFounder, resetFounder, fetchClans, treeKindLabel, treeKindOf, feeText, isAssetInsufficientError, showAssetInsufficientGuide, fetchPersonList, fetchFamilyList, fetchSpirit, postConvergeClan, mirrorNoteText, mirrorReadonlyViewOf, treeDisplayTitleOf, MAX_RESIDENCE_PLACES, emptyPlaceInput, normalizePlace, prunePlaces, placesDirty, placeDisplayOf } from '@/business';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import type { PersonDetail, PersonSummary } from '@/business/types';
import type { MirrorFields, MirrorReadonlyView, MirrorTarget, MarriageCandidate, PersonPlaceInput } from '@/business';
import type { ClanSummary, FeeInfo, NodeDeleteMode, NodeDeleteResult } from '@/business/api';
import {
  personIdDisplay,
  dateDisplay,
  titleLabel,
  attrMapOf,
  treeDisplayLabel,
  PERSON_REF_HINT,
  PERSON_REF_PLACEHOLDER,
} from '@/business/format';
import { genderIconSrc } from '@/business/icons';
import PersonManagePanel from '@/components/person-manage-panel/person-manage-panel.vue';
import TreePicker from '@/components/tree-picker/tree-picker.vue';
import GeoCascader from '@/components/geo-cascader/geo-cascader.vue';

/**
 * 人物档案面板（共享组件）
 * - mode='page'：作为 /pages/person/detail 页面主体（深链/跨树跳转落点）
 * - mode='modal'：作为 PersonDetailModal 弹窗内容（同树人物互跳不换页）
 * 人物跳转一律 emit 给宿主决定：open-person（同树→弹窗内换人 / 页面→push 详情页）、
 * open-tree（跨树无具体人物 → 打开对应家族树首页）。
 */
const props = withDefaults(defineProps<{
  treeId: string;
  handle: string;
  mode?: 'page' | 'modal';
  /** 是否为树图宿主（启用底部「谱系管理」操作区：加父/加子/拆分等） */
  treeManage?: boolean;
  /**
   * 口径 A 第 3 条：本次打开由「镜像节点」进入（值为该镜像指向的真身目标）。
   * 非空时档案顶部显示「本节点为 (真身树 display_title) (真身全局编号) 的镜像 · 内容取自真身」；
   * 缺省 null = 普通打开，行为与既有一致（普通树与真身节点零影响）。
   */
  mirrorOf?: MirrorTarget | null;
  /**
   * 口径 A 第 5 条兜底：真身内容不可见（404 / 权限不可见 / 网络错）时回退打开镜像本树副本，
   * 由宿主传入提示文案（「真身内容不可见」）；非空时覆盖第 3 条标注。
   */
  mirrorFallbackNote?: string;
}>(), {
  mode: 'page',
  treeManage: false,
  mirrorOf: null,
  mirrorFallbackNote: '',
});

const emit = defineEmits<{
  (e: 'open-person', payload: { treeId: string; handle: string; mirrorOf?: MirrorFields | null }): void;
  (e: 'open-tree', payload: string): void;
  /** 树结构被管理操作修改（加父/加子/拆分等），宿主需刷新树图 */
  (e: 'tree-changed'): void;
  /** 档案加载失败（404 / 权限不可见 / 网络错）——宿主按口径 A 第 5 条决定是否回退到镜像本树副本 */
  (e: 'load-failed'): void;
}>();

// 别名（沿用原页面代码，props 变更时按 :key 整体重挂载，无需 watch）
const treeId = computed(() => props.treeId);
const handle = computed(() => props.handle);

/**
 * 是否中华世本（总谱）树。
 * ⚠️ **声明必须留在 props 别名区**：本文件后段的
 * `watch(handle, () => { … loadAttachedTrees() … }, { immediate: true })` 在 setup 期
 * 同步执行，`loadAttachedTrees()` 读 `isMasterTree.value`；该 computed 原先声明在文件后段
 * （接汇宗逻辑处）→ 触发 TDZ `Cannot access 'isMasterTree' before initialization`，
 * 「始祖挂载」列表首屏加载不出来。故上移到此，语义不变（props.treeId === 'zhonghua'）。
 */
const isMasterTree = computed(() => props.treeId === 'zhonghua');

const person = ref<PersonDetail | null>(null);
const loadError = ref('');

/**
 * 口径 A 第 3/5 条顶部标注文案（空 = 不显示；普通打开与真身节点完全零影响）：
 * - 回退态（`mirrorFallbackNote` 非空，宿主回退到镜像本树副本时传入）→ 直接显示该提示；
 * - 由镜像进入（`mirrorOf` 非空）→ 树名取 tree-meta 的 display_title（cross-tree 模块级缓存一次复用，
 *   不每次点击都请求；取不到回退 tree_id），编号取**当前已加载的真身** gramps_id
 *   —— 故 watcher 必须等档案加载完成（person 就位）后再定最终文案。
 */
const mirrorNote = ref('');
watch(
  [() => props.mirrorOf, () => props.mirrorFallbackNote, () => person.value?.gramps_id],
  async ([target, fallbackNote, gid]) => {
    if (fallbackNote) {
      mirrorNote.value = fallbackNote;
      return;
    }
    if (!target || !gid) {
      mirrorNote.value = '';
      return;
    }
    const title = await treeDisplayTitleOf(target.treeId);
    mirrorNote.value = mirrorNoteText(title, gid);
  },
  { immediate: true },
);

// ---- 扣费闸门文案（docs/economy-fee.spec.md §7 / §8；单价真源在后端 FEE 常量） ----

/** 删除节点单价：3 片 / 节点（subtree = 3 × 人数，promote = 3；docs/economy.spec.md §5-8） */
const DELETE_FEE_PER_PERSON = 3;

/**
 * 改父确认文案：同树改父 1 片 / 节点；跨树整体迁移 9 片 / 次（**与携带后代人数无关**）。
 * 编号已升级为全站唯一（docs/id-system.spec.md §5），前端无法只凭编号判断所属树 →
 * 两种价目一并明示，实际扣费以后端响应的 `fee` 为准。
 */
const REPARENT_FEE_CONFIRM =
  '同树改挂父节点：消耗 1 片竹片。\n' +
  '若该编号属于其它家族树：本次为跨树整体迁移，本次迁移共 9 片（与携带后代人数无关），本节点及其全部后代整体迁入该树。\n' +
  '是否继续？';

const showEdit = ref(false);
const saving = ref(false);
const editError = ref('');
/**
 * 载入编辑表单时的原始值快照（脏比对的基线）：`openEdit` 打开表单那一刻的字段值。
 * `doSave` 先与它比对 —— 完全相同 = 没做任何修改 → 不发 PUT（不扣费、不重写树文件）。
 */
const editBaseline = ref<any>(null);
/** 总谱（中华世本）：节点一律已故，在世字段锁死 */

// ===== 始祖挂载（docs/founder-attach.spec.md）=====
const founderMeta = ref<any>(null);
async function loadFounderMeta() {
  try {
    const meta = await fetchTreeMetaRemote();
    founderMeta.value = Object.values(meta.trees).find((t: any) => t.tree_id === props.treeId) || null;
  } catch { founderMeta.value = null; }
}
/** 本树始祖节点判定：tree-meta 的 founder_handle → founder_gramps_id → I0001 兜底 */
const isFounderNode = computed(() => {
  const h = founderMeta.value?.founder_handle;
  if (h) return h === handle.value;
  const gid = founderMeta.value?.founder_gramps_id;
  // 不再用 'I0001' 兜底：未登记始祖的树不应把 I0001 误判为始祖
  // （无始祖的树由 founderMissing 逻辑允许在任意节点发起认祖）
  return !!gid && (person.value as any)?.gramps_id === gid;
});
/**
 * 本节点的 external_* 指针字段（镜像判据入参；flat 形状与 `@/business` 的 `MirrorFields` 一致）。
 * ⚠️ 真身自身也带 external_*（认祖登记指针 / 婚姻登记）→ **绝不能用「有 external_*」当镜像判据**。
 */
const mirrorFields = computed<MirrorFields>(() => {
  const m = attrMapOf(person.value?.attributes);
  return {
    external_mirror: m['external_mirror'] || '',
    external_tree: m['external_tree'] || '',
    external_person_handle: m['external_person_handle'] || '',
    external_link_type: m['external_link_type'] || '',
  };
});
/**
 * R3 只读视图（**唯一入口**：徽标与只读提示一律取自 `mirrorReadonlyViewOf`，页面不得自拼文案）：
 * **方向无关** —— 家族树 ← 祖谱 / 世本（向上镜像）与祖谱 ← 家族树始祖的登记镜像（向下镜像）都只读；
 * 孤儿镜像（镜像标记在、真身不可达）同样只读（R2b）。
 * 真身（家族树始祖 / 祖谱自有段 / 自建始祖）→ `readonly:false`，本树内不再有只读徽标 / 禁用态（R2）。
 */
const readonlyView = ref<MirrorReadonlyView>({ readonly: false, tag: '', note: '', targetKind: '' });
watch(
  [() => person.value?.attributes, () => treeId.value],
  async () => {
    readonlyView.value = await mirrorReadonlyViewOf(mirrorFields.value, treeId.value);
  },
  { immediate: true },
);
/** 本层是否整节点只读（R3）；唯一例外 = 出生地 / 居住地仍可提交（契约 v2 C6） */
const readonlyMode = computed(() => readonlyView.value.readonly);
/** 外树镜像节点（任意 link_type 的 `external_mirror === 'true'`）→ 不可立支 / 删除须到真身所在家族树 */
const isExternalMirror = computed(() => mirrorFields.value.external_mirror === 'true');
/** 顶端世系链镜像态（external_link_type='chain'）：真身在中华世本，本层只读 → 不可作批量父节点 */
const isChainMirror = computed(() => mirrorFields.value.external_link_type === 'chain');
/**
 * 始祖登记指针（R4）：`external_link_type === 'founder'` 且 `external_tree` 非空 ——
 * 本树始祖已登记到上层树（家族树 → 祖谱；祖谱 → 中华世本）。一树一挂载（后端 `assertOneAttachPerTree`）
 * → 已登记不可再认祖；**与镜像互斥**（真身仍在本树，本树可编辑；R2）。
 */
const founderAttached = computed(
  () =>
    mirrorFields.value.external_link_type === 'founder' &&
    !!String(mirrorFields.value.external_tree || '').trim(),
);
/** 本树尚未指定始祖（tree-meta.founder_state === 'none'） */
const founderMissing = computed(() => founderMeta.value?.founder_state === 'none');
/**
 * 认祖入口（与后端 `canInitiateAttach` + 一树一挂载同口径）：
 * 无始祖态（重置后）→ 任意节点均可发起（语义 = 指定始祖）；否则仅始祖位节点；已登记 → 不再显示。
 * R2b：未登记的始祖是真身（可编辑）→ 不再有「空白占位 / 需先认祖才能编辑」的旧口径。
 */
const canFounderAttach = computed(
  () => canEdit.value && !founderAttached.value && (isFounderNode.value || founderMissing.value),
);
/** 解除登记入口（R2：只清指针，始祖**真身数据保留**在本树，可继续编辑 / 重新认祖） */
const canFounderDetach = computed(() => isFounderNode.value && founderAttached.value && canEdit.value);
/**
 * 重置始祖（本人是始祖位 + 未登记 + 非镜像 + 有编辑权）：
 * 清空本树始祖登记 → 本树回到「无始祖」态（可重新认祖）；已登记 / 镜像须先「解除挂载」
 * （与后端 `assertFounderResettable` 同判据）。
 */
const canFounderReset = computed(
  () => isFounderNode.value && !founderAttached.value && !isExternalMirror.value && canEdit.value,
);

/** 真身侧：本节点被哪些家族树 / 祖谱认作始祖（读侧推导，无反指针） */
const attachedTrees = ref<any[]>([]);
const canAttachFounder = computed(() => isMasterTree.value && authState.role === 'chief_editor');
function attachedTreeLabel(att: any) { return `${treeKindLabel(att.kind)}「${att.tree_title || att.tree_id}」的始祖节点`; }
function goToAttachedTree(att: any) { uni.navigateTo({ url: `/pages/hall/index?tree_id=${att.tree_id}` }); }
async function loadAttachedTrees() {
  if (!isMasterTree.value || !handle.value) return;
  try {
    const res: any = await fetchFounderRequests(props.treeId, getAuthToken(), handle.value);
    // 后端字段为 attachments（读侧推导的挂载树清单：祖谱 / 普通家族树）
    attachedTrees.value = res.attachments || res.attached_trees || [];
  } catch { attachedTrees.value = []; }
}
watch(handle, () => { if (handle.value) loadAttachedTrees(); }, { immediate: true });
loadFounderMeta();

// ---- 认祖目标选择器（docs/founder-attach.spec.md 方式 A / docs/clan-tree.spec.md §5）----
/**
 * 本树层级（tree-meta；与后端 `treeKindOf` 同口径：显式 kind 优先，缺省按 family，`is_master` → master）：
 * - clan（祖谱）→ 认祖目标只能是中华世本
 * - family（普通树）→ 认祖目标只能是祖谱（硬口径 2：不得直挂世本）
 */
const treeKind = computed(() => treeKindOf(founderMeta.value));
const founderTargetKindLabel = computed(() => (treeKind.value === 'clan' ? '中华世本' : '祖谱'));
const founderPickerHint = computed(() =>
  treeKind.value === 'clan'
    ? '祖谱只能认祖到中华世本（总谱）：先选目标，再在世本中搜索始祖节点，提交后待总编审批。'
    : '普通家族树须先认祖到本姓祖谱（不得直挂世本）：选择祖谱 → 搜索祖谱中的始祖节点 → 提交，待该祖谱总编审批。',
);
/**
 * 认祖通过后的效果说明（**不得再写「始祖节点转只读」的旧口径**）：
 * - family（普通家族树）→ 始祖真身仍在本树（本树可继续编辑），祖谱侧生成登记镜像（R2 / R4）；
 * - clan（祖谱）→ 本谱顶端出现世本镜像段，镜像节点只读（真身在中华世本）。
 */
const founderRequestEffectHint = computed(() =>
  treeKind.value === 'clan'
    ? '提交后由该层总编审批；通过后本谱顶端出现世本镜像段（镜像节点只读，真身在中华世本）。'
    : '提交后由该祖谱总编审批；通过后本树始祖登记到该祖谱（始祖真身仍在本树，可继续编辑）。',
);

interface FounderTargetOption { tree_id: string; label: string; kind?: string }

const showFounderPicker = ref(false);
const founderTargets = ref<FounderTargetOption[]>([]);
/** 认祖目标 tree-picker items：group 取 kind（clan=祖谱 / master=中华世本 / 缺省兜底家族树）；tree_id 已由列表项右侧直显，不再冗余进 sub */
const founderPickerItems = computed(() => founderTargets.value.map((t) => ({
  tree_id: t.tree_id,
  label: t.label,
  group: treeKindLabel(t.kind),
})));
const founderTargetsLoading = ref(false);
const founderTargetId = ref('');
const founderTargetName = ref('');
const founderQuery = ref('');
const founderResults = ref<PersonSummary[]>([]);
const founderSearching = ref(false);
const founderSearched = ref(false);
const selectedFounderTarget = ref<PersonSummary | null>(null);
const founderSubmitting = ref(false);
const founderPickerError = ref('');

/** 认祖入口（选择器）：祖谱 → 列中华世本；普通树 → 列可选祖谱（GET /admin/clans） */
async function openFounderAttach() {
  founderPickerError.value = '';
  founderQuery.value = '';
  founderResults.value = [];
  founderSearched.value = false;
  selectedFounderTarget.value = null;
  founderTargetId.value = '';
  founderTargetName.value = '';
  showFounderPicker.value = true;
  founderTargetsLoading.value = true;
  try {
    if (treeKind.value === 'clan') {
      founderTargets.value = [{ tree_id: 'zhonghua', label: '中华世本 · 全球华人家谱总谱', kind: 'master' }];
      founderTargetId.value = 'zhonghua';
      founderTargetName.value = '中华世本（总谱）';
    } else {
      const surname = founderMeta.value?.surname_char || founderMeta.value?.surname || '';
      const clans: ClanSummary[] = await fetchClans(surname);
      founderTargets.value = clans.map((c) => ({
        tree_id: c.tree_id,
        label: `${treeDisplayLabel(c.tree_title, c.surname || surname)}${c.attached_to_master ? '' : '（未认祖世本）'}`,
        // kind 用于 tree-picker 分组；ClanSummary 未声明该字段 → 运行时按存在读取，缺省由兜底分组处理
        kind: (c as ClanSummary & { kind?: string }).kind,
      }));
      if (!clans.length) {
        founderPickerError.value = surname
          ? `本姓（${surname}氏）尚无祖谱：请先申请建立祖谱，再将本树始祖认祖到该祖谱。`
          : '暂无祖谱可认祖：请先申请建立本姓祖谱。';
      }
    }
  } catch (e: any) {
    founderPickerError.value = e?.message || '加载认祖目标失败';
  } finally {
    founderTargetsLoading.value = false;
  }
}

function selectFounderTarget(t: FounderTargetOption) {
  founderTargetId.value = t.tree_id;
  founderTargetName.value = t.label;
  founderQuery.value = '';
  founderResults.value = [];
  founderSearched.value = false;
  selectedFounderTarget.value = null;
}

/** 在目标上层树内搜索真身节点（复用树内搜索接口，按目标 tree_id 隔离） */
async function doSearchFounderTarget() {
  if (!founderTargetId.value) return;
  const q = founderQuery.value.trim();
  if (!q) {
    founderPickerError.value = '请输入姓名关键字';
    return;
  }
  founderSearching.value = true;
  founderSearched.value = true;
  founderPickerError.value = '';
  selectedFounderTarget.value = null;
  try {
    const res = await searchPeople({ query: q, tree_id: founderTargetId.value });
    founderResults.value = res.people;
  } catch (e: any) {
    founderPickerError.value = e?.message || '搜索失败';
    founderResults.value = [];
  } finally {
    founderSearching.value = false;
  }
}

/** 提交认祖申请（写 pending，目标树的 chief_editor 审批后建立镜像） */
async function doFounderRequest() {
  const token = getAuthToken();
  if (!token) {
    founderPickerError.value = '登录已过期，请重新登录';
    return;
  }
  const target = selectedFounderTarget.value;
  if (!target) return;
  founderSubmitting.value = true;
  founderPickerError.value = '';
  try {
    const res = await founderRequest(
      props.treeId,
      { person_handle: handle.value, master_handle: target.handle, target_tree_id: founderTargetId.value },
      token,
    );
    showFounderPicker.value = false;
    uni.showModal({
      title: '认祖申请已提交',
      content: res?.message || '等待上层总编审批后生效。',
      showCancel: false,
      confirmText: '知道了',
    });
  } catch (e: any) {
    founderPickerError.value = e?.message || '提交认祖申请失败';
  } finally {
    founderSubmitting.value = false;
  }
}

// ---- 直接挂载选择器（方式 B，仅总编辑；真身侧）----
const showAttachPicker = ref(false);
const attachCandidates = ref<ClanSummary[]>([]);
/** 挂载祖谱 tree-picker items：sub = 自有 N 人 · 已认祖世本/未认祖世本（tree_id 已由右侧直显，不重复）；候选全是祖谱 → 恒分「祖谱」组 */
const attachPickerItems = computed(() => attachCandidates.value.map((c) => ({
  tree_id: c.tree_id,
  label: treeDisplayLabel(c.tree_title, c.surname),
  sub: `自有 ${c.own_count} 人${c.attached_to_master ? ' · 已认祖世本' : ' · 未认祖世本'}`,
  group: '祖谱',
})));
const attachLoading = ref(false);
const attachTargetId = ref('');
const attachSubmitting = ref(false);
const attachError = ref('');

/** 挂载入口（选择器）：普通树不得直挂世本 → 候选仅为祖谱清单 */
async function openAttachFounder() {
  attachError.value = '';
  attachTargetId.value = '';
  showAttachPicker.value = true;
  attachLoading.value = true;
  try {
    attachCandidates.value = (await fetchClans()).filter((c) => c.tree_id !== props.treeId);
  } catch (e: any) {
    attachCandidates.value = [];
    attachError.value = e?.message || '加载祖谱清单失败';
  } finally {
    attachLoading.value = false;
  }
}

async function doAttachFounder() {
  const token = getAuthToken();
  if (!token) {
    attachError.value = '登录已过期，请重新登录';
    return;
  }
  if (!attachTargetId.value) return;
  attachSubmitting.value = true;
  attachError.value = '';
  try {
    const res = await attachFounder(
      props.treeId,
      { master_handle: handle.value, tree_id: attachTargetId.value, target_tree_id: props.treeId },
      token,
    );
    showAttachPicker.value = false;
    // 文案统一取后端 message（「已认祖：… 始祖登记至…（本树始祖仍可编辑）」）：
    // 真源反转后不得再自拼「该祖谱进入只读镜像」的旧口径（R2）。
    uni.showModal({
      title: '挂载成功',
      content: res?.message || '已挂载',
      showCancel: false,
      confirmText: '知道了',
    });
    await loadAttachedTrees();
    emit('tree-changed');
  } catch (e: any) {
    attachError.value = e?.message || '挂载失败';
  } finally {
    attachSubmitting.value = false;
  }
}
/**
 * 解除始祖登记（双方均可，无需申请，立即生效；R2）：只清登记指针 ——
 * 始祖**真身数据保留**在本树（可继续编辑，也可重新认祖）。
 */
function detachFounderHere(att?: any) {
  uni.showModal({
    title: '解除始祖挂载',
    content: att
      ? `确定解除「${att.tree_title || att.tree_id}」的始祖登记？解除后该树始祖真身数据保留（可继续编辑，也可重新认祖）。`
      : '确定解除本树的始祖登记？解除后始祖真身数据保留（可继续编辑，也可重新认祖）。',
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        const res = await detachFounder(
          props.treeId,
          att ? { attached_tree_id: att.tree_id, master_handle: handle.value } : { person_handle: handle.value },
          getAuthToken(),
        );
        // 文案统一取后端 message（「已解除始祖登记：… 始祖真身数据保留…」）
        uni.showModal({
          title: '已解除始祖登记',
          content: res?.message || '已解除挂载',
          showCancel: false,
          confirmText: '知道了',
        });
        if (att) await loadAttachedTrees();
        emit('tree-changed');
      } catch (e: any) {
        uni.showModal({ title: '解除失败', content: e?.message || '请稍后重试', showCancel: false });
      }
    },
  });
}

/**
 * 重置始祖：清空本树始祖登记（只写 tree-meta）→ 本树回到「无始祖」态。
 * 始祖节点本身不变（仍是可编辑的普通节点）；重置后可在任意节点用「⛩ 认祖」重新指定。
 */
function resetFounderHere() {
  const who = person.value?.name || '本节点';
  uni.showModal({
    title: '重置始祖',
    content: `确定重置本树始祖？重置后本家族树暂无始祖，可在任意节点用「⛩ 认祖」重新指定；节点「${who}」本身仍是可编辑的普通节点。`,
    success: async (r: any) => {
      if (!r.confirm) return;
      const token = getAuthToken();
      if (!token) {
        uni.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
        return;
      }
      try {
        await resetFounder(props.treeId, { person_handle: handle.value }, token);
        uni.showToast({ title: '已重置始祖', icon: 'success' });
        // 重新读 tree-meta（fetchTreeMetaRemote 直取，无缓存）→ 页面立即变为「无始祖」态
        await loadFounderMeta();
        emit('tree-changed');
      } catch (e: any) {
        uni.showModal({ title: '重置失败', content: e?.message || '请稍后重试', showCancel: false });
      }
    },
  });
}

// ===== 汇宗（本树整体并入他树；docs/branch-clan-ops.spec.md §6-2 / §9-1 / §9-2 / §8-2）=====

/**
 * 汇宗入口可见性（§9-1 显示条件 / R5 放宽口径）：**仅 chief_editor**（与上方「⛩ 认祖 / 挂载祖谱」的
 * `canAttachFounder` 同一写法：直取 `authState.role`），且本节点为始祖位、**源树是普通家族树**
 * （总谱 / 祖谱一律 400，不显示注定失败的入口）。
 * R5：源树始祖是镜像或**真身**都放行（后端已放宽 —— 真身在家族树即真源，作为真实节点整体迁入），
 * 故不再要求「始祖为镜像」。
 */
const canConvergeClan = computed(
  () => authState.role === 'chief_editor' && isFounderNode.value && treeKind.value === 'family',
);

/**
 * 汇宗折损比例（**仅供提交前预估展示**；真源 = 后端 `jiazu_wallets.config.converge_spirit_ratio`，
 * 默认 0.5 = 50%，§5-4；实际折损天数以响应 `spirit` 为准）。
 */
const CONVERGE_SPIRIT_RATIO = 0.5;

/** 源树展示名（§9-2 H1/H2 的「【源树名】」；tree-meta 读取失败时回落 tree_id） */
const convergeSourceTitle = computed(() => founderMeta.value?.display_title || treeId.value);

const showConverge = ref(false);
const convergeTargetId = ref('');
const convergeLoading = ref(false);
const converging = ref(false);
const convergeError = ref('');
/** 迁移范围是否已现算（false = 需先点「下一步：查看汇宗范围」） */
const convergeRangeReady = ref(false);
/** 二次强确认（H1）是否已展示 */
const convergeConfirmReady = ref(false);
/** 源树当前已加载的节点数 / 家族数（口径：本次读取到的已加载数据，见弹窗内说明） */
const convergeLoadedPeople = ref(0);
const convergeLoadedFamilies = ref(0);
/** 将迁移人数（提交时作为 `confirm_people`；镜像节点不计入，§6-2-5） */
const convergePeopleCount = ref(0);
/** 将迁移家族数 */
const convergeFamiliesCount = ref(0);
/** 灵气折损预读（GET /spirit?tree_id=<源树>，guest 可读）：days_left × 比例上取整；取不到 → null */
const convergeSpiritPreview = ref<{ daysLeft: number; ratioPercent: number; transferredDays: number } | null>(null);

/** 折损提示行（取不到灵气状态时退化为「灵气折损按后台比例并入」，不臆造天数） */
const convergeSpiritLine = computed(() => {
  const p = convergeSpiritPreview.value;
  if (!p) return '灵气折损按后台比例并入目标树';
  return `源树灵气剩余 ${p.daysLeft} 天，按 ${p.ratioPercent}% 折损后为 ${p.transferredDays} 天（并入目标树，实际以响应回执为准）`;
});

/**
 * H1 汇宗不可逆确认（§9-2 定稿文案，**逐字使用**；` / ` = 换行）。
 * 口径：目标节点姓名 / 目标树名在**提交前无法解析**（`target_person_id` 由后端 `resolveNode` 识别所属树）
 * → 该处填用户输入的编号 / handle；【目标树灵气到期时间】同理未知，按规格原样保留其条件分支说明。
 */
const convergeConfirmLines = computed<string[]>(() => {
  const srcName = convergeSourceTitle.value;
  const target = convergeTargetId.value.trim() || '（未填）';
  const p = convergeSpiritPreview.value;
  const spiritSentence = p
    ? `源树灵气剩余${p.daysLeft}天，按${p.ratioPercent}%折损后为${p.transferredDays}天，将累加到目标树的灵气到期时间（目标树未镶嵌石榴籽玉时改为：目标树尚未镶嵌石榴籽玉，源树灵气不并入）`
    : '灵气折损按后台比例并入目标树';
  return [
    '⚠️ 不可逆操作确认',
    `本次【汇宗】将把家族树「${srcName}」整体并入「${target}」之下：源树全部人物与家族迁移到目标节点下（编号不变），源树的家族树登记与树数据将被删除，原树不再存在，且不可恢复。`,
    `${spiritSentence}；源树已镶嵌的石榴籽玉随树作废，不返还、不可重镶。`,
    `本次操作不消耗竹片与石榴籽。本次将迁移${convergePeopleCount.value}人、${convergeFamiliesCount.value}个家族。`,
    '是否确认汇宗？',
  ];
});

function openConvergeClan() {
  showConverge.value = true;
  convergeTargetId.value = '';
  convergeError.value = '';
  convergeRangeReady.value = false;
  convergeConfirmReady.value = false;
  convergePeopleCount.value = 0;
  convergeFamiliesCount.value = 0;
  convergeLoadedPeople.value = 0;
  convergeLoadedFamilies.value = 0;
  convergeSpiritPreview.value = null;
}

function closeConverge() {
  showConverge.value = false;
  convergeConfirmReady.value = false;
  convergeError.value = '';
}

/** 目标改变 → 上次的范围与强确认作废（须重新「下一步」），取消不发请求 */
function onConvergeTargetChange(v: string) {
  convergeTargetId.value = v;
  convergeRangeReady.value = false;
  convergeConfirmReady.value = false;
  convergeError.value = '';
}

/**
 * 现算迁移范围：**只取当前已加载的树数据**（源树 nodes / families 读接口）+ 灵气折损预读。
 * 口径：人数 = 已加载节点中 `external_mirror !== 'true'` 的真实节点数（镜像节点不随迁，§6-2-5）；
 * 家族数 = 已加载的家族记录数。若范围与实际不一致，后端 409「范围已变化」→ 重新确认。
 */
async function loadConvergeRange() {
  convergeLoading.value = true;
  convergeError.value = '';
  try {
    const [people, families] = await Promise.all([
      fetchPersonList(treeId.value, 0, 0),
      fetchFamilyList(treeId.value),
    ]);
    const loaded = people.data || [];
    const real = loaded.filter((p) => p.external_mirror !== 'true');
    convergeLoadedPeople.value = loaded.length;
    convergeLoadedFamilies.value = families.length;
    convergePeopleCount.value = real.length;
    convergeFamiliesCount.value = families.length;
    convergeRangeReady.value = true;
  } catch (e: any) {
    convergeRangeReady.value = false;
    convergeError.value = e?.message || '读取迁移范围失败';
  } finally {
    convergeLoading.value = false;
  }
  // 灵气折损预读（guest 可读；失败只提示「按后台比例并入」，不臆造天数）
  try {
    const spirit = await fetchSpirit(treeId.value);
    const daysLeft = Math.max(0, Number(spirit.days_left) || 0);
    convergeSpiritPreview.value = {
      daysLeft,
      ratioPercent: Math.round(CONVERGE_SPIRIT_RATIO * 100),
      transferredDays: Math.ceil(daysLeft * CONVERGE_SPIRIT_RATIO),
    };
  } catch {
    convergeSpiritPreview.value = null;
  }
}

/**
 * 两段式汇宗（与既有删除节点同思路）：
 * ① 未取范围 → 先现算「将迁移人数 / 家族数 / 折损天数」；
 * ② 已展示 H1 强确认 → 带 `confirm_people` 提交（范围在两步之间变化 → 后端 409 `DELETE_SCOPE_CHANGED`，
 *    文案由后端下发（H3 定稿），前端保持在弹窗内并重新拉取范围）；
 * ③ 成功（200）→ H2 结果 + 新归属（目标树 id + 目标节点 handle）+ 「前往目标家族树」。
 * 取消一律**不发请求**（§9-1）。
 */
async function startConvergeClan() {
  const target = convergeTargetId.value.trim();
  if (!target) {
    convergeError.value = '请输入目标节点的全局编号或 handle';
    return;
  }
  const token = getAuthToken();
  if (!token) {
    convergeError.value = '登录已过期，请重新登录';
    return;
  }
  if (!convergeConfirmReady.value) {
    await loadConvergeRange();
    if (!convergeRangeReady.value) return;
    convergeConfirmReady.value = true;
    return;
  }

  converging.value = true;
  convergeError.value = '';
  try {
    const res = await postConvergeClan(treeId.value, target, convergePeopleCount.value);
    showConverge.value = false;
    // H2 汇宗成功（定稿文案逐字）+ 目标树未镶嵌玉时的 skipped_reason 提示 + 新归属
    const skipped = res.spirit?.skipped_reason ? `\n${res.spirit.skipped_reason}` : '';
    const newHome = `新归属：目标家族树「${res.target_tree_id}」· 目标节点 ${res.target_handle}`;
    const h2 = `汇宗完成：已把「${convergeSourceTitle.value}」并入「${target}」之下，迁移${res.moved_people}人、${res.moved_families}个家族；灵气并入${res.spirit?.transferred_days ?? 0}天`;
    uni.showToast({ title: `${h2}（${newHome}）`, icon: 'none', duration: 4000 });
    uni.showModal({
      title: '汇宗完成',
      content: `${h2}${skipped}\n${newHome}`,
      confirmText: '前往目标家族树',
      cancelText: '留在本页',
      success: (r: any) => {
        if (r.confirm) uni.navigateTo({ url: `/pages/hall/index?tree_id=${res.target_tree_id}` });
      },
    });
    // 源树已不存在（§3-9）：档案显示汇宗结果，宿主刷新树图
    person.value = null;
    loadError.value = `本家族树已【汇宗】并入目标家族树「${res.target_tree_id}」（原树不再存在）`;
    emit('tree-changed');
  } catch (e: any) {
    // H3 汇宗范围变化（409 DELETE_SCOPE_CHANGED，文案由后端下发）：留在弹窗内重新确认
    if (e?.code === 'DELETE_SCOPE_CHANGED' || /范围已变化/.test(e?.message || '')) {
      convergeError.value = e?.message || '汇宗范围已变化，请重新确认';
      convergeConfirmReady.value = false;
      await loadConvergeRange();
      return;
    }
    const msg = e?.message || '汇宗失败';
    convergeError.value = msg;
    if (/引用|关联|家族树|始祖|镜像|权限/.test(msg)) {
      uni.showModal({ title: '汇宗被拒绝', content: msg, showCancel: false });
    }
  } finally {
    converging.value = false;
  }
}

// ===== 删除节点（危险区；总谱 / 始祖 / 镜像不可删；跨树引用一律拒绝，不级联改对方树）=====
/**
 * 指向世本（总谱）的始祖指针（历史数据）：`external_link_type='founder'` 且 `external_tree === 世本`。
 * 后端 `assertNotFounderMirror`（结构写路径）与删除路径同一判据 → 前端删除闸门必须同口径，
 * 不得只靠 `isFounderNode`（登记指针指向别树的始祖节点也要拦住）。
 */
const isFounderPointerToMaster = computed(
  () =>
    mirrorFields.value.external_link_type === 'founder' &&
    String(mirrorFields.value.external_tree || '').trim() === 'zhonghua',
);
/** 祖谱（tree-meta.kind='clan'）：自有支系常是多棵普通家族树的认祖落点，删除风险高 */
const isClanTree = computed(() => treeKind.value === 'clan');
/**
 * 在世状态锁死：总谱（中华世本）**或**祖谱节点一律「已故」（新建/保存均强制 false，后端同口径保证）。
 * 普通家族树不受影响（仍可编辑在世状态）。
 */
const livingLocked = computed(() => isMasterTree.value || isClanTree.value);
const livingLockTag = computed(() => (isMasterTree.value ? '已故（总谱锁定）' : '已故（本谱锁定）'));
const livingLockHint = computed(() =>
  isMasterTree.value ? '总谱节点一律为「已故」，此字段不可修改' : '祖谱节点一律为「已故」，此字段不可修改',
);
const canDeleteNode = computed(
  () =>
    canEdit.value &&
    treeId.value !== 'zhonghua' &&
    !isFounderNode.value &&
    !isFounderPointerToMaster.value &&
    !isExternalMirror.value &&
    // 祖谱：删支系节点风险较高（下级树的认祖落点）→ 仅总编可见；普通家族树维持 canEdit 口径
    (!isClanTree.value || authState.role === 'chief_editor'),
);

interface DeleteModeOption { value: NodeDeleteMode; label: string; hint: string }
/** 两种删除模式（默认 = 连全部后代一起删） */
const deleteModes: DeleteModeOption[] = [
  {
    value: 'subtree',
    label: '删除本节点及全部后代（默认）',
    hint: '本人连同全部后代一并删除（家族记录同时清理），不可恢复',
  },
  {
    value: 'promote',
    label: '仅删除本节点，子节点上提一级',
    hint: '① 配偶健在时：子女留在原家族（只清本人槽位）；② 本人是该家族唯一家长时：子女上提一级并入父母的家族（本人是根节点则子女成为根）',
  },
];
const showDelete = ref(false);
const deleteMode = ref<NodeDeleteMode>('subtree');
/** dry_run 统计结果（点「下一步」后填充；模式切换即作废，须重新预览） */
const deletePreview = ref<NodeDeleteResult | null>(null);
const deleteError = ref('');
const deleting = ref(false);

/**
 * dry_run 范围文案 = **后端 message（单一真源）**。
 * 后端 deleteNode 的 dry_run message 已按 promoteChildrenUp 的实际行为分支：
 * ① promote 且 0 人上提 → 「子女留在原家族（配偶健在时只清本人槽位）」
 * ② promote 且 N 人上提 → 「子节点上提一级：N 人（并入父母的家族 / 成为根节点）」
 * ③ subtree → 「及其全部后代共 N 人（含 N 个家族记录）」
 * 前端不再自行拼同义文案（此前两处口径不一致，0 人上提时前端与后端各说一套）。
 */
const deletePreviewText = computed(() => deletePreview.value?.message || '');

/** 待删人数的扣费片数：后端 dry_run 的 `fee.pieces` 为真源；缺失时按单价自算（3 片 / 节点） */
const deleteFeePieces = computed(
  () => deletePreview.value?.fee?.pieces ?? (deletePreview.value?.people_count ?? 0) * DELETE_FEE_PER_PERSON,
);

/** 正式提交将扣的费（弹窗内明示；dry_run 本身免费）：fee 缺失时不显示余量，避免自造余额 */
const deleteFeeText = computed(() => {
  const p = deletePreview.value;
  if (!p) return '';
  return p.fee ? feeText(p.fee) : `本次消耗 ${deleteFeePieces.value} 片竹片`;
});

function openDelete() {
  deleteError.value = '';
  deletePreview.value = null;
  deleteMode.value = 'subtree';
  showDelete.value = true;
}

function selectDeleteMode(m: NodeDeleteMode) {
  if (deleteMode.value === m) return;
  deleteMode.value = m;
  // 范围随模式变化 → 上次统计作废，必须重新 dry_run
  deletePreview.value = null;
  deleteError.value = '';
}

/**
 * 两段式删除：
 * ① 未取统计 → 先 dry_run（只算不写）拿到 people_count/families_count/promoted 清单；
 * ② 已有统计 → uni.showModal 强确认（文案写清人数与「不可恢复」）→ 带 confirm_count 正式提交
 *    （范围在两步之间被人改动 → 后端 409 拒绝，须重新预览）。
 */
async function startDelete() {
  const token = getAuthToken();
  if (!token) {
    deleteError.value = '登录已过期，请重新登录';
    return;
  }
  deleting.value = true;
  deleteError.value = '';
  try {
    if (!deletePreview.value) {
      deletePreview.value = await deleteNode(treeId.value, handle.value, deleteMode.value, token, { dry_run: true });
      return;
    }
    const preview = deletePreview.value;
    // 强确认文案 = 后端 dry_run message（同一真源）+ 本次扣费行（docs/economy-fee.spec.md §7）
    const confirmLines = [preview.message || '将永久删除该节点及其相关记录，不可恢复。'];
    if (deleteFeeText.value) confirmLines.push(deleteFeeText.value);
    const content = confirmLines.join('\n');
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '⚠️ 删除不可恢复',
        content,
        confirmText: '永久删除',
        cancelText: '取消',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    const res = await deleteNode(treeId.value, handle.value, deleteMode.value, token, {
      confirm_count: preview.people_count,
    });
    showDelete.value = false;
    // 成功提示直接用后端 message（与 promoteChildrenUp 实际行为一致；前端不再自行拼 0 人上提的文案）
    // 扣费回执（3 片 / 节点）追加在提示里；后端未返回 fee 时不追加，避免自造数字
    const okMsg = res.message || '已删除';
    uni.showToast({
      title: res.fee ? `${okMsg}（${feeText(res.fee)}）` : okMsg,
      icon: 'none',
      duration: 3200,
    });
    // 本人已被删除 → 档案显示删除结果（宿主刷新树图）
    person.value = null;
    loadError.value = `节点「${res.person_name}」已删除（共 ${res.people_count} 人）`;
    emit('tree-changed');
  } catch (e: any) {
    const msg = e?.message || '删除失败';
    deleteError.value = msg;
    // 竹片不足（409 ASSET_INSUFFICIENT）：文案不隐藏 + 「如何获得竹片」清单 + 引导「我的资产」；
    // 删除弹窗保持打开（可充值后在弹窗内重试），不静默失败
    if (isAssetInsufficientError(e)) {
      showAssetInsufficientGuide(e, { extra: deleteFeeText.value, title: '竹片不足' });
      return;
    }
    // 跨树引用 / 结构校验失败等：后端已拒绝（两棵树都不写）→ 弹窗说明，保留在弹窗内可改模式重试
    if (/引用|关联|家族树|始祖|镜像|权限|范围已变化/.test(msg)) {
      uni.showModal({ title: '删除被拒绝', content: msg, showCancel: false });
    }
  } finally {
    deleting.value = false;
  }
}

// ===== 编号复制（档案页「编号」行）=====

/** 复制本节点全局编号（去掉 I 前缀展示值，粘贴即可用于各「编号」输入框） */
function copyPersonId() {
  const text = personIdDisplay(person.value?.gramps_id || '');
  if (!text) {
    uni.showToast({ title: '暂无编号', icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: `已复制编号 ${text}`, icon: 'success' }),
  });
}

const editForm = ref({
  first_name: '',
  surname: '',
  gender: 'U',
  birth_date: '',
  /** 出生地（契约 v2：结构化码真源 + 备注；展示串由后端按码派生） */
  birth_place: emptyPlaceInput(),
  is_living: true, // 默认健在
  death_date: '',
  /** 居住地（多条，最多 MAX_RESIDENCE_PLACES 条；顺序即展示顺序；空条目保存时丢弃） */
  residence_places: [] as PersonPlaceInput[],
  hao: '',
  feng: '',
  shi: '',
  /** 改挂父节点：填全局编号（如 000052）/ handle；留空 = 不改。
   *  编号属于别的家族树 → 自动跨树迁移（后端按全局编号识别所属树，无需选目标树） */
  parent_id: '',
  events: [] as Array<{ type: string; date: string; place: string }>,
});

// >>> DIRTY-DIFF 编辑脏比对（纯函数；与后端 lib/economy-fee.js 的 personValueDiff 同口径）
/** 归一化：字符串 trim；`''` / `undefined` / `null` 视为同一空值 */
function editNorm(v: any): string {
  return v === undefined || v === null ? '' : String(v).trim();
}
/**
 * 编辑表单是否与载入时的原始值不同。只比人物内容字段（姓名 / 性别 / 生卒 / 健在 / 称号三字段 /
 * 出生地 / 居住地），与后端 `personValueDiff` 同一口径；**父节点编号不在本函数内**（改父走 reparent，
 * 另有变更判定）——因此「只改父编号」时本函数返回 false、但保存流程仍必须继续执行 reparent，绝不吞掉改父。
 */
function personEditDirty(cur: any, base: any): boolean {
  if (!base) return true; // 无基线（异常路径）→ 按「有改动」处理，绝不吞掉一次保存
  const liveOf = (f: any) => f?.is_living === true;
  const genderOf = (f: any) => editNorm(f?.gender).toUpperCase();
  // 健在 ⇒ 保存时不写卒年（与 doSave / 后端 applyLifespan 同口径）→ 卒年按空值比对
  const deathOf = (f: any) => (liveOf(f) ? '' : editNorm(f?.death_date));
  for (const k of ['surname', 'first_name', 'hao', 'feng', 'shi']) {
    if (editNorm(cur?.[k]) !== editNorm(base?.[k])) return true;
  }
  if (genderOf(cur) !== genderOf(base)) return true;
  if (editNorm(cur?.birth_date) !== editNorm(base?.birth_date)) return true;
  if (deathOf(cur) !== deathOf(base)) return true;
  if (liveOf(cur) !== liveOf(base)) return true;
  // 出生地 / 居住地（契约 v2）：逐项 + 条数比对；空条目两侧先丢弃，故「只加了一行空行」不算改动
  if (placesDirty([cur?.birth_place], [base?.birth_place])) return true;
  if (placesDirty(cur?.residence_places, base?.residence_places)) return true;
  return false;
}
/**
 * 深拷贝编辑表单（脏比对基线专用）。
 *
 * **必须深拷贝**：表单里的 `birth_place` / `residence_places` / `events` 都是对象/数组，
 * 而表单写入一律是**原地赋值**（`editForm.birth_place.origin_code = v`、
 * `editForm.residence_places[i].note = v`、`addResidence()` 的 `push`）。
 * 若基线用浅拷贝 `{ ...editForm.value }` ⇒ 基线与表单共享同一批子对象引用，
 * 被同步原地改写 ⇒ `placesDirty` 恒判「无改动」⇒ 单独改出生地/居住地被「未做修改」吞掉。
 *
 * 只处理纯数据（对象 / 数组 / 原始值），递归复制；**保留值为 `undefined` 的键**
 * （不像 JSON 往返那样丢键或把 `undefined` 变 `null` 而制造新的假脏），
 * 且不依赖 `structuredClone`（小程序端无此 API）。
 */
function cloneFormDeep<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => cloneFormDeep(x)) as unknown as T;
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) out[k] = cloneFormDeep(src[k]);
  return out as unknown as T;
}

// <<< DIRTY-DIFF

// 出嫁状态（跨树联姻软链接）
const showMarry = ref(false);
const marryTrees = ref<Array<{ tree_id: string; display_title: string; surname_char: string; kind?: string }>>([]);
/** tree-picker items：label = 树展示名，group 按 kind（clan → 祖谱，其余 → 家族树）；tree_id 已由列表项右侧直显，不再冗余进 sub */
const marryTreeItems = computed(() => marryTrees.value.map((t) => ({
  tree_id: t.tree_id,
  label: treeDisplayLabel(t.display_title, t.surname_char),
  group: treeKindLabel(t.kind),
})));
const marryTreeId = ref('');
const marryTreeName = ref('');
const marryQuery = ref('');
const marryResults = ref<MarriageCandidate[]>([]);
const marrySearching = ref(false);
const marrySearched = ref(false);
const selectedMarry = ref<MarriageCandidate | null>(null);
const marrying = ref(false);
const marryError = ref('');
/**
 * 搜索无结果提示（**必须区分三态**；此前只有一句「未找到…节点」= 本缺陷的可见性黑洞）：
 * ① 401（未登录 / 登录过期）→「登录已过期，请重新登录」
 * ② 通道错误（非 401）→ 后端错误文案原文
 * ③ 确实无匹配（200 空）→「未找到符合条件的女性/男性节点」
 */
const marrySearchNote = ref('');
/** 兜底入口：按全局编号指定（填了编号 → 提交时**编号优先**，见 doMarry） */
const marryRefInput = ref('');
/** 成婚年份/日期（选填） */
const marryDate = ref('');

/** 嫁出（女）/ 娶入（男）：方向由本人性别决定 */
const marryDirection = computed<'out' | 'in'>(() => (person.value?.gender === 'M' ? 'in' : 'out'));
const marryVerb = computed(() => (marryDirection.value === 'in' ? '娶' : '嫁'));
const marryTitle = computed(() => (marryDirection.value === 'in' ? '娶入（从其他家族树迎娶）' : '嫁出（嫁到其他家族树）'));
/** 本次是第几次（依据已记录的婚姻序号：≥1 → 再嫁/再娶） */
const marryOrdinalHint = computed(() => {
  const n = Number(person.value?.attributes?.find((a) => a.key === 'external_marriage_no')?.value) || 0;
  return n >= 1 ? `再${marryVerb.value}（第 ${n + 1} 次）` : `初${marryVerb.value}`;
});

// ---- 绝婚 / 合离（跨树婚姻解除）----
const showEndMarriage = ref(false);
const endKind = ref<'绝婚' | '合离'>('合离');
const endDate = ref('');
const endNote = ref('');
const ending = ref(false);
const endError = ref('');

/** 跨树婚姻信息（嫁出/娶入写入的指针字段；含结束历史） */
const crossMarriage = computed(() => {
  const map = attrMapOf(person.value?.attributes);
  if (!map['external_person_handle'] || !map['external_tree']) return null;
  const linkType = map['external_link_type'] || '';
  // 有效婚姻：link_type=marriage 即视为有效（旧版出嫁链接没有 marriage_id，也属有效，可经绝婚/合离收尾）
  const active = linkType === 'marriage';
  const no = Number(map['external_marriage_no']) || 0;
  const verb = person.value?.gender === 'M' ? '娶' : '嫁';
  const ordinal = no >= 2 ? `再${verb}（第 ${no} 次）` : no === 1 ? `初${verb}` : '';
  const treeLabel = map['external_tree'];
  const title = `配偶（外树 ${treeLabel}）`;
  const bits: string[] = [];
  if (ordinal) bits.push(ordinal);
  if (map['external_marriage_date']) bits.push(`成婚 ${map['external_marriage_date']}`);
  if (!active && map['external_marriage_end_kind']) {
    bits.push(`${map['external_marriage_end_kind']}${map['external_marriage_end_date'] ? ' ' + map['external_marriage_end_date'] : ''}`);
  }
  if (!active) bits.push('（已解除）');
  // 旧版出嫁链接（无 marriage_id）也在这里展示
  if (!active && !map['external_marriage_end_kind'] && linkType !== 'marriage') return null;
  return {
    active,
    title,
    note: bits.join(' · ') || (active ? '已建立婚姻关系' : '已解除'),
    endKind: map['external_marriage_end_kind'] || '',
    endDate: map['external_marriage_end_date'] || '',
    endedHint: `${map['external_marriage_end_kind'] || '已解除'}${map['external_marriage_end_date'] ? '（' + map['external_marriage_end_date'] + '）' : ''} —— 可再次嫁娶，系统会自动记为再嫁/再娶`,
  };
});

const isLivingPerson = computed(() => (person.value ? isLiving(person.value) : false));

/** 性别徽章图标（男/女；性别未知不显示）——路径统一走 @/business/icons 固化引用 */
const genderIcon = computed(() => (person.value ? genderIconSrc(person.value.gender) : ''));

/**
 * 生卒展示文本：
 * - 生：birth_date 有录入才显示；纯年份 → 年份，完整日期 → YYYY-MM-DD
 * - 卒：仅已故显示；有卒期 → 日期，卒年不详 → 「不详」
 */
const birthText = computed(() => dateDisplay(person.value?.birth_date));
/**
 * 出生地展示串（契约 v2 读形状）：码反查展示串 + 备注。
 * 备注为空不带分隔符；无码的旧数据（后端已把历史字符串归一到备注）只显示备注；无数据 → `''`。
 */
const birthPlaceText = computed(() => placeDisplayOf(person.value?.birth_place));
/** 居住地展示串列表（顺序即录入顺序；旧数据只有备注也显示） */
const residenceTexts = computed(() =>
  (person.value?.residence_places || []).map((p) => placeDisplayOf(p)).filter(Boolean),
);
const deathText = computed(() => {
  if (!person.value || isLivingPerson.value) return '';
  return dateDisplay(person.value.death_date) || '不详';
});

// 编辑权限：登录 + 非 guest；总谱仅 chief_editor
const canEdit = computed(() => {
  if (!isAuthenticated()) return false;
  if (authState.role === 'guest') return false;
  if (treeId.value === 'zhonghua' && authState.role !== 'chief_editor') return false;
  return true;
});

// 出嫁权限：女性节点 + 有编辑权 + 非总谱（总谱为先祖，不出嫁）
const canMarryOut = computed(() => {
  if (!person.value) return false;
  if (person.value.gender !== 'F') return false;
  if (treeId.value === 'zhonghua') return false;
  return canEdit.value;
});

// 娶入权限：男性节点 + 有编辑权 + 非总谱（与嫁出对称）
const canMarryIn = computed(() => {
  if (!person.value) return false;
  if (person.value.gender !== 'M') return false;
  if (treeId.value === 'zhonghua') return false;
  return canEdit.value;
});

// 分迁占位节点：管理员可删除链接（tree_steward / chief_editor）
const isBranchPlaceholder = computed(() => {
  if (!person.value?.attributes) return false;
  return person.value.attributes.some(
    (a) => a.key === 'external_link_type' && a.value === 'branch',
  );
});
const canRemoveBranchHere = computed(() => {
  if (!isAuthenticated()) return false;
  const role = authState.role;
  if (role !== 'tree_steward' && role !== 'chief_editor') return false;
  return isBranchPlaceholder.value;
});
const removingBranch = ref(false);

async function removeBranchLinkHere() {
  const token = getAuthToken();
  if (!token) {
    uni.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
    return;
  }
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '删除分迁链接',
      content: '确定删除该分迁链接吗？删除后与本支系彻底断开，且无法恢复。',
      confirmText: '彻底删除',
      cancelText: '取消',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  removingBranch.value = true;
  try {
    await removeBranchLink(token, treeId.value, handle.value);
    uni.showToast({ title: '分迁链接已删除', icon: 'success' });
    // 刷新详情（关联信息消失）
    const fresh = await fetchPerson(treeId.value, handle.value);
    person.value = fresh;
  } catch (e: any) {
    uni.showToast({ title: e.message || '删除失败', icon: 'none' });
  } finally {
    removingBranch.value = false;
  }
}

const externalRefs = computed(() => {
  if (!person.value?.attributes) return [];
  return person.value.attributes.filter(
    (a) => a.key === 'external_tree' || a.key === 'external_person_handle' || a.key === 'external_relation_note',
  );
});

/** 中华世本源流链世数（详情属性 external_chain_gen；undefined = 不在链上；0 = 原始节点，在链上） */
const chainGen = computed<number | undefined>(() => {
  const v = person.value?.attributes?.find((a) => a.key === 'external_chain_gen')?.value;
  if (v === undefined || v === '') return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
});

/** 称号三字段（号/封号/谥号）取值映射 */
const titleMap = computed(() => attrMapOf(person.value?.attributes));

/** 姓名旁称号短标签（封号优先） */
const titleTag = computed(() => titleLabel(person.value?.attributes));

/** 链上聚合虚位节点（代表多世，如「伏羲氏诸世」2–44 世 → 不可续编） */
const chainAggregate = computed(
  () => person.value?.attributes?.some((a) => a.key === 'external_chain_aggregate' && a.value === 'true') ?? false,
);

/** 父母家族（本人作为子女的家族） */
const parentsFamily = computed(() =>
  person.value?.families.find((f) => f.type === 'parents') || null,
);

/** 当前父母提示（改父输入框下方）：父/母 姓名（编号） */
const parentsHint = computed(() => {
  const f = parentsFamily.value;
  const parts: string[] = [];
  if (f?.father) parts.push(`父 ${f.father.name}（${personIdDisplay(f.father.gramps_id)}）`);
  if (f?.mother) parts.push(`母 ${f.mother.name}（${personIdDisplay(f.mother.gramps_id)}）`);
  return parts.length ? `当前：${parts.join(' · ')}` : '当前：未记录父母';
});

/** 配偶家族（本人作为父/母的家族） */
const spouseFamilies = computed(() =>
  (person.value?.families || []).filter((f) => f.type === 'spouse'),
);

/** 某配偶家族中本人的配偶（另一个家长） */
function spouseOf(fam: { father?: any; mother?: any }): any {
  if (!person.value) return null;
  return fam.father?.handle === person.value.handle
    ? (fam.mother || null)
    : (fam.father || null);
}

/**
 * 新增子节点的默认姓氏（随父姓）：本人是父 → 本人姓；
 * 本人是母且家族里记有父亲 → 父亲姓；无配偶家族/父不详 → 本人姓。
 * 面板只把该值作为默认展示；未「改姓」时提交空姓 → 服务端按同一规则继承。
 */
const childSurnameDefault = computed(() => {
  const p = person.value;
  if (!p) return '';
  for (const fam of spouseFamilies.value) {
    if (fam.father && fam.father.handle !== p.handle) return fam.father.surname || p.surname || '';
  }
  return p.surname || '';
});

/** 跳转同树人物（由宿主决定：弹窗内换人 / 页面 push）；镜像节点按口径 A 交给宿主解析真身 */
function goPerson(p: (MirrorFields & { handle: string }) | null | undefined) {
  if (!p?.handle) return;
  emit('open-person', { treeId: treeId.value, handle: p.handle, mirrorOf: p });
}

/** 跨树关联链接（external_* 属性聚合成一条，直达目标人物） */
const externalLinks = computed(() => {
  if (!person.value?.attributes) return [];
  const byKey: Record<string, string> = {};
  for (const a of person.value.attributes) byKey[a.key] = a.value;
  // 指向本树的 external_tree 是「链归属」标记（如总谱源流链节点），不是跨树链接 → 不显示
  if (!byKey.external_tree || byKey.external_tree === treeId.value) return [];
  return [
    {
      tree_id: byKey.external_tree,
      person_handle: byKey.external_person_handle || '',
      note: byKey.external_relation_note || `关联家族树 ${byKey.external_tree}`,
    },
  ];
});

/** 跨树链接（有具体人物 → open-person 跨树；否则 → open-tree 打开对应家族树） */
function goToExternal(link: { tree_id: string; person_handle: string }) {
  if (link.person_handle) {
    // 本节点自身是镜像时，这条「关联信息」指向的就是它的真身 → 交宿主按口径 A 打开并标注
    emit('open-person', { treeId: link.tree_id, handle: link.person_handle, mirrorOf: person.value });
  } else {
    emit('open-tree', link.tree_id);
  }
}

async function load() {
  loadError.value = '';
  try {
    const raw = await fetchPerson(treeId.value, handle.value);
    person.value = raw;
  } catch (e: any) {
    // 节点级可见分层：隐藏人物详情返回 404（docs/permission-tier.spec.md）
    const msg = /404/.test(e?.message || '')
      ? '该人物不存在或您无权查看'
      : (e?.message || '加载失败');
    loadError.value = msg;
    // 口径 A 第 5 条：宿主（PersonDetailModal）据此判断是否回退到镜像本树副本
    emit('load-failed');
  }
}

onMounted(load);

async function openEdit() {
  editError.value = '';
  const token = getAuthToken();
  if (!token) {
    uni.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
    return;
  }
  try {
    const raw = await fetchPersonForEdit(treeId.value, handle.value, token);
    const pn = raw.primary_name || {};
    const surname = pn.surname_list?.[0]?.surname || '';
    // gender 数字枚举 → M/F/U
    const genderNum = raw.gender;
    const genderStr = genderNum === 1 ? 'M' : genderNum === 2 ? 'F' : genderNum === 0 ? 'U' : (genderNum || 'U');
    // 生卒：优先取 profile（树 JSON 真源，compat 输出）；events 兜底（Gramps 旧链路）
    // 显式健在状态优先（compat 已存 is_living）；否则按死亡日期推断；再兜底默认健在
    const prof = raw.profile || raw.extended?.profile;
    let birth = prof?.birth?.date || '';
    let death = prof?.death?.date || '';
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
      if (!birth && type.includes('Birth')) birth = date;
      if (!death && type.includes('Death')) death = date;
      events.push({ type, date, place });
    }
    const living = raw.is_living !== undefined ? !!raw.is_living : !death;
    // 称号三字段：从既有 attribute_list 读取（与结构字段姓名分离）
    const attrByKey: Record<string, string> = {};
    for (const a of raw.attribute_list || []) {
      const k = typeof a.type === 'string' ? a.type : a.type?.string || '';
      if (k) attrByKey[k] = a.value;
    }
    editForm.value = {
      first_name: pn.first_name || '',
      surname,
      gender: genderStr,
      birth_date: birth,
      // 出生地 / 居住地（契约 v2）：读响应派生形状（place_code / place_note）→ 表单形状
      birth_place: normalizePlace(prof?.birth),
      is_living: livingLocked.value ? false : living,
      death_date: death,
      residence_places: prunePlaces(raw.residence_places),
      hao: attrByKey['号'] || '',
      feng: attrByKey['封号'] || '',
      shi: attrByKey['谥号'] || '',
      parent_id: '',
      events,
    };
    // 脏比对基线：打开表单这一刻的字段值（doSave 前先比一次，完全相同就不发 PUT）
    // **必须深拷贝**：表单写入是原地赋值，浅拷贝会让基线与表单共享 birth_place / residence_places
    // 子对象引用 ⇒ placesDirty 恒判「无改动」。见上方 cloneFormDeep 注释。
    editBaseline.value = cloneFormDeep(editForm.value);
    showEdit.value = true;
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载编辑数据失败', icon: 'none' });
  }
}

function addEvent() {
  editForm.value.events.push({ type: '', date: '', place: '' });
}

function removeEvent(i: number) {
  editForm.value.events.splice(i, 1);
}

// ===== 居住地（契约 v2：多条、最多 MAX_RESIDENCE_PLACES 条、顺序即展示顺序）=====

/**
 * 已达上限：添加按钮禁用（后端对第 10 条返回 400，故必须先在 UI 层拦住）。
 * 条数 **先丢弃空条目再计**（与提交/落库口径 `prunePlaces` 完全一致）：
 * 按原始行数算会让「9 行里有空行」的用户被误拦——他实际只填了 8 条有效条目。
 */
const residenceFull = computed(
  () => prunePlaces(editForm.value.residence_places).length >= MAX_RESIDENCE_PLACES,
);

/** 添加按钮旁的口径说明（满 9 条时说明为何禁用） */
const residenceHint = computed(() => (residenceFull.value
  ? `已达上限 ${MAX_RESIDENCE_PLACES} 条，如需新增请先删除一条。`
  : `最多 ${MAX_RESIDENCE_PLACES} 条；无码也无备注的空条目不会保存。`));

/** 新增一条居住地（按钮满 9 条即禁用，此处再兜一层，绝不越过上限） */
function addResidence() {
  if (residenceFull.value) {
    uni.showToast({ title: `居住地最多 ${MAX_RESIDENCE_PLACES} 条`, icon: 'none' });
    return;
  }
  editForm.value.residence_places.push(emptyPlaceInput());
}

function removeResidence(i: number) {
  editForm.value.residence_places.splice(i, 1);
}

/** 取消编辑：退出内嵌编辑面板，恢复档案视图 */
function cancelEdit() {
  editError.value = '';
  showEdit.value = false;
}

/** 树管理操作完成（加父/加子/拆分）：刷新当前档案 + 上抛宿主刷新树图 */
async function onManageTreeChanged() {
  // 管理操作可能改变当前人物自身（拆分后节点可能移出本树）→ 先刷新档案
  try {
    const fresh = await fetchPerson(treeId.value, handle.value);
    person.value = fresh;
    loadError.value = '';
  } catch (e: any) {
    // 节点被移出本树（拆分成功）→ 档案显示不可见提示
    const msg = /404/.test(e?.message || '')
      ? '该节点已移出本家族树（拆分完成）'
      : (e?.message || '刷新档案失败');
    person.value = null;
    loadError.value = msg;
  }
  emit('tree-changed');
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
    // ① 脏比对（发起 PUT 之前）：本表单与载入时原始值完全相同 → 不发请求、不扣费；
    //    但「只改了父节点编号」不算「未做修改」——改父走 reparent，必须照常执行（见下方 reparent 区块）。
    const normRef = (v: any) => String(v).toUpperCase().replace(/^I(?=\d)/, '');
    const newParentId = (editForm.value.parent_id || '').trim();
    const curParents = [parentsFamily.value?.father?.gramps_id, parentsFamily.value?.mother?.gramps_id]
      .filter(Boolean)
      .map((v) => normRef(String(v)));
    // 本树父编号去重（跨树编号不可能出现在本树父母里 → 命中即跨树迁移）
    const parentDirty = !!newParentId && !curParents.includes(normRef(newParentId));
    const formDirty = personEditDirty(editForm.value, editBaseline.value);
    // 居住地上限（契约 v2）：后端对第 10 条返回 400 → 前端先行拦截，不发请求、不扣费
    const residenceRows = prunePlaces(editForm.value.residence_places);
    if (residenceRows.length > MAX_RESIDENCE_PLACES) {
      editError.value = `居住地最多 ${MAX_RESIDENCE_PLACES} 条，请先删除多余的条目`;
      return;
    }
    // ①′ 只读镜像（R3 唯一例外 · 契约 v2 C6）：本层只提交出生地 + 居住地 ——
    //     `savePersonPlaces` 的请求体**只含**这两项（后端只读闸门 `isPlaceFieldsOnly` 据此放行）；
    //     夹带姓名 / 生卒 / 健在等锁字段仍 403，故绝不夹带身份字段（也绝不走改父）。
    if (readonlyMode.value) {
      const placesChanged =
        placesDirty([editForm.value.birth_place], [editBaseline.value?.birth_place]) ||
        placesDirty(residenceRows, editBaseline.value?.residence_places);
      if (!placesChanged) {
        uni.showToast({ title: '未做修改', icon: 'none' });
        return;
      }
      const saved = await savePersonPlaces(
        treeId.value,
        handle.value,
        { birth_place: normalizePlace(editForm.value.birth_place), residence_places: residenceRows },
        token,
      );
      const placesFee = feeText(saved?.fee);
      uni.showToast({
        title: `已保存${placesFee ? `（${placesFee}）` : ''}`,
        icon: 'none',
        duration: 3200,
      });
      showEdit.value = false;
      person.value = await fetchPerson(treeId.value, handle.value);
      return;
    }
    if (!formDirty && !parentDirty) {
      // 未做修改：不发 PUT、不关编辑态（用户还能继续改），零费用
      uni.showToast({ title: '未做修改', icon: 'none' });
      return;
    }

    let saveFee: FeeInfo | undefined;
    let saveRes: any = null;
    if (formDirty) {
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
      // 生卒 + 健在（约定顶层字段；compat 写树 JSON；auth-server 转发前剥离，不影响 Gramps）
      raw.birth_date = (editForm.value.birth_date || '').trim();
      raw.is_living = livingLocked.value ? false : editForm.value.is_living;
      // 健在 ⇒ 无离世时间；已故 ⇒ 可留空（卒年不详）
      raw.death_date = editForm.value.is_living ? '' : (editForm.value.death_date || '').trim();
      // 出生地 / 居住地（契约 v2）：只提交**原始码 + 备注**，绝不提交后端派生的 `place`；
      // 两个字段都不得省略（空出生地 → 空对象形状；无居住地 → 空数组）。空条目已在上方丢弃。
      raw.birth_place = normalizePlace(editForm.value.birth_place);
      raw.residence_places = residenceRows;
      // 称号三字段（号/封号/谥号）：合并进 attribute_list —— 保留其它属性，清空即删除该项
      const titleKeys = ['号', '封号', '谥号'];
      const titleValues: Record<string, string> = {
        号: (editForm.value.hao || '').trim(),
        封号: (editForm.value.feng || '').trim(),
        谥号: (editForm.value.shi || '').trim(),
      };
      const keptAttrs = (raw.attribute_list || []).filter((a: any) => {
        const k = typeof a.type === 'string' ? a.type : a.type?.string || '';
        return !titleKeys.includes(k);
      });
      for (const k of titleKeys) {
        if (titleValues[k]) keptAttrs.push({ type: k, value: titleValues[k] });
      }
      raw.attribute_list = keptAttrs;
      // 扣费闸门：人物内容修改 1 片 / 节点（docs/economy-fee.spec.md §3-1 #1）→ 响应带 fee
      saveRes = await savePerson(treeId.value, handle.value, raw, token);
      saveFee = saveRes?.fee;
    }

    // 改挂父节点（含跨家族树迁移）：填了编号且与当前父母不同 → 调专用接口（留空 = 不改）
    let reparentErr = '';
    /** 改父失败时的原始错误（用于识别 409 资产不足） */
    let reparentErrObj: unknown = null;
    let reparentMsg = '';
    let reparentFee: FeeInfo | undefined;
    /** 跨树迁移成功后的目标树展示名（非空 = 本节点已离本树） */
    let migratedTo = '';
    if (parentDirty) {
      // 提交前明示费用（同树 1 片 / 跨树整体迁移 9 片·与后代人数无关）；取消则不发起改父请求
      const reparentConfirmed = await new Promise<boolean>((resolve) => {
        uni.showModal({
          title: '改挂父节点确认',
          content: REPARENT_FEE_CONFIRM,
          confirmText: '继续改父',
          cancelText: '取消改父',
          success: (res) => resolve(!!res.confirm),
          fail: () => resolve(false),
        });
      });
      if (reparentConfirmed) {
        try {
          // 不再传目标家族树：后端按全局编号自动识别所属树（docs/id-system.spec.md §5）
          const r = await reparentNode(treeId.value, handle.value, newParentId, token);
          reparentFee = r.fee;
          if (r.cross_tree) {
            migratedTo = r.target_tree_id || '';
            reparentMsg = `已迁移到 ${migratedTo}（编号终身不变，共 ${r.moved_people ?? 0} 人）`;
          } else {
            reparentMsg = r.chain_shift
              ? `已改父 ${r.parent_name}（世数 ${r.chain_shift.delta > 0 ? '+' : ''}${r.chain_shift.delta}，含下代 ${r.chain_shift.affected} 个节点）`
              : `已改父 ${r.parent_name}`;
          }
        } catch (e: any) {
          reparentErr = e?.message || '改父失败';
          reparentErrObj = e;
        }
      }
    }
    // 只在「改父」这一步有变更、且用户取消了确认 → 什么都没发生（不进保存成功分支，编辑态保持）
    if (!formDirty && !reparentMsg && !reparentErr) {
      uni.showToast({ title: '未做修改', icon: 'none' });
      return;
    }
    // 扣费回执（内容修改 + 改父各一次）拼进成功提示
    const feeParts = [feeText(saveFee), feeText(reparentFee)].filter(Boolean);
    const feeSuffix = feeParts.length ? `（${feeParts.join('；')}）` : '';
    if (reparentErr) {
      // 内容已保存但改父被拒：竹片不足按「不隐藏文案 + 引导资产页」处理，其余原样提示
      if (isAssetInsufficientError(reparentErrObj)) {
        if (feeText(saveFee)) {
          uni.showToast({ title: `已保存（${feeText(saveFee)}），改父未生效`, icon: 'none', duration: 3200 });
        }
        showAssetInsufficientGuide(reparentErrObj, {
          extra: feeText(saveFee),
          title: '竹片不足（改父未生效）',
        });
      } else {
        uni.showToast({ title: `已保存${feeSuffix}，但改父失败：${reparentErr}`, icon: 'none', duration: 3200 });
      }
    } else {
      // 详情文档（称号/档案）写失败时后端回 `detail_warning`（树已落盘、已扣费，属部分成功）→ 优先提示
      const warn = formDirty ? String(saveRes?.detail_warning || '') : '';
      if (warn) {
        uni.showToast({ title: warn, icon: 'none', duration: 3200 });
      } else {
        uni.showToast({ title: `${reparentMsg || '已保存'}${feeSuffix}`, icon: 'success', duration: migratedTo ? 3200 : 2000 });
      }
    }
    showEdit.value = false;
    if (migratedTo) {
      // 跨树迁移成功：节点及其全部后代已离开本树 → 档案显示迁移结果，宿主刷新树图
      person.value = null;
      loadError.value = `该节点已迁移到「${migratedTo}」（编号不变）`;
      emit('tree-changed');
      return;
    }
    // 刷新详情
    const fresh = await fetchPerson(treeId.value, handle.value);
    person.value = fresh;
  } catch (e: any) {
    // 竹片不足（409 ASSET_INSUFFICIENT）：后端 error 文案不隐藏 + 「如何获得竹片」清单 + 引导「我的资产」；
    // 编辑表单保持打开（可充值后重试），不静默失败
    if (isAssetInsufficientError(e)) {
      editError.value = e?.message || '资产不足';
      showAssetInsufficientGuide(e, { title: '竹片不足' });
      return;
    }
    editError.value = e.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

/** 打开出嫁弹窗：加载可选目标家族树（排除总谱与当前树） */
async function openMarry() {
  marryError.value = '';
  marryQuery.value = '';
  marryResults.value = [];
  marrySearched.value = false;
  marrySearchNote.value = '';
  marryRefInput.value = '';
  selectedMarry.value = null;
  marryTreeId.value = '';
  marryDate.value = '';
  try {
    const meta = await fetchTreeMetaRemote();
    marryTrees.value = Object.values(meta.trees)
      .filter((t) => !t.is_master && t.tree_id !== treeId.value)
      .map((t) => ({ tree_id: t.tree_id, display_title: t.display_title, surname_char: t.surname_char || '', kind: t.kind as string | undefined }));
    if (!marryTrees.value.length) {
      marryError.value = '暂无可联姻的家族树';
      return;
    }
    showMarry.value = true;
  } catch (e: any) {
    marryError.value = e.message || '加载家族树失败';
    showMarry.value = true;
  }
}

function selectMarryTree(tid: string) {
  marryTreeId.value = tid;
  const t = marryTrees.value.find((x) => x.tree_id === tid);
  marryTreeName.value = t ? treeDisplayLabel(t.display_title, t.surname_char) : tid;
  marryResults.value = [];
  marrySearched.value = false;
  marrySearchNote.value = '';
  selectedMarry.value = null;
}

/** 搜索目标树候选（走跨树嫁娶候选通道：需登录、不套节点级读裁剪、五键白名单） */
async function doSearchMarry() {
  const q = marryQuery.value.trim();
  if (!q) {
    marryError.value = '请输入姓名关键字';
    return;
  }
  if (!marryTreeId.value) {
    marryError.value = '请先选择目标家族树';
    return;
  }
  // 嫁出 → 目标为男性（M）；娶入 → 目标为女性（F）；性别未知（U / 0）后端一律不列入
  const want = marryDirection.value === 'out' ? 'M' : 'F';
  marrySearching.value = true;
  marrySearched.value = true;
  marryError.value = '';
  marrySearchNote.value = '';
  selectedMarry.value = null;
  try {
    const res = await searchMarriageCandidates(marryTreeId.value, { query: q, gender: want });
    // 保留既有强制性别过滤（后端已按 gender 过滤；此处双保险，且兼容老后端）
    marryResults.value = res.candidates.filter((p) => p.gender === want);
    // ③ 确实无匹配（200 空）：明确说是「没找到符合条件的女性/男性节点」，而不是笼统「未找到」
    marrySearchNote.value = marryResults.value.length
      ? ''
      : `未找到符合条件的${want === 'M' ? '男' : '女'}性节点`;
  } catch (e: any) {
    marryResults.value = [];
    const status = Number(e?.status) || 0;
    // ① 401：未登录 / 登录过期 —— 必须让用户知道要重新登录（此前被静默降级成 guest 档，用户看不出原因）
    // ② 其它错误：显示后端错误文案原文（不吞成「未找到」）
    marrySearchNote.value = status === 401 ? '登录已过期，请重新登录' : e?.message || '搜索失败';
  } finally {
    marrySearching.value = false;
  }
}

function selectMarry(p: MarriageCandidate) {
  selectedMarry.value = p;
}

/**
 * 确认嫁娶：提交联姻申请（对方家族审批后生效）。
 * 兜底口径（派单 §9-8 第 5 条）：填了「按全局编号指定」→ **编号优先**（传 spouse_ref；
 * 不传 spouse_tree_id —— 全局编号自带所属树，由后端 resolveNode 全站定位）；
 * 否则按选中的候选（spouse_handle + spouse_tree_id）提交。两种写法后端都认（兼容）。
 */
async function doMarry() {
  const refInput = marryRefInput.value.trim();
  if (!refInput && !selectedMarry.value) return;
  const token = getAuthToken();
  if (!token) {
    marryError.value = '登录已过期，请重新登录';
    return;
  }
  marrying.value = true;
  marryError.value = '';
  try {
    const res = await marriageRequest(treeId.value, {
      action: 'marry',
      direction: marryDirection.value,
      person_handle: handle.value,
      ...(refInput
        ? { spouse_ref: refInput }
        : { spouse_tree_id: marryTreeId.value, spouse_handle: selectedMarry.value!.handle }),
      marriage_date: marryDate.value.trim(),
    }, token);
    uni.showToast({
      title: `已提交申请，等待对方家族（${res.to_person_name} 所在树）审批`,
      icon: 'none',
      duration: 3000,
    });
    showMarry.value = false;
    const fresh = await fetchPerson(treeId.value, handle.value);
    person.value = fresh;
  } catch (e: any) {
    marryError.value = e.message || '提交失败';
  } finally {
    marrying.value = false;
  }
}

// ---- 绝婚 / 合离 ----

/** 打开解除弹窗：绝婚=男方主动（单方生效）/ 合离=双方自愿（需对方审批） */
function openEndMarriage(kind: '绝婚' | '合离') {
  endKind.value = kind;
  endDate.value = '';
  endNote.value = '';
  endError.value = '';
  showEndMarriage.value = true;
}

/** 提交解除：绝婚走 /admin/marry-end（即时生效）；合离走申请（等对方审批） */
async function doEndMarriage() {
  const token = getAuthToken();
  if (!token) {
    endError.value = '登录已过期，请重新登录';
    return;
  }
  ending.value = true;
  endError.value = '';
  try {
    if (endKind.value === '绝婚') {
      await marryEnd(treeId.value, {
        person_handle: handle.value,
        end_date: endDate.value.trim(),
        note: endNote.value.trim(),
      }, token);
      uni.showToast({ title: '已绝婚（男方主动解除）', icon: 'success' });
    } else {
      const res = await marriageRequest(treeId.value, {
        action: 'divorce',
        person_handle: handle.value,
        end_date: endDate.value.trim(),
        note: endNote.value.trim(),
      }, token);
      uni.showToast({ title: `已提交合离申请，等待对方家族（${res.to_person_name} 所在树）审批`, icon: 'none', duration: 3000 });
    }
    showEndMarriage.value = false;
    const fresh = await fetchPerson(treeId.value, handle.value);
    person.value = fresh;
  } catch (e: any) {
    endError.value = e.message || '操作失败';
  } finally {
    ending.value = false;
  }
}
</script>

<style scoped>
.danger-zone { border-top: 1px dashed #E0C9B0; padding-top: 10px; }
.danger-hint { font-size: 12px; color: #A1887F; display: block; margin: 8px 2px 0; line-height: 1.5; }
/* 祖谱删除风险提示（仅总编可见该危险区时同屏显示） */
.clan-danger-hint { color: #C62828; }
.del-mode {
  border: 1px solid #E0D6CC;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #FFFDF8;
}
.del-mode.selected { border-color: #C62828; background: #FDF2F2; }
.del-mode-name { font-size: 13px; color: #3E2723; display: block; }
.del-mode-hint { font-size: 11px; color: #A1887F; display: block; margin-top: 4px; }
.del-stat {
  border: 1px solid #E0C9B0;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 10px 0;
  background: #FBF6EF;
}
.del-stat-line { font-size: 12px; color: #3E2723; display: block; margin-bottom: 4px; }
.del-stat-msg { color: #8B4513; }
/* 「不可恢复」提示：用红色文字表达（此前的 **星号** 会被字面显示） */
.del-warn { font-size: 12px; color: #D93025; font-weight: bold; display: block; text-align: center; margin: -8px 0 10px; }
.founder-lock { margin: 6px 0 2px; }
.founder-hint { font-size: 12px; color: #A1887F; display: block; margin: 4px 2px 8px; }
/* 口径 A 第 3/5 条：镜像 → 真身档案的顶部标注 */
.mirror-note {
  margin: 0 2px 12px; padding: 8px 10px;
  background: #FFF7E6; border: 1px solid #E8C9A0; border-radius: 8px;
}
.mirror-note-text { font-size: 12px; color: #8B4513; line-height: 1.5; display: block; }
.living-locked { display: flex; align-items: center; gap: 8px; margin: 6px 0 2px; }
.container { padding: 20px; }
.container.modal { padding: 2px 4px 8px; }
.name-row { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 16px; }
.name { font-size: 24px; font-weight: bold; color: #3E2723; }
.name-title { font-size: 14px; color: #8B4513; background: #FBF6EF; border-radius: 6px; padding: 2px 8px; }
.gender-badge { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; }
.edit-btn { flex-shrink: 0; }
.info-row { display: flex; justify-content: center; margin-bottom: 12px; }
.info-card :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.section { margin-top: 20px; }
.section-title { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 8px; }
.marriage-actions { display: flex; gap: 8px; margin-top: 8px; }
.marriage-hint { font-size: 12px; color: #A1887F; display: block; margin-top: 6px; }
.section :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.fam-block { padding: 12px 16px; border-bottom: 1px solid #F5F0EA; }
.fam-block:last-child { border-bottom: none; }
.fam-row { display: flex; align-items: flex-start; margin-bottom: 6px; }
.fam-row:last-child { margin-bottom: 0; }
.fam-label { font-size: 13px; color: #999; width: 52px; flex-shrink: 0; margin-top: 2px; }
.fam-link { font-size: 14px; color: #5D4037; }
.fam-link:active { color: #8B4513; }
.fam-kids { display: flex; flex-wrap: wrap; gap: 4px 14px; flex: 1; }
.fam-none { font-size: 13px; color: #ccc; }
.branch-admin { margin-top: 10px; }
.loading { text-align: center; padding: 60px; color: #999; }
.loading .error-text { display: block; margin-bottom: 14px; color: #C62828; font-size: 14px; line-height: 1.6; }
.archive-error { padding: 40px; }

/* 编辑模态框：内容高于视口时只在弹窗内部滚动（不再顶出屏幕 / 外溢） */
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
  overflow-y: auto; padding: 5vh 0; box-sizing: border-box;
}
.modal {
  width: 88%; max-width: 420px; max-height: 85vh;
  background: #fff; border-radius: 14px; padding: 20px;
  display: flex; flex-direction: column;
  /* overflow 兜底：任何内容高度都收在弹窗内部滚动；margin:auto 保证不超高时仍居中 */
  overflow-y: auto; margin: auto;
}
.modal-title { font-size: 18px; font-weight: bold; color: #3E2723; text-align: center; margin-bottom: 12px; }
.modal-body { flex: 1; max-height: 55vh; }
.field-label { font-size: 13px; color: #8B4513; font-weight: bold; display: block; margin: 12px 0 6px; }
.field-hint { font-size: 12px; color: #A1887F; display: block; margin: 4px 0 2px; }
.field { margin-bottom: 8px; }
.living-block { margin-top: 2px; }
.event-edit-row { background: #FBF8F4; border-radius: 8px; padding: 8px; margin-bottom: 8px; }
.place-edit-row { background: #FBF8F4; border-radius: 8px; padding: 8px; margin-bottom: 8px; }
.edit-error { text-align: center; color: #C62828; font-size: 13px; margin: 8px 0; }
.modal-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.modal-sub { font-size: 12px; color: #999; display: block; text-align: center; margin: 6px 0 14px; }

/* 内嵌编辑面板（同一弹窗/页面内切换，不再独立弹窗） */
.edit-inline { padding: 4px 0 8px; }
.edit-inline-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 10px; border-bottom: 1px solid #F0E8DE; margin-bottom: 4px;
}
.edit-inline-title { font-size: 17px; font-weight: bold; color: #3E2723; }
.edit-inline-close {
  width: 30px; height: 30px; line-height: 30px; text-align: center;
  font-size: 16px; color: #999; border-radius: 50%;
}
.edit-inline-close:active { background: #F5F0EA; }
.edit-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }

/* 出嫁/认祖/挂载弹窗（平铺树列表已收进共享 tree-picker：折叠态恒一行 + 展开态限高滚动列表） */
.search-row { display: flex; gap: 8px; align-items: center; }
.search-input { flex: 1; }
.join-tip { text-align: center; color: #999; font-size: 13px; padding: 16px 0; }
.join-results { max-height: 30vh; overflow-y: auto; margin-top: 8px; }
.join-result {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1px solid #F0E8DE; border-radius: 8px;
  margin-bottom: 8px;
}
.join-result.selected { border-color: #8B4513; background: #FBF6EF; }
.result-name { font-size: 14px; color: #3E2723; font-weight: 500; }
.result-id { font-size: 11px; color: #999; }
.result-gender { font-size: 11px; color: #8B4513; margin-left: auto; }
.identity-confirm {
  margin-top: 10px; padding: 12px; background: #FFF8E1; border-radius: 8px;
}
.identity-text { font-size: 13px; color: #5D4037; line-height: 1.6; }
</style>
