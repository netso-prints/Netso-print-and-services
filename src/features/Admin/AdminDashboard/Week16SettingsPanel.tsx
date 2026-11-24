'use client';

import React, { useEffect, useState } from 'react';
import {
  type SignageRule,
  type SignageType,
} from '@/lib/signage';

const ORDER_STATUSES = [
  'Unpaid Balance',
  'In Pre-Press',
  'In Production',
  'Ready for Pickup',
  'Completed',
  'Cancelled',
] as const;

interface Week16Settings {
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

interface Week16SettingsForm extends Omit<Week16Settings, 'insideAreaCityCodes' | 'signageRules'> {
  insideAreaCityCodesText: string;
}

const INPUT =
  'mt-1 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950';
const HELP = 'mt-1 text-xs leading-relaxed text-zinc-600';
const CHECKBOX = 'size-4 accent-[#B8860B]';

function toForm(settings: Week16Settings): Week16SettingsForm {
  return {
    ...settings,
    insideAreaCityCodesText: settings.insideAreaCityCodes.join(', '),
  };
}

export function Week16SettingsPanel() {
  const [form, setForm] = useState<Week16SettingsForm | null>(null);
  const [signageRules, setSignageRules] = useState<Record<SignageType, SignageRule> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/app-settings', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result.error || 'Unable to load system settings.');
        }
        const settings = result as Week16Settings;
        if (active) {
          setForm(toForm(settings));
          setSignageRules(settings.signageRules);
        }
      })
      .catch((loadError: unknown) => {
        console.error('Unable to load Week 16 settings:', loadError);
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load system settings.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateForm = (changes: Partial<Week16SettingsForm>) => {
    setForm((current) => current ? { ...current, ...changes } : current);
    setError('');
    setSuccess('');
  };

  const updateSignageRule = (
    type: SignageType,
    changes: Partial<SignageRule>,
  ) => {
    setSignageRules((current) => current
      ? { ...current, [type]: { ...current[type], ...changes } }
      : current);
    setError('');
    setSuccess('');
  };

  const fieldKeyFromLabel = (label: string) =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[0-9]/, '_$&')
      .slice(0, 40);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setError('');
    setSuccess('');

    const outsideLocationCharge = Number(form.outsideLocationCharge);
    const agreementThreshold = Number(form.agreementThreshold);
    if (!Number.isFinite(outsideLocationCharge) || outsideLocationCharge < 0) {
      setError('Enter a valid outside-area charge.');
      return;
    }
    if (!Number.isFinite(agreementThreshold) || agreementThreshold < 0) {
      setError('Enter a valid agreement threshold.');
      return;
    }
    if (!form.agreementStatuses.length) {
      setError('Select at least one status that allows agreement downloads.');
      return;
    }

    const cityCodes = form.insideAreaCityCodesText
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    if (cityCodes.some((code) => !/^\d{10}$/.test(code))) {
      setError('Each additional in-area location must be a 10-digit PSGC city or municipality code.');
      return;
    }
    if (new Set(cityCodes).size !== cityCodes.length) {
      setError('Remove duplicate PSGC codes from the in-area location list.');
      return;
    }

    if (!signageRules) {
      setError('Signage settings are unavailable.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/app-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          outsideLocationCharge: Number(outsideLocationCharge.toFixed(2)),
          agreementThreshold: Number(agreementThreshold.toFixed(2)),
          agreementThresholdIncludesLocationCharge: form.agreementThresholdIncludesLocationCharge,
          agreementThresholdInclusive: form.agreementThresholdInclusive,
          agreementStatuses: form.agreementStatuses,
          agreementTerms: form.agreementTerms,
          agreementTermsVersion: form.agreementTermsVersion,
          insideAreaCityCodes: cityCodes,
          allowJobSiteAddress: form.allowJobSiteAddress,
          unnamedStreetFallback: form.unnamedStreetFallback,
          unnumberedPremisesFallback: form.unnumberedPremisesFallback,
          prefillPartialLegacyAddresses: form.prefillPartialLegacyAddresses,
          signageRules,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Unable to save system settings.');
      }
      const settings = result as Week16Settings;
      setForm(toForm(settings));
      setSignageRules(settings.signageRules);
      setSuccess('System settings saved and activated.');
    } catch (saveError) {
      console.error('Unable to save system settings:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Unable to save system settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-300 bg-white p-5 text-sm font-semibold text-zinc-600 shadow-sm">
        Loading system settings…
      </section>
    );
  }

  if (!form) {
    return (
      <section className="rounded-2xl border border-red-300 bg-white p-5 text-sm font-semibold text-red-700 shadow-sm">
        {error || 'System settings are unavailable.'}
      </section>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-2xl border border-[#D4A017] bg-white p-5 text-zinc-950 shadow-sm">
      <div>
        <h2 className="text-lg font-extrabold">System settings</h2>
        <p className={HELP}>
          Lead-admin changes take effect immediately for new requests and agreement downloads. Existing saved order
          totals are not recalculated.
        </p>
      </div>

      <section className="grid gap-4 border-t border-zinc-200 pt-4 sm:grid-cols-2">
        <div>
          <label htmlFor="week16-outside-charge" className="text-sm font-bold">Outside-area charge (PHP)</label>
          <input
            id="week16-outside-charge"
            className={INPUT}
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            required
            value={form.outsideLocationCharge}
            onChange={(event) => updateForm({ outsideLocationCharge: Number(event.target.value) })}
          />
          <p className={HELP}>
            Applied once to new customer orders outside the approved service area. Keep this at PHP 0.00 to block
            outside-area orders until a positive charge is approved.
          </p>
        </div>
        <div className="flex items-start gap-2 pt-1">
          <input
            id="week16-jobsite"
            type="checkbox"
            checked={form.allowJobSiteAddress}
            onChange={(event) => updateForm({ allowJobSiteAddress: event.target.checked })}
            className={`${CHECKBOX} mt-1`}
          />
          <label htmlFor="week16-jobsite" className="text-sm font-bold">
            Allow a separate job-site address on customer requests
            <span className={`block font-normal ${HELP}`}>If off, orders use the customer’s saved profile address.</span>
          </label>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="week16-area-codes" className="text-sm font-bold">
            Additional approved in-area city/municipality PSGC codes
          </label>
          <textarea
            id="week16-area-codes"
            className={INPUT}
            rows={2}
            value={form.insideAreaCityCodesText}
            onChange={(event) => updateForm({ insideAreaCityCodesText: event.target.value })}
            placeholder="10-digit codes separated by commas"
          />
          <p className={HELP}>
            Santiago City is always included. Add only client-approved nearby cities or municipalities. Find codes in
            the{' '}
            <a href="https://psa.gov.ph/classification/psgc" target="_blank" rel="noopener noreferrer" className="underline">
              PSA Philippine Standard Geographic Code
            </a>
            .
          </p>
        </div>
      </section>

      <section className="space-y-3 border-t border-zinc-200 pt-4">
        <h3 className="font-extrabold">Service Order Agreement</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="week16-agreement-threshold" className="text-sm font-bold">Download threshold (PHP)</label>
            <input
              id="week16-agreement-threshold"
              className={INPUT}
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              required
              value={form.agreementThreshold}
              onChange={(event) => updateForm({ agreementThreshold: Number(event.target.value) })}
            />
          </div>
          <label className="flex items-start gap-2 pt-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.agreementThresholdIncludesLocationCharge}
              onChange={(event) =>
                updateForm({ agreementThresholdIncludesLocationCharge: event.target.checked })
              }
              className={`${CHECKBOX} mt-0.5`}
            />
            Count the location charge toward the threshold
          </label>
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.agreementThresholdInclusive}
              onChange={(event) => updateForm({ agreementThresholdInclusive: event.target.checked })}
              className={`${CHECKBOX} mt-0.5`}
            />
            Allow downloads when the total exactly equals the threshold
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-bold">Statuses eligible for download</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {ORDER_STATUSES.map((status) => (
                <label key={status} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.agreementStatuses.includes(status)}
                    onChange={(event) => updateForm({
                      agreementStatuses: event.target.checked
                        ? [...form.agreementStatuses, status]
                        : form.agreementStatuses.filter((item) => item !== status),
                    })}
                    className={CHECKBOX}
                  />
                  {status}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="week16-terms-version" className="text-sm font-bold">Terms version</label>
            <input
              id="week16-terms-version"
              className={INPUT}
              maxLength={60}
              required
              value={form.agreementTermsVersion}
              onChange={(event) => updateForm({ agreementTermsVersion: event.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="week16-terms" className="text-sm font-bold">Agreement terms</label>
            <textarea
              id="week16-terms"
              className={INPUT}
              rows={5}
              maxLength={6000}
              required
              value={form.agreementTerms}
              onChange={(event) => updateForm({ agreementTerms: event.target.value })}
            />
            <p className={HELP}>Terms are stored for future downloads; already downloaded PDFs are not rewritten.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-zinc-200 pt-4">
        <h3 className="font-extrabold">Customer address policy</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="week16-unnamed-street" className="text-sm font-bold">Fallback for unnamed streets</label>
            <textarea
              id="week16-unnamed-street"
              className={INPUT}
              rows={2}
              maxLength={255}
              required
              value={form.unnamedStreetFallback}
              onChange={(event) => updateForm({ unnamedStreetFallback: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="week16-unnumbered-premises" className="text-sm font-bold">Fallback for unnumbered premises</label>
            <textarea
              id="week16-unnumbered-premises"
              className={INPUT}
              rows={2}
              maxLength={255}
              required
              value={form.unnumberedPremisesFallback}
              onChange={(event) => updateForm({ unnumberedPremisesFallback: event.target.value })}
            />
          </div>
          <label className="flex items-start gap-2 text-sm font-semibold sm:col-span-2">
            <input
              type="checkbox"
              checked={form.prefillPartialLegacyAddresses}
              onChange={(event) =>
                updateForm({ prefillPartialLegacyAddresses: event.target.checked })
              }
              className={`${CHECKBOX} mt-0.5`}
            />
            Prefill partial legacy address details for customers to review and complete
          </label>
        </div>
      </section>

      <section className="space-y-4 border-t border-zinc-200 pt-4">
        <div>
          <h3 className="font-extrabold">Signage setup</h3>
          <p className={HELP}>
            Configure the questions, choices, units, and pricing method shown for each signage service.
            Changes activate immediately for new and edited orders.
          </p>
        </div>
        {signageRules && (Object.keys(signageRules) as SignageType[]).map((type) => {
          const rule = signageRules[type];
          return (
            <div key={type} className="space-y-3 rounded-xl border border-zinc-300 p-4">
              <h4 className="font-extrabold">{rule.label}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Signage name
                  <input
                    className={INPUT}
                    value={rule.label}
                    maxLength={100}
                    onChange={(event) => updateSignageRule(type, { label: event.target.value })}
                  />
                </label>
                <label className="text-sm font-bold">
                  Short description
                  <input
                    className={INPUT}
                    value={rule.help}
                    maxLength={300}
                    onChange={(event) => updateSignageRule(type, { help: event.target.value })}
                  />
                </label>
              </div>
              <fieldset>
                <legend className="text-sm font-bold">Allowed pricing methods</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  {(['tier', 'area'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rule.pricingModes.includes(mode)}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...rule.pricingModes, mode]
                            : rule.pricingModes.filter((item) => item !== mode);
                          if (next.length) updateSignageRule(type, { pricingModes: next });
                        }}
                        className={CHECKBOX}
                      />
                      {mode === 'area' ? 'By area (width x height)' : 'Fixed or quantity price'}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-bold">
                Allowed units
                <input
                  className={INPUT}
                  value={rule.units.join(', ')}
                  placeholder="per pc, per set, per sq.ft"
                  onChange={(event) => updateSignageRule(type, {
                    units: event.target.value.split(',').map((unit) => unit.trim()).filter(Boolean),
                  })}
                />
                <span className={`block font-normal ${HELP}`}>Separate units with commas.</span>
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-bold">Customer information fields</h5>
                  <button
                    type="button"
                    onClick={() => updateSignageRule(type, {
                      fields: [...rule.fields, { key: '', label: '', required: false, placeholder: '' }],
                    })}
                    className="rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-extrabold"
                  >
                    Add field
                  </button>
                </div>
                {rule.fields.map((field, fieldIndex) => (
                  <div key={`${type}-${fieldIndex}`} className="grid gap-2 rounded-lg bg-zinc-50 p-3 sm:grid-cols-6">
                    <label className="text-xs font-bold sm:col-span-2">
                      Field name
                      <input
                        className={`${INPUT} mt-1`}
                        value={field.label}
                        onChange={(event) => {
                          const fields = rule.fields.map((item, index) =>
                            index === fieldIndex
                              ? { ...item, label: event.target.value, key: fieldKeyFromLabel(event.target.value) }
                              : item);
                          updateSignageRule(type, { fields });
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold sm:col-span-1">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) => {
                          const fields = rule.fields.map((item, index) =>
                            index === fieldIndex ? { ...item, required: event.target.checked } : item);
                          updateSignageRule(type, { fields });
                        }}
                        className={CHECKBOX}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => updateSignageRule(type, {
                        fields: rule.fields.filter((_, index) => index !== fieldIndex),
                      })}
                      className="h-9 self-end rounded-lg border border-red-300 bg-red-50 px-2 text-xs font-extrabold text-red-700"
                    >
                      Remove
                    </button>
                    <label className="text-xs font-bold sm:col-span-3">
                      Guide text
                      <input
                        className={`${INPUT} mt-1`}
                        value={field.placeholder ?? ''}
                        placeholder="Optional text shown inside the field"
                        onChange={(event) => {
                          const fields = rule.fields.map((item, index) =>
                            index === fieldIndex
                              ? { ...item, placeholder: event.target.value || undefined }
                              : item);
                          updateSignageRule(type, { fields });
                        }}
                      />
                    </label>
                    <label className="text-xs font-bold sm:col-span-3">
                      Choices
                      <input
                        className={`${INPUT} mt-1`}
                        value={(field.options ?? []).join(', ')}
                        placeholder="Separate choices with commas"
                        onChange={(event) => {
                          const options = event.target.value.split(',').map((option) => option.trim()).filter(Boolean);
                          const fields = rule.fields.map((item, index) =>
                            index === fieldIndex
                              ? { ...item, options: options.length ? options : undefined }
                              : item);
                          updateSignageRule(type, { fields });
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm font-bold text-emerald-700">{success}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl border border-black bg-[#D4A017] px-5 py-3 font-extrabold text-black hover:bg-[#E6B222] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? 'Saving settings…' : 'Save and activate system settings'}
      </button>
    </form>
  );
}

