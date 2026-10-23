const ACCOUNT_TYPES = [
    'cash',
    'online',
    'bank',
    'savings',
    'credit',
    'emi',
    'other'
];

// Friendly labels for account types, since raw values like "credit"
// or "emi" aren't what we want to show verbatim in the UI.
const ACCOUNT_TYPE_LABELS = {
    cash: 'Cash',
    online: 'Online / UPI',
    bank: 'Bank',
    savings: 'Savings (Cash + Bank)',
    credit: 'Credit Card',
    emi: 'EMI / Installment',
    other: 'Other'
};

function accountTypeLabel(type) {
    return ACCOUNT_TYPE_LABELS[type] || (type ? type[0].toUpperCase() + type.slice(1) : 'Other');
}

/** Credit Card / EMI accounts behave like revolving credit: balance
 *  is "available" and is capped at credit_limit, instead of being a
 *  plain top-up balance like Cash/Bank/Online. */
function isCreditType(type) {
    return type === 'credit' || type === 'emi';
}

/** A Savings account is one account whose balance is split into a Cash part and a Bank part. */
const SAVINGS_PARTS = ['cash', 'bank'];

function isSavingsType(type) {
    return type === 'savings';
}

function partLabel(part) {
    return part === 'cash' ? 'Cash' : part === 'bank' ? 'Bank' : '';
}

module.exports = {
    SAVINGS_PARTS,
    isSavingsType,
    partLabel,
    ACCOUNT_TYPES,
    ACCOUNT_TYPE_LABELS,
    accountTypeLabel,
    isCreditType
};
