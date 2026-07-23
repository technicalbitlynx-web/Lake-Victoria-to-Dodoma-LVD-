/*
 * Hydraulic long-section pipeline for the MBALIKA2068 EPANET network.
 *
 * NOTE ON INPUTS: the task prompt referenced Option_03 *.INP files (2058 + 2068
 * horizons) to be solved with wntr. Those .INP files are NOT present in the
 * project — only the 2068 EPANET *shapefile export* is available (already
 * converted to data/network/*.json). Therefore:
 *   - single horizon (2068) only;
 *   - model HGL is COMPUTED by piecewise hydraulic-gradient interpolation
 *     between the model's real fixed-head control nodes (source reservoir
 *     heads, tank water levels, and pump lifts), NOT a wntr steady-state solve.
 * Every plotted elevation traces to a real EPANET node; the HGL derivation
 * method is labelled as such in meta and surfaced in the UI.
 *
 * Route trace: undirected graph over pipes+pumps+valves, weighted by length
 * (pumps/valves weight 1.0), least-length path intake -> UDOM (Dijkstra).
 * Decimation: retain elevation extrema + named sites + negative-pressure nodes,
 * fill remainder with Largest-Triangle-Three-Buckets.
 *
 * Run: node scripts/build-profile.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW = join(process.cwd(), 'data', 'network');
const SRC = join(process.cwd(), 'data', 'source');
const OUTDIR = join(process.cwd(), 'src', 'data');
const load = n => JSON.parse(readFileSync(join(RAW, `${n}.json`), 'utf8'));

const junctions = load('junctions');
const pipes = load('pipes');
const pumps = load('pumps');
const valves = load('valves');
const reservoirs = load('reservoirs');
const tanks = load('tanks');

function fail(msg) { console.error(`\n  GATE FAILED: ${msg}\n`); process.exit(1); }
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/* ── parse site identification CSV ── */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map(line => {
    // handle quoted fields containing commas
    const cells = [];
    let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}
const siteRows = parseCsv(readFileSync(join(SRC, 'site_identification.csv'), 'utf8'));

/* ── node registry: id → { pos:[lat,lng], elev, kind } ── */
const nodes = new Map();
for (const j of junctions) nodes.set(String(j.NODE_ID), { pos: j.geom, elev: j.ELEV_M ?? 0, demand: j.DEMAND ?? 0, kind: 'junction' });
for (const t of tanks) nodes.set(String(t.NODE_ID), { pos: t.geom, elev: t.ELEV_M ?? 0, level: t.ELEV_M + (t.INIT_LVL ?? 0), kind: 'tank' });
for (const r of reservoirs) nodes.set(String(r.NODE_ID), { pos: r.geom, elev: r.HEAD_M ?? 0, level: r.HEAD_M ?? 0, kind: 'reservoir' });

/* diameter of the downstream pipe for each node (first outgoing pipe) */
const nodeDiam = new Map();
for (const p of pipes) {
  const a = String(p.NODE1), b = String(p.NODE2);
  if (!nodeDiam.has(a)) nodeDiam.set(a, p.DIAM_MM ?? 0);
  if (!nodeDiam.has(b)) nodeDiam.set(b, p.DIAM_MM ?? 0);
}

/* ── adjacency ── */
const adj = new Map();
const linkDiam = new Map();
function link(a, b, w, dn) {
  if (!nodes.has(a) || !nodes.has(b)) return;
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push([b, w]);
  adj.get(b).push([a, w]);
  linkDiam.set(`${a}|${b}`, dn); linkDiam.set(`${b}|${a}`, dn);
}
for (const p of pipes) link(String(p.NODE1), String(p.NODE2), Math.max(p.LENGTH_M ?? 1, 0.1), p.DIAM_MM ?? 0);
for (const p of pumps) link(String(p.NODE1), String(p.NODE2), 1, 0);
for (const v of valves) link(String(v.NODE1), String(v.NODE2), 1, v.DIAM_MM ?? 0);

/* GATE: single connected component reachable from the source */
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
function nearest(pos, ids) {
  let best = null, bd = Infinity;
  for (const id of ids) { const n = nodes.get(id); if (!n) continue; const d = dist2(pos, n.pos); if (d < bd) { bd = d; best = id; } }
  return best;
}

/* endpoints from the site CSV (2068 IDs) */
const byName = name => siteRows.find(r => r.proposed_name.includes(name));
const intakeId = String(byName('Intake').node_id_2068);
const udomId = String(byName('UDOM').node_id_2068);
const nghambalaId = String(byName('Nghambala').node_id_2068);
const ntyukaId = String(byName('Ntyuka').node_id_2068);
const wtpId = String(byName('WTP').node_id_2068);

/* the intake/wtp/ibps are reservoir/pump-adjacent; snap endpoints to a graph node */
function graphNodeNear(id) {
  if (adj.has(id)) return id;
  const n = nodes.get(id); if (!n) return null;
  // nearest node that has graph edges
  let best = null, bd = Infinity;
  for (const [gid] of adj) { const gn = nodes.get(gid); if (!gn) continue; const d = dist2(n.pos, gn.pos); if (d < bd) { bd = d; best = gid; } }
  return best;
}
const startId = graphNodeNear(intakeId);
const endId = graphNodeNear(udomId);
console.log(`endpoints: intake ${intakeId}→${startId} · UDOM ${udomId}→${endId}`);

/* ── Dijkstra (binary heap) ── */
function dijkstra(src, dst) {
  const d = new Map([[src, 0]]);
  const prev = new Map();
  const heap = [[0, src]];
  const swap = (i, j) => { [heap[i], heap[j]] = [heap[j], heap[i]]; };
  const up = i => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; swap(i, p); i = p; } };
  const down = i => { for (;;) { let s = i, l = 2 * i + 1, r = l + 1; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; swap(i, s); i = s; } };
  const push = x => { heap.push(x); up(heap.length - 1); };
  const pop = () => { const t = heap[0]; const l = heap.pop(); if (heap.length) { heap[0] = l; down(0); } return t; };
  const seen = new Set();
  while (heap.length) {
    const [du, u] = pop();
    if (seen.has(u)) continue;
    seen.add(u);
    if (u === dst) break;
    for (const [v, w] of adj.get(u) ?? []) {
      const nd = du + w;
      if (nd < (d.get(v) ?? Infinity)) { d.set(v, nd); prev.set(v, u); push([nd, v]); }
    }
  }
  return { d, prev, seen };
}
const { d, prev, seen } = dijkstra(startId, endId);
if (!prev.has(endId) && startId !== endId) fail('no path intake → UDOM (network not connected)');
console.log(`connectivity: ${seen.size.toLocaleString()} nodes reachable from intake of ${nodes.size.toLocaleString()} total`);

