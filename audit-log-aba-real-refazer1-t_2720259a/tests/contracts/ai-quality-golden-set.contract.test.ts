/**
 * AVALIAÇÃO DE QUALIDADE DA RESPOSTA DE IA — conjunto reservado (golden set).
 *
 * LACUNA QUE ESTE ARQUIVO FECHA (Bloco 19 / IA-188): até 08/10/2026 `tests/contracts`
 * tinha só contratos `ai-*.contract.test.ts` — cada um provando UM aspecto isolado da
 * saída do modelo — e nenhuma AVALIAÇÃO: nenhum conjunto anotado de respostas cruas,
 * em português, medido contra os eixos de qualidade do plano de IA.
 *
 * O QUE É MEDIDO (IA-188 — fundamento, utilidade, omissão e recusa indevida):
 *   - FUNDAMENTO      — a resposta aceita carrega exatamente o que o modelo trouxe:
 *                       não ganha default, não é coagida, e valor inválido é RECUSADO
 *                       em vez de virar análise plausível;
 *   - UTILIDADE       — a resposta aceita entrega ao consumidor os campos úteis que o
 *                       modelo produziu (fonte, emoji, temas, marcações) — nada some
 *                       em silêncio no parse;
 *   - OMISSÃO         — falta de dado obrigatório NÃO vira análise apresentada como
 *                       completa: tem de ser recusada;
 *   - RECUSA INDEVIDA — resposta válida e benigna não pode ser barrada (bloqueio
 *                       excessivo).
 *
 * CRITÉRIOS DE ACEITE (com origem declarada, não inventada aqui):
 *   fundamento      ≥ 95% → `docs/ia/IA-005-metas-de-qualidade.md`, meta M4;
 *   utilidade       ≥ 95% → IA-188 ("utilidade");
 *   omissão           0  → IA-005, meta M5 (falta de dado nunca vira afirmação);
 *   recusa indevida   0  → IA-188.
 *
 * COMO SE PROVA AQUI: cada caso é uma SAÍDA CRUA DE MODELO (JSON já parseado, como a
 * Edge Function o recebe) + a REFERÊNCIA ANOTADA à mão — "o que a pessoa que recebe a
 * resposta deve ver", escrita em termos de efeito para o usuário, não de schema. O caso
 * roda pelo CAMINHO REAL de produção: `normalizeSentiment`/`normalizeUrgency` +
 * `applyVocabularyConversion` (IA-021/022) e `parseModelOutput` com o schema da
 * capacidade (IA-025). Se o código divergir da referência, o caso acusa pelo `id`.
 *
 * MODALIDADE: o que muda na origem (áudio, imagem, documento) é o texto de entrada da
 * capacidade; a saída do modelo é o mesmo JSON desta avaliação. A dimensão fica
 * registrada para separar o conjunto por modalidade, como IA-188 pede.
 *
 * LIMITE DESTE CONJUNTO (declarado, não escondido): é o conjunto de partida — tamanho
 * inicial e anotado por agente. O conjunto reservado de 200 casos revisados por PESSOA
 * que o IA-188 pede depende de revisão humana (`docs/ia/IA-008-organizacao-das-entregas.md`,
 * Bloco 19) e segue pendente. O que passa a existir aqui é a régua executável — conjunto +
 * eixos + critérios — para comparar qualquer mudança contra uma referência independente,
 * sem ajustar a resposta ao conjunto (o código de produção não importa este arquivo).
 */
/*
 * Caminho real de produção exercitado: `normalizeSentiment`/`normalizeUrgency`
 * (IA-021/022) aplicados como as Edge Functions aplicam, e `parseModelOutput`
 * com o schema da capacidade (IA-025). O módulo do pipeline
 * (`ai-conversation-pipeline.ts`) não é importado aqui porque carrega o client
 * do Supabase por URL `esm.sh`, que o runner de contrato não resolve — a
 * aplicação do valor canônico é a mesma decisão de uma linha da função real.
 */
