// evolution-go-token-sync.ts — "o sistema busca a chave sozinho" (13/11).
//
// A Evolution GO seleciona a instância pela CREDENCIAL (apikey) nas rotas de
// sessão (/instance/connect, /instance/qr, /instance/status…). Quando o token
// guardado no app (Vault via get_instance_token, ou o fallback de transição
// EVOLUTION_INSTANCE_TOKEN da padrão) deixa de bater com o da GO — instância
// recriada, token trocado no painel —, toda rota de sessão responde
// 401 {"error":"not authorized"} e o QR nunca sai.
//
// A própria GO devolve o token de cada instância na listagem ADMIN:
//   GET /instance/all  (apikey = chave GLOBAL, middleware AuthAdmin)
//   → { "message": "success", "data": [ { id, name, token, … } ] }
// Evidência upstream (EvolutionAPI/evolution-go @ 80d7c72, 12/11/2026):
//   pkg/routes/routes.go:80-91 — grupo /instance com AuthAdmin (GET /all);
//   pkg/middleware/auth_middleware.go:39-52 — AuthAdmin compara com GlobalApiKey;
//   pkg/instance/model/instance_model.go:13 — `Token string json:"token"`;
//   pkg/instance/service/instance_service.go:547-561 — GetAll só zera Proxy
//   (o token segue no JSON).
//
// Este módulo é puro (fetch injetável) e NUNCA loga nem devolve o token em
// mensagem — ele só sai daqui no campo `token` do resultado, para o chamador
// gravar no Vault (set_instance_token).

/** Resultado de um fetch que nunca lança: falha de rede/tempo vira dado. */
export type SafeFetchResult =
  | { ok: true; response: Response }
  | { ok: false; kind: 'timeout' | 'network'; message: string };

/**
 * fetch com tempo limite que NUNCA lança. `AbortSignal.timeout` rejeita com
 * TimeoutError e erro de DNS/conexão rejeita com TypeError: sem esta camada,
 * os dois subiam até o catch-all do handler e viravam HTTP 500 genérico
 * ("Edge Function returned a non-2xx status code") — a causa do QR quebrado
 * em 13/11. O chamador decide a mensagem.
 */
export async function safeFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<SafeFetchResult> {
  try {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(Math.max(1, timeoutMs)) });
    return { ok: true, response };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: `sem resposta em ${Math.round(timeoutMs / 1000)}s` };
    }
    return { ok: false, kind: 'network', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Lê o corpo como JSON sem lançar (GO às vezes responde texto/HTML no erro). */
export async function readJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    const text = await response.text();
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { data: parsed };
  } catch {
    return {};
  }
}

/** Mensagem de erro do corpo da GO (`{"error":"..."}`) ou da v2 (`{"message":...}`). */
export function goErrorText(body: Record<string, unknown>): string {
  if (typeof body.message === 'string' && body.message) return body.message;
  if (typeof body.error === 'string' && body.error) return body.error;
  return '';
}

export type GoTokenLookupFailure =
  | 'global_key_rejected'
  | 'instance_not_found'
  | 'token_absent'
  | 'go_unreachable'
  | 'unexpected_response';

export type GoTokenLookup =
  | { ok: true; token: string }
  | { ok: false; code: GoTokenLookupFailure; status?: number; message: string };

/**
 * Busca na GO o token atual da instância `instanceName` pela listagem admin
 * (GET /instance/all com a chave GLOBAL). Casamento EXATO pelo nome — nunca
 * por prefixo, nunca "a primeira da lista": pegar o token de outra instância
 * faria o app operar a conexão errada (defeito #18).
 */
export async function lookupGoInstanceToken(
  baseUrl: string,
  globalKey: string,
  instanceName: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<GoTokenLookup> {
  const res = await safeFetch(`${baseUrl}/instance/all`, { method: 'GET', headers: { apikey: globalKey } }, timeoutMs, fetchImpl);
  if (!res.ok) {
    return {
      ok: false, code: 'go_unreachable', status: res.kind === 'timeout' ? 504 : 502,
      message: res.kind === 'timeout'
        ? 'O servidor WhatsApp (Evolution GO) não respondeu a tempo ao listar as instâncias.'
        : 'Não foi possível alcançar o servidor WhatsApp (Evolution GO) para buscar a credencial.',
    };
  }
  const { response } = res;
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => {});
    return {
      ok: false, code: 'global_key_rejected', status: response.status,
      message: `A chave global do servidor WhatsApp (EVOLUTION_API_KEY) foi recusada (${response.status}). Ela precisa ser corrigida nos segredos das Edge Functions antes de sincronizar a credencial.`,
    };
  }
  const body = await readJsonSafe(response);
  if (!response.ok) {
    const detail = goErrorText(body);
    return {
      ok: false, code: 'unexpected_response', status: response.status,
      message: `O servidor WhatsApp recusou a listagem de instâncias (HTTP ${response.status})${detail ? `: ${detail}` : ''}.`,
    };
  }
  const list = Array.isArray(body.data) ? body.data as unknown[] : null;
  if (!list) {
    return {
      ok: false, code: 'unexpected_response', status: 502,
      message: 'O servidor WhatsApp respondeu à listagem de instâncias num formato inesperado.',
    };
  }
  const record = list.find((r) => {
    if (!r || typeof r !== 'object') return false;
    const rec = r as Record<string, unknown>;
    return rec.name === instanceName || rec.Name === instanceName;
  }) as Record<string, unknown> | undefined;
  if (!record) {
    return {
      ok: false, code: 'instance_not_found', status: 404,
      message: `A instância '${instanceName}' não existe no servidor WhatsApp (Evolution GO). É preciso recriá-la — peça a um administrador; o sistema não recria sozinho.`,
    };
  }
  const token = typeof record.token === 'string' ? record.token : typeof record.Token === 'string' ? record.Token : '';
  if (!token) {
    return {
      ok: false, code: 'token_absent', status: 502,
      message: `O servidor WhatsApp listou a instância '${instanceName}' sem credencial.`,
    };
  }
  return { ok: true, token };
}

/** Códigos que a tela usa para oferecer "Sincronizar credencial". */
export const INSTANCE_TOKEN_ERROR_CODES = ['instance_token_invalid', 'instance_token_missing'] as const;

export function instanceTokenInvalidMessage(instance: string): string {
  return `Credencial da instância '${instance}' inválida no servidor WhatsApp (401). Use "Sincronizar credencial" para o sistema buscar a chave atual.`;
}

export function instanceTokenMissingMessage(instance: string): string {
  return `Credencial da instância '${instance}' não encontrada. Use "Sincronizar credencial" para o sistema buscar a chave no servidor WhatsApp.`;
}

export function goUnreachableMessage(kind: 'timeout' | 'network', step: string): string {
  return kind === 'timeout'
    ? `O servidor WhatsApp (Evolution GO) não respondeu a tempo (${step}). Tente novamente em instantes.`
    : `Não foi possível alcançar o servidor WhatsApp (Evolution GO) (${step}). Verifique se o serviço está no ar e tente novamente.`;
}
