/**
 * The blog renderer, proved before anything can call it.
 *
 *   bun run lib/blogMarkdown.test.ts
 *
 * The author of a blog post is a partner, not Empiria, and the storefront
 * shares an origin with the booking flow. So the hostile cases below are not
 * edge cases — they are the reason this module exists instead of a Markdown
 * dependency. See docs/BLOG.md, "Their markup is never rendered as HTML".
 */

import { readFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderBlogMarkdown, isAllowedImageUrl } from './blogMarkdown';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);

/** Render a post body to HTML the way a page would. */
const html = (src: string) =>
  renderToStaticMarkup(createElement(Fragment, null, renderBlogMarkdown(src)));

const IMG = 'https://abc.supabase.co/storage/v1/object/public/blog/a/b.png';

// ── 1. Ordinary Markdown ──────────────────────────────────────────────────
{
  ok('h2 from ##', html('## Santorini').includes('<h2>Santorini</h2>'));
  ok('h3 from ###', html('### Getting there').includes('<h3>Getting there</h3>'));
  ok('paragraph', html('Just words.').includes('<p>Just words.</p>'));

  const two = html('First para.\n\nSecond para.');
  eq('blank line splits paragraphs', (two.match(/<p>/g) || []).length, 2);

  const soft = html('one\ntwo');
  ok('single newline stays one paragraph', (soft.match(/<p>/g) || []).length === 1);
}

// ── 2. Inline marks ───────────────────────────────────────────────────────
{
  ok('bold', html('a **b** c').includes('<strong>b</strong>'));
  ok('italic', html('a *b* c').includes('<em>b</em>'));
  ok('code', html('a `b` c').includes('<code>b</code>'));
  ok('bold wins over italic on **', !html('**b**').includes('<em>'));
  ok('code is not re-parsed', html('`**b**`').includes('<code>**b**</code>'));
}

// ── 3. Blocks ─────────────────────────────────────────────────────────────
{
  const ul = html('- one\n- two');
  ok('bullet list', ul.includes('<ul>') && (ul.match(/<li>/g) || []).length === 2);

  const ol = html('1. one\n2. two');
  ok('ordered list', ol.includes('<ol>') && (ol.match(/<li>/g) || []).length === 2);

  ok('quote', html('> quoted').includes('<blockquote>'));
  ok('rule', html('---').includes('<hr'));

  const mixed = html('- one\n\nAfter.');
  ok('list closes before next block', mixed.includes('</ul>') && mixed.includes('<p>After.</p>'));
}

// ── 4. Links: scheme allowlist ────────────────────────────────────────────
{
  const ext = html('[go](https://example.com)');
  ok('https link renders', ext.includes('href="https://example.com"'));
  ok('external link is nofollow', ext.includes('nofollow') && ext.includes('noopener') && ext.includes('noreferrer'));
  ok('external link opens in new tab', ext.includes('target="_blank"'));

  const rel = html('[tours](/tours)');
  ok('site-relative link renders', rel.includes('href="/tours"'));
  ok('internal link is not nofollow', !rel.includes('nofollow'));
  ok('internal link stays in tab', !rel.includes('target="_blank"'));

  ok('http link renders', html('[x](http://example.com)').includes('href="http://example.com"'));
}

// ── 5. Links: the hostile schemes ─────────────────────────────────────────
{
  for (const bad of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
  ]) {
    const out = html(`[x](${bad})`);
    ok(`refused as link: ${bad.slice(0, 26)}`, !out.includes('<a '));
    ok(`no scheme in href: ${bad.slice(0, 26)}`, !/href="[^"]*script/i.test(out));
  }

  ok('refused link still shows its text', html('[click me](javascript:alert(1))').includes('click me'));
  ok('protocol-relative refused', !html('[x](//evil.com)').includes('<a '));

  // The URL runs to its *balanced* closing paren, not the first one. Getting
  // this wrong truncates any real URL containing brackets and leaves a stray
  // ")" in the prose after a refused link.
  const wiki = html('[Naxos](https://en.wikipedia.org/wiki/Naxos_(island))');
  ok('url keeps balanced parens', wiki.includes('href="https://en.wikipedia.org/wiki/Naxos_(island)"'));
  ok('no stray paren after a balanced url', !wiki.includes('</a>)'));
  ok('no stray paren after a refused link', !html('[click me](javascript:alert(1))').includes('</span>)'));
}

