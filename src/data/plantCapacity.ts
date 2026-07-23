/*
 * Mbalika Water Treatment Plant capacity basis (DDR).
 *
 * Capacity cascade:
 *   Raw abstraction   640 MLD (26,700 m³/h) into the plant
 *   − 5% process loss  ⇒ 608 MLD (25,333 m³/h) treated output
 *   − 2% conveyance    ⇒ 598 MLD (24,917 m³/h) delivered to the transmission main
 *
 * DDR capacity rule: intake capacity = usable output + 7%, the 7% splitting
 * into 5% treatment loss and 2% conveyance loss. So 640 MLD raw resolves to
 * ~598 MLD usable delivery.
 *
 * Plant arrangement: 10 duty process streams, each 64 MLD (2,670 m³/h), with
 * redundancy layered on top (12 IPS N+2, 18 flocculators, 10+10 pumps 9d/1s).
 */

export const PLANT_CAPACITY = {
  raw: { mld: 640, m3h: 26700, m3d: 640000 },
  treated: { mld: 608, m3h: 25333, m3d: 608000 },
  delivery: { mld: 598, m3h: 24917, m3d: 598000 },

  processLossPct: 5,        // treatment losses (raw → treated)
  conveyanceLossPct: 2,     // conveyance losses (treated → delivered)
  intakeMarginPct: 7,       // intake = usable + 7%

  streams: { duty: 10, perStreamMld: 64, perStreamM3h: 2670 },

  ips: {   // inclined plate settlers
    total: 12, duty: 10, standby: 2, redundancy: 'N+2',
    dims: '17 m × 8.5 m × 5.5 m', surfaceLoading_mh: 10,
  },
  flocculation: { trains: 6, stagesPerTrain: 3, totalUnits: 18 },

  rawPumps: { total: 10, duty: 9, standby: 1, perPumpM3h: Math.round(26700 / 9) },
  highLiftPumps: { total: 10, duty: 9, standby: 1, perPumpM3h: Math.round(25333 / 9) },
} as const;

/** Derive the live cascade from a measured raw-water inflow (m³/h). */
export function cascadeFrom(rawM3h: number) {
  const treated = rawM3h * (1 - PLANT_CAPACITY.processLossPct / 100);
  const delivery = treated * (PLANT_CAPACITY.delivery.mld / PLANT_CAPACITY.treated.mld);
  return {
    raw: rawM3h,
    treated,
    delivery,
    processLoss: rawM3h - treated,
    conveyanceLoss: treated - delivery,
  };
}

/** m³/h → MLD (million litres per day). */
export const toMLD = (m3h: number) => (m3h * 24) / 1000;
