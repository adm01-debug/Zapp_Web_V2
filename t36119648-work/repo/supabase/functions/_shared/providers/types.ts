// Bloco 5 / etapa 046 — contrato de provedor de WhatsApp.
//
// Hoje o envio outbound tem UM transporte (Evolution) espalhado por varios
// arquivos de `_shared` e por duas edges de envio. Este arquivo e a face publica
// do contrato que um provedor precisa cumprir para ser TROCAVEL por outro —
// `registry.ts` e quem decide qual atende cada envio. O desenho vem do V3
// (`_shared/providers/registry.ts`, ids evolution | cloud | fake).
//
// Regra do desenho: o contrato e NEUTRO de transporte. Nao existe `evolutionUrl`,
// `evolutionKey` nem caminho v2 na assinatura — quem conhece o transporte e o
// adaptador (`providers/evolution`), nunca quem chama. E o que permite o provedor
// falso (`providers/fake`) ser um SUBSTITUTO e nao um caso especial.

import type { Capabilities, Fetcher, SendItem } from "../messaging/evolution-go.ts";

/**
 * Ids de provedor que o registry conhece (espelha o V3).
 * `cloud` (WhatsApp Cloud API / Meta) esta RESERVADO: pedir por ele hoje NEGA,
 * nunca cai no Evolution em silencio (etapa 048).
 */
export type WhatsAppProviderId = "evolution" | "cloud" | "fake";

/**
 * Credenciais do transporte, resolvidas POR CONEXAO pelo chamador
 * (048: `whatsapp_connections.provider`). Deliberadamente genericas: o que e
 * "url base" para o Evolution e "graph version" para o Cloud — quem interpreta
 * e o adaptador.
 */
export interface ProviderCredentials {
  /** URL base do transporte. Ausente/vazia = conexao mal configurada: o envio NEGA. */
  baseUrl?: string;
  /** Credencial da rota administrativa do transporte. */
  apiKey?: string;
  /** Credencial da instancia (rotas que autenticam por instancia). */
  instanceToken?: string;
  /** "go" | "v2" — flavor do transporte Evolution. Ausente = default do projeto. */
  flavor?: "go" | "v2";
}

/**
 * O que o chamador entrega ao provedor.
 * A rede e INJETAVEL (`fetch`): o teste exercita o envio real sem tocar a internet.
 */
export interface ProviderSendDeps {
  fetch: Fetcher;
  credentials: ProviderCredentials;
  signal?: AbortSignal;
  /** Teto da presenca humanizada (ms), best-effort. Ausente = default do adaptador. */
  presenceTimeoutMs?: number;
}

/**
 * Resultado de envio NEUTRO — sem caminho/rota do transporte (o `SendResult` do
 * kernel carrega `v2Path`/`goPath`, que sao do Evolution). `body` vai cru para
 * quem chama classificar (a politica de retry e de `messaging/errors.ts`).
 */
export interface ProviderSendResult {
  ok: boolean;
  /** Status HTTP do transporte; 0 quando nem chegou a sair. */
  status: number;
  /** Id da mensagem no provedor (a chave da idempotencia do chamador). */
  messageId?: string;
  error?: string;
  body: unknown;
}

/** Um provedor de WhatsApp: capacidades do canal + a operacao de envio. */
export interface WhatsAppProvider {
  readonly id: WhatsAppProviderId;
  capabilities(): Capabilities;
  send(item: SendItem, deps: ProviderSendDeps): Promise<ProviderSendResult>;
}

/** Motivos de recusa do registry. TODOS negam — nenhum leva ao provedor padrao. */
export type ProviderResolutionCode =
  /** id que o registry nao conhece. */
  | "provider_unknown"
  /** id conhecido, mas sem implementacao nesta arvore (hoje: `cloud`). */
  | "provider_unavailable"
  /** `fake` fora de `DENO_ENV=test` — "enviar" de mentira em ambiente real e falha que libera. */
  | "provider_not_allowed_in_env"
  /** `PROVIDER_UNDER_TEST` presente fora de `DENO_ENV=test` (knob de teste ignorado = mensagem real). */
  | "test_override_requires_test_env";

/** Recusa de resolucao de provedor (fail-closed: nunca cai no padrao). */
export class ProviderResolutionError extends Error {
  readonly code: ProviderResolutionCode;
  constructor(code: ProviderResolutionCode, message: string) {
    super(message);
    this.name = "ProviderResolutionError";
    this.code = code;
  }
}
