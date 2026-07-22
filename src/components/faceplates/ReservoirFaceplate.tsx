import React from 'react';
import type { Site } from '../../types';
import { useScada } from '../../context/ScadaContext';
import { TagRow, MiniTrend } from '../TagValue';
import { Droplets } from 'lucide-react';

interface Props { site: Site; }

function LevelGauge({ level, maxLevel, capacity }: { level: number; maxLevel: number; capacity: number }) {
  const pct = Math.min(1, Math.max(0, level / maxLevel));
  const volPct = (pct * 100).toFixed(1);
  const vol = (pct * capacity / 1000).toFixed(0);

  const barH = 80;
  const fillH = pct * barH;

  const color = pct < 0.2 ? '#ef4444' : pct > 0.9 ? '#f59e0b' : '#22c55e';

  return (
    <div className="flex items-end gap-3">
      <div className="relative" style={{ width: 28, height: barH, background: '#1e3a5f', borderRadius: 4, border: '1px solid #2e3250' }}>
        <div className="absolute bottom-0 left-0 right-0 rounded" style={{ height: fillH, background: color, opacity: 0.85, transition: 'height 0.5s' }} />
        {/* HH/LL marks */}
        <div className="absolute left-0 right-0" style={{ bottom: barH * 0.9, borderTop: '1px dashed #ef4444' }} />
        <div className="absolute left-0 right-0" style={{ bottom: barH * 0.1, borderTop: '1px dashed #ef4444' }} />
      </div>
      <div>
        <div className="font-mono font-bold text-lg" style={{ color }}>{volPct}%</div>
        <div className="text-gray-400 text-xs">{vol} k m³</div>
        <div className="text-gray-500 text-xs">of {(capacity / 1000).toFixed(0)}k m³</div>
      </div>
    </div>
  );
}

export default function ReservoirFaceplate({ site }: Props) {
  const { state } = useScada();
  const { tags, phase } = state;

  const phaseData = phase === 'ph1' ? site.phase1 : site.phase2;
  const capacity = (phaseData?.capacity_m3 as number) ?? 50000;
  const levelTag = tags[`${site.id}-LT-001`];
  const level = levelTag?.value ?? 0;
  const maxLevel = levelTag?.range[1] ?? 10;

  return (
    <div className="p-3 text-xs">
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: '#1e1b4b', color: '#818cf8' }}>RESERVOIR</span>
        <span className="text-gray-400">{site.chainage_km} km</span>
        {site.elevation_masl && <span className="text-gray-400">{site.elevation_masl} masl</span>}
      </div>

      {/* Level gauge */}
      <div className="mb-3 p-3 rounded" style={{ background: '#0d1b2a' }}>
        <div className="flex items-center gap-1 mb-3">
          <Droplets size={12} className="text-blue-400" />
          <span className="font-semibold text-gray-300">Storage Level</span>
          <span className="ml-auto text-gray-500 text-xs">Capacity: {(capacity / 1000).toFixed(0)}k m³</span>
        </div>
        <LevelGauge level={level} maxLevel={maxLevel} capacity={capacity} />
        <div className="mt-2">
          <MiniTrend tagId={`${site.id}-LT-001`} />
        </div>
      </div>

      {/* Flows */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Flows</span>
        <TagRow tagId={`${site.id}-FT-IN`} label="Inlet Flow" />
        <TagRow tagId={`${site.id}-FT-OUT`} label="Outlet Flow" />
        <TagRow tagId={`${site.id}-PT-IN`} label="Inlet Pressure" />
        <TagRow tagId={`${site.id}-PT-OUT`} label="Outlet Pressure" />
      </div>

      {/* Water quality */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Water Quality</span>
        <TagRow tagId={`${site.id}-CL-RES`} label="Residual Chlorine" />
        <TagRow tagId={`${site.id}-TT-001`} label="Turbidity" />
      </div>

      {/* Valve status */}
      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Valves</span>
        <TagRow tagId={`${site.id}-VLV-OVF`} label="Overflow Valve" decimals={0} />
        <TagRow tagId={`${site.id}-VLV-SCR`} label="Scour Valve" decimals={0} />
      </div>

      {/* Disabled controls */}
      <div className="p-2 rounded" style={{ background: '#0d1b2a', border: '1px solid #1e3a5f' }}>
        <div className="text-gray-500 mb-2">Controls — Demonstration Mode</div>
        <div className="flex gap-2">
          {['Open Inlet', 'Close Inlet', 'Open Outlet'].map(c => (
            <button key={c} disabled title="Control disabled in demonstration mode"
              className="px-2 py-1 rounded text-xs disabled-widget"
              style={{ background: '#1e3a5f', color: '#6b7280', border: '1px solid #2e3250' }}>{c}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
