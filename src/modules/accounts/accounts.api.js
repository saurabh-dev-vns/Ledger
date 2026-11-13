const express = require('express');
const { route, ok } = require('../../api/http');
const { money } = require('../../core/money');
const service = require('./accounts.service');
const { isCreditType, partLabel } = require('./accounts.constants');

const router = express.Router();

router.get('/accounts', route(async (req, res) => {
    const uid = req.session.userId;

    ok(res, {
        accounts: await service.getAccounts(uid),
        wallet: await service.getWallet(uid)
    });
}));

router.post('/accounts', route(async (req, res) => {
    await service.addAccount(
        req.session.userId,
        req.body.name,
        req.body.type,
        parseFloat(req.body.balance || 0),
        req.body.credit_limit ? parseFloat(req.body.credit_limit) : null,
        {
            cash: parseFloat(req.body.cash_opening || 0),
            bank: parseFloat(req.body.bank_opening || 0)
        }
    );

    ok(res, undefined, 'Account created.', 201);
}));

router.post('/accounts/:id/add', route(async (req, res) => {
    const result = await service.updateAccountBalance(
        req.session.userId,
        req.params.id,
        parseFloat(req.body.amount),
        String(req.body.note || '').trim() || null,
        req.body.part || null
    );

    let message;

    if (result.part) {
        message = `₹${money(result.applied)} added to Savings (${partLabel(result.part)}).`;
    } else if (isCreditType(result.type) && result.creditLimit !== null) {
        message = result.applied < result.requested
            ? `Repaid ₹${money(result.applied)} — the rest wasn't owed, so available credit is now capped at the ₹${money(result.creditLimit)} limit.`
            : `Repaid ₹${money(result.applied)}. Available credit is now ₹${money(result.balance)}.`;
    } else {
        message = 'Balance added.';
    }

    ok(res, result, message);
}));

/** Move money between the Cash and Bank parts of Savings (total stays the same). */
router.post('/accounts/:id/move', route(async (req, res) => {
    const r = await service.moveWithinSavings(
        req.session.userId,
        req.params.id,
        req.body.from,
        parseFloat(req.body.amount)
    );

    ok(res, r, `Moved ₹${money(r.amount)} from Savings ${partLabel(r.from)} to ${partLabel(r.to)}.`);
}));

/** History of every amount added: when it went in, which account, how much, and the note. */
router.get('/funds-added', route(async (req, res) => {
    const uid = req.session.userId;
    const filters = {
        from: req.query.from || '',
        to: req.query.to || '',
        accountId: /^\d+$/.test(req.query.account || '') ? req.query.account : ''
    };

    ok(res, {
        accounts: await service.getAccounts(uid),
        history: await service.getFundsAdded(uid, filters),
        filters
    });
}));

/** Add money to an account (the "Add balance" page). */
router.post('/funds-added', route(async (req, res) => {
    const result = await service.updateAccountBalance(
        req.session.userId,
        req.body.account_id,
        parseFloat(req.body.amount),
        String(req.body.note || '').trim() || null,
        req.body.part || null
    );

    const where = result.part ? `${result.accountName} (${partLabel(result.part)})` : result.accountName;
    ok(res, result, `₹${money(result.applied)} added to ${where}.`, 201);
}));

module.exports = router;
