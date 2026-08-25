const db = require('../db/init');

const CATEGORIES = [
  'Food & Dining', 'Transport', 'Groceries', 'Shopping', 'Bills & Utilities',
  'Rent', 'Entertainment', 'Health', 'Education', 'Travel', 'Other',
];

function money(n) {
  return Number(n || 0).toFixed(2);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats a 'YYYY-MM-DD' string without going through Date/UTC parsing (avoids off-by-one-day bugs). */
function formatDate(dateStr, withYear = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dd = String(d).padStart(2, '0');
  return withYear ? `${dd} ${MONTHS[m - 1]} ${y}` : `${dd} ${MONTHS[m - 1]}`;
}

function ensureWallet(userId) {
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, cash_balance, online_balance) VALUES (?, 0, 0)')
    .run(userId);
}

function getWallet(userId) {
  ensureWallet(userId);
  return db.prepare('SELECT cash_balance, online_balance FROM wallets WHERE user_id = ?').get(userId);
}

/** Runs fn inside a manual BEGIN/COMMIT/ROLLBACK block (node:sqlite has no built-in .transaction() helper). */
function runInTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Add money to a wallet (top-up). type is 'cash' or 'online'. */
function addBalance(userId, type, amount, note) {
  return runInTransaction(() => {
    if (!['cash', 'online'].includes(type)) throw new Error('Invalid balance type');
    amount = round2(amount);
    if (!(amount > 0)) throw new Error('Amount must be greater than zero');

    ensureWallet(userId);
    const column = type === 'cash' ? 'cash_balance' : 'online_balance';
    db.prepare(`UPDATE wallets SET ${column} = ${column} + ? WHERE user_id = ?`).run(amount, userId);
    db.prepare('INSERT INTO balance_log (user_id, type, amount, note) VALUES (?, ?, ?, ?)')
      .run(userId, type, amount, note || null);
  });
}

/** Add an expense and deduct it from the matching wallet balance. */
function addExpense(userId, amount, notes, paymentMethod, category, spentOn) {
  return runInTransaction(() => {
    if (!['cash', 'online'].includes(paymentMethod)) throw new Error('Invalid payment method');
    amount = round2(amount);
    if (!(amount > 0)) throw new Error('Amount must be greater than zero');

    ensureWallet(userId);
    const column = paymentMethod === 'cash' ? 'cash_balance' : 'online_balance';
    db.prepare(`UPDATE wallets SET ${column} = ${column} - ? WHERE user_id = ?`).run(amount, userId);
    db.prepare(
      `INSERT INTO expenses (user_id, amount, notes, payment_method, category, spent_on)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, amount, notes || null, paymentMethod, category, spentOn);
  });
}

/** Delete an expense and credit the amount back to the wallet it was taken from. */
function deleteExpense(userId, expenseId) {
  return runInTransaction(() => {
    const expense = db.prepare('SELECT amount, payment_method FROM expenses WHERE id = ? AND user_id = ?')
      .get(expenseId, userId);
    if (!expense) return false;

    const column = expense.payment_method === 'cash' ? 'cash_balance' : 'online_balance';
    db.prepare(`UPDATE wallets SET ${column} = ${column} + ? WHERE user_id = ?`).run(expense.amount, userId);
    db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(expenseId, userId);
    return true;
  });
}

function getRecentExpenses(userId, limit = 10) {
  return db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY spent_on DESC, id DESC LIMIT ?')
    .all(userId, limit);
}

function getAllExpenses(userId) {
  return db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY spent_on DESC, id DESC').all(userId);
}

function getMonthTotal(userId) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
     WHERE user_id = ? AND strftime('%Y-%m', spent_on) = strftime('%Y-%m', 'now')`
  ).get(userId);
  return row.total;
}

function getCategoryBreakdown(userId) {
  return db.prepare(
    `SELECT category, SUM(amount) AS total FROM expenses
     WHERE user_id = ? AND strftime('%Y-%m', spent_on) = strftime('%Y-%m', 'now')
     GROUP BY category ORDER BY total DESC`
  ).all(userId);
}

module.exports = {
  CATEGORIES,
  money,
  formatDate,
  ensureWallet,
  getWallet,
  addBalance,
  addExpense,
  deleteExpense,
  getRecentExpenses,
  getAllExpenses,
  getMonthTotal,
  getCategoryBreakdown,
};
