const express = require('express');
const { money } = require('../../core/money');
const { getMonthRange } = require('../../core/dates');
const expensesService = require('../expenses/expenses.service');

const router = express.Router();

router.get('/reports', async (req, res, next) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        const userId = req.session.userId;

        const categories = await expensesService.getCategoryBreakdown(userId, month);
        const total = await expensesService.getMonthTotal(userId, month);
        const expenses = await expensesService.getAllExpenses(userId, getMonthRange(month));

        res.render('reports', {
            pageTitle: 'Reports',
            month,
            total,
            categories,
            expenses,
            money
        });
    } catch (e) {
        next(e);
    }
});

module.exports = router;
