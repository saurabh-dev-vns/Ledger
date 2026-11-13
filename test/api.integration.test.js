/**
 * The JSON API (/api) end to end, against a real PostgreSQL database
 * (same setup as integration.test.js).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DATABASE_URL = process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/ledger_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { initSchema } = require('../src/db/schema');
const { createApp } = require('../src/app');

const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);

let server;
let base;

before(async () => {
    await initSchema();
    server = http.createServer(createApp());
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(r => server.close(r)));

/** A browser-like client: keeps cookies, remembers the CSRF token. */
class Client {
    constructor() {
        this.cookies = new Map();
        this.csrf = null;
    }

    async call(method, path, body, { csrf = this.csrf, raw = false } = {}) {
        const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(base + path, {
            method,
            redirect: 'manual',
            headers: {
                ...(cookie ? { Cookie: cookie } : {}),
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(csrf ? { 'X-CSRF-Token': csrf } : {})
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });

        for (const c of res.headers.getSetCookie()) {
            const pair = c.split(';')[0];
            const i = pair.indexOf('=');
            this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
        }

        if (raw) return res;
        return { status: res.status, headers: res.headers, body: await res.json() };
    }

    async init() {
        const r = await this.call('GET', '/api/session');
        this.csrf = r.body.data.csrfToken;
        return r;
    }

    get(path) { return this.call('GET', path); }
    post(path, body = {}) { return this.call('POST', path, body); }
    patch(path, body = {}) { return this.call('PATCH', path, body); }
    del(path) { return this.call('DELETE', path); }
}

let counter = 0;
const newEmail = () => `api-${Date.now()}-${++counter}@example.com`;

async function signedInClient() {
    const c = new Client();
    await c.init();
    const email = newEmail();
    const r = await c.post('/api/auth/register', {
        name: 'Api Tester', email, password: 'password1', confirm_password: 'password1'
    });
    assert.equal(r.status, 201);
    c.csrf = r.body.data.csrfToken;
    c.email = email;
    return c;
}

/** Creates an account and returns it (new users also get default Cash/Online accounts, so look it up by name). */
async function makeAccount(c, name, type, balance) {
    const r = await c.post('/api/accounts', { name, type, balance });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return (await c.get('/api/accounts')).body.data.accounts.find(a => a.name === name);
}

test('GET /api/session: anonymous visitors get a CSRF token and no user', async () => {
    const c = new Client();
    const r = await c.init();

    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.data.user, null);
    assert.match(r.body.data.csrfToken, /^[0-9a-f]{64}$/);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
});

test('GET /api/meta is public and lists categories and account types', async () => {
    const r = await new Client().get('/api/meta');

    assert.equal(r.status, 200);
    assert.ok(r.body.data.categories.length > 0);
    assert.ok(r.body.data.accountTypes.some(t => t.value === 'credit' && t.credit === true));
    assert.deepEqual(r.body.data.savingsParts, ['cash', 'bank']);
});

test('protected routes answer 401 JSON (not a redirect) when signed out', async () => {
    const c = new Client();
    await c.init();

    for (const path of ['/api/dashboard', '/api/accounts', '/api/expenses', '/api/profile', '/api/reports']) {
        const r = await c.get(path);
        assert.equal(r.status, 401, path);
        assert.equal(r.body.ok, false);
    }
});

test('POST without the CSRF header is rejected, even when signed in', async () => {
    const c = await signedInClient();

    const missing = await c.call('POST', '/api/accounts', { name: 'X', type: 'cash' }, { csrf: null });
    assert.equal(missing.status, 403);

    const wrong = await c.call('POST', '/api/accounts', { name: 'X', type: 'cash' }, { csrf: 'a'.repeat(64) });
    assert.equal(wrong.status, 403);
});

test('register: validation errors come back as 400 with the message', async () => {
    const c = new Client();
    await c.init();

    const r = await c.post('/api/auth/register', {
        name: 'A', email: newEmail(), password: 'password1', confirm_password: 'different'
    });

    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
    assert.ok(r.body.error);
});

