const crypto = require('crypto');
const { findSessionUser } = require('../middleware/session');
const { route } = require('./http');

/** Like requireLogin, but answers 401 JSON instead of redirecting to /login. */
const requireApiLogin = route(async (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ ok: false, error: 'Please sign in.' });
    }

    const user = await findSessionUser(req);

    if (!user) {
        return req.session.destroy(() => res.status(401).json({ ok: false, error: 'Please sign in.' }));
    }

    req.session.userName = user.name;
    next();
});

/**
 * CSRF for the JSON API: every request that changes data must send the
 * session's token in the X-CSRF-Token header (get it from GET /api/session).
 */
function requireApiCsrf(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    const sent = Buffer.from(String(req.get('x-csrf-token') || ''));
    const expected = Buffer.from(String(req.session.csrfToken || ''));

    if (!sent.length || sent.length !== expected.length || !crypto.timingSafeEqual(sent, expected)) {
        return res.status(403).json({ ok: false, error: 'Your session expired. Reload the page and try again.' });
    }

    next();
}

/** Starts a fresh session for a user who just proved who they are (prevents session fixation) and returns the new CSRF token. */
function startSession(req, user) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(err => {
            if (err) return reject(err);

            req.session.userId = user.id;
            req.session.userName = user.name;
            req.session.csrfToken = crypto.randomBytes(32).toString('hex');
            resolve(req.session.csrfToken);
        });
    });
}

module.exports = { requireApiLogin, requireApiCsrf, startSession };
