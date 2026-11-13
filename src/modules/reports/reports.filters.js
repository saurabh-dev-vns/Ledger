const { CATEGORIES } = require('../expenses/expenses.constants');
const { getMonthRange, isIsoDate, daysInclusive } = require('../../core/dates');

/**
 * Reads and checks everything the Reports page and the Excel export accept
 * in the URL, in one place, so both always agree.
 *
 * Period:  ?month=YYYY-MM            (default: this month)
 *          ?from=YYYY-MM-DD&to=...   (custom range; wins over month)
 * Filters: category, account (an account id, or "none" for expenses with
 *          no account), min and max amount, and q (search in notes).
 *
 * Nothing here touches the database. Invalid input is never silently
 * ignored: the person gets a clear message instead of a report that
 * looks filtered but is not.
 */

const NO_ACCOUNT = 'none';
const MAX_RANGE_DAYS = 3660; // about 10 years
const MAX_SEARCH_LENGTH = 100;
const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

/** Express can hand over arrays or objects (?a=1&a=2, ?a[b]=1). Only a single string is accepted. */
function text(value) {
    const v = Array.isArray(value) ? value[0] : value;
    return typeof v === 'string' ? v.trim() : '';
}

function parseAmount(raw, label) {
    if (raw === '') return { value: null };

    if (!AMOUNT_PATTERN.test(raw)) {
        return { error: `${label} must be a plain number like 250 or 99.50.` };
    }

    return { value: Number(raw) };
}

function fail(error, form) {
    return { ok: false, error, form };
}

/**
 * @param query      req.query
 * @param today      "YYYY-MM-DD", used for the default month
 * @param accountIds the user's account ids (as strings), to check the account filter
 */
function parseReportQuery(query = {}, { today, accountIds = [] } = {}) {
    const form = {
        month: text(query.month),
        from: text(query.from),
        to: text(query.to),
        category: text(query.category),
        account: text(query.account),
        min: text(query.min),
        max: text(query.max),
        q: text(query.q).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    };

    // ---- period ----
    let period;

    if (form.from || form.to) {
        if (!form.from || !form.to) {
            return fail('Pick both a From and a To date for a custom range.', form);
        }

        if (!isIsoDate(form.from) || !isIsoDate(form.to)) {
            return fail('Pick valid From and To dates.', form);
        }

        if (form.from > form.to) {
            return fail('The From date must be on or before the To date.', form);
        }

        if (daysInclusive(form.from, form.to) > MAX_RANGE_DAYS) {
            return fail('Please choose a range of 10 years or less.', form);
        }

        period = {
            mode: 'range',
            month: null,
            from: form.from,
            to: form.to,
            label: `${form.from} to ${form.to}`
        };
    } else {
        const month = form.month || String(today).slice(0, 7);

        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            return fail('Pick a valid month.', form);
        }

        const range = getMonthRange(month);
        form.month = month;

        period = { mode: 'month', month, from: range.from, to: range.to, label: month };
    }

    // ---- filters ----
    if (form.category && !CATEGORIES.includes(form.category)) {
        return fail('That category does not exist.', form);
    }

    let account = null;

    if (form.account === NO_ACCOUNT) {
        account = NO_ACCOUNT;
    } else if (form.account) {
        if (!/^\d+$/.test(form.account) || !accountIds.includes(form.account)) {
            return fail('That account was not found.', form);
        }

        account = form.account;
    }

    const min = parseAmount(form.min, 'Minimum amount');
    if (min.error) return fail(min.error, form);

    const max = parseAmount(form.max, 'Maximum amount');
    if (max.error) return fail(max.error, form);

    if (min.value !== null && max.value !== null && min.value > max.value) {
        return fail('The minimum amount is more than the maximum amount.', form);
    }

    if (form.q.length > MAX_SEARCH_LENGTH) {
        return fail(`Search text is too long (up to ${MAX_SEARCH_LENGTH} characters).`, form);
    }

    return {
        ok: true,
        form,
        period,
        filters: {
            category: form.category || null,
            account,
            min: min.value,
            max: max.value,
            q: form.q || null
        }
    };
}

function rupees(n) {
    return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Short, readable labels for the filters that are switched on, for the
 * chips on the page and the Filters line in the Excel summary.
 * `accountNames` maps an account id (string) to its name.
 */
function describeFilters(filters, accountNames = new Map()) {
    const out = [];

    if (filters.category) out.push(`Category: ${filters.category}`);

    if (filters.account === NO_ACCOUNT) {
        out.push('Account: no account (imported)');
    } else if (filters.account) {
        out.push(`Account: ${accountNames.get(String(filters.account)) || 'selected account'}`);
    }

    if (filters.min !== null && filters.max !== null) {
        out.push(`Amount: ${rupees(filters.min)} to ${rupees(filters.max)}`);
    } else if (filters.min !== null) {
        out.push(`Amount: at least ${rupees(filters.min)}`);
    } else if (filters.max !== null) {
        out.push(`Amount: at most ${rupees(filters.max)}`);
    }

    if (filters.q) out.push(`Notes contain: ${filters.q}`);

    return out;
}

module.exports = {
    NO_ACCOUNT,
    MAX_RANGE_DAYS,
    MAX_SEARCH_LENGTH,
    parseReportQuery,
    describeFilters
};
