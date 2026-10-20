import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

type Ouvinte = (contactId: string) => void;

/**
 * Aviso local (mesma origem, sem rede) de que um sussurro foi gravado. Serve à
 * reconsulta na MESMA aba — quem está em OUTRA sessão é avisado pela assinatura
 * de realtime abaixo. Como o contador exclui as notas do próprio usuário, gravar
 * pelo compositor normalmente NÃO muda o número dele; o aviso só garante que o
 * valor exibido seja reconsultado em vez de esperar o `staleTime`.
 */
const ouvintes = new Set<Ouvinte>();

export function notificarSussurroEnviado(contactId: string): void {
  ouvintes.forEach((ouvinte) => ouvinte(contactId));
}

/** Chave da consulta do contador — o marcar-como-lido invalida exatamente esta chave. */
export const whisperCountKey = (
  contactId: string | null | undefined,
  profileId: string | null | undefined,
) => ['whisper-count', contactId, profileId] as const;

/**
 * Conta só o que ESTE usuário precisa ler: sussurros endereçados a ele
 * (`target_agent_id`) e ainda não lidos. O `neq` em `sender_id` é obrigatório
 * porque a RLS de SELECT também deixa o REMETENTE ver a própria nota — sem ele,
 * quem escreveu o sussurro acenderia o próprio selo. A consulta é
 * `count`/`head`, sem trazer conteúdo nenhum para o cliente.
 */
async function contarSussurrosNaoLidos(contactId: string, profileId: string): Promise<number> {
  const { count, error } = await supabase
    .from('whisper_messages')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .eq('target_agent_id', profileId)
    .eq('is_read', false)
    .neq('sender_id', profileId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Contador de sussurros não lidos da conversa, para o selo do cabeçalho.
 *
 * A fonte é o BANCO (cache do react-query), não a lista do painel: a lista é
 * capada em 20 linhas e inclui as notas escritas por quem está olhando, então
 * somar `!is_read` nela errava para mais (era o defeito).
 *
 * Se a leitura falhar, o cache mantém o último valor bom (o selo não zera nem
 * inventa número). Trocar de conversa troca a chave da consulta: a contagem da
 * anterior não aparece na nova enquanto ela carrega.
 */
export function useWhisperCount(contactId: string | null | undefined) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: whisperCountKey(contactId, profileId),
    queryFn: () => contarSussurrosNaoLidos(contactId as string, profileId as string),
    enabled: Boolean(contactId) && Boolean(profileId),
    staleTime: 15_000,
  });

  // `whisper_messages` voltou à publicação de realtime (migration 20260828190000):
  // o selo do destinatário atualiza sozinho, sem refresh da página.
  useEffect(() => {
    if (!contactId || !profileId) return;
    const canal = supabase
      .channel(uniqueRealtimeTopic(`whisper-count-${contactId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whisper_messages', filter: `contact_id=eq.${contactId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: whisperCountKey(contactId, profileId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [contactId, profileId, queryClient]);

  useEffect(() => {
    if (!contactId || !profileId) return;
    const ouvinte: Ouvinte = (id) => {
      if (id !== contactId) return;
      void queryClient.invalidateQueries({ queryKey: whisperCountKey(contactId, profileId) });
    };
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  }, [contactId, profileId, queryClient]);

  return typeof query.data === 'number' ? query.data : 0;
}
