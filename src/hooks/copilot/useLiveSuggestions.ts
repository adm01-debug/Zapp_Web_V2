/**
 * CV-051–060 stub — implementação completa em CV-061+.
 * Define LiveSuggestion e useLiveSuggestions para satisfazer os imports
 * de RadarCards.tsx e RadarPanel.tsx durante o desenvolvimento.
 */

export interface LiveSuggestion {
  id: string;
  text: string;
  confidence?: number;
}

/** Stub — retorna array vazio até CV-061+ implementar a busca real. */
export function useLiveSuggestions(_conversationId?: string): LiveSuggestion[] {
  return [];
}
