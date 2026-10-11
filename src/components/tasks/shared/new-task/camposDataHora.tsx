import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { comporLocal, diaLocal, horaLocal, mesmoInstante } from '../localDateTime';

/**
 * Tijolos comuns dos campos Prazo (etapa 159) e Lembrete (etapa 160): a linha
 * de `<input>` de data/hora e a fileira de atalhos. Ficam num arquivo só (em vez
 * de duas cópias quase iguais) porque as duas telas têm o MESMO contrato: valor
 * em ISO, `yyyy-MM-dd` + `HH:mm` locais na tela e um botão de limpar.
 *
 * A conversão passa sempre por `localDateTime`, a regra única do módulo — nada
 * de montar string de data à mão.
 */

/** `yyyy-MM-dd`/`HH:mm` locais de um ISO — exatamente o que os `<input>` esperam. */
function campos(iso: string | null): { dia: string; hora: string } {
  if (!iso) return { dia: '', hora: '' };
  return { dia: diaLocal(iso), hora: horaLocal(iso) };
}

/** Zera os segundos de um ISO (o campo trabalha em minutos, nunca em segundos). */
function normalizar(iso: string): string {
  return comporLocal(diaLocal(iso), horaLocal(iso));
}

interface RowProps {
  /** `id` do `<input>` de data, o alvo do `<Label htmlFor>`. */
  idBase: string;
  testIdBase: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  /** Hora gravada quando só o dia foi escolhido (convenção de cada campo). */
  horaPadrao: string;
  ariaData: string;
  ariaHora: string;
  rotuloLimpar: string;
}

/** Linha de data + hora + limpar, com alvos de 40 px. */
export function DateTimeRow({
  idBase,
  testIdBase,
  value,
  onChange,
  horaPadrao,
  ariaData,
  ariaHora,
  rotuloLimpar,
}: RowProps) {
  const { dia, hora } = campos(value);

  const gravar = (novoDia: string, novaHora: string) => {
    if (!novoDia) {
      onChange(null);
      return;
    }
    onChange(comporLocal(novoDia, novaHora || horaPadrao));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        id={idBase}
        type="date"
        value={dia}
        aria-label={ariaData}
        data-testid={`${testIdBase}-date`}
        className="h-10 w-[150px]"
        onChange={(e) => gravar(e.target.value, hora)}
      />
      <Input
        type="time"
        value={hora}
        // Sem dia não há quando: a hora fica travada até o dia ser escolhido.
        disabled={!dia}
        aria-label={ariaHora}
        data-testid={`${testIdBase}-time`}
        className="h-10 w-[110px]"
        onChange={(e) => gravar(dia, e.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={rotuloLimpar}
          data-testid={`${testIdBase}-clear`}
          className="inline-flex h-10 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Limpar
        </button>
      )}
    </div>
  );
}

/** Um atalho: rótulo na tela, `data-testid` e o ISO que ele grava. */
export interface ChipPreset {
  label: string;
  testId: string;
  iso: string;
}

interface ChipsProps {
  ariaLabel: string;
  value: string | null;
  onPick: (iso: string) => void;
  chips: ChipPreset[];
}

/** Fileira de atalhos; o que casa com o valor atual fica em `primary`. */
export function PresetChips({ ariaLabel, value, onPick, chips }: ChipsProps) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const iso = normalizar(chip.iso);
        const ativo = mesmoInstante(value, iso);
        return (
          <button
            key={chip.testId}
            type="button"
            aria-pressed={ativo}
            data-testid={chip.testId}
            onClick={() => onPick(iso)}
            className={`inline-flex h-10 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              ativo
                ? 'border-primary/50 bg-primary/15 text-primary'
                : 'border-border bg-input text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
