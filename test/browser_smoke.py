#!/usr/bin/env python3.14
"""Real-browser smoke check: load the built game, ride a minecart, expect no errors."""
import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

# Put the cart on Carl through the real pickup path, with hazards cleared so he survives.
FORCE_CART = """() => {
  Game.hazards = [];
  Game.spawnRoomEvent([0, 'vehicle']);
  const cart = Game.pickups.find(p => p.type === 'vehicle' && p.on);
  if (!cart) return null;
  cart.x = Game.player.x;
  cart.y = Game.player.y;
  return { frame: Game.lastFrame, time: Game.time };
}"""

SAMPLE = "() => ({ frame: Game.lastFrame, time: Game.time, vehicle: Game.player.vehicleTime })"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", default=str(ROOT / "index.html"))
    ap.add_argument("--shot")
    args = ap.parse_args()
    page_path = Path(args.page).resolve()

    errors, console_errors, external = [], [], []
    failures = []
    summary = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()

        def route(r):
            if r.request.url.startswith("file://"):
                r.continue_()
            else:
                external.append(r.request.url)
                r.abort()

        page.route("**/*", route)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and console_errors.append(m.text))

        try:
            page.goto(page_path.as_uri())
            page.click("#runBtn")
            page.wait_for_timeout(500)
            before = page.evaluate(FORCE_CART)
            if before is None:
                failures.append("cart pickup was not spawned")
            else:
                rode, windows, last = False, [], before
                for _ in range(4):
                    # Poll within each 500 ms window so a brief ride is still seen.
                    for _ in range(10):
                        page.wait_for_timeout(50)
                        if page.evaluate("() => Game.player.vehicleTime") > 0:
                            rode = True
                    now = page.evaluate(SAMPLE)
                    windows.append(
                        {"frame": now["frame"] - last["frame"], "time": round(now["time"] - last["time"], 3)}
                    )
                    last = now
                after = last
                summary.update(
                    rode=rode,
                    frame_delta=after["frame"] - before["frame"],
                    time_delta=round(after["time"] - before["time"], 3),
                    windows=windows,
                )
                stalled = [i for i, w in enumerate(windows) if w["frame"] <= 0 or w["time"] <= 0]
                if stalled:
                    failures.append(f"frame clock or game time stalled in window(s) {stalled}")
                if not rode:
                    failures.append("Carl never rode the cart")
                if summary["frame_delta"] < 1000:
                    failures.append("frame clock advanced too little overall")
                if summary["time_delta"] < 1.0:
                    failures.append("game time advanced too little overall")
            if args.shot:
                page.screenshot(path=args.shot)
        except Exception as e:  # load or click failures count as a failed check
            failures.append(f"driver error: {e}")
        browser.close()

    if errors:
        failures.append("page errors")
    if console_errors:
        failures.append("console errors")
    if external:
        failures.append("external requests")
    summary.update(
        ok=not failures,
        failures=failures,
        page_errors=errors,
        console_errors=console_errors,
        external_requests=external,
    )
    print(json.dumps(summary))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
