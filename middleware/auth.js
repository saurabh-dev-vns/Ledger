const crypto = require('crypto');
const { pool } = require('../db/init');

async function findSessionUser(req) {
  if (!req.session.userId) return null;

  const result = await pool.query(
    'SELECT id, name FROM users WHERE id = $1',
    [req.session.userId]
  );

  return result.rows[0] || null;
}

async function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    const user = await findSessionUser(req);
    if (!user) {
      req.session = null;
      return res.redirect('/login');
    }

    req.session.userName = user.name;
    next();
  } catch (err) {
    next(err);
  }
}

async function redirectIfLoggedIn(req, res, next) {
  if (!req.session.userId) return next();

  try {
    const user = await findSessionUser(req);
    if (user) {
      req.session.userName = user.name;
      return res.redirect('/dashboard');
    }

    req.session = null;
    next();
  } catch (err) {
    next(err);
  }
}

/** Makes res.locals.flash / res.locals.currentUser / res.locals.csrfToken available in every view. */
function locals(req, res, next) {
  res.locals.flash = req.session.flash || null;
  req.session.flash = null;

  res.locals.currentUser = req.session.userId
    ? { id: req.session.userId, name: req.session.userName }
    : null;

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  next();
}

function setFlash(req, message, type = 'error') {
  req.session.flash = { message, type };
}

/** Verifies the csrf_token field on POST bodies. */
function checkCsrf(req, res, next) {
  const token = req.body.csrf_token;
  if (!token || token !== req.session.csrfToken) {
    setFlash(req, 'Your session expired. Please try again.');
    return res.redirect('back');
  }
  next();
}

module.exports = { requireLogin, redirectIfLoggedIn, locals, setFlash, checkCsrf };
