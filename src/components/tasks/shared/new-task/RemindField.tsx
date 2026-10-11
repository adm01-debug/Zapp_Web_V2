import { Label } from '@/components/ui/label';
import { remindPresetISO, type RemindPreset } from '@/hooks/tasks/workItemPresets';
import { DateTimeRow, PresetChips, type ChipPreset } from './camposDataHora';

/** Atalhos do lembrete, na ordem da imagem 04: Em 1h, Amanhã 9h, Próx. seg. 9h. */
const ATALHOS: Array<{ preset: RemindPreset; rotulo: string }> = [
  { preset: 'in1h', rotulo: 'Em 1h' },
  { preset: 'tomorrow9', rotulo: 'Amanhã, 9h' },
  { preset: 'nextMonday9', rotulo: 'Próx. seg., 9h' },
];

interface Props {
  /** `remind_at` em ISO, ou `null` para "sem lembrete". */
  value: string | null;
  onChange: (iso: string | null) => void;
}

/**
 * Etapa 160 (plano, linha 440; imagem 04, seção 3.4) — "Lembrete — Quando você
 * quer ser avisado" no modal "Nova tarefa" (T36).
 *
 * Data + hora + atalhos Em 1h / Amanhã 9h / Próx. seg. 9h, com "Limpar" — sem
 * lembrete é um estado válido. Só o dia escolhido grava 09:00 locais (o horário
 * de trabalho), diferente do prazo, que grava 23:59. A coerência com o prazo
 * (etapa 163) é conferida FORA daqui, no `CoherenceNotice`.
 */
export function RemindField({ value, onChange }: Props) {
  const chips: ChipPreset[] = ATALHOS.map((atalho) => ({
    label: atalho.rotulo,
    testId: `new-task-remind-${atalho.preset}`,
    iso: remindPresetISO(atalho.preset),
  }));

  return (
    <div className="space-y-2">
      <Label htmlFor="new-task-remind">Lembrete — Quando você quer ser avisado</Label>
      <DateTimeRow
        idBase="new-task-remind"
        testIdBase="new-task-remind"
        value={value}
        onChange={onChange}
        horaPadrao="09:00"
        ariaData="Data do lembrete"
        ariaHora="Hora do lembrete"
        rotuloLimpar="Limpar lembrete"
      />
      <PresetChips ariaLabel="Atalhos de lembrete" value={value} onPick={onChange} chips={chips} />
    </div>
  );
}
