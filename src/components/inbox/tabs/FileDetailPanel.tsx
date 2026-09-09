import { useState } from 'react';
import { X, Image, File, Play, Download, Share2, Link2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { notifyDownloadBlocked } from '../media-gallery/mediaUtils';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { formatSize, TYPE_LABEL } from './fileDisplay';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

interface FileDetailPanelProps {
  item: ContactMediaItem;
  contactName: string;
  onClose: () => void;
  onForward: () => void;
  onDeleted: () => void;
}

export function FileDetailPanel({ item, contactName, onClose, onForward, onDeleted }: FileDetailPanelProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { url: resolvedUrl, refresh } = useResolvedStorageUrl(item.url);
  const size = formatSize(item.size);
  const hasError = !!resolvedUrl && failedUrl === resolvedUrl;

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
    <aside
      data-testid="file-detail-panel"
      aria-label={`Detalhes de ${item.filename}`}
      className="flex w-full shrink-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 xl:w-[260px]"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Detalhes</p>
        <button type="button" aria-label="Fechar detalhes" onClick={onClose} className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="w-3.5 h-3.5" aria-hidden="true" /></button>
      </div>

      <div className="aspect-[4/3] rounded-lg bg-muted flex items-center justify-center overflow-hidden">
        {item.type === 'image' && !hasError && resolvedUrl ? (
          <img src={resolvedUrl} alt={item.filename} className="w-full h-full object-cover" onError={() => { setFailedUrl(resolvedUrl); void refresh(); }} />
        ) : item.type === 'video' || item.type === 'audio' ? (
          <Play className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
        ) : item.type === 'document' ? (
          <File className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Image className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold truncate">{item.filename}</p>
        <p className="text-xs text-muted-foreground">{TYPE_LABEL[item.type]}{size ? ` · ${size}` : ''}</p>
        <p className="text-xs text-muted-foreground">{format(new Date(item.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
            {(item.sender === 'agent' ? 'V' : contactName[0] ?? '?').toUpperCase()}
          </span>
          Enviado por {item.sender === 'agent' ? 'Você' : contactName}
        </p>
      </div>

      {item.caption && (
        <p className="rounded-lg bg-muted/30 p-2.5 text-xs">{item.caption}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <Button size="sm" className="h-9 w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { void notifyDownloadBlocked(); }}>
          <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Baixar arquivo
        </Button>
        <Button size="sm" variant="outline" className="h-8 w-full justify-start gap-2 border-border bg-muted/40 text-xs" onClick={onForward}>
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />Encaminhar
        </Button>
        <Button size="sm" variant="outline" className="h-8 w-full justify-start gap-2 border-border bg-muted/40 text-xs" onClick={copyLink}>
          <Link2 className="w-3.5 h-3.5" aria-hidden="true" />Copiar link
        </Button>
        {item.sender === 'agent' && (
          <Button size="sm" variant="outline" className="h-8 w-full justify-start gap-2 border-border bg-muted/40 text-xs text-destructive hover:text-destructive" onClick={deleteMessage}>
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Excluir
          </Button>
        )}
      </div>
    </aside>
  );
}
