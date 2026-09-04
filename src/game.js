'use strict';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = 240;
const H = 427;
const GROUND = 350;
const ROOMS_PER_FLOOR = 4;

const RNG = {
  state: 1,
  seed(value) { this.state = (value >>> 0) || 1; },
  next() {
    this.state = this.state + 0x6D2B79F5 | 0;
    let t = Math.imul(this.state ^ this.state >>> 15, 1 | this.state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  },
  int(max) { return Math.floor(this.next() * max); },
  pick(list) { return list[this.int(list.length)]; },
  shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  },
};

const Save = {
  key: 'carlsDoorwayDash.v2',
  data: null,
  load() {
    const defaults = { version: 2, best: 0, runs: 0, discovered: {}, settings: {}, scores: [] };
    try {
      const current = JSON.parse(localStorage.getItem(this.key));
      if (current) this.data = { ...defaults, ...current };
      else {
        const legacy = JSON.parse(localStorage.getItem('carlsDoorwayDash.v1')) || {};
        this.data = { ...defaults, best: legacy.best || 0, settings: legacy.settings || {} };
      }
    } catch (_) {
      this.data = defaults;
    }
    this.data.discovered ||= {};
    this.data.scores ||= [];
  },
  put() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (_) { /* private mode */ }
  },
};
Save.load();

const FLOORS = [
  {
    name: 'ENTRY WORKS', rule: 'CLASSIC RULES · EVERYTHING BITES',
    sky: '#17251f', far: '#284332', near: '#4c6b43', earth: '#312519', trim: '#91a45a',
    hazards: ['log', 'snake', 'pit', 'branch'], boss: 'GOBLIN DOZER', bossColor: '#7ca15a',
  },
  {
    name: 'ASH FOUNDRY', rule: 'HEAT SURGES SPEED UP THE FLOOR',
    sky: '#2a1718', far: '#4c2424', near: '#7a3b2b', earth: '#2b1b19', trim: '#e06d3f',
    hazards: ['flame', 'crusher', 'log', 'pit'], boss: 'THE FURNACE FOREMAN', bossColor: '#d4683e',
  },
  {
    name: 'BLACKOUT BURROWS', rule: 'THE DARK HIDES LATE HAZARDS',
    sky: '#10131e', far: '#1c2440', near: '#30395a', earth: '#151522', trim: '#7c8bc1',
    hazards: ['bat', 'snake', 'pit', 'crusher'], boss: 'THE TUNNEL QUEEN', bossColor: '#7d6faf',
  },
  {
    name: 'IRON TRANSIT', rule: 'CARTS IGNORE PERSONAL SPACE',
    sky: '#1c2529', far: '#34464a', near: '#526267', earth: '#22272a', trim: '#b3a46c',
    hazards: ['cart', 'barrier', 'pit', 'bat'], boss: 'THE TICKET TYRANT', bossColor: '#8f9da0',
  },
  {
    name: 'HUNTING GARDENS', rule: 'DANGER EARNS DOUBLE ATTENTION',
    sky: '#1f162b', far: '#3a2751', near: '#63416e', earth: '#24172c', trim: '#d15b91',
    hazards: ['hunter', 'vine', 'pit', 'log'], boss: 'THE CELEBRITY HUNTER', bossColor: '#c45282',
  },
];

const ROUTES = [
  { id: 'supply', title: 'SUPPLY TUNNEL', icon: '▤', kind: 'safe', threat: .82, reward: 'More coins · calmer hazards', description: 'Boring, survivable, suspiciously clean.' },
  { id: 'mob', title: 'MOB DEN', icon: '♞', kind: 'danger', threat: 1.25, reward: 'Silver box for a clean clear', description: 'The occupants have formed a welcoming committee.' },
  { id: 'stunt', title: 'STUNT CHUTE', icon: '↯', kind: 'danger', threat: 1.38, reward: 'Double stunt viewers', description: 'Built by producers who dislike guardrails.' },
  { id: 'vault', title: 'SPONSOR VAULT', icon: '$', kind: 'danger', threat: 1.18, reward: 'Extra loot · fewer safe choices', description: 'Free merchandise is never free.' },
  { id: 'rescue', title: 'RESCUE SIGNAL', icon: '!', kind: 'rescue', threat: 1.32, reward: 'Gain an ally · no sponsor payout', description: 'Someone is alive behind that door.' },
  { id: 'mystery', title: 'UNMARKED DOOR', icon: '?', kind: 'mystery', threat: 1.05, reward: 'Unknown until opened', description: 'Donut says mystery is another word for poor planning.' },
];

const ITEMS = {
  bomb: { name: 'IMPROVISED BOMB', icon: '✹', rarity: 1, description: 'Clears nearby hazards and hurts a boss.', use(game) { game.detonate(); } },
  grease: { name: 'INDUSTRIAL GREASE', icon: '≈', rarity: 1, description: 'Turns the next ground mob into a projectile.', use(game) { game.greaseReady = true; game.say('SYSTEM', 'Grease armed. This cannot possibly create paperwork.'); } },
  shield: { name: 'SUGAR SHIELD', icon: '◇', rarity: 1, description: 'Five seconds of irresponsible confidence.', use(game) { game.player.invincible = Math.max(game.player.invincible, 5); game.say('DONUT', 'Try to look heroic while I save you.'); } },
  medkit: { name: 'QUESTIONABLE MEDKIT', icon: '+', rarity: 1, description: 'Restores one heart. Side effects include optimism.', use(game) { game.heal(1); } },
  magnet: { name: 'LOOT MAGNET', icon: '∩', rarity: 2, description: 'Pulls coins and rescue targets toward Carl.', use(game) { game.magnetTime = 10; game.say('ANNOUNCER', 'Consumer goods are now consuming themselves.'); } },
  trap: { name: 'FOLDING SNARE', icon: '⌁', rarity: 2, description: 'Catches the next hostile ground creature.', use(game) { game.trapArmed = true; game.say('SYSTEM', 'Trap deployed directly in the running lane. Excellent.'); } },
  spring: { name: 'SPRING SOLE', icon: '↟', rarity: 2, description: 'Adds a third jump for the rest of this room.', use(game) { game.player.bonusJumps = 1; game.say('DONUT', 'Those are still not shoes, Carl.'); } },
  flare: { name: 'CONTRABAND FLARE', icon: '☼', rarity: 2, description: 'Reveals hazards and slows the room for eight seconds.', use(game) { game.scoutTime = 8; game.slowTime = 8; game.say('SYSTEM', 'Visibility upgraded from doomed to concerning.'); } },
  remote: { name: 'BADLY LABELED REMOTE', icon: '▣', rarity: 3, description: 'Reverses every hazard on screen.', use(game) { game.reverseHazards(); } },
  fanclub: { name: 'DONUT FAN CLUB PIN', icon: '♛', rarity: 3, description: 'Refreshes Donut and doubles teamwork rewards.', use(game) { game.donutCooldown = 0; game.teamBoost = 12; game.say('DONUT', 'Finally. A piece of equipment with taste.'); } },
};

const CLASSES = [
  { id: 'brawler', name: 'BAREFOOT BRAWLER', icon: '拳', description: 'Stomps create a wider shockwave and damage bosses twice.' },
  { id: 'trapper', name: 'JUNK ENGINEER', icon: '⚙', description: 'New items gain an extra charge; traps and grease score more.' },
  { id: 'showboat', name: 'CROWD PROBLEM', icon: '★', description: 'Near misses and rescues earn far more viewers.' },
];

const ACHIEVEMENTS = {
  firstMob: { name: 'VIOLENCE, BUT EDUCATIONAL', detail: 'Defeat your first dungeon mob.', tier: 'bronze' },
  nearThree: { name: 'PERSONAL SPACE OPTIONAL', detail: 'Survive three near misses in one run.', tier: 'bronze' },
  comboFive: { name: 'THE CAMERAS NOTICED', detail: 'Reach a five-action stunt chain.', tier: 'silver' },
  mystery: { name: 'LABELS ARE FOR COWARDS', detail: 'Enter an unmarked doorway.', tier: 'bronze' },
  rescue: { name: 'TERRIBLE BUSINESS DECISION', detail: 'Risk the episode to rescue another crawler.', tier: 'silver' },
  noHitDanger: { name: 'STATISTICALLY INCONVENIENT', detail: 'Clear a dangerous room without taking damage.', tier: 'silver' },
  greaseChain: { name: 'APPLIED DUNGEON PHYSICS', detail: 'Use one greased mob to remove another hazard.', tier: 'gold' },
  boss: { name: 'MIDDLE MANAGEMENT REMOVED', detail: 'Defeat a floor boss.', tier: 'gold' },
  bossClean: { name: 'NO NOTES FROM MEDICAL', detail: 'Defeat a boss without taking damage.', tier: 'gold' },
  oneHeart: { name: 'HEALTH BAR IS DECORATIVE', detail: 'Clear a room with one heart remaining.', tier: 'silver' },
  decline: { name: 'UNMONETIZABLE BEHAVIOR', detail: 'Refuse a sponsor offer.', tier: 'bronze' },
  viewers: { name: 'A SMALL PLANET IS WATCHING', detail: 'Reach 5,000 viewers in one episode.', tier: 'gold' },
  teamwork: { name: 'CAT-ASSISTED MAYHEM', detail: 'Chain three Donut-assisted takedowns.', tier: 'silver' },
  classed: { name: 'EMPLOYMENT STATUS: COMPLICATED', detail: 'Choose a crawler class.', tier: 'silver' },
};

