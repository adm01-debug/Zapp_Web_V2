import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalEndpointFromUrl, requireAuth } from '../../supabase/functions/_shared/validation.ts';

/**
 * R2-AUTH-022 / item 27.3 — contrato de política de rede no requireAuth.
 *
 * Prova que `requireAuth` deixa de aceitar usuário só porque o JWT é válido: a
 * política de rede (IP/país via RPC `resolve_network_policy`) passa a ser
 * obrigatória para TODA Edge interativa autenticada, por uma única integração
 * central em `validation.ts` — os consumidores existentes herdam a trava sem
 * edição individual.
 *
 *   * 401 — token ausente/inválido (autenticação continua em primeiro);
 *   * 403 — política nega (IP ou país bloqueado);
 *   * 503 — política não decide (RPC indisponível/endpoint inválido);
 *   * allow — devolve `{ userId }` e encaminha IP/país/endpoint à RPC.
 *
 * Funcional (injeção de getUser + policyRpc) + estrutural (ordem no fonte:
 * autenticar antes de consultar política). Só mocks injetados via `opts`: sem
 * rede, sem env real, sem banco.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

/** Client RPC fake no formato de NetworkPolicyRpcClient; registra cada chamada. */
function fakeRpc(outcome: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve(outcome);
    },
  };
}

const user = (id = 'user-1') => ({ data: { user: { id } }, error: null });
const bearer = (headers: Record<string, string> = {}) => ({ authorization: 'Bearer token-valido', ...headers });

describe('canonicalEndpointFromUrl — endpoint canônico estável a partir da URL', () => {
  it('extrai o nome da função do gateway /functions/v1/<nome>', () => {
    expect(
      canonicalEndpointFromUrl(req('https://edge.example.com/functions/v1/multiplix-dispatch')),
    ).toBe('multiplix-dispatch');
  });

  it('descarta sub-path e devolve só o nome da função', () => {
    expect(canonicalEndpointFromUrl(req('https://edge.example.com/functions/v1/ai-proxy/transcribe'))).toBe('ai-proxy');
  });

  it('usa o primeiro segmento quando não há a barra functions/v1', () => {
    expect(canonicalEndpointFromUrl(req('https://edge.example.com/auth-login'))).toBe('auth-login');
  });

  it('devolve string vazia para URL sem segmento (a política falha fechada)', () => {
    expect(canonicalEndpointFromUrl(req('https://host.example'))).toBe('');
  });
});

