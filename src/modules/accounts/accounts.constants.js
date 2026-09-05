const ACCOUNT_TYPES = [
    'cash',
    'online',
    'bank',
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

module.exports = {
    ACCOUNT_TYPES,
    ACCOUNT_TYPE_LABELS,
    accountTypeLabel,
    isCreditType
};
