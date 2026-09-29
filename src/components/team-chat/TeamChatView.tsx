import { useState, useMemo, useEffect } from 'react';
import { TeamConversation } from '@/hooks/chat/useTeamChat';
import { useTeamConversations } from '@/hooks/team-chat/useTeamConversations';
import { useCreateDirectConversation, useCreateGroupConversation } from '@/hooks/team-chat/useTeamChatMutations';
import { TeamChatSidebar } from './TeamChatSidebar';
import { TeamChatPanel } from './TeamChatPanel';
import { NewGroupDialog } from './NewGroupDialog';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { cn } from '@/lib/utils';
import { MessageSquare } from 'lucide-react';

export function TeamChatView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const isMobile = useIsMobile();

  const { data: conversations = [], isLoading } = useTeamConversations();

  const createDirectMutation = useCreateDirectConversation();
  const createGroupMutation = useCreateGroupConversation();

  // E90 — abre a conversa certa ao clicar em notificação push
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('cid');
    if (cid) setSelectedId(cid);
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((c: TeamConversation) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const handleSelectConversation = (id: string) => setSelectedId(id);

  const handleStartDirect = async (profileId: string) => {
    const conv = await createDirectMutation.mutateAsync({ profileId });
    if (conv?.id) setSelectedId(conv.id);
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    const conv = await createGroupMutation.mutateAsync({ name, memberIds });
    if (conv?.id) { setSelectedId(conv.id); setShowNewGroup(false); }
  };

  if (isMobile) {
    return (
      <div className="flex flex-col h-full w-full">
        {!selectedId ? (
          <TeamChatSidebar
            conversations={conversations}
            selectedId={selectedId}
            isLoading={isLoading}
            onSelect={handleSelectConversation}
            onStartDirect={handleStartDirect}
            onNewGroup={() => setShowNewGroup(true)}
          />
        ) : (
          selectedConversation && (
            <TeamChatPanel
              conversation={selectedConversation}
              onBack={() => setSelectedId(null)}
            />
          )
        )}
        <NewGroupDialog
          open={showNewGroup}
          onOpenChange={setShowNewGroup}
          onConfirm={handleCreateGroup}
          isPending={createGroupMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <TeamChatSidebar
        conversations={conversations}
        selectedId={selectedId}
        isLoading={isLoading}
        onSelect={handleSelectConversation}
        onStartDirect={handleStartDirect}
        onNewGroup={() => setShowNewGroup(true)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {selectedConversation ? (
          <TeamChatPanel
            conversation={selectedConversation}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-inbox-panel">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm">Selecione uma conversa</p>
          </div>
        )}
      </div>
      <NewGroupDialog
        open={showNewGroup}
        onOpenChange={setShowNewGroup}
        onConfirm={handleCreateGroup}
        isPending={createGroupMutation.isPending}
      />
    </div>
  );
}
