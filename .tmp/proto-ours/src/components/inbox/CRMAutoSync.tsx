/**
 * CRMAutoSync
 *
 * Componente invisível renderizado no cabeçalho da conversa (`ChatPanel`).
 *
 * O auto-sync disparado NO NAVEGADOR foi removido: o gatilho de banco
 * `trg_enqueue_crm_sync_from_closure`
 * (`supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql:66-104`)
 * já enfileira TODA closure no outbox, idempotente por `closure:<id>`, a partir
 * de `conversation_closures`. O disparo no navegador só duplicava a fila — e,
 * para conversa resolvida sem linha em `conversation_closures`, a Edge respondia
 * 409 ('Resolve the conversation before syncing') e o `onError` zerava os refs,
 * repetindo a chamada a cada re-render (o objeto `conversation` muda a cada
 * atualização em tempo real), sem backoff.
 *
 * O caminho MANUAL segue aqui no botão e a fila é idempotente por `contactId`.
 */
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSyncToCRM } from '@/hooks/integrations/useSyncToCRM';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Conversation, Message } from '@/types/chat';

interface CRMAutoSyncProps {
  conversation: Conversation;
  messageCount?: number;
  agentName?: string;
  messages?: Message[];
}

/**
 * Ponto de extensão do `ChatPanel` (arquivo fora do escopo deste cartão): segue
 * exportado e invisível, mas não dispara mais nada no navegador — quem enfileira
 * o CRM é o gatilho do banco.
 */
export function CRMAutoSync({ conversation, messages }: CRMAutoSyncProps) {
  const { syncConversation, isConfigured } = useSyncToCRM();
  const lastSyncedStatus = useRef<string>('');
  const lastSyncedId = useRef<string>('');

  const sentiment = useMemo(() => detectSentiment(messages), [messages]);
  // ADR-005 (passo 3): o estado persistido em `contacts.conversation_status` é a
  // fonte única. Sem a flag `inbox.status-fsm` (que nascia `false`) o componente
  // comparava `conversation.status`, valor que a UI não produz como `resolved` — o
  // auto-sync não disparava. O coalesce cobre conversa montada sem o campo.
  const effectiveStatus = conversation.contact.conversation_status ?? conversation.status;

  useEffect(() => {
    if (!isConfigured) return;

    const shouldSync =
      effectiveStatus === 'resolved' &&
      (lastSyncedStatus.current !== 'resolved' || lastSyncedId.current !== conversation.id);

    if (shouldSync) {
      lastSyncedStatus.current = effectiveStatus;
      lastSyncedId.current = conversation.id;

      syncConversation({ contactId: conversation.contact.id }, {
        onError: () => {
          if (lastSyncedId.current === conversation.id) {
            lastSyncedStatus.current = '';
            lastSyncedId.current = '';
          }
        },
      });

      log.info('CRM auto-sync triggered:', { id: conversation.id, sentiment });
    }

    if (!shouldSync) lastSyncedStatus.current = effectiveStatus;
  }, [effectiveStatus, conversation, isConfigured, syncConversation, sentiment]);

  return null; // Invisible component
}

/**
 * Manual sync button — drop into ContactDetails or ExternalContact360Panel.
 * Sem CRM configurado o botão NÃO some: fica desabilitado com a dica e o
 * `aria-label` 'CRM não configurado'.
 */
export function CRMSyncButton({ conversation, messageCount }: { conversation: Conversation; messageCount?: number }) {
  const { syncConversationAsync, isSyncing, isConfigured, lastResult } = useSyncToCRM();
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [contactNotFound, setContactNotFound] = useState(false);

  if (!isConfigured) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* <button disabled> não recebe foco nem dispara hover, e o Radix abre o
              Tooltip pelo TRIGGER: sem um wrapper focável o motivo ('CRM não
              configurado') ficava inalcançável por teclado. Mesmo padrão do
              `Tile` em contact-details/ContactActionButtons.tsx. */}
          <span
            tabIndex={0}
            role="button"
            aria-disabled="true"
            aria-label="CRM não configurado"
            className="inline-flex cursor-not-allowed"
          >
            <Button
              variant="outline"
              size="icon"
              disabled
              aria-label="CRM não configurado"
              data-testid="crm-sync-button"
              className="w-9 h-9 opacity-50 border-border/30"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">CRM não configurado</TooltipContent>
      </Tooltip>
    );
  }

  const handleSync = async () => {
    try {
      const result = await syncConversationAsync({
        contactId: conversation.contact.id,
        channel: 'whatsapp',
        direction: 'inbound',
        assunto: `Conversa WhatsApp — ${conversation.contact.name}`,
        resumo: conversation.lastMessage?.content?.slice(0, 500) || undefined,
        sentiment: 'neutral',
        messageCount: messageCount || 0,
      });

      if (result?.synced) {
        setLastSyncTime(new Date());
        setContactNotFound(false);
        toast.success('Sincronizado com o CRM!', {
          description: result.new_relationship_score
            ? `Score atualizado: ${result.new_relationship_score}`
            : undefined,
        });
      } else if (result?.queued) {
        setLastSyncTime(new Date());
        toast.info('Sincronização agendada', { description: 'A fila CRM fará novas tentativas automaticamente.' });
      } else if (result?.reason === 'duplicate') {
        setLastSyncTime(new Date());
        toast.info('Já sincronizado', { description: 'Esta conversa já foi enviada ao CRM.' });
      } else if (result?.reason === 'contact_not_found') {
        setContactNotFound(true);
        toast.warning('Contato não encontrado no CRM');
      }
    } catch {
      toast.error('Erro ao sincronizar com CRM');
    }
  };

  if (contactNotFound) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Mesmo wrapper focável do estado sem CRM: o motivo precisa continuar
              alcançável por teclado neste estado desabilitado. */}
          <span
            tabIndex={0}
            role="button"
            aria-disabled="true"
            aria-label="Contato não encontrado no CRM"
            className="inline-flex cursor-not-allowed"
          >
            <Button
              variant="outline"
              size="icon"
              disabled
              aria-label="Contato não encontrado no CRM"
              data-testid="crm-sync-button"
              className="w-9 h-9 opacity-50 border-border/30"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Contato não encontrado no CRM</TooltipContent>
      </Tooltip>
    );
  }

  const tooltipText = isSyncing
    ? 'Sincronizando...'
    : lastResult?.synced
      ? `Sincronizado ${lastSyncTime ? formatDistanceToNow(lastSyncTime, { addSuffix: true, locale: ptBR }) : ''}`
      : 'Sincronizar com CRM externo';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={handleSync}
          disabled={isSyncing}
          data-testid="crm-sync-button"
          className="w-9 h-9 border-border/30 hover:border-primary/50 hover:bg-primary/10"
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : lastResult?.synced ? (
            <CheckCircle2 className="w-4 h-4 text-success" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
