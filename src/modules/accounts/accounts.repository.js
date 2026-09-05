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
        `SELECT type,balance,credit_limit
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

async function insertBalanceLog(userId, type, amount, note, client = pool) {
    await client.query(
        `INSERT INTO balance_log(user_id,type,amount,note)
         VALUES($1,$2,$3,$4)`,
        [userId, type, amount, note || null]
    );
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
    insertBalanceLog
};
