import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  MAX_BUTTON_LABEL,
  MAX_INTERACTIVE_BUTTONS,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  SATISFACTION_POLL,
  talkxInteractiveMode,
  talkxInteractiveReserveText,
  validateTalkxInteractive,
  type TalkxInteractive,
  type TalkxInteractiveButton,
  type TalkxInteractiveMode,
} from './talkxInteractive';

/**
 * X096 (V4) — botões e enquete na mensagem do TEMPLATE.
 *
 * Componente CONTROLADO (`value`/`onChange`): quem grava é o editor de template.
 * Enquanto a coluna `interactive` e a RPC de save não existem (X083/X084), o valor
 * que sai daqui é exatamente o JSON que o CHECK do banco vai receber — por isso a
 * validação é a MESMA função do domínio (`validateTalkxInteractive`), e não uma
 * cópia local com os limites escritos à mão.
 *
 * O "texto reserva" é o que o cliente recebe quando o aparelho não exibe botão
 * nem enquete (X064); ele é mostrado aqui para o autor saber o que o aparelho
 * antigo vai ler.
 */

const MODES: { mode: TalkxInteractiveMode; label: string }[] = [
  { mode: 'none', label: 'Nenhum' },
  { mode: 'buttons', label: 'Botões' },
  { mode: 'poll', label: 'Enquete' },
];

const FIELD = 'h-9 text-xs bg-input/40 border-border/70';
const MODE_BUTTON = 'h-8 px-3 rounded-lg text-xs border motion-safe:transition-colors disabled:opacity-50';

export interface TalkXInteractiveEditorProps {
  /** Estado atual; `null` = nenhum recurso interativo. */
  value: TalkxInteractive | null;
  onChange: (value: TalkxInteractive | null) => void;
  /** Corpo da mensagem, para compor o texto reserva mostrado ao autor. */
  messageBody?: string;
  disabled?: boolean;
  className?: string;
}

function withDefaultButton(buttons: TalkxInteractive['buttons'] = []) {
  const list = buttons.length > 0 ? buttons : [{ type: 'reply' as const, label: '' }];
  return { buttons: list };
}

