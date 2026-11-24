import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiErrorResponse, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';

const BASE = 'https://psgc.gitlab.io/api';

export async function GET(request: NextRequest) {
  try {
    const resource = request.nextUrl.searchParams.get('resource');
    const code = request.nextUrl.searchParams.get('code')?.trim();
    let path = '';
    if (resource === 'regions') path = '/regions';
    else if (resource === 'provinces' && code) path = `/regions/${encodeURIComponent(code)}/provinces`;
    else if (resource === 'cities' && code) path = `/regions/${encodeURIComponent(code)}/cities-municipalities`;
    else if (resource === 'province-cities' && code) path = `/provinces/${encodeURIComponent(code)}/cities-municipalities`;
    else if (resource === 'barangays' && code) path = `/cities-municipalities/${encodeURIComponent(code)}/barangays`;
    else throw new ApiError(400, 'Geographic resource or parent code is invalid.');

    const response = await fetch(`${BASE}${path}`, {
      headers: { Accept: 'application/json' },
      cache: 'force-cache',
    });
    if (!response.ok) throw new ApiError(502, 'The official geographic reference is unavailable.');
    const items = await response.json();
    if (!Array.isArray(items)) throw new ApiError(502, 'The geographic reference returned invalid data.');
    return NextResponse.json({
      ok: true,
      items: items.map((item) => ({
        code: String(item.code ?? item.psgcCode ?? ''),
        name: String(item.name ?? ''),
        regionCode: item.regionCode ? String(item.regionCode) : undefined,
      })).filter((item) => item.code && item.name),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
