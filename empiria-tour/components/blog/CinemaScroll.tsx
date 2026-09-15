'use client';

/* eslint-disable @next/next/no-img-element --
   The seven scene layers are third-party PNGs on hosts outside next.config's
   remotePatterns, sized entirely by the composition's
   CSS. next/image would lazy-load them and add its own styling, and either one
   breaks a layer stack that has to be present and exact from the first frame.
   The cards' hero photographs are raw <img> for the same reason: they sit
   inside a slider the engine transforms every frame, where next/image's
   lazy-loading misjudges what is visible and its wrapper fights the card. */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BlogCard } from '@/lib/blog';

/**
 * The journal's cinematic scroll.
 *
 * The composition — layers, every CSS value in app/blog/cinema.css, the
 * scroll-and-pointer engine and the infinite-slider maths — is a
 * specification reproduced verbatim. What is this site's:
 *
 *   - The words. The spec's Mostar copy is replaced by the journal's own:
 *     what it is, why the guides write it, and the way from a story to a
 *     departure. The two large figures are live catalogue counts, so the page
 *     never quotes a number the catalogue has moved past.
 *   - The menu. The spec's own header is replaced by the site's dark navbar,
 *     rendered by the page (it is a server component) and fixed to the
 *     viewport, so it stays at the top through the whole scroll.
 *   - The cards are the published posts. Kicker is the publish date, the pin
 *     one of the spec's three icons in rotation, title and excerpt the post's.
 *     A click opens the post; the ← → buttons keep the sliding.
 *   - The three card sets the spec builds by cloneNode are rendered directly —
 *     the same DOM, without mutating React's tree.
 *
 * Three of the spec's movements are removed at the client's request, all of
 * them sideways: the pointer parallax (layers drifting with the mouse), the
 * two tower frames parting to reveal the river close-up, and the cards flying
 * in from off-screen right. The frames keep only the lift-and-grow they share
 * with the bridge — the parting's own lift and 1.74× scale went with it,
 * because without the sideways motion they would fill the screen with stone —
 * and fade out over the window the spec parted them in, since frames that
 * stay put cover the panels and, at the end, the cards. The cards fade in
 * where they sit. Everything vertical stays the spec's.
 *
 * Everything the engine writes goes to `.cinema-page` (custom properties) and
 * `html.cinema-html` (the spec's html/body rules), and both are undone on
 * unmount, so nothing of this page survives navigating away from it.
 */

const SCENE = {
  sky: 'https://raft-blast-61784561.figma.site/_assets/v11/16b5007d9c93971e26ffe4e0e3e37946f6bd538c.png',
  four: 'https://raft-blast-61784561.figma.site/_assets/v11/8a7f8af50e0ce92ec2e228e7b0b4112178c51cf1.png',
  bazaar: 'https://raft-blast-61784561.figma.site/_assets/v11/864afe00e41e2fa20a5aa546e15cb807e0f81384.png',
  splitLeft: 'https://raft-blast-61784561.figma.site/_assets/v11/7536d7b60a1fce482cf6edf3f0bffd3bad5d0f8a.png',
  splitRight: 'https://raft-blast-61784561.figma.site/_assets/v11/392db6a6a6b98e868bd7f8d3f55bb719d51e5028.png',
  bridge: 'https://raft-blast-61784561.figma.site/_assets/v11/c6a6d8ef49bca43f708aa852692942c45ec950d4.png',
  frameTwo: 'https://raft-blast-61784561.figma.site/_assets/v11/ba75252bab2b1c510987b74837770f7bc8a6b2d4.png',
} as const;

// The spec's three pin icons, one per card, were removed at the client's
// request (14 Sep) along with the cream plate they sat on.

/** Three identical sets, so the slider can wrap without a visible jump. */
const SETS = 3;

/**
 * A scene layer: a box that carries the spec's positioning and transform, and
 * inside it the photograph, which is what actually gets rastered. Splitting
 * the two lets the CSS raster the photograph at 1× on Retina screens (see
 * cinema.css) while the box keeps every value the spec gives it.
 */
