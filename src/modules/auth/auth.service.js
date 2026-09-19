const bcrypt = require('bcryptjs');
const repo = require('./auth.repository');
const accountsService = require('../accounts/accounts.service');
const auditService = require('../audit/audit.service');
const { ACTIONS } = require('../audit/audit.constants');
const { RESTORE_WINDOW_DAYS } = require('../profile/profile.constants');

function validateRegistration({ name, email, password, confirm }) {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!name || !email || !password) {
        throw new Error('Please fill in every field.');
    }
    if (!emailOk) {
        throw new Error('Enter a valid email address.');
    }
    if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
    }
    if (password !== confirm) {
        throw new Error('Passwords do not match.');
    }
}

async function register({ name, email, password, confirm }) {
    validateRegistration({ name, email, password, confirm });

    const existing = await repo.findByEmail(email);
    if (existing) {
        throw new Error('An account with that email already exists.');
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const user = await repo.insertUser(name, email, hash);

        await accountsService.ensureWallet(user.id);
        await auditService.log(user.id, ACTIONS.REGISTERED);

        return user;
    } catch (err) {
        // PostgreSQL unique constraint can still win if two registrations race.
        if (err.code === '23505') {
            throw new Error('An account with that email already exists.');
        }
        throw err;
    }
}

/**
 * Returns one of:
 *   - null                                  — wrong email/password
 *   - { id, name }                          — normal, active account
 *   - { id, name, pendingRestore, purgeAt } — correct credentials, but
 *     the account is soft-deleted and still within its restore window.
 *     The caller should NOT log this person in yet — send them to a
 *     confirmation step first (see the /restore-account routes).
 * A soft-deleted account whose restore window has already passed is
 * treated exactly like a wrong password, since it's due for permanent
 * deletion regardless of whether the purge job has run yet.
 */
async function login(email, password) {
    const user = await repo.findByEmail(email);

    if (!user) {
        // Nothing to attach a failed attempt to, and logging by raw
        // email would just be noise from typos/enumeration attempts.
        return null;
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
        await auditService.log(user.id, ACTIONS.LOGIN_FAILED);
        return null;
    }

    if (user.deleted_at) {
        const purgeAt = new Date(
            new Date(user.deleted_at).getTime() + RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000
        );

        if (Date.now() >= purgeAt.getTime()) {
            // Past its restore window — treat exactly like a failed
            // login, including for audit purposes; the account is due
            // for deletion regardless of whether the purge job has run.
            return null;
        }

        await auditService.log(user.id, ACTIONS.LOGIN_SUCCESS);
        return { id: user.id, name: user.name, pendingRestore: true, purgeAt };
    }

    await auditService.log(user.id, ACTIONS.LOGIN_SUCCESS);
    return { id: user.id, name: user.name };
}

/** Public-safe lookup for other modules (e.g. password reset) — never exposes password_hash. */
async function findByEmail(email) {
    const user = await repo.findByEmail(email);
    return user ? { id: user.id, name: user.name, email: user.email } : null;
}

module.exports = { register, login, findByEmail };
