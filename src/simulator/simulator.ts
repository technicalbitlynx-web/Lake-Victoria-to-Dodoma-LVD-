import type { Tag, Alarm, AlarmPriority, ValveRuntime } from '../types';
import { generateTags, ALL_SITES } from './tagGenerator';
import { VALVES, VALVES_BY_ID } from '../data/valveSpecs';

type Listener = (tags: Record<string, Tag>, alarms: Alarm[], valves: Record<string, ValveRuntime>) => void;

const HISTORY_LEN = 60;
const TICK_MS = 5000;
const VALVE_STROKE_PER_TICK = 20; // % travel per 5 s tick

// Diurnal demand factor (0..1) over 24h
function demandFactor(h: number, m: number): number {
  const t = h + m / 60;
  // Peak at 7am and 7pm, trough at 3am
  return 0.55 + 0.35 * Math.sin(((t - 3) / 24) * 2 * Math.PI) + 0.1 * Math.sin(((t - 7) / 12) * 2 * Math.PI);
}

// Smooth noise
function noise(seed: number, t: number, freq = 1): number {
  return Math.sin(seed * 17.3 + t * freq * 0.001) * 0.5 + Math.sin(seed * 7.1 + t * freq * 0.003) * 0.25;
}

/* Extract "<SITE>-P<n>" (or "<SITE>-IBPS-P<n>") key from any per-pump tag id */
function pumpKeyOf(tid: string): string | null {
  const m = tid.match(/^(.*-P\d+)-/);
  return m ? m[1] : null;
}

