const express = require('express');
const env = require('../../config/env');
const service = require('./ai.service');

const router = express.Router();

// Per-user limit so one account cannot run up the API bill.
// In-memory: fine for a single server; use a shared store if you scale out.
const PER_MINUTE = 10;
const PER_DAY = 150;
const hits = new Map();

function allowed(userId) {
    const now = Date.now();
    const recent = (hits.get(userId) || []).filter(t => now - t < 24 * 60 * 60 * 1000);

    const lastMinute = recent.filter(t => now - t < 60 * 1000).length;

    if (lastMinute >= PER_MINUTE || recent.length >= PER_DAY) {
        hits.set(userId, recent);
        return false;
    }

    recent.push(now);
    hits.set(userId, recent);
    return true;
}

/**
 * Turns "kal 250 ka petrol Savings bank se" into suggested form values.
 * Never saves anything.
 */
router.post('/ai/parse-expense', async (req, res) => {
    const token = req.body.csrf_token;

    if (!token || token !== req.session.csrfToken) {
        return res.status(403).json({ ok: false, error: 'Your session expired. Reload the page and try again.' });
    }

    if (!service.isEnabled()) {
        return res.status(503).json({ ok: false, error: 'Natural-language entry is not set up on this server.' });
    }

    if (!allowed(req.session.userId)) {
        return res.status(429).json({ ok: false, error: 'You are going a bit fast. Wait a minute and try again.' });
    }

    try {
        const result = await service.parseExpenseText(req.session.userId, req.body.text, req.body.today);
        res.json({ ok: true, ...result });
    } catch (e) {
        if (e instanceof service.AiError) {
            // `detail` (Google's own error text) is only sent outside production, to help debugging.
            const body = { ok: false, error: e.message };
            if (!env.isProduction && e.detail) body.detail = e.detail;
            return res.status(e.status).json(body);
        }

        req.log && req.log.error({ err: e }, 'AI parse failed');
        res.status(500).json({ ok: false, error: 'Something went wrong. Please fill the form by hand.' });
    }
});

module.exports = router;
