/**
 * Fase 3 do assistente pessoal — PORTA ÚNICA: o roteador de capacidades.
 *
 * Antes: 35 edges isoladas, cada uma recebendo um pedido montado à mão pelo
 * front. Aqui a pessoa escreve em linguagem natural ("como estou com a Maria?")
 * e o roteador decide QUAIS capacidades responder, com o MESMO contexto para
 * todas. A resposta carrega a proveniência de cada pedaço (`sources`), para
 * ninguém ter de acreditar em texto de modelo sem saber de onde veio.
 *
 * Módulo PURO de propósito (sem Deno.env, sem fetch, sem I/O): é a decisão que
 * precisa ser testável e determinística, e é importado por testes vitest e deno.
 * A execução das capacidades fica em `index.ts`, atrás das chaves de capacidade
 * já existentes (`ai.capability.<nome>`).
 */

/** Capacidades que a porta única sabe acionar. */
export type AssistantCapability =
  | 'agenda'
  | 'resumo_conversa'
  | 'sugerir_resposta'
  | 'temperatura_lead'
  | 'recomendar_produto'
  | 'calcular_prazo'
  | 'tratar_objecao';

export const ASSISTANT_CAPABILITIES: readonly AssistantCapability[] = [
  'agenda',
  'resumo_conversa',
  'sugerir_resposta',
  'temperatura_lead',
  'recomendar_produto',
  'calcular_prazo',
  'tratar_objecao',
];

/**
 * Rótulo humano de cada capacidade — é o que aparece em `sources` na resposta,
 * então precisa dizer de onde o pedaço veio sem jargão de código.
 */
export const CAPABILITY_LABELS: Record<AssistantCapability, string> = {
  agenda: 'agenda do contato',
  resumo_conversa: 'resumo da conversa',
  sugerir_resposta: 'sugestão de resposta',
  temperatura_lead: 'temperatura do lead',
  recomendar_produto: 'recomendação de produto',
  calcular_prazo: 'cálculo de prazo',
  tratar_objecao: 'tratamento de objeção',
};

/** Fonte de um pedaço da resposta: o que foi usado e de onde veio. */
export interface ContextSource {
  kind: 'perfil' | 'contato' | 'agenda' | 'conversa' | 'negocio';
  /** Campo legível para a UI ("assistant_profiles", "conversation_tasks", ...). */
  origin: string;
  /** Linhas efetivamente aproveitadas (0 = fonte consultada e vazia). */
  rows: number;
  /** Presente quando a fonte falhou: sem isso o silêncio pareceria "nada havia". */
  error?: string;
}

/**
 * Sinais extraídos do pedido em linguagem natural. Puro e determinístico — nada
 * de modelo decidindo o roteamento: com a IA degradada a porta única continua
 * escolhendo a mesma capacidade e o mesmo contexto.
 */
export interface IntentSignals {
  /** Mensagem crua, já normalizada (minúscula, sem acento). */
  normalized: string;
  /** Pede o panorama do cliente/contato ("como estou com..."). */
  status: boolean;
  /** Pede resumo/histórico. */
  summary: boolean;
  /** Pede texto para responder o cliente. */
  reply: boolean;
  /** Pede avaliação de interesse/maturidade do lead. */
  temperature: boolean;
  /** Pede indicação de produto. */
  product: boolean;
  /** Pede conta de data/prazo de entrega. */
  deadline: boolean;
  /** Fala de agenda/compromisso/lembrete. */
  agenda: boolean;
  /** Cliente levantou objeção (preço, desconto, "vou pensar"). */
  objection: boolean;
}

/** Normaliza para comparação: minúsculas, sem acento, espaços colapsados. */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Casa qualquer um dos padrões (já sem acento) no texto normalizado. */
function hasAny(normalized: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => normalized.includes(p));
}

