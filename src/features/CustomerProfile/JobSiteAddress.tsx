'use client';

import React, { useEffect, useState } from 'react';
import { GeoSelect, loadGeo, type GeoItem } from './AddressForm';

export interface JobSiteValue {
  region: string;
  regionCode: string;
  province?: string;
  provinceCode?: string;
  cityMunicipality: string;
  cityMunicipalityCode: string;
  barangay: string;
  barangayCode: string;
  street: string;
  houseUnit: string;
  subdivision?: string;
  postalCode: string;
}

const FIELD =
  'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 disabled:bg-zinc-100 disabled:text-zinc-500';

export function JobSiteAddress({ onChange }: { onChange: (value: JobSiteValue | null) => void }) {
  const [regions, setRegions] = useState<GeoItem[]>([]);
  const [provinces, setProvinces] = useState<GeoItem[]>([]);
  const [cities, setCities] = useState<GeoItem[]>([]);
  const [barangays, setBarangays] = useState<GeoItem[]>([]);
  const [regionCode, setRegionCode] = useState('');
  const [provinceCode, setProvinceCode] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [barangayCode, setBarangayCode] = useState('');
  const [street, setStreet] = useState('');
  const [houseUnit, setHouseUnit] = useState('');
  const [subdivision, setSubdivision] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [error, setError] = useState('');

  const nameOf = (items: GeoItem[], code: string) => items.find((item) => item.code === code)?.name ?? '';

  useEffect(() => {
    let active = true;
    loadGeo('resource=regions')
      .then((items) => {
        if (active) setRegions(items);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load regions.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const complete =
      regionCode && cityCode && barangayCode && street.trim() && houseUnit.trim() && /^\d{4}$/.test(postalCode);
    if (!complete) {
      onChange(null);
      return;
    }
    onChange({
      region: nameOf(regions, regionCode),
      regionCode,
      province: provinceCode ? nameOf(provinces, provinceCode) : undefined,
      provinceCode: provinceCode || undefined,
      cityMunicipality: nameOf(cities, cityCode),
      cityMunicipalityCode: cityCode,
      barangay: nameOf(barangays, barangayCode),
      barangayCode,
      street: street.trim(),
      houseUnit: houseUnit.trim(),
      subdivision: subdivision.trim() || undefined,
      postalCode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCode, provinceCode, cityCode, barangayCode, street, houseUnit, subdivision, postalCode]);

  const guard = async (task: () => Promise<void>) => {
    try {
      setError('');
      await task();
    } catch (geoError) {
      setError(geoError instanceof Error ? geoError.message : 'Unable to load the geographic list.');
    }
  };

  const pickRegion = (code: string) => {
    setRegionCode(code);
    setProvinceCode('');
    setCityCode('');
    setBarangayCode('');
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    if (!code) return;
    void guard(async () => {
      const [provinceList, cityList] = await Promise.all([
        loadGeo(`resource=provinces&code=${encodeURIComponent(code)}`),
        loadGeo(`resource=cities&code=${encodeURIComponent(code)}`),
      ]);
      setProvinces(provinceList);
      setCities(cityList);
    });
  };

  const pickProvince = (code: string) => {
    setProvinceCode(code);
    setCityCode('');
    setBarangayCode('');
    setCities([]);
    setBarangays([]);
    void guard(async () => {
      setCities(
        code
          ? await loadGeo(`resource=province-cities&code=${encodeURIComponent(code)}`)
          : await loadGeo(`resource=cities&code=${encodeURIComponent(regionCode)}`),
      );
    });
  };

  const pickCity = (code: string) => {
    setCityCode(code);
    setBarangayCode('');
    setBarangays([]);
    if (!code) return;
    void guard(async () => {
      setBarangays(await loadGeo(`resource=barangays&code=${encodeURIComponent(code)}`));
    });
  };

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <GeoSelect
        id="jobsite-region"
        label="Region *"
        value={regionCode}
        items={regions}
        onChange={pickRegion}
        placeholder="Select region"
      />
      {provinces.length > 0 && (
        <GeoSelect
          id="jobsite-province"
          label="Province (blank for independent cities)"
          value={provinceCode}
          items={provinces}
          onChange={pickProvince}
          placeholder="None / independent city"
        />
      )}
      <GeoSelect
        id="jobsite-city"
        label="City or municipality *"
        value={cityCode}
        items={cities}
        onChange={pickCity}
        disabled={!regionCode}
        placeholder="Select city or municipality"
      />
      <GeoSelect
        id="jobsite-barangay"
        label="Barangay *"
        value={barangayCode}
        items={barangays}
        onChange={setBarangayCode}
        disabled={!cityCode}
        placeholder="Select barangay"
      />
      <div>
        <label htmlFor="jobsite-street" className="mb-1 block text-sm font-bold">Street *</label>
        <input id="jobsite-street" maxLength={150} value={street} onChange={(e) => setStreet(e.target.value)} className={FIELD} />
      </div>
      <div>
        <label htmlFor="jobsite-house" className="mb-1 block text-sm font-bold">House, building or unit *</label>
        <input id="jobsite-house" maxLength={150} value={houseUnit} onChange={(e) => setHouseUnit(e.target.value)} className={FIELD} />
      </div>
      <div>
        <label htmlFor="jobsite-subdivision" className="mb-1 block text-sm font-bold">Subdivision, purok or sitio</label>
        <input id="jobsite-subdivision" maxLength={150} value={subdivision} onChange={(e) => setSubdivision(e.target.value)} className={FIELD} />
      </div>
      <div>
        <label htmlFor="jobsite-postal" className="mb-1 block text-sm font-bold">Postal code *</label>
        <input
          id="jobsite-postal"
          inputMode="numeric"
          maxLength={4}
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className={FIELD}
        />
      </div>
      {error && <p role="alert" className="sm:col-span-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export default JobSiteAddress;