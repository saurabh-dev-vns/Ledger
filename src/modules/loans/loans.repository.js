const pool = require('../../db/pool');

async function listAll(userId, client = pool) {
    const r = await client.query(
        `SELECT *
         FROM loans
         WHERE user_id=$1
         ORDER BY remaining_amount DESC,created_at DESC`,
        [userId]
    );

    return r.rows;
}

async function insert(userId, person, direction, amount, note, client = pool) {
    return client.query(
        `INSERT INTO loans(
            user_id,
            person,
            direction,
            original_amount,
            remaining_amount,
            note
        )
        VALUES($1,$2,$3,$4,$4,$5)`,
        [userId, person, direction, amount, note || null]
    );
}

async function applyRepayment(userId, id, amount, client) {
    const r = await client.query(
        `UPDATE loans
         SET remaining_amount=remaining_amount-$1,
             updated_at=NOW()
         WHERE id=$2
         AND user_id=$3
         AND remaining_amount >= $1
         RETURNING id`,
        [amount, id, userId]
    );

    return r.rowCount > 0;
}

module.exports = { listAll, insert, applyRepayment };
