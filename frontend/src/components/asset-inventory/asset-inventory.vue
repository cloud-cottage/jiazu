<template>
  <view class="inv-card">
    <view class="inv-head">
      <view class="inv-head-left">
        <view class="inv-title-mark" />
        <text class="inv-title">行囊</text>
      </view>
      <text class="inv-count">{{ occupiedTotal }} / {{ SLOT_COUNT }} 格</text>
    </view>
    <text class="inv-hint">
      6 × 6 栏位 · 拖曳可调整显示顺序（仅当前页面有效，刷新后恢复默认）
    </text>

    <!-- 6×6 道具栏：坐标命中（H5 走文档级鼠标事件，小程序走 touch 事件），空格不参与任何交互 -->
    <view
      class="inv-grid"
      :style="gridStyle"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <view
        v-for="(cell, i) in cells"
        :key="cell ? cell.id : `empty:${i}`"
        class="inv-slot"
        :class="{
          'inv-slot-filled': !!cell,
          'inv-slot-drag': dragging && dragFrom === i,
          'inv-slot-drop': dragging && dropIndex === i && dragFrom !== i,
          'inv-slot-active': tipIndex === i,
        }"
      >
        <view class="inv-slot-box">
          <template v-if="cell">
            <image v-if="cell.kind === 'jade'" class="inv-ico" :src="ICON.JADE" mode="aspectFit" />
            <image v-else-if="cell.kind === 'seed'" class="inv-ico" :src="ICON.SEED" mode="aspectFit" />
            <image v-else-if="cell.kind === 'bamboo'" class="inv-ico" :src="ICON.BAMBOO" mode="aspectFit" />
            <image v-else-if="cell.kind === 'scroll'" class="inv-ico" :src="ICON.SCROLL" mode="aspectFit" />
            <image v-else-if="cell.kind === 'scrollFragment'" class="inv-ico" :src="ICON.SCROLL_SHARD" mode="aspectFit" />
            <image v-else class="inv-ico" :src="ICON.FRAGMENT" mode="aspectFit" />
            <text v-if="cell.badge" class="inv-badge" :class="{ 'inv-badge-pop': badgePopIndex === i }">{{ cell.count }}</text>
            <!-- 兰帖锁定态（好友域续约申请占用的那张）：格角标 + 属性提示层整句（文案单点 = business/asset-text.ts） -->
            <text v-if="cell.kind === 'scroll' && scrollLock" class="inv-lock">锁</text>
          </template>
          <!--
            格位特效层（V3 灵石共鸣）：绝对定位叠加层 + `pointer-events: none` ⇒ 零布局影响、不夺命中。
            节点按**格位序号**承载（`fxLayers[i]`）⇒ 操作成功后页面重拉 summary 重建格位时，在飞特效自动
            复挂到同一格位、不会被重建抹掉（先例 `docs/sibling-order.spec.md` §9-2-1 的层序口径）。
          -->
          <view v-if="fxLayers[i].length" class="fx-layer">
            <view v-for="n in fxLayers[i]" :key="n.id" class="fx-el" :class="n.cls" :style="n.style" />
          </view>
        </view>
      </view>
    </view>

    <!--
      属性提示层：**自绘**（不用 `uni.showModal`）—— `uni-modal` 的 z-index = 999 会被自绘遮罩压住，
      先例见 `components/sibling-order-modal/`（`docs/sibling-order.spec.md` §9-2-1）；本层 z-index = 1010。
      鼠标悬停（H5）与轻触（全端）打开同一层；空格轻触不弹提示。
      **层内直操作**（可交互）：籽格 → 【合成】（消耗 `JADE_SYNTH_SEEDS`）；玉格 → 【分解】（免费 / 返还 999 / 365 天）。
      关闭边界 = 「格子 + 提示层」整体：鼠标从格移到本层不关（否则点不到按钮），离开二者即关。
      点【合成】/【分解】打开**自绘二次确认框**（遮罩 1030 / 面板 1031，恒在本层之上）⇒ 本层**无需先关**：
      旧实现「先 `closeTip()` 再 `uni.showModal`」是因 `.uni-modal`（999）低于本层（1010）而被迫的绕法，
      自绘确认框落定后该限制消失；确认框打开期间卡片内指针路径一律不介入（见 `confirmOpen` 守卫）。
    -->
    <view v-if="tipCell" class="inv-tip" :class="{ 'is-fail': tipFailed }" :style="tipStyle">
      <text class="inv-tip-title">{{ tipCell.name }}</text>
      <text v-for="(line, li) in tipCell.tooltipLines" :key="li" class="inv-tip-line">{{ line }}</text>
      <text v-if="tipCell.kind === 'scroll' && scrollLock" class="inv-tip-line inv-tip-lock">{{ scrollLock.text }}</text>
      <!--
        兰帖格：分解口径行（比例单点 = `business/asset-text.ts`）+ **格数 / 张数两口径**行
        （`docs/economy.spec.md` §14-13 —— 格数看行囊（含余数格）、张数看整道具数，**两者不是同一个数**）。
      -->
      <template v-if="tipCell.kind === 'scroll'">
        <text class="inv-tip-line inv-tip-ratio">{{ scrollHintText }}</text>
        <text class="inv-tip-line">{{ scrollCaliberText }}</text>
      </template>
      <view v-if="tipCell.kind === 'seed'" class="inv-tip-acts">
        <view
          class="inv-tip-btn"
          :class="{ 'inv-tip-btn-off': !canSynthesize || busy, 'is-busy': busy, 'sheen-once': sheenOnce,
                    'is-hover': btnHover === 'synth', 'is-press': btnPress === 'synth' }"
          :style="btnShake"
          @click.stop="onSynthTap"
        >
          <view class="btn-fx" />
          <view class="btn-sheen-clip"><view class="btn-sheen" /><view class="btn-vein" /></view>
          <view class="btn-busy" />
          <text class="inv-tip-btn-text">合成</text>
        </view>
        <text v-if="!canSynthesize" class="inv-tip-note">再攒 {{ seedsToGo }} 颗</text>
      </view>
      <view v-else-if="tipCell.kind === 'jade' && tipCell.jadeId" class="inv-tip-acts">
        <view
          class="inv-tip-btn"
          :class="{ 'inv-tip-btn-off': busy, 'is-busy': busy, 'sheen-once': sheenOnce,
                    'is-hover': btnHover === 'decompose', 'is-press': btnPress === 'decompose' }"
          :style="btnShake"
          @click.stop="onDecomposeTap"
        >
          <view class="btn-fx" />
          <view class="btn-sheen-clip"><view class="btn-sheen" /><view class="btn-vein" /></view>
          <view class="btn-busy" />
          <text class="inv-tip-btn-text">分解</text>
        </view>
      </view>
      <!--
        兰帖格【分解】（后端 `POST /assets/scroll/decompose` `{count}`，1 张 = 100 片 ⇒ 返还 99 片）：
        未达标（余数格不足 1 张 / 被续约申请锁定）⇒ 按钮置灰 + **层内明写原因** + 点按直出同一句 toast
        （三态可见，**不静默**）；达标 ⇒ 打开自绘二次确认框（1030/1031，恒在本层 1010 之上）。
      -->
      <view v-else-if="tipCell.kind === 'scroll'" class="inv-tip-acts">
        <view
          class="inv-tip-btn"
          :class="{ 'inv-tip-btn-off': !canDecomposeScroll || busy, 'is-busy': busy, 'sheen-once': sheenOnce,
                    'is-hover': btnHover === 'decomposeScroll', 'is-press': btnPress === 'decomposeScroll' }"
          :style="btnShake"
          @click.stop="onScrollDecomposeTap"
        >
          <view class="btn-fx" />
          <view class="btn-sheen-clip"><view class="btn-sheen" /><view class="btn-vein" /></view>
          <view class="btn-busy" />
          <text class="inv-tip-btn-text">分解</text>
        </view>
        <text v-if="!canDecomposeScroll" class="inv-tip-note">{{ scrollDisabledNote }}</text>
      </view>
      <!--
        道具诗句：**单一来源** = `business/asset-text.ts` 的 `ASSET_POEMS`（组件内零诗句字面）。
        展示位置 = 本属性提示层内（Kevin 已定）；长句**自动换行**（`.inv-tip-poem` 恒 `width: 100%` +
        `overflow-wrap`），层高由实测包围盒收尾 ⇒ **不撑破本层**（估算项见 `estimatePoemHeight`）。
      -->
      <text v-if="tipPoem" class="inv-tip-poem">{{ tipPoem }}</text>
    </view>

    <!--
      全屏型特效层（地面微震带 / 屏幕级微光）z-index 1016 与结果提示层（结果浮字）1018：
      同为**绝对定位叠加层**（覆盖本卡片）⇒ 零布局影响、不夺命中；层序恒高于提示层 1010。
    -->
    <view v-if="fxGlobal.length" class="fx-global">
      <view v-for="n in fxGlobal" :key="n.id" class="fx-el" :class="n.cls" :style="n.style" />
    </view>
    <view v-if="fxResult.length" class="fx-result">
      <!-- 结果浮字 = **数量摘要**（`n.text`；文本写在节点内，不是空药丸）；完整回执仍由 `uni.showToast` 交付 -->
      <view v-for="n in fxResult" :key="n.id" class="fx-el" :class="n.cls" :style="n.style">{{ n.text }}</view>
    </view>

    <!--
      自绘二次确认框（取代 `uni.showModal`）：遮罩 **1030** / 面板 **1031**，恒高于提示层 1010 与特效层 1014–1018。
      文案**逐字**取 `business/jade-ops.ts`（标题含 `⚠️`；正文按 `\n` 逐行渲染，不合并、不改标点）；
      按钮文案 = `取消` / `确认合成`（分解 = `取消` / `确认分解`）。渲染后卡片内指针路径不介入（见 `confirmOpen` 守卫）。
    -->
    <view
      v-if="confirmOpen"
      class="inv-confirm-mask"
      @click.stop="cancelConfirm"
      @mousedown.stop
      @touchstart.stop
    >
      <view class="inv-confirm" :class="{ 'is-in': confirmIn }" @click.stop>
        <view class="inv-confirm-ribbon" />
        <text class="inv-confirm-title">{{ confirmTitle }}</text>
        <text v-for="(line, li) in confirmLines" :key="li" class="inv-confirm-body">{{ line }}</text>
        <view class="inv-confirm-actions">
          <view class="inv-confirm-btn" @click.stop="cancelConfirm">
            <text class="inv-confirm-btn-text">取消</text>
          </view>
          <view class="inv-confirm-btn ok" @click.stop="submitConfirm">
            <text class="inv-confirm-btn-text">{{ confirmOkText }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 溢出提示行：占格需求 > 36 时，超出的道具不渲染格子，改为按类型汇总的提示行（玉行恒在最前） -->
    <view v-for="ov in overflows" :key="ov.kind" class="inv-overflow">
      <text class="inv-overflow-label">{{ ov.label }}：</text>
      <text class="inv-overflow-text">{{ ov.text }}</text>
    </view>

    <view v-if="!authenticated" class="inv-notice">登录后即可查看行囊</view>
    <view v-else-if="error" class="inv-error">{{ error }}</view>
    <view v-else-if="loading" class="inv-notice">行囊加载中…</view>
  </view>
</template>

<script setup lang="ts">
/**
 * 行囊（游戏背包样式 · 6×6 = 36 栏位）容器组件。
 *
 * 口径（Kevin 口径 v3）：
 * - 数据流单一：`summary` / `error` / `loading` / `authenticated` 全部由页面（`pages/mine/index.vue`）
 *   取数后传入，**组件内不二次请求**；操作成功后 `emit('refresh')` 由页面重拉 `summary`（就地更新）；
 *   未登录渲染 36 空格 + 一行提示；
 * - 换算 / 占格（整堆 + 余数 + 碎片）/ 默认序 / 溢出 / **玉只计未镶嵌** 全部在 `business/inventory.ts`
 *   （纯逻辑）里算，组件只负责渲染与交互；**零头行已随口径 v3 删除**（无残留 DOM / 样式 / 逻辑）；
 * - 属性提示 = 自绘层（z-index 1010）：鼠标悬停（H5）与轻触（全端）打开同一层，空格不弹；
 *   关闭路径三条 —— ① 指针离开「格子 + 提示层」整体（H5；移入提示层不算离开，否则点不到层内按钮）；
 *   ② 同格再轻触 toggle 关闭（不依赖空格 ⇒ 36 格全满也能关）；③ 拖曳 / 滚动 / 数据刷新；
 *   触摸后 Chrome 补发的兼容鼠标事件按 `TOUCH_MOUSE_GUARD` 窗口忽略（防 hover 把轻触选中的格抢回去）；
 * - 提示层内直操作：籽格 → 【合成】（`JADE_SYNTH_SEEDS`；籽不足置灰 +「再攒 N 颗」）；
 *   玉格 → 【分解】（免费 / 固定返还 999 颗 / 统一 365 天）；**兰帖格 → 【分解】**
 *   （`POST /assets/scroll/decompose` 按**张**：1 张 = 100 片 ⇒ 返还 99 片、每张留 1 片损耗；
 *   **余数格**（不足 1 张）与被续约申请**锁定**的张数 ⇒ 按钮置灰 + 层内明写原因 + 点按直出同一句）；
 *   二次确认 = **自绘确认框**
 *   （遮罩 1030 / 面板 1031），文案逐字取 `business/jade-ops.ts`、计费与回执口径沿用 `business/asset-guide.ts`
 *   （不另建文案）。**不再调 `uni.showModal`**：`.uni-modal`（999）低于本层（1010）⇒ 旧的「先 `closeTip()`
 *   再弹框」绕法随之取消；自绘确认框恒在提示层与特效层之上，故本层保持打开、用户仍能看到按钮上下文
 *   （确认框打开期间卡片内指针路径不介入，见 `confirmOpen` 守卫）。
 * - **操作特效（V3 灵石共鸣）**：合成 780ms / 分解 680ms / 失败 520ms（设计源 = 派单提供的
 *   `inv-fx-mockup.html` V3 分区块 + 共享附录）；实现只用跨端安全子集（`transform` / `opacity` /
 *   `box-shadow` 含 inset / `linear-gradient` / `radial-gradient` / `border-*` / `text-shadow` /
 *   2 条循环态 `@keyframes`（仅 H5，见样式区 `#ifdef H5`）/ CSS 变量），**零** `filter` /
 *   `backdrop-filter` / `mask` / `clip-path` / `conic-gradient` / `mix-blend-mode` / 位图贴图 / JS 动画库；
 *   一次性特效一律 = `transition` + 定时链（小程序端同样可跑）。层序：格位特效 1014、全屏冲击 1016、
 *   结果提示 1018（均 `pointer-events: none`），自绘确认 1030/1031。
 *   **结果浮字文本**写在节点内（`FxNode.text`）= **数量摘要**（`fxQtySummary`：`+1 枚石榴籽玉` / `+999 颗石榴籽`，
 *   量词与道具名取 `business/inventory.ts` 装配产物、不新造文案；失败路径沿用既有「再攒 N 颗」原文），
 *   单行截断（`nowrap` + `ellipsis`）；**完整回执仍由 `uni.showToast` 交付**，浮字不取代、不改写。
 *   **零布局影响**：特效节点全是绝对定位叠加层（或伪元素 / 真实节点上的 `transform`、`box-shadow`、
 *   `text-shadow`），按钮 `padding / border-width / font-size / line-height` 一字未动、四态盒尺寸恒等；
 *   操作成功后页面重拉 `summary` → `rebuild()` 时，在飞特效按**格位序号**自动复挂（`fxLayers`），
 *   不会被重建抹掉，用户能看到收束尾相。
 * - **按钮的悬停 / 按下态（`is-hover` / `is-press`）真实接线**：H5 由既有文档级鼠标通道按
 *   `composedPath()` 是否含 `.inv-tip-btn` 置位 / 清除（每颗按钮各自的态；`inv-fx-vein` 玉纹循环
 *   由悬停态驱动），小程序无 hover ⇒ 只接 `is-press`（既有触摸通道 + 按钮实测包围盒落点）。
 *   两个类只改 `box-shadow` / `transform` / 叠加层 `opacity` ⇒ 按钮 layout box 恒 52 × 26px；
 *   层内按钮上的指针路径不影响「源格 ∪ 提示层」关闭边界，拖曳 / 确认框期间不介入（不抢焦）。
 * - 拖曳排序 = 已占用格之间的插入式重排（`moveItem`）；移动 > 5px 判拖曳、否则判轻触；
 *   **纯内存态**（无 localStorage / 无后端写 / 无持久化）⇒ 刷新或重进页面即回默认序；
 * - H5 走文档级鼠标事件（`composedPath` 限本卡片内），小程序走 touch 事件；命中判定统一按格位坐标。
 * - **命中坐标必须与指针同源**：格位 / 提示层 / 卡片一律经 `measureRects` 量测 —— H5 用 DOM
 *   `getBoundingClientRect()`（与 `clientX/clientY` 同为**视口坐标**），小程序用 `boundingClientRect()`
 *   （与 touch 同为**显示区域坐标**）；两条路径各自自洽、**零常量补偿**（详见 `measureRects` 注释）。
 */
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import type { AssetsSummary } from '@/business/api';
import type { ScrollLockView } from '@/business/friends';
import { postDecomposeScroll } from '@/business/friends';
import { postDecomposeJade, postSynthesizeJade } from '@/business/api';
import {
  assetPoem,
  formatAssetDate,
  SCROLL_DECOMPOSE_TITLE,
  SCROLL_FRAGMENT_NAME,
  scrollCaliberLine,
  scrollDecomposeConfirmLines,
  scrollDecomposeHintLine,
  scrollLockedReasonLine,
  scrollRemainderReasonLine,
} from '@/business/asset-text';
import { isAssetInsufficientError, showAssetInsufficientGuide } from '@/business/asset-guide';
import { ICON } from '@/business/icons';
import {
  DECOMPOSE_CONFIRM_BODY,
  DECOMPOSE_CONFIRM_TITLE,
  JADE_SYNTH_SEEDS,
  SEED_VALID_DAYS,
  SYNTH_CONFIRM_BODY,
  SYNTH_CONFIRM_TITLE,
} from '@/business/jade-ops';
import {
  buildInventory,
  JADES_PER_ITEM,
  moveItem,
  SCROLL_FRAGMENTS_PER_ITEM,
  SCROLL_PIECES_PER_ITEM,
  SLOT_COLUMNS,
  SLOT_COUNT,
  type Inventory,
  type InventoryItem,
  type InventoryKind,
  type InventorySummary,
  type InventoryOverflow,
} from '@/business/inventory';

const props = withDefaults(defineProps<{
  /** 资产总览（页面取数后传入；null = 未登录或未取到） */
  summary?: AssetsSummary | null;
  /** 取数失败文案（不阻塞页面，容器内显示错误行） */
  error?: string;
  /** 取数进行中 */
  loading?: boolean;
  /** 登录态（未登录：36 空格 + 「登录后即可查看行囊」，不发请求） */
  authenticated?: boolean;
  /**
   * 兰帖**锁定态**（好友域续约申请：本人发起、等待对方确认期间那张兰帖被占用）——
   * 由页面从 `GET /friends` 的 `pending` 推导后传入（`business/friends.ts` 的 `scrollLockOf`），
   * 组件只负责渲染（沿用本组件既有格 / 属性提示层体例，不另建第二套列表）。
   * `null` = 无锁定态（不显示任何锁定文案）。
   */
  scrollLock?: ScrollLockView | null;
}>(), {
  summary: null,
  error: '',
  loading: false,
  authenticated: false,
  scrollLock: null,
});

/** 操作成功后就地重拉 `summary`（页面取数 = 唯一数据源；组件不自己发业务请求） */
const emit = defineEmits<{ (e: 'refresh'): void }>();

/** 拖曳判定阈值（px）：位移 > 5px 判为拖曳，否则判为轻触（两者不互抢） */
const DRAG_THRESHOLD = 5;
/** 属性提示层宽度（px；窄屏按卡片宽度收缩） */
const TIP_WIDTH = 240;
/** 提示层高度估算（px / 行）—— **仅在首次渲染（实测高度未知）时**用于「摆到格位上方」，不参与任何业务判定 */
const TIP_LINE_H = 18;
/** 提示层内操作区（按钮 / 说明）的高度估算（px）—— 同上，只用于首次渲染的摆位 */
const TIP_ACTIONS_H = 30;
/* 提示层内**诗句行**的高度估算（px）—— 数值与 `.inv-tip-poem` 的 `font-size` / `line-height` 对齐，只用于首次渲染摆位 */
const TIP_POEM_FONT = 11;
const TIP_POEM_LINE_H = 16;
/** 诗句行的纵向非文字部分估算（px）= `margin-top 8` + `padding-top 6` + `border-top 1`，与 `.inv-tip-poem` 逐值对齐 */
const TIP_POEM_MARGIN = 15;
/** 提示层摆在格位上方的最小行号（末两行往上摆，避免超出内容区） */
const TIP_ABOVE_ROW = SLOT_COUNT / SLOT_COLUMNS - 2;
/**
 * 「源格 ∪ 提示层」联合区域的归属容差（px）。
 * 格下缘与层上缘之间因亚像素舍入会留下 0~1.5px 的缝（dpr ≠ 1 时几何零缝不可靠），指针落进缝里
 * `elementFromPoint` 返回的是 `.inv-grid` ⇒ 按「目标元素」判定就会把层关掉、层内按钮永远点不到。
 * 容差把缝并入联合区域：指针在离开「源格 ∪ 层」整体之前，层始终开着（判据①/④的口径）。
 */
const TIP_UNION_TOL = 2;
/** 上摆贴合校正的缝隙阈值（px）：实测层高与格位上缘之差 ≤ 本值即视为已贴合，不再改样式 */
const TIP_FIT_EPS = 0.5;
/**
 * 触摸事件后抑制「兼容鼠标事件」的窗口（ms）。
 * Chrome 在 `touchend` 后必然补发一串 mouseover / mousemove / mousedown / mouseup（含把 hover 还原到
 * 鼠标静置格的那次 mouseover）——不挡掉就会把轻触选中的格抢回鼠标静置格；窗口外的正常悬停不受影响。
 */
const TOUCH_MOUSE_GUARD = 450;

interface SlotRect { left: number; top: number; width: number; height: number }

const inst = getCurrentInstance();

/** 展示序（默认序来自 `buildInventory`；拖曳只改这一份内存 state） */
const ordered = ref<InventoryItem[]>([]);
const occupiedTotal = ref(0);
const overflows = ref<InventoryOverflow[]>([]);

const cells = computed<(InventoryItem | null)[]>(() =>
  Array.from({ length: SLOT_COUNT }, (_, i) => ordered.value[i] || null),
);
const gridStyle = computed(() => `grid-template-columns: repeat(${SLOT_COLUMNS}, 1fr);`);

const tipIndex = ref(-1);
const tipStyle = ref('');
const tipCell = computed<InventoryItem | null>(() =>
  tipIndex.value >= 0 ? ordered.value[tipIndex.value] || null : null,
);
/** 本层是否带操作按钮（籽格【合成】/ 玉格【分解】/ 兰帖格【分解】）—— 只影响高度估算与触摸命中守卫 */
const tipHasActions = computed<boolean>(() => {
  const cell = tipCell.value;
  if (!cell) return false;
  return cell.kind === 'seed' || cell.kind === 'scroll' || (cell.kind === 'jade' && !!cell.jadeId);
});

/**
 * 本格诗句（**单一来源** = `business/asset-text.ts` 的 `ASSET_POEMS` / `assetPoem()`）——
 * 在属性提示层内随道具类型显示；空串 = 不渲染该行（**不新造文案**，组件内零诗句字面）。
 */
const tipPoem = computed<string>(() => (tipCell.value ? assetPoem(tipCell.value.kind) : ''));

/** 籽总数（合成门槛判定用；仍取自页面传入的 `summary`，组件不二次取数） */
const seedsTotal = computed(() => props.summary?.seeds_total ?? 0);
/** 籽是否够合成 1 枚玉（`JADE_SYNTH_SEEDS`；不足 → 按钮置灰 +「再攒 N 颗」） */
const canSynthesize = computed(() => seedsTotal.value >= JADE_SYNTH_SEEDS);
/** 还差多少颗可合成（由 summary 现算，不写死示例值） */
const seedsToGo = computed(() => Math.max(0, JADE_SYNTH_SEEDS - seedsTotal.value));
/** 玉操作（合成 / 分解）进行中：并发保护，期间按钮不可点 */
const busy = ref(false);

// ============ 兰帖（分解 · §14-13 两口径；比例 / 文案单点 = `business/asset-text.ts`） ============
//
// 兰帖与玉 / 籽的**关键差异**：分解入参单位 = **成品（整）兰帖张数**（1 张 = 100 片），返还每张 **99** 片
// （后端 `SCROLL_DECOMPOSE_REFUND`，留 1 片损耗 ⇒ 避免「返还即触发满 100 自动合成」的空操作回环；
// 口径见 `docs/friend-domain.spec.md` §17-7 / §17-8）。因此：
// - 【分解】只在**整堆格**（每格恒 100 片）可用；**余数格**（不足 1 张）不可分解；
// - 被续约申请锁定的张数（`scrollLockOf` 投影）不可分解（否则待对方确认时会 409）；
// - 未达标一律「按钮置灰 + 层内明写原因 + 点按直出同一句」⇒ **三态可见、不静默**。
/** 每张成品兰帖片数（`business/inventory.ts` 常量：100 片 = 1 张） */
const SCROLL_PIECES = SCROLL_PIECES_PER_ITEM;
/** 分解每枚的返还片数 = 100 − 1（每枚留 1 片损耗；与后端 `SCROLL_DECOMPOSE_REFUND` 同值，由常量相减得出） */
const SCROLL_REFUND_PER_ITEM = SCROLL_PIECES_PER_ITEM - 1;

/** 本人兰帖片总数（Σ `scroll_lots[].qty`；取自页面传入的 `summary`，组件不二次取数） */
const scrollPiecesTotal = computed(() => {
  const lots = (props.summary as InventorySummary | null)?.scroll_lots || [];
  return lots.reduce((sum, lot) => sum + Math.max(0, Number(lot.qty) || 0), 0);
});
/** §14-13 ① **格数**（展示层唯一口径）= 行囊占格，**含余数格**（整格 100 片 + 零头另占 1 格） */
const scrollCellCount = computed(() => Math.ceil(scrollPiecesTotal.value / SCROLL_PIECES));
/** §14-13 ② **张数**（整道具数，= 接口 `scrolls_item_count` 口径）= `floor(片总数 / 100)` —— **不是格数** */
const scrollItemCount = computed(() => Math.floor(scrollPiecesTotal.value / SCROLL_PIECES));
/** 续约申请锁定的兰帖片数（`scrollLockView.pieces` 单位 = 成品张数 ⇒ × 100 折算成片） */
const lockedScrollPieces = computed(() => Math.max(0, props.scrollLock?.pieces || 0) * SCROLL_PIECES);
/** 可分解张数 = `floor((片总数 − 锁定片数) / 100)`（锁定中的张数不参与） */
const scrollDecomposableCount = computed(() =>
  Math.floor(Math.max(0, scrollPiecesTotal.value - lockedScrollPieces.value) / SCROLL_PIECES));
/** 当前兰帖格是否可分解（**整堆格** 且 可分解张数 ≥ 1） */
const canDecomposeScroll = computed<boolean>(() => {
  const cell = tipCell.value;
  return !!cell && cell.kind === 'scroll' && cell.slotKind === 'stack' && scrollDecomposableCount.value >= 1;
});
/** 未达标原因（**必须显示**；余数格与锁定各一句，文案单点 = `asset-text.ts`） */
const scrollDisabledNote = computed<string>(() => {
  const cell = tipCell.value;
  if (!cell || cell.kind !== 'scroll') return '';
  if (cell.slotKind !== 'stack') return scrollRemainderReasonLine(cell.count, SCROLL_PIECES);
  if (scrollDecomposableCount.value < 1) return scrollLockedReasonLine();
  return '';
});
/** 层内分解比例行（1 张 = 100 片 ⇒ 返还 99 片，留 1 片损耗） */
const scrollHintText = computed<string>(() => scrollDecomposeHintLine(SCROLL_PIECES, SCROLL_REFUND_PER_ITEM));
/** 层内「格数 / 张数」两口径行（提示层内并列展示，**不得混用**） */
const scrollCaliberText = computed<string>(() =>
  scrollCaliberLine(scrollCellCount.value, scrollItemCount.value, SCROLL_PIECES));

// ============ 提示层按钮的指针态（H5 悬停 / 全端按下） ============
//
// 由来：`.inv-tip-btn.is-hover`（外发光 + 玉纹循环 `inv-fx-vein`）与 `.inv-tip-btn.is-press`（凹陷回弹）
// 两条样式此前**没有任何模板绑定** ⇒ 死 CSS（悬停外发光与循环扫光从不生效，按下凹陷从不生效）。
// 本段把两条通道**真实接线**，且不新造任何状态源：
// - H5 悬停 / 按下：复用**已有的文档级鼠标通道** —— `mouseover` / `mousemove`（`onDocumentMouseOver` /
//   `onDocumentHoverMove`）与 `mousedown` / `mouseup`（`onDocumentMouseDown` / `onDocumentMouseUp`）；
//   是否落在按钮上 = `composedPath()` 里找 `.inv-tip-btn`（与 `inTipLayer` 同一手法、同一坐标系）。
// - 小程序：无 hover ⇒ **不接 `is-hover`**（触屏端由 `.sheen-once` 的一次性 transition 扫光承担）；
//   `is-press` 走既有触摸通道，落点按**按钮实测包围盒**（`inBtnBox`）判定。
// 口径（与既有交互一致，一律不改）：
// - 提示层「关闭边界 = 源格 ∪ 提示层」、`TIP_UNION_TOL`、`mouseGuarded` 触摸后抑制、拖曳会话
//   （`session` / `dragging`）优先级**全部不变**：悬停 / 按下按钮时指针在层内，`hoverAt` 走
//   `inTipLayer` 早退 ⇒ 层不闪关；拖曳 / 确认框打开期间本状态机一律不介入（不抢焦）。
// - **零布局**：两个类只改 `box-shadow` / `transform` / 叠加层 `opacity`，按钮 layout box 恒 52 × 26px。
/**
 * 提示层内按钮标识（同一时刻层内只剩一颗：籽格【合成】/ 玉格【分解】/ 兰帖格【分解】；'' = 无按钮）。
 * `decomposeScroll` 与 `decompose` **分开**：分属两条不同后端路由（`/assets/decompose-jade` /
 * `/assets/scroll/decompose`），指针态与分支各归各，**不共用同一个键**。
 */
type TipBtnKind = '' | 'synth' | 'decompose' | 'decomposeScroll';
const tipBtnKind = computed<TipBtnKind>(() => {
  const cell = tipCell.value;
  if (!cell) return '';
  if (cell.kind === 'seed') return 'synth';
  if (cell.kind === 'jade' && cell.jadeId) return 'decompose';
  if (cell.kind === 'scroll') return 'decomposeScroll';
  return '';
});
/** 悬停态承载（每颗按钮各自的态；仅 H5 置位） */
const btnHover = ref<TipBtnKind>('');
/** 按下态承载（H5 鼠标按下 / 全端触摸按下） */
const btnPress = ref<TipBtnKind>('');
/** 同值不写 ⇒ 指针在同态内连续移动不触发多余渲染 */
function setBtnHover(kind: TipBtnKind): void {
  if (btnHover.value !== kind) btnHover.value = kind;
}
function setBtnPress(kind: TipBtnKind): void {
  if (btnPress.value !== kind) btnPress.value = kind;
}
/**
 * 按钮实测包围盒（**与指针事件同坐标系**，同 `tipBox` 口径）。
 * 仅供**小程序**触摸落点判定用（H5 有 `composedPath`，不需要坐标）；层收起 / 换格即置空。
 */
let btnBox: { left: number; top: number; width: number; height: number } | null = null;
function measureBtnBox(): void {
  if (!tipBtnKind.value) {
    btnBox = null;
    return;
  }
  measureRects('.inv-tip-btn', true, (list) => {
    const r = list[0];
    btnBox = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  });
}
function inBtnBox(x: number, y: number, tol = 0): boolean {
  const b = btnBox;
  if (!b) return false;
  return x >= b.left - tol && x <= b.left + b.width + tol &&
    y >= b.top - tol && y <= b.top + b.height + tol;
}

// ============ 行囊操作特效（V3 灵石共鸣）+ 自绘二次确认框 ============
//
// 设计源 = 派单提供的 `inv-fx-mockup.html`（V3 分区块 + 共享附录 A/B/D）；此处只落**实现可用**的部分：
// 一次性特效全部 = `transition` + 定时链（跨端同路，零 @keyframes）；循环态 `@keyframes` 仅 2 条且**只在 H5**
// （见样式区 `#ifdef H5`，小程序端零 keyframes ⇒ 静态态 + transition 代替）。
// 层序（逐字执行派单裁定）：格位特效 1014 / 全屏冲击 1016 / 结果提示 1018 / 自绘确认 1030·1031。

/** 合成特效总时长（ms；设计源 V3 `timings.synth = 780`） */
const FX_SYNTH_MS = 780;
/** 分解特效总时长（ms；`timings.decomp = 680`） */
const FX_DECOMP_MS = 680;
/** 失败反馈总时长（ms；`timings.fail = 520`） */
const FX_FAIL_MS = 520;
/** 合成目标格收束相位（ms；`reveal.synth = 560`）—— 不早于此刻才重拉 summary */
const FX_REVEAL_SYNTH_MS = 560;
/** 分解目标格收束相位（ms；`reveal.decomp = 520`） */
const FX_REVEAL_DECOMP_MS = 520;
/** 收束标记最长挂起（ms）：summary 迟迟不回就不再补播（防陈旧标记落到下一次无关刷新） */
const FX_REVEAL_TTL_MS = 3000;
/** 结果浮字驻留 / 淡出（ms；收尾相位，不阻塞 `busy`） */
const FX_FLOAT_HOLD_MS = 1400;
const FX_FLOAT_FADE_MS = 220;
/** 帧兜底等待（ms）：rAF 被节流（后台标签页 / 省电模式）或小程序无 rAF 时由定时接管，先到者生效 */
const FX_FRAME_MS = 40;
/** 缓动（逐条取自设计源附录） */
const FX_EASE_OUT = 'cubic-bezier(.22,.61,.36,1)';
const FX_EASE_IN = 'cubic-bezier(.55,.06,.68,.19)';
const FX_EASE_POP = 'cubic-bezier(.34,1.56,.64,1)';
/** 特效承载层哨兵：-1 = 全屏冲击层、-2 = 结果提示层、-3 = 无承载格（不渲染，仅容错） */
const FX_GLOBAL_SLOT = -1;
const FX_RESULT_SLOT = -2;
const FX_NO_SLOT = -3;

/**
 * 一个特效元素 = 一个**绝对定位叠加层**子节点（`style` = 完整 inline style，含 transition）。
 * `text` = 结果提示层浮字文本（**必须写进节点**：`.fx-result` 循环渲染 `n.text`，否则外层只剩无文本空药丸）；
 * 格位层 / 全屏层不带文本。
 */
interface FxNode { id: number; slot: number; cls: string; style: string; text?: string }

let fxSeq = 0;
/** 在飞特效节点：按**格位序号**承载 ⇒ 数据刷新重建格位时自动复挂到同一格位（在飞特效不被抹掉） */
const fxNodes = ref<FxNode[]>([]);

/** 每格的格位特效子节点（36 个空数组的重建开销可忽略）—— 模板以 `fxLayers[i]` 渲染，不参与布局 */
const fxLayers = computed<FxNode[][]>(() => {
  const out: FxNode[][] = Array.from({ length: SLOT_COUNT }, () => []);
  fxNodes.value.forEach((n) => {
    if (n.slot >= 0 && n.slot < SLOT_COUNT) out[n.slot].push(n);
  });
  return out;
});
const fxGlobal = computed<FxNode[]>(() => fxNodes.value.filter((n) => n.slot === FX_GLOBAL_SLOT));
const fxResult = computed<FxNode[]>(() => fxNodes.value.filter((n) => n.slot === FX_RESULT_SLOT));

/** 定时链句柄（卸载时统一清理；每段触发后自行出列，长跑不累积） */
const fxTimers: ReturnType<typeof setTimeout>[] = [];
function fxAfter(ms: number, fn: () => void): void {
  const id: ReturnType<typeof setTimeout> = setTimeout(() => {
    const i = fxTimers.indexOf(id);
    if (i >= 0) fxTimers.splice(i, 1);
    fn();
  }, Math.max(0, ms));
  fxTimers.push(id);
}
function fxClearTimers(): void {
  while (fxTimers.length) clearTimeout(fxTimers.pop() as ReturnType<typeof setTimeout>);
}

/** 一帧兜底：H5 走 rAF（前台真机即 1 帧）；被节流 / 小程序无 rAF ⇒ 定时接管（先到者生效，先例设计源附录 D） */
function fxFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    let fired = false;
    const run = (): void => {
      if (fired) return;
      fired = true;
      resolve();
    };
    // #ifdef H5
    requestAnimationFrame(run);
    // #endif
    setTimeout(run, FX_FRAME_MS);
  });
}
/** 铺满承载格的几何（格位层 / 卡片层通用） */
function fxFill(radius = '8px'): Record<string, string> {
  return { left: '0', top: '0', width: '100%', height: '100%', borderRadius: radius };
}
/** inline style 拼装（键值对 → `k:v;`；`transition` 单独走 `fxStyle`，避免各处手拼字符串） */
function fxCss(parts: Record<string, string | number>): string {
  let out = '';
  for (const key of Object.keys(parts)) out += `${key}:${parts[key]};`;
  return out;
}
/** 「几何 + 外观」+ transition（`trans` 为空 = **无过渡的起始态**，供两帧法起手） */
function fxStyle(base: string, trans: string): string {
  return trans ? `${base} transition: ${trans};` : `${base} transition: none;`;
}
/** 过渡声明：transform / opacity / box-shadow / border-color 同参数（口径同设计源 `tween`） */
function fxTrans(ms: number, ease: string, delay = 0): string {
  const t = `${Math.round(ms)}ms ${ease} ${Math.round(delay)}ms`;
  return `transform ${t}, opacity ${t}, box-shadow ${t}, border-color ${t}`;
}
/** 新建特效节点（写入起始态 + 可选浮字文本）—— `reactive` 保证后续 style 改写触发渲染 */
function fxAdd(slot: number, cls: string, base: string, text = ''): FxNode {
  fxSeq += 1;
  const node = reactive<FxNode>({ id: fxSeq, slot, cls: `fx-el${cls ? ` ${cls}` : ''}`, style: fxStyle(base, ''), text });
  fxNodes.value.push(node);
  return node;
}
/** 两帧法：等一次渲染（起始态）→ 写终态 + transition ⇒ 过渡必然从起始态出发 */
async function fxPlay(node: FxNode, base: string, trans: string): Promise<void> {
  await nextTick();
  await fxFrame();
  node.style = fxStyle(base, trans);
}
/** 两段式播放：起手 → `after` ms 后改写终态（→ 可选再 `removeAfter` ms 移除节点） */
function fxPlayThen(
  node: FxNode,
  base: string,
  trans: string,
  after: number,
  base2: string,
  trans2: string,
  removeAfter = 0,
): void {
  void fxPlay(node, base, trans);
  fxAfter(after, () => {
    node.style = fxStyle(base2, trans2);
  });
  if (removeAfter > 0) fxAfter(removeAfter, () => fxRemove(node));
}
function fxRemove(node: FxNode): void {
  fxNodes.value = fxNodes.value.filter((n) => n.id !== node.id);
}

