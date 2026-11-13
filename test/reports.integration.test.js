/**
 * Integration tests for the Reports custom range and filters: the REAL
 * Express app and a REAL PostgreSQL database. Dates are fixed, so these
 * never depend on the day they run.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DATABASE_URL = process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/ledger_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.LOG_LEVEL = 'silent';

const ExcelJS = require('exceljs');
const pool = require('../src/db/pool');
const { initSchema } = require('../src/db/schema');
const { createApp } = require('../src/app');
const authService = require('../src/modules/auth/auth.service');
const accountsService = require('../src/modules/accounts/accounts.service');
const { parseReportQuery } = require('../src/modules/reports/reports.filters');
const { getReport } = require('../src/modules/reports/reports.service');

let appServer, base;

before(async () => {
    await initSchema();
    appServer = http.createServer(createApp());
    await new Promise(r => appServer.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => {
    appServer.close();
    await pool.end();
});

class Client {
    constructor() { this.cookies = new Map(); }

    async req(path) {
        const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(base + path, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });

        for (const c of res.headers.getSetCookie()) {
            const pair = c.split(';')[0];
            const i = pair.indexOf('=');
            this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
        }

        return res;
    }

    async post(path, form) {
        const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(base + path, {
            method: 'POST',
            redirect: 'manual',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
            body: new URLSearchParams(form)
        });

        for (const c of res.headers.getSetCookie()) {
            const pair = c.split(';')[0];
            const i = pair.indexOf('=');
            this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
        }

        return res;
    }

    async page(path) {
        const res = await this.req(path);
        return { status: res.status, html: await res.text(), res };
    }

    async xlsx(path) {
        const res = await this.req(path);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
        return { status: res.status, res, wb };
    }
}

let counter = 0;

async function newUser() {
    const email = `reports-${Date.now()}-${++counter}@example.com`;
    const user = await authService.register({ name: 'Report Tester', email, password: 'password1', confirm: 'password1' });
    const accounts = await accountsService.getAccounts(user.id);
    const ids = {
        cash: String(accounts.find(a => a.name === 'Cash').id),
        online: String(accounts.find(a => a.name === 'Online').id)
    };

    const client = new Client();
    const loginPage = (await (await client.req('/login')).text()).replace(/\s+/g, ' ');
    const token = loginPage.match(/name="csrf_token" value="([^"]+)"/)[1];
    const login = await client.post('/login', { csrf_token: token, email, password: 'password1' });
    assert.equal(login.status, 302);

    return { user, ids, client };
}

async function spend(userId, accountId, amount, category, date, notes = null, method = 'cash') {
    await pool.query(
        `INSERT INTO expenses(user_id, amount, notes, payment_method, category, spent_on, account_id)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [userId, amount, notes, method, category, date, accountId]
    );
}

/** One user with a known set of expenses, plus a second user whose data must never show up. */
async function seed() {
    const me = await newUser();
    const other = await newUser();
    const { user, ids } = me;

    await spend(user.id, ids.cash, 100, 'Food & Dining', '2026-04-30', 'Petrol for bike');           // A
    await spend(user.id, ids.online, 250, 'Transport', '2026-05-01', 'petrol pump', 'online');       // B
    await spend(user.id, ids.cash, 999.5, 'Shopping', '2026-05-15', '100% cotton shirt');            // C
    await spend(user.id, ids.cash, 40, 'Food & Dining', '2026-05-31', 'abc_def lunch');              // D
    await spend(user.id, ids.cash, 70, 'Transport', '2026-06-01', null);                             // E
    await spend(user.id, null, 500, 'Other', '2026-05-10', 'old import', 'imported');                // F (no account)
    await spend(user.id, ids.cash, 5, 'Groceries', '2026-05-20', "'; DROP TABLE expenses; --");      // G

    await spend(other.user.id, other.ids.cash, 12345, 'Food & Dining', '2026-05-12', 'Petrol secret');

    return { ...me, other };
}

