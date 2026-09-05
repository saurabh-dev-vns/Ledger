# 💰 Ledger — Expense Tracker

> A simple, secure, and responsive personal expense tracker built with **Node.js, Express, EJS, and PostgreSQL**.

Ledger helps you keep track of your **expenses, accounts, cash/online balances, transfers, budgets, loans, and spending reports** — all from one dashboard.

---

## ✨ Features

### 💸 Expense Management
- Add expenses
- Choose an account/payment source
- Categorize spending
- Add notes
- Select custom expense dates
- Delete expenses
- Automatically restore deleted expense amounts

### 🏦 Account Management
- Create multiple accounts
- Cash account
- Online account
- Bank accounts
- Credit accounts
- Other accounts
- Add balance to any account
- Automatic balance updates

### 🔄 Money Transfers
- Transfer money between accounts
- Cash → Online
- Online → Cash
- Bank → Cash
- Account → Account
- Prevent transfers when balance is insufficient
- Transaction history

### 📊 Dashboard & Reports
- Total available balance
- Monthly spending
- Recent expenses
- Recent transfers
- Category breakdown
- Monthly spending trends
- Monthly reports

### 🎯 Budgets
- Create monthly category budgets
- Track budget spending
- Compare budget vs actual spending
- Update existing budgets
- Delete budgets

### 🤝 Loans / Money Owed
- Track money owed to you
- Track money you owe others
- Record repayments
- Track remaining amount
- Add notes to loans

---

## 🔐 Security

Ledger includes several security features:

- 🔒 Password hashing using `bcryptjs`
- 🍪 Secure cookie-based sessions
- 🛡️ CSRF token protection for POST requests
- 🔑 Protected authenticated routes
- 🗄️ Parameterized PostgreSQL queries
- 👤 User-specific data isolation
- 🔐 Production session configuration

Passwords are **never stored as plain text**.

---

## 🧰 Tech Stack

| Technology | Purpose |
|---|---|
| 🟢 Node.js | Backend runtime |
| 🚂 Express.js | Web server & routing |
| 🎨 EJS | Server-side HTML rendering |
| 🐘 PostgreSQL | Database |
| 🔐 bcryptjs | Password hashing |
| 🍪 cookie-session | Authentication sessions |
| 📦 dotenv | Environment configuration |
| 🐘 pg | PostgreSQL driver |
| 🎨 CSS | Responsive frontend styling |

---

## 🏗️ Architecture

```mermaid
flowchart TD
    A[🌐 Browser] --> B[Express App]

    B --> C[Auth Module Routes]
    B --> D[Feature Module Routes]

    C --> E[Session Middleware]
    D --> E

    E --> F1[Accounts Service]
    E --> F2[Expenses Service]
    E --> F3[Transfers Service]
    E --> F4[Budgets Service]
    E --> F5[Loans Service]
    E --> F6[Imports Service]
    E --> F7[Dashboard / Reports / Transactions]

    F7 --> F1
    F7 --> F2
    F7 --> F3
    F7 --> F4
    F7 --> F5

    F1 --> G1[Accounts Repository]
    F2 --> G2[Expenses Repository]
    F3 --> G3[Transfers Repository]
    F4 --> G4[Budgets Repository]
    F5 --> G5[Loans Repository]

    G1 --> H[(PostgreSQL)]
    G2 --> H
    G3 --> H
    G4 --> H
    G5 --> H

    D --> O[EJS Views]
    O --> A
```

Each feature module (`src/modules/<name>/`) is layered **routes → service → repository**, so a change to one feature's SQL or validation never touches another module's files.

---

## 📁 Project Structure

Ledger follows a **modular, layered architecture** — each feature (accounts, expenses, budgets, etc.) is a self-contained module with its own repository (raw SQL), service (business logic/validation), and routes (HTTP layer). This keeps features independent and easy to find, change, or hand off to a collaborator without touching unrelated code.

