const express = require('express');
const wallet = require('../utils/wallet');
const { requireLogin, setFlash, checkCsrf } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin);

router.get('/dashboard', async (req, res, next) => {
    try {
        const uid = req.session.userId;
        const accounts = await wallet.getAccounts(uid);
        const total = accounts.reduce((s, a) => s + a.balance, 0);
        const monthTotal = await wallet.getMonthTotal(uid);
        const recent = await wallet.getRecentExpenses(uid, 8);
        const recentTransfers = await wallet.getRecentTransfers(uid, 5);
        const byCategory = await wallet.getCategoryBreakdown(uid);
        const maxCategory = byCategory.length
            ? Math.max(...byCategory.map(c => c.total))
            : 0;
        const budgets = await wallet.getBudgets(
            uid,
            new Date().toISOString().slice(0, 7)
        );
        const trend = await wallet.getMonthlyTrend(uid, 6);
        const loans = await wallet.getLoans(uid);

        res.render('dashboard', {
            pageTitle: 'Dashboard',
            wallet: await wallet.getWallet(uid),
            accounts,
            total,
            monthTotal,
            recent,
            recentTransfers,
            byCategory,
            maxCategory,
            budgets,
            trend,
            loans,
            money: wallet.money,
            formatDate: wallet.formatDate
        });
    } catch (e) {
        next(e);
    }
});

router.get('/add-balance', async (req, res, next) => {
    try {
        res.render('add_balance', {
            pageTitle: 'Add balance',
            wallet: await wallet.getWallet(req.session.userId),
            accounts: await wallet.getAccounts(req.session.userId),
            money: wallet.money
        });
    } catch (e) {
        next(e);
    }
});

