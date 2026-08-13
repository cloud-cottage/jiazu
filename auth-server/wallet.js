/**
 * 钱包模块 — 用户余额 / 家族树余额 / 交易流水
 *
 * 规则:
 * - 单位: 人民币元（金额以「分」存储整数，避免浮点误差）
 * - 用户余额: 注册用户个人钱包（充值/消费）
 * - 树余额: 独立账目，转账进入，仅展示，不支持转出/提现
 * - 新建家族树费用: 从发起人用户余额扣除（管理面板可调）
 *
 * 存储: data/wallets.json
 * {
 *   "users": { "13800138000": { "balance_cents": 0 } },
 *   "trees": { "ji_23395_01": { "balance_cents": 0 } },
 *   "transactions": [ { id, type, user, tree, amount_cents, desc, ts } ],
 *   "config": { "tree_create_fee_cents": 990 }
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLETS_FILE = path.join(__dirname, 'data', 'wallets.json');

const DEFAULT_FEE_CENTS = 990; // 新建家族树默认 9.9 元

let wallets = load();

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
    return {
      users: data.users || {},
      trees: data.trees || {},
      transactions: data.transactions || [],
      config: data.config || { tree_create_fee_cents: DEFAULT_FEE_CENTS },
    };
  } catch {
    return {
      users: {},
      trees: {},
      transactions: [],
      config: { tree_create_fee_cents: DEFAULT_FEE_CENTS },
    };
  }
}

function persist() {
  fs.mkdirSync(path.dirname(WALLETS_FILE), { recursive: true });
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
}

// ---- 余额查询 ----

export function getUserBalance(phone) {
  return wallets.users[phone]?.balance_cents || 0;
}

export function getTreeBalance(treeId) {
  return wallets.trees[treeId]?.balance_cents || 0;
}

export function getTreeCreateFeeCents() {
  return wallets.config.tree_create_fee_cents ?? DEFAULT_FEE_CENTS;
}

export function getTreeCreateFeeYuan() {
  return (getTreeCreateFeeCents() / 100).toFixed(2);
}

// ---- 充值（开发阶段模拟；预留真实支付接入点） ----

export function recharge(phone, amountCents, note = '充值') {
  if (amountCents <= 0) throw new Error('充值金额必须大于 0');
  if (!wallets.users[phone]) wallets.users[phone] = { balance_cents: 0 };
  wallets.users[phone].balance_cents += amountCents;
  wallets.transactions.push({
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'recharge',
    user: phone,
    amount_cents: amountCents,
    desc: note,
    ts: new Date().toISOString(),
  });
  persist();
  return getUserBalance(phone);
}

// ---- 转账到家族树（仅入账，不支持转出） ----

export function transferToTree(phone, treeId, amountCents) {
  if (amountCents <= 0) throw new Error('转账金额必须大于 0');
  const balance = getUserBalance(phone);
  if (balance < amountCents) {
    throw new Error(`余额不足：当前 ¥${(balance / 100).toFixed(2)}`);
  }
  // 扣用户
  wallets.users[phone].balance_cents -= amountCents;
  // 加树
  if (!wallets.trees[treeId]) wallets.trees[treeId] = { balance_cents: 0 };
  wallets.trees[treeId].balance_cents += amountCents;
  wallets.transactions.push({
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'transfer',
    user: phone,
    tree: treeId,
    amount_cents: amountCents,
    desc: `转账到家族树 ${treeId}`,
    ts: new Date().toISOString(),
  });
  persist();
  return { user_balance: getUserBalance(phone), tree_balance: getTreeBalance(treeId) };
}

// ---- 新建家族树扣费（从发起人余额扣除） ----

export function deductTreeCreateFee(phone) {
  const fee = getTreeCreateFeeCents();
  const balance = getUserBalance(phone);
  if (balance < fee) {
    throw new Error(
      `余额不足，新建家族树需要 ¥${(fee / 100).toFixed(2)}，当前余额 ¥${(balance / 100).toFixed(2)}`,
    );
  }
  wallets.users[phone].balance_cents -= fee;
  wallets.transactions.push({
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'tree_create_fee',
    user: phone,
    amount_cents: -fee,
    desc: `新建家族树费用 ¥${(fee / 100).toFixed(2)}`,
    ts: new Date().toISOString(),
  });
  persist();
  return getUserBalance(phone);
}

// ---- 管理：设置建树费（仅 admin） ----

export function setTreeCreateFeeCents(amountCents) {
  if (amountCents <= 0) throw new Error('费用必须大于 0');
  wallets.config.tree_create_fee_cents = amountCents;
  persist();
  return wallets.config.tree_create_fee_cents;
}

// ---- 交易流水 ----

export function getTransactions(userPhone, limit = 50) {
  return wallets.transactions
    .filter((t) => !t.user || t.user === userPhone)
    .slice(-limit)
    .reverse();
}

// ---- 钱包总览（页面展示用） ----

export function getWalletOverview(phone) {
  return {
    user_balance_yuan: (getUserBalance(phone) / 100).toFixed(2),
    tree_create_fee_yuan: getTreeCreateFeeYuan(),
    transactions: getTransactions(phone),
  };
}
