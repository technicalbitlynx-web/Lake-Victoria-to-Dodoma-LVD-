import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { ScadaState, ScadaAction, Tag, Alarm, ValveRuntime, Role } from '../types';
import { simulator } from '../simulator/simulator';

const initialState: ScadaState = {
  tags: simulator.getInitialState().tags,
  alarms: simulator.getInitialState().alarms,
  valves: simulator.getInitialState().valves,
  phase: 'ph1',
  role: 'control_room',
  selectedSite: null,
  activeScreen: 'overview',
  scenarioActive: null,
  connected: true,
};

function reducer(state: ScadaState, action: ScadaAction): ScadaState {
  switch (action.type) {
    case 'UPDATE_TAGS': return { ...state, tags: action.payload };
    case 'UPDATE_VALVES': return { ...state, valves: action.payload };
    case 'ADD_ALARM': return { ...state, alarms: [action.payload, ...state.alarms].slice(0, 500) };
    case 'ACK_ALARM':
      simulator.acknowledgeAlarm(action.payload.id, action.payload.by, action.payload.comment);
      return state;
    case 'SET_PHASE': return { ...state, phase: action.payload };
    case 'SET_ROLE': return { ...state, role: action.payload };
    case 'SET_SELECTED_SITE': return { ...state, selectedSite: action.payload };
    case 'SET_SCREEN': return { ...state, activeScreen: action.payload };
    case 'SET_SCENARIO': return { ...state, scenarioActive: action.payload };
    case 'SET_CONNECTED': return { ...state, connected: action.payload };
    default: return state;
  }
}

const ScadaContext = createContext<{
  state: ScadaState;
  dispatch: React.Dispatch<ScadaAction>;
} | null>(null);

export function ScadaProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    simulator.start();
    const unsub = simulator.subscribe((tags: Record<string, Tag>, _alarms: Alarm[], valves: Record<string, ValveRuntime>) => {
      dispatch({ type: 'UPDATE_TAGS', payload: tags });
      dispatch({ type: 'UPDATE_VALVES', payload: valves });
    });
    return () => { unsub(); simulator.stop(); };
  }, []);

  return (
    <ScadaContext.Provider value={{ state, dispatch }}>
      {children}
    </ScadaContext.Provider>
  );
}

export function useScada() {
  const ctx = useContext(ScadaContext);
  if (!ctx) throw new Error('useScada outside provider');
  return ctx;
}

export function useAlarms() {
  const [alarms, setAlarms] = React.useState<Alarm[]>(() => simulator.getInitialState().alarms);

  useEffect(() => {
    const unsub = simulator.subscribe((_tags, als) => setAlarms([...als]));
    return unsub;
  }, []);

  return alarms;
}

export function useValves() {
  const { state } = useScada();
  return state.valves;
}

/* Which roles are permitted to operate plant (pumps / valves) */
export function canOperate(role: Role): boolean {
  return role === 'control_room' || role === 'site_engineer';
}

/* Operator control hooks — commands are executed by the simulator (simulated plant) */
export function useControl() {
  const { state } = useScada();
  const enabled = canOperate(state.role);

  const startPump = useCallback((siteId: string, n: number) => enabled && simulator.commandPump(siteId, n, true), [enabled]);
  const stopPump = useCallback((siteId: string, n: number) => enabled && simulator.commandPump(siteId, n, false), [enabled]);
  const resetPump = useCallback((siteId: string, n: number) => { if (enabled) simulator.resetPumpFault(siteId, n); }, [enabled]);
  const setValve = useCallback((valveId: string, pos: number) => enabled && simulator.commandValve(valveId, pos), [enabled]);

  return { enabled, startPump, stopPump, resetPump, setValve };
}

export function useTriggerScenario() {
  const { dispatch } = useScada();
  return useCallback((name: string | null) => {
    if (name) simulator.triggerScenario(name);
    else simulator.clearScenario();
    dispatch({ type: 'SET_SCENARIO', payload: name });
  }, [dispatch]);
}
