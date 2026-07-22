export type NodeClass = 'INTAKE' | 'WTP' | 'IBPS' | 'RESERVOIR' | 'OFFTAKE_GRAVITY' | 'OFFTAKE_DUAL' | 'OFFTAKE_PUMPED';
export type AlarmState = 'normal' | 'warning' | 'alarm' | 'comms';
export type AlarmPriority = 'critical' | 'high' | 'medium' | 'low';
export type Phase = 'ph1' | 'ph2';
export type Role = 'field_operator' | 'site_engineer' | 'control_room' | 'management';

export interface Site {
  id: string;
  name: string;
  class: NodeClass;
  elevation_masl: number | null;
  chainage_km: number;
  lat: number;
  lng: number;
  phase: string;
  phase1: Record<string, number | string | number[]>;
  phase2: Record<string, number | string | number[]>;
  indicative_position?: boolean;
  downstream_legs?: string[];
}

export interface Tag {
  tag_id: string;
  site_id: string;
  node_class: NodeClass;
  measurement: string;
  description: string;
  unit: string;
  signal: string;
  range: [number, number];
  alarm_low_low?: number;
  alarm_low?: number;
  alarm_high?: number;
  alarm_high_high?: number;
  poll_interval_s: number;
  phase: string;
  value: number;
  alarm_state: AlarmState;
  timestamp: number;
  history: { t: number; v: number }[];
}

export interface Alarm {
  id: string;
  tag_id: string;
  site_id: string;
  site_name: string;
  description: string;
  priority: AlarmPriority;
  state: AlarmState;
  timestamp: number;
  acknowledged: boolean;
  ack_by?: string;
  ack_comment?: string;
  value: number;
  unit: string;
}

export interface ValveRuntime {
  id: string;
  position: number;         // % open (0–100)
  target: number;           // commanded position %
  moving: boolean;
  mode: 'REMOTE' | 'LOCAL';
  fault: boolean;
  upstream_bar: number;
  downstream_bar: number;
  flow_m3h: number;
  status: string;           // OPEN | CLOSED | THROTTLING | MOVING | ARMED | LIFTED | VENTING | OK | FAULT
}

export interface ScadaState {
  tags: Record<string, Tag>;
  alarms: Alarm[];
  valves: Record<string, ValveRuntime>;
  phase: Phase;
  role: Role;
  selectedSite: string | null;
  activeScreen: string;
  scenarioActive: string | null;
  connected: boolean;
}

export type ScadaAction =
  | { type: 'UPDATE_TAGS'; payload: Record<string, Tag> }
  | { type: 'UPDATE_VALVES'; payload: Record<string, ValveRuntime> }
  | { type: 'ADD_ALARM'; payload: Alarm }
  | { type: 'ACK_ALARM'; payload: { id: string; by: string; comment: string } }
  | { type: 'SET_PHASE'; payload: Phase }
  | { type: 'SET_ROLE'; payload: Role }
  | { type: 'SET_SELECTED_SITE'; payload: string | null }
  | { type: 'SET_SCREEN'; payload: string }
  | { type: 'SET_SCENARIO'; payload: string | null }
  | { type: 'SET_CONNECTED'; payload: boolean };
