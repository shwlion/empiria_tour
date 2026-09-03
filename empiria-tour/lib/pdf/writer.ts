/**
 * A very small PDF 1.4 writer. No dependencies, deliberately.
 *
 * `lib/email/mailer.ts` takes Resend over `fetch` rather than its SDK, on the
 * grounds that §5.7 makes every dependency a licence question and an SDK bought
 * nothing there. The same reasoning holds here and more strongly: a receipt is
 * fixed-layout text in two base-14 fonts, so a PDF library would be a megabyte
 * and a licence audit to emit a few kilobytes of operators we can write out
 * directly.
 *
 * What this deliberately does NOT do: images, embedded fonts, compression,
 * encryption, annotations, or anything reflowable. If a receipt ever needs a
 * logo, that is the moment to reconsider — not before.
 *
 * ## Coordinates
 *
 * PDF's origin is the bottom-left corner and y grows upward. Every document in
 * this codebase is laid out top-down, so this class exposes **y measured down
 * from the top edge** and flips it on the way out. Mixing the two conventions is
 * the classic way to spend an afternoon on a receipt that prints upside down.
 *
 * ## Determinism
 *
 * Given the same content and the same `producedAt`, `build()` returns
 * byte-identical output. That is what lets a receipt be generated on demand
 * rather than stored: the same booking renders the same document every time, so
 * there is nothing gained by keeping the bytes around.
 */

import { measure, toWinAnsi, type FontKey } from './widths';

export type { FontKey };

export type Size = { width: number; height: number };

/** Letter, in points. Canada and the US both use it; A4 would be wrong here. */
export const LETTER: Size = { width: 612, height: 792 };

export type Rgb = readonly [number, number, number];

export const INK: Rgb = [0.12, 0.11, 0.10];
export const STONE: Rgb = [0.42, 0.40, 0.38];
export const LINE: Rgb = [0.85, 0.83, 0.80];
export const FLAME: Rgb = [0.79, 0.31, 0.16];

type TextOpts = {
  font?: FontKey;
  size?: number;
  color?: Rgb;
  /** Letter-spacing in points, for the small-caps-ish labels the site uses. */
  tracking?: number;
};

type StrokeOpts = { width?: number; color?: Rgb };

const FONT_RES: Record<FontKey, string> = { regular: '/F1', bold: '/F2' };

/** Escape a WinAnsi byte run for a PDF literal string. */
function literal(bytes: number[]): number[] {
  const out: number[] = [0x28]; // (
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c); // ( ) \
    out.push(b);
  }
  out.push(0x29); // )
  return out;
}

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** PDF number: fixed to 2dp, and without a `-0` that some readers dislike. */
const num = (n: number): string => {
  const v = Math.abs(n) < 1e-6 ? 0 : n;
  return (Math.round(v * 100) / 100).toString();
};

const rgb = (c: Rgb): string => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;

export class PdfDoc {
  readonly size: Size;
  private pages: number[][] = [];
  private current: number[] = [];
  private readonly producedAt: Date;
  private readonly title: string;

  constructor(opts: { size?: Size; title?: string; producedAt?: Date } = {}) {
    this.size = opts.size ?? LETTER;
    this.title = opts.title ?? 'Receipt';
    this.producedAt = opts.producedAt ?? new Date(0);
    this.pages.push(this.current);
  }

