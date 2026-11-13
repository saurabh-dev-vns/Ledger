const express = require('express');
const { route, ok } = require('../../api/http');
const service = require('./budgets.service');

const router = express.Router();

router.get('/budgets', route(async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    ok(res, { month, budgets: await service.getBudgets(req.session.userId, month) });
}));

router.post('/budgets', route(async (req, res) => {
    await service.upsertBudget(
        req.session.userId,
        req.body.category,
        req.body.month,
        parseFloat(req.body.amount)
    );

    ok(res, undefined, 'Budget saved.');
}));

router.delete('/budgets/:id', route(async (req, res) => {
    await service.deleteBudget(req.session.userId, req.params.id);
    ok(res, undefined, 'Budget deleted.');
}));

module.exports = router;
