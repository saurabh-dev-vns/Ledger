const express = require('express');
const { ok } = require('./http');
const aiService = require('../modules/ai/ai.service');
const { CATEGORIES } = require('../modules/expenses/expenses.constants');
const { ACCOUNT_TYPES, SAVINGS_PARTS, accountTypeLabel, isCreditType } = require('../modules/accounts/accounts.constants');
const { PERIODS } = require('../modules/insights/insights.periods');
const { RESTORE_WINDOW_DAYS } = require('../modules/profile/profile.constants');

const router = express.Router();

/** Static lists the forms need (categories, account types, ...). Public and the same for everyone. */
router.get('/meta', (req, res) => {
    ok(res, {
        categories: CATEGORIES,
        accountTypes: ACCOUNT_TYPES.map(value => ({
            value,
            label: accountTypeLabel(value),
            credit: isCreditType(value)
        })),
        savingsParts: SAVINGS_PARTS,
        insightPeriods: PERIODS,
        restoreWindowDays: RESTORE_WINDOW_DAYS,
        aiEnabled: aiService.isEnabled()
    });
});

module.exports = router;
