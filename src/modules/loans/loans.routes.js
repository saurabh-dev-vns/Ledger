const express = require('express');
const { checkCsrf, setFlash } = require('../../middleware/session');
const { money } = require('../../core/money');
const service = require('./loans.service');

const router = express.Router();

router.get('/loans', async (req, res, next) => {
    try {
        res.render('loans', {
            pageTitle: 'Money owed',
            loans: await service.getLoans(req.session.userId),
            money
        });
    } catch (e) {
        next(e);
    }
});

router.post('/loans', checkCsrf, async (req, res) => {
    try {
        await service.addLoan(
            req.session.userId,
            req.body.person,
            req.body.direction,
            parseFloat(req.body.amount),
            req.body.note
        );

        setFlash(req, 'Loan added.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/loans');
});

router.post('/loans/:id/repay', checkCsrf, async (req, res) => {
    try {
        await service.repayLoan(
            req.session.userId,
            req.params.id,
            parseFloat(req.body.amount)
        );

        setFlash(req, 'Repayment recorded.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/loans');
});

module.exports = router;
