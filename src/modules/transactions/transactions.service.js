const expensesService = require('../expenses/expenses.service');
const transfersService = require('../transfers/transfers.service');

/** Merges expenses and transfers into one date-sorted feed for the Transactions page. */
async function getTransactionFeed(userId, filters = {}) {
    const expenses = await expensesService.getAllExpenses(userId, filters);
    const transfers = await transfersService.getTransfersInRange(userId, filters);

    return [
        ...expenses.map(x => ({
            ...x,
            kind: 'expense',
            date: x.spent_on
        })),

        ...transfers.map(x => ({
            ...x,
            kind: 'transfer',
            date: String(x.created_at).slice(0, 10)
        }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

module.exports = { getTransactionFeed };
