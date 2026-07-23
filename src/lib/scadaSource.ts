/*
 * SCADA adapter. One interface, one synthetic implementation now, room for a
 * real driver later. The scheme is in design — no plant, no live SCADA — so
 * every reading is flagged `synthetic: true` all the way to the UI.
 */
import profileData from '../data/hydraulicProfile.json';
import registerData from '../data/instrumentRegister.json';

export type Quality = 'good' | 'stale' | 'uncertain' | 'comms_fail' | 'out_of_range';

export interface ScadaReading {
  tagId: string;
  value: number;
  units: string;
  timestamp: string;       // ISO-8601
  quality: Quality;
  synthetic: boolean;
}

export interface ScadaSource {
  latest(tagIds: string[]): Promise<ScadaReading[]>;
  history(tagId: string, fromIso: string, toIso: string): Promise<ScadaReading[]>;
}

export interface Instrument {
  tagId: string;
  site: string;
  measurand: 'pressure' | 'flow' | 'level' | 'status' | 'current';
  location: string;
  modelNodeId: { '2058': string; '2068': string };
  chainage_m: number | null;
  transducerElev_m: number | null;
  units: string;
  accuracyPctOfReading: number;
  confidence: string;
}

export const INSTRUMENTS = registerData.instruments as Instrument[];
export const REGISTER_META = registerData.meta;
export const UPLOAD_CADENCE_MIN = registerData.meta.uploadCadenceMinutes; // 5

/* ── model basis at each instrument (from the profile) ── */
const P = profileData as unknown as {
  chainage_m: number[]; elev_m: number[]; head_m: number[]; pressure_m: number[]; flow_m3h: number[];
  sites: { name: string; chainage_m: number; level_m: number; elev_m: number }[];
};

function sampleAt(chainage_m: number, series: number[]): number {
  const xs = P.chainage_m;
  if (chainage_m <= xs[0]) return series[0];
  if (chainage_m >= xs[xs.length - 1]) return series[series.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= chainage_m) lo = mid; else hi = mid; }
  const t = (chainage_m - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return series[lo] + (series[hi] - series[lo]) * t;
}

const siteByName = new Map(P.sites.map(s => [s.name, s]));

/** Model GROUND elevation at an instrument (for the illustrative override only). */
export function modelElevFor(inst: Instrument): number | null {
  const site = siteByName.get(inst.site);
  const ch = inst.chainage_m ?? site?.chainage_m ?? null;
  if (ch != null) return sampleAt(ch, P.elev_m);
  return site?.elev_m ?? null;
}

/** Model reference value for an instrument, in its own units. */
export function modelValueFor(inst: Instrument): { value: number | null; hgl_m: number | null } {
  const site = siteByName.get(inst.site);
  if (inst.measurand === 'flow') {
    const ch = inst.chainage_m ?? site?.chainage_m ?? null;
    return { value: ch != null ? sampleAt(ch, P.flow_m3h) : null, hgl_m: null };
  }
  if (inst.measurand === 'level') {
    // model tank water level relative to floor = level_m − elev_m
    if (!site) return { value: null, hgl_m: null };
    return { value: Math.max(0, site.level_m - site.elev_m), hgl_m: site.level_m };
  }
  if (inst.measurand === 'pressure') {
    const ch = inst.chainage_m ?? site?.chainage_m ?? null;
    const hgl = ch != null ? sampleAt(ch, P.head_m) : (site?.level_m ?? null);
    const elev = ch != null ? sampleAt(ch, P.elev_m) : (site?.elev_m ?? null);
    if (hgl == null || elev == null) return { value: null, hgl_m: hgl };
    // suction manifolds carry low residual; delivery carries the working head
    const isSuction = inst.location === 'suction_manifold' || inst.location === 'inlet';
    const headM = isSuction ? Math.min(hgl - elev, 30) * 0.15 + 8 : hgl - elev;
    return { value: headM / 10.1972, hgl_m: hgl }; // bar
  }
  return { value: null, hgl_m: null };
}

/* ── Synthetic source ── */
const FIVE_MIN = 5 * 60 * 1000;

function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function noise(seed: number, t: number): number { return Math.sin(seed * 12.9898 + t * 0.7) * 0.5 + Math.sin(seed * 78.233 + t * 0.13) * 0.5; }

