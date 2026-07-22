import React, { useMemo, useState, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useScada, useValves, useControl } from '../context/ScadaContext';
import { ALL_SITES } from '../simulator/tagGenerator';
import type { AlarmState, NodeClass, Site, Tag, ValveRuntime } from '../types';
import SiteFaceplate from '../components/faceplates/SiteFaceplate';
import PumpStationModal from '../components/pumps/PumpStationModal';
import { PUMP_ENABLED_SITES } from '../data/pumpStationSpecs';
import { MAP_FITTINGS, VALVE_TYPE_COLORS, VALVE_TYPE_LABELS } from '../data/valveSpecs';
import type { ValveSpec, ValveType } from '../data/valveSpecs';
import { FLOWMETERS } from '../data/flowmeterSpecs';
import PIPE_CLASSES from '../data/network/pipes-by-class.json';
import NETWORK_ASSETS from '../data/network/assets.json';
import KEY_JUNCTIONS from '../data/network/junctions-key.json';
import NETWORK_STATS from '../data/network/stats.json';
import { pumpSim, valveSim, tankSim, reservoirSim, junctionSim } from '../simulator/networkSim';
import type { EpanetPump, EpanetValve, EpanetTank, EpanetReservoir, EpanetJunction } from '../simulator/networkSim';
import { X, Cpu, FilterX } from 'lucide-react';

const METER_COLOR = '#22d3ee';

/* ── EPANET pipe network: canvas multiline layer per diameter class ── */
interface PipeClass { id: string; label: string; color: string; weight: number; count: number; km: number; lines: [number, number][][] }
const pipeClasses = PIPE_CLASSES as unknown as PipeClass[];

function NetworkPipes({ visible }: { visible: Set<string> }) {
  const map = useMap();
  const layersRef = React.useRef<Record<string, L.Polyline> | null>(null);

  React.useEffect(() => {
    // dedicated pane below the SVG overlay so markers stay clickable on top
    if (!map.getPane('epanet-pipes')) {
      const pane = map.createPane('epanet-pipes');
      pane.style.zIndex = '350';
    }
    const renderer = L.canvas({ padding: 0.4, pane: 'epanet-pipes' });
    const layers: Record<string, L.Polyline> = {};
    for (const cls of pipeClasses) {
      layers[cls.id] = L.polyline(cls.lines as unknown as L.LatLngExpression[][], {
        color: cls.color, weight: cls.weight, opacity: 0.8, interactive: false, renderer, pane: 'epanet-pipes',
      });
    }
    layersRef.current = layers;
    return () => { Object.values(layers).forEach(l => l.remove()); };
  }, [map]);

  React.useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    for (const [id, layer] of Object.entries(layers)) {
      if (visible.has(id)) { if (!map.hasLayer(layer)) layer.addTo(map); }
      else layer.remove();
    }
  }, [visible, map]);

  return null;
}

/* EPANET asset marker icons */
const epaIconCache: Record<string, L.DivIcon> = {};
function epaIcon(kind: string): L.DivIcon {
  if (!epaIconCache[kind]) {
    const html: Record<string, string> = {
      pump: `<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid #a3e635;filter:drop-shadow(0 0 4px #a3e635)"></div>`,
      fcv: `<div style="width:8px;height:8px;transform:rotate(45deg);background:#34d399;border:1px solid rgba(255,255,255,0.8);box-shadow:0 0 5px #34d399"></div>`,
      prv: `<div style="width:8px;height:8px;transform:rotate(45deg);background:#eab308;border:1px solid rgba(255,255,255,0.8);box-shadow:0 0 5px #eab308"></div>`,
      tank: `<div style="width:10px;height:10px;background:rgba(129,140,248,0.35);border:2px solid #818cf8;box-shadow:0 0 6px #818cf8"></div>`,
      reservoir: `<div style="width:12px;height:12px;border-radius:50%;background:rgba(96,165,250,0.25);border:2.5px double #60a5fa;box-shadow:0 0 7px #60a5fa"></div>`,
      junction: `<div style="width:7px;height:7px;border-radius:50%;background:#f472b6;border:1px solid rgba(255,255,255,0.7);box-shadow:0 0 5px #f472b6"></div>`,
    };
    epaIconCache[kind] = L.divIcon({ className: 'lvd-fitting-icon', html: html[kind], iconSize: [13, 13], iconAnchor: [6, 6] });
  }
  return epaIconCache[kind];
}

const EPA = NETWORK_ASSETS as unknown as {
  pumps: EpanetPump[]; valves: EpanetValve[]; tanks: EpanetTank[]; reservoirs: EpanetReservoir[];
};
const EPA_JUNCTIONS = KEY_JUNCTIONS as unknown as EpanetJunction[];

const CLASS_COLORS: Record<NodeClass, string> = {
  INTAKE: '#60a5fa',
  WTP: '#34d399',
  IBPS: '#f59e0b',
  RESERVOIR: '#818cf8',
  OFFTAKE_GRAVITY: '#f472b6',
  OFFTAKE_DUAL: '#fb923c',
  OFFTAKE_PUMPED: '#e879f9',
};

const CLASS_SIZES: Record<NodeClass, number> = {
  INTAKE: 14,
  WTP: 14,
  IBPS: 12,
  RESERVOIR: 11,
  OFFTAKE_GRAVITY: 9,
  OFFTAKE_DUAL: 10,
  OFFTAKE_PUMPED: 12,
};

