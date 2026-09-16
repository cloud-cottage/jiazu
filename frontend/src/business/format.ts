/**
 * 展示层格式化工具。
 *
 * 编号前缀约定：Gramps 记录类型前缀 I=Individual（个人）/ F=Family（家庭）。
 * 人(I)与家庭(F)是两套独立编号段，同树内 I500013 与 F500013 可能并存，且多树
 * 之间人编号也可能同号 → 存储/引用层必须保留前缀；仅在 UI 给人看时剥离。
 */
export function personIdDisplay(id?: string | null): string {
  if (!id) return '';
  // 仅当「I + 纯数字」时剥离首字母；其它形态（异常/无前缀/含字母）原样展示
  return /^I\d+$/.test(id) ? id.slice(1) : id;
}

/**
 * 生卒日期展示统一格式化（档案/列表共用，避免各处手写转换不一致）。
 * - 纯 4 位年份 "1957" / "1920" → 按年份展示（原样）
 * - 完整日期 "1957-12-04" / "1957/12/04" → 统一为 YYYY-MM-DD 展示
 * - 其它（含月份无日等少见形态 / 脏数据）→ 去除空白后原样展示，绝不臆造
 */
export function dateDisplay(date?: string | null): string {
  const s = (date || '').trim();
  if (!s) return '';
  // 纯 4 位年份
  if (/^\d{4}$/.test(s)) return s;
  // YYYY-MM-DD 或 YYYY/MM/DD（含分隔符变体）→ 统一连字符
  const m = s.match(/^(\d{4})[/\-.](\d{1,2})(?:[/\-.](\d{1,2}))?$/);
  if (m) {
    const mm = m[2].padStart(2, '0');
    return m[3] ? `${m[1]}-${mm}-${m[3].padStart(2, '0')}` : `${m[1]}-${mm}`;
  }
  return s;
}

/**
 * 称号类属性（详情文档 attributes 的 key）的**展示顺序**：封号 → 谥号 → 号。
 * 约定：人物名称统一显示为「姓 + 名 + 封号 + 谥号 + 号」（节点卡片/档案/编辑表单字段顺序同此）。
 * 存储仍在详情文档 attributes；GEDCOM 导出映射 TITL(封号) / NICK(号) / _ATTR(谥号)。
 */
export const TITLE_DISPLAY_ORDER = ['封号', '谥号', '号'] as const;
/** 称号三字段（key 集合，顺序无关的遍历/清理场景用它） */
export const TITLE_ATTR_KEYS = TITLE_DISPLAY_ORDER;

/** 属性数组 → {key: value}（同 key 后者覆盖前者） */
export function attrMapOf(attributes?: Array<{ key: string; value: string }> | null): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of attributes || []) map[a.key] = a.value;
  return map;
}

/**
 * 称号串：按「封号 → 谥号 → 号」取全部已录入项，用 · 连接；全空返回 ''（调用方据此决定是否渲染）。
 * 例：封号=毕公 → 「毕公」；封号=毕公 + 谥号=文 → 「毕公·文」。
 */
export function titleLabel(attributes?: Array<{ key: string; value: string }> | null): string {
  const map = attrMapOf(attributes);
  return TITLE_DISPLAY_ORDER.map((k) => (map[k] || '').trim())
    .filter(Boolean)
    .join('·');
}

/**
 * 人物名称 = 姓+名 + 封号 + 谥号 + 号（展示统一走这里，避免各处自行拼接顺序不一）。
 * 例：姬高 + 封号毕公 → 「姬高·毕公」；无称号时原样返回姓名。
 */
export function nameWithTitles(name?: string | null, titles?: string | null): string {
  const n = (name || '').trim();
  const t = (titles || '').trim();
  if (!t) return n;
  return n ? `${n}·${t}` : t;
}

/**
 * 家族树展示名：有姓氏 → 「X氏 · 树名」；姓氏缺失（tree-meta 里 surname_char / surname 为 null）
 * → 只显示树名，不留下「氏 · 」空姓前缀。
 * 例：('沈氏临沂家族', null) → 「沈氏临沂家族」（旧写法会拼成「氏 · 沈氏临沂家族」）。
 */
export function treeDisplayLabel(
  title?: string | null,
  surname?: string | null,
): string {
  const t = (title || '').trim();
  const s = (surname || '').trim();
  return s ? `${s}氏 · ${t}` : t;
}