import { describe, expect, it } from 'vitest';
import {
  AutoTagOutput,
  ConversationAnalysisOutput,
  ConversationSummaryOutput,
  SuggestedRepliesEnvelope,
  parseModelOutput,
} from '../../supabase/functions/_shared/ai-response-contracts.ts';
import {
  normalizeSentiment,
  normalizeUrgency,
} from '../../supabase/functions/_shared/ai-vocabulary.ts';

// ─── Tipos do conjunto ──────────────────────────────────────────────────────

export type CapacidadeAvaliada = 'analise' | 'resumo' | 'respostas' | 'etiquetas';
export type EixoDeQualidade = 'fundamento' | 'utilidade' | 'omissao' | 'recusa_indevida';
export type AreaDoCaso = 'vendas' | 'compras' | 'logistica' | 'rh' | 'financeiro' | 'sac' | 'outros';
export type ModalidadeDoCaso = 'texto' | 'audio' | 'imagem' | 'documento';
export type RiscoDoCaso = 'baixo' | 'medio' | 'alto';

/** Referência anotada de um caso: o que o usuário deve ver depois da validação. */
export interface ReferenciaDoCaso {
  /** `true` = é uma resposta válida; `false` = não pode ser tratada como resposta pronta. */
  aceita: boolean;
  /** Por quê, em português, sem citar schema. */
  motivo: string;
  /** Caminhos (com ponto) que PRECISAM existir nos dados aceitos — nada de descarte silencioso. */
  campos?: string[];
  /** Caminho → valor exato esperado nos dados aceitos (fundamento do que o modelo trouxe). */
  valores?: Record<string, unknown>;
  /** Caminhos que NÃO podem existir nos dados aceitos — opcional inventado é mentira. */
  ausentes?: string[];
}

export interface CasoDoConjunto {
  id: string;
  capacidade: CapacidadeAvaliada;
  area: AreaDoCaso;
  modalidade: ModalidadeDoCaso;
  risco: RiscoDoCaso;
  eixo: EixoDeQualidade;
  /** Saída crua do modelo, como a Edge Function a recebe. */
  saida: Record<string, unknown>;
  referencia: ReferenciaDoCaso;
}

/** Critérios de aceite do conjunto — origem declarada no cabeçalho deste arquivo. */
export const CRITERIOS_DE_QUALIDADE = {
  fundamentoMinimo: 0.95,
  utilidadeMinimo: 0.95,
  omissaoMaxima: 0,
  recusaIndevidaMaxima: 0,
} as const;

// ─── Fábricas das saídas cruas (formato real das capacidades) ───────────────

/** Saída típica de `ai-conversation-analysis` em português. */
const analise = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  department: 'vendas',
  relationshipType: 'cliente novo',
  summary: 'Cliente pediu orçamento de brindes personalizados e perguntou o prazo de entrega.',
  status: 'pendente',
  keyPoints: ['pediu orçamento', 'prazo curto'],
  nextSteps: ['enviar proposta com prazo'],
  sentiment: 'positivo',
  urgency: 'media',
  topics: ['orçamento'],
  ...overrides,
});

/** Saída de `ai-conversation-summary` — mesmos campos, sem `department`/`relationshipType`. */
const resumo = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const base = analise(overrides);
  delete base.department;
  delete base.relationshipType;
  return base;
};

/** Saída de `ai-suggest-reply`: envelope com EXATAMENTE 3 sugestões. */
const sugestoes = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  suggestions: [
    {
      type: 'objetiva',
      text: 'Posso enviar a tabela com prazo de 7 dias úteis.',
      source: 'Artigo: Prazo de produção',
    },
    { type: 'formal', text: 'Agradecemos o contato; a proposta segue hoje.', emoji: '🙂' },
    { type: 'curta', text: 'Consigo fechar para sexta.' },
  ],
  ...overrides,
});

/** Saída de `ai-auto-tag`: confiança em 0-1, nunca percentual. */
const etiquetas = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  tags: [
    { name: 'reclamação', confidence: 0.8 },
    { name: 'prazo', confidence: 0.55 },
  ],
  ...overrides,
});

/** Cópia sem uma chave — o que o modelo "esqueceu" de devolver. */
const semChave = (saida: Record<string, unknown>, chave: string): Record<string, unknown> => {
  const copia = { ...saida };
  delete copia[chave];
  return copia;
};

