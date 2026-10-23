const express = require('express');
const { checkCsrf, setFlash } = require('../../middleware/session');
const { money, formatDate } = require('../../core/money');
const service = require('./accounts.service');
const { ACCOUNT_TYPES, accountTypeLabel, isCreditType, partLabel } = require('./accounts.constants');

const router = express.Router();

router.get('/add-balance', async (req, res, next) => {
    try {
        res.render('add_balance', {
            pageTitle: 'Add balance',
            wallet: await service.getWallet(req.session.userId),
            accounts: await service.getAccounts(req.session.userId),
            recentAdded: await service.getRecentFundsAdded(req.session.userId, 6),
            money
        });
    } catch (e) {
        next(e);
    }
});

/** History of every amount added: when it went in, which account, how much, and the note. */
router.get('/funds-added', async (req, res, next) => {
    try {
        const uid = req.session.userId;
        const filters = {
            from: req.query.from || '',
            to: req.query.to || '',
            accountId: /^\d+$/.test(req.query.account || '') ? req.query.account : ''
        };

        res.render('funds_added', {
            pageTitle: 'Funds added',
            accounts: await service.getAccounts(uid),
            history: await service.getFundsAdded(uid, filters),
            filters,
            money,
            formatDate
        });
    } catch (e) {
        next(e);
    }
});

router.post('/add-balance', checkCsrf, async (req, res) => {
    try {
        const result = await service.updateAccountBalance(
            req.session.userId,
            req.body.account_id,
            parseFloat(req.body.amount),
            (req.body.note || '').trim() || null,
            req.body.part || null
        );

        const where = result.part ? `${result.accountName} (${partLabel(result.part)})` : result.accountName;
        setFlash(req, `₹${money(result.applied)} added to ${where}.`, 'success');
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
            req.body.credit_limit ? parseFloat(req.body.credit_limit) : null,
            {
                cash: parseFloat(req.body.cash_opening || 0),
                bank: parseFloat(req.body.bank_opening || 0)
            }
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
            (req.body.note || '').trim() || null,
            req.body.part || null
        );

        if (result.part) {
            setFlash(req, `₹${money(result.applied)} added to Savings (${partLabel(result.part)}).`, 'success');
        } else if (isCreditType(result.type) && result.creditLimit !== null) {
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

/** Move money between the Cash and Bank parts of Savings (total stays the same). */
router.post('/accounts/:id/move', checkCsrf, async (req, res) => {
    try {
        const r = await service.moveWithinSavings(
            req.session.userId,
            req.params.id,
            req.body.from,
            parseFloat(req.body.amount)
        );

        setFlash(req, `Moved ₹${money(r.amount)} from Savings ${partLabel(r.from)} to ${partLabel(r.to)}.`, 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/accounts');
});

module.exports = router;
