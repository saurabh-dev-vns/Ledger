// How long a soft-deleted account can be restored by logging back in
// before it's permanently purged. Shared with the auth module, which
// needs it to decide whether a login during the grace period should
// offer restoration or be treated as if the account no longer exists.
const RESTORE_WINDOW_DAYS = 30;

module.exports = { RESTORE_WINDOW_DAYS };
