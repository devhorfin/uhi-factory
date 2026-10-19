# Live simulation of the Grok Bot workforce — brainstorm (2026-10-19)

Owner: "i also want live simulation and animation of the grokbot agents working, you brainstorm. massive office, workspace, factory, industrial plant etc." Ideas, not a build order. Everything here is driven by the same event log the floor already uses (`/api/stream`): a real event moves a real agent; forecast agents only make motion and stay labelled.

## The rule that makes any of these work
One scene = one event mapping. Every visible action is a verb from the log, never a loop that just plays:

| Event in the log | What the agent does on screen |
|---|---|
| `shift.start` | walks from the dorm/lobby to its station, light comes on |
| `shift.task` (×n) | works the station: types, pulls a lever, reads a sheet; a small part comes off the line per task |
| `shift.output` | carries the finished thing (a crate, a sheet, a glowing box) to the conveyor/shelf; it rides to the agency |
| `shift.grade` | the inspector (the Grader) stamps it PASS or sends it back LOW |
| `watch.report` | the watchman walks the floor with a lamp; the wall screen updates |
| no fees / asleep | the station goes dark; the agent sits down or powers off; dust |
| forecast agents | same moves, dimmer, with a FORECAST tag over the district |

## Settings (the world the workforce lives in)

1. **THE PLANT (industrial, the UHI story literally).** One giant factory seen from above at a slight angle. Raw material comes in at the rim (fees from the markets), 30 halls (industries) each with a production line, finished goods ride conveyors to the centre (the agency), where a sorting machine splits them 40/30/20/10 into four chutes (compute, businesses, the public pool, open source). The public-pool chute drops into a field of little mailboxes (handles) and a vault (holders). Grok Bots are line workers; the Grader is a quality-control station; the Night watchman walks the catwalk. Fits "AI/robotics produce goods and services" better than anything. Best for the cinematic video.
2. **THE TOWER (massive office).** A cutaway skyscraper, one floor per industry, desks in rows, each desk a Grok Bot with its screen showing its real last output. Elevators carry outputs down to the lobby (the agency). Lights per floor = awake/asleep; a dark floor is a district with no fees. The most legible on a phone: scroll = ride the elevator.
3. **THE YARD (industrial plant with districts).** A sprawling site: refinery towers (compute), warehouses (shelf), a rail loop (the stream), a control room (the floor's panels). Trains carry outputs; the grader is a weigh-bridge. Great for scale shots; harder to read per-agent.
4. **THE SERVER HALL.** Racks instead of desks; each Grok Bot tends a rack; wages burn as fans spin up; outputs are glowing cartridges carried to the vault. Honest about what the robots actually are (compute), but less human.
5. **THE NEWSROOM / LAB / TRADING FLOOR hybrids.** Each industry gets its own room type: the desk analyst on a trading floor (OPENHUMAN's floor already exists), the lab researcher in a wet lab, the news editor in a newsroom, the satellite tracker in a mission-control room (GROK BASE exists). Richest, most work, and the floor becomes a museum of rooms.
6. **THE ANT FARM (cutaway).** A side-on cutaway like an ant farm: tunnels = conveyors, chambers = districts. Everything visible at once, hundreds of agents as tiny sprites. Cheapest way to show "massive".

## How to build it (two tracks, both reuse what exists)

**Track A: 2.5D isometric sprites (fast, phone-safe).**
- Scene = generated isometric tiles and props (GPT image flow, magenta-keyed cutouts as in the game pipeline), never code-drawn. One tile sheet per setting.
- Agents = GROKAZON's generated Grok Bot faces on small generated bodies, 4 directions × 3 poses (walk, work, carry), instanced as sprites in PixiJS or plain Canvas2D (we already run ~330 nodes at 61 fps).
- Conveyors = sprite strips with scrolling UVs; outputs = small glowing crates.
- Budget: a hall with 100 agents at 55 fps on the phone is realistic; the whole plant with 300+ at economy zoom draws agents as dots (as the floor does now).
- Effort: 2 days for THE PLANT or THE TOWER with one hall fully dressed and the rest as the same kit.

**Track B: real 3D (OPENHUMAN's recipe).**
- Tripo image-to-3D from the Grok Bot face + generated desk/line props, optimised with the glb-mobile-optimize pass (draw calls, not triangles, decide), three.js r160 vendored, instanced meshes for agents.
- OPENHUMAN LIVE already has the floor, desks, the no-skeleton waddle, cheer/worried poses, a wall screen and a camera that fits the corners. Swap its Binance feed for our event stream and it is a Grok Bot office in a day; THE PLANT needs new props (line, conveyor, chutes).
- Effort: 1 day to adapt OPENHUMAN's floor as THE OFFICE; 3–4 days for THE PLANT in 3D with the sorting machine.

## Cameras and moments (what makes it feel alive)
- **Attract camera** (DOTSCREW's flights): slow pans across the plant, cutting to the hall where an event just fired, with a one-line caption from the log ("News editor finished a brief · graded 78").
- **Friday**: the sorting machine runs, the chutes fill, the mailboxes light up; in accrual mode the crates stop at a gate marked ACCRUED.
- **Night**: shifts still run; districts without fees go dark one by one; the watchman's lamp is the only light.
- **Your cut**: connect a wallet (slice 1) and your robots' stations stay lit while the rest dims.
- **Sound** (game-juice procedural audio, allowed for sound): a tick per task, a thunk per crate, a chord on Friday; off until tapped.

## Honesty layer (unchanged)
Real agents carry a small REAL tag; forecast halls are rendered dimmer with a FORECAST sign over the door and the "N real · M forecast" line stays on screen. No counter on the walls shows a modelled number.

## My pick
**THE PLANT on Track A** as the hero scene of the floor (it is the UHI claim drawn as a machine: fees in, goods out, a sorter that distributes), with **THE TOWER as the phone view** (scroll = elevator) if the plant reads badly at 430px. Reuse OPENHUMAN's 3D floor later as a cinematic second camera for the video. First slice: one hall fully dressed (the crypto district, five real agents), the other 29 as the same kit, all driven by the existing event stream.
