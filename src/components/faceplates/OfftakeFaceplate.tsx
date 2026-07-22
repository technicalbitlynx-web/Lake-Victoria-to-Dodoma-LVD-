import React from 'react';
import { Gauge, SlidersHorizontal } from 'lucide-react';
import type { Site } from '../../types';
import { TagRow, MiniTrend } from '../TagValue';
import { useValves, useControl, useScada } from '../../context/ScadaContext';
import { VALVES_BY_SITE, VALVE_TYPE_COLORS } from '../../data/valveSpecs';
import type { ValveSpec } from '../../data/valveSpecs';
import { FLOWMETERS_BY_SITE } from '../../data/flowmeterSpecs';

interface Props { site: Site; }

/* Live valve row with SCADA commands — used for every offtake valve */
function ValveRow({ spec }: { spec: ValveSpec }) {
  const valves = useValves();
  const { enabled, setValve } = useControl();
  const rt = valves[spec.id];
  if (!rt) return null;
  const color = VALVE_TYPE_COLORS[spec.type];
  const canCtl = enabled && spec.controllable && !rt.fault && rt.mode === 'REMOTE';

  return (
    <div className="py-1.5 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rotate-45 flex-shrink-0" style={{ background: color }} />
        <span className="font-semibold text-gray-200 truncate flex-1">{spec.name}</span>
        <span className="font-mono text-gray-500" style={{ fontSize: 9 }}>DN{spec.dn}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Position bar */}
        <div className="flex-1">
          <div className="flex justify-between" style={{ fontSize: 9 }}>
            <span className="font-bold" style={{ color: rt.status === 'FAULT' ? '#ef4444' : rt.moving ? '#f59e0b' : color }}>
              {rt.status}{rt.status === 'THROTTLING' ? ` ${rt.position.toFixed(0)}%` : ''}
            </span>
            <span className="font-mono text-gray-500">{rt.position.toFixed(0)}%{spec.setpoint_bar !== undefined ? ` · set ${spec.setpoint_bar} bar` : ''}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${rt.position}%`, background: rt.moving ? '#f59e0b' : color }} />
          </div>
        </div>
        {/* Commands */}
        <div className="flex gap-1 flex-shrink-0">
          <CmdBtn label="OPEN" color="#22c55e" disabled={!canCtl} onClick={() => setValve(spec.id, 100)} />
          {spec.type === 'PRV' && <CmdBtn label="50%" color="#60a5fa" disabled={!canCtl} onClick={() => setValve(spec.id, 50)} />}
          <CmdBtn label="CLOSE" color="#ef4444" disabled={!canCtl} onClick={() => setValve(spec.id, 0)} />
        </div>
      </div>
    </div>
  );
}

function CmdBtn({ label, color, disabled, onClick }: { label: string; color: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="px-1.5 py-0.5 rounded font-bold"
      style={{
        fontSize: 8,
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

export default function OfftakeFaceplate({ site }: Props) {
  const isDual = site.class === 'OFFTAKE_DUAL';
  const { state } = useScada();
  const siteValves = VALVES_BY_SITE(site.id);
  const meters = FLOWMETERS_BY_SITE(site.id);
  const controlEnabled = state.role === 'control_room' || state.role === 'site_engineer';

  return (
    <div className="p-3 text-xs">
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: '#831843', color: '#f472b6' }}>
          {isDual ? 'OFFTAKE DUAL' : 'OFFTAKE GRAVITY'}
        </span>
        <span className="text-gray-400">{site.chainage_km} km</span>
      </div>

      {/* Bulk billing flowmeter(s) */}
      {meters.map(m => (
        <div key={m.id} className="mb-3 p-2 rounded" style={{ background: '#0d1b2a', border: '1px solid rgba(34,211,238,0.15)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Gauge size={12} className="text-cyan-400" />
            <span className="font-semibold text-cyan-200 flex-1">{m.name}</span>
            <span className="font-mono text-gray-500" style={{ fontSize: 9 }}>DN{m.dn}</span>
          </div>
          <div className="text-gray-600 mb-1.5" style={{ fontSize: 9 }}>{m.id} · {m.meterType}</div>
          <TagRow tagId={m.flowTagId} label="Instantaneous Flow" />
          <TagRow tagId={m.totTagId} label="Totalised Volume" decimals={0} />
          <div className="mt-2"><MiniTrend tagId={m.flowTagId} /></div>
        </div>
      ))}

      {/* Pressures */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-1">Line Pressures</span>
        <TagRow tagId={`${site.id}-PT-UP`} label="Upstream Pressure" />
        {!isDual && <TagRow tagId={`${site.id}-PT-DN`} label="Downstream Pressure" />}
      </div>

      {/* SCADA valve control */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a', border: '1px solid rgba(96,165,250,0.15)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <SlidersHorizontal size={12} className="text-blue-400" />
          <span className="font-semibold text-blue-200">Offtake Valves — SCADA Control</span>
        </div>
        {!controlEnabled && (
          <div className="text-gray-600 mb-1" style={{ fontSize: 9 }}>
            View only — switch to Control Room / Site Engineer role to operate
          </div>
        )}
        {siteValves.length > 0
          ? siteValves.map(v => <ValveRow key={v.id} spec={v} />)
          : <div className="text-gray-600">No remote-operable valves at this offtake</div>}
      </div>

      {site.phase1?.pr_capacity_m3 && (
        <div className="p-2 rounded text-xs" style={{ background: '#0d1b2a' }}>
          <span className="text-gray-400">PR Capacity: </span>
          <span className="text-purple-300 font-mono">{(site.phase1.pr_capacity_m3 as number).toLocaleString()} m³</span>
        </div>
      )}
    </div>
  );
}
