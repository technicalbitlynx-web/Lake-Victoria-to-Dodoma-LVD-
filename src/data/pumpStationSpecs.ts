export type PumpType = 'VTP' | 'HSC' | 'DSV' | 'SUBMERSIBLE';

export interface PumpPhaseSpec {
  totalFlow_m3h: number;
  dutyHead_m: number;
  motorKw: number;
  pumpsWorking: number;
  pumpsStandby: number;
}

export interface PumpStationSpec {
  siteId: string;
  stationName: string;
  pumpType: PumpType;
  pumpTypeLabel: string;
  vfdFitted: boolean;
  ph1: PumpPhaseSpec;
  ph2: PumpPhaseSpec;
  notes: string;
}

// All data from Table 117/118 & Table 126 of 20260310 Draft Detailed Design Report
export const PUMP_STATION_SPECS: Record<string, PumpStationSpec> = {
  MBALIKA_INTAKE: {
    siteId: 'MBALIKA_INTAKE',
    stationName: 'Mbalika Raw Water Pumping Station',
    pumpType: 'VTP',
    pumpTypeLabel: 'Vertical Turbine Pump',
    vfdFitted: false,
    ph1: { totalFlow_m3h: 2914, dutyHead_m: 44, motorKw: 485, pumpsWorking: 9, pumpsStandby: 1 },
    ph2: { totalFlow_m3h: 3211, dutyHead_m: 44, motorKw: 535, pumpsWorking: 9, pumpsStandby: 1 },
    notes: 'Horizontal Split Case / Vertical Turbine, soft-starters, algal-control ultrasonic system',
  },
  MBALIKA_WTP: {
    siteId: 'MBALIKA_WTP',
    stationName: 'Mbalika Clear Water Pumping Station (CWPS)',
    pumpType: 'DSV',
    pumpTypeLabel: 'Double Suction Volute Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 2710, dutyHead_m: 313, motorKw: 3210, pumpsWorking: 10, pumpsStandby: 2 },
    ph2: { totalFlow_m3h: 2986, dutyHead_m: 322, motorKw: 3639, pumpsWorking: 10, pumpsStandby: 2 },
    notes: 'Pumps treated water to Mabale B balancing reservoir, 313 m total head',
  },
  MABALE_IBPS: {
    siteId: 'MABALE_IBPS',
    stationName: 'Mabale Intermediate Booster Pump Station',
    pumpType: 'VTP',
    pumpTypeLabel: 'Vertical Turbine Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 2710, dutyHead_m: 83, motorKw: 855, pumpsWorking: 10, pumpsStandby: 2 },
    ph2: { totalFlow_m3h: 4800, dutyHead_m: 83, motorKw: 1200, pumpsWorking: 18, pumpsStandby: 3 },
    notes: 'VFD-controlled, master-slave synchronisation',
  },
  SIBITI_IBPS1: {
    siteId: 'SIBITI_IBPS1',
    stationName: 'Sibiti Intermediate Booster Station — IBPS-1',
    pumpType: 'VTP',
    pumpTypeLabel: 'Vertical Turbine Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 2197, dutyHead_m: 275, motorKw: 2287, pumpsWorking: 10, pumpsStandby: 2 },
    ph2: { totalFlow_m3h: 2534, dutyHead_m: 276, motorKw: 2647, pumpsWorking: 10, pumpsStandby: 2 },
    notes: 'VFD with KEB kinetic energy buffering, fibre-optic peer-to-peer sync',
  },
  KIDARU_IBPS2: {
    siteId: 'KIDARU_IBPS2',
    stationName: 'Kidaru Intermediate Booster Station — IBPS-2',
    pumpType: 'VTP',
    pumpTypeLabel: 'Vertical Turbine Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 2197, dutyHead_m: 236, motorKw: 1962, pumpsWorking: 10, pumpsStandby: 2 },
    ph2: { totalFlow_m3h: 2534, dutyHead_m: 237, motorKw: 2273, pumpsWorking: 10, pumpsStandby: 2 },
    notes: '20,000 m³ suction tank; 7 VTP units per operational cluster',
  },
  KISIRIRI_IBPS3: {
    siteId: 'KISIRIRI_IBPS3',
    stationName: 'Kisiriri Intermediate Booster Station — IBPS-3',
    pumpType: 'VTP',
    pumpTypeLabel: 'Vertical Turbine Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 2197, dutyHead_m: 196, motorKw: 1630, pumpsWorking: 10, pumpsStandby: 2 },
    ph2: { totalFlow_m3h: 2534, dutyHead_m: 197, motorKw: 1889, pumpsWorking: 10, pumpsStandby: 2 },
    notes: '12,000 m³ intermediate balancing tank',
  },
  SINGIDA_PS: {
    siteId: 'SINGIDA_PS',
    stationName: 'Singida Branch Pump Station',
    pumpType: 'DSV',
    pumpTypeLabel: 'Double Suction Volute Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 1055, dutyHead_m: 199, motorKw: 794, pumpsWorking: 4, pumpsStandby: 1 },
    ph2: { totalFlow_m3h: 2133, dutyHead_m: 197, motorKw: 1590, pumpsWorking: 7, pumpsStandby: 2 },
    notes: 'Dual function: offtake metering + pumping to Singida PR at 1,781 masl',
  },
  KONDOA_PR: {
    siteId: 'KONDOA_PR',
    stationName: 'Kondoa Branch Pump Station',
    pumpType: 'DSV',
    pumpTypeLabel: 'Double Suction Volute Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 122, dutyHead_m: 339, motorKw: 158, pumpsWorking: 1, pumpsStandby: 1 },
    ph2: { totalFlow_m3h: 250, dutyHead_m: 339, motorKw: 320, pumpsWorking: 2, pumpsStandby: 1 },
    notes: 'Kondoa town distribution — future branch',
  },
  CHEMBA_PR: {
    siteId: 'CHEMBA_PR',
    stationName: 'Chemba Branch Pump Station',
    pumpType: 'DSV',
    pumpTypeLabel: 'Double Suction Volute Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 453, dutyHead_m: 259, motorKw: 446, pumpsWorking: 3, pumpsStandby: 1 },
    ph2: { totalFlow_m3h: 800, dutyHead_m: 259, motorKw: 789, pumpsWorking: 5, pumpsStandby: 1 },
    notes: 'Chemba town distribution — future branch',
  },
  NGHAMBALA_IBPS: {
    siteId: 'NGHAMBALA_IBPS',
    stationName: 'Nghambala Intermediate Booster Station',
    pumpType: 'VTP',
    pumpTypeLabel: 'Vertical Turbine Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 2169, dutyHead_m: 235, motorKw: 1929, pumpsWorking: 4, pumpsStandby: 1 },
    ph2: { totalFlow_m3h: 6165, dutyHead_m: 219, motorKw: 5110, pumpsWorking: 10, pumpsStandby: 2 },
    notes: 'Major Phase 2 uplift: 190,865 → 542,532 m³/d; survey coordinates pending',
  },
  NTYUKA_IBPS: {
    siteId: 'NTYUKA_IBPS',
    stationName: 'Ntyuka Intermediate Booster Station',
    pumpType: 'VTP',
    pumpTypeLabel: 'Vertical Turbine Pump',
    vfdFitted: true,
    ph1: { totalFlow_m3h: 2169, dutyHead_m: 215, motorKw: 1765, pumpsWorking: 4, pumpsStandby: 1 },
    ph2: { totalFlow_m3h: 6165, dutyHead_m: 212, motorKw: 4946, pumpsWorking: 10, pumpsStandby: 2 },
    notes: 'Final boost before UDOM balancing reservoir',
  },
};

export const PUMP_ENABLED_SITES = new Set(Object.keys(PUMP_STATION_SPECS));
