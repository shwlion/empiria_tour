import {
  DECK_DEFAULTS,
  DECK_SMALL,
  ELASTIC_FALLBACK,
  elasticLinear,
  elasticOut,
  nextOrder,
  restoredToFront,
  slot,
  slotStyle,
  slotTransform,
  timeline,
  withoutCard,
} from './deck';

/**
 * The postcard deck's arithmetic.
 *
 *   bun run lib/deck.test.ts
 *
 * Everything the browser animates is derived from these numbers, and the
 * server renders the initial stack from them too — so the two must agree, and
 * the only way to be sure is to pin them here. No DOM, no clock.
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`
  );
};

// ── Slots: the front card sits at the origin, each one behind it up, right and back ──
eq('slot 0 is the origin, on top', slot(0, 4, DECK_DEFAULTS), { x: 0, y: 0, z: 0, zIndex: 4 });
eq('slot 1 steps right, up and back by 1.5×', slot(1, 4, DECK_DEFAULTS), { x: 40, y: -44, z: -60, zIndex: 3 });
eq('slot 3 is the rearmost of four', slot(3, 4, DECK_DEFAULTS), { x: 120, y: -132, z: -180, zIndex: 1 });
eq('z-index counts down from the deck size', slot(0, 3, DECK_DEFAULTS).zIndex, 3);
eq('the phone spacing is tighter', slot(1, 4, { ...DECK_DEFAULTS, ...DECK_SMALL }), { x: 22, y: -26, z: -33, zIndex: 3 });
eq('DECK_SMALL only overrides the two distances', DECK_SMALL, { distX: 22, distY: 26 });

// ── The transform string, which the server renders and the browser animates ──
eq(
  'transform centres the card first, then offsets it in 3D, then leans it',
  slotTransform(slot(1, 4, DECK_DEFAULTS), 4),
  'translate(-50%,-50%) translate3d(40px,-44px,-60px) skewY(4deg)'
);
eq('slotStyle is what an inline style needs', slotStyle(2, 4, DECK_DEFAULTS), {
  transform: 'translate(-50%,-50%) translate3d(80px,-88px,-120px) skewY(4deg)',
  zIndex: 2,
});

// ── The elastic curve: GSAP's elastic.out(1, 0.9) ────────────────────────────
eq('elastic starts at rest', elasticOut(0), 0);
eq('elastic ends at rest', elasticOut(1), 1);
eq('elastic overshoots on the way', Math.round(elasticOut(0.5) * 1000) / 1000, 1.029);
const peak = Math.max(...Array.from({ length: 99 }, (_, i) => elasticOut((i + 1) / 100)));
eq('the overshoot is small — a settle, not a bounce', peak > 1 && peak < 1.1, true);
eq('it covers most of the distance in the first fifth', elasticOut(0.2) > 0.9, true);

const curve = elasticLinear();
eq('linear() begins at 0', curve.startsWith('linear(0.0000 0.00%'), true);
eq('linear() ends at 1', curve.endsWith('1.0000 100.00%)'), true);
eq('linear() samples 49 points by default', curve.split(',').length, 49);
eq('the fallback is a plain ease-out', ELASTIC_FALLBACK, 'cubic-bezier(.2,.8,.2,1)');

// ── The timeline: promote a fifth of the way into the drop, return just after ──
eq('promote and return labels for the defaults', timeline(DECK_DEFAULTS), { promoteAt: 200, returnAt: 300 });

// ── Order bookkeeping ───────────────────────────────────────────────────────
eq('a swap rotates the front card to the back', nextOrder([0, 1, 2, 3]), [1, 2, 3, 0]);
eq('popping a card removes it wherever it is', withoutCard([2, 0, 1, 3], 1), [2, 0, 3]);
eq('popping an absent card changes nothing', withoutCard([0, 2], 1), [0, 2]);
eq('restoring puts the card at the front', restoredToFront([0, 2, 3], 1), [1, 0, 2, 3]);
eq('restoring a card already in the deck moves it to the front', restoredToFront([0, 1, 2], 2), [2, 0, 1]);
eq('restoring is idempotent', restoredToFront(restoredToFront([0, 2, 3], 1), 1), [1, 0, 2, 3]);
eq('order helpers do not mutate their input', (() => { const o = [0, 1, 2]; nextOrder(o); withoutCard(o, 0); restoredToFront(o, 5); return o; })(), [0, 1, 2]);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
