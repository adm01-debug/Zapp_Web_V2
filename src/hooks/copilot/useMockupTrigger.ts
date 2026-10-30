/**
 * CV-090 — Gatilho de mockup.
 *
 * Detecta o momento ideal para sugerir envio de mockup.
 */
import { useMemo } from 'react';

export interface MockupTriggerResult {
  shouldTrigger: boolean;
  confidence: number;
  reason: string;
  script: string;
}

const STRONG_TRIGGERS = ['como ficaria com meu logo', 'como fica minha logo', 'ver o mockup', 'quero ver como fica'];
const NORMAL_TRIGGERS = [
  'como ficaria', 'como fica', 'como seria', 'quero ver', 'ver antes', 'exemplo',
  'arte', 'gravação', 'gravacao', 'personalização', 'personalizacao', 'logo', 'logomarca', 'cor',
];

export function useMockupTrigger({ clientText, draftText }: { clientText: string; draftText?: string }): MockupTriggerResult {
  return useMemo(() => {
    if (!clientText) return { shouldTrigger: false, confidence: 0, reason: '', script: '' };
    const combined = (clientText + ' ' + (draftText ?? '')).toLowerCase();

    const strongHit = STRONG_TRIGGERS.some((t) => combined.includes(t));
    const normalHits = NORMAL_TRIGGERS.filter((t) => combined.includes(t)).length;

    if (strongHit) {
      return { shouldTrigger: true, confidence: 1, reason: 'Cliente pediu mockup explicitamente', script: 'Posso fazer um mockup com a sua logo agora mesmo! Me manda o arquivo em PNG ou PDF com fundo transparente.' };
    }
    if (normalHits >= 2) {
      return { shouldTrigger: true, confidence: 0.7, reason: 'Múltiplos sinais de interesse em visualizar', script: 'Para você ter uma ideia de como fica, posso fazer um mockup rápido. Tem a logo em PNG ou PDF?' };
    }
    if (normalHits === 1) {
      return { shouldTrigger: true, confidence: 0.4, reason: 'Interesse em personalização detectado', script: 'Se quiser, faço um mockup para você visualizar antes de decidir.' };
    }
    return { shouldTrigger: false, confidence: 0, reason: '', script: '' };
  }, [clientText, draftText]);
}
