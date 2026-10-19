// The five staff robots of slice 0 + the Grader + the Night Watchman.
// A robot = { id, name, role, job, industry, every (ms), run(ctx) -> { summary, items, links, data, text?, llm? } }.
// Every run reads real inputs, keeps the links, and tags its own cost. Nothing is invented.
import { write, hasLLM, MODEL } from './llm.mjs';
import { latestEvents } from './gdelt.mjs';

const UA = { 'user-agent': 'Mozilla/5.0 (YOUR ROBOT staff)', accept: 'application/json' };
const MIN = 60_000, HOUR = 3_600_000;
async function getJSON(url, ms = 25_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function getText(url, ms = 25_000) {
  const r = await fetch(url, { headers: { 'user-agent': UA['user-agent'] }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
const fmtUsd = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`;
const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);

/* ---------- 1. Desk analyst (crypto markets) ---------- */
export const deskAnalyst = {
  id: 'desk', name: 'Desk analyst', role: 'DESK / ANALYST', industry: 'Markets and trading', every: 15 * MIN, writer: true,
  grade: 'outcome: price one hour later',
  async run() {
    const j = await getJSON('https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1');
    const pools = j.data.map((p) => {
      const a = p.attributes; const h1 = a.transactions.h1 || {};
      return { name: a.name, pool: a.address, price: +a.base_token_price_usd, liq: +a.reserve_in_usd, vol1h: +a.volume_usd.h1, buyers: h1.buyers || 0, sellers: h1.sellers || 0, ch1h: +(a.price_change_percentage?.h1 || 0), ch24: +(a.price_change_percentage?.h24 || 0), created: a.pool_created_at };
    });
    const ranked = pools.filter((p) => p.liq > 20_000).map((p) => ({ ...p, ratio: (p.buyers + 1) / (p.sellers + 1) })).sort((a, b) => b.ratio - a.ratio);
    const top = ranked.slice(0, 3);
    const items = top.map((p) => ({ label: p.name, value: `${p.buyers} buyers / ${p.sellers} sellers · liq ${fmtUsd(p.liq)} · 1h vol ${fmtUsd(p.vol1h)} · 1h ${p.ch1h > 0 ? '+' : ''}${p.ch1h.toFixed(1)}% · 24h ${p.ch24 > 0 ? '+' : ''}${p.ch24.toFixed(1)}%`, link: `https://www.geckoterminal.com/solana/pools/${p.pool}` }));
    let text = null, llm = null;
    if (hasLLM()) {
      const r = await write({
        system: 'You are a trading-desk analyst robot. Write 3 short sentences, plain words, no hype, no advice, no emojis. Name the pools exactly as given. Never invent numbers.',
        user: `Trending Solana pools right now, ranked by buyers-to-sellers in the last hour (liquidity over $20K):\n${top.map((p) => `${p.name}: ${p.buyers} buyers, ${p.sellers} sellers, liquidity ${fmtUsd(p.liq)}, 1h volume ${fmtUsd(p.vol1h)}, 1h change ${p.ch1h.toFixed(1)}%, 24h change ${p.ch24.toFixed(1)}%`).join('\n')}\nWrite the desk note.`,
        maxTokens: 220,
      });
      text = r.text; llm = r;
    }
    return { summary: `Top by buyers/sellers: ${top.map((p) => p.name.split(' / ')[0]).join(', ')}`, items, links: items.map((i) => i.link), data: { checked: pools.length, top }, text, llm, outcomeCheck: top.map((p) => ({ pool: p.pool, price: p.price })) };
  },
};

/* ---------- 2. Rug auditor (crypto markets) ---------- */
export const rugAuditor = {
  id: 'audit', name: 'Listing auditor', role: 'SECURITY / AUDITOR', industry: 'Markets and trading', every: 20 * MIN, writer: false,
  grade: 'hard check: report fields present',
  async run() {
    const j = await getJSON('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1');
    const fresh = j.data.slice(0, 6).map((p) => ({ name: p.attributes.name, mint: (p.relationships?.base_token?.data?.id || '').replace('solana_', ''), liq: +p.attributes.reserve_in_usd, pool: p.attributes.address }));
    const items = [];
    for (const f of fresh) {
      if (!f.mint) continue;
      try {
        const s = await getJSON(`https://api.rugcheck.xyz/v1/tokens/${f.mint}/report/summary`, 15_000);
        const risks = (s.risks || []).map((r) => r.name);
        const verdict = (s.score_normalised ?? s.score ?? 0) >= 50 || risks.some((r) => /mint|freeze|honeypot/i.test(r)) ? 'FAIL' : 'PASS';
        items.push({ label: f.name, value: `${verdict} · score ${s.score_normalised ?? s.score ?? '?'} · LP locked ${Math.round(s.lpLockedPct || 0)}% · ${risks.slice(0, 3).join(', ') || 'no flagged risks'}`, link: `https://rugcheck.xyz/tokens/${f.mint}`, verdict });
      } catch (e) { items.push({ label: f.name, value: `no report (${e.message.slice(0, 40)})`, link: `https://www.geckoterminal.com/solana/pools/${f.pool}`, verdict: 'NONE' }); }
      await new Promise((r) => setTimeout(r, 400));
    }
    const pass = items.filter((i) => i.verdict === 'PASS').length, fail = items.filter((i) => i.verdict === 'FAIL').length;
    return { summary: `${items.length} new pools checked: ${pass} pass, ${fail} fail`, items, links: items.map((i) => i.link), data: { pass, fail, none: items.length - pass - fail } };
  },
};

/* ---------- 3. Satellite tracker (space) ---------- */
export const satTracker = {
  id: 'sat', name: 'Satellite tracker', role: 'SPACE / TRACKER', industry: 'Space and aerospace', every: 10 * MIN, writer: false,
  grade: 'hard check: fresh timestamps',
  async run() {
    const iss = await getJSON('https://api.wheretheiss.at/v1/satellites/25544');
    const ll = await getJSON('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&format=json');
    const launches = (ll.results || []).map((l) => ({ name: l.name, net: l.net, status: l.status?.abbrev, provider: l.launch_service_provider?.name, pad: l.pad?.location?.name, url: l.url }));
    const next = launches[0];
    const items = [
      { label: 'ISS now', value: `${iss.latitude.toFixed(1)}°, ${iss.longitude.toFixed(1)}° · ${Math.round(iss.altitude)} km · ${Math.round(iss.velocity)} km/h · ${iss.visibility}`, link: 'https://wheretheiss.at/' },
      ...launches.slice(0, 4).map((l) => ({ label: l.name, value: `${l.provider} · ${l.net.replace('T', ' ').slice(0, 16)} UTC · ${l.status}`, link: `https://ll.thespacedevs.com/2.2.0/launch/${(l.url.match(/launch\/([^/]+)/) || [])[1] || ''}/` })),
    ];
    return { summary: next ? `Next launch: ${next.name} (${next.status}) · ISS over ${iss.latitude.toFixed(0)}°,${iss.longitude.toFixed(0)}°` : 'ISS position read', items, links: items.map((i) => i.link), data: { iss: { lat: iss.latitude, lon: iss.longitude, alt: iss.altitude, t: iss.timestamp }, launches } };
  },
};

/* ---------- 4. News editor (writing, media) ---------- */
export const newsEditor = {
  id: 'news', name: 'News editor', role: 'NEWS / EDITOR', industry: 'Writing, media and publishing', every: 60 * MIN, writer: true,
  grade: 'second robot: the Grader scores it',
  async run() {
    const g = await latestEvents({ limit: 300 });
    const beat = /\b(ai|artificial intelligence|robot|robots|automation|jobs|unemployment|layoff|layoffs|income|tesla|spacex|optimus|anthropic|openai|musk)\b/i;
    const onBeat = g.events.filter((e) => beat.test(e.title));
    const seen = new Set(); const picks = [];
    for (const e of onBeat) { const k = e.title.toLowerCase().slice(0, 40); if (seen.has(k)) continue; seen.add(k); picks.push(e); if (picks.length >= 8) break; }
    const items = picks.map((e) => ({ label: e.title, value: `${e.source} · ${e.mentions} mentions · tone ${e.tone.toFixed(1)}${e.place ? ' · ' + e.place : ''}`, link: e.url }));
    let text = null, llm = null;
    if (hasLLM() && picks.length) {
      const r = await write({
        system: 'You are a news editor robot on the beat "AI, robots and jobs". Write a 4-sentence brief in plain words from ONLY the headlines given (they are derived from URL slugs, so phrase carefully). No opinions, no advice, no emojis. Mention the source outlet for each fact you use.',
        user: `GDELT export ${g.stamp} (UTC). Headlines on the beat, by mentions:\n${picks.map((e) => `- ${e.title} (${e.source}, ${e.mentions} mentions)`).join('\n')}\nWrite the brief.`,
        maxTokens: 320,
      });
      text = r.text; llm = r;
    }
    return { summary: `${g.total} events in the ${g.stamp.slice(8, 10)}:${g.stamp.slice(10, 12)} UTC export, ${onBeat.length} on the beat, ${picks.length} picked`, items, links: items.map((i) => i.link).concat([g.zipUrl]), data: { stamp: g.stamp, total: g.total, onBeat: onBeat.length }, text, llm };
  },
};

/* ---------- 5. Lab researcher (science) ---------- */
export const labResearcher = {
  id: 'lab', name: 'Lab researcher', role: 'LAB / RESEARCHER', industry: 'Science and research', every: 6 * HOUR, writer: true,
  grade: 'second robot: the Grader scores it',
  async run() {
    const xml = await getText('https://export.arxiv.org/api/query?search_query=all:%22humanoid%20robot%22+OR+all:%22labor%20automation%22+OR+all:%22universal%20basic%20income%22&sortBy=submittedDate&sortOrder=descending&max_results=6');
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
      const e = m[1]; const g = (t) => ((e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '').replace(/\s+/g, ' ').trim();
      return { title: g('title'), summary: g('summary').slice(0, 600), id: g('id'), published: g('published'), authors: [...e.matchAll(/<name>(.*?)<\/name>/g)].map((a) => a[1]).slice(0, 3) };
    }).filter((e) => e.title);
    const items = entries.map((e) => ({ label: e.title, value: `${e.authors.join(', ')} · ${e.published.slice(0, 10)}`, link: e.id }));
    let text = null, llm = null;
    if (hasLLM() && entries.length) {
      const r = await write({
        system: 'You are a lab researcher robot. Write a one-paragraph digest (5 sentences max) of the papers given, plain words, with an evidence ladder: say which claims are measured, which are modelled, which are proposed. Cite each paper by its first author. No invented results.',
        user: entries.map((e) => `${e.authors[0] || 'anon'} et al., "${e.title}" (${e.published.slice(0, 10)}): ${e.summary}`).join('\n\n'),
        maxTokens: 400,
      });
      text = r.text; llm = r;
    }
    return { summary: `${entries.length} new arXiv papers on humanoids, automation and basic income`, items, links: items.map((i) => i.link), data: { count: entries.length }, text, llm };
  },
};

export const STAFF = [deskAnalyst, rugAuditor, satTracker, newsEditor, labResearcher];

/* ---------- The Grader (second robot) ---------- */
export async function gradeOutput(robot, out) {
  if (!hasLLM() || !out.text) return { score: null, note: 'no text to grade' };
  const r = await write({
    system: 'You are the Grader. Score a robot\'s note from 0 to 100 on: uses only the given facts (40), plain words (20), no hype or advice (20), every number matches the inputs (20). Reply as JSON: {"score": n, "note": "one sentence"}.',
    user: `Inputs:\n${out.items.map((i) => `- ${i.label}: ${i.value}`).join('\n')}\n\nRobot (${robot.name}) wrote:\n${out.text}`,
    maxTokens: 120,
  });
  let parsed = null; try { parsed = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] || ''); } catch {}
  return { score: parsed?.score ?? null, note: parsed?.note || r.text.slice(0, 140), llm: r };
}

export const MODEL_NAME = MODEL;
