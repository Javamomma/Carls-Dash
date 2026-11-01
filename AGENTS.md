# Carl's Doorway Dash (Carls-Dash)

A one-thumb browser dungeon-runner in the Dungeon Crawler Carl universe: five themed floors,
door choices, loot boxes, bosses, and Donut riding along. It ships as one offline HTML file
(`index.html`, served by GitHub Pages from `main`). The save lives in `localStorage` under the
key `carlsDoorwayDash.v2`.

Base branch: main

## Which line is which
- Start every change from `main` (= v2.1.0 and later, the live game).
- `parity/pitfall` (tag `v1-expedition-2026-09-03`) is the archived July line, a different
  implementation of the older game. It is not the base. Don't merge it or port code from it.
- The steer is "a better Dash", not "closer to Pitfall": no countdown clock, croc jaws, vine yell
  or log variants.

## Stack
- Vanilla JavaScript, HTML and CSS. No runtime dependencies, no network, no assets.
- `scripts/build.mjs` (Node) combines `src/index.template.html`, `src/styles.css` and
  `src/game.js` into the single `index.html`.
- Tests use Node's built-in runner (`node --test test/*.mjs`). `test/runtime-smoke.mjs` runs
  `src/game.js` inside a fake page (Node `vm`).

## Build and run
- Edit files in `src/`, then `npm run build`. Commit the rebuilt `index.html` together with the
  `src/` change. Never hand-edit `index.html`.
- Play locally: `python3 -m http.server 8000`, then open http://localhost:8000.

## Verify
Run this before you commit and make it pass:

```sh
npm test
```

After committing, the committed `index.html` must equal a fresh build and the real-browser
smoke check must pass:

```sh
npm test && git diff --exit-code -- index.html && python3.14 test/browser_smoke.py
```

Run only one browser check at a time: other agents share this machine.

## Conventions
- Comments: one sentence saying *why*. Don't narrate task history; git keeps it.
- Gameplay randomness goes through `RNG` (seeded). Particles may use `Math.random`.
- Content lives in tables (`FLOORS`, `ROUTES`, `ROOM_BLUEPRINTS`, `ITEMS`, `SPONSOR_OFFERS`).
- Tests start each scenario from a fresh game with a fixed seed. Don't make Carl invincible to get
  a test through.
- Use `escapeHtml` for any text placed into `innerHTML`.

## Don't change
- The save key `carlsDoorwayDash.v2` and its legacy `carlsDoorwayDash.v1` migration. Existing best
  scores must survive.
- The single-file release: one self-contained `index.html`, nothing loaded from the network.
- `docs/superpowers/` (untracked, ignored locally).
- Don't add npm packages without asking Arshia.
