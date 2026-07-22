import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Zap, Thermometer, Activity, AlertTriangle, CheckCircle, BarChart2, Droplets, Wind, Info, Play, Square, RotateCcw, Filter, SlidersHorizontal } from 'lucide-react';
import { useScada, useAlarms, useControl, useValves } from '../../context/ScadaContext';
import { ALL_SITES } from '../../simulator/tagGenerator';
import { PUMP_STATION_SPECS } from '../../data/pumpStationSpecs';
import { VALVES_BY_SITE, VALVE_TYPE_COLORS } from '../../data/valveSpecs';
import type { PumpStatus } from './Pump3D';
import Pump3D, { STATUS_COLORS } from './Pump3D';
import type { Site } from '../../types';

interface Props {
  siteId: string;
  onClose: () => void;
}

/* ── live tag helpers ── */
function useTagValue(tagId: string) {
  const { state } = useScada();
  return state.tags[tagId];
}

function getPumpStatus(tags: Record<string, import('../../types').Tag>, siteId: string, pumpNum: number, isStandby = false): PumpStatus {
  const run = tags[`${siteId}-P${pumpNum}-RUN`]?.value;
  const flt = tags[`${siteId}-P${pumpNum}-FLT`]?.value;
  if (flt === 1) return 'fault';
  if (run === 1) return 'running';
  return isStandby ? 'standby' : 'stopped';
}

