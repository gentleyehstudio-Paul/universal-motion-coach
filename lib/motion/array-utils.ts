/** Forward-fills gaps from the nearest earlier non-null value, then
 * back-fills any leading gap from the first non-null value. Used so
 * per-frame "always present" outputs (torsoAngle, centers) degrade
 * gracefully across the brief occlusions real webcam footage produces,
 * instead of requiring every single frame to have detected every joint. */
export function fillGaps<T>(values: (T | null)[]): T[] {
  const result = new Array<T | null>(values.length).fill(null);
  let last: T | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? null;
    if (v !== null) last = v;
    result[i] = last;
  }
  let first: T | null = null;
  for (let i = 0; i < result.length; i++) {
    const v = result[i] ?? null;
    if (v !== null) {
      first = v;
      break;
    }
  }
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) result[i] = first;
  }
  return result as T[];
}

export function firstNonNull<T>(values: (T | null)[]): T | null {
  for (const v of values) if (v !== null) return v;
  return null;
}

export function lastNonNull<T>(values: (T | null)[]): T | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i] ?? null;
    if (v !== null) return v;
  }
  return null;
}
