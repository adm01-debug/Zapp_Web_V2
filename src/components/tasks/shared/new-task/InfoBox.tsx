import { Info } from 'lucide-react';

/**
 * Etapa 166 (plano, linha 123; imagem 04, seção 3.4) — caixa informativa que
 * separa Prazo de Lembrete no vocabulário do módulo (etapa 175).
 *
 * O texto é FIXO e literal: é a frase aprovada no plano, então não há variação
 * nem interpolação. A cor sai só de tokens (`primary` para a tinta e o ícone),
 * pelo mesmo par de contraste do restante do modal.
 */
export function InfoBox() {
  return (
    <div
      data-testid="nt-info"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-2xs text-muted-foreground"
    >
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <p>
        <strong className="font-medium text-foreground">
          Prazo é a entrega. Lembrete é o aviso.
        </strong>{' '}
        O prazo define quando a tarefa deve ser concluída e o lembrete avisa antes.
      </p>
    </div>
  );
}