```text
ledger-expense-tracker/
│
├── 📄 server.js                 # Thin entrypoint: init DB, start listening
│
├── 📂 src/
│   ├── 📄 app.js                # Express app factory (middleware + route mounting)
│   │
│   ├── 📂 config/
│   │   └── env.js               # Centralized environment variable handling
│   │
│   ├── 📂 db/
│   │   ├── pool.js              # PostgreSQL connection pool
│   │   ├── schema.js            # Table creation & migrations
│   │   └── index.js
│   │
│   ├── 📂 core/
│   │   ├── money.js             # money()/round2()/formatDate() helpers
│   │   └── transaction.js       # runInTransaction() BEGIN/COMMIT/ROLLBACK wrapper
│   │
│   ├── 📂 middleware/
│   │   └── session.js           # requireLogin, flash messages, CSRF
│   │
│   └── 📂 modules/
│       ├── auth/                # Register, login, logout
│       ├── accounts/            # Cash/Bank/Credit Card/EMI accounts
│       ├── expenses/            # Add/list/delete expenses
│       ├── imports/             # Bulk-import historical spending
│       ├── transfers/           # Move money between accounts
│       ├── budgets/             # Monthly category budgets
│       ├── loans/               # Money owed / owed to you
│       ├── dashboard/           # Aggregates other modules for the home page
│       ├── reports/             # Monthly category reports
│       └── transactions/        # Combined expense + transfer feed
│           │
│           ├── *.constants.js   # Fixed lists (categories, account types)
│           ├── *.repository.js  # Raw parameterized SQL queries
│           ├── *.service.js     # Validation + business rules + transactions
│           └── *.routes.js      # Express routes, calls the service layer
│
├── 📂 public/
│   └── css/
│       └── style.css
│
├── 📂 views/                    # EJS templates (unchanged — see below)
│   ├── dashboard.ejs
│   ├── accounts.ejs
│   ├── ...
│   └── 📂 partials/
│
├── 📄 package.json
├── 📄 package-lock.json
├── 📄 .env.example
├── 📄 .gitignore
└── 📄 README.md
```

### Why this layout

- **`repository`** files never contain business logic — just SQL, parameterized, one query per exported function.
- **`service`** files own validation and any multi-table logic (e.g. `expenses.service.js` debits an account *and* inserts the expense row inside one DB transaction).
- **`routes`** files stay thin: parse the request, call one service function, flash a message, redirect/render.
- Cross-feature composition (like the dashboard, which needs accounts + expenses + budgets + loans all at once) lives in its own module that calls the other modules' *services* — never their repositories directly, so each module's storage details stay private to itself.
- `views/` and `public/` are untouched by this refactor — no template changes were needed since the render `locals` stayed identical.

---

# 🚀 Getting Started

## 1️⃣ Prerequisites

Make sure you have:

- **Node.js** installed
- **npm** installed
- **PostgreSQL** installed and running
- A PostgreSQL database created for Ledger

Check your installations:

```bash
node --version
npm --version
psql --version
```

---

## 2️⃣ Clone the Repository

```bash
git clone https://github.com/saurabh-dev-vns/expense-tracker-node/
cd expense-tracker-node
```


---

## 3️⃣ Install Dependencies

```bash
npm install
```

---

# 🐘 PostgreSQL Setup

Create a PostgreSQL database.

For example:

```sql
CREATE DATABASE ledger;
```

You don't need to manually create the application tables.

When the application starts, `db/init.js` automatically creates the required tables and indexes.

---

# ⚙️ Environment Variables

Create a `.env` file in the project root.

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/ledger

PORT=3000

SESSION_SECRET=change-this-to-a-long-random-string

NODE_ENV=development
```

### Environment variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/ledger` |
| `PORT` | Server port | `3000` |
| `SESSION_SECRET` | Secret used to sign sessions | Random long string |
| `NODE_ENV` | Application environment | `development` / `production` |

### ⚠️ Important

Never commit your real `.env` file or production secrets to GitHub.

---

# ▶️ Running the Application

## Development

```bash
npm run dev
```

You should see something similar to:

```text
PostgreSQL database initialized.
Ledger running at http://localhost:3000
```

Then open:

```text
http://localhost:3000
```

---

## Production