// ─── O conjunto reservado ───────────────────────────────────────────────────

export const CONJUNTO_RESERVADO: CasoDoConjunto[] = [
  // ── FUNDAMENTO ────────────────────────────────────────────────────────────
  {
    id: 'f-legado-sentimento',
    capacidade: 'analise',
    area: 'sac',
    modalidade: 'texto',
    risco: 'alto',
    eixo: 'fundamento',
    saida: analise({ sentiment: 'positive' }),
    referencia: {
      aceita: true,
      motivo:
        'Resposta válida com sentimento legado em inglês: tem de ser lida como o canônico pt-BR "positivo", não recusada nem deixada como está.',
      valores: { sentiment: 'positivo' },
      ausentes: ['sentimentScore'],
    },
  },
  {
    id: 'f-legado-urgencia',
    capacidade: 'analise',
    area: 'logistica',
    modalidade: 'texto',
    risco: 'alto',
    eixo: 'fundamento',
    saida: analise({ urgency: 'urgent' }),
    referencia: {
      aceita: true,
      motivo: 'Urgência legada "urgent" é o topo da escala canônica: "critica".',
      valores: { urgency: 'critica' },
    },
  },
  {
    id: 'f-nota-zero',
    capacidade: 'analise',
    area: 'sac',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'fundamento',
    saida: analise({ sentimentScore: 0, customerSatisfaction: 1 }),
    referencia: {
      aceita: true,
      motivo:
        'Zero é nota, não ausência: a resposta precisa manter 0 no sentimento e 1 no CSAT, sem virar 50/3.',
      valores: { sentimentScore: 0, customerSatisfaction: 1 },
    },
  },
  {
    id: 'f-opcionais-ausentes',
    capacidade: 'analise',
    area: 'rh',
    modalidade: 'texto',
    risco: 'baixo',
    eixo: 'fundamento',
    saida: analise(),
    referencia: {
      aceita: true,
      motivo:
        'Análise completa sem os campos opcionais: eles têm de continuar ausentes — nenhum default inventado substitui o que o modelo não disse.',
      ausentes: [
        'sentimentScore',
        'customerSatisfaction',
        'agentPerformance',
        'churnRisk',
        'salesOpportunity',
      ],
    },
  },
  {
    id: 'f-nota-como-texto',
    capacidade: 'analise',
    area: 'financeiro',
    modalidade: 'texto',
    risco: 'alto',
    eixo: 'fundamento',
    saida: analise({ sentimentScore: '80' }),
    referencia: {
      aceita: false,
      motivo:
        'Nota em texto ("80") não é nota: aceitar coagindo para 80 apresentaria uma precisão que o modelo não deu.',
    },
  },
  {
    id: 'f-confianca-percentual',
    capacidade: 'etiquetas',
    area: 'vendas',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'fundamento',
    saida: etiquetas({ tags: [{ name: 'reclamação', confidence: 80 }] }),
    referencia: {
      aceita: false,
      motivo:
        'Confiança em percentual (80) não pode virar 0,8: o mesmo número passaria a significar outra coisa.',
    },
  },
  {
    id: 'f-confianca-fora-da-faixa',
    capacidade: 'etiquetas',
    area: 'compras',
    modalidade: 'documento',
    risco: 'alto',
    eixo: 'fundamento',
    saida: etiquetas({ tags: [{ name: 'urgente', confidence: 1.5 }] }),
    referencia: {
      aceita: false,
      motivo: 'Confiança 1,5 está fora da faixa 0-1: recusar, nunca limitar em silêncio para 1.',
    },
  },
  {
    id: 'f-etiqueta-decimal-valida',
    capacidade: 'etiquetas',
    area: 'vendas',
    modalidade: 'texto',
    risco: 'baixo',
    eixo: 'fundamento',
    saida: etiquetas(),
    referencia: {
      aceita: true,
      motivo: 'Confiança decimal válida sobrevive exatamente como veio (0,8).',
      valores: { 'tags.0.confidence': 0.8 },
    },
  },

  // ── UTILIDADE ─────────────────────────────────────────────────────────────
  {
    id: 'u-fonte-da-resposta',
    capacidade: 'respostas',
    area: 'sac',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'utilidade',
    saida: sugestoes(),
    referencia: {
      aceita: true,
      motivo:
        'A fonte que o modelo citou (artigo da base) precisa chegar à tela; perdê-la no parse esconde de onde saiu a resposta.',
      campos: ['suggestions.0.source'],
      valores: { 'suggestions.0.source': 'Artigo: Prazo de produção' },
    },
  },
  {
    id: 'u-emoji-da-resposta',
    capacidade: 'respostas',
    area: 'vendas',
    modalidade: 'texto',
    risco: 'baixo',
    eixo: 'utilidade',
    saida: sugestoes(),
    referencia: {
      aceita: true,
      motivo: 'O emoji escolhido pelo modelo é parte da resposta sugerida e não pode ser descartado.',
      campos: ['suggestions.1.emoji'],
      valores: { 'suggestions.1.emoji': '🙂' },
    },
  },
  {
    id: 'u-terceira-sugestao',
    capacidade: 'respostas',
    area: 'vendas',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'utilidade',
    saida: sugestoes(),
    referencia: {
      aceita: true,
      motivo: 'As três sugestões são úteis: a terceira não pode sumir.',
      valores: { 'suggestions.2.text': 'Consigo fechar para sexta.' },
    },
  },
  {
    id: 'u-pontos-e-topicos',
    capacidade: 'analise',
    area: 'logistica',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'utilidade',
    saida: analise({ topics: ['orçamento', 'prazo'], keyPoints: ['pediu orçamento', 'prazo curto'] }),
    referencia: {
      aceita: true,
      motivo: 'Pontos-chave e temas chegam inteiros ao consumidor, na ordem do modelo.',
      valores: { 'keyPoints.1': 'prazo curto', 'topics.1': 'prazo' },
    },
  },
  {
    id: 'u-desempenho-completo',
    capacidade: 'analise',
    area: 'rh',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'utilidade',
    saida: analise({ agentPerformance: { empathy: 8, clarity: 9, efficiency: 7, knowledge: 9 } }),
    referencia: {
      aceita: true,
      motivo: 'As quatro notas da atuação são o valor da análise: nenhuma pode ser perdida.',
      valores: { 'agentPerformance.knowledge': 9, 'agentPerformance.efficiency': 7 },
    },
  },
  {
    id: 'u-resumo-sem-departamento',
    capacidade: 'resumo',
    area: 'sac',
    modalidade: 'texto',
    risco: 'baixo',
    eixo: 'utilidade',
    saida: resumo(),
    referencia: {
      aceita: true,
      motivo:
        'O resumo vale sem departamento; o campo continua ausente (não vira "outros") e o texto do resumo chega ao consumidor.',
      campos: ['summary'],
      ausentes: ['department'],
    },
  },
  {
    id: 'u-oportunidade-null',
    capacidade: 'analise',
    area: 'vendas',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'utilidade',
    saida: analise({ salesOpportunity: null }),
    referencia: {
      aceita: true,
      motivo:
        'null explícito significa "sei que não há": tem de chegar como null, não sumir como se não se aplicasse.',
      campos: ['salesOpportunity'],
      valores: { salesOpportunity: null },
    },
  },
  {
    id: 'u-proximos-passos',
    capacidade: 'analise',
    area: 'financeiro',
    modalidade: 'audio',
    risco: 'alto',
    eixo: 'utilidade',
    saida: analise({ nextSteps: ['enviar proposta com prazo', 'agendar retorno'] }),
    referencia: {
      aceita: true,
      motivo: 'Os próximos passos são a parte acionável da análise e chegam completos.',
      valores: { 'nextSteps.1': 'agendar retorno' },
    },
  },

  // ── OMISSÃO ───────────────────────────────────────────────────────────────
  {
    id: 'o-sem-resumo',
    capacidade: 'analise',
    area: 'sac',
    modalidade: 'texto',
    risco: 'alto',
    eixo: 'omissao',
    saida: semChave(analise(), 'summary'),
    referencia: {
      aceita: false,
      motivo: 'Análise sem resumo não é análise: falta o dado central e nada pode ser apresentado como pronto.',
    },
  },
  {
    id: 'o-resumo-vazio',
    capacidade: 'analise',
    area: 'outros',
    modalidade: 'texto',
    risco: 'alto',
    eixo: 'omissao',
    saida: analise({ summary: '' }),
    referencia: {
      aceita: false,
      motivo: 'Resumo vazio é ausência disfarçada: aceitar entregaria uma tela em branco como conclusão.',
    },
  },
  {
    id: 'o-sem-sentimento',
    capacidade: 'analise',
    area: 'sac',
    modalidade: 'audio',
    risco: 'alto',
    eixo: 'omissao',
    saida: semChave(analise(), 'sentiment'),
    referencia: {
      aceita: false,
      motivo:
        'Sem sentimento não se pode completar com "neutro": falta de dado não vira classificação afirmativa.',
    },
  },
  {
    id: 'o-sem-pontos-chave',
    capacidade: 'analise',
    area: 'vendas',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'omissao',
    saida: semChave(analise(), 'keyPoints'),
    referencia: {
      aceita: false,
      motivo: 'O conjunto de pontos-chave é obrigatório: a ausência tem de ser recusada, não ignorada.',
    },
  },
  {
    id: 'o-sem-status',
    capacidade: 'analise',
    area: 'logistica',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'omissao',
    saida: semChave(analise(), 'status'),
    referencia: {
      aceita: false,
      motivo: 'Sem status a conversa não pode ser projetada; aceitar inventaria um estado operacional.',
    },
  },
  {
    id: 'o-departamento-ausente',
    capacidade: 'analise',
    area: 'rh',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'omissao',
    saida: semChave(analise(), 'department'),
    referencia: {
      aceita: false,
      motivo: 'Departamento ausente não vira "outros": o encaminhamento sairia errado sem aviso.',
    },
  },
  {
    id: 'o-respostas-incompletas',
    capacidade: 'respostas',
    area: 'vendas',
    modalidade: 'texto',
    risco: 'alto',
    eixo: 'omissao',
    saida: sugestoes({ suggestions: [{ type: 'objetiva', text: 'Só uma sugestão.' }] }),
    referencia: {
      aceita: false,
      motivo: 'A capacidade promete três sugestões: uma só é resposta incompleta apresentada como pronta.',
    },
  },
  {
    id: 'o-etiqueta-sem-nome',
    capacidade: 'etiquetas',
    area: 'outros',
    modalidade: 'documento',
    risco: 'medio',
    eixo: 'omissao',
    saida: etiquetas({ tags: [{ confidence: 0.9 }] }),
    referencia: {
      aceita: false,
      motivo: 'Etiqueta sem nome não etiqueta nada: gravar assim deixaria o registro vazio com aparência de sucesso.',
    },
  },

  // ── RECUSA INDEVIDA ───────────────────────────────────────────────────────
  {
    id: 'r-listas-vazias-legais',
    capacidade: 'analise',
    area: 'outros',
    modalidade: 'texto',
    risco: 'baixo',
    eixo: 'recusa_indevida',
    saida: analise({ keyPoints: [], nextSteps: [] }),
    referencia: {
      aceita: true,
      motivo:
        'Conversa curta pode legitimamente não ter ponto-chave nem próximo passo — lista vazia é resposta válida e não pode ser barrada.',
      valores: { keyPoints: [], nextSteps: [] },
    },
  },
  {
    id: 'r-sentimento-maiusculo',
    capacidade: 'analise',
    area: 'sac',
    modalidade: 'texto',
    risco: 'baixo',
    eixo: 'recusa_indevida',
    saida: analise({ sentiment: 'CRITICO' }),
    referencia: {
      aceita: true,
      motivo: 'Leitura do vocabulário é case-insensitive: "CRITICO" é o mesmo sentimento, não motivo de recusa.',
      valores: { sentiment: 'critico' },
    },
  },
  {
    id: 'r-urgencia-com-espacos',
    capacidade: 'analise',
    area: 'vendas',
    modalidade: 'texto',
    risco: 'baixo',
    eixo: 'recusa_indevida',
    saida: analise({ urgency: ' media ' }),
    referencia: {
      aceita: true,
      motivo: 'Espaço em volta não muda o valor: a leitura apara e a resposta continua válida.',
      valores: { urgency: 'media' },
    },
  },
  {
    id: 'r-limites-superiores',
    capacidade: 'analise',
    area: 'sac',
    modalidade: 'texto',
    risco: 'medio',
    eixo: 'recusa_indevida',
    saida: analise({
      sentimentScore: 100,
      customerSatisfaction: 5,
      agentPerformance: { empathy: 10, clarity: 10, efficiency: 10, knowledge: 10 },
    }),
    referencia: {
      aceita: true,
      motivo: 'Os valores no teto da escala são válidos: recusá-los seria bloquear análise legítima.',
      valores: { sentimentScore: 100, 'agentPerformance.empathy': 10 },
    },
  },
  {
    id: 'r-desempenho-notas-baixas',
    capacidade: 'analise',
    area: 'rh',
    modalidade: 'audio',
    risco: 'medio',
    eixo: 'recusa_indevida',
    saida: analise({ agentPerformance: { empathy: 1, clarity: 2, efficiency: 1, knowledge: 1 } }),
    referencia: {
      aceita: true,
      motivo:
        'Nota baixa é o dado, não um erro de formato: a análise sobre atendimento ruim precisa passar para ser tratada.',
      valores: { 'agentPerformance.empathy': 1 },
    },
  },
  {
    id: 'r-resumo-minimo',
    capacidade: 'resumo',
    area: 'sac',
    modalidade: 'audio',
    risco: 'baixo',
    eixo: 'recusa_indevida',
    saida: resumo(),
    referencia: {
      aceita: true,
      motivo: 'O resumo é válido com os obrigatórios; exigir departamento aqui barraria um resumo legítimo.',
      campos: ['summary', 'sentiment'],
    },
  },
  {
    id: 'r-etiqueta-confianca-zero',
    capacidade: 'etiquetas',
    area: 'outros',
    modalidade: 'imagem',
    risco: 'baixo',
    eixo: 'recusa_indevida',
    saida: etiquetas({ tags: [{ name: 'duvida', confidence: 0 }] }),
    referencia: {
      aceita: true,
      motivo: 'Confiança zero é um valor da faixa (etiqueta aplicada com nenhuma certeza) e não pode virar ausência.',
      valores: { 'tags.0.confidence': 0 },
    },
  },
  {
    id: 'r-texto-acentuado',
    capacidade: 'analise',
    area: 'sac',
    modalidade: 'texto',
    risco: 'baixo',
    eixo: 'recusa_indevida',
    saida: analise({ summary: 'Cliente reclamou do atraso na entrega e pediu prioridade — urgente!' }),
    referencia: {
      aceita: true,
      motivo: 'Português com acento e travessão é o caso comum, não um erro a ser barrado.',
      valores: {
        summary: 'Cliente reclamou do atraso na entrega e pediu prioridade — urgente!',
      },
    },
  },
];

