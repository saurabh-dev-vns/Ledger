const pool = require('../../db/pool');

async function insertTransfer(userId, fromType, toType, amount, note, fromAccountId, toAccountId, client = pool) {
    await client.query(
        `INSERT INTO wallet_transfers(
            user_id,
            from_type,
            to_type,
            amount,
            note,
            from_account_id,
            to_account_id
        )
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [userId, fromType, toType, amount, note || null, fromAccountId, toAccountId]
    );
}

async function listRecent(userId, limit, client = pool) {
    const r = await client.query(
        `SELECT wt.*,fa.name from_name,ta.name to_name
         FROM wallet_transfers wt
         LEFT JOIN accounts fa ON fa.id=wt.from_account_id
         LEFT JOIN accounts ta ON ta.id=wt.to_account_id
         WHERE wt.user_id=$1
         ORDER BY wt.created_at DESC,wt.id DESC
         LIMIT $2`,
        [userId, limit]
    );

    return r.rows;
}

async function listInRange(userId, filters = {}, client = pool) {
    let sql = `
        SELECT wt.*,fa.name from_name,ta.name to_name
        FROM wallet_transfers wt
        LEFT JOIN accounts fa ON fa.id=wt.from_account_id
        LEFT JOIN accounts ta ON ta.id=wt.to_account_id
        WHERE wt.user_id=$1
    `;

    const p = [userId];

    if (filters.from) {
        p.push(filters.from);
        sql += ` AND wt.created_at::date >= $${p.length}`;
    }

    if (filters.to) {
        p.push(filters.to);
        sql += ` AND wt.created_at::date <= $${p.length}`;
    }

    sql += ' ORDER BY wt.created_at DESC';

    const r = await client.query(sql, p);
    return r.rows;
}

module.exports = { insertTransfer, listRecent, listInRange };
