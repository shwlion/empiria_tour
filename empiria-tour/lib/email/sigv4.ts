import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4, by hand.
 *
 * The AWS SDK is Apache-2.0 and would pass §5.7, but `@aws-sdk/client-sesv2`
 * brings some thirty packages with it to sign one POST. The algorithm is a
 * page long and fully specified, so it is written here and *proved* against
 * the test vector AWS publishes for it (lib/email/sigv4.test.ts) rather than
 * trusted. Pure: takes a clock, returns headers. Nothing here knows about
 * SES, or about the network.
 */

export type SignInput = {
  method: string;
  /** Absolute URL; its path and query are signed, its host becomes the Host header. */
  url: string;
  /** Header names are lower-cased; values are trimmed and inner runs of spaces collapsed, as the spec requires. */
  headers: Record<string, string>;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** Signing time; the caller passes `new Date()` and the test passes a fixed one. */
  date: Date;
};

const sha256 = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();

/** 20150830T123600Z — the timestamp format the signature and the header both use. */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * RFC 3986 encoding, which is what the canonical query string wants: every
 * byte outside unreserved is percent-encoded and upper-case, including the
 * ones `encodeURIComponent` leaves alone.
 */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(search: string): string {
  if (!search) return '';
  return search
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const [k, v = ''] = pair.split('=');
      return [rfc3986(decodeURIComponent(k)), rfc3986(decodeURIComponent(v))] as const;
    })
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/**
 * Returns the request headers with Host, X-Amz-Date and Authorization set.
 * The caller sends exactly these; adding a header afterwards would leave it
 * unsigned, which AWS accepts, but changing one would not.
 */
export function signRequest(input: SignInput): Record<string, string> {
  const url = new URL(input.url);
  const stamp = amzDate(input.date);
  const day = stamp.slice(0, 8);

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers)) headers[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  headers.host = url.host;
  headers['x-amz-date'] = stamp;

  const signedNames = Object.keys(headers).sort();
  const canonicalHeaders = signedNames.map((k) => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = signedNames.join(';');
  const payloadHash = sha256(input.body);

  const canonicalRequest = [
    input.method.toUpperCase(),
    url.pathname || '/',
    canonicalQuery(url.search),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, day);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** Exposed for the test, which checks the intermediate values AWS publishes, not only the final signature. */
export const _internals = { sha256, canonicalQuery };