async function report(ctx, query, limit = null) {
    const accounts = await accountsService.getAccounts(ctx.user.id);
    const parsed = parseReportQuery(query, { today: '2026-11-12', accountIds: accounts.map(a => String(a.id)) });
    assert.equal(parsed.ok, true, parsed.error);
    return getReport(ctx.user.id, parsed, { limit });
}

const notesOf = r => r.expenses.map(e => e.notes);
const amountsOf = r => r.expenses.map(e => e.amount);
const dataRows = html => (html.match(/<td class="col-date">/g) || []).length;

// ------------------------------------------------------------------ access

test('both report routes need a login', async () => {
    const anon = new Client();

    for (const path of ['/reports', '/reports/export', '/reports?from=2026-05-01&to=2026-05-31']) {
        const res = await anon.req(path);
        assert.equal(res.status, 302, path);
        assert.match(res.headers.get('location'), /login/);
    }
});

// ------------------------------------------------------------ date ranges

test('range: both end dates are included, days outside are not', async () => {
    const ctx = await seed();
    const r = await report(ctx, { from: '2026-05-01', to: '2026-05-31' });

    assert.equal(r.count, 5, 'B, C, D, F, G');
    assert.equal(r.total, 1794.5);
    assert.ok(!notesOf(r).includes('Petrol for bike'), '30 April is out');
    assert.ok(notesOf(r).includes('petrol pump'), '1 May is in');
    assert.ok(notesOf(r).includes('abc_def lunch'), '31 May is in');
});

test('range: a single day returns just that day', async () => {
    const ctx = await seed();

    assert.deepEqual(amountsOf(await report(ctx, { from: '2026-05-15', to: '2026-05-15' })), [999.5]);
    assert.equal((await report(ctx, { from: '2026-05-02', to: '2026-05-02' })).count, 0);
});

test('range: it can cross a month boundary freely', async () => {
    const ctx = await seed();
    const r = await report(ctx, { from: '2026-04-30', to: '2026-06-01' });

    assert.equal(r.count, 7);
    assert.equal(r.total, 1964.5);
    assert.deepEqual(r.expenses.map(e => e.spent_on), [
        '2026-06-01', '2026-05-31', '2026-05-20', '2026-05-15', '2026-05-10', '2026-05-01', '2026-04-30'
    ], 'newest first');
});

test('range: a month picked the old way gives the same answer as the matching range', async () => {
    const ctx = await seed();
    const month = await report(ctx, { month: '2026-05' });
    const range = await report(ctx, { from: '2026-05-01', to: '2026-05-31' });

    assert.equal(month.total, range.total);
    assert.equal(month.count, range.count);
    assert.deepEqual(notesOf(month), notesOf(range));
});

test('range: a range with no spending is empty, not an error', async () => {
    const ctx = await seed();
    const r = await report(ctx, { from: '2020-01-01', to: '2020-01-31' });

    assert.deepEqual([r.total, r.count, r.categories.length, r.expenses.length], [0, 0, 0, 0]);
});

// ---------------------------------------------------------------- filters

test('filter: category', async () => {
    const ctx = await seed();
    const r = await report(ctx, { from: '2026-04-30', to: '2026-06-01', category: 'Food & Dining' });

    assert.deepEqual(amountsOf(r).sort((a, b) => a - b), [40, 100]);
    assert.equal(r.total, 140);
    assert.deepEqual(r.categories, [{ category: 'Food & Dining', total: 140 }]);
});

test('filter: account, and "no account" for imported rows', async () => {
    const ctx = await seed();
    const wide = { from: '2026-04-30', to: '2026-06-01' };

    const cash = await report(ctx, { ...wide, account: ctx.ids.cash });
    assert.equal(cash.count, 5, 'A, C, D, E, G are cash');
    assert.ok(!notesOf(cash).includes('petrol pump'));
    assert.ok(!notesOf(cash).includes('old import'));

    const online = await report(ctx, { ...wide, account: ctx.ids.online });
    assert.deepEqual(amountsOf(online), [250]);

    const none = await report(ctx, { ...wide, account: 'none' });
    assert.deepEqual(amountsOf(none), [500]);
    assert.equal(none.expenses[0].account_name, null);
});

