import { useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';

export function TeamChatView() {
  const { data: conversations = [], isLoading, isError, refetch } = useTeamConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

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
          isLoading={isLoading}
          isError={isError}
          onRetry={() => { void refetch(); }}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setShowDetails(false); }}
          onNewConversation={() => setShowNewDialog(true)}
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
        ) : isLoading ? (
          <div className="flex-1 flex flex-col gap-3 p-6" aria-busy="true" aria-label="Carregando conversas">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className={cn('h-12 rounded-2xl', i % 2 === 0 ? 'w-2/3' : 'w-1/2 self-end')} />
            ))}
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar as conversas.</p>
            <Button size="sm" variant="outline" onClick={() => { void refetch(); }}>
              Tentar novamente
            </Button>
          </div>
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
