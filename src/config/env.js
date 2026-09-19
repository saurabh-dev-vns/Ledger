/**
 * Central place for reading process.env. Nothing else in the app
 * should touch process.env directly — import from here instead, so
 * there's one place to see every configuration knob the app has.
 */
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Create a PostgreSQL database and set DATABASE_URL in your environment.');
}

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}

if (isProduction && !process.env.REDIS_URL) {
  throw new Error('REDIS_URL must be set in production.');
}

module.exports = {
  isProduction,
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  dbPoolMax: Number(process.env.DB_POOL_MAX || 10),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  // Used to email OTP codes for "forgot password". Optional in
  // development — if unset, the OTP is logged to the console instead
  // of emailed, so the flow can still be tested locally. Required in
  // production (checked lazily, only when someone actually requests a
  // reset, so installs that don't use this feature aren't forced to
  // configure it).
  resendApiKey: process.env.RESEND_API_KEY || null,
  resendFromEmail: process.env.RESEND_FROM_EMAIL || 'Ledger <onboarding@resend.dev>',

  logLevel: process.env.LOG_LEVEL || 'info'
};
