/**
 * Capacidades declaradas de provedores de IA (módulo puro — IA-036/IA-039).
 *
 * Por que este módulo existe (aceite "sem prometer capacidades inexistentes"):
 *  - o `provider_type` garante só um NÚCLEO mínimo; tudo o mais precisa ser
 *    DECLARADO explicitamente no config do provedor;
 *  - nenhum caminho pode ANUNCIAR o que ninguém garantiu: o config só
 *    ESTREITA features de tipo e só ADICIONA modalidades não-texto;
 *  - ausência de limite declarado NÃO é permissão: um pedido que exige limite
 *    falha com UNDECLARED_LIMIT em vez de seguir no escuro e estourar depois.
 *
 * Restrições de projeto: SEM Deno.env, SEM fetch, SEM I/O — é importado por
 * testes vitest. Determinístico e nunca muta as entradas nem a base.
 *
 * Leitura defensiva: das entradas só são lidas chaves PRÓPRIAS (config,
 * capabilities, modalities, features, limits) — herança de protótipo e
 * `__proto__` não influenciam o resultado.
 */

import type { AiProviderRow } from './ai-routing.ts';

/** Modalidades de entrada/saída que um provedor pode declarar. */
export type AiModality = 'text' | 'vision' | 'audio_stt' | 'audio_tts' | 'audio_sts';

/** Recursos opcionais de requisição (não confundir com modalidade). */
export type AiFeature = 'tools' | 'json' | 'streaming';

/** Códigos estáveis: o ai-proxy converte `code` em HTTP 400, sem dispatch. */
export type AiCapabilityErrorCode =
  | 'UNSUPPORTED_MODALITY'
  | 'UNSUPPORTED_FEATURE'
  | 'LIMIT_EXCEEDED'
  | 'UNDECLARED_LIMIT';

/**
 * Erro de capacidade com código próprio. Separado de AiRoutingError para que
 * "configuração quebrada" (roteamento) e "pedido não coberto" (capacidade)
 * virem respostas distintas em vez de caírem no fallback e mascarem a falha.
 */
export class AiCapabilityError extends Error {
  readonly code: AiCapabilityErrorCode;

  constructor(code: AiCapabilityErrorCode, message: string) {
    super(message);
    this.name = 'AiCapabilityError';
    this.code = code;
  }
}

/** Retrato do que o provedor anuncia, e a origem dessa garantia. */
export interface AiCapabilities {
  modalities: AiModality[];
  features: AiFeature[];
  limits: { max_input_tokens?: number; max_output_tokens?: number; max_audio_seconds?: number };
  /** 'type' = só o que o tipo garante; 'config' = o config estreitou/adicionou algo */
  source: 'type' | 'config';
}

/** Lista canônica de modalidades — usada para validar o que o config declara. */
const MODALITIES: readonly AiModality[] = ['text', 'vision', 'audio_stt', 'audio_tts', 'audio_sts'];

/** Lista canônica de features — usada para validar o que o config declara. */
const FEATURES: readonly AiFeature[] = ['tools', 'json', 'streaming'];

/** Objeto simples (sem array/null) — base dos filtros de config. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lê uma chave PRÓPRIA de `obj`, ignorando qualquer coisa herdada do protótipo.
 *
 * Existe porque `obj[key]` sozinho enxerga a cadeia de protótipos: um config
 * literal com `__proto__: { capabilities: { modalities: ['vision'] } }`
 * injetaria modalidade nunca declarada. Sem chave própria → `undefined`.
 *
 * Não blinda contra GETTER: se a própria chave for um acessor que lança, o
 * acesso lança — por desenho (o caso suportado é valor vindo de JSON, ver
 * contrato de `declaredCapabilities`). Engolir a exceção aqui esconderia bug.
 */
