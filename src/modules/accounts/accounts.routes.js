const express = require('express');
const { checkCsrf, setFlash } = require('../../middleware/session');
const { money } = require('../../core/money');
const service = require('./accounts.service');
const { ACCOUNT_TYPES, accountTypeLabel, isCreditType } = require('./accounts.constants');

const router = express.Router();

router.get('/add-balance', async (req, res, next) => {
    try {
        res.render('add_balance', {
            pageTitle: 'Add balance',
            wallet: await service.getWallet(req.session.userId),
            accounts: await service.getAccounts(req.session.userId),
            money
        });
    } catch (e) {
        next(e);
    }
});

router.post('/add-balance', checkCsrf, async (req, res) => {
    try {
        await service.updateAccountBalance(
            req.session.userId,
            req.body.account_id,
            parseFloat(req.body.amount),
            (req.body.note || '').trim() || null
        );

        setFlash(req, 'Balance updated successfully.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/add-balance');
});

router.get('/accounts', async (req, res, next) => {
    try {
        res.render('accounts', {
            pageTitle: 'Accounts',
            accounts: await service.getAccounts(req.session.userId),
            money,
            accountTypes: ACCOUNT_TYPES,
            accountTypeLabel,
            isCreditType
        });
    } catch (e) {
        next(e);
    }
});

router.post('/accounts', checkCsrf, async (req, res) => {
    try {
        await service.addAccount(
            req.session.userId,
            req.body.name,
            req.body.type,
            parseFloat(req.body.balance || 0),
            req.body.credit_limit ? parseFloat(req.body.credit_limit) : null
        );

        setFlash(req, 'Account created.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/accounts');
});

router.post('/accounts/:id/add', checkCsrf, async (req, res) => {
    try {
        const result = await service.updateAccountBalance(
            req.session.userId,
            req.params.id,
            parseFloat(req.body.amount),
            (req.body.note || '').trim() || null
        );

        if (isCreditType(result.type) && result.creditLimit !== null) {
            if (result.applied < result.requested) {
                setFlash(
                    req,
                    `Repaid ₹${money(result.applied)} — the rest wasn't owed, so available credit is now capped at the ₹${money(result.creditLimit)} limit.`,
                    'success'
                );
            } else {
                setFlash(req, `Repaid ₹${money(result.applied)}. Available credit is now ₹${money(result.balance)}.`, 'success');
            }
        } else {
            setFlash(req, 'Balance added.', 'success');
        }
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/accounts');
});

module.exports = router;
