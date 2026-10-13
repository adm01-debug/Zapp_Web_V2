import { useRef } from 'react';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { useChatMediaSending } from '@/components/inbox/useChatMediaSending';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import type { ConversationContact } from '@/types/chat';

/**
 * Ações rápidas do painel "Detalhes do Contato".
 *
 * Ordem do Joaquim (12/10/2026): a função de tags de contato não existe mais.
 * Este hook era o único ponto do app que escrevia etiquetas na tabela de
 * contatos; agora não lê nem grava a coluna.
 *
 * - `block` → bloqueio REAL na Evolution (`update-block-status`, mesmo fluxo de
 *   MessageContextActions), com Desfazer que desbloqueia de verdade. Sem
 *   instância resolvível nenhuma chamada acontece.
 * - VIP saiu junto: o marcador era a tag 'VIP' na tabela de contatos. A coluna
 *   dedicada (`is_vip`) ainda NÃO existe no schema (reconhecimento de 13/10),
 *   então não há onde persistir; o selo VIP derivado de etiqueta também some
 *   (decisão D-T2). Quando a coluna dedicada estiver na base, o VIP volta por
 *   ela.
 * - Tags do painel (add/remove) e o marcador local de bloqueio saíram: os dois
 *   eram a mesma escrita na tabela de contatos.
 * - Arquivar NÃO fica aqui: a semântica única é `archiveContact`, de
 *   useConversationActions (o painel delega).
 *
 * Sem coluna dedicada não há como saber que o contato já está bloqueado; o hook
 * só impede dois cliques concorrentes (o bloqueio é idempotente na Evolution).
 */
export function useContactQuickActions(contact: ConversationContact) {
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

  const block = async () => {
    // Dois cliques durante a resolução da instância não disparam bloqueio em
    // duplicidade.
    if (blockBusyRef.current) return;
    blockBusyRef.current = true;
    try {
      const target = await resolveBlockTarget();
      if (!target) return;
      try {
        await updateBlockStatus(target.instance, target.jid, 'block');
      } catch {
        return; // o withToast já mostrou o erro; nada foi persistido
      }
      undoToast({
        message: `${contact.name} bloqueado`,
        icon: '🚫',
        // O Desfazer desbloqueia de verdade; se a Evolution falhar, o erro sobe
        // para o undoToast reoferecer o Desfazer.
        onUndo: async () => {
          await updateBlockStatus(target.instance, target.jid, 'unblock');
        },
      });
    } finally {
      blockBusyRef.current = false;
    }
  };

  return { block };
}
