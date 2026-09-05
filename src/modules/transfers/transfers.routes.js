const express = require('express');
const { checkCsrf, setFlash } = require('../../middleware/session');
const { money } = require('../../core/money');
const accountsService = require('../accounts/accounts.service');
const service = require('./transfers.service');

const router = express.Router();

router.get('/swap-balance', async (req, res, next) => {
    try {
        res.render('swap_balance', {
            pageTitle: 'Transfer money',
            accounts: await accountsService.getAccounts(req.session.userId),
            wallet: await accountsService.getWallet(req.session.userId),
            money
        });
    } catch (e) {
        next(e);
    }
});

router.post('/swap-balance', checkCsrf, async (req, res) => {
    try {
        await service.transfer(
            req.session.userId,
            req.body.from_account_id,
            req.body.to_account_id,
            parseFloat(req.body.amount),
            (req.body.note || '').trim() || null
        );

        setFlash(req, 'Money transferred successfully.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/swap-balance');
});

module.exports = router;
