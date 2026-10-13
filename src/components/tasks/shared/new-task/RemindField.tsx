/**
 * Etapa 160 — campo "Lembrete — Quando você quer ser avisado" do modal Nova tarefa.
 *
 * Plano, seção 3.4 (imagem 04), linha 119:
 *   | "Lembrete — Quando você quer ser avisado": data, hora e Em 1h / Amanhã, 9h /
 *     Próx. seg., 9h | FALTA | 160–161 |
 *
 * Apresentação pura: o pai guarda o `value` (ISO de `remind_at`) e recebe
 * `onChange(null)` quando o lembrete é limpo. Nada de conta nova aqui — os
 * atalhos usam `remindPresetISO` (etapa 161) e a composição data+hora passa por
 * `comporLocal`/`diaLocal`/`horaLocal`, o mesmo contrato do prazo e do painel
 * de detalhes (fuso local, sem deslocamento de UTC).
 *
 * Só tokens do sistema; alvos de 40 px (`h-10`); foco visível; sem rolagem.
 */
import { Bell, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RemindPreset } from '@/hooks/tasks/workItemPresets';
import { remindPresetISO } from '@/hooks/tasks/workItemPresets';
import { comporLocal, diaLocal, horaLocal } from '../localDateTime';

export interface RemindFieldProps {
  /** ISO de `remind_at`; `null` = sem lembrete. */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** Relógio dos atalhos; injetável nos testes. Padrão: agora. */
  now?: Date;
}

/** Hora assumida quando só o dia é escolhido — a mesma do atalho "Amanhã, 9h". */
const HORA_PADRAO = '09:00';

const ATALHOS: ReadonlyArray<{ preset: RemindPreset; label: string; testId: string }> = [
  { preset: 'in1h', label: 'Em 1h', testId: 'new-task-lembrete-em-1h' },
  { preset: 'tomorrow9', label: 'Amanhã, 9h', testId: 'new-task-lembrete-amanha-9h' },
  { preset: 'nextMonday9', label: 'Próx. seg., 9h', testId: 'new-task-lembrete-prox-seg-9h' },
];

const CLASSE_ATALHO =
  'h-10 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground ' +
  'transition-colors hover:bg-secondary hover:text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function RemindField({ value, onChange, now = new Date() }: RemindFieldProps) {
  return (
    <div data-testid="new-task-lembrete" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor="new-task-lembrete-data" className="text-xs font-medium text-foreground">
          Lembrete
        </Label>
        <span className="text-2xs text-muted-foreground">Quando você quer ser avisado</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Bell
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="new-task-lembrete-data"
            type="date"
            data-testid="new-task-lembrete-data"
            aria-label="Data do lembrete"
            value={value ? diaLocal(value) : ''}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? comporLocal(e.target.value, value ? horaLocal(value) : HORA_PADRAO)
                  : null,
              )
            }
            className="h-10 bg-input pl-9"
          />
        </div>

        <Input
          type="time"
          data-testid="new-task-lembrete-hora"
          aria-label="Hora do lembrete"
          value={value ? horaLocal(value) : ''}
          onChange={(e) =>
            onChange(
              comporLocal(value ? diaLocal(value) : diaLocal(now.toISOString()), e.target.value),
            )
          }
          className="h-10 w-28 shrink-0 bg-input"
        />

        <button
          type="button"
          data-testid="new-task-lembrete-limpar"
          aria-label="Limpar lembrete"
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

      <div role="group" aria-label="Atalhos de lembrete" className="flex flex-wrap items-center gap-1.5">
        {ATALHOS.map(({ preset, label, testId }) => (
          <button
            key={preset}
            type="button"
            data-testid={testId}
            onClick={() => onChange(remindPresetISO(preset, now))}
            className={CLASSE_ATALHO}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
