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
 * autenticar antes de consultar política).
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
      canonicalEndpointFromUrl(req('https://x.supabase.co/functions/v1/multiplix-dispatch')),
    ).toBe('multiplix-dispatch');
  });

  it('descarta sub-path e devolve só o nome da função', () => {
    expect(canonicalEndpointFromUrl(req('https://x.supabase.co/functions/v1/ai-proxy/transcribe'))).toBe('ai-proxy');
  });

  it('usa o primeiro segmento quando não há a barra functions/v1', () => {
    expect(canonicalEndpointFromUrl(req('https://host.example/auth-login'))).toBe('auth-login');
  });

  it('devolve string vazia para URL sem segmento (a política falha fechada)', () => {
    expect(canonicalEndpointFromUrl(req('https://host.example'))).toBe('');
  });
});

describe('requireAuth — política de rede obrigatória (R2-AUTH-022 / 27.3)', () => {
  it('mantém 401 para token ausente (autenticação continua em primeiro)', async () => {
    const res = await requireAuth(req('https://x.supabase.co/functions/v1/foo'));
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it('mantém 401 para token inválido (getUser devolve erro)', async () => {
    const res = await requireAuth(req('https://x.supabase.co/functions/v1/foo', bearer()), {
      getUser: () => Promise.resolve({ data: null, error: { message: 'invalid token' } }),
    });
    expect((res as Response).status).toBe(401);
  });

  it('não aceita usuário quando a política nega — 403, e a RPC é consultada antes', async () => {
    const rpc = fakeRpc({ data: [{ allowed: false, reason: 'ip_blocked' }], error: null });
    const res = await requireAuth(
      req('https://x.supabase.co/functions/v1/multiplix-dispatch', bearer()),
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
      req('https://x.supabase.co/functions/v1/multiplix-dispatch', bearer()),
      { getUser: () => Promise.resolve(user()), policyRpc: rpc },
    );
    expect((res as Response).status).toBe(503);
  });

  it('retorna 503 quando a CRIAÇÃO do client de política rejeita — nunca rejeita a Promise', async () => {
    // getServiceClient() real rejeita quando import/esm.sh falha ou env falta;
    // requireAuth precisa converter isso em 503, não em Promise rejeitada.
    const res = await requireAuth(
      req('https://x.supabase.co/functions/v1/multiplix-dispatch', bearer()),
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
      req('https://x.supabase.co/functions/v1/multiplix-dispatch', bearer()),
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
      req('https://x.supabase.co/functions/v1/multiplix-dispatch', bearer()),
      { getUser: () => Promise.resolve(user()), policyRpc: rpc },
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(503);
  });

  it('preserva o caminho permitido — devolve { userId } e encaminha IP/país', async () => {
    const rpc = fakeRpc({
      data: [{ allowed: true, reason: null, rate_limit_max_requests: 25, rate_limit_window_seconds: 120 }],
      error: null,
    });
    const res = await requireAuth(
      req('https://x.supabase.co/functions/v1/multiplix-dispatch', {
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