/* ── Inline sparkline ── */
function Sparkline({ values, color = '#4f8ef7', width = 80, height = 24 }: {
  values: number[]; color?: string; width?: number; height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * height}`
  ).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Alarm tooltip popup ── */
function AlarmBadge({ alarms }: { alarms: import('../../types').Alarm[] }) {
  const [show, setShow] = useState(false);
  if (alarms.length === 0) return null;
  const critical = alarms.filter(a => a.priority === 'critical').length;
  return (
    <div className="relative">
      <button
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
        style={{ background: critical > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)', color: critical > 0 ? '#ef4444' : '#f59e0b', border: `1px solid ${critical > 0 ? '#7f1d1d' : '#78350f'}` }}
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      >
        <AlertTriangle size={10} className={critical > 0 ? 'alarm-blink' : ''} />
        {alarms.length} ALARM{alarms.length > 1 ? 'S' : ''}
      </button>
      {show && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-64 rounded-xl text-xs"
          style={{ background: 'rgba(15,17,23,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(239,68,68,0.4)', boxShadow: '0 8px 32px rgba(0,0,0,0.8)' }}>
          <div className="px-3 py-2 font-semibold text-red-300 border-b" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>Active Alarms</div>
          {alarms.slice(0, 5).map(a => (
            <div key={a.id} className="px-3 py-1.5 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="font-semibold" style={{ color: a.priority === 'critical' ? '#fca5a5' : '#fde68a' }}>{a.priority.toUpperCase()}</span>
              <span className="text-gray-400 ml-2">{a.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Individual pump card ── */
function PumpCard({ siteId, pumpNum, pumpType, isStandby, dutyFlow, dutyHead, motorKw }: {
  siteId: string; pumpNum: number; pumpType: 'VTP' | 'HSC' | 'DSV' | 'SUBMERSIBLE';
  isStandby: boolean; dutyFlow: number; dutyHead: number; motorKw: number;
}) {
  const { state } = useScada();
  const { tags } = state;
  const [expanded, setExpanded] = useState(false);
  const { enabled: controlEnabled, startPump, stopPump, resetPump } = useControl();

  const status = getPumpStatus(tags, siteId, pumpNum, isStandby);
  const col = STATUS_COLORS[status];
  const isRunning = status === 'running';

  const curr = tags[`${siteId}-P${pumpNum}-CURR`]?.value ?? 0;
  const kw = tags[`${siteId}-P${pumpNum}-KW`] ?? tags[`${siteId}-P${pumpNum}-KWH`];
  const kwVal = kw?.value ?? 0;
  const speed = tags[`${siteId}-P${pumpNum}-VFD-SPEED`]?.value;
  const freq = tags[`${siteId}-P${pumpNum}-VFD-FREQ`]?.value;
  const bearDE = tags[`${siteId}-P${pumpNum}-BTEMP-DE`]?.value ?? 0;
  const bearNDE = tags[`${siteId}-P${pumpNum}-BTEMP-NDE`]?.value ?? 0;
  const vib = tags[`${siteId}-P${pumpNum}-VIB`]?.value ?? 0;
  const runtime = tags[`${siteId}-P${pumpNum}-RUNTIME`]?.value ?? 0;
  const history = tags[`${siteId}-P${pumpNum}-CURR`]?.history.map(h => h.v) ?? [];

  const vibAlarm = vib > 7.1;
  const tempAlarm = bearDE > 85 || bearNDE > 85;

  const pumpModel = pumpType === 'VTP' ? 'VTP' : 'DSV';

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
      style={{
        background: `linear-gradient(145deg, rgba(17,24,39,0.95), rgba(10,22,40,0.98))`,
        border: `1px solid ${status === 'fault' ? 'rgba(239,68,68,0.5)' : status === 'running' ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.07)'}`,
        boxShadow: status === 'running' ? `0 0 20px ${col.glow}, 0 4px 24px rgba(0,0,0,0.5)` : '0 4px 24px rgba(0,0,0,0.4)',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ background: `linear-gradient(90deg, rgba(17,24,39,0.8), rgba(30,58,95,0.3))`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-3 h-3 rounded-full" style={{ background: col.primary, boxShadow: `0 0 8px ${col.glow}` }} />
            {status === 'running' && (
              <div className="absolute inset-0 rounded-full" style={{ background: col.primary, animation: 'ping 1.5s ease-out infinite' }} />
            )}
          </div>
          <span className="text-xs font-bold text-gray-200">P{pumpNum}</span>
          {isStandby && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 9 }}>STANDBY</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {(vibAlarm || tempAlarm) && <AlertTriangle size={11} className="text-red-400 alarm-blink" />}
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${col.primary}22`, color: col.primary, border: `1px solid ${col.primary}44` }}>
            {status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* 3D Pump illustration */}
      <div className="flex justify-center items-center py-3"
        style={{ background: 'linear-gradient(180deg, rgba(10,16,28,0.9), rgba(15,22,40,0.95))' }}>
        <div className="relative">
          <Pump3D status={status} pumpType={pumpModel} size={72} rpm={status === 'running' ? 1450 : 0} />
          {/* Discharge flow animation overlay — water rises up the column/riser */}
          {status === 'running' && (
            <div className="absolute top-1 right-0 w-1.5 h-8 rounded-full overflow-hidden" style={{ background: 'rgba(37,99,235,0.1)' }}>
              <div className="w-full rounded-full" style={{ height: '30%', background: 'rgba(96,165,250,0.6)', animation: 'flowUp 1.2s linear infinite' }} />
            </div>
          )}
        </div>
      </div>

      {/* Quick stats row — a stopped/tripped motor is de-energised: no current, no power */}
      {isRunning ? (
        <>
          <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="px-2 py-1.5 text-center" style={{ background: 'rgba(10,16,28,0.8)' }}>
              <div className="text-gray-600 mb-0.5" style={{ fontSize: 9 }}>CURRENT</div>
              <div className="font-mono font-bold text-xs" style={{ color: curr > motorKw * 0.9 ? '#ef4444' : '#60a5fa' }}>{curr.toFixed(0)} A</div>
            </div>
            <div className="px-2 py-1.5 text-center" style={{ background: 'rgba(10,16,28,0.8)' }}>
              <div className="text-gray-600 mb-0.5" style={{ fontSize: 9 }}>POWER</div>
              <div className="font-mono font-bold text-xs text-yellow-400">{kwVal.toFixed(0)} kW</div>
            </div>
          </div>
          <div className="px-2 py-1" style={{ background: 'rgba(10,16,28,0.8)' }}>
            <Sparkline values={history.slice(-20)} color={col.primary} width={110} height={18} />
          </div>
        </>
      ) : (
        <div className="px-2 py-2.5 text-center" style={{ background: 'rgba(10,16,28,0.8)' }}>
          <div className="font-mono font-semibold" style={{ fontSize: 10, color: status === 'fault' ? '#f87171' : '#6b7280' }}>
            {status === 'fault' ? 'TRIPPED — MOTOR DE-ENERGISED' : 'MOTOR STOPPED — 0 A · 0 kW'}
          </div>
        </div>
      )}

      {/* Operator controls */}
      <div className="flex gap-1 px-2 py-1.5" style={{ background: 'rgba(5,10,20,0.9)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
        onClick={e => e.stopPropagation()}>
        {status === 'fault' ? (
          <CtrlBtn label="RESET" icon={<RotateCcw size={9} />} color="#f59e0b" disabled={!controlEnabled}
            onClick={() => resetPump(siteId, pumpNum)} />
        ) : isRunning ? (
          <CtrlBtn label="STOP" icon={<Square size={9} />} color="#ef4444" disabled={!controlEnabled}
            onClick={() => stopPump(siteId, pumpNum)} />
        ) : (
          <CtrlBtn label="START" icon={<Play size={9} />} color="#22c55e" disabled={!controlEnabled}
            onClick={() => startPump(siteId, pumpNum)} />
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 py-2 text-xs space-y-1.5" style={{ background: 'rgba(5,10,20,0.9)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <DetailRow label="Duty Flow" val={`${(dutyFlow).toFixed(0)} m³/h`} color="#60a5fa" />
          <DetailRow label="Duty Head" val={`${dutyHead} m`} color="#60a5fa" />
          <DetailRow label="Motor Rating" val={`${motorKw} kW`} color="#fde68a" />
          {isRunning && speed !== undefined && <DetailRow label="VFD Speed" val={`${speed.toFixed(1)} %`} color="#a78bfa" />}
          {isRunning && freq !== undefined && <DetailRow label="VFD Freq" val={`${freq.toFixed(1)} Hz`} color="#a78bfa" />}
          {isRunning && <DetailRow label="Bearing DE" val={`${bearDE.toFixed(1)} °C`} color={bearDE > 85 ? '#ef4444' : '#34d399'} alarm={bearDE > 85} />}
          {isRunning && <DetailRow label="Bearing NDE" val={`${bearNDE.toFixed(1)} °C`} color={bearNDE > 85 ? '#ef4444' : '#34d399'} alarm={bearNDE > 85} />}
          {isRunning && <DetailRow label="Vibration" val={`${vib.toFixed(2)} mm/s`} color={vibAlarm ? '#ef4444' : '#34d399'} alarm={vibAlarm} />}
          <DetailRow label="Runtime" val={`${runtime.toFixed(0)} h`} color="#9ca3af" />
        </div>
      )}
    </div>
  );
}

function CtrlBtn({ label, icon, color, disabled, onClick }: {
  label: string; icon: React.ReactNode; color: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      className="flex-1 flex items-center justify-center gap-1 py-1 rounded font-bold transition-all"
      style={{
        fontSize: 9,
        background: disabled ? 'rgba(107,114,128,0.1)' : `${color}1c`,
        color: disabled ? '#4b5563' : color,
        border: `1px solid ${disabled ? 'rgba(107,114,128,0.2)' : `${color}55`}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      title={disabled ? 'Control requires Control Room or Site Engineer role' : undefined}
      disabled={disabled}
      onClick={onClick}
    >{icon}{label}</button>
  );
}

