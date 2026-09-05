const bcrypt = require('bcryptjs');
const { runInTransaction } = require('../../core/transaction');
const repo = require('./profile.repository');

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getProfile(userId) {
    const user = await repo.findById(userId);

    if (!user) {
        throw new Error('User not found.');
    }

    const stats = await repo.getStats(userId);

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
        stats: {
            accountCount: Number(stats.account_count),
            expenseCount: Number(stats.expense_count),
            loanCount: Number(stats.loan_count),
            totalSpent: Number(stats.total_spent)
        }
    };
}

async function updateProfile(userId, name, email) {
    name = String(name || '').trim();
    email = String(email || '').trim().toLowerCase();

    if (!name) {
        throw new Error('Name is required.');
    }

    if (!isValidEmail(email)) {
        throw new Error('Enter a valid email address.');
    }

    const existing = await repo.findByEmailExcludingUser(email, userId);
    if (existing) {
        throw new Error('That email is already in use by another account.');
    }

    await repo.updateNameAndEmail(userId, name, email);

    return { name, email };
}

async function changePassword(userId, currentPassword, newPassword, confirmPassword) {
    if (!currentPassword || !newPassword) {
        throw new Error('Fill in every field.');
    }

    if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters.');
    }

    if (newPassword !== confirmPassword) {
        throw new Error('New passwords do not match.');
    }

    const user = await repo.findById(userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
        throw new Error('Current password is incorrect.');
    }

    if (currentPassword === newPassword) {
        throw new Error('New password must be different from the current password.');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await repo.updatePasswordHash(userId, hash);
}

async function deleteAccount(userId, password) {
    if (!password) {
        throw new Error('Enter your password to confirm.');
    }

    const user = await repo.findById(userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
        throw new Error('Incorrect password.');
    }

    return runInTransaction(client => repo.deleteUser(userId, client));
}

module.exports = { getProfile, updateProfile, changePassword, deleteAccount };
