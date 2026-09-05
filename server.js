const env = require('./src/config/env');
const pool = require('./src/db/pool');
const { initSchema } = require('./src/db/schema');
const { createApp } = require('./src/app');

async function start() {
  try {
    await initSchema();
    await pool.query('SELECT 1');

    const app = createApp();

    app.listen(env.port, () => {
      console.log(`Ledger running at http://localhost:${env.port}`);
    });
  } catch (err) {
    console.error('Failed to start application:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

start();
