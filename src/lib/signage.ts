import type { PricingMode } from '@/lib/pricing';
import { z } from 'zod';

export type SignageType = 'panaprint-panaflex' | 'acrylic' | 'cut-out';

export interface SignageField {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface SignageRule {
  label: string;
  help: string;
  pricingModes: PricingMode[];
  units: string[];
  fields: SignageField[];
}

export const SIGNAGE_TYPES: Record<SignageType, SignageRule> = {
  'panaprint-panaflex': {
    label: 'Panaprint/Panaflex',
    help: 'Priced by area (width x height). Rates are per sq.ft.',
    pricingModes: ['area'],
    units: ['per sq.ft'],
    fields: [
      { key: 'material', label: 'Material', required: true, placeholder: 'e.g. Panaflex 20oz' },
      { key: 'finish', label: 'Finish', required: false, options: ['Matte', 'Glossy'] },
      {
        key: 'framing',
        label: 'Framing / finishing',
        required: false,
        options: ['None', 'Grommets only', 'Wooden frame', 'Metal frame'],
      },
    ],
  },
  acrylic: {
    label: 'Acrylic',
    help: 'Priced per piece or by area. Thickness is required.',
    pricingModes: ['tier', 'area'],
    units: ['per pc', 'per sq.in', 'per sq.ft'],
    fields: [
      { key: 'thickness', label: 'Thickness', required: true, options: ['3mm', '5mm', '8mm', '10mm'] },
      { key: 'mounting', label: 'Mounting', required: false, options: ['Standoff pins', 'Flat / adhesive', 'Stand-up'] },
      { key: 'finish', label: 'Finish', required: false, options: ['Clear', 'Frosted', 'Colored'] },
    ],
  },
  'cut-out': {
    label: 'Cut-out Signage',
    help: 'Priced per piece, per letter height or by area. Base material and thickness are required.',
    pricingModes: ['tier', 'area'],
    units: ['per pc', 'per set', 'per inch', 'per sq.in', 'per sq.ft'],
    fields: [
      { key: 'material', label: 'Base material', required: true, placeholder: 'e.g. Sintra, Acrylic, Stainless' },
      { key: 'thickness', label: 'Thickness', required: true, placeholder: 'e.g. 5mm' },
      { key: 'style', label: 'Lettering style', required: false, options: ['Flat', '3D / raised', 'Backlit'] },
    ],
  },
};

const signageFieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-zA-Z0-9_]*$/).max(40),
  label: z.string().trim().min(1).max(100),
  required: z.boolean(),
  placeholder: z.string().trim().max(120).optional(),
  options: z.array(z.string().trim().min(1).max(80)).min(1).max(30).optional(),
});

const signageRuleSchema = z.object({
  label: z.string().trim().min(1).max(100),
  help: z.string().trim().min(1).max(300),
  pricingModes: z.array(z.enum(['tier', 'area'])).min(1).max(2),
  units: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  fields: z.array(signageFieldSchema).max(20),
}).superRefine((rule, context) => {
  const fieldKeys = rule.fields.map((field) => field.key);
  if (new Set(fieldKeys).size !== fieldKeys.length) {
    context.addIssue({ code: 'custom', message: 'Signage field keys must be unique.' });
  }
});

export const signageRulesSchema = z.object({
  'panaprint-panaflex': signageRuleSchema,
  acrylic: signageRuleSchema,
  'cut-out': signageRuleSchema,
});

export function parseSignageRules(value: unknown): Record<SignageType, SignageRule> | null {
  const parsed = signageRulesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isSignageType(value: unknown): value is SignageType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SIGNAGE_TYPES, value);
}

export function sanitizeSignageConfig(
  type: SignageType,
  raw: Record<string, unknown> | undefined,
  rules: Record<SignageType, SignageRule> = SIGNAGE_TYPES,
): { config: Record<string, string>; error?: string } {
  const rule = rules[type];
  const config: Record<string, string> = {};
  for (const field of rule.fields) {
    const candidate = raw?.[field.key];
    const value = typeof candidate === 'string' ? candidate.trim().slice(0, 100) : '';
    if (!value) {
      if (field.required) return { config, error: `${field.label} is required for ${rule.label}.` };
      continue;
    }
    if (field.options && !field.options.includes(value)) {
      return { config, error: `${field.label} must be one of: ${field.options.join(', ')}.` };
    }
    config[field.key] = value;
  }
  return { config };
}

export function validateSignageOptions(
  type: SignageType,
  options: Array<{ label: string; pricingMode: string; unit: string }>,
  rules: Record<SignageType, SignageRule> = SIGNAGE_TYPES,
): string | null {
  const rule = rules[type];
  for (const option of options) {
    if (!rule.pricingModes.some((mode: PricingMode) => mode === option.pricingMode)) {
      return `"${option.label}" must use ${rule.pricingModes.includes('area') && rule.pricingModes.length === 1 ? 'per-area pricing' : 'a pricing mode allowed for ' + rule.label}.`;
    }
    if (!rule.units.includes(option.unit)) {
      return `"${option.label}" must use one of these units for ${rule.label}: ${rule.units.join(', ')}.`;
    }
    if (option.pricingMode === 'area' && !option.unit.includes('sq')) {
      return `"${option.label}" is priced by area, so its unit must be per sq.ft or per sq.in.`;
    }
  }
  return null;
}