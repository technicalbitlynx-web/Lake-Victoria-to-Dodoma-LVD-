/*
 * Converts the MBALIKA2068 EPANET shapefile export (WGS84 / UTM 36S) into
 * lat/lng JSON consumed by the SCADA app: data/network/<layer>.json
 *
 * Run: node scripts/convert-shapefiles.mjs
 */
import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = String.raw`D:\Don Consult Ltd\Lake Victoria to Dodoma (LVD)\LVD_Shape_files_2\MBALIKA2068_EPANET_shapefiles`;
const OUT = join(process.cwd(), 'data', 'network');
mkdirSync(OUT, { recursive: true });

const utm36s = '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs';
const toLL = proj4(utm36s, 'WGS84');

const round = (v, d = 5) => Math.round(v * 10 ** d) / 10 ** d;

function projectCoords(coords) {
  // point
  if (typeof coords[0] === 'number') {
    const [lng, lat] = toLL.forward([coords[0], coords[1]]);
    return [round(lat), round(lng)]; // [lat, lng] for Leaflet
  }
  return coords.map(projectCoords);
}

const LAYERS = ['junctions', 'pipes', 'pumps', 'reservoirs', 'tanks', 'valves'];

for (const layer of LAYERS) {
  const base = join(SRC, `MBALIKA2068_${layer}`);
  const features = [];
  const fieldStats = {};
  const source = await shapefile.open(`${base}.shp`, `${base}.dbf`);
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const f = r.value;
    if (!f.geometry) continue;
    for (const k of Object.keys(f.properties ?? {})) fieldStats[k] = (fieldStats[k] ?? 0) + 1;
    features.push({
      ...f.properties,
      geom: projectCoords(f.geometry.coordinates),
      gtype: f.geometry.type,
    });
  }
  writeFileSync(join(OUT, `${layer}.json`), JSON.stringify(features));
  console.log(`${layer}: ${features.length} features · fields: ${Object.keys(fieldStats).join(', ')}`);
  if (features.length > 0) {
    const sample = { ...features[0] };
    sample.geom = Array.isArray(sample.geom[0]) ? `[${sample.geom.length} pts]` : sample.geom;
    console.log(`  sample: ${JSON.stringify(sample)}`);
  }
}
console.log('done →', OUT);