/** 格内罩层（inset 阴影脉冲）—— 真格零触碰，只叠一层 */
function fxGild(slot: number, shadow: string, dur: number, peak = '1'): void {
  const box: Record<string, string> = { ...fxFill(), boxShadow: shadow };
  const node = fxAdd(slot, '', fxCss({ ...box, opacity: 0 }));
  fxPlayThen(
    node,
    fxCss({ ...box, opacity: peak }), fxTrans(dur * 0.4, FX_EASE_OUT), dur * 0.6,
    fxCss({ ...box, opacity: 0 }), fxTrans(dur * 0.6, FX_EASE_OUT), dur,
  );
}
/** 落定回弹（叠加层做 scale；**真实格零 transform**） */
function fxPop(slot: number, shadow: string, dur: number, from: string, peak = '.95'): void {
  const box: Record<string, string> = { ...fxFill(), boxShadow: shadow };
  const node = fxAdd(slot, '', fxCss({ ...box, opacity: 0, transform: `scale(${from})` }));
  fxPlayThen(
    node,
    fxCss({ ...box, opacity: peak, transform: 'scale(1)' }), fxTrans(dur * 0.5, FX_EASE_POP), dur * 0.5,
    fxCss({ ...box, opacity: 0, transform: 'scale(1)' }), fxTrans(dur * 0.5, FX_EASE_OUT), dur,
  );
}
/** 环（border 双色 + scale 扩散）：替代 `conic-gradient` / `mask` 的做法（小程序不支持后者） */
function fxRing(
  slot: number,
  o: { color: string; size: number; dur: number; delay?: number; to?: string; peak?: string; shadow?: string },
): void {
  const to = o.to || '2.3';
  const peak = o.peak || '.95';
  const geom: Record<string, string> = {
    left: `${50 - o.size / 2}%`, top: `${50 - o.size / 2}%`, width: `${o.size}%`, height: `${o.size}%`,
    borderRadius: '50%', border: `2px solid ${o.color}`,
  };
  const box: Record<string, string> = o.shadow ? { ...geom, boxShadow: o.shadow } : geom;
  const node = fxAdd(slot, '', fxCss({ ...box, opacity: 0, transform: 'scale(.35)' }));
  const d1 = o.dur * 0.45;
  fxPlayThen(
    node,
    fxCss({ ...box, opacity: peak, transform: `scale(${to})` }), fxTrans(d1, FX_EASE_OUT, o.delay || 0), o.dur - d1,
    fxCss({ ...box, opacity: 0, transform: `scale(${to})` }), fxTrans(o.dur - d1, FX_EASE_OUT), o.dur,
  );
}
/** 涟漪（地面环：从格心向外扩散） */
function fxRipple(
  slot: number,
  o: { color: string; size: number; dur: number; delay?: number; from?: number; to?: number },
): void {
  const from = o.from ?? 0.5;
  const to = o.to ?? 2.6;
  const geom: Record<string, string> = {
    left: `${50 - o.size / 2}%`, top: `${50 - o.size / 2}%`, width: `${o.size}%`, height: `${o.size}%`,
    borderRadius: '50%', border: `2px solid ${o.color}`,
  };
  const node = fxAdd(slot, '', fxCss({ ...geom, opacity: 0, transform: `scale(${from})` }));
  const d1 = o.dur * 0.4;
  fxPlayThen(
    node,
    fxCss({ ...geom, opacity: '.9', transform: `scale(${to})` }), fxTrans(d1, FX_EASE_OUT, o.delay || 0), o.dur - d1,
    fxCss({ ...geom, opacity: 0, transform: `scale(${(to * 1.12).toFixed(3)})` }), fxTrans(o.dur - d1, FX_EASE_OUT), o.dur,
  );
}
/** 裂纹（单层：`rotate` 恒定 + `scaleY` 自格心生长 —— 同函数序变换可逐项插值，故无需嵌套外层） */
function fxCrack(slot: number, o: { angle: number; len: number; dur: number; delay?: number }): void {
  const geom: Record<string, string> = {
    left: '50%', top: '50%', width: '2px', marginLeft: '-1px', height: `${o.len}%`,
    background: 'linear-gradient(180deg, rgba(255,246,248,0) 0%, rgba(255,246,248,.9) 45%, rgba(255,246,248,0) 100%)',
  };
  const spin = `translateY(-50%) rotate(${o.angle}deg)`;
  const node = fxAdd(slot, '', fxCss({ ...geom, opacity: 0, transform: `${spin} scaleY(0)` }));
  const d1 = o.dur * 0.45;
  fxPlayThen(
    node,
    fxCss({ ...geom, opacity: '.92', transform: `${spin} scaleY(1)` }), fxTrans(d1, FX_EASE_OUT, o.delay || 0), o.dur - d1,
    fxCss({ ...geom, opacity: 0, transform: `${spin} scaleY(1)` }), fxTrans(o.dur - d1, FX_EASE_OUT), o.dur,
  );
}
/** 高光扫过（单层 `scaleX` 扫过并在格内收束；**不越格**且不必嵌套裁切层） */
function fxSheen(slot: number, color: string, dur: number): void {
  const geom: Record<string, string> = {
    left: '0', top: '36%', width: '100%', height: '28%', borderRadius: '6px',
    background: `linear-gradient(100deg, rgba(255,246,248,0) 0%, ${color} 45%, rgba(255,246,248,0) 100%)`,
  };
  const node = fxAdd(slot, '', fxCss({ ...geom, opacity: 0, transform: 'scaleX(.12)' }));
  const d1 = dur * 0.55;
  fxPlayThen(
    node,
    fxCss({ ...geom, opacity: '1', transform: 'scaleX(1)' }), fxTrans(d1, FX_EASE_OUT), dur - d1,
    fxCss({ ...geom, opacity: 0, transform: 'scaleX(1)' }), fxTrans(dur - d1, FX_EASE_OUT), dur,
  );
}
/** 地面微震：**只动特效层**（真格 / 卡片 / 提示层零位移） */
function fxQuake(amp: number, dur: number, peak: string, bg: string): void {
  const node = fxAdd(FX_GLOBAL_SLOT, '', fxCss({ ...fxFill('0'), background: bg, opacity: 0 }));
  void fxPlay(
    node,
    fxCss({ ...fxFill('0'), background: bg, opacity: peak, transform: 'translate(0px, 0px)' }),
    fxTrans(dur / 4, FX_EASE_IN),
  );
  const keys: Array<[number, number]> = [[amp * 0.6, 0], [-amp * 0.6, amp * 0.4], [0, 0]];
  keys.forEach((p, i) => {
    fxAfter(((i + 1) * dur) / 4, () => {
      node.style = fxStyle(
        fxCss({ ...fxFill('0'), background: bg, opacity: peak, transform: `translate(${p[0]}px, ${p[1]}px)` }),
        fxTrans(dur / 4, i % 2 ? FX_EASE_OUT : FX_EASE_IN),
      );
    });
  });
  fxAfter(dur, () => {
    node.style = fxStyle(
      fxCss({ ...fxFill('0'), background: bg, opacity: 0, transform: 'translate(0px, 0px)' }),
      fxTrans(140, 'linear'),
    );
  });
  fxAfter(dur + 160, () => fxRemove(node));
}
/** 角标跳动（唯一被施加 transform 的真实节点；不动格 / 卡片尺寸） */
function fxBadgePop(slot: number): void {
  badgePopIndex.value = slot;
  fxAfter(120, () => {
    if (badgePopIndex.value === slot) badgePopIndex.value = -1;
  });
}
/**
 * 结果浮字量词 / 道具名的**唯一取值点**：`business/inventory.ts` 的 `KIND_NAME` / `KIND_QTY_UNIT`
 * 未对外导出，本组件经其唯一出口 `buildInventory` 取值 —— 用一份**最小合成总览**跑一次装配，
 * 读回同类格的道具名（`item.name`）与量词（`item.tooltipLines[0]` = `${count} ${KIND_QTY_UNIT[kind]}`
 * 的第二段）⇒ 组件内**零字面量文案**、与提示层 / 溢出行的用词逐字同源（不新造文案）。
 * 用探针而非实时 `ordered`：浮字时刻目标道具（新合成的玉 / 刚返还的籽）可能尚未重拉落地。
 */
