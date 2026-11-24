import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/server/auth';
import { apiErrorResponse, ApiError, assertSameOrigin, readJson } from '@/lib/server/http';
import { mysqlPool, queryRows } from '@/lib/server/mysql';
import { recordAuditEvent } from '@/lib/server/audit';

export const runtime = 'nodejs';

async function loadSetting(key: string, fallback: number): Promise<number> {
  const rows = await queryRows<{ setting_value: string } & import('mysql2/promise').RowDataPacket>(
    mysqlPool,
    'SELECT setting_value FROM tbl_app_setting WHERE setting_key = ? LIMIT 1',
    [key],
  );
  const value = Number(rows[0]?.setting_value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export async function GET() {
  try {
    const outsideLocationCharge = await loadSetting('outside_location_charge', 0);
    const agreementThreshold = await loadSetting('agreement_threshold', 5000);
    return NextResponse.json({ ok: true, outsideLocationCharge, agreementThreshold });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireSession(request, ['lead_admin']);
    const parsed = z.object({
      outsideLocationCharge: z.number().finite().min(0).max(1_000_000).optional(),
      agreementThreshold: z.number().finite().min(0).max(1_000_000).optional(),
    }).safeParse(await readJson(request));
    if (!parsed.success ||
      (parsed.data.outsideLocationCharge === undefined &&
        parsed.data.agreementThreshold === undefined)) {
      throw new ApiError(400, 'System change settings are invalid.');
    }
    if (parsed.data.outsideLocationCharge !== undefined) {
      await mysqlPool.execute(
        `INSERT INTO tbl_app_setting (setting_key, setting_value)
         VALUES ('outside_location_charge', ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [parsed.data.outsideLocationCharge.toFixed(2)],
      );
    }
    if (parsed.data.agreementThreshold !== undefined) {
      await mysqlPool.execute(
        `INSERT INTO tbl_app_setting (setting_key, setting_value)
         VALUES ('agreement_threshold', ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [parsed.data.agreementThreshold.toFixed(2)],
      );
    }
    await recordAuditEvent(request, user, {
      category: 'Account / System',
      action: 'Updated Week 16 system settings',
      details: [
        parsed.data.outsideLocationCharge !== undefined
          ? `outside location charge ₱${parsed.data.outsideLocationCharge.toFixed(2)}`
          : '',
        parsed.data.agreementThreshold !== undefined
          ? `agreement threshold ₱${parsed.data.agreementThreshold.toFixed(2)}`
          : '',
      ].filter(Boolean).join('; '),
    });
    return NextResponse.json({
      ok: true,
      outsideLocationCharge: parsed.data.outsideLocationCharge,
      agreementThreshold: parsed.data.agreementThreshold,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
