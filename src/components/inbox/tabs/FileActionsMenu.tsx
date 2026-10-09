import { Lock, MoreVertical, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { FILE_ACTION_BUTTON } from './fileActionButton';

/**
 * Menu "Mais acoes" compartilhado pelos tres modos (etapas 19, 21 e 23). Politica D2 fechada:
 * "Baixar" aparece DESABILITADO com o motivo a vista (informa antes de frustrar); "Copiar link"
 * nao existe; "Excluir mensagem" so aparece para mensagem do atendente.
 *
 * Etapa 35: o item "Excluir mensagem" nao apaga mais sozinho (nem com `window.confirm`): ele
 * PEDE a exclusao ao `FilesTab`, que abre o `AlertDialog` e chama o `useFilesActions`
 * centralizado. Este componente ficou sem efeito colateral.
 */
export function FileActionsMenu({
  item,
  onRequestDelete,
}: {
  item: ContactMediaItem;
  onRequestDelete: (item: ContactMediaItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Mais ações"
          className={FILE_ACTION_BUTTON}
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
          <DropdownMenuItem onClick={() => onRequestDelete(item)} className="text-destructive">
            <Trash2 className="w-4 h-4 mr-2" />Excluir mensagem
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