export function TalkXInteractiveEditor({
  value,
  onChange,
  messageBody = '',
  disabled = false,
  className,
}: TalkXInteractiveEditorProps) {
  const mode = talkxInteractiveMode(value);
  const buttons = value?.buttons ?? [];
  const poll = value?.poll;
  const options = poll?.options ?? [];
  const validation = validateTalkxInteractive(value);
  const reserveText = talkxInteractiveReserveText(value, messageBody);

  function switchMode(next: TalkxInteractiveMode) {
    if (next === mode) return;
    if (next === 'none') return onChange(null);
    if (next === 'buttons') return onChange(withDefaultButton());
    onChange({ poll: { question: '', options: ['', ''] } });
  }

  function updateButton(index: number, patch: Partial<TalkxInteractiveButton>) {
    onChange({ buttons: buttons.map((button, i) => (i === index ? { ...button, ...patch } : button)) });
  }

  function addButton() {
    if (buttons.length >= MAX_INTERACTIVE_BUTTONS) return;
    onChange({ buttons: [...buttons, { type: 'reply', label: '' }] });
  }

  function removeButton(index: number) {
    const next = buttons.filter((_, i) => i !== index);
    onChange(next.length > 0 ? { buttons: next } : null);
  }

  function updateOption(index: number, text: string) {
    if (!poll) return;
    onChange({ poll: { ...poll, options: options.map((option, i) => (i === index ? text : option)) } });
  }

  function addOption() {
    if (!poll || options.length >= MAX_POLL_OPTIONS) return;
    onChange({ poll: { ...poll, options: [...options, ''] } });
  }

  function removeOption(index: number) {
    if (!poll || options.length <= MIN_POLL_OPTIONS) return;
    onChange({ poll: { ...poll, options: options.filter((_, i) => i !== index) } });
  }

  return (
    <section className={cn('rounded-2xl bg-card border border-border/70 p-4 space-y-4', disabled && 'opacity-60', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-foreground-secondary">Mensagem interativa</Label>
        <div role="group" aria-label="Tipo de mensagem interativa" className="flex items-center gap-1">
          {MODES.map(({ mode: candidate, label }) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={mode === candidate}
              disabled={disabled}
              onClick={() => switchMode(candidate)}
              className={cn(
                MODE_BUTTON,
                mode === candidate
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-border/70 text-foreground-secondary hover:bg-muted/50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'buttons' && (
        <div className="space-y-3">
          <div className="space-y-2">
            {buttons.map((button, index) => (
              <div key={index} className="rounded-xl border border-border/60 bg-muted/20 p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Tipo do botão ${index + 1}`}
                    value={button.type}
                    disabled={disabled}
                    onChange={(event) => updateButton(index, {
                      type: event.target.value as 'reply' | 'link',
                      url: event.target.value === 'link' ? button.url : undefined,
                    })}
                    className={cn(FIELD, 'rounded-md px-2 w-36 text-foreground')}
                  >
                    <option value="reply">Resposta rápida</option>
                    <option value="link">Link</option>
                  </select>
                  <Input
                    aria-label={`Rótulo do botão ${index + 1}`}
                    value={button.label}
                    maxLength={MAX_BUTTON_LABEL}
                    disabled={disabled}
                    placeholder={`Rótulo (até ${MAX_BUTTON_LABEL})`}
                    onChange={(event) => updateButton(index, { label: event.target.value.slice(0, MAX_BUTTON_LABEL) })}
                    className={FIELD}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={`Remover botão ${index + 1}`}
                    onClick={() => removeButton(index)}
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {button.type === 'link' && (
                  <Input
                    aria-label={`Link do botão ${index + 1}`}
                    value={button.url ?? ''}
                    disabled={disabled}
                    placeholder="https://"
                    onChange={(event) => updateButton(index, { url: event.target.value })}
                    className={FIELD}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || buttons.length >= MAX_INTERACTIVE_BUTTONS}
              onClick={addButton}
              className="gap-1 h-7 text-xs"
            >
              <Plus className="w-3 h-3" /> Adicionar botão
            </Button>
            <span className="text-2xs text-muted-foreground tabular-nums">
              {buttons.length}/{MAX_INTERACTIVE_BUTTONS} botões
            </span>
          </div>
        </div>
      )}

      {mode === 'poll' && poll && (
        <div className="space-y-3">
          <div>
            <Label className="text-2xs text-foreground-secondary">Pergunta</Label>
            <Input
              aria-label="Pergunta da enquete"
              value={poll.question}
              maxLength={MAX_POLL_QUESTION}
              disabled={disabled}
              placeholder="Como você avalia o nosso atendimento?"
              onChange={(event) => onChange({ poll: { ...poll, question: event.target.value.slice(0, MAX_POLL_QUESTION) } })}
              className={cn(FIELD, 'mt-1')}
            />
          </div>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`Opção ${index + 1}`}
                  value={option}
                  disabled={disabled}
                  placeholder={`Opção ${index + 1}`}
                  onChange={(event) => updateOption(index, event.target.value)}
                  className={FIELD}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || options.length <= MIN_POLL_OPTIONS}
                  aria-label={`Remover opção ${index + 1}`}
                  onClick={() => removeOption(index)}
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || options.length >= MAX_POLL_OPTIONS}
                onClick={addOption}
                className="gap-1 h-7 text-xs"
              >
                <Plus className="w-3 h-3" /> Adicionar opção
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onChange({ poll: { ...SATISFACTION_POLL, options: [...SATISFACTION_POLL.options] } })}
                className="h-7 text-xs"
              >
                Satisfação (4 emojis)
              </Button>
            </div>
            <span className="text-2xs text-muted-foreground tabular-nums">
              {options.length} de {MIN_POLL_OPTIONS} a {MAX_POLL_OPTIONS} opções
            </span>
          </div>
        </div>
      )}

      {mode !== 'none' && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
          <Label className="text-2xs text-foreground-secondary">
            Texto reserva — o que o cliente recebe quando o aparelho não mostra o recurso
          </Label>
          <pre
            data-testid="talkx-interactive-reserve"
            className="m-0 whitespace-pre-wrap break-words text-xs font-mono text-foreground-secondary"
          >
            {reserveText || '—'}
          </pre>
        </div>
      )}

      {!validation.ok && (
        <ul role="status" data-testid="talkx-interactive-errors" className="space-y-1 text-2xs text-warning">
          {validation.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}
    </section>
  );
}
