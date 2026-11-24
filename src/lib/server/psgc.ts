import { ApiError } from '@/lib/server/http';

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

export async function assertGeographyMatches(address: {
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