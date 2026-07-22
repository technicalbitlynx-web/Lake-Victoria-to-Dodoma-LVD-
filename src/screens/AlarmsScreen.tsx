import React, { useState, useMemo } from 'react';
import { useAlarms, useScada } from '../context/ScadaContext';
import { simulator } from '../simulator/simulator';
import { AlertTriangle, CheckCircle, Filter, Clock } from 'lucide-react';
import type { AlarmPriority } from '../types';
import { ALL_SITES } from '../simulator/tagGenerator';
import { format } from 'date-fns';

const PRIORITY_STYLE: Record<AlarmPriority, { bg: string; text: string; badge: string }> = {
  critical: { bg: '#450a0a', text: '#fca5a5', badge: 'CRITICAL' },
  high: { bg: '#3b1002', text: '#fb923c', badge: 'HIGH' },
  medium: { bg: '#451a03', text: '#fde68a', badge: 'MEDIUM' },
  low: { bg: '#1e3a5f', text: '#93c5fd', badge: 'LOW' },
};

export default function AlarmsScreen() {
  const alarms = useAlarms();
  const { state } = useScada();
  const [filter, setFilter] = useState({ site: '', priority: '', unackedOnly: false });
  const [ackId, setAckId] = useState<string | null>(null);
  const [ackBy, setAckBy] = useState('');
  const [ackComment, setAckComment] = useState('');

  const sites = useMemo(() => ALL_SITES.map(s => s.id), []);

  const filtered = useMemo(() => alarms.filter(a => {
    if (filter.site && a.site_id !== filter.site) return false;
    if (filter.priority && a.priority !== filter.priority) return false;
    if (filter.unackedOnly && a.acknowledged) return false;
    return true;
  }), [alarms, filter]);

  const unacked = alarms.filter(a => !a.acknowledged).length;
  const critical = alarms.filter(a => a.priority === 'critical' && !a.acknowledged).length;

  function handleAck() {
    if (!ackId || !ackBy) return;
    simulator.acknowledgeAlarm(ackId, ackBy, ackComment);
    setAckId(null);
    setAckBy('');
    setAckComment('');
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#0f1117' }}>
      {/* Header */}
      <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid #1e3a5f', background: '#111827' }}>
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} className={unacked > 0 ? 'text-red-400 alarm-blink' : 'text-gray-500'} />
          <h2 className="font-bold text-gray-200">Alarms & Events</h2>
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-0.5 rounded font-bold" style={{ background: '#450a0a', color: '#ef4444' }}>{critical} CRITICAL</span>
            <span className="px-2 py-0.5 rounded" style={{ background: '#1e3a5f', color: '#93c5fd' }}>{unacked} UNACKNOWLEDGED</span>
            <span className="px-2 py-0.5 rounded" style={{ background: '#14532d', color: '#22c55e' }}>{alarms.length - unacked} ACKED</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-500" />
          <select value={filter.site} onChange={e => setFilter(f => ({ ...f, site: e.target.value }))}
            className="text-xs px-2 py-1 rounded" style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}>
            <option value="">All Sites</option>
            {ALL_SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}
            className="text-xs px-2 py-1 rounded" style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}>
            <option value="">All Priorities</option>
            {['critical', 'high', 'medium', 'low'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={filter.unackedOnly} onChange={e => setFilter(f => ({ ...f, unackedOnly: e.target.checked }))} />
            Unacked only
          </label>
        </div>
      </div>

      {/* Alarm list */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 grid text-xs font-semibold px-3 py-1.5" style={{ background: '#111827', color: '#6b7280', gridTemplateColumns: '80px 140px 1fr 80px 100px 80px', borderBottom: '1px solid #1e3a5f' }}>
          <span>Priority</span>
          <span>Time</span>
          <span>Description</span>
          <span>Site</span>
          <span>Value</span>
          <span>Action</span>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <CheckCircle size={32} className="mb-2 text-green-600" />
            <span>No alarms match filter</span>
          </div>
        )}

        {filtered.map((alarm, i) => {
          const style = PRIORITY_STYLE[alarm.priority];
          return (
            <div key={alarm.id}
              className="grid items-center px-3 py-2 text-xs"
              style={{
                gridTemplateColumns: '80px 140px 1fr 80px 100px 80px',
                background: alarm.acknowledged ? 'transparent' : (i % 2 === 0 ? '#0d1b2a' : 'transparent'),
                borderBottom: '1px solid #1e3a5f',
                opacity: alarm.acknowledged ? 0.55 : 1,
              }}>
              <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: style.bg, color: style.text, width: 'fit-content' }}>
                {style.badge}
              </span>
              <span className="text-gray-500 font-mono flex items-center gap-1">
                <Clock size={10} />
                {format(alarm.timestamp, 'HH:mm:ss dd/MM')}
              </span>
              <span className="text-gray-200">{alarm.description}</span>
              <span className="text-gray-400 truncate">{ALL_SITES.find(s => s.id === alarm.site_id)?.name.split(' ')[0] ?? alarm.site_id}</span>
              <span className="font-mono text-gray-300">{alarm.value !== 0 ? `${alarm.value.toFixed(2)} ${alarm.unit}` : '—'}</span>
              {alarm.acknowledged
                ? <span className="text-green-500 text-xs flex items-center gap-0.5"><CheckCircle size={10} /> {alarm.ack_by}</span>
                : <button onClick={() => setAckId(alarm.id)} className="text-xs px-2 py-0.5 rounded hover:bg-blue-800 transition-colors" style={{ background: '#1e3a5f', color: '#93c5fd' }}>ACK</button>}
            </div>
          );
        })}
      </div>

      {/* Ack modal */}
      {ackId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="p-6 rounded-lg w-96" style={{ background: '#111827', border: '1px solid #2e3250' }}>
            <h3 className="font-bold text-gray-200 mb-4">Acknowledge Alarm</h3>
            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Acknowledged by *</label>
              <input value={ackBy} onChange={e => setAckBy(e.target.value)} placeholder="Name / ID"
                className="w-full px-3 py-2 rounded text-sm" style={{ background: '#0d1b2a', color: '#e2e8f0', border: '1px solid #2e3250' }} />
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-400 block mb-1">Comment</label>
              <textarea value={ackComment} onChange={e => setAckComment(e.target.value)} rows={3} placeholder="Action taken / notes"
                className="w-full px-3 py-2 rounded text-sm resize-none" style={{ background: '#0d1b2a', color: '#e2e8f0', border: '1px solid #2e3250' }} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAckId(null)} className="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleAck} disabled={!ackBy} className="px-4 py-2 rounded text-sm font-semibold"
                style={{ background: ackBy ? '#2563eb' : '#1e3a5f', color: ackBy ? 'white' : '#6b7280' }}>
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
