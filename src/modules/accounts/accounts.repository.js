const pool = require('../../db/pool');
const { SAVINGS_PARTS } = require('./accounts.constants');

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
        `SELECT id,name,type,balance,credit_limit,cash_part,bank_part,created_at
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

async function insertAccount(userId, name, type, balance, creditLimit, client = pool, cashPart = null, bankPart = null) {
    const r = await client.query(
        `INSERT INTO accounts(user_id,name,type,balance,credit_limit,cash_part,bank_part)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [userId, name, type, balance, creditLimit, cashPart, bankPart]
    );

    return r.rows[0].id;
}

async function findSavingsAccount(userId, client = pool) {
    const r = await client.query(
        `SELECT id FROM accounts WHERE user_id=$1 AND type='savings' LIMIT 1`,
        [userId]
    );

    return r.rows[0] || null;
}

/** Row-locks and returns one account (type/balance/credit_limit), or null. */
async function getAccountForUpdate(userId, accountId, client) {
    const r = await client.query(
        `SELECT name,type,balance,credit_limit,cash_part,bank_part
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

const SAVINGS_RETURNING = 'RETURNING type,balance,credit_limit,cash_part,bank_part';

function requireSavingsPart(part, action) {
    if (!SAVINGS_PARTS.includes(part)) {
        throw new Error(`Choose whether ${action} Savings Cash or Savings Bank.`);
    }

    return part === 'cash' ? 'cash_part' : 'bank_part';
}

/**
 * Debits an account, but only if it has enough balance. Returns the
 * updated row, or null if insufficient. For a Savings account the
 * money must come from one specific part ("cash" or "bank").
 */
async function debitAccount(userId, accountId, amount, client, part = null) {
    const account = await getAccountForUpdate(userId, accountId, client);

    if (!account) return null;

    if (account.type === 'savings') {
        const col = requireSavingsPart(part, 'to take money from');

        const r = await client.query(
            `UPDATE accounts
             SET ${col}=${col}-$1, balance=balance-$1
             WHERE id=$2 AND user_id=$3 AND ${col} >= $1
             ${SAVINGS_RETURNING}`,
            [amount, accountId, userId]
        );

        return r.rows[0] || null;
    }

    const r = await client.query(
        `UPDATE accounts
         SET balance=balance-$1
         WHERE id=$2 AND user_id=$3 AND balance >= $1
         RETURNING type,balance,credit_limit`,
        [amount, accountId, userId]
    );

    return r.rows[0] || null;
}

/** Plain top-up: balance increases with no ceiling. For Savings, into the chosen part. */
async function creditAccountPlain(userId, accountId, amount, client, part = null) {
    const account = await getAccountForUpdate(userId, accountId, client);

    if (!account) return null;

    if (account.type === 'savings') {
        const col = requireSavingsPart(part, 'to add money to');

        const r = await client.query(
            `UPDATE accounts
             SET ${col}=${col}+$1, balance=balance+$1
             WHERE id=$2 AND user_id=$3
             ${SAVINGS_RETURNING}`,
            [amount, accountId, userId]
        );

        return r.rows[0] || null;
    }

    const r = await client.query(
        `UPDATE accounts
         SET balance=balance+$1
         WHERE id=$2 AND user_id=$3
         RETURNING type,balance,credit_limit`,
        [amount, accountId, userId]
    );

    return r.rows[0] || null;
}

/** Moves money between the Cash and Bank parts of a Savings account (total unchanged). Null if that part is short. */
async function moveWithinSavings(userId, accountId, from, amount, client) {
    const src = requireSavingsPart(from, 'to move money out of');
    const dst = src === 'cash_part' ? 'bank_part' : 'cash_part';

    const r = await client.query(
        `UPDATE accounts
         SET ${src}=${src}-$1, ${dst}=${dst}+$1
         WHERE id=$2 AND user_id=$3 AND type='savings' AND ${src} >= $1
         ${SAVINGS_RETURNING}`,
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
async function insertBalanceLog(userId, accountId, type, amount, note, kind = 'topup', client = pool, part = null) {
    await client.query(
        `INSERT INTO balance_log(user_id,account_id,type,amount,note,kind,part)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [userId, accountId, type, amount, note || null, kind, part]
    );
}

/**
 * Funds-added history, newest first. Optional filters: from/to (dates,
 * inclusive), accountId, and limit.
 */
async function listBalanceLog(userId, filters = {}, client = pool) {
    const params = [userId];
    let sql = `
        SELECT bl.id, bl.amount, bl.note, bl.kind, bl.part, bl.created_at,
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
    findSavingsAccount,
    moveWithinSavings,
    getAccountForUpdate,
    findFirstAccountByType,
    debitAccount,
    creditAccountPlain,
    creditAccountCapped,
    insertBalanceLog,
    listBalanceLog,
    sumBalanceLogSince
};
