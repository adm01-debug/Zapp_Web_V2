import React, { useMemo, useState } from 'react';
import {
  Users, Play, CheckCircle2, Target, Send, MoreVertical, Eye, Pencil, Zap, Plus,
  FileText, Bookmark, MessageSquare, BarChart3, Loader2,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { ProgressBar, VerTodasButton } from '@/components/dashboard/overview/DashboardCard';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';
import {
  CAMPAIGN_STATUS, FilterBarV2, TalkXPagination, Th, Td, StatusPill, RailCard, RailAction, IconTile,
  TalkXEmptyState, TalkXFilteredEmptyState, TalkXSkeletonRows, KpiCard, KpiCardSkeleton, HeroCard, RecentList, TipCard,
  InsightCard, TalkXQueryBoundary,
  fmtInt, fmtPct, pct, fmtDateTime, fmtAgo, barsByDay, OBJECTIVES, TALKX_CHANNELS,
} from './talkxShared';
import type { TalkXPeriodRange } from './kit/periods';
import { useTalkXInsights } from '@/hooks/integrations/useTalkXInsights';
import { useCampaignRowActions } from './useCampaignRowActions';

const STORAGE_KEY = 'talkx.overview.filters';
const LAYOUT_KEY = 'talkx.overview.layout';
function loadFilters() {
  try { const s = sessionStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
/** X081 — a alternância lista/grade é preferência do usuário: fica no localStorage. */
function loadLayout(): 'list' | 'grid' {
  try { return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
}
/**
 * Data de referência da campanha para o recorte de período — a mesma que a lista
 * mostra em "Agendada em" (agendada → iniciada → criada), para que o filtro de
 * período não esconda linha cuja data está dentro do intervalo escolhido.
 */
function campaignDate(c: TalkXCampaign): string {
  return c.scheduled_at ?? c.started_at ?? c.created_at;
}

interface Props {
  campaigns: TalkXCampaign[];
  segments: TalkXSegment[];
  creators: Record<string, string>;
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
  /**
   * Refaz a consulta de campanhas sem mexer em filtros nem rota. Serve o
   * "Tentar novamente" do erro (X047) e o ⟳ da barra de filtros (X081): o ⟳ gira
   * enquanto a promessa devolvida aqui não resolve.
   */
  onRetry?: () => void | Promise<unknown>;
  onNew: () => void;
  onEdit: (c: TalkXCampaign) => void;
  onView: (c: TalkXCampaign) => void;
  onViewScheduled?: (c: TalkXCampaign) => void;
  onViewRunning?: (c: TalkXCampaign) => void;
  onDuplicate: (c: TalkXCampaign) => void;
  onStart: (id: string) => void;
  /** O motivo é obrigatório na pausa e vai junto com a ação para o servidor. */
  onPause: (id: string, reason: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onGoTab: (tab: string) => void;
}

const OBJ_COLOR: Record<string, 'blue' | 'green' | 'red' | 'violet' | 'amber'> = { vendas: 'green', engajamento: 'blue', reativacao: 'amber', relacionamento: 'violet', pesquisa: 'blue', institucional: 'red' };

export function TalkXOverview({ campaigns, segments, creators, isLoading, isError, error, onRetry, onNew, onEdit, onView, onViewScheduled, onViewRunning, onDuplicate, onStart, onPause, onCancel, onDelete, onGoTab }: Props) {
  const saved = useMemo(() => loadFilters(), []);
  const { data: insights } = useTalkXInsights();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(() => saved?.status ?? 'all');
  const [objective, setObjective] = useState<string>(() => saved?.objective ?? 'all');
  const [channel, setChannel] = useState<string>(() => saved?.channel ?? 'all');
  const [segment, setSegment] = useState<string>(() => saved?.segment ?? 'all');
  const [creator, setCreator] = useState<string>(() => saved?.creator ?? 'all');
  const [period, setPeriod] = useState<string | null>(null);
  const [periodRange, setPeriodRange] = useState<TalkXPeriodRange | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [layout, setLayout] = useState<'list' | 'grid'>(loadLayout);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // X080 — as ações de linha (matriz por status + confirmação das ações que
  // mudam o estado da campanha) ficam em um lugar só e servem a tabela, a grade
  // e as "Últimas campanhas".
  const rowActions = useCampaignRowActions({
    onView, onViewScheduled, onViewRunning, onEdit, onStart, onPause, onCancel, onDelete, onDuplicate,
  });

  React.useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ status, objective, channel, segment, creator })); } catch { /* ignore */ }
  }, [status, objective, channel, segment, creator]);

  // X081 — a alternância lista/grade é preferência: sobrevive ao recarregar a tela.
  React.useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, layout); } catch { /* ignore */ }
  }, [layout]);

  const segmentName = (id?: string | null) => segments.find((s) => s.id === id)?.name;

  const filterValues = useMemo(() => ({ status, objective, channel, segment, creator }), [status, objective, channel, segment, creator]);
  const handleFilter = (key: string, val: string) => {
    if (key === 'status') { setStatus(val); setPage(1); }
    else if (key === 'objective') { setObjective(val); setPage(1); }
    else if (key === 'channel') { setChannel(val); setPage(1); }
    else if (key === 'segment') { setSegment(val); setPage(1); }
    else if (key === 'creator') { setCreator(val); setPage(1); }
  };
  /**
   * X081 — o chip de período só aparece porque a Visão geral consome o recorte
   * (R2-MOD-059): o intervalo recebido aqui corta a lista e os KPIs.
   */
  const handlePeriod = (p: string | null, range?: TalkXPeriodRange | null) => {
    setPeriod(p);
    setPeriodRange(range ?? null);
    setPage(1);
  };
  /**
   * ⟳ da barra — refaz a consulta de campanhas (a mesma que alimenta lista e KPIs)
   * e gira enquanto ela busca. O `finally` solta o giro também quando a consulta
   * falha (o erro é mostrado pelo boundary, o giro não pode ficar preso).
   */
  const handleRefresh = React.useCallback(async () => {
    if (!onRetry || refreshing) return;
    setRefreshing(true);
    try { await onRetry(); } catch { /* o boundary mostra o erro da consulta */ } finally { setRefreshing(false); }
  }, [onRetry, refreshing]);
  const periodAtivo = period !== null && period !== 'all';
  const hasActive = status !== 'all' || objective !== 'all' || channel !== 'all' || segment !== 'all' || creator !== 'all' || periodAtivo || search.trim() !== '';
  const clear = () => { setSearch(''); setStatus('all'); setObjective('all'); setChannel('all'); setSegment('all'); setCreator('all'); setPeriod(null); setPeriodRange(null); setPage(1); };

  const filterDefs = useMemo(() => [
    { key: 'status',    label: 'Todos os status',    allLabel: 'Todos os status',    options: Object.entries(CAMPAIGN_STATUS).map(([v, m]) => ({ value: v, label: m.label })) },
    { key: 'objective', label: 'Todos os objetivos', allLabel: 'Todos os objetivos', options: OBJECTIVES.map((o) => ({ value: o.value, label: o.label })) },
    // A15 — o motor só envia por WhatsApp: as opções são as de TALKX_CHANNELS.
    { key: 'channel',   label: 'Todos os canais',    allLabel: 'Todos os canais',    options: TALKX_CHANNELS.map((c) => ({ value: c.value, label: c.label })) },
    { key: 'segment',   label: 'Todos os segmentos', allLabel: 'Todos os segmentos', options: [{ value: 'manual', label: 'Seleção manual' }, ...segments.map((s) => ({ value: s.id, label: s.name }))] },
    { key: 'creator',   label: 'Todos os criadores', allLabel: 'Todos os criadores', options: Object.entries(creators).map(([id, n]) => ({ value: id, label: n })) },
  ], [segments, creators]);

  // X081 — o recorte de data vale para a lista E para os KPIs (os KPIs saem da
  // mesma coleção recortada, não da lista inteira).
  const noPeriodo = useMemo(() => {
    if (!periodRange) return campaigns;
    const from = periodRange.from.getTime();
    const to = periodRange.to.getTime();
    return campaigns.filter((c) => {
      const t = new Date(campaignDate(c)).getTime();
      return t >= from && t <= to;
    });
  }, [campaigns, periodRange]);

  const filtered = useMemo(() => {
    let r = noPeriodo;
    if (status !== 'all') r = r.filter((c) => c.status === status);
    if (objective !== 'all') r = r.filter((c) => (c.objective ?? 'engajamento') === objective);
    // A15/T01-032 — só existe o canal WhatsApp: escolher o canal real não
    // descarta nada; um valor fora de TALKX_CHANNELS (sessão antiga) não casa.
    if (channel !== 'all' && !TALKX_CHANNELS.some((ch) => ch.value === channel)) r = [];
    if (segment !== 'all') r = r.filter((c) => (segment === 'manual' ? !c.segment_id : c.segment_id === segment));
    if (creator !== 'all') r = r.filter((c) => c.created_by === creator);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((c) => c.name.toLowerCase().includes(q) || c.message_template.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q));
    }
    return r;
  }, [noPeriodo, status, objective, channel, segment, creator, search]);

  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totals = useMemo(() => {
    const sent = noPeriodo.reduce((a, c) => a + c.sent_count, 0);
    const failed = noPeriodo.reduce((a, c) => a + c.failed_count, 0);
    return {
      total: noPeriodo.length,
      active: noPeriodo.filter((c) => c.status === 'sending' || c.status === 'paused').length,
      completed: noPeriodo.filter((c) => c.status === 'completed').length,
      successRate: sent + failed > 0 ? Math.round((sent / (sent + failed)) * 1000) / 10 : null,
      reached: sent,
      bars: barsByDay(noPeriodo.map((c) => c.created_at)),
      barsCompleted: barsByDay(noPeriodo.filter((c) => c.status === 'completed').map((c) => c.completed_at)),
    };
  }, [noPeriodo]);

  // X081 — o recorte de data vale para a lista, para os KPIs e para o rail
  // ("Últimas campanhas"): um filtro que só vale em uma parte da tela mostra
  // campanha fora do período escolhido.
  const latest = useMemo(() => [...noPeriodo].sort((a, b) => (b.started_at ?? b.updated_at).localeCompare(a.started_at ?? a.updated_at)).slice(0, 4), [noPeriodo]);

  const toggleAll = () => setSelected((prev) => prev.size === pageItems.length ? new Set() : new Set(pageItems.map((c) => c.id)));

  // X047 — a Visão geral passa pelo boundary de consulta: carregando -> erro ->
  // vazio -> conteúdo. Com a consulta em erro a tela mostra o erro com retry
  // (nunca o vazio), e o retry só refaz a consulta — filtros e rota ficam como estão.
  return (
    <TalkXQueryBoundary
      query={{ isLoading, isError, error }}
      entity="campanhas"
      onRetry={onRetry}
      skeleton={
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 min-w-0">
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)}
            </div>
            <div className="rounded-2xl bg-card border border-border/70 p-4"><TalkXSkeletonRows rows={5} /></div>
          </div>
        </div>
      }
      isEmpty={campaigns.length === 0}
      empty={<div className="p-4"><TalkXEmptyState preset="emptyCampaigns" onAction={onNew} /></div>}
    >
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
            <KpiCard icon={Users}         color="blue"   index={0} label="Total de campanhas"   value={fmtInt(totals.total)}    bars={totals.bars} />
            <KpiCard icon={Play}          color="blue"   index={1} label="Em andamento"          value={fmtInt(totals.active)} />
            <KpiCard icon={CheckCircle2}  color="green"  index={2} label="Concluídas"            value={fmtInt(totals.completed)} bars={totals.barsCompleted} />
            <KpiCard icon={Target}        color="green"  index={3} label="Taxa de sucesso"       value={totals.successRate===null?'—':`${totals.successRate}%`} />
            <KpiCard icon={Send}          color="violet" index={4} label="Contatos alcançados"   value={fmtInt(totals.reached)} />
          </div>

        {/* Filtros */}
        <FilterBarV2
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar campanhas…"
          filters={filterDefs} values={filterValues} onFilter={handleFilter}
          hasActive={hasActive} onClear={clear}
          period={period} onPeriodChange={handlePeriod}
          onRefresh={onRetry ? handleRefresh : undefined} refreshing={refreshing}
          view={layout} onView={setLayout}
        />

        {/* E68: Rascunhos pendentes */}
        {(() => {
          const drafts = campaigns.filter((c) => c.status === 'draft');
          if (drafts.length === 0) return null;
          return (
            <section className="rounded-2xl bg-card border border-dash-amber/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-dash-amber" />
                  <p className="text-[13px] font-semibold text-foreground">Rascunhos pendentes</p>
                  <span className="text-2xs text-muted-foreground">({drafts.length})</span>
                </div>
              </div>
              <div className="divide-y divide-border/50">
                {drafts.slice(0, 5).map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-dash-amber/20 border border-dash-amber/30 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-dash-amber" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{c.name || 'Sem nome'}</p>
                        <p className="text-2xs text-muted-foreground">{fmtAgo(c.updated_at)}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => onEdit(c)} className="h-8 px-3 rounded-lg text-xs font-medium border border-dash-amber/40 bg-dash-amber/10 text-dash-amber hover:bg-dash-amber/20 shrink-0 flex items-center gap-1.5">
                      <Pencil className="w-3.5 h-3.5" />Retomar
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* E94: Insights heurísticos */}
        {insights && insights.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-semibold text-foreground">Insights</span>
              <span className="text-xs text-muted-foreground">({insights.length})</span>
            </div>
            <div className="space-y-2">
              {insights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  type={insight.type}
                  title={insight.title}
                  description={insight.description}
                  priority={insight.priority}
                  applyLabel={insight.applyLabel}
                  onApply={insight.apply}
                />
              ))}
            </div>
          </section>
        )}

        {/* Tabela */}
        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-4"><TalkXFilteredEmptyState onClearFilters={clear} /></div>
          ) : layout === 'grid' ? (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
              {pageItems.map((c) => <CampaignGridCard key={c.id} c={c} segmentName={segmentName(c.segment_id)} onView={() => onView(c)} onEdit={() => onEdit(c)} />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse">
                <thead className="bg-muted/20 border-b border-border/60">
                  <tr>
                    <Th className="w-10"><Checkbox checked={pageItems.length > 0 && selected.size === pageItems.length} onCheckedChange={toggleAll} aria-label="Selecionar todas" /></Th>
                    <Th>Campanha</Th><Th>Segmento / Público</Th><Th>Canal</Th><Th>Status</Th><Th className="w-[150px]">Progresso</Th><Th>Resultados</Th><Th>Agendada em</Th><Th className="text-right">Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const done = c.sent_count + c.failed_count;
                    const progress = pct(done, c.total_recipients);
                    const pbTone = c.status === 'completed' ? 'success' : c.status === 'paused' ? 'warning' : c.status === 'cancelled' ? 'danger' : 'info';
                    const when = c.scheduled_at ?? c.started_at ?? null;
                    return (
                      <tr key={c.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <Td><Checkbox checked={selected.has(c.id)} onCheckedChange={() => setSelected((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} aria-label={`Selecionar ${c.name}`} /></Td>
                        <Td>
                          <button type="button" onClick={() => onView(c)} className="flex items-center gap-3 text-left min-w-0 group">
                            <IconTile icon={objectiveIcon(c.objective)} color={OBJ_COLOR[c.objective ?? 'engajamento'] ?? 'blue'} size={40} />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-foreground truncate group-hover:text-primary-glow">{c.name}</span>
                              <span className="block text-2xs text-foreground-secondary truncate max-w-[260px]">{c.description || c.message_template}</span>
                            </span>
                          </button>
                        </Td>
                        <Td>
                          <span className="inline-block text-2xs font-medium px-2 py-0.5 rounded-md bg-muted/50 border border-border/60 text-foreground truncate max-w-[180px]">{segmentName(c.segment_id) ?? (c.audience_source === 'crm360' ? 'CRM 360°' : 'Seleção manual')}</span>
                          <span className="block text-2xs text-foreground-secondary mt-1">{fmtInt(c.total_recipients)} contatos</span>
                        </Td>
                        <Td><span className="w-8 h-8 rounded-full bg-whatsapp/15 border border-whatsapp/30 flex items-center justify-center"><MessageSquare className="w-4 h-4 text-whatsapp" /></span></Td>
                        <Td><StatusPill status={c.status} map={CAMPAIGN_STATUS} /></Td>
                        <Td>
                          {c.total_recipients > 0 && c.status !== 'draft' && c.status !== 'scheduled' ? (
                            <div className="min-w-[110px]"><p className="text-xs font-semibold text-foreground mb-1">{progress}%</p><ProgressBar value={progress} tone={pbTone} height={6} /></div>
                          ) : <span className="text-muted-foreground text-xs">{c.total_recipients > 0 ? '0%' : '—'}</span>}
                        </Td>
                        <Td>
                          {done > 0 ? (
                            <><span className="block text-xs font-semibold text-foreground">{fmtInt(c.sent_count)} enviados</span><span className="block text-2xs text-foreground-secondary">{c.failed_count > 0 ? `${fmtInt(c.failed_count)} falhas (${fmtPct(c.failed_count, done)})` : `${fmtPct(c.sent_count, done)} de sucesso`}</span></>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </Td>
                        <Td>
                          {when ? (<><span className="block text-xs text-foreground">{fmtDateTime(when)}</span><span className="block text-2xs text-foreground-secondary">por {creators[c.created_by ?? ''] ?? '—'}</span></>) : <span className="text-muted-foreground text-xs">—</span>}
                        </Td>
                        <Td className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" disabled={rowActions.pendingId === c.id} aria-busy={rowActions.pendingId === c.id} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 inline-flex items-center justify-center hover:bg-muted/50 disabled:opacity-70" aria-label="Ações">
                                {rowActions.pendingId === c.id
                                  ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" />
                                  : <MoreVertical className="w-4 h-4" />}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {rowActions.actionsFor(c).map((action, i) => (
                                <React.Fragment key={action.id}>
                                  {action.destructive && i > 0 && <DropdownMenuSeparator />}
                                  <DropdownMenuItem className={action.destructive ? 'text-dash-red' : undefined} onClick={() => rowActions.run(action.id, c)}>
                                    <action.icon className="w-4 h-4 mr-2" />{action.label}
                                  </DropdownMenuItem>
                                </React.Fragment>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="campanhas" /></div>}
        </section>
      </div>

      {/* Rail */}
      <div className="space-y-4 min-w-0">
        <HeroCard
          icon={Zap} title="Talk X"
          subtitle="Campanhas que geram conversas e resultados."
          metrics={[
            { label: 'Mensagens enviadas', value: fmtInt(totals.reached) },
            { label: 'Taxa de sucesso', value: totals.successRate === null ? '—' : `${totals.successRate}%` },
            { label: 'Segmentos salvos', value: fmtInt(segments.length) },
          ]}
        />
        <RailCard icon={Zap} title="Ações rápidas">
          <div className="space-y-1.5">
            <RailAction icon={Plus}     color="blue"   title="Nova campanha"      subtitle="Criar do zero"          onClick={onNew} />
            <RailAction icon={FileText} color="violet" title="Usar template"      subtitle="Escolher da biblioteca" onClick={() => onGoTab('templates')} />
            <RailAction icon={Bookmark} color="green"  title="Criar segmento"     subtitle="Definir público-alvo"   onClick={() => onGoTab('segments')} />
          </div>
        </RailCard>
        <RailCard icon={BarChart3} title="Últimas campanhas" right={<VerTodasButton onClick={clear} />}>
          {latest.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma campanha ainda.</p> : (
            <RecentList items={latest.map((c) => {
              const m = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.draft;
              return { id: c.id, name: c.name, statusLabel: m.label, statusTone: m.tone, pct: c.total_recipients > 0 && c.status !== 'draft' ? pct(c.sent_count+c.failed_count, c.total_recipients) : undefined, onOpen: () => onView(c) };
            })} />
          )}
        </RailCard>
        <TipCard tip="Segmentar por ramo ajuda a direcionar a mensagem ao público certo." />
      </div>

      {/* X080 — modais de confirmação das ações de linha (um lugar só) */}
      {rowActions.dialogs}
    </div>
    </TalkXQueryBoundary>
  );
}

function objectiveIcon(obj?: string) {
  switch (obj) {
    case 'vendas': return Target;
    case 'reativacao': return Send;
    case 'relacionamento': return Users;
    case 'pesquisa': return BarChart3;
    case 'institucional': return FileText;
    default: return Zap;
  }
}

function CampaignGridCard({ c, segmentName, onView, onEdit }: { c: TalkXCampaign; segmentName?: string; onView: () => void; onEdit: () => void }) {
  const done = c.sent_count + c.failed_count;
  const progress = pct(done, c.total_recipients);
  return (
    <div className="rounded-2xl border border-border/70 bg-input/20 p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <IconTile icon={objectiveIcon(c.objective)} color={OBJ_COLOR[c.objective ?? 'engajamento'] ?? 'blue'} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
          <p className="text-2xs text-foreground-secondary line-clamp-2">{c.description || c.message_template}</p>
        </div>
        <StatusPill status={c.status} map={CAMPAIGN_STATUS} />
      </div>
      <div className="mt-3 flex items-center justify-between text-2xs text-foreground-secondary">
        <span>{segmentName ?? 'Seleção manual'} · {fmtInt(c.total_recipients)} contatos</span>
        <span>{done > 0 ? `${fmtInt(c.sent_count)} enviados` : '—'}</span>
      </div>
      {done > 0 && <div className="mt-2"><ProgressBar value={progress} tone={c.status === 'completed' ? 'success' : 'info'} height={6} /></div>}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={onView} className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{c.status === 'completed' ? 'Relatório' : 'Monitorar'}</button>
        {(c.status === 'draft' || c.status === 'scheduled') && <button type="button" onClick={onEdit} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" />Editar</button>}
        <span className="ml-auto text-3xs text-muted-foreground">{fmtAgo(c.updated_at)}</span>
      </div>
    </div>
  );
}
