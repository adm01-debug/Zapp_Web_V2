import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Clock } from 'lucide-react';
import { motion } from '@/components/ui/motion';

interface ScheduleSettingsProps {
  settings: {
    business_hours_enabled: boolean;
    business_hours_start: string;
    business_hours_end: string;
    work_days: number[];
  };
  updateSettings: (updates: Partial<ScheduleSettingsProps['settings']>) => void;
  toggleWorkDay: (dayId: number) => void;
}

const workDays = [
  { id: 0, label: 'Dom' },
  { id: 1, label: 'Seg' },
  { id: 2, label: 'Ter' },
  { id: 3, label: 'Qua' },
  { id: 4, label: 'Qui' },
  { id: 5, label: 'Sex' },
  { id: 6, label: 'Sáb' },
];

export function ScheduleSettings({ settings, updateSettings, toggleWorkDay }: ScheduleSettingsProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-whatsapp" />
            Horário de Atendimento
          </CardTitle>
          <CardDescription>Configure o horário de funcionamento do atendimento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Habilitar horário de atendimento</Label>
              <p className="text-sm text-muted-foreground">Fora do horário, uma mensagem de ausência será enviada</p>
            </div>
            <Switch
              checked={settings.business_hours_enabled}
              onCheckedChange={(checked) => updateSettings({ business_hours_enabled: checked })}
            />
          </div>

          {settings.business_hours_enabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Horário de início</Label>
                  <Input type="time" value={settings.business_hours_start} onChange={(e) => updateSettings({ business_hours_start: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Horário de término</Label>
                  <Input type="time" value={settings.business_hours_end} onChange={(e) => updateSettings({ business_hours_end: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dias de atendimento</Label>
                <div className="flex gap-2">
                  {workDays.map((day) => (
                    <motion.button
                      key={day.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleWorkDay(day.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        settings.work_days.includes(day.id)
                          ? 'bg-whatsapp text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {day.label}
                    </motion.button>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
