import React, { useMemo } from 'react';
import { useScada } from '../context/ScadaContext';
import { ALL_SITES } from '../simulator/tagGenerator';
import { PLANT_CAPACITY, cascadeFrom, toMLD } from '../data/plantCapacity';

const OFFTAKE_SITES = ALL_SITES.filter(s =>
  ['OFFTAKE_GRAVITY', 'OFFTAKE_DUAL', 'OFFTAKE_PUMPED'].includes(s.class)
);

function SankeyBar({ label, value, maxVal, color, sub, indent = 0 }: { label: string; value: number; maxVal: number; color: string; sub?: string; indent?: number }) {
  const pct = Math.min(1, value / maxVal);
  return (
    <div className="mb-2" style={{ paddingLeft: indent }}>
      <div className="flex items-center justify-between mb-1 text-xs">
        <span className="text-gray-300">{label}{sub && <span className="text-gray-600"> · {sub}</span>}</span>
        <span className="font-mono" style={{ color }}>{toMLD(value).toFixed(0)} MLD <span className="text-gray-600">({value.toFixed(0)} m³/h)</span></span>
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

  // live raw-water inflow anchors the whole cascade
  const rawM3h = tags['MBALIKA_WTP-FT-001']?.value ?? PLANT_CAPACITY.raw.m3h;
  const c = cascadeFrom(rawM3h);

  // distribution: the delivered flow splits among offtakes + terminal + NRW
  const offtakes = useMemo(() => {
    const raw = OFFTAKE_SITES.map(site => {
      const flowTag = tags[`${site.id}-FT-001`] ?? tags[`${site.id}-FT-KONDOA`];
      return { site, raw: (flowTag?.value ?? 0) * (site.class === 'OFFTAKE_PUMPED' ? 3 : 1) + 1 };
    });
    const sumRaw = raw.reduce((s, o) => s + o.raw, 0) || 1;
    // offtakes take ~42% of delivered flow, proportional to their sim demand
    const offtakePool = c.delivery * 0.42;
    return raw.map(o => ({ site: o.site, flow: (o.raw / sumRaw) * offtakePool }));
  }, [tags, c.delivery]);

  const totalOfftake = offtakes.reduce((s, o) => s + o.flow, 0);
  const nrw = c.delivery * 0.035;                                  // ~3.5% distribution NRW
  const udomInflow = Math.max(0, c.delivery - totalOfftake - nrw);
  const nrwPct = c.delivery > 0 ? (nrw / c.delivery) * 100 : 0;

  const maxVal = c.raw;

  const TANESCO_RATE = 0.22;
  const totalKwhPerM3 = 0.42;
  const dailyM3 = c.treated * 24;
  const dailyEnergyCost = dailyM3 * totalKwhPerM3 * TANESCO_RATE;

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-200">Water Balance — Non-Revenue Water Tracker</h2>
          <p className="text-xs text-gray-500">Mbalika plant capacity cascade → transmission → offtakes → UDOM. Volumes used for bulk billing (DUWASA, SUWASA, KASHWASA)</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <Kpi label="Raw Abstraction" mld={toMLD(c.raw)} m3h={c.raw} color="#60a5fa" icon="↑" />
        <Kpi label="WTP Treated Out" mld={toMLD(c.treated)} m3h={c.treated} color="#34d399" icon="⚙" />
        <Kpi label="Delivered" mld={toMLD(c.delivery)} m3h={c.delivery} color="#818cf8" icon="→" />
        <Kpi label="Process Loss" mld={toMLD(c.processLoss)} m3h={c.processLoss} color="#f59e0b" icon="⚠" pct={PLANT_CAPACITY.processLossPct} />
        <Kpi label="Conveyance Loss" mld={toMLD(c.conveyanceLoss)} m3h={c.conveyanceLoss} color="#f59e0b" icon="⚠" pct={PLANT_CAPACITY.conveyanceLossPct} />
        <div className="p-3 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
          <div className="text-xs text-gray-500 mb-1">⊖ Distribution NRW</div>
          <div className="font-mono font-bold text-xl" style={{ color: nrwPct > 5 ? '#ef4444' : '#22c55e' }}>{nrwPct.toFixed(1)} <span className="text-xs font-normal text-gray-500">%</span></div>
        </div>
      </div>

      {/* Plant capacity cascade banner */}
      <div className="mb-4 p-3 rounded-lg" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
        <div className="text-xs font-semibold text-gray-300 mb-2">Plant Capacity Cascade — intake = usable + {PLANT_CAPACITY.intakeMarginPct}% ({PLANT_CAPACITY.processLossPct}% treatment + {PLANT_CAPACITY.conveyanceLossPct}% conveyance)</div>
        <div className="flex items-center gap-2 flex-wrap">
          <CascadeNode label="Raw abstraction" mld={640} m3h={26700} color="#60a5fa" />
          <Loss pct={PLANT_CAPACITY.processLossPct} label="treatment" />
          <CascadeNode label="Treated output" mld={608} m3h={25333} color="#34d399" />
          <Loss pct={PLANT_CAPACITY.conveyanceLossPct} label="conveyance" />
          <CascadeNode label="Delivered (usable)" mld={598} m3h={24917} color="#818cf8" />
        </div>
        <div className="mt-2 text-gray-600" style={{ fontSize: 10 }}>
          Plant arranged as {PLANT_CAPACITY.streams.duty} duty process streams × {PLANT_CAPACITY.streams.perStreamMld} MLD ·
          {' '}IPS {PLANT_CAPACITY.ips.total} ({PLANT_CAPACITY.ips.redundancy}) · {PLANT_CAPACITY.flocculation.totalUnits} flocculators ({PLANT_CAPACITY.flocculation.trains}×{PLANT_CAPACITY.flocculation.stagesPerTrain}) ·
          {' '}raw pumps {PLANT_CAPACITY.rawPumps.total} ({PLANT_CAPACITY.rawPumps.duty}d/{PLANT_CAPACITY.rawPumps.standby}s) · high-lift {PLANT_CAPACITY.highLiftPumps.total} ({PLANT_CAPACITY.highLiftPumps.duty}d/{PLANT_CAPACITY.highLiftPumps.standby}s)
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Sankey waterfall */}
        <div className="p-4 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
          <h3 className="font-semibold text-gray-200 mb-4 text-sm">Flow Waterfall (live)</h3>
          <SankeyBar label="Lake Victoria Abstraction" value={c.raw} maxVal={maxVal} color="#60a5fa" />
          <SankeyBar label="WTP Treated Output" value={c.treated} maxVal={maxVal} color="#34d399" sub={`−${PLANT_CAPACITY.processLossPct}% process`} indent={16} />
          <SankeyBar label="Delivered to Transmission" value={c.delivery} maxVal={maxVal} color="#818cf8" sub={`−${PLANT_CAPACITY.conveyanceLossPct}% conveyance`} indent={16} />
          <div className="ml-8 mt-2">
            {offtakes.map(({ site, flow }) => (
              <SankeyBar key={site.id} label={site.name} value={flow} maxVal={c.delivery} color="#f472b6" indent={8} />
            ))}
          </div>
          <SankeyBar label="UDOM BR Inflow" value={udomInflow} maxVal={maxVal} color="#a78bfa" indent={16} />
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid #1e3a5f' }}>
            <SankeyBar label="Distribution Losses (NRW)" value={nrw} maxVal={maxVal} color="#ef4444" indent={16} />
          </div>
          <div className="mt-3 p-2 rounded flex items-center justify-between" style={{ background: nrwPct > 5 ? '#450a0a' : '#14532d' }}>
            <span className="text-xs font-semibold" style={{ color: nrwPct > 5 ? '#fca5a5' : '#86efac' }}>
              {nrwPct > 5 ? '⚠ NRW ABOVE TARGET' : '✓ NRW WITHIN TARGET'}
            </span>
            <span className="font-mono font-bold text-lg" style={{ color: nrwPct > 5 ? '#ef4444' : '#22c55e' }}>{nrwPct.toFixed(1)}%</span>
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

          <div className="mt-4 p-3 rounded" style={{ background: '#0d1b2a', border: '1px solid #1e3a5f' }}>
            <div className="text-xs font-semibold text-gray-300 mb-2">Daily Energy Cost Estimate</div>
            <div className="text-xs text-gray-500 mb-1">TANESCO tariff: ${TANESCO_RATE}/kWh (configurable) · {totalKwhPerM3} kWh/m³</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Daily Volume:</span>
                <div className="font-mono text-blue-300">{(dailyM3 / 1000).toFixed(0)} k m³ · {toMLD(c.treated).toFixed(0)} MLD</div>
              </div>
              <div>
                <span className="text-gray-500">Daily Cost:</span>
                <div className="font-mono text-yellow-300">USD {dailyEnergyCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, mld, m3h, color, icon, pct }: { label: string; mld: number; m3h: number; color: string; icon: string; pct?: number }) {
  return (
    <div className="p-3 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
      <div className="text-xs text-gray-500 mb-1">{icon} {label}{pct != null && <span className="text-gray-600"> ({pct}%)</span>}</div>
      <div className="font-mono font-bold text-xl" style={{ color }}>{mld.toFixed(0)} <span className="text-xs font-normal text-gray-500">MLD</span></div>
      <div className="font-mono text-gray-600" style={{ fontSize: 10 }}>{m3h.toFixed(0)} m³/h</div>
    </div>
  );
}

function CascadeNode({ label, mld, m3h, color }: { label: string; mld: number; m3h: number; color: string }) {
  return (
    <div className="rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}55` }}>
      <div className="text-gray-500" style={{ fontSize: 9 }}>{label}</div>
      <div className="font-mono font-bold" style={{ color, fontSize: 15 }}>{mld} MLD</div>
      <div className="font-mono text-gray-600" style={{ fontSize: 9 }}>{m3h.toLocaleString()} m³/h</div>
    </div>
  );
}

function Loss({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="flex flex-col items-center flex-shrink-0" style={{ color: '#f59e0b' }}>
      <span style={{ fontSize: 14 }}>→</span>
      <span className="font-mono font-bold" style={{ fontSize: 11 }}>−{pct}%</span>
      <span className="text-gray-600" style={{ fontSize: 8 }}>{label}</span>
    </div>
  );
}