const FX_LABEL_PROBE: Inventory = buildInventory({
  bamboo_lots: [{ id: 'fx-label', qty: 1, expires_at: '' }],
  jades: [{ id: 'fx-label', expires_at: '' }],
  seed_lots: [{ id: 'fx-label', qty: 1, expires_at: '' }],
  fragments: 1,
  // 兰帖分解的结果浮字要取「片兰帖残页」的量词 / 道具名 ⇒ 探针需含兰帖残页（否则该类不显浮字）
  scroll_fragments: 1,
} as unknown as AssetsSummary);
/** 浮字量词 + 道具名（如 `枚石榴籽玉` / `颗石榴籽`）；取不到则该类不显浮字 */
function fxQtyLabel(kind: InventoryKind): string {
  const item = FX_LABEL_PROBE.slots.find((it): it is InventoryItem => !!it && it.kind === kind);
  if (!item) return '';
  const unit = (item.tooltipLines[0] || '').split(' ')[1] || '';
  return unit ? `${unit}${item.name}` : '';
}
/** 结果浮字文案 = **数量摘要**（如 `+1 枚石榴籽玉` / `+999 颗石榴籽`）—— 完整回执仍由 `uni.showToast` 交付 */
function fxQtySummary(kind: InventoryKind, count: number): string {
  const label = fxQtyLabel(kind);
  return label ? `+${count} ${label}` : '';
}
/**
 * 结果提示层浮字（1018）。`text` = **数量摘要**（`fxQtySummary` 拼出，不新造文案）；空串直接不渲染
 * （宁可不出字，也不留无文本空药丸）。文本写进节点 `FxNode.text` 由模板渲染，样式单行截断
 * （`.fx-float` 的 `nowrap` + `ellipsis`）⇒ 文字再长也不撑破层 / 卡片 / 格。**完整回执仍由 `uni.showToast` 交付**。
 */
