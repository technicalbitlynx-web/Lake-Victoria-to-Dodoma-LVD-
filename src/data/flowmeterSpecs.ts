/*
 * Bulk billing flowmeter register — one electromagnetic meter per offtake
 * (BS EN ISO 20456:2019). Live values come from the existing simulator tags:
 * instantaneous flow + totalised volume per meter.
 */

export interface FlowmeterSpec {
  id: string;
  name: string;
  siteId: string;
  flowTagId: string;   // instantaneous flow (m³/h)
  totTagId: string;    // totalised volume (m³)
  dn: number;
  chainage_km: number;
  lat: number;
  lng: number;
  meterType: string;
  duty: string;
}

const MAG = 'Electromagnetic · BS EN ISO 20456';

export const FLOWMETERS: FlowmeterSpec[] = [
  { id: 'FM-MAB-01', name: 'Mabale PR Offtake Billing Meter', siteId: 'MABALE_PR', flowTagId: 'MABALE_PR-FT-001', totTagId: 'MABALE_PR-FT-TOT', dn: 300, chainage_km: 63, lat: -2.99, lng: 33.79, meterType: MAG, duty: 'Bulk supply billing' },
  { id: 'FM-SHI-01', name: 'Shilembo Offtake Billing Meter', siteId: 'SHILEMBO_PR', flowTagId: 'SHILEMBO_PR-FT-001', totTagId: 'SHILEMBO_PR-FT-TOT', dn: 250, chainage_km: 120, lat: -3.42, lng: 34.08, meterType: MAG, duty: 'Bulk supply billing' },
  { id: 'FM-WIS-01', name: 'Wishiteleja Offtake Billing Meter', siteId: 'WISHITELEJA_PR', flowTagId: 'WISHITELEJA_PR-FT-001', totTagId: 'WISHITELEJA_PR-FT-TOT', dn: 300, chainage_km: 175, lat: -3.75, lng: 34.33, meterType: MAG, duty: 'Bulk supply billing' },
  { id: 'FM-ISA-01', name: 'Isalanda Offtake Billing Meter', siteId: 'ISALANDA_PR', flowTagId: 'ISALANDA_PR-FT-001', totTagId: 'ISALANDA_PR-FT-TOT', dn: 250, chainage_km: 470, lat: -5.45, lng: 35.58, meterType: MAG, duty: 'Bulk supply billing' },
  { id: 'FM-MKW-01', name: 'Mkwese Offtake Billing Meter', siteId: 'MKWESE_PR', flowTagId: 'MKWESE_PR-FT-001', totTagId: 'MKWESE_PR-FT-TOT', dn: 250, chainage_km: 510, lat: -5.70, lng: 35.68, meterType: MAG, duty: 'Bulk supply billing' },
  { id: 'FM-BAH-01', name: 'Bahi Offtake Billing Meter', siteId: 'BAHI_PR', flowTagId: 'BAHI_PR-FT-001', totTagId: 'BAHI_PR-FT-TOT', dn: 300, chainage_km: 545, lat: -5.95, lng: 35.36, meterType: MAG, duty: 'Bulk supply billing' },
  { id: 'FM-SGD-01', name: 'Singida Offtake Billing Meter', siteId: 'SINGIDA_PS', flowTagId: 'SINGIDA_PS-FT-001', totTagId: 'SINGIDA_PS-FT-TOT', dn: 700, chainage_km: 370, lat: -4.82, lng: 34.78, meterType: MAG, duty: 'Bulk supply billing (pumped branch)' },
  { id: 'FM-KWM-A', name: 'Kwamtoro Billing Meter — Kondoa Leg', siteId: 'KWAMTORO_JCT', flowTagId: 'KWAMTORO_JCT-FT-KONDOA', totTagId: 'KWAMTORO_JCT-FT-KONDOA-TOT', dn: 500, chainage_km: 420, lat: -4.99, lng: 35.48, meterType: MAG, duty: 'Bulk supply billing (dual offtake)' },
  { id: 'FM-KWM-B', name: 'Kwamtoro Billing Meter — Chemba Leg', siteId: 'KWAMTORO_JCT', flowTagId: 'KWAMTORO_JCT-FT-CHEMBA', totTagId: 'KWAMTORO_JCT-FT-CHEMBA-TOT', dn: 600, chainage_km: 420, lat: -5.02, lng: 35.48, meterType: MAG, duty: 'Bulk supply billing (dual offtake)' },
];

export const FLOWMETERS_BY_SITE = (siteId: string) => FLOWMETERS.filter(f => f.siteId === siteId);
