/**
 * CV-079 — Alerta de risco de perda de negócio.
 *
 * Detecta sinais de que a conversa está esfriando ou que o cliente
 * está se encaminhando para fechar com concorrente. Alerta o vendedor
 * com urgência e sugere ação imediata.
 */
export type LossRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface LossRiskAlert {
  riskLevel: LossRiskLevel;
  signals: string[];
  immediateAction: string;
  script: string;
}

const RISK_SIGNALS: Record<LossRiskLevel, string[]> = {
  critical: [
    'fechei com outro', 'já comprei', 'não vou mais precisar', 'cancelar', 'desistir',
    'vou de outro fornecedor', 'outro me ofereceu', 'fechado com',
  ],
  high: [
    'concorrente me ligou', 'recebi outra proposta', 'outro me deu desconto',
    'vou fechar em outro lugar', 'mais barato lá', 'já tenho proposta melhor',
  ],
  medium: [
    'vou pensar mais', 'não decidi ainda', 'estou avaliando outros', 'tem mais opções',
    'preciso comparar', 'ainda não sei', 'semana que vem vejo',
  ],
  low: [],
};

const ACTIONS: Record<LossRiskLevel, string> = {
  critical: 'Contato de recuperação imediato: entenda o que levou à decisão.',
  high: 'Contraoferta agora: mostre o diferencial único antes que feche com concorrente.',
  medium: 'Crie urgência real: disponibilidade limitada ou prazo de cotação.',
  low: '',
};

const SCRIPTS: Record<LossRiskLevel, string> = {
  critical: 'Que pena! Posso perguntar o que fez você escolher outro fornecedor? Quero melhorar.',
  high: 'Antes de você decidir, posso te mostrar um diferencial que o concorrente não oferece?',
  medium: 'Para garantir o prazo do seu evento, preciso da confirmação até amanhã. Posso te ajudar a decidir?',
  low: '',
};

export interface UseLossRiskAlertOptions {
  clientMessage: string;
  recentClientMessages?: string[];
  silenceDays?: number;
}

export function useLossRiskAlert({
  clientMessage,
  recentClientMessages = [],
  silenceDays = 0,
}: UseLossRiskAlertOptions): LossRiskAlert {
  const combined = (clientMessage + ' ' + recentClientMessages.join(' ')).toLowerCase();

  for (const level of ['critical', 'high', 'medium'] as LossRiskLevel[]) {
    const hit = RISK_SIGNALS[level].find((s) => combined.includes(s));
    if (hit) {
      return { riskLevel: level, signals: [hit], immediateAction: ACTIONS[level], script: SCRIPTS[level] };
    }
  }

  if (silenceDays >= 3) {
    return {
      riskLevel: 'medium',
      signals: [`${silenceDays} dias sem resposta`],
      immediateAction: ACTIONS.medium,
      script: `Olá! Tudo bem? Só queria confirmar se você ainda tem interesse no pedido de brindes.`,
    };
  }

  return { riskLevel: 'low', signals: [], immediateAction: '', script: '' };
}
