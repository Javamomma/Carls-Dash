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
  { id: 'supply', title: 'SUPPLY TUNNEL', icon: '▤', kind: 'safe', threat: .82, reward: 'Hazards move 18% slower', description: 'Boring, survivable, suspiciously clean.' },
  { id: 'mob', title: 'MOB DEN', icon: '♞', kind: 'danger', threat: 1.25, reward: 'No damage: guaranteed Silver Box', description: 'The occupants have formed a welcoming committee.' },
  { id: 'stunt', title: 'STUNT CHUTE', icon: '↯', kind: 'danger', threat: 1.38, reward: 'All viewer gains ×2', description: 'Built by producers who dislike guardrails.' },
  { id: 'vault', title: 'SPONSOR VAULT', icon: '$', kind: 'danger', threat: 1.18, reward: 'Coins ×2.2 · guaranteed loot box', description: 'Free merchandise is never free.' },
  { id: 'rescue', title: 'RESCUE SIGNAL', icon: '!', kind: 'rescue', threat: 1.32, reward: 'Rescue grants one damage shield', description: 'Someone is alive behind that door.' },
  { id: 'mystery', title: 'UNMARKED DOOR', icon: '?', kind: 'mystery', threat: 1.05, reward: 'Unknown until opened', description: 'Donut says mystery is another word for poor planning.' },
];

const VIEWER_TIERS = [
  { name: 'LOCAL FEED', at: 0 },
  { name: 'TRENDING', at: 1500, reward: 'bronze' },
  { name: 'GALACTIC', at: 4000, reward: 'silver' },
  { name: 'PRIME TIME', at: 8000, reward: 'gold' },
  { name: 'DUNGEON LEGEND', at: 15000, reward: 'gold' },
];

const SPONSOR_OFFERS = [
  {
    id: 'double', title: 'DOUBLE OR TROUBLE',
    now: 'No immediate payout.', next: 'NEXT 2 ROOMS: +100% viewers · hazards +20% speed.',
    apply(game) { game.sponsorModifier = { id: this.id, label: '2× VIEWERS · +20% SPEED', roomsLeft: 2, double: true, threat: 1.2 }; },
  },
  {
    id: 'medical', title: 'MEDICAL MIRACLE',
    now: 'NOW: restore 2 hearts.', next: 'NEXT ROOM: coin value −50%.',
    apply(game) { game.heal(2); game.sponsorModifier = { id: this.id, label: 'COINS −50%', roomsLeft: 1, coinScale: .5 }; },
  },
  {
    id: 'crate', title: 'LOOT CONTRACT',
    now: 'NOW: receive a Gold Box.', next: 'NEXT ROOM: one extra hazard wave.',
    apply(game) { game.awardBox('gold'); game.sponsorModifier = { id: this.id, label: 'EXTRA HAZARD WAVE', roomsLeft: 1, extraWave: true }; },
  },
  {
    id: 'donut', title: 'ROYAL ENDORSEMENT',
    now: 'NOW: Donut is ready.', next: 'NEXT 2 ROOMS: Donut recharges 50% faster.',
    apply(game) { game.donutCooldown = 0; game.sponsorModifier = { id: this.id, label: 'DONUT RECHARGE +50%', roomsLeft: 2, donutRate: 1.5 }; },
  },
];

