import React from 'react';

type PumpStatus = 'running' | 'stopped' | 'fault' | 'standby';
type PumpType3D = 'VTP' | 'HSC' | 'DSV' | 'SUBMERSIBLE';

interface PumpProps {
  status: PumpStatus;
  pumpType: PumpType3D;
  size?: number;
  pumpNumber?: number;
  isStandby?: boolean;
  rpm?: number;
}

const STATUS_COLORS: Record<PumpStatus, { primary: string; glow: string; light: string }> = {
  running:  { primary: '#22c55e', glow: 'rgba(34,197,94,0.5)',  light: '#bbf7d0' },
  stopped:  { primary: '#6b7280', glow: 'rgba(107,114,128,0.3)', light: '#d1d5db' },
  fault:    { primary: '#ef4444', glow: 'rgba(239,68,68,0.6)',   light: '#fecaca' },
  standby:  { primary: '#f59e0b', glow: 'rgba(245,158,11,0.4)', light: '#fde68a' },
};

/* ── Vertical Turbine Pump (VTP) ── */
function VTPPump({ status, size = 100, rpm = 0 }: { status: PumpStatus; size: number; rpm: number }) {
  const col = STATUS_COLORS[status];
  const spinning = status === 'running';
  const animDur = rpm > 0 ? `${60 / rpm}s` : '1.2s';

  return (
    <svg width={size} height={size * 1.5} viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`vtpMotor-${status}`} cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#4b5563" />
          <stop offset="100%" stopColor="#111827" />
        </radialGradient>
        <radialGradient id={`vtpCasing-${status}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#374151" />
          <stop offset="100%" stopColor="#1f2937" />
        </radialGradient>
        <linearGradient id={`vtpShaft-${status}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6b7280" />
          <stop offset="50%" stopColor="#d1d5db" />
          <stop offset="100%" stopColor="#4b5563" />
        </linearGradient>
        <filter id={`vtpGlow-${status}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id={`vtpDischarge-${status}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="50%" stopColor="#2563eb" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#1e3a5f" />
        </linearGradient>
        <clipPath id={`vtpColClip-${status}`}>
          <rect x="34" y="72" width="12" height="38" rx="2" />
        </clipPath>
      </defs>

      {/* Underground column pipe (extends down) */}
      <rect x="33" y="72" width="14" height="38" rx="2" fill="url(#vtpShaft-running)" opacity="0.7" />
      <rect x="35" y="72" width="2" height="38" fill="#9ca3af" opacity="0.4" />
      {/* Water rising up the column when pumping */}
      {spinning && (
        <g clipPath={`url(#vtpColClip-${status})`}>
          {[0, 0.5].map(delay => (
            <rect key={delay} x="34" y="98" width="12" height="12" rx="3" fill="#60a5fa" opacity="0.35"
              style={{ animation: `colFlowUp 1s linear ${delay}s infinite` }} />
          ))}
        </g>
      )}

      {/* Pump base / sump flange */}
      <ellipse cx="40" cy="110" rx="20" ry="4" fill="#111827" stroke="#374151" strokeWidth="1" />
      <rect x="22" y="108" width="36" height="5" rx="1" fill="#1f2937" stroke="#374151" strokeWidth="1" />

      {/* Discharge elbow pipe (horizontal) */}
      <path d="M54 68 Q66 68 66 56 L66 48" stroke="#374151" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M54 68 Q66 68 66 56 L66 48" stroke="url(#vtpDischarge-running)" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* Flange on discharge */}
      <rect x="62" y="44" width="8" height="6" rx="1" fill="#374151" stroke="#4b5563" strokeWidth="0.5" />

      {/* Motor body — cylindrical */}
      <rect x="22" y="28" width="36" height="42" rx="8" fill="url(#vtpMotor-running)" stroke="#374151" strokeWidth="1" />
      {/* Motor ribs */}
      {[34, 40, 46, 52, 58].map(y => (
        <rect key={y} x="22" y={y} width="36" height="3" rx="0" fill="none" stroke="#4b5563" strokeWidth="0.8" />
      ))}
      {/* Motor highlight */}
      <rect x="24" y="30" width="12" height="36" rx="4" fill="white" opacity="0.04" />

      {/* Pump head / volute at top of column */}
      <ellipse cx="40" cy="70" rx="18" ry="5" fill="#1f2937" stroke="#374151" strokeWidth="1" />

      {/* Cooling fan housing (top of motor) */}
      <rect x="28" y="18" width="24" height="12" rx="4" fill="#1f2937" stroke="#374151" strokeWidth="0.8" />
      {/* Fan blades animation — SMIL rotate composes with the translate so the hub stays centred */}
      <g transform="translate(40,24)">
        {spinning && (
          <animateTransform attributeName="transform" type="rotate" from="0" to="360"
            dur={animDur} repeatCount="indefinite" additive="sum" />
        )}
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
          <line key={angle} x1="0" y1="0" x2={Math.cos(angle * Math.PI / 180) * 7} y2={Math.sin(angle * Math.PI / 180) * 7}
            stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
        ))}
        <circle cx="0" cy="0" r="2.5" fill="#374151" stroke="#6b7280" strokeWidth="0.5" />
      </g>

      {/* Terminal box */}
      <rect x="22" y="52" width="8" height="6" rx="1" fill="#1f2937" stroke="#4b5563" strokeWidth="0.8" />

      {/* Status indicator light */}
      <circle cx="40" cy="24" r="3.5" fill={col.primary} filter={`url(#vtpGlow-${status})`} />
      <circle cx="40" cy="24" r="2" fill={col.light} opacity="0.8" />
      {/* Pulsing ring when running */}
      {spinning && (
        <circle cx="40" cy="24" r="5" fill="none" stroke={col.primary} strokeWidth="1"
          style={{ animation: 'ping 1.5s ease-out infinite', transformOrigin: '40px 24px' }} />
      )}

      {/* Name plate */}
      <rect x="26" y="44" width="16" height="8" rx="1" fill="#0f172a" stroke="#1e3a5f" strokeWidth="0.5" />
      <text x="34" y="50" fontSize="4" fill="#60a5fa" textAnchor="middle" fontFamily="monospace">VTP</text>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ping { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2.2); opacity: 0; } }
        @keyframes colFlowUp { 0% { transform: translateY(14px); } 100% { transform: translateY(-42px); } }
      `}</style>
    </svg>
  );
}

/* ── Double Suction Volute / Horizontal Split Case ── */
function HSCPump({ status, size = 100, rpm = 0 }: { status: PumpStatus; size: number; rpm: number }) {
  const col = STATUS_COLORS[status];
  const spinning = status === 'running';
  const animDur = rpm > 0 ? `${60 / rpm}s` : '1.2s';

  return (
    <svg width={size * 1.3} height={size} viewBox="0 0 130 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`hscMotor-${status}`} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#4b5563" />
          <stop offset="100%" stopColor="#111827" />
        </radialGradient>
        <radialGradient id={`hscVolute-${status}`} cx="40%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0f1117" />
        </radialGradient>
        <linearGradient id={`hscShaft-${status}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#9ca3af" />
          <stop offset="50%" stopColor="#e5e7eb" />
          <stop offset="100%" stopColor="#6b7280" />
        </linearGradient>
        <filter id={`hscGlow-${status}`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Base plate */}
      <rect x="8" y="82" width="114" height="6" rx="2" fill="#111827" stroke="#374151" strokeWidth="1" />
      <rect x="14" y="79" width="6" height="6" rx="1" fill="#1f2937" stroke="#374151" strokeWidth="0.5" />
      <rect x="110" y="79" width="6" height="6" rx="1" fill="#1f2937" stroke="#374151" strokeWidth="0.5" />

      {/* Motor */}
      <rect x="68" y="28" width="50" height="52" rx="10" fill="url(#hscMotor-running)" stroke="#374151" strokeWidth="1" />
      {/* Motor cooling ribs */}
      {[38, 44, 50, 56, 62, 68, 74].map(y => (
        <rect key={y} x="68" y={y} width="50" height="3" rx="0" fill="none" stroke="#374151" strokeWidth="0.8" />
      ))}
      <rect x="70" y="30" width="14" height="46" rx="5" fill="white" opacity="0.04" />
      {/* Motor end cap */}
      <ellipse cx="118" cy="54" rx="6" ry="22" fill="#1f2937" stroke="#374151" strokeWidth="1" />

      {/* Coupling guard */}
      <rect x="58" y="40" width="12" height="28" rx="3" fill="#1f2937" stroke="#4b5563" strokeWidth="0.8" />
      {/* Shaft going through coupling */}
      <rect x="63" y="38" width="4" height="32" rx="1" fill="url(#hscShaft-running)" />

      {/* Pump volute (spiral casing) */}
      <ellipse cx="38" cy="54" rx="28" ry="26" fill="url(#hscVolute-running)" stroke="#1e3a5f" strokeWidth="1.5" />
      <ellipse cx="38" cy="54" rx="22" ry="20" fill="#0d1b2a" stroke="#1e3a5f" strokeWidth="1" />
      {/* Impeller (visible from side) — SMIL rotate keeps it centred in the volute */}
      <g transform="translate(38,54)">
        {spinning && (
          <animateTransform attributeName="transform" type="rotate" from="0" to="360"
            dur={animDur} repeatCount="indefinite" additive="sum" />
        )}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <path key={i}
            d={`M0,0 C${Math.cos((angle + 20) * Math.PI / 180) * 8},${Math.sin((angle + 20) * Math.PI / 180) * 8} ${Math.cos((angle + 40) * Math.PI / 180) * 14},${Math.sin((angle + 40) * Math.PI / 180) * 14} ${Math.cos(angle * Math.PI / 180) * 17},${Math.sin(angle * Math.PI / 180) * 17}`}
            fill="#1e3a5f" stroke="#2563eb" strokeWidth="1.2" />
        ))}
        <circle cx="0" cy="0" r="4" fill="#374151" stroke="#4b5563" strokeWidth="1" />
      </g>
      {/* Volute tongue / cutwater */}
      <path d="M38 28 Q58 32 62 54" stroke="#1e3a5f" strokeWidth="2" fill="none" />

      {/* Discharge nozzle (top) */}
      <rect x="32" y="10" width="12" height="18" rx="2" fill="#1e3a5f" stroke="#374151" strokeWidth="1" />
      <rect x="28" y="8" width="20" height="6" rx="2" fill="#374151" stroke="#4b5563" strokeWidth="0.8" />
      {/* Flow in discharge */}
      {spinning && (
        <rect x="34" y="12" width="8" height="14" rx="1" fill="#2563eb" opacity="0.2"
          style={{ animation: 'flowPulse 1s ease-in-out infinite' }} />
      )}

      {/* Suction nozzle (bottom) */}
      <rect x="32" y="72" width="12" height="10" rx="2" fill="#1e3a5f" stroke="#374151" strokeWidth="1" />
      <rect x="28" y="80" width="20" height="5" rx="2" fill="#374151" stroke="#4b5563" strokeWidth="0.8" />

      {/* Stuffing box / mechanical seal */}
      <rect x="58" y="49" width="5" height="10" rx="1" fill="#374151" stroke="#4b5563" strokeWidth="0.5" />

      {/* Status light */}
      <circle cx="93" cy="32" r="4" fill={col.primary} filter={`url(#hscGlow-${status})`} />
      <circle cx="93" cy="32" r="2.5" fill={col.light} opacity="0.85" />
      {spinning && (
        <circle cx="93" cy="32" r="6" fill="none" stroke={col.primary} strokeWidth="1"
          style={{ animation: 'ping 1.5s ease-out infinite', transformOrigin: '93px 32px' }} />
      )}

      {/* Name plate on motor */}
      <rect x="78" y="58" width="22" height="10" rx="1.5" fill="#0f172a" stroke="#1e3a5f" strokeWidth="0.5" />
      <text x="89" y="64" fontSize="4" fill="#60a5fa" textAnchor="middle" fontFamily="monospace">CWPS</text>
      <text x="89" y="68" fontSize="3" fill="#4b5563" textAnchor="middle" fontFamily="monospace">DSV</text>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ping { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes flowPulse { 0%,100% { opacity: 0.15; } 50% { opacity: 0.35; } }
      `}</style>
    </svg>
  );
}

/* ── Main export ── */
export default function Pump3D({ status, pumpType, size = 80, pumpNumber, isStandby, rpm }: PumpProps) {
  const resolvedRpm = rpm ?? (status === 'running' ? 1450 : 0);

  if (pumpType === 'VTP') {
    return <VTPPump status={status} size={size} rpm={resolvedRpm} />;
  }
  return <HSCPump status={status} size={size} rpm={resolvedRpm} />;
}

export { STATUS_COLORS };
export type { PumpStatus };
