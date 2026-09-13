import { parseFaq } from './faq';

/**
 * The FAQ body → questions and answers.
 *
 *   bun run lib/faq.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

eq('nothing in, nothing out', parseFaq(''), { intro: '', items: [] });
eq('null is the same as nothing', parseFaq(null), { intro: '', items: [] });

eq(
  'plain text with no headings is all introduction',
  parseFaq('PLACEHOLDER — supplied by Empiria under 2.1(e).'),
  { intro: 'PLACEHOLDER — supplied by Empiria under 2.1(e).', items: [] }
);

const body = `A few things people ask before they book.

## How do I book?
Pick a departure, then follow the steps.

Your seats are held while you fill it in.

## Do I pay in full?
Not always — some tours take a **deposit**.
- The balance date is shown first.
- You pay it from your booking page.
`;

const faq = parseFaq(body);
eq('the introduction is everything before the first question', faq.intro, 'A few things people ask before they book.');
eq('two questions', faq.items.map((i) => i.question), ['How do I book?', 'Do I pay in full?']);
eq('an answer keeps its paragraphs', faq.items[0].answer, 'Pick a departure, then follow the steps.\n\nYour seats are held while you fill it in.');
eq('an answer keeps its markdown', faq.items[1].answer.includes('**deposit**') && faq.items[1].answer.includes('- The balance'), true);

eq('windows line endings are fine', parseFaq('## Q?\r\nA.\r\n').items, [{ question: 'Q?', answer: 'A.' }]);
eq('trailing hashes and spaces are stripped from a question', parseFaq('##   Spaced?  ##  \nA.').items[0].question, 'Spaced?');
eq('### is not a question', parseFaq('### Sub\ntext').items, []);
eq('a question with no answer is dropped', parseFaq('## Empty?\n\n## Full?\nYes.').items, [{ question: 'Full?', answer: 'Yes.' }]);
eq('# alone is not a question either', parseFaq('# Title\n## Q?\nA.').intro, '# Title');

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
