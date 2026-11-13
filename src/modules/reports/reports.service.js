const { round2 } = require('../../core/money');
const repo = require('./reports.repository');

/**
 * Everything one report needs, for an already-checked query (see
 * reports.filters.js). `limit` caps how many rows are returned for the
 * page; the total and the category breakdown always cover ALL matching
 * expenses, not just the rows shown. Pass limit = null for every row.
 */
async function getReport(userId, parsed, { limit = null } = {}) {
    const range = { from: parsed.period.from, to: parsed.period.to };

    const [summary, categories, expenses] = await Promise.all([
        repo.summary(userId, range, parsed.filters),
        repo.categoryTotals(userId, range, parsed.filters),
        repo.listExpenses(userId, range, parsed.filters, limit)
    ]);

    return {
        total: round2(summary.total),
        count: summary.count,
        activeDays: summary.activeDays,
        categories,
        expenses,
        truncated: limit !== null && summary.count > expenses.length
    };
}

module.exports = { getReport };
