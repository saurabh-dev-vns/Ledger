const express = require('express');
const { checkCsrf, setFlash } = require('../../middleware/session');
const { money, formatDate } = require('../../core/money');
const accountsService = require('../accounts/accounts.service');
const { ACCOUNT_TYPES, accountTypeLabel, isCreditType } = require('../accounts/accounts.constants');
const service = require('./expenses.service');
const { CATEGORIES } = require('./expenses.constants');

const router = express.Router();

router.get('/add-expense', async (req, res, next) => {
    try {
        res.render('add_expense', {
            pageTitle: 'Add expense',
            wallet: await accountsService.getWallet(req.session.userId),
            accounts: await accountsService.getAccounts(req.session.userId),
            categories: CATEGORIES,
            money,
            today: new Date().toISOString().slice(0, 10),
            isCreditType
        });
    } catch (e) {
        next(e);
    }
});

router.post('/add-expense', checkCsrf, async (req, res) => {
    try {
        await service.addExpense(
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
            `Expense added — ₹${money(parseFloat(req.body.amount))}.`,
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

        const expenses = await service.getAllExpenses(req.session.userId, filters);
        const total = expenses.reduce((s, r) => s + Number(r.amount), 0);

        res.render('expenses', {
            pageTitle: 'All expenses',
            expenses,
            total,
            filters,
            categories: CATEGORIES,
            accountTypes: ACCOUNT_TYPES,
            accountTypeLabel,
            money,
            formatDate
        });
    } catch (e) {
        next(e);
    }
});

router.post('/expenses/:id/delete', checkCsrf, async (req, res) => {
    try {
        const ok = await service.deleteExpense(req.session.userId, req.params.id);

        setFlash(
            req,
            ok ? 'Expense deleted and amount credited back.' : 'Could not find that expense.',
            ok ? 'success' : 'error'
        );
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/expenses');
});

module.exports = router;
