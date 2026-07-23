import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Info, Download, RotateCcw, MapPin, Layers, FlaskConical } from 'lucide-react';
import profileData from '../data/hydraulicProfile.json';
import { INSTRUMENTS, scada, type ScadaReading } from '../lib/scadaSource';
import { compareAll, BAND_COLORS, type ComparisonRow, type ComparisonSummary } from '../lib/modelComparison';
import ModelPerformance from './ModelPerformance';

/* ── profile data (parallel typed arrays) ── */
const P = profileData as unknown as {
  meta: Record<string, unknown> & {
    tracedLength_km: number; maxVerticalError_m: number; compressionRatio: number;
    hglMethod: string; horizon: string; note: string; minResidual_m: number;
    highPointNodes: number; elevRange_m: [number, number]; diametersPresent_mm: number[];
    decimatedPoints: number; decimationMethod: string;
  };
  chainage_m: number[]; elev_m: number[]; head_m: number[]; pressure_m: number[]; flow_m3h: number[];
  diam_mm: number[]; hpFlags: number[];
  sites: { name: string; chainage_m: number; elev_m: number; level_m: number; type: string; confidence: string; unconfirmed: boolean; deciPos: number }[];
  anomalies: { deciPos: number; chainage_m: number; elev_m: number; pressure_m: number }[];
};

const LEN_M = P.chainage_m[P.chainage_m.length - 1];
const ELEV_MIN = P.meta.elevRange_m[0] - 30;
const ELEV_MAX = P.meta.elevRange_m[1] + 120; // headroom for HGL above ground

/* diameter colour ramp */
const DIAMS = [...P.meta.diametersPresent_mm].sort((a, b) => b - a);
function diamColor(dn: number): string {
  const i = DIAMS.indexOf(dn);
  const t = DIAMS.length > 1 ? i / (DIAMS.length - 1) : 0;
  const hue = 205 - t * 40; // blue→teal by size
  return `hsl(${hue}, ${55 - t * 20}%, ${45 + t * 10}%)`;
}

const fmt = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