const DONUT_LINES = {
  start: [
    'DONUT: “Try not to embarrass me in front of the entire galaxy.”',
    'DONUT: “I have reviewed the route. It is all unacceptable.”',
    'DONUT: “If anyone asks, this was your idea.”',
  ],
  door: [
    'DONUT: “The dangerous one probably has better prizes.”',
    'DONUT: “I vote for whichever door has room service.”',
    'DONUT: “Do choose quickly. The walls are being theatrical.”',
  ],
  safe: [
    'DONUT: “Open the shiny boxes first. This is basic leadership.”',
    'DONUT: “We should heal me. I am not injured, but still.”',
    'DONUT: “Three inventory slots? These people have no respect for accessories.”',
  ],
};

const DEATH_LINES = [
  'ANNOUNCER: The contestant has become a cautionary floor decoration.',
  'DONUT: “Carl, being horizontal is not a combat strategy.”',
  'SYSTEM: Run complete. Cause of failure: excessive confidence near teeth.',
  'ANNOUNCER: Medical has requested we stop calling this a shortcut.',
];

const Audio = {
  context: null,
  muted: false,
  init() {
    if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === 'suspended') this.context.resume();
  },
  tone(frequency, duration = .07, type = 'square', volume = .035, delay = 0) {
    if (this.muted || !this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime + delay);
    gain.gain.setValueAtTime(volume, this.context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(.001, this.context.currentTime + delay + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(this.context.currentTime + delay);
    oscillator.stop(this.context.currentTime + delay + duration);
  },
  jump() { this.tone(210, .09); },
  coin() { this.tone(760, .05); this.tone(1120, .07, 'square', .025, .05); },
  hurt() { this.tone(90, .24, 'sawtooth', .07); },
  stomp() { this.tone(120, .12, 'square', .07); },
  door() { this.tone(240, .08); this.tone(360, .1, 'square', .03, .07); },
  achievement() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .13, 'square', .04, i * .08)); },
  box() { [330, 440, 660].forEach((f, i) => this.tone(f, .16, 'triangle', .04, i * .09)); },
};

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

class Player {
  constructor(game) { this.game = game; this.reset(); }
  reset() {
    this.x = 48;
    this.y = GROUND - 30;
    this.w = 18;
    this.h = 30;
    this.vy = 0;
    this.airborne = false;
    this.jumps = 0;
    this.bonusJumps = 0;
    this.slideTime = 0;
    this.invincible = 0;
    this.dashTime = 0;
    this.dashCooldown = 0;
    this.landSquash = 0;
    this.runFrame = 0;
  }
  jump() {
    const maxJumps = 2 + this.bonusJumps;
    if (!this.airborne || this.jumps < maxJumps) {
      this.slideTime = 0;
      this.vy = -365;
      this.airborne = true;
      this.jumps += 1;
      Audio.jump();
      this.game.particlesAt(this.x + 9, this.y + this.h, '#eed786', 5);
    }
  }
  dive() {
    if (this.airborne) {
      this.vy = Math.max(430, this.vy);
      this.game.diveActive = true;
      this.game.addViewers(15, 'DIVE');
    } else {
      this.slideTime = .62;
      this.game.roomStats.slides += 1;
    }
  }
  dash() {
    if (this.dashCooldown > 0) return;
    this.dashCooldown = 3.2;
    this.dashTime = .38;
    this.invincible = Math.max(this.invincible, .42);
    this.game.addViewers(20, 'DASH');
    this.game.particlesAt(this.x, this.y + 18, '#83d9ed', 9);
    Audio.tone(390, .1, 'sawtooth', .04);
  }
  update(dt) {
    this.runFrame += dt * 11;
    this.invincible = Math.max(0, this.invincible - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.slideTime = Math.max(0, this.slideTime - dt);
    this.landSquash = Math.max(0, this.landSquash - dt * 5);
    if (this.airborne) {
      this.vy += 980 * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND - this.h) {
        const hard = this.vy > 330;
        this.y = GROUND - this.h;
        this.vy = 0;
        this.airborne = false;
        this.jumps = 0;
        this.landSquash = hard ? .3 : .12;
        this.game.particlesAt(this.x + 9, GROUND, '#8d7654', hard ? 8 : 4);
        if (this.game.diveActive) this.game.groundSlam();
        this.game.diveActive = false;
      }
    }
  }
  box() {
    if (this.slideTime > 0) return { x: this.x + 1, y: GROUND - 15, w: 22, h: 14 };
    return { x: this.x + 2, y: this.y + 2, w: this.w - 4, h: this.h - 3 };
  }
  draw() {
    const sliding = this.slideTime > 0;
    const flicker = this.invincible > 0 && Math.floor(this.invincible * 18) % 2;
    if (flicker) return;
    const speedTrail = this.dashTime > 0;
    if (speedTrail) {
      ctx.globalAlpha = .22;
      this.drawBody(this.x - 12, this.y, sliding);
      ctx.globalAlpha = .45;
      this.drawBody(this.x - 6, this.y, sliding);
      ctx.globalAlpha = 1;
    }
    this.drawBody(this.x, this.y, sliding);
  }
  drawBody(x, y, sliding) {
    if (sliding) {
      y = GROUND - 16;
      ctx.fillStyle = '#d89970'; ctx.fillRect(x + 3, y + 3, 13, 8);
      ctx.fillStyle = '#37231d'; ctx.fillRect(x + 2, y + 2, 8, 3);
      ctx.fillStyle = '#d54661'; ctx.fillRect(x + 8, y + 10, 15, 6);
      ctx.fillStyle = '#f0bd91'; ctx.fillRect(x + 20, y + 12, 8, 4);
      this.drawDonut(x + 7, y - 5);
      return;
    }
    const squash = Math.round(this.landSquash * 8);
    y += squash;
    ctx.fillStyle = '#d89970'; ctx.fillRect(x + 5, y + 2, 10, 10);
    ctx.fillStyle = '#37231d'; ctx.fillRect(x + 4, y + 1, 11, 3);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 12, y + 5, 2, 2);
    ctx.fillStyle = '#d89970'; ctx.fillRect(x + 3, y + 12, 14, 11);
    ctx.fillStyle = '#d54661'; ctx.fillRect(x + 3, y + 21, 14, 6);
    const step = Math.floor(this.runFrame) % 2;
    ctx.fillStyle = '#d89970';
    ctx.fillRect(x + (step ? 2 : 5), y + 27, 5, 3);
    ctx.fillRect(x + (step ? 12 : 9), y + 27, 5, 3);
    ctx.fillStyle = '#f0bd91';
    ctx.fillRect(x + (step ? 0 : 3), y + 29, 8, 2);
    ctx.fillRect(x + (step ? 11 : 8), y + 29, 8, 2);
    this.drawDonut(x + 12, y + 7);
  }
  drawDonut(x, y) {
    ctx.fillStyle = '#f4eee4'; ctx.fillRect(x, y, 9, 7);
    ctx.fillRect(x, y - 2, 3, 3); ctx.fillRect(x + 6, y - 2, 3, 3);
    ctx.fillStyle = '#d0ac3d'; ctx.fillRect(x + 2, y - 3, 5, 2);
    ctx.fillStyle = '#33243b'; ctx.fillRect(x + 2, y + 3, 2, 2); ctx.fillRect(x + 6, y + 3, 2, 2);
  }
}

