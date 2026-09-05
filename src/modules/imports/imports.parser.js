const { round2 } = require('../../core/money');

/**
 * Turns pasted text into rows of historical spending, one per line.
 * Accepted formats per line (comma-separated, or plain whitespace):
 *   2026-01-05, 250
 *   05-01-2026, 250, Groceries and auto fare
 *   05/01/2026 250
 * Blank lines are skipped. Returns { rows, errors } — rows is only
 * usable when errors is empty, so the caller can show every problem
 * at once instead of failing on the first bad line.
 */
function normalizeImportDate(raw) {
    const s = String(raw || '').trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // DD-MM-YYYY or DD/MM/YYYY
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        const [, d, mo, y] = m;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    return null;
}

function parseImportLines(text) {
    const lines = String(text || '').split('\n');
    const rows = [];
    const errors = [];

    lines.forEach((raw, idx) => {
        const line = raw.trim();
        if (!line) return;

        const lineNo = idx + 1;

        let parts = line.split(',').map(p => p.trim()).filter(p => p !== '');
        if (parts.length < 2) {
            parts = line.split(/\s+/).map(p => p.trim()).filter(p => p !== '');
        }

        if (parts.length < 2) {
            errors.push(`Line ${lineNo}: expected "date, amount" — got "${line}".`);
            return;
        }

        const [dateRaw, amountRaw, ...rest] = parts;
        const note = rest.join(' ').trim() || null;

        const date = normalizeImportDate(dateRaw);
        if (!date) {
            errors.push(`Line ${lineNo}: "${dateRaw}" isn't a date I understand (use YYYY-MM-DD or DD-MM-YYYY).`);
            return;
        }

        const amount = round2(parseFloat(amountRaw));
        if (!(amount > 0)) {
            errors.push(`Line ${lineNo}: "${amountRaw}" isn't a valid amount.`);
            return;
        }

        rows.push({ date, amount, note });
    });

    return { rows, errors };
}

module.exports = { parseImportLines, normalizeImportDate };
