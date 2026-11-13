const express = require('express');
const { route, ok } = require('../../api/http');
const service = require('./dashboard.service');

const router = express.Router();

router.get('/dashboard', route(async (req, res) => {
    ok(res, await service.getDashboardData(req.session.userId));
}));

module.exports = router;
