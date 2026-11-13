/**
 * Integration tests for Insights: the REAL Express app and a REAL PostgreSQL
 * database, with a FAKE Gemini server. Nothing here calls Google.
 *
 * Numbers are checked with a fixed "today" by calling the service directly,
 * so these tests never depend on the date they are run.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DATABASE_URL = process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/ledger_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.LOG_LEVEL = 'silent';

const env = require('../src/config/env');
const pool = require('../src/db/pool');
const { initSchema } = require('../src/db/schema');
const { createApp } = require('../src/app');
const ai = require('../src/modules/ai/ai.service');
const authService = require('../src/modules/auth/auth.service');
const accountsService = require('../src/modules/accounts/accounts.service');
const budgetsService = require('../src/modules/budgets/budgets.service');
const loansService = require('../src/modules/loans/loans.service');
const insights = require('../src/modules/insights/insights.service');

const KEY = 'test-key-InSiGhTs-123';
const FIXED_TODAY = '2026-11-12';
const isoDay = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

let appServer, fakeServer, base;
let behave;
let requests;

const insightReply = (over = {}) => ({
    status: 200,
    json: {
        candidates: [{
            content: {
                parts: [{
                    text: JSON.stringify({
                        headline: 'You spent a little more this week',
                        points: ['Groceries led your spending.', 'Transport stayed low.', 'You had a few quiet days.'],
                        tip: 'Plan groceries once a week.',
                        ...over
                    })
                }]
            }
        }]
    }
});

const failure = (status, message) => ({ status, json: { error: { code: status, message } } });

// ------------------------------------------------------------ plumbing

before(async () => {
    await initSchema();

    fakeServer = http.createServer((req, res) => {
        let raw = '';
        req.on('data', d => { raw += d; });
        req.on('end', () => {
            const model = decodeURIComponent((req.url.match(/models\/([^:]+):/) || [])[1] || '');
            const body = raw ? JSON.parse(raw) : {};
            requests.push({ url: req.url, model, headers: req.headers, body, raw });

            const out = behave(model, body, requests.length);
            res.writeHead(out.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(out.json));
        });
    });
    await new Promise(r => fakeServer.listen(0, '127.0.0.1', r));

    appServer = http.createServer(createApp());
    await new Promise(r => appServer.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => {
    appServer.close();
    fakeServer.close();
    await pool.end();
});

beforeEach(() => {
    env.geminiApiKey = KEY;
    env.geminiBaseUrl = `http://127.0.0.1:${fakeServer.address().port}/v1beta`;
    env.geminiModel = 'gemini-3.5-flash';
    env.isProduction = false;
    ai.internals.resetModelCache();
    requests = [];
    behave = () => insightReply();
});

class Client {
    constructor() { this.cookies = new Map(); }

    async req(path, { method = 'GET', form } = {}) {
        const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(base + path, {
            method,
            redirect: 'manual',
            headers: {
                ...(cookie ? { Cookie: cookie } : {}),
                ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
            },
            body: form ? new URLSearchParams(form) : undefined
        });

        for (const c of res.headers.getSetCookie()) {
            const pair = c.split(';')[0];
            const i = pair.indexOf('=');
            this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
        }

        return res;
    }

    async csrf(path = '/insights') {
        const html = (await (await this.req(path)).text()).replace(/\s+/g, ' ');
        return (html.match(/name="csrf_token" value="([^"]+)"/) || [])[1];
    }

    async data(period, today) {
        const q = `period=${period}${today ? `&today=${today}` : ''}`;
        const res = await this.req(`/insights/data?${q}`);
        return { status: res.status, body: await res.json() };
    }

    async text(period = 'week', { today = isoDay(0), token } = {}) {
        if (!this.token) this.token = await this.csrf();
        const res = await this.req('/insights/ai', {
            method: 'POST',
            form: { csrf_token: token === undefined ? this.token : token, period, today }
        });
        return { status: res.status, body: await res.json() };
    }
}

let counter = 0;

async function newUser() {
    const email = `insights-${Date.now()}-${++counter}@example.com`;
    const user = await authService.register({ name: 'Insight Tester', email, password: 'password1', confirm: 'password1' });
    const accounts = await accountsService.getAccounts(user.id);
    const ids = {
        cash: accounts.find(a => a.name === 'Cash').id,
        online: accounts.find(a => a.name === 'Online').id
    };

    const client = new Client();
    const login = await client.req('/login', {
        method: 'POST',
        form: { csrf_token: await client.csrf('/login'), email, password: 'password1' }
    });
    assert.equal(login.status, 302);

    return { user, email, ids, client };
}

/** Inserts an expense row directly so any date can be used. */
async function spend(userId, accountId, amount, category, date, notes = null, method = 'cash') {
    await pool.query(
        `INSERT INTO expenses(user_id, amount, notes, payment_method, category, spent_on, account_id)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [userId, amount, notes, method, category, date, accountId]
    );
}

async function seedFixedScenario() {
    const ctx = await newUser();
    const { user, ids } = ctx;

    await spend(user.id, ids.cash, 100, 'Food & Dining', '2026-11-12');
    await spend(user.id, ids.online, 50, 'Transport', '2026-11-11', null, 'online');
    await spend(user.id, ids.cash, 300, 'Groceries', '2026-11-05');
    await spend(user.id, ids.cash, 200, 'Groceries', '2026-10-05');
    await spend(user.id, ids.cash, 999, 'Rent', '2026-10-20');
    await spend(user.id, ids.cash, 500, 'Shopping', '2025-11-03');
    await spend(user.id, ids.cash, 600, 'Rent', '2026-03-10');

    await pool.query(
        `INSERT INTO balance_log(user_id, account_id, type, amount, note, kind, created_at) VALUES
         ($1,$2,'cash',1000,'top up','topup','2026-11-10 12:00:00+00'),
         ($1,$2,'cash',500,'card','repayment','2026-11-11 12:00:00+00')`,
        [user.id, ids.cash]
    );

    await pool.query(
        `INSERT INTO wallet_transfers(user_id, from_type, to_type, amount, note, from_account_id, to_account_id, created_at)
         VALUES($1,'cash','online',250,'move',$2,$3,'2026-11-09 12:00:00+00')`,
        [user.id, ids.cash, ids.online]
    );

    await budgetsService.upsertBudget(user.id, 'Groceries', '2026-11', 400);
    await budgetsService.upsertBudget(user.id, 'Food & Dining', '2026-11', 100);

    await loansService.addLoan(user.id, 'Ravi Private', 'owed_to_me', 1000, '');
    await loansService.addLoan(user.id, 'Amit Private', 'i_owe', 400, '');

    await accountsService.addAccount(user.id, 'Travel Card', 'credit', 0, 10000);

    return ctx;
}

// ------------------------------------------------------------ the tests

test('every Insights route needs a login', async () => {
    const anon = new Client();

    for (const [method, path] of [['GET', '/insights'], ['GET', '/insights/data?period=week'], ['POST', '/insights/ai']]) {
        const res = await anon.req(path, { method, form: method === 'POST' ? { period: 'week' } : undefined });
        assert.equal(res.status, 302, `${method} ${path}`);
        assert.match(res.headers.get('location'), /login/);
    }
});

test('the page renders with tabs, charts, local scripts and valid initial data', async () => {
    const { client } = await newUser();
    const res = await client.req('/insights');
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /How your money moved/);
    for (const p of ['day', 'week', 'month', 'year']) assert.match(html, new RegExp(`data-period="${p}"`));
    assert.match(html, /id="cat-canvas"/);
    assert.match(html, /id="trend-canvas"/);
    assert.match(html, /\/vendor\/chartjs\/chart\.umd\.min\.js/);
    assert.match(html, /href="\/insights"/);
    assert.ok(!/cdn\.jsdelivr|unpkg|cdnjs/.test(html), 'charts must not need a CDN');

    const json = html.match(/id="insights-initial">([\s\S]*?)<\/script>/)[1];
    const initial = JSON.parse(json);
    assert.equal(initial.data.period, 'month');
    assert.equal(initial.insight.source, 'rules');
});

test('the page starts on the period in the URL, and falls back to month for junk', async () => {
    const { client } = await newUser();

    assert.match(await (await client.req('/insights?period=year')).text(), /data-period="year"\s+aria-busy/);
    assert.match(await (await client.req('/insights?period=bogus')).text(), /data-period="month"\s+aria-busy/);
});

test('the vendored Chart.js and page scripts are served', async () => {
    const { client } = await newUser();

    for (const path of ['/vendor/chartjs/chart.umd.min.js', '/js/chart-theme.js', '/js/insights.js', '/js/dashboard-charts.js']) {
        const res = await client.req(path);
        assert.equal(res.status, 200, path);
        assert.match(res.headers.get('content-type'), /javascript/);
    }
});

test('numbers: day', async () => {
    const { user } = await seedFixedScenario();
    const d = await insights.getInsightData(user.id, 'day', FIXED_TODAY);

    assert.equal(d.kpis.spent, 100);
    assert.equal(d.kpis.previousSpent, 50);
    assert.equal(d.kpis.changePct, 100);
    assert.equal(d.kpis.count, 1);
    assert.equal(d.categories.length, 1);
    assert.equal(d.categories[0].category, 'Food & Dining');
    assert.equal(d.trend.current.length, 7);
    assert.equal(d.trend.current[6], 100);
    assert.equal(d.trend.current[5], 50);
    assert.deepEqual(d.trend.previous, []);
});

test('numbers: week compares with the 7 days before', async () => {
    const { user } = await seedFixedScenario();
    const d = await insights.getInsightData(user.id, 'week', FIXED_TODAY);

    assert.equal(d.kpis.spent, 150);
    assert.equal(d.kpis.previousSpent, 300);
    assert.equal(d.kpis.changePct, -50);
    assert.equal(d.kpis.activeDays, 2);
    assert.equal(d.kpis.noSpendDays, 5);
    assert.equal(d.trend.current.reduce((a, b) => a + b, 0), 150);
    assert.equal(d.trend.previous.reduce((a, b) => a + b, 0), 300);
    assert.equal(d.kpis.added, 1000);
    assert.equal(d.kpis.repaid, 500);
    assert.deepEqual(d.kpis.transfers, { count: 1, total: 250 });
});

test('numbers: month so far against the same days last month', async () => {
    const { user } = await seedFixedScenario();
    const d = await insights.getInsightData(user.id, 'month', FIXED_TODAY);

    assert.equal(d.kpis.spent, 450);
    assert.equal(d.kpis.previousSpent, 200, 'only 1-12 Oct counts, so the 20 Oct rent is left out');
    assert.equal(d.kpis.changePct, 125);
    assert.equal(d.kpis.count, 3);
    assert.equal(d.kpis.activeDays, 3);
    assert.equal(d.kpis.noSpendDays, 9);
    assert.equal(d.kpis.avgPerDay, 37.5);
    assert.deepEqual(d.kpis.biggest, { amount: 300, category: 'Groceries', date: '2026-11-05' });

    assert.deepEqual(d.categories.map(c => [c.category, c.total]), [['Groceries', 300], ['Food & Dining', 100], ['Transport', 50]]);
    assert.equal(d.categories[0].share, 66.7);
    assert.equal(d.categories[0].previousTotal, 200);
    assert.equal(d.categories[0].changePct, 50);
    assert.equal(d.categories[1].changePct, null);

    assert.equal(d.trend.labels.length, 12);
    assert.equal(d.trend.current[4], 300);
    assert.equal(d.trend.current[10], 50);
    assert.equal(d.trend.current[11], 100);
    assert.equal(d.trend.previous[4], 200);
    assert.equal(d.trend.previous.length, 12);

    assert.deepEqual(d.accounts.map(a => [a.name, a.total]), [['Cash', 400], ['Online', 50]]);
});

test('numbers: year, by month, against the same span of last year', async () => {
    const { user } = await seedFixedScenario();
    const d = await insights.getInsightData(user.id, 'year', FIXED_TODAY);

    assert.equal(d.kpis.spent, 2249);
    assert.equal(d.kpis.previousSpent, 500);
    assert.equal(d.kpis.changePct, 349.8);
    assert.equal(d.trend.unit, 'month');
    assert.equal(d.trend.labels.length, 11);
    assert.equal(d.trend.current[2], 600);
    assert.equal(d.trend.current[9], 1199);
    assert.equal(d.trend.current[10], 450);
    assert.equal(d.trend.previous[10], 500);
});

test('numbers: budgets, loans and credit use', async () => {
    const { user } = await seedFixedScenario();
    const d = await insights.getInsightData(user.id, 'month', FIXED_TODAY);

    const groceries = d.budgets.items.find(b => b.category === 'Groceries');
    const food = d.budgets.items.find(b => b.category === 'Food & Dining');

    assert.equal(d.budgets.month, '2026-11');
    assert.deepEqual([groceries.amount, groceries.spent, groceries.pct], [400, 300, 75]);
    assert.deepEqual([food.amount, food.spent, food.pct], [100, 100, 100]);

    assert.deepEqual(d.loans, { openCount: 2, owedToMe: 1000, iOwe: 400 });

    assert.equal(d.credit.length, 1);
    assert.deepEqual([d.credit[0].name, d.credit[0].used, d.credit[0].limit, d.credit[0].pct], ['Travel Card', 0, 10000, 0]);
});

test('a user with no data gets zeros and an empty trend, never an error', async () => {
    const { user } = await newUser();

    for (const period of ['day', 'week', 'month', 'year']) {
        const d = await insights.getInsightData(user.id, period, FIXED_TODAY);

        assert.equal(d.kpis.spent, 0, period);
        assert.equal(d.kpis.changePct, null, period);
        assert.equal(d.kpis.biggest, null, period);
        assert.deepEqual(d.categories, [], period);
        assert.ok(d.trend.current.every(v => v === 0), period);
        assert.equal(insights.buildFallbackInsight(d).mood, 'good', period);
    }
});

test('data route: JSON for each period, 400 for a bad one', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 120, 'Groceries', isoDay(0));

    for (const period of ['day', 'week', 'month', 'year']) {
        const { status, body } = await client.data(period);

        assert.equal(status, 200, period);
        assert.equal(body.ok, true);
        assert.equal(body.data.period, period);
        assert.equal(body.data.kpis.spent, 120);
        assert.equal(body.insight.source, 'rules');
    }

    for (const bad of ['', 'decade', 'MONTH']) {
        const { status, body } = await client.data(bad);
        assert.equal(status, 400, `"${bad}"`);
        assert.equal(body.ok, false);
    }
});

test('data route: a client date far from the server date is ignored', async () => {
    const { client } = await newUser();

    const far = await client.data('week', '2001-01-01');
    assert.equal(far.body.data.today, isoDay(0));

    const near = await client.data('week', isoDay(-1));
    assert.equal(near.body.data.today, isoDay(-1), 'a date within a day is trusted');
});

test('isolation: one user never sees another user\'s numbers', async () => {
    const a = await newUser();
    const b = await newUser();

    await spend(a.user.id, a.ids.cash, 777, 'Travel', isoDay(0));

    const mine = await a.client.data('week');
    const theirs = await b.client.data('week');

    assert.equal(mine.body.data.kpis.spent, 777);
    assert.equal(theirs.body.data.kpis.spent, 0);
    assert.deepEqual(theirs.body.data.categories, []);
});

test('AI: the route returns validated text and sends only summary numbers to Gemini', async () => {
    const { user, ids, email, client } = await newUser();
    await spend(user.id, ids.cash, 250, 'Groceries', isoDay(0), 'SECRET-NOTE-for-Raju');
    await loansService.addLoan(user.id, 'Private Person Name', 'owed_to_me', 900, 'secret loan note');

    const { status, body } = await client.text('week');

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.source, 'ai');
    assert.equal(body.cached, false);
    assert.equal(body.insight.headline, 'You spent a little more this week');
    assert.equal(body.insight.points.length, 3);
    assert.equal(body.insight.source, 'ai');
    assert.ok(['good', 'watch', 'alert'].includes(body.insight.mood));

    assert.equal(requests.length, 1);
    const sent = requests[0];

    assert.equal(sent.headers['x-goog-api-key'], KEY);
    assert.ok(!sent.url.includes(KEY), 'the key must never be in the URL');
    assert.ok(!JSON.stringify(body).includes(KEY), 'the key must never be in the response');

    for (const secret of ['SECRET-NOTE-for-Raju', 'Private Person Name', 'secret loan note', email, 'Insight Tester']) {
        assert.ok(!sent.raw.includes(secret), `Gemini must not receive "${secret}"`);
    }

    assert.match(sent.raw, /Groceries/);
    assert.match(sent.raw, /Use ONLY the numbers in the facts/);
    assert.equal(sent.body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(sent.body.generationConfig.responseSchema.required, ['headline', 'points', 'tip']);
});

test('AI: the colour (mood) comes from the rules, not from the model', async () => {
    const { user, ids, client } = await newUser();
    const month = isoDay(0).slice(0, 7);

    await spend(user.id, ids.cash, 500, 'Groceries', isoDay(0));
    await budgetsService.upsertBudget(user.id, 'Groceries', month, 200);

    behave = () => insightReply({ mood: 'good', headline: 'All fine' });

    const { body } = await client.text('month');

    assert.equal(body.source, 'ai');
    assert.equal(body.insight.mood, 'alert');
});

test('AI: the same numbers are answered from the cache, new numbers call Gemini again', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));

    const first = await client.text('week');
    const second = await client.text('week');

    assert.equal(first.body.cached, false);
    assert.equal(second.body.cached, true);
    assert.equal(second.body.source, 'ai');
    assert.equal(second.body.insight.headline, first.body.insight.headline);
    assert.equal(requests.length, 1, 'the second request must not reach Gemini');

    await spend(user.id, ids.cash, 40, 'Transport', isoDay(0));

    const third = await client.text('week');
    assert.equal(third.body.cached, false);
    assert.equal(requests.length, 2);

    const rows = await pool.query('SELECT COUNT(*)::int AS n FROM insight_cache WHERE user_id=$1', [user.id]);
    assert.equal(rows.rows[0].n, 1, 'one row per user, period and range');
});

test('AI: the cache is per user', async () => {
    const a = await newUser();
    const b = await newUser();

    for (const u of [a, b]) await spend(u.user.id, u.ids.cash, 100, 'Transport', isoDay(0));

    await a.client.text('week');
    const other = await b.client.text('week');

    assert.equal(other.body.cached, false);
    assert.equal(requests.length, 2);
});

test('AI: nothing to talk about means no AI call and no notice', async () => {
    const { client } = await newUser();
    const { status, body } = await client.text('month');

    assert.equal(status, 200);
    assert.equal(body.source, 'rules');
    assert.equal(body.notice, null);
    assert.match(body.insight.headline, /No spending recorded/);
    assert.equal(requests.length, 0);
});

test('AI: without GEMINI_API_KEY the page works with rule-based text and the AI note is hidden', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));
    env.geminiApiKey = '';

    const page = await (await client.req('/insights')).text();
    assert.match(page, /data-ai="0"/);
    assert.ok(!/made by AI from the numbers/.test(page));

    const { body } = await client.text('week');
    assert.equal(body.source, 'rules');
    assert.equal(body.notice, null);
    assert.equal(requests.length, 0);

    const data = await client.data('week');
    assert.equal(data.body.ok, true);
});

test('AI: with a key the page says so', async () => {
    const { client } = await newUser();
    const page = await (await client.req('/insights')).text();

    assert.match(page, /data-ai="1"/);
    assert.match(page, /made by AI from the numbers/);
});

test('AI failures fall back to rule-based text with a calm notice, and leak nothing', async () => {
    const cases = [
        ['403 rejected key', () => failure(403, `API key ${KEY} is not valid`)],
        ['429 quota', () => failure(429, 'quota exceeded')],
        ['503 busy', () => failure(503, 'overloaded')],
        ['400 always', () => failure(400, 'bad request')],
        ['not JSON', () => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: 'sorry, here is prose' }] } }] } })],
        ['empty points', () => insightReply({ points: [] })],
        ['blocked', () => ({ status: 200, json: { candidates: [{ finishReason: 'SAFETY' }] } })]
    ];

    for (const [name, make] of cases) {
        const { user, ids, client } = await newUser();
        await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));
        behave = () => make();

        const { status, body } = await client.text('week');

        assert.equal(status, 200, name);
        assert.equal(body.ok, true, name);
        assert.equal(body.source, 'rules', name);
        assert.match(body.notice, /not available right now/, name);
        assert.equal(body.insight.source, 'rules', name);
        assert.ok(body.insight.points.length > 0, name);
        assert.ok(!JSON.stringify(body).includes(KEY), `${name}: key leaked`);

        const cached = await pool.query('SELECT COUNT(*)::int AS n FROM insight_cache WHERE user_id=$1', [user.id]);
        assert.equal(cached.rows[0].n, 0, `${name}: a failed answer must not be cached`);
    }
});

test('AI: Google unreachable also falls back', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));
    env.geminiBaseUrl = 'http://127.0.0.1:1/v1beta';

    const { status, body } = await client.text('week');

    assert.equal(status, 200);
    assert.equal(body.source, 'rules');
    assert.match(body.notice, /not available right now/);
});

test('AI: markup in the model answer is kept as plain text for the page to show safely', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));
    behave = () => insightReply({ headline: '<img src=x onerror=alert(1)> Hello', points: ['<script>alert(1)</script>'] });

    const { body } = await client.text('week');
    const js = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'insights.js'), 'utf8');

    assert.equal(body.source, 'ai');
    assert.match(body.insight.headline, /<img/);
    assert.ok(!/innerHTML/.test(js), 'the page script must only use textContent for text');
});

test('SECURITY: a wrong or missing CSRF token is refused and never reaches Google', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));

    for (const token of ['wrong', '']) {
        const { status, body } = await client.text('week', { token });
        assert.equal(status, 403, `token "${token}"`);
        assert.equal(body.ok, false);
    }

    assert.equal(requests.length, 0);
});

test('input: a bad period on the AI route is a 400 and never reaches Google', async () => {
    const { client } = await newUser();

    for (const period of ['', 'decade', 'Week']) {
        const { status } = await client.text(period);
        assert.equal(status, 400, `"${period}"`);
    }

    assert.equal(requests.length, 0);
});

test('rate limit: 6 fresh AI calls a minute per user, then rule-based text without calling Google', async () => {
    const { user, ids, client } = await newUser();

    for (let i = 0; i < 6; i++) {
        await spend(user.id, ids.cash, 10 + i, 'Transport', isoDay(0));
        const { body } = await client.text('week');
        assert.equal(body.source, 'ai', `call ${i + 1}`);
    }

    assert.equal(requests.length, 6);

    await spend(user.id, ids.cash, 99, 'Transport', isoDay(0));
    const limited = await client.text('week');

    assert.equal(limited.status, 200);
    assert.equal(limited.body.source, 'rules');
    assert.match(limited.body.notice, /very quickly/);
    assert.equal(requests.length, 6, 'the 7th call must not reach Google');

    const other = await newUser();
    await spend(other.user.id, other.ids.cash, 10, 'Transport', isoDay(0));
    assert.equal((await other.client.text('week')).body.source, 'ai', 'the limit is per user');
});

test('rate limit: cache hits do not use up the allowance', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 10, 'Transport', isoDay(0));

    for (let i = 0; i < 10; i++) {
        const { body } = await client.text('week');
        assert.equal(body.source, 'ai', `call ${i + 1}`);
    }

    assert.equal(requests.length, 1);
});

test('the initial page data is safe inside a script tag (no raw "<" from user-typed names)', async () => {
    const { user, ids, client } = await newUser();
    const evil = '</script><script>alert(1)</script>';

    await pool.query('UPDATE accounts SET name=$1 WHERE id=$2', [evil, ids.cash]);
    await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));

    const html = await (await client.req('/insights?period=day')).text();
    const block = html.match(/id="insights-initial">([\s\S]*?)<\/script>/)[1];

    assert.ok(!html.includes('</script><script>alert(1)'));
    assert.ok(!block.includes('<'), 'every "<" inside the data block must be escaped');

    const initial = JSON.parse(block);
    assert.equal(initial.data.accounts[0].name, evil.slice(0, 40));
});

test('dashboard: has the chart containers, chart scripts and a link to Insights', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));

    const res = await client.req('/dashboard');
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /id="dash-cat-canvas"/);
    assert.match(html, /id="dash-trend-canvas"/);
    assert.match(html, /\/js\/dashboard-charts\.js/);
    assert.match(html, /href="\/insights"/);
    assert.match(html, /id="dash-chart-data"/);

    const json = html.match(/id="dash-chart-data">([\s\S]*?)<\/script>/)[1];
    const data = JSON.parse(json);
    assert.equal(data.byCategory[0].category, 'Transport');
    assert.ok(Array.isArray(data.trend));
});

test('dashboard: still works for a brand-new user with no spending', async () => {
    const { client } = await newUser();
    const res = await client.req('/dashboard');

    assert.equal(res.status, 200);
    assert.match(await res.text(), /No spending this month/);
});

test('the old "Type naturally" feature still works after the AI service was generalised', async () => {
    const { ids, client } = await newUser();
    behave = () => ({
        status: 200,
        json: {
            candidates: [{
                content: {
                    parts: [{
                        text: JSON.stringify({
                            amount: 250, category: 'Transport', notes: 'Petrol',
                            date: isoDay(0), account_id: Number(ids.cash), savings_part: null
                        })
                    }]
                }
            }]
        }
    });

    const token = await client.csrf('/add-expense');
    const res = await client.req('/ai/parse-expense', {
        method: 'POST',
        form: { csrf_token: token, text: 'aaj 250 ka petrol cash se', today: isoDay(0) }
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.suggestion.amount, 250);
    assert.equal(body.suggestion.category, 'Transport');

    const sent = requests[0].body.generationConfig;
    assert.equal(sent.maxOutputTokens, 1024);
    assert.ok(sent.responseSchema.properties.amount, 'the expense schema is still used');
});

test('deleting a user removes their cached insights (no orphan rows)', async () => {
    const { user, ids, client } = await newUser();
    await spend(user.id, ids.cash, 100, 'Transport', isoDay(0));
    await client.text('week');

    const before = await pool.query('SELECT COUNT(*)::int AS n FROM insight_cache WHERE user_id=$1', [user.id]);
    assert.equal(before.rows[0].n, 1);

    await pool.query('DELETE FROM users WHERE id=$1', [user.id]);

    const after = await pool.query('SELECT COUNT(*)::int AS n FROM insight_cache WHERE user_id=$1', [user.id]);
    assert.equal(after.rows[0].n, 0);
});
