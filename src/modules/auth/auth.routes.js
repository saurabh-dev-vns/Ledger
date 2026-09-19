const express = require('express');
const { redirectIfLoggedIn, setFlash, checkCsrf } = require('../../middleware/session');
const service = require('./auth.service');
const profileService = require('../profile/profile.service');
const { RESTORE_WINDOW_DAYS } = require('../profile/profile.constants');

const router = express.Router();

router.get('/register', redirectIfLoggedIn, (req, res) => {
    res.render('register', { pageTitle: 'Create account' });
});

router.post('/register', redirectIfLoggedIn, checkCsrf, async (req, res) => {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const confirm = req.body.confirm_password || '';

    try {
        const user = await service.register({ name, email, password, confirm });

        req.session.userId = user.id;
        req.session.userName = user.name;

        return res.redirect('/dashboard');
    } catch (err) {
        setFlash(req, err.message);
        return res.redirect('/register');
    }
});

router.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('login', { pageTitle: 'Sign in' });
});

router.post('/login', redirectIfLoggedIn, checkCsrf, async (req, res, next) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    try {
        const user = await service.login(email, password);

        if (!user) {
            setFlash(req, 'Incorrect email or password.');
            return res.redirect('/login');
        }

        if (user.pendingRestore) {
            // Correct credentials, but the account is soft-deleted and
            // still recoverable — hold off on a real login until they
            // explicitly confirm they want it back.
            req.session.pendingRestoreUserId = user.id;
            req.session.pendingRestoreName = user.name;
            req.session.pendingRestorePurgeAt = user.purgeAt.toISOString();

            return res.redirect('/restore-account');
        }

        req.session.userId = user.id;
        req.session.userName = user.name;
        return res.redirect('/dashboard');
    } catch (err) {
        next(err);
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

router.get('/restore-account', (req, res) => {
    if (!req.session.pendingRestoreUserId) {
        return res.redirect('/login');
    }

    res.render('restore_account', {
        pageTitle: 'Restore account',
        name: req.session.pendingRestoreName,
        purgeAt: req.session.pendingRestorePurgeAt,
        restoreWindowDays: RESTORE_WINDOW_DAYS
    });
});

router.post('/restore-account', checkCsrf, async (req, res, next) => {
    const userId = req.session.pendingRestoreUserId;

    if (!userId) {
        return res.redirect('/login');
    }

    try {
        await profileService.restoreAccount(userId);

        req.session.userId = userId;
        req.session.userName = req.session.pendingRestoreName;
        req.session.pendingRestoreUserId = null;
        req.session.pendingRestoreName = null;
        req.session.pendingRestorePurgeAt = null;

        setFlash(req, 'Welcome back — your account has been restored.', 'success');
        return res.redirect('/dashboard');
    } catch (err) {
        next(err);
    }
});

router.post('/restore-account/cancel', checkCsrf, (req, res) => {
    // Declining doesn't delete anything further — the account simply
    // stays soft-deleted and will be purged after the restore window.
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
