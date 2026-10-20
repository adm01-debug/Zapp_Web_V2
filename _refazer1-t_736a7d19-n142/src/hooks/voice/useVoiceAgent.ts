import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { VoiceAgentAction } from './types';
import { planVoiceAction, type VoiceActionLevel } from './voiceActionPlan';

/**
 * A nota do som de voz é por natureza compartilhada; mapear por uma tabela evita
 * indexar `toast[level]` (que depende do overload exato do sonner).
 */
const NOTIFY: Record<VoiceActionLevel, (message: string) => void> = {
  success: toast.success,
  info: toast.info,
  warning: toast.warning,
};

/**
 * Ponte do assistente de voz para o estado real da view (R2-INB-046 / item 340).
 *
 * Antes esta ponte só navegava e mostrava `toast`: a busca, os filtros, a
 * ordenação e a limpeza eram ANUNCIADOS sem mudar o que a lista mostrava. Agora
 * cada ação vira um plano (`voiceActionPlan`) aplicado à query string — o mesmo
 * estado que as listas leem — e o operador só ouve/ê a confirmação do resultado
 * efetivo (inclusive a indisponibilidade, quando não há o que aplicar).
 *
 * `useSearchParams` (e não `window.history` cru) é de propósito: é o setter que
 * o `useUrlFilters`/inbox já usa, então a lista reage à mudança sem precisar
 * remontar.
 */
export function useVoiceAgent(onViewChange: (viewId: string) => void) {
  const [, setSearchParams] = useSearchParams();

  const handleVoiceAction = useCallback((action: VoiceAgentAction) => {
    const plan = planVoiceAction(action, new URLSearchParams(window.location.search));

    if (Object.keys(plan.params).length > 0) {
      // Base na URL real (não na do router) para preservar `?view=` e params
      // gravados por outros donos da URL (ex.: `type` de useInboxFilters).
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(plan.params)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      setSearchParams(next, { replace: true });
    }

    if (plan.view) onViewChange(plan.view);
    if (plan.message) NOTIFY[plan.level](plan.message);
  }, [onViewChange, setSearchParams]);

  return { handleVoiceAction };
}
