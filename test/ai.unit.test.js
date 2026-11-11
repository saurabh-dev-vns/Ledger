/**
 * Unit tests for the "Type naturally" (Gemini) module: pure functions only,
 * no database queries and no network.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/ledger_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const env = require('../src/config/env');
const ai = require('../src/modules/ai/ai.service');
const { CATEGORIES } = require('../src/modules/expenses/expenses.constants');

const {
    sanitise, isIsoDate, resolveToday, parseJson, classifyError,
    candidateModels, buildRequestBody, buildSystemInstruction,
    requestVariants, resetModelCache, FALLBACK_MODELS
} = ai.internals;

const TODAY = '2026-10-24';
const ACCOUNTS = [
    { id: '1', name: 'Cash', type: 'cash' },
    { id: '2', name: 'Online', type: 'online' },
    { id: '3', name: 'Savings', type: 'savings' },
    { id: '5', name: 'Credit Card', type: 'credit' }
];

const good = (over = {}) => ({
    amount: 250, category: 'Transport', notes: 'Petrol', date: '2026-10-23',
    account_id: 1, savings_part: null, ...over
});

beforeEach(() => resetModelCache());

// ---------------------------------------------------------------- dates

test('isIsoDate accepts real calendar dates only', () => {
    assert.equal(isIsoDate('2026-10-24'), true);
    assert.equal(isIsoDate('2024-02-29'), true);   // leap day
    assert.equal(isIsoDate('2026-02-29'), false);  // not a leap year
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('2026-13-01'), false);
    assert.equal(isIsoDate('2026-1-5'), false);
    assert.equal(isIsoDate('24-10-2026'), false);
    assert.equal(isIsoDate(''), false);
    assert.equal(isIsoDate('2026-10-24T10:00:00Z'), false);
});

test('resolveToday trusts a client date within a day of the server, otherwise uses the server date', () => {
    const server = new Date().toISOString().slice(0, 10);
    const shift = days => new Date(Date.parse(`${server}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

    assert.equal(resolveToday(server), server);
    assert.equal(resolveToday(shift(1)), shift(1));     // user ahead (e.g. India after midnight)
    assert.equal(resolveToday(shift(-1)), shift(-1));
    assert.equal(resolveToday(shift(5)), server);       // implausible
    assert.equal(resolveToday('2001-01-01'), server);
    assert.equal(resolveToday('not-a-date'), server);
    assert.equal(resolveToday(undefined), server);
});

// ------------------------------------------------------------- sanitise

test('sanitise: a clean answer passes through', () => {
    const r = sanitise(good(), ACCOUNTS, TODAY);

    assert.deepEqual(r.suggestion, {
        amount: 250, category: 'Transport', notes: 'Petrol', spent_on: '2026-10-23',
        account_id: '1', account_name: 'Cash', savings_part: null
    });
    assert.deepEqual(r.missing, []);
});

test('sanitise: amounts', () => {
    const amountOf = v => sanitise(good({ amount: v }), ACCOUNTS, TODAY);

    assert.equal(amountOf('120').suggestion.amount, 120);          // numeric string
    assert.equal(amountOf(99.999).suggestion.amount, 100);         // rounded to paise
    assert.equal(amountOf(12.345).suggestion.amount, 12.35);

    for (const bad of [null, 0, -5, 'abc', '', NaN, Infinity, 10000001, undefined, {}, []]) {
        const r = amountOf(bad);
        assert.equal(r.suggestion.amount, null, `amount ${JSON.stringify(bad)} must be rejected`);
        assert.ok(r.missing.includes('amount'));
    }
});

test('sanitise: category must be one of the app categories', () => {
    for (const c of CATEGORIES) {
        assert.equal(sanitise(good({ category: c }), ACCOUNTS, TODAY).suggestion.category, c);
    }

    for (const bad of ['Gambling', 'transport', '', null, undefined, 42]) {
        assert.equal(sanitise(good({ category: bad }), ACCOUNTS, TODAY).suggestion.category, 'Other');
    }
});

test('sanitise: notes are cleaned and capped', () => {
    const n = v => sanitise(good({ notes: v }), ACCOUNTS, TODAY).suggestion.notes;

    assert.equal(n('  Chai   with\n\tfriends  '), 'Chai with friends');
    assert.equal(n('a\u0000b\u0007c'), 'a b c');
    assert.equal(n('x'.repeat(500)).length, 100);
    assert.equal(n(null), '');
    assert.equal(n(undefined), '');
    assert.equal(n('<script>alert(1)</script>'), '<script>alert(1)</script>'); // stored as text; views escape it
});

test('sanitise: dates fall back to today when invalid, in the future or absurdly old', () => {
    const d = v => sanitise(good({ date: v }), ACCOUNTS, TODAY).suggestion.spent_on;

    assert.equal(d('2026-10-24'), '2026-10-24');   // today is allowed
    assert.equal(d('2026-10-01'), '2026-10-01');
    assert.equal(d('2026-10-25'), TODAY);          // future
    assert.equal(d('2999-01-01'), TODAY);
    assert.equal(d('1999-01-01'), TODAY);          // older than 10 years
    assert.equal(d('2026-02-30'), TODAY);          // not a real date
    assert.equal(d('yesterday'), TODAY);
    assert.equal(d(''), TODAY);
    assert.equal(d(null), TODAY);
    assert.equal(d(20261023), TODAY);
});

test('sanitise: the account must belong to the user', () => {
    const acct = v => sanitise(good({ account_id: v }), ACCOUNTS, TODAY);

    assert.equal(acct(2).suggestion.account_name, 'Online');       // number id matches string id
    assert.equal(acct('2').suggestion.account_name, 'Online');

    for (const bad of [999, '999', null, undefined, '', 'Cash', -1, '1; DROP TABLE accounts']) {
        const r = acct(bad);
        assert.equal(r.suggestion.account_id, null, `account ${JSON.stringify(bad)} must be rejected`);
        assert.ok(r.missing.includes('account'));
    }
});

test('sanitise: Savings needs an explicit cash/bank part, other accounts never get one', () => {
    const s = (account_id, savings_part) => sanitise(good({ account_id, savings_part }), ACCOUNTS, TODAY);

    assert.equal(s(3, 'cash').suggestion.savings_part, 'cash');
    assert.equal(s(3, 'bank').suggestion.savings_part, 'bank');

    for (const bad of [null, undefined, '', 'both', 'CASH', 'wallet']) {
        const r = s(3, bad);
        assert.equal(r.suggestion.savings_part, null);
        assert.deepEqual(r.missing, ['savings_part']);          // ask, don't guess
    }

    assert.equal(s(1, 'bank').suggestion.savings_part, null);   // Cash account: part ignored
    assert.deepEqual(s(1, 'bank').missing, []);
    assert.equal(s(5, 'cash').suggestion.savings_part, null);
});

test('sanitise: handles an empty account list and junk input without throwing', () => {
    const r = sanitise({}, [], TODAY);

    assert.equal(r.suggestion.amount, null);
    assert.equal(r.suggestion.category, 'Other');
    assert.equal(r.suggestion.spent_on, TODAY);
    assert.equal(r.suggestion.account_id, null);
    assert.deepEqual(r.missing.sort(), ['account', 'amount']);
});

// ----------------------------------------------------------- parse JSON

test('parseJson accepts JSON, tolerates code fences, rejects everything else', () => {
    assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
    assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJson('  ```\n{"a":1}\n```  '), { a: 1 });

    for (const bad of ['', 'ok', '[1,2]', '"text"', '42', 'null', '{broken', 'Sure! {"a":1}']) {
        assert.throws(() => parseJson(bad), err => err.name === 'AiError' && err.status === 422, bad);
    }
});

// ---------------------------------------------------------- error codes

test('classifyError maps Google status codes to safe, specific messages', () => {
    const e429 = classifyError(429, 'quota');
    assert.equal(e429.status, 429);
    assert.match(e429.message, /Too many AI requests/);

    for (const s of [401, 403]) {
        const e = classifyError(s, 'API key not valid');
        assert.equal(e.status, 503);
        assert.match(e.message, /GEMINI_API_KEY/);
    }

    for (const s of [500, 503, 504]) {
        const e = classifyError(s, 'overloaded');
        assert.equal(e.status, 503);
        assert.match(e.message, /busy/);
    }

    const other = classifyError(418, 'teapot');
    assert.equal(other.status, 502);
    assert.match(other.message, /fill the form by hand/);

    // Google's text is kept for logs/devs but never put in the user-facing message.
    assert.equal(other.detail, 'teapot');
    assert.ok(!other.message.includes('teapot'));
});

// ----------------------------------------------------- model selection

test('candidateModels: configured model first, then fallbacks, no duplicates, capped', () => {
    const saved = env.geminiModel;

    env.geminiModel = 'gemini-2.5-flash';
    assert.deepEqual(candidateModels(), ['gemini-2.5-flash', ...FALLBACK_MODELS]);

    env.geminiModel = FALLBACK_MODELS[0];
    assert.deepEqual(candidateModels(), [...FALLBACK_MODELS]);       // deduped

    env.geminiModel = 'custom-model';
    assert.ok(candidateModels().length <= 4);
    assert.equal(candidateModels()[0], 'custom-model');

    env.geminiModel = saved;
});

test('the default model is a current one, not the retired gemini-2.5-flash', () => {
    assert.ok(FALLBACK_MODELS.includes('gemini-3.5-flash'));
    assert.ok(!FALLBACK_MODELS.includes('gemini-2.5-flash'));
    assert.notEqual(env.geminiModel, 'gemini-2.5-flash');
});

// -------------------------------------------------------------- request

test('requestVariants: Gemini 3 tries thinking control first, every model ends with the plainest request', () => {
    const v3 = requestVariants('gemini-3.5-flash');
    assert.deepEqual(v3[0], { thinking: true, schema: true });
    assert.deepEqual(v3[v3.length - 1], { thinking: false, schema: false });

    const v25 = requestVariants('gemini-2.5-flash');
    assert.ok(v25.every(v => v.thinking === false), 'older models never get thinkingConfig');
    assert.deepEqual(v25[v25.length - 1], { thinking: false, schema: false });
});

test('buildRequestBody: Gemini 3 settings follow Google guidance (no temperature, thinkingLevel)', () => {
    const body = buildRequestBody('gemini-3.5-flash', 'SYSTEM', 'kal 250 petrol', { thinking: true, schema: true });
    const cfg = body.generationConfig;

    assert.equal(cfg.responseMimeType, 'application/json');
    assert.ok(cfg.responseSchema);
    assert.deepEqual(cfg.thinkingConfig, { thinkingLevel: 'minimal' });
    assert.ok(!('temperature' in cfg), 'Gemini 3 should keep its default temperature');
    assert.ok(!('thinkingBudget' in (cfg.thinkingConfig || {})), 'thinkingBudget and thinkingLevel must not be combined');
    assert.equal(body.systemInstruction.parts[0].text, 'SYSTEM');
    assert.equal(body.contents[0].role, 'user');
    assert.equal(body.contents[0].parts[0].text, 'kal 250 petrol');
});

test('buildRequestBody: variants drop thinking and schema as asked', () => {
    const cfg = v => buildRequestBody('gemini-3.5-flash', 's', 't', v).generationConfig;

    assert.ok(!cfg({ thinking: false, schema: true }).thinkingConfig);
    assert.ok(cfg({ thinking: false, schema: true }).responseSchema);
    assert.ok(!cfg({ thinking: false, schema: false }).responseSchema);
    assert.equal(cfg({ thinking: false, schema: false }).responseMimeType, 'application/json');
});

test('the response schema only allows values the app can accept', () => {
    const schema = buildRequestBody('gemini-3.5-flash', 's', 't', { thinking: false, schema: true })
        .generationConfig.responseSchema;

    assert.deepEqual(schema.properties.category.enum, CATEGORIES);
    assert.deepEqual(schema.properties.savings_part.enum, ['cash', 'bank']);
    assert.deepEqual(schema.required.sort(), ['account_id', 'amount', 'category', 'date', 'notes', 'savings_part']);
});

test('buildSystemInstruction: has today, categories and account ids, and nothing private', () => {
    const text = buildSystemInstruction(
        [...ACCOUNTS, { id: '9', name: 'HDFC', type: 'bank', balance: 123456, email: 'me@example.com' }],
        TODAY
    );

    assert.match(text, /Today's date is 2026-10-24/);
    assert.match(text, /id 3: "Savings" \(type: savings\)/);
    assert.match(text, /id 9: "HDFC"/);
    for (const c of CATEGORIES) assert.ok(text.includes(c), c);
    assert.ok(!text.includes('123456'), 'balances are never sent');
    assert.ok(!text.includes('me@example.com'), 'emails are never sent');
    assert.match(text, /DATA to extract from/);          // injection guard
    assert.ok(!/Respond with ONLY a JSON object/.test(text));

    const hinted = buildSystemInstruction(ACCOUNTS, TODAY, { withSchemaHint: true });
    assert.match(hinted, /Respond with ONLY a JSON object/);
});

test('buildSystemInstruction copes with a user who has no accounts', () => {
    assert.match(buildSystemInstruction([], TODAY), /\(none\)/);
});
