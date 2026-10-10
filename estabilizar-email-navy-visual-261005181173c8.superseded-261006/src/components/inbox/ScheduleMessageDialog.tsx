import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, Loader2, Paperclip } from 'lucide-react';
import { format, addDays, addHours, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { localInstantFromDayAndTime } from '@/lib/localDay';
import { toast } from '@/hooks/ui/use-toast';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // R2-INB-010: o agendamento é assíncrono. O diálogo só pode fechar e limpar o
  // rascunho DEPOIS que a persistência confirmar; por isso o retorno é aguardável.
  onSchedule: (message: string, scheduledAt: Date, attachment?: File) => Promise<void> | void;
}

export function ScheduleMessageDialog({ open, onOpenChange, onSchedule }: ScheduleMessageDialogProps) {
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [time, setTime] = useState('09:00');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quickSchedules = [
    { label: 'Amanhã 9h', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
    { label: 'Amanhã 14h', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 14), 0) },
    { label: 'Em 2 dias', getDate: () => setMinutes(setHours(addDays(new Date(), 2), 9), 0) },
    { label: 'Em 1 semana', getDate: () => setMinutes(setHours(addDays(new Date(), 7), 9), 0) },
  ];

  const handleSchedule = async () => {
    if (!message.trim()) {
      toast({ title: 'Mensagem vazia', description: 'Digite uma mensagem para agendar', variant: 'destructive' });
      return;
    }
    const scheduledDate = localInstantFromDayAndTime(date, time);

    if (!scheduledDate || scheduledDate <= new Date()) {
      toast({ title: 'Data inválida', description: 'A data de agendamento deve ser no futuro', variant: 'destructive' });
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Só anuncia sucesso, fecha e apaga o rascunho depois que a persistência confirmar.
      await onSchedule(message, scheduledDate, attachment || undefined);
      toast({
        title: 'Mensagem agendada!',
        description: `Será enviada em ${format(scheduledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      });

      onOpenChange(false);
      setMessage('');
      setAttachment(null);
    } catch (err) {
      // Falha ao persistir: mantém o diálogo aberto e o rascunho intacto para nova
      // tentativa (o produtor já reporta a causa; aqui garantimos que nada é apagado).
      toast({
        title: 'Não foi possível agendar',
        description: 'A mensagem não foi salva. Revise os dados e tente novamente.',
        variant: 'destructive',
      });
      void err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickSchedule = (getDate: () => Date) => {
    const scheduledDate = getDate();
    setDate(format(scheduledDate, 'yyyy-MM-dd'));
    setTime(format(scheduledDate, 'HH:mm'));
  };

  const previewDate = localInstantFromDayAndTime(date, time);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-whatsapp" />
            Agendar Mensagem
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Quick Schedule Buttons */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Atalhos rápidos</Label>
            <div className="flex flex-wrap gap-2">
              {quickSchedules.map((schedule) => (
                <motion.button
                  key={schedule.label}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleQuickSchedule(schedule.getDate)}
                  className="px-3 py-1.5 text-xs font-medium rounded-full bg-muted hover:bg-muted/80 transition-colors"
                >
                  {schedule.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Data
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time" className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Hora
              </Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Digite a mensagem que será enviada..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          {/* Attachment */}
          <div className="space-y-2">
            <Label>Anexo (opcional)</Label>
            {attachment ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm truncate max-w-[200px]">{attachment.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAttachment(null)}
                >
                  Remover
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <Paperclip className="w-4 h-4 mr-2" />
                Anexar arquivo
              </Button>
            )}
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
          </div>

          {/* Preview */}
          {previewDate && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                A mensagem será enviada em{' '}
                <span className="font-medium text-foreground">
                  {format(previewDate, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </span>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSchedule}
                disabled={!message.trim() || isSubmitting}
                className="bg-whatsapp hover:bg-whatsapp-dark"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Clock className="w-4 h-4 mr-2" />
                )}
                Agendar
              </Button>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
