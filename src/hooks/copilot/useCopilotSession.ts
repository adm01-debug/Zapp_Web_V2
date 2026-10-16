/**
 * CV-051–060 stub — implementação completa em CV-061+.
 * Define CopilotSessionState e useCopilotSession para satisfazer os imports
 * de RadarCards.tsx e RadarPanel.tsx durante o desenvolvimento.
 */

export type BrindeLetter = 'B' | 'R' | 'I' | 'N' | 'D' | 'E';

export interface Stakeholder {
  name: string;
  role?: string;
}

export interface CopilotSessionState {
  stage: string | null;
  temperature: number | null;
  brinde_state: Record<BrindeLetter, string | null>;
  decision_role: string | null;
  stakeholders: Stakeholder[];
}

/** Stub — retorna null até CV-061+ implementar a busca real. */
export function useCopilotSession(_conversationId?: string): CopilotSessionState | null {
  return null;
}
