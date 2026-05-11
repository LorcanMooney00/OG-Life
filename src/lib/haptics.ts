/**
 * Tiny haptics helper. Web only has `navigator.vibrate`, which is a no-op on iOS
 * Safari (Apple doesn’t let the Vibration API run on iPhone), but works on
 * Android/Chrome and most PWAs. We swallow errors so unsupported devices don’t
 * crash the gesture pipeline.
 *
 * Named “intensities” (rather than raw ms values) keep call-sites readable and
 * let us tune them in one place.
 */
export type HapticIntensity = 'light' | 'medium' | 'heavy' | 'success'

const PATTERN: Record<HapticIntensity, number | number[]> = {
  light: 8,
  medium: 14,
  heavy: 22,
  success: [10, 30, 10],
}

export function haptic(kind: HapticIntensity = 'light') {
  if (typeof navigator === 'undefined') return
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(PATTERN[kind])
  } catch {
    /* unsupported / blocked by user-gesture rules */
  }
}
