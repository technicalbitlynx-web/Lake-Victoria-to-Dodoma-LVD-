/*
 * Compacts the converted EPANET layers into render-ready bundles:
 *   src/data/network/pipes-by-class.json  – multiline coordinate bundles per diameter class
 *   src/data/network/assets.json          – pumps, valves, tanks, reservoirs (+node lookup coords)
 *   src/data/network/junctions-key.json   – top demand junctions for display
 *   src/data/network/stats.json           – model inventory statistics
 *
 * Run: node scripts/build-network.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW = join(process.cwd(), 'data', 'network');
const OUT = join(process.cwd(), 'src', 'data', 'network');
mkdirSync(OUT, { recursive: true });

const load = n => JSON.parse(readFileSync(join(RAW, `${n}.json`), 'utf8'));

const junctions = load('junctions');
const pipes = load('pipes');
const pumps = load('pumps');
const reservoirs = load('reservoirs');
const tanks = load('tanks');
const valves = load('valves');

/* Node coordinate lookup (junctions + tanks + reservoirs) */
const nodeCoord = new Map();
for (const j of junctions) nodeCoord.set(String(j.NODE_ID), j.geom);
for (const t of tanks) nodeCoord.set(String(t.NODE_ID), t.geom);
for (const r of reservoirs) nodeCoord.set(String(r.NODE_ID), r.geom);

/* ── Pipe diameter classes ── */
const CLASSES = [
  { id: 'trunk', label: 'Trunk main ≥ DN1000', min: 1000, max: 1e9, color: '#4f8ef7', weight: 3 },
  { id: 'primary', label: 'Primary DN500–999', min: 500, max: 999.99, color: '#38bdf8', weight: 2 },
  { id: 'secondary', label: 'Secondary DN250–499', min: 250, max: 499.99, color: '#2dd4bf', weight: 1.4 },
  { id: 'distribution', label: 'Distribution DN100–249', min: 100, max: 249.99, color: '#64748b', weight: 0.9 },
  { id: 'reticulation', label: 'Reticulation < DN100', min: 0, max: 99.99, color: '#3f3f56', weight: 0.7 },
];

const classBundles = CLASSES.map(c => ({ ...c, count: 0, km: 0, lines: [] }));
const histogram = {};
for (const p of pipes) {
  const dn = p.DIAM_MM ?? 0;
  const bucket = dn >= 1000 ? '≥1000' : dn >= 500 ? '500–999' : dn >= 250 ? '250–499' : dn >= 100 ? '100–249' : '<100';
  histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  const cls = classBundles.find(c => dn >= c.min && dn <= c.max) ?? classBundles[classBundles.length - 1];
  cls.count++;
  cls.km += (p.LENGTH_M ?? 0) / 1000;
  // geometry: LineString [ [lat,lng], ... ]  (MultiLineString → flatten)
  if (p.gtype === 'LineString') cls.lines.push(p.geom);
  else if (p.gtype === 'MultiLineString') for (const seg of p.geom) cls.lines.push(seg);
}
for (const c of classBundles) c.km = Math.round(c.km * 10) / 10;

const nonEmpty = classBundles.filter(c => c.count > 0);
writeFileSync(join(OUT, 'pipes-by-class.json'), JSON.stringify(nonEmpty));
writeFileSync(join(OUT, 'pipe-classes-meta.json'), JSON.stringify(nonEmpty.map(({ lines, ...meta }) => meta)));

/* ── Assets ── */
function linkMidpoint(g, gtype) {
  const line = gtype === 'LineString' ? g : g[0];
  const a = line[0], b = line[line.length - 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

const assets = {
  pumps: pumps.map(p => ({
    id: String(p.LINK_ID), n1: String(p.NODE1), n2: String(p.NODE2),
    params: p.PARAMS, pos: linkMidpoint(p.geom, p.gtype),
  })),
  valves: valves.map(v => ({
    id: String(v.LINK_ID), n1: String(v.NODE1), n2: String(v.NODE2),
    dn: v.DIAM_MM, type: v.VLV_TYPE, setting: Math.round((v.SETTING ?? 0) * 100) / 100,
    pos: linkMidpoint(v.geom, v.gtype),
  })),
  tanks: tanks.map(t => ({
    id: String(t.NODE_ID), elev: t.ELEV_M, init: t.INIT_LVL, min: t.MIN_LVL, max: t.MAX_LVL,
    diam: t.DIAM_M, vol: t.VOL_M3, minVol: t.MIN_VOL, pos: t.geom,
  })),
  reservoirs: reservoirs.map(r => ({
    id: String(r.NODE_ID), head: r.HEAD_M, pos: r.geom,
  })),
};
writeFileSync(join(OUT, 'assets.json'), JSON.stringify(assets));

/* ── Key junctions: all with base demand > 0, capped to top 400 by demand ── */
const demandJ = junctions.filter(j => (j.DEMAND ?? 0) > 0).sort((a, b) => b.DEMAND - a.DEMAND);
const keyJunctions = demandJ.slice(0, 400).map(j => ({
  id: String(j.NODE_ID), elev: Math.round(j.ELEV_M * 10) / 10, demand: Math.round(j.DEMAND * 1000) / 1000, pos: j.geom,
}));
writeFileSync(join(OUT, 'junctions-key.json'), JSON.stringify(keyJunctions));

/* ── Stats ── */
const totalKm = pipes.reduce((a, p) => a + (p.LENGTH_M ?? 0), 0) / 1000;
const totalDemand = junctions.reduce((a, j) => a + (j.DEMAND ?? 0), 0);
const stats = {
  source: 'MBALIKA2068 EPANET model (WGS84 / UTM 36S shapefile export)',
  junctions: junctions.length,
  demandJunctions: demandJ.length,
  keyJunctionsShown: keyJunctions.length,
  pipes: pipes.length,
  pipeKm: Math.round(totalKm * 10) / 10,
  pumps: pumps.length,
  valves: valves.length,
  tanks: tanks.length,
  reservoirs: reservoirs.length,
  totalBaseDemand_lps: Math.round(totalDemand * 10) / 10,
  diameterHistogram: histogram,
  elevRange: [
    Math.round(Math.min(...junctions.map(j => j.ELEV_M ?? 1e9))),
    Math.round(Math.max(...junctions.map(j => j.ELEV_M ?? -1e9))),
  ],
  valveTypes: valves.reduce((a, v) => { a[v.VLV_TYPE] = (a[v.VLV_TYPE] ?? 0) + 1; return a; }, {}),
};
writeFileSync(join(OUT, 'stats.json'), JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
console.log('class sizes:', classBundles.map(c => `${c.id}:${c.count} (${c.km} km)`).join(' · '));
