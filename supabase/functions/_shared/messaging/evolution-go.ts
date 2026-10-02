// evolution-go.ts — adaptador único de envio pelo Evolution GO (F41).
//
// Ponto único de envio outbound para as edges `talkx-send` e `multiplix-send`
// (F43 troca as chamadas). Responsabilidades:
//   1. declarar as capacidades do canal (`capabilities()`);
//   2. aplicar a presença humanizada antes do POST (`composing` para texto/
//      mídia, `recording` para nota de voz/PTT);
//   3. montar o payload v2 e traduzi-lo com `evolution-go-routes.ts` — o MESMO
//      roteador v2→GO já usado por `evolution-send.ts`/`evolution-api-proxy.ts`;
//   4. ler status + corpo da resposta e extrair o `external_id`.
//
// A rede é injetável (`SendDeps.fetch`): o unit test exercita o payload real
// sem tocar a internet.

import { type GoRoute, translateV2ToGo } from "../evolution-go-routes.ts";
import { extractMessageId } from "../evolution-send.ts";
import { isRecord } from "../evolution-helpers.ts";

/** Tipos de mensagem que o adaptador sabe enviar (F41). */
export type MessageKind = "text" | "image" | "document" | "audio" | "ptt" | "video";

/** Capacidades declaradas do canal Evolution GO (F41). */
export interface Capabilities {
  text: boolean;
  image: boolean;
  document: boolean;
  audio: boolean;
  /** Nota de voz (PTT/`sendWhatsAppAudio`). */
  ptt: boolean;
  /** Limite de caracteres por mensagem de texto do WhatsApp. */
  maxTextChars: number;
}

/**
 * Limite de texto do WhatsApp. O GO aceita o texto e entrega; o teto é do
 * WhatsApp (corpo da mensagem), não do transporte — enviar acima disso faz o
 * provedor recusar/truncar, então o adaptador barra antes do POST.
 */
export const MAX_TEXT_CHARS = 65_536;

/** O que o adaptador Evolution GO entrega hoje. */
export function capabilities(): Capabilities {
  return {
    text: true,
    image: true,
    document: true,
    audio: true,
    ptt: true,
    maxTextChars: MAX_TEXT_CHARS,
  };
}

/** Presença humanizada por tipo: nota de voz mostra "gravando"; o resto "digitando". */
export type Presence = "composing" | "recording";

export function presenceForKind(kind: MessageKind): Presence {
  return kind === "ptt" ? "recording" : "composing";
}

/**
 * Endpoint v2 do Evolution por tipo de mídia: áudio usa a rota de nota de voz
 * (`sendWhatsAppAudio`); todo o resto usa `sendMedia`. Movido VERBATIM de
 * `talkx-send/index.ts` (F43) — as duas edges passam a compartilhar a MESMA
 * escolha de rota em vez de cada uma manter a sua cópia.
 */
export function getMediaEndpoint(mediaType: string): string {
  switch (mediaType) {
    case "audio": return "sendWhatsAppAudio";
    default: return "sendMedia";
  }
}

export type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

/** Item de envio — o "kernel" neutro que as duas edges preenchem. */
export interface SendItem {
  kind: MessageKind;
  /** Destino em E.164 (sem máscara) ou JID completo. */
  to: string;
  /** Instância Evolution (nome ou UUID, conforme a conexão). */
  instanceId: string;
  /** Texto (kind=text) ou legenda da mídia. */
  text?: string;
  /** URL acessível da mídia (assinada quando bucket privado). */
  mediaUrl?: string;
  /** Nome do arquivo — obrigatório para documento. */
  fileName?: string;
  /** Delay nativo opcional (ms). O humanizado é feito pelo chamador. */
  delayMs?: number;
}

export interface SendDeps {
  fetch: Fetcher;
  evolutionUrl: string;
  evolutionKey: string;
  /** Token da instância (rotas auth=instance). Sem ele, usa a key informada. */
  instanceToken?: string;
  signal?: AbortSignal;
}

export interface SendResult {
  ok: boolean;
  status: number;
  presence: Presence;
  /** Caminho v2 pedido (ex.: /message/sendText/inst). */
  v2Path: string;
  /** Caminho GO efetivamente chamado (ex.: /send/text). */
  goPath: string;
  messageId?: string;
  error?: string;
  /** Corpo parseado do provedor (vazio quando não foi JSON). */
  body: unknown;
}

/** Erro de validação do item (payload inválido, não falha de provedor). */
export class MessagingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MessagingError";
    this.code = code;
  }
}

function delayFields(delayMs?: number): Record<string, number> {
  return typeof delayMs === "number" && delayMs > 0 ? { delay: delayMs } : {};
}

function sendMediaBody(
  item: SendItem,
  type: "image" | "document" | "audio" | "video",
): Record<string, unknown> {
  if (!item.mediaUrl) throw new MessagingError("missing_media_url", "mídia sem URL");
  if (type === "document" && !item.fileName) {
    throw new MessagingError("missing_file_name", "documento exige fileName");
  }
  return {
    number: item.to,
    mediatype: type,
    media: item.mediaUrl,
    ...(item.text ? { caption: item.text } : {}),
    ...(item.fileName ? { fileName: item.fileName } : {}),
    ...delayFields(item.delayMs),
  };
}

