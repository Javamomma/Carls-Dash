import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');

class ClassList {
  constructor(initial = '') { this.values = new Set(initial.split(/\s+/).filter(Boolean)); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(id, classes = '') {
    this.id = id;
    this.classList = new ClassList(classes);
    this.style = { setProperty() {} };
    this.dataset = {};
    this.disabled = false;
    this.textContent = '';
    this.innerHTML = '';
  }
  addEventListener() {}
}

const elements = new Map();
for (const match of template.matchAll(/id="([^"]+)"(?:\s+class="([^"]*)")?/g)) {
  elements.set(match[1], new FakeElement(match[1], match[2] || ''));
}

const context2d = new Proxy({}, {
  get(target, property) {
    if (!(property in target)) target[property] = () => {};
    return target[property];
  },
  set(target, property, value) { target[property] = value; return true; },
});
elements.get('game').getContext = () => context2d;

const document = {
  hidden: false,
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  },
  querySelectorAll(selector) {
    if (selector === '.overlay') return [...elements.values()].filter(element => element.classList.contains('overlay'));
    return [];
  },
  addEventListener() {},
};

class FakeAudioContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  resume() {}
  createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
}

const sandbox = {
  document,
  window: { AudioContext: FakeAudioContext, setTimeout: () => 0 },
  localStorage: { getItem: () => null, setItem() {} },
  performance: { now: () => 1000 },
  requestAnimationFrame() {},
  addEventListener() {},
  clearTimeout() {},
  Math,
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\nglobalThis.__game = Game;`, sandbox);

const game = sandbox.__game;
game.start(false);
assert.equal(game.state, 'RUNNING');
assert.equal(game.floor, 1);
assert.equal(game.inventory.length, 0);
game.update(1 / 60);
game.draw();

game.player.invincible = 999;
for (let frame = 0; frame < 900 && game.state === 'RUNNING'; frame++) game.update(1 / 60);
assert.equal(game.state, 'CHOICE', 'a complete generated room should reach a doorway choice');

game.start(false);

game.completeRoom();
assert.equal(game.state, 'CHOICE');
game.chooseDoor(0);
assert.equal(game.state, 'RUNNING');

game.awardBox('bronze');
game.showSafeRoom('door');
assert.equal(game.state, 'SAFE');
game.openBox('bronze');
game.takeLoot('bomb');
assert.equal(game.inventory[0].id, 'bomb');
game.beginRoom(game.currentRoute);
game.useItem(0);
assert.equal(game.inventory.length, 0);

game.unlockAchievement('firstMob');
assert.ok(game.runAchievements.has('firstMob'));
assert.ok(game.boxes.includes('bronze'));

game.roomsOnFloor = 3;
game.completeRoom();
assert.equal(game.state, 'BOSS');
game.boss.hp = 1;
game.hitBoss(1);
assert.equal(game.boss.defeated, true);

game.showSafeRoom('floor');
game.leaveSafeRoom();
assert.equal(game.state, 'STAIRS');
game.chooseStairs(false);
assert.equal(game.floor, 2);

game.floor = 2;
game.advanceFloor();
assert.equal(game.floor, 3);
assert.equal(game.state, 'CLASS');
game.selectClass('trapper');
assert.equal(game.classId, 'trapper');
assert.equal(game.state, 'CHOICE');

game.interludeNext = 'door';
game.showSponsor();
assert.equal(game.state, 'SPONSOR');
game.acceptSponsor('double');
assert.equal(game.state, 'CHOICE');
assert.equal(game.sponsorModifier.double, true);

game.beginRoom(game.doorChoices[0]);
game.hp = 1;
game.player.invincible = 0;
game.damage('test hazard');
assert.equal(game.state, 'GAMEOVER');
game.showArchive();
assert.ok(elements.get('archive').classList.contains('shown'));

console.log('Runtime state-flow checks passed');
