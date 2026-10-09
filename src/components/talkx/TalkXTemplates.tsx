import React, { useState, useMemo } from 'react';
import { TalkXTemplateEditor } from './TalkXTemplateEditor';
import {
  Plus, FileText, Star, Copy, Search, Image, Video, Music, X,
  Check, Wand2, BookOpen, ChevronRight, BarChart3, Eye, EyeOff,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { PrimaryButton, GhostButton } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { useTalkXTemplates, type TalkXTemplate, type TemplateInput } from '@/hooks/integrations/useTalkXTemplates';
import { useTalkXTemplateActions } from '@/hooks/integrations/useTalkXTemplateActions';
import { IconTile, WhatsAppBubble, RailCard, RailAction, TalkXEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, TEMPLATE_CATEGORIES, TEMPLATE_STATUS, VARIABLE_KEYS, personalizePreview, fmtInt, fmtDateTime } from './talkxShared';
import { useTalkXFilterState } from './kit/useFilterState';
import { TalkXQueryBoundary } from './kit/states';
// X090 — ações do template unificadas (menu ⋮ + controle de status) no cartão, na
// lista e na biblioteca lateral; o modal de exclusão é o do kit.
import { TalkXTemplateActionsMenu } from './TalkXTemplateActionsMenu';
import { TalkXTemplateStatusControl } from './TalkXTemplateStatusControl';

interface Props {
  onUseTemplate: (templateId: string) => void;
  /** R2-MOD-039: pedido do menu do topo ("Templates ▾ → Novo template") para abrir o editor vazio. */
  startNew?: boolean;
  /** Chamado quando esse editor é fechado (inclusive ao salvar), para o topo limpar o pedido. */
  onStartNewHandled?: () => void;
}

const MEDIA_ICONS = { image: Image, video: Video, document: FileText, audio: Music } as const;

type ViewMode = 'list' | 'edit';

export function TalkXTemplates({ onUseTemplate, startNew, onStartNewHandled }: Props) {
  const { templates, isLoading, isError, error, refetch, createTemplate, updateTemplate } = useTalkXTemplates();
  // X090: o atalho "Duplicar template" da biblioteca lateral passa pelo MESMO
  // caminho do menu ⋮ (cria a cópia e devolve a linha criada).
  const actions = useTalkXTemplateActions();
  const { values: filterValues, setValue: setFilterValue, query: search, setQuery: setSearch, hasActive, clear: clearFilters } = useTalkXFilterState('talkx.templates.filters', { cat: 'all', st: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [mode, setMode] = useState<ViewMode>('list');
  const [editing, setEditing] = useState<TalkXTemplate | null>(null);
  const [selected, setSelected] = useState<TalkXTemplate | null>(null);
  const [galleryMode, setGalleryMode] = useState<'grid' | 'list'>('grid');

  // editor state
  const [eName, setEName] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eCat, setECat] = useState('geral');
  const [eContent, setEContent] = useState('');
  const [eMediaUrl, setEMediaUrl] = useState('');
  const [eMediaType, setEMediaType] = useState('');
  const [eHasMedia, setEHasMedia] = useState(false);
  const [eStatus, setEStatus] = useState<'draft'|'review'|'approved'>('approved');
  const [eTags, setETags] = useState<string[]>([]);
  const [eTagInput, setETagInput] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEName(''); setEDesc(''); setECat('geral'); setEContent(''); setEMediaUrl(''); setEMediaType(''); setEHasMedia(false); setEStatus('approved'); setETags([]); setEditing(null); setMode('edit'); };
  const openEdit = (t: TalkXTemplate) => { setEName(t.name); setEDesc(t.description ?? ''); setECat(t.category); setEContent(t.content); setEMediaUrl(t.media_url ?? ''); setEMediaType(t.media_type ?? ''); setEHasMedia(!!t.media_url); setEStatus(t.status); setETags(t.tags ?? []); setEditing(t); setMode('edit'); };

  /**
   * X090 — depois de excluir, nada pode continuar apontando para o template que
   * sumiu (a seleção do cartão alimentava o atalho "Duplicar template").
   */
  const handleDeleted = (id: string) => setSelected((current) => (current?.id === id ? null : current));

  /**
   * X090/R2-MOD-061: o atalho do rail duplica o template SELECIONADO pelo MESMO
   * caminho do menu ⋮ — nunca abre o original para edição. Sem seleção, abre o
   * fluxo de template novo. Aqui a cópia não é aberta: o atalho é "duplicar" e a
   * pessoa volta para onde estava (a cópia aparece na lista).
   */
  const duplicateFromRail = () => {
    if (!selected) { openNew(); return; }
    void actions.duplicate(selected).catch(() => { /* avisado no toast da mutation */ });
  };

  // R2-MOD-039: o menu do topo ("Templates ▾ → Novo template") abre o editor VAZIO. O modo
  // é DERIVADO do pedido (não sincronizado por efeito, para não disparar render em cascata),
  // e o editor do novo template tem `key` própria para não herdar os campos do template que
  // estivesse aberto — "novo" aqui é sempre em branco.
  const viewMode: ViewMode = startNew ? 'edit' : mode;

  const save = async () => {
    if (!eName.trim() || !eContent.trim()) return;
    setSaving(true);
    const payload: TemplateInput = { name: eName, description: eDesc || null, category: eCat, content: eContent, media_url: eHasMedia && eMediaUrl ? eMediaUrl : null, media_type: eHasMedia && eMediaType ? eMediaType : null, tags: eTags, status: eStatus, custom_variables: editing?.custom_variables ?? [] };
    try {
      if (editing) await updateTemplate.mutateAsync({ id: editing.id, expectedUpdatedAt: editing.updated_at, ...payload });
      else await createTemplate.mutateAsync(payload);
      setMode('list');
    } finally { setSaving(false); }
  };

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

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const most = useMemo(() => [...templates].sort((a, b) => b.use_count - a.use_count).slice(0, 3), [templates]);

  const totals = useMemo(() => ({
    total: templates.length,
    approved: templates.filter((t) => t.status === 'approved').length,
    withMedia: templates.filter((t) => t.media_url).length,
    bestRate: most[0]?.name,
  }), [templates, most]);


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
          hasActive={hasActive} onClear={() => { clearFilters(); setPage(1); }}
          view={galleryMode} onView={setGalleryMode}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
            {paged.length === 0 ? (<div className="col-span-full"><TalkXEmptyState icon={Search} title="Nenhum template encontrado" /></div>)
             : paged.map((t) => (
              <TemplateCard key={t.id} t={t} selected={selected?.id === t.id} onClick={() => setSelected(t === selected ? null : t)} onEdit={openEdit} onOpenCopy={openEdit} onDeleted={handleDeleted} onUse={() => onUseTemplate(t.id)} />
            ))}
          </div>
        ) : (
          <div className="border border-border/70 rounded-2xl overflow-hidden divide-y divide-border/50">
            {paged.length === 0 ? <TalkXEmptyState icon={Search} title="Nenhum template encontrado" />
             : paged.map((t) => (
              <TemplateListRow key={t.id} t={t} selected={selected?.id === t.id} onClick={() => setSelected(t === selected ? null : t)} onEdit={openEdit} onOpenCopy={openEdit} onDeleted={handleDeleted} onUse={() => onUseTemplate(t.id)} />
            ))}
          </div>
        )}
        </TalkXQueryBoundary>
        {filtered.length > 0 && <TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="templates" />}
      </div>

      <div className="space-y-4 min-w-0">
        <RailCard icon={Star} color="amber" title="Biblioteca inteligente" subtitle="Os templates mais usados na sua base.">
          <p className="text-xs font-semibold text-foreground mb-2">Mais usados</p>
          {most.map((t, i) => (
            <div key={t.id} className="flex items-center gap-1.5 py-2.5 border-b border-border/50 last:border-0 rounded-xl px-1 hover:bg-muted/20">
              <button type="button" onClick={() => onUseTemplate(t.id)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary-glow text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-foreground truncate">{t.name}</p><p className="text-2xs text-foreground-secondary">{fmtInt(t.use_count)} usos</p></div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              {/* X090: as mesmas ações do cartão, aqui na biblioteca lateral. */}
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                <TalkXTemplateActionsMenu template={t} onEdit={openEdit} onOpenCopy={openEdit} onDeleted={handleDeleted} label={`Ações do template ${t.name}`} />
              </div>
            </div>
          ))}
        </RailCard>
        <RailCard icon={FileText} title="Ações rápidas">
          <div className="space-y-2">
            <RailAction icon={Plus} title="Criar template" subtitle="Do zero ou com IA" onClick={openNew} />
            <RailAction icon={Copy} color="violet" title="Duplicar template" subtitle="Baseado em um existente" onClick={duplicateFromRail} />
          </div>
        </RailCard>
      </div>
    </div>
  );
}

