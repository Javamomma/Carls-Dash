import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, game] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/game.js', import.meta.url), 'utf8'),
]);

assert.match(html, /<canvas id="game" width="240" height="427"/);
assert.doesNotMatch(html, /\/\*__(STYLES|GAME)__\*\//);
assert.match(game, /const FLOORS = \[/);
assert.match(game, /const ROUTES = \[/);
assert.match(game, /const ITEMS = \{/);
assert.match(game, /const ACHIEVEMENTS = \{/);
assert.match(game, /showSafeRoom\(/);
assert.match(game, /startBoss\(/);
assert.match(game, /showSponsor\(/);
assert.match(game, /showClasses\(/);
assert.match(game, /useDonut\(/);

const achievementIds = [...game.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*): \{ name:/gm)].map(match => match[1]);
assert.ok(achievementIds.length >= 12, 'expected at least twelve achievements');
assert.equal(new Set(achievementIds).size, achievementIds.length, 'achievement ids must be unique');

console.log('Static smoke checks passed');
