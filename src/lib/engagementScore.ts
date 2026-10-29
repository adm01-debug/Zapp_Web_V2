import type { ContactStats } from '@/hooks/crm/useContactStats';

/**
 * Pontuação de engajamento do contato (0–100) a partir de dados REAIS já
 * disponíveis em `ContactService.fetchStats` (é o que a aba Resumo do contato
 * consome). Substitui o cálculo antigo do cabeçalho, que partia de 50 fixo e
 * somava bônus por sentimento/prioridade/tipo — número inventado, porque o
 * bônus de tipo comparava `'customer'` enquanto os tipos oficiais são
 * `cliente`/`fornecedor`/... (contactTypeConfig), e quase todo contato aparecia
 * "Engajamento Médio 50/100" sem nenhum dado de conversa.
 *
 * Fórmula (componentes somados, teto 100):
 *   - Volume de mensagens (máx. 40): `min(totalMessages, 200) / 200 * 40`.
 *   - Histórico de conversas (máx. 25): `min(totalConversations, 10) * 2.5`.
 *   - Velocidade de resposta (máx. 20): menor `avgResponseTimeMinutes` melhor —
 *     ≤15 min → 20; ≤60 → 15; ≤240 → 10; ≤1440 → 5; acima ou sem resposta
 *     medida (0) → 0.
 *   - Satisfação (máx. 15): só quando há CSAT (`csatCount > 0`) —
 *     `clamp(csatAverage, 0, 5) / 5 * 15`.
 *
 * Sem dados suficientes (nenhuma mensagem e nenhuma conversa) devolve `null`:
 * o cabeçalho simplesmente NÃO mostra pontuação, em vez de inventar um 50.
 */
export function engagementScore(stats: ContactStats | null | undefined): number | null {
  if (!stats) return null;

  const totalMessages = stats.totalMessages ?? 0;
  const totalConversations = stats.totalConversations ?? 0;

  // Sem histórico de conversa não há o que medir — não inventa pontuação.
  if (totalMessages <= 0 && totalConversations <= 0) return null;

  const volumePoints = (Math.min(totalMessages, 200) / 200) * 40;
  const conversationPoints = Math.min(totalConversations, 10) * 2.5;
  const responsePoints = responseSpeedPoints(stats.avgResponseTimeMinutes ?? 0);

  const hasCsat = (stats.csatCount ?? 0) > 0 && stats.csatAverage != null;
  const csatPoints = hasCsat
    ? (Math.min(Math.max(stats.csatAverage as number, 0), 5) / 5) * 15
    : 0;

  const score = Math.round(volumePoints + conversationPoints + responsePoints + csatPoints);
  return Math.min(Math.max(score, 0), 100);
}

/** Pontos por velocidade média de resposta (mensagens nos dois sentidos). */
function responseSpeedPoints(avgResponseTimeMinutes: number): number {
  if (avgResponseTimeMinutes <= 0) return 0; // 0 = nenhuma resposta medida
  if (avgResponseTimeMinutes <= 15) return 20;
  if (avgResponseTimeMinutes <= 60) return 15;
  if (avgResponseTimeMinutes <= 240) return 10;
  if (avgResponseTimeMinutes <= 1440) return 5;
  return 0;
}

/** Faixa textual do engajamento, usada no badge e no tooltip. */
export function engagementLevel(score: number): 'Alto' | 'Médio' | 'Baixo' {
  if (score >= 80) return 'Alto';
  if (score >= 50) return 'Médio';
  return 'Baixo';
}
