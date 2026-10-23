const express = require('express');
const { money } = require('../../core/money');
const { getMonthRange } = require('../../core/dates');
const { setFlash } = require('../../middleware/session');
const expensesService = require('../expenses/expenses.service');
const { buildReportWorkbook } = require('./reports.export');

const router = express.Router();

router.get('/reports', async (req, res, next) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        const userId = req.session.userId;

        const categories = await expensesService.getCategoryBreakdown(userId, month);
        const total = await expensesService.getMonthTotal(userId, month);
        const expenses = await expensesService.getAllExpenses(userId, getMonthRange(month));

        res.render('reports', {
            pageTitle: 'Reports',
            month,
            total,
            categories,
            expenses,
            money
        });
    } catch (e) {
        next(e);
    }
});

/** Downloads the selected month's report as an Excel (.xlsx) file. */
router.get('/reports/export', async (req, res, next) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        const userId = req.session.userId;

        let range;
        try {
            range = getMonthRange(month);
        } catch (e) {
            setFlash(req, 'Pick a valid month before downloading.');
            return res.redirect('/reports');
        }

        const [categories, total, expenses] = await Promise.all([
            expensesService.getCategoryBreakdown(userId, month),
            expensesService.getMonthTotal(userId, month),
            expensesService.getAllExpenses(userId, range)
        ]);

        const workbook = await buildReportWorkbook({ month, total, categories, expenses });
        const buffer = await workbook.xlsx.writeBuffer();

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="ledger-report-${month}.xlsx"`,
            'Content-Length': buffer.length,
            'Cache-Control': 'private, no-store'
        });

        res.send(Buffer.from(buffer));
    } catch (e) {
        next(e);
    }
});

module.exports = router;
