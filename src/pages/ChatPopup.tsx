import { useEffect, useState, useCallback, lazy, Suspense, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { sendMessageToContact } from '@/hooks/realtime/messageSender';
import { useMessages } from '@/hooks/chat/useMessages';
import type { Database } from '@/integrations/supabase/types';
import { Conversation, Message } from '@/types/chat';
import { log } from '@/lib/logger';
import { normalizeOperationalPriority } from '@/lib/ai-vocabulary';
import { toast } from '@/hooks/ui/use-toast';

type ContactRow = Database['public']['Tables']['contacts']['Row'];
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Minus,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
  MessageSquare,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

const ChatPanel = lazy(() =>
  import('@/components/inbox/ChatPanel').then((m) => ({ default: m.ChatPanel }))
);

interface RawMessage {
  id: string;
  content: string;
  message_type?: string;
  sender: string;
  agent_id?: string;
  created_at: string;
  status?: string;
  is_read?: boolean;
  media_url?: string;
  transcription?: string;
  transcription_status?: string;
}

function mapToLegacyMessages(msgs: RawMessage[], contactId: string): Message[] {
  return msgs.map((m) => ({
    id: m.id,
    conversationId: contactId,
    content: m.content,
    type: (m.message_type || 'text') as Message['type'],
    sender: m.sender as Message['sender'],
    agentId: m.agent_id || undefined,
    timestamp: new Date(m.created_at),
    status:
      (m.status as Message['status'] | null) ||
      (m.is_read ? 'read' : 'delivered'),
    mediaUrl: m.media_url || undefined,
    transcription: m.transcription || null,
    transcriptionStatus:
      (m.transcription_status as Message['transcriptionStatus']) || null,
  }));
}

export default function ChatPopup() {
  const { contactId } = useParams<{ contactId: string }>();
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  // R2-INB-004: o contrato de paginação do hook (histórico antigo) tem de chegar
  // ao controle da área de mensagens — sem ele o popup fica preso na 1ª página.
  // R2-INB-024: `error`/`refetch` do MESMO hook também são necessários — sem eles a
  // falha de transporte/permissão na carga virava lista vazia, indistinguível de
  // "contato sem histórico" e sem retry nesta janela.
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
    hasOlder,
    loadingOlder,
    loadOlderMessages,
  } = useMessages({
    contactId: contactId || '',
    enabled: !!contactId,
  });

  // SLA de 1a resposta: timestamp da primeira mensagem efetivamente enviada pelo atendente
  const firstResponseAt = useMemo(() => {
    const sent = (messages as unknown as Array<{ sender?: string; status?: string | null; created_at?: string }>)
      .filter(m => m.sender === 'agent' && m.status !== 'failed' && m.status !== 'sending')
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    return sent[0]?.created_at ? new Date(sent[0].created_at) : null;
  }, [messages]);

  useEffect(() => {
    if (!contactId) return;
    void (async () => {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();
      if (data) {
        setContact(data);
        document.title = `Chat — ${data.name}`;
      }
      setLoading(false);
    })();
  }, [contactId]);

  const popupPriority: 'low' | 'medium' | 'high' = (() => {
    const p = normalizeOperationalPriority(contact?.ai_priority).value;
    return p === 'high' || p === 'urgent' ? 'high' : p === 'low' ? 'low' : 'medium';
  })();

  const conversation: Conversation | null = contact
    ? {
        id: contactId!,
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          avatar: contact.avatar_url || undefined,
          email: contact.email || undefined,
          tags: contact.tags || [],
          createdAt: new Date(contact.created_at),
        },
        status: 'open',
        lastMessage: undefined,
        unreadCount: 0,
        tags: contact.tags || [],
        priority: popupPriority,
        createdAt: new Date(contact.created_at),
        updatedAt: new Date(contact.updated_at),
        firstResponseAt,
        assignedTo: undefined,
      }
    : null;

  const legacyMessages = contactId
    ? mapToLegacyMessages(messages as unknown as RawMessage[], contactId)
    : [];

  const handleSendMessage = useCallback(
    async (content: string, replyToId?: string | null) => {
      if (!contactId) return;
      // envia de verdade via Evolution API (antes: so gravava no banco —
      // a mensagem nunca chegava ao cliente no WhatsApp). A citação escolhida
      // no Composer segue junto: sem o replyToId o destino perde o vínculo.
      await sendMessageToContact(contactId, content, 'text', undefined, undefined, replyToId);
    },
    [contactId]
  );

  // R2-INB-022: devolve `false` em falha (com aviso ao usuário) para o ChatPanel manter o
  // gravador aberto e a gravação recuperável para reenvio.
  const handleSendAudio = useCallback(
    async (blob: Blob): Promise<boolean> => {
      if (!contactId) return false;
      try {
        const fileName = `audio_${contactId}_${Date.now()}.webm`;
        const { error: uploadError } = await supabase.storage
          .from('whatsapp-media')
          .upload(fileName, blob, { contentType: blob.type || 'audio/webm' });

        if (uploadError) throw uploadError;

        const { data: urlData } = await supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(fileName);

        // envia de verdade via Evolution API (antes: so gravava no banco)
        await sendMessageToContact(contactId, '🎵 Mensagem de áudio', 'audio', urlData.publicUrl);
        return true;
      } catch (err) {
        log.error('Failed to send audio from popup:', err);
        toast({ title: 'Erro ao enviar áudio', description: 'Tente novamente.', variant: 'destructive' });
        return false;
      }
    },
    [contactId]
  );

  const handleClose = () => window.close();

  const handleToggleMaximize = () => {
    if (isMaximized) {
      window.resizeTo(440, 680);
      setIsMaximized(false);
    } else {
      window.resizeTo(screen.availWidth, screen.availHeight);
      window.moveTo(0, 0);
      setIsMaximized(true);
    }
  };

  // ── Loading State ──
  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-pulse" />
          </div>
          <div className="space-y-2 text-center">
            <Skeleton className="h-4 w-28 mx-auto" />
            <Skeleton className="h-3 w-20 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  // ── Not Found ──
  if (!contact || !conversation) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">
          Contato não encontrado
        </p>
        <Button variant="outline" size="sm" onClick={handleClose}>
          Fechar janela
        </Button>
      </div>
    );
  }

  // ── Falha na carga das mensagens (R2-INB-024) ──
  // O hook termina o `loading` mesmo quando a busca falha; sem este ramo a lista vazia
  // passava por "conversa sem histórico". Só vale quando nada foi renderizado: uma falha
  // do refetch silencioso não pode apagar as mensagens que já estão na tela.
  if (messagesError && legacyMessages.length === 0) {
    return (
      <div role="alert" className="h-screen bg-background flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <p className="text-sm font-medium text-foreground">Erro ao carregar as mensagens</p>
        <p className="text-xs text-muted-foreground break-words">{messagesError}</p>
        <Button variant="outline" size="sm" onClick={() => { void refetchMessages(); }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* ── Thin Window Controls Bar ── */}
        <div className="flex items-center justify-end px-2 h-8 bg-card/60 border-b border-border/50 shrink-0 select-none">
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 text-muted-foreground hover:text-foreground rounded"
                  onClick={() => window.resizeTo(440, 48)}
                >
                  <Minus className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Minimizar
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 text-muted-foreground hover:text-foreground rounded"
                  onClick={handleToggleMaximize}
                >
                  {isMaximized ? (
                    <Minimize2 className="w-3 h-3" />
                  ) : (
                    <Maximize2 className="w-3 h-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isMaximized ? 'Restaurar' : 'Maximizar'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 text-muted-foreground hover:text-destructive rounded"
                  onClick={handleClose}
                >
                  <X className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Fechar
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Full Chat Content (with full header & all features) ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="text-xs text-muted-foreground">
                    Carregando conversa...
                  </span>
                </div>
              </div>
            }
          >
            <ChatPanel
              key={contactId}
              conversation={conversation}
              messages={legacyMessages}
              onSendMessage={handleSendMessage}
              onSendAudio={handleSendAudio}
              hasOlderMessages={hasOlder}
              loadingOlderMessages={loadingOlder}
              onLoadOlderMessages={loadOlderMessages}
            />
          </Suspense>
        </div>
      </div>
    </TooltipProvider>
  );
}
