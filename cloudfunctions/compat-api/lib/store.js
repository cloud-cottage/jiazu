/**
 * 数据访问层（P1/P2 共用，双模式）
 *
 * local 模式（COMPAT_SOURCE=local）：
 *   - 树 JSON / 详情：读写 migrate-output/（trees/ + details/）
 *   - 集合：读写 migrate-output/collections/<col>.json（模拟 CloudBase 文档集合）
 * cloud 模式（COMPAT_SOURCE=cloud，默认）：
 *   - 树 JSON：云存储（fileID 来自 jiazu_tree_meta.storage_files）
 *   - 详情 / 集合：CloudBase 文档库（jiazu_ 前缀集合）
 *
 * 全部 SDK 调用走 sdkCall 互斥队列（@cloudbase/node-sdk 并发会 aborted）。
 */
import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 双形态兼容：CJS（云函数打包产物）用全局 __dirname；ESM（本地源码）用 import.meta.url
const __dirname = (() => {
  try {
    return eval('__dirname');
  } catch {
    return path.dirname(fileURLToPath(import.meta.url));
  }
})();
// lib/ → compat-api/ → cloudfunctions/ → 项目根
const REPO = path.dirname(path.dirname(path.dirname(__dirname)));
// COMPAT_OUT_DIR：本地测试可把数据根指到副本目录，避免写坏 migrate-output 真源
const OUT = process.env.COMPAT_OUT_DIR || path.join(REPO, 'migrate-output');
const COLS_DIR = path.join(OUT, 'collections');
// 真实 tree-meta（git 管理，唯一真源）—— 只允许「非沙箱」的本地服务写它
const REAL_META_FILE = path.join(REPO, 'config', 'tree-meta.json');

/**
 * 硬护栏（P0，防「测试夹具覆盖真实 tree-meta」事故复发）：
 * 沙箱判定 = 显式副本（COMPAT_OUT_DIR / COMPAT_META_FILE）或 node --test 子进程（NODE_TEST_CONTEXT）。
 * 沙箱下 meta 的读写根一律是副本：
 *   COMPAT_META_FILE > <COMPAT_OUT_DIR>/tree-meta.json > 抛错（绝不落真实 config/tree-meta.json）
 */
const SANDBOX_BY_ENV = !!(process.env.COMPAT_META_FILE || process.env.COMPAT_OUT_DIR);
const SANDBOX = SANDBOX_BY_ENV || !!process.env.NODE_TEST_CONTEXT;
const META_FILE = (() => {
  if (process.env.COMPAT_META_FILE) return path.resolve(process.env.COMPAT_META_FILE);
  if (process.env.COMPAT_OUT_DIR) return path.join(path.resolve(process.env.COMPAT_OUT_DIR), 'tree-meta.json');
  return REAL_META_FILE;
})();

const samePath = (a, b) => {
  try {
    return path.resolve(a) === path.resolve(b);
  } catch {
    return a === b;
  }
};

/**
 * 沙箱（测试 / 副本模式）下的统一写保护：真实 config/tree-meta.json 与真实 migrate-output/
 * 一律拒绝写入 → 抛错（宁可让测试红，也不许污染真源）。
 * 说明：非沙箱（本地服务，如在跑的 3100）不受影响，照常写真源。
 */
function assertWriteAllowed(target) {
  if (!SANDBOX) return target;
  const p = path.resolve(String(target));
  const realRoot = path.join(REPO, 'migrate-output');
  const hitsReal =
    samePath(p, REAL_META_FILE) || p === realRoot || p.startsWith(realRoot + path.sep);
  // 显式指到副本（COMPAT_OUT_DIR/COMPAT_META_FILE）时天然不会命中真源；命中即配置错误或漏配
  if (hitsReal) {
    throw new Error(
      `[store] 沙箱模式（COMPAT_OUT_DIR / COMPAT_META_FILE / node --test）禁止写入真实数据：${p}；` +
        '请把 COMPAT_OUT_DIR / COMPAT_META_FILE 指向 /tmp 副本',
    );
  }
  return target;
}

