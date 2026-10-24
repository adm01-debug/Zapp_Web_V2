import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { useChatMediaSending } from '@/components/inbox/useChatMediaSending';
import { useEvolutionApiCore } from '@/hooks/evolution/useEvolutionApiCore';
import { useEvolutionIntegrations } from '@/hooks/evolution/useEvolutionIntegrations';
import type { ConversationContact } from '@/types/chat';

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
 * Ações rápidas do painel "Detalhes do Contato" (#241, decisão do dono de
 * 06/10): o estado local só muda depois do `error` nulo; erro vira
 * `toast.error` sem Desfazer; o Desfazer executa a reversão real.
 *
 * - VIP → tag 'VIP' em `contacts.tags` (idempotente por caixa);
 * - Bloquear → bloqueio REAL na Evolution (`update-block-status`, mesmo fluxo
 *   de MessageContextActions) + tag 'Bloqueado' como marcador visual. Sem
 *   instância resolvível não há escrita nenhuma; se a escrita da tag falhar
 *   depois do bloqueio, o bloqueio é revertido para não ficar invisível;
 * - Tags do painel → add/remove em `contacts.tags` preservando as existentes;
 * - Arquivar NÃO fica aqui: a semântica única é `archiveContact` de
 *   useConversationActions (zera `assigned_to`; o Desfazer restaura o valor
 *   anterior real), delegada por ContactDetails.
 */
export function useContactQuickActions(contact: ConversationContact) {
  const [local, setLocal] = useState<{ id: string; tags: string[] }>({
    id: contact.id,
    tags: contact.tags ?? [],
  });

  // Contato trocou: descarta o estado do anterior e adota os dados novos
  // (padrão "adjust state when props change" do React — roda no próprio
  // render, sem efeito e sem depender de identidade de array).
  const trocou = local.id !== contact.id;
  const tags = trocou ? (contact.tags ?? []) : local.tags;
  if (trocou) {
    setLocal({ id: contact.id, tags });
  }

  // A ref espelha o estado para os callbacks assíncronos (o onUndo do toast
  // dispara segundos depois) lerem o valor atual, não o da closure.
  const tagsRef = useRef(tags);
  useEffect(() => {
    tagsRef.current = tags;
  });
  const contactId = contact.id;

  // Bloquear usa o mesmo resolvedor de instância do envio de mídia
  // (contacts.whatsapp_connection_id → whatsapp_connections.instance_id, com
  // fallback para a conexão 'connected') e a mesma action da Evolution que o
  // menu de mensagem usa para bloquear de verdade.
  const { instanceName, resolveInstance } = useChatMediaSending(contact.id, contact.phone);
  const { callApi, withToast } = useEvolutionApiCore();
  const { updateBlockStatus } = useEvolutionIntegrations(callApi, withToast);
  const blockBusyRef = useRef(false);

  const resolveBlockTarget = async (): Promise<{ instance: string; jid: string } | null> => {
    const digits = (contact.phone ?? '').replace(/\D/g, '');
    const instance = instanceName || (await resolveInstance());
    if (!instance || !digits) {
      toast.error('Não foi possível bloquear: conexão WhatsApp não encontrada');
      return null;
    }
    return { instance, jid: `${digits}@s.whatsapp.net` };
  };

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
    if (tag.toLowerCase() === BLOCKED_TAG.toLowerCase()) {
      await block();
      return;
    }
    if (hasTag(tagsRef.current, tag)) {
      toast.info(`Tag "${tag}" já está no contato`);
      return;
    }
    await writeTags([...tagsRef.current, tag], `Erro ao adicionar a tag "${tag}"`);
  };

  const removeTag = async (tag: string) => {
    if (tag.toLowerCase() === BLOCKED_TAG.toLowerCase()) {
      if (blockBusyRef.current) return;
      blockBusyRef.current = true;
      try {
        const target = await resolveBlockTarget();
        if (!target) return;
        try {
          await updateBlockStatus(target.instance, target.jid, 'unblock');
        } catch {
          return; // o withToast já mostrou o erro; a tag fica marcando o bloqueio ativo
        }
        await writeTags(withoutTag(tagsRef.current, BLOCKED_TAG), `Erro ao remover a tag "${tag}"`);
      } finally {
        blockBusyRef.current = false;
      }
      return;
    }
    await writeTags(tagsRef.current.filter((t) => t !== tag), `Erro ao remover a tag "${tag}"`);
  };

  const markVip = async () => {
    if (hasTag(tagsRef.current, VIP_TAG)) {
      toast.info(`${contact.name} já é VIP`);
      return;
    }
    if (!(await writeTags([...tagsRef.current, VIP_TAG], 'Erro ao marcar contato como VIP'))) return;
    undoToast({
      message: `${contact.name} marcado como VIP`,
      icon: '⭐',
      onUndo: async () => {
        await writeTags(withoutTag(tagsRef.current, VIP_TAG), 'Erro ao desfazer a ação');
      },
    });
  };

  const block = async () => {
    if (hasTag(tagsRef.current, BLOCKED_TAG)) {
      toast.info(`${contact.name} já está bloqueado`);
      return;
    }
    // Dois cliques durante a resolução da instância não disparam bloqueio em
    // duplicidade (a tag só aparece depois da escrita final).
    if (blockBusyRef.current) return;
    blockBusyRef.current = true;
    try {
      const target = await resolveBlockTarget();
      if (!target) return;
      try {
        await updateBlockStatus(target.instance, target.jid, 'block');
      } catch {
        return; // o withToast já mostrou o erro; nada foi escrito em contacts
      }
      if (!(await writeTags([...tagsRef.current, BLOCKED_TAG], 'Erro ao bloquear contato'))) {
        // O bloqueio real já foi aplicado na operadora; sem a tag ele ficaria
        // invisível na tela — reverte para não deixar contato bloqueado sem marca.
        try {
          await updateBlockStatus(target.instance, target.jid, 'unblock');
        } catch {
          toast.error('A marcação falhou e o contato pode continuar bloqueado no WhatsApp.');
        }
        return;
      }
      undoToast({
        message: `${contact.name} bloqueado`,
        icon: '🚫',
        onUndo: async () => {
          // Se o desbloqueio falhar, o erro sobe para o undoToast reoferecer o
          // Desfazer e a tag fica — ela continua marcando um bloqueio ativo.
          await updateBlockStatus(target.instance, target.jid, 'unblock');
          await writeTags(withoutTag(tagsRef.current, BLOCKED_TAG), 'Erro ao desfazer a ação');
        },
      });
    } finally {
      blockBusyRef.current = false;
    }
  };

  return {
    tags,
    markVip,
    block,
    addTag,
    removeTag,
  };
}
