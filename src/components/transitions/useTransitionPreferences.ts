import { useEffect, useState } from 'react';
import { useHighContrast } from '@/components/theme/HighContrastToggle';

export interface TransitionPreferences {
  enabled: boolean;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
}

/**
 * Preferência de movimento reduzido usada pelas transições de rota.
 *
 * R2-INF-037: as transições liam uma chave PRÓPRIA (`zapp:reduce-motion`) que nenhum
 * controle escrevia. O "Reduzir Movimento" do painel de Acessibilidade grava
 * `reducedMotion` (e liga a classe `reduced-motion` no <html>), então o usuário ligava a
 * opção e o `RouteTransition` continuava escolhendo slide/zoom/fade. Agora existe UMA
 * fonte de preferência de usuário — o contexto global de acessibilidade, o mesmo que a
 * tela mostra — combinada com a preferência do sistema (`prefers-reduced-motion`).
 *
 * Por isso este hook depende do `HighContrastProvider`: no app ele envolve tudo
 * (`AppProviders` → `AppRoutes` → `PageTransitionProvider`), e é o que garante que ligar
 * ou desligar a opção já troque a variante, sem recarga.
 */
export function useTransitionPreferences(): TransitionPreferences {
  const { reducedMotion: userReducedMotion, setReducedMotion } = useHighContrast();
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const reducedMotion = systemReduced || userReducedMotion;

  return {
    enabled: !reducedMotion,
    reducedMotion,
    setReducedMotion,
  };
}