function TemplateListRow({ t, selected, onClick, onEdit, onOpenCopy, onDeleted, onUse }: { t: TalkXTemplate; selected: boolean; onClick: () => void; onEdit: (t: TalkXTemplate) => void; onOpenCopy: (t: TalkXTemplate) => void; onDeleted: (id: string) => void; onUse: () => void }) {
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
        <p className="text-xs text-muted-foreground truncate">{t.content.slice(0, 80)}{t.content.length > 80 ? '…' : ''}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-3xs px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-muted-foreground hidden sm:block">{t.category}</span>
        {/* X090: selo + aprovação no lugar do `<Select>` livre. */}
        <TalkXTemplateStatusControl template={t} />
        <span className="text-3xs text-muted-foreground w-12 text-right hidden md:block">{fmtInt(t.use_count)} usos</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={(e) => { e.stopPropagation(); onUse(); }} className="h-7 px-2.5 rounded-lg bg-primary text-white text-xs font-semibold">Usar</button>
        <div onClick={(e) => e.stopPropagation()}>
          <TalkXTemplateActionsMenu template={t} onEdit={onEdit} onOpenCopy={onOpenCopy} onDeleted={onDeleted} />
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ t, selected, onClick, onEdit, onOpenCopy, onDeleted, onUse }: { t: TalkXTemplate; selected: boolean; onClick: () => void; onEdit: (t: TalkXTemplate) => void; onOpenCopy: (t: TalkXTemplate) => void; onDeleted: (id: string) => void; onUse: () => void }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={cn('rounded-2xl border cursor-pointer transition-all hover:shadow-md', selected ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:border-primary/40')}
    >
      {/* Bubble preview */}
      <div className="bg-muted/30 rounded-t-2xl p-3 border-b border-border/50">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 px-3 py-2 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
            {t.media_url && <div className="rounded-lg mb-1.5 px-2 py-1 bg-black/20 text-3xs text-muted-foreground">📎 {t.media_type}</div>}
            {t.content.slice(0, 140)}{t.content.length > 140 ? '…' : ''}
            <span className="block text-right text-[9px] text-muted-foreground mt-0.5">Agora ✓✓</span>
          </div>
        </div>
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {/* X090: selo + aprovação no lugar do `<Select>` livre. */}
              <TalkXTemplateStatusControl template={t} />
              <span className="text-3xs px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-muted-foreground">{t.category}</span>
              {t.tags.slice(0, 2).map((tag) => <span key={tag} className="text-3xs text-primary-glow">#{tag}</span>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
          <button type="button" onClick={(e) => { e.stopPropagation(); onUse(); }} className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold">Usar template</button>
          <div onClick={(e) => e.stopPropagation()} className="ml-auto">
            <TalkXTemplateActionsMenu template={t} onEdit={onEdit} onOpenCopy={onOpenCopy} onDeleted={onDeleted} />
          </div>
          <span className="text-3xs text-muted-foreground">{fmtInt(t.use_count)} usos</span>
        </div>
      </div>
    </div>
  );
}
