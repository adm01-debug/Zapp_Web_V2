// R2-MOD-070 (item 433) — "Gerar Voz chama a listagem de vozes e anuncia geração sem áudio".
//
// O laboratório de voz da tela de Configurações (src/components/voice/ElevenLabsVoiceDesign.tsx,
// `generateVoice`) envia `action: 'generate'`. O handler só conhece 'preview' e 'create'; qualquer
// outra action caía no ramo final e respondia com a LISTAGEM de vozes do provedor
// (GET https://api.elevenlabs.io/v1/voices), 200. A tela, sem `audioContent`, anunciava
// "Voz gerada com sucesso!" — confirmação de uma geração que nunca foi pedida ao provedor.
//
// A prova aqui é sobre o handler REAL, com o payload idêntico ao da tela e `fetch` stubado. O caso
// vermelho (`action: 'generate'` e action fora do contrato) exige 400 EXPLÍCITO e ZERO chamada ao
// endpoint de listagem: antes da correção devolvia 200 com a lista de vozes.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/elevenlabs-voice-design/index.test.ts

import { handleVoiceDesignRequest } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ── rotas do provedor (o que o handler NÃO pode alcançar sem contrato) ──────────
const ELEVENLABS_LISTAGEM = '/v1/voices';
const ELEVENLABS_PREVIEW = '/v1/text-to-voice/create-previews';
const ELEVENLABS_CREATE = '/v1/text-to-voice/create-voice-from-preview';

type Route = { match: string; body: unknown; status?: number };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; body: string | null }> = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : null });
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return Promise.resolve(new Response('nao stubado', { status: 599 }));
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as typeof fetch;
  const seen = () => calls.map((c) => c.url);
  return { calls, seen, restore: () => { globalThis.fetch = original; } };
}

// ── ambiente: cada teste usa um usuário próprio (o rate limit local é por chave) ─
Deno.env.set('SUPABASE_URL', 'https://stub.supabase.co');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-de-teste');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key-de-teste');
Deno.env.set('ELEVENLABS_API_KEY', 'xi-api-key-de-teste');

function rotasDeAuth(userId: string): Route[] {
  return [
    { match: '/auth/v1/user', body: { id: userId, aud: 'authenticated' } },
    { match: '/rest/v1/rpc/consume_rate_limit', body: [{ allowed: true, remaining: 4 }] },
  ];
}

function makeRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) headers.Authorization = 'Bearer token-de-teste';
  return new Request('https://stub.supabase.co/functions/v1/elevenlabs-voice-design', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

/** Payload idêntico ao que a tela monta em `generateVoice` (ElevenLabsVoiceDesign.tsx). */
const PAYLOAD_GERAR_VOZ = {
  action: 'generate',
  name: 'Voz do suporte',
  description: 'Tom calmo. Gender: female, age: young, accent: brazilian',
  text: 'Olá! Essa é a minha voz personalizada.',
  gender: 'female',
  age: 'young',
  accent: 'brazilian',
};

/** Resposta de listagem: o que o ramo antigo devolvia no lugar de uma prévia. */
const LISTAGEM_DE_VOZES = { voices: [{ voice_id: 'voz-1' }, { voice_id: 'voz-2' }] };

Deno.test('R2-MOD-070: a action "generate" da tela é RECUSADA com 400 e não vira listagem de vozes', async () => {
  const stub = withFetch([
    ...rotasDeAuth('user-generate'),
    { match: ELEVENLABS_LISTAGEM, body: LISTAGEM_DE_VOZES },
  ]);
  try {
    const res = await handleVoiceDesignRequest(makeRequest(PAYLOAD_GERAR_VOZ));
    assert(res.status === 400, `'generate' deveria ser recusada com 400, veio ${res.status}`);
    assert(
      !stub.seen().some((u) => u.includes(ELEVENLABS_LISTAGEM)),
      `a listagem de vozes não pode ser o resultado de uma geração: ${stub.seen().join(', ')}`,
    );
    const payload = await res.json() as { error: string; voices?: unknown };
    assert(payload.voices === undefined, 'a resposta de erro não pode carregar a lista de vozes');
    assert(
      payload.error.includes('preview') && payload.error.includes('create'),
      `o erro precisa dizer quais actions existem: ${payload.error}`,
    );
  } finally {
    stub.restore();
  }
});

Deno.test('R2-MOD-070: action fora do contrato (inclusive não-string) recusa 400, sem tocar o provedor', async () => {
  for (const body of [{ action: 'list' }, { action: 'LIST' }, { action: 42 }, { action: 'gerar' }]) {
    const stub = withFetch([
      ...rotasDeAuth(`user-fora-do-contrato-${String(body.action)}`),
      { match: ELEVENLABS_LISTAGEM, body: LISTAGEM_DE_VOZES },
      { match: ELEVENLABS_PREVIEW, body: { previews: [] } },
      { match: ELEVENLABS_CREATE, body: { voice_id: 'voz-criada' } },
    ]);
    try {
      const res = await handleVoiceDesignRequest(makeRequest(body));
      assert(res.status === 400, `${JSON.stringify(body)} deveria ser 400, veio ${res.status}`);
      assert(
        !stub.seen().some((u) => u.includes('api.elevenlabs.io')),
        `action fora do contrato não pode chamar o provedor: ${stub.seen().join(', ')}`,
      );
    } finally {
      stub.restore();
    }
  }
});

Deno.test('R2-MOD-070: sem bearer devolve 401 e não chama ninguém', async () => {
  const stub = withFetch([]);
  try {
    const res = await handleVoiceDesignRequest(makeRequest(PAYLOAD_GERAR_VOZ, false));
    assert(res.status === 401, `esperado 401, veio ${res.status}`);
    assert(stub.seen().length === 0, `não deveria tocar a rede: ${stub.seen().join(', ')}`);
  } finally {
    stub.restore();
  }
});

Deno.test('R2-MOD-070: preview continua alcançando create-previews (e nunca a listagem)', async () => {
  const stub = withFetch([
    ...rotasDeAuth('user-preview'),
    { match: ELEVENLABS_PREVIEW, body: { previews: [{ generated_voice_id: 'previa-1', audio_base_64: 'QUJD' }] } },
    { match: ELEVENLABS_LISTAGEM, body: LISTAGEM_DE_VOZES },
  ]);
  try {
    const res = await handleVoiceDesignRequest(
      makeRequest({ action: 'preview', description: 'Tom calmo e jovem' }),
    );
    assert(res.status === 200, `esperado 200, veio ${res.status}`);
    assert(stub.seen().some((u) => u.includes(ELEVENLABS_PREVIEW)), 'preview deveria chamar create-previews');
    assert(
      !stub.seen().some((u) => u.includes(ELEVENLABS_LISTAGEM)),
      `preview não pode listar vozes: ${stub.seen().join(', ')}`,
    );
    const payload = await res.json() as { previews: Array<{ generated_voice_id: string }> };
    assert(payload.previews[0].generated_voice_id === 'previa-1', 'a prévia gerada deveria voltar ao chamador');
  } finally {
    stub.restore();
  }
});

Deno.test('R2-MOD-070: create usa o generated_voice_id da prévia e não lista vozes', async () => {
  const stub = withFetch([
    ...rotasDeAuth('user-create'),
    { match: ELEVENLABS_CREATE, body: { voice_id: 'voz-criada-1' } },
    { match: ELEVENLABS_LISTAGEM, body: LISTAGEM_DE_VOZES },
  ]);
  try {
    const res = await handleVoiceDesignRequest(makeRequest({
      action: 'create',
      voice_name: 'Voz do teste',
      voice_description: 'Tom calmo',
      generated_voice_id: 'previa-1',
    }));
    assert(res.status === 200, `esperado 200, veio ${res.status}`);
    const criacao = stub.calls.find((c) => c.url.includes(ELEVENLABS_CREATE));
    assert(criacao !== undefined, `create deveria chamar create-voice-from-preview: ${stub.seen().join(', ')}`);
    assert(
      criacao.body !== null && criacao.body.includes('previa-1'),
      `a identidade da prévia deveria ir no corpo enviado ao provedor: ${criacao.body}`,
    );
    assert(
      !stub.seen().some((u) => u.includes(ELEVENLABS_LISTAGEM)),
      `create não pode listar vozes: ${stub.seen().join(', ')}`,
    );
  } finally {
    stub.restore();
  }
});

Deno.test('R2-MOD-070: sem action o corpo continua sendo tratado como preview (contrato do schema)', async () => {
  const stub = withFetch([
    ...rotasDeAuth('user-sem-action'),
    { match: ELEVENLABS_PREVIEW, body: { previews: [] } },
    { match: ELEVENLABS_LISTAGEM, body: LISTAGEM_DE_VOZES },
  ]);
  try {
    const res = await handleVoiceDesignRequest(makeRequest({ description: 'Tom calmo' }));
    assert(res.status === 200, `esperado 200, veio ${res.status}`);
    assert(stub.seen().some((u) => u.includes(ELEVENLABS_PREVIEW)), 'sem action deveria cair em preview');
    assert(
      !stub.seen().some((u) => u.includes(ELEVENLABS_LISTAGEM)),
      `sem action não pode listar vozes: ${stub.seen().join(', ')}`,
    );
  } finally {
    stub.restore();
  }
});
