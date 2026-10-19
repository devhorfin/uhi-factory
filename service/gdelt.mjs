// GDELT 15-minute export reader (the raw zips on data.gdeltproject.org; never the rate-limited DOC/GEO APIs).
// Returns the latest events with a readable headline derived from the source URL slug.
import { inflateRawSync } from 'node:zlib';

const UA = { 'user-agent': 'Mozilla/5.0 (YOUR ROBOT news editor)' };

function unzipFirst(buf) {
  // Find the end-of-central-directory record, then the first local file header, and inflate it.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip: no EOCD');
  const cdOff = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cdOff + 10);
  const csize = buf.readUInt32LE(cdOff + 20);
  const nameLen = buf.readUInt16LE(cdOff + 28), extraLen = buf.readUInt16LE(cdOff + 30), cmtLen = buf.readUInt16LE(cdOff + 32);
  const localOff = buf.readUInt32LE(cdOff + 42);
  const lNameLen = buf.readUInt16LE(localOff + 26), lExtraLen = buf.readUInt16LE(localOff + 28);
  const start = localOff + 30 + lNameLen + lExtraLen;
  const data = buf.subarray(start, start + csize);
  void nameLen; void extraLen; void cmtLen;
  return method === 8 ? inflateRawSync(data) : data;
}

export function headlineFromUrl(u) {
  try {
    const url = new URL(u);
    const slug = url.pathname.split('/').filter(Boolean).pop() || '';
    const words = slug.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ').replace(/\b\d{4,}\b/g, '').replace(/\s+/g, ' ').trim();
    if (words.split(' ').length < 3) return null;
    return { title: words.charAt(0).toUpperCase() + words.slice(1), source: url.hostname.replace(/^www\./, '') };
  } catch { return null; }
}

/** Latest GDELT export: { stamp, events:[{code, actor1, actor2, tone, mentions, url, title, source, place}] } */
export async function latestEvents({ limit = 400 } = {}) {
  const lu = await (await fetch('https://data.gdeltproject.org/gdeltv2/lastupdate.txt', { headers: UA, signal: AbortSignal.timeout(20_000) })).text();
  const line = lu.split('\n').find((l) => l.includes('.export.CSV.zip'));
  if (!line) throw new Error('gdelt: no export line');
  const zipUrl = line.trim().split(/\s+/).pop();
  const stamp = (zipUrl.match(/(\d{14})\.export/) || [])[1];
  const buf = Buffer.from(await (await fetch(zipUrl, { headers: UA, signal: AbortSignal.timeout(40_000) })).arrayBuffer());
  const txt = unzipFirst(buf).toString('utf8');
  const events = [];
  for (const row of txt.split('\n')) {
    const c = row.split('\t');
    if (c.length < 60) continue;
    const h = headlineFromUrl(c[60]);
    if (!h) continue;
    events.push({ code: c[26], root: c[28], actor1: c[6], actor2: c[16], tone: +c[34], mentions: +c[31], articles: +c[32], url: c[60], title: h.title, source: h.source, place: c[52] || c[44] || '' });
  }
  events.sort((a, b) => b.mentions - a.mentions);
  return { stamp, zipUrl, total: events.length, events: events.slice(0, limit) };
}
