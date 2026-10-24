import { useEffect, useState } from 'react';
import { useTeamConversations } from '@/hooks/chat/useTeamChat';
import { TeamConversationList } from './TeamConversationList';
import { TeamChatPanel } from './TeamChatPanel';
import { TeamMemberDetails } from './TeamMemberDetails';
import { NewConversationDialog } from './NewConversationDialog';
import { Users, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveTeamChatConversation } from '@/hooks/chat/useTeamChatNotifications';
import { Button } from '@/components/ui/button';
import { ConversationEmptyState } from '@/components/shared/ConversationEmptyState';

/**
 * E90 (receptor): lê o `cid` de `?view=team-chat&cid=<conversationId>`.
 * Devolve o id aparado ou null (ausente/vazio/URL inválida).
 */
function readTeamChatCidFromUrl(): string | null {
  try {
    const cid = new URLSearchParams(window.location.search).get('cid')?.trim();
    return cid ? cid : null;
  } catch {
    return null;
  }
}

export function TeamChatView() {
  const { data: conversations = [], isLoading: conversationsLoading } = useTeamConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // E90 (receptor): o clique na notificação leva a `?view=team-chat&cid=<id>`.
  // A seleção da conversa é estado local desta view (fora do hook de disparo),
  // então o cid da URL é aplicado aqui — sem react-router de propósito:
  // `window.location` mantém os testes existentes (sem provider) verdes.
  // cid ausente/inválido é ignorado e nunca limpa a seleção manual.
  useEffect(() => {
    const applyCidFromUrl = () => {
      const cid = readTeamChatCidFromUrl();
      if (cid && conversations.some((c) => c.id === cid)) {
        setSelectedId(cid);
        setShowDetails(false);
      }
    };
    applyCidFromUrl();
    // pushState/replaceState (navigateToView) não dispara popstate; o app
    // avisa via `zapp:navigate` — escuta os dois para reagir sem remontar
    // (ex.: já estava em team-chat e clicou na notificação).
    window.addEventListener('popstate', applyCidFromUrl);
    window.addEventListener('zapp:navigate', applyCidFromUrl);
    return () => {
      window.removeEventListener('popstate', applyCidFromUrl);
      window.removeEventListener('zapp:navigate', applyCidFromUrl);
    };
  }, [conversations]);

  // TC-007: o listener de notificações é ÚNICO e global (montado em App.tsx); aqui a view
  // só publica a conversa em foco para o listener suprimir o alerta dela — e limpa ao
  // desmontar, para voltar a alertar quando o atendente sai da tela.
  useActiveTeamChatConversation(selectedId);

  const selectedConversation = conversations.find(c => c.id === selectedId) || null;

  return (
    <div className="flex h-full w-full bg-background">
      {/* Sidebar */}
      <div className={cn(
        "w-80 border-r border-border flex flex-col shrink-0",
        selectedId && "hidden md:flex"
      )}>
        <TeamConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setShowDetails(false); }}
          onNewConversation={() => setShowNewDialog(true)}
          loading={conversationsLoading}
        />
      </div>

      {/* Chat area */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 w-0",
        !selectedId && "hidden md:flex"
      )}>
        {selectedConversation ? (
          <TeamChatPanel
            conversation={selectedConversation}
            onBack={() => setSelectedId(null)}
            onToggleDetails={() => setShowDetails(prev => !prev)}
            showDetails={showDetails}
          />
        ) : (
          <ConversationEmptyState
            icon={Users}
            title="Chat da Equipe"
            description="Selecione uma conversa ou inicie uma nova para conversar com seus colegas"
            action={(
              <Button
                size="sm"
                className="gap-2 rounded-xl shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="w-4 h-4" />
                Nova conversa
              </Button>
            )}
          />
        )}
      </div>

      {/* Details panel */}
      {showDetails && selectedConversation && (
        <TeamMemberDetails
          conversation={selectedConversation}
          onClose={() => setShowDetails(false)}
        />
      )}

      <NewConversationDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={(id) => {
          setSelectedId(id);
          setShowNewDialog(false);
        }}
      />
    </div>
  );
}
