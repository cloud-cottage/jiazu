#!/usr/bin/env node

/**
 * tree-id 生成工具
 *
 * 用法:
 *   node shell-scripts/gen-tree-id.mjs 季 01  →  ji_23376_01
 *   node shell-scripts/gen-tree-id.mjs 顾 01  →  gu_39039_01
 */

const PINYIN_MAP = {
  '季': 'ji',  '纪': 'ji',  '顾': 'gu',  '李': 'li',
  '王': 'wang', '张': 'zhang', '刘': 'liu', '陈': 'chen',
  '杨': 'yang', '赵': 'zhao', '黄': 'huang', '周': 'zhou',
  '吴': 'wu',   '徐': 'xu',   '孙': 'sun',  '胡': 'hu',
  '朱': 'zhu',  '高': 'gao',  '林': 'lin',  '何': 'he',
  '郭': 'guo',  '马': 'ma',   '罗': 'luo',  '梁': 'liang',
  '宋': 'song', '郑': 'zheng', '谢': 'xie',  '韩': 'han',
  '唐': 'tang', '冯': 'feng', '于': 'yu',   '董': 'dong',
  '萧': 'xiao', '程': 'cheng', '曹': 'cao',  '袁': 'yuan',
  '邓': 'deng', '许': 'xu',   '傅': 'fu',   '沈': 'shen',
  '曾': 'zeng', '彭': 'peng', '吕': 'lv',   '苏': 'su',
  '卢': 'lu',   '蒋': 'jiang', '蔡': 'cai',  '贾': 'jia',
  '丁': 'ding', '魏': 'wei',  '薛': 'xue',  '叶': 'ye',
  '阎': 'yan',  '余': 'yu',   '潘': 'pan',  '杜': 'du',
  '戴': 'dai',  '夏': 'xia',  '钟': 'zhong', '汪': 'wang',
  '田': 'tian', '任': 'ren',  '姜': 'jiang', '范': 'fan',
  '方': 'fang', '石': 'shi',  '姚': 'yao',  '谭': 'tan',
  '廖': 'liao', '邹': 'zou',  '熊': 'xiong', '金': 'jin',
  '陆': 'lu',   '郝': 'hao',  '孔': 'kong', '白': 'bai',
  '崔': 'cui',  '康': 'kang', '毛': 'mao',  '邱': 'qiu',
  '秦': 'qin',  '江': 'jiang', '史': 'shi',  '侯': 'hou',
  '邵': 'shao', '孟': 'meng', '龙': 'long', '万': 'wan',
  '段': 'duan', '雷': 'lei',  '钱': 'qian', '汤': 'tang',
  '尹': 'yin',  '易': 'yi',   '常': 'chang', '武': 'wu',
  '乔': 'qiao', '贺': 'he',   '赖': 'lai',  '龚': 'gong',
  '文': 'wen',
};

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('用法: node gen-tree-id.mjs <汉字> [序号]');
    console.log('示例:');
    console.log('  node gen-tree-id.mjs 季 01   # → ji_23376_01');
    console.log('  node gen-tree-id.mjs 顾      # → gu_39039 (前缀)');
    console.log('');
    console.log('格式: 拼音_Unicode十进制码点_支派序号');
    process.exit(0);
  }

  const char = args[0];
  const sequence = args[1];

  if (char.length !== 1) {
    console.error('错误: 请输入单个汉字');
    process.exit(1);
  }

  const pinyin = PINYIN_MAP[char];
  if (!pinyin) {
    console.error(`错误: 未找到 "${char}" 的拼音映射，请在 PINYIN_MAP 中添加`);
    process.exit(1);
  }

  const codePoint = char.codePointAt(0);
  const prefix = `${pinyin}_${codePoint}`;

  if (sequence) {
    if (!/^\d{2}$/.test(sequence)) {
      console.error('错误: 序号必须为两位数字 (e.g. 01)');
      process.exit(1);
    }
    console.log(`${prefix}_${sequence}`);
    console.log(`汉字: ${char}`);
    console.log(`拼音: ${pinyin}`);
    console.log(`Unicode: U+${codePoint.toString(16).toUpperCase()} (${codePoint})`);
    console.log(`tree-id: ${prefix}_${sequence}`);
  } else {
    console.log(prefix);
    console.log(`汉字: ${char}`);
    console.log(`拼音: ${pinyin}`);
    console.log(`Unicode: U+${codePoint.toString(16).toUpperCase()} (${codePoint})`);
    console.log(`前缀: ${prefix}`);
    console.log(`完整 tree-id: ${prefix}_XX (请替换 XX 为支派序号)`);
  }
}

main();
