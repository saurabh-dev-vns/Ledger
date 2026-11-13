# Ledger JSON API (`/api`)

Used by the Next.js frontend (`web/`). The old server-rendered pages keep working next to it.

## Rules

- Bodies are JSON. Field names are the same as the old HTML forms (`account_id`, `payment_method`, `spent_on`, ...), without `csrf_token`.
- Call `GET /api/session` first. It returns the signed-in user (or `null`) and a `csrfToken`.
  Send that token as the `X-CSRF-Token` header on every POST / PATCH / DELETE.
  Login, register and restore return a **new** token (the session is regenerated): use the new one from then on.
- Success: `{ "ok": true, "data": ..., "message": "..." }` (`data` / `message` only when there is something to say).
  Failure: `{ "ok": false, "error": "..." }` with a matching status (400 validation, 401 signed out, 403 bad CSRF token, 404, 429, 500).
- The two AI endpoints keep the `{ ok, ... }` shape they had before.
- Responses are `Cache-Control: private, no-store`.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/session` | `{ user, csrfToken, pendingRestore }` |
| GET | `/api/meta` | categories, account types, savings parts, insight periods, `aiEnabled` |
| POST | `/api/auth/register` | `name, email, password, confirm_password` |
| POST | `/api/auth/login` | `email, password`. A soft-deleted account returns `user: null` + `pendingRestore` |
| POST | `/api/auth/logout` | |
| POST | `/api/auth/restore-account` · `/cancel` | after a login that returned `pendingRestore` |
| POST | `/api/auth/forgot-password` | `email` (always the same generic answer) |
| POST | `/api/auth/reset-password` | `email, otp, new_password, confirm_password` |
| GET | `/api/dashboard` | everything the dashboard shows |
| GET | `/api/accounts` | `{ accounts, wallet }` |
| POST | `/api/accounts` | `name, type, balance, credit_limit, cash_opening, bank_opening` |
| POST | `/api/accounts/:id/add` | `amount, note, part` |
| POST | `/api/accounts/:id/move` | `from, amount` (Savings cash <-> bank) |
| GET | `/api/funds-added` | `?from&to&account` -> `{ accounts, history: { rows, total, count, byAccount } }` |
| POST | `/api/funds-added` | `account_id, amount, note, part` (the "Add balance" form) |
| GET | `/api/expenses` | `?category&method&from&to` |
| POST | `/api/expenses` | `amount, notes, payment_method, category, spent_on, account_id, savings_part` |
| DELETE | `/api/expenses/:id` | credits the amount back |
| POST | `/api/expenses/import` | `data` (pasted lines); account balances are not changed |
| POST | `/api/transfers` | `from_account_id, to_account_id, amount, note, from_part, to_part` |
| GET | `/api/transactions` | `?from&to` |
| GET | `/api/budgets` | `?month=YYYY-MM` |
| POST | `/api/budgets` | `category, month, amount` |
| DELETE | `/api/budgets/:id` | |
| GET | `/api/loans` | |
| POST | `/api/loans` | `person, direction (owed_to_me / i_owe), amount, note` |
| POST | `/api/loans/:id/repay` | `amount` |
| GET | `/api/profile` | `{ profile, activity }` |
| PATCH | `/api/profile` | `name, email` |
| POST | `/api/profile/password` | `current_password, new_password, confirm_password` |
| POST | `/api/profile/delete` | `password` (soft delete, restorable for 30 days) |
| GET | `/api/reports` | same query as the page; 400 with `{ error, data: { form } }` for bad filters |
| GET | `/api/reports/export` | same query; downloads the `.xlsx` |
| POST | `/api/ai/parse-expense` | `text, today` (shares the old rate limit) |
| GET | `/api/insights` | `?period=day|week|month|year&today` |
| POST | `/api/insights/ai` | `period, today` |

## Notes for the frontend

- Money and dates come back exactly as the services produce them: amounts are numbers, dates are `YYYY-MM-DD` strings, database fields are snake_case (`cash_part`, `credit_limit`).
- Mutations return a ready-made `message` (the text the old pages showed as a flash), so the UI can show it as a toast.
