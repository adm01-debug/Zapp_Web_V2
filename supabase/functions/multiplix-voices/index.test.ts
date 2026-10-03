// F64 (Bloco H — Voz): contrato da edge `multiplix-voices`.
//
// Duas camadas:
//  1. as DECISOES de autorizacao (funcoes puras) — quem enxerga qual voz e quem pode recuperar
//     o ativo de voz. As regras que o F64 pede: papel, perfil, revogacao e criador do ativo;
//  2. o HANDLER, com `fetch` stubado: 401 sem bearer, 400 de acao invalida, 503 sem env,
//     `voices.list` filtrando o grant revogado e `assets.sign` negando sem grant / em ativo
//     invalidado, e assinando no caminho feliz.
//
// `requireAuth` bate em `${SUPABASE_URL}/auth/v1/user` e o resto e PostgREST/Storage: o stub roteia
// por trecho de URL, entao cada teste declara exatamente as respostas que o caminho dele precisa.
import {
  canRecoverAsset,
  grantReachesCaller,
  handleMultiplixVoicesRequest,
  visibleGrants,
  type CallerContext,
  type VoiceAssetRow,
  type VoiceGrantRow,
} from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ── autores ────────────────────────────────────────────────────────────────────
const USER_B = '20000000-0000-0000-0000-00000000000b';
const USER_C = '20000000-0000-0000-0000-00000000000c';
const PERFIL_B = '10000000-0000-0000-0000-00000000000b';
const PERFIL_C = '10000000-0000-0000-0000-00000000000c';
const VOZ_ROLE = 'voice-role';
const VOZ_PERFIL = 'voice-perfil';
const VOZ_REVOGADA = 'voice-revogada';
const ASSET_ID = '30000000-0000-0000-0000-000000000001';

const callerAgentB: CallerContext = {
  userId: USER_B, roleNames: ['agent'], profileId: PERFIL_B, isStaff: false,
};
const callerAgentC: CallerContext = {
  userId: USER_C, roleNames: ['agent'], profileId: PERFIL_C, isStaff: false,
};
const callerAdmin: CallerContext = {
  userId: '20000000-0000-0000-0000-00000000000a', roleNames: ['admin'],
  profileId: '10000000-0000-0000-0000-00000000000a', isStaff: true,
};

function grantRow(over: Partial<VoiceGrantRow> = {}): VoiceGrantRow {
  return {
    voice_id: VOZ_ROLE, titular: 'Titular A', roles: ['agent'], perfis: null,
    origem: 'contrato-2026-01', revoked_at: null, ...over,
  };
}

function assetRow(over: Partial<VoiceAssetRow> = {}): VoiceAssetRow {
  return {
    id: ASSET_ID, caminho: 'multiplix-voice/comercial/a.mp3', voice_id: VOZ_ROLE,
    created_by: null, invalidated_at: null, ...over,
  };
}

// ────────────────────────────── 1. decisoes ────────────────────────────────────
Deno.test('F64: grant por PAPEL alcanca quem tem o papel, e nao alcanca quem nao tem', () => {
  const grant = grantRow({ roles: ['agent'], perfis: null });
  assert(grantReachesCaller(grant, callerAgentB), 'agent deveria alcancar o grant por papel');
  const supervisor = { ...callerAgentB, roleNames: ['supervisor'] };
  assert(!grantReachesCaller(grant, supervisor), 'supervisor comum nao tem o papel agent no grant');
});

Deno.test('F64: grant por PERFIL alcanca so o perfil listado', () => {
  const grant = grantRow({ roles: null, perfis: [PERFIL_C] });
  assert(grantReachesCaller(grant, callerAgentC), 'perfil C deveria alcancar o proprio grant');
  assert(!grantReachesCaller(grant, callerAgentB), 'perfil B nao esta no grant do C');
});

Deno.test('F64: grant REVOGADO nao alcanca ninguem — nem quem casaria o papel, nem staff', () => {
  const revogado = grantRow({ roles: ['agent'], revoked_at: '2026-10-03T00:00:00Z' });
  assert(!grantReachesCaller(revogado, callerAgentB), 'grant revogado deu acesso ao agent');
  // Decisao do executor: a lista da edge responde "quais vozes EU posso usar" — voz revogada nao se
  // oferece nem ao admin. A gestao (ver que a voz existe e reconceder) e a leitura da TABELA, onde a
  // policy de admin nao filtra `revoked_at` — provado no harness f64-voz-assets-e-grants.test.sh.
  assert(!grantReachesCaller(revogado, callerAdmin), 'grant revogado apareceu para o admin na lista de uso');
});

