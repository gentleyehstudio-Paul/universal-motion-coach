// Zero-phase 2nd-order Butterworth low-pass filter, applied forward then
// backward (filtfilt) to cancel phase lag — the same class of filter
// Sports2D/Pose2Sim use to clean up noisy keypoint streams before
// deriving angles/velocities (see docs/research.md §2). 6 Hz is a
// conventional default cutoff for human movement in biomechanics
// filtering literature; callers may override it.
//
// Simplification versus Sports2D's own implementation: this does not
// pad/reflect the signal at its boundaries before filtering, so the
// first/last few samples of a short clip see slightly more transient
// error than the interior. Acceptable for V0 clip lengths (seconds, not
// frames-scarce); revisit if phase-detection near clip boundaries proves
// sensitive to it.
export function butterworthLowpassFiltfilt(
  signal: number[],
  sampleRateHz: number,
  cutoffHz = 6
): number[] {
  if (signal.length < 4) return [...signal];
  const { b0, b1, b2, a1, a2 } = butterworthCoefficients(sampleRateHz, cutoffHz);
  const forward = applyBiquad(signal, b0, b1, b2, a1, a2);
  const reversed = [...forward].reverse();
  const backward = applyBiquad(reversed, b0, b1, b2, a1, a2);
  return backward.reverse();
}

function butterworthCoefficients(sampleRateHz: number, cutoffHz: number) {
  const nyquist = sampleRateHz / 2;
  const clampedCutoff = Math.min(cutoffHz, nyquist * 0.99);
  const c = 1 / Math.tan((Math.PI * clampedCutoff) / sampleRateHz);
  const a0 = 1 + Math.SQRT2 * c + c * c;
  const b0 = 1 / a0;
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = (2 * (1 - c * c)) / a0;
  const a2 = (1 - Math.SQRT2 * c + c * c) / a0;
  return { b0, b1, b2, a1, a2 };
}

function applyBiquad(
  x: number[],
  b0: number,
  b1: number,
  b2: number,
  a1: number,
  a2: number
): number[] {
  const y = new Array<number>(x.length);
  // Steady-state initial conditions (hold at the first sample) reduce
  // start-up transients versus assuming zero history.
  const x0 = x[0]!;
  let xPrev1 = x0;
  let xPrev2 = x0;
  let yPrev1 = x0;
  let yPrev2 = x0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = b0 * xi + b1 * xPrev1 + b2 * xPrev2 - a1 * yPrev1 - a2 * yPrev2;
    y[i] = yi;
    xPrev2 = xPrev1;
    xPrev1 = xi;
    yPrev2 = yPrev1;
    yPrev1 = yi;
  }
  return y;
}
