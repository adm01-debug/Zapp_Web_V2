/**
 * Vocabulário canônico de IA do Zapp_Web_V2 — etapas IA-021 (sentimento) e
 * IA-022 (urgência × prioridade operacional).
 *
 * Este arquivo é a FONTE ÚNICA do vocabulário. O runtime Edge (Deno) importa
 * daqui direto; o app (Vite/React) consome este MESMO arquivo através do
 * re-export em `src/lib/ai-vocabulary.ts` — não existe cópia paralela que possa
 * divergir. `tests/contracts/ai-vocabulary-parity.contract.test.ts` prova, export
 * a export, que o re-export entrega exatamente estes símbolos.
 *
 * Regras que valem para todas as funções daqui:
 *   1. Sem imports externos, funções puras, sem `console.log`.
 *   2. Valor NÃO reconhecido devolve `{ value: null, known: false }` — nunca um
 *      default inventado (`'neutro'`, `'media'`, `'low'`). Preservar o estado
 *      desconhecido é o aceite de IA-021/IA-022: valor inválido não entra em
 *      projeção, alerta nem CRM.
 *   3. `known` diz apenas se o token CRU foi reconhecido como valor do domínio;
 *      o legado é traduzido só na leitura e `value` é sempre canônico.
 *   4. Toda string é lida com trim + case-insensitive.
 */

/** Sentimento canônico (pt-BR): significado único de `conversation_analyses.sentiment`. */
export const SENTIMENT_VALUES = ['positivo', 'neutro', 'negativo', 'critico'] as const;
export type Sentiment = (typeof SENTIMENT_VALUES)[number];

/** Urgência analítica (pt-BR): quão urgente o caso é, na leitura do modelo. */
export const URGENCY_VALUES = ['baixa', 'media', 'alta', 'critica'] as const;
export type Urgency = (typeof URGENCY_VALUES)[number];

/** Prioridade operacional (inglês): escala que o front já consome em `contacts.ai_priority`. */
export const OPERATIONAL_PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;
export type OperationalPriority = (typeof OPERATIONAL_PRIORITY_VALUES)[number];

/** Resultado de normalização: `value` canônico (ou `null`) e se o token cru era conhecido. */
export interface VocabularyMatch<T extends string> {
  value: T | null;
  known: boolean;
}

/** Ausência, tipo errado ou token vazio — nunca vira valor por adivinhação. */
const UNKNOWN: { value: null; known: false } = { value: null, known: false };

/** Token de busca (trim + minúsculas); `null` para ausência, tipo errado ou string vazia. */
function tokenOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim().toLowerCase();
  return token.length > 0 ? token : null;
}

