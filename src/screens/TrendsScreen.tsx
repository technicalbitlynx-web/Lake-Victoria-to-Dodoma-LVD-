import React, { useState, useMemo } from 'react';
import { useScada } from '../context/ScadaContext';
import { ALL_SITES } from '../simulator/tagGenerator';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

const COLORS = ['#4f8ef7', '#34d399', '#f59e0b', '#f472b6', '#818cf8', '#fb923c'];

export default function TrendsScreen() {
  const { state } = useScada();
  const { tags } = state;

  const [selectedSite, setSelectedSite] = useState(ALL_SITES[0].id);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const siteTags = useMemo(() =>
    Object.values(tags).filter(t => t.site_id === selectedSite && t.measurement !== 'status'),
    [tags, selectedSite]
  );

  const chartData = useMemo(() => {
    if (selectedTags.length === 0) return [];
    const first = tags[selectedTags[0]];
    if (!first) return [];
    return first.history.map((h, i) => {
      const row: Record<string, number | string> = { t: format(h.t, 'HH:mm') };
      selectedTags.forEach(tid => {
        const tag = tags[tid];
        if (tag) row[tid] = tag.history[i]?.v ?? 0;
      });
      return row;
    });
  }, [tags, selectedTags]);

  function toggleTag(tid: string) {
    setSelectedTags(prev =>
      prev.includes(tid) ? prev.filter(t => t !== tid) : [...prev.slice(-5), tid]
    );
  }

  function exportCsv() {
    if (selectedTags.length === 0) return;
    const header = ['Timestamp', ...selectedTags].join(',');
    const rows = chartData.map(row => [row.t, ...selectedTags.map(t => row[t] ?? '')].join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'lvd_trend.csv'; a.click();
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#0f1117' }}>
      {/* Controls */}
      <div className="p-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid #1e3a5f', background: '#111827' }}>
        <h2 className="font-bold text-gray-200">Trend Viewer</h2>
        <select value={selectedSite} onChange={e => { setSelectedSite(e.target.value); setSelectedTags([]); }}
          className="text-xs px-2 py-1 rounded" style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}>
          {ALL_SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-xs text-gray-500">Select up to 6 tags:</span>
        <button onClick={exportCsv} disabled={selectedTags.length === 0}
          className="ml-auto px-3 py-1 rounded text-xs font-semibold"
          style={{ background: selectedTags.length > 0 ? '#1e3a5f' : '#111827', color: selectedTags.length > 0 ? '#93c5fd' : '#4b5563' }}>
          Export CSV
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Tag picker */}
        <div className="w-56 flex-shrink-0 overflow-y-auto p-2" style={{ borderRight: '1px solid #1e3a5f', background: '#111827' }}>
          {siteTags.map((tag, i) => {
            const isSelected = selectedTags.includes(tag.tag_id);
            const colorIdx = selectedTags.indexOf(tag.tag_id);
            return (
              <button key={tag.tag_id} onClick={() => toggleTag(tag.tag_id)}
                className="w-full text-left px-2 py-1.5 rounded mb-0.5 text-xs transition-all"
                style={{
                  background: isSelected ? '#1e3a5f' : 'transparent',
                  color: isSelected ? COLORS[colorIdx % COLORS.length] : '#6b7280',
                  border: isSelected ? `1px solid ${COLORS[colorIdx % COLORS.length]}` : '1px solid transparent',
                }}>
                <div className="font-mono truncate">{tag.tag_id.replace(`${selectedSite}-`, '')}</div>
                <div className="text-gray-600 truncate" style={{ fontSize: 10 }}>{tag.description}</div>
              </button>
            );
          })}
        </div>

        {/* Chart */}
        <div className="flex-1 p-4 overflow-hidden">
          {selectedTags.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-600">
              ← Select tags from the left panel to plot trends
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                <XAxis dataKey="t" stroke="#4b5563" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis stroke="#4b5563" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #2e3250', color: '#e2e8f0', fontSize: 11 }}
                  labelStyle={{ color: '#93c5fd' }}
                />
                <Legend wrapperStyle={{ fontSize: 10, color: '#6b7280' }} />
                {selectedTags.map((tid, i) => (
                  <Line key={tid} type="monotone" dataKey={tid} stroke={COLORS[i % COLORS.length]}
                    dot={false} strokeWidth={1.5} name={tid.replace(`${selectedSite}-`, '')} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Canned reports */}
      <div className="p-3 flex gap-2 flex-wrap" style={{ borderTop: '1px solid #1e3a5f', background: '#111827' }}>
        <span className="text-xs text-gray-500">Canned reports:</span>
        {['Daily Production', 'Energy by Station', 'Water Quality Compliance', 'Monthly Offtake Volumes'].map(r => (
          <button key={r} onClick={() => alert(`Report "${r}" would generate a PDF/CSV. Not active in demonstrator.`)}
            className="px-2 py-1 rounded text-xs"
            style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}>{r}</button>
        ))}
      </div>
    </div>
  );
}
