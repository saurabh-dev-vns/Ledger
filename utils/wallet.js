const { pool } = require('../db/init');

const CATEGORIES = [
    'Food & Dining',
    'Transport',
    'Groceries',
    'Shopping',
    'Bills & Utilities',
    'Rent',
    'Entertainment',
    'Health',
    'Education',
    'Travel',
    'Other'
];

const ACCOUNT_TYPES = [
    'cash',
    'online',
    'bank',
    'credit',
    'other'
];

function money(n) {
    return Number(n || 0).toFixed(2);
}

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatDate(dateStr) {
    return dateStr ? String(dateStr).slice(0, 10) : '';
}

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

async function ensureAccounts(userId, client = pool) {
    await client.query(`
        INSERT INTO accounts(user_id,name,type,balance)
        VALUES ($1,'Cash','cash',0),($1,'Online','online',0)
        ON CONFLICT(user_id,name) DO NOTHING
    `, [userId]);
}

async function ensureWallet(userId, client = pool) {
    return ensureAccounts(userId, client);
}

async function getAccounts(userId) {
    await ensureAccounts(userId);

    const r = await pool.query(
        `SELECT id,name,type,balance,created_at
         FROM accounts
         WHERE user_id=$1
         ORDER BY CASE
             WHEN name='Cash' THEN 0
             WHEN name='Online' THEN 1
             ELSE 2
         END,name`,
        [userId]
    );

    return r.rows.map(x => ({
        ...x,
        balance: Number(x.balance)
    }));
}

async function getWallet(userId) {
    const accounts = await getAccounts(userId);

    return {
        cash_balance: accounts
            .filter(a => a.type === 'cash')
            .reduce((s, a) => s + a.balance, 0),

        online_balance: accounts
            .filter(a => a.type === 'online')
            .reduce((s, a) => s + a.balance, 0),
    };
}

async function addAccount(userId, name, type, balance = 0) {
    return runInTransaction(async client => {
        name = String(name || '').trim();
        balance = round2(balance);

        if (!name) {
            throw new Error('Account name is required.');
        }

        if (!ACCOUNT_TYPES.includes(type)) {
            throw new Error('Invalid account type.');
        }

        if (balance < 0) {
            throw new Error('Opening balance cannot be negative.');
        }

        const r = await client.query(
            `INSERT INTO accounts(user_id,name,type,balance)
             VALUES($1,$2,$3,$4)
             RETURNING id`,
            [userId, name, type, balance]
        );

        return r.rows[0].id;
    });
}

async function updateAccountBalance(userId, accountId, amount, note) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

        const r = await client.query(
            `UPDATE accounts
             SET balance=balance+$1
             WHERE id=$2 AND user_id=$3
             RETURNING type`,
            [amount, accountId, userId]
        );

        if (!r.rowCount) {
            throw new Error('Account not found.');
        }

        if (['cash', 'online'].includes(r.rows[0].type)) {
            await client.query(
                `INSERT INTO balance_log(user_id,type,amount,note)
                 VALUES($1,$2,$3,$4)`,
                [
                    userId,
                    r.rows[0].type,
                    amount,
                    note || null
                ]
            );
        }
    });
}

async function addBalance(userId, type, amount, note) {
    const accounts = await getAccounts(userId);

    const a = accounts.find(
        x => x.type === type && x.name.toLowerCase() === type
    );

    if (!a) {
        throw new Error(`Default ${type} account not found.`);
    }

    return updateAccountBalance(userId, a.id, amount, note);
}

async function swapBalance(userId, fromType, toType, amount, note) {
    const accounts = await getAccounts(userId);

    const from = accounts.find(
        a => a.type === fromType && a.name.toLowerCase() === fromType
    );

    const to = accounts.find(
        a => a.type === toType && a.name.toLowerCase() === toType
    );

    if (!from || !to) {
        throw new Error('Default wallet account not found.');
    }

    return transfer(userId, from.id, to.id, amount, note);
}

async function transfer(userId, fromId, toId, amount, note) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

        if (String(fromId) === String(toId)) {
            throw new Error('Choose two different accounts.');
        }

        const from = await client.query(
            `UPDATE accounts
             SET balance=balance-$1
             WHERE id=$2 AND user_id=$3 AND balance >= $1
             RETURNING name,type`,
            [amount, fromId, userId]
        );

        if (!from.rowCount) {
            throw new Error(
                'Source account not found or does not have enough balance.'
            );
        }

        const to = await client.query(
            `UPDATE accounts
             SET balance=balance+$1
             WHERE id=$2 AND user_id=$3
             RETURNING name,type`,
            [amount, toId, userId]
        );

        if (!to.rowCount) {
            throw new Error('Destination account not found.');
        }

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
            [
                userId,
                from.rows[0].type,
                to.rows[0].type,
                amount,
                note || null,
                fromId,
                toId
            ]
        );
    });
}