const ENV = process.env.TCB_ENV_ID || process.env.CB_ENV || '';
export const SOURCE = process.env.COMPAT_SOURCE || 'cloud'; // local | cloud

/** 当前运行模式的路径快照（回归测试断言「没指到真源」用） */
export const PATHS = {
  out: OUT,
  metaFile: META_FILE,
  realMetaFile: REAL_META_FILE,
  sandbox: SANDBOX,
  sandboxByEnv: SANDBOX_BY_ENV,
  sandboxByTestRunner: !SANDBOX_BY_ENV && !!process.env.NODE_TEST_CONTEXT,
};

let app = null;
let metaCache = null;
const treeCache = new Map(); // tree_id -> tree JSON
const eventIndexCache = new Map(); // tree_id -> Map(event_handle -> event)
const colCache = new Map(); // col -> Map(_id -> doc)

// ---- SDK 互斥队列（并发 abort 防护） ----

let sdkQueue = Promise.resolve();
async function sdkCall(fn) {
  const run = sdkQueue.then(async () => {
    try {
      return await fn();
    } catch (e) {
      if (String(e?.message || e).includes('abort')) {
        await new Promise((r) => setTimeout(r, 200));
        return fn();
      }
      throw e;
    }
  });
  sdkQueue = run.catch(() => {});
  return run;
}

function getApp() {
  if (!app) app = cloudbase.init({ env: ENV, ...(process.env.CB_KEY ? { accessKey: process.env.CB_KEY } : {}) });
  return app;
}

// ---- 集合访问（users/wallets/anchors/... 统一接口） ----

function colFilePath(col) {
  return path.join(COLS_DIR, `${col}.json`);
}

async function loadCol(col) {
  if (colCache.has(col)) return colCache.get(col);
  let map = new Map();
  if (SOURCE === 'local') {
    try {
      const raw = JSON.parse(fs.readFileSync(colFilePath(col), 'utf8'));
      for (const [id, doc] of Object.entries(raw)) map.set(id, doc);
    } catch {
      /* 文件不存在 → 空集合 */
    }
  } else {
    const r = await sdkCall(() => getApp().database().collection(col).limit(5000).get());
    for (const d of r?.data || []) map.set(d._id, d);
  }
  colCache.set(col, map);
  return map;
}

/**
 * local 落盘（写整份集合文件）。**写路径一律「先落盘、成功后」**才更新进程内缓存
 * （F3：原实现是先 `colCache.set` 再落盘，落盘失败（EACCES/ENOSPC…）会让缓存脏掉，
 * 同进程后续 `colGet` 会读回「写成功」的幻影文档，而磁盘仍是旧值）。
 * @param {Map<string, any>} map 待落盘的**新**集合内容（不读 colCache）
 */
async function persistColMap(col, map) {
  if (SOURCE !== 'local') return;
  const target = assertWriteAllowed(colFilePath(col));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const obj = {};
  for (const [id, doc] of map) obj[id] = doc;
  fs.writeFileSync(target, JSON.stringify(obj, null, 2));
}

export async function colGet(col, id) {
  const map = await loadCol(col);
  return map.get(id) || null;
}

export async function colSet(col, id, doc) {
  const map = await loadCol(col);
  const { _id, ...rest } = doc;
  const value = { _id: id, ...rest };
  if (SOURCE === 'local') {
    // 先落盘、成功后才换缓存：失败时缓存保持旧值（抛错传播，绝不留幻影文档）
    const pending = new Map(map);
    pending.set(id, value);
    await persistColMap(col, pending);
    colCache.set(col, pending);
    return;
  }
  await sdkCall(() => getApp().database().collection(col).doc(id).set({ ...rest }));
  map.set(id, value);
}

export async function colDelete(col, id) {
  const map = await loadCol(col);
  if (SOURCE === 'local') {
    // 同 colSet：先落盘、成功后才换缓存
    const pending = new Map(map);
    pending.delete(id);
    await persistColMap(col, pending);
    colCache.set(col, pending);
    return;
  }
  await sdkCall(() => getApp().database().collection(col).doc(id).remove());
  map.delete(id);
}

