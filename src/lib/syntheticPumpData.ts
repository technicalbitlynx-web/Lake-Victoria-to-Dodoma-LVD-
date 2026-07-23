/*
 * Synthetic telemetry for the Load-Sharing and Sync-Link screens.
 *
 * The scheme is in design — no plant, no live SCADA. Every value here is
 * synthetic and carries `synthetic: true`. Faults are injected so the failure
 * paths are exercised: slow load-sharing drift, a step deviation, a pump
 * stopped on fault, a standby pump, a frozen/stale transmitter, a comms
 * failure, a sync-link degradation event, and a coast-down replay.
 *
 * Three data classes are honoured (0.3): `polled` (5-min analogues), `event`
 * (on change — mode transitions), `replay` (post-event high-res burst).
 */
import stationsData from '../data/pumpStations.json';
import pairsData from '../data/syncPairs.json';
import { classifyDeviationPct, type Band } from './deviationBands';

export type DataClass = 'polled' | 'event' | 'replay';
export type Quality = 'good' | 'stale' | 'comms_fail' | 'uncertain';
export type RunState = 'running' | 'standby' | 'fault' | 'stopped';
export type FaultKind = 'none' | 'drift' | 'step' | 'fault_stop' | 'stale' | 'comms_fail';

export interface StationCfg {
  id: string; name: string; shortName: string; role: string; chainage_m?: number;
  pumpCount: number | null; dutyCount: number | null; standbyCount: number | null;
  starterType: string; staggerSeconds?: number;
  designPoint: { horizon: string; q_m3h: number | null; head_m: number | null; motor_kW: number | null; npshRatio: number | null };
}

export const STATIONS = (stationsData.stations as StationCfg[]);
export const stationById = (id: string) => STATIONS.find(s => s.id === id);

