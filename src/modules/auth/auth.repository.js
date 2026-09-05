const pool = require('../../db/pool');

async function findByEmail(email, client = pool) {
    const r = await client.query(
        'SELECT id, name, email, password_hash FROM users WHERE email = $1',
        [email]
    );

    return r.rows[0] || null;
}

async function findById(id, client = pool) {
    const r = await client.query(
        'SELECT id, name, email FROM users WHERE id = $1',
        [id]
    );

    return r.rows[0] || null;
}

async function insertUser(name, email, passwordHash, client = pool) {
    const r = await client.query(
        'INSERT INTO users(name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name',
        [name, email, passwordHash]
    );

    return r.rows[0];
}

module.exports = { findByEmail, findById, insertUser };
