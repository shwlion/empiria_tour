/**
 * The postcard deck's arithmetic — a port of the CardSwap component's slot
 * maths and timeline, with nothing that needs a browser.
 *
 * Pure on purpose, for the same reason `lib/pricing.ts` is: the server renders
 * the initial stack from these numbers as inline styles (so nothing flashes
 * before hydration), and the client animates between the same numbers. One
 * module, called from both sides, is the only version of that which stays
 * true. The DOM half lives in `components/home/useDeckEngine.ts`.
 *
 * The deck was a GSAP component. GSAP is not a dependency here (§5.7 makes
 * every added package a licence to clear), so the animation runs on the Web
 * Animations API and the elastic curve is reproduced below and handed to CSS
 * as a `linear()` easing. Same numbers, no library.
 */

export type DeckConfig = {
  /** Horizontal step between stacked cards, in px. */
  distX: number;
  /** Vertical step between stacked cards, in px (cards go UP the stack). */
  distY: number;
  /** The lean, in degrees — what makes a stack read as a stack. */
  skew: number;
  /** Time between swaps, in ms. */
  delay: number;
  durDrop: number;
  durMove: number;
  durReturn: number;
  /** How far into the drop the other cards start promoting (0–1 of durDrop). */
  promoteOverlap: number;
  /** How far into the promote the front card starts returning (0–1 of durMove). */
  returnDelay: number;
  /** Stagger between promoting cards, in ms. */
  promoteStagger: number;
  /** Stagger when the deck re-lays itself after a card is popped or restored, in ms. */
  layoutStagger: number;
  /** How far the front card falls before it swings to the back, in px. */
  dropOffset: number;
};

/** The component's `elastic` preset, with the spacing the design settled on. */
export const DECK_DEFAULTS: DeckConfig = {
  distX: 40,
  distY: 44,
  skew: 4,
  delay: 5000,
  durDrop: 2000,
  durMove: 2000,
  durReturn: 2000,
  promoteOverlap: 0.9,
  returnDelay: 0.05,
  promoteStagger: 150,
  layoutStagger: 80,
  dropOffset: 500,
};

/** Tighter spacing under 640px, where the deck is 340px wide. */
export const DECK_SMALL = { distX: 22, distY: 26 } as const;

export type Slot = { x: number; y: number; z: number; zIndex: number };

/** Where card `i` of `total` sits: right, up, and back by 1.5× the horizontal step. */
export function slot(i: number, total: number, cfg: Pick<DeckConfig, 'distX' | 'distY'>): Slot {
  return { x: i * cfg.distX, y: -i * cfg.distY, z: -i * cfg.distX * 1.5, zIndex: total - i };
}

/**
 * The transform for a slot. Centre the card on the stage first, then offset it
 * in 3D, then lean it — the order matters, because the skew must not rotate
 * the offset.
 */
export function slotTransform(s: Pick<Slot, 'x' | 'y' | 'z'>, skew: number): string {
  return `translate(-50%,-50%) translate3d(${s.x}px,${s.y}px,${s.z}px) skewY(${skew}deg)`;
}

/** What a card's inline style needs, for server rendering. */
export function slotStyle(i: number, total: number, cfg: DeckConfig): { transform: string; zIndex: number } {
  const s = slot(i, total, cfg);
  return { transform: slotTransform(s, cfg.skew), zIndex: s.zIndex };
}

/**
 * GSAP's `elastic.out(1, period)`: a fast approach with one small overshoot
 * that settles. With amplitude 1 the phase shift is a quarter period.
 */
export function elasticOut(t: number, period = 0.9): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const s = period / 4;
  return Math.pow(2, -10 * t) * Math.sin(((t - s) * 2 * Math.PI) / period) + 1;
}

/**
 * The same curve as a CSS `linear()` easing, sampled evenly. Forty-eight
 * intervals is enough that the overshoot renders as a curve rather than a
 * polyline; the string is built once per page, not per frame.
 */
export function elasticLinear(period = 0.9, samples = 48): string {
  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    points.push(`${elasticOut(t, period).toFixed(4)} ${(t * 100).toFixed(2)}%`);
  }
  return `linear(${points.join(', ')})`;
}

/** For browsers without `linear()`: a plain ease-out, so the deck still moves. */
export const ELASTIC_FALLBACK = 'cubic-bezier(.2,.8,.2,1)';

/**
 * The two labels of the swap timeline, in ms from the start of the drop: the
 * other cards promote a fifth of the way into the drop, and the front card
 * starts its return just after that.
 */
export function timeline(cfg: DeckConfig): { promoteAt: number; returnAt: number } {
  // Whole milliseconds: these feed timers and animation delays, and
  // 2000 × (1 − 0.9) is 199.99999999999994 in floating point.
  const promoteAt = Math.round(cfg.durDrop * (1 - cfg.promoteOverlap));
  return { promoteAt, returnAt: Math.round(promoteAt + cfg.durMove * cfg.returnDelay) };
}

/** After a swap, the front card is at the back. */
export function nextOrder(order: readonly number[]): number[] {
  return order.length < 2 ? [...order] : [...order.slice(1), order[0]];
}

/** The deck without one card — after it has been popped into the takeover. */
export function withoutCard(order: readonly number[], idx: number): number[] {
  return order.filter((i) => i !== idx);
}

/** The deck with a card back at the front — after the takeover closes. */
export function restoredToFront(order: readonly number[], idx: number): number[] {
  return [idx, ...withoutCard(order, idx)];
}
