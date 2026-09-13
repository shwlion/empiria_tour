/**
 * The FAQ page's body, read as questions and answers.
 *
 * Exhibit A B6 makes the FAQ wording Empiria's to edit in the console, so the
 * questions cannot live in the page; they live in `static_pages.faq`. The
 * convention is the smallest one that gives the page a structure to fold:
 *
 *     Anything before the first question is the introduction.
 *
 *     ## A question?
 *     Its answer, in the same safe-markdown subset the journal uses —
 *     paragraphs, **bold**, lists, links.
 *
 *     ## The next question?
 *     …
 *
 * `##` is the journal's heading syntax, so an author who has written a post
 * already knows it, and an answer is rendered by the same renderer, which
 * never turns their text into markup. A body with no `##` at all is not an
 * error: the page falls back to plain text, as the other six pages render.
 *
 * Pure, and tested in lib/faq.test.ts.
 */

export type FaqItem = { question: string; answer: string };
export type Faq = { intro: string; items: FaqItem[] };

const HEADING = /^ {0,3}##(?!#)\s+(.+?)\s*#*\s*$/;

export function parseFaq(body: string | null | undefined): Faq {
  const lines = (body ?? '').replace(/\r\n?/g, '\n').split('\n');
  const items: FaqItem[] = [];
  const intro: string[] = [];
  let current: { question: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const answer = current.lines.join('\n').trim();
    // A question with nothing under it is a heading somebody has not finished;
    // showing an empty dropdown would look like a fault.
    if (answer) items.push({ question: current.question, answer });
    current = null;
  };

  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m) {
      flush();
      current = { question: m[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  flush();

  return { intro: intro.join('\n').trim(), items };
}
