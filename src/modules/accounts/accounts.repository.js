const pool = require('../../db/pool');

/** Every user always has a Cash and an Online account; this makes sure they exist. */
async function ensureAccounts(userId, client = pool) {
    await client.query(`
        INSERT INTO accounts(user_id,name,type,balance)
        VALUES ($1,'Cash','cash',0),($1,'Online','online',0)
        ON CONFLICT(user_id,name) DO NOTHING
    `, [userId]);
}

async function listAccounts(userId, client = pool) {
    const r = await client.query(
        `SELECT id,name,type,balance,credit_limit,created_at
         FROM accounts
         WHERE user_id=$1
         ORDER BY CASE
             WHEN name='Cash' THEN 0
             WHEN name='Online' THEN 1
             ELSE 2
         END,name`,
        [userId]
    );

    return r.rows;
}

async function insertAccount(userId, name, type, balance, creditLimit, client = pool) {
    const r = await client.query(
        `INSERT INTO accounts(user_id,name,type,balance,credit_limit)
         VALUES($1,$2,$3,$4,$5)
         RETURNING id`,
        [userId, name, type, balance, creditLimit]
    );

    return r.rows[0].id;
}

/** Row-locks and returns one account (type/balance/credit_limit), or null. */
async function getAccountForUpdate(userId, accountId, client) {
    const r = await client.query(
        `SELECT name,type,balance,credit_limit
         FROM accounts
         WHERE id=$1 AND user_id=$2
         FOR UPDATE`,
        [accountId, userId]
    );

    return r.rows[0] || null;
}

/** Used as a fallback when an operation is given a type instead of an account_id (legacy paths). */
async function findFirstAccountByType(userId, type, client = pool) {
    const r = await client.query(
        `SELECT id
         FROM accounts
         WHERE user_id=$1 AND type=$2
         ORDER BY id
         LIMIT 1`,
        [userId, type]
    );

    return r.rows[0]?.id || null;
}

/** Debits an account, but only if it has enough balance. Returns the updated row, or null if insufficient. */
async function debitAccount(userId, accountId, amount, client) {
    const r = await client.query(
        `UPDATE accounts
         SET balance=balance-$1
         WHERE id=$2 AND user_id=$3 AND balance >= $1
         RETURNING type,balance,credit_limit`,
        [amount, accountId, userId]
    );

    return r.rows[0] || null;
}

/** Plain top-up: balance increases with no ceiling (Cash/Bank/Online/Other). */
async function creditAccountPlain(userId, accountId, amount, client) {
    const r = await client.query(
        `UPDATE accounts
         SET balance=balance+$1
         WHERE id=$2 AND user_id=$3
         RETURNING type,balance,credit_limit`,
        [amount, accountId, userId]
    );

    return r.rows[0] || null;
}

/** Repayment/transfer-in for Credit Card / EMI accounts: capped so balance never exceeds credit_limit. */
async function creditAccountCapped(userId, accountId, amount, client) {
    const r = await client.query(
        `UPDATE accounts
         SET balance = LEAST(balance + $1, credit_limit)
         WHERE id=$2 AND user_id=$3
         RETURNING type,balance,credit_limit`,
        [amount, accountId, userId]
    );

    return r.rows[0] || null;
}

/** Records one "amount added" entry: which account, how much, when (created_at) and why (note). */
async function insertBalanceLog(userId, accountId, type, amount, note, kind = 'topup', client = pool) {
    await client.query(
        `INSERT INTO balance_log(user_id,account_id,type,amount,note,kind)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [userId, accountId, type, amount, note || null, kind]
    );
}

/**
 * Funds-added history, newest first. Optional filters: from/to (dates,
 * inclusive), accountId, and limit.
 */
async function listBalanceLog(userId, filters = {}, client = pool) {
    const params = [userId];
    let sql = `
        SELECT bl.id, bl.amount, bl.note, bl.kind, bl.created_at,
               bl.account_id, COALESCE(a.name, INITCAP(bl.type)) AS account_name,
               COALESCE(a.type, bl.type) AS account_type
        FROM balance_log bl
        LEFT JOIN accounts a ON a.id = bl.account_id
        WHERE bl.user_id = $1`;

    if (filters.from) {
        params.push(filters.from);
        sql += ` AND bl.created_at::date >= $${params.length}`;
    }

    if (filters.to) {
        params.push(filters.to);
        sql += ` AND bl.created_at::date <= $${params.length}`;
    }

    if (filters.accountId) {
        params.push(filters.accountId);
        sql += ` AND bl.account_id = $${params.length}`;
    }

    sql += ' ORDER BY bl.created_at DESC, bl.id DESC';

    if (filters.limit) {
        params.push(filters.limit);
        sql += ` LIMIT $${params.length}`;
    }

    const r = await client.query(sql, params);
    return r.rows;
}

/** Sum and count of everything added since a given date (used for "added this month"). */
async function sumBalanceLogSince(userId, sinceDate, client = pool) {
    const r = await client.query(
        `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
         FROM balance_log
         WHERE user_id=$1 AND created_at::date >= $2`,
        [userId, sinceDate]
    );

    return { total: Number(r.rows[0].total), count: Number(r.rows[0].count) };
}

module.exports = {
    ensureAccounts,
    listAccounts,
    insertAccount,
    getAccountForUpdate,
    findFirstAccountByType,
    debitAccount,
    creditAccountPlain,
    creditAccountCapped,
    insertBalanceLog,
    listBalanceLog,
    sumBalanceLogSince
};