function fxFloat(text: string, fail = false): void {
  if (!text) return;
  const base = fxCss({ left: '4%', right: '4%', top: '54%' });
  const node = fxAdd(FX_RESULT_SLOT, fail ? 'fx-float fail' : 'fx-float', `${base}transform:translateY(-50%) scale(.96);opacity:0;`, text);
  void fxPlay(node, `${base}transform:translateY(-50%) scale(1);opacity:1;`, fxTrans(200, FX_EASE_POP));
  fxAfter(FX_FLOAT_HOLD_MS, () => {
    node.style = fxStyle(`${base}transform:translateY(-56%) scale(.98);opacity:0;`, fxTrans(FX_FLOAT_FADE_MS, FX_EASE_OUT));
  });
  fxAfter(FX_FLOAT_HOLD_MS + FX_FLOAT_FADE_MS, () => fxRemove(node));
}
/** 失败：按钮 5 段横向抖动（只动 `transform` ⇒ 盒尺寸不变）+ 提示层边框泛红（零 @keyframes） */
function fxButtonShake(): void {
  const steps = [0, -3, 3, -2, 0];
  const stepMs = 70;
  btnShake.value = `transition: transform ${stepMs}ms linear; transform: translateX(0px);`;
  steps.forEach((x, i) => {
    fxAfter(i * stepMs, () => {
      btnShake.value = `transition: transform ${stepMs}ms linear; transform: translateX(${x}px);`;
    });
  });
  fxAfter(steps.length * stepMs, () => {
    btnShake.value = '';
  });
}
/** 收尾清层：移除全部叠加层 + 复位失败态（在飞定时链对已移除节点为空操作） */
function clearFx(): void {
  fxNodes.value = [];
  badgePopIndex.value = -1;
  tipFailed.value = false;
  btnShake.value = '';
}
/** 等一段时长（已是过去相位则立即返回）—— 把「重拉数据 / 收尾」对齐到特效相位 */
function fxWait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => fxAfter(ms, resolve));
}

/** 合成（V3）：地面微震 → 双层玉纹高光圈 → 3 圈涟漪 → 玉纹高光罩层（总 780ms；收束相位 560ms） */
function fxSynth(src: number): void {
  fxQuake(3, 200, '.85', 'radial-gradient(70% 40% at 50% 78%, rgba(208,126,141,.22), rgba(208,126,141,0) 70%)');
  fxRing(src, { color: 'rgba(251,224,228,.7)', size: 52, dur: 520, to: '2.0', shadow: '0 0 12px rgba(208,126,141,.5)' });
  fxRing(src, { color: 'rgba(208,126,141,.8)', size: 46, dur: 520, delay: 90, to: '2.0', shadow: '0 0 12px rgba(208,126,141,.5)' });
  [180, 320, 460].forEach((d) => fxRipple(src, { color: 'rgba(251,224,228,.85)', size: 46, dur: 420, delay: d, to: 2.6 }));
  fxGild(src, 'inset 0 0 0 2px rgba(251,224,228,.9), inset 0 0 16px rgba(208,126,141,.6)', 640);
}
/** 分解（V3）：5 条蛛网裂纹自格心放射 + 玉格内暗化 + 玉色光环向内收（总 680ms；收束相位 520ms） */
function fxDecomp(src: number): void {
  [[0, 46], [72, 34], [-66, 36], [144, 26], [-138, 28]].forEach((a, i) =>
    fxCrack(src, { angle: a[0], len: a[1], dur: 200, delay: i * 20 }));
  fxGild(src, 'inset 0 0 0 2px rgba(168,90,107,.9), inset 0 0 18px rgba(90,40,50,.6)', 460, '.95');
  fxRipple(src, { color: 'rgba(208,126,141,.85)', size: 54, dur: 420, delay: 200, from: 1.15, to: 1 });
}
/**
 * 目标格收束（数据重拉 + 重建之后才能定位新格）：
 * 合成 → 玉胚成形（罩层 + 高光扫过 + 落定回弹）；分解 → 籽格显形（涟漪 + 罩层 + 回弹 + 角标跳动）；
 * 兰帖分解 → **兰帖碎片格显形**（同「带角标」体例，角标跳动）。
 * 目标格口径同设计源 = **该类型的第一格**（默认序：玉 / 籽 / 兰帖碎片 均在竹简之后，确定可复现）。
 */
function fxRevealTarget(kind: 'jade' | 'seed' | 'scrollFragment'): void {
  const index = ordered.value.findIndex((it) => it.kind === kind);
  if (index < 0) return;
  if (kind === 'jade') {
    fxGild(index, 'inset 0 0 0 2px rgba(251,224,228,.95), inset 0 0 18px rgba(208,126,141,.7)', 400);
    fxSheen(index, 'rgba(255,246,248,.95)', 300);
    fxPop(index, 'inset 0 0 0 2px rgba(251,224,228,.95), inset 0 0 20px rgba(208,126,141,.55)', 340, '1.14');
  } else {
    fxRipple(index, { color: 'rgba(251,224,228,.9)', size: 44, dur: 420, to: 2.2 });
    fxGild(index, 'inset 0 0 0 1px rgba(251,224,228,.9)', 360, '.9');
    fxPop(index, 'inset 0 0 0 1px rgba(251,224,228,.9), inset 0 0 14px rgba(251,224,228,.9)', 320, '.92');
    fxBadgePop(index);
  }
}
/** 等重建落地（DOM + 一帧）再补播目标格收束，保证目标格已在场 */
async function runReveal(kind: 'jade' | 'seed' | 'scrollFragment'): Promise<void> {
  await nextTick();
  await fxFrame();
  fxRevealTarget(kind);
}

/**
 * 失败反馈（520ms）：抖动 + 层泛红 → 清层 →（可选）结果浮字。
 * 本路径浮字沿用**既有**「再攒 N 颗」原文（与同一次 `uni.showToast` 同源、非新造、无安慰性词句）；
 * 传空串则不显浮字（不渲染空药丸）。成功路径浮字 = 数量摘要，**完整回执仍由 `uni.showToast` 交付**。
 */
let failFxRunning = false;
async function failFeedback(floatText: string): Promise<void> {
  if (failFxRunning) return;
  failFxRunning = true;
  tipFailed.value = true;
  fxButtonShake();
  await fxWait(FX_FAIL_MS);
  clearFx();
  if (floatText) fxFloat(floatText, true);
  failFxRunning = false;
}

/** 待补播的收束标记（操作成功 → 页面重拉 summary → `rebuild` 后按新格位补播；`scrollFragment` = 兰帖分解返还） */
let pendingReveal: { kind: 'jade' | 'seed' | 'scrollFragment'; at: number } | null = null;
/** 打开确认框时的源格位序号（特效承载格；确认框打开期间提示层保持不动，故与 `tipIndex` 同步取值） */
let confirmSrc = FX_NO_SLOT;

/**
 * 自绘二次确认框状态（`null` = 关闭）。
 * 文案 / 按钮文案：合成与玉分解逐字取 `business/jade-ops.ts`；**兰帖分解**逐字取
 * `business/asset-text.ts`（1 张 = 100 片 ⇒ 返还 99 片）。三者共用同一个确认框（1030/1031）。
 */
const confirmKind = ref<'synth' | 'decompose' | 'scroll' | null>(null);
const confirmJadeId = ref('');
const confirmOpen = computed<boolean>(() => confirmKind.value !== null);
const confirmTitle = computed<string>(() => {
  if (confirmKind.value === 'scroll') return SCROLL_DECOMPOSE_TITLE;
  return (confirmKind.value === 'synth' ? SYNTH_CONFIRM_TITLE : DECOMPOSE_CONFIRM_TITLE);
});
const confirmLines = computed<string[]>(() => {
  // 兰帖分解：每次 1 张（100 片 ⇒ 返还 99 片）—— 张数口径，非格数
  if (confirmKind.value === 'scroll') return scrollDecomposeConfirmLines(1, SCROLL_PIECES, SCROLL_REFUND_PER_ITEM);
  return (confirmKind.value === 'synth' ? SYNTH_CONFIRM_BODY : DECOMPOSE_CONFIRM_BODY).split('\n');
});
const confirmOkText = computed<string>(() => (confirmKind.value === 'synth' ? '确认合成' : '确认分解'));

/** 结果提示层 / 失败态的渲染状态（`badgePopIndex` = 角标跳动承载格；`sheenOnce` = 一次性玉纹扫光） */
const badgePopIndex = ref(-1);
const tipFailed = ref(false);
const btnShake = ref('');
const sheenOnce = ref(false);
/**
 * 一次性扫光窗口（ms；`transition` 820ms + 两帧法起手 ⇒ 900ms 足以播完）
 * 与句柄 / 「本开层窗口是否已后延」标记（离开按钮时用：见下方 `watch(btnHover)`）。
 */
const SHEEN_ONCE_MS = 900;
let sheenTimer: ReturnType<typeof setTimeout> | null = null;
let sheenLanded = false;
/** 重排一次性扫光窗口（先清旧句柄，避免两个窗口并存） */
function armSheenWindow(ms = SHEEN_ONCE_MS): void {
  if (sheenTimer) clearTimeout(sheenTimer);
  sheenTimer = setTimeout(() => {
    sheenTimer = null;
    sheenOnce.value = false;
  }, ms);
}
/** 确认框入场（两帧法：先渲染起始态，再挂 `.is-in` 播 180ms 上浮；零 @keyframes） */
const confirmIn = ref(false);
watch(confirmKind, async (kind) => {
  confirmIn.value = false;
  if (!kind) return;
  await nextTick();
  await fxFrame();
  confirmIn.value = true;
});

/**
 * 打开自绘确认框（本层保持打开：确认框 **1030/1031** 恒在提示层 **1010** 之上 ⇒ 旧「先 `closeTip()`
 * 再弹框」的绕法**已不需要**；同时**不使用 `uni.showModal`** —— 其 `.uni-modal` 999 会被本层压住）。
 * 三个动作共用：`synth`（籽）/ `decompose`（玉，带 `jadeId`）/ `scroll`（兰帖，按**张**分解）。
 */
function openConfirm(kind: 'synth' | 'decompose' | 'scroll', jadeId = ''): void {
  if (busy.value) return;
  confirmSrc = tipIndex.value;
  confirmJadeId.value = jadeId;
  confirmKind.value = kind;
}
/** 取消：零扣费、零状态变更 */
function cancelConfirm(): void {
  confirmKind.value = null;
  confirmJadeId.value = '';
}
function submitConfirm(): void {
  const kind = confirmKind.value;
  const jadeId = confirmJadeId.value;
  cancelConfirm();
  if (kind === 'synth') void doSynthesize();
  else if (kind === 'decompose' && jadeId) void doDecompose(jadeId);
  else if (kind === 'scroll') void doDecomposeScroll();
}

/** 提示层打开：一次性玉纹高光扫过（触屏端无 hover ⇒ 用 transition 播同一条扫光，跨端同效） */
watch(tipIndex, async (index) => {
  sheenOnce.value = false;
  sheenLanded = false; // 新的一次开层窗口 ⇒ 允许（且只允许）一次「让扫光落地」的后延
  if (index < 0) return;
  await nextTick();
  await fxFrame();
  sheenOnce.value = true;
  armSheenWindow();
});

/**
 * 悬停接管后离开按钮 ⇒ **让这一次扫光落地播完**。
 *
 * 口径：`.btn-sheen` 上没有 `is-hover` 时本条一次性 `transition` 才参与（820ms 扫完 -180% → 360%）；
 * 指针在按钮上期间不参与。因此「窗口内先悬停、再离开」时，这一次扫光是从**离开那一刻**起真实扫过 ——
 * 若仍按开层起算的 900ms 窗口收类，扫光会被截断在半途（实测离开发生在 ~740ms 时只扫到 72%）。
 * 故把窗口整体后延一个完整窗口（900ms ≥ 820ms transition）；**同一开层窗口只后延一次**，
 * 不因反复进出按钮叠出第二次扫光（保持「一次性」语义）。
 */
watch(btnHover, (now, was) => {
  if (now || !was || !sheenOnce.value || sheenLanded || tipIndex.value < 0) return;
  sheenLanded = true;
  armSheenWindow();
});

// ============ 操作特效块结束 ============

const dragFrom = ref(-1);
const dropIndex = ref(-1);
const dragging = ref(false);

/** 格位坐标（**与指针事件同坐标系**，见 `measureRects`） */
const slotRects = ref<SlotRect[]>([]);
/** 一次指针会话（鼠标 / 触摸共用）：起点坐标 / 起点格位 / 是否已越过阈值 */
let session: { source: 'mouse' | 'touch'; x: number; y: number; moved: boolean; fromIndex: number } | null = null;
/** 最近一次量测（节流用） */
let lastMeasure = { x: 0, y: 0, at: 0 };
/** 提示层打开方式（悬停 / 轻触；决定轻触是否按 toggle 关闭） */
let tipSource: 'hover' | 'tap' = 'tap';
/** 触摸后兼容鼠标事件的抑制截止时刻（`Date.now()` 口径） */
let mouseGuardUntil = 0;

/**
 * 提示层实测包围盒（viewport 坐标）—— 触摸路径据此把「点在本层（含按钮）」与「点在格上」区分开：
 * 提示层浮在格位之上，触摸坐标命中判定若不理它就会把按下按钮的那一下算成「点了被盖住的格」。
 *
 * **声明位置必须在下面的 `watch(..., { immediate: true })` 之前**：该 watcher 注册时就会同步执行
 * `rebuild() → closeTip() → tipBox = null`；声明在 watcher 之后会撞上 `let` 的 TDZ
 * （`ReferenceError: Cannot access 'tipBox' before initialization`）⇒ setup 直接抛错、行囊永远
 * 停在「0 / 36 格」（真机 H5 实测；单测与读代码都看不见它）。
 */
let tipBox: { left: number; top: number; width: number; height: number } | null = null;
/**
 * 最近一次定位的基准（格位 / 卡片视口坐标 + 摆向）—— 供实测后的贴合校正复用。
 *
 * **声明位置与 `tipBox` 同理，必须在下面的 `watch(..., { immediate: true })` 之前**：`closeTip()`
 * 会写它，而该 watcher 注册时同步跑 `rebuild() → closeTip()`；写在 watcher 之后会撞 `let` 的 TDZ
 * （实测 `ReferenceError: Cannot access 'tipAnchor' before initialization` ⇒ Vue 报
 * 「Unhandled error during execution of watcher callback」，本组件每次挂载必现）。
 */
