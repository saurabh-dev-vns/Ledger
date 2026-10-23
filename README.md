# Ledger

Simple personal expense tracker built with Node.js, Express, and PostgreSQL.

## Features

- Track expenses and income
- Manage multiple accounts
- Transfer money between accounts
- Set monthly budgets
- Track loans
- View dashboard and reports
- Download reports as Excel
- Reset password with email OTP

## Requirements

- Node.js 20+
- PostgreSQL

## Quick start

1. Clone the project

```bash
git clone https://github.com/saurabh-dev-vns/expense-tracker-node.git
cd expense-tracker-node
npm install
```

2. Create a database

```sql
CREATE DATABASE ledger;
```

3. Create a `.env` file in the project root

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ledger
PORT=3000
SESSION_SECRET=change-this-to-a-long-random-string
NODE_ENV=development

# Optional: email OTP reset in production
# RESEND_API_KEY=your-resend-api-key
# RESEND_FROM_EMAIL=you@yourdomain.com
```

4. Start the app

```bash
# Development
npm run dev

# Production
npm start
```

Open http://localhost:3000

The app creates its tables automatically on first run.

## Useful scripts

```bash
npm run dev
npm start
npm test
npm run lint
```

## Notes

- In development, if `RESEND_API_KEY` is not set, the password reset code is printed to the terminal instead of being emailed.
- Never commit your `.env` file to Git.

## License

MIT
