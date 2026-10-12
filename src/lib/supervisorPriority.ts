/**
 * Regras de priorização da fila do supervisor (P1–P4).
 *
 * Porte da V3 (`Zapp_Web_V3/src/features/admin/lib/supervisorPriority.ts`) para a
 * Arquitetura V2, com uma diferença deliberada: a leitura de `contacts.ai_priority`
 * passa pelo vocabulário canônico (`normalizeUrgency`, IA-021/IA-022) em vez de um
 * `=== 'urgent' || === 'alta'` local. O canônico já traduz os legados reais da
 * coluna (`urgent`/`critical` → `critica`, `high` → `alta`), então a regra
 * "urgência da IA" da V3 continua valendo — `urgent`, `high` e `alta` sobem para
 * P1 — sem criar uma segunda leitura de prioridade que possa divergir do edge.
 *
 * Ordem de avaliação (top-down). A PRIMEIRA regra satisfeita define o nível.
 * O `score` numérico ordena dentro do nível de forma estável.
 *
 *   P1 Crítica → sem atendente há 30 min ou mais, OU risco ≥ 80, OU urgência da IA.
 *   P2 Alta    → aguardando há 15 min ou mais, OU risco ≥ 60.
 *   P3 Média   → aguardando há 5 min ou mais, OU risco ≥ 40.
 *   P4 Normal  → demais conversas em atendimento.
 *
 * O "tempo de espera" é medido por `contacts.updated_at` (sinal que a V3 usava e
 * que está sempre preenchido); `conversation_status_changed_at` existe, mas muda
 * de semântica entre as telas e não é o relógio desta fila.
 */
import { normalizeUrgency } from '@/lib/ai-vocabulary';

/** Nível de prioridade da fila do supervisor. */
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'normal';

/** Sinais de uma conversa que entram no cálculo (recorte de `contacts`). */
export interface SupervisorConversationInput {
  id: string;
  name: string;
  phone: string;
  assigned_to: string | null;
  queue_id: string | null;
  ai_priority: string | null;
  risk_score: number | null;
  updated_at: string;
}

/** Resultado do cálculo: nível, rótulo em pt-BR, motivo legível e ordenação. */
export interface PriorityInfo {
  level: PriorityLevel;
  label: string;
  reason: string;
  score: number;
  waitingMinutes: number;
}

/** Limiares das regras (minutos de espera e faixas de risco). */
const THRESHOLDS = {
  semAtendenteMinutos: 30,
  altaMinutos: 15,
  mediaMinutos: 5,
  riscoCritico: 80,
  riscoAlto: 60,
  riscoMedio: 40,
} as const;

/** Faixa de `score` por nível: separa os níveis mesmo com empate de tempo/risco. */
const SCORE_BASE = { critical: 1000, high: 500, medium: 200, normal: 0 } as const;

/** Metadados de apresentação do nível (rótulo, selo e ordem de exibição). */
export const PRIORITY_META: Record<
  PriorityLevel,
  { label: string; badgeClass: string; order: number }
> = {
  critical: { label: 'P1 · Crítica', badgeClass: 'bg-destructive text-destructive-foreground', order: 0 },
  high: { label: 'P2 · Alta', badgeClass: 'bg-warning text-warning-foreground', order: 1 },
  medium: { label: 'P3 · Média', badgeClass: 'bg-warning/70 text-warning-foreground', order: 2 },
  normal: { label: 'P4 · Normal', badgeClass: 'bg-muted text-muted-foreground', order: 3 },
};

/**
 * Regras visíveis ao supervisor — a MESMA lista que a tela mostra. Mantida aqui
 * (e não na tela) para que o texto exibido não possa divergir do cálculo.
 */
export const PRIORITY_RULES_TEXT = [
  'P1 Crítica → sem atendente há 30 min ou mais, ou risco ≥ 80, ou marcação de urgência da IA.',
  'P2 Alta → aguardando há 15 min ou mais, ou risco ≥ 60.',
  'P3 Média → aguardando há 5 min ou mais, ou risco ≥ 40.',
  'P4 Normal → demais conversas em atendimento.',
] as const;

/** Urgência da IA: `alta`/`critica` no vocabulário canônico (cobre `high`, `urgent`, `alta`, `critical`). */
function iaMarcouUrgencia(aiPriority: string | null): boolean {
  const urgency = normalizeUrgency(aiPriority).value;
  return urgency === 'alta' || urgency === 'critica';
}

/** Calcula o nível P1–P4 de uma conversa. Pura: `now` é injetado para testes. */
export function computePriority(
  c: SupervisorConversationInput,
  now: Date = new Date()
): PriorityInfo {
  const updatedMs = new Date(c.updated_at).getTime();
  const waitingMinutes = Math.max(0, Math.floor((now.getTime() - updatedMs) / 60_000));
  const risk = c.risk_score ?? 0;
  const iaUrgente = iaMarcouUrgencia(c.ai_priority);
  const semAtendente = !c.assigned_to;

  if (
    (semAtendente && waitingMinutes >= THRESHOLDS.semAtendenteMinutos) ||
    risk >= THRESHOLDS.riscoCritico ||
    iaUrgente
  ) {
    return {
      level: 'critical',
      label: PRIORITY_META.critical.label,
      reason: iaUrgente
        ? 'IA classificou como urgente'
        : risk >= THRESHOLDS.riscoCritico
          ? `Risco alto (${risk})`
          : `Sem atendente há ${waitingMinutes} min`,
      score: SCORE_BASE.critical + waitingMinutes + risk,
      waitingMinutes,
    };
  }
  if (waitingMinutes >= THRESHOLDS.altaMinutos || risk >= THRESHOLDS.riscoAlto) {
    return {
      level: 'high',
      label: PRIORITY_META.high.label,
      reason:
        risk >= THRESHOLDS.riscoAlto ? `Risco ${risk}` : `Aguardando há ${waitingMinutes} min`,
      score: SCORE_BASE.high + waitingMinutes + risk,
      waitingMinutes,
    };
  }
  if (waitingMinutes >= THRESHOLDS.mediaMinutos || risk >= THRESHOLDS.riscoMedio) {
    return {
      level: 'medium',
      label: PRIORITY_META.medium.label,
      reason:
        risk >= THRESHOLDS.riscoMedio ? `Risco ${risk}` : `Aguardando há ${waitingMinutes} min`,
      score: SCORE_BASE.medium + waitingMinutes + risk,
      waitingMinutes,
    };
  }
  return {
    level: 'normal',
    label: PRIORITY_META.normal.label,
    reason: 'Em atendimento',
    score: SCORE_BASE.normal + waitingMinutes,
    waitingMinutes,
  };
}

/**
 * Ordena a fila: nível (P1→P4), depois maior `score` primeiro. Estável — duas
 * linhas com o mesmo nível e o mesmo `score` mantêm a ordem de entrada, que vem
 * determinística da consulta (`updated_at` e `id`).
 */
export function sortByPriority<T extends { priority: PriorityInfo }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const orderDiff = PRIORITY_META[a.priority.level].order - PRIORITY_META[b.priority.level].order;
    if (orderDiff !== 0) return orderDiff;
    return b.priority.score - a.priority.score;
  });
}
