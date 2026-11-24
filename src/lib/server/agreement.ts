import type { RowDataPacket } from 'mysql2/promise';
import { queryRows } from '@/lib/server/mysql';

type Db = Parameters<typeof queryRows>[0];

// Eligibility rules for the Service Order Agreement PDF.
// The statuses and threshold are proposed defaults that await client approval
// An order exactly at the threshold qualifies.
export const AGREEMENT_ELIGIBLE_STATUSES = [
  'In Pre-Press',
  'In Production',
  'Ready for Pickup',
  'Completed',
] as const;

export async function loadAgreementRules(db: Db): Promise<{
  threshold: number;
  statuses: string[];
  includesLocationCharge: boolean;
  thresholdInclusive: boolean;
}> {
  const rows = await queryRows<{ setting_key: string; setting_value: string } & RowDataPacket>(
    db,
    `SELECT setting_key, setting_value FROM tbl_app_setting WHERE setting_key IN (
       'agreement_threshold', 'agreement_statuses',
       'agreement_threshold_includes_location_charge', 'agreement_threshold_inclusive'
     )`,
  );
  const threshold = Number(rows.find((row) => row.setting_key === 'agreement_threshold')?.setting_value ?? 5000);
  const statusText = rows.find((row) => row.setting_key === 'agreement_statuses')?.setting_value ?? '';
  const statuses = statusText.split(',').map((status) => status.trim()).filter(Boolean);
  return {
    threshold: Number.isFinite(threshold) ? threshold : 5000,
    statuses: statuses.length ? statuses : [...AGREEMENT_ELIGIBLE_STATUSES],
    includesLocationCharge:
      rows.find((row) => row.setting_key === 'agreement_threshold_includes_location_charge')?.setting_value !== '0',
    thresholdInclusive:
      rows.find((row) => row.setting_key === 'agreement_threshold_inclusive')?.setting_value !== '0',
  };
}

export function isAgreementEligible(
  status: string,
  total: number,
  threshold: number,
  statuses: readonly string[] = AGREEMENT_ELIGIBLE_STATUSES,
  locationCharge = 0,
  includesLocationCharge = true,
  thresholdInclusive = true,
): boolean {
  if (!Number.isFinite(total) || !Number.isFinite(threshold)) return false;
  const amount = includesLocationCharge ? total : total - locationCharge;
  return statuses.includes(status) && (thresholdInclusive ? amount >= threshold : amount > threshold);
}