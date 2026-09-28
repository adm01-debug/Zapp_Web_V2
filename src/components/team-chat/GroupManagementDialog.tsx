import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserMinus, LogOut, Users, Trash2 } from 'lucide-react';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';

interface MemberItem {
  id: string;
  name: string | null;
  avatar_url?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversation: TeamConversation;
  isGroupCreator: boolean;
  currentUserId: string;
  isRenamePending?: boolean;
  isRemovePending?: boolean;
  isLeavePending?: boolean;
  isDeletePending?: boolean;
  onRename: (name: string) => void;
  onRemoveMember: (profileId: string) => void;
  onLeave: () => void;
  onDelete?: () => void;
}

export function GroupManagementDialog({
  open,
  onOpenChange,
  conversation,
  isGroupCreator,
  currentUserId,
  isRenamePending,
  isLeavePending,
  isDeletePending,
  onRename,
  onRemoveMember,
  onLeave,
  onDelete,
}: Props) {
  const [name, setName] = useState(conversation.name ?? '');

  const members = (conversation.members ?? []) as unknown as MemberItem[];

  const handleRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === conversation.name) return;
    onRename(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" aria-hidden />
            Gerenciar grupo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {isGroupCreator && (
            <div className="space-y-2">
              <Label htmlFor="group-name-input">Nome do grupo</Label>
              <div className="flex gap-2">
                <Input
                  id="group-name-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nome do grupo"
                  maxLength={80}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isRenamePending || !name.trim() || name.trim() === conversation.name}
                  onClick={handleRename}
                >
                  {isRenamePending ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}

          {members.length > 0 && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1">
                  Membros ({members.length})
                </p>
                <ul
                  className="space-y-0.5 max-h-52 overflow-y-auto pr-1"
                  aria-label="Membros do grupo"
                >
                  {members.map(member => {
                    const isMe = member.id === currentUserId;
                    const displayName = member.name ?? 'Sem nome';
                    return (
                      <li
                        key={member.id}
                        className="flex items-center gap-2 py-1 rounded hover:bg-muted/40 px-1"
                      >
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarImage src={member.avatar_url ?? undefined} alt={displayName} />
                          <AvatarFallback className="text-3xs">
                            {displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 text-sm truncate">{displayName}</span>
                        {isMe && (
                          <span className="text-3xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            você
                          </span>
                        )}
                        {isGroupCreator && !isMe && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                                aria-label={`Remover ${displayName}`}
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover membro</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remover <strong>{displayName}</strong> do grupo?
                                  Eles precisarão ser adicionados novamente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive hover:bg-destructive/90"
                                  onClick={() => onRemoveMember(member.id)}
                                >
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {!isGroupCreator && (
            <>
              <Separator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isLeavePending}
                  >
                    <LogOut className="w-4 h-4" aria-hidden />
                    {isLeavePending ? 'Saindo…' : 'Sair do grupo'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sair do grupo</AlertDialogTitle>
                    <AlertDialogDescription>
                      Sair de <strong>{conversation.name}</strong>? Você precisará
                      ser adicionado novamente para participar.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={onLeave}
                    >
                      Sair
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {isGroupCreator && onDelete && (
            <>
              <Separator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isDeletePending}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden />
                    {isDeletePending ? 'Excluindo…' : 'Excluir grupo'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir grupo permanentemente</AlertDialogTitle>
                    <AlertDialogDescription>
                      Excluir <strong>{conversation.name || 'este grupo'}</strong>? Todas as mensagens e membros serão removidos. Essa ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={onDelete}
                    >
                      Excluir permanentemente
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