// ── 6. Images: host allowlist ─────────────────────────────────────────────
{
  ok('storage image renders', html(`![a](${IMG})`).includes(`src="${IMG}"`));
  ok('storage image keeps alt', html(`![a mule](${IMG})`).includes('alt="a mule"'));
  ok('off-allowlist image refused', !html('![x](https://evil.com/a.png)').includes('<img'));
  ok('off-allowlist image is not a link either', !html('![x](https://evil.com/a.png)').includes('<a '));
  ok('http storage-lookalike refused', !html('![x](http://abc.supabase.co/storage/v1/object/public/b/c.png)').includes('<img'));
  ok('private storage path refused', !html('![x](https://abc.supabase.co/storage/v1/object/sign/b/c.png)').includes('<img'));
  ok('host suffix trick refused', !isAllowedImageUrl('https://supabase.co.evil.com/storage/v1/object/public/a.png'));
  ok('javascript image refused', !html('![x](javascript:alert(1))').includes('<img'));
}

// ── 7. Raw HTML is text, never markup ─────────────────────────────────────
{
  const s = html('<script>alert(1)</script>');
  ok('script tag not emitted', !s.includes('<script>'));
  ok('script shown as text', s.includes('&lt;script&gt;'));

  // The payload must survive as visible characters, not as an element. Its
  // text necessarily still contains "onerror=" — what matters is that it sits
  // inside escaped text rather than in a tag the browser would act on.
  const payload = html('<img src=x onerror=alert(1)>');
  ok('img tag not emitted', !/<img[\s>]/.test(payload));
  ok('img payload is escaped text', payload.includes('&lt;img src=x onerror=alert(1)&gt;'));
  ok('no unescaped tag anywhere in payload', !/<(?!\/?p[\s>])[a-z]/i.test(payload));
  ok('iframe not emitted', !html('<iframe src="https://evil.com"></iframe>').includes('<iframe'));
  ok('html inside bold still escaped', html('**<b>x</b>**').includes('&lt;b&gt;'));
}

// ── 8. Malformed input must not throw or swallow ──────────────────────────
{
  const survivors = [
    '**unclosed bold\n\nStill here.',
    '[unclosed link\n\nStill here.',
    '[x](unclosed\n\nStill here.',
    '`unclosed code\n\nStill here.',
    '![alt](\n\nStill here.',
    '***\n\nStill here.',
    '](())[\n\nStill here.',
  ];
  for (const src of survivors) {
    let out = '';
    let threw = false;
    try { out = html(src); } catch { threw = true; }
    ok(`no throw: ${JSON.stringify(src.slice(0, 18))}`, !threw);
    ok(`rest survives: ${JSON.stringify(src.slice(0, 18))}`, out.includes('Still here.'));
  }

  eq('empty string renders nothing', html(''), '');
  eq('whitespace only renders nothing', html('   \n\n  \n'), '');
}

// ── 9. Pathological input must not hang ───────────────────────────────────
{
  const started = Date.now();
  const long = 'a'.repeat(200_000);
  html(long);
  html('['.repeat(20_000));
  html('*'.repeat(20_000));
  html(('- x\n').repeat(20_000));
  html('[a]('.repeat(20_000));   // every one starts a URL scan that never closes
  const ms = Date.now() - started;
  ok(`four pathological inputs render in under 3s (took ${ms}ms)`, ms < 3000);
}

// ── 10. The dangerous path does not exist ─────────────────────────────────
{
  const source = readFileSync(new URL('./blogMarkdown.ts', import.meta.url), 'utf8');
  ok('no dangerouslySetInnerHTML in the renderer', !source.includes('dangerouslySetInnerHTML'));
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
