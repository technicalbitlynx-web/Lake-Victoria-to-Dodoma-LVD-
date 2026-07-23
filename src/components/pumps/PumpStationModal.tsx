import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Zap, Activity, AlertTriangle, CheckCircle, BarChart2, Droplets, Wind, Info, Play, Square, RotateCcw, Filter, SlidersHorizontal, ArrowLeft, Wrench, Clock, Gauge } from 'lucide-react';
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
function PumpCard({ siteId, pumpNum, pumpType, isStandby, dutyFlow, dutyHead, motorKw, selected, onSelect }: {
  siteId: string; pumpNum: number; pumpType: 'VTP' | 'HSC' | 'DSV' | 'SUBMERSIBLE';
  isStandby: boolean; dutyFlow: number; dutyHead: number; motorKw: number;
  selected?: boolean; onSelect?: () => void;
}) {
  const { state } = useScada();
  const { tags } = state;
  const { enabled: controlEnabled, startPump, stopPump, resetPump } = useControl();

  const status = getPumpStatus(tags, siteId, pumpNum, isStandby);
  const col = STATUS_COLORS[status];
  const isRunning = status === 'running';

  const curr = tags[`${siteId}-P${pumpNum}-CURR`]?.value ?? 0;
  const kw = tags[`${siteId}-P${pumpNum}-KW`] ?? tags[`${siteId}-P${pumpNum}-KWH`];
  const kwVal = kw?.value ?? 0;
  const bearDE = tags[`${siteId}-P${pumpNum}-BTEMP-DE`]?.value ?? 0;
  const bearNDE = tags[`${siteId}-P${pumpNum}-BTEMP-NDE`]?.value ?? 0;
  const vib = tags[`${siteId}-P${pumpNum}-VIB`]?.value ?? 0;
  const history = tags[`${siteId}-P${pumpNum}-CURR`]?.history.map(h => h.v) ?? [];

  const vibAlarm = vib > 7.1;
  const tempAlarm = bearDE > 85 || bearNDE > 85;

  const pumpModel = pumpType === 'VTP' ? 'VTP' : 'DSV';

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
      style={{
        background: `linear-gradient(145deg, rgba(17,24,39,0.95), rgba(10,22,40,0.98))`,
        border: `1px solid ${selected ? '#60a5fa' : status === 'fault' ? 'rgba(239,68,68,0.5)' : status === 'running' ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.07)'}`,
        boxShadow: selected ? '0 0 0 1px #60a5fa, 0 0 20px rgba(96,165,250,0.4)' : status === 'running' ? `0 0 20px ${col.glow}, 0 4px 24px rgba(0,0,0,0.5)` : '0 4px 24px rgba(0,0,0,0.4)',
      }}
      onClick={() => onSelect?.()}
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

      {/* Select-for-analytics hint */}
      <div className="px-2 py-1 text-center" style={{ background: 'rgba(5,10,20,0.9)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: 8.5, color: selected ? '#93c5fd' : '#4b5563' }}>{selected ? '▼ shown in detail pane →' : 'click for curve · condition · forecast'}</span>
      </div>
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

/* ════════════════════════════════════════════════════════════════════
   Pump analytics — characteristic curve, BEP, operating point, and
   predictive-maintenance forecast (efficiency degradation → planning date)
   ════════════════════════════════════════════════════════════════════ */
type Tags = Record<string, import('../../types').Tag>;

function pumpAnalytics(tags: Tags, siteId: string, pumpNum: number, phaseSpec: { totalFlow_m3h: number; dutyHead_m: number; motorKw: number; pumpsWorking: number }, running: boolean) {
  const dutyQ = phaseSpec.totalFlow_m3h / phaseSpec.pumpsWorking;   // BEP flow (pumps sized near BEP)
  const dutyH = phaseSpec.dutyHead_m;
  const H0 = dutyH * 1.25;                                          // shut-off head
  const k = (H0 - dutyH) / (dutyQ * dutyQ || 1);
  const Hcurve = (q: number) => Math.max(0, H0 - k * q * q);
  const Qmax = Math.sqrt(H0 / (k || 1e-9));
  const etaBEP = 0.85;
  const etaCurve = (q: number) => Math.max(0, etaBEP * (1 - 0.85 * Math.pow((q - dutyQ) / (dutyQ || 1), 2)));

  const speed = tags[`${siteId}-P${pumpNum}-VFD-SPEED`]?.value;
  const vib = tags[`${siteId}-P${pumpNum}-VIB`]?.value ?? 3;
  const bearDE = tags[`${siteId}-P${pumpNum}-BTEMP-DE`]?.value ?? 55;
  const runtime = tags[`${siteId}-P${pumpNum}-RUNTIME`]?.value ?? 20000;
  const speedFrac = speed != null ? Math.max(0.4, speed / 100) : 0.98;

  const opQ = running ? dutyQ * speedFrac : 0;
  const opH = running ? Hcurve(opQ) : 0;
  const etaHyd = running ? etaCurve(opQ) : etaCurve(dutyQ);
  // wear-related efficiency loss from accumulated runtime + elevated vibration
  const wear = Math.min(runtime / 60000 * 0.12, 0.15) + Math.max(0, vib - 4) * 0.004;
  const etaNow = Math.max(0, etaHyd - wear);
  const etaMin = etaBEP - 0.10;                                    // minimum acceptable efficiency
  // degradation rate (efficiency %-points per 1000 running-hours), accelerated by condition
  const ratePer1000h = 0.6 + Math.max(0, vib - 3) * 0.15 + Math.max(0, bearDE - 70) * 0.02;
  const marginPts = (etaNow - etaMin) * 100;
  const hoursLeft = ratePer1000h > 0 ? (marginPts / ratePer1000h) * 1000 : Infinity;
  const daysLeft = hoursLeft / 24;
  const maintDate = new Date(Date.now() + Math.max(0, daysLeft) * 86400000);
  return { dutyQ, dutyH, H0, Qmax, Hcurve, etaCurve, etaBEP, opQ, opH, etaHyd, etaNow, etaMin, wear, ratePer1000h, daysLeft, maintDate, vib, bearDE, runtime };
}

function maintStatus(daysLeft: number): { label: string; color: string } {
  if (daysLeft < 0) return { label: 'OVERDUE', color: '#ef4444' };
  if (daysLeft < 14) return { label: 'DUE', color: '#ef4444' };
  if (daysLeft < 60) return { label: 'PLAN SOON', color: '#f59e0b' };
  if (daysLeft < 180) return { label: 'SCHEDULED', color: '#3b82f6' };
  return { label: 'HEALTHY', color: '#22c55e' };
}

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

/* ── Pump characteristic curve with BEP, operating point, predictive hover ── */
function PumpCurve({ a, running }: { a: ReturnType<typeof pumpAnalytics>; running: boolean }) {
  const [hoverQ, setHoverQ] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 344, H = 188, pl = 36, pr = 30, pt = 10, pb = 26;
  const plotW = W - pl - pr, plotH = H - pt - pb;
  const xMax = a.Qmax * 1.02, yMax = a.H0 * 1.06;
  const xPx = (q: number) => pl + (q / xMax) * plotW;
  const yPx = (h: number) => pt + plotH - (h / yMax) * plotH;
  const ePx = (e: number) => pt + plotH - e * plotH;

  const headPts: string[] = [], effPts: string[] = [];
  for (let i = 0; i <= 40; i++) { const q = (xMax * i) / 40; headPts.push(`${xPx(q)},${yPx(a.Hcurve(q))}`); }
  for (let i = 0; i <= 40; i++) { const q = (a.dutyQ * 1.6 * i) / 40; if (q > xMax) break; effPts.push(`${xPx(q)},${ePx(a.etaCurve(q))}`); }

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const q = Math.max(0, Math.min(xMax, ((vx - pl) / plotW) * xMax));
    setHoverQ(q);
  };
  const st = maintStatus(a.daysLeft);

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}
        onMouseMove={onMove} onMouseLeave={() => setHoverQ(null)}>
        {/* grid */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={pl} y1={pt + plotH * (1 - f)} x2={pl + plotW} y2={pt + plotH * (1 - f)} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        ))}
        {/* efficiency curve */}
        <polyline points={effPts.join(' ')} fill="none" stroke="#a78bfa" strokeWidth="1.2" strokeDasharray="3,2" opacity="0.8" />
        {/* head curve */}
        <polyline points={headPts.join(' ')} fill="none" stroke="#4f8ef7" strokeWidth="1.8" />
        {/* BEP marker */}
        <g>
          <line x1={xPx(a.dutyQ)} y1={pt} x2={xPx(a.dutyQ)} y2={pt + plotH} stroke="#22c55e" strokeWidth="0.7" strokeDasharray="3,3" opacity="0.5" />
          <rect x={xPx(a.dutyQ) - 4} y={yPx(a.dutyH) - 4} width="8" height="8" fill="#22c55e" transform={`rotate(45 ${xPx(a.dutyQ)} ${yPx(a.dutyH)})`} />
          <text x={xPx(a.dutyQ)} y={pt + 8} fill="#22c55e" fontSize="8" textAnchor="middle" fontWeight="700">BEP</text>
        </g>
        {/* operating point */}
        {running && (
          <g>
            <circle cx={xPx(a.opQ)} cy={yPx(a.opH)} r="7" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.6" style={{ animation: 'ping 1.6s ease-out infinite', transformOrigin: `${xPx(a.opQ)}px ${yPx(a.opH)}px` }} />
            <circle cx={xPx(a.opQ)} cy={yPx(a.opH)} r="3.6" fill="#fbbf24" stroke="#0f1117" strokeWidth="1" />
          </g>
        )}
        {/* hover crosshair */}
        {hoverQ != null && (
          <line x1={xPx(hoverQ)} y1={pt} x2={xPx(hoverQ)} y2={pt + plotH} stroke="rgba(226,232,240,0.4)" strokeWidth="0.8" strokeDasharray="2,2" />
        )}
        {/* axes labels */}
        <text x={pl + plotW / 2} y={H - 4} fill="#64748b" fontSize="8" textAnchor="middle">Flow Q (m³/h)</text>
        <text x={10} y={pt + plotH / 2} fill="#4f8ef7" fontSize="8" textAnchor="middle" transform={`rotate(-90 10 ${pt + plotH / 2})`}>Head (m)</text>
        <text x={W - 8} y={pt + plotH / 2} fill="#a78bfa" fontSize="8" textAnchor="middle" transform={`rotate(90 ${W - 8} ${pt + plotH / 2})`}>Eff (%)</text>
        <text x={pl} y={pt + plotH + 10} fill="#64748b" fontSize="7">0</text>
        <text x={pl + plotW} y={pt + plotH + 10} fill="#64748b" fontSize="7" textAnchor="end">{a.Qmax.toFixed(0)}</text>
      </svg>

      {/* predictive & decision-assistance glass popup on hover */}
      {hoverQ != null && (
        <div className="absolute rounded-xl p-2.5 text-xs pointer-events-none"
          style={{ left: 6, top: 6, width: 210, background: 'rgba(8,14,28,0.86)', backdropFilter: 'blur(14px)', border: `1px solid ${st.color}66`, boxShadow: '0 10px 30px rgba(0,0,0,0.7)' }}>
          <div className="flex items-center gap-1 font-sans font-bold mb-1" style={{ color: st.color }}>
            <Wrench size={11} /> Predictive & Decision Assist
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono" style={{ fontSize: 10 }}>
            <span className="text-gray-500">At Q</span><span>{hoverQ.toFixed(0)} m³/h</span>
            <span className="text-gray-500">Head</span><span>{a.Hcurve(hoverQ).toFixed(0)} m</span>
            <span className="text-gray-500">Curve η</span><span>{(a.etaCurve(hoverQ) * 100).toFixed(0)} %</span>
            <div className="col-span-2 my-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }} />
            <span className="text-gray-500">Eff. now</span><span style={{ color: a.etaNow * 100 < a.etaMin * 100 + 2 ? '#f59e0b' : '#4ade80' }}>{(a.etaNow * 100).toFixed(1)} %</span>
            <span className="text-gray-500">Min thresh</span><span>{(a.etaMin * 100).toFixed(0)} %</span>
            <span className="text-gray-500">Degrade</span><span>{a.ratePer1000h.toFixed(2)} %/1000h</span>
            <span className="text-gray-500">Time left</span><span style={{ color: st.color }}>{a.daysLeft < 0 ? 'overdue' : `${Math.round(a.daysLeft)} d`}</span>
          </div>
          <div className="mt-1.5 pt-1.5 font-sans" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 10 }}>
            <span className="text-gray-400">Plan overhaul by </span>
            <span className="font-bold" style={{ color: st.color }}>{fmtDate(a.maintDate)}</span>
            <span className="text-gray-500"> to restore efficiency to near-new.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Condition monitoring trend row ── */
