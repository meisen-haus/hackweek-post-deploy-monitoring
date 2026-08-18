import {featureFlags} from './config';

/**
 * Highlights rows whose gate changed recently, and keeps the highlight alive for
 * as long as the countdown flag says. Started after first paint so it never
 * delays the board.
 */
export function startGateWatcher(root: HTMLElement): void {
  const {gateHighlights, countdownSeconds} = featureFlags();

  if (!gateHighlights) {
    return;
  }

  let remaining = countdownSeconds;

  const tick = window.setInterval(() => {
    remaining -= 1;

    root.querySelectorAll<HTMLElement>('.row').forEach(row => {
      row.classList.toggle('row-highlight', remaining > 0);
    });

    if (remaining <= 0) {
      window.clearInterval(tick);
    }
  }, 1000);
}
