/**
 * CV-077 — Detector de "vou pensar".
 *
 * Detecta objeção de cortina de fumaça (cliente usa "vou pensar" mas já mostrou sinal de compra).
 */
import { useMemo } from 'react';

export interface VouPensarResult {
  detected: boolean;
  hasBuySignal: boolean;
  probableHiddenObjection: string | null;
  probeQuestion: string;
}

const VOU_PENSAR_TRIGGERS = ['vou pensar', 'deixa eu ver', 'vou avaliar', 'não sei ainda', 'vou decidir depois', 'preciso pensar'];
const BUY_SIGNALS = ['gostei', 'interessante', 'legal', 'bacana', 'quero', 'ficou bom', 'faz sentido', 'perfeito'];

export function useVouPensarDetector({
  clientText,
  recentMessages,
}: {
  clientText: string;
  recentMessages?: string[];
}): VouPensarResult {
  return useMemo(() => {
    if (!clientText) return { detected: false, hasBuySignal: false, probableHiddenObjection: null, probeQuestion: '' };
    const lower = clientText.toLowerCase();
    const detected = VOU_PENSAR_TRIGGERS.some((t) => lower.includes(t));
    if (!detected) return { detected: false, hasBuySignal: false, probableHiddenObjection: null, probeQuestion: '' };

    const context = [clientText, ...(recentMessages ?? [])].join(' ').toLowerCase();
    const hasBuySignal = BUY_SIGNALS.some((s) => context.includes(s));

    return {
      detected: true,
      hasBuySignal,
      probableHiddenObjection: hasBuySignal ? 'Possível objeção oculta: preço, aprovação interna ou comparação com concorrente' : null,
      probeQuestion: 'Claro! Só para eu entender melhor: tem alguma dúvida que ficou em aberto? Às vezes consigo resolver na hora.',
    };
  }, [clientText, recentMessages]);
}
