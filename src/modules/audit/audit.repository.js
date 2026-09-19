const pool = require('../../db/pool');

async function insert(userId, action, details, client = pool) {
    await client.query(
        `INSERT INTO audit_logs(user_id, action, details)
         VALUES ($1, $2, $3)`,
        [userId, action, details || null]
    );
}

async function listRecentForUser(userId, limit, client = pool) {
    const r = await client.query(
        `SELECT id, action, details, created_at
         FROM audit_logs
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [userId, limit]
    );

    return r.rows;
}

module.exports = { insert, listRecentForUser };