const Game = {
  state: 'TITLE',
  lastFrame: 0,
  accumulator: 0,
  time: 0,
  floor: 1,
  roomsOnFloor: 0,
  roomsTotal: 0,
  viewers: 0,
  displayViewers: 0,
  hp: 4,
  maxHp: 4,
  speed: 122,
  scoreMultiplier: 1,
  hazards: [],
  pickups: [],
  particles: [],
  inventory: [],
  boxes: [],
  runAchievements: new Set(),
  achievementQueue: [],
  player: null,

  start(daily = false) {
    Audio.init();
    const date = new Date();
    this.seed = daily
      ? date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate()
      : Math.floor(Math.random() * 0xffffffff);
    RNG.seed(this.seed);
    Object.assign(this, {
      state: 'RUNNING', time: 0, floor: 1, roomsOnFloor: 0, roomsTotal: 0,
      viewers: 0, displayViewers: 0, hp: 4, maxHp: 4, speed: 122,
      hazards: [], pickups: [], particles: [], inventory: [], boxes: [],
      runAchievements: new Set(), achievementQueue: [], classId: null,
      donutMode: 'ZAP', donutCooldown: 0, nearMisses: 0, combo: 0, comboTimer: 0,
      teamwork: 0, teamBoost: 0, allyShield: 0, magnetTime: 0, scoutTime: 0,
      slowTime: 0, greaseReady: false, trapArmed: false, greaseKills: 0,
      nextSponsorAt: 1000, pendingSponsor: false, sponsorModifier: null,
      daily, shake: 0, flash: 0, currentRoute: ROUTES[0], afterSafe: 'door',
      achievementShowing: false,
    });
    $('achievement').classList.remove('on');
    this.player = new Player(this);
    this.hideAllOverlays();
    $('hud').classList.remove('hidden');
    this.beginRoom(ROUTES[0]);
    this.say('DONUT', RNG.pick(DONUT_LINES.start).replace(/^DONUT:\s*/, ''));
    this.updateHud();
  },

  beginRoom(route) {
    this.state = 'RUNNING';
    this.hideAllOverlays();
    $('hud').classList.remove('hidden');
    this.currentRoute = { ...route };
    if (route.id === 'mystery') {
      const reveal = RNG.pick(ROUTES.filter(item => item.id !== 'mystery'));
      this.currentRoute = { ...reveal, id: 'mystery', title: 'UNMARKED: ' + reveal.title };
      this.unlockAchievement('mystery');
    }
    this.roomTime = 0;
    this.roomDuration = 10.5;
    this.spawnTimer = .8;
    this.roomEnded = false;
    this.hazards = [];
    this.pickups = [];
    this.player.x = 48;
    this.player.bonusJumps = 0;
    this.roomStats = { damage: 0, kills: 0, near: 0, slides: 0, stomps: 0, rescue: false };
    const floor = this.floorData();
    this.scoreMultiplier = this.currentRoute.id === 'stunt' ? 2 : 1;
    if (this.sponsorModifier?.double) this.scoreMultiplier *= 2;
    if (floor.name === 'HUNTING GARDENS' && this.currentRoute.kind === 'danger') this.scoreMultiplier *= 2;
    if (this.sponsorModifier?.noCoins) this.noCoins = true; else this.noCoins = false;
    $('roomGoal').textContent = `${this.currentRoute.title} · ${floor.rule}`;
    this.say('SYSTEM', `Room ${this.roomsOnFloor + 1}/${ROOMS_PER_FLOOR}. ${this.currentRoute.description}`);
  },

  floorData() { return FLOORS[(this.floor - 1) % FLOORS.length]; },

  update(dt) {
    if (this.state === 'STAIRS') {
      this.stairsTime = Math.max(0, this.stairsTime - dt);
      $('stairsClock').textContent = this.stairsTime.toFixed(1);
      if (this.stairsTime <= 0) this.chooseStairs(false);
      return;
    }
    if (this.state !== 'RUNNING' && this.state !== 'BOSS') return;
    this.time += dt;
    this.player.update(dt);
    this.donutCooldown = Math.max(0, this.donutCooldown - dt);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = Math.max(0, this.combo - dt * .8);
    this.teamBoost = Math.max(0, this.teamBoost - dt);
    this.magnetTime = Math.max(0, this.magnetTime - dt);
    this.scoutTime = Math.max(0, this.scoutTime - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    const slow = this.slowTime > 0 ? .62 : 1;
    let floorSpeed = this.speed + Math.min(72, this.floor * 8 + this.roomsTotal * 2.2);
    if (this.floorData().name === 'ASH FOUNDRY') floorSpeed *= 1 + Math.max(0, Math.sin(this.time * 1.3)) * .22;
    const routeThreat = this.currentRoute?.threat || 1;
    const sponsorThreat = this.sponsorModifier?.threat || 1;
    this.worldSpeed = floorSpeed * routeThreat * sponsorThreat * slow;

    if (this.state === 'BOSS') this.updateBoss(dt);
    else this.updateRoom(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.addViewers(dt * (7 + this.floor * 1.4));
    if (this.viewers >= this.nextSponsorAt) {
      this.pendingSponsor = true;
      this.nextSponsorAt = Math.floor(this.nextSponsorAt * 1.9 + 400);
    }
    if (this.viewers >= 5000) this.unlockAchievement('viewers');
    this.updateHud();
  },

  updateRoom(dt) {
    this.roomTime += dt;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.roomTime < 8.7) {
      this.spawnWave();
      const density = this.currentRoute.kind === 'safe' ? 1.7 : 1.35;
      this.spawnTimer = density + RNG.next() * .55;
    }
    if (this.currentRoute.id === 'rescue' && !this.rescueSpawned && this.roomTime > 6.5) {
      this.rescueSpawned = true;
      this.pickups.push({ type: 'crawler', x: W + 10, y: GROUND - 18, w: 12, h: 18, on: true });
      this.say('DONUT', 'There! Someone is still moving. Inconveniently heroic time, Carl.');
    }
    if (this.roomTime >= this.roomDuration && !this.roomEnded && !this.hazards.some(item => item.on && item.x > -40)) {
      this.completeRoom();
    }
  },

  spawnWave() {
    const types = this.floorData().hazards;
    const first = RNG.pick(types);
    this.spawnHazard(first, W + 8);
    const dangerous = this.currentRoute.kind !== 'safe';
    if (dangerous && RNG.next() < .46) {
      const second = RNG.pick(types);
      this.spawnHazard(second, W + 62 + RNG.int(22));
    }
    if (!this.noCoins) {
      const arc = first === 'pit' || first === 'log';
      const coinCount = ['vault', 'supply'].includes(this.currentRoute.id) ? 6 : 4;
      for (let i = 0; i < coinCount; i++) {
        this.pickups.push({
          type: 'coin', x: W + 15 + i * 12,
          y: arc ? GROUND - 39 - Math.sin(i / 3 * Math.PI) * 30 : GROUND - 19,
          w: 5, h: 8, on: true, spin: RNG.next() * 6,
        });
      }
    }
  },

  spawnHazard(type, x) {
    const base = { type, x, on: true, passed: false, friendly: false, age: 0, vx: 0 };
    const shapes = {
      log: { y: GROUND - 13, w: 25, h: 13 }, snake: { y: GROUND - 8, w: 18, h: 8 },
      pit: { y: GROUND - 3, w: 31, h: 7 }, branch: { y: GROUND - 48, w: 28, h: 17 },
      flame: { y: GROUND - 34, w: 13, h: 34, telegraph: .65 }, crusher: { y: GROUND - 54, w: 25, h: 24 },
      bat: { y: GROUND - 31, w: 18, h: 12 }, cart: { y: GROUND - 17, w: 34, h: 17 },
      barrier: { y: GROUND - 25, w: 14, h: 25 }, hunter: { y: GROUND - 27, w: 15, h: 27 },
      vine: { y: GROUND - 12, w: 13, h: 12 },
    };
    this.hazards.push({ ...base, ...(shapes[type] || shapes.log) });
  },

  updateHazards(dt) {
    const playerBox = this.player.box();
    for (const hazard of this.hazards) {
      if (!hazard.on) continue;
      hazard.age += dt;
      if (hazard.telegraph > 0) hazard.telegraph -= dt;
      if (hazard.friendly) hazard.x += 68 * dt;
      else hazard.x -= this.worldSpeed * dt;

      if (hazard.friendly) {
        const victim = this.hazards.find(other => other.on && !other.friendly && other !== hazard && intersects(hazard, other));
        if (victim) {
          hazard.on = false;
          victim.on = false;
          this.greaseKills += 1;
          this.addViewers(this.classId === 'trapper' ? 420 : 260, 'IMPROVISED');
          this.particlesAt(victim.x, victim.y, '#b6e36a', 15);
          this.unlockAchievement('greaseChain');
          continue;
        }
      }

      if (hazard.type === 'pit') {
        const overPit = playerBox.x + playerBox.w > hazard.x && playerBox.x < hazard.x + hazard.w;
        if (overPit && !this.player.airborne && this.player.invincible <= 0) this.damage('the floor opened');
      } else if (hazard.telegraph <= 0 && !hazard.friendly && intersects(playerBox, hazard)) {
        const stompable = ['log', 'snake', 'cart', 'hunter', 'vine'].includes(hazard.type);
        if (stompable && this.player.airborne && this.player.vy > 80 && playerBox.y + playerBox.h < hazard.y + hazard.h * .72) {
          this.destroyHazard(hazard, 'STOMP');
          this.player.vy = -270;
          this.player.airborne = true;
          this.roomStats.stomps += 1;
        } else if (this.trapArmed && hazard.y + hazard.h >= GROUND - 30) {
          this.trapArmed = false;
          this.destroyHazard(hazard, 'SNARED');
        } else if (this.greaseReady && hazard.y + hazard.h >= GROUND - 30) {
          this.greaseReady = false;
          hazard.friendly = true;
          hazard.x = this.player.x + 22;
          this.addViewers(80, 'GREASED');
          this.say('ANNOUNCER', 'The obstacle has changed teams without consulting its agent.');
        } else {
          this.damage(hazard.type);
          hazard.on = false;
        }
      }

      if (!hazard.passed && hazard.x + hazard.w < this.player.x && hazard.x + hazard.w > this.player.x - 9) {
        hazard.passed = true;
        const activeMove = this.player.airborne || this.player.slideTime > 0 || this.player.dashTime > 0;
        if (activeMove) this.nearMiss(hazard);
      }
      if (hazard.x < -60 || hazard.x > W + 100) hazard.on = false;
    }
    this.hazards = this.hazards.filter(item => item.on);
  },

  destroyHazard(hazard, label = 'HIT') {
    hazard.on = false;
    this.roomStats.kills += 1;
    this.combo += 1;
    this.comboTimer = 3.5;
    const reward = 90 * (1 + Math.min(2, this.combo * .15));
    this.addViewers(reward, label);
    this.particlesAt(hazard.x + hazard.w / 2, hazard.y, '#9be56d', 12);
    Audio.stomp();
    this.unlockAchievement('firstMob');
    if (this.combo >= 5) this.unlockAchievement('comboFive');
  },

  nearMiss(hazard) {
    this.nearMisses += 1;
    this.roomStats.near += 1;
    this.combo += 1;
    this.comboTimer = 3.5;
    const classBonus = this.classId === 'showboat' ? 1.75 : 1;
    this.addViewers((45 + this.combo * 9) * classBonus, 'DANGER CLOSE');
    if (this.nearMisses >= 3) this.unlockAchievement('nearThree');
    if (this.combo >= 5) this.unlockAchievement('comboFive');
    if ([3, 5, 8].includes(Math.floor(this.combo))) this.say('ANNOUNCER', `Stunt chain ${Math.floor(this.combo)}! Legal is pretending not to watch.`);
  },

  updatePickups(dt) {
    const playerBox = this.player.box();
    for (const pickup of this.pickups) {
      if (!pickup.on) continue;
      pickup.x -= this.worldSpeed * dt;
      pickup.spin = (pickup.spin || 0) + dt * 8;
      if (this.magnetTime > 0 && pickup.x < W - 15) {
        pickup.x += (this.player.x - pickup.x) * dt * 5;
        pickup.y += (this.player.y + 12 - pickup.y) * dt * 5;
      }
      if (intersects(playerBox, pickup) || (pickup.type === 'crawler' && Math.abs(pickup.x - this.player.x) < 22)) {
        pickup.on = false;
        if (pickup.type === 'coin') {
          this.addViewers(this.currentRoute.id === 'vault' ? 22 : 10, 'LOOT');
          this.donutCooldown = Math.max(0, this.donutCooldown - .25);
          Audio.coin();
        } else if (pickup.type === 'crawler') {
          this.roomStats.rescue = true;
          this.allyShield += 1;
          this.addViewers(this.classId === 'showboat' ? 700 : 420, 'CRAWLER RESCUED');
          this.unlockAchievement('rescue');
          this.say('SYSTEM', 'Crawler recovered. Sponsor enthusiasm has decreased.');
        }
      }
      if (pickup.x < -25) pickup.on = false;
    }
    this.pickups = this.pickups.filter(item => item.on);
  },

  groundSlam() {
    const radius = this.classId === 'brawler' ? 52 : 34;
    let hits = 0;
    for (const hazard of this.hazards) {
      if (!hazard.on || hazard.type === 'pit') continue;
      if (Math.abs(hazard.x - this.player.x) < radius) {
        this.destroyHazard(hazard, 'GROUND SLAM');
        hits += 1;
      }
    }
    if (hits) {
      this.shake = .45;
      this.addViewers(hits * hits * 80, `SLAM ×${hits}`);
    }
  },

  completeRoom() {
    this.roomEnded = true;
    this.roomsOnFloor += 1;
    this.roomsTotal += 1;
    if (this.currentRoute.kind === 'danger' && this.roomStats.damage === 0) {
      this.unlockAchievement('noHitDanger');
      if (this.currentRoute.id === 'mob') this.awardBox('silver');
    }
    if (this.currentRoute.id === 'vault') this.awardBox(RNG.next() < .24 ? 'gold' : 'bronze');
    if (this.hp === 1) this.unlockAchievement('oneHeart');
    this.sponsorModifier = null;
    this.rescueSpawned = false;
    if (this.roomsOnFloor >= ROOMS_PER_FLOOR) this.queueInterlude('boss');
    else if (this.roomsOnFloor === 2) this.queueInterlude('safe');
    else this.queueInterlude('door');
  },

  queueInterlude(next) {
    this.interludeNext = next;
    if (this.pendingSponsor) this.showSponsor();
    else this.continueInterlude();
  },

  continueInterlude() {
    const next = this.interludeNext;
    this.interludeNext = null;
    if (next === 'safe') this.showSafeRoom('door');
    else if (next === 'boss') this.startBoss();
    else if (next === 'floor') this.advanceFloor();
    else this.showDoors();
  },

  showDoors() {
    this.state = 'CHOICE';
    this.showOverlay('doorChoice');
    const pool = RNG.shuffle(ROUTES);
    let choices = pool.slice(0, 2);
    if (choices[0].id === choices[1].id) choices[1] = ROUTES[(ROUTES.indexOf(choices[0]) + 1) % ROUTES.length];
    this.doorChoices = choices;
    $('donutAdvice').textContent = RNG.pick(DONUT_LINES.door);
    $('doors').innerHTML = choices.map((route, index) => `
      <button class="door ${escapeHtml(route.kind)}" data-door="${index}">
        <span class="door-icon">${route.icon}</span>
        <b>${escapeHtml(route.title)}</b>
        <small>${escapeHtml(route.description)}</small>
        <em>${escapeHtml(route.reward)}</em>
      </button>`).join('');
    document.querySelectorAll('[data-door]').forEach(button => {
      button.onclick = () => this.chooseDoor(Number(button.dataset.door));
    });
    $('scoutDoorBtn').disabled = this.donutCooldown > 0;
    $('scoutDoorBtn').textContent = this.donutMode === 'SCOUT' ? 'ASK DONUT TO SCOUT' : `SWITCH DONUT TO SCOUT FIRST`;
  },

  chooseDoor(index) {
    if (this.state !== 'CHOICE') return;
    Audio.init();
    Audio.door();
    this.beginRoom(this.doorChoices[index]);
  },

  showSafeRoom(after = 'door') {
    this.state = 'SAFE';
    this.afterSafe = after;
    this.healUsed = false;
    this.showOverlay('safeRoom');
    $('safeDialogue').textContent = RNG.pick(DONUT_LINES.safe);
    $('lootChoices').classList.add('hidden');
    $('lootChoices').innerHTML = '';
    this.renderSafeRoom();
  },

  renderSafeRoom() {
    const counts = { bronze: 0, silver: 0, gold: 0 };
    this.boxes.forEach(tier => { counts[tier] += 1; });
    $('boxes').innerHTML = this.boxes.length
      ? ['bronze', 'silver', 'gold'].filter(tier => counts[tier]).map(tier =>
        `<button class="box-button ${tier}" data-box="${tier}">${tier.toUpperCase()} BOX ×${counts[tier]}</button>`).join('')
      : '<p>No boxes. The System is withholding affection.</p>';
    document.querySelectorAll('[data-box]').forEach(button => {
      button.onclick = () => this.openBox(button.dataset.box);
    });
    $('safeInventory').innerHTML = this.inventory.length
      ? this.inventory.map(item => `<div class="inventory-card"><b>${item.icon} ${escapeHtml(item.name)}</b>${item.charges} charge${item.charges === 1 ? '' : 's'}</div>`).join('')
      : '<p>Inventory empty. Carl has pockets but no dignity.</p>';
    $('healBtn').disabled = this.healUsed || this.hp >= this.maxHp || this.viewers < 100;
    $('healBtn').textContent = this.hp >= this.maxHp ? 'FULL HEALTH' : 'PATCH UP · 100 VIEWERS';
    $('leaveSafeBtn').textContent = this.afterSafe === 'floor' ? 'DESCEND A FLOOR' : this.afterSafe === 'boss' ? 'FACE THE BOSS' : 'BACK TO THE DUNGEON';
  },

  openBox(tier) {
    const index = this.boxes.indexOf(tier);
    if (index < 0) return;
    this.boxes.splice(index, 1);
    Audio.box();
    const rarityMax = tier === 'gold' ? 3 : tier === 'silver' ? 2 : 1;
    let pool = Object.entries(ITEMS).filter(([, item]) => item.rarity <= rarityMax);
    if (tier === 'gold') pool = Object.entries(ITEMS).filter(([, item]) => item.rarity >= 2);
    const options = RNG.shuffle(pool).slice(0, 3);
    $('lootChoices').classList.remove('hidden');
    $('lootChoices').innerHTML = options.map(([id, item]) => `
      <button class="loot-card" data-loot="${id}">
        <b>${escapeHtml(item.name)}</b><span>${item.icon}</span><small>${escapeHtml(item.description)}</small>
      </button>`).join('');
    document.querySelectorAll('[data-loot]').forEach(button => {
      button.onclick = () => this.takeLoot(button.dataset.loot);
    });
    this.renderSafeRoom();
  },

  takeLoot(id) {
    const definition = ITEMS[id];
    if (!definition) return;
    const existing = this.inventory.find(item => item.id === id);
    const charges = this.classId === 'trapper' ? 2 : 1;
    if (existing) existing.charges += charges;
    else {
      if (this.inventory.length >= 3) this.inventory.shift();
      this.inventory.push({ id, ...definition, charges });
    }
    $('lootChoices').classList.add('hidden');
    $('lootChoices').innerHTML = '';
    this.say('SYSTEM', `${definition.name} equipped. Warranty immediately void.`);
    this.renderSafeRoom();
    this.updateHud();
  },

  leaveSafeRoom() {
    if (this.state !== 'SAFE') return;
    const after = this.afterSafe;
    if (after === 'floor') this.showStairs();
    else if (after === 'boss') this.queueInterlude('boss');
    else this.queueInterlude('door');
  },

  showStairs() {
    this.state = 'STAIRS';
    this.stairsTime = 6;
    $('stairsClock').textContent = '6.0';
    this.showOverlay('stairs');
    this.say('ANNOUNCER', 'The stairwell deadline is live. Greed remains available as a premium option.');
  },

  chooseStairs(greedy) {
    if (this.state !== 'STAIRS') return;
    if (greedy) {
      this.awardBox('silver');
      this.hp = Math.max(1, this.hp - 1);
      this.addViewers(300, 'LAST-SECOND LOOT');
      this.say('SYSTEM', 'Delay purchased with one heart. Economists are alarmed.');
    } else this.addViewers(Math.round(this.stairsTime * 35), 'EARLY DESCENT');
    this.advanceFloor();
  },

  showSponsor() {
    this.pendingSponsor = false;
    this.state = 'SPONSOR';
    this.showOverlay('sponsor');
    $('sponsorText').textContent = 'The audience enjoyed that. A corporation would now like to make survival worse.';
    const offers = RNG.shuffle([
      { id: 'double', title: 'DOUBLE OR TROUBLE', text: 'Double viewers next room; hazards move 25% faster.' },
      { id: 'medical', title: 'MEDICAL MIRACLE', text: 'Restore all hearts; next room contains no coins.' },
      { id: 'crate', title: 'MYSTERY CRATE', text: 'Take a Gold Box now; surrender one heart.' },
      { id: 'donut', title: 'ROYAL ENDORSEMENT', text: 'Refresh Donut; dangerous routes get denser.' },
    ]).slice(0, 2);
    $('sponsorChoices').innerHTML = offers.map(offer => `<button data-offer="${offer.id}"><b>${offer.title}</b><br><small>${offer.text}</small></button>`).join('');
    document.querySelectorAll('[data-offer]').forEach(button => {
      button.onclick = () => this.acceptSponsor(button.dataset.offer);
    });
  },

  acceptSponsor(id) {
    if (id === 'double') this.sponsorModifier = { double: true, threat: 1.25 };
    if (id === 'medical') { this.hp = this.maxHp; this.sponsorModifier = { noCoins: true }; }
    if (id === 'crate') { this.hp = Math.max(1, this.hp - 1); this.awardBox('gold'); }
    if (id === 'donut') { this.donutCooldown = 0; this.sponsorModifier = { threat: 1.18 }; }
    this.say('ANNOUNCER', 'Contract accepted. Fine print has been released into the ventilation system.');
    this.continueInterlude();
  },

  declineSponsor() {
    this.unlockAchievement('decline');
    this.say('DONUT', 'I have declined their offer and also blocked their account.');
    this.continueInterlude();
  },

  startBoss() {
    this.state = 'BOSS';
    this.hideAllOverlays();
    $('hud').classList.remove('hidden');
    this.hazards = [];
    this.pickups = [];
    this.currentRoute = { id: 'boss', title: this.floorData().boss, kind: 'danger', threat: 1 };
    this.scoreMultiplier = this.sponsorModifier?.double ? 2 : 1;
    this.boss = {
      name: this.floorData().boss, x: W - 51, y: GROUND - 43, w: 39, h: 43,
      hp: 3 + Math.min(3, this.floor - 1), maxHp: 3 + Math.min(3, this.floor - 1),
      timer: 2.2, vulnerable: 0, hitCooldown: 0, defeated: false,
    };
    this.bossNoHit = true;
    this.bossWave = 0;
    this.roomStats = { damage: 0, kills: 0, near: 0, slides: 0, stomps: 0, rescue: false };
    $('roomGoal').textContent = `BOSS · ${this.boss.name}`;
    this.say('ANNOUNCER', `${this.boss.name} has entered the set. Ratings have become medically significant.`);
  },

  updateBoss(dt) {
    const boss = this.boss;
    if (!boss || boss.defeated) return;
    boss.timer -= dt;
    boss.vulnerable = Math.max(0, boss.vulnerable - dt);
    boss.hitCooldown = Math.max(0, boss.hitCooldown - dt);
    if (boss.timer <= 0) {
      boss.vulnerable = 1.65;
      boss.timer = 4.5 - Math.min(1.2, this.floor * .15);
      this.bossWave += 1;
      const attacks = this.floorData().hazards.filter(type => type !== 'pit');
      this.spawnHazard(RNG.pick(attacks), W + 8);
      if (this.bossWave % 2 === 0) this.spawnHazard('pit', W + 65);
      this.say('SYSTEM', `${boss.name}: weak point exposed. Try violence with timing.`);
    }
    const targetX = boss.vulnerable > 0 ? 62 : W - 51;
    boss.x += (targetX - boss.x) * dt * 4;
    if (boss.hitCooldown <= 0 && intersects(this.player.box(), boss)) {
      if (boss.vulnerable > 0 && this.player.airborne && this.player.vy > 60) {
        this.hitBoss(this.classId === 'brawler' ? 2 : 1);
        this.player.vy = -310;
      } else {
        this.damage('boss');
        boss.hitCooldown = 1;
      }
    }
  },

  hitBoss(amount = 1) {
    if (!this.boss || this.boss.defeated || this.boss.hitCooldown > 0) return;
    this.boss.hp -= amount;
    this.boss.hitCooldown = .55;
    this.boss.vulnerable = 0;
    this.shake = .7;
    this.flash = .12;
    this.combo += 1;
    this.comboTimer = 4;
    this.addViewers(350 * amount, 'BOSS HIT');
    this.particlesAt(this.boss.x + 18, this.boss.y + 18, '#ffe36d', 22);
    Audio.stomp();
    if (this.boss.hp <= 0) this.defeatBoss();
  },

  defeatBoss() {
    this.boss.defeated = true;
    this.hazards = [];
    this.addViewers(1000 + this.floor * 250, 'BOSS DEFEATED');
    this.awardBox('gold');
    this.unlockAchievement('boss');
    if (this.bossNoHit) this.unlockAchievement('bossClean');
    Audio.achievement();
    this.say('ANNOUNCER', `${this.boss.name} has been reassigned to post-production.`);
    this.sponsorModifier = null;
    window.setTimeout(() => {
      if (this.state === 'BOSS') this.showSafeRoom('floor');
    }, 1500);
  },

  advanceFloor() {
    this.floor += 1;
    this.roomsOnFloor = 0;
    this.hp = Math.min(this.maxHp, this.hp + 1);
    this.speed += 7;
    this.donutMode = ['ZAP', 'CHARM', 'SCOUT'][(this.floor - 1) % 3];
    this.say('SYSTEM', `Welcome to Floor ${this.floor}: ${this.floorData().name}. ${this.floorData().rule}.`);
    if (this.floor === 3 && !this.classId) this.showClasses();
    else this.showDoors();
    this.updateHud();
  },

  showClasses() {
    this.state = 'CLASS';
    this.showOverlay('classSelect');
    $('classes').innerHTML = CLASSES.map(entry => `
      <button class="loot-card" data-class="${entry.id}">
        <b>${entry.name}</b><span>${entry.icon}</span><small>${entry.description}</small>
      </button>`).join('');
    document.querySelectorAll('[data-class]').forEach(button => {
      button.onclick = () => this.selectClass(button.dataset.class);
    });
  },

  selectClass(id) {
    this.classId = id;
    const chosen = CLASSES.find(entry => entry.id === id);
    this.unlockAchievement('classed');
    this.say('SYSTEM', `${chosen.name} selected. Career counseling is unavailable.`);
    this.showDoors();
  },

  useDonut() {
    if (!['RUNNING', 'BOSS', 'CHOICE'].includes(this.state) || this.donutCooldown > 0) return;
    Audio.init();
    if (this.state === 'CHOICE' && this.donutMode === 'SCOUT') {
      const mystery = this.doorChoices.find(route => route.id === 'mystery');
      if (mystery) {
        const reveal = RNG.pick(ROUTES.filter(route => !['mystery'].includes(route.id)));
        Object.assign(mystery, reveal, { title: `SCOUTED: ${reveal.title}` });
        this.showDoorsFromExisting();
        this.donutCooldown = 8;
        this.say('DONUT', 'I have investigated. You are welcome.');
      } else {
        const safest = [...this.doorChoices].sort((a, b) => a.threat - b.threat)[0];
        $('donutAdvice').textContent = `DONUT: “${safest.title} is less likely to ruin my fur.”`;
        this.donutCooldown = 5;
        this.showDoorsFromExisting();
      }
      return;
    }
    if (this.donutMode === 'ZAP') {
      if (this.state === 'BOSS' && this.boss?.vulnerable > 0) this.hitBoss(1);
      else {
        const target = this.nearestHazard();
        if (target) {
          this.destroyHazard(target, 'DONUT ZAP');
          this.teamwork += 1;
          this.particlesAt(target.x, target.y, '#d393e7', 12);
        }
      }
      this.say('DONUT', 'Target removed. Applause is appropriate.');
    } else if (this.donutMode === 'CHARM') {
      const target = this.nearestHazard();
      if (target && target.type !== 'pit') {
        target.friendly = true;
        this.teamwork += 1;
        this.say('DONUT', 'It works for me now. We discussed benefits.');
      } else this.allyShield += 1;
    } else {
      this.scoutTime = 7;
      this.slowTime = 4;
      this.say('DONUT', 'I have identified every obvious threat, including your plan.');
    }
    if (this.teamBoost > 0) this.addViewers(180, 'FAN CLUB');
    this.donutCooldown = 9;
    if (this.teamwork >= 3) this.unlockAchievement('teamwork');
  },

  showDoorsFromExisting() {
    $('doors').innerHTML = this.doorChoices.map((route, index) => `
      <button class="door ${escapeHtml(route.kind)}" data-door="${index}">
        <span class="door-icon">${route.icon}</span><b>${escapeHtml(route.title)}</b>
        <small>${escapeHtml(route.description)}</small><em>${escapeHtml(route.reward)}</em>
      </button>`).join('');
    document.querySelectorAll('[data-door]').forEach(button => { button.onclick = () => this.chooseDoor(Number(button.dataset.door)); });
    $('scoutDoorBtn').disabled = true;
    $('scoutDoorBtn').textContent = 'ROUTE SCOUTED';
  },

  cycleDonut() {
    const modes = ['ZAP', 'CHARM', 'SCOUT'];
    this.donutMode = modes[(modes.indexOf(this.donutMode) + 1) % modes.length];
    this.say('DONUT', `${this.donutMode} selected. I continue to do everything.`);
    this.updateHud();
  },

  nearestHazard() {
    return this.hazards
      .filter(item => item.on && !item.friendly && item.x > this.player.x && item.type !== 'pit')
      .sort((a, b) => a.x - b.x)[0];
  },

  useItem(index) {
    if (!['RUNNING', 'BOSS'].includes(this.state)) return;
    const item = this.inventory[index];
    if (!item || item.charges <= 0) return;
    Audio.init();
    item.use(this);
    item.charges -= 1;
    if (item.charges <= 0) this.inventory.splice(index, 1);
    this.updateHud();
  },

  detonate() {
    let hits = 0;
    for (const hazard of this.hazards) {
      if (hazard.on && hazard.type !== 'pit' && hazard.x < W) {
        hazard.on = false;
        hits += 1;
        this.particlesAt(hazard.x, hazard.y, '#ef7655', 10);
      }
    }
    if (this.state === 'BOSS') this.hitBoss(1);
    this.addViewers(120 * hits, `BLAST ×${hits}`);
    this.shake = .8;
    this.flash = .18;
    Audio.tone(70, .3, 'sawtooth', .09);
  },

  reverseHazards() {
    for (const hazard of this.hazards) {
      if (hazard.type !== 'pit') hazard.friendly = true;
    }
    this.addViewers(250, 'REVERSE ENGINEERING');
    this.say('SYSTEM', 'Hazard direction inverted. Cause remains under investigation.');
  },

  damage(reason) {
    if (this.player.invincible > 0) return;
    if (this.allyShield > 0) {
      this.allyShield -= 1;
      this.player.invincible = 1;
      this.say('SYSTEM', 'Rescued crawler returned the favor. Cooperation remains off-brand.');
      return;
    }
    this.hp -= 1;
    this.roomStats.damage += 1;
    this.bossNoHit = false;
    this.combo = 0;
    this.player.invincible = 1.35;
    this.player.vy = -230;
    this.player.airborne = true;
    this.shake = .85;
    this.flash = .2;
    this.particlesAt(this.player.x + 8, this.player.y + 14, '#ff5a59', 18);
    Audio.hurt();
    this.say('ANNOUNCER', `Impact registered: ${reason}. Medical has used a disappointed emoji.`);
    if (this.hp <= 0) this.gameOver();
  },

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (this.hp > before) {
      Audio.tone(520, .12, 'sine', .04);
      this.say('SYSTEM', 'Health restored. Cause of previous health loss remains obvious.');
    }
    this.updateHud();
  },

  safeHeal() {
    if (this.healUsed || this.hp >= this.maxHp || this.viewers < 100) return;
    this.healUsed = true;
    this.viewers -= 100;
    this.heal(1);
    this.renderSafeRoom();
  },

  addViewers(amount, label) {
    const value = amount * (this.scoreMultiplier || 1);
    this.viewers += value;
    if (label && value >= 40 && this.state !== 'SAFE') this.floatText(this.player?.x + 12 || 80, this.player?.y || 200, `${label} +${Math.round(value)}`);
  },

  awardBox(tier) {
    this.boxes.push(tier);
    this.toast(`${tier.toUpperCase()} LOOT BOX ACQUIRED`);
    this.updateHud();
  },

  unlockAchievement(id) {
    if (this.runAchievements.has(id) || !ACHIEVEMENTS[id]) return;
    const achievement = ACHIEVEMENTS[id];
    this.runAchievements.add(id);
    Save.data.discovered[id] = true;
    Save.put();
    this.awardBox(achievement.tier);
    this.achievementQueue.push(achievement);
    if (!this.achievementShowing) this.showNextAchievement();
  },

  showNextAchievement() {
    const achievement = this.achievementQueue.shift();
    if (!achievement) { this.achievementShowing = false; return; }
    this.achievementShowing = true;
    $('achievementName').textContent = achievement.name;
    $('achievementReward').textContent = `${achievement.detail} · ${achievement.tier.toUpperCase()} BOX`;
    $('achievement').classList.add('on');
    Audio.achievement();
    window.setTimeout(() => {
      $('achievement').classList.remove('on');
      window.setTimeout(() => this.showNextAchievement(), 220);
    }, 1750);
  },

  say(speaker, text) {
    const caption = $('caption');
    caption.textContent = `${speaker}: ${String(text).replace(/^[A-Z]+:\s*[“\"]?|[”\"]$/g, '')}`;
    caption.style.borderColor = speaker === 'DONUT' ? '#c881d8' : speaker === 'SYSTEM' ? '#f5cf58' : '#79b7d6';
    caption.classList.add('on');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => caption.classList.remove('on'), Math.max(1800, text.length * 34));
  },

  toast(text) {
    $('toast').textContent = text;
    $('toast').classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => $('toast').classList.remove('on'), 1450);
  },

  floatText(x, y, text) {
    this.particles.push({ type: 'text', x, y, text, life: .8, on: true });
  },

  particlesAt(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 80;
      this.particles.push({ type: 'pixel', x, y, color, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .35, on: true });
    }
  },

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      if (particle.type === 'pixel') {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 180 * dt;
      } else particle.y -= 24 * dt;
    }
    this.particles = this.particles.filter(item => item.life > 0);
  },

  gameOver() {
    this.state = 'GAMEOVER';
    $('hud').classList.add('hidden');
    Save.data.best = Math.max(Save.data.best || 0, Math.floor(this.viewers));
    Save.data.runs = (Save.data.runs || 0) + 1;
    Save.data.scores.push({ score: Math.floor(this.viewers), floor: this.floor, rooms: this.roomsTotal, daily: this.daily, at: Date.now() });
    Save.data.scores.sort((a, b) => b.score - a.score);
    Save.data.scores = Save.data.scores.slice(0, 8);
    Save.put();
    $('overTitle').textContent = this.viewers >= Save.data.best ? 'NEW RATINGS RECORD' : 'EPISODE TERMINATED';
    $('finalViewers').textContent = Math.floor(this.viewers).toLocaleString();
    $('finalFloor').textContent = this.floor;
    $('finalRooms').textContent = this.roomsTotal;
    $('finalAchievements').textContent = this.runAchievements.size;
    $('deathLine').textContent = RNG.pick(DEATH_LINES);
    this.showOverlay('over');
  },

  pause() {
    if (!['RUNNING', 'BOSS'].includes(this.state)) return;
    this.resumeState = this.state;
    this.state = 'PAUSED';
    this.showOverlay('pause');
  },

  resume() {
    if (this.state !== 'PAUSED') return;
    this.state = this.resumeState || 'RUNNING';
    this.hideAllOverlays();
    this.lastFrame = performance.now();
  },

  quit() {
    this.showTitle();
  },

  showTitle() {
    this.state = 'TITLE';
    this.hideAllOverlays();
    $('hud').classList.add('hidden');
    $('title').classList.add('shown');
    $('best').textContent = Math.floor(Save.data.best || 0).toLocaleString();
    $('discovered').textContent = `${Object.keys(Save.data.discovered).length}/${Object.keys(ACHIEVEMENTS).length}`;
  },

  showArchive() {
    this.showOverlay('archive');
    $('archiveList').innerHTML = Object.entries(ACHIEVEMENTS).map(([id, entry]) => {
      const unlocked = !!Save.data.discovered[id];
      return `<div class="archive-entry ${unlocked ? 'unlocked' : ''}"><b>${unlocked ? '★ ' + escapeHtml(entry.name) : '□ UNDISCOVERED'}</b>${unlocked ? escapeHtml(entry.detail) : 'Keep making dangerous choices.'}</div>`;
    }).join('');
  },

  showOverlay(id) {
    this.hideAllOverlays();
    $(id).classList.add('shown');
  },

  hideAllOverlays() {
    document.querySelectorAll('.overlay').forEach(element => element.classList.remove('shown'));
  },

  updateHud() {
    if (!this.player) return;
    const floor = this.floorData();
    $('floorHud').textContent = `F${this.floor} · ${floor.name}`;
    $('hearts').textContent = '♥'.repeat(Math.max(0, this.hp)) + '♡'.repeat(Math.max(0, this.maxHp - this.hp));
    this.displayViewers += (this.viewers - this.displayViewers) * .18;
    $('viewers').textContent = Math.floor(this.displayViewers).toLocaleString();
    $('boxCount').textContent = `□ ${this.boxes.length}`;
    $('donutMode').textContent = this.donutMode;
    $('donutBtn').style.setProperty('--cooldown', `${100 * (1 - Math.min(1, this.donutCooldown / 9))}%`);
    $('donutBtn').disabled = this.donutCooldown > 0;
    $('itemRack').innerHTML = this.inventory.map((item, index) => `
      <button class="item-button" data-item="${index}" aria-label="Use ${escapeHtml(item.name)}">
        <b>${item.icon}</b><span>${escapeHtml(item.name.split(' ')[0])} ×${item.charges}</span>
      </button>`).join('');
    document.querySelectorAll('[data-item]').forEach(button => {
      button.onclick = event => { event.stopPropagation(); this.useItem(Number(button.dataset.item)); };
    });
  },

  draw() {
    const floor = this.floorData();
    const shakeX = this.shake > 0 ? (Math.random() - .5) * this.shake * 7 : 0;
    const shakeY = this.shake > 0 ? (Math.random() - .5) * this.shake * 5 : 0;
    ctx.save();
    ctx.translate(Math.round(shakeX), Math.round(shakeY));
    this.drawBackground(floor);
    for (const pickup of this.pickups) this.drawPickup(pickup);
    for (const hazard of this.hazards) this.drawHazard(hazard);
    if (this.state === 'BOSS' && this.boss) this.drawBoss(this.boss, floor);
    if (this.player && this.state !== 'TITLE') this.player.draw();
    this.drawParticles();
    if (this.greaseReady) {
      ctx.fillStyle = '#b6e36a'; ctx.fillRect(this.player.x - 4, GROUND - 3, 31, 3);
    }
    if (this.trapArmed) {
      ctx.strokeStyle = '#d8d0b4'; ctx.strokeRect(this.player.x + 29, GROUND - 8, 16, 7);
    }
    if (this.floorData().name === 'BLACKOUT BURROWS' && this.scoutTime <= 0 && this.state !== 'TITLE') this.drawDarkness();
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(.55, this.flash * 3);
      ctx.fillStyle = '#fff3cb'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  drawBackground(floor) {
    ctx.fillStyle = floor.sky; ctx.fillRect(0, 0, W, H);
    const scroll = this.time * (this.worldSpeed || 80);
    for (let i = 0; i < 7; i++) {
      const x = ((i * 47 - scroll * .08) % 330 + 330) % 330 - 45;
      ctx.fillStyle = floor.far; ctx.fillRect(x, 58, 25, GROUND - 58);
      ctx.fillRect(x - 8, 65, 42, 8);
      ctx.fillStyle = floor.near; ctx.fillRect(x + 5, 70, 4, GROUND - 78);
    }
    for (let x = -20; x < W + 30; x += 26) {
      const sx = ((x - scroll * .16) % (W + 52) + (W + 52)) % (W + 52) - 26;
      ctx.fillStyle = floor.near; ctx.fillRect(sx, 317, 5, 34);
      ctx.fillRect(sx - 5, 322, 15, 5);
    }
    ctx.fillStyle = floor.earth; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = floor.trim; ctx.fillRect(0, GROUND, W, 4);
    ctx.fillStyle = '#08090d';
    for (let x = 0; x < W; x += 16) ctx.fillRect(x + ((scroll * .3) % 16), GROUND + 13 + (x % 3) * 8, 8, 3);
    ctx.globalAlpha = .18;
    ctx.fillStyle = '#fff';
    for (let y = 82; y < 305; y += 22) for (let x = (y % 44); x < W; x += 46) ctx.fillRect(x, y, 2, 2);
    ctx.globalAlpha = 1;
  },

  drawHazard(hazard) {
    if (!hazard.on) return;
    const outline = this.scoutTime > 0;
    if (outline) { ctx.strokeStyle = '#fff174'; ctx.strokeRect(hazard.x - 1, hazard.y - 1, hazard.w + 2, hazard.h + 2); }
    if (hazard.type === 'pit') {
      ctx.fillStyle = '#020205'; ctx.fillRect(hazard.x, GROUND - 2, hazard.w, 18);
      ctx.fillStyle = '#e7dfce';
      for (let x = 2; x < hazard.w; x += 7) {
        ctx.beginPath(); ctx.moveTo(hazard.x + x, GROUND + 1); ctx.lineTo(hazard.x + x + 3, GROUND - 8); ctx.lineTo(hazard.x + x + 6, GROUND + 1); ctx.fill();
      }
      return;
    }
    ctx.save();
    if (hazard.friendly) { ctx.globalAlpha = .8; ctx.translate(0, Math.sin(hazard.age * 12) * 2); }
    if (hazard.type === 'log') {
      ctx.translate(hazard.x + 12, hazard.y + 6); ctx.rotate(hazard.age * 7);
      ctx.fillStyle = '#75401f'; ctx.fillRect(-12, -6, 24, 12); ctx.fillStyle = '#c17a3e'; ctx.fillRect(-9, -2, 18, 3);
    } else if (hazard.type === 'snake') {
      ctx.strokeStyle = '#d7cc58'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hazard.x, hazard.y + 6); ctx.quadraticCurveTo(hazard.x + 5, hazard.y - 2, hazard.x + 10, hazard.y + 5); ctx.quadraticCurveTo(hazard.x + 14, hazard.y + 10, hazard.x + 18, hazard.y + 2); ctx.stroke();
    } else if (hazard.type === 'branch') {
      ctx.fillStyle = '#60401e'; ctx.fillRect(hazard.x, hazard.y, hazard.w, 5); ctx.fillStyle = '#4f873f'; ctx.fillRect(hazard.x - 4, hazard.y + 5, hazard.w + 8, 12);
    } else if (hazard.type === 'flame') {
      ctx.fillStyle = hazard.telegraph > 0 ? '#70433a' : '#f2793f'; ctx.fillRect(hazard.x, hazard.telegraph > 0 ? GROUND - 8 : hazard.y, hazard.w, hazard.telegraph > 0 ? 8 : hazard.h);
      if (hazard.telegraph <= 0) { ctx.fillStyle = '#ffe267'; ctx.fillRect(hazard.x + 4, hazard.y + 8, 5, hazard.h - 10); }
    } else if (hazard.type === 'crusher') {
      ctx.fillStyle = '#85838e'; ctx.fillRect(hazard.x, hazard.y, hazard.w, hazard.h); ctx.fillStyle = '#c4b77d'; ctx.fillRect(hazard.x + 4, hazard.y + 5, hazard.w - 8, 4);
    } else if (hazard.type === 'bat') {
      ctx.fillStyle = '#8b70a2'; ctx.fillRect(hazard.x + 6, hazard.y + 4, 7, 7); const wing = Math.floor(hazard.age * 10) % 2; ctx.fillRect(hazard.x, hazard.y + wing * 4, 7, 4); ctx.fillRect(hazard.x + 12, hazard.y + wing * 4, 7, 4);
    } else if (hazard.type === 'cart') {
      ctx.fillStyle = '#58626a'; ctx.fillRect(hazard.x, hazard.y, hazard.w, 12); ctx.fillStyle = '#171a20'; ctx.fillRect(hazard.x + 4, hazard.y + 12, 7, 5); ctx.fillRect(hazard.x + 24, hazard.y + 12, 7, 5);
    } else if (hazard.type === 'barrier') {
      ctx.fillStyle = '#b39a56'; ctx.fillRect(hazard.x + 4, hazard.y, 6, hazard.h); ctx.fillStyle = '#e5d07b'; ctx.fillRect(hazard.x, hazard.y + 5, hazard.w, 5);
    } else if (hazard.type === 'hunter') {
      ctx.fillStyle = '#bc4e7c'; ctx.fillRect(hazard.x + 3, hazard.y, 9, 9); ctx.fillStyle = '#55314f'; ctx.fillRect(hazard.x, hazard.y + 9, 15, 18); ctx.fillStyle = '#fff'; ctx.fillRect(hazard.x + 9, hazard.y + 3, 2, 2);
    } else if (hazard.type === 'vine') {
      ctx.fillStyle = '#6d9d47'; ctx.fillRect(hazard.x + 5, hazard.y - 36, 3, 38); ctx.fillStyle = '#bc9a42'; ctx.fillRect(hazard.x, hazard.y, 13, 10);
    }
    if (hazard.friendly) { ctx.fillStyle = '#9be56d'; ctx.fillRect(hazard.x + hazard.w / 2 - 1, hazard.y - 6, 3, 3); }
    ctx.restore();
  },

  drawPickup(pickup) {
    if (!pickup.on) return;
    if (pickup.type === 'coin') {
      const width = 3 + Math.abs(Math.sin(pickup.spin)) * 3;
      ctx.fillStyle = '#f4d35b'; ctx.fillRect(pickup.x + (6 - width) / 2, pickup.y, width, 8);
      ctx.fillStyle = '#fff0a3'; ctx.fillRect(pickup.x + 2, pickup.y + 2, 2, 4);
    } else {
      ctx.fillStyle = '#7fa5ad'; ctx.fillRect(pickup.x + 3, pickup.y, 7, 7);
      ctx.fillStyle = '#596b78'; ctx.fillRect(pickup.x, pickup.y + 7, 12, 11);
      ctx.fillStyle = '#fff'; ctx.fillRect(pickup.x + 8, pickup.y + 2, 2, 2);
      ctx.fillStyle = '#83e29b'; ctx.fillRect(pickup.x + 3, pickup.y - 7, 6, 4);
    }
  },

  drawBoss(boss, floor) {
    if (boss.defeated) return;
    ctx.fillStyle = '#090b0f'; ctx.fillRect(52, 70, 136, 12);
    ctx.fillStyle = boss.vulnerable > 0 ? '#ffe36d' : '#b94c4c'; ctx.fillRect(55, 73, 130 * Math.max(0, boss.hp / boss.maxHp), 6);
    ctx.fillStyle = '#fff0a8'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.fillText(boss.name, 120, 68); ctx.textAlign = 'left';
    ctx.fillStyle = floor.bossColor; ctx.fillRect(boss.x + 6, boss.y + 5, boss.w - 12, boss.h - 8);
    ctx.fillStyle = '#21242b'; ctx.fillRect(boss.x, boss.y + 29, boss.w, 14);
    ctx.fillStyle = '#0b0d11'; ctx.fillRect(boss.x + 3, boss.y + 39, 9, 6); ctx.fillRect(boss.x + 27, boss.y + 39, 9, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(boss.x + 11, boss.y + 11, 4, 4); ctx.fillRect(boss.x + 24, boss.y + 11, 4, 4);
    if (boss.vulnerable > 0) { ctx.fillStyle = '#ffe36d'; ctx.fillRect(boss.x + 17, boss.y - 6, 6, 4); }
  },

  drawParticles() {
    ctx.font = 'bold 6px monospace';
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 2);
      if (particle.type === 'pixel') { ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, 2, 2); }
      else { ctx.fillStyle = '#fff0a8'; ctx.textAlign = 'center'; ctx.fillText(particle.text, particle.x, particle.y); }
    }
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  },

  drawDarkness() {
    const center = this.player.x + 10;
    ctx.globalAlpha = .78;
    ctx.fillStyle = '#030407';
    ctx.fillRect(0, 0, Math.max(0, center - 58), H);
    ctx.fillRect(center + 70, 0, W - center - 70, H);
    for (let y = 0; y < H; y += 8) {
      const spread = 55 + Math.floor((y % 24) / 8) * 5;
      ctx.fillRect(center - spread, y, 4, 4);
      ctx.fillRect(center + spread, y + 4, 4, 4);
    }
    ctx.globalAlpha = 1;
  },

  frame(timestamp) {
    const dt = Math.min(.05, (timestamp - this.lastFrame) / 1000 || 0);
    this.lastFrame = timestamp;
    this.accumulator += dt;
    while (this.accumulator >= 1 / 60) {
      this.update(1 / 60);
      this.accumulator -= 1 / 60;
    }
    this.draw();
    requestAnimationFrame(time => this.frame(time));
  },
};

