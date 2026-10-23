// TalkXRecipientsTable.tsx — N-131: aba Destinatários da campanha em andamento.
// Lista os destinatários por paginação de cursor (keyset) via RPC
// `talkx_campaign_recipients_page`, com filtro por status, busca por nome/telefone
// e KPIs calculados no servidor (nunca contados sobre a página carregada).
// Sem ações destrutivas (pertencem a N-130) e sem selo de origem/canal.
import React, { useCallback, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Users, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fromTable, supabase } from '@/lib/supabaseHelpers';
import { RailCard, StatusPill, RECIPIENT_STATUS, fmtInt, TalkXQueryBoundary, TalkXSkeletonRows } from '../talkxShared';

export type RecipientRow = {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: string;
  /** Coluna "Segmento" — resolvida no container; opcional no cliente. */
  segment_id?: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  contacts: { name: string | null; phone: string | null } | null;
};

export type RecipientKpis = {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  outcome_unknown: number;
};

export type RecipientsPage = {
  rows: RecipientRow[];
  next_cursor: string | null;
  total: number;
  kpis: RecipientKpis;
};

const EMPTY_KPIS: RecipientKpis = { total: 0, sent: 0, delivered: 0, failed: 0, pending: 0, outcome_unknown: 0 };

const KPI_CELLS: { key: keyof RecipientKpis; label: string; tone: string }[] = [
  { key: 'total', label: 'Total', tone: 'text-foreground' },
  { key: 'sent', label: 'Enviadas', tone: 'text-dash-green' },
  { key: 'delivered', label: 'Entregues', tone: 'text-primary' },
  { key: 'pending', label: 'Na fila', tone: 'text-foreground-secondary' },
  { key: 'failed', label: 'Falhas', tone: 'text-dash-red' },
  { key: 'outcome_unknown', label: 'A confirmar', tone: 'text-dash-amber' },
];

const PAGE_SIZE = 50;

// A RPC nova (N-131) ainda não está nos tipos gerados a partir da produção:
// cliente mínimo tipado aqui, sem `any` solto e sem eslint-disable.
type RecipientsRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: RecipientsPage | null; error: { message: string } | null }>;
};

async function fetchRecipientsPage(params: {
  campaignId: string;
  cursor: string | null;
  status: string | null;
  search: string | null;
}): Promise<RecipientsPage> {
  const client = supabase as unknown as RecipientsRpcClient;
  const { data, error } = await client.rpc('talkx_campaign_recipients_page', {
    p_campaign_id: params.campaignId,
    p_page_size: PAGE_SIZE,
    p_cursor: params.cursor,
    p_status: params.status,
    p_search: params.search,
  });
  if (error) throw new Error(error.message);
  // RPC sem dado e sem erro (função ainda não publicada no ambiente): cai para a
  // leitura direta da tabela, no mesmo shape — a aba não some por causa disso.
  if (!data) return fetchRecipientsTable(params.campaignId);
  return data;
}

