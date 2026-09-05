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

async function deleteUser(userId, client = pool) {
    // ON DELETE CASCADE on every user-owned table (accounts, expenses,
    // budgets, loans, wallet_transfers, balance_log) takes care of the
    // rest — deleting the user row is enough.
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
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
    deleteUser,
    getStats
};
