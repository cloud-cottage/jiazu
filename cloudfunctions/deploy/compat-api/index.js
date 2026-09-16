var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// cloudfunctions/compat-api/lib/store.js
async function sdkCall(fn) {
  const run = sdkQueue.then(async () => {
    try {
      return await fn();
    } catch (e) {
      if (String(e?.message || e).includes("abort")) {
        await new Promise((r) => setTimeout(r, 200));
        return fn();
      }
      throw e;
    }
  });
  sdkQueue = run.catch(() => {
  });
  return run;
}
function getApp() {
  if (!app)
    app = import_node_sdk.default.init({ env: ENV, ...process.env.CB_KEY ? { accessKey: process.env.CB_KEY } : {} });
  return app;
}
function colFilePath(col) {
  return import_path.default.join(COLS_DIR, `${col}.json`);
}
async function loadCol(col) {
  if (colCache.has(col))
    return colCache.get(col);
  let map = /* @__PURE__ */ new Map();
  if (SOURCE === "local") {
    try {
      const raw = JSON.parse(import_fs.default.readFileSync(colFilePath(col), "utf8"));
      for (const [id, doc] of Object.entries(raw))
        map.set(id, doc);
    } catch {
    }
  } else {
    const r = await sdkCall(() => getApp().database().collection(col).limit(5e3).get());
    for (const d of r?.data || [])
      map.set(d._id, d);
  }
  colCache.set(col, map);
  return map;
}
async function persistCol(col) {
  if (SOURCE !== "local")
    return;
  import_fs.default.mkdirSync(COLS_DIR, { recursive: true });
  const map = colCache.get(col) || /* @__PURE__ */ new Map();
  const obj = {};
  for (const [id, doc] of map)
    obj[id] = doc;
  import_fs.default.writeFileSync(colFilePath(col), JSON.stringify(obj, null, 2));
}
async function colGet(col, id) {
  const map = await loadCol(col);
  return map.get(id) || null;
}
async function colSet(col, id, doc) {
  const map = await loadCol(col);
  const { _id, ...rest } = doc;
  map.set(id, { _id: id, ...rest });
  if (SOURCE === "local") {
    await persistCol(col);
    return;
  }
  await sdkCall(() => getApp().database().collection(col).doc(id).set({ ...rest }));
}
async function colDelete(col, id) {
  const map = await loadCol(col);
  map.delete(id);
  if (SOURCE === "local") {
    await persistCol(col);
    return;
  }
  await sdkCall(() => getApp().database().collection(col).doc(id).remove());
}
async function colAll(col) {
  const map = await loadCol(col);
  return [...map.values()];
}
async function colWhere(col, predicate) {
  const map = await loadCol(col);
  return [...map.values()].filter(predicate);
}
async function getMeta() {
  if (metaCache)
    return metaCache;
  if (SOURCE === "local") {
    metaCache = JSON.parse(import_fs.default.readFileSync(import_path.default.join(REPO, "config", "tree-meta.json"), "utf8"));
  } else {
    const r = await sdkCall(() => getApp().database().collection("jiazu_tree_meta").doc("global").get());
    const d = r?.data;
    metaCache = Array.isArray(d) ? d[0] || null : d || null;
  }
  return metaCache;
}
async function saveMeta(meta) {
  metaCache = meta;
  if (SOURCE === "local") {
    import_fs.default.writeFileSync(import_path.default.join(REPO, "config", "tree-meta.json"), JSON.stringify(meta, null, 2) + "\n");
    return;
  }
  await sdkCall(() => getApp().database().collection("jiazu_tree_meta").doc("global").set(meta));
}
async function getTree(treeId) {
  if (treeCache.has(treeId))
    return treeCache.get(treeId);
  let tree = null;
  if (SOURCE === "local") {
    const p = import_path.default.join(OUT, "trees", `${treeId}.json`);
    if (import_fs.default.existsSync(p))
      tree = JSON.parse(import_fs.default.readFileSync(p, "utf8"));
  } else {
    const meta = await getMeta();
    const fileId = meta?.storage_files?.[treeId];
    if (fileId) {
      const r = await sdkCall(() => getApp().downloadFile({ fileID: fileId }));
      tree = JSON.parse(Buffer.from(r.fileContent).toString("utf8"));
    }
  }
  if (tree)
    treeCache.set(treeId, tree);
  return tree;
}
async function saveTree(tree, expectedVersion) {
  if (expectedVersion !== void 0 && tree.version !== expectedVersion) {
    throw new Error("\u5E76\u53D1\u51B2\u7A81\uFF1A\u6811\u5DF2\u88AB\u5176\u4ED6\u64CD\u4F5C\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
  }
  tree.version = (tree.version || 1) + 1;
  tree.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  if (SOURCE === "local") {
    const p = import_path.default.join(OUT, "trees", `${tree.tree_id}.json`);
    import_fs.default.mkdirSync(import_path.default.dirname(p), { recursive: true });
    import_fs.default.writeFileSync(p, JSON.stringify(tree, null, 2));
  } else {
    const meta = await getMeta();
    const fileId = meta?.storage_files?.[tree.tree_id];
    if (!fileId)
      throw new Error(`storage_files \u7F3A\u5C11 ${tree.tree_id}`);
    await sdkCall(() => getApp().uploadFile({ cloudPath: `trees/${tree.tree_id}.json`, fileContent: Buffer.from(JSON.stringify(tree)) }));
  }
  treeCache.set(tree.tree_id, tree);
  eventIndexCache.delete(tree.tree_id);
  return tree;
}
async function createTreeFile(tree) {
  if (SOURCE === "local") {
    const p = import_path.default.join(OUT, "trees", `${tree.tree_id}.json`);
    import_fs.default.mkdirSync(import_path.default.dirname(p), { recursive: true });
    import_fs.default.writeFileSync(p, JSON.stringify(tree, null, 2));
  } else {
    const meta = await getMeta();
    const r = await sdkCall(
      () => getApp().uploadFile({ cloudPath: `trees/${tree.tree_id}.json`, fileContent: Buffer.from(JSON.stringify(tree)) })
    );
    if (!r?.fileID)
      throw new Error("\u4E91\u5B58\u50A8\u4E0A\u4F20\u672A\u8FD4\u56DE fileID");
    meta.storage_files = meta.storage_files || {};
    meta.storage_files[tree.tree_id] = r.fileID;
    await saveMeta(meta);
  }
  treeCache.set(tree.tree_id, tree);
  return tree;
}
async function updateTree(treeId, fn) {
  const lock = treeWriteLocks.get(treeId) || Promise.resolve();
  const run = lock.then(async () => {
    const tree = await getTree(treeId);
    const result = await fn(tree);
    await saveTree(tree, tree.version);
    return result;
  });
  treeWriteLocks.set(treeId, run.catch(() => {
  }));
  return run;
}
async function getDetail(treeId, handle) {
  if (SOURCE === "local") {
    const p = import_path.default.join(OUT, "details", `${treeId}:${handle}.json`);
    if (!import_fs.default.existsSync(p))
      return null;
    return JSON.parse(import_fs.default.readFileSync(p, "utf8"));
  }
  const r = await sdkCall(() => getApp().database().collection("jiazu_person_details").doc(`${treeId}:${handle}`).get());
  const d = r?.data;
  return (Array.isArray(d) ? d[0] : d) || null;
}
async function saveDetail(detail) {
  const id = detail._id || `${detail.tree_id}:${detail.handle}`;
  const { _id, ...data } = detail;
  if (SOURCE === "local") {
    const p = import_path.default.join(OUT, "details", `${id}.json`);
    import_fs.default.mkdirSync(import_path.default.dirname(p), { recursive: true });
    import_fs.default.writeFileSync(p, JSON.stringify(detail, null, 2));
    return;
  }
  await sdkCall(() => getApp().database().collection("jiazu_person_details").doc(id).set(data));
}
async function deleteDetail(treeId, handle) {
  const id = `${treeId}:${handle}`;
  if (SOURCE === "local") {
    const p = import_path.default.join(OUT, "details", `${id}.json`);
    if (import_fs.default.existsSync(p))
      import_fs.default.unlinkSync(p);
    return;
  }
  await sdkCall(() => getApp().database().collection("jiazu_person_details").doc(id).remove());
}
async function getAllDetails(treeId) {
  if (SOURCE === "local") {
    const out = [];
    for (const f of import_fs.default.readdirSync(import_path.default.join(OUT, "details"))) {
      if (f.startsWith(`${treeId}:`) && f.endsWith(".json")) {
        out.push(JSON.parse(import_fs.default.readFileSync(import_path.default.join(OUT, "details", f), "utf8")));
      }
    }
    return out;
  }
  const r = await sdkCall(() => getApp().database().collection("jiazu_person_details").where({ tree_id: treeId }).limit(2e3).get());
  return r?.data || [];
}
async function getEventIndex(treeId) {
  if (eventIndexCache.has(treeId))
    return eventIndexCache.get(treeId);
  const index = /* @__PURE__ */ new Map();
  const details = await getAllDetails(treeId);
  for (const d of details) {
    for (const e of d.events || []) {
      if (e.handle)
        index.set(e.handle, e);
    }
  }
  eventIndexCache.set(treeId, index);
  return index;
}
var import_node_sdk, import_fs, import_path, import_url, import_meta, __dirname, REPO, OUT, COLS_DIR, ENV, SOURCE, app, metaCache, treeCache, eventIndexCache, colCache, sdkQueue, treeWriteLocks;
var init_store = __esm({
  "cloudfunctions/compat-api/lib/store.js"() {
    import_node_sdk = __toESM(require("@cloudbase/node-sdk"), 1);
    import_fs = __toESM(require("fs"), 1);
    import_path = __toESM(require("path"), 1);
    import_url = require("url");
    import_meta = {};
    __dirname = (() => {
      try {
        return eval("__dirname");
      } catch {
        return import_path.default.dirname((0, import_url.fileURLToPath)(import_meta.url));
      }
    })();
    REPO = import_path.default.dirname(import_path.default.dirname(import_path.default.dirname(__dirname)));
    OUT = process.env.COMPAT_OUT_DIR || import_path.default.join(REPO, "migrate-output");
    COLS_DIR = import_path.default.join(OUT, "collections");
    ENV = process.env.TCB_ENV_ID || process.env.CB_ENV || "";
    SOURCE = process.env.COMPAT_SOURCE || "cloud";
    app = null;
    metaCache = null;
    treeCache = /* @__PURE__ */ new Map();
    eventIndexCache = /* @__PURE__ */ new Map();
    colCache = /* @__PURE__ */ new Map();
    sdkQueue = Promise.resolve();
    treeWriteLocks = /* @__PURE__ */ new Map();
  }
});

// cloudfunctions/compat-api/lib/auth.js
var auth_exports = {};
__export(auth_exports, {
  ROLE_LEVEL: () => ROLE_LEVEL,
  authUser: () => authUser,
  findOrCreateUser: () => findOrCreateUser,
  requestCode: () => requestCode,
  signJwt: () => signJwt,
  verifyCode: () => verifyCode,
  verifyJwt: () => verifyJwt
});
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function signJwt(payload, expiresSec) {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: now, exp: now + expiresSec };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = import_node_crypto.default.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}
function verifyJwt(token) {
  try {
    const [h, p, s] = token.split(".");
    const expect = import_node_crypto.default.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
    if (s !== expect)
      return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (payload.exp < Math.floor(Date.now() / 1e3))
      return null;
    return payload;
  } catch {
    return null;
  }
}
async function authUser(headers) {
  const auth = Object.entries(headers || {}).find(
    ([k]) => k.toLowerCase() === "authorization"
  )?.[1] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = verifyJwt(token);
  if (!payload)
    return null;
  const user = await colGet("jiazu_users", payload.phone);
  return user ? { phone: user.phone, role: user.role } : null;
}
function genCode() {
  return String(import_node_crypto.default.randomInt(0, 1e6)).padStart(6, "0");
}
function sendSms(phone, code) {
  if (SMS_PROVIDER === "tencent") {
    console.log(`[sms:tencent] \u53D1\u9001\u5230 ${phone}: ${code}\uFF08\u5C1A\u672A\u63A5\u5165 SDK\uFF09`);
    return;
  }
  console.log(`
\u{1F4F1} [\u9A8C\u8BC1\u7801] \u624B\u673A\u53F7 ${phone} \u2192 ${code}\uFF08\u6709\u6548\u671F ${CODE_TTL / 60} \u5206\u949F\uFF09
`);
}
async function requestCode(phone) {
  const code = genCode();
  await colSet("jiazu_sms_codes", phone, {
    code,
    expires_at: Date.now() + CODE_TTL * 1e3,
    attempts: 0
  });
  sendSms(phone, code);
  return { ok: true, message: "\u9A8C\u8BC1\u7801\u5DF2\u53D1\u9001", dev_code: SMS_PROVIDER === "console" ? code : void 0 };
}
async function verifyCode(phone, inputCode) {
  const entry = await colGet("jiazu_sms_codes", phone);
  if (!entry)
    return { ok: false, message: "\u8BF7\u5148\u83B7\u53D6\u9A8C\u8BC1\u7801" };
  if (Date.now() > entry.expires_at) {
    await colDelete("jiazu_sms_codes", phone);
    return { ok: false, message: "\u9A8C\u8BC1\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6" };
  }
  entry.attempts = (entry.attempts || 0) + 1;
  if (entry.attempts > 5) {
    await colDelete("jiazu_sms_codes", phone);
    return { ok: false, message: "\u5C1D\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6\u9A8C\u8BC1\u7801" };
  }
  if (entry.code !== inputCode) {
    await colSet("jiazu_sms_codes", phone, entry);
    return { ok: false, message: "\u9A8C\u8BC1\u7801\u9519\u8BEF" };
  }
  await colDelete("jiazu_sms_codes", phone);
  return { ok: true };
}
async function findOrCreateUser(phone, nickname) {
  let user = await colGet("jiazu_users", phone);
  if (!user) {
    const role = ADMIN_PHONE && phone === ADMIN_PHONE ? "chief_editor" : "user";
    user = {
      phone,
      nickname: nickname || `\u7528\u6237${phone.slice(-4)}`,
      role,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    await colSet("jiazu_users", phone, user);
  } else if (nickname && nickname !== user.nickname) {
    user.nickname = nickname;
    await colSet("jiazu_users", phone, user);
  }
  return user;
}
var import_node_crypto, JWT_SECRET, CODE_TTL, SMS_PROVIDER, ADMIN_PHONE, ROLE_LEVEL;
var init_auth = __esm({
  "cloudfunctions/compat-api/lib/auth.js"() {
    import_node_crypto = __toESM(require("node:crypto"), 1);
    init_store();
    JWT_SECRET = process.env.AUTH_JWT_SECRET || "dev-only-secret-change-me";
    CODE_TTL = Number(process.env.CODE_TTL_SECONDS || 300);
    SMS_PROVIDER = process.env.SMS_PROVIDER || "console";
    ADMIN_PHONE = process.env.ADMIN_PHONE || "";
    ROLE_LEVEL = {
      guest: 0,
      user: 1,
      branch_curator: 2,
      tree_steward: 3,
      chief_editor: 4
    };
  }
});

// cloudfunctions/compat-api/index.js
var compat_api_exports = {};
__export(compat_api_exports, {
  handleRequest: () => handleRequest,
  main: () => main
});
module.exports = __toCommonJS(compat_api_exports);
init_store();
init_auth();

// cloudfunctions/compat-api/lib/wallet.js
init_store();
var DEFAULT_FEE_CENTS = 990;
async function load() {
  const w = await colGet("jiazu_wallets", "global");
  return w || {
    users: {},
    trees: {},
    transactions: [],
    config: { tree_create_fee_cents: DEFAULT_FEE_CENTS }
  };
}
async function persist(w) {
  await colSet("jiazu_wallets", "global", w);
}
function txid() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
async function getTreeBalance(treeId) {
  const w = await load();
  return w.trees[treeId]?.balance_cents || 0;
}
async function getTreeCreateFeeCents() {
  const w = await load();
  return w.config.tree_create_fee_cents ?? DEFAULT_FEE_CENTS;
}
async function recharge(phone, amountCents) {
  if (amountCents <= 0)
    throw new Error("\u5145\u503C\u91D1\u989D\u5FC5\u987B\u5927\u4E8E 0");
  const w = await load();
  if (!w.users[phone])
    w.users[phone] = { balance_cents: 0 };
  w.users[phone].balance_cents += amountCents;
  w.transactions.push({ id: txid(), type: "recharge", user: phone, amount_cents: amountCents, desc: "\u5145\u503C", ts: (/* @__PURE__ */ new Date()).toISOString() });
  await persist(w);
  return w.users[phone].balance_cents;
}
async function transferToTree(phone, treeId, amountCents) {
  if (amountCents <= 0)
    throw new Error("\u8F6C\u8D26\u91D1\u989D\u5FC5\u987B\u5927\u4E8E 0");
  const w = await load();
  const balance = w.users[phone]?.balance_cents || 0;
  if (balance < amountCents)
    throw new Error(`\u4F59\u989D\u4E0D\u8DB3\uFF1A\u5F53\u524D \xA5${(balance / 100).toFixed(2)}`);
  w.users[phone].balance_cents -= amountCents;
  if (!w.trees[treeId])
    w.trees[treeId] = { balance_cents: 0 };
  w.trees[treeId].balance_cents += amountCents;
  w.transactions.push({ id: txid(), type: "transfer", user: phone, tree: treeId, amount_cents: amountCents, desc: `\u8F6C\u8D26\u5230\u5BB6\u65CF\u6811 ${treeId}`, ts: (/* @__PURE__ */ new Date()).toISOString() });
  await persist(w);
  return { user_balance: w.users[phone].balance_cents, tree_balance: w.trees[treeId].balance_cents };
}
async function deductTreeCreateFee(phone) {
  const fee = await getTreeCreateFeeCents();
  const w = await load();
  const balance = w.users[phone]?.balance_cents || 0;
  if (balance < fee) {
    throw new Error(`\u4F59\u989D\u4E0D\u8DB3\uFF0C\u65B0\u5EFA\u5BB6\u65CF\u6811\u9700\u8981 \xA5${(fee / 100).toFixed(2)}\uFF0C\u5F53\u524D\u4F59\u989D \xA5${(balance / 100).toFixed(2)}`);
  }
  w.users[phone].balance_cents -= fee;
  w.transactions.push({ id: txid(), type: "tree_create_fee", user: phone, amount_cents: -fee, desc: `\u65B0\u5EFA\u5BB6\u65CF\u6811\u8D39\u7528 \xA5${(fee / 100).toFixed(2)}`, ts: (/* @__PURE__ */ new Date()).toISOString() });
  await persist(w);
  return w.users[phone].balance_cents;
}
async function setTreeCreateFeeCents(amountCents) {
  if (amountCents <= 0)
    throw new Error("\u8D39\u7528\u5FC5\u987B\u5927\u4E8E 0");
  const w = await load();
  w.config.tree_create_fee_cents = amountCents;
  await persist(w);
  return amountCents;
}
async function getWalletOverview(phone) {
  const w = await load();
  const transactions = w.transactions.filter((t) => !t.user || t.user === phone).slice(-50).reverse();
  return {
    user_balance_yuan: ((w.users[phone]?.balance_cents || 0) / 100).toFixed(2),
    tree_create_fee_yuan: ((w.config.tree_create_fee_cents ?? DEFAULT_FEE_CENTS) / 100).toFixed(2),
    transactions
  };
}

// cloudfunctions/compat-api/lib/scope.js
init_store();
async function setAnchor(phone, treeId, personHandle) {
  await colSet("jiazu_anchors", phone, {
    tree_id: treeId,
    person_handle: personHandle,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function clearAnchor(phone) {
  await colDelete("jiazu_anchors", phone);
}
async function getAnchor(phone) {
  return colGet("jiazu_anchors", phone);
}
async function buildScope(families, phone, role) {
  if (role === "tree_steward" || role === "chief_editor") {
    return { person: null, family: null, unrestricted: true };
  }
  const anchor = await getAnchor(phone);
  if (!anchor)
    return { person: /* @__PURE__ */ new Set(), family: /* @__PURE__ */ new Set(), unrestricted: false };
  const personScope = /* @__PURE__ */ new Set([anchor.person_handle]);
  const familyScope = /* @__PURE__ */ new Set();
  const parentOf = /* @__PURE__ */ new Map();
  const childOf = /* @__PURE__ */ new Map();
  for (const f of families) {
    for (const p of [f.father_handle, f.mother_handle]) {
      if (!p)
        continue;
      if (!parentOf.has(p))
        parentOf.set(p, []);
      parentOf.get(p).push(f.handle);
    }
    for (const ch of f.child_handles || []) {
      if (!childOf.has(ch))
        childOf.set(ch, []);
      childOf.get(ch).push(f.handle);
    }
  }
  const descend = (start, limit) => {
    const queue = [start];
    const depth = /* @__PURE__ */ new Map([[start, 0]]);
    while (queue.length) {
      const h = queue.shift();
      const d = depth.get(h) || 0;
      if (limit !== null && d >= limit)
        continue;
      for (const famHandle of parentOf.get(h) || []) {
        familyScope.add(famHandle);
        const fam = families.find((x) => x.handle === famHandle);
        for (const ch of fam?.child_handles || []) {
          if (!depth.has(ch)) {
            depth.set(ch, d + 1);
            personScope.add(ch);
            queue.push(ch);
          }
        }
        if (fam?.father_handle && fam?.mother_handle) {
          const spouse = fam.father_handle === h ? fam.mother_handle : fam.father_handle;
          if (!depth.has(spouse)) {
            depth.set(spouse, d + 1);
            personScope.add(spouse);
          }
        }
      }
    }
  };
  if (role === "branch_curator") {
    descend(anchor.person_handle, 3);
    let cur = anchor.person_handle;
    for (let i = 0; i < 3; i++) {
      const fams = childOf.get(cur) || [];
      if (!fams.length)
        break;
      const fam = families.find((x) => x.handle === fams[0]);
      if (!fam)
        break;
      familyScope.add(fam.handle);
      const parent = fam.father_handle || fam.mother_handle;
      if (!parent)
        break;
      personScope.add(parent);
      cur = parent;
    }
  } else {
    descend(anchor.person_handle, null);
  }
  return { person: personScope, family: familyScope, unrestricted: false };
}
async function canEditPerson(families, phone, role, personHandle) {
  const scope = await buildScope(families, phone, role);
  if (scope.unrestricted)
    return true;
  return scope.person.has(personHandle);
}

// cloudfunctions/compat-api/lib/tree-write.js
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
init_store();
var EXTERNAL_KEYS = ["external_tree", "external_person_handle", "external_link_type"];
var CHAIN_ATTR_KEYS = ["external_chain_gen", "external_chain_aggregate", "external_chain_from"];
function genHandle() {
  return import_node_crypto2.default.randomBytes(12).toString("hex");
}
function nameParts(pn = {}) {
  const surname = (pn.surname_list || []).find((s) => s?.primary)?.surname || pn.surname_list?.[0]?.surname || "";
  const given = pn.first_name || "";
  return { surname, given, name: `${surname}${given}` || "\u672A\u77E5" };
}
function genderFromNum(g) {
  if (g === 1)
    return "M";
  if (g === 2)
    return "F";
  return "U";
}
function nextGrampsId(tree, prefix) {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = -1;
  let width = 0;
  for (const group of [tree.people, tree.families]) {
    for (const o of Object.values(group || {})) {
      const m = String(o.gramps_id || "").match(re);
      if (!m)
        continue;
      const n = parseInt(m[1], 10);
      if (n > max || n === max && m[1].length > width) {
        max = n;
        width = m[1].length;
      }
    }
  }
  if (max < 0)
    return `${prefix}1`;
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}
function attrOf(a) {
  return { key: typeof a?.type === "string" ? a.type : a?.type?.string || "", value: a?.value ?? "" };
}
function applyLifespan(person, body = {}) {
  if (body.birth_date !== void 0) {
    person.birth_date = String(body.birth_date || "").trim();
  }
  if (typeof body.is_living === "boolean") {
    person.is_living = body.is_living;
    if (body.is_living) {
      person.death_date = "";
    } else if (body.death_date !== void 0) {
      person.death_date = String(body.death_date || "").trim();
    }
  } else if (body.death_date !== void 0) {
    person.death_date = String(body.death_date || "").trim();
    if (person.death_date)
      person.is_living = false;
  }
  return person;
}
async function updatePerson(treeId, handle, body) {
  return updateTree(treeId, async (tree) => {
    const person = tree.people[handle];
    if (!person)
      throw new Error("person not found");
    const { surname, given, name } = nameParts(body.primary_name);
    person.surname = surname;
    person.given = given;
    person.name = name;
    if (body.gender !== void 0 && [0, 1, 2].includes(body.gender)) {
      person.gender = genderFromNum(body.gender);
    }
    applyLifespan(person, body);
    const ext = {};
    const others = [];
    for (const a of body.attribute_list || []) {
      const { key, value } = attrOf(a);
      if (!key)
        continue;
      if (EXTERNAL_KEYS.includes(key))
        ext[key] = value;
      else
        others.push({ key, value, type: key });
    }
    for (const k of EXTERNAL_KEYS)
      person[k] = ext[k] || "";
    const detail = await getDetail(treeId, handle) || { tree_id: treeId, handle, events: [], media: [], citations: [], notes: [], attributes: [] };
    detail.attributes = others;
    detail.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    await saveDetail(detail);
    return { ok: true, handle };
  });
}
async function createPerson(treeId, body) {
  return updateTree(treeId, async (tree) => {
    const handle = genHandle();
    const parts = nameParts(body.primary_name);
    const surname = parts.surname || inheritedSurname(tree, body.inherit_surname_from || "");
    const given = parts.given;
    const name = `${surname}${given}` || "\u672A\u77E5";
    const detailAttributes = [];
    const ext = {};
    for (const a of body.attribute_list || []) {
      const { key, value } = attrOf(a);
      if (!key)
        continue;
      if (EXTERNAL_KEYS.includes(key))
        ext[key] = value;
      else
        detailAttributes.push({ key, value, type: key });
    }
    const person = {
      handle,
      gramps_id: nextGrampsId(tree, "I"),
      name,
      surname,
      given,
      gender: genderFromNum(body.gender),
      birth_date: "",
      death_date: "",
      birth_place: "",
      death_place: "",
      parent_family: "",
      spouse_families: [],
      external_tree: ext.external_tree || "",
      external_person_handle: ext.external_person_handle || "",
      external_link_type: ext.external_link_type || ""
    };
    tree.people[handle] = person;
    await saveDetail({
      tree_id: treeId,
      handle,
      gramps_id: person.gramps_id,
      name,
      events: [],
      media: [],
      citations: [],
      notes: [],
      attributes: detailAttributes,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { handle, name, surname };
  });
}
function inheritedSurname(tree, parentHandle) {
  if (!parentHandle)
    return "";
  const parent = tree.people[parentHandle];
  if (!parent)
    return "";
  for (const fh of parent.spouse_families || []) {
    const fam = tree.families[fh];
    const father = fam?.father_handle ? tree.people[fam.father_handle] : null;
    if (father?.surname)
      return father.surname;
  }
  return parent.surname || "";
}
async function createFamily(treeId, body) {
  return updateTree(treeId, async (tree) => {
    const handle = genHandle();
    const father = body.father_handle || "";
    const mother = body.mother_handle || "";
    const children = (body.child_ref_list || []).map((c) => c.ref || c).filter(Boolean);
    tree.families[handle] = {
      handle,
      gramps_id: nextGrampsId(tree, "F"),
      father_handle: father,
      mother_handle: mother,
      child_handles: children
    };
    linkFamily(tree, handle, father, mother, children);
    return { handle };
  });
}
async function updateFamily(treeId, handle, body) {
  return updateTree(treeId, async (tree) => {
    const fam = tree.families[handle];
    if (!fam)
      throw new Error("family not found");
    unlinkFamily(tree, fam);
    fam.father_handle = body.father_handle || "";
    fam.mother_handle = body.mother_handle || "";
    fam.child_handles = (body.child_ref_list || []).map((c) => c.ref || c).filter(Boolean);
    linkFamily(tree, handle, fam.father_handle, fam.mother_handle, fam.child_handles);
    return { ok: true, handle };
  });
}
function linkFamily(tree, famHandle, father, mother, children) {
  for (const h of [father, mother]) {
    if (h && tree.people[h]) {
      if (!tree.people[h].spouse_families.includes(famHandle)) {
        tree.people[h].spouse_families.push(famHandle);
      }
    }
  }
  for (const c of children) {
    if (c && tree.people[c] && !tree.people[c].parent_family) {
      tree.people[c].parent_family = famHandle;
    }
  }
}
function unlinkFamily(tree, fam) {
  for (const h of [fam.father_handle, fam.mother_handle]) {
    if (h && tree.people[h]) {
      tree.people[h].spouse_families = tree.people[h].spouse_families.filter((x) => x !== fam.handle);
    }
  }
  for (const c of fam.child_handles || []) {
    if (c && tree.people[c] && tree.people[c].parent_family === fam.handle) {
      tree.people[c].parent_family = "";
    }
  }
}
function attrMap(detail) {
  const map = {};
  for (const a of detail?.attributes || [])
    map[a.key] = a.value;
  return map;
}
function nextChainGen(parentGen, opts = {}) {
  const gen = Number(parentGen);
  if (!Number.isFinite(gen) || gen < 0) {
    throw new Error("\u8BE5\u8282\u70B9\u4E0D\u5728\u4E2D\u534E\u4E16\u672C\u6E90\u6D41\u94FE\u4E0A\uFF08\u65E0\u4E16\u6570\uFF09\uFF0C\u65E0\u6CD5\u7EED\u7F16\u4E0B\u4E00\u4E16");
  }
  if (opts.aggregate) {
    throw new Error("\u805A\u5408\u865A\u4F4D\u8282\u70B9\u4EE3\u8868\u591A\u4E16\uFF08\u5982\u300C\u4F0F\u7FB2\u6C0F\u8BF8\u4E16\u300D2\u201344 \u4E16\uFF09\uFF0C\u8BF7\u5728\u5176\u540E\u7EE7\u8282\u70B9\u4E0A\u7EED\u7F16");
  }
  return gen + 1;
}
async function getChainInfo(treeId, handle) {
  const attrs = attrMap(await getDetail(treeId, handle));
  const raw = attrs.external_chain_gen;
  const gen = parseInt(raw || "", 10);
  return {
    gen: Number.isFinite(gen) ? gen : 0,
    onChain: raw !== void 0 && raw !== "",
    aggregate: attrs.external_chain_aggregate === "true",
    from: attrs.external_chain_from || "",
    note: attrs.external_relation_note || ""
  };
}
async function chainSiblings(treeId, gen, excludeHandle = "") {
  const tree = await getTree(treeId);
  const details = /* @__PURE__ */ new Map();
  for (const d of await getAllDetails(treeId))
    details.set(d.handle, attrMap(d));
  const out = [];
  for (const p of Object.values(tree.people)) {
    if (p.handle === excludeHandle)
      continue;
    if (parseInt(details.get(p.handle)?.external_chain_gen || "", 10) === gen) {
      out.push({ handle: p.handle, gramps_id: p.gramps_id, name: p.name, gen });
    }
  }
  out.sort((a, b) => String(a.gramps_id).localeCompare(String(b.gramps_id)));
  return out;
}
async function appendChainNode({
  treeId,
  parentHandle,
  mode = "new",
  name = "",
  surname = "",
  gender = "U",
  childHandle = "",
  note = "",
  extraAttributes = [],
  masterTreeId
}) {
  if (masterTreeId && treeId !== masterTreeId)
    throw new Error("\u7EED\u7F16\u4EC5\u9002\u7528\u4E8E\u4E2D\u534E\u4E16\u672C\u603B\u8C31");
  const tree0 = await getTree(treeId);
  if (!tree0)
    throw new Error(`\u6811\u4E0D\u5B58\u5728: ${treeId}`);
  const parent = tree0.people[parentHandle];
  if (!parent)
    throw new Error("\u7236\u8282\u70B9\u4E0D\u5B58\u5728\u4E8E\u603B\u8C31");
  const parentInfo = await getChainInfo(treeId, parentHandle);
  if (!parentInfo.onChain)
    throw new Error("\u8BE5\u8282\u70B9\u4E0D\u5728\u4E2D\u534E\u4E16\u672C\u6E90\u6D41\u94FE\u4E0A\uFF08\u65E0\u4E16\u6570\uFF09\uFF0C\u65E0\u6CD5\u7EED\u7F16\u4E0B\u4E00\u4E16");
  const gen = nextChainGen(parentInfo.gen, { aggregate: parentInfo.aggregate });
  let targetHandle = "";
  if (mode === "attach") {
    targetHandle = childHandle;
    if (!targetHandle)
      throw new Error("\u8BF7\u9009\u62E9\u8981\u6302\u63A5\u7684\u5DF2\u6709\u8282\u70B9");
    if (targetHandle === parentHandle)
      throw new Error("\u4E0D\u80FD\u628A\u8282\u70B9\u6302\u63A5\u5230\u81EA\u5DF1\u4E4B\u4E0B");
    const target = tree0.people[targetHandle];
    if (!target)
      throw new Error("\u5F85\u6302\u63A5\u8282\u70B9\u4E0D\u5B58\u5728\u4E8E\u603B\u8C31");
    const info = await getChainInfo(treeId, targetHandle);
    if (info.onChain)
      throw new Error(`\u300C${target.name}\u300D\u5DF2\u5728\u6E90\u6D41\u94FE\u7B2C ${info.gen} \u4E16`);
    if (target.parent_family && tree0.families[target.parent_family]) {
      throw new Error(`\u300C${target.name}\u300D\u5DF2\u6709\u7236\u6BCD\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u518D\u6B21\u6302\u63A5`);
    }
  } else if (!String(name).trim()) {
    throw new Error("\u8BF7\u586B\u5199\u59D3\u540D");
  }
  const created = { name: "" };
  const handle = await updateTree(treeId, async (tree) => {
    let h = targetHandle;
    if (mode === "new") {
      h = genHandle();
      const sn = String(surname || "").trim() || inheritedSurname(tree, parentHandle);
      const given = String(name || "").trim();
      tree.people[h] = {
        handle: h,
        gramps_id: nextGrampsId(tree, "I"),
        name: `${sn}${given}` || "\u672A\u77E5",
        surname: sn,
        given,
        gender: ["M", "F", "U"].includes(gender) ? gender : "U",
        birth_date: "",
        death_date: "",
        birth_place: "",
        death_place: "",
        parent_family: "",
        spouse_families: [],
        external_tree: "",
        external_person_handle: "",
        external_link_type: ""
      };
      created.name = tree.people[h].name;
    }
    const person = tree.people[h];
    const detail = await getDetail(treeId, h) || {
      tree_id: treeId,
      handle: h,
      gramps_id: person.gramps_id,
      name: person.name,
      events: [],
      media: [],
      citations: [],
      notes: [],
      attributes: []
    };
    const attributes = (detail.attributes || []).filter((a) => !CHAIN_ATTR_KEYS.includes(a.key));
    attributes.push({ key: "external_chain_gen", value: String(gen), type: "external_chain_gen" });
    if (mode === "new") {
      attributes.push({ key: "external_tree", value: treeId, type: "external_tree" });
    }
    if (note)
      attributes.push({ key: "external_relation_note", value: note, type: "external_relation_note" });
    for (const a of extraAttributes || []) {
      const key = String(a?.key || "").trim();
      if (!key || CHAIN_ATTR_KEYS.includes(key))
        continue;
      const value = String(a?.value ?? "").trim();
      if (!value)
        continue;
      attributes.push({ key, value, type: key });
    }
    detail.attributes = attributes;
    detail.gramps_id = person.gramps_id;
    detail.name = person.name;
    detail.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    await saveDetail(detail);
    const famHandles = tree.people[parentHandle].spouse_families || [];
    const fam = famHandles.length ? tree.families[famHandles[0]] : null;
    if (fam) {
      if (!(fam.child_handles || []).includes(h)) {
        fam.child_handles = [...fam.child_handles || [], h];
      }
      person.parent_family = fam.handle;
    } else {
      const fh = genHandle();
      const parentIsMother = tree.people[parentHandle].gender === "F";
      tree.families[fh] = {
        handle: fh,
        gramps_id: nextGrampsId(tree, "F"),
        father_handle: parentIsMother ? "" : parentHandle,
        mother_handle: parentIsMother ? parentHandle : "",
        child_handles: [h]
      };
      tree.people[parentHandle].spouse_families = [fh];
      person.parent_family = fh;
    }
    return h;
  });
  const siblings = await chainSiblings(treeId, gen, handle);
  const childName = created.name || tree0.people[handle]?.name || "";
  return {
    ok: true,
    tree_id: treeId,
    parent_handle: parentHandle,
    child_handle: handle,
    child_name: childName,
    gen,
    mode,
    siblings,
    branch: siblings.length > 0,
    message: `\u5DF2\u7EED\u7F16\u7B2C ${gen} \u4E16\uFF1A${childName}`
  };
}
function collectSubtree(tree, rootHandle) {
  const people = /* @__PURE__ */ new Set([rootHandle]);
  const families = /* @__PURE__ */ new Set();
  const queue = [rootHandle];
  while (queue.length) {
    const h = queue.shift();
    for (const fh of tree.people[h]?.spouse_families || []) {
      const fam = tree.families[fh];
      if (!fam || families.has(fh))
        continue;
      families.add(fh);
      for (const p of [fam.father_handle, fam.mother_handle]) {
        if (p && !people.has(p)) {
          people.add(p);
          queue.push(p);
        }
      }
      for (const c of fam.child_handles || []) {
        if (c && !people.has(c)) {
          people.add(c);
          queue.push(c);
        }
      }
    }
  }
  return { people, families };
}
var PINYIN_MAP = {
  \u5B63: "ji",
  \u987E: "gu",
  \u5218: "liu",
  \u6C88: "shen",
  \u79E6: "qin",
  \u674E: "li",
  \u738B: "wang",
  \u5F20: "zhang",
  \u9648: "chen",
  \u6768: "yang",
  \u8D75: "zhao",
  \u9EC4: "huang",
  \u5468: "zhou",
  \u5434: "wu",
  \u5F90: "xu",
  \u5B59: "sun",
  \u80E1: "hu",
  \u6731: "zhu",
  \u9AD8: "gao",
  \u6797: "lin",
  \u4F55: "he",
  \u90ED: "guo",
  \u9A6C: "ma",
  \u7F57: "luo",
  \u6881: "liang",
  \u5B8B: "song",
  \u90D1: "zheng",
  \u8C22: "xie",
  \u97E9: "han",
  \u5510: "tang",
  \u51AF: "feng",
  \u4E8E: "yu",
  \u8463: "dong",
  \u8427: "xiao",
  \u7A0B: "cheng",
  \u66F9: "cao",
  \u8881: "yuan",
  \u9093: "deng",
  \u8BB8: "xu",
  \u5085: "fu",
  \u66FE: "zeng",
  \u5F6D: "peng",
  \u5415: "lv",
  \u82CF: "su",
  \u5362: "lu",
  \u848B: "jiang",
  \u8521: "cai",
  \u8D3E: "jia",
  \u4E01: "ding",
  \u9B4F: "wei",
  \u859B: "xue",
  \u53F6: "ye",
  \u960E: "yan",
  \u4F59: "yu",
  \u6F58: "pan",
  \u675C: "du",
  \u6234: "dai",
  \u590F: "xia",
  \u949F: "zhong",
  \u6C6A: "wang",
  \u7530: "tian",
  \u4EFB: "ren",
  \u59DC: "jiang",
  \u8303: "fan",
  \u65B9: "fang",
  \u77F3: "shi",
  \u59DA: "yao",
  \u8C2D: "tan",
  \u5ED6: "liao",
  \u90B9: "zou",
  \u718A: "xiong",
  \u91D1: "jin",
  \u9646: "lu",
  \u90DD: "hao",
  \u5B54: "kong",
  \u767D: "bai",
  \u5D14: "cui",
  \u5EB7: "kang",
  \u6BDB: "mao",
  \u90B1: "qiu",
  \u6C5F: "jiang",
  \u53F2: "shi",
  \u4FAF: "hou",
  \u90B5: "shao",
  \u5B5F: "meng",
  \u9F99: "long",
  \u4E07: "wan",
  \u6BB5: "duan",
  \u96F7: "lei",
  \u94B1: "qian",
  \u6C64: "tang",
  \u5C39: "yin",
  \u6613: "yi",
  \u5E38: "chang",
  \u6B66: "wu",
  \u4E54: "qiao",
  \u8D3A: "he",
  \u8D56: "lai",
  \u9F9A: "gong",
  \u6587: "wen"
};
function nextTreeId(meta, surnameChar) {
  const char = String(surnameChar || "").trim();
  const pinyin = PINYIN_MAP[char] || "shi";
  const codePoint = char.codePointAt(0);
  for (let seq = 1; seq < 100; seq++) {
    const candidate = `${pinyin}_${codePoint}_${String(seq).padStart(2, "0")}`;
    if (!Object.values(meta.trees || {}).some((t) => t.tree_id === candidate))
      return candidate;
  }
  throw new Error(`\u59D3\u6C0F\u300C${char}\u300D\u4E0B\u652F\u6D3E\u5E8F\u53F7\u5DF2\u7528\u5C3D\uFF08\u226599\uFF09`);
}
async function createTree({
  surnameChar,
  founderName,
  founderGender = "M",
  displayTitle = "",
  genealogyName = "",
  hallName = "",
  origin = "",
  description = "",
  initiatorPhone = "",
  onBeforeWrite = null
}) {
  const char = String(surnameChar || "").trim();
  if (!/^[\u4e00-\u9fa5]$/.test(char))
    throw new Error("\u8BF7\u586B\u5199\u5355\u4E2A\u6C49\u5B57\u59D3\u6C0F");
  const given = String(founderName || "").trim();
  if (!given)
    throw new Error("\u8BF7\u586B\u5199\u59CB\u7956\u59D3\u540D");
  const gender = ["M", "F", "U"].includes(founderGender) ? founderGender : "M";
  const meta = await getMeta();
  const treeId = nextTreeId(meta, char);
  const handle = genHandle();
  const founderFullName = `${char}${given}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (onBeforeWrite)
    await onBeforeWrite();
  const tree = {
    _schema: "1.0",
    tree_id: treeId,
    founder_gramps_id: "I0001",
    version: 1,
    updated_at: now,
    people: {
      [handle]: {
        handle,
        gramps_id: "I0001",
        name: founderFullName,
        surname: char,
        given,
        gender,
        birth_date: "",
        death_date: "",
        birth_place: "",
        death_place: "",
        parent_family: "",
        spouse_families: [],
        external_tree: "",
        external_person_handle: "",
        external_link_type: ""
      }
    },
    families: {}
  };
  await createTreeFile(tree);
  await saveDetail({
    tree_id: treeId,
    handle,
    gramps_id: "I0001",
    name: founderFullName,
    events: [],
    media: [],
    citations: [],
    notes: [],
    attributes: [],
    updated_at: now
  });
  meta.trees[treeId] = {
    tree_id: treeId,
    path_alias: `/${treeId}`,
    surname_char: char,
    display_title: String(displayTitle || "").trim() || `${char}\u6C0F\u5BB6\u65CF`,
    genealogy_name: String(genealogyName || "").trim() || `${char}\u6C0F\u5BB6\u8C31`,
    archive_url: "",
    hall_name: String(hallName || "").trim() || `${char}\u6C0F\u5B97\u7960`,
    origin: String(origin || "").trim(),
    description: String(description || "").trim() || `\u65B0\u5EFA\u5BB6\u65CF\u6811\uFF0C\u59CB\u7956\uFF1A${founderFullName}`,
    enable_custom_domain: false,
    created_at: now,
    created_by: initiatorPhone || ""
  };
  await saveMeta(meta);
  return {
    ok: true,
    tree_id: treeId,
    founder_handle: handle,
    founder_gramps_id: "I0001",
    surname_char: char,
    display_title: meta.trees[treeId].display_title,
    message: `\u5DF2\u521B\u5EFA\u300C${meta.trees[treeId].display_title}\u300D\uFF08${treeId}\uFF09`
  };
}
async function splitTree({ treeId, ancestorHandle, ancestorName = "", initiatorPhone }) {
  const meta = await getMeta();
  const entry = Object.values(meta.trees).find((t) => t.tree_id === treeId);
  if (!entry)
    throw new Error(`\u672A\u627E\u5230 tree: ${treeId}`);
  let newTreeId = null;
  let movedPeople = 0;
  await updateTree(treeId, async (tree) => {
    const ancestor = tree.people[ancestorHandle];
    if (!ancestor)
      throw new Error("\u7956\u5148\u8282\u70B9\u4E0D\u5B58\u5728\u4E8E\u8BE5\u6811");
    const { people, families } = collectSubtree(tree, ancestorHandle);
    if (people.size <= 0)
      throw new Error("\u65E0\u8282\u70B9\u53EF\u62C6\u5206");
    const surnameChar = (ancestor.surname || entry.surname_char || "\u6C0F").slice(0, 1);
    newTreeId = nextTreeId(meta, surnameChar);
    const newTree = {
      _schema: tree._schema || "1.0",
      tree_id: newTreeId,
      founder_gramps_id: ancestor.gramps_id,
      version: 1,
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      people: {},
      families: {}
    };
    for (const h of people)
      newTree.people[h] = { ...tree.people[h] };
    for (const fh of families)
      newTree.families[fh] = { ...tree.families[fh] };
    if (newTree.people[ancestorHandle]) {
      newTree.people[ancestorHandle].parent_family = "";
    }
    for (const p of Object.values(newTree.people)) {
      if (p.parent_family && !newTree.families[p.parent_family])
        p.parent_family = "";
      p.spouse_families = p.spouse_families.filter((fh) => newTree.families[fh]);
    }
    for (const f of Object.values(newTree.families)) {
      if (f.father_handle && !newTree.people[f.father_handle])
        f.father_handle = "";
      if (f.mother_handle && !newTree.people[f.mother_handle])
        f.mother_handle = "";
      f.child_handles = f.child_handles.filter((c) => newTree.people[c]);
    }
    for (const h of people) {
      delete tree.people[h];
      await deleteDetail(treeId, h);
    }
    for (const fh of families)
      delete tree.families[fh];
    movedPeople = people.size;
    await saveTree(newTree);
    meta.trees[newTreeId] = {
      tree_id: newTreeId,
      path_alias: `/${newTreeId}`,
      surname_char: surnameChar,
      display_title: `${surnameChar}\u6C0F\u5BB6\u65CF`,
      genealogy_name: `${surnameChar}\u6C0F\u5BB6\u8C31`,
      archive_url: "",
      hall_name: "",
      origin: "",
      description: `\u7531 ${treeId} \u62C6\u5206\u800C\u6765\uFF0C\u59CB\u7956\uFF1A${ancestor.name || ancestorName}`,
      enable_custom_domain: false,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveMeta(meta);
    return { ok: true, newTreeId, movedPeople };
  });
  return {
    ok: true,
    newTreeId,
    surname: meta.trees[newTreeId].surname_char,
    movedPeople,
    message: `\u5DF2\u62C6\u5206 ${movedPeople} \u4EBA\u5230\u65B0\u5BB6\u65CF\u6811 ${newTreeId}`
  };
}
async function promoteTree({ treeId, nodeHandle, attachHandle, masterTreeId }) {
  if (treeId === masterTreeId)
    throw new Error("\u603B\u8C31\u672C\u8EAB\u4E0D\u53EF\u664B\u5B97");
  const master = await getTree(masterTreeId);
  const attach = master.people[attachHandle];
  if (!attach)
    throw new Error("\u6302\u63A5\u8282\u70B9\u4E0D\u5B58\u5728\u4E8E\u4E2D\u534E\u4E16\u672C");
  let attachGen = 0;
  const attachDetail = await getDetail(masterTreeId, attachHandle);
  for (const a of attachDetail?.attributes || []) {
    if (a.key === "external_chain_gen")
      attachGen = parseInt(a.value, 10) || 0;
  }
  if (!attachGen) {
    for (const p of Object.values(master.people)) {
      const d = await getDetail(masterTreeId, p.handle);
      const g = d?.attributes?.find((a) => a.key === "external_chain_gen");
      if (g)
        attachGen = Math.max(attachGen, parseInt(g.value, 10) || 0);
    }
  }
  let movedPeople = 0;
  let movedFamilies = 0;
  let chainGens = "";
  let masterNode = null;
  const chain = [];
  await updateTree(treeId, async (tree) => {
    let cur = nodeHandle;
    const chainPeople = [];
    const chainFamilies = [];
    while (true) {
      const person = tree.people[cur];
      if (!person)
        throw new Error(`\u8282\u70B9\u4E0D\u5B58\u5728: ${cur}`);
      chainPeople.push(person.handle);
      const pf = person.parent_family;
      if (!pf || !tree.families[pf])
        break;
      chainFamilies.push(pf);
      const fam = tree.families[pf];
      const parent = fam.father_handle || fam.mother_handle;
      if (!parent)
        break;
      cur = parent;
    }
    if (chainPeople.length <= 1) {
      throw new Error("\u8282\u70B9\u5DF2\u662F\u539F\u6811\u59CB\u7956\uFF08\u65E0\u7956\u5148\u53EF\u5E76\u5165\uFF09");
    }
    const ascChain = [...chainPeople].reverse();
    chainGens = `${attachGen + 1}-${attachGen + ascChain.length}`;
    let parentHandle = attachHandle;
    let gen = attachGen;
    for (const h of ascChain) {
      gen++;
      const p = tree.people[h];
      const mh = genHandle();
      master.people[mh] = {
        handle: mh,
        gramps_id: `I${gen}`,
        name: p.name,
        surname: p.surname,
        given: p.given,
        gender: p.gender,
        birth_date: p.birth_date,
        death_date: p.death_date,
        birth_place: p.birth_place,
        death_place: p.death_place,
        parent_family: "",
        spouse_families: [],
        external_tree: "",
        external_person_handle: "",
        external_link_type: ""
      };
      await saveDetail({
        tree_id: masterTreeId,
        handle: mh,
        gramps_id: `I${gen}`,
        name: p.name,
        events: [],
        media: [],
        citations: [],
        notes: [],
        attributes: [
          { key: "external_chain_gen", value: String(gen), type: "external_chain_gen" },
          { key: "external_chain_from", value: treeId, type: "external_chain_from" }
        ],
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      const fh = genHandle();
      master.families[fh] = {
        handle: fh,
        gramps_id: `F${gen}`,
        father_handle: parentHandle,
        mother_handle: "",
        child_handles: [mh]
      };
      if (master.people[parentHandle])
        master.people[parentHandle].spouse_families.push(fh);
      parentHandle = mh;
      if (h === nodeHandle)
        masterNode = { handle: mh, name: p.name };
    }
    for (const h of chainPeople) {
      delete tree.people[h];
      await deleteDetail(treeId, h);
    }
    for (const fh of chainFamilies)
      delete tree.families[fh];
    movedPeople = chainPeople.length;
    movedFamilies = chainFamilies.length;
    await saveTree(master);
    return { ok: true };
  });
  return {
    ok: true,
    treeId,
    nodeHandle,
    nodeName: masterNode?.name || "",
    movedPeople,
    movedFamilies,
    attach: { handle: attachHandle, name: attach.name, gen: attachGen },
    chainGens,
    masterNode: masterNode || { handle: attachHandle, name: attach.name },
    message: `\u5DF2\u5C06 ${movedPeople} \u4EBA\u5E76\u5165\u4E2D\u534E\u4E16\u672C\uFF08\u7B2C ${attachGen + 1} \u4E16\u8D77\uFF09`
  };
}
function spouseSlots(selfGender, spouseGender) {
  const norm = (g) => g === "F" ? "F" : g === "M" ? "M" : "U";
  const self = norm(selfGender);
  const spouse = norm(spouseGender);
  let selfSlot;
  if (self === "F")
    selfSlot = "mother";
  else if (self === "M")
    selfSlot = "father";
  else if (spouse === "F")
    selfSlot = "father";
  else if (spouse === "M")
    selfSlot = "mother";
  else
    selfSlot = "father";
  return { selfSlot, spouseSlot: selfSlot === "father" ? "mother" : "father" };
}
async function addSpouseNode({
  treeId,
  personHandle,
  mode = "new",
  name = "",
  surname = "",
  gender = "U",
  childHandle = "",
  extraAttributes = []
}) {
  const tree0 = await getTree(treeId);
  if (!tree0)
    throw new Error(`\u6811\u4E0D\u5B58\u5728: ${treeId}`);
  const person = tree0.people[personHandle];
  if (!person)
    throw new Error("\u8282\u70B9\u4E0D\u5B58\u5728\u4E8E\u8BE5\u6811");
  const { selfSlot, spouseSlot } = spouseSlots(person.gender, gender);
  let targetHandle = "";
  if (mode === "attach") {
    targetHandle = childHandle;
    if (!targetHandle)
      throw new Error("\u8BF7\u9009\u62E9\u8981\u8BBE\u4E3A\u914D\u5076\u7684\u5DF2\u6709\u8282\u70B9");
    if (targetHandle === personHandle)
      throw new Error("\u4E0D\u80FD\u628A\u81EA\u5DF1\u8BBE\u4E3A\u914D\u5076");
    const target = tree0.people[targetHandle];
    if (!target)
      throw new Error("\u8BE5\u8282\u70B9\u4E0D\u5B58\u5728\u4E8E\u8BE5\u6811");
    const dup = (person.spouse_families || []).some((fh) => {
      const fam = tree0.families[fh];
      return fam && (fam.father_handle === targetHandle || fam.mother_handle === targetHandle);
    });
    if (dup)
      throw new Error(`\u300C${target.name}\u300D\u5DF2\u662F\u672C\u4EBA\u7684\u914D\u5076`);
  } else if (!String(name).trim()) {
    throw new Error("\u8BF7\u586B\u5199\u914D\u5076\u59D3\u540D");
  }
  const created = { name: "" };
  const result = await updateTree(treeId, async (tree) => {
    let spouseHandle = targetHandle;
    if (mode === "new") {
      spouseHandle = genHandle();
      const sn = String(surname || "").trim();
      const given = String(name || "").trim();
      tree.people[spouseHandle] = {
        handle: spouseHandle,
        gramps_id: nextGrampsId(tree, "I"),
        name: `${sn}${given}` || "\u672A\u77E5",
        surname: sn,
        given,
        gender: ["M", "F", "U"].includes(gender) ? gender : "U",
        birth_date: "",
        death_date: "",
        birth_place: "",
        death_place: "",
        parent_family: "",
        spouse_families: [],
        external_tree: "",
        external_person_handle: "",
        external_link_type: ""
      };
      created.name = tree.people[spouseHandle].name;
      const attrs = [];
      for (const a of extraAttributes || []) {
        const key = String(a?.key || "").trim();
        const value = String(a?.value ?? "").trim();
        if (key && value)
          attrs.push({ key, value, type: key });
      }
      await saveDetail({
        tree_id: treeId,
        handle: spouseHandle,
        gramps_id: tree.people[spouseHandle].gramps_id,
        name: tree.people[spouseHandle].name,
        events: [],
        media: [],
        citations: [],
        notes: [],
        attributes: attrs,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const reusable = (tree.people[personHandle].spouse_families || []).find((fh) => {
      const fam = tree.families[fh];
      return fam && !fam[`${spouseSlot}_handle`];
    });
    let famHandle = reusable;
    const reusedExistingFamily = !!reusable;
    if (famHandle) {
      const fam = tree.families[famHandle];
      fam[`${spouseSlot}_handle`] = spouseHandle;
      linkFamily(tree, famHandle, fam.father_handle, fam.mother_handle, fam.child_handles || []);
    } else {
      famHandle = genHandle();
      tree.families[famHandle] = {
        handle: famHandle,
        gramps_id: nextGrampsId(tree, "F"),
        father_handle: selfSlot === "father" ? personHandle : spouseHandle,
        mother_handle: selfSlot === "mother" ? personHandle : spouseHandle,
        child_handles: []
      };
      linkFamily(tree, famHandle, tree.families[famHandle].father_handle, tree.families[famHandle].mother_handle, []);
    }
    return { spouseHandle, famHandle, reusedExistingFamily };
  });
  const spouseName = created.name || tree0.people[result.spouseHandle]?.name || "";
  return {
    ok: true,
    tree_id: treeId,
    person_handle: personHandle,
    spouse_handle: result.spouseHandle,
    spouse_name: spouseName,
    family_handle: result.famHandle,
    mode,
    filled_existing_family: result.reusedExistingFamily,
    message: `\u5DF2\u4E3A\u300C${person.name}\u300D\u6DFB\u52A0\u914D\u5076\u300C${spouseName}\u300D`
  };
}
async function reparentNode({ treeId, personHandle, newParentRef }) {
  const tree0 = await getTree(treeId);
  const person = tree0.people[personHandle];
  if (!person)
    throw new Error("\u8282\u70B9\u4E0D\u5B58\u5728");
  const refText = String(newParentRef || "").trim();
  const parentHandle = resolvePersonRef(tree0, refText);
  if (!parentHandle)
    throw new Error(`\u627E\u4E0D\u5230\u7F16\u53F7\u4E3A\u300C${refText}\u300D\u7684\u8282\u70B9`);
  if (parentHandle === personHandle)
    throw new Error("\u4E0D\u80FD\u628A\u8282\u70B9\u8BBE\u4E3A\u81EA\u5DF1\u7684\u7236\u8282\u70B9");
  const parent = tree0.people[parentHandle];
  if (descendantsOf(tree0, personHandle).has(parentHandle)) {
    throw new Error(`\u300C${parent.name}\u300D\u662F\u300C${person.name}\u300D\u7684\u540E\u4EE3\uFF0C\u4E0D\u80FD\u4F5C\u4E3A\u5176\u7236\u8282\u70B9\uFF08\u4F1A\u5F62\u6210\u73AF\uFF09`);
  }
  const oldFam = person.parent_family ? tree0.families[person.parent_family] : null;
  if (oldFam && (oldFam.father_handle === parentHandle || oldFam.mother_handle === parentHandle)) {
    throw new Error(`\u300C${person.name}\u300D\u7684\u7236\u6BCD\u5DF2\u7ECF\u662F\u300C${parent.name}\u300D\uFF0C\u65E0\u9700\u6539\u52A8`);
  }
  const [personInfo, parentInfo] = await Promise.all([
    getChainInfo(treeId, personHandle),
    getChainInfo(treeId, parentHandle)
  ]);
  let delta = 0;
  if (personInfo.onChain && parentInfo.onChain && !parentInfo.aggregate) {
    delta = parentInfo.gen + 1 - personInfo.gen;
  }
  const affected = /* @__PURE__ */ new Set([personHandle, ...descendantsOf(tree0, personHandle)]);
  const moved = await updateTree(treeId, async (tree) => {
    const p = tree.people[personHandle];
    const par = tree.people[parentHandle];
    let removedFamily = false;
    if (p.parent_family && tree.families[p.parent_family]) {
      const of = tree.families[p.parent_family];
      of.child_handles = (of.child_handles || []).filter((h) => h !== personHandle);
      if (!of.father_handle && !of.mother_handle && of.child_handles.length === 0) {
        delete tree.families[of.handle];
        removedFamily = true;
      }
    }
    p.parent_family = "";
    const slot = parentSlot(par.gender);
    const slotKey = slot === "father" ? "father_handle" : "mother_handle";
    const otherKey = slot === "father" ? "mother_handle" : "father_handle";
    if (!Array.isArray(par.spouse_families))
      par.spouse_families = [];
    const fams = par.spouse_families.map((h) => tree.families[h]).filter(Boolean);
    let target = fams.find((f) => f[slotKey] === parentHandle && !f[otherKey]) || null;
    if (!target)
      target = fams.find((f) => f[slotKey] === parentHandle) || null;
    let createdFamily = false;
    if (!target) {
      const fh = genHandle();
      tree.families[fh] = {
        handle: fh,
        gramps_id: nextGrampsId(tree, "F"),
        father_handle: slot === "father" ? parentHandle : "",
        mother_handle: slot === "mother" ? parentHandle : "",
        child_handles: []
      };
      par.spouse_families.push(fh);
      target = tree.families[fh];
      createdFamily = true;
    }
    if (!target.child_handles.includes(personHandle))
      target.child_handles.push(personHandle);
    p.parent_family = target.handle;
    return {
      family_handle: target.handle,
      created_family: createdFamily,
      removed_family: removedFamily
    };
  });
  let chainShift = null;
  if (delta) {
    const all = await getAllDetails(treeId);
    const gens = /* @__PURE__ */ new Map();
    for (const d of all) {
      const g = attrMap(d).external_chain_gen;
      if (g !== void 0 && g !== "")
        gens.set(d.handle, parseInt(g, 10));
    }
    let count = 0;
    for (const h of affected) {
      if (!gens.has(h))
        continue;
      const detail = await getDetail(treeId, h);
      if (!detail)
        continue;
      const next = Math.max(0, gens.get(h) + delta);
      const attrs = (detail.attributes || []).filter((a) => a.key !== "external_chain_gen");
      attrs.push({ key: "external_chain_gen", value: String(next), type: "external_chain_gen" });
      detail.attributes = attrs;
      detail.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await saveDetail(detail);
      count += 1;
    }
    chainShift = { delta, affected: count };
  }
  return {
    ok: true,
    person_handle: personHandle,
    person_name: person.name,
    parent_handle: parentHandle,
    parent_name: parent.name,
    parent_gramps_id: parent.gramps_id,
    family_handle: moved.family_handle,
    created_family: moved.created_family,
    removed_family: moved.removed_family,
    chain_shift: chainShift
  };
}
function resolvePersonRef(tree, ref) {
  const s = String(ref || "").trim();
  if (!s)
    return null;
  if (tree.people[s])
    return s;
  const want = s.toUpperCase().replace(/^I(?=\d)/, "");
  for (const p of Object.values(tree.people)) {
    const id = String(p.gramps_id || "").toUpperCase();
    if (id.replace(/^I(?=\d)/, "") === want)
      return p.handle;
  }
  return null;
}
function parentSlot(gender) {
  return gender === "F" ? "mother" : "father";
}
function descendantsOf(tree, handle) {
  const out = /* @__PURE__ */ new Set();
  const stack = [handle];
  while (stack.length) {
    const h = stack.pop();
    for (const fh of tree.people[h]?.spouse_families || []) {
      for (const c of tree.families[fh]?.child_handles || []) {
        if (c && c !== handle && !out.has(c)) {
          out.add(c);
          stack.push(c);
        }
      }
    }
  }
  return out;
}
async function removeBranchLink(treeId, personHandle) {
  return updateTree(treeId, async (tree) => {
    const person = tree.people[personHandle];
    if (!person)
      throw new Error("person not found");
    for (const k of EXTERNAL_KEYS)
      person[k] = "";
    return { ok: true };
  });
}

// cloudfunctions/compat-api/lib/tree-access.js
var GUEST_HIDE_TAIL = 18;
var LOGIN_HIDE_TAIL = 9;
var FLOOR_VISIBLE_DEPTH = 1;
function computePersonDepth(people, families) {
  const childOf = /* @__PURE__ */ new Map();
  const parentOf = /* @__PURE__ */ new Map();
  for (const f of Object.values(families)) {
    const parents = [f.father_handle, f.mother_handle].filter(Boolean);
    const kids = f.child_handles || [];
    for (const c of kids) {
      if (!childOf.has(c))
        childOf.set(c, /* @__PURE__ */ new Set());
      for (const p of parents)
        childOf.get(c).add(p);
    }
    for (const p of parents) {
      if (!parentOf.has(p))
        parentOf.set(p, /* @__PURE__ */ new Set());
      for (const c of kids)
        parentOf.get(p).add(c);
    }
  }
  const allPeople = new Set(Object.keys(people));
  for (const p of childOf.keys())
    allPeople.add(p);
  for (const p of parentOf.keys())
    allPeople.add(p);
  const depth = /* @__PURE__ */ new Map();
  const roots = [...allPeople].filter((p) => !childOf.has(p) || childOf.get(p).size === 0);
  let maxDepth = 1;
  for (const r of roots)
    depth.set(r, 1);
  const queue = [...roots];
  let guard = 0;
  while (queue.length && guard < 1e5) {
    guard++;
    const cur = queue.shift();
    const curDepth = depth.get(cur) || 1;
    for (const child of parentOf.get(cur) || []) {
      const nd = curDepth + 1;
      if (nd > (depth.get(child) || 0)) {
        depth.set(child, nd);
        maxDepth = Math.max(maxDepth, nd);
        queue.push(child);
      }
    }
  }
  for (const p of allPeople)
    if (!depth.has(p))
      depth.set(p, 1);
  return { depth, maxDepth };
}
function computeAccess(opts) {
  const { treeId, isMaster, role, anchorTreeId } = opts;
  const member = !!(anchorTreeId && anchorTreeId === treeId);
  if (isMaster || role === "chief_editor" || member) {
    return {
      mode: "full",
      visibleMaxDepth: Infinity,
      hideTail: 0,
      isMaster: !!isMaster,
      member,
      loginRequired: false,
      clamped: false,
      hiddenPeople: /* @__PURE__ */ new Set(),
      isHiddenPerson: () => false
    };
  }
  const hideTail = role ? LOGIN_HIDE_TAIL : GUEST_HIDE_TAIL;
  const { depth, maxDepth } = opts.maxDepth ? { maxDepth: opts.maxDepth, depth: null } : computePersonDepth(opts.people || {}, opts.families || {});
  const visibleRaw = maxDepth - hideTail;
  const clamped = visibleRaw < FLOOR_VISIBLE_DEPTH;
  const visibleMaxDepth = clamped ? FLOOR_VISIBLE_DEPTH : visibleRaw;
  const hiddenPeople = /* @__PURE__ */ new Set();
  if (depth) {
    for (const [h, d] of depth)
      if (d > visibleMaxDepth)
        hiddenPeople.add(h);
  } else {
  }
  return {
    mode: clamped ? "floor" : "partial",
    visibleMaxDepth,
    hideTail,
    isMaster: !!isMaster,
    member,
    loginRequired: !role,
    clamped,
    hiddenPeople,
    isHiddenPerson: (h) => hiddenPeople.has(h)
  };
}
function isHiddenFamily(access, fam) {
  return fam.father_handle && access.hiddenPeople.has(fam.father_handle) || fam.mother_handle && access.hiddenPeople.has(fam.mother_handle) || (fam.child_handles || []).some((c) => access.hiddenPeople.has(c));
}
function accessToPayload(access, totalGenerations) {
  return {
    mode: access.mode,
    visible_max_depth: access.mode === "full" ? totalGenerations : access.visibleMaxDepth,
    hide_tail: access.hideTail,
    is_master: access.isMaster,
    member: access.member,
    login_required: access.loginRequired,
    clamped: access.clamped
  };
}

// cloudfunctions/compat-api/index.js
var MASTER_TREE_ID = process.env.MASTER_TREE_ID || "zhonghua";
var MAX_DEPTH = 72;
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return {};
  }
}
var RANKS = {
  family: { key: "family_rank", label: "\u5BB6\u4E58\u7EA7", en: "Family-Rank", desc: "\u77ED\u7A0B\u4EB2\u5C5E\u8C31\u7CFB\uFF0C\u5408\u8BA1\u603B\u4E16\u4EE3 \u22649 \u4E16" },
  clan: { key: "clan_rank", label: "\u65CF\u4E58\u7EA7", en: "Clan-Rank", desc: "\u4E2D\u7A0B\u4EB2\u5C5E\u8C31\u7CFB\uFF0C\u5408\u8BA1\u603B\u4E16\u4EE3 10-18 \u4E16" },
  lineage: { key: "lineage_rank", label: "\u5B97\u4E58\u7EA7", en: "Lineage-Rank", desc: "\u957F\u7A0B\u4EB2\u5C5E\u8C31\u7CFB\uFF0C\u5408\u8BA1\u603B\u4E16\u4EE3 19-72 \u4E16" },
  stemma: { key: "stemma_rank", label: "\u4E16\u4E58\u7EA7", en: "Stemma-Rank", desc: "\u8FDC\u53E4\u957F\u7A0B\u8C31\u7CFB\u8BB0\u5F55\uFF0C\u5408\u8BA1\u603B\u4E16\u4EE3 >72 \u4E16" }
};
function computeTreeDepth(tree, explicitGens) {
  if (explicitGens && explicitGens.size > 0) {
    return { totalGenerations: Math.max(...explicitGens.values()), personCount: explicitGens.size, explicit: true };
  }
  const childOf = /* @__PURE__ */ new Map();
  const parentOf = /* @__PURE__ */ new Map();
  for (const f of Object.values(tree.families)) {
    const parents = [f.father_handle, f.mother_handle].filter(Boolean);
    for (const c of f.child_handles || []) {
      if (!childOf.has(c))
        childOf.set(c, /* @__PURE__ */ new Set());
      for (const p of parents)
        childOf.get(c).add(p);
    }
    for (const p of parents) {
      if (!parentOf.has(p))
        parentOf.set(p, /* @__PURE__ */ new Set());
      for (const c of f.child_handles || [])
        parentOf.get(p).add(c);
    }
  }
  const allPeople = /* @__PURE__ */ new Set([...Object.keys(tree.people), ...childOf.keys(), ...parentOf.keys()]);
  const roots = [...allPeople].filter((p) => !childOf.has(p) || childOf.get(p).size === 0);
  if (roots.length === 0)
    return { totalGenerations: 1, personCount: allPeople.size, explicit: false };
  const depth = /* @__PURE__ */ new Map();
  const queue = [...roots];
  for (const r of roots)
    depth.set(r, 1);
  let maxDepth = 1;
  let guard = 0;
  while (queue.length && guard < 1e5) {
    guard++;
    const cur = queue.shift();
    const curDepth = depth.get(cur) || 1;
    for (const child of parentOf.get(cur) || []) {
      const nd = curDepth + 1;
      if (nd > (depth.get(child) || 0)) {
        depth.set(child, nd);
        maxDepth = Math.max(maxDepth, nd);
        queue.push(child);
      }
    }
  }
  return { totalGenerations: maxDepth, personCount: allPeople.size, explicit: false };
}
function rankFromDepth(total) {
  if (total <= 9)
    return RANKS.family;
  if (total <= 18)
    return RANKS.clan;
  if (total <= 72)
    return RANKS.lineage;
  return RANKS.stemma;
}
var GENDER_NUM = { M: 1, F: 2, U: 0 };
function attrEntry(key, value) {
  return { type: key, value };
}
function profilePerson(tree, handle) {
  const p = tree.people[handle];
  if (!p)
    return null;
  const out = { handle: p.handle, gramps_id: p.gramps_id, name_given: p.given, name_surname: p.surname, sex: p.gender };
  out.is_living = p.is_living !== void 0 ? p.is_living : !p.death_date;
  if (p.birth_date)
    out.birth = { date: p.birth_date };
  if (p.death_date)
    out.death = { date: p.death_date };
  return out;
}
function profileFamily(tree, fam) {
  if (!fam)
    return null;
  const out = { handle: fam.handle, gramps_id: fam.gramps_id || "" };
  if (fam.father_handle)
    out.father = profilePerson(tree, fam.father_handle);
  if (fam.mother_handle)
    out.mother = profilePerson(tree, fam.mother_handle);
  out.children = (fam.child_handles || []).map((c) => profilePerson(tree, c)).filter(Boolean);
  return out;
}
function toRawPerson(tree, person, detail) {
  const attributes = [];
  for (const a of detail?.attributes || [])
    attributes.push(attrEntry(a.key, a.value));
  for (const k of ["external_tree", "external_person_handle", "external_link_type"]) {
    if (person[k])
      attributes.push(attrEntry(k, person[k]));
  }
  const raw = {
    handle: person.handle,
    gramps_id: person.gramps_id,
    gender: GENDER_NUM[person.gender] ?? 0,
    // 显式健在状态：编辑/脱敏用（旧数据缺省 = 无卒年即推断健在）
    is_living: person.is_living !== void 0 ? person.is_living : !person.death_date,
    primary_name: { first_name: person.given || "", surname_list: [{ surname: person.surname || "", primary: true }] },
    attribute_list: attributes,
    event_ref_list: (detail?.events || []).map((e) => ({ ref: e.handle })),
    family_list: person.spouse_families || [],
    parent_family_list: person.parent_family ? [person.parent_family] : [],
    profile: {}
  };
  if (person.birth_date)
    raw.profile.birth = { date: person.birth_date, place: person.birth_place || "" };
  if (person.death_date)
    raw.profile.death = { date: person.death_date, place: person.death_place || "" };
  const spouseFams = (person.spouse_families || []).map((fh) => profileFamily(tree, tree.families[fh])).filter(Boolean);
  if (spouseFams.length)
    raw.profile.families = spouseFams;
  if (person.parent_family && tree.families[person.parent_family]) {
    raw.profile.primary_parent_family = profileFamily(tree, tree.families[person.parent_family]);
  }
  return raw;
}
async function requireWriteUser(headers, treeId, pathname, targetHandle, isAddNode) {
  const u = await authUser(headers);
  if (!u)
    throw httpError(401, "\u8BF7\u5148\u767B\u5F55\u540E\u518D\u8FDB\u884C\u7F16\u8F91\u64CD\u4F5C");
  const user = await colGet("jiazu_users", u.phone);
  if (!user)
    throw httpError(401, "\u7528\u6237\u4E0D\u5B58\u5728");
  const role = user.role;
  if (role === "guest")
    throw httpError(403, "\u6E38\u5BA2\u65E0\u7F16\u8F91\u6743\u9650\uFF0C\u8BF7\u6CE8\u518C\u540E\u7F16\u8F91");
  const isMaster = treeId === MASTER_TREE_ID;
  if (isMaster && role !== "chief_editor")
    throw httpError(403, "\u4E2D\u534E\u4E16\u672C\u603B\u8C31\u4EC5\u603B\u7F16\u8F91\uFF08chief_editor\uFF09\u53EF\u7F16\u8F91");
  if (!isMaster && (role === "user" || role === "branch_curator") && targetHandle) {
    const tree = await getTree(treeId);
    const families = Object.values(tree.families).map((f) => ({
      handle: f.handle,
      father_handle: f.father_handle,
      mother_handle: f.mother_handle,
      child_handles: f.child_handles
    }));
    const allowed = await canEditPerson(families, user.phone, role, targetHandle);
    if (!allowed) {
      throw httpError(
        403,
        role === "branch_curator" ? "\u60A8\u7684\u6743\u9650\u8303\u56F4\u4EC5\u9650\u672C\u4EBA\u4E0A\u4E0B\u4E09\u4EE3\u8282\u70B9" : "\u60A8\u7684\u6743\u9650\u8303\u56F4\u4EC5\u9650\u672C\u4EBA\u53CA\u5411\u4E0B\u8282\u70B9"
      );
    }
  }
  if (!isMaster && role !== "chief_editor" && isAddNode) {
    const tree = await getTree(treeId);
    const { totalGenerations } = computeTreeDepth(tree, null);
    if (totalGenerations >= MAX_DEPTH) {
      throw httpError(403, `\u8BE5\u5BB6\u65CF\u6811\u5DF2\u5230 ${MAX_DEPTH} \u4E16\u6DF1\u5EA6\u4E0A\u9650\uFF0C\u65B0\u589E\u8282\u70B9\u8BF7\u8054\u7CFB\u603B\u7F16\u8F91\uFF08\u664B\u5B97\u6216\u6269\u5BB9\uFF09`);
    }
  }
  return u;
}
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Tree-Id"
};
function send(statusCode, obj) {
  return { statusCode, headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(obj) };
}
async function resolveTreeAccess(headers, treeId, tree) {
  const u = await authUser(headers);
  const anchor = u ? await getAnchor(u.phone) : null;
  return computeAccess({
    treeId,
    isMaster: treeId === MASTER_TREE_ID,
    role: u?.role || null,
    anchorTreeId: anchor?.tree_id || null,
    people: tree?.people || {},
    families: tree?.families || {}
  });
}
async function handleRequest(event) {
  let pathname = (event.path || "").split("?")[0].replace(/\/+$/, "");
  if (pathname.startsWith("/api"))
    pathname = pathname.slice(4) || "/";
  const method = (event.httpMethod || "GET").toUpperCase();
  if (method === "OPTIONS")
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  const query = event.queryStringParameters || {};
  const headers = event.headers || {};
  const header = (name) => {
    const lower = name.toLowerCase();
    const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === lower);
    return hit ? hit[1] : void 0;
  };
  const treeId = header("x-tree-id") || query.tree_id || "";
  try {
    if (pathname === "/auth/send-code" && method === "POST") {
      const body = parseBody(event);
      const phone = String(body.phone || "").trim();
      if (!/^1\d{10}$/.test(phone))
        return send(400, { error: "\u624B\u673A\u53F7\u683C\u5F0F\u4E0D\u6B63\u786E" });
      const existing = await colGet("jiazu_sms_codes", phone);
      if (existing && existing.expires_at > Date.now()) {
        const { requestCode: rc } = await Promise.resolve().then(() => (init_auth(), auth_exports));
        const r2 = await rc(phone);
        return send(200, { ok: true, message: "\u9A8C\u8BC1\u7801\u5DF2\u53D1\u9001", dev_code: r2.dev_code });
      }
      const r = await requestCode(phone);
      return send(200, { ok: true, message: "\u9A8C\u8BC1\u7801\u5DF2\u53D1\u9001", dev_code: r.dev_code });
    }
    if (pathname === "/auth/login" && method === "POST") {
      const body = parseBody(event);
      const phone = String(body.phone || "").trim();
      const code = String(body.code || "").trim();
      const user = await colGet("jiazu_users", phone);
      if (!user)
        return send(404, { error: "\u8BE5\u624B\u673A\u53F7\u672A\u6CE8\u518C\uFF0C\u8BF7\u5148\u6CE8\u518C" });
      const v = await verifyCode(phone, code);
      if (!v.ok)
        return send(401, { error: v.message });
      const token = signJwt({ sub: phone, phone, role: user.role }, 7 * 24 * 3600);
      return send(200, { token, phone, nickname: user.nickname, role: user.role });
    }
    if (pathname === "/auth/register" && method === "POST") {
      const body = parseBody(event);
      const phone = String(body.phone || "").trim();
      const code = String(body.code || "").trim();
      const nickname = String(body.nickname || "").trim().slice(0, 30);
      if (!/^1\d{10}$/.test(phone))
        return send(400, { error: "\u624B\u673A\u53F7\u683C\u5F0F\u4E0D\u6B63\u786E" });
      if (await colGet("jiazu_users", phone))
        return send(409, { error: "\u8BE5\u624B\u673A\u53F7\u5DF2\u6CE8\u518C\uFF0C\u8BF7\u76F4\u63A5\u767B\u5F55" });
      const v = await verifyCode(phone, code);
      if (!v.ok)
        return send(401, { error: v.message });
      const user = await findOrCreateUser(phone, nickname || void 0);
      const token = signJwt({ sub: phone, phone, role: user.role }, 7 * 24 * 3600);
      return send(201, { token, phone, nickname: user.nickname, role: user.role });
    }
    if (pathname === "/auth/me" && method === "GET") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const user = await colGet("jiazu_users", u.phone);
      if (!user)
        return send(404, { error: "\u7528\u6237\u4E0D\u5B58\u5728" });
      return send(200, { phone: user.phone, nickname: user.nickname, role: user.role });
    }
    if (pathname === "/tree-meta" && method === "GET") {
      const meta = await getMeta();
      if (!meta)
        return send(500, { error: "tree-meta \u7F3A\u5931" });
      return send(200, meta);
    }
    if (pathname === "/tree-meta" && method === "PUT") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const user = await colGet("jiazu_users", u.phone);
      if (!user || user.role !== "chief_editor")
        return send(403, { error: "\u9700\u8981\u603B\u7F16\u8F91\u6743\u9650" });
      const body = parseBody(event);
      const { tree_id, display_title, genealogy_name, archive_url, hall_name, origin, description } = body;
      if (!tree_id)
        return send(400, { error: "\u7F3A\u5C11 tree_id" });
      const meta = await getMeta();
      const entry = Object.values(meta.trees).find((t) => t.tree_id === tree_id);
      if (!entry)
        return send(404, { error: `\u672A\u627E\u5230 tree: ${tree_id}` });
      if (display_title !== void 0)
        entry.display_title = display_title;
      if (genealogy_name !== void 0)
        entry.genealogy_name = genealogy_name;
      if (archive_url !== void 0)
        entry.archive_url = archive_url;
      if (hall_name !== void 0)
        entry.hall_name = hall_name;
      if (origin !== void 0)
        entry.origin = origin;
      if (description !== void 0)
        entry.description = description;
      await saveMeta(meta);
      return send(200, { ok: true, entry });
    }
    if (pathname === "/tree/rank" && method === "GET") {
      if (!treeId)
        return send(400, { error: "\u7F3A\u5C11 X-Tree-Id" });
      const tree2 = await getTree(treeId);
      if (!tree2)
        return send(404, { error: `\u6811\u4E0D\u5B58\u5728: ${treeId}` });
      const gens = /* @__PURE__ */ new Map();
      const details = await getAllDetails(treeId);
      for (const d of details) {
        const g = d.attributes?.find((a) => a.key === "external_chain_gen");
        if (g)
          gens.set(d.handle, parseInt(g.value, 10) || 0);
      }
      const { totalGenerations, personCount, explicit } = computeTreeDepth(tree2, gens);
      const rank = rankFromDepth(totalGenerations);
      const access = await resolveTreeAccess(headers, treeId, tree2);
      return send(200, {
        tree_id: treeId,
        total_generations: totalGenerations,
        rank_key: rank.key,
        rank_label: rank.label,
        rank_en: rank.en,
        rank_desc: rank.desc,
        over_limit: totalGenerations > MAX_DEPTH,
        max_depth: MAX_DEPTH,
        root_count: Object.values(tree2.people).filter((p) => !p.parent_family).length,
        person_count: personCount,
        explicit,
        access: accessToPayload(access, totalGenerations)
      });
    }
    if (pathname === "/wallet/balance" && method === "GET") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      return send(200, await getWalletOverview(u.phone));
    }
    if (pathname === "/wallet/recharge" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const amount = Number(parseBody(event).amount);
      if (!amount || amount <= 0)
        return send(400, { error: "\u8BF7\u8F93\u5165\u6B63\u786E\u7684\u5145\u503C\u91D1\u989D" });
      try {
        const balance = await recharge(u.phone, Math.round(amount * 100));
        return send(200, { ok: true, balance_yuan: (balance / 100).toFixed(2), payment: "mock" });
      } catch (e) {
        return send(400, { error: e.message });
      }
    }
    if (pathname === "/wallet/transfer" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const body = parseBody(event);
      const targetTree = String(body.tree_id || "").trim();
      const amount = Number(body.amount);
      if (!targetTree)
        return send(400, { error: "\u7F3A\u5C11 tree_id" });
      if (!amount || amount <= 0)
        return send(400, { error: "\u8BF7\u8F93\u5165\u6B63\u786E\u7684\u91D1\u989D" });
      const meta = await getMeta();
      if (!Object.values(meta.trees).some((t) => t.tree_id === targetTree)) {
        return send(404, { error: `\u5BB6\u65CF\u6811\u4E0D\u5B58\u5728: ${targetTree}` });
      }
      try {
        const r = await transferToTree(u.phone, targetTree, Math.round(amount * 100));
        return send(200, { ok: true, user_balance_yuan: (r.user_balance / 100).toFixed(2), tree_balance_yuan: (r.tree_balance / 100).toFixed(2) });
      } catch (e) {
        return send(400, { error: e.message });
      }
    }
    if (pathname === "/wallet/tree-balance" && method === "GET") {
      const targetTree = query.tree_id || "";
      if (!targetTree)
        return send(400, { error: "\u7F3A\u5C11 tree_id" });
      return send(200, { tree_id: targetTree, balance_yuan: (await getTreeBalance(targetTree) / 100).toFixed(2) });
    }
    if (pathname === "/admin/wallet-fee" && method === "PUT") {
      const u = await authUser(headers);
      if (!u || u.role !== "chief_editor")
        return send(403, { error: "\u9700\u8981\u603B\u7F16\u8F91\u6743\u9650" });
      const fee = Number(parseBody(event).fee);
      if (!fee || fee <= 0)
        return send(400, { error: "\u8BF7\u8F93\u5165\u6B63\u786E\u7684\u8D39\u7528" });
      const cents = await setTreeCreateFeeCents(Math.round(fee * 100));
      return send(200, { ok: true, tree_create_fee_yuan: (cents / 100).toFixed(2) });
    }
    if (pathname === "/admin/users" && method === "GET") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward)
        return send(403, { error: "\u9700\u8981\u65CF\u8C31\u4E3B\u7406\u4EBA\u6216\u4EE5\u4E0A\u6743\u9650" });
      const list = (await colAll("jiazu_users")).map((usr) => ({ phone: usr.phone, nickname: usr.nickname, role: usr.role, created_at: usr.created_at }));
      return send(200, list);
    }
    if (pathname === "/admin/set-role" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const body = parseBody(event);
      const targetPhone = String(body.phone || "").trim();
      const newRole = String(body.role || "").trim();
      if (!targetPhone || !ROLE_LEVEL[newRole]) {
        return send(400, { error: "\u53C2\u6570\u9519\u8BEF\uFF1Aphone + role \u5FC5\u586B\uFF0Crole \u2208 user/branch_curator/tree_steward/chief_editor" });
      }
      const target = await colGet("jiazu_users", targetPhone);
      if (!target)
        return send(404, { error: `\u7528\u6237\u4E0D\u5B58\u5728: ${targetPhone}` });
      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      const targetLevel = ROLE_LEVEL[target.role] ?? 0;
      if (targetPhone === u.phone)
        return send(400, { error: "\u4E0D\u80FD\u4FEE\u6539\u81EA\u5DF1\u7684\u89D2\u8272" });
      if (ROLE_LEVEL[newRole] >= myLevel)
        return send(403, { error: `\u65E0\u6743\u6388\u4E88 ${newRole}\uFF08\u9700\u8981\u9AD8\u4E8E\u8BE5\u7EA7\u522B\u7684\u6743\u9650\uFF09` });
      if (targetLevel >= myLevel)
        return send(403, { error: "\u65E0\u6743\u4FEE\u6539\u7EA7\u522B\u4E0D\u4F4E\u4E8E\u81EA\u5DF1\u7684\u7528\u6237" });
      if (u.role === "tree_steward" && !["guest", "user"].includes(target.role)) {
        return send(403, { error: "\u65CF\u8C31\u4E3B\u7406\u4EBA\u4EC5\u53EF\u7BA1\u7406\u666E\u901A\u7528\u6237\u4E0E\u652F\u7CFB\u8BB0\u5F55\u5B98" });
      }
      const oldRole = target.role;
      target.role = newRole;
      target.role_updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await colSet("jiazu_users", targetPhone, target);
      return send(200, { ok: true, phone: targetPhone, role: newRole, old_role: oldRole });
    }
    if (pathname === "/admin/set-anchor" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward)
        return send(403, { error: "\u9700\u8981\u65CF\u8C31\u4E3B\u7406\u4EBA\u6216\u4EE5\u4E0A\u6743\u9650" });
      const body = parseBody(event);
      const targetPhone = String(body.phone || "").trim();
      const targetTree = String(body.tree_id || "").trim();
      const personHandle = String(body.person_handle || "").trim();
      if (!targetPhone || !targetTree || !personHandle)
        return send(400, { error: "\u53C2\u6570\u9519\u8BEF\uFF1Aphone + tree_id + person_handle \u5FC5\u586B" });
      if (!await colGet("jiazu_users", targetPhone))
        return send(404, { error: `\u7528\u6237\u4E0D\u5B58\u5728: ${targetPhone}` });
      await setAnchor(targetPhone, targetTree, personHandle);
      return send(200, { ok: true });
    }
    if (pathname === "/admin/get-anchor" && method === "GET") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const targetPhone = query.phone || u.phone;
      if (targetPhone !== u.phone && (ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) {
        return send(403, { error: "\u65E0\u6743\u67E5\u770B\u4ED6\u4EBA\u951A\u70B9" });
      }
      const anchor = await getAnchor(targetPhone);
      return send(200, { phone: targetPhone, anchor });
    }
    if (pathname === "/join-request" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const body = parseBody(event);
      const targetTree = String(body.tree_id || "").trim();
      const referenceHandle = String(body.reference_handle || "").trim();
      const selfName = String(body.self_name || "").trim().slice(0, 30);
      const note = String(body.note || "").trim().slice(0, 200);
      if (!targetTree || !referenceHandle)
        return send(400, { error: "\u53C2\u6570\u9519\u8BEF\uFF1Atree_id + reference_handle \u5FC5\u586B" });
      if (!selfName && !note)
        return send(400, { error: "\u8BF7\u586B\u5199\u60A8\u7684\u59D3\u540D\u6216\u8865\u5145\u8BF4\u660E\uFF08\u8BA4\u9886\u7EBF\u7D22\uFF09" });
      if (targetTree === MASTER_TREE_ID)
        return send(403, { error: "\u4E2D\u534E\u4E16\u672C\u603B\u8C31\u4E0D\u53EF\u52A0\u5165\uFF0C\u4EC5\u53EF\u52A0\u5165\u666E\u901A\u5BB6\u65CF\u6811" });
      if (await getAnchor(u.phone))
        return send(400, { error: "\u60A8\u5DF2\u7ED1\u5B9A\u5BB6\u65CF\u6811\uFF0C\u5982\u9700\u6539\u7ED1\u8BF7\u5148\u7533\u8BF7\u89E3\u7ED1\u5E76\u7B49\u5F85\u5BA1\u6279" });
      const meta = await getMeta();
      if (!Object.values(meta.trees).some((t) => t.tree_id === targetTree)) {
        return send(404, { error: `\u5BB6\u65CF\u6811\u4E0D\u5B58\u5728: ${targetTree}` });
      }
      const all = await colAll("jiazu_join_requests");
      if (all.some((r) => r.phone === u.phone && r.tree_id === targetTree && r.status === "pending")) {
        return send(400, { error: "\u60A8\u5DF2\u63D0\u4EA4\u52A0\u5165\u7533\u8BF7\uFF0C\u8BF7\u7B49\u5F85\u65CF\u8C31\u4E3B\u7406\u4EBA\u5BA1\u6838" });
      }
      const tree2 = await getTree(targetTree);
      if (!tree2)
        return send(404, { error: `\u6811\u4E0D\u5B58\u5728: ${targetTree}` });
      const refPerson = tree2.people?.[referenceHandle];
      if (!refPerson)
        return send(400, { error: "\u8BE5\u5BB6\u65CF\u6811\u4E2D\u627E\u4E0D\u5230\u6B64\u8282\u70B9" });
      const access = await resolveTreeAccess(headers, targetTree, tree2);
      if (access.isHiddenPerson(referenceHandle)) {
        return send(400, { error: "\u6240\u9009\u652F\u7CFB\u8282\u70B9\u5F53\u524D\u4E0D\u53EF\u89C1\uFF0C\u8BF7\u5728\u516C\u5F00\u8C31\u7CFB\u4E2D\u9009\u62E9\u4E00\u4E2A\u4EE3\u8868\u60A8\u652F\u7CFB\u7684\u8282\u70B9" });
      }
      const refName = refPerson.name || `${refPerson.surname || ""}${refPerson.given || ""}` || referenceHandle;
      const id = `JR_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      await colSet("jiazu_join_requests", id, {
        phone: u.phone,
        tree_id: targetTree,
        reference_handle: referenceHandle,
        reference_name: refName,
        self_name: selfName,
        note,
        status: "pending",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return send(201, { ok: true, id });
    }
    if (pathname === "/admin/join-requests" && method === "GET") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward)
        return send(403, { error: "\u9700\u8981\u65CF\u8C31\u4E3B\u7406\u4EBA\u6216\u4EE5\u4E0A\u6743\u9650" });
      const myTree = u.role === "chief_editor" ? null : (await getAnchor(u.phone))?.tree_id || null;
      const list = await colAll("jiazu_join_requests");
      const out = list.filter((r) => myTree === null || r.tree_id === myTree).map((r) => ({ id: r._id, ...r }));
      const depthCache = /* @__PURE__ */ new Map();
      for (const item of out) {
        if (!item.reference_handle || !item.tree_id)
          continue;
        if (!depthCache.has(item.tree_id)) {
          try {
            const t = await getTree(item.tree_id);
            const { depth: depth2 } = computePersonDepth(t.people || {}, t.families || {});
            depthCache.set(item.tree_id, depth2);
          } catch {
            depthCache.set(item.tree_id, null);
          }
        }
        const depth = depthCache.get(item.tree_id);
        if (depth)
          item.reference_depth = depth.get(item.reference_handle) ?? null;
      }
      return send(200, out);
    }
    if (pathname === "/admin/approve-join" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward)
        return send(403, { error: "\u9700\u8981\u65CF\u8C31\u4E3B\u7406\u4EBA\u6216\u4EE5\u4E0A\u6743\u9650" });
      const body = parseBody(event);
      const id = String(body.id || "").trim();
      const personHandle = String(body.person_handle || "").trim();
      if (!id || !personHandle)
        return send(400, { error: "\u53C2\u6570\u9519\u8BEF\uFF1Aid + person_handle \u5FC5\u586B" });
      const jr = await colGet("jiazu_join_requests", id);
      if (!jr)
        return send(404, { error: "\u7533\u8BF7\u4E0D\u5B58\u5728" });
      if (jr.status !== "pending")
        return send(400, { error: "\u8BE5\u7533\u8BF7\u5DF2\u5904\u7406" });
      if (u.role !== "chief_editor") {
        const myTree = (await getAnchor(u.phone))?.tree_id;
        if (myTree && jr.tree_id !== myTree)
          return send(403, { error: "\u53EA\u80FD\u5BA1\u6279\u81EA\u5DF1\u5BB6\u65CF\u6811\u7684\u52A0\u5165\u7533\u8BF7" });
      }
      const tree2 = await getTree(jr.tree_id);
      if (!tree2?.people?.[personHandle])
        return send(400, { error: "\u8BE5\u5BB6\u65CF\u6811\u4E2D\u627E\u4E0D\u5230\u6B64\u8282\u70B9" });
      if (await getAnchor(jr.phone))
        return send(400, { error: "\u7533\u8BF7\u4EBA\u5DF2\u7ED1\u5B9A\u5BB6\u65CF\u6811\uFF0C\u65E0\u6CD5\u91CD\u590D\u7ED1\u5B9A" });
      await setAnchor(jr.phone, jr.tree_id, personHandle);
      jr.status = "approved";
      jr.handled_by = u.phone;
      jr.handled_at = (/* @__PURE__ */ new Date()).toISOString();
      await colSet("jiazu_join_requests", jr._id, jr);
      return send(200, { ok: true, status: "approved" });
    }
    if (pathname === "/admin/reject-join" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward)
        return send(403, { error: "\u9700\u8981\u65CF\u8C31\u4E3B\u7406\u4EBA\u6216\u4EE5\u4E0A\u6743\u9650" });
      const body = parseBody(event);
      const jr = await colGet("jiazu_join_requests", String(body.id || ""));
      if (!jr)
        return send(404, { error: "\u7533\u8BF7\u4E0D\u5B58\u5728" });
      if (jr.status !== "pending")
        return send(400, { error: "\u8BE5\u7533\u8BF7\u5DF2\u5904\u7406" });
      if (u.role !== "chief_editor") {
        const myTree = (await getAnchor(u.phone))?.tree_id;
        if (myTree && jr.tree_id !== myTree)
          return send(403, { error: "\u53EA\u80FD\u5BA1\u6279\u81EA\u5DF1\u5BB6\u65CF\u6811\u7684\u52A0\u5165\u7533\u8BF7" });
      }
      jr.status = "rejected";
      jr.reject_reason = String(body.reason || "").slice(0, 200);
      jr.handled_by = u.phone;
      jr.handled_at = (/* @__PURE__ */ new Date()).toISOString();
      await colSet("jiazu_join_requests", jr._id, jr);
      return send(200, { ok: true, status: "rejected" });
    }
    if (pathname === "/leave-request" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const anchor = await getAnchor(u.phone);
      if (!anchor)
        return send(400, { error: "\u60A8\u5C1A\u672A\u7ED1\u5B9A\u5BB6\u65CF\u6811" });
      const all = await colAll("jiazu_leave_requests");
      if (all.some((r) => r.phone === u.phone && r.status === "pending")) {
        return send(400, { error: "\u5DF2\u6709\u5F85\u5BA1\u6279\u7684\u89E3\u7ED1\u7533\u8BF7\uFF0C\u8BF7\u7B49\u5F85\u5904\u7406" });
      }
      const id = `LR_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      await colSet("jiazu_leave_requests", id, {
        phone: u.phone,
        tree_id: anchor.tree_id,
        person_handle: anchor.person_handle,
        reason: String(parseBody(event).reason || "").slice(0, 200),
        status: "pending",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return send(200, { ok: true, id });
    }
    if (pathname === "/admin/leave-requests" && method === "GET") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward)
        return send(403, { error: "\u9700\u8981\u65CF\u8C31\u4E3B\u7406\u4EBA\u6216\u4EE5\u4E0A\u6743\u9650" });
      const list = await colAll("jiazu_leave_requests");
      const myTree = u.role === "chief_editor" ? null : (await getAnchor(u.phone))?.tree_id;
      const out = list.filter((r) => myTree === null || r.tree_id === myTree).map((r) => ({ id: r._id, ...r }));
      return send(200, out);
    }
    if (pathname === "/admin/approve-leave" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward)
        return send(403, { error: "\u9700\u8981\u65CF\u8C31\u4E3B\u7406\u4EBA\u6216\u4EE5\u4E0A\u6743\u9650" });
      const body = parseBody(event);
      const req = await colGet("jiazu_leave_requests", String(body.id || ""));
      if (!req)
        return send(404, { error: "\u7533\u8BF7\u4E0D\u5B58\u5728" });
      if (req.status !== "pending")
        return send(400, { error: "\u8BE5\u7533\u8BF7\u5DF2\u5904\u7406" });
      req.status = body.approve ? "approved" : "rejected";
      req.handled_by = u.phone;
      req.handled_at = (/* @__PURE__ */ new Date()).toISOString();
      await colSet("jiazu_leave_requests", req._id, req);
      if (body.approve)
        await clearAnchor(req.phone);
      return send(200, { ok: true, status: req.status });
    }
    if (pathname === "/admin/add-spouse" && method === "POST") {
      const body = parseBody(event);
      if (!body.person_handle)
        return send(400, { error: "\u7F3A\u5C11 person_handle" });
      const spouseTreeId = body.tree_id || treeId || MASTER_TREE_ID;
      try {
        await requireWriteUser(headers, spouseTreeId, pathname, body.person_handle, false);
        const result = await addSpouseNode({
          treeId: spouseTreeId,
          personHandle: body.person_handle,
          mode: body.mode === "attach" ? "attach" : "new",
          name: body.name || "",
          surname: body.surname || "",
          gender: body.gender || "U",
          childHandle: body.child_handle || "",
          extraAttributes: body.attributes || []
        });
        return send(200, result);
      } catch (e) {
        return send(e.status || 400, { error: e.message });
      }
    }
    if (pathname === "/admin/reparent" && method === "POST") {
      const body = parseBody(event);
      if (!body.person_handle)
        return send(400, { error: "\u7F3A\u5C11 person_handle" });
      if (!String(body.new_parent_id || "").trim())
        return send(400, { error: "\u8BF7\u586B\u5199\u65B0\u7236\u8282\u70B9\u7F16\u53F7" });
      const reparentTreeId = body.tree_id || treeId || MASTER_TREE_ID;
      try {
        await requireWriteUser(headers, reparentTreeId, pathname, body.person_handle, false);
        const result = await reparentNode({
          treeId: reparentTreeId,
          personHandle: body.person_handle,
          newParentRef: body.new_parent_id
        });
        return send(200, result);
      } catch (e) {
        return send(e.status || 400, { error: e.message });
      }
    }
    if (pathname === "/admin/create-tree" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const user = await colGet("jiazu_users", u.phone);
      if (!user || user.role !== "chief_editor")
        return send(403, { error: "\u9700\u8981\u603B\u7F16\u8F91\u6743\u9650" });
      const body = parseBody(event);
      try {
        const result = await createTree({
          surnameChar: body.surname_char,
          founderName: body.founder_name,
          founderGender: body.founder_gender,
          displayTitle: body.display_title,
          genealogyName: body.genealogy_name,
          hallName: body.hall_name,
          origin: body.origin,
          description: body.description,
          initiatorPhone: u.phone,
          onBeforeWrite: () => deductTreeCreateFee(u.phone)
        });
        return send(200, result);
      } catch (e) {
        return send(400, { error: e.message });
      }
    }
    if (pathname === "/admin/split-tree" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const user = await colGet("jiazu_users", u.phone);
      if (!user || user.role !== "chief_editor")
        return send(403, { error: "\u9700\u8981\u603B\u7F16\u8F91\u6743\u9650" });
      const body = parseBody(event);
      if (!body.tree_id || !body.ancestor_handle)
        return send(400, { error: "\u7F3A\u5C11 tree_id \u6216 ancestor_handle" });
      try {
        const result = await splitTree({
          treeId: body.tree_id,
          ancestorHandle: body.ancestor_handle,
          ancestorName: body.ancestor_name || "",
          initiatorPhone: u.phone
        });
        return send(200, result);
      } catch (e) {
        return send(500, { error: `\u62C6\u5206\u5931\u8D25: ${e.message}` });
      }
    }
    if (pathname === "/admin/promote" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const user = await colGet("jiazu_users", u.phone);
      if (!user || user.role !== "chief_editor")
        return send(403, { error: "\u9700\u8981\u603B\u7F16\u8F91\u6743\u9650" });
      const body = parseBody(event);
      if (!body.tree_id || !body.node_handle || !body.attach_handle) {
        return send(400, { error: "\u7F3A\u5C11 tree_id / node_handle / attach_handle" });
      }
      try {
        const result = await promoteTree({
          treeId: body.tree_id,
          nodeHandle: body.node_handle,
          attachHandle: body.attach_handle,
          masterTreeId: MASTER_TREE_ID
        });
        return send(200, result);
      } catch (e) {
        return send(500, { error: `\u664B\u5B97\u5931\u8D25: ${e.message}` });
      }
    }
    if (pathname === "/admin/chain-append" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const user = await colGet("jiazu_users", u.phone);
      if (!user || user.role !== "chief_editor")
        return send(403, { error: "\u9700\u8981\u603B\u7F16\u8F91\u6743\u9650" });
      const body = parseBody(event);
      if (!body.tree_id || !body.parent_handle)
        return send(400, { error: "\u7F3A\u5C11 tree_id \u6216 parent_handle" });
      try {
        const result = await appendChainNode({
          treeId: body.tree_id,
          parentHandle: body.parent_handle,
          mode: body.mode === "attach" ? "attach" : "new",
          name: body.name || "",
          surname: body.surname || "",
          gender: body.gender || "U",
          childHandle: body.child_handle || "",
          note: body.note || "",
          extraAttributes: body.attributes || [],
          masterTreeId: MASTER_TREE_ID
        });
        return send(200, result);
      } catch (e) {
        return send(400, { error: e.message });
      }
    }
    if (pathname === "/admin/remove-branch-link" && method === "POST") {
      const u = await authUser(headers);
      if (!u)
        return send(401, { error: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F" });
      const user = await colGet("jiazu_users", u.phone);
      if (!user || user.role !== "chief_editor")
        return send(403, { error: "\u9700\u8981\u603B\u7F16\u8F91\u6743\u9650" });
      const body = parseBody(event);
      if (!body.tree_id || !body.person_handle)
        return send(400, { error: "\u7F3A\u5C11 tree_id \u6216 person_handle" });
      await removeBranchLink(body.tree_id, body.person_handle);
      return send(200, { ok: true });
    }
    if (!treeId)
      return send(400, { error: "\u7F3A\u5C11 X-Tree-Id" });
    const tree = await getTree(treeId);
    if (!tree)
      return send(404, { error: `\u6811\u4E0D\u5B58\u5728: ${treeId}` });
    if (pathname === "/people" && method === "POST") {
      await requireWriteUser(headers, treeId, pathname, null, true);
      const body = parseBody(event);
      const r = await createPerson(treeId, body);
      return send(201, [{ handle: r.handle }]);
    }
    const peMatch = pathname.match(/^\/people\/([^/]+)$/);
    if (peMatch && method === "PUT") {
      await requireWriteUser(headers, treeId, pathname, peMatch[1], false);
      const body = parseBody(event);
      await updatePerson(treeId, peMatch[1], body);
      return send(200, { ok: true });
    }
    if (pathname === "/families" && method === "POST") {
      await requireWriteUser(headers, treeId, pathname, null, true);
      const body = parseBody(event);
      const targetHandle = body.father_handle || body.mother_handle || body.child_ref_list?.[0]?.ref || "";
      if (targetHandle) {
        await requireWriteUser(headers, treeId, pathname, targetHandle, true);
      }
      const r = await createFamily(treeId, body);
      return send(201, [{ handle: r.handle }]);
    }
    const famMatch = pathname.match(/^\/families\/([^/]+)$/);
    if (famMatch && method === "PUT") {
      const fam = tree.families[famMatch[1]];
      if (!fam)
        return send(404, { error: "family not found" });
      const scopeHandle = fam.father_handle || fam.mother_handle || fam.child_handles?.[0] || "";
      if (scopeHandle)
        await requireWriteUser(headers, treeId, pathname, scopeHandle, false);
      const body = parseBody(event);
      await updateFamily(treeId, famMatch[1], body);
      return send(200, { ok: true });
    }
    const readAccess = await resolveTreeAccess(headers, treeId, tree);
    const evMatch = pathname.match(/^\/events\/([^/]+)$/);
    if (evMatch && method === "GET") {
      const index = await getEventIndex(treeId);
      const e = index.get(evMatch[1]);
      if (!e)
        return send(404, { error: "event not found" });
      return send(200, { handle: e.handle, type: e.type, date: { text: e.date }, place: e.place, description: e.description });
    }
    if (peMatch && method === "GET") {
      const person = tree.people[peMatch[1]];
      if (!person)
        return send(404, { error: "person not found" });
      if (readAccess.isHiddenPerson(person.handle))
        return send(404, { error: "\u8BE5\u8282\u70B9\u6682\u4E0D\u53EF\u89C1\uFF08\u8FD1\u4EE3\u4E16\u8C31\u7CFB\u4EC5\u5BB6\u65CF\u6210\u5458\u53EF\u89C1\uFF09" });
      const detail = await getDetail(treeId, person.handle);
      return send(200, toRawPerson(tree, person, detail));
    }
    if (pathname === "/people" && method === "GET") {
      const details = await getAllDetails(treeId);
      const detailMap = new Map(details.map((d) => [d.handle, d]));
      const out = Object.values(tree.people).filter((p) => !readAccess.isHiddenPerson(p.handle)).map((p) => toRawPerson(tree, p, detailMap.get(p.handle)));
      return send(200, out);
    }
    if (pathname === "/families" && method === "GET") {
      const out = Object.values(tree.families).filter((f) => !isHiddenFamily(readAccess, f)).map((f) => ({
        handle: f.handle,
        gramps_id: f.gramps_id || "",
        father_handle: f.father_handle || "",
        mother_handle: f.mother_handle || "",
        child_ref_list: (f.child_handles || []).map((c) => ({ ref: c }))
      }));
      return send(200, out);
    }
    if (pathname === "/search" && method === "GET") {
      const q = (query.query || "").toLowerCase();
      if (!q)
        return send(200, []);
      const limit = parseInt(query.pagesize || "20", 10) || 20;
      const details = await getAllDetails(treeId);
      const detailMap = new Map(details.map((d) => [d.handle, d]));
      const matched = [];
      for (const p of Object.values(tree.people)) {
        if (readAccess.isHiddenPerson(p.handle))
          continue;
        const hay = `${p.name}${p.surname}${p.given}`.toLowerCase();
        if (hay.includes(q)) {
          matched.push({ handle: p.handle, object: toRawPerson(tree, p, detailMap.get(p.handle)) });
          if (matched.length >= limit)
            break;
        }
      }
      return send(200, matched);
    }
    return send(404, { error: `\u672A\u77E5\u8DEF\u5F84: ${pathname}` });
  } catch (e) {
    return send(e.status || 500, { error: e.message || "internal error" });
  }
}
async function main(event) {
  return handleRequest(event || {});
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleRequest,
  main
});
