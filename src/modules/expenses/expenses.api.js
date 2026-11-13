const express = require('express');
const { route, ok } = require('../../api/http');
const { money } = require('../../core/money');
const service = require('./expenses.service');

const router = express.Router();

router.get('/expenses', route(async (req, res) => {
    const filters = {
        category: req.query.category || '',
        method: req.query.method || '',
        from: req.query.from || '',
        to: req.query.to || ''
    };

    const expenses = await service.getAllExpenses(req.session.userId, filters);
    const total = expenses.reduce((s, r) => s + Number(r.amount), 0);

    ok(res, { expenses, total, filters });
}));

router.post('/expenses', route(async (req, res) => {
    const amount = parseFloat(req.body.amount);

    await service.addExpense(
        req.session.userId,
        amount,
        String(req.body.notes || '').trim() || null,
        req.body.payment_method,
        req.body.category,
        req.body.spent_on || new Date().toISOString().slice(0, 10),
        req.body.account_id,
        req.body.savings_part || null
    );

    ok(res, undefined, `Expense added — ₹${money(amount)}.`, 201);
}));

router.delete('/expenses/:id', route(async (req, res) => {
    const deleted = await service.deleteExpense(req.session.userId, req.params.id);

    if (!deleted) {
        return res.status(404).json({ ok: false, error: 'Could not find that expense.' });
    }

    ok(res, undefined, 'Expense deleted and amount credited back.');
}));

module.exports = router;