/* reconstruct path */
const pathIds = [];
for (let u = endId; u !== undefined; u = prev.get(u)) { pathIds.push(u); if (u === startId) break; }
pathIds.reverse();

/* GATE: node count */
if (pathIds.length < 20000 || pathIds.length > 28000) fail(`traced path ${pathIds.length} nodes, outside 20,000–28,000`);

/* build ordered series with chainage */
const path = pathIds.map(id => ({ id, ...nodes.get(id), km: (d.get(id) ?? 0) / 1000 }));
const pathKm = path[path.length - 1].km;

/* GATE: length 615–625 km */
if (pathKm < 615 || pathKm > 625) fail(`traced length ${pathKm.toFixed(1)} km, outside 615–625 (DDR 619.4 + intake leg)`);

/* GATE: passes through the 5 key sites in geographic order */
function pathIndexNear(nodeId) {
  const n = nodes.get(nodeId); if (!n) return -1;
  let bi = -1, bd = Infinity;
  for (let i = 0; i < path.length; i++) { const dd = dist2(n.pos, path[i].pos); if (dd < bd) { bd = dd; bi = i; } }
  return { i: bi, distDeg: Math.sqrt(bd) };
}
const keyOrder = [intakeId, wtpId, nghambalaId, ntyukaId, udomId];
const keyIdx = keyOrder.map(pathIndexNear);
for (let k = 1; k < keyIdx.length; k++) {
  if (keyIdx[k].i < keyIdx[k - 1].i) fail(`key sites out of geographic order at index ${k}`);
}
console.log('key-site order OK: ' + keyIdx.map((k, i) => `${keyOrder[i]}@${path[k.i].km.toFixed(0)}km`).join(' → '));

/* ── HGL control nodes: fixed-head anchors along the route ──
 * source/tank water levels are true model values; pump lifts are inferred so
 * the rising main reaches the downstream tank/reservoir level. */
