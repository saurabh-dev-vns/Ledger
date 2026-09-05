const pool = require('../../db/pool');

async function listWithSpent(userId, month, client = pool) {
    const r = await client.query(
        `SELECT b.*,COALESCE(SUM(e.amount),0) spent
         FROM budgets b
         LEFT JOIN expenses e
            ON e.user_id=b.user_id
            AND e.category=b.category
            AND TO_CHAR(e.spent_on,'YYYY-MM')=TO_CHAR(b.month,'YYYY-MM')
         WHERE b.user_id=$1
         AND TO_CHAR(b.month,'YYYY-MM')=$2
         GROUP BY b.id
         ORDER BY b.category`,
        [userId, month]
    );

    return r.rows;
}

async function upsert(userId, category, month, amount, client = pool) {
    return client.query(
        `INSERT INTO budgets(user_id,category,month,amount)
         VALUES($1,$2,($3||'-01')::date,$4)
         ON CONFLICT(user_id,category,month)
         DO UPDATE SET amount=EXCLUDED.amount`,
        [userId, category, month, amount]
    );
}

async function remove(userId, id, client = pool) {
    return client.query(
        `DELETE FROM budgets
         WHERE id=$1 AND user_id=$2`,
        [id, userId]
    );
}

module.exports = { listWithSpent, upsert, remove };
