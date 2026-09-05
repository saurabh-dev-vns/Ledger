const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const env = require('./config/env');
const { locals, requireLogin } = require('./middleware/session');

const authRoutes = require('./modules/auth/auth.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const accountsRoutes = require('./modules/accounts/accounts.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const importsRoutes = require('./modules/imports/imports.routes');
const transfersRoutes = require('./modules/transfers/transfers.routes');
const budgetsRoutes = require('./modules/budgets/budgets.routes');
const loansRoutes = require('./modules/loans/loans.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const transactionsRoutes = require('./modules/transactions/transactions.routes');

function createApp() {
    const app = express();

    app.set('trust proxy', 1);
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));

    app.use(express.urlencoded({ extended: false }));
    app.use(express.static(path.join(__dirname, '..', 'public')));

    app.use(cookieSession({
        name: 'session',
        keys: [env.sessionSecret],
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProduction
    }));

    app.use(locals);

    app.get('/', (req, res) => {
        res.redirect(req.session.userId ? '/dashboard' : '/login');
    });

    // Public: registration/login/logout manage their own redirects.
    app.use('/', authRoutes);

    // Everything below requires a signed-in user.
    const protectedRouter = express.Router();
    protectedRouter.use(requireLogin);
    protectedRouter.use(dashboardRoutes);
    protectedRouter.use(accountsRoutes);
    protectedRouter.use(expensesRoutes);
    protectedRouter.use(importsRoutes);
    protectedRouter.use(transfersRoutes);
    protectedRouter.use(budgetsRoutes);
    protectedRouter.use(loansRoutes);
    protectedRouter.use(reportsRoutes);
    protectedRouter.use(transactionsRoutes);

    app.use('/', protectedRouter);

    app.use((req, res) => {
        res.status(404).render('404', { pageTitle: 'Not found' });
    });

    app.use((err, req, res, next) => {
        console.error(err);
        if (res.headersSent) return next(err);
        res.status(500).send('Something went wrong. Please try again.');
    });

    return app;
}

module.exports = { createApp };
