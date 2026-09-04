import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const [template, styles, game] = await Promise.all([
  readFile(join(root, 'src/index.template.html'), 'utf8'),
  readFile(join(root, 'src/styles.css'), 'utf8'),
  readFile(join(root, 'src/game.js'), 'utf8'),
]);

const output = template
  .replace('/*__STYLES__*/', styles.trim())
  .replace('/*__GAME__*/', game.trim());

if (output.includes('/*__STYLES__*/') || output.includes('/*__GAME__*/')) {
  throw new Error('Build placeholders were not replaced');
}

await writeFile(join(root, 'index.html'), output);
console.log(`Built index.html (${Buffer.byteLength(output).toLocaleString()} bytes)`);
