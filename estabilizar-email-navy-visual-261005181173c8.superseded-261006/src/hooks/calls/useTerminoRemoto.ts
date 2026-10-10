import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCallSession } from '@/providers/CallSessionProvider';
import { terminoRemotoDaChamada, type LinhaDeChamadaRealtime } from '@/lib/calls/terminoRemoto';

/**
 * Assina a chamada em curso em `public.calls` e encerra a sessao quando o outro
 * lado desliga (etapa T28). Sem isto, uma chamada encerrada no aparelho deixaria o
 * alerta tocando para sempre — o listener entrega a chamada, mas nao sabe que ela
 * acabou.
 *
 * Divergencia registrada do plano: ele pede filtro `agent_id=eq.<meu perfil>`. Aqui o
 * filtro e `id=eq.<callId em curso>`, que e o que a regra decide (so a MESMA chamada
 * encerra a sessao) e nao depende de resolver o id de perfil. A regra pura continua
 * rejeitando qualquer linha que nao seja a da sessao.
 */
export function useTerminoRemoto(callIdEmCurso: string | null | undefined): void {
  const { dispatch } = useCallSession();

  useEffect(() => {
    if (!callIdEmCurso) return;

    const canal = supabase
      .channel(`termino-remoto-${callIdEmCurso}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${callIdEmCurso}`,
        },
        (payload) => {
          const linha = payload.new as LinhaDeChamadaRealtime;
          if (terminoRemotoDaChamada(linha, callIdEmCurso)) {
            dispatch({ type: 'HANGUP_REMOTE' });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [callIdEmCurso, dispatch]);
}
