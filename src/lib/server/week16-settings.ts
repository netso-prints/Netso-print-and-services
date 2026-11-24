import type { RowDataPacket } from 'mysql2/promise';
import { queryRows } from '@/lib/server/mysql';
import { parseSignageRules, SIGNAGE_TYPES, type SignageRule, type SignageType } from '@/lib/signage';
import { ApiError } from '@/lib/server/http';

type Db = Parameters<typeof queryRows>[0];

export const ORDER_STATUSES = [
  'Unpaid Balance',
  'In Pre-Press',
  'In Production',
  'Ready for Pickup',
  'Completed',
  'Cancelled',
] as const;

export interface Week16Settings {
  outsideLocationCharge: number;
  agreementThreshold: number;
  agreementThresholdIncludesLocationCharge: boolean;
  agreementThresholdInclusive: boolean;
  agreementStatuses: string[];
  agreementTerms: string;
  agreementTermsVersion: string;
  insideAreaCityCodes: string[];
  allowJobSiteAddress: boolean;
  unnamedStreetFallback: string;
  unnumberedPremisesFallback: string;
  prefillPartialLegacyAddresses: boolean;
  signageRules: Record<SignageType, SignageRule>;
}

export interface AddressPolicySettings {
  unnamedStreetFallback: string;
  unnumberedPremisesFallback: string;
  prefillPartialLegacyAddresses: boolean;
}

const DEFAULT_AGREEMENT_TERMS =
  'The parties confirm the saved order specifications and amount. NETSO may proceed only after production authorization.';
const DEFAULT_UNNAMED_STREET_FALLBACK =
  'If there is no named street, enter a clear location description.';
const DEFAULT_UNNUMBERED_PREMISES_FALLBACK =
  'If the premises have no number, enter a clear house or premises description.';

export async function loadAddressPolicySettings(db: Db): Promise<AddressPolicySettings> {
  const rows = await queryRows<{ setting_key: string; setting_value: string } & RowDataPacket>(
    db,
    `SELECT setting_key, setting_value FROM tbl_app_setting
     WHERE setting_key IN (
       'unnamed_street_fallback', 'unnumbered_premises_fallback',
       'prefill_partial_legacy_addresses'
     )`,
  );
  const settings = new Map(rows.map((row) => [row.setting_key, String(row.setting_value ?? '')]));
  return {
    unnamedStreetFallback:
      settings.get('unnamed_street_fallback')?.trim() || DEFAULT_UNNAMED_STREET_FALLBACK,
    unnumberedPremisesFallback:
      settings.get('unnumbered_premises_fallback')?.trim() || DEFAULT_UNNUMBERED_PREMISES_FALLBACK,
    prefillPartialLegacyAddresses: settings.get('prefill_partial_legacy_addresses') === '1',
  };
}

export async function loadWeek16Settings(db: Db): Promise<Week16Settings> {
  const rows = await queryRows<{ setting_key: string; setting_value: string } & RowDataPacket>(
    db,
    `SELECT setting_key, setting_value FROM tbl_app_setting
     WHERE setting_key IN (
       'outside_location_charge', 'agreement_threshold', 'agreement_statuses',
       'agreement_threshold_includes_location_charge', 'agreement_threshold_inclusive',
       'agreement_terms', 'agreement_terms_version', 'inside_area_city_codes',
       'allow_job_site_address', 'unnamed_street_fallback',
       'unnumbered_premises_fallback', 'prefill_partial_legacy_addresses', 'signage_rules'
     )`,
  );
  const settings = new Map(rows.map((row) => [row.setting_key, String(row.setting_value ?? '')]));
  const readNumber = (key: string, fallback: number) => {
    const raw = settings.get(key);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiError(500, `The ${key.replace(/_/g, ' ')} setting is invalid.`);
    }
    return value;
  };
  const cityCodes = (settings.get('inside_area_city_codes') ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  if (cityCodes.some((code) => !/^\d{10}$/.test(code))) {
    throw new ApiError(500, 'The in-area city list contains an invalid PSGC code.');
  }

  let signageRules: Record<SignageType, SignageRule> = SIGNAGE_TYPES;
  const rawSignageRules = settings.get('signage_rules');
  if (rawSignageRules) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawSignageRules);
    } catch {
      throw new ApiError(500, 'Saved signage rules are not valid JSON.');
    }
    const parsedRules = parseSignageRules(decoded);
    if (!parsedRules) throw new ApiError(500, 'Saved signage rules are invalid.');
    signageRules = parsedRules;
  }

  const agreementStatuses = (settings.get('agreement_statuses') ?? '')
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean);

  return {
    outsideLocationCharge: readNumber('outside_location_charge', 0),
    agreementThreshold: readNumber('agreement_threshold', 5000),
    agreementThresholdIncludesLocationCharge:
      settings.get('agreement_threshold_includes_location_charge') !== '0',
    agreementThresholdInclusive: settings.get('agreement_threshold_inclusive') !== '0',
    agreementStatuses: agreementStatuses.length
      ? agreementStatuses
      : ['In Pre-Press', 'In Production', 'Ready for Pickup', 'Completed'],
    agreementTerms: settings.get('agreement_terms')?.trim() || DEFAULT_AGREEMENT_TERMS,
    agreementTermsVersion: settings.get('agreement_terms_version')?.trim() || 'draft-1',
    insideAreaCityCodes: [...new Set(cityCodes)],
    allowJobSiteAddress: settings.get('allow_job_site_address') === '1',
    unnamedStreetFallback:
      settings.get('unnamed_street_fallback')?.trim() || DEFAULT_UNNAMED_STREET_FALLBACK,
    unnumberedPremisesFallback:
      settings.get('unnumbered_premises_fallback')?.trim() || DEFAULT_UNNUMBERED_PREMISES_FALLBACK,
    prefillPartialLegacyAddresses: settings.get('prefill_partial_legacy_addresses') === '1',
    signageRules,
  };
}