const ROOM_BLUEPRINTS = [
  {
    id: 'canopy-swing', floor: 1, affinity: ['stunt', 'mystery'], name: 'CANOPY SWING', duration: 12.4,
    challenge: { kind: 'swing', target: 2, label: 'Catch 2 swing vines' },
    events: [[.8, 'coins', 'low', 5], [1.7, 'vine'], [2.7, 'pit'], [3.7, 'coins', 'high', 7], [5.1, 'branch'], [6, 'vine'], [7, 'pit'], [8.2, 'goblin'], [9.3, 'coins', 'arc', 7], [10.1, 'log']],
  },
  {
    id: 'goblin-market', floor: 1, affinity: ['mob', 'rescue'], name: 'GOBLIN MARKET CRASH', duration: 12.2,
    challenge: { kind: 'stomp', target: 3, label: 'Stomp 3 dungeon mobs' },
    events: [[.9, 'goblin'], [1.8, 'coins', 'arc', 5], [3, 'snake'], [4, 'goblin'], [5.4, 'bounce'], [6.3, 'goblin'], [7.4, 'pit'], [8.4, 'goblin'], [9.4, 'coins', 'high', 6], [10.1, 'branch']],
  },
  {
    id: 'ruin-rails', floor: 1, affinity: ['supply', 'vault'], name: 'RUIN RAIL RELAY', duration: 12.5,
    challenge: { kind: 'grind', target: 3, label: 'Grind 3 rail sections' },
    events: [[.8, 'rail'], [1.2, 'coins', 'high', 8], [3, 'pit'], [4, 'rail'], [4.4, 'coins', 'high', 7], [6.4, 'branch'], [7.2, 'rail'], [8.1, 'coins', 'high', 6], [9.4, 'log'], [10.2, 'pit']],
  },
  {
    id: 'foundry-pulse', floor: 2, affinity: ['supply', 'stunt', 'rescue'], name: 'FOUNDRY PULSE', duration: 12.5,
    challenge: { kind: 'near', target: 3, label: 'Thread 3 danger-close gaps' },
    events: [[.8, 'flame'], [1.8, 'coins', 'arc', 6], [2.9, 'crusher'], [4.1, 'flame'], [5, 'bounce'], [5.9, 'crusher'], [7, 'coins', 'high', 7], [8.2, 'flame'], [9.2, 'pit'], [10.1, 'crusher']],
  },
  {
    id: 'slag-cart', floor: 2, affinity: ['mob', 'vault', 'mystery'], name: 'SLAG CART SMASH', duration: 12.6,
    challenge: { kind: 'smash', target: 3, label: 'Smash 3 obstacles in the cart' },
    events: [[.7, 'vehicle'], [1.5, 'barrier'], [2.4, 'goblin'], [3.4, 'coins', 'low', 6], [4.5, 'barrier'], [5.5, 'pit'], [6.7, 'goblin'], [7.8, 'barrier'], [8.8, 'coins', 'arc', 7], [10, 'crusher']],
  },
  {
    id: 'coolant-conduit', floor: 2, affinity: ['supply', 'rescue', 'mystery'], name: 'COOLANT CONDUIT', duration: 12.7,
    challenge: { kind: 'grind', target: 2, label: 'Grind 2 pipe rails' },
    events: [[.7, 'rail'], [1.2, 'coins', 'high', 7], [2.9, 'flame'], [4.1, 'bounce'], [5, 'crusher'], [6.1, 'rail'], [6.7, 'coins', 'high', 8], [8.5, 'flame'], [9.5, 'pit'], [10.4, 'log']],
  },
  {
    id: 'blackout-motes', floor: 3, affinity: ['supply', 'rescue', 'mystery'], name: 'BLACKOUT MOTE RUN', duration: 12.8,
    challenge: { kind: 'mote', target: 6, label: 'Collect 6 signal motes' },
    events: [[.7, 'motes', 3], [1.7, 'bat'], [2.6, 'motes', 3], [3.7, 'pit'], [4.8, 'bat'], [5.7, 'motes', 3], [6.8, 'crusher'], [7.9, 'motes', 3], [9, 'snake'], [10, 'bat']],
  },
  {
    id: 'burrow-bounce', floor: 3, affinity: ['mob', 'stunt', 'vault'], name: 'BURROW BOUNCE CHAIN', duration: 12.5,
    challenge: { kind: 'bounce', target: 3, label: 'Chain 3 spore bounces' },
    events: [[.7, 'bounce'], [1.4, 'coins', 'high', 6], [2.7, 'pit'], [3.6, 'bounce'], [4.5, 'bat'], [5.5, 'coins', 'arc', 7], [6.7, 'bounce'], [7.5, 'crusher'], [8.8, 'pit'], [9.8, 'bat']],
  },
  {
    id: 'echo-vines', floor: 3, affinity: ['stunt', 'rescue'], name: 'ECHO VINE VAULT', duration: 12.8,
    challenge: { kind: 'swing', target: 2, label: 'Catch 2 echo vines' },
    events: [[.7, 'motes', 2], [1.5, 'vine'], [2.5, 'pit'], [3.7, 'bat'], [4.8, 'motes', 3], [5.8, 'vine'], [6.8, 'pit'], [7.8, 'crusher'], [8.9, 'motes', 3], [10, 'bat']],
  },
  {
    id: 'switchback', floor: 4, affinity: ['supply', 'stunt'], name: 'IRON SWITCHBACK', duration: 12.7,
    challenge: { kind: 'grind', target: 3, label: 'Ride 3 moving rails' },
    events: [[.7, 'rail'], [1.2, 'coins', 'high', 7], [2.9, 'cart'], [4, 'rail'], [4.5, 'coins', 'high', 7], [6.2, 'barrier'], [7.2, 'rail'], [8.1, 'bat'], [9.1, 'pit'], [10.2, 'cart']],
  },
  {
    id: 'express-lane', floor: 4, affinity: ['mob', 'vault', 'rescue', 'mystery'], name: 'EXPRESS LANE HIJACK', duration: 12.6,
    challenge: { kind: 'smash', target: 4, label: 'Cart-smash 4 transit hazards' },
    events: [[.5, 'vehicle'], [1.5, 'barrier'], [2.3, 'cart'], [3.3, 'barrier'], [4.1, 'coins', 'low', 6], [5.2, 'pit'], [6.2, 'cart'], [7.1, 'barrier'], [8.3, 'bat'], [9.4, 'cart']],
  },
  {
    id: 'signal-jump', floor: 4, affinity: ['stunt', 'supply', 'rescue'], name: 'SIGNAL JUMP ARRAY', duration: 12.8,
    challenge: { kind: 'bounce', target: 3, label: 'Bounce 3 signal pads' },
    events: [[.7, 'bounce'], [1.4, 'coins', 'high', 6], [2.7, 'cart'], [3.8, 'bounce'], [4.7, 'barrier'], [5.8, 'rail'], [6.4, 'coins', 'high', 7], [7.9, 'bounce'], [8.8, 'pit'], [10, 'bat']],
  },
  {
    id: 'hunter-canopy', floor: 5, affinity: ['stunt', 'rescue'], name: 'HUNTER CANOPY', duration: 12.8,
    challenge: { kind: 'swing', target: 3, label: 'Swing past 3 hunter traps' },
    events: [[.7, 'vine'], [1.7, 'pit'], [2.7, 'hunter'], [3.8, 'vine'], [4.6, 'coins', 'high', 7], [5.8, 'branch'], [6.8, 'vine'], [7.8, 'pit'], [8.8, 'hunter'], [10, 'coins', 'arc', 7]],
  },
  {
    id: 'paparazzi-pack', floor: 5, affinity: ['mob', 'supply', 'vault', 'mystery'], name: 'PAPARAZZI PACK', duration: 12.6,
    challenge: { kind: 'stomp', target: 4, label: 'Drop 4 camera hunters' },
    events: [[.7, 'hunter'], [1.6, 'coins', 'arc', 5], [2.7, 'goblin'], [3.7, 'hunter'], [4.8, 'bounce'], [5.7, 'hunter'], [6.8, 'pit'], [7.8, 'goblin'], [8.8, 'hunter'], [10, 'vineTrap']],
  },
  {
    id: 'royal-gauntlet', floor: 5, affinity: ['supply', 'vault', 'mystery'], name: 'ROYAL GAUNTLET', duration: 12.9,
    challenge: { kind: 'near', target: 4, label: 'Survive 4 filmed near misses' },
    events: [[.7, 'rail'], [1.3, 'coins', 'high', 7], [2.8, 'hunter'], [3.8, 'vine'], [4.8, 'pit'], [5.9, 'branch'], [7, 'bounce'], [7.8, 'hunter'], [9, 'goblin'], [10.2, 'coins', 'arc', 7]],
  },
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
    this.swingFeature = null;
    this.swingTime = 0;
    this.grindFeature = null;
    this.grindScored = false;
    this.vehicleTime = 0;
  }
  jump() {
    if (this.swingFeature) {
      this.swingFeature = null;
      this.swingTime = 0;
      this.vy = -390;
      this.airborne = true;
      this.jumps = 1;
      this.game.addViewers(90, 'VINE LAUNCH');
      Audio.jump();
      return;
    }
    if (this.grindFeature) {
      this.grindFeature = null;
      this.grindScored = false;
      this.vy = -360;
      this.airborne = true;
      this.jumps = 1;
      this.game.addViewers(65, 'RAIL POP');
      Audio.jump();
      return;
    }
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
    if (this.swingFeature || this.grindFeature) {
      this.swingFeature = null;
      this.grindFeature = null;
      this.grindScored = false;
      this.airborne = true;
    }
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
    this.swingFeature = null;
    this.grindFeature = null;
    this.grindScored = false;
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
    this.vehicleTime = Math.max(0, this.vehicleTime - dt);
    if (this.swingFeature?.on) {
      this.swingTime += dt;
      const phase = Math.min(1, this.swingTime / 1.05);
      this.y = GROUND - 83 - Math.sin(phase * Math.PI) * 34;
      this.vy = 0;
      this.airborne = true;
      if (phase >= 1) this.jump();
      return;
    }
    if (this.grindFeature?.on && this.x + this.w > this.grindFeature.x && this.x < this.grindFeature.x + this.grindFeature.w) {
      this.y = this.grindFeature.y - this.h + 3;
      this.vy = 0;
      this.airborne = true;
      if (!this.grindScored) {
        this.grindScored = true;
        this.game.progressChallenge('grind');
        this.game.addViewers(100, 'RAIL GRIND');
      }
      return;
    }
    if (this.grindFeature) {
      this.grindFeature = null;
      this.grindScored = false;
      this.vy = -245;
    }
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
    if (this.vehicleTime > 0) {
      this.drawHero(x + 1, y - 2, false);
      ctx.fillStyle = '#303943'; ctx.fillRect(x - 8, GROUND - 17, 37, 12);
      ctx.fillStyle = '#91a4ad'; ctx.fillRect(x - 5, GROUND - 15, 31, 3);
      ctx.fillStyle = '#0b0d12'; ctx.fillRect(x - 3, GROUND - 6, 8, 7); ctx.fillRect(x + 18, GROUND - 6, 8, 7);
      return;
    }
    if (sliding) {
      y = GROUND - 17;
      ctx.fillStyle = '#c88762'; ctx.fillRect(x + 2, y + 3, 10, 8);
      ctx.fillStyle = '#211a1b'; ctx.fillRect(x + 1, y + 1, 11, 4);
      ctx.fillStyle = '#7d3139'; ctx.fillRect(x + 9, y + 9, 16, 7);
      ctx.fillStyle = '#e3a77d'; ctx.fillRect(x + 23, y + 12, 7, 3);
      this.drawDonut(x + 4, y - 7);
      return;
    }
    const squash = Math.round(this.landSquash * 8);
    y += squash;
    const step = Math.floor(this.runFrame) % 2;
    ctx.fillStyle = '#20191a'; ctx.fillRect(x + 4, y, 12, 5); ctx.fillRect(x + 3, y + 3, 4, 6);
    ctx.fillStyle = '#c88762'; ctx.fillRect(x + 6, y + 4, 10, 8); ctx.fillRect(x + 13, y + 9, 5, 3);
    ctx.fillStyle = '#3a2320'; ctx.fillRect(x + 13, y + 6, 4, 2); ctx.fillRect(x + 15, y + 10, 3, 2);
    ctx.fillStyle = '#5d272b'; ctx.fillRect(x + 4, y + 12, 13, 11);
    ctx.fillStyle = '#bc8c4c'; ctx.fillRect(x + 5, y + 14, 3, 10); ctx.fillRect(x + 8, y + 18, 8, 3);
    ctx.fillStyle = '#c88762'; ctx.fillRect(x + (step ? 1 : 15), y + 13, 4, 10);
    ctx.fillStyle = '#ddd2b6'; ctx.fillRect(x + (step ? 0 : 14), y + 21, 6, 3);
    ctx.fillStyle = '#b62f47'; ctx.fillRect(x + 3, y + 23, 15, 5);
    ctx.fillStyle = '#f0c36a'; ctx.fillRect(x + 6, y + 24, 2, 2); ctx.fillRect(x + 12, y + 24, 2, 2);
    ctx.fillStyle = '#c88762';
    ctx.fillRect(x + (step ? 3 : 6), y + 28, 4, 3);
    ctx.fillRect(x + (step ? 13 : 10), y + 28, 4, 3);
    ctx.fillStyle = '#dfaa80';
    ctx.fillRect(x + (step ? 0 : 4), y + 30, 8, 2);
    ctx.fillRect(x + (step ? 11 : 8), y + 30, 8, 2);
    this.drawDonut(x - 5, y + 7);
  }
  drawDonut(x, y) {
    ctx.fillStyle = '#f3eee4'; ctx.fillRect(x, y, 10, 8);
    ctx.fillRect(x, y - 3, 3, 4); ctx.fillRect(x + 7, y - 3, 3, 4);
    ctx.fillStyle = '#d7ae35'; ctx.fillRect(x + 2, y - 5, 6, 2); ctx.fillRect(x + 3, y - 7, 2, 2); ctx.fillRect(x + 6, y - 7, 2, 2);
    ctx.fillStyle = '#32243c'; ctx.fillRect(x + 2, y + 3, 2, 2); ctx.fillRect(x + 7, y + 3, 2, 2); ctx.fillRect(x + 5, y + 6, 2, 1);
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
  features: [],
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
      hazards: [], features: [], pickups: [], particles: [], inventory: [], boxes: [],
      runAchievements: new Set(), achievementQueue: [], viewerMilestones: new Set(), classId: null,
      donutMode: 'ZAP', donutCooldown: 0, nearMisses: 0, combo: 0, comboTimer: 0,
      teamwork: 0, teamBoost: 0, allyShield: 0, magnetTime: 0, scoutTime: 0,
      slowTime: 0, greaseReady: false, trapArmed: false, greaseKills: 0,
      sponsorModifier: null, sponsorOfferedFloor: 0, challengesCompleted: 0,
      blueprintHistory: [],
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
    this.currentRoute = { ...route, mechanicId: route.id };
    if (route.id === 'mystery') {
      const reveal = RNG.pick(ROUTES.filter(item => item.id !== 'mystery'));
      this.currentRoute = { ...reveal, id: 'mystery', mechanicId: reveal.id, title: 'UNMARKED: ' + reveal.title };
      this.unlockAchievement('mystery');
    }
    this.roomTime = 0;
    this.roomEnded = false;
    this.hazards = [];
    this.features = [];
    this.pickups = [];
    this.player.x = 48;
    this.player.bonusJumps = 0;
    this.player.swingFeature = null;
    this.player.grindFeature = null;
    this.player.vehicleTime = 0;
    this.rescueSpawned = false;
    this.roomStats = { damage: 0, kills: 0, near: 0, slides: 0, stomps: 0, rescue: false, coins: 0, motes: 0, smashes: 0, bounces: 0, swings: 0, grinds: 0 };
    const floorNumber = (this.floor - 1) % FLOORS.length + 1;
    const floorRooms = ROOM_BLUEPRINTS.filter(entry => entry.floor === floorNumber);
    const preferred = floorRooms.filter(entry => entry.affinity.includes(this.currentRoute.mechanicId));
    const pool = preferred.length ? preferred : floorRooms;
    const fresh = pool.filter(entry => !this.blueprintHistory.slice(-2).includes(entry.id));
    this.blueprint = RNG.pick(fresh.length ? fresh : pool);
    this.blueprintHistory.push(this.blueprint.id);
    this.roomDuration = this.blueprint.duration;
    this.roomEvents = this.blueprint.events.map(event => ({ event, fired: false }));
    this.challenge = { ...this.blueprint.challenge, progress: 0, complete: false };
    if (this.sponsorModifier?.extraWave) {
      const extra = RNG.pick(this.floorData().hazards.filter(type => type !== 'pit'));
      this.roomEvents.push({ event: [7.5, extra], fired: false });
    }
    const floor = this.floorData();
    this.scoreMultiplier = this.currentRoute.mechanicId === 'stunt' ? 2 : 1;
    if (this.sponsorModifier?.double) this.scoreMultiplier *= 2;
    if (floor.name === 'HUNTING GARDENS' && this.currentRoute.kind === 'danger') this.scoreMultiplier *= 2;
    this.noCoins = false;
    this.coinScale = this.sponsorModifier?.coinScale || 1;
    $('roomGoal').textContent = `${this.blueprint.name} · ${this.challenge.label.toUpperCase()}`;
    this.say('SYSTEM', `Room ${this.roomsOnFloor + 1}/${ROOMS_PER_FLOOR}: ${this.blueprint.name}. Bonus: ${this.challenge.label}.`);
    if (this.sponsorModifier) this.toast(`CONTRACT ${this.sponsorModifier.roomsLeft} ROOM${this.sponsorModifier.roomsLeft === 1 ? '' : 'S'} · ${this.sponsorModifier.label}`);
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
    this.donutCooldown = Math.max(0, this.donutCooldown - dt * (this.sponsorModifier?.donutRate || 1));
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
    this.updateFeatures(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.addViewers(dt * (7 + this.floor * 1.4));
    if (this.viewers >= 5000) this.unlockAchievement('viewers');
    this.updateHud();
  },

  updateRoom(dt) {
    this.roomTime += dt;
    for (const scheduled of this.roomEvents) {
      if (!scheduled.fired && this.roomTime >= scheduled.event[0]) {
        scheduled.fired = true;
        this.spawnRoomEvent(scheduled.event);
      }
    }
    if (this.currentRoute.mechanicId === 'rescue' && !this.rescueSpawned && this.roomTime > 6.5) {
      this.rescueSpawned = true;
      this.pickups.push({ type: 'crawler', x: W + 10, y: GROUND - 18, w: 12, h: 18, on: true });
      this.say('DONUT', 'There! Someone is still moving. Inconveniently heroic time, Carl.');
    }
    if (this.roomTime >= this.roomDuration && !this.roomEnded && !this.hazards.some(item => item.on && item.x > -40)) {
      this.completeRoom();
    }
  },

  spawnRoomEvent([, type, option, count]) {
    if (type === 'coins') {
      this.spawnCoins(option, count);
      return;
    }
    if (type === 'motes') {
      for (let i = 0; i < option; i++) this.pickups.push({ type: 'mote', x: W + 10 + i * 18, y: GROUND - 56 - (i % 2) * 23, w: 7, h: 7, on: true, spin: i });
      return;
    }
    if (type === 'vine') {
      this.features.push({ type: 'swingVine', x: W + 12, y: 88, w: 14, h: 190, on: true, used: false, sway: RNG.next() * 5 });
      return;
    }
    if (type === 'rail') {
      this.features.push({ type: 'grindRail', x: W + 8, y: GROUND - 60, w: 118, h: 5, on: true });
      return;
    }
    if (type === 'bounce') {
      this.features.push({ type: 'bouncePad', x: W + 8, y: GROUND - 7, w: 25, h: 7, on: true, used: false });
      return;
    }
    if (type === 'vehicle') {
      this.pickups.push({ type: 'vehicle', x: W + 10, y: GROUND - 19, w: 30, h: 19, on: true, spin: 0 });
      return;
    }
    if (type === 'vineTrap') type = 'vine';
    this.spawnHazard(type, W + 8);
  },

  spawnCoins(path = 'low', count = 5) {
    if (this.noCoins) return;
    for (let i = 0; i < count; i++) {
      let y = GROUND - 20;
      if (path === 'high') y = GROUND - 82 - Math.sin(i / Math.max(1, count - 1) * Math.PI) * 18;
      if (path === 'arc') y = GROUND - 34 - Math.sin(i / Math.max(1, count - 1) * Math.PI) * 50;
      this.pickups.push({ type: 'coin', x: W + 10 + i * 13, y, w: 6, h: 8, on: true, spin: RNG.next() * 6 });
    }
  },

  updateFeatures(dt) {
    const player = this.player;
    for (const feature of this.features) {
      if (!feature.on) continue;
      feature.x -= this.worldSpeed * dt;
      if (feature.type === 'swingVine' && !feature.used && player.airborne && player.vy < 260 && Math.abs(feature.x + 7 - (player.x + player.w / 2)) < 17 && player.y < GROUND - 34) {
        feature.used = true;
        player.swingFeature = feature;
        player.swingTime = 0;
        this.roomStats.swings += 1;
        this.progressChallenge('swing');
        this.addViewers(120, 'VINE CATCH');
        Audio.tone(440, .09, 'triangle', .04);
      }
      if (feature.type === 'grindRail' && !player.grindFeature && player.vy >= 0 && player.x + player.w > feature.x && player.x < feature.x + feature.w && player.y + player.h >= feature.y - 5 && player.y + player.h <= feature.y + 13) {
        player.grindFeature = feature;
        player.grindScored = false;
      }
      if (feature.type === 'bouncePad' && !feature.used && player.x + player.w > feature.x && player.x < feature.x + feature.w && player.y + player.h > feature.y - 7 && player.vy >= 0) {
        feature.used = true;
        player.vy = -510;
        player.airborne = true;
        player.jumps = 0;
        this.roomStats.bounces += 1;
        this.progressChallenge('bounce');
        this.addViewers(85, 'SPORE BOUNCE');
        this.particlesAt(feature.x + 12, feature.y, '#9be56d', 11);
      }
      if (feature.x + feature.w < -30) feature.on = false;
    }
    this.features = this.features.filter(feature => feature.on);
  },

  progressChallenge(kind, amount = 1) {
    if (!this.challenge || this.challenge.complete || this.challenge.kind !== kind) return;
    this.challenge.progress = Math.min(this.challenge.target, this.challenge.progress + amount);
    if (this.challenge.progress >= this.challenge.target) {
      this.challenge.complete = true;
      this.challengesCompleted += 1;
      this.addViewers(400 + this.floor * 75, 'ROOM OBJECTIVE');
      if (this.challengesCompleted % 3 === 0) this.awardBox('silver');
      this.toast(`OBJECTIVE COMPLETE · +${400 + this.floor * 75} VIEWERS${this.challengesCompleted % 3 === 0 ? ' · SILVER BOX' : ''}`);
      Audio.achievement();
    }
  },

  spawnHazard(type, x) {
    const base = { type, x, on: true, passed: false, friendly: false, age: 0, vx: 0 };
    const shapes = {
      log: { y: GROUND - 13, w: 25, h: 13 }, snake: { y: GROUND - 8, w: 18, h: 8 },
      pit: { y: GROUND - 3, w: 31, h: 7 }, branch: { y: GROUND - 30, w: 28, h: 14 },
      flame: { y: GROUND - 34, w: 13, h: 34, telegraph: .65 }, crusher: { y: GROUND - 50, w: 25, h: 34 },
      bat: { y: GROUND - 31, w: 18, h: 12 }, cart: { y: GROUND - 17, w: 34, h: 17 },
      barrier: { y: GROUND - 25, w: 14, h: 25 }, hunter: { y: GROUND - 27, w: 15, h: 27 },
      vine: { y: GROUND - 12, w: 13, h: 12 }, goblin: { y: GROUND - 19, w: 17, h: 19 },
      hunterShot: { y: GROUND - 40, w: 20, h: 5 },
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
        const stompable = ['log', 'snake', 'cart', 'hunter', 'vine', 'goblin'].includes(hazard.type);
        if (this.player.vehicleTime > 0 && hazard.type !== 'crusher' && hazard.type !== 'flame') {
          this.destroyHazard(hazard, 'CART SMASH');
          this.roomStats.smashes += 1;
          this.progressChallenge('smash');
        } else if (stompable && this.player.airborne && this.player.vy > 80 && playerBox.y + playerBox.h < hazard.y + hazard.h * .72) {
          this.destroyHazard(hazard, 'STOMP');
          this.player.vy = -270;
          this.player.airborne = true;
          this.roomStats.stomps += 1;
          this.progressChallenge('stomp');
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
    this.progressChallenge('near');
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
      const touching = intersects(playerBox, pickup) || (pickup.type === 'crawler' && Math.abs(pickup.x - this.player.x) < 22);
      const canCollect = pickup.type !== 'switch' || this.player.vehicleTime > 0;
      if (touching && canCollect) {
        pickup.on = false;
        if (pickup.type === 'coin') {
          this.roomStats.coins += 1;
          this.progressChallenge('coin');
          this.addViewers((this.currentRoute.mechanicId === 'vault' ? 22 : 10) * (this.coinScale || 1), 'LOOT');
          this.donutCooldown = Math.max(0, this.donutCooldown - .25);
          Audio.coin();
        } else if (pickup.type === 'mote') {
          this.roomStats.motes += 1;
          this.progressChallenge('mote');
          this.scoutTime = Math.max(this.scoutTime, 1.4);
          this.addViewers(35, 'SIGNAL MOTE');
          Audio.coin();
        } else if (pickup.type === 'vehicle') {
          this.player.vehicleTime = 7;
          this.player.invincible = Math.max(this.player.invincible, .7);
          this.addViewers(160, 'CART HIJACK');
          this.say('DONUT', 'You have acquired a vehicle. This has never improved your judgment.');
          Audio.box();
        } else if (['coolant', 'signal', 'switch'].includes(pickup.type)) {
          this.bossObjective = (this.bossObjective || 0) + 1;
          this.hitBoss(1, true);
          this.addViewers(120, `${pickup.type.toUpperCase()} SECURED`);
          Audio.box();
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
      if (this.currentRoute.mechanicId === 'mob') this.awardBox('silver');
    }
    if (this.currentRoute.mechanicId === 'vault') this.awardBox(RNG.next() < .24 ? 'gold' : 'bronze');
    if (this.hp === 1) this.unlockAchievement('oneHeart');
    this.rescueSpawned = false;
    this.settleSponsorRoom();
    if (this.roomsOnFloor >= ROOMS_PER_FLOOR) this.queueInterlude('boss');
    else if (this.roomsOnFloor === 2) this.queueInterlude('safe');
    else this.queueInterlude('door');
  },

  queueInterlude(next) {
    this.interludeNext = next;
    if (this.roomsOnFloor === 2 && this.sponsorOfferedFloor !== this.floor) {
      this.sponsorOfferedFloor = this.floor;
      this.showSponsor();
    }
    else this.continueInterlude();
  },

  settleSponsorRoom() {
    if (!this.sponsorModifier) return;
    this.sponsorModifier.roomsLeft -= 1;
    if (this.sponsorModifier.roomsLeft <= 0) {
      this.toast('SPONSOR CONTRACT COMPLETE');
      this.sponsorModifier = null;
    }
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
    this.state = 'SPONSOR';
    this.showOverlay('sponsor');
    $('sponsorText').textContent = 'One contract per floor. Every effect is guaranteed, timed, and displayed during play.';
    const offers = RNG.shuffle(SPONSOR_OFFERS).slice(0, 2);
    $('sponsorChoices').innerHTML = offers.map(offer => `<button data-offer="${offer.id}"><b>${offer.title}</b><span>${offer.now}</span><small>${offer.next}</small></button>`).join('');
    document.querySelectorAll('[data-offer]').forEach(button => {
      button.onclick = () => this.acceptSponsor(button.dataset.offer);
    });
  },

  acceptSponsor(id) {
    const offer = SPONSOR_OFFERS.find(entry => entry.id === id);
    if (!offer) return;
    offer.apply(this);
    this.say('ANNOUNCER', `${offer.title} accepted. The exact fine print is now pinned to the broadcast.`);
    this.toast(`${offer.title} · ${this.sponsorModifier.label}`);
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
    this.features = [];
    this.pickups = [];
    this.currentRoute = { id: 'boss', title: this.floorData().boss, kind: 'danger', threat: 1 };
    this.scoreMultiplier = this.sponsorModifier?.double ? 2 : 1;
    const kind = (this.floor - 1) % FLOORS.length;
    const bossHealth = [3, 4, 4, 4, 5][kind];
    this.boss = {
      name: this.floorData().boss, x: W - 51, y: GROUND - 43, w: 39, h: 43,
      hp: bossHealth, maxHp: bossHealth, kind, mode: 'idle', modeTimer: 0,
      timer: 1.8, vulnerable: 0, hitCooldown: 0, defeated: false,
    };
    this.bossNoHit = true;
    this.bossWave = 0;
    this.bossObjective = 0;
    this.roomStats = { damage: 0, kills: 0, near: 0, slides: 0, stomps: 0, rescue: false };
    const instructions = [
      'DODGE THE RAM · STOMP THE STALLED ENGINE',
      'COLLECT 4 COOLANT VALVES',
      'CATCH 4 SIGNAL MOTES TO REVEAL THE QUEEN',
      'HIJACK THE CART · HIT 4 TRACK SWITCHES',
      'DODGE THE SHOT · STRIKE DURING RELOAD',
    ];
    this.bossInstruction = instructions[kind];
    $('roomGoal').textContent = `BOSS · ${this.bossInstruction}`;
    this.say('ANNOUNCER', `${this.boss.name}. ${this.bossInstruction}.`);
  },

  updateBoss(dt) {
    const boss = this.boss;
    if (!boss || boss.defeated) return;
    boss.timer -= dt;
    boss.modeTimer -= dt;
    boss.vulnerable = Math.max(0, boss.vulnerable - dt);
    boss.hitCooldown = Math.max(0, boss.hitCooldown - dt);

    if (boss.kind === 0) {
      if (boss.mode === 'idle' && boss.timer <= 0) {
        this.spawnHazard(this.bossWave % 2 ? 'goblin' : 'log', W + 8);
        boss.mode = 'telegraph'; boss.modeTimer = 1.15; this.bossWave += 1;
        this.say('SYSTEM', 'DOZER RAM INCOMING · JUMP CLEAR!');
      } else if (boss.mode === 'telegraph' && boss.modeTimer <= 0) {
        boss.mode = 'ram'; boss.modeTimer = 1.15; boss.x = W - 51;
      } else if (boss.mode === 'ram') {
        boss.x -= 185 * dt;
        if (boss.x <= 39 || boss.modeTimer <= 0) {
          boss.x = 42; boss.mode = 'stunned'; boss.vulnerable = 1.75;
          this.shake = .8; this.say('SYSTEM', 'ENGINE STALLED · STOMP NOW!');
        }
      } else if (boss.mode === 'stunned' && boss.vulnerable <= 0) {
        boss.mode = 'idle'; boss.x = W - 51; boss.timer = 1.5;
      }
    } else if (boss.timer <= 0) {
      this.bossWave += 1;
      if (boss.kind === 1) {
        this.spawnHazard('flame', W + 8);
        this.spawnHazard('crusher', W + 78);
        const high = this.bossWave % 2;
        this.pickups.push({ type: 'coolant', x: W + 48, y: high ? GROUND - 88 : GROUND - 22, w: 9, h: 13, on: true, spin: 0 });
        boss.timer = 4.4;
        this.say('SYSTEM', `COOLANT VALVE ${this.bossObjective + 1}/4 ENTERING THE LINE.`);
      } else if (boss.kind === 2) {
        this.spawnHazard('bat', W + 8); this.spawnHazard('bat', W + 70);
        for (let i = 0; i < 2; i++) this.pickups.push({ type: 'signal', x: W + 35 + i * 36, y: GROUND - 55 - i * 30, w: 8, h: 8, on: true, spin: i });
        boss.timer = 4.1;
        this.say('DONUT', 'The signal motes outline her armor. Collect them. Obviously.');
      } else if (boss.kind === 3) {
        if (this.player.vehicleTime <= 0) this.pickups.push({ type: 'vehicle', x: W + 8, y: GROUND - 19, w: 30, h: 19, on: true, spin: 0 });
        this.spawnHazard(this.bossWave % 2 ? 'barrier' : 'cart', W + 76);
        this.pickups.push({ type: 'switch', x: W + 46, y: GROUND - (this.bossWave % 2 ? 30 : 75), w: 9, h: 12, on: true, spin: 0 });
        boss.timer = 4.3;
        this.say('SYSTEM', `TRACK SWITCH ${this.bossObjective + 1}/4 · CART CONTROL RECOMMENDED.`);
      } else {
        const shot = { type: 'hunterShot', x: W + 5, y: Math.max(150, this.player.y + 10), w: 24, h: 5, on: true, passed: false, friendly: false, age: 0, vx: 0 };
        this.hazards.push(shot);
        boss.vulnerable = 1.25;
        boss.timer = 3.5;
        this.say('SYSTEM', 'HUNTER RELOADING · CLOSE THE DISTANCE!');
      }
    }
    if (boss.kind !== 0) {
      const targetX = boss.kind === 4 && boss.vulnerable > 0 ? 60 : W - 51;
      boss.x += (targetX - boss.x) * dt * 4;
    }
    if (boss.hitCooldown <= 0 && intersects(this.player.box(), boss)) {
      if (boss.vulnerable > 0 && this.player.airborne && this.player.vy > 60 && [0, 4].includes(boss.kind)) {
        this.hitBoss(this.classId === 'brawler' ? 2 : 1);
        this.player.vy = -310;
      } else {
        this.damage('boss');
        boss.hitCooldown = 1;
      }
    }
  },

  hitBoss(amount = 1, objectiveHit = false) {
    if (!this.boss || this.boss.defeated || (this.boss.hitCooldown > 0 && !objectiveHit)) return;
    this.boss.hp -= amount;
    this.boss.hitCooldown = .55;
    if ([0, 4].includes(this.boss.kind)) this.boss.vulnerable = 0;
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
    for (const tier of VIEWER_TIERS.slice(1)) {
      if (this.viewers >= tier.at && !this.viewerMilestones.has(tier.at)) {
        this.viewerMilestones.add(tier.at);
        this.boxes.push(tier.reward);
        this.toast(`${tier.name} REACHED · ${tier.reward.toUpperCase()} BOX`);
        Audio.achievement();
      }
    }
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
    $('finalChallenges').textContent = this.challengesCompleted;
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
    let currentTierIndex = 0;
    VIEWER_TIERS.forEach((tier, index) => { if (this.viewers >= tier.at) currentTierIndex = index; });
    const currentTier = VIEWER_TIERS[currentTierIndex];
    const nextTier = VIEWER_TIERS[currentTierIndex + 1];
    $('viewerTier').textContent = currentTier.name;
    if (nextTier) {
      const progress = (this.viewers - currentTier.at) / (nextTier.at - currentTier.at) * 100;
      $('milestone').style.setProperty('--viewer-progress', `${Math.max(0, Math.min(100, progress))}%`);
      $('viewerNext').textContent = `${Math.max(0, Math.ceil(nextTier.at - this.viewers)).toLocaleString()} TO ${nextTier.name}`;
    } else {
      $('milestone').style.setProperty('--viewer-progress', '100%');
      $('viewerNext').textContent = 'MAXIMUM INFAMY';
    }
    const challengePanel = $('challengeStatus');
    if (this.state === 'BOSS' && this.boss) {
      challengePanel.classList.toggle?.('done', this.boss.defeated);
      $('challengeLabel').textContent = 'BOSS OBJECTIVE';
      $('challengeText').textContent = `${this.bossInstruction} · HP ${Math.max(0, this.boss.hp)}/${this.boss.maxHp}`;
    } else if (this.challenge) {
      challengePanel.classList.toggle?.('done', this.challenge.complete);
      $('challengeLabel').textContent = this.challenge.complete ? 'OBJECTIVE COMPLETE' : 'ROOM OBJECTIVE';
      $('challengeText').textContent = `${this.challenge.label} · ${this.challenge.progress}/${this.challenge.target}`;
    }
    if (this.sponsorModifier) {
      $('sponsorStatus').classList.remove('hidden');
      $('sponsorStatus').textContent = `CONTRACT · ${this.sponsorModifier.label} · ${this.sponsorModifier.roomsLeft} ROOM${this.sponsorModifier.roomsLeft === 1 ? '' : 'S'}`;
    } else $('sponsorStatus').classList.add('hidden');
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
    for (const feature of this.features) this.drawFeature(feature);
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
    const biome = (this.floor - 1) % FLOORS.length;
    if (biome === 0) {
      ctx.fillStyle = '#315b35';
      for (let i = 0; i < 4; i++) { const x = ((i * 73 - scroll * .22) % 330 + 330) % 330 - 30; ctx.fillRect(x, 0, 3, 92 + i * 17); ctx.fillRect(x - 5, 88 + i * 17, 13, 5); }
      ctx.fillStyle = '#806b45'; ctx.fillRect(((170 - scroll * .18) % 320 + 320) % 320 - 30, 280, 42, 70);
    } else if (biome === 1) {
      ctx.fillStyle = '#8e4531'; ctx.fillRect(0, 120, W, 5); ctx.fillRect(28, 90, 8, 230); ctx.fillRect(170, 60, 10, 260);
      ctx.fillStyle = '#f59b4b';
      for (let i = 0; i < 9; i++) { const x = (i * 31 + Math.floor(this.time * 17)) % W; const y = 290 - (i * 37 + Math.floor(this.time * 23)) % 180; ctx.fillRect(x, y, 2, 3); }
    } else if (biome === 2) {
      ctx.fillStyle = '#080b14';
      for (let i = 0; i < 8; i++) { const x = ((i * 37 - scroll * .1) % 280 + 280) % 280; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 11, 48 + (i % 3) * 21); ctx.lineTo(x + 20, 0); ctx.fill(); }
      ctx.fillStyle = '#819af0';
      for (let i = 0; i < 7; i++) { const x = (i * 43 + Math.floor(this.time * 9)) % W; const y = 105 + (i * 47) % 180; ctx.fillRect(x, y, 2, 2); }
    } else if (biome === 3) {
      ctx.strokeStyle = '#87959b'; ctx.lineWidth = 2;
      for (let y = 155; y < 305; y += 58) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y - 16); ctx.stroke(); }
      ctx.fillStyle = '#d5c46e'; ctx.fillRect(((120 - scroll * .35) % 310 + 310) % 310 - 20, 125, 34, 18);
    } else {
      ctx.fillStyle = '#9d3c78';
      for (let i = 0; i < 5; i++) { const x = ((i * 61 - scroll * .14) % 310 + 310) % 310 - 20; ctx.fillRect(x, 75, 22, 65); ctx.fillStyle = '#e1bb55'; ctx.fillRect(x + 4, 82, 14, 4); ctx.fillStyle = '#9d3c78'; }
      ctx.globalAlpha = .12; ctx.fillStyle = '#fff4c7'; ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(55, GROUND); ctx.lineTo(165, GROUND); ctx.fill(); ctx.globalAlpha = 1;
    }
  },

  drawFeature(feature) {
    if (!feature.on) return;
    if (feature.type === 'swingVine') {
      const sway = Math.sin(this.time * 3 + feature.sway) * 5;
      ctx.strokeStyle = '#79a94d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(feature.x, feature.y); ctx.quadraticCurveTo(feature.x + sway, feature.y + 95, feature.x + 7, feature.y + feature.h); ctx.stroke();
      ctx.fillStyle = feature.used ? '#a9ce6b' : '#e5c858'; ctx.fillRect(feature.x + 2, feature.y + feature.h - 5, 11, 5);
    } else if (feature.type === 'grindRail') {
      ctx.fillStyle = '#c5b86e'; ctx.fillRect(feature.x, feature.y, feature.w, 4);
      ctx.fillStyle = '#515b64'; for (let x = 8; x < feature.w; x += 24) ctx.fillRect(feature.x + x, feature.y + 4, 3, 18);
      ctx.fillStyle = '#fff4a5'; for (let x = 4; x < feature.w; x += 18) ctx.fillRect(feature.x + x, feature.y + 1, 4, 1);
    } else if (feature.type === 'bouncePad') {
      ctx.fillStyle = '#794d91'; ctx.fillRect(feature.x + 4, feature.y - 3, feature.w - 8, 9);
      ctx.fillStyle = '#d89aea'; ctx.fillRect(feature.x, feature.y - 5, feature.w, 5);
      ctx.fillStyle = '#eee8cb'; ctx.fillRect(feature.x + 5, feature.y - 4, 4, 2); ctx.fillRect(feature.x + 16, feature.y - 3, 3, 2);
    }
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
    } else if (hazard.type === 'goblin') {
      ctx.fillStyle = '#668f42'; ctx.fillRect(hazard.x + 3, hazard.y, 11, 9); ctx.fillRect(hazard.x + 1, hazard.y + 2, 3, 3); ctx.fillRect(hazard.x + 13, hazard.y + 2, 3, 3);
      ctx.fillStyle = '#493629'; ctx.fillRect(hazard.x + 1, hazard.y + 9, 15, 10);
      ctx.fillStyle = '#ffe16e'; ctx.fillRect(hazard.x + 10, hazard.y + 3, 2, 2);
    } else if (hazard.type === 'hunterShot') {
      ctx.fillStyle = '#ff5d9d'; ctx.fillRect(hazard.x, hazard.y, hazard.w, hazard.h);
      ctx.fillStyle = '#fff4ac'; ctx.fillRect(hazard.x, hazard.y + 1, 6, 2);
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
    } else if (pickup.type === 'crawler') {
      ctx.fillStyle = '#7fa5ad'; ctx.fillRect(pickup.x + 3, pickup.y, 7, 7);
      ctx.fillStyle = '#596b78'; ctx.fillRect(pickup.x, pickup.y + 7, 12, 11);
      ctx.fillStyle = '#fff'; ctx.fillRect(pickup.x + 8, pickup.y + 2, 2, 2);
      ctx.fillStyle = '#83e29b'; ctx.fillRect(pickup.x + 3, pickup.y - 7, 6, 4);
    } else if (pickup.type === 'vehicle') {
      ctx.fillStyle = '#697983'; ctx.fillRect(pickup.x, pickup.y + 3, 30, 12); ctx.fillStyle = '#b7c3c5'; ctx.fillRect(pickup.x + 3, pickup.y + 4, 23, 3);
      ctx.fillStyle = '#11151a'; ctx.fillRect(pickup.x + 3, pickup.y + 14, 7, 5); ctx.fillRect(pickup.x + 21, pickup.y + 14, 7, 5);
      ctx.fillStyle = '#f0d45f'; ctx.fillRect(pickup.x + 12, pickup.y - 4, 7, 5);
    } else if (pickup.type === 'mote' || pickup.type === 'signal') {
      const pulse = Math.floor(Math.sin(pickup.spin) * 2);
      ctx.fillStyle = pickup.type === 'signal' ? '#f1a7ff' : '#8bdfff'; ctx.fillRect(pickup.x - 2 - pulse, pickup.y + 2, pickup.w + 4 + pulse * 2, 3);
      ctx.fillStyle = '#fff6c5'; ctx.fillRect(pickup.x + 2, pickup.y, 3, pickup.h);
    } else if (pickup.type === 'coolant') {
      ctx.fillStyle = '#8fe7ff'; ctx.fillRect(pickup.x + 2, pickup.y, 5, 13); ctx.fillStyle = '#d8fbff'; ctx.fillRect(pickup.x, pickup.y + 2, 9, 3); ctx.fillRect(pickup.x, pickup.y + 9, 9, 3);
    } else if (pickup.type === 'switch') {
      ctx.fillStyle = '#d0b35e'; ctx.fillRect(pickup.x + 3, pickup.y, 3, 12); ctx.fillStyle = '#ff6c63'; ctx.fillRect(pickup.x, pickup.y, 9, 5);
    }
  },

  drawBoss(boss, floor) {
    if (boss.defeated) return;
    ctx.fillStyle = '#090b0f'; ctx.fillRect(52, 70, 136, 12);
    ctx.fillStyle = boss.vulnerable > 0 ? '#ffe36d' : '#b94c4c'; ctx.fillRect(55, 73, 130 * Math.max(0, boss.hp / boss.maxHp), 6);
    ctx.fillStyle = '#fff0a8'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.fillText(boss.name, 120, 68); ctx.textAlign = 'left';
    if (boss.kind === 0) {
      ctx.fillStyle = '#313840'; ctx.fillRect(boss.x, boss.y + 19, 39, 24);
      ctx.fillStyle = '#6e9848'; ctx.fillRect(boss.x + 8, boss.y + 4, 23, 18); ctx.fillRect(boss.x + 3, boss.y + 8, 7, 6); ctx.fillRect(boss.x + 29, boss.y + 8, 7, 6);
      ctx.fillStyle = '#e4d469'; ctx.fillRect(boss.x + 13, boss.y + 10, 4, 3); ctx.fillRect(boss.x + 24, boss.y + 10, 4, 3);
      ctx.fillStyle = '#171b20'; for (let x = 2; x < 37; x += 8) ctx.fillRect(boss.x + x, boss.y + 38, 6, 7);
      ctx.fillStyle = boss.mode === 'telegraph' ? '#ff5f57' : '#d6b44f'; ctx.fillRect(boss.x - 8, boss.y + 27, 10, 7);
    } else if (boss.kind === 1) {
      ctx.fillStyle = '#552523'; ctx.fillRect(boss.x + 2, boss.y + 5, 35, 38);
      ctx.fillStyle = '#e16d3c'; ctx.fillRect(boss.x + 8, boss.y + 11, 23, 25);
      ctx.fillStyle = '#ffd35c'; ctx.fillRect(boss.x + 13, boss.y + 17, 13, 14);
      ctx.fillStyle = '#25252b'; ctx.fillRect(boss.x - 5, boss.y + 2, 9, 41); ctx.fillRect(boss.x + 35, boss.y + 2, 9, 41);
      ctx.fillStyle = '#8fe7ff'; for (let i = 0; i < Math.max(0, boss.maxHp - boss.hp); i++) ctx.fillRect(boss.x + 9 + i * 6, boss.y + 7, 4, 4);
    } else if (boss.kind === 2) {
      ctx.fillStyle = '#161426'; ctx.fillRect(boss.x + 9, boss.y + 9, 22, 34);
      ctx.fillStyle = '#7864a5'; ctx.fillRect(boss.x - 5, boss.y + 5, 17, 22); ctx.fillRect(boss.x + 28, boss.y + 5, 17, 22);
      ctx.fillStyle = '#b49be8'; ctx.fillRect(boss.x + 12, boss.y + 3, 16, 13);
      ctx.fillStyle = '#f19fff'; ctx.fillRect(boss.x + 15, boss.y + 8, 3, 3); ctx.fillRect(boss.x + 23, boss.y + 8, 3, 3);
      ctx.fillStyle = '#879cf0'; for (let i = 0; i < this.bossObjective; i++) ctx.fillRect(boss.x + 9 + i * 6, boss.y - 4, 3, 3);
    } else if (boss.kind === 3) {
      ctx.fillStyle = '#49565b'; ctx.fillRect(boss.x - 3, boss.y + 9, 45, 31);
      ctx.fillStyle = '#bba969'; ctx.fillRect(boss.x + 4, boss.y + 2, 31, 15);
      ctx.fillStyle = '#192025'; ctx.fillRect(boss.x + 9, boss.y + 7, 7, 5); ctx.fillRect(boss.x + 25, boss.y + 7, 7, 5);
      ctx.fillStyle = '#0c1013'; ctx.fillRect(boss.x, boss.y + 37, 12, 8); ctx.fillRect(boss.x + 28, boss.y + 37, 12, 8);
      ctx.fillStyle = '#ffcf55'; ctx.fillRect(boss.x - 9, boss.y + 22, 9, 4);
    } else {
      ctx.fillStyle = '#4b2945'; ctx.fillRect(boss.x + 6, boss.y + 11, 27, 32);
      ctx.fillStyle = '#c64d83'; ctx.fillRect(boss.x + 9, boss.y + 2, 21, 15);
      ctx.fillStyle = '#f4e3d7'; ctx.fillRect(boss.x + 13, boss.y + 7, 4, 3); ctx.fillRect(boss.x + 24, boss.y + 7, 4, 3);
      ctx.fillStyle = '#22242c'; ctx.fillRect(boss.x - 13, boss.y + 18, 23, 5); ctx.fillRect(boss.x - 15, boss.y + 16, 6, 9);
      ctx.fillStyle = '#ff5d9d'; ctx.fillRect(boss.x - 16, boss.y + 19, 3, 3);
    }
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
    });
    canvas.addEventListener('pointerup', event => {
      if (!['RUNNING', 'BOSS'].includes(Game.state)) return;
      const dx = event.clientX - this.x;
      const dy = event.clientY - this.y;
      if (dy > 28 && Math.abs(dy) > Math.abs(dx)) Game.player.dive();
      else if (dy < -28 && Math.abs(dy) > Math.abs(dx)) Game.player.dash();
      else Game.player.jump();
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
