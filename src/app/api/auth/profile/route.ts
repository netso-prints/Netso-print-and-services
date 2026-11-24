import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSessionToken,
  displayUser,
  requireSession,
  setSessionCookie,
  type SessionUser,
} from '@/lib/server/auth';
import { apiErrorResponse, ApiError, assertSameOrigin, readJson } from '@/lib/server/http';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { mysqlPool, queryRows } from '@/lib/server/mysql';
import { recordAuditEvent } from '@/lib/server/audit';
import {
  SANTIAGO_CITY_PSGC,
  classifyByCode,
  isJobSiteAllowed,
  loadInAreaCodes,
  loadOutsideCharge,
} from '@/lib/server/location';
import { loadAddressPolicySettings } from '@/lib/server/week16-settings';

export const runtime = 'nodejs';

const schema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9._-]+$/),
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(12).max(128).optional(),
  address: z.object({
    region: z.string().trim().min(1).max(100),
    regionCode: z.string().trim().min(1).max(20),
    province: z.string().trim().max(100).optional(),
    provinceCode: z.string().trim().max(20).optional(),
    cityMunicipality: z.string().trim().min(1).max(100),
    cityMunicipalityCode: z.string().trim().min(1).max(20),
    barangay: z.string().trim().min(1).max(100),
    barangayCode: z.string().trim().min(1).max(20),
    street: z.string().trim().min(1).max(150),
    houseUnit: z.string().trim().min(1).max(150),
    subdivision: z.string().trim().max(150).optional(),
    postalCode: z.string().trim().regex(/^\d{4}$/),
    landmark: z.string().trim().max(150).optional(),
  }).optional(),
}).superRefine((value, context) => {
  if (value.currentPassword && !value.newPassword) {
    context.addIssue({
      code: 'custom',
      path: ['newPassword'],
      message: 'Enter a new password to use your current password.',
    });
  }
});

type GeoItem = { code?: string; psgcCode?: string };
const PSGC_BASE = 'https://psgc.gitlab.io/api';

