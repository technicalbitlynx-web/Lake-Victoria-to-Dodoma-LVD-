/*
 * Lightweight pseudo-hydraulic simulation for the MBALIKA2068 EPANET model
 * components. Values are deterministic per 5 s tick (same cadence as the
 * main simulator) — smooth, diurnal-shaped and repeatable, suitable for the
 * demonstrator without running a full EPANET solve in the browser.
 */

export interface EpanetPump { id: string; n1: string; n2: string; params: string; pos: [number, number] }
export interface EpanetValve { id: string; n1: string; n2: string; dn: number; type: string; setting: number; pos: [number, number] }
export interface EpanetTank { id: string; elev: number; init: number; min: number; max: number; diam: number; vol: number; minVol: number; pos: [number, number] }
export interface EpanetReservoir { id: string; head: number; pos: [number, number] }
export interface EpanetJunction { id: string; elev: number; demand: number; pos: [number, number] }

function tick5s(): number { return Math.floor(Date.now() / 5000); }

export function wobble(seed: number, amp = 1): number {
  const t = tick5s();
  return (Math.sin(seed * 13.7 + t * 0.7) * 0.6 + Math.sin(seed * 5.1 + t * 0.23) * 0.4) * amp;
}

export function demandFactorNow(): number {
  const d = new Date();
  const t = d.getHours() + d.getMinutes() / 60;
  return 0.55 + 0.35 * Math.sin(((t - 3) / 24) * 2 * Math.PI) + 0.1 * Math.sin(((t - 7) / 12) * 2 * Math.PI);
}

export const seedOf = (s: string): number => s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ── Pumps (EPANET pump links, HEAD curve + speed in params) ── */
export function pumpSim(p: EpanetPump) {
  const s = seedOf(p.id);
  const df = demandFactorNow();
  const running = wobble(s, 1) > -0.88;             // mostly running
  const flow = running ? clamp(2200 + wobble(s + 1, 500) + df * 600, 400, 4200) : 0;   // m³/h
  const head = running ? clamp(180 + wobble(s + 2, 40), 40, 340) : 0;                  // m
  const kw = running ? Math.round(flow * head * 9.81 / 3600 / 0.78) : 0;               // shaft kW est.
  return { running, flow, head, kw, speedPct: running ? clamp(92 + wobble(s + 3, 6), 60, 100) : 0 };
}

/* ── Control valves (34× FCV flow-setting m³/h · 4× PRV pressure-setting m) ── */
export function valveSim(v: EpanetValve) {
  const s = seedOf(v.id);
  const df = demandFactorNow();
  if (v.type === 'PRV') {
    const upstream = clamp(v.setting * (1.5 + wobble(s, 0.15)), v.setting, v.setting * 3);
    return { flow: clamp(900 + wobble(s + 1, 300) * df, 50, 3000), upstream, downstream: v.setting + wobble(s + 2, 0.6), position: clamp(55 + wobble(s + 3, 18), 10, 95), status: 'REGULATING' };
  }
  // FCV — holds flow at setting, modulated by demand
  const flow = clamp(v.setting * (0.72 + df * 0.3) + wobble(s, v.setting * 0.03), 0, v.setting * 1.05);
  return { flow, upstream: clamp(14 + wobble(s + 1, 4), 2, 40), downstream: clamp(11 + wobble(s + 2, 4), 1, 38), position: clamp(60 + wobble(s + 3, 20), 15, 100), status: 'FLOW CONTROL' };
}

/* ── Tanks (balancing reservoirs in the model) ── */
export function tankSim(t: EpanetTank) {
  const s = seedOf(t.id);
  const range = t.max - t.min;
  const d = new Date();
  const h = d.getHours() + d.getMinutes() / 60;
  // fills overnight, draws down through demand peaks
  const diurnal = 0.5 + 0.32 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
  const level = clamp(t.min + range * clamp(diurnal + wobble(s, 0.05), 0.05, 0.98), t.min, t.max);
  const area = Math.PI * (t.diam / 2) ** 2;
  const volNow = Math.round(area * level);
  const pct = ((level - t.min) / range) * 100;
  const filling = Math.cos(((h - 9) / 24) * 2 * Math.PI) > 0;
  return { level, pct, volNow, filling };
}

/* ── Source reservoirs (fixed head) ── */
export function reservoirSim(r: EpanetReservoir) {
  const s = seedOf(r.id);
  return { head: r.head + wobble(s, 0.15), outflow: clamp(2400 + wobble(s + 1, 700) * demandFactorNow(), 200, 6500) };
}

/* ── Demand junctions (the 11 model offtake nodes) ── */
export function junctionSim(j: EpanetJunction) {
  const s = seedOf(j.id);
  const df = demandFactorNow();
  return {
    demandNow: j.demand * (0.6 + df * 0.55),                     // L/s
    pressure: clamp(38 + wobble(s, 16) + df * 6, 8, 90),         // m
    hgl: j.elev + clamp(38 + wobble(s, 16) + df * 6, 8, 90),
  };
}
