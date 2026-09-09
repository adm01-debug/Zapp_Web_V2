import { useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { Search, Paperclip, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { useContactMedia, type ContactMediaItem, type ContactMediaKind } from '@/hooks/chat/useContactMedia';
import { useQueryClient } from '@tanstack/react-query';
import { contactMediaKey } from '@/hooks/chat/useContactMedia';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import { FileCard } from './FileCard';
import { FileDetailPanel } from './FileDetailPanel';
import { toast } from 'sonner';

const MediaPreviewDialog = lazy(() =>
  import('../media-gallery/MediaPreviewDialog').then((m) => ({ default: m.MediaPreviewDialog })));

type TypeFilter = 'all' | ContactMediaKind;
type SortMode = 'recent' | 'old' | 'biggest';

const CHIPS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'image', label: 'Imagens' },
  { id: 'video', label: 'Vídeos' },
  { id: 'audio', label: 'Áudios' },
  { id: 'document', label: 'Docs' },
];

const FILE_GRID_STYLE = {
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))',
};

interface FilesTabProps {
  contactId: string;
  contactName: string;
}

export function FilesTab({ contactId, contactName }: FilesTabProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useContactMedia(contactId);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [showTypeFilters, setShowTypeFilters] = useState(true);
  const [selected, setSelected] = useState<ContactMediaItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ContactMediaItem | null>(null);
  const handleForwardUnavailable = useCallback(() => {
    toast.error('Encaminhamento indisponível', {
      description: 'Abra a conversa e envie o arquivo novamente. Nenhuma mensagem foi encaminhada.',
    });
  }, []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = data?.counts ?? { all: 0, image: 0, video: 0, audio: 0, document: 0 };

  const filtered = useMemo(() => {
    let list = typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.filename.toLowerCase().includes(q) || (i.caption ?? '').toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === 'recent') sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else if (sort === 'old') sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else sorted.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    return sorted;
  }, [items, typeFilter, search, sort]);

  const handleDeleted = () => {
    setSelected(null);
    queryClient.invalidateQueries({ queryKey: contactMediaKey(contactId) });
    queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="files-tab">
      <header>
        <h2 className="text-xl font-bold text-foreground">Arquivos compartilhados</h2>
        <p className="text-[13px] text-muted-foreground">Todos os arquivos, mídias e documentos desta conversa.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Buscar arquivos</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar arquivos..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 rounded-lg bg-input pl-9" />
        </label>
        <button
          type="button"
          aria-label="Filtros de tipo"
          aria-expanded={showTypeFilters}
          onClick={() => setShowTypeFilters((visible) => !visible)}
          className={cn(
            'h-9 w-9 shrink-0 rounded-lg border border-border bg-card text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            showTypeFilters && 'border-primary/40 bg-primary/10 text-primary',
          )}
        >
          <SlidersHorizontal className="mx-auto h-4 w-4" aria-hidden="true" />
        </button>
        <label className="sr-only" htmlFor="files-sort">Ordenar arquivos</label>
        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger id="files-sort" className="h-9 w-[180px] rounded-lg bg-input"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="old">Mais antigos</SelectItem>
            <SelectItem value="biggest">Maiores</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showTypeFilters && <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por tipo de arquivo">
        {CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            aria-pressed={typeFilter === chip.id}
            onClick={() => setTypeFilter(chip.id)}
            className={cn(
              'h-8 px-3 rounded-lg text-[13px] font-medium border inline-flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring',
              typeFilter === chip.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground'
            )}
          >
            {chip.label}
            <span className={cn(
              'inline-flex min-w-5 items-center justify-center rounded-md px-1 text-[11px] tabular-nums',
              typeFilter === chip.id ? 'bg-primary-foreground/15' : 'bg-muted',
            )}>{counts[chip.id]}</span>
          </button>
        ))}
      </div>}

      <div className="flex min-w-0 flex-col items-start gap-4 xl:flex-row">
        <div className="min-w-0 flex-1" data-testid="files-grid-container">
          {isLoading ? (
            <div className="grid gap-3" style={FILE_GRID_STYLE} aria-label="Carregando arquivos">
              {[...Array(6)].map((_, i) => <div key={i} className="aspect-video rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Paperclip} title="Nenhum arquivo encontrado" description="Arquivos, imagens e documentos desta conversa aparecerão aqui." size="sm" />
          ) : (
            <div className="grid gap-3" style={FILE_GRID_STYLE} data-testid="files-grid">
              {filtered.map((item) => (
                <FileCard
                  key={item.id}
                  item={item}
                  contactName={contactName}
                  selected={selected?.id === item.id}
                  onSelect={() => setSelected(item)}
                  onPreview={() => setPreviewItem(item)}
                  onForward={handleForwardUnavailable}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>
          )}
        </div>

        {selected && (
          <FileDetailPanel
            item={selected}
            contactName={contactName}
            onClose={() => setSelected(null)}
            onForward={handleForwardUnavailable}
            onDeleted={handleDeleted}
          />
        )}
      </div>

      {previewItem && (
        <Suspense fallback={null}>
          <MediaPreviewDialog item={previewItem} open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)} />
        </Suspense>
      )}

    </div>
  );
}
