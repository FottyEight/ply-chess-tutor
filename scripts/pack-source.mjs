// Packs the app's source into dist/source/ply-source.zip so the deployed site links to its own source (GPL-3.0).
// Pure Node (fflate), so it works on any build host.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

const SKIP = new Set(['node_modules', 'dist', '.git', '.vercel', '.netlify', 'reports', 'data-src', 'engine-node']);
let files = [];
try {
  files = execSync('git ls-files', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
} catch { /* not a git checkout */ }
if (!files.length) {
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } };
  walk('.');
}
files = files.filter((f) => !f.split(/[\\/]/).some((x) => SKIP.has(x)) && fs.existsSync(f) && fs.statSync(f).isFile());
const entries = Object.fromEntries(files.map((f) => [`ply/${f.split(path.sep).join('/')}`, new Uint8Array(fs.readFileSync(f))]));
fs.mkdirSync('dist/source', { recursive: true });
fs.writeFileSync('dist/source/ply-source.zip', zipSync(entries, { level: 6 }));
console.log(`source zip: ${(fs.statSync('dist/source/ply-source.zip').size / 1024).toFixed(0)} KB, ${files.length} files`);