/** Leitura de chave PRÓPRIA: evita `constructor`/`toString` virarem alias herdado. */
function hasOwn<T>(table: Readonly<Record<string, T>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

const SENTIMENT_SET: ReadonlySet<string> = new Set<string>(SENTIMENT_VALUES);

// Legados em inglês ainda gravados por `ai-auto-tag`/`chatbot-l1`. Traduzimos só
// na LEITURA, para o mesmo sentimento significar a mesma coisa em análise,
// contato, churn, alerta e CRM (aceite de IA-021).
// `very_positive`/`very_negative` ficam de fora: não existe intensidade na escala
// canônica, e mapear um deles para `positivo`/`negativo` seria ADIVINHAR. Ficam
// desconhecidos (`known: false`) para o consumidor decidir o que fazer.
const SENTIMENT_ALIASES: Readonly<Record<string, Sentiment>> = {
  positive: 'positivo',
  neutral: 'neutro',
  negative: 'negativo',
  critical: 'critico',
};

function isSentiment(token: string): token is Sentiment {
  return SENTIMENT_SET.has(token);
}

/**
 * Normaliza o sentimento cru (canônico pt-BR ou legado EN).
 * Desconhecido/ausente → `{ value: null, known: false }`; nunca cai para `'neutro'`.
 */
export function normalizeSentiment(raw: unknown): VocabularyMatch<Sentiment> {
  const token = tokenOf(raw);
  if (token === null) return UNKNOWN;
  if (isSentiment(token)) return { value: token, known: true };
  const alias = hasOwn(SENTIMENT_ALIASES, token) ? SENTIMENT_ALIASES[token] : undefined;
  return alias === undefined ? UNKNOWN : { value: alias, known: true };
}

const URGENCY_SET: ReadonlySet<string> = new Set<string>(URGENCY_VALUES);

// Legados: `ai-auto-tag`/`chatbot-l1` gravam em inglês e o irmão
// `ai-conversation-summary` chega a comparar com `'critical'` (defeito B11).
// `high`, `critical` e `urgent` são o mesmo topo da escala — aqui a tradução
// recoloca todos na urgência canônica pt-BR. `normal` NÃO entra: não é urgência,
// é prioridade operacional (ver `normalizeOperationalPriority`).
const URGENCY_ALIASES: Readonly<Record<string, Urgency>> = {
  low: 'baixa',
  medium: 'media',
  high: 'alta',
  critical: 'critica',
  urgent: 'critica',
};

function isUrgency(token: string): token is Urgency {
  return URGENCY_SET.has(token);
}

/** Normaliza a urgência crua (canônico pt-BR ou legado EN). `'normal'` é desconhecido aqui. */
export function normalizeUrgency(raw: unknown): VocabularyMatch<Urgency> {
  const token = tokenOf(raw);
  if (token === null) return UNKNOWN;
  if (isUrgency(token)) return { value: token, known: true };
  const alias = hasOwn(URGENCY_ALIASES, token) ? URGENCY_ALIASES[token] : undefined;
  return alias === undefined ? UNKNOWN : { value: alias, known: true };
}

// Urgência analítica (pt-BR) → prioridade operacional do front (EN).
const URGENCY_TO_OPERATIONAL: Readonly<Record<Urgency, OperationalPriority>> = {
  baixa: 'low',
  media: 'medium',
  alta: 'high',
  critica: 'urgent',
};

/** Converte urgência canônica na prioridade operacional; `null` (desconhecida) segue `null`. */
export function urgencyToOperationalPriority(u: Urgency | null): OperationalPriority | null {
  if (u === null) return null;
  const mapped: OperationalPriority | undefined = URGENCY_TO_OPERATIONAL[u];
  return mapped === undefined ? null : mapped;
}

const OPERATIONAL_PRIORITY_SET: ReadonlySet<string> = new Set<string>(OPERATIONAL_PRIORITY_VALUES);

// Legados reais de `contacts.ai_priority`:
//   - `normal`: o que `ai-auto-tag` grava como "média" (não existe na escala do front);
//   - `alta`/`media`/`baixa`/`critica`: a urgência pt-BR que as funções de análise
//     gravam na MESMA coluna do front — traduzimos para a escala EN na leitura.
const OPERATIONAL_PRIORITY_ALIASES: Readonly<Record<string, OperationalPriority>> = {
  normal: 'medium',
  baixa: 'low',
  media: 'medium',
  alta: 'high',
  critica: 'urgent',
};

function isOperationalPriority(token: string): token is OperationalPriority {
  return OPERATIONAL_PRIORITY_SET.has(token);
}

/** Normaliza a prioridade operacional crua (canônico EN ou legado real do repo). */
export function normalizeOperationalPriority(raw: unknown): VocabularyMatch<OperationalPriority> {
  const token = tokenOf(raw);
  if (token === null) return UNKNOWN;
  if (isOperationalPriority(token)) return { value: token, known: true };
  const alias = hasOwn(OPERATIONAL_PRIORITY_ALIASES, token)
    ? OPERATIONAL_PRIORITY_ALIASES[token]
    : undefined;
  return alias === undefined ? UNKNOWN : { value: alias, known: true };
}
