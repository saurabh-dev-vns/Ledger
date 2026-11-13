const express = require('express');
const { money, formatDate } = require('../../core/money');
const { accountTypeLabel } = require('../accounts/accounts.constants');
const service = require('./dashboard.service');

const router = express.Router();

router.get('/dashboard', async (req, res, next) => {
    try {
        const data = await service.getDashboardData(req.session.userId);

        res.render('dashboard', {
            pageTitle: 'Dashboard',
            ...data,
            money,
            formatDate,
            accountTypeLabel
        });
    } catch (e) {
        next(e);
    }
});

module.exports = router;
