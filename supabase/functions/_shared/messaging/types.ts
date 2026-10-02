/**
 * F36 (Bloco D) — contratos do kernel de mensageria compartilhado.
 *
 * Este arquivo e a face publica de TIPOS do kernel: quem escreve uma edge nova importa
 * daqui (ou de `./index.ts`) e nao precisa conhecer os modulos internos. A ideia do bloco
 * e que `talkx-send` e `multiplix-send` parem de ser dois codigos: personalizacao, E.164,
 * elegibilidade, midia, adaptador de provedor e classificacao de erro passam a morar aqui.
 *
 * Cada modulo dono do seu contrato:
 *   - personalize.ts  -> personalizacao de template (TalkX e Multiplix)
 *   - phone.ts        -> E.164 brasileiro (fachada do evolution-helpers, sem reescrever)
 *   - eligibility.ts  -> classe + razao de elegibilidade (as 7 do enum do Bloco C)
 *   - media.ts        -> preparacao de midia (magic bytes, tamanho, HEAD, signed URL)
 *   - evolution-go.ts -> adaptador do provedor (capabilities, presenca, send)
 *   - errors.ts       -> classificacao de erro + backoff com teto + texto para operador
 */

/**
 * Identificador de correlacao de UMA requisicao (F43).
 *
 * Gerado na entrada da edge e propagado para log estruturado e webhook, para que uma
 * linha de log, uma tentativa de envio e um evento de webhook possam ser amarrados sem
 * precisar de dado de cliente. Formato livre (string), opaco para quem consome.
 */
export type CorrelationId = string;

export type {
  EligibilityClass,
  EligibilityContext,
  EligibilityDecision,
  EligibilityReason,
  EligibilityRecipient,
} from "./eligibility.ts";

export type { BackoffDecision, ProviderErrorClass, ProviderErrorInfo } from "./errors.ts";

export type {
  Capabilities,
  Fetcher,
  MessageKind,
  Presence,
  SendDeps,
  SendItem,
  SendResult,
} from "./evolution-go.ts";

export type {
  MediaFetcher,
  MediaKind,
  PrepareMediaFailure,
  PrepareMediaFailureReason,
  PrepareMediaOptions,
  PrepareMediaSuccess,
  SignedUrlRequest,
  SignedUrlResolver,
} from "./media.ts";

export type {
  MultiplixCompanyContact,
  PersonalizeContact,
  PersonalizeCustomValues,
} from "./personalize.ts";

export type { E164Phone, NormalizedPhone } from "./phone.ts";
