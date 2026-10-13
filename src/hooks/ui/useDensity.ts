import { useState, useEffect, useCallback, useRef } from 'react';
import { getUiPreferences, setUiPreference, useUiPreferences } from './useUiPreferences';

export type DensityMode = 'comfortable' | 'compact' | 'dense';

const STORAGE_KEY = 'ui-density';

const ORDEM_DENSIDADE: DensityMode[] = ['comfortable', 'compact', 'dense'];

/** Cache local (boot offline) — o servidor vence quando há sessão. */
function lerDensidadeLocal(): DensityMode {
  try {
    return (localStorage.getItem(STORAGE_KEY) as DensityMode) || 'comfortable';
  } catch {
    return 'comfortable';
  }
}

function normalizarDensidade(valor: unknown): DensityMode | null {
  return valor === 'comfortable' || valor === 'compact' || valor === 'dense' ? valor : null;
}

export function useDensity() {
  const { serverPrefs, ready } = useUiPreferences();
  // R2-PREF-001: a densidade confirmada na conta (`user_ui_preferences.density`)
  // vence o cache do navegador; sem ela, cai no localStorage de sempre. A adoção
  // usa `serverPrefs` (nunca a cópia com escrita local pendente).
  const densidadeDoServidor = normalizarDensidade(serverPrefs?.density);
  const [density, setDensityState] = useState<DensityMode>(
    () => normalizarDensidade(getUiPreferences().density) ?? lerDensidadeLocal(),
  );

  // Só adota o valor do servidor se o usuário não mexeu na densidade nesta aba
  // (uma resposta atrasada não pode desfazer o que ele acabou de escolher).
  const densidadeTocadaRef = useRef(false);
  useEffect(() => {
    if (!ready || densidadeTocadaRef.current || !densidadeDoServidor) return;
    setDensityState(prev => (prev === densidadeDoServidor ? prev : densidadeDoServidor));
  }, [ready, densidadeDoServidor]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    try {
      localStorage.setItem(STORAGE_KEY, density);
    } catch { /* storage unavailable */ }
  }, [density]);

  const setDensity = useCallback((mode: DensityMode) => {
    densidadeTocadaRef.current = true;
    setDensityState(mode);
    // R2-PREF-001: além do cache local, a escolha vai para a conta do usuário.
    setUiPreference('density', mode);
  }, []);

  const cycleDensity = useCallback(() => {
    densidadeTocadaRef.current = true;
    const next = ORDEM_DENSIDADE[(ORDEM_DENSIDADE.indexOf(density) + 1) % ORDEM_DENSIDADE.length];
    setDensityState(next);
    setUiPreference('density', next);
  }, [density]);

  return { density, setDensity, cycleDensity };
}
