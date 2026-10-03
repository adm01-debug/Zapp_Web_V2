import { useState } from 'react';
import { Eye, File, Image, Lock, MoreVertical, Play, Share2, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatSmartDate } from '@/lib/formatters';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { formatSize, TYPE_LABEL } from './fileDisplay';

interface FileCardProps {
  item: ContactMediaItem;
  contactName: string;
  selected: boolean;
  /** Etapa 20: no modo seleção o cartão alterna a seleção em vez de abrir detalhes/prévia. */
  selectionMode?: boolean;
  selectionChecked?: boolean;
  /** Etapa 18: a linha do remetente só cabe em até 4 colunas; acima disso fica nos detalhes. */
  effectiveColumns?: number;
  onSelect: () => void;
  onToggleSelection?: () => void;
  onPreview: () => void;
  onForward: () => void;
  onDeleted: () => void;
}

export function FileCard({
  item,
  contactName,
  selected,
  selectionMode = false,
  selectionChecked = false,
  effectiveColumns = 4,
  onSelect,
  onToggleSelection,
  onPreview,
  onForward,
  onDeleted,
}: FileCardProps) {
  const [hasError, setHasError] = useState(false);
  // Etapa 10: a consulta já assina em lote, um request por bucket. O hook individual
  // continua como fallback para item sem URL assinada (objeto público ou lote que falhou).
  const { url: resolvedUrl, refresh } = useResolvedStorageUrl(item.signedUrl ? '' : item.url);
  const displayUrl = item.signedUrl ?? resolvedUrl;
  const size = formatSize(item.size);
  const mostraRemetente = effectiveColumns <= 4;
  // Etapa 18: "Imagem · 1,2 MB · 24/09 17:54" num só parágrafo; tamanho ausente sai fora,
  // nunca "0 KB".
  const meta = [TYPE_LABEL[item.type], size, formatSmartDate(item.created_at)].filter(Boolean).join(' · ');

  const deleteMessage = async () => {
    if (!window.confirm('Apagar esta mensagem para você?')) return;
    const { supabase } = await import('@/integrations/supabase/client');
    const { error } = await supabase.from('messages').update({ is_deleted: true, content: '[Mensagem apagada]' }).eq('id', item.id);
    if (error) { toast.error('Erro ao apagar mensagem'); return; }
    toast.success('Mensagem removida');
    onDeleted();
  };

  const acao = selectionMode ? onToggleSelection : undefined;

  return (
    <article
      data-testid={`files-item-${item.id}`}
      className={cn(
        'rounded-xl border bg-card overflow-hidden flex flex-col',
        selected || selectionChecked ? 'border-border ring-2 ring-primary' : 'border-border',
      )}
    >
      <div className="relative">
        {selectionMode && (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-background/80 p-0.5">
            <Checkbox
              checked={selectionChecked}
              aria-label={`Selecionar ${item.displayName}`}
              onCheckedChange={() => onToggleSelection?.()}
            />
          </span>
        )}

        {/* Etapa 17: object-contain — os prints de planilha têm de continuar legíveis. */}
        <button
          type="button"
          aria-label={`Visualizar ${item.displayName}`}
          className="block w-full aspect-[16/10] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={acao ?? onPreview}
        >
          {item.type === 'image' && !hasError && displayUrl ? (
            <img
              src={displayUrl}
              alt={item.displayName}
              className="w-full h-full object-contain"
              onError={() => { setHasError(true); void refresh(); }}
            />
          ) : item.type === 'video' || item.type === 'audio' ? (
            <span className="w-full h-full flex items-center justify-center">
              <span className="w-10 h-10 rounded-full bg-background/60 flex items-center justify-center"><Play className="w-5 h-5" /></span>
            </span>
          ) : item.type === 'document' ? (
            <span className="w-full h-full flex items-center justify-center"><File className="w-8 h-8 text-muted-foreground" /></span>
          ) : (
            <span className="w-full h-full flex items-center justify-center"><Image className="w-8 h-8 text-muted-foreground" /></span>
          )}
        </button>
      </div>

      {/* Etapa 18: nome legível (com o técnico no title), meta num só parágrafo e, até 4
          colunas, o remetente. */}
      <div className="p-2.5 flex flex-col gap-1">
        <button
          type="button"
          title={item.filename}
          onClick={acao ?? onSelect}
          className="rounded text-left text-[13px] font-semibold leading-tight truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.displayName}
        </button>
        <p className="text-xs text-muted-foreground truncate">{meta}</p>
        {mostraRemetente && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <span className="w-4 h-4 shrink-0 rounded-full bg-muted-foreground/20 inline-flex items-center justify-center text-[9px] font-semibold">
              {item.senderLabel === 'Atendente' ? 'V' : (contactName[0] ?? '?').toUpperCase()}
            </span>
            {item.senderLabel ?? contactName}
          </p>
        )}
      </div>

      {/* Etapa 19: Visualizar, Encaminhar (desabilitado até a Fase 7) e Mais ações.
          Sem "Copiar link"; "Baixar" vive no menu, desabilitado e com o motivo à vista. */}
      <div className="mt-auto flex items-center justify-end gap-1 px-2 pb-2">
        <button
          type="button"
          aria-label="Visualizar"
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onPreview}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Encaminhar"
          title="Disponível em breve"
          disabled
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/50 cursor-not-allowed"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mais ações"
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled title="Bloqueado pela política de segurança">
              <Lock className="w-4 h-4 mr-2" />
              Baixar · Bloqueado pela política de segurança
            </DropdownMenuItem>
            {item.sender === 'agent' && (
              <DropdownMenuItem onClick={deleteMessage} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />Excluir mensagem
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