Game.player = new Player(Game);

const Input = {
  x: 0, y: 0, at: 0,
  init() {
    canvas.addEventListener('pointerdown', event => {
      if (!['RUNNING', 'BOSS'].includes(Game.state)) return;
      Audio.init();
      this.x = event.clientX;
      this.y = event.clientY;
      this.at = performance.now();
      Game.player.jump();
    });
    canvas.addEventListener('pointerup', event => {
      if (!['RUNNING', 'BOSS'].includes(Game.state)) return;
      const dx = event.clientX - this.x;
      const dy = event.clientY - this.y;
      if (dy > 28 && Math.abs(dy) > Math.abs(dx)) Game.player.dive();
      else if (dy < -28 && Math.abs(dy) > Math.abs(dx)) Game.player.dash();
    });
    addEventListener('keydown', event => {
      if (event.code === 'Space') { event.preventDefault(); Audio.init(); Game.player.jump(); }
      if (event.code === 'ArrowDown') { event.preventDefault(); Game.player.dive(); }
      if (event.code === 'ArrowUp') { event.preventDefault(); Game.player.dash(); }
      if (event.code === 'ArrowLeft' && Game.state === 'CHOICE') Game.chooseDoor(0);
      if (event.code === 'ArrowRight' && Game.state === 'CHOICE') Game.chooseDoor(1);
      if (event.key.toLowerCase() === 'd') Game.useDonut();
      if (/^[1-3]$/.test(event.key)) Game.useItem(Number(event.key) - 1);
      if (event.code === 'Escape') {
        if (Game.state === 'PAUSED') Game.resume();
        else Game.pause();
      }
    });
  },
};
Input.init();

