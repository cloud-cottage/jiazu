/**
 * 全站唯一节点编号铸号器 —— docs/id-system.spec.md §3
 *
 * 计数器持久化在集合 `jiazu_id_seq`（本地 migrate-output/collections/jiazu_id_seq.json）：
 *   { _id: 'person', next: <number> }   // next = 下一个待分配号（1-based）
 *   { _id: 'family', next: <number> }
 *
 * 铸号走原子递增：
 * - 云端：store.colAtomicNext → db.collection.doc.update({ next: _.inc(delta) })（原子，绝不重号）
 * - 本地：进程内按 kind 串行（写锁）→ 读 → 写回；同一进程内绝不重号
 *
 * 编号格式（docs/id-system.spec.md §2）：人员 `I` + 6 位十进（I000052）；家族 `F` + 6 位（F000012）。
 * 一经分配**终身不变**：跨树迁移、改父、改名都不重编号（§8-4）。
 */
import fs from 'fs';
import path from 'path';
import { colGet, colSet, colAtomicNext, PATHS, SOURCE } from './store.js';

export const SEQ_COLLECTION = 'jiazu_id_seq';
export const SEQ_PERSON = 'person';
export const SEQ_FAMILY = 'family';
export const ID_WIDTH = 6;

/** 数字 → 人读编号（I000052 / F000012） */
export function formatId(kind, n) {
  const prefix = kind === SEQ_FAMILY ? 'F' : 'I';
  return `${prefix}${String(Math.max(1, Number(n) || 0)).padStart(ID_WIDTH, '0')}`;
}

export const formatPersonId = (n) => formatId(SEQ_PERSON, n);
export const formatFamilyId = (n) => formatId(SEQ_FAMILY, n);

/**
 * 解析「全局编号」写法（纯函数）：
 * `I000052` / `000052` / `i52` → { kind:'person', number:52 }；`F000012` / `000012` → { kind:'family', number:12 }
 * 非编号写法（handle、空）→ null。注意 1–6 位都收，超出 6 位不是编号写法。
 */
export function parseGlobalId(ref) {
  const s = String(ref || '').trim();
  const m = s.match(/^([IF]?)(\d{1,6})$/i);
  if (!m) return null;
  const prefix = (m[1] || '').toUpperCase();
  return { kind: prefix === 'F' ? SEQ_FAMILY : SEQ_PERSON, number: parseInt(m[2], 10) };
}

/** 编号的数值部分（非编号写法 → null） */
export function numberOfId(id) {
  const m = String(id || '').match(/^[IF]?(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

// ---- 计数器读写 ----

export async function readSeq(kind) {
  const doc = await colGet(SEQ_COLLECTION, kind);
  const n = Number(doc?.next);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function writeSeq(kind, next) {
  const value = Math.max(1, Number(next) || 1);
  await colSet(SEQ_COLLECTION, kind, { _id: kind, next: value });
  return value;
}

/** 本地数据根下所有树的既有编号最大值（stub：云端不扫文件） */
function localMaxIds() {
  const out = { person: 0, family: 0 };
  if (SOURCE !== 'local') return out;
  const dir = path.join(PATHS.out, 'trees');
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const tree = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const p of Object.values(tree.people || {})) {
        out.person = Math.max(out.person, numberOfId(p?.gramps_id) || 0);
      }
      for (const fam of Object.values(tree.families || {})) {
        out.family = Math.max(out.family, numberOfId(fam?.gramps_id) || 0);
      }
    } catch {
      /* 坏文件忽略 */
    }
  }
  return out;
}

/**
 * 计数器缺失时初始化（幂等）：
 * - 已有计数器 → 原样返回（绝不回退，杜绝重号）
 * - 缺失 → 本地按「既有数据最大编号 + 1」播种（迁移前的兜底，保证不与存量撞号）；
 *   云端缺失 → 1（云端首值由迁移脚本写入 jiazu_id_seq）
 * @param {boolean} [force] true = 即使计数器已存在也按 max+1 抬升（只抬不降，供迁移脚本用）
 */
export async function initSeqIfMissing(force = false) {
  const maxima = localMaxIds();
  const kinds = [
    [SEQ_PERSON, maxima.person],
    [SEQ_FAMILY, maxima.family],
  ];
  const out = {};
  for (const [kind, max] of kinds) {
    const cur = await readSeq(kind);
    const want = Math.max(1, max + 1);
    if (!cur || (force && cur < want)) {
      out[kind] = await writeSeq(kind, want);
    } else {
      out[kind] = cur;
    }
  }
  return out;
}

// ---- 原子预留（本地写锁 / 云端 inc） ----

const seqLocks = new Map(); // kind -> promise chain（本地串行；云端只做 SDK 互斥兜底）

function withLock(kind, fn) {
  const prev = seqLocks.get(kind) || Promise.resolve();
  const run = prev.then(fn, fn);
  seqLocks.set(
    kind,
    run.then(
      () => {},
      () => {},
    ),
  );
  return run;
}

/**
 * 预留 count 个连续编号 → 数值数组（1-based）。
 * 本地：写锁内读-改-写；云端：colAtomicNext（inc 原子）。
 */
export async function reserveIds(kind, count = 1) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (SOURCE === 'local') {
    return withLock(kind, async () => {
      let next = await readSeq(kind);
      if (!next) next = (await initSeqIfMissing())[kind] || 1;
      await writeSeq(kind, next + n);
      return Array.from({ length: n }, (_, i) => next + i);
    });
  }
  await initSeqIfMissing(); // 云端：计数器不存在时建文档（值为 1）→ 之后走 inc
  const prev = await colAtomicNext(SEQ_COLLECTION, kind, n);
  return Array.from({ length: n }, (_, i) => prev + 1 + i);
}

/** 预留 n 个人物编号 → ['I000138', ...] */
export async function reservePersonIds(count = 1) {
  return (await reserveIds(SEQ_PERSON, count)).map(formatPersonId);
}

/** 预留 n 个家族编号 → ['F000079', ...] */
export async function reserveFamilyIds(count = 1) {
  return (await reserveIds(SEQ_FAMILY, count)).map(formatFamilyId);
}

/** 取消预留（写失败时把没用掉的号吐回去；只回退到「当前值仍等于预留末值」时才回收） */
export function unusedIdsNotice() {
  return '预留未使用的编号不回滚（宁缺号不重号）';
}

export async function nextPersonId() {
  return (await reservePersonIds(1))[0];
}

export async function nextFamilyId() {
  return (await reserveFamilyIds(1))[0];
}

/**
 * 同步铸号器：把预先预留好的编号串成同步分配函数（给纯函数/同步写路径用）。
 * 预留为空（或耗尽）→ 返回 ''（调用方需保证预留充足；见 normalizeId 的语义）。
 */
export function idAllocator(ids = []) {
  let i = 0;
  const list = [...ids];
  return () => (i < list.length ? list[i++] : '');
}

/** 铸号结果兜底：分配器给空值时退回旧口径（never break 既有纯函数） */
export function withFallback(id, fallbackFn) {
  return id || (typeof fallbackFn === 'function' ? fallbackFn() : '');
}
