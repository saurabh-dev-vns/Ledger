const express = require('express');
const { checkCsrf, setFlash } = require('../../middleware/session');
const { money, formatDate, formatDateTime } = require('../../core/money');
const service = require('./profile.service');
const auditService = require('../audit/audit.service');

const router = express.Router();

router.get('/profile', async (req, res, next) => {
    try {
        res.render('profile', {
            pageTitle: 'Profile',
            profile: await service.getProfile(req.session.userId),
            activity: await auditService.getRecentActivity(req.session.userId, 20),
            money,
            formatDate,
            formatDateTime
        });
    } catch (e) {
        next(e);
    }
});

router.post('/profile', checkCsrf, async (req, res) => {
    try {
        const updated = await service.updateProfile(
            req.session.userId,
            req.body.name,
            req.body.email
        );

        req.session.userName = updated.name;
        setFlash(req, 'Profile updated.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/profile');
});

router.post('/profile/password', checkCsrf, async (req, res) => {
    try {
        await service.changePassword(
            req.session.userId,
            req.body.current_password,
            req.body.new_password,
            req.body.confirm_password
        );

        setFlash(req, 'Password changed.', 'success');
    } catch (e) {
        setFlash(req, e.message);
    }

    res.redirect('/profile');
});

router.post('/profile/delete', checkCsrf, async (req, res) => {
    try {
        await service.deleteAccount(req.session.userId, req.body.password);

        req.session.userId = null;
        req.session.userName = null;
        setFlash(req, 'Your account has been deleted. You can restore it within 30 days by logging back in.', 'success');

        return res.redirect('/login');
    } catch (e) {
        setFlash(req, e.message);
        res.redirect('/profile');
    }
});

module.exports = router;
