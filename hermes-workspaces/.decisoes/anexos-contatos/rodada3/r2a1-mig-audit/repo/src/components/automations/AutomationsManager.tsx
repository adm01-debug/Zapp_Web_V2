import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Plus } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/auth/useAuth';
import { useAutomations, type AutomationRow } from './useAutomations';
import { AutomationCard } from './AutomationCard';
import { AutomationEditorDialog } from './AutomationEditorDialog';

export function AutomationsManager() {
  const { user } = useAuth();
  const { automations, isLoading, createMutation, updateMutation, deleteMutation } = useAutomations();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<AutomationRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const filteredAutomations = useMemo(() => {
    return automations.filter(a => {
      if (filter === 'active') return a.is_active;
      if (filter === 'inactive') return !a.is_active;
      return true;
    });
  }, [automations, filter]);

  const handleToggle = (automation: AutomationRow) => {
    updateMutation.mutate({ id: automation.id, is_active: !automation.is_active } as Partial<AutomationRow> & { id: string });
  };

  const handleSave = async (data: Partial<AutomationRow>) => {
    if (editingAutomation) {
      updateMutation.mutate({ id: editingAutomation.id, ...data });
    } else {
      createMutation.mutate({ ...data, created_by: user?.id });
    }
  };

  const handleDuplicate = (automation: AutomationRow) => {
    createMutation.mutate({
      name: `${automation.name} (cópia)`,
      description: automation.description,
      trigger_type: automation.trigger_type,
      trigger_config: automation.trigger_config,
      actions: automation.actions,
      is_active: false,
      created_by: user?.id,
    } as Omit<AutomationRow, 'id' | 'created_at' | 'updated_at' | 'trigger_count' | 'last_triggered_at'>);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />Automações</CardTitle>
            <CardDescription>Configure respostas e ações automáticas</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | 'active' | 'inactive')}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="inactive">Inativas</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => { setEditingAutomation(null); setEditorOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />Nova
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-3">
            <AnimatePresence>
              {filteredAutomations.map((automation) => (
                <AutomationCard
                  key={automation.id} automation={automation}
                  onToggle={() => handleToggle(automation)}
                  onEdit={() => { setEditingAutomation(automation); setEditorOpen(true); }}
                  onDelete={() => deleteMutation.mutate(automation.id)}
                  onDuplicate={() => handleDuplicate(automation)}
                />
              ))}
            </AnimatePresence>
            {filteredAutomations.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Nenhuma automação encontrada</p>
                <p className="text-sm">Crie sua primeira automação para otimizar o atendimento</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <AutomationEditorDialog open={editorOpen} onOpenChange={setEditorOpen} automation={editingAutomation} onSave={handleSave} />
    </Card>
  );
}
