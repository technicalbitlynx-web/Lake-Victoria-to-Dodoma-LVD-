import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, AlertTriangle, Gauge, Wind, ShieldAlert, Droplets, Lock } from 'lucide-react';
import { useValves, useControl, useScada } from '../context/ScadaContext';
import { VALVES, VALVE_TYPE_LABELS, VALVE_TYPE_COLORS } from '../data/valveSpecs';
import type { ValveType, ValveSpec } from '../data/valveSpecs';
import type { ValveRuntime } from '../types';

const TYPE_FILTERS: Array<{ id: ValveType | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All Valves' },
  { id: 'ISO', label: 'Isolation' },
  { id: 'BFV', label: 'Control / BFV' },
  { id: 'PRV', label: 'Pressure Reducing' },
  { id: 'PSV', label: 'Surge Relief' },
  { id: 'ARV', label: 'Air Valves' },
  { id: 'WO', label: 'Washouts' },
  { id: 'NRV', label: 'Check Valves' },
  { id: 'PENSTOCK', label: 'Penstocks' },
];

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#22c55e', CLOSED: '#6b7280', THROTTLING: '#60a5fa', MOVING: '#f59e0b',
  ARMED: '#34d399', LIFTED: '#ef4444', VENTING: '#38bdf8', OK: '#22c55e', FAULT: '#ef4444',
};

