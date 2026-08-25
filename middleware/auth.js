const crypto = require('crypto');

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

function redirectIfLoggedIn(req, res, next) {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
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
