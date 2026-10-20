import { useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  remindAt: string;
  notifiedAt?: string | null;
  /** Adiar: 15 min · 1 hora · Amanhã 9h (etapa 31). */
  onSnooze?: (minutes: number | 'tomorrow9') => void;
  /** "Remover" — limpa o alarme (`setReminder(null)`). */
  onClearReminder?: () => void;
  /** "Escolher…" — abre o Sheet no campo alarme. */
  onOpenReminder?: () => void;
}

const OPCOES_ADIAR: Array<{ label: string; minutes: number | 'tomorrow9' }> = [
  { label: '15 min', minutes: 15 },
  { label: '1 hora', minutes: 60 },
  { label: 'Amanhã 9h', minutes: 'tomorrow9' },
];

/**
 * Etapa 31: o chip deixa de ser só exibição e vira popover de adiar. Vencido e
 * ainda não avisado → `BellRing text-destructive`. `stopPropagation` no gatilho
 * para o clique não abrir o card.
 */
export function RemindChip({ remindAt, notifiedAt, onSnooze, onClearReminder, onOpenReminder }: Props) {
  const [open, setOpen] = useState(false);
  const due  = new Date(remindAt) <= new Date();
  const Icon = due ? BellRing : Bell;
  const time = new Date(remindAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day  = new Date(remindAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const acao = (fn?: () => void) => {
    fn?.();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="remind-chip"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1 text-xs font-medium ${due && !notifiedAt ? 'text-destructive' : 'text-muted-foreground'}`}
          title={`Lembrete: ${day} ${time}`}
        >
          <Icon className="h-3 w-3" />
          {time}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1" onClick={(e) => e.stopPropagation()}>
        {OPCOES_ADIAR.map(o => (
          <button
            key={o.label}
            type="button"
            onClick={() => acao(() => onSnooze?.(o.minutes))}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            {o.label}
          </button>
        ))}
        {remindAt && (
          <button
            type="button"
            onClick={() => acao(onClearReminder)}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
          >
            Remover
          </button>
        )}
        <button
          type="button"
          onClick={() => acao(onOpenReminder)}
          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          Escolher…
        </button>
      </PopoverContent>
    </Popover>
  );
}
