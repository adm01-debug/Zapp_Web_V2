import { useMemo, useState, lazy, Suspense } from 'react';
import { Search, Paperclip } from 'lucide-react';
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
import type { Message } from '@/types/chat';

const MediaPreviewDialog = lazy(() =>
  import('../media-gallery/MediaPreviewDialog').then((m) => ({ default: m.MediaPreviewDialog })));
const ForwardMessageDialog = lazy(() =>
  import('../ForwardMessageDialog').then((m) => ({ default: m.ForwardMessageDialog })));

type TypeFilter = 'all' | ContactMediaKind;
type SortMode = 'recent' | 'old' | 'biggest';

const CHIPS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'image', label: 'Imagens' },
  { id: 'video', label: 'Vídeos' },
  { id: 'audio', label: 'Áudios' },
  { id: 'document', label: 'Docs' },
];

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
  const [selected, setSelected] = useState<ContactMediaItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ContactMediaItem | null>(null);
  const [forwardItem, setForwardItem] = useState<ContactMediaItem | null>(null);

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

  const forwardMessage: Message | null = forwardItem
    ? { id: forwardItem.id, content: forwardItem.caption ?? '', sender: (forwardItem.sender as 'agent' | 'contact') ?? 'contact', timestamp: new Date(forwardItem.created_at), type: forwardItem.type === 'document' ? 'document' : forwardItem.type }
    : null;

  return (
    <div className="flex flex-col gap-4" data-testid="files-tab">
      <header>
        <h2 className="text-xl font-bold text-foreground">Arquivos compartilhados</h2>
        <p className="text-sm text-muted-foreground">Todos os arquivos, mídias e documentos desta conversa.</p>
      </header>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar arquivos..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-9" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger className="h-10 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="old">Mais antigos</SelectItem>
            <SelectItem value="biggest">Maiores</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setTypeFilter(chip.id)}
            className={cn(
              'h-8 px-3 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1.5',
              typeFilter === chip.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground'
            )}
          >
            {chip.label}
            <span className={cn('tabular-nums h-4 min-w-4 px-1 rounded text-[10px] font-bold flex items-center justify-center', typeFilter === chip.id ? 'bg-white/15' : 'bg-muted')}>
              {counts[chip.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="grid grid-cols-2 2xl:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="aspect-[4/5] rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Paperclip} title="Nenhum arquivo encontrado" description="Arquivos, imagens e documentos desta conversa aparecerão aqui." size="sm" />
          ) : (
            <div className="grid grid-cols-2 2xl:grid-cols-3 gap-3">
              {filtered.map((item) => (
                <FileCard
                  key={item.id}
                  item={item}
                  contactName={contactName}
                  selected={selected?.id === item.id}
                  onSelect={() => setSelected(item)}
                  onPreview={() => setPreviewItem(item)}
                  onForward={() => setForwardItem(item)}
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
            onForward={() => setForwardItem(selected)}
            onDeleted={handleDeleted}
          />
        )}
      </div>

      {previewItem && (
        <Suspense fallback={null}>
          <MediaPreviewDialog item={previewItem} open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)} />
        </Suspense>
      )}

      {forwardMessage && (
        <Suspense fallback={null}>
          <ForwardMessageDialog
            open={!!forwardItem}
            onOpenChange={(open) => !open && setForwardItem(null)}
            message={forwardMessage}
            onForward={() => {}}
          />
        </Suspense>
      )}
    </div>
  );
}
