/**
 * Etapa 164 — bloco "Destino da tarefa" do modal Nova tarefa.
 *
 * Plano, seção 3.4 (imagem 04), linha 121:
 *   | "A tarefa será criada na Caixa de entrada." | FALTA | 164 |
 * e decisão D10 (seção 6): o destino da tarefa nova é SEMPRE a Caixa de entrada.
 *
 * Não é um seletor: é um aviso fixo, só leitura, com ícone decorativo. Não tem
 * estado, não emite evento e não muda com o preenchimento do formulário — por
 * isso não recebe prop nenhuma. Só tokens do sistema: o texto herda o par de
 * contraste `text-muted-foreground` (claro `221 10% 40%`, escuro `215 20% 75%`
 * em `src/styles/tokens.css`), o mesmo usado no restante do modal.
 */
import { Inbox } from 'lucide-react';

export function DestinationBlock() {
  return (
    <p
      data-testid="new-task-destination"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Inbox aria-hidden className="h-4 w-4 shrink-0" />
      <span>A tarefa será criada na Caixa de entrada.</span>
    </p>
  );
}
