# Learnings — UHI FACTORY slice 0 (2026-10-19)

**Problem:** build, in one session, a "living economy" page: real AI workers on real shifts, a massive animated graph, honest forecast population, in a design that changed twice mid-build (teal terminal → paper-and-ink → Grok web skin).

## What worked
1. **Service first, as a zero-dep Node process with an append-only event log + SSE.** Every later UI change only re-read `/api/state` and `/api/events`; three reskins touched no server code. The event log also rebuilds counters after a restart.
2. **Real cost per shift.** xAI returns `usage.cost_in_usd_ticks` (1e-10 USD); use it when present and fall back to list prices. The ledger shows real dollars without a price table drifting.
3. **Grader fairness bug:** the Grader marked a note down for "unsupported volume figures" because the writer saw volume in its prompt but the Grader's item list omitted it. Rule: **the Grader must see exactly the inputs the writer saw** (put every number you give the writer into `items`).
4. **Canvas2D is enough for ~330 nodes + pulses at 61 fps on both viewports** with pre-computed layout and no per-frame allocations. Economy level draws forecast robots as dust (no edges); district level draws them fully. Short radial labels outside the ring stop 30 district names colliding; full names on hover/focus.
5. **Industry matching**: the catalog's names carry parentheticals ("Crypto markets (where our stack is deepest)"); matching staff to districts must compare the stripped label, or five workers land at the hub.
6. **Theme swaps are cheap when colours live in constants at the top of the renderer** (INK/INK2/PAPER/accent). The paper → dark swap was a 6-line replace.

## Dead ends
- A CSS `::after` "flat shadow" like the reference's became a slab over the graph; per-node ellipses under nodes read better than one page-level shape.
- `browse console --errors` showed nothing while the module had thrown. A duplicate `id="workforce"` (section + grid) made `innerHTML` wipe the section header, then a null `textContent` killed the script. **Test a module for errors with `import('/js/app.js?v=…').then(()=>'ok', e=>e.stack)` from the browse `js` command**, and never reuse an id between a section and the container inside it.
- Playwright's capture tool resolves `--out` relative to the cwd: running from `studies/` with `--out studies/x` lands in `studies/studies/x`.
- `taskkill` from Git Bash: `/F /PID` gets rewritten to `F:/`; `//F //PID` also fails. Killing via `netstat -ano` + PowerShell `Stop-Process` is unreliable in the sandbox; starting the new server after the old one died on its own worked. Use a unique port per iteration if it matters.

## Reusable rule
For any "live dashboard of agents": event log + SSE on a tiny server, UI reads only `/api/state` and the log, real numbers only from the log, forecast motion labelled and never counted, and test the page module with a second `import()` because console filters miss uncaught module errors.