/* ── deterministic helpers ── */
const POLL_MS = 5 * 60 * 1000;
function seedOf(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function wob(seed: number, amp: number, nowMs: number, speed = 1): number {
  const t = Math.floor(nowMs / 5000);
  return (Math.sin(seed * 12.9 + t * 0.5 * speed) * 0.6 + Math.sin(seed * 4.1 + t * 0.17 * speed) * 0.4) * amp;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b); const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/* MV vs LV by role → plausible motor current */
function ratedCurrentA(motorKw: number, role: string): number {
  const v = role === 'low_lift' ? 415 : 6600;
  return (motorKw * 1000) / (1.732 * v * 0.88 * 0.95);
}

/* ── per-pump reading ── */
export interface PumpReading {
  id: string; index: number;
  runState: RunState; faultKind: FaultKind;
  speedPct: number; currentA: number; powerKw: number; dischargeBar: number;
  runHours: number; startsThisHour: number;
  inferredFlow_m3h: number;         // DERIVED — not measured
  quality: Quality; ageSec: number; dataClass: DataClass;
  deviationPct: number | null; band: Band | null;
  deviationHistory: number[];       // 24 h deviation %, for the sparkline
  windingTemp: number; bearingTemp: number; vibration: number;
  specificEnergy: number;           // kWh/m³
  synthetic: true;
}

export interface StationLoadState {
  station: StationCfg;
  pumpCountKnown: boolean;
  running: number; standby: number; faulted: number; excluded: number;
  measuredFlow_m3h: number; measuredFlowAgeSec: number;
  referenceMedianA: number | null;
  computable: boolean; reason: string | null;
  spreadPct: number | null; outsideBand: number;
  sumInferredFlow_m3h: number;
  pumps: PumpReading[];
  staging: { rotationOrder: string[]; nextToStart: string | null; countdownSec: number; staggerSec: number };
  synthetic: true;
}

/* 24 h deviation history shape per fault (96 points = 15-min resolution) */
function deviationHistory(kind: FaultKind, seed: number): number[] {
  const N = 96;
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const noise = (Math.sin(seed * 3.3 + i * 0.7) * 0.5 + Math.sin(seed * 1.1 + i * 0.23) * 0.3) * 0.6;
    let v = noise;
    if (kind === 'drift') v = 0.4 + f * 6.5 + noise * 0.4;              // gradual ramp → wear/fouling
    else if (kind === 'step') v = (f < 0.62 ? 0.2 : 5.0) + noise * 0.4; // step → valve/control change
    else if (kind === 'stale') v = 0.3;                                  // frozen constant
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

export function getLoadState(stationId: string, nowMs = Date.now()): StationLoadState {
  const station = stationById(stationId)!;
  const known = station.pumpCount != null && station.dutyCount != null;
  const pollAge = Math.floor((nowMs % POLL_MS) / 1000);

  if (!known) {
    return {
      station, pumpCountKnown: false,
      running: 0, standby: 0, faulted: 0, excluded: 0,
      measuredFlow_m3h: 0, measuredFlowAgeSec: pollAge,
      referenceMedianA: null, computable: false,
      reason: 'Pump count is contractor design — not fixed in the DDR.',
      spreadPct: null, outsideBand: 0, sumInferredFlow_m3h: 0, pumps: [],
      staging: { rotationOrder: [], nextToStart: null, countdownSec: 0, staggerSec: station.staggerSeconds ?? 120 },
      synthetic: true,
    };
  }

  const P = station.pumpCount!, D = station.dutyCount!;
  const iRated = ratedCurrentA(station.designPoint.motor_kW!, station.role);
  const iNominal = iRated * 0.82;
  const qPerPump = station.designPoint.q_m3h! / D;

  // deterministic fault assignment scaled to this station
  const faultOf = (n: number): FaultKind => {
    if (n > D) return 'none';           // standby handled by runState
    if (n === 2) return 'drift';
    if (n === 4) return 'step';
    if (n === 5) return 'fault_stop';
    if (n === 6) return 'stale';
    if (n === 7 && D >= 7) return 'comms_fail';
    return 'none';
  };

  const pumps: PumpReading[] = [];
  for (let n = 1; n <= P; n++) {
    const seed = seedOf(station.id + 'P' + n);
    const isStandby = n > D;
    const fk = faultOf(n);
    let runState: RunState = isStandby ? 'standby' : 'running';
    let quality: Quality = 'good';
    let ageSec = pollAge;
    let dataClass: DataClass = 'polled';

    const smallVar = ((seed % 7) - 3) * 0.004;   // ±1.2% pump-to-pump
    let currentFactor = 1 + smallVar + wob(seed, 0.012, nowMs);
    let speedPct = station.starterType === 'soft_starter' ? 100 : clamp(92 + wob(seed, 3, nowMs), 80, 100);

    if (fk === 'drift') currentFactor += 0.062 + wob(seed, 0.006, nowMs);      // fouled impeller
    else if (fk === 'step') currentFactor += 0.05;                             // part-closed valve
    else if (fk === 'fault_stop') { runState = 'fault'; }
    else if (fk === 'stale') { quality = 'stale'; ageSec = 47 * 60; }          // frozen 47 min
    else if (fk === 'comms_fail') { quality = 'comms_fail'; ageSec = 62 * 60; }

    const running = runState === 'running';
    const currentA = running && quality !== 'comms_fail'
      ? iNominal * currentFactor
      : (quality === 'stale' ? iNominal * 1.005 : 0);        // stale = frozen plausible value
    const powerKw = running ? currentA * (station.role === 'low_lift' ? 0.415 : 6.6) * 1.732 * 0.88 / 1000 : 0;
    const speed = running ? speedPct : 0;
    const inferredFlow = running ? qPerPump * (speed / 100) : 0;   // affinity — DERIVED
    const dischargeBar = running ? clamp((station.designPoint.head_m! / 10.2) + wob(seed, 0.3, nowMs), 0, 60) : 0;
    const runHours = 8000 + (seed % 4000) + (n * 137);
    const startsThisHour = n === 3 ? 5 : clamp(1 + (seed % 3), 0, 4);   // one pump at the ER 5/hr limit

    pumps.push({
      id: `${station.id}-P${n}`, index: n, runState, faultKind: fk,
      speedPct: speed, currentA, powerKw, dischargeBar, runHours, startsThisHour,
      inferredFlow_m3h: inferredFlow, quality, ageSec, dataClass,
      deviationPct: null, band: null,
      deviationHistory: deviationHistory(fk, seed),
      windingTemp: running ? clamp(78 + wob(seed, 6, nowMs) + (fk === 'drift' ? 8 : 0), 30, 130) : 30,
      bearingTemp: running ? clamp(60 + wob(seed, 5, nowMs), 25, 110) : 26,
      vibration: running ? clamp(2.6 + wob(seed, 1, nowMs) + (fk === 'drift' ? 2.5 : 0), 0, 20) : 0.1,
      specificEnergy: running && inferredFlow > 0 ? clamp(powerKw / inferredFlow + (fk === 'drift' ? 0.08 : 0), 0, 5) : 0,
      synthetic: true,
    });
  }

  // reference = median of RUNNING, good-quality pumps only
  const refPool = pumps.filter(p => p.runState === 'running' && p.quality === 'good').map(p => p.currentA);
  const runningGood = refPool.length;
  const computable = runningGood >= 3;
  const refMedian = computable ? median(refPool) : null;

  let outsideBand = 0;
  const devs: number[] = [];
  for (const p of pumps) {
    if (refMedian && p.runState === 'running' && p.quality === 'good') {
      p.deviationPct = ((p.currentA - refMedian) / refMedian) * 100;
      p.band = classifyDeviationPct(p.deviationPct);
      devs.push(p.deviationPct);
      if (p.band === 'investigate' || p.band === 'significant') outsideBand++;
    }
  }
  const spreadPct = devs.length ? Math.max(...devs) - Math.min(...devs) : null;

  const running = pumps.filter(p => p.runState === 'running').length;
  const standby = pumps.filter(p => p.runState === 'standby').length;
  const faulted = pumps.filter(p => p.runState === 'fault').length;
  const excluded = pumps.filter(p => p.quality !== 'good').length;
  const sumInferred = pumps.reduce((a, p) => a + p.inferredFlow_m3h, 0);
  // single delivery meter — independent, with its own small bias → diagnostic divergence
  const measuredFlow = station.designPoint.q_m3h! * (running / D) * (0.975 + wob(seedOf(station.id), 0.02, nowMs));

  // staging: least-run pump starts next
  const rotation = [...pumps].sort((a, b) => a.runHours - b.runHours).map(p => p.id);
  const nextStandby = pumps.find(p => p.runState === 'standby');
  const staggerSec = station.staggerSeconds ?? 120;
  const countdownSec = staggerSec - Math.floor((nowMs / 1000) % staggerSec);

  return {
    station, pumpCountKnown: true,
    running, standby, faulted, excluded,
    measuredFlow_m3h: measuredFlow, measuredFlowAgeSec: pollAge,
    referenceMedianA: refMedian, computable,
    reason: computable ? null : `Only ${runningGood} pump${runningGood === 1 ? '' : 's'} running — need ≥ 3 for a meaningful reference.`,
    spreadPct, outsideBand, sumInferredFlow_m3h: sumInferred, pumps,
    staging: { rotationOrder: rotation, nextToStart: nextStandby?.id ?? null, countdownSec, staggerSec },
    synthetic: true,
  };
}

/* ════════════════════════════════════════════════════════════════════
   Sync-Link state
   ════════════════════════════════════════════════════════════════════ */
export type SyncMode = 'PEER_TO_PEER' | 'LOCAL_EMERGENCY_RAMP' | 'INDEPENDENT' | 'UNKNOWN';

export const SYNC_MODE_META: Record<SyncMode, { color: string; label: string; healthy: boolean }> = {
  PEER_TO_PEER: { color: '#22c55e', label: 'PEER-TO-PEER', healthy: true },
  LOCAL_EMERGENCY_RAMP: { color: '#f59e0b', label: 'LOCAL EMERGENCY RAMP', healthy: false },
  INDEPENDENT: { color: '#60a5fa', label: 'INDEPENDENT', healthy: false },
  UNKNOWN: { color: '#ef4444', label: 'UNKNOWN — treat as degraded', healthy: false },
};

export interface SyncPairCfg {
  id: string; masterStationId: string | null; slaveStationId: string | null;
  candidateStations: string[]; resolved: boolean; unresolvedReason: string;
  balancingTank: { station: string; note: string };
  rampDownSeconds: number; waveWindowSeconds: number;
  bladderTanks_m3: Record<string, number>; surgeTank_m3: number;
  linkMedia: string; fallbackMode: string;
}
export const SYNC_PAIRS = pairsData.pairs as SyncPairCfg[];

export interface SyncState {
  pair: SyncPairCfg; resolved: boolean;
  masterStationId: string | null; slaveStationId: string | null;
  stationALabel: string; stationBLabel: string; directional: boolean;
  mode: SyncMode; modeAgeSec: number; modeDataClass: DataClass;
  link: { latencyMs: number; jitterMs: number; packetLossPct: number; sinceLastGoodSec: number; media: string; healthy: boolean };
  speed: { refHz: number; actualHz: number; deviationHz: number; refTrace: number[]; actualTrace: number[]; traceCadenceMin: number };
  tank: {
    level_m: number; min_m: number; max_m: number; rocMh: number; netImbalance_m3h: number;
    projection: { kind: 'overflow' | 'dryrun' | 'none'; minutes: number | null; basis: string };
  };
  coastdown: {
    hasReplay: boolean; rampA: number[]; rampB: number[]; waveWindowSec: number;
    divergencePct: number; surge: { bladders: { id: string; m3: number }[]; surgeTank_m3: number; surgeTankLevelPct: number };
  };
  modeTimeline: { startFrac: number; endFrac: number; mode: SyncMode }[];
  synthetic: true;
}

export function getSyncState(pairId: string, nowMs = Date.now()): SyncState {
  const pair = SYNC_PAIRS.find(p => p.id === pairId)!;
  const resolved = pair.resolved && pair.masterStationId != null && pair.slaveStationId != null;

  // labels: directional only when resolved
  let aLabel: string, bLabel: string;
  if (resolved) {
    aLabel = `${stationById(pair.masterStationId!)?.shortName ?? pair.masterStationId} (master)`;
    bLabel = `${stationById(pair.slaveStationId!)?.shortName ?? pair.slaveStationId} (slave)`;
  } else {
    const a = stationById(pair.candidateStations[0]);
    const b = stationById(pair.candidateStations[pair.candidateStations.length - 1]);
    aLabel = `Station A — ${a?.shortName ?? pair.candidateStations[0]}`;
    bLabel = `Station B — ${b?.shortName ?? pair.candidateStations[2]}`;
  }

  // live mode drives a 10-min demonstrable cycle (event-driven, not polled)
  const phase = Math.floor((nowMs / 1000) % 600);
  let mode: SyncMode = 'PEER_TO_PEER';
  if (phase >= 470 && phase < 560) mode = 'LOCAL_EMERGENCY_RAMP';    // link lost → NVM ramp
  else if (phase >= 560 && phase < 575) mode = 'UNKNOWN';           // recovering, not yet reported
  const modeMeta = SYNC_MODE_META[mode];

  const linkLost = mode !== 'PEER_TO_PEER';
  const latencyMs = mode === 'PEER_TO_PEER'
    ? clamp(2.4 + wob(11, 0.8, nowMs), 1, 6)
    : mode === 'LOCAL_EMERGENCY_RAMP' ? 999 : clamp(40 + wob(12, 15, nowMs), 10, 90);
  const link = {
    latencyMs,
    jitterMs: clamp(0.3 + wob(13, 0.2, nowMs) + (linkLost ? 4 : 0), 0, 10),
    packetLossPct: linkLost ? clamp(35 + wob(14, 20, nowMs), 5, 100) : clamp(Math.abs(wob(15, 0.05, nowMs)), 0, 0.4),
    sinceLastGoodSec: mode === 'LOCAL_EMERGENCY_RAMP' ? phase - 470 : 0,
    media: mode === 'PEER_TO_PEER' ? 'fibre primary (P2P)' : 'fibre LOST — local NVM ramp',
    healthy: mode === 'PEER_TO_PEER',
  };

  // speed tracking (Hz). deviates during degradation.
  const refHz = clamp(48.5 + wob(21, 1.4, nowMs), 44, 50);
  const trackErr = linkLost ? (1.6 + wob(22, 0.8, nowMs)) : wob(22, 0.12, nowMs);
  const actualHz = clamp(refHz - trackErr, 30, 50);
  const N = 96;
  const refTrace: number[] = [], actualTrace: number[] = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const base = 48.4 + Math.sin(seedOf('ref') + i * 0.3) * 1.2;
    refTrace.push(Math.round(base * 100) / 100);
    // historical degradation event ~ 70% through the window
    const eventErr = (f > 0.68 && f < 0.74) ? 1.8 : Math.sin(i * 0.9) * 0.08;
    actualTrace.push(Math.round((base - eventErr) * 100) / 100);
  }

  // balancing tank — the consequence
  const tankMin = 1.0, tankMax = 5.0;
  const netImbalance = linkLost ? (180 + wob(31, 90, nowMs)) : wob(31, 40, nowMs);   // m³/h A_out − B_in
  const level = clamp(3.1 + wob(32, 0.5, nowMs) + (linkLost ? 0.6 : 0), tankMin, tankMax);
  // tank plan area ~ 1500 m² → ROC (m/h) = imbalance / area
  const area = 1500;
  const rocMh = netImbalance / area;
  let projection: SyncState['tank']['projection'] = { kind: 'none', minutes: null, basis: 'imbalance ÷ plan area 1500 m²' };
  if (Math.abs(rocMh) > 0.05) {
    if (rocMh > 0) projection = { kind: 'overflow', minutes: Math.round((tankMax - level) / rocMh * 60), basis: 'rising at current imbalance' };
    else projection = { kind: 'dryrun', minutes: Math.round((level - tankMin) / -rocMh * 60), basis: 'falling at current imbalance' };
  }

  // coast-down replay (120 s), station B lags → divergence
  const steps = 60;
  const rampA: number[] = [], rampB: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    rampA.push(Math.round(100 * (1 - t) * 100) / 100);
    const lag = 1 - Math.min(1, t * 1.12);   // B decelerates slightly faster mid-ramp
    rampB.push(Math.round(clamp(100 * lag, 0, 100) * 100) / 100);
  }
  let maxDiv = 0; for (let i = 0; i <= steps; i++) maxDiv = Math.max(maxDiv, Math.abs(rampA[i] - rampB[i]));

  const bladders = Object.entries(pair.bladderTanks_m3).map(([id, m3]) => ({ id, m3 }));

  // 24 h mode timeline (event resolution) — one degradation window in history
  const modeTimeline: SyncState['modeTimeline'] = [
    { startFrac: 0, endFrac: 0.62, mode: 'PEER_TO_PEER' },
    { startFrac: 0.62, endFrac: 0.66, mode: 'LOCAL_EMERGENCY_RAMP' },
    { startFrac: 0.66, endFrac: 0.665, mode: 'UNKNOWN' },
    { startFrac: 0.665, endFrac: 1, mode: 'PEER_TO_PEER' },
  ];

  return {
    pair, resolved,
    masterStationId: resolved ? pair.masterStationId : null,
    slaveStationId: resolved ? pair.slaveStationId : null,
    stationALabel: aLabel, stationBLabel: bLabel, directional: resolved,
    mode, modeAgeSec: 0, modeDataClass: 'event',
    link,
    speed: { refHz, actualHz, deviationHz: refHz - actualHz, refTrace, actualTrace, traceCadenceMin: 15 },
    tank: { level_m: level, min_m: tankMin, max_m: tankMax, rocMh, netImbalance_m3h: netImbalance, projection },
    coastdown: {
      hasReplay: true, rampA, rampB, waveWindowSec: pair.waveWindowSeconds,
      divergencePct: Math.round(maxDiv * 10) / 10,
      surge: { bladders, surgeTank_m3: pair.surgeTank_m3, surgeTankLevelPct: clamp(64 + wob(41, 8, nowMs), 20, 95) },
    },
    modeTimeline,
    synthetic: true,
  };
}
