import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bell, BellOff, Plus, Trash2, Clock } from 'lucide-react';
import { formatDistanceToNow, addHours, addDays, startOfTomorrow, setHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import { useReminders } from '@/hooks/chat/useReminders';

interface RemindersPanelProps {
  contactId: string;
  profileId?: string | null;
}

export function RemindersPanel({ contactId, profileId }: RemindersPanelProps) {
  const { reminders, isLoading, createReminder, dismissReminder, deleteReminder } = useReminders(contactId, profileId);
  const [newTitle, setNewTitle] = useState('');
  const [when, setWhen] = useState('1h');

  const addReminder = () => {
    if (!newTitle.trim() || !profileId) return;
    const now = new Date();
    let remindAt: Date;
    switch (when) {
      case '30m': remindAt = new Date(now.getTime() + 30 * 60 * 1000); break;
      case '1h': remindAt = addHours(now, 1); break;
      case '3h': remindAt = addHours(now, 3); break;
      case 'tomorrow': remindAt = setHours(startOfTomorrow(), 9); break;
      case 'nextweek': remindAt = setHours(addDays(now, 7 - now.getDay() + 1), 9); break;
      default: remindAt = addHours(now, 1);
    }
    createReminder({ title: newTitle.trim(), remindAt }).then(() => setNewTitle(''));
  };

  const isPast = (dateStr: string) => new Date(dateStr) <= new Date();

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Lembrete..."
          className="h-8 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && addReminder()}
        />
        <Select value={when} onValueChange={setWhen}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30m">30 min</SelectItem>
            <SelectItem value="1h">1 hora</SelectItem>
            <SelectItem value="3h">3 horas</SelectItem>
            <SelectItem value="tomorrow">Amanhã</SelectItem>
            <SelectItem value="nextweek">Próx. semana</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 px-2" onClick={addReminder} disabled={!newTitle.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />)}
        </div>
      ) : reminders.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum lembrete ativo</p>
      ) : (
        <AnimatePresence mode="popLayout">
          {reminders.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={`flex items-center gap-2 p-2 rounded-lg transition-colors group ${
                isPast(r.remind_at) ? 'bg-warning/10 border border-warning/30' : 'bg-muted/20'
              }`}
            >
              <Bell className={`w-4 h-4 shrink-0 ${isPast(r.remind_at) ? 'text-warning animate-pulse' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{r.title}</p>
                <p className="text-3xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {isPast(r.remind_at) ? 'Vencido' : formatDistanceToNow(new Date(r.remind_at), { locale: ptBR, addSuffix: true })}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => dismissReminder(r.id)}>
                <BellOff className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="w-6 h-6 opacity-0 group-hover:opacity-100" onClick={() => deleteReminder(r.id)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
