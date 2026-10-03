import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { contactMediaKey, type ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';

/**
 * Acoes da aba Arquivos (etapa 35).
 *
 * `deleteMessage` centraliza a exclusao que antes vivia duplicada no `FileActionsMenu` e no
 * `FileDetailPanel`, cada um com o seu `window.confirm`. O efeito e fiel ao que o dialogo
 * promete: marca a mensagem como apagada SO no ZAPP (`is_deleted = true` +
 * `content = '[Mensagem apagada]'`); o `media_url` permanece e nada vai para o WhatsApp do
 * cliente. Por isso a UI nao oferece "apagar no WhatsApp" — nao existe esse caminho.
 *
 * Ordem do sucesso (etapa 35): `update` -> `onRemoved(item.id)` (tira da selecao) ->
 * invalidar `contactMediaKey` e `conversationTabCountsKey`. No erro NAO se remove da
 * selecao: o operador precisa tentar de novo com a mesma escolha (etapa 34).
 */

export interface FilesActionsParams {
  contactId: string;
  /** Remove o item da selecao — chamado SO depois do update ter dado certo. */
  onRemoved: (id: string) => void;
}

export interface FilesActionState {
  deleteMessage: (item: ContactMediaItem) => Promise<boolean>;
  /** Ha um delete em voo (desabilita o confirmar do dialogo). */
  isDeleting: boolean;
}

export function useFilesActions({ contactId, onRemoved }: FilesActionsParams): FilesActionState {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteMessage = useCallback(
    async (item: ContactMediaItem): Promise<boolean> => {
      setIsDeleting(true);
      try {
        const { error } = await supabase
          .from('messages')
          .update({ is_deleted: true, content: '[Mensagem apagada]' })
          .eq('id', item.id);

        if (error) {
          toast.error('Erro ao apagar mensagem');
          return false;
        }

        onRemoved(item.id);
        queryClient.invalidateQueries({ queryKey: contactMediaKey(contactId) });
        queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
        toast.success('Mensagem removida');
        return true;
      } finally {
        setIsDeleting(false);
      }
    },
    [contactId, onRemoved, queryClient],
  );

  return { deleteMessage, isDeleting };
}
