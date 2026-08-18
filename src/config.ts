interface FeatureFlags {
  gateHighlights: boolean;
  countdownSeconds: number;
}

const DEFAULT_FLAGS: FeatureFlags = {
  gateHighlights: false,
  countdownSeconds: 0,
};

/**
 * Feature flags are baked in at build time so the board does not need a config
 * request on load. VITE_FEATURE_FLAGS is optional — CI does not set it, so
 * fall back to the defaults instead of crashing on every page load.
 */
export function featureFlags(): FeatureFlags {
  const raw = import.meta.env.VITE_FEATURE_FLAGS;

  if (!raw) {
    return DEFAULT_FLAGS;
  }

  try {
    return JSON.parse(raw) as FeatureFlags;
  } catch {
    return DEFAULT_FLAGS;
  }
}
