const env = require('../../config/env');

/**
 * Sends the OTP email via Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
 * Uses the global fetch (Node 18+) directly rather than the `resend`
 * npm package, so this feature adds zero new dependencies.
 *
 * In development, if RESEND_API_KEY isn't configured, the OTP is
 * logged to the console instead of emailed, so the flow can still be
 * exercised locally without a Resend account. In production, a
 * missing key is a hard configuration error.
 */
async function sendOtpEmail(toEmail, toName, otp) {
    if (!env.resendApiKey) {
        if (env.isProduction) {
            throw new Error('Password reset emails are not configured. Set RESEND_API_KEY.');
        }

        console.log(`\n[dev] RESEND_API_KEY not set — password reset OTP for ${toEmail}: ${otp}\n`);
        return;
    }

    const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="margin-bottom:4px">Reset your Ledger password</h2>
            <p>Hi ${escapeHtml(toName || '')},</p>
            <p>Use this code to reset your password. It expires in 10 minutes.</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">${otp}</p>
            <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
        </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.resendApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: env.resendFromEmail,
            to: [toEmail],
            subject: 'Your Ledger password reset code',
            html
        })
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('Resend API error:', response.status, body);
        throw new Error('Could not send the reset email. Please try again shortly.');
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = { sendOtpEmail };
