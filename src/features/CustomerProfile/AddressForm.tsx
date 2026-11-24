'use client';

import React, { useEffect, useState } from 'react';

export interface GeoItem {
  code: string;
  name: string;
  regionCode?: string;
}

interface AddressState {
  regionCode: string;
  region: string;
  provinceCode: string;
  province: string;
  cityMunicipalityCode: string;
  cityMunicipality: string;
  barangayCode: string;
  barangay: string;
  street: string;
  houseUnit: string;
  subdivision: string;
  postalCode: string;
  landmark: string;
}

const EMPTY: AddressState = {
  regionCode: '',
  region: '',
  provinceCode: '',
  province: '',
  cityMunicipalityCode: '',
  cityMunicipality: '',
  barangayCode: '',
  barangay: '',
  street: '',
  houseUnit: '',
  subdivision: '',
  postalCode: '',
  landmark: '',
};

const FIELD =
  'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 disabled:bg-zinc-100 disabled:text-zinc-500';
const DEFAULT_ADDRESS_POLICY = {
  unnamedStreetFallback: 'If there is no named street, enter a clear location description.',
  unnumberedPremisesFallback: 'If the premises have no number, enter a clear house or premises description.',
  prefillPartialLegacyAddresses: false,
};

export async function loadGeo(query: string): Promise<GeoItem[]> {
  const response = await fetch(`/api/geography?${query}`);
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Unable to load the geographic list.');
  }
  return result.items as GeoItem[];
}

