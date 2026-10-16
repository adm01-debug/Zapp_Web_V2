import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSLARules, SLARuleForm, SLARule, SLARuleScope, SLARuleMetadata } from '@/hooks/sla/useSLARules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Search, Loader2, Bell, FileText } from 'lucide-react';
import { CONTACT_TYPES, SCOPE_LABELS } from './sla-utils';
import { CONTACT_TYPES as CANONICAL_TYPES } from '@/utils/whatsappFileTypes';
import { cn } from '@/lib/utils';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import {
  SLA_RULE_NAME_MAX,
  SLA_RULE_NOTES_MAX,
  slaRuleFormSchema,
  type SLARuleFormValues,
} from '@/lib/schemas/slaRule';

interface SLARuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: SLARuleScope;
  editingRule: SLARule | null;
}

// Prazo de 1ª resposta: fixo em 5 minutos (campo desabilitado na UI, decisão de
// produto). Não é editável, então não faz parte do formulário validado.
const FIRST_RESPONSE_MINUTES = 5;

const RESOLUTION_MINUTES_PADRAO = 60;

function buildForm(editingRule: SLARule | null, scopeValue: string): SLARuleFormValues {
  return {
    name: editingRule?.name ?? '',
    scope: scopeValue,
    priority: editingRule?.priority ?? 10,
    metadata: {
      notify_on_warning: editingRule?.metadata?.notify_on_warning ?? false,
      escalation_notes: editingRule?.metadata?.escalation_notes ?? '',
    },
  };
}

function buildScopeValue(editingRule: SLARule | null): string {
  if (!editingRule) return '';
  return editingRule.contact_id || editingRule.company || editingRule.job_title ||
    editingRule.contact_type || editingRule.queue_id || editingRule.agent_id || '';
}

