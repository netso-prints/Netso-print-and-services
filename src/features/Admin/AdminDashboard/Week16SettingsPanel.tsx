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
  const [signageRulesText, setSignageRulesText] = useState('');
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
          throw new Error(result.error || 'Unable to load Week 16 settings.');
        }
        const settings = result as Week16Settings;
        if (active) {
          setForm(toForm(settings));
          setSignageRulesText(JSON.stringify(settings.signageRules, null, 2));
        }
      })
      .catch((loadError: unknown) => {
        console.error('Unable to load Week 16 settings:', loadError);
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load Week 16 settings.');
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

    let signageRules: unknown;
    try {
      signageRules = JSON.parse(signageRulesText);
    } catch {
      setError('Signage rules must be valid JSON. Review the example and correct the syntax.');
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
        throw new Error(result.error || 'Unable to save Week 16 settings.');
      }
      const settings = result as Week16Settings;
      setForm(toForm(settings));
      setSignageRulesText(JSON.stringify(settings.signageRules, null, 2));
      setSuccess('Week 16 settings saved and activated.');
    } catch (saveError) {
      console.error('Unable to save Week 16 settings:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Week 16 settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-300 bg-white p-5 text-sm font-semibold text-zinc-600 shadow-sm">
        Loading Week 16 settings…
      </section>
    );
  }

  if (!form) {
    return (
      <section className="rounded-2xl border border-red-300 bg-white p-5 text-sm font-semibold text-red-700 shadow-sm">
        {error || 'Week 16 settings are unavailable.'}
      </section>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-2xl border border-[#D4A017] bg-white p-5 text-zinc-950 shadow-sm">
      <div>
        <h2 className="text-lg font-extrabold">Week 16 system settings</h2>
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

      <section className="space-y-2 border-t border-zinc-200 pt-4">
        <h3 className="font-extrabold">Signage fields, units, and pricing modes</h3>
        <p className={HELP}>
          Edit the JSON rules for Panaprint/Panaflex, Acrylic, and Cut-out Signage. Field keys must be unique within
          each type. Required fields and option lists are validated when services are saved and orders are submitted.
          Changes activate immediately.
        </p>
        <textarea
          aria-label="Signage rules JSON"
          className={`${INPUT} font-mono text-xs`}
          rows={18}
          value={signageRulesText}
          onChange={(event) => {
            setSignageRulesText(event.target.value);
            setError('');
            setSuccess('');
          }}
          spellCheck={false}
        />
      </section>

      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm font-bold text-emerald-700">{success}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl border border-black bg-[#D4A017] px-5 py-3 font-extrabold text-black hover:bg-[#E6B222] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? 'Saving settings…' : 'Save and activate Week 16 settings'}
      </button>
    </form>
  );
}

