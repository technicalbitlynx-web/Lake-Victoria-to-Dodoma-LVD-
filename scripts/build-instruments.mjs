/*
 * Generates src/data/instrumentRegister.json from the real site-identification
 * CSV. Every instrument maps to a genuine EPANET model node (2058 + 2068 IDs);
 * transducerElev_m is left null everywhere (it is NOT in the design documents —
 * see prompt §2.1) so the comparison engine refuses to compute head error until
 * a survey provides it.
 *
 * Derived from the Employer's Requirements instrument set:
 *  - booster stations: suction PT, delivery PT, delivery flow, pump run, current
 *  - reservoirs / PRs: radar level, inlet + outlet flow, inlet + outlet pressure
 *
 * Run: node scripts/build-instruments.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'data', 'source');
const OUT = join(process.cwd(), 'src', 'data');

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = []; let cur = '', q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch; }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}
const rows = parseCsv(readFileSync(join(SRC, 'site_identification.csv'), 'utf8'));
const profile = JSON.parse(readFileSync(join(OUT, 'hydraulicProfile.json'), 'utf8'));

/* chainage lookup from the profile (on-trunk sites only) */
const chainageByNode = new Map(profile.sites.map(s => [s.nodeId['2068'], s.chainage_m]));

/* short site codes */
function codeFor(name) {
  const n = name.replace(/ - UNCONFIRMED/, '');
  if (/Intake/.test(n)) return 'MBI';
  if (/WTP/.test(n)) return 'WTP';
  if (/Mabale B Balancing/.test(n)) return 'MBR';
  if (/Mabale B Primary/.test(n)) return 'MPR';
  if (/Shilembo/.test(n)) return 'SHI';
  if (/Wishiteleja/.test(n)) return 'WIS';
  if (/Sibiti/.test(n)) return 'SBT';
  if (/Kidaru/.test(n)) return 'KID';
  if (/Kisiriri/.test(n)) return 'KSR';
  if (/Kisana/.test(n)) return 'KSN';
  if (/Singida Branch/.test(n)) return 'SGB';
  if (/Singida PR/.test(n)) return 'SGP';
  if (/Kondoa/.test(n)) return 'KND';
  if (/Isalanda/.test(n)) return 'ISA';
  if (/Chemba/.test(n)) return 'CHB';
  if (/Mkwese/.test(n)) return 'MKW';
  if (/Bahi/.test(n)) return 'BAH';
  if (/Nghambala/.test(n)) return 'NGH';
  if (/Ntyuka/.test(n)) return 'NTY';
  if (/UDOM/.test(n)) return 'UDM';
  return n.slice(0, 3).toUpperCase();
}

/* booster pumping stations (fixed-head "Reservoir" nodes serving a rising main) */
const BOOSTERS = new Set(['Sibiti IBPS', 'Kidaru IBPS', 'Kisiriri IBPS', 'Singida Branch PS', 'Nghambala IBPS', 'Ntyuka IBPS']);

const instruments = [];
let seq = 0;
function add(inst) { instruments.push(inst); seq++; }

for (const r of rows) {
  const name = r.proposed_name.replace(/ - UNCONFIRMED/, '');
  const code = codeFor(name);
  const nid = { 2058: String(r.node_id_2058), 2068: String(r.node_id_2068) };
  const chainage = chainageByNode.get(nid['2068']) ?? null;
  const confidence = r.confidence;
  const isBooster = BOOSTERS.has(name);
  const base = { site: name, modelNodeId: nid, chainage_m: chainage, transducerElev_m: null, confidence };

  if (isBooster) {
    add({ ...base, tagId: `${code}_PT_SUC_001`, measurand: 'pressure', location: 'suction_manifold', units: 'bar', accuracyPctOfReading: 0.5 });
    add({ ...base, tagId: `${code}_PT_DEL_001`, measurand: 'pressure', location: 'delivery_manifold', units: 'bar', accuracyPctOfReading: 0.5 });
    add({ ...base, tagId: `${code}_FT_DEL_001`, measurand: 'flow', location: 'delivery_manifold', units: 'm3/h', accuracyPctOfReading: 0.5 });
    add({ ...base, tagId: `${code}_XS_RUN_001`, measurand: 'status', location: 'pump', units: '', accuracyPctOfReading: 0 });
    add({ ...base, tagId: `${code}_IT_MTR_001`, measurand: 'current', location: 'pump', units: 'A', accuracyPctOfReading: 1.0 });
  } else {
    // reservoirs, balancing reservoirs, primary reservoirs (Tank / source nodes)
    add({ ...base, tagId: `${code}_LT_TNK_001`, measurand: 'level', location: 'tank', units: 'm', accuracyPctOfReading: 0.5 });
    add({ ...base, tagId: `${code}_FT_INL_001`, measurand: 'flow', location: 'inlet', units: 'm3/h', accuracyPctOfReading: 0.5 });
    add({ ...base, tagId: `${code}_FT_OUT_001`, measurand: 'flow', location: 'outlet', units: 'm3/h', accuracyPctOfReading: 0.5 });
    add({ ...base, tagId: `${code}_PT_INL_001`, measurand: 'pressure', location: 'inlet', units: 'bar', accuracyPctOfReading: 0.5 });
    add({ ...base, tagId: `${code}_PT_OUT_001`, measurand: 'pressure', location: 'outlet', units: 'bar', accuracyPctOfReading: 0.5 });
  }
}

const out = {
  meta: {
    note: 'Instrument register bridging model nodes to physical tags. transducerElev_m is null everywhere — it is NOT in the design documents and must be surveyed. The comparison engine returns null (not a guess) for head error until it is provided.',
    conversionConstant_m_per_bar: 10.1972,   // m water at 4°C per bar, displayed in UI
    uploadCadenceMinutes: 5,                  // ER server upload rate
    generatedAt: new Date().toISOString(),
    instrumentCount: instruments.length,
    onTrunkCount: instruments.filter(i => i.chainage_m != null).length,
  },
  instruments,
};
writeFileSync(join(OUT, 'instrumentRegister.json'), JSON.stringify(out, null, 1));
console.log(`wrote instrumentRegister.json · ${instruments.length} instruments across ${rows.length} sites`);
console.log(`  boosters: ${[...BOOSTERS].length} · on-trunk instruments (plottable): ${out.meta.onTrunkCount}`);
console.log(`  measurands: ${[...new Set(instruments.map(i => i.measurand))].join(', ')}`);
