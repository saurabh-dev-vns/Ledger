/**
 * Turns a "YYYY-MM" month string into an inclusive { from, to } date
 * range covering that whole month — correctly handling short months
 * (Feb, 30-day months) and leap years, instead of assuming day 31.
 */
function getMonthRange(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new Error('Invalid month, expected "YYYY-MM".');
    }

    const [y, m] = month.split('-').map(Number);

    // Day 0 of the *next* month is the last day of *this* month.
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

    return {
        from: `${month}-01`,
        to: `${month}-${String(lastDay).padStart(2, '0')}`
    };
}

/** True only for real calendar dates written as "YYYY-MM-DD" (no "2026-02-30"). */
function isIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Number of days from `from` to `to`, counting both ends. Both must be valid "YYYY-MM-DD". */
function daysInclusive(from, to) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

module.exports = { getMonthRange, isIsoDate, daysInclusive };
