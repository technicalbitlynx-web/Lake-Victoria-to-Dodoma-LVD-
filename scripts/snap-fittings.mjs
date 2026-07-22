/*
 * Positions SCADA fittings on the real MBALIKA2068 EPANET network:
 *  1. Builds the pipe graph and traces the main path (Mbalika intake → UDOM)
 *     with Dijkstra, giving true chainage + elevation along the alignment.
 *  2. Generates air valves at local HIGH points and washouts at local LOW
 *     points of the real elevation profile.
 *  3. Snaps every SCADA site to its most appropriate model node
 *     (reservoir sites → tanks, offtakes → demand junctions, intake → source,
 *      pump stations → pump-link nodes) and rewrites data/sites.json coords.
 *  4. Repositions the in-line PRV stations onto the traced path.
 *
 * Output: src/data/network/snap.json  (+ updated data/sites.json)
 * Run: node scripts/snap-fittings.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW = join(process.cwd(), 'data', 'network');
const load = n => JSON.parse(readFileSync(join(RAW, `${n}.json`), 'utf8'));

const junctions = load('junctions');
const pipes = load('pipes');
const pumps = load('pumps');
const reservoirs = load('reservoirs');
const tanks = load('tanks');
const valves = load('valves');
const sites = JSON.parse(readFileSync(join(process.cwd(), 'data', 'sites.json'), 'utf8'));

/* ── node registry: id → { pos:[lat,lng], elev } ── */
const nodes = new Map();
for (const j of junctions) nodes.set(String(j.NODE_ID), { pos: j.geom, elev: j.ELEV_M ?? 0 });
for (const t of tanks) nodes.set(String(t.NODE_ID), { pos: t.geom, elev: t.ELEV_M ?? 0 });
for (const r of reservoirs) nodes.set(String(r.NODE_ID), { pos: r.geom, elev: r.HEAD_M ?? 0 });

/* ── adjacency (pipes + pump links + valve links) ── */
const adj = new Map();
function link(a, b, w) {
  if (!nodes.has(a) || !nodes.has(b)) return;
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push([b, w]);
  adj.get(b).push([a, w]);
}
for (const p of pipes) link(String(p.NODE1), String(p.NODE2), Math.max(p.LENGTH_M ?? 1, 0.1));
for (const p of pumps) link(String(p.NODE1), String(p.NODE2), 1);
for (const v of valves) link(String(v.NODE1), String(v.NODE2), 1);

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

