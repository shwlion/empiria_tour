/**
 * Adobe base-14 font metrics, and the Unicode → WinAnsi transcoding that goes
 * with them.
 *
 * The receipt is set in Helvetica and Helvetica-Bold, which every PDF reader
 * carries. That is the whole reason to use them: nothing is embedded, so there
 * is no font file, no licence question under §5.7, and no way for a reader to
 * substitute a metric-incompatible face and shift the money column.
 *
 * Widths are in 1/1000 em, the unit the PDF text model uses, so a glyph's
 * advance at size `s` is `width * s / 1000`. They are needed for two things a
 * receipt cannot do without: right-aligning the amounts, and wrapping the
 * disclosure paragraphs Empiria supplies (Part D) without measuring in a
 * browser we do not have.
 *
 * Values are from Adobe's Helvetica.afm / Helvetica-Bold.afm. Where an accented
 * glyph shares its base letter's advance the value is still written out rather
 * than derived, because the exceptions (ccedilla, eth, ntilde, oslash, ae …)
 * are exactly the ones a derivation would get wrong.
 */

export type FontKey = 'regular' | 'bold';

/** WinAnsi 32–126. Index 0 is code 32. */
const ASCII_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const ASCII_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** WinAnsi 128–255. Index 0 is code 128. Unused slots hold the space width. */
const UPPER_REGULAR = [
  556, 278, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 278, 611, 278,
  278, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 278, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
];

const UPPER_BOLD = [
  556, 278, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 278, 611, 278,
  278, 238, 238, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 278, 500, 667,
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
  611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
];

/**
 * Unicode code points that WinAnsi keeps somewhere other than their own value.
 *
 * The curly quotes and dashes matter more than they look: `Intl.NumberFormat`
 * and Empiria's pasted content both produce them freely, and a receipt that
 * renders "?" where an em dash belongs looks broken in a way a traveller
 * notices.
 */
const REMAP: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
  // Both are spaces that must not survive as themselves: a non-breaking space
  // inside a currency string measures fine but reads as a missing glyph in
  // readers that map WinAnsi strictly.
  0x00a0: 0x20, 0x202f: 0x20, 0x2009: 0x20,
  // Intl emits U+2212 for a negative amount. A refund line rendering "?150" is
  // the kind of thing that gets noticed only after it has been sent.
  0x2212: 0x2d,
};

/** Anything with no WinAnsi home at all. */
const REPLACEMENT = 0x3f; // '?'

/**
 * Transcode a JavaScript string to WinAnsi bytes.
 *
 * Lossy by definition — WinAnsi has 224 printable slots and Unicode does not —
 * so this is the boundary where that loss is made explicit rather than
 * discovered in a reader. Callers measure and draw the same bytes, so the width
 * of what is drawn is always the width that was measured.
 */
export function toWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x20 && cp <= 0x7e) out.push(cp);
    else if (REMAP[cp] != null) out.push(REMAP[cp]);
    else if (cp >= 0xa1 && cp <= 0xff) out.push(cp);
    else if (cp === 0x09) out.push(0x20);
    else out.push(REPLACEMENT);
  }
  return out;
}

/** The advance of one WinAnsi byte, in 1/1000 em. */
function byteWidth(byte: number, font: FontKey): number {
  const ascii = font === 'bold' ? ASCII_BOLD : ASCII_REGULAR;
  const upper = font === 'bold' ? UPPER_BOLD : UPPER_REGULAR;
  if (byte >= 32 && byte <= 126) return ascii[byte - 32];
  if (byte >= 128 && byte <= 255) return upper[byte - 128];
  return ascii[0]; // control bytes never reach here; a space is the safe answer
}

/** Width of `text` at `size` points, in points. */
export function measure(text: string, font: FontKey, size: number): number {
  let mils = 0;
  for (const b of toWinAnsi(text)) mils += byteWidth(b, font);
  return (mils * size) / 1000;
}

/**
 * Greedy word wrap to a pixel width.
 *
 * Breaks on spaces, and only breaks inside a word when that single word cannot
 * fit on a line of its own — a URL in a disclosure block, typically. Returning
 * a too-long line instead would push the amount column off the page.
 */
export function wrap(text: string, font: FontKey, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === '') { lines.push(''); continue; }

    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, font, size) <= maxWidth) { line = candidate; continue; }

      if (line) { lines.push(line); line = ''; }

      // A single word wider than the column: split it by character.
      if (measure(word, font, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (measure(chunk + ch, font, size) > maxWidth && chunk) { lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Shorten to fit, with an ellipsis. For the single-line fields — a package
 * title, a traveller's legal name — where wrapping would break the layout but
 * overflowing would collide with the column beside it.
 */
export function truncate(text: string, font: FontKey, size: number, maxWidth: number): string {
  if (measure(text, font, size) <= maxWidth) return text;
  const ellipsis = '…';
  let out = '';
  for (const ch of text) {
    if (measure(out + ch + ellipsis, font, size) > maxWidth) break;
    out += ch;
  }
  return out.trimEnd() + ellipsis;
}
