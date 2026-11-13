const pool = require('../../db/pool');

/**
 * Read-only aggregate queries for Insights. Every query is scoped to one
 * user and an inclusive date range ("YYYY-MM-DD" to "YYYY-MM-DD").
 * Nothing here changes data.
 */

async function expenseTotals(userId, from, to, client = pool) {
    const r = await client.query(
        `SELECT COALESCE(SUM(amount),0) AS total,
                COUNT(*) AS count,
                COUNT(DISTINCT spent_on) AS active_days
         FROM expenses
         WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3`,
        [userId, from, to]
    );

    const row = r.rows[0];

    return {
        total: Number(row.total),
        count: Number(row.count),
        activeDays: Number(row.active_days)
    };
}

async function biggestExpenses(userId, from, to, limit = 3, client = pool) {
    const r = await client.query(
        `SELECT amount, category, spent_on
         FROM expenses
         WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3
         ORDER BY amount DESC, id DESC
         LIMIT $4`,
        [userId, from, to, limit]
    );

    return r.rows.map(x => ({
        amount: Number(x.amount),
        category: x.category,
        date: String(x.spent_on).slice(0, 10)
    }));
}

async function categoryTotals(userId, from, to, client = pool) {
    const r = await client.query(
        `SELECT category, SUM(amount) AS total, COUNT(*) AS count
         FROM expenses
         WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3
         GROUP BY category
         ORDER BY total DESC, category`,
        [userId, from, to]
    );

    return r.rows.map(x => ({
        category: x.category,
        total: Number(x.total),
        count: Number(x.count)
    }));
}

/** Spending per bucket. unit "day" groups by date, unit "month" groups by "YYYY-MM". */
async function spendingByBucket(userId, from, to, unit, client = pool) {
    const key = unit === 'month' ? `TO_CHAR(spent_on,'YYYY-MM')` : `TO_CHAR(spent_on,'YYYY-MM-DD')`;

    const r = await client.query(
        `SELECT ${key} AS bucket, SUM(amount) AS total
         FROM expenses
         WHERE user_id=$1 AND spent_on BETWEEN $2 AND $3
         GROUP BY bucket
         ORDER BY bucket`,
        [userId, from, to]
    );

    return r.rows.map(x => ({ bucket: x.bucket, total: Number(x.total) }));
}

async function accountTotals(userId, from, to, client = pool) {
    const r = await client.query(
        `SELECT COALESCE(a.name, INITCAP(e.payment_method)) AS name,
                SUM(e.amount) AS total,
                COUNT(*) AS count
         FROM expenses e
         LEFT JOIN accounts a ON a.id=e.account_id
         WHERE e.user_id=$1 AND e.spent_on BETWEEN $2 AND $3
         GROUP BY COALESCE(a.name, INITCAP(e.payment_method))
         ORDER BY total DESC, name`,
        [userId, from, to]
    );

    return r.rows.map(x => ({
        name: x.name,
        total: Number(x.total),
        count: Number(x.count)
    }));
}

/** Money added to accounts (top-ups) and card repayments in the range. */
async function fundsFlow(userId, from, to, client = pool) {
    const r = await client.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE kind='topup'),0) AS added,
                COUNT(*) FILTER (WHERE kind='topup') AS added_count,
                COALESCE(SUM(amount) FILTER (WHERE kind='repayment'),0) AS repaid
         FROM balance_log
         WHERE user_id=$1 AND created_at::date BETWEEN $2 AND $3`,
        [userId, from, to]
    );

    const row = r.rows[0];

    return {
        added: Number(row.added),
        addedCount: Number(row.added_count),
        repaid: Number(row.repaid)
    };
}

async function transferTotals(userId, from, to, client = pool) {
    const r = await client.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
         FROM wallet_transfers
         WHERE user_id=$1 AND created_at::date BETWEEN $2 AND $3`,
        [userId, from, to]
    );

    return { count: Number(r.rows[0].count), total: Number(r.rows[0].total) };
}

/** Saved AI texts, so the same numbers are never sent to the AI twice. */
async function getCachedInsight(userId, period, periodKey, client = pool) {
    const r = await client.query(
        `SELECT facts_hash, payload
         FROM insight_cache
         WHERE user_id=$1 AND period=$2 AND period_key=$3`,
        [userId, period, periodKey]
    );

    return r.rows[0] ? { factsHash: r.rows[0].facts_hash, payload: r.rows[0].payload } : null;
}

async function saveCachedInsight(userId, period, periodKey, factsHash, payload, client = pool) {
    await client.query(
        `INSERT INTO insight_cache(user_id, period, period_key, facts_hash, payload)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(user_id, period, period_key)
         DO UPDATE SET facts_hash=EXCLUDED.facts_hash,
                       payload=EXCLUDED.payload,
                       created_at=NOW()`,
        [userId, period, periodKey, factsHash, JSON.stringify(payload)]
    );

    // Keep the table small: old rows are of no use.
    await client.query(
        `DELETE FROM insight_cache
         WHERE user_id=$1 AND created_at < NOW() - INTERVAL '90 days'`,
        [userId]
    );
}

module.exports = {
    getCachedInsight,
    saveCachedInsight,
    expenseTotals,
    biggestExpenses,
    categoryTotals,
    spendingByBucket,
    accountTotals,
    fundsFlow,
    transferTotals
};
