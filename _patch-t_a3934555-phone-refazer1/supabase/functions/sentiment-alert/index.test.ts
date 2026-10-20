import { handleSentimentAlertRequest } from './index.ts';

function assertStatus(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`expected HTTP ${expected}, got ${actual}`);
}

Deno.test('sentiment alert rejects non-POST methods before reading secrets', async () => {
  const response = await handleSentimentAlertRequest(new Request('https://edge.invalid', { method: 'GET' }));
  assertStatus(response.status, 405);
});

Deno.test('sentiment alert rejects anonymous requests before parsing the body', async () => {
  const response = await handleSentimentAlertRequest(new Request('https://edge.invalid', {
    method: 'POST',
    body: 'not-json',
  }));
  assertStatus(response.status, 401);
});

Deno.test('sentiment alert handles CORS before authentication', async () => {
  const response = await handleSentimentAlertRequest(new Request('https://edge.invalid', {
    method: 'OPTIONS',
    headers: { origin: 'https://zapp-web-v2.vercel.app' },
  }));
  assertStatus(response.status, 200);
});
