const path = require('path');
const express = require('express');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./core/logger');
const redisClient = require('./db/redis');
const { locals, requireLogin } = require('./middleware/session');

const authRoutes = require('./modules/auth/auth.routes');
const passwordResetRoutes = require('./modules/password-reset/password-reset.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const accountsRoutes = require('./modules/accounts/accounts.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const importsRoutes = require('./modules/imports/imports.routes');
const transfersRoutes = require('./modules/transfers/transfers.routes');
const budgetsRoutes = require('./modules/budgets/budgets.routes');
const loansRoutes = require('./modules/loans/loans.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const transactionsRoutes = require('./modules/transactions/transactions.routes');
const profileRoutes = require('./modules/profile/profile.routes');

function createApp() {
    const app = express();

    app.set('trust proxy', 1);
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));

    // Logs one line per request (method, path, status, response time).
    // Attaches req.log so route handlers can log with the same request
    // context if needed. Cookies/authorization headers are redacted so
    // session tokens never end up in logs.
    app.use(pinoHttp({
        logger,
        redact: {
            paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
            censor: '[redacted]'
        },
        // Stamp userId on every request log so you can filter by user
        // in Datadog / Papertrail / any log aggregator without joining tables.
        customProps: (req) => ({
            userId: req.session?.userId ?? null
        }),
        // Quieter logs for static assets; everything else at its natural level.
        customLogLevel: (req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
        },
        autoLogging: {
            ignore: req => req.url.startsWith('/css/') || req.url.startsWith('/favicon')
        }
    }));

    app.use(express.urlencoded({ extended: false }));
    app.use(express.static(path.join(__dirname, '..', 'public')));

    app.use(session({
        store: new RedisStore({ client: redisClient }),
        secret: env.sessionSecret,
        resave: false,
        saveUninitialized: false,
        name: 'session',
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            httpOnly: true,
            sameSite: 'lax',
            secure: env.isProduction
        }
    }));

    app.use(locals);

    app.get('/', (req, res) => {
        res.redirect(req.session.userId ? '/dashboard' : '/login');
    });

    // Public: registration/login/logout/password-reset manage their own redirects.
    app.use('/', authRoutes);
    app.use('/', passwordResetRoutes);

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
    protectedRouter.use(profileRoutes);

    app.use('/', protectedRouter);

    app.use((req, res) => {
        res.status(404).render('404', { pageTitle: 'Not found' });
    });

    app.use((err, req, res, next) => {
        (req.log || logger).error({ err }, 'Unhandled request error');
        if (res.headersSent) return next(err);
        res.status(500).send('Something went wrong. Please try again.');
    });

    return app;
}

module.exports = { createApp };
