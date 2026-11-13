/**
 * JSON API, mounted at /api. Used by the Next.js frontend (web/) and, later,
 * the Flutter app. The old server-rendered pages keep working next to it.
 *
 * Rules for everything here:
 *  - Requests with a body are JSON, with the same field names the old HTML forms used.
 *  - Anything that changes data needs the X-CSRF-Token header (value from GET /api/session).
 *  - Signed-out requests to protected routes get 401 JSON, never a redirect.
 */
const express = require('express');
const { requireApiLogin, requireApiCsrf } = require('./middleware');
const { describeError } = require('./http');

const metaRoutes = require('./meta');
const authApi = require('../modules/auth/auth.api');
const passwordResetApi = require('../modules/password-reset/password-reset.api');
const dashboardApi = require('../modules/dashboard/dashboard.api');
const accountsApi = require('../modules/accounts/accounts.api');
const expensesApi = require('../modules/expenses/expenses.api');
const importsApi = require('../modules/imports/imports.api');
const transfersApi = require('../modules/transfers/transfers.api');
const budgetsApi = require('../modules/budgets/budgets.api');
const loansApi = require('../modules/loans/loans.api');
const transactionsApi = require('../modules/transactions/transactions.api');
const profileApi = require('../modules/profile/profile.api');
const reportsApi = require('../modules/reports/reports.api');
const aiRoutes = require('../modules/ai/ai.routes');
const insightsRoutes = require('../modules/insights/insights.routes');

const api = express.Router();

api.use(express.json({ limit: '100kb' }));
api.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
});
api.use(requireApiCsrf);

// Public: no sign-in needed.
api.use(metaRoutes);
api.use(authApi);
api.use(passwordResetApi);

// Everything below requires a signed-in user.
api.use(requireApiLogin);
api.use(dashboardApi);
api.use(accountsApi);
api.use(expensesApi);
api.use(importsApi);
api.use(transfersApi);
api.use(budgetsApi);
api.use(loansApi);
api.use(transactionsApi);
api.use(profileApi);
api.use(reportsApi);

// AI endpoints keep the { ok, ... } shape they already had and share the old
// routes' rate limiters (they also accept the CSRF token from the header).
api.post('/ai/parse-expense', aiRoutes.handlers.parseExpense);
api.get('/insights', insightsRoutes.handlers.insightsData);
api.post('/insights/ai', insightsRoutes.handlers.insightsAiText);

api.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Not found.' });
});

api.use((err, req, res, next) => {
    const { status, message } = describeError(err);

    if (status >= 500) (req.log || console).error({ err }, 'API request failed');
    if (res.headersSent) return next(err);

    res.status(status).json({ ok: false, error: message });
});

module.exports = api;
