# Pitfall Parity Rubric

Goal: Carl's Doorway Dash reaches feature/feel parity with an old-school
jungle adventure like *Pitfall!* (Activision, 1982) while keeping what already
works (endless "Dash" mode, single self-contained `index.html`, no build step,
one-thumb mobile controls).

Every criterion has a **verification** column: a command or check anyone can
run. A criterion is DONE only when the verification passes. Status legend:
`TODO` · `WIP` · `DONE` · `SKIP (reason)`.

How to verify: `python3 tests/harness.py --help` (headless Playwright runner;
`--sim` steps the loop deterministically, `--god` makes Carl invulnerable to
reach far content, `--mode expedition` starts a mode via `G.startMode`).

| #  | Criterion (what Pitfall has) | Status | Verification |
|----|------------------------------|--------|--------------|
| P1 | **Expedition mode: a finite, authored world.** A fixed course of 32 numbered screens generated from a constant seed, identical every time, ending at a finish. HUD shows `SCREEN n/32`. Endless Dash mode remains untouched. | TODO | `harness --mode expedition --sim --god --seconds 900 --probe G.screen` shows screen climbing to 32; two runs with same seed give identical obstacle sequence (`--eval` of a route hash). |
| P2 | **Treasure hunt win condition.** 32 treasures in the expedition, 4 tiers (money bag 2000 · silver bar 3000 · gold bar 4000 · diamond ring 5000). Collecting all 32, or reaching the finish, ends with a VICTORY screen (score, time, treasures found). Best treasure count persists. | TODO | `--mode expedition --sim --god` reaches `G.state==='VICTORY'`; `G.treasures` counts up; localStorage keeps best count. |
| P3 | **Expedition clock.** 20:00 countdown shown in HUD; at 0:00 the run ends (GAMEOVER with "TIME UP"). | TODO | `--mode expedition --sim --god --seconds 1300` ends in GAMEOVER with time-up reason. |
| P4 | **Lives + score penalties.** Hits deduct score (log hit −100, fall −200 style), never below 0, and show a red `−100` pop. Hearts stay as lives. | TODO | `--bot random --sim` shows `G.view` dropping on a hit (probe before/after `G.die`). |
| P5 | **Crocodile jaws timing.** Crocs sit in pits and cycle jaws OPEN/CLOSED on a visible ~1.5 s rhythm. Running/landing on a CLOSED head is safe; touching an OPEN mouth is a hit. Stomping remains for the endless mode's land crocs. | TODO | Visual: `--record` frames show both jaw states. Logic: unit probe of `o.open` toggling and `die` only when open. |
| P6 | **Shifting pits.** Quicksand/tar pits that open and close on a cycle; run across while closed, fall while open. Distinct look from the spike pit. | TODO | Probe an obstacle `type==='sand'` toggling `o.open`; `die('floor')` only fires when open. |
| P7 | **Underground route.** Ladders drop Carl to a lower tunnel lane with scorpions and brick walls; a ladder brings him back up. The tunnel skips surface hazards but has its own. | TODO | `--probe G.lane` shows lane switching; scorpion and wall obstacle types spawn underground; no errors over 300 s. |
| P8 | **Vine swing with timing.** Vines swing on a visible pendulum; grabbing near the low point carries further. Tarzan-style yell on grab. | TODO | Vine grab still works (`G.rec.vine>0` in a vine setpiece); yell sound function exists and is called on grab. |
| P9 | **Log variety.** Single, double, and triple rolling logs plus a stationary log; each drawn distinctly. | TODO | Obstacle types `log`, `log2`, `log3`, `logstill` (or a `count` field) spawn in both modes. |
| P10 | **Animated hero.** Carl has a 4-frame run cycle, a jump pose, a slide pose and a swing pose. No more static rectangle. | TODO | `SpriteFactory.carlFrames.length>=4`; frames visibly differ (pixel diff in a screenshot pair). |
| P11 | **Recognizable hazard & jungle art.** Crocs with jaws, scorpions, ringed logs, snakes, vines, tree trunks with canopy, layered parallax ground. Each hazard is identifiable at a glance in a screenshot. | TODO | Reviewer looks at `--record` screenshots and can name every hazard; no overlapping HUD text. |
| P12 | **Sound identity.** Distinct jingles: vine yell glissando, treasure fanfare, fall/hit thud, jump blip, a short title theme loop, victory tune. | TODO | `Audio.yell`, `Audio.treasure`, `Audio.theme`, `Audio.victory` exist and are wired; muted mode stays silent. |
| P13 | **Rock-solid loop.** No console/page errors over a 5-minute automated run in both modes with `random` and `auto` bots; fixed timestep intact; no HUD overlap (the FEET CAM bar must not cover FLOOR/hearts). | TODO | `harness --sim --seconds 300` × 4 combos all exit 0; screenshot review of HUD. |
| P14 | **Title & mode select.** Title screen offers DASH (endless) and EXPEDITION (Pitfall-style), shows best score for each, and the how-to explains the expedition rules. | TODO | DOM has both buttons; `G.startMode('expedition')` and `G.startMode('dash')` both work. |
| P15 | **Full keyboard parity.** Space/↑ jump, ↓ slide/dive, ← nothing (auto-run) , D donut, P pause/resume, R restart, Enter start/retry, M mute. | TODO | Harness `--bot random` via keyboard exercises all keys without errors; pause toggles state. |
| P16 | **Expedition score table.** Separate high-score list for expedition (score, treasures, time, initials). | TODO | `Save.data.expScores` populated after a VICTORY/GAMEOVER in expedition. |

## Progress log

- 2026-09-03 01:30 — Rubric created. Baseline: endless mode only, no errors in a 5-minute sim run, static sprites, FEET CAM overlaps HUD. Harness added at `tests/harness.py`.