const STATUS = ['como estou', 'como esta', 'situacao', 'panorama', 'status do cliente', 'resumo do cliente', 'visao geral', 'como vai'];
const SUMMARY = ['resum', 'historico', 'o que aconteceu', 'ultimas conversas', 'recapitu'];
const REPLY = ['responder', 'resposta', 'o que eu falo', 'o que falar', 'sugere', 'sugestao de mensagem', 'mensagem para'];
const TEMPERATURE = ['temperatura', 'quente', 'frio', 'morno', 'interesse', 'lead', 'chance de fechar', 'probabilidade'];
const PRODUCT = ['produto', 'brinde', 'sugere produto', 'recomenda', 'o que oferecer', 'qual brinde'];
const DEADLINE = ['prazo', 'quando entrega', 'quando chega', 'data de entrega', 'entrega', 'dias uteis', 'calcul'];
const AGENDA = ['agenda', 'compromisso', 'lembrete', 'marcado', 'agendado', 'me liga', 'retornar'];
const OBJECTION = ['objec', 'esta caro', 'ta caro', 'desconto', 'vou pensar', 'nao quer', 'recusou', 'contra-argument', 'contornar'];

/** Lê o pedido em linguagem natural e devolve os sinais que o roteador usa. */
export function readIntent(query: string): IntentSignals {
  const normalized = normalizeQuery(query ?? '');
  return {
    normalized,
    status: hasAny(normalized, STATUS),
    summary: hasAny(normalized, SUMMARY),
    reply: hasAny(normalized, REPLY),
    temperature: hasAny(normalized, TEMPERATURE),
    product: hasAny(normalized, PRODUCT),
    deadline: hasAny(normalized, DEADLINE),
    agenda: hasAny(normalized, AGENDA),
    objection: hasAny(normalized, OBJECTION),
  };
}

/**
 * Decide as capacidades do pedido.
 *
 * Regras (determinísticas, na ordem em que o resultado é montado):
 *  - "como estou com o cliente X" é o pedido de panorama: responde com agenda +
 *    resumo + temperatura — três fontes diferentes, como a entrega da fase pede.
 *  - pedido de agenda sozinho não custa modelo: `agenda` é leitura de banco.
 *  - nenhum sinal reconhecido → `agenda` + `resumo_conversa` (o mínimo útil sem
 *    inventar intenção); nunca uma resposta vazia.
 */
export function routeCapabilities(signals: IntentSignals): AssistantCapability[] {
  const picked = new Set<AssistantCapability>();

  if (signals.status) {
    picked.add('agenda');
    picked.add('resumo_conversa');
    picked.add('temperatura_lead');
  }
  if (signals.summary) picked.add('resumo_conversa');
  if (signals.reply) picked.add('sugerir_resposta');
  if (signals.temperature) picked.add('temperatura_lead');
  if (signals.product) picked.add('recomendar_produto');
  if (signals.deadline) picked.add('calcular_prazo');
  if (signals.agenda) picked.add('agenda');
  if (signals.objection) picked.add('tratar_objecao');

  if (picked.size === 0) {
    picked.add('agenda');
    picked.add('resumo_conversa');
  }

  // Ordem estável = ordem canônica, para o teste e a UI não dependerem da ordem
  // em que as regras dispararam.
  return ASSISTANT_CAPABILITIES.filter((c) => picked.has(c));
}

/**
 * Capacidades que gastam modelo. `agenda` sai da lista porque é leitura de
 * banco — a chave de capacidade é checada por capacidade antes de chamar o
 * provedor, então um pedido só de agenda funciona com a IA desligada.
 */
export const MODEL_CAPABILITIES: readonly AssistantCapability[] = [
  'resumo_conversa',
  'sugerir_resposta',
  'temperatura_lead',
  'recomendar_produto',
  'calcular_prazo',
  'tratar_objecao',
];

/** Capacidade → nome da edge que a executa. */
export const CAPABILITY_FUNCTION: Record<Exclude<AssistantCapability, 'agenda'>, string> = {
  resumo_conversa: 'ai-conversation-summary',
  sugerir_resposta: 'ai-suggest-reply',
  temperatura_lead: 'ai-lead-temperature',
  recomendar_produto: 'ai-product-recommendation',
  calcular_prazo: 'ai-deadline-calculator',
  tratar_objecao: 'ai-objection-handler',
};

/**
 * Chave de capacidade de cada edge vem de `ai-feature-flags.ts`
 * (`capabilityFlagKeyForFunction`) — NÃO duplicamos o mapa aqui: o interruptor da
 * porta única é o MESMO dos das edges que ela chama, então desligar a capacidade
 * desliga as duas pontas de uma vez, sem deploy e sem dois registros divergentes.
 */
