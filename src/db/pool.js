const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../core/logger');

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.isProduction ? { rejectUnauthorized: false } : false,
  max: env.dbPoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', err => logger.error({ err }, 'Unexpected PostgreSQL pool error'));

module.exports = pool;
