import React from 'react';
import { X, Type, Tags, Hash, CalendarDays, ListFilter, User, Sliders, type LucideIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RULE_FIELDS, RULE_OPS, isRuleComplete, type SegmentRule } from '@/hooks/integrations/useTalkXSegments';
import { cn } from '@/lib/utils';
import { RuleValueInput } from './RuleValueInput';

/**
 * X099 — a linha de condição saiu de dentro de `TalkXSegments.tsx`. O desenho é o
 * mesmo (campo, operador, valor e o aviso de condição incompleta); o que mudou é
 * que a edição agora sobe por `dispatch` do reducer, em vez de um setState solto.
 *
 * X105 (TL-130): ícone por tipo de campo — o rótulo do campo não diz o que ele
 * aceita, e o tipo é o que decide o controle de valor. Vem do catálogo
 * (`RULE_FIELDS.kind`), sem cor nova e sem campo novo.
 */
const FIELD_ICONS: Record<'text' | 'array' | 'number' | 'date' | 'enum' | 'uuid', LucideIcon> = {
  text: Type, array: Tags, number: Hash, date: CalendarDays, enum: ListFilter, uuid: User,
};

export function RuleRow({ rule, onChange, onRemove }: {
  rule: SegmentRule;
  onChange: (patch: Partial<SegmentRule>) => void;
  onRemove: () => void;
}) {
  const fieldDef = RULE_FIELDS.find((f) => f.value === rule.field);
  const ops = RULE_OPS[fieldDef?.kind ?? 'text'] ?? RULE_OPS.text;
  const needsValue = !['is_set', 'is_empty'].includes(rule.op);
  // Condição ainda em branco não entra na estimativa: a borda de aviso mostra
  // qual linha precisa ser completada (ou removida) antes de publicar.
  const incomplete = !isRuleComplete(rule);
  const FieldIcon = FIELD_ICONS[fieldDef?.kind ?? 'text'] ?? Sliders;
  return (
    <div className={cn('flex items-center gap-2 flex-wrap rounded-lg', incomplete && 'border border-dash-amber p-2')}>
      <FieldIcon aria-hidden className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <Select value={rule.field} onValueChange={(v) => onChange({ field: v as never, op: (RULE_OPS[RULE_FIELDS.find((f) => f.value === v)?.kind ?? 'text']?.[0]?.value ?? 'eq') as never, value: '' })}>
        <SelectTrigger aria-label="Campo" className="h-9 bg-input/40 border-border/70 text-xs min-w-[160px] w-auto"><SelectValue /></SelectTrigger>
        <SelectContent>{RULE_FIELDS.map((f) => <SelectItem key={f.value} value={f.value} disabled={f.comingSoon && f.value !== rule.field}>{f.label}{f.comingSoon ? ' (em breve)' : ''}</SelectItem>)}</SelectContent>
      </Select>
      {fieldDef?.comingSoon && (
        <span role="note" className="text-2xs text-foreground-secondary">Em breve: este indicador ainda não é calculado e fica fora da estimativa.</span>
      )}
      <Select value={rule.op} onValueChange={(v) => onChange({ op: v as never })}>
        <SelectTrigger aria-label="Operador" className="h-9 bg-input/40 border-border/70 text-xs w-auto min-w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>{ops.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {needsValue && (
        <RuleValueInput field={rule.field} op={rule.op} value={rule.value} onChange={(v) => onChange({ value: v })} />
      )}
      <button type="button" onClick={onRemove} aria-label="Remover condição" className="h-9 w-9 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:text-dash-red shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
