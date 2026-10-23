const { Pool, types } = require('pg');
const env = require('../config/env');
const logger = require('../core/logger');

// Return DATE columns (expense dates, budget months) as plain 'YYYY-MM-DD'
// strings instead of JS Date objects. Date objects are built at local
// midnight, which renders as "Thu Oct 22" in views and can shift by a
// day across timezones. TIMESTAMPTZ columns are unaffected.
types.setTypeParser(1082, value => value);

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.isProduction ? { rejectUnauthorized: false } : false,
  max: env.dbPoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', err => logger.error({ err }, 'Unexpected PostgreSQL pool error'));

module.exports = pool;
