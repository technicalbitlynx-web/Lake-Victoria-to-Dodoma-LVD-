import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpDown, CheckCircle } from 'lucide-react';
import { INSTRUMENTS, scada, type ScadaReading } from '../lib/scadaSource';
import { BAND_COLORS, BAND_LABELS, type ComparisonRow, type ComparisonSummary, type Band } from '../lib/modelComparison';

const QUALITY_COLORS: Record<ScadaReading['quality'], string> = {
  good: '#22c55e', stale: '#f59e0b', uncertain: '#eab308', comms_fail: '#ef4444', out_of_range: '#f97316',
};

/* 24 h deviation sparkline built from synthetic history (flow instruments) */
function Sparkline({ tagId, kind }: { tagId: string; kind: 'flow' | 'head' | null }) {
  const [pts, setPts] = useState<number[] | null>(null);
  React.useEffect(() => {
    if (kind !== 'flow') return; // head deviations await survey → no series
    let alive = true;
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    scada.history(tagId, from, to).then(hist => {
      if (!alive) return;
      const inst = INSTRUMENTS.find(i => i.tagId === tagId);
      // deviation proxy: reading vs its own 24h mean (drift shows as trend)
      const vals = hist.filter(h => Number.isFinite(h.value)).map(h => h.value);
      if (vals.length < 2) { setPts([]); return; }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      setPts(vals.map(v => v - mean));
      void inst;
    });
    return () => { alive = false; };
  }, [tagId, kind]);

  if (kind !== 'flow' || !pts || pts.length < 2) return <span className="text-gray-700" style={{ fontSize: 9 }}>—</span>;
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const w = 60, h = 16;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const trend = pts[pts.length - 1] - pts[0];
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={d} fill="none" stroke={Math.abs(trend) > range * 0.4 ? '#f59e0b' : '#4f8ef7'} strokeWidth="1" />
    </svg>
  );
}

type SortKey = 'site' | 'absdev' | 'measurand';

