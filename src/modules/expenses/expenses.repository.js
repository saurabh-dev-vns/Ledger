const pool = require('../../db/pool');

async function insertExpense(userId, amount, notes, paymentMethod, category, spentOn, accountId, client) {
    await client.query(
        `INSERT INTO expenses(
            user_id,
            amount,
            notes,
            payment_method,
            category,
            spent_on,
            account_id
        )
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [userId, amount, notes || null, paymentMethod, category, spentOn, accountId]
    );
}

async function getExpenseForDelete(userId, id, client) {
    const r = await client.query(
        `SELECT amount,account_id,payment_method
         FROM expenses
         WHERE id=$1 AND user_id=$2
         FOR UPDATE`,
        [id, userId]
    );

    return r.rows[0] || null;
}

async function deleteExpenseRow(userId, id, client) {
    await client.query(
        `DELETE FROM expenses
         WHERE id=$1 AND user_id=$2`,
        [id, userId]
    );
}

async function listRecent(userId, limit, client = pool) {
    const r = await client.query(
        `SELECT e.*,a.name account_name
         FROM expenses e
         LEFT JOIN accounts a ON a.id=e.account_id
         WHERE e.user_id=$1
         ORDER BY e.spent_on DESC,e.id DESC
         LIMIT $2`,
        [userId, limit]
    );

    return r.rows;
}

async function listFiltered(userId, filters = {}, client = pool) {
    let sql = `
        SELECT e.*,a.name account_name
        FROM expenses e
        LEFT JOIN accounts a ON a.id=e.account_id
        WHERE e.user_id=$1
    `;

    const p = [userId];

    if (filters.category) {
        p.push(filters.category);
        sql += ` AND e.category=$${p.length}`;
    }

    if (filters.method) {
        p.push(filters.method);
        sql += ` AND e.payment_method=$${p.length}`;
    }

    if (filters.from) {
        p.push(filters.from);
        sql += ` AND e.spent_on >= $${p.length}`;
    }

    if (filters.to) {
        p.push(filters.to);
        sql += ` AND e.spent_on <= $${p.length}`;
    }

    sql += ' ORDER BY e.spent_on DESC,e.id DESC';

    const r = await client.query(sql, p);
    return r.rows;
}

async function monthTotal(userId, month, client = pool) {
    const r = await client.query(
        `SELECT COALESCE(SUM(amount),0) total
         FROM expenses
         WHERE user_id=$1
         AND TO_CHAR(spent_on,'YYYY-MM')=$2`,
        [userId, month]
    );

    return r.rows[0].total;
}

async function categoryBreakdown(userId, month, client = pool) {
    const r = await client.query(
        `SELECT category,SUM(amount) total
         FROM expenses
         WHERE user_id=$1
         AND TO_CHAR(spent_on,'YYYY-MM')=$2
         GROUP BY category
         ORDER BY total DESC`,
        [userId, month]
    );

    return r.rows;
}

async function monthlyTrend(userId, months, client = pool) {
    const r = await client.query(
        `
            SELECT
                TO_CHAR(DATE_TRUNC('month', spent_on), 'YYYY-MM') AS month,
                COALESCE(SUM(amount), 0) AS total
            FROM expenses
            WHERE user_id = $1
            AND spent_on >= DATE_TRUNC(
                'month',
                CURRENT_DATE - (($2::int - 1) * INTERVAL '1 month')
            )
            GROUP BY DATE_TRUNC('month', spent_on)
            ORDER BY DATE_TRUNC('month', spent_on)
        `,
        [userId, months]
    );

    return r.rows;
}

module.exports = {
    insertExpense,
    getExpenseForDelete,
    deleteExpenseRow,
    listRecent,
    listFiltered,
    monthTotal,
    categoryBreakdown,
    monthlyTrend
};
