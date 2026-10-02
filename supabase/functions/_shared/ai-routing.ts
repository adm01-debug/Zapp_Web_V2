/**
 * Roteamento determinístico de provedores de IA (módulo puro).
 *
 * Por que este módulo existe:
 *  - o proxy antigo fazia `limit(1)` sem `ORDER BY`, então com dois padrões
 *    conflitantes o provedor escolhido era arbitrário;
 *  - a ausência de padrão não virava indisponibilidade explícita (caía em fallback);
 *  - o modelo podia ser sobrescrito pelo cliente ou por `config.model`.
 *
 * Restrições de projeto: SEM Deno.env, SEM fetch, SEM I/O — é importado por
 * testes vitest. Todas as funções são determinísticas e não mutam entradas.
 */

/** Finalidades de uso suportadas (espelha o enum aceito pelo ai-proxy). */
export type AiPurpose = 'copilot' | 'analysis' | 'summary' | 'tagging' | 'auto_reply';

/** Lista canônica — usada para validar a finalidade pedida. */
export const AI_PURPOSES: readonly AiPurpose[] = [
  'copilot',
  'analysis',
  'summary',
  'tagging',
  'auto_reply',
];

/** Linha de `ai_providers` (o que basta para rotear). */
export interface AiProviderRow {
  id: string;
  name: string;
  provider_type: string;
  api_endpoint: string | null;
  api_key_secret_name: string | null;
  model: string | null;
  system_prompt: string | null;
  config: Record<string, unknown> | null;
  is_active: boolean;
  is_default: boolean;
  use_for: string[] | null;
}

/** Resultado do roteamento, já com a decisão do servidor sobre o modelo. */
export interface RoutedProvider {
  provider: AiProviderRow;
  /** Modelo efetivo, já decidido pelo SERVIDOR (nunca escolhido pelo cliente). */
  model: string | null;
  /** O que o cliente pediu — guardado só para auditoria. */
  modelRequested: string | null;
  /** true quando o cliente pediu algo e o servidor decidiu outro modelo. */
  modelSubstituted: boolean;
}

export type AiRoutingErrorCode =
  | 'NO_PROVIDER'
  | 'AMBIGUOUS_PROVIDER'
  | 'PROVIDER_INACTIVE'
  | 'BAD_PURPOSE';

/**
 * Erro de roteamento com código estável: o ai-proxy converte `code` em status
 * HTTP (NO_PROVIDER/AMBIGUOUS_PROVIDER → 503, PROVIDER_INACTIVE → 409) em vez
 * de cair no fallback e mascarar a configuração quebrada.
 */
export class AiRoutingError extends Error {
  readonly code: AiRoutingErrorCode;

  constructor(code: AiRoutingErrorCode, message: string) {
    super(message);
    this.name = 'AiRoutingError';
    this.code = code;
  }
}

/** Modelos default por tipo de provedor (usados quando a linha não define `model`). */
const DEFAULT_MODEL_BY_TYPE: Record<string, string> = {
  lovable_ai: 'google/gemini-3-flash-preview',
  openai_compatible: 'gpt-4o',
  google_gemini: 'gpt-4o',
};

/** Tamanho mínimo de string útil (evita aceitar ''/'   ' como valor). */
function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Objeto simples (sem array/null) — base dos filtros. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Chaves que o cliente/config NUNCA pode definir no corpo enviado ao provedor.
 * Sem isso, `config.model`/`config.messages` sobrescrevem a decisão do servidor
 * e `tools`/`role` permitem ao cliente reescrever o diálogo. `system`/`prompt`/
 * `input` entram pelo aceite literal do IA-038: identidade, mensagens,
 * ferramentas, modelo e POLÍTICA ficam sob controle do servidor.
 */
export const RESERVED_BODY_KEYS: readonly string[] = [
  'model',
  'messages',
  'system',
  'prompt',
  'input',
  'instructions',
  'tools',
  'tool_choice',
  'stream',
  'role',
];

