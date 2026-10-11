import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Etapa 156 (plano, linha 436; imagem 04) — campo "Título da tarefa" do modal
 * "Nova tarefa": obrigatório, 200 caracteres, contador discreto e erro inline.
 *
 * O limite mora aqui (e não num `.ts` de constantes) porque ninguém mais o lê:
 * o `maxLength` do input e o contador saem do MESMO número, então um teto só.
 */
const TITLE_MAX = 200;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Erro inline (título vazio depois de tocado). `null` = campo válido. */
  error: string | null;
  id?: string;
}

export function TaskTitleField({ value, onChange, onBlur, error, id = 'new-task-title' }: Props) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>Título da tarefa</Label>
        {/* Contador discreto: o leitor de tela já ouve o valor do campo. */}
        <span
          aria-hidden="true"
          data-testid="new-task-title-counter"
          className="text-2xs tabular-nums text-muted-foreground"
        >
          {value.length}/{TITLE_MAX}
        </span>
      </div>

      <Input
        id={id}
        autoFocus
        value={value}
        maxLength={TITLE_MAX}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-required="true"
        aria-invalid={error ? true : false}
        aria-describedby={error ? errorId : undefined}
        placeholder="Ex: Ligar para o cliente sobre o orçamento"
        data-testid="new-task-title"
      />

      {error && (
        <p id={errorId} role="alert" className="text-2xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
