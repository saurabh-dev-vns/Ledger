const { round2 } = require('../../core/money');
const { CATEGORIES } = require('../expenses/expenses.constants');
const repo = require('./budgets.repository');

async function getBudgets(userId, month) {
    const rows = await repo.listWithSpent(userId, month);

    return rows.map(x => ({
        ...x,
        amount: Number(x.amount),
        spent: Number(x.spent)
    }));
}

async function upsertBudget(userId, category, month, amount) {
    amount = round2(amount);

    if (!CATEGORIES.includes(category)) {
        throw new Error('Invalid category.');
    }

    if (!(amount > 0)) {
        throw new Error('Budget must be greater than zero.');
    }

    return repo.upsert(userId, category, month, amount);
}

async function deleteBudget(userId, id) {
    return repo.remove(userId, id);
}

module.exports = { getBudgets, upsertBudget, deleteBudget };
