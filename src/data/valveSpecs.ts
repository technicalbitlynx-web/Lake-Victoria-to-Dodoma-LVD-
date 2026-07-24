/*
 * Critical valve & pipeline-fitting register — Mbalika Intake → UDOM Balancing Reservoir.
 * Station valves are attached to a siteId; line fittings (ARV / PSV / PRV / washout)
 * are positioned by chainage and interpolated onto the trunk alignment.
 */

export type ValveType = 'ISO' | 'NRV' | 'PRV' | 'PSV' | 'ARV' | 'WO' | 'PENSTOCK' | 'BFV';

export const VALVE_TYPE_LABELS: Record<ValveType, string> = {
  ISO: 'Isolation Valve',
  NRV: 'Non-Return (Check) Valve',
  PRV: 'Pressure Reducing Valve',
  PSV: 'Pressure Relief / Surge Valve',
  ARV: 'Air Release / Vacuum Valve',
  WO: 'Washout / Scour Valve',
  PENSTOCK: 'Penstock Gate',
  BFV: 'Butterfly / Control Valve',
};

export const VALVE_TYPE_COLORS: Record<ValveType, string> = {
  ISO: '#60a5fa',
  NRV: '#94a3b8',
  PRV: '#facc15',
  PSV: '#f87171',
  ARV: '#38bdf8',
  WO: '#a3a3a3',
  PENSTOCK: '#818cf8',
  BFV: '#34d399',
};

export interface ValveSpec {
  id: string;
  name: string;
  type: ValveType;
  siteId?: string;          // station-attached valve
  segment: string;          // grouping label on the Valve Control screen
  chainage_km: number;
  lat: number;
  lng: number;
  elev_masl?: number;       // ground elevation at the EPANET node
  dn: number;               // nominal diameter mm
  pn: number;               // pressure rating bar
  actuation: 'MOTORISED' | 'MANUAL' | 'AUTOMATIC';
  controllable: boolean;    // remote SCADA control possible
  defaultPosition: number;  // % open at start-up
  setpoint_bar?: number;    // PRV downstream setpoint / PSV set (lift) pressure
  basePressure_bar: number; // nominal upstream pressure for simulation
  maxFlow_m3h: number;
  onMap: boolean;           // rendered as fitting marker on Route Overview
  notes?: string;
}

/* Trunk alignment used to interpolate line-fitting coordinates */
const TRUNK: Array<{ km: number; lat: number; lng: number }> = [
  { km: 0, lat: -2.62, lng: 33.48 },     // Mbalika Intake
  { km: 1.5, lat: -2.63, lng: 33.50 },   // Mbalika WTP
  { km: 58, lat: -2.95, lng: 33.72 },    // Mabale IBPS
  { km: 62, lat: -2.98, lng: 33.75 },    // Mabale BR
  { km: 220, lat: -4.05, lng: 34.52 },   // GM-1/RM-2 alignment vertex (km 220)
  { km: 280, lat: -4.40, lng: 34.80 },   // Kidaru IBPS-2
  { km: 340, lat: -4.75, lng: 35.10 },   // Kisiriri IBPS-3
  { km: 360, lat: -4.90, lng: 35.20 },   // Kisana BR
  { km: 420, lat: -5.00, lng: 35.45 },   // Kwamtoro Junction
  { km: 555, lat: -5.88, lng: 35.60 },   // Nghambala IBPS
  { km: 578, lat: -6.00, lng: 35.70 },   // Ntyuka IBPS
  { km: 600, lat: -6.17, lng: 35.74 },   // UDOM BR
];

export function trunkPoint(km: number): { lat: number; lng: number } {
  if (km <= TRUNK[0].km) return { lat: TRUNK[0].lat, lng: TRUNK[0].lng };
  for (let i = 0; i < TRUNK.length - 1; i++) {
    const a = TRUNK[i], b = TRUNK[i + 1];
    if (km >= a.km && km <= b.km) {
      const f = (km - a.km) / (b.km - a.km || 1);
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
    }
  }
  const last = TRUNK[TRUNK.length - 1];
  return { lat: last.lat, lng: last.lng };
}

/* Helper builders */
function stationValve(p: Omit<ValveSpec, 'onMap'> & { onMap?: boolean }): ValveSpec {
  return { onMap: false, ...p };
}
function lineFitting(p: Omit<ValveSpec, 'lat' | 'lng' | 'onMap'>): ValveSpec {
  const { lat, lng } = trunkPoint(p.chainage_km);
  return { ...p, lat, lng, onMap: true };
}