Deno.test('F64: staff alcanca qualquer grant vivo (lista nao sai vazia para admin)', () => {
  const semAlvoDoChamador = grantRow({ roles: ['agent'], perfis: [PERFIL_C] });
  assert(grantReachesCaller(semAlvoDoChamador, callerAdmin), 'admin deveria alcancar a voz');
});

Deno.test('F64: visibleGrants devolve so os grants vivos que alcancam o chamador', () => {
  const grants = [
    grantRow({ voice_id: VOZ_ROLE, roles: ['agent'] }),
    grantRow({ voice_id: VOZ_PERFIL, roles: null, perfis: [PERFIL_C] }),
    grantRow({ voice_id: VOZ_REVOGADA, roles: ['agent'], revoked_at: '2026-10-03T00:00:00Z' }),
  ];
  const doB = visibleGrants(grants, callerAgentB).map((g) => g.voice_id);
  assert(JSON.stringify(doB) === JSON.stringify([VOZ_ROLE]), `B deveria ver so a voz por papel: ${doB}`);
  const doC = visibleGrants(grants, callerAgentC).map((g) => g.voice_id);
  assert(JSON.stringify(doC) === JSON.stringify([VOZ_ROLE, VOZ_PERFIL]), `C deveria ver as duas: ${doC}`);
  // Revogada nao entra na lista de NINGUEM (nem do admin): a lista responde "o que eu posso usar".
  assert(visibleGrants(grants, callerAdmin).length === 2, 'admin deveria ver as duas vivas (a revogada nao se oferece)');
});

Deno.test('F64: canRecoverAsset cobre criador, staff, grant vivo e ativo invalidado', () => {
  const semGrant: VoiceGrantRow[] = [];
  // criador do ativo recupera sem grant
  assert(
    canRecoverAsset(assetRow({ created_by: PERFIL_B, voice_id: 'voice-do-b' }), semGrant, callerAgentB),
    'criador deveria recuperar o proprio ativo',
  );
  // outro perfil sem grant nao recupera
  assert(
    !canRecoverAsset(assetRow({ created_by: PERFIL_B, voice_id: 'voice-do-b' }), semGrant, callerAgentC),
    'nao-criador sem grant recuperou o ativo alheio',
  );
  // grant vivo por papel recupera
  assert(canRecoverAsset(assetRow(), [grantRow()], callerAgentB), 'grant vivo deveria permitir recuperar');
  // grant revogado nao recupera (recuperacao do asset tambem e cortada)
  assert(
    !canRecoverAsset(assetRow(), [grantRow({ revoked_at: '2026-10-03T00:00:00Z' })], callerAgentB),
    'grant revogado ainda recuperou o asset',
  );
  // ativo invalidado nao recupera nem com grant vivo
  assert(
    !canRecoverAsset(assetRow({ invalidated_at: '2026-10-03T00:00:00Z' }), [grantRow()], callerAgentB),
    'ativo invalidado (roteiro mudou) ainda foi assinado',
  );
  // staff recupera ativo de voz que nao e dele
  assert(canRecoverAsset(assetRow(), semGrant, callerAdmin), 'staff deveria recuperar');
});