/** Monta o path/body v2 (o mesmo shape que as edges já usavam). */
function planMessage(item: SendItem): { v2Path: string; v2Body: Record<string, unknown> } {
  const instance = item.instanceId;
  switch (item.kind) {
    case "text": {
      const text = item.text ?? "";
      if (!text.trim()) throw new MessagingError("missing_text", "texto vazio");
      if (text.length > MAX_TEXT_CHARS) {
        throw new MessagingError(
          "max_chars_exceeded",
          `texto com ${text.length} caracteres excede o limite de ${MAX_TEXT_CHARS}`,
        );
      }
      return {
        v2Path: `/message/sendText/${instance}`,
        v2Body: { number: item.to, text, ...delayFields(item.delayMs) },
      };
    }
    case "image":
      return { v2Path: `/message/sendMedia/${instance}`, v2Body: sendMediaBody(item, "image") };
    case "document":
      return { v2Path: `/message/sendMedia/${instance}`, v2Body: sendMediaBody(item, "document") };
    case "audio":
      return { v2Path: `/message/sendMedia/${instance}`, v2Body: sendMediaBody(item, "audio") };
    // video nao estava no kernel; entrou aqui porque media_type e text sem CHECK e hoje o
    // worker manda mediatype:"video" por POST cru. Sem esta rota, plugar o adaptador
    // silenciosamente rebaixaria video para documento.
    case "video":
      return { v2Path: `/message/sendMedia/${instance}`, v2Body: sendMediaBody(item, "video") };
    case "ptt": {
      if (!item.mediaUrl) throw new MessagingError("missing_media_url", "PTT sem URL");
      return {
        v2Path: `/message/sendWhatsAppAudio/${instance}`,
        v2Body: { number: item.to, audio: item.mediaUrl, ...delayFields(item.delayMs) },
      };
    }
  }
}

function authHeaders(go: { contentType?: string }, deps: SendDeps): Record<string, string> {
  return {
    "Content-Type": go.contentType ?? "application/json",
    apikey: deps.instanceToken ?? deps.evolutionKey,
  };
}

/** Presença best-effort: nunca derruba o envio (mesmo contrato das edges atuais). */
async function postPresence(item: SendItem, presence: Presence, deps: SendDeps): Promise<void> {
  try {
    const go = translateV2ToGo(`/chat/updatePresence/${item.instanceId}`, "POST", {
      number: item.to,
      presence,
    });
    if (!go || go.invalid) return;
    await deps.fetch(`${deps.evolutionUrl}${go.path}`, {
      method: go.method,
      headers: authHeaders(go, deps),
      ...(go.method !== "GET" && go.body ? { body: JSON.stringify(go.body) } : {}),
    });
  } catch {
    /* presença é best-effort: segue para a mensagem */
  }
}

/**
 * Envia um item pelo Evolution GO. Aplica presença, traduz a rota com
 * `evolution-go-routes.ts` e devolve o resultado cru (status/corpo/messageId)
 * para o chamador classificar com `errors.ts` (F42).
 */
export async function send(item: SendItem, deps: SendDeps): Promise<SendResult> {
  const presence = presenceForKind(item.kind);
  // Valida/monta ANTES de qualquer efeito de rede: item inválido não gera POST
  // (nem a presença "digitando", que soaria falso para um envio que não sai).
  const plan = planMessage(item);
  // A flavor decide a rota, igual a todos os outros sitios do projeto
  // (evolution-send, evolution-api-proxy, effect-reconcile, evolution-sync-actions).
  // Sem isto, um ambiente em v2 teria a rota traduzida para GO sem ninguem pedir —
  // e o envio mudaria de endpoint so porque passou pelo adaptador.
  const go: GoRoute | null = (Deno.env.get("EVOLUTION_API_FLAVOR") ?? "go") !== "v2"
    ? translateV2ToGo(plan.v2Path, "POST", plan.v2Body)
    : { path: plan.v2Path, method: "POST", body: plan.v2Body, auth: "instance" };
  if (go?.invalid) throw new MessagingError("invalid_payload", go.invalid);
  if (!go) throw new MessagingError("unmapped_route", `rota GO não mapeada: ${plan.v2Path}`);

  await postPresence(item, presence, deps);

  const response = await deps.fetch(`${deps.evolutionUrl}${go.path}`, {
    method: go.method,
    headers: authHeaders(go, deps),
    ...(go.method !== "GET" && go.body ? { body: JSON.stringify(go.body) } : {}),
    ...(deps.signal ? { signal: deps.signal } : {}),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const messageId = extractMessageId(body);
  const providerError = isRecord(body) ? body.error : undefined;
  const hasMessageId = typeof messageId === "string" && messageId.length > 0 && messageId.length <= 512;
  const ok = response.ok && !providerError && hasMessageId;

  let error: string | undefined;
  if (!ok) {
    if (!response.ok) error = `HTTP ${response.status}`;
    else if (providerError) error = String(providerError);
    else error = "missing_provider_message_id";
  }

  return {
    ok,
    status: response.status,
    presence,
    v2Path: plan.v2Path,
    goPath: go.path,
    ...(hasMessageId ? { messageId } : {}),
    ...(error ? { error } : {}),
    body,
  };
}
