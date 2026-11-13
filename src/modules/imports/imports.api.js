const express = require('express');
const { route, ApiError, ok } = require('../../api/http');
const service = require('./imports.service');

const router = express.Router();

/** Imports past expenses as history. Account balances are not changed. */
router.post('/expenses/import', route(async (req, res) => {
    const { rows, errors } = service.parseImportLines(req.body.data);

    if (errors.length) {
        const shown = errors.slice(0, 6).join(' ');
        const more = errors.length > 6 ? ` (+${errors.length - 6} more)` : '';
        throw new ApiError(400, `Nothing imported — fix these lines first: ${shown}${more}`);
    }

    const count = await service.addImportedExpenses(req.session.userId, rows);

    ok(
        res,
        { count },
        `Imported ${count} record${count === 1 ? '' : 's'} as history. Account balances were not changed.`,
        201
    );
}));

module.exports = router;
