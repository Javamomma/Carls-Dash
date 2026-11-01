# Plan: make v2.1 playable again (danger, minecart, pause)

Source: audit `~/audits/reports/Carls-Dash/2026-10-31.md` and its dev-team task file. Base: `main`
(v2.1.0, 323b775). One builder at a time. Every fix lands with a test that failed before it.

Proof rule: the new rules tests load `src/game.js` by default, but the env var
`CARLS_DASH_GAME_SRC=<path>` points them at another copy, so the lead can run them against the
323b775 game and watch them fail.

## T1 `hazard-hits` — obstacles hurt Carl again
- New fixture `test/fixture.mjs`: a fresh fake page per scenario with a fixed seed, an in-memory
  `localStorage`, captured event listeners, and a controllable clock (`performance.now`,
  `window.setTimeout`/`clearTimeout`, `requestAnimationFrame`) that tests advance by hand.
- New `test/rules.test.mjs`, scenario "every hostile hazard hurts a vulnerable Carl": log, snake,
  branch, crusher, bat, cart, barrier, hunter, vine, goblin and the hunter boss's `hunterShot` each
  cost exactly 1 HP; pit and flame (after its warning) still do; invincibility still protects.
- Scenarios for stomp, cart smash, trap and grease firing.
- Fix: every hazard gets a numeric `telegraph: 0` default from one place, including `hunterShot`.
- Files: `src/game.js`, `test/fixture.mjs`, `test/rules.test.mjs`, `index.html`.

## T2 `cart-draw` — the minecart no longer freezes the game
- Scenario: pick up the cart through the real pickup path, then `update()` + `draw()` for a few
  seconds without throwing.
- Fix: `drawBody` draws Carl seated in the cart by reusing the normal body-drawing code (no
  `drawHero`).

## T3 `browser-smoke-ci` — a real browser check and CI
- `test/browser_smoke.py` (python3.14 Playwright, pinned in `requirements.txt`; no npm packages):
  load the built `index.html` from disk, block any network request, start a run, force a cart
  pickup, assert the frame clock keeps advancing and no page or console errors fire.
- `.github/workflows/checks.yml` on pushes and PRs to `main`: `npm test`, then
  `git diff --exit-code -- index.html`, then the browser smoke check. Node version pinned and
  noted in the README.
- README "Development" note: start from `main`, edit `src/` not `index.html`, `npm test` before
  committing, `parity/pitfall` is the archived July line.

## T4 `pause-safety` — pausing never blocks a run or earns points
- Boss exit: the 1.5 s delay after a boss falls runs on the game clock (waits through a pause)
  and only acts for the run and boss it was started for.
- Keyboard Space/Up/Down do nothing unless the state is `RUNNING` or `BOSS` (same guard as touch).
- Scenarios: pause across the boss exit, resume, safe room still opens; a stale exit from an
  earlier run or boss does nothing; keyboard input while paused changes nothing.

## T5 `run-leaks` — one run doesn't leak into the next
- Scout copies the route when building `doorChoices`; `ROUTES` is never edited.
- Game-over Retry repeats the same mode (`Game.start(Game.daily)`).
- Scenarios: Scout then restart leaves the route table unchanged; Retry after a daily stays daily.

## T6 `loot-choices` — loot never vanishes without a choice
- While a box's choice is pending, other boxes can't be opened until it's taken or discarded.
- A fourth item asks which slot to replace, or "discard new".
- Scenarios for both.

## T7 `playtest-bot` then `retune` — make floor 1 clearable again
- A scripted player (headless, fixed seeds, a "new player" with reaction delay and misses) that
  plays floors 1–2 and reports hits per room and the share of runs that clear floor 1, plus
  screenshots of floor 1 and the floor-2 cart room for the lead to look at.
- Then tune spawn density or invincibility windows so floor 1 is clearable by a new player.
  Record what changed and the before/after numbers in the commit message.

## T8 `escape-html` (only if time)
- Escape `offer.title/now/next` and the icon fields with `escapeHtml`.

## Hand checks for Arshia (phone)
Listed in the final summary once T1–T7 land.