/**
 * Subconjunto de `config` que pode virar corpo da requisição: apenas
 * parâmetros de amostragem, nunca identidade, mensagens ou ferramentas.
 */
export const ALLOWED_CONFIG_BODY_KEYS: readonly string[] = [
  'temperature',
  'top_p',
  'top_k',
  'max_tokens',
  'max_completion_tokens',
  'presence_penalty',
  'frequency_penalty',
  'stop',
  'seed',
  'response_format',
  'reasoning_effort',
  'n',
];

/**
 * Cabeçalhos extras permitidos, comparados sem diferenciar maiúsculas.
 * `Authorization`, `Content-Type` e `Cookie` ficam de fora de propósito:
 * credenciais e framing são definidos pelo código, não por configuração.
 */
export const ALLOWED_HEADER_NAMES: readonly string[] = [
  'http-referer',
  'x-title',
  'x-provider-token',
  'x-api-version',
  'x-request-id',
];

/** Chaves perigosas em objetos montados a partir de entrada não confiável. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Escolhe o provedor para uma finalidade.
 *
 * Com `providerId` a linha precisa existir e estar ativa — pedido explícito do
 * painel não pode silenciosamente virar outro provedor.
 * Sem `providerId`: filtra ATIVO + usa a finalidade + é padrão. Zero → NO_PROVIDER;
 * 2 ou mais → AMBIGUOUS_PROVIDER (nunca escolher uma no "sorteio" do banco).
 */
export function resolveProvider(
  rows: AiProviderRow[],
  purpose: string,
  providerId?: string | null,
): AiProviderRow {
  const list: AiProviderRow[] = Array.isArray(rows) ? rows : [];

  if (nonEmptyString(providerId)) {
    const wanted = list.filter((row) => row?.id === providerId);
    if (wanted.length === 0) {
      throw new AiRoutingError(
        'NO_PROVIDER',
        `Provedor ${providerId} não encontrado.`,
      );
    }
    // Existe mas está desligado: erro próprio (409), não "não encontrado".
    if (!wanted[0].is_active) {
      throw new AiRoutingError(
        'PROVIDER_INACTIVE',
        `Provedor ${wanted[0].id} (${wanted[0].name}) está inativo.`,
      );
    }
    return wanted[0];
  }

  if (typeof purpose !== 'string' || !(AI_PURPOSES as readonly string[]).includes(purpose)) {
    throw new AiRoutingError(
      'BAD_PURPOSE',
      `Finalidade de IA inválida: ${String(purpose)}.`,
    );
  }

  const candidates = list.filter(
    (row) =>
      row?.is_active === true &&
      row?.is_default === true &&
      Array.isArray(row?.use_for) &&
      row.use_for.includes(purpose),
  );

  if (candidates.length === 0) {
    throw new AiRoutingError(
      'NO_PROVIDER',
      `Nenhum provedor padrão e ativo para a finalidade "${purpose}".`,
    );
  }

  if (candidates.length > 1) {
    // Ordena só para a mensagem: o resultado não pode depender da ordem do banco.
    const ids = candidates.map((row) => row.id).sort((a, b) => a.localeCompare(b)).join(', ');
    throw new AiRoutingError(
      'AMBIGUOUS_PROVIDER',
      `Mais de um provedor padrão para a finalidade "${purpose}": ${ids}. Desative/remova o padrão duplicado.`,
    );
  }

  return candidates[0];
}

/**
 * Decide o modelo efetivo — sempre no servidor.
 *
 * `requestedModel` só vale quando o administrador colocou o pedido em
 * `config.allowed_models`. Caso contrário é ignorado e marcamos
 * `modelSubstituted` para auditoria (IA-035).
 */
