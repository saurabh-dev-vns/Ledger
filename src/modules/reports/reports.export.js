const ExcelJS = require('exceljs');
const { partLabel } = require('../accounts/accounts.constants');

const RUPEE_FORMAT = '"₹"#,##0.00';
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4D3A' } };

function styleHeader(row) {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = HEADER_FILL;
    row.alignment = { vertical: 'middle' };
    row.height = 20;
}

function accountLabel(e) {
    if (e.account_name) {
        return e.savings_part ? `${e.account_name} (${partLabel(e.savings_part)})` : e.account_name;
    }

    return e.payment_method === 'imported' ? 'Imported (no account)' : e.payment_method || '';
}

/** "YYYY-MM-DD" (or a Date) -> a real Excel date so it can be sorted and filtered. */
function toExcelDate(value) {
    const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    return new Date(`${iso}T00:00:00Z`);
}

/**
 * Builds the monthly report workbook: Summary, Categories and Expenses
 * sheets. Amounts are numeric cells (not text) so they can be summed,
 * charted and filtered in Excel.
 */
async function buildReportWorkbook({ month, total, categories, expenses }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Ledger';
    wb.created = new Date();

    // ---- Summary ----
    const summary = wb.addWorksheet('Summary');
    summary.columns = [{ width: 24 }, { width: 22 }];

    summary.addRow(['Ledger — Monthly report']).font = { bold: true, size: 14 };
    summary.addRow([]);
    summary.addRow(['Month', month]);
    summary.addRow(['Total spent', Number(total)]).getCell(2).numFmt = RUPEE_FORMAT;
    summary.addRow(['Expense entries', expenses.length]);
    summary.addRow(['Categories', categories.length]);

    if (categories.length) {
        const top = categories.reduce((a, b) => (b.total > a.total ? b : a));
        summary.addRow(['Top category', `${top.category} (₹${top.total.toFixed(2)})`]);
    }

    summary.addRow(['Generated on', new Date().toISOString().slice(0, 10)]);
    summary.getColumn(1).font = { bold: true };

    // ---- Categories ----
    const cats = wb.addWorksheet('Categories');
    cats.columns = [
        { header: 'Category', key: 'category', width: 26 },
        { header: 'Total (₹)', key: 'total', width: 16, style: { numFmt: RUPEE_FORMAT } },
        { header: '% of month', key: 'share', width: 14, style: { numFmt: '0.0%' } }
    ];
    styleHeader(cats.getRow(1));

    const grand = categories.reduce((s, c) => s + c.total, 0);

    categories.forEach(c => {
        cats.addRow({
            category: c.category,
            total: c.total,
            share: grand ? c.total / grand : 0
        });
    });

    if (categories.length) {
        const last = categories.length + 1;
        const totalRow = cats.addRow({
            category: 'Total',
            total: { formula: `SUM(B2:B${last})`, result: grand },
            share: { formula: `SUM(C2:C${last})`, result: grand ? 1 : 0 }
        });
        totalRow.font = { bold: true };
    }

    cats.views = [{ state: 'frozen', ySplit: 1 }];

    // ---- Expenses ----
    const sheet = wb.addWorksheet('Expenses');
    sheet.columns = [
        { header: 'Date', key: 'date', width: 14, style: { numFmt: 'dd-mmm-yyyy' } },
        { header: 'Category', key: 'category', width: 22 },
        { header: 'Account', key: 'account', width: 22 },
        { header: 'Notes', key: 'notes', width: 40 },
        { header: 'Amount (₹)', key: 'amount', width: 16, style: { numFmt: RUPEE_FORMAT } }
    ];
    styleHeader(sheet.getRow(1));

    // Oldest first reads naturally in a spreadsheet.
    [...expenses]
        .sort((a, b) => String(a.spent_on).localeCompare(String(b.spent_on)) || a.id - b.id)
        .forEach(e => {
            sheet.addRow({
                date: toExcelDate(e.spent_on),
                category: e.category,
                account: accountLabel(e),
                notes: e.notes || '',
                amount: Number(e.amount)
            });
        });

    if (expenses.length) {
        const last = expenses.length + 1;
        const sum = expenses.reduce((s, e) => s + Number(e.amount), 0);
        const totalRow = sheet.addRow({
            category: 'Total',
            amount: { formula: `SUM(E2:E${last})`, result: sum }
        });
        totalRow.font = { bold: true };
        sheet.autoFilter = { from: 'A1', to: `E${last}` };
    }

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    return wb;
}

module.exports = { buildReportWorkbook };