export default function HydraulicProfile() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 420 });
  const [view, setView] = useState<[number, number]>([0, LEN_M]); // chainage window (m)
  const [vExag, setVExag] = useState(1.6);
  const [hover, setHover] = useState<{ x: number; ch: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; view: [number, number] } | null>(null);
  const [layers, setLayers] = useState({ diameter: true, pressure: true, hgl: true, measured: true, sites: true, anomalies: true });
  const [illustrative, setIllustrative] = useState(false);
  const [readings, setReadings] = useState<Map<string, ScadaReading>>(new Map());
  const [now, setNow] = useState(Date.now());

  /* poll synthetic SCADA (5-min cadence; refresh view every 30 s) */
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const rs = await scada.latest(INSTRUMENTS.map(i => i.tagId));
      if (!alive) return;
      setReadings(new Map(rs.map(r => [r.tagId, r])));
      setNow(Date.now());
    };
    pull();
    const t = setInterval(pull, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const { rows, summary } = useMemo<{ rows: ComparisonRow[]; summary: ComparisonSummary }>(
    () => compareAll(INSTRUMENTS, readings, { illustrativeTransducerElev: illustrative, nowMs: now }),
    [readings, illustrative, now],
  );

  /* responsive canvas */
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      setSize({ w: Math.max(320, cr.width), h: Math.max(300, Math.min(520, cr.width * 0.42)) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const PAD = { l: 62, r: 16, t: 16, b: 44 };
  const plotW = size.w - PAD.l - PAD.r;
  const plotH = size.h - PAD.t - PAD.b;
  const [x0, x1] = view;
  const viewSpan = x1 - x0;

  const xScale = plotW / viewSpan;                       // px per m horizontal
  const elevSpan = ELEV_MAX - ELEV_MIN;
  const yScale = (plotH * vExag) / elevSpan;             // px per m vertical (stretched)
  const exaggeration = yScale / xScale;

  const xPx = useCallback((ch: number) => PAD.l + (ch - x0) * xScale, [PAD.l, x0, xScale]);
  const yPx = useCallback((e: number) => PAD.t + plotH - (e - ELEV_MIN) * yScale, [PAD.t, plotH, yScale]);

  /* visible index range for the current chainage window (binary search) */
  const idxRange = useMemo(() => {
    const xs = P.chainage_m;
    const find = (v: number) => { let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m; else hi = m; } return lo; };
    return [Math.max(0, find(x0) - 1), Math.min(xs.length - 1, find(x1) + 1)] as [number, number];
  }, [x0, x1]);

  /* ── draw ── */
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    cv.style.width = `${size.w}px`; cv.style.height = `${size.h}px`;
    const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);

    // plot clip
    g.save();
    g.beginPath(); g.rect(PAD.l, PAD.t, plotW, plotH); g.clip();

    const [i0, i1] = idxRange;

    // grid
    g.strokeStyle = '#1e293b'; g.lineWidth = 1; g.fillStyle = '#475569'; g.font = '10px ui-monospace, monospace';
    const eStep = elevSpan > 900 ? 200 : 100;
    for (let e = Math.ceil(ELEV_MIN / eStep) * eStep; e <= ELEV_MAX; e += eStep) {
      const y = yPx(e); g.beginPath(); g.moveTo(PAD.l, y); g.lineTo(PAD.l + plotW, y); g.stroke();
    }
    const kmSpan = viewSpan / 1000;
    const xStep = (kmSpan > 400 ? 100 : kmSpan > 150 ? 50 : kmSpan > 60 ? 20 : kmSpan > 20 ? 10 : 5) * 1000;
    for (let x = Math.ceil(x0 / xStep) * xStep; x <= x1; x += xStep) {
      const px = xPx(x); g.beginPath(); g.moveTo(px, PAD.t); g.lineTo(px, PAD.t + plotH); g.stroke();
    }

    // diameter band ribbon
    if (layers.diameter) {
      const bandY = PAD.t + plotH - 6, bandH = 6;
      for (let i = i0; i < i1; i++) {
        g.fillStyle = diamColor(P.diam_mm[i]);
        g.fillRect(xPx(P.chainage_m[i]), bandY, Math.max(1, xPx(P.chainage_m[i + 1]) - xPx(P.chainage_m[i]) + 0.5), bandH);
      }
    }

    // ground / pipe elevation — filled area
    g.beginPath(); g.moveTo(xPx(P.chainage_m[i0]), PAD.t + plotH);
    for (let i = i0; i <= i1; i++) g.lineTo(xPx(P.chainage_m[i]), yPx(P.elev_m[i]));
    g.lineTo(xPx(P.chainage_m[i1]), PAD.t + plotH); g.closePath();
    g.fillStyle = 'rgba(71,85,105,0.35)'; g.fill();
    g.beginPath();
    for (let i = i0; i <= i1; i++) { const x = xPx(P.chainage_m[i]), y = yPx(P.elev_m[i]); i === i0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.strokeStyle = '#94a3b8'; g.lineWidth = 1.25; g.stroke();

    // pressure head fill between HGL and ground
    if (layers.pressure) {
      g.beginPath();
      for (let i = i0; i <= i1; i++) { const x = xPx(P.chainage_m[i]), y = yPx(P.head_m[i]); i === i0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      for (let i = i1; i >= i0; i--) g.lineTo(xPx(P.chainage_m[i]), yPx(P.elev_m[i]));
      g.closePath(); g.fillStyle = 'rgba(79,142,247,0.14)'; g.fill();
    }

    // model HGL line
    if (layers.hgl) {
      g.beginPath();
      for (let i = i0; i <= i1; i++) { const x = xPx(P.chainage_m[i]), y = yPx(P.head_m[i]); i === i0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.strokeStyle = '#4f8ef7'; g.lineWidth = 1.75; g.stroke();
    }

    // anomaly / high-point markers
    if (layers.anomalies) {
      for (const a of P.anomalies) {
        const x = xPx(a.chainage_m); if (x < PAD.l - 6 || x > PAD.l + plotW + 6) continue;
        const y = yPx(a.elev_m + P.meta.minResidual_m);
        g.fillStyle = '#f59e0b';
        g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y + 3); g.lineTo(x - 4, y + 3); g.closePath(); g.fill();
      }
    }

    // measured HGL markers + deviation whiskers (only where computed)
    if (layers.measured) {
      for (const r of rows) {
        if (r.chainage_m == null || r.measuredHGL_m == null || r.modelHGL_m == null) continue;
        const x = xPx(r.chainage_m); if (x < PAD.l - 6 || x > PAD.l + plotW + 6) continue;
        const ym = yPx(r.modelHGL_m), ymeas = yPx(r.measuredHGL_m);
        g.strokeStyle = r.band ? BAND_COLORS[r.band] : '#64748b'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, ym); g.lineTo(x, ymeas); g.stroke();
        g.fillStyle = r.band ? BAND_COLORS[r.band] : '#94a3b8';
        g.beginPath(); g.arc(x, ymeas, 3.2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#0f1117'; g.lineWidth = 1; g.stroke();
      }
    }

    // site drop-lines + markers
    if (layers.sites) {
      for (const s of P.sites) {
        const x = xPx(s.chainage_m); if (x < PAD.l - 2 || x > PAD.l + plotW + 2) continue;
        const y = yPx(s.elev_m);
        g.strokeStyle = s.unconfirmed ? '#f59e0b' : '#64748b';
        g.lineWidth = 1;
        if (s.unconfirmed) g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(x, PAD.t + 2); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
        g.fillStyle = s.unconfirmed ? '#f59e0b' : '#93c5fd';
        g.beginPath(); g.arc(x, y, 3.4, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#0f1117'; g.lineWidth = 1; g.stroke();
      }
    }

    // hover crosshair
    if (hover) {
      const x = xPx(hover.ch);
      if (x >= PAD.l && x <= PAD.l + plotW) {
        g.strokeStyle = 'rgba(226,232,240,0.4)'; g.lineWidth = 1; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(x, PAD.t); g.lineTo(x, PAD.t + plotH); g.stroke(); g.setLineDash([]);
      }
    }
    g.restore();

    // y axis labels
    g.fillStyle = '#64748b'; g.font = '10px ui-monospace, monospace'; g.textAlign = 'right';
    for (let e = Math.ceil(ELEV_MIN / eStep) * eStep; e <= ELEV_MAX; e += eStep) {
      const y = yPx(e); if (y > PAD.t && y < PAD.t + plotH) g.fillText(String(e), PAD.l - 6, y + 3);
    }
    // x axis labels
    g.textAlign = 'center';
    for (let x = Math.ceil(x0 / xStep) * xStep; x <= x1; x += xStep) {
      const px = xPx(x); if (px > PAD.l && px < PAD.l + plotW) g.fillText(`${(x / 1000).toFixed(0)}`, px, PAD.t + plotH + 16);
    }
    g.fillText('chainage (km)', PAD.l + plotW / 2, size.h - 4);
  }, [size, view, vExag, hover, layers, rows, idxRange, xPx, yPx, plotW, plotH, PAD.l, PAD.t, PAD.r, PAD.b, x0, x1, viewSpan]);

  /* ── interaction ── */
  const chAtPx = (px: number) => x0 + (px - PAD.l) / xScale;
  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (drag) {
      const dch = (px - drag.x) / xScale;
      let nx0 = drag.view[0] - dch, nx1 = drag.view[1] - dch;
      if (nx0 < 0) { nx1 -= nx0; nx0 = 0; }
      if (nx1 > LEN_M) { nx0 -= (nx1 - LEN_M); nx1 = LEN_M; }
      setView([Math.max(0, nx0), Math.min(LEN_M, nx1)]);
    } else {
      setHover({ x: px, ch: Math.max(0, Math.min(LEN_M, chAtPx(px))) });
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const chAt = chAtPx(px);
    const factor = e.deltaY < 0 ? 0.82 : 1.22;
    let nSpan = Math.min(LEN_M, Math.max(2000, viewSpan * factor));
    let nx0 = chAt - (chAt - x0) * (nSpan / viewSpan);
    let nx1 = nx0 + nSpan;
    if (nx0 < 0) { nx1 -= nx0; nx0 = 0; }
    if (nx1 > LEN_M) { nx0 -= (nx1 - LEN_M); nx1 = LEN_M; }
    setView([Math.max(0, nx0), Math.min(LEN_M, nx1)]);
  };

  const hoverSample = useMemo(() => {
    if (!hover) return null;
    const xs = P.chainage_m; let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < hover.ch) lo = m; else hi = m; }
    const i = (hover.ch - xs[lo] < xs[hi] - hover.ch) ? lo : hi;
    return { ch: xs[i], elev: P.elev_m[i], hgl: P.head_m[i], press: P.pressure_m[i], flow: P.flow_m3h[i], dn: P.diam_mm[i], hp: P.hpFlags[i] === 1 };
  }, [hover]);

  const exportCSV = () => {
    const [i0, i1] = idxRange;
    let csv = 'chainage_m,elevation_masl,model_HGL_m,pressure_head_m,model_flow_m3h,diameter_mm,high_point\n';
    for (let i = i0; i <= i1; i++) csv += `${P.chainage_m[i]},${P.elev_m[i]},${P.head_m[i]},${P.pressure_m[i]},${P.flow_m3h[i]},${P.diam_mm[i]},${P.hpFlags[i]}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hydraulic_profile.csv'; a.click();
  };
  const exportPNG = () => {
    const a = document.createElement('a'); a.href = canvasRef.current!.toDataURL('image/png'); a.download = 'hydraulic_profile.png'; a.click();
  };
  const jumpTo = (ch: number) => {
    const span = Math.min(LEN_M, 60000);
    setView([Math.max(0, ch - span / 2), Math.min(LEN_M, ch + span / 2)]);
  };

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#0f1117' }}>
      {/* framing banner */}
      <div className="mb-3 px-3 py-2 rounded-lg flex items-start gap-2 text-xs"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-amber-200/90">
          <span className="font-semibold">Design-reference model output compared against synthetic demonstration data.</span>{' '}
          Not live telemetry. Not an operational system. The scheme is in detailed design — no plant is built and no SCADA exists.
          Every measured value shown is <span className="font-semibold">synthetic</span>.
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-200">Hydraulic Long-Section — Model vs Measured</h2>
          <p className="text-xs text-gray-500">
            MBALIKA {P.meta.horizon} EPANET model · Mbalika Intake → UDOM · {P.meta.tracedLength_km} km ·
            {' '}{fmt(P.meta.decimatedPoints)} pts (≤{P.meta.maxVerticalError_m} m error)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setView([0, LEN_M])} className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}><RotateCcw size={11} /> Reset</button>
          <button onClick={exportPNG} className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}><Download size={11} /> PNG</button>
          <button onClick={exportCSV} className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: '#1a2744', color: '#93c5fd', border: '1px solid #2e3250' }}><Download size={11} /> CSV</button>
        </div>
      </div>

      {/* status strip: solve mode, freshness, exaggeration */}
      <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
        <span className="px-2 py-1 rounded font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
          SOLVE: {summary.solveMode === 'live_boundary' ? 'live-boundary' : 'design steady-state'} — {summary.solveLabel}
        </span>
        <span className="px-2 py-1 rounded" style={{ background: '#111827', color: '#9ca3af', border: '1px solid #1e3a5f' }}>
          exaggeration ×{exaggeration.toFixed(0)} vertical
        </span>
        <span className="px-2 py-1 rounded" style={{ background: '#111827', color: '#9ca3af', border: '1px solid #1e3a5f' }}>
          SCADA cadence {summary.cadenceMin} min · {INSTRUMENTS.length} tags
        </span>
        <span className="px-2 py-1 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.25)' }}>
          HGL: {String(P.meta.hglMethod)}
        </span>
      </div>

      {/* chart */}
      <div ref={wrapRef} className="rounded-lg relative select-none" style={{ background: '#0b1220', border: '1px solid #1e3a5f' }}>
        <canvas ref={canvasRef}
          onMouseMove={onMove}
          onMouseLeave={() => { setHover(null); setDrag(null); }}
          onMouseDown={e => { const rect = canvasRef.current!.getBoundingClientRect(); setDrag({ x: e.clientX - rect.left, view }); }}
          onMouseUp={() => setDrag(null)}
          onWheel={onWheel}
          style={{ display: 'block', cursor: drag ? 'grabbing' : 'crosshair' }}
        />
        {/* hover tooltip */}
        {hover && hoverSample && (
          <div className="absolute pointer-events-none rounded-lg px-2 py-1.5 text-xs font-mono"
            style={{ left: Math.min(hover.x + 12, size.w - 170), top: 22, background: 'rgba(8,14,28,0.95)', border: '1px solid rgba(79,142,247,0.4)', color: '#e2e8f0', minWidth: 150 }}>
            <div className="text-gray-500">km {(hoverSample.ch / 1000).toFixed(2)}</div>
            <div>ground <span className="text-gray-200">{hoverSample.elev.toFixed(0)} m</span></div>
            <div>model HGL <span style={{ color: '#60a5fa' }}>{hoverSample.hgl.toFixed(0)} m</span></div>
            <div>pressure <span style={{ color: hoverSample.hp ? '#f59e0b' : '#4ade80' }}>{hoverSample.press.toFixed(0)} m</span></div>
            <div>flow <span className="text-cyan-300">{fmt(hoverSample.flow)} m³/h</span></div>
            <div>DN <span className="text-gray-300">{hoverSample.dn}</span>{hoverSample.hp && <span className="text-amber-400"> · high point</span>}</div>
          </div>
        )}
      </div>

      {/* controls row */}
      <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
        <div className="flex items-center gap-1.5">
          <Layers size={12} className="text-gray-500" />
          {([['diameter', 'DN bands'], ['pressure', 'Pressure fill'], ['hgl', 'Model HGL'], ['measured', 'Measured'], ['sites', 'Sites'], ['anomalies', 'High points']] as [keyof typeof layers, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setLayers(l => ({ ...l, [k]: !l[k] }))}
              className="px-1.5 py-0.5 rounded" style={{ background: layers[k] ? 'rgba(59,130,246,0.18)' : 'transparent', color: layers[k] ? '#93c5fd' : '#6b7280', border: `1px solid ${layers[k] ? 'rgba(96,165,250,0.4)' : '#2e3250'}` }}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">V-exag</span>
          <input type="range" min={0.6} max={4} step={0.1} value={vExag} onChange={e => setVExag(parseFloat(e.target.value))} style={{ width: 90 }} />
          <span className="text-gray-400 font-mono">×{exaggeration.toFixed(0)}</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer" title="Assume transducer at model node elevation — illustrative only, not survey data">
          <input type="checkbox" checked={illustrative} onChange={e => setIllustrative(e.target.checked)} />
          <FlaskConical size={12} className="text-amber-400" />
          <span className={illustrative ? 'text-amber-300' : 'text-gray-500'}>Illustrative head markers (model elev substituted)</span>
        </label>
      </div>
      {illustrative && (
        <div className="mt-1 px-2 py-1 rounded text-xs flex items-center gap-1.5" style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
          <AlertTriangle size={11} /> Measured-HGL markers use the model node elevation as a stand-in for the un-surveyed transducer elevation. Illustrative only — deviations are not authoritative.
        </div>
      )}

      {/* jump-to-site */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs">
        <MapPin size={12} className="text-gray-500" />
        {P.sites.map(s => (
          <button key={s.name} onClick={() => jumpTo(s.chainage_m)}
            className="px-1.5 py-0.5 rounded" style={{ background: '#111827', color: s.unconfirmed ? '#fbbf24' : '#93c5fd', border: `1px solid ${s.unconfirmed ? 'rgba(245,158,11,0.35)' : '#1e3a5f'}` }}
            title={`${s.name}${s.unconfirmed ? ' — low confidence position' : ''} · ${(s.chainage_m / 1000).toFixed(0)} km`}>
            {s.name.split(/[/ ]/)[0]}{s.unconfirmed ? ' ⚠' : ''}
          </button>
        ))}
      </div>

      {/* comparison panel */}
      <div className="mt-4">
        <ModelPerformance rows={rows} summary={summary} illustrative={illustrative} />
      </div>

      {/* provenance footer */}
      <div className="mt-3 px-3 py-2 rounded text-xs flex items-start gap-2" style={{ background: '#111827', border: '1px solid #1e3a5f' }}>
        <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <span className="text-gray-500">{String(P.meta.note)} Decimation: {String(P.meta.decimationMethod)}.</span>
      </div>
    </div>
  );
}
