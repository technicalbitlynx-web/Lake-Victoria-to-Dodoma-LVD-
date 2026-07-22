import React from 'react';
import { useScada } from '../context/ScadaContext';
import type { AlarmState } from '../types';

interface Props {
  tagId: string;
  decimals?: number;
  className?: string;
  showUnit?: boolean;
}

const ALARM_STYLE: Record<AlarmState, string> = {
  normal: 'text-green-400',
  warning: 'text-yellow-400',
  alarm: 'text-red-400 alarm-blink',
  comms: 'text-gray-500',
};

export default function TagValue({ tagId, decimals = 1, className = '', showUnit = true }: Props) {
  const { state } = useScada();
  const tag = state.tags[tagId];
  if (!tag) return <span className="text-gray-600 text-xs">—</span>;

  const isStatus = tag.measurement === 'status';
  const val = isStatus
    ? (tag.value ? 'RUN' : 'STOP')
    : tag.measurement === 'flow' && tagId.includes('TOT')
      ? tag.value.toFixed(0)
      : tag.value.toFixed(decimals);

  return (
    <span className={`font-mono font-semibold ${ALARM_STYLE[tag.alarm_state]} ${className}`}>
      {tag.alarm_state === 'comms' ? '???' : val}
      {showUnit && !isStatus && tag.unit && <span className="text-gray-500 font-normal text-xs ml-1">{tag.unit}</span>}
    </span>
  );
}

export function TagRow({ tagId, label, decimals = 1 }: { tagId: string; label: string; decimals?: number }) {
  const { state } = useScada();
  const tag = state.tags[tagId];
  if (!tag) return null;

  return (
    <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: '#1e3a5f' }}>
      <span className="text-gray-400 text-xs">{label}</span>
      <TagValue tagId={tagId} decimals={decimals} />
    </div>
  );
}

export function MiniTrend({ tagId }: { tagId: string }) {
  const { state } = useScada();
  const tag = state.tags[tagId];
  if (!tag || tag.history.length < 2) return null;

  const W = 120, H = 32;
  const vals = tag.history.slice(-30).map(h => h.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke="#4f8ef7" strokeWidth="1.5" />
    </svg>
  );
}
