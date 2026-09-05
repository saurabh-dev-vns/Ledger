const express = require('express');
const { checkCsrf, setFlash } = require('../../middleware/session');
const { money } = require('../../core/money');
const { CATEGORIES } = require('../expenses/expenses.constants');
const service = require('./budgets.service');

const router = express.Router();

router.get('/budgets', async (req, res, next) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);

        res.render('budgets', {
            pageTitle: 'Budgets',
            month,
            budgets: await service.getBudgets(req.session.userId, month),
            categories: CATEGORIES,
            money
        });
    } catch (e) {
        next(e);
    }
});

router.post('/budgets', checkCsrf, async (req, res) => {
    try {
        await service.upsertBudget(
            req.session.userId,
            req.body.category,
            req.body.month,
            parseFloat(req.body.amount)
        );

        setFlash(req, 'Budget saved.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/budgets?month=' + encodeURIComponent(req.body.month));
});

router.post('/budgets/:id/delete', checkCsrf, async (req, res) => {
    try {
        await service.deleteBudget(req.session.userId, req.params.id);
        setFlash(req, 'Budget deleted.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect(
        '/budgets?month=' +
            encodeURIComponent(req.body.month || new Date().toISOString().slice(0, 7))
    );
});

module.exports = router;
