import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Bookmark, Star, StarOff, Pencil, Trash2, Zap, BarChart3, X, MoreVertical, Users, Shield, Check, Database, Search,
  Archive, AlertTriangle, PowerOff, Tag, LayoutList, LayoutGrid,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { PrimaryButton, GhostButton, Pill, ProgressBar, InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { DashboardKpiCard, type KpiDelta } from '@/components/dashboard/overview/DashboardKpiCard';
import { cn } from '@/lib/utils';
import { useTalkXSegments, emptyRules, RULE_FIELDS, useAudienceEstimate, countAudience, type TalkXSegment, type TalkXSegmentLibraryStats, type TalkXSegmentLibraryMonth, type TalkXSegmentBulkAction, type TalkXSegmentBulkResult } from '@/hooks/integrations/useTalkXSegments';
import { RailCard, MetaRow, TalkXEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, Th, Td, KpiCardSkeleton, TalkXConfirmDialog, TalkXBulkBar, fmtInt, fmtDateTime, fmtAgo } from './talkxShared';
import { TalkXQueryBoundary } from './kit/states';
import { TalkXSegmentBuilder } from './segments/TalkXSegmentBuilder';
import { SegmentSideList } from './segments/SegmentSideList';
import type { SegmentBuilderContent } from './segments/segmentBuilderReducer';
import { validateSegmentRules } from './segments/segmentValidation';
import { parseTalkXSegmentsRoute, pushTalkXSegmentsRoute, replaceTalkXSegmentsRoute, type TalkXSegmentsRoute } from './segments/talkxSegmentsRoute';
import { toast } from 'sonner';

interface Props {
  onUseCampaign: (segmentIds: string[]) => void;
}

/** Rascunho aberto no construtor (X099): o id é o do segmento em edição, ou null no novo. */
interface EditingSeed extends SegmentBuilderContent { id: string | null }

export function TalkXSegments({ onUseCampaign }: Props) {
  const {
    segments, isLoading, isError, error, refetch, createSegment, updateSegment, deleteSegment,
    libraryStats = null, libraryStatsLoading = false, libraryStatsError = null, refetchLibraryStats = () => {},
    // X114 — seleção/ações em massa. Defaults só para os mocks de tela que
    // injetam um hook mínimo: o hook real sempre devolve os seis.
    selectedIds = [], toggleSelect = () => {}, selectAll = () => {}, clearSelection = () => {}, runBulkAction = async () => [], isBulkRunning = false,
  } = useTalkXSegments();
  const [bulkResult, setBulkResult] = useState<TalkXSegmentBulkResult[] | null>(null);
  const [bulkTag, setBulkTag] = useState('');
  const [search, setSearch] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selected, setSelected] = useState<TalkXSegment | null>(null);
  const [deleting, setDeleting] = useState<TalkXSegment | null>(null);
  const [editing, setEditing] = useState<EditingSeed | null>(null);
  const [saving, setSaving] = useState(false);
  // TL-134: gaveta "Meus segmentos" (<xl) e guarda de edição suja do construtor
  // (o construtor registra a guarda via onGuardChange a cada render).
  const [sideListOpen, setSideListOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const builderGuardRef = useRef<((proceed: () => void) => void) | null>(null);
  // X111 — o construtor da tela 03 vive no endereço (?view=talkx&tab=segments&segment=<id>&mode=edit|new):
  // o link direto abre o segmento, o F5 mantém a tela e voltar/avançar do navegador fecham e reabrem.
  // `route` é o que o endereço pede; `editing` é a cópia que o usuário está editando na tela.
  const [route, setRoute] = useState<TalkXSegmentsRoute | null>(
    () => parseTalkXSegmentsRoute(window.location.search).route,
  );

  const routedSegment = useMemo(
    () => (route?.segmentId ? segments.find((s) => s.id === route.segmentId) ?? null : null),
    [route, segments],
  );

  // O que o endereço pede para o construtor. Enquanto o segmento do endereço não
  // chegou da consulta não há cópia para abrir (a tela mostra o esqueleto abaixo).
  const routedSeed = useMemo<EditingSeed | null>(() => {
    if (!route) return null;
    if (route.mode === 'new') return { id: null, name: '', description: '', rules: emptyRules() };
    return routedSegment
      ? { id: routedSegment.id, name: routedSegment.name, description: routedSegment.description ?? '', rules: routedSegment.rules }
      : null;
  }, [route, routedSegment]);

  // A cópia local ganha do endereço: é ela que tem o que o usuário acabou de digitar.
  const activeEditing = editing ?? routedSeed;

  const syncFromBrowserHistory = useCallback(() => {
    const routed = parseTalkXSegmentsRoute(window.location.search);
    if (routed.needsNormalization) replaceTalkXSegmentsRoute(routed.route);
    // O histórico é a fonte de verdade do que está aberto; a cópia da tela anterior
    // não sobrevive à navegação.
    setEditing(null);
    setRoute(routed.route);
  }, []);

  useEffect(() => {
    const initial = parseTalkXSegmentsRoute(window.location.search);
    if (initial.needsNormalization) replaceTalkXSegmentsRoute(initial.route);
    window.addEventListener('popstate', syncFromBrowserHistory);
    return () => window.removeEventListener('popstate', syncFromBrowserHistory);
  }, [syncFromBrowserHistory]);

  // Id que a lista não devolve (apagado, de outra conta ou digitado à mão): a tela
  // cai na biblioteca e o endereço perde o parâmetro, sem criar entrada no histórico.
  useEffect(() => {
    if (!route?.segmentId || isLoading || routedSegment) return;
    replaceTalkXSegmentsRoute(null);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (!isError) toast.error('Segmento não encontrado ou sem acesso.');
  }, [isError, isLoading, route, routedSegment]);

  const filtered = useMemo(() => {
    let r = segments;
    if (filterOrigin !== 'all') r = r.filter((s) => s.origin === filterOrigin);
    if (filterStatus !== 'all') r = r.filter((s) => s.status === filterStatus);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)); }
    return r;
  }, [segments, filterOrigin, filterStatus, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  /* X114 — seleção e ações em massa da biblioteca. O resultado vem POR SEGMENTO
     do hook (RPC guardada): a tela nunca resume o lote como um veredito único. */
  const pageIds = paged.map((s) => s.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const nameOfSegment = (id: string) => segments.find((s) => s.id === id)?.name ?? id;

  // "Selecionar todos" é o que está VISÍVEL (filtro + página), e mexe só nele:
  // o que já estava escolhido em outra página continua escolhido.
  const toggleAllOnPage = () => {
    if (allPageSelected) pageIds.forEach((id) => toggleSelect(id));
    else pageIds.filter((id) => !selectedIds.includes(id)).forEach((id) => toggleSelect(id));
  };

  const runBulk = async (action: TalkXSegmentBulkAction, tag?: string) => {
    if (isBulkRunning || selectedIds.length === 0) return;
    try {
      const results = await runBulkAction({ action, ids: selectedIds, tag });
      setBulkResult(results);
      // Só o que NÃO foi aplicado segue selecionado: item barrado pela guarda
      // fica à mão para conferir e refazer, sem reselecionar o lote inteiro.
      const falhos = results.filter((r) => !r.succeeded).map((r) => r.segment_id);
      clearSelection();
      if (falhos.length > 0) selectAll(falhos);
    } catch (e) {
      toast.error(`Não foi possível aplicar a ação: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Nomes da biblioteca sem o próprio segmento em edição: base do aviso de nome repetido. */
  const existingNames = useMemo(
    () => segments.filter((s) => s.id !== activeEditing?.id).map((s) => s.name),
    [segments, activeEditing?.id],
  );

  const openBuilder = (target: EditingSeed, nextRoute: TalkXSegmentsRoute) => {
    setEditing(target);
    setRoute(nextRoute);
    pushTalkXSegmentsRoute(nextRoute);
  };
  const openNew = () => {
    setSelected(null);
    openBuilder({ id: null, name: '', description: '', rules: emptyRules() }, { segmentId: null, mode: 'new' });
  };
  const openEdit = (s: TalkXSegment) => {
    setSelected(s);
    openBuilder({ id: s.id, name: s.name, description: s.description ?? '', rules: s.rules }, { segmentId: s.id, mode: 'edit' });
  };
  // Fechar o construtor (cancelar ou publicar) devolve a tela e o endereço à biblioteca.
  const closeBuilder = () => {
    builderGuardRef.current = null;
    setEditing(null);
    setRoute(null);
    replaceTalkXSegmentsRoute(null);
  };

  const save = async (draft: SegmentBuilderContent) => {
    if (saving) return;
    if (!draft.name.trim()) return;
    // Uma condição em branco não pode ir para o banco: recusa com o número exato
    // do que falta em vez de deixar o botão sem efeito e sem aviso.
    const rulesError = validateSegmentRules(draft.rules);
    if (rulesError) {
      toast.error(rulesError);
      return;
    }
    setSaving(true);
    try {
      const count = await countAudience(draft.rules);
      const currentId = activeEditing?.id ?? null;
      if (currentId) {
        // O rail de detalhe lê `selected`: guardar a linha devolvida pelo banco
        // evita mostrar — e reabrir no construtor — a cópia que estava em tela
        // antes de salvar.
        const saved = await updateSegment.mutateAsync({ id: currentId, name: draft.name, description: draft.description || null, rules: draft.rules, estimated_count: count });
        setSelected(saved);
      } else {
        await createSegment.mutateAsync({ name: draft.name, description: draft.description || null, rules: draft.rules, estimated_count: count });
      }
      closeBuilder();
    } catch (e) {
      // Erro real do banco (RLS, rede) precisa chegar ao usuário.
      toast.error(`Erro ao salvar segmento: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  };

  const toggleFav = async (s: TalkXSegment) => { await updateSegment.mutateAsync({ id: s.id, is_favorite: !s.is_favorite }); };

  // TL-134: a lista lateral troca de segmento/novo passando pela guarda de edição
  // suja do construtor (diálogo quando há edição não salva; direto quando limpo).
  const guardedOpenNew = () => {
    setSideListOpen(false);
    if (activeEditing && builderGuardRef.current) builderGuardRef.current(() => openNew());
    else openNew();
  };
  const guardedOpenEdit = (t: TalkXSegment) => {
    setSideListOpen(false);
    if (activeEditing && builderGuardRef.current) builderGuardRef.current(() => openEdit(t));
    else openEdit(t);
  };
  // Estrela da lista: devolve a promessa para a lista desfazer se falhar (V55).
  const setFavorite = (t: TalkXSegment, next: boolean) =>
    updateSegment.mutateAsync({ id: t.id, is_favorite: next });
  const sideListProps = {
    segments,
    isLoading,
    isError,
    error,
    onRetry: () => { void refetch(); },
    activeId: activeEditing?.id ?? null,
    onSelect: guardedOpenEdit,
    onNew: guardedOpenNew,
    onEdit: guardedOpenEdit,
    onUseCampaign: (id: string) => onUseCampaign([id]),
    onToggleFavorite: setFavorite,
    onToggleStatus: (t: TalkXSegment, next: 'active' | 'inactive') => {
      updateSegment.mutate({ id: t.id, status: next });
    },
    onDelete: (t: TalkXSegment) => setDeleting(t),
  };
  // Excluir o segmento aberto no construtor fecha o construtor (volta à biblioteca).
  const confirmDeleteDialog = (
    <TalkXConfirmDialog
      open={!!deleting}
      onClose={() => setDeleting(null)}
      onConfirm={() => {
        if (!deleting) return;
        const wasEditing = activeEditing?.id != null && activeEditing.id === deleting.id;
        deleteSegment.mutate(deleting.id);
        setDeleting(null);
        if (selected?.id === deleting.id) setSelected(null);
        if (wasEditing) closeBuilder();
      }}
      icon={Trash2}
      iconColor="red"
      tone="danger"
      title="Excluir segmento"
      description="O segmento sai da biblioteca e deixa de aparecer nas campanhas que o usam como público. Essa ação não pode ser desfeita."
      entityName={deleting?.name}
      confirmLabel="Excluir segmento"
    />
  );

  if (activeEditing) {
    return (
      <div className="w-full min-w-0 space-y-4">
        {/* X111 — trilha da tela 03, no mesmo desenho do wizard: o construtor é uma tela interna do módulo. */}
        <nav aria-label="Trilha de navegação" className="flex items-center gap-1.5 text-2xs text-muted-foreground px-0.5">
          <span>Talk X</span>
          <span className="text-border">›</span>
          <span>Campanhas</span>
          <span className="text-border">›</span>
          <span className="text-foreground font-medium">Segmentos</span>
        </nav>
        {/* TL-134 (X099): SEM `key` de propósito — a troca de segmento repõe o
            rascunho pela ação `reset` do reducer, num `useEffect [initial]`. */}
        <TalkXSegmentBuilder
          initial={activeEditing}
          isNew={!activeEditing.id}
          saving={saving}
          existingNames={existingNames}
          onSave={(draft) => void save(draft)}
          onCancel={closeBuilder}
          onGuardChange={(g) => { builderGuardRef.current = g; }}
          sideList={<SegmentSideList {...sideListProps} />}
          sideListButton={(
            <button
              type="button"
              onClick={() => setSideListOpen(true)}
              className="xl:hidden h-9 px-3 rounded-lg border border-border/70 bg-input/40 inline-flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bg-muted/50 shrink-0"
            >
              <Bookmark className="w-3.5 h-3.5" />Meus segmentos
            </button>
          )}
        />
        <SegmentSideList {...sideListProps} drawer open={sideListOpen} onOpenChange={setSideListOpen} />
        {confirmDeleteDialog}
      </div>
    );
  }

  if (route?.segmentId) {
    // O endereço pede um segmento que a consulta ainda não devolveu: esqueleto no
    // lugar da biblioteca, para o F5 do link direto não piscar a lista primeiro.
    return (
      <div className="min-h-full w-full min-w-0" role="status" aria-live="polite" aria-busy={isLoading} data-talkx-query="loading">
        <span className="sr-only">Carregando conteúdo…</span>
        <TalkXSkeletonRows rows={4} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        {/* X103/TL-135b — KPIs da biblioteca vem da RPC talkx_segment_library_stats
            (uso real no mês e conversão com base mínima); nada é somado aqui. */}
        <TalkXQueryBoundary
          query={{ isLoading: libraryStatsLoading, isError: !!libraryStatsError, error: libraryStatsError }}
          entity="as estatísticas da biblioteca"
          onRetry={() => refetchLibraryStats()}
          skeleton={<LibraryKpiSkeleton />}
          isEmpty={false}
          empty={null}
        >
          {libraryStats ? <LibraryKpis stats={libraryStats} /> : <LibraryKpiSkeleton />}
        </TalkXQueryBoundary>

        <FilterBarV2
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar segmentos…"
          filters={[
            { key: 'origin', label: 'Todas as origens', options: [{ value: 'zapp', label: 'ZAPP' }, { value: 'crm360', label: 'CRM 360°' }, { value: 'custom', label: 'Personalizado' }] },
            { key: 'status', label: 'Todos os status', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
          ]}
          values={{ origin: filterOrigin, status: filterStatus }}
          onFilter={(k, v) => { if (k === 'origin') setFilterOrigin(v); else setFilterStatus(v); setPage(1); }}
          hasActive={filterOrigin !== 'all' || filterStatus !== 'all' || search.trim() !== ''}
          onClear={() => { setSearch(''); setFilterOrigin('all'); setFilterStatus('all'); setPage(1); }}
          rightSlot={
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border/70 overflow-hidden">
                <button
                  type="button"
                  data-testid="segments-view-list"
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                  className={cn('h-8 px-2.5 inline-flex items-center justify-center transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-input/40 text-muted-foreground hover:bg-muted/50')}
                  aria-label="Visualização em lista"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="segments-view-grid"
                  aria-pressed={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                  className={cn('h-8 px-2.5 inline-flex items-center justify-center transition-colors border-l border-border/70', viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-input/40 text-muted-foreground hover:bg-muted/50')}
                  aria-label="Visualização em grade"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
              <PrimaryButton icon={Plus} onClick={openNew}>Novo segmento</PrimaryButton>
            </div>
          }
        />

        <TalkXBulkBar
          count={selectedIds.length}
          onClear={clearSelection}
          actions={
            <>
              <GhostButton size="sm" icon={Check} onClick={() => void runBulk('activate')}>Ativar</GhostButton>
              <GhostButton size="sm" icon={PowerOff} onClick={() => void runBulk('deactivate')}>Desativar</GhostButton>
              <GhostButton size="sm" icon={Archive} onClick={() => void runBulk('archive')}>Arquivar</GhostButton>
              <input
                type="text" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)}
                aria-label="Tag para aplicar em massa" placeholder="tag…"
                className="h-8 w-28 rounded-lg border border-border/70 bg-input/40 px-2 text-xs text-foreground"
              />
              <GhostButton size="sm" icon={Tag} onClick={() => void runBulk('tag', bulkTag)}>Aplicar tag</GhostButton>
            </>
          }
        />

        {bulkResult && <BulkResultPanel results={bulkResult} nameOf={nameOfSegment} onClose={() => setBulkResult(null)} />}

        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          <TalkXQueryBoundary
            query={{ isLoading, isError, error }}
            entity="os segmentos"
            onRetry={() => refetch()}
            skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
            isEmpty={segments.length === 0}
            empty={<div className="p-4"><TalkXEmptyState icon={Bookmark} title="Nenhum segmento salvo" description="Crie segmentos inteligentes para campanhas mais assertivas." actionLabel="Criar segmento" onAction={openNew} /></div>}
          >
           {filtered.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Search} title="Nenhum segmento encontrado" description="Ajuste os filtros ou tente outro termo." /></div>)
           : viewMode === 'grid' ? (
            <div data-testid="segments-grid" className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paged.map((s) => {
                const originLabel = s.origin === 'crm360' ? 'CRM 360°' : s.origin === 'zapp' ? 'ZAPP' : 'Personalizado';
                const statusLabel = s.status === 'active' ? 'Ativo' : 'Inativo';
                const allRules = (s.rules?.groups ?? []).flatMap((g) => g.rules);
                return (
                  <div key={s.id} data-testid="segment-card" className={cn('rounded-xl border border-border/70 bg-card p-4 cursor-pointer hover:border-primary/40 transition-colors space-y-3', selected?.id === s.id && 'border-primary/60 bg-primary/5')} onClick={() => setSelected(s)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground leading-tight">{s.name}</p>
                      <button type="button" onClick={(e) => { e.stopPropagation(); void toggleFav(s); }} aria-label={s.is_favorite ? 'Remover favorito' : 'Favoritar'} className="text-muted-foreground hover:text-dash-amber shrink-0">{s.is_favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <Pill label={originLabel} tone={s.origin === 'crm360' ? 'violet' : 'info'} />
                      <span className={cn('text-2xs px-2 py-0.5 rounded-full font-medium', s.status === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{statusLabel}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-2xs text-foreground-secondary">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-bold text-foreground text-sm">{fmtInt(s.estimated_count)}</span>
                      <span>contatos</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {allRules.slice(0, 3).map((r, i) => {
                        const field = RULE_FIELDS.find((f) => f.value === r.field)?.label ?? r.field;
                        return <span key={i} className="text-3xs px-1.5 py-0.5 rounded bg-primary/10 text-[hsl(var(--primary-text))] border border-primary/20">{field}</span>;
                      })}
                      {allRules.length > 3 && <span className="text-3xs text-muted-foreground">+{allRules.length - 3}</span>}
                      {allRules.length === 0 && <span className="text-2xs text-muted-foreground italic">Toda a base</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div data-testid="segments-list" className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead className="bg-muted/20 border-b border-border/60"><tr>
                  <Th className="w-10"><input type="checkbox" checked={allPageSelected} onChange={toggleAllOnPage} aria-label="Selecionar todos os segmentos da página" className="w-3.5 h-3.5 accent-primary cursor-pointer" /></Th>
                  <Th className="w-8">⭐</Th><Th>Segmento</Th><Th>Origem</Th><Th>Critérios</Th><Th>Público estimado</Th><Th>Último uso</Th><Th>Público relativo</Th><Th className="text-right">Ações</Th>
                </tr></thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id} data-testid="segment-card" className={cn('border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors', selected?.id === s.id && 'bg-primary/5')} onClick={() => setSelected(s)}>
                      <Td><div onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleSelect(s.id)} aria-label={`Selecionar ${s.name}`} className="w-3.5 h-3.5 accent-primary cursor-pointer" /></div></Td>
                      <Td><button type="button" onClick={(e) => { e.stopPropagation(); void toggleFav(s); }} aria-label={s.is_favorite ? 'Remover favorito' : 'Favoritar'} className="text-muted-foreground hover:text-dash-amber">{s.is_favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}</button></Td>
                      <Td>
                        <p className="text-sm font-semibold text-foreground">{s.name}</p>
                        <p className="text-2xs text-foreground-secondary truncate max-w-[220px]">{s.description || 'Sem descrição'}</p>
                      </Td>
                      <Td><Pill label={s.origin === 'crm360' ? 'CRM 360°' : s.origin === 'zapp' ? 'ZAPP' : 'Personalizado'} tone={s.origin === 'crm360' ? 'violet' : 'info'} /></Td>
                      <Td>
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).slice(0, 3).map((r, i) => {
                            const field = RULE_FIELDS.find((f) => f.value === r.field)?.label ?? r.field;
                            return <span key={i} className="text-3xs px-1.5 py-0.5 rounded bg-primary/10 text-[hsl(var(--primary-text))] border border-primary/20">{field}</span>;
                          })}
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).length > 3 && <span className="text-3xs text-muted-foreground">+{(s.rules?.groups ?? []).flatMap((g) => g.rules).length - 3}</span>}
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).length === 0 && <span className="text-2xs text-muted-foreground italic">Toda a base</span>}
                        </div>
                      </Td>
                      <Td><span className="text-sm font-bold text-foreground">{fmtInt(s.estimated_count)}</span><span className="text-2xs text-foreground-secondary ml-1">contatos</span></Td>
                      <Td><span className="text-xs text-foreground-secondary">{s.last_used_at ? fmtAgo(s.last_used_at) : 'Nunca'}</span></Td>
                      <Td><ProgressBar value={Math.min(100, (s.estimated_count / Math.max(...segments.map((x) => x.estimated_count), 1)) * 100)} tone="info" height={6} className="w-[80px]" /></Td>
                      <Td className="text-right">
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 inline-flex items-center justify-center hover:bg-muted/50" aria-label="Ações"><MoreVertical className="w-4 h-4" /></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => { setSelected(s); }}><Users className="w-4 h-4 mr-2" />Ver detalhes</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onUseCampaign([s.id])}><Zap className="w-4 h-4 mr-2" />Usar em campanha</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(s)}><Pencil className="w-4 h-4 mr-2" />Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleFav(s)}>{s.is_favorite ? <StarOff className="w-4 h-4 mr-2" /> : <Star className="w-4 h-4 mr-2" />}{s.is_favorite ? 'Remover favorito' : 'Favoritar'}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-dash-red" onClick={() => setDeleting(s)}><Trash2 className="w-4 h-4 mr-2" />Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </TalkXQueryBoundary>
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="segmentos" /></div>}
        </section>
      </div>

      {/* Detail rail */}
      <div className="space-y-4 min-w-0">
        {selected ? (
          <SegmentDetailRail s={selected} onEdit={() => openEdit(selected)} onCampaign={() => onUseCampaign([selected.id])} onClose={() => setSelected(null)} />
        ) : (
          <RailCard icon={Bookmark} title="Selecione um segmento" subtitle="Clique em um segmento para ver os detalhes e ações disponíveis.">
            <p className="text-xs text-foreground-secondary">Os segmentos permitem direcionar suas campanhas para grupos específicos de contatos com base em regras de comportamento e dados do CRM.</p>
          </RailCard>
        )}
      </div>

      {confirmDeleteDialog}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* KPIs da biblioteca (X103)                                          */
/* ------------------------------------------------------------------ */

function LibraryKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
    </div>
  );
}

const fmtDec = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Mini-barras de 8 meses: cada coluna é um mês da série da RPC. Mês sem retrato
 * gravado (`has_data` falso) fica FORA das barras em vez de virar zero — um zero
 * desenhado seria lido como "nenhum segmento naquele mês".
 */
function barsFromSeries(series: TalkXSegmentLibraryMonth[], key: 'total_segments' | 'active_segments'): number[] {
  return series.filter((m) => m.has_data).map((m) => m[key] ?? 0);
}

/** Variação relativa contra o mês anterior. Sem mês anterior (base zero) não há %. */
function variacaoMesAnterior(atual: number, anterior: number): KpiDelta {
  if (!Number.isFinite(anterior) || anterior <= 0) return null;
  return { pct: Math.round(((atual - anterior) / anterior) * 100), label: 'vs. mês anterior' };
}

function LibraryKpis({ stats }: { stats: TalkXSegmentLibraryStats }) {
  const conv = stats.conversion;
  // Abaixo da base mínima a RPC devolve has_data falso e value_pct nulo: a tela
  // mantém o card "Conversão média" e mostra o estado sem dados dentro dele,
  // nunca um percentual inventado.
  const conversaoDisponivel = conv.has_data && conv.value_pct !== null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      <DashboardKpiCard
        size="compact" index={0} label="Total de segmentos" tile="blue" icon={Database} barsColor="blue"
        value={fmtInt(stats.total_segments)} delta={null} bars={barsFromSeries(stats.series, 'total_segments')}
      />
      <DashboardKpiCard
        size="compact" index={1} label="Ativos este mês" tile="green" icon={Check} barsColor="green"
        value={fmtInt(stats.active_this_month)}
        delta={variacaoMesAnterior(stats.active_this_month, stats.active_previous_month)}
        bars={barsFromSeries(stats.series, 'active_segments')}
      />
      <DashboardKpiCard
        size="compact" index={2} label="CRM 360° conectados" tile="violet" icon={Shield} barsColor="violet" chart="none"
        value={fmtInt(stats.crm360_connected)}
        delta={variacaoMesAnterior(stats.crm360_connected, stats.crm360_previous_month)}
        bars={null}
      />
      {conversaoDisponivel ? (
        <DashboardKpiCard
          size="compact" index={3} label="Conversão média" tile="amber" icon={BarChart3} barsColor="amber" chart="none"
          value={`${fmtDec(conv.value_pct as number)}%`}
          delta={conv.delta_pp === null ? null : {
            text: `${conv.delta_pp >= 0 ? '+' : '-'}${fmtDec(Math.abs(conv.delta_pp))} p.p. vs. mês anterior`,
            tone: conv.delta_pp >= 0 ? 'success' : 'muted',
          }}
          bars={null}
        />
      ) : (
        <DashboardKpiCard
          size="compact" index={3} label="Conversão média" tile="amber" icon={BarChart3} barsColor="amber" chart="none"
          value="—"
          delta={null}
          bars={null}
          footer={(
            <p className="text-2xs leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground-secondary">Sem dados ainda</span>{' '}
              A conversão média aparece com {fmtInt(conv.min_deliveries)} entregues ou mais no mês (neste mês: {fmtInt(conv.deliveries)}).
            </p>
          )}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* X114 — feedback do lote (itens aplicados × itens não aplicados)     */
/* ------------------------------------------------------------------ */

/**
 * Motivo do item não aplicado, lido do veredito do servidor. A guarda de uso
 * (P0001: segmento em campanha scheduled/sending/paused) é BLOQUEIO — o item é
 * "não aplicável", nunca sucesso; os demais códigos são falha de aplicação.
 */
function motivoFalha(r: TalkXSegmentBulkResult): string {
  const detalhe = r.error_message?.trim();
  return r.error_code === 'P0001'
    ? `Não aplicável — ${detalhe || 'bloqueado pela guarda de uso (segmento em campanha ativa).'}`
    : `Falhou — ${detalhe || 'o servidor não aplicou este item.'}`;
}

/**
 * Resumo do lote POR SEGMENTO: quantos entraram, quantos não, e o detalhamento
 * item a item do que ficou de fora. Só o que falhou aparece na lista — item
 * aplicado não é listado, e item bloqueado nunca conta como aplicado.
 */
function BulkResultPanel({ results, nameOf, onClose }: { results: TalkXSegmentBulkResult[]; nameOf: (id: string) => string; onClose: () => void }) {
  const aplicados = results.filter((r) => r.succeeded);
  const falhos = results.filter((r) => !r.succeeded);
  return (
    <section
      data-testid="talkx-bulk-resultado" role="status" aria-live="polite" aria-label="Resultado da ação em massa"
      className="rounded-xl border border-border/70 bg-card px-3.5 py-3 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Resultado da ação em massa</span>
        <Pill label={`${aplicados.length} aplicado${aplicados.length === 1 ? '' : 's'}`} tone={aplicados.length > 0 ? 'success' : 'muted'} />
        {falhos.length > 0 && <Pill label={`${falhos.length} não aplicado${falhos.length === 1 ? '' : 's'}`} tone="danger" />}
        <button
          type="button" onClick={onClose} aria-label="Fechar resultado"
          className="ml-auto h-7 w-7 rounded-md border border-border/70 bg-input/40 inline-flex items-center justify-center hover:bg-muted/50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {falhos.length === 0 ? (
        <p className="text-2xs text-foreground-secondary">Todos os itens selecionados foram aplicados.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-2xs text-foreground-secondary">Confira item a item o que não foi aplicado:</p>
          <ul className="space-y-1">
            {falhos.map((r) => (
              <li key={r.segment_id} data-testid="talkx-bulk-item-falho" className="flex items-start gap-2 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-dash-amber mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-medium text-foreground">{nameOf(r.segment_id)}</span>
                  <span className="text-foreground-secondary"> · {motivoFalha(r)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SegmentDetailRail({ s, onEdit, onCampaign, onClose }: { s: TalkXSegment; onEdit: () => void; onCampaign: () => void; onClose: () => void }) {
  const { data: est } = useAudienceEstimate(s.rules, true);
  return (
    <RailCard icon={Bookmark} color="violet" title={s.name} subtitle={s.description || undefined}
      right={<button type="button" onClick={onClose} aria-label="Fechar" className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50"><X className="w-4 h-4" /></button>}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Pill label={s.status === 'active' ? 'Ativo' : 'Inativo'} tone={s.status === 'active' ? 'success' : 'muted'} dot />
        <Pill label={s.is_favorite ? '⭐ Favorito' : 'Padrão'} tone={s.is_favorite ? 'warning' : 'muted'} />
      </div>
      <MetaRow label="Público estimado" value={<span className="font-bold text-sm">{fmtInt(est?.count ?? s.estimated_count)} contatos</span>} />
      <MetaRow label="Origem" value={s.origin === 'crm360' ? 'CRM 360°' : s.origin === 'zapp' ? 'ZAPP' : 'Personalizado'} />
      <MetaRow label="Último uso" value={s.last_used_at ? fmtDateTime(s.last_used_at) : 'Nunca'} />
      <MetaRow label="Criado em" value={fmtDateTime(s.created_at)} />
      {est?.sample && est.sample.length > 0 && (
        <div className="mt-2">
          <p className="text-2xs text-foreground-secondary mb-1.5">Amostra de contatos</p>
          {est.sample.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-1.5">
              <InitialsAvatar name={c.name || '?'} size={28} />
              <div className="min-w-0"><p className="text-xs font-medium text-foreground truncate">{c.name}</p><p className="text-2xs text-foreground-secondary truncate">{c.company || c.phone}</p></div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 mt-3">
        <PrimaryButton icon={Zap} onClick={onCampaign} className="w-full justify-center">Usar em campanha</PrimaryButton>
        <GhostButton icon={Pencil} onClick={onEdit} className="w-full justify-center">Editar segmento</GhostButton>
      </div>
    </RailCard>
  );
}
