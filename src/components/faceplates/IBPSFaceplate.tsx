import React, { useMemo } from 'react';
import { useScada } from '../../context/ScadaContext';
import type { Site } from '../../types';
import { TagRow, MiniTrend } from '../TagValue';
import { Activity, Zap, Thermometer, Vibrate } from 'lucide-react';

interface Props { site: Site; }

const PUMP_CURVE_POINTS = [
  { q: 0, h: 320 }, { q: 500, h: 315 }, { q: 1000, h: 305 },
  { q: 1500, h: 285 }, { q: 2000, h: 260 }, { q: 2500, h: 220 },
  { q: 3000, h: 165 }, { q: 3200, h: 130 },
];

function PumpCurve({ flow, head }: { flow: number; head: number }) {
  const W = 200, H = 100;
  const maxQ = 3500, maxH = 350;

  const pts = PUMP_CURVE_POINTS.map(p => {
    const x = (p.q / maxQ) * W;
    const y = H - (p.h / maxH) * H;
    return `${x},${y}`;
  }).join(' ');

  const opX = (flow / maxQ) * W;
  const opY = H - (head / maxH) * H;
  const eff = Math.max(0, Math.min(100, 85 - Math.pow((flow - 2200) / 500, 2) * 10));

  return (
    <div>
      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={f * W} y1={0} x2={f * W} y2={H} stroke="#1e3a5f" strokeWidth={0.5} />
        ))}
        {/* Pump curve */}
        <polyline points={pts} fill="none" stroke="#4f8ef7" strokeWidth={2} />
        {/* Operating point */}
        <circle cx={opX} cy={opY} r={5} fill="#f59e0b" stroke="#fde68a" strokeWidth={1.5} />
      </svg>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-gray-500">0 m³/h</span>
        <span className="text-yellow-400 font-mono">η={eff.toFixed(0)}%</span>
        <span className="text-gray-500">3500 m³/h</span>
      </div>
    </div>
  );
}

function PumpStatus({ siteId, pumpNum }: { siteId: string; pumpNum: number }) {
  const { state } = useScada();
  const runTag = state.tags[`${siteId}-P${pumpNum}-RUN`];
  const fltTag = state.tags[`${siteId}-P${pumpNum}-FLT`];

  const running = runTag?.value === 1;
  const fault = fltTag?.value === 1;

  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{
      background: fault ? '#450a0a' : running ? '#14532d' : '#1e3a5f',
      border: `1px solid ${fault ? '#ef4444' : running ? '#22c55e' : '#2e3250'}`
    }}>
      <div className={`w-2 h-2 rounded-full ${fault ? 'bg-red-500' : running ? 'bg-green-400' : 'bg-gray-600'}`} />
      <span style={{ color: fault ? '#ef4444' : running ? '#22c55e' : '#6b7280' }}>P{pumpNum}</span>
      <span className="ml-1" style={{ color: fault ? '#ef4444' : running ? '#22c55e' : '#6b7280' }}>
        {fault ? 'FLT' : running ? 'RUN' : 'STP'}
      </span>
    </div>
  );
}

