const express = require('express');
const { route, ApiError, ok } = require('../../api/http');
const { startSession } = require('../../api/middleware');
const { findSessionUser } = require('../../middleware/session');
const service = require('./auth.service');
const profileService = require('../profile/profile.service');
const { RESTORE_WINDOW_DAYS } = require('../profile/profile.constants');

const router = express.Router();

function pendingRestore(req) {
    if (!req.session.pendingRestoreUserId) return null;

    return {
        name: req.session.pendingRestoreName,
        purgeAt: req.session.pendingRestorePurgeAt,
        windowDays: RESTORE_WINDOW_DAYS
    };
}

/**
 * Who is signed in, plus the CSRF token to send as X-CSRF-Token on every
 * POST/PATCH/DELETE. The frontend calls this first on every page load.
 */
router.get('/session', route(async (req, res) => {
    const user = await findSessionUser(req);

    ok(res, {
        user: user ? { id: user.id, name: user.name } : null,
        csrfToken: req.session.csrfToken,
        pendingRestore: pendingRestore(req)
    });
}));

router.post('/auth/register', route(async (req, res) => {
    const user = await service.register({
        name: String(req.body.name || '').trim(),
        email: String(req.body.email || '').trim().toLowerCase(),
        password: req.body.password || '',
        confirm: req.body.confirm_password || ''
    });

    const csrfToken = await startSession(req, user);
    ok(res, { user: { id: user.id, name: user.name }, csrfToken }, undefined, 201);
}));

router.post('/auth/login', route(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await service.login(email, req.body.password || '');

    if (!user) throw new ApiError(401, 'Incorrect email or password.');

    if (user.pendingRestore) {
        // Correct credentials, but the account is soft-deleted and still
        // recoverable. Hold off on a real login until they confirm they want it back.
        req.session.pendingRestoreUserId = user.id;
        req.session.pendingRestoreName = user.name;
        req.session.pendingRestorePurgeAt = user.purgeAt.toISOString();

        return ok(res, { user: null, csrfToken: req.session.csrfToken, pendingRestore: pendingRestore(req) });
    }

    const csrfToken = await startSession(req, user);
    ok(res, { user: { id: user.id, name: user.name }, csrfToken, pendingRestore: null });
}));

router.post('/auth/logout', (req, res) => {
    req.session.destroy(() => ok(res));
});

router.post('/auth/restore-account', route(async (req, res) => {
    const userId = req.session.pendingRestoreUserId;
    if (!userId) throw new ApiError(400, 'There is no account waiting to be restored. Please sign in again.');

    const name = req.session.pendingRestoreName;
    await profileService.restoreAccount(userId);

    const csrfToken = await startSession(req, { id: userId, name });
    ok(res, { user: { id: userId, name }, csrfToken }, 'Welcome back - your account has been restored.');
}));

router.post('/auth/restore-account/cancel', (req, res) => {
    // Declining deletes nothing further: the account stays soft-deleted
    // and is purged after the restore window.
    req.session.destroy(() => ok(res));
});

module.exports = router;
