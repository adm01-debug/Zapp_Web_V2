/**
 * Etapa 159 — campo "Prazo — Até quando concluir" do modal Nova tarefa.
 *
 * Plano, seção 3.4 (imagem 04), linha 118:
 *   | "Prazo — Até quando concluir": data, hora e Hoje / Amanhã / Próx. semana | FALTA | 159 |
 *
 * Apresentação pura: o pai guarda o `value` (ISO de `due_date`) e recebe
 * `onChange(null)` quando o prazo é limpo. Nada de conta nova aqui — os atalhos
 * usam `duePresetISO` (etapa 161) e a composição data+hora passa por
 * `comporLocal`/`diaLocal`/`horaLocal`, o mesmo contrato de `QuickAdd` e do
 * painel de detalhes (fuso local, sem deslocamento de UTC).
 *
 * Só tokens do sistema; alvos de 40 px (`h-10`); foco visível; sem rolagem.
 */
import { CalendarIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DuePreset } from '@/hooks/tasks/workItemPresets';
import { duePresetISO } from '@/hooks/tasks/workItemPresets';
import { comporLocal, diaLocal, horaLocal } from '../localDateTime';

export interface PrazoFieldProps {
  /** ISO de `due_date`; `null` = sem prazo. */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** Relógio dos atalhos; injetável nos testes. Padrão: agora. */
  now?: Date;
}

const ATALHOS: ReadonlyArray<{ preset: DuePreset; label: string; testId: string }> = [
  { preset: 'today', label: 'Hoje', testId: 'new-task-prazo-hoje' },
  { preset: 'tomorrow', label: 'Amanhã', testId: 'new-task-prazo-amanha' },
  { preset: 'nextWeek', label: 'Próx. semana', testId: 'new-task-prazo-prox-semana' },
];

const CLASSE_ATALHO =
  'h-10 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground ' +
  'transition-colors hover:bg-secondary hover:text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function PrazoField({ value, onChange, now = new Date() }: PrazoFieldProps) {
  return (
    <div data-testid="new-task-prazo" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor="new-task-prazo-data" className="text-xs font-medium text-foreground">
          Prazo
        </Label>
        <span className="text-2xs text-muted-foreground">Até quando concluir</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <CalendarIcon
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="new-task-prazo-data"
            type="date"
            data-testid="new-task-prazo-data"
            aria-label="Data do prazo"
            value={value ? diaLocal(value) : ''}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? comporLocal(e.target.value, value ? horaLocal(value) : '23:59')
                  : null,
              )
            }
            className="h-10 bg-input pl-9"
          />
        </div>

        <Input
          type="time"
          data-testid="new-task-prazo-hora"
          aria-label="Hora do prazo"
          value={value ? horaLocal(value) : ''}
          onChange={(e) =>
            onChange(comporLocal(value ? diaLocal(value) : diaLocal(now.toISOString()), e.target.value))
          }
          className="h-10 w-28 shrink-0 bg-input"
        />

        <button
          type="button"
          data-testid="new-task-prazo-limpar"
          aria-label="Limpar prazo"
          disabled={!value}
          onClick={() => onChange(null)}
          className={
            'h-10 w-10 shrink-0 rounded-md text-muted-foreground transition-colors ' +
            'hover:bg-secondary hover:text-foreground focus-visible:outline-none ' +
            'focus-visible:ring-2 focus-visible:ring-ring ' +
            'disabled:pointer-events-none disabled:opacity-40'
          }
        >
          <X aria-hidden className="mx-auto h-4 w-4" />
        </button>
      </div>

      <div role="group" aria-label="Atalhos de prazo" className="flex flex-wrap items-center gap-1.5">
        {ATALHOS.map(({ preset, label, testId }) => (
          <button
            key={preset}
            type="button"
            data-testid={testId}
            onClick={() => onChange(duePresetISO(preset, now))}
            className={CLASSE_ATALHO}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
