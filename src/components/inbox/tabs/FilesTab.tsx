import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Paperclip } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { useContactMedia, type ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { useQueryClient } from '@tanstack/react-query';
import { contactMediaKey } from '@/hooks/chat/useContactMedia';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import { useFilesViewState, type FilesTypeFilter } from '@/hooks/chat/useFilesViewState';
import { useFilesContainerColumns } from '@/hooks/chat/useFilesContainerColumns';
import { useFilesSelection } from '@/hooks/chat/useFilesSelection';
import { FilesToolbar } from './FilesToolbar';
import { FileCard } from './FileCard';
import { FileDetailPanel } from './FileDetailPanel';
import type { Message } from '@/types/chat';

const MediaPreviewDialog = lazy(() =>
  import('../media-gallery/MediaPreviewDialog').then((m) => ({ default: m.MediaPreviewDialog })));
const ForwardMessageDialog = lazy(() =>
  import('../ForwardMessageDialog').then((m) => ({ default: m.ForwardMessageDialog })));

const CHIPS: { id: FilesTypeFilter; label: string }[] = [
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
  const { user } = useAuth();
  const view = useFilesViewState(user?.id, contactId);
  const gridRef = useRef<HTMLDivElement>(null);
  const { available } = useFilesContainerColumns(gridRef, view.columns);
  const { data, isLoading } = useContactMedia(contactId);

  const [selected, setSelected] = useState<ContactMediaItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ContactMediaItem | null>(null);
  const [forwardItem, setForwardItem] = useState<ContactMediaItem | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = data?.counts ?? { all: 0, image: 0, video: 0, audio: 0, document: 0 };
  const hasMore = data?.hasMore ?? false;

  const filtered = useMemo(() => {
    let list = view.typeFilter === 'all' ? items : items.filter((i) => i.type === view.typeFilter);
    if (view.search.trim()) {
      const q = view.search.trim().toLowerCase();
      list = list.filter((i) => i.filename.toLowerCase().includes(q) || (i.caption ?? '').toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (view.sort === 'recent') sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else if (view.sort === 'old') sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else if (view.sort === 'biggest') sorted.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    else sorted.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
    return sorted;
  }, [items, view.typeFilter, view.search, view.sort]);

  const visibleIds = useMemo(() => filtered.map((item) => item.id), [filtered]);
  const selection = useFilesSelection(visibleIds, contactId);

  // Etapa 15: Esc dentro da aba sai do modo seleção (sem efeito destrutivo).
  useEffect(() => {
    if (!selection.selectionMode) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') selection.exit(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection]);

  const handleDeleted = () => {
    setSelected(null);
    queryClient.invalidateQueries({ queryKey: contactMediaKey(contactId) });
    queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
  };

  const forwardMessage: Message | null = forwardItem
    ? { id: forwardItem.id, content: forwardItem.caption ?? '', sender: (forwardItem.sender as 'agent' | 'contact') ?? 'contact', timestamp: new Date(forwardItem.created_at), type: forwardItem.type === 'document' ? 'document' : forwardItem.type }
    : null;

  return (
    <div className="flex flex-col gap-3" data-testid="files-tab">
      {/* Etapa 14: título e chips na mesma linha, contagem honesta, sem subtítulo. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold text-foreground">Arquivos</h2>
        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => view.setTypeFilter(chip.id)}
              aria-pressed={view.typeFilter === chip.id}
              className={cn(
                'h-8 px-3 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1.5',
                view.typeFilter === chip.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {chip.label}
              <span className={cn('tabular-nums h-4 min-w-4 px-1 rounded text-3xs font-bold flex items-center justify-center', view.typeFilter === chip.id ? 'bg-white/15' : 'bg-muted')}>
                {counts[chip.id]}
              </span>
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-muted-foreground tabular-nums">
          {hasMore
            ? `${items.length} carregados · há mais antigos`
            : `${counts.all} ${counts.all === 1 ? 'arquivo' : 'arquivos'}`}
        </p>
      </header>

      <FilesToolbar
        search={view.search}
        onSearchChange={view.setSearch}
        sort={view.sort}
        onSortChange={view.setSort}
        viewMode={view.viewMode}
        onViewModeChange={view.setViewMode}
        columns={view.columns}
        columnOptions={available}
        onColumnsChange={view.setColumns}
        selectionMode={selection.selectionMode}
        selectedCount={selection.selectedCount}
        onToggleSelectionMode={() => (selection.selectionMode ? selection.exit() : selection.enter())}
      />

      <div className="flex gap-4 items-start">
        <div ref={gridRef} className="flex-1 min-w-0">
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
                  selectionMode={selection.selectionMode}
                  selectionChecked={selection.selectedIds.has(item.id)}
                  onSelect={() => setSelected(item)}
                  onToggleSelection={() => selection.toggle(item.id)}
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
