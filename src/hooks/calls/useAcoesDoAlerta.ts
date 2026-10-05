/**
 * R2-CALL-007 — encaminha a ação do alerta de chamada pelo CANAL da notificação.
 *
 * Antes: `IncomingCallAlert` chamava direto `accept()`/`reject()` do
 * `CallSessionProvider`, que fala sempre com o SIP, sem canal e sem identidade.
 * Uma notificação de WhatsApp B mexia na sessão SIP A e nunca rodava o contrato
 * local daquele canal (`WhatsAppCallAdapter`, T24).
 *
 * Agora: o canal decide o executor (`src/lib/calls/acaoDoAlerta.ts`).
 *  - WhatsApp → adapter do canal (grava o desfecho em `calls` + abre a conversa);
 *    NENHUM comando SIP sai daqui;
 *  - VoIP → a máquina da sessão, como sempre foi.
 *
 * O resultado diz se a operação ALVO teve desfecho válido — quem consome (o
 * alerta) só abre o estado "atendido" com `ok: true`.
 */

import { useCallback, useMemo } from 'react';
import { useCallSession } from '@/providers/CallSessionProvider';
import { WhatsAppCallAdapter } from '@/lib/calls/WhatsAppCallAdapter';
import { upsertMyCall } from '@/lib/calls/persistence';
import { openContactChat } from '@/components/catalog/useSendProduct';
import { alvoDoWhatsApp, canalDaNotificacao, executorDaAcao } from '@/lib/calls/acaoDoAlerta';
import type { CallChannel } from '@/lib/calls/callStatus';
import type { IncomingCall } from '@/hooks/communication/useIncomingCallListener';

/** Desfecho da ação do alerta: `ok` = a operação do canal alvo foi validada. */
export interface ResultadoDaAcao {
  ok: boolean;
  /** Canal que de fato executou a ação. */
  canal: CallChannel;
  /** Mensagem ao agente (hoje só o `accept` do WhatsApp tem uma). */
  mensagem?: string;
}

export function useAcoesDoAlerta(): {
  atender: (notificacao: IncomingCall | null) => Promise<ResultadoDaAcao>;
  ignorar: (notificacao: IncomingCall | null) => Promise<ResultadoDaAcao>;
} {
  const { accept, reject } = useCallSession();
  // As portas de I/O do canal WhatsApp: persistência idempotente da chamada e a
  // abertura da conversa no inbox (`openContactChat`, o mesmo caminho do T24).
  const adapter = useMemo(
    () => new WhatsAppCallAdapter({ abrirConversa: openContactChat, persistir: upsertMyCall }),
    [],
  );

  const atender = useCallback(
    async (notificacao: IncomingCall | null): Promise<ResultadoDaAcao> => {
      const canal = canalDaNotificacao(notificacao?.whatsapp_connection_id);
      if (!notificacao) return { ok: false, canal };

      if (executorDaAcao(canal) === 'whatsapp') {
        const alvo = alvoDoWhatsApp(notificacao);
        // Sem identidade da notificação não existe operação alvo: não se atende
        // a sessão corrente no lugar dela.
        if (!alvo) return { ok: false, canal };
        const { mensagem, persistencia } = await adapter.accept({
          callId: alvo.callId,
          contactId: alvo.contactId,
          phone: notificacao.contact_phone,
          name: notificacao.contact_name,
        });
        return { ok: persistencia.ok, canal, mensagem };
      }

      await accept();
      return { ok: true, canal };
    },
    [accept, adapter],
  );

  const ignorar = useCallback(
    async (notificacao: IncomingCall | null): Promise<ResultadoDaAcao> => {
      const canal = canalDaNotificacao(notificacao?.whatsapp_connection_id);
      if (!notificacao) return { ok: false, canal };

      if (executorDaAcao(canal) === 'whatsapp') {
        const alvo = alvoDoWhatsApp(notificacao);
        if (!alvo) return { ok: false, canal };
        const { persistencia } = await adapter.reject({
          callId: alvo.callId,
          contactId: alvo.contactId,
          phone: notificacao.contact_phone,
          name: notificacao.contact_name,
        });
        return { ok: persistencia.ok, canal };
      }

      await reject();
      return { ok: true, canal };
    },
    [adapter, reject],
  );

  return { atender, ignorar };
}
