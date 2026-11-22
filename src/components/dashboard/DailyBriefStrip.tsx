/**
 * Fase 2 do assistente pessoal — "Resumo do dia".
 *
 * Ao entrar no sistema a pessoa vê o que tem para hoje, em uma faixa:
 *  1. compromissos de hoje (lembretes marcados para hoje);
 *  2. conversas paradas (cliente mandou a última mensagem e ninguém respondeu);
 *  3. propostas sem resposta (negócios abertos aguardando o cliente).
 *
 * Valores nulos = leitura falhou, exibidos como "— (não verificado)".
 */
import { CalendarClock, MessageSquare, FileText, AlertTriangle, Sun } from 'lucide-react';
import { useDailyBrief } from '@/hooks/assistant/useDailyBrief';

interface Cell {
  key: string;
  icon: typeof Sun;
  label: string;
  value: number | null;
}

export function DailyBriefStrip() {
  const { brief, isLoading, refetch } = useDailyBrief();

  if (isLoading) {
    return (
      <div
        className="h-16 rounded-xl border border-border bg-card motion-safe:animate-pulse"
        role="status"
        aria-label="Carregando resumo do dia"
        data-testid="daily-brief-loading"
      />
    );
  }

  const failed = new Set(brief?.failures ?? []);
  const cells: Cell[] = [
    { key: 'commitments', icon: CalendarClock, label: 'Compromissos hoje', value: failed.has('compromissos') ? null : (brief?.todayCommitments ?? 0) },
    { key: 'stalled', icon: MessageSquare, label: 'Conversas paradas', value: failed.has('conversas paradas') ? null : (brief?.stalledConversations ?? 0) },
    { key: 'proposals', icon: FileText, label: 'Propostas sem resposta', value: failed.has('propostas') ? null : (brief?.unreadProposals ?? 0) },
  ];

  return (
    <section
      className="rounded-xl border border-border bg-card p-3"
      aria-label="Resumo do dia"
      data-testid="daily-brief"
    >
      <header className="flex items-center gap-2 mb-2">
        <span className="w-7 h-7 rounded-lg bg-kpi-yellow text-kpi-yellow-fg flex items-center justify-center shrink-0">
          <Sun className="w-4 h-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold">Resumo do dia</h2>
        {failed.size > 0 && (
          <button
            type="button"
            onClick={() => { void refetch(); }}
            className="ml-auto text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            data-testid="daily-brief-retry"
          >
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            Recarregar
          </button>
        )}
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {cells.map(({ key, icon: Icon, label, value }) => (
          <div key={key} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-2" data-testid={`daily-brief-${key}`}>
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-none">
                {value === null ? '—' : value}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {value === null ? `${label} (não verificado)` : label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}