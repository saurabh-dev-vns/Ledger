const expensesService = require('../expenses/expenses.service');
const transfersService = require('../transfers/transfers.service');
const accountsService = require('../accounts/accounts.service');

/** pg returns timestamps as Date objects; the feed sorts and filters on YYYY-MM-DD strings. */
function toIsoDay(value) {
    return new Date(value).toISOString().slice(0, 10);
}

/**
 * Merges expenses, transfers and funds added into one date-sorted feed
 * for the Transactions page.
 */
async function getTransactionFeed(userId, filters = {}) {
    const expenses = await expensesService.getAllExpenses(userId, filters);
    const transfers = await transfersService.getTransfersInRange(userId, filters);
    const added = await accountsService.getFundsAdded(userId, filters);

    return [
        ...expenses.map(x => ({
            ...x,
            kind: 'expense',
            date: x.spent_on
        })),

        ...transfers.map(x => ({
            ...x,
            kind: 'transfer',
            date: toIsoDay(x.created_at)
        })),

        ...added.rows.map(x => ({
            ...x,
            kind: 'deposit',
            date: toIsoDay(x.created_at)
        }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

module.exports = { getTransactionFeed };
