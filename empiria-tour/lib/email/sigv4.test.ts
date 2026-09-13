import { signRequest, amzDate, _internals } from './sigv4';

/**
 * The signer against AWS's own published test vector — "get-vanilla" from the
 * SigV4 test suite, credentials AKIDEXAMPLE / wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY,
 * region us-east-1, service "service", 2015-08-30T12:36:00Z. The expected
 * signature is AWS's, not ours, which is what makes this a proof rather than
 * a tautology.
 *
 *   bun run lib/email/sigv4.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const DATE = new Date('2015-08-30T12:36:00Z');
eq('the timestamp format', amzDate(DATE), '20150830T123600Z');
eq('the empty-payload hash', _internals.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

const signed = signRequest({
  method: 'GET',
  url: 'https://example.amazonaws.com/',
  headers: {},
  body: '',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
  date: DATE,
});

eq('host is signed', signed.host, 'example.amazonaws.com');
eq('x-amz-date is signed', signed['x-amz-date'], '20150830T123600Z');
eq(
  "AWS's get-vanilla signature",
  signed.authorization,
  'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'
);

// Header canonicalisation: names lower-cased, values trimmed, inner spaces
// collapsed, sorted by name. A wrong canonical form signs successfully and
// then fails at AWS with a message that names nothing.
const withHeaders = signRequest({
  method: 'POST',
  url: 'https://email.ca-central-1.amazonaws.com/v2/email/outbound-emails',
  headers: { 'Content-Type': '  application/json  ', 'X-Custom': 'a   b' },
  body: '{"a":1}',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'ca-central-1',
  service: 'ses',
  date: DATE,
});
eq('signed header list is sorted and lower-case', withHeaders.authorization.match(/SignedHeaders=([^,]+)/)?.[1], 'content-type;host;x-amz-date;x-custom');
eq('header values are trimmed and collapsed', [withHeaders['content-type'], withHeaders['x-custom']], ['application/json', 'a b']);
eq('the scope names the region and service', withHeaders.authorization.includes('/20150830/ca-central-1/ses/aws4_request,'), true);

// Query canonicalisation, the part most hand-rolled signers get wrong.
eq('query is sorted and RFC 3986 encoded', _internals.canonicalQuery('?b=2&a=1&c=x y*'), 'a=1&b=2&c=x%20y%2A');
eq('an empty query is empty', _internals.canonicalQuery(''), '');

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
