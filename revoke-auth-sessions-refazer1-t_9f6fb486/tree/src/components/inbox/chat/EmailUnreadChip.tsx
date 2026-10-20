import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * U03 — chip "E-mail" com a quantidade de e-mails RECEBIDOS e ainda NÃO LIDOS do
 * contato da conversa aberta (PLANO_EMAIL_ALERTAS_NAO_LIDO_12_ETAPAS_2026-10-07,
 * decisão D03/D04: aparece na barra de abas do topo do chat, só quando count > 0,
 * e o clique abre o módulo de E-mail na conversa do contato — link do C03).
 *
 * Não é uma aba: o painel central não tem seção "e-mail" (`ConversationTab`), então
 * este chip é uma AÇÃO e fica FORA do `role="tablist"` (mesmo princípio do
 * `trailingAction` — a barra não ganha uma 9ª aba). A contagem vem de fora
 * (client-side, via `useContactUnreadEmails`), como o selo da SalesView.
 *
 * Estilo: os mesmos tokens e métricas do chip de Arquivos/Tarefas da barra
 * (`h-9`, `rounded-lg`, `text-muted-foreground`/`hover:bg-muted/60`); a bolinha
 * de contagem reaproveita o formato do badge de aba, em `bg-destructive`
 * (alerta) — nenhuma cor nova. Entrada sutil só com `motion-safe:`.
 */

interface EmailUnreadChipProps {
  /** Nº de e-mails não lidos do contato; o chip só deve ser montado com count > 0. */
  count: number;
  /** Abre o módulo de E-mail na conversa do contato (navigateToView('email-chat', …)). */
  onOpen: () => void;
  className?: string;
}

/** Acima de 99 o número visível vira `99+` (mesma regra do selo da sidebar — D01). */
function textoVisivel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function EmailUnreadChip({ count, onOpen, className }: EmailUnreadChipProps) {
  // O nome acessível leva a contagem REAL (não o "99+"): o leitor de tela anuncia o valor exato.
  const ariaLabel =
    count === 1 ? '1 e-mail não lido' : `${count} e-mails não lidos`;

  return (
    <button
      type="button"
      data-testid="email-unread-chip"
      aria-label={ariaLabel}
      title="Abrir e-mail do contato"
      onClick={onOpen}
      className={cn(
        'relative isolate h-9 px-2 2xl:px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 2xl:gap-2 shrink-0',
        'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200',
        className,
      )}
    >
      <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap hidden 2xl:inline">E-mail</span>
      <span
        data-testid="email-unread-chip-count"
        className="h-5 min-w-[20px] px-1.5 rounded-full text-2xs font-semibold tabular-nums flex items-center justify-center shrink-0 bg-destructive text-destructive-foreground"
      >
        {textoVisivel(count)}
      </span>
    </button>
  );
}
