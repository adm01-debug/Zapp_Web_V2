import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { TalkXTemplateEditor } from './TalkXTemplateEditor';
import {
  Plus, FileText, Star, Pencil, Trash2, Copy, Image, Video, Music, Check, ChevronRight, BarChart3,
  Sparkles, TrendingUp, Lightbulb,
} from 'lucide-react';
import { PrimaryButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { useTalkXTemplates, type TalkXTemplate } from '@/hooks/integrations/useTalkXTemplates';
import { useTalkXTemplateLibraryStats, pointsDelta } from '@/hooks/integrations/useTalkXTemplateStats';
import { RailCard, RailAction, HeroCard, TalkXEmptyState, TalkXFilteredEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, TEMPLATE_CATEGORIES, TEMPLATE_STATUS, extractVariables, fmtInt, fmtDateTime, fmtTime, TalkXConfirmDialog } from './talkxShared';
import { useTalkXFilterState } from './kit/useFilterState';
import { TalkXQueryBoundary } from './kit/states';
import { KpiCard } from './kit/kpi';
import { PRESETS_DO_PRODUTO } from './kit/dialogPresets';
import { parseTalkXTemplateRoute, pushTalkXTemplateRoute, replaceTalkXTemplateRoute, type TalkXTemplateRoute } from './talkxTemplateRoute';
import { SUGGESTION_MIN_SENT, type TalkXTemplateConversion, type TalkXTemplateConversionState } from '@/hooks/integrations/useTalkXTemplatesConversion';

/** Estado do ranking quando o consumidor do hook não o fornece (ex.: mock de teste). */
const EMPTY_CONVERSION: TalkXTemplateConversionState = { ranking: null, isLoading: false, isError: false, error: null };

interface Props {
  onUseTemplate: (templateId: string) => void;
  /** R2-MOD-039: pedido do menu do topo ("Templates ▾ → Novo template") para abrir o editor vazio. */
  startNew?: boolean;
  /** Chamado quando esse editor é fechado (inclusive ao salvar), para o topo limpar o pedido. */
  onStartNewHandled?: () => void;
  /** X091 — repassado ao editor: clique do widget "Em andamento" abre o monitor. */
  onOpenMonitor?: (campaignId: string) => void;
}

const MEDIA_ICONS = { image: Image, video: Video, document: FileText, audio: Music } as const;

/** T04-044 — "↑ 32,4% de resposta": ponto percentual com vírgula, como no mock. */
const formatReplyRate = (pct: number) => `${pct.toFixed(1).replace('.', ',')}%`;

/** Dias inteiros desde uma data ISO (o relógio fica fora do render — regra de pureza). */
const REVIEW_STALE_DAYS = 3;
const daysSinceISO = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

type ViewMode = 'list' | 'edit';

/** X089 — página do mock 04: 12 por linha, com 24 e 48 como alternativas. */
const PAGE_SIZES = [12, 24, 48];

/** X089 — preferência grade/lista (a tela lembra como o usuário deixou a biblioteca). */
const VIEW_KEY = 'talkx.templates.view';
type GalleryMode = 'grid' | 'list';

/** Leitura DEFENSIVA: qualquer valor que não seja 'list' cai na grade. */
function lerModoGaleria(): GalleryMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    /* navegador sem localStorage — a tela segue na grade */
    return 'grid';
  }
}

function salvarModoGaleria(modo: GalleryMode): void {
  try {
    localStorage.setItem(VIEW_KEY, modo);
  } catch {
    /* ambiente sem localStorage / quota — a preferência não persiste, o que não é erro */
  }
}

/** "3 variáveis: {{a}}, {{b}}, …" — a contagem e o começo da lista, como no mock. */
function resumoVariaveis(content: string): string | null {
  const variaveis = extractVariables(content);
  if (variaveis.length === 0) return null;
  const rotulo = variaveis.length === 1 ? 'variável' : 'variáveis';
  const inicio = variaveis.slice(0, 2).join(', ');
  return `${variaveis.length} ${rotulo}: ${inicio}${variaveis.length > 2 ? ', …' : ''}`;
}