test('login: wrong password is 401, right password signs in with a fresh CSRF token', async () => {
    const owner = await signedInClient();

    const c = new Client();
    await c.init();
    const before = c.csrf;

    const bad = await c.post('/api/auth/login', { email: owner.email, password: 'nope-nope' });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error, 'Incorrect email or password.');

    const good = await c.post('/api/auth/login', { email: owner.email, password: 'password1' });
    assert.equal(good.status, 200);
    assert.equal(good.body.data.user.name, 'Api Tester');
    assert.notEqual(good.body.data.csrfToken, before, 'session is regenerated on login');

    c.csrf = good.body.data.csrfToken;
    const who = await c.get('/api/session');
    assert.equal(who.body.data.user.name, 'Api Tester');
});

test('logout ends the session', async () => {
    const c = await signedInClient();

    assert.equal((await c.get('/api/profile')).status, 200);
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    assert.equal((await c.get('/api/profile')).status, 401);
});

test('accounts: create, add money, list', async () => {
    const c = await signedInClient();

    const created = await c.post('/api/accounts', { name: 'Wallet', type: 'cash', balance: 100 });
    assert.equal(created.status, 201);

    const list = await c.get('/api/accounts');
    const acct = list.body.data.accounts.find(a => a.name === 'Wallet');
    assert.ok(acct);
    assert.equal(acct.balance, 100);

    const add = await c.post(`/api/accounts/${acct.id}/add`, { amount: 50, note: 'top up' });
    assert.equal(add.status, 200);
    assert.equal(add.body.message, 'Balance added.');

    const after = await c.get('/api/accounts');
    assert.equal(after.body.data.accounts.find(a => a.id === acct.id).balance, 150);

    const bad = await c.post('/api/accounts', { name: '', type: 'cash' });
    assert.equal(bad.status, 400);
});

test('savings account: add to a part and move between parts', async () => {
    const c = await signedInClient();

    await c.post('/api/accounts', { name: 'Savings', type: 'savings', cash_opening: 100, bank_opening: 900 });
    const acct = (await c.get('/api/accounts')).body.data.accounts.find(a => a.type === 'savings');

    const moved = await c.post(`/api/accounts/${acct.id}/move`, { from: 'bank', amount: 200 });
    assert.equal(moved.status, 200);
    assert.match(moved.body.message, /Moved ₹200\.00 from Savings Bank to Cash/);

    const after = (await c.get('/api/accounts')).body.data.accounts.find(a => a.id === acct.id);
    assert.equal(after.cash_part, 300);
    assert.equal(after.bank_part, 700);
});

test('expenses: add, filter, delete credits the amount back', async () => {
    const c = await signedInClient();

    const acct = await makeAccount(c, 'Pocket', 'cash', 500);

    const add = await c.post('/api/expenses', {
        amount: 120, notes: 'lunch', payment_method: 'cash', category: 'Food & Dining', spent_on: today, account_id: String(acct.id)
    });
    assert.equal(add.status, 201);
    assert.equal(add.body.message, 'Expense added — ₹120.00.');

    const list = await c.get('/api/expenses?category=' + encodeURIComponent('Food & Dining'));
    assert.equal(list.body.data.expenses.length, 1);
    assert.equal(list.body.data.total, 120);

    const other = await c.get('/api/expenses?category=Travel');
    assert.equal(other.body.data.expenses.length, 0);

    const id = list.body.data.expenses[0].id;
    assert.equal((await c.del(`/api/expenses/${id}`)).status, 200);
    assert.equal((await c.del(`/api/expenses/${id}`)).status, 404);

    const back = (await c.get('/api/accounts')).body.data.accounts.find(a => a.id === acct.id);
    assert.equal(back.balance, 500);
});