let tipAnchor: {
  left: number;
  width: number;
  cellTop: number;
  cellHeight: number;
  cardTop: number;
  /** 卡片 border-box → padding box 的纵向偏移（绝对定位基准 = padding box；见 `cardOriginTop`） */
  originTop: number;
  /** 最近一次写进 inline style 的 top 值（卡片内容原点口径）—— 校正时就地平移实测包围盒用 */
  appliedTop: number;
  above: boolean;
} | null = null;
/** 是否处于触摸后的兼容鼠标事件抑制窗口内 */
function mouseGuarded(): boolean {
  return Date.now() < mouseGuardUntil;
}

/** 每次触摸事件都把抑制窗口推到 `now + TOUCH_MOUSE_GUARD`（touchstart / touchend / touchcancel 都调） */
function armMouseGuard(): void {
  mouseGuardUntil = Date.now() + TOUCH_MOUSE_GUARD;
  // 触摸 = 无悬停语义 ⇒ 按钮悬停态一律清；按下态由各触摸通道在该窗口之后按落点重置
  setBtnHover('');
  setBtnPress('');
}

/** summary 变化（含首次）→ 重建默认序（拖曳顺序不跨数据刷新保留） */
watch(() => props.summary, (summary) => rebuild(summary || null), { immediate: true });

function rebuild(summary: AssetsSummary | null): void {
  const inventory = buildInventory(summary);
  // 只取占用格（占用格连续排在 1..N）：拖曳只在它们之间进行，空格不参与
  ordered.value = inventory.slots.filter((cell): cell is InventoryItem => !!cell);
  occupiedTotal.value = inventory.occupiedTotal;
  overflows.value = inventory.overflows;
  closeTip();
  // 数据刷新不抹特效：格位特效按**格位序号**承载（`fxLayers`）⇒ 重建后自动复挂回同一格位；
  // 目标格收束（玉胚成形 / 籽格显形）必须在重建之后才能定位新格 ⇒ 在此补播一次（超时标记即弃）。
  const reveal = pendingReveal;
  pendingReveal = null;
  if (reveal && Date.now() - reveal.at <= FX_REVEAL_TTL_MS) void runReveal(reveal.kind);
}

// ---------------- 格位量测与命中 ----------------

/** 量测结果归一（`select` 返单对象 / `selectAll` 返数组 → 一律成数组；滤掉 0 尺寸的不可见节点） */
function normalizeRects(rects: any): SlotRect[] {
  return (Array.isArray(rects) ? rects : [rects])
    .filter((r: any) => r && r.width > 0 && r.height > 0)
    .map((r: any) => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
}

/** H5 DOM 量测的作用域根（本组件卡片）；取不到则退回文档级选择器 */
function domMeasureRoot(): Element | null {
  const el: any = inst && (inst.proxy as any)?.$el;
  if (el && el.nodeType === 1) {
    if (el.classList?.contains('inv-card')) return el;
    const inner = el.querySelector?.('.inv-card');
    if (inner) return inner;
  }
  return document.querySelector('.inv-card');
}

/**
 * 卡片**内容原点**（绝对定位层的包含块 = `position: relative` 卡片的 **padding box**）相对 border-box
 * 的偏移（px）。
 *
 * `measureRects` 量到的是 **border-box** 视口矩形，而 `left/top` 的基准是 **padding box** ⇒ 不减掉
 * border 宽会让层整体外移一个 border 宽：下摆「层上缘 = 格位下缘」因此变成 +1px 的缝（实测 +1.484px
 * 里的 1px 就是它，其余是 `Math.round` 的亚像素舍入）；横向则让层相对格位中心偏 1px。
 * 小程序端无 DOM（`boundingClientRect` 坐标系自洽）⇒ 恒返回 0，**不引入任何估算常量**。
 */
function cardOrigin(): { left: number; top: number } {
  // #ifdef H5
  const el: any = domMeasureRoot();
  if (el && typeof el.clientTop === 'number') return { left: el.clientLeft || 0, top: el.clientTop || 0 };
  // #endif
  return { left: 0, top: 0 };
}

/**
 * 量测元素包围盒（**统一坐标系 = 指针事件坐标系**，这是拖曳落位正确性的根）：
 *
 * - **H5**：用 DOM `getBoundingClientRect()`。鼠标与**原生**触摸事件的 `clientX / clientY` 是**视口坐标**，
 *   而 uni 交给组件的触摸事件是**加工过的**（uni-h5 `normalizeTouchEvent(touches, getWindowTop())`：
 *   `clientY = clientY − getWindowTop()`，`getWindowTop() = parseInt(--window-top) + safe-area-inset-top`；
 *   本页实测 **44px** = 页面头部高）。⇒ H5 上「uni 包装的触摸事件坐标」与「DOM 视口坐标」**恒差一个页面头部高**，
 *   约 85px 行高时整体偏上一行（−6 格）。故 H5 触摸路径**不走 uni 包装事件**（见 `bindTouchListeners` 的原生通道），
 *   与鼠标路径同为**原生事件 + DOM 量测**，同一 API、同一坐标系、**零常量补偿**。
 * - **小程序**：无 DOM，uni 的 `touch` 与 `boundingClientRect()` 同为**显示区域口径**，原本就同源 ⇒ 保持原路径
 *   （本次不改变小程序行为）。
 *
 * 两端口径各自自洽，且不引入任何常量补偿（不硬编码偏移量）。
 */
function measureRects(selector: string, single: boolean, done: (rects: SlotRect[]) => void): void {
  // #ifdef H5
  const root = domMeasureRoot();
  if (!root) {
    done([]);
    return;
  }
  // ⚠️ `querySelectorAll` **不含自身**：本组件的根节点就是 `.inv-card`，量 `.inv-card` 时若只查后代会命中 0 个
  // （实测 `left: 8px; top: 8px` 兜底定位 ⇒ 提示层贴卡片左上角、真实指针点不到层内【合成】/【分解】）
  // ⇒ 根自身匹配选择器时必须计入。
  const els: Element[] = [];
  if (typeof root.matches === 'function' && root.matches(selector)) els.push(root);
  Array.from(root.querySelectorAll(selector)).forEach((el) => els.push(el));
  done(normalizeRects(els.map((el) => el.getBoundingClientRect())));
  // #endif
  // #ifndef H5
  const query = inst ? uni.createSelectorQuery().in(inst) : uni.createSelectorQuery();
  const cb = (rects: any) => done(normalizeRects(rects));
  if (single) query.select(selector).boundingClientRect(cb).exec();
  else query.selectAll(selector).boundingClientRect(cb).exec();
  // #endif
}

/** 量测 36 格坐标（只在量全时刷新；组件不可见时实测为 0 尺寸 → 保留上次结果，由 composedPath 限流） */
function measureSlots(done?: () => void): void {
  measureRects('.inv-slot', false, (list) => {
    if (list.length === SLOT_COUNT) slotRects.value = list;
    if (done) done();
  });
}

/** 命中判定：返回坐标所在（或最近）的格位序号；栏位外 → -1 */
function slotIndexAt(x: number, y: number): number {
  const rects = slotRects.value;
  if (!rects.length) return -1;
  let nearest = -1;
  let best = Infinity;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height) return i;
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const dist = dx * dx + dy * dy;
    if (dist < best) {
      best = dist;
      nearest = i;
    }
  }
  // 落在格间缝隙：取最近的格（拖曳落位不因间隙落空）
  const limit = Math.max(rects[0].width, rects[0].height) * 1.5;
  return best <= limit * limit ? nearest : -1;
}

/** 需要命中时确保坐标可用（没量过 → 先量一次再回调） */
function withRects(fn: () => void): void {
  if (slotRects.value.length === SLOT_COUNT) {
    fn();
    return;
  }
  measureSlots(fn);
}

/** 坐标可能已失效时的量测刷新（节流：离上次量测点 > 24px 或距上次 > 400ms） */
function refreshRects(x: number, y: number, force = false): void {
  const far = Math.abs(x - lastMeasure.x) + Math.abs(y - lastMeasure.y) > 24;
  if (!force && !far && Date.now() - lastMeasure.at < 400) return;
  lastMeasure = { x, y, at: Date.now() };
  measureSlots();
}

// ---------------- 属性提示层 ----------------

/** 提示层实测高度（px）—— 首次渲染未知时用估算，量到后即按实测把层贴回格位边缘 */
let tipHeight = 0;
/** 上摆贴合校正是否**已用过**（每个基准最多一次；**绝不递归自我重排**） */
let tipFitDone = false;

function measureTipBox(): void {
  // 本层包围盒与触摸坐标必须同源（触摸命中守卫 `inTipBox` 与 `measureRects` 同一坐标系）
  measureRects('.inv-tip', true, (list) => {
    const rect = list[0];
    tipBox = rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
    if (!rect) return;
    tipHeight = rect.height;
    // 「摆到格位上方」首次渲染按估算高度定位 ⇒ 与格位上缘可能留缝。用**实测高度同步重写一次**样式：
    // **不重新量测、不 `nextTick` 递归**（收敛 = 硬上界「最多一次」）。校正后仍差 > 阈值也接受现状 ——
    // 宁可留缝也不能自我重排：上一版 `nextTick(measureTipBox)` 在「样式 top 被 `Math.max(..., 0)` 夹住」
    // 或「每次算出同一个 top」时判据永不成立，单次悬停即可把渲染进程打死（实测 20001 次不收敛）。
    const anchor = tipAnchor;
    if (!anchor || !anchor.above || tipFitDone) return;
    tipFitDone = true;
    const cell = slotRects.value[tipIndex.value];
    if (!cell) return;
    // 层下缘 = top + height —— `normalizeRects` 只保留 {left,top,width,height}（`bottom` 既不在 `SlotRect`
    // 里也不在量测结果里），且 H5 `getBoundingClientRect()` 与小程序 `boundingClientRect()` 两条口径
    // 都只有这四值 ⇒ 一律用 `top + height`，两条路径同源。
    if (Math.abs(cell.top - (rect.top + rect.height)) <= TIP_FIT_EPS) return; // 已贴合：不动样式
    const before = anchor.appliedTop;
    applyTipStyle();
    // 校正只改纵向 ⇒ 就地把实测包围盒平移（DOM 下一次渲染才生效；重新量测会引入递归）
    tipBox = { left: rect.left, top: rect.top + (anchor.appliedTop - before), width: rect.width, height: rect.height };
  });
}

/** 按最近一次基准写出提示层 inline style（摆向 = 格位下/上，与格位零间隙） */
function applyTipStyle(): void {
  const anchor = tipAnchor;
  if (!anchor) return;
  // 零间隙：下摆层上缘 = 格位下缘；上摆层下缘 = 格位上缘（留缝会让「格位 → 层内按钮」的指针
  // 轨迹穿过格间缝 / 空白 ⇒ 层被判成「已离开」而关掉，真实指针永远点不到按钮）。
  // ⚠️ 绝对定位的基准是卡片 **padding box**，而量测得到的是 **border-box** ⇒ 必须减 `originTop`
  // （= 卡片 border 宽），否则层整体外移一个 border 宽；**除此之外不做任何常量补偿**。
  const origin = anchor.cardTop + anchor.originTop;
  const top = anchor.above
    ? Math.max(anchor.cellTop - origin - (tipHeight || estimateTipHeight()), 0)
    : anchor.cellTop - origin + anchor.cellHeight;
  anchor.appliedTop = top;
  // `top` 保留 3 位小数（**不四舍五入到整数**）：`Math.round(top)` 会把层上缘移动 ±0.5px，正是「格与层
  // 之间那条 0.25px 扫描能采到的缝」的来源；3 位小数残余 ≤ 0.0005px（0.25px 步长采不到的亚像素级），
  // 于是交界处几何上不存在「既非格也非层」的点。left/width 取整只为观感（与格位不产生纵向缝）。
  tipStyle.value = `left: ${Math.round(anchor.left)}px; top: ${Math.round(top * 1000) / 1000}px; width: ${Math.round(anchor.width)}px;`;
}

/**
 * 首次渲染（实测高度未知）用的层高估算（px）。
 * 除 `tooltipLines` 外，模板按格型还会附加渲染行（兰帖格：分解比例行 + 格数/张数行；锁定态：锁定行），
 * 一并计入 —— **只影响首次渲染的摆位**（量到实测高度后由「最多一次」的贴合校正收尾，口径不变）。
 */
function estimateTipHeight(): number {
  const cell = tipCell.value;
  const extra = cell?.kind === 'scroll' ? 2 + (props.scrollLock ? 1 : 0) : 0;
  return TIP_LINE_H * ((cell?.tooltipLines.length || 0) + extra + 1) + 18 +
    (tipHasActions.value ? TIP_ACTIONS_H : 0) + estimatePoemHeight();
}

/**
 * 诗句行的估算高度（px；无诗句 → 0）—— **只用于首次渲染摆位**（量到实测包围盒后由「最多一次」的
 * 贴合校正收尾，口径不变）。层内可用宽 ≈ `TIP_WIDTH − 内边距 20px`；按字号估算每行字数
 * （**上限 3 行**；最长句 26 字，375px 宽下实测 2 行）⇒ 估算不足时靠实测校正兜底，**不写死单行高度**。
 */
function estimatePoemHeight(): number {
  const text = tipPoem.value;
  if (!text) return 0;
  const perLine = Math.max(1, Math.floor((TIP_WIDTH - 20) / TIP_POEM_FONT));
  const lines = Math.min(3, Math.max(1, Math.ceil(text.length / perLine)));
  return lines * TIP_POEM_LINE_H + TIP_POEM_MARGIN;
}

function inTipBox(x: number, y: number, tol = 0): boolean {
  const box = tipBox;
  if (!box) return false;
  return x >= box.left - tol && x <= box.left + box.width + tol &&
    y >= box.top - tol && y <= box.top + box.height + tol;
}

/**
 * 坐标是否仍在「**源格 ∪ 提示层**」联合区域内（各带 `TIP_UNION_TOL` 亚像素容差）。
 *
 * 判据口径（判据①/④）：指针在离开「源格 ∪ 层」整体之前，层必须始终开着 —— 格下缘与层上缘之间那条
 * 0~1.5px 的缝因此归属联合区域，指针落在缝里（`elementFromPoint` = `.inv-grid`）不再被当成第三区域。
 */
function inTipUnion(x: number, y: number): boolean {
  const index = tipIndex.value;
  if (index < 0) return false;
  const cell = slotRects.value[index];
  if (cell && x >= cell.left - TIP_UNION_TOL && x <= cell.left + cell.width + TIP_UNION_TOL &&
    y >= cell.top - TIP_UNION_TOL && y <= cell.top + cell.height + TIP_UNION_TOL) return true;
  return inTipBox(x, y, TIP_UNION_TOL);
}

function closeTip(): void {
  tipIndex.value = -1;
  tipBox = null;
  tipAnchor = null;
  // 层没了 ⇒ 按钮的指针态一并作废（否则下一次开层会带着上一格的悬停 / 按下态）
  setBtnHover('');
  setBtnPress('');
  btnBox = null;
}

/**
 * 打开提示层（**同格同来源幂等**：悬停逐帧命中同一格时不重复定位）。
 * 触摸后的兼容鼠标事件由 `mouseGuarded()` 挡在门外 ⇒ 不再靠本函数「拒绝 hover」来防抢焦。
 */
function openTip(index: number, source: 'hover' | 'tap'): void {
  if (tipIndex.value === index && tipSource === source) return;
  if (tipIndex.value !== index) {
    // 换格（悬停直接切到另一格时不经过 closeTip）⇒ 上一格按钮的悬停 / 按下态作废
    setBtnHover('');
    setBtnPress('');
    btnBox = null;
  }
  tipSource = source;
  tipIndex.value = index;
  placeTip(index);
}