function readOwn(obj: Record<string, unknown> | null, key: string): unknown {
  if (obj === null || !Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
  return obj[key];
}

/** Converte para array SEM herdar `any` (Array.isArray nu abriria `any[]`). */
function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function isModality(value: unknown): value is AiModality {
  return typeof value === 'string' && (MODALITIES as readonly string[]).includes(value);
}

function isFeature(value: unknown): value is AiFeature {
  return typeof value === 'string' && (FEATURES as readonly string[]).includes(value);
}

/** Rótulo para mensagens de erro (nunca lança com linha ausente/incompleta). */
function providerLabel(provider: AiProviderRow): string {
  const id = typeof provider?.id === 'string' && provider.id !== '' ? provider.id : '?';
  const name = typeof provider?.name === 'string' && provider.name !== '' ? provider.name : '?';
  return `${name} (${id})`;
}

/**
 * Núcleo que cada `provider_type` garante POR CONSTRUÇÃO (item 1 da semântica).
 *
 * - provedores nativos/compatíveis falam texto + tools/json/streaming;
 * - `custom_webhook`/`custom_agent` têm contrato definido por quem configura,
 *   então nada além de texto é prometido aqui;
 * - tipo desconhecido cai no mesmo mínimo conservador (nunca inventar recurso).
 *
 * Congelado de propósito: ninguém pode ampliar a garantia mutando a tabela em
 * tempo de execução e contornar a regra "o config não amplia o tipo".
 */
export const BASE_CAPABILITIES: Record<string, { modalities: AiModality[]; features: AiFeature[] }> = {
  lovable_ai: { modalities: ['text'], features: ['tools', 'json', 'streaming'] },
  openai_compatible: { modalities: ['text'], features: ['tools', 'json', 'streaming'] },
  google_gemini: { modalities: ['text'], features: ['tools', 'json', 'streaming'] },
  custom_webhook: { modalities: ['text'], features: [] },
  custom_agent: { modalities: ['text'], features: [] },
};

for (const entry of Object.values(BASE_CAPABILITIES)) {
  Object.freeze(entry.modalities);
  Object.freeze(entry.features);
  Object.freeze(entry);
}
Object.freeze(BASE_CAPABILITIES);

/**
 * Base usada quando o `provider_type` não está na tabela (mínimo conservador).
 * Não é exportada e `declaredCapabilities` sempre copia os arrays, então não há
 * caminho para mutá-la a partir de fora.
 */
const UNKNOWN_TYPE_BASE: { modalities: AiModality[]; features: AiFeature[] } = {
  modalities: ['text'],
  features: [],
};

/**
 * Capacidades declaradas de um provedor (item 2 da semântica).
 *
 * Regras (o "não prometer o que não existe" mora aqui):
 *  (a) o resultado é sempre subconjunto de `base ∪ declaração do config`;
 *  (b) `config.capabilities.modalities` ADICIONA modalidades não-texto
 *      (vision/áudio) — é o ÚNICO caminho para anunciá-las, porque a base não
 *      as promete. 'text' já é garantido e não é reescrito pelo config;
 *  (c) `config.capabilities.features` apenas FILTRA a base — nunca acrescenta
 *      tools/json/streaming a um tipo que não os garante;
 *  (d) entrada inválida (config null/array/string, tipos errados) → só a base;
 *  (e) não lança para valores vindos de JSON — o caso real, porque o provedor
 *      chega de jsonb (JSON.parse, sem getters). NÃO é blindagem universal:
 *      se `provider` ou `config` tiverem uma propriedade com getter que lança,
 *      o acesso lança (sem try/catch de propósito — engolir esconderia bug de
 *      quem montou o objeto à mão).
 */
export function declaredCapabilities(provider: AiProviderRow): AiCapabilities {
  const providerType = typeof provider?.provider_type === 'string' ? provider.provider_type : '';
  const base = BASE_CAPABILITIES[providerType] ?? UNKNOWN_TYPE_BASE;

  // Cópias: nunca vazar a referência congelada da base nem mutar a entrada.
  const modalities = [...base.modalities];
  const features = [...base.features];
  let fromConfig = false;

  const config = isPlainObject(provider?.config) ? provider.config : null;
  const rawCaps = config !== null ? readOwn(config, 'capabilities') : undefined;
  const caps = isPlainObject(rawCaps) ? rawCaps : null;

  // (b) modalidades do config: só ADICIONAM não-texto (dedup).
  if (caps !== null) {
    for (const item of asUnknownArray(readOwn(caps, 'modalities'))) {
      if (isModality(item) && item !== 'text' && !modalities.includes(item)) {
        modalities.push(item);
        fromConfig = true;
      }
    }
  }

  // (c) features do config: interseção com a base (config não cria garantia).
  const rawFeatures = caps !== null ? readOwn(caps, 'features') : undefined;
  if (Array.isArray(rawFeatures)) {
    const declared = asUnknownArray(rawFeatures).filter(isFeature);
    const narrowed = features.filter((feature) => declared.includes(feature));
    if (narrowed.length !== features.length) fromConfig = true;
    features.length = 0;
    features.push(...narrowed);
  }

  // (3) limites: SOMENTE de config.limits, positivos e finitos. Nada inventado.
  const limits: AiCapabilities['limits'] = {};
  const rawLimitsValue = config !== null ? readOwn(config, 'limits') : undefined;
  const rawLimits = isPlainObject(rawLimitsValue) ? rawLimitsValue : null;
  if (rawLimits !== null) {
    const limitKeys = ['max_input_tokens', 'max_output_tokens', 'max_audio_seconds'] as const;
    for (const key of limitKeys) {
      const value = readOwn(rawLimits, key);
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        limits[key] = value;
        fromConfig = true;
      }
    }
  }

  // `source` só é 'type' quando TODA a garantia (modalidades, features e
  // limites) vem do tipo; qualquer coisa declarada pelo config marca 'config'.
  return { modalities, features, limits, source: fromConfig ? 'config' : 'type' };
}

