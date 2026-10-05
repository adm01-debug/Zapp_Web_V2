// evolution-instance-token.ts — resolvedor único do token de instância
// (TRA-002 / E16 do plano multi-conexão).
//
// Regra de isolamento: a Evolution GO seleciona a instância pela CREDENCIAL
// (apikey), não pelo path — a rota traduzida vira /send/text e quem atende é a
// instância do token. Então toda chamada precisa do token DAQUELA instância,
// resolvido no Vault via get_instance_token (escrita em create-connection).
//
// Fallback de transição ESTRITAMENTE vinculado à instância padrão: só quando
// instanceName === EVOLUTION_INSTANCE_NAME pode-se usar EVOLUTION_INSTANCE_TOKEN
// (o token legado da padrão, ainda sem linha no Vault). Qualquer outra
// instância sem token cadastrado devolve null — nunca a credencial de outra
// instância nem a key global admin (que produziria 401 confuso ou operaria na
// instância errada).

import { timingSafeEqual } from "./hmac-validation.ts";

// Mesmo desenho do cache de conexão em evolution-helpers.ts: Map por isolate,
// sobrevive entre invocações quentes da edge.
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
// Negativo tem TTL curto: um token recém-gravado por create-connection não pode
// ficar invisível por 5 min porque alguém consultou a instância antes dela
// existir.
const TOKEN_MISS_TTL_MS = 30 * 1000;

/**
 * Mínimo que o resolvedor precisa do client (service_role — get_instance_token
 * tem EXECUTE só para postgres/service_role). EvolutionDbClient e o
 * SupabaseClient real ambos satisfazem.
 */
export interface InstanceTokenClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

const tokenCache = new Map<string, { token: string | null; expiresAt: number }>();

// Teto do cache. O gate do webhook é pré-autenticação e o instanceName vem do
// corpo da requisição: sem teto, um chamador não autenticado infla o Map com
// um nome novo por request (entradas expiradas nunca eram varridas, só
// sobrescritas). Acima do teto, gravações varrem expiradas e depois removem a
// menos recentemente usada (Map preserva ordem de inserção; hit re-insere).
export const TOKEN_CACHE_MAX_ENTRIES = 256;

type TokenCacheEntry = { token: string | null; expiresAt: number };

function tokenCacheGet(instanceName: string, now: number): TokenCacheEntry | undefined {
  const hit = tokenCache.get(instanceName);
  if (!hit) return undefined;
  if (hit.expiresAt <= now) {
    tokenCache.delete(instanceName);
    return undefined;
  }
  // Re-insere para marcar como uso recente (LRU de verdade na remoção).
  tokenCache.delete(instanceName);
  tokenCache.set(instanceName, hit);
  return hit;
}

function tokenCacheSet(instanceName: string, entry: TokenCacheEntry): void {
  if (tokenCache.size >= TOKEN_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, value] of tokenCache) {
      if (tokenCache.size < TOKEN_CACHE_MAX_ENTRIES) break;
      if (value.expiresAt <= now) tokenCache.delete(key);
    }
    while (tokenCache.size >= TOKEN_CACHE_MAX_ENTRIES) {
      const oldest = tokenCache.keys().next().value;
      if (oldest === undefined) break;
      tokenCache.delete(oldest);
    }
  }
  tokenCache.set(instanceName, entry);
}

/** Zera o cache — testes e troca de token em ambiente quente (rotação). */
export function resetInstanceTokenCache(instanceName?: string): void {
  if (instanceName === undefined) tokenCache.clear();
  else tokenCache.delete(instanceName);
}

/** Entradas vivas no cache — usado pelo teste Deno do teto. */
export function instanceTokenCacheSize(): number {
  return tokenCache.size;
}

