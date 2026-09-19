/** Shared money/date formatting helpers used across every module. */

function money(n) {
    return Number(n || 0).toFixed(2);
}

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatDate(dateStr) {
    return dateStr ? String(dateStr).slice(0, 10) : '';
}

/** Full date + time (UTC), for timestamps where "just the date" would be ambiguous (e.g. two logins on the same day). */
function formatDateTime(date) {
    if (!date) return '';

    const iso = new Date(date).toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

module.exports = { money, round2, formatDate, formatDateTime };
