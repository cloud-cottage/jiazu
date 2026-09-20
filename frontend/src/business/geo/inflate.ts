/**
 * 极简 raw DEFLATE（RFC 1951）解压器 + base64 / UTF-8 解码 —— **前端发源地载荷解压专用**
 *
 * 为什么要它：小程序**主包上限 2 MiB**，而发源地数据集（3,771 项）明文 JSON 太大（实测 153 KB 全量 /
 * 79 KB 数组化），压到 base64(deflateRaw) 后只剩 31 KB（实测）。小程序与 H5 运行时都**没有**
 * `zlib` / `DecompressionStream`（小程序无；H5 的 `DecompressionStream` 不能跨端），故自带解压器。
 * 载荷形状与生成口径见 `scripts/gen-geo-divisions.mjs` 文件头（生成端用 node `zlib.deflateRawSync`，
 * 解压端即本模块 —— **两套实现，互为交叉验证**）。
 *
 * 覆盖范围 = DEFLATE 全量语义（stored / 固定霍夫曼 / 动态霍夫曼 + LZ77 长度-距离回拷），
 * 不是「只认自家生成器输出」的裁剪实现；`frontend` 侧实测见 `scripts/verify-geo-frontend.mjs` 的模糊测试。
 *
 * 纯函数、零依赖、零 IO：只吃 base64 字符串，返回 UTF-8 文本。不依赖 DOM / wx / Buffer / TextDecoder。
 */

const MAXBITS = 15;

/** 长度码 257–285 的基准值与附加位数（RFC 1951 §3.2.5） */
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
/** 距离码 0–29 的基准值与附加位数 */
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** 动态码表的码长表顺序（RFC 1951 §3.2.7） */
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** 霍夫曼码表：`counts[len]` = 码长 len 的符号数；`symbols` = 按码长、再按符号值升序排列 */
interface Huffman {
  counts: Int32Array;
  symbols: Uint16Array;
}

/** 位流读取器：`v` 右对齐保存待读位（低 `n` 位有效），`n` ≤ 22（每次只按需补足，不溢出 32 位） */
interface BitReader {
  src: Uint8Array;
  pos: number;
  v: number;
  n: number;
}

/** 由码长数组构造规范霍夫曼码表（puff.c `construct` 同算法；允许不完整码表，仅拒绝过满码表） */
function buildHuffman(lengths: ArrayLike<number>, n: number): Huffman {
  const counts = new Int32Array(MAXBITS + 1);
  for (let i = 0; i < n; i++) counts[lengths[i]]++;
  if (counts[0] === n) {
    // 该码表一个符号都没有（DEFLATE 允许：块内不使用该表）
    counts[0] = 0;
    return { counts, symbols: new Uint16Array(0) };
  }
  let left = 1;
  for (let len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= counts[len];
    if (left < 0) throw new Error('[geo] DEFLATE 霍夫曼码表过满（码流损坏）');
  }
  const offs = new Int32Array(MAXBITS + 2);
  for (let len = 1; len <= MAXBITS; len++) offs[len + 1] = offs[len] + counts[len];
  const symbols = new Uint16Array(n);
  for (let sym = 0; sym < n; sym++) if (lengths[sym] !== 0) symbols[offs[lengths[sym]]++] = sym;
  return { counts, symbols };
}

/** 固定霍夫曼块（BTYPE=1）的码表；模块加载期建一次 */
const FIXED_LIT: Huffman = (() => {
  const lengths = new Uint8Array(288);
  for (let i = 0; i < 144; i++) lengths[i] = 8;
  for (let i = 144; i < 256; i++) lengths[i] = 9;
  for (let i = 256; i < 280; i++) lengths[i] = 7;
  for (let i = 280; i < 288; i++) lengths[i] = 8;
  return buildHuffman(lengths, 288);
})();
const FIXED_DIST: Huffman = buildHuffman(new Uint8Array(30).fill(5), 30);

function refill(st: BitReader, k: number): void {
  while (st.n < k) {
    if (st.pos < st.src.length) st.v |= st.src[st.pos++] << st.n;
    st.n += 8;
  }
}

/** 取 k 位（低位在前，DEFLATE 位序）；k = 0 → 0 */
function takeBits(st: BitReader, k: number): number {
  refill(st, k);
  st.n -= k;
  const r = st.v & ((1 << k) - 1);
  st.v >>>= k;
  return r;
}

/** 按码表解一个符号（puff.c `decode` 同算法） */
function decodeSym(st: BitReader, h: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len <= MAXBITS; len++) {
    code |= takeBits(st, 1);
    const count = h.counts[len];
    if (code - count < first) return h.symbols[index + (code - first)];
    index += count;
    first += count;
    first <<= 1;
    code <<= 1;
  }
  throw new Error('[geo] DEFLATE 码流损坏（码长超过 15 位）');
}