export default function ValveControl() {
  const valves = useValves();
  const { enabled: controlEnabled, setValve } = useControl();
  const { state } = useScada();
  const [typeFilter, setTypeFilter] = useState<ValveType | 'ALL'>('ALL');

  const filtered = useMemo(
    () => VALVES.filter(v => typeFilter === 'ALL' || v.type === typeFilter),
    [typeFilter]
  );

  const segments = useMemo(() => {
    const map = new Map<string, ValveSpec[]>();
    for (const v of [...filtered].sort((a, b) => a.chainage_km - b.chainage_km)) {
      if (!map.has(v.segment)) map.set(v.segment, []);
      map.get(v.segment)!.push(v);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const counts = useMemo(() => {
    const rts = VALVES.map(v => valves[v.id]).filter(Boolean) as ValveRuntime[];
    return {
      total: rts.length,
      open: rts.filter(r => r.status === 'OPEN' || r.status === 'OK' || r.status === 'ARMED').length,
      closed: rts.filter(r => r.status === 'CLOSED').length,
      throttling: rts.filter(r => r.status === 'THROTTLING').length,
      moving: rts.filter(r => r.status === 'MOVING').length,
      alerts: rts.filter(r => r.status === 'FAULT' || r.status === 'LIFTED').length,
    };
  }, [valves]);

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-3">
        <SlidersHorizontal size={18} className="text-blue-400" />
        <div>
          <h1 className="text-base font-bold text-gray-100">Critical Valve Control — Mbalika Intake → UDOM Reservoir</h1>
          <p className="text-xs text-gray-500">Isolation, control, pressure-reducing, surge-relief, air and washout valves · motorised valves are SCADA-operable</p>
        </div>
        {!controlEnabled && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
            <Lock size={12} />
            Role "{state.role.replace(/_/g, ' ')}" is view-only — switch to Control Room or Site Engineer to operate
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-6 gap-2 mb-3">
        <Kpi label="Total Valves" val={counts.total} color="#93c5fd" />
        <Kpi label="Open / Armed" val={counts.open} color="#22c55e" />
        <Kpi label="Closed" val={counts.closed} color="#9ca3af" />
        <Kpi label="Throttling" val={counts.throttling} color="#60a5fa" />
        <Kpi label="Moving" val={counts.moving} color="#f59e0b" />
        <Kpi label="Faults / Lifted" val={counts.alerts} color={counts.alerts > 0 ? '#ef4444' : '#22c55e'} />
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TYPE_FILTERS.map(f => (
          <button key={f.id}
            onClick={() => setTypeFilter(f.id)}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
            style={{
              background: typeFilter === f.id ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)',
              color: typeFilter === f.id ? '#93c5fd' : '#6b7280',
              border: `1px solid ${typeFilter === f.id ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.07)'}`,
            }}>
            {f.id !== 'ALL' && <span className="inline-block w-2 h-2 rotate-45 mr-1.5" style={{ background: VALVE_TYPE_COLORS[f.id as ValveType] }} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Segment groups */}
      <div className="space-y-4">
        {segments.map(([segment, specs]) => (
          <div key={segment} className="rounded-xl overflow-hidden" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2 px-4 py-2" style={{ background: 'rgba(30,58,95,0.25)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <Droplets size={13} className="text-blue-400" />
              <span className="text-sm font-semibold text-gray-200">{segment}</span>
              <span className="text-xs text-gray-600 ml-auto">km {specs[0].chainage_km.toFixed(0)}{specs.length > 1 ? ` – ${specs[specs.length - 1].chainage_km.toFixed(0)}` : ''}</span>
            </div>

            {/* Column headers */}
            <div className="grid px-4 py-1.5 text-gray-600 font-semibold"
              style={{ gridTemplateColumns: '2.4fr 1fr 0.8fr 1.4fr 1fr 1fr 1fr 1.4fr', fontSize: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span>VALVE</span><span>TYPE</span><span>DN / PN</span><span>POSITION</span>
              <span className="text-right">UPSTREAM</span><span className="text-right">DOWNSTREAM</span><span className="text-right">FLOW</span>
              <span className="text-center">COMMAND</span>
            </div>

            {specs.map(spec => {
              const rt = valves[spec.id];
              if (!rt) return null;
              return <ValveRow key={spec.id} spec={spec} rt={rt} controlEnabled={controlEnabled} setValve={setValve} />;
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 mb-2 text-xs text-gray-700 text-center">
        Valve register derived from 20260310 Draft Detailed Design Report · positions & pressures are simulated · commands act on the simulation only
      </div>
    </div>
  );
}

function ValveRow({ spec, rt, controlEnabled, setValve }: {
  spec: ValveSpec; rt: ValveRuntime; controlEnabled: boolean;
  setValve: (id: string, pos: number) => void;
}) {
  const color = VALVE_TYPE_COLORS[spec.type];
  const stColor = STATUS_COLORS[rt.status] ?? '#9ca3af';
  const canCtl = controlEnabled && spec.controllable && !rt.fault && rt.mode === 'REMOTE';
  const typeIcon = spec.type === 'ARV' ? <Wind size={11} /> : spec.type === 'PSV' ? <ShieldAlert size={11} /> : spec.type === 'PRV' ? <Gauge size={11} /> : null;

  return (
    <div className="grid items-center px-4 py-2 border-b last:border-0 hover:bg-white/[0.02] transition-colors"
      style={{ gridTemplateColumns: '2.4fr 1fr 0.8fr 1.4fr 1fr 1fr 1fr 1.4fr', borderColor: 'rgba(255,255,255,0.04)' }}>
      {/* Name */}
      <div className="min-w-0 pr-2">
        <div className="text-xs font-semibold text-gray-200 truncate flex items-center gap-1.5">
          {rt.status === 'FAULT' && <AlertTriangle size={10} className="text-red-400 alarm-blink" />}
          {spec.name}
        </div>
        <div className="font-mono text-gray-600" style={{ fontSize: 9 }}>{spec.id} · km {spec.chainage_km.toFixed(1)} · {spec.actuation}</div>
      </div>

      {/* Type */}
      <div className="flex items-center gap-1.5 text-xs" style={{ color }}>
        {typeIcon ?? <span className="inline-block w-2 h-2 rotate-45" style={{ background: color }} />}
        <span style={{ fontSize: 10 }}>{spec.type}</span>
      </div>

      {/* DN/PN */}
      <span className="font-mono text-gray-400" style={{ fontSize: 10 }}>DN{spec.dn}<br />PN{spec.pn}</span>

      {/* Position */}
      <div className="pr-3">
        <div className="flex justify-between mb-0.5" style={{ fontSize: 9 }}>
          <span className="font-bold" style={{ color: stColor }}>{rt.status}{rt.status === 'THROTTLING' ? ` ${rt.position.toFixed(0)}%` : ''}</span>
          {spec.type !== 'ARV' && spec.type !== 'PSV' && <span className="font-mono text-gray-500">{rt.position.toFixed(0)}%</span>}
          {spec.type === 'PSV' && <span className="font-mono text-gray-500">set {spec.setpoint_bar} bar</span>}
        </div>
        {spec.type !== 'ARV' && (
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${rt.position}%`, background: rt.moving ? '#f59e0b' : stColor }} />
          </div>
        )}
      </div>

      {/* Pressures & flow */}
      <span className="font-mono text-right text-gray-300" style={{ fontSize: 10 }}>{rt.upstream_bar.toFixed(1)} bar</span>
      <span className="font-mono text-right" style={{ fontSize: 10, color: spec.type === 'PRV' ? '#facc15' : '#9ca3af' }}>
        {rt.downstream_bar > 0 ? `${rt.downstream_bar.toFixed(1)} bar` : '—'}
      </span>
      <span className="font-mono text-right text-blue-300" style={{ fontSize: 10 }}>
        {rt.flow_m3h > 0 ? `${rt.flow_m3h.toFixed(0)} m³/h` : '—'}
      </span>

      {/* Commands */}
      <div className="flex items-center justify-center gap-1">
        {spec.controllable ? (
          <>
            <CmdBtn label="OPEN" color="#22c55e" disabled={!canCtl} onClick={() => setValve(spec.id, 100)} />
            {(spec.type === 'PRV' || spec.type === 'BFV') && (
              <CmdBtn label="50%" color="#60a5fa" disabled={!canCtl} onClick={() => setValve(spec.id, 50)} />
            )}
            <CmdBtn label="CLOSE" color="#ef4444" disabled={!canCtl} onClick={() => setValve(spec.id, 0)} />
          </>
        ) : (
          <span className="text-gray-700" style={{ fontSize: 9 }}>
            {spec.actuation === 'AUTOMATIC' ? 'SELF-ACTING' : 'MANUAL — FIELD OP'}
          </span>
        )}
      </div>
    </div>
  );
}

function CmdBtn({ label, color, disabled, onClick }: { label: string; color: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="px-2 py-1 rounded font-bold transition-all"
      style={{
        fontSize: 9,
        background: disabled ? 'rgba(107,114,128,0.08)' : `${color}1c`,
        color: disabled ? '#4b5563' : color,
        border: `1px solid ${disabled ? 'rgba(107,114,128,0.2)' : `${color}55`}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      disabled={disabled}
      onClick={onClick}
    >{label}</button>
  );
}

function Kpi({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(17,24,39,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-gray-600" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="font-mono font-bold text-lg" style={{ color }}>{val}</div>
    </div>
  );
}
