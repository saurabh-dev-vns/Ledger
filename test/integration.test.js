/**
 * End-to-end checks against a real PostgreSQL database (see
 * .github/workflows/ci.yml for how CI provisions one; for local runs,
 * point DATABASE_URL at any throwaway Postgres database).
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL
    || 'postgresql://saurabh:python...@localhost:5432/ledger';
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
