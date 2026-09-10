/**
 * The takeover's DOM chores, kept out of React so `HomeHero` reads as a state
 * machine rather than a pile of style writes. Nothing here holds state; every
 * function is called from an event handler or an effect with the element in
 * hand.
 */

export type Rect = { top: number; left: number; width: number; height: number };

/** The easing every takeover move uses — the same ease-out as the page's transitions. */
export const TAKEOVER_EASE = 'cubic-bezier(.2,.8,.2,1)';
export const EXPAND_MS = 900;
export const COLLAPSE_MS = 700;
export const CARD_RADIUS = '20px';

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

/** Pin an element to a rect. Used before an animation starts, so it has a "from". */
export function applyRect(el: HTMLElement, r: Rect, radius: string) {
  Object.assign(el.style, px(r), { borderRadius: radius });
}

/**
 * A FLIP between two rects. Animating the box rather than a transform keeps
 * `object-fit: cover` honest — the crop the traveller saw on the card is the
 * crop that grows, instead of a scaled copy that jumps at the end.
 */
export function keyframesFor(from: Rect, to: Rect, radiusFrom: string, radiusTo: string): Keyframe[] {
  return [
    { ...px(from), borderRadius: radiusFrom },
    { ...px(to), borderRadius: radiusTo },
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
