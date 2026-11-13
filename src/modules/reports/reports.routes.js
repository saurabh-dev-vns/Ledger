const express = require('express');
const { money } = require('../../core/money');
const accountsService = require('../accounts/accounts.service');
const { CATEGORIES } = require('../expenses/expenses.constants');
const { parseReportQuery, describeFilters } = require('./reports.filters');
const { getReport } = require('./reports.service');
const { buildReportWorkbook } = require('./reports.export');

const router = express.Router();

// The page shows at most this many rows. Totals and the category
// breakdown still cover every matching expense, and the Excel file has all rows.
const PAGE_LIMIT = 500;

/** Reads the URL once: the person's accounts (to check the account filter) and the checked query. */
async function readQuery(req) {
    const accounts = await accountsService.getAccounts(req.session.userId);

    const parsed = parseReportQuery(req.query, {
        today: new Date().toISOString().slice(0, 10),
        accountIds: accounts.map(a => String(a.id))
    });

    return { accounts, parsed };
}

router.get('/reports', async (req, res, next) => {
    try {
        const { accounts, parsed } = await readQuery(req);

        const view = {
            pageTitle: 'Reports',
            categoriesList: CATEGORIES,
            accounts,
            pageLimit: PAGE_LIMIT,
            form: parsed.form,
            error: null,
            report: null,
            parsed: null,
            activeFilters: [],
            money
        };

        if (!parsed.ok) {
            return res.status(400).render('reports', { ...view, error: parsed.error });
        }

        const accountNames = new Map(accounts.map(a => [String(a.id), a.name]));

        res.render('reports', {
            ...view,
            parsed,
            report: await getReport(req.session.userId, parsed, { limit: PAGE_LIMIT }),
            activeFilters: describeFilters(parsed.filters, accountNames)
        });
    } catch (e) {
        next(e);
    }
});

/** Downloads the report on screen (same period and filters) as an Excel (.xlsx) file. */
router.get('/reports/export', async (req, res, next) => {
    try {
        const { accounts, parsed } = await readQuery(req);

        if (!parsed.ok) {
            // The report page re-reads the same URL and shows the message next to the form.
            const query = req.originalUrl.split('?')[1];
            return res.redirect(query ? `/reports?${query}` : '/reports');
        }

        const report = await getReport(req.session.userId, parsed);
        const accountNames = new Map(accounts.map(a => [String(a.id), a.name]));
        const filters = describeFilters(parsed.filters, accountNames);

        const workbook = await buildReportWorkbook({
            month: parsed.period.month,
            period: parsed.period,
            filters,
            total: report.total,
            categories: report.categories,
            expenses: report.expenses
        });

        const buffer = await workbook.xlsx.writeBuffer();

        const base = parsed.period.mode === 'range'
            ? `${parsed.period.from}_to_${parsed.period.to}`
            : parsed.period.month;

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="ledger-report-${base}${filters.length ? '-filtered' : ''}.xlsx"`,
            'Content-Length': buffer.length,
            'Cache-Control': 'private, no-store'
        });

        res.send(Buffer.from(buffer));
    } catch (e) {
        next(e);
    }
});

module.exports = router;
