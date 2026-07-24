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

/* Power-outage → restore event sequence (how the two IBPS stay in step) */
export type EventPhase = 'normal' | 'outage' | 'stopped' | 'restore' | 'resync';
export const EVENT_PHASE_META: Record<EventPhase, { label: string; short: string; color: string }> = {
  normal: { label: 'Normal operation', short: 'NORMAL', color: '#22c55e' },
  outage: { label: 'Power outage — coordinated coast-down', short: 'OUTAGE', color: '#f59e0b' },
  stopped: { label: 'Stations stopped — awaiting grid', short: 'STOPPED', color: '#6b7280' },
  restore: { label: 'Power restore — synchronised restart', short: 'RESTORE', color: '#38bdf8' },
  resync: { label: 'Re-synchronising to duty', short: 'RE-SYNC', color: '#a78bfa' },
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
  /* live power-outage → restore event */
  event: {
    phase: EventPhase; active: boolean; progress: number;
    masterSpeedPct: number; slaveSpeedPct: number; countdownSec: number; operatorNote: string;
  };
  /* whole-event speed profile for the chart (frac 0..1) + live marker */
  eventProfile: { frac: number; master: number; slave: number }[];
  eventBoundaries: { frac: number; phase: EventPhase }[];
  nowFrac: number;
  rampSeconds: number;
  /* operator-facing step-by-step sequence */
  sequence: { key: EventPhase; title: string; masterAction: string; slaveAction: string; linkState: string; tankEffect: string; note: string }[];
  synthetic: true;
}

const SYNC_SEQUENCE: SyncState['sequence'] = [
  {
    key: 'normal', title: '1 · Normal operation',
    masterAction: 'Kidaru runs at duty speed, filling the balancing tank.',
    slaveAction: 'Kisiriri runs at the same speed, drawing from the tank.',
    linkState: 'Fibre exchanges the speed reference every few ms — speeds identical.',
    tankEffect: 'Inflow ≈ outflow → tank level steady in band.',
    note: 'Peer-to-peer coupling holds both machines at one speed.',
  },
  {
    key: 'outage', title: '2 · Power outage — coordinated coast-down',
    masterAction: 'Kidaru trips; KEB regenerative braking gives a controlled 120 s ramp-down.',
    slaveAction: 'Kisiriri trips at the same instant and ramps down on the same 120 s profile.',
    linkState: 'Fibre (on UPS) keeps both ramps identical, in lock-step.',
    tankEffect: 'Fill and draw fall together → level holds, no surge or column separation.',
    note: 'If the fibre is lost, each station runs an identical ramp stored in local NVM — they still stop together.',
  },
  {
    key: 'stopped', title: '3 · Stopped — awaiting grid',
    masterAction: 'Kidaru at rest, ramp complete.',
    slaveAction: 'Kisiriri at rest, ramp complete.',
    linkState: 'Controllers armed; link idle.',
    tankEffect: 'Tank sits at its held level, ready to buffer restart.',
    note: 'Both stations wait for grid return before any restart.',
  },
  {
    key: 'restore', title: '4 · Power restore — synchronised restart',
    masterAction: 'Master (Kidaru) soft-starts first and re-accelerates.',
    slaveAction: 'Slave (Kisiriri) follows the master fibre reference, ramping up just behind it.',
    linkState: 'Fibre re-established; slave tracks master speed within tolerance.',
    tankEffect: 'Staggered start avoids inrush; balanced ramp-up refills/draws the tank evenly.',
    note: 'Master-leads / slave-follows prevents the tank overfilling or dry-running on restart.',
  },
  {
    key: 'resync', title: '5 · Re-synchronised to duty',
    masterAction: 'Kidaru at duty speed.',
    slaveAction: 'Kisiriri locked to the shared reference at duty speed.',
    linkState: 'PEER-TO-PEER restored, deviation within band.',
    tankEffect: 'Level recovered to its operating band.',
    note: 'Normal coupled operation resumes.',
  },
];

