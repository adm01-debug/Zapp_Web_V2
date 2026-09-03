import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSLARules, SLARule, SLARuleScope } from '@/hooks/sla/useSLARules';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { SLARuleRow } from './SLARuleRow';
import { SLARuleFormDialog } from './SLARuleFormDialog';

interface ScopeRulesListProps {
  scope: SLARuleScope;
}

export function ScopeRulesList({ scope }: ScopeRulesListProps) {
  const { rules, isLoading, deleteRule, toggleRule } = useSLARules(scope);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<SLARule | null>(null);

  // Resolve human-readable names for UUID-based scopes
  const contactIds = rules.filter(r => r.contact_id).map(r => r.contact_id!);
  const queueIds = rules.filter(r => r.queue_id).map(r => r.queue_id!);
  const agentIds = rules.filter(r => r.agent_id).map(r => r.agent_id!);

  const { data: contactNames = {} } = useQuery({
    queryKey: ['sla-contact-names', contactIds],
    queryFn: async () => {
      if (contactIds.length === 0) return {};
      const { data } = await supabase.from('contacts').select('id, name, phone').in('id', contactIds);
      const map: Record<string, string> = {};
      (data || []).forEach(c => { map[c.id] = `${c.name} (${c.phone})`; });
      return map;
    },
    enabled: scope === 'contact' && contactIds.length > 0,
  });

  const { data: queueNames = {} } = useQuery({
    queryKey: ['sla-queue-names', queueIds],
    queryFn: async () => {
      if (queueIds.length === 0) return {};
      const { data } = await supabase.from('queues').select('id, name').in('id', queueIds);
      const map: Record<string, string> = {};
      (data || []).forEach(q => { map[q.id] = q.name; });
      return map;
    },
    enabled: scope === 'queue' && queueIds.length > 0,
  });

  const { data: agentNames = {} } = useQuery({
    queryKey: ['sla-agent-names', agentIds],
    queryFn: async () => {
      if (agentIds.length === 0) return {};
      const { data } = await supabase.from('profiles').select('id, name').in('id', agentIds);
      const map: Record<string, string> = {};
      (data || []).forEach(a => { map[a.id] = a.name; });
      return map;
    },
    enabled: scope === 'agent' && agentIds.length > 0,
  });

  const getScopeLabel = (rule: SLARule): string | undefined => {
    if (scope === 'contact' && rule.contact_id) return contactNames[rule.contact_id];
    if (scope === 'queue' && rule.queue_id) return queueNames[rule.queue_id];
    if (scope === 'agent' && rule.agent_id) return agentNames[rule.agent_id];
    if (scope === 'company') return rule.company ?? undefined;
    if (scope === 'job_title') return rule.job_title ?? undefined;
    if (scope === 'contact_type') return rule.contact_type ?? undefined;
    return undefined;
  };

  if (isLoading) {
    return (
      <div className="space-y-3 pt-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditingRule(null); setShowDialog(true); }}
            className="gap-1.5 rounded-xl"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Regra
          </Button>
        </motion.div>
      </div>

      {rules.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-12 text-muted-foreground"
        >
          <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhuma regra de SLA neste escopo</p>
          <p className="text-xs mt-1 opacity-70">Crie uma regra para definir prazos específicos</p>
        </motion.div>
      ) : (
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2" role="list" aria-label="Lista de regras de SLA">
            {rules.map((rule, index) => (
              <SLARuleRow
                key={rule.id}
                rule={rule}
                scope={scope}
                scopeLabel={getScopeLabel(rule)}
                index={index}
                onEdit={() => { setEditingRule(rule); setShowDialog(true); }}
                onDelete={() => deleteRule(rule.id)}
                onToggle={(active) => toggleRule({ id: rule.id, is_active: active })}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <SLARuleFormDialog
        key={showDialog ? `open-${editingRule?.id ?? 'new'}` : 'closed'}
        open={showDialog}
        onOpenChange={setShowDialog}
        scope={scope}
        editingRule={editingRule}
      />
    </div>
  );
}