// ─── Motor da avaliação (usa o caminho REAL de produção) ────────────────────

type DadosAceitos = Record<string, unknown>;

interface AvaliacaoDoCaso {
  caso: CasoDoConjunto;
  aceita: boolean;
  dados: DadosAceitos | null;
}

interface MedidaDoEixo {
  eixo: EixoDeQualidade;
  total: number;
  aprovados: number;
  violacoes: Array<{ id: string; problemas: string[] }>;
}

/**
 * Traduz o vocabulário legado só quando RECONHECIDO — mesma decisão das Edge
 * Functions (`if (legacySentiment.known) applyVocabularyConversion(...)` em
 * `ai-conversation-pipeline.ts`): token conhecido volta canônico para a resposta
 * crua; token desconhecido fica como veio e é o contrato que recusa. O mapa de
 * tradução é o de produção (`normalizeSentiment`/`normalizeUrgency`); se ele
 * mudar, esta avaliação muda junto.
 */
function normalizarVocabulario(bruto: Record<string, unknown>): void {
  const sentimento = normalizeSentiment(bruto.sentiment);
  if (sentimento.known && sentimento.value !== null) bruto.sentiment = sentimento.value;
  const urgencia = normalizeUrgency(bruto.urgency);
  if (urgencia.known && urgencia.value !== null) bruto.urgency = urgencia.value;
}