/**
 * 原子递增集合文档的数值字段（计数器用；docs/id-system.spec.md §3）。
 * - 云端：`db.collection.doc.update({ [field]: _.inc(delta) })` 原子自增 → 读回新值 → 返回**递增前**的值
 *   （sdkCall 互斥队列保证 inc+read 之间不被本进程其它调用插入；跨实例并发靠 inc 原子性绝不重号）
 * - 本地：读-改-写（调用方持有写锁，见 id-seq.reserveIds）
 * 文档不存在 → 以 delta 为初值创建，返回 0。
 * @returns {Promise<number>} 递增前的值（新分配的号 = 返回值 + 1 … 返回值 + delta）
 */
export async function colAtomicNext(col, id, delta = 1, field = 'next') {
  const step = Math.max(1, Math.floor(Number(delta) || 1));
  const map = await loadCol(col);
  if (SOURCE === 'local') {
    const cur = Number(map.get(id)?.[field]);
    const prev = Number.isFinite(cur) && cur > 0 ? cur : 0;
    // 同 colSet：先落盘、成功后才换缓存（失败时缓存保持旧值，绝不留幻影计数）
    const pending = new Map(map);
    pending.set(id, { _id: id, [field]: prev + step });
    await persistColMap(col, pending);
    colCache.set(col, pending);
    return prev;
  }
  return sdkCall(async () => {
    const db = getApp().database();
    const existing = map.get(id);
    if (!existing) {
      // 先写库、成功后才写缓存（SDK 失败不得污染进程内计数视图）
      await db.collection(col).doc(id).set({ [field]: step });
      map.set(id, { _id: id, [field]: step });
      return 0;
    }
    try {
      await db.collection(col).doc(id).update({ [field]: db.command.inc(step) });
    } catch (e) {
      // SDK/服务端不支持 inc 时不静默重号：直接抛出，由调用方决策
      throw new Error(`计数器原子递增失败（${col}.${id}）: ${e?.message || e}`);
    }
    const r = await db.collection(col).doc(id).get();
    const d = r?.data;
    const doc = Array.isArray(d) ? d[0] : d;
    const value = Number(doc?.[field]);
    const prev = Number.isFinite(value) ? value - step : 0;
    map.set(id, { _id: id, [field]: Number.isFinite(value) ? value : step });
    return Math.max(0, prev);
  });
}

/**
 * 铸号（docs/id-system.spec.md §3）：返回全站唯一的人读编号。
 * 全部创建路径必须走这里，不再按「树内序号」自增。
 */
export async function nextPersonId() {
  const { nextPersonId: next } = await import('./id-seq.js');
  return next();
}

export async function nextFamilyId() {
  const { nextFamilyId: next } = await import('./id-seq.js');
  return next();
}

export async function colAll(col) {
  const map = await loadCol(col);
  return [...map.values()];
}

export async function colWhere(col, predicate) {
  const map = await loadCol(col);
  return [...map.values()].filter(predicate);
}

// ---- tree-meta ----

export async function getMeta() {
  if (metaCache) return metaCache;
  if (SOURCE === 'local') {
    try {
      metaCache = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    } catch (e) {
      // 沙箱副本还没建：只读回退到真源作基线（写仍落副本，由 saveMeta 保证）
      if (SANDBOX && !samePath(META_FILE, REAL_META_FILE) && fs.existsSync(REAL_META_FILE)) {
        metaCache = JSON.parse(fs.readFileSync(REAL_META_FILE, 'utf8'));
      } else {
        throw e;
      }
    }
  } else {
    const r = await sdkCall(() => getApp().database().collection('jiazu_tree_meta').doc('global').get());
    const d = r?.data;
    metaCache = Array.isArray(d) ? d[0] || null : d || null;
  }
  return metaCache;
}

export async function saveMeta(meta) {
  if (SOURCE === 'local') {
    // 写入目标：非沙箱 = config/tree-meta.json 真源；沙箱 = 副本（COMPAT_META_FILE / COMPAT_OUT_DIR）
    const target = assertWriteAllowed(META_FILE);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(meta, null, 2) + '\n');
    // 先落盘、成功后才更新缓存（失败时 metaCache 保持旧值，不留幻影 meta）
    metaCache = meta;
    return;
  }
  await sdkCall(() => getApp().database().collection('jiazu_tree_meta').doc('global').set(meta));
  metaCache = meta;
}