export function TalkXTemplates({ onUseTemplate, startNew, onStartNewHandled, onOpenMonitor }: Props) {
  const { templates, isLoading, isError, error, refetch, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate, conversion: conversionFromHook } = useTalkXTemplates();
  // X091 — os 4 KPIs da tela 04 saem da RPC de métricas da biblioteca (X086),
  // não de contagem no navegador: total, aprovações do período (com variação),
  // mais usado por mensagens enviadas e taxa média de resposta. Sem resposta da
  // RPC o valor vai nulo e o card do kit mostra "Sem dados ainda".
  const { stats: libStats } = useTalkXTemplateLibraryStats(30, 3);
  const avgReplyDelta = pointsDelta(
    libStats?.avg_reply_rate_pct,
    libStats?.avg_reply_rate_previous_pct,
    libStats?.reply_base_current,
    libStats?.reply_base_previous,
  );
  const avgReplyComparison = avgReplyDelta == null
    ? undefined
    : { previous: libStats?.avg_reply_rate_previous_pct ?? null, kind: 'points' as const };
  const { values: filterValues, setValue: setFilterValue, query: search, setQuery: setSearch, hasActive, clear: clearFilters } = useTalkXFilterState('talkx.templates.filters', { cat: 'all', st: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [mode, setMode] = useState<ViewMode>('list');
  const [editing, setEditing] = useState<TalkXTemplate | null>(null);
  const [deleting, setDeleting] = useState<TalkXTemplate | null>(null);
  const [selected, setSelected] = useState<TalkXTemplate | null>(null);
  const [galleryMode, setGalleryMode] = useState<GalleryMode>(lerModoGaleria);
  /** T04-040: galeria ordenada por taxa de resposta (aberta pelo "Ver todos"). */
  const [orderByReply, setOrderByReply] = useState(false);

  const trocarModo = (modo: GalleryMode) => { setGalleryMode(modo); salvarModoGaleria(modo); };

  // X094 — o editor da tela 05 vive no endereço
  // (`?view=talkx&tab=templates&template=<id|new>&ttab=conteudo|ab|historico`): o link
  // direto abre o template, o F5 mantém a tela e voltar/avançar do navegador fecham e
  // reabrem. `route` é o que o endereço pede — a fonte de verdade do editor aberto.
  const [route, setRoute] = useState<TalkXTemplateRoute | null>(
    () => parseTalkXTemplateRoute(window.location.search).route,
  );

  // Template que o endereço pede; `template=new` é o editor vazio, sem linha na consulta.
  const routedTemplate = useMemo(
    () => (route && route.templateId !== 'new'
      ? templates.find((candidate) => candidate.id === route.templateId) ?? null
      : null),
    [route, templates],
  );

  const openEditorAt = useCallback((nextRoute: TalkXTemplateRoute) => {
    setRoute(nextRoute);
    pushTalkXTemplateRoute(nextRoute);
  }, []);

  // X094 — o endereço acompanha a troca feita DENTRO do editor (biblioteca lateral)
  // sem mexer no estado do React: remontar o editor aqui perderia a edição em curso
  // (R2-MOD-024 decide que só a biblioteca troca o template ativo).
  const mirrorEditorTemplate = useCallback((templateId: string) => {
    const current = parseTalkXTemplateRoute(window.location.search).route;
    replaceTalkXTemplateRoute({ templateId, ttab: current?.ttab ?? 'conteudo' });
  }, []);

  // Fechar o editor (salvar, duplicar ou Voltar) devolve a biblioteca e o endereço.
  const closeEditor = useCallback(() => {
    setRoute(null);
    replaceTalkXTemplateRoute(null);
    onStartNewHandled?.();
  }, [onStartNewHandled]);

  const openNew = () => { setEditing(null); setMode('edit'); openEditorAt({ templateId: 'new', ttab: 'conteudo' }); };
  const openEdit = (t: TalkXTemplate, opts?: { variants?: boolean }) => { setEditing(t); setMode('edit'); openEditorAt({ templateId: t.id, ttab: opts?.variants ? 'ab' : 'conteudo' }); };

  const syncFromBrowserHistory = useCallback(() => {
    const parsed = parseTalkXTemplateRoute(window.location.search);
    if (parsed.needsNormalization) replaceTalkXTemplateRoute(parsed.route);
    // O histórico é a fonte de verdade do que está aberto: o editor da visita
    // anterior não sobrevive à navegação.
    setRoute(parsed.route);
  }, []);

  useEffect(() => {
    const initial = parseTalkXTemplateRoute(window.location.search);
    if (initial.needsNormalization) replaceTalkXTemplateRoute(initial.route);
    window.addEventListener('popstate', syncFromBrowserHistory);
    return () => {
      window.removeEventListener('popstate', syncFromBrowserHistory);
      // Sair da aba fecha o editor: o endereço da tela 05 não sobrevive à visita
      // (voltar pela Biblioteca mostra a lista, não o editor que ficou aberto).
      replaceTalkXTemplateRoute(null);
    };
  }, [syncFromBrowserHistory]);

  // Id que a consulta não devolve (apagado, de outra conta ou digitado à mão): a
  // tela cai na biblioteca e o endereço perde o parâmetro, sem criar entrada no
  // histórico — o mesmo desenho do wizard quando a campanha do endereço não existe.
  useEffect(() => {
    if (!route || route.templateId === 'new' || isLoading || routedTemplate) return;
    replaceTalkXTemplateRoute(null);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (!isError) toast.error('Template não encontrado ou sem acesso.');
  }, [isError, isLoading, route, routedTemplate]);

  // R2-MOD-039: o menu do topo ("Templates ▾ → Novo template") abre o editor VAZIO.
  // X094: o pedido vira endereço e é o endereço que dirige o editor — o popstate
  // disparado aqui (mesma mecânica do goTab) é quem atualiza o estado da tela.
  useEffect(() => {
    if (!startNew) return;
    pushTalkXTemplateRoute({ templateId: 'new', ttab: 'conteudo' });
    window.dispatchEvent(new PopStateEvent('popstate'));
    onStartNewHandled?.();
  }, [onStartNewHandled, startNew]);

  const filtered = useMemo(() => {
    let r = templates;
    if (filterValues.cat !== 'all') r = r.filter((t) => t.category === filterValues.cat);
    if (filterValues.st !== 'all') r = r.filter((t) => t.status === filterValues.st);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q) || t.tags.some((x) => x.includes(q))); }
    return r;
  }, [templates, filterValues.cat, filterValues.st, search]);

  const filterDefs = useMemo(() => [
    { key: 'cat', label: 'Todas as categorias', allLabel: 'Todas as categorias', options: TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { key: 'st', label: 'Todos os status', allLabel: 'Todos os status', options: Object.entries(TEMPLATE_STATUS).map(([v, m]) => ({ value: v, label: m.label })) },
  ], []);


  // ── X092 · painel lateral da tela 04 ─────────────────────────────────────────────
  // T04-039: ranking por TAXA DE RESPOSTA com base mínima A9,
  // lido da view `talkx_campaign_metrics`. NUNCA é `use_count` sob este rótulo.
  const conversion: TalkXTemplateConversionState = conversionFromHook ?? EMPTY_CONVERSION;
  const conversionByTemplate = useMemo(
    () => new Map((conversion.ranking?.items ?? []).map((item) => [item.templateId, item])),
    [conversion.ranking],
  );
  const topConverted = useMemo(
    () => (conversion.ranking?.items ?? [])
      .slice(0, 3)
      .map((item) => ({ item, template: templates.find((t) => t.id === item.templateId) }))
      .filter((row): row is { item: TalkXTemplateConversion; template: TalkXTemplate } => !!row.template),
    [conversion.ranking, templates],
  );
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  // T04-046..049: "Sugestões" — regras sobre o mesmo dado do ranking (A/B abaixo da
  // média) e sobre o estado real do template (em revisão há mais de 3 dias).
  const suggestions = useMemo(() => {
    const list: Array<{ id: string; templateId: string; text: string; opensVariants: boolean }> = [];
    const withBase = conversion.ranking?.items ?? [];
    const average = withBase.length > 0
      ? withBase.reduce((sum, item) => sum + item.replyRatePct, 0) / withBase.length
      : 0;
    for (const item of withBase) {
      if (item.sent < SUGGESTION_MIN_SENT || item.replyRatePct >= average) continue;
      const template = templates.find((t) => t.id === item.templateId);
      if (!template) continue;
      list.push({
        id: `ab-${item.templateId}`,
        templateId: item.templateId,
        opensVariants: true,
        text: `Teste uma variação A/B em "${template.name}": ${formatReplyRate(item.replyRatePct)} de resposta, abaixo da média da biblioteca.`,
      });
    }
    for (const template of templates) {
      if (template.status !== 'review') continue;
      const days = daysSinceISO(template.updated_at);
      if (days < REVIEW_STALE_DAYS) continue;
      list.push({
        id: `review-${template.id}`,
        templateId: template.id,
        opensVariants: false,
        text: `"${template.name}" está em revisão há ${days} dias.`,
      });
    }
    return list;
  }, [conversion.ranking, templates]);
  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 2);

  // T04-040: "Ver todos" passa a galeria para lista, ordenada por taxa de resposta.
  const orderByReplyRate = useMemo(() => {
    if (!orderByReply) return filtered;
    const rateOf = (t: TalkXTemplate) => conversionByTemplate.get(t.id)?.replyRatePct ?? -1;
    return [...filtered].sort((a, b) => rateOf(b) - rateOf(a) || a.name.localeCompare(b.name));
  }, [filtered, orderByReply, conversionByTemplate]);

  // X089 — o `page` nunca aponta para uma página vazia: excluir/filtrar pode encurtar a
  // lista abaixo da página atual (antes a tela mostrava "nenhum resultado" com itens na 1ª).
  const totalPages = Math.max(1, Math.ceil(orderByReplyRate.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = orderByReplyRate.slice((safePage - 1) * pageSize, safePage * pageSize);

  const limparFiltros = () => { clearFilters(); setPage(1); };

  if (route && (route.templateId === 'new' || routedTemplate)) {
    return (
      <TalkXTemplateEditor
        key={route.templateId === 'new' ? 'novo-template' : `template-${route.templateId}`}
        templates={templates}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => { void refetch(); }}
        editing={route.templateId === 'new' ? null : routedTemplate}
        initialTtab={route.ttab}
        onActiveTemplateChange={mirrorEditorTemplate}
        onClose={closeEditor}
        onOpenMonitor={onOpenMonitor}
      />
    );
  }

  if (route) {
    // O endereço pede um template que a consulta ainda não devolveu: esqueleto no
    // lugar da biblioteca, para o F5 do link direto não piscar a lista primeiro.
    return (
      <div
        className="min-h-full w-full min-w-0"
        role="status" aria-live="polite" aria-busy={isLoading} data-talkx-query="loading"
      >
        <span className="sr-only">Carregando conteúdo…</span>
        <TalkXSkeletonRows rows={4} />
      </div>
    );
  }

    return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4" data-testid="talkx-templates-gallery">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={FileText} color="blue" index={0} label="Total de templates" value={libStats?.total ?? null} bars={libStats?.created_series ?? null} hint="Templates criados (série do período)" />
          <KpiCard icon={Check} color="green" index={1} label="Aprovados" value={libStats?.approved_period ?? null} bars={libStats?.approved_series ?? null} comparison={{ previous: libStats?.approved_previous_period ?? null, kind: 'relative' }} hint="Aprovações no período vs. o período anterior" />
          <KpiCard icon={Star} color="amber" index={2} label="Mais usados" value={libStats?.most_used?.name ?? null} bars={libStats?.most_used?.series ?? null} hint={libStats?.most_used?.messages != null ? `${fmtInt(libStats.most_used.messages)} mensagens enviadas` : 'Template com mais mensagens enviadas'} />
          <KpiCard icon={BarChart3} color="violet" index={3} label="Taxa média de resposta" value={libStats?.avg_reply_rate_pct ?? null} suffix="%" comparison={avgReplyComparison} hint="Respostas ÷ enviados no período; a variação é em pontos percentuais" />
        </div>

        <FilterBarV2
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar templates…"
          filters={filterDefs} values={filterValues} onFilter={(k, v) => { setFilterValue(k as 'cat' | 'st', v); setPage(1); }}
          hasActive={hasActive} onClear={limparFiltros}
          view={galleryMode} onView={trocarModo}
          rightSlot={<PrimaryButton icon={Plus} onClick={openNew}>Novo Template</PrimaryButton>}
        />

        <TalkXQueryBoundary
          query={{ isLoading, isError, error }}
          entity="os templates"
          onRetry={() => refetch()}
          skeleton={<TalkXSkeletonRows rows={4} />}
          isEmpty={templates.length === 0}
          empty={<TalkXEmptyState icon={FileText} title="Nenhum template criado" description="Crie templates de mensagem para suas campanhas." actionLabel="Criar template" onAction={openNew} />}
        >
        {galleryMode === 'grid' ? (
          <div data-talkx-view="grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {paged.length === 0 ? (<div className="col-span-full"><TalkXFilteredEmptyState onClearFilters={limparFiltros} /></div>)
             : paged.map((t) => (
              <TemplateCard key={t.id} t={t} selected={selected?.id === t.id} onClick={() => setSelected(t === selected ? null : t)} onEdit={() => openEdit(t)} onDuplicate={() => duplicateTemplate.mutate(t)} onDelete={() => setDeleting(t)} onUse={() => onUseTemplate(t.id)} />
            ))}
          </div>
        ) : (
          <div data-talkx-view="list" className="border border-border/70 rounded-2xl overflow-hidden divide-y divide-border/50">
            {paged.length === 0 ? <TalkXFilteredEmptyState onClearFilters={limparFiltros} />
             : paged.map((t) => (
              <TemplateListItem key={t.id} t={t} selected={selected?.id === t.id} onClick={() => setSelected(t === selected ? null : t)} onEdit={() => openEdit(t)} onDuplicate={() => duplicateTemplate.mutate(t)} onDelete={() => setDeleting(t)} onUse={() => onUseTemplate(t.id)} />
            ))}
          </div>
        )}
        </TalkXQueryBoundary>
        {filtered.length > 0 && <TalkXPagination page={safePage} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} pageSizes={PAGE_SIZES} noun="templates" />}
      </div>

      <div className="space-y-4 min-w-0">
        {/* T04-038 — HeroCard "Biblioteca inteligente" com o texto do mock (kit `SH:701`). */}
        <HeroCard
          icon={Sparkles}
          title="Biblioteca inteligente"
          subtitle="Templates que convertem, recomendações sob medida para o seu negócio."
        />

        {/* T04-039/040/042/043/044 — ranking por TAXA DE RESPOSTA: os 3 primeiros
            com base mínima A9, miniatura e "↑ N% de resposta". Sem base, o
            painel diz "sem dados ainda". */}
        <RailCard
          icon={TrendingUp}
          color="green"
          title="Mais respondidos"
          subtitle="Templates com melhor taxa de resposta."
          right={<button type="button" onClick={() => { setOrderByReply(true); setGalleryMode('list'); setPage(1); }} className="h-7 px-2 rounded-md text-2xs font-medium border border-border/60 bg-input/40 hover:bg-muted/50 shrink-0">Ver todos</button>}
        >
          {conversion.isLoading ? (
            <TalkXSkeletonRows rows={3} />
          ) : conversion.isError ? (
            <p className="text-xs text-foreground-secondary">Não foi possível carregar o ranking de resposta.</p>
          ) : topConverted.length === 0 ? (
            <p className="text-xs text-foreground-secondary">sem dados ainda</p>
          ) : (
            topConverted.map(({ item, template }, i) => (
              <button key={template.id} type="button" onClick={() => onUseTemplate(template.id)} className="w-full flex items-center gap-2.5 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 text-left rounded-xl px-1">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary-glow text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                {template.media_url ? (
                  <img src={template.media_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-border/60 shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-center shrink-0"><FileText className="w-3.5 h-3.5 text-muted-foreground" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">{template.name}</p>
                  <p className="text-2xs text-success">↑ {formatReplyRate(item.replyRatePct)} de resposta</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </RailCard>

        {/* T04-046..049 — "Sugestões": regras sobre o resultado real (variação A/B abaixo
            da média) e sobre o estado do template (em revisão há mais de 3 dias). */}
        <RailCard
          icon={Lightbulb}
          color="amber"
          title="Sugestões"
          subtitle="O que fazer a seguir, a partir dos seus resultados."
          right={suggestions.length > 2 ? <button type="button" onClick={() => setShowAllSuggestions((v) => !v)} className="h-7 px-2 rounded-md text-2xs font-medium border border-border/60 bg-input/40 hover:bg-muted/50 shrink-0">{showAllSuggestions ? 'Ver menos' : 'Ver todas'}</button> : undefined}
        >
          {conversion.isLoading ? (
            <TalkXSkeletonRows rows={2} />
          ) : conversion.isError ? (
            <p className="text-xs text-foreground-secondary">Não foi possível carregar as sugestões.</p>
          ) : visibleSuggestions.length === 0 ? (
            <p className="text-xs text-foreground-secondary">Nenhuma sugestão no momento.</p>
          ) : (
            <div className="space-y-2">
              {visibleSuggestions.map((s) => (
                <button key={s.id} type="button" onClick={() => { const t = templates.find((x) => x.id === s.templateId); if (t) openEdit(t, { variants: s.opensVariants }); }} className="w-full flex items-start gap-2.5 p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/50 text-left">
                  <Lightbulb className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                  <span className="text-xs text-foreground leading-snug">{s.text}</span>
                </button>
              ))}
            </div>
          )}
        </RailCard>

        <RailCard icon={FileText} title="Ações rápidas">
          <div className="space-y-2">
            <RailAction icon={Plus} title="Criar template" subtitle="Do zero" onClick={openNew} />
            <RailAction icon={Copy} color="violet" title="Duplicar template" subtitle="Baseado em um existente" onClick={() => selected ? duplicateTemplate.mutate(selected) : openNew()} />

          </div>
        </RailCard>
      </div>



      <TalkXConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting ? deleteTemplate.mutateAsync(deleting.id) : false}
        title={PRESETS_DO_PRODUTO.excluirTemplate.title}
        subtitle={PRESETS_DO_PRODUTO.excluirTemplate.subtitle}
        description={PRESETS_DO_PRODUTO.excluirTemplate.description}
        consequence={PRESETS_DO_PRODUTO.excluirTemplate.consequence}
        tone={PRESETS_DO_PRODUTO.excluirTemplate.tone}
        icon={PRESETS_DO_PRODUTO.excluirTemplate.icon}
        iconColor={PRESETS_DO_PRODUTO.excluirTemplate.iconColor}
        confirmLabel={PRESETS_DO_PRODUTO.excluirTemplate.confirmLabel}
        cancelLabel={PRESETS_DO_PRODUTO.excluirTemplate.cancelLabel}
        entityName={deleting?.name}
        loading={deleteTemplate.isPending}
      />
    </div>
  );
}

/**
 * X089 — cartão da grade do mock 04: prévia da mensagem com a hora REAL de
 * `updated_at`, a mídia do template em miniatura larga (uma por cartão), e a
 * ficha do template embaixo (nome, categoria, tags, variáveis usadas, data,
 * usos e status). "Usar template" só habilita o que está aprovado (A8).
 */
function TemplateCard({ t, selected, onClick, onEdit, onDuplicate, onDelete, onUse }: { t: TalkXTemplate; selected: boolean; onClick: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onUse: () => void }) {
  const sm = TEMPLATE_STATUS[t.status] ?? TEMPLATE_STATUS.draft;
  const variaveis = resumoVariaveis(t.content);
  const tagsVisiveis = t.tags.slice(0, 2);
  const tagsRestantes = t.tags.length - tagsVisiveis.length;
  const MediaIcon = t.media_type ? MEDIA_ICONS[t.media_type as keyof typeof MEDIA_ICONS] : undefined;
  const imagem = t.media_type === 'image' && !!t.media_url && /^https?:\/\//i.test(t.media_url);
  const aprovado = t.status === 'approved';
  const motivoBloqueio = aprovado ? undefined : 'Só templates aprovados podem ser usados em campanhas';
  // TL-175D (t_eedf548a): o cartao NAO e um controle. Era `role="button"` com os
  // botoes de acao DENTRO dele — o axe reprovava `nested-interactive` nos cartoes
  // da grade (controle interativo dentro de controle: o leitor de tela anuncia mal e
  // o Tab entra num controle que ja esta dentro de outro). O clique por mouse do
  // cartao continua; a selecao por TECLADO volta pelo BOTAO do NOME (WCAG 2.1.1):
  // ele e IRMAO dos botoes de acao, chama `onClick`, `aria-pressed` liga o estado e
  // o `stopPropagation` evita o clique duplo quando o mouse acerta o proprio nome.
  // Cada acao (Usar/Editar/Duplicar/Excluir) segue sendo um `<button>` real.
  return (
    <div
      data-talkx-template-card={t.id}
      onClick={onClick}
      className={cn('rounded-2xl border cursor-pointer transition-all hover:shadow-md', selected ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:border-primary/40')}
    >
      {/* Prévia da mensagem: texto CRU (as variáveis aparecem como no envio) */}
      <div className="bg-muted/30 rounded-t-2xl p-3 border-b border-border/50">
        <div className="flex justify-end">
          <div className="w-full max-w-[92%] rounded-2xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 px-3 py-2 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
            {/* Uma mídia por template, em proporção larga. Só imagem vira miniatura;
                os outros tipos não somem da tela: aparecem com o ícone e o formato. */}
            {imagem && <img src={t.media_url as string} alt="" loading="lazy" decoding="async" className="rounded-lg mb-1.5 w-full aspect-[16/9] object-cover bg-black/20" />}
            {!imagem && t.media_type && (
              <span className="flex items-center gap-1.5 rounded-lg mb-1.5 px-2 py-1 bg-black/20 text-3xs text-muted-foreground">
                {MediaIcon && <MediaIcon className="w-3 h-3" aria-hidden="true" />}{t.media_type}
              </span>
            )}
            {t.content.slice(0, 140)}{t.content.length > 140 ? '…' : ''}
            <span className="block text-right text-[9px] text-muted-foreground mt-0.5">{fmtTime(t.updated_at)} ✓✓</span>
          </div>
        </div>
      </div>
      <div className="p-3.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          aria-pressed={selected}
          aria-label={`Selecionar ${t.name}`}
          className="block max-w-full text-left text-sm font-semibold text-foreground truncate"
        >{t.name}</button>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <Pill label={sm.label} tone={sm.tone} dot />
          <span className="text-3xs px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-muted-foreground">{t.category}</span>
          {tagsVisiveis.map((tag) => <span key={tag} className="text-3xs text-[hsl(var(--primary-text))]">#{tag}</span>)}
          {tagsRestantes > 0 && <span className="text-3xs text-muted-foreground" title={t.tags.join(', ')}>+{tagsRestantes}</span>}
        </div>
        {variaveis && <p className="text-2xs text-foreground-secondary mt-2 truncate">{variaveis}</p>}
        <p className="text-2xs text-muted-foreground mt-1 truncate" title={`Atualizado em ${fmtDateTime(t.updated_at)}`}>Atualizado em {fmtDateTime(t.updated_at)}</p>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
          <button type="button" disabled={!aprovado} title={motivoBloqueio} onClick={(e) => { e.stopPropagation(); onUse(); }} className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Usar template</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50" aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50" aria-label="Duplicar"><Copy className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-dash-red/10 hover:text-dash-red ml-auto" aria-label="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
          <span className="text-3xs text-muted-foreground" title={`${fmtInt(t.use_count)} campanhas lançadas com este template`}>{fmtInt(t.use_count)} usos</span>
        </div>
      </div>
    </div>
  );
}

/**
 * X089 — linha do modo lista: ícone, nome, descrição, selo e tags. Mesma fonte
 * de dados do cartão, para a tela não contar duas histórias diferentes.
 */
export function TemplateListItem({ t, selected, onClick, onEdit, onDuplicate, onDelete, onUse }: { t: TalkXTemplate; selected: boolean; onClick: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onUse: () => void }) {
  const sm = TEMPLATE_STATUS[t.status] ?? TEMPLATE_STATUS.draft;
  const aprovado = t.status === 'approved';
  const descricao = t.description?.trim() ? t.description : `${t.content.slice(0, 80)}${t.content.length > 80 ? '…' : ''}`;
  // TL-175D (t_eedf548a): a linha da lista tambem deixa de ser `role="button"` pelo
  // MESMO motivo do cartao da grade (`nested-interactive`: controle interativo dentro
  // de controle). O clique por mouse da linha continua; a selecao por TECLADO volta
  // pelo BOTAO do NOME (WCAG 2.1.1), IRMAO dos botoes de acao, com `aria-pressed` e
  // `stopPropagation` contra o clique duplo. As acoes da linha seguem `<button>` reais.
  return (
    <div
      onClick={onClick}
      className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/20', selected ? 'bg-primary/5' : '')}
    >
      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          aria-pressed={selected}
          aria-label={`Selecionar ${t.name}`}
          className="block max-w-full text-left text-sm font-semibold text-foreground truncate"
        >{t.name}</button>
        <p className="text-xs text-muted-foreground truncate">{descricao}</p>
        {t.tags.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {t.tags.slice(0, 3).map((tag) => <span key={tag} className="text-3xs px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-muted-foreground">{tag}</span>)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-3xs px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-muted-foreground hidden sm:block">{t.category}</span>
        <Pill label={sm.label} tone={sm.tone} dot />
        <span className="text-3xs text-muted-foreground w-12 text-right hidden md:block" title={`${fmtInt(t.use_count)} campanhas lançadas com este template`}>{fmtInt(t.use_count)} usos</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" disabled={!aprovado} title={aprovado ? undefined : 'Só templates aprovados podem ser usados em campanhas'} onClick={(e) => { e.stopPropagation(); onUse(); }} className="h-7 px-2.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Usar</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="hidden sm:flex h-7 w-7 rounded-lg border border-border/70 bg-input/40 items-center justify-center hover:bg-muted/50" aria-label="Editar"><Pencil className="w-3 h-3" /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="hidden sm:flex h-7 w-7 rounded-lg border border-border/70 bg-input/40 items-center justify-center hover:bg-muted/50" aria-label="Duplicar"><Copy className="w-3 h-3" /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="hidden sm:flex h-7 w-7 rounded-lg border border-border/70 bg-input/40 items-center justify-center hover:bg-dash-red/10 hover:text-dash-red" aria-label="Excluir"><Trash2 className="w-3 h-3" /></button>
      </div>
    </div>
  );
}
