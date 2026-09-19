/**
 * tree-id 工具模块
 * 格式：拼音_汉字Unicode十进制码点_支派序号
 * 示例：ji_23376_01
 *
 * ⚠️ 注音（姓氏 → 拼音）**不在前端实现**：唯一真源 = 后端
 * `cloudfunctions/compat-api/lib/tree-write.js` 的 `surnamePinyin()`（pinyin-pro 姓氏模式）。
 * 前端只做解析与格式校验，避免 H5 包体引入拼音词典，也避免拼音表再次漂移。
 */

/**
 * 从 tree-id 解析各部分
 */
export function parseTreeId(treeId: string): {
  pinyin: string;
  codePoint: number;
  sequence: string;
  char: string;
} | null {
  const parts = treeId.split('_');
  if (parts.length < 3) return null;

  const pinyin = parts[0];
  const codePoint = parseInt(parts[1], 10);
  const sequence = parts[2];

  if (isNaN(codePoint)) return null;

  const char = String.fromCodePoint(codePoint);
  return { pinyin, codePoint, sequence, char };
}

/**
 * 校验 tree-id 格式是否合法
 */
export function isValidTreeId(treeId: string): boolean {
  return /^[a-z]+_\d+_\d{2}$/.test(treeId);
}
