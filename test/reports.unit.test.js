/**
 * Unit tests for the Reports custom range and filters: parsing, the SQL
 * builder and the Excel summary. No database and no network.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/ledger_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const ExcelJS = require('exceljs');
const { isIsoDate, daysInclusive } = require('../src/core/dates');
const { parseReportQuery, describeFilters, MAX_SEARCH_LENGTH } = require('../src/modules/reports/reports.filters');
const { buildWhere, escapeLike } = require('../src/modules/reports/reports.repository');
const { buildReportWorkbook } = require('../src/modules/reports/reports.export');

const TODAY = '2026-11-12';
const ACCOUNTS = ['1', '2', '30'];
const parse = query => parseReportQuery(query, { today: TODAY, accountIds: ACCOUNTS });

// -------------------------------------------------------------- date helpers

test('isIsoDate accepts only real calendar dates', () => {
    assert.equal(isIsoDate('2026-11-12'), true);
    assert.equal(isIsoDate('2028-02-29'), true);
    assert.equal(isIsoDate('2026-02-29'), false);
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('2026-13-01'), false);
    assert.equal(isIsoDate('12-11-2026'), false);
    assert.equal(isIsoDate('2026-1-5'), false);
    assert.equal(isIsoDate(''), false);
    assert.equal(isIsoDate(null), false);
    assert.equal(isIsoDate(20261112), false);
});

test('daysInclusive counts both ends and crosses month and year edges', () => {
    assert.equal(daysInclusive('2026-11-12', '2026-11-12'), 1);
    assert.equal(daysInclusive('2026-11-01', '2026-11-30'), 30);
    assert.equal(daysInclusive('2026-12-31', '2027-01-01'), 2);
    assert.equal(daysInclusive('2028-02-01', '2028-03-01'), 30);
});

// ------------------------------------------------------------------- period

test('no query: this month, no filters', () => {
    const r = parse({});

    assert.equal(r.ok, true);
    assert.deepEqual(r.period, { mode: 'month', month: '2026-11', from: '2026-11-01', to: '2026-11-30', label: '2026-11' });
    assert.deepEqual(r.filters, { category: null, account: null, min: null, max: null, q: null });
    assert.equal(r.form.month, '2026-11');
});

test('a chosen month covers the whole month, including short months and leap years', () => {
    assert.deepEqual([parse({ month: '2026-02' }).period.from, parse({ month: '2026-02' }).period.to], ['2026-02-01', '2026-02-28']);
    assert.equal(parse({ month: '2028-02' }).period.to, '2028-02-29');
    assert.equal(parse({ month: '2026-04' }).period.to, '2026-04-30');
    assert.equal(parse({ month: '2026-12' }).period.to, '2026-12-31');
});

test('a bad month is refused, not guessed', () => {
    for (const month of ['2026-13', '2026-00', '2026-1', '26-11', 'abc', '2026/11', '2026-11-05']) {
        const r = parse({ month });

        assert.equal(r.ok, false, month);
        assert.equal(r.error, 'Pick a valid month.', month);
    }
});

test('a custom range is inclusive and beats the month field', () => {
    const r = parse({ month: '2026-01', from: '2026-10-15', to: '2026-11-05' });

    assert.equal(r.ok, true);
    assert.deepEqual(r.period, { mode: 'range', month: null, from: '2026-10-15', to: '2026-11-05', label: '2026-10-15 to 2026-11-05' });
});

test('a one-day range is allowed', () => {
    const r = parse({ from: '2026-11-12', to: '2026-11-12' });

    assert.equal(r.ok, true);
    assert.equal(r.period.from, r.period.to);
});

test('a range may cross a year and may be in the future', () => {
    assert.equal(parse({ from: '2025-12-20', to: '2026-01-10' }).ok, true);
    assert.equal(parse({ from: '2030-01-01', to: '2030-12-31' }).ok, true);
});

test('custom range problems each get a clear message', () => {
    assert.match(parse({ from: '2026-11-01' }).error, /both a From and a To/);
    assert.match(parse({ to: '2026-11-01' }).error, /both a From and a To/);
    assert.match(parse({ from: '2026-02-30', to: '2026-03-01' }).error, /valid From and To dates/);
    assert.match(parse({ from: 'yesterday', to: 'today' }).error, /valid From and To dates/);
    assert.match(parse({ from: '2026-11-10', to: '2026-11-09' }).error, /From date must be on or before/);
    assert.match(parse({ from: '2000-01-01', to: '2026-11-12' }).error, /10 years or less/);
});

test('the longest allowed range is accepted and one day more is refused', () => {
    assert.equal(parse({ from: '2016-01-01', to: '2025-12-31' }).ok, true);
    assert.equal(parse({ from: '2015-01-01', to: '2025-12-31' }).ok, false);
});

// ------------------------------------------------------------------ filters

test('category must be one of the app categories', () => {
    assert.equal(parse({ category: 'Food & Dining' }).filters.category, 'Food & Dining');
    assert.equal(parse({ category: '' }).filters.category, null);
    assert.equal(parse({ category: 'Nope' }).error, 'That category does not exist.');
    assert.equal(parse({ category: "Food' OR '1'='1" }).ok, false);
    assert.equal(parse({ category: 'food & dining' }).ok, false, 'case must match');
});

test('account must be one of the user\'s own accounts, or "none"', () => {
    assert.equal(parse({ account: '2' }).filters.account, '2');
    assert.equal(parse({ account: 'none' }).filters.account, 'none');
    assert.equal(parse({ account: '' }).filters.account, null);

    for (const account of ['99', '1 OR 1=1', '-1', '1.5', 'abc', '0x1']) {
        assert.equal(parse({ account }).error, 'That account was not found.', account);
    }
});

test('amounts: plain numbers only, zero allowed, min cannot beat max', () => {
    const ok = parse({ min: '100', max: '250.50' });
    assert.equal(ok.filters.min, 100);
    assert.equal(ok.filters.max, 250.5);

    assert.equal(parse({ min: '0' }).filters.min, 0);
    assert.equal(parse({ min: '' }).filters.min, null);
    assert.equal(parse({ min: '100', max: '100' }).ok, true);

    for (const bad of ['-5', 'abc', '1e3', '1,000', '12.345', '₹100', ' 1 2 ', '9999999999']) {
        assert.match(parse({ min: bad }).error, /Minimum amount must be a plain number/, bad);
        assert.match(parse({ max: bad }).error, /Maximum amount must be a plain number/, bad);
    }

    assert.match(parse({ min: '500', max: '100' }).error, /minimum amount is more than the maximum/);
});

test('search text is trimmed, cleaned and length-checked', () => {
    assert.equal(parse({ q: '  petrol   pump  ' }).filters.q, 'petrol pump');
    assert.equal(parse({ q: 'a\u0000b\nc' }).filters.q, 'a b c');
    assert.equal(parse({ q: '   ' }).filters.q, null);
    assert.equal(parse({ q: 'x'.repeat(MAX_SEARCH_LENGTH) }).ok, true);
    assert.match(parse({ q: 'x'.repeat(MAX_SEARCH_LENGTH + 1) }).error, /too long/);
});

test('arrays and objects in the URL cannot crash parsing or slip through', () => {
    assert.equal(parse({ category: ['Transport', 'Food & Dining'] }).filters.category, 'Transport');
    assert.equal(parse({ min: { a: '1' } }).filters.min, null);
    assert.equal(parse({ q: { $ne: 1 } }).filters.q, null);
    assert.equal(parse({ month: ['2026-03', '2026-04'] }).period.month, '2026-03');
    assert.equal(parse({ from: 20261112, to: 20261113 }).period.mode, 'month', 'non-strings are ignored');
    assert.equal(parse(undefined).ok, true);
});

test('a failed parse keeps what was typed so the form can show it again', () => {
    const r = parse({ month: '2026-13', category: 'Rent', q: 'rent' });

    assert.equal(r.ok, false);
    assert.equal(r.form.month, '2026-13');
    assert.equal(r.form.category, 'Rent');
    assert.equal(r.form.q, 'rent');
});

test('the first problem found is the one reported', () => {
    const r = parse({ from: '2026-11-10', to: '2026-11-09', category: 'Nope', min: 'x' });

    assert.match(r.error, /From date must be on or before/);
});

// ------------------------------------------------------------ describeFilters

test('describeFilters writes short labels only for filters that are on', () => {
    const names = new Map([['2', 'Cash']]);

    assert.deepEqual(describeFilters({ category: null, account: null, min: null, max: null, q: null }, names), []);

    assert.deepEqual(
        describeFilters({ category: 'Rent', account: '2', min: 100, max: 5000, q: 'flat' }, names),
        ['Category: Rent', 'Account: Cash', 'Amount: ₹100 to ₹5,000', 'Notes contain: flat']
    );

    assert.deepEqual(describeFilters({ category: null, account: null, min: 0, max: null, q: null }, names), ['Amount: at least ₹0']);
    assert.deepEqual(describeFilters({ category: null, account: null, min: null, max: 99.5, q: null }, names), ['Amount: at most ₹99.5']);
    assert.deepEqual(describeFilters({ category: null, account: 'none', min: null, max: null, q: null }, names), ['Account: no account (imported)']);
    assert.deepEqual(describeFilters({ category: null, account: '77', min: null, max: null, q: null }, names), ['Account: selected account']);
});

// -------------------------------------------------------------------- SQL

test('buildWhere: only the base conditions when no filter is set', () => {
    const { where, params } = buildWhere(7, { from: '2026-05-01', to: '2026-05-31' }, {});

    assert.equal(where, 'e.user_id=$1 AND e.spent_on BETWEEN $2 AND $3');
    assert.deepEqual(params, [7, '2026-05-01', '2026-05-31']);
});

test('buildWhere: every filter is a numbered parameter, never text in the SQL', () => {
    const evil = "x'; DROP TABLE expenses; --";
    const { where, params } = buildWhere(
        7,
        { from: '2026-05-01', to: '2026-05-31' },
        { category: 'Food & Dining', account: '3', min: 10, max: 99, q: evil }
    );

    assert.ok(!where.includes('DROP'));
    assert.ok(!where.includes('Food'));
    assert.match(where, /e\.category=\$4/);
    assert.match(where, /e\.account_id=\$5/);
    assert.match(where, /e\.amount >= \$6/);
    assert.match(where, /e\.amount <= \$7/);
    assert.match(where, /e\.notes ILIKE \$8 ESCAPE '\\'/);
    assert.deepEqual(params, [7, '2026-05-01', '2026-05-31', 'Food & Dining', '3', 10, 99, `%${evil}%`]);
});

test('buildWhere: a minimum of 0 is still applied, and "no account" adds no parameter', () => {
    const zero = buildWhere(1, { from: 'a', to: 'b' }, { min: 0 });
    assert.match(zero.where, /e\.amount >= \$4/);
    assert.deepEqual(zero.params.slice(3), [0]);

    const none = buildWhere(1, { from: 'a', to: 'b' }, { account: 'none' });
    assert.match(none.where, /e\.account_id IS NULL/);
    assert.equal(none.params.length, 3);
});

test('escapeLike makes wildcards match themselves', () => {
    assert.equal(escapeLike('100%'), '100\\%');
    assert.equal(escapeLike('a_b'), 'a\\_b');
    assert.equal(escapeLike('c:\\dir'), 'c:\\\\dir');
    assert.equal(escapeLike('plain'), 'plain');
});

// -------------------------------------------------------------------- Excel

const rows = [
    { id: 1, spent_on: '2026-05-02', category: 'Food & Dining', account_name: 'Cash', savings_part: null, payment_method: 'cash', notes: 'lunch', amount: 120 },
    { id: 2, spent_on: '2026-05-01', category: 'Transport', account_name: null, savings_part: null, payment_method: 'imported', notes: null, amount: 80.5 }
];
const cats = [{ category: 'Food & Dining', total: 120 }, { category: 'Transport', total: 80.5 }];

async function roundTrip(options) {
    const wb = await buildReportWorkbook(options);
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(await wb.xlsx.writeBuffer());
    return read;
}

test('workbook: classic monthly use is unchanged (Month row, month header)', async () => {
    const wb = await roundTrip({ month: '2026-05', total: 200.5, categories: cats, expenses: rows });
    const s = wb.getWorksheet('Summary');

    assert.match(String(s.getRow(1).getCell(1).value), /Monthly report/);
    assert.deepEqual([s.getRow(3).getCell(1).value, s.getRow(3).getCell(2).value], ['Month', '2026-05']);
    assert.equal(s.getRow(4).getCell(2).value, 200.5);
    assert.equal(wb.getWorksheet('Categories').getRow(1).getCell(3).value, '% of month');

    const labels = s.getColumn(1).values.map(String);
    assert.ok(!labels.includes('Filters'), 'no Filters row when none are set');
});

test('workbook: a custom range says Period and shows the filters that were applied', async () => {
    const wb = await roundTrip({
        month: null,
        period: { mode: 'range', label: '2026-05-01 to 2026-05-31' },
        filters: ['Category: Food & Dining', 'Notes contain: =SUM(1+1)'],
        total: 120,
        categories: [cats[0]],
        expenses: [rows[0]]
    });

    const s = wb.getWorksheet('Summary');
    assert.match(String(s.getRow(1).getCell(1).value), /Spending report/);
    assert.deepEqual([s.getRow(3).getCell(1).value, s.getRow(3).getCell(2).value], ['Period', '2026-05-01 to 2026-05-31']);
    assert.equal(s.getRow(4).getCell(2).value, 120, 'the total stays in row 4');

    let filtersCell = null;
    s.eachRow(r => { if (r.getCell(1).value === 'Filters') filtersCell = r.getCell(2).value; });
    assert.equal(filtersCell, 'Category: Food & Dining; Notes contain: =SUM(1+1)');
    assert.equal(typeof filtersCell, 'string', 'formula-looking text stays plain text');

    assert.equal(wb.getWorksheet('Categories').getRow(1).getCell(3).value, '% of period');
});

test('workbook: rows are oldest first, amounts are numbers, imported rows are labelled', async () => {
    const wb = await roundTrip({ month: '2026-05', total: 200.5, categories: cats, expenses: rows });
    const e = wb.getWorksheet('Expenses');

    assert.equal(e.rowCount, 4);
    assert.equal(e.getRow(2).getCell(2).value, 'Transport');
    assert.equal(e.getRow(2).getCell(3).value, 'Imported (no account)');
    assert.equal(typeof e.getRow(2).getCell(5).value, 'number');
    assert.equal(e.getRow(3).getCell(4).value, 'lunch');
    assert.equal(e.getRow(4).getCell(5).value.formula, 'SUM(E2:E3)');
});

test('workbook: an empty result is still a valid file', async () => {
    const wb = await roundTrip({
        period: { mode: 'range', label: '2026-05-01 to 2026-05-02' },
        filters: ['Category: Rent'],
        total: 0,
        categories: [],
        expenses: []
    });

    assert.deepEqual(wb.worksheets.map(w => w.name), ['Summary', 'Categories', 'Expenses']);
    assert.equal(wb.getWorksheet('Expenses').rowCount, 1);
});