function ConditionRow({ label, tag, unit, digits = 1, warnHigh, warnLow, color = '#4f8ef7' }: {
  label: string; tag?: import('../../types').Tag; unit: string; digits?: number; warnHigh?: number; warnLow?: number; color?: string;
}) {
  const v = tag?.value ?? 0;
  const hist = tag?.history.map(h => h.v) ?? [];
  const alarm = (warnHigh != null && v > warnHigh) || (warnLow != null && v < warnLow && v > 0);
  const c = alarm ? '#ef4444' : color;
  return (
    <div className="flex items-center gap-2 py-1 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <span className="text-gray-500 flex-shrink-0" style={{ fontSize: 10, width: 88 }}>{label}</span>
      <div className="flex-1"><Sparkline values={hist.slice(-24)} color={c} width={90} height={16} /></div>
      <span className="font-mono font-semibold flex items-center gap-1 flex-shrink-0" style={{ color: c, fontSize: 11 }}>
        {alarm && <AlertTriangle size={9} className="alarm-blink" />}{v.toFixed(digits)} {unit}
      </span>
    </div>
  );
}

/* ── Pump detail pane (right side) ── */
function PumpDetailPane({ siteId, pumpNum, spec, phaseSpec, onBack }: {
  siteId: string; pumpNum: number; spec: import('../../data/pumpStationSpecs').PumpStationSpec;
  phaseSpec: { totalFlow_m3h: number; dutyHead_m: number; motorKw: number; pumpsWorking: number; pumpsStandby: number };
  onBack: () => void;
}) {
  const { state } = useScada();
  const { tags } = state;
  const isStandby = pumpNum > phaseSpec.pumpsWorking;
  const status = getPumpStatus(tags, siteId, pumpNum, isStandby);
  const running = status === 'running';
  const col = STATUS_COLORS[status];
  const a = pumpAnalytics(tags, siteId, pumpNum, phaseSpec, running);
  const st = maintStatus(a.daysLeft);
  const t = (suffix: string) => tags[`${siteId}-P${pumpNum}-${suffix}`];
  const curr = t('CURR')?.value ?? 0;
  const kw = (t('KW') ?? t('KWH'))?.value ?? 0;

  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ background: 'rgba(79,142,247,0.12)', color: '#93c5fd', border: '1px solid rgba(79,142,247,0.3)' }}>
          <ArrowLeft size={12} /> Station
        </button>
        <span className="font-bold text-gray-100">Pump P{pumpNum}</span>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${col.primary}22`, color: col.primary, border: `1px solid ${col.primary}44` }}>{status.toUpperCase()}</span>
      </div>

      {/* pump curve */}
      <PanelCard title="Pump Curve — Operating Point vs BEP" icon={<Gauge size={13} className="text-blue-400" />}>
        <PumpCurve a={a} running={running} />
        <div className="grid grid-cols-4 gap-1 mt-1.5 text-center">
          <MiniStat label="Op. Q" val={running ? `${a.opQ.toFixed(0)}` : '—'} sub="m³/h" color="#fbbf24" />
          <MiniStat label="Op. H" val={running ? `${a.opH.toFixed(0)}` : '—'} sub="m" color="#60a5fa" />
          <MiniStat label="Eff." val={`${(a.etaNow * 100).toFixed(1)}`} sub="%" color={a.etaNow < a.etaMin ? '#ef4444' : '#4ade80'} />
          <MiniStat label="of BEP" val={running ? `${(a.opQ / a.dutyQ * 100).toFixed(0)}` : '—'} sub="% Q" color="#a78bfa" />
        </div>
        <div className="mt-1.5 text-gray-600" style={{ fontSize: 9 }}>Hover the curve for the predictive maintenance forecast.</div>
      </PanelCard>

      {/* predictive maintenance */}
      <PanelCard title="Predictive Maintenance" icon={<Wrench size={13} style={{ color: st.color }} />}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-gray-500 text-xs">Condition</span>
          <span className="px-2 py-0.5 rounded-full font-bold" style={{ fontSize: 10, background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}55` }}>{st.label}</span>
        </div>
        {/* efficiency bar toward threshold */}
        <div className="mb-1">
          <div className="flex justify-between" style={{ fontSize: 9 }}>
            <span className="text-gray-600">Efficiency {(a.etaNow * 100).toFixed(1)}%</span>
            <span className="text-gray-600">min {(a.etaMin * 100).toFixed(0)}% · BEP {(a.etaBEP * 100).toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="h-full" style={{ width: `${a.etaNow * 100}%`, background: a.etaNow < a.etaMin ? '#ef4444' : 'linear-gradient(90deg,#f59e0b,#22c55e)' }} />
            <div className="absolute top-0 bottom-0" style={{ left: `${a.etaMin * 100}%`, width: 1.5, background: '#ef4444' }} />
          </div>
        </div>
        <ProcessRow label="Degradation rate" val={`${a.ratePer1000h.toFixed(2)} %/1000h`} />
        <ProcessRow label="Est. time to threshold" val={a.daysLeft < 0 ? 'overdue' : a.daysLeft > 3650 ? '> 10 yr' : `${Math.round(a.daysLeft)} days`} alarm={a.daysLeft < 30} />
        <ProcessRow label="Plan overhaul by" val={fmtDate(a.maintDate)} sub="restores near-new efficiency" />
        <ProcessRow label="Runtime" val={`${(a.runtime / 1000).toFixed(1)}k h`} />
        <div className="mt-1.5 px-2 py-1.5 rounded text-xs flex items-start gap-1.5" style={{ background: `${st.color}14`, border: `1px solid ${st.color}33` }}>
          <Clock size={11} style={{ color: st.color }} className="flex-shrink-0 mt-0.5" />
          <span className="text-gray-300" style={{ fontSize: 10 }}>
            {a.daysLeft < 0 ? 'Efficiency below threshold — schedule overhaul now to avoid excess energy cost.'
              : a.daysLeft < 60 ? `Plan an overhaul window before ${fmtDate(a.maintDate)}; procure spares (impeller, wear rings, bearings).`
                : `On current trend, efficiency stays above threshold until ${fmtDate(a.maintDate)}. Continue condition monitoring.`}
          </span>
        </div>
      </PanelCard>

      {/* condition monitoring */}
      <PanelCard title="Condition Monitoring" icon={<Activity size={13} className="text-emerald-400" />}>
        {running ? (
          <>
            <ConditionRow label="Vibration" tag={t('VIB')} unit="mm/s" digits={2} warnHigh={7} color="#34d399" />
            <ConditionRow label="Bearing DE" tag={t('BTEMP-DE')} unit="°C" warnHigh={85} color="#f59e0b" />
            <ConditionRow label="Bearing NDE" tag={t('BTEMP-NDE')} unit="°C" warnHigh={85} color="#f59e0b" />
            <ConditionRow label="Cooling water" tag={t('CWTEMP')} unit="°C" warnHigh={42} color="#60a5fa" />
            <ConditionRow label="Lube oil pr." tag={t('LOP')} unit="bar" digits={2} warnLow={1.5} color="#a78bfa" />
            <ConditionRow label="Motor current" tag={t('CURR')} unit="A" digits={0} warnHigh={phaseSpec.motorKw * 0.9} color="#38bdf8" />
          </>
        ) : (
          <div className="text-center py-2 text-gray-600" style={{ fontSize: 11 }}>
            Pump {status === 'fault' ? 'tripped' : 'stopped'} — rotating-equipment monitoring on standby.
            <div className="mt-1 font-mono" style={{ fontSize: 10 }}>Current {curr.toFixed(0)} A · Power {kw.toFixed(0)} kW</div>
          </div>
        )}
      </PanelCard>
    </div>
  );
}

