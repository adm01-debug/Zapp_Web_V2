/**
 * CV-073 — Battlecard de concorrente.
 *
 * Detecta menção a concorrente e retorna card com diferenciadores.
 */
import { useMemo } from 'react';

export interface BattleCardPoint {
  category: 'qualidade' | 'prazo' | 'personalização' | 'atendimento' | 'preço';
  advantage: string;
  proof: string;
}

export interface BattleCardResult {
  detected: boolean;
  competitorMentioned: string | null;
  points: BattleCardPoint[];
}

const COMPETITOR_PATTERNS = [
  /concorrente/i, /outro fornecedor/i, /outra empresa/i, /cotei em/i, /pesquisei/i,
  /alibaba/i, /aliexpress/i, /mercado livre/i,
];

const STANDARD_BATTLE_POINTS: BattleCardPoint[] = [
  { category: 'qualidade', advantage: 'Material importado com laudo de qualidade', proof: 'Amostras físicas disponíveis antes do pedido' },
  { category: 'prazo', advantage: 'Prazo confirmado por escrito', proof: 'Histórico de 98% de entregas no prazo' },
  { category: 'personalização', advantage: 'Arte grátis incluída + prova digital antes de produzir', proof: 'Equipe interna de design' },
  { category: 'atendimento', advantage: 'Atendimento direto sem intermediário', proof: 'WhatsApp dedicado, resposta em até 2h úteis' },
  { category: 'preço', advantage: 'Preço final sem surpresas (frete e arte incluídos)', proof: 'Proposta itemizada e transparente' },
];

export function useBattleCard({ clientText }: { clientText: string }): BattleCardResult {
  return useMemo(() => {
    if (!clientText) return { detected: false, competitorMentioned: null, points: [] };
    const lower = clientText.toLowerCase();
    const matched = COMPETITOR_PATTERNS.find((p) => p.test(lower));
    if (!matched) return { detected: false, competitorMentioned: null, points: [] };
    const mention = lower.match(/cotei em (.+?)[,. ]/)?.[1] ?? null;
    return { detected: true, competitorMentioned: mention, points: STANDARD_BATTLE_POINTS };
  }, [clientText]);
}