test('filter: amount range includes both ends', async () => {
    const ctx = await seed();
    const wide = { from: '2026-04-30', to: '2026-06-01' };

    assert.deepEqual(amountsOf(await report(ctx, { ...wide, min: '100', max: '500' })).sort((a, b) => a - b), [100, 250, 500]);
    assert.deepEqual(amountsOf(await report(ctx, { ...wide, max: '40' })).sort((a, b) => a - b), [5, 40]);
    assert.deepEqual(amountsOf(await report(ctx, { ...wide, min: '999.5' })), [999.5]);
    assert.equal((await report(ctx, { ...wide, min: '0' })).count, 7, 'a minimum of 0 keeps everything');
    assert.equal((await report(ctx, { ...wide, min: '600', max: '700' })).count, 0);
});

test('filter: notes search ignores case and finds part of a word', async () => {
    const ctx = await seed();
    const wide = { from: '2026-04-30', to: '2026-06-01' };

    for (const q of ['petrol', 'PETROL', 'PeTrOl']) {
        assert.deepEqual(notesOf(await report(ctx, { ...wide, q })).sort(), ['Petrol for bike', 'petrol pump'], q);
    }

    assert.deepEqual(notesOf(await report(ctx, { ...wide, q: 'ump' })), ['petrol pump']);
});

test('filter: % and _ in the search text match themselves, not "anything"', async () => {
    const ctx = await seed();
    const wide = { from: '2026-04-30', to: '2026-06-01' };

    assert.deepEqual(notesOf(await report(ctx, { ...wide, q: '%' })), ['100% cotton shirt']);
    assert.deepEqual(notesOf(await report(ctx, { ...wide, q: '_' })), ['abc_def lunch']);
    assert.equal((await report(ctx, { ...wide, q: 'c_d' })).count, 1, '"c_d" is really in "abc_def"');
    assert.equal((await report(ctx, { ...wide, q: 'a_c' })).count, 0, '"a_c" must not act like "abc"');
    assert.equal((await report(ctx, { ...wide, q: '1%t' })).count, 0, '"1%t" must not act like "100% cot"');
    assert.equal((await report(ctx, { ...wide, q: '\\' })).count, 0, 'a backslash is just a character');
});

test('filter: SQL injection in the search text is harmless', async () => {
    const ctx = await seed();
    const r = await report(ctx, { from: '2026-05-01', to: '2026-05-31', q: "'; DROP TABLE expenses; --" });

    assert.equal(r.count, 1, 'it only matches the note that holds exactly that text');

    const still = await pool.query('SELECT COUNT(*)::int AS n FROM expenses WHERE user_id=$1', [ctx.user.id]);
    assert.equal(still.rows[0].n, 7, 'the table and its rows are untouched');
});

test('filter: all filters together work as AND', async () => {
    const ctx = await seed();
    const r = await report(ctx, {
        from: '2026-04-30', to: '2026-06-01',
        category: 'Food & Dining', account: ctx.ids.cash, max: '50', q: 'LUNCH'
    });

    assert.deepEqual(notesOf(r), ['abc_def lunch']);
    assert.equal(r.total, 40);
});

test('filter: total, category breakdown and rows always agree', async () => {
    const ctx = await seed();

    for (const query of [
        { from: '2026-04-30', to: '2026-06-01' },
        { from: '2026-05-01', to: '2026-05-31', min: '10' },
        { month: '2026-05', q: 'a' },
        { from: '2026-04-30', to: '2026-06-01', account: ctx.ids.cash, max: '300' }
    ]) {
        const r = await report(ctx, query);
        const rowSum = Math.round(r.expenses.reduce((s, e) => s + e.amount, 0) * 100) / 100;
        const catSum = Math.round(r.categories.reduce((s, c) => s + c.total, 0) * 100) / 100;

        assert.equal(r.total, rowSum, JSON.stringify(query));
        assert.equal(r.total, catSum, JSON.stringify(query));
        assert.equal(r.count, r.expenses.length, JSON.stringify(query));
    }
});