const controlSites = siteRows.map(r => {
  const id2068 = String(r.node_id_2068);
  const ix = pathIndexNear(id2068);
  return {
    name: r.proposed_name.replace(/ - UNCONFIRMED$/, ''),
    id: id2068,
    idx: ix.i, km: path[ix.i]?.km ?? 0, snapDeg: ix.distDeg,
    level: parseFloat(r.model_level_m),
    type: r.type, confidence: r.confidence,
    unconfirmed: /UNCONFIRMED/.test(r.proposed_name) || r.confidence === 'Low',
  };
}).filter(s => s.idx >= 0 && s.snapDeg < 0.05)     // only sites that lie on the trunk
  .sort((a, b) => a.km - b.km);

/* control HGL points: use the water level of each control site as HGL anchor.
 * (A pump station's discharge HGL ~ the downstream tank level it serves, which
 * the linear interpolation between anchors reproduces as a lift at the station.) */
const anchors = [];
{
  // intake source at chainage 0
  const src = nodes.get(intakeId);
  anchors.push({ km: 0, hgl: (src.level ?? src.elev), name: 'Mbalika Intake' });
  for (const s of controlSites) {
    if (Number.isFinite(s.level)) anchors.push({ km: s.km, hgl: s.level, name: s.name });
  }
  // terminal
  const udom = nodes.get(udomId);
  anchors.push({ km: pathKm, hgl: (udom.level ?? udom.elev), name: 'UDOM' });
  anchors.sort((a, b) => a.km - b.km);
}

/* piecewise-linear base HGL(km) between fixed-head anchors */
function baseHglAt(km) {
  if (km <= anchors[0].km) return anchors[0].hgl;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (km >= a.km && km <= b.km) {
      const f = (km - a.km) / (b.km - a.km || 1);
      return a.hgl + (b.hgl - a.hgl) * f;
    }
  }
  return anchors[anchors.length - 1].hgl;
}

/* ── full-resolution series ──
 * HGL = max( linear energy line between anchors , terrain + MIN_RESIDUAL ).
 * The clamp reflects that a pressurised transmission main must carry at least
 * a minimum residual head over every high point; where the raw energy line
 * would fall below that, the location is a HIGH POINT (air-valve candidate).
 * No solved negative-pressure data exists (INP absent), so we surface high
 * points rather than fabricate negative pressures. */
/* model flow basis by mass balance: trunk flow past a chainage = sum of the
 * model demand of every offtake that tees off the trunk downstream of it.
 * Demand nodes sit on branch stubs, so each is projected onto the trunk at its
 * nearest path node (its tee chainage). A real model-derived quantity. */
const cumDemandLps = new Array(path.length).fill(0);
{
  const demandNodes = junctions.filter(j => (j.DEMAND ?? 0) > 0);
  const tees = demandNodes.map(j => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < path.length; i++) { const dd = dist2(j.geom, path[i].pos); if (dd < bd) { bd = dd; bi = i; } }
    return { km: path[bi].km, demand: j.DEMAND };
  });
  for (let i = 0; i < path.length; i++) {
    let sum = 0;
    for (const t of tees) if (t.km >= path[i].km - 1e-6) sum += t.demand;
    cumDemandLps[i] = sum;
  }
  console.log(`flow basis: ${demandNodes.length} demand offtakes teed onto trunk · intake flow ${Math.round(cumDemandLps[0] * 3.6).toLocaleString()} m³/h`);
}

const MIN_RESIDUAL = 5; // m water column
const full = path.map((p, i) => {
  const nextId = path[i + 1]?.id;
  const dn = (nextId && linkDiam.get(`${p.id}|${nextId}`)) || nodeDiam.get(p.id) || 0;
  const base = baseHglAt(p.km);
  const minHgl = p.elev + MIN_RESIDUAL;
  const head = Math.max(base, minHgl);
  const pressure = head - p.elev;
  return {
    chainage_m: Math.round(p.km * 1000),
    elev_m: round(p.elev, 1),
    head_m: round(head, 1),
    pressure_m: round(pressure, 1),
    flow_m3h: Math.round(cumDemandLps[i] * 3.6),
    diam_mm: Math.round(dn),
    highPoint: base < minHgl,      // energy line clipped → local high point
    idx: i,
  };
});

const hpCount = full.filter(f => f.highPoint).length;
const minPressure = Math.min(...full.map(f => f.pressure_m));
console.log(`pressure: ${hpCount.toLocaleString()} high-point nodes (residual-clamped) · min ${minPressure.toFixed(1)} m`);