/* Deterministic fault assignment: exactly one of each failure mode, pinned to
 * distinct computable (flow) instruments so all four render and are visibly
 * excluded from statistics. Falls back to any flow tag if a preferred one is
 * absent, guaranteeing four distinct faults. */
function pickFaults(): Record<string, Quality> {
  const flowTags = INSTRUMENTS.filter(i => i.measurand === 'flow' && modelValueFor(i).value != null).map(i => i.tagId);
  const prefer = ['SBT_FT_DEL_001', 'KSR_FT_DEL_001', 'KSN_FT_INL_001', 'MPR_FT_INL_001'];
  const modes: Quality[] = ['comms_fail', 'stale', 'uncertain', 'out_of_range'];
  const faults: Record<string, Quality> = {};
  const used = new Set<string>();
  const nextFallback = () => flowTags.find(t => !used.has(t));
  modes.forEach((mode, i) => {
    let tag = prefer[i] && flowTags.includes(prefer[i]) && !used.has(prefer[i]) ? prefer[i] : nextFallback();
    if (tag) { faults[tag] = mode; used.add(tag); }
  });
  return faults;
}

export class SyntheticScadaSource implements ScadaSource {
  readonly faults = pickFaults();
  readonly driftTag = Object.keys(this.faults).find(t => this.faults[t] === 'uncertain');
  readonly staleTag = Object.keys(this.faults).find(t => this.faults[t] === 'stale');
  readonly staleSince = Date.now() - 47 * 60 * 1000; // frozen 47 min ago

  private reading(inst: Instrument, atMs: number): ScadaReading {
    const seed = hash(inst.tagId);
    const bucket = Math.floor(atMs / FIVE_MIN);       // 5-min cadence
    const stampMs = bucket * FIVE_MIN;
    const { value: modelVal } = modelValueFor(inst);
    const base = modelVal ?? 0;

    // small persistent bias (instrument-specific) + diurnal + noise
    const bias = ((seed % 7) - 3) * 0.004 * Math.abs(base);
    const dv = 0.02 * Math.abs(base) * noise(seed, bucket);
    let value = base + bias + dv;

    const fault = this.faults[inst.tagId];
    let quality: Quality = 'good';
    let timestamp = new Date(stampMs).toISOString();

    if (fault === 'stale') {
      // frozen at a plausible constant since staleSince
      const frozenBucket = Math.floor(this.staleSince / FIVE_MIN);
      value = base + ((seed % 5) - 2) * 0.01 * Math.abs(base);
      timestamp = new Date(frozenBucket * FIVE_MIN).toISOString();
      quality = 'stale';
    } else if (fault === 'comms_fail') {
      value = NaN;
      quality = 'comms_fail';
    } else if (fault === 'uncertain') {
      // slow upward drift ~ +0.4%/hour of reading
      const hours = (atMs - (atMs - 24 * 3600 * 1000)) / 3600000;
      value = base * (1 + 0.004 * ((bucket % 288) / 12)) + dv;
      quality = 'uncertain';
      void hours;
    } else if (fault === 'out_of_range') {
      value = base * (inst.measurand === 'pressure' ? 3.4 : 2.6); // beyond calibrated span
      quality = 'out_of_range';
    }

    return { tagId: inst.tagId, value: Math.round(value * 1000) / 1000, units: inst.units, timestamp, quality, synthetic: true };
  }

  async latest(tagIds: string[]): Promise<ScadaReading[]> {
    const now = Date.now();
    const byId = new Map(INSTRUMENTS.map(i => [i.tagId, i]));
    return tagIds.map(id => {
      const inst = byId.get(id);
      if (!inst) return { tagId: id, value: NaN, units: '', timestamp: new Date(now).toISOString(), quality: 'comms_fail' as Quality, synthetic: true };
      return this.reading(inst, now);
    });
  }

  async history(tagId: string, fromIso: string, toIso: string): Promise<ScadaReading[]> {
    const inst = INSTRUMENTS.find(i => i.tagId === tagId);
    if (!inst) return [];
    const from = new Date(fromIso).getTime(), to = new Date(toIso).getTime();
    const out: ScadaReading[] = [];
    for (let t = Math.ceil(from / FIVE_MIN) * FIVE_MIN; t <= to; t += FIVE_MIN) out.push(this.reading(inst, t));
    return out;
  }
}

export const scada: ScadaSource = new SyntheticScadaSource();
export const syntheticScada = scada as SyntheticScadaSource;