function DetailRow({ label, val, color, alarm }: { label: string; val: string; color: string; alarm?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="font-mono font-semibold flex items-center gap-1" style={{ color }}>
        {alarm && <AlertTriangle size={9} className="alarm-blink" />}{val}
      </span>
    </div>
  );
}

/* ── Filtration plant (WTP only) ── */
const BW_STATES = ['IDLE', 'DRAIN DOWN', 'AIR SCOUR', 'AIR + WATER', 'RINSE', 'RETURN TO SERVICE'];

function FiltrationSection({ siteId }: { siteId: string }) {
  const { state } = useScada();
  const { tags } = state;
  const bwState = tags[`${siteId}-BW-STATE`]?.value ?? 0;
  const coag = tags[`${siteId}-DT-001`]?.value ?? 0;
  const clDose = tags[`${siteId}-CL-DOSE`]?.value ?? 0;
  const clRes = tags[`${siteId}-CL-RES`]?.value ?? 0;
  const phOut = tags[`${siteId}-pHT-OUT`]?.value ?? 0;
  const ttOut = tags[`${siteId}-TT-OUT`]?.value ?? 0;
  const ttSettled = tags[`${siteId}-TT-001`]?.value ?? 0;

  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ background: 'rgba(10,16,30,0.7)', border: '1px solid rgba(52,211,153,0.15)' }}>
      <div className="flex items-center gap-2 px-4 py-2" style={{ background: 'rgba(6,78,59,0.25)', borderBottom: '1px solid rgba(52,211,153,0.12)' }}>
        <Filter size={14} className="text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-200">Filtration Plant — Rapid Gravity Filters</span>
        <span className="text-xs ml-auto px-2 py-0.5 rounded-full font-mono"
          style={{ background: bwState > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.12)', color: bwState > 0 ? '#f59e0b' : '#34d399' }}>
          BACKWASH: {BW_STATES[Math.min(Math.floor(bwState), 5)]}
        </span>
      </div>

      <div className="p-3 grid grid-cols-6 gap-2">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(n => {
          const dp = tags[`${siteId}-FILTER${n}-DP`]?.value ?? 0;
          const tt = tags[`${siteId}-FILTER${n}-TT`]?.value ?? 0;
          const needsBw = dp > 60;
          return (
            <div key={n} className="rounded-lg p-2.5" style={{ background: 'rgba(5,12,24,0.85)', border: `1px solid ${needsBw ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.06)'}` }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-200">FILTER {n}</span>
                <span className="font-semibold px-1.5 py-0.5 rounded" style={{ fontSize: 9, background: needsBw ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.12)', color: needsBw ? '#f59e0b' : '#34d399' }}>
                  {needsBw ? 'BW REQUIRED' : 'FILTERING'}
                </span>
              </div>
              {/* Headloss bar */}
              <div className="mb-1">
                <div className="flex justify-between" style={{ fontSize: 9 }}>
                  <span className="text-gray-600">Headloss</span>
                  <span className="font-mono" style={{ color: needsBw ? '#f59e0b' : '#60a5fa' }}>{dp.toFixed(0)} kPa</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, dp)}%`, background: needsBw ? '#f59e0b' : '#3b82f6' }} />
                </div>
              </div>
              <div className="flex justify-between" style={{ fontSize: 9 }}>
                <span className="text-gray-600">Filtrate turbidity</span>
                <span className="font-mono" style={{ color: tt > 1 ? '#ef4444' : '#34d399' }}>{tt.toFixed(2)} NTU</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dosing & treated water quality */}
      <div className="px-3 pb-3 grid grid-cols-6 gap-2 text-xs">
        <QualityPill label="Settled Turb" val={`${ttSettled.toFixed(1)} NTU`} ok={ttSettled < 10} />
        <QualityPill label="Coagulant" val={`${coag.toFixed(0)} L/h`} ok />
        <QualityPill label="Cl₂ Dosing" val={`${clDose.toFixed(1)} L/h`} ok />
        <QualityPill label="Cl₂ Residual" val={`${clRes.toFixed(2)} mg/L`} ok={clRes >= 0.2 && clRes <= 1.5} />
        <QualityPill label="pH Out" val={phOut.toFixed(2)} ok={phOut >= 6.5 && phOut <= 8.5} />
        <QualityPill label="Turb Out" val={`${ttOut.toFixed(2)} NTU`} ok={ttOut < 1} />
      </div>
    </div>
  );
}

function QualityPill({ label, val, ok }: { label: string; val: string; ok: boolean }) {
  return (
    <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: 'rgba(5,12,24,0.85)', border: `1px solid ${ok ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.4)'}` }}>
      <div className="text-gray-600" style={{ fontSize: 8, textTransform: 'uppercase' }}>{label}</div>
      <div className="font-mono font-bold" style={{ fontSize: 11, color: ok ? '#93c5fd' : '#ef4444' }}>{val}</div>
    </div>
  );
}

/* ── Station valves with SCADA control ── */
function StationValvesSection({ siteId }: { siteId: string }) {
  const valves = useValves();
  const { enabled: controlEnabled, setValve } = useControl();
  const siteValves = VALVES_BY_SITE(siteId);
  if (siteValves.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ background: 'rgba(10,16,30,0.7)', border: '1px solid rgba(96,165,250,0.15)' }}>
      <div className="flex items-center gap-2 px-4 py-2" style={{ background: 'rgba(30,58,95,0.3)', borderBottom: '1px solid rgba(96,165,250,0.12)' }}>
        <SlidersHorizontal size={14} className="text-blue-400" />
        <span className="text-sm font-semibold text-blue-200">Station Valves — SCADA Control</span>
        {!controlEnabled && <span className="text-xs ml-auto text-gray-600">View only — switch to Control Room / Site Engineer role to operate</span>}
      </div>
      <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {siteValves.map(spec => {
          const rt = valves[spec.id];
          if (!rt) return null;
          const color = VALVE_TYPE_COLORS[spec.type];
          const canCtl = controlEnabled && spec.controllable && !rt.fault;
          return (
            <div key={spec.id} className="flex items-center gap-3 px-3 py-2" style={{ background: 'rgba(6,12,24,0.9)' }}>
              <div className="w-2.5 h-2.5 rotate-45 flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-200 truncate">{spec.name}</div>
                <div className="font-mono text-gray-600" style={{ fontSize: 9 }}>
                  {spec.id} · DN{spec.dn} PN{spec.pn}{spec.setpoint_bar !== undefined ? ` · set ${spec.setpoint_bar} bar` : ''}
                </div>
              </div>
              {/* Position bar */}
              <div className="w-20 flex-shrink-0">
                <div className="flex justify-between" style={{ fontSize: 8 }}>
                  <span className="text-gray-600">{rt.status}</span>
                  <span className="font-mono text-gray-400">{rt.position.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${rt.position}%`, background: rt.moving ? '#f59e0b' : color }} />
                </div>
              </div>
              {/* Controls */}
              {spec.controllable ? (
                <div className="flex gap-1 flex-shrink-0">
                  <button className="px-1.5 py-0.5 rounded font-bold" style={{ fontSize: 8, background: canCtl ? 'rgba(34,197,94,0.13)' : 'rgba(107,114,128,0.08)', color: canCtl ? '#22c55e' : '#4b5563', border: `1px solid ${canCtl ? 'rgba(34,197,94,0.35)' : 'rgba(107,114,128,0.2)'}` }}
                    disabled={!canCtl} onClick={() => setValve(spec.id, 100)}>OPEN</button>
                  <button className="px-1.5 py-0.5 rounded font-bold" style={{ fontSize: 8, background: canCtl ? 'rgba(239,68,68,0.13)' : 'rgba(107,114,128,0.08)', color: canCtl ? '#ef4444' : '#4b5563', border: `1px solid ${canCtl ? 'rgba(239,68,68,0.35)' : 'rgba(107,114,128,0.2)'}` }}
                    disabled={!canCtl} onClick={() => setValve(spec.id, 0)}>CLOSE</button>
                </div>
              ) : (
                <span className="text-gray-700 flex-shrink-0" style={{ fontSize: 8 }}>{spec.actuation}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main modal ── */
export default function PumpStationModal({ siteId, onClose }: Props) {
  const { state } = useScada();
  const { tags, phase } = state;
  const allAlarms = useAlarms();
  const site = ALL_SITES.find(s => s.id === siteId);
  const spec = PUMP_STATION_SPECS[siteId];
  const modalRef = useRef<HTMLDivElement>(null);

  const phaseSpec = phase === 'ph1' ? spec?.ph1 : spec?.ph2;
  const totalPumps = phaseSpec ? phaseSpec.pumpsWorking + phaseSpec.pumpsStandby : 2;
  const siteAlarms = allAlarms.filter(a => a.site_id === siteId && !a.acknowledged);

  const flowTag = tags[`${siteId}-FT-001`];
  const suctionTag = tags[`${siteId}-PT-SUCT`];
  const delivTag = tags[`${siteId}-PT-DELY`];

  const runningCount = Array.from({ length: Math.min(totalPumps, 12) }, (_, i) =>
    getPumpStatus(tags, siteId, i + 1) === 'running' ? 1 : 0
  ).reduce<number>((a, b) => a + b, 0);

  const faultCount = Array.from({ length: Math.min(totalPumps, 12) }, (_, i) =>
    getPumpStatus(tags, siteId, i + 1) === 'fault' ? 1 : 0
  ).reduce<number>((a, b) => a + b, 0);

  const totalKw = Array.from({ length: Math.min(totalPumps, 12) }, (_, i) => {
    const kw = tags[`${siteId}-P${i + 1}-KW`] ?? tags[`${siteId}-P${i + 1}-KWH`];
    return kw?.value ?? 0;
  }).reduce((a, b) => a + b, 0);

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (!site || !spec || !phaseSpec) return null;

  const dutyFlowPerPump = phaseSpec.totalFlow_m3h / phaseSpec.pumpsWorking;
  const pumpModel = spec.pumpType === 'VTP' ? 'VTP' : 'DSV';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div ref={modalRef}
        className="relative flex flex-col rounded-2xl overflow-hidden"
        style={{
          width: 'min(96vw, 1200px)',
          maxHeight: '92vh',
          background: 'linear-gradient(160deg, rgba(10,16,30,0.98) 0%, rgba(5,10,22,0.99) 100%)',
          border: '1px solid rgba(79,142,247,0.2)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.07)',
          backdropFilter: 'blur(32px)',
        }}>

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-6 py-4"
          style={{ background: 'linear-gradient(90deg, rgba(15,24,42,0.95), rgba(30,58,95,0.4))', borderBottom: '1px solid rgba(79,142,247,0.15)' }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Station icon */}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, #1e3a5f, #0d1b2a)', border: '1px solid rgba(79,142,247,0.3)', boxShadow: '0 0 20px rgba(79,142,247,0.1)' }}>
                <Activity size={24} className="text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{spec.stationName}</h2>
                  {site.indicative_position && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>⚠ Indicative Position</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(79,142,247,0.15)', color: '#93c5fd' }}>
                    {spec.pumpTypeLabel}
                  </span>
                  {spec.vfdFitted && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
                      VFD Fitted
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{site.chainage_km} km chainage</span>
                  {site.elevation_masl && <span className="text-xs text-gray-500">{site.elevation_masl} masl</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <AlarmBadge alarms={siteAlarms} />
              <button onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-800"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                <X size={16} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-6 gap-3 mt-4">
            <KpiPill label="Running" val={`${runningCount} / ${phaseSpec.pumpsWorking}`} color="#22c55e" sub="duty pumps" />
            <KpiPill label="Faults" val={faultCount.toString()} color={faultCount > 0 ? '#ef4444' : '#22c55e'} sub="active" />
            <KpiPill label="Total Flow" val={flowTag ? `${(flowTag.value * 1.5).toFixed(0)} m³/h` : `${phaseSpec.totalFlow_m3h}`} color="#60a5fa" sub="m³/h duty" />
            <KpiPill label="Duty Head" val={`${phaseSpec.dutyHead_m} m`} color="#a78bfa" sub="TDH design" />
            <KpiPill label="Station Power" val={`${(totalKw / 1000).toFixed(1)} MW`} color="#fde68a" sub="total active" />
            <KpiPill label="Phase" val={phase === 'ph1' ? '1 · 2048' : '2 · 2068'} color={phase === 'ph1' ? '#60a5fa' : '#c084fc'} sub={`${phaseSpec.pumpsWorking}W + ${phaseSpec.pumpsStandby}S`} />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex gap-4">

            {/* Pump unit grid */}
            <div className="flex-1">
              {site.class === 'WTP' && <FiltrationSection siteId={siteId} />}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-gray-200">
                  Pump Set — {totalPumps} Units ({phaseSpec.pumpsWorking}W + {phaseSpec.pumpsStandby}S)
                </span>
                <span className="text-xs text-gray-600 ml-auto">Click pump to expand details</span>
              </div>

              <div className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${Math.min(totalPumps, 6)}, 1fr)` }}>
                {Array.from({ length: Math.min(totalPumps, 12) }, (_, i) => {
                  const pumpNum = i + 1;
                  const isStandby = pumpNum > phaseSpec.pumpsWorking;
                  return (
                    <PumpCard
                      key={pumpNum}
                      siteId={siteId}
                      pumpNum={pumpNum}
                      pumpType={spec.pumpType}
                      isStandby={isStandby}
                      dutyFlow={dutyFlowPerPump}
                      dutyHead={phaseSpec.dutyHead_m}
                      motorKw={phaseSpec.motorKw}
                    />
                  );
                })}
              </div>

              {/* Notes */}
              <div className="mt-4 px-3 py-2 rounded-lg text-xs flex items-start gap-2"
                style={{ background: 'rgba(30,58,95,0.2)', border: '1px solid rgba(79,142,247,0.1)' }}>
                <Info size={12} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-400">{spec.notes}</span>
              </div>

              {/* Station valves with SCADA control */}
              <StationValvesSection siteId={siteId} />
            </div>

            {/* Right panel — process data */}
            <div className="w-64 flex-shrink-0 space-y-3">
              {/* Process values */}
              <PanelCard title="Process Values" icon={<Droplets size={13} className="text-blue-400" />}>
                <ProcessRow label="Suction Pressure" val={suctionTag ? `${suctionTag.value.toFixed(2)} bar` : '—'} alarm={suctionTag?.alarm_state !== 'normal'} />
                <ProcessRow label="Delivery Pressure" val={delivTag ? `${delivTag.value.toFixed(2)} bar` : '—'} alarm={delivTag?.alarm_state !== 'normal'} />
                <ProcessRow label="Flow (inst.)" val={flowTag ? `${(flowTag.value * 1.5).toFixed(0)} m³/h` : '—'} />
                <ProcessRow label="Duty Flow/pump" val={`${dutyFlowPerPump.toFixed(0)} m³/h`} sub="design" />
              </PanelCard>

              {/* Design specs */}
              <PanelCard title="Design Specifications" icon={<BarChart2 size={13} className="text-purple-400" />}>
                <ProcessRow label="Phase 1 (2048)" val={`${spec.ph1.totalFlow_m3h} m³/h`} />
                <ProcessRow label="Phase 1 Head" val={`${spec.ph1.dutyHead_m} m`} />
                <ProcessRow label="Phase 1 Motor" val={`${spec.ph1.motorKw} kW/unit`} />
                <div className="border-t my-1.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
                <ProcessRow label="Phase 2 (2068)" val={`${spec.ph2.totalFlow_m3h} m³/h`} sub="uplift" />
                <ProcessRow label="Phase 2 Head" val={`${spec.ph2.dutyHead_m} m`} />
                <ProcessRow label="Phase 2 Motor" val={`${spec.ph2.motorKw} kW/unit`} />
              </PanelCard>

              {/* Energy */}
              <PanelCard title="Station Energy" icon={<Zap size={13} className="text-yellow-400" />}>
                <ProcessRow label="Total Active kW" val={`${totalKw.toFixed(0)} kW`} />
                <ProcessRow label="Intensity" val={flowTag && flowTag.value > 0 ? `${(totalKw / (flowTag.value * 1.5) * 1000).toFixed(2)} Wh/m³` : '—'} />
                <ProcessRow label="Rated kW (Ph1)" val={`${(phaseSpec.motorKw * phaseSpec.pumpsWorking / 1000).toFixed(1)} MW`} />
              </PanelCard>

              {/* Alarm list */}
              {siteAlarms.length > 0 && (
                <PanelCard title="Active Alarms" icon={<AlertTriangle size={13} className="text-red-400" />}>
                  {siteAlarms.slice(0, 5).map(a => (
                    <div key={a.id} className="py-1 border-b last:border-0 text-xs" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <div className="font-semibold mb-0.5" style={{ color: a.priority === 'critical' ? '#fca5a5' : '#fde68a' }}>
                        {a.priority.toUpperCase()}
                      </div>
                      <div className="text-gray-400 leading-relaxed">{a.description}</div>
                    </div>
                  ))}
                </PanelCard>
              )}

              {siteAlarms.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <CheckCircle size={13} className="text-green-400" />
                  <span className="text-green-300">No active alarms</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 px-6 py-3 flex items-center justify-between text-xs"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5,10,20,0.9)' }}>
          <div className="flex items-center gap-2 text-gray-600">
            <div className="w-2 h-2 rounded-full bg-green-500" style={{ animation: 'ping 2s ease-out infinite' }} />
            <span>Live · 5 s update interval · Modbus TCP/DNP3</span>
          </div>
          <div className="text-gray-700">Source: DDR Table 117/118 — {phase === 'ph1' ? '2048 design horizon' : '2068 design horizon'}</div>
          <div className="px-2 py-1 rounded" style={{ background: 'rgba(30,58,95,0.3)', color: '#60a5fa' }}>
            DEMONSTRATOR — SIMULATED CONTROL
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ping { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2.2); opacity: 0; } }
        @keyframes flowUp { 0% { transform: translateY(400%); } 100% { transform: translateY(-100%); } }
      `}</style>
    </div>
  );
}

function KpiPill({ label, val, color, sub }: { label: string; val: string; color: string; sub: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(10,16,30,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-gray-600 mb-0.5" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="font-mono font-bold text-sm" style={{ color }}>{val}</div>
      <div className="text-gray-700" style={{ fontSize: 9 }}>{sub}</div>
    </div>
  );
}

function PanelCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,16,30,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {icon}
        <span className="text-xs font-semibold text-gray-300">{title}</span>
      </div>
      <div className="px-3 py-2 text-xs space-y-1">{children}</div>
    </div>
  );
}

function ProcessRow({ label, val, alarm, sub }: { label: string; val: string; alarm?: boolean; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-gray-600">{label}</span>
      <div className="text-right">
        <span className={`font-mono font-semibold ${alarm ? 'text-red-400 alarm-blink' : 'text-gray-200'}`}>{val}</span>
        {sub && <div className="text-gray-700" style={{ fontSize: 9 }}>{sub}</div>}
      </div>
    </div>
  );
}