describe('requireAuth — política de rede obrigatória (R2-AUTH-022 / 27.3)', () => {
  it('mantém 401 para token ausente (autenticação continua em primeiro)', async () => {
    const res = await requireAuth(req('https://edge.example.com/functions/v1/foo'));
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it('mantém 401 para token inválido (getUser devolve erro)', async () => {
    const res = await requireAuth(req('https://edge.example.com/functions/v1/foo', bearer()), {
      getUser: () => Promise.resolve({ data: null, error: { message: 'invalid token' } }),
    });
    expect((res as Response).status).toBe(401);
  });

  it('não aceita usuário quando a política nega — 403, e a RPC é consultada antes', async () => {
    const rpc = fakeRpc({ data: [{ allowed: false, reason: 'ip_blocked' }], error: null });
    const res = await requireAuth(
      req('https://edge.example.com/functions/v1/multiplix-dispatch', bearer()),
      { getUser: () => Promise.resolve(user()), policyRpc: rpc },
    );
    expect((res as Response).status).toBe(403);
    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].fn).toBe('resolve_network_policy');
    expect(rpc.calls[0].args.p_endpoint).toBe('multiplix-dispatch');
  });

  it('retorna 503 quando a política não decide (RPC devolve erro)', async () => {
    const rpc = fakeRpc({ data: null, error: { message: 'connection reset' } });
    const res = await requireAuth(
      req('https://edge.example.com/functions/v1/multiplix-dispatch', bearer()),
      { getUser: () => Promise.resolve(user()), policyRpc: rpc },
    );
    expect((res as Response).status).toBe(503);
  });

  it('retorna 503 quando a CRIAÇÃO do client de política rejeita — nunca rejeita a Promise', async () => {
    // getServiceClient() real rejeita quando o import esm.sh falha ou a env falta;
    // requireAuth precisa converter isso em 503, não em Promise rejeitada.
    const res = await requireAuth(
      req('https://edge.example.com/functions/v1/multiplix-dispatch', bearer()),
      {
        getUser: () => Promise.resolve(user()),
        policyRpcFactory: () => Promise.reject(new Error('SUPABASE_URL is not configured')),
      },
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(503);
  });

  it('retorna 503 quando a criação do client de política lança exceção síncrona', async () => {
    const res = await requireAuth(
      req('https://edge.example.com/functions/v1/multiplix-dispatch', bearer()),
      {
        getUser: () => Promise.resolve(user()),
        policyRpcFactory: () => {
          throw new Error('import dinâmico falhou');
        },
      },
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(503);
  });

  it('retorna 503 quando a CHAMADA da RPC rejeita (exceção, não só error resolvido)', async () => {
    const rpc = {
      rpc: () => Promise.reject(new Error('socket hangup')),
    };
    const res = await requireAuth(
      req('https://edge.example.com/functions/v1/multiplix-dispatch', bearer()),
      { getUser: () => Promise.resolve(user()), policyRpc: rpc },
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(503);
  });

  it('não consulta a política quando o token é inválido (401 curto-circuita)', async () => {
    const rpc = fakeRpc({ data: [{ allowed: true }], error: null });
    const res = await requireAuth(
      req('https://edge.example.com/functions/v1/multiplix-dispatch', bearer()),
      { getUser: () => Promise.resolve({ data: null, error: { message: 'invalid token' } }), policyRpc: rpc },
    );
    expect((res as Response).status).toBe(401);
    expect(rpc.calls).toHaveLength(0);
  });

  it('preserva o caminho permitido — devolve { userId } e encaminha IP/país', async () => {
    const rpc = fakeRpc({
      data: [{ allowed: true, reason: null, rate_limit_max_requests: 25, rate_limit_window_seconds: 120 }],
      error: null,
    });
    const res = await requireAuth(
      req('https://edge.example.com/functions/v1/multiplix-dispatch', {
        ...bearer(),
        'cf-ipcountry': 'br',
        'x-forwarded-for': '1.2.3.4, 9.9.9.9',
      }),
      { getUser: () => Promise.resolve(user('user-1')), policyRpc: rpc },
    );
    expect(res).toEqual({ userId: 'user-1' });
    expect(rpc.calls[0].args.p_ip).toBe('9.9.9.9');
    expect(rpc.calls[0].args.p_country_code).toBe('BR');
  });

  // Aceite: "rate limits existentes continuam funcionando e passam a receber a
  // regra efetiva resolvida no banco pelo cartão 27.1". O ponto central encaminha
  // os ORÇAMENTOS ATUAIS como default da RPC canônica, então a regra ativa no
  // banco (27.1) é quem decide o efetivo — e nada é consultado duas vezes por
  // requisição. Os `enforceRateLimit` dos handlers seguem intactos (o cartão
  // proíbe editar handler), provado pelos testes de 429/consume_rate_limit das
  // próprias Edges dentro da mesma suíte deno.
  it('encaminha os limites ATUAIS como default da RPC (a regra efetiva do banco prevalece)', async () => {
    const rpc = fakeRpc({
      data: [{ allowed: true, reason: null, rate_limit_max_requests: 25, rate_limit_window_seconds: 120 }],
      error: null,
    });
    await requireAuth(
      req('https://edge.example.com/functions/v1/multiplix-dispatch', bearer()),
      { getUser: () => Promise.resolve(user()), policyRpc: rpc },
    );
    expect(rpc.calls).toHaveLength(1); // UMA consulta por requisição (sem duplicar por handler)
    expect(rpc.calls[0].fn).toBe('resolve_network_policy');
    expect(rpc.calls[0].args.p_default_max_requests).toBe(30);
    expect(rpc.calls[0].args.p_default_window_seconds).toBe(60);
  });

  it('permite sobrepor os orçamentos atuais (rate limit existente segue configurável por chamador)', async () => {
    const rpc = fakeRpc({ data: [{ allowed: true, reason: null }], error: null });
    await requireAuth(
      req('https://edge.example.com/functions/v1/auth-login', bearer()),
      { getUser: () => Promise.resolve(user()), policyRpc: rpc, defaultMaxRequests: 10, defaultWindowSeconds: 60 },
    );
    expect(rpc.calls[0].args.p_default_max_requests).toBe(10);
    expect(rpc.calls[0].args.p_default_window_seconds).toBe(60);
  });
});

describe('requireAuth — prova estrutural (consumidores herdam a trava sem edição)', () => {
  it('a política é consultada dentro de requireAuth, depois da autenticação', () => {
    const source = read('supabase/functions/_shared/validation.ts');
    const auth = source.indexOf('client.auth.getUser()');
    const policy = source.indexOf('resolveNetworkPolicy(req, endpoint');
    const denial = source.indexOf('networkPolicyDenialResponse(decision, req)');

    expect(auth, 'requireAuth valida o token').toBeGreaterThan(-1);
    expect(policy, 'requireAuth consulta a política de rede').toBeGreaterThan(-1);
    expect(denial, 'requireAuth devolve a negação HTTP da política').toBeGreaterThan(-1);
    // ordem: autentica (401) ANTES de consultar a política (403/503)
    expect(auth).toBeLessThan(policy);
    expect(policy).toBeLessThan(denial);
  });
});
