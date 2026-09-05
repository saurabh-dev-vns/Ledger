const express = require('express');
const { money, formatDate } = require('../../core/money');
const accountsService = require('../accounts/accounts.service');
const { isCreditType, accountTypeLabel } = require('../accounts/accounts.constants');
const expensesService = require('../expenses/expenses.service');
const transfersService = require('../transfers/transfers.service');
const budgetsService = require('../budgets/budgets.service');
const loansService = require('../loans/loans.service');

const router = express.Router();

router.get('/dashboard', async (req, res, next) => {
    try {
        const uid = req.session.userId;

        const accounts = await accountsService.getAccounts(uid);
        const liquidAccounts = accounts.filter(a => !isCreditType(a.type));
        const creditAccounts = accounts.filter(a => isCreditType(a.type));
        const total = liquidAccounts.reduce((s, a) => s + a.balance, 0);

        const monthTotal = await expensesService.getMonthTotal(uid);
        const recent = await expensesService.getRecentExpenses(uid, 8);
        const recentTransfers = await transfersService.getRecentTransfers(uid, 5);
        const byCategory = await expensesService.getCategoryBreakdown(uid);
        const maxCategory = byCategory.length
            ? Math.max(...byCategory.map(c => c.total))
            : 0;

        const budgets = await budgetsService.getBudgets(uid, new Date().toISOString().slice(0, 7));
        const trend = await expensesService.getMonthlyTrend(uid, 6);
        const loans = await loansService.getLoans(uid);

        res.render('dashboard', {
            pageTitle: 'Dashboard',
            wallet: await accountsService.getWallet(uid),
            accounts: liquidAccounts,
            creditAccounts,
            total,
            monthTotal,
            recent,
            recentTransfers,
            byCategory,
            maxCategory,
            budgets,
            trend,
            loans,
            money,
            formatDate,
            accountTypeLabel
        });
    } catch (e) {
        next(e);
    }
});

module.exports = router;
