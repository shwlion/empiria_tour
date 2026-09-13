'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ShowcaseCard } from '@/lib/catalogue';
import { isOptimisableImage } from '@/lib/images';
import { useReducedMotion } from '@/lib/motion';
import PostcardDeck, { type DeckApi } from './PostcardDeck';
import {
  CARD_RADIUS,
  COLLAPSE_MS,
  EXPAND_MS,
  TAKEOVER_EASE,
  applyRect,
  keyframesFor,
  lockScroll,
  rectOf,
  setInertOutside,
  unlockScroll,
  viewportRect,
  type Rect,
} from './takeover';

/**
 * The hero, and the takeover it can become.
 *
 * Tap a postcard and its photograph grows from the card's frame until it is
 * the hero's full-screen background; the section pins itself over everything
 * else, the page beneath is locked and made inert, the left column becomes
 * that postcard's words with one button, and the deck keeps the other three.
 * ✕ or Escape flies the photo back into the front of the deck.
 *
 * Three pieces of state, each a phase rather than a flag:
 *
 *   incoming   a layer flying from a card rect to the viewport
 *   background the layer that has arrived and now fills the viewport
 *   closing    a layer flying from the viewport back to the front slot
 *
 * `open` is "incoming or background". While `closing`, the page is already
 * back — the layer just has somewhere to land.
 *
 * Everything that measures or animates happens in handlers and layout
 * effects; state only changes in handlers and in animation callbacks, never
 * in an effect body (`react-hooks/set-state-in-effect`). The intro column is a
 * server-rendered slot and is hidden, not unmounted, so the search plate keeps
 * whatever the traveller typed.
 */
/** The load choreography's delay, as the custom property the CSS reads. */
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

type Incoming = { card: ShowcaseCard; from: Rect };
type Closing = { card: ShowcaseCard; to: Rect };

