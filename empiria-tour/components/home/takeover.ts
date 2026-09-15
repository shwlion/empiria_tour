/**
 * The takeover's DOM chores, kept out of React so `HomeHero` reads as a state
 * machine rather than a pile of style writes. Nothing here holds state; every
 * function is called from an event handler or an effect with the element in
 * hand.
 */

export type Rect = { top: number; left: number; width: number; height: number };

/**
 * The expand keeps the page's eager ease-out: opening should feel like the
 * photo leaping up. The collapse does not. That curve puts 55% of the motion
 * in the first 83ms of a 700ms move — measured — which on a full-viewport
 * photo shrinking to a card reads as a drop. Closing is setting something
 * down: a soft start, a decisive middle, a gentle landing, and a little
 * longer to do it in. (Client's request, 14 Sep.)
 */
export const TAKEOVER_EASE = 'cubic-bezier(.2,.8,.2,1)';
export const COLLAPSE_EASE = 'cubic-bezier(.32,.08,.18,1)';
export const EXPAND_MS = 900;
export const COLLAPSE_MS = 950;
export const CARD_RADIUS = '20px';

/**
 * A card's box and the lean it is drawn with. The deck skews every card by a
 * few degrees; a layer flying to the card's *bounding* box lands as a flat
 * rectangle a little taller than the card and is then swapped for a
 * parallelogram — a visible snap. The layer flies to the unskewed box and
 * leans as it goes, so at touchdown it is the card's exact shape.
 */
export type Frame = { rect: Rect; skew: number };

/**
 * The unskewed box behind a bounding box. `skewY` about the centre leaves the
 * width and the centre alone and adds `width × tan(skew)` to the height, half
 * above and half below — so take that back off. Holds under the deck's
 * perspective too: a depth translate is a uniform scale, and a ratio survives
 * one.
 */
export function unskewedRect(bounding: Rect, skewDeg: number): Rect {
  const extra = bounding.width * Math.abs(Math.tan((skewDeg * Math.PI) / 180));
  return {
    top: bounding.top + extra / 2,
    left: bounding.left,
    width: bounding.width,
    height: bounding.height - extra,
  };
}

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function viewportRect(): Rect {
  return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

function px(r: Rect) {
  return { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` };
}

/** Pin an element to a rect and a lean. Used before an animation starts, so it has a "from". */
export function applyRect(el: HTMLElement, r: Rect, radius: string, skew = 0) {
  Object.assign(el.style, px(r), { borderRadius: radius, transform: `skewY(${skew}deg)` });
}

/**
 * A FLIP between two rects. Animating the box rather than a transform keeps
 * `object-fit: cover` honest — the crop the traveller saw on the card is the
 * crop that grows, instead of a scaled copy that jumps at the end. The one
 * transform that does ride along is the lean, so the layer can start or end
 * as the card's own shape.
 */
export function keyframesFor(
  from: Rect,
  to: Rect,
  radiusFrom: string,
  radiusTo: string,
  skewFrom = 0,
  skewTo = 0
): Keyframe[] {
  return [
    { ...px(from), borderRadius: radiusFrom, transform: `skewY(${skewFrom}deg)` },
    { ...px(to), borderRadius: radiusTo, transform: `skewY(${skewTo}deg)` },
  ];
}

/**
 * Freeze the page where it is and let the hero take the viewport.
 *
 * `overflow: hidden` on its own loses the scroll position in some browsers,
 * so the body is pinned at its current offset and the offset handed back for
 * `unlockScroll`. The class on <html> is what the takeover CSS keys on.
 */
export function lockScroll(): number {
  const y = window.scrollY;
  document.documentElement.classList.add('takeover');
  document.body.style.top = `-${y}px`;
  return y;
}

export function unlockScroll(y: number) {
  document.documentElement.classList.remove('takeover');
  document.body.style.top = '';
  window.scrollTo(0, y);
}

/**
 * Make everything except `el` inert — the navbar beside it, and the consent
 * banner and analytics that `app/layout.tsx` renders outside the page tree.
 * Walking up to <body> and marking every sibling at every level is what
 * reaches both without knowing the layout.
 */
export function setInertOutside(el: HTMLElement, on: boolean) {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (on) sibling.setAttribute('inert', '');
      else sibling.removeAttribute('inert');
    }
    node = parent;
  }
}
