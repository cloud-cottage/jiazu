/**
 * 钱包模块（集合 jiazu_wallets，_id='global'）
 * 规则与 auth-server/wallet.js 一致：分存储、树余额仅入账、建树费 9.9 元默认。
 */
import crypto from 'node:crypto';
import { colGet, colSet } from './store.js';

const DEFAULT_FEE_CENTS = 990;
/** 立支费默认值（颗石榴籽；docs/branch-clan-ops.spec.md §5-4，与 lib/economy-fee.js FEE.branch_fee_seeds 同值） */
export const DEFAULT_BRANCH_FEE_SEEDS = 9999;
/** 汇宗灵气折损比例默认值（0–1；docs/branch-clan-ops.spec.md §5-4） */
export const DEFAULT_CONVERGE_SPIRIT_RATIO = 0.5;

async function load() {
  const w = await colGet('jiazu_wallets', 'global');
  return (
    w || {
      users: {},
      trees: {},
      transactions: [],
      config: { tree_create_fee_cents: DEFAULT_FEE_CENTS },
    }
  );
}

async function persist(w) {
  await colSet('jiazu_wallets', 'global', w);
}

function txid() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getUserBalance(phone) {
  const w = await load();
  return w.users[phone]?.balance_cents || 0;
}

export async function getTreeBalance(treeId) {
  const w = await load();
  return w.trees[treeId]?.balance_cents || 0;
}

export async function getTreeCreateFeeCents() {
  const w = await load();
  return w.config.tree_create_fee_cents ?? DEFAULT_FEE_CENTS;
}

export async function recharge(phone, amountCents) {
  if (amountCents <= 0) throw new Error('充值金额必须大于 0');
  const w = await load();
  if (!w.users[phone]) w.users[phone] = { balance_cents: 0 };
  w.users[phone].balance_cents += amountCents;
  w.transactions.push({ id: txid(), type: 'recharge', user: phone, amount_cents: amountCents, desc: '充值', ts: new Date().toISOString() });
  await persist(w);
  return w.users[phone].balance_cents;
}

export async function transferToTree(phone, treeId, amountCents) {
  if (amountCents <= 0) throw new Error('转账金额必须大于 0');
  const w = await load();
  const balance = w.users[phone]?.balance_cents || 0;
  if (balance < amountCents) throw new Error(`余额不足：当前 ¥${(balance / 100).toFixed(2)}`);
  w.users[phone].balance_cents -= amountCents;
  if (!w.trees[treeId]) w.trees[treeId] = { balance_cents: 0 };
  w.trees[treeId].balance_cents += amountCents;
  w.transactions.push({ id: txid(), type: 'transfer', user: phone, tree: treeId, amount_cents: amountCents, desc: `转账到家族树 ${treeId}`, ts: new Date().toISOString() });
  await persist(w);
  return { user_balance: w.users[phone].balance_cents, tree_balance: w.trees[treeId].balance_cents };
}

export async function deductTreeCreateFee(phone) {
  const fee = await getTreeCreateFeeCents();
  const w = await load();
  const balance = w.users[phone]?.balance_cents || 0;
  if (balance < fee) {
    throw new Error(`余额不足，新建家族树需要 ¥${(fee / 100).toFixed(2)}，当前余额 ¥${(balance / 100).toFixed(2)}`);
  }
  w.users[phone].balance_cents -= fee;
  w.transactions.push({ id: txid(), type: 'tree_create_fee', user: phone, amount_cents: -fee, desc: `新建家族树费用 ¥${(fee / 100).toFixed(2)}`, ts: new Date().toISOString() });
  await persist(w);
  return w.users[phone].balance_cents;
}

/**
 * ¥ 消费扣款（**唯一人民币消费通道 = 购买官方竹简**，docs/economy-market.spec.md §7 / §10 反变现约束）：
 * 余额不足 → 抛错（调用方应先校验并在路由层回 409 文案）；写一条 ¥ 钱包流水（`type` 缺省 `official_bamboo`）。
 * @returns {Promise<number>} 扣款后余额（分）
 */
export async function deductUserBalance(phone, amountCents, opts = {}) {
  const amount = Math.floor(Number(amountCents) || 0);
  if (amount <= 0) throw new Error('扣款金额必须大于 0');
  const w = await load();
  const balance = w.users[phone]?.balance_cents || 0;
  if (balance < amount) throw new Error(`余额不足：当前 ¥${(balance / 100).toFixed(2)}`);
  w.users[phone].balance_cents -= amount;
  w.transactions.push({
    id: txid(),
    type: opts.type || 'official_bamboo',
    user: phone,
    amount_cents: -amount,
    desc: opts.desc || '购买官方竹简',
    ts: new Date().toISOString(),
  });
  await persist(w);
  return w.users[phone].balance_cents;
}

export async function setTreeCreateFeeCents(amountCents) {
  if (amountCents <= 0) throw new Error('费用必须大于 0');
  const w = await load();
  w.config.tree_create_fee_cents = amountCents;
  await persist(w);
  return amountCents;
}

// ---- 立支 / 汇宗 后台设置键（同一设置载体 `jiazu_wallets.config`；docs/branch-clan-ops.spec.md §5-4）----

/**
 * 立支费（颗完整石榴籽）：`config.branch_fee_seeds`，缺省 / 非法值 → 9999。
 * 只读；写入口沿用既有治理路由 `PUT /admin/wallet-fee`（本册不新增设置路由）。
 */
export async function getBranchFeeSeeds() {
  const w = await load();
  const raw = Number(w.config?.branch_fee_seeds);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_BRANCH_FEE_SEEDS;
}

/** 设置立支费（整数颗；≤0 / 非整数 → 抛错，路由回 400） */
export async function setBranchFeeSeeds(seeds) {
  const n = Number(seeds);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new Error('立支费必须为正整数（颗）');
  const w = await load();
  w.config = w.config || {};
  w.config.branch_fee_seeds = n;
  await persist(w);
  return n;
}

/**
 * 汇宗灵气折损比例：`config.converge_spirit_ratio`，缺省 / 非 0–1 → 0.5。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。
 */
export async function getConvergeSpiritRatio() {
  const w = await load();
  const raw = Number(w.config?.converge_spirit_ratio);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_CONVERGE_SPIRIT_RATIO;
}

/** 设置汇宗折损比例（0–1；越界 → 抛错，路由回 400） */
export async function setConvergeSpiritRatio(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('折损比例必须为 0–1 之间的数');
  const w = await load();
  w.config = w.config || {};
  w.config.converge_spirit_ratio = n;
  await persist(w);
  return n;
}

export async function getWalletOverview(phone) {
  const w = await load();
  const transactions = w.transactions
    .filter((t) => !t.user || t.user === phone)
    .slice(-50)
    .reverse();
  return {
    user_balance_yuan: ((w.users[phone]?.balance_cents || 0) / 100).toFixed(2),
    tree_create_fee_yuan: ((w.config.tree_create_fee_cents ?? DEFAULT_FEE_CENTS) / 100).toFixed(2),
    transactions,
  };
}