function Layer({ className, src }: { className: string; src: string }) {
  return (
    <div className={`scene-img ${className}`}>
      <img className="scene-layer" src={src} alt="" decoding="async" />
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// ── The spec's helpers, verbatim ─────────────────────────────────────────────

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const smoothstep = (e0: number, e1: number, v: number) => {
  const x = clamp((v - e0) / (e1 - e0));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const segmentInOut = (s: number, a: number, b: number, c: number, d: number) => {
  const enter = smoothstep(a, b, s);
  const exit = smoothstep(c, d, s);
  return { enter, exit, active: enter * (1 - exit) };
};

export type CatalogueCounts = { tours: number; destinations: number };

export default function CinemaScroll({ posts, counts }: { posts: BlogCard[]; counts: CatalogueCounts }) {
  const router = useRouter();
  const rootRef = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const sliderRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = sectionRef.current;
    const track = trackRef.current;
    const slider = sliderRef.current;
    const sightsControls = controlsRef.current;
    if (!root || !section || !track || !slider) return;

    const html = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Rendered by the page, not by this component: a server component, fixed
    // to the viewport. Looked up once; only its rect is read per frame.
    const nav = document.querySelector<HTMLElement>('.cinema-nav nav');
    html.classList.add('cinema-html');

    // ── State ────────────────────────────────────────────────────────────────
    let targetScroll = 0;
    let smoothScroll = 0;
    let initialized = false;
    let rafPending = false;
    let rafId = 0;
    let sightCards: HTMLElement[] = [];
    const originalSightCount = posts.length;
    let activeSight = originalSightCount;
    // The per-frame correction that centres the active card; see the CSS.
    let centerX = 0;

    const set = (name: string, value: string | number) => root.style.setProperty(name, String(value));

    const getScrollDistance = () =>
      clamp(-section.getBoundingClientRect().top, 0, section.offsetHeight - window.innerHeight);

    // ── Per-frame update, verbatim ───────────────────────────────────────────
    function update() {
      rafPending = false;

      // Every measurement first, every write after. Reading a rect between
      // writes forces the browser to lay the page out again mid-frame; the
      // trace showed one forced layout per frame, which this removes.
      targetScroll = getScrollDistance();
      const navBottomRaw = nav ? nav.getBoundingClientRect().bottom : null;
      const cardWidth = sightCards.length > 0 ? sightCards[0].offsetWidth : 0;
      const sliderLeftRaw = sightCards.length > 0 ? slider!.getBoundingClientRect().left : 0;
      if (!initialized || reduceMotion.matches) {
        smoothScroll = targetScroll;
        initialized = true;
      } else {
        smoothScroll = lerp(smoothScroll, targetScroll, 0.14);
      }
      if (Math.abs(smoothScroll - targetScroll) < 0.08) smoothScroll = targetScroll;

      const frame2 = segmentInOut(smoothScroll, 560, 900, 1300, 1620);
      const frame3 = segmentInOut(smoothScroll, 1760, 2140, 2540, 2700);
      const progress = clamp(smoothScroll / 2700);
      const introExit = smoothstep(90, 650, smoothScroll);
      // Earlier and fuller than the spec's 2760–3560 with a ^1.55 ease, which
      // kept the row faint until the last 140px of the page. The bazaar panel
      // has left by 2700, so nothing overlaps.
      const sightsEnter = smoothstep(2700, 3150, smoothScroll);
      const sightsControlsEnter = smoothstep(2950, 3250, smoothScroll);
      const blurActive = clamp(frame2.active + frame3.active);
      const frame2Opacity = frame2.active * (1 - frame3.enter);
      const panel2Opacity = frame2.active * (1 - frame2.exit);
      const panel3Opacity = frame3.active * (1 - frame3.exit);
      const backScale = 0.76 + progress * 0.2 + frame2.enter * 0.18 + frame3.enter * 0.16;
      const sharedHeroY = progress * -74;
      const sharedHeroScale = progress * 0.23;
      // The spec's row height, then no higher than the site navbar allows. The
      // spec's own header was shorter and static; ours is a fixed plate whose
      // bottom edge is measured rather than assumed, so a change to the navbar
      // never puts a card under it. On a 700px-tall laptop the spec's formula
      // alone would.
      // Room under the navbar: the ~14px the active card rises by when it is
      // lifted and scaled (measured on the row, not the lifted card), and then
      // clear air — 90px in all, at the client's request; 30 was too tight to
      // the plate.
      const navBottom = navBottomRaw != null ? navBottomRaw + 90 : 0;
      const sightsScreenTop = Math.max(
        Math.min(220, Math.max(112, window.innerHeight * 0.19)) - 50,
        navBottom
      );
      const sightsParentTop = window.innerHeight - (window.innerHeight - sightsScreenTop) / backScale;

      set('--back-opacity', 1 - frame2.active * 0.06);
      set('--back-scale', backScale);
      set('--four-y', `${10 + progress * 10}vh`);
      set('--four-scale', 0.78 + progress * 0.16);
      set('--bazaar-y', `${20 - progress * 8}vh`);
      set('--blur-px', `${blurActive * 14}px`);
      set('--back-brightness', 1 - blurActive * 0.255);
      set('--bazaar-blur-px', `${frame2.active * 14}px`);
      set('--bazaar-brightness', 1 - frame2.active * 0.255 - frame3.active * 0.06);
      set('--bazaar-saturation', 1 + frame3.active * 0.18);
      set('--shade-opacity', '1');
      set('--shade-z', frame2.active > 0.02 ? '2' : '0');
      set('--shade-top-alpha', blurActive * 0.465);
      set('--shade-mid-alpha', blurActive * 0.42);
      set('--shade-bottom-alpha', blurActive * 0.51);

      set('--title-y', `${introExit * -210}px`);
      set('--title-scale', 1 - introExit * 0.08);
      set('--title-opacity', 1 - introExit);

      set('--bridge-y', `${sharedHeroY - frame2.exit * 760}px`);
      set('--bridge-bottom', `${5 - frame2.enter * 13}vh`);
      set('--bridge-width', `${67.2 + frame2.enter * 37.8}vw`);
      set('--bridge-scale', 1.02 + sharedHeroScale + frame2.exit * 0.46);

      set('--split-left-y', `${sharedHeroY}px`);
      set('--split-left-scale', 1 + sharedHeroScale);
      set('--split-right-y', `${sharedHeroY}px`);
      set('--split-right-scale', 1 + sharedHeroScale);
      // The spec parted the frames ±46vw over frame2.enter and left them there
      // for the rest of the page; sitting still, they would cover the river
      // close-up, both panels' edges, and finally the cards. Same window, a
      // fade instead of a slide.
      set('--split-opacity', 1 - frame2.enter);

      set('--frame2-opacity', frame2Opacity);
      set('--frame2-y', `calc(-50% + ${-frame2.exit * 150}px)`);
      set('--frame2-scale', 1.06 + frame2.enter * 0.08 + frame2.exit * 0.08);

      set('--intro-copy-y', `${introExit * 90}px`);
      set('--intro-copy-opacity', 1 - introExit);
      set('--panel2-opacity', panel2Opacity);
      set('--panel2-y', `calc(-50% + ${-frame2.exit * 86 + (1 - frame2.enter) * 58}px)`);
      set('--panel3-opacity', panel3Opacity);
      set('--panel3-y', `calc(-50% + ${-frame3.exit * 86 + (1 - frame3.enter) * 58}px)`);

      set('--sights-opacity', sightsEnter);
      set('--sights-controls-opacity', sightsControlsEnter);
      sightsControls?.classList.toggle('is-ready', sightsControlsEnter > 0.98);
      set('--sights-visibility', sightsEnter > 0.01 ? 'visible' : 'hidden');
      set('--sights-y', '0px');
      set('--sights-scale', 1 / backScale);
      set('--sights-top', `${sightsParentTop}px`);
      set('--sights-screen-top', `${sightsScreenTop}px`);

      // Centre the active card. The track's contents are at 1:1 on screen
      // (the slider's 1/backScale cancels the back-stack's backScale), but the
      // slider's own left edge moves as the back-stack zooms about its centre,
      // so it is measured rather than derived. The measurement includes last
      // frame's correction, which is removed before the new one is computed;
      // the two agree exactly once scrolling stops. The correction is applied
      // on the slider, in the back-stack's coordinates, hence ÷ backScale.
      if (sightCards.length > 0) {
        const baseLeft = sliderLeftRaw - centerX * backScale;
        centerX = (window.innerWidth / 2 - (baseLeft + cardWidth / 2)) / backScale;
        set('--sights-center-x', `${centerX}px`);
      }

      if (Math.abs(smoothScroll - targetScroll) > 0.08) requestTick();
    }

    function requestTick() {
      if (rafPending) return;
      rafPending = true;
      rafId = requestAnimationFrame(update);
    }

    // ── Infinite slider, verbatim ────────────────────────────────────────────
    function updateSightSlider() {
      if (sightCards.length === 0) return;
      const cardWidth = sightCards[0].offsetWidth;
      const gap = parseFloat(getComputedStyle(track!).columnGap || '0');
      set('--sights-shift', `${-(cardWidth + gap) * activeSight}px`);
      for (const card of sightCards) {
        card.classList.toggle('is-active', Number(card.dataset.sightIndex) === activeSight);
      }
    }

    function moveSightSlider(dir: number) {
      activeSight += dir;
      updateSightSlider();
    }

    function jumpSightSlider(i: number) {
      track!.classList.add('is-jumping');
      activeSight = i;
      updateSightSlider();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => track!.classList.remove('is-jumping'));
      });
    }

    function normalizeSightSlider() {
      if (originalSightCount === 0) return;
      if (activeSight >= originalSightCount * 2) jumpSightSlider(activeSight - originalSightCount);
      else if (activeSight < originalSightCount) jumpSightSlider(activeSight + originalSightCount);
    }

    function setupSightSlider() {
      sightCards = Array.from(track!.querySelectorAll<HTMLElement>('.sight-card'));
      activeSight = originalSightCount;
      updateSightSlider();
    }

    // ── Listeners ────────────────────────────────────────────────────────────
    const onScroll = () => requestTick();
    const onResize = () => {
      updateSightSlider();
      requestTick();
    };
    const onPrev = () => moveSightSlider(-1);
    const onNext = () => moveSightSlider(1);
    const prev = prevRef.current;
    const next = nextRef.current;

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    prev?.addEventListener('click', onPrev);
    next?.addEventListener('click', onNext);
    track.addEventListener('transitionend', normalizeSightSlider);

    setupSightSlider();
    requestTick();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      prev?.removeEventListener('click', onPrev);
      next?.removeEventListener('click', onNext);
      track.removeEventListener('transitionend', normalizeSightSlider);
      cancelAnimationFrame(rafId);
      html.classList.remove('cinema-html');
    };
  }, [posts]);

  const open = (slug: string) => router.push(`/blog/${slug}`);
  // A count of zero is a catalogue with nothing on sale, not a fact worth
  // setting in 4rem type. Both or neither.
  const showFacts = counts.tours > 0 && counts.destinations > 0;

  return (
    <main className="site-shell cinema-page" ref={rootRef}>
      <section className="cinema-scroll" id="cinema" aria-label="Empiria Tours journal" ref={sectionRef}>
        <div className="stage">
          <div className="world">
            <Layer className="sky-img" src={SCENE.sky} />

            <div className="back-stack">
              <Layer className="back-img back-four" src={SCENE.four} />
              <section className="sights-slider" aria-label="Latest posts" ref={sliderRef}>
                <div className="sights-track" ref={trackRef}>
                  {posts.length > 0 &&
                    Array.from({ length: SETS }, (_, setIndex) =>
                      posts.map((post, cardIndex) => (
                        <article
                          key={`${setIndex}-${post.id}`}
                          className="sight-card"
                          tabIndex={0}
                          role="button"
                          aria-label={`Open ${post.title}`}
                          data-sight-index={setIndex * posts.length + cardIndex}
                          onClick={() => open(post.slug)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              open(post.slug);
                            }
                          }}
                        >
                          {/* The post's main picture fills the card (client's
                              request, 14 Sep). No <img> at all when there is
                              none — a broken-image glyph on a poster is worse
                              than the gradient the CSS falls back to. */}
                          {post.heroImage && (
                            <img className="sight-photo" src={post.heroImage} alt="" decoding="async" />
                          )}
                          <span className="sight-shade" aria-hidden="true" />
                          <div className="sight-words">
                            <span className="sight-kicker">{formatDate(post.publishedAt)}</span>
                            <h3>{post.title}</h3>
                            <p>{post.excerpt}</p>
                          </div>
                        </article>
                      ))
                    )}
                </div>
                {posts.length === 0 && (
                  // The spec has no empty state; a slider of nothing would read
                  // as a fault. This is the journal's own sentence for it.
                  <p className="sights-empty">Nothing published yet. The first posts are being written.</p>
                )}
              </section>
              <Layer className="back-img back-bazaar" src={SCENE.bazaar} />
              {posts.length > 0 && <div className="sights-scrim" aria-hidden="true" />}
            </div>

            {posts.length > 0 && (
              <div className="sights-controls" aria-label="Post controls" ref={controlsRef}>
                <button className="sight-nav sight-prev" type="button" aria-label="Previous post" ref={prevRef}>
                  ←
                </button>
                <button className="sight-nav sight-next" type="button" aria-label="Next post" ref={nextRef}>
                  →
                </button>
              </div>
            )}

            {/* The spec's 14rem hero title is dropped at the client's request:
                the site navbar names the page, and the photograph does the
                rest. The engine's --title-* writes stay, harmless, so a title
                could return without touching the maths. */}

            <Layer className="splitframe-img splitframe-left" src={SCENE.splitLeft} />
            <Layer className="splitframe-img splitframe-right" src={SCENE.splitRight} />
            <Layer className="bridge-img" src={SCENE.bridge} />
            <Layer className="frame-two-img" src={SCENE.frameTwo} />
            <div className="shade" />
          </div>

          <section className="intro-copy" aria-label="About the journal">
            {/* Four words, big, in the display face the story panels use — the
                spec's hero title back in short form (client's request, 14 Sep;
                the thirty-word line it replaces read as a caption). The page
                had no h1 until this. */}
            <h1 className="intro-title">Notes from the road</h1>
            <p className="intro-sub">By the people who run the trips.</p>
            <div className="hero-tags" aria-label="Where we go">
              <span>Greece</span>
              <span>Italy</span>
              <span>Small groups</span>
            </div>
            {/* The cards arrive at 2700–3150 and nothing on the first screen
                said so (client's request, 14 Sep). The cue rides the intro's
                fade, so it is gone the moment scrolling starts — and it acts:
                the page already scrolls smoothly, so pressing it lands on the
                row settled rather than mid-fade. */}
            {posts.length > 0 && (
              <button
                type="button"
                className="scroll-cue"
                aria-label="Scroll to the posts"
                onClick={() => window.scrollTo({ top: 3300, behavior: 'smooth' })}
              >
                <span>Scroll for the posts</span>
                <svg className="scroll-cue-arrow" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M12 5v13m0 0l-5-5m5 5l5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </section>

          <section className="story-panel story-panel-bridge" aria-label="Why we write">
            <h2>Every trip starts as a story.</h2>
            <p>
              Our guides write down what the brochures leave out &mdash; where the light lands at
              seven, which table to ask for, and when to skip the queue and swim instead.
            </p>
            {showFacts && (
              <dl className="facts">
                <div>
                  <dt>{counts.tours}</dt>
                  <dd>{counts.tours === 1 ? 'Tour on sale right now' : 'Tours on sale right now'}</dd>
                </div>
                <div>
                  <dt>{counts.destinations}</dt>
                  <dd>{counts.destinations === 1 ? 'Place we write from' : 'Places we write from'}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="story-panel story-panel-bazaar" aria-label="From a story to a departure">
            <h2>Read it. Then go.</h2>
            <p>
              Every post sits beside a real departure &mdash; dates, seats and an all-in price. When a
              story makes you want to be there, the trip is one tap away.
            </p>
            <Link href="/tours" className="note-button">
              <span aria-hidden="true">&#8599;</span>
              <span>See the tours</span>
            </Link>
          </section>
        </div>
      </section>
    </main>
  );
}