/** Valida com o schema REAL da capacidade. */
function validar(capacidade: CapacidadeAvaliada, bruto: unknown) {
  switch (capacidade) {
    case 'analise':
      return parseModelOutput(ConversationAnalysisOutput, bruto);
    case 'resumo':
      return parseModelOutput(ConversationSummaryOutput, bruto);
    case 'respostas':
      return parseModelOutput(SuggestedRepliesEnvelope, bruto);
    case 'etiquetas':
      return parseModelOutput(AutoTagOutput, bruto);
  }
}

/** Roda um caso pelo caminho real e devolve o que o usuário recebeu. */
function avaliarCaso(caso: CasoDoConjunto): AvaliacaoDoCaso {
  const bruto: Record<string, unknown> = { ...caso.saida };
  if (caso.capacidade === 'analise' || caso.capacidade === 'resumo') normalizarVocabulario(bruto);
  const resultado = validar(caso.capacidade, bruto);
  return resultado.ok
    ? { caso, aceita: true, dados: resultado.data as DadosAceitos }
    : { caso, aceita: false, dados: null };
}

/** Lê um caminho com ponto (`tags.0.confidence`) sem estourar em ausência. */
function lerCaminho(dados: unknown, caminho: string): { existe: boolean; valor: unknown } {
  let atual: unknown = dados;
  for (const parte of caminho.split('.')) {
    if (Array.isArray(atual)) {
      const indice = Number(parte);
      if (!Number.isInteger(indice) || indice < 0 || indice >= atual.length) {
        return { existe: false, valor: undefined };
      }
      atual = atual[indice];
      continue;
    }
    if (
      typeof atual !== 'object' ||
      atual === null ||
      !Object.prototype.hasOwnProperty.call(atual, parte)
    ) {
      return { existe: false, valor: undefined };
    }
    atual = (atual as Record<string, unknown>)[parte];
  }
  return { existe: true, valor: atual };
}