/** 提示层定位：贴合格位（零间隙）+ 横向夹在卡片内；末两行摆到格位上方 */
function placeTip(index: number): void {
  // 卡片与格位都经 `measureRects` 量测 ⇒ 同一坐标系（偏移相减成立；换坐标系会整体错位）
  measureRects('.inv-card', true, (cards) => {
    const card = cards[0];
    const rect = slotRects.value[index];
    if (!card || !rect) {
      tipAnchor = null;
      tipStyle.value = 'left: 8px; top: 8px;'; // 兜底：量不到卡片 / 格位（不可见等）
      return;
    }
    // 横向同样减去 border：层中心要正对格位中心（不减会整体偏 1px，判据④「层中心 ≈ 格中心」就顶在容差边上）
    const origin = cardOrigin();
    const originLeft = card.left + origin.left;
    const contentW = card.width - origin.left * 2;
    const width = Math.min(TIP_WIDTH, Math.max(contentW - 16, 120));
    const center = rect.left + rect.width / 2 - originLeft;
    tipAnchor = {
      left: Math.min(Math.max(center - width / 2, 4), Math.max(contentW - width - 4, 4)),
      width,
      cellTop: rect.top,
      cellHeight: rect.height,
      cardTop: card.top,
      originTop: origin.top,
      appliedTop: 0,
      above: Math.floor(index / SLOT_COLUMNS) >= TIP_ABOVE_ROW,
    };
    tipFitDone = false; // 新基准 ⇒ 允许（且只允许）一次贴合校正
    applyTipStyle();
    // 渲染完成后量一次本层包围盒（触摸命中守卫 + 上摆贴合校正用）与层内按钮包围盒（触摸按下态判定用）
    nextTick(() => {
      measureTipBox();
      measureBtnBox();
    });
  });
}

// ---------------- 提示层内直操作：石榴籽【合成】 / 石榴籽玉【分解】 ----------------

/**
 * 【合成】：籽不足 → 置灰按钮 + **既有** toast「再攒 N 颗」+ 失败反馈（抖动 / 层泛红 / 结果浮字沿用原文）；
 * 籽够 → 打开**自绘二次确认框**（文案逐字取 `business/jade-ops.ts`）。
 * 本层保持打开：确认框（1030/1031）恒在本层（1010）之上 ⇒ 旧的「先 `closeTip()` 再弹框」绕法已不需要。
 */
function onSynthTap(): void {
  if (busy.value) return;
  if (!canSynthesize.value) {
    uni.showToast({ title: `再攒 ${seedsToGo.value} 颗`, icon: 'none' });
    void failFeedback(`再攒 ${seedsToGo.value} 颗`);
    return;
  }
  openConfirm('synth');
}

/**
 * 合成：固定消耗 999 颗；成功后就地重拉 summary（`refresh`），回执口径与资产页一致。
 * 特效（V3）与请求并行：t=0 起特效 → 收束相位（560ms）重拉 summary（目标玉格「玉胚成形」在重建后补播）
 * → 总时长（780ms）收尾（清特效层 + 结果提示层浮字 + toast）；全程 `busy = true`（动画期间阻塞重复提交）。
 */
async function doSynthesize(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  const before = seedsTotal.value;
  const startedAt = Date.now();
  fxSynth(confirmSrc); // 触发瞬间（t = 0）
  try {
    const res = await postSynthesizeJade();
    const used = res?.seeds_deducted ?? JADE_SYNTH_SEEDS;
    const exp = res?.permanent
      ? '永久有效'
      : res?.expires_at
        ? `有效期至 ${formatAssetDate(res.expires_at)}`
        : '有效期见资产明细';
    // 完整回执逐字与既有实现一致，**只**由 `uni.showToast` 交付（浮字不取代、不改写 toast 文案）
    const msg = `合成成功：新玉${exp}，消耗 ${used} 颗，余 ${Math.max(0, before - used)} 颗石榴籽`;
    await fxWait(FX_REVEAL_SYNTH_MS - (Date.now() - startedAt));
    pendingReveal = { kind: 'jade', at: Date.now() };
    emit('refresh');
    await fxWait(FX_SYNTH_MS - (Date.now() - startedAt));
    clearFx();
    // 结果浮字 = 数量摘要（产出量 = `JADES_PER_ITEM` 枚玉；量词 / 道具名取 `inventory.ts` 装配产物）
    fxFloat(fxQtySummary('jade', JADES_PER_ITEM));
    uni.showToast({ title: msg, icon: 'none', duration: 4000 });
  } catch (e) {
    // 409 ASSET_INSUFFICIENT → 先走失败反馈（520ms），再直出后端原文 + 来源清单（与既有「籽不足」同一套引导）
    await failFeedback('');
    if (isAssetInsufficientError(e)) {
      // 引导用 `uni.showModal`（`.uni-modal` 999 < 本层 1010）⇒ 交接前先关本层
      closeTip();
      showAssetInsufficientGuide(e, { title: '石榴籽不足' });
    } else {
      uni.showToast({ title: (e as Error)?.message || '合成失败', icon: 'none' });
    }
  } finally {
    busy.value = false;
  }
}

/**
 * 【分解】：同样打开自绘二次确认框（文案逐字取 `DECOMPOSE_*`：免费 / 固定返还 999 颗 / 统一 365 天）。
 * A1 已把「已镶嵌玉」挡在行囊之外 ⇒ 能看到的玉格都是未镶嵌、均可分解。
 */
function onDecomposeTap(): void {
  const jadeId = tipCell.value?.jadeId;
  if (busy.value || !jadeId) return;
  openConfirm('decompose', jadeId);
}

/**
 * 分解：免费、无折损；成功后就地重拉 summary；失败（404 / 409 等）直出后端原文。
 * 特效（V3）：t=0 起特效 → 收束相位（520ms）重拉 summary（目标籽格「显形 + 角标跳动」）→ 总时长 680ms 收尾。
 */
async function doDecompose(jadeId: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  const before = seedsTotal.value;
  const startedAt = Date.now();
  fxDecomp(confirmSrc);
  try {
    const res = await postDecomposeJade(jadeId);
    const back = res?.seeds_returned ?? JADE_SYNTH_SEEDS;
    const exp = res?.seed_expires_at ? `，${formatAssetDate(res.seed_expires_at)} 到期` : '';
    const msg = `已分解，返还 ${back} 颗石榴籽（统一 ${SEED_VALID_DAYS} 天${exp}），余 ${before + back} 颗`;
    await fxWait(FX_REVEAL_DECOMP_MS - (Date.now() - startedAt));
    pendingReveal = { kind: 'seed', at: Date.now() };
    emit('refresh');
    await fxWait(FX_DECOMP_MS - (Date.now() - startedAt));
    clearFx();
    // 结果浮字 = 数量摘要（返还量 = `JADE_SYNTH_SEEDS` 颗籽；量词 / 道具名取 `inventory.ts` 装配产物）
    fxFloat(fxQtySummary('seed', JADE_SYNTH_SEEDS));
    uni.showToast({ title: msg, icon: 'none', duration: 4000 });
  } catch (e) {
    await failFeedback('');
    uni.showToast({ title: (e as Error)?.message || '分解失败', icon: 'none' });
  } finally {
    busy.value = false;
  }
}

/**
 * 【兰帖分解】：未达标（余数格不足 1 张 / 被续约申请锁定）⇒ **直出层内同一句原因**（toast + 失败反馈），
 * **绝不静默**；达标 ⇒ 打开自绘二次确认框（`scroll`，1030/1031）。本层保持打开（确认框恒在本层之上）。
 */
function onScrollDecomposeTap(): void {
  if (busy.value) return;
  const cell = tipCell.value;
  if (!cell || cell.kind !== 'scroll') return;
  if (!canDecomposeScroll.value) {
    const reason = scrollDisabledNote.value || '当前不可分解';
    uni.showToast({ title: reason, icon: 'none', duration: 3000 });
    void failFeedback(reason);
    return;
  }
  openConfirm('scroll');
}

/**
 * 兰帖分解：**按张**调 `POST /assets/scroll/decompose`（`count = 1`；1 张 = 100 片 ⇒ 返还 99 片，
 * 每张留 1 片损耗）。成功后就地重拉 summary（`refresh`）；回执与失败文案一律后端原文（不吞、不自造）。
 * 特效（V3）：t = 0 起分解特效 → 收束相位（520ms）重拉 summary（**兰帖碎片格**显形 + 角标跳动）
 * → 总时长 680ms 收尾（清特效层 + 数量摘要浮字 + toast）。
 * 失败（409 片数不足 = 整单拒绝 / 400 `INVALID_COUNT` / 401 等）：先失败反馈（520ms），再直出后端 `error.message`。
 */
async function doDecomposeScroll(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  const startedAt = Date.now();
  fxDecomp(confirmSrc);
  try {
    const res = await postDecomposeScroll(1);
    const back = Number(res?.refunded) || SCROLL_REFUND_PER_ITEM;
    const pieces = Number(res?.pieces) || SCROLL_PIECES;
    const synth = Number(res?.synthesized) || 0;
    const rest = typeof res?.scroll_fragments === 'number' ? `，现余 ${res.scroll_fragments} 个` : '';
    // 道具名取 `business/asset-text.ts` 单点（**显示名更名后不得再硬编码旧名**）；量词与比例仍沿用既有口径
    const msg = `已分解 ${Number(res?.decomposed) || 1} 张兰帖（${pieces} 片），返还 ${back} 片${SCROLL_FRAGMENT_NAME}` +
      (synth > 0 ? `，满 ${SCROLL_FRAGMENTS_PER_ITEM} 片已自动合成 ${synth} 张兰帖` : '') + rest;
    await fxWait(FX_REVEAL_DECOMP_MS - (Date.now() - startedAt));
    pendingReveal = { kind: 'scrollFragment', at: Date.now() };
    emit('refresh');
    await fxWait(FX_DECOMP_MS - (Date.now() - startedAt));
    clearFx();
    // 结果浮字 = 数量摘要（返还量 = 后端 `refunded`；量词 / 道具名取 `inventory.ts` 装配产物）
    fxFloat(fxQtySummary('scrollFragment', back));
    uni.showToast({ title: msg, icon: 'none', duration: 4000 });
  } catch (e) {
    await failFeedback('');
    uni.showToast({ title: (e as Error)?.message || '兰帖分解失败', icon: 'none', duration: 4000 });
  } finally {
    busy.value = false;
  }
}

// ---------------- 指针会话（拖曳 / 轻触共用一套状态机） ----------------

/**
 * 开始一次指针会话。
 * H5 鼠标路径由**事件目标**给出精确格位（`fromIndex`，不受滚动 / 页面过渡动画的坐标漂移影响）；
 * 触摸路径没有目标信息 → `fromIndex = -1`，由坐标命中（`slotIndexAt`）解析。
 */
function startSession(source: 'mouse' | 'touch', x: number, y: number, fromIndex = -1): void {
  if (!ordered.value.length) return; // 无道具：无提示、无拖曳
  session = { source, x, y, moved: false, fromIndex };
  dragFrom.value = -1;
  dropIndex.value = -1;
  dragging.value = false;
  refreshRects(x, y, true);
}

function clearSession(): void {
  session = null;
  dragFrom.value = -1;
  dropIndex.value = -1;
  dragging.value = false;
}

/**
 * 轻触结算：已占用格 **toggle** 提示层 —— 同格再轻触即关闭（切换语义，**不依赖空格** ⇒ 36 格全满也能关）；
 * 该格提示原本由悬停打开时，本次轻触只「接手」为轻触态（下次轻触才关），避免鼠标「悬停后一点就消失」；
 * 空格 / 栏位外 → 关掉已开提示且不弹新提示。
 */
function tapAt(index: number): void {
  if (index >= 0 && ordered.value[index]) {
    if (tipIndex.value === index && tipSource === 'tap') closeTip();
    else openTip(index, 'tap');
    return;
  }
  closeTip();
}

/** 位移 > DRAG_THRESHOLD 才进入拖曳（否则整个会话仍按轻触处理） */
function updateSession(x: number, y: number): void {
  const current = session;
  if (!current) return;
  if (!current.moved) {
    if (Math.abs(x - current.x) + Math.abs(y - current.y) <= DRAG_THRESHOLD) return;
    current.moved = true;
  }
  if (!dragging.value) {
    // 起点必须落在已占用格：否则不是「道具拖曳」（空格不参与重排）
    const resolveFrom = (): void => {
      const from = current.fromIndex >= 0 ? current.fromIndex : slotIndexAt(current.x, current.y);
      if (from < 0 || !ordered.value[from]) {
        session = null;
        return;
      }
      dragFrom.value = from;
      dragging.value = true;
    };
    if (current.fromIndex >= 0) resolveFrom();
    else withRects(resolveFrom);
    closeTip();
  }
  if (!dragging.value) return;
  refreshRects(x, y);
  const hit = slotIndexAt(x, y);
  if (hit >= 0) dropIndex.value = Math.min(hit, ordered.value.length - 1);
}

function endSession(x: number, y: number): void {
  const current = session;
  if (!current) return;
  if (!current.moved) {
    clearSession();
    const stale = Date.now() - lastMeasure.at > 400;
    if (stale || slotRects.value.length !== SLOT_COUNT) {
      refreshRects(x, y, true);
      measureSlots(() => tapAt(slotIndexAt(x, y)));
      return;
    }
    withRects(() => tapAt(slotIndexAt(x, y)));
    return;
  }
  const from = dragFrom.value;
  const to = dropIndex.value;
  clearSession();
  if (from >= 0 && to >= 0 && from !== to) {
    ordered.value = moveItem(ordered.value, from, to); // 插入式重排：仅本页内存，无持久化
    closeTip();
  }
}

/**
 * 触摸坐标取值（**小程序路径**；H5 见 `onDocumentTouchStart` 等原生通道）。
 * `touchend` 时 `touches` 为空 ⇒ 取 `changedTouches`；小程序端 uni 事件与 `boundingClientRect()`
 * 同为显示区域坐标 ⇒ 与量测同源。
 */
function touchPoint(e: any): { x: number; y: number } {
  const touch = e?.touches?.[0] || e?.changedTouches?.[0] || {};
  return { x: Number(touch.clientX ?? 0), y: Number(touch.clientY ?? 0) };
}

/**
 * 小程序触摸路径（模板 `@touchstart/@touchmove/@touchend`）。
 *
 * ⚠️ **H5 不走这里**：uni-h5 把交给组件的触摸事件加工过（`normalizeTouchEvent` 把
 * `clientY / pageY` 减去 `getWindowTop()`，本页实测 44px）⇒ 与格位矩形（视口坐标）**恒差一个页面头部高**，
 * 85px 行高时整体偏上一行（实测 −6 格）。H5 改走**原生**通道 `onDocumentTouchStart`（坐标与
 * `getBoundingClientRect()` 同源）；本函数在 H5 构建下为空体（`#ifndef H5`）。
 */
function onTouchStart(e: any): void {
  // #ifndef H5
  armMouseGuard(); // 触摸开始即开抑制窗口（含其后的 compat mousedown/mouseup）
  const point = touchPoint(e);
  // 按下态（小程序）：触摸落在**层内按钮**上（实测包围盒）⇒ `is-press`；
  // 触屏端无 hover ⇒ 不接 `is-hover`（一次性玉纹扫光仍由 `.sheen-once` 的 transition 承担）
  setBtnPress(inBtnBox(point.x, point.y) ? tipBtnKind.value : '');
  // 触摸落在提示层（含层内按钮）→ 不开启指针会话：本层浮在格位之上，按坐标命中会把这一下
  // 算成「点了被盖住的格」（提示层会跳到别格 / 按钮那一下被吃掉）。按钮交互全由层内 @click 负责。
  if (inTipBox(point.x, point.y)) return;
  startSession('touch', point.x, point.y);
  // #endif
}

function onTouchMove(e: any): void {
  // #ifndef H5
  const point = touchPoint(e);
  // 手指滑出按钮 ⇒ 按下态取消（同 H5 触摸通道口径）
  if (btnPress.value && !inBtnBox(point.x, point.y)) setBtnPress('');
  if (!session) return;
  updateSession(point.x, point.y);
  // 拖曳中拦页面滚动（H5 真实事件；小程序侧 preventDefault 为空实现，靠坐标节流兜底）
  if (dragging.value && typeof e?.preventDefault === 'function') e.preventDefault();
  // #endif
}

function onTouchEnd(e: any): void {
  // #ifndef H5
  armMouseGuard(); // touchend 之后才补发 compat mouse 事件 ⇒ 从这一刻重新计时
  setBtnPress(''); // 抬起 / 取消：按下态复位
  const point = touchPoint(e);
  endSession(point.x, point.y);
  // #endif
}