export function getSyncState(pairId: string, nowMs = Date.now()): SyncState {
  const pair = SYNC_PAIRS.find(p => p.id === pairId)!;
  const resolved = pair.resolved && pair.masterStationId != null && pair.slaveStationId != null;
  const DUTY_HZ = 48.5;

  // directional labels (resolved → master/slave)
  let aLabel: string, bLabel: string;
  if (resolved) {
    aLabel = `${stationById(pair.masterStationId!)?.shortName ?? pair.masterStationId} (master)`;
    bLabel = `${stationById(pair.slaveStationId!)?.shortName ?? pair.slaveStationId} (slave)`;
  } else {
    aLabel = `Station A — ${stationById(pair.candidateStations[0])?.shortName ?? pair.candidateStations[0]}`;
    bLabel = `Station B — ${stationById(pair.candidateStations[pair.candidateStations.length - 1])?.shortName ?? '?'}`;
  }

  // ── live outage → restore event cycle (300 s), so operators see the sequence ──
  const CYCLE = 300;
  const t = (nowMs / 1000) % CYCLE;
  // windows: normal 0–210 · outage 210–240 · stopped 240–258 · restore 258–288 · resync 288–300
  let phaseKey: EventPhase, progress = 0, countdownSec = 0;
  let masterSpeedPct = 100, slaveSpeedPct = 100;
  if (t < 210) { phaseKey = 'normal'; countdownSec = Math.round(210 - t); }
  else if (t < 240) { phaseKey = 'outage'; progress = (t - 210) / 30; masterSpeedPct = 100 * (1 - progress); slaveSpeedPct = 100 * (1 - Math.min(1, progress * 1.04)); countdownSec = Math.round(240 - t); }
  else if (t < 258) { phaseKey = 'stopped'; masterSpeedPct = 0; slaveSpeedPct = 0; countdownSec = Math.round(258 - t); }
  else if (t < 288) { phaseKey = 'restore'; progress = (t - 258) / 30; masterSpeedPct = 100 * progress; slaveSpeedPct = 100 * Math.max(0, progress - 0.06); countdownSec = Math.round(288 - t); }
  else { phaseKey = 'resync'; masterSpeedPct = 100; slaveSpeedPct = clamp(96 + (t - 288), 90, 100); countdownSec = Math.round(300 - t); }
  masterSpeedPct = clamp(masterSpeedPct + wob(51, 0.6, nowMs), 0, 100);
  slaveSpeedPct = clamp(slaveSpeedPct + wob(52, 0.6, nowMs), 0, 100);
  const active = phaseKey !== 'normal';

  const operatorNote = {
    normal: 'Coupled and stable. No action required.',
    outage: 'Both stations coasting down together on KEB braking. Do not interrupt — the ramp protects the main.',
    stopped: 'Stations safely stopped. Await grid confirmation before restart authorisation.',
    restore: 'Master leading, slave following. Watch the tank level and speed deviation as they re-accelerate.',
    resync: 'Speeds locking to the shared reference. Confirm PEER-TO-PEER before returning to auto.',
  }[phaseKey];

  // link stays healthy through the coordinated event (fibre on UPS)
  const linkHealthy = true;
  const link = {
    latencyMs: clamp(2.4 + wob(11, 0.8, nowMs), 1, 6),
    jitterMs: clamp(0.3 + wob(13, 0.2, nowMs), 0, 2),
    packetLossPct: clamp(Math.abs(wob(15, 0.05, nowMs)), 0, 0.4),
    sinceLastGoodSec: 0,
    media: 'fibre primary (P2P) · on UPS',
    healthy: linkHealthy,
  };
  const mode: SyncMode = 'PEER_TO_PEER';

  // live speed tracking follows the event (master reference vs slave actual)
  const refHz = clamp(DUTY_HZ * masterSpeedPct / 100 + wob(21, 0.15, nowMs), 0, 50);
  const actualHz = clamp(DUTY_HZ * slaveSpeedPct / 100 + wob(22, 0.1, nowMs), 0, 50);
  const N = 96;
  const refTrace: number[] = [], actualTrace: number[] = [];
  for (let i = 0; i < N; i++) {
    const base = DUTY_HZ * masterSpeedPct / 100 + Math.sin(seedOf('ref') + i * 0.3) * 0.4;
    refTrace.push(Math.round(base * 100) / 100);
    actualTrace.push(Math.round((base - Math.abs(Math.sin(i * 0.9)) * 0.1) * 100) / 100);
  }

  // ── balancing tank: synced ramps keep in/out balanced → level protected ──
  const tankMin = 1.0, tankMax = 5.0;
  // small residual imbalance from the tiny master/slave lag during a ramp
  const lagImbalance = (masterSpeedPct - slaveSpeedPct) / 100 * 90;   // m³/h
  const netImbalance = lagImbalance + wob(31, 15, nowMs);
  const level = clamp(3.0 + wob(32, 0.35, nowMs), tankMin, tankMax);
  const area = 1500;
  const rocMh = netImbalance / area;
  let projection: SyncState['tank']['projection'] = { kind: 'none', minutes: null, basis: 'ramps balanced — level held by the sync loop' };
  if (Math.abs(rocMh) > 0.05) {
    if (rocMh > 0) projection = { kind: 'overflow', minutes: Math.round((tankMax - level) / rocMh * 60), basis: 'transient during ramp' };
    else projection = { kind: 'dryrun', minutes: Math.round((level - tankMin) / -rocMh * 60), basis: 'transient during ramp' };
  }

  // ── whole-event speed profile for the chart (frac 0..1) ──
  const eventProfile: SyncState['eventProfile'] = [];
  const seg = (f: number): { m: number; s: number } => {
    // 0–0.12 normal · 0.12–0.40 coast · 0.40–0.52 stopped · 0.52–0.80 restore · 0.80–1 normal
    if (f < 0.12) return { m: 100, s: 100 };
    if (f < 0.40) { const p = (f - 0.12) / 0.28; return { m: 100 * (1 - p), s: 100 * (1 - Math.min(1, p * 1.04)) }; }
    if (f < 0.52) return { m: 0, s: 0 };
    if (f < 0.80) { const p = (f - 0.52) / 0.28; return { m: 100 * p, s: 100 * Math.max(0, p - 0.06) }; }
    return { m: 100, s: 100 };
  };
  for (let i = 0; i <= 80; i++) { const f = i / 80; const v = seg(f); eventProfile.push({ frac: f, master: Math.round(v.m * 10) / 10, slave: Math.round(v.s * 10) / 10 }); }
  const eventBoundaries: SyncState['eventBoundaries'] = [
    { frac: 0.12, phase: 'outage' }, { frac: 0.40, phase: 'stopped' }, { frac: 0.52, phase: 'restore' }, { frac: 0.80, phase: 'resync' },
  ];
  // map current live phase to a marker position on the chart
  const nowFrac = phaseKey === 'normal' ? 0.06
    : phaseKey === 'outage' ? 0.12 + progress * 0.28
      : phaseKey === 'stopped' ? 0.40 + ((t - 240) / 18) * 0.12
        : phaseKey === 'restore' ? 0.52 + progress * 0.28
          : 0.90;

  // coast-down detail (120 s) — kept for the surge-asset view
  const steps = 60;
  const rampA: number[] = [], rampB: number[] = [];
  for (let i = 0; i <= steps; i++) { const p = i / steps; rampA.push(Math.round(100 * (1 - p) * 10) / 10); rampB.push(Math.round(clamp(100 * (1 - Math.min(1, p * 1.04)), 0, 100) * 10) / 10); }
  let maxDiv = 0; for (let i = 0; i <= steps; i++) maxDiv = Math.max(maxDiv, Math.abs(rampA[i] - rampB[i]));
  const bladders = Object.entries(pair.bladderTanks_m3).map(([id, m3]) => ({ id, m3 }));

  const modeTimeline: SyncState['modeTimeline'] = [
    { startFrac: 0, endFrac: 0.7, mode: 'PEER_TO_PEER' },
    { startFrac: 0.7, endFrac: 0.74, mode: 'LOCAL_EMERGENCY_RAMP' },
    { startFrac: 0.74, endFrac: 1, mode: 'PEER_TO_PEER' },
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
    event: { phase: phaseKey, active, progress, masterSpeedPct, slaveSpeedPct, countdownSec, operatorNote },
    eventProfile, eventBoundaries, nowFrac, rampSeconds: pair.rampDownSeconds,
    sequence: SYNC_SEQUENCE,
    synthetic: true,
  };
}
