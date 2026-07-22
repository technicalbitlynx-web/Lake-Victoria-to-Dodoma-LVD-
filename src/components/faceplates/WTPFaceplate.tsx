import React from 'react';
import type { Site } from '../../types';
import { TagRow, MiniTrend } from '../TagValue';

interface Props { site: Site; }

export default function WTPFaceplate({ site }: Props) {
  return (
    <div className="p-3 text-xs">
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: '#064e3b', color: '#34d399' }}>WTP</span>
        <span className="text-gray-400">Mbalika Water Treatment Plant</span>
      </div>

      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Inlet & Dosing</span>
        <TagRow tagId={`${site.id}-FT-001`} label="Raw Water Inlet Flow" />
        <TagRow tagId={`${site.id}-DT-001`} label="Coagulant Dose Rate" />
        <TagRow tagId={`${site.id}-TT-001`} label="Settled Water Turbidity" />
        <TagRow tagId={`${site.id}-LT-SLUDGE`} label="Sludge Blanket Level" />
      </div>

      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Filtration (4 filters)</span>
        {[1, 2, 3, 4].map(n => (
          <div key={n} className="mb-1">
            <div className="text-gray-500 mb-0.5">Filter {n}</div>
            <div className="flex gap-4 ml-2">
              <TagRow tagId={`${site.id}-FILTER${n}-DP`} label="ΔP" />
              <TagRow tagId={`${site.id}-FILTER${n}-TT`} label="Turbidity" />
            </div>
          </div>
        ))}
        <TagRow tagId={`${site.id}-BW-STATE`} label="Backwash State" decimals={0} />
      </div>

      <div className="mb-3 p-2 rounded" style={{ background: '#0d1b2a' }}>
        <span className="font-semibold text-gray-300 block mb-2">Treated Water Quality</span>
        <TagRow tagId={`${site.id}-CL-DOSE`} label="Chlorine Dose Rate" />
        <TagRow tagId={`${site.id}-CL-RES`} label="Residual Chlorine" />
        <TagRow tagId={`${site.id}-pHT-OUT`} label="pH" />
        <TagRow tagId={`${site.id}-TT-OUT`} label="Turbidity" />
        <div className="mt-2"><MiniTrend tagId={`${site.id}-CL-RES`} /></div>
      </div>

      <div className="p-2 rounded" style={{ background: '#0d1b2a', border: '1px solid #1e3a5f' }}>
        <div className="text-gray-500 mb-2">Controls — Demonstration Mode</div>
        <div className="flex gap-2 flex-wrap">
          {['Start BW Filter 1', 'Adj Coag Dose', 'Adj Cl Dose'].map(c => (
            <button key={c} disabled title="Control disabled in demonstration mode"
              className="px-2 py-1 rounded text-xs disabled-widget"
              style={{ background: '#1e3a5f', color: '#6b7280', border: '1px solid #2e3250' }}>{c}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
