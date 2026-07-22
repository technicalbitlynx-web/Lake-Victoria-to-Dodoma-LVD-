import React, { useState, useMemo } from 'react';
import { useScada } from '../context/ScadaContext';
import { ALL_SITES } from '../simulator/tagGenerator';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Zap } from 'lucide-react';

const IBPS_SITES = ALL_SITES.filter(s => ['IBPS', 'OFFTAKE_PUMPED', 'INTAKE', 'WTP'].includes(s.class));
const TANESCO_RATES = { off_peak: 0.12, peak: 0.28, std: 0.18 };

export default function EnergyScreen() {
  const { state } = useScada();
  const { tags } = state;
  const [tariffMode, setTariffMode] = useState<'off_peak' | 'peak' | 'std'>('std');

  const stationData = useMemo(() => IBPS_SITES.map(site => {
    let totalKw = 0, runningPumps = 0;
    for (let i = 1; i <= 12; i++) {
      const kwTag = tags[`${site.id}-P${i}-KW`] ?? tags[`${site.id}-IBPS-P${i}-KW`];
      const runTag = tags[`${site.id}-P${i}-RUN`] ?? tags[`${site.id}-IBPS-P${i}-RUN`];
      if (kwTag) totalKw += kwTag.value;
      if (runTag?.value === 1) runningPumps++;
    }
    const flowTag = tags[`${site.id}-FT-001`];
    const flow = flowTag?.value ?? 1;
    const kwhPerM3 = flow > 10 ? (totalKw / flow) : 0;
    const dailyKwh = totalKw * 24;
    const dailyCost = dailyKwh * TANESCO_RATES[tariffMode];

    return {
      name: site.name.replace(' IBPS', '').replace(' Intake & RWPH', ' Intake').replace(' WTP & CWPS', ' WTP').split(' ').slice(0, 2).join(' '),
      fullName: site.name,
      totalKw: Math.round(totalKw),
      kwhPerM3: kwhPerM3,
      dailyCost,
      dailyKwh,
      runningPumps,
      flow,
    };
  }), [tags, tariffMode]);

  const totalKw = stationData.reduce((s, d) => s + d.totalKw, 0);
  const totalDailyCost = stationData.reduce((s, d) => s + d.dailyCost, 0);

  const totalFlow = (tags['MBALIKA_WTP-FT-001']?.value ?? 1) * 520;
  const schemeIntensity = totalFlow > 0 ? (totalKw / totalFlow) : 0;

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-200 flex items-center gap-2">
            <Zap size={18} className="text-yellow-400" /> Energy Dashboard
          </h2>
          <p className="text-xs text-gray-500">Pumping energy — dominant operating cost. kWh/m³ tracks pumping efficiency.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">TANESCO tariff mode:</span>
          {(['off_peak', 'std', 'peak'] as const).map(m => (
            <button key={m} onClick={() => setTariffMode(m)}
              className="px-2 py-1 rounded font-semibold"
              style={{ background: tariffMode === m ? '#ca8a04' : '#1e3a5f', color: tariffMode === m ? '#fef08a' : '#6b7280' }}>
              {m.replace('_', '-')} (${TANESCO_RATES[m]}/kWh)
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KpiCard label="Total Station Power" val={`${(totalKw / 1000).toFixed(1)} MW`} sub="All pumping stations" color="#fde68a" />
        <KpiCard label="Scheme Energy Intensity" val={`${schemeIntensity.toFixed(2)} kWh/m³`} sub="WTP output basis" color="#fde68a" />
        <KpiCard label="Daily Energy Cost (est.)" val={`USD ${totalDailyCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`@ $${TANESCO_RATES[tariffMode]}/kWh`} color="#fb923c" />
        <KpiCard label="Monthly Cost (est.)" val={`USD ${(totalDailyCost * 30).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="30-day projection" color="#fb923c" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Power chart */}
        <div className="p-4 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
          <h3 className="font-semibold text-gray-200 mb-3 text-sm">Station Power (kW)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stationData} layout="vertical" margin={{ left: 60, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" horizontal={false} />
              <XAxis type="number" stroke="#4b5563" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis type="category" dataKey="name" stroke="#4b5563" tick={{ fontSize: 10, fill: '#9ca3af' }} width={60} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #2e3250', color: '#e2e8f0', fontSize: 11 }} />
              <Bar dataKey="totalKw" name="Power (kW)" radius={[0, 3, 3, 0]}>
                {stationData.map((_, i) => (
                  <Cell key={i} fill={`hsl(${40 + i * 15}, 90%, 60%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Energy intensity chart */}
        <div className="p-4 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
          <h3 className="font-semibold text-gray-200 mb-3 text-sm">Energy Intensity (kWh/m³)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stationData.filter(d => d.kwhPerM3 > 0)} layout="vertical" margin={{ left: 60, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" horizontal={false} />
              <XAxis type="number" stroke="#4b5563" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis type="category" dataKey="name" stroke="#4b5563" tick={{ fontSize: 10, fill: '#9ca3af' }} width={60} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #2e3250', color: '#e2e8f0', fontSize: 11 }} formatter={(v) => [typeof v === 'number' ? v.toFixed(3) : v, 'kWh/m³']} />
              <Bar dataKey="kwhPerM3" name="kWh/m³" fill="#f59e0b" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Station table */}
      <div className="mt-4 rounded overflow-hidden" style={{ border: '1px solid #1e3a5f' }}>
        <div className="grid text-xs font-semibold px-3 py-1.5" style={{ background: '#111827', color: '#6b7280', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr' }}>
          <span>Station</span><span>Running Pumps</span><span>Total kW</span><span>kWh/m³</span><span>Daily kWh</span><span>Daily Cost (USD)</span>
        </div>
        {stationData.map((d, i) => (
          <div key={i} className="grid text-xs px-3 py-2" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', background: i % 2 ? '#0d1b2a' : 'transparent', borderTop: '1px solid #1e3a5f' }}>
            <span className="text-gray-200">{d.fullName}</span>
            <span className="font-mono text-green-300">{d.runningPumps}</span>
            <span className="font-mono text-yellow-300">{d.totalKw.toLocaleString()}</span>
            <span className="font-mono text-orange-300">{d.kwhPerM3 > 0 ? d.kwhPerM3.toFixed(3) : '—'}</span>
            <span className="font-mono text-gray-400">{d.dailyKwh.toFixed(0)}</span>
            <span className="font-mono text-gray-400">{d.dailyCost.toFixed(0)}</span>
          </div>
        ))}
        <div className="grid text-xs px-3 py-2 font-bold" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', background: '#111827', borderTop: '2px solid #2e3250' }}>
          <span className="text-gray-200">TOTAL</span>
          <span className="text-green-300 font-mono">{stationData.reduce((s, d) => s + d.runningPumps, 0)}</span>
          <span className="text-yellow-300 font-mono">{totalKw.toLocaleString()}</span>
          <span className="text-orange-300 font-mono">{schemeIntensity.toFixed(3)}</span>
          <span className="text-gray-400 font-mono">{(totalKw * 24).toFixed(0)}</span>
          <span className="text-gray-400 font-mono">{totalDailyCost.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, val, sub, color }: { label: string; val: string; sub: string; color: string }) {
  return (
    <div className="p-3 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="font-bold text-lg font-mono" style={{ color }}>{val}</div>
      <div className="text-xs text-gray-600">{sub}</div>
    </div>
  );
}