// ---- 树 JSON（结构真源） ----

export async function getTree(treeId) {
  if (treeCache.has(treeId)) return treeCache.get(treeId);
  let tree = null;
  if (SOURCE === 'local') {
    const p = path.join(OUT, 'trees', `${treeId}.json`);
    if (fs.existsSync(p)) tree = JSON.parse(fs.readFileSync(p, 'utf8'));
  } else {
    const meta = await getMeta();
    const fileId = meta?.storage_files?.[treeId];
    if (fileId) {
      const r = await sdkCall(() => getApp().downloadFile({ fileID: fileId }));
      tree = JSON.parse(Buffer.from(r.fileContent).toString('utf8'));
    }
  }
  if (tree) treeCache.set(treeId, tree);
  return tree;
}

/** 保存树 JSON（version 乐观锁：写前比对，冲突抛错） */
export async function saveTree(tree, expectedVersion) {
  if (expectedVersion !== undefined && tree.version !== expectedVersion) {
    throw new Error('并发冲突：树已被其他操作修改，请刷新后重试');
  }
  // 落盘失败要「不留幻影」：记住自增前的版本与时间戳，失败时**原地还原**（磁盘才是真值），
  // 并失效进程内缓存 —— 否则同进程后续 getTree 会读到盘上不存在的幻影结构（真实缺陷 B：
  // chmod 0444 后一次改名被拒、磁盘未变，但同进程读接口已显示新名）。
  const prevVersion = tree.version;
  const prevUpdatedAt = tree.updated_at;
  tree.version = (tree.version || 1) + 1;
  tree.updated_at = new Date().toISOString();
  try {
    if (SOURCE === 'local') {
      const p = assertWriteAllowed(path.join(OUT, 'trees', `${tree.tree_id}.json`));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(tree, null, 2));
    } else {
      const meta = await getMeta();
      const fileId = meta?.storage_files?.[tree.tree_id];
      if (!fileId) throw new Error(`storage_files 缺少 ${tree.tree_id}`);
      await sdkCall(() => getApp().uploadFile({ cloudPath: `trees/${tree.tree_id}.json`, fileContent: Buffer.from(JSON.stringify(tree)) }));
    }
  } catch (e) {
    // 先还原版本号 / 时间戳（调用方可能还持有这棵树对象），再失效缓存
    tree.version = prevVersion;
    tree.updated_at = prevUpdatedAt;
    treeCache.delete(tree.tree_id);
    eventIndexCache.delete(tree.tree_id);
    throw e;
  }
  treeCache.set(tree.tree_id, tree);
  eventIndexCache.delete(tree.tree_id); // 树变更 → 事件索引失效
  return tree;
}

/**
 * 新建树 JSON（首写入）：local 直接落文件；cloud 先上传云存储拿 fileID 并写入 tree-meta.storage_files，
 * 之后 saveTree 才能按 fileID 覆盖（saveTree 依赖 storage_files 已有该树）。
 */
export async function createTreeFile(tree) {
  if (SOURCE === 'local') {
    const p = assertWriteAllowed(path.join(OUT, 'trees', `${tree.tree_id}.json`));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(tree, null, 2));
  } else {
    const meta = await getMeta();
    const r = await sdkCall(() =>
      getApp().uploadFile({ cloudPath: `trees/${tree.tree_id}.json`, fileContent: Buffer.from(JSON.stringify(tree)) }),
    );
    if (!r?.fileID) throw new Error('云存储上传未返回 fileID');
    meta.storage_files = meta.storage_files || {};
    meta.storage_files[tree.tree_id] = r.fileID;
    await saveMeta(meta);
  }
  treeCache.set(tree.tree_id, tree);
  return tree;
}