test('expenses: an overdraft is a 400 with the service message', async () => {
    const c = await signedInClient();

    const acct = await makeAccount(c, 'Pocket', 'cash', 10);

    const r = await c.post('/api/expenses', {
        amount: 999, payment_method: 'cash', category: 'Food & Dining', spent_on: today, account_id: String(acct.id)
    });

    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'That account does not have enough balance.');
});

test('expense import: bad lines reject everything, good lines import as history', async () => {
    const c = await signedInClient();

    const bad = await c.post('/api/expenses/import', { data: 'this is not a valid line' });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /Nothing imported/);

    const good = await c.post('/api/expenses/import', { data: `${today}, 75, chai` });
    assert.equal(good.status, 201, JSON.stringify(good.body));
    assert.equal(good.body.data.count, 1);
});

test('transfers and funds-added history', async () => {
    const c = await signedInClient();

    const from = await makeAccount(c, 'Acct A', 'cash', 300);
    const to = await makeAccount(c, 'Acct B', 'bank', 0);

    const t = await c.post('/api/transfers', { from_account_id: String(from.id), to_account_id: String(to.id), amount: 100 });
    assert.equal(t.status, 201);

    const added = await c.post('/api/funds-added', { account_id: String(to.id), amount: 40, note: 'gift' });
    assert.equal(added.status, 201);
    assert.equal(added.body.message, '₹40.00 added to Acct B.');

    const history = await c.get('/api/funds-added');
    assert.equal(history.body.data.history.count, 1);
    assert.equal(history.body.data.history.total, 40);
    assert.equal(history.body.data.history.rows[0].note, 'gift');
    assert.ok(history.body.data.accounts.some(a => a.name === 'Acct B'));

    const moved = (await c.get('/api/accounts')).body.data.accounts;
    assert.equal(moved.find(a => a.id === from.id).balance, 200);
    assert.equal(moved.find(a => a.id === to.id).balance, 140);

    const feed = await c.get('/api/transactions');
    assert.equal(feed.status, 200);
    assert.ok(Array.isArray(feed.body.data.transactions));
});

test('budgets: save, list, delete', async () => {
    const c = await signedInClient();

    assert.equal((await c.post('/api/budgets', { category: 'Food & Dining', month, amount: 2000 })).status, 200);

    const list = await c.get(`/api/budgets?month=${month}`);
    assert.equal(list.body.data.month, month);
    assert.equal(list.body.data.budgets.length, 1);

    const id = list.body.data.budgets[0].id;
    assert.equal((await c.del(`/api/budgets/${id}`)).status, 200);
    assert.equal((await c.get(`/api/budgets?month=${month}`)).body.data.budgets.length, 0);
});

test('loans: add and repay', async () => {
    const c = await signedInClient();

    const add = await c.post('/api/loans', { person: 'Ravi', direction: 'owed_to_me', amount: 500, note: 'trip' });
    assert.equal(add.status, 201, JSON.stringify(add.body));

    const loan = (await c.get('/api/loans')).body.data.loans[0];
    assert.equal(loan.person, 'Ravi');

    const repay = await c.post(`/api/loans/${loan.id}/repay`, { amount: 200 });
    assert.equal(repay.status, 200);
});

test('dashboard returns the numbers the page needs', async () => {
    const c = await signedInClient();
    await makeAccount(c, 'Pocket', 'cash', 250);

    const r = await c.get('/api/dashboard');
    assert.equal(r.status, 200);

    for (const key of ['wallet', 'accounts', 'creditAccounts', 'total', 'monthTotal', 'recent', 'recentTransfers',
        'byCategory', 'maxCategory', 'budgets', 'trend', 'loans', 'recentAdded', 'addedThisMonth']) {
        assert.ok(key in r.body.data, `missing ${key}`);
    }

    assert.equal(r.body.data.total, 250);
});