const ALARM_COLORS: Record<AlarmState, string> = {
  normal: '#22c55e',
  warning: '#f59e0b',
  alarm: '#ef4444',
  comms: '#6b7280',
};

const FITTING_TYPES: ValveType[] = ['PRV', 'PSV', 'ARV', 'WO'];

function getSiteAlarmState(siteId: string, tags: Record<string, Tag>): AlarmState {
  const siteTags = Object.values(tags).filter(t => t.site_id === siteId);
  if (siteTags.some(t => t.alarm_state === 'comms')) return 'comms';
  if (siteTags.some(t => t.alarm_state === 'alarm')) return 'alarm';
  if (siteTags.some(t => t.alarm_state === 'warning')) return 'warning';
  return 'normal';
}

/* Pipe geometry now comes from the MBALIKA2068 EPANET model (see NetworkPipes) */

function RecenterButton({ center }: { center: [number, number] }) {
  const map = useMap();
  return (
    <button
      onClick={() => map.setView(center, 7)}
      className="absolute bottom-4 right-4 z-[1000] px-3 py-1.5 text-xs rounded"
      style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}
    >Reset View</button>
  );
}

/* ── Critical data lines (2 per node) for filtered display ── */
function fmt(tag: Tag | undefined, digits = 0, unit = ''): string {
  if (!tag) return '—';
  return `${tag.value.toFixed(digits)}${unit}`;
}

function pumpCounts(site: Site, tags: Record<string, Tag>): { running: number; total: number } {
  const working = (site.phase1?.pumps_working as number) ?? 0;
  const standby = (site.phase1?.pumps_standby as number) ?? 0;
  const total = Math.min(working + standby, 12);
  let running = 0;
  for (let i = 1; i <= total; i++) {
    if (tags[`${site.id}-P${i}-RUN`]?.value === 1) running++;
  }
  return { running, total };
}

function siteDataLines(site: Site, tags: Record<string, Tag>): [string, string] {
  const t = (suffix: string) => tags[`${site.id}-${suffix}`];
  switch (site.class) {
    case 'INTAKE': {
      const pc = pumpCounts(site, tags);
      return [
        `Intake level ${fmt(t('LT-001'), 2, ' m')} · Sump ${fmt(t('LT-002'), 2, ' m')}`,
        `Pumps ${pc.running}/${pc.total} run · Turb ${fmt(t('TT-001'), 0, ' NTU')}`,
      ];
    }
    case 'WTP': {
      const pc = pumpCounts(site, tags);
      return [
        `Raw in ${fmt(t('FT-001'), 0, ' m³/h')} · Turb out ${fmt(t('TT-OUT'), 2, ' NTU')}`,
        `CWPS ${pc.running}/${pc.total} run · Cl₂ ${fmt(t('CL-RES'), 2, ' mg/L')}`,
      ];
    }
    case 'IBPS': {
      const pc = pumpCounts(site, tags);
      return [
        `Flow ${fmt(t('FT-001'), 0, ' m³/h')} · Dely ${fmt(t('PT-DELY'), 1, ' bar')}`,
        `Pumps ${pc.running}/${pc.total} run · Suct ${fmt(t('PT-SUCT'), 2, ' bar')}`,
      ];
    }
    case 'RESERVOIR': {
      const lvl = t('LT-001');
      const pct = lvl ? ((lvl.value / (lvl.range[1] || 10)) * 100).toFixed(0) : '—';
      return [
        `Level ${fmt(lvl, 2, ' m')} (${pct} %)`,
        `In ${fmt(t('FT-IN'), 0)} · Out ${fmt(t('FT-OUT'), 0)} m³/h`,
      ];
    }
    case 'OFFTAKE_GRAVITY':
      return [
        `Offtake ${fmt(t('FT-001'), 0, ' m³/h')}`,
        `PRV ${fmt(t('PT-UP'), 1)} → ${fmt(t('PT-DN'), 1)} bar`,
      ];
    case 'OFFTAKE_DUAL':
      return [
        `Kondoa leg ${fmt(t('FT-KONDOA'), 0, ' m³/h')}`,
        `Chemba leg ${fmt(t('FT-CHEMBA'), 0, ' m³/h')}`,
      ];
    case 'OFFTAKE_PUMPED': {
      const pc = pumpCounts(site, tags);
      return [
        `Flow ${fmt(t('FT-001'), 0, ' m³/h')} · Dely ${fmt(t('PT-DELY'), 1, ' bar')}`,
        `Pumps ${pc.running}/${pc.total} run · Up ${fmt(t('PT-UP'), 1, ' bar')}`,
      ];
    }
    default:
      return ['—', '—'];
  }
}