// #ifdef H5
/**
 * 桌面鼠标通道（H5 独有，文档级监听）：悬停走 mouseover、拖曳走 down / move / up。
 * 格位一律由**事件目标**解析（`closest('.inv-slot')` + DOM 序号）——比坐标命中更准：
 * 不受页面过渡动画 / 滚动的坐标漂移影响（实测初次悬停曾因此落到相邻行）。
 * 用 `composedPath()` 把事件限定在本组件卡片内（页面切走 / 其它页面点击一律不介入）。
 */
let mouseBound = false;
let dragBound = false;

function inOwnCard(e: any): boolean {
  const path = typeof e?.composedPath === 'function' ? e.composedPath() : [];
  return path.some((node: any) => node?.classList?.contains('inv-card'));
}

/** 事件是否落在提示层内（含层内按钮）—— 本层可交互 ⇒ 悬停 / 按下都不按「格位」处理 */
function inTipLayer(e: any): boolean {
  const path = typeof e?.composedPath === 'function' ? e.composedPath() : [];
  return path.some((node: any) => node?.classList?.contains('inv-tip'));
}

/** 事件是否落在提示层**按钮**上（含按钮内文本 / 叠加子层）—— 与 `inTipLayer` 同一手法 */
function inBtnPath(e: any): boolean {
  const path = typeof e?.composedPath === 'function' ? e.composedPath() : [];
  return path.some((node: any) => node?.classList?.contains('inv-tip-btn'));
}

/**
 * 悬停态同步（H5）：指针落在**层内按钮**上 ⇒ `is-hover`（颗颗各自，取当前层内那颗的标识）；
 * 指针不在按钮上（含落到格 / 缝 / 卡片空白 / 移出卡片） ⇒ 清除。
 *
 * 与 `hoverAt` **同一优先级口径**：拖曳会话（`session` / `dragging`）与确认框打开期间一律不介入
 * （不因 `is-hover` 抢焦）；触摸后的兼容鼠标事件已由 `mouseGuarded` 挡在调用方之外。
 * 本函数只写按钮的指针态，**不碰提示层开关**（层的关闭边界仍由 `hoverAt` 的「源格 ∪ 层」判定）。
 */
function syncBtnHover(e: MouseEvent): void {
  if (confirmOpen.value || session || dragging.value) {
    setBtnHover('');
    setBtnPress('');
    return;
  }
  const onBtn = inBtnPath(e);
  setBtnHover(onBtn ? tipBtnKind.value : '');
  // 按下态：**离开按钮即清**（口径同 `is-press` 的定义「按下时置、抬起 / 离开时清」）。
  // 抬起本身走 `onDocumentMouseUp`（含 `mouseleave`），按住不放滑出按钮走这里。
  if (!onBtn && btnPress.value) setBtnPress('');
}

/** 事件目标 → 格位序号（-1 = 不在格位内） */
function slotIndexOfNode(node: any): number {
  const el = node && typeof node.closest === 'function' ? node.closest('.inv-slot') : null;
  if (!el) return -1;
  return Array.prototype.indexOf.call(document.querySelectorAll('.inv-slot'), el);
}

function attachMouseDrag(): void {
  if (dragBound) return;
  document.addEventListener('mousemove', onDocumentMouseMove);
  document.addEventListener('mouseup', onDocumentMouseUp);
  document.addEventListener('mouseleave', onDocumentMouseUp);
  dragBound = true;
}

function detachMouseDrag(): void {
  if (!dragBound) return;
  document.removeEventListener('mousemove', onDocumentMouseMove);
  document.removeEventListener('mouseup', onDocumentMouseUp);
  document.removeEventListener('mouseleave', onDocumentMouseUp);
  dragBound = false;
}

function onDocumentMouseDown(e: MouseEvent): void {
  if (mouseGuarded()) return; // 触摸后的兼容 mousedown：不参与轻触结算
  if (confirmOpen.value) return; // 确认框打开：卡片内指针路径不介入（遮罩 1030 在最上层）
  if (!inOwnCard(e)) return;
  // 提示层内的按下不开启指针会话：层内按钮自己的 @click 负责业务（否则 mouseup 会被结算成
  // 「点了被层盖住的格」，把提示层跳走 / 吃掉按钮那一下）。
  // 只维护按钮**按下态**：`is-press` 置位，抬起 / 离开由既有的 mouseup / mouseleave 通道复位
  // （`attachMouseDrag` 借的就是这条通道，不新增监听）。
  if (inTipLayer(e)) {
    setBtnPress(inBtnPath(e) ? tipBtnKind.value : '');
    attachMouseDrag();
    return;
  }
  const index = slotIndexOfNode(e.target);
  if (index >= 0) e.preventDefault(); // 拖曳期间不选中文字
  // 空格也开会话（轻触空格要能关掉已开提示），但 fromIndex = -1 ⇒ 不会被判成道具拖曳
  startSession('mouse', e.clientX, e.clientY, index >= 0 && ordered.value[index] ? index : -1);
  attachMouseDrag();
}

function onDocumentMouseMove(e: MouseEvent): void {
  updateSession(e.clientX, e.clientY);
}

function onDocumentMouseUp(e: MouseEvent): void {
  if (mouseGuarded()) return; // 触摸后的兼容 mouseup：不参与轻触结算
  detachMouseDrag();
  setBtnPress(''); // 抬起（含按在按钮上抬起、指针移出窗口的 mouseleave）⇒ 按下态一律复位
  const current = session;
  if (current && !current.moved) {
    // 轻触：按抬起时的事件目标精确定格（空格 → 关掉已开提示，且不弹新提示）
    const index = slotIndexOfNode(e.target);
    clearSession();
    tapAt(index);
    return;
  }
  endSession(e.clientX, e.clientY);
}

/**
 * 悬停命中（`mouseover` 与 `mousemove` 共用）：卡片内已占用格 → 开提示；**提示层内 → 保持不动**
 * （层内按钮可点，不能因为指针移入层里就关掉提示层）；
 * **「源格 ∪ 提示层」联合区域内（含 `TIP_UNION_TOL` 亚像素容差）→ 保持不动** —— 格下缘与层上缘之间
 * 那条 0~1.5px 的缝里 `elementFromPoint` 返回 `.inv-grid`（既非格也非层），按目标元素判定会把层关掉，
 * 指针就永远走不到层内按钮；容差把缝并入联合区域。
 * 卡片内空格 / 空白、以及离开联合区域 → 关。
 */
function hoverAt(e: MouseEvent): void {
  if (confirmOpen.value) return; // 确认框打开（遮罩在最上层）：卡片内指针路径一律不介入
  if (session || dragging.value) return;
  if (inTipLayer(e)) return; // 指针在提示层上（含层内按钮）：不改变提示层状态
  const index = slotIndexOfNode(e.target);
  if (index >= 0 && ordered.value[index]) {
    openTip(index, 'hover');
    return;
  }
  if (inTipUnion(e.clientX, e.clientY)) return; // 缝 / 亚像素：仍在联合区域内，保持不动
  closeTip(); // 卡片内空格 / 空白，或已离开卡片
}

function onDocumentMouseOver(e: MouseEvent): void {
  if (mouseGuarded()) return; // 触摸后的兼容 mouseover：不抢焦
  hoverAt(e);
  syncBtnHover(e);
}

/**
 * 悬停跟随：`mouseover` 只在**进入新元素**时触发，鼠标停在同一格内移动不触发。
 * 触摸抑制窗口结束后指针本就停在某格上时，靠本路径恢复悬停语义（否则提示会一直停在轻触选中的格）。
 * 拖曳会话期间交给 `onDocumentMouseMove`，本路径不介入。
 */
function onDocumentHoverMove(e: MouseEvent): void {
  if (mouseGuarded()) return;
  hoverAt(e);
  syncBtnHover(e);
}

function onDocumentScroll(): void {
  if (tipSource === 'hover') closeTip(); // 滚动后坐标失效：悬停提示先关
  refreshRects(0, 0);
}

function onWindowResize(): void {
  refreshRects(0, 0, true);
  if (tipIndex.value >= 0) placeTip(tipIndex.value);
}

function bindMouseListeners(): void {
  if (mouseBound || typeof document === 'undefined') return;
  document.addEventListener('mousedown', onDocumentMouseDown);
  document.addEventListener('mouseover', onDocumentMouseOver);
  document.addEventListener('mousemove', onDocumentHoverMove);
  document.addEventListener('scroll', onDocumentScroll, true);
  window.addEventListener('resize', onWindowResize);
  mouseBound = true;
}

function unbindMouseListeners(): void {
  if (!mouseBound || typeof document === 'undefined') return;
  document.removeEventListener('mousedown', onDocumentMouseDown);
  document.removeEventListener('mouseover', onDocumentMouseOver);
  document.removeEventListener('mousemove', onDocumentHoverMove);
  document.removeEventListener('scroll', onDocumentScroll, true);
  window.removeEventListener('resize', onWindowResize);
  detachMouseDrag();
  mouseBound = false;
}

/**
 * H5 **原生触摸通道**（与鼠标通道同构，文档级监听）。
 *
 * 为什么不用小程序那套 `@touchstart`：uni-h5 会把交给组件的触摸事件加工一遍 ——
 * `normalizeTouchEvent(touches, getWindowTop())` 把 `clientY / pageY` 减去 `getWindowTop()`
 * （= `parseInt(--window-top) + safe-area-inset-top`，本页实测 **44px** = 页面头部高）。
 * 组件的格位矩形走 `getBoundingClientRect()`（视口坐标）⇒ 两者**恒差一个页面头部高**；
 * 行高 85px 时，落在行中心的指针减去 44 就跨回上一行 ⇒ 触摸路径的格解析整体**偏上一行**（实测 −6 格）。
 *
 * 本通道直接接**原生** TouchEvent（未经 uni 加工）⇒ `clientX / clientY` 即视口坐标，与量测同一坐标系。
 * 两条通道各自自洽：H5 = 原生事件 + `getBoundingClientRect()`；小程序 = uni 事件 + `boundingClientRect()`。
 * **零常量补偿**（不写 44 / 不写 85）。
 */
let touchBound = false;

function bindTouchListeners(): void {
  if (touchBound || typeof document === 'undefined') return;
  document.addEventListener('touchstart', onDocumentTouchStart);
  // 拖曳要能 preventDefault 拦页面滚动 ⇒ 必须显式 passive: false（文档级 touchmove 默认 passive）
  document.addEventListener('touchmove', onDocumentTouchMove, { passive: false });
  document.addEventListener('touchend', onDocumentTouchEnd);
  document.addEventListener('touchcancel', onDocumentTouchEnd);
  touchBound = true;
}

function unbindTouchListeners(): void {
  if (!touchBound || typeof document === 'undefined') return;
  document.removeEventListener('touchstart', onDocumentTouchStart);
  document.removeEventListener('touchmove', onDocumentTouchMove);
  document.removeEventListener('touchend', onDocumentTouchEnd);
  document.removeEventListener('touchcancel', onDocumentTouchEnd);
  touchBound = false;
}

/**
 * 触摸开始：限定在本卡片内、且不在提示层上（层内【合成】/【分解】的点击归层内按钮自己）才开会话。
 * 与 `onDocumentMouseDown` 同一套边界（`inOwnCard` / `inTipLayer`）—— 提示层浮在格位之上，
 * 若按坐标把按下当成「点了被盖住的格」，层会跳格、按钮那一下会被吃掉。
 */
function onDocumentTouchStart(e: TouchEvent): void {
  armMouseGuard(); // 触摸开始即开抑制窗口（含其后的 compat mousedown/mouseup）
  if (confirmOpen.value) return; // 确认框打开：卡片内指针路径不介入（遮罩 1030 在最上层）
  if (!inOwnCard(e)) return;
  const point = touchPoint(e);
  // 触摸按下态：落在层内按钮上（事件路径判定，与 H5 鼠标同手法）⇒ is-press；触屏无 hover ⇒ 不接 is-hover
  setBtnPress(inBtnPath(e) ? tipBtnKind.value : '');
  if (inTipLayer(e)) return;
  startSession('touch', point.x, point.y);
}

function onDocumentTouchMove(e: TouchEvent): void {
  const point = touchPoint(e);
  // 手指滑出按钮（实测包围盒）⇒ 按下态取消（与 `@click` 的命中口径无关，只影响视觉态）
  if (btnPress.value && !inBtnBox(point.x, point.y)) setBtnPress('');
  if (!session) return;
  updateSession(point.x, point.y);
  if (dragging.value && typeof e.preventDefault === 'function') e.preventDefault();
}

function onDocumentTouchEnd(e: TouchEvent): void {
  armMouseGuard(); // touchend 之后才补发 compat mouse 事件 ⇒ 从这一刻重新计时
  setBtnPress(''); // 抬起 / 取消：按下态复位
  const point = touchPoint(e);
  endSession(point.x, point.y);
}
// #endif

onMounted(() => {
  measureSlots();
  // #ifdef H5
  bindMouseListeners();
  bindTouchListeners();
  // #endif
});

onUnmounted(() => {
  // #ifdef H5
  unbindMouseListeners();
  unbindTouchListeners();
  // #endif
  // 组件卸载：清掉在飞特效的定时链与叠加层（否则定时链会继续写已卸载组件的 state）
  fxClearTimers();
  if (sheenTimer) {
    clearTimeout(sheenTimer);
    sheenTimer = null;
  }
  clearFx();
});
</script>

