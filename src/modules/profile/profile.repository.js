const pool = require('../../db/pool');

async function findById(userId, client = pool) {
    const r = await client.query(
        'SELECT id, name, email, password_hash, created_at FROM users WHERE id = $1',
        [userId]
    );

    return r.rows[0] || null;
}

async function findByEmailExcludingUser(email, userId, client = pool) {
    const r = await client.query(
        'SELECT id FROM users WHERE email = $1 AND id <> $2',
        [email, userId]
    );

    return r.rows[0] || null;
}

async function updateNameAndEmail(userId, name, email, client = pool) {
    await client.query(
        'UPDATE users SET name = $1, email = $2 WHERE id = $3',
        [name, email, userId]
    );
}

async function updatePasswordHash(userId, passwordHash, client = pool) {
    await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, userId]
    );
}

async function softDeleteUser(userId, client = pool) {
    await client.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [userId]);
}

async function restoreUser(userId, client = pool) {
    await client.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [userId]);
}

/**
 * Permanently deletes any account whose soft-delete grace period has
 * expired. ON DELETE CASCADE on every user-owned table (accounts,
 * expenses, budgets, loans, wallet_transfers, balance_log,
 * password_resets) takes care of removing everything else.
 */
async function purgeExpired(graceDays, client = pool) {
    const r = await client.query(
        `DELETE FROM users
         WHERE deleted_at IS NOT NULL
         AND deleted_at < NOW() - make_interval(days => $1)
         RETURNING id`,
        [graceDays]
    );

    return r.rowCount;
}

async function getStats(userId, client = pool) {
    const r = await client.query(
        `SELECT
            (SELECT COUNT(*) FROM accounts WHERE user_id = $1) AS account_count,
            (SELECT COUNT(*) FROM expenses WHERE user_id = $1) AS expense_count,
            (SELECT COUNT(*) FROM loans WHERE user_id = $1) AS loan_count,
            (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = $1) AS total_spent`,
        [userId]
    );

    return r.rows[0];
}

module.exports = {
    findById,
    findByEmailExcludingUser,
    updateNameAndEmail,
    updatePasswordHash,
    softDeleteUser,
    restoreUser,
    purgeExpired,
    getStats
};
