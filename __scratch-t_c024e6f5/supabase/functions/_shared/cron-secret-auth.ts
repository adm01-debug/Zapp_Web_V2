/**
 * docs/ia/IA-004, lacuna L5 — credencial de máquina do cron (compartilhado).
 *
 * Defeito que este guard fecha: os jobs do pg_cron autenticavam nas edge functions
 * mandando a ANON KEY do projeto no `Authorization`. A anon key é credencial PÚBLICA
 * (vai no bundle do front, para qualquer visitante) e o `verify_jwt` do gateway a
 * aceitava como "um JWT válido" — ou seja, o cron não tinha credencial de máquina
 * nenhuma e qualquer anônimo passava da porta.
 *
 * Regra agora: `x-cron-secret` (segredo DEDICADO do job no Vault, lido por RPC
 * SECURITY DEFINER) conferido em tempo constante, OU Bearer de usuário autenticado —
 * as duas edges também têm consumidor legítimo no front (painel de diagnóstico,
 * avatar da inbox), então não pode ser cron-only.
 *
 * Fail-closed: se a leitura do Vault falhar, o header não autoriza nada.
 *
 * Vive em `_shared` porque as duas edges usam exatamente o mesmo guard; manter duas
 * cópias fazia o gate do Sonar reprovar a PR por duplicação.
 */

/**
 * O que o guard precisa do client: só `getUser`. Tipo estrutural de propósito — as
 * duas edges fixam versões diferentes de `@supabase/supabase-js` e um tipo importado
 * de uma delas acoplaria a outra.
 */
export interface UserLookupClient {
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

/** Comparação em tempo constante (não vaza o prefixo comum pelo tempo de resposta). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export interface CronOrUserAuthOptions {
  /** chave de serviço já resolvida (env ou injeção do teste) */
  serviceKey: string;
  /**
   * Lê o segredo DEDICADO do job no Vault. A chamada da RPC fica no CHAMADOR, com o
   * nome literal visível — de propósito: o guard de catálogo
   * (`scripts/db-audit/supabase-usage-guard.mjs`) varre `supabase/functions` procurando
   * chamadas de RPC por nome literal e valida cada alvo contra o schema; esconder o nome
   * atrás deste módulo tiraria essa verificação. Devolve `null` quando a leitura falha
   * (fail-closed).
   */
  readVaultSecret: () => Promise<string | null>;
}

/**
 * `true` quando a requisição vem do cron (x-cron-secret do job) ou de um usuário
 * autenticado. `false` = o chamador deve responder 401.
 */
export async function isAuthorizedCronOrUser(
  req: Request,
  client: UserLookupClient,
  opts: CronOrUserAuthOptions,
): Promise<boolean> {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret) {
    const vaultSecret = await opts.readVaultSecret();
    if (vaultSecret !== null && timingSafeStringEqual(cronSecret, vaultSecret)) return true;
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  if (opts.serviceKey !== '' && timingSafeStringEqual(token, opts.serviceKey)) return true;

  const { data: { user }, error } = await client.auth.getUser(token);
  return !error && user !== null;
}

/** Resposta única de não-autorizado das duas edges (mesmo corpo, mesma forma). */
export function unauthorizedResponse(headers: HeadersInit): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
}