export function SLARuleFormDialog({ open, onOpenChange, scope, editingRule }: SLARuleFormDialogProps) {
  const { createRule, updateRule, isCreating, isUpdating } = useSLARules(scope);
  const [contactSearch, setContactSearch] = useState('');
  // Estado inicial derivado de editingRule; o componente e remontado (key no pai)
  // a cada abertura, entao nao precisa de effect de reset.
  const schema = useMemo(() => slaRuleFormSchema(SCOPE_LABELS[scope]), [scope]);
  const form = useForm<SLARuleFormValues>({
    // O tipo do `zodResolver` do @hookform/resolvers@3 é declarado contra o zod
    // v4 (`z.Schema`), mas em runtime ele só entende schema do zod v3 (ver
    // src/lib/schemas/slaRule.ts). O cast atravessa as duas versões do MESMO
    // pacote instalado — o mesmo motivo pelo qual o schema usa `zod/v3`.
    resolver: zodResolver(schema as unknown as Parameters<typeof zodResolver>[0]),
    defaultValues: buildForm(editingRule, buildScopeValue(editingRule)),
  });
  const errors = form.formState.errors;
  // `useWatch` (e não `form.watch()`): o `watch()` do useForm não é memoizável e
  // desliga a compilação do React Compiler neste componente (lint ratchet).
  const scopeValue = useWatch({ control: form.control, name: 'scope' });
  const notificarNoAviso = useWatch({ control: form.control, name: 'metadata.notify_on_warning' });

  const { data: companies = [] } = useQuery({
    queryKey: ['sla-scope-companies'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('company').not('company', 'is', null);
      return [...new Set((data || []).map(d => d.company).filter(Boolean))] as string[];
    },
    enabled: open && scope === 'company',
  });

  const { data: jobTitles = [] } = useQuery({
    queryKey: ['sla-scope-jobtitles'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('job_title').not('job_title', 'is', null);
      return [...new Set((data || []).map(d => d.job_title).filter(Boolean))] as string[];
    },
    enabled: open && scope === 'job_title',
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['sla-scope-queues'],
    queryFn: async () => {
      const { data } = await supabase.from('queues').select('id, name');
      return data || [];
    },
    enabled: open && scope === 'queue',
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['sla-scope-agents'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name').eq('is_active', true);
      return data || [];
    },
    enabled: open && scope === 'agent',
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['sla-scope-contacts', contactSearch],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, name, phone')
        .or(`name.ilike.${escapeOrFilterValue(`%${contactSearch}%`)},phone.ilike.${escapeOrFilterValue(`%${contactSearch}%`)}`)
        .limit(20);
      return data || [];
    },
    enabled: open && scope === 'contact' && contactSearch.length >= 2,
  });

  // A validação é do schema (`zodResolver`): o submit só chega aqui se o
  // formulário passar. O escopo continua obrigatório, agora declarado no schema.
  const handleSave = form.handleSubmit((values) => {
    const payload: SLARuleForm = {
      name: values.name,
      first_response_minutes: FIRST_RESPONSE_MINUTES,
      resolution_minutes: editingRule?.resolution_minutes ?? RESOLUTION_MINUTES_PADRAO,
      priority: values.priority,
      metadata: values.metadata,
    };
    if (scope === 'contact') payload.contact_id = values.scope || null;
    else if (scope === 'company') payload.company = values.scope || null;
    else if (scope === 'job_title') payload.job_title = values.scope || null;
    else if (scope === 'contact_type') payload.contact_type = values.scope || null;
    else if (scope === 'queue') payload.queue_id = values.scope || null;
    else if (scope === 'agent') payload.agent_id = values.scope || null;

    if (editingRule) {
      updateRule({ ...payload, id: editingRule.id });
    } else {
      createRule(payload);
    }
    onOpenChange(false);
  });

  const renderScopeSelector = () => {
    if (scope === 'contact') {
      return (
        <div className="space-y-2 mt-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {contacts.length > 0 && (
            <div className="border rounded-xl max-h-32 overflow-auto">
              {contacts.map(c => (
                <button
                  key={c.id}
                  onClick={() => { form.setValue('scope', c.id, { shouldValidate: true }); setContactSearch(c.name); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${scopeValue === c.id ? 'bg-primary/10 font-medium' : ''}`}
                >
                  {c.name} — {c.phone}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    const options = scope === 'contact_type'
      ? CANONICAL_TYPES.map(ct => ({ id: ct.value, label: ct.label }))
      : scope === 'company'
      ? companies.map(c => ({ id: c, label: c }))
      : scope === 'job_title'
      ? jobTitles.map(j => ({ id: j, label: j }))
      : scope === 'queue'
      ? queues.map(q => ({ id: q.id, label: q.name }))
      : agents.map(a => ({ id: a.id, label: a.name }));

    return (
      <Select value={scopeValue} onValueChange={(v) => form.setValue('scope', v, { shouldValidate: true })}>
        <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingRule ? 'Editar Regra de SLA' : 'Nova Regra de SLA'}</DialogTitle>
          <DialogDescription>
            {editingRule
              ? 'Atualize os prazos e escopo desta regra.'
              : 'Defina prazos específicos de primeira resposta para este escopo.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sla-name" className="text-xs font-medium">Nome da Regra</Label>
            <Input
              id="sla-name"
              {...form.register('name')}
              maxLength={SLA_RULE_NAME_MAX}
              placeholder="Ex: SLA VIP — Empresa X"
              className={cn('mt-1', errors.name && 'border-destructive')}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-2xs text-destructive mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <Label className="text-xs font-medium">{SCOPE_LABELS[scope]}</Label>
            {renderScopeSelector()}
            {errors.scope && <p className="text-2xs text-destructive mt-1">{errors.scope.message}</p>}
          </div>

          <div>
            <Label htmlFor="sla-fr" className="text-xs font-medium">1ª Resposta (min)</Label>
            <Input
              id="sla-fr"
              type="number" min={1} max={5}
              value={FIRST_RESPONSE_MINUTES}
              disabled
              className="mt-1 opacity-70"
              aria-describedby="sla-rule-fr-hint"
            />
            <p id="sla-rule-fr-hint" className="text-2xs text-muted-foreground mt-1">Prazo fixo de 5 minutos (regra de SLA de 1ª resposta)</p>
          </div>

          <div>
            <Label htmlFor="sla-priority" className="text-xs font-medium">Prioridade (maior = mais prioritário)</Label>
            <Input
              id="sla-priority"
              type="number" min={0} max={100}
              {...form.register('priority', { setValueAs: (v: string) => Number.parseInt(v, 10) || 0 })}
              className="mt-1"
            />
          </div>

          <Separator className="my-1" />

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" /> Escalação
            </p>
            <div className="flex items-center gap-3">
              <Switch
                id="sla-notify"
                checked={notificarNoAviso ?? false}
                onCheckedChange={v => form.setValue('metadata.notify_on_warning', v)}
              />
              <Label htmlFor="sla-notify" className="text-xs">Notificar ao atingir limite de aviso (70%)</Label>
            </div>
            <div>
              <Label htmlFor="sla-notes" className="text-xs font-medium flex items-center gap-1">
                <FileText className="w-3 h-3" /> Notas de Escalação
              </Label>
              <Textarea
                id="sla-notes"
                {...form.register('metadata.escalation_notes')}
                placeholder="Ex: Escalar para gerente se violado..."
                className="mt-1 text-xs min-h-[60px]"
                maxLength={SLA_RULE_NOTES_MAX}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isCreating || isUpdating}>
            {(isCreating || isUpdating) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingRule ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