export function resolveModel(
  provider: AiProviderRow,
  requestedModel?: string | null,
): { model: string | null; modelRequested: string | null; modelSubstituted: boolean } {
  const modelRequested = nonEmptyString(requestedModel);
  const configured = nonEmptyString(provider?.model);
  const providerType = typeof provider?.provider_type === 'string' ? provider.provider_type : '';
  const serverModel = configured ?? DEFAULT_MODEL_BY_TYPE[providerType] ?? null;

  if (modelRequested === null) {
    return { model: serverModel, modelRequested: null, modelSubstituted: false };
  }

  // google_gemini só fala o dialeto OpenAI para um conjunto fixo de nomes:
  // aceitar o modelo do cliente aqui quebraria a chamada (compatibilidade).
  if (providerType === 'google_gemini') {
    return {
      model: serverModel,
      modelRequested,
      modelSubstituted: serverModel !== modelRequested,
    };
  }

  const rawAllowed = provider?.config?.allowed_models;
  const allowed: string[] = Array.isArray(rawAllowed)
    ? rawAllowed.filter((item): item is string => typeof item === 'string')
    : [];

  if (allowed.includes(modelRequested)) {
    return { model: modelRequested, modelRequested, modelSubstituted: false };
  }

  return {
    model: serverModel,
    modelRequested,
    modelSubstituted: serverModel !== modelRequested,
  };
}

/**
 * Monta as mensagens finais: política do servidor na frente + TODAS as
 * mensagens do cliente na ordem original. Um `system` do cliente continua
 * onde estava (não é sobrescrito nem apagado) e deixa de ser a primeira
 * mensagem. O array de entrada nunca é mutado.
 *
 * `content` é `unknown` de propósito (IA-033): conteúdo MULTIPART (array de
 * partes imagem+texto dos classificadores de visão) precisa atravessar como
 * está — coagir para string destruiria a imagem. É pass-through puro: nenhuma
 * validação, coerção ou transformação do conteúdo acontece aqui.
 */
export function composeMessages(
  serverSystemPrompt: string | null,
  messages: Array<{ role: string; content: unknown }>,
): Array<{ role: string; content: unknown }> {
  const input = Array.isArray(messages) ? messages : [];
  // Cópia rasa de cada item: mutações posteriores no resultado não vazam para a entrada.
  const clientMessages = input.map((message) => ({ ...message }));
  const policy = nonEmptyString(serverSystemPrompt);
  if (policy === null) return clientMessages;
  return [{ role: 'system', content: policy }, ...clientMessages];
}

/**
 * Remove do `config` tudo que é reservado ou desconhecido. Nunca lança:
 * entrada inválida (null, string, array) devolve `{}`.
 */
export function filterConfigBody(config: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!isPlainObject(config)) return result;
  const reserved = new Set(RESERVED_BODY_KEYS);
  const allowed = new Set(ALLOWED_CONFIG_BODY_KEYS);
  for (const [key, value] of Object.entries(config)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (reserved.has(key)) continue;
    if (!allowed.has(key)) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Filtra `extra_body`: remove as chaves reservadas (podem sobrescrever o que o
 * servidor decidiu) mas mantém chaves específicas do provedor. Nunca lança.
 * A comparação ignora caixa: `Model`/`Messages` não podem virar canal
 * alternativo só por capitalização diferente.
 */
export function filterExtraBody(extraBody: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!isPlainObject(extraBody)) return result;
  const reserved = new Set(RESERVED_BODY_KEYS.map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(extraBody)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (reserved.has(key.toLowerCase())) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Mantém apenas cabeçalhos da allowlist (case-insensitive) e descarta o resto —
 * em especial `Authorization`/`Content-Type`, que o código define e vence sempre.
 * Nunca lança; valores não escalares são descartados.
 */
export function filterHeaders(headers: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isPlainObject(headers)) return result;
  const allowed = new Set(ALLOWED_HEADER_NAMES.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(headers)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (!allowed.has(key.toLowerCase())) continue;
    if (typeof value === 'string') {
      result[key] = value; // preserva a capitalização original para não quebrar o provedor
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = String(value);
    }
  }
  return result;
}
