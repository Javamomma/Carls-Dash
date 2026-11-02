// Scripted playtest: plays floors 1-2 with simulated humans and reports how often they clear and how much they get hurt.
// usage: node scripts/playtest.mjs [--runs N] [--policy tapper|learner|skilled|expert] [--hotspots] [--floor N]
// Loads the game through test/fixture.mjs, so CARLS_DASH_GAME_SRC=<file> compares another build.
//
// Policies (reaction time, timing noise and chance to ignore a hazard are all in seconds / probability):
//   tapper  - a first-time player who only taps to jump: slow, noisy, never slides.
//   learner - a new player who has learned "swipe down to duck" after a few deaths.
//   skilled - a practiced player: quick, precise, slides.
//   expert  - skilled plus fast-falls out of jumps to get under high hazards in time.
import { fileURLToPath } from 'node:url';
import { loadGame } from '../test/fixture.mjs';

const POLICIES = {
  tapper: { react: .45, noise: .12, miss: .12, slide: false },
  learner: { react: .35, noise: .09, miss: .08, slide: true },
  skilled: { react: .25, noise: .04, miss: .01, slide: true },
  expert: { react: .2, noise: .03, miss: 0, slide: true, fastfall: true },
};
const HIGH = new Set(['branch', 'bat', 'crusher', 'hunterShot']);
const DT = 1 / 60;
const FRAME_LIMIT = 60 * 60 * 6;

function parseArgs(argv) {
  const opts = { runs: 100, policy: null, hotspots: false, floor: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') opts.runs = Number(argv[++i]);
    else if (a === '--policy') opts.policy = argv[++i];
    else if (a === '--floor') opts.floor = Number(argv[++i]);
    else if (a === '--hotspots') opts.hotspots = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!(opts.runs > 0)) throw new Error('--runs must be a positive number');
  if (opts.policy && !POLICIES[opts.policy]) throw new Error(`unknown policy: ${opts.policy}`);
  return opts;
}

