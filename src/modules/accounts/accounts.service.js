const { runInTransaction } = require('../../core/transaction');
const { round2 } = require('../../core/money');
const repo = require('./accounts.repository');
const { ACCOUNT_TYPES, isCreditType, isSavingsType, SAVINGS_PARTS, partLabel } = require('./accounts.constants');

function toNumberRow(x) {
    return {
        ...x,
        balance: Number(x.balance),
        credit_limit: x.credit_limit === null || x.credit_limit === undefined
            ? null
            : Number(x.credit_limit),
        cash_part: x.cash_part === null || x.cash_part === undefined ? null : Number(x.cash_part),
        bank_part: x.bank_part === null || x.bank_part === undefined ? null : Number(x.bank_part)
    };
}

async function getAccounts(userId) {
    await repo.ensureAccounts(userId);
    const rows = await repo.listAccounts(userId);
    return rows.map(toNumberRow);
}

/** Legacy summary used by a couple of older pages — cash/online totals only. */
async function getWallet(userId) {
    const accounts = await getAccounts(userId);

    return {
        cash_balance: accounts
            .filter(a => a.type === 'cash')
            .reduce((s, a) => s + a.balance, 0),

        online_balance: accounts
            .filter(a => a.type === 'online')
            .reduce((s, a) => s + a.balance, 0)
    };
}

async function ensureWallet(userId) {
    return repo.ensureAccounts(userId);
}

async function addAccount(userId, name, type, balance = 0, creditLimit = null, savingsOpening = {}) {
    return runInTransaction(async client => {
        name = String(name || '').trim();

        if (!name && isSavingsType(type)) {
            name = 'Savings';
        }

        if (!name) {
            throw new Error('Account name is required.');
        }

        if (!ACCOUNT_TYPES.includes(type)) {
            throw new Error('Invalid account type.');
        }

        let limit = null;

        if (isSavingsType(type)) {
            if (await repo.findSavingsAccount(userId, client)) {
                throw new Error('You already have a Savings account. Add money to its Cash or Bank part instead.');
            }

            const cash = round2(savingsOpening.cash || 0);
            const bank = round2(savingsOpening.bank || 0);

            if (cash < 0 || bank < 0) {
                throw new Error('Opening Cash and Bank amounts cannot be negative.');
            }

            return repo.insertAccount(userId, name, 'savings', round2(cash + bank), null, client, cash, bank);
        }

        if (isCreditType(type)) {
            limit = round2(creditLimit);

            if (!(limit > 0)) {
                throw new Error('Enter a credit limit greater than zero for a Credit Card / EMI account.');
            }

            // A new card/EMI account starts fully available — nothing
            // spent yet from Ledger's point of view. Any spending from
            // before you started using Ledger goes through Import history
            // instead, which doesn't touch this balance.
            balance = limit;
        } else {
            balance = round2(balance);

            if (balance < 0) {
                throw new Error('Opening balance cannot be negative.');
            }
        }

        return repo.insertAccount(userId, name, type, balance, limit, client);
    });
}

/**
 * Adds money to an account. For Cash/Bank/Online/Other this is a plain
 * top-up. For Credit Card/EMI accounts this represents a repayment:
 * the available amount is restored but capped at the credit limit, and
 * the "extra" (if the person repays more than they owed) isn't applied
 * anywhere since it came from outside the app.
 */
async function updateAccountBalance(userId, accountId, amount, note, part = null) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

        const before = await repo.getAccountForUpdate(userId, accountId, client);

        if (!before) {
            throw new Error('Account not found.');
        }

        const savings = isSavingsType(before.type);

        if (savings && !SAVINGS_PARTS.includes(part)) {
            throw new Error('Choose whether you are adding to Savings Cash or Savings Bank.');
        }

        const startingBalance = Number(before.balance);
        const capped = isCreditType(before.type) && before.credit_limit !== null;

        const after = capped
            ? await repo.creditAccountCapped(userId, accountId, amount, client)
            : await repo.creditAccountPlain(userId, accountId, amount, client, part);

        const newBalance = Number(after.balance);
        const applied = round2(newBalance - startingBalance);

        // Every addition is recorded, whatever the account type, so the
        // "Funds added" history can show when and where money went in.
        // A card/EMI repayment logs what was actually applied (it is
        // capped at the limit); if nothing was owed there is nothing to log.
        const logAmount = capped ? applied : amount;

        if (logAmount > 0) {
            await repo.insertBalanceLog(
                userId,
                accountId,
                after.type,
                logAmount,
                note,
                capped ? 'repayment' : 'topup',
                client,
                savings ? part : null
            );
        }

        return {
            accountName: before.name,
            part: savings ? part : null,
            type: after.type,
            balance: newBalance,
            creditLimit: after.credit_limit === null ? null : Number(after.credit_limit),
            applied,
            requested: amount
        };
    });
}

/** Funds-added history plus totals (overall and per account) for the filtered rows. */
async function getFundsAdded(userId, filters = {}) {
    const rows = (await repo.listBalanceLog(userId, filters)).map(r => ({
        ...r,
        amount: Number(r.amount)
    }));

    const total = rows.reduce((s, r) => s + r.amount, 0);

    const byAccount = [];
    for (const r of rows) {
        let entry = byAccount.find(x => x.name === r.account_name);
        if (!entry) {
            entry = { name: r.account_name, total: 0, count: 0 };
            byAccount.push(entry);
        }
        entry.total += r.amount;
        entry.count += 1;
    }
    byAccount.sort((a, b) => b.total - a.total);

    return { rows, total: round2(total), count: rows.length, byAccount };
}

async function getRecentFundsAdded(userId, limit = 5) {
    const rows = await repo.listBalanceLog(userId, { limit });
    return rows.map(r => ({ ...r, amount: Number(r.amount) }));
}

async function getAddedThisMonth(userId) {
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';
    return repo.sumBalanceLogSince(userId, monthStart);
}

/** Shifts money between the Cash and Bank parts of the Savings account. The total does not change. */
async function moveWithinSavings(userId, accountId, from, amount) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

        if (!SAVINGS_PARTS.includes(from)) {
            throw new Error('Choose which way to move the money.');
        }

        const row = await repo.moveWithinSavings(userId, accountId, from, amount, client);

        if (!row) {
            throw new Error(`Savings ${partLabel(from)} does not have enough to move that much.`);
        }

        return { amount, from, to: from === 'cash' ? 'bank' : 'cash' };
    });
}

module.exports = {
    moveWithinSavings,
    getFundsAdded,
    getRecentFundsAdded,
    getAddedThisMonth,
    getAccounts,
    getWallet,
    ensureWallet,
    addAccount,
    updateAccountBalance
};