function nearestNode(pos, candidates) {
  let best = null, bd = Infinity;
  for (const id of candidates) {
    const n = nodes.get(id);
    if (!n) continue;
    const d = dist2(pos, n.pos);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

const allIds = [...nodes.keys()];
const tankIds = tanks.map(t => String(t.NODE_ID));
const sourceIds = reservoirs.map(r => String(r.NODE_ID));
const demandIds = junctions.filter(j => (j.DEMAND ?? 0) > 0).map(j => String(j.NODE_ID));
const pumpNodeIds = [...new Set(pumps.flatMap(p => [String(p.NODE1), String(p.NODE2)]))];

/* ── Dijkstra main path: intake source → UDOM tank ── */
const intakeSite = sites.find(s => s.id === 'MBALIKA_INTAKE');
const udomSite = sites.find(s => s.id === 'UDOM_BR');
const startId = nearestNode([intakeSite.lat, intakeSite.lng], sourceIds);
const endId = nearestNode([udomSite.lat, udomSite.lng], [...tankIds, ...allIds.slice(0, 0)]) ?? nearestNode([udomSite.lat, udomSite.lng], allIds);

console.log('path endpoints:', startId, '→', endId);

function dijkstra(src) {
  const d = new Map([[src, 0]]);
  const prev = new Map();
  // simple binary heap
  const heap = [[0, src]];
  const pop = () => { heap.sort((a, b) => a[0] - b[0]); return heap.shift(); };
  const seen = new Set();
  while (heap.length) {
    const [du, u] = pop();
    if (seen.has(u)) continue;
    seen.add(u);
    if (u === endId) break;
    for (const [v, w] of adj.get(u) ?? []) {
      const nd = du + w;
      if (nd < (d.get(v) ?? Infinity)) { d.set(v, nd); prev.set(v, u); heap.push([nd, v]); }
    }
  }
  return { d, prev };
}
const { d, prev } = dijkstra(startId);
if (!prev.has(endId) && startId !== endId) {
  console.error('NO PATH FOUND — check connectivity'); process.exit(1);
}

/* reconstruct ordered path with chainage */
const pathIds = [];
for (let u = endId; u !== undefined; u = prev.get(u)) { pathIds.push(u); if (u === startId) break; }
pathIds.reverse();
const path = pathIds.map(id => ({ id, pos: nodes.get(id).pos, elev: nodes.get(id).elev, km: (d.get(id) ?? 0) / 1000 }));
const pathKm = path[path.length - 1].km;
console.log(`main path: ${path.length} nodes · ${pathKm.toFixed(1)} km · elev ${Math.min(...path.map(p => p.elev)).toFixed(0)}–${Math.max(...path.map(p => p.elev)).toFixed(0)} masl`);

/* smooth elevation (±1 km window) */
const smoothed = path.map((p, i) => {
  let sum = 0, n = 0;
  for (let j = i; j >= 0 && path[j].km > p.km - 1; j--) { sum += path[j].elev; n++; }
  for (let j = i + 1; j < path.length && path[j].km < p.km + 1; j++) { sum += path[j].elev; n++; }
  return sum / n;
});

/* local extrema with spacing + prominence */
function extrema(kind, minSpacingKm, maxCount) {
  const cand = [];
  const W = 60; // index window for local test
  for (let i = W; i < path.length - W; i += 4) {
    const v = smoothed[i];
    let isExt = true;
    for (let j = i - W; j <= i + W; j += 4) {
      if (kind === 'max' ? smoothed[j] > v : smoothed[j] < v) { isExt = false; break; }
    }
    if (isExt && path[i].km > 8 && path[i].km < pathKm - 8) cand.push(i);
  }
  // de-duplicate by spacing, prefer stronger extremes
  cand.sort((a, b) => (kind === 'max' ? smoothed[b] - smoothed[a] : smoothed[a] - smoothed[b]));
  const chosen = [];
  for (const i of cand) {
    if (chosen.every(c => Math.abs(path[c].km - path[i].km) >= minSpacingKm)) chosen.push(i);
    if (chosen.length >= maxCount) break;
  }
  return chosen.sort((a, b) => path[a].km - path[b].km);
}

const hglAt = i => {
  // crude local HGL: highest smoothed elevation within ±40 km + 40 m driving head
  let hi = 0;
  for (let j = 0; j < path.length; j += 6) {
    if (Math.abs(path[j].km - path[i].km) <= 40) hi = Math.max(hi, smoothed[j]);
  }
  return hi + 40;
};
const pressureAt = i => Math.max(1.5, Math.min(40, (hglAt(i) - path[i].elev) / 10.2));

const airIdx = extrema('max', 25, 12);
const woIdx = extrema('min', 30, 8);

const lineFittings = [
  ...airIdx.map((i, n) => ({
    id: `V-ARV-${String(n + 1).padStart(2, '0')}`,
    type: 'ARV',
    name: `Air Valve AV-${String(n + 1).padStart(2, '0')} (high point km ${path[i].km.toFixed(0)})`,
    chainage_km: Math.round(path[i].km * 10) / 10,
    lat: path[i].pos[0], lng: path[i].pos[1],
    elev: Math.round(path[i].elev), nodeId: path[i].id,
    basePressure_bar: Math.round(pressureAt(i) * 10) / 10,
  })),
  ...woIdx.map((i, n) => ({
    id: `V-WO-${String(n + 1).padStart(2, '0')}`,
    type: 'WO',
    name: `Washout WO-${String(n + 1).padStart(2, '0')} (low point km ${path[i].km.toFixed(0)})`,
    chainage_km: Math.round(path[i].km * 10) / 10,
    lat: path[i].pos[0], lng: path[i].pos[1],
    elev: Math.round(path[i].elev), nodeId: path[i].id,
    basePressure_bar: Math.round(pressureAt(i) * 10) / 10,
  })),
];

/* in-line PRV stations: keep their relative position along the alignment */
function pathPointAt(km) {
  let best = path[0];
  for (const p of path) if (Math.abs(p.km - km) < Math.abs(best.km - km)) best = p;
  return best;
}
const PRV_STATIONS = [
  ['V-GM1-PRV1', 120], ['V-GM1-PRV2', 175], ['V-GM2-PRV1', 400], ['V-GM2-PRV2', 520], ['V-UDM-PRV', 598],
];
const lineOverrides = {};
for (const [id, oldKm] of PRV_STATIONS) {
  const p = pathPointAt((oldKm / 600) * pathKm);
  lineOverrides[id] = {
    lat: p.pos[0], lng: p.pos[1], elev: Math.round(p.elev),
    chainage_km: Math.round(p.km * 10) / 10, nodeId: p.id,
  };
}

/* ── snap SCADA sites to the most appropriate model nodes ──
 * Trunk stations are located by their DDR chainage scaled onto the traced
 * path, then matched to the nearest node of the right kind (tank / source /
 * pump-link node). Branch sites match by proximity + elevation similarity.
 * Every site gets a UNIQUE node so stations never collapse onto one point. */
const TRUNK_SITES = new Set(['MBALIKA_INTAKE', 'MBALIKA_WTP', 'MABALE_IBPS', 'MABALE_BR',
  'SIBITI_IBPS1', 'KIDARU_IBPS2', 'KISIRIRI_IBPS3', 'KISANA_BR', 'KWAMTORO_JCT',
  'NGHAMBALA_IBPS', 'NTYUKA_IBPS', 'UDOM_BR']);

const used = new Set();

/* score candidates by distance (degrees) + elevation mismatch; pick best unused */
function pickUnique(candidateIds, pos, siteElev) {
  let best = null, bs = Infinity;
  for (const id of candidateIds) {
    if (used.has(id)) continue;
    const n = nodes.get(id);
    if (!n) continue;
    let score = Math.sqrt(dist2(pos, n.pos));
    if (siteElev != null) score += Math.abs(n.elev - siteElev) / 1500;
    if (score < bs) { bs = score; best = id; }
  }
  return { id: best, score: bs };
}

const siteSnap = {};
for (const s of [...sites].sort((a, b) => a.chainage_km - b.chainage_km)) {
  let pos, searchRadius;
  if (TRUNK_SITES.has(s.id)) {
    const pp = pathPointAt((s.chainage_km / 600) * pathKm);
    pos = pp.pos;
    searchRadius = 0.35;                      // trunk anchor is reliable
  } else {
    pos = [s.lat, s.lng];
    searchRadius = 0.6;                       // branch sites: approximate coords
  }

  let candidates;
  if (s.class === 'RESERVOIR') candidates = tankIds;
  else if (s.class === 'INTAKE') candidates = sourceIds;
  else if (s.class.startsWith('OFFTAKE') && s.class !== 'OFFTAKE_DUAL') candidates = demandIds;
  else if (s.id === 'KONDOA_PR' || s.id === 'CHEMBA_PR') candidates = [...tankIds, ...demandIds];
  else if (s.class === 'IBPS' || s.class === 'WTP') candidates = pumpNodeIds;
  else candidates = null;                     // OFFTAKE_DUAL junction → path node

  let id = null;
  if (candidates) {
    const r = pickUnique(candidates, pos, s.elevation_masl ?? null);
    if (r.id && r.score < searchRadius) id = r.id;
  }
  if (!id) {
    // fall back to the exact path point (trunk) or nearest unused node (branch)
    if (TRUNK_SITES.has(s.id)) {
      const pp = pathPointAt((s.chainage_km / 600) * pathKm);
      id = used.has(pp.id) ? pickUnique(allIds, pp.pos, null).id : pp.id;
    } else {
      id = pickUnique(allIds, pos, null).id;
    }
  }
  used.add(id);
  const n = nodes.get(id);
  siteSnap[s.id] = { lat: n.pos[0], lng: n.pos[1], elev: Math.round(n.elev), nodeId: id };
  s.lat = n.pos[0];
  s.lng = n.pos[1];
}

writeFileSync(join(process.cwd(), 'data', 'sites.json'), JSON.stringify(sites, null, 2));
writeFileSync(join(process.cwd(), 'src', 'data', 'network', 'snap.json'), JSON.stringify({
  pathKm: Math.round(pathKm * 10) / 10,
  sites: siteSnap,
  lineOverrides,
  lineFittings,
}, null, 1));

console.log(`ARVs: ${airIdx.length} @ km ${airIdx.map(i => path[i].km.toFixed(0)).join(', ')}`);
console.log(`WOs:  ${woIdx.length} @ km ${woIdx.map(i => path[i].km.toFixed(0)).join(', ')}`);
console.log('site snaps:');
for (const s of sites) console.log(`  ${s.id} → ${siteSnap[s.id].nodeId} (${siteSnap[s.id].elev} masl)`);
