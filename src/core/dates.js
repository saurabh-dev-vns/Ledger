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

module.exports = { getMonthRange };