/** Compara o resultado real com a referência anotada; lista o que divergiu. */
function problemasDoCaso(avaliacao: AvaliacaoDoCaso): string[] {
  const { caso, aceita, dados } = avaliacao;
  const { referencia } = caso;
  const problemas: string[] = [];

  if (referencia.aceita && !aceita) {
    problemas.push('foi RECUSADA, mas a referência diz que é resposta válida');
  }
  if (!referencia.aceita && aceita) {
    problemas.push('foi ACEITA, mas a referência diz que não pode ser tratada como resposta');
  }
  if (!referencia.aceita || dados === null) return problemas;

  for (const caminho of referencia.campos ?? []) {
    if (!lerCaminho(dados, caminho).existe) {
      problemas.push(`campo útil "${caminho}" sumiu na validação`);
    }
  }
  for (const [caminho, esperado] of Object.entries(referencia.valores ?? {})) {
    const { existe, valor } = lerCaminho(dados, caminho);
    if (!existe) {
      problemas.push(`campo "${caminho}" não chegou aos dados aceitos`);
    } else if (JSON.stringify(valor) !== JSON.stringify(esperado)) {
      problemas.push(
        `campo "${caminho}" = ${JSON.stringify(valor)}, esperado ${JSON.stringify(esperado)}`,
      );
    }
  }
  for (const caminho of referencia.ausentes ?? []) {
    if (lerCaminho(dados, caminho).existe) {
      problemas.push(`campo opcional "${caminho}" foi inventado (o modelo não trouxe)`);
    }
  }
  return problemas;
}

