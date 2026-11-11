/**
 * Tests the Gemini setup without starting the app:
 *   npm run check:gemini
 * Prints, for each model the app would try, exactly what Google answered.
 */
const env = require('../src/config/env');
const ai = require('../src/modules/ai/ai.service');

(async () => {
    console.log('GEMINI_API_KEY :', env.geminiApiKey ? `set (…${env.geminiApiKey.slice(-4)})` : 'NOT SET');
    console.log('GEMINI_MODEL   :', env.geminiModel);
    console.log('Endpoint       :', env.geminiBaseUrl, '\n');

    if (!env.geminiApiKey) {
        console.log('Set GEMINI_API_KEY in your .env first (https://aistudio.google.com/apikey).');
        process.exit(1);
    }

    const results = await ai.diagnose();

    for (const r of results) {
        console.log(`${r.ok ? '✓' : '✗'} ${r.model.padEnd(28)} HTTP ${r.status}  ${r.message}`);
    }

    const working = results.find(r => r.ok);

    console.log(working
        ? `\nWorks. The app will use "${working.model}"${working.model !== env.geminiModel ? ` (set GEMINI_MODEL=${working.model} in .env to make it permanent)` : ''}.`
        : '\nNo model worked. See the messages above (403 = bad key, 404 = model retired, 0 = network/proxy problem).');

    process.exit(working ? 0 : 1);
})();
