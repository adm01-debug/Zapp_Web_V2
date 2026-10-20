import { Eye, Share2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { resolveSenderIdentity, type SenderProfileMap } from '@/lib/fileSenderIdentity';
import { formatMeta } from './fileDisplay';
import { FileThumb } from './FileThumb';
import { FileActionsMenu } from './FileActionsMenu';
import { AudioPlayButton } from './AudioPlayButton';
import { SenderAvatar } from './SenderAvatar';
import { FILE_ACTION_BUTTON, FILE_ACTION_BUTTON_DISABLED } from './fileActionButton';

/**
 * Lista da aba Arquivos (etapas 21-22). Cada linha segue o `ContactListItem` (h-16, px-3,
 * rounded-xl, card) e a densidade e decidida pelo CONTENINER, nao pela viewport: abaixo de
 * 640 px a meta desce para a segunda linha, o remetente some e sobram "Visualizar" e "Mais
 * acoes". A aba nunca troca a preferencia de modo sozinha.
 *
 * R06 (S47): na linha larga o remetente vira foto + nome (`SenderAvatar`), resolvido do lote
 * de perfis que o `FilesTab` repassa por props (D04) — a Lista nao consulta o banco. A regra
 * de quem enviou e a mesma do cartao (`resolveSenderIdentity`: voce, contato, atendente,
 * "Equipe" sem `agent_id`).
 */

interface FilesListViewProps {
  items: ContactMediaItem[];
  contactName: string;
  selectionMode: boolean;
  selectedIds: Set<string>;
  /** Largura medida do contêiner da aba; `null` antes da primeira medida (assume larga). */
  containerWidth: number | null;
  /** R06/D04: perfis dos atendentes resolvidos em LOTE uma unica vez no `FilesTab`. */
  senderProfiles?: SenderProfileMap;
  /** R06/D01: `profiles.id` do usuário logado — decide o rotulo "Voce". */
  currentUserId?: string | null;
  onSelect: (item: ContactMediaItem) => void;
  onToggleSelection: (id: string) => void;
  onPreview: (item: ContactMediaItem) => void;
  onRequestDelete: (item: ContactMediaItem) => void;
}

export function FilesListView({
  items,
  contactName,
  selectionMode,
  selectedIds,
  containerWidth,
  senderProfiles,
  currentUserId = null,
  onSelect,
  onToggleSelection,
  onPreview,
  onRequestDelete,
}: FilesListViewProps) {
  const isNarrow = containerWidth !== null && containerWidth < 640;

  return (
    <div className="flex flex-col gap-1" data-testid="files-list">
      {/* gap-1 (4 px): 10 linhas de h-16 = 676 px ≤ 700 px do aceite da etapa 21. */}
      {items.map((item) => {
        const checked = selectedIds.has(item.id);
        const primary = selectionMode ? () => onToggleSelection(item.id) : () => onSelect(item);
        const meta = formatMeta(item);
        const remetente = resolveSenderIdentity({
          item,
          currentUserId,
          contact: { name: contactName },
          profiles: senderProfiles,
        });

        return (
          <div
            key={item.id}
            data-testid={`files-item-${item.id}`}
            className={cn(
              'h-16 px-3 rounded-xl border border-border/70 bg-card flex items-center gap-3',
              checked && 'border-primary/60 bg-primary/5',
            )}
          >
            {selectionMode && (
              <span className="shrink-0">
                <Checkbox
                  checked={checked}
                  aria-label={`Selecionar ${item.displayName}`}
                  onCheckedChange={() => onToggleSelection(item.id)}
                />
              </span>
            )}

            <button
              type="button"
              aria-label={`Visualizar ${item.displayName}`}
              className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={selectionMode ? () => onToggleSelection(item.id) : () => onPreview(item)}
            >
              <FileThumb item={item} size="row" />
            </button>

            <div className="min-w-0 flex-1">
              {isNarrow ? (
                <div className="flex flex-col">
                  <button
                    type="button"
                    title={item.filename}
                    onClick={primary}
                    className="rounded text-left text-sm font-semibold leading-tight truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.displayName}
                  </button>
                  <p className="text-xs text-muted-foreground truncate">{meta}</p>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    title={item.filename}
                    onClick={primary}
                    className="rounded text-left text-sm font-semibold truncate text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.displayName}
                  </button>
                  <p className="text-xs text-muted-foreground truncate">{meta}</p>
                  {/* R06 (S47): quem enviou continua no fim da linha — agora com a foto. */}
                  <span className="ml-auto shrink-0">
                    <SenderAvatar
                      name={remetente.name}
                      avatarUrl={remetente.avatarUrl}
                      colorKey={item.agentId ?? undefined}
                      showName
                    />
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* A04: play/pause do áudio na linha, só para itens de áudio. */}
              {item.type === 'audio' && <AudioPlayButton item={item} />}
              <button type="button" aria-label="Visualizar" className={FILE_ACTION_BUTTON} onClick={() => onPreview(item)}>
                <Eye className="w-3.5 h-3.5" />
              </button>
              {!isNarrow && (
                <button type="button" aria-label="Encaminhar" title="Disponível em breve" disabled className={FILE_ACTION_BUTTON_DISABLED}>
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              )}
              <FileActionsMenu item={item} onRequestDelete={onRequestDelete} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
