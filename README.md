# Ledger — Expense Tracker (Node.js + Express + SQLite)

User accounts, a cash wallet and an online wallet, expense logging
(amount, notes, payment method, category), and a dashboard that keeps
balances in sync automatically. Server-rendered HTML (EJS) + plain CSS
— no frontend framework, no build step.

**Zero native dependencies.** Every package in `package.json` is pure
JavaScript — nothing needs `node-gyp`, Visual Studio Build Tools, or
any C++ compiler. The database uses Node's own built-in `node:sqlite`
module, so there isn't even an npm package for the database driver.
`npm install` just downloads plain `.js` files.

## What's included

```
expense-tracker-node/
├── server.js              Express app entry point
├── package.json
├── .env.example             copy to .env to override PORT / SESSION_SECRET
├── db/
│   └── init.js               node:sqlite connection + schema (auto-created on first run)
├── utils/
│   └── wallet.js              all wallet + expense logic (the money math lives here)
├── middleware/
│   └── auth.js                login guard, flash messages, CSRF check
├── routes/
│   ├── auth.js                register / login / logout
│   └── app.js                 dashboard, add balance, add expense, history, delete
├── views/                    EJS templates (server-rendered HTML)
│   ├── partials/header.ejs, footer.ejs
│   ├── login.ejs, register.ejs
│   ├── dashboard.ejs, add_balance.ejs, add_expense.ejs, expenses.ejs
│   └── 404.ejs
└── public/css/style.css      all styling — plain CSS, no framework
```

## 1. Requirements

- **Node.js 22.5 or newer** (Node 24 LTS is ideal). This is required
  because the app uses the built-in `node:sqlite` module, which only
  exists from Node 22.5 onward. Check your version with `node -v` —
  if it's older, install a current Node LTS from nodejs.org first.

No database server, no build tools, no Python/C++ toolchain needed.

## 2. Install & run

```bash
cd expense-tracker-node
npm install
npm start
```

Then open **http://localhost:3000**. Register an account and you're in.

You'll see one harmless line in the console the first time you run it:
`ExperimentalWarning: SQLite is an experimental feature and might
change at any time` — that's Node telling you `node:sqlite` is a newer
API, not an error. The app works fine.

For development with auto-restart on file changes:

```bash
npm run dev
```

## 3. Configuration (optional)

Copy `.env.example` to `.env` if you want to change the port or set a
real session secret:

```bash
cp .env.example .env
```

```
PORT=3000
SESSION_SECRET=a-long-random-string
```

The app runs fine with the defaults for local testing — just set a real
`SESSION_SECRET` before deploying it anywhere public (sessions are
stored in a signed cookie, so this secret is what makes them tamper-proof).

## 4. Deploying it for real

Any Node host works the same way it would for any other Express app:

- **VPS (a Linux server):** `npm install --production`, then run
  `node server.js` behind a process manager like `pm2` or `systemd`,
  with Nginx/Caddy reverse-proxying to it and terminating TLS.
- **Platforms with native Node support (Railway, Render, Fly.io, a
  plain Docker container, etc.):** point them at `npm start`. Make
  sure their Node runtime is 22.5+. Make sure the disk that holds
  `data.sqlite` persists between deploys/restarts — on platforms with
  ephemeral filesystems, mount a persistent volume for the project
  directory (or swap in a hosted Postgres/MySQL — see below).
- Set `SESSION_SECRET` as a real environment variable in production.
- Sessions live in the browser cookie now (not a server-side store),
  so there's nothing extra to persist for login state across restarts.

**Swapping SQLite for MySQL/Postgres:** everything that touches the
database goes through `db/init.js` (connection + schema) and
`utils/wallet.js` (queries), so moving to a hosted database means
swapping those two files — the routes and views don't change.

## How the balance auto-calculation works

- Every user gets a `wallets` row (`cash_balance`, `online_balance`) the
  moment they register.
- **Adding balance** (`POST /add-balance`) runs inside a manual SQL
  transaction (`BEGIN` / `COMMIT` / `ROLLBACK`, see `runInTransaction`
  in `utils/wallet.js`): it increments the chosen wallet column and
  writes a row to `balance_log`.
- **Adding an expense** (`POST /add-expense`) runs the same way: it
  decrements the matching wallet column (based on payment method) and
  inserts the expense row. The form is blocked server-side if the
  amount would take that wallet negative.
- **Deleting an expense** (`POST /expenses/:id/delete`) credits the
  amount back to whichever wallet it was originally paid from.

Because every write path is wrapped in a transaction, the wallet
balance and the expense/log history can never drift apart even if
something fails partway through — a thrown error rolls the whole
operation back automatically.

## Security notes

- Passwords are hashed with `bcryptjs`.
- Sessions are stored in a signed, `httpOnly` cookie (`cookie-session`)
  — the cookie can't be read or forged without `SESSION_SECRET`.
- All forms carry a CSRF token checked against the session before any
  write happens.
- All SQL uses parameterised prepared statements — no string-built
  queries.

## Extending it

- CSV export: query `getAllExpenses()` in `utils/wallet.js` and stream
  the rows as `text/csv` from a new route.
- Recurring expenses: a `setInterval`/cron job calling `addExpense()`
  on a schedule.
- Category budgets: add a `budgets` table and compare against
  `getCategoryBreakdown()` on the dashboard.
- A JSON API: the route handlers already separate the data layer
  (`utils/wallet.js`) from rendering, so adding `res.json(...)` routes
  alongside the EJS ones is a small change.