test('profile: read, update, change password, delete needs the right password', async () => {
    const c = await signedInClient();

    const p = await c.get('/api/profile');
    assert.equal(p.body.data.profile.email, c.email);

    const upd = await c.patch('/api/profile', { name: 'Renamed', email: c.email });
    assert.equal(upd.status, 200);
    assert.equal((await c.get('/api/session')).body.data.user.name, 'Renamed');

    const pw = await c.post('/api/profile/password', {
        current_password: 'wrong', new_password: 'newpassword1', confirm_password: 'newpassword1'
    });
    assert.equal(pw.status, 400);

    const del = await c.post('/api/profile/delete', { password: 'not-my-password' });
    assert.equal(del.status, 400);
    assert.equal((await c.get('/api/profile')).status, 200, 'still signed in after a failed delete');
});

test('deleted account: login offers a restore, restore signs back in', async () => {
    const c = await signedInClient();

    const del = await c.post('/api/profile/delete', { password: 'password1' });
    assert.equal(del.status, 200);
    assert.equal((await c.get('/api/profile')).status, 401);

    const login = await c.post('/api/auth/login', { email: c.email, password: 'password1' });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user, null);
    assert.equal(login.body.data.pendingRestore.name, 'Api Tester');

    const restored = await c.post('/api/auth/restore-account');
    assert.equal(restored.status, 200);
    c.csrf = restored.body.data.csrfToken;
    assert.equal((await c.get('/api/profile')).status, 200);
});

test('password reset: request is always generic, bad code is a 400', async () => {
    const c = new Client();
    await c.init();

    const req = await c.post('/api/auth/forgot-password', { email: 'nobody-here@example.com' });
    assert.equal(req.status, 200);
    assert.match(req.body.message, /6-digit code/);

    const reset = await c.post('/api/auth/reset-password', {
        email: 'nobody-here@example.com', otp: '000000', new_password: 'newpassword1', confirm_password: 'newpassword1'
    });
    assert.equal(reset.status, 400);
});

test('reports: JSON for the page, bad filters are 400, export is an .xlsx file', async () => {
    const c = await signedInClient();

    const acct = await makeAccount(c, 'Pocket', 'cash', 500);
    const spent = await c.post('/api/expenses', {
        amount: 60, payment_method: 'cash', category: 'Food & Dining', spent_on: today, account_id: String(acct.id)
    });
    assert.equal(spent.status, 201);

    const r = await c.get(`/api/reports?month=${month}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.report.total, 60);
    assert.equal(r.body.data.pageLimit, 500);

    const bad = await c.get('/api/reports?month=not-a-month');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.ok, false);

    const file = await c.call('GET', `/api/reports/export?month=${month}`, undefined, { raw: true });
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-type'), /spreadsheetml/);
    assert.match(file.headers.get('content-disposition'), /ledger-report-.*\.xlsx/);
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
});

test('insights data over the API; AI endpoints need a token and a login', async () => {
    const c = await signedInClient();

    const data = await c.get('/api/insights?period=month');
    assert.equal(data.status, 200);
    assert.equal(data.body.ok, true);

    const badPeriod = await c.get('/api/insights?period=decade');
    assert.equal(badPeriod.status, 400);

    // Header token is accepted (the Gemini key is not set here, so it stops at "not set up").
    const ai = await c.post('/api/ai/parse-expense', { text: 'chai 20', today });
    assert.ok([503, 200].includes(ai.status), String(ai.status));

    const anon = new Client();
    await anon.init();
    assert.equal((await anon.post('/api/ai/parse-expense', { text: 'x' })).status, 401);
});

test('unknown /api paths and broken JSON answer with JSON errors', async () => {
    const c = await signedInClient();

    const nope = await c.get('/api/does-not-exist');
    assert.equal(nope.status, 404);
    assert.equal(nope.body.ok, false);

    const res = await fetch(base + '/api/accounts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': c.csrf,
            Cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
        },
        body: '{not json'
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).ok, false);
});

test('security headers (helmet) are present on API responses', async () => {
    const r = await new Client().get('/api/meta');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('x-frame-options'));
});
