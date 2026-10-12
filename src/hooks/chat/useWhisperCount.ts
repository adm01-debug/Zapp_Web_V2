import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

type Ouvinte = (contactId: string) => void;

/**
 * Aviso local (mesma origem, sem rede) de que um sussurro novo foi gravado. O
 * `whisper_messages` NÃO está na publicação de realtime (migration 20260401002035
 * o removeu), então o selo do cabeçalho não recebe o evento por websocket: este
 * barramento leve é o caminho de atualização do contador para quem está com a
 * mesma conversa aberta.
 */
const ouvintes = new Set<Ouvinte>();

export function notificarSussurroEnviado(contactId: string): void {
  ouvintes.forEach((ouvinte) => ouvinte(contactId));
}

interface EstadoContagem {
  contactId: string | null;
  count: number;
}

/**
 * Contador de sussurros da conversa, para o selo do cabeçalho. Conta as linhas que
 * a RLS já deixa visíveis (enviadas por mim ou endereçadas a mim) — a consulta é
 * `count`/`head`, sem trazer conteúdo nenhum para o cliente. O valor carregado é
 * marcado com o contato de origem: trocar de conversa não mostra a contagem da
 * anterior enquanto a nova carrega.
 */
export function useWhisperCount(contactId: string | null | undefined) {
  const [estado, setEstado] = useState<EstadoContagem>({ contactId: null, count: 0 });

  useEffect(() => {
    if (!contactId) return;
    let cancelado = false;

    const carregar = async () => {
      const { count, error } = await supabase
        .from('whisper_messages')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId);
      if (cancelado) return;
      if (error) {
        log.error('Failed to count whispers:', error);
        return;
      }
      setEstado({ contactId, count: count ?? 0 });
    };

    void carregar();

    const ouvinte: Ouvinte = (id) => {
      if (id === contactId) void carregar();
    };
    ouvintes.add(ouvinte);
    return () => {
      cancelado = true;
      ouvintes.delete(ouvinte);
    };
  }, [contactId]);

  return estado.contactId === (contactId ?? null) ? estado.count : 0;
}
