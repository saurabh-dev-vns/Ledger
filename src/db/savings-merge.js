/**
 * One-time data migration: collapse every pre-existing "savings"
 * account a user made (e.g. "Savings", "Savings Cash", "Savings Bank")
 * into the single Savings account that has a Cash part and a Bank part.
 *
 * What it does, per user, inside the caller's transaction:
 *   1. Finds that user's accounts of type cash/online/bank/other whose
 *      name contains "saving". (Credit/EMI accounts are never touched.)
 *   2. Works out which part each one belongs to:
 *        - name says "cash" -> Cash part        - name says "bank" -> Bank part
 *        - otherwise: type cash -> Cash part, anything else -> Bank part
 *   3. Keeps one of them (the one literally named "Savings", else the
 *      oldest) as the survivor, converts it to type "savings" and sets
 *      its Cash/Bank parts to the summed balances. Total money is
 *      unchanged.
 *   4. Re-points every expense, transfer and funds-added record that
 *      used the other accounts to the survivor (remembering the part),
 *      so no history is lost, and only then deletes the old accounts.
 */
const NAME_PATTERN = '%saving%';
const MERGEABLE_TYPES = ['cash', 'online', 'bank', 'other'];

function classify(account) {
    const name = String(account.name).toLowerCase();
    const mentionsCash = /\bcash\b/.test(name);
    const mentionsBank = /\bbank\b/.test(name);

    if (mentionsCash && !mentionsBank) return 'cash';
    if (mentionsBank && !mentionsCash) return 'bank';

    return account.type === 'cash' ? 'cash' : 'bank';
}

async function mergeForUser(client, userId) {
    const found = await client.query(
        `SELECT id, name, type, balance
         FROM accounts
         WHERE user_id = $1
           AND type = ANY($2)
           AND name ILIKE $3
         ORDER BY id
         FOR UPDATE`,
        [userId, MERGEABLE_TYPES, NAME_PATTERN]
    );

    if (!found.rows.length) return 0;

    const accounts = found.rows.map(a => ({ ...a, part: classify(a) }));
    const survivor =
        accounts.find(a => a.name.trim().toLowerCase() === 'savings') || accounts[0];

    // Non-survivors first; the survivor's own rows last and only where
    // no part has been assigned yet, so nothing gets overwritten.
    const ordered = [
        ...accounts.filter(a => a.id !== survivor.id),
        survivor
    ];

    for (const acc of ordered) {
        const unassigned = acc.id === survivor.id;

        await client.query(
            `UPDATE expenses
             SET account_id = $1, savings_part = $2, payment_method = 'savings'
             WHERE user_id = $3 AND account_id = $4
               AND ($5::boolean = FALSE OR savings_part IS NULL)`,
            [survivor.id, acc.part, userId, acc.id, unassigned]
        );

        await client.query(
            `UPDATE wallet_transfers
             SET from_account_id = $1, from_part = $2, from_type = 'savings'
             WHERE user_id = $3 AND from_account_id = $4
               AND ($5::boolean = FALSE OR from_part IS NULL)`,
            [survivor.id, acc.part, userId, acc.id, unassigned]
        );

        await client.query(
            `UPDATE wallet_transfers
             SET to_account_id = $1, to_part = $2, to_type = 'savings'
             WHERE user_id = $3 AND to_account_id = $4
               AND ($5::boolean = FALSE OR to_part IS NULL)`,
            [survivor.id, acc.part, userId, acc.id, unassigned]
        );

        await client.query(
            `UPDATE balance_log
             SET account_id = $1, part = $2, type = 'savings'
             WHERE user_id = $3 AND account_id = $4
               AND ($5::boolean = FALSE OR part IS NULL)`,
            [survivor.id, acc.part, userId, acc.id, unassigned]
        );
    }

    const others = accounts.filter(a => a.id !== survivor.id).map(a => a.id);

    if (others.length) {
        await client.query(
            'DELETE FROM accounts WHERE user_id = $1 AND id = ANY($2)',
            [userId, others]
        );
    }

    const sum = part => accounts
        .filter(a => a.part === part)
        .reduce((s, a) => s + Number(a.balance), 0)
        .toFixed(2);

    await client.query(
        `UPDATE accounts
         SET name = 'Savings',
             type = 'savings',
             credit_limit = NULL,
             cash_part = $2::numeric,
             bank_part = $3::numeric,
             balance = $2::numeric + $3::numeric
         WHERE id = $1`,
        [survivor.id, sum('cash'), sum('bank')]
    );

    return accounts.length;
}

/** Returns { users, accounts } counts. Safe to call on a database with nothing to merge. */
async function mergeLegacySavings(client) {
    const users = await client.query(
        `SELECT DISTINCT user_id
         FROM accounts
         WHERE type = ANY($1) AND name ILIKE $2`,
        [MERGEABLE_TYPES, NAME_PATTERN]
    );

    let merged = 0;

    for (const row of users.rows) {
        merged += await mergeForUser(client, row.user_id);
    }

    return { users: users.rows.length, accounts: merged };
}

module.exports = { mergeLegacySavings, classify };
