import React, { useMemo } from 'react';
import { Shield, Lock, Wifi, AlertTriangle, CheckCircle, ArrowRight, Network, Router } from 'lucide-react';
import { useScada, useAlarms } from '../context/ScadaContext';
import { ALL_SITES } from '../simulator/tagGenerator';

/*
 * Live-ish telemetry: values are derived from the wall clock with smooth
 * deterministic noise, so they update on every 5 s simulator tick without
 * needing extra state. A few values are taken from the real simulation
 * (running VFDs, comms-fail sites, unacknowledged alarms).
 */
function wob(seed: number, amp = 1): number {
  const t = Math.floor(Date.now() / 5000);
  return (Math.sin(seed * 13.7 + t * 0.7) * 0.6 + Math.sin(seed * 5.1 + t * 0.23) * 0.4) * amp;
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

type DevStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'STANDBY';

const STATUS_STYLE: Record<DevStatus, { color: string; bg: string }> = {
  ONLINE: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  DEGRADED: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  OFFLINE: { color: '#ef4444', bg: 'rgba(239,68,68,0.14)' },
  STANDBY: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
};

interface DataLine { label: string; value: string; color?: string; barPct?: number }

/* ── Device box: always-visible status + 3-4 lines of critical data ── */
function DeviceCard({ name, status, lines, accent = '#1e3a5f' }: {
  name: string; status: DevStatus; lines: DataLine[]; accent?: string;
}) {
  const st = STATUS_STYLE[status];
  return (
    <div className="rounded-lg overflow-hidden"
      style={{ background: 'rgba(10,16,28,0.85)', border: `1px solid ${status === 'ONLINE' || status === 'STANDBY' ? `${accent}` : st.color}` }}>
      <div className="flex items-center justify-between px-2 py-1" style={{ background: `${accent}44`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="font-semibold text-gray-200 truncate" style={{ fontSize: 10 }}>{name}</span>
        <span className="flex items-center gap-1 flex-shrink-0 ml-1 px-1.5 rounded-full font-bold"
          style={{ fontSize: 8, color: st.color, background: st.bg }}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${status === 'OFFLINE' || status === 'DEGRADED' ? 'alarm-blink' : ''}`} style={{ background: st.color }} />
          {status}
        </span>
      </div>
      <div className="px-2 py-1.5 space-y-0.5">
        {lines.map((l, i) => (
          <div key={i}>
            <div className="flex items-center justify-between" style={{ fontSize: 9, lineHeight: '13px' }}>
              <span className="text-gray-600">{l.label}</span>
              <span className="font-mono font-semibold" style={{ color: l.color ?? '#cbd5e1' }}>{l.value}</span>
            </div>
            {l.barPct !== undefined && (
              <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{ width: `${clamp(l.barPct, 0, 100)}%`, background: l.barPct > 85 ? '#ef4444' : l.barPct > 70 ? '#f59e0b' : (l.color ?? '#3b82f6') }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Zone column wrapper ── */
function ZoneColumn({ title, sub, borderColor, titleColor, children, width }: {
  title: string; sub: string; borderColor: string; titleColor: string; children: React.ReactNode; width: string;
}) {
  return (
    <div className="rounded-xl p-2 flex flex-col gap-2" style={{ flex: '1 1 0', minWidth: width, background: 'rgba(8,12,24,0.6)', border: `1.5px solid ${borderColor}` }}>
      <div className="text-center">
        <div className="font-bold tracking-wide" style={{ fontSize: 11, color: titleColor }}>{title}</div>
        <div className="text-gray-600" style={{ fontSize: 8 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function FirewallColumn({ name, sub, lines, status }: { name: string; sub: string; lines: DataLine[]; status: DevStatus }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 flex-shrink-0" style={{ width: 118 }}>
      <ArrowRight size={12} className="text-gray-600" />
      <div className="w-full rounded-lg overflow-hidden" style={{ background: 'rgba(80,15,15,0.55)', border: '1.5px solid #ef4444' }}>
        <div className="text-center py-1" style={{ borderBottom: '1px solid rgba(239,68,68,0.25)' }}>
          <div className="font-bold text-red-300" style={{ fontSize: 10 }}>{name}</div>
          <div className="text-red-400/60" style={{ fontSize: 8 }}>{sub}</div>
        </div>
        <div className="px-2 py-1.5 space-y-0.5">
          <div className="flex justify-between" style={{ fontSize: 9 }}>
            <span className="text-gray-600">State</span>
            <span className="font-mono font-bold" style={{ color: STATUS_STYLE[status].color }}>{status}</span>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="flex justify-between" style={{ fontSize: 9 }}>
              <span className="text-gray-600">{l.label}</span>
              <span className="font-mono font-semibold" style={{ color: l.color ?? '#fca5a5' }}>{l.value}</span>
            </div>
          ))}
        </div>
      </div>
      <ArrowRight size={12} className="text-gray-600" />
    </div>
  );
}

/* ── Switch / gateway health row ── */
function InfraCard({ name, kind, location, status, uptime_d, cpu, temp, portsUp, portsTotal, thru, loss, extra }: {
  name: string; kind: 'SWITCH' | 'GATEWAY'; location: string; status: DevStatus;
  uptime_d: number; cpu: number; temp: number; portsUp?: number; portsTotal?: number;
  thru: number; loss: number; extra?: string;
}) {
  const st = STATUS_STYLE[status];
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(10,16,28,0.85)', border: `1px solid ${status === 'ONLINE' ? 'rgba(255,255,255,0.08)' : st.color}` }}>
      <div className="flex items-center gap-1.5 mb-1">
        {kind === 'SWITCH' ? <Network size={11} style={{ color: st.color }} /> : <Router size={11} style={{ color: st.color }} />}
        <span className="font-semibold text-gray-200 truncate" style={{ fontSize: 10 }}>{name}</span>
        <span className="ml-auto px-1.5 rounded-full font-bold flex-shrink-0" style={{ fontSize: 8, color: st.color, background: st.bg }}>{status}</span>
      </div>
      <div className="text-gray-600 mb-1" style={{ fontSize: 8 }}>{location} · up {uptime_d.toFixed(0)} d</div>
      <div className="grid grid-cols-2 gap-x-3" style={{ fontSize: 9 }}>
        <Row l="CPU" v={`${cpu.toFixed(0)} %`} c={cpu > 80 ? '#ef4444' : cpu > 60 ? '#f59e0b' : '#93c5fd'} />
        <Row l="Temp" v={`${temp.toFixed(0)} °C`} c={temp > 60 ? '#ef4444' : '#93c5fd'} />
        {portsUp !== undefined && <Row l="Ports" v={`${portsUp}/${portsTotal}`} c={portsUp === portsTotal ? '#86efac' : '#f59e0b'} />}
        {extra !== undefined && <Row l="Signal" v={extra} c="#93c5fd" />}
        <Row l="Thru" v={`${thru.toFixed(0)} Mb/s`} c="#93c5fd" />
        <Row l="Loss" v={`${loss.toFixed(2)} %`} c={loss > 1 ? '#ef4444' : loss > 0.3 ? '#f59e0b' : '#86efac'} />
      </div>
    </div>
  );
}

function Row({ l, v, c }: { l: string; v: string; c: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{l}</span>
      <span className="font-mono font-semibold" style={{ color: c }}>{v}</span>
    </div>
  );
}

export default function CybersecurityScreen() {
  const { state } = useScada();
  const alarms = useAlarms();
  const { tags } = state;

  /* Real values from the running simulation */
  const { runningVfds, commsSites } = useMemo(() => {
    let running = 0;
    const comms = new Set<string>();
    for (const t of Object.values(tags)) {
      if (/-P\d+-RUN$/.test(t.tag_id) && t.value === 1) running++;
      if (t.alarm_state === 'comms') comms.add(t.site_id);
    }
    return { runningVfds: running, commsSites: comms.size };
  }, [tags]);

  const totalSites = ALL_SITES.length;
  const rtuOnline = totalSites - commsSites;
  const unacked = alarms.filter(a => !a.acknowledged).length;
  const fieldDegraded = commsSites > 0;

  /* Wobbling metrics (recomputed each 5 s render) */
  const fw1cpu = clamp(31 + wob(1, 9), 8, 96);
  const fw2cpu = clamp(24 + wob(2, 7), 8, 96);
  const scadaCpu = clamp(28 + wob(3, 8), 5, 95);
  const histWrite = clamp(8400 + wob(4, 900), 5000, 12000);
  const siemEps = clamp(140 + wob(5, 35), 60, 400);
  const vpnTunnels = Math.round(clamp(6 + wob(6, 2), 2, 9));
  const gpsSats = Math.round(clamp(11 + wob(7, 2), 7, 14));
  const lteRssi = clamp(-71 + wob(8, 5), -95, -55);
  const upsCharge = clamp(96 + wob(9, 2.5), 80, 100);
  const mirrorLag = clamp(4 + wob(10, 2.5), 1, 30);
  const proxySessions = Math.round(clamp(3 + wob(11, 2), 0, 9));

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      <div className="flex items-center gap-3 mb-4">
        <Shield size={20} className="text-blue-400" />
        <div>
          <h2 className="text-lg font-bold text-gray-200">ICS Cybersecurity Architecture</h2>
          <p className="text-xs text-gray-500">IT/OT segmentation, firewall boundary, and VPN-only remote access — per LVD ToR requirement</p>
        </div>
        <div className="ml-auto px-3 py-1 rounded text-xs font-bold" style={{ background: '#14532d', color: '#86efac' }}>
          IEC 62443 ALIGNED
        </div>
      </div>

      {/* ── Network Segmentation Diagram — live status on every box ── */}
      <div className="mb-5 p-4 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-200 text-sm">Network Segmentation Diagram — Live Device Status</h3>
          <div className="flex items-center gap-3" style={{ fontSize: 9 }}>
            {(Object.entries(STATUS_STYLE) as [DevStatus, { color: string }][]).map(([s, v]) => (
              <span key={s} className="flex items-center gap-1 text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: v.color }} />{s}
              </span>
            ))}
            <span className="text-gray-600 font-mono">refresh 5 s</span>
          </div>
        </div>

        <div className="flex gap-2 items-stretch min-w-0" style={{ overflowX: 'auto' }}>
          {/* INTERNET */}
          <ZoneColumn title="INTERNET" sub="Untrusted" borderColor="#374151" titleColor="#6b7280" width="150px">
            <DeviceCard name="MoW Remote Users" status="ONLINE" accent="#374151" lines={[
              { label: 'VPN clients', value: `${vpnTunnels} conn` },
              { label: 'MFA', value: 'ENFORCED', color: '#86efac' },
              { label: 'Failed logins 24h', value: `${Math.round(clamp(1 + wob(21, 1.4), 0, 9))}`, color: '#fbbf24' },
            ]} />
            <DeviceCard name="SCADA Vendor Support" status="STANDBY" accent="#374151" lines={[
              { label: 'Session', value: 'NOT ACTIVE', color: '#60a5fa' },
              { label: 'Access window', value: 'ON REQUEST' },
              { label: 'Last session', value: '6 d ago' },
            ]} />
          </ZoneColumn>

          {/* FW-1 */}
          <FirewallColumn name="FW-1" sub="NGFW · IDS/IPS" status="ONLINE" lines={[
            { label: 'CPU', value: `${fw1cpu.toFixed(0)} %` },
            { label: 'Sessions', value: `${Math.round(clamp(1180 + wob(22, 220), 400, 2400))}` },
            { label: 'IPS blocks 24h', value: `${Math.round(clamp(24 + wob(23, 9), 2, 60))}`, color: '#fbbf24' },
            { label: 'Sig. update', value: '2 h ago', color: '#86efac' },
          ]} />

          {/* IT DMZ */}
          <ZoneColumn title="IT DMZ" sub="Screened subnet" borderColor="#1e3a5f" titleColor="#60a5fa" width="180px">
            <DeviceCard name="VPN Gateway" status="ONLINE" accent="#1d4ed8" lines={[
              { label: 'Tunnels', value: `${vpnTunnels} active`, color: '#86efac' },
              { label: 'Throughput', value: `${clamp(42 + wob(24, 12), 5, 90).toFixed(0)} Mb/s` },
              { label: 'Auth fails 24h', value: '0', color: '#86efac' },
              { label: 'Cert expiry', value: '210 d' },
            ]} />
            <DeviceCard name="Historian Mirror" status={mirrorLag > 15 ? 'DEGRADED' : 'ONLINE'} accent="#1e3a5f" lines={[
              { label: 'Sync lag', value: `${mirrorLag.toFixed(0)} s`, color: mirrorLag > 15 ? '#f59e0b' : '#86efac' },
              { label: 'Mode', value: 'READ-ONLY' },
              { label: 'Disk used', value: `${clamp(61 + wob(25, 1.5), 40, 92).toFixed(0)} %`, barPct: 61 },
            ]} />
            <DeviceCard name="Web HMI Proxy" status="ONLINE" accent="#1e3a5f" lines={[
              { label: 'HTTPS sessions', value: `${proxySessions}` },
              { label: 'TLS', value: '1.3 only', color: '#86efac' },
              { label: 'WAF blocks 24h', value: `${Math.round(clamp(2 + wob(26, 1.6), 0, 9))}` },
            ]} />
            <DeviceCard name="SIEM / Log Server" status="ONLINE" accent="#1e3a5f" lines={[
              { label: 'Events/s', value: `${siemEps.toFixed(0)}` },
              { label: 'Open alerts', value: `${unacked}`, color: unacked > 0 ? '#fbbf24' : '#86efac' },
              { label: 'Retention', value: '180 d' },
              { label: 'Disk used', value: `${clamp(48 + wob(27, 1.2), 30, 90).toFixed(0)} %`, barPct: 48 },
            ]} />
          </ZoneColumn>

          {/* FW-2 */}
          <FirewallColumn name="FW-2" sub="IT / OT boundary" status="ONLINE" lines={[
            { label: 'CPU', value: `${fw2cpu.toFixed(0)} %` },
            { label: 'Rules', value: '148 active' },
            { label: 'Denied 24h', value: `${Math.round(clamp(7 + wob(28, 4), 0, 30))}`, color: '#fbbf24' },
            { label: 'Conduits', value: '4 allowed', color: '#86efac' },
          ]} />

          {/* OT NETWORK */}
          <ZoneColumn title="OT NETWORK" sub="No internet path" borderColor="#2563eb" titleColor="#93c5fd" width="190px">
            <DeviceCard name="Central SCADA Servers" status="ONLINE" accent="#1d4ed8" lines={[
              { label: 'Redundancy', value: 'A ◂ SYNCED ▸ B', color: '#86efac' },
              { label: 'CPU', value: `${scadaCpu.toFixed(0)} %`, barPct: scadaCpu },
              { label: 'Live tags', value: `${Object.keys(tags).length}` },
              { label: 'Scan cycle', value: '5 s' },
            ]} />
            <DeviceCard name="Historian" status="ONLINE" accent="#1e3a5f" lines={[
              { label: 'Write rate', value: `${(histWrite / 1000).toFixed(1)}k rows/min` },
              { label: 'Disk used', value: `${clamp(57 + wob(29, 1), 35, 92).toFixed(0)} %`, barPct: 57 },
              { label: 'Granularity', value: '5 min' },
            ]} />
            <DeviceCard name="Engineering WS" status="STANDBY" accent="#1e3a5f" lines={[
              { label: 'Session', value: 'LOCKED', color: '#60a5fa' },
              { label: 'AV signatures', value: 'CURRENT', color: '#86efac' },
              { label: 'Patch level', value: 'n-0', color: '#86efac' },
            ]} />
            <DeviceCard name="Time Server (GPS)" status="ONLINE" accent="#1e3a5f" lines={[
              { label: 'Satellites', value: `${gpsSats}`, color: '#86efac' },
              { label: 'Stratum', value: '1' },
              { label: 'Offset', value: `±${Math.abs(wob(30, 0.3)).toFixed(2)} ms` },
            ]} />
          </ZoneColumn>

          {/* Arrow into field */}
          <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 30 }}>
            <ArrowRight size={13} className={fieldDegraded ? 'text-amber-400 alarm-blink' : 'text-green-600'} />
            <span style={{ fontSize: 8, color: fieldDegraded ? '#f59e0b' : '#4ade80' }}>WAN</span>
          </div>

          {/* FIELD */}
          <ZoneColumn title="FIELD / OT LEVEL" sub={`${totalSites} sites · 600 km corridor`} borderColor="#166534" titleColor="#86efac" width="200px">
            <DeviceCard name="RTU / PLC Fleet" status={fieldDegraded ? 'DEGRADED' : 'ONLINE'} accent="#14532d" lines={[
              { label: 'Online', value: `${rtuOnline}/${totalSites}`, color: fieldDegraded ? '#f59e0b' : '#86efac' },
              { label: 'Protocol', value: 'DNP3 / Modbus' },
              { label: 'Avg poll RTT', value: `${clamp(38 + wob(31, 9), 15, 220).toFixed(0)} ms` },
              { label: 'Config drift', value: 'NONE', color: '#86efac' },
            ]} />
            <DeviceCard name="Pump VFDs & Drives" status="ONLINE" accent="#14532d" lines={[
              { label: 'Drives running', value: `${runningVfds}`, color: '#86efac' },
              { label: 'Comms', value: 'Modbus TCP OK' },
              { label: 'Fault codes', value: `${alarms.filter(a => !a.acknowledged && a.priority === 'critical').length} crit`, color: '#fbbf24' },
            ]} />
            <DeviceCard name="Local HMIs" status="ONLINE" accent="#14532d" lines={[
              { label: 'Panels online', value: `${rtuOnline}/${totalSites}` },
              { label: 'Logged-in ops', value: `${Math.round(clamp(4 + wob(32, 2), 0, 9))}` },
              { label: 'Screen ver.', value: 'v2.4 fleet-wide', color: '#86efac' },
            ]} />
            <DeviceCard name="Radio / 4G LTE Comms" status={lteRssi < -85 ? 'DEGRADED' : 'ONLINE'} accent="#14532d" lines={[
              { label: 'Links up', value: `${rtuOnline}/${totalSites}`, color: fieldDegraded ? '#f59e0b' : '#86efac' },
              { label: 'Avg RSSI', value: `${lteRssi.toFixed(0)} dBm` },
              { label: 'Encryption', value: 'AES-256', color: '#86efac' },
            ]} />
            <DeviceCard name="Site UPS Fleet" status="ONLINE" accent="#14532d" lines={[
              { label: 'On mains', value: `${totalSites}/${totalSites}`, color: '#86efac' },
              { label: 'Avg charge', value: `${upsCharge.toFixed(0)} %`, barPct: upsCharge, color: '#4ade80' },
              { label: 'Autonomy', value: '72 h' },
            ]} />
          </ZoneColumn>
        </div>
      </div>

      {/* ── Switch & gateway health ── */}
      <div className="mb-5 p-4 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
        <div className="flex items-center gap-2 mb-3">
          <Network size={14} className="text-blue-400" />
          <h3 className="font-semibold text-gray-200 text-sm">Switch & Gateway Health</h3>
          <span className="ml-auto text-gray-600" style={{ fontSize: 9 }}>SNMP v3 polling · 60 s interval (simulated)</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <InfraCard name="DMZ-SW-01" kind="SWITCH" location="IT DMZ rack A" status="ONLINE"
            uptime_d={214 + wob(41, 0)} cpu={clamp(11 + wob(41, 4), 2, 95)} temp={clamp(39 + wob(42, 2), 25, 70)}
            portsUp={16} portsTotal={24} thru={clamp(120 + wob(43, 30), 20, 800)} loss={Math.abs(wob(44, 0.05))} />
          <InfraCard name="OT-CORE-SW-A" kind="SWITCH" location="Control room · ring master" status="ONLINE"
            uptime_d={312} cpu={clamp(14 + wob(45, 5), 2, 95)} temp={clamp(41 + wob(46, 2), 25, 70)}
            portsUp={22} portsTotal={24} thru={clamp(340 + wob(47, 60), 50, 900)} loss={Math.abs(wob(48, 0.04))} />
          <InfraCard name="OT-CORE-SW-B" kind="SWITCH" location="Control room · ring standby" status="STANDBY"
            uptime_d={312} cpu={clamp(6 + wob(49, 2), 1, 95)} temp={clamp(38 + wob(50, 2), 25, 70)}
            portsUp={22} portsTotal={24} thru={clamp(15 + wob(51, 6), 1, 100)} loss={Math.abs(wob(52, 0.03))} />
          <InfraCard name="VPN-GW-01" kind="GATEWAY" location="IT DMZ · IPSec/TLS" status="ONLINE"
            uptime_d={188} cpu={clamp(22 + wob(53, 7), 2, 95)} temp={clamp(44 + wob(54, 2), 25, 75)}
            thru={clamp(44 + wob(55, 12), 4, 200)} loss={Math.abs(wob(56, 0.06))} extra={`${tunnelCount()} tun`} />
          <InfraCard name="FLD-RING-1" kind="SWITCH" location="Mbalika → Mabale fibre ring" status="ONLINE"
            uptime_d={205} cpu={clamp(9 + wob(57, 3), 1, 95)} temp={clamp(43 + wob(58, 3), 25, 75)}
            portsUp={8} portsTotal={8} thru={clamp(85 + wob(59, 20), 10, 400)} loss={Math.abs(wob(60, 0.08))} />
          <InfraCard name="FLD-RING-2" kind="SWITCH" location="Kidaru → Kisiriri fibre ring" status={fieldDegraded ? 'DEGRADED' : 'ONLINE'}
            uptime_d={205} cpu={clamp(10 + wob(61, 3), 1, 95)} temp={clamp(45 + wob(62, 3), 25, 75)}
            portsUp={fieldDegraded ? 6 : 8} portsTotal={8} thru={clamp(80 + wob(63, 18), 5, 400)} loss={fieldDegraded ? 4.2 : Math.abs(wob(64, 0.1))} />
          <InfraCard name="FLD-RING-3" kind="SWITCH" location="Kisana → Kwamtoro fibre ring" status="ONLINE"
            uptime_d={198} cpu={clamp(8 + wob(65, 3), 1, 95)} temp={clamp(44 + wob(66, 3), 25, 75)}
            portsUp={8} portsTotal={8} thru={clamp(70 + wob(67, 16), 5, 400)} loss={Math.abs(wob(68, 0.07))} />
          <InfraCard name="FLD-RING-4" kind="SWITCH" location="Nghambala → UDOM fibre ring" status="ONLINE"
            uptime_d={198} cpu={clamp(9 + wob(69, 3), 1, 95)} temp={clamp(42 + wob(70, 3), 25, 75)}
            portsUp={8} portsTotal={8} thru={clamp(95 + wob(71, 22), 5, 400)} loss={Math.abs(wob(72, 0.06))} />
          <InfraCard name="LTE-GW-NORTH" kind="GATEWAY" location="Mwanza region backup APN" status="ONLINE"
            uptime_d={92} cpu={clamp(13 + wob(73, 4), 1, 95)} temp={clamp(47 + wob(74, 3), 25, 80)}
            thru={clamp(18 + wob(75, 6), 1, 100)} loss={Math.abs(wob(76, 0.2))} extra={`${clamp(-68 + wob(77, 4), -95, -50).toFixed(0)} dBm`} />
          <InfraCard name="LTE-GW-CENTRAL" kind="GATEWAY" location="Singida region backup APN" status={wob(78, 1) > 0.75 ? 'DEGRADED' : 'ONLINE'}
            uptime_d={92} cpu={clamp(12 + wob(79, 4), 1, 95)} temp={clamp(49 + wob(80, 3), 25, 80)}
            thru={clamp(14 + wob(81, 5), 1, 100)} loss={Math.abs(wob(82, 0.4))} extra={`${clamp(-79 + wob(83, 6), -98, -55).toFixed(0)} dBm`} />
          <InfraCard name="LTE-GW-SOUTH" kind="GATEWAY" location="Dodoma region backup APN" status="ONLINE"
            uptime_d={92} cpu={clamp(11 + wob(84, 4), 1, 95)} temp={clamp(46 + wob(85, 3), 25, 80)}
            thru={clamp(21 + wob(86, 7), 1, 100)} loss={Math.abs(wob(87, 0.15))} extra={`${clamp(-66 + wob(88, 4), -92, -50).toFixed(0)} dBm`} />
          <InfraCard name="GPS-TIME-GW" kind="GATEWAY" location="Control room roof antenna" status="ONLINE"
            uptime_d={312} cpu={clamp(4 + wob(89, 2), 1, 95)} temp={clamp(36 + wob(90, 2), 20, 70)}
            thru={clamp(0.4 + Math.abs(wob(91, 0.2)), 0.1, 5)} loss={Math.abs(wob(92, 0.02))} extra={`${Math.round(clamp(11 + wob(93, 2), 7, 14))} sats`} />
        </div>
      </div>

      {/* Controls & compliance */}
      <div className="grid grid-cols-3 gap-4">
        <SecuritySection title="Access Control" icon={<Lock size={14} />} items={[
          { ok: true, text: 'Role-based access (4 roles configured)' },
          { ok: true, text: 'MFA required for remote VPN access' },
          { ok: true, text: 'No shared accounts — named user IDs' },
          { ok: true, text: 'Session timeout: 15 min idle' },
          { ok: false, text: 'Privileged Access Workstations (planned)' },
        ]} />
        <SecuritySection title="Network Controls" icon={<Wifi size={14} />} items={[
          { ok: true, text: 'IT/OT firewall boundary (FW-2)' },
          { ok: true, text: 'Internet-facing: VPN gateway only' },
          { ok: true, text: 'OT VLAN segmentation per site class' },
          { ok: true, text: 'IDS/IPS on FW-1 (NGFW)' },
          { ok: true, text: 'Encrypted field comms (TLS/VPN)' },
        ]} />
        <SecuritySection title="Standards Compliance" icon={<Shield size={14} />} items={[
          { ok: true, text: 'IEC 62443-3-3 (OT security)' },
          { ok: true, text: 'NIST CSF aligned' },
          { ok: true, text: 'BS EN ISO 20456:2019 (flow meters)' },
          { ok: true, text: 'BS 6739:2024 (instrumentation)' },
          { ok: false, text: 'Annual penetration test (planned)' },
        ]} />
      </div>

      <div className="mt-4 p-3 rounded text-xs" style={{ background: '#111827', border: '1px solid #f59e0b' }}>
        <div className="flex items-center gap-2 mb-1 text-yellow-300 font-semibold">
          <AlertTriangle size={13} /> Demonstrator Note
        </div>
        <p className="text-gray-400">
          This is a simulated SCADA demonstrator running on localhost with no live plant connection.
          Device health, switch and gateway telemetry shown above are simulated (SNMP v3 polling in the real system).
          Authentication and role-based access are demonstrated structurally — the code is architected so that
          real authentication (OAuth2 / LDAP) drops in at the adapter layer without UI changes.
          Control commands act on the simulation only. No real plant commands are issued.
        </p>
      </div>
    </div>
  );
}

/* VPN tunnel count shared between diagram + infra card */
function tunnelCount(): number {
  return Math.round(clamp(6 + wob(6, 2), 2, 9));
}

function SecuritySection({ title, icon, items }: { title: string; icon: React.ReactNode; items: { ok: boolean; text: string }[] }) {
  return (
    <div className="p-3 rounded" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
      <div className="flex items-center gap-2 mb-3 font-semibold text-gray-200 text-sm">
        <span className="text-blue-400">{icon}</span>{title}
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 mb-1.5 text-xs">
          {item.ok
            ? <CheckCircle size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />}
          <span className={item.ok ? 'text-gray-300' : 'text-yellow-300'}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
