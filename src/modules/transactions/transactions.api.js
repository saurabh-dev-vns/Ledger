const express = require('express');
const { route, ok } = require('../../api/http');
const service = require('./transactions.service');

const router = express.Router();

router.get('/transactions', route(async (req, res) => {
    const filters = {
        from: req.query.from || '',
        to: req.query.to || ''
    };

    ok(res, {
        transactions: await service.getTransactionFeed(req.session.userId, filters),
        filters
    });
}));

module.exports = router;
