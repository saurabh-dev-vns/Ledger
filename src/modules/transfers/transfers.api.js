const express = require('express');
const { route, ok } = require('../../api/http');
const service = require('./transfers.service');

const router = express.Router();

router.post('/transfers', route(async (req, res) => {
    await service.transfer(
        req.session.userId,
        req.body.from_account_id,
        req.body.to_account_id,
        parseFloat(req.body.amount),
        String(req.body.note || '').trim() || null,
        req.body.from_part || null,
        req.body.to_part || null
    );

    ok(res, undefined, 'Money transferred successfully.', 201);
}));

module.exports = router;