export function GeoSelect({
  id,
  label,
  value,
  items,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  items: GeoItem[];
  onChange: (code: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      >
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option key={item.code} value={item.code}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AddressForm({
  username,
  required = false,
  onSaved,
}: {
  username: string;
  required?: boolean;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState<AddressState>(EMPTY);
  const [regions, setRegions] = useState<GeoItem[]>([]);
  const [provinces, setProvinces] = useState<GeoItem[]>([]);
  const [cities, setCities] = useState<GeoItem[]>([]);
  const [barangays, setBarangays] = useState<GeoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [addressPolicy, setAddressPolicy] = useState(DEFAULT_ADDRESS_POLICY);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [regionList, profileResponse] = await Promise.all([
          loadGeo('resource=regions'),
          fetch('/api/auth/profile', { credentials: 'same-origin' }),
        ]);
        if (!active) return;
        setRegions(regionList);
        const profile = await profileResponse.json();
        if (!profileResponse.ok || !profile.ok) {
          throw new Error(profile.error || 'Unable to load your saved address.');
        }
        const policy = profile.addressPolicy ?? DEFAULT_ADDRESS_POLICY;
        setAddressPolicy(policy);
        const saved = profile?.address;
        if (saved) {
          const hasCompleteCodes = Boolean(
            saved.regionCode && saved.cityMunicipalityCode && saved.barangayCode,
          );
          const prefill = hasCompleteCodes || policy.prefillPartialLegacyAddresses;
          const next: AddressState = prefill
            ? {
                ...EMPTY,
                street: saved.street ?? '',
                houseUnit: saved.houseUnit ?? '',
                subdivision: saved.subdivision ?? '',
                postalCode: saved.postalCode ?? '',
                landmark: saved.landmark ?? '',
              }
            : EMPTY;
          if (prefill) {
            const matchName = (items: GeoItem[], name: string | undefined) =>
              items.find((item) => item.name.trim().toLocaleLowerCase() === name?.trim().toLocaleLowerCase());
            const savedRegion =
              regionList.find((item) => item.code === saved.regionCode) ?? matchName(regionList, saved.region);
            if (savedRegion) {
              next.regionCode = savedRegion.code;
              next.region = savedRegion.name;
              const [provinceList, regionalCities] = await Promise.all([
                loadGeo(`resource=provinces&code=${encodeURIComponent(savedRegion.code)}`),
                loadGeo(`resource=cities&code=${encodeURIComponent(savedRegion.code)}`),
              ]);
              const savedProvince =
                provinceList.find((item) => item.code === saved.provinceCode) ??
                matchName(provinceList, saved.province);
              const cityList = savedProvince
                ? await loadGeo(`resource=province-cities&code=${encodeURIComponent(savedProvince.code)}`)
                : regionalCities;
              const savedCity =
                cityList.find((item) => item.code === saved.cityMunicipalityCode) ??
                matchName(cityList, saved.cityMunicipality);
              if (!active) return;
              setProvinces(provinceList);
              setCities(cityList);
              if (savedProvince) {
                next.provinceCode = savedProvince.code;
                next.province = savedProvince.name;
              }
              if (savedCity) {
                next.cityMunicipalityCode = savedCity.code;
                next.cityMunicipality = savedCity.name;
                const barangayList = await loadGeo(
                  `resource=barangays&code=${encodeURIComponent(savedCity.code)}`,
                );
                const savedBarangay =
                  barangayList.find((item) => item.code === saved.barangayCode) ??
                  matchName(barangayList, saved.barangay);
                if (!active) return;
                setBarangays(barangayList);
                if (savedBarangay) {
                  next.barangayCode = savedBarangay.code;
                  next.barangay = savedBarangay.name;
                }
              }
            }
          }
          setValue(next);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load your address.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const patch = (changes: Partial<AddressState>) => setValue((current) => ({ ...current, ...changes }));

  const pickRegion = async (code: string) => {
    const item = regions.find((region) => region.code === code);
    patch({
      regionCode: code,
      region: item?.name ?? '',
      provinceCode: '',
      province: '',
      cityMunicipalityCode: '',
      cityMunicipality: '',
      barangayCode: '',
      barangay: '',
    });
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    if (!code) return;
    try {
      const [provinceList, cityList] = await Promise.all([
        loadGeo(`resource=provinces&code=${encodeURIComponent(code)}`),
        loadGeo(`resource=cities&code=${encodeURIComponent(code)}`),
      ]);
      setProvinces(provinceList);
      setCities(cityList);
    } catch (geoError) {
      setError(geoError instanceof Error ? geoError.message : 'Unable to load the geographic list.');
    }
  };

  const pickProvince = async (code: string) => {
    const item = provinces.find((province) => province.code === code);
    patch({
      provinceCode: code,
      province: item?.name ?? '',
      cityMunicipalityCode: '',
      cityMunicipality: '',
      barangayCode: '',
      barangay: '',
    });
    setCities([]);
    setBarangays([]);
    try {
      setCities(
        code
          ? await loadGeo(`resource=province-cities&code=${encodeURIComponent(code)}`)
          : await loadGeo(`resource=cities&code=${encodeURIComponent(value.regionCode)}`),
      );
    } catch (geoError) {
      setError(geoError instanceof Error ? geoError.message : 'Unable to load the geographic list.');
    }
  };

  const pickCity = async (code: string) => {
    const item = cities.find((city) => city.code === code);
    patch({
      cityMunicipalityCode: code,
      cityMunicipality: item?.name ?? '',
      barangayCode: '',
      barangay: '',
    });
    setBarangays([]);
    if (!code) return;
    try {
      setBarangays(await loadGeo(`resource=barangays&code=${encodeURIComponent(code)}`));
    } catch (geoError) {
      setError(geoError instanceof Error ? geoError.message : 'Unable to load the geographic list.');
    }
  };

  const pickBarangay = (code: string) => {
    const item = barangays.find((barangay) => barangay.code === code);
    patch({ barangayCode: code, barangay: item?.name ?? '' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!value.regionCode || !value.cityMunicipalityCode || !value.barangayCode) {
      setError('Select your region, city or municipality and barangay from the lists.');
      return;
    }
    if (!value.street.trim() || !value.houseUnit.trim()) {
      setError('Enter your street and house, building or unit details.');
      return;
    }
    if (!/^\d{4}$/.test(value.postalCode)) {
      setError('Enter a 4-digit postal code.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          username,
          address: {
            region: value.region,
            regionCode: value.regionCode,
            province: value.province || undefined,
            provinceCode: value.provinceCode || undefined,
            cityMunicipality: value.cityMunicipality,
            cityMunicipalityCode: value.cityMunicipalityCode,
            barangay: value.barangay,
            barangayCode: value.barangayCode,
            street: value.street.trim(),
            houseUnit: value.houseUnit.trim(),
            subdivision: value.subdivision.trim() || undefined,
            postalCode: value.postalCode,
            landmark: value.landmark.trim() || undefined,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save your address.');
      setSuccess('Your address has been saved.');
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your address.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-zinc-200 pt-4">
      <h3 className="text-lg font-extrabold">Philippine Address</h3>
      {required && (
        <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Save your complete address before submitting a new service request. Your existing orders stay available.
        </p>
      )}
      {loading ? (
        <p className="text-sm text-zinc-500">Loading your address...</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <GeoSelect
              id="address-region"
              label="Region *"
              value={value.regionCode}
              items={regions}
              onChange={(code) => void pickRegion(code)}
              placeholder="Select region"
            />
            {provinces.length > 0 && (
              <GeoSelect
                id="address-province"
                label="Province (blank for independent cities)"
                value={value.provinceCode}
                items={provinces}
                onChange={(code) => void pickProvince(code)}
                placeholder="None / independent city"
              />
            )}
            <GeoSelect
              id="address-city"
              label="City or municipality *"
              value={value.cityMunicipalityCode}
              items={cities}
              onChange={(code) => void pickCity(code)}
              disabled={!value.regionCode}
              placeholder="Select city or municipality"
            />
            <GeoSelect
              id="address-barangay"
              label="Barangay *"
              value={value.barangayCode}
              items={barangays}
              onChange={pickBarangay}
              disabled={!value.cityMunicipalityCode}
              placeholder="Select barangay"
            />
            <div>
              <label htmlFor="address-street" className="mb-1 block text-sm font-bold">Street *</label>
              <input
                id="address-street"
                maxLength={150}
                value={value.street}
                onChange={(event) => patch({ street: event.target.value })}
                placeholder="Street name"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="address-house" className="mb-1 block text-sm font-bold">House, building or unit *</label>
              <input
                id="address-house"
                maxLength={150}
                value={value.houseUnit}
                onChange={(event) => patch({ houseUnit: event.target.value })}
                placeholder="House / building / unit"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="address-subdivision" className="mb-1 block text-sm font-bold">Subdivision, purok or sitio</label>
              <input
                id="address-subdivision"
                maxLength={150}
                value={value.subdivision}
                onChange={(event) => patch({ subdivision: event.target.value })}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="address-postal" className="mb-1 block text-sm font-bold">Postal code *</label>
              <input
                id="address-postal"
                inputMode="numeric"
                maxLength={4}
                value={value.postalCode}
                onChange={(event) => patch({ postalCode: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="4 digits"
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="address-landmark" className="mb-1 block text-sm font-bold">Landmark</label>
              <input
                id="address-landmark"
                maxLength={150}
                value={value.landmark}
                onChange={(event) => patch({ landmark: event.target.value })}
                placeholder="Short description (optional)"
                className={FIELD}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Leave the province blank only for NCR and independent cities such as Santiago City.{' '}
            {addressPolicy.unnamedStreetFallback} {addressPolicy.unnumberedPremisesFallback} Check your postal code in the{' '}
            <a
              href="https://phlpost.gov.ph/zip-code-locator/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              PHLPost ZIP Code Locator
            </a>
            .
          </p>
        </>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm font-semibold text-emerald-700">{success}</p>}
      <button
        type="submit"
        disabled={saving || loading}
        className="rounded-xl bg-[#D4A017] px-5 py-2.5 font-extrabold text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? 'Saving...' : 'Save Address'}
      </button>
    </form>
  );
}

export default AddressForm;