# UHI FACTORY (folder `your-robot/`) — slice 0 + THE PLANT P0, v0.3.0

"AI builds. People benefit." Universal High Income built by one developer in public: a workforce of Grok-powered robots does real work; verified revenue pays their wages; the rest is distributed by a rule written first. No fees, no tokens, no wallets anywhere on the site (client direction, 2026-10-19). Slice 0 = the living floor with seven real workers on real shifts, the forecast population (modelled, labelled), the welcome-back box in visitor mode, the job catalog, the fee-split rule and a practice-only launch form. **No coin, no fees, no payouts, no wallet.**

Plan: `../YOUR-ROBOT-PLAN-2026-10-19.md` (the product, 173 jobs in 30 industries, the living economy §12). Direction on 2026-10-19 from Kimba: blend the SpaceX-share pledge and xAI's Grok Bot procurement story, reframe as UHI FACTORY, use the Grok web skin from GROKAZON, show a live workforce, add a launch section, keep it clean.

## Run it
- Desktop app: preview server **`your-robot`** (port 5447), or in a terminal from this folder:

```bash
node service/server.mjs
```

- Open http://localhost:5447/ (the floor) and http://localhost:5447/catalog.html (173 jobs).
- Flags: `--once` runs every worker immediately. Env: `PORT`, `HOST`, `DATA_DIR`, `ROBOT_MODEL`, `XAI_API_KEY`, `OPENAI_API_KEY`.

## What is real
- **Workers** (`service/robots.mjs`): Desk analyst (GeckoTerminal trending pools, every 15 min), Rug auditor (GeckoTerminal new pools + RugCheck, 20 min), Satellite tracker (wheretheiss.at + The Space Devs, 10 min), News editor (GDELT 15-minute export, hourly), Lab researcher (arXiv, every 6 h), plus the Grader (scores every written note on a fixed rubric) and the Night watchman (10-minute report). Every shift writes `service/data/outputs/<id>.json` with items, links, text, tokens and cost, and appends events to `service/data/events.jsonl`.
- **Model** (`service/llm.mjs`): Grok via xAI (`grok-4-fast-non-reasoning`, key at `C:/Users/User/keys/xai/key.txt`) with OpenAI as fallback (`.openai-key` at the projects root). xAI reports the exact cost per call (`cost_in_usd_ticks`); credits are $0.01 each.
- **API**: `/api/state`, `/api/events?since=`, `/api/stream` (SSE), `/api/outputs`, `/api/outputs/<id>`, `/api/health`.
- **Page** (`site/`): `index.html` + `js/app.js` (figures, verbs, workforce, ledger, launch preview, strip, welcome-back) + `js/graph.js` (Canvas2D economy graph: 30 districts, markets at the rim, compute inside, the agency at the centre; real workers pulse on real events, 324 forecast workers only make motion). Tokens are GROKAZON's (`css/tokens.css`), layout in `css/factory.css`. Faces and glyph are the generated Grok Bot assets from GROKAZON.

## Honesty rules baked in
- Forecast workers are drawn dimmer, chipped FORECAST, and the real-vs-forecast count is always on screen; no modelled number is ever shown as a total.
- Hero stats are real zeros (0 businesses, $0 revenue, $0 distributed). The fee split is labelled PLANNED. The launch button is disabled and says so.
- Every output opens with its sources; the Grader's score and note are shown, including low ones.

## QA
Headless, both viewports, one chained command (see `../.claude/skills` canvas-game-qa): 61 fps, zero console errors, no horizontal scroll at 430 px. Module errors do not show in `console --errors`: test with `import('/js/app.js?v=…').then(()=>'ok', e=>e.stack)`.

## Next (needs a go)
Slice 1: hire = launch on AGORA's engine, per-worker fee tracking and the sleep rule, the accrual ledger for the pool. Hosting: the service must run somewhere always-on (Railway, like DOTSCREW's open item); a static zip cannot run it. Art: the floor plate is generated (gpt-image-1, `art-src/plate-gpt.png` → `site/assets/plate.webp`); the accent #64BBD8 is sampled from it. The graph itself is data.

## THE PLANT (live simulation) — P2 built, v0.4.0
Toggle **Graph · Plant** in the floor window (or `?view=plant`). `site/js/plant.js`: one isometric hall (the crypto district, 24×14 tiles): dock, two real stations (Desk analyst, Rug auditor), the belt, the Grader's gate, the chute, the catwalk (Night watchman), the dorm, 20 forecast benches. Every move is an event from the stream (shift.start → walk to station + fee crate from the dock; shift.task → work pose + screen label; shift.output → carry a glowing crate to the belt, it rides to the gate; shift.grade → stamp + PASS sparkle / LOW lamp, LOW crates go back; watch.report → the watchman walks the catwalk; idle → dorm; asleep → dark). Art: 25 generated sprites (`tools/gen_plant_art.py`, gpt-image-1 with transparent background, ~$1), sources in `art-src/plant/`, served from `site/assets/plant/` (1.3 MB). Plan: `../THE-PLANT-PLAN-2026-10-19.md`. P1 (v0.3.2): all 30 industry halls from the kit (station type picked by industry) plus the agency room (the Grader, the watchman, the SHELF chute and the INCOME · ACCRUED gate), an overview of 31 hall cards with live activity, tap to enter, drag to pan, wheel or pinch to zoom; the other real robots sit in their own halls; outputs that leave a hall arrive on the agency's inbound belt. URL: `?view=plant&hall=<id>` (ids `ind1`…`ind30`, `agency`). P2 (v0.4.0): **Attract** button (or `?attract=1`): the camera cycles overview → the hall with the freshest real event (else round-robin, real halls first) → slow drift and breathing zoom → back, with a caption bar from the shift log; any touch stops it. **Sound** button: procedural WebAudio (tick per task, thunk per output, chime on PASS, buzz on LOW, chord on the watchman's report), off until tapped, quiet. **Recording:** `node tools/record_floor.cjs` → `social/plant-30s.mp4` (1280×720, 30 s, H.264, no audio) via Playwright video + ffmpeg.

## plant.html (v0.5.0)
The simulation full-screen: `plant.html` + `js/plantpage.js`. Attract is on until the person touches the floor; buttons Attract / Sound / All halls / Home. The home page now opens its floor on Plant by default, the hero's first button is "▶ Enter the plant", the nav starts with "The plant", and the floor window has a "Full screen ↗" link. The live service answers `/data/snapshot.json` with `{live:true}` so the static-copy probe never 404s.

## Netlify drop
`python -I tools/build_deploy.py` → `deploy/uhi-factory-netlify-latest.zip` (one zip, overwritten each time). It copies `site/` plus a snapshot of the live service (`data/state.json`, `data/events.json`, `data/outputs/*.json`, `data/snapshot.json`). The page detects `data/snapshot.json`, never calls the API, and shows **SNAPSHOT · <time>** where LIVE would be. The forecast floor, the plant, attract and sound still animate; the real robots stay frozen at the snapshot. Rebuild and re-upload for a fresher snapshot. The live floor needs the Node service (Railway or similar), not Netlify.
