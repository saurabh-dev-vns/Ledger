/**
 * Lightweight syntax gate: recursively finds every .js file under
 * src/, test/, and scripts/, plus server.js, and parses each with
 * `node -c`. Fails fast on the first syntax error with a clear path,
 * so CI (and local `npm run lint`) catches typos before anything
 * else even attempts to run.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function collectJsFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            return entry.name === 'node_modules' ? [] : collectJsFiles(full);
        }

        return entry.name.endsWith('.js') ? [full] : [];
    });
}

const root = path.join(__dirname, '..');
const files = [
    ...collectJsFiles(path.join(root, 'src')),
    ...collectJsFiles(path.join(root, 'test')),
    path.join(root, 'server.js')
];

let failed = false;

for (const file of files) {
    try {
        execFileSync(process.execPath, ['-c', file], { stdio: 'pipe' });
    } catch (err) {
        failed = true;
        console.error(`✗ Syntax error in ${path.relative(root, file)}`);
        console.error(err.stderr.toString());
    }
}

if (failed) {
    process.exit(1);
}

console.log(`✓ ${files.length} JavaScript files parsed cleanly.`);
