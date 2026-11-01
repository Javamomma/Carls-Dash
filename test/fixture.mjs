// Test fixture: loads src/game.js into a fresh fake page (Node vm) with a seeded RNG,
// in-memory localStorage, captured event listeners and a hand-driven clock.
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const template = readFileSync(new URL('src/index.template.html', root), 'utf8');

// CARLS_DASH_GAME_SRC lets a caller point the same tests at another build of the game.
function gameSource() {
  const override = process.env.CARLS_DASH_GAME_SRC;
  const file = override ? path.resolve(process.cwd(), override) : new URL('src/game.js', root);
  return readFileSync(file, 'utf8');
}

class ClassList {
  constructor(initial = '') { this.values = new Set(initial.split(/\s+/).filter(Boolean)); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.values.has(value) : force;
    if (enabled) this.values.add(value); else this.values.delete(value);
    return enabled;
  }
}

class FakeAudioContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  resume() {}
  createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
}

// mulberry32: small seeded PRNG so Math.random inside the sandbox is reproducible.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function loadGame({ seed = 1, start = true } = {}) {
  // --- listeners -----------------------------------------------------------
  const listeners = new Map(); // "target:type" -> [fn]
  const listen = target => (type, fn) => {
    const key = `${target}:${type}`;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(fn);
  };
  // target is 'window', 'document' or an element id.
  function fire(target, type, event = {}) {
    const payload = { type, preventDefault() {}, stopPropagation() {}, ...event };
    const handlers = [...(listeners.get(`${target}:${type}`) || [])];
    for (const fn of handlers) fn(payload);
    return handlers.length;
  }

  // --- clock ---------------------------------------------------------------
  const clock = {
    now: 1000,
    timers: [],
    rafQueue: [],
    nextId: 1,
    setTimeout(fn, delay = 0) {
      const id = clock.nextId++;
      clock.timers.push({ id, fn, at: clock.now + Math.max(0, Number(delay) || 0) });
      return id;
    },
    clearTimeout(id) { clock.timers = clock.timers.filter(timer => timer.id !== id); },
    requestAnimationFrame(fn) {
      const id = clock.nextId++;
      clock.rafQueue.push({ id, fn });
      return id;
    },
    // Move time forward by ms, running every timer that comes due, in order.
    advance(ms) {
      const target = clock.now + ms;
      for (;;) {
        const due = clock.timers.filter(timer => timer.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        clock.timers = clock.timers.filter(timer => timer !== due);
        clock.now = Math.max(clock.now, due.at);
        due.fn();
      }
      clock.now = target;
    },
    // Advance time, then hand the queued animation-frame callbacks the new timestamp.
    frame(ms = 1000 / 60) {
      clock.advance(ms);
      const queued = clock.rafQueue;
      clock.rafQueue = [];
      for (const { fn } of queued) fn(clock.now);
    },
  };

  // --- fake DOM ------------------------------------------------------------
  class FakeElement {
    constructor(id, classes = '') {
      this.id = id;
      this.classList = new ClassList(classes);
      this.style = { setProperty() {} };
      this.dataset = {};
      this.disabled = false;
      this.textContent = '';
      this.innerHTML = '';
      this.addEventListener = listen(id);
    }
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
    addEventListener: listen('document'),
  };

  // --- storage -------------------------------------------------------------
  const store = new Map();
  const localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => store.clear(),
  };

  // --- sandbox -------------------------------------------------------------
  const sandboxMath = Object.create(Math);
  sandboxMath.random = seededRandom(seed);

  const window = {
    AudioContext: FakeAudioContext,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    addEventListener: listen('window'),
  };
  const sandbox = {
    document,
    window,
    localStorage,
    performance: { now: () => clock.now },
    requestAnimationFrame: clock.requestAnimationFrame,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    addEventListener: listen('window'),
    Math: sandboxMath,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${gameSource()}\nglobalThis.__game = Game;`, sandbox);

  const game = sandbox.__game;
  if (start) game.start(false);
  return { game, elements, clock, fire, listeners, localStorage, sandbox };
}