  /** Start a new page. Returns the page index, 0-based. */
  addPage(): number {
    this.current = [];
    this.pages.push(this.current);
    return this.pages.length - 1;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /**
   * Switch drawing back to an already-started page.
   *
   * Footers need this: "Page 2 of 3" cannot be written until the last page
   * exists, so the footer pass runs after the content and revisits each page.
   */
  setPage(index: number): void {
    const page = this.pages[index];
    if (!page) throw new Error(`no such page: ${index}`);
    this.current = page;
  }

  /** Width of a string as it will actually be drawn. */
  measure(text: string, font: FontKey = 'regular', size = 10): number {
    return measure(text, font, size);
  }

  /**
   * Draw text with its LEFT edge at `x` and its BASELINE at `y` from the top.
   *
   * Baseline rather than top-of-glyph because that is what the PDF text model
   * positions, and pretending otherwise would mean guessing at an ascent for
   * every call site.
   */
  text(x: number, y: number, str: string, opts: TextOpts = {}): void {
    if (str === '') return;
    const { font = 'regular', size = 10, color = INK, tracking = 0 } = opts;
    const c = this.current;

    c.push(...ascii(`q ${rgb(color)} rg BT ${FONT_RES[font]} ${num(size)} Tf `));
    if (tracking) c.push(...ascii(`${num(tracking)} Tc `));
    c.push(...ascii(`1 0 0 1 ${num(x)} ${num(this.size.height - y)} Tm `));
    c.push(...literal(toWinAnsi(str)));
    c.push(...ascii(' Tj ET Q\n'));
  }

  /** Draw text with its RIGHT edge at `x`. The money column. */
  textRight(x: number, y: number, str: string, opts: TextOpts = {}): void {
    const { font = 'regular', size = 10, tracking = 0 } = opts;
    // Tracking adds a gap after every glyph including the last, which would
    // leave a right-aligned run looking a point short. Discount it.
    const width = measure(str, font, size) + tracking * Math.max(0, toWinAnsi(str).length - 1);
    this.text(x - width, y, str, opts);
  }

  /** Draw text centred on `x`. */
  textCenter(x: number, y: number, str: string, opts: TextOpts = {}): void {
    const { font = 'regular', size = 10 } = opts;
    this.text(x - measure(str, font, size) / 2, y, str, opts);
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: StrokeOpts = {}): void {
    const { width = 0.5, color = LINE } = opts;
    const h = this.size.height;
    this.current.push(
      ...ascii(
        `q ${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(h - y1)} m ${num(x2)} ${num(h - y2)} l S Q\n`
      )
    );
  }

  /** A filled rectangle, `y` being its TOP edge. */
  rect(x: number, y: number, w: number, h: number, color: Rgb): void {
    this.current.push(
      ...ascii(`q ${rgb(color)} rg ${num(x)} ${num(this.size.height - y - h)} ${num(w)} ${num(h)} re f Q\n`)
    );
  }

  // ── Serialisation ────────────────────────────────────────────────────────

  build(): Uint8Array {
    const objects: number[][] = [];
    const add = (body: number[]): number => {
      objects.push(body);
      return objects.length; // 1-based object number
    };

    // Reserve 1 and 2 for the catalog and the page tree, whose contents depend
    // on object numbers not yet allocated.
    const catalogNo = add([]);
    const pagesNo = add([]);

    const fontRegular = add(
      ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    );
    const fontBold = add(
      ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    );

    const pageNos: number[] = [];
    for (const content of this.pages) {
      const streamNo = add([
        ...ascii(`<< /Length ${content.length} >>\nstream\n`),
        ...content,
        ...ascii('\nendstream'),
      ]);
      pageNos.push(
        add(
          ascii(
            `<< /Type /Page /Parent ${pagesNo} 0 R ` +
              `/MediaBox [0 0 ${num(this.size.width)} ${num(this.size.height)}] ` +
              `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
              `/Contents ${streamNo} 0 R >>`
          )
        )
      );
    }

    objects[catalogNo - 1] = ascii(`<< /Type /Catalog /Pages ${pagesNo} 0 R >>`);
    objects[pagesNo - 1] = ascii(
      `<< /Type /Pages /Kids [${pageNos.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNos.length} >>`
    );

    const infoNo = add(
      [
        ...ascii('<< /Title '),
        ...literal(toWinAnsi(this.title)),
        ...ascii(` /Producer (Empiria Tours) /CreationDate (${pdfDate(this.producedAt)}) >>`),
      ]
    );

    // ── Assemble, tracking byte offsets for the xref table ──────────────────
    const out: number[] = [];
    // The binary comment tells anything sniffing the file that it is not text.
    out.push(...ascii('%PDF-1.4\n'), 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a);

    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets[i] = out.length;
      out.push(...ascii(`${i + 1} 0 obj\n`), ...body, ...ascii('\nendobj\n'));
    });

    const xrefAt = out.length;
    out.push(...ascii(`xref\n0 ${objects.length + 1}\n`));
    out.push(...ascii('0000000000 65535 f \n'));
    for (const off of offsets) {
      out.push(...ascii(`${String(off).padStart(10, '0')} 00000 n \n`));
    }
    out.push(
      ...ascii(
        `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNo} 0 R /Info ${infoNo} 0 R >>\n` +
          `startxref\n${xrefAt}\n%%EOF\n`
      )
    );

    return Uint8Array.from(out);
  }
}

/** PDF's own date syntax: `D:YYYYMMDDHHmmSS+00'00'`. Always written in UTC. */
function pdfDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}+00'00'`
  );
}
