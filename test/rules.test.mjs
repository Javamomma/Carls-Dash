import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './fixture.mjs';

const DT = 1 / 60;
const HOSTILE = ['log', 'snake', 'branch', 'crusher', 'bat', 'cart', 'barrier', 'hunter', 'vine', 'goblin'];

// A fresh run with a quiet room: no scripted spawns, grounded Carl, vulnerable, full HP.
function quietRoom(seed = 7) {
  const { game } = loadGame({ seed });
  game.roomEvents = [];
  game.roomDuration = 1e9;
  game.hazards = [];
  game.features = [];
  game.pickups = [];
  game.player.invincible = 0;
  return game;
}

function step(game, frames) {
  for (let i = 0; i < frames; i++) game.update(DT);
}

// Drops a hazard of this type onto Carl's box and returns it.
function placeOnCarl(game, type) {
  game.spawnHazard(type, game.player.x + 2);
  return game.hazards[game.hazards.length - 1];
}

for (const type of HOSTILE) {
  test(`every hostile hazard costs a vulnerable Carl 1 HP: ${type}`, () => {
    const game = quietRoom();
    assert.equal(game.hp, 4);
    placeOnCarl(game, type);
    step(game, 3);
    assert.equal(game.hp, 3, `${type} should cost exactly 1 HP`);
  });
}

test("the hunter boss's shot hurts", () => {
  const game = quietRoom();
  game.floor = 5;
  game.startBoss();
  game.boss.timer = 0;
  game.updateBoss(.02);
  const shot = game.hazards.find(hazard => hazard.type === 'hunterShot');
  assert.ok(shot, 'the boss should fire a hunterShot');
  shot.x = game.player.x + 2;
  shot.y = game.player.y + 10;
  step(game, 3);
  assert.equal(game.hp, 3);
});

test('pit still hurts', () => {
  const game = quietRoom();
  placeOnCarl(game, 'pit');
  step(game, 3);
  assert.equal(game.hp, 3);
});

test('flame is harmless during its warning and hurts once it runs out', () => {
  const game = quietRoom();
  const flame = placeOnCarl(game, 'flame');
  assert.ok(flame.telegraph > 0, 'flame starts with a warning');
  let frames = 0;
  while (game.hp === 4 && frames < 120) {
    flame.x = game.player.x + 2;
    game.update(DT);
    frames += 1;
    if (flame.telegraph > 0) assert.equal(game.hp, 4, 'no damage during the warning');
  }
  assert.equal(game.hp, 3, 'flame hurts after the warning');
  assert.ok(frames * DT >= .6, 'the hit comes only after the .65s warning');
});

test('invincibility still protects', () => {
  for (const type of [...HOSTILE, 'pit', 'hunterShot']) {
    const game = quietRoom();
    game.player.invincible = 5;
    placeOnCarl(game, type);
    step(game, 3);
    assert.equal(game.hp, 4, `${type} should not hurt an invincible Carl`);
  }
});

test('stomp: a falling Carl destroys a goblin without damage', () => {
  const game = quietRoom();
  game.player.airborne = true;
  game.player.vy = 120;
  game.player.y = 310;
  const goblin = placeOnCarl(game, 'goblin');
  step(game, 1);
  assert.equal(game.hp, 4);
  assert.equal(goblin.on, false, 'the goblin is destroyed');
  assert.equal(game.roomStats.stomps, 1);
});

test('cart smash: a cart-borne Carl smashes a log and a barrier', () => {
  const game = quietRoom();
  game.player.vehicleTime = 5;
  const log = placeOnCarl(game, 'log');
  const barrier = placeOnCarl(game, 'barrier');
  step(game, 1);
  assert.equal(game.hp, 4);
  assert.equal(log.on, false);
  assert.equal(barrier.on, false);
  assert.equal(game.roomStats.smashes, 2);
});

test('trap: an armed trap snares a ground hazard', () => {
  const game = quietRoom();
  game.trapArmed = true;
  const log = placeOnCarl(game, 'log');
  step(game, 1);
  assert.equal(game.hp, 4);
  assert.equal(log.on, false);
  assert.equal(game.trapArmed, false);
});

test('grease: a greased ground hazard changes teams', () => {
  const game = quietRoom();
  game.greaseReady = true;
  const log = placeOnCarl(game, 'log');
  step(game, 1);
  assert.equal(game.hp, 4);
  assert.equal(log.friendly, true);
  assert.equal(game.greaseReady, false);
});

// Collects the cart through the real pickup path and returns the game.
function collectCart(game) {
  game.spawnRoomEvent([0, 'vehicle']);
  const cart = game.pickups.find(pickup => pickup.type === 'vehicle');
  cart.x = game.player.x;
  cart.y = game.player.y;
  step(game, 2);
  return game;
}

