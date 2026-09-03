# 🍩 Carl's Doorway Dash

**A chaotic one-thumb jungle runner where a barefoot game-show contestant sprints through a collapsing dungeon — endless, or on a fixed 32-screen Pitfall-style expedition.** No installs, no accounts, no dependencies — it's a single HTML file. Just tap to play.

### ▶️ [**Play it now →**](https://javamomma.github.io/Carls-Dash/)

![Carl's Doorway Dash gameplay](docs/gameplay.gif)

![Carl's Doorway Dash screenshot](docs/screenshot.png)

---

## What is it?

You are Carl: a barefoot contestant on a live dungeon game show with terrible ratings insurance. Outrun rolling logs, croc pits, swinging blades, tunnels and vines across an ever-collapsing set of floors while the "viewers" counter climbs and a snarky announcer narrates your poor decisions. Bank the gold you grab into permanent perks between runs.

It's built to be **grabbed and played in ten seconds** on a phone — portrait, one thumb, instant restart.

## Features

- 🗺️ **Two episodes** — DASH, the endless collapsing-floor run, and EXPEDITION, a fixed 32-screen jungle course generated from a constant seed (same route every time, so learn it), with a numbered `SCREEN n/32` HUD, signposts on the ground, and a golden EXIT to reach. Each mode keeps its own best on the title screen.
- 🏃 **Deep one-thumb move set** — jump, slide, double-tap dive-kick (with a chaining ground-slam), swipe-up dash hop, and airborne vine grabs.
- ❤️ **Health bar** — trap hits cost hearts, not the whole run; clear a floor to heal.
- 🎯 **Bonus reels & hazard reels** — rotating objectives (stomp lines, vine runs, idol hunts) and timed setpieces (log stampede, crocodile causeway, vine gauntlet).
- 🔥 **Skill economy** — a DASH meter you *spend* (dash-hop, clutch dash-dodge) and a decaying near-miss combo that rewards playing dangerously.
- 📺 **Broadcast spectacle** — a reactive audience, FEET CAM cutaways, a LIVE bug, milestone coin showers, and an announcer with a full range of stingers.
- 💥 **Escape sprints** — each floor ends in a tap-to-outrun-the-collapse dash.
- 🛒 **Perk shop** — bank gold into 9 permanent upgrades (double/triple jump, tougher feet, a 5th heart, dash reserve, streak insurance, and more).
- 🎨 **100% procedural** — all pixel art is drawn on a canvas and all audio is synthesized in the browser. Zero external assets.

## Controls

| Input | Action |
|-------|--------|
| **Title screen** | Pick **DASH (ENDLESS)** or **EXPEDITION** (tapping anywhere else starts Dash) |
| **Tap** | Jump (tap again in air for double/triple jump if unlocked) |
| **Swipe down** | Slide |
| **Double-tap in air** | Dive-kick → ground slam |
| **Swipe up** | Dash hop (spends DASH meter) |
| **Jump + hold near a vine** | Swing across |
| **Donut button** | Fire the DONUT MISSILE when the meter is full |
| **During a floor collapse** | Tap rapidly to outrun the wall |

Keyboard also works: **Space** = jump, **↓** = slide/dive, **D** = missile.

## Run locally

It's a static file — no build step, no server required.

```bash
git clone https://github.com/Javamomma/Carls-Dash.git
cd Carls-Dash
# just open index.html in a browser, or serve it:
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Tech notes

- Single self-contained `index.html` (~75 KB) — HTML5 `<canvas>`, vanilla JS, no libraries.
- Procedural sprite factory + fully synthesized Web Audio (no image or sound files).
- Fixed-timestep game loop with object pooling for obstacles, coins, loot, and particles.
- Progress (Dash and Expedition bests, gold, perks, mute) persists in `localStorage`.
- Headless play-test harness at `tests/harness.py` (Python Playwright); the Pitfall parity rubric lives in `docs/PARITY.md`.
- Deployed free via GitHub Pages.

## License

Released under the [MIT License](LICENSE) — free to play, fork, and build on.
