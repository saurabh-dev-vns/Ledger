/**
 * End-to-end checks against a real PostgreSQL database (see
 * .github/workflows/ci.yml for how CI provisions one; for local runs,
 * point DATABASE_URL at any throwaway Postgres database).
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/ledger_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

const { initSchema } = require('../src/db/schema');

const authService = require('../src/modules/auth/auth.service');
const accountsService = require('../src/modules/accounts/accounts.service');
const expensesService = require('../src/modules/expenses/expenses.service');
const transfersService = require('../src/modules/transfers/transfers.service');
const budgetsService = require('../src/modules/budgets/budgets.service');
const loansService = require('../src/modules/loans/loans.service');
const importsService = require('../src/modules/imports/imports.service');
const transactionsService = require('../src/modules/transactions/transactions.service');

let user;
let userEmail;

before(async () => {
    await initSchema();

    userEmail = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    user = await authService.register({
        name: 'Test User',
        email: userEmail,
        password: 'password1',
        confirm: 'password1'
    });
});

test('duplicate registration is rejected', async () => {
    const email = `dup-${Date.now()}@example.com`;
    await authService.register({ name: 'A', email, password: 'password1', confirm: 'password1' });

    await assert.rejects(
        () => authService.register({ name: 'B', email, password: 'password1', confirm: 'password1' }),
        /already exists/
    );
});

test('login succeeds with correct password, fails with wrong password', async () => {
    const ok = await authService.login(userEmail, 'password1');
    assert.ok(ok, 'login should succeed with correct password');

    const wrongPassword = await authService.login(userEmail, 'wrong-password');
    assert.equal(wrongPassword, null);

    const bad = await authService.login('nonexistent@example.com', 'password1');
    assert.equal(bad, null);
});

test('every new user gets default Cash and Online accounts', async () => {
    const accounts = await accountsService.getAccounts(user.id);
    const names = accounts.map(a => a.name).sort();
    assert.deepEqual(names, ['Cash', 'Online']);
});

test('topping up an account increases its balance', async () => {
    let accounts = await accountsService.getAccounts(user.id);
    const cashId = accounts.find(a => a.name === 'Cash').id;

    await accountsService.updateAccountBalance(user.id, cashId, 5000, 'salary');

    accounts = await accountsService.getAccounts(user.id);
    assert.equal(accounts.find(a => a.id === cashId).balance, 5000);
});

test('Credit Card account starts fully available at its limit', async () => {
    const ccId = await accountsService.addAccount(user.id, 'Test Credit Card', 'credit', 0, 10000);
    const accounts = await accountsService.getAccounts(user.id);
    const cc = accounts.find(a => a.id === ccId);

    assert.equal(cc.balance, 10000);
    assert.equal(cc.credit_limit, 10000);
});

test('spending on a Credit Card reduces available credit, repaying restores it up to the limit', async () => {
    const ccId = await accountsService.addAccount(user.id, 'CC ' + Date.now(), 'credit', 0, 10000);

    await expensesService.addExpense(user.id, 3000, 'Shopping', 'credit', 'Shopping', '2026-01-15', ccId);
    let accounts = await accountsService.getAccounts(user.id);
    assert.equal(accounts.find(a => a.id === ccId).balance, 7000);

    const repay = await accountsService.updateAccountBalance(user.id, ccId, 3000, 'bill payment');
    assert.equal(repay.balance, 10000);
    assert.equal(repay.applied, 3000);
});

test('overpaying a Credit Card caps at the limit instead of exceeding it', async () => {
    const ccId = await accountsService.addAccount(user.id, 'CC ' + Date.now(), 'credit', 0, 10000);
    await expensesService.addExpense(user.id, 4000, 'Groceries', 'credit', 'Groceries', '2026-01-16', ccId);

    const result = await accountsService.updateAccountBalance(user.id, ccId, 5000, 'overpay');

    assert.equal(result.applied, 4000, 'only the amount actually owed should be applied');
    assert.equal(result.balance, 10000, 'balance should be capped at the credit limit');
});

test('deleting an expense on a Credit Card credits it back without exceeding the limit', async () => {
    const ccId = await accountsService.addAccount(user.id, 'CC ' + Date.now(), 'credit', 0, 10000);
    const marker = 'Groceries ' + Date.now();
    await expensesService.addExpense(user.id, 4000, marker, 'credit', 'Groceries', '2026-01-16', ccId);

    // Repay in full (including "overpaying", which is capped) so the account
    // is back at its limit before the old expense is deleted.
    await accountsService.updateAccountBalance(user.id, ccId, 10000, 'full repayment');

    const recent = await expensesService.getRecentExpenses(user.id, 50);
    const target = recent.find(e => e.notes === marker);
    assert.ok(target, 'the expense we just created should be findable');

    // Should not throw a "balance exceeds credit_limit" constraint error.
    const deleted = await expensesService.deleteExpense(user.id, target.id);
    assert.equal(deleted, true);

    const accounts = await accountsService.getAccounts(user.id);
    assert.equal(accounts.find(a => a.id === ccId).balance, 10000, 'balance should stay capped at the limit, not exceed it');
});

test('EMI account behaves the same as a Credit Card', async () => {
    const emiId = await accountsService.addAccount(user.id, 'EMI ' + Date.now(), 'emi', 0, 20000);
    await expensesService.addExpense(user.id, 15000, 'Laptop EMI', 'emi', 'Shopping', '2026-01-10', emiId);

    const accounts = await accountsService.getAccounts(user.id);
    assert.equal(accounts.find(a => a.id === emiId).balance, 5000);
});

test('a transfer that would exceed the destination credit limit is rejected, and no money moves', async () => {
    const ccId = await accountsService.addAccount(user.id, 'CC ' + Date.now(), 'credit', 0, 1000);
    let accounts = await accountsService.getAccounts(user.id);
    const cashId = accounts.find(a => a.name === 'Cash').id;
    const cashBefore = accounts.find(a => a.name === 'Cash').balance;

    await assert.rejects(
        () => transfersService.transfer(user.id, cashId, ccId, 999999, 'too much'),
        /credit limit/
    );

    accounts = await accountsService.getAccounts(user.id);
    assert.equal(accounts.find(a => a.name === 'Cash').balance, cashBefore, 'source balance must be unchanged after a rejected transfer');
});

test('importing historical expenses does not change any account balance', async () => {
    const accounts = await accountsService.getAccounts(user.id);
    const cashBefore = accounts.find(a => a.name === 'Cash').balance;

    const { rows, errors } = importsService.parseImportLines(
        '2026-01-01, 250\n2026-01-02, 180, Auto fare\nnot a valid line'
    );

    assert.equal(errors.length, 1, 'should flag exactly the one bad line');
    assert.equal(rows.length, 2);

    const count = await importsService.addImportedExpenses(user.id, rows);
    assert.equal(count, 2);

    const accountsAfter = await accountsService.getAccounts(user.id);
    assert.equal(accountsAfter.find(a => a.name === 'Cash').balance, cashBefore);
});

test('budgets validate category and amount', async () => {
    await assert.rejects(() => budgetsService.upsertBudget(user.id, 'NotACategory', '2026-01', 100));
    await assert.rejects(() => budgetsService.upsertBudget(user.id, 'Shopping', '2026-01', -5));
    await assert.doesNotReject(() => budgetsService.upsertBudget(user.id, 'Shopping', '2026-01', 5000));
});

test('reports page works for every month of the year, including short months (regression test)', async () => {
    const { getMonthRange } = require('../src/core/dates');

    for (let m = 1; m <= 12; m++) {
        const month = `2026-${String(m).padStart(2, '0')}`;
        // This must not throw a Postgres "date/time field value out of
        // range" error the way it did before getMonthRange existed.
        await assert.doesNotReject(
            () => expensesService.getAllExpenses(user.id, getMonthRange(month)),
            `reports query should succeed for ${month}`
        );
    }
});

test('loan repayment reduces the remaining amount', async () => {
    await loansService.addLoan(user.id, 'Ravi', 'owed_to_me', 2000, 'lunch money');
    let loans = await loansService.getLoans(user.id);
    const loan = loans.find(l => l.person === 'Ravi');

    await loansService.repayLoan(user.id, loan.id, 500);

    loans = await loansService.getLoans(user.id);
    assert.equal(loans.find(l => l.id === loan.id).remaining_amount, 1500);
});

test('transaction feed combines expenses and transfers', async () => {
    const accounts = await accountsService.getAccounts(user.id);
    const cashId = accounts.find(a => a.name === 'Cash').id;
    const onlineId = accounts.find(a => a.name === 'Online').id;

    await transfersService.transfer(user.id, cashId, onlineId, 100, 'test transfer');

    const feed = await transactionsService.getTransactionFeed(user.id, {});
    assert.ok(feed.some(f => f.kind === 'expense'), 'feed should include at least one expense');
    assert.ok(feed.some(f => f.kind === 'transfer'), 'feed should include at least one transfer');
});

test('profile: update name and email', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const newEmail = `updated-${Date.now()}@example.com`;

    const updated = await profileService.updateProfile(user.id, 'Updated Name', newEmail);
    assert.equal(updated.name, 'Updated Name');
    assert.equal(updated.email, newEmail);

    const profile = await profileService.getProfile(user.id);
    assert.equal(profile.name, 'Updated Name');
    assert.equal(profile.email, newEmail);

    // Restore for subsequent tests that reference userEmail
    await profileService.updateProfile(user.id, 'Test User', userEmail);
});

test('profile: cannot change email to one already used by another account', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const otherEmail = `other-${Date.now()}@example.com`;
    await authService.register({ name: 'Other', email: otherEmail, password: 'password1', confirm: 'password1' });

    await assert.rejects(
        () => profileService.updateProfile(user.id, 'Test User', otherEmail),
        /already in use/
    );
});

test('profile: stats reflect accounts, expenses, and loans created in earlier tests', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const profile = await profileService.getProfile(user.id);

    assert.ok(profile.stats.accountCount >= 2, 'should include at least the default Cash/Online accounts');
    assert.ok(profile.stats.expenseCount > 0, 'should include expenses created in earlier tests');
    assert.ok(profile.stats.totalSpent > 0);
});

test('profile: changing password requires the correct current password', async () => {
    const profileService = require('../src/modules/profile/profile.service');

    await assert.rejects(
        () => profileService.changePassword(user.id, 'wrong-current-password', 'newpassword1', 'newpassword1'),
        /incorrect/i
    );

    await assert.doesNotReject(
        () => profileService.changePassword(user.id, 'password1', 'newpassword1', 'newpassword1')
    );

    // Old password should no longer work; new one should.
    const oldStillWorks = await authService.login(userEmail, 'password1');
    assert.equal(oldStillWorks, null);

    const newWorks = await authService.login(userEmail, 'newpassword1');
    assert.ok(newWorks);

    // Restore original password so later tests (if any) aren't affected.
    await profileService.changePassword(user.id, 'newpassword1', 'password1', 'password1');
});

test('profile: deleting the account soft-deletes it — data stays intact but login is blocked', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const pool = require('../src/db/pool');

    const email = `delete-me-${Date.now()}@example.com`;
    const victim = await authService.register({ name: 'Delete Me', email, password: 'password1', confirm: 'password1' });

    const ccId = await accountsService.addAccount(victim.id, 'Card', 'credit', 0, 5000);
    await expensesService.addExpense(victim.id, 100, 'test', 'credit', 'Shopping', '2026-01-01', ccId);
    await loansService.addLoan(victim.id, 'Someone', 'owed_to_me', 500, null);

    await assert.rejects(
        () => profileService.deleteAccount(victim.id, 'wrong-password'),
        /incorrect/i
    );

    await profileService.deleteAccount(victim.id, 'password1');

    const userRow = await pool.query('SELECT id, deleted_at FROM users WHERE id = $1', [victim.id]);
    assert.equal(userRow.rowCount, 1, 'user row should still exist (soft-deleted, not gone)');
    assert.ok(userRow.rows[0].deleted_at, 'deleted_at should be set');

    // Data must NOT be touched yet — it's only removed on final purge.
    const accountRows = await pool.query('SELECT id FROM accounts WHERE user_id = $1', [victim.id]);
    assert.ok(accountRows.rowCount > 0, 'accounts should still exist during the restore window');

    const expenseRows = await pool.query('SELECT id FROM expenses WHERE user_id = $1', [victim.id]);
    assert.ok(expenseRows.rowCount > 0, 'expenses should still exist during the restore window');

    const loanRows = await pool.query('SELECT id FROM loans WHERE user_id = $1', [victim.id]);
    assert.ok(loanRows.rowCount > 0, 'loans should still exist during the restore window');

    // Logging in with correct credentials returns a pendingRestore
    // signal instead of a normal successful login.
    const loginResult = await authService.login(email, 'password1');
    assert.ok(loginResult, 'correct credentials should still be recognized');
    assert.equal(loginResult.pendingRestore, true);
    assert.ok(loginResult.purgeAt instanceof Date);
});

test('profile: restoring a soft-deleted account brings it fully back', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const pool = require('../src/db/pool');

    const email = `restore-me-${Date.now()}@example.com`;
    const victim = await authService.register({ name: 'Restore Me', email, password: 'password1', confirm: 'password1' });
    const cashId = (await accountsService.getAccounts(victim.id)).find(a => a.name === 'Cash').id;
    await accountsService.updateAccountBalance(victim.id, cashId, 1000, 'seed funds');
    await expensesService.addExpense(
        victim.id, 250, 'pre-delete expense', 'cash', 'Food & Dining', '2026-01-05', cashId
    );

    await profileService.deleteAccount(victim.id, 'password1');

    let loginResult = await authService.login(email, 'password1');
    assert.equal(loginResult.pendingRestore, true);

    await profileService.restoreAccount(victim.id);

    const userRow = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [victim.id]);
    assert.equal(userRow.rows[0].deleted_at, null, 'deleted_at should be cleared');

    loginResult = await authService.login(email, 'password1');
    assert.ok(loginResult && !loginResult.pendingRestore, 'login should work normally after restore');

    // Data survived the whole round trip.
    const expenses = await expensesService.getRecentExpenses(victim.id, 10);
    assert.ok(expenses.some(e => e.notes === 'pre-delete expense'), 'expenses from before deletion should still be there');
});

test('profile: a soft-deleted account past its restore window can no longer log in or be restored via login', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const pool = require('../src/db/pool');

    const email = `expired-delete-${Date.now()}@example.com`;
    const victim = await authService.register({ name: 'Expired', email, password: 'password1', confirm: 'password1' });

    await profileService.deleteAccount(victim.id, 'password1');

    // Force it to look like it was deleted 31 days ago instead of waiting for real time to pass.
    await pool.query(
        `UPDATE users SET deleted_at = NOW() - INTERVAL '31 days' WHERE id = $1`,
        [victim.id]
    );

    const loginResult = await authService.login(email, 'password1');
    assert.equal(loginResult, null, 'login should fail once the restore window has passed, even with correct credentials');
});

test('purge job permanently removes accounts past their restore window, and leaves recent ones alone', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const pool = require('../src/db/pool');

    const oldEmail = `purge-old-${Date.now()}@example.com`;
    const oldUser = await authService.register({ name: 'Old Deleted', email: oldEmail, password: 'password1', confirm: 'password1' });
    await profileService.deleteAccount(oldUser.id, 'password1');
    await pool.query(`UPDATE users SET deleted_at = NOW() - INTERVAL '31 days' WHERE id = $1`, [oldUser.id]);

    const recentEmail = `purge-recent-${Date.now()}@example.com`;
    const recentUser = await authService.register({ name: 'Recently Deleted', email: recentEmail, password: 'password1', confirm: 'password1' });
    await profileService.deleteAccount(recentUser.id, 'password1');
    // deleted just now — well within the 30-day window, should survive the purge

    const purgedCount = await profileService.purgeExpiredDeletedAccounts();
    assert.ok(purgedCount >= 1, 'should have purged at least the 31-day-old account');

    const oldRow = await pool.query('SELECT id FROM users WHERE id = $1', [oldUser.id]);
    assert.equal(oldRow.rowCount, 0, 'account past the restore window should be permanently gone');

    const recentRow = await pool.query('SELECT id, deleted_at FROM users WHERE id = $1', [recentUser.id]);
    assert.equal(recentRow.rowCount, 1, 'recently-deleted account should NOT be purged yet');
    assert.ok(recentRow.rows[0].deleted_at, 'it should still be marked as soft-deleted');
});

test("registering with a soft-deleted account's email is blocked during the restore window", async () => {
    const profileService = require('../src/modules/profile/profile.service');

    const email = `reclaim-${Date.now()}@example.com`;
    const original = await authService.register({ name: 'Original', email, password: 'password1', confirm: 'password1' });
    await profileService.deleteAccount(original.id, 'password1');

    await assert.rejects(
        () => authService.register({ name: 'New Person', email, password: 'password1', confirm: 'password1' }),
        /already exists/
    );
});

// --- Password reset (forgot password / OTP) ---
// Intercept the mailer so tests can capture the generated OTP without
// needing real network access to Resend — this exercises everything
// except the actual HTTP call to their API, which needs a real key.
const mailerPath = require.resolve('../src/modules/password-reset/password-reset.mailer');
let lastSentOtp = null;
let lastSentTo = null;
let mailerCallCount = 0;
require.cache[mailerPath] = {
    id: mailerPath,
    filename: mailerPath,
    loaded: true,
    exports: {
        sendOtpEmail: async (toEmail, toName, otp) => {
            lastSentOtp = otp;
            lastSentTo = toEmail;
            mailerCallCount++;
        }
    }
};

const passwordResetService = require('../src/modules/password-reset/password-reset.service');

test('forgot-password: requesting a reset for an unknown email does nothing observable (no enumeration)', async () => {
    mailerCallCount = 0;
    await assert.doesNotReject(() => passwordResetService.requestReset('no-such-user@example.com'));
    assert.equal(mailerCallCount, 0, 'mailer should not be called for an unknown email');
});

test('forgot-password: requesting a reset for a real email sends a 6-digit OTP', async () => {
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);

    assert.equal(lastSentTo, userEmail);
    assert.match(lastSentOtp, /^\d{6}$/);
});

test('forgot-password: correct OTP resets the password; old password stops working, new one works', async () => {
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    const otp = lastSentOtp;

    await passwordResetService.verifyAndReset(userEmail, otp, 'brandnewpass1', 'brandnewpass1');

    const oldWorks = await authService.login(userEmail, 'password1');
    assert.equal(oldWorks, null, 'old password should no longer work');

    const newWorks = await authService.login(userEmail, 'brandnewpass1');
    assert.ok(newWorks, 'new password should work');

    // Restore original password for any tests that might run after this file.
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    await passwordResetService.verifyAndReset(userEmail, lastSentOtp, 'password1', 'password1');
});

test('forgot-password: an OTP cannot be reused after a successful reset', async () => {
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    const otp = lastSentOtp;

    await passwordResetService.verifyAndReset(userEmail, otp, 'anotherpass1', 'anotherpass1');

    await assert.rejects(
        () => passwordResetService.verifyAndReset(userEmail, otp, 'yetanotherpass1', 'yetanotherpass1'),
        /invalid or has expired/
    );

    // Restore original password.
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    await passwordResetService.verifyAndReset(userEmail, lastSentOtp, 'password1', 'password1');
});

test('forgot-password: requesting a new code invalidates the previous one', async () => {
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    const firstOtp = lastSentOtp;

    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    const secondOtp = lastSentOtp;

    await assert.rejects(
        () => passwordResetService.verifyAndReset(userEmail, firstOtp, 'somepassword1', 'somepassword1'),
        /invalid or has expired/
    );

    await assert.doesNotReject(
        () => passwordResetService.verifyAndReset(userEmail, secondOtp, 'somepassword1', 'somepassword1')
    );

    // Restore original password.
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    await passwordResetService.verifyAndReset(userEmail, lastSentOtp, 'password1', 'password1');
});

test('forgot-password: wrong OTP is rejected without resetting the password', async () => {
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);

    await assert.rejects(
        () => passwordResetService.verifyAndReset(userEmail, '000000', 'somepassword1', 'somepassword1'),
        /invalid or has expired/
    );

    const stillWorks = await authService.login(userEmail, 'password1');
    assert.ok(stillWorks, 'password should be unchanged after a failed OTP attempt');
});

test('forgot-password: too many wrong attempts locks out the code, even if the correct one is used afterward', async () => {
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    const correctOtp = lastSentOtp;

    for (let i = 0; i < 5; i++) {
        await assert.rejects(() => passwordResetService.verifyAndReset(userEmail, '000000', 'x123456', 'x123456'));
    }

    await assert.rejects(
        () => passwordResetService.verifyAndReset(userEmail, correctOtp, 'x123456', 'x123456'),
        /too many/i
    );

    const stillWorks = await authService.login(userEmail, 'password1');
    assert.ok(stillWorks, 'password should be unchanged after lockout');
});

test('forgot-password: an expired OTP is rejected', async () => {
    const pool = require('../src/db/pool');

    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    const otp = lastSentOtp;

    // Force it into the past instead of waiting 10 real minutes.
    await pool.query(
        `UPDATE password_resets
         SET expires_at = NOW() - INTERVAL '1 minute'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)
         AND used = FALSE`,
        [userEmail]
    );

    await assert.rejects(
        () => passwordResetService.verifyAndReset(userEmail, otp, 'somepassword1', 'somepassword1'),
        /invalid or has expired/
    );

    const stillWorks = await authService.login(userEmail, 'password1');
    assert.ok(stillWorks, 'password should be unchanged after an expired OTP attempt');
});

test('forgot-password: rejects a malformed OTP without touching the database', async () => {
    await assert.rejects(
        () => passwordResetService.verifyAndReset(userEmail, 'abc', 'somepassword1', 'somepassword1'),
        /invalid or has expired/
    );
});

test('forgot-password: rejects mismatched new passwords', async () => {
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);

    await assert.rejects(
        () => passwordResetService.verifyAndReset(userEmail, lastSentOtp, 'passwordA1', 'passwordB1'),
        /do not match/
    );
});

// --- Audit trail ---
test('audit: registration and successful login are recorded', async () => {
    const auditService = require('../src/modules/audit/audit.service');

    const email = `audit-${Date.now()}@example.com`;
    const newUser = await authService.register({ name: 'Audit Test', email, password: 'password1', confirm: 'password1' });

    await authService.login(email, 'password1');

    const activity = await auditService.getRecentActivity(newUser.id, 10);
    const actions = activity.map(a => a.action);

    assert.ok(actions.includes('registered'), 'registration should be recorded');
    assert.ok(actions.includes('login_success'), 'successful login should be recorded');
});

test('audit: failed login attempts are recorded against the right user', async () => {
    const auditService = require('../src/modules/audit/audit.service');

    const email = `audit-fail-${Date.now()}@example.com`;
    const newUser = await authService.register({ name: 'Audit Fail', email, password: 'password1', confirm: 'password1' });

    const result = await authService.login(email, 'wrong-password');
    assert.equal(result, null);

    const activity = await auditService.getRecentActivity(newUser.id, 10);
    assert.ok(activity.some(a => a.action === 'login_failed'), 'failed login should be recorded');
});

test('audit: login against an unknown email is not recorded anywhere (nothing to attach it to)', async () => {
    const pool = require('../src/db/pool');

    await authService.login('totally-unknown-email@example.com', 'whatever');

    const rows = await pool.query(
        `SELECT id FROM audit_logs WHERE details LIKE '%totally-unknown-email%'`
    );
    assert.equal(rows.rowCount, 0);
});

test('audit: profile updates, password changes, delete, and restore are all recorded', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const auditService = require('../src/modules/audit/audit.service');

    const email = `audit-lifecycle-${Date.now()}@example.com`;
    const newUser = await authService.register({ name: 'Lifecycle', email, password: 'password1', confirm: 'password1' });

    await profileService.updateProfile(newUser.id, 'New Name', email);
    await profileService.changePassword(newUser.id, 'password1', 'newpassword1', 'newpassword1');
    await profileService.deleteAccount(newUser.id, 'newpassword1');
    await profileService.restoreAccount(newUser.id);

    const activity = await auditService.getRecentActivity(newUser.id, 20);
    const actions = activity.map(a => a.action);

    assert.ok(actions.includes('profile_updated'));
    assert.ok(actions.includes('password_changed'));
    assert.ok(actions.includes('account_deleted'));
    assert.ok(actions.includes('account_restored'));
});

test('audit: password reset request and completion are recorded', async () => {
    const auditService = require('../src/modules/audit/audit.service');

    // Reuse the mailer interception already set up above for the
    // password-reset tests in this file.
    lastSentOtp = null;
    await passwordResetService.requestReset(userEmail);
    const otp = lastSentOtp;

    await passwordResetService.verifyAndReset(userEmail, otp, 'temppass123', 'temppass123');

    const userRow = await require('../src/db/pool').query('SELECT id FROM users WHERE email = $1', [userEmail]);
    const activity = await auditService.getRecentActivity(userRow.rows[0].id, 20);
    const actions = activity.map(a => a.action);

    assert.ok(actions.includes('password_reset_requested'));
    assert.ok(actions.includes('password_reset_completed'));

    // Restore original password for anything after this in the file.
    await passwordResetService.requestReset(userEmail);
    await passwordResetService.verifyAndReset(userEmail, lastSentOtp, 'password1', 'password1');
});

test('audit log entries are removed when the account is permanently purged', async () => {
    const profileService = require('../src/modules/profile/profile.service');
    const pool = require('../src/db/pool');

    const email = `audit-purge-${Date.now()}@example.com`;
    const victim = await authService.register({ name: 'Audit Purge', email, password: 'password1', confirm: 'password1' });
    await profileService.deleteAccount(victim.id, 'password1');
    await pool.query(`UPDATE users SET deleted_at = NOW() - INTERVAL '31 days' WHERE id = $1`, [victim.id]);

    await profileService.purgeExpiredDeletedAccounts();

    const rows = await pool.query('SELECT id FROM audit_logs WHERE user_id = $1', [victim.id]);
    assert.equal(rows.rowCount, 0, 'audit log entries should cascade-delete with the user');
});

test('a failure writing an audit log entry does not break the underlying operation', async () => {
    const auditService = require('../src/modules/audit/audit.service');

    // A non-existent user_id violates the audit_logs FK — this should
    // be swallowed and logged internally, never thrown.
    await assert.doesNotReject(() => auditService.log(999999999, 'registered'));
});
