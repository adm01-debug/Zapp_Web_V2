import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDepartmentInvites, useCreateDepartmentInvite, useRevokeDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';

interface Props {
  departmentId: string;
  currentUserName: string;
  isAdmin: boolean;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active:  { label: 'Ativo',    variant: 'default' },
  revoked: { label: 'Revogado', variant: 'destructive' },
  used:    { label: 'Usado',    variant: 'secondary' },
  expired: { label: 'Expirado', variant: 'outline' },
};

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
          Nenhum convite
        </div>
      ) : (
        <div className="space-y-2">
          {invites.map(invite => {
            const statusMeta = STATUS_BADGE[invite.status] ?? { label: invite.status, variant: 'outline' as const };
            const isActive = invite.status === 'active';
            return (
              <div key={invite.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                <code className="font-mono text-base font-bold tracking-widest text-foreground">
                  {invite.code}
                </code>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={statusMeta.variant} className="text-xs shrink-0">
                      {statusMeta.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {invite.use_count}/{invite.max_uses} uso{invite.max_uses !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
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
                    disabled={revokeMutation.isPending || !isActive}
                    onClick={() => revokeMutation.mutate({ inviteId: invite.id })}
                    aria-label="Revogar convite"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
