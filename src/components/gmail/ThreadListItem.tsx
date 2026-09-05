import { motion } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Star, AlertCircle } from 'lucide-react';
import type { EmailThread } from '@/hooks/integrations/useGmail';

function getInitials(name: string | null | undefined, email?: string): string {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (email) return email[0]?.toUpperCase() || '?';
  return '?';
}

function formatThreadDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000 && date.getDate() === now.getDate()) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return date.toLocaleDateString('pt-BR', { weekday: 'short' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

interface ThreadListItemProps {
  thread: EmailThread;
  isSelected: boolean;
  onClick: () => void;
}

export function ThreadListItem({ thread, isSelected, onClick }: ThreadListItemProps) {
  // h538172: remetente real em vez de "1ª palavra do snippet"
  const displayName = thread.contact?.name
    || thread.last_from_name
    || thread.last_from_address
    || thread.contact?.email
    || 'Desconhecido';
  // Mesma cadeia do nome para as iniciais: sem isso, thread sem contato mas com
  // last_from_name mostrava "Maria Silva" no nome e "?" no avatar.
  const initialsSource = thread.contact?.name
    || thread.last_from_name
    || thread.last_from_address
    || thread.contact?.email
    || undefined;

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onClick}
      className={`w-full text-left p-3 flex items-start gap-3 transition-colors border-b border-secondary/10 min-h-[64px] ${
        isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-secondary/5'
      } ${thread.is_unread ? '' : 'opacity-80'}`}
    >
      <Avatar className="h-9 w-9 shrink-0 mt-0.5">
        <AvatarFallback className={`text-xs ${thread.is_unread ? 'bg-primary/10 text-primary font-bold' : 'bg-secondary/20'}`}>
          {getInitials(initialsSource)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm truncate ${thread.is_unread ? 'font-semibold' : 'font-normal'}`}>{displayName}</span>
          {thread.message_count > 1 && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{thread.message_count}</Badge>}
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{thread.last_message_at && formatThreadDate(thread.last_message_at)}</span>
        </div>
        <p className={`text-xs truncate ${thread.is_unread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{thread.subject || '(Sem assunto)'}</p>
        <div className="flex items-start gap-1.5 mt-0.5">
          <p className="text-xs text-muted-foreground line-clamp-2 leading-snug flex-1 min-w-0">{thread.snippet}</p>
          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
            {thread.is_starred && <Star className="w-3 h-3 text-warning fill-warning" />}
            {thread.is_important && <AlertCircle className="w-3 h-3 text-warning" />}
          </div>
        </div>
        {thread.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {thread.tags.slice(0, 3).map(tag => <Badge key={tag} title={tag} variant="secondary" className="text-[9px] px-1 py-0">{tag}</Badge>)}
          </div>
        )}
      </div>
    </motion.button>
  );
}
