const express = require('express');
const { checkCsrf, setFlash } = require('../../middleware/session');
const service = require('./imports.service');

const router = express.Router();

router.get('/import-expenses', async (req, res, next) => {
    try {
        res.render('import_expenses', {
            pageTitle: 'Import past expenses'
        });
    } catch (e) {
        next(e);
    }
});

router.post('/import-expenses', checkCsrf, async (req, res) => {
    try {
        const { rows, errors } = service.parseImportLines(req.body.data);

        if (errors.length) {
            const shown = errors.slice(0, 6).join(' ');
            const more = errors.length > 6 ? ` (+${errors.length - 6} more)` : '';
            setFlash(req, `Nothing imported — fix these lines first: ${shown}${more}`);
            return res.redirect('/import-expenses');
        }

        const count = await service.addImportedExpenses(req.session.userId, rows);

        setFlash(
            req,
            `Imported ${count} record${count === 1 ? '' : 's'} as history. Account balances were not changed.`,
            'success'
        );

        return res.redirect('/expenses');
    } catch (e) {
        setFlash(req, e.message);
        res.redirect('/import-expenses');
    }
});

module.exports = router;