test('limit: the total and breakdown still cover every match when only some rows are returned', async () => {
    const ctx = await seed();
    const r = await report(ctx, { from: '2026-04-30', to: '2026-06-01' }, 2);

    assert.equal(r.expenses.length, 2);
    assert.equal(r.count, 7);
    assert.equal(r.total, 1964.5);
    assert.equal(r.truncated, true);
    assert.equal((await report(ctx, { from: '2026-04-30', to: '2026-06-01' }, 7)).truncated, false);
});

test('isolation: another user\'s expenses never appear, even when they match every filter', async () => {
    const ctx = await seed();
    const mine = await report(ctx, { from: '2026-05-01', to: '2026-05-31', q: 'petrol' });

    assert.deepEqual(notesOf(mine), ['petrol pump']);
    assert.ok(!amountsOf(mine).includes(12345));

    const theirs = await report(ctx.other, { from: '2026-05-01', to: '2026-05-31' });
    assert.deepEqual(amountsOf(theirs), [12345]);
});

// ------------------------------------------------------------------- page

test('page: the default view is the current month and still renders', async () => {
    const { client } = await seed();
    const { status, html } = await client.page('/reports');

    assert.equal(status, 200);
    assert.match(html, /Monthly report/);
    assert.match(html, /id="report-form"/);
    assert.match(html, /name="from"/);
    assert.match(html, /name="q"/);
});

test('page: a custom range shows only matching rows, with notes, and a range heading', async () => {
    const { client } = await seed();
    const { status, html } = await client.page('/reports?from=2026-05-01&to=2026-05-31');

    assert.equal(status, 200);
    assert.match(html, /Spending report/);
    assert.match(html, /2026-05-01 to 2026-05-31/);
    assert.match(html, /100% cotton shirt/);
    assert.ok(!html.includes('Petrol for bike'), 'outside the range');
    assert.ok(!html.includes('Petrol secret'), 'another user\'s data');
    assert.equal(dataRows(html), 5);
    assert.match(html, /₹1,794\.50|₹1794\.50/);
});

test('page: the form remembers what was chosen and shows filter chips with a clear link', async () => {
    const ctx = await seed();
    const q = new URLSearchParams({
        from: '2026-04-30', to: '2026-06-01', category: 'Food & Dining',
        account: ctx.ids.cash, min: '10', max: '200', q: 'bike'
    });
    const { html } = await ctx.client.page(`/reports?${q}`);

    assert.match(html, /name="from" value="2026-04-30"/);
    assert.match(html, /name="to" value="2026-06-01"/);
    assert.match(html, /<option value="Food &amp; Dining" selected>/);
    assert.match(html, new RegExp(`<option value="${ctx.ids.cash}" selected>`));
    assert.match(html, /name="min"[^>]*value="10"/);
    assert.match(html, /name="max"[^>]*value="200"/);
    assert.match(html, /name="q"[^>]*value="bike"/);
    assert.match(html, /value="range" checked/);

    assert.match(html, /Category: Food &amp; Dining/);
    assert.match(html, /Account: Cash/);
    assert.match(html, /Amount: ₹10 to ₹200/);
    assert.match(html, /Notes contain: bike/);
    assert.match(html, /href="\/reports\?from=2026-04-30&amp;to=2026-06-01"[^>]*>Clear filters/);
    assert.equal(dataRows(html), 1);
});

test('page: with filters and no match, the message says so', async () => {
    const { client } = await seed();
    const { status, html } = await client.page('/reports?month=2026-05&q=nothing-like-this');

    assert.equal(status, 200);
    assert.match(html, /No expenses match these filters/);
    assert.match(html, /No spending matches these filters/);
    assert.equal(dataRows(html), 0);
});

