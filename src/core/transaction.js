const pool = require('../db/pool');

/**
 * Runs fn(client) inside a BEGIN/COMMIT block, rolling back on any
 * error. Used by any operation that touches more than one table (or
 * needs row locking) so the writes are atomic — e.g. debiting an
 * account and inserting an expense together.
 */
async function runInTransaction(fn) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const r = await fn(client);

        await client.query('COMMIT');

        return r;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    } finally {
        client.release();
    }
}

module.exports = { runInTransaction };
