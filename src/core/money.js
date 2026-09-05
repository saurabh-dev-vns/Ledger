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

module.exports = { money, round2, formatDate };
