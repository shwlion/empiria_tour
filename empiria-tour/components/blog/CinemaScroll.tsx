'use client';

/* eslint-disable @next/next/no-img-element --
   The seven scene layers and the three pin icons are third-party PNGs on hosts
   outside next.config's remotePatterns, sized entirely by the composition's
   CSS. next/image would lazy-load them and add its own styling, and either one
   breaks a layer stack that has to be present and exact from the first frame. */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { BlogCard } from '@/lib/blog';

/**
 * The journal's cinematic scroll — "Mostar city".
 *
 * A pixel-exact port of a standalone specification: the DOM tree, every CSS
 * value (app/blog/cinema.css), the scroll-and-pointer engine and the
 * infinite-slider maths are the spec's, verbatim. Two things are this app's:
 *
 *   - The five "sight cards" are the published posts. Kicker is the publish
 *     date, the pin is one of the spec's three icons in rotation, the title and
 *     excerpt are the post's. Clicking a card opens the post at /blog/<slug>;
 *     the spec's click-to-centre is replaced by that, and the ← → buttons keep
 *     the sliding.
 *   - The three card sets the spec builds by cloneNode are rendered directly —
 *     the same DOM, without mutating React's tree.
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

const PINS = [
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260730_230438_d526b8b6-8a2e-4e3b-9993-3908acae03a7.png',
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260730_230442_140bc25b-b165-4249-904a-f708bff6970e.png',
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260730_230448_825949c9-ccdb-4857-b4a6-e349eccc9010.png',
] as const;

/** Three identical sets, so the slider can wrap without a visible jump. */
const SETS = 3;

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

