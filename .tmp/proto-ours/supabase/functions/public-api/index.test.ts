import { handlePublicApiRequest } from './index.ts';
import { getCorsHeaders } from '../_shared/validation.ts';

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

// Origens aceitas pelo CORS compartilhado (dominio oficial zappweb.app.br, 06/10/2026).
const origem = (o: string) =>
  getCorsHeaders(new Request('https://edge.invalid/x', { headers: { origin: o } }))['Access-Control-Allow-Origin'];

Deno.test('CORS devolve a propria origem para os dois enderecos oficiais', () => {
  assert(origem('https://zappweb.app.br') === 'https://zappweb.app.br', 'zappweb.app.br deveria ser aceito');
  assert(origem('https://zapp-web-v2.vercel.app') === 'https://zapp-web-v2.vercel.app', 'endereco da Vercel deveria continuar aceito');
});

Deno.test('CORS nao aceita dominios parecidos nem subdominios do oficial', () => {
  for (const o of [
    'https://zappweb.app.br.evil.example',
    'https://evilzappweb.app.br',
    'https://www.zappweb.app.br',
    'https://api.zappweb.app.br',
    'http://zappweb.app.br',
    'https://zappweb.app.br:8443',
    'https://atomicabr.com.br',
  ]) {
    assert(origem(o) === 'https://zapp-web-v2.vercel.app', `origem ${o} nao pode ser refletida`);
  }
});
