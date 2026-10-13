import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { useChatMediaSending } from '@/components/inbox/useChatMediaSending';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import type { ConversationContact } from '@/types/chat';

/**
 * Ações rápidas do painel "Detalhes do Contato" (#241, decisão do dono de
 * 06/10): o estado local só muda depois do `error` nulo; erro vira
 * `toast.error` sem Desfazer; o Desfazer executa a reversão real.
 *
 * - VIP → coluna própria `contacts.is_vip` pela RPC `set_contact_vip`
 *   (idempotente: já VIP não escreve nem oferece Desfazer);
 * - Bloquear → bloqueio REAL na Evolution (`update-block-status`, mesmo fluxo
 *   de MessageContextActions) + coluna `contacts.blocked_at` pela RPC
 *   `set_contact_blocked`. Sem instância resolvível não há escrita nenhuma; se
 *   a RPC falhar depois do bloqueio, o bloqueio é revertido na Evolution para
 *   não ficar invisível na tela;
 * - Arquivar NÃO fica aqui: a semântica única é `archiveContact` de
 *   useConversationActions (zera `assigned_to`; o Desfazer restaura o valor
 *   anterior real), delegada por ContactDetails.
 *
 * Tags/etiquetas de contato não existem mais: a função foi removida do
 * produto (ordem do dono de 12/10) e o estado de VIP/bloqueio saiu da coluna
 * `contacts.tags` para campos próprios.
 */
export function useContactQuickActions(contact: ConversationContact) {
  const [local, setLocal] = useState<{ id: string; isVip: boolean; blockedAt: string | null }>({
    id: contact.id,
    isVip: contact.is_vip ?? false,
    blockedAt: contact.blocked_at ?? null,
  });

  // Contato trocou: descarta o estado do anterior e adota os dados novos
  // (padrão "adjust state when props change" do React — roda no próprio
  // render, sem efeito e sem depender de identidade de objeto).
  const trocou = local.id !== contact.id;
  const isVip = trocou ? (contact.is_vip ?? false) : local.isVip;
  const blockedAt = trocou ? (contact.blocked_at ?? null) : local.blockedAt;
  if (trocou) {
    setLocal({ id: contact.id, isVip, blockedAt });
  }

  // A ref espelha o estado para os callbacks assíncronos (o onUndo do toast
  // dispara segundos depois) lerem o valor atual, não o da closure.
  const stateRef = useRef({ isVip, blockedAt });
  useEffect(() => {
    stateRef.current = { isVip, blockedAt };
  });
  const contactId = contact.id;

  // Bloquear usa o mesmo resolvedor de instância do envio de mídia
  // (contacts.whatsapp_connection_id → whatsapp_connections.instance_id, com
  // fallback para a conexão 'connected') e a mesma action da Evolution que o
  // menu de mensagem usa para bloquear de verdade.
  const { instanceName, resolveInstance } = useChatMediaSending(contact.id, contact.phone);
  const { updateBlockStatus } = useEvolutionApi();
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

  const writeVip = async (next: boolean): Promise<boolean> => {
    const { error } = await supabase.rpc('set_contact_vip', {
      p_contact_id: contactId,
      p_is_vip: next,
    });
    if (error) {
      toast.error(next ? 'Erro ao marcar contato como VIP' : 'Erro ao desfazer a ação');
      return false;
    }
    stateRef.current = { ...stateRef.current, isVip: next };
    setLocal((prev) => ({ ...prev, isVip: next }));
    return true;
  };

  const writeBlocked = async (next: boolean, errorMsg: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('set_contact_blocked', {
      p_contact_id: contactId,
      p_blocked: next,
    });
    if (error) {
      toast.error(errorMsg);
      return false;
    }
    // A RPC devolve o novo `blocked_at` (NULL quando desbloqueado); o
    // instante local serve de fallback se o banco não devolver nada.
    const novoBlockedAt = next ? (data ?? new Date().toISOString()) : null;
    stateRef.current = { ...stateRef.current, blockedAt: novoBlockedAt };
    setLocal((prev) => ({ ...prev, blockedAt: novoBlockedAt }));
    return true;
  };

  const markVip = async () => {
    if (stateRef.current.isVip) {
      toast.info(`${contact.name} já é VIP`);
      return;
    }
    if (!(await writeVip(true))) return;
    undoToast({
      message: `${contact.name} marcado como VIP`,
      icon: '⭐',
      onUndo: async () => {
        await writeVip(false);
      },
    });
  };

  const block = async () => {
    if (stateRef.current.blockedAt) {
      toast.info(`${contact.name} já está bloqueado`);
      return;
    }
    // Dois cliques durante a resolução da instância não disparam bloqueio em
    // duplicidade (o campo só é gravado depois da escrita final).
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
      if (!(await writeBlocked(true, 'Erro ao bloquear contato'))) {
        // O bloqueio real já foi aplicado na operadora; sem a coluna ele ficaria
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
          // Desfazer e a coluna fica — ela continua marcando um bloqueio ativo.
          await updateBlockStatus(target.instance, target.jid, 'unblock');
          await writeBlocked(false, 'Erro ao desfazer a ação');
        },
      });
    } finally {
      blockBusyRef.current = false;
    }
  };

  return {
    isVip,
    blockedAt,
    markVip,
    block,
  };
}
