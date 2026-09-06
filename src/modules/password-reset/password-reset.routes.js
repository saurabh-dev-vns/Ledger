const express = require('express');
const { redirectIfLoggedIn, checkCsrf, setFlash } = require('../../middleware/session');
const service = require('./password-reset.service');

const router = express.Router();

const GENERIC_REQUEST_MESSAGE =
    "If an account exists for that email, we've sent a 6-digit code. It expires in 10 minutes.";

router.get('/forgot-password', redirectIfLoggedIn, (req, res) => {
    res.render('forgot_password', { pageTitle: 'Forgot password' });
});

router.post('/forgot-password', redirectIfLoggedIn, checkCsrf, async (req, res) => {
    const email = (req.body.email || '').trim();

    try {
        await service.requestReset(email);
    } catch (e) {
        // Only a genuine infrastructure failure (e.g. Resend down) reaches
        // here — "email not found" is handled silently inside the service
        // so it never distinguishes itself from a successful request.
        console.error('Password reset request failed:', e);
    }

    setFlash(req, GENERIC_REQUEST_MESSAGE, 'success');
    res.redirect('/reset-password?email=' + encodeURIComponent(email));
});

router.get('/reset-password', redirectIfLoggedIn, (req, res) => {
    res.render('reset_password', {
        pageTitle: 'Reset password',
        email: req.query.email || ''
    });
});

router.post('/reset-password', redirectIfLoggedIn, checkCsrf, async (req, res) => {
    const email = (req.body.email || '').trim();

    try {
        await service.verifyAndReset(
            email,
            req.body.otp,
            req.body.new_password,
            req.body.confirm_password
        );

        setFlash(req, 'Password reset. Please sign in with your new password.', 'success');
        return res.redirect('/login');
    } catch (e) {
        setFlash(req, e.message);
        res.redirect('/reset-password?email=' + encodeURIComponent(email));
    }
});

module.exports = router;
