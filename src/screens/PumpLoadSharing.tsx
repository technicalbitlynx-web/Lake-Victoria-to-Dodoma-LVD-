import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, Info, Gauge, Activity, Clock, Waves, Zap, TrendingUp } from 'lucide-react';
import { STATIONS, getLoadState, type PumpReading, type StationLoadState } from '../lib/syntheticPumpData';
import { BAND_COLORS, BAND_LABELS, DEVIATION_CONFIG, type Band } from '../lib/deviationBands';

const QUALITY_COLORS: Record<string, string> = { good: '#22c55e', stale: '#f59e0b', comms_fail: '#ef4444', uncertain: '#eab308' };
const RUN_COLORS: Record<string, string> = { running: '#22c55e', standby: '#60a5fa', fault: '#ef4444', stopped: '#6b7280' };

function Sparkline({ values, color = '#4f8ef7', w = 120, h = 22 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values, 0), max = Math.max(...values, 0), range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const zeroY = h - ((0 - min) / range) * h;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <line x1={0} y1={zeroY} x2={w} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export default function PumpLoadSharing() {
  const [stationId, setStationId] = useState('MBK_CWPS');
  const [selectedPump, setSelectedPump] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);

  const state = useMemo<StationLoadState>(() => getLoadState(stationId, now), [stationId, now]);
  const station = state.station;

  // pumps sorted by |deviation| desc (worst first); non-good and non-running sink to the bottom
  const sortedPumps = useMemo(() => {
    return [...state.pumps].sort((a, b) => {
      const da = a.deviationPct == null ? -1 : Math.abs(a.deviationPct);
      const db = b.deviationPct == null ? -1 : Math.abs(b.deviationPct);
      return db - da;
    });
  }, [state.pumps]);

  const sel = state.pumps.find(p => p.id === selectedPump) ?? state.pumps.find(p => p.runState === 'running') ?? null;
  const uncPct = DEVIATION_CONFIG.instrumentAccuracyPct;

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      {/* framing */}
      <FramingBanner />

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Gauge size={18} className="text-blue-400" />
          <div>
            <h2 className="text-lg font-bold text-gray-200">Pump Load Sharing</h2>
            <p className="text-xs text-gray-500">Parallel-pump duty share on the common delivery manifold · reference = median of running pumps</p>
          </div>
        </div>
        <select value={stationId} onChange={e => { setStationId(e.target.value); setSelectedPump(null); }}
          className="text-sm rounded px-2 py-1" style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}>
          {STATIONS.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
        </select>
      </div>

      {/* scope note */}
      <div className="mb-3 px-3 py-1.5 rounded text-xs flex items-start gap-2" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}>
        <Info size={12} className="flex-shrink-0 mt-0.5" />
        <span>Per-pump flow metering is <b>not</b> in the current Employer's Requirements (one delivery meter per station). Load share is inferred from <b>motor current</b>; per-pump flow is <span style={{ color: '#c084fc' }}>derived</span> from VFD speed via the affinity laws, never a meter reading.</span>
      </div>

      {!state.pumpCountKnown ? (
        <ContractorPlaceholder station={station.name} />
      ) : (
        <>
          {/* header strip */}
          <div className="grid grid-cols-8 gap-2 mb-3">
            <Kpi label="Running" val={String(state.running)} color="#22c55e" />
            <Kpi label="Standby" val={String(state.standby)} color="#60a5fa" />
            <Kpi label="Faulted" val={String(state.faulted)} color={state.faulted ? '#ef4444' : '#6b7280'} />
            <Kpi label="Excluded" val={String(state.excluded)} color={state.excluded ? '#f59e0b' : '#6b7280'} />
            <Kpi label="Meas. flow" val={`${state.measuredFlow_m3h.toFixed(0)}`} sub="m³/h · 1 meter" color="#38bdf8" />
            <Kpi label="Median ref" val={state.referenceMedianA != null ? `${state.referenceMedianA.toFixed(0)} A` : 'n/a'} color="#a78bfa" />
            <Kpi label="Spread" val={state.spreadPct != null ? `${state.spreadPct.toFixed(1)}%` : 'n/a'} color="#f59e0b" />
            <Kpi label="Horizon" val={station.designPoint.horizon} sub="design point" color="#c084fc" />
          </div>

          <div className="flex gap-4">
            {/* deviation bars */}
            <div className="flex-1 min-w-0">
              {!state.computable ? (
                <div className="px-3 py-4 rounded-lg text-sm flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>
                  <AlertTriangle size={16} /> Deviation display suppressed — {state.reason}
                </div>
              ) : (
                <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
                  <div className="px-3 py-1.5 flex items-center gap-2 text-xs" style={{ borderBottom: '1px solid #1e3a5f' }}>
                    <span className="font-semibold text-gray-300">Load-share deviation vs median current</span>
                    <span className="ml-auto text-gray-600">worst first · shaded band = ±{uncPct}% uncertainty (meaningless below)</span>
                  </div>
                  {sortedPumps.map(p => (
                    <PumpRow key={p.id} p={p} selected={p.id === (sel?.id)} onSelect={() => setSelectedPump(p.id)} />
                  ))}
                  {/* mass-balance check */}
                  <div className="px-3 py-2 flex items-center gap-3 text-xs" style={{ borderTop: '1px solid #1e3a5f', background: 'rgba(5,12,24,0.6)' }}>
                    <span className="text-gray-500">Mass-balance check:</span>
                    <span className="font-mono text-purple-300">Σ inferred {state.sumInferredFlow_m3h.toFixed(0)} m³/h</span>
                    <span className="text-gray-600">vs</span>
                    <span className="font-mono text-cyan-300">measured {state.measuredFlow_m3h.toFixed(0)} m³/h</span>
                    <span className="font-mono ml-auto" style={{ color: Math.abs(state.sumInferredFlow_m3h - state.measuredFlow_m3h) / state.measuredFlow_m3h > 0.05 ? '#f59e0b' : '#22c55e' }}>
                      Δ {(((state.sumInferredFlow_m3h - state.measuredFlow_m3h) / state.measuredFlow_m3h) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}

              {/* band legend */}
              <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                {(Object.keys(BAND_LABELS) as Band[]).map(b => (
                  <span key={b} className="flex items-center gap-1 text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: BAND_COLORS[b] }} />{BAND_LABELS[b]}
                  </span>
                ))}
                <span className="text-purple-400 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'rgba(192,132,252,0.3)', border: '1px dashed #c084fc' }} />derived (inferred flow)</span>
              </div>

              {/* staging footer */}
              <StagingFooter state={state} />
            </div>

            {/* right: selected pump detail */}
            {sel && <PumpDetail p={sel} state={state} />}
          </div>
        </>
      )}
    </div>
  );
}

function PumpRow({ p, selected, onSelect }: { p: PumpReading; selected: boolean; onSelect: () => void }) {
  const excluded = p.quality !== 'good';
  const notRunning = p.runState !== 'running';
  const dev = p.deviationPct;
  const band = p.band;
  const barColor = band ? BAND_COLORS[band] : '#334155';
  // bar geometry: centre = 0, ±10% full-scale
  const FS = 10;
  const pct = dev != null ? Math.max(-FS, Math.min(FS, dev)) / FS * 50 : 0;
  return (
    <div onClick={onSelect}
      className="grid items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/[0.03] border-b last:border-0"
      style={{ gridTemplateColumns: '1.4fr 3fr 1.4fr 0.9fr 1fr 0.9fr', borderColor: 'rgba(30,58,95,0.4)', opacity: excluded ? 0.5 : 1, background: selected ? 'rgba(59,130,246,0.1)' : undefined }}>
      {/* id + state */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: RUN_COLORS[p.runState] }} />
        <span className="text-xs font-bold text-gray-200">P{p.index}</span>
        <span className="text-gray-600" style={{ fontSize: 9 }}>{p.runState}</span>
      </div>
      {/* deviation bar */}
      <div className="relative h-5 rounded" style={{ background: 'rgba(5,12,24,0.7)' }}>
        {/* uncertainty envelope */}
        <div className="absolute top-0 bottom-0" style={{ left: `${50 - (DEVIATION_CONFIG.instrumentAccuracyPct / FS * 50)}%`, width: `${DEVIATION_CONFIG.instrumentAccuracyPct / FS * 100}%`, background: 'rgba(100,116,139,0.25)' }} />
        <div className="absolute top-0 bottom-0" style={{ left: '50%', width: 1, background: 'rgba(255,255,255,0.25)' }} />
        {excluded || notRunning ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600" style={{ fontSize: 9 }}>
            {excluded ? `excluded — ${p.quality.replace('_', ' ')}` : 'not running — excluded from reference'}
          </div>
        ) : dev != null && (
          <div className="absolute top-1 bottom-1 rounded" style={{
            left: pct >= 0 ? '50%' : `${50 + pct}%`, width: `${Math.abs(pct)}%`, background: barColor,
          }} />
        )}
      </div>
      {/* 24h sparkline */}
      <div><Sparkline values={p.deviationHistory} color={excluded ? '#475569' : (band ? BAND_COLORS[band] : '#4f8ef7')} w={110} h={18} /></div>
      {/* current */}
      <span className="font-mono text-xs text-right" style={{ color: excluded ? '#64748b' : '#e2e8f0' }}>{p.currentA > 0 ? `${p.currentA.toFixed(0)} A` : '—'}</span>
      {/* inferred flow (derived) */}
      <span className="font-mono text-xs text-right" style={{ color: '#c084fc', fontStyle: 'italic' }} title="derived — not measured">{p.inferredFlow_m3h > 0 ? `~${p.inferredFlow_m3h.toFixed(0)}` : '—'}</span>
      {/* deviation value */}
      <span className="font-mono text-xs text-right font-bold" style={{ color: band ? BAND_COLORS[band] : '#64748b' }}>
        {dev != null ? `${dev > 0 ? '+' : ''}${dev.toFixed(1)}%` : '—'}
      </span>
    </div>
  );
}

