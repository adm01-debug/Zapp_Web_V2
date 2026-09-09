import { useEffect, useRef, useState } from 'react';
import { Image, File, Play, Eye, Download, Share2, MoreHorizontal, Link2, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatSmartDate } from '@/lib/formatters';
import { notifyDownloadBlocked } from '../media-gallery/mediaUtils';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { formatSize, TYPE_LABEL } from './fileDisplay';

interface FileCardProps {
  item: ContactMediaItem;
  contactName: string;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onForward: () => void;
  onDeleted: () => void;
}

function formatDuration(meta: Record<string, unknown> | null): string | null {
  const rawDuration = meta?.duration;
  if (rawDuration == null || rawDuration === '') return null;
  const seconds = typeof rawDuration === 'number' ? Math.round(rawDuration) : Number(rawDuration);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function FileCard({ item, contactName, selected, onSelect, onPreview, onForward, onDeleted }: FileCardProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [shouldResolvePreview, setShouldResolvePreview] = useState(item.type !== 'image');
  const previewSource = item.type === 'image' && shouldResolvePreview ? item.url : '';
  const { url: resolvedUrl, refresh } = useResolvedStorageUrl(previewSource);
  const size = formatSize(item.size);
  const duration = item.type === 'video' ? formatDuration(item.meta) : null;
  const hasError = !!resolvedUrl && failedUrl === resolvedUrl;

  useEffect(() => {
    if (item.type !== 'image' || shouldResolvePreview) return;
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldResolvePreview(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setShouldResolvePreview(true);
      observer.disconnect();
    }, { rootMargin: '240px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [item.type, shouldResolvePreview]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(resolvedUrl || item.url);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  const deleteMessage = async () => {
    if (!window.confirm('Apagar esta mensagem para você?')) return;
    const { supabase } = await import('@/integrations/supabase/client');
    const { error } = await supabase.from('messages').update({ is_deleted: true, content: '[Mensagem apagada]' }).eq('id', item.id);
    if (error) { toast.error('Erro ao apagar mensagem'); return; }
    toast.success('Mensagem removida');
    onDeleted();
  };

  return (
    <article
      ref={cardRef}
      data-testid="file-card"
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card outline-none transition-colors hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring',
        selected && 'border-primary ring-2 ring-primary',
      )}
    >
      <div className="relative aspect-video bg-muted">
        {item.type === 'image' && !hasError && resolvedUrl ? (
          <img src={resolvedUrl} alt={item.filename} className="w-full h-full object-cover" onError={() => { setFailedUrl(resolvedUrl); void refresh(); }} />
        ) : item.type === 'video' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="w-10 h-10 rounded-full bg-background/70 flex items-center justify-center"><Play className="w-5 h-5" aria-hidden="true" /></span>
            {duration && <span className="absolute bottom-2 right-2 inline-flex h-5 items-center rounded bg-background/80 px-1.5 text-[10px] font-medium tabular-nums">{duration}</span>}
          </div>
        ) : item.type === 'audio' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="w-10 h-10 rounded-full bg-background/70 flex items-center justify-center"><Play className="w-5 h-5" aria-hidden="true" /></span>
          </div>
        ) : item.type === 'document' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted"><File className="w-8 h-8 text-muted-foreground" aria-hidden="true" /></div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted"><Image className="w-8 h-8 text-muted-foreground" aria-hidden="true" /></div>
        )}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <p className="truncate text-[13px] font-medium">{item.filename}</p>
        <p className="text-[11px] text-muted-foreground">{TYPE_LABEL[item.type]}{size ? ` · ${size}` : ''}</p>
        <p className="text-[11px] text-muted-foreground">{formatSmartDate(item.created_at)}</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="w-4 h-4 rounded-full bg-muted-foreground/20 inline-flex items-center justify-center text-[9px] font-semibold">{(item.sender === 'agent' ? 'V' : contactName[0] ?? '?').toUpperCase()}</span>
          {item.sender === 'agent' ? 'Você' : contactName}
        </p>
      </div>

      <button
        type="button"
        aria-label={`Selecionar arquivo ${item.filename}`}
        aria-pressed={selected}
        className="absolute inset-0 z-0 outline-none"
        onClick={onSelect}
      />

      <div className="relative z-10 mt-auto flex items-center justify-end gap-1 px-2 pb-2">
        <button type="button" aria-label="Visualizar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={onPreview}><Eye className="w-3.5 h-3.5" aria-hidden="true" /></button>
        <button type="button" aria-label="Baixar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { void notifyDownloadBlocked(); }}><Download className="w-3.5 h-3.5" aria-hidden="true" /></button>
        <button type="button" aria-label="Encaminhar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={onForward}><Share2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Mais ações" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={copyLink}><Link2 className="w-4 h-4 mr-2" />Copiar link</DropdownMenuItem>
            {item.sender === 'agent' && (
              <DropdownMenuItem onClick={deleteMessage} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Excluir mensagem</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
