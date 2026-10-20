import { MessageSquare } from 'lucide-react';
import { ConversationEmptyState } from '@/components/shared/ConversationEmptyState';

export function InboxEmptyChat() {
  return (
    <ConversationEmptyState
      icon={MessageSquare}
      title="Selecione uma conversa"
      description="Escolha uma conversa na lista ao lado para visualizar e responder mensagens"
      className="bg-inbox-panel overflow-hidden"
    />
  );
}
