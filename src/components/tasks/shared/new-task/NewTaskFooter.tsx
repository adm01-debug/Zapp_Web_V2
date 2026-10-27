import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Desabilita o botão enquanto o INSERT está em voo (evita duplo toque). */
  enviando: boolean;
  /** `true` quando o título tem conteúdo — "+ Criar tarefa" fica desabilitado sem ele. */
  podeCriar: boolean;
  onCancelar: () => void;
  onCriar: () => void;
}

/**
 * Etapa 167 (plano, linha 124; imagem 04, seção 3.4) — rodapé do modal.
 *
 * A dica "Enter para criar" é a legenda do atalho: `Enter` no título e
 * `Ctrl+Enter` (ou `Cmd+Enter`) em qualquer campo criam a tarefa (a tecla é
 * tratada no modal, dono do rascunho). "Esc cancela" não tem legenda aqui
 * porque é o `Esc` do próprio diálogo, que já volta pelo `closeModal`.
 *
 * Etapa 169: em telas estreitas (o caso de 360px) o rodapé fica FIXO no pé do
 * modal enquanto o formulário rola, para "Criar tarefa" não sair da vista.
 */
export function NewTaskFooter({ enviando, podeCriar, onCancelar, onCriar }: Props) {
  return (
    <div
      data-testid="nt-rodape"
      className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-6 max-sm:-mb-6 max-sm:bg-background max-sm:px-6 max-sm:pb-6"
    >
      <p data-testid="nt-dica" className="text-2xs text-muted-foreground">
        <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-sans text-2xs">Enter</kbd>{' '}
        para criar
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="button" onClick={onCriar} disabled={enviando || !podeCriar}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Criar tarefa
        </Button>
      </div>
    </div>
  );
}
