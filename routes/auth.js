const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/init');
const wallet = require('../utils/wallet');
const { redirectIfLoggedIn, setFlash, checkCsrf } = require('../middleware/auth');

const router = express.Router();

router.get('/register', redirectIfLoggedIn, (req, res) => {
  res.render('register', { pageTitle: 'Create account' });
});

router.post('/register', redirectIfLoggedIn, checkCsrf, (req, res) => {
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
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      setFlash(req, 'An account with that email already exists.');
    } else {
      const hash = bcrypt.hashSync(password, 10);
      const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        .run(name, email, hash);
      wallet.ensureWallet(info.lastInsertRowid);

      req.session.userId = info.lastInsertRowid;
      req.session.userName = name;
      return res.redirect('/dashboard');
    }
  }
  res.redirect('/register');
});

router.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('login', { pageTitle: 'Sign in' });
});

router.post('/login', redirectIfLoggedIn, checkCsrf, (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  const user = db.prepare('SELECT id, name, password_hash FROM users WHERE email = ?').get(email);

  if (user && bcrypt.compareSync(password, user.password_hash)) {
    req.session.userId = user.id;
    req.session.userName = user.name;
    return res.redirect('/dashboard');
  }

  setFlash(req, 'Incorrect email or password.');
  res.redirect('/login');
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