export default function CinemaScroll({ posts }: { posts: BlogCard[] }) {
  const router = useRouter();
  const rootRef = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = sectionRef.current;
    const track = trackRef.current;
    const sightsControls = controlsRef.current;
    if (!root || !section || !track) return;

    const html = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    html.classList.add('cinema-html');

    // ── State ────────────────────────────────────────────────────────────────
    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;
    let targetScroll = 0;
    let smoothScroll = 0;
    let initialized = false;
    let rafPending = false;
    let rafId = 0;
    let sightCards: HTMLElement[] = [];
    const originalSightCount = posts.length;
    let activeSight = originalSightCount;

    const set = (name: string, value: string | number) => root.style.setProperty(name, String(value));

    const getScrollDistance = () =>
      clamp(-section.getBoundingClientRect().top, 0, section.offsetHeight - window.innerHeight);

    // ── Per-frame update, verbatim ───────────────────────────────────────────
    function update() {
      rafPending = false;

      targetScroll = getScrollDistance();
      if (!initialized || reduceMotion.matches) {
        smoothScroll = targetScroll;
        initialized = true;
      } else {
        smoothScroll = lerp(smoothScroll, targetScroll, 0.14);
      }
      if (Math.abs(smoothScroll - targetScroll) < 0.08) smoothScroll = targetScroll;

      mouseX = lerp(mouseX, targetMouseX, 0.12);
      mouseY = lerp(mouseY, targetMouseY, 0.12);

      const frame2 = segmentInOut(smoothScroll, 560, 900, 1300, 1620);
      const frame3 = segmentInOut(smoothScroll, 1760, 2140, 2540, 2700);
      const progress = clamp(smoothScroll / 2700);
      const introExit = smoothstep(90, 650, smoothScroll);
      const sightsEnterRaw = smoothstep(2760, 3560, smoothScroll);
      const sightsEnter = Math.pow(sightsEnterRaw, 1.55);
      const sightsControlsEnter = smoothstep(3360, 3660, smoothScroll);
      const blurActive = clamp(frame2.active + frame3.active);
      const frame2Opacity = frame2.active * (1 - frame3.enter);
      const splitDrift = Math.pow(frame2.enter, 1.5);
      const panel2Opacity = frame2.active * (1 - frame2.exit);
      const panel3Opacity = frame3.active * (1 - frame3.exit);
      const backScale = 0.76 + progress * 0.2 + frame2.enter * 0.18 + frame3.enter * 0.16;
      const sharedHeroY = progress * -74;
      const sharedHeroScale = progress * 0.23;
      const sightsScreenTop = Math.min(220, Math.max(112, window.innerHeight * 0.19)) - 50;
      const sightsParentTop = window.innerHeight - (window.innerHeight - sightsScreenTop) / backScale;

      set('--mx', (reduceMotion.matches ? 0 : mouseX).toFixed(4));
      set('--my', (reduceMotion.matches ? 0 : mouseY).toFixed(4));

      set('--back-opacity', 1 - frame2.active * 0.06);
      set('--back-x', `${mouseX * -12}px`);
      set('--back-y', `${mouseY * -4}px`);
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

      set('--bridge-x', `calc(-50% + ${mouseX * 18}px)`);
      set('--bridge-y', `${mouseY * 8 + sharedHeroY - frame2.exit * 760}px`);
      set('--bridge-bottom', `${5 - frame2.enter * 13}vh`);
      set('--bridge-width', `${67.2 + frame2.enter * 37.8}vw`);
      set('--bridge-scale', 1.02 + sharedHeroScale + frame2.exit * 0.46);

      set('--split-left-x', `calc(-50% + ${-splitDrift * 46}vw + ${mouseX * 22}px)`);
      set('--split-left-y', `${mouseY * 10 + sharedHeroY - splitDrift * 180}px`);
      set('--split-left-scale', 1 + sharedHeroScale + frame2.enter * 0.74);
      set('--split-right-x', `calc(-50% + ${splitDrift * 46}vw + ${mouseX * 22}px)`);
      set('--split-right-y', `${mouseY * 10 + sharedHeroY - splitDrift * 180}px`);
      set('--split-right-scale', 1 + sharedHeroScale + frame2.enter * 0.74);

      set('--frame2-opacity', frame2Opacity);
      set('--frame2-x', `calc(-50% + ${mouseX * 10}px)`);
      set('--frame2-y', `calc(-50% + ${mouseY * 8 - frame2.exit * 150}px)`);
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
      set('--sights-enter-x', `${(1 - sightsEnter) * 420}vw`);
      set('--sights-scale', 1 / backScale);
      set('--sights-top', `${sightsParentTop}px`);
      set('--sights-screen-top', `${sightsScreenTop}px`);

      if (
        Math.abs(smoothScroll - targetScroll) > 0.08 ||
        Math.abs(mouseX - targetMouseX) > 0.001 ||
        Math.abs(mouseY - targetMouseY) > 0.001
      ) {
        requestTick();
      }
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
    const onPointerMove = (event: PointerEvent) => {
      targetMouseX = event.clientX / window.innerWidth - 0.5;
      targetMouseY = event.clientY / window.innerHeight - 0.5;
      requestTick();
    };
    const onPrev = () => moveSightSlider(-1);
    const onNext = () => moveSightSlider(1);
    const prev = prevRef.current;
    const next = nextRef.current;

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    prev?.addEventListener('click', onPrev);
    next?.addEventListener('click', onNext);
    track.addEventListener('transitionend', normalizeSightSlider);

    setupSightSlider();
    requestTick();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      prev?.removeEventListener('click', onPrev);
      next?.removeEventListener('click', onNext);
      track.removeEventListener('transitionend', normalizeSightSlider);
      cancelAnimationFrame(rafId);
      html.classList.remove('cinema-html');
    };
  }, [posts]);

  const open = (slug: string) => router.push(`/blog/${slug}`);

  return (
    <main className="site-shell cinema-page" ref={rootRef}>
      <section className="cinema-scroll" id="cinema" aria-label="Mostar cinematic scroll story" ref={sectionRef}>
        <div className="stage">
          <div className="world">
            <img className="scene-img sky-img" src={SCENE.sky} alt="" />

            <header className="site-header" aria-label="Primary navigation">
              <a className="site-logo" href="#cinema">Bosnia and Herzegovina</a>
              <nav className="site-nav" aria-label="Main menu">
                <a href="#cinema">Intro</a>
                <a href="#bridge">Bridge</a>
                <a href="#bazaar">Bazaar</a>
                <a href="#routes">Routes</a>
              </nav>
              <button className="language-switcher" type="button" aria-label="Change language">
                <span>EN</span>
                <span aria-hidden="true">⌄</span>
              </button>
            </header>

            <div className="back-stack">
              <img className="scene-img back-img back-four" src={SCENE.four} alt="" />
              <section className="sights-slider" aria-label="Mostar sights slider">
                <div className="sights-track" ref={trackRef}>
                  {posts.length > 0 &&
                    Array.from({ length: SETS }, (_, setIndex) =>
                      posts.map((post, cardIndex) => (
                        <article
                          key={`${setIndex}-${post.id}`}
                          className="sight-card"
                          tabIndex={0}
                          role="button"
                          aria-label={`Open ${post.title} card`}
                          data-sight-index={setIndex * posts.length + cardIndex}
                          onClick={() => open(post.slug)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              open(post.slug);
                            }
                          }}
                        >
                          <span className="sight-kicker">{formatDate(post.publishedAt)}</span>
                          <img className="sight-pin" src={PINS[cardIndex % PINS.length]} alt="" />
                          <h3>{post.title}</h3>
                          <p>{post.excerpt}</p>
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
              <img className="scene-img back-img back-bazaar" src={SCENE.bazaar} alt="" />
            </div>

            {posts.length > 0 && (
              <div className="sights-controls" aria-label="Slider controls" ref={controlsRef}>
                <button className="sight-nav sight-prev" type="button" aria-label="Previous sight" ref={prevRef}>
                  ←
                </button>
                <button className="sight-nav sight-next" type="button" aria-label="Next sight" ref={nextRef}>
                  →
                </button>
              </div>
            )}

            <h1 className="hero-title">MOSTAR</h1>

            <img className="scene-img splitframe-img splitframe-left" src={SCENE.splitLeft} alt="" />
            <img className="scene-img splitframe-img splitframe-right" src={SCENE.splitRight} alt="" />
            <img className="scene-img bridge-img" src={SCENE.bridge} alt="" />
            <img className="scene-img frame-two-img" src={SCENE.frameTwo} alt="" />
            <div className="shade" />
          </div>

          <section className="intro-copy" aria-label="Mostar overview">
            <p>
              A stone arch, emerald water, and a compact old city made for slow mornings, late light,
              and one unforgettable crossing.
            </p>
            <div className="hero-tags" aria-label="Mostar highlights">
              <span>Old Bridge</span>
              <span>Neretva River</span>
              <span>UNESCO old city</span>
            </div>
          </section>

          <section className="story-panel story-panel-bridge" aria-label="Old Bridge details">
            <h2>The bridge is the city&rsquo;s compass.</h2>
            <p>
              Stari Most links the banks of the Neretva and anchors a historic quarter shaped by
              Ottoman, Mediterranean, and European layers.
            </p>
            <dl className="facts">
              <div>
                <dt>1566</dt>
                <dd>Original bridge completed</dd>
              </div>
              <div>
                <dt>2005</dt>
                <dd>Old Bridge Area inscribed by UNESCO</dd>
              </div>
            </dl>
          </section>

          <section className="story-panel story-panel-bazaar" aria-label="Old town details">
            <h2>The bazaar keeps Mostar close.</h2>
            <p>
              Stone lanes, mosque courtyards, copper stalls, and riverside coffee stay within a short
              walk of Stari Most.
            </p>
            <button className="note-button" type="button">
              <span aria-hidden="true">↗</span>
              <span>Open old town notes</span>
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}
