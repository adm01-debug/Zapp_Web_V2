import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Clock, MessageSquare, Save, Copy } from 'lucide-react';
import { toast } from '@/hooks/ui/use-toast';
import { cn } from '@/lib/utils';
import { useBusinessHours, BusinessHour, AwayMessage } from '@/hooks/business/useBusinessHours';

interface BusinessHoursDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  connectionName: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
];

export function BusinessHoursDialog({
  open,
  onOpenChange,
  connectionId,
  connectionName,
}: BusinessHoursDialogProps) {
  const { 
    businessHours: fetchedHours, 
    awayMessage: fetchedAway, 
    isLoading, 
    isSaving, 
    saveSettings 
  } = useBusinessHours(connectionId);

  const [localHours, setLocalHours] = useState<BusinessHour[]>([]);
  const [localAway, setLocalAway] = useState<AwayMessage>({ 
    whatsapp_connection_id: connectionId, 
    content: '', 
    is_enabled: true 
  });

  // Sync local state when data is fetched
  useEffect(() => {
    if (fetchedHours.length > 0) {
      setLocalHours(fetchedHours);
    }
  }, [fetchedHours]);

  useEffect(() => {
    if (fetchedAway) {
      setLocalAway(fetchedAway);
    }
  }, [fetchedAway]);

  const handleSave = async () => {
    await saveSettings(localHours, localAway);
    onOpenChange(false);
  };

  const updateHour = (dayOfWeek: number, field: keyof BusinessHour, value: string | boolean) => {
    setLocalHours((prev) =>
      prev.map((h) => (h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h))
    );
  };

  const copyToAllDays = (sourceDayOfWeek: number) => {
    const source = localHours.find((h) => h.day_of_week === sourceDayOfWeek);
    if (!source) return;

    setLocalHours((prev) =>
      prev.map((h) => ({
        ...h,
        is_open: source.is_open,
        open_time: source.open_time,
        close_time: source.close_time,
      }))
    );
    toast({ title: 'Horário copiado para todos os dias' });
  };

  const applyWeekdayTemplate = () => {
    setLocalHours((prev) =>
      prev.map((h) => ({
        ...h,
        is_open: h.day_of_week >= 1 && h.day_of_week <= 5,
        open_time: '08:00',
        close_time: '18:00',
      }))
    );
    toast({ title: 'Template de dias úteis aplicado' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Horário de Atendimento - {connectionName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="hours" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="hours" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Horários
              </TabsTrigger>
              <TabsTrigger value="message" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Mensagem Ausente
              </TabsTrigger>
            </TabsList>

            <TabsContent value="hours" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Configure o horário de funcionamento para cada dia da semana.
                </p>
                <Button variant="outline" size="sm" onClick={applyWeekdayTemplate}>
                  Dias úteis (8h-18h)
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {localHours.map((hour) => {
                    const day = DAYS_OF_WEEK.find((d) => d.value === hour.day_of_week);
                    return (
                      <motion.div
                        key={hour.day_of_week}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: hour.day_of_week * 0.05 }}
                        className={cn(
                          'flex items-center gap-4 p-3 rounded-lg border transition-colors',
                          hour.is_open
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-border bg-muted/30'
                        )}
                      >
                        <div className="w-32">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={hour.is_open}
                              onCheckedChange={(checked) =>
                                updateHour(hour.day_of_week, 'is_open', checked)
                              }
                            />
                            <span className={cn('font-medium', !hour.is_open && 'text-muted-foreground')}>
                              {day?.label}
                            </span>
                          </div>
                        </div>

                        {hour.is_open ? (
                          <>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">De</Label>
                              <Input
                                type="time"
                                value={hour.open_time}
                                onChange={(e) => updateHour(hour.day_of_week, 'open_time', e.target.value)}
                                className="w-28"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Até</Label>
                              <Input
                                type="time"
                                value={hour.close_time}
                                onChange={(e) => updateHour(hour.day_of_week, 'close_time', e.target.value)}
                                className="w-28"
                              />
                            </div>
                            <Button variant="ghost" size="icon" className="ml-auto" onClick={() => copyToAllDays(hour.day_of_week)} title="Copiar para todos os dias">
                              <Copy className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Fechado</span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="message" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Mensagem automática fora do horário</Label>
                  <p className="text-xs text-muted-foreground">
                    Esta mensagem será enviada automaticamente quando clientes entrarem em contato fora do expediente.
                  </p>
                </div>
                <Switch
                  checked={localAway.is_enabled}
                  onCheckedChange={(checked) => setLocalAway((prev) => ({ ...prev, is_enabled: checked }))}
                />
              </div>

              <Textarea
                placeholder="Digite a mensagem de ausência..."
                value={localAway.content}
                onChange={(e) => setLocalAway((prev) => ({ ...prev, content: e.target.value }))}
                disabled={!localAway.is_enabled}
                className="min-h-[150px]"
              />

              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground mb-2">Variáveis disponíveis:</p>
                <div className="flex flex-wrap gap-2">
                  {['{nome}', '{horario_abertura}', '{horario_fechamento}'].map((v) => (
                    <Button key={v} variant="outline" size="sm" className="text-xs h-7" onClick={() => setLocalAway((prev) => ({ ...prev, content: prev.content + ' ' + v }))}>
                      {v}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Salvar Configurações</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
