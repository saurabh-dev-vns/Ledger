# 💰 Ledger - Personal Expense Tracker

> Track your money. Understand your spending. Stay in control.

Ledger is a personal finance app built with **Node.js, Express, PostgreSQL, and Redis**. It runs entirely in your browser - no app store, no subscription, no data sent to third parties.

---

## ✨ What Can It Do?

| Feature | What you get |
|---|---|
| 💸 **Expenses** | Log spending by category, account, date, and notes |
| 🏦 **Accounts** | Cash, Online, Bank, Credit Card, EMI, and more |
| 🔄 **Transfers** | Move money between accounts with balance validation |
| 🎯 **Budgets** | Set monthly limits per category, track progress |
| 🤝 **Loans** | Track who owes you (and who you owe) |
| 📊 **Dashboard** | Live totals, recent activity, spending trends |
| 📈 **Reports** | Monthly category breakdown with totals |
| 📜 **Transactions** | Unified feed of expenses + transfers |
| 👤 **Profile** | Edit name/email, change password, delete account |
| 🔑 **Forgot Password** | 6-digit OTP sent to your email via Resend |

---

## 🚀 Quick Start

### 1. Prerequisites

You need these installed and running:

- [Node.js](https://nodejs.org) (v20 or later)
- [PostgreSQL](https://www.postgresql.org)
- [Redis](https://redis.io) - or run it via Docker: `docker run -d -p 6379:6379 redis`

```bash
node --version   # v20+
psql --version
redis-cli ping   # should reply PONG
```

---

### 2. Clone & Install

```bash
git clone https://github.com/saurabh-dev-vns/Ledger.git
cd expense-tracker-node
npm install
```

---

### 3. Create a PostgreSQL Database

```sql
CREATE DATABASE ledger;
```

> **Note:** You don't need to create any tables. The app creates them automatically on first boot.

---

### 4. Configure Environment

Create a `.env` file in the project root:

```env
# PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/ledger

# Redis (for sessions)
REDIS_URL=redis://127.0.0.1:6379

# App
PORT=3000
SESSION_SECRET=change-this-to-a-long-random-string
NODE_ENV=development

# Email (optional in dev - OTP prints to console if unset)
# RESEND_API_KEY=your-resend-api-key
# RESEND_FROM_EMAIL=you@yourdomain.com

# Logging
LOG_LEVEL=info
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Always | PostgreSQL connection string |
| `REDIS_URL` | ✅ Always | Redis connection string |
| `SESSION_SECRET` | ✅ In production | Long random string to sign session cookies |
| `NODE_ENV` | ✅ | `development` or `production` |
| `PORT` | Optional | Defaults to `3000` |
| `RESEND_API_KEY` | Optional in dev | Required in prod for password reset emails |
| `RESEND_FROM_EMAIL` | Optional | Defaults to Resend's shared sender |
| `LOG_LEVEL` | Optional | `trace` / `debug` / `info` / `warn` / `error` — defaults to `info` |

> ⚠️ Never commit your `.env` to Git. It's already in `.gitignore`.

---

### 5. Start the App

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

You should see:
```
INFO: PostgreSQL database initialized.
INFO: Redis client connected
INFO: Ledger running at http://localhost:3000
```

Open **http://localhost:3000** and register your first account.

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web framework | Express.js |
| Templating | EJS |
| Database | PostgreSQL (`pg`) |
| Session store | Redis (`connect-redis` + `express-session`) |
| Password hashing | bcryptjs |
| Logging | Pino + pino-http |
| Email | Resend API |
| Config | dotenv |

---

## 🔐 Security

- **Passwords** are hashed with bcrypt (never stored as plain text)
- **Sessions** are stored server-side in Redis - can be revoked instantly on logout
- **CSRF protection** on every POST request via a per-session token
- **Cookies** are `httpOnly`, `sameSite: lax`, and `secure` in production
- **SQL injection** prevention via parameterized queries throughout
- **Secrets never logged** - cookies and auth headers are redacted in all log output
- **Data isolation** - every query is scoped to the logged-in user's ID

---

## 📁 Project Structure

```
ledger-expense-tracker/
│
├── server.js                    # Entry point: connects DB + Redis, starts server
├── .env                         # Your local config (not committed)
│
├── src/
│   ├── app.js                   # Express app (middleware + routes)
│   ├── config/env.js            # All environment variables in one place
│   │
│   ├── db/
│   │   ├── pool.js              # PostgreSQL connection pool
│   │   ├── redis.js             # Redis client
│   │   └── schema.js            # Auto-creates tables on startup
│   │
│   ├── core/
│   │   ├── logger.js            # Pino logger (pretty in dev, JSON in prod)
│   │   ├── money.js             # Currency formatting helpers
│   │   ├── dates.js             # Month-range helpers for reports
│   │   └── transaction.js       # DB transaction wrapper
│   │
│   ├── middleware/
│   │   └── session.js           # requireLogin, flash messages, CSRF check
│   │
│   ├── jobs/
│   │   └── purge-deleted-accounts.js  # Hourly cleanup of expired deletions
│   │
│   └── modules/                 # One folder per feature
│       ├── auth/                # Register, login, logout
│       ├── accounts/            # Account types & balances
│       ├── expenses/            # Add, list, delete expenses
│       ├── transfers/           # Move money between accounts
│       ├── budgets/             # Monthly category budgets
│       ├── loans/               # Money owed tracking
│       ├── imports/             # Bulk-import historical expenses
│       ├── dashboard/           # Home page aggregator
│       ├── reports/             # Monthly spending reports
│       ├── transactions/        # Unified expense + transfer feed
│       ├── profile/             # Edit profile, delete account
│       ├── password-reset/      # Forgot password OTP flow
│       └── audit/               # "Recent activity" trail for users
│
├── views/                       # EJS templates
├── public/css/                  # Stylesheet
├── logs/                        # Log files (auto-created, not committed)
└── test/
    ├── dates.test.js            # Unit tests
    └── integration.test.js      # Full-stack tests against real PostgreSQL
```

Each module follows the same 3-layer pattern:

```
*.routes.js      →  HTTP layer (parse request, call service, redirect/render)
*.service.js     →  Business logic & validation
*.repository.js  →  Raw SQL queries (parameterized, one function per query)
```

---

## 📋 Logging

Logs are written to **two places simultaneously**:

| Environment | Console | File |
|---|---|---|
| Development | Coloured, readable (`pino-pretty`) | `logs/app.log` (JSON) |
| Production | JSON → stdout (for Datadog/Papertrail) | `logs/app.log` (JSON) |

Every HTTP request logs: method, path, status code, response time, and the **userId** of whoever made the request. Static assets (`/css/`, `/favicon`) are excluded to keep logs clean.

**Tail logs in real time:**
```bash
# Windows
Get-Content logs\app.log -Wait -Tail 20

# Linux/macOS
tail -f logs/app.log

# Filter errors only
Select-String '"level":50' logs\app.log     # Windows
grep '"level":50' logs/app.log              # Linux/macOS
```

---

## 🗑️ Account Deletion & Restore

Deleting your account doesn't delete your data immediately:

1. Account is marked deleted and you're logged out.
2. Your data is kept for **30 days**.
3. Log back in within 30 days → confirmation screen to restore everything.
4. After 30 days → permanently deleted by a background job.

---

## 🔑 Forgot Password

1. Go to `/forgot-password` and enter your email.
2. A **6-digit code** is emailed to you (valid for 10 minutes, max 5 attempts).
3. Go to `/reset-password`, enter the code and your new password.

> In development, if `RESEND_API_KEY` is not set, the OTP is printed to the console instead of emailed - so you can test without an email account.

---

## 🧪 Running Tests

```bash
# Set a test database (separate from your dev database)
$env:DATABASE_URL="postgresql://postgres:password@localhost:5432/ledger_test"

npm run lint   # Syntax check all .js files
npm test       # Unit tests + integration tests
```

Tests use Node's built-in test runner — no extra framework needed. Integration tests run against a real PostgreSQL database and clean up after themselves.

---

## 🌐 Deployment

Set these environment variables on your host (Render, Railway, Fly.io, etc.):

```env
NODE_ENV=production
DATABASE_URL=your-postgres-url
REDIS_URL=your-redis-url
SESSION_SECRET=a-long-random-string
RESEND_API_KEY=your-resend-key
RESEND_FROM_EMAIL=you@yourdomain.com
```

Then run:
```bash
npm start
```

The app creates all database tables on startup automatically.

---

## 🐛 Troubleshooting

<details>
<summary><strong>❌ "The client is closed" error on startup</strong></summary>

Redis isn't running or isn't reachable. Start Redis:
```bash
# Docker
docker run -d -p 6379:6379 redis

# Or check if it's running
redis-cli ping   # should reply: PONG
```

Then make sure `REDIS_URL` in your `.env` points to the right host/port.
</details>

<details>
<summary><strong>❌ DATABASE_URL is not set</strong></summary>

Your `.env` file is missing or in the wrong directory. Make sure it's in the project root (same folder as `server.js`) and contains:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/ledger
```
</details>

<details>
<summary><strong>❌ PostgreSQL connection refused</strong></summary>

Check that PostgreSQL is running:
```bash
# Windows
pg_ctl status

# Or test the port
Test-NetConnection -ComputerName localhost -Port 5432
```
</details>

<details>
<summary><strong>❌ Session/login not working in production</strong></summary>

Make sure all three are set:
```env
NODE_ENV=production
SESSION_SECRET=your-long-random-secret
REDIS_URL=your-redis-url
```
Sessions require Redis in production. Without it, every request will fail.
</details>

<details>
<summary><strong>❌ Password reset emails not sending</strong></summary>

Set `RESEND_API_KEY` in your `.env`. In development, if it's not set, the OTP is logged to the console — check your terminal output.
</details>

---

## 📄 License

MIT

---

**Track it. Understand it. Control it.**

⭐ If you find Ledger useful, give it a star!
