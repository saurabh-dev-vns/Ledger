const { runInTransaction } = require('../../core/transaction');
const { round2 } = require('../../core/money');
const accountsRepo = require('../accounts/accounts.repository');
const { isCreditType } = require('../accounts/accounts.constants');
const repo = require('./expenses.repository');
const { CATEGORIES } = require('./expenses.constants');

function toNumberRow(x) {
    return { ...x, amount: Number(x.amount) };
}

async function addExpense(userId, amount, notes, paymentMethod, category, spentOn, accountId = null) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

        if (!CATEGORIES.includes(category)) {
            throw new Error('Invalid category.');
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
            throw new Error('Invalid expense date.');
        }

        await accountsRepo.ensureAccounts(userId, client);

        let aid = accountId;

        if (!aid) {
            aid = await accountsRepo.findFirstAccountByType(userId, paymentMethod, client);
        }

        const debit = await accountsRepo.debitAccount(userId, aid, amount, client);

        if (!debit) {
            throw new Error('That account does not have enough balance.');
        }

        await repo.insertExpense(userId, amount, notes, debit.type, category, spentOn, aid, client);
    });
}

async function deleteExpense(userId, id) {
    return runInTransaction(async client => {
        const row = await repo.getExpenseForDelete(userId, id, client);

        if (!row) {
            return false;
        }

        let aid = row.account_id;

        if (!aid) {
            aid = await accountsRepo.findFirstAccountByType(userId, row.payment_method, client);
        }

        if (aid) {
            // Credit back what this expense took out. For Credit
            // Card/EMI accounts this must still respect the credit
            // limit — the account may have been repaid since this
            // expense was made, so a plain uncapped credit could push
            // the balance above the limit.
            const account = await accountsRepo.getAccountForUpdate(userId, aid, client);

            if (account && isCreditType(account.type) && account.credit_limit !== null) {
                await accountsRepo.creditAccountCapped(userId, aid, Number(row.amount), client);
            } else {
                await accountsRepo.creditAccountPlain(userId, aid, Number(row.amount), client);
            }
        }

        await repo.deleteExpenseRow(userId, id, client);

        return true;
    });
}

async function getRecentExpenses(userId, limit = 10) {
    const safe = Math.max(1, Math.min(Number(limit) || 10, 100));
    const rows = await repo.listRecent(userId, safe);
    return rows.map(toNumberRow);
}

async function getAllExpenses(userId, filters = {}) {
    const rows = await repo.listFiltered(userId, filters);
    return rows.map(toNumberRow);
}

async function getMonthTotal(userId, month = null) {
    const m = month || new Date().toISOString().slice(0, 7);
    return Number(await repo.monthTotal(userId, m));
}

async function getCategoryBreakdown(userId, month = null) {
    const m = month || new Date().toISOString().slice(0, 7);
    const rows = await repo.categoryBreakdown(userId, m);

    return rows.map(x => ({
        category: x.category,
        total: Number(x.total)
    }));
}

async function getMonthlyTrend(userId, months = 6) {
    const rows = await repo.monthlyTrend(userId, months);

    return rows.map(row => ({
        month: row.month,
        total: Number(row.total)
    }));
}

module.exports = {
    addExpense,
    deleteExpense,
    getRecentExpenses,
    getAllExpenses,
    getMonthTotal,
    getCategoryBreakdown,
    getMonthlyTrend
};
