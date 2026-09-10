/**
 * Which image sources `next/image` is allowed to optimise.
 *
 * `next.config.ts` permits exactly one remote pattern — public objects in
 * Supabase storage — and a source from anywhere else throws at render time.
 * That is the right failure for a hard-coded path and the wrong one for
 * content somebody pasted into a form, so the postcard deck asks this first
 * and passes `unoptimized` when the answer is no: a slightly heavier image
 * beats a broken landing page.
 *
 * Client-safe on purpose; the deck is a client component.
 */
export function isOptimisableImage(src: string): boolean {
  if (!src) return false;
  // A file under /public. One slash, not two — `//host/file` is a host.
  if (src.startsWith('/')) return !src.startsWith('//');
  try {
    const url = new URL(src);
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.supabase.co') &&
      url.pathname.startsWith('/storage/v1/object/public/')
    );
  } catch {
    return false;
  }
}
