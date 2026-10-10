import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RULE_FIELDS, type RuleField, type RuleOp } from '@/hooks/integrations/useTalkXSegments';

/**
 * TL-131 (escopo reduzido) — o controle de valor da condição passa a respeitar o
 * TIPO do campo em vez de ser sempre uma caixa de texto livre. Este cartão cobre
 * só os dois tipos que se resolvem apenas com front:
 *
 *   - data/período (`in_last_days` / `not_in_last_days`): dias inteiros > 0, com
 *     os atalhos 7/30/60/90/180 e digitação; o que não é dígito é descartado e o
 *     zero à esquerda não entra, então o campo nunca guarda `<= 0` nem texto;
 *   - número (`lead_score` / `risk_score` com eq/gt/gte/lt/lte): número decimal,
 *     sem máscara; letra é descartada na digitação.
 *
 * Os ramos de vários valores ([in]), moeda e sim/não exigem RPC/DDL e NÃO fazem
 * parte deste cartão. O valor continua sendo o `value: string` que
 * `useTalkXSegments` já lê — o que a regra grava não muda, só muda o que a tela
 * deixa digitar. Quem decide se a condição está utilizável é o `isRuleComplete`
 * existente (número não-NaN; data com dias finitos > 0), que o `RuleRow` já usa.
 */

/** Atalhos de período em dias (`in_last_days` / `not_in_last_days`). */
const PERIOD_SHORTCUTS = [7, 30, 60, 90, 180] as const;

/**
 * Dias: só dígito, e o zero à esquerda cai — assim `0`, `00` e `-3` não ficam no
 * campo (o card exige inteiro > 0) e `3x7` vira `37`, sem aceitar texto.
 */
function sanitizeDays(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Número: mantém dígito, no máximo um ponto decimal e o sinal no começo; letra e
 * qualquer outro caractere do texto livre são descartados (`8a0` -> `80`).
 */
function sanitizeNumber(raw: string): string {
  const semSinalExtra = raw.replace(/[^\d.-]/g, '');
  const negativo = semSinalExtra.startsWith('-');
  const [inteiro, ...resto] = semSinalExtra.replace(/-/g, '').split('.');
  const decimal = resto.join('');
  const corpo = inteiro + (resto.length ? `.${decimal}` : '');
  return (negativo ? '-' : '') + corpo;
}

interface RuleValueInputProps {
  field: RuleField;
  op: RuleOp;
  value: string;
  onChange: (value: string) => void;
}

export function RuleValueInput({ field, op, value, onChange }: RuleValueInputProps) {
  const fieldDef = RULE_FIELDS.find((f) => f.value === field);
  // Campo desconhecido, operador sem valor (`está preenchido`/`está vazio`) e
  // qualquer tipo fora dos dois deste cartão não têm controle aqui.
  if (!fieldDef) return null;
  if (op === 'is_set' || op === 'is_empty') return null;

  if (fieldDef.kind === 'date') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {PERIOD_SHORTCUTS.map((d) => (
          <button
            key={d}
            type="button"
            aria-label={`${d} dias`}
            aria-pressed={value === String(d)}
            onClick={() => onChange(String(d))}
            className={cn(
              'h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors',
              value === String(d)
                ? 'border-primary/60 bg-primary/15 text-primary-glow'
                : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50',
            )}
          >
            {d}d
          </button>
        ))}
        <Input
          inputMode="numeric"
          aria-label="Período em dias"
          value={value}
          onChange={(e) => onChange(sanitizeDays(e.target.value))}
          placeholder="30"
          className="h-9 bg-input/40 border-border/70 text-xs w-[70px]"
        />
        <span className="text-2xs text-foreground-secondary">dias</span>
      </div>
    );
  }

  if (fieldDef.kind === 'number') {
    return (
      <Input
        inputMode="decimal"
        aria-label="Valor da condição"
        value={value}
        onChange={(e) => onChange(sanitizeNumber(e.target.value))}
        placeholder="0"
        className="h-9 bg-input/40 border-border/70 text-xs w-[130px]"
      />
    );
  }

  return null;
}
