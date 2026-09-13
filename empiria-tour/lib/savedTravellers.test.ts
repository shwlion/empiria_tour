import { normaliseName, normaliseDob, profilesFromTravellers, planRemember } from './savedTravellers';

/**
 * Saved travellers: what gets remembered, and how a list reconciles.
 *
 *   bun run lib/savedTravellers.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const TODAY = new Date('2026-09-13T12:00:00Z');

// ── names ───────────────────────────────────────────────────────────────────
eq('whitespace is collapsed and trimmed', normaliseName('  Ana   Reyes\t'), 'Ana Reyes');
eq('nothing is nothing', [normaliseName(''), normaliseName('   '), normaliseName(null)], ['', '', '']);
eq('a name is cut at 200', normaliseName('x'.repeat(250)).length, 200);

// ── birthdays ───────────────────────────────────────────────────────────────
eq('a real date passes through', normaliseDob('1984-03-09', TODAY), '1984-03-09');
eq('today is allowed', normaliseDob('2026-09-13', TODAY), '2026-09-13');
eq('tomorrow is not a birthday', normaliseDob('2026-09-14', TODAY), null);
eq('Feb 30 is not a date', normaliseDob('2000-02-30', TODAY), null);
eq('before 1900 is dropped', normaliseDob('1899-12-31', TODAY), null);
eq('not a date at all', [normaliseDob('yesterday', TODAY), normaliseDob('', TODAY), normaliseDob(null, TODAY)], [null, null, null]);

// ── from a booking ──────────────────────────────────────────────────────────
const travellers = [
  { legalName: ' Ana Reyes ', dateOfBirth: null, dietaryNotes: ' vegetarian ', accessibilityNotes: '' },
  { legalName: 'Ana Reyes', dateOfBirth: null, dietaryNotes: null, accessibilityNotes: null }, // typed twice
  { legalName: 'Ana Reyes', dateOfBirth: '1984-03-09', dietaryNotes: null, accessibilityNotes: null }, // a different Ana
  { legalName: '', dateOfBirth: '2010-01-01', dietaryNotes: null, accessibilityNotes: null }, // unnamed
  { legalName: 'Tom', dateOfBirth: 'not-a-date', dietaryNotes: null, accessibilityNotes: 'step-free' },
];
const profiles = profilesFromTravellers(travellers);
eq('named, normalised, one per person', profiles.map((p) => `${p.legalName}|${p.dateOfBirth}`), ['Ana Reyes|null', 'Ana Reyes|1984-03-09', 'Tom|null']);
eq('notes are trimmed, blanks become null', [profiles[0].dietaryNotes, profiles[0].accessibilityNotes, profiles[2].accessibilityNotes], ['vegetarian', null, 'step-free']);

// ── reconciling ─────────────────────────────────────────────────────────────
const existing = [
  { id: 'a', legalName: 'Ana Reyes', dateOfBirth: null, dietaryNotes: 'vegan', accessibilityNotes: 'none' },
  { id: 'b', legalName: 'Old Friend', dateOfBirth: null, dietaryNotes: null, accessibilityNotes: null },
];
const plan = planRemember(existing, profiles);
eq('a known person is refreshed, not duplicated', plan.updates, [{ id: 'a', dietaryNotes: 'vegetarian', accessibilityNotes: 'none' }]);
eq('  …blank notes on this trip keep the note already saved', plan.updates[0].accessibilityNotes, 'none');
eq('new people are added', plan.inserts.map((p) => p.legalName), ['Ana Reyes', 'Tom']);
eq('an identical person is neither updated nor inserted', planRemember(existing, [{ legalName: 'Ana Reyes', dateOfBirth: null, dietaryNotes: null, accessibilityNotes: null }]), { updates: [], inserts: [], dropped: 0 });

const full = Array.from({ length: 19 }, (_, i) => ({ id: `e${i}`, legalName: `P${i}`, dateOfBirth: null, dietaryNotes: null, accessibilityNotes: null }));
const atCap = planRemember(full, profiles);
eq('the cap: only the room left is used', [atCap.inserts.length, atCap.dropped], [1, 2]);
eq('  …and updates still happen at the cap', planRemember([...full, existing[0]], profiles).updates.length, 1);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
