'use client';

import {
  DECK_SMALL,
  ELASTIC_FALLBACK,
  elasticLinear,
  nextOrder,
  restoredToFront,
  slot,
  slotTransform,
  timeline,
  withoutCard,
  type DeckConfig,
  type Slot,
} from '@/lib/deck';

/**
 * The DOM half of the postcard deck — the CardSwap component's timeline on the
 * Web Animations API instead of GSAP.
 *
 * One swap, in the component's own order: the front card drops; a fifth of the
 * way into the drop the other cards each move up one slot, 150ms apart; just
 * after that the front card swings from wherever it has got to into the back
 * slot. Every card gets one `animate()` call per move with `fill: 'forwards'`,
 * and when it finishes the final transform is committed to the inline style
 * and the animation cancelled — so nothing accumulates, and the inline style
 * (the same string the server rendered) is always the truth between swaps.
 *
 * `remove` and `restore` exist for the takeover: a card leaves the deck to
 * become the background and comes back to the front when it closes. Both
 * cancel anything in flight first, so a click mid-swap re-lays the deck from
 * the positions the cards are actually in rather than from where they were
 * heading.
 */
export type DeckHandle = {
  /** Pop a card out; the rest close ranks. No-op if it is already out. */
  remove(idx: number): void;
  /** Put a card back at the front — placed instantly, so its rect can be measured for the fly-back. */
  restore(idx: number): void;
  pause(): void;
  resume(): void;
  destroy(): void;
};

function supportsLinearEasing(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    && CSS.supports('animation-timing-function', 'linear(0, 1)');
}

export function createDeckEngine(cards: HTMLElement[], base: DeckConfig, reduce: boolean): DeckHandle {
  // The server rendered the desktop spacing; a phone gets the tighter one on
  // the first layout below, which is the one frame where the two may differ.
  const cfg: DeckConfig = window.innerWidth < 640 ? { ...base, ...DECK_SMALL } : base;
  const ease = supportsLinearEasing() ? elasticLinear() : ELASTIC_FALLBACK;
  const { promoteAt, returnAt } = timeline(cfg);

  let order = cards.map((_, i) => i);
  let live: Animation[] = [];
  let timer: number | null = null;

  const place = (el: HTMLElement, s: Slot) => {
    el.style.transform = slotTransform(s, cfg.skew);
    el.style.zIndex = String(s.zIndex);
  };
  const run = (el: HTMLElement, transform: string, duration: number, delay: number): Animation => {
    const a = el.animate([{ transform }], { duration, delay, easing: ease, fill: 'forwards' });
    live.push(a);
    return a;
  };
  // Bake the end state in, then drop the animation. `commitStyles` throws on an
  // element that is not rendered, which is why it is guarded rather than trusted.
  const settle = (a: Animation, el: HTMLElement, s: Slot) => {
    a.finished
      .then(() => {
        try { a.commitStyles(); a.cancel(); } catch { /* not rendered: place() below is enough */ }
        place(el, s);
      })
      .catch(() => { /* cancelled by a re-layout — it has already been placed */ });
  };
  const clearLive = () => {
    for (const a of live) { try { a.cancel(); } catch { /* already gone */ } }
    live = [];
  };

  function layout(animate: boolean, instantIdx = -1) {
    clearLive();
    const total = order.length;
    order.forEach((idx, i) => {
      const el = cards[idx];
      const s = slot(i, total, cfg);
      el.style.zIndex = String(s.zIndex);
      if (animate && !reduce && idx !== instantIdx) {
        settle(run(el, slotTransform(s, cfg.skew), cfg.durMove, i * cfg.layoutStagger), el, s);
      } else {
        place(el, s);
      }
    });
  }

  function swap() {
    if (document.hidden || live.length > 0 || order.length < 2) return;
    const total = order.length;
    const [front, ...rest] = order;
    const elFront = cards[front];
    const s0 = slot(0, total, cfg);

    const drop = run(elFront, slotTransform({ ...s0, y: s0.y + cfg.dropOffset }, cfg.skew), cfg.durDrop, 0);

    rest.forEach((idx, i) => {
      const el = cards[idx];
      const s = slot(i, total, cfg);
      // Promoted cards can take their new z-index at once: they are all still
      // behind the front card until it goes to the back.
      el.style.zIndex = String(s.zIndex);
      settle(run(el, slotTransform(s, cfg.skew), cfg.durMove, promoteAt + i * cfg.promoteStagger), el, s);
    });

    const back = slot(total - 1, total, cfg);
    window.setTimeout(() => {
      // Only if this swap is still the one running — a re-layout may have
      // cancelled it and put the card somewhere else.
      if (live.includes(drop)) elFront.style.zIndex = String(back.zIndex);
    }, returnAt);

    const ret = run(elFront, slotTransform(back, cfg.skew), cfg.durReturn, returnAt);
    ret.finished
      .then(() => {
        try { drop.cancel(); ret.commitStyles(); ret.cancel(); } catch { /* see settle() */ }
        place(elFront, back);
        order = nextOrder(order);
        live = [];
      })
      .catch(() => { /* cancelled mid-swap by remove()/restore(); layout() has taken over */ });
  }

  function start() {
    if (reduce || timer != null) return;
    timer = window.setInterval(swap, cfg.delay);
  }
  function stop() {
    if (timer != null) { window.clearInterval(timer); timer = null; }
  }
  // A hidden tab keeps its timer but skips swaps (see swap()); stopping it
  // outright means no burst of queued moves when the tab comes back.
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVisibility);

  layout(false);
  start();

  return {
    remove(idx) {
      if (!order.includes(idx)) return;
      order = withoutCard(order, idx);
      layout(true);
    },
    restore(idx) {
      order = restoredToFront(order, idx);
      layout(true, idx);
    },
    pause() {
      stop();
      for (const a of live) a.pause();
    },
    resume() {
      for (const a of live) a.play();
      start();
    },
    destroy() {
      stop();
      clearLive();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
