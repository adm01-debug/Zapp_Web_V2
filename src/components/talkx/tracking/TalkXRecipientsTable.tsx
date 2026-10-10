// TalkXRecipientsTable.tsx — N-131: tabela completa de destinatários com paginação por cursor,
// filtro por status, busca e painel KPI. Ações de X151 (TalkXRecipientRowActions) incluídas.
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabaseHelpers';
import { IconTile, RailCard, MetaRow, StatusPill, RECIPIENT_STATUS, fmtInt, fmtDateTime, TalkXQueryBoundary, TalkXSkeletonRows, type TalkXQueryLike } from '../talkxShared';
import { TalkXRecipientRowActions } from './TalkXRecipientRowActions';

type RecipRow = { id: string; campaign_id: string; contact_id: string; personalized_message: string | null; status: string; sent_at: string | null; delivered_at: string | null; error_message: string | null; manual_retry_count: number | null; created_at: string; contacts: { name: string; phone: string } | null };

const STATUS_TONE: Record<string, string> = { sent: 'text-dash-green', failed: 'text-dash-red', pending: 'text-foreground-secondary', outcome_unknown: 'text-dash-amber' };
const STATUS_LABEL: Record<string, string> = { sent: 'Enviado', failed: 'Falha', pending: 'Pendente', delivered: 'Entregue', outcome_unknown: 'Confirmação pendente' };

interface TalkXRecipientsTableProps {
  campaignId: string;
}

export function TalkXRecipientsTable({ campaignId }: TalkXRecipientsTableProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [pageRows, setPageRows] = useState<RecipRow[]>([]);
  const [pageTotal, setPageTotal] = useState<number | null>(null);
  const [pageNextCursor, setPageNextCursor] = useState<string | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['talkx-running-recipients-page', campaignId, statusFilter, search],
    queryFn: async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc('talkx_campaign_recipients_page', {
        p_campaign_id: campaignId,
        p_limit: 50,
        p_cursor: cursor ?? null,
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_search: search || null,
      });
      if (rpcError) throw rpcError;
      return rpcData as { rows: RecipRow[]; next_cursor: string | null; total: number };
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (data) {
      setPageRows(data.rows);
      setPageTotal(data.total);
      setPageNextCursor(data.next_cursor);
    }
  }, [data]);

  const loadMore = useCallback(() => {
    if (pageNextCursor) setCursor(pageNextCursor);
  }, [pageNextCursor]);

  const handleStatusChange = useCallback((v: string) => { setStatusFilter(v); setCursor(null); setPageRows([]); }, []);
  const handleSearchChange = useCallback((v: string) => { setSearch(v); setCursor(null); setPageRows([]); }, []);

  const total = pageTotal ?? 0;
  const sentCount = pageRows.filter((r) => r.status === 'sent').length;
  const deliveredCount = pageRows.filter((r) => r.status === 'delivered').length;
  const readCount = pageRows.filter((r) => r.status === 'read').length;
  const repliedCount = pageRows.filter((r) => r.status === 'replied').length;
  const failedCount = pageRows.filter((r) => r.status === 'failed').length;

  return (
    <RailCard>
      {/* Filters — sempre visíveis */}
      <div className="px-4 py-3 border-b border-border/40 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-input/40 border border-border/70 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="h-8 w-auto bg-input/40 border-border/70 text-xs min-w-[130px]"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(RECIPIENT_STATUS).map(([v, m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-foreground-secondary">{`${total} destinatários`}</p>
      </div>

      <TalkXQueryBoundary
        query={{ isLoading, isFetching, isError, error }}
        entity="informações dos destinatários"
        onRetry={() => { void refetch(); }}
        skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
        isEmpty={(pageRows?.length ?? 0) === 0}
        empty={(
          <div className="p-8 text-center">
            <Users className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs font-semibold text-foreground">Nenhum destinatário nesta campanha.</p>
          </div>
        )}
      >
        {/* KPI Panel */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-4 py-3 border-b border-border/40">
          <div className="text-center"><p className="text-lg font-bold text-foreground">{fmtInt(total)}</p><p className="text-2xs text-foreground-secondary">Total</p></div>
          <div className="text-center"><p className="text-lg font-bold text-dash-green">{fmtInt(sentCount)}</p><p className="text-2xs text-foreground-secondary">Enviadas</p></div>
          <div className="text-center"><p className="text-lg font-bold text-primary">{fmtInt(deliveredCount)}</p><p className="text-2xs text-foreground-secondary">Entregues</p></div>
          <div className="text-center"><p className="text-lg font-bold text-dash-amber">{fmtInt(readCount)}</p><p className="text-2xs text-foreground-secondary">Lidas</p></div>
          <div className="text-center"><p className="text-lg font-bold text-dash-blue">{fmtInt(repliedCount)}</p><p className="text-2xs text-foreground-secondary">Respondidas</p></div>
          <div className="text-center"><p className="text-lg font-bold text-dash-red">{fmtInt(failedCount)}</p><p className="text-2xs text-foreground-secondary">Falhas</p></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse">
            <thead><tr>
              {['Contato', 'Telefone', 'Status', 'Enviada em', 'Entregue em', ''].map((h) => (
                <th key={h} className="text-left text-2xs font-semibold text-foreground-secondary px-4 py-2">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(pageRows ?? []).map((r, i) => (
                <tr key={i} className="border-t border-border/40 hover:bg-muted/10">
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground truncate max-w-[180px]">{r.contacts?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground-secondary font-mono">{r.contacts?.phone ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-xs font-semibold ${STATUS_TONE[r.status] ?? 'text-foreground-secondary'}`}>{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="px-4 py-2.5 text-2xs text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-2xs text-muted-foreground">{r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-2xs"><TalkXRecipientRowActions recipient={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageNextCursor && (
            <div className="p-3 text-center">
              <button type="button" onClick={loadMore} className="text-xs font-semibold text-primary hover:underline">Carregar mais</button>
            </div>
          )}
        </div>
      </TalkXQueryBoundary>
    </RailCard>
  );
}
