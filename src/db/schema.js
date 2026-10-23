const pool = require('./pool');
const logger = require('../core/logger');
const { mergeLegacySavings } = require('./savings-merge');

/**
 * Creates every table fresh, and migrates existing databases forward
 * (ADD COLUMN IF NOT EXISTS / DROP+ADD CONSTRAINT) so this is safe to
 * run on every boot, on a brand-new database or an existing one.
 */
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

    CREATE TABLE IF NOT EXISTS wallets (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cash_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      online_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS balance_log (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('cash','online')),
      amount NUMERIC(12,2) NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Remembers which one-time data migrations have already run.
    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

    CREATE TABLE IF NOT EXISTS accounts (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('cash','online','bank','savings','credit','emi','other')),
      balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      credit_limit NUMERIC(12,2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, name)
    );

    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2);

    -- Savings accounts keep a Cash part and a Bank part; balance is always their sum.
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cash_part NUMERIC(12,2);
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bank_part NUMERIC(12,2);

    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
    ALTER TABLE accounts ADD CONSTRAINT accounts_type_check
      CHECK (type IN ('cash','online','bank','savings','credit','emi','other'));

    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_balance_within_limit;
    ALTER TABLE accounts ADD CONSTRAINT accounts_balance_within_limit
      CHECK (credit_limit IS NULL OR balance <= credit_limit);

    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_savings_split;
    ALTER TABLE accounts ADD CONSTRAINT accounts_savings_split
      CHECK (
        type <> 'savings'
        OR (cash_part IS NOT NULL AND bank_part IS NOT NULL
            AND cash_part >= 0 AND bank_part >= 0
            AND balance = cash_part + bank_part)
      );

    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

    CREATE TABLE IF NOT EXISTS expenses (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      notes TEXT,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      category TEXT NOT NULL,
      spent_on DATE NOT NULL,
      account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL;
    ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS savings_part TEXT CHECK (savings_part IN ('cash','bank'));

    CREATE TABLE IF NOT EXISTS wallet_transfers (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_type TEXT NOT NULL,
      to_type TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      note TEXT,
      from_account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
      to_account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (from_type <> to_type OR from_account_id IS NOT NULL)
    );
    ALTER TABLE wallet_transfers ADD COLUMN IF NOT EXISTS from_account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL;
    ALTER TABLE wallet_transfers ADD COLUMN IF NOT EXISTS to_account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL;
    ALTER TABLE wallet_transfers ADD COLUMN IF NOT EXISTS from_part TEXT CHECK (from_part IN ('cash','bank'));
    ALTER TABLE wallet_transfers ADD COLUMN IF NOT EXISTS to_part TEXT CHECK (to_part IN ('cash','bank'));

    CREATE TABLE IF NOT EXISTS budgets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      month DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, category, month)
    );

    CREATE TABLE IF NOT EXISTS loans (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      person TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('owed_to_me','i_owe')),
      original_amount NUMERIC(12,2) NOT NULL CHECK (original_amount > 0),
      remaining_amount NUMERIC(12,2) NOT NULL CHECK (remaining_amount >= 0),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- "Funds added" history: every top-up / repayment, for every account
    -- type, tied to the account it went into.
    ALTER TABLE balance_log ADD COLUMN IF NOT EXISTS account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL;
    ALTER TABLE balance_log ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'topup';
    ALTER TABLE balance_log ADD COLUMN IF NOT EXISTS part TEXT CHECK (part IN ('cash','bank'));
    ALTER TABLE balance_log DROP CONSTRAINT IF EXISTS balance_log_type_check;
    ALTER TABLE balance_log ADD CONSTRAINT balance_log_type_check
      CHECK (type IN ('cash','online','bank','savings','credit','emi','other'));
    ALTER TABLE balance_log DROP CONSTRAINT IF EXISTS balance_log_kind_check;
    ALTER TABLE balance_log ADD CONSTRAINT balance_log_kind_check
      CHECK (kind IN ('topup','repayment'));
    CREATE INDEX IF NOT EXISTS idx_balance_log_account ON balance_log(account_id);

    CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, spent_on);
    CREATE INDEX IF NOT EXISTS idx_balance_log_user_date ON balance_log(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_wallet_transfers_user_date ON wallet_transfers(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at);

    INSERT INTO accounts(user_id, name, type, balance)
    SELECT u.id, 'Cash', 'cash', COALESCE(w.cash_balance, 0)
    FROM users u LEFT JOIN wallets w ON w.user_id=u.id
    WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.user_id=u.id AND a.name='Cash');

    INSERT INTO accounts(user_id, name, type, balance)
    SELECT u.id, 'Online', 'online', COALESCE(w.online_balance, 0)
    FROM users u LEFT JOIN wallets w ON w.user_id=u.id
    WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.user_id=u.id AND a.name='Online');

    UPDATE expenses e SET account_id = a.id
    FROM accounts a
    WHERE e.account_id IS NULL
      AND a.user_id=e.user_id
      AND LOWER(a.type)=LOWER(e.payment_method)
      AND a.name IN ('Cash','Online');

    -- Older rows only knew "cash" or "online": attach them to the default accounts.
    UPDATE balance_log bl SET account_id = a.id
    FROM accounts a
    WHERE bl.account_id IS NULL
      AND a.user_id = bl.user_id
      AND a.type = bl.type
      AND a.name IN ('Cash','Online');

    UPDATE wallet_transfers wt SET
      from_account_id = fa.id,
      to_account_id = ta.id
    FROM accounts fa, accounts ta
    WHERE wt.from_account_id IS NULL
      AND wt.to_account_id IS NULL
      AND fa.user_id=wt.user_id AND ta.user_id=wt.user_id
      AND LOWER(fa.type)=LOWER(wt.from_type)
      AND LOWER(ta.type)=LOWER(wt.to_type)
      AND fa.name IN ('Cash','Online') AND ta.name IN ('Cash','Online');
  `);

  // One-time: fold any existing "savings" accounts into the single
  // Savings account (Cash + Bank). Runs in its own transaction, so it
  // either fully applies or leaves the data exactly as it was.
  await runMigrationOnce('savings_merge_v1', mergeLegacySavings);

  // Exactly one Savings account per user (created after the merge above).
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_savings_per_user
     ON accounts(user_id) WHERE type = 'savings'`
  );

  logger.info('PostgreSQL database initialized.');
}

async function runMigrationOnce(name, fn) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const claimed = await client.query(
      `INSERT INTO app_migrations(name) VALUES($1)
       ON CONFLICT (name) DO NOTHING
       RETURNING name`,
      [name]
    );

    if (claimed.rows.length) {
      const result = await fn(client);
      logger.info({ migration: name, ...result }, 'Data migration applied');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initSchema };