let donutPressAt = 0;
$('donutBtn').addEventListener('pointerdown', event => { event.stopPropagation(); donutPressAt = performance.now(); });
$('donutBtn').addEventListener('pointerup', event => {
  event.stopPropagation();
  if (performance.now() - donutPressAt > 430) Game.cycleDonut();
  else Game.useDonut();
});
$('runBtn').onclick = () => Game.start(false);
$('dailyBtn').onclick = () => Game.start(true);
$('howBtn').onclick = () => Game.showOverlay('how');
$('archiveBtn').onclick = () => Game.showArchive();
$('pauseBtn').onclick = event => { event.stopPropagation(); Game.pause(); };
$('resumeBtn').onclick = () => Game.resume();
$('restartBtn').onclick = () => Game.start(Game.daily);
$('quitBtn').onclick = () => Game.quit();
$('retryBtn').onclick = () => Game.start(false);
$('overTitleBtn').onclick = () => Game.showTitle();
$('healBtn').onclick = () => Game.safeHeal();
$('leaveSafeBtn').onclick = () => Game.leaveSafeRoom();
$('declineSponsor').onclick = () => Game.declineSponsor();
$('descendBtn').onclick = () => Game.chooseStairs(false);
$('greedBtn').onclick = () => Game.chooseStairs(true);
$('scoutDoorBtn').onclick = () => {
  if (Game.donutMode === 'SCOUT') Game.useDonut();
  else {
    Game.donutMode = 'SCOUT';
    Game.say('DONUT', 'Fine. I will inspect the doors because nobody else is qualified.');
    Game.updateHud();
    $('scoutDoorBtn').textContent = 'ASK DONUT TO SCOUT';
  }
};
document.querySelectorAll('[data-close]').forEach(button => {
  button.onclick = () => {
    const id = button.dataset.close;
    $(id).classList.remove('shown');
    if (Game.state === 'TITLE') $('title').classList.add('shown');
  };
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) Game.pause();
});

Game.showTitle();
requestAnimationFrame(timestamp => Game.frame(timestamp));
