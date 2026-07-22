import React, { useMemo } from 'react';
import { useScada } from '../context/ScadaContext';
import { ALL_SITES } from '../simulator/tagGenerator';

const OFFTAKE_SITES = ALL_SITES.filter(s =>
  ['OFFTAKE_GRAVITY', 'OFFTAKE_DUAL', 'OFFTAKE_PUMPED'].includes(s.class)
);

function SankeyBar({ label, value, maxVal, color, indent = 0 }: { label: string; value: number; maxVal: number; color: string; indent?: number }) {
  const pct = Math.min(1, value / maxVal);
  return (
    <div className="mb-2" style={{ paddingLeft: indent }}>
      <div className="flex items-center justify-between mb-1 text-xs">
        <span className="text-gray-300">{label}</span>
        <span className="font-mono" style={{ color }}>{value.toFixed(0)} m³/h</span>
      </div>
      <div className="h-5 rounded overflow-hidden" style={{ background: '#1e3a5f' }}>
        <div className="h-full rounded transition-all" style={{ width: `${pct * 100}%`, background: color, opacity: 0.85 }} />
      </div>
    </div>
  );
}

export default function WaterBalance() {
  const { state } = useScada();
  const { tags } = state;

  const intakeFlow = (tags['MBALIKA_INTAKE-LT-001']?.value ?? 0) * 580;
  const wtpOutput = (tags['MBALIKA_WTP-FT-001']?.value ?? 0) * 520;
  const udomInflow = (tags['UDOM_BR-FT-IN']?.value ?? 0) * 400;

  const offtakes = useMemo(() => OFFTAKE_SITES.map(site => {
    const flowTag = tags[`${site.id}-FT-001`] ?? tags[`${site.id}-FT-KONDOA`];
    const flow = (flowTag?.value ?? 0) * (site.class === 'OFFTAKE_PUMPED' ? 0.4 : 0.08);
    return { site, flow };
  }), [tags]);

  const totalOfftake = offtakes.reduce((s, o) => s + o.flow, 0);
  const systemLoss = Math.max(0, wtpOutput - totalOfftake - udomInflow);
  const nrwPct = wtpOutput > 0 ? (systemLoss / wtpOutput * 100) : 0;
  const balancePct = wtpOutput > 0 ? ((totalOfftake + udomInflow) / wtpOutput * 100) : 0;

  const maxVal = Math.max(intakeFlow, wtpOutput, 100);

  const TANESCO_RATE = 0.22; // USD per kWh
  const totalKwhPerM3 = 0.42;
  const dailyM3 = wtpOutput * 24;
  const dailyEnergyCost = dailyM3 * totalKwhPerM3 * TANESCO_RATE;

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-200">Water Balance — Non-Revenue Water Tracker</h2>
          <p className="text-xs text-gray-500">Intake → Treatment → Distribution → UDOM Delivery. Volumes used for bulk billing (DUWASA, SUWASA, KASHWASA)</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Abstraction', val: intakeFlow, unit: 'm³/h', color: '#60a5fa', icon: '↑' },
          { label: 'WTP Output', val: wtpOutput, unit: 'm³/h', color: '#34d399', icon: '⚙' },
          { label: 'Total Offtake', val: totalOfftake, unit: 'm³/h', color: '#f472b6', icon: '⇒' },
          { label: 'UDOM Delivery', val: udomInflow, unit: 'm³/h', color: '#818cf8', icon: '✓' },
          { label: 'System Balance', val: balancePct, unit: '%', color: nrwPct > 15 ? '#ef4444' : '#22c55e', icon: '⊖' },
        ].map(kpi => (
          <div key={kpi.label} className="p-3 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
            <div className="text-xs text-gray-500 mb-1">{kpi.icon} {kpi.label}</div>
            <div className="font-mono font-bold text-xl" style={{ color: kpi.color }}>
              {kpi.val.toFixed(0)} <span className="text-xs font-normal text-gray-500">{kpi.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Sankey waterfall */}
        <div className="p-4 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
          <h3 className="font-semibold text-gray-200 mb-4 text-sm">Flow Waterfall (live m³/h)</h3>

          <SankeyBar label="Lake Victoria Abstraction" value={intakeFlow} maxVal={maxVal} color="#60a5fa" />
          <SankeyBar label="WTP Treated Output" value={wtpOutput} maxVal={maxVal} color="#34d399" indent={16} />
          <div className="ml-8">
            {offtakes.map(({ site, flow }) => (
              <SankeyBar key={site.id} label={site.name} value={flow} maxVal={totalOfftake} color="#f472b6" indent={8} />
            ))}
          </div>
          <SankeyBar label="UDOM BR Inflow" value={udomInflow} maxVal={maxVal} color="#818cf8" indent={16} />
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid #1e3a5f' }}>
            <SankeyBar label="System Losses (NRW)" value={systemLoss} maxVal={maxVal} color="#ef4444" indent={16} />
          </div>

          {/* NRW indicator */}
          <div className="mt-3 p-2 rounded flex items-center justify-between" style={{ background: nrwPct > 15 ? '#450a0a' : '#14532d' }}>
            <span className="text-xs font-semibold" style={{ color: nrwPct > 15 ? '#fca5a5' : '#86efac' }}>
              {nrwPct > 15 ? '⚠ NRW ABOVE TARGET' : '✓ NRW WITHIN TARGET'}
            </span>
            <span className="font-mono font-bold text-lg" style={{ color: nrwPct > 15 ? '#ef4444' : '#22c55e' }}>
              {nrwPct.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Per-offtake table */}
        <div className="p-4 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
          <h3 className="font-semibold text-gray-200 mb-3 text-sm">Per-Offtake Volumes (billing)</h3>
          <div className="text-xs" style={{ color: '#6b7280' }}>
            <div className="grid mb-2 font-semibold pb-1" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid #1e3a5f' }}>
              <span>Offtake</span><span>Flow (m³/h)</span><span>Daily (m³)</span><span>Monthly (m³)</span>
            </div>
            {offtakes.map(({ site, flow }) => (
              <div key={site.id} className="grid py-1.5" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid #0d1b2a' }}>
                <span className="text-gray-300">{site.name.replace(' Primary Reservoir Offtake', '').replace(' Offtake', '')}</span>
                <span className="font-mono text-pink-300">{flow.toFixed(0)}</span>
                <span className="font-mono text-gray-400">{(flow * 24).toFixed(0)}</span>
                <span className="font-mono text-gray-400">{(flow * 24 * 30).toFixed(0)}</span>
              </div>
            ))}
            <div className="grid py-1.5 font-semibold mt-1" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr', borderTop: '2px solid #2e3250', color: '#e2e8f0' }}>
              <span>TOTAL</span>
              <span className="font-mono text-pink-300">{totalOfftake.toFixed(0)}</span>
              <span className="font-mono">{(totalOfftake * 24).toFixed(0)}</span>
              <span className="font-mono">{(totalOfftake * 24 * 30).toFixed(0)}</span>
            </div>
          </div>

          {/* Cost summary */}
          <div className="mt-4 p-3 rounded" style={{ background: '#0d1b2a', border: '1px solid #1e3a5f' }}>
            <div className="text-xs font-semibold text-gray-300 mb-2">Daily Energy Cost Estimate</div>
            <div className="text-xs text-gray-500 mb-1">TANESCO tariff: ${TANESCO_RATE}/kWh (configurable)</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Daily Volume:</span>
                <div className="font-mono text-blue-300">{(dailyM3 / 1000).toFixed(1)} k m³</div>
              </div>
              <div>
                <span className="text-gray-500">Daily Cost:</span>
                <div className="font-mono text-yellow-300">USD {dailyEnergyCost.toFixed(0)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
