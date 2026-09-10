import { isOptimisableImage } from './images';

/**
 * Which image sources `next/image` may optimise.
 *
 *   bun run lib/images.test.ts
 *
 * `next.config.ts` allows exactly one remote host pattern. An image from
 * anywhere else throws at render, which is the wrong failure for editorial
 * content somebody pasted into a form — so the deck asks first and falls back
 * to serving the file as-is.
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`
  );
};

eq('a file under /public', isOptimisableImage('/showcase/cyclades.jpg'), true);
eq('a Supabase public object', isOptimisableImage('https://wnaleobzkoukdzlruouu.supabase.co/storage/v1/object/public/media/a.jpg'), true);
eq('any project on supabase.co', isOptimisableImage('https://abc.supabase.co/storage/v1/object/public/x/y.png'), true);

eq('a protocol-relative path is a host, not a file', isOptimisableImage('//evil.com/x.jpg'), false);
eq('a signed Supabase URL is not public', isOptimisableImage('https://abc.supabase.co/storage/v1/object/sign/x/y.jpg'), false);
eq('plain http is refused', isOptimisableImage('http://abc.supabase.co/storage/v1/object/public/x.jpg'), false);
eq('another host is refused', isOptimisableImage('https://images.unsplash.com/photo-1'), false);
eq('a lookalike host is refused', isOptimisableImage('https://abc.supabase.co.evil.com/storage/v1/object/public/x.jpg'), false);
eq('a data URL is refused', isOptimisableImage('data:image/png;base64,AAAA'), false);
eq('nothing is refused', isOptimisableImage(''), false);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