function PumpDetail({ p, state }: { p: PumpReading; state: StationLoadState }) {
  const dp = state.station.designPoint;
  // H-Q curve
  const dutyQ = dp.q_m3h! / state.station.dutyCount!;
  const dutyH = dp.head_m!;
  const H0 = dutyH * 1.25, k = (H0 - dutyH) / (dutyQ * dutyQ || 1);
  const Hc = (q: number) => Math.max(0, H0 - k * q * q);
  const Qmax = Math.sqrt(H0 / (k || 1e-9));
  const W = 300, H = 150, pl = 34, pr = 12, pt = 8, pb = 22, pw = W - pl - pr, ph = H - pt - pb;
  const xP = (q: number) => pl + q / (Qmax * 1.02) * pw, yP = (h: number) => pt + ph - h / (H0 * 1.05) * ph;
  const curve: string[] = []; for (let i = 0; i <= 36; i++) { const q = Qmax * 1.02 * i / 36; curve.push(`${xP(q)},${yP(Hc(q))}`); }
  const opQ = p.inferredFlow_m3h, opH = Hc(opQ);
  const npsh = dp.npshRatio;
  const npshTight = npsh != null && npsh < 1.2;
  const startsLeft = Math.max(0, 5 - p.startsThisHour);

  return (
    <div className="w-80 flex-shrink-0 space-y-3">
      <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
          <Activity size={13} className="text-blue-400" />
          <span className="text-sm font-semibold text-gray-200">Pump P{p.index} detail</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: `${RUN_COLORS[p.runState]}22`, color: RUN_COLORS[p.runState] }}>{p.runState.toUpperCase()}</span>
        </div>
        <div className="p-2">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
            <polyline points={`${pl},${pt} ${pl},${pt + ph} ${pl + pw},${pt + ph}`} fill="none" stroke="#334155" strokeWidth="0.7" />
            {/* preferred operating region 70-120% BEP */}
            <rect x={xP(dutyQ * 0.7)} y={pt} width={xP(dutyQ * 1.2) - xP(dutyQ * 0.7)} height={ph} fill="rgba(34,197,94,0.08)" />
            <polyline points={curve.join(' ')} fill="none" stroke="#4f8ef7" strokeWidth="1.5" />
            <rect x={xP(dutyQ) - 3} y={yP(dutyH) - 3} width="6" height="6" fill="#22c55e" transform={`rotate(45 ${xP(dutyQ)} ${yP(dutyH)})`} />
            <text x={xP(dutyQ)} y={pt + 8} fill="#22c55e" fontSize="7" textAnchor="middle">BEP</text>
            {p.runState === 'running' && <circle cx={xP(opQ)} cy={yP(opH)} r="3.5" fill="#fbbf24" stroke="#0f1117" />}
            <text x={pl + pw / 2} y={H - 3} fill="#64748b" fontSize="7" textAnchor="middle">Q (m³/h) — op. point derived from speed</text>
          </svg>
        </div>
      </div>

      {/* NPSH margin — prominence scales with tightness */}
      <div className="rounded-lg p-3" style={{ background: npshTight ? 'rgba(239,68,68,0.08)' : 'rgba(17,24,39,0.6)', border: `1px solid ${npshTight ? 'rgba(239,68,68,0.4)' : '#1e3a5f'}` }}>
        <div className="flex items-center gap-2 mb-1">
          <Waves size={13} className={npshTight ? 'text-red-400' : 'text-blue-400'} />
          <span className="text-sm font-semibold text-gray-200">NPSH margin</span>
          {npshTight && <span className="ml-auto text-xs px-1.5 rounded" style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>TIGHT</span>}
        </div>
        {npsh != null ? (
          <>
            <div className="text-2xl font-mono font-bold" style={{ color: npshTight ? '#fca5a5' : '#4ade80' }}>{npsh.toFixed(2)}<span className="text-sm text-gray-500"> ratio (avail/req)</span></div>
            <div className="text-gray-500" style={{ fontSize: 10 }}>{npshTight ? 'Low suction margin — cavitation risk; watch suction pressure and level closely.' : 'Comfortable suction margin.'}</div>
          </>
        ) : <span className="text-gray-600 text-xs">NPSH ratio not stated for this station.</span>}
      </div>

      <div className="rounded-lg p-3 space-y-1.5" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
        <Row l="Speed" v={p.speedPct > 0 ? `${p.speedPct.toFixed(1)} %` : '—'} />
        <Row l="Motor current" v={p.currentA > 0 ? `${p.currentA.toFixed(0)} A` : '—'} />
        <Row l="VFD power" v={p.powerKw > 0 ? `${p.powerKw.toFixed(0)} kW` : '—'} />
        <Row l="Winding temp" v={`${p.windingTemp.toFixed(0)} °C`} alarm={p.windingTemp > 110} />
        <Row l="Bearing temp" v={`${p.bearingTemp.toFixed(0)} °C`} alarm={p.bearingTemp > 90} />
        <Row l="Vibration" v={`${p.vibration.toFixed(2)} mm/s`} alarm={p.vibration > 7} />
        <Row l="Specific energy" v={p.specificEnergy > 0 ? `${p.specificEnergy.toFixed(3)} kWh/m³` : '—'} icon={<TrendingUp size={10} className="text-purple-400" />} />
        <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <span className="text-gray-500 text-xs flex items-center gap-1"><Zap size={10} /> Starts remaining this hour</span>
          <span className="font-mono font-bold" style={{ color: startsLeft <= 1 ? '#ef4444' : startsLeft <= 2 ? '#f59e0b' : '#4ade80' }}>{startsLeft} / 5</span>
        </div>
        <div className="text-gray-600" style={{ fontSize: 9 }}>ER limit 5 starts/hour · run hours {p.runHours.toLocaleString()}</div>
      </div>
    </div>
  );
}

