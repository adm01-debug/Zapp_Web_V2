import { useMemo, useState } from 'react';
import {
  Bookmark, Filter, MoreVertical, Pencil, Plus, Power, Search, Star, StarOff, Trash2, Zap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/auth/useAuth';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';
import type { PillTone } from '../kit/constants';
import { IconTile, TalkXEmptyState, TalkXSkeletonRows, fmtInt } from '../talkxShared';
import { Pill, PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { TalkXQueryBoundary } from '../kit/states';
import { cn } from '@/lib/utils';

/**
 * X112 — coluna "Meus Segmentos" da tela 03 (lista | construtor | resumo).
 *
 * É a PRIMEIRA coluna do construtor a partir de 1280px; abaixo disso o mesmo
 * conteúdo é montado na gaveta (`drawer`) aberta pelo botão "Meus segmentos".
 *
 * `tags` chega pela coluna de X101 (`talkx_segments.tags text[]`); aqui o campo
 * é opcional para o filtro do funil já funcionar quando a coluna existir.
 */
export type SegmentLike = TalkXSegment & { tags?: string[] | null };

/** Selo do cartão — `draft` entra quando X101 abrir o status de rascunho. */
const STATUS_MAP: Record<string, { label: string; tone: PillTone }> = {
  active: { label: 'Ativo', tone: 'success' },
  inactive: { label: 'Inativo', tone: 'muted' },
  draft: { label: 'Rascunho', tone: 'warning' },
};

type SideTab = 'all' | 'mine' | 'favorites';

const TAB_LABEL: Record<SideTab, string> = { all: 'Todos', mine: 'Meus', favorites: 'Favoritos' };
const TAB_ORDER: SideTab[] = ['all', 'mine', 'favorites'];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'draft', label: 'Rascunho' },
];

const ORIGIN_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'zapp', label: 'ZAPP' },
  { value: 'crm360', label: 'CRM 360°' },
  { value: 'custom', label: 'Personalizado' },
];