Set:

```env
NODE_ENV=production
SESSION_SECRET=your-long-random-secret
DATABASE_URL=your-production-postgresql-url
```

Then run:

```bash
npm start
```

---

# 🧭 Application Flow

```mermaid
flowchart LR
    A[Register] --> B[Login]
    B --> C[Dashboard]

    C --> D[Add Expense]
    C --> E[Accounts]
    C --> F[Transfer Money]
    C --> G[Budgets]
    C --> H[Loans]
    C --> I[Reports]
    C --> J[Transactions]

    D --> K[(PostgreSQL)]
    E --> K
    F --> K
    G --> K
    H --> K
    I --> K
    J --> K
```

---

# 💳 Accounts & Wallets

Ledger supports multiple account types:

```text
💵 Cash
🌐 Online
🏦 Bank
💳 Credit Card
📅 EMI / Installment
📦 Other
```

Credit Card and EMI accounts work differently from the rest: instead of a plain top-up balance, you set a **credit limit**. The account starts fully available, spending reduces the available amount, and repaying restores it — capped at the limit, just like a real card.

Every account has its own balance.

For example:

```text
Cash       ₹2,000
Online     ₹5,000
Bank      ₹10,000
------------------
Total     ₹17,000
```

The dashboard calculates the total from the user's accounts.

### Default Accounts

When a user account is created, Ledger automatically creates:

- `Cash`
- `Online`

Additional accounts can then be added from the **Accounts** page.

---

# 💸 Adding an Expense

An expense contains:

```text
Amount
Category
Payment Account
Date
Notes
```

Example:

```text
Amount: ₹250
Category: Food & Dining
Account: Cash
Date: 28/08/2026
Notes: Lunch
```

When the expense is saved:

```text
Cash Balance
₹2,000
   ↓
₹250 expense
   ↓
₹1,750
```

The expense and account balance are updated inside a PostgreSQL transaction.

---

# 🔄 Transferring Money

Money can be transferred between accounts.

Example:

```text
Cash
₹5,000
   │
   │ ₹1,000
   ▼
Online
₹2,000
```

After the transfer:

```text
Cash       ₹4,000
Online     ₹3,000
```

The total money remains unchanged.

Ledger also prevents transfers when the source account doesn't have enough balance.

---

# 🗑️ Deleting an Expense

Deleting an expense does more than remove the database record.

For example:

```text
Before

Cash = ₹1,000
Expense = ₹200
```

After deleting the expense:

```text
Cash = ₹1,200
```

The amount is automatically credited back to the account from which the expense was originally deducted.

---

# 🎯 Budgets

Budgets are created per category and month.

Example:

```text
August 2026

Food & Dining       ₹5,000
Transport           ₹2,000
Entertainment       ₹1,500
Shopping            ₹3,000
```

Ledger compares:

```text
Budget
  ↓
Actual spending
  ↓
Remaining amount
```

This makes it easy to see where you're spending more than planned.

---

# 🤝 Loans & Money Owed

Ledger can track both directions of money.

### Money owed to you

```text
Rahul owes you ₹2,000
```

### Money you owe

```text
You owe Amit ₹1,500
```

Repayments reduce the remaining amount.

Example:

```text
Original:   ₹2,000
Repayment:    ₹500
----------------
Remaining:  ₹1,500
```

---

# 📊 Reports

The Reports page lets you select a month and see:

- Total spending
- Spending by category
- Expenses for that month

Example:

```text
August 2026

Food & Dining       ₹4,250
Transport           ₹1,800
Shopping            ₹2,100
Entertainment         ₹750
---------------------------
Total               ₹8,900
```

---

# 📜 Transactions

The Transactions page combines:

- Expenses
- Account transfers

into a unified transaction feed.

This gives you a chronological view of activity instead of having to check expenses and transfers separately.

---

# 🗄️ Database Schema

Ledger automatically creates the following PostgreSQL tables:

```mermaid
erDiagram
    USERS ||--|| WALLETS : has
    USERS ||--o{ ACCOUNTS : owns
    USERS ||--o{ EXPENSES : records
    USERS ||--o{ BALANCE_LOG : tracks
    USERS ||--o{ WALLET_TRANSFERS : makes
    USERS ||--o{ BUDGETS : creates
    USERS ||--o{ LOANS : tracks

    ACCOUNTS ||--o{ EXPENSES : pays
    ACCOUNTS ||--o{ WALLET_TRANSFERS : source
    ACCOUNTS ||--o{ WALLET_TRANSFERS : destination

    USERS {
        bigint id PK
        text name
        text email UK
        text password_hash
        timestamptz created_at
    }

    ACCOUNTS {
        bigint id PK
        bigint user_id FK
        text name
        text type
        numeric balance
        timestamptz created_at
    }

    EXPENSES {
        bigint id PK
        bigint user_id FK
        numeric amount
        text category
        text payment_method
        date spent_on
        bigint account_id FK
    }

    BUDGETS {
        bigint id PK
        bigint user_id FK
        text category
        date month
        numeric amount
    }

    LOANS {
        bigint id PK
        bigint user_id FK
        text person
        text direction
        numeric original_amount
        numeric remaining_amount
    }
```

---

# 🛣️ Main Routes

## Authentication

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/register` | Registration page |
| `POST` | `/register` | Create account |
| `GET` | `/login` | Login page |
| `POST` | `/login` | Authenticate user |
| `POST` | `/logout` | Logout |

## Dashboard & Accounts

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/dashboard` | Main dashboard |
| `GET` | `/accounts` | View accounts |
| `POST` | `/accounts` | Create account |
| `POST` | `/accounts/:id/add` | Add money to account |
| `GET` | `/add-balance` | Add balance |
| `POST` | `/add-balance` | Update balance |

## Expenses

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/add-expense` | Expense form |
| `POST` | `/add-expense` | Create expense |
| `GET` | `/expenses` | View/filter expenses |
| `POST` | `/expenses/:id/delete` | Delete expense |

## Transfers

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/swap-balance` | Transfer form |
| `POST` | `/swap-balance` | Transfer money |

## Budgets

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/budgets` | View monthly budgets |
| `POST` | `/budgets` | Create/update budget |
| `POST` | `/budgets/:id/delete` | Delete budget |

## Loans

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/loans` | View loans |
| `POST` | `/loans` | Add loan |
| `POST` | `/loans/:id/repay` | Record repayment |

## Reports

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/reports` | Monthly expense report |
| `GET` | `/transactions` | Combined transaction history |

---

# 🧠 How Balance Updates Work

Ledger keeps account balances synchronized with financial operations.

### Expense

```text
Account
  │
  ├── subtract expense
  │
  ▼
Updated balance
```

### Transfer

```text
Source Account
      │
      ├── subtract
      │
      ▼
Destination Account
      │
      └── add
```

### Delete Expense

```text
Deleted Expense
      │
      └── restore amount
              │
              ▼
        Original Account
```

These operations use database transactions so that related changes are committed together.

---

# 📱 Responsive Design

Ledger includes a custom stylesheet under:

```text
public/css/style.css
```

The interface is designed to work across:

- 💻 Desktop
- 💻 Laptop
- 📱 Mobile
- 📟 Small-screen devices

The navigation and dashboard components adapt to smaller screen sizes.

---

# 🧪 Development

Start the development server:

```bash
npm run dev
```

The project uses Node's built-in watch mode, so the server automatically restarts when server-side files change.

---

# 🔧 Useful Development Commands

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run production server:

```bash
npm start
```

---

# 🐛 Troubleshooting

<details>
<summary><strong>❌ DATABASE_URL is not set</strong></summary>

Make sure your `.env` file contains:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/ledger
```

Then restart the server.

</details>

<details>
<summary><strong>❌ PostgreSQL connection error</strong></summary>

Check that PostgreSQL is running and that:

- Database name is correct
- Username is correct
- Password is correct
- Port is correct
- `DATABASE_URL` is valid

</details>

<details>
<summary><strong>❌ Account or expense isn't being created</strong></summary>

Check:

