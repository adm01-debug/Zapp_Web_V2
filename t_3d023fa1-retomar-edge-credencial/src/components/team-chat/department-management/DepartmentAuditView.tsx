import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDepartmentAuditLogs } from '@/hooks/team-chat/useDepartmentManagement';

interface Props {
  departmentId: string;
}

const ACTION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  add_member: { label: 'Inclusão', variant: 'default' },
  remove_member: { label: 'Remoção', variant: 'destructive' },
  create_invite: { label: 'Convite criado', variant: 'secondary' },
  delete_invite: { label: 'Convite excluído', variant: 'outline' },
  save_whatsapp: { label: 'WhatsApp', variant: 'secondary' },
};

export function DepartmentAuditView({ departmentId }: Props) {
  const { data: logs = [], isLoading } = useDepartmentAuditLogs(departmentId);

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {logs.length} registro{logs.length !== 1 ? 's' : ''}
      </p>

      {logs.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Nenhuma atividade registrada
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const meta = ACTION_LABELS[log.action] ?? { label: log.action, variant: 'outline' as const };
            const actorName = (log.details?.profile_name as string | undefined) ?? 'Sistema';
            const date = format(new Date(log.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR });
            return (
              <div key={log.id} className="flex items-center gap-3 py-2 px-1 text-sm">
                <Badge variant={meta.variant} className="shrink-0 text-xs">{meta.label}</Badge>
                <span className="flex-1 text-muted-foreground truncate">{actorName}</span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{date}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
