const express = require('express');
const { route, ok } = require('../../api/http');
const service = require('./password-reset.service');

const router = express.Router();

const GENERIC_REQUEST_MESSAGE =
    "If an account exists for that email, we've sent a 6-digit code. It expires in 10 minutes.";

router.post('/auth/forgot-password', route(async (req, res) => {
    try {
        await service.requestReset(String(req.body.email || '').trim());
    } catch (e) {
        // Only a genuine infrastructure failure (e.g. email provider down)
        // reaches here. "Email not found" is handled silently inside the
        // service so it never differs from a successful request.
        req.log.error({ err: e }, 'Password reset request failed');
    }

    ok(res, undefined, GENERIC_REQUEST_MESSAGE);
}));

router.post('/auth/reset-password', route(async (req, res) => {
    await service.verifyAndReset(
        String(req.body.email || '').trim(),
        req.body.otp,
        req.body.new_password,
        req.body.confirm_password
    );

    ok(res, undefined, 'Password reset. Please sign in with your new password.');
}));

module.exports = router;
