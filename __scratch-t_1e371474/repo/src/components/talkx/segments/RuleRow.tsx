import React from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RULE_FIELDS, RULE_OPS, isRuleComplete, type SegmentRule } from '@/hooks/integrations/useTalkXSegments';
import { cn } from '@/lib/utils';

/**
 * X099 — a linha de condição saiu de dentro de `TalkXSegments.tsx`. O desenho é o
 * mesmo (campo, operador, valor e o aviso de condição incompleta); o que mudou é
 * que a edição agora sobe por `dispatch` do reducer, em vez de um setState solto.
 */
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
  return (
    <div className={cn('flex items-center gap-2 flex-wrap rounded-lg', incomplete && 'border border-dash-amber p-2')}>
      <Select value={rule.field} onValueChange={(v) => onChange({ field: v as never, op: (RULE_OPS[RULE_FIELDS.find((f) => f.value === v)?.kind ?? 'text']?.[0]?.value ?? 'eq') as never, value: '' })}>
        <SelectTrigger className="h-9 bg-input/40 border-border/70 text-xs min-w-[160px] w-auto"><SelectValue /></SelectTrigger>
        <SelectContent>{RULE_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={rule.op} onValueChange={(v) => onChange({ op: v as never })}>
        <SelectTrigger className="h-9 bg-input/40 border-border/70 text-xs w-auto min-w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>{ops.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {needsValue && (
        fieldDef?.options ? (
          <Select value={rule.value} onValueChange={(v) => onChange({ value: v })}>
            <SelectTrigger className="h-9 bg-input/40 border-border/70 text-xs w-auto min-w-[130px]"><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{fieldDef.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input value={rule.value} onChange={(e) => onChange({ value: e.target.value })} placeholder={fieldDef?.kind === 'number' ? '0' : fieldDef?.kind === 'date' ? '30 (dias)' : 'Valor…'} className="h-9 bg-input/40 border-border/70 text-xs w-[130px]" />
        )
      )}
      <button type="button" onClick={onRemove} aria-label="Remover condição" className="h-9 w-9 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:text-dash-red shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
