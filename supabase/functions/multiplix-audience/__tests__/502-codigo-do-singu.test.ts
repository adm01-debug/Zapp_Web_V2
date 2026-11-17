import { handleMultiplixAudienceRequest } from '../index.ts';
import { EXPECTED_EXTERNAL_PROJECT_REF } from '../../_shared/crm-integration-contract.ts';

// ---------------------------------------------------------------------------
// 17/11: `list_ramos` e `list_ufs` respondiam 502 no navegador do dono e NAO
// havia como saber por que. A informacao morria em cadeia:
//   1. `fetchAudienceList` monta `MULTIPLIX_RPC:${code}` com o codigo do Singu;
//   2. o catch do handler fazia `error.message.split(':')[0]`, descartando esse
//      codigo e gravando no log so `code: 'MULTIPLIX_RPC'`;
//   3. `errorResponse` (_shared/validation.ts) troca a mensagem por
//      "Internal server error" em todo status >= 500.
// O cliente recebia um 502 sem nenhuma informacao, e chave recusada, erro do
// PostgREST, falha de rede e abort ficavam indistinguiveis. Medido no mesmo dia:
// as RPCs existem no Singu, rodam em 75 ms (ramos) e 2,7 s (ufs), `service_role`
// tem EXECUTE e nao ha timeout de statement nesse papel — ou seja, a causa
// estava justamente no campo que o handler apagava.
//
// Controle negativo: o corpo do 502 tem de NOMEAR o codigo do Singu e nao pode
// conter "Internal server error"; e vai o CODIGO e nada mais, porque
// message/details/hint do PostgREST descrevem o schema do Singu.
// ---------------------------------------------------------------------------

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SINGU_URL = `https://${EXPECTED_EXTERNAL_PROJECT_REF}.supabase.co`;
const ZAPP_URL = 'https://zapp-test.supabase.co';

Deno.test('502 do Singu nomeia o codigo no corpo (e nao vira "Internal server error")', async () => {
  const CHAVES_ENV = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
    'EXTERNAL_SUPABASE_URL', 'EXTERNAL_SUPABASE_SERVICE_ROLE_KEY',
    'MULTIPLIX_SCOPE_HMAC_SECRET',
  ];
  const envAnterior: Record<string, string | undefined> = {};
  for (const k of CHAVES_ENV) envAnterior[k] = Deno.env.get(k);
  Deno.env.set('SUPABASE_URL', ZAPP_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.set('SUPABASE_ANON_KEY', 'test-anon-key');
  Deno.env.set('EXTERNAL_SUPABASE_URL', SINGU_URL);
  // JWT no formato que isExpectedExternalServerKey exige (ref + service_role),
  // mesmo padrao de crm-integration/index.test.ts.
  const payloadExterno = btoa(JSON.stringify({ ref: EXPECTED_EXTERNAL_PROJECT_REF, role: 'service_role' }))
    .replace(/=/g, '');
  Deno.env.set('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY', `header.${payloadExterno}.signature`);
  Deno.env.set('MULTIPLIX_SCOPE_HMAC_SECRET', 'test-scope-secret');

  const fetchOriginal = globalThis.fetch;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url ?? input);
    if (url.includes('/auth/v1/user')) {
      return json({ id: 'user-502-singu', email: 'admin@zapp.test', role: 'authenticated' });
    }
    if (url.includes('/rest/v1/profiles') && url.includes('select=is_active')) return json({ is_active: true });
    if (url.includes('/rest/v1/rpc/')) {
      const rpc = url.split('/rest/v1/rpc/')[1].split('?')[0];
      if (rpc === 'is_admin' || rpc === 'user_has_permission') return json(true);
      if (rpc === 'consume_rate_limit') return json({ allowed: true, remaining: 59 });
      if (rpc === 'resolve_network_policy') {
        return json([{ allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }]);
      }
      // O Singu recusa do jeito que o PostgREST recusa: status proprio, `code`
      // nomeado e texto que descreve o schema.
      if (rpc === 'multiplix_list_ramos') {
        return json({
          code: 'PGRST301',
          message: 'JWT expired',
          details: 'relation public.companies scanned by schema-leaking-detail',
          hint: 'confira a chave service_role do projeto do Singu',
        }, 401);
      }
      return json(null);
    }
    return new Response('rota nao stubada', { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  try {
    const req = new Request('https://edge.test/multiplix-audience', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer jwt-do-cliente' },
      body: JSON.stringify({ action: 'list_ramos' }),
    });
    const response = await handleMultiplixAudienceRequest(req);
    assert(response.status === 502, `esperava 502 do Singu, veio ${response.status}`);

    const bruto = await response.text();
    assert(
      !bruto.includes('Internal server error'),
      `o corpo do 502 voltou a ser apagado por errorResponse: ${bruto}`,
    );
    const body = JSON.parse(bruto) as { error?: string; singu_code?: string | null; message?: string };
    assert(body.error === 'MULTIPLIX_RPC', `classe do erro inesperada: ${body.error}`);
    assert(
      body.singu_code === 'PGRST301',
      `o codigo do Singu nao chegou ao cliente (era o bug): ${body.singu_code}`,
    );
    assert(body.message === 'Singu request failed', `mensagem inesperada: ${body.message}`);

    // Vai o CODIGO e nada mais: nenhum texto do PostgREST sai da edge.
    for (const vazado of ['JWT expired', 'schema-leaking-detail', 'service_role', 'public.companies']) {
      assert(!bruto.includes(vazado), `texto do PostgREST vazou no corpo: ${vazado}`);
    }
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of Object.entries(envAnterior)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
});