function fittingDataLines(spec: ValveSpec, rt: ValveRuntime | undefined): [string, string] {
  if (!rt) return ['—', '—'];
  switch (spec.type) {
    case 'PRV':
      return [
        `${rt.upstream_bar.toFixed(1)} → ${rt.downstream_bar.toFixed(1)} bar (set ${spec.setpoint_bar})`,
        `Pos ${rt.position.toFixed(0)} % · ${rt.flow_m3h.toFixed(0)} m³/h`,
      ];
    case 'PSV':
      return [
        `${rt.status} · set ${spec.setpoint_bar} bar`,
        `Line ${rt.upstream_bar.toFixed(1)} bar · DN${spec.dn}`,
      ];
    case 'ARV':
      return [
        `${rt.status} · DN${spec.dn} dual orifice`,
        `Line ${rt.upstream_bar.toFixed(1)} bar${spec.elev_masl ? ` · HP ${spec.elev_masl} masl` : ''}`,
      ];
    default: // WO
      return [
        `${rt.status} · DN${spec.dn}`,
        `Line ${rt.upstream_bar.toFixed(1)} bar${spec.elev_masl ? ` · LP ${spec.elev_masl} masl` : ''}`,
      ];
  }
}

/* Flowmeter map icon — cyan ring */
let meterIcon: L.DivIcon | null = null;
function getMeterIcon(): L.DivIcon {
  if (!meterIcon) {
    meterIcon = L.divIcon({
      className: 'lvd-fitting-icon',
      html: `<div style="width:12px;height:12px;border-radius:50%;background:rgba(34,211,238,0.2);border:2px solid ${METER_COLOR};box-shadow:0 0 7px ${METER_COLOR};display:flex;align-items:center;justify-content:center;"><div style="width:4px;height:4px;border-radius:50%;background:${METER_COLOR};"></div></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }
  return meterIcon;
}

/* Diamond div-icons for fittings, cached per type */
const fittingIcons: Partial<Record<ValveType, L.DivIcon>> = {};
function fittingIcon(type: ValveType): L.DivIcon {
  if (!fittingIcons[type]) {
    const c = VALVE_TYPE_COLORS[type];
    fittingIcons[type] = L.divIcon({
      className: 'lvd-fitting-icon',
      html: `<div style="width:10px;height:10px;transform:rotate(45deg);background:${c};border:1.5px solid rgba(255,255,255,0.75);box-shadow:0 0 7px ${c};"></div>`,
      iconSize: [13, 13],
      iconAnchor: [6, 6],
    });
  }
  return fittingIcons[type]!;
}

export default function OverviewMap() {
  const { state, dispatch } = useScada();
  const { tags, selectedSite, phase } = state;
  const valves = useValves();
  const { enabled: controlEnabled, setValve } = useControl();
  const [pumpModalSite, setPumpModalSite] = useState<string | null>(null);

  /* Legend filters */
  const [classFilter, setClassFilter] = useState<Set<NodeClass>>(new Set());
  const [fittingFilter, setFittingFilter] = useState<Set<ValveType>>(new Set());
  const [meterFilter, setMeterFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AlarmState | null>(null);
  /* EPANET layer visibility (independent of the data filters) */
  const [pipeVis, setPipeVis] = useState<Set<string>>(() => new Set(pipeClasses.map(c => c.id)));
  const [epaVis, setEpaVis] = useState<Set<string>>(() => new Set(['pumps', 'valves', 'tanks', 'reservoirs', 'junctions']));

  const anyFilter = classFilter.size > 0 || fittingFilter.size > 0 || meterFilter || statusFilter !== null;
  const siteFilterActive = classFilter.size > 0 || statusFilter !== null;

  const center: [number, number] = [-4.0, 34.8];

  const alarmStates = useMemo(() =>
    Object.fromEntries(ALL_SITES.map(s => [s.id, getSiteAlarmState(s.id, tags)])),
    [tags]
  );

  const pumpSiteStatus = useMemo(() =>
    Object.fromEntries(
      Array.from(PUMP_ENABLED_SITES).map(siteId => {
        const isRunning = Object.keys(tags).some(tid => tid.startsWith(siteId) && tid.includes('-P') && tid.includes('-RUN') && tags[tid]?.value === 1);
        const hasFault = Object.keys(tags).some(tid => tid.startsWith(siteId) && tid.includes('-FLT') && tags[tid]?.value === 1);
        return [siteId, { isRunning, hasFault }];
      })
    ), [tags]);

  const selectedSiteData = selectedSite ? ALL_SITES.find(s => s.id === selectedSite) : null;

  const handleMarkerClick = useCallback((siteId: string) => {
    if (PUMP_ENABLED_SITES.has(siteId)) {
      setPumpModalSite(siteId);
    } else {
      dispatch({ type: 'SET_SELECTED_SITE', payload: siteId });
    }
  }, [dispatch]);

  const toggleClass = (cls: NodeClass) => setClassFilter(prev => {
    const next = new Set(prev);
    if (next.has(cls)) next.delete(cls); else next.add(cls);
    return next;
  });
  const toggleFitting = (t: ValveType) => setFittingFilter(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });
  const clearFilters = () => { setClassFilter(new Set()); setFittingFilter(new Set()); setMeterFilter(false); setStatusFilter(null); };

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
    setter(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const togglePipeVis = toggleSet(setPipeVis);
  const toggleEpaVis = toggleSet(setEpaVis);

  /* Visibility rules */
  const siteVisible = (site: Site): boolean => {
    if (!anyFilter) return true;
    if (!siteFilterActive) return false; // only fitting filter active → nodes hidden
    if (classFilter.size > 0 && !classFilter.has(site.class as NodeClass)) return false;
    if (statusFilter !== null && alarmStates[site.id] !== statusFilter) return false;
    return true;
  };

  const fittingVisible = (spec: ValveSpec): boolean => {
    if (!anyFilter) return true;
    if (fittingFilter.size > 0) return fittingFilter.has(spec.type);
    return false;
  };

  const metersVisible = !anyFilter || meterFilter;

  return (
    <div className="relative w-full h-full flex">
      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={center}
          zoom={7}
          style={{ width: '100%', height: '100%', background: '#0f1117' }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            maxZoom={19}
          />

          {/* MBALIKA2068 EPANET pipe network (canvas layer, 34,404 pipes) */}
          <NetworkPipes visible={pipeVis} />

          {/* Site markers */}
          {ALL_SITES.filter(siteVisible).map(site => {
            const alarmState = alarmStates[site.id] ?? 'normal';
            const cls = site.class as NodeClass;
            const color = ALARM_COLORS[alarmState];
            const isSelected = site.id === selectedSite;
            const hasPump = PUMP_ENABLED_SITES.has(site.id);
            const pumpStatus = pumpSiteStatus[site.id];
            const [line1, line2] = siteDataLines(site, tags);

            return (
              <CircleMarker
                key={`${site.id}-${anyFilter ? 'flt' : 'std'}`}
                center={[site.lat, site.lng]}
                radius={isSelected ? (CLASS_SIZES[cls] + 4) : hasPump ? CLASS_SIZES[cls] + 2 : CLASS_SIZES[cls]}
                fillColor={CLASS_COLORS[cls]}
                fillOpacity={0.9}
                color={hasPump && pumpStatus?.isRunning ? '#22c55e' : color}
                weight={hasPump ? 2.5 : isSelected ? 3 : 2}
                eventHandlers={{
                  click: () => handleMarkerClick(site.id),
                }}
              >
                {anyFilter ? (
                  /* Filter active → permanent compact data label, no click needed */
                  <Tooltip permanent direction="right" offset={[10, 0]} className="lvd-perm-label" opacity={1}>
                    <div style={{ fontWeight: 700, color: CLASS_COLORS[cls] }}>{site.name}</div>
                    <div>{line1}</div>
                    <div>{line2}</div>
                  </Tooltip>
                ) : (
                  /* No filter → compact hover tooltip; click opens faceplate / 3D pump screen */
                  <Tooltip direction="top" offset={[0, -6]} className="lvd-perm-label" opacity={1}>
                    <div style={{ fontWeight: 700, color: CLASS_COLORS[cls] }}>{site.name}</div>
                    <div style={{ color: '#94a3b8' }}>{cls.replace(/_/g, ' ')} · km {site.chainage_km}{site.elevation_masl ? ` · ${site.elevation_masl} masl` : ''}</div>
                    <div>{line1}</div>
                    <div style={{ color: ALARM_COLORS[alarmState] }}>● {alarmState.toUpperCase()}{hasPump ? ' · click for 3D pump screen' : ' · click for faceplate'}</div>
                  </Tooltip>
                )}
              </CircleMarker>
            );
          })}

          {/* Pipeline fittings: PRV / surge relief / air valves / washouts */}
          {MAP_FITTINGS.filter(fittingVisible).map(spec => {
            const rt = valves[spec.id];
            const [line1, line2] = fittingDataLines(spec, rt);
            const c = VALVE_TYPE_COLORS[spec.type];
            const canCtl = controlEnabled && spec.controllable && rt && !rt.fault;
            return (
              <Marker key={`${spec.id}-${anyFilter && fittingFilter.size > 0 ? 'flt' : 'std'}`} position={[spec.lat, spec.lng]} icon={fittingIcon(spec.type)}>
                {anyFilter && fittingFilter.size > 0 ? (
                  <Tooltip permanent direction="right" offset={[8, 0]} className="lvd-perm-label" opacity={1}>
                    <div style={{ fontWeight: 700, color: c }}>{spec.name}</div>
                    <div>{line1}</div>
                    <div>{line2}</div>
                  </Tooltip>
                ) : (
                  <Tooltip direction="top" offset={[0, -6]} className="lvd-perm-label" opacity={1}>
                    <div style={{ fontWeight: 700, color: c }}>{spec.name}</div>
                    <div style={{ color: '#94a3b8' }}>{VALVE_TYPE_LABELS[spec.type]} · km {spec.chainage_km.toFixed(0)}</div>
                  </Tooltip>
                )}
                {/* Click popup with live data + control */}
                <Popup className="lvd-popup" closeButton>
                  <div style={{ minWidth: 210 }}>
                    <div style={{ fontWeight: 700, color: c, marginBottom: 2 }}>{spec.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>
                      {VALVE_TYPE_LABELS[spec.type]} · DN{spec.dn} PN{spec.pn} · km {spec.chainage_km.toFixed(1)}{spec.elev_masl ? ` · ${spec.elev_masl} masl` : ''} · {spec.actuation}
                    </div>
                    {rt && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11, fontFamily: 'monospace' }}>
                        <span style={{ color: '#6b7280' }}>Status</span><span style={{ color: c, fontWeight: 700 }}>{rt.status}</span>
                        {spec.type !== 'ARV' && (<><span style={{ color: '#6b7280' }}>Position</span><span>{rt.position.toFixed(0)} %</span></>)}
                        <span style={{ color: '#6b7280' }}>Line pressure</span><span>{rt.upstream_bar.toFixed(2)} bar</span>
                        {rt.downstream_bar > 0 && (<><span style={{ color: '#6b7280' }}>Downstream</span><span>{rt.downstream_bar.toFixed(2)} bar</span></>)}
                        {spec.elev_masl !== undefined && (<><span style={{ color: '#6b7280' }}>Static head</span><span>{(rt.upstream_bar * 10.2).toFixed(0)} m w.c.</span></>)}
                        {spec.setpoint_bar !== undefined && (<><span style={{ color: '#6b7280' }}>Set pressure</span><span style={{ color: '#facc15' }}>{spec.setpoint_bar} bar</span></>)}
                        {rt.flow_m3h > 0 && (<><span style={{ color: '#6b7280' }}>Flow</span><span>{rt.flow_m3h.toFixed(0)} m³/h</span></>)}
                      </div>
                    )}
                    {spec.notes && <div style={{ color: '#64748b', fontSize: 10, marginTop: 6 }}>{spec.notes}</div>}
                    {spec.controllable && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        {[['OPEN', 100, '#22c55e'], ['50 %', 50, '#60a5fa'], ['CLOSE', 0, '#ef4444']].map(([lbl, pos, col]) => (
                          <button key={lbl as string}
                            style={{
                              flex: 1, fontSize: 10, fontWeight: 700, padding: '3px 0', borderRadius: 5,
                              background: canCtl ? `${col}22` : 'rgba(107,114,128,0.1)',
                              color: canCtl ? (col as string) : '#4b5563',
                              border: `1px solid ${canCtl ? `${col}55` : 'rgba(107,114,128,0.25)'}`,
                              cursor: canCtl ? 'pointer' : 'not-allowed',
                            }}
                            disabled={!canCtl}
                            onClick={() => setValve(spec.id, pos as number)}
                          >{lbl}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Bulk billing flowmeters — one per offtake */}
          {metersVisible && FLOWMETERS.map(m => {
            const flow = tags[m.flowTagId]?.value ?? 0;
            const tot = tags[m.totTagId]?.value ?? 0;
            return (
              <Marker key={`${m.id}-${meterFilter ? 'flt' : 'std'}`} position={[m.lat, m.lng]} icon={getMeterIcon()}>
                {meterFilter ? (
                  <Tooltip permanent direction="right" offset={[9, 0]} className="lvd-perm-label" opacity={1}>
                    <div style={{ fontWeight: 700, color: METER_COLOR }}>{m.name}</div>
                    <div>Flow {flow.toFixed(0)} m³/h · DN{m.dn}</div>
                    <div>Total {Math.round(tot).toLocaleString()} m³</div>
                  </Tooltip>
                ) : (
                  <Tooltip direction="top" offset={[0, -7]} className="lvd-perm-label" opacity={1}>
                    <div style={{ fontWeight: 700, color: METER_COLOR }}>{m.name}</div>
                    <div style={{ color: '#94a3b8' }}>Bulk flowmeter · DN{m.dn} · km {m.chainage_km}</div>
                    <div>Flow {flow.toFixed(0)} m³/h</div>
                  </Tooltip>
                )}
                <Popup className="lvd-popup" closeButton>
                  <div style={{ minWidth: 205 }}>
                    <div style={{ fontWeight: 700, color: METER_COLOR, marginBottom: 2 }}>{m.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>
                      {m.id} · {m.meterType} · DN{m.dn} · km {m.chainage_km}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11, fontFamily: 'monospace' }}>
                      <span style={{ color: '#6b7280' }}>Status</span><span style={{ color: '#4ade80', fontWeight: 700 }}>HEALTHY</span>
                      <span style={{ color: '#6b7280' }}>Flow (inst.)</span><span>{flow.toFixed(1)} m³/h</span>
                      <span style={{ color: '#6b7280' }}>Velocity</span><span>{(flow / 3600 / (Math.PI / 4 * (m.dn / 1000) ** 2)).toFixed(2)} m/s</span>
                      <span style={{ color: '#6b7280' }}>Est. daily</span><span>{Math.round(flow * 24).toLocaleString()} m³/d</span>
                      <span style={{ color: '#6b7280' }}>Totalised</span><span>{Math.round(tot).toLocaleString()} m³</span>
                      <span style={{ color: '#6b7280' }}>Duty</span><span style={{ fontSize: 9 }}>{m.duty}</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* ── EPANET model assets ── */}
          {epaVis.has('pumps') && EPA.pumps.map(p => {
            const sim = pumpSim(p);
            return (
              <Marker key={p.id} position={p.pos as [number, number]} icon={epaIcon('pump')}>
                <Tooltip direction="top" offset={[0, -7]} className="lvd-perm-label" opacity={1}>
                  <div style={{ fontWeight: 700, color: '#a3e635' }}>Model Pump {p.id}</div>
                  <div>{sim.running ? `RUNNING · ${sim.flow.toFixed(0)} m³/h · ${sim.head.toFixed(0)} m` : 'STOPPED'}</div>
                </Tooltip>
                <Popup className="lvd-popup" closeButton>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontWeight: 700, color: '#a3e635', marginBottom: 2 }}>EPANET Pump {p.id}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>{p.n1} → {p.n2} · {p.params}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11, fontFamily: 'monospace' }}>
                      <span style={{ color: '#6b7280' }}>Status</span><span style={{ color: sim.running ? '#4ade80' : '#9ca3af', fontWeight: 700 }}>{sim.running ? 'RUNNING' : 'STOPPED'}</span>
                      <span style={{ color: '#6b7280' }}>Flow</span><span>{sim.flow.toFixed(0)} m³/h</span>
                      <span style={{ color: '#6b7280' }}>Head</span><span>{sim.head.toFixed(1)} m</span>
                      <span style={{ color: '#6b7280' }}>Shaft power</span><span>{sim.kw} kW</span>
                      <span style={{ color: '#6b7280' }}>Speed</span><span>{sim.speedPct.toFixed(0)} %</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {epaVis.has('valves') && EPA.valves.map(v => {
            const sim = valveSim(v);
            const col = v.type === 'PRV' ? '#eab308' : '#34d399';
            return (
              <Marker key={v.id} position={v.pos as [number, number]} icon={epaIcon(v.type === 'PRV' ? 'prv' : 'fcv')}>
                <Tooltip direction="top" offset={[0, -7]} className="lvd-perm-label" opacity={1}>
                  <div style={{ fontWeight: 700, color: col }}>Model {v.type} {v.id}</div>
                  <div>{v.type === 'PRV' ? `set ${v.setting} m · dn ${sim.downstream.toFixed(1)} m` : `set ${v.setting.toFixed(0)} m³/h · ${sim.flow.toFixed(0)} m³/h`}</div>
                </Tooltip>
                <Popup className="lvd-popup" closeButton>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontWeight: 700, color: col, marginBottom: 2 }}>EPANET {v.type} {v.id}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>{v.n1} → {v.n2} · DN{v.dn}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11, fontFamily: 'monospace' }}>
                      <span style={{ color: '#6b7280' }}>Mode</span><span style={{ color: col, fontWeight: 700 }}>{sim.status}</span>
                      <span style={{ color: '#6b7280' }}>Setting</span><span style={{ color: '#facc15' }}>{v.setting} {v.type === 'PRV' ? 'm' : 'm³/h'}</span>
                      <span style={{ color: '#6b7280' }}>Flow</span><span>{sim.flow.toFixed(0)} m³/h</span>
                      <span style={{ color: '#6b7280' }}>Upstream</span><span>{sim.upstream.toFixed(1)} {v.type === 'PRV' ? 'm' : 'bar'}</span>
                      <span style={{ color: '#6b7280' }}>Downstream</span><span>{sim.downstream.toFixed(1)} {v.type === 'PRV' ? 'm' : 'bar'}</span>
                      <span style={{ color: '#6b7280' }}>Position</span><span>{sim.position.toFixed(0)} %</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {epaVis.has('tanks') && EPA.tanks.map(t => {
            const sim = tankSim(t);
            return (
              <Marker key={t.id} position={t.pos as [number, number]} icon={epaIcon('tank')}>
                <Tooltip direction="top" offset={[0, -7]} className="lvd-perm-label" opacity={1}>
                  <div style={{ fontWeight: 700, color: '#818cf8' }}>Model Tank {t.id}</div>
                  <div>Level {sim.level.toFixed(2)} m ({sim.pct.toFixed(0)} %) · {sim.filling ? 'FILLING' : 'DRAWING'}</div>
                </Tooltip>
                <Popup className="lvd-popup" closeButton>
                  <div style={{ minWidth: 205 }}>
                    <div style={{ fontWeight: 700, color: '#818cf8', marginBottom: 2 }}>EPANET Tank {t.id}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>Floor {t.elev.toFixed(0)} masl · Ø {t.diam.toFixed(0)} m · capacity {Math.round(t.vol).toLocaleString()} m³</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11, fontFamily: 'monospace' }}>
                      <span style={{ color: '#6b7280' }}>Level</span><span>{sim.level.toFixed(2)} m</span>
                      <span style={{ color: '#6b7280' }}>Range</span><span>{t.min}–{t.max} m</span>
                      <span style={{ color: '#6b7280' }}>Stored</span><span>{sim.volNow.toLocaleString()} m³</span>
                      <span style={{ color: '#6b7280' }}>State</span><span style={{ color: sim.filling ? '#4ade80' : '#f59e0b', fontWeight: 700 }}>{sim.filling ? 'FILLING' : 'DRAWING'}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)', marginTop: 6 }}>
                      <div style={{ width: `${sim.pct}%`, height: '100%', background: '#818cf8' }} />
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {epaVis.has('reservoirs') && EPA.reservoirs.map(r => {
            const sim = reservoirSim(r);
            return (
              <Marker key={r.id} position={r.pos as [number, number]} icon={epaIcon('reservoir')}>
                <Tooltip direction="top" offset={[0, -7]} className="lvd-perm-label" opacity={1}>
                  <div style={{ fontWeight: 700, color: '#60a5fa' }}>Model Source {r.id}</div>
                  <div>Head {r.head.toFixed(0)} masl · out {sim.outflow.toFixed(0)} m³/h</div>
                </Tooltip>
                <Popup className="lvd-popup" closeButton>
                  <div style={{ minWidth: 190 }}>
                    <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 2 }}>EPANET Reservoir {r.id}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>Fixed-head source node</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11, fontFamily: 'monospace' }}>
                      <span style={{ color: '#6b7280' }}>Head</span><span>{sim.head.toFixed(1)} masl</span>
                      <span style={{ color: '#6b7280' }}>Outflow</span><span>{sim.outflow.toFixed(0)} m³/h</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {epaVis.has('junctions') && EPA_JUNCTIONS.map(j => {
            const sim = junctionSim(j);
            return (
              <Marker key={j.id} position={j.pos as [number, number]} icon={epaIcon('junction')}>
                <Tooltip direction="top" offset={[0, -6]} className="lvd-perm-label" opacity={1}>
                  <div style={{ fontWeight: 700, color: '#f472b6' }}>Demand Node {j.id}</div>
                  <div>{sim.demandNow.toFixed(1)} L/s · P {sim.pressure.toFixed(0)} m</div>
                </Tooltip>
                <Popup className="lvd-popup" closeButton>
                  <div style={{ minWidth: 195 }}>
                    <div style={{ fontWeight: 700, color: '#f472b6', marginBottom: 2 }}>EPANET Junction {j.id}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>Demand node · {j.elev.toFixed(0)} masl</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11, fontFamily: 'monospace' }}>
                      <span style={{ color: '#6b7280' }}>Base demand</span><span>{j.demand.toFixed(1)} L/s</span>
                      <span style={{ color: '#6b7280' }}>Demand now</span><span>{sim.demandNow.toFixed(1)} L/s</span>
                      <span style={{ color: '#6b7280' }}>Pressure</span><span>{sim.pressure.toFixed(1)} m</span>
                      <span style={{ color: '#6b7280' }}>HGL</span><span>{sim.hgl.toFixed(0)} masl</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          <RecenterButton center={center} />
        </MapContainer>

        {/* Interactive legend / filter panel */}
        <div className="absolute top-3 left-3 z-[1000] p-3 rounded-xl text-xs overflow-y-auto"
          style={{ background: 'rgba(10,16,30,0.95)', border: '1px solid rgba(79,142,247,0.15)', backdropFilter: 'blur(12px)', maxHeight: 'calc(100% - 24px)', width: 208 }}>

          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-300">Filters & Legend</span>
            {anyFilter && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold"
                style={{ fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.35)' }}>
                <FilterX size={10} /> Clear
              </button>
            )}
          </div>

          {/* Node classes */}
          <div className="font-semibold text-gray-500 mb-1" style={{ fontSize: 10 }}>NODE CLASS — click to filter</div>
          {(Object.entries(CLASS_COLORS) as [NodeClass, string][]).map(([cls, color]) => {
            const active = classFilter.has(cls);
            return (
              <button key={cls} onClick={() => toggleClass(cls)}
                className="flex items-center gap-2 mb-0.5 w-full px-1.5 py-0.5 rounded transition-colors"
                style={{ background: active ? `${color}26` : 'transparent', border: `1px solid ${active ? `${color}66` : 'transparent'}` }}>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, opacity: classFilter.size > 0 && !active ? 0.3 : 1 }} />
                <span style={{ color: active ? color : classFilter.size > 0 ? '#4b5563' : '#9ca3af' }}>{cls.replace(/_/g, ' ')}</span>
              </button>
            );
          })}

          {/* Fittings */}
          <div className="font-semibold text-gray-500 mb-1 mt-2 pt-2 border-t" style={{ fontSize: 10, borderColor: 'rgba(255,255,255,0.07)' }}>
            PIPELINE FITTINGS — click to filter
          </div>
          {FITTING_TYPES.map(t => {
            const active = fittingFilter.has(t);
            const color = VALVE_TYPE_COLORS[t];
            return (
              <button key={t} onClick={() => toggleFitting(t)}
                className="flex items-center gap-2 mb-0.5 w-full px-1.5 py-0.5 rounded transition-colors"
                style={{ background: active ? `${color}26` : 'transparent', border: `1px solid ${active ? `${color}66` : 'transparent'}` }}>
                <div className="w-2.5 h-2.5 rotate-45 flex-shrink-0" style={{ background: color, opacity: fittingFilter.size > 0 && !active ? 0.3 : 1 }} />
                <span style={{ color: active ? color : fittingFilter.size > 0 ? '#4b5563' : '#9ca3af' }}>{VALVE_TYPE_LABELS[t]}</span>
              </button>
            );
          })}

          {/* Flowmeters */}
          <button onClick={() => setMeterFilter(f => !f)}
            className="flex items-center gap-2 mb-0.5 w-full px-1.5 py-0.5 rounded transition-colors"
            style={{ background: meterFilter ? 'rgba(34,211,238,0.15)' : 'transparent', border: `1px solid ${meterFilter ? 'rgba(34,211,238,0.5)' : 'transparent'}` }}>
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ border: `2px solid ${METER_COLOR}`, background: 'rgba(34,211,238,0.2)' }} />
            <span style={{ color: meterFilter ? METER_COLOR : '#9ca3af' }}>Bulk Flowmeter (billing)</span>
          </button>

          {/* Status */}
          <div className="font-semibold text-gray-500 mb-1 mt-2 pt-2 border-t" style={{ fontSize: 10, borderColor: 'rgba(255,255,255,0.07)' }}>
            STATUS RING — click to filter
          </div>
          {(Object.entries(ALARM_COLORS) as [AlarmState, string][]).map(([st, color]) => {
            const active = statusFilter === st;
            return (
              <button key={st} onClick={() => setStatusFilter(active ? null : st)}
                className="flex items-center gap-2 mb-0.5 w-full px-1.5 py-0.5 rounded transition-colors"
                style={{ background: active ? `${color}26` : 'transparent', border: `1px solid ${active ? `${color}66` : 'transparent'}` }}>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, opacity: statusFilter && !active ? 0.3 : 1 }} />
                <span style={{ color: active ? color : statusFilter ? '#4b5563' : '#9ca3af' }}>{st.toUpperCase()}</span>
              </button>
            );
          })}

          {/* EPANET network layers */}
          <div className="font-semibold text-gray-500 mb-1 mt-2 pt-2 border-t" style={{ fontSize: 10, borderColor: 'rgba(255,255,255,0.07)' }}>
            EPANET NETWORK — toggle layers
          </div>
          {pipeClasses.map(c => {
            const on = pipeVis.has(c.id);
            return (
              <button key={c.id} onClick={() => togglePipeVis(c.id)}
                className="flex items-center gap-2 mb-0.5 w-full px-1.5 py-0.5 rounded"
                style={{ opacity: on ? 1 : 0.4 }}>
                <div className="w-6 flex-shrink-0" style={{ height: Math.max(2, c.weight), background: c.color }} />
                <span className="text-left flex-1" style={{ color: on ? '#cbd5e1' : '#6b7280', fontSize: 10 }}>
                  {c.label}
                  <span className="text-gray-600"> · {c.km.toLocaleString()} km</span>
                </span>
              </button>
            );
          })}
          {([
            ['pumps', 'pump', `Model Pumps (${EPA.pumps.length})`, '#a3e635'],
            ['valves', 'fcv', `Control Valves FCV/PRV (${EPA.valves.length})`, '#34d399'],
            ['tanks', 'tank', `Tanks (${EPA.tanks.length})`, '#818cf8'],
            ['reservoirs', 'reservoir', `Source Reservoirs (${EPA.reservoirs.length})`, '#60a5fa'],
            ['junctions', 'junction', `Demand Nodes (${EPA_JUNCTIONS.length})`, '#f472b6'],
          ] as [string, string, string, string][]).map(([key, icon, label, color]) => {
            const on = epaVis.has(key);
            return (
              <button key={key} onClick={() => toggleEpaVis(key)}
                className="flex items-center gap-2 mb-0.5 w-full px-1.5 py-0.5 rounded"
                style={{ opacity: on ? 1 : 0.4 }}>
                {icon === 'pump'
                  ? <div className="flex-shrink-0" style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: `8px solid ${color}` }} />
                  : icon === 'tank'
                    ? <div className="w-2.5 h-2.5 flex-shrink-0" style={{ background: `${color}44`, border: `1.5px solid ${color}` }} />
                    : icon === 'reservoir'
                      ? <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: `${color}33`, border: `2px double ${color}` }} />
                      : icon === 'junction'
                        ? <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        : <div className="w-2 h-2 rotate-45 flex-shrink-0" style={{ background: color }} />}
                <span className="text-left flex-1" style={{ color: on ? '#cbd5e1' : '#6b7280', fontSize: 10 }}>{label}</span>
              </button>
            );
          })}
          <div className="text-gray-600 px-1.5 mt-1" style={{ fontSize: 9, lineHeight: 1.4 }}>
            MBALIKA2068 model: {NETWORK_STATS.junctions.toLocaleString()} junctions · {NETWORK_STATS.pipes.toLocaleString()} pipes · {NETWORK_STATS.pipeKm.toLocaleString()} km
          </div>

          <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Cpu size={10} className="text-purple-400 flex-shrink-0" />
              <span className="text-purple-300" style={{ fontSize: 10 }}>Click pump site = 3D pump screen</span>
            </div>
            <div className="text-gray-600" style={{ fontSize: 9, lineHeight: 1.4 }}>
              {anyFilter
                ? 'Filter active — live data shown beside every visible item.'
                : 'No filter — hover for summary, click a node or fitting for its popup.'}
            </div>
          </div>
        </div>

        {/* Phase indicator */}
        <div className="absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{
            background: phase === 'ph1' ? 'rgba(30,58,95,0.85)' : 'rgba(59,7,100,0.85)',
            color: phase === 'ph1' ? '#60a5fa' : '#c084fc',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${phase === 'ph1' ? 'rgba(96,165,250,0.3)' : 'rgba(192,132,252,0.3)'}`,
          }}>
          {phase === 'ph1' ? 'PHASE 1 — 2048' : 'PHASE 2 — 2068'}
        </div>
      </div>

      {/* Faceplate slide-in (non-pump sites) */}
      {selectedSiteData && !PUMP_ENABLED_SITES.has(selectedSiteData.id) && (
        <div className="w-96 flex-shrink-0 overflow-y-auto" style={{ background: '#111827', borderLeft: '1px solid #1e3a5f' }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1e3a5f' }}>
            <span className="font-semibold text-sm text-gray-200">{selectedSiteData.name}</span>
            <button onClick={() => dispatch({ type: 'SET_SELECTED_SITE', payload: null })}
              className="text-gray-500 hover:text-gray-200">
              <X size={16} />
            </button>
          </div>
          <SiteFaceplate site={selectedSiteData} />
        </div>
      )}

      {/* 3D Pump Station Modal */}
      {pumpModalSite && (
        <PumpStationModal
          siteId={pumpModalSite}
          onClose={() => setPumpModalSite(null)}
        />
      )}
    </div>
  );
}
