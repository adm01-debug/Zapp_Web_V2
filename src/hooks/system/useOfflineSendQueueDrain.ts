import { useEffect } from 'react';

import { useAuth } from '@/hooks/auth/useAuth';
import { drainOfflineSendQueue } from '@/services/outbound-message.service';

/**
 * Drenagem da fila offline na ABERTURA do app (SL-070 · item 025).
 *
 * O evento `online` sozinho não cobre o cenário do usuário que compõe offline,
 * FECHA a aba e reabre já com rede: nenhum `online` dispara e a mensagem fica
 * parada no IndexedDB até a próxima queda/volta de rede (ou para sempre).
 *
 * A fila é POR USUÁRIO: o efeito só drena quando há sessão autenticada — nunca
 * antes do login, nem depois do logout. A checagem de rede e o dedupe ficam na
 * própria fila (`drainOfflineQueueOnOpen`/`drain`): offline não é tentativa
 * perdida e a chave estável `clientMessageId` impede entrega dupla.
 *
 * Não agenda retry nem guarda estado: a mensagem que falhar continua na fila (o
 * aviso sai por `console.warn`) e a drenagem de reconexão ou a próxima abertura
 * tenta de novo.
 */
export function useOfflineSendQueueDrain(): void {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    void drainOfflineSendQueue();
  }, [userId]);
}
