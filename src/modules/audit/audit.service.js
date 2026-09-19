const logger = require('../../core/logger');
const repo = require('./audit.repository');
const { actionLabel } = require('./audit.constants');

/**
 * Records an audit event. Deliberately never throws — a logging
 * failure should never break the real operation (e.g. a successful
 * login shouldn't fail just because the audit insert had a hiccup).
 * Failures are logged to the app logger instead.
 */
async function log(userId, action, details = null) {
    try {
        await repo.insert(userId, action, details);
    } catch (err) {
        logger.error({ err, userId, action }, 'Failed to write audit log entry');
    }
}

async function getRecentActivity(userId, limit = 20) {
    const rows = await repo.listRecentForUser(userId, limit);

    return rows.map(r => ({
        action: r.action,
        label: actionLabel(r.action),
        details: r.details,
        createdAt: r.created_at
    }));
}

module.exports = { log, getRecentActivity };