const RAW_VALVES: ValveSpec[] = [
  /* ── Mbalika Intake & Raw Water Pumping Station (km 0) ── */
  stationValve({ id: 'V-INT-PEN1', name: 'Intake Penstock Gate', type: 'PENSTOCK', siteId: 'MBALIKA_INTAKE', segment: 'Mbalika Intake & RWPS', chainage_km: 0, lat: -2.62, lng: 33.48, dn: 2000, pn: 6, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 0.5, maxFlow_m3h: 3300, notes: 'Lake Victoria abstraction gate' }),
  stationValve({ id: 'V-INT-SUC1', name: 'RWPS Suction Header Isolation', type: 'ISO', siteId: 'MBALIKA_INTAKE', segment: 'Mbalika Intake & RWPS', chainage_km: 0, lat: -2.62, lng: 33.48, dn: 1600, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 0.8, maxFlow_m3h: 3300 }),
  stationValve({ id: 'V-INT-DIS1', name: 'RWPS Discharge Header Isolation', type: 'ISO', siteId: 'MBALIKA_INTAKE', segment: 'Mbalika Intake & RWPS', chainage_km: 0.2, lat: -2.622, lng: 33.484, dn: 1400, pn: 16, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 4.4, maxFlow_m3h: 3300 }),
  stationValve({ id: 'V-INT-NRV1', name: 'RWPS Discharge Check Valve', type: 'NRV', siteId: 'MBALIKA_INTAKE', segment: 'Mbalika Intake & RWPS', chainage_km: 0.2, lat: -2.622, lng: 33.484, dn: 1400, pn: 16, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 4.4, maxFlow_m3h: 3300 }),
  stationValve({ id: 'V-INT-PSV1', name: 'RWPS Surge Relief Valve', type: 'PSV', siteId: 'MBALIKA_INTAKE', segment: 'Mbalika Intake & RWPS', chainage_km: 0.3, lat: -2.621, lng: 33.486, dn: 600, pn: 16, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 8, basePressure_bar: 4.4, maxFlow_m3h: 900, onMap: true, notes: 'Protects raw water rising main against pump-trip surge' }),

  /* ── Mbalika WTP & Clear Water Pumping Station (km 1.5) ── */
  stationValve({ id: 'V-WTP-INL', name: 'WTP Raw Water Inlet Penstock', type: 'PENSTOCK', siteId: 'MBALIKA_WTP', segment: 'Mbalika WTP & CWPS', chainage_km: 1.5, lat: -2.63, lng: 33.50, dn: 1400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 2.1, maxFlow_m3h: 3300 }),
  // 12 rapid gravity filter beds, each with a motorised outlet control valve
  ...Array.from({ length: 12 }, (_, i) => stationValve({
    id: `V-WTP-F${i + 1}`, name: `Filter ${i + 1} Outlet Control Valve`, type: 'BFV' as ValveType,
    siteId: 'MBALIKA_WTP', segment: 'Mbalika WTP & CWPS', chainage_km: 1.5, lat: -2.63, lng: 33.50,
    dn: 400, pn: 10, actuation: 'MOTORISED' as const, controllable: true, defaultPosition: 75,
    basePressure_bar: 1.2, maxFlow_m3h: 280,
  })),
  stationValve({ id: 'V-WTP-BWS', name: 'Backwash Supply Valve', type: 'BFV', siteId: 'MBALIKA_WTP', segment: 'Mbalika WTP & CWPS', chainage_km: 1.5, lat: -2.63, lng: 33.50, dn: 800, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 0, basePressure_bar: 2.5, maxFlow_m3h: 1200 }),
  stationValve({ id: 'V-WTP-BWD', name: 'Backwash Drain Valve', type: 'BFV', siteId: 'MBALIKA_WTP', segment: 'Mbalika WTP & CWPS', chainage_km: 1.5, lat: -2.63, lng: 33.50, dn: 800, pn: 6, actuation: 'MOTORISED', controllable: true, defaultPosition: 0, basePressure_bar: 0.6, maxFlow_m3h: 1200 }),
  stationValve({ id: 'V-CWPS-SUC', name: 'CWPS Suction Header Isolation', type: 'ISO', siteId: 'MBALIKA_WTP', segment: 'Mbalika WTP & CWPS', chainage_km: 1.6, lat: -2.631, lng: 33.502, dn: 1600, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 0.9, maxFlow_m3h: 3000 }),
  stationValve({ id: 'V-CWPS-DIS', name: 'CWPS Discharge Header Isolation', type: 'ISO', siteId: 'MBALIKA_WTP', segment: 'Mbalika WTP & CWPS', chainage_km: 1.7, lat: -2.632, lng: 33.503, dn: 1200, pn: 40, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 31.3, maxFlow_m3h: 3000 }),
  stationValve({ id: 'V-CWPS-NRV', name: 'CWPS Discharge Check Valve', type: 'NRV', siteId: 'MBALIKA_WTP', segment: 'Mbalika WTP & CWPS', chainage_km: 1.7, lat: -2.632, lng: 33.503, dn: 1200, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 31.3, maxFlow_m3h: 3000 }),
  stationValve({ id: 'V-CWPS-PSV', name: 'CWPS Surge Anticipation Valve', type: 'PSV', siteId: 'MBALIKA_WTP', segment: 'Mbalika WTP & CWPS', chainage_km: 1.8, lat: -2.633, lng: 33.504, dn: 500, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 34, basePressure_bar: 31.3, maxFlow_m3h: 600, onMap: true, notes: '313 m duty head — surge vessel + anticipation valve protection' }),

  /* ── Rising Main RM-1: WTP → Mabale (km 1.5–58) ── */
  lineFitting({ id: 'V-RM1-ARV1', name: 'Air Valve AV-RM1-01 (high point)', type: 'ARV', segment: 'Rising Main RM-1 (WTP → Mabale)', chainage_km: 20, dn: 200, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 24, maxFlow_m3h: 0, notes: 'Dual-orifice air release & vacuum break' }),
  lineFitting({ id: 'V-RM1-WO1', name: 'Washout WO-RM1-01 (low point)', type: 'WO', segment: 'Rising Main RM-1 (WTP → Mabale)', chainage_km: 35, dn: 600, pn: 40, actuation: 'MANUAL', controllable: false, defaultPosition: 0, basePressure_bar: 27, maxFlow_m3h: 1400 }),
  lineFitting({ id: 'V-RM1-ARV2', name: 'Air Valve AV-RM1-02 (high point)', type: 'ARV', segment: 'Rising Main RM-1 (WTP → Mabale)', chainage_km: 45, dn: 200, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 18, maxFlow_m3h: 0 }),

  /* ── Mabale IBPS + Balancing Reservoir (km 58–62) ── */
  stationValve({ id: 'V-MAB-SUC', name: 'Mabale IBPS Suction Isolation', type: 'ISO', siteId: 'MABALE_IBPS', segment: 'Mabale IBPS & Reservoir', chainage_km: 58, lat: -2.95, lng: 33.72, dn: 1400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 1.2, maxFlow_m3h: 3000 }),
  stationValve({ id: 'V-MAB-DIS', name: 'Mabale IBPS Discharge Isolation', type: 'ISO', siteId: 'MABALE_IBPS', segment: 'Mabale IBPS & Reservoir', chainage_km: 58.2, lat: -2.951, lng: 33.721, dn: 1200, pn: 16, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 8.3, maxFlow_m3h: 3000 }),
  stationValve({ id: 'V-MAB-PSV', name: 'Mabale IBPS Surge Relief Valve', type: 'PSV', siteId: 'MABALE_IBPS', segment: 'Mabale IBPS & Reservoir', chainage_km: 58.3, lat: -2.952, lng: 33.722, dn: 400, pn: 16, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 10.5, basePressure_bar: 8.3, maxFlow_m3h: 500, onMap: true }),
  stationValve({ id: 'V-MBR-IN', name: 'Mabale BR Inlet Isolation', type: 'ISO', siteId: 'MABALE_BR', segment: 'Mabale IBPS & Reservoir', chainage_km: 62, lat: -2.98, lng: 33.75, dn: 1200, pn: 16, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 3.5, maxFlow_m3h: 3000 }),
  stationValve({ id: 'V-MBR-OUT', name: 'Mabale BR Outlet Isolation', type: 'ISO', siteId: 'MABALE_BR', segment: 'Mabale IBPS & Reservoir', chainage_km: 62, lat: -2.98, lng: 33.75, dn: 1400, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 4.2, maxFlow_m3h: 3000 }),
  stationValve({ id: 'V-MBR-SCR', name: 'Mabale BR Scour Valve', type: 'WO', siteId: 'MABALE_BR', segment: 'Mabale IBPS & Reservoir', chainage_km: 62, lat: -2.98, lng: 33.75, dn: 400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 0, basePressure_bar: 1.4, maxFlow_m3h: 600 }),

  /* ── Gravity Main GM-1: Mabale → Kidaru (km 62–220) ── */
  lineFitting({ id: 'V-GM1-ARV1', name: 'Air Valve AV-GM1-01', type: 'ARV', segment: 'Gravity Main GM-1 (Mabale → Kidaru)', chainage_km: 95, dn: 150, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 9, maxFlow_m3h: 0 }),
  lineFitting({ id: 'V-GM1-PRV1', name: 'PRV Station GM1-A (Shilembo drop)', type: 'PRV', segment: 'Gravity Main GM-1 (Mabale → Kidaru)', chainage_km: 120, dn: 800, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 65, setpoint_bar: 6, basePressure_bar: 12.5, maxFlow_m3h: 2800, notes: 'Breaks 1471 → 1365 masl gravity head; pilot-operated with SCADA setpoint' }),
  lineFitting({ id: 'V-GM1-WO1', name: 'Washout WO-GM1-01', type: 'WO', segment: 'Gravity Main GM-1 (Mabale → Kidaru)', chainage_km: 130, dn: 600, pn: 25, actuation: 'MANUAL', controllable: false, defaultPosition: 0, basePressure_bar: 8, maxFlow_m3h: 1400 }),
  lineFitting({ id: 'V-GM1-ARV2', name: 'Air Valve AV-GM1-02', type: 'ARV', segment: 'Gravity Main GM-1 (Mabale → Kidaru)', chainage_km: 150, dn: 150, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 7, maxFlow_m3h: 0 }),
  lineFitting({ id: 'V-GM1-PRV2', name: 'PRV Station GM1-B (Wishiteleja)', type: 'PRV', segment: 'Gravity Main GM-1 (Mabale → Kidaru)', chainage_km: 175, dn: 800, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 60, setpoint_bar: 5, basePressure_bar: 10.8, maxFlow_m3h: 2800 }),

  /* ── Rising Main RM-2: → Kidaru (km 220–280) ── */
  lineFitting({ id: 'V-RM2-ARV1', name: 'Air Valve AV-RM2-01', type: 'ARV', segment: 'Rising Main RM-2 (→ Kidaru)', chainage_km: 240, dn: 200, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 20, maxFlow_m3h: 0 }),
  lineFitting({ id: 'V-RM2-WO1', name: 'Washout WO-RM2-01', type: 'WO', segment: 'Rising Main RM-2 (→ Kidaru)', chainage_km: 255, dn: 600, pn: 40, actuation: 'MANUAL', controllable: false, defaultPosition: 0, basePressure_bar: 16, maxFlow_m3h: 1400 }),
  lineFitting({ id: 'V-RM2-ARV2', name: 'Air Valve AV-RM2-02', type: 'ARV', segment: 'Rising Main RM-2 (→ Kidaru)', chainage_km: 265, dn: 200, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 12, maxFlow_m3h: 0 }),

  /* ── Kidaru IBPS-2 (km 280) ── */
  stationValve({ id: 'V-KD2-SUC', name: 'Kidaru IBPS-2 Suction Isolation', type: 'ISO', siteId: 'KIDARU_IBPS2', segment: 'Kidaru IBPS-2', chainage_km: 280, lat: -4.40, lng: 34.80, dn: 1400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 1.4, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-KD2-DIS', name: 'Kidaru IBPS-2 Discharge Isolation', type: 'ISO', siteId: 'KIDARU_IBPS2', segment: 'Kidaru IBPS-2', chainage_km: 280.2, lat: -4.401, lng: 34.801, dn: 1200, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 23.6, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-KD2-PSV', name: 'Kidaru IBPS-2 Surge Relief Valve', type: 'PSV', siteId: 'KIDARU_IBPS2', segment: 'Kidaru IBPS-2', chainage_km: 280.3, lat: -4.402, lng: 34.802, dn: 500, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 26, basePressure_bar: 23.6, maxFlow_m3h: 600, onMap: true }),

  /* ── Rising Main RM-3: Kidaru → Kisiriri (km 280–340) ── */
  lineFitting({ id: 'V-RM3-ARV1', name: 'Air Valve AV-RM3-01', type: 'ARV', segment: 'Rising Main RM-3 (Kidaru → Kisiriri)', chainage_km: 305, dn: 200, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 15, maxFlow_m3h: 0 }),
  lineFitting({ id: 'V-RM3-WO1', name: 'Washout WO-RM3-01', type: 'WO', segment: 'Rising Main RM-3 (Kidaru → Kisiriri)', chainage_km: 320, dn: 600, pn: 25, actuation: 'MANUAL', controllable: false, defaultPosition: 0, basePressure_bar: 11, maxFlow_m3h: 1400 }),

  /* ── Kisiriri IBPS-3 & Kisana Reservoir (km 340–360) ── */
  stationValve({ id: 'V-KS3-SUC', name: 'Kisiriri IBPS-3 Suction Isolation', type: 'ISO', siteId: 'KISIRIRI_IBPS3', segment: 'Kisiriri IBPS-3 & Kisana BR', chainage_km: 340, lat: -4.75, lng: 35.10, dn: 1400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 1.3, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-KS3-DIS', name: 'Kisiriri IBPS-3 Discharge Isolation', type: 'ISO', siteId: 'KISIRIRI_IBPS3', segment: 'Kisiriri IBPS-3 & Kisana BR', chainage_km: 340.2, lat: -4.751, lng: 35.101, dn: 1200, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 19.6, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-KS3-PSV', name: 'Kisiriri IBPS-3 Surge Relief Valve', type: 'PSV', siteId: 'KISIRIRI_IBPS3', segment: 'Kisiriri IBPS-3 & Kisana BR', chainage_km: 340.3, lat: -4.752, lng: 35.102, dn: 500, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 21.5, basePressure_bar: 19.6, maxFlow_m3h: 600, onMap: true }),
  stationValve({ id: 'V-KBR-IN', name: 'Kisana BR Inlet Isolation', type: 'ISO', siteId: 'KISANA_BR', segment: 'Kisiriri IBPS-3 & Kisana BR', chainage_km: 360, lat: -4.90, lng: 35.20, dn: 1200, pn: 16, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 3.1, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-KBR-OUT', name: 'Kisana BR Outlet Isolation', type: 'ISO', siteId: 'KISANA_BR', segment: 'Kisiriri IBPS-3 & Kisana BR', chainage_km: 360, lat: -4.90, lng: 35.20, dn: 1400, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 3.8, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-KBR-SCR', name: 'Kisana BR Scour Valve', type: 'WO', siteId: 'KISANA_BR', segment: 'Kisiriri IBPS-3 & Kisana BR', chainage_km: 360, lat: -4.90, lng: 35.20, dn: 400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 0, basePressure_bar: 1.2, maxFlow_m3h: 600 }),

  /* ── Singida branch (km 370) ── */
  stationValve({ id: 'V-SGD-OFF', name: 'Singida Offtake Isolation', type: 'ISO', siteId: 'SINGIDA_PS', segment: 'Singida Branch', chainage_km: 370, lat: -4.82, lng: 34.75, dn: 800, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 6.5, maxFlow_m3h: 1200 }),
  stationValve({ id: 'V-SGD-DIS', name: 'Singida PS Discharge Isolation', type: 'ISO', siteId: 'SINGIDA_PS', segment: 'Singida Branch', chainage_km: 370.2, lat: -4.821, lng: 34.751, dn: 700, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 19.9, maxFlow_m3h: 1200 }),
  stationValve({ id: 'V-SGD-PSV', name: 'Singida PS Surge Relief Valve', type: 'PSV', siteId: 'SINGIDA_PS', segment: 'Singida Branch', chainage_km: 370.3, lat: -4.822, lng: 34.752, dn: 300, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 22, basePressure_bar: 19.9, maxFlow_m3h: 300, onMap: true }),

  /* ── Gravity Main GM-2: Kisana → Kwamtoro → Dodoma (km 360–555) ── */
  lineFitting({ id: 'V-GM2-PRV1', name: 'PRV Station GM2-A (Kisana drop)', type: 'PRV', segment: 'Gravity Main GM-2 (Kisana → Nghambala)', chainage_km: 400, dn: 800, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 60, setpoint_bar: 10, basePressure_bar: 16.2, maxFlow_m3h: 2500, notes: 'Breaks 1777 masl static head from Kisana BR' }),
  lineFitting({ id: 'V-GM2-ARV1', name: 'Air Valve AV-GM2-01', type: 'ARV', segment: 'Gravity Main GM-2 (Kisana → Nghambala)', chainage_km: 430, dn: 150, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 8, maxFlow_m3h: 0 }),
  lineFitting({ id: 'V-GM2-WO1', name: 'Washout WO-GM2-01', type: 'WO', segment: 'Gravity Main GM-2 (Kisana → Nghambala)', chainage_km: 445, dn: 600, pn: 25, actuation: 'MANUAL', controllable: false, defaultPosition: 0, basePressure_bar: 7, maxFlow_m3h: 1400 }),
  lineFitting({ id: 'V-GM2-ARV2', name: 'Air Valve AV-GM2-02', type: 'ARV', segment: 'Gravity Main GM-2 (Kisana → Nghambala)', chainage_km: 475, dn: 150, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 6, maxFlow_m3h: 0 }),
  lineFitting({ id: 'V-GM2-PRV2', name: 'PRV Station GM2-B (Bahi drop)', type: 'PRV', segment: 'Gravity Main GM-2 (Kisana → Nghambala)', chainage_km: 520, dn: 800, pn: 40, actuation: 'MOTORISED', controllable: true, defaultPosition: 55, setpoint_bar: 8, basePressure_bar: 22.4, maxFlow_m3h: 2500, notes: 'Largest gravity drop on scheme: 1629 → 932 masl toward Bahi' }),
  lineFitting({ id: 'V-GM2-ARV3', name: 'Air Valve AV-GM2-03', type: 'ARV', segment: 'Gravity Main GM-2 (Kisana → Nghambala)', chainage_km: 540, dn: 150, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 100, basePressure_bar: 9, maxFlow_m3h: 0 }),

  /* ── Kwamtoro Junction dual offtake (km 420) ── */
  stationValve({ id: 'V-KWM-A', name: 'Kwamtoro Isolation A (Kondoa leg)', type: 'ISO', siteId: 'KWAMTORO_JCT', segment: 'Kwamtoro Junction', chainage_km: 420, lat: -5.00, lng: 35.45, dn: 500, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 7.8, maxFlow_m3h: 300 }),
  stationValve({ id: 'V-KWM-B', name: 'Kwamtoro Isolation B (Chemba leg)', type: 'ISO', siteId: 'KWAMTORO_JCT', segment: 'Kwamtoro Junction', chainage_km: 420, lat: -5.00, lng: 35.45, dn: 600, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 7.8, maxFlow_m3h: 550 }),

  /* ── Kondoa & Chemba branch pump stations ── */
  stationValve({ id: 'V-KND-SUC', name: 'Kondoa PS Suction Isolation', type: 'ISO', siteId: 'KONDOA_PR', segment: 'Kondoa Branch', chainage_km: 460, lat: -4.90, lng: 35.78, dn: 400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 1.1, maxFlow_m3h: 300 }),
  stationValve({ id: 'V-KND-DIS', name: 'Kondoa PS Discharge Isolation', type: 'ISO', siteId: 'KONDOA_PR', segment: 'Kondoa Branch', chainage_km: 460.1, lat: -4.901, lng: 35.781, dn: 350, pn: 40, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 33.9, maxFlow_m3h: 300 }),
  stationValve({ id: 'V-KND-PSV', name: 'Kondoa PS Surge Relief Valve', type: 'PSV', siteId: 'KONDOA_PR', segment: 'Kondoa Branch', chainage_km: 460.2, lat: -4.902, lng: 35.782, dn: 200, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 36, basePressure_bar: 33.9, maxFlow_m3h: 150, onMap: true }),
  stationValve({ id: 'V-CHB-SUC', name: 'Chemba PS Suction Isolation', type: 'ISO', siteId: 'CHEMBA_PR', segment: 'Chemba Branch', chainage_km: 450, lat: -5.35, lng: 36.22, dn: 500, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 1.1, maxFlow_m3h: 550 }),
  stationValve({ id: 'V-CHB-DIS', name: 'Chemba PS Discharge Isolation', type: 'ISO', siteId: 'CHEMBA_PR', segment: 'Chemba Branch', chainage_km: 450.1, lat: -5.351, lng: 36.221, dn: 450, pn: 40, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 25.9, maxFlow_m3h: 550 }),
  stationValve({ id: 'V-CHB-PSV', name: 'Chemba PS Surge Relief Valve', type: 'PSV', siteId: 'CHEMBA_PR', segment: 'Chemba Branch', chainage_km: 450.2, lat: -5.352, lng: 36.222, dn: 200, pn: 40, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 28, basePressure_bar: 25.9, maxFlow_m3h: 150, onMap: true }),

  /* ── Gravity offtake isolation valves (motorised, SCADA-operable shut-off per offtake) ── */
  stationValve({ id: 'V-OFF-MAB-ISO', name: 'Mabale PR Offtake Isolation', type: 'ISO', siteId: 'MABALE_PR', segment: 'Gravity Offtakes', chainage_km: 63, lat: -2.99, lng: 33.76, dn: 300, pn: 16, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 6.5, maxFlow_m3h: 350 }),
  stationValve({ id: 'V-OFF-SHI-ISO', name: 'Shilembo Offtake Isolation', type: 'ISO', siteId: 'SHILEMBO_PR', segment: 'Gravity Offtakes', chainage_km: 120, lat: -3.42, lng: 34.05, dn: 250, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 6, maxFlow_m3h: 250 }),
  stationValve({ id: 'V-OFF-WIS-ISO', name: 'Wishiteleja Offtake Isolation', type: 'ISO', siteId: 'WISHITELEJA_PR', segment: 'Gravity Offtakes', chainage_km: 175, lat: -3.75, lng: 34.30, dn: 300, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 5.5, maxFlow_m3h: 400 }),
  stationValve({ id: 'V-OFF-ISA-ISO', name: 'Isalanda Offtake Isolation', type: 'ISO', siteId: 'ISALANDA_PR', segment: 'Gravity Offtakes', chainage_km: 470, lat: -5.45, lng: 35.55, dn: 250, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 7, maxFlow_m3h: 300 }),
  stationValve({ id: 'V-OFF-MKW-ISO', name: 'Mkwese Offtake Isolation', type: 'ISO', siteId: 'MKWESE_PR', segment: 'Gravity Offtakes', chainage_km: 510, lat: -5.70, lng: 35.65, dn: 250, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 8.5, maxFlow_m3h: 300 }),
  stationValve({ id: 'V-OFF-BAH-ISO', name: 'Bahi Offtake Isolation', type: 'ISO', siteId: 'BAHI_PR', segment: 'Gravity Offtakes', chainage_km: 545, lat: -5.95, lng: 35.33, dn: 300, pn: 40, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 12, maxFlow_m3h: 400 }),

  /* ── Gravity offtake PRVs ── */
  stationValve({ id: 'V-OFF-MAB', name: 'Mabale PR Offtake PRV', type: 'PRV', siteId: 'MABALE_PR', segment: 'Gravity Offtakes', chainage_km: 63, lat: -2.99, lng: 33.76, dn: 300, pn: 16, actuation: 'MOTORISED', controllable: true, defaultPosition: 55, setpoint_bar: 4, basePressure_bar: 6.5, maxFlow_m3h: 350, onMap: true }),
  stationValve({ id: 'V-OFF-SHI', name: 'Shilembo Offtake PRV', type: 'PRV', siteId: 'SHILEMBO_PR', segment: 'Gravity Offtakes', chainage_km: 120, lat: -3.42, lng: 34.05, dn: 250, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 50, setpoint_bar: 3.5, basePressure_bar: 6, maxFlow_m3h: 250, onMap: true }),
  stationValve({ id: 'V-OFF-WIS', name: 'Wishiteleja Offtake PRV', type: 'PRV', siteId: 'WISHITELEJA_PR', segment: 'Gravity Offtakes', chainage_km: 175, lat: -3.75, lng: 34.30, dn: 300, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 55, setpoint_bar: 3.5, basePressure_bar: 5.5, maxFlow_m3h: 400, onMap: true }),
  stationValve({ id: 'V-OFF-ISA', name: 'Isalanda Offtake PRV', type: 'PRV', siteId: 'ISALANDA_PR', segment: 'Gravity Offtakes', chainage_km: 470, lat: -5.45, lng: 35.55, dn: 250, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 50, setpoint_bar: 3, basePressure_bar: 7, maxFlow_m3h: 300, onMap: true }),
  stationValve({ id: 'V-OFF-MKW', name: 'Mkwese Offtake PRV', type: 'PRV', siteId: 'MKWESE_PR', segment: 'Gravity Offtakes', chainage_km: 510, lat: -5.70, lng: 35.65, dn: 250, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 50, setpoint_bar: 3, basePressure_bar: 8.5, maxFlow_m3h: 300, onMap: true }),
  stationValve({ id: 'V-OFF-BAH', name: 'Bahi Offtake PRV', type: 'PRV', siteId: 'BAHI_PR', segment: 'Gravity Offtakes', chainage_km: 545, lat: -5.95, lng: 35.33, dn: 300, pn: 40, actuation: 'MOTORISED', controllable: true, defaultPosition: 45, setpoint_bar: 3.5, basePressure_bar: 12, maxFlow_m3h: 400, onMap: true, notes: 'High inlet pressure — downstream of 697 m gravity drop' }),

  /* ── Nghambala & Ntyuka IBPS (km 555–578) ── */
  stationValve({ id: 'V-NGH-SUC', name: 'Nghambala IBPS Suction Isolation', type: 'ISO', siteId: 'NGHAMBALA_IBPS', segment: 'Nghambala IBPS', chainage_km: 555, lat: -5.88, lng: 35.60, dn: 1400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 1.6, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-NGH-DIS', name: 'Nghambala IBPS Discharge Isolation', type: 'ISO', siteId: 'NGHAMBALA_IBPS', segment: 'Nghambala IBPS', chainage_km: 555.2, lat: -5.881, lng: 35.601, dn: 1200, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 23.5, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-NGH-PSV', name: 'Nghambala IBPS Surge Relief Valve', type: 'PSV', siteId: 'NGHAMBALA_IBPS', segment: 'Nghambala IBPS', chainage_km: 555.3, lat: -5.882, lng: 35.602, dn: 500, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 26, basePressure_bar: 23.5, maxFlow_m3h: 600, onMap: true }),
  stationValve({ id: 'V-NTY-SUC', name: 'Ntyuka IBPS Suction Isolation', type: 'ISO', siteId: 'NTYUKA_IBPS', segment: 'Ntyuka IBPS', chainage_km: 578, lat: -6.00, lng: 35.70, dn: 1400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 1.5, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-NTY-DIS', name: 'Ntyuka IBPS Discharge Isolation', type: 'ISO', siteId: 'NTYUKA_IBPS', segment: 'Ntyuka IBPS', chainage_km: 578.2, lat: -6.001, lng: 35.701, dn: 1200, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 21.5, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-NTY-PSV', name: 'Ntyuka IBPS Surge Relief Valve', type: 'PSV', siteId: 'NTYUKA_IBPS', segment: 'Ntyuka IBPS', chainage_km: 578.3, lat: -6.002, lng: 35.702, dn: 500, pn: 25, actuation: 'AUTOMATIC', controllable: false, defaultPosition: 0, setpoint_bar: 24, basePressure_bar: 21.5, maxFlow_m3h: 600, onMap: true }),

  /* ── UDOM Balancing Reservoir (km 600) ── */
  lineFitting({ id: 'V-UDM-PRV', name: 'UDOM Inlet PRV', type: 'PRV', segment: 'UDOM Terminal Reservoir', chainage_km: 598, dn: 800, pn: 25, actuation: 'MOTORISED', controllable: true, defaultPosition: 60, setpoint_bar: 4, basePressure_bar: 9.5, maxFlow_m3h: 2500, notes: 'Terminal pressure control before reservoir inlet' }),
  stationValve({ id: 'V-UDM-IN', name: 'UDOM BR Inlet Flow Control Valve', type: 'BFV', siteId: 'UDOM_BR', segment: 'UDOM Terminal Reservoir', chainage_km: 600, lat: -6.17, lng: 35.74, dn: 1000, pn: 16, actuation: 'MOTORISED', controllable: true, defaultPosition: 70, basePressure_bar: 4, maxFlow_m3h: 2500, notes: 'Modulating inlet control — level-based flow modulation' }),
  stationValve({ id: 'V-UDM-ISO', name: 'UDOM BR Inlet Isolation', type: 'ISO', siteId: 'UDOM_BR', segment: 'UDOM Terminal Reservoir', chainage_km: 600, lat: -6.17, lng: 35.74, dn: 1200, pn: 16, actuation: 'MOTORISED', controllable: true, defaultPosition: 100, basePressure_bar: 4, maxFlow_m3h: 2500 }),
  stationValve({ id: 'V-UDM-SCR', name: 'UDOM BR Scour Valve', type: 'WO', siteId: 'UDOM_BR', segment: 'UDOM Terminal Reservoir', chainage_km: 600, lat: -6.17, lng: 35.74, dn: 400, pn: 10, actuation: 'MOTORISED', controllable: true, defaultPosition: 0, basePressure_bar: 1.3, maxFlow_m3h: 600 }),
];

