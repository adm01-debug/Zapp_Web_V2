// evolution-instance-token.ts — resolvedor único do token de instância
// (TRA-002 / item #18). A Evolution GO seleciona a instância pela CREDENCIAL
// (apikey), não pelo path: a rota v2 `/message/sendText/{instancia}` vira
// `/send/text` e quem atende é a instância dona do token. Usar a credencial da
// instância PADRÃO (ou a key global) numa rota de OUTRA conexão executa na
// instância errada — o defeito #18. O token é resolvido SEMPRE pelo nome da
// conexão (Vault via get_instance_token, gravado em create-connection).
// Fallback de transição ESTRITAMENTE vinculado à instância padrão: só quando
// instanceName === EVOLUTION_INSTANCE_NAME usa-se EVOLUTION_INSTANCE_TOKEN.
// Qualquer outra instância sem token devolve null — nunca o de outra conexão.

/** Mínimo que o resolvedor precisa do client (service_role). */
export interface InstanceTokenClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

// Mesmo desenho do cache de conexão em evolution-helpers.ts: Map por isolate,
// sobrevive entre invocações quentes da edge.
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
// Miss tem TTL curto: um token recém-gravado por create-connection não pode
// ficar invisível por 5 min porque alguém consultou a instância antes dela
// existir.
const TOKEN_MISS_TTL_MS = 30 * 1000;

interface TokenCacheEntry {
  token: string | null;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

/** Zera o cache — testes e rotação de token em ambiente quente. */
export function resetInstanceTokenCache(instanceName?: string): void {
  if (instanceName === undefined) tokenCache.clear();
  else tokenCache.delete(instanceName);
}

/** Nome da instância embutido num path v2 (`/message/sendText/<inst>` etc.).
 *  Query string é descartada e barra final não cria segmento. */
export function instanceNameFromV2Path(v2Path: string): string {
  return (v2Path.split("?")[0] ?? "").split("/").filter(Boolean).pop() ?? "";
}

/**
 * Token da instância nomeada, ou null quando não há credencial segura para ela.
 * O fallback de transição (EVOLUTION_INSTANCE_TOKEN) só vale para a instância
 * padrão (EVOLUTION_INSTANCE_NAME); para as demais, null = falha explícita no
 * chamador — nunca emprestar a credencial da padrão nem a key global.
 */
export async function resolveInstanceToken(
  client: InstanceTokenClient,
  instanceName: string,
): Promise<string | null> {
  if (!instanceName) return null;
  const now = Date.now();
  const hit = tokenCache.get(instanceName);
  if (hit && hit.expiresAt > now) return hit.token;
  if (hit) tokenCache.delete(instanceName);

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

  tokenCache.set(instanceName, {
    token,
    expiresAt: now + (token ? TOKEN_CACHE_TTL_MS : TOKEN_MISS_TTL_MS),
  });
  return token;
}
