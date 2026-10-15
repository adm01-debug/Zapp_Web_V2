/**
 * Realtime de `whatsapp_connections` num único lugar.
 *
 * Antes o gerente de conexões e a faixa de desconexão abriam cada um o SEU canal
 * com nome FIXO ('whatsapp-connections-changes' / 'disconnect-banner'). O
 * `supabase.channel(nome)` devolve o canal já existente quando o nome se repete
 * e, desde a realtime-js 2.101, `.on()` em canal já inscrito lança — duas telas
 * montando o mesmo hook derrubavam a tela; e o unmount de um consumidor chamava
 * `removeChannel`, cortando o realtime do outro.
 *
 * Aqui o tópico ganha sufixo aleatório por montagem (`uniqueRealtimeTopic`) e o
 * cleanup desfaz assinatura e canal. As callbacks do chamador ficam em ref,
 * então o canal é aberto UMA vez por montagem mesmo que o consumidor recrie a
 * função a cada render (é o caso de `fetchStatus`, na faixa).
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { log } from '@/lib/logger';
import { toast } from '@/hooks/ui/use-toast';

/** Linha de `whatsapp_connections` vista pelo realtime. */
export interface ConnectionRealtimeRow {
  id: string;
  name?: string;
  status?: string;
}

/** Evento do Postgres já reduzido ao que os consumidores usam. */
export interface ConnectionsChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Linha nova (INSERT/UPDATE). Cru do realtime; o chamador molda no seu tipo. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload do Postgres, sem tipo gerado
  new: Record<string, any>;
  /** Linha antiga (UPDATE/DELETE). Cru do realtime. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem
  old: Record<string, any>;
}

interface UseConnectionsRealtimeOptions {
  /** Chamado a cada evento da tabela (INSERT/UPDATE/DELETE). */
  onChange?: (payload: ConnectionsChange) => void;
}

export function useConnectionsRealtime({ onChange }: UseConnectionsRealtimeOptions = {}) {
  // Ref espelhada em useLayoutEffect (não no corpo do render, que pode ser
  // descartado em StrictMode/concurrent). Mantém o efeito com deps estáveis.
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Ids que já anunciaram "conectado" no episódio atual: marca ao conectar e
  // limpa ao sair do estado conectado, então uma reconexão posterior anuncia de
  // novo — mas o realtime e o polling de status (3s) da MESMA transição não
  // geram dois avisos.
  const conectadasRef = useRef<Set<string>>(new Set());

  const announceConnected = useCallback((conn: ConnectionRealtimeRow) => {
    if (conn.status !== 'connected') {
      conectadasRef.current.delete(conn.id);
      return;
    }
    if (conectadasRef.current.has(conn.id)) return;
    conectadasRef.current.add(conn.id);
    toast({ title: 'WhatsApp conectado!', description: 'A conexão está ativa e pronta para enviar mensagens.' });
  }, []);

  useEffect(() => {
    const canal = supabase
      .channel(uniqueRealtimeTopic('whatsapp-connections-changes'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_connections' },
        (payload) => {
          log.debug('Connection update:', payload);
          const evento = payload as unknown as ConnectionsChange;
          if (evento.eventType !== 'DELETE') announceConnected(evento.new as ConnectionRealtimeRow);
          onChangeRef.current?.(evento);
        }
      )
      .subscribe();

    return () => {
      // Saída em dois passos: cancelar a assinatura no servidor e remover o
      // canal do cliente. O `?.` cobre implementações de canal que só expõem
      // `.on().subscribe()`. Ambos são idempotentes entre si.
      void canal.unsubscribe?.();
      supabase.removeChannel(canal);
    };
  }, [announceConnected]);

  return { announceConnected };
}
