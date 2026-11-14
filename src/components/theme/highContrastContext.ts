/**
 * Contexto e hook do estado de acessibilidade (alto contraste, movimento reduzido, texto
 * grande). Arquivo `.ts` sem componente de propósito: o provider fica em
 * `HighContrastProvider.tsx` e os controles visuais em `HighContrastToggle.tsx`; exportar o
 * hook de um arquivo de componente quebraria o fast refresh (react-refresh/only-export-components).
 */
import { createContext, useContext } from 'react';

export interface HighContrastContextType {
  isHighContrast: boolean;
  toggleHighContrast: () => void;
  contrastLevel: number;
  setContrastLevel: (level: number) => void;
  /** Preferência do usuário para movimento reduzido — FONTE ÚNICA também lida pelas
   *  transições de rota (`useTransitionPreferences`); ver R2-INF-037. */
  reducedMotion: boolean;
  toggleReducedMotion: () => void;
  /** Escrita explícita da MESMA preferência (o controle usa `toggleReducedMotion`). */
  setReducedMotion: (value: boolean) => void;
  largeText: boolean;
  toggleLargeText: () => void;
}

export const HighContrastContext = createContext<HighContrastContextType | null>(null);

export function useHighContrast() {
  const context = useContext(HighContrastContext);
  if (!context) {
    throw new Error('useHighContrast must be used within HighContrastProvider');
  }
  return context;
}
