/*
 * Model-vs-measured comparison engine. Analytical core — no UI concerns.
 *
 * Design rules enforced here:
 *  - head error computed against TOTAL HEAD, never gauge pressure;
 *  - measured→HGL conversion needs a SURVEYED transducer elevation; if null,
 *    return null ("awaiting survey"), never a guess, never the model elevation;
 *  - percentage error suppressed below a near-zero denominator floor;
 *  - deviation below instrument uncertainty is classified as agreement, not error;
 *  - readings whose quality is not `good` are excluded from all statistics.
 */
import { modelValueFor, modelElevFor, type Instrument, type ScadaReading } from './scadaSource';

/* single source of truth for thresholds & constants (prompt §3.3–3.4) */
export const COMPARISON_CONFIG = {
  conversionConstant_m_per_bar: 10.1972,   // m water column at 4°C per bar — displayed
  pctDenominatorFloor_m: 5,                // suppress % head error below this |HGL|
  headToleranceBand_m: 2,                  // acceptable calibration tolerance, head
  flowTolerancePct: 5,                     // acceptable calibration tolerance, flow
  headSignificant_m: 8,                    // beyond this → possible leak / valve / defect
  flowSignificantPct: 12,
} as const;

export type Band = 'within_uncertainty' | 'acceptable' | 'investigate' | 'significant';
export type SolveMode = 'design_steady_state' | 'live_boundary';

export interface ComparisonRow {
  tagId: string;
  site: string;
  measurand: Instrument['measurand'];
  location: string;
  confidence: string;
  chainage_m: number | null;
  quality: ScadaReading['quality'];
  ageMin: number | null;
  synthetic: boolean;
  excluded: boolean;              // quality != good
  exclusionReason: string | null;
  awaitingSurvey: boolean;        // head/level needs transducer elevation
  modelValue: number | null;      // instrument units
  measuredValue: number | null;
  modelHGL_m: number | null;
  measuredHGL_m: number | null;   // null unless surveyed (or illustrative override)
  deltaHead_m: number | null;     // model − measured, total head
  deltaFlow_m3h: number | null;
  deltaPct: number | null;
  uncertainty: number | null;     // ± in the comparison metric
  band: Band | null;
  units: string;
}

export interface ComparisonSummary {
  solveMode: SolveMode;
  solveLabel: string;
  instrumentCount: number;
  excludedForQuality: number;
  awaitingSurvey: number;
  computedHead: number;
  computedFlow: number;
  withinUncertainty: number;
  meanAbsHeadError_m: number | null;
  rmseHead_m: number | null;
  meanAbsFlowPct: number | null;
  rmseFlowPct: number | null;
  conversionConstant_m_per_bar: number;
  cadenceMin: number;
}

/** measured gauge pressure (bar) → total head (m). Null if elevation unknown. */
export function measuredHGL(transducerElev_m: number | null, pressure_bar: number): number | null {
  if (transducerElev_m == null) return null;
  return transducerElev_m + pressure_bar * COMPARISON_CONFIG.conversionConstant_m_per_bar;
}

function classifyHead(absDev: number, uncertainty: number): Band {
  if (absDev <= uncertainty) return 'within_uncertainty';
  if (absDev <= COMPARISON_CONFIG.headToleranceBand_m) return 'acceptable';
  if (absDev <= COMPARISON_CONFIG.headSignificant_m) return 'investigate';
  return 'significant';
}
function classifyFlow(absPct: number, uncertaintyPct: number): Band {
  if (absPct <= uncertaintyPct) return 'within_uncertainty';
  if (absPct <= COMPARISON_CONFIG.flowTolerancePct) return 'acceptable';
  if (absPct <= COMPARISON_CONFIG.flowSignificantPct) return 'investigate';
  return 'significant';
}

export interface CompareOptions {
  /** Explicit, warned illustrative override: assume transducer at model node
   * elevation so head markers/whiskers render. OFF by default — never silent. */
  illustrativeTransducerElev?: boolean;
  solveMode?: SolveMode;
  nowMs?: number;
}

