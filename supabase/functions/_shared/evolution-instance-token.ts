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

/** Zera o cache — testes e troca de token em ambiente quente (rotação). */
export function resetInstanceTokenCache(instanceName?: string): void {
  if (instanceName === undefined) tokenCache.clear();
  else tokenCache.delete(instanceName);
}

/** Nome da instância embutido num path v2 (`/message/sendText/<inst>` etc.). */
export function instanceNameFromV2Path(v2Path: string): string {
  return v2Path.split("?")[0].split("/").filter(Boolean).pop() ?? "";
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
): Promise<string | null> {
  if (!instanceName) return null;
  const now = Date.now();
  const cached = tokenCache.get(instanceName);
  if (cached && cached.expiresAt > now) return cached.token;

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
  const expected = await resolveToken(name);
  return expected !== null && timingSafeEqual(tok, expected);
}