/* ── Snap onto the MBALIKA2068 EPANET alignment ──
 * scripts/snap-fittings.mjs traces the real main path through the model,
 * snaps every SCADA site to its model node, repositions the in-line PRV
 * stations, and generates air valves / washouts at the true local
 * high/low points of the network elevation profile. */
import SNAP from './network/snap.json';

interface SnapPoint { lat: number; lng: number; elev: number; nodeId: string; chainage_km?: number }
const snapSites = SNAP.sites as Record<string, SnapPoint>;
const lineOverrides = SNAP.lineOverrides as Record<string, SnapPoint>;

interface SnapFitting {
  id: string; type: string; name: string; chainage_km: number;
  lat: number; lng: number; elev: number; nodeId: string; basePressure_bar: number;
}

const generatedLineFittings: ValveSpec[] = (SNAP.lineFittings as SnapFitting[]).map(f => ({
  id: f.id,
  name: f.name,
  type: f.type as ValveType,
  segment: 'Trunk Main — EPANET Alignment',
  chainage_km: f.chainage_km,
  lat: f.lat,
  lng: f.lng,
  elev_masl: f.elev,
  dn: f.type === 'ARV' ? 200 : 600,
  pn: f.basePressure_bar > 16 ? 40 : 25,
  actuation: f.type === 'ARV' ? 'AUTOMATIC' : 'MANUAL',
  controllable: false,
  defaultPosition: f.type === 'ARV' ? 100 : 0,
  basePressure_bar: f.basePressure_bar,
  maxFlow_m3h: f.type === 'ARV' ? 0 : 1400,
  onMap: true,
  notes: f.type === 'ARV'
    ? `Local high point (${f.elev} masl) on the modelled alignment — dual-orifice air release & vacuum break`
    : `Local low point (${f.elev} masl) on the modelled alignment — sediment flushing / drain-down`,
}));

export const VALVES: ValveSpec[] = [
  // station valves + in-line PRVs, repositioned onto the EPANET network
  ...RAW_VALVES
    .filter(v => !((v.type === 'ARV' || v.type === 'WO') && !v.siteId))  // old schematic line fittings replaced
    .map(v => {
      if (v.siteId && snapSites[v.siteId]) {
        const s = snapSites[v.siteId];
        return { ...v, lat: s.lat, lng: s.lng, elev_masl: s.elev };
      }
      if (lineOverrides[v.id]) {
        const o = lineOverrides[v.id];
        return { ...v, lat: o.lat, lng: o.lng, elev_masl: o.elev, chainage_km: o.chainage_km ?? v.chainage_km };
      }
      return v;
    }),
  // air valves & washouts at the model's true elevation extremes
  ...generatedLineFittings,
];

export const VALVES_BY_ID: Record<string, ValveSpec> = Object.fromEntries(VALVES.map(v => [v.id, v]));
export const MAP_FITTINGS = VALVES.filter(v => v.onMap);
export const VALVES_BY_SITE = (siteId: string) => VALVES.filter(v => v.siteId === siteId);
