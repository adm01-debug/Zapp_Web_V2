import { useState } from 'react';
import { Image, File, Play, Eye, Download, Share2, MoreVertical, Link2, Trash2 } from 'lucide-react';
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

export function FileCard({ item, contactName, selected, onSelect, onPreview, onForward, onDeleted }: FileCardProps) {
  const [hasError, setHasError] = useState(false);
  const { url: resolvedUrl, refresh } = useResolvedStorageUrl(item.url);
  const size = formatSize(item.size);

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
    <div
      data-testid="file-card"
      className={cn('rounded-xl border bg-card overflow-hidden flex flex-col cursor-pointer transition-colors', selected ? 'border-primary' : 'border-border hover:border-primary/40')}
      onClick={onSelect}
    >
      <div className="aspect-[16/10] bg-muted relative">
        {item.type === 'image' && !hasError && resolvedUrl ? (
          <img src={resolvedUrl} alt={item.filename} className="w-full h-full object-cover" onError={() => { setHasError(true); void refresh(); }} />
        ) : item.type === 'video' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="w-10 h-10 rounded-full bg-background/60 flex items-center justify-center"><Play className="w-5 h-5" /></span>
          </div>
        ) : item.type === 'audio' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="w-10 h-10 rounded-full bg-background/60 flex items-center justify-center"><Play className="w-5 h-5" /></span>
          </div>
        ) : item.type === 'document' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted"><File className="w-8 h-8 text-muted-foreground" /></div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted"><Image className="w-8 h-8 text-muted-foreground" /></div>
        )}
      </div>

      <div className="p-2.5 flex flex-col gap-1">
        <p className="text-[13px] font-semibold truncate">{item.filename}</p>
        <p className="text-xs text-muted-foreground">{TYPE_LABEL[item.type]}{size ? ` · ${size}` : ''}</p>
        <p className="text-xs text-muted-foreground">{formatSmartDate(item.created_at)}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-muted-foreground/20 inline-flex items-center justify-center text-[9px] font-semibold">{(item.sender === 'agent' ? 'V' : contactName[0] ?? '?').toUpperCase()}</span>
          {item.sender === 'agent' ? 'Você' : contactName}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-end gap-1 px-2 pb-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Visualizar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onPreview}><Eye className="w-3.5 h-3.5" /></button>
        <button type="button" aria-label="Baixar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { void notifyDownloadBlocked(); }}><Download className="w-3.5 h-3.5" /></button>
        <button type="button" aria-label="Encaminhar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onForward}><Share2 className="w-3.5 h-3.5" /></button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Mais ações" className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical className="w-3.5 h-3.5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={copyLink}><Link2 className="w-4 h-4 mr-2" />Copiar link</DropdownMenuItem>
            {item.sender === 'agent' && (
              <DropdownMenuItem onClick={deleteMessage} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Excluir mensagem</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