// Formato real de instance_id: generateInstanceName (front) produz
// [a-z0-9_] de até ~37 chars; a instância padrão pode ser 'PRINCIPAL'
// (fallback do env) e há ids com hífen em circulação (ex.: 'e2e-local').
// Fora desse envelope — vazio, caracteres estranhos ou nome longo demais —
// é input de abuso no gate pré-autenticação: rejeita sem RPC nem cache.
const INSTANCE_NAME_MAX_LEN = 64;
const INSTANCE_NAME_RE = new RegExp(`^[A-Za-z0-9_-]{1,${INSTANCE_NAME_MAX_LEN}}$`);

/** Formato esperado de instance_id (regex + tamanho máximo). */
export function isInstanceNameValid(instanceName: string): boolean {
  return INSTANCE_NAME_RE.test(instanceName);
}

/** Nome da instância embutido num path v2 (`/message/sendText/<inst>` etc.). */
export function instanceNameFromV2Path(v2Path: string): string {
  return v2Path.split("?")[0].split("/").filter(Boolean).pop() ?? "";
}

export interface ResolveInstanceTokenOptions {
  /**
   * Caminho pré-autenticação (webhook): `false` para NÃO gravar miss no
   * cache — um nome desconhecido vindo de input não autenticado não pode
   * virar entrada negativa (poluiria o teto e deslocaria tokens quentes).
   * Default true preserva o comportamento dos caminhos autenticados.
   */
  cacheMiss?: boolean;
}

/**
 * Token da instância nomeada, ou null quando não há credencial segura para ela.
 * O fallback de transição (EVOLUTION_INSTANCE_TOKEN) só vale para a instância
 * padrão (EVOLUTION_INSTANCE_NAME); para as demais, null = falha explícita no
 * chamador — nunca emprestar a credencial da padrão.
 */
export async function resolveInstanceToken(
  client: InstanceTokenClient,
  instanceName: string,
  options: ResolveInstanceTokenOptions = {},
): Promise<string | null> {
  if (!instanceName) return null;
  const now = Date.now();
  const cached = tokenCacheGet(instanceName, now);
  if (cached) return cached.token;

  let token: string | null = null;
  try {
    const { data, error } = await client.rpc("get_instance_token", { p_instance_id: instanceName });
    if (!error && typeof data === "string" && data.length > 0) token = data;
    else if (error) {
      console.error(`[instance-token] get_instance_token falhou para ${instanceName}: ${error.message ?? "erro"}`);
    }
  } catch (err) {
    console.error(`[instance-token] get_instance_token lançou para ${instanceName}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!token && instanceName === Deno.env.get("EVOLUTION_INSTANCE_NAME")) {
    const envToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
    if (envToken) {
      console.error(`[instance-token] ${instanceName}: sem token no Vault — fallback de transição EVOLUTION_INSTANCE_TOKEN (remover em E21).`);
      token = envToken;
    }
  }

  if (token || options.cacheMiss !== false) {
    tokenCacheSet(instanceName, {
      token,
      expiresAt: now + (token ? TOKEN_CACHE_TTL_MS : TOKEN_MISS_TTL_MS),
    });
  }
  return token;
}

/**
 * Gate do evolution-webhook: o `instanceToken` do corpo é comparado (tempo
 * constante) com o token DA instância nomeada no evento — nunca com um único
 * global. Assim A e B são aceitas com seus próprios tokens e um token trocado
 * entre instâncias é rejeitado. `resolveToken` é normalmente
 * `resolveInstanceToken` sobre o client service_role.
 */
export async function goTokenMatches(
  body: Record<string, unknown>,
  resolveToken: (instanceName: string) => Promise<string | null>,
): Promise<boolean> {
  const tok = body.instanceToken;
  if (typeof tok !== "string" || !tok) return false;
  // GO manda `instanceName`; payload em shape v2 pode mandar `instance`.
  const name = typeof body.instanceName === "string" && body.instanceName
    ? body.instanceName
    : typeof body.instance === "string" ? body.instance : "";
  // Gate pré-autenticação: nome fora do formato de instance_id é rejeitado
  // aqui — sem resolver (zero RPC, zero entrada no tokenCache).
  if (!isInstanceNameValid(name)) return false;
  const expected = await resolveToken(name);
  return expected !== null && timingSafeEqual(tok, expected);
}
