/**
 * IA-061 (Bloco 07 — Visão, resumo e contexto verificável) — o contexto que o
 * RESUMO entrega ao modelo não pode divergir do contexto da ANÁLISE.
 *
 * Medido no fonte de hoje (ponta dia/2026-10-08): o resumo montava o contexto
 * inline, dentro do handler, e divergia da análise em dois pontos concretos:
 *
 *   1. NÃO lia `contact_type`. A análise informa o papel do interlocutor
 *      (`, Tipo: ${contact.contact_type}`, `ai-conversation-analysis/index.ts`)
 *      desde a IA-065 — "Informar departamento, papel do interlocutor, canal,
 *      conexão e atendimento". Sem o tipo, o resumo não sabe com QUEM fala
 *      (cliente, fornecedor, colaborador) e pode fundir assuntos de finalidade
 *      distinta do mesmo contato — falha do próprio aceite da IA-065.
 *
 *   2. injetava o sentimento do histórico CRU (`[${a.sentiment}]`) enquanto a
 *      análise normaliza pelo vocabulário canônico (IA-021). A rotina do plano
 *      é explícita ("O sentimento anterior entra no prompt já no vocabulário
 *      CANÔNICO (IA-021): antes o modelo recebia o valor cru, que podia estar
 *      em inglês") — linha LEGADA gravada antes do contrato de saída (IA-025)
 *      entra em inglês no prompt do resumo e não entra no da análise.
 *
 * O aceite da IA-061 é literal: "os dois modos não divergem em campos,
 * prioridade, autorização e histórico". Campo e histórico, portanto.
 *
 * Por que este módulo é PURO: sem I/O, sem `supabase-js`, sem depender de rede.
 * O único import é o vocabulário canônico (fonte única, sem imports externos),
 * o que deixa a decisão de contexto mensurável por teste direto — o handler
 * continua sendo quem consulta o banco e passa os campos.
 */
import { normalizeSentiment } from "../_shared/ai-vocabulary.ts";

/** Campos do contato que o contexto do resumo usa. */
export interface SummaryContactFields {
  name?: string | null;
  company?: string | null;
  tags?: string[] | null;
  /** Papel do interlocutor (IA-065): 'cliente', 'fornecedor', 'colaborador'… */
  contact_type?: string | null;
}

/** Campos das análises anteriores que o contexto do resumo usa. */
export interface SummaryHistoryFields {
  sentiment?: string | null;
  summary?: string | null;
}

export interface SummaryContextInput {
  contact?: SummaryContactFields | null;
  recentAnalyses?: SummaryHistoryFields[] | null;
  /** Recorte declarado pelo cliente; ausente continua ausente (não inventa). */
  periodDays?: number | null;
  /** Tamanho do conjunto analisado, para o recorte ser verificável. */
  messageCount?: number | null;
}

/**
 * Monta o bloco de contexto profissional do resumo, no MESMO recorte da
 * análise. Devolve '' quando não há nada a declarar — nunca um contexto
 * fabricado.
 *
 * Regras duras:
 *   - campo ausente é dito como ausente ('não informado' / 'Nenhuma'), nunca
 *     preenchido com um valor inventado;
 *   - sentimento só entra pelo valor CANÔNICO; token desconhecido vira
 *     'sentimento não classificado' em vez de aparecer cru no prompt;
 *   - sem `periodDays` declarado, o recorte NÃO é inventado.
 */
export function buildSummaryContactContext(input: SummaryContextInput = {}): string {
  const parts: string[] = [];
  const contact = input.contact ?? null;

  if (contact) {
    const line = [
      `Contexto: ${contact.name || "Cliente"}`,
      `Empresa: ${contact.company || "N/A"}`,
      `Tipo: ${contact.contact_type || "não informado"}`,
      `Tags: ${contact.tags && contact.tags.length > 0 ? contact.tags.join(", ") : "Nenhuma"}`,
    ].join(", ");
    parts.push(line);
  }

  const analyses = Array.isArray(input.recentAnalyses) ? input.recentAnalyses : [];
  if (analyses.length > 0) {
    const history = analyses
      .map((analysis) => {
        const sentiment = normalizeSentiment(analysis?.sentiment).value ?? "sentimento não classificado";
        const summary = typeof analysis?.summary === "string" ? analysis.summary : "";
        return `[${sentiment}] ${summary}`;
      })
      .join(" | ");
    parts.push(`Histórico: ${history}`);
  }

  if (typeof input.periodDays === "number") {
    const count = typeof input.messageCount === "number" ? input.messageCount : 0;
    parts.push(`Recorte pedido: ${count} mensagens dos últimos ${input.periodDays} dias.`);
  }

  return parts.length > 0 ? `\n${parts.join("\n")}` : "";
}
