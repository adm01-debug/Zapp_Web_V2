import { Eye, Share2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { formatMeta } from './fileDisplay';
import { FileThumb } from './FileThumb';
import { FileActionsMenu } from './FileActionsMenu';
import { AudioPlayButton } from './AudioPlayButton';
import { FILE_ACTION_BUTTON, FILE_ACTION_BUTTON_DISABLED } from './fileActionButton';

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
  onRequestDelete: (item: ContactMediaItem) => void;
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
  onRequestDelete,
}: FileCardProps) {
  const mostraRemetente = effectiveColumns <= 4;
  // Etapas 18/25: meta unica vinda do fileDisplay — nenhum renderer formata data ou tamanho.
  const meta = formatMeta(item);

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

        {/* Etapa 26: a previa (imagem, video, audio ou documento) vive no FileThumb; etapa 17:
            object-contain no cartao para os prints de planilha continuarem legiveis. */}
        <button
          type="button"
          aria-label={`Visualizar ${item.displayName}`}
          className="block w-full aspect-[16/10] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={acao ?? onPreview}
        >
          <FileThumb item={item} size="card" />
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
        {/* A02: play/pause do áudio direto no cartão, só para itens de áudio. */}
        {item.type === 'audio' && <AudioPlayButton item={item} />}
        <button
          type="button"
          aria-label="Visualizar"
          className={FILE_ACTION_BUTTON}
          onClick={onPreview}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Encaminhar"
          title="Disponível em breve"
          disabled
          className={FILE_ACTION_BUTTON_DISABLED}
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <FileActionsMenu item={item} onRequestDelete={onRequestDelete} />
      </div>
    </article>
  );
}
