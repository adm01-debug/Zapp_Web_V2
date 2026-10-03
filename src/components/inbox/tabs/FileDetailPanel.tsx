import { useState } from 'react';
import { X, Image, File, Play, Share2, Lock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { TYPE_LABEL, formatFileDate, formatSize } from './fileDisplay';

/**
 * Detalhes de um arquivo (etapa 31). O MESMO conteudo serve aos dois modos — lado a lado
 * (260 px, so com o contêiner >= 1100 px) e `Sheet` sobreposto a direita (abaixo disso).
 *
 * Nada aqui substitui o painel cadastral do contato: o `Sheet` e um overlay a direita e o
 * painel lado a lado entra na MESMA linha da area de arquivos, nunca no lugar do contato.
 * A exclusao foi retirada daqui (etapa 35): o botao so PEDE a exclusao (`onRequestDelete`),
 * quem apaga e o `useFilesActions.deleteMessage` centralizado no `FilesTab`.
 */

interface FileDetailContentProps {
  item: ContactMediaItem;
  contactName: string;
  onClose: () => void;
  onRequestDelete: (item: ContactMediaItem) => void;
}

export function FileDetailContent({ item, contactName, onClose, onRequestDelete }: FileDetailContentProps) {
  const [hasError, setHasError] = useState(false);
  // Etapa 10: a consulta ja assina em lote, um request por bucket. O hook individual
  // continua como fallback para item sem URL assinada (objeto publico ou lote que falhou).
  const { url: resolvedUrl, refresh } = useResolvedStorageUrl(item.signedUrl ? '' : item.url);
  const displayUrl = item.signedUrl ?? resolvedUrl;
  const size = formatSize(item.size);
  // Etapa 31: nome tecnico so quando agrega — quando difere do displayName legivel.
  const technicalName = item.filename && item.filename !== item.displayName ? item.filename : null;

  return (
    <div data-testid="file-detail-panel" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Detalhes</p>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden">
        {item.type === 'image' && !hasError && displayUrl ? (
          <img src={displayUrl} alt={item.displayName} className="w-full h-full object-cover" onError={() => { setHasError(true); void refresh(); }} />
        ) : item.type === 'video' || item.type === 'audio' ? (
          <Play className="w-8 h-8 text-muted-foreground" />
        ) : item.type === 'document' ? (
          <File className="w-8 h-8 text-muted-foreground" />
        ) : (
          <Image className="w-8 h-8 text-muted-foreground" />
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold truncate" title={item.filename}>{item.displayName}</p>
        {technicalName && (
          <p className="text-2xs text-muted-foreground truncate" title={technicalName}>Nome do arquivo: {technicalName}</p>
        )}
        <p className="text-xs text-muted-foreground">{TYPE_LABEL[item.type]}</p>
        <p className="text-xs text-muted-foreground">{size ? `Tamanho: ${size}` : 'Tamanho: não informado'}</p>
        <p className="text-xs text-muted-foreground">Data: {formatFileDate(item.created_at)}</p>
        <p className="text-xs text-muted-foreground">Enviado por {item.senderLabel ?? (item.sender === 'agent' ? 'Atendente' : contactName)}</p>
      </div>

      {item.caption && <p className="text-xs bg-muted/40 rounded-lg p-2">{item.caption}</p>}

      {/* Etapa 19: sem "Copiar link"; o download aparece bloqueado com o motivo a vista. */}
      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="outline" className="h-9" disabled title="Bloqueado pela política de segurança">
          <Lock className="w-3.5 h-3.5 mr-1.5" />Baixar · bloqueado pela política
        </Button>
        <Button size="sm" variant="outline" className="h-9" disabled title="Disponível em breve">
          <Share2 className="w-3.5 h-3.5 mr-1.5" />Encaminhar
        </Button>
        {item.sender === 'agent' && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-destructive hover:text-destructive"
            onClick={() => onRequestDelete(item)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />Excluir
          </Button>
        )}
      </div>
    </div>
  );
}

/** Casca lado a lado (260 px) — etapa 31: so renderizada com o contêiner >= 1100 px. */
export function FileDetailPanel(props: FileDetailContentProps) {
  return (
    <div data-testid="file-detail-panel-inline" className="w-[260px] shrink-0 rounded-xl border border-border bg-card p-3">
      <FileDetailContent {...props} />
    </div>
  );
}
