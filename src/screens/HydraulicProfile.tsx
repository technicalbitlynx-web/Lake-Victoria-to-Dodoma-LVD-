import React, { useMemo } from 'react';
import { useScada } from '../context/ScadaContext';
import { ALL_SITES } from '../simulator/tagGenerator';
import type { NodeClass } from '../types';

const CLASS_COLORS: Record<NodeClass, string> = {
  INTAKE: '#60a5fa',
  WTP: '#34d399',
  IBPS: '#f59e0b',
  RESERVOIR: '#818cf8',
  OFFTAKE_GRAVITY: '#f472b6',
  OFFTAKE_DUAL: '#fb923c',
  OFFTAKE_PUMPED: '#e879f9',
};

const MAIN_SITES = ALL_SITES
  .filter(s => !['OFFTAKE_GRAVITY', 'OFFTAKE_DUAL'].includes(s.class))
  .sort((a, b) => a.chainage_km - b.chainage_km);

export default function HydraulicProfile() {
  const { state, dispatch } = useScada();
  const { tags, phase } = state;

  const W = 1100, H = 380, PAD = { l: 60, r: 30, t: 30, b: 60 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const maxChainage = 620;
  const minElev = 800, maxElev = 1900;

  function xPos(ch: number) { return PAD.l + (ch / maxChainage) * innerW; }
  function yPos(elev: number) { return PAD.t + innerH - ((elev - minElev) / (maxElev - minElev)) * innerH; }

  const sitesWithElev = MAIN_SITES.filter(s => s.elevation_masl !== null);

  const profilePts = sitesWithElev
    .map(s => `${xPos(s.chainage_km)},${yPos(s.elevation_masl!)}`)
    .join(' ');

  // Hydraulic grade line: elevation + pressure head
  const gradePts = sitesWithElev.map(s => {
    const ptTag = tags[`${s.id}-PT-DELY`] ?? tags[`${s.id}-PT-OUT`] ?? tags[`${s.id}-PT-UP`];
    const pressureHead = (ptTag?.value ?? 0) * 10.2; // bar to m
    const hgl = s.elevation_masl! + pressureHead;
    return `${xPos(s.chainage_km)},${yPos(Math.min(hgl, maxElev))}`;
  }).join(' ');

  const yTicks = [900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800];
  const xTicks = [0, 100, 200, 300, 400, 500, 600];

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-200">Hydraulic Profile — Long Section</h2>
          <p className="text-xs text-gray-500">Mbalika Intake (0 km) → UDOM Balancing Reservoir (600 km) — elevation Y, chainage X</p>
        </div>
        <div className="text-xs px-2 py-1 rounded" style={{ background: phase === 'ph1' ? '#1e3a5f' : '#3b0764', color: phase === 'ph1' ? '#60a5fa' : '#c084fc' }}>
          {phase === 'ph1' ? 'Phase 1 — 2048' : 'Phase 2 — 2068'}
        </div>
      </div>

      <div className="rounded overflow-hidden" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          {/* Grid */}
          {yTicks.map(y => (
            <g key={y}>
              <line x1={PAD.l} y1={yPos(y)} x2={W - PAD.r} y2={yPos(y)} stroke="#1e3a5f" strokeWidth={0.5} />
              <text x={PAD.l - 5} y={yPos(y)} fill="#4b5563" fontSize={10} textAnchor="end" dominantBaseline="middle">{y}</text>
            </g>
          ))}
          {xTicks.map(x => (
            <g key={x}>
              <line x1={xPos(x)} y1={PAD.t} x2={xPos(x)} y2={H - PAD.b} stroke="#1e3a5f" strokeWidth={0.5} />
              <text x={xPos(x)} y={H - PAD.b + 15} fill="#4b5563" fontSize={10} textAnchor="middle">{x} km</text>
            </g>
          ))}

          {/* Axis labels */}
          <text x={PAD.l - 45} y={H / 2} fill="#6b7280" fontSize={11} textAnchor="middle" transform={`rotate(-90,${PAD.l - 45},${H / 2})`}>Elevation (masl)</text>
          <text x={W / 2} y={H - 5} fill="#6b7280" fontSize={11} textAnchor="middle">Chainage (km)</text>

          {/* Ground profile */}
          {sitesWithElev.length > 1 && (
            <polyline points={profilePts} fill="none" stroke="#374151" strokeWidth={2} />
          )}

          {/* Hydraulic grade line */}
          {sitesWithElev.length > 1 && (
            <polyline points={gradePts} fill="none" stroke="#4f8ef7" strokeWidth={2} strokeDasharray="6,3" opacity={0.8} />
          )}

          {/* Site markers & labels */}
          {MAIN_SITES.map(site => {
            if (!site.elevation_masl) return null;
            const x = xPos(site.chainage_km);
            const y = yPos(site.elevation_masl);
            const color = CLASS_COLORS[site.class as NodeClass];
            const flowTag = tags[`${site.id}-FT-001`] ?? tags[`${site.id}-FT-IN`];
            const pressTag = tags[`${site.id}-PT-DELY`] ?? tags[`${site.id}-PT-OUT`];
            const isSelected = state.selectedSite === site.id;

            return (
              <g key={site.id} style={{ cursor: 'pointer' }}
                onClick={() => dispatch({ type: 'SET_SELECTED_SITE', payload: site.id })}>
                {/* Vertical line from ground */}
                <line x1={x} y1={y} x2={x} y2={H - PAD.b} stroke={color} strokeWidth={0.5} opacity={0.3} />

                {/* Node dot */}
                <circle cx={x} cy={y} r={isSelected ? 7 : 5} fill={color} stroke="#111827" strokeWidth={1.5} />

                {/* Label */}
                <foreignObject x={x - 40} y={y - 40} width={80} height={35}>
                  <div style={{ textAlign: 'center', fontSize: 9, color: '#9ca3af', lineHeight: 1.2 }}>
                    <div style={{ color, fontWeight: 600 }}>{site.name.split(' ')[0]}</div>
                    {site.elevation_masl && <div>{site.elevation_masl}m</div>}
                  </div>
                </foreignObject>

                {/* Live values below */}
                {(flowTag || pressTag) && (
                  <foreignObject x={x - 35} y={H - PAD.b + 20} width={70} height={30}>
                    <div style={{ textAlign: 'center', fontSize: 8, color: '#60a5fa', lineHeight: 1.3 }}>
                      {flowTag && <div>{flowTag.value.toFixed(0)} m³/h</div>}
                      {pressTag && <div>{pressTag.value.toFixed(1)} bar</div>}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Legend */}
          <g transform={`translate(${PAD.l}, ${PAD.t + 5})`}>
            <line x1={0} y1={8} x2={20} y2={8} stroke="#374151" strokeWidth={2} />
            <text x={25} y={12} fill="#6b7280" fontSize={10}>Ground profile</text>
            <line x1={0} y1={22} x2={20} y2={22} stroke="#4f8ef7" strokeWidth={2} strokeDasharray="4,2" />
            <text x={25} y={26} fill="#6b7280" fontSize={10}>Hydraulic grade line</text>
          </g>
        </svg>
      </div>

      {/* Site table */}
      <div className="mt-4 rounded overflow-hidden" style={{ border: '1px solid #1e3a5f' }}>
        <div className="grid text-xs font-semibold py-1.5 px-3" style={{ background: '#111827', color: '#6b7280', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1fr' }}>
          <span>Site</span><span>Class</span><span>Chainage</span><span>Elev (masl)</span><span>Flow (m³/h)</span><span>Pressure (bar)</span><span>Status</span>
        </div>
        {ALL_SITES.map((site, i) => {
          const flowTag = tags[`${site.id}-FT-001`] ?? tags[`${site.id}-FT-IN`] ?? tags[`${site.id}-FT-KONDOA`];
          const pressTag = tags[`${site.id}-PT-DELY`] ?? tags[`${site.id}-PT-OUT`] ?? tags[`${site.id}-PT-UP`];
          const color = CLASS_COLORS[site.class as NodeClass];
          return (
            <div key={site.id}
              className="grid text-xs py-1 px-3 cursor-pointer hover:bg-gray-900"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1fr', background: i % 2 ? '#0d1b2a' : 'transparent', borderTop: '1px solid #1e3a5f' }}
              onClick={() => dispatch({ type: 'SET_SELECTED_SITE', payload: site.id })}>
              <span className="text-gray-200">{site.name}</span>
              <span style={{ color }} className="text-xs">{site.class.replace(/_/g, ' ')}</span>
              <span className="text-gray-400 font-mono">{site.chainage_km} km</span>
              <span className="text-gray-400 font-mono">{site.elevation_masl ?? '—'}</span>
              <span className="text-blue-300 font-mono">{flowTag ? flowTag.value.toFixed(0) : '—'}</span>
              <span className="text-green-300 font-mono">{pressTag ? pressTag.value.toFixed(1) : '—'}</span>
              <span>
                {site.indicative_position
                  ? <span className="text-yellow-400">⚠ Indicative</span>
                  : <span className="text-green-400">✓ Confirmed</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