/**
 * 删除树 JSON（与 `createTreeFile` / `saveTree` 对称的删除路径）：
 * - local：删 `trees/<tree_id>.json` 文件
 * - cloud：删云存储文件（fileID 取自 tree-meta.storage_files）并移除该 storage_files 条目
 * 写序：**先落盘（删除）成功、再更新进程内缓存 / 写 meta**（与 colSet / saveTree 同口径）；
 * 缓存未命中视为已删（幂等，不抛错）。
 * 注：tree-meta 的 `trees[tree_id]` 条目由调用方按业务语义另行 `saveMeta` 处理（本函数不越权改注册表）。
 */
export async function deleteTree(treeId) {
  const id = String(treeId || '');
  if (!id) return;
  if (SOURCE === 'local') {
    const p = assertWriteAllowed(path.join(OUT, 'trees', `${id}.json`));
    if (fs.existsSync(p)) fs.unlinkSync(p); // 先删除落盘成功 …
    treeCache.delete(id); // … 再失效缓存
    eventIndexCache.delete(id);
    return;
  }
  const meta = await getMeta();
  const fileId = meta?.storage_files?.[id];
  if (fileId) {
    await sdkCall(() => getApp().deleteFile({ fileID: fileId }));
    if (meta.storage_files && id in meta.storage_files) {
      delete meta.storage_files[id];
      await saveMeta(meta); // 先删云文件成功，再从注册表摘掉 storage_files 条目
    }
  }
  treeCache.delete(id);
  eventIndexCache.delete(id);
}

/**
 * 全部家族树 tree_id（始祖挂载等需要遍历所有树的读侧推导用）：
 * tree-meta 注册 + 云存储登记文件 +（local 模式）trees 目录实际文件
 */
export async function listTreeIds() {
  const ids = new Set();
  try {
    const meta = await getMeta();
    for (const t of Object.values(meta?.trees || {})) if (t?.tree_id) ids.add(t.tree_id);
    for (const k of Object.keys(meta?.storage_files || {})) if (k) ids.add(k);
  } catch {
    /* meta 不可用 → 退回目录枚举 */
  }
  if (SOURCE === 'local') {
    try {
      for (const f of fs.readdirSync(path.join(OUT, 'trees'))) {
        if (f.endsWith('.json')) ids.add(f.slice(0, -'.json'.length));
      }
    } catch {
      /* 目录不存在 → 忽略 */
    }
  }
  return [...ids];
}

/** 树写入辅助：读树 → 修改 → 保存（串行化同一棵树的写，防并发覆盖） */
const treeWriteLocks = new Map();
export async function updateTree(treeId, fn) {
  const lock = treeWriteLocks.get(treeId) || Promise.resolve();
  const run = lock.then(async () => {
    const tree = await getTree(treeId);
    let result;
    try {
      result = await fn(tree);
      await saveTree(tree, tree.version);
    } catch (e) {
      // 失败（落库失败 / 业务校验在闭包内抛错）一律**失效进程内缓存**：闭包是就地改对象，
      // 磁盘没写、内存已改 —— 不失效就会留下「盘上没有、缓存里有」的幻影结构（缺陷 B）。
      // 失效后任何调用方的下一次 getTree 都从磁盘读真值（与 updateTrees 的失败处理同一口径）。
      treeCache.delete(treeId);
      eventIndexCache.delete(treeId);
      throw e;
    }
    return result;
  });
  treeWriteLocks.set(treeId, run.catch(() => {}));
  return run;
}

/**
 * 跨树事务写入（嫁娶/婚姻结束这类需要同时改两棵树的操作）：
 * ① 按 id 顺序加锁 → ② 取两侧树 + 深拷贝快照 → ③ 在内存里整体应用 fn({treeId: tree})
 * → ④ 顺序持久化；中途失败 → 已落盘的一侧写回快照、**未落盘的一侧失效进程内缓存**
 * （两者都不留「盘上没有、缓存里有」的幻影结构；local：文件写，回滚可靠）。
 * ⚠️ cloud 模式是两次上传，极端情况下仍可能一侧写入失败 —— 用 reconcile 补一致性。
 *
 * @param {string[]} treeIds
 * @param {(trees: Record<string, any>) => any} fn
 */