function MiniStat({ label, val, sub, color }: { label: string; val: string; sub: string; color: string }) {
  return (
    <div className="rounded-lg px-1 py-1" style={{ background: 'rgba(5,12,24,0.7)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="text-gray-600" style={{ fontSize: 8 }}>{label}</div>
      <div className="font-mono font-bold" style={{ color, fontSize: 12 }}>{val}</div>
      <div className="text-gray-700" style={{ fontSize: 8 }}>{sub}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   WTP process-train sections (tabs inside the CWPS modal)
   ════════════════════════════════════════════════════════════════════ */
function seedNum(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function dwob(seed: number, amp = 1): number { const t = Math.floor(Date.now() / 5000); return (Math.sin(seed * 12.9 + t * 0.5) * 0.6 + Math.sin(seed * 4.1 + t * 0.17) * 0.4) * amp; }
const clampn = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function ParamPill({ label, val, ok = true }: { label: string; val: string; ok?: boolean }) {
  return (
    <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: 'rgba(5,12,24,0.85)', border: `1px solid ${ok ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.4)'}` }}>
      <div className="text-gray-600" style={{ fontSize: 8, textTransform: 'uppercase' }}>{label}</div>
      <div className="font-mono font-bold" style={{ fontSize: 12, color: ok ? '#93c5fd' : '#ef4444' }}>{val}</div>
    </div>
  );
}

function StageHeader({ icon, title, tint, right }: { icon: React.ReactNode; title: string; tint: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-t-xl" style={{ background: `${tint}22`, borderBottom: `1px solid ${tint}33` }}>
      {icon}<span className="text-sm font-semibold" style={{ color: tint }}>{title}</span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

function MimicFlow({ stages, active }: { stages: string[]; active: number }) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto" style={{ background: 'rgba(5,12,24,0.5)' }}>
      {stages.map((s, i) => (
        <React.Fragment key={s}>
          <div className="px-2 py-1 rounded text-center flex-shrink-0" style={{ fontSize: 9, background: i === active ? 'rgba(79,142,247,0.25)' : 'rgba(255,255,255,0.04)', color: i === active ? '#93c5fd' : '#64748b', border: `1px solid ${i === active ? 'rgba(79,142,247,0.5)' : 'transparent'}` }}>{s}</div>
          {i < stages.length - 1 && <span className="text-gray-700 flex-shrink-0" style={{ fontSize: 10 }}>→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

const WTP_TRAIN = ['Intake', 'Pre-dosing', 'Coag / Floc', 'Sedimentation', 'Filtration', 'Disinfection', 'Clear Water Tank', 'CWPS'];

function PreDosingSection({ siteId }: { siteId: string }) {
  const { state } = useScada(); const { tags } = state;
  const rawFlow = tags[`${siteId}-FT-001`]?.value ?? 0;
  const s = seedNum(siteId + 'pre');
  const rawTurb = clampn(45 + dwob(s, 30), 8, 400);
  const rawPh = clampn(7.4 + dwob(s + 1, 0.4), 6.5, 8.5);
  const preCl = clampn(2.2 + dwob(s + 2, 0.6), 0, 5);
  const preLime = clampn(8 + dwob(s + 3, 3), 0, 25);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,16,30,0.7)', border: '1px solid rgba(56,189,248,0.15)' }}>
      <StageHeader icon={<Droplets size={14} className="text-sky-400" />} title="Pre-treatment & Pre-dosing" tint="#38bdf8" />
      <MimicFlow stages={['Raw intake', 'Coarse screen', 'Pre-chlorination', 'Flash mixer']} active={3} />
      <div className="p-3 grid grid-cols-3 gap-2">
        <ParamPill label="Raw inlet flow" val={`${rawFlow.toFixed(0)} m³/h`} />
        <ParamPill label="Raw turbidity" val={`${rawTurb.toFixed(0)} NTU`} ok={rawTurb < 250} />
        <ParamPill label="Raw pH" val={rawPh.toFixed(2)} ok={rawPh >= 6.5 && rawPh <= 8.5} />
        <ParamPill label="Pre-chlorine" val={`${preCl.toFixed(2)} mg/L`} />
        <ParamPill label="Pre-lime (pH corr.)" val={`${preLime.toFixed(1)} mg/L`} />
        <ParamPill label="Flash mixer" val="RUNNING" />
      </div>
    </div>
  );
}

function CoagFlocSection({ siteId }: { siteId: string }) {
  const { state } = useScada(); const { tags } = state;
  const coag = tags[`${siteId}-DT-001`]?.value ?? 0;
  const settled = tags[`${siteId}-TT-001`]?.value ?? 0;
  const sludge = tags[`${siteId}-LT-SLUDGE`]?.value ?? 0;
  const s = seedNum(siteId + 'cf');
  const gRapid = clampn(750 + dwob(s, 80), 300, 1000);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,16,30,0.7)', border: '1px solid rgba(45,212,191,0.15)' }}>
      <StageHeader icon={<Wind size={14} className="text-teal-400" />} title="Coagulation & Flocculation" tint="#2dd4bf" />
      <MimicFlow stages={['Rapid mix (coag.)', 'Floc basin 1', 'Floc basin 2', 'Floc basin 3', 'Sedimentation']} active={2} />
      <div className="p-3 grid grid-cols-3 gap-2">
        <ParamPill label="Coagulant dose" val={`${coag.toFixed(0)} L/h`} />
        <ParamPill label="Rapid-mix G" val={`${gRapid.toFixed(0)} /s`} />
        <ParamPill label="Flocculators" val="3 / 3 running" />
        <ParamPill label="Settled turbidity" val={`${settled.toFixed(1)} NTU`} ok={settled < 10} />
        <ParamPill label="Sludge blanket" val={`${sludge.toFixed(2)} m`} ok={sludge < 3.5} />
        <ParamPill label="Paddle speed" val={`${clampn(2.5 + dwob(s + 1, 0.6), 1, 5).toFixed(1)} rpm`} />
      </div>
    </div>
  );
}

function ChemicalDosingSection({ siteId }: { siteId: string }) {
  const { state } = useScada(); const { tags } = state;
  const coag = tags[`${siteId}-DT-001`]?.value ?? 0;
  const clDose = tags[`${siteId}-CL-DOSE`]?.value ?? 0;
  const clRes = tags[`${siteId}-CL-RES`]?.value ?? 0;
  const phOut = tags[`${siteId}-pHT-OUT`]?.value ?? 0;
  const s = seedNum(siteId + 'dose');
  const lime = clampn(12 + dwob(s, 4), 0, 40);
  const fluoride = clampn(0.7 + dwob(s + 1, 0.15), 0, 1.5);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,16,30,0.7)', border: '1px solid rgba(129,140,248,0.15)' }}>
      <StageHeader icon={<Zap size={14} className="text-indigo-400" />} title="Chemical Dosing" tint="#818cf8" />
      <div className="p-3 grid grid-cols-3 gap-2">
        <ParamPill label="Coagulant (alum)" val={`${coag.toFixed(0)} L/h`} />
        <ParamPill label="Chlorine dose" val={`${clDose.toFixed(1)} L/h`} />
        <ParamPill label="Lime (pH)" val={`${lime.toFixed(1)} mg/L`} />
        <ParamPill label="Fluoride" val={`${fluoride.toFixed(2)} mg/L`} />
        <ParamPill label="Cl₂ residual" val={`${clRes.toFixed(2)} mg/L`} ok={clRes >= 0.2 && clRes <= 1.5} />
        <ParamPill label="Final pH" val={phOut.toFixed(2)} ok={phOut >= 6.5 && phOut <= 8.5} />
      </div>
      <div className="px-3 pb-3 grid grid-cols-4 gap-2">
        {['Alum', 'Chlorine', 'Lime', 'Fluoride'].map((d, i) => (
          <div key={d} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(5,12,24,0.85)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <span className="text-gray-500" style={{ fontSize: 9 }}>{d} pump</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: i === 3 ? '#f59e0b' : '#22c55e' }} />
            </div>
            <div className="font-mono text-gray-300" style={{ fontSize: 10 }}>{i === 3 ? 'STANDBY' : 'DOSING'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClearWaterTankSection({ siteId }: { siteId: string }) {
  const { state } = useScada(); const { tags } = state;
  const clRes = tags[`${siteId}-CL-RES`]?.value ?? 0;
  const ttOut = tags[`${siteId}-TT-OUT`]?.value ?? 0;
  const s = seedNum(siteId + 'cwt');
  const level = clampn(4.2 + dwob(s, 0.8), 0.5, 6);
  const pct = (level / 6) * 100;
  const contact = clampn(35 + dwob(s + 1, 6), 20, 60);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,16,30,0.7)', border: '1px solid rgba(96,165,250,0.15)' }}>
      <StageHeader icon={<Droplets size={14} className="text-blue-400" />} title="Clear Water Tank (Contact Tank)" tint="#60a5fa" />
      <div className="p-3 flex gap-3">
        <MimicTank pct={pct} label={`${level.toFixed(2)} m`} />
        <div className="flex-1 grid grid-cols-2 gap-2 content-start">
          <ParamPill label="Level" val={`${level.toFixed(2)} m`} />
          <ParamPill label="Fill" val={`${pct.toFixed(0)} %`} />
          <ParamPill label="Cl₂ contact time" val={`${contact.toFixed(0)} min`} ok={contact >= 30} />
          <ParamPill label="Cl₂ residual" val={`${clRes.toFixed(2)} mg/L`} ok={clRes >= 0.2} />
          <ParamPill label="Turbidity out" val={`${ttOut.toFixed(2)} NTU`} ok={ttOut < 1} />
          <ParamPill label="Overflow" val="CLOSED" />
        </div>
      </div>
    </div>
  );
}

function MimicTank({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="flex-shrink-0" style={{ width: 60 }}>
      <div className="relative rounded-lg overflow-hidden" style={{ height: 90, background: 'rgba(5,12,24,0.9)', border: '1px solid rgba(96,165,250,0.3)' }}>
        <div className="absolute bottom-0 left-0 right-0 transition-all" style={{ height: `${pct}%`, background: 'linear-gradient(180deg, rgba(96,165,250,0.6), rgba(37,99,235,0.8))' }} />
        <div className="absolute inset-0 flex items-center justify-center font-mono font-bold" style={{ fontSize: 10, color: '#e2e8f0', textShadow: '0 1px 2px #000' }}>{label}</div>
      </div>
    </div>
  );
}

function MabaleReservoirSection() {
  const { state } = useScada(); const { tags } = state;
  const rid = 'MABALE_BR';
  const lt = tags[`${rid}-LT-001`];
  const level = lt?.value ?? 0;
  const range = lt?.range?.[1] ?? 10;
  const pct = (level / range) * 100;
  const fin = tags[`${rid}-FT-IN`]?.value ?? 0;
  const fout = tags[`${rid}-FT-OUT`]?.value ?? 0;
  const ptin = tags[`${rid}-PT-IN`]?.value ?? 0;
  const ptout = tags[`${rid}-PT-OUT`]?.value ?? 0;
  const clr = tags[`${rid}-CL-RES`]?.value ?? 0;
  const tt = tags[`${rid}-TT-001`]?.value ?? 0;
  const balance = fin - fout;
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,16,30,0.7)', border: '1px solid rgba(129,140,248,0.15)' }}>
      <StageHeader icon={<Droplets size={14} className="text-indigo-400" />} title="Mabale B Balancing Reservoir" tint="#818cf8"
        right={<span className="font-mono text-xs" style={{ color: Math.abs(balance) < 200 ? '#4ade80' : '#f59e0b' }}>{balance >= 0 ? '+' : ''}{balance.toFixed(0)} m³/h</span>} />
      <div className="p-3 flex gap-3">
        <MimicTank pct={pct} label={`${pct.toFixed(0)}%`} />
        <div className="flex-1 grid grid-cols-2 gap-2 content-start">
          <ParamPill label="Level" val={`${level.toFixed(2)} m`} />
          <ParamPill label="Capacity fill" val={`${pct.toFixed(0)} %`} />
          <ParamPill label="Inlet flow" val={`${fin.toFixed(0)} m³/h`} />
          <ParamPill label="Outlet flow" val={`${fout.toFixed(0)} m³/h`} />
          <ParamPill label="Inlet pressure" val={`${ptin.toFixed(2)} bar`} />
          <ParamPill label="Outlet pressure" val={`${ptout.toFixed(2)} bar`} />
          <ParamPill label="Cl₂ residual" val={`${clr.toFixed(2)} mg/L`} ok={clr >= 0.2} />
          <ParamPill label="Turbidity" val={`${tt.toFixed(2)} NTU`} ok={tt < 1} />
        </div>
      </div>
      <div className="px-3 pb-3 text-gray-600" style={{ fontSize: 10 }}>
        Downstream balancing reservoir fed by the Clear Water Pumping Station via the WTP rising main.
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
  const [selectedPump, setSelectedPump] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>('cwps');

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
  const isWTP = site.class === 'WTP';
  const WTP_TABS: [string, string][] = [
    ['predosing', 'Pre-dosing'],
    ['coagfloc', 'Coag & Floc'],
    ['dosing', 'Chemical Dosing'],
    ['filtration', 'Filtration'],
    ['cwt', 'Clear Water Tank'],
    ['cwps', 'Clear Water PS'],
    ['mabale', 'Mabale Reservoir'],
  ];
  const pumpGrid = (
    <>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-gray-200">
          {isWTP ? 'Clear Water Pumping Station' : 'Pump Set'} — {totalPumps} Units ({phaseSpec.pumpsWorking}W + {phaseSpec.pumpsStandby}S)
        </span>
        <span className="text-xs text-gray-600 ml-auto">Click a pump for its curve, condition &amp; forecast</span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(totalPumps, 6)}, 1fr)` }}>
        {Array.from({ length: Math.min(totalPumps, 12) }, (_, i) => {
          const pumpNum = i + 1;
          const isStandby = pumpNum > phaseSpec.pumpsWorking;
          return (
            <PumpCard key={pumpNum} siteId={siteId} pumpNum={pumpNum} pumpType={spec.pumpType} isStandby={isStandby}
              dutyFlow={dutyFlowPerPump} dutyHead={phaseSpec.dutyHead_m} motorKw={phaseSpec.motorKw}
              selected={selectedPump === pumpNum} onSelect={() => setSelectedPump(pumpNum)} />
          );
        })}
      </div>
      <StationValvesSection siteId={siteId} />
    </>
  );

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

            {/* Left column */}
            <div className="flex-1 min-w-0">
              {isWTP ? (
                <>
                  {/* WTP process-train tabs */}
                  <div className="flex gap-1 mb-3 flex-wrap">
                    {WTP_TABS.map(([id, label]) => (
                      <button key={id} onClick={() => { setActiveTab(id); if (id !== 'cwps') setSelectedPump(null); }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: activeTab === id ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)', color: activeTab === id ? '#93c5fd' : '#6b7280', border: `1px solid ${activeTab === id ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.07)'}` }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {activeTab === 'predosing' && <PreDosingSection siteId={siteId} />}
                  {activeTab === 'coagfloc' && <CoagFlocSection siteId={siteId} />}
                  {activeTab === 'dosing' && <ChemicalDosingSection siteId={siteId} />}
                  {activeTab === 'filtration' && <FiltrationSection siteId={siteId} />}
                  {activeTab === 'cwt' && <ClearWaterTankSection siteId={siteId} />}
                  {activeTab === 'cwps' && pumpGrid}
                  {activeTab === 'mabale' && <MabaleReservoirSection />}
                </>
              ) : pumpGrid}
            </div>

            {/* Right pane — pump detail when a pump is selected, else station panels */}
            {selectedPump != null ? (
              <div className="w-96 flex-shrink-0">
                <PumpDetailPane siteId={siteId} pumpNum={selectedPump} spec={spec} phaseSpec={phaseSpec} onBack={() => setSelectedPump(null)} />
              </div>
            ) : (
              <div className="w-64 flex-shrink-0 space-y-3">
                <PanelCard title="Process Values" icon={<Droplets size={13} className="text-blue-400" />}>
                  <ProcessRow label="Suction Pressure" val={suctionTag ? `${suctionTag.value.toFixed(2)} bar` : '—'} alarm={suctionTag?.alarm_state !== 'normal'} />
                  <ProcessRow label="Delivery Pressure" val={delivTag ? `${delivTag.value.toFixed(2)} bar` : '—'} alarm={delivTag?.alarm_state !== 'normal'} />
                  <ProcessRow label="Flow (inst.)" val={flowTag ? `${(flowTag.value * 1.5).toFixed(0)} m³/h` : '—'} />
                  <ProcessRow label="Duty Flow/pump" val={`${dutyFlowPerPump.toFixed(0)} m³/h`} sub="design" />
                </PanelCard>

                <PanelCard title="Design Specifications" icon={<BarChart2 size={13} className="text-purple-400" />}>
                  <ProcessRow label="Phase 1 (2048)" val={`${spec.ph1.totalFlow_m3h} m³/h`} />
                  <ProcessRow label="Phase 1 Head" val={`${spec.ph1.dutyHead_m} m`} />
                  <ProcessRow label="Phase 1 Motor" val={`${spec.ph1.motorKw} kW/unit`} />
                  <div className="border-t my-1.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
                  <ProcessRow label="Phase 2 (2068)" val={`${spec.ph2.totalFlow_m3h} m³/h`} sub="uplift" />
                  <ProcessRow label="Phase 2 Head" val={`${spec.ph2.dutyHead_m} m`} />
                  <ProcessRow label="Phase 2 Motor" val={`${spec.ph2.motorKw} kW/unit`} />
                </PanelCard>

                <PanelCard title="Station Energy" icon={<Zap size={13} className="text-yellow-400" />}>
                  <ProcessRow label="Total Active kW" val={`${totalKw.toFixed(0)} kW`} />
                  <ProcessRow label="Intensity" val={flowTag && flowTag.value > 0 ? `${(totalKw / (flowTag.value * 1.5) * 1000).toFixed(2)} Wh/m³` : '—'} />
                  <ProcessRow label="Rated kW (Ph1)" val={`${(phaseSpec.motorKw * phaseSpec.pumpsWorking / 1000).toFixed(1)} MW`} />
                </PanelCard>

                {siteAlarms.length > 0 && (
                  <PanelCard title="Active Alarms" icon={<AlertTriangle size={13} className="text-red-400" />}>
                    {siteAlarms.slice(0, 5).map(a => (
                      <div key={a.id} className="py-1 border-b last:border-0 text-xs" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <div className="font-semibold mb-0.5" style={{ color: a.priority === 'critical' ? '#fca5a5' : '#fde68a' }}>{a.priority.toUpperCase()}</div>
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
                <div className="px-3 py-2 rounded-lg text-xs flex items-start gap-2"
                  style={{ background: 'rgba(30,58,95,0.2)', border: '1px solid rgba(79,142,247,0.1)' }}>
                  <Info size={12} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-400" style={{ fontSize: 10 }}>{spec.notes}</span>
                </div>
              </div>
            )}
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
