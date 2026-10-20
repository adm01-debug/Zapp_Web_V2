import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { GROUP_CATEGORIES } from '@/hooks/groups/types';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { RULE_FIELDS, type RuleField, type RuleOp } from '@/hooks/integrations/useTalkXSegments';

/**
 * X106 — o controle de valor da condição muda com o TIPO do campo e com o
 * OPERADOR selecionado, em vez de uma única caixa de texto:
 *   - lista (enum com valores canônicos): mostra o RÓTULO LEGÍVEL e grava o
 *     valor do banco (`Prestador de Serviço` na tela, `prestador_servico` na regra);
 *   - data: período em dias, com os atalhos 7/30/60/90/180 e digitação livre;
 *   - número: caixa numérica, sem máscara;
 *   - texto/lista de tags: caixa de texto.
 * `está preenchido`/`está vazio` não pedem valor (o controle não aparece).
 *
 * O valor continua sendo o `value: string` que o motor de regras
 * (`useTalkXSegments`) já lê — este componente não muda o que vai para o banco.
 */

/** Atalhos de período em dias (`in_last_days` / `not_in_last_days`). */
const PERIOD_SHORTCUTS = [7, 30, 60, 90, 180];

/**
 * Rótulo legível de cada valor canônico, para EXIBIÇÃO. O que é gravado na regra
 * continua sendo o valor cru do campo (o PostgREST compara com a coluna). Onde já
 * existe fonte canônica com rótulo (grupos, tipos de contato) ela é usada; nos
 * demais, é a leitura em pt-BR dos valores que o banco guarda.
 */
const OPTION_LABELS: Partial<Record<RuleField, Record<string, string>>> = {
  group_category: Object.fromEntries(GROUP_CATEGORIES.map((c) => [c.value, c.label])),
  contact_type: Object.fromEntries(CONTACT_TYPES.map((t) => [t.value, t.label])),
  conversation_status: { open: 'Aberta', pending: 'Pendente', waiting: 'Aguardando', resolved: 'Resolvida', closed: 'Fechada', archived: 'Arquivada' },
  ai_priority: { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' },
  ai_sentiment: { positivo: 'Positivo', neutro: 'Neutro', negativo: 'Negativo', critico: 'Crítico' },
  consent_status: { granted: 'Concedido', unknown: 'Desconhecido', revoked: 'Revogado' },
};

interface RuleValueInputProps {
  field: RuleField;
  op: RuleOp;
  value: string;
  onChange: (value: string) => void;
}

export function RuleValueInput({ field, op, value, onChange }: RuleValueInputProps) {
  const fieldDef = RULE_FIELDS.find((f) => f.value === field);
  if (!fieldDef) return null;
  // "está preenchido"/"está vazio" são decididos pelo banco, sem valor.
  if (op === 'is_set' || op === 'is_empty') return null;

  if (fieldDef.kind === 'enum' && fieldDef.options) {
    const labels = OPTION_LABELS[field];
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label="Valor da condição" className="h-9 bg-input/40 border-border/70 text-xs w-auto min-w-[130px]">
          <SelectValue placeholder="Selecione…" />
        </SelectTrigger>
        <SelectContent>
          {fieldDef.options.map((o) => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

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
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
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
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="h-9 bg-input/40 border-border/70 text-xs w-[130px]"
      />
    );
  }

  return (
    <Input
      aria-label="Valor da condição"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Valor…"
      className="h-9 bg-input/40 border-border/70 text-xs w-[130px]"
    />
  );
}
