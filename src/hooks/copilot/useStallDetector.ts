/**
 * CV-077 — Detecção de estagnação (stall detector).
 *
 * Identifica quando a conversa travou em "vou pensar" / "depois eu vejo"
 * e sugere uma ação específica de recuperação.
 */

export type StallType = 'thinking' | 'busy' | 'silent' | 'ghosted';

export interface StallAlert {
  type: StallType;
  label: string;
  recoveryAction: string;
  draftLine: string;
}

const STALL_TRIGGERS: Record<StallType, string[]> = {
  thinking: ['vou pensar', 'preciso pensar', 'deixa eu ver', 'vou avaliar', 'vou ver', 'depois eu vejo', 'vou analisar'],
  busy: ['tô ocupado', 'estou ocupado', 'sem tempo', 'semana que vem', 'mês que vem', 'depois a gente fala'],
  silent: [],
  ghosted: [],
};

const RECOVERIES: Record<StallType, { label: string; action: string; draft: string }> = {
  thinking: {
    label: 'Travado em "vou pensar"',
    action: 'Envie mockup + tabela de preço para facilitar decisão',
    draft: 'Claro, sem pressa! Para facilitar sua análise, posso te enviar o mockup com sua logo e a tabela de valores por quantidade. Assim você já tem tudo na mão quando for decidir — mando agora?',
  },
  busy: {
    label: 'Cliente ocupado',
    action: 'Agende follow-up para horário específico',
    draft: 'Sem problema! Quando fica melhor para eu retornar — amanhã de manhã ou à tarde? Assim não te interrompo na hora errada.',
  },
  silent: {
    label: 'Sem resposta',
    action: 'Envie mensagem de reabertura com novidade',
    draft: 'Olá! Estou passando para ver se você ainda tem interesse nos brindes. Temos uma novidade de produto que pode te interessar — posso te mostrar?',
  },
  ghosted: {
    label: 'Sumiu após orçamento',
    action: 'Envie follow-up com prazo e escassez real',
    draft: 'Oi! Estou fechando a agenda de produção da semana. Ainda temos disponibilidade para o seu prazo — posso reservar a sua quantidade?',
  },
};

export interface UseStallDetectorOptions {
  lastClientMessage: string;
  minutesSinceLastMessage?: number;
}

export function useStallDetector({
  lastClientMessage,
  minutesSinceLastMessage,
}: UseStallDetectorOptions): StallAlert | null {
  if (!lastClientMessage && !minutesSinceLastMessage) return null;

  if (minutesSinceLastMessage && minutesSinceLastMessage > 1440) {
    const rec = RECOVERIES.ghosted;
    return { type: 'ghosted', label: rec.label, recoveryAction: rec.action, draftLine: rec.draft };
  }
  if (minutesSinceLastMessage && minutesSinceLastMessage > 120) {
    const rec = RECOVERIES.silent;
    return { type: 'silent', label: rec.label, recoveryAction: rec.action, draftLine: rec.draft };
  }

  if (!lastClientMessage) return null;
  const text = lastClientMessage.toLowerCase();

  for (const [type, triggers] of Object.entries(STALL_TRIGGERS) as [StallType, string[]][]) {
    if (triggers.some((kw) => text.includes(kw))) {
      const rec = RECOVERIES[type];
      return { type, label: rec.label, recoveryAction: rec.action, draftLine: rec.draft };
    }
  }

  return null;
}
