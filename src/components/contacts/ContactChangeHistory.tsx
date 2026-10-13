import { useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Edit, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  logChangeLogError,
  useContactChangeLog,
  type ContactChangeLogEntry,
  type ContactChangeOperation,
} from '@/hooks/crm/useContactChangeLog';

/**
 * Seção "Histórico" da ficha do contato: a trilha de alterações
 * (`contact_change_log`, cartão de banco t_ba716533) lida pelo hook
 * `useContactChangeLog` (t_a364a46c).
 *
 * O que o vendedor vê por linha: QUEM alterou, QUANDO e QUAIS campos — nunca os
 * valores (a trilha grava só o nome da coluna, sem PII).
 *
 * Estados explícitos: carregando (esqueleto), erro (com "Tentar novamente") e
 * vazio. Contato sem alteração não pode parecer "carregando para sempre".
 *
 * Parâmetro de layout: o painel tem 380 px no desktop e a largura da tela no
 * celular — por isso o conteúdo é `min-w-0` + `flex-wrap` e nada de largura
 * fixa; a data/ator vão em `text-2xs` (11 px, o piso da escala do sistema).
 */
const OPERATION_CONFIG: Record<
  ContactChangeOperation,
  { icon: React.ElementType; color: string; bg: string }
> = {
  insert: { icon: UserPlus, color: 'text-success', bg: 'bg-success/10' },
  update: { icon: Edit, color: 'text-warning', bg: 'bg-warning/10' },
  soft_delete: { icon: Trash2, color: 'text-destructive', bg: 'bg-destructive/10' },
  restore: { icon: RotateCcw, color: 'text-info', bg: 'bg-info/10' },
};

const UNKNOWN_OPERATION = OPERATION_CONFIG.update;

/** Nome do ator para a tela; sem nome (perfil excluído / escrita sem JWT) é honesto, não inventa. */
function actorLabel(entry: ContactChangeLogEntry): string {
  return entry.hasActor && entry.actorName ? entry.actorName : 'Autor não identificado';
}

export interface ContactChangeHistoryProps {
  contactId: string;
  className?: string;
}

export function ContactChangeHistory({ contactId, className }: ContactChangeHistoryProps) {
  const { entries, isLoading, error, isEmpty, refetch } = useContactChangeLog(contactId);

  useEffect(() => {
    if (error) logChangeLogError(error);
  }, [error]);

  return (
    <section
      data-testid="change-history"
      aria-labelledby="contact-change-history-title"
      className={cn('min-w-0', className)}
    >
      <h3
        id="contact-change-history-title"
        className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"
      >
        <Clock className="w-3 h-3" aria-hidden="true" />
        Histórico
      </h3>

      {isLoading ? (
        <div
          className="space-y-2"
          data-testid="change-history-loading"
          role="status"
          aria-label="Carregando histórico de alterações"
        >
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-muted/20 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="space-y-2" data-testid="change-history-error">
          <p className="text-2xs text-muted-foreground">
            Não foi possível carregar o histórico de alterações.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-2xs"
            onClick={() => {
              void refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="text-center py-4" data-testid="change-history-empty">
          <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" aria-hidden="true" />
          <p className="text-2xs text-muted-foreground">
            Nenhuma alteração registrada para este contato
          </p>
        </div>
      ) : (
        <div className="relative min-w-0">
          {/* Linha do tempo: mesma linguagem visual da linha do tempo de atividade. */}
          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-border/50" aria-hidden="true" />
          <ul className="min-w-0" data-testid="change-history-list">
            {entries.map((entry) => {
              const config = OPERATION_CONFIG[entry.operation] ?? UNKNOWN_OPERATION;
              const Icon = config.icon;
              return (
                <li key={entry.id} className="relative flex gap-3 min-w-0 py-2">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 z-10',
                      config.bg,
                    )}
                  >
                    <Icon className={cn('w-3.5 h-3.5', config.color)} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <p className="text-xs font-medium text-foreground">{entry.operationLabel}</p>
                      <span className="text-2xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.performedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-2xs text-muted-foreground truncate">{actorLabel(entry)}</p>
                    {entry.fieldLabels.length > 0 && (
                      <ul className="flex flex-wrap gap-1 mt-1 min-w-0">
                        {entry.fieldLabels.map((label) => (
                          <li key={label}>
                            <Badge variant="outline" className="text-2xs font-normal">
                              {label}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
