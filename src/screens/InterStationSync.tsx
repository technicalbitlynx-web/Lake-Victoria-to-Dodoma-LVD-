import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, Info, Link2, Radio, Waves, Activity, Zap, HelpCircle, GitBranch } from 'lucide-react';
import { SYNC_PAIRS, getSyncState, SYNC_MODE_META, type SyncState } from '../lib/syntheticPumpData';

export default function InterStationSync() {
  const [pairId, setPairId] = useState(SYNC_PAIRS[0].id);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  const s = useMemo<SyncState>(() => getSyncState(pairId, now), [pairId, now]);
  const modeMeta = SYNC_MODE_META[s.mode];

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      <FramingBanner />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link2 size={18} className="text-blue-400" />
          <div>
            <h2 className="text-lg font-bold text-gray-200">Inter-Station Sync Link</h2>
            <p className="text-xs text-gray-500">Peer-to-peer speed synchronisation between paired boosters · the balancing tank is what it protects</p>
          </div>
        </div>
        {SYNC_PAIRS.length > 1 && (
          <select value={pairId} onChange={e => setPairId(e.target.value)} className="text-sm rounded px-2 py-1" style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}>
            {SYNC_PAIRS.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
        )}
      </div>

      {/* CONTROL MODE — the single largest object */}
      <div className="rounded-xl p-4 mb-3 flex items-center gap-4" style={{ background: `linear-gradient(90deg, ${modeMeta.color}18, rgba(17,24,39,0.6))`, border: `2px solid ${modeMeta.color}` }}>
        <div className="flex-shrink-0">
          <div className="text-gray-500" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Control mode</div>
          <div className="font-bold" style={{ color: modeMeta.color, fontSize: 30, lineHeight: 1.1 }}>{modeMeta.label}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>EVENT-driven</span>
            <span className="text-gray-600 text-xs">arrives on change, not on the 5-min poll · age {s.modeAgeSec}s</span>
          </div>
        </div>
        {s.mode === 'UNKNOWN' && (
          <div className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <HelpCircle size={16} className="text-red-400" />
            <span className="text-red-200 text-xs" style={{ maxWidth: 260 }}>Mode not reported / stale. <b>Treated as degraded</b> — absence of a fault signal is not evidence of health.</span>
          </div>
        )}
      </div>

      {/* unresolved pairing note */}
      {!s.resolved && (
        <div className="mb-3 px-3 py-2 rounded-lg flex items-start gap-2 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }}>
          <GitBranch size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-amber-200/90">
            <b>Master / slave assignment unresolved.</b> {s.pair.unresolvedReason} No directional arrow is drawn; the two ends are shown as <b>{s.stationALabel.split('—')[0].trim()}</b> and <b>{s.stationBLabel.split('—')[0].trim()}</b>. Setting the two IDs and <code>resolved: true</code> is the only change needed to make the direction appear.
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-3">
        {/* Link health */}
        <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: `1px solid ${s.link.healthy ? '#1e3a5f' : 'rgba(239,68,68,0.4)'}` }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
            <Radio size={13} className={s.link.healthy ? 'text-green-400' : 'text-red-400'} />
            <span className="text-sm font-semibold text-gray-200">Link health</span>
            <span className="ml-auto text-xs font-bold" style={{ color: s.link.healthy ? '#4ade80' : '#fca5a5' }}>{s.link.healthy ? 'HEALTHY' : 'DEGRADED'}</span>
          </div>
          <div className="p-3 space-y-1">
            <Row l="Latency" v={s.link.latencyMs >= 999 ? 'no link' : `${s.link.latencyMs.toFixed(1)} ms`} alarm={s.link.latencyMs > 10} />
            <Row l="Jitter" v={`${s.link.jitterMs.toFixed(2)} ms`} alarm={s.link.jitterMs > 2} />
            <Row l="Packet loss" v={`${s.link.packetLossPct.toFixed(2)} %`} alarm={s.link.packetLossPct > 1} />
            <Row l="Since last good" v={s.link.sinceLastGoodSec > 0 ? `${s.link.sinceLastGoodSec} s` : 'live'} alarm={s.link.sinceLastGoodSec > 5} />
            <Row l="Media" v={s.link.media} />
          </div>
        </div>

        {/* Speed tracking */}
        <div className="rounded-lg col-span-2" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
            <Activity size={13} className="text-blue-400" />
            <span className="text-sm font-semibold text-gray-200">Speed tracking</span>
            <span className="ml-auto font-mono text-xs" style={{ color: Math.abs(s.speed.deviationHz) > 0.5 ? '#ef4444' : Math.abs(s.speed.deviationHz) > 0.2 ? '#f59e0b' : '#4ade80' }}>
              Δ {s.speed.deviationHz >= 0 ? '+' : ''}{s.speed.deviationHz.toFixed(2)} Hz ({((s.speed.deviationHz / (s.speed.refHz || 1)) * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="p-2">
            <DualTrace ref1={s.speed.refTrace} act={s.speed.actualTrace} aLabel={s.stationALabel} bLabel={s.stationBLabel} />
            <div className="flex items-center gap-4 mt-1 text-xs px-1">
              <span className="flex items-center gap-1 text-gray-400"><span className="w-3 h-0.5 inline-block" style={{ background: '#4f8ef7' }} />{s.stationALabel} <b className="font-mono">{s.speed.refHz.toFixed(1)} Hz</b></span>
              <span className="flex items-center gap-1 text-gray-400"><span className="w-3 h-0.5 inline-block" style={{ background: '#f472b6' }} />{s.stationBLabel} <b className="font-mono">{s.speed.actualHz.toFixed(1)} Hz</b></span>
              <span className="ml-auto text-gray-600">5-min polled trace · high-res only on event replay</span>
            </div>
          </div>
        </div>
      </div>

      {/* fibre note — on screen, not a tooltip */}
      <div className="mb-3 px-3 py-2 rounded-lg flex items-start gap-2 text-xs" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)' }}>
        <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-blue-200/90">The millisecond speed-reference loop runs on <b>dedicated fibre between the station controllers</b> and is never visible live at central SCADA in Dodoma. Cellular failover carries telemetry and supervisory control only and <b>cannot sustain this loop</b> — on fibre loss the stations degrade to local autonomous ramp held in NVM.</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Balancing tank consequence */}
        <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
            <Waves size={13} className="text-indigo-400" />
            <span className="text-sm font-semibold text-gray-200">Balancing tank — {s.pair.balancingTank.station.replace('_', '-')}</span>
            <span className="ml-auto text-gray-600 text-xs">the asset the loop protects</span>
          </div>
          <div className="p-3 flex gap-3">
            <TankMimic level={s.tank.level_m} min={s.tank.min_m} max={s.tank.max_m} />
            <div className="flex-1 space-y-1">
              <Row l="Level" v={`${s.tank.level_m.toFixed(2)} m`} />
              <Row l="Operating band" v={`${s.tank.min_m}–${s.tank.max_m} m`} />
              <Row l="Rate of change" v={`${s.tank.rocMh >= 0 ? '+' : ''}${s.tank.rocMh.toFixed(3)} m/h`} alarm={Math.abs(s.tank.rocMh) > 0.2} />
              <Row l="Net imbalance" v={`${s.tank.netImbalance_m3h >= 0 ? '+' : ''}${s.tank.netImbalance_m3h.toFixed(0)} m³/h`} />
              <div className="pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {s.tank.projection.kind === 'none' ? (
                  <div className="text-gray-500 text-xs">Level steady — no overflow/dry-run projection (ROC near zero).</div>
                ) : (
                  <div className="text-xs">
                    <span style={{ color: s.tank.projection.kind === 'overflow' ? '#f59e0b' : '#ef4444' }} className="font-bold">
                      {s.tank.projection.kind === 'overflow' ? '▲ Projected OVERFLOW' : '▼ Projected DRY-RUN'} in {fmtDuration(s.tank.projection.minutes!)}
                    </span>
                    <div className="text-gray-600" style={{ fontSize: 9 }}>{s.tank.projection.basis}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Coast-down replay */}
        <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
            <Zap size={13} className="text-yellow-400" />
            <span className="text-sm font-semibold text-gray-200">Coast-down ({s.pair.rampDownSeconds}s ramp)</span>
            <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>REPLAY — post-event</span>
          </div>
          <div className="p-2">
            <CoastChart a={s.coastdown.rampA} b={s.coastdown.rampB} waveWindow={s.coastdown.waveWindowSec} ramp={s.pair.rampDownSeconds} />
            <div className="flex items-center gap-3 mt-1 text-xs px-1 flex-wrap">
              <span className="text-gray-500">Max sync divergence <b className="font-mono" style={{ color: s.coastdown.divergencePct > 15 ? '#ef4444' : '#f59e0b' }}>{s.coastdown.divergencePct}%</b></span>
              <span className="text-gray-500">Wave window <b className="font-mono text-cyan-300">{s.coastdown.waveWindowSec}s</b></span>
            </div>
            {/* surge assets */}
            <div className="mt-2 grid grid-cols-3 gap-1">
              {s.coastdown.surge.bladders.map(b => (
                <div key={b.id} className="rounded px-1.5 py-1 text-center" style={{ background: 'rgba(5,12,24,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-gray-600" style={{ fontSize: 8 }}>Bladder {b.id.replace('_UNRESOLVED', '?').replace('_', '-')}</div>
                  <div className="font-mono text-cyan-300" style={{ fontSize: 10 }}>{b.m3} m³</div>
                </div>
              ))}
              <div className="rounded px-1.5 py-1 text-center" style={{ background: 'rgba(5,12,24,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-gray-600" style={{ fontSize: 8 }}>Surge tank</div>
                <div className="font-mono text-cyan-300" style={{ fontSize: 10 }}>{s.coastdown.surge.surgeTank_m3} m³ · {s.coastdown.surge.surgeTankLevelPct.toFixed(0)}%</div>
              </div>
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
          <div className="flex h-8 rounded overflow-hidden">
            {s.modeTimeline.map((seg, i) => {
              const meta = SYNC_MODE_META[seg.mode];
              return <div key={i} title={meta.label} style={{ width: `${(seg.endFrac - seg.startFrac) * 100}%`, background: meta.color, opacity: seg.mode === 'PEER_TO_PEER' ? 0.5 : 0.9 }} />;
            })}
          </div>
          <div className="flex justify-between text-gray-600 mt-1" style={{ fontSize: 9 }}>
            <span>−24 h</span><span>now</span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {(['PEER_TO_PEER', 'LOCAL_EMERGENCY_RAMP', 'UNKNOWN'] as const).map(m => (
              <span key={m} className="flex items-center gap-1 text-gray-500 text-xs"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: SYNC_MODE_META[m].color }} />{SYNC_MODE_META[m].label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── charts ── */
function DualTrace({ ref1, act, aLabel, bLabel }: { ref1: number[]; act: number[]; aLabel: string; bLabel: string }) {
  const W = 620, H = 90, pl = 28, pr = 8, pt = 6, pb = 6, pw = W - pl - pr, ph = H - pt - pb;
  const all = [...ref1, ...act]; const min = Math.min(...all) - 0.5, max = Math.max(...all) + 0.5, range = max - min || 1;
  const line = (arr: number[]) => arr.map((v, i) => `${pl + (i / (arr.length - 1)) * pw},${pt + ph - ((v - min) / range) * ph}`).join(' ');
  void aLabel; void bLabel;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {[min, (min + max) / 2, max].map((y, i) => (
        <g key={i}><line x1={pl} y1={pt + ph - ((y - min) / range) * ph} x2={pl + pw} y2={pt + ph - ((y - min) / range) * ph} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <text x={pl - 3} y={pt + ph - ((y - min) / range) * ph + 3} fill="#64748b" fontSize="8" textAnchor="end">{y.toFixed(1)}</text></g>
      ))}
      <polyline points={line(ref1)} fill="none" stroke="#4f8ef7" strokeWidth="1.4" />
      <polyline points={line(act)} fill="none" stroke="#f472b6" strokeWidth="1.4" />
    </svg>
  );
}

function CoastChart({ a, b, waveWindow, ramp }: { a: number[]; b: number[]; waveWindow: number; ramp: number }) {
  const W = 460, H = 120, pl = 26, pr = 8, pt = 8, pb = 18, pw = W - pl - pr, ph = H - pt - pb;
  const line = (arr: number[]) => arr.map((v, i) => `${pl + (i / (arr.length - 1)) * pw},${pt + ph - (v / 100) * ph}`).join(' ');
  const waveX = pl + (waveWindow / ramp) * pw;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <polyline points={`${pl},${pt} ${pl},${pt + ph} ${pl + pw},${pt + ph}`} fill="none" stroke="#334155" strokeWidth="0.6" />
      {/* divergence fill */}
      <polygon points={`${line(a)} ${b.map((v, i) => `${pl + ((b.length - 1 - i) / (b.length - 1)) * pw},${pt + ph - (b[b.length - 1 - i] / 100) * ph}`).join(' ')}`} fill="rgba(239,68,68,0.12)" />
      <polyline points={line(a)} fill="none" stroke="#4f8ef7" strokeWidth="1.5" />
      <polyline points={line(b)} fill="none" stroke="#f472b6" strokeWidth="1.5" />
      {/* wave window */}
      <line x1={waveX} y1={pt} x2={waveX} y2={pt + ph} stroke="#22d3ee" strokeWidth="1" strokeDasharray="3,2" />
      <text x={waveX + 2} y={pt + 8} fill="#22d3ee" fontSize="7">{waveWindow}s wave</text>
      <text x={pl + pw / 2} y={H - 4} fill="#64748b" fontSize="7" textAnchor="middle">0 → {ramp}s · speed %</text>
      <text x={pl - 3} y={pt + 4} fill="#64748b" fontSize="7" textAnchor="end">100</text>
    </svg>
  );
}

function TankMimic({ level, min, max }: { level: number; min: number; max: number }) {
  const pct = ((level - 0) / (max + 0.5)) * 100;
  const minPct = (min / (max + 0.5)) * 100, maxPct = (max / (max + 0.5)) * 100;
  return (
    <div className="flex-shrink-0 relative" style={{ width: 54, height: 110 }}>
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
      <div className="text-amber-200/90"><b>Demonstration data. Design-stage visualisation.</b> Not live telemetry, not an operational system. Mode/link states are event data; analogues are 5-minute polled; high-resolution ramps are post-event replay. Every value is synthetic.</div>
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
