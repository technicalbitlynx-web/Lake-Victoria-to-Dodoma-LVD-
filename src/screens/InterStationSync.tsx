import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, Info, Link2, Radio, Waves, Activity, Zap, ArrowRight, Power, RotateCw, CheckCircle } from 'lucide-react';
import { SYNC_PAIRS, getSyncState, SYNC_MODE_META, EVENT_PHASE_META, type SyncState, type EventPhase } from '../lib/syntheticPumpData';

const PHASE_ICON: Record<EventPhase, React.ReactNode> = {
  normal: <CheckCircle size={13} />, outage: <Power size={13} />, stopped: <Power size={13} />,
  restore: <RotateCw size={13} />, resync: <Activity size={13} />,
};

export default function InterStationSync() {
  const [pairId] = useState(SYNC_PAIRS[0].id);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 2000); return () => clearInterval(t); }, []);
  const s = useMemo<SyncState>(() => getSyncState(pairId, now), [pairId, now]);
  const modeMeta = SYNC_MODE_META[s.mode];
  const ev = s.event;
  const evMeta = EVENT_PHASE_META[ev.phase];
  const masterName = s.stationALabel.replace(' (master)', '');
  const slaveName = s.stationBLabel.replace(' (slave)', '');

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      <FramingBanner />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link2 size={18} className="text-blue-400" />
          <div>
            <h2 className="text-lg font-bold text-gray-200">Inter-Station Sync — Kidaru → Kisiriri</h2>
            <p className="text-xs text-gray-500">Peer-to-peer speed sync between Kidaru IBPS-2 (master) and Kisiriri IBPS-3 (slave) · protects the intermediate balancing tank</p>
          </div>
        </div>
        <span className="px-2 py-1 rounded font-semibold text-xs" style={{ background: `${modeMeta.color}22`, color: modeMeta.color, border: `1px solid ${modeMeta.color}55` }}>
          MODE: {modeMeta.label}
        </span>
      </div>

      {/* master → slave relationship (resolved, directional) */}
      <div className="mb-3 rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
        <StationBadge name={masterName} role="MASTER" sub="upstream · fills tank" color="#4f8ef7" speed={ev.masterSpeedPct} />
        <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 120 }}>
          <span className="text-gray-500" style={{ fontSize: 9 }}>speed reference over</span>
          <div className="flex items-center gap-1 text-cyan-300"><span style={{ fontSize: 10 }}>fibre P2P</span></div>
          <ArrowRight size={22} className="text-cyan-400" />
          <span className="font-mono" style={{ fontSize: 9, color: Math.abs(s.speed.deviationHz) > 0.5 ? '#ef4444' : '#4ade80' }}>Δ {s.speed.deviationHz.toFixed(2)} Hz</span>
        </div>
        <StationBadge name={slaveName} role="SLAVE" sub="downstream · draws tank" color="#f472b6" speed={ev.slaveSpeedPct} />
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-gray-500" style={{ fontSize: 9 }}>protects</div>
          <div className="font-semibold text-indigo-300 text-sm">Kisiriri balancing tank</div>
          <div className="text-gray-600" style={{ fontSize: 9 }}>overflow / dry-run risk if out of step</div>
        </div>
      </div>

      {/* ── LIVE EVENT — the dominant element ── */}
      <div className="rounded-xl p-4 mb-3" style={{ background: `linear-gradient(90deg, ${evMeta.color}1c, rgba(17,24,39,0.6))`, border: `2px solid ${evMeta.color}` }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-shrink-0">
            <div className="text-gray-500 flex items-center gap-1" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{PHASE_ICON[ev.phase]} Event phase</div>
            <div className="font-bold" style={{ color: evMeta.color, fontSize: 26, lineHeight: 1.1 }}>{evMeta.label}</div>
            <div className="text-gray-500 text-xs mt-0.5">{ev.active ? `next phase in ~${ev.countdownSec}s` : `holding · demo cycles every 5 min`}</div>
          </div>
          <div className="flex-1 min-w-[260px] grid grid-cols-2 gap-3">
            <SpeedGauge label={`${masterName} (master)`} pct={ev.masterSpeedPct} hz={s.speed.refHz} color="#4f8ef7" />
            <SpeedGauge label={`${slaveName} (slave)`} pct={ev.slaveSpeedPct} hz={s.speed.actualHz} color="#f472b6" />
          </div>
          <div className="flex-shrink-0 max-w-[280px] px-3 py-2 rounded-lg" style={{ background: 'rgba(5,12,24,0.7)', border: `1px solid ${evMeta.color}44` }}>
            <div className="flex items-center gap-1 font-semibold mb-0.5" style={{ color: evMeta.color, fontSize: 11 }}><Info size={11} /> Operator</div>
            <div className="text-gray-300" style={{ fontSize: 11 }}>{ev.operatorNote}</div>
          </div>
        </div>
      </div>

      {/* ── Power-outage → restore sequence: chart + stepper ── */}
      <div className="rounded-xl mb-3" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
          <Zap size={13} className="text-yellow-400" />
          <span className="text-sm font-semibold text-gray-200">How the two stations stay in step through a power outage &amp; restore</span>
          <span className="ml-auto text-gray-600 text-xs">{s.rampSeconds}s coordinated ramp · {s.coastdown.waveWindowSec}s wave window</span>
        </div>
        <div className="p-3">
          <EventChart s={s} masterName={masterName} slaveName={slaveName} />
          {/* stepper */}
          <div className="grid grid-cols-5 gap-2 mt-3">
            {s.sequence.map(step => {
              const meta = EVENT_PHASE_META[step.key];
              const activeStep = step.key === ev.phase;
              return (
                <div key={step.key} className="rounded-lg p-2" style={{ background: activeStep ? `${meta.color}1c` : 'rgba(5,12,24,0.6)', border: `1px solid ${activeStep ? meta.color : 'rgba(255,255,255,0.06)'}`, boxShadow: activeStep ? `0 0 14px ${meta.color}55` : 'none' }}>
                  <div className="flex items-center gap-1 font-semibold mb-1" style={{ color: meta.color, fontSize: 11 }}>{PHASE_ICON[step.key]}{step.title}</div>
                  <StepLine c="#4f8ef7" label={masterName} text={step.masterAction} />
                  <StepLine c="#f472b6" label={slaveName} text={step.slaveAction} />
                  <StepLine c="#22d3ee" label="Fibre" text={step.linkState} />
                  <StepLine c="#818cf8" label="Tank" text={step.tankEffect} />
                  <div className="mt-1 pt-1 text-gray-500" style={{ fontSize: 9.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>{step.note}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* fibre note */}
      <div className="mb-3 px-3 py-2 rounded-lg flex items-start gap-2 text-xs" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)' }}>
        <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-blue-200/90">The millisecond speed-reference loop runs on <b>dedicated fibre between the two station controllers</b> (kept alive on UPS) and is never visible live at central SCADA in Dodoma. Cellular failover carries telemetry only and <b>cannot sustain this loop</b> — on fibre loss both stations run an <b>identical emergency ramp stored in local NVM</b>, so they still stop together.</div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        {/* link health */}
        <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: `1px solid ${s.link.healthy ? '#1e3a5f' : 'rgba(239,68,68,0.4)'}` }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
            <Radio size={13} className={s.link.healthy ? 'text-green-400' : 'text-red-400'} />
            <span className="text-sm font-semibold text-gray-200">Fibre link health</span>
            <span className="ml-auto text-xs font-bold" style={{ color: s.link.healthy ? '#4ade80' : '#fca5a5' }}>{s.link.healthy ? 'HEALTHY' : 'DEGRADED'}</span>
          </div>
          <div className="p-3 space-y-1">
            <Row l="Latency" v={`${s.link.latencyMs.toFixed(1)} ms`} alarm={s.link.latencyMs > 10} />
            <Row l="Jitter" v={`${s.link.jitterMs.toFixed(2)} ms`} alarm={s.link.jitterMs > 2} />
            <Row l="Packet loss" v={`${s.link.packetLossPct.toFixed(2)} %`} alarm={s.link.packetLossPct > 1} />
            <Row l="Media" v={s.link.media} />
          </div>
        </div>

        {/* balancing tank — consequence + teaching */}
        <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
            <Waves size={13} className="text-indigo-400" />
            <span className="text-sm font-semibold text-gray-200">Kisiriri balancing tank</span>
            <span className="ml-auto text-gray-600 text-xs">why sync matters</span>
          </div>
          <div className="p-3 flex gap-3">
            <TankMimic level={s.tank.level_m} min={s.tank.min_m} max={s.tank.max_m} />
            <div className="flex-1 space-y-1">
              <Row l="Level" v={`${s.tank.level_m.toFixed(2)} m`} />
              <Row l="Band" v={`${s.tank.min_m}–${s.tank.max_m} m`} />
              <Row l="Rate of change" v={`${s.tank.rocMh >= 0 ? '+' : ''}${s.tank.rocMh.toFixed(3)} m/h`} alarm={Math.abs(s.tank.rocMh) > 0.2} />
              <Row l="Net imbalance" v={`${s.tank.netImbalance_m3h >= 0 ? '+' : ''}${s.tank.netImbalance_m3h.toFixed(0)} m³/h`} />
              {s.tank.projection.kind === 'none' ? (
                <div className="text-xs pt-1" style={{ color: '#4ade80', borderTop: '1px solid rgba(255,255,255,0.06)' }}>✓ In-step ramps → inflow &amp; outflow balanced → level held.</div>
              ) : (
                <div className="text-xs pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: s.tank.projection.kind === 'overflow' ? '#f59e0b' : '#ef4444' }} className="font-bold">
                    {s.tank.projection.kind === 'overflow' ? '▲ OVERFLOW' : '▼ DRY-RUN'} in {fmtDuration(s.tank.projection.minutes!)}
                  </span>
                  <span className="text-gray-600"> ({s.tank.projection.basis})</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* surge protection */}
        <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
            <AlertTriangle size={13} className="text-cyan-400" />
            <span className="text-sm font-semibold text-gray-200">Surge protection</span>
            <span className="ml-auto text-gray-600 text-xs">rides the {s.rampSeconds}s ramp</span>
          </div>
          <div className="p-3 grid grid-cols-3 gap-1.5">
            {s.coastdown.surge.bladders.map(b => (
              <div key={b.id} className="rounded px-1.5 py-1 text-center" style={{ background: 'rgba(5,12,24,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-gray-600" style={{ fontSize: 8 }}>Bladder {b.id.replace('_IBPS2', ' KID').replace('_IBPS3', ' KIS')}</div>
                <div className="font-mono text-cyan-300" style={{ fontSize: 10 }}>{b.m3} m³</div>
              </div>
            ))}
            <div className="rounded px-1.5 py-1 text-center col-span-3" style={{ background: 'rgba(5,12,24,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-gray-600" style={{ fontSize: 8 }}>One-way surge tank</div>
              <div className="font-mono text-cyan-300" style={{ fontSize: 10 }}>{s.coastdown.surge.surgeTank_m3} m³ · {s.coastdown.surge.surgeTankLevelPct.toFixed(0)}% level</div>
            </div>
          </div>
        </div>
      </div>

      {/* mode timeline */}
      <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
          <span className="text-sm font-semibold text-gray-200">Control-mode timeline — last 24 h</span>
          <span className="ml-auto text-purple-400 text-xs">event resolution (not 5-min polled)</span>
        </div>
        <div className="p-3">
          <div className="flex h-7 rounded overflow-hidden">
            {s.modeTimeline.map((sg, i) => {
              const meta = SYNC_MODE_META[sg.mode];
              return <div key={i} title={meta.label} style={{ width: `${(sg.endFrac - sg.startFrac) * 100}%`, background: meta.color, opacity: sg.mode === 'PEER_TO_PEER' ? 0.5 : 0.9 }} />;
            })}
          </div>
          <div className="flex justify-between text-gray-600 mt-1" style={{ fontSize: 9 }}><span>−24 h</span><span>now</span></div>
        </div>
      </div>
    </div>
  );
}

/* ── station badge with live speed dial ── */
function StationBadge({ name, role, sub, color, speed }: { name: string; role: string; sub: string; color: string; speed: number }) {
  return (
    <div className="rounded-lg px-3 py-2 flex items-center gap-3 flex-shrink-0" style={{ background: `${color}14`, border: `1px solid ${color}44`, minWidth: 180 }}>
      <div>
        <div className="font-bold text-gray-100 text-sm">{name}</div>
        <div className="font-semibold" style={{ color, fontSize: 10 }}>{role}</div>
        <div className="text-gray-600" style={{ fontSize: 9 }}>{sub}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="font-mono font-bold" style={{ color, fontSize: 16 }}>{speed.toFixed(0)}%</div>
        <div className="text-gray-600" style={{ fontSize: 8 }}>speed</div>
      </div>
    </div>
  );
}

function SpeedGauge({ label, pct, hz, color }: { label: string; pct: number; hz: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5" style={{ fontSize: 10 }}>
        <span className="text-gray-400">{label}</span>
        <span className="font-mono" style={{ color }}>{pct.toFixed(0)}% · {hz.toFixed(1)} Hz</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function StepLine({ c, label, text }: { c: string; label: string; text: string }) {
  return (
    <div className="flex gap-1 mb-0.5" style={{ fontSize: 9.5 }}>
      <span className="flex-shrink-0 font-semibold" style={{ color: c, minWidth: 34 }}>{label}</span>
      <span className="text-gray-400">{text}</span>
    </div>
  );
}

/* ── combined outage → restore speed chart ── */
function EventChart({ s, masterName, slaveName }: { s: SyncState; masterName: string; slaveName: string }) {
  const W = 900, H = 150, pl = 30, pr = 10, pt = 10, pb = 26, pw = W - pl - pr, ph = H - pt - pb;
  const xf = (f: number) => pl + f * pw;
  const yv = (v: number) => pt + ph - (v / 100) * ph;
  const mLine = s.eventProfile.map(p => `${xf(p.frac)},${yv(p.master)}`).join(' ');
  const sLine = s.eventProfile.map(p => `${xf(p.frac)},${yv(p.slave)}`).join(' ');
  // phase bands
  const bands = [
    { a: 0, b: 0.12, key: 'normal' as EventPhase },
    { a: 0.12, b: 0.40, key: 'outage' as EventPhase },
    { a: 0.40, b: 0.52, key: 'stopped' as EventPhase },
    { a: 0.52, b: 0.80, key: 'restore' as EventPhase },
    { a: 0.80, b: 1, key: 'resync' as EventPhase },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* phase bands */}
      {bands.map((bd, i) => {
        const meta = EVENT_PHASE_META[bd.key];
        return (
          <g key={i}>
            <rect x={xf(bd.a)} y={pt} width={xf(bd.b) - xf(bd.a)} height={ph} fill={meta.color} opacity={0.08} />
            <text x={(xf(bd.a) + xf(bd.b)) / 2} y={pt + 10} fill={meta.color} fontSize="8" textAnchor="middle" fontWeight="700">{meta.short}</text>
          </g>
        );
      })}
      {/* axes */}
      <polyline points={`${pl},${pt} ${pl},${pt + ph} ${pl + pw},${pt + ph}`} fill="none" stroke="#334155" strokeWidth="0.6" />
      <text x={pl - 3} y={pt + 4} fill="#64748b" fontSize="7" textAnchor="end">100</text>
      <text x={pl - 3} y={pt + ph} fill="#64748b" fontSize="7" textAnchor="end">0</text>
      {/* divergence fill */}
      <polygon points={`${mLine} ${[...s.eventProfile].reverse().map(p => `${xf(p.frac)},${yv(p.slave)}`).join(' ')}`} fill="rgba(239,68,68,0.10)" />
      {/* traces */}
      <polyline points={mLine} fill="none" stroke="#4f8ef7" strokeWidth="1.8" />
      <polyline points={sLine} fill="none" stroke="#f472b6" strokeWidth="1.8" />
      {/* wave window inside the outage band */}
      <line x1={xf(0.12 + 0.28 * (s.coastdown.waveWindowSec / s.rampSeconds))} y1={pt} x2={xf(0.12 + 0.28 * (s.coastdown.waveWindowSec / s.rampSeconds))} y2={pt + ph} stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="3,2" />
      {/* live now marker */}
      <line x1={xf(s.nowFrac)} y1={pt} x2={xf(s.nowFrac)} y2={pt + ph} stroke="#fbbf24" strokeWidth="1.4" />
      <circle cx={xf(s.nowFrac)} cy={pt + 4} r="3" fill="#fbbf24" />
      <text x={xf(s.nowFrac)} y={pt + ph + 10} fill="#fbbf24" fontSize="7" textAnchor="middle">now</text>
      {/* legend */}
      <g>
        <line x1={pl + 4} y1={H - 4} x2={pl + 18} y2={H - 4} stroke="#4f8ef7" strokeWidth="1.6" /><text x={pl + 22} y={H - 1} fill="#94a3b8" fontSize="8">{masterName} (master)</text>
        <line x1={pl + 130} y1={H - 4} x2={pl + 144} y2={H - 4} stroke="#f472b6" strokeWidth="1.6" /><text x={pl + 148} y={H - 1} fill="#94a3b8" fontSize="8">{slaveName} (slave)</text>
        <text x={pl + 250} y={H - 1} fill="#22d3ee" fontSize="8">┆ {s.coastdown.waveWindowSec}s wave window</text>
      </g>
    </svg>
  );
}

function TankMimic({ level, min, max }: { level: number; min: number; max: number }) {
  const pct = ((level - 0) / (max + 0.5)) * 100;
  const minPct = (min / (max + 0.5)) * 100, maxPct = (max / (max + 0.5)) * 100;
  return (
    <div className="flex-shrink-0 relative" style={{ width: 50, height: 100 }}>
      <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ background: 'rgba(5,12,24,0.9)', border: '1px solid rgba(129,140,248,0.4)' }}>
        <div className="absolute bottom-0 left-0 right-0 transition-all" style={{ height: `${pct}%`, background: 'linear-gradient(180deg, rgba(129,140,248,0.6), rgba(79,70,229,0.8))' }} />
      </div>
      <div className="absolute left-0 right-0" style={{ bottom: `${maxPct}%`, borderTop: '1px dashed #ef4444' }}><span className="absolute right-0 text-red-400" style={{ fontSize: 7, top: -8 }}>max</span></div>
      <div className="absolute left-0 right-0" style={{ bottom: `${minPct}%`, borderTop: '1px dashed #f59e0b' }}><span className="absolute right-0 text-amber-400" style={{ fontSize: 7, top: -8 }}>min</span></div>
    </div>
  );
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} h ${m} min`;
}

function FramingBanner() {
  return (
    <div className="mb-3 px-3 py-2 rounded-lg flex items-start gap-2 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
      <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="text-amber-200/90"><b>Demonstration data. Design-stage visualisation.</b> Not live telemetry, not an operational system. The outage → restore sequence is a synthetic demonstration cycling every 5 minutes so operators can see how the two stations stay in step. Every value is synthetic.</div>
    </div>
  );
}

function Row({ l, v, alarm }: { l: string; v: string; alarm?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{l}</span>
      <span className={`font-mono font-semibold ${alarm ? 'text-red-400' : 'text-gray-200'}`}>{v}</span>
    </div>
  );
}
