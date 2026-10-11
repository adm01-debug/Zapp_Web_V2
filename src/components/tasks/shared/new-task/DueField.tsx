import { Label } from '@/components/ui/label';
import { duePresetISO, type DuePreset } from '@/hooks/tasks/workItemPresets';
import { DateTimeRow, PresetChips, type ChipPreset } from './camposDataHora';

/** Atalhos do prazo, na ordem da imagem 04: Hoje, Amanhã, Próx. semana. */
const ATALHOS: Array<{ preset: DuePreset; rotulo: string }> = [
  { preset: 'today', rotulo: 'Hoje' },
  { preset: 'tomorrow', rotulo: 'Amanhã' },
  { preset: 'nextWeek', rotulo: 'Próx. semana' },
];

interface Props {
  /** `due_date` em ISO, ou `null` para "sem prazo". */
  value: string | null;
  onChange: (iso: string | null) => void;
}

/**
 * Etapa 159 (plano, linha 439; imagem 04, seção 3.4) — "Prazo — Até quando
 * concluir" no modal "Nova tarefa" (T36).
 *
 * Data + hora + atalhos Hoje / Amanhã / Próx. semana, com "Limpar" — sem prazo
 * é um estado válido. Sem hora escolhida o prazo vale o dia inteiro (23:59
 * locais), a convenção já usada pelo QuickAdd e pelo painel. Cada atalho é uma
 * função pura de `workItemPresets` (aritmética de calendário, não "+86 400 000"),
 * então este campo e o chip do QuickAdd nunca divergem.
 */
export function DueField({ value, onChange }: Props) {
  const chips: ChipPreset[] = ATALHOS.map((atalho) => ({
    label: atalho.rotulo,
    testId: `new-task-due-${atalho.preset}`,
    iso: duePresetISO(atalho.preset),
  }));

  return (
    <div className="space-y-2">
      <Label htmlFor="new-task-due">Prazo — Até quando concluir</Label>
      <DateTimeRow
        idBase="new-task-due"
        testIdBase="new-task-due"
        value={value}
        onChange={onChange}
        horaPadrao="23:59"
        ariaData="Data do prazo"
        ariaHora="Hora do prazo"
        rotuloLimpar="Limpar prazo"
      />
      <PresetChips ariaLabel="Atalhos de prazo" value={value} onPick={onChange} chips={chips} />
    </div>
  );
}
