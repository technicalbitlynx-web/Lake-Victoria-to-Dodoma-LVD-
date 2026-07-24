import React, { useState } from 'react';
import { useScada, useTriggerScenario } from '../context/ScadaContext';
import { Zap, Droplets, WifiOff, AlertTriangle, X, ChevronDown } from 'lucide-react';

const SCENARIOS = [
  { id: 'pump_trip', label: 'Pump Trip', icon: <Zap size={13} />, color: '#ef4444', desc: 'P1 trips at lead IBPS — standby auto-starts' },
  { id: 'burst', label: 'Pipe Burst', icon: <Droplets size={13} />, color: '#f59e0b', desc: 'Sudden pressure drop on gravity main' },
  { id: 'comms_fail', label: 'Comms Fail', icon: <WifiOff size={13} />, color: '#6b7280', desc: 'Kidaru IBPS-2 goes offline' },
  { id: 'turbidity', label: 'Turbidity Spike', icon: <AlertTriangle size={13} />, color: '#f59e0b', desc: 'Raw water NTU excursion at intake' },
];

export default function ScenarioPanel() {
  const { state } = useScada();
  const triggerScenario = useTriggerScenario();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
        style={{ background: state.scenarioActive ? '#450a0a' : '#1a2744', color: state.scenarioActive ? '#fca5a5' : '#93c5fd', border: `1px solid ${state.scenarioActive ? '#7f1d1d' : '#2e3250'}` }}
      >
        <Zap size={12} />
        {state.scenarioActive ? `SCENARIO: ${state.scenarioActive.replace('_', ' ').toUpperCase()}` : 'Inject Scenario'}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-72 rounded-lg p-2 z-50"
          style={{ background: '#111827', border: '1px solid #2e3250', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          <div className="text-xs text-gray-500 px-2 pb-2 border-b mb-2" style={{ borderColor: '#1e3a5f' }}>
            Scenario Injection Panel — Live Demo
          </div>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => { triggerScenario(s.id); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded mb-1 text-left hover:bg-gray-800 transition-colors"
              style={{ border: `1px solid ${state.scenarioActive === s.id ? s.color : 'transparent'}` }}>
              <span style={{ color: s.color }}>{s.icon}</span>
              <div>
                <div className="text-xs font-semibold text-gray-200">{s.label}</div>
                <div className="text-xs text-gray-500">{s.desc}</div>
              </div>
            </button>
          ))}
          {state.scenarioActive && (
            <button onClick={() => { triggerScenario(null); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-gray-400 hover:bg-gray-800 mt-1"
              style={{ border: '1px solid #374151' }}>
              <X size={12} /> Clear scenario — return to normal
            </button>
          )}
        </div>
      )}
    </div>
  );
}
