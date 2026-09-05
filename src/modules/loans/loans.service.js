const { runInTransaction } = require('../../core/transaction');
const { round2 } = require('../../core/money');
const repo = require('./loans.repository');

async function getLoans(userId) {
    const rows = await repo.listAll(userId);

    return rows.map(x => ({
        ...x,
        original_amount: Number(x.original_amount),
        remaining_amount: Number(x.remaining_amount)
    }));
}

async function addLoan(userId, person, direction, amount, note) {
    amount = round2(amount);

    if (!person || !person.trim()) {
        throw new Error('Person is required.');
    }

    if (!['owed_to_me', 'i_owe'].includes(direction)) {
        throw new Error('Invalid loan direction.');
    }

    if (!(amount > 0)) {
        throw new Error('Amount must be greater than zero.');
    }

    return repo.insert(userId, person.trim(), direction, amount, note);
}

async function repayLoan(userId, id, amount) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

        const ok = await repo.applyRepayment(userId, id, amount, client);

        if (!ok) {
            throw new Error('Invalid repayment amount or loan not found.');
        }
    });
}

module.exports = { getLoans, addLoan, repayLoan };
