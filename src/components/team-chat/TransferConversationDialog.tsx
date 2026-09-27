import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { useTransferConversation } from '@/hooks/team-chat/useTeamChatMutations';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversation: TeamConversation;
  currentUserId: string;
}

export function TransferConversationDialog({ open, onOpenChange, conversation, currentUserId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const transferMutation = useTransferConversation();

  const memberIds = (conversation.members ?? [])
    .map(m => m.profile_id)
    .filter(id => id !== currentUserId);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['transfer-dialog-members', conversation.id, memberIds.join(',')],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, job_title')
        .in('id', memberIds);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; avatar_url: string | null; job_title: string | null }[];
    },
    enabled: open && memberIds.length > 0,
  });

  const handleClose = () => {
    setSelectedId(null);
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (!selectedId) return;
    transferMutation.mutate(
      { conversationId: conversation.id, newOwnerId: selectedId },
      { onSuccess: handleClose },
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transferir propriedade do grupo</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Selecione um membro para se tornar o novo administrador. Você continuará como membro do grupo.
        </p>

        {isLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Carregando membros...</div>
        ) : members.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Nenhum outro membro disponível.</div>
        ) : (
          <ul
            className="space-y-1 max-h-52 overflow-y-auto"
            role="listbox"
            aria-label="Selecionar novo administrador do grupo"
          >
            {members.map(m => (
              <li
                key={m.id}
                role="option"
                aria-selected={selectedId === m.id}
                tabIndex={0}
                onClick={() => setSelectedId(m.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(m.id); } }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                  selectedId === m.id
                    ? 'bg-primary/10 border border-primary/40'
                    : 'hover:bg-muted/50 border border-transparent',
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.name} />}
                  <AvatarFallback className="text-xs">
                    {(m.name ?? '??').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  {m.job_title && (
                    <p className="text-xs text-muted-foreground truncate">{m.job_title}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={transferMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!selectedId || transferMutation.isPending}
            onClick={handleConfirm}
          >
            {transferMutation.isPending ? 'Transferindo...' : 'Confirmar transferência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
