const pool = require('../../db/pool');

/**
 * Report queries. The total, the category breakdown and the list of
 * expenses all use the same WHERE clause from buildWhere(), so they can
 * never disagree about which expenses are included. Every value goes
 * through a $n parameter, never into the SQL text.
 */

/** Makes %, _ and \ in the search text match themselves instead of acting as wildcards. */
function escapeLike(value) {
    return String(value).replace(/[\\%_]/g, '\\$&');
}

/**
 * @param range   { from, to } inclusive "YYYY-MM-DD" dates
 * @param filters { category, account, min, max, q } (any may be null)
 */
function buildWhere(userId, range, filters = {}) {
    const params = [userId, range.from, range.to];
    let where = 'e.user_id=$1 AND e.spent_on BETWEEN $2 AND $3';

    const add = (build, value) => {
        params.push(value);
        where += ` AND ${build(params.length)}`;
    };

    if (filters.category) add(n => `e.category=$${n}`, filters.category);

    if (filters.account === 'none') {
        where += ' AND e.account_id IS NULL';
    } else if (filters.account) {
        add(n => `e.account_id=$${n}`, filters.account);
    }

    if (filters.min !== null && filters.min !== undefined) add(n => `e.amount >= $${n}`, filters.min);
    if (filters.max !== null && filters.max !== undefined) add(n => `e.amount <= $${n}`, filters.max);

    if (filters.q) add(n => `e.notes ILIKE $${n} ESCAPE '\\'`, `%${escapeLike(filters.q)}%`);

    return { where, params };
}

async function summary(userId, range, filters, client = pool) {
    const { where, params } = buildWhere(userId, range, filters);

    const r = await client.query(
        `SELECT COALESCE(SUM(e.amount),0) AS total,
                COUNT(*) AS count,
                COUNT(DISTINCT e.spent_on) AS active_days
         FROM expenses e
         WHERE ${where}`,
        params
    );

    const row = r.rows[0];

    return {
        total: Number(row.total),
        count: Number(row.count),
        activeDays: Number(row.active_days)
    };
}

async function categoryTotals(userId, range, filters, client = pool) {
    const { where, params } = buildWhere(userId, range, filters);

    const r = await client.query(
        `SELECT e.category, SUM(e.amount) AS total
         FROM expenses e
         WHERE ${where}
         GROUP BY e.category
         ORDER BY total DESC, e.category`,
        params
    );

    return r.rows.map(x => ({ category: x.category, total: Number(x.total) }));
}

/** Newest first. Pass limit = null for every row (the Excel export). */
async function listExpenses(userId, range, filters, limit = null, client = pool) {
    const { where, params } = buildWhere(userId, range, filters);

    let sql = `SELECT e.*, a.name AS account_name
               FROM expenses e
               LEFT JOIN accounts a ON a.id=e.account_id
               WHERE ${where}
               ORDER BY e.spent_on DESC, e.id DESC`;

    if (limit !== null) {
        params.push(limit);
        sql += ` LIMIT $${params.length}`;
    }

    const r = await client.query(sql, params);

    return r.rows.map(x => ({ ...x, amount: Number(x.amount) }));
}

module.exports = {
    escapeLike,
    buildWhere,
    summary,
    categoryTotals,
    listExpenses
};
