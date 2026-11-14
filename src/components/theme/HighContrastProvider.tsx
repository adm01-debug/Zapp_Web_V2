/**
 * Estado global de acessibilidade (alto contraste, nível de contraste, movimento reduzido,
 * texto grande). Fica SEPARADO de `HighContrastToggle.tsx` de propósito: o provider é montado
 * no `AppProviders` (grafo do bundle inicial), enquanto os controles visuais (Dialog, Slider,
 * Switch, Tooltip do Radix) só aparecem no painel de acessibilidade da Sidebar. Com tudo no
 * mesmo arquivo, o import estático do provider puxava esses componentes para o first paint.
 * `HighContrastToggle.tsx` reexporta `HighContrastProvider` (os imports existentes do provider
 * continuam valendo); o contexto e o hook `useHighContrast` moram em `highContrastContext.ts`
 * (arquivo sem componente, para não quebrar o fast refresh).
 */
import { useState, useEffect } from 'react';
import { HighContrastContext } from './highContrastContext';
import { applyThemePreset, loadThemeConfig } from '@/components/settings/theme/presets';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';

/** Le a preferencia de contraste do sistema com seguranca (jsdom/SSR nao tem `matchMedia`).
 *  NAO e exportada de proposito: este arquivo exporta componentes e exportar uma funcao daqui
 *  quebra o fast refresh (react-refresh/only-export-components, apontado pelo lint ratchet). */
function preferenciaDoSistemaPorMaisContraste(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-contrast: more)').matches;
  } catch {
    return false;
  }
}

export function HighContrastProvider({ children }: { children: React.ReactNode }) {
  const [isHighContrast, setIsHighContrast] = useState(() => 
    safeGetItem('highContrast') === 'true'
  );
  const [contrastLevel, setContrastLevel] = useState(() => {
    // Valor inválido no storage (ausente, texto, "NaN") cai no padrão 100.
    const stored = Number.parseInt(safeGetItem('contrastLevel') ?? '', 10);
    return Number.isFinite(stored) ? stored : 100;
  });
  const [reducedMotion, setReducedMotion] = useState(() =>
    safeGetItem('reducedMotion') === 'true'
  );
  const [largeText, setLargeText] = useState(() =>
    safeGetItem('largeText') === 'true'
  );

  /**
   * O sistema operacional pede mais contraste? O CSS tem `@media (prefers-contrast: more)`, mas ela
   * e INERTE aqui: o preset escreve as cores *inline* no `<html>` (`presets.ts` — `style.setProperty`)
   * e variavel inline vence qualquer regra de folha de estilo. Medido em producao em 03/10:
   * emulando `prefers-contrast: more`, o `matchMedia` casa mas `--border` nao muda de valor.
   *
   * Por isso a preferencia do sistema e lida em JS e vira a MESMA classe que o toggle usa —
   * `.high-contrast`, cujo efeito e real porque o efeito logo abaixo reaplica a skin depois de mexer
   * na classe, o que limpa as vars inline que a venceriam.
   */
  const [prefereMaisContrasteNoSistema, setPrefereMaisContrasteNoSistema] = useState(
    preferenciaDoSistemaPorMaisContraste
  );
  const contrasteAtivo = isHighContrast || prefereMaisContrasteNoSistema;

  useEffect(() => {
    const root = document.documentElement;
    
    if (contrasteAtivo) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    safeSetItem('highContrast', String(isHighContrast));

    // Reaplica a skin depois de mexer na classe: ligar o alto contraste precisa LIMPAR as
    // vars de cor que o preset deixou inline no `<html>` (senão elas vencem a classe
    // `.high-contrast` e o modo não faz efeito); desligar precisa devolvê-las. Sem isto o
    // modo só passaria a valer na próxima troca de preset ou de modo de cor.
    const cfg = loadThemeConfig();
    applyThemePreset(cfg.preset, root.classList.contains('dark') ? 'dark' : 'light', {
      persistCache: false,
    });
  }, [contrasteAtivo, isHighContrast]);

  // Segue a preferencia do sistema enquanto a pagina estiver aberta: se o usuario ligar "mais
  // contraste" no sistema operacional (ou desligar), a classe acompanha sem precisar recarregar.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const consulta = window.matchMedia('(prefers-contrast: more)');
    const aoMudar = () => setPrefereMaisContrasteNoSistema(consulta.matches);
    aoMudar();
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--contrast-multiplier', String(contrastLevel / 100));
    safeSetItem('contrastLevel', String(contrastLevel));
  }, [contrastLevel]);

  useEffect(() => {
    if (reducedMotion) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
    safeSetItem('reducedMotion', String(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    if (largeText) {
      document.documentElement.classList.add('large-text');
    } else {
      document.documentElement.classList.remove('large-text');
    }
    safeSetItem('largeText', String(largeText));
  }, [largeText]);

  const toggleHighContrast = () => setIsHighContrast(prev => !prev);
  const toggleReducedMotion = () => setReducedMotion(prev => !prev);
  const toggleLargeText = () => setLargeText(prev => !prev);

  return (
    <HighContrastContext.Provider
      value={{
        isHighContrast,
        toggleHighContrast,
        contrastLevel,
        setContrastLevel,
        reducedMotion,
        toggleReducedMotion,
        setReducedMotion,
        largeText,
        toggleLargeText,
      }}
    >
      {children}
    </HighContrastContext.Provider>
  );
}
