const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getMonthRange } = require('../src/core/dates');

test('getMonthRange handles a normal 31-day month', () => {
    assert.deepEqual(getMonthRange('2026-01'), { from: '2026-01-01', to: '2026-01-31' });
});

test('getMonthRange handles a 30-day month (regression: was hardcoded to -31)', () => {
    assert.deepEqual(getMonthRange('2026-09'), { from: '2026-09-01', to: '2026-09-30' });
});

test('getMonthRange handles February in a non-leap year', () => {
    assert.deepEqual(getMonthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
});

test('getMonthRange handles February in a leap year', () => {
    assert.deepEqual(getMonthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' });
});

test('getMonthRange handles December', () => {
    assert.deepEqual(getMonthRange('2026-12'), { from: '2026-12-01', to: '2026-12-31' });
});

test('getMonthRange rejects a malformed month', () => {
    assert.throws(() => getMonthRange('2026-9'));
    assert.throws(() => getMonthRange('not-a-month'));
});

// Belt-and-braces: every month of a full year should produce a real,
// parseable calendar date for "to" — this is what would have caught
// the original bug before it ever reached a browser.
test('getMonthRange never produces an invalid calendar date, for any month of the year', () => {
    for (let m = 1; m <= 12; m++) {
        const month = `2026-${String(m).padStart(2, '0')}`;
        const { to } = getMonthRange(month);
        const parsed = new Date(to + 'T00:00:00Z');
        assert.equal(Number.isNaN(parsed.getTime()), false, `${to} should be a valid date`);
        assert.equal(parsed.toISOString().slice(0, 10), to, `${to} should round-trip exactly`);
    }
});
