/* Stamps a fresh build id into sw.js so every deploy busts the cache.
 * Run before pushing: npm run release */
import { readFileSync, writeFileSync } from 'node:fs';

const stamp = new Date().toISOString().slice(0, 16).replace(':', '-');
const path = new URL('../sw.js', import.meta.url);
const src = readFileSync(path, 'utf8');
const next = src.replace(/const BUILD = '[^']*';/, `const BUILD = '${stamp}';`);

if (next === src) {
  console.error('Could not find the BUILD line in sw.js — nothing was changed.');
  process.exit(1);
}
writeFileSync(path, next);
console.log(`sw.js build stamp -> ${stamp}`);
console.log('Now commit and push; visitors pick the new version up on their next load.');
