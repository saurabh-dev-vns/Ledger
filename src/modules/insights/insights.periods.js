/**
 * Period math for the Insights feature. Everything here is pure (no
 * database, no clock) so it is easy to test. Dates are plain
 * "YYYY-MM-DD" strings and all math is done in UTC, the same way the
 * rest of the app treats dates.
 *
 * Periods:
 *   day   - today, compared with yesterday
 *   week  - the last 7 days (today included), compared with the 7 days before
 *   month - this month so far, compared with the same days of last month
 *   year  - this year so far, compared with the same span of last year
 */
const PERIODS = ['day', 'week', 'month', 'year'];

const PERIOD_LABELS = {
    day: 'today',
    week: 'in the last 7 days',
    month: 'this month',
    year: 'this year'
};

const PREVIOUS_LABELS = {
    day: 'yesterday',
    week: 'the 7 days before',
    month: 'the same days last month',
    year: 'the same days last year'
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isPeriod(value) {
    return PERIODS.includes(value);
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function isIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toDate(value) {
    return new Date(`${value}T00:00:00Z`);
}

function fromDate(date) {
    return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
    return fromDate(new Date(toDate(value).getTime() + days * 86400000));
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The same month/day in another year, clamped (Feb 29 becomes Feb 28 in a non-leap year). */
function sameDayInYear(value, year) {
    const [, m, d] = value.split('-').map(Number);
    return `${year}-${pad(m)}-${pad(Math.min(d, daysInMonth(year, m)))}`;
}

/** The same day-of-month in another month, clamped to that month's length. */
function sameDayInMonth(year, month, day) {
    return `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;
}

function daysBetween(from, to) {
    return Math.round((toDate(to) - toDate(from)) / 86400000) + 1;
}

function dayRange(from, to) {
    const out = [];

    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);

    return out;
}

function dayLabel(value) {
    const d = toDate(value);
    return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/**
 * Works out everything a period needs.
 *
 * range / previous: inclusive date ranges used for the numbers.
 * chart: the buckets drawn on the trend chart. `unit` is "day" or
 * "month"; `keys` are the bucket keys ("YYYY-MM-DD" or "YYYY-MM") and
 * `previousKeys` line up with them index by index for the dashed
 * comparison line (empty when there is nothing to compare).
 */
function resolvePeriod(period, today) {
    if (!isPeriod(period)) throw new Error('Invalid period.');
    if (!isIsoDate(today)) throw new Error('Invalid date.');

    const [y, m, d] = today.split('-').map(Number);

    if (period === 'day') {
        const keys = dayRange(addDays(today, -6), today);

        return {
            period,
            today,
            range: { from: today, to: today },
            previous: { from: addDays(today, -1), to: addDays(today, -1) },
            chart: { unit: 'day', keys, labels: keys.map(dayLabel), previousKeys: [] }
        };
    }

    if (period === 'week') {
        const from = addDays(today, -6);
        const keys = dayRange(from, today);
        const previousKeys = keys.map(k => addDays(k, -7));

        return {
            period,
            today,
            range: { from, to: today },
            previous: { from: previousKeys[0], to: previousKeys[previousKeys.length - 1] },
            chart: { unit: 'day', keys, labels: keys.map(dayLabel), previousKeys }
        };
    }

    if (period === 'month') {
        const from = `${y}-${pad(m)}-01`;
        const prevYear = m === 1 ? y - 1 : y;
        const prevMonth = m === 1 ? 12 : m - 1;
        const prevFrom = `${prevYear}-${pad(prevMonth)}-01`;
        const prevTo = sameDayInMonth(prevYear, prevMonth, d);

        const keys = dayRange(from, today);
        const previousKeys = keys.map((_, i) => {
            const day = i + 1;
            return day <= daysInMonth(prevYear, prevMonth) ? `${prevYear}-${pad(prevMonth)}-${pad(day)}` : null;
        });

        return {
            period,
            today,
            range: { from, to: today },
            previous: { from: prevFrom, to: prevTo },
            chart: { unit: 'day', keys, labels: keys.map(k => String(Number(k.slice(8)))), previousKeys }
        };
    }

    // year
    const from = `${y}-01-01`;
    const keys = [];

    for (let i = 1; i <= m; i++) keys.push(`${y}-${pad(i)}`);

    return {
        period,
        today,
        range: { from, to: today },
        previous: { from: `${y - 1}-01-01`, to: sameDayInYear(today, y - 1) },
        chart: {
            unit: 'month',
            keys,
            labels: keys.map(k => MONTH_NAMES[Number(k.slice(5)) - 1]),
            previousKeys: keys.map(k => `${y - 1}-${k.slice(5)}`)
        }
    };
}

module.exports = {
    PERIODS,
    PERIOD_LABELS,
    PREVIOUS_LABELS,
    isPeriod,
    isIsoDate,
    addDays,
    daysBetween,
    daysInMonth,
    resolvePeriod
};