export default function IBPSFaceplate({ site }: Props) {
  const { state } = useScada();
  const { tags, phase } = state;

  const phaseData = phase === 'ph1' ? site.phase1 : site.phase2;
  const pumpCount = ((phaseData?.pumps_working as number) ?? 2) + ((phaseData?.pumps_standby as number) ?? 1);
  const displayPumps = Math.min(pumpCount, 12);

  const flowTag = tags[`${site.id}-FT-001`];
  const flow = flowTag?.value ?? 0;
  const headTag = tags[`${site.id}-PT-DELY`];
  const headVal = headTag?.value ?? 0;
  const head = headVal * 10; // bar to m approx

  const totalKw = useMemo(() => {
    let sum = 0;
    for (let i = 1; i <= displayPumps; i++) {
      sum += tags[`${site.id}-P${i}-KW`]?.value ?? 0;
    }
    return sum;
  }, [tags, site.id, displayPumps]);

  return (
    <div className="p-3 text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: '#451a03', color: '#f59e0b' }}>
          {site.class}
        </span>
        <span className="text-gray-400">Chainage: {site.chainage_km} km</span>
        {site.elevation_masl && <span className="text-gray-400">{site.elevation_masl} masl</span>}
      </div>

      {site.indicative_position && (
        <div className="mb-2 px-2 py-1 rounded text-xs" style={{ background: '#451a03', color: '#f59e0b' }}>
          ⚠ Position indicative — survey coordinates pending [CONFIRM]
        </div>
      )}

      {/* Flow & Pressure */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <div className="flex items-center gap-1 mb-2">
          <Activity size={12} className="text-blue-400" />
          <span className="font-semibold text-gray-300">Flow & Pressure</span>
        </div>
        <TagRow tagId={`${site.id}-FT-001`} label="Delivery Flow" />
        <TagRow tagId={`${site.id}-FT-TOT`} label="Totalised Volume" decimals={0} />
        <TagRow tagId={`${site.id}-PT-SUCT`} label="Suction Pressure" />
        <TagRow tagId={`${site.id}-PT-DELY`} label="Delivery Pressure" />
        <div className="mt-2">
          <span className="text-gray-500 mb-1 block">Flow trend (30 min)</span>
          <MiniTrend tagId={`${site.id}-FT-001`} />
        </div>
      </div>

      {/* Pump operating point */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Pump Curve — Live Operating Point</span>
        <PumpCurve flow={flow} head={head} />
        <div className="text-gray-500 mt-1">
          Q={flow.toFixed(0)} m³/h  H={head.toFixed(0)} m
        </div>
      </div>

      {/* Pump set status */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-gray-300">Pump Set ({displayPumps} total)</span>
          <span className="text-gray-500">{phaseData?.pumps_working}W + {phaseData?.pumps_standby}S</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {Array.from({ length: displayPumps }, (_, i) => (
            <PumpStatus key={i + 1} siteId={site.id} pumpNum={i + 1} />
          ))}
        </div>
        <TagRow tagId={`${site.id}-P1-CURR`} label="P1 Current" />
        <TagRow tagId={`${site.id}-P1-VFD-SPEED`} label="P1 VFD Speed" />
        <TagRow tagId={`${site.id}-P1-VFD-FREQ`} label="P1 VFD Freq" />
        <TagRow tagId={`${site.id}-P1-RUNTIME`} label="P1 Runtime" decimals={0} />
      </div>

      {/* Energy */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <div className="flex items-center gap-1 mb-2">
          <Zap size={12} className="text-yellow-400" />
          <span className="font-semibold text-gray-300">Energy</span>
        </div>
        <div className="flex justify-between py-1 border-b" style={{ borderColor: '#1e3a5f' }}>
          <span className="text-gray-400">Station Total kW</span>
          <span className="font-mono font-semibold text-yellow-400">{totalKw.toFixed(0)} kW</span>
        </div>
        <TagRow tagId={`${site.id}-P1-KW`} label="P1 Active Power" />
        <TagRow tagId={`${site.id}-P1-KVAR`} label="P1 Reactive Power" />
        <div className="flex justify-between py-1" style={{ borderTop: '1px solid #1e3a5f' }}>
          <span className="text-gray-400">Energy intensity</span>
          <span className="font-mono text-yellow-400">
            {flow > 0 ? (totalKw / flow * 1000).toFixed(2) : '—'} Wh/m³
          </span>
        </div>
      </div>

      {/* Condition monitoring */}
      <div className="p-2 rounded" style={{ background: '#0d1b2a' }}>
        <div className="flex items-center gap-1 mb-2">
          <Thermometer size={12} className="text-orange-400" />
          <span className="font-semibold text-gray-300">Condition Monitoring</span>
        </div>
        <TagRow tagId={`${site.id}-P1-BTEMP-DE`} label="P1 Bearing DE Temp" />
        <TagRow tagId={`${site.id}-P1-BTEMP-NDE`} label="P1 Bearing NDE Temp" />
        <TagRow tagId={`${site.id}-P1-VIB`} label="P1 Vibration" />
      </div>

      {/* Disabled control strip */}
      <div className="mt-3 p-2 rounded" style={{ background: '#0d1b2a', border: '1px solid #1e3a5f' }}>
        <div className="text-gray-500 text-xs mb-2">Controls — Demonstration Mode</div>
        <div className="flex gap-2 flex-wrap">
          {['Start Lead', 'Stop Lead', 'Start Standby', 'Stop Station'].map(ctrl => (
            <button
              key={ctrl}
              disabled
              title="Control disabled in demonstration mode"
              className="px-2 py-1 rounded text-xs disabled-widget"
              style={{ background: '#1e3a5f', color: '#6b7280', border: '1px solid #2e3250' }}
            >{ctrl}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