/* ── decimation: significant extrema + sites + high points retained, LTTB fill ── */
const N = full.length;
const keep = new Set([0, N - 1]);
// significant local elevation extrema (prominence ≥ 1.5 m rejects survey noise)
const PROM = 1.5;
for (let i = 1; i < N - 1; i++) {
  const a = full[i - 1].elev_m, b = full[i].elev_m, c = full[i + 1].elev_m;
  const isMax = b >= a && b >= c && (b - Math.min(a, c)) >= PROM;
  const isMin = b <= a && b <= c && (Math.max(a, c) - b) >= PROM;
  if (isMax || isMin) keep.add(i);
}
// named sites
for (const s of controlSites) keep.add(s.idx);
keep.add(keyIdx[0].i); keep.add(keyIdx[4].i);
// high-point cluster representatives (peak of each contiguous high-point run)
for (let i = 0; i < N; i++) {
  if (!full[i].highPoint) continue;
  let j = i; while (j < N && full[j].highPoint) j++;
  let peak = i; for (let k = i; k < j; k++) if (full[k].elev_m > full[peak].elev_m) peak = k;
  keep.add(peak);
  i = j;
}

/* LTTB fill — fixed budget so long ramps between extrema are always sampled */
const TARGET = 3000;
function lttb(indices, threshold) {
  if (threshold >= indices.length || threshold < 3) return indices.slice();
  const sampled = [indices[0]];
  const every = (indices.length - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    let avgX = 0, avgY = 0, start = Math.floor((i + 1) * every) + 1, end = Math.floor((i + 2) * every) + 1;
    end = Math.min(end, indices.length);
    const cnt = end - start;
    for (let j = start; j < end; j++) { avgX += full[indices[j]].chainage_m; avgY += full[indices[j]].elev_m; }
    avgX /= cnt || 1; avgY /= cnt || 1;
    const rangeStart = Math.floor(i * every) + 1, rangeEnd = Math.floor((i + 1) * every) + 1;
    const pax = full[indices[a]].chainage_m, pay = full[indices[a]].elev_m;
    let maxArea = -1, next = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((pax - avgX) * (full[indices[j]].elev_m - pay) - (pax - full[indices[j]].chainage_m) * (avgY - pay));
      if (area > maxArea) { maxArea = area; next = j; }
    }
    sampled.push(indices[next]); a = next;
  }
  sampled.push(indices[indices.length - 1]);
  return sampled;
}
const allIdx = Array.from({ length: N }, (_, i) => i);
const lttbPts = lttb(allIdx, TARGET);   // shape-preserving fill
for (const i of lttbPts) keep.add(i);

/* Douglas-Peucker error-bounded top-up: guarantees vertical error ≤ EPS by
 * inserting the max-deviation interior point of any gap that exceeds it. */
const EPS = 1.8;
function dpTopUp() {
  let kept = [...keep].sort((a, b) => a - b);
  const stack = [];
  for (let s = 0; s < kept.length - 1; s++) stack.push([kept[s], kept[s + 1]]);
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = full[a].chainage_m, ay = full[a].elev_m, bx = full[b].chainage_m, by = full[b].elev_m;
    const span = bx - ax || 1;
    let maxDev = 0, worst = -1;
    for (let i = a + 1; i < b; i++) {
      const t = (full[i].chainage_m - ax) / span;
      const est = ay + (by - ay) * t;
      const dev = Math.abs(est - full[i].elev_m);
      if (dev > maxDev) { maxDev = dev; worst = i; }
    }
    if (maxDev > EPS && worst > 0) { keep.add(worst); stack.push([a, worst], [worst, b]); }
  }
}
dpTopUp();

const keptIdx = [...keep].sort((a, b) => a - b);

/* max vertical error: reconstruct elev by linear interpolation over kept pts */
function reconstructErr() {
  let maxErr = 0, ki = 0;
  for (let i = 0; i < N; i++) {
    while (ki < keptIdx.length - 1 && keptIdx[ki + 1] <= i) ki++;
    const a = full[keptIdx[ki]], b = full[keptIdx[Math.min(ki + 1, keptIdx.length - 1)]];
    const span = b.chainage_m - a.chainage_m;
    const t = span === 0 ? 0 : (full[i].chainage_m - a.chainage_m) / span;
    const est = a.elev_m + (b.elev_m - a.elev_m) * t;
    maxErr = Math.max(maxErr, Math.abs(est - full[i].elev_m));
  }
  return maxErr;
}
const maxErr = reconstructErr();
console.log(`decimation: ${N.toLocaleString()} → ${keptIdx.length.toLocaleString()} pts (ratio ${(N / keptIdx.length).toFixed(1)}x) · max vertical err ${maxErr.toFixed(2)} m`);
if (maxErr > 2) fail(`decimation vertical error ${maxErr.toFixed(2)} m exceeds 2 m budget`);

