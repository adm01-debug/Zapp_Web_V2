import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useQueueGoals, QueueGoal } from '@/hooks/business/useQueueGoals';
import { Target, Bell, Users, Clock, MessageSquare, TrendingUp } from 'lucide-react';

interface QueueGoalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueId: string;
  queueName: string;
  queueColor: string;
}

export function QueueGoalsDialog({
  open,
  onOpenChange,
  queueId,
  queueName,
  queueColor,
}: QueueGoalsDialogProps) {
  const { goals, saveGoal, getDefaultGoal } = useQueueGoals();
  const [formData, setFormData] = useState<Omit<QueueGoal, 'id' | 'queue_id'>>(getDefaultGoal());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const existingGoal = goals[queueId];
      if (existingGoal) {
        setFormData({
          max_waiting_contacts: existingGoal.max_waiting_contacts,
          max_avg_wait_minutes: existingGoal.max_avg_wait_minutes,
          min_assignment_rate: existingGoal.min_assignment_rate,
          max_messages_pending: existingGoal.max_messages_pending,
          alerts_enabled: existingGoal.alerts_enabled,
        });
      } else {
        setFormData(getDefaultGoal());
      }
    }
  }, [open, queueId, goals]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGoal(queueId, formData);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border/30">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Target className="w-5 h-5" style={{ color: queueColor }} />
            Metas e Alertas - {queueName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enable Alerts */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/20">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Alertas Ativados</p>
                <p className="text-sm text-muted-foreground">
                  Receber notificações quando metas forem ultrapassadas
                </p>
              </div>
            </div>
            <Switch
              checked={formData.alerts_enabled}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, alerts_enabled: checked }))
              }
            />
          </div>

          {/* Max Waiting Contacts */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <Label className="text-foreground">Máximo de Contatos Aguardando</Label>
            </div>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.max_waiting_contacts]}
                onValueChange={([value]) =>
                  setFormData((prev) => ({ ...prev, max_waiting_contacts: value }))
                }
                min={1}
                max={50}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={formData.max_waiting_contacts}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    max_waiting_contacts: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-20 bg-muted/20 border-border/30"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta quando mais de {formData.max_waiting_contacts} contatos estiverem aguardando
            </p>
          </div>

          {/* Max Wait Time */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Label className="text-foreground">Tempo Máximo de Espera (minutos)</Label>
            </div>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.max_avg_wait_minutes]}
                onValueChange={([value]) =>
                  setFormData((prev) => ({ ...prev, max_avg_wait_minutes: value }))
                }
                min={1}
                max={60}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={formData.max_avg_wait_minutes}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    max_avg_wait_minutes: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-20 bg-muted/20 border-border/30"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta quando tempo médio de espera ultrapassar {formData.max_avg_wait_minutes} minutos
            </p>
          </div>

          {/* Min Assignment Rate */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <Label className="text-foreground">Taxa Mínima de Atribuição (%)</Label>
            </div>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.min_assignment_rate]}
                onValueChange={([value]) =>
                  setFormData((prev) => ({ ...prev, min_assignment_rate: value }))
                }
                min={0}
                max={100}
                step={5}
                className="flex-1"
              />
              <Input
                type="number"
                value={formData.min_assignment_rate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    min_assignment_rate: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-20 bg-muted/20 border-border/30"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta quando taxa de atribuição cair abaixo de {formData.min_assignment_rate}%
            </p>
          </div>

          {/* Max Messages Pending */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <Label className="text-foreground">Máximo de Mensagens Pendentes</Label>
            </div>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.max_messages_pending]}
                onValueChange={([value]) =>
                  setFormData((prev) => ({ ...prev, max_messages_pending: value }))
                }
                min={10}
                max={200}
                step={10}
                className="flex-1"
              />
              <Input
                type="number"
                value={formData.max_messages_pending}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    max_messages_pending: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-20 bg-muted/20 border-border/30"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta quando mensagens pendentes ultrapassarem {formData.max_messages_pending}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Metas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