1. PostgreSQL is running.
2. `DATABASE_URL` is correct.
3. The server started without database errors.
4. Browser requests are reaching the server.
5. `SESSION_SECRET` is configured correctly in production.

The application logs database/server errors to the Node.js console.

</details>

<details>
<summary><strong>❌ Session/login problems in production</strong></summary>

Make sure:

```env
NODE_ENV=production
SESSION_SECRET=your-long-random-secret
```

The application uses secure cookies when running in production.

</details>

---

# 🚀 Deployment

Ledger can be deployed to a Node.js hosting platform with PostgreSQL support.

A typical deployment requires:

```text
Node.js application
        +
PostgreSQL database
        +
Environment variables
```

Set these environment variables on your hosting provider:

```env
DATABASE_URL=your-postgresql-connection-string
SESSION_SECRET=your-secure-random-secret
NODE_ENV=production
```

The application automatically initializes the PostgreSQL schema when it starts.

---

# 🔄 Data Initialization & Migration

Database initialization is handled by:

```text
src/db/schema.js
```

At startup, the application:

1. Connects to PostgreSQL
2. Creates required tables if they don't exist
3. Creates indexes
4. Adds required account columns (including `credit_limit` for Credit Card/EMI accounts)
5. Creates default Cash and Online accounts
6. Migrates legacy wallet balances into accounts
7. Links older expenses to accounts
8. Links older transfers to accounts

This makes the application more resilient when moving from the older wallet structure to the account-based structure.

---

# 📌 Expense Categories

Ledger supports expense categories such as:

```text
🍔 Food & Dining
🚗 Transport
🛒 Groceries
🛍️ Shopping
💡 Bills & Utilities
🏠 Rent
🎬 Entertainment
❤️ Health
📚 Education
✈️ Travel
📦 Other
```

---

# 🔒 Data Ownership

Each user's financial data is associated with their own `user_id`.

Authenticated routes only query data belonging to the logged-in user.

```text
User A
 ├── Accounts
 ├── Expenses
 ├── Budgets
 ├── Transfers
 └── Loans

User B
 ├── Accounts
 ├── Expenses
 ├── Budgets
 ├── Transfers
 └── Loans
```

Users don't share financial records with each other.

---

# 🛠️ Future Improvements

Some possible additions for future versions:

- 📈 Interactive charts
- 📤 Export expenses to CSV/Excel
- 📄 PDF reports
- 🔔 Budget alerts
- 🔍 Advanced transaction search
- 🔐 Password reset
- 👤 Profile settings
- 🌙 Dark mode
- 📱 Progressive Web App support
- 📊 More detailed analytics
- 🔁 Recurring expenses
- 💱 Multiple currencies
- ☁️ Automated backups

---

# 🤝 Contributing

Contributions are welcome.

### Adding a new feature module

Thanks to the modular layout, most new features don't touch existing code at all:

1. Create `src/modules/<feature>/` with `<feature>.repository.js` (SQL), `<feature>.service.js` (validation/logic), and `<feature>.routes.js` (Express routes).
2. Add any new tables to `src/db/schema.js` (it's safe to run repeatedly — use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
3. Mount the router in `src/app.js` — one line, inside `protectedRouter` if it needs login.
4. Add a view under `views/` if it renders a page.

If your feature needs data from another module (e.g. a report that needs both expenses and budgets), import that module's **service**, never its repository — that keeps each module's SQL private to itself.

### 1. Fork the repository

```bash
git fork <repository-url>
```

### 2. Create a branch

```bash
git checkout -b feature/my-feature
```

### 3. Make your changes

### 4. Commit

```bash
git commit -m "Add my feature"
```

### 5. Push

```bash
git push origin feature/my-feature
```

### 6. Open a Pull Request

---

# 📄 License

Add your preferred license here.

For example:

```text
MIT License
```

---

# 👨‍💻 Built With

Made with:

**Node.js + Express + PostgreSQL + EJS + JavaScript + CSS**

---


### 💰 Ledger

**Track it. Understand it. Control it.**

⭐ If you find Ledger useful, consider giving the repository a star!

