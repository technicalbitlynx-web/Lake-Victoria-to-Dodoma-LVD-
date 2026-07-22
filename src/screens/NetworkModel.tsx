import React from 'react';
import { Network, Droplets, Gauge, Database, Waves, CircleDot, GitBranch } from 'lucide-react';
import { useScada } from '../context/ScadaContext';
import NETWORK_STATS from '../data/network/stats.json';
import PIPE_META from '../data/network/pipe-classes-meta.json';
import NETWORK_ASSETS from '../data/network/assets.json';
import KEY_JUNCTIONS from '../data/network/junctions-key.json';
import { pumpSim, valveSim, tankSim, reservoirSim, junctionSim } from '../simulator/networkSim';
import type { EpanetPump, EpanetValve, EpanetTank, EpanetReservoir, EpanetJunction } from '../simulator/networkSim';

const EPA = NETWORK_ASSETS as unknown as {
  pumps: EpanetPump[]; valves: EpanetValve[]; tanks: EpanetTank[]; reservoirs: EpanetReservoir[];
};
const JUNCTIONS = KEY_JUNCTIONS as unknown as EpanetJunction[];
const PIPES_META = PIPE_META as unknown as { id: string; label: string; color: string; count: number; km: number }[];

export default function NetworkModel() {
  // Subscribing to tag state re-renders this screen on every 5 s tick,
  // which refreshes the deterministic network simulation values below.
  useScada();

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      <div className="flex items-center gap-3 mb-4">
        <Network size={20} className="text-blue-400" />
        <div>
          <h2 className="text-lg font-bold text-gray-200">Hydraulic Network Model — MBALIKA 2068</h2>
          <p className="text-xs text-gray-500">{NETWORK_STATS.source} · live values simulated at 5 s cadence</p>
        </div>
        <div className="ml-auto px-3 py-1 rounded text-xs font-bold" style={{ background: '#1e3a5f', color: '#60a5fa' }}>
          {NETWORK_STATS.pipeKm.toLocaleString()} km MODELLED
        </div>
      </div>

      {/* Inventory KPIs */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        <Kpi label="Junctions" val={NETWORK_STATS.junctions.toLocaleString()} color="#93c5fd" />
        <Kpi label="Pipes" val={NETWORK_STATS.pipes.toLocaleString()} color="#93c5fd" />
        <Kpi label="Pipe length" val={`${NETWORK_STATS.pipeKm.toLocaleString()} km`} color="#60a5fa" />
        <Kpi label="Pumps" val={String(NETWORK_STATS.pumps)} color="#a3e635" />
        <Kpi label="Control valves" val={String(NETWORK_STATS.valves)} color="#34d399" />
        <Kpi label="Tanks" val={String(NETWORK_STATS.tanks)} color="#818cf8" />
        <Kpi label="Sources" val={String(NETWORK_STATS.reservoirs)} color="#60a5fa" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Pipe classes */}
        <Panel title="Pipe Classes" icon={<GitBranch size={14} className="text-blue-400" />}>
          {PIPES_META.map(c => (
            <div key={c.id} className="flex items-center gap-2 py-1.5 border-b last:border-0 text-xs" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="w-5 h-1 flex-shrink-0 rounded" style={{ background: c.color }} />
              <span className="text-gray-300 flex-1">{c.label}</span>
              <span className="font-mono text-gray-400">{c.count.toLocaleString()} pipes</span>
              <span className="font-mono text-blue-300 w-20 text-right">{c.km.toLocaleString()} km</span>
            </div>
          ))}
          <div className="mt-2 text-gray-600" style={{ fontSize: 10 }}>
            Elevation range {NETWORK_STATS.elevRange[0]}–{NETWORK_STATS.elevRange[1]} masl ·
            Hazen-Williams roughness C=120 · total base demand {NETWORK_STATS.totalBaseDemand_lps.toLocaleString()} L/s
          </div>
        </Panel>

        {/* Source reservoirs */}
        <Panel title={`Source Reservoirs (${EPA.reservoirs.length})`} icon={<Waves size={14} className="text-blue-400" />}>
          <HeadRow cols={['NODE', 'FIXED HEAD', 'OUTFLOW (SIM)']} widths="1fr 1fr 1fr" />
          {EPA.reservoirs.map(r => {
            const sim = reservoirSim(r);
            return (
              <div key={r.id} className="grid gap-2 py-1 text-xs font-mono border-b last:border-0" style={{ gridTemplateColumns: '1fr 1fr 1fr', borderColor: 'rgba(255,255,255,0.04)' }}>
                <span className="text-gray-300">{r.id}</span>
                <span className="text-blue-300">{r.head.toFixed(0)} masl</span>
                <span className="text-cyan-300">{sim.outflow.toFixed(0)} m³/h</span>
              </div>
            );
          })}
        </Panel>

        {/* Demand junctions */}
        <Panel title={`Demand Nodes (${JUNCTIONS.length} of ${NETWORK_STATS.junctions.toLocaleString()} junctions)`} icon={<CircleDot size={14} className="text-pink-400" />}>
          <HeadRow cols={['NODE', 'ELEV', 'BASE', 'NOW (SIM)', 'P (SIM)']} widths="1fr 0.9fr 0.9fr 1fr 0.9fr" />
          {JUNCTIONS.map(j => {
            const sim = junctionSim(j);
            return (
              <div key={j.id} className="grid gap-2 py-1 text-xs font-mono border-b last:border-0" style={{ gridTemplateColumns: '1fr 0.9fr 0.9fr 1fr 0.9fr', borderColor: 'rgba(255,255,255,0.04)' }}>
                <span className="text-gray-300">{j.id}</span>
                <span className="text-gray-500">{j.elev.toFixed(0)} m</span>
                <span className="text-gray-400">{j.demand.toFixed(0)} L/s</span>
                <span className="text-pink-300">{sim.demandNow.toFixed(0)} L/s</span>
                <span style={{ color: sim.pressure < 15 ? '#f59e0b' : '#4ade80' }}>{sim.pressure.toFixed(0)} m</span>
              </div>
            );
          })}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Pumps */}
        <Panel title={`Model Pumps (${EPA.pumps.length})`} icon={<Droplets size={14} className="text-lime-400" />}>
          <HeadRow cols={['LINK', 'SUCTION → DELIVERY', 'CURVE', 'STATUS', 'FLOW', 'HEAD', 'POWER']} widths="0.8fr 1.6fr 1fr 0.9fr 0.9fr 0.7fr 0.8fr" />
          <div className="max-h-72 overflow-y-auto">
            {EPA.pumps.map(p => {
              const sim = pumpSim(p);
              return (
                <div key={p.id} className="grid gap-2 py-1 text-xs font-mono border-b last:border-0 items-center" style={{ gridTemplateColumns: '0.8fr 1.6fr 1fr 0.9fr 0.9fr 0.7fr 0.8fr', borderColor: 'rgba(255,255,255,0.04)' }}>
                  <span className="text-gray-300">{p.id}</span>
                  <span className="text-gray-500 truncate">{p.n1} → {p.n2}</span>
                  <span className="text-gray-500 truncate" style={{ fontSize: 10 }}>{p.params.replace('HEAD ', 'H-')}</span>
                  <span style={{ color: sim.running ? '#4ade80' : '#6b7280', fontWeight: 700 }}>{sim.running ? 'RUN' : 'STOP'}</span>
                  <span className="text-blue-300">{sim.flow.toFixed(0)} m³/h</span>
                  <span className="text-purple-300">{sim.head.toFixed(0)} m</span>
                  <span className="text-yellow-300">{sim.kw.toLocaleString()} kW</span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Tanks */}
        <Panel title={`Balancing Tanks (${EPA.tanks.length})`} icon={<Database size={14} className="text-indigo-400" />}>
          <HeadRow cols={['NODE', 'FLOOR', 'Ø', 'CAPACITY', 'LEVEL (SIM)', 'STORED', 'STATE']} widths="0.9fr 0.8fr 0.6fr 1fr 1.3fr 1fr 0.9fr" />
          <div className="max-h-72 overflow-y-auto">
            {EPA.tanks.map(t => {
              const sim = tankSim(t);
              return (
                <div key={t.id} className="grid gap-2 py-1 text-xs font-mono border-b last:border-0 items-center" style={{ gridTemplateColumns: '0.9fr 0.8fr 0.6fr 1fr 1.3fr 1fr 0.9fr', borderColor: 'rgba(255,255,255,0.04)' }}>
                  <span className="text-gray-300">{t.id}</span>
                  <span className="text-gray-500">{t.elev.toFixed(0)} m</span>
                  <span className="text-gray-500">{t.diam.toFixed(0)} m</span>
                  <span className="text-gray-400">{Math.round(t.vol).toLocaleString()} m³</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-indigo-300">{sim.level.toFixed(2)} m</span>
                    <span className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)', minWidth: 28 }}>
                      <span className="block h-full" style={{ width: `${sim.pct}%`, background: '#818cf8' }} />
                    </span>
                  </span>
                  <span className="text-gray-300">{sim.volNow.toLocaleString()} m³</span>
                  <span style={{ color: sim.filling ? '#4ade80' : '#f59e0b', fontWeight: 700 }}>{sim.filling ? 'FILL' : 'DRAW'}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Control valves */}
      <Panel title={`Model Control Valves (${EPA.valves.length}) — ${(NETWORK_STATS.valveTypes as Record<string, number>).FCV ?? 0}× FCV · ${(NETWORK_STATS.valveTypes as Record<string, number>).PRV ?? 0}× PRV`}
        icon={<Gauge size={14} className="text-emerald-400" />}>
        <HeadRow cols={['LINK', 'TYPE', 'DN', 'SETTING', 'MODE', 'FLOW (SIM)', 'UP', 'DOWN', 'POSITION']} widths="0.9fr 0.6fr 0.6fr 1fr 1.2fr 1fr 0.7fr 0.7fr 1.2fr" />
        <div className="max-h-80 overflow-y-auto">
          {EPA.valves.map(v => {
            const sim = valveSim(v);
            const col = v.type === 'PRV' ? '#eab308' : '#34d399';
            return (
              <div key={v.id} className="grid gap-2 py-1 text-xs font-mono border-b last:border-0 items-center" style={{ gridTemplateColumns: '0.9fr 0.6fr 0.6fr 1fr 1.2fr 1fr 0.7fr 0.7fr 1.2fr', borderColor: 'rgba(255,255,255,0.04)' }}>
                <span className="text-gray-300">{v.id}</span>
                <span style={{ color: col, fontWeight: 700 }}>{v.type}</span>
                <span className="text-gray-500">{v.dn}</span>
                <span className="text-yellow-200">{v.setting} {v.type === 'PRV' ? 'm' : 'm³/h'}</span>
                <span className="text-gray-400" style={{ fontSize: 10 }}>{sim.status}</span>
                <span className="text-blue-300">{sim.flow.toFixed(0)} m³/h</span>
                <span className="text-gray-400">{sim.upstream.toFixed(1)}</span>
                <span className="text-gray-400">{sim.downstream.toFixed(1)}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-gray-300 w-8">{sim.position.toFixed(0)}%</span>
                  <span className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)', minWidth: 24 }}>
                    <span className="block h-full" style={{ width: `${sim.position}%`, background: col }} />
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="mt-4 mb-2 text-xs text-gray-700 text-center">
        Geometry & attributes imported from MBALIKA2068_EPANET_shapefiles (WGS84 / UTM 36S) ·
        hydraulic values are demonstrator simulations, not an EPANET solve
      </div>
    </div>
  );
}

function Kpi({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(17,24,39,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-gray-600" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="font-mono font-bold text-lg" style={{ color }}>{val}</div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-2 font-semibold text-gray-200 text-sm">{icon}{title}</div>
      {children}
    </div>
  );
}

function HeadRow({ cols, widths }: { cols: string[]; widths: string }) {
  return (
    <div className="grid gap-2 pb-1 text-gray-600 font-semibold" style={{ gridTemplateColumns: widths, fontSize: 9, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {cols.map(c => <span key={c}>{c}</span>)}
    </div>
  );
}