export interface SegmentSideListProps {
  segments: SegmentLike[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  /** Segmento carregado no construtor (destacado na lista). */
  activeId?: string | null;
  /** Clicar no cartão carrega o segmento no construtor. */
  onSelect: (segment: SegmentLike) => void;
  onNew: () => void;
  onEdit?: (segment: TalkXSegment) => void;
  onUseCampaign?: (segmentId: string) => void;
  /** Devolve a promessa da gravação: rejeição desfaz a estrela. */
  onToggleFavorite?: (segment: TalkXSegment, next: boolean) => Promise<unknown> | void;
  onToggleStatus?: (segment: TalkXSegment, next: 'active' | 'inactive') => void;
  onDelete?: (segment: TalkXSegment) => void;
  /** Monta o conteúdo como gaveta (abaixo de 1280px). */
  drawer?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SegmentSideList(props: SegmentSideListProps) {
  const { drawer = false, open = false, onOpenChange } = props;

  if (drawer) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-[320px] max-w-[85vw] p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-[15px] font-bold text-left">Meus segmentos</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
            <SideListBody {...props} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <section aria-label="Meus segmentos" className="rounded-2xl bg-card border border-border/70 p-3 space-y-3 max-h-[calc(100vh_-_9rem)] overflow-y-auto">
      <h2 className="text-[13px] font-bold text-foreground">Meus segmentos</h2>
      <SideListBody {...props} />
    </section>
  );
}

function SideListBody({
  segments, isLoading, isError, error, onRetry, activeId, onSelect, onNew,
  onEdit, onUseCampaign, onToggleFavorite, onToggleStatus, onDelete,
}: SegmentSideListProps) {
  const { profile } = useAuth();
  const currentUserId = profile?.id ?? null;

  const [tab, setTab] = useState<SideTab>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [tag, setTag] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  // Marca otimista do favorito: a estrela muda antes da resposta e volta ao
  // valor do servidor quando a gravação falha (V55).
  const [favOverride, setFavOverride] = useState<Record<string, boolean>>({});

  const isFavorite = (s: TalkXSegment) => favOverride[s.id] ?? s.is_favorite;

  const allTags = useMemo(
    () => Array.from(new Set(segments.flatMap((s) => s.tags ?? []))).sort((a, b) => a.localeCompare(b)),
    [segments],
  );

  const counts = useMemo(() => ({
    all: segments.length,
    mine: segments.filter((s) => s.created_by === currentUserId).length,
    favorites: segments.filter((s) => favOverride[s.id] ?? s.is_favorite).length,
  }), [segments, currentUserId, favOverride]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return segments
      .filter((s) => (tab === 'mine' ? s.created_by === currentUserId : tab === 'favorites' ? (favOverride[s.id] ?? s.is_favorite) : true))
      .filter((s) => status === 'all' || s.status === status)
      .filter((s) => origin === 'all' || s.origin === origin)
      .filter((s) => tag === 'all' || (s.tags ?? []).includes(tag))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q))
      .sort((a, b) => Number(favOverride[b.id] ?? b.is_favorite) - Number(favOverride[a.id] ?? a.is_favorite)
        || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }, [segments, tab, currentUserId, status, origin, tag, search, favOverride]);

  const activeFilters = status !== 'all' || origin !== 'all' || tag !== 'all';
  const clearFilters = () => { setStatus('all'); setOrigin('all'); setTag('all'); };

  const toggleFavorite = async (s: TalkXSegment) => {
    const next = !isFavorite(s);
    setFavOverride((o) => ({ ...o, [s.id]: next }));
    try {
      await onToggleFavorite?.(s, next);
    } catch {
      setFavOverride((o) => { const copy = { ...o }; delete copy[s.id]; return copy; });
    }
  };

  return (
    <div className="space-y-3 min-w-0">
      <PrimaryButton icon={Plus} onClick={onNew} className="w-full justify-center">Novo Segmento</PrimaryButton>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar segmentos"
          placeholder="Buscar segmentos..." className="h-9 pl-8 text-xs bg-input/40 border-border/70" />
      </div>

      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Filtrar segmentos" aria-expanded={filterOpen}
            className={cn('h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 transition-colors',
              activeFilters ? 'border-primary/40 bg-primary/10 text-primary-glow' : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50')}>
            <Filter className="w-3.5 h-3.5" />Filtros
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3 space-y-3">
          <FilterGroup label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <FilterGroup label="Origem" value={origin} onChange={setOrigin} options={ORIGIN_OPTIONS} />
          <FilterGroup label="Tags" value={tag} onChange={setTag}
            options={[{ value: 'all', label: 'Todas' }, ...allTags.map((t) => ({ value: t, label: t }))]} />
          {allTags.length === 0 && <p className="text-3xs text-muted-foreground">Nenhuma tag nos segmentos ainda.</p>}
          <button type="button" onClick={clearFilters} disabled={!activeFilters}
            className="h-8 px-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
            Limpar filtros
          </button>
        </PopoverContent>
      </Popover>

      <div role="tablist" aria-label="Segmentos" className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-input/20 p-1">
        {TAB_ORDER.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn('h-7 rounded-md text-2xs font-semibold transition-colors',
              tab === key ? 'bg-primary/15 text-primary-glow' : 'text-foreground-secondary hover:bg-muted/40')}>
            {TAB_LABEL[key]} {counts[key]}
          </button>
        ))}
      </div>

      <TalkXQueryBoundary
        query={{ isLoading: !!isLoading, isError: !!isError, error: error ?? null }}
        entity="segmentos"
        onRetry={onRetry}
        skeleton={<TalkXSkeletonRows rows={3} variant="cards" />}
        isEmpty={segments.length === 0}
        empty={<TalkXEmptyState icon={Bookmark} title="Nenhum segmento salvo" description="Crie um segmento para reutilizar o mesmo público em várias campanhas." actionLabel="Criar segmento" onAction={onNew} />}
      >
        {visible.length === 0 ? (
          <TalkXEmptyState preset="filtered" title="Nenhum segmento encontrado" description="Ajuste a busca ou os filtros." onClearFilters={clearFilters} />
        ) : (
          <ul role="list" data-testid="segment-side-list" className="space-y-2">
            {visible.map((s) => (
              <SegmentCard
                key={s.id}
                segment={s}
                active={activeId === s.id}
                favorite={isFavorite(s)}
                onSelect={onSelect}
                onToggleFavorite={toggleFavorite}
                onEdit={onEdit}
                onUseCampaign={onUseCampaign}
                onToggleStatus={onToggleStatus}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </TalkXQueryBoundary>
    </div>
  );
}

function FilterGroup({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-3xs uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={o.value === value}
            className={cn('h-7 px-2 rounded-lg text-2xs border transition-colors',
              o.value === value ? 'border-primary/50 bg-primary/15 text-primary-glow' : 'border-border/60 bg-input/30 text-foreground-secondary hover:bg-muted/40')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SegmentCard({ segment, active, favorite, onSelect, onToggleFavorite, onEdit, onUseCampaign, onToggleStatus, onDelete, selectable = false, selected = false, onToggleSelect }: {
  segment: SegmentLike; active: boolean; favorite: boolean;
  onSelect: (s: TalkXSegment) => void; onToggleFavorite: (s: TalkXSegment) => void;
  onEdit?: (s: TalkXSegment) => void; onUseCampaign?: (id: string) => void;
  onToggleStatus?: (s: TalkXSegment, next: 'active' | 'inactive') => void;
  onDelete?: (s: TalkXSegment) => void;
  /** X114: o mesmo cartão serve à GRADE da biblioteca, que seleciona em massa. */
  selectable?: boolean; selected?: boolean; onToggleSelect?: (s: TalkXSegment) => void;
}) {
  const status = STATUS_MAP[segment.status] ?? { label: segment.status, tone: 'muted' as PillTone };
  return (
    <li>
      <div
        role="button" tabIndex={0} aria-label={`Abrir segmento ${segment.name}`} aria-current={active ? 'true' : undefined}
        onClick={() => onSelect(segment)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(segment); } }}
        className={cn('rounded-xl border p-2.5 cursor-pointer transition-colors',
          selected ? 'border-primary/60 bg-primary/10' : active ? 'border-primary/60 bg-primary/5' : 'border-border/60 bg-input/20 hover:bg-muted/30')}
      >
        <div className="flex items-start gap-2">
          {selectable && (
            <input
              type="checkbox" checked={selected} aria-label={`Selecionar ${segment.name}`}
              onClick={(e) => e.stopPropagation()} onChange={() => onToggleSelect?.(segment)}
              className="mt-1 h-4 w-4 shrink-0 accent-primary" />
          )}
          <IconTile icon={Bookmark} color="violet" size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground truncate">{segment.name}</p>
            <p className="text-2xs text-foreground-secondary line-clamp-2">{segment.description || 'Sem descrição'}</p>
          </div>
          <button type="button" aria-pressed={favorite}
            aria-label={favorite ? `Remover favorito de ${segment.name}` : `Favoritar ${segment.name}`}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(segment); }}
            className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-dash-amber shrink-0">
            {favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" onClick={(e) => e.stopPropagation()} aria-label={`Ações de ${segment.name}`}
                className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-muted/50 shrink-0">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onEdit?.(segment)}><Pencil className="w-4 h-4 mr-2" />Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUseCampaign?.(segment.id)}><Zap className="w-4 h-4 mr-2" />Usar em campanha</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleStatus?.(segment, segment.status === 'active' ? 'inactive' : 'active')}>
                <Power className="w-4 h-4 mr-2" />{segment.status === 'active' ? 'Inativar' : 'Ativar'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-dash-red" onClick={() => onDelete?.(segment)}><Trash2 className="w-4 h-4 mr-2" />Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Pill label={status.label} tone={status.tone} dot />
          <span className="text-2xs text-foreground-secondary">{fmtInt(segment.estimated_count)} contatos</span>
        </div>
      </div>
    </li>
  );
}