async function getRecentTransfers(userId, limit = 8) {
    const safe = Math.max(
        1,
        Math.min(Number(limit) || 8, 100)
    );

    const r = await pool.query(
        `SELECT wt.*,fa.name from_name,ta.name to_name
         FROM wallet_transfers wt
         LEFT JOIN accounts fa ON fa.id=wt.from_account_id
         LEFT JOIN accounts ta ON ta.id=wt.to_account_id
         WHERE wt.user_id=$1
         ORDER BY wt.created_at DESC,wt.id DESC
         LIMIT $2`,
        [userId, safe]
    );

    return r.rows.map(x => ({
        ...x,
        amount: Number(x.amount)
    }));
}

async function addExpense(
    userId,
    amount,
    notes,
    paymentMethod,
    category,
    spentOn,
    accountId = null
) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

        if (!CATEGORIES.includes(category)) {
            throw new Error('Invalid category.');
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
            throw new Error('Invalid expense date.');
        }

        await ensureAccounts(userId, client);

        let aid = accountId;

        if (!aid) {
            const r = await client.query(
                `SELECT id
                 FROM accounts
                 WHERE user_id=$1 AND type=$2
                 ORDER BY id
                 LIMIT 1`,
                [userId, paymentMethod]
            );

            aid = r.rows[0]?.id;
        }

        const debit = await client.query(
            `UPDATE accounts
             SET balance=balance-$1
             WHERE id=$2 AND user_id=$3 AND balance >= $1
             RETURNING type`,
            [amount, aid, userId]
        );

        if (!debit.rowCount) {
            throw new Error('That account does not have enough balance.');
        }

        await client.query(
            `INSERT INTO expenses(
                user_id,
                amount,
                notes,
                payment_method,
                category,
                spent_on,
                account_id
            )
            VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
                userId,
                amount,
                notes || null,
                debit.rows[0].type,
                category,
                spentOn,
                aid
            ]
        );
    });
}

async function deleteExpense(userId, id) {
    return runInTransaction(async client => {
        const r = await client.query(
            `SELECT amount,account_id,payment_method
             FROM expenses
             WHERE id=$1 AND user_id=$2
             FOR UPDATE`,
            [id, userId]
        );

        if (!r.rowCount) {
            return false;
        }

        let aid = r.rows[0].account_id;

        if (!aid) {
            const a = await client.query(
                `SELECT id
                 FROM accounts
                 WHERE user_id=$1 AND type=$2
                 ORDER BY id
                 LIMIT 1`,
                [userId, r.rows[0].payment_method]
            );

            aid = a.rows[0]?.id;
        }

        if (aid) {
            await client.query(
                `UPDATE accounts
                 SET balance=balance+$1
                 WHERE id=$2 AND user_id=$3`,
                [r.rows[0].amount, aid, userId]
            );
        }

        await client.query(
            `DELETE FROM expenses
             WHERE id=$1 AND user_id=$2`,
            [id, userId]
        );

        return true;
    });
}

async function getRecentExpenses(userId, limit = 10) {
    const safe = Math.max(
        1,
        Math.min(Number(limit) || 10, 100)
    );

    const r = await pool.query(
        `SELECT e.*,a.name account_name
         FROM expenses e
         LEFT JOIN accounts a ON a.id=e.account_id
         WHERE e.user_id=$1
         ORDER BY e.spent_on DESC,e.id DESC
         LIMIT $2`,
        [userId, safe]
    );

    return r.rows.map(x => ({
        ...x,
        amount: Number(x.amount)
    }));
}

async function getAllExpenses(userId, filters = {}) {
    let sql = `
        SELECT e.*,a.name account_name
        FROM expenses e
        LEFT JOIN accounts a ON a.id=e.account_id
        WHERE e.user_id=$1
    `;

    const p = [userId];

    if (filters.category) {
        p.push(filters.category);
        sql += ` AND e.category=$${p.length}`;
    }

    if (filters.method) {
        p.push(filters.method);
        sql += ` AND e.payment_method=$${p.length}`;
    }

    if (filters.from) {
        p.push(filters.from);
        sql += ` AND e.spent_on >= $${p.length}`;
    }

    if (filters.to) {
        p.push(filters.to);
        sql += ` AND e.spent_on <= $${p.length}`;
    }

    sql += ' ORDER BY e.spent_on DESC,e.id DESC';

    const r = await pool.query(sql, p);

    return r.rows.map(x => ({
        ...x,
        amount: Number(x.amount)
    }));
}

async function getMonthTotal(userId, month = null) {
    const m = month || new Date().toISOString().slice(0, 7);

    const r = await pool.query(
        `SELECT COALESCE(SUM(amount),0) total
         FROM expenses
         WHERE user_id=$1
         AND TO_CHAR(spent_on,'YYYY-MM')=$2`,
        [userId, m]
    );

    return Number(r.rows[0].total);
}

async function getCategoryBreakdown(userId, month = null) {
    const m = month || new Date().toISOString().slice(0, 7);

    const r = await pool.query(
        `SELECT category,SUM(amount) total
         FROM expenses
         WHERE user_id=$1
         AND TO_CHAR(spent_on,'YYYY-MM')=$2
         GROUP BY category
         ORDER BY total DESC`,
        [userId, m]
    );

    return r.rows.map(x => ({
        category: x.category,
        total: Number(x.total)
    }));
}

async function getMonthlyTrend(months = 6) {
    const result = await pool.query(
        `
            SELECT
                TO_CHAR(DATE_TRUNC('month', spent_on), 'YYYY-MM') AS month,
                COALESCE(SUM(amount), 0) AS total
            FROM expenses
            WHERE spent_on >= DATE_TRUNC(
                'month',
                CURRENT_DATE - (($1::int - 1) * INTERVAL '1 month')
            )
            GROUP BY DATE_TRUNC('month', spent_on)
            ORDER BY DATE_TRUNC('month', spent_on)
        `,
        [months]
    );

    return result.rows.map(row => ({
        month: row.month,
        total: Number(row.total)
    }));
}

async function getBudgets(userId, month) {
    const r = await pool.query(
        `SELECT b.*,COALESCE(SUM(e.amount),0) spent
         FROM budgets b
         LEFT JOIN expenses e
            ON e.user_id=b.user_id
            AND e.category=b.category
            AND TO_CHAR(e.spent_on,'YYYY-MM')=TO_CHAR(b.month,'YYYY-MM')
         WHERE b.user_id=$1
         AND TO_CHAR(b.month,'YYYY-MM')=$2
         GROUP BY b.id
         ORDER BY b.category`,
        [userId, month]
    );

    return r.rows.map(x => ({
        ...x,
        amount: Number(x.amount),
        spent: Number(x.spent)
    }));
}

async function upsertBudget(userId, category, month, amount) {
    amount = round2(amount);

    if (!CATEGORIES.includes(category)) {
        throw new Error('Invalid category.');
    }

    if (!(amount > 0)) {
        throw new Error('Budget must be greater than zero.');
    }

    return pool.query(
        `INSERT INTO budgets(user_id,category,month,amount)
         VALUES($1,$2,($3||'-01')::date,$4)
         ON CONFLICT(user_id,category,month)
         DO UPDATE SET amount=EXCLUDED.amount`,
        [userId, category, month, amount]
    );
}

async function deleteBudget(userId, id) {
    return pool.query(
        `DELETE FROM budgets
         WHERE id=$1 AND user_id=$2`,
        [id, userId]
    );
}

async function getLoans(userId) {
    const r = await pool.query(
        `SELECT *
         FROM loans
         WHERE user_id=$1
         ORDER BY remaining_amount DESC,created_at DESC`,
        [userId]
    );

    return r.rows.map(x => ({
        ...x,
        original_amount: Number(x.original_amount),
        remaining_amount: Number(x.remaining_amount)
    }));
}

async function addLoan(userId, person, direction, amount, note) {
    amount = round2(amount);

    if (!person.trim()) {
        throw new Error('Person is required.');
    }

    if (!['owed_to_me', 'i_owe'].includes(direction)) {
        throw new Error('Invalid loan direction.');
    }

    if (!(amount > 0)) {
        throw new Error('Amount must be greater than zero.');
    }

    return pool.query(
        `INSERT INTO loans(
            user_id,
            person,
            direction,
            original_amount,
            remaining_amount,
            note
        )
        VALUES($1,$2,$3,$4,$4,$5)`,
        [
            userId,
            person.trim(),
            direction,
            amount,
            note || null
        ]
    );
}

async function repayLoan(userId, id, amount) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

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

        if (!r.rowCount) {
            throw new Error(
                'Invalid repayment amount or loan not found.'
            );
        }
    });
}

async function getTransactionFeed(userId, filters = {}) {
    const expenses = await getAllExpenses(userId, filters);

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

    const transfers = (
        await pool.query(sql, p)
    ).rows.map(x => ({
        ...x,
        amount: Number(x.amount)
    }));

    return [
        ...expenses.map(x => ({
            ...x,
            kind: 'expense',
            date: x.spent_on
        })),

        ...transfers.map(x => ({
            ...x,
            kind: 'transfer',
            date: String(x.created_at).slice(0, 10)
        }))
    ].sort(
        (a, b) =>
            String(b.date).localeCompare(String(a.date))
    );
}

module.exports = {
    CATEGORIES,
    ACCOUNT_TYPES,
    money,
    formatDate,
    ensureWallet,
    getWallet,
    getAccounts,
    addAccount,
    updateAccountBalance,
    addBalance,
    swapBalance,
    transfer,
    getRecentTransfers,
    addExpense,
    deleteExpense,
    getRecentExpenses,
    getAllExpenses,
    getMonthTotal,
    getCategoryBreakdown,
    getMonthlyTrend,
    getBudgets,
    upsertBudget,
    deleteBudget,
    getLoans,
    addLoan,
    repayLoan,
    getTransactionFeed
};