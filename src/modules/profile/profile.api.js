const express = require('express');
const { route, ok } = require('../../api/http');
const service = require('./profile.service');
const auditService = require('../audit/audit.service');

const router = express.Router();

router.get('/profile', route(async (req, res) => {
    const uid = req.session.userId;

    ok(res, {
        profile: await service.getProfile(uid),
        activity: await auditService.getRecentActivity(uid, 20)
    });
}));

router.patch('/profile', route(async (req, res) => {
    const updated = await service.updateProfile(req.session.userId, req.body.name, req.body.email);

    req.session.userName = updated.name;
    ok(res, { name: updated.name, email: updated.email }, 'Profile updated.');
}));

router.post('/profile/password', route(async (req, res) => {
    await service.changePassword(
        req.session.userId,
        req.body.current_password,
        req.body.new_password,
        req.body.confirm_password
    );

    ok(res, undefined, 'Password changed.');
}));

router.post('/profile/delete', route(async (req, res) => {
    await service.deleteAccount(req.session.userId, req.body.password);

    req.session.userId = null;
    req.session.userName = null;

    ok(res, undefined, 'Your account has been deleted. You can restore it within 30 days by logging back in.');
}));

module.exports = router;
