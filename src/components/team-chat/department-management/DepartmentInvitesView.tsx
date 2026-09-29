import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDepartmentInvites, useCreateDepartmentInvite, useRevokeDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';

interface Props {
  departmentId: string;
  currentUserName: string;
  isAdmin: boolean;
}

export function DepartmentInvitesView({ departmentId, currentUserName, isAdmin }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { data: invites = [], isLoading } = useDepartmentInvites(departmentId);
  const createMutation = useCreateDepartmentInvite(departmentId);
  const revokeMutation = useRevokeDepartmentInvite(departmentId);

  const handleCopy = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate({})}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Gerar código
          </Button>
        </div>
      )}

      {invites.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Nenhum convite ativo
        </div>
      ) : (
        <div className="space-y-2">
          {invites.map(invite => (
            <div key={invite.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
              <code className="flex-1 font-mono text-base font-bold tracking-widest text-foreground">
                {invite.code}
              </code>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  Expira {format(new Date(invite.expires_at), "dd 'de' MMM", { locale: ptBR })}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => handleCopy(invite.code, invite.id)}
                aria-label="Copiar código"
              >
                {copiedId === invite.id
                  ? <Check className="w-4 h-4 text-green-600" />
                  : <Copy className="w-4 h-4" />
                }
              </Button>
              {isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate({ inviteId: invite.id })}
                  aria-label="Excluir convite"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