// ────────────────────────────── 2. handler ─────────────────────────────────────
type Route = { match: string; body: unknown; status?: number };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const route = routes.find((r) => url.includes(r.match));
    if (!route) {
      seen.push(`SEM_STUB ${url}`);
      return Promise.resolve(new Response('nao stubado', { status: 599 }));
    }
    seen.push(url);
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as typeof fetch;
  return { seen, restore: () => { globalThis.fetch = original; } };
}

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<void>) {
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

const ENV_OK = {
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-de-teste',
  SUPABASE_ANON_KEY: 'anon-key-de-teste',
};

const ROTA_AUTH = { match: '/auth/v1/user', body: { id: USER_B, aud: 'authenticated' } };
const ROTA_PAPEL_AGENT = { match: '/rest/v1/user_roles', body: [{ role: 'agent' }] };
const ROTA_PERFIL_B = { match: '/rest/v1/profiles', body: { id: PERFIL_B } };
const ROTA_NAO_STAFF = { match: '/rest/v1/rpc/is_admin_or_supervisor', body: false };

function makeRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) headers.Authorization = 'Bearer token-de-teste';
  return new Request('https://stub.supabase.co/functions/v1/multiplix-voices', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

Deno.test('F64 handler: sem bearer devolve 401 e nao chama o banco', async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([]);
    try {
      const res = await handleMultiplixVoicesRequest(makeRequest({ action: 'voices.list' }, false));
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(stub.seen.length === 0, `nao deveria tocar a rede: ${stub.seen.join(',')}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test('F64 handler: sem env configurada devolve 503', async () => {
  await withEnv({}, async () => {
    const res = await handleMultiplixVoicesRequest(makeRequest({ action: 'voices.list' }));
    assert(res.status === 503, `esperado 503, veio ${res.status}`);
  });
});

Deno.test('F64 handler: acao fora do contrato devolve 400', async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH]);
    try {
      const res = await handleMultiplixVoicesRequest(makeRequest({ action: 'voices.delete' }));
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test('F64 handler: voices.list devolve so o grant vivo que alcanca o chamador', async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_PAPEL_AGENT,
      ROTA_PERFIL_B,
      ROTA_NAO_STAFF,
      {
        match: '/rest/v1/multiplix_voice_grants',
        body: [
          { voice_id: VOZ_ROLE, titular: 'Titular A', roles: ['agent'], perfis: null, origem: 'contrato-1', revoked_at: null },
          { voice_id: VOZ_PERFIL, titular: 'Titular C', roles: null, perfis: [PERFIL_C], origem: 'contrato-2', revoked_at: null },
          { voice_id: VOZ_REVOGADA, titular: 'X', roles: ['agent'], perfis: null, origem: 'contrato-3', revoked_at: '2026-10-03T00:00:00Z' },
        ],
      },
    ]);
    try {
      const res = await handleMultiplixVoicesRequest(makeRequest({ action: 'voices.list' }));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const payload = await res.json() as { voices: Array<{ voice_id: string }> };
      const ids = payload.voices.map((v) => v.voice_id);
      assert(
        JSON.stringify(ids) === JSON.stringify([VOZ_ROLE]),
        `o chamador deveria ver so a voz do proprio papel (revogada e a do C fora): ${ids}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test('F64 handler: assets.sign nega 403 quando a voz nao tem grant para o chamador', async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_PAPEL_AGENT,
      ROTA_PERFIL_B,
      ROTA_NAO_STAFF,
      { match: '/rest/v1/multiplix_voice_assets', body: assetRow({ voice_id: VOZ_PERFIL }) },
      { match: '/rest/v1/multiplix_voice_grants', body: [grantRow({ voice_id: VOZ_PERFIL, roles: null, perfis: [PERFIL_C] })] },
    ]);
    try {
      const res = await handleMultiplixVoicesRequest(
        makeRequest({ action: 'assets.sign', params: { asset_id: ASSET_ID } }),
      );
      assert(res.status === 403, `esperado 403, veio ${res.status}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test('F64 handler: assets.sign devolve 403 de INVALIDADO quando o roteiro mudou', async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_PAPEL_AGENT,
      ROTA_PERFIL_B,
      ROTA_NAO_STAFF,
      { match: '/rest/v1/multiplix_voice_assets', body: assetRow({ invalidated_at: '2026-10-03T00:00:00Z' }) },
      { match: '/rest/v1/multiplix_voice_grants', body: [grantRow()] },
    ]);
    try {
      const res = await handleMultiplixVoicesRequest(
        makeRequest({ action: 'assets.sign', params: { asset_id: ASSET_ID } }),
      );
      assert(res.status === 403, `esperado 403, veio ${res.status}`);
      const payload = await res.json() as { error: string };
      assert(
        payload.error === 'multiplix_voice_asset_invalidated',
        `erro deveria nomear o ativo invalidado: ${payload.error}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test('F64 handler: assets.sign assina com o TTL do envio no caminho feliz', async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_PAPEL_AGENT,
      ROTA_PERFIL_B,
      ROTA_NAO_STAFF,
      { match: '/rest/v1/multiplix_voice_assets', body: assetRow() },
      { match: '/rest/v1/multiplix_voice_grants', body: [grantRow()] },
      { match: '/storage/v1/object/sign/', body: { signedURL: '/object/sign/multiplix-voice/comercial/a.mp3?token=abc' } },
    ]);
    try {
      const res = await handleMultiplixVoicesRequest(
        makeRequest({ action: 'assets.sign', params: { asset_id: ASSET_ID } }),
      );
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const payload = await res.json() as { url: string; expires_in: number; voice_id: string };
      assert(payload.expires_in === 300, `TTL deveria ser o do envio (300s): ${payload.expires_in}`);
      assert(payload.url.includes('/object/sign/multiplix-voice/'), `url assinada inesperada: ${payload.url}`);
      assert(payload.voice_id === VOZ_ROLE, `voice_id inesperado: ${payload.voice_id}`);
    } finally {
      stub.restore();
    }
  });
});
