import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import type { ConversationContact, ConversationStatus } from '@/types/chat';

const VIP_TAG = 'VIP';
const BLOCKED_TAG = 'Bloqueado';

// Caixa não diferencia: 'vip' e 'VIP' são a mesma tag (decisão do cartão #241;
// a leitura canônica em VirtualizedRealtimeList/ChatPanelHeader usa o mesmo
// case-insensitive).
const hasTag = (tags: string[], tag: string) =>
  tags.some((t) => t.toLowerCase() === tag.toLowerCase());
const withoutTag = (tags: string[], tag: string) =>
  tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());

/**
 * Ações rápidas do painel "Detalhes do Contato" (#241): cada ação faz UMA
 * escrita em `contacts` e o estado local só muda depois do `error` nulo.
 * Erro do banco vira `toast.error` sem Desfazer; o Desfazer executa a
 * escrita reversa real (não outro toast).
 *
 * - VIP / Bloquear → tag canônica em `contacts.tags` (idempotente por caixa);
 * - Arquivar → `conversation_status = 'archived'` (a fila já exclui archived);
 * - Tags do painel → add/remove em `contacts.tags` preservando as existentes.
 */
export function useContactQuickActions(contact: ConversationContact) {
  const [local, setLocal] = useState<{
    id: string;
    tags: string[];
    status: ConversationStatus | null;
  }>({ id: contact.id, tags: contact.tags ?? [], status: contact.conversation_status ?? null });

  // Contato trocou: descarta o estado do anterior e adota os dados novos
  // (padrão "adjust state when props change" do React — roda no próprio
  // render, sem efeito e sem depender de identidade de array).
  const trocou = local.id !== contact.id;
  const tags = trocou ? (contact.tags ?? []) : local.tags;
  const conversationStatus = trocou ? (contact.conversation_status ?? null) : local.status;
  if (trocou) {
    setLocal({ id: contact.id, tags, status: conversationStatus });
  }

  // Refs espelham o estado para os callbacks assíncronos (o onUndo do toast
  // dispara segundos depois) lerem o valor atual, não o da closure.
  const tagsRef = useRef(tags);
  const statusRef = useRef(conversationStatus);
  useEffect(() => {
    tagsRef.current = tags;
    statusRef.current = conversationStatus;
  });
  const contactId = contact.id;

  const writeTags = async (next: string[], errorMsg: string): Promise<boolean> => {
    const { error } = await supabase.from('contacts').update({ tags: next }).eq('id', contactId);
    if (error) {
      toast.error(errorMsg);
      return false;
    }
    tagsRef.current = next;
    setLocal((prev) => ({ ...prev, tags: next }));
    return true;
  };

  const addTag = async (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (hasTag(tagsRef.current, tag)) {
      toast.info(`Tag "${tag}" já está no contato`);
      return;
    }
    await writeTags([...tagsRef.current, tag], `Erro ao adicionar a tag "${tag}"`);
  };

  const removeTag = async (tag: string) => {
    await writeTags(tagsRef.current.filter((t) => t !== tag), `Erro ao remover a tag "${tag}"`);
  };

  const flagTag = async (flag: 'vip' | 'block') => {
    const tag = flag === 'vip' ? VIP_TAG : BLOCKED_TAG;
    const spec = flag === 'vip'
      ? { already: `${contact.name} já é VIP`, done: `${contact.name} marcado como VIP`, fail: 'Erro ao marcar contato como VIP', icon: '⭐' }
      : { already: `${contact.name} já está bloqueado`, done: `${contact.name} bloqueado`, fail: 'Erro ao bloquear contato', icon: '🚫' };
    if (hasTag(tagsRef.current, tag)) {
      toast.info(spec.already);
      return;
    }
    if (!(await writeTags([...tagsRef.current, tag], spec.fail))) return;
    undoToast({
      message: spec.done,
      icon: spec.icon,
      onUndo: async () => {
        await writeTags(withoutTag(tagsRef.current, tag), 'Erro ao desfazer a ação');
      },
    });
  };

  const archive = async () => {
    if (statusRef.current === 'archived') {
      toast.info(`${contact.name} já está arquivado`);
      return;
    }
    const prev = statusRef.current;
    const { error } = await supabase
      .from('contacts')
      .update({ conversation_status: 'archived' })
      .eq('id', contactId);
    if (error) {
      toast.error('Erro ao arquivar contato');
      return;
    }
    statusRef.current = 'archived';
    setLocal((p) => ({ ...p, status: 'archived' }));
    undoToast({
      message: `${contact.name} arquivado`,
      icon: '📦',
      onUndo: async () => {
        // contacts.conversation_status é NOT NULL: anterior nulo vira 'open'.
        // O FSM só aceita archived → open/pending; destino recusado vira erro
        // honesto (toast.error), nunca sucesso falso.
        const restore: ConversationStatus = prev ?? 'open';
        const { error: undoError } = await supabase
          .from('contacts')
          .update({ conversation_status: restore })
          .eq('id', contactId);
        if (undoError) {
          toast.error('Erro ao desarquivar contato');
          return;
        }
        statusRef.current = restore;
        setLocal((p) => ({ ...p, status: restore }));
      },
    });
  };

  return {
    tags,
    conversationStatus,
    markVip: () => flagTag('vip'),
    block: () => flagTag('block'),
    archive,
    addTag,
    removeTag,
  };
}
