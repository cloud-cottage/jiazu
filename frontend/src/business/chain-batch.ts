/**
 * 批量添加子孙：粘贴文本 → 名字序列（**纯函数模块**，无网络 / 无 UI 代码，可直接单测）
 *
 * 口径（产品已拍板）：
 * - 一次最多 10 代（后端 `/admin/chain-append-batch` 同上限）；
 * - 粘贴内容 = **一条线单传**的后代（每代一人），不填分支（同辈多人）；
 * - 只解析「名」，**姓统一随父姓继承**，批量录入不允许改姓（故本模块不产出姓）。
 *
 * 解析规则：
 * - 切分：任意连续的 换行（\n/\r）/「、」/「，」/「,」/制表符/全角·半角空格；
 * - 序号剥离：每项开头的「阿拉伯数字 / 中文数字（一|二|…|十|廿|卅|百 及组合）/ 括号包裹的上述数字」
 *   连同可选的分隔尾符（、 , ． . ） )）一并剥掉，不入姓名；纯序号项（如 `1.` `（3）` `四`）整项丢弃；
 * - 每项 trim，空项丢弃；顺序 = 粘贴顺序（第 1 项 = 父节点的子，即后代第 1 代）。
 */

/** 一次最多可添加的代数（与后端契约一致） */
export const BATCH_MAX_GEN = 10;
/** 单个名字最大字数（超过即拒绝，避免误粘整段说明文字） */
export const BATCH_MAX_NAME_LEN = 20;

/** 任意连续的分隔符：换行 / 顿号 / 全角逗号 / 半角逗号 / 制表符 / 全角·半角空格等空白 */
const SEPARATOR_RE = /[\n\r、，,\s]+/;

/** 中文数字（含组合，如 十 / 廿三 / 一百二十 / 两） */
const CN_NUM = '[一二三四五六七八九十廿卅百千零两]+';

/** 序号本体：括号包裹的数字，或裸阿拉伯数字 / 中文数字 */
const SERIAL_BODY = `(?:[（(]\\s*(?:\\d+|${CN_NUM})\\s*[)）]|\\d+|${CN_NUM})`;

/** 整项就是序号（可带尾分隔符）→ 该项不是姓名，丢弃 */
const SERIAL_ONLY_RE = new RegExp(`^\\s*${SERIAL_BODY}\\s*[、,．.）)]?\\s*$`);

/**
 * 项首序号（+ 可选尾分隔符）→ 剥掉。
 * 注意：裸中文数字后面**必须**跟真分隔符才算序号（否则「三宝」这类名字会被误剥）。
 */
const SERIAL_PREFIX_RE = new RegExp(
  `^(?:[（(]\\s*(?:\\d+|${CN_NUM})\\s*[)）]|\\d+\\s*[、,．.）)]|${CN_NUM}\\s*[、,．.）)])`,
);

/**
 * 解析粘贴文本为「一条线单传」的名字序列。
 *
 * @param text 用户粘贴的原文
 * @param max  一次最多几代（默认 {@link BATCH_MAX_GEN}）
 * @returns `{ names, error }`：`names` = 按序解析出的名字（命中错误时也可能非空，**调用方以 `error` 为准**）；
 *          `error` 非空表示不可提交（文案已定稿，按序判定：空 → 超上限 → 单项过长）。
 */
export function parseBatchNames(text: string, max: number = BATCH_MAX_GEN): { names: string[]; error: string } {
  const names: string[] = [];
  for (const raw of String(text ?? '').split(SEPARATOR_RE)) {
    let item = raw.trim();
    if (!item) continue;
    if (SERIAL_ONLY_RE.test(item)) continue; // 纯序号（1. / （3） / 四）→ 丢弃
    item = item.replace(SERIAL_PREFIX_RE, '').trim();
    if (!item) continue;
    names.push(item);
  }

  if (!names.length) return { names, error: '请粘贴要添加的子孙名字' };
  if (names.length > max) return { names, error: `一次最多添加 ${max} 代，当前 ${names.length} 代` };
  for (let i = 0; i < names.length; i += 1) {
    // 按码点数（而非 UTF-16 长度）计字，避免生僻字/emoji 被多算
    if ([...names[i]].length > BATCH_MAX_NAME_LEN) {
      return { names, error: `第 ${i + 1} 个名字过长（最多 ${BATCH_MAX_NAME_LEN} 字）` };
    }
  }
  return { names, error: '' };
}

/**
 * 解析预览文案：`将按顺序添加 N 代：第 49 世 → 甲；第 50 世 → 乙；…`
 * @param names    解析出的名字（按序）
 * @param startGen 起始世数（= 面板 nextGen，父节点世数 + 1）
 */
export function formatBatchPreview(names: string[], startGen: number): string {
  if (!names.length) return '';
  const lines = names.map((n, i) => `第 ${startGen + i} 世 → ${n}`);
  return `将按顺序添加 ${names.length} 代：${lines.join('；')}`;
}

/**
 * 提交前二次确认弹窗正文：前 5 项 + 「…等共 N 代」+ 「将在第 A–B 世依次添加」。
 * @param names    解析出的名字（按序）
 * @param startGen 起始世数（= 面板 nextGen）
 */
export function buildBatchConfirmContent(names: string[], startGen: number): string {
  if (!names.length) return '';
  const endGen = startGen + names.length - 1;
  const head = names.slice(0, 5).map((n, i) => `第 ${startGen + i} 世 → ${n}`).join('\n');
  const more = names.length > 5 ? `\n…等共 ${names.length} 代` : '';
  const surnameNote = '姓随父姓继承（批量录入不可改姓）。';
  return `请输入一条线单传的后代，确认按序添加：\n${head}${more}\n将在第 ${startGen}–${endGen} 世依次添加。${surnameNote}`;
}
