const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { runInTransaction } = require('../../core/transaction');
const authService = require('../auth/auth.service');
const profileService = require('../profile/profile.service');
const auditService = require('../audit/audit.service');
const { ACTIONS } = require('../audit/audit.constants');
const repo = require('./password-reset.repository');
const mailer = require('./password-reset.mailer');

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateOtp() {
    // 6-digit numeric code, zero-padded (e.g. "004821").
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

/**
 * Always resolves the same way regardless of whether the email exists,
 * so this endpoint can't be used to discover which emails are
 * registered. If the email does belong to an account, a fresh OTP is
 * generated, any earlier unused code is invalidated, and the new one
 * is emailed via Resend.
 */
async function requestReset(email) {
    email = normalizeEmail(email);

    const user = await authService.findByEmail(email);

    if (!user) {
        return;
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await runInTransaction(async client => {
        await repo.invalidateActiveOtps(user.id, client);
        await repo.insertOtp(user.id, otpHash, expiresAt, client);
    });

    // Sent after the DB commit: if Resend is briefly unavailable, the
    // code still exists and the person can hit "resend" to try again
    // rather than losing a validly-stored OTP to a rolled-back email step.
    await mailer.sendOtpEmail(email, user.name, otp);
    await auditService.log(user.id, ACTIONS.PASSWORD_RESET_REQUESTED);
}

/**
 * Verifies the OTP and, if valid, sets the new password. Uses one
 * generic error message for "no such user", "no active code", "wrong
 * code", and "too many attempts" alike, so a caller can't distinguish
 * an unregistered email from a wrong code.
 */
async function verifyAndReset(email, otp, newPassword, confirmPassword) {
    email = normalizeEmail(email);
    otp = String(otp || '').trim();

    const genericError = 'That code is invalid or has expired. Request a new one.';

    if (!/^\d{6}$/.test(otp)) {
        throw new Error(genericError);
    }

    if (newPassword !== confirmPassword) {
        throw new Error('New passwords do not match.');
    }

    if (!newPassword || newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters.');
    }

    const user = await authService.findByEmail(email);

    if (!user) {
        throw new Error(genericError);
    }

    // Every branch here must actually commit (an increment, or marking
    // the code used) even when the overall attempt fails — so we return
    // a result and throw *after* the transaction commits, rather than
    // throwing inside it, which would roll back the very side-effects
    // (like the attempt counter) that lockout depends on.
    const result = await runInTransaction(async client => {
        const active = await repo.findActiveOtpForUpdate(user.id, client);

        if (!active) {
            return { ok: false, reason: 'none' };
        }

        if (active.attempts >= MAX_ATTEMPTS) {
            await repo.markUsed(active.id, client);
            return { ok: false, reason: 'locked' };
        }

        const matches = await bcrypt.compare(otp, active.otp_hash);

        if (!matches) {
            await repo.incrementAttempts(active.id, client);
            return { ok: false, reason: 'wrong' };
        }

        await repo.markUsed(active.id, client);
        return { ok: true };
    });

    if (!result.ok) {
        if (result.reason === 'locked') {
            throw new Error('Too many incorrect attempts. Request a new code.');
        }
        throw new Error(genericError);
    }

    // The OTP is already burned at this point (can't be replayed) even
    // if this next step somehow fails — the person just requests a new one.
    await profileService.resetPasswordDirectly(user.id, newPassword);
    await auditService.log(user.id, ACTIONS.PASSWORD_RESET_COMPLETED);
}

module.exports = { requestReset, verifyAndReset };