<style scoped>
/* 卡片：与「我的」页既有 bind-card 同规格（圆角 / 阴影 / 内距一致），底色走古风牙黄纸感 */
.inv-card {
  position: relative;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE; border-radius: 14px; padding: 16px;
  margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.inv-head { display: flex; align-items: center; justify-content: space-between; }
.inv-head-left { display: flex; align-items: center; }
/* 标题装饰（朱红 → 棕 的小竖笔，古风书签感） */
.inv-title-mark {
  width: 4px; height: 15px; border-radius: 2px; margin-right: 8px;
  background: linear-gradient(180deg, #A8322D, #8B4513);
}
.inv-title { font-size: 16px; font-weight: bold; color: #3E2723; letter-spacing: 2px; }
.inv-count { font-size: 12px; color: #B08D57; }
.inv-hint { font-size: 11px; color: #B5A594; display: block; margin: 4px 0 10px; line-height: 1.5; }

/* 6×6 道具栏：木质底板 + 内嵌格位（游戏道具栏观感）；375–1440 宽度按 1fr 自适应、不破格 */
.inv-grid {
  display: grid; gap: 6px; padding: 8px; box-sizing: border-box;
  max-width: 520px; margin: 0 auto;
  background: linear-gradient(180deg, #F8F0E5, #EFE2D2);
  border: 1px solid #E3D3BE; border-radius: 12px;
  user-select: none; -webkit-user-select: none;
}
/* 每格正方形：padding-top 的百分比按格宽解析（跨端一致，不依赖 aspect-ratio）；
   边框一律用 inset box-shadow 画（真 border 会被计入高度 ⇒ 格子会高出 2px、不是正方形） */
.inv-slot { position: relative; }
.inv-slot-box {
  position: relative; padding-top: 100%; box-sizing: border-box;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: inset 0 0 0 1px #E0D6CB, inset 0 2px 4px rgba(139, 69, 19, 0.08);
}
.inv-slot-filled .inv-slot-box {
  background: linear-gradient(160deg, #FFFDF8, #F6E9D8);
  box-shadow: inset 0 0 0 1px #C9A227, inset 0 1px 2px rgba(139, 69, 19, 0.12), 0 1px 2px rgba(139, 69, 19, 0.12);
}
.inv-slot-active .inv-slot-box {
  background: #FFF3E6;
  box-shadow: inset 0 0 0 2px #8B4513;
}
.inv-slot-drag .inv-slot-box { opacity: 0.4; }
.inv-slot-drop .inv-slot-box {
  background: #FFF3E6;
  box-shadow: inset 0 0 0 2px #8B4513;
}
.inv-ico {
  position: absolute; left: 50%; top: 46%; width: 56%; height: 56%;
  transform: translate(-50%, -50%);
}
.inv-badge {
  position: absolute; right: 3px; bottom: 1px; font-size: 8px; line-height: 1; color: #8B4513;
  transition: transform .11s cubic-bezier(.34, 1.56, .64, 1);
}
/* 分解收束：角标跳动（唯一被施加 transform 的真实节点；绝对定位 ⇒ 不影响格 / 卡片尺寸） */
.inv-badge-pop { transform: scale(1.45); }
/* 兰帖锁定态角标（格内左下角；绝对定位 ⇒ 不参与布局、不改格尺寸） */
.inv-lock {
  position: absolute; left: 3px; bottom: 1px;
  font-size: 8px; line-height: 1; color: #A8322D;
}
/* 属性提示层内的兰帖锁定态整句（文案取自 business/asset-text.ts 的 SCROLL_LOCK_TEXT） */
.inv-tip-lock { color: #FFC9C9; font-weight: bold; }
/* 属性提示层内的兰帖分解比例行（比例单点 = business/asset-text.ts：1 张 = 100 片 ⇒ 返还 99 片） */
.inv-tip-ratio { color: #FFE9C9; }
/*
  属性提示层内的**道具诗句**（文案单点 = business/asset-text.ts 的 `ASSET_POEMS`，组件内零诗句字面）。
  体例同 `.inv-tip-line`，但**长句换行**：恒 `width: 100%` + `overflow-wrap` ⇒ 最长句（26 字）在 240px
  层宽下折成 2 行、**不撑破本层**（层高由实测包围盒 + 「最多一次」贴合校正收尾；估算项 = `estimatePoemHeight`）。
  `margin-top` / `padding-top` / `font-size` / `line-height` 与估算常量 `TIP_POEM_*` 一一对齐（改样式须同改常量）。
*/
.inv-tip-poem {
  display: block; width: 100%; box-sizing: border-box;
  margin-top: 8px; padding-top: 6px;
  border-top: 1px dashed rgba(255, 233, 201, 0.35);
  font-size: 11px; line-height: 1.45; color: #FFE9C9;
  white-space: normal; overflow-wrap: break-word; word-break: break-word;
  font-family: 'Kaiti SC', 'STKaiti', 'KaiTi', 'Songti SC', serif;
}

/* 属性提示层（自绘 · z-index 1010 > 页面既有 .modal-mask 999）；层内可交互（合成 / 分解按钮） */
.inv-tip {
  position: absolute; z-index: 1010; width: 240px; max-width: calc(100% - 16px);
  box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
  background: rgba(62, 39, 35, 0.94); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  pointer-events: auto; /* 层内按钮要能接点击 ⇒ 不再穿透（关闭边界见 hoverAt / inTipLayer） */
  transition: box-shadow .18s ease;
}
/* 失败态（籽不足 / 操作失败）：层边框泛红 —— 只改 box-shadow，不改尺寸 */
.inv-tip.is-fail { box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), inset 0 0 0 1px rgba(255, 120, 120, 0.6); }
.inv-tip-title { display: block; font-size: 13px; font-weight: bold; color: #FFE9C9; margin-bottom: 2px; }
.inv-tip-line { display: block; font-size: 11px; color: #F0E2D0; line-height: 1.6; }
.inv-tip-acts { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
/*
  提示层内按钮（V3 灵石共鸣 · 红玉色写实；主色 #EFA9B4 / #C4747F 与 `fragment.png` 同源）：
  **占位尺寸一字未动** —— padding / border-width / font-size / line-height 与改造前完全一致；
  盒尺寸为**本组件** 375×812 视口实测 **52 × 26px**（`getBoundingClientRect` = offsetWidth/Height = 52 / 26）。
  ⚠️ 数值口径登记：曾误引 mockup 子代理在其**独立页面**里估的 28.8px（含各态字号差异），**非本组件真值**，
  已按本组件实测更正为 26px —— 两处一致（52 宽相同）。
  `position: relative` 只为给绝对定位叠加层建立包含块（不改盒尺寸），按下态只用不参与布局的 transform。
*/
.inv-tip-btn {
  position: relative;
  padding: 4px 14px; border-radius: 6px; cursor: pointer;
  background: linear-gradient(180deg, #EFA9B4, #C4747F);
  box-shadow: inset 0 1px 0 rgba(255, 246, 248, 0.85), inset 0 -2px 4px rgba(120, 60, 70, 0.4),
              inset 0 0 0 1px rgba(255, 246, 248, 0.7), 0 0 9px rgba(208, 126, 141, 0.4);
  transition: transform .13s cubic-bezier(.34,1.56,.64,1), box-shadow .15s ease;
}
.inv-tip-btn-text { font-size: 12px; color: #4A1F26; text-shadow: 0 1px 0 rgba(255, 246, 248, 0.6); }
/* 悬停（H5 指针，由文档级鼠标通道置位 `is-hover` ⇒ 真实生效）：外发光加强 + 玉纹高光循环扫过（循环态 keyframes 见下方 H5 区） */
.inv-tip-btn.is-hover {
  box-shadow: inset 0 1px 0 rgba(255, 246, 248, 1), inset 0 -2px 4px rgba(120, 60, 70, 0.45),
              inset 0 0 0 1px rgba(255, 246, 248, 0.95), 0 0 16px rgba(208, 126, 141, 0.62),
              0 0 24px rgba(251, 224, 228, 0.4);
}
/* 按下凹陷回弹（transform 不参与布局；真实用户按下时短暂存在，动画期间不加此类） */
.inv-tip-btn.is-press { transform: translateY(1px) scale(.965); }

/* 叠加层：外发光 / 玉纹扫光 / busy 弧 —— 全是按钮的绝对定位子节点（超出 6px）⇒ 不撑大按钮 */
.btn-fx {
  position: absolute; left: -6px; right: -6px; top: -6px; bottom: -6px;
  border-radius: 10px; pointer-events: none; opacity: 0;
  box-shadow: 0 0 15px 3px rgba(208, 126, 141, 0.5), 0 0 28px rgba(251, 224, 228, 0.25);
  transition: opacity .18s ease;
}
.btn-sheen-clip {
  position: absolute; left: 0; right: 0; top: 0; bottom: 0;
  border-radius: 6px; overflow: hidden; pointer-events: none;
}
/*
  扫光带：一次性（`.btn-sheen`）与 H5 悬停循环（`.btn-vein`）**各占一个独立节点**，几何 / 外观共用。
  基态恒为 `translateX(-180%)`（整条带子在 `.btn-sheen-clip` 之外 ⇒ 不可见）。
*/
.btn-sheen, .btn-vein {
  position: absolute; top: -60%; bottom: -60%; left: 0; width: 34%;
  opacity: .9; transform: translateX(-180%);
  background: linear-gradient(100deg, rgba(255, 246, 248, 0), rgba(255, 246, 248, 0.9) 45%, rgba(255, 246, 248, 0));
}
/* 一次性玉纹高光扫过（提示层打开时播放；transition 播放 ⇒ 小程序端同样可用，零 @keyframes） */
/*
  与 H5 悬停循环的**分工口径**（不重叠、不闪烁，且两态都能从起点真实播完）：
  **两个扫光各占独立节点** —— `.btn-sheen` 只承担这条一次性 `transition`，`.btn-vein` 只承担 H5 循环
  `inv-fx-vein`。若二者共用一个节点（旧实现），`:not(.is-hover)` 命中的那一刻 `animation` 的所有权与
  `transform` 底层值变更同帧发生 ⇒ 过渡不启动、扫光**一步跳到 360%**（实测：悬停接管后离开按钮，
  一个 35ms 采样内由 -180% 直达 360%，肉眼即「跳」而非「扫」）。节点分开后，离开按钮那一刻
  `.btn-sheen` 的「变更前值」是**未被任何动画干涉**的基态 -180% ⇒ 过渡必然从起点真实播完 820ms。
  `:not(.is-hover)` 保留原意：指针已在按钮上时由循环接管扫光，本条一次性 transition 不参与、不叠加第二次。
  （本口径只在 `.sheen-once` 的 900ms 窗口内离开按钮时成立；窗口过后该类已被移除，不再补播第二次扫光
  —— 与改造前一致。指针全程未上按钮时，本条 transition 即开层那一次扫光。）
*/
.inv-tip-btn.sheen-once:not(.is-hover) .btn-sheen {
  transform: translateX(360%); transition: transform 820ms cubic-bezier(.22,.61,.36,1);
}
.btn-busy {
  position: absolute; right: -7px; top: -7px; width: 13px; height: 13px;
  border-radius: 50%; border: 2px solid rgba(255, 246, 248, 0.22);
  border-top-color: #FFF6F8; border-right-color: rgba(255, 246, 248, 0.72);
  pointer-events: none; opacity: 0; transition: opacity .18s ease;
}
.inv-tip-btn.is-hover .btn-fx { opacity: 1; }
/* 置灰：籽不足（合成）/ 操作进行中 —— 仍可接点击（合成会提示「再攒 N 颗」）；候选皮肤不得覆盖它 */
.inv-tip-btn.inv-tip-btn-off {
  background: rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.26);
}
.inv-tip-btn.inv-tip-btn-off .inv-tip-btn-text { color: rgba(240, 226, 208, 0.62); text-shadow: none; }
.inv-tip-btn.inv-tip-btn-off .btn-fx,
.inv-tip-btn.inv-tip-btn-off .btn-busy,
.inv-tip-btn.inv-tip-btn-off .btn-sheen,
.inv-tip-btn.inv-tip-btn-off .btn-vein { opacity: 0; }
/* busy / 失败：静态外发光与 arc（小程序端即最终观感；H5 追加「呼吸」循环，见下方 #ifdef H5） */
.inv-tip-btn.is-busy .btn-fx { opacity: .5; }
.inv-tip-btn.is-busy .btn-busy { opacity: 1; }
.inv-tip-btn.is-fail .btn-fx { opacity: 1; box-shadow: 0 0 16px 3px rgba(198, 40, 40, 0.6); }
.inv-tip-note { font-size: 11px; color: #F0E2D0; }

/*
  循环态动效 —— 本批**仅 2 条 `@keyframes`，且只在 H5**：
  本仓此前 `@keyframes` / `animation` 零先例（`grep -rn "@keyframes\|animation:" frontend/src/` = 0 命中），
  故小程序端一律不引入（由上面的静态外发光 / arc 承担），H5 才追加循环：
  ① `inv-fx-vein`  玉纹高光循环扫过（悬停；只施加在**独立节点** `.btn-vein` 上，与一次性 `.btn-sheen`
    的 transition 互不干涉；触屏端无 hover ⇒ 由 `.sheen-once` 的一次性 transition 扫光接管）
  ② `inv-fx-breathe` 呼吸脉动（悬停 / busy 的外发光强弱）
*/
/* #ifdef H5 */
@keyframes inv-fx-vein { 0%, 55% { transform: translateX(-180%); } 100% { transform: translateX(360%); } }
@keyframes inv-fx-breathe { 0%, 100% { opacity: .3; } 50% { opacity: .92; } }
.inv-tip-btn.is-hover:not(.inv-tip-btn-off) .btn-vein { animation: inv-fx-vein 1.6s ease-in-out infinite; }
.inv-tip-btn.is-hover:not(.inv-tip-btn-off) .btn-fx { animation: inv-fx-breathe 1.8s ease-in-out infinite; }
.inv-tip-btn.is-busy .btn-fx { animation: inv-fx-breathe 1.5s ease-in-out infinite; }
/* #endif */

/*
  ===== 操作特效层（V3 灵石共鸣）· 层序与零布局口径 =====
  格位特效 1014 / 全屏冲击 1016 / 结果提示 1018（逐字执行派单裁定；先例 `.uni-modal` 999 /
  `.som-mask` 1000 / 其内确认 1010 / 本件提示层 1010）；三者一律 `pointer-events: none`（不夺命中），
  且全部是**绝对定位叠加层**（不参与布局）⇒ 卡片 / 格 / 按钮盒尺寸在动画全程恒等。
*/
.fx-layer {
  position: absolute; left: 0; top: 0; right: 0; bottom: 0;
  border-radius: 8px; pointer-events: none; z-index: 1014;
}
.fx-el { position: absolute; pointer-events: none; }
.fx-global {
  position: absolute; left: 0; top: 0; right: 0; bottom: 0;
  overflow: hidden; pointer-events: none; z-index: 1016;
}
.fx-result {
  position: absolute; left: 0; top: 0; right: 0; bottom: 0;
  pointer-events: none; z-index: 1018;
}
/*
  结果浮字（收尾相位；文案 = **数量摘要**，由 `business/inventory.ts` 装配产物拼出、不新造文案）。
  单行截断（`nowrap` + `overflow: hidden` + `ellipsis`）：文字再长也只在层内截断 ⇒ 层 / 卡片 / 格尺寸不变
  （本层是绝对定位叠加层 + `pointer-events: none`，不参与布局）。完整回执仍由 `uni.showToast` 交付。
*/
.fx-float {
  padding: 6px 12px; border-radius: 12px; box-sizing: border-box; max-width: 100%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 12px; line-height: 1.5; text-align: center; color: #FFE9C9;
  background: rgba(62, 39, 35, 0.92);
  box-shadow: inset 0 0 0 1px rgba(255, 233, 201, 0.45);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}
.fx-float.fail { background: rgba(90, 30, 30, 0.94); color: #FFD9D9; box-shadow: inset 0 0 0 1px rgba(255, 180, 180, 0.5); }

/*
  自绘二次确认框（取代 `uni.showModal`）：遮罩 **1030** / 面板 **1031** —— 恒高于提示层 1010 与特效层 1014–1018，
  故不再需要「先 `closeTip()` 再弹框」的绕法（先例 `.som-confirm-mask` 结构；文案逐字取 `business/jade-ops.ts`）。
*/
.inv-confirm-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1030;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.inv-confirm {
  position: relative; z-index: 1031;
  width: 80%; max-width: 340px; box-sizing: border-box; padding: 18px; border-radius: 14px;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  display: flex; flex-direction: column;
  /* 入场（180ms 上浮；不阻塞交互）—— 两帧法由 `.is-in` 触发，零 @keyframes */
  transform: translateY(8px) scale(.98);
}
.inv-confirm.is-in {
  transform: translateY(0) scale(1);
  transition: transform 180ms cubic-bezier(.34, 1.56, .64, 1);
}
.inv-confirm-ribbon {
  height: 3px; border-radius: 2px; margin: -6px 0 12px; opacity: .9;
  background: linear-gradient(90deg, rgba(208, 126, 141, 0), #D07E8D 30%, #FBE0E4 50%, #D07E8D 70%, rgba(208, 126, 141, 0));
}
.inv-confirm-title { display: block; font-size: 16px; font-weight: 600; color: #5D4037; letter-spacing: .5px; }
.inv-confirm-body { display: block; font-size: 13px; color: #5D4037; line-height: 1.6; margin-top: 8px; }
.inv-confirm-actions { display: flex; gap: 10px; margin-top: 16px; }
.inv-confirm-btn {
  flex: 1; text-align: center; padding: 8px 0; border-radius: 8px;
  background: #FBF8F5; border: 1px solid #E0D6CB;
  transition: transform .1s ease;
}
.inv-confirm-btn-text { font-size: 14px; color: #5D4037; }
.inv-confirm-btn.ok {
  background: linear-gradient(180deg, #EFA9B4, #C4747F); border-color: #C4747F;
  box-shadow: inset 0 1px 0 rgba(255, 246, 248, 0.8), inset 0 0 0 1px rgba(255, 246, 248, 0.6);
}
.inv-confirm-btn.ok .inv-confirm-btn-text { color: #FFF6F8; }

/* 溢出提示行（按类型汇总；文案逐字取 business/inventory.ts） */
.inv-overflow { display: flex; flex-wrap: wrap; margin-top: 6px; }
.inv-overflow-label { font-size: 12px; color: #C62828; }
.inv-overflow-text { font-size: 12px; color: #C62828; font-weight: bold; }

.inv-notice { margin-top: 10px; font-size: 12px; color: #999; text-align: center; }
.inv-error { margin-top: 10px; font-size: 12px; color: #C62828; line-height: 1.6; }
</style>
