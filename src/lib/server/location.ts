import type { RowDataPacket } from 'mysql2/promise';
import { queryRows } from '@/lib/server/mysql';

type Db = Parameters<typeof queryRows>[0];

export type LocationClassification = 'in_area' | 'outside_area';

// Santiago City (Isabela) is the approved in-area location.
// Nearby locations are not added until the client approves the exact list.
export function classifyLocation(
  cityMunicipality: string,
  province?: string | null,
): LocationClassification {
  const isSantiagoCity = /^(city of )?santiago( city)?$/i.test(cityMunicipality.trim());
  const provinceMatches = !province || /isabela/i.test(province);
  return isSantiagoCity && provinceMatches ? 'in_area' : 'outside_area';
}

// 10-digit PSGC code of the City of Santiago, Isabela (PSA PSGC listing).
export const SANTIAGO_CITY_PSGC = '0203135000';

async function loadSetting(db: Db, key: string): Promise<string> {
  const rows = await queryRows<{ setting_value: string } & RowDataPacket>(
    db,
    'SELECT setting_value FROM tbl_app_setting WHERE setting_key = ? LIMIT 1',
    [key],
  );
  return String(rows[0]?.setting_value ?? '').trim();
}

export async function loadInAreaCodes(db: Db): Promise<string[]> {
  const extra = (await loadSetting(db, 'inside_area_city_codes'))
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  return [SANTIAGO_CITY_PSGC, ...extra];
}

export async function isJobSiteAllowed(db: Db): Promise<boolean> {
  return (await loadSetting(db, 'allow_job_site_address')) === '1';
}

// Uses the PSGC city code when present; falls back to the name only for legacy addresses saved without codes.
export function classifyByCode(
  cityCode: string | null | undefined,
  cityName: string,
  province: string | null | undefined,
  inAreaCodes: string[],
): LocationClassification {
  if (cityCode) return inAreaCodes.includes(cityCode) ? 'in_area' : 'outside_area';
  return classifyLocation(cityName, province);
}

export async function loadOutsideCharge(db: Db): Promise<number | null> {
  const rows = await queryRows<{ setting_value: string } & RowDataPacket>(
    db,
    'SELECT setting_value FROM tbl_app_setting WHERE setting_key = ? LIMIT 1',
    ['outside_location_charge'],
  );
  const raw = rows[0]?.setting_value;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}