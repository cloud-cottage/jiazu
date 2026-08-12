/**
 * tree-id 工具模块
 * 格式：拼音_汉字Unicode十进制码点_支派序号
 * 示例：ji_23376_01
 */

/**
 * 汉字 → 拼音_Unicode十进制 前缀
 * @param char 单个汉字
 * @returns 如 "ji_23376"，无法转换时返回 null
 */
export function charToPrefix(char: string): string | null {
  if (!char || char.length !== 1) return null;

  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return null;

  // 使用 Intl 或 pinyin 库获取拼音
  // 这里先用 Unicode 码点做 fallback
  const pinyin = getPinyin(char);
  if (!pinyin) return null;

  return `${pinyin}_${codePoint}`;
}

/**
 * 生成完整 tree-id
 * @param char 汉字
 * @param sequence 支派序号（两位数字字符串，如 "01"）
 */
export function makeTreeId(char: string, sequence: string): string | null {
  const prefix = charToPrefix(char);
  if (!prefix) return null;
  return `${prefix}_${sequence}`;
}

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

// ---- 内部 ----

const PINYIN_MAP: Record<string, string> = {
  '季': 'ji',
  '纪': 'ji',
  '顾': 'gu',
  '李': 'li',
  '王': 'wang',
  '张': 'zhang',
  '刘': 'liu',
  '陈': 'chen',
  '杨': 'yang',
  '赵': 'zhao',
  '黄': 'huang',
  '周': 'zhou',
  '吴': 'wu',
  '徐': 'xu',
  '孙': 'sun',
  '胡': 'hu',
  '朱': 'zhu',
  '高': 'gao',
  '林': 'lin',
  '何': 'he',
  '郭': 'guo',
  '马': 'ma',
  '罗': 'luo',
  '梁': 'liang',
  '宋': 'song',
  '郑': 'zheng',
  '谢': 'xie',
  '韩': 'han',
  '唐': 'tang',
  '冯': 'feng',
  '于': 'yu',
  '董': 'dong',
  '萧': 'xiao',
  '程': 'cheng',
  '曹': 'cao',
  '袁': 'yuan',
  '邓': 'deng',
  '许': 'xu',
  '傅': 'fu',
  '沈': 'shen',
  '曾': 'zeng',
  '彭': 'peng',
  '吕': 'lv',
  '苏': 'su',
  '卢': 'lu',
  '蒋': 'jiang',
  '蔡': 'cai',
  '贾': 'jia',
  '丁': 'ding',
  '魏': 'wei',
  '薛': 'xue',
  '叶': 'ye',
  '阎': 'yan',
  '余': 'yu',
  '潘': 'pan',
  '杜': 'du',
  '戴': 'dai',
  '夏': 'xia',
  '钟': 'zhong',
  '汪': 'wang',
  '田': 'tian',
  '任': 'ren',
  '姜': 'jiang',
  '范': 'fan',
  '方': 'fang',
  '石': 'shi',
  '姚': 'yao',
  '谭': 'tan',
  '廖': 'liao',
  '邹': 'zou',
  '熊': 'xiong',
  '金': 'jin',
  '陆': 'lu',
  '郝': 'hao',
  '孔': 'kong',
  '白': 'bai',
  '崔': 'cui',
  '康': 'kang',
  '毛': 'mao',
  '邱': 'qiu',
  '秦': 'qin',
  '江': 'jiang',
  '史': 'shi',
  '顾': 'gu',
  '侯': 'hou',
  '邵': 'shao',
  '孟': 'meng',
  '龙': 'long',
  '万': 'wan',
  '段': 'duan',
  '雷': 'lei',
  '钱': 'qian',
  '汤': 'tang',
  '尹': 'yin',
  '易': 'yi',
  '常': 'chang',
  '武': 'wu',
  '乔': 'qiao',
  '贺': 'he',
  '赖': 'lai',
  '龚': 'gong',
  '文': 'wen',
};

function getPinyin(char: string): string | null {
  return PINYIN_MAP[char] || null;
}
