export type AgeFallback = 'attend' | 'postpone';
export const AGE_PREFERENCE_KEYS = [
  'onboarding_age_fallback', 'onboarding_age_confirmed_at',
] as const;

export function parseAgeFallback(value: unknown): AgeFallback | null {
  return value === 'attend' || value === 'postpone' ? value : null;
}

export function validAgeRange(value: unknown): value is { min: number; max: number } {
  const range = value as { min?: number; max?: number } | null;
  return !!range && Number.isInteger(range.min) && Number.isInteger(range.max)
    && range.min! >= 18 && range.max! <= 60 && range.max! - range.min! >= 10;
}

export function moveAgeBound(range: { min: number; max: number }, bound: 'min' | 'max', value: number) {
  if (bound === 'min') {
    const min = Math.min(50, Math.max(18, Math.round(value)));
    return { min, max: Math.max(range.max, min + 10) };
  }
  const max = Math.max(28, Math.min(60, Math.round(value)));
  return { min: Math.min(range.min, max - 10), max };
}

// Missing answers from older app versions are unknown, never implicit consent.
export function agePreferenceFields(fallback: unknown, confirmedAt: unknown) {
  const choice = parseAgeFallback(fallback);
  const date = typeof confirmedAt === 'string' && Number.isFinite(Date.parse(confirmedAt))
    ? confirmedAt : null;
  return { age_range_fallback: choice, age_range_confirmed_at: choice ? date : null };
}
