const express = require('express');
const { route, ok } = require('../../api/http');
const service = require('./loans.service');

const router = express.Router();

router.get('/loans', route(async (req, res) => {
    ok(res, { loans: await service.getLoans(req.session.userId) });
}));

router.post('/loans', route(async (req, res) => {
    await service.addLoan(
        req.session.userId,
        req.body.person,
        req.body.direction,
        parseFloat(req.body.amount),
        req.body.note
    );

    ok(res, undefined, 'Loan added.', 201);
}));

router.post('/loans/:id/repay', route(async (req, res) => {
    await service.repayLoan(req.session.userId, req.params.id, parseFloat(req.body.amount));
    ok(res, undefined, 'Repayment recorded.');
}));

module.exports = router;