test('page: bad input gives a clear message and a 400, keeps the form, shows no report', async () => {
    const ctx = await seed();

    const cases = [
        ['from=2026-05-31&to=2026-05-01', /From date must be on or before/],
        ['from=2026-05-01', /both a From and a To/],
        ['from=2026-02-30&to=2026-03-01', /valid From and To dates/],
        ['month=2026-13', /valid month/],
        ['category=Nope', /category does not exist/],
        [`account=${Number(ctx.other.ids.cash)}`, /account was not found/],
        ['min=500&max=100', /minimum amount is more than the maximum/],
        ['min=abc', /Minimum amount must be a plain number/],
        ['max=-5', /Maximum amount must be a plain number/],
        [`q=${'x'.repeat(101)}`, /too long/],
        ['from=2000-01-01&to=2026-01-01', /10 years or less/]
    ];

    for (const [query, message] of cases) {
        const { status, html } = await ctx.client.page(`/reports?${query}`);

        assert.equal(status, 400, query);
        assert.match(html, message, query);
        assert.match(html, /Could not build the report/, query);
        assert.equal(dataRows(html), 0, `${query}: no rows`);
        assert.ok(!html.includes('Total spent'), `${query}: no totals`);
        assert.match(html, /id="report-form"/, `${query}: the form is still there`);
    }

    const kept = await ctx.client.page('/reports?from=2026-05-31&to=2026-05-01&q=keepme');
    assert.match(kept.html, /name="from" value="2026-05-31"/);
    assert.match(kept.html, /name="q"[^>]*value="keepme"/);
});

test('page: injection attempts in the URL are refused or shown as plain text', async () => {
    const { client } = await seed();

    for (const query of [
        "category=Food' OR '1'='1",
        'account=1 OR 1=1',
        "month=2026-05'; DROP TABLE expenses; --",
        'min=1;DROP TABLE expenses'
    ]) {
        const { status } = await client.page(`/reports?${encodeURI(query)}`);
        assert.equal(status, 400, query);
    }

    const still = await client.page('/reports?month=2026-05');
    assert.equal(still.status, 200);
    assert.ok(dataRows(still.html) > 0, 'data is still there');
});