test('riding the cart keeps drawing', () => {
  const game = collectCart(quietRoom());
  assert.ok(game.player.vehicleTime > 0, 'the pickup should put Carl in the cart');
  for (let i = 0; i < 180; i++) {
    if (i === 40) game.player.dash();
    if (i === 100) game.player.jump();
    game.update(DT);
    game.draw();
  }
  assert.ok(game.player.vehicleTime > 0, 'Carl should still be riding after 3 seconds of drawing');
});

test('the frame loop survives the cart', () => {
  const { game, clock } = loadGame({ seed: 7 });
  game.roomEvents = [];
  game.roomDuration = 1e9;
  game.hazards = [];
  game.features = [];
  game.pickups = [];
  collectCart(game);
  assert.ok(game.player.vehicleTime > 0);
  const before = game.time;
  for (let i = 0; i < 120; i++) {
    clock.frame();
    assert.ok(clock.rafQueue.length > 0, `frame ${i} should schedule the next frame`);
  }
  assert.ok(game.time > before + 1, 'game time should keep advancing while riding');
});

// --- pause safety -----------------------------------------------------------

// A fresh run standing in a boss fight, with the frame loop primed.
function bossFight(seed = 7, floor = 1) {
  const loaded = loadGame({ seed });
  loaded.game.floor = floor;
  loaded.game.startBoss();
  return loaded;
}

// Wall-clock and frames together, so both window timers and the game loop get a chance to run.
function runFor(clock, ms) {
  for (let t = 0; t < ms; t += 1000 / 60) clock.frame();
}

test('pausing across the boss exit still opens the safe room', () => {
  const { game, clock } = bossFight();
  game.hitBoss(game.boss.hp, true);
  assert.equal(game.boss.defeated, true);
  runFor(clock, 300);
  game.pause();
  assert.equal(game.state, 'PAUSED');
  runFor(clock, 3000);
  assert.equal(game.state, 'PAUSED');
  game.resume();
  runFor(clock, 2000);
  assert.equal(game.state, 'SAFE');
});

test('a stale boss exit from an earlier boss or run does nothing', () => {
  // A new boss on the next floor must keep fighting.
  const a = bossFight();
  a.game.hitBoss(a.game.boss.hp, true);
  runFor(a.clock, 300);
  a.game.floor = 2;
  a.game.startBoss();
  runFor(a.clock, 3000);
  assert.equal(a.game.state, 'BOSS');
  assert.equal(a.game.boss.defeated, false);

  // A fresh run must not be dragged to the old boss's safe room.
  const b = bossFight();
  b.game.hitBoss(b.game.boss.hp, true);
  runFor(b.clock, 300);
  b.game.start(false);
  runFor(b.clock, 3000);
  assert.notEqual(b.game.state, 'SAFE');
  assert.equal(b.game.state, 'RUNNING');
});

function pauseSnapshot(game) {
  const p = game.player;
  return JSON.stringify({
    state: game.state, viewers: game.viewers, boxes: game.boxes, inventory: game.inventory,
    y: p.y, vy: p.vy, jumps: p.jumps, airborne: p.airborne, dashCooldown: p.dashCooldown, slideTime: p.slideTime,
    donutCooldown: game.donutCooldown, roomStats: game.roomStats, hp: game.hp, invincible: p.invincible,
    items: game.inventory.map(item => [item.id, item.charges]),
  });
}

test('keyboard input while paused changes nothing', () => {
  const { game, clock, fire } = loadGame({ seed: 7 });
  game.roomEvents = [];
  game.roomDuration = 1e9;
  game.hazards = [];
  game.features = [];
  game.pickups = [];
  // Usable items and a ready Donut, so a leaked 1-3 or D press would visibly change something.
  game.takeLoot('medkit');
  game.takeLoot('shield');
  game.takeLoot('magnet');
  game.hp = 2;
  game.donutCooldown = 0;
  game.pause();
  assert.equal(game.state, 'PAUSED');
  assert.equal(game.inventory.length, 3);
  const before = pauseSnapshot(game);
  const keys = [
    { code: 'Space', key: ' ' }, { code: 'ArrowUp', key: 'ArrowUp' }, { code: 'ArrowDown', key: 'ArrowDown' },
    { code: 'ArrowDown', key: 'ArrowDown' }, { code: 'ArrowDown', key: 'ArrowDown' },
    { code: 'KeyD', key: 'd' }, { code: 'Digit1', key: '1' }, { code: 'Digit2', key: '2' }, { code: 'Digit3', key: '3' },
    { code: 'ArrowLeft', key: 'ArrowLeft' }, { code: 'ArrowRight', key: 'ArrowRight' },
  ];
  for (const key of keys) {
    fire('window', 'keydown', key);
    clock.frame();
  }
  runFor(clock, 500);
  assert.equal(pauseSnapshot(game), before);
  fire('window', 'keydown', { code: 'Escape', key: 'Escape' });
  assert.equal(game.state, 'RUNNING');
});
