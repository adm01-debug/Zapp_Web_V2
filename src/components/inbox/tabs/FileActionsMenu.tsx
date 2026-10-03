import { Lock, MoreVertical, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * Menu "Mais acoes" compartilhado pelos tres modos (etapas 19, 21 e 23). Politica D2 fechada:
 * "Baixar" aparece DESABILITADO com o motivo a vista (informa antes de frustrar); "Copiar link"
 * nao existe; "Excluir mensagem" so aparece para mensagem do atendente.
 */
export function FileActionsMenu({ item, onDeleted }: { item: ContactMediaItem; onDeleted: () => void }) {
  const deleteMessage = async () => {
    if (!window.confirm('Apagar esta mensagem para você?')) return;
    const { supabase } = await import('@/integrations/supabase/client');
    const { error } = await supabase.from('messages').update({ is_deleted: true, content: '[Mensagem apagada]' }).eq('id', item.id);
    if (error) { toast.error('Erro ao apagar mensagem'); return; }
    toast.success('Mensagem removida');
    onDeleted();
  };

  return (
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
  );
}