export default function HomeHero({ cards, intro }: { cards: ShowcaseCard[]; intro: ReactNode }) {
  const reduce = useReducedMotion();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [background, setBackground] = useState<ShowcaseCard | null>(null);
  const [closing, setClosing] = useState<Closing | null>(null);

  const sectionRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const incomingLayerRef = useRef<HTMLDivElement>(null);
  const closingLayerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckApi>(null);
  const scrollYRef = useRef(0);
  const openRef = useRef(false);
  // The card to focus once the takeover has fully closed. Focus cannot land on
  // it any earlier: it stays `visibility: hidden` until the fly-back has landed.
  const focusAfterRef = useRef<string | null>(null);

  const current = incoming?.card ?? background ?? null;
  const open = current !== null;
  // The card stays hidden until the fly-back has landed on it.
  const expandedId = current?.id ?? closing?.card.id ?? null;
  const shown = current ?? closing?.card ?? null;

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // ── opening ──────────────────────────────────────────────────────────────
  const select = useCallback(
    (card: ShowcaseCard, el: HTMLElement) => {
      if (current?.id === card.id || closing) return;
      const from = rectOf(el);
      const section = sectionRef.current;
      if (!open && section) {
        scrollYRef.current = lockScroll();
        setInertOutside(section, true);
      }
      if (current) deckRef.current?.restore(current.id);
      deckRef.current?.remove(card.id);
      if (reduce) {
        setIncoming(null);
        setBackground(card);
      } else {
        setIncoming({ card, from });
      }
    },
    [current, closing, open, reduce]
  );

  // The incoming layer's flight. Measured and started before paint, finished
  // in the animation's own callback.
  useLayoutEffect(() => {
    const el = incomingLayerRef.current;
    if (!incoming || !el) return;
    const { card, from } = incoming;
    const to = viewportRect();
    applyRect(el, from, CARD_RADIUS);
    const a = el.animate(keyframesFor(from, to, CARD_RADIUS, '0px'), {
      duration: EXPAND_MS,
      easing: TAKEOVER_EASE,
      fill: 'forwards',
    });
    let stale = false;
    a.finished
      .then(() => {
        if (stale) return;
        // Hold the end state in the inline style, then let React swap the
        // layers in one commit — no frame where the photo is neither.
        applyRect(el, to, '0px');
        try { a.cancel(); } catch { /* already gone */ }
        setBackground(card);
        setIncoming(null);
      })
      .catch(() => { /* interrupted by another selection or a close */ });
    return () => {
      stale = true;
      try { a.cancel(); } catch { /* already gone */ }
    };
  }, [incoming]);

  // ── closing ──────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    const card = current;
    const section = sectionRef.current;
    if (!card || closing || !section) return;
    // Put the page back first, so the landing rect is measured where the
    // deck actually is.
    unlockScroll(scrollYRef.current);
    setInertOutside(section, false);
    deckRef.current?.restore(card.id);
    const to = deckRef.current?.rectOf(card.id) ?? null;
    setIncoming(null);
    setBackground(null);
    focusAfterRef.current = card.id;
    if (reduce || !to) return;
    setClosing({ card, to: { top: to.top, left: to.left, width: to.width, height: to.height } });
  }, [current, closing, reduce]);

  useLayoutEffect(() => {
    const el = closingLayerRef.current;
    if (!closing || !el) return;
    const { to } = closing;
    const from = viewportRect();
    applyRect(el, from, '0px');
    const a = el.animate(keyframesFor(from, to, '0px', CARD_RADIUS), {
      duration: COLLAPSE_MS,
      easing: TAKEOVER_EASE,
      fill: 'forwards',
    });
    let stale = false;
    const land = () => {
      if (stale) return;
      setClosing(null);
    };
    a.finished.then(land).catch(land);
    return () => {
      stale = true;
      try { a.cancel(); } catch { /* already gone */ }
    };
  }, [closing]);

  // Once nothing is expanded any more, the card is visible again and can take
  // focus back from ✕ — a focus call on a hidden element is silently ignored.
  useEffect(() => {
    if (expandedId !== null || !focusAfterRef.current) return;
    deckRef.current?.focus(focusAfterRef.current);
    focusAfterRef.current = null;
  }, [expandedId]);

  // Focus goes to ✕ when the takeover opens; Escape closes it.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Navigating away while open must not leave the page locked and inert.
  useEffect(() => {
    const section = sectionRef.current;
    return () => {
      if (!openRef.current) return;
      unlockScroll(scrollYRef.current);
      if (section) setInertOutside(section, false);
    };
  }, []);

  const layerImage = (card: ShowcaseCard) => (
    <>
      <Image
        src={card.imageUrl}
        alt=""
        fill
        priority
        sizes="100vw"
        unoptimized={!isOptimisableImage(card.imageUrl)}
        className="object-cover"
      />
      <div className="zoom-scrim" aria-hidden="true" />
    </>
  );

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="home-hero relative overflow-hidden bg-paper"
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      aria-labelledby={open ? 'hero-trip-title' : undefined}
    >
      {background && (
        <div key={`bg-${background.id}`} className="zoom-layer is-full is-open z-[5]">
          {layerImage(background)}
        </div>
      )}
      {incoming && (
        <div key={`in-${incoming.card.id}`} ref={incomingLayerRef} className="zoom-layer is-open z-[5]">
          {layerImage(incoming.card)}
        </div>
      )}
      {closing && (
        <div key="closing" ref={closingLayerRef} className="zoom-layer is-open z-[60]">
          {layerImage(closing.card)}
        </div>
      )}

      {open && (
        <>
          <Link href="/" className="hero-brand absolute left-6 top-5 z-20 items-center sm:left-10" aria-label="Empiria Tours home">
            <Image src="/logo-white.png" alt="" width={1507} height={522} className="h-9 w-auto object-contain" />
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="hero-close absolute right-5 top-5 z-20 h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-lift-card transition-colors hover:bg-white sm:right-8"
            aria-label="Close and go back to the page"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </>
      )}

      <div className="hero-grid relative z-10 mx-auto grid w-full max-w-[1240px] items-center gap-14 px-6 pb-16 pt-12 sm:px-10 lg:min-h-[min(80vh,900px)] lg:grid-cols-[1.1fr_1fr] lg:gap-8 lg:pb-20">
        <div className="max-w-xl">
          <div hidden={open}>{intro}</div>
          <div hidden={!open} className="hero-trip">
            {shown && (
              <>
                <p className="rise-in font-mono text-[12px] font-medium uppercase tracking-label text-white/80" style={delay(350)}>
                  <span className="text-lemon">A postcard from the deck</span>
                  {shown.kicker ? ` · ${shown.kicker}` : ''}
                </p>
                <h2
                  id="hero-trip-title"
                  className="mt-4 font-display text-[44px] font-extrabold leading-[1.02] tracking-tight text-white sm:text-[60px] xl:text-[68px]"
                  style={{ letterSpacing: '-0.03em' }}
                >
                  <span className="rise-in block" style={delay(420)}>{shown.title}</span>
                </h2>
                <p className="rise-in mt-5 max-w-lg text-[16px] leading-relaxed text-white/80 sm:text-[17px]" style={delay(500)}>
                  {shown.description}
                </p>
                <div className="rise-in mt-8" style={delay(600)}>
                  <Link
                    href={shown.linkUrl || '/tours'}
                    className="sweep inline-flex min-h-[44px] items-center gap-2 rounded-full bg-flame px-6 py-3.5 font-mono text-[14px] font-semibold text-white"
                  >
                    Browse all tours
                    <span className="arrow"><ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                  </Link>
                </div>
                <p className="rise-in mt-6 font-mono text-[11px] uppercase tracking-label text-white/60" style={delay(700)}>
                  Or pick another postcard from the deck
                </p>
              </>
            )}
          </div>
        </div>

        {cards.length > 0 && (
          <div className="relative pr-10 pt-24 sm:pr-16 sm:pt-28 lg:pl-6 lg:pr-14 lg:pt-32">
            <p className="deck-caption fade-in absolute left-0 top-0 font-mono text-[11px] font-medium uppercase tracking-label text-stone lg:left-6" style={delay(420)}>
              What a trip could be · tap a postcard
            </p>
            <div className="fade-in" style={delay(520)}>
              <PostcardDeck ref={deckRef} cards={cards} expandedId={expandedId} onSelect={select} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
