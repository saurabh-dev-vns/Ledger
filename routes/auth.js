const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/init');
const wallet = require('../utils/wallet');
const {
    redirectIfLoggedIn,
    setFlash,
    checkCsrf
} = require('../middleware/auth');

const router = express.Router();

router.get('/register', redirectIfLoggedIn, (req, res) => {
    res.render('register', { pageTitle: 'Create account' });
});

router.post(
    '/register',
    redirectIfLoggedIn,
    checkCsrf,
    async (req, res, next) => {
        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';
        const confirm = req.body.confirm_password || '';

        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!name || !email || !password) {
            setFlash(req, 'Please fill in every field.');
        } else if (!emailOk) {
            setFlash(req, 'Enter a valid email address.');
        } else if (password.length < 6) {
            setFlash(req, 'Password must be at least 6 characters.');
        } else if (password !== confirm) {
            setFlash(req, 'Passwords do not match.');
        } else {
            try {
                const existingResult = await pool.query(
                    'SELECT id FROM users WHERE email = $1',
                    [email]
                );

                if (existingResult.rows[0]) {
                    setFlash(
                        req,
                        'An account with that email already exists.'
                    );
                } else {
                    const hash = await bcrypt.hash(password, 10);

                    const result = await pool.query(
                        `INSERT INTO users (name, email, password_hash)
                         VALUES ($1, $2, $3)
                         RETURNING id`,
                        [name, email, hash]
                    );

                    const userId = result.rows[0].id;

                    await wallet.ensureWallet(userId);

                    req.session.userId = userId;
                    req.session.userName = name;

                    return res.redirect('/dashboard');
                }
            } catch (err) {
                // PostgreSQL unique constraint can still win if two registrations race.
                if (err.code === '23505') {
                    setFlash(
                        req,
                        'An account with that email already exists.'
                    );
                } else {
                    return next(err);
                }
            }
        }

        res.redirect('/register');
    }
);

router.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('login', { pageTitle: 'Sign in' });
});

router.post(
    '/login',
    redirectIfLoggedIn,
    checkCsrf,
    async (req, res, next) => {
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';

        try {
            const result = await pool.query(
                'SELECT id, name, password_hash FROM users WHERE email = $1',
                [email]
            );

            const user = result.rows[0];

            if (
                user &&
                await bcrypt.compare(password, user.password_hash)
            ) {
                req.session.userId = user.id;
                req.session.userName = user.name;

                return res.redirect('/dashboard');
            }

            setFlash(req, 'Incorrect email or password.');
            res.redirect('/login');
        } catch (err) {
            next(err);
        }
    }
);

router.post('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

module.exports = router;