import { HOUR, dayKey, slotTime } from './time';
import type { PainEntry } from './types';

export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function isStandalone() {
  return (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
}

export type SlotState = 'done' | 'due' | 'upcoming' | 'open';

export function slotStatus(slot: string, pains: PainEntry[], now = Date.now()): SlotState {
  const t = slotTime(slot, now);
  const today = dayKey(now);
  const done = pains.some((p) => dayKey(p.time) === today && (p.slot === slot || (p.mode === 'checkin' && Math.abs(p.time - t) <= HOUR)));
  if (done) return 'done';
  if (now < t - 30 * 60_000) return 'upcoming';
  if (now <= t + 3 * HOUR) return 'due';
  return 'open';
}
