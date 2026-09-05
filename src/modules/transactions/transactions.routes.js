const express = require('express');
const { money, formatDate } = require('../../core/money');
const service = require('./transactions.service');

const router = express.Router();

router.get('/transactions', async (req, res, next) => {
    try {
        const filters = {
            from: req.query.from || '',
            to: req.query.to || ''
        };

        res.render('transactions', {
            pageTitle: 'Transactions',
            transactions: await service.getTransactionFeed(req.session.userId, filters),
            filters,
            money,
            formatDate
        });
    } catch (e) {
        next(e);
    }
});

module.exports = router;
