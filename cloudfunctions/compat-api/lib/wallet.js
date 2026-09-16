/**
 * 钱包模块（集合 jiazu_wallets，_id='global'）
 * 规则与 auth-server/wallet.js 一致：分存储、树余额仅入账、建树费 9.9 元默认。
 */
import crypto from 'node:crypto';
import { colGet, colSet } from './store.js';

const DEFAULT_FEE_CENTS = 990;

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

export async function setTreeCreateFeeCents(amountCents) {
  if (amountCents <= 0) throw new Error('费用必须大于 0');
  const w = await load();
  w.config.tree_create_fee_cents = amountCents;
  await persist(w);
  return amountCents;
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