test('page: HTML in the search box and in notes is escaped', async () => {
    const ctx = await seed();
    await spend(ctx.user.id, ctx.ids.cash, 33, 'Other', '2026-05-22', '<img src=x onerror=alert(1)>');

    const evil = '"><script>alert(1)</script>';
    const searched = await ctx.client.page(`/reports?month=2026-05&q=${encodeURIComponent(evil)}`);

    assert.ok(!searched.html.includes('<script>alert(1)'), 'search text must not become markup');
    assert.match(searched.html, /&#34;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

    const listed = await ctx.client.page('/reports?month=2026-05');
    assert.ok(!listed.html.includes('<img src=x'), 'a note must not become markup');
    assert.match(listed.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('page: odd URL shapes (repeated or nested params) do not crash it', async () => {
    const { client } = await seed();

    for (const query of [
        'category=Transport&category=Rent',
        'min[a]=1&max[b]=2',
        'q[]=a&q[]=b',
        'month=2026-05&month=2026-06',
        'from[]=2026-05-01&to[]=2026-05-31'
    ]) {
        const { status } = await client.page(`/reports?${query}`);
        assert.ok([200, 400].includes(status), `${query} gave ${status}`);
    }
});

test('page: only 500 rows are drawn, with a note, while the total covers everything', async () => {
    const ctx = await newUser();

    await pool.query(
        `INSERT INTO expenses(user_id, amount, payment_method, category, spent_on, account_id)
         SELECT $1, 1, 'cash', 'Other', DATE '2026-03-01' + (g % 28), $2 FROM generate_series(1, 520) g`,
        [ctx.user.id, ctx.ids.cash]
    );

    const { html } = await ctx.client.page('/reports?from=2026-03-01&to=2026-03-31');

    assert.equal(dataRows(html), 500);
    assert.match(html, /Showing the latest 500 of 520 entries/);
    assert.match(html, /520 expense entries/);
    assert.match(html, /₹520/);
});

// ----------------------------------------------------------------- export

test('export: a custom range downloads exactly what the page shows', async () => {
    const ctx = await seed();
    const { status, res, wb } = await ctx.client.xlsx('/reports/export?from=2026-05-01&to=2026-05-31');

    assert.equal(status, 200);
    assert.match(res.headers.get('content-type'), /spreadsheetml/);
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="ledger-report-2026-05-01_to_2026-05-31.xlsx"');
    assert.equal(res.headers.get('cache-control'), 'private, no-store');

    const summary = wb.getWorksheet('Summary');
    assert.equal(summary.getRow(3).getCell(1).value, 'Period');
    assert.equal(summary.getRow(3).getCell(2).value, '2026-05-01 to 2026-05-31');
    assert.equal(summary.getRow(4).getCell(2).value, 1794.5);

    const sheet = wb.getWorksheet('Expenses');
    assert.equal(sheet.rowCount, 1 + 5 + 1, 'header + 5 expenses + total');
    assert.equal(typeof sheet.getRow(2).getCell(5).value, 'number');
    assert.equal(sheet.getRow(2).getCell(2).value, 'Transport', 'oldest first: 1 May');
});

test('export: filters are applied, listed in the Summary and marked in the file name', async () => {
    const ctx = await seed();
    const q = new URLSearchParams({ from: '2026-04-30', to: '2026-06-01', category: 'Food & Dining', q: 'lunch' });
    const { res, wb } = await ctx.client.xlsx(`/reports/export?${q}`);

    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="ledger-report-2026-04-30_to_2026-06-01-filtered.xlsx"');

    const sheet = wb.getWorksheet('Expenses');
    assert.equal(sheet.rowCount, 3, 'header + one expense + total');
    assert.equal(sheet.getRow(2).getCell(4).value, 'abc_def lunch');
    assert.equal(sheet.getRow(2).getCell(5).value, 40);

    let filters = null;
    wb.getWorksheet('Summary').eachRow(r => { if (r.getCell(1).value === 'Filters') filters = r.getCell(2).value; });
    assert.equal(filters, 'Category: Food & Dining; Notes contain: lunch');
});

test('export: the classic month download keeps its name and its Month row', async () => {
    const ctx = await seed();
    const { res, wb } = await ctx.client.xlsx('/reports/export?month=2026-05');

    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="ledger-report-2026-05.xlsx"');
    assert.equal(wb.getWorksheet('Summary').getRow(3).getCell(1).value, 'Month');
    assert.equal(wb.getWorksheet('Expenses').rowCount, 7);
});

test('export: it never includes another user\'s rows', async () => {
    const ctx = await seed();
    const { wb } = await ctx.client.xlsx('/reports/export?from=2026-05-01&to=2026-05-31&q=petrol');
    const sheet = wb.getWorksheet('Expenses');

    assert.equal(sheet.rowCount, 3);
    assert.equal(sheet.getRow(2).getCell(4).value, 'petrol pump');
});

test('export: bad input sends the person back to the report page, which explains the problem', async () => {
    const ctx = await seed();
    const res = await ctx.client.req('/reports/export?from=2026-05-31&to=2026-05-01&q=keep');

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/reports?from=2026-05-31&to=2026-05-01&q=keep');

    const followed = await ctx.client.page(res.headers.get('location'));
    assert.equal(followed.status, 400);
    assert.match(followed.html, /From date must be on or before/);
});

test('export: every row is included, even past the 500 shown on the page', async () => {
    const ctx = await newUser();

    await pool.query(
        `INSERT INTO expenses(user_id, amount, payment_method, category, spent_on, account_id)
         SELECT $1, 2, 'cash', 'Other', DATE '2026-03-01' + (g % 28), $2 FROM generate_series(1, 520) g`,
        [ctx.user.id, ctx.ids.cash]
    );

    const { wb } = await ctx.client.xlsx('/reports/export?from=2026-03-01&to=2026-03-31');

    assert.equal(wb.getWorksheet('Expenses').rowCount, 1 + 520 + 1);
    assert.equal(wb.getWorksheet('Summary').getRow(4).getCell(2).value, 1040);
});

test('export: a note that looks like a formula stays text in the file', async () => {
    const ctx = await newUser();
    await spend(ctx.user.id, ctx.ids.cash, 10, 'Other', '2026-05-05', '=HYPERLINK("http://evil","x")');

    const { wb } = await ctx.client.xlsx('/reports/export?month=2026-05');
    const cell = wb.getWorksheet('Expenses').getRow(2).getCell(4).value;

    assert.equal(cell, '=HYPERLINK("http://evil","x")');
    assert.equal(typeof cell, 'string');
});
