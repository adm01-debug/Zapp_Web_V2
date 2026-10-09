/**
 * IA-111 — conceito de inatividade do risco de churn (Edge Function `ai-churn-analysis`).
 *
 * Defeito (docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md, IA-111): a idade de
 * engajamento caía para `contacts.updated_at` quando o contato não tinha mensagem
 * — `updated_at` é mutado por QUALQUER edição de cadastro, então editar o
 * cadastro "reiniciava" a inatividade e o risco despencava sem nenhuma interação
 * nova. A inatividade agora usa SÓ a última interação real (mensagem) e declara
 * a lacuna quando não existe histórico em vez de inventar uma data.
 *
 * Canais cobertos: mensagens (tabela `messages`, todos os canais que gravam nela).
 * Fora do histórico: qualquer evento que não grava em `messages` (ex.: edição de
 * cadastro, reatribuição de etiqueta, importação do CRM) — por isso a lacuna é
 * explícita (`daysSinceLastMessage: null` + `hasInteractionHistory: false`).
 *
 * Módulo puro (sem rede/banco/env): é o cálculo consumido pelo handler e é ele
 * que os testes exercitam.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Contato como a função o usa. `updated_at` pode existir na linha real, mas NÃO
 * entra no cálculo: o cadastro não é interação (IA-111).
 */
export interface ChurnContactRow {
  id: string;
  name: string;
  created_at: string;
  /** Presente na linha de `contacts`; ignorado de propósito pelo cálculo. */
  updated_at?: string;
}

/** Estado de engajamento medido a partir das mensagens do contato. */
export interface ChurnEngagement {
  /** `created_at` da última mensagem; `null` = nenhuma interação registrada. */
  lastMessageAt: string | null;
  recentMessageCount: number;
  totalMessageCount: number;
}

export interface ChurnSignal {
  contactId: string;
  name: string;
  /** 0–100. Índice de risco heurístico — NÃO é probabilidade calibrada (IA-113). */
  riskScore: number;
  riskLevel: RiskLevel;
  /** Dias desde a última mensagem; `null` = sem histórico de interação. */
  daysSinceLastMessage: number | null;
  hasInteractionHistory: boolean;
  recentMessageCount: number;
  totalMessageCount: number;
  reasons: string[];
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function computeChurnSignal(
  contact: ChurnContactRow,
  engagement: ChurnEngagement,
  now: Date = new Date(),
): ChurnSignal {
  const { lastMessageAt, recentMessageCount, totalMessageCount } = engagement;

  // Referência da inatividade: a última INTERAÇÃO real. Sem mensagem não existe
  // interação — devolve a lacuna (`null`) em vez de cair no `updated_at` do
  // contato. Clamp em 0: timestamp futuro (clock skew) não gera dias negativos.
  const daysSinceLastMessage = lastMessageAt === null
    ? null
    : Math.max(0, Math.floor((now.getTime() - new Date(lastMessageAt).getTime()) / DAY_MS));

  let riskScore = 0;
  const reasons: string[] = [];

  if (daysSinceLastMessage !== null) {
    if (daysSinceLastMessage > 90) riskScore += 40;
    else if (daysSinceLastMessage > 60) riskScore += 30;
    else if (daysSinceLastMessage > 30) riskScore += 20;
    else if (daysSinceLastMessage > 14) riskScore += 10;
  }

  // Queda de ritmo: mensagens dos últimos 30 dias contra a média mensal desde a
  // criação do contato. `created_at` é imutável (edição de cadastro não o muda).
  const months = Math.max(
    1,
    Math.floor((now.getTime() - new Date(contact.created_at).getTime()) / (30 * DAY_MS)),
  );
  const avgMonthly = totalMessageCount > 0 ? totalMessageCount / months : 0;

  if (avgMonthly > 0 && recentMessageCount < avgMonthly * 0.3) riskScore += 30;
  else if (avgMonthly > 0 && recentMessageCount < avgMonthly * 0.5) riskScore += 20;
  else if (avgMonthly > 0 && recentMessageCount < avgMonthly * 0.7) riskScore += 10;

  if (totalMessageCount <= 1) riskScore += 30;
  else if (totalMessageCount <= 5) riskScore += 20;
  else if (totalMessageCount <= 10) riskScore += 10;

  if (daysSinceLastMessage === null) {
    reasons.push("Sem histórico de interação registrado");
  } else {
    if (daysSinceLastMessage > 30) reasons.push(`${daysSinceLastMessage} dias sem interação`);
    if (recentMessageCount === 0) reasons.push("Sem mensagens nos últimos 30 dias");
  }
  if (totalMessageCount <= 5) reasons.push("Baixo engajamento total");

  const score = Math.min(100, riskScore);

  return {
    contactId: contact.id,
    name: contact.name,
    riskScore: score,
    riskLevel: getRiskLevel(score),
    daysSinceLastMessage,
    hasInteractionHistory: daysSinceLastMessage !== null,
    recentMessageCount,
    totalMessageCount,
    reasons,
  };
}

/**
 * Client service role do supabase-js. Aqui só a cadeia PostgREST é usada, então o
 * parâmetro fica `any` para o teste injetar um duplo (mesmo escape de
 * `auto-close-conversations/index.ts`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChurnQueryClient = any;

/**
 * Mede o engajamento de cada contato pelas MENSAGENS e devolve o índice de risco
 * ordenado do maior para o menor. É o caminho de dados do handler: a única
 * referência de inatividade é a última mensagem (`?? null`), nunca o cadastro.
 */
export async function analyzeChurnContacts(
  admin: ChurnQueryClient,
  contacts: readonly ChurnContactRow[],
  now: Date = new Date(),
): Promise<ChurnSignal[]> {
  const results: ChurnSignal[] = [];
  const sinceThirtyDays = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  for (const contact of contacts) {
    const { data: lastMsg } = await admin
      .from("messages")
      .select("created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: recentMsgCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id)
      .gte("created_at", sinceThirtyDays);

    const { count: totalMsgCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id);

    results.push(computeChurnSignal(contact, {
      lastMessageAt: lastMsg?.created_at ?? null,
      recentMessageCount: recentMsgCount || 0,
      totalMessageCount: totalMsgCount || 0,
    }, now));
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}