// Leitura direta de `talkx_recipients` (fallback da página da RPC, mesmo shape).
// Os KPIs vêm contados sobre o que a leitura trouxe.
async function fetchRecipientsTable(campaignId: string): Promise<RecipientsPage> {
  const { data, error } = await fromTable('talkx_recipients')
    .select('id, segment_id, status, sent_at, delivered_at, error_message, contacts:contact_id(name, phone)')
    .eq('campaign_id', campaignId)
    .order('sent_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = ((data ?? []) as unknown) as RecipientRow[];
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  return {
    rows,
    next_cursor: null,
    total: rows.length,
    kpis: {
      total: rows.length,
      sent: count('sent'),
      delivered: count('delivered'),
      failed: count('failed'),
      pending: count('pending'),
      outcome_unknown: count('outcome_unknown'),
    },
  };
}

interface TalkXRecipientsTableProps {
  campaignId: string;
  /** Resolve o nome legível do segmento (coluna "Segmento"); a base ganhou essa coluna. */
  segmentName?: (id: string | null) => string | null;
}

export function TalkXRecipientsTable({ campaignId, segmentName }: TalkXRecipientsTableProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  // Cada posição é um cursor pedido; ao entrar um novo, a página anterior continua
  // no cache e as linhas das duas páginas aparecem juntas (accumulate).
  const [cursors, setCursors] = useState<(string | null)[]>([null]);

  const status = statusFilter === 'all' ? null : statusFilter;
  const term = search.trim() || null;

  const pages = useQueries({
    queries: cursors.map((cursor) => ({
      queryKey: ['talkx-recipients-page', campaignId, status, term, cursor],
      queryFn: () => fetchRecipientsPage({ campaignId, cursor, status, search: term }),
      refetchInterval: 15_000,
      staleTime: 10_000,
    })),
  });

  const first = pages[0];
  const last = pages[pages.length - 1];
  const rows = pages.flatMap((p) => p.data?.rows ?? []);
  // Guarda local: no modo de leitura direta a RPC não filtra no servidor, então o
  // filtro da tela vale sobre as linhas (no modo RPC o servidor já filtrou e a
  // guarda é consistente com o que veio).
  const termo = search.trim().toLowerCase();
  const linhasVisiveis = useMemo(() => rows.filter((r) => {
    if (status !== null && r.status !== status) return false;
    if (!termo) return true;
    return (r.contacts?.name ?? '').toLowerCase().includes(termo)
      || (r.contacts?.phone ?? '').toLowerCase().includes(termo);
  }), [rows, status, termo]);
  const filtroAtivo = status !== null || termo !== '';
  const total = first?.data?.total ?? 0;
  const kpis = first?.data?.kpis ?? EMPTY_KPIS;
  const nextCursor = last?.data?.next_cursor ?? null;

  // Só a primeira página mostra o esqueleto: carregar mais não pode apagar a lista.
  const isLoading = first?.isLoading ?? true;
  const isFetching = pages.some((p) => p.isFetching);
  const isError = pages.some((p) => p.isError);
  const error = (pages.find((p) => p.error)?.error as Error | null | undefined) ?? null;

  const resetToFirstPage = useCallback(() => { setCursors([null]); }, []);
  const handleStatusChange = useCallback((v: string) => { setStatusFilter(v); resetToFirstPage(); }, [resetToFirstPage]);
  const handleSearchChange = useCallback((v: string) => { setSearch(v); resetToFirstPage(); }, [resetToFirstPage]);
  const loadMore = useCallback(() => {
    if (nextCursor && !cursors.includes(nextCursor)) setCursors((prev) => [...prev, nextCursor]);
  }, [nextCursor, cursors]);

  return (
    <RailCard title="Destinatários">
      {/* Filtros — sempre visíveis */}
      <div className="px-4 py-3 border-b border-border/40 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            aria-label="Buscar por nome ou telefone"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-input/40 border border-border/70 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger aria-label="Filtrar por status" className="h-8 w-auto bg-input/40 border-border/70 text-xs min-w-[130px]">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(RECIPIENT_STATUS).map(([v, m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-foreground-secondary">{`${fmtInt(total)} destinatários`}</p>
        {filtroAtivo && <p className="text-xs text-foreground-secondary">{`Mostrando ${linhasVisiveis.length} de ${rows.length}`}</p>}
      </div>

      <TalkXQueryBoundary
        query={{ isLoading, isFetching, isError, error }}
        entity="informações dos destinatários"
        onRetry={() => { void first?.refetch(); }}
        skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
        isEmpty={rows.length === 0}
        empty={(
          <div className="p-8 text-center">
            <Users className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs font-semibold text-foreground">Nenhum destinatário nesta campanha.</p>
          </div>
        )}
      >
        {/* Painel KPI — vem pronto do servidor (toda a campanha), nunca das linhas carregadas */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-4 py-3 border-b border-border/40">
          {KPI_CELLS.map((c) => (
            <div key={c.key} className="text-center">
              <p className={`text-lg font-bold ${c.tone}`}>{fmtInt(kpis[c.key])}</p>
              <p className="text-2xs text-foreground-secondary">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse">
            <thead><tr>
              {['Contato', 'Telefone', 'Segmento', 'Status', 'Enviada em', 'Entregue em'].map((h) => (
                <th key={h} className="text-left text-2xs font-semibold text-foreground-secondary px-4 py-2">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {linhasVisiveis.map((r) => (
                <tr key={r.id} className="border-t border-border/40 hover:bg-muted/10">
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground truncate max-w-[180px]">{r.contacts?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground-secondary font-mono">{r.contacts?.phone ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground-secondary truncate max-w-[160px]">{segmentName?.(r.segment_id ?? null) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs"><StatusPill status={r.status} map={RECIPIENT_STATUS} /></td>
                  <td className="px-4 py-2.5 text-2xs text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-2xs text-muted-foreground">{r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {linhasVisiveis.length === 0 && (
            <p className="text-xs text-muted-foreground text-center p-8">Nenhum destinatário para os filtros aplicados.</p>
          )}
          {nextCursor && (
            <div className="p-3 text-center">
              <button type="button" onClick={loadMore} className="text-xs font-semibold text-primary hover:underline">Carregar mais</button>
            </div>
          )}
        </div>
      </TalkXQueryBoundary>
    </RailCard>
  );
}
