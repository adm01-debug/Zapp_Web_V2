import { useState, useMemo } from 'react';
import { useTeamConversations } from '@/hooks/chat/useTeamChat';
import { useAuth } from '@/hooks/auth/useAuth';
import type { TeamConversation, TeamInboxRow, ConversationType } from '@/hooks/team-chat/teamChatTypes';
import { TeamConversationList } from './TeamConversationList';
import { TeamChatPanel } from './TeamChatPanel';
import { TeamMemberDetails } from './TeamMemberDetails';
import { NewConversationDialog } from './NewConversationDialog';
import { MessageSquare, Users, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamChatNotifications } from '@/hooks/chat/useTeamChatNotifications';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

function inboxRowToConversation(row: TeamInboxRow): TeamConversation {
  const msgType = row.last_message_type;
  return {
    id: row.conversation_id,
    type: row.type as ConversationType,
    name: row.name,
    avatar_url: row.avatar_url,
    created_by: null,
    department_id: null,
    created_at: row.created_at,
    updated_at: row.created_at,
    members: [],
    last_message: row.last_message_id ? {
      id: row.last_message_id,
      conversation_id: row.conversation_id,
      sender_id: row.last_message_sender_id ?? '',
      content: row.last_message_content ?? '',
      message_type: msgType ?? 'text',
      status: null,
      media_url: null,
      media_type: (msgType && msgType !== 'text') ? msgType : null,
      media_bucket: null,
      media_path: null,
      reply_to_id: null,
      is_edited: false,
      created_at: row.last_message_created_at ?? row.created_at,
      updated_at: row.last_message_created_at ?? row.created_at,
    } : null,
    unread_count: row.unread_count,
  };
}

export function TeamChatView() {
  const { data: inboxRows = [], isLoading } = useTeamConversations();
  const { profile } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useTeamChatNotifications(selectedId);

  const canManageDepartments = profile?.role === 'admin' || profile?.role === 'supervisor';

  const conversations = useMemo<TeamConversation[]>(
    () => inboxRows.map(inboxRowToConversation),
    [inboxRows],
  );

  const selectedConversation = conversations.find(c => c.id === selectedId) || null;

  return (
    <div className="flex h-full w-full bg-inbox-panel">
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
          currentUserId={profile?.id}
          canManageDepartments={canManageDepartments}
          currentUserName={profile?.name ?? ''}
          isLoading={isLoading}
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
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex items-center justify-center h-full"
          >
            <div className="text-center max-w-sm p-8">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm">
                  <Users className="w-9 h-9 text-primary/70" />
                </div>
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-accent/20 flex items-center justify-center"
                >
                  <MessageSquare className="w-4 h-4 text-accent-foreground/60" />
                </motion.div>
              </div>
              <h3 className="text-lg font-extrabold text-foreground mb-2">Chat da Equipe</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                Selecione uma conversa ou inicie uma nova para conversar com seus colegas
              </p>
              <Button
                size="sm"
                className="gap-2 rounded-xl shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="w-4 h-4" />
                Nova conversa
              </Button>
            </div>
          </motion.div>
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
