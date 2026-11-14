import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { log } from '@/lib/logger';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import { ViewersIndicator } from './collaboration/ViewersIndicator';
import { InternalNotesPanel } from './collaboration/InternalNotesPanel';
import { HandoffDialog, type HandoffResult } from './collaboration/HandoffDialog';
import { transferConversation, transferErrorMessage } from '@/lib/inbox/transferConversation';

interface RealtimeCollaborationProps {
  contactId: string;
  className?: string;
}

/** Formato UUID aceito pela RPC para o id do contato. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function RealtimeCollaboration({ contactId, className }: RealtimeCollaborationProps) {
  const [handoffOpen, setHandoffOpen] = useState(false);
  const queryClient = useQueryClient();

  // `contacts.queue_id` decide o filtro da lista de destinos no diálogo: sem
  // fila, o guard só permite atribuir para o próprio usuário (mesma regra do
  // TransferDialog). Em erro/falha fica `undefined` → tratado como sem fila,
  // o lado conservador (nunca oferece um destino que o trigger vai recusar).
  // O mesmo SELECT traz o dono atual (`assigned_to`): ele vai para a RPC como
  // `p_expected_agent_id` (compare-and-set — se outro atendente transferiu antes,
  // a RPC recusa com 40001 em vez de sobrescrever).
  const { data: contactRouting } = useQuery({
    queryKey: ['contact-queue-owner', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('queue_id, assigned_to')
        .eq('id', contactId)
        .maybeSingle();
      if (error) throw error;
      const row = data as { queue_id?: string | null; assigned_to?: string | null } | null;
      return { queueId: row?.queue_id ?? null, assignedTo: row?.assigned_to ?? null };
    },
    enabled: UUID_RE.test(contactId),
  });

  // Antes deste fix o update em `contacts` era escrito sem ler `error` nem as
  // linhas afetadas e o insert da nota também não era conferido: com a policy
  // de UPDATE negando (agente comum), o clique falhava em silêncio e o diálogo
  // anunciava "Conversa transferida com sucesso!". Agora a transferência usa o
  // MESMO caminho do chat (`transfer_conversation`, migration 20261005185729 —
  // UPDATE do contato + INSERT do evento na mesma transação) e QUALQUER falha
  // rejeita: nada é anunciado como transferido sem evento gravado. A nota
  // interna é checada à parte porque o painel lê `contact_notes`: se só ela
  // falhar, o retorno `{ noteSaved: false }` faz o diálogo avisar o sucesso
  // parcial em vez de esconder a perda.
  const handleHandoff = async (agentId: string, comment: string): Promise<HandoffResult> => {
    if (!UUID_RE.test(contactId)) {
      throw new Error('ID de contato inválido para transferência.');
    }

    const trimmedComment = comment.trim();

    const { data: eventId, error: transferError } = await transferConversation({
      contactId,
      toAgentId: agentId,
      note: trimmedComment || undefined,
      // Dono lido do banco (null = sem dono); sem leitura ainda, sem compare-and-set.
      expectedAgentId: contactRouting ? contactRouting.assignedTo : undefined,
    });
    if (transferError) {
      // 40001: alguém transferiu/assumiu antes — o diálogo mostra a mensagem clara.
      if (transferError.code === '40001') throw new Error(transferErrorMessage(transferError, ''));
      throw transferError;
    }
    if (!eventId) {
      throw new Error('Nenhuma transferência foi gravada.');
    }

    // A atribuição/fila do contato mudou: os contadores das abas e as DUAS
    // famílias de notas (painel de notas internas e a lista do contato, que a
    // nota de handoff alimenta) ficam velhos independentemente de a nota ter
    // sido salva. `contact-notes` é invalidado pela família porque a chave
    // inclui o id do usuário (ver `contactNotesKey`).
    void queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
    void queryClient.invalidateQueries({ queryKey: ['contact-queue-owner', contactId] });
    void queryClient.invalidateQueries({ queryKey: ['contact-notes'] });
    void queryClient.invalidateQueries({ queryKey: ['internal-notes', contactId] });

    let noteSaved = true;
    if (trimmedComment) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();

      let noteError: { message: string } | null = profileError ?? null;
      if (!noteError && !profile?.id) {
        noteError = new Error('Perfil do atendente não encontrado.');
      }
      if (!noteError && profile?.id) {
        const { error } = await supabase.from('contact_notes').insert({
          contact_id: contactId,
          author_id: profile.id,
          content: `Transferido: ${trimmedComment}`,
        });
        noteError = error ?? null;
      }

      if (noteError) {
        // Sem conteúdo da nota no log (dado de cliente/conversa).
        log.warn('[RealtimeCollaboration] Nota de handoff não pôde ser salva.');
        noteSaved = false;
      }
    }

    return { noteSaved };
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <ViewersIndicator contactId={contactId} />
        <Button variant="outline" size="sm" onClick={() => setHandoffOpen(true)}>
          <Users className="w-4 h-4 mr-2" />Transferir
        </Button>
      </div>
      <InternalNotesPanel contactId={contactId} />
      <HandoffDialog open={handoffOpen} onOpenChange={setHandoffOpen} contactId={contactId} queueId={contactRouting?.queueId} onHandoff={handleHandoff} />
    </div>
  );
}

export { ViewersIndicator, InternalNotesPanel, HandoffDialog };
