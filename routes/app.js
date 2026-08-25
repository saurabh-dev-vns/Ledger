const express = require('express');
const wallet = require('../utils/wallet');
const { requireLogin, setFlash, checkCsrf } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

router.get('/dashboard', (req, res) => {
  const userId = req.session.userId;
  const w = wallet.getWallet(userId);
  const total = w.cash_balance + w.online_balance;
  const monthTotal = wallet.getMonthTotal(userId);
  const recent = wallet.getRecentExpenses(userId, 8);
  const byCategory = wallet.getCategoryBreakdown(userId);
  const maxCategory = byCategory.length ? Math.max(...byCategory.map(c => c.total)) : 0;

  res.render('dashboard', {
    pageTitle: 'Dashboard',
    wallet: w,
    total,
    monthTotal,
    recent,
    byCategory,
    maxCategory,
    money: wallet.money,
    formatDate: wallet.formatDate,
  });
});

router.get('/add-balance', (req, res) => {
  res.render('add_balance', { pageTitle: 'Add balance', wallet: wallet.getWallet(req.session.userId), money: wallet.money });
});

router.post('/add-balance', checkCsrf, (req, res) => {
  const userId = req.session.userId;
  const type = req.body.type;
  const amount = parseFloat(req.body.amount);
  const note = (req.body.note || '').trim() || null;

  try {
    wallet.addBalance(userId, type, amount, note);
    setFlash(req, `${type[0].toUpperCase()}${type.slice(1)} balance updated — added ₹${wallet.money(amount)}.`, 'success');
    return res.redirect('/dashboard');
  } catch (e) {
    setFlash(req, e.message || 'Something went wrong. Please try again.');
    res.redirect('/add-balance');
  }
});

router.get('/add-expense', (req, res) => {
  res.render('add_expense', {
    pageTitle: 'Add expense',
    wallet: wallet.getWallet(req.session.userId),
    categories: wallet.CATEGORIES,
    money: wallet.money,
    today: new Date().toISOString().slice(0, 10),
  });
});

router.post('/add-expense', checkCsrf, (req, res) => {
  const userId = req.session.userId;
  const amount = parseFloat(req.body.amount);
  const notes = (req.body.notes || '').trim() || null;
  const paymentMethod = req.body.payment_method;
  const category = req.body.category;
  const spentOn = req.body.spent_on || new Date().toISOString().slice(0, 10);

  const w = wallet.getWallet(userId);
  const available = paymentMethod === 'cash' ? w.cash_balance : w.online_balance;

  if (!wallet.CATEGORIES.includes(category)) {
    setFlash(req, 'Choose a valid category.');
  } else if (amount > 0 && ['cash', 'online'].includes(paymentMethod) && amount > available) {
    setFlash(req, `That would put your ${paymentMethod} balance below zero. Add more balance first, or lower the amount.`);
  } else {
    try {
      wallet.addExpense(userId, amount, notes, paymentMethod, category, spentOn);
      setFlash(req, `Expense added — ₹${wallet.money(amount)} logged under ${category}.`, 'success');
      return res.redirect('/dashboard');
    } catch (e) {
      setFlash(req, e.message || 'Something went wrong. Please try again.');
    }
  }
  res.redirect('/add-expense');
});

router.get('/expenses', (req, res) => {
  const all = wallet.getAllExpenses(req.session.userId);
  const total = all.reduce((sum, r) => sum + r.amount, 0);
  res.render('expenses', { pageTitle: 'All expenses', expenses: all, total, money: wallet.money, formatDate: wallet.formatDate });
});

router.post('/expenses/:id/delete', checkCsrf, (req, res) => {
  const ok = wallet.deleteExpense(req.session.userId, req.params.id);
  setFlash(
    req,
    ok ? 'Expense deleted and amount credited back to your wallet.' : 'Could not find that expense.',
    ok ? 'success' : 'error'
  );
  res.redirect('/expenses');
});

module.exports = router;