function StagingFooter({ state }: { state: StationLoadState }) {
  const nextIdx = state.pumps.find(p => p.id === state.staging.nextToStart)?.index;
  return (
    <div className="mt-3 rounded-lg px-3 py-2" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
      <div className="flex items-center gap-2 text-xs">
        <Clock size={13} className="text-blue-400" />
        <span className="font-semibold text-gray-300">Duty staging</span>
        <span className="text-gray-600">stagger {state.staging.staggerSec}s</span>
        <span className="ml-auto text-gray-400">
          {state.staging.nextToStart
            ? <>Next to start: <b className="text-blue-300">P{nextIdx}</b> in <b className="text-yellow-300">{state.staging.countdownSec}s</b></>
            : 'All standby pumps assigned'}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
        <span className="text-gray-600" style={{ fontSize: 9 }}>Rotation (least-run first):</span>
        {state.staging.rotationOrder.slice(0, 12).map((id, i) => {
          const idx = state.pumps.find(p => p.id === id)?.index;
          return <span key={id} className="px-1.5 rounded font-mono" style={{ fontSize: 9, background: i === 0 ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)', color: i === 0 ? '#93c5fd' : '#6b7280' }}>P{idx}</span>;
        })}
      </div>
    </div>
  );
}

function ContractorPlaceholder({ station }: { station: string }) {
  return (
    <div className="rounded-lg p-6 text-center" style={{ background: 'rgba(17,24,39,0.6)', border: '1px dashed rgba(245,158,11,0.4)' }}>
      <AlertTriangle size={22} className="text-amber-400 mx-auto mb-2" />
      <div className="text-gray-200 font-semibold mb-1">Pump count — contractor design</div>
      <div className="text-gray-500 text-sm max-w-md mx-auto">
        {station}: the Detailed Design Report leaves the number of pumpsets to the contractor. No pump count is shown because none has been fixed — the station is not hidden, and no number is invented.
      </div>
    </div>
  );
}

function FramingBanner() {
  return (
    <div className="mb-3 px-3 py-2 rounded-lg flex items-start gap-2 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
      <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="text-amber-200/90"><b>Demonstration data. Design-stage visualisation.</b> Not live telemetry, not an operational system. Analogues are 5-minute polled data; every value is synthetic and carries an age.</div>
    </div>
  );
}

function Kpi({ label, val, sub, color }: { label: string; val: string; sub?: string; color: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(17,24,39,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-gray-600" style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div className="font-mono font-bold" style={{ color, fontSize: 15 }}>{val}</div>
      {sub && <div className="text-gray-700" style={{ fontSize: 8 }}>{sub}</div>}
    </div>
  );
}

function Row({ l, v, alarm, icon }: { l: string; v: string; alarm?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500 flex items-center gap-1">{icon}{l}</span>
      <span className={`font-mono font-semibold ${alarm ? 'text-red-400 alarm-blink' : 'text-gray-200'}`}>{v}</span>
    </div>
  );
}
