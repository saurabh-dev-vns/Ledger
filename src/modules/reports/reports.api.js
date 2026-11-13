const express = require('express');
const { route, ApiError, ok } = require('../../api/http');
const accountsService = require('../accounts/accounts.service');
const { CATEGORIES } = require('../expenses/expenses.constants');
const { parseReportQuery, describeFilters } = require('./reports.filters');
const { getReport } = require('./reports.service');
const { buildReportWorkbook } = require('./reports.export');

const router = express.Router();

// The page shows at most this many rows. Totals and the category breakdown
// still cover every matching expense, and the Excel file has all rows.
const PAGE_LIMIT = 500;

async function readQuery(req) {
    const accounts = await accountsService.getAccounts(req.session.userId);

    const parsed = parseReportQuery(req.query, {
        today: new Date().toISOString().slice(0, 10),
        accountIds: accounts.map(a => String(a.id))
    });

    return { accounts, parsed };
}

router.get('/reports', route(async (req, res) => {
    const { accounts, parsed } = await readQuery(req);

    if (!parsed.ok) {
        return res.status(400).json({ ok: false, error: parsed.error, data: { form: parsed.form } });
    }

    const accountNames = new Map(accounts.map(a => [String(a.id), a.name]));

    ok(res, {
        form: parsed.form,
        period: parsed.period,
        categories: CATEGORIES,
        accounts,
        pageLimit: PAGE_LIMIT,
        activeFilters: describeFilters(parsed.filters, accountNames),
        report: await getReport(req.session.userId, parsed, { limit: PAGE_LIMIT })
    });
}));

/** The report (same period and filters) as an Excel (.xlsx) download. */
router.get('/reports/export', route(async (req, res) => {
    const { accounts, parsed } = await readQuery(req);

    if (!parsed.ok) throw new ApiError(400, parsed.error);

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
}));

module.exports = router;
