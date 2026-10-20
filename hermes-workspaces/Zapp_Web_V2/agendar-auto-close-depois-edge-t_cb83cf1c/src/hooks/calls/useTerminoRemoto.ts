import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { eventoDeFim, useCallSession } from '@/providers/CallSessionProvider';
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
 *
 * R2-CALL-008 (#283): a regra pura rejeita payload de outro ID, mas o hook nao
 * comparava o id OBSERVADO ao `sessionId` da sessao em curso — o alerta de B
 * despachava no estado global e encerrava a sessao A. E o evento cru
 * (`HANGUP_REMOTE`) e invalido em `ringing_in`: com a propria chamada ainda
 * tocando, o desfecho terminal era engolido (warn) e o alerta ficava preso.
 * Agora o hook so age quando o id observado E a identidade da sessao atual, e o
 * evento e escolhido pela MESMA regra do resto do provider (`eventoDeFim`).
 */
export function useTerminoRemoto(callIdEmCurso: string | null | undefined): void {
  const { dispatch, session } = useCallSession();

  // Espelho da sessao para o callback ler o estado ATUAL sem reassinar o canal a
  // cada evento (o estado muda a cada transicao; o id observado, nao).
  const sessaoRef = useRef(session);
  useEffect(() => {
    sessaoRef.current = session;
  }, [session]);

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
          if (!terminoRemotoDaChamada(linha, callIdEmCurso)) return;
          const atual = sessaoRef.current;
          // Identidade: so a MESMA chamada observada pode encerrar a sessao em
          // curso. O desfecho de outra chamada (nem o de uma aba sem sessao)
          // nao pode mexer no estado global.
          if (atual.sessionId !== callIdEmCurso) return;
          // Evento terminal VALIDO para o estado atual (mesma tabela do
          // provider): `active` → HANGUP_REMOTE, `ringing_in` → CANCEL_REMOTE.
          // Sessao ja encerrada/ociosa devolve `null` — nada a despachar.
          const evento = eventoDeFim({ endedBy: 'hangup_remote', sipCode: null }, atual.status);
          if (evento !== null) dispatch(evento);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [callIdEmCurso, dispatch]);
}