export default function ModelPerformance({ rows, summary, illustrative }: {
  rows: ComparisonRow[]; summary: ComparisonSummary; illustrative: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('absdev');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [measFilter, setMeasFilter] = useState<string>('all');
  const [bandFilter, setBandFilter] = useState<Band | 'all'>('all');

  const sites = useMemo(() => ['all', ...Array.from(new Set(rows.map(r => r.site)))], [rows]);

  const filtered = useMemo(() => {
    let out = rows.filter(r =>
      (siteFilter === 'all' || r.site === siteFilter) &&
      (measFilter === 'all' || r.measurand === measFilter) &&
      (bandFilter === 'all' || r.band === bandFilter));
    const absdev = (r: ComparisonRow) => Math.abs(r.deltaHead_m ?? (r.deltaPct ?? -1));
    out = [...out].sort((a, b) => {
      if (sortKey === 'site') return a.site.localeCompare(b.site) || a.tagId.localeCompare(b.tagId);
      if (sortKey === 'measurand') return a.measurand.localeCompare(b.measurand);
      return absdev(b) - absdev(a); // worst first
    });
    return out;
  }, [rows, siteFilter, measFilter, bandFilter, sortKey]);

  return (
    <div className="rounded-lg" style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid #1e3a5f' }}>
      {/* header summary */}
      <div className="px-3 py-2 flex items-center gap-4 flex-wrap" style={{ borderBottom: '1px solid #1e3a5f' }}>
        <span className="text-sm font-bold text-gray-200">Model Performance</span>
        <Stat label="Instruments" val={String(summary.instrumentCount)} />
        <Stat label="Within uncertainty" val={String(summary.withinUncertainty)} color="#22c55e" />
        <Stat label="Flow RMSE" val={summary.rmseFlowPct != null ? `${summary.rmseFlowPct.toFixed(1)}%` : 'n/a'} color="#60a5fa" />
        <Stat label="Flow MAE" val={summary.meanAbsFlowPct != null ? `${summary.meanAbsFlowPct.toFixed(1)}%` : 'n/a'} color="#60a5fa" />
        <Stat label="Head RMSE" val={summary.rmseHead_m != null ? `${summary.rmseHead_m.toFixed(2)} m` : 'awaiting survey'} color={summary.rmseHead_m != null ? '#a78bfa' : '#f59e0b'} />
        <Stat label="Awaiting survey" val={String(summary.awaitingSurvey)} color="#f59e0b" />
        <Stat label="Excluded (quality)" val={String(summary.excludedForQuality)} color="#ef4444" />
      </div>

      {/* the survey-gap explainer */}
      {summary.computedHead === 0 && !illustrative && (
        <div className="px-3 py-1.5 text-xs flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.07)', color: '#fbbf24' }}>
          <AlertTriangle size={12} />
          Head/level error is <strong>not computed</strong>: transducer elevations are un-surveyed. Flow comparisons (no elevation needed) are shown. Head datum: HGL = transducer_elev + p × {summary.conversionConstant_m_per_bar} m/bar.
        </div>
      )}

      {/* filters */}
      <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap text-xs" style={{ borderBottom: '1px solid #1e3a5f' }}>
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="rounded px-1.5 py-0.5" style={{ background: '#0d1b2a', color: '#93c5fd', border: '1px solid #2e3250' }}>
          {sites.map(s => <option key={s} value={s}>{s === 'all' ? 'All sites' : s}</option>)}
        </select>
        <select value={measFilter} onChange={e => setMeasFilter(e.target.value)} className="rounded px-1.5 py-0.5" style={{ background: '#0d1b2a', color: '#93c5fd', border: '1px solid #2e3250' }}>
          {['all', 'flow', 'pressure', 'level', 'current', 'status'].map(m => <option key={m} value={m}>{m === 'all' ? 'All measurands' : m}</option>)}
        </select>
        <select value={bandFilter} onChange={e => setBandFilter(e.target.value as Band | 'all')} className="rounded px-1.5 py-0.5" style={{ background: '#0d1b2a', color: '#93c5fd', border: '1px solid #2e3250' }}>
          <option value="all">All bands</option>
          {(Object.keys(BAND_LABELS) as Band[]).map(b => <option key={b} value={b}>{BAND_LABELS[b]}</option>)}
        </select>
        <button onClick={() => setSortKey(k => k === 'absdev' ? 'site' : 'absdev')} className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: '#0d1b2a', color: '#93c5fd', border: '1px solid #2e3250' }}>
          <ArrowUpDown size={11} /> {sortKey === 'absdev' ? 'worst deviation' : 'by site'}
        </button>
        <span className="text-gray-600 ml-auto">{filtered.length} rows</span>
      </div>

      {/* table */}
      <div className="overflow-x-auto" style={{ maxHeight: 360 }}>
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead className="sticky top-0" style={{ background: '#0d1b2a' }}>
            <tr className="text-gray-500" style={{ fontSize: 10 }}>
              {['Site', 'Tag', 'Meas.', 'Model', 'Measured', 'Δ', 'Δ%', 'Band', 'Quality', 'Age', '24h'].map(h => (
                <th key={h} className="text-left px-2 py-1 font-semibold" style={{ borderBottom: '1px solid #1e3a5f' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const dim = r.excluded ? 0.42 : 1;
              const headKind = r.measurand === 'pressure' || r.measurand === 'level';
              const delta = r.deltaHead_m ?? r.deltaFlow_m3h;
              const modelDisp = r.modelValue != null ? `${r.modelValue.toFixed(headKind ? 2 : 0)} ${r.units}` : '—';
              const measDisp = r.excluded ? '—' : (r.measuredValue != null ? `${r.measuredValue.toFixed(headKind ? 2 : 0)} ${r.units}` : '—');
              return (
                <tr key={r.tagId} style={{ opacity: dim, borderBottom: '1px solid rgba(30,58,95,0.4)' }}>
                  <td className="px-2 py-1 text-gray-300">{r.site.split(/[/-]/)[0].trim()}{r.confidence === 'Low' && <span className="text-amber-400" title="low-confidence site position"> ⚠</span>}</td>
                  <td className="px-2 py-1 font-mono text-gray-500">{r.tagId}</td>
                  <td className="px-2 py-1 text-gray-400">{r.measurand}</td>
                  <td className="px-2 py-1 font-mono text-gray-300">{modelDisp}</td>
                  <td className="px-2 py-1 font-mono text-gray-300">{measDisp}</td>
                  <td className="px-2 py-1 font-mono">
                    {r.awaitingSurvey ? <span className="text-amber-400" style={{ fontSize: 10 }}>awaiting survey</span>
                      : delta != null ? <span style={{ color: r.band ? BAND_COLORS[r.band] : '#9ca3af' }}>{delta > 0 ? '+' : ''}{delta.toFixed(headKind ? 2 : 0)}{headKind ? ' m' : ''}</span>
                        : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-2 py-1 font-mono text-gray-400">{r.deltaPct != null ? `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct.toFixed(1)}%` : (r.excluded || r.awaitingSurvey ? '' : 'n/a')}</td>
                  <td className="px-2 py-1">
                    {r.band ? <span className="px-1.5 py-0.5 rounded-full font-semibold" style={{ fontSize: 9, color: BAND_COLORS[r.band], background: `${BAND_COLORS[r.band]}22` }}>{BAND_LABELS[r.band]}</span> : ''}
                  </td>
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-1" style={{ color: QUALITY_COLORS[r.quality] }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: QUALITY_COLORS[r.quality] }} />
                      {r.quality === 'good' ? 'good' : <span title={r.exclusionReason ?? ''}>{r.quality}</span>}
                    </span>
                  </td>
                  <td className="px-2 py-1 font-mono" style={{ color: r.ageMin != null && r.ageMin > 5 ? '#f59e0b' : '#6b7280' }}>{r.ageMin != null ? `${r.ageMin}m` : '—'}</td>
                  <td className="px-2 py-1"><Sparkline tagId={r.tagId} kind={r.deltaFlow_m3h != null ? 'flow' : headKind ? 'head' : null} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* band legend */}
      <div className="px-3 py-1.5 flex items-center gap-3 flex-wrap text-xs" style={{ borderTop: '1px solid #1e3a5f' }}>
        <CheckCircle size={11} className="text-gray-500" />
        {(Object.keys(BAND_LABELS) as Band[]).map(b => (
          <span key={b} className="flex items-center gap-1 text-gray-500">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: BAND_COLORS[b] }} />{BAND_LABELS[b]}
          </span>
        ))}
        <span className="text-gray-600 ml-auto">excluded rows dimmed & omitted from statistics</span>
      </div>
    </div>
  );
}

function Stat({ label, val, color = '#e2e8f0' }: { label: string; val: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-gray-600" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span className="font-mono font-bold" style={{ color, fontSize: 13 }}>{val}</span>
    </div>
  );
}
