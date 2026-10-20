import { useState } from 'react';
import { useTeamConversations } from '@/hooks/chat/useTeamChat';
import { TeamConversationList } from './TeamConversationList';
import { TeamChatPanel } from './TeamChatPanel';
import { TeamMemberDetails } from './TeamMemberDetails';
import { NewConversationDialog } from './NewConversationDialog';
import { MessageSquare, Users, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamChatNotifications } from '@/hooks/chat/useTeamChatNotifications';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export function TeamChatView() {
  const { data: conversations = [], isLoading } = useTeamConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Enable differentiated notifications for team chat
  useTeamChatNotifications(selectedId);

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
