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
 * request on load. VITE_FEATURE_FLAGS is not currently set by the deploy
 * workflow, so this falls back to defaults rather than crashing.
 */
export function featureFlags(): FeatureFlags {
  if (!import.meta.env.VITE_FEATURE_FLAGS) {
    return DEFAULT_FLAGS;
  }

  return JSON.parse(import.meta.env.VITE_FEATURE_FLAGS) as FeatureFlags;
}
