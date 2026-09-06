const pool = require('../../db/pool');

async function insertOtp(userId, otpHash, expiresAt, client = pool) {
    const r = await client.query(
        `INSERT INTO password_resets(user_id, otp_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, otpHash, expiresAt]
    );

    return r.rows[0].id;
}

/** Invalidates any earlier unused codes so only the most recent one can ever succeed. */
async function invalidateActiveOtps(userId, client = pool) {
    await client.query(
        `UPDATE password_resets
         SET used = TRUE
         WHERE user_id = $1 AND used = FALSE`,
        [userId]
    );
}

/** Row-locks the most recent still-valid (unused, unexpired) OTP for this user, or null. */
async function findActiveOtpForUpdate(userId, client) {
    const r = await client.query(
        `SELECT id, otp_hash, expires_at, attempts
         FROM password_resets
         WHERE user_id = $1
           AND used = FALSE
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [userId]
    );

    return r.rows[0] || null;
}

async function incrementAttempts(id, client) {
    await client.query(
        'UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1',
        [id]
    );
}

async function markUsed(id, client) {
    await client.query(
        'UPDATE password_resets SET used = TRUE WHERE id = $1',
        [id]
    );
}

module.exports = {
    insertOtp,
    invalidateActiveOtps,
    findActiveOtpForUpdate,
    incrementAttempts,
    markUsed
};
