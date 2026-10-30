/**
 * CV-079 — Detector de risco de perda de venda.
 *
 * Identifica sinais de que o cliente pode estar desistindo ou indo para concorrente.
 * Une as duas implementações paralelas do CV-079 (antigo useLossRiskAlert): frases de
 * gatilho das duas, histórico recente opcional e `script` — a mensagem pronta para o
 * cliente, separada de `recoveryAction`, que é a orientação para o vendedor.
 */
import { useMemo } from 'react';

export type LossRiskLevel = 'low' | 'medium' | 'high';

export interface LossRiskResult {
  level: LossRiskLevel;
  signals: string[];
  /** Orientação para o vendedor (não enviar ao cliente). */
  recoveryAction: string;
  /** Mensagem sugerida para o cliente; vazia quando não há risco. */
  script: string;
}

const HIGH_RISK = [
  'vou cancelar', 'cancelar', 'desisti', 'desistir', 'não vai dar', 'fechei com outro', 'fechado com',
  'já comprei', 'obrigado mesmo assim', 'não vou mais precisar', 'vou de outro fornecedor',
  'outro me ofereceu', 'concorrente me ligou', 'recebi outra proposta', 'outro me deu desconto',
  'vou fechar em outro lugar', 'mais barato lá', 'já tenho proposta melhor',
];
const MEDIUM_RISK = [
  'vou pensar', 'preciso ver', 'cotei em outro', 'comparando', 'preciso comparar', 'não tenho certeza',
  'caro demais', 'não decidi ainda', 'estou avaliando outros', 'tem mais opções', 'ainda não sei',
  'semana que vem vejo',
];
const LOW_RISK = ['semana que vem', 'depois', 'mais tarde', 'em breve'];

const SILENCIO_DIAS = 5;

export function useLossRiskDetector({
  clientText,
  recentClientMessages = [],
  daysSinceLastContact,
}: {
  clientText: string;
  recentClientMessages?: string[];
  daysSinceLastContact?: number;
}): LossRiskResult {
  // Chave estável: o default `[]` é um array novo a cada render.
  const recentes = recentClientMessages.join(' ');
  return useMemo(() => {
    const lower = `${clientText ?? ''} ${recentes}`.toLowerCase();
    if (!lower.trim() && !daysSinceLastContact) return { level: 'low', signals: [], recoveryAction: '', script: '' };
    const silenceRisk = (daysSinceLastContact ?? 0) > SILENCIO_DIAS;

    const highMatches = HIGH_RISK.filter((s) => lower.includes(s));
    const medMatches = MEDIUM_RISK.filter((s) => lower.includes(s));
    const lowMatches = LOW_RISK.filter((s) => lower.includes(s));

    if (highMatches.length > 0) {
      return {
        level: 'high',
        signals: highMatches,
        recoveryAction: 'Ligue agora. Pergunte o que faltou e faça uma oferta de recuperação única.',
        script: 'Antes de você decidir, posso te mostrar um diferencial que o concorrente não oferece? E, se já fechou, me conta o que pesou — quero melhorar.',
      };
    }
    if (medMatches.length > 0 || silenceRisk) {
      return {
        level: 'medium',
        signals: [...medMatches, ...(silenceRisk ? [`silêncio > ${SILENCIO_DIAS} dias`] : [])],
        recoveryAction: 'Envie proposta revisada com benefício adicional. Crie urgência com data de validade.',
        script: medMatches.length > 0
          ? 'Para garantir o prazo do seu evento, preciso da confirmação até amanhã. Posso te ajudar a decidir?'
          : 'Olá! Tudo bem? Só queria confirmar se você ainda tem interesse no pedido de brindes.',
      };
    }
    return { level: 'low', signals: lowMatches, recoveryAction: 'Agende follow-up para o prazo que o cliente mencionou.', script: '' };
  }, [clientText, recentes, daysSinceLastContact]);
}
