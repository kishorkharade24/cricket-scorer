/* Regenerates the light-mode accent-text rules at the bottom of input.css.
 * Run after adding a new accent hue: node scripts/gen-light-accents.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const c = createRequire(import.meta.url)('tailwindcss/colors');

const hues = ['emerald','sky','violet','amber','rose','teal','orange','fuchsia','lime','cyan','indigo','pink'];
const map = { 100: 900, 200: 800, 300: 700, 400: 600 };

const rules = [
  '/* Accent text in light mode.',
  '   text-sky-300 and friends are chosen to sit on a dark surface; on a pale',
  '   tint they vanish. Each one is remapped to the readable shade of the same',
  '   hue. Generated — run scripts/gen-light-accents.mjs after adding a hue. */'
];
for (const h of hues) {
  for (const [from, to] of Object.entries(map)) {
    if (c[h]?.[to]) rules.push(`html[data-theme='light'] .text-${h}-${from}{color:${c[h][to]}}`);
  }
}

const path = new URL('../src/css/input.css', import.meta.url);
const src = readFileSync(path, 'utf8');
const head = src.split('\n@layer utilities {')[0].trimEnd();
writeFileSync(path, `${head}\n\n@layer utilities {\n${rules.join('\n')}\n}\n`);
console.log(`wrote ${rules.length - 4} light-mode accent rules`);
