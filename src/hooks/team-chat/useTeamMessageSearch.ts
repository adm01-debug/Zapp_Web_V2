import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import type { TeamMessage } from './teamChatTypes';

const log = getLogger('useTeamMessageSearch');

/**
 * Busca de mensagens do Team Chat (E40 / SL-016).

 * Antes o painel filtrava em memória só a janela já carregada (~200 mensagens
 * mais novas): buscar uma palavra que só aparecia no histórico antigo devolvia
 * "Nenhuma mensagem encontrada" mesmo com a mensagem no banco. A consulta agora
 * vai ao servidor pela RPC `search_team_messages`, que confere a membership e
 * devolve o que casa em toda a conversa.
 */

/** Abaixo disso não vale consultar o servidor (termo curto casa com quase tudo). */
export const TEAM_MESSAGE_SEARCH_MIN_CHARS = 2;

/**
 * Teto da RPC no servidor (`LEAST(p_limit, 100)`). Pedimos o teto: se o retorno
 * chega cheio, o painel marca a contagem com "+" em vez de afirmar um total que
 * o servidor não devolveu.
 */
export const TEAM_MESSAGE_SEARCH_LIMIT = 100;

/** Linha devolvida pela RPC `search_team_messages` (sem mídia/edição). */
type TeamMessageSearchRow = {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  sender_name: string | null;
};

function toTeamMessage(row: TeamMessageSearchRow, conversationId: string): TeamMessage {
  return {
    id: row.id,
    conversation_id: conversationId,
    sender_id: row.sender_id,
    content: row.content ?? '',
    message_type: 'text',
    media_url: null,
    media_type: null,
    reply_to_id: null,
    is_edited: false,
    created_at: row.created_at,
    updated_at: row.created_at,
    sender: row.sender_id
      ? { id: row.sender_id, name: row.sender_name ?? '', avatar_url: null }
      : undefined,
  };
}

export interface TeamMessageSearch {
  /** `null` enquanto a resposta do termo atual não chegou (ou não deu erro). */
  results: TeamMessage[] | null;
  isSearching: boolean;
  isError: boolean;
  /** O servidor devolveu o teto: pode haver mais casamentos antigos. */
  isCapped: boolean;
  /** Repete a última busca (botão "Tentar novamente" do estado de erro). */
  retry: () => void;
}

export function useTeamMessageSearch(
  conversationId: string | null,
  term: string,
  enabled: boolean,
): TeamMessageSearch {
  const [results, setResults] = useState<TeamMessage[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Desligado, o hook não devolve estado nenhum (ver o retorno derivado
    // abaixo) — sem isto, limpar o resultado aqui seria setState sincrono no
    // efeito e render em cascata.
    if (!enabled || !conversationId) return;

    let cancelado = false;
    // O "buscando" sobe junto com o pedido, ANTES do await: é o estado que o
    // painel mostra enquanto a RPC não volta (o resultado vem no `run` abaixo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSearching(true);
    setIsError(false);

    const run = async () => {
      const { data, error } = await supabase.rpc('search_team_messages', {
        p_conversation_id: conversationId,
        p_query: term,
        p_limit: TEAM_MESSAGE_SEARCH_LIMIT,
      });

      // Resposta velha: o termo/conversa já trocaram, então este lote não pode
      // mexer no resultado, no erro nem no "buscando" do pedido atual. Sem isso
      // uma resposta atrasada sobrescrevia a busca nova e prendia o loading.
      if (cancelado) return;

      if (error) {
        log.error('Falha na busca de mensagens', error);
        setResults(null);
        setIsError(true);
        setIsSearching(false);
        return;
      }

      // A RPC devolve DESC (mais novas primeiro); o painel desenha ASC.
      const rows = (data ?? []) as TeamMessageSearchRow[];
      setResults(rows.map(row => toTeamMessage(row, conversationId)).reverse());
      setIsSearching(false);
    };

    void run();
    return () => { cancelado = true; };
  }, [conversationId, term, enabled, attempt]);

  const retry = useCallback(() => setAttempt(prev => prev + 1), []);

  // Com a busca desligada (painel fechado, termo curto, sem conversa) nada é
  // exposto: o resultado guardado é de outro termo e não pode vazar para a lista.
  const ativo = enabled && !!conversationId;
  const visiveis = ativo ? results : null;
  return {
    results: visiveis,
    isSearching: ativo && isSearching,
    isError: ativo && isError,
    isCapped: (visiveis?.length ?? 0) >= TEAM_MESSAGE_SEARCH_LIMIT,
    retry,
  };
}
