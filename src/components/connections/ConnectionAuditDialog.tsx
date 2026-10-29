import { FileClock, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { connectionAuditActionLabel, useConnectionAuditLogs } from '@/hooks/inbox/useConnectionAuditLogs';

/**
 * t_9cc4f1c2 — leitura, só para admin, da trilha de auditoria de uma conexão.
 * Mostra ação, quem e quando, paginado. Sem telefone, QR, token ou conteúdo de
 * conversa — a conexão só aparece pelo nome que o cartão já exibe.
 */
interface ConnectionAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionName: string;
  instanceId: string | null;
}

export function ConnectionAuditDialog({
  open, onOpenChange, connectionName, instanceId,
}: ConnectionAuditDialogProps) {
  const { entries, actorNames, total, page, pageCount, loading, error, setPage } =
    useConnectionAuditLogs(instanceId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileClock className="w-5 h-5" />
            Auditoria — {connectionName}
          </DialogTitle>
          <DialogDescription>
            O que aconteceu nesta conexão, quem fez e quando. Visível apenas para administradores.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[360px] pr-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
              <span className="ml-2 text-sm">Carregando auditoria…</span>
            </div>
          ) : error ? (
            <p role="alert" className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum evento de auditoria registrado para esta conexão.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-lg bg-muted/30 p-3">
                  <p className="text-sm font-medium">{connectionAuditActionLabel(entry.action)}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.user_id ? actorNames.get(entry.user_id) ?? 'Funcionário' : 'Sistema'}
                    {' · '}
                    <time dateTime={entry.created_at}>
                      {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {total === 0
              ? 'Nenhum evento'
              : `${total} evento${total > 1 ? 's' : ''} — página ${page + 1} de ${pageCount}`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage(page - 1)}
              aria-label="Página anterior da auditoria"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount || loading}
              onClick={() => setPage(page + 1)}
              aria-label="Próxima página da auditoria"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