function gauss(rand) {
  let u = 0, v = 0;
  while (!u) u = rand();
  while (!v) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Plays one seeded run and returns the per-room damage log; hits outside bosses on hotFloor are tallied into hot.
function play(seed, policy, hotFloor, hot) {
  const { game, clock, elements } = loadGame({ seed });
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const seen = new Map();
  const log = { rooms: [], died: false, floorReached: 1, bossCleared: [] };

  const origDamage = game.damage.bind(game);
  game.damage = reason => {
    const before = game.hp;
    const inBoss = game.state === 'BOSS'; // a fatal boss hit flips state to GAMEOVER inside origDamage
    origDamage(reason);
    if (game.hp < before && !inBoss && game.floor === hotFloor) {
      const key = `${game.blueprint.id}\t${reason}\t${Math.round(game.roomTime)}\t${game.currentRoute.mechanicId}`;
      hot[key] = (hot[key] || 0) + 1;
    }
  };

  let roomKey = null, roomDamage = 0, roomName = '';
  for (let frames = 0; frames < FRAME_LIMIT; frames++) {
    const st = game.state;
    if (st === 'GAMEOVER') { log.died = true; break; }
    if (game.floor >= 3) break;
    if (st === 'CHOICE') { game.chooseDoor(0); continue; }
    if (st === 'SPONSOR') { game.declineSponsor(); continue; }
    if (st === 'STAIRS') { game.chooseStairs(false); continue; }
    if (st === 'CLASS') { game.selectClass('brawler'); continue; }
    if (st === 'SAFE') {
      while (game.boxes.length) {
        game.openBox(game.boxes[0]);
        const m = elements.get('lootChoices').innerHTML.match(/data-loot="([a-z]+)"/);
        if (m) game.takeLoot(m[1]);
        if (game.pendingLoot) game.discardLoot();
      }
      if (game.hp < game.maxHp && game.viewers >= 100) game.safeHeal();
      game.leaveSafeRoom();
      continue;
    }
    const key = st === 'BOSS' ? 'boss' : `${game.floor}-${game.roomsOnFloor}`;
    if (key !== roomKey) {
      if (roomKey) log.rooms.push({ key: roomKey, name: roomName, damage: roomDamage });
      roomKey = key; roomDamage = 0;
      roomName = st === 'BOSS' ? `BOSS ${game.floor}` : game.blueprint?.id;
      log.floorReached = Math.max(log.floorReached, game.floor);
    }
    const hpBefore = game.hp;
    if (st === 'RUNNING' || st === 'BOSS') act(game, policy, seen, rand);
    clock.advance(1000 / 60);
    game.update(DT);
    if (game.hp < hpBefore) roomDamage += hpBefore - game.hp;
    if (st === 'BOSS' && game.boss?.defeated && !log.bossCleared.includes(game.floor)) log.bossCleared.push(game.floor);
  }
  if (roomKey) log.rooms.push({ key: roomKey, name: roomName, damage: roomDamage });
  return log;
}

// One frame of simulated input: handle the boss mechanic, then the nearest hazard the player has had time to react to.
function act(game, policy, seen, rand) {
  const p = game.player;
  const speed = game.worldSpeed || 130;
  const threats = game.hazards.filter(h => h.on && !h.friendly && h.x + h.w > p.x);
  for (const h of threats) {
    if (!seen.has(h)) seen.set(h, { visibleAt: null, handled: false, skip: rand() < policy.miss, lead: null });
    const info = seen.get(h);
    if (info.visibleAt === null && h.x < 240) info.visibleAt = game.time;
  }
  // Boss 1: jump the ram so Carl lands on the stalled engine.
  const boss = game.boss;
  if (game.state === 'BOSS' && boss && !boss.defeated && boss.kind === 0) {
    if (boss.mode === 'ram') {
      boss._plan ??= { lead: .22 + gauss(rand) * policy.noise, skip: rand() < policy.miss };
      const tc = (boss.x - (p.x + p.w)) / 185;
      if (!boss._plan.done && !boss._plan.skip && tc <= boss._plan.lead && (!p.airborne || p.jumps < 2)) { p.jump(); boss._plan.done = true; }
    } else boss._plan = null;
  }
  // Boss 2: jump for high coolant valves.
  if (game.state === 'BOSS' && boss && !boss.defeated && boss.kind === 1) {
    for (const k of game.pickups.filter(k => k.on && k.type === 'coolant' && k.y < 300)) {
      k._plan ??= { lead: .3 + gauss(rand) * policy.noise, skip: rand() < policy.miss };
      const tc = (k.x - (p.x + p.w)) / speed;
      if (!k._plan.done && !k._plan.skip && tc <= k._plan.lead && !p.airborne) { p.jump(); k._plan.done = true; }
    }
  }
  const next = threats.map(h => [h, seen.get(h)])
    .filter(([, i]) => !i.handled && i.visibleAt !== null && game.time >= i.visibleAt + policy.react)
    .sort((a, b) => a[0].x - b[0].x)[0];
  if (!next) return;
  const [h, info] = next;
  const tc = (h.x - (p.x + p.w)) / speed;
  const duck = HIGH.has(h.type) && policy.slide && h.type !== 'hunterShot';
  info.lead ??= (duck ? .1 : .2) + gauss(rand) * policy.noise;
  if (tc > info.lead) return;
  if (info.skip) { info.handled = true; return; }
  // A person waits until they can act (lands, or has an air jump) while the hazard is still ahead.
  if (duck) {
    if (p.airborne) {
      if (policy.fastfall && p.vy > -100 && tc < .45 && !info.ff) { p.dive(); info.ff = true; }
      if (tc < -.1) info.handled = true;
      return;
    }
    p.dive(); info.handled = true;
  } else if (!p.airborne || p.jumps < 2) { p.jump(); info.handled = true; }
  else if (tc < -.1) info.handled = true;
}

const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pct = n => n.toFixed(2);
const dmg = n => n === null ? '  -' : n.toFixed(2);

function summarize(logs) {
  const n = logs.length;
  const roomsOf = prefix => logs.flatMap(l => l.rooms.filter(r => r.key.startsWith(prefix)));
  const bossOf = name => logs.flatMap(l => l.rooms.filter(r => r.name === name));
  const reached = name => logs.filter(l => l.rooms.some(r => r.name === name)).length / n;
  return {
    f1Rooms: reached('BOSS 1'),
    f1Boss: logs.filter(l => l.bossCleared.includes(1)).length / n,
    f2Rooms: reached('BOSS 2'),
    f2Boss: logs.filter(l => l.bossCleared.includes(2)).length / n,
    dmgF1: avg(roomsOf('1-').map(r => r.damage)),
    dmgBoss1: avg(bossOf('BOSS 1').map(r => r.damage)),
    dmgF2: avg(roomsOf('2-').map(r => r.damage)),
    dmgBoss2: avg(bossOf('BOSS 2').map(r => r.damage)),
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const names = opts.policy ? [opts.policy] : Object.keys(POLICIES);
  const hot = {};
  const rows = [];
  for (const name of names) {
    const logs = [];
    for (let i = 1; i <= opts.runs; i++) logs.push(play(i * 7919, POLICIES[name], opts.floor, hot));
    rows.push([name, summarize(logs)]);
  }

  console.log(`Playtest: ${opts.runs} runs per policy${process.env.CARLS_DASH_GAME_SRC ? `, game=${process.env.CARLS_DASH_GAME_SRC}` : ''}`);
  console.log('Share of runs that clear (higher is better), damage averages (lower is better)\n');
  const head = ['policy ', 'F1 rooms', 'F1+boss', 'F2 rooms', 'F2+boss', 'dmg/room F1', 'dmg boss1', 'dmg/room F2', 'dmg boss2'];
  console.log(head.join('  '));
  for (const [name, r] of rows) {
    const cells = [name.padEnd(head[0].length), pct(r.f1Rooms), pct(r.f1Boss), pct(r.f2Rooms), pct(r.f2Boss), dmg(r.dmgF1), dmg(r.dmgBoss1), dmg(r.dmgF2), dmg(r.dmgBoss2)];
    console.log(cells.map((c, i) => String(c).padStart(head[i].length)).join('  '));
  }

  if (opts.hotspots) {
    console.log(`\nTop damage spots on floor ${opts.floor} (hits across all runs and policies shown)`);
    console.log('hits  room / hazard / second / route');
    Object.entries(hot).sort((a, b) => b[1] - a[1]).slice(0, 25)
      .forEach(([k, v]) => console.log(`${String(v).padStart(4)}  ${k.split('\t').join(' / ')}`));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
