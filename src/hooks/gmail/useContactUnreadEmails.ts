import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

/**
 * Contagem de e-mails RECEBIDOS e ainda NÃO LIDOS de UM contato (etapa U02 do
 * PLANO_EMAIL_ALERTAS_NAO_LIDO_12_ETAPAS_2026-10-07).
 *
 * A fonte é o BANCO, não a lista carregada: `email_messages` com `is_read = false`
 * e `direction = 'inbound'` das conversas (`email_threads`) do contato. A junção
 * embutida usa `!inner` e o filtro da coluna embutida (`email_threads.contact_id`),
 * então o servidor devolve só as mensagens do contato e a contagem é exata
 * (`count: 'exact', head: true`, sem trazer linha nenhuma).
 *
 * A junção existe no type gerado: `email_messages_thread_id_fkey` → `email_threads`
 * (`src/integrations/supabase/types.ts`, Relationships de `email_messages`).
 * Mesmo caminho do `useContactMediaCounts` (etapa 42) e `useQueueAnalytics`.
 *
 * RLS protege a leitura (nunca service role). `email_threads` está na publicação de
 * tempo real com REPLICA IDENTITY FULL e todo e-mail novo passa por upsert/update da
 * conversa (inclusive `contact_id`), então o canal por `contact_id` cobre chegada e leitura.
 *
 * D06 do plano: e-mail de conversa SEM `contact_id` não entra na contagem do contato.
 */

export type ContactUnreadEmailsStatus = 'idle' | 'loading' | 'ok' | 'erro';

export interface ContactUnreadEmailsResult {
  count: number;
  status: ContactUnreadEmailsStatus;
}

/** Debounce da recontagem disparada pelo tempo real (rajada de UPDATEs = 1 consulta). */
export const UNREAD_EMAILS_DEBOUNCE_MS = 500;

/**
 * Estado guardado junto do contato a que pertence. É o que impede a contagem de um
 * contato de aparecer para outro: só é apresentado quando a chave bate com o contato ativo.
 */
interface Snapshot {
  contactId: string | null;
  count: number;
  status: ContactUnreadEmailsStatus;
}

const ESTADO_INICIAL: Snapshot = { contactId: null, count: 0, status: 'idle' };

/**
 * Contagem exata dos e-mails não lidos recebidos de um contato.
 * Lança apenas quando o banco devolve `error`: RLS filtra sem avisar, então sem `error`
 * zero linhas é resposta legítima (e não falha).
 */
export async function countContactUnreadEmails(contactId: string): Promise<number> {
  const { count, error } = await supabase
    .from('email_messages')
    .select('id, email_threads!inner(contact_id)', { count: 'exact', head: true })
    .eq('is_read', false)
    .eq('direction', 'inbound')
    .eq('email_threads.contact_id', contactId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * `useContactUnreadEmails(contactId)` → `{ count, status }`.
 *
 * - `contactId` vazio (`null`/`undefined`/`''`) → `{ count: 0, status: 'idle' }`, sem consulta e sem canal.
 * - Troca de contato: a resposta da consulta em voo do contato anterior é descartada
 *   (a referência do contato ativo é revalidada depois do `await`) e o canal antigo é removido.
 * - Tempo real: canal em `email_threads` filtrado por `contact_id`, recontagem com debounce de
 *   500 ms; a recontagem NÃO faz a contagem vigente piscar para `loading`.
 * - Erro de consulta → `{ count: 0, status: 'erro' }`; a função nunca lança.
 */
export function useContactUnreadEmails(
  contactId: string | null | undefined,
): ContactUnreadEmailsResult {
  const contatoAtivo = contactId ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot>(ESTADO_INICIAL);

  // Contato ativo em referência: a resposta de uma consulta só escreve se ainda for do
  // contato ativo. A referência é atualizada no efeito (nunca no render); a janela entre
  // o render e o efeito não fica visível, porque o contato novo apresenta 'loading' até
  // a resposta DELE chegar.
  const contatoAtivoRef = useRef(contatoAtivo);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contar = useCallback(async (id: string) => {
    let count = 0;
    let status: ContactUnreadEmailsStatus = 'ok';
    try {
      count = await countContactUnreadEmails(id);
    } catch {
      // Erro de consulta vira estado, nunca exceção.
      count = 0;
      status = 'erro';
    }

    // Resposta obsoleta: o contato mudou enquanto a consulta corria. Sai sem escrever
    // nada — o estado do contato atual é responsabilidade da consulta dele.
    if (contatoAtivoRef.current !== id) return;
    setSnapshot({ contactId: id, count, status });
  }, []);

  useEffect(() => {
    contatoAtivoRef.current = contatoAtivo;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!contatoAtivo) return;

    void contar(contatoAtivo);

    const channel = supabase
      .channel(uniqueRealtimeTopic(`email-nao-lidos:${contatoAtivo}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'email_threads',
          filter: `contact_id=eq.${contatoAtivo}`,
        },
        (payload) => {
          const novo = payload.new as { contact_id?: string | null } | null;
          const antigo = payload.old as { contact_id?: string | null } | null;
          const contatoDoEvento = novo?.contact_id ?? antigo?.contact_id ?? null;
          // Escopo: evento de conversa de outro contato (ou sem contato) não mexe aqui.
          if (contatoDoEvento !== contatoAtivo) return;

          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            void contar(contatoAtivo);
          }, UNREAD_EMAILS_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [contatoAtivo, contar]);

  // O snapshot só é apresentado quando é do contato ativo; enquanto não for, o valor do
  // contato atual é carregando (nunca a contagem do contato anterior).
  if (snapshot.contactId === contatoAtivo) {
    return { count: snapshot.count, status: snapshot.status };
  }
  return contatoAtivo ? { count: 0, status: 'loading' } : { count: 0, status: 'idle' };
}