/* ── emit parallel typed arrays ── */
const chainage_m = [], elev_m = [], head_m = [], pressure_m = [], flow_m3h = [], diam_mm = [], hpFlags = [];
for (const i of keptIdx) {
  const f = full[i];
  chainage_m.push(f.chainage_m); elev_m.push(f.elev_m); head_m.push(f.head_m);
  pressure_m.push(f.pressure_m); flow_m3h.push(f.flow_m3h); diam_mm.push(f.diam_mm); hpFlags.push(f.highPoint ? 1 : 0);
}

/* map site indices into decimated-array positions */
const idxToDeci = new Map(keptIdx.map((orig, pos) => [orig, pos]));
function nearestDeciPos(origIdx) {
  if (idxToDeci.has(origIdx)) return idxToDeci.get(origIdx);
  let best = 0, bd = Infinity;
  for (let p = 0; p < keptIdx.length; p++) { const dd = Math.abs(keptIdx[p] - origIdx); if (dd < bd) { bd = dd; best = p; } }
  return best;
}

const sitesOut = controlSites.map(s => ({
  name: s.name,
  nodeId: { 2058: String(siteRows.find(r => r.proposed_name.startsWith(s.name.split(' ')[0]))?.node_id_2058 ?? ''), 2068: s.id },
  chainage_m: Math.round(s.km * 1000),
  elev_m: round(nodes.get(s.id).elev, 1),
  level_m: round(s.level, 1),
  type: s.type,
  confidence: s.confidence,
  unconfirmed: s.unconfirmed,
  deciPos: nearestDeciPos(s.idx),
}));

/* high-point cluster reps for air-valve overlay markers */
const anomalies = [];
for (let p = 0; p < hpFlags.length; p++) {
  if (!hpFlags[p]) continue;
  let q = p; while (q < hpFlags.length && hpFlags[q]) q++;
  let peak = p; for (let k = p; k < q; k++) if (elev_m[k] > elev_m[peak]) peak = k;
  anomalies.push({ deciPos: peak, chainage_m: chainage_m[peak], elev_m: elev_m[peak], pressure_m: pressure_m[peak] });
  p = q;
}

const diamsPresent = [...new Set(diam_mm)].sort((a, b) => b - a);

const out = {
  meta: {
    source: 'MBALIKA2068 EPANET shapefile export (WGS84/UTM 36S)',
    horizon: '2068',
    note: 'INP files unavailable in project; model HGL COMPUTED by piecewise hydraulic-gradient interpolation between real model fixed-head control nodes (reservoir heads, tank levels, pump lifts) — NOT a wntr steady-state EPANET solve. Every elevation traces to a real model node.',
    hglMethod: 'piecewise-gradient-interpolation, feasibility-clamped to +5 m residual over high points',
    minResidual_m: MIN_RESIDUAL,
    tracedLength_km: round(pathKm, 2),
    fullNodes: N,
    decimatedPoints: keptIdx.length,
    compressionRatio: round(N / keptIdx.length, 1),
    decimationMethod: `elevation extrema (prominence ≥ ${PROM} m) + LTTB shape fill + Douglas-Peucker top-up (ε=${EPS} m)`,
    maxVerticalError_m: round(maxErr, 2),
    highPointNodes: hpCount,
    minPressure_m: round(minPressure, 1),
    elevRange_m: [Math.round(Math.min(...elev_m)), Math.round(Math.max(...elev_m))],
    diametersPresent_mm: diamsPresent,
    generatedAt: new Date().toISOString(),
  },
  chainage_m, elev_m, head_m, pressure_m, flow_m3h, diam_mm, hpFlags,
  sites: sitesOut,
  anomalies,
};
writeFileSync(join(OUTDIR, 'hydraulicProfile.json'), JSON.stringify(out));
console.log(`\nwrote src/data/hydraulicProfile.json · ${sitesOut.length} sites (${sitesOut.filter(s => s.unconfirmed).length} low-confidence) · ${anomalies.length} anomalies`);
console.log('sites:', sitesOut.map(s => `${s.name}${s.unconfirmed ? '⚠' : ''}@${(s.chainage_m / 1000).toFixed(0)}km`).join(', '));
