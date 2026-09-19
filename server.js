const env = require('./src/config/env');
const pool = require('./src/db/pool');
const { initSchema } = require('./src/db/schema');
const { createApp } = require('./src/app');
const { startAccountPurgeScheduler } = require('./src/jobs/purge-deleted-accounts');
const logger = require('./src/core/logger');
const redisClient = require('./src/db/redis');

// ---------------------------------------------------------------------------
// Global error safety net
// ---------------------------------------------------------------------------

// Catches any promise rejection that wasn't caught by a try/catch.
// Without this, Node prints to stderr and may crash silently with no
// structured log entry — making the failure invisible to log aggregators.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

// Catches synchronous throws that bubble all the way to the top.
// Same reasoning — we want a fatal structured log before the process dies.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

// Closes all open connections cleanly before the process exits.
// Triggered by: Ctrl+C in dev, SIGTERM from the OS/Docker/Render on deploys.
// Without this, in-flight requests get dropped, Postgres connections leak,
// and Redis may not flush its write-behind buffer.
async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received — closing connections');
  try {
    await pool.end();
    await redisClient.quit();
    logger.info('All connections closed. Goodbye.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker / Render / systemd
process.on('SIGINT',  () => shutdown('SIGINT'));  // Ctrl+C in terminal

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  try {
    await initSchema();
    await pool.query('SELECT 1');
    logger.info('PostgreSQL database initialized.');

    // Redis v4+ requires an explicit connect() before any commands.
    await redisClient.connect();

    const app = createApp();

    app.listen(env.port, () => {
      logger.info(`Ledger running at http://localhost:${env.port}`);
    });

    startAccountPurgeScheduler();
  } catch (err) {
    logger.fatal({ err }, 'Failed to start application');
    await pool.end().catch(() => {});
    await redisClient.quit().catch(() => {});
    process.exit(1);
  }
}

start();