/** Mede um eixo do conjunto: taxa de acerto e a lista de casos que divergiram da referência. */
function medirEixo(
  eixo: EixoDeQualidade,
  avaliacoes: AvaliacaoDoCaso[],
): MedidaDoEixo {
  const doEixo = avaliacoes.filter((avaliacao) => avaliacao.caso.eixo === eixo);
  const violacoes = doEixo
    .map((avaliacao) => ({ id: avaliacao.caso.id, problemas: problemasDoCaso(avaliacao) }))
    .filter((violacao) => violacao.problemas.length > 0);
  return { eixo, total: doEixo.length, aprovados: doEixo.length - violacoes.length, violacoes };
}

const AVALIACOES = CONJUNTO_RESERVADO.map(avaliarCaso);
const MEDIDAS: MedidaDoEixo[] = (
  ['fundamento', 'utilidade', 'omissao', 'recusa_indevida'] as EixoDeQualidade[]
).map((eixo) => medirEixo(eixo, AVALIACOES));

const medidaDe = (eixo: EixoDeQualidade): MedidaDoEixo => {
  const medida = MEDIDAS.find((m) => m.eixo === eixo);
  if (!medida) throw new Error(`eixo sem casos no conjunto: ${eixo}`);
  return medida;
};

// ─── Os critérios ───────────────────────────────────────────────────────────

