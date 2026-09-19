const pino = require('pino');
const path = require('path');
const env = require('../config/env');

/**
 * App-wide structured logger with dual output:
 *
 *  ┌─────────────┬──────────────────────────────────┬────────────────────────┐
 *  │ Environment │ Console                          │ File                   │
 *  ├─────────────┼──────────────────────────────────┼────────────────────────┤
 *  │ development │ pino-pretty (coloured, readable) │ logs/app.log  (JSON)   │
 *  │ production  │ JSON → stdout (for aggregators)  │ logs/app.log  (JSON)   │
 *  └─────────────┴──────────────────────────────────┴────────────────────────┘
 *
 * The file always receives raw JSON — one line per log entry — so it can
 * be tailed, shipped to a SIEM, or rotated by logrotate / Docker log drivers.
 *
 * Use this everywhere instead of console.log/console.error.
 */

const LOG_FILE = path.join(__dirname, '..', '..', 'logs', 'app.log');

// Build the list of transport targets.
// pino runs each target in its own worker thread, so writing to a file
// never blocks the event loop.
const targets = [
    // ── Always: write JSON to logs/app.log ──────────────────────────────
    // `mkdir: true` creates the logs/ directory automatically if missing.
    {
        target: 'pino/file',
        level: env.logLevel,
        options: { destination: LOG_FILE, mkdir: true }
    },

    // ── Console output (differs by environment) ──────────────────────────
    env.isProduction
        // Production: raw JSON to stdout so Docker / Render / Datadog can
        // capture and index it. destination 1 = stdout file descriptor.
        ? {
            target: 'pino/file',
            level: env.logLevel,
            options: { destination: 1 }
        }
        // Development: human-readable, colourised output.
        : {
            target: 'pino-pretty',
            level: env.logLevel,
            options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname'
            }
        }
];

const logger = pino(
    { level: env.logLevel },
    pino.transport({ targets })
);

module.exports = logger;
