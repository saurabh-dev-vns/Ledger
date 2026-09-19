// Every action that gets recorded in a user's activity trail, with a
// human-friendly label for display on the Profile page.
const ACTIONS = {
    REGISTERED: 'registered',
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILED: 'login_failed',
    PASSWORD_CHANGED: 'password_changed',
    PASSWORD_RESET_REQUESTED: 'password_reset_requested',
    PASSWORD_RESET_COMPLETED: 'password_reset_completed',
    PROFILE_UPDATED: 'profile_updated',
    ACCOUNT_DELETED: 'account_deleted',
    ACCOUNT_RESTORED: 'account_restored'
};

const ACTION_LABELS = {
    [ACTIONS.REGISTERED]: 'Created account',
    [ACTIONS.LOGIN_SUCCESS]: 'Signed in',
    [ACTIONS.LOGIN_FAILED]: 'Failed sign-in attempt',
    [ACTIONS.PASSWORD_CHANGED]: 'Changed password',
    [ACTIONS.PASSWORD_RESET_REQUESTED]: 'Requested a password reset code',
    [ACTIONS.PASSWORD_RESET_COMPLETED]: 'Reset password via email code',
    [ACTIONS.PROFILE_UPDATED]: 'Updated profile',
    [ACTIONS.ACCOUNT_DELETED]: 'Deleted account',
    [ACTIONS.ACCOUNT_RESTORED]: 'Restored account'
};

function actionLabel(action) {
    return ACTION_LABELS[action] || action;
}

module.exports = { ACTIONS, ACTION_LABELS, actionLabel };