export class Simulator {
  private tags: Record<string, Tag>;
  private listeners: Listener[] = [];
  private alarms: Alarm[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private t = 0;
  private scenario: string | null = null;
  private scenarioTimer = 0;
  private alarmCounter = 0;

  // Per-tag state for stateful simulation
  private levelState: Record<string, number> = {};
  private totaliserState: Record<string, number> = {};

  // Pump commanded/fault state, keyed "<SITE>-P<n>"
  private pumpRun: Record<string, boolean> = {};
  private pumpFault: Record<string, boolean> = {};

  // Valve runtime state
  private valves: Record<string, ValveRuntime> = {};

  constructor() {
    this.tags = generateTags();
    this.initState();
    this.initValves();
  }

  private initState() {
    const now = Date.now();

    // Establish pump run/fault state first: duty pumps run, standby stopped, rare fault
    for (const tid of Object.keys(this.tags)) {
      if (!tid.endsWith('-RUN')) continue;
      const key = tid.slice(0, -4);
      const m = key.match(/-P(\d+)$/);
      const n = m ? parseInt(m[1], 10) : 1;
      const site = ALL_SITES.find(s => tid.startsWith(s.id));
      const working = (site?.phase1?.pumps_working as number) ?? 2;
      const isStandby = n > working;
      this.pumpRun[key] = !isStandby;
      this.pumpFault[key] = Math.random() < 0.04; // occasional single fault across fleet
    }

    for (const [tid, tag] of Object.entries(this.tags)) {
      const [lo, hi] = tag.range;
      if (tag.measurement === 'level') {
        this.levelState[tid] = lo + (hi - lo) * 0.65;
      }
      if (tag.measurement === 'flow' && tid.includes('TOT')) {
        this.totaliserState[tid] = Math.floor(Math.random() * 5e6);
      }
      if (tag.measurement === 'time') {
        this.totaliserState[tid] = 4000 + Math.floor(Math.random() * 9000);
      }
      // Pre-fill history
      for (let i = HISTORY_LEN; i >= 0; i--) {
        const v = this.simulateValue(tag, now - i * TICK_MS, 0);
        tag.history.push({ t: now - i * TICK_MS, v });
      }
      tag.value = tag.history[tag.history.length - 1]?.v ?? 0;
    }
  }

  private initValves() {
    for (const spec of VALVES) {
      this.valves[spec.id] = {
        id: spec.id,
        position: spec.defaultPosition,
        target: spec.defaultPosition,
        moving: false,
        mode: 'REMOTE',
        fault: false,
        upstream_bar: spec.basePressure_bar,
        downstream_bar: spec.setpoint_bar !== undefined && spec.type === 'PRV'
          ? Math.min(spec.basePressure_bar, spec.setpoint_bar)
          : spec.basePressure_bar * 0.95,
        flow_m3h: spec.maxFlow_m3h * (spec.defaultPosition / 100) * 0.7,
        status: 'OPEN',
      };
      this.updateValveStatus(this.valves[spec.id]);
    }
  }

  isPumpRunning(pumpKey: string): boolean {
    return (this.pumpRun[pumpKey] ?? false) && !(this.pumpFault[pumpKey] ?? false);
  }

  private simulateValue(tag: Tag, now: number, seed: number): number {
    const [lo, hi] = tag.range;
    const d = new Date(now);
    const df = demandFactor(d.getHours(), d.getMinutes());
    const n = noise(seed, now);
    const tid = tag.tag_id;
    const pumpKey = pumpKeyOf(tid);
    const running = pumpKey ? this.isPumpRunning(pumpKey) : true;

    switch (tag.measurement) {
      case 'flow': {
        if (tid.includes('TOT')) {
          return (this.totaliserState[tid] ?? 0);
        }
        const base = lo + (hi - lo) * df;
        return Math.max(lo, Math.min(hi, base + n * (hi - lo) * 0.06));
      }
      case 'level': {
        const prev = this.levelState[tid] ?? (lo + (hi - lo) * 0.65);
        const inflow = df * 0.03 * (hi - lo);
        const outflow = df * 0.025 * (hi - lo);
        const next = Math.max(lo + 0.1, Math.min(hi - 0.1, prev + (inflow - outflow) + n * 0.02 * (hi - lo)));
        this.levelState[tid] = next;
        return next;
      }
      case 'pressure': {
        const base = lo + (hi - lo) * (0.4 + df * 0.35);
        return Math.max(lo, Math.min(hi, base + n * (hi - lo) * 0.04));
      }
      case 'turbidity': {
        // Typically low, occasional spikes
        const base = lo + (hi - lo) * 0.08;
        const spike = this.scenario === 'turbidity' ? (hi - lo) * 0.6 : 0;
        return Math.max(lo, Math.min(hi, base + spike + Math.abs(n) * (hi - lo) * 0.05));
      }
      case 'ph': {
        const centre = 7.2;
        return Math.max(lo, Math.min(hi, centre + n * 0.3));
      }
      case 'chlorine': {
        const base = 0.5;
        return Math.max(lo, Math.min(hi, base + n * 0.15));
      }
      case 'current': {
        // A stopped or tripped motor draws no current
        if (!running) return 0;
        const base = lo + (hi - lo) * (0.55 + df * 0.2);
        return Math.max(lo, Math.min(hi, base + n * (hi - lo) * 0.05));
      }
      case 'power': {
        if (pumpKey && !running) return 0;
        const base = lo + (hi - lo) * (0.5 + df * 0.25);
        return Math.max(lo, Math.min(hi, base + n * (hi - lo) * 0.04));
      }
      case 'temperature': {
        if (pumpKey && tid.includes('BTEMP') && !running) {
          // Bearings cool to ambient when the pump is stopped
          return Math.max(lo, Math.min(hi, 29 + n * 2));
        }
        const base = (tid.includes('BTEMP') ? 55 : 22);
        return Math.max(lo, Math.min(hi, base + n * 5));
      }
      case 'vibration': {
        if (pumpKey && !running) return Math.abs(n) * 0.15;
        const base = 2.5;
        const trip = this.scenario === 'pump_trip' && tid.startsWith('SIBITI_IBPS1-P1-') ? 12 : 0;
        return Math.max(lo, Math.min(hi, base + trip + Math.abs(n) * 1.5));
      }
      case 'status': {
        if (tid.endsWith('-RUN')) return running ? 1 : 0;
        if (tid.endsWith('-FLT')) return (pumpKey && this.pumpFault[pumpKey]) ? 1 : 0;
        if (tid.endsWith('-AVAIL')) return (pumpKey && this.pumpFault[pumpKey]) ? 0 : 1;
        if (tid.endsWith('BW-STATE')) return Math.floor((this.t / 40) % 6);
        return 1;
      }
      case 'valve_position': {
        return hi > 1 ? 100 : 1;
      }
      case 'conductivity': {
        return Math.max(lo, Math.min(hi, 450 + n * 80));
      }
      case 'speed': {
        if (pumpKey && !running) return 0;
        return Math.max(lo, Math.min(hi, 85 + df * 10 + n * 5));
      }
      case 'frequency': {
        if (pumpKey && !running) return 0;
        return Math.max(lo, Math.min(hi, 47.5 + df * 2.5 + n * 0.5));
      }
      case 'time': {
        const base = this.totaliserState[tid] ?? 8000;
        if (pumpKey && running) this.totaliserState[tid] = base + TICK_MS / 3600000;
        return this.totaliserState[tid] ?? base;
      }
      default:
        return lo + (hi - lo) * 0.5;
    }
  }

  private checkAlarms(tag: Tag) {
    // Suppress process alarms on per-pump tags while the pump is stopped —
    // a de-energised motor legitimately reads 0 A / 0 kW / ambient temperature.
    const pumpKey = pumpKeyOf(tag.tag_id);
    if (pumpKey && !this.isPumpRunning(pumpKey) && tag.measurement !== 'status') {
      tag.alarm_state = 'normal';
      return;
    }

    let state: Tag['alarm_state'] = 'normal';
    const v = tag.value;
    if (tag.alarm_high_high !== undefined && v >= tag.alarm_high_high) state = 'alarm';
    else if (tag.alarm_low_low !== undefined && v <= tag.alarm_low_low) state = 'alarm';
    else if (tag.alarm_high !== undefined && v >= tag.alarm_high) state = 'warning';
    else if (tag.alarm_low !== undefined && v <= tag.alarm_low) state = 'warning';

    if (state !== tag.alarm_state && state !== 'normal') {
      const site = ALL_SITES.find(s => s.id === tag.site_id);
      const priority: AlarmPriority = state === 'alarm' ? 'high' : 'medium';
      const alarm: Alarm = {
        id: `ALM-${++this.alarmCounter}`,
        tag_id: tag.tag_id,
        site_id: tag.site_id,
        site_name: site?.name ?? tag.site_id,
        description: `${tag.description}: ${tag.measurement === 'status' ? (tag.value ? 'ON' : 'OFF') : tag.value.toFixed(2)} ${tag.unit}`,
        priority,
        state,
        timestamp: Date.now(),
        acknowledged: false,
        value: tag.value,
        unit: tag.unit,
      };
      this.alarms = [alarm, ...this.alarms].slice(0, 500);
    }
    tag.alarm_state = state;
  }

  private updateValveStatus(v: ValveRuntime) {
    const spec = VALVES_BY_ID[v.id];
    if (v.fault) { v.status = 'FAULT'; return; }
    if (v.moving) { v.status = 'MOVING'; return; }
    if (spec.type === 'ARV') { v.status = Math.abs(noise(v.id.length * 13, this.t * 1000)) > 0.42 ? 'VENTING' : 'OK'; return; }
    if (spec.type === 'PSV') { v.status = v.position > 2 ? 'LIFTED' : 'ARMED'; return; }
    if (v.position <= 2) v.status = 'CLOSED';
    else if (v.position >= 98) v.status = 'OPEN';
    else v.status = 'THROTTLING';
  }

  private tickValves(df: number) {
    for (const v of Object.values(this.valves)) {
      const spec = VALVES_BY_ID[v.id];
      const seed = v.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const n = noise(seed, Date.now());

      // Stroke toward target
      if (Math.abs(v.position - v.target) > 0.5) {
        const dir = v.target > v.position ? 1 : -1;
        v.position = Math.max(0, Math.min(100, v.position + dir * Math.min(VALVE_STROKE_PER_TICK, Math.abs(v.target - v.position))));
        v.moving = Math.abs(v.position - v.target) > 0.5;
      } else {
        v.moving = false;
      }

      // Surge relief valves lift during a burst/surge scenario
      if (spec.type === 'PSV') {
        v.position = this.scenario === 'burst' ? 40 : 0;
        v.target = v.position;
      }

      // Pressures
      v.upstream_bar = Math.max(0, spec.basePressure_bar * (0.92 + df * 0.12) + n * 0.4);
      if (spec.type === 'PRV' && spec.setpoint_bar !== undefined) {
        v.downstream_bar = v.position > 2 ? Math.min(v.upstream_bar, spec.setpoint_bar + n * 0.08) : 0;
      } else if (spec.type === 'PSV') {
        v.downstream_bar = 0;
      } else {
        v.downstream_bar = v.position > 2 ? v.upstream_bar * (0.93 + 0.05 * (v.position / 100)) : 0;
      }

      // Flow
      if (spec.type === 'ARV' || spec.type === 'PSV') {
        v.flow_m3h = spec.type === 'PSV' && v.position > 2 ? spec.maxFlow_m3h * 0.6 : 0;
      } else {
        v.flow_m3h = v.position <= 2 ? 0 : Math.max(0, spec.maxFlow_m3h * (v.position / 100) * (0.55 + 0.45 * df) + n * spec.maxFlow_m3h * 0.03);
      }

      this.updateValveStatus(v);
    }
  }

  private tick() {
    const now = Date.now();
    this.t++;
    if (this.scenarioTimer > 0) {
      this.scenarioTimer--;
      if (this.scenarioTimer === 0) this.endScenario();
    }

    const d = new Date(now);
    const df = demandFactor(d.getHours(), d.getMinutes());

    for (const [tid, tag] of Object.entries(this.tags)) {
      const seedBase = tid.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const newVal = this.simulateValue(tag, now, seedBase);

      // Update totaliser
      if (tag.measurement === 'flow' && tid.includes('TOT')) {
        const prevTot = this.totaliserState[tid] ?? 0;
        const instFlow = this.tags[tid.replace('-TOT', '-001')]?.value ?? 1000;
        this.totaliserState[tid] = prevTot + (instFlow / 720); // m³ per 5s
        tag.value = this.totaliserState[tid];
      } else {
        tag.value = newVal;
      }

      tag.timestamp = now;
      tag.history = [...tag.history.slice(-(HISTORY_LEN - 1)), { t: now, v: tag.value }];
      this.checkAlarms(tag);
    }

    this.tickValves(df);

    // Comms fail scenario
    if (this.scenario === 'comms_fail') {
      const commsTargetSite = 'SIBITI_IBPS1';
      for (const tag of Object.values(this.tags)) {
        if (tag.site_id === commsTargetSite) {
          tag.alarm_state = 'comms';
        }
      }
    }

    this.notify();
  }

  private notify() {
    this.listeners.forEach(l => l({ ...this.tags }, [...this.alarms], { ...this.valves }));
  }

  private operatorEvent(description: string, siteId: string, priority: AlarmPriority = 'low') {
    const site = ALL_SITES.find(s => s.id === siteId);
    const evt: Alarm = {
      id: `ALM-${++this.alarmCounter}`,
      tag_id: `${siteId}-OPERATOR`,
      site_id: siteId,
      site_name: site?.name ?? siteId,
      description,
      priority,
      state: 'normal',
      timestamp: Date.now(),
      acknowledged: true,
      ack_by: 'system',
      value: 0,
      unit: '',
    };
    this.alarms = [evt, ...this.alarms].slice(0, 500);
  }

  /* ── Operator control: pumps ── */
  commandPump(siteId: string, pumpNum: number, run: boolean): boolean {
    const key = `${siteId}-P${pumpNum}`;
    if (run && this.pumpFault[key]) {
      this.operatorEvent(`OPERATOR: Start command P${pumpNum} REJECTED — pump in FAULT, reset required`, siteId, 'medium');
      this.notify();
      return false;
    }
    this.pumpRun[key] = run;
    this.operatorEvent(`OPERATOR: Pump P${pumpNum} ${run ? 'START' : 'STOP'} command issued`, siteId);
    // Reflect immediately on the RUN/current tags
    const runTag = this.tags[`${key}-RUN`];
    if (runTag) runTag.value = this.isPumpRunning(key) ? 1 : 0;
    this.notify();
    return true;
  }

  resetPumpFault(siteId: string, pumpNum: number) {
    const key = `${siteId}-P${pumpNum}`;
    this.pumpFault[key] = false;
    this.operatorEvent(`OPERATOR: Pump P${pumpNum} fault RESET`, siteId);
    const fltTag = this.tags[`${key}-FLT`];
    if (fltTag) fltTag.value = 0;
    this.notify();
  }

  /* ── Operator control: valves ── */
  commandValve(valveId: string, targetPosition: number): boolean {
    const v = this.valves[valveId];
    const spec = VALVES_BY_ID[valveId];
    if (!v || !spec) return false;
    if (!spec.controllable || v.mode === 'LOCAL' || v.fault) {
      this.operatorEvent(`OPERATOR: Command to ${spec.name} REJECTED — ${!spec.controllable ? 'not remote-operable' : v.fault ? 'valve fault' : 'in LOCAL mode'}`, spec.siteId ?? 'MBALIKA_INTAKE', 'medium');
      this.notify();
      return false;
    }
    v.target = Math.max(0, Math.min(100, targetPosition));
    v.moving = Math.abs(v.position - v.target) > 0.5;
    this.updateValveStatus(v);
    this.operatorEvent(`OPERATOR: ${spec.name} commanded to ${v.target.toFixed(0)} %`, spec.siteId ?? 'MBALIKA_INTAKE');
    this.notify();
    return true;
  }

  setValveMode(valveId: string, mode: 'REMOTE' | 'LOCAL') {
    const v = this.valves[valveId];
    if (!v) return;
    v.mode = mode;
    this.notify();
  }

  /* ── lifecycle ── */
  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), TICK_MS);
    setTimeout(() => this.tick(), 100);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  triggerScenario(name: string) {
    this.scenario = name;
    this.scenarioTimer = 24; // ~2 minutes

    if (name === 'pump_trip') {
      // Trip Sibiti P1 and auto-start the first standby unit
      this.pumpFault['SIBITI_IBPS1-P1'] = true;
      this.pumpRun['SIBITI_IBPS1-P11'] = true;
    }

    const site = name === 'pump_trip' || name === 'comms_fail'
      ? ALL_SITES.find(s => s.id === 'SIBITI_IBPS1')!
      : ALL_SITES[Math.floor(Math.random() * ALL_SITES.length)];
    const alm: Alarm = {
      id: `ALM-${++this.alarmCounter}`,
      tag_id: `${site.id}-SCENARIO`,
      site_id: site.id,
      site_name: site.name,
      description: SCENARIO_DESCRIPTIONS[name] ?? `Scenario: ${name}`,
      priority: 'critical',
      state: 'alarm',
      timestamp: Date.now(),
      acknowledged: false,
      value: 0,
      unit: '',
    };
    this.alarms = [alm, ...this.alarms];
    this.notify();
  }

  private endScenario() {
    if (this.scenario === 'pump_trip') {
      this.pumpFault['SIBITI_IBPS1-P1'] = false;
    }
    this.scenario = null;
  }

  clearScenario() {
    this.endScenario();
    this.scenarioTimer = 0;
  }

  acknowledgeAlarm(id: string, by: string, comment: string) {
    this.alarms = this.alarms.map(a => a.id === id ? { ...a, acknowledged: true, ack_by: by, ack_comment: comment } : a);
  }

  getInitialState() {
    return { tags: { ...this.tags }, alarms: [...this.alarms], valves: { ...this.valves } };
  }
}

const SCENARIO_DESCRIPTIONS: Record<string, string> = {
  pump_trip: 'SCENARIO: Pump P1 trip at Sibiti IBPS-1 — standby P11 auto-start initiated',
  burst: 'SCENARIO: Pipe burst detected — surge relief valves lifting on affected main',
  comms_fail: 'SCENARIO: SCADA comms failure — Sibiti IBPS-1 offline',
  turbidity: 'SCENARIO: Turbidity excursion — raw water NTU elevated above threshold',
};

export const simulator = new Simulator();
