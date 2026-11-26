import React, { useId } from 'react';
import { History, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconTile, TalkXEmptyState, TalkXErrorState, fmtDateTime } from '../talkxShared';
import {
  describeLogError,
  formatLogDuration,
  outcomeLabel,
  outcomeTone,
  stageLabel,
  useTalkXCampaignLogs,
  type TalkXCampaignLogPerson,
  type TalkXCampaignLogRow,
} from '@/hooks/integrations/useTalkXCampaignLogs';
import { useCRMAdminAccess } from '@/hooks/crm/useCRMAdminAccess';

/**
 * C-11 — bloco "Log de entrega" do painel de campanha (Analytics).
 *
 * Responde a pergunta que a tela não respondia: "por que este destinatário não
 * recebeu?". Os dados vêm de `talkx_campaign_logs` (admin/supervisor), uma
 * linha por etapa por tentativa — nunca de contagem feita no cliente.
 */

export interface TalkXCampaignLogsCardProps {
  rows: TalkXCampaignLogRow[];
  people?: Record<string, TalkXCampaignLogPerson>;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** `false` = sem permissão; `undefined` = permissão ainda sendo checada. */
  canView?: boolean;
}

const COLUMNS: [string, string][] = [
  ['Quando', '132px'],
  ['Destinatário', '170px'],
  ['Etapa', '150px'],
  ['Tentativa', '80px'],
  ['Resultado', '120px'],
  ['HTTP', '64px'],
  ['Erro', '190px'],
  ['Duração', '84px'],
];

function recipientLabel(
  row: TalkXCampaignLogRow,
  people: Record<string, TalkXCampaignLogPerson>,
): { primary: string; secondary: string | null } {
  const person = row.recipientId ? people[row.recipientId] : undefined;
  if (person?.name || person?.phone) {
    return { primary: person.name ?? person.phone ?? '—', secondary: person.name ? person.phone : null };
  }
  if (row.recipientId) {
    return { primary: `Destinatário ${row.recipientId.slice(0, 8)}`, secondary: 'Nome indisponível' };
  }
  return { primary: '—', secondary: null };
}

export function TalkXCampaignLogsCard({
  rows,
  people = {},
  isLoading = false,
  isError = false,
  error,
  onRetry,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  canView,
}: TalkXCampaignLogsCardProps) {
  const captionId = useId();
  const semPermissao = canView === false;
  const mostrarTabela = !semPermissao && !isLoading && !isError && rows.length > 0;

  return (
    <section className="rounded-xl border border-border/70 bg-input/20 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <IconTile icon={History} color="blue" size={36} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Log de entrega</p>
            <p className="text-2xs text-foreground-secondary">
              {semPermissao
                ? 'Restrito a administradores e supervisores'
                : isLoading
                  ? 'Carregando execuções…'
                  : `${rows.length.toLocaleString('pt-BR')} ${rows.length === 1 ? 'execução carregada' : 'execuções carregadas'}`}
            </p>
          </div>
        </div>
      </div>

      {semPermissao && (
        <p role="status" className="text-xs text-foreground-secondary">
          Somente administradores e supervisores podem ver por onde cada envio passou.
        </p>
      )}

      {!semPermissao && isError && (
        <TalkXErrorState entity="execuções da campanha" error={error} onRetry={onRetry} />
      )}

      {!semPermissao && !isError && isLoading && (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {!semPermissao && !isError && !isLoading && rows.length === 0 && (
        <TalkXEmptyState
          title="Nenhuma execução registrada"
          description="Cada tentativa do motor (reserva, checagem, envio, conclusão) aparece aqui. Campanhas que ainda não dispararam ficam sem linhas."
        />
      )}

      {mostrarTabela && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse" aria-describedby={captionId}>
            <caption id={captionId} className="sr-only">
              Execuções do motor de envio desta campanha, da mais antiga para a mais recente.
            </caption>
            <thead>
              <tr>
                {COLUMNS.map(([header, width]) => (
                  <th
                    key={header}
                    style={{ minWidth: width }}
                    className="text-left text-2xs font-semibold text-foreground-secondary px-2 py-2"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const destinatario = recipientLabel(row, people);
                const erro = describeLogError(row.errorCode);
                return (
                  <tr key={row.id} className="border-t border-border/40 hover:bg-muted/10">
                    <td className="px-2 py-2 text-2xs text-foreground-secondary whitespace-nowrap">{fmtDateTime(row.createdAt)}</td>
                    <td className="px-2 py-2 text-xs text-foreground">
                      <span className="block truncate max-w-[170px]">{destinatario.primary}</span>
                      {destinatario.secondary && (
                        <span className="block text-2xs text-muted-foreground font-mono">{destinatario.secondary}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-foreground-secondary">{stageLabel(row.stage)}</td>
                    <td className="px-2 py-2 text-xs text-foreground-secondary tabular-nums">{row.attempt > 0 ? `#${row.attempt}` : '—'}</td>
                    <td className={cn('px-2 py-2 text-xs font-semibold', outcomeTone(row.outcome))}>{outcomeLabel(row.outcome)}</td>
                    <td className="px-2 py-2 text-2xs text-foreground-secondary tabular-nums">{row.httpStatus ?? '—'}</td>
                    <td className="px-2 py-2 text-2xs text-foreground-secondary">
                      {erro ? (
                        <>
                          <span className="block truncate max-w-[190px]" title={erro}>{erro}</span>
                          {row.errorCode && row.errorCode !== erro && (
                            <span className="block text-2xs text-muted-foreground font-mono">{row.errorCode}</span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2 text-2xs text-foreground-secondary tabular-nums whitespace-nowrap">{formatLogDuration(row.durationMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mostrarTabela && (
        <div className="mt-3 flex items-center justify-center">
          {hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className={cn(
                'h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium inline-flex items-center gap-1.5',
                'hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              Carregar mais
            </button>
          ) : (
            <p className="text-2xs text-muted-foreground">Fim do log — nenhuma execução anterior.</p>
          )}
        </div>
      )}
    </section>
  );
}

/** Container do painel E74: liga a campanha selecionada ao hook do servidor. */
export function TalkXCampaignLogsPanel({ campaignId }: { campaignId: string | null | undefined }) {
  const logs = useTalkXCampaignLogs(campaignId);
  // A RPC exige admin/supervisor (42501). `null` = ainda checando: nesse caso a
  // tela não afirma falta de permissão, mostra o carregamento.
  const admin = useCRMAdminAccess();
  return (
    <TalkXCampaignLogsCard
      rows={logs.rows}
      people={logs.people}
      isLoading={logs.isLoading || admin === null}
      isError={logs.isError}
      error={logs.error}
      onRetry={logs.refetch}
      hasMore={logs.hasMore}
      isLoadingMore={logs.isLoadingMore}
      onLoadMore={logs.loadMore}
      canView={admin === null ? undefined : admin}
    />
  );
}