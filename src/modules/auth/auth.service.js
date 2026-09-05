const bcrypt = require('bcryptjs');
const repo = require('./auth.repository');
const accountsService = require('../accounts/accounts.service');

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

        return user;
    } catch (err) {
        // PostgreSQL unique constraint can still win if two registrations race.
        if (err.code === '23505') {
            throw new Error('An account with that email already exists.');
        }
        throw err;
    }
}

async function login(email, password) {
    const user = await repo.findByEmail(email);

    if (user && await bcrypt.compare(password, user.password_hash)) {
        return { id: user.id, name: user.name };
    }

    return null;
}

module.exports = { register, login };
