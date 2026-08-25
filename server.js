require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const { locals } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/app');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessions are stored client-side in a signed, httpOnly cookie — no session
// store/database needed, and no native dependencies to install.
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  httpOnly: true,
  sameSite: 'lax',
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

app.listen(PORT, () => {
  console.log(`Ledger running at http://localhost:${PORT}`);
});
