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
