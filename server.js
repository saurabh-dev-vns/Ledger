require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const { initDb, pool } = require('./db/init');
const { locals } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/app');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
  maxAge: 1000 * 60 * 60 * 24 * 7,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}));

app.use(locals);

app.get('/', (req, res) => {
  res.redirect(req.session.userId ? '/dashboard' : '/login');
});

app.use('/', authRoutes);
app.use('/', appRoutes);

app.use((req, res) => {
  res.status(404).render('404', { pageTitle: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).send('Something went wrong. Please try again.');
});

async function start() {
  try {
    await initDb();
    await pool.query('SELECT 1');

    app.listen(PORT, () => {
      console.log(`Ledger running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start application:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

start();