describe('avaliação de qualidade da resposta de IA · conjunto reservado (IA-188)', () => {
  it('o conjunto cobre os quatro eixos, as áreas, as modalidades e os riscos', () => {
    expect(CONJUNTO_RESERVADO.length).toBeGreaterThanOrEqual(24);
    expect(new Set(CONJUNTO_RESERVADO.map((caso) => caso.id)).size).toBe(
      CONJUNTO_RESERVADO.length,
    );
    for (const eixo of ['fundamento', 'utilidade', 'omissao', 'recusa_indevida'] as const) {
      expect(CONJUNTO_RESERVADO.filter((caso) => caso.eixo === eixo).length).toBeGreaterThanOrEqual(8);
    }
    expect(new Set(CONJUNTO_RESERVADO.map((caso) => caso.area)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(CONJUNTO_RESERVADO.map((caso) => caso.modalidade)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(CONJUNTO_RESERVADO.map((caso) => caso.risco)).size).toBe(3);
    expect(CONJUNTO_RESERVADO.every((caso) => caso.referencia.motivo.trim().length > 0)).toBe(true);
  });

  it('recusa indevida = 0 (nenhuma resposta válida barrada)', () => {
    const medida = medidaDe('recusa_indevida');
    expect(medida.violacoes).toEqual([]);
    expect(medida.total - medida.aprovados).toBeLessThanOrEqual(
      CRITERIOS_DE_QUALIDADE.recusaIndevidaMaxima,
    );
    expect(medida.total).toBe(8);
  });

  it('omissão = 0 (nenhuma falta de dado apresentada como resposta completa)', () => {
    const medida = medidaDe('omissao');
    expect(medida.violacoes).toEqual([]);
    expect(medida.total - medida.aprovados).toBeLessThanOrEqual(CRITERIOS_DE_QUALIDADE.omissaoMaxima);
    expect(medida.total).toBe(8);
  });

  it('fundamento ≥ 95% (a resposta aceita não inventa nem coage o que o modelo não disse)', () => {
    const medida = medidaDe('fundamento');
    expect(medida.violacoes).toEqual([]);
    expect(medida.aprovados / medida.total).toBeGreaterThanOrEqual(
      CRITERIOS_DE_QUALIDADE.fundamentoMinimo,
    );
    expect(medida.total).toBe(8);
  });

  it('utilidade ≥ 95% (os campos úteis que o modelo produziu chegam ao consumidor)', () => {
    const medida = medidaDe('utilidade');
    expect(medida.violacoes).toEqual([]);
    expect(medida.aprovados / medida.total).toBeGreaterThanOrEqual(
      CRITERIOS_DE_QUALIDADE.utilidadeMinimo,
    );
    expect(medida.total).toBe(8);
  });

  it('mede os quatro eixos sobre o conjunto inteiro, sem caso órfão', () => {
    const cobertos = MEDIDAS.reduce((soma, medida) => soma + medida.total, 0);
    expect(cobertos).toBe(CONJUNTO_RESERVADO.length);
    expect(MEDIDAS.every((medida) => medida.total > 0)).toBe(true);
  });
});
