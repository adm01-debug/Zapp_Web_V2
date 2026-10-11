import { Inbox } from 'lucide-react';

/**
 * Etapa 164 (plano, linha 443; imagem 04, seção 3.4) — o destino escrito do
 * modal "Nova tarefa".
 *
 * D10: o destino é FIXO na Caixa de entrada (`status: 'todo'`), por isso não há
 * campo de coluna/estado — só a frase dizendo onde a tarefa nasce. Sendo texto
 * e não controle, nada aqui pode virar seletor por engano.
 */
export function DestinationNote() {
  return (
    <p
      data-testid="new-task-destination"
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <Inbox className="h-3.5 w-3.5 shrink-0" aria-hidden />
      A tarefa será criada na Caixa de entrada.
    </p>
  );
}
