import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, game, styles] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/game.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
]);

assert.match(html, /<canvas id="game" width="240" height="427"/);
assert.doesNotMatch(html, /\/\*__(STYLES|GAME)__\*\//);
assert.equal((html.match(/<\/script>/g) || []).length, 1, 'generated game script must not be terminated early');
assert.match(html, /icon: '\$'/, 'dollar-sign game source must survive the build literally');
assert.equal(html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1].trim(), game.trim(), 'generated JavaScript must equal its source');
assert.ok(html.includes(styles.trim()), 'generated stylesheet must equal its source');
assert.match(game, /const FLOORS = \[/);
assert.match(game, /const ROUTES = \[/);
assert.match(game, /const ROOM_BLUEPRINTS = \[/);
assert.match(game, /const VIEWER_TIERS = \[/);
assert.match(game, /const SPONSOR_OFFERS = \[/);
assert.match(game, /const ITEMS = \{/);
assert.match(game, /const ACHIEVEMENTS = \{/);
assert.match(game, /showSafeRoom\(/);
assert.match(game, /startBoss\(/);
assert.match(game, /showSponsor\(/);
assert.match(game, /showClasses\(/);
assert.match(game, /useDonut\(/);
assert.match(game, /updateFeatures\(/);
assert.match(game, /DODGE THE RAM/);
assert.match(game, /COLLECT 4 COOLANT VALVES/);

const blueprintMatches = [...game.matchAll(/id: '([a-z-]+)', floor: (\d), affinity:/g)];
const blueprintIds = blueprintMatches.map(match => match[1]);
assert.ok(blueprintIds.length >= 15, 'expected at least fifteen authored room blueprints');
assert.equal(new Set(blueprintIds).size, blueprintIds.length, 'room blueprint ids must be unique');
for (let floor = 1; floor <= 5; floor++) {
  assert.ok(blueprintMatches.filter(match => Number(match[2]) === floor).length >= 3, `floor ${floor} should have at least three authored set-pieces`);
}

const achievementIds = [...game.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*): \{ name:/gm)].map(match => match[1]);
assert.ok(achievementIds.length >= 12, 'expected at least twelve achievements');
assert.equal(new Set(achievementIds).size, achievementIds.length, 'achievement ids must be unique');

console.log('Static smoke checks passed');
