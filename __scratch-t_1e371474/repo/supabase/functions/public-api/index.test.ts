import { handlePublicApiRequest } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('kill switch rejects every legacy credential before parsing the body', async () => {
  const response = handlePublicApiRequest(new Request('https://edge.invalid/public-api', {
    method: 'POST',
    headers: {
      Origin: 'https://zapp-web-v2.vercel.app',
      'Content-Type': 'application/json',
      'x-api-key': 'legacy-token-must-never-be-read',
    },
    body: 'not-json',
  }));

  assert(response.status === 410, `expected 410, got ${response.status}`);
  assert(response.headers.get('Cache-Control') === 'no-store', 'response must not be cached');
  const body = await response.json();
  assert(body.error === 'Public API is disabled', 'unexpected tombstone response');
});

Deno.test('kill switch preserves validated CORS preflight without side effects', () => {
  const response = handlePublicApiRequest(new Request('https://edge.invalid/public-api', {
    method: 'OPTIONS',
    headers: { Origin: 'https://zapp-web-v2.vercel.app' },
  }));

  assert(response.status === 200, `expected 200, got ${response.status}`);
  assert(
    response.headers.get('Access-Control-Allow-Origin') === 'https://zapp-web-v2.vercel.app',
    'allowed origin was not preserved',
  );
});
