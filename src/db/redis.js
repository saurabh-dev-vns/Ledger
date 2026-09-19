/**
 * Shared Redis client for the application.
 *
 * Mirrors the pattern of src/db/pool.js — one client instance shared
 * across the whole process. connect-redis will call client.connect()
 * itself when wired up via RedisStore; we just export the client here.
 */
const { createClient } = require('redis');
const env = require('../config/env');
const logger = require('../core/logger');

const client = createClient({ url: env.redisUrl });

client.on('error', (err) => logger.error({ err }, 'Redis client error'));
client.on('connect', () => logger.info('Redis client connected'));

module.exports = client;