router.post('/add-balance', checkCsrf, async (req, res) => {
    try {
        await wallet.updateAccountBalance(
            req.session.userId,
            req.body.account_id,
            parseFloat(req.body.amount),
            (req.body.note || '').trim() || null
        );

        setFlash(req, 'Balance updated successfully.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/add-balance');
});

router.get('/accounts', async (req, res, next) => {
    try {
        res.render('accounts', {
            pageTitle: 'Accounts',
            accounts: await wallet.getAccounts(req.session.userId),
            money: wallet.money,
            accountTypes: wallet.ACCOUNT_TYPES
        });
    } catch (e) {
        next(e);
    }
});

router.post('/accounts', checkCsrf, async (req, res) => {
    try {
        await wallet.addAccount(
            req.session.userId,
            req.body.name,
            req.body.type,
            parseFloat(req.body.balance || 0)
        );

        setFlash(req, 'Account created.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/accounts');
});

router.post('/accounts/:id/add', checkCsrf, async (req, res) => {
    try {
        await wallet.updateAccountBalance(
            req.session.userId,
            req.params.id,
            parseFloat(req.body.amount),
            (req.body.note || '').trim() || null
        );

        setFlash(req, 'Balance added.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/accounts');
});

router.get('/swap-balance', async (req, res, next) => {
    try {
        res.render('swap_balance', {
            pageTitle: 'Transfer money',
            accounts: await wallet.getAccounts(req.session.userId),
            wallet: await wallet.getWallet(req.session.userId),
            money: wallet.money
        });
    } catch (e) {
        next(e);
    }
});

router.post('/swap-balance', checkCsrf, async (req, res) => {
    try {
        await wallet.transfer(
            req.session.userId,
            req.body.from_account_id,
            req.body.to_account_id,
            parseFloat(req.body.amount),
            (req.body.note || '').trim() || null
        );

        setFlash(req, 'Money transferred successfully.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/swap-balance');
});

router.get('/add-expense', async (req, res, next) => {
    try {
        res.render('add_expense', {
            pageTitle: 'Add expense',
            wallet: await wallet.getWallet(req.session.userId),
            accounts: await wallet.getAccounts(req.session.userId),
            categories: wallet.CATEGORIES,
            money: wallet.money,
            today: new Date().toISOString().slice(0, 10)
        });
    } catch (e) {
        next(e);
    }
});

router.post('/add-expense', checkCsrf, async (req, res) => {
    try {
        await wallet.addExpense(
            req.session.userId,
            parseFloat(req.body.amount),
            String(req.body.notes || '').trim() || null,
            req.body.payment_method,
            req.body.category,
            req.body.spent_on || new Date().toISOString().slice(0, 10),
            req.body.account_id
        );

        setFlash(
            req,
            `Expense added — ₹${wallet.money(parseFloat(req.body.amount))}.`,
            'success'
        );

        return res.redirect('/dashboard');
    } catch (e) {
        setFlash(req, e.message);
        res.redirect('/add-expense');
    }
});

router.get('/expenses', async (req, res, next) => {
    try {
        const filters = {
            category: req.query.category || '',
            method: req.query.method || '',
            from: req.query.from || '',
            to: req.query.to || ''
        };

        const expenses = await wallet.getAllExpenses(
            req.session.userId,
            filters
        );

        const total = expenses.reduce(
            (s, r) => s + Number(r.amount),
            0
        );

        res.render('expenses', {
            pageTitle: 'All expenses',
            expenses,
            total,
            filters,
            categories: wallet.CATEGORIES,
            money: wallet.money,
            formatDate: wallet.formatDate
        });
    } catch (e) {
        next(e);
    }
});

router.post('/expenses/:id/delete', checkCsrf, async (req, res) => {
    try {
        const ok = await wallet.deleteExpense(
            req.session.userId,
            req.params.id
        );

        setFlash(
            req,
            ok
                ? 'Expense deleted and amount credited back.'
                : 'Could not find that expense.',
            ok ? 'success' : 'error'
        );
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/expenses');
});

router.get('/budgets', async (req, res, next) => {
    try {
        const month =
            req.query.month || new Date().toISOString().slice(0, 7);

        res.render('budgets', {
            pageTitle: 'Budgets',
            month,
            budgets: await wallet.getBudgets(
                req.session.userId,
                month
            ),
            categories: wallet.CATEGORIES,
            money: wallet.money
        });
    } catch (e) {
        next(e);
    }
});

router.post('/budgets', checkCsrf, async (req, res) => {
    try {
        await wallet.upsertBudget(
            req.session.userId,
            req.body.category,
            req.body.month,
            parseFloat(req.body.amount)
        );

        setFlash(req, 'Budget saved.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect(
        '/budgets?month=' + encodeURIComponent(req.body.month)
    );
});

router.post('/budgets/:id/delete', checkCsrf, async (req, res) => {
    try {
        await wallet.deleteBudget(
            req.session.userId,
            req.params.id
        );

        setFlash(req, 'Budget deleted.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect(
        '/budgets?month=' +
            encodeURIComponent(
                req.body.month ||
                    new Date().toISOString().slice(0, 7)
            )
    );
});

router.get('/loans', async (req, res, next) => {
    try {
        res.render('loans', {
            pageTitle: 'Money owed',
            loans: await wallet.getLoans(req.session.userId),
            money: wallet.money
        });
    } catch (e) {
        next(e);
    }
});

router.post('/loans', checkCsrf, async (req, res) => {
    try {
        await wallet.addLoan(
            req.session.userId,
            req.body.person,
            req.body.direction,
            parseFloat(req.body.amount),
            req.body.note
        );

        setFlash(req, 'Loan added.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/loans');
});

router.post('/loans/:id/repay', checkCsrf, async (req, res) => {
    try {
        await wallet.repayLoan(
            req.session.userId,
            req.params.id,
            parseFloat(req.body.amount)
        );

        setFlash(req, 'Repayment recorded.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/loans');
});

router.get('/reports', async (req, res, next) => {
    try {
        const month =
            req.query.month || new Date().toISOString().slice(0, 7);

        const categories = await wallet.getCategoryBreakdown(
            req.session.userId,
            month
        );

        const total = await wallet.getMonthTotal(
            req.session.userId,
            month
        );

        const expenses = await wallet.getAllExpenses(
            req.session.userId,
            {
                from: month + '-01',
                to: month + '-31'
            }
        );

        res.render('reports', {
            pageTitle: 'Reports',
            month,
            total,
            categories,
            expenses,
            money: wallet.money
        });
    } catch (e) {
        next(e);
    }
});

router.get('/transactions', async (req, res, next) => {
    try {
        const filters = {
            from: req.query.from || '',
            to: req.query.to || ''
        };

        res.render('transactions', {
            pageTitle: 'Transactions',
            transactions: await wallet.getTransactionFeed(
                req.session.userId,
                filters
            ),
            filters,
            money: wallet.money,
            formatDate: wallet.formatDate
        });
    } catch (e) {
        next(e);
    }
});

module.exports = router;