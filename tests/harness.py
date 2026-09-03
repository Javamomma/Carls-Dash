#!/usr/bin/env python3
"""Headless play-test harness for Carl's Doorway Dash.

Runs index.html in headless Chromium (Python Playwright), drives the game with a
bot, and reports a JSON summary: console/page errors, final game state, frame
rate, and any custom probes.  No npm, no build step.

Examples
  python3 tests/harness.py                          # 20s autopilot smoke run
  python3 tests/harness.py --seconds 60 --bot random --shot /tmp/run.png
  python3 tests/harness.py --mode expedition --seconds 120 --probe 'G.screen'
  python3 tests/harness.py --seed 42 --eval 'G.hp' --eval 'G.floor'
  python3 tests/harness.py --record shots/  # screenshot every 5s into a folder

Exit code 1 if any page error / console error occurred, or the game never left
the TITLE state, or the final state is not one of RUNNING/TRANSITION/GAMEOVER/
VICTORY.  Use --allow-console-errors to only fail on page (uncaught) errors.
"""
import argparse, json, os, sys, time, random

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')

# Bot policies. Each is JS evaluated every tick inside the page and returns an
# action string: '', 'jump', 'slide', 'dive', 'dash', 'donut', 'tap'.
BOT_JS = {
    'none': "''",
    'random': "['','','jump','jump','slide','dive','dash','donut'][Math.floor(Math.random()*8)]",
    # Autopilot reads the obstacle pool and reacts a fixed lead distance ahead.
    'auto': r"""(()=>{
      if(G.state==='TRANSITION')return 'tap';
      if(G.state!=='RUNNING')return '';
      const p=G.player, lead=G.speed*0.42+40; let act='';
      obstacles.each(o=>{ if(act)return; const d=o.x-(p.x+40);
        if(d<0||d>lead)return;
        const lowT=['tunnel','crusher','branch']; const jumpT=['pit','log','snake','croc','scuttle','goblin','mimic','spike','flame','scorpion','wall'];
        if(lowT.includes(o.type)){act=p.air?'':'slide'}
        else if(o.type==='vine'){act=p.air?'':'jump'}
        else if(o.type==='ladder'){act=''}
        else if(jumpT.includes(o.type)){act=p.air?'':'jump'} });
      if(!act&&G.donut>=100)act='donut';
      return act; })()""",
}

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--seconds', type=float, default=20)
    ap.add_argument('--bot', choices=BOT_JS.keys(), default='auto')
    ap.add_argument('--tick', type=int, default=90, help='bot decision interval in ms')
    ap.add_argument('--mode', default=None, help='game mode to start (calls G.startMode(mode) if defined, else G.start())')
    ap.add_argument('--seed', type=int, default=None, help='set G.pendingSeed before starting')
    ap.add_argument('--shot', default=None, help='screenshot path at end of run')
    ap.add_argument('--record', default=None, help='directory; screenshot every --every seconds')
    ap.add_argument('--every', type=float, default=5)
    ap.add_argument('--eval', action='append', default=[], help='JS expression to evaluate at end (repeatable)')
    ap.add_argument('--probe', action='append', default=[], help='JS expression sampled every second (repeatable)')
    ap.add_argument('--pre', default=None, help='JS to run after load, before start (e.g. set localStorage perks)')
    ap.add_argument('--god', action='store_true', help='keep G.player.inv topped up every tick (invulnerable) to reach far content')
    ap.add_argument('--sim', action='store_true', help='deterministic mode: stop rAF and step G.update(1/60) directly; --seconds then means GAME seconds')
    ap.add_argument('--allow-console-errors', action='store_true')
    ap.add_argument('--headed', action='store_true')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()

    if a.record:
        os.makedirs(a.record, exist_ok=True)

    out = {'errors': [], 'console': [], 'probes': {p: [] for p in a.probe}, 'eval': {}}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not a.headed)
        page = browser.new_page(viewport={'width': 480, 'height': 854})
        page.on('pageerror', lambda e: out['errors'].append(str(e)))
        def on_console(m):
            if m.type in ('error', 'warning'):
                out['console'].append(m.type + ': ' + m.text)
        page.on('console', on_console)
        page.goto('file://' + INDEX)
        page.wait_for_timeout(400)
        # Frame counter for fps estimate.
        page.evaluate("window.__frames=0;(function c(){window.__frames++;requestAnimationFrame(c)})()")
        page.evaluate("var h=document.getElementById('howto');if(h)h.style.display='none'")
        if a.pre:
            page.evaluate(a.pre)
        if a.seed is not None:
            page.evaluate(f"G.pendingSeed={a.seed}")
        if a.mode:
            page.evaluate(f"(typeof G.startMode==='function')?G.startMode({json.dumps(a.mode)}):G.start()")
        else:
            page.evaluate("G.start()")
        page.wait_for_timeout(100)
        out['startState'] = page.evaluate('G.state')
        if a.sim:
            # Kill the rAF loop and step the fixed-timestep update ourselves.
            page.evaluate("G.frame=function(){};window.__step=function(n){for(let i=0;i<n;i++){if(G.hitstop>0){G.hitstop-=1/60;continue}G.update(1/60*(G.slowmo>0?.45:1));if(G.slowmo>0)G.slowmo=Math.max(0,G.slowmo-1/60)}G.draw();G.ui()}")

        bot = BOT_JS[a.bot]
        t0 = time.time(); last_probe = 0; last_shot = 0
        f0 = page.evaluate('window.__frames')
        game_t = 0.0
        steps_per_tick = max(1, round(a.tick / 1000 * 60))
        def elapsed():
            return game_t if a.sim else time.time() - t0
        while elapsed() < a.seconds:
            if a.god:
                page.evaluate("G.player.inv=9;if(G.hp<1)G.hp=1")
            act = page.evaluate(bot)
            if act == 'jump' or act == 'tap':
                page.keyboard.press('Space')
            elif act == 'slide':
                page.keyboard.press('ArrowDown')
            elif act == 'dive':
                page.keyboard.press('Space'); page.wait_for_timeout(60); page.keyboard.press('Space')
            elif act == 'dash':
                page.keyboard.press('ArrowUp') if page.evaluate("!!window.__hasUp") else None
            elif act == 'donut':
                page.keyboard.press('d')
            el = elapsed()
            if a.probe and el - last_probe >= 1:
                last_probe = el
                for p in a.probe:
                    try: out['probes'][p].append(page.evaluate(p))
                    except Exception as e: out['probes'][p].append('ERR ' + str(e)[:80])
            if a.record and el - last_shot >= a.every:
                last_shot = el
                page.screenshot(path=os.path.join(a.record, f'{int(el):04d}.png'))
            st = page.evaluate('G.state')
            if st in ('GAMEOVER', 'VICTORY'):
                break
            if a.sim:
                page.evaluate(f"window.__step({steps_per_tick})")
                game_t += steps_per_tick / 60
            else:
                page.wait_for_timeout(a.tick)
        f1 = page.evaluate('window.__frames')
        out['fps'] = None if a.sim else round((f1 - f0) / max(0.001, time.time() - t0), 1)
        out['wallSeconds'] = round(time.time() - t0, 1)
        out['state'] = page.evaluate('G.state')
        out['summary'] = page.evaluate("({time:+G.time.toFixed(1),floor:G.floor,view:Math.floor(G.view),gold:G.gold,hp:G.hp,mode:G.mode||null,screen:G.screen||null,treasures:G.treasures||null})")
        for e in a.eval:
            try: out['eval'][e] = page.evaluate(e)
            except Exception as ex: out['eval'][e] = 'ERR ' + str(ex)[:120]
        if a.shot:
            page.screenshot(path=a.shot)
        browser.close()

    ok = not out['errors'] and (a.allow_console_errors or not out['console'])
    ok = ok and out['startState'] != 'TITLE' and out['state'] in ('RUNNING', 'TRANSITION', 'GAMEOVER', 'VICTORY', 'PAUSED')
    out['ok'] = ok
    if not a.quiet:
        print(json.dumps(out, indent=1, default=str))
    else:
        print(json.dumps({k: out[k] for k in ('ok', 'state', 'fps', 'summary', 'errors', 'console')}, default=str))
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
