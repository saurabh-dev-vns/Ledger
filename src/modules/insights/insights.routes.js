const express = require('express');
const { money } = require('../../core/money');
const aiService = require('../ai/ai.service');
const service = require('./insights.service');
const insightsAi = require('./insights.ai');
const { PERIODS, isPeriod } = require('./insights.periods');

const router = express.Router();

// Per-user limit on fresh AI calls so one account cannot run up the API bill.
// Cache hits do not count. In-memory: fine for a single server.
const PER_MINUTE = 6;
const PER_DAY = 100;
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

/** JSON that is safe to place inside a <script type="application/json"> tag. */
function safeJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

router.get('/insights', async (req, res, next) => {
    try {
        const period = isPeriod(req.query.period) ? req.query.period : 'month';
        const today = aiService.resolveToday(req.query.today);
        const data = await service.getInsightData(req.session.userId, period, today);

        res.render('insights', {
            pageTitle: 'Insights',
            period,
            periods: PERIODS,
            aiEnabled: aiService.isEnabled(),
            initialJson: safeJson({ data, insight: service.buildFallbackInsight(data) }),
            money
        });
    } catch (e) {
        next(e);
    }
});

/** All numbers and chart data for one period, plus the rule-based text. Read only. */
async function insightsData(req, res) {
    if (!isPeriod(req.query.period)) {
        return res.status(400).json({ ok: false, error: 'Choose day, week, month or year.' });
    }

    try {
        const today = aiService.resolveToday(req.query.today);
        const data = await service.getInsightData(req.session.userId, req.query.period, today);

        res.json({ ok: true, data, insight: service.buildFallbackInsight(data) });
    } catch (e) {
        req.log && req.log.error({ err: e }, 'Insights data failed');
        res.status(500).json({ ok: false, error: 'Could not load insights. Please try again.' });
    }
}

router.get('/insights/data', insightsData);

/** The written insight (AI when available, rules otherwise). Never changes user data. */
async function insightsAiText(req, res) {
    const token = req.body.csrf_token || req.get('x-csrf-token');

    if (!token || token !== req.session.csrfToken) {
        return res.status(403).json({ ok: false, error: 'Your session expired. Reload the page and try again.' });
    }

    if (!isPeriod(req.body.period)) {
        return res.status(400).json({ ok: false, error: 'Choose day, week, month or year.' });
    }

    try {
        const userId = req.session.userId;
        const today = aiService.resolveToday(req.body.today);
        const data = await service.getInsightData(userId, req.body.period, today);
        const result = await insightsAi.getAiInsight(userId, data, { allowAiCall: () => allowed(userId) });

        res.json({ ok: true, ...result });
    } catch (e) {
        req.log && req.log.error({ err: e }, 'Insight text failed');
        res.status(500).json({ ok: false, error: 'Could not write the insight. Please try again.' });
    }
}

router.post('/insights/ai', insightsAiText);

module.exports = router;
// Reused by the JSON API (src/api) so both share the same rate limiter.
module.exports.handlers = { insightsData, insightsAiText };
