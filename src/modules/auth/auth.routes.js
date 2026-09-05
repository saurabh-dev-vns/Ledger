const express = require('express');
const { redirectIfLoggedIn, setFlash, checkCsrf } = require('../../middleware/session');
const service = require('./auth.service');

const router = express.Router();

router.get('/register', redirectIfLoggedIn, (req, res) => {
    res.render('register', { pageTitle: 'Create account' });
});

router.post('/register', redirectIfLoggedIn, checkCsrf, async (req, res) => {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const confirm = req.body.confirm_password || '';

    try {
        const user = await service.register({ name, email, password, confirm });

        req.session.userId = user.id;
        req.session.userName = user.name;

        return res.redirect('/dashboard');
    } catch (err) {
        setFlash(req, err.message);
        return res.redirect('/register');
    }
});

router.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('login', { pageTitle: 'Sign in' });
});

router.post('/login', redirectIfLoggedIn, checkCsrf, async (req, res, next) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    try {
        const user = await service.login(email, password);

        if (user) {
            req.session.userId = user.id;
            req.session.userName = user.name;
            return res.redirect('/dashboard');
        }

        setFlash(req, 'Incorrect email or password.');
        res.redirect('/login');
    } catch (err) {
        next(err);
    }
});

router.post('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

module.exports = router;