export async function updateTrees(treeIds, fn) {
  const ids = [...new Set(treeIds.filter(Boolean))];
  const locks = ids.map((id) => treeWriteLocks.get(id) || Promise.resolve());
  const run = Promise.all(locks).then(async () => {
    const trees = {};
    const snapshots = {};
    for (const id of ids) {
      trees[id] = await getTree(id);
      snapshots[id] = JSON.parse(JSON.stringify(trees[id]));
    }
    const result = await fn(trees);
    const written = [];
    try {
      for (const id of ids) {
        await saveTree(trees[id], snapshots[id].version);
        written.push(id);
      }
    } catch (e) {
      // 失败回滚：**对全部 ids 复原**，不只复原已落盘的一侧。
      // - 已落盘（written）：写回快照（版本号对齐当前值以通过乐观锁）；
      // - 未落盘：fn 已**就地改脏**进程内缓存对象（磁盘仍是旧内容）→ 失效缓存，
      //   否则同进程后续 getTree 会读到盘上不存在的「幻影结构」（婚姻 / 跨树加子女 /
      //   立支 / 汇宗等所有跨树事务共用本函数）。
      for (const id of ids) {
        if (written.includes(id)) {
          try {
            const snap = snapshots[id];
            const cur = await getTree(id);
            snap.version = cur?.version ?? snap.version; // 用当前版本通过乐观锁校验
            await saveTree(snap, snap.version);
          } catch {
            /* best-effort 回滚 */
          }
        } else {
          treeCache.delete(id); // 先失效缓存…
          eventIndexCache.delete(id); // …事件索引同步失效（与 deleteTree / saveTree 同口径）
        }
      }
      throw e;
    }
    return result;
  });
  for (const id of ids) treeWriteLocks.set(id, run.catch(() => {}));
  return run;
}

// ---- 人物详情（档案真源） ----

export async function getDetail(treeId, handle) {
  if (SOURCE === 'local') {
    const p = path.join(OUT, 'details', `${treeId}:${handle}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  const r = await sdkCall(() => getApp().database().collection('jiazu_person_details').doc(`${treeId}:${handle}`).get());
  const d = r?.data;
  return (Array.isArray(d) ? d[0] : d) || null;
}

export async function saveDetail(detail) {
  // _id 未显式提供时由 tree_id + handle 推导（createPerson/promote 等内部构造场景）
  const id = detail._id || `${detail.tree_id}:${detail.handle}`;
  const { _id, ...data } = detail;
  if (SOURCE === 'local') {
    const p = assertWriteAllowed(path.join(OUT, 'details', `${id}.json`));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(detail, null, 2));
    return;
  }
  await sdkCall(() => getApp().database().collection('jiazu_person_details').doc(id).set(data));
}

export async function deleteDetail(treeId, handle) {
  const id = `${treeId}:${handle}`;
  if (SOURCE === 'local') {
    const p = path.join(OUT, 'details', `${id}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  await sdkCall(() => getApp().database().collection('jiazu_person_details').doc(id).remove());
}

export async function getAllDetails(treeId) {
  if (SOURCE === 'local') {
    const out = [];
    for (const f of fs.readdirSync(path.join(OUT, 'details'))) {
      if (f.startsWith(`${treeId}:`) && f.endsWith('.json')) {
        out.push(JSON.parse(fs.readFileSync(path.join(OUT, 'details', f), 'utf8')));
      }
    }
    return out;
  }
  const r = await sdkCall(() => getApp().database().collection('jiazu_person_details').where({ tree_id: treeId }).limit(2000).get());
  return r?.data || [];
}

/** event handle → 事件对象 索引（lazy 构建 + 缓存） */
export async function getEventIndex(treeId) {
  if (eventIndexCache.has(treeId)) return eventIndexCache.get(treeId);
  const index = new Map();
  const details = await getAllDetails(treeId);
  for (const d of details) {
    for (const e of d.events || []) {
      if (e.handle) index.set(e.handle, e);
    }
  }
  eventIndexCache.set(treeId, index);
  return index;
}

export { getApp };