async function psgcCodes(path: string): Promise<Set<string>> {
  const response = await fetch(`${PSGC_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });
  if (!response.ok) {
    throw new ApiError(502, 'The official geographic reference is unavailable. Try again later.');
  }
  const items: unknown = await response.json();
  if (!Array.isArray(items)) {
    throw new ApiError(502, 'The geographic reference returned invalid data.');
  }
  return new Set((items as GeoItem[]).map((item) => String(item.code ?? item.psgcCode ?? '')));
}

async function assertGeographyMatches(address: {
  regionCode: string;
  provinceCode?: string;
  cityMunicipalityCode: string;
  barangayCode: string;
}) {
  const cityPath = address.provinceCode
    ? `/provinces/${encodeURIComponent(address.provinceCode)}/cities-municipalities`
    : `/regions/${encodeURIComponent(address.regionCode)}/cities-municipalities`;
  const [cities, barangays] = await Promise.all([
    psgcCodes(cityPath),
    psgcCodes(`/cities-municipalities/${encodeURIComponent(address.cityMunicipalityCode)}/barangays`),
  ]);
  if (!cities.has(address.cityMunicipalityCode)) {
    throw new ApiError(400, 'The city or municipality does not belong to the selected province or region.');
  }
  if (!barangays.has(address.barangayCode)) {
    throw new ApiError(400, 'The barangay does not belong to the selected city or municipality.');
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, ['customer']);
    const rows = await queryRows<
      {
        region: string | null;
        region_code: string | null;
        address_label: string;
        province: string | null;
        province_code: string | null;
        city_municipality: string | null;
        city_municipality_code: string | null;
        municipality: string | null;
        barangay: string | null;
        barangay_code: string | null;
        street: string | null;
        house_unit: string | null;
        subdivision: string | null;
        postal_code: string | null;
        zip_code: string | null;
        landmark: string | null;
      } & import('mysql2/promise').RowDataPacket
    >(
      mysqlPool,
      `SELECT address_label, region, region_code, province, province_code, city_municipality,
              city_municipality_code, municipality, barangay, barangay_code, street, house_unit,
              subdivision, postal_code, zip_code, landmark
       FROM tbl_user_address WHERE user_id = ? AND is_primary = 1 LIMIT 1`,
      [user.id],
    );
    const address = rows[0];
    const classification = address?.city_municipality
      ? classifyByCode(
          address.city_municipality_code,
          address.city_municipality,
          address.province,
          await loadInAreaCodes(mysqlPool),
        )
      : null;
    const outsideCharge = classification === 'outside_area' ? await loadOutsideCharge(mysqlPool) : 0;
    return NextResponse.json({
      ok: true,
      address: address ? {
        addressLabel: address.address_label,
        region: address.region ?? '',
        regionCode: address.region_code ?? '',
        province: address.province ?? '',
        provinceCode: address.province_code ?? '',
        cityMunicipality: address.city_municipality ?? address.municipality ?? '',
        cityMunicipalityCode: address.city_municipality_code ?? '',
        barangay: address.barangay ?? '',
        barangayCode: address.barangay_code ?? '',
        street: address.street ?? '',
        houseUnit: address.house_unit ?? '',
        subdivision: address.subdivision ?? '',
        postalCode: address.postal_code ?? address.zip_code ?? '',
        landmark: address.landmark ?? '',
      } : null,
      addressPolicy: await loadAddressPolicySettings(mysqlPool),
      location: {
        classification,
        charge: outsideCharge ?? 0,
        chargeConfigured: outsideCharge !== null,
        jobSiteAllowed: await isJobSiteAllowed(mysqlPool),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireSession(request, ['customer']);
    await enforceRateLimit(request, `profile:${user.id}`, 10, 60_000);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === 'address')) {
      throw new ApiError(
        400,
        'Complete every required address field: region, city or municipality, barangay, street, house or unit, and a 4-digit postal code.',
      );
    }
    if (!parsed.success) {
      throw new ApiError(
        400,
        'Use a 3–50 character username (letters, numbers, dot, underscore, or hyphen) and a new password of at least 12 characters.',
      );
    }

    const { username, currentPassword, newPassword, address } = parsed.data;
    const rows = await queryRows<
      {
        username: string | null;
        email: string | null;
        password_hash: string | null;
        first_name: string | null;
        middle_name: string | null;
        last_name: string | null;
      } & import('mysql2/promise').RowDataPacket
    >(
      mysqlPool,
      `SELECT username, email, password_hash, first_name, middle_name, last_name
       FROM tbl_user WHERE UID = ? AND role = 'customer' AND account_status = 'active' LIMIT 1`,
      [user.id],
    );
    const account = rows[0];
    if (!account) throw new ApiError(401, 'This customer account is no longer active.');

    if (newPassword && account.password_hash) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, account.password_hash))) {
        throw new ApiError(400, 'Your current password is incorrect.');
      }
    } else if (currentPassword && !account.password_hash) {
      throw new ApiError(400, 'This account does not have a password to verify.');
    }

    const existing = await queryRows<{ UID: string } & import('mysql2/promise').RowDataPacket>(
      mysqlPool,
      'SELECT UID FROM tbl_user WHERE username = ? AND UID <> ? LIMIT 1',
      [username, user.id],
    );
    if (existing.length) throw new ApiError(409, 'That username is already in use.');

    const passwordHash = newPassword ? await bcrypt.hash(newPassword, 12) : null;
    await mysqlPool.execute(
      'UPDATE tbl_user SET username = ?, password_hash = COALESCE(?, password_hash) WHERE UID = ?',
      [username, passwordHash, user.id],
    );
    if (address) {
      await assertGeographyMatches(address);
      const isNcr = /national capital region|ncr/i.test(address.region);
      const isIndependentCity = address.cityMunicipalityCode === SANTIAGO_CITY_PSGC;
      if (!isNcr && !isIndependentCity && !address.province) {
        throw new ApiError(400, 'Province is required for provincial cities and municipalities.');
      }
      const existingAddress = await queryRows<{ ID: number } & import('mysql2/promise').RowDataPacket>(
        mysqlPool,
        'SELECT ID FROM tbl_user_address WHERE user_id = ? AND is_primary = 1 LIMIT 1',
        [user.id],
      );
      const addressValues = [
        address.region,
        address.regionCode ?? null,
        address.province || null,
        address.provinceCode ?? null,
        address.cityMunicipality,
        address.cityMunicipalityCode ?? null,
        address.cityMunicipality,
        address.barangay,
        address.barangayCode ?? null,
        address.street,
        address.houseUnit,
        address.subdivision || null,
        address.postalCode,
        address.postalCode,
        address.landmark || null,
      ];
      if (existingAddress.length) {
        await mysqlPool.execute(
          `UPDATE tbl_user_address SET
             region = ?, region_code = ?, province = ?, province_code = ?,
             city_municipality = ?, city_municipality_code = ?, municipality = ?,
             barangay = ?, barangay_code = ?, street = ?, house_unit = ?,
             subdivision = ?, zip_code = ?, postal_code = ?, landmark = ?, is_primary = 1
           WHERE ID = ?`,
          [...addressValues, existingAddress[0].ID],
        );
      } else {
        await mysqlPool.execute(
          `INSERT INTO tbl_user_address
             (user_id, address_label, region, region_code, province, province_code,
              city_municipality, city_municipality_code, municipality,
              barangay, barangay_code, street, house_unit, subdivision, zip_code,
              postal_code, landmark, is_primary)
           VALUES (?, 'Primary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [user.id, ...addressValues],
        );
      }
    }

    const name =
      [account.first_name, account.middle_name, account.last_name].filter(Boolean).join(' ') ||
      account.email ||
      username;
    const updatedUser: SessionUser = {
      id: user.id,
      email: account.email,
      username,
      name,
      role: 'customer',
    };
    const response = NextResponse.json({ ok: true, user: displayUser(updatedUser) });
    setSessionCookie(response, await createSessionToken(updatedUser));

    const changes = [
      account.username !== username ? 'username updated' : '',
      newPassword ? 'password updated' : '',
    ].filter(Boolean);
    if (changes.length) {
      await recordAuditEvent(request, updatedUser, {
        category: 'Account / System',
        action: 'Updated customer account settings',
        details: changes.join('; '),
      });
    }
    return response;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ ok: false, error: 'That username is already in use.' }, { status: 409 });
    }
    return apiErrorResponse(error);
  }
}
