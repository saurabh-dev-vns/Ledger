/**
 * Shared helpers for the JSON API.
 *
 * Most API responses use one of these shapes:
 *   Success: { ok: true, data?, message? }
 *   Failure: { ok: false, error }
 *
 * `data` and `message` are optional on success. A route can use these helpers
 * to keep responses consistent, while `describeError` turns thrown errors
 * into a safe status and message for the client.
 */

/**
 * Wrap an async Express route so errors are passed to Express's error handler.
 *
 * Express 4 does not automatically pass a rejected async function to that
 * handler. This wrapper catches the rejection and calls `next(error)`.
 * Use it around route handlers that use `async` or return a promise.
 */
const route = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * An error meant to be returned to an API client with a specific HTTP status.
 *
 * Example: `throw new ApiError(404, 'Account not found.')` sends status 404
 * and that message in the standard failure response.
 */
class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * Send a successful JSON response.
 *
 * @param {object} res Express response object.
 * @param {*} data Optional response data, placed in the `data` field.
 * @param {string} message Optional message for the user.
 * @param {number} status HTTP status code; defaults to 200 (OK).
 */
function ok(res, data, message, status = 200) {
    const body = { ok: true };
    if (message !== undefined) body.message = message;
    if (data !== undefined) body.data = data;
    return res.status(status).json(body);
}

/**
 * Choose the HTTP status and client-safe message for an error.
 *
 * - An error with a valid 4xx or 5xx `status` keeps that status. Client errors
 *   (4xx) show their message; server errors (5xx) show a generic message,
 *   except for the known `ApiError` and `AiError` types.
 * - A plain Error without a status or error code is treated as a user/input
 *   problem and returned as status 400 with its message.
 * - Other errors, such as database or programming errors, become a generic
 *   status 500 response. Their details should be logged by the API handler,
 *   not shown to the user.
 *
 * @param {Error} err The error caught by an API route or middleware.
 * @returns {{status: number, message: string}} Safe response details.
 */
function describeError(err) {
    const status = Number(err && err.status);

    if (Number.isInteger(status) && status >= 400 && status < 600) {
        const safe = status < 500 || err.name === 'ApiError' || err.name === 'AiError';
        return { status, message: safe ? err.message : 'Something went wrong. Please try again.' };
    }

    if (err && err.constructor === Error && !err.code) {
        return { status: 400, message: err.message };
    }

    return { status: 500, message: 'Something went wrong. Please try again.' };
}

module.exports = { route, ApiError, ok, describeError };
