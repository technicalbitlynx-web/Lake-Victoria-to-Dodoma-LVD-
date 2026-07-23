/*
 * Deviation banding — shared by the Load-Sharing and Sync-Link screens.
 * All thresholds live here, not scattered through components.
 *
 * Instrument accuracy is ±0.5% of reading for electromagnetic flow meters
 * (BS EN ISO 20456:2019) and level transmitters. A deviation smaller than the
 * instrument uncertainty is NOT a real deviation and must never be coloured as
 * a fault — it is classified `within_uncertainty` and shown neutral.
 */

export const DEVIATION_CONFIG = {
  instrumentAccuracyPct: 0.5,   // ±0.5% of reading — the uncertainty floor
  acceptablePct: 3,             // within normal operating tolerance (load share)
  investigatePct: 8,            // outside tolerance, below alarm
  // beyond investigatePct → significant
  syncAcceptableHz: 0.2,        // speed-tracking tolerance
  syncInvestigateHz: 0.5,
} as const;

export type Band = 'within_uncertainty' | 'acceptable' | 'investigate' | 'significant';

export const BAND_COLORS: Record<Band, string> = {
  within_uncertainty: '#64748b', // neutral slate — carries no information
  acceptable: '#22c55e',
  investigate: '#f59e0b',
  significant: '#ef4444',
};

export const BAND_LABELS: Record<Band, string> = {
  within_uncertainty: 'Within uncertainty',
  acceptable: 'Acceptable',
  investigate: 'Investigate',
  significant: 'Significant',
};

/** Classify a percentage deviation against the ±0.5%-of-reading uncertainty floor. */
export function classifyDeviationPct(deviationPct: number): Band {
  const abs = Math.abs(deviationPct);
  if (abs <= DEVIATION_CONFIG.instrumentAccuracyPct) return 'within_uncertainty';
  if (abs <= DEVIATION_CONFIG.acceptablePct) return 'acceptable';
  if (abs <= DEVIATION_CONFIG.investigatePct) return 'investigate';
  return 'significant';
}

/** Classify a speed-tracking deviation in Hz. */
export function classifySyncHz(deviationHz: number): Band {
  const abs = Math.abs(deviationHz);
  if (abs <= DEVIATION_CONFIG.syncAcceptableHz * 0.4) return 'within_uncertainty';
  if (abs <= DEVIATION_CONFIG.syncAcceptableHz) return 'acceptable';
  if (abs <= DEVIATION_CONFIG.syncInvestigateHz) return 'investigate';
  return 'significant';
}

/** Uncertainty band (± value) for a reading, in reading units. */
export function uncertaintyOf(reading: number): number {
  return Math.abs(reading) * DEVIATION_CONFIG.instrumentAccuracyPct / 100;
}
