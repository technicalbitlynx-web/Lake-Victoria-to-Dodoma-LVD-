import React from 'react';
import type { Site } from '../../types';
import { TagRow, MiniTrend } from '../TagValue';
import { useScada } from '../../context/ScadaContext';

interface Props { site: Site; }

export default function IntakeFaceplate({ site }: Props) {
  const { state } = useScada();
  const { tags, phase } = state;
  const phaseData = phase === 'ph1' ? site.phase1 : site.phase2;
  const totalPumps = Math.min(((phaseData?.pumps_working as number) ?? 2) + ((phaseData?.pumps_standby as number) ?? 1), 12);

  return (
    <div className="p-3 text-xs">
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: '#1e3a5f', color: '#60a5fa' }}>INTAKE</span>
        <span className="text-gray-400">Lake Victoria Source</span>
      </div>

      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Screen & Levels</span>
        <TagRow tagId={`${site.id}-SCR-DP-001`} label="Screen ΔP" />
        <TagRow tagId={`${site.id}-LT-001`} label="Channel Level" />
        <TagRow tagId={`${site.id}-LT-002`} label="Sump Level" />
        <div className="mt-2"><MiniTrend tagId={`${site.id}-LT-001`} /></div>
      </div>

      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Raw Water Quality</span>
        <TagRow tagId={`${site.id}-TT-001`} label="Turbidity" />
        <TagRow tagId={`${site.id}-pHT-001`} label="pH" />
        <TagRow tagId={`${site.id}-CT-001`} label="Conductivity" />
        <TagRow tagId={`${site.id}-TEMP-001`} label="Temperature" />
      </div>

      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Pump Set ({totalPumps} total)</span>
        <div className="flex flex-wrap gap-1 mb-2">
          {Array.from({ length: totalPumps }, (_, i) => {
            const run = tags[`${site.id}-P${i + 1}-RUN`]?.value === 1;
            const flt = tags[`${site.id}-P${i + 1}-FLT`]?.value === 1;
            return (
              <div key={i} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                style={{ background: flt ? '#450a0a' : run ? '#14532d' : '#1e3a5f', color: flt ? '#ef4444' : run ? '#22c55e' : '#6b7280' }}>
                P{i + 1} {flt ? 'FLT' : run ? 'RUN' : 'STP'}
              </div>
            );
          })}
        </div>
        <TagRow tagId={`${site.id}-P1-CURR`} label="P1 Current" />
        <TagRow tagId={`${site.id}-P1-KWH`} label="P1 Energy" decimals={0} />
      </div>

      <div className="p-2 rounded" style={{ background: '#0d1b2a', border: '1px solid #1e3a5f' }}>
        <div className="text-gray-500 mb-2">Controls — Demonstration Mode</div>
        <div className="flex gap-2">
          {['Start Pump', 'Stop Pump', 'Screen Wash'].map(c => (
            <button key={c} disabled title="Control disabled in demonstration mode"
              className="px-2 py-1 rounded text-xs disabled-widget"
              style={{ background: '#1e3a5f', color: '#6b7280', border: '1px solid #2e3250' }}>{c}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
