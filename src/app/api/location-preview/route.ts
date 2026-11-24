import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { apiErrorResponse } from '@/lib/server/http';
import { mysqlPool } from '@/lib/server/mysql';
import { classifyByCode, loadInAreaCodes, loadOutsideCharge } from '@/lib/server/location';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ['customer']);
    const params = request.nextUrl.searchParams;
    const cityCode = params.get('cityCode')?.trim() || null;
    const city = params.get('city')?.trim() ?? '';
    const province = params.get('province')?.trim() || null;
    const classification = classifyByCode(cityCode, city, province, await loadInAreaCodes(mysqlPool));
    const charge = classification === 'outside_area' ? await loadOutsideCharge(mysqlPool) : 0;
    return NextResponse.json({
      ok: true,
      classification,
      charge: charge ?? 0,
      chargeConfigured: classification === 'in_area' || charge !== null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}