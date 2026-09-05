const { runInTransaction } = require('../../core/transaction');
const { round2, money } = require('../../core/money');
const accountsRepo = require('../accounts/accounts.repository');
const { isCreditType } = require('../accounts/accounts.constants');
const repo = require('./transfers.repository');

async function transfer(userId, fromId, toId, amount, note) {
    return runInTransaction(async client => {
        amount = round2(amount);

        if (!(amount > 0)) {
            throw new Error('Amount must be greater than zero.');
        }

        if (String(fromId) === String(toId)) {
            throw new Error('Choose two different accounts.');
        }

        // Check the destination's capacity *before* touching the source,
        // so a transfer that would overflow a credit limit is rejected
        // cleanly instead of debiting money that has nowhere to land.
        const toBefore = await accountsRepo.getAccountForUpdate(userId, toId, client);

        if (!toBefore) {
            throw new Error('Destination account not found.');
        }

        if (isCreditType(toBefore.type) && toBefore.credit_limit !== null) {
            const room = round2(Number(toBefore.credit_limit) - Number(toBefore.balance));

            if (amount > room) {
                throw new Error(
                    room > 0
                        ? `That account can accept at most ₹${money(room)} more before hitting its credit limit.`
                        : 'That account is already at its credit limit.'
                );
            }
        }

        const from = await accountsRepo.debitAccount(userId, fromId, amount, client);

        if (!from) {
            throw new Error('Source account not found or does not have enough balance.');
        }

        const to = await accountsRepo.creditAccountPlain(userId, toId, amount, client);

        await repo.insertTransfer(
            userId,
            from.type,
            to.type,
            amount,
            note,
            fromId,
            toId,
            client
        );
    });
}

async function getRecentTransfers(userId, limit = 8) {
    const safe = Math.max(1, Math.min(Number(limit) || 8, 100));
    const rows = await repo.listRecent(userId, safe);

    return rows.map(x => ({ ...x, amount: Number(x.amount) }));
}

async function getTransfersInRange(userId, filters = {}) {
    const rows = await repo.listInRange(userId, filters);
    return rows.map(x => ({ ...x, amount: Number(x.amount) }));
}

module.exports = { transfer, getRecentTransfers, getTransfersInRange };
