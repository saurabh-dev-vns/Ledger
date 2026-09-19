const profileService = require('../modules/profile/profile.service');
const logger = require('../core/logger');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

async function runPurge() {
    try {
        const count = await profileService.purgeExpiredDeletedAccounts();
        if (count > 0) {
            logger.info({ count }, 'Purged accounts past their restore window');
        }
    } catch (err) {
        logger.error({ err }, 'Account purge job failed');
    }
}

/**
 * Runs the purge once immediately (in case the process was down when
 * accounts became eligible) and then on a recurring interval. Safe to
 * run from multiple instances concurrently — it's just a DELETE with a
 * WHERE clause, no coordination needed.
 */
function startAccountPurgeScheduler() {
    runPurge();
    const timer = setInterval(runPurge, CHECK_INTERVAL_MS);
    timer.unref(); // don't keep the process alive just for this timer
    return timer;
}

module.exports = { startAccountPurgeScheduler, runPurge };