/** 读动态霍夫曼块头（BTYPE=2）→ 字面量/长度表 + 距离表 */
function readDynamicTables(st: BitReader): [Huffman, Huffman] {
  const hlit = takeBits(st, 5) + 257;
  const hdist = takeBits(st, 5) + 1;
  const hclen = takeBits(st, 4) + 4;
  const clen = new Uint8Array(19);
  for (let i = 0; i < hclen; i++) clen[CLEN_ORDER[i]] = takeBits(st, 3);
  const clHuff = buildHuffman(clen, 19);

  const lengths = new Uint8Array(hlit + hdist);
  let i = 0;
  while (i < lengths.length) {
    const sym = decodeSym(st, clHuff);
    if (sym < 16) {
      lengths[i++] = sym;
      continue;
    }
    let repeat = 0;
    let value = 0;
    if (sym === 16) {
      if (i === 0) throw new Error('[geo] DEFLATE 码长表首位不得使用重复码 16');
      value = lengths[i - 1];
      repeat = takeBits(st, 2) + 3;
    } else if (sym === 17) {
      repeat = takeBits(st, 3) + 3;
    } else {
      repeat = takeBits(st, 7) + 11;
    }
    while (repeat-- > 0) lengths[i++] = value;
    if (i > lengths.length) throw new Error('[geo] DEFLATE 码长表越界（码流损坏）');
  }
  return [buildHuffman(lengths.subarray(0, hlit), hlit), buildHuffman(lengths.subarray(hlit), hdist)];
}

/** raw DEFLATE 解压（无 zlib 头尾；生成端 = node `zlib.deflateRawSync`） */
export function inflateRaw(src: Uint8Array): Uint8Array {
  const st: BitReader = { src, pos: 0, v: 0, n: 0 };
  let out = new Uint8Array(1 << 16);
  let oi = 0;

  for (;;) {
    const last = takeBits(st, 1);
    const type = takeBits(st, 2);
    if (type === 0) {
      st.n = 0; // 丢弃当前字节剩余位（对齐到字节边界；已读字节不退回）
      const len = src[st.pos] | (src[st.pos + 1] << 8);
      st.pos += 4;
      for (let i = 0; i < len; i++) {
        if (oi === out.length) {
          const grown = new Uint8Array(out.length * 2);
          grown.set(out);
          out = grown;
        }
        out[oi++] = st.pos < src.length ? src[st.pos++] : 0;
      }
    } else if (type === 1 || type === 2) {
      const [lit, dist] = type === 1 ? [FIXED_LIT, FIXED_DIST] : readDynamicTables(st);
      for (;;) {
        const sym = decodeSym(st, lit);
        if (sym < 256) {
          if (oi === out.length) {
            const grown = new Uint8Array(out.length * 2);
            grown.set(out);
            out = grown;
          }
          out[oi++] = sym;
          continue;
        }
        if (sym === 256) break; // 块结束
        const li = sym - 257;
        if (li >= LEN_BASE.length) throw new Error('[geo] DEFLATE 长度码越界（码流损坏）');
        const length = LEN_BASE[li] + takeBits(st, LEN_EXTRA[li]);
        const ds = decodeSym(st, dist);
        if (ds >= DIST_BASE.length) throw new Error('[geo] DEFLATE 距离码越界（码流损坏）');
        const back = DIST_BASE[ds] + takeBits(st, DIST_EXTRA[ds]);
        if (back > oi) throw new Error('[geo] DEFLATE 回拷距离超过已解出字节数（码流损坏）');
        for (let i = 0; i < length; i++) {
          if (oi === out.length) {
            const grown = new Uint8Array(out.length * 2);
            grown.set(out);
            out = grown;
          }
          out[oi] = out[oi - back];
          oi++;
        }
      }
    } else {
      throw new Error('[geo] DEFLATE 保留块类型 3（码流损坏）');
    }
    if (last) break;
  }
  return out.subarray(0, oi);
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 → 字节（忽略 `=` 与换行等非字母表字符；扩容上界 = 长度 × 3/4） */
export function base64ToBytes(b64: string): Uint8Array {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) table[B64_ALPHABET.charCodeAt(i)] = i;
  const out = new Uint8Array(((b64.length + 3) >> 2) * 3);
  let oi = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const c = b64.charCodeAt(i);
    const v = c < 128 ? table[c] : -1;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[oi++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, oi);
}

/** UTF-8 字节 → 字符串（自带实现：小程序无 `TextDecoder`；覆盖 1–4 字节序列与代理对） */
export function utf8ToString(bytes: Uint8Array): string {
  let s = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      s += String.fromCharCode(b0);
    } else if (b0 < 0xe0) {
      s += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b0 < 0xf0) {
      s += String.fromCharCode(((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else {
      const cp = ((b0 & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      const m = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (m >> 10), 0xdc00 + (m & 0x3ff));
    }
  }
  return s;
}

/** `base64(deflateRaw(UTF-8 文本))` → 文本（发源地载荷解压的唯一入口） */
export function inflateBase64ToUtf8(b64: string): string {
  return utf8ToString(inflateRaw(base64ToBytes(b64)));
}
