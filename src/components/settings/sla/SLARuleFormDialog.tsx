import { useState } from 'react';
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
import { cn } from '@/lib/utils';

interface SLARuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: SLARuleScope;
  editingRule: SLARule | null;
}

const EMPTY_FORM: SLARuleForm = {
  name: '',
  first_response_minutes: 5,
  resolution_minutes: 60,
  priority: 10,
  metadata: { notify_on_warning: false, escalation_notes: '' },
};

function buildForm(editingRule: SLARule | null): SLARuleForm {
  if (!editingRule) return { ...EMPTY_FORM, metadata: { ...EMPTY_FORM.metadata } };
  return {
    name: editingRule.name,
    first_response_minutes: 5,
    resolution_minutes: editingRule.resolution_minutes,
    priority: editingRule.priority,
    metadata: editingRule.metadata || { notify_on_warning: false, escalation_notes: '' },
  };
}

function buildScopeValue(editingRule: SLARule | null): string {
  if (!editingRule) return '';
  return editingRule.contact_id || editingRule.company || editingRule.job_title ||
    editingRule.contact_type || editingRule.queue_id || editingRule.agent_id || '';
}

export function SLARuleFormDialog({ open, onOpenChange, scope, editingRule }: SLARuleFormDialogProps) {
  const { createRule, updateRule, isCreating, isUpdating } = useSLARules(scope);
  // Estado inicial derivado de editingRule; o componente e remontado (key no pai)
  // a cada abertura, entao nao precisa de effect de reset.
  const [form, setForm] = useState<SLARuleForm>(() => buildForm(editingRule));
  const [scopeValue, setScopeValue] = useState(() => buildScopeValue(editingRule));
  const [contactSearch, setContactSearch] = useState('');

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
        .or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`)
        .limit(20);
      return data || [];
    },
    enabled: open && scope === 'contact' && contactSearch.length >= 2,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Nome é obrigatório';
    if (!scopeValue) e.scope = `Selecione um(a) ${SCOPE_LABELS[scope].toLowerCase()}`;
    if (form.first_response_minutes < 1) e.fr = 'Mínimo 1 minuto';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const payload: SLARuleForm = { ...form };
    if (scope === 'contact') payload.contact_id = scopeValue || null;
    else if (scope === 'company') payload.company = scopeValue || null;
    else if (scope === 'job_title') payload.job_title = scopeValue || null;
    else if (scope === 'contact_type') payload.contact_type = scopeValue || null;
    else if (scope === 'queue') payload.queue_id = scopeValue || null;
    else if (scope === 'agent') payload.agent_id = scopeValue || null;

    if (editingRule) {
      updateRule({ ...payload, id: editingRule.id });
    } else {
      createRule(payload);
    }
    onOpenChange(false);
  };

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
                  onClick={() => { setScopeValue(c.id); setContactSearch(c.name); }}
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
      ? CONTACT_TYPES.map(t => ({ id: t, label: t }))
      : scope === 'company'
      ? companies.map(c => ({ id: c, label: c }))
      : scope === 'job_title'
      ? jobTitles.map(j => ({ id: j, label: j }))
      : scope === 'queue'
      ? queues.map(q => ({ id: q.id, label: q.name }))
      : agents.map(a => ({ id: a.id, label: a.name }));

    return (
      <Select value={scopeValue} onValueChange={setScopeValue}>
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
              value={form.name}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(e2 => ({ ...e2, name: '' })); }}
              placeholder="Ex: SLA VIP — Empresa X"
              className={cn('mt-1', errors.name && 'border-destructive')}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-[11px] text-destructive mt-1">{errors.name}</p>}
          </div>

          <div>
            <Label className="text-xs font-medium">{SCOPE_LABELS[scope]}</Label>
            {renderScopeSelector()}
            {errors.scope && <p className="text-[11px] text-destructive mt-1">{errors.scope}</p>}
          </div>

          <div>
            <Label htmlFor="sla-fr" className="text-xs font-medium">1ª Resposta (min)</Label>
            <Input
              id="sla-fr"
              type="number" min={1} max={5}
              value={form.first_response_minutes}
              disabled
              className={cn('mt-1 opacity-70', errors.fr && 'border-destructive')}
              aria-describedby="sla-rule-fr-hint"
            />
            <p id="sla-rule-fr-hint" className="text-[11px] text-muted-foreground mt-1">Prazo fixo de 5 minutos (regra de SLA de 1ª resposta)</p>
            {errors.fr && <p className="text-[11px] text-destructive mt-1">{errors.fr}</p>}
          </div>

          <div>
            <Label htmlFor="sla-priority" className="text-xs font-medium">Prioridade (maior = mais prioritário)</Label>
            <Input
              id="sla-priority"
              type="number" min={0} max={100}
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
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
                checked={form.metadata?.notify_on_warning ?? false}
                onCheckedChange={v => setForm(f => ({ ...f, metadata: { ...f.metadata, notify_on_warning: v } }))}
              />
              <Label htmlFor="sla-notify" className="text-xs">Notificar ao atingir limite de aviso (70%)</Label>
            </div>
            <div>
              <Label htmlFor="sla-notes" className="text-xs font-medium flex items-center gap-1">
                <FileText className="w-3 h-3" /> Notas de Escalação
              </Label>
              <Textarea
                id="sla-notes"
                value={form.metadata?.escalation_notes || ''}
                onChange={e => setForm(f => ({ ...f, metadata: { ...f.metadata, escalation_notes: e.target.value } }))}
                placeholder="Ex: Escalar para gerente se violado..."
                className="mt-1 text-xs min-h-[60px]"
                maxLength={500}
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
