import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/server/auth';
import { apiErrorResponse, ApiError, assertSameOrigin, readJson } from '@/lib/server/http';
import { mysqlPool } from '@/lib/server/mysql';
import { recordAuditEvent } from '@/lib/server/audit';
import { signageRulesSchema } from '@/lib/signage';
import { loadWeek16Settings, ORDER_STATUSES } from '@/lib/server/week16-settings';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await loadWeek16Settings(mysqlPool)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const connection = await mysqlPool.getConnection();
  try {
    assertSameOrigin(request);
    const user = await requireSession(request, ['lead_admin']);
    const parsed = z.object({
      outsideLocationCharge: z.number().finite().min(0).max(1_000_000).optional(),
      agreementThreshold: z.number().finite().min(0).max(1_000_000).optional(),
      agreementThresholdIncludesLocationCharge: z.boolean().optional(),
      agreementThresholdInclusive: z.boolean().optional(),
      agreementStatuses: z.array(z.enum(ORDER_STATUSES)).min(1).max(ORDER_STATUSES.length).optional(),
      agreementTerms: z.string().trim().min(1).max(6000).optional(),
      agreementTermsVersion: z.string().trim().min(1).max(60).optional(),
      insideAreaCityCodes: z.array(z.string().regex(/^\d{10}$/)).max(500)
        .refine((codes) => new Set(codes).size === codes.length, 'City codes must be unique.')
        .optional(),
      allowJobSiteAddress: z.boolean().optional(),
      unnamedStreetFallback: z.string().trim().min(1).max(255).optional(),
      unnumberedPremisesFallback: z.string().trim().min(1).max(255).optional(),
      prefillPartialLegacyAddresses: z.boolean().optional(),
      signageRules: signageRulesSchema.optional(),
    }).safeParse(await readJson(request));
    if (!parsed.success || Object.values(parsed.data).every((value) => value === undefined)) {
      throw new ApiError(400, 'System change settings are invalid.');
    }
    const data = parsed.data;
    const updates: Array<[string, string]> = [
      ...(data.outsideLocationCharge === undefined
        ? []
        : [['outside_location_charge', data.outsideLocationCharge.toFixed(2)] as [string, string]]),
      ...(data.agreementThreshold === undefined
        ? []
        : [['agreement_threshold', data.agreementThreshold.toFixed(2)] as [string, string]]),
      ...(data.agreementThresholdIncludesLocationCharge === undefined
        ? []
        : [[
            'agreement_threshold_includes_location_charge',
            data.agreementThresholdIncludesLocationCharge ? '1' : '0',
          ] as [string, string]]),
      ...(data.agreementThresholdInclusive === undefined
        ? []
        : [['agreement_threshold_inclusive', data.agreementThresholdInclusive ? '1' : '0'] as [string, string]]),
      ...(data.agreementStatuses === undefined
        ? []
        : [['agreement_statuses', data.agreementStatuses.join(',')] as [string, string]]),
      ...(data.agreementTerms === undefined
        ? []
        : [['agreement_terms', data.agreementTerms] as [string, string]]),
      ...(data.agreementTermsVersion === undefined
        ? []
        : [['agreement_terms_version', data.agreementTermsVersion] as [string, string]]),
      ...(data.insideAreaCityCodes === undefined
        ? []
        : [['inside_area_city_codes', data.insideAreaCityCodes.join(',')] as [string, string]]),
      ...(data.allowJobSiteAddress === undefined
        ? []
        : [['allow_job_site_address', data.allowJobSiteAddress ? '1' : '0'] as [string, string]]),
      ...(data.unnamedStreetFallback === undefined
        ? []
        : [['unnamed_street_fallback', data.unnamedStreetFallback] as [string, string]]),
      ...(data.unnumberedPremisesFallback === undefined
        ? []
        : [['unnumbered_premises_fallback', data.unnumberedPremisesFallback] as [string, string]]),
      ...(data.prefillPartialLegacyAddresses === undefined
        ? []
        : [['prefill_partial_legacy_addresses', data.prefillPartialLegacyAddresses ? '1' : '0'] as [string, string]]),
      ...(data.signageRules === undefined
        ? []
        : [['signage_rules', JSON.stringify(data.signageRules)] as [string, string]]),
    ];
    await connection.beginTransaction();
    try {
      for (const [key, value] of updates) {
        await connection.execute(
          `INSERT INTO tbl_app_setting (setting_key, setting_value)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [key, value],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    await recordAuditEvent(request, user, {
      category: 'Account / System',
      action: 'Updated Week 16 system settings',
      details: `Updated: ${updates.map(([key]) => key.replace(/_/g, ' ')).join(', ')}.`,
    });
    return NextResponse.json({ ok: true, ...(await loadWeek16Settings(connection)) });
  } catch (error) {
    return apiErrorResponse(error);
  } finally {
    connection.release();
  }
}
