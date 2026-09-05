const { runInTransaction } = require('../../core/transaction');
const expensesRepo = require('../expenses/expenses.repository');
const { IMPORTED_CATEGORY } = require('./imports.constants');
const { parseImportLines } = require('./imports.parser');

/**
 * Bulk-inserts historical expenses as pure records: no account is
 * debited and no balance changes, since these predate the user
 * using the app. They still count toward reports, category totals,
 * and the monthly trend chart.
 */
async function addImportedExpenses(userId, rows) {
    if (!rows || !rows.length) {
        throw new Error('No valid rows to import.');
    }

    return runInTransaction(async client => {
        for (const row of rows) {
            await expensesRepo.insertExpense(
                userId,
                row.amount,
                row.note,
                'imported',
                IMPORTED_CATEGORY,
                row.date,
                null,
                client
            );
        }

        return rows.length;
    });
}

module.exports = { parseImportLines, addImportedExpenses };
