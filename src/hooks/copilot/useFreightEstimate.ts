/**
 * CV-087 — Estimativa de frete por estado.
 *
 * Fornece estimativa de frete por região para orientar o vendedor durante a conversa.
 */
import { useMemo } from 'react';

export interface FreightEstimateResult {
  available: boolean;
  region: string | null;
  estimatedRange: string;
  note: string;
}

const REGION_FREIGHT: Record<string, { range: string; note: string }> = {
  SP: { range: 'R$ 0 – R$ 30', note: 'Frete express disponível para Grande SP' },
  RJ: { range: 'R$ 40 – R$ 80', note: 'Prazo estimado: 2–3 dias úteis' },
  MG: { range: 'R$ 35 – R$ 70', note: 'Prazo estimado: 2–3 dias úteis' },
  Sul: { range: 'R$ 60 – R$ 120', note: 'PR, SC, RS — prazo 3–5 dias' },
  Centro: { range: 'R$ 50 – R$ 100', note: 'DF, GO, MS, MT — prazo 3–4 dias' },
  Norte: { range: 'R$ 100 – R$ 200', note: 'AM, PA e demais — prazo 5–8 dias' },
  Nordeste: { range: 'R$ 80 – R$ 150', note: 'Prazo 4–6 dias úteis' },
};

const STATE_TO_REGION: Record<string, string> = {
  SP: 'SP', RJ: 'RJ', MG: 'MG', ES: 'RJ',
  PR: 'Sul', SC: 'Sul', RS: 'Sul',
  DF: 'Centro', GO: 'Centro', MS: 'Centro', MT: 'Centro',
  AM: 'Norte', PA: 'Norte', AC: 'Norte', RO: 'Norte', RR: 'Norte', AP: 'Norte', TO: 'Norte',
  BA: 'Nordeste', CE: 'Nordeste', PE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste',
  RN: 'Nordeste', AL: 'Nordeste', SE: 'Nordeste', PI: 'Nordeste',
};

export function useFreightEstimate({ stateCode }: { stateCode: string | null }): FreightEstimateResult {
  return useMemo(() => {
    if (!stateCode) return { available: false, region: null, estimatedRange: '', note: 'Informe o estado para estimar o frete.' };
    const region = STATE_TO_REGION[stateCode.toUpperCase()];
    if (!region) return { available: false, region: null, estimatedRange: '', note: 'Estado não reconhecido.' };
    const data = REGION_FREIGHT[region];
    return { available: true, region, estimatedRange: data.range, note: data.note };
  }, [stateCode]);
}
