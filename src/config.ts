interface FeatureFlags {
  gateHighlights: boolean;
  countdownSeconds: number;
}

/**
 * Feature flags are baked in at build time so the board does not need a config
 * request on load.
 */
export function featureFlags(): FeatureFlags {
  return JSON.parse(import.meta.env.VITE_FEATURE_FLAGS) as FeatureFlags;
}
