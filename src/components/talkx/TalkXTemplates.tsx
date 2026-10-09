import React, { useState, useMemo } from 'react';
import { TalkXTemplateEditor } from './TalkXTemplateEditor';
import {
  Plus, FileText, Star, Pencil, Trash2, Copy, Image, Video, Music, Check, ChevronRight,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { PrimaryButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { useTalkXTemplates, type TalkXTemplate } from '@/hooks/integrations/useTalkXTemplates';
import { RailCard, RailAction, TalkXEmptyState, TalkXFilteredEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, TEMPLATE_CATEGORIES, TEMPLATE_STATUS, extractVariables, fmtInt, fmtDateTime, fmtTime } from './talkxShared';
import { useTalkXFilterState } from './kit/useFilterState';
import { TalkXQueryBoundary } from './kit/states';

interface Props {
  onUseTemplate: (templateId: string) => void;
  /** R2-MOD-039: pedido do menu do topo ("Templates ▾ → Novo template") para abrir o editor vazio. */
  startNew?: boolean;
  /** Chamado quando esse editor é fechado (inclusive ao salvar), para o topo limpar o pedido. */
  onStartNewHandled?: () => void;
}

const MEDIA_ICONS = { image: Image, video: Video, document: FileText, audio: Music } as const;

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

export function TalkXTemplates({ onUseTemplate, startNew, onStartNewHandled }: Props) {
  const { templates, isLoading, isError, error, refetch, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate } = useTalkXTemplates();
  const { values: filterValues, setValue: setFilterValue, query: search, setQuery: setSearch, hasActive, clear: clearFilters } = useTalkXFilterState('talkx.templates.filters', { cat: 'all', st: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [mode, setMode] = useState<ViewMode>('list');
  const [editing, setEditing] = useState<TalkXTemplate | null>(null);
  const [deleting, setDeleting] = useState<TalkXTemplate | null>(null);
  const [selected, setSelected] = useState<TalkXTemplate | null>(null);
  const [galleryMode, setGalleryMode] = useState<GalleryMode>(lerModoGaleria);

  const trocarModo = (modo: GalleryMode) => { setGalleryMode(modo); salvarModoGaleria(modo); };

  const openNew = () => { setEditing(null); setMode('edit'); };
  const openEdit = (t: TalkXTemplate) => { setEditing(t); setMode('edit'); };

  // R2-MOD-039: o menu do topo ("Templates ▾ → Novo template") abre o editor VAZIO. O modo
  // é DERIVADO do pedido (não sincronizado por efeito, para não disparar render em cascata),
  // e o editor do novo template tem `key` própria para não herdar os campos do template que
  // estivesse aberto — "novo" aqui é sempre em branco.
  const viewMode: ViewMode = startNew ? 'edit' : mode;

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

  // X089 — o `page` nunca aponta para uma página vazia: excluir/filtrar pode encurtar a
  // lista abaixo da página atual (antes a tela mostrava "nenhum resultado" com itens na 1ª).
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const most = useMemo(() => [...templates].sort((a, b) => b.use_count - a.use_count).slice(0, 3), [templates]);

  const totals = useMemo(() => ({
    total: templates.length,
    approved: templates.filter((t) => t.status === 'approved').length,
    withMedia: templates.filter((t) => t.media_url).length,
    bestRate: most[0]?.name,
  }), [templates, most]);

  const limparFiltros = () => { clearFilters(); setPage(1); };

  if (viewMode === 'edit') {
    return (
      <TalkXTemplateEditor
        key={startNew ? 'novo-template' : (editing?.id ?? 'novo-template')}
        templates={templates}
        isLoading={isLoading}
        editing={startNew ? null : editing}
        onClose={() => { setMode('list'); onStartNewHandled?.(); }}
      />
    );
  }

    return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardKpiCard size="hero" index={0} label="Total de templates" value={String(totals.total)} delta={null} tile="blue" icon={FileText} bars={null} barsColor="blue" chart="none" />
          <DashboardKpiCard size="hero" index={1} label="Aprovados" value={String(totals.approved)} delta={totals.total > 0 ? { pct: Math.round((totals.approved / totals.total) * 100), label: 'do total' } : null} tile="green" icon={Check} bars={null} barsColor="green" chart="none" />
          <DashboardKpiCard size="hero" index={2} label="Mais usado" value={totals.bestRate ? most[0].use_count.toString() : '—'} delta={totals.bestRate ? { text: totals.bestRate, tone: 'success' } : null} tile="amber" icon={Star} bars={null} barsColor="amber" chart="none" />
          <DashboardKpiCard size="hero" index={3} label="Templates com mídia" value={String(totals.withMedia)} delta={null} tile="violet" icon={Image} bars={null} barsColor="violet" chart="none" />
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
        <RailCard icon={Star} color="amber" title="Biblioteca inteligente" subtitle="Os templates mais usados na sua base.">
          <p className="text-xs font-semibold text-foreground mb-2">Mais usados</p>
          {most.map((t, i) => (
            <button key={t.id} type="button" onClick={() => onUseTemplate(t.id)} className="w-full flex items-center gap-2.5 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 text-left rounded-xl px-1">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary-glow text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-foreground truncate">{t.name}</p><p className="text-2xs text-foreground-secondary">{fmtInt(t.use_count)} usos</p></div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </RailCard>
        <RailCard icon={FileText} title="Ações rápidas">
          <div className="space-y-2">
            <RailAction icon={Plus} title="Criar template" subtitle="Do zero ou com IA" onClick={openNew} />
            <RailAction icon={Copy} color="violet" title="Duplicar template" subtitle="Baseado em um existente" onClick={() => selected ? duplicateTemplate.mutate(selected) : openNew()} />

          </div>
        </RailCard>
      </div>



      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl border-border/70">
          <AlertDialogHeader><AlertDialogTitle>Excluir template?</AlertDialogTitle><AlertDialogDescription>O template <b className="text-foreground">"{deleting?.name}"</b> será excluído permanentemente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-dash-red hover:bg-dash-red/90 text-white" onClick={() => { if (deleting) deleteTemplate.mutate(deleting.id); setDeleting(null); }}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  return (
    <div
      data-talkx-template-card={t.id}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
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
        <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <Pill label={sm.label} tone={sm.tone} dot />
          <span className="text-3xs px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-muted-foreground">{t.category}</span>
          {tagsVisiveis.map((tag) => <span key={tag} className="text-3xs text-primary-glow">#{tag}</span>)}
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
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/20', selected ? 'bg-primary/5' : '')}
    >
      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
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
