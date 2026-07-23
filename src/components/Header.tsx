import React, { useEffect, useState } from 'react';
import { Activity, Wifi, WifiOff, AlertTriangle, Droplets, Zap } from 'lucide-react';
import { useScada, useAlarms } from '../context/ScadaContext';

const SCREENS = [
  { id: 'overview', label: 'Route Overview' },
  { id: 'network', label: 'Network Model' },
  { id: 'hydraulic', label: 'Hydraulic Profile' },
  { id: 'balance', label: 'Water Balance' },
  { id: 'valves', label: 'Valve Control' },
  { id: 'loadsharing', label: 'Load Sharing' },
  { id: 'sync', label: 'Sync Link' },
  { id: 'alarms', label: 'Alarms & Events' },
  { id: 'trends', label: 'Trends' },
  { id: 'energy', label: 'Energy' },
  { id: 'security', label: 'Cybersecurity' },
];

const ROLES = ['field_operator', 'site_engineer', 'control_room', 'management'] as const;

export default function Header() {
  const { state, dispatch } = useScada();
  const alarms = useAlarms();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const unackedAlarms = alarms.filter(a => !a.acknowledged);
  const criticalCount = unackedAlarms.filter(a => a.priority === 'critical').length;
  const highCount = unackedAlarms.filter(a => a.priority === 'high').length;

  // KPI tags
  const { tags } = state;
  const intakeLevel = tags['MBALIKA_INTAKE-LT-001']?.value ?? 0;   // collection channel level (m)
  const rawInflow = tags['MBALIKA_WTP-FT-001']?.value ?? 0;        // raw water inlet flow (m³/h)
  const udomLevel = tags['UDOM_BR-LT-001']?.value ?? 0;            // reservoir level (m)

  return (
    <header className="flex-shrink-0" style={{ background: '#111827', borderBottom: '1px solid #1e3a5f' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: '#0d1b2a' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Droplets size={18} className="text-blue-400" />
            <span className="font-bold text-sm text-blue-300 tracking-wide">LVD SCADA</span>
            <span className="text-xs text-gray-500">Lake Victoria → Dodoma</span>
          </div>
          <div className="px-2 py-0.5 rounded text-xs font-mono" style={{ background: '#1e3a5f', color: '#60a5fa' }}>
            DEMONSTRATOR — SIMULATED CONTROL
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Phase toggle */}
          <div className="flex items-center gap-1 rounded overflow-hidden" style={{ border: '1px solid #2e3250' }}>
            <button
              className={`px-3 py-1 text-xs font-semibold transition-all ${state.phase === 'ph1' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'ph1' })}
            >Phase 1 (2048)</button>
            <button
              className={`px-3 py-1 text-xs font-semibold transition-all ${state.phase === 'ph2' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'ph2' })}
            >Phase 2 (2068)</button>
          </div>

          {/* Role */}
          <select
            value={state.role}
            onChange={e => dispatch({ type: 'SET_ROLE', payload: e.target.value as typeof state.role })}
            className="text-xs rounded px-2 py-1"
            style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}
          >
            {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>

          {/* Connection */}
          <div className="flex items-center gap-1.5 text-xs">
            {state.connected
              ? <><Wifi size={13} className="text-green-400" /><span className="text-green-400">LIVE SIM</span></>
              : <><WifiOff size={13} className="text-red-400" /><span className="text-red-400">OFFLINE</span></>}
          </div>

          <span className="text-xs text-gray-500 font-mono">{time.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Nav bar */}
      <div className="flex items-center justify-between px-3 py-1">
        <nav className="flex gap-0.5">
          {SCREENS.map(s => (
            <button
              key={s.id}
              onClick={() => dispatch({ type: 'SET_SCREEN', payload: s.id })}
              className={`px-3 py-1.5 text-xs rounded transition-all font-medium ${
                state.activeScreen === s.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >{s.label}</button>
          ))}
        </nav>

        {/* System KPIs */}
        <div className="flex items-center gap-4 text-xs">
          <KpiChip label="Intake Lvl" value={`${intakeLevel.toFixed(2)} m`} icon={<Droplets size={11} />} color="blue" />
          <KpiChip label="Raw Inflow" value={`${(rawInflow * 24 / 1000).toFixed(0)} MLD`} icon={<Activity size={11} />} color="green" />
          <KpiChip label="UDOM Level" value={`${udomLevel.toFixed(1)} m`} icon={<Droplets size={11} />} color="cyan" />
          <KpiChip label="Energy" value="18.4 kWh/m³" icon={<Zap size={11} />} color="yellow" />
          {unackedAlarms.length > 0 && (
            <button
              onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'alarms' })}
              className="flex items-center gap-1 px-2 py-1 rounded alarm-blink"
              style={{ background: '#450a0a', color: '#ef4444' }}
            >
              <AlertTriangle size={12} />
              <span className="font-bold">{criticalCount > 0 ? `${criticalCount} CRITICAL` : `${highCount} HIGH`}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function KpiChip({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: '#93c5fd', green: '#86efac', cyan: '#67e8f9', yellow: '#fde68a',
  };
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: '#1a2744' }}>
      <span style={{ color: colors[color] }}>{icon}</span>
      <span className="text-gray-500">{label}:</span>
      <span className="font-mono font-semibold" style={{ color: colors[color] }}>{value}</span>
    </div>
  );
}
