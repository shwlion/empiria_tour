'use client';

import Image from 'next/image';
import { useEffect, useImperativeHandle, useMemo, useRef, type CSSProperties, type Ref } from 'react';
import { DECK_DEFAULTS, slotStyle, type DeckConfig } from '@/lib/deck';
import { isOptimisableImage } from '@/lib/images';
import { useReducedMotion } from '@/lib/motion';
import type { ShowcaseCard } from '@/lib/catalogue';
import { createDeckEngine, type DeckHandle } from './useDeckEngine';
import { rectOf, unskewedRect, type Frame } from './takeover';

/**
 * The postcard deck — four illustrative cards in a leaning 3D stack that swaps
 * itself every few seconds. A port of the CardSwap component with the deck
 * maths in `lib/deck.ts` and the animation in `useDeckEngine.ts`.
 *
 * The stack is rendered on the server with each card's slot as an inline
 * style, so the first paint is already the stack and hydration only starts
 * the clock. Cards are buttons, not links: tapping one opens the takeover,
 * and the one link lives inside that.
 */
export type DeckApi = {
  remove(id: string): void;
  restore(id: string): void;
  /** The card's unskewed box and the lean it is drawn with — see takeover.ts. */
  frameOf(id: string): Frame | null;
  focus(id: string): void;
  /** Stop the swap clock (and freeze anything mid-move) while the takeover is up. */
  pause(): void;
  /** Start it again — unless the pointer is resting on the deck, which pauses it too. */
  resume(): void;
};

export default function PostcardDeck({
  cards,
  expandedId,
  onSelect,
  ref,
  config,
}: {
  cards: ShowcaseCard[];
  /** The card currently out of the deck, if any — it stays in the DOM, hidden by CSS. */
  expandedId: string | null;
  onSelect: (card: ShowcaseCard) => void;
  ref?: Ref<DeckApi>;
  config?: Partial<DeckConfig>;
}) {
  const reduce = useReducedMotion();
  const cfg = useMemo<DeckConfig>(() => ({ ...DECK_DEFAULTS, ...config }), [config]);
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const engine = useRef<DeckHandle | null>(null);
  // Hover pauses the deck; so does the takeover. Whichever ends second must
  // not restart the clock while the other still holds it.
  const hovering = useRef(false);
  const expandedRef = useRef<string | null>(expandedId);
  useEffect(() => {
    expandedRef.current = expandedId;
  }, [expandedId]);

  const ids = cards.map((c) => c.id).join('|');
  const indexOf = (id: string) => cards.findIndex((c) => c.id === id);

  useEffect(() => {
    const els = cards.map((c) => nodes.current.get(c.id)).filter((el): el is HTMLButtonElement => !!el);
    if (els.length < 2) return;
    const handle = createDeckEngine(els, cfg, reduce);
    engine.current = handle;
    // Re-created while a card is out (the motion preference changed mid-takeover):
    // keep it out, or the deck would lay four cards under a full-screen photo.
    if (expandedRef.current) handle.remove(indexOf(expandedRef.current));
    return () => {
      handle.destroy();
      engine.current = null;
    };
    // `ids` stands in for `cards`: the engine only cares which cards exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, cfg, reduce]);

  useImperativeHandle(
    ref,
    () => ({
      remove: (id) => engine.current?.remove(indexOf(id)),
      restore: (id) => engine.current?.restore(indexOf(id)),
      frameOf: (id) => {
        const el = nodes.current.get(id);
        if (!el) return null;
        return { rect: unskewedRect(rectOf(el), cfg.skew), skew: cfg.skew };
      },
      focus: (id) => nodes.current.get(id)?.focus({ preventScroll: true }),
      pause: () => engine.current?.pause(),
      resume: () => { if (!hovering.current) engine.current?.resume(); },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids]
  );

  return (
    <div
      className="deck relative mx-auto h-[240px] w-full max-w-[340px] sm:h-[300px] sm:max-w-[420px] lg:h-[330px] lg:max-w-[460px]"
      role="region"
      aria-label="Postcards — what a trip could be"
      onMouseEnter={() => { hovering.current = true; engine.current?.pause(); }}
      onMouseLeave={() => { hovering.current = false; engine.current?.resume(); }}
    >
      <div className="deck-stage">
        {cards.map((card, i) => {
          const s = slotStyle(i, cards.length, cfg);
          const style: CSSProperties = { transform: s.transform, zIndex: s.zIndex };
          return (
            <button
              key={card.id}
              type="button"
              ref={(el) => {
                if (el) nodes.current.set(card.id, el);
                else nodes.current.delete(card.id);
              }}
              style={style}
              className="pc group overflow-hidden rounded-card border border-line bg-white text-left shadow-lift-card"
              aria-haspopup="dialog"
              aria-expanded={expandedId === card.id}
              aria-label={card.title}
              onClick={() => onSelect(card)}
            >
              <Image
                src={card.imageUrl}
                alt={card.imageAlt}
                fill
                priority={i === 0}
                sizes="(max-width: 640px) 340px, (max-width: 1024px) 420px, 460px"
                // A URL from a host next.config does not know throws at render.
                // Content is typed by hand in the console, so ask first.
                unoptimized={!isOptimisableImage(card.imageUrl)}
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" aria-hidden="true" />
              <div className="absolute bottom-0 left-0 right-0 p-7 text-white sm:p-8">
                {card.kicker && (
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-label text-white/75">{card.kicker}</p>
                )}
                <h3 className="font-display text-[22px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                  {card.title}
                </h3>
                <p className="mt-1.5 max-w-[85%] text-[14px] leading-relaxed text-white/70">{card.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