export function compareOne(
  inst: Instrument,
  reading: ScadaReading | undefined,
  opts: CompareOptions = {},
): ComparisonRow {
  const nowMs = opts.nowMs ?? Date.now();
  const { value: modelValue, hgl_m: modelHGL } = modelValueFor(inst);
  const quality = reading?.quality ?? 'comms_fail';
  const excluded = quality !== 'good';
  const ageMin = reading ? Math.max(0, Math.round((nowMs - new Date(reading.timestamp).getTime()) / 60000)) : null;

  const row: ComparisonRow = {
    tagId: inst.tagId, site: inst.site, measurand: inst.measurand, location: inst.location,
    confidence: inst.confidence, chainage_m: inst.chainage_m, quality, ageMin,
    synthetic: reading?.synthetic ?? true,
    excluded,
    exclusionReason: excluded ? exclusionReason(quality, ageMin) : null,
    awaitingSurvey: false,
    modelValue, measuredValue: reading && Number.isFinite(reading.value) ? reading.value : null,
    modelHGL_m: modelHGL, measuredHGL_m: null,
    deltaHead_m: null, deltaFlow_m3h: null, deltaPct: null, uncertainty: null, band: null,
    units: inst.units,
  };

  if (excluded || reading == null || !Number.isFinite(reading.value)) return row;

  // ── FLOW: no elevation needed, % of reading is the stable primary metric ──
  if (inst.measurand === 'flow') {
    if (modelValue == null) return row;
    const measured = reading.value;
    const delta = modelValue - measured;
    const uncertaintyPct = inst.accuracyPctOfReading;
    const pct = Math.abs(measured) < 1 ? null : (delta / measured) * 100;
    row.deltaFlow_m3h = round(delta, 1);
    row.deltaPct = pct == null ? null : round(pct, 2);
    row.uncertainty = round(Math.abs(measured) * uncertaintyPct / 100, 1);
    row.band = pct == null ? null : classifyFlow(Math.abs(pct), uncertaintyPct);
    return row;
  }

  // ── PRESSURE / LEVEL: compare TOTAL HEAD; needs surveyed transducer elev ──
  if (inst.measurand === 'pressure' || inst.measurand === 'level') {
    const elev = inst.transducerElev_m ?? (opts.illustrativeTransducerElev ? modelNodeElevFallback(inst) : null);
    if (elev == null) { row.awaitingSurvey = true; return row; }

    let measHGL: number | null;
    if (inst.measurand === 'pressure') measHGL = measuredHGL(elev, reading.value);
    else measHGL = elev + reading.value; // level: HGL = transducer(floor) datum + level
    if (measHGL == null || modelHGL == null) { row.awaitingSurvey = inst.transducerElev_m == null; return row; }

    const delta = modelHGL - measHGL;
    row.measuredHGL_m = round(measHGL, 2);
    row.deltaHead_m = round(delta, 2);
    // % suppressed near zero denominator
    row.deltaPct = Math.abs(measHGL) < COMPARISON_CONFIG.pctDenominatorFloor_m ? null : round((delta / measHGL) * 100, 2);
    // instrument uncertainty in head terms
    const unc = inst.measurand === 'pressure'
      ? Math.abs(reading.value) * inst.accuracyPctOfReading / 100 * COMPARISON_CONFIG.conversionConstant_m_per_bar
      : Math.abs(reading.value) * inst.accuracyPctOfReading / 100;
    row.uncertainty = round(Math.max(unc, 0.05), 2);
    row.band = classifyHead(Math.abs(delta), row.uncertainty);
    return row;
  }

  return row;
}

/** Model node ground elevation, used ONLY under the explicit illustrative override. */
function modelNodeElevFallback(inst: Instrument): number | null {
  return modelElevFor(inst);
}

function exclusionReason(q: ScadaReading['quality'], ageMin: number | null): string {
  switch (q) {
    case 'comms_fail': return 'comms failure — no data';
    case 'stale': return `frozen / stale${ageMin != null ? ` (${ageMin} min old)` : ''}`;
    case 'uncertain': return 'uncertain — sensor drift flagged';
    case 'out_of_range': return 'reading outside calibrated span';
    default: return 'excluded';
  }
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function compareAll(
  instruments: Instrument[],
  readings: Map<string, ScadaReading>,
  opts: CompareOptions = {},
): { rows: ComparisonRow[]; summary: ComparisonSummary } {
  const rows = instruments.map(i => compareOne(i, readings.get(i.tagId), opts));

  const headComputed = rows.filter(r => r.deltaHead_m != null);
  const flowComputed = rows.filter(r => r.deltaFlow_m3h != null && r.deltaPct != null);
  const within = rows.filter(r => r.band === 'within_uncertainty').length;

  const mae = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length : null;
  const rmse = (xs: number[]) => xs.length ? Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / xs.length) : null;

  const solveMode: SolveMode = opts.solveMode ?? 'design_steady_state';
  const summary: ComparisonSummary = {
    solveMode,
    solveLabel: solveMode === 'live_boundary'
      ? 'live-boundary re-solve (SCADA levels / demands / pump status)'
      : 'design steady-state (no live-boundary snapshot available)',
    instrumentCount: instruments.length,
    excludedForQuality: rows.filter(r => r.excluded).length,
    awaitingSurvey: rows.filter(r => r.awaitingSurvey).length,
    computedHead: headComputed.length,
    computedFlow: flowComputed.length,
    withinUncertainty: within,
    meanAbsHeadError_m: mae(headComputed.map(r => r.deltaHead_m!)),
    rmseHead_m: rmse(headComputed.map(r => r.deltaHead_m!)),
    meanAbsFlowPct: mae(flowComputed.map(r => r.deltaPct!)),
    rmseFlowPct: rmse(flowComputed.map(r => r.deltaPct!)),
    conversionConstant_m_per_bar: COMPARISON_CONFIG.conversionConstant_m_per_bar,
    cadenceMin: 5,
  };
  return { rows, summary };
}

export const BAND_COLORS: Record<Band, string> = {
  within_uncertainty: '#22c55e',
  acceptable: '#84cc16',
  investigate: '#f59e0b',
  significant: '#ef4444',
};
export const BAND_LABELS: Record<Band, string> = {
  within_uncertainty: 'Within uncertainty',
  acceptable: 'Acceptable',
  investigate: 'Investigate',
  significant: 'Significant',
};
