import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Settings,
  MessageSquare,
  Users,
  CheckCircle2,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';

interface GoalsConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GoalConfig {
  id?: string;
  goal_type: string;
  daily_target: number;
  weekly_target: number;
  monthly_target: number;
  is_active: boolean;
}

const DEFAULT_GOALS: GoalConfig[] = [
  { goal_type: 'messages_sent', daily_target: 50, weekly_target: 250, monthly_target: 1000, is_active: true },
  { goal_type: 'contacts_handled', daily_target: 10, weekly_target: 50, monthly_target: 200, is_active: true },
  { goal_type: 'resolution_rate', daily_target: 80, weekly_target: 80, monthly_target: 85, is_active: true },
];

const GOAL_LABELS: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  messages_sent: { label: 'Mensagens Enviadas', icon: MessageSquare, description: 'Meta de mensagens enviadas' },
  contacts_handled: { label: 'Contatos Atendidos', icon: Users, description: 'Meta de novos contatos atendidos' },
  resolution_rate: { label: 'Taxa de Resolução', icon: CheckCircle2, description: 'Meta percentual de resolução' },
};

export function GoalsConfigDialog({ open, onOpenChange }: GoalsConfigDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [goals, setGoals] = useState<GoalConfig[]>(DEFAULT_GOALS);

  // Fetch current user's profile
  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch existing goal configurations
  const { data: existingGoals, isLoading } = useQuery({
    queryKey: ['goals-config', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('goals_configurations')
        .select('*')
        .eq('profile_id', profile.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id && open,
  });

  // Update local state when existing goals are fetched
  useEffect(() => {
    if (existingGoals && existingGoals.length > 0) {
      const mergedGoals = DEFAULT_GOALS.map(defaultGoal => {
        const existing = existingGoals.find(g => g.goal_type === defaultGoal.goal_type);
        if (existing) {
          return {
            id: existing.id,
            goal_type: existing.goal_type,
            daily_target: existing.daily_target,
            weekly_target: existing.weekly_target,
            monthly_target: existing.monthly_target,
            is_active: existing.is_active ?? true,
          };
        }
        return defaultGoal;
      });
      setGoals(mergedGoals);
    } else {
      setGoals(DEFAULT_GOALS);
    }
  }, [existingGoals]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (goalsToSave: GoalConfig[]) => {
      if (!profile?.id) throw new Error('Profile not found');

      for (const goal of goalsToSave) {
        if (goal.id) {
          // Update existing
          const { error } = await supabase
            .from('goals_configurations')
            .update({
              daily_target: goal.daily_target,
              weekly_target: goal.weekly_target,
              monthly_target: goal.monthly_target,
              is_active: goal.is_active,
            })
            .eq('id', goal.id);
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('goals_configurations')
            .insert({
              profile_id: profile.id,
              goal_type: goal.goal_type,
              daily_target: goal.daily_target,
              weekly_target: goal.weekly_target,
              monthly_target: goal.monthly_target,
              is_active: goal.is_active,
            });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success('Metas salvas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['goals-config'] });
      queryClient.invalidateQueries({ queryKey: ['goals-messages'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Erro ao salvar metas: ' + error.message);
    },
  });

  const handleGoalChange = (goalType: string, field: keyof GoalConfig, value: number | boolean) => {
    setGoals(prev => prev.map(g => 
      g.goal_type === goalType ? { ...g, [field]: value } : g
    ));
  };

  const handleReset = () => {
    setGoals(DEFAULT_GOALS);
    toast.info('Metas restauradas para valores padrão');
  };

  const handleSave = () => {
    saveMutation.mutate(goals);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Configurar Metas Personalizadas
          </DialogTitle>
          <DialogDescription>
            Defina suas metas diárias, semanais e mensais para cada métrica.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {goals.map((goal) => {
              const config = GOAL_LABELS[goal.goal_type];
              if (!config) return null;
              const Icon = config.icon;

              return (
                <Card key={goal.goal_type} className={!goal.is_active ? 'opacity-50' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{config.label}</CardTitle>
                          <p className="text-xs text-muted-foreground">{config.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`active-${goal.goal_type}`} className="text-sm text-muted-foreground">
                          Ativa
                        </Label>
                        <Switch
                          id={`active-${goal.goal_type}`}
                          checked={goal.is_active}
                          onCheckedChange={(checked) => handleGoalChange(goal.goal_type, 'is_active', checked)}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`daily-${goal.goal_type}`} className="text-sm">
                          Meta Diária
                        </Label>
                        <Input
                          id={`daily-${goal.goal_type}`}
                          type="number"
                          min={0}
                          value={goal.daily_target}
                          onChange={(e) => handleGoalChange(goal.goal_type, 'daily_target', parseInt(e.target.value) || 0)}
                          disabled={!goal.is_active}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`weekly-${goal.goal_type}`} className="text-sm">
                          Meta Semanal
                        </Label>
                        <Input
                          id={`weekly-${goal.goal_type}`}
                          type="number"
                          min={0}
                          value={goal.weekly_target}
                          onChange={(e) => handleGoalChange(goal.goal_type, 'weekly_target', parseInt(e.target.value) || 0)}
                          disabled={!goal.is_active}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`monthly-${goal.goal_type}`} className="text-sm">
                          Meta Mensal
                        </Label>
                        <Input
                          id={`monthly-${goal.goal_type}`}
                          type="number"
                          min={0}
                          value={goal.monthly_target}
                          onChange={(e) => handleGoalChange(goal.goal_type, 'monthly_target', parseInt(e.target.value) || 0)}
                          disabled={!goal.is_active}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Restaurar Padrões
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? 'Salvando...' : 'Salvar Metas'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}