/** O que o pedido exige do provedor (todos os campos opcionais). */
export interface AiCapabilityNeed {
  modality?: AiModality;
  features?: AiFeature[];
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
}

/**
 * Garante que o pedido é coberto pelas capacidades declaradas (item 4) e
 * devolve as capacidades quando passa.
 *
 * Diferente de `declaredCapabilities`, aqui LANÇAR é o objetivo: um pedido que
 * o provedor não cobre precisa falhar ANTES do dispatch (400), em vez de virar
 * resposta vazia ou — pior — troca silenciosa de fornecedor.
 */
export function assertCapabilities(provider: AiProviderRow, need: AiCapabilityNeed): AiCapabilities {
  const caps = declaredCapabilities(provider);
  const label = providerLabel(provider);

  if (need?.modality !== undefined && !caps.modalities.includes(need.modality)) {
    throw new AiCapabilityError(
      'UNSUPPORTED_MODALITY',
      `Provedor ${label} não declara a modalidade "${need.modality}".`,
    );
  }

  for (const feature of asUnknownArray(need?.features)) {
    if (!isFeature(feature) || !caps.features.includes(feature)) {
      throw new AiCapabilityError(
        'UNSUPPORTED_FEATURE',
        `Provedor ${label} não declara o recurso "${String(feature)}".`,
      );
    }
  }

  const limitChecks: Array<{
    key: 'max_input_tokens' | 'max_output_tokens' | 'max_audio_seconds';
    requested: number | undefined;
  }> = [
    { key: 'max_input_tokens', requested: need?.inputTokens },
    { key: 'max_output_tokens', requested: need?.outputTokens },
    { key: 'max_audio_seconds', requested: need?.audioSeconds },
  ];

  for (const check of limitChecks) {
    const requested = check.requested;
    // Só número finito e positivo é "exigência"; entrada inválida não vira pedido.
    if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) continue;

    const declared = caps.limits[check.key];
    // Ausência de declaração NÃO é permissão: exigir limite sem declaração falha.
    if (declared === undefined) {
      throw new AiCapabilityError(
        'UNDECLARED_LIMIT',
        `Provedor ${label} não declara ${check.key}, exigido pelo pedido.`,
      );
    }
    if (requested > declared) {
      throw new AiCapabilityError(
        'LIMIT_EXCEEDED',
        `Provedor ${label}: pedido de ${check.key}=${requested} acima do limite declarado ${declared}.`,
      );
    }
  }

  return caps;
}